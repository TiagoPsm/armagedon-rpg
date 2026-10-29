# Auditoria de bugs e interface — 2026-10-02

Resultado: dez grupos de defeitos reproduzidos receberam correções locais, com testes de regressão. A interface foi conferida em capturas da fonte e do pacote minificado. Nenhum commit, envio, deploy ou alteração de dados de produção foi feito nesta rodada.

Esta é uma varredura ampla do projeto, não garantia de ausência de bugs. Os limites de cobertura estão descritos abaixo. As alterações anteriores da Mesa e os arquivos locais do usuário foram preservados.

## Método e microentregas concluídas

| Entrega | Escopo | Evidência |
| --- | --- | --- |
| QA1 | Git, documentação, sintaxe, referências, regressão da base | 489 testes de navegador na base; 48 contratos Node; dois testes online pulados |
| QA2 | Miniaturas, cache limitado e retorno pela biblioteca | Reproduzido com 140 mapas; seis testes após correção |
| QA3 | Campos numéricos, confirmação por Enter e histórico | Onze testes de moldes e 34 de luzes/barreiras |
| QA4 | Contenção de controles, alinhamento, CSS, foco e movimento reduzido | Seis páginas; 390/1280px; ferramentas em 1024/1366/1920px e texto 100/150% |
| QA5 | Links e páginas presentes no build | Onze testes de pacote normal/minificado, incluindo Echos |
| QA6 | Exclusão imediata entre giro do token e editores | Três falhas reproduzidas antes da correção; 67 testes de interface/visão/movimento depois |
| QA7 | Regras/Sugestões: CRUD, gravação lenta e falhas de rede | Oito casos novos; suite de interface/portal com 27 testes |
| QA8 | Guardas de regressão e fechamento integrado | 519 testes da fonte, 51 Node, 11 de build e 55 no artefato final; workflow atualizado localmente |

Os números das microentregas se sobrepõem. Não devem ser somados como testes únicos.

As skills de frontend, design escuro, integridade de layout, Canvas e playtest orientaram a revisão: manter a identidade atual, proteger a área do mapa, separar gesto/estado confirmado e validar visualmente antes de concluir. A orientação antiga de Canvas não foi usada para trocar o renderer de tokens DOM.

## Defeitos corrigidos

Prioridades representam impacto observado: P1 quebra de acesso a uma página publicada; P2 comportamento incorreto em fluxos usuais; P3 acabamento ou trabalho desnecessário.

| Prioridade | Defeito e reprodução | Correção e localização |
| --- | --- | --- |
| P1 | Ficha apontava para Echos, mas `echos.html` não entrava no pacote publicado | Incluído em `tools/build-pages.cjs` e `tools/audit-static.cjs`; teste de existência de páginas e links locais do artefato |
| P2 | Regras/Sugestões aceitavam novo envio durante uma gravação lenta | Guarda de gravação, botões indisponíveis, campos somente leitura e `aria-busy` em `js/regras.js` e `js/sugestoes.js` |
| P2 | Exclusão com falha de rede gerava rejeição não tratada e nenhum aviso | Tratamento de falha conserva o card e apresenta aviso. Escrita aceita e falha posterior de atualização da lista são estados distintos |
| P2 | Após percorrer mais de 128 miniaturas, voltar à primeira podia mostrar uma URL já revogada | `js/mesa-map-library.js` invalida a linha e rearma observação; cache LRU e reutilização de URLs em leituras concorrentes. Originais preservados |
| P2 | Controle de giro ainda podia agir nos primeiros quadros ao entrar nos editores de luz, grade ou desenho | Guarda imediata em `js/mesa-token-facing.js`, sem depender do timer de hover. Teste após dois quadros em vez de aguardar ocultação tardia |
| P2 | Confirmar medida/intensidade inválida com Enter deixava no campo um valor diferente do realmente aceito | `js/mesa-templates.js` e `js/mesa-lighting.js` restauram o valor confirmado mesmo com foco e mostram aviso; digitação intermediária permanece livre |
| P3 | Reconfirmar o valor exibido criava histórico, IDs novos e gravações inúteis | Comparação na precisão exibida; `js/mesa-barriers-editor.js` também ignora snapshot idêntico antes de reconstruir/gravar |
| P3 | Seletor de decorações estreito, legendas de ações quebradas e badge saindo da sidebar com texto ampliado | Seletor em linha inteira, ações empilhadas e cabeçalho flexível em `css/mesa-drawing.css` e `css/mesa.css` |
| P3 | Dois parênteses excedentes descartavam cores do inspetor; outro controle usava token de cor inexistente | Corrigidos em `css/mesa-inspector.css` e `css/mesa-drawing.css`; guarda lexical `tools/audit-css.cjs` e três testes de regressão |
| P3 | Flyout de desenho ignorava preferência de movimento reduzido | Regra `prefers-reduced-motion` em `css/mesa-drawing.css`; foco por teclado conferido |

Também foi protegido o formulário contra reenvio de uma postagem já salva quando apenas a leitura posterior da lista falha. Falha de escrita mantém o rascunho; falha de atualização não apresenta uma postagem confirmada como se ainda estivesse por gravar.

## Validação final e limites

| Verificação | Resultado local |
| --- | --- |
| Regressão de navegador da fonte | 519 passaram; dois testes de Worker online pulados; 4,6 min |
| Contratos/geometria/SQLite/DO e guarda CSS | 51 passaram |
| Pacotes normal e minificado / ordem / links | Onze passaram |
| Interface e fluxos no `_site` final minificado | 55 passaram; 53,3 s |
| Desempenho P1 isolado, DPR1/2 | Seis cenários passaram, 14 s; métricas abaixo |
| Auditorias JS/referências/CSS/pendências | 65 JS e 16 CSS; passaram |

Cobertura visual: Início, Ficha, Mesa, Regras, Sugestões e Echos. Capturas aguardam fontes e o fim das animações finitas. Contenção dos painéis, textos ampliados, foco, preferência de movimento reduzido e conflitos de ferramentas foram verificados. Inputs/selects nativos foram avaliados pela caixa; seu `scrollWidth` interno não foi confundido com overflow do painel.

A Mesa possui testes de visão individual, paredes/portas, colisão, giro contínuo, movimento/curvas, grade, luzes, moldes, persistência, conflitos e papéis. Regras/Sugestões receberam testes locais de criar/editar/cancelar/excluir/F5 e respostas de rede simuladas. Echos recebeu boot/layout e inclusão no build, não homologação de seus fluxos autenticados.

Limites: Chromium local, não comparação entre navegadores; 390px é checagem de layout, não homologação mobile completa. Respostas simuladas e testes de DO/SQLite não substituem mestre e jogador conectados ao Worker real. Não foi feita auditoria integral de acessibilidade ou segurança. O workflow foi editado, mas não executado no GitHub nesta sessão.

Artefato conferido: `_site`, Mesa JS `5598bcae8187`, CSS `5695962ce460` (versões derivadas do conteúdo no build). Cache das referências editadas atualizado. Pacote minificado: Mesa JS 412,9 KiB e CSS 124,7 KiB antes de compressão HTTP; não representam o peso total carregado da página.

### Desempenho observado

Chromium 1440×900, palco 768×768, fixtures determinísticas com 100/800/3000 segmentos e 8/32/80 tokens. Doze amostras por fase; valores abaixo são trabalho síncrono da fase de zoom, não FPS completo. A guarda de 1000ms detecta travamentos grosseiros, não fluidez. Com apenas doze amostras, o p95 aproxima o pior caso dessa pequena execução.

| Cena | DPR1 mediana / p95 | DPR2 mediana / p95 |
| --- | --- | --- |
| Pequena, 100 segmentos / 8 tokens | 4,3 / 5,2 ms | 9,9 / 12,2 ms |
| Média, 800 / 32 | 6,7 / 9,0 ms | 14,5 / 18,0 ms |
| Densa, 3000 / 80 | 16,5 / 23,0 ms | 27,9 / 30,7 ms |

Bitmaps RGBA estimados das três camadas medidas: 9,2 MiB em DPR1 / 36,9 MiB em DPR2. Não é memória total do app/GPU. Não houve mudança de algoritmo de visão nesta auditoria nem promessa de 60 FPS. O caso denso continua sendo candidato a perfilamento e redução de trabalho redundante.

## Melhorias propostas — não implementadas nem backlog autorizado

A estética escura/vermelha funciona e foi preservada. O maior ganho agora é legibilidade e hierarquia, não adicionar efeitos ou novos painéis. A revisão ainda observou o rótulo da barra lateral fixa cortado ao ampliar texto a 150%; isso não está resolvido pela contenção dos painéis da cena.

| Ordem sugerida | Pequena entrega | Critério de aceitação |
| --- | --- | --- |
| 1 | Separar texto auxiliar legível de texto desabilitado; revisar placeholders e metadados | Texto necessário permanece legível em captura final, sem clarear toda a paleta nem depender só da cor |
| 2 | Dimensionar a barra de ferramentas conforme texto e limitar tipografia decorativa a títulos | Rótulos inteiros em 1366/1920px com texto 150%; controles compactos e área do mapa preservada |
| 3 | Priorizar nome do personagem nas listas; compactar ações secundárias com acesso por teclado | Nomes menos truncados, ações previsíveis e disponíveis sem depender exclusivamente de hover |
| 4 | Hierarquia nas configurações: ferramenta ativa → próximo gesto → propriedades do selecionado | Paredes/portas continuam na própria seção da cena; menos informação simultânea, sem esconder ações principais em janelas |
| 5 | Padronizar indicação discreta de salvando/confirmado/falha | Não confundir rascunho local com confirmação remota; tentar novamente não duplica conteúdo |
| 6 | Perfilar atualização do resumo/iniciativa e camadas durante giro/câmera | Fixture isolada, mesma cena/DPR; reduzir trabalho sem quebrar ocultação, seleção ou conteúdo remoto |

Indício objetivo de legibilidade: contra `#0f0f0f`, as cores sólidas atuais `--text-faint` (`#3a382f`) e `--text-soft` (`#8a8272`) têm razões de contraste calculadas de aproximadamente 1,63:1 e 5,04:1. Opacidade e outros fundos mudam o resultado. Não é declaração de conformidade. Reservar a primeira para estados realmente indisponíveis; não mudar o token global sem conferir os consumidores.

Indício para perfilamento: `requestMesaVisionRender()` também chama `renderSummary()` e `renderInitiative()` quando a visão está ativa. Medir se esses consumidores precisam mudar em cada giro/câmera antes de introduzir invalidação mais fina; visibilidade pode depender deles. Manter cache limitado, geometria espacial existente e render recortado ao viewport. Não trocar engine ou adicionar dependência paga sem evidência de necessidade.

Estas propostas não abrem uma segunda lista de pendências. Decisões autorizadas e publicação/homologação continuam exclusivamente em `DEV_STATUS.md`, seção `Pendencias Vivas`.

## Reproduzir a checagem

Com Node/npm disponíveis, execute:

```text
npm run check:js
npm run audit:static
npm run audit:css
npm run audit:pendencias
npm run test:mesa:vision
node --test tests/css-syntax.test.cjs
npx playwright test tests/build-pages.spec.cjs --workers=1
npx playwright test tests/mesa-vision-performance.spec.cjs --workers=1
npm run build
```

Para conferir o pacote final no PowerShell:

```powershell
$env:MESA_TEST_ARTIFACT = '1'
npx playwright test tests/project-ui-audit.spec.cjs tests/mesa-map-library.spec.cjs tests/mesa-templates.spec.cjs tests/mesa-lighting.spec.cjs --workers=1
Remove-Item Env:MESA_TEST_ARTIFACT
```

Evidências locais ignoradas pelo Git: `test-results/audit-final-source`, `audit-final-build`, `audit-final-performance` e `audit-final-artifact`. O relatório permanece versionável; screenshots/relatórios gerados não entram no produto. No Windows deste workspace, caso Node esteja fora do PATH, usar o runtime existente, sem instalar outro.
