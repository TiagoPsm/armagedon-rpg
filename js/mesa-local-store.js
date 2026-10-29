/* Local scene documents. Images remain in the map database, outside backups. */
globalThis.MesaLocalStore = (() => {
  let database = 'armagedom_local_scenes';
  let opened;
  function db() {
    return opened ||= new Promise((resolve, reject) => {
      const r = indexedDB.open(database, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('documents', { keyPath: 'id' });
      r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); opened = null; }; resolve(r.result); };
      r.onerror = () => { opened = null; reject(r.error); };
    });
  }
  async function read(id) {
    const d = await db(); return new Promise((resolve, reject) => {
      const r = d.transaction('documents').objectStore('documents').get(id);
      r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error);
    });
  }
  async function list() {
    const d = await db(); return new Promise((resolve, reject) => {
      const r = d.transaction('documents').objectStore('documents').getAll();
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
  }
  async function write(record, expectedRevision) {
    const d = await db(); return new Promise((resolve, reject) => {
      const tx = d.transaction('documents', 'readwrite'), store = tx.objectStore('documents');
      const request = store.get(record.id); let next, conflict;
      request.onsuccess = () => {
        const previous = request.result;
        if ((previous?.revision || 0) !== expectedRevision) {
          conflict = new Error('Esta cena foi alterada em outra aba. Reabra a cena antes de salvar.'); tx.abort(); return;
        }
        next = { ...record, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
        store.put(next);
      };
      tx.oncomplete = () => resolve(next);
      tx.onabort = tx.onerror = () => reject(conflict || tx.error || new Error('Falha ao salvar cena local.'));
    });
  }
  function cleanData(data) {
    const copy = JSON.parse(JSON.stringify(data || {}));
    delete copy.vision; delete copy.selectedTokenId;
    for (const token of copy.tokens || []) {
      if (/^(data:|blob:)/i.test(token.imageUrl || '')) delete token.imageUrl;
    }
    if (copy.map) copy.map = { id: String(copy.map.id || ''), localOnly: true,
      name: String(copy.map.name || ''), hash: String(copy.map.hash || ''), fit: copy.map.fit !== false, transform: copy.map.transform || null };
    return copy;
  }
  function decodeBackup(text) {
    if (text.length > 8 * 1024 * 1024) throw new Error('Backup excede 8 MB.');
    const file = JSON.parse(text), scene = file.scene;
    if (file.format !== 'armagedom-scene' || file.version !== 1 || !scene || typeof scene.name !== 'string' ||
        !scene.data || !Array.isArray(scene.data.tokens) || scene.data.tokens.length > 120 ||
        (scene.data.drawings && (!Array.isArray(scene.data.drawings) || scene.data.drawings.length > 3000))) throw new Error('Backup de cena invalido.');
    return { name: scene.name.slice(0, 100), data: cleanData(scene.data) };
  }
  async function exportScene(id) {
    const scene = await read(id); if (!scene || scene.deleted) throw new Error('Cena inexistente.');
    return JSON.stringify({ format: 'armagedom-scene', version: 1, scene: { name: scene.name, data: cleanData(scene.data) } }, null, 2);
  }
  async function importScene(text) {
    const scene = decodeBackup(text);
    return write({ ...scene, id: 'local:' + crypto.randomUUID(), kind: 'scene', createdAt: new Date().toISOString() }, 0);
  }
  async function configure(namespace) { if (opened) (await opened).close(); opened = null; database = "armagedom_local_scenes:" + namespace; }
  return Object.freeze({ configure, read, list, write, cleanData, decodeBackup, exportScene, importScene });
})();
