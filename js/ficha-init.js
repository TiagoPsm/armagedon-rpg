document.addEventListener("DOMContentLoaded", async () => {
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

  initAutoSave();
  initItemEditor();
  initSoulAwardModal();
  initDiceTray();
  initSheetMouseGlow();
  syncAutoGrowTextareas();
});

setInterval(() => {
  if (document.getElementById("sheetScreen").classList.contains("active")) {
    saveSheetSilently();
  }
}, 60000);
