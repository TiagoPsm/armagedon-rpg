# Armagedon - Vault de Contexto

Este diretorio pode ser aberto diretamente no Obsidian como vault do projeto.

Objetivo:

- reduzir releitura completa do repositorio em novas sessoes
- manter decisoes e pendencias em Markdown versionado no Git
- dar ao Codex um ponto de entrada curto antes de abrir codigo
- separar contexto estavel de historico longo de conversa

## Leitura Padrao Para Uma Nova Sessao

1. [[01-CONTEXTO-ATUAL]]
2. [[03-DECISOES]]
3. A nota da area em trabalho:
   - [[06-FICHA]]
   - [[07-MESA]]
   - [[08-REGRAS]]
   - [[05-DEPLOY]]
4. So depois abrir os arquivos de codigo relacionados.

## Automacao De Contexto

Antes de uma sessao longa, rode este comando na raiz do projeto:

```powershell
.\tools\update-obsidian-context.ps1
```

Ele atualiza [[10-SNAPSHOT-AUTOMATICO]] com branch, ultimo commit, alteracoes locais, paginas principais, estrutura de raiz e arquivos grandes. Essa nota e gerada automaticamente e nao deve ser editada manualmente.

Para ativar atualizacao automatica antes de cada commit neste checkout, rode uma vez:

```powershell
.\tools\install-obsidian-hooks.ps1
```

Depois disso, `.githooks/pre-commit` atualiza [[10-SNAPSHOT-AUTOMATICO]] e adiciona a nota ao commit automaticamente.

Regra operacional: qualquer etapa com alteracao de arquivo deve terminar com [[10-SNAPSHOT-AUTOMATICO]] atualizado. O hook cobre commits; quando nao houver commit, rode o script manualmente antes de encerrar.

## Notas Disponiveis

- [[01-CONTEXTO-ATUAL]]: estado atual, URLs, validacoes e direcao do projeto
- [[02-ARQUITETURA]]: mapa tecnico do frontend, API, D1 e backend legado
- [[03-DECISOES]]: decisoes consolidadas que evitam retrabalho
- [[04-PENDENCIAS]]: riscos, limites e proximas frentes
- [[05-DEPLOY]]: fluxo de publicacao e validacao
- [[06-FICHA]]: contratos da ficha e arquivos principais
- [[07-MESA]]: contratos da mesa virtual e arquivos principais
- [[08-REGRAS]]: contratos da tela de regras
- [[09-HISTORICO-DE-SESSOES]]: resumo compacto de etapas concluidas
- [[10-SNAPSHOT-AUTOMATICO]]: snapshot gerado por script com estado atual do repositorio

## Regra de Uso Para Codex

Ao iniciar trabalho neste projeto:

1. leia esta nota
2. leia [[01-CONTEXTO-ATUAL]]
3. leia a nota da area solicitada
4. leia [[10-SNAPSHOT-AUTOMATICO]] quando precisar do estado Git atual
5. consulte `DEV_STATUS.md` somente quando precisar do log detalhado

Evitar carregar arquivos grandes ou varrer todo o repositorio sem necessidade.
