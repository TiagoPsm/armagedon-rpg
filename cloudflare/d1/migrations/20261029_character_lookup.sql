-- Additive and idempotent. Preserve case-insensitive lookup for legacy keys.
create index if not exists characters_sheet_key_lower_idx on characters (lower(sheet_key));
