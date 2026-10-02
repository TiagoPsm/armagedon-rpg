/* Session clipboard of settings only. Scene content is never copied or replaced. */
window.MesaSceneSettings = (() => {
  const el = id => document.getElementById(id);
  let copied = null, draft = null;
  const snapshot = () => ({ grid: getMesaGridState(), vision: getMesaVisionPayload(), scene: state.sceneId });
  function cancel() { if (!draft) return; draft = null; previewMesaGrid(null); render(); }
  function copy() {
    if (!isMaster()) return;
    const s = snapshot(); copied = { grid: s.grid, enabled: !!s.vision?.enabled, coneDeg: s.vision?.coneDeg || 120, darkness: !!s.vision?.darkness,
      name: state.sceneName || 'cena atual' }; cancel(); render();
  }
  function preview() {
    if (!isMaster() || !copied) return;
    MesaBarrierEditor.cancel(); MesaLighting.cancel(); MesaTemplates.cancel(); MesaGridEditor.reset();
    draft = snapshot(); previewMesaGrid(copied.grid); render();
  }
  function valid() { return draft && isMaster() && JSON.stringify(draft) === JSON.stringify(snapshot()); }
  function apply() {
    if (!valid()) { cancel(); return; }
    const grid = normalizeMesaGridState(copied.grid);
    const stage = el('mesaStageInner');
    const vision = MesaVisionGeometry.normalizeVision({ ...(getMesaVisionPayload() || { walls: [], aspect: stage.offsetHeight / stage.offsetWidth, revision: 0 }), enabled: copied.enabled, coneDeg: copied.coneDeg, darkness: copied.darkness });
    MesaVisionGeometry.prepare(vision); cancel();
    applyMesaSceneGridFromSnapshot(grid); applyMesaVisionSnapshot(vision);
    bumpMesaSceneVersion(); sendMesaRealtimeDelta('mesa:grid:update', { grid: getMesaGridScenePayload() }); persistState(); requestMesaVisionRender();
    el('mesaSettingsHint').textContent = 'Ajustes aplicados. Conteúdo da cena preservado.';
  }
  function render() {
    if (!el('mesaSettingsDraft')) return;
    if (draft && (!valid() || el('mesaMapTransform').hidden || mesaVisionMode !== 'off')) { draft = null; previewMesaGrid(null); }
    el('mesaSettingsPreview').disabled = !copied || !isMaster(); el('mesaSettingsDraft').hidden = !draft;
    el('mesaSettingsHint').textContent = draft ? `Prévia de “${copied.name}”: ${Math.round(1 / copied.grid.cellFrac)} colunas, ${copied.grid.metersPerCell} m/cél; cone ${copied.coneDeg}°; visão ${copied.enabled ? 'ligada' : 'desligada'}, escuridão ${copied.darkness ? 'ligada' : 'desligada'}.` : copied ? `Ajustes copiados de “${copied.name}”, disponíveis nesta aba.` : 'Copia somente grade, cone e escuridão. Mapa, tokens, paredes, portas, luzes e desenhos permanecem.';
  }
  document.addEventListener('DOMContentLoaded', () => {
    for (const [id, fn] of [['mesaSettingsCopy', copy], ['mesaSettingsPreview', preview], ['mesaSettingsApply', apply], ['mesaSettingsCancel', cancel]]) {
      el(id).addEventListener('click', fn); el(id).dataset.armed = '1';
    }
    window.addEventListener('blur', () => { if (draft) cancel(); });
    window.addEventListener('keydown', e => { if (draft && e.key === 'Escape' && !e.target.closest('input,textarea,select,[contenteditable]')) cancel(); }); render();
  }, { once: true });
  return { render, cancel };
})();
