// api/admin-control.js
// Endpoint khusus dashboard admin. Password dicek DI SERVER (ADMIN_PASSWORD di Environment Variables),
// bukan di kode frontend, sehingga tidak bisa dibaca lewat "View Source".
const crypto = require('crypto');
const { db } = require('../lib/supabase');
const { editOrderMessage } = require('../lib/discord');

const ALLOWED_STATUS = ['approved', 'suspended', 'rejected', 'waiting_approval'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pembatas brute-force sederhana (best-effort; instance serverless bisa reset)
const fails = new Map();
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: 'ADMIN_PASSWORD belum di-set di server.' });

  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const record = fails.get(ip);
  if (record && record.count >= MAX_FAILS && Date.now() < record.until) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' });
  }

  const password = req.headers['x-admin-password'] || '';
  if (!safeEqual(password, process.env.ADMIN_PASSWORD)) {
    const count = (record && Date.now() < record.until ? record.count : 0) + 1;
    fails.set(ip, { count, until: Date.now() + LOCK_MS });
    await new Promise((r) => setTimeout(r, 600)); // perlambat tebakan
    return res.status(401).json({ error: 'Password salah.' });
  }
  fails.delete(ip);

  const { action, id, status } = req.body || {};
  const supabase = db();

  try {
    if (action === 'login') return res.status(200).json({ ok: true });

    if (action === 'list') {
      const { data, error } = await supabase
        .from('licenses')
        .select('id, license_key, buyer_name, discord_id, status, proof_url, bound_user_id, created_at, last_verified_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return res.status(200).json({ ok: true, licenses: data });
    }

    if (!UUID_REGEX.test(String(id || ''))) return res.status(400).json({ error: 'ID lisensi tidak valid.' });

    if (action === 'set_status') {
      if (!ALLOWED_STATUS.includes(status)) return res.status(400).json({ error: 'Status tidak valid.' });
      const { data, error } = await supabase
        .from('licenses')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      // Sinkronkan pesan Discord (best-effort)
      try {
        await editOrderMessage(data);
      } catch (e) {
        console.error('Discord edit error:', e.message);
      }
      return res.status(200).json({ ok: true, license: data });
    }

    if (action === 'reset_bind') {
      const { error } = await supabase.from('licenses').update({ bound_user_id: null }).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Aksi tidak dikenali.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
};
