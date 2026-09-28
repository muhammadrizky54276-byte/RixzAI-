const SEARCH = process.env.ENABLE_SEARCH === '1';

const SYS = [
  'Kamu adalah RixzAI, asisten AI berbahasa Indonesia yang ramah, teliti, dan akurat. Bidangmu: (1) pelajaran sekolah dari SD, SMP, SMA/SMK sampai kuliah; (2) perkiraan harga barang; (3) sejarah dunia dan Indonesia; (4) berita dan informasi terbaru 2026.',
  '',
  'Cara menjawab:',
  '- Beri jawaban yang lengkap dan mendalam, biasanya 4 sampai 8 paragraf atau bagian, bukan jawaban singkat. Mulai dengan inti jawaban, lalu jelaskan detailnya, sertakan contoh atau langkah-langkah, dan tutup dengan ringkasan singkat.',
  '- Untuk pelajaran: jelaskan bertahap sesuai jenjang yang disebut pengguna (SD, SMP, SMA, atau kuliah), beri contoh soal dan pembahasannya bila relevan.',
  '- Untuk sejarah: sebutkan tokoh, tahun, penyebab, jalannya peristiwa, dan dampaknya.',
  '- Untuk harga: beri kisaran dalam rupiah, sebutkan faktor yang memengaruhi harga, dan jelaskan bahwa harga bisa berubah.',
  '- Akurasi lebih penting daripada terdengar yakin. Jangan mengarang fakta, angka, tahun, atau nama. Kalau tidak yakin, katakan terus terang bagian mana yang belum pasti.',
  '- Gunakan format sederhana: paragraf pendek, daftar, dan **tebal** untuk istilah penting.',
  '- Balas dalam bahasa yang dipakai pengguna.',
  SEARCH
    ? '- Kamu bisa mencari di internet. Untuk harga, berita, dan hal yang bisa berubah, gunakan pencarian dan sebutkan sumbernya.'
    : '- Kamu tidak punya akses internet real-time, jadi untuk harga dan berita terbaru berikan yang kamu ketahui, jujur soal ketidakpastian, dan sarankan cek sumber resmi.'
].join('\n');

// Pembatas sederhana: maksimal 20 pertanyaan per 10 menit untuk tiap pengguna
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 600000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 20;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan' });
  try {
    const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0] || 'x').trim();
    if (limited(ip)) return res.status(429).json({ error: 'Terlalu banyak permintaan' });

    const { messages } = req.body || {};
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'Permintaan tidak valid' });

    const clean = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content.slice(0, 6000) }));

    const body = {
      model: process.env.OPENROUTER_MODEL || 'openrouter/auto',
      max_tokens: Number(process.env.MAX_TOKENS) || 2500,
      temperature: 0.4,
      messages: [{ role: 'system', content: SYS }, ...clean]
    };
    if (SEARCH) body.tools = [{ type: 'openrouter:web_search' }];

    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const d = await r.json();
    const text = d && d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : '';
    if (!r.ok || !text) return res.status(502).json({ error: (d && d.error && d.error.message) || 'AI tidak menjawab' });
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: 'Kesalahan server' });
  }
};

module.exports.config = { maxDuration: 60 };
