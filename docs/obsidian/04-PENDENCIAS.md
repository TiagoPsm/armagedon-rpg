# Pendencias e Riscos

## Pendencias Ativas

- Monitorar aviso do GitHub Actions sobre deprecacao futura de Actions em Node.js 20.
- Validar periodicamente se GitHub Pages continua em `build_type: workflow`.
- Manter `docs/obsidian/` atualizado apos decisoes importantes.
- Revisar em navegador real apos mudancas visuais grandes, especialmente mobile.
- Validar visualmente a Mesa logada no site oficial apos GitHub Pages publicar a correcao `window.AUTH = AUTH`.
- Testar com mestre e jogador conectados ao mesmo tempo: adicionar, mover, remover token e confirmar sincronizacao sem recarregar.

## Riscos Tecnicos

- Ordem de scripts da ficha e da mesa e sensivel.
- Muitas regras CSS foram acumuladas por overrides; novas mudancas devem ser pontuais.
- `localStorage` ainda atua como cache/fallback e pode divergir do D1 se a API cair.
- Cena remota vazia agora pode ser uma escolha real do mestre; nao tratar automaticamente toda cena vazia como falha visual.
- WebSocket depende do Worker publicado com binding `MESA_REALTIME`; se a conexao cair, a cena ainda carrega via `GET /api/mesa/scene`.
- Backend Express em `server/` e legado; nao validar producao apenas por ele.

## Possiveis Melhorias Futuras

- Criar um indice automatico de arquivos e responsabilidades.
- Criar uma nota de "contratos de API" do Worker.
- Adicionar checklist de QA por pagina.
- Integrar Obsidian via plugin/API local ou MCP se isso trouxer ganho real.
- Exibir presenca online na UI da Mesa se isso for util para a mesa oficial.

## Nao Fazer Sem Confirmar

- Apagar arquivos grandes locais.
- Redesenhar estrutura das paginas.
- Alterar regras de gameplay.
- Mudar persistencia ou autorizacao.
- Trocar stack de publicacao.
