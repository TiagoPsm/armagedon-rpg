# Contexto Atual

Atualizado em 2026-10-29. Historico detalhado em DEV_STATUS.md.

## Implementacao local ainda nao publicada

Cenas em IndexedDB do mestre, backup JSON separado das imagens, recuperacao por rascunho e revisoes contra sobrescrita. Jogadores solicitam percurso; mestre valida e salva antes de confirmar. WebSocket autenticado continua externo. Novos uploads/exclusoes de mapas R2 bloqueados, imagens existentes preservadas. Fichas/login/avatares permanecem externos. Nada contratado, apagado, commitado ou publicado nesta etapa. Guia de uso e auditoria em `docs/MESA-LOCAL-AUDITORIA.md`; a unica lista de acoes abertas continua em DEV_STATUS.md > Pendencias Vivas.

## Projeto e workspace

- Armagedom: portal de RPG em HTML, CSS e JavaScript.
- Fontes: C:\Users\Usuario\Projects\Armagedom, fora do OneDrive. A pasta da Area de Trabalho contem o atalho.
- Branch local: codex/recuperacao-local, com trabalho recuperado consolidado em commit sobre a base fee2bd8.
- Tres commits de outubro de origin/main integrados com a recuperacao local; visao dinamica continua removida. Biblioteca, calibracao, moldes, percursos, decoracoes e melhorias do portal recuperados.
- Backend publicado: Workers + D1 + Durable Objects/WebSocket. Express/PostgreSQL foi removido do repositorio; existe apenas no historico Git.
- Build: npm run build gera _site com bundles e minificacao; nao publica.

## Estado funcional local

Correcao integrada e publicada em 2026-10-29: schema local de mapas v4 preservado, incluindo migracao dos metadados v3 sem apagar blobs. Controles do mestre verificados com dados existentes e depois de recarga. 561 testes de interface/permissoes e 193 do pacote minificado locais aprovados; CI Linux com nove Node, dez build e 154 artefato aprovada. Codigo/CI `39cf881` em main; Worker `4730d613-ec94-4922-8e44-5378c92001c9`, Pages Cloudflare `116b8ee6` minificado e GitHub Pages atualizados. Testes publicos e hashes dos bundles conferidos nos dois dominios. Visao permanece removida, sem limpar dados ou alterar regras/permissoes. Detalhes no topo de DEV_STATUS.md. O registro abaixo descreve a publicacao anterior ao incidente de compatibilidade.

Ficha, inventario, Echos e Mesa mantidos. Visao dinamica antiga removida em 2026-10-28 para futura reconstrucao. Nevoa manual, grade, tokens, iniciativa e permissoes tradicionais permanecem. Base recuperada publicada no Cloudflare em 2026-10-29: Worker `ea479876-9a95-4118-b7be-779531818b06` e Pages `7bda574f` (commit `7e8c3a4`), com frontend minificado e Echos incluido no pacote. Seis paginas HTTP 200, bundles conferidos por hash e dois testes publicos aprovados. Publicacao direta, sem push, integracao de origin/main ou atualizacao do espelho GitHub Pages.

## Ambiente validado

Node 24.22.0 / npm 11.19.1; dependencias consistentes e zero vulnerabilidades npm. Chromium funcional, Wrangler autenticado e dry-run aprovado. Git fsck sem erros e hooks .githooks ativos.

365 testes Playwright locais, 2 de integracao Worker/D1/DO reais locais, 10 de build e 2 de readiness publico aprovados. Mais 60 verificacoes Node aprovadas. Os 2 testes de Worker inicialmente ignorados na bateria geral foram aprovados na execucao isolada. Smoke autenticado de producao nao executado nesta maquina por ausencia de credenciais.

## Comandos

Consulte README.md para os comandos de validacao. npm run test:mesa:worker:local configura automaticamente um Worker/D1 isolado com contas descartaveis. Para servir o frontend: python -m http.server 8000 --bind 127.0.0.1.

## Contratos

Preservar ordem dos scripts, facade window.APP e permissoes mestre/jogador. Sessao de API usa o servidor como fonte principal; localStorage serve de cache/fallback. Nao alterar regras de gameplay sem pedido. Cada etapa altera os documentos correspondentes. A lista unica de acoes abertas esta em DEV_STATUS.md, secao Pendencias Vivas.

Direcao visual: dark fantasy, preto/carmesim, sem fundos animados.
