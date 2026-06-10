# SYSTEM RULES

Este arquivo registra regras funcionais e de gameplay que nao devem ser alteradas sem autorizacao explicita.

## Regra Obrigatoria de Documentacao

Sempre que uma mudanca alterar ou esclarecer regra de gameplay, permissao, persistencia ou validacao, este arquivo deve ser atualizado na mesma etapa. Tambem atualize `DEV_STATUS.md` com resumo, arquivos afetados e validacoes.

## Pasta Oficial de Trabalho

Mudancas de regra, persistencia ou permissao devem ser feitas no checkout Git oficial:

```text
C:\Users\tiago\OneDrive\Desktop\Próxima Campanha\FichaApp\rpg-campaign-git-sync
```

Nao use a pasta antiga `rpg-campaign` para alterar regras ou publicar commits.

## Principio Geral

- Melhorias visuais podem ser feitas
- Organizacao pode ser melhorada
- Codigo pode ser refatorado
- Regras do sistema nao devem ser alteradas sem pedido claro do usuario

## Banco e Persistencia

- O site publicado usa Cloudflare Workers + Cloudflare D1
- Dados sao centralizados no servidor
- Nao voltar para salvamento principal em `localStorage`
- Fallback local so pode existir como apoio, nao como fonte principal em producao

## Papeis de Usuario

- `master`: mestre
- `player`: jogador

Permissoes importantes:

- apenas o mestre cria jogadores
- apenas o mestre cria NPCs
- apenas o mestre cria monstros
- apenas o mestre publica, edita e exclui regras
- o jogador gerencia o nucleo da alma apenas da propria ficha (aplicar Essencia e concluir pesadelo); o mestre gerencia o nucleo de todas as fichas
- todo ganho de Essencia aplicado por jogador deve gerar auditoria e aviso em tempo real ao mestre (planejado, ainda nao implementado)

## Fichas

Tipos de ficha:

- jogador
- NPC
- monstro

Habilidades registradas na ficha devem preservar:

- identificador interno (`id`)
- nome
- tipo (`ativa` ou `passiva`)
- gatilho
- descricao

## Recursos

- Vida continua existindo
- Integridade substitui Sanidade
- Integridade maxima e derivada de Alma
- Regra atual:
  - a cada 3 pontos de Alma, +1 de Integridade maxima
- O frontend e o backend devem recalcular Integridade maxima antes de salvar, sem aceitar `integMax` divergente vindo do cliente
- Vida atual nao pode passar da Vida maxima
- Integridade atual nao pode passar da Integridade maxima
- Jogador pode alterar sua Integridade atual na ficha
- Jogador pode alterar sua Integridade atual na Mesa quando controla o proprio token
- Vida atual de jogador, NPC e monstro nao pode passar da Vida maxima
- Integridade atual nao pode passar da Integridade maxima
- O limite deve existir no frontend e no backend, nao apenas na interface

## Atributos

Atributos atuais:

- Forca
- Agilidade
- Inteligencia
- Resistencia
- Alma

Regras:

- sem limite superior de valor
- modificador sobe em +1 a cada 3 pontos

## Inventario

- minimo atual: 10 slots
- jogador nao ve botoes de aumentar e diminuir inventario
- mestre pode ajustar inventario quando a interface permitir
- inventario deve abrir item em pop-up ao clicar
- layout deve ser compacto e organizado

## Monstros

Regras consolidadas:

- monstros nao tem Integridade
- monstros nao tem inventario
- monstros nao tem faccao
- monstros possuem secao de drop de memoria

## Memorias

- jogadores e NPCs tem memorias possuidas
- memorias podem ser transferidas entre jogadores
- mestre pode conceder memoria dropada de monstro

## Transferencias

Tipos ja previstos e auditados:

- item de jogador para jogador
- memoria de jogador para jogador
- memoria obtida por drop de monstro

Regras importantes:

- troca de itens deve acontecer apenas entre jogadores
- destino nao pode receber item se a mochila estiver cheia
- operacoes multi-etapa devem evitar estado parcial sempre que o backend permitir transacao/batch
- no Worker, transferencias jogador-para-jogador devem gravar origem, destino e auditoria no mesmo `DB.batch`
- transferencia jogador -> jogador passara a exigir aceite do destino; o item so sai da origem no momento do aceite, com revalidacao; envios do mestre entram direto (planejado, ainda nao implementado)

## Sessao e Modo Offline

- Sessao criada pelo servidor nao pode cair silenciosamente para salvamento local
- Se a API publicada estiver indisponivel durante uma sessao backend, o fluxo bloqueia a pagina e PRESERVA a sessao (token continua no navegador); o usuario ve aviso de servidor indisponivel e volta a entrar quando a API responder
- O health-check da API usa timeout de 5s com 2 tentativas (cold start do Worker nao pode derrubar a sessao)
- O modo local (sem API) so ativa com a flag explicita `localStorage.armagedonDevMode = "1"`, exclusiva para desenvolvimento; nesse modo qualquer credencial entra e o usuario `mestre` recebe papel master, com dados somente no navegador
- Nao existem mais credenciais de login embutidas no codigo do site

## Mesa Digital

- A cena oficial da Mesa deve ser salva no Cloudflare D1 quando a API estiver ativa
- `localStorage` da Mesa e apenas fallback/cache local, nao fonte principal da cena publicada
- Jogadores podem ler a cena oficial liberada pelo mestre
- Apenas o mestre pode salvar posicao, ordem, visibilidade e exposicao de status dos tokens da cena
- Realtime/WebSocket ja existe via Durable Object (`MesaRealtimeRoom`); alteracoes de cena em tempo real (`mesa:token:*`, `mesa:scene:clear`) sao exclusivas do mestre
- Sinais de mapa que distribuem ou limpam conteudo (`mesa:map:announce`, `mesa:map:set`, `mesa:map:clear`, `mesa:map:offer`, `mesa:map:ws:*`) sao exclusivos do mestre; sinais jogador -> mestre (`have`, `need`, `answer`, `ice`) continuam liberados
- Jogador podera mover o proprio token, com trava global controlada pelo mestre (planejado, ainda nao implementado)

## Rolagem de Dados

A ficha possui rolagem propria.

Funcionalidades consolidadas:

- escolha do dado
- quantidade
- modificador
- expressao livre
- vantagem
- desvantagem

## Progressao por Essencias da Alma

Ranks:

1. Adormecido
2. Despertado
3. Ascendido
4. Transcendido
5. Supremo
6. Sagrado
7. Divino

Regras consolidadas:

- ganho de XP baseado no rank da essencia
- multiplicador conforme diferenca entre rank da essencia e rank do personagem
- XP final arredondado para baixo
- mantem excedente ao subir
- nao sobe alem do rank 7

Progressao atual mais dificil:

- 1 -> 2: 1000 XP
- 2 -> 3: 2500 XP
- 3 -> 4: 5000 XP
- 4 -> 5: 10000 XP
- 5 -> 6: 20000 XP
- 6 -> 7: 40000 XP

## Login do Mestre

- usuario bootstrap do mestre: `mestre`
- senha definida por segredo do Worker
- nao alterar o fluxo de bootstrap sem necessidade

## Padrao de Trabalho Futuro

Para cada nova etapa:

1. escopo pequeno e fechado
2. implementacao
3. validacao de sintaxe e logica
4. lista exata de arquivos alterados
5. orientacao clara do que subir
6. atualizacao dos arquivos `.md` de referencia

Se uma etapa mexer no site e nao atualizar documentacao, ela deve ser considerada incompleta.
