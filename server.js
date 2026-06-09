import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware to parse JSON payloads
app.use(express.json());

// Lazy-initialize Gemini AI Client to avoid crash if API Key is missing on boot
let aiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined. Please add it in Settings > Secrets or .env file.");
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

// AI Research & Shamela.ws Assistant Endpoint
app.post("/api/gemini/research", async (req, res) => {
  try {
    const { prompt, category, currentBooks, actionType } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Sila berikan pertanyaan atau kata kunci riset." });
    }

    const ai = getGeminiClient();
    
    // System instruction to guide the AI to behave like an interactive Islamic digital library expert (Al-Maktabah Al-Syamila)
    let systemInstruction = `Anda adalah "AI Asisten Ahli Peneliti Kitab Klasik Islam (Kitab Kuning)", asisten ahli studi Islam (Fathul Kutub) yang terintegrasi secara cerdas dengan database Al-Maktabah Al-Syamila (Maktabah Syamilah 4) serta Darul Hikmah Library. Tugas utama Anda adalah membantu pengguna mencari, mengkaji, dan memahami teks hadits, fikih, dan tafsir secara amanah ilmiah.

ATURAN UTAMA MENJAWAB:
1. POHON UTAMA IDENTITAS: Ketika pengguna meminta dicarikan suatu pembahasan, posisikan diri Anda siap membantu mencari ke dalam database Maktabah Syamilah 4 secara komprehensif.
2. PRIORITAS TEKS ARAB & MARAJI': Selalu prioritaskan menyajikan teks asli berbahasa Arab (lengkap dengan harakat secara presisi/akurat jika ada hadits atau matan penting). Sebutkan nama kitabnya (Kitab Kuning), nama bab, dan nomor jilid serta halaman secara eksplisit jika memungkinkan.
3. TERJEMAHAN & SYARAH ULAMA: Berikan terjemahan bahasa Indonesia yang akurat di bawah kutipan teks Arab, disertai penjelasan/syarah ringkas namun padat dari ulama klasik ternama (seperti Syarah Shahih Muslim oleh Imam al-Nawawi, Fathul Bari oleh Ibnu Hajar, dll.).
4. NADA BICARA & INTEGRITAS: Jawab dengan nada bicara yang sangat sopan, kharismatik, ilmiah, santun, obyektif, akademis, dan menjunjung tinggi amanah ilmiah.

ATURAN STRUKTUR JAWABAN:
Sajikan jawaban Anda secara terstruktur menggunakan format markdown indah yang rapi. Apabila menjawab masalah hukum, hadits, atau tafsir, Anda WAJIB memadukan penjelasan dengan tabel atau format kutipan (blockquote) yang elegan:

TABEL 1: PENJELASAN HUKUM FIQHIYYAH / HASIL PENGKAJIAN
- Kolom 1: Aspek / Masalah (Aspek / Masalah yang ditanyakan)
- Kolom 2: Penjelasan Hukum & Kaidah Islam (Ketetapan hukum & syarah ringkas)

TABEL 2: MARAJI' & VERIFIKASI (MAKTABAH SYAMILAH 4)
- Kolom 1: Nama Kitab Turats & Pengarang
- Kolom 2: Jilid, Bab, dan Halaman (Referensi Maktabah Syamilah)
- Kolom 3: Bunyi Teks Arab (Selalu usahakan berharakat lengkap untuk teks utama)
- Kolom 4: Terjemahan Indonesia & Syarah Padat

ATURAN KETAT (ANTI-HALUSINASI):
1. Jika Anda TIDAK TAHU atau TIDAK MENEMUKAN jilid/halaman kitab secara pasti dalam koleksi Turats Al-Syamila Anda, katakan secara jujur: "Saya tidak menemukan halaman pastinya di database kami, silakan merujuk ke kitab [Nama Kitab]". JANGAN PERNAH MENGARANG referensi palsu demi keamanan dan amanah ilmiah.
2. Selalu ingatkan pengguna di akhir jawaban untuk melakukan 'Tashih' (konfirmasi) secara santun kepada para asatidzah, ulama, atau guru yang ahli di bidang tersebut.`;

    if (actionType === "suggestTopic") {
      systemInstruction += "\nFokus utama Anda saat ini adalah merekomendasikan topik, judul, dan metodologi riset ilmiah terbaru berdasarkan bidang atau disiplin ilmu yang dipilih santri.";
    } else if (actionType === "summarizeBook") {
      systemInstruction += "\nFokus utama Anda saat ini adalah memberikan ringkasan (abstract), metodologi pokok, kontribusi keilmuan, dan analisis terstruktur dari karya tulis ilmiah/buku/jurnal yang sedang dibahas.";
    }

    let searchScopePrompt = prompt;
    if (category && category !== "Semua") {
      searchScopePrompt = `[Fokus Disiplin Ilmu: ${category}] \nPertanyaan: ${prompt}`;
    }

    if (currentBooks && currentBooks.length > 0) {
      const bookListStr = currentBooks.map((b: any) => `- "${b.title}" oleh ${b.author} (${b.category})`).join("\n");
      searchScopePrompt += `\n\nSebagai konteks tambahan, perpustakaan kita saat ini mengoleksi beberapa publikasi riset baru berikut:\n${bookListStr}`;
    }

    // Robust request wrapper with model fallback and retries to handle 503/high-demand issues
    let response: any = null;
    const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      let attempts = 0;
      const maxAttempts = 2;
      while (attempts < maxAttempts) {
        try {
          console.log(`Mengirim kueri riset ke model ${modelName} (Percobaan ${attempts + 1})...`);
          response = await ai.models.generateContent({
            model: modelName,
            contents: searchScopePrompt,
            config: {
              systemInstruction: systemInstruction,
              temperature: 0.7,
            },
          });
          if (response && response.text) {
            console.log(`Berhasil mendapatkan respons dari model ${modelName}!`);
            break; // Success!
          }
        } catch (err: any) {
          lastError = err;
          attempts++;
          console.warn(`Percobaan ${attempts} untuk model ${modelName} gagal. Error:`, err.message || err);
          // Wait briefly before retrying
          await new Promise((resolve) => setTimeout(resolve, 800 * attempts));
        }
      }
      if (response && response.text) {
        break; // Stop trying subsequent models if we successfully got a response
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error("Semua model Al-Misbah AI sedang mengalami beban tinggi. Mohon coba sesaat lagi.");
    }

    const reply = response.text || "Mohon maaf, Al-Misbah AI sedang memformulasikan tanggapan. Silakan coba sesaat lagi.";

    return res.json({
      success: true,
      result: reply,
      timestamp: Date.now(),
    });

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Terjadi kesalahan internal pada Al-Misbah AI server." 
    });
  }
});

// Configure Vite middleware asynchronously to avoid CJS compilation issues with top-level await
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Static paths for production build
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start Server on Port 3000
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[AL-MISBAH FULLSTACK SERVER] Berjalan di port ${PORT}`);
  });
}

startServer();
