import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

let aiClient = null;
function getGeminiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

app.post("/api/gemini/research", async (req, res) => {
  try {
    const { prompt, category, currentBooks, actionType } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Sila berikan pertanyaan atau kata kunci riset." });
    }

    const ai = getGeminiClient();
    let systemInstruction = `Anda adalah "AI Asisten Ahli Peneliti Kitab Klasik Islam (Kitab Kuning)", asisten ahli studi Islam (Fathul Kutub) yang terintegrasi secara cerdas dengan database Al-Maktabah Al-Syamila (Maktabah Syamilah 4) serta Darul Hikmah Library.`;

    let response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      },
    });

    return res.json({ success: true, result: response.text });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  app.listen(PORT, "0.0.0.0");
}

startServer();
