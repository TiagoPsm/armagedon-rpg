# 📚 Guia de Skills para Armagedom

## Como funcionam as Skills no Claude Code?

### 1️⃣ **Skills Executáveis** (Built-in)
São comandos como `/code-review`, `/verify`, `/design` — aparecem no menu e podem ser invocados com `/`.

Você já tem essas skills através de plugins:
- Design, Miro, Figma, Apollo skills, Code simplifier

### 2️⃣ **SKILL.md Guides** (Documentação + Padrões)
São arquivos `.md` que **guiam o Claude** sobre como fazer algo. Não são invocáveis diretamente.

Os que criamos estão em `.claude/skills/`:
```
.claude/skills/
├── 01-code-review-frontend.md
├── 02-dark-mode-design-expert.md
├── 03-canvas-optimization.md
├── 04-frontend-performance-checklist.md
├── 05-canvas-rendering-benchmark.md
└── README.md
```

---

## 🎯 Como usar as Skills que criamos

### **Opção 1: Solicitar ao Claude (Recomendado)**
```
"Faça uma revisão de código do mesa-renderer-v2.js usando a skill de code-review-frontend"
```

Claude lerá o arquivo `.claude/skills/01-code-review-frontend.md` e fará a revisão seguindo aquele padrão.

### **Opção 2: Invocar Skills Built-in que você já tem**
```
/code-review js/mesa-renderer-v2.js
/verify [descrição da mudança]
/design [descrição do design]
```

### **Opção 3: Workflow manual (mais específico)**
```
1. "Otimize a renderização da Mesa usando a skill canvas-optimization"
2. Claude lê 03-canvas-optimization.md
3. Sugere melhorias específicas para mesa-renderer-v2.js
```

---

## 🔧 Configuração Recomendada (settings.json)

O Claude Code não permite campos customizados no settings.json, mas você pode usar **hooks** para rodar verificações automáticas antes de commits:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(git status*)",
      "Bash(git diff*)"
    ]
  },
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "matcher": "code.*review",
            "command": "echo '💡 Dica: Use as skills em .claude/skills/ para revisar código. Exemplo: code-review-frontend.md para revisar JS/Canvas.'",
            "async": true
          }
        ]
      }
    ]
  }
}
```

---

## 💡 Workflow Recomendado para Seu Projeto

### **Antes de cada commit:**

1. **Code Review**
   ```
   "Revise o código usando a skill code-review-frontend"
   ```
   ou
   ```
   /code-review "js/mesa-*.js"
   ```

2. **Performance Check**
   ```
   "Audit performance usando frontend-performance-checklist"
   ```
   ou
   ```
   npm run check:js
   npm run audit:static
   ```

3. **Visual Audit** (se mexeu em CSS)
   ```
   "Revise o tema dark usando dark-mode-design-expert"
   ```

### **Se a Mesa está lenta:**
   ```
   "Otimize a renderização usando canvas-optimization"
   ```

---

## 📖 Referência rápida das skills

| # | Skill | Arquivo | Quando usar |
|---|---|---|---|
| 1 | Code Review Frontend | `01-code-review-frontend.md` | Revisar `js/mesa-*.js`, `js/ficha-*.js` |
| 2 | Dark Mode Expert | `02-dark-mode-design-expert.md` | Auditar CSS, contrast, tokens |
| 3 | Canvas Optimization | `03-canvas-optimization.md` | Otimizar renderização, FPS drops |
| 4 | Performance Checklist | `04-frontend-performance-checklist.md` | Antes de deploy, validar build |
| 5 | Canvas Rendering Benchmark | `05-canvas-rendering-benchmark.md` | Profile rendering, medir FPS |

---

## 🎓 Exemplos de comandos

```bash
# Revisar arquivo e seguir skill code-review-frontend
"Revise o mesa-drawing.js seguindo a skill code-review-frontend"

# Auditar design dark
"Melhore o design dark do projeto usando dark-mode-design-expert"

# Otimizar renderização
"Otimize canvas-optimization para Mesa com 100 tokens"

# Checklist completo
"Execute a performance-checklist antes de eu fazer deploy"

# Benchmark Canvas
"Faça benchmark do Canvas API usando canvas-rendering-benchmark"
```

---

## 🚀 Próximos passos

1. ✅ Skills criadas e em `.claude/skills/`
2. ⏳ Claude lê `.claude/skills/*.md` quando você pede (automático)
3. 📌 Solicite revisões mencionando a skill desejada
4. 🔄 Repita para cada tipo de mudança

Nenhuma configuração extra é necessária — Claude automaticamente lê os arquivos `.md` quando você menciona a skill pelo nome!
