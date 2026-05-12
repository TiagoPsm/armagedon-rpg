function renderPassives(list) {
  passives = list.map(normalizePassive);
  const element = document.getElementById("passiveList");
  if (!element) return;

  if (!passives.length) {
    element.innerHTML = '<p class="empty-msg">Nenhum efeito passivo permanente registrado.</p>';
    return;
  }

  element.innerHTML = passives
    .map((passive, index) => `
      <article class="hab-row hab-card passive-card" data-passive-index="${index}">
        <div class="hab-card-head passive-card-head">
          <div class="hab-toggle-copy">
            <span class="hab-type-badge is-passiva">Permanente</span>
            <strong class="hab-card-title">${esc(passive.name || "Novo efeito passivo")}</strong>
            <span class="hab-card-meta">${esc(buildPassiveSummary(passive))}</span>
          </div>

          <div class="hab-card-actions">
            <button type="button" class="btn-inline" onclick="duplicatePassive(${index})">Duplicar</button>
            <button type="button" class="btn-inline" onclick="movePassive(${index}, -1)" ${index === 0 ? "disabled" : ""}>Subir</button>
            <button type="button" class="btn-inline" onclick="movePassive(${index}, 1)" ${index === passives.length - 1 ? "disabled" : ""}>Descer</button>
            <button type="button" class="btn-remove" onclick="removePassive(${index})" aria-label="Remover efeito passivo">x</button>
          </div>
        </div>

        <div class="hab-card-body">
          <div class="hab-card-grid hab-card-grid-main passive-card-grid">
            <div class="hab-field">
              <label class="form-label" for="passiveName${index}">Nome</label>
              <input
                id="passiveName${index}"
                class="hab-input passive-name"
                type="text"
                placeholder="Ex: Sangue frio..."
                value="${esc(passive.name)}"
                oninput="updatePassive(${index}, 'name', this.value)"
              />
            </div>

            <div class="hab-field">
              <label class="form-label" for="passiveSource${index}">Origem</label>
              <input
                id="passiveSource${index}"
                class="hab-input"
                type="text"
                placeholder="Raça, item, pacto, trauma..."
                value="${esc(passive.source)}"
                oninput="updatePassive(${index}, 'source', this.value)"
              />
            </div>

            <div class="hab-field hab-field-full">
              <label class="form-label" for="passiveEffect${index}">Efeito permanente</label>
              <textarea
                id="passiveEffect${index}"
                class="hab-desc auto-grow"
                rows="4"
                placeholder="Descreva o efeito constante, bônus, restrição ou condição passiva..."
                oninput="updatePassive(${index}, 'effect', this.value)"
              >${esc(passive.effect)}</textarea>
            </div>
          </div>
        </div>
      </article>
    `)
    .join("");

  syncAutoGrowTextareas(element);
}

function buildPassiveSummary(passive) {
  const source = String(passive.source || "").trim();
  const effect = String(passive.effect || "").trim();
  if (source && effect) return `${source}: ${effect.length > 90 ? `${effect.slice(0, 87)}...` : effect}`;
  if (source) return `Origem: ${source}`;
  if (effect) return effect.length > 110 ? `${effect.slice(0, 107)}...` : effect;
  return "Sem origem ou efeito definidos.";
}

function syncPassiveSummary(index) {
  const passive = passives[index];
  const row = document.querySelector(`.passive-card[data-passive-index="${index}"]`);
  if (!passive || !row) return;

  const title = row.querySelector(".hab-card-title");
  const meta = row.querySelector(".hab-card-meta");
  if (title) title.textContent = passive.name || "Novo efeito passivo";
  if (meta) meta.textContent = buildPassiveSummary(passive);
}

function updatePassive(index, field, value) {
  if (!passives[index]) return;
  passives[index] = normalizePassive({
    ...passives[index],
    [field]: value
  });
  syncPassiveSummary(index);
  saveSheetSilently();
}

function addPassive() {
  const nextPassive = normalizePassive({
    id: createPassiveId(),
    name: "",
    source: "",
    effect: ""
  });
  passives.push(nextPassive);
  renderPassives(passives);
  document.querySelectorAll(".passive-name")[passives.length - 1]?.focus();
  saveSheetSilently();
}

function duplicatePassive(index) {
  if (!passives[index]) return;

  const clone = normalizePassive({
    ...passives[index],
    id: createPassiveId(),
    name: passives[index].name ? `${passives[index].name} (copia)` : ""
  });

  passives.splice(index + 1, 0, clone);
  renderPassives(passives);
  document.querySelectorAll(".passive-name")[index + 1]?.focus();
  saveSheetSilently();
}

function movePassive(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= passives.length) return;

  [passives[index], passives[targetIndex]] = [passives[targetIndex], passives[index]];
  renderPassives(passives);
  document.querySelectorAll(".passive-name")[targetIndex]?.focus();
  saveSheetSilently();
}

function removePassive(index) {
  passives.splice(index, 1);
  renderPassives(passives);
  saveSheetSilently();
}

function collectPassives() {
  return passives.map(normalizePassive);
}
