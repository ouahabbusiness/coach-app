-- Ippo — socle backend Supabase (v1)
-- À appliquer sur un projet Supabase neuf : SQL Editor, ou `supabase db push`.
-- Principes : une ligne = un utilisateur (RLS), le journal d'événements est append-only,
-- les réglages sont en last-write-wins, les quotas du coach sont écrits uniquement par le service.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  time_zone text not null default 'Europe/Brussels',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
before update on public.profiles
for each row execute function public.touch_updated_at();

-- Crée le profil à l'inscription (nom d'affichage facultatif dans les métadonnées).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Journal d'événements (source de vérité, append-only)
-- `id` est l'UUID généré par le client : clé d'idempotence, un rejeu ne duplique rien.
-- ---------------------------------------------------------------------------
create table if not exists public.session_events (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null,
  at bigint not null,
  saved_at bigint not null,
  event jsonb not null,
  inserted_at timestamptz not null default now()
);

create index if not exists session_events_user_session_idx on public.session_events (user_id, session_id, at);
create index if not exists session_events_user_inserted_idx on public.session_events (user_id, inserted_at);

-- ---------------------------------------------------------------------------
-- Réglages, profil d'onboarding, programme, planning, nutrition… (clé-valeur)
-- `updated_at` en ms UTC : la synchro garde la valeur la plus récente.
-- ---------------------------------------------------------------------------
create table if not exists public.kv_docs (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at bigint not null,
  primary key (user_id, key)
);

create index if not exists kv_docs_user_updated_idx on public.kv_docs (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Historique du chat Ippo (utile au multi-appareil ; le coach n'en a pas besoin)
-- ---------------------------------------------------------------------------
create table if not exists public.ippo_messages (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  origin text check (origin in ('llm', 'demo', 'local', 'error')),
  at bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists ippo_messages_user_at_idx on public.ippo_messages (user_id, at);

-- ---------------------------------------------------------------------------
-- Quota quotidien du coach (écrit par l'Edge Function, jamais par le client)
-- ---------------------------------------------------------------------------
create table if not exists public.ippo_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  messages int not null default 0,
  primary key (user_id, day)
);

create or replace function public.ippo_consume_quota(p_user uuid, p_limit int default 60)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  used int;
begin
  insert into public.ippo_usage (user_id, day, messages)
  values (p_user, current_date, 1)
  on conflict (user_id, day) do update set messages = ippo_usage.messages + 1
  returning messages into used;
  return used <= p_limit;
end;
$$;

revoke all on function public.ippo_consume_quota(uuid, int) from public, anon, authenticated;
grant execute on function public.ippo_consume_quota(uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security : chacun ne voit que ses lignes.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.session_events enable row level security;
alter table public.kv_docs enable row level security;
alter table public.ippo_messages enable row level security;
alter table public.ippo_usage enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists events_select_own on public.session_events;
create policy events_select_own on public.session_events for select to authenticated using (auth.uid() = user_id);
drop policy if exists events_insert_own on public.session_events;
create policy events_insert_own on public.session_events for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists events_delete_own on public.session_events;
create policy events_delete_own on public.session_events for delete to authenticated using (auth.uid() = user_id);

drop policy if exists kv_select_own on public.kv_docs;
create policy kv_select_own on public.kv_docs for select to authenticated using (auth.uid() = user_id);
drop policy if exists kv_insert_own on public.kv_docs;
create policy kv_insert_own on public.kv_docs for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists kv_update_own on public.kv_docs;
create policy kv_update_own on public.kv_docs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists kv_delete_own on public.kv_docs;
create policy kv_delete_own on public.kv_docs for delete to authenticated using (auth.uid() = user_id);

drop policy if exists ippo_messages_select_own on public.ippo_messages;
create policy ippo_messages_select_own on public.ippo_messages for select to authenticated using (auth.uid() = user_id);
drop policy if exists ippo_messages_insert_own on public.ippo_messages;
create policy ippo_messages_insert_own on public.ippo_messages for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists ippo_messages_delete_own on public.ippo_messages;
create policy ippo_messages_delete_own on public.ippo_messages for delete to authenticated using (auth.uid() = user_id);

drop policy if exists ippo_usage_select_own on public.ippo_usage;
create policy ippo_usage_select_own on public.ippo_usage for select to authenticated using (auth.uid() = user_id);

-- Aucune policy d'écriture sur ippo_usage : seul le service_role (Edge Function) écrit.
