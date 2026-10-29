# Pontos de custo do site — 2026-10-29

Publicacao: otimizacoes de leituras/movimento/relay e indice D1 ja ativos no conjunto cfdc5bc, conferido nos dois sites. Imagens estaticas preparadas ja publicadas, mas catalogo segue false e fluxos legados de avatar/R2 permanecem; risco residual nao encerrado. CI GitHub aprovada; Cloudflare recebeu o mesmo artefato manualmente, sem desativar builds duplicados. Nenhum plano ou objeto remoto alterado/excluido, exceto o indice D1 aditivo autorizado. Resultados e versoes em DEV_STATUS.md.

Atualizacao do plano: Tiago informa nunca ter sido cobrado e acredita estar no Free; plano ainda nao confirmado explicitamente (assinaturas API 403). Otimizacoes locais reduzem chamadas e trafego conforme [relatorio](OTIMIZACAO-ENTREGAS.md), sem garantia de custo zero. Catalogo estatico permanece desativado ate publicacao previa das imagens. R2: 15 objetos recuperados e verificados localmente (12 mapas e 3 avatares), nenhum excluido; armazenamento/leitura seguem risco residual ate corte publicado e retirada autorizada. CI substituta preparada, segredos Cloudflare ausentes no GitHub; builds duplicados existentes ainda ativos. Os itens abaixo descrevem dependencias atuais publicadas, e nao um corte externo ja concluido.

Auditoria do codigo e configuracao existente, sem mudar planos ou contratar recursos. A consulta de assinaturas da conta continua sem permissao (403 registrado na sessao); `usage_model:standard` nao identifica Free/Paid. Ausencia de consumo no painel nao garante impossibilidade de cobranca. Franquias sao compartilhadas com outros usos da mesma conta.

## Recursos usados que podem ser faturaveis

| Recurso | Onde o site usa | O que pode ser medido/cobrado |
| --- | --- | --- |
| Workers | Login, validacao de senha/permissoes, API de fichas, Echos, inventario, regras, sugestoes, transferencias, acesso a imagens e conexao da Mesa | Mensalidade se houver plano pago, requisicoes e processamento de CPU conforme franquia; uma visita estatica nao equivale a uma chamada de API |
| D1 | Usuarios, fichas/personagens/NPCs/monstros, Echos, regras, sugestoes, propostas/transferencias/auditorias, limitacao de login e cenas legadas | Linhas lidas/escritas e armazenamento. Cenas locais nao fazem GET/PUT automatico, mas as cenas antigas continuam armazenadas; consultas explicitas legadas ainda usam D1 |
| Durable Objects | Presenca, encaminhamento de movimentos/snapshots, desenhos, grade/nevoa/iniciativa, regua, ping, dados e sinalizacao de mapas | Requisicoes/mensagens, execucao e armazenamento. Trava e historico de dados usam armazenamento do DO. Hibernacao reduz duracao ociosa, nao elimina demais metricas |
| Mapas pelo WebSocket | Alternativa quando WebRTC direto falha | Usa o mesmo Workers/DO, incluindo mensagens em partes. Nao cria objeto R2, mas continua trafegando por infraestrutura externa |
| R2 | Avatares de personagens e Echos; migracao explicita de avatar base64; mapas antigos preservados | Volume armazenado e operacoes de escrita/leitura, conforme classe e franquia. Mesmo sem novos uploads de mapas, objetos existentes ocupam armazenamento e GET legado pode le-los. Saida de dados do R2 nao tem tarifa de egress, mas isso nao torna armazenamento/operacoes gratuitos sem limite |
| Workers Builds | Publicacao automatica existente quando ha push no repositorio | Minutos de build; plano pago pode cobrar excedentes. Publicacoes repetidas podem iniciar builds mesmo sem nova mecanica no site |

No Free, Workers/D1/DO aplicam limites e podem interromper operacoes; nao interpretar excesso como upgrade automatico para plano pago. No Paid, existem franquias e excedentes faturaveis. R2 tem cobranca propria por armazenamento/operacoes alem das franquias. Nao foi confirmado o plano efetivo da conta nesta auditoria.

## Logs e observabilidade

Consulta somente leitura ao Worker retornou `logpush:false` e `observability:null`. Nao ha configuracao de observabilidade no wrangler.toml; o retorno nulo nao demonstra o estado de todas as opcoes de logs da conta. Logs/traces e exportacoes podem ter quotas/cobranca quando habilitados. A documentacao atual anuncia mudanca de modelo de Workers Logs em 2026-12-01; verificar a configuracao antes de habilitar coleta. Nao foram ativados logs pagos ou exportadores.

## Componentes sem cobranca por uso identificada neste projeto

- Cloudflare Pages estatico: HTML/CSS/JS/imagens estaticas nao invocam Pages Functions. Requisicoes estaticas sao gratuitas; limites de build/publicacao do plano nao devem ser confundidos com cobranca automatica por visita. Nao existe Pages Functions neste projeto.
- GitHub Pages e CI: repositorio publico confirmado por API (`private:false`), workflow usa runner padrao `ubuntu-24.04`. Minutos de Actions nesse caso sao gratuitos. Mudar para repositorio privado/runners maiores ou habilitar outros produtos altera essa analise.
- Grade, animacoes, IndexedDB, pasta conectada e JSON: executam/guardam dados no computador, sem servico remoto cobrado por esses calculos.
- WebRTC direto: imagem vai entre navegadores quando a rede permite. A sinalizacao continua usando Workers/DO. Apenas STUN publico do Google configurado; nenhum TURN pago esta configurado.
- Google Fonts: fontes gratuitas, chamadas externas para carregar tipografia; sem chave ou API paga identificada.
- Dominios usados: subdominios pages.dev, workers.dev e github.io; nenhum dominio proprio comprado/configurado no codigo revisado. Internet/energia do mestre e jogadores continuam custos dos proprios equipamentos/conexoes, fora da fatura da hospedagem.

As imagens de avatar tambem passam pelo Worker ao serem servidas: uma operacao de usuario pode consumir mais de um produto (Worker + R2, por exemplo). Nao ha base para prometer custo zero da conta inteira sem conferir assinaturas, recursos ativos e limites efetivos. Os maiores pontos restantes deste site sao R2, API/D1 e relay DO; retirar armazenamento remoto de mapas reduz apenas parte deles.

## Fontes oficiais consultadas

- [Workers: precos](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1: precos e excesso no Free/Paid](https://developers.cloudflare.com/d1/platform/pricing/)
- [Durable Objects: mensagens, execucao, hibernacao e armazenamento](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [R2: armazenamento, operacoes e egress](https://developers.cloudflare.com/r2/pricing/)
- [Workers Builds: limites e precos](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Pages: requisicoes estaticas](https://developers.cloudflare.com/pages/functions/pricing/)
- [GitHub Actions: cobranca e uso](https://docs.github.com/en/actions/concepts/billing-and-usage)
- [Google Fonts: FAQ](https://developers.google.com/fonts/faq)
