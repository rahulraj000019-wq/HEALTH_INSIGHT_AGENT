import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Gemini on the server where API key is accessible
let aiInstance: GoogleGenAI | null = null;
function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      console.error('GEMINI_API_KEY is missing from environment variables');
      throw new Error("GEMINI_API_KEY is not defined");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log('Starting Health Insights Agent server...');
  
  // Request logger
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Gemini Analysis Endpoint
  app.post('/api/analyze', async (req: any, res: any) => {
    try {
      const { data, mimeType } = req.body;
      if (!data) return res.status(400).json({ error: 'No data provided' });

      console.log('Analyzing report with Gemini 1.5 Flash...');
      const ai = getAI();
      const prompt = `Analyze the following blood test report and provide a simplified explanation for a non-medical user.
      Extract the key parameters, their values, units, reference ranges, and determine if they are normal, abnormal, or concerning.
      Provide a brief, simple explanation for each parameter.
      Finally, provide a summary and general lifestyle recommendations (with a strong disclaimer that this is NOT a medical diagnosis and the user MUST consult a doctor).`;

      const contents = {
        parts: [
          { text: prompt },
          { inlineData: { data, mimeType: mimeType || 'application/pdf' } }
        ]
      };

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            required: ["summary", "parameters", "recommendations", "disclaimer"],
            properties: {
              summary: { type: Type.STRING },
              parameters: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  required: ["name", "value", "unit", "range", "status", "explanation"],
                  properties: {
                    name: { type: Type.STRING },
                    value: { type: Type.STRING },
                    unit: { type: Type.STRING },
                    range: { type: Type.STRING },
                    status: { 
                      type: Type.STRING, 
                      enum: ["normal", "abnormal", "concerning", "unknown"] 
                    },
                    explanation: { type: Type.STRING }
                  }
                }
              },
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              disclaimer: { type: Type.STRING }
            }
          }
        }
      });

      const resultText = response.text || "";
      const cleanedText = resultText.replace(/^```json/, '').replace(/```$/, '').trim();
      
      try {
        const result = JSON.parse(cleanedText);
        res.json(result);
      } catch (parseErr) {
        console.error('Failed to parse Gemini JSON:', cleanedText);
        res.status(500).json({ error: 'AI response was not in valid JSON format' });
      }
    } catch (error: any) {
      console.error('Analysis error:', error);
      res.status(500).json({ error: error.message || 'Error during analysis' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    console.log('Environment: Development. Mounting Vite middleware.');
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('Vite middleware mounted successfully.');
    } catch (vError) {
      console.error('Failed to create Vite server:', vError);
    }
  } else {
    console.log('Environment: Production. Serving static files.');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
