// lib/discord.js
// Notifikasi order via Discord Webhook biasa (satu arah: website -> Discord).
// Approve / Reject / Suspend dilakukan HANYA lewat dashboard admin di website (/admin).
// Saat status diubah dari dashboard, embed di Discord ikut diperbarui (warna & status).
const COLORS = {
  waiting_approval: 0xf1c40f,
  approved: 0x2ecc71,
  rejected: 0xe74c3c,
  suspended: 0x7f8c8d,
};

const LABELS = {
  waiting_approval: '⏳ Menunggu Approval',
  approved: '✅ Aktif (Approved)',
  rejected: '❌ Ditolak',
  suspended: '🚫 Disuspend',
};

// Webhook bawaan supaya folder ini bisa langsung di-upload ke Vercel.
// Jika DISCORD_WEBHOOK_URL di Vercel diisi, nilai itu yang dipakai (lebih aman).
// PENTING: file ini berjalan di server (tidak terlihat pengunjung), tapi JANGAN upload ke GitHub PUBLIC,
// karena siapa pun yang punya URL webhook bisa mengirim pesan ke channel kamu.
const DEFAULT_WEBHOOK_URL = 'https://discord.com/api/webhooks/1551103077493244005/0rL-bPL2x2TdYHunCR7Dv7O7QwN9bZWSUkpnbsDJ6Vggz9zbXCBqbsSCmuMRH4eIPE4C';

function webhookUrl() {
  const url = (process.env.DISCORD_WEBHOOK_URL || DEFAULT_WEBHOOK_URL).trim();
  if (!url) throw new Error('Webhook Discord belum di-set.');
  if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url)) {
    throw new Error('DISCORD_WEBHOOK_URL tidak valid.');
  }
  return url;
}

function clip(text, max) {
  const s = String(text || '-');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Susun embed sesuai status lisensi saat ini
function buildMessage(l) {
  const embed = {
    title: '🧾 Order 4MankkTool Versi 2',
    color: COLORS[l.status] || COLORS.waiting_approval,
    fields: [
      { name: 'Nama', value: clip(l.buyer_name, 200), inline: true },
      { name: 'Discord', value: `<@${l.discord_id}> (\`${clip(l.discord_id, 25)}\`)`, inline: true },
      { name: 'Status', value: LABELS[l.status] || l.status, inline: true },
      { name: 'License Key', value: `\`${l.license_key}\`` },
    ],
    footer: { text: `ID: ${l.id}` },
    timestamp: new Date(l.created_at).toISOString(),
  };
  if (l.proof_url && /^https:\/\//.test(l.proof_url)) embed.image = { url: l.proof_url };

  // SITE_URL opsional: kalau kosong, otomatis pakai domain produksi Vercel
  const site = (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '')).replace(/\/+$/, '');
  if (site) embed.fields.push({ name: 'Aksi', value: `[Buka Panel Admin untuk Approve / Reject](${site}/admin)` });

  return { embeds: [embed], allowed_mentions: { parse: [] } };
}

async function webhookFetch(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Discord webhook ${res.status}: ${await res.text()}`);
  return res.json();
}

// Kirim pesan order baru, return message id
async function sendOrderMessage(license) {
  const msg = await webhookFetch('POST', `${webhookUrl()}?wait=true`, buildMessage(license));
  return msg.id;
}

// Perbarui pesan yang sudah ada (dipanggil saat admin mengubah status di dashboard)
async function editOrderMessage(license) {
  if (!license.discord_message_id) return;
  await webhookFetch('PATCH', `${webhookUrl()}/messages/${license.discord_message_id}`, buildMessage(license));
}

module.exports = { buildMessage, sendOrderMessage, editOrderMessage };
