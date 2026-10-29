/* Locked drawings stay visible, but do not compete with tokens or normal selection. */
window.MesaDecorations = (() => {
  const el = id => document.getElementById(id);
  let optionsKey = '';
  function render() {
    const section = el('mesaDecorationTools'); if (!section || typeof getDrawingsSnapshot !== 'function') return;
    section.hidden = !isMaster();
    const drawings = getDrawingsSnapshot(), locked = drawings.filter(s => s.locked && !s.template);
    const ids = typeof getSelectedStrokeIds === 'function' ? getSelectedStrokeIds() : new Set();
    el('mesaDecorationLock').disabled = !isMaster() || !drawings.some(s => ids.has(String(s.id)) && !s.locked && !s.template);
    const select = el('mesaDecorationList'), key = locked.map(s => `${s.id}:${s.tool}`).join('|');
    if (key !== optionsKey) {
      optionsKey = key; const previous = select.value; select.replaceChildren();
      const empty = document.createElement('option'); empty.value = ''; empty.textContent = locked.length ? 'Escolha uma decoração' : 'Nenhuma bloqueada'; select.append(empty);
      const names = { pencil: 'Traço', line: 'Linha', circle: 'Elipse', rect: 'Retângulo', arrow: 'Seta', cone: 'Cone' };
      locked.forEach((s, i) => { const option = document.createElement('option'); option.value = s.id; option.textContent = `${names[s.tool] || 'Desenho'} ${i + 1}`; select.append(option); });
      if (locked.some(s => s.id === previous)) select.value = previous;
    }
    el('mesaDecorationUnlock').disabled = !isMaster() || !select.value;
  }
  document.addEventListener('DOMContentLoaded', () => {
    for (const [id, event, fn] of [
      ['mesaDecorationSelect', 'click', () => setInteractionMode('select')],
      ['mesaDecorationLock', 'click', () => { setMesaDrawingLocks([...getSelectedStrokeIds()], true); render(); }],
      ['mesaDecorationList', 'change', render],
      ['mesaDecorationUnlock', 'click', () => { setMesaDrawingLocks([el('mesaDecorationList').value], false); render(); }]
    ]) { el(id).addEventListener(event, fn); el(id).dataset.armed = '1'; }
    render();
  }, { once: true });
  return { render };
})();
