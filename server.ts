import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfreaderModule = require('pdfreader');

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log('Starting Health Insights Agent server...');
  
  const upload = multer({ storage: multer.memoryStorage() });

  // Request logger
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  app.use(express.json());

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Helper function for pdfreader with coordinate-based sorting
  async function extractTextWithPdfReader(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const rows: Record<number, any[]> = {};
      new pdfreaderModule.PdfReader().parseBuffer(buffer, (err: any, item: any) => {
        if (err) {
          reject(err);
        } else if (!item) {
          // End of file: sort rows by Y then items by X
          const sortedY = Object.keys(rows).map(Number).sort((a, b) => a - b);
          let fullText = '';
          for (const y of sortedY) {
            const rowItems = rows[y].sort((a, b) => a.x - b.x);
            fullText += rowItems.map(i => i.text).join(' ') + '\n';
          }
          resolve(fullText);
        } else if (item.text) {
          const y = Math.round(item.y * 100) / 100; // Snap to 0.01 for better grouping
          if (!rows[y]) rows[y] = [];
          rows[y].push(item);
        }
      });
    });
  }

// @ts-ignore
  app.post('/api/extract-pdf', upload.single('report'), async (req: any, res: any) => {
    try {
      console.log('Received PDF upload request');
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log('Extracting text from PDF using pdfreader, size:', req.file.size);
      
      try {
        const text = await extractTextWithPdfReader(req.file.buffer);
        console.log('Extraction successful, text length:', text.length);
        
        if (!text || text.trim().length === 0) {
          return res.status(422).json({ error: 'The PDF appears to be empty or contains no readable text.' });
        }
        
        res.json({ text });
      } catch (parseError: any) {
        console.error('Internal PDF extraction error (pdfreader):', parseError);
        res.status(422).json({ 
          error: `Could not read this PDF: ${parseError.message || 'Unknown error'}.`,
          details: parseError.message
        });
      }
    } catch (error) {
      console.error('General PDF extraction route error:', error);
      res.status(500).json({ error: 'Server error during PDF processing. Ensure your file is a valid PDF.' });
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
