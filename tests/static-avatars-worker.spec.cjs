const { test, expect } = require('@playwright/test');
const catalog = require('../assets/avatars/manifest.json');
const API = process.env.ARMAGEDON_LOCAL_WORKER;
test.skip(!API, 'Exige runner local --static; nunca usar contra producao.');
test('Worker em modo estatico atende URLs antigas sem precisar dos objetos R2', async ({ request }) => {
  const key = Object.keys(catalog.entries)[0];
  const response = await request.get(API + '/avatars/' + encodeURIComponent(key), { maxRedirects: 0 });
  expect(response.status()).toBe(302); expect(response.headers().location).toBe(catalog.origin + '/' + catalog.entries[key].path);
  expect((await request.get(API + '/avatars/missing-object')).status()).toBe(404);
  expect((await request.get(API + '/mesa/map/maps/master/missing.webp')).status()).toBe(410);
});
test('escritas antigas sao recusadas antes de modificar ficha ou R2', async ({ request }) => {
  const login = await (await request.post(API + '/auth/login', { data: { username: 'mestre', password: process.env.ARMAGEDON_LOCAL_MASTER_PASSWORD } })).json();
  for (const path of ['/avatars/jogador1', '/avatars/echo/missing', '/maintenance/migrate-avatars']) {
    expect((await request.post(API + path, { headers: { authorization: 'Bearer ' + login.token } })).status()).toBe(410);
    expect((await request.post(API + path)).status()).toBe(401);
  }
  const headers = { authorization: 'Bearer ' + login.token };
  const before = await (await request.get(API + '/characters/jogador1', { headers })).json();
  const update = await request.put(API + '/characters/jogador1', { headers, data: { data: { ...before.data, avatar: 'data:image/webp;base64,YWJj', charNotes: 'must-not-save' } } });
  expect(update.status()).toBe(409);
  expect(await (await request.get(API + '/characters/jogador1', { headers })).json()).toEqual(before);

  const monsterResponse = await request.post(API + '/directory/monsters', { headers, data: { name: 'Static avatar fixture' } });
  expect(monsterResponse.status()).toBe(201);
  const monster = await monsterResponse.json();
  const award = await request.post(API + '/echos/monster-award', { headers, data: { monsterKey: monster.key, targetKey: 'jogador1', rarity: 'comum' } });
  expect(award.status()).toBe(201);
  const { echo } = await award.json();
  const echoBefore = await (await request.get(API + '/echos/' + echo.id, { headers })).json();
  expect((await request.put(API + '/echos/' + echo.id, { headers, data: { avatar: 'data:image/webp;base64,YWJj', notes: 'must-not-save' } })).status()).toBe(409);
  expect(await (await request.get(API + '/echos/' + echo.id, { headers })).json()).toEqual(echoBefore);
});
