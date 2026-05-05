# Historico Compacto de Sessoes

Este arquivo resume marcos importantes. Detalhes completos continuam em `DEV_STATUS.md`.

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
