# Pendencias e Riscos

Atualizado em 2026-10-29. A unica lista de acoes abertas e a secao Pendencias Vivas de DEV_STATUS.md. Esta nota nao mantem uma lista paralela.

## Limites da validacao desta maquina

Os testes locais, o Worker/D1/DO isolado e o readiness publico passaram. O smoke autenticado de producao nao foi executado por ausencia de credenciais. O cadastro usa npm run test:online:setup e cofre DPAPI fora do repositorio. Consulte README.md e DEV_STATUS.md para os resultados completos.

## Contratos a preservar

- Ordem dos scripts da ficha e da Mesa.
- Permissoes de mestre/jogador e isolamento da camada dm.
- API como fonte principal para sessao autenticada; cache/fallback local pode divergir durante indisponibilidade.
- Cena vazia pode ser uma escolha real do mestre.
- WebSocket depende do Worker/DO e snapshots pela API mantem a recuperacao.
- Nao salvar a cena a cada movimento de drag.
- Preservar trabalho local recuperado ao comparar os tres commits conhecidos de origin/main.
- Frontend e Worker devem acompanhar a mesma versao ao publicar a remocao de Vision.
