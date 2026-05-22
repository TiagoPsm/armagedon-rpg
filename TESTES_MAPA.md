# Roteiro de Testes Manuais — Módulo de Mapa VTT

Execute estes testes **depois** de fazer o deploy do Worker (veja `DEPLOY_FREE.md`).
Abra o DevTools (F12) em todas as abas para ver logs de console e rede.

---

## Pré-requisitos

- Worker deployado com binding R2 `armagedom-maps` criado
- Bucket R2 criado: `wrangler r2 bucket create armagedom-maps`
- Mínimo duas abas abertas em `mesa.html`
- Uma aba logada como **mestre**, outra como **jogador**
- Uma imagem PNG de teste (sugestão: ~2 MB para testar compressão)

---

## 1. Fase 1 — Mapa local (só mestre vê, sem transmissão)

| # | Ação | Resultado esperado |
|---|------|--------------------|
| 1.1 | Na aba mestre, clicar **"Abrir Mapa"** | Seletor de arquivo abre |
| 1.2 | Escolher uma imagem PNG ou JPG qualquer | Mapa aparece no stage do mestre imediatamente |
| 1.3 | No console do mestre, procurar `[MAP] local map ready` | Log presente com hash SHA-256 |
| 1.4 | Na aba do jogador, verificar o stage | Stage do jogador ainda vazio (mapa não foi transmitido) |
| 1.5 | Clicar **"Fechar Mapa"** na aba do mestre | Stage limpa, mapa some |

---

## 2. Fase 2A — Transmissão P2P (WebRTC DataChannel)

> Pré-condição: jogador já está na mesa (WebSocket conectado).

| # | Ação | Resultado esperado |
|---|------|--------------------|
| 2.1 | Mestre abre mapa (PNG ~2 MB) | Console do mestre: `[MAP] compressing to WebP` → `[MAP] compressed: Xkb → Ykb` |
| 2.2 | Aguardar ~2 s | Console mestre: `[MAP] opening P2P to heroi` (ou nome do jogador) |
| 2.3 | Aguardar handshake WebRTC | Console: `[MAP] P2P channel open → heroi` → `[MAP] P2P send done` |
| 2.4 | Na aba jogador | Mapa aparece no stage automaticamente |
| 2.5 | Console do jogador | `[MAP] P2P inbound: Xkb received` → `[MAP] map applied from P2P` |
| 2.6 | Inspecionar aba **Network** do jogador | **Nenhuma** requisição HTTP para `/api/mesa/map` (P2P puro) |
| 2.7 | Fechar aba do jogador e reabrir | Mapa reaparece do cache IndexedDB sem tráfego novo |

---

## 2B — Fallback WS (chunked WebSocket via Durable Object)

> Simule falha P2P bloqueando WebRTC no navegador.
> Chrome: `chrome://flags` → desativar WebRTC. Ou use redes diferentes sem WebRTC.

| # | Ação | Resultado esperado |
|---|------|--------------------|
| 2B.1 | Com WebRTC bloqueado, mestre abre mapa | Console: `[MAP] P2P timeout → falling back to WS chunked` (após ~8 s) |
| 2B.2 | Aguardar envio WS | Console: `[MAP] WS chunk X/N sent` repetindo |
| 2B.3 | Aba jogador | Mapa aparece após recepção de todos os chunks |
| 2B.4 | Console jogador | `[MAP] WS chunks complete, reassembling` → `[MAP] map applied from WS` |
| 2B.5 | Network do jogador | Requisições WebSocket presentes, mas **nenhuma** `/api/mesa/map` GET |

---

## 3. Fase 3 — Fallback R2 (último recurso)

> Simule falha de P2P **e** WS: feche a aba do jogador antes de o mestre abrir o mapa,
> reabra depois de 30 s. Ou bloqueie tanto WebRTC quanto o relay WS no DevTools
> (Network → Block request URL para o endpoint do Worker WS).

| # | Ação | Resultado esperado |
|---|------|--------------------|
| 3.1 | Sem jogadores conectados, mestre abre mapa | Console mestre: `[MAP] no players online, uploading to R2 immediately` |
| 3.2 | Aguardar ~30 s com jogador sem confirmar (`EV_MAP_HAVE`) | Console: `[MAP] R2 fallback triggered` → `[MAP] R2 upload done: maps/mestre/…webp` |
| 3.3 | Jogador entra na mesa depois | Console jogador: `[MAP] received R2 URL` → mapa aparece |
| 3.4 | Network do jogador | GET `/api/mesa/map/maps%2Fmestre%2F….webp` → status 200, content-type `image/webp` |
| 3.5 | Console mestre | `[MAP] R2 key cached: maps/mestre/….webp` |
| 3.6 | Fechar aba do jogador | Console mestre (após ~2 s): `[MAP] player heroi left, deleting R2 if no others` |
| 3.7 | Verificar R2 | `wrangler r2 object list armagedom-maps` → lista **vazia** (ou chave removida) |

---

## 4. Segurança

| # | Cenário | Resultado esperado |
|---|---------|-------------------|
| 4.1 | Jogador tenta POST `/api/mesa/map` via DevTools (fetch) | Resposta `403 Apenas o mestre pode enviar mapas.` |
| 4.2 | Jogador tenta DELETE `/api/mesa/map/maps/mestre/xxx.webp` via fetch | `403 Apenas o mestre pode remover mapas.` |
| 4.3 | Mestre tenta DELETE de mapa de outro mestre: `maps/outro/xxx.webp` | `403 Sem permissao para remover este mapa.` |
| 4.4 | GET sem chave existente: `/api/mesa/map/maps/mestre/nao-existe.webp` | `404 Mapa nao encontrado.` |
| 4.5 | POST sem campo `file` | `400 Campo 'file' obrigatorio.` |
| 4.6 | POST sem campo `mapId` | `400 Campo 'mapId' obrigatorio.` |

**Snippet para o console do DevTools (jogador logado):**
```js
// Teste 4.1 — upload não autorizado
const fd = new FormData();
fd.append("file", new File(["x"], "evil.webp"));
fd.append("mapId", "evil");
fetch("/api/mesa/map", {
  method: "POST",
  headers: { Authorization: "Bearer " + localStorage.getItem("tc_session_token") },
  body: fd
}).then(r => r.json()).then(console.log);
// esperado: { error: "Apenas o mestre pode enviar mapas." }
```

---

## 5. Cache IndexedDB (mesmo mapa não é re-baixado)

| # | Ação | Resultado esperado |
|---|------|--------------------|
| 5.1 | Jogador recebe mapa via P2P/WS/R2 | Cache salvo no IndexedDB do jogador |
| 5.2 | Recarregar aba do jogador (F5) | Console: `[MAP] cache hit (IndexedDB), skipping download` |
| 5.3 | Na aba Network | Nenhum download de imagem — mapa vem do cache local |
| 5.4 | Mestre troca para mapa diferente (hash diferente) | Jogador baixa novo mapa normalmente |
| 5.5 | Mestre abre o mapa original de volta (mesmo hash) | Console jogador: `[MAP] cache hit` — não baixa de novo |

**Inspecionar cache no DevTools:**
Application → IndexedDB → `mesa-map-cache` → `maps` (ou nome configurado no código)

---

## 6. Multiusuário (2+ jogadores simultâneos)

| # | Ação | Resultado esperado |
|---|------|--------------------|
| 6.1 | Dois jogadores conectados, mestre abre mapa | Console mestre: `[MAP] opening P2P to heroi1` e `[MAP] opening P2P to heroi2` |
| 6.2 | Ambas as abas de jogador recebem mapa | Os dois stages exibem a imagem |
| 6.3 | Fechar só heroi1 | R2 ainda **não** deletado (heroi2 ainda está online) |
| 6.4 | Fechar heroi2 também | R2 deletado agora (último jogador saiu) |

---

## 7. Reconexão automática

| # | Ação | Resultado esperado |
|---|------|--------------------|
| 7.1 | Com mapa exibido no jogador, simular perda de rede (DevTools → Network → Offline) | WebSocket cai |
| 7.2 | Restaurar rede | WebSocket reconecta automaticamente |
| 7.3 | Verificar stage do jogador | Mapa ainda exibido (não sumiu com a reconexão) |
| 7.4 | Mestre troca mapa durante reconexão do jogador | Ao reconectar, jogador recebe o mapa atual |

---

## 8. Performance esperada

| Métrica | Valor alvo |
|---------|-----------|
| PNG 2 MB → WebP comprimido | < 500 KB (compressão ≥ 75%) |
| P2P DataChannel: tempo até mapa aparecer no jogador | < 3 s (LAN) / < 8 s (internet) |
| WS chunked fallback | < 15 s para 500 KB |
| R2 fallback: tempo de upload | < 5 s |
| Cache hit (IndexedDB) | < 200 ms |

---

## Checklist final antes de usar com jogadores reais

- [ ] Fase 1: mapa local OK
- [ ] Fase 2A: P2P transmite para jogador OK
- [ ] Fase 2B: WS fallback funciona OK
- [ ] Fase 3: R2 recebido por jogador OK
- [ ] R2 deletado ao sair da mesa OK
- [ ] 4.1–4.6: todos os 403/400 confirmados OK
- [ ] Cache IndexedDB evita re-download OK
- [ ] Dois jogadores simultâneos OK
- [ ] Worker deployado com `wrangler deploy` (não `wrangler dev`)
