# Mesa: contratos das microentregas

Sequência definida em 2026-10-01 a partir do escopo de funcionalidades da Mesa. Desktop primeiro; preservar JavaScript vanilla, identidade visual e recursos gratuitos existentes. Segurança, monetização e automação do RPG autoral não fazem parte desta frente.

Este documento define escopo, dependências e aceite, não mantém outra lista de tarefas abertas. O andamento fica exclusivamente em `DEV_STATUS.md`, seção `Pendencias Vivas`; entregas encerradas recebem registro próprio no mesmo arquivo. Referência de produto: `COMPARATIVO-VTT-2026-10-01.md`.

## Método de execução

Uma microentrega por ciclo: conferir a base existente, implementar apenas o comportamento descrito, testar, revisar a captura quando houver mudança visual e registrar o resultado. A seguinte começa sobre a versão validada da anterior. Não adicionar um recurso já existente sem identificar a melhoria necessária.

Cada ciclo deve preservar dados e gestos anteriores, atualizar documentação e cache dos arquivos alterados. Prévia de gesto é local; confirmação e persistência continuam no fluxo existente. Desfazer corresponde à ação inteira, nunca a cada quadro do arrasto. Não mudar schema, engine ou protocolo por antecipação; alterações de contrato entram somente na entrega que delas depende.

Código/testes locais, artefato de publicação e sessão online são evidências diferentes. Publicação e homologação conectada têm ciclos próprios; não declarar uma feature online por ter passado em testes locais.

## 1. Editor de paredes e portas

| ID | Comportamento isolado | Depende de | Aceite verificável |
| --- | --- | --- | --- |
| W1 | Selecionar um trecho existente. | Base atual | Parede/porta e extremidades destacadas; área vazia limpa; Escape/direito/troca de ferramenta encerram. Seleção não altera geometria, revisão, salvamento ou histórico. |
| W2 | Arrastar uma extremidade do trecho selecionado. | W1 | Prévia contínua; uma alteração ao soltar; Escape/pointercancel/blur descartam. Não criar segmento sem comprimento; desfazer/refazer restaura coordenadas exatas. Validar zoom/pan e atualização remota durante gesto. |
| W3 | Encaixar extremidades em vértices próximos. | W2 | Alvo destacado com tolerância em pixels de tela; extremidades coincidem exatamente. Possibilidade explícita de desenho livre. Definir comportamento de vértices compartilhados antes de permitir movimento coletivo. |
| W4 | Dividir um trecho. | W1 | Ponto projetado no segmento; dois trechos contíguos equivalentes ao original; sem duplicação ou fresta; um passo de desfazer. |
| W5 | Unir dois trechos compatíveis. | W3, W4 | Apenas colineares/contíguos com mesmas propriedades; rejeitar perda de porta ou alteração de forma; um passo de desfazer. |
| W6 | Configurar estado de uma porta selecionada. | W1 | Mestre alterna aberta/fechada/trancada; visão/passagem respeitam estado; jogador próximo abre somente porta permitida. Preservar recorte de porta já implementado. |
| W7 | Selecionar vários trechos. | W1 | Seleção aditiva e por área, destaque discreto e limpeza previsível; selecionar não salva nem interfere nos tokens. Sem transformações nesta entrega. |
| W8 | Mover um conjunto selecionado. | W7, W2 | Prévia mantém posição relativa e junções; limite da cena aplicado ao conjunto; confirmação/cancelamento/desfazer atômicos. |
| W9 | Copiar e colar uma estrutura. | W7, W8 | Novos IDs; posições relativas e propriedades preservadas; destino mostrado antes de confirmar; nenhuma ligação acidental à estrutura original. |

## 2. Grade e movimento

| ID | Comportamento isolado | Depende de | Aceite verificável |
| --- | --- | --- | --- |
| G1 | Calibrar grade por referências do mapa. | Base atual | Prévia antes de aplicar; células quadradas e contagem inteira; não distorcer imagem. Token, rastro e régua usam a mesma geometria. Escala em metros mantém opções fechadas. |
| G2 | Ajustar a origem da grade com prévia. | G1 | Deslocar grade sem mover mapa/tokens; cancelar restaura configuração; mostrar somente células completas na área útil. |
| M1 | Remover o último ponto de passagem durante arrasto. | Movimento com curvas atual | Remover um ponto recalcula caminho, colisão e metros, preservando anteriores; indicação discreta só durante planejamento; não mover token real antes de soltar. |
| M2 | Compartilhar o percurso confirmado. | M1 | Dois clientes animam as mesmas curvas, com origem/destino e duração coerentes. Validar contrato/limites no servidor, duplicatas, mensagens atrasadas e reconexão. Não persistir quadros de animação. |

## 3. Visão, desempenho e depois iluminação

| ID | Comportamento isolado | Depende de | Aceite verificável |
| --- | --- | --- | --- |
| P1 | Medir a base de interação em cenas representativas. | Editor validado | Fixtures pequena/média/densa, número de segmentos/tokens registrado; medir arrasto, giro, pan e zoom com DPR/resolução definidos. Registrar tempo de quadro, alocação e metodologia, sem inventar ganho. |
| V1 | Consolidar oclusão em cantos e junções. | W3, W4, P1 | Casos de caverna, concavidade, segmentos cruzados/curtos e portas abertas/fechadas; visão individual, preto fora do cone e colisão preservados. Testes de pixels e geometria compartilham fixtures. |
| P2 | Recortar renderização de paredes/máscara ao viewport. | V1, P1 | Mesma imagem e hit-testing em zoom/pan; comparar custo e memória antes/depois. Sem renderização redundante de camada não alterada; preservar teto de memória. Tiles de mapas só se medições justificarem. |
| V2 | Controle de iluminação global por cena. | V1, P2 | Definir primeiro a semântica de escuridão com Tiago. Opção nova não altera automaticamente cenas existentes nem revela fora da visão individual. Mestre controla; teste como jogador. |
| V3 | Uma fonte de luz local simples. | V2 | Colocar, mover, ajustar raio/intensidade e remover; paredes/portas recortam luz. Cancelamento, salvamento e dois clientes concordam. Sem visão no escuro/regras autorais nesta entrega. |

## 4. Ferramentas de jogo

| ID | Comportamento isolado | Depende de | Aceite verificável |
| --- | --- | --- | --- |
| T1 | Molde circular com medida. | Grade consolidada | Centro/raio ajustáveis; metros corretos; colocar, editar e remover sem disputar gesto com token. |
| T2 | Molde de cone com direção. | T1 | Direção, abertura e alcance editáveis; mesma escala de cena e feedback discreto. |
| T3 | Molde retangular. | T1 | Largura/altura e rotação; proporção correta sob zoom; um gesto confirmado por ação. |
| T4 | Molde de linha com largura. | T1 | Comprimento/largura/direção; distinção clara de desenho decorativo; sem automatizar dano ou alvo. |
| T5 | Régua com pontos de passagem. | Medição atual, M1 | Distância acumulada coerente com movimento; remover último ponto/concluir/cancelar; não substituir régua atual por uma cópia independente. |
| U1 | Atalhos e ajuda contextual dos novos gestos. | Ferramentas validadas | Atalhos não disparam em inputs; foco visível; ajuda concisa só no contexto ativo; manter cliques como alternativa. |

## 5. Preparação de cenas

| ID | Comportamento isolado | Depende de | Aceite verificável |
| --- | --- | --- | --- |
| C1 | Reutilizar configuração de cena. | G2, W9 | Aplicação com prévia e confirmação explícita; não sobrescrever mapa/tokens/objetos sem indicar escopo; usar mecanismos de cenas existentes. |
| C2 | Busca e miniaturas na biblioteca existente. | Base atual | Buscar/selecionar sem baixar toda mídia; feedback de carregamento/arquivo ausente; medir custo com biblioteca maior. |
| C3 | Bloquear decoração contra seleção acidental. | Base de seleção atual | Objetos bloqueados não interceptam movimento; mestre desbloqueia de forma explícita; estado preservado ao reabrir cena. |

## Fechamento de cada ciclo

Teste do comportamento novo + regressões proporcionais dos vizinhos; captura visual inspecionada; sintaxe, referências, controles armados e consistência de documentação. Para persistência/protocolo, incluir round-trip controlado e falha de rede. Anotar limitações reais e evidência, sem declarar cobertura total ou garantia de ausência de bugs.

O progresso e a evidência de cada ciclo ficam em `DEV_STATUS.md`. Para iluminação, Tiago confirmou: manter visão atual por padrão, escuridão opcional do mestre e luzes revelando somente dentro do campo individual.
