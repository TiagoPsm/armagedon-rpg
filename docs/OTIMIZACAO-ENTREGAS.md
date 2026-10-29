# Otimizacoes em pequenas entregas — 2026-10-29

Implementacao local solicitada por Tiago. Sem commit, push, publicacao, migracao remota, mudanca de plano ou exclusao de imagens. O codigo servido ainda e a base registrada em DEV_STATUS.md. A unica lista de acoes abertas continua sendo `DEV_STATUS.md > Pendencias Vivas`.

## Situacao das nove entregas

| Entrega | Resultado local e limite de conclusao |
| --- | --- |
| 1. Medicoes e planos | Harness reproduzivel, tres execucoes frias/quentes, inventario de servicos e historico corrigido. API de assinaturas retorna 403. Tiago nunca foi cobrado e acredita usar Free; isso nao confirma o plano. |
| 2. Tokens | Posicao confirmada ancora o layout; translate independente de escala atualiza somente tokens em movimento. Selecao acompanha sem redesenhar decoracoes por quadro. Percurso, duracao, zoom, velocidade e movimento reduzido preservados. |
| 3. Build/publicacao | Workflow preparado para gerar um unico pacote minificado, publicar nos dois destinos e comparar hashes. Worker tem fingerprint de fontes/configuracao e comparacao com health publicado. Ativacao externa ainda nao executada: segredos/variaveis GitHub ausentes; builds Cloudflare preservados ate validacao do substituto. |
| 4. Leituras da interface | GET simultaneos equivalentes compartilham rede e retornam copias independentes. Directory/Echos tem cache em memoria de tres segundos, invalidado por escritas, eventos, logout e troca de sessao/API. Nenhuma escrita repetida automaticamente. Fichas detalhadas continuam buscadas ao abrir; nao removemos dados indispensaveis da Mesa/listagem. |
| 5. D1 | Busca existente por lower(sheet_key) ganhou indice de expressao demonstrado em SQLite descartavel com 10 mil registros. Directory filtra personagens nao acessiveis ao jogador antes de carregar/normalizar JSON. Migracao aditiva separada, somente local; transacoes e mecanicas preservadas. |
| 6. Trafego | Snapshot de entrada/reconexao direcionado ao jogador solicitante autenticado. Alteracoes de cena continuam broadcast; decisoes de movimento e dados sem espera adicional. Preservados hibernacao, filtros privados, WebRTC e alternativa WebSocket. Nao adicionamos agrupamento especulativo a outros eventos sem ganho medido. |
| 7. Avatares estaticos | Originais recuperados, nomes SHA-256, catalogo, ferramenta de atualizacao local, compatibilidade com URLs antigas e bloqueio de escrita preparados. Catalogo `enabled:false`: ativacao exige conferir imagens publicadas nos DOIS destinos. Sem essa etapa, fluxo atual permanece. |
| 8. R2 | Recuperacao verificada de 15 objetos: 12 mapas e 3 avatares, 17.174.740 bytes. Onze registros de avatar inspecionados; duas URLs nao vazias, ambas recuperadas. Nenhum inline ativo encontrado. Worker estatico testado sem MAPS. Objetos/binding externos preservados e risco residual registrado. |
| 9. Fechamento | Regressao local e relatorio preparados. Nao equivale a homologacao autenticada dos sites, confirmacao do plano ou encerramento externo do R2. Base nao declarada aprovada em producao antes dessas etapas. |

## Como reproduzir e comparar

Ambiente: Windows, Intel i7-10700K, Node 24.22.0, Chromium 147.0.7727.15, viewport 1440x900. Base anterior: `44400f6`. Fontes externas bloqueadas igualmente no benchmark; API e sessoes de campanha nao sao utilizadas. Tempos de abertura usam relogio do navegador, e nao tempo do controlador Playwright.

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH='C:\Users\Usuario\AppData\Local\ms-playwright'
npm run build
node tools/benchmark-optimization.cjs --artifact --ref=44400f6 --label=baseline-final
node tools/benchmark-optimization.cjs --artifact --label=optimized-final
npm run test:optimization
npm run test:mesa:worker:local
node tools/run-local-worker-tests.cjs --static
```

Cada benchmark registra tres visitas frias e tres com cache para 30 tokens, depois 60 tokens com 1.500 desenhos. Dados brutos ficam em `local-backups/benchmarks/` (ignorado e fora de test-results, que Playwright apaga). Um renderer mede custo por cliente; `--renderers=7` e um teste adicional de CPU compartilhada, sem representar sete computadores na internet. O teste de seis jogadores usa Worker/DO/WebSockets locais reais, separadamente. O harness de animacao mede um token movendo em cena populada; concorrencia funcional de dois jogadores e coberta por integracao, nao por essa medicao de FPS.

Ganho comprovado: cinco leituras sequenciais iguais da listagem passaram de cinco requests para um (80% menos); snapshot de entrada passa de seis entregas para uma (83% menos), para o mesmo documento e seis jogadores. Consulta real passou de `SCAN c` para `SEARCH c USING INDEX characters_sheet_key_lower_idx (<expr>=?)`; o teste preserva comparacao sem diferenciar maiusculas/minusculas e executa a migracao duas vezes. Nao extrapolar esses ganhos para toda a API ou uma sessao inteira.

Investigacao de abertura: os dois pacotes usam um unico bundle por pagina; o catalogo novo entra no bundle, sem request adicional na Mesa/Ficha. A amostragem anterior mostrou regressao de aproximadamente 26 ms na abertura quente da Mesa e 6 ms na Ficha normal, acima de 10% em medianas pequenas. Readiness observado por requestAnimationFrame tem granularidade proxima de um quadro; execucao local varia com CPU/GC. Isso justifica registrar dispersao e nao anunciar ganho geral de abertura. Resultados finais ficam na secao de medicoes abaixo; nenhuma troca de servico foi feita com base em uma suposicao de velocidade.

## Medicoes finais (medianas de tres execucoes)

Tempos em milissegundos. Frio/quente se refere ao cache do navegador; ambos usam os mesmos arquivos minificados e a mesma maquina. A coluna P95 e a mediana dos percentis de cada execucao, nao FPS minimo garantido.

| Tokens/cache | Mesa antes / depois | Ficha antes / depois | P95 quadro antes / depois |
| --- | --- | --- | --- |
| 30, frio | 234,4 / 240,3 | 100,7 / 110,2 | 19,9 / 17,9 |
| 30, quente | 118,6 / 126,2 | 48,3 / 45,7 | 19,0 / 18,3 |
| 60, frio | 222,2 / 197,8 | 95,8 / 91,1 | 19,4 / 18,0 |
| 60, quente | 172,1 / 168,1 | 43,6 / 48,3 | 19,9 / 18,0 |

P95 observado fica dentro de 25 ms nos cenarios finais. Long tasks durante a animacao: nenhum observado nas duas versoes. Nao e prova de ausencia de travamento em toda sessao nem de 60 FPS estaveis em qualquer dispositivo. Abertura nao tem ganho consistente: Ficha quente no cenario 60 subiu 4,7 ms (10,8%); bundle Mesa transferido frio cresceu aproximadamente 0,7%, sem request extra no fluxo. As amostras de cache variam por concorrencia/pre-carregamento de imagem de fundo; nao apresentar reducao ocasional de bytes como ganho garantido. Resultado preservado como limite de aceite para homologacao, sem alegar aceleracao geral do site. Fontes: `local-backups/benchmarks/baseline-final.json` e `optimized-final.json`.

## Recuperacao, atualizacao de avatares e reversao

1. `node tools/recover-r2.cjs --recover` lista/le originais e consulta somente campos de avatar no D1. A autenticacao existente fica no processo; nenhum segredo entra no pacote. Nunca ha DELETE ou SQL de escrita nessa ferramenta.
2. `node tools/verify-r2-recovery.cjs` confere tamanho, SHA-256 e decodificacao de todos os originais. Relatorios privados e imagens ficam em `local-backups/r2-recovery/`. A recuperacao foi conferida nessa pasta, nao em todos os dispositivos do mestre. Fazer copia adicional em disco de backup antes da retirada externa.
3. `node tools/prepare-static-avatars.cjs` prepara somente avatares publicaveis; mapas, nomes de objetos de mapas e metadados privados nao entram no catalogo publico. Originais sao copiados sem recompressao. Para atualizar imagem: `node tools/prepare-static-avatars.cjs --add C:\caminho\imagem.webp --key=chave-do-personagem` (Echo usa `echo-ID`).
4. Publicar primeiro as imagens mantendo o catalogo desativado (ou o catalogo ativo anterior). Antes do corte, combinar uma janela sem edicao de avatares, repetir inventario/recuperacao para detectar mudancas desde a primeira coleta e conferir todas as referencias. A preparacao nao bloqueia uploads do site atual.
5. `node tools/prepare-static-avatars.cjs --activate` faz GET e verifica SHA de cada imagem nos dois sites antes de alterar o catalogo local. Depois exige novo build/testes e publicacao coordenada de frontend/Worker. Nunca publica automaticamente. Em modo estatico, upload retorna 410; PUT antigo com alteracao de avatar nao publicada retorna 409 antes de salvar dados. URLs persistidas continuam no formato atual; leitura legada redireciona para o arquivo estatico.
6. Para mapas legados, mestre conecta a pasta `local-backups/r2-recovery` pelo controle de pasta existente. Seu recovery.json fornece aliases privados por hash; imagens ficam em subpastas e sao reconhecidas pela biblioteca local. Cenas/cache antigos sao resolvidos em leitura, sem apagar dados do navegador. Jogadores recebem a imagem pelo transporte existente. GET remoto de mapas retorna 410 no modo estatico, sem fallback para R2.
7. Conferir os cenarios publicados e ausencia de R2 no caminho ativo antes de apresentar inventario final para autorizacao especifica de exclusao/binding/bucket. Esta implementacao nao possui ferramenta de exclusao. R2 permanece armazenando objetos ate essa decisao.

Reversao antes de excluir objetos: reverter o conjunto de fontes e catalogo para a base validada e publicar frontend/Worker correspondente, mantendo binding e imagens R2 intactos. O indice D1 e aditivo; reversao de aplicacao nao exige remove-lo. Dados de cenas e originais nao sao apagados. Depois de qualquer exclusao autorizada, restauracao do R2 dependeria dos originais locais e permissao especifica de reupload; nao tratar esse passo como reversao instantanea. Manter assets estaticos antigos enquanto houver referencias/caches.

## Validacao local e limites

Fechamento adicional: 137 testes minificados aprovados, incluindo layouts desktop de 1024 a 2560 px, ampliacao de texto de 150%, teclado, estados de erro/rede e os dois testes de avatar. Captura da ficha estatica inspecionada: aviso legivel, nenhum envio de arquivo oferecido nesse modo e demais controles preservados. Seis testes Worker atuais e dois estaticos repetidos com sucesso, incluindo recusa de PUT inline em Echo sem gravacao parcial. A primeira versao desse teste leu o envelope `echo` incorretamente e recebeu 404; fixture corrigida e teste repetido aprovado, sem mudanca no contrato da API.

Regressao ampla durante a implementacao: 576 testes de interface/contratos aprovados. Bateria minificada dedicada: 53 testes aprovados (movimento, cenas locais, mapa/biblioteca, controles, upgrade e avatares). Testes finais adicionais sao registrados em DEV_STATUS.md. Onze testes Node de otimizacao e dez de regras/CSS aprovados; dez de build/ordem de scripts aprovados. Worker real local: seis testes no modo atual e dois no modo estatico, incluindo ausencia do binding MAPS e recusa de avatar inline de cliente antigo. Checagem de 63 JS e auditorias estatica/CSS/pendencias aprovadas. As suites usam bancos/contas descartaveis e nao modificam a campanha.

Ha cobertura de dois jogadores movendo simultaneamente, reconexao, fechamento antes da gravacao, recuperacao, troca de cena, mapa via relay e falha sem upload remoto. Conectividade WebRTC em todas as redes, homologacao autenticada da campanha, navegador adicional/leitor de tela e plano efetivo continuam limites externos. Testes sem MAPS demonstram que os caminhos estaticos testados funcionam sem R2; nao demonstram que o site publicado ja deixou de acessa-lo.

## Revisao pelo Guia de Producao

### Resumo da analise

Correcoes delimitadas em renderizacao, repeticao de leituras, busca SQL e distribuicao de snapshots. Vanilla, identidade visual e mecanicas preservados. Infraestrutura nova e dependencias pagas: nenhuma.

### Problemas criticos

Nenhum novo problema critico evidenciado nos cenarios locais executados. Nao classificar ausencia de faturamento confirmado como garantia de gratuidade.

### Problemas importantes

Pipeline externo ainda nao ativado e migracao de imagens ainda nao publicada. Regressao percentual de abertura investigada, sem ganho geral demonstrado; medir novamente em sessao de referencia publicada antes da homologacao. Encerramento da base depende dos criterios de producao, conforme lista viva.

Problema: corte externo incompleto. Impacto: site publicado continua usando R2/builds atuais. Local: workflow Pages e manifest de avatares. Correcao: executar o procedimento em etapas depois de autorizado e configurar segredos restritos, sem remover infraestrutura antes da verificacao. Severidade: MEDIO, limite de entrega externa, nao falha reproduzida de dados.

Problema: pequenas medianas de abertura tiveram variacao superior a 10%. Impacto: nao ha evidencia suficiente para prometer abertura mais rapida. Local: benchmark de readiness e bundles Mesa/Ficha. Correcao: manter dados brutos, verificar granularidade de quadro/recursos e repetir no ambiente de homologacao com rede real. Severidade: BAIXO na amostra local (4,7 ms na repeticao final); nao extrapolar para todos os usuarios.

### Problemas visuais

Oscilacao relatada recebeu teste de posicao monotona e ausencia de alteracao em tokens parados. Aviso de avatar somente no fluxo estatico, substituindo a escolha de arquivo; revisao desktop e capturas de regressao preservam o restante da ficha.

### Problemas de codigo

Cache limitado a leitura, isolado por sessao e com invalidacao explicita. Estado definitivo e permissoes nao sao simplificados. Compatibilidade de imagens tem chave de ativacao para evitar referencia a arquivo ainda nao publicado. Fingerprint inclui manifest, regras compartilhadas e Worker/configuracao.

### Melhorias recomendadas

Consolidar a mesma medicao no computador de referencia durante homologacao online; decidir novas otimizacoes apenas onde houver custo demonstrado. Registro e ordem das acoes existem exclusivamente na lista viva.

### Correcoes prioritarias

Conferir resultado local, configurar e validar CI substituta, publicar assets antes do corte, homologar fluxos conectados, revisar retirada externa do R2 e confirmar plano. Nao iniciar novas funcionalidades como se a entrega 9 estivesse homologada.
