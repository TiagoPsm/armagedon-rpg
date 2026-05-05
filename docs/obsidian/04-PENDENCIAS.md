# Pendencias e Riscos

## Pendencias Ativas

- Monitorar aviso do GitHub Actions sobre deprecacao futura de Actions em Node.js 20.
- Validar periodicamente se GitHub Pages continua em `build_type: workflow`.
- Manter `docs/obsidian/` atualizado apos decisoes importantes.
- Revisar em navegador real apos mudancas visuais grandes, especialmente mobile.
- Validar visualmente a Mesa logada no site oficial apos publicar cache bust `2026-05-05-mesa-light-1`.
- Testar com mestre e jogador conectados ao mesmo tempo: adicionar, mover, remover token e confirmar sincronizacao sem recarregar e sem lentidao perceptivel.

## Riscos Tecnicos

- Ordem de scripts da ficha e da mesa e sensivel.
- Muitas regras CSS foram acumuladas por overrides; novas mudancas devem ser pontuais.
- `localStorage` ainda atua como cache/fallback e pode divergir do D1 se a API cair.
- Cena remota vazia agora pode ser uma escolha real do mestre; nao tratar automaticamente toda cena vazia como falha visual.
- WebSocket depende do Worker publicado com binding `MESA_REALTIME`; se a conexao cair, a cena ainda carrega via `GET /api/mesa/scene`.
- Dedupe de cena no frontend reduz `PUT` redundante; mudancas futuras nao devem recolocar save remoto em cada movimento de drag.
- Render incremental do palco depende de `data-token-id`; alterar markup de token exige preservar esse contrato.
- Backend Express em `server/` e legado; nao validar producao apenas por ele.

## Possiveis Melhorias Futuras

- Criar um indice automatico de arquivos e responsabilidades.
- Criar uma nota de "contratos de API" do Worker.
- Adicionar checklist de QA por pagina.
- Integrar Obsidian via plugin/API local ou MCP se isso trouxer ganho real.
- Exibir presenca online na UI da Mesa se isso for util para a mesa oficial.
- Criar contador/debug temporario de renders para auditorias futuras da Mesa.

## Nao Fazer Sem Confirmar

- Apagar arquivos grandes locais.
- Redesenhar estrutura das paginas.
- Alterar regras de gameplay.
- Mudar persistencia ou autorizacao.
- Trocar stack de publicacao.
