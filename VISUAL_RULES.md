# VISUAL RULES

Este arquivo define a direcao visual do projeto. Atualizar sempre que uma decisao de design passar a ser padrao.

## Regra Obrigatoria de Documentacao

Sempre que uma alteracao visual consolidar padrao novo, ajustar layout importante, mudar responsividade, trocar paleta, alterar componentes principais ou criar comportamento visual reutilizavel, este arquivo deve ser atualizado na mesma etapa. Tambem atualize `DEV_STATUS.md` quando a mudanca afetar paginas ou arquivos sensiveis.

## Direcao de Arte

- Estilo principal: dark fantasy
- Referencia de atmosfera: Shadow Slave
- Sensacao desejada:
  - sombria
  - elegante
  - ritualistica
  - densa, mas legivel

## Paleta

Priorizar:

- preto
- cinzas muito escuros
- vermelho escuro
- vinho profundo
- brilho vermelho suave

Evitar como acento principal:

- laranja forte
- amarelo intenso
- cores muito vivas fora do esquema dark

## Prioridades Visuais

1. Organizacao
2. Centralizacao
3. Alinhamento
4. Legibilidade
5. Atmosfera

Se houver conflito entre efeito visual e organizacao, a organizacao vence.

## Regras de Layout

- Cards e caixas devem parecer parte do mesmo sistema
- Nao deixar blocos tortos, soltos ou com larguras inconsistentes sem motivo
- Inputs que pertencem a mesma linha devem compartilhar alinhamento visual
- Titulos de secao devem manter a mesma linguagem grafica
- Botoes de acao precisam ter hierarquia clara:
  - primario
  - secundario
  - destrutivo

## Regras de Centralizacao

- Conteudo interno de cards deve ser centralizado quando o objetivo for leitura rapida
- Linhas superiores e barras de acao devem ficar alinhadas horizontalmente
- Evitar botoes isolados desalinhados em cabecalhos
- Modais devem abrir centralizados e permanecer equilibrados no desktop

## Ficha Como Referencia

A ficha e o padrao visual principal do projeto.

Elementos que devem servir de base para as outras paginas:

- superficie escura em camadas
- bordas discretas
- brilho vermelho suave
- tipografia de titulo mais dramatica
- inputs escuros e integrados
- atmosfera de calor e brasa sombria

Arquivos visuais atuais da ficha:

- `css/ficha-base.css`
- `css/ficha-layout.css`
- `css/ficha-master.css`
- `css/ficha-inventory-memory.css`
- `css/ficha-dice-soul.css`
- `css/ficha-responsive.css`

## Home / Login

- Ja redesenhada para seguir a linguagem da ficha
- Deve continuar parecendo parte do mesmo universo visual
- Nao pode voltar a ter aparencia de formulario generico
- Primeira dobra deve funcionar como poster sombrio do portal
- A area logada deve parecer extensao natural da ficha, nao uma dashboard SaaS generica

## Mouse Glow

- Pode existir brilho reagindo ao mouse
- Deve ser sutil, bonito e funcional
- Nao deve atrapalhar leitura nem esconder conteudo
- Deve atuar como reforco atmosferico, nao como efeito principal

## Inventario

- Visual compacto
- Grid limpo
- Pouco ruido visual
- Abrir detalhes do item em pop-up, nao expandir o grid de forma descontrolada

## Pop-ups e Modais

- Devem seguir o mesmo estilo dark fantasy da ficha
- Conteudo sempre bem dimensionado
- Nunca deixar textos espremidos ou botoes mal distribuidos
- Preferir composicao simples, clara e premium

## Painel do Mestre

- Deve parecer um painel de controle sombrio e organizado
- Separacao clara entre:
  - jogadores
  - NPCs
  - monstros
  - regras
- Acoes importantes precisam ser faceis de localizar
- Dentro da aba de fichas, o painel do mestre deve usar:
  - hero superior com resumo curto
  - cards amplos e escuros
  - listas com hierarquia clara
  - grade separada entre criacao, diretorio e acesso rapido
  - mesmo peso visual da ficha, sem parecer uma dashboard generica

## Mesa Virtual

- Deve priorizar leitura rapida de tokens, status e selecao
- O palco deve ficar claro, responsivo e sem sobreposicao incoerente
- Inspetor lateral deve ser compacto e funcional
- Jogadores podem editar apenas valores atuais permitidos
- Mestre pode controlar visibilidade, organizacao e valores maximos
- Visual deve seguir a mesma linguagem dark fantasy da ficha, mas com densidade maior por ser ferramenta de mesa

Arquivos visuais atuais da Mesa:

- `css/mesa-base.css`
- `css/mesa-layout.css`
- `css/mesa-stage.css`
- `css/mesa-roster.css`
- `css/mesa-inspector.css`
- `css/mesa-responsive.css`

## Pagina de Regras

- Deve parecer um grimorio oficial da campanha
- Hero com introducao forte e painel lateral de status
- Editor do mestre com o mesmo acabamento dos cards da ficha
- Cartoes de regras devem priorizar:
  - leitura
  - hierarquia clara
  - contraste forte
  - atmosfera dark fantasy
- A pagina de regras nao pode parecer um blog comum nem um CMS generico
- O HTML da pagina de regras deve permanecer em UTF-8 limpo; qualquer texto corrompido deve ser corrigido na origem antes de novos refinamentos
- A pagina de regras deve manter estrutura funcional simples; refinamento visual nao deve criar secoes extras sem necessidade

## O Que Evitar

- excesso de ornamento
- sombras exageradas sem funcao
- caixas de tamanhos incoerentes
- espacamentos irregulares
- alinhamentos quebrados
- brilhos coloridos fora da paleta
- aparencia de painel generico claro
