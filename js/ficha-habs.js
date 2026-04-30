function renderHabs(list) {
  habs = list.map(normalizeHab);
  const element = document.getElementById("habList");
  if (!element) return;
  syncHabCardStates();
  persistHabCardStatesForCurrentSheet();

  if (!habs.length) {
    element.innerHTML = '<p class="empty-msg">Nenhuma habilidade registrada.</p>';
    return;
  }

  element.innerHTML = habs
    .map(
      (hab, index) => `
        <article class="hab-row hab-card ${habCardStates[hab.id]?.collapsed ? "is-collapsed" : ""}" data-hab-index="${index}">
          <div class="hab-card-head">
            <div class="hab-toggle-copy">
              <span class="${getHabTypeBadgeClass(hab.type)}">${esc(getHabTypeLabel(hab.type))}</span>
              <strong class="hab-card-title">${esc(hab.name || "Nova entrada")}</strong>
              <span class="hab-card-meta">${esc(buildHabSummaryMeta(hab))}</span>
            </div>

            <div class="hab-card-actions">
              <button
                type="button"
                class="btn-inline hab-toggle-btn"
                onclick="toggleHabCard('${jsEsc(hab.id)}')"
                aria-expanded="${habCardStates[hab.id]?.collapsed ? "false" : "true"}"
                aria-controls="habCardBody${index}"
              >${habCardStates[hab.id]?.collapsed ? "Expandir" : "Minimizar"}</button>
              <button type="button" class="btn-inline" onclick="duplicateHab(${index})">Duplicar</button>
              <button type="button" class="btn-inline" onclick="moveHab(${index}, -1)" ${index === 0 ? "disabled" : ""}>Subir</button>
              <button type="button" class="btn-inline" onclick="moveHab(${index}, 1)" ${index === habs.length - 1 ? "disabled" : ""}>Descer</button>
              <button type="button" class="btn-remove" onclick="removeHab(${index})" aria-label="Remover entrada">x</button>
            </div>
          </div>

          <div class="hab-card-body" id="habCardBody${index}" ${habCardStates[hab.id]?.collapsed ? "hidden" : ""}>
            <div class="hab-card-grid hab-card-grid-main">
              <div class="hab-field">
                <label class="form-label" for="habName${index}">Nome</label>
                <input
                  id="habName${index}"
                  class="hab-input hab-name"
                  type="text"
                  placeholder="Nome da habilidade..."
                  value="${esc(hab.name)}"
                  oninput="updateHab(${index}, 'name', this.value)"
                />
              </div>

              <div class="hab-field hab-field-type">
                <label class="form-label" for="habType${index}">Tipo</label>
                <select
                  id="habType${index}"
                  class="hab-input hab-select"
                  onchange="updateHab(${index}, 'type', this.value)"
                >
                  ${Object.entries(HAB_TYPES)
                    .map(([value, label]) => `<option value="${esc(value)}" ${hab.type === value ? "selected" : ""}>${esc(label)}</option>`)
                    .join("")}
                </select>
              </div>
            </div>

            <div class="hab-card-grid hab-card-grid-detail">
              <div class="hab-field">
                <label class="form-label" for="habTrigger${index}">Gatilho</label>
                <input
                  id="habTrigger${index}"
                  class="hab-input"
                  type="text"
                  placeholder="Quando ou como esta entrada pode ser ativada..."
                  value="${esc(hab.trigger)}"
                  oninput="updateHab(${index}, 'trigger', this.value)"
                />
              </div>

              <div class="hab-field hab-field-full">
                <label class="form-label" for="habDesc${index}">Descrição</label>
                <textarea
                  id="habDesc${index}"
                  class="hab-desc auto-grow"
                  rows="4"
                  placeholder="Efeito, restrições, custo narrativo e observações de uso..."
                  oninput="updateHab(${index}, 'desc', this.value)"
                >${esc(hab.desc)}</textarea>
              </div>
            </div>
          </div>
        </article>
      `
    )
    .join("");

  syncAutoGrowTextareas(element);
}

function updateHab(index, field, value) {
  if (!habs[index]) return;
  habs[index] = normalizeHab({
    ...habs[index],
    [field]: value
  });
  syncHabSummary(index);
}

function addHabilidade() {
  const nextHab = normalizeHab({
    id: createHabId(),
    name: "",
    type: "ativa",
    trigger: "",
    desc: ""
  });
  habs.push(nextHab);
  habCardStates[nextHab.id] = { collapsed: false };
  renderHabs(habs);
  document.querySelectorAll(".hab-name")[habs.length - 1].focus();
  saveSheetSilently();
}

function syncHabSummary(index) {
  const hab = habs[index];
  const row = document.querySelector(`.hab-card[data-hab-index="${index}"]`);
  if (!hab || !row) return;

  const badge = row.querySelector(".hab-type-badge");
  const title = row.querySelector(".hab-card-title");
  const meta = row.querySelector(".hab-card-meta");

  if (badge) {
    badge.className = getHabTypeBadgeClass(hab.type);
    badge.textContent = getHabTypeLabel(hab.type);
  }
  if (title) title.textContent = hab.name || "Nova entrada";
  if (meta) meta.textContent = buildHabSummaryMeta(hab);
}

function toggleHabCard(habId) {
  if (!habCardStates[habId]) {
    habCardStates[habId] = { collapsed: true };
  } else {
    habCardStates[habId].collapsed = !habCardStates[habId].collapsed;
  }
  renderHabs(habs);
}

function duplicateHab(index) {
  if (!habs[index]) return;

  const clone = normalizeHab({
    ...habs[index],
    id: createHabId(),
    name: habs[index].name ? `${habs[index].name} (cópia)` : ""
  });

  habs.splice(index + 1, 0, clone);
  habCardStates[clone.id] = { collapsed: false };
  renderHabs(habs);
  document.querySelectorAll(".hab-name")[index + 1]?.focus();
  saveSheetSilently();
}

function moveHab(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= habs.length) return;

  [habs[index], habs[targetIndex]] = [habs[targetIndex], habs[index]];
  renderHabs(habs);
  document.querySelectorAll(".hab-name")[targetIndex]?.focus();
  saveSheetSilently();
}

function removeHab(index) {
  if (habs[index]?.id) delete habCardStates[habs[index].id];
  habs.splice(index, 1);
  renderHabs(habs);
  saveSheetSilently();
}

function collectHabs() {
  return habs.map(normalizeHab);
}
