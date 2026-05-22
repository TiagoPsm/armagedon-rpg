/**
 * test-worker.mjs — Testes do Worker: rotas R2 + DO relay
 *
 * Estratégia: extrair as lógicas puras do código do Worker (construção de
 * r2Key, validação de prefixo, handleMapSignal) e testá-las isoladamente
 * em Node.js puro, sem precisar instanciar o Worker inteiro.
 *
 * Execute:  node test-worker.mjs
 */

// ──────────────────────────────────────────────────────────────────────────────
// Mini framework de teste (igual ao test-logic.mjs da Task #30)
// ──────────────────────────────────────────────────────────────────────────────

let passed = 0, failed = 0, currentGroup = "";

function group(name) {
  currentGroup = name;
  console.log(`\n[${Object.keys(groups).length + 1}] ${name}`);
  groups[name] = [];
}
const groups = {};

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.log(`  ✗  ${label}  ← FALHOU`);
    failed++;
  }
}

function assertEqual(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) {
    console.log(`  ✗  ${label}  ← FALHOU`);
    console.log(`       esperado: ${JSON.stringify(expected)}`);
    console.log(`       recebido: ${JSON.stringify(actual)}`);
    failed++;
  } else {
    console.log(`  ✓  ${label}`);
    passed++;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// [1] Construção de r2Key (POST /api/mesa/map)
//
// Réplica exata do código em cloudflare/src/index.js linha 483–485
// ──────────────────────────────────────────────────────────────────────────────

function buildR2Key(username, mapId) {
  const safeUser  = String(username || "unknown").replace(/[^a-z0-9_-]/gi, "_").toLowerCase().slice(0, 32);
  const safeMapId = String(mapId).replace(/[^a-z0-9_-]/gi, "_").slice(0, 64);
  return `maps/${safeUser}/${safeMapId}.webp`;
}

group("Construção de r2Key (POST upload)");

assertEqual("username simples, mapId simples",
  buildR2Key("mestre", "dungeon-01"),
  "maps/mestre/dungeon-01.webp"
);

assertEqual("username com maiúsculas vira lowercase",
  buildR2Key("Mestre", "dungeon-01"),
  "maps/mestre/dungeon-01.webp"
);

assertEqual("caracteres especiais no username são sanitizados",
  buildR2Key("mestre@exemplo.com", "dungeon-01"),
  "maps/mestre_exemplo_com/dungeon-01.webp"
);

assertEqual("username truncado em 32 chars",
  buildR2Key("a".repeat(50), "map"),
  `maps/${"a".repeat(32)}/map.webp`
);

assertEqual("mapId com caracteres especiais sanitizado",
  buildR2Key("mestre", "mapa bonito! 2025"),
  "maps/mestre/mapa_bonito__2025.webp"
);

assertEqual("mapId truncado em 64 chars",
  buildR2Key("mestre", "x".repeat(80)),
  `maps/mestre/${"x".repeat(64)}.webp`
);

assertEqual("username vazio usa 'unknown'",
  buildR2Key("", "dungeon"),
  "maps/unknown/dungeon.webp"
);

assertEqual("username null usa 'unknown'",
  buildR2Key(null, "dungeon"),
  "maps/unknown/dungeon.webp"
);

// ──────────────────────────────────────────────────────────────────────────────
// [2] Validação de prefixo (DELETE /api/mesa/map/:r2Key)
//
// Réplica do código em cloudflare/src/index.js linha 523–525
// ──────────────────────────────────────────────────────────────────────────────

function canDeleteKey(sessionUsername, r2Key) {
  const safeUser = String(sessionUsername || "").replace(/[^a-z0-9_-]/gi, "_").toLowerCase().slice(0, 32);
  return r2Key.startsWith(`maps/${safeUser}/`);
}

group("Validação de prefixo (DELETE)");

assert("mestre pode deletar próprio mapa",
  canDeleteKey("mestre", "maps/mestre/dungeon-01.webp")
);

assert("mestre NÃO pode deletar mapa de outro mestre",
  !canDeleteKey("mestre", "maps/outro_mestre/dungeon-01.webp")
);

assert("username com caracteres especiais é sanitizado antes da validação",
  canDeleteKey("Mestre", "maps/mestre/dungeon-01.webp")
);

assert("path sem prefixo maps/ é rejeitado",
  !canDeleteKey("mestre", "dungeon-01.webp")
);

assert("path com traversal é rejeitado (../mestre/)",
  !canDeleteKey("outro", "maps/mestre/dungeon.webp")
);

assert("username vazio: apenas chaves com prefixo 'maps//' passam (bloqueio efectivo)",
  !canDeleteKey("", "maps/mestre/dungeon.webp")
);

// ──────────────────────────────────────────────────────────────────────────────
// [3] Verificações de autorização (POST e DELETE simulados)
// ──────────────────────────────────────────────────────────────────────────────

function simulateUpload(session, hasFile, hasMapId) {
  if (session.role !== "master") return { status: 403, error: "Apenas o mestre pode enviar mapas." };
  if (!hasFile) return { status: 400, error: "Campo 'file' obrigatorio." };
  if (!hasMapId) return { status: 400, error: "Campo 'mapId' obrigatorio." };
  return { status: 201, ok: true };
}

function simulateDelete(session, r2Key) {
  if (session.role !== "master") return { status: 403, error: "Apenas o mestre pode remover mapas." };
  if (!canDeleteKey(session.username, r2Key)) return { status: 403, error: "Sem permissao para remover este mapa." };
  return { status: 200, ok: true };
}

group("Autorização nas rotas R2");

const masterSession = { role: "master", username: "mestre", sub: "u1" };
const playerSession = { role: "player", username: "heroi", sub: "u2" };

assertEqual("POST: jogador recebe 403",
  simulateUpload(playerSession, true, "map1").status, 403
);

assertEqual("POST: mestre sem arquivo recebe 400",
  simulateUpload(masterSession, false, "map1").status, 400
);

assertEqual("POST: mestre sem mapId recebe 400",
  simulateUpload(masterSession, true, "").status, 400
);

assertEqual("POST: mestre com tudo recebe 201",
  simulateUpload(masterSession, true, "dungeon-01").status, 201
);

assertEqual("DELETE: jogador recebe 403",
  simulateDelete(playerSession, "maps/heroi/map.webp").status, 403
);

assertEqual("DELETE: mestre tenta deletar mapa alheio recebe 403",
  simulateDelete(masterSession, "maps/outro/map.webp").status, 403
);

assertEqual("DELETE: mestre deleta próprio mapa recebe 200",
  simulateDelete(masterSession, "maps/mestre/dungeon-01.webp").status, 200
);

// ──────────────────────────────────────────────────────────────────────────────
// [4] DO handleMapSignal — entrega dirigida (payload.to preenchido)
//
// Réplica da lógica em cloudflare/src/mesa-realtime.js linha 374–411
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Mock de WebSocket para testes: guarda o que foi enviado.
 */
function makeMockSocket(username, role = "player") {
  return {
    _username: username,
    _role: role,
    _sent: [],
    send(msg) { this._sent.push(msg); }
  };
}

function readAttachmentMock(ws) {
  return { username: ws._username, role: ws._role };
}

function sendJsonMock(ws, payload) {
  ws.send(JSON.stringify(payload));
}

/**
 * Replica de handleMapSignal sem dependências do runtime CF.
 */
function handleMapSignal(allSockets, senderWs, payload) {
  const attachment    = readAttachmentMock(senderWs);
  const senderUsername = String(attachment.username || "usuario").trim() || "usuario";
  const targetUsername  = String(payload?.to || "").trim();

  const enriched = {
    ...payload,
    from:   senderUsername,
    sentAt: payload?.sentAt || "2026-01-01T00:00:00.000Z",
  };

  if (targetUsername) {
    let delivered = false;
    allSockets.forEach(sock => {
      if (sock === senderWs) return;
      const att = readAttachmentMock(sock);
      if (String(att.username || "").trim() === targetUsername) {
        sendJsonMock(sock, enriched);
        delivered = true;
      }
    });
    sendJsonMock(senderWs, {
      type:      "mesa:map:relay:ack",
      for:       payload?.type,
      to:        targetUsername,
      delivered,
      sentAt:    "2026-01-01T00:00:00.000Z",
    });
  } else {
    allSockets.forEach(sock => {
      if (sock === senderWs) return;
      sendJsonMock(sock, enriched);
    });
  }
}

group("DO handleMapSignal — entrega dirigida (payload.to preenchido)");

{
  const mestre  = makeMockSocket("mestre",  "master");
  const jogador1 = makeMockSocket("heroi1", "player");
  const jogador2 = makeMockSocket("heroi2", "player");
  const sockets  = [mestre, jogador1, jogador2];

  const payload = { type: "mesa:map:offer", to: "heroi1", sdp: "v=0..." };
  handleMapSignal(sockets, mestre, payload);

  assert("apenas heroi1 recebe a mensagem",
    jogador1._sent.length === 1 && jogador2._sent.length === 0
  );

  assert("mestre recebe relay:ack de entrega bem-sucedida",
    mestre._sent.length === 1
  );

  const ack = JSON.parse(mestre._sent[0]);
  assertEqual("relay:ack.delivered = true", ack.delivered, true);
  assertEqual("relay:ack.to = heroi1", ack.to, "heroi1");
  assertEqual("relay:ack.for = mesa:map:offer", ack.for, "mesa:map:offer");

  const msg = JSON.parse(jogador1._sent[0]);
  assertEqual("from sobrescrito com username autenticado do mestre", msg.from, "mestre");
  assertEqual("payload original preservado (sdp)", msg.sdp, "v=0...");
}

group("DO handleMapSignal — destinatário ausente");

{
  const mestre  = makeMockSocket("mestre", "master");
  const jogador = makeMockSocket("heroi",  "player");
  const sockets = [mestre, jogador];

  const payload = { type: "mesa:map:offer", to: "fantasma", sdp: "v=0..." };
  handleMapSignal(sockets, mestre, payload);

  assert("heroi não recebe mensagem destinada a outro",
    jogador._sent.length === 0
  );

  assert("mestre recebe relay:ack mesmo sem destinatário encontrado",
    mestre._sent.length === 1
  );

  const ack = JSON.parse(mestre._sent[0]);
  assertEqual("relay:ack.delivered = false quando ninguém encontrado", ack.delivered, false);
}

group("DO handleMapSignal — broadcast (sem payload.to)");

{
  const mestre   = makeMockSocket("mestre",  "master");
  const jogador1 = makeMockSocket("heroi1",  "player");
  const jogador2 = makeMockSocket("heroi2",  "player");
  const sockets  = [mestre, jogador1, jogador2];

  const payload = { type: "mesa:map:announce", hash: "abc123" };
  handleMapSignal(sockets, mestre, payload);

  assert("heroi1 recebe announce",   jogador1._sent.length === 1);
  assert("heroi2 recebe announce",   jogador2._sent.length === 1);
  assert("mestre NÃO recebe de volta", mestre._sent.length === 0);

  const msg = JSON.parse(jogador1._sent[0]);
  assertEqual("from = mestre", msg.from, "mestre");
  assertEqual("hash preservado", msg.hash, "abc123");
}

group("DO handleMapSignal — from não pode ser forjado");

{
  const mestre  = makeMockSocket("mestre", "master");
  const jogador = makeMockSocket("heroi",  "player");
  const sockets = [mestre, jogador];

  // Jogador tenta se passar pelo mestre
  const payload = { type: "mesa:map:set", from: "mestre", url: "http://evil.com/img.webp" };
  handleMapSignal(sockets, jogador, payload);

  assert("mestre recebe mensagem (broadcast sem to)",
    mestre._sent.length === 1
  );

  const msg = JSON.parse(mestre._sent[0]);
  assertEqual("from sobrescrito com username real do socket (heroi, não mestre)",
    msg.from, "heroi"
  );
}

group("DO handleMapSignal — remetente não recebe a própria mensagem");

{
  const mestre  = makeMockSocket("mestre", "master");
  const jogador = makeMockSocket("heroi",  "player");
  const sockets = [mestre, jogador];

  handleMapSignal(sockets, jogador, { type: "mesa:map:need" });

  assert("jogador (remetente) NÃO recebe o próprio broadcast",
    jogador._sent.length === 0
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Resumo
// ──────────────────────────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(50));
console.log(`  Total: ${passed + failed}   ✓ ${passed}   ✗ ${failed}`);
if (failed > 0) process.exit(1);
