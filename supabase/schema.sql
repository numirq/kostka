create table if not exists public.profiles (
  id text primary key,
  room_code text not null,
  name text not null check (char_length(name) between 1 and 16),
  color text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.solves (
  id text primary key,
  room_code text not null,
  profile_id text not null references public.profiles(id) on delete cascade,
  time_seconds numeric(10, 3) not null check (time_seconds > 0),
  created_at_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists profiles_room_code_idx on public.profiles(room_code);
create index if not exists solves_room_code_idx on public.solves(room_code);
create index if not exists solves_profile_id_idx on public.solves(profile_id);

alter table public.profiles enable row level security;
alter table public.solves enable row level security;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.solves to authenticated;

drop policy if exists "Room members can read profiles" on public.profiles;
drop policy if exists "Room members can create profiles" on public.profiles;
drop policy if exists "Room members can update profiles" on public.profiles;
drop policy if exists "Room members can delete profiles" on public.profiles;
drop policy if exists "Room members can read solves" on public.solves;
drop policy if exists "Room members can create solves" on public.solves;
drop policy if exists "Room members can update solves" on public.solves;
drop policy if exists "Room members can delete solves" on public.solves;

create policy "Room members can read profiles"
on public.profiles for select to authenticated
using (room_code = (select auth.jwt() -> 'user_metadata' ->> 'room_code'));

create policy "Room members can create profiles"
on public.profiles for insert to authenticated
with check (room_code = (select auth.jwt() -> 'user_metadata' ->> 'room_code'));

create policy "Room members can update profiles"
on public.profiles for update to authenticated
using (room_code = (select auth.jwt() -> 'user_metadata' ->> 'room_code'))
with check (room_code = (select auth.jwt() -> 'user_metadata' ->> 'room_code'));

create policy "Room members can delete profiles"
on public.profiles for delete to authenticated
using (room_code = (select auth.jwt() -> 'user_metadata' ->> 'room_code'));

create policy "Room members can read solves"
on public.solves for select to authenticated
using (room_code = (select auth.jwt() -> 'user_metadata' ->> 'room_code'));

create policy "Room members can create solves"
on public.solves for insert to authenticated
with check (room_code = (select auth.jwt() -> 'user_metadata' ->> 'room_code'));

create policy "Room members can update solves"
on public.solves for update to authenticated
using (room_code = (select auth.jwt() -> 'user_metadata' ->> 'room_code'))
with check (room_code = (select auth.jwt() -> 'user_metadata' ->> 'room_code'));

create policy "Room members can delete solves"
on public.solves for delete to authenticated
using (room_code = (select auth.jwt() -> 'user_metadata' ->> 'room_code'));
