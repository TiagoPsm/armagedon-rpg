# Contexto Atual

Atualizado em 2026-10-29. Historico detalhado em DEV_STATUS.md.

## Projeto e workspace

- Armagedom: portal de RPG em HTML, CSS e JavaScript.
- Fontes: C:\Users\Usuario\Projects\Armagedom, fora do OneDrive. A pasta da Area de Trabalho contem o atalho.
- Branch local: codex/recuperacao-local, com trabalho recuperado consolidado em commit sobre a base fee2bd8.
- Tres commits conhecidos de origin/main ainda nao integrados; preservar as alteracoes locais antes de integrar.
- Backend publicado: Workers + D1 + Durable Objects/WebSocket. Express/PostgreSQL foi removido do repositorio; existe apenas no historico Git.
- Build: npm run build gera _site com bundles e minificacao; nao publica.

## Estado funcional local

Ficha, inventario, Echos e Mesa mantidos. Visao dinamica antiga removida em 2026-10-28 para futura reconstrucao. Nevoa manual, grade, tokens, iniciativa e permissoes tradicionais permanecem. A remocao ainda nao foi publicada; frontend e Worker precisam ser publicados juntos.

## Ambiente validado

Node 24.22.0 / npm 11.19.1; dependencias consistentes e zero vulnerabilidades npm. Chromium funcional, Wrangler autenticado e dry-run aprovado. Git fsck sem erros e hooks .githooks ativos.

365 testes Playwright locais, 2 de integracao Worker/D1/DO reais locais, 10 de build e 2 de readiness publico aprovados. Mais 60 verificacoes Node aprovadas. Os 2 testes de Worker inicialmente ignorados na bateria geral foram aprovados na execucao isolada. Smoke autenticado de producao nao executado nesta maquina por ausencia de credenciais.

## Comandos

Consulte README.md para os comandos de validacao. npm run test:mesa:worker:local configura automaticamente um Worker/D1 isolado com contas descartaveis. Para servir o frontend: python -m http.server 8000 --bind 127.0.0.1.

## Contratos

Preservar ordem dos scripts, facade window.APP e permissoes mestre/jogador. Sessao de API usa o servidor como fonte principal; localStorage serve de cache/fallback. Nao alterar regras de gameplay sem pedido. Cada etapa altera os documentos correspondentes. A lista unica de acoes abertas esta em DEV_STATUS.md, secao Pendencias Vivas.

Direcao visual: dark fantasy, preto/carmesim, sem fundos animados.
