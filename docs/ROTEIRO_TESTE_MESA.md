# Roteiro de Teste Manual — Mesa Virtual

Use duas abas/navegadores: uma como **mestre**, outra como **jogador**.
Para forçar o papel sem precisar logar duas contas reais, no console do navegador:

```js
localStorage.setItem('tc_session', JSON.stringify({ role: 'master', username: 'mestre' }));
location.reload();
// ou role: 'player' na outra aba
```

Marque cada item conforme for testando. Reporte qualquer coisa que não bater com o esperado.

---

## 1. Camadas (TOKENS / MESTRE / MAPA)

- [ ] Mestre vê os 3 botões no toolbar esquerdo: TOKENS, MESTRE, MAPA.
- [ ] Jogador vê **só** o botão TOKENS — MESTRE e MAPA não aparecem.
- [ ] Mestre troca para a camada MESTRE, recarrega a página → continua na camada MESTRE (persistência).
- [ ] Jogador recarrega a página → sempre cai em TOKENS, nunca trava em MESTRE/MAPA mesmo se o localStorage tiver isso salvo.
- [ ] Mestre na camada MAPA consegue mover/zoom o mapa de fundo; jogador não tem acesso a essa camada de forma alguma.

## 2. Tokens — adicionar e mover

- [ ] Mestre: arrasta um jogador, um NPC e um monstro do roster pro palco — todos aparecem.
- [ ] Jogador: só vê "Meu Token" e "Meus Echos" no painel pessoal (não vê o roster completo).
- [ ] Jogador: consegue colocar o próprio token no palco e invocar um Echo.
- [ ] Jogador: **não** consegue mover o token de outro jogador, NPC ou monstro.
- [ ] Mover um token em uma aba aparece corretamente na outra aba em tempo real (drag and drop sincroniza).

## 3. Camada secreta do Mestre (DM)

- [ ] Mestre: na camada MESTRE, arrasta um monstro pro palco → token nasce já marcado como secreto (esmaecido, pill "Mestre").
- [ ] Jogador: **não vê** esse token em nenhum momento, nem após recarregar a página.
- [ ] Mestre: no inspetor do token, alterna "Camada: Token ↔ Mestre" — ao voltar para "Token", o jogador passa a ver o token; ao mandar pra "Mestre", o jogador deixa de ver.
- [ ] Mestre: fecha e abre a aba de novo (ou F5) → o token secreto continua só visível pra ele (teste do fix do vazamento via backend).

## 4. Desenho (lápis, linha, retângulo, círculo, borracha)

- [ ] Mestre desenha com cada ferramenta na camada TOKENS → jogador vê o traço em tempo real.
- [ ] Mestre muda pra camada MESTRE e desenha → traço aparece mais translúcido só pra ele; jogador não vê nada.
- [ ] Mestre aperta Ctrl+Z **estando na camada TOKENS** depois de desenhar algo nas duas camadas → desfaz só o último traço de TOKENS, nunca um traço secreto.
- [ ] Mestre aperta Ctrl+Z **estando na camada MESTRE** → desfaz só o último traço secreto.
- [ ] Borracha apaga traços corretamente em ambas as camadas.
- [ ] Botão "Limpar tudo" remove os desenhos de todo mundo.

## 5. Inspetor de token (mestre)

- [ ] Selecionar um token abre o inspetor com Vida/Integridade editáveis.
- [ ] Alterar Vida atual/máxima e Integridade atual/máxima reflete no token e na ficha.
- [ ] Toggle "Visibilidade" (mostrar/ocultar pro jogador) funciona independente da camada.
- [ ] Toggle "Camada: Token ↔ Mestre" funciona (ver item 3).
- [ ] Redimensionar o token (tokenScale) e mover entre abas mestre/jogador propaga em tempo real (era um bug corrigido — confirmar que sincroniza sem precisar salvar a cena).

## 6. Zoom, pan e seleção

- [ ] Zoom in/out com os botões e com a roda do mouse funciona suavemente.
- [ ] Pan (botão direito ou modo "mover") desloca a visão sem mover tokens.
- [ ] Seleção em caixa (rubber-band) seleciona múltiplos tokens/traços.
- [ ] Mover/redimensionar seleção múltipla funciona mesmo com zoom diferente de 100%.

## 7. Painel do jogador

- [ ] Mostra corretamente "Meu Token" com Vida/Integridade editáveis (dentro do permitido).
- [ ] "Meus Echos" lista os Echos do jogador, com botão de invocar/remover funcionando.
- [ ] Jogador não vê nada do roster de outros personagens, NPCs ou monstros.

## 8. Geral / regressão

- [ ] Console sem erros em nenhuma das abas (mestre e jogador) durante todo o teste.
- [ ] Trocar de aba/recarregar não perde o estado da cena (tokens nas posições certas).
- [ ] Realtime reconecta sozinho se a internet cair e voltar (sem precisar recarregar).

---

**Bugs corrigidos nesta rodada (o que este roteiro está validando):**
1. Token marcado como secreto ("Camada Mestre") não vaza mais para jogadores via backend (item 3).
2. Ctrl+Z não apaga mais um traço secreto por acidente ao desfazer na camada normal (item 4).
3. Camada MAPA agora é exclusiva do mestre, igual à camada MESTRE (item 1).
4. Redimensionar token (tokenScale) agora sincroniza em tempo real entre abas (item 5).
