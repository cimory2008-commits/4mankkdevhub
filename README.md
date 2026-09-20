# 4MankkTool Versi 2 — Panduan Pemasangan

## Struktur
```
4mankktool-web/
├── package.json
├── vercel.json
├── index.html                  ← halaman user + dashboard admin (/admin)
├── supabase.sql                ← jalankan sekali di Supabase
├── .env.example                ← daftar Environment Variables
├── lib/
│   ├── supabase.js
│   └── discord.js
└── api/
    ├── order.js                ← form beli (upload bukti, buat key, kirim notifikasi ke Discord)
    ├── verify.js               ← dipanggil plugin Roblox
    └── admin-control.js        ← panel admin: approve / reject / suspend / reset bind
```
> `api/order.js` dan folder `lib/` adalah tambahan di luar daftar awal, karena form beli dan
> notifikasi Discord memerlukannya. `api/discord-interactions.js` sudah dihapus: approve/reject
> hanya lewat panel admin website.

## 1. Supabase
1. Buat project baru → **SQL Editor** → tempel isi `supabase.sql` → Run.
2. **Settings → API**: salin `Project URL` dan `service_role key` (rahasia, jangan dipublikasikan).

## 2. Vercel
1. Upload folder ini (GitHub → Import di Vercel, atau `vercel` CLI).
2. **Settings → Environment Variables**: isi semua variabel di `.env.example`.
3. Deploy. Catat domainnya, misalnya `https://4mankktool.vercel.app`.
4. Ganti logo: taruh file `logo.png` di folder yang sama dengan `index.html`.

## 3. Discord (notifikasi saja)
Discord hanya menerima **notifikasi order**. Approve / Reject / Suspend dilakukan di panel admin: `https://DOMAIN-KAMU.vercel.app/admin`.
1. Di Discord: **Channel Settings -> Integrations -> Webhooks -> New Webhook** -> **Copy Webhook URL**.
2. Isi di Vercel: `DISCORD_WEBHOOK_URL` dan `SITE_URL` (domain Vercel kamu).
3. Setiap order baru masuk sebagai embed + screenshot bukti transfer + link ke panel admin.
   Saat status diubah di panel admin, embed di Discord ikut berubah (warna & status).

## 4. Plugin Roblox
Di bagian `CONFIG` pada `4MankkTool_V2_Plugin.lua`, ganti:
- `API_URL` → `https://DOMAIN-KAMU.vercel.app/api/verify`
- `BUY_URL` → `https://DOMAIN-KAMU.vercel.app`
- `SIGN_SECRET` → **sama persis** dengan `PLUGIN_SIGN_SECRET` di Vercel

Saat pertama kali dijalankan, Studio akan meminta izin HTTP untuk domain tersebut → **Allow**.

## Catatan keamanan
- **Ganti `ADMIN_PASSWORD`** dengan yang panjang dan acak. Password pendek seperti `pwaman00aa` mudah ditebak.
  Password dicek di server (bukan di HTML), tapi kekuatannya tetap ditentukan oleh isinya.
- Bukti transfer disimpan di bucket publik dengan nama file acak (UUID). Jika ingin lebih privat,
  ubah bucket jadi private dan pakai signed URL.
- Kode plugin Luau **tidak bisa dibuat kebal 100%** terhadap bypass, karena kodenya berjalan di komputer pembeli.
  Yang ada di sini: respons server bertanda tangan + nonce, 1 key = 1 akun Roblox, re-check tiap 10 menit,
  dan fitur baru dibangun setelah lisensi valid. Untuk perlindungan lebih kuat, distribusikan plugin lewat
  Creator Store agar sumbernya tidak bisa dibuka pembeli.
