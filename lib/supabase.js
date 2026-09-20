// lib/supabase.js
// Client Supabase memakai SERVICE ROLE KEY (hanya dipakai di server/API, JANGAN pernah dikirim ke frontend).
const { createClient } = require('@supabase/supabase-js');

let client = null;

function db() {
  if (!client) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum di-set di Environment Variables Vercel.');
    }
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

module.exports = { db };
