-- Migration: multi-shelf wishlists with per-shelf visibility
-- Run in Supabase SQL Editor after 002_shelf_visibility.sql (or on top of full schema.sql)

create extension if not exists pgcrypto;

-- -------- shelves (wishlists) --------
create table if not exists public.shelves (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null,
  visibility       text not null default 'private'
                   check (visibility in ('private', 'shareable', 'public')),
  share_token      uuid not null default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists shelves_share_token_idx on public.shelves (share_token);
create index if not exists shelves_user_idx on public.shelves (user_id, created_at desc);
create index if not exists shelves_public_idx
  on public.shelves (updated_at desc)
  where visibility = 'public';

alter table public.shelves enable row level security;

drop policy if exists "own shelves" on public.shelves;
create policy "own shelves" on public.shelves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read public shelves" on public.shelves;
create policy "read public shelves" on public.shelves
  for select using (visibility = 'public');

grant all on public.shelves to authenticated;
grant select on public.shelves to anon;

-- -------- wants: belong to a shelf + wishlist flags --------
alter table public.wants
  add column if not exists shelf_id uuid references public.shelves(id) on delete cascade,
  add column if not exists quantity int not null default 1,
  add column if not exists most_wanted boolean not null default false,
  add column if not exists is_private boolean not null default false,
  add column if not exists open_to_secondhand boolean not null default false;

create index if not exists wants_shelf_idx on public.wants (shelf_id, added_at desc);

-- Backfill: one default shelf per user who has wants or a profile, then attach wants
insert into public.shelves (user_id, name, visibility)
select
  u.id,
  to_char(timezone('utc', now()), 'Mon DD, YYYY'),
  coalesce(p.shelf_visibility, 'private')
from auth.users u
left join public.profiles p on p.user_id = u.id
where not exists (select 1 from public.shelves s where s.user_id = u.id)
  and (
    exists (select 1 from public.wants w where w.user_id = u.id)
    or exists (select 1 from public.profiles p2 where p2.user_id = u.id)
  );

update public.wants w
set shelf_id = s.id
from public.shelves s
where w.shelf_id is null
  and s.user_id = w.user_id
  and s.created_at = (
    select min(s2.created_at) from public.shelves s2 where s2.user_id = w.user_id
  );

-- -------- shared shelf payload (per shelf, hides private items + notes) --------
create or replace function public._shelf_wishlist_payload(s public.shelves)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_name text;
  owner_username text;
  owner_bio text;
  items json;
  item_count int;
  most_wanted_count int;
  total_value numeric;
begin
  select
    coalesce(nullif(p.display_name, ''), p.username, 'Someone'),
    p.username,
    coalesce(p.bio, '')
  into owner_name, owner_username, owner_bio
  from profiles p
  where p.user_id = s.user_id;

  select coalesce(json_agg(row_to_json(x) order by x.most_wanted desc, x.added_at desc), '[]'::json)
  into items
  from (
    select
      w.id,
      w.name,
      w.price,
      w.quantity,
      w.link,
      w.image,
      w.most_wanted,
      w.open_to_secondhand,
      w.added_at,
      w.cool_until,
      w.status
    from wants w
    where w.shelf_id = s.id
      and w.is_private = false
      and w.status = 'cooling'
  ) x;

  select
    count(*)::int,
    count(*) filter (where most_wanted)::int,
    coalesce(sum(price * quantity), 0)
  into item_count, most_wanted_count, total_value
  from wants
  where shelf_id = s.id
    and is_private = false
    and status = 'cooling';

  return json_build_object(
    'shelf', json_build_object(
      'id', s.id,
      'name', s.name,
      'visibility', s.visibility,
      'createdAt', s.created_at
    ),
    'owner', json_build_object(
      'displayName', owner_name,
      'username', owner_username,
      'bio', owner_bio
    ),
    'stats', json_build_object(
      'itemCount', item_count,
      'mostWantedCount', most_wanted_count,
      'totalValue', total_value
    ),
    'items', items
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
  s shelves%rowtype;
begin
  select * into s from shelves where share_token = p_token;
  if not found then
    return null;
  end if;
  if s.visibility = 'private' then
    return null;
  end if;
  return public._shelf_wishlist_payload(s);
end;
$$;

-- Public shelf by owner username + shelf id or name slug is awkward;
-- public shelves are listed in registry and opened by share token OR by shelf id for public ones.
create or replace function public.get_public_shelf_by_id(p_shelf_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s shelves%rowtype;
begin
  select * into s from shelves where id = p_shelf_id and visibility = 'public';
  if not found then
    return null;
  end if;
  return public._shelf_wishlist_payload(s);
end;
$$;

-- Keep username route as "owner's public shelves list" helper via registry;
-- get_public_shelf(username) now returns that user's public shelves summary + first shelf payload if any.
create or replace function public.get_public_shelf(p_username text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid;
  s shelves%rowtype;
begin
  select user_id into uid
  from profiles
  where username = lower(trim(p_username));
  if uid is null then
    return null;
  end if;

  select * into s
  from shelves
  where user_id = uid and visibility = 'public'
  order by updated_at desc
  limit 1;

  if not found then
    return null;
  end if;
  return public._shelf_wishlist_payload(s);
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
      s.id as "shelfId",
      s.name as "shelfName",
      s.share_token as "shareToken",
      p.username,
      coalesce(nullif(p.display_name, ''), p.username, 'Someone') as "displayName",
      coalesce(p.bio, '') as bio,
      (
        select count(*)::int from wants w
        where w.shelf_id = s.id and w.is_private = false and w.status = 'cooling'
      ) as "itemCount",
      (
        select coalesce(sum(w.price * w.quantity), 0) from wants w
        where w.shelf_id = s.id and w.is_private = false and w.status = 'cooling'
      ) as "totalValue",
      s.updated_at as "updatedAt"
    from shelves s
    left join profiles p on p.user_id = s.user_id
    where s.visibility = 'public'
    order by s.updated_at desc
    limit 100
  ) x;
$$;

grant execute on function public.get_shared_shelf(uuid) to anon, authenticated;
grant execute on function public.get_public_shelf(text) to anon, authenticated;
grant execute on function public.get_public_shelf_by_id(uuid) to anon, authenticated;
grant execute on function public.list_public_shelves() to anon, authenticated;
