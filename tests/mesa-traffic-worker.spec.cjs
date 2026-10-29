const { test, expect } = require('@playwright/test');
const API = process.env.ARMAGEDON_LOCAL_WORKER;
test.skip(!API, 'Exige o runner de Worker local descartavel.');
test('snapshot para jogador entrando nao retransmite a cena aos outros cinco', async ({ request }) => {
  const login = async (username, password) => (await (await request.post(API + '/auth/login', { data: { username, password } })).json()).token;
  const token = await login('mestre', process.env.ARMAGEDON_LOCAL_MASTER_PASSWORD), peers = [];
  const connect = async jwt => {
    const url = new URL(API + '/mesa/realtime'); url.protocol = 'ws:'; url.searchParams.set('token', jwt);
    const messages = [], ws = new WebSocket(url); peers.push(ws);
    ws.addEventListener('message', event => messages.push(JSON.parse(event.data)));
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    return { ws, messages };
  };
  try {
    const host = await connect(token); host.ws.send(JSON.stringify({ type: 'mesa:host:claim' }));
    await expect.poll(() => host.messages.some(m => m.type === 'mesa:host:status' && m.ok)).toBe(true);
    const players = [];
    for (let i = 0; i < 6; i++) {
      const username = 'traffic' + i, password = process.env.ARMAGEDON_LOCAL_PLAYER_PASSWORD;
      expect((await request.post(API + '/directory/players', { headers: { authorization: 'Bearer ' + token }, data: { username, password, charName: username } })).status()).toBe(201);
      players.push(await connect(await login(username, password)));
    }
    const text = JSON.stringify({ id: 'default', name: 'Traffic', data: { tokens: [], sceneVersion: Date.now() } });
    host.ws.send(JSON.stringify({ type: 'mesa:host:chunk', to: 'traffic0', transferId: 'targeted', index: 0, total: 1, text }));
    await expect.poll(() => players[0].messages.filter(m => m.transferId === 'targeted').length).toBe(1);
    for (const player of players.slice(1)) expect(player.messages.filter(m => m.transferId === 'targeted')).toHaveLength(0);
    host.ws.send(JSON.stringify({ type: 'mesa:host:chunk', transferId: 'broadcast', index: 0, total: 1, text }));
    for (const player of players) await expect.poll(() => player.messages.filter(m => m.transferId === 'broadcast').length).toBe(1);
    // Wait for a later message on every socket before ruling out unwanted
    // deliveries; an immediate absence check alone can miss queued messages.
    for (const player of players.slice(1)) expect(player.messages.filter(m => m.transferId === 'targeted')).toHaveLength(0);
    const bytes = new TextEncoder().encode(text).byteLength;
    console.log(JSON.stringify({ players: 6, targetedDeliveries: 1, broadcastDeliveries: 6, documentBytes: bytes, targetedDocumentBytes: bytes, broadcastDocumentBytes: bytes * 6 }));
  } finally { for (const ws of peers) ws.close(); }
});
