# Dark Mode Design Expert

**Source:** [curiositech/some_claude_skills](https://github.com/curiositech/some_claude_skills/blob/main/.claude/skills/dark-mode-design-expert/SKILL.md)

## Descrição
Especialista em CSS variables, temas dark/light, contrast accessibility, e design systems.

## Quando usar
- Auditar `css/tokens.css` contra acessibilidade WCAG 2.1 AA
- Refinar paleta: **preto + carmesim** (inspirado em Shadow Slave)
- Revisar color contrast em componentes
- Melhorar tema switching sem flash (prefers-color-scheme)
- Validar imagens e filtros em dark mode

## Invocação
```
/design:dark-mode-design-expert [arquivo CSS ou página HTML]
```

## Checklist para Armagedon

### Parte 1: Integridade de Texto ⭐ (NEW!)

**SEMPRE execute PRIMEIRO — procure por:**

#### Texto Visualmente Quebrado
- [ ] Texto truncado/cortado (ex: "Adicionar joga..." em vez de "Adicionar jogador")
- [ ] Caracteres estranhos ou ilegíveis (❓, ?, ██, [], {})
- [ ] Texto invisível (color == background, causando desaparecimento)
- [ ] Texto duplicado (mesmo texto 2x consecutivas)
- [ ] Texto fora de lugar (label em posição errada)
- [ ] HTML tags visíveis ("< span >", "&lt;p&gt;", "<div>")
- [ ] Encoding issues (acentos errados: "Mé" em vez de "Mê", "ação" em vez de "ação")
- [ ] Line breaks indevidos (quebra no meio da palavra: "adc-ionar")
- [ ] Whitespace estranho (espaços extras "Jogador  ativo", tabs visíveis)
- [ ] Unresponsive text on resize (texto some em certain viewports)

#### Conteúdo Semântico Estranho
- [ ] Labels não correspondem a inputs (label diz X, input faz Y)
- [ ] Mensagens de erro genéricas ("Erro" vs "Erro ao criar jogador")
- [ ] Botões com texto ambíguo ("Ok" vs "Adicionar jogador")
- [ ] Seções sem título ou title vago
- [ ] Descrições desatualizada (copy não corresponde a funcionalidade)
- [ ] Typos em palavras-chave (campanha/campana, personage/personagem)
- [ ] Traduções inconsistentes (português/english misturado)
- [ ] Números/IDs expostos (ex: "Error code: 0x234" para user)

#### Para cada problema encontrado, registre:
```
**Texto Quebrado:**
- Local: [página/seção/elemento]
- Texto atual: "[texto quebrado]"
- Esperado: "[texto correto]"
- Tipo: [truncado/invisível/typo/encoding/html-visible/duplicado]
- Severidade: [crítica/importante/sugestão]
```

---

### Parte 2: Design & Contrast

- [ ] CSS variables semânticas (`--card-bg`, `--token-alive`, etc)?
- [ ] Contrast ratio ≥4.5:1 para texto (WCAG AA)?
- [ ] `prefers-color-scheme: dark` detectando preferência do SO?
- [ ] Script de tema no `<body>` antes de render (sem flash)?
- [ ] Imagens com `filter: brightness(0.6) contrast(1.2)` em dark?
- [ ] Todos os tokens em `tokens.css` documentados?

### Parte 3: Identidade Visual de Componentes ⭐ (NEW!)

**IMPORTANTE: Procure por falta de distinção visual!**

- [ ] **Botões diferenciados de links?** ⭐
  - Buttons têm background color diferente?
  - Buttons têm padding claro (mín 8px 16px)?
  - Buttons têm hover state visível?
  - Links permanecem como links (sem background)?

- [ ] **Inputs diferenciados?**
  - Input tem border visível?
  - Input tem background diferente de texto normal?
  - Input tem :focus state (border color change)?
  - Labels estão associadas (não apenas próximas)?

- [ ] **Componentes organizados em containers?**
  - Form groups têm `.form-group` contenção?
  - Lists têm `.list-item` ou `.row` estrutura?
  - Cada ação/botão é visualmente diferenciado?

- [ ] **Hierarquia visual clara?**
  - Título > subtítulo > dados > ações (em tamanho/peso)?
  - Ações (botões) se destacam do fundo?
  - Elementos clicáveis têm cursor: pointer?
  - Elementos clicáveis têm :hover state?

## Arquivos-chave
- `css/tokens.css` — custom properties (cores, spacing, typography)
- `css/reset.css` — base reset
- `css/components.css` — componentes compartilhados
- `css/mesa*.css`, `css/ficha*.css` — específicos de página

---

## Como Detectar Texto Quebrado

### Estratégia de Busca

1. **Inspecionar HTML visualmente**
   - Leia `ficha.html`, `mesa.html`, etc
   - Procure por placeholders vazios (`<p></p>`)
   - Procure por strings suspeitas

2. **Verificar renderização de texto**
   - Labels vs inputs alignment
   - Mensagens de erro e confirm dialogs
   - Buttons text clarity

3. **Procurar por patterns comuns de quebra**
   - `...` (ellipsis - texto truncado)
   - `undefined`, `null` em strings
   - `[object Object]` (stringified object)
   - `??` ou `NA` ou `N/A` no lugar de dados reais

4. **Testar em diferentes contextos**
   - Com dados vazios
   - Com dados muito longos
   - Com caracteres especiais (acentos, emojis)
   - Em diferentes idiomas

### Exemplo de Achado

```
❌ Encontrado:
ficha.html (linha 145):
<h2 class="panel-block-title">Jogadores ativos</h2>
<p class="panel-block-sub">Visualize rapidamente quem já tem acesso criado 
e qual personagem está vinculado.</p>
Gerado em JS:
<span class="player-user">${esc(player.username)}</span>

Se player.username = undefined:
Resultado: <span class="player-user">undefined</span> ❌

Solução: Sempre fornecer fallback
<span class="player-user">${esc(player.username || "Sem nome")}</span> ✅
```
