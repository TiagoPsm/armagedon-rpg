create table if not exists users (
  id text primary key,
  username text not null,
  password_hash text not null,
  role text not null check (role in ('master', 'player')),
  is_active integer not null default 1,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create unique index if not exists users_username_lower_uidx on users (lower(username));

create table if not exists characters (
  id text primary key,
  sheet_key text not null,
  owner_user_id text references users(id) on delete cascade,
  kind text not null check (kind in ('player', 'npc', 'monster')),
  name text not null,
  data_json text not null default '{}',
  created_by_user_id text references users(id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check (
    (kind = 'player' and owner_user_id is not null)
    or (kind in ('npc', 'monster'))
  )
);

create unique index if not exists characters_sheet_key_uidx on characters (sheet_key);
create unique index if not exists characters_player_owner_uidx on characters (owner_user_id) where kind = 'player';
create index if not exists characters_kind_idx on characters (kind);

create table if not exists rules_posts (
  id text primary key,
  title text not null,
  tag text not null default '',
  content text not null,
  created_by_user_id text references users(id) on delete set null,
  updated_by_user_id text references users(id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists transfer_audit (
  id text primary key,
  transfer_type text not null check (
    transfer_type in (
      'item-player-to-player',
      'memory-player-to-player',
      'memory-drop-award'
    )
  ),
  actor_user_id text references users(id) on delete set null,
  source_character_id text references characters(id) on delete set null,
  target_character_id text references characters(id) on delete set null,
  payload_json text not null default '{}',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
