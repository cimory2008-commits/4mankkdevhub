// api/verify.js
// Dipanggil plugin Roblox (dan form "Cek Status" di website).
// Respons untuk plugin DITANDATANGANI (sig) memakai PLUGIN_SIGN_SECRET + nonce dari plugin,
// sehingga respons palsu (fake server / edit HTTP) mudah terdeteksi oleh plugin.
const crypto = require('crypto');
const { db } = require('../lib/supabase');

const KEY_REGEX = /^4MK-[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$/;

const MESSAGES = {
  approved: 'Lisensi aktif.',
  waiting_approval: 'Lisensi sedang dalam antrean pengecekan bukti transfer oleh Admin',
  rejected: 'Lisensi ditolak. Bukti transfer tidak valid, hubungi admin.',
  suspended: 'Lisensi dinonaktifkan oleh admin.',
  invalid: 'Key lisensi tidak ditemukan.',
  bound_other: 'Lisensi ini sudah terikat ke akun Roblox lain. Hubungi admin untuk reset.',
  invalid_user: 'Login ke akun Roblox di Studio terlebih dahulu.',
};

function sign(nonce, status, userId, valid) {
  return crypto
    .createHash('sha256')
    .update(`${process.env.PLUGIN_SIGN_SECRET}|${nonce}|${status}|${userId}|${valid ? 1 : 0}`)
    .digest('hex');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const key = String(body.key || '').trim().toUpperCase();
  const nonce = String(body.nonce || '').slice(0, 64);
  const userId = String(Number(body.userId) || 0);
  const statusOnly = body.mode === 'status';

  const reply = (status, valid) => {
    const payload = { valid, status, message: MESSAGES[status] || status };
    if (!statusOnly) {
      payload.nonce = nonce;
      payload.sig = sign(nonce, status, userId, valid);
    }
    return res.status(200).json(payload);
  };

  try {
    if (!KEY_REGEX.test(key)) return reply('invalid', false);

    const supabase = db();
    const { data: lic, error } = await supabase.from('licenses').select('*').eq('license_key', key).maybeSingle();
    if (error) throw error;
    if (!lic) return reply('invalid', false);

    // Cek status dari website: tidak mengikat akun, tidak butuh tanda tangan
    if (statusOnly) return reply(lic.status, lic.status === 'approved');

    if (lic.status !== 'approved') return reply(lic.status, false);

    // ---- Binding ke akun Roblox (1 key = 1 akun, admin bisa reset) ----
    const uid = Number(userId);
    if (!Number.isInteger(uid) || uid <= 0) return reply('invalid_user', false);

    if (lic.bound_user_id == null) {
      // Update hanya jika masih kosong (aman dari race condition)
      const { data: bound } = await supabase
        .from('licenses')
        .update({ bound_user_id: uid })
        .eq('id', lic.id)
        .is('bound_user_id', null)
        .select('id');
      if (!bound || bound.length === 0) {
        // Ada request lain yang mengikat lebih dulu: ambil ulang
        const { data: again } = await supabase.from('licenses').select('bound_user_id').eq('id', lic.id).single();
        if (Number(again.bound_user_id) !== uid) return reply('bound_other', false);
      }
    } else if (Number(lic.bound_user_id) !== uid) {
      return reply('bound_other', false);
    }

    await supabase.from('licenses').update({ last_verified_at: new Date().toISOString() }).eq('id', lic.id);
    return reply('approved', true);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ valid: false, status: 'server_error', message: 'Server lisensi bermasalah, coba lagi.' });
  }
};
