# Armagedom e mesas virtuais: comparação e direção de produto

Pesquisa em 2026-10-01. Propostas para avaliação, não tarefas abertas ou compromissos de implementação. Fontes primárias dos produtos; não é ranking de participação de mercado. Sem teste presencial das plataformas concorrentes. Armagedom avaliado pelo código e documentação locais, não pela versão publicada.

## Escopo atual confirmado: funcionalidades da Mesa

Em 2026-10-01, a pedido do Tiago, esta frente foi desmembrada em `MESA-MICROENTREGAS.md`, com dependencias e aceite por comportamento. A execucao e registrada em `DEV_STATUS.md`; W1 introduziu selecao local de trechos. A pesquisa ampla abaixo nao amplia esse escopo.

Tiago restringiu a frente atual a ferramentas da própria Mesa. Segurança, monetização e integração/automação do RPG autoral ficam fora desta sequência. As seções amplas abaixo permanecem como referência de pesquisa, não como prioridades atuais.

| Ordem | Frente | Entrega proposta | Critério de conclusão |
| --- | --- | --- | --- |
| 1 | Editor de paredes e portas | Seleção com destaque, arrasto das extremidades, encaixe entre vértices, dividir segmentos, converter trecho em porta e configurar estado, seleção coletiva e desfazer/refazer. | Corrigir e reutilizar um contorno sem apagar a estrutura; nenhuma fresta involuntária nas junções; gestos coerentes com zoom/pan. |
| 2 | Grade e movimento | Calibrar grade pelo desenho do mapa, ajustar origem sem mexer na imagem, remover último ponto do percurso, indicação discreta de vértices e compartilhar a mesma animação entre participantes. | Grade, rastro, distância e posição final concordam; todos veem as curvas confirmadas. Hoje espectadores ainda interpolam em linha direta. |
| 3 | Visão e iluminação | Consolidar cone/oclusão e teste como jogador; depois adicionar luz global/local, raio e intensidade simples, respeitando paredes/portas. | Sem vazamentos por cantos e junções, nem alteração da preferência atual: visão individual e preto fora do campo. |
| 4 | Ferramentas durante o jogo | Moldes de círculo/cone/retângulo/linha com medida e rotação, régua com pontos, marcadores contextuais e atalhos visíveis. | Colocar, ajustar e remover uma marcação sem interromper a manipulação do mapa/token. |
| 5 | Preparação de cenas | Aprimorar biblioteca/busca e miniaturas; modelos de configuração; reutilização de grupos de objetos e estruturas; bloquear decoração para evitar seleção acidental. | Preparar a segunda cena aproveitando a primeira, sem repetir configuração e montagem. |
| Contínua | Desempenho e consistência | Medir pan/zoom/arrasto/giro; redesenhar apenas camadas alteradas; recortar paredes/máscara ao viewport; reutilizar buffers e reduzir trabalho de geometria durante giro. | Registrar comportamento em cena pequena, média e densa, com zoom alto; comparar antes/depois. Não declarar melhoria só por alteração de código. |

Detalhe visual: contorno do rastro sem divisórias extras; vértices de percurso discretos e apenas durante planejamento; editor claramente ativo, sem disputar gesto com movimento. Iluminação vem depois de edição precisa de barreiras. Imagens divididas em blocos por zoom ficam condicionadas a medições que justifiquem a complexidade.

Não há proposta de mudar engine/framework, introduzir 3D, suporte a múltiplos sistemas ou desenvolver voz/vídeo próprios nesta frente. Desktop permanece o alvo principal. Esta sequência é planejamento, não implementação já entregue.

## Direção de produto da pesquisa inicial

Uma mesa integrada ao RPG autoral: entrar facilmente, preparar uma sessão com pouco trabalho e executar as regras de Armagedom sem depender de adaptações ou extensões. A identidade está em Integridade, Memórias, Echos, habilidades e progressão. A qualidade da mesa sustenta esse diferencial.

## Referências

| Plataforma | Oferta e recursos documentados | Aprendizado para Armagedom |
| --- | --- | --- |
| Foundry VTT | Licença de compra única, hospedagem própria, sistemas e módulos; editor de paredes com seleção, edição, encadeamento, encaixe, portas e diferentes restrições. | Precisão e produtividade do editor; manter ferramentas avançadas sob demanda. |
| Roll20 | Mesa no navegador com fichas, dados, comunicação, materiais compartilhados e compêndios; planos gratuitos e pagos, com iluminação dinâmica entre benefícios pagos. | Acesso sem instalação e conteúdo consultável durante a sessão. |
| Fantasy Grounds | Aplicativo atualmente gratuito; conteúdo oficial e comunitário opcional. Automação conecta ficha, alvo, efeitos e rastreador de combate, com profundidade variável por sistema. | Automatizar o ciclo do RPG autoral e conservar intervenção do mestre. |
| Owlbear Rodeo | Mesa no navegador centrada em mapas, tokens, desenho e névoa; extensões e entrada por link. Plano gratuito e assinaturas com mais armazenamento/salas. | Poucos passos para jogar e baixo peso da interface. |

Fontes: [Foundry: produto](https://foundryvtt.com/), [paredes](https://foundryvtt.com/article/walls/); [Roll20: recursos e planos](https://app.roll20.net/why-subscribe-to-roll20), [compêndios](https://app.roll20.net/compendium); [Fantasy Grounds: aplicativo](https://www.fantasygrounds.com/vtt/), [automação](https://www.fantasygrounds.com/features/automation); [Owlbear: introdução](https://docs.owlbear.rodeo/docs/getting-started/), [assinaturas](https://docs.owlbear.rodeo/docs/managing-your-subscription/).

As páginas antigas de licenças do Fantasy Grounds ainda aparecem em buscas; a comparação usa a oferta atual declarada na página do aplicativo.

Disponibilidade da iluminação Roll20: [documentação oficial](https://help.roll20.net/hc/en-us/articles/4403801475479-What-Is-Dynamic-Lighting).

## Base existente no Armagedom

Fichas de jogadores/NPCs/monstros; Vida e Integridade; inventário, Memórias e Echos; iniciativa, rolagem compartilhada no servidor, marcadores, mapas, cenas, névoa, régua e desenho. Visão individual em cone, paredes/portas e movimento com pontos de passagem estão implementados localmente. Não tratar ajustes locais como publicados ou homologados entre mestre/jogadores reais.

O editor atual cria e apaga segmentos e oferece desfazer/refazer; não possui a edição de vértices e seleção em lote encontrada na referência Foundry. Habilidades possuem descrição, tipo e gatilho; não equivalem a um motor completo de resolução de ações. Marcadores visuais não equivalem, por si, a condições com duração e modificadores.

## Melhorias prioritárias

### P0: confiança na sessão

- Homologar duas ou mais sessões conectadas: mestre/jogadores, reconexão, F5, portas, giro, mudança de cena e persistência. Critério: nenhum trabalho aceito desaparece ou atravessa permissões.
- Backup e restauração da campanha, com exportação de dados e referências/arquivos de mídia. Testar restauração, não apenas download.
- Exibir estado de salvamento/conexão e tratar conflitos de forma compreensível. Diferenciar rascunho, ação confirmada e falha.
- Recuperação de acesso, revogação de sessão e revisão de permissões antes de ampliar o público. Não tornar localStorage fonte principal.
- Unificar regras executáveis e versioná-las; revisar documentação histórica divergente antes de automatizar mais regras.

### P1: produtividade e identidade

- Editor de paredes: selecionar segmento, mover extremidade, encaixar em vértices próximos, dividir/unir, selecionar conjunto e copiar estrutura. Histórico e cancelamento coerentes.
- Portas: configurar aberta/fechada/trancada, controle claro do mestre e diagnóstico simples de alcance/bloqueio. Porta secreta é extensão posterior, não obrigação da primeira versão.
- Calibração da grade por dois pontos do desenho do mapa; prévia de alinhamento e opções avançadas de deslocamento. Conservar células quadradas.
- Barra contextual de ações do token: habilidade, alvo, teste, custo, resultado e aplicação confirmada. Mestre pode corrigir ou desfazer. Começar por uma ação frequente do sistema.
- Condições estruturadas: origem, duração em turnos, modificadores e momento de expiração. Usar a lista oficial do RPG autoral; não importar regras de D&D automaticamente.
- Compêndio autoral com busca, vínculos entre regras/itens/habilidades, visibilidade por papel e versão do sistema. Objetos reutilizáveis alimentam fichas e encontros.
- Unificar o fluxo de recompensa: derrota, concessão de Memória/Echo, dono e evolução; não duplicar os mecanismos já existentes de drop/transferência. Resolver a compatibilidade de invocação de Echo com visão ativa.
- Preparação reutilizável: encontros, grupos de inimigos, cenas-modelo e conteúdo com mapa, paredes, portas e fichas prontos.
- Diário e materiais compartilháveis: revelação seletiva de pistas, notas privadas e registro da sessão. Referência: [journals do Foundry](https://foundryvtt.com/article/journal/).

### P2: imersão e expansão

Luzes locais, alcance de visão e visão no escuro somente quando as regras estiverem definidas; áudio ambiente simples; áreas de efeito; melhorias de mídia para mapas grandes; acessibilidade e alternativa aos gestos de mouse. Mobile completo fica posterior, conforme foco desktop atual.

## Modelo de produto e negócio

Se continuar ferramenta de uma campanha, priorizar custo baixo e estabilidade. Se abrir para outros mestres, separar campanhas, participantes, cenas, fichas, mídia e canais de sincronização, com autorização no servidor em todas as operações. Várias cenas não são várias campanhas isoladas.

Uma hipótese coerente é mesa básica acessível e conteúdo autoral preparado opcional: aventuras, bestiários, cenários e pacotes completos. Assinatura de hospedagem só deve ser considerada com custos e demanda medidos; gratuidade para jogadores reduz a barreira de entrada. Não há monetização definida neste estudo.

Antes de comercializar: verificar origem e permissões de uso das artes, mapas, fontes e textos; documentar privacidade, suporte e acesso aos dados; definir limites de armazenamento/campanhas e recuperação. Não presumir licença comercial por um material já estar no site.

## Sequência recomendada e critérios de sucesso

1. Beta confiável: testar sessão conectada, salvar/restaurar e recuperar falhas.
2. Preparação rápida: editar paredes existentes, calibrar mapa e reutilizar encontros.
3. Um ciclo autoral completo: selecionar habilidade, resolver ação, atualizar recursos/condições e registrar resultado.
4. Entrada de uma nova mesa: tutorial curto, convite e aventura inicial pronta.
5. Só após evidência de uso, avaliar abertura comercial e recursos de escala.

Medir: tempo para entrar e preparar a primeira cena; cliques para ação frequente; falhas de salvamento/reconexão; latência p95 de interação e sincronização; sessões repetidas por grupo; custo de mídia por campanha. São critérios propostos, não resultados medidos.

As skills web-game-foundations e game-ui-frontend orientaram a separação entre regra, apresentação e persistência e a preferência por controles contextuais que preservam o mapa. Não se propõe migração de engine ou de framework.
