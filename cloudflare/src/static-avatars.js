import catalog from '../../assets/avatars/manifest.json' with { type: 'json' };
export function staticAvatarsEnabled() { return catalog.enabled === true; }
export function staticAvatarUrl(key, source = catalog) {
  const normalized = String(key || '').replace(/[^a-z0-9_-]/gi, '_').toLowerCase().slice(0, 64);
  const item = source.entries[normalized];
  if (!item || !/^assets\/avatars\/[a-f0-9]{64}\.(webp|jpg|png|gif|avif)$/.test(item.path)) return '';
  return source.origin + '/' + item.path;
}
export function legacyStaticAvatarResponse(key, source = catalog) {
  if (!source.enabled) return null;
  const url = staticAvatarUrl(key, source);
  return url ? new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-cache' } })
    : new Response(JSON.stringify({ error: 'Avatar nao encontrado no catalogo estatico.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
}
export function allowsStaticAvatarEdit(previous, next, key, source = catalog) {
  if (!source.enabled || String(previous || '') === String(next || '')) return true;
  return Boolean(next && staticAvatarUrl(key, source) === next);
}
