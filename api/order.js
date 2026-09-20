// api/order.js
// Dipanggil index.html saat pembeli submit form. Membuat key berstatus 'waiting_approval',
// menyimpan bukti transfer ke Supabase Storage, lalu mengirim embed + tombol ke Discord.
const crypto = require('crypto');
const { db } = require('../lib/supabase');
const { sendOrderMessage } = require('../lib/discord');

const MAX_PROOF_BYTES = 3 * 1024 * 1024; // 3 MB setelah decode (frontend sudah mengompres)
const MAX_PENDING_PER_DISCORD = 3;

function genKey() {
  const part = () => crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 hex
  return `4MK-${part()}-${part()}-${part()}`;
}

// Cek magic bytes supaya file benar-benar gambar (bukan sekadar label mime)
function detectImage(buf) {
  if (buf.length > 12 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, discordId, proof } = req.body || {};

    // ---- Validasi input ----
    const cleanName = String(name || '').trim();
    const cleanDiscord = String(discordId || '').trim();
    if (cleanName.length < 2 || cleanName.length > 60) return res.status(400).json({ error: 'Nama harus 2-60 karakter.' });
    if (!/^\d{17,20}$/.test(cleanDiscord)) return res.status(400).json({ error: 'Discord ID harus berupa angka 17-20 digit.' });
    if (typeof proof !== 'string' || !proof.startsWith('data:image/')) return res.status(400).json({ error: 'Bukti transfer wajib berupa gambar.' });

    const comma = proof.indexOf(',');
    if (comma < 0) return res.status(400).json({ error: 'Format bukti transfer tidak valid.' });
    const buf = Buffer.from(proof.slice(comma + 1), 'base64');
    if (buf.length === 0 || buf.length > MAX_PROOF_BYTES) return res.status(400).json({ error: 'Ukuran bukti transfer maksimal 3 MB.' });
    const img = detectImage(buf);
    if (!img) return res.status(400).json({ error: 'File harus PNG, JPG, atau WEBP.' });

    const supabase = db();

    // ---- Batasi spam: maksimal 3 order menunggu per Discord ID ----
    const { count } = await supabase
      .from('licenses')
      .select('id', { count: 'exact', head: true })
      .eq('discord_id', cleanDiscord)
      .eq('status', 'waiting_approval');
    if ((count || 0) >= MAX_PENDING_PER_DISCORD) {
      return res.status(429).json({ error: 'Kamu masih punya order yang menunggu approval. Mohon tunggu admin.' });
    }

    // ---- Upload bukti ke Storage (bucket "proofs", nama file acak) ----
    const path = `${crypto.randomUUID()}.${img.ext}`;
    const up = await supabase.storage.from('proofs').upload(path, buf, { contentType: img.mime, upsert: false });
    if (up.error) throw new Error('Upload bukti gagal: ' + up.error.message);
    const proofUrl = supabase.storage.from('proofs').getPublicUrl(path).data.publicUrl;

    // ---- Simpan lisensi (status awal: waiting_approval) ----
    const { data: license, error } = await supabase
      .from('licenses')
      .insert({
        license_key: genKey(),
        buyer_name: cleanName,
        discord_id: cleanDiscord,
        proof_path: path,
        proof_url: proofUrl,
        status: 'waiting_approval',
      })
      .select()
      .single();
    if (error) throw new Error('Gagal menyimpan lisensi: ' + error.message);

    // ---- Kirim notifikasi ke Discord (kalau gagal, order tetap tersimpan) ----
    let notified = true;
    try {
      const messageId = await sendOrderMessage(license);
      await supabase.from('licenses').update({ discord_message_id: messageId }).eq('id', license.id);
    } catch (e) {
      notified = false;
      console.error('Discord notify error:', e.message);
    }

    return res.status(200).json({
      ok: true,
      key: license.license_key,
      status: license.status,
      notified,
      message: 'Order diterima. Simpan key kamu, lisensi aktif setelah bukti transfer di-ACC admin.',
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Terjadi kesalahan server. Coba lagi nanti.' });
  }
};
