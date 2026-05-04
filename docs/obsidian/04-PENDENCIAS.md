# Pendencias e Riscos

## Pendencias Ativas

- Monitorar aviso do GitHub Actions sobre deprecacao futura de Actions em Node.js 20.
- Validar periodicamente se GitHub Pages continua em `build_type: workflow`.
- Manter `docs/obsidian/` atualizado apos decisoes importantes.
- Revisar em navegador real apos mudancas visuais grandes, especialmente mobile.
- Validar a Mesa logada apos correcao de tokens: mestre deve ver jogadores, NPCs e monstros; jogador deve carregar a cena salva no D1.

## Riscos Tecnicos

- Ordem de scripts da ficha e da mesa e sensivel.
- Muitas regras CSS foram acumuladas por overrides; novas mudancas devem ser pontuais.
- `localStorage` ainda atua como cache/fallback e pode divergir do D1 se a API cair.
- Cena remota vazia deve ser tratada como estado inicial, nao como falha visual; o mestre repopula e salva a cena quando o roster oficial existe.
- Backend Express em `server/` e legado; nao validar producao apenas por ele.

## Possiveis Melhorias Futuras

- Criar um indice automatico de arquivos e responsabilidades.
- Criar uma nota de "contratos de API" do Worker.
- Adicionar checklist de QA por pagina.
- Integrar Obsidian via plugin/API local ou MCP se isso trouxer ganho real.
- Implementar realtime da Mesa com Durable Objects/WebSocket depois da persistencia D1 estar validada.

## Nao Fazer Sem Confirmar

- Apagar arquivos grandes locais.
- Redesenhar estrutura das paginas.
- Alterar regras de gameplay.
- Mudar persistencia ou autorizacao.
- Trocar stack de publicacao.
