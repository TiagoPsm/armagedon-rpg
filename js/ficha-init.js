document.addEventListener("DOMContentLoaded", async () => {
  // Modulos de UI pura armam ANTES de qualquer await (Etapa 83). Todos
  // dependem so de DOM estatico do ficha.html, e ficavam depois de tres
  // awaits (AUTH_READY, refreshDirectory, openSheet): a ficha aparecia
  // completa com a bandeja de dados, o editor de item e o modal da alma
  // ainda sem nenhum listener. Botao visivel que nao faz nada e nao avisa
  // — a mesma familia corrigida na Mesa nas Etapas 81-82.
  initItemEditor();
  initNotesCollapse();
  initSoulAwardModal();
  initDiceTray();
  initSheetMouseGlow();

  await AUTH_READY;
  remoteSheetsCache = loadRemoteSheetsCache();

  const session = AUTH.requireAuth();
  if (!session) return;

  currentUser = session.username;
  currentRole = session.role;

  if (AUTH.isBackendEnabled()) {
    await AUTH.refreshDirectory();
    bindSheetRealtime();
  }

  if (currentRole === "master") {
    await openMasterPanel();
  } else {
    await openSheet(createPlayerTarget(currentUser), false);
  }

  // initAutoSave fica AQUI de proposito: armado antes dos dados chegarem,
  // o preenchimento da propria carga poderia disparar uma gravacao do
  // formulario vazio. Como openSheet mantem a ficha inerte ate terminar e
  // nao ha await entre o fim dela e esta linha, nao existe instante em que
  // a ficha aceite edicao sem autosave ligado.
  initAutoSave();
  // Depende de textareas ja renderizadas — precisa vir depois da carga.
  syncAutoGrowTextareas();
});

setInterval(() => {
  if (document.getElementById("sheetScreen").classList.contains("active")) {
    saveSheetSilently();
  }
}, 60000);
