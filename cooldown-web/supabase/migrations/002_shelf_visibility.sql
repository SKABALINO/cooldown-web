-- Migration: shelf visibility, profiles, share links, public registry
-- Run in Supabase SQL Editor if you already applied an older schema.sql

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name     text not null default '',
  username         text unique,
  bio              text not null default '',
  shelf_visibility text not null default 'private'
                   check (shelf_visibility in ('private', 'shareable', 'public')),
  share_token      uuid not null default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint profiles_username_format check (
    username is null or username ~ '^[a-z0-9_]{3,24}$'
  ),
  constraint profiles_public_needs_username check (
    shelf_visibility <> 'public' or username is not null
  )
);

create unique index if not exists profiles_share_token_idx on public.profiles (share_token);
create index if not exists profiles_public_idx
  on public.profiles (updated_at desc)
  where shelf_visibility = 'public' and username is not null;

alter table public.profiles enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read public profiles" on public.profiles;
create policy "read public profiles" on public.profiles
  for select using (shelf_visibility = 'public');

grant usage on schema public to anon, authenticated;
grant all on public.profiles to authenticated;
grant select on public.profiles to anon;

-- Backfill profiles for existing users
insert into public.profiles (user_id, display_name)
select id, coalesce(split_part(email, '@', 1), 'Cooldowner')
from auth.users
on conflict (user_id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(split_part(new.email, '@', 1), 'Cooldowner')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public._shelf_payload(p profiles)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cooling json;
  recent_letgo json;
  saved numeric;
  spent numeric;
  letgo_n int;
  bought_n int;
  cooling_n int;
  decisions int;
begin
  select coalesce(json_agg(row_to_json(x) order by x.added_at desc), '[]'::json)
  into cooling
  from (
    select
      w.id,
      w.name,
      w.price,
      w.category,
      w.link,
      w.image,
      w.added_at,
      w.cool_until,
      w.status
    from wants w
    where w.user_id = p.user_id and w.status = 'cooling'
  ) x;

  select coalesce(json_agg(row_to_json(x) order by x.decided_at desc), '[]'::json)
  into recent_letgo
  from (
    select w.name, w.price, w.category, w.decided_at
    from wants w
    where w.user_id = p.user_id and w.status = 'letgo'
    order by w.decided_at desc nulls last
    limit 8
  ) x;

  select
    coalesce(sum(price) filter (where status = 'letgo'), 0),
    coalesce(sum(price) filter (where status = 'bought'), 0),
    count(*) filter (where status = 'letgo'),
    count(*) filter (where status = 'bought'),
    count(*) filter (where status = 'cooling')
  into saved, spent, letgo_n, bought_n, cooling_n
  from wants
  where user_id = p.user_id;

  decisions := letgo_n + bought_n;

  return json_build_object(
    'profile', json_build_object(
      'username', p.username,
      'displayName', nullif(p.display_name, ''),
      'bio', p.bio,
      'visibility', p.shelf_visibility
    ),
    'stats', json_build_object(
      'saved', saved,
      'spent', spent,
      'cooling', cooling_n,
      'letgo', letgo_n,
      'bought', bought_n,
      'decisions', decisions,
      'letgoRate', case when decisions > 0 then round((letgo_n::numeric / decisions) * 100) else null end
    ),
    'cooling', cooling,
    'recentLetGo', recent_letgo
  );
end;
$$;

create or replace function public.get_shared_shelf(p_token uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p profiles%rowtype;
begin
  select * into p from profiles where share_token = p_token;
  if not found then
    return null;
  end if;
  if p.shelf_visibility = 'private' then
    return null;
  end if;
  return public._shelf_payload(p);
end;
$$;

create or replace function public.get_public_shelf(p_username text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p profiles%rowtype;
begin
  select * into p
  from profiles
  where username = lower(trim(p_username))
    and shelf_visibility = 'public';
  if not found then
    return null;
  end if;
  return public._shelf_payload(p);
end;
$$;

create or replace function public.list_public_shelves()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  from (
    select
      p.username,
      coalesce(nullif(p.display_name, ''), p.username) as "displayName",
      p.bio,
      (
        select count(*)::int from wants w
        where w.user_id = p.user_id and w.status = 'cooling'
      ) as "coolingCount",
      (
        select coalesce(sum(w.price), 0) from wants w
        where w.user_id = p.user_id and w.status = 'letgo'
      ) as "savedAmount",
      p.updated_at as "updatedAt"
    from profiles p
    where p.shelf_visibility = 'public'
      and p.username is not null
    order by p.updated_at desc
    limit 100
  ) x;
$$;

grant execute on function public.get_shared_shelf(uuid) to anon, authenticated;
grant execute on function public.get_public_shelf(text) to anon, authenticated;
grant execute on function public.list_public_shelves() to anon, authenticated;
