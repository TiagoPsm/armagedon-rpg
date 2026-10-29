/* The master owns scene documents; the existing authenticated relay is ephemeral. */
window.MesaLocalSession = (() => {
  let active = false, installed = false, denied = false, host = false, current = null, serial = Promise.resolve();
  const journalWriter = crypto.randomUUID(); let journalPrefix = '';
  const revisions = new Map(), requests = new Map(), chunks = new Map();
  const notify = message => window.UI?.toast?.(message, { kicker: '// Cenas locais' });
  const master = () => isMaster();
  const send = payload => window.APP.sendRealtime(payload);
  const record = async id => {
    const scene = await MesaLocalStore.read(id);
    if (!scene || scene.deleted) throw new Error('Cena local inexistente.');
    if (!revisions.has(scene.id)) revisions.set(scene.id, scene.revision); return scene;
  };
  function enqueue(fn) { const job = serial.then(fn); serial = job.catch(() => {}); return job; }
  function requireMaster() {
    if (!master() || denied) throw new Error('Somente o mestre anfitriao pode alterar as cenas locais.');
  }
  async function update(scene) {
    requireMaster();
    const expected = revisions.get(scene.id) ?? 0;
    const saved = await MesaLocalStore.write(scene, expected);
    revisions.set(saved.id, saved.revision);
    try {
    const key = journalPrefix + scene.id, pending = readJsonStorage(key, null);
    if (pending?.writer === journalWriter && pending.revision === expected) {
      if ((pending.data?.sceneVersion || 0) <= (saved.data?.sceneVersion || 0)) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ ...pending, revision: saved.revision }));
    }
    } catch (error) { console.warn("Falha ao atualizar rascunho de seguranca; documento IndexedDB salvo.", error); }
    return saved;
  }
  async function getScene(id) {
    if (!master()) return current || { id: 'default', name: 'Aguardando mestre', data: { tokens: [] } };
    const meta = await MesaLocalStore.read('$meta');
    const scene = await record(id || meta?.activeId || 'default');
    return { ...scene, active: scene.id === (meta?.activeId || 'default') };
  }
  async function select(id) {
    requireMaster(); await flush();
    const scene = await record(id), meta = await MesaLocalStore.read('$meta');
    await MesaLocalStore.write({ id: '$meta', activeId: id }, meta?.revision || 0);
    current = scene; revisions.set(scene.id, scene.revision);
    await handleMesaSceneSwitch({ local: true, sceneId: id, sceneName: scene.name });
    await snapshot(); return scene;
  }
  async function save(data, options = {}) {
    return enqueue(async () => {
      const scene = await MesaLocalStore.read(options.sceneId || state.sceneId || 'default');
      if (!scene || scene.deleted) throw new Error('Cena local inexistente.');
      if ((data.sceneVersion || 0) < (scene.data?.sceneVersion || 0)) return scene;
      const saved = await update({ ...scene, data: MesaLocalStore.cleanData(data) });
      if (saved.id === state.sceneId) current = saved;
      return saved;
    });
  }
  let syncing = false;
  const snapshotAudience = new Set();
  async function snapshot(to = '') {
    snapshotAudience.add(to || '*');
    if (syncing) return;
    syncing = true;
    try { while (snapshotAudience.size) {
      const audience = snapshotAudience.has('*') ? [''] : [...snapshotAudience]; snapshotAudience.clear();
      for (const target of audience) await snapshotOnce(target);
    } }
    finally { syncing = false; }
  }
  async function snapshotOnce(to) {
    await serial;
    if (!active || !master() || !host || denied) return;
    const meta = await MesaLocalStore.read('$meta');
    const scene = await MesaLocalStore.read(meta?.activeId || 'default');
    if (!scene) return;
    const data = MesaLocalStore.cleanData(scene.data);
    data.tokens = (data.tokens || []).filter(token => token.layer !== 'dm' && token.visibleToPlayers !== false).map(token => token.statsVisibleToPlayers ? token : { ...token, currentLife: null, maxLife: null, currentIntegrity: null, maxIntegrity: null });
    data.drawings = (data.drawings || []).filter(stroke => stroke.layer !== 'dm');
    if (data.map) data.map = { id: data.map.id, hash: data.map.hash, localOnly: true, fit: data.map.fit, transform: data.map.transform };
    const text = JSON.stringify({ id: scene.id, name: scene.name, data }), transferId = crypto.randomUUID();
    if (text.length > 2 * 1024 * 1024) { notify('Cena grande demais para sincronizar. O backup local foi preservado.'); return; }
    const total = Math.max(1, Math.ceil(text.length / 12000));
    for (let i = 0; i < total; i++) {
      if (!await send({ type: 'mesa:host:chunk', to, transferId, index: i, total, text: text.slice(i * 12000, (i + 1) * 12000) })) break;
      if (i + 1 < total) await new Promise(resolve => setTimeout(resolve, 45));
    }
  }
  async function receiveChunk(message) {
    if (master() || message.actor?.role !== 'master' || !Number.isInteger(message.total) || message.total < 1 || message.total > 175 ||
        !Number.isInteger(message.index) || message.index < 0 || message.index >= message.total || typeof message.text !== 'string' || message.text.length > 16000) return;
    if (!chunks.has(message.transferId)) { chunks.clear(); chunks.set(message.transferId, { parts: [], total: message.total }); }
    const pending = chunks.get(message.transferId); if (pending.total !== message.total) return;
    pending.parts[message.index] = message.text;
    if (pending.parts.filter(x => x !== undefined).length !== pending.total) return;
    chunks.clear();
    try {
      const scene = JSON.parse(pending.parts.join(''));
      if (!scene?.id || !Array.isArray(scene.data?.tokens)) return;
      if (current?.id === scene.id && (current.data.sceneVersion || 0) > (scene.data.sceneVersion || 0)) return;
      current = scene;
      if (state.sceneId !== scene.id) await handleMesaSceneSwitch({ local: true, sceneId: scene.id, sceneName: scene.name });
      else await applyRemoteMesaSceneSnapshot(scene.data, { movement: scene.movement });
      state.scenePersistence = 'local';
      if (scene.data.map?.hash && mesaMapState.db && !await findCachedMapByHash(scene.data.map.hash)) {
        await send({ type: 'mesa:map:need', to: message.actor.username, hash: scene.data.map.hash });
      }
    } catch (error) { notify('Nao foi possivel receber a cena. Solicite nova sincronizacao.'); }
  }
  async function requestMove(token, next) {
    const requestId = crypto.randomUUID();
    if (requests.size) { notify('Aguarde a confirmacao do movimento anterior.'); return false; }
    const accepted = await send({ type: 'mesa:host:move', requestId, sceneId: state.sceneId, tokenId: token.id,
      origin: { x: token.x, y: token.y }, path: next.path, tokenScale: next.tokenScale });
    if (!accepted) { notify('Mestre indisponivel. Nenhum movimento foi confirmado.'); return false; }
    requests.set(requestId, setTimeout(() => { requests.delete(requestId); notify('Sem confirmacao do mestre. A posicao anterior foi mantida.'); }, 10000));
    return true;
  }
  async function approve(message, local = false) {
    if (!master() || (!local && !host) || denied) return;
    return enqueue(async () => {
      const reject = reason => local ? notify(reason) : send({ type: 'mesa:host:decision', requestId: message.requestId, to: message.actor?.username, ok: false, reason });
      const token = findToken(message.tokenId), actor = normalizeMesaUsername(message.actor?.username);
      if (message.sceneId !== state.sceneId || !token || (!local && token.layer === 'dm') || (!local && (token.type !== 'player' || normalizeMesaUsername(token.ownerUsername || token.characterKey) !== actor || state.playersMoveLocked))) return reject('Movimento nao autorizado pelo mestre.');
      if (!message.origin || !Number.isFinite(message.origin.x) || !Number.isFinite(message.origin.y) || (message.tokenScale != null && !Number.isFinite(message.tokenScale)) || Math.hypot(message.origin.x - token.x, message.origin.y - token.y) > .025 || !Array.isArray(message.path) ||
          !message.path.length || message.path.length > 256 || message.path.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > 100 || p.y > 100)) return reject('Posicao ou percurso desatualizado.');
      const origin = { x: token.x, y: token.y };
      const next = MesaMovement.destination({ tokenId: token.id, origin, waypoints: message.path.slice(0, -1) }, message.path.at(-1));
      if (message.tokenScale != null) next.tokenScale = clampMesaTokenScale(message.tokenScale);
      const version = Math.max(state.sceneVersion + 1, Date.now());
      const movement = MesaMovementRules.create(token.id, origin, next.path, version, getMesaDomRef('stage').clientHeight / getMesaDomRef('stage').clientWidth);
      if (!movement) return reject('Percurso invalido.');
      const previous = { ...token }, oldVersion = state.sceneVersion;
      Object.assign(token, { x: next.x, y: next.y, tokenScale: next.tokenScale, order: getNextOrder() }); state.sceneVersion = version;
      try {
        const scene = await MesaLocalStore.read(state.sceneId);
        current = await update({ ...scene, data: MesaLocalStore.cleanData(createMesaScenePayloadFromState()) });
      } catch (error) { Object.assign(token, previous); state.sceneVersion = oldVersion; notify(error.message); return reject('Falha ao salvar no computador do mestre.'); }
      MesaMovement.animate(origin, token, movement.path, movement.duration);
      if (!local) await send({ type: 'mesa:host:decision', requestId: message.requestId, to: actor, ok: true });
      if (token.layer !== 'dm') await send({ type: 'mesa:token:move', sceneVersion: version, tokenId: token.id, characterKey: token.characterKey, x: token.x, y: token.y, tokenScale: token.tokenScale, movement });
      scheduleMesaRender({ stage: true, inspector: true });
    });
  }
  async function init() {
    if (installed || window.ARMAGEDON_CONFIG?.mesaLocalScenes !== true) return;
    installed = active = true;
    const namespace = String(state.session?.username || 'local') + ':' + String(window.ARMAGEDON_CONFIG?.apiBaseUrl || '');
    journalPrefix = 'armagedom-local-journal:' + namespace + ':';
    await MesaLocalStore.configure(namespace);
    if (master()) {
      if (!await MesaLocalStore.read('default')) {
        const cached = readJsonStorage(mesaSceneStorageKey(), { tokens: [] });
        await MesaLocalStore.write({ id: 'default', kind: 'scene', name: 'Cena local', data: MesaLocalStore.cleanData(cached), createdAt: new Date().toISOString() }, 0);
      }
    }
    if (master()) {
      const meta = await MesaLocalStore.read('$meta'), id = meta?.activeId || 'default';
      const saved = await MesaLocalStore.read(id), pending = readJsonStorage(journalPrefix + id, null);
      if (saved && pending?.revision === saved.revision && Array.isArray(pending.data?.tokens) && (pending.data.sceneVersion || 0) >= (saved.data?.sceneVersion || 0)) {
        await MesaLocalStore.write({ ...saved, data: MesaLocalStore.cleanData(pending.data) }, saved.revision);
        localStorage.removeItem(journalPrefix + id); notify('Cena recuperada do salvamento de seguranca local.');
      }
    }
    const app = window.APP;
    app.getMesaScene = getScene;
    app.saveMesaScene = save;
    app.getMesaScenes = async () => {
      requireMaster(); const docs = await MesaLocalStore.list(), meta = docs.find(s => s.id === '$meta');
      return { scenes: docs.filter(s => s.kind === 'scene' && !s.deleted).map(s => ({ ...s, active: s.id === (meta?.activeId || 'default'), tokenCount: s.data?.tokens?.length || 0 })), folders: docs.filter(s => s.kind === 'folder' && !s.deleted) };
    };
    app.createMesaScene = async name => { requireMaster(); return update({ id: 'local:' + crypto.randomUUID(), kind: 'scene', name, data: { tokens: [] }, createdAt: new Date().toISOString() }); };
    app.renameMesaScene = async (id, name) => update({ ...await record(id), name });
    app.deleteMesaScene = async id => { if ((await getScene()).id === id) throw new Error('Ative outra cena antes de excluir esta.'); return update({ ...await record(id), deleted: true }); };
    app.activateMesaScene = select;
    app.createMesaSceneFolder = async name => update({ id: 'folder:' + crypto.randomUUID(), name, kind: 'folder' });
    app.renameMesaSceneFolder = async (id, name) => update({ ...await record(id), name });
    app.deleteMesaSceneFolder = async id => {
      requireMaster(); for (const scene of (await app.getMesaScenes()).scenes.filter(s => s.folderId === id)) await update({ ...await record(scene.id), folderId: '' });
      return update({ ...await record(id), deleted: true });
    };
    app.setMesaSceneFolder = async (id, folderId) => { if (folderId) await record(folderId); return update({ ...await record(id), folderId }); };
    app.on('mesa:host:status', message => {
      host = message.ok === true; denied = master() && !host;
      if (denied) notify('Ja existe outro mestre anfitriao conectado. Esta aba nao pode salvar cenas.');
      if (!master() && !message.ok) {
        for (const timer of requests.values()) clearTimeout(timer); requests.clear();
        notify('Mestre anfitriao desconectado. Aguarde para receber a cena.');
      }
      if (host) void snapshot();
    });
    app.on('mesa:host:request', message => { if (host) void snapshot(message.actor?.username); });
    app.on('mesa:host:chunk', message => { void receiveChunk(message); });
    app.on('mesa:host:move', message => { void approve(message).catch(error => notify(error.message)); });
    app.on('mesa:host:decision', message => {
      if (message.to !== state.session?.username || !requests.has(message.requestId)) return;
      clearTimeout(requests.get(message.requestId)); requests.delete(message.requestId);
      if (!message.ok) notify(message.reason || 'Movimento recusado pelo mestre.');
    });
    app.on('mesa:ready', () => { void ready(); });
    app.on('socket:disconnect', () => { host = false; for (const timer of requests.values()) clearTimeout(timer); requests.clear(); });

  }
  async function ready() {
    if (!active) return;
    await send({ type: master() ? 'mesa:host:claim' : 'mesa:host:request' });
  }
  async function flush() {
    flushPersistState();
    while (mesaRemotePersistInFlight || pendingRemotePersistPayload) await new Promise(resolve => setTimeout(resolve, 10));
    await serial;
  }
  function afterDelta() { if (active && !master() && current) current.data = MesaLocalStore.cleanData(createMesaScenePayloadFromState()); }
  function requestResize(token) {
    const previous = current?.data?.tokens?.find(item => item.id === token.id);
    if (!previous) { notify('Aguarde o estado confirmado pelo mestre.'); return false; }
    const next = { path: [{ x: token.x, y: token.y }], tokenScale: token.tokenScale };
    Object.assign(token, { x: previous.x, y: previous.y, tokenScale: previous.tokenScale }); renderStage();
    return requestMove(token, next);
  }
  function commitMove(token, next) { return approve({ sceneId: state.sceneId, tokenId: token.id, origin: { x: token.x, y: token.y }, path: next.path, tokenScale: next.tokenScale, actor: { role: 'master', username: state.session.username } }, true); }
  function journal(data) {
    if (!active || !master() || denied) return;
    localStorage.setItem(journalPrefix + state.sceneId, JSON.stringify({ writer: journalWriter, revision: revisions.get(state.sceneId) ?? 0, data: MesaLocalStore.cleanData(data) }));
  }
  return { journal, commitMove, afterDelta, requestResize, init, ready, snapshot, requestMove, save, get isHost() { return host; }, get active() { return active; } };
})();
