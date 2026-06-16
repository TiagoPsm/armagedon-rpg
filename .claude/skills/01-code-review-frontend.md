# Code Review: Frontend JavaScript & Canvas

**Source:** [awesome-skills/code-review-skill](https://github.com/awesome-skills/code-review-skill)

## Descrição
Skill especializada em revisar código JavaScript vanilla, Canvas API, e padrões de performance para projetos sem bundler.

## Quando usar
- Revisar novos arquivos em `js/` antes de commit
- Auditar performance de `mesa-renderer-v2.js`, `mesa-drawing.js`
- Validar event handling em `ficha-core.js`, `mesa-core.js`
- Checklist de segurança (OWASP Top 10:2025)

## Invocação
```
/code-review [arquivo ou padrão glob]
```

## Foco para Armagedom
✅ Canvas optimization (renderização diferenças, múltiplas layers)
✅ JavaScript vanilla patterns (sem transpiler, order-dependent scripts)
✅ Memory leaks em WebSocket (`mesa-realtime.js`)
✅ Event delegation e cleanup
✅ Accessibility (dark mode contrast)
✅ PBKDF2 auth patterns (`js/auth.js`)

## Checklist padrão
- [ ] Variáveis globais necessárias? (scripts inline `onclick` precisam de scope global)
- [ ] Memory leaks em listeners? (cleanup em navegação)
- [ ] Canvas rendering otimizado? (renderizar diferenças, não tudo)
- [ ] OffscreenCanvas Worker gerando gargalo?
- [ ] Cache headers para `?v=` query strings?
- [ ] Mensagens de erro claras para usuário?
