# Armagedon

Portal estatico para campanha de RPG com home, fichas, mesa virtual, regras, NPCs, monstros, memorias, inventario e API publicada em Cloudflare Workers + D1.

## Regra Obrigatoria de Documentacao

Sempre que qualquer pessoa ou agente alterar o site, tambem deve atualizar os arquivos `.md` relacionados.

No minimo:

- atualize `DEV_STATUS.md` quando mudar comportamento, arquitetura, arquivos principais ou pendencias
- atualize `SYSTEM_RULES.md` quando a mudanca tocar regra de gameplay, permissao ou persistencia
- atualize `VISUAL_RULES.md` quando a mudanca criar ou consolidar decisao visual
- atualize `cloudflare/README.md` quando a mudanca tocar Worker, D1, rotas ou deploy Cloudflare
- atualize `server/README.md` quando a mudanca tocar o backend Express/PostgreSQL legado
- atualize `DEPLOY_FREE.md` quando a mudanca alterar publicacao, workflow ou arquivos enviados

Cada atualizacao deve registrar: o que mudou, quais arquivos foram afetados, como validar e quais pendencias continuam abertas. Esta regra existe para reduzir contexto em conversas futuras.

## Leitura Rapida Para Reduzir Contexto

Para entender o projeto sem reler historico de conversa:

- `README.md`: visao geral e mapa de arquivos
- `DEV_STATUS.md`: estado atual, ultimas mudancas, validacoes e proximas frentes
- `SYSTEM_RULES.md`: regras funcionais que nao devem mudar sem autorizacao
- `VISUAL_RULES.md`: padroes visuais consolidados
- `cloudflare/README.md`: API ativa em Workers + D1
- `server/README.md`: backend Express/PostgreSQL legado e referencia local
- `DEPLOY_FREE.md`: roteiro de publicacao gratuita e observacoes de deploy

## Como Rodar

O frontend funciona como site estatico puro, sem build e sem bundler.

Arquivos principais:

- `index.html`: home/login e painel inicial
- `ficha.html`: painel de fichas, jogador, NPC e monstro
- `mesa.html`: mesa virtual e tokens
- `regras.html`: regras da campanha
- `css/`: estilos do site
- `js/`: logica do frontend
- `cloudflare/`: API ativa em Cloudflare Workers + D1
- `server/`: backend Express/PostgreSQL legado, mantido como referencia

Para abrir localmente:

```powershell
python -m http.server 8000
```

Depois acesse:

```text
http://localhost:8000
```

## Login Inicial do Modo Local

```text
Usuario: mestre
Senha: Mestre123
```

## Persistencia Atual

No site publicado, os dados principais devem ficar no servidor:

- API: Cloudflare Workers
- banco: Cloudflare D1
- URL configurada em `js/runtime-config.js`

O navegador ainda usa `localStorage` para sessao, cache de fichas/diretorio e fallback local quando a API nao esta disponivel. Producao nao deve depender de `localStorage` como fonte principal.

## Estado Atual

- API publicada: Cloudflare Workers
- banco publicado: Cloudflare D1
- frontend: site estatico sem build
- workflow do GitHub Pages inclui `mesa.html`
- Mesa oficial publicada no Pages
- Mesa usa personagens e status das fichas quando a API esta ativa
- posicao/visibilidade dos tokens da Mesa ainda ficam locais ate realtime com Durable Objects
- realtime via Socket.IO fica desligado por padrao quando a API ativa e Worker
- Vida atual e Integridade atual sao limitadas ao maximo antes de salvar
- jogador pode alterar Integridade atual na propria ficha e na mesa
- transferencias jogador-para-jogador no Worker validam tipo `player` e persistem origem, destino e auditoria em lote D1
- Express/PostgreSQL em `server/` continua como legado/referencia

## Publicacao Gratuita Recomendada

Caminho atual recomendado:

- frontend estatico no GitHub Pages ou Cloudflare Pages
- API em Cloudflare Workers
- banco em Cloudflare D1
- realtime futuro em Durable Objects

Antes de publicar:

1. Nao publique `server/.env`.
2. Confirme que `.gitignore` esta ativo.
3. Gere um `JWT_SECRET` proprio em producao.
4. Troque a senha padrao do mestre.

## Proxima Etapa da Mesa Realtime

A Mesa ja pode ser publicada como pagina estatica oficial. Para virar realtime de verdade, a proxima etapa tecnica e:

1. criar persistencia de cena no D1
2. criar Durable Object por sala/mesa
3. conectar navegadores via WebSocket
4. transmitir movimento/status em tempo real
5. salvar no D1 com debounce para evitar gravacao excessiva
