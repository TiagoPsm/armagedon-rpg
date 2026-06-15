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

create table if not exists suggestions (
  id text primary key,
  title text not null,
  category text not null default '',
  description text not null,
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
      'memory-drop-award',
      'echo-player-to-player',
      'echo-drop-award'
    )
  ),
  actor_user_id text references users(id) on delete set null,
  source_character_id text references characters(id) on delete set null,
  target_character_id text references characters(id) on delete set null,
  payload_json text not null default '{}',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists transfer_proposals (
  id text primary key,
  transfer_type text not null check (transfer_type in ('item', 'memory', 'echo')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  actor_user_id text references users(id) on delete set null,
  source_character_id text not null references characters(id) on delete cascade,
  target_character_id text not null references characters(id) on delete cascade,
  payload_json text not null default '{}',
  resolution_note text not null default '',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at text
);

create index if not exists transfer_proposals_target_pending_idx
  on transfer_proposals (target_character_id) where status = 'pending';
create index if not exists transfer_proposals_source_pending_idx
  on transfer_proposals (source_character_id) where status = 'pending';

create table if not exists soul_audit (
  id text primary key,
  event_type text not null check (event_type in ('essence-award', 'nightmare-complete')),
  actor_user_id text references users(id) on delete set null,
  target_character_id text references characters(id) on delete set null,
  payload_json text not null default '{}',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists login_throttle (
  key text primary key,
  fail_count integer not null default 0,
  locked_until text,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists mesa_scenes (
  id text primary key,
  data_json text not null default '{}',
  created_by_user_id text references users(id) on delete set null,
  updated_by_user_id text references users(id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Echos: manifestações residuais de monstros derrotados, com rank e XP próprios.
-- owner_character_id aponta para a ficha do jogador dono; data_json guarda
-- avatar, descrição, habilidades, passivas e atributos derivados do monstro.
create table if not exists echos (
  id text primary key,
  owner_character_id text not null references characters(id) on delete cascade,
  source_monster_id text references characters(id) on delete set null,
  source_monster_name text not null default '',
  name text not null,
  custom_name text not null default '',
  rarity text not null default 'comum' check (rarity in ('comum', 'raro', 'epico', 'lendario')),
  rank integer not null default 1 check (rank between 1 and 7),
  xp integer not null default 0,
  notes text not null default '',
  data_json text not null default '{}',
  obtained_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  granted_by_user_id text references users(id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists echos_owner_idx on echos (owner_character_id);
create index if not exists echos_source_idx on echos (source_monster_id);
