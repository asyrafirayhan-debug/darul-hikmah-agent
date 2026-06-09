const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// MASUKKAN API KEY ASLI ANDA DI DALAM TANDA KUTIP:
const GEMINI_API_KEY = "const GEMINI_API_KEY = process.env.GEMINI_API_KEY;";

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/cari', async (req, res) => {
    try {
        const kataKunci = req.body.pesan;
        console.log("--------------------------------------------------");
        console.log("Memulai pencarian untuk:", kataKunci);

        const promptText = `Anda adalah pakar hadits dan pustakawan Maktabah Syamilah. Cari, analisis, dan jelaskan teks atau hadits berikut: "${kataKunci}". Berikan informasi nama kitab, jilid, halaman, matan asli bahasa Arab, serta penjelasan singkat dalam bahasa Indonesia yang mudah dipahami.`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }]
            })
        });

        const data = await response.json();
        
        // JIKA EROR, BONGKAR DI TERMINAL:
        if (data.error) {
            console.log("❌ EROR RESMI DARI GOOGLE:");
            console.log("Pesan Eror:", data.error.message);
            console.log("Status Eror:", data.error.status);
            console.log("--------------------------------------------------");
            return res.status(400).json({ hasil: `Google Menolak: ${data.error.message}` });
        }

        if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
            console.log("✅ BERHASIL! Mendapatkan respons dari Gemini.");
            console.log("--------------------------------------------------");
            return res.json({ hasil: data.candidates[0].content.parts[0].text });
        } 
        
        res.status(500).json({ hasil: "Google memberikan respons kosong." });

    } catch (err) {
        console.error("❌ EROR SISTEM LAPTOP:", err.message);
        res.status(500).json({ hasil: "Terjadi kesalahan koneksi pada server local." });
    }
});

const PORT = process.env.PORT || 3000; app.listen(PORT, '0.0.0.0', () => console.log(`Server aktif pada port ${PORT}`));