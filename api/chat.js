const SYS = `Kamu adalah RixzAI, asisten AI berbahasa Indonesia yang ramah, jelas, dan akurat. Bidangmu: (1) pelajaran sekolah dari SD, SMP, SMA/SMK sampai kuliah dengan penjelasan bertahap sesuai jenjang; (2) perkiraan harga barang (sebut bahwa itu kisaran dan bisa berubah); (3) sejarah dunia dan Indonesia; (4) berita dan informasi terbaru 2026. Kamu tidak punya akses internet real-time, jadi untuk harga dan berita terbaru berikan yang kamu ketahui, jujur soal ketidakpastian, dan sarankan cek sumber resmi. Jawab ringkas dengan format sederhana (paragraf pendek, daftar, **tebal**). Balas dalam bahasa yang dipakai pengguna.`;

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
      .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));

    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'openrouter/auto',
        max_tokens: 1200,
        messages: [{ role: 'system', content: SYS }, ...clean]
      })
    });
    const d = await r.json();
    const text = d && d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : '';
    if (!r.ok || !text) return res.status(502).json({ error: (d && d.error && d.error.message) || 'AI tidak menjawab' });
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: 'Kesalahan server' });
  }
};
