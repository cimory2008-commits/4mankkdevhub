-- Jalankan di Supabase -> SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.licenses (
  id                 uuid primary key default gen_random_uuid(),
  license_key        text not null unique,
  buyer_name         text not null,
  discord_id         text not null,
  proof_path         text,
  proof_url          text,
  status             text not null default 'waiting_approval'
                     check (status in ('waiting_approval', 'approved', 'rejected', 'suspended')),
  bound_user_id      bigint,               -- Roblox UserId yang terikat ke key ini
  discord_message_id text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  last_verified_at   timestamptz
);

create index if not exists licenses_discord_idx on public.licenses (discord_id, status);
create index if not exists licenses_created_idx on public.licenses (created_at desc);

-- Keamanan: aktifkan RLS TANPA policy. Akses hanya lewat SERVICE ROLE KEY dari API Vercel.
alter table public.licenses enable row level security;

-- Bucket penyimpanan bukti transfer (public agar bisa tampil di embed Discord; nama file acak/UUID)
insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', true)
on conflict (id) do nothing;
