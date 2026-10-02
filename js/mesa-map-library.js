/* Metadata search and bounded, on-demand thumbnails. No original map is replaced. */
window.MesaMapLibrary = (() => {
  let observer, rows = new Map(), running = 0, queue = [], timer;
  const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const cache = new Map(), folders = new WeakMap(); let folderCounter = 0;
  const signature = row => `${row.createdAt}:${row.size}:${row.hash}`;
  function matches(name) {
    const text = fold(name);
    return fold(document.getElementById('mesaMapSearch')?.value.trim()).split(/\s+/).every(word => text.includes(word));
  }
  function visible(el) {
    if (!el.isConnected || !el.getClientRects().length) return false;
    const r = el.getBoundingClientRect(), root = document.querySelector('.vtt-sidebar')?.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > Math.max(root?.top || 0, 0) && r.top < Math.min(root?.bottom || innerHeight, innerHeight);
  }
  async function thumbnail(blob) {
    const bitmap = await createImageBitmap(blob);
    try {
      const scale = Math.min(1, 192 / bitmap.width, 128 / bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Miniatura indisponível')), 'image/webp', .8));
    } finally { bitmap.close(); }
  }
  function saveThumbnail(row, blob) {
    const tx = mesaMapState.db.transaction(MESA_MAP_CATALOG_STORE, 'readwrite'), store = tx.objectStore(MESA_MAP_CATALOG_STORE);
    const req = store.get(row.id);
    req.onsuccess = () => {
      if (req.result && signature(req.result) === signature(row)) store.put({ ...req.result, thumbnail: blob });
    };
    // A quota error affects only the cache, not the source or selection.
    tx.onerror = () => {};
  }
  function useURL(key, blob) {
    if (cache.has(key)) return cache.get(key);
    const url = URL.createObjectURL(blob); cache.set(key, url);
    while (cache.size > 128) {
      const oldest = cache.keys().next().value; URL.revokeObjectURL(cache.get(oldest)); cache.delete(oldest);
      // Keep the URL budget bounded without leaving connected rows marked ready
      // with an invalid image. Re-observation loads them when visible again.
      document.querySelectorAll('[data-thumb-cache-key]').forEach(el => {
        if (el.dataset.thumbCacheKey !== oldest) return;
        delete el.dataset.thumbCacheKey; el.style.backgroundImage = ''; el.dataset.thumbState = 'idle';
        observer?.unobserve(el); observer?.observe(el);
      });
    }
    return url;
  }
  async function load(el) {
    const id = el.dataset.libThumb, path = el.dataset.cfPath;
    const row = id ? rows.get(id) : connectedFolder.entries.find(e => e.path === path);
    if (!row) throw new Error('Arquivo ausente');
    const folder = connectedFolder.handle;
    if (!id && folder && !folders.has(folder)) folders.set(folder, ++folderCounter);
    const key = id ? `db:${id}:${signature(row)}` : `folder:${folders.get(folder)}:${path}:${row.lastModified}:${row.size}`;
    let url = cache.get(key);
    if (url) { cache.delete(key); cache.set(key, url); }
    if (!url) {
      let blob = row.thumbnail;
      if (!blob) {
        const original = id ? (await loadMesaMapFromDB(id))?.blob : await row.handle.getFile();
        if (!original) throw new Error('Arquivo ausente');
        blob = await thumbnail(original);
        if (id) { saveThumbnail(row, blob); row.thumbnail = blob; }
      }
      // Folder rescans / disconnection may have invalidated the source while decoding.
      if (!id && connectedFolder.entries.find(e => e.path === path)?.handle !== row.handle) return;
      url = useURL(key, blob);
    }
    if (el.isConnected) {
      el.dataset.thumbCacheKey = key;
      el.style.backgroundImage = `url('${url}')`; el.dataset.thumbState = 'ready';
      el.setAttribute('aria-label', 'Miniatura do mapa');
    }
  }
  function pump() {
    while (running < 2 && queue.length) {
      const el = queue.shift();
      if (!visible(el)) { el.dataset.thumbState = 'idle'; continue; }
      running++; el.dataset.thumbState = 'loading';
      load(el).catch(() => {
        if (el.isConnected) { el.dataset.thumbState = 'error'; el.setAttribute('aria-label', 'Arquivo indisponível. Reimporte ou reconecte.'); }
      }).finally(() => { running--; pump(); });
    }
  }
  function observe(catalog) {
    if (catalog) rows = new Map(catalog.map(row => [row.id, row]));
    observer ||= new IntersectionObserver(entries => {
      for (const entry of entries) {
        const el = entry.target;
        if (entry.isIntersecting && el.dataset.thumbState === 'idle') {
          el.dataset.thumbState = 'queued'; queue.push(el);
        }
      }
      pump();
    }, { root: document.querySelector('.vtt-sidebar'), rootMargin: '0px' });
    observer.disconnect();
    document.querySelectorAll('[data-lib-thumb], .map-lib-thumb[data-cf-path]').forEach(el => observer.observe(el));
  }
  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('mesaMapSearch');
    if (!input) return;
    input.dataset.armed = '1';
    input.addEventListener('input', () => {
      clearTimeout(timer); timer = setTimeout(() => { renderMapLibrary(); renderConnectedFolderUI(); }, 120);
    });
  });
  window.addEventListener('pagehide', e => { if (e.persisted) return; for (const url of cache.values()) URL.revokeObjectURL(url); cache.clear(); });
  return { matches, observe };
})();
