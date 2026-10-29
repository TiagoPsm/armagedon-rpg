# Mesa local: auditoria de dependencia e cobranca — 2026-10-29

Atualizacao apos revisao do Tiago: o painel "Cenas neste computador", aviso e tres botoes foram removidos da interface. Salvamento automatico e otimizacoes permanecem. Funcoes de exportacao/importacao continuam internas ao armazenamento, sem acesso pelos ajustes. As instrucoes de botoes e a captura descritas abaixo documentam a versao anterior e nao devem ser usadas como guia da interface atual.

Escopo autorizado: retirar armazenamento remoto de mapas, manter cenas no computador do mestre com backup e estabelecer confirmacao de movimentos pelo mestre antes de substituir a publicacao. Nenhum recurso pago, assinatura, exclusao remota, commit ou deploy autorizado nesta etapa de implementacao.

## Evidencia da conta

Consulta autenticada somente leitura: `accounts/.../subscriptions` retornou HTTP 403 (credencial OAuth sem acesso a faturamento). `workers/account-settings` retornou HTTP 200, `default_usage_model: standard`. Esse campo nao confirma Free/Paid nem o preco da assinatura. Tiago informou que o painel nao mostra consumo em Workers & Pages nem R2; ausencia de consumo nao demonstra ausencia de assinatura ou impossibilidade de cobranca futura. Nenhum segredo foi impresso ou salvo no relatorio.

| Componente | Uso evidenciado | Situacao |
| --- | --- | --- |
| Workers | Login, fichas, permissoes e API | Ainda utilizado; plano de faturamento nao confirmado |
| D1 | Fichas, regras e API legada de cenas | Cenas do modo local nao consultam/gravam automaticamente; demais usos preservados |
| Durable Objects | WebSocket, presenca, dados e relay | Ainda utilizado, inclusive fallback de transmissao de mapas |
| R2 MAPS | Mapas e avatares compartilham bucket | Novos uploads/exclusoes de mapas bloqueados no codigo local; avatares inalterados |
| Pasta conectada/IndexedDB | Originais e cache de mapas | Preservados; nenhuma limpeza executada |
| Pages | Hospedagem estatica | Nenhuma configuracao ou assinatura alterada |

Fontes oficiais consultadas na sessao: [DO](https://developers.cloudflare.com/durable-objects/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [R2](https://developers.cloudflare.com/r2/pricing/). Limites de DO/D1 Free interrompem operacoes ao exceder; R2 tem cobranca propria por excedentes. Nao ha garantia de custo zero da conta inteira nesta auditoria.

## Implementacao local

Removidos os uploads automaticos do frontend. Fachada APP recusa upload/exclusao sem fazer requisicao. API autentica e recusa POST mapa (410 para mestre, 403 para jogador, 401 sem sessao), e protege DELETE (409 para mestre). GET legado continua disponivel para recuperacao; pode consumir recursos e nao significa migracao concluida. Nao removidos bindings, objetos, bucket ou lifecycle remoto.

Transmissao P2P e alternativa WebSocket existentes preservadas. Falta de confirmacao em 30 segundos informa falha sem enviar mapa ao R2. Nenhuma assinatura alterada. A publicacao atual continua inalterada.

Um documento IndexedDB por cena, separado por usuario/API, passa a guardar posicoes dos tokens, grade, nevoa, desenhos, iniciativa e referencia do mapa. Nao sao duas matrizes duplicadas: o mestre mantem um estado autoritativo e envia aos jogadores a parte que eles podem ver. Imagens ficam na pasta conectada/cache de mapas, fora do JSON. O salvamento automatico e no armazenamento do navegador; a exportacao gera um arquivo JSON portavel, nao uma escrita automatica numa pasta do Windows.

Revisoes transacionais recusam gravacao concorrente desatualizada; rascunho sincronico recupera fechamento ocorrido antes do IndexedDB terminar. Troca de cena aguarda as gravacoes da anterior. Importar backup cria outra cena, preservando a original. Cenas antigas do servidor so sao copiadas por uma acao explicita de leitura; nenhum registro remoto e apagado. Arquivos de mapas existentes no R2 continuam preservados, sem afirmar que todas as imagens ja foram recuperadas localmente.

Jogador solicita movimento (token, origem, percurso, escala). Relay autenticado encaminha ao mestre anfitriao, que valida dono/trava/cena/origem, calcula destino e duracao, salva e transmite confirmacao. Todos animam localmente a mesma rota/duracao. Pedidos concorrentes sao processados em ordem; falha de gravacao ou falta do mestre mantem a posicao anterior. Snapshots de reconexao sao divididos em partes, sem consulta de cena no D1. Tokens secretos/invisiveis e vitais privados sao retirados antes de sair do computador do mestre; relay filtra novamente. Segunda aba de mestre conectada nao assume autoridade nem salva.

## Uso pelo mestre apos uma publicacao autorizada

1. Abrir a Mesa no computador e perfil de navegador que guardarao as cenas. Conectar a pasta dos mapas; manter os originais nessa pasta.
2. Se necessario, abrir ajustes do mapa e usar **Copiar cenas antigas do servidor**. Essa operacao copia os estados; imagens antigas precisam estar recuperadas na biblioteca/pasta local. Nao remove nada do servidor.
3. Usar a gaveta Cenas normalmente. Estado e salvo automaticamente neste navegador; o mestre precisa manter a Mesa aberta para confirmar movimentos e transmitir mapas a quem entrar.
4. Em ajustes, **Exportar cena JSON** guarda um backup da cena atual. Fazer isso para cada cena que deseje transportar/proteger. As imagens precisam de uma copia separada.
5. **Importar backup JSON** cria uma nova cena. No mesmo navegador, referencias de mapas ainda presentes podem ser recuperadas; em outro computador, reimportar/reassociar a imagem ou reconectar a pasta.

Limpar dados do navegador, trocar de perfil ou usar outro dominio nao transfere cenas automaticamente. IndexedDB e cache nao substituem backup independente. O rascunho cobre fechamento da pagina, mas nao promete recuperacao apos exclusao do perfil, falha de disco ou remocao de dados pelo navegador. Backup aceito ate 8 MB; transmissao de snapshot ate 2 MB; cenas maiores preservam a copia local e exibem aviso. Animacoes usam a velocidade reduzida e distancia fisica, inclusive diagonal; chegada simultanea exata nao e garantida pela rede.

## Dependencia externa e limites

WebRTC continua com sinalizacao e servidores STUN existentes. Quando a ligacao direta nao funciona, o relay WebSocket transmite mapas; ele nao armazena imagens no R2, mas utiliza DO/Workers. Login, fichas, avatares R2, trava e historico de dados permanecem externos. A reducao remove gravacoes e consultas automaticas de cena e novos uploads de mapas; nao elimina mensagens de rede nem garante menor custo em todos os perfis de uso. Nao ha garantia de custo zero da conta com plano desconhecido.

Nenhum plano, binding, secret, assinatura ou infraestrutura foi alterado. Consulta de faturamento continua sem autorizacao (403). O acompanhamento das acoes abertas fica exclusivamente em DEV_STATUS.md > Pendencias Vivas.

## Validacao e limites da evidencia

Testes dedicados de navegador cobrem salvar/recarregar, fechar/reabrir, backup, conflitos, recuperacao do rascunho, mapas separados por cena e gravacao antes da animacao. Chamadas de upload/exclusao nao usam rede nem apagam objetos existentes; timeout informa falha sem upload. Integracao com Worker/D1/DO locais reais usa dois jogadores, movimentos concorrentes, recusa de movimento alheio, reconexao, anfitriao duplicado, transferencia de imagem e troca de cena. Captura de frames confere que token secreto nao sai do navegador do mestre; captura HTTP exige ausencia de chamadas automaticas de cena/mapas POST/DELETE.

Suites antigas usam `mesaLocalScenes:false` explicitamente no servidor de fixtures para conservar cobertura do contrato legado. Suites `mesa-local-session` e `mesa-local-worker` habilitam o novo modo, tambem conferido no bundle minificado. Contagens e resultados finais em DEV_STATUS.md. Validacao local nao equivale a homologacao na campanha ou em redes com NAT diferentes. A publicacao continua inalterada.

## Resumo da analise

Implementacao preserva stack vanilla, identidade visual e mecanicas. A mudanca elimina gravacoes automaticas de cenas no D1 e novos objetos de mapas no R2; continua dependendo de relay autenticado. A fonte de verdade local exige backups independentes. Esta revisao e do codigo e dos cenarios locais descritos, sem aprovacao de producao.

## Problemas criticos

Nenhum problema critico aberto evidenciado no escopo validado. Isso nao equivale a auditoria de seguranca de todo o repositorio ou da conta Cloudflare.

## Problemas importantes

| Problema reproduzido | Impacto | Local | Correcao implementada | Severidade |
| --- | --- | --- | --- | --- |
| Trocar cena com gravacao pendente | Estado podia ser capturado na cena seguinte | mesa-local-session / mesa-core | Aguardar escrita anterior e limpar tokens da cena anterior | ALTO |
| Cache auxiliar cheio ou com token secreto removido | Falha de cache podia impedir gravacao ou restaurar dado antigo | mesa-stage / mesa-core | IndexedDB continua autoritativo, cache opcional e sem merge legado no modo local | ALTO |
| Id de mapa recebido difere do original e entrada antes do cache pronto | Mapa podia desaparecer apos snapshot ou nao chegar ao jogador | mesa-map / mesa-local-session | Reconhecer hash, pedir sincronizacao apos init e vincular transferencia a cena | MEDIO |
| Confirmacao de um jogador ocultava falha de outro | Mestre podia acreditar que todos receberam a imagem | mesa-map | Conferir os participantes ao expirar o prazo e avisar sem upload | MEDIO |

## Problemas visuais

Sem novo problema visual evidenciado na captura desktop revisada. Botoes reutilizam o painel e estilos existentes; textos longos cabem na largura disponivel. A captura usa mapa sintetico vermelho para verificar referencia de imagem; nao representa uma nova direcao visual.

## Problemas de codigo

Persistencia e protocolo separados em dois arquivos, carregados antes do bootstrap. Escritas de cena serializadas, revisoes verificadas no IndexedDB e limites de transferencia explicitos. Ordem e compatibilidade legada verificadas nos testes; nenhum framework, servico ou dependencia acrescentado. Dados secretos sao filtrados antes de construir mensagens, com verificacao adicional no relay e teste dos frames enviados.

## Melhorias recomendadas

Manter backups exportados e imagens originais em copia independente. A confirmacao do plano e a homologacao em rede/campanha seguem os registros da lista unica em DEV_STATUS; nao sao substituidas pelos testes locais.

## Correcoes prioritarias

Ordem aplicada: preservar dados e privacidade; garantir confirmacao e recuperacao de movimentos; corrigir referencia/entrada de mapas e falha parcial de entrega; validar pacote e revisar controles. Publicacao permanece separada desta entrega.
