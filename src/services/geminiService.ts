import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined. Please set it in your environment variables.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export async function analyzeBloodReport(fileData: { data: string, mimeType: string }): Promise<AnalysisResult> {
  const ai = getAI();
  
  const prompt = `Analyze the following blood test report and provide a simplified explanation for a non-medical user.
  Extract the key parameters, their values, units, reference ranges, and determine if they are normal, abnormal, or concerning.
  Provide a brief, simple explanation for each parameter.
  Finally, provide a summary and general lifestyle recommendations (with a strong disclaimer that this is NOT a medical diagnosis and the user MUST consult a doctor).`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { text: prompt },
          { 
            inlineData: { 
              data: fileData.data, 
              mimeType: fileData.mimeType 
            } 
          }
        ]
      },
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

    const resultText = response.text;
    if (!resultText) {
      throw new Error("AI failed to generate a response.");
    }

    return JSON.parse(resultText) as AnalysisResult;
  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
}
