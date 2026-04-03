(function () {
  const state = {
    root: null,
    resolve: null,
    lastFocused: null,
    type: "confirm"
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function getDismissResult() {
    return state.type === "select" ? null : false;
  }

  function ensureModal() {
    if (state.root) return state.root;

    const root = document.createElement("div");
    root.className = "ui-modal-root";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div class="ui-modal-backdrop" data-modal-close="backdrop"></div>
      <section class="ui-modal-panel" role="dialog" aria-modal="true" aria-labelledby="uiModalTitle" tabindex="-1">
        <button type="button" class="ui-modal-close" data-modal-close="button" aria-label="Fechar popup">
          <span>x</span>
        </button>
        <p class="ui-modal-kicker" id="uiModalKicker">// Confirmação</p>
        <h2 class="ui-modal-title" id="uiModalTitle">Confirmar ação</h2>
        <p class="ui-modal-message" id="uiModalMessage"></p>
        <div class="ui-modal-option-list" id="uiModalOptionList" hidden></div>
        <div class="ui-modal-actions">
          <button type="button" class="btn btn-ghost" data-modal-cancel>Cancelar</button>
          <button type="button" class="btn btn-primary" data-modal-confirm>Confirmar</button>
        </div>
      </section>
    `;

    root.addEventListener("click", event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const option = target.closest("[data-modal-option]");
      if (option instanceof HTMLElement) {
        close(option.dataset.modalOption || null);
        return;
      }

      if (target.hasAttribute("data-modal-cancel") || target.dataset.modalClose) {
        close(getDismissResult());
      }
    });

    root.querySelector("[data-modal-confirm]")?.addEventListener("click", () => close(true));

    document.body.appendChild(root);
    state.root = root;
    return root;
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(getDismissResult());
    }
  }

  function open(options) {
    const root = ensureModal();
    const panel = root.querySelector(".ui-modal-panel");
    const kicker = root.querySelector("#uiModalKicker");
    const title = root.querySelector("#uiModalTitle");
    const message = root.querySelector("#uiModalMessage");
    const optionList = root.querySelector("#uiModalOptionList");
    const confirmButton = root.querySelector("[data-modal-confirm]");
    const cancelButton = root.querySelector("[data-modal-cancel]");

    if (!(panel instanceof HTMLElement) || !(kicker instanceof HTMLElement) || !(title instanceof HTMLElement) || !(message instanceof HTMLElement) || !(optionList instanceof HTMLElement) || !(confirmButton instanceof HTMLElement) || !(cancelButton instanceof HTMLElement)) {
      return Promise.resolve(options.type === "select" ? null : false);
    }

    if (state.resolve) close(getDismissResult());

    state.type = options.type || "confirm";
    root.dataset.variant = options.variant || "default";
    root.dataset.type = state.type;
    kicker.textContent = options.kicker || "// Confirmação";
    title.textContent = options.title || "Confirmar ação";
    message.textContent = options.message || "";
    confirmButton.textContent = options.confirmLabel || "Confirmar";
    cancelButton.textContent = options.cancelLabel || "Cancelar";

    const isAlert = options.type === "alert";
    const isSelect = options.type === "select";
    cancelButton.style.display = isAlert ? "none" : "";
    confirmButton.style.display = isSelect ? "none" : "";
    optionList.hidden = !isSelect;
    message.style.display = options.message ? "" : "none";

    if (isSelect) {
      optionList.innerHTML = (options.options || [])
        .map(
          option => `
            <button
              type="button"
              class="ui-modal-option ${option.selected ? "is-selected" : ""}"
              data-modal-option="${escapeHtml(option.value)}"
            >
              <span class="ui-modal-option-copy">
                <span class="ui-modal-option-title">${escapeHtml(option.label)}</span>
                ${option.meta ? `<span class="ui-modal-option-meta">${escapeHtml(option.meta)}</span>` : ""}
              </span>
              <span class="ui-modal-option-mark">${option.selected ? "Atual" : "Escolher"}</span>
            </button>
          `
        )
        .join("");
    } else {
      optionList.innerHTML = "";
    }

    confirmButton.classList.toggle("ui-modal-confirm-danger", options.variant === "danger");

    state.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    document.body.classList.add("modal-open");
    root.classList.add("is-open");
    root.setAttribute("aria-hidden", "false");
    document.addEventListener("keydown", onKeyDown);

    return new Promise(resolve => {
      state.resolve = resolve;
      window.requestAnimationFrame(() => {
        if (isSelect) {
          optionList.querySelector(".ui-modal-option.is-selected, .ui-modal-option")?.focus();
          return;
        }
        (isAlert ? confirmButton : cancelButton).focus();
      });
    });
  }

  function close(result) {
    if (!state.root || !state.resolve) return;

    const resolve = state.resolve;
    state.resolve = null;

    state.root.classList.remove("is-open");
    state.root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    document.removeEventListener("keydown", onKeyDown);

    if (state.lastFocused instanceof HTMLElement) {
      state.lastFocused.focus();
    }

    resolve(result);
  }

  window.UI = {
    confirm(message, options = {}) {
      return open({
        type: "confirm",
        title: options.title || "Confirmar ação",
        kicker: options.kicker || "// Confirmação",
        message,
        confirmLabel: options.confirmLabel || "Confirmar",
        cancelLabel: options.cancelLabel || "Cancelar",
        variant: options.variant || "default"
      });
    },

    alert(message, options = {}) {
      return open({
        type: "alert",
        title: options.title || "Aviso",
        kicker: options.kicker || "// Aviso",
        message,
        confirmLabel: options.confirmLabel || "Fechar",
        variant: options.variant || "default"
      });
    },

    pickOption(options = {}) {
      return open({
        type: "select",
        title: options.title || "Escolher destino",
        kicker: options.kicker || "// Selecionar",
        message: options.message || "",
        cancelLabel: options.cancelLabel || "Cancelar",
        variant: options.variant || "default",
        options: Array.isArray(options.options) ? options.options : []
      });
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureModal, { once: true });
  } else {
    ensureModal();
  }
})();
