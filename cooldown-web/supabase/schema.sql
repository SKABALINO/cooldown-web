-- Cooldown — database schema
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.

create extension if not exists pgcrypto;

-- Each parked want belongs to one user.
create table if not exists public.wants (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  price      numeric not null default 0,
  category   text not null default 'Other',
  note       text default '',
  link       text default '',
  image      text default '',
  added_at   timestamptz not null default now(),
  cool_until timestamptz not null,
  status     text not null default 'cooling',   -- cooling | letgo | bought
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- One savings goal per user.
create table if not exists public.goals (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name       text not null default 'Savings goal',
  target     numeric not null default 500,
  updated_at timestamptz not null default now()
);

-- Row-level security: a user can only ever see or touch their own rows.
alter table public.wants enable row level security;
alter table public.goals enable row level security;

drop policy if exists "own wants" on public.wants;
create policy "own wants" on public.wants
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own goal" on public.goals;
create policy "own goal" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Explicit grants (required for the auto REST API on projects created after 2026-05-30).
grant usage on schema public to authenticated;
grant all on public.wants to authenticated;
grant all on public.goals to authenticated;

create index if not exists wants_user_idx on public.wants (user_id, added_at desc);

-- Enable live sync so a save in the extension shows up in an open web tab instantly.
alter publication supabase_realtime add table public.wants;
