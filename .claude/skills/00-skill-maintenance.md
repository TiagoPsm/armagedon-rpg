# 🔧 Skill Maintenance & Review

**This is a meta-skill for maintaining and improving the skill system itself.**

## Quando usar

Use esta skill quando:
- Após 10-15 usos de outras skills
- Notar padrões de mismatch ou ambiguidade
- Tiago pedir: "Revise as skills"
- Para propor melhorias periódicas

## Checklist de Revisão

### 1. Analisar o Log de Uso

Leia `.claude/SKILL_IMPROVEMENTS.md` e responda:

```
[ ] Qual skill foi mais usada?
[ ] Qual teve maior taxa de acerto?
[ ] Houve false positives? (skill errada escolhida)
[ ] Houve false negatives? (nenhuma skill escolhida mas deveria)
[ ] Há ambiguidades? (múltiplas skills compete frequentemente)
```

### 2. Identificar Padrões de Erro

Para cada mismatch, pergunte:

```
❌ Erro encontrado: [skill] foi escolhida para [prompt], mas deveria ser [skill2]

**Causa raiz:**
- Regra muito ampla?
- Regra muito específica?
- Palavras-chave conflitantes?
- Contexto perdido?

**Solução:**
- Adicionar exclusão? (NOT [keyword])
- Refinar gatilho? (must match X AND Y)
- Reordenar prioridade?
```

### 3. Propor Melhorias

Para cada padrão identificado, crie proposta:

```markdown
### Proposta N: [Título]

**Problema:**
[Descrição do erro observado]

**Frequência:**
[Quantas vezes ocorreu em N usos]

**Solução proposta:**
[Mudança específica no SKILL_DISPATCHER.md]

**Impacto esperado:**
- Reduz false positives em X%
- Reduz false negatives em Y%
- Sem side effects esperados

**Reversível?**
[ ] Sim, se não funcionar voltamos
[ ] Requer cuidado (explicar)
```

### 4. Reportar ao Tiago

Após análise, crie relatório:

```
📊 Skill Review Report - v1.X

📈 Estatísticas:
- Total de uses: XX
- Taxa de acerto: YY%
- False positives: ZZ
- False negatives: WW

🔍 Problemas identificados:
1. [Problema 1]
2. [Problema 2]
3. [Problema 3]

💡 Propostas de melhoria:
1. Proposta N.1: [Título]
2. Proposta N.2: [Título]
3. Proposta N.3: [Título]

🎯 Recomendação:
Aplicar propostas [N.1, N.2] imediatamente (low risk)
Aguardar feedback antes de [N.3] (high impact)

Aguardando aprovação do Tiago!
```

---

## Exemplo: Ciclo Completo de Melhoria

### Cenário: Ambiguidade entre Skill 3 e 4

```
📝 Observação:
User: "Performance está ruim no deploy"
Skill 3 (canvas-optimization) foi escolhida
MAS deveria ser Skill 4 (performance-checklist)
Ocorreu 3x em 12 usos

🔍 Causa raiz:
Ambas mencionam "performance"
Skill 3: "lento em rendering/FPS"
Skill 4: "lento em build/deploy"
Não conseguem distinguir contexto

💡 Solução:
Refinar trigger de Skill 3:
- IF "performance" AND (rendering OR FPS OR Canvas OR Mesa)
- EXCLUDE: (build OR deploy OR minify)

✅ Resultado esperado:
- Remove false positives de Skill 3
- Skill 4 escolhida corretamente
- Sem impacto negativo esperado
```

---

## Frequência de Revisão Recomendada

| Período | Ação |
|---|---|
| Cada uso | Log simples em SKILL_IMPROVEMENTS.md |
| ~10 usos | Identificar padrões de erro |
| ~20 usos | Propor 2-3 melhorias principais |
| ~50 usos | Análise aprofundada, v-bump (1.0 → 1.1 → 1.2) |
| Mensal | Revisão completa, limpeza de log |

---

## Como Aplicar Melhorias Aprovadas

1. **Tiago aprova proposta N:**
   ```
   "Aplique a Proposta 2.1"
   ```

2. **Claude atualiza SKILL_DISPATCHER.md:**
   - Modifica regra específica
   - Adiciona changelog: `<!-- v1.1: Refine Skill 3 vs 4 ambiguity -->`

3. **Log a mudança em SKILL_IMPROVEMENTS.md:**
   ```markdown
   ### ✅ Melhoria Aplicada
   
   **Proposta:** 2.1 - Refine Skill 3 vs 4
   **Data:** 2026-06-20
   **Versão:** v1.0 → v1.1
   **Mudança:** Adicionar exclusão NOT [deploy|build] à Skill 3
   ```

4. **Continuar monitorando:**
   - False positives reduziram? ✅
   - Nenhum side effect? ✅
   - Melhoria confirma a hipótese? ✅

---

## 🎯 Meta Final

**Skills se tornam cada vez mais precisas e úteis com o tempo, adaptadas ao projeto real de Tiago!**

Não é um sistema estático — é um sistema vivo que aprende.

---

## Commands para Tiago

```bash
# Revisar skills
"Claude, execute a skill de manutenção"

# Propor melhorias específicas
"Identifique melhorias nas skills"

# Aprovar mudança
"Aplique a Proposta N.M"

# Rejeitar mudança
"Não, mantém como está"

# Reset de versão
"Volta para SKILL_DISPATCHER_v1.0"
```
