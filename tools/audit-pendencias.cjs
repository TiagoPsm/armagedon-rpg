#!/usr/bin/env node
/* ============================================================
 * audit-pendencias.cjs — uma pendencia aberta, um lugar so
 *
 * POR QUE ESTE SCRIPT EXISTE
 * --------------------------
 * O DEV_STATUS.md cresce por cima, cronologicamente. Ate 2026-08-16 cada
 * etapa escrevia as proprias pendencias DENTRO do proprio bloco, e nada
 * nunca obrigava uma etapa futura a voltar la e dar baixa. Resultado
 * medido naquele dia: 28 mencoes a "pendencia" espalhadas por 9 lugares
 * em 6 formatos diferentes, varias delas mortas ha semanas. O caso mais
 * eloquente listava "Etapa 7: jogador move o proprio token" como pendente
 * com a secao "Etapa Concluida — Etapa 7" logo abaixo, na mesma tela.
 *
 * A regra de atualizar os .md ja existia no CLAUDE.md e mesmo assim
 * falhou quatro vezes. Regra que ninguem verifica apodrece — a mesma
 * licao do teste de desenho na Etapa 81. Entao aqui esta a verificacao.
 *
 * A REGRA
 * -------
 * Pendencia ABERTA existe em um lugar so: a secao "## Pendencias Vivas",
 * no topo do DEV_STATUS.md. Qualquer outro bloco que declare pendencia
 * precisa estar marcado como fechado/historico.
 *
 * Um bloco conta como fechado quando o proprio TITULO traz um marcador
 * (~~riscado~~, FECHADA, RESOLVIDA, CUMPRIDA, HISTORICA...). Nesse caso
 * os itens abaixo dele sao liberados ate o proximo titulo — foi a forma
 * de nao exigir que cada linha de historico fosse reescrita.
 * ============================================================ */

const fs = require("fs");
const path = require("path");

const ARQUIVO = path.join(__dirname, "..", "DEV_STATUS.md");

// Secoes onde a palavra "pendencia" e legitima sem ser uma declaracao de
// item aberto: a lista canonica e o texto da propria regra.
const SECOES_LIBERADAS = [
  "pendencias vivas",
  "regra obrigatoria de documentacao"
];

// Marcadores que provam que aquilo ja foi fechado.
const MARCADORES_FECHADO = /~~|FECHAD|RESOLVID|CUMPRID|HISTORIC|OBSOLET|MOVID|Atualizacao \(Etapa/i;

// Formas de DECLARAR pendencia. Prosa que apenas cita a palavra nao conta:
// o alvo sao titulos, rotulos e itens de lista que abrem pendencia.
const DECLARACOES = [
  /^#{2,6}\s*Pend[eê]nci/i,               // ### Pendencias
  /^\s*[-*]\s*\*{0,2}Pend[eê]nci/i,       // - Pendencia: ...  |  - **Pendencias**
  /^\s*[-*]\s*\*{0,2}Pendente\b/i,        // - **Pendente**: ...
  /^\s*Pend[eê]ncias?\b[^.!?]*:\s*$/i     // Pendencias abertas:
];

function normalizar(texto) {
  return String(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function auditar(conteudo) {
  const linhas = conteudo.split(/\r?\n/);
  const problemas = [];

  let secaoAtual = "";
  let nivelIsencao = 0;   // nivel do titulo que liberou o bloco (0 = sem isencao)

  linhas.forEach((linha, indice) => {
    const tituloMatch = /^(#{1,6})\s+(.*)$/.exec(linha);

    if (tituloMatch) {
      const nivel = tituloMatch[1].length;
      const texto = tituloMatch[2];

      // Sair da isencao ao encontrar titulo de nivel igual ou superior.
      if (nivelIsencao && nivel <= nivelIsencao) nivelIsencao = 0;

      if (nivel === 2) secaoAtual = normalizar(texto);

      const declaraPendencia = DECLARACOES.some(re => re.test(linha));
      if (declaraPendencia) {
        if (MARCADORES_FECHADO.test(texto)) {
          nivelIsencao = nivel;      // bloco historico: libera o que vem abaixo
          return;
        }
        if (!SECOES_LIBERADAS.includes(secaoAtual)) {
          problemas.push({
            linha: indice + 1,
            texto: linha.trim(),
            motivo: "titulo de pendencia fora da secao canonica e sem marca de fechado"
          });
        }
      }
      return;
    }

    if (nivelIsencao) return;                          // dentro de bloco historico
    if (SECOES_LIBERADAS.includes(secaoAtual)) return; // dentro da lista canonica

    if (DECLARACOES.some(re => re.test(linha)) && !MARCADORES_FECHADO.test(linha)) {
      problemas.push({
        linha: indice + 1,
        texto: linha.trim().slice(0, 110),
        motivo: "pendencia declarada fora da secao 'Pendencias Vivas'"
      });
    }
  });

  return problemas;
}

function main() {
  if (!fs.existsSync(ARQUIVO)) {
    console.error("DEV_STATUS.md nao encontrado.");
    process.exit(1);
  }

  const conteudo = fs.readFileSync(ARQUIVO, "utf8");

  if (!/^##\s+Pend[eê]ncias Vivas\s*$/m.test(conteudo)) {
    console.error("FALHA: DEV_STATUS.md nao tem a secao '## Pendencias Vivas'.");
    console.error("Toda pendencia aberta do projeto vive nela. Crie-a no topo do arquivo.");
    process.exit(1);
  }

  const problemas = auditar(conteudo);

  if (problemas.length) {
    console.error(`FALHA: ${problemas.length} pendencia(s) declarada(s) fora da secao canonica.\n`);
    problemas.forEach(p => {
      console.error(`  DEV_STATUS.md:${p.linha}`);
      console.error(`    ${p.texto}`);
      console.error(`    -> ${p.motivo}\n`);
    });
    console.error("Como resolver:");
    console.error("  - se ainda esta ABERTA: mova o item para '## Pendencias Vivas' no topo;");
    console.error("  - se ja FOI resolvida: marque o titulo do bloco com ~~risco~~,");
    console.error("    'FECHADA', 'RESOLVIDA', 'CUMPRIDA' ou '(historicas)' e a data da conferencia.");
    process.exit(1);
  }

  console.log("Pendencias OK (uma lista viva, nada solto).");
}

main();
