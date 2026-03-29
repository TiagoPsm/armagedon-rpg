create extension if not exists pgcrypto;

create or replace function set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  password_hash text not null,
  role text not null check (role in ('master', 'player')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_username_lower_uidx on users (lower(username));

create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  sheet_key text not null,
  owner_user_id uuid references users(id) on delete cascade,
  kind text not null check (kind in ('player', 'npc', 'monster')),
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'player' and owner_user_id is not null)
    or (kind in ('npc', 'monster'))
  )
);

create unique index if not exists characters_sheet_key_uidx on characters (sheet_key);
create unique index if not exists characters_player_owner_uidx on characters (owner_user_id) where kind = 'player';
create index if not exists characters_kind_idx on characters (kind);

create table if not exists rules_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  tag text not null default '',
  content text not null,
  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transfer_audit (
  id uuid primary key default gen_random_uuid(),
  transfer_type text not null check (
    transfer_type in (
      'item-player-to-player',
      'memory-player-to-player',
      'memory-drop-award'
    )
  ),
  actor_user_id uuid references users(id) on delete set null,
  source_character_id uuid references characters(id) on delete set null,
  target_character_id uuid references characters(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at
before update on users
for each row
execute function set_row_updated_at();

drop trigger if exists trg_characters_updated_at on characters;
create trigger trg_characters_updated_at
before update on characters
for each row
execute function set_row_updated_at();

drop trigger if exists trg_rules_posts_updated_at on rules_posts;
create trigger trg_rules_posts_updated_at
before update on rules_posts
for each row
execute function set_row_updated_at();
