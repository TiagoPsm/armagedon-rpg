-- Migration 0002 — Sistema de Echos
-- Aplicar na base D1 de produção (schema.sql já contém estas definições para
-- bases novas). SQLite não permite ALTER de CHECK constraints, então as tabelas
-- de transferência são recriadas preservando os dados existentes.
--
--   npx wrangler d1 execute <DB> --remote --file cloudflare/d1/migrations/0002_add_echos.sql
--
-- Idempotente o suficiente para reexecução em base nova (create ... if not exists),
-- mas a recriação das tabelas de transferência deve rodar UMA vez.

-- 1. transfer_proposals: aceitar transferType 'echo'
create table if not exists transfer_proposals_new (
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
insert into transfer_proposals_new
  select id, transfer_type, status, actor_user_id, source_character_id,
         target_character_id, payload_json, resolution_note, created_at, resolved_at
  from transfer_proposals;
drop table transfer_proposals;
alter table transfer_proposals_new rename to transfer_proposals;

create index if not exists transfer_proposals_target_pending_idx
  on transfer_proposals (target_character_id) where status = 'pending';
create index if not exists transfer_proposals_source_pending_idx
  on transfer_proposals (source_character_id) where status = 'pending';

-- 2. transfer_audit: aceitar eventos de echo
create table if not exists transfer_audit_new (
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
insert into transfer_audit_new
  select id, transfer_type, actor_user_id, source_character_id,
         target_character_id, payload_json, created_at
  from transfer_audit;
drop table transfer_audit;
alter table transfer_audit_new rename to transfer_audit;

-- 3. Tabela de Echos
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
