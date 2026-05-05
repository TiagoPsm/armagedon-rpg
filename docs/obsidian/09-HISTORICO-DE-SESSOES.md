# Historico Compacto de Sessoes

Este arquivo resume marcos importantes. Detalhes completos continuam em `DEV_STATUS.md`.

## 2026-05-05 - Mesa Canvas/Worker

- Palco da Mesa ganhou renderer Canvas/Worker com fallback Canvas principal e DOM legado por flag local.
- Tokens deixaram de depender de cards DOM no palco ativo, reduzindo pintura e custo de layout durante drag.
- Drag em Canvas usa hit test por coordenadas, `requestAnimationFrame`, cache de imagens e persistencia completa apenas ao soltar.
- Realtime recebeu deltas internos `mesa:token:*`, `mesa:scene:clear` e `mesa:batch` para reduzir payload em movimento.
- Durable Object continua coordenando presenca e WebSocket; D1 permanece fonte duravel da cena completa.
- Tooling gratuito adicionado: `npm run check:js`, `audit:static`, `build:pages`, `test:mesa` e `perf:mesa`.
- Validado com Playwright funcional/performance e `wrangler deploy --dry-run`.

## 2026-05-05 - Otimizacao Leve Da Mesa

- Mesa manteve visual dark atual, mas reduziu custo interno de render.
- `scheduleMesaRender()` passou a agrupar renders por frame e por area.
- Palco passou a atualizar tokens incrementalmente por `Map<tokenId, element>`.
- Drag atualiza posicao no elemento durante movimento e salva cena apenas ao soltar.
- Dedupe por assinatura estavel evita `PUT /api/mesa/scene` e `mesa:scene` redundantes.
- Roster em cache evita `AUTH.refreshDirectory()` em todo broadcast quando as `characterKey` ja sao conhecidas.
- CSS recebeu containment seguro e `will-change` apenas durante drag.

## 2026-05-05 - Correcao De Sessao Da Mesa

- Corrigido `auth.js` para expor `window.AUTH = AUTH`.
- Causa: Mesa dependia de `window.AUTH`; sem a ponte global podia ficar em `Convidado`/`0` apesar da API e realtime estarem publicados.
- Cache bust de `auth.js` atualizado nos quatro HTMLs.
- Simulacao com sessao real do mestre validou renderizacao de Mestre, 5 tokens e roster carregado.

## 2026-05-04 - Realtime Da Mesa

- Durable Object `MesaRealtimeRoom` criado para WebSocket da Mesa.
- `PUT /api/mesa/scene` passou a salvar no D1 e transmitir `mesa:scene`.
- Frontend trocou Socket.IO antigo por WebSocket nativo.
- Mestre pode limpar a cena e adicionar tokens existentes pelo roster.
- Worker publicado com version ID `2cab1568-cc32-4a79-81d0-07851eac7a4a`.
- Validado: duas conexoes WebSocket receberam `mesa:ready`; broadcast `mesa:scene` chegou com 5 tokens.

## 2026-05-01 - Deploy Visual e Performance

- fundo animado removido do carregamento principal
- fundo preto estatico consolidado
- cursor com brilho carmesim adicionado
- ficha recebeu polimento visual e responsivo
- GitHub Pages corrigido para `build_type: workflow`
- deploy publicado na `main`
- MP4s e `/assets/logo-rpg-armagedon.png` removidos do pacote publicado

Commit:

```text
0c59efd13910681472aec0153ee43d1ee04c3483
```

## 2026-04-30 - Workspace Oficial

- `rpg-campaign-git-sync` consolidado como checkout oficial
- pasta antiga `rpg-campaign` excluida
- regra de atualizar `.md` reforcada

## 2026-04-30 - Revisao Funcional

- varredura estatica de JS e HTML
- correcoes em normalizacao de habilidades no Worker
- correcoes em progressao local de Essencia da Alma
- pendencia identificada no backend Express legado para rota de Essencia da Alma
