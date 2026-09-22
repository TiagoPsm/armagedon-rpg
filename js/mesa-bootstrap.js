/* ============================================================
 * mesa-bootstrap.js — ponto unico de inicializacao da Mesa
 *
 * Deve permanecer como o ultimo script externo do bloco mesa-*.
 * A ordem dos scripts `defer` e preservada pelo navegador, entao chegar aqui
 * significa que core, desenho, selecao, mapa e demais modulos ja registraram
 * seus contratos globais.
 * ============================================================ */

"use strict";

if (typeof initMesaFog === "function") initMesaFog();

if (typeof window.bootMesaPage !== "function") {
  console.error("Falha ao iniciar a mesa virtual: mesa-core.js nao foi carregado.");
} else {
  window.bootMesaPage();
}
