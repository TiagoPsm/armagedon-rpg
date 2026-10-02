/* Contextual shortcuts call the same armed controls as the mouse. */
document.addEventListener('DOMContentLoaded', () => {
  const el = id => document.getElementById(id);
  const click = id => { const b = el(id); if (b && !b.disabled && !b.hidden) b.click(); };
  window.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.repeat || e.target.closest?.('input,textarea,select,[contenteditable]') ||
        [...document.querySelectorAll('[role="dialog"]')].some(d => d.getClientRects().length) || state.drag || _rulerActive) return;
    const key = e.key.toLowerCase(), command = e.ctrlKey || e.metaKey, template = el('mesaTemplateCanvas')?.dataset.active === 'true';
    let id = null;
    if (command && (key === 'z' || key === 'y')) {
      const redo = key === 'y' || e.shiftKey;
      if (mesaVisionMode !== 'off') id = redo ? 'mesaVisionRedo' : 'mesaVisionUndo';
      else if (template) id = redo ? 'mesaTemplateRedo' : 'mesaTemplateUndo';
    } else if (command && mesaVisionMode === 'select' && (key === 'c' || key === 'v')) id = key === 'c' ? 'mesaBarrierCopy' : 'mesaBarrierPaste';
    else if (!command && !e.altKey && template && key === 'delete') id = 'mesaTemplateRemove';
    else if (!command && !e.altKey && key === '?') {
      if (el('mesaMapTransform').hidden) toggleMapSettings(); el('mesaToolsHelp').open = !el('mesaToolsHelp').open;
      el('mesaToolsHelp').querySelector('summary').focus({ preventScroll: true });
      el('mesaToolsHelp').scrollIntoView({ block: 'nearest' }); e.preventDefault(); return;
    } else if (!command && !e.altKey && !e.shiftKey && isMaster() && !el('mesaMapTransform').hidden && !template) {
      id = { w: 'mesaVisionWall', d: 'mesaVisionDoor', e: 'mesaVisionErase', s: 'mesaVisionSelect' }[key];
    }
    if (id) { e.preventDefault(); e.stopImmediatePropagation(); click(id); }
  }, true);
});
