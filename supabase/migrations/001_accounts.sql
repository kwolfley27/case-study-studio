-- Case Study Studio accounts: invite list, each person's case studies, and who owns each published page address.
-- Safe to run more than once.

create table if not exists public.studio_invites (
  email text primary key,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);
alter table public.studio_invites enable row level security;

-- The signed-in person's role ('owner', 'member' or null when not invited).
create or replace function public.studio_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from public.studio_invites where email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

drop policy if exists "read own invite, owners read all" on public.studio_invites;
create policy "read own invite, owners read all" on public.studio_invites for select
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')) or public.studio_role() = 'owner');
drop policy if exists "owners invite" on public.studio_invites;
create policy "owners invite" on public.studio_invites for insert with check (public.studio_role() = 'owner' and role = 'member');
drop policy if exists "owners remove members" on public.studio_invites;
create policy "owners remove members" on public.studio_invites for delete using (public.studio_role() = 'owner' and role = 'member');

insert into public.studio_invites (email, role) values
  ('katelyndayley1@gmail.com', 'owner'),
  ('katelynwolfley@gmail.com', 'owner')
on conflict (email) do update set role = 'owner';

create table if not exists public.studies (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  title text,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner, id)
);
alter table public.studies enable row level security;
drop policy if exists "own studies" on public.studies;
create policy "own studies" on public.studies for all
  using (owner = auth.uid() and public.studio_role() is not null)
  with check (owner = auth.uid() and public.studio_role() is not null);

create table if not exists public.published_slugs (
  slug text primary key,
  owner uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.published_slugs enable row level security;   -- only the Studio's server functions read or write it

grant select, insert, delete on public.studio_invites to authenticated;
grant select, insert, update, delete on public.studies to authenticated;
