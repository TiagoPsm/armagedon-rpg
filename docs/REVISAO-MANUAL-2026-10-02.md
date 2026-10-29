# Revisão pelo Manual de Decisões — 2026-10-02

## Resumo da análise

O [Guia de produção](GUIA-DE-PRODUCAO.md) passa a ser a fonte primária de revisão do frontend. A cópia foi comparada ao TXT do proprietário: texto integral idêntico, desconsiderando apenas fim de linha. `AGENTS.md` e `CLAUDE.md` registram a adoção e as regras adicionais: projeto 100% gratuito; consultar Tiago antes de mudar estrutura ou regras do RPG autoral.

A [última auditoria](AUDITORIA-UI-BUGS-2026-10-02.md) corrigiu defeitos funcionais, mas deixou legibilidade, texto ampliado e revisão de acessibilidade incompletos. Esta rodada retoma esses pontos e acrescenta estados de rede, navegação e trabalho de renderização. Preserva HTML/CSS/JavaScript vanilla, tokens DOM, identidade escura/carmesim, dados e comportamentos corretos. Nenhum serviço/dependência pago, instalação, commit, envio ou publicação.

Desktop é o foco, conforme seção 5 do guia: 1024, 1280, 1440, 1920 e 2560px; texto 100/150%. O suporte menor existente não foi removido, mas não houve reformulação/homologação mobile nesta etapa.

### Microentregas aplicadas

| Entrega | Mudança | Evidência inicial/final |
| --- | --- | --- |
| G0 | Guia e limites permanentes no repositório | Cópia integral conferida; instruções sem autorização de mecânicas/deploy |
| G1 | Contraste de texto, placeholders, erros, foco e navegação atual | Três testes reproduziram falhas; cores escritas separadas das cores de preenchimento |
| G2 | Toolbar, nomes e ações compactas da Mesa | Cortes reproduzidos; 12 testes desktop/texto/teclado; palavra inteira validada visualmente |
| G3 | Hierarquia do acesso à Ficha e formulário de cadastro | Hero ocupava só 11,86% da largura; 11 testes após correção, sem mudar campos |
| G4 | Diálogos, prioridade de foco, anúncios e botão Cenas | 19 casos novos; 39 testes selecionados incluindo regressões existentes |
| G5 | Loading/erro/retry, leituras concorrentes e exclusão no portal | Dez falhas iniciais; 16 casos novos, 43 testes selecionados após correção |
| G5b | Leituras em voo não apagam o aviso de uma escrita incerta | Quatro falhas adicionais reproduzidas na revisão independente; portal ampliado para 26 casos, 53 testes selecionados aprovados |
| G6 | Evitar reconstrução inútil da iniciativa e manter retratos atualizados | Perda de foco reproduzida; revisão independente capturou retrato antigo; três regressões próprias |
| G7 | Regressão completa, build real e documentação | Resultados do fechamento abaixo; workflow preparado, não executado remotamente |

As contagens por entrega se sobrepõem. Não somá-las como testes únicos.

## Problemas críticos

Nenhum problema CRÍTICO foi comprovado neste recorte. Isso não significa ausência de vulnerabilidades, perda de dados ou falhas fora dos cenários testados. Produção e sessões autenticadas reais não foram alteradas/testadas nesta rodada.

## Problemas importantes

| Severidade | Problema / impacto | Local | Correção aplicada |
| --- | --- | --- | --- |
| ALTO | Foco inicial atrasado sobrescrevia Tab; diálogos concorrentes disputavam foco/Escape. Uso por teclado ficava imprevisível | `js/ui.js` | Foco inicial/restauração estáveis, prioridade do diálogo superior, filtros de controles ocultos/desabilitados; seleção vazia tem alvo válido |
| ALTO | Falha na lista parecia vazio confirmado, ou passava sem aviso. Usuário não sabia se existiam publicações | `js/regras.js`, `js/sugestoes.js` | Loading/erro junto à lista, conteúdo anterior preservado e botão de consulta; `aria-busy` e região de status |
| ALTO | Botão Cenas estava visível, mas continuava com `aria-hidden=true`, impedindo acesso semântico e restauração de foco | `js/mesa-scenes.js` | Estado visual e acessível atualizados juntos |
| MÉDIO | Resposta antiga substituía lista recente; exclusão podia concorrer/duplicar | Portal | Apenas a leitura mais recente atualiza lista/cache; exclusão serializada com confirmação, cancelamento e “Excluindo…” |
| MÉDIO | Consulta iniciada antes/durante escrita podia terminar depois e esconder o aviso de resultado incerto | Portal | Ao entrar em estado incerto, todas as leituras em voo perdem autoridade; sucesso/erro antigo não alteram cache/aviso. Uma consulta nova pode recuperar a lista; cancelar/validar formulário não invalida leituras legítimas |
| MÉDIO | Mensagens mostravam detalhes técnicos; falha após gravação podia ser interpretada incorretamente | Portal | Orientações legíveis, rascunho preservado e distinção entre escrita aceita e resultado incerto; nada de retry automático de POST/DELETE |
| MÉDIO | Falha do cache opcional transformava leitura remota aceita em erro | Portal | Servidor continua sendo fonte principal; falha de cache não descarta confirmação remota |
| MÉDIO | Confirmação sem descrição acessível; região de anúncio aparecia somente junto ao aviso | `js/ui.js` | Mensagem vinculada ao diálogo; status dos toasts existe antes das atualizações, sem tomar foco |

Limite importante: sem idempotência no servidor, perder a resposta de uma escrita não permite garantir “exatamente uma vez”. A interface orienta conferir a lista antes de reenviar; não afirma que uma escrita incerta falhou. Não foi introduzida mudança de protocolo nesta revisão.

## Problemas visuais

| Severidade | Problema / impacto | Local | Correção aplicada |
| --- | --- | --- | --- |
| MÉDIO | Placeholders, estados vazios e metadados necessários pareciam desabilitados | `css/tokens.css`, estilos compartilhados/páginas | `--text-placeholder` legível; texto necessário usa secundário; decoração/inativo permanece discreta |
| MÉDIO | Texto pequeno carmesim/erro usava a cor escura de preenchimento | Componentes, portal, cadastro, inspetor/roster | Tokens de texto distintos; sem clarear fundos nem alterar cores de recurso do RPG |
| MÉDIO | TOKENS/MESTRE cortados ao ampliar texto; nome tinha só ~30px na escalação | `css/mesa.css`, `js/mesa-roster.js` | Barra e doca com largura proporcional; nome pode quebrar naturalmente; SVGs secundários preservam texto acessível/title/teclado |
| MÉDIO | Hero da Ficha espremia título num trilho estreito e deixava espaço sem propósito; cadastro tinha três campos de ~110px | `css/ficha.css` | Grade equilibrada e adaptativa; nome do personagem em linha própria, sem mudar campos/conteúdo |
| MÉDIO | Navbar ultrapassava a página em 1024px/texto 150% | `css/components.css` | Coluna flexível e links podem ocupar mais de uma linha; nenhuma navegação escondida |
| BAIXO | Aviso de erro da lista encostava no card | `css/regras.css` | Aviso contido junto ao conteúdo e ação, com espaçamento consistente |

Cores medidas nos controles de fundo sólido foram verificadas por teste, além das capturas. Placeholder antigo apresentou ~1,70:1 no campo observado; o novo usa o secundário legível. O critério de contraste mínimo e a inclusão de placeholders foram conferidos na [orientação oficial W3C](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Requisitos de foco e retorno ao contexto foram conferidos no [padrão oficial de diálogo modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Isso não declara conformidade integral WCAG.

As skills de interface/playtest e revisão local orientaram a preservação da área de jogo, inspeção de capturas e exclusão de gestos concorrentes. O manual prevaleceu sobre sugestões genéricas de engine/mobile; nenhuma migração de stack foi feita.

## Problemas de código

| Severidade | Problema / impacto | Local | Correção aplicada |
| --- | --- | --- | --- |
| MÉDIO | Giro/câmera reconstruíam botões da iniciativa a cada quadro; foco sumia e havia trabalho sem mudança de conteúdo | `js/mesa-vision-runtime.js` | Resumo/iniciativa atualizados quando muda visibilidade/contexto/retrato; a área do mapa continua atualizada |
| MÉDIO | Primeira otimização podia conservar avatar antigo após hidratação assíncrona | Mesmo módulo | Revisão independente reproduziu; compara `imageUrl`/`initials` diretamente sem serializar data URLs; teste de ambas mudanças |
| MÉDIO | Seis prefetches fixavam versões de maio e não correspondiam ao build atual | `js/ui.js` | Prefetch somente do documento Ficha, com deduplicação; versões de assets continuam vindo do HTML/build |

Não foram mudadas fórmulas, ordem de iniciativa, modificadores, atributos, conteúdo de regras ou modelos de ficha. As alterações tratam apresentação, concorrência e atualização de interface. Arquivo grande, vanilla ou duplicação isolada não foi tratado como defeito por si só; não se adicionou framework/state manager/design system complexo sem necessidade.

### Aplicação do manual por área

| Seções do guia | Aplicação / limite |
| --- | --- |
| 1–4, 27, 41–43: visual, hierarquia, desktop, consistência | Capturas reais das seis páginas, cinco larguras; textos ampliados, palavras e caixas; navbar compartilhada |
| 5: mobile | Postergado pelo próprio guia; preservado suporte atual |
| 6–9, 20–25: UX, semântica, estados, formulários, diálogos | Foco/teclado/status, loading/empty/error, confirmações, respostas lentas/concorrentes e falhas simuladas |
| 10–16, 28–32: organização, CSS/JS/estado/manutenção | Correções localizadas, contratos globais/ordem preservados, padrões existentes e caches limitados |
| 17–18: React/Next | Não aplicável à stack atual; não são motivo para migração |
| 19, 31, 39–40: desempenho/dependências/cenários reais | Trabalho DOM redundante e hints antigos; fixtures locais, sem serviços pagos nem estresse do banco de produção |
| 21: tabelas | Não houve implementação de tabela nova; listas existentes preservadas |
| 26: segurança frontend | Texto/atributos modificados continuam escapados; detalhes técnicos removidos da UI. Não é pentest/auditoria integral de segurança |
| 33–38, 44–45: severidade/correção/produção | Achados reproduzidos, testes antes/depois, nenhuma reescrita integral, aprovação de produção condicionada a evidências reais |

## Melhorias recomendadas

Os pontos imediatos de legibilidade, toolbar, nomes e trabalho redundante da última revisão foram aplicados. Esta seção não abre uma segunda lista de tarefas. Publicação e homologação seguem exclusivamente em `DEV_STATUS.md`, `Pendencias Vivas`.

Antes de aprovação de produção: conferir a experiência conectada com mestre/jogador no site real; testar teclado/leitor de tela e navegador adicional. Uma certificação completa de acessibilidade ou uso confortável por pessoas reais não é demonstrada por CSSOM/Playwright. Evolução do sistema autoral depende de consulta prévia a Tiago, não deste guia.

Qualquer melhoria futura deve conservar gratuidade e justificar custo de processamento e manutenção. Escalar para milhares de usuários sem custo não foi garantido por testes locais; esta rodada não muda infraestrutura nem aprova migração para plano pago.

## Correções prioritárias

Ordem aplicada: 1) defeitos de teclado e estados de dados; 2) concorrência/exclusão e feedback; 3) legibilidade e layouts desktop; 4) trabalho redundante; 5) guardas/build e revisão integrada. Todas as correções listadas acima estão locais; não há aceite automático de produção.

### Validação e fechamento

Fechamento integrado executado em 2026-10-02:

| Validação | Resultado / evidência |
| --- | --- |
| Fonte: regressão ampla do frontend | 629 passaram; dois casos Worker/Durable Object ignorados sem ambiente/credenciais; 6,9 minutos. `test-results/production-closure-source` |
| Build normal/minificado | 11 passaram; 8,5 segundos. `test-results/production-closure-build` |
| Pacote efetivamente minificado | 165 passaram; 2,7 minutos. `test-results/production-closure-artifact` |
| Contratos puros/SQLite/DO e guarda CSS | 51 passaram; 1,23 segundo. Não são sessões conectadas reais |
| Desempenho isolado da Mesa | 12 passaram; 16,9 segundos. `test-results/production-final-performance` |
| Sintaxe e integridade | 65 JS, referências estáticas, delimitadores de 16 CSS e lista única de pendências aprovados; sem afirmar validação completa da gramática CSS |
| Revisão visual | Capturas das seis páginas; larguras desktop de 1024–2560px, texto ampliado, estados de erro e diálogo; artefato conferido visualmente |

Foram acrescentados 110 casos de regressão próprios desta revisão, incluindo dez da última revisão independente. A suíte do artefato repete parte da fonte; não somar as contagens como testes únicos. As execuções de desempenho foram separadas das suítes paralelas para reduzir interferência.

Na fixture densa (3.000 segmentos, 80 tokens, viewport 1440×900), giro teve mediana de 10,2/11,8ms e zoom de 17,2/22,1ms em DPR 1/2. O p95 do zoom foi 19,5/27,8ms. Buffers RGBA das três camadas medidas somaram 9,2/36,9MiB; isso não representa a memória total do navegador. São 12 amostras por gesto, sem rede real: não equivalem a FPS contínuo, benchmark de todos os dispositivos ou capacidade de milhares de usuários. Nenhum limite de travamento do teste foi ultrapassado, mas o cenário denso em DPR 2 já exige cautela com o orçamento de quadros. Em 20 quadros de giro com conteúdo lateral inalterado, os novos testes confirmam zero reconstruções do resumo/iniciativa e manutenção do foco; a mudança de visibilidade e retrato continua atualizando a interface.

Evidência local em `test-results/production-*` e `test-results/guide-*`, ignorada pelo Git. Executar `npm run test:production` para os casos novos; `npm run check:js`, `audit:static`, `audit:css`, `audit:pendencias` e `npm run build` para guardas/artefato. Fonte e pacote minificado tiveram execuções distintas. O workflow recebeu os casos novos, mas não foi disparado no GitHub.

Limites: Chromium local; rede/credenciais de fixtures; nenhum teste conectado autenticado, NVDA/VoiceOver ou homologação mobile completa; nenhuma auditoria integral de segurança. Workflow configurado localmente não equivale a execução no GitHub. Testes não garantem ausência de bugs ou 60 FPS em qualquer computador.

Registro posterior: Tiago autorizou commit/publicação em 2026-10-02. O conjunto foi enviado à `main` em `c5c9c55`; API e Cloudflare Pages publicados. Resultados efetivos do pipeline, destinos e conferência de bindings estão em `../DEV_STATUS.md`, seção "Publicacao beta autorizada". Os limites e resultados locais deste relatório continuam sendo históricos; publicação não significa homologação autenticada ou aprovação de produção.

O primeiro pipeline detectou dois overflows de Regras/Sugestões no Linux com texto 150%; foram reproduzidos com fontes alternativas e corrigidos em `e597141`, sem afrouxar a guarda. A nova execução [37031765142](https://github.com/TiagoPsm/armagedon-rpg/actions/runs/37031765142) aprovou 51 Node, 11 build e 167 casos do pacote minificado e publicou GitHub Pages. Os dois destinos servem as seis páginas (200), incluindo Echos; conteúdo minificado do GitHub conferido contra o artefato local. A configuração Cloudflare ainda entrega bundles concatenados, melhoria registrada somente na lista viva. Fechamento de publicação confirmado, não de homologação autenticada ou acessibilidade integral.
