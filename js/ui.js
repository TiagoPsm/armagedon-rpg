(function () {
  const state = {
    root: null,
    resolve: null,
    lastFocused: null,
    focusTimer: 0,
    type: "confirm"
  };
  const managedModals = new Map();
  let bodyLockCount = 0;

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
    root.className = "ui-modal-root app-modal-root";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div class="ui-modal-backdrop app-modal-backdrop" data-modal-close="backdrop"></div>
      <section class="ui-modal-panel app-modal-panel app-modal-panel-compact" role="dialog" aria-modal="true" aria-labelledby="uiModalTitle" tabindex="-1">
        <button type="button" class="ui-modal-close app-modal-close" data-modal-close="button" aria-label="Fechar popup">
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

      if (target.closest("[data-modal-cancel], [data-modal-close]")) {
        close(getDismissResult());
      }
    });

    root.querySelector("[data-modal-confirm]")?.addEventListener("click", () => close(true));

    document.body.appendChild(root);
    state.root = root;
    return root;
  }

  function initCursorGlow() {
    if (document.querySelector(".cursor-crimson-glow")) return;
    if (typeof window.matchMedia === "function") {
      if (!window.matchMedia("(pointer: fine)").matches) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    }

    const glow = document.createElement("div");
    glow.className = "cursor-crimson-glow";
    glow.setAttribute("aria-hidden", "true");
    document.body.appendChild(glow);

    let frameId = 0;
    let nextX = window.innerWidth / 2;
    let nextY = window.innerHeight / 2;

    const render = () => {
      frameId = 0;
      glow.style.transform = `translate3d(${nextX}px, ${nextY}px, 0) translate(-50%, -50%)`;
    };

    const handleMove = event => {
      if (document.body.classList.contains("mesa-drag-active")) {
        glow.classList.remove("is-visible");
        return;
      }
      nextX = event.clientX;
      nextY = event.clientY;
      glow.classList.add("is-visible");
      if (!frameId) frameId = window.requestAnimationFrame(render);
    };

    document.addEventListener("pointermove", handleMove, { passive: true });
    document.addEventListener("pointerleave", () => glow.classList.remove("is-visible"));
    window.addEventListener("blur", () => glow.classList.remove("is-visible"));
  }

  function addResourceHint(rel, href, as) {
    if (!href || document.querySelector(`link[rel="${rel}"][href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = rel;
    link.href = href;
    if (as) link.as = as;
    document.head.appendChild(link);
  }

  function initFichaPrefetch() {
    const fichaLinks = [...document.querySelectorAll('a[href$="ficha.html"]')];
    if (!fichaLinks.length) return;

    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    const prefetchFichaDocument = () => {
      if (currentPath !== "ficha.html") {
        addResourceHint("prefetch", "ficha.html", "document");
      }
    };
    const preloadFichaAssets = () => {
      [
        "css/ficha-page.bundle.css?v=2026-05-12-ficha-fast-1",
        "js/ficha-page.bundle.js?v=2026-05-12-ficha-fast-1",
        "css/ficha-base.css?v=2026-04-24-split-1",
        "css/ficha-inventory-memory.css?v=2026-05-12-passives-1",
        "js/ficha-core.js?v=2026-05-12-passives-1",
        "js/ficha-inventory.js?v=2026-05-12-item-quantity-1"
      ].forEach(href => addResourceHint("prefetch", href, href.split("?")[0].endsWith(".css") ? "style" : "script"));
    };

    fichaLinks.forEach(link => {
      link.addEventListener("pointerenter", preloadFichaAssets, { once: true, passive: true });
      link.addEventListener("focus", preloadFichaAssets, { once: true });
      link.addEventListener("touchstart", preloadFichaAssets, { once: true, passive: true });
    });

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(prefetchFichaDocument, { timeout: 1600 });
    } else {
      window.setTimeout(prefetchFichaDocument, 700);
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(getDismissResult());
      return;
    }

    if (event.key === "Tab") {
      trapModalFocus(event);
    }
  }

  function onFocusIn(event) {
    const root = state.root;
    const panel = root?.querySelector(".ui-modal-panel");
    if (!(root instanceof HTMLElement) || !(panel instanceof HTMLElement) || !root.classList.contains("is-open")) return;
    if (panel.contains(event.target)) return;

    const focusable = getFocusableElements(panel);
    (focusable[0] || panel).focus();
  }

  function isCentralModalOpen() {
    return Boolean(state.root?.classList.contains("is-open"));
  }

  function lockModalBody() {
    bodyLockCount += 1;
    document.body.classList.add("modal-open");
  }

  function unlockModalBody() {
    bodyLockCount = Math.max(0, bodyLockCount - 1);
    if (!bodyLockCount) {
      document.body.classList.remove("modal-open");
    }
  }

  function getFocusableElements(root) {
    if (!root) return [];
    return [...root.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(element => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  }

  function trapModalFocus(event) {
    const root = state.root;
    const panel = root?.querySelector(".ui-modal-panel");
    if (!(root instanceof HTMLElement) || !(panel instanceof HTMLElement) || !root.classList.contains("is-open")) return;

    const focusable = getFocusableElements(panel);
    if (!focusable.length) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (!panel.contains(active)) {
      event.preventDefault();
      first.focus();
      return;
    }

    event.preventDefault();
    const activeIndex = focusable.indexOf(active);
    if (event.shiftKey) {
      const previous = activeIndex <= 0 ? last : focusable[activeIndex - 1];
      previous.focus();
      return;
    }

    const next = activeIndex < 0 || activeIndex >= focusable.length - 1
      ? first
      : focusable[activeIndex + 1];
    next.focus();
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

    lockModalBody();
    root.classList.add("is-open");
    root.setAttribute("aria-hidden", "false");
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);

    return new Promise(resolve => {
      state.resolve = resolve;
      const focusInitialElement = () => {
        if (!root.classList.contains("is-open") || state.root !== root) return;
        if (isSelect) {
          optionList.querySelector(".ui-modal-option.is-selected, .ui-modal-option")?.focus();
          return;
        }
        (isAlert ? confirmButton : cancelButton).focus();
      };

      focusInitialElement();
      window.requestAnimationFrame(focusInitialElement);
      if (state.focusTimer) window.clearTimeout(state.focusTimer);
      state.focusTimer = window.setTimeout(() => {
        state.focusTimer = 0;
        focusInitialElement();
      }, 60);
    });
  }

  function close(result) {
    if (!state.root || !state.resolve) return;

    const resolve = state.resolve;
    state.resolve = null;

    state.root.classList.remove("is-open");
    state.root.setAttribute("aria-hidden", "true");
    if (state.focusTimer) {
      window.clearTimeout(state.focusTimer);
      state.focusTimer = 0;
    }
    unlockModalBody();
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("focusin", onFocusIn);

    const focusTarget = state.lastFocused instanceof HTMLElement ? state.lastFocused : null;
    if (focusTarget) {
      focusTarget.focus();
      window.requestAnimationFrame(() => {
        if (document.activeElement !== focusTarget) focusTarget.focus();
      });
    }

    resolve(result);
  }

  window.UI = {
    activateModal(root, panel, options = {}) {
      if (!(root instanceof HTMLElement) || !(panel instanceof HTMLElement)) return null;
      if (managedModals.has(root)) return managedModals.get(root);

      const controller = {
        lastFocused: document.activeElement instanceof HTMLElement ? document.activeElement : null,
        onDismiss: typeof options.onDismiss === "function" ? options.onDismiss : null,
        onKeyDown: null,
        onFocusIn: null
      };

      controller.onKeyDown = event => {
        if (root.hidden || !managedModals.has(root) || isCentralModalOpen()) return;
        if (event.key === "Escape" && options.closeOnEscape !== false) {
          event.preventDefault();
          if (controller.onDismiss) controller.onDismiss("escape");
          return;
        }
        if (event.key === "Tab") {
          const focusable = getFocusableElements(panel);
          if (!focusable.length) {
            event.preventDefault();
            panel.focus();
            return;
          }

          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const active = document.activeElement;

          if (!panel.contains(active)) {
            event.preventDefault();
            first.focus();
            return;
          }

          const activeIndex = focusable.indexOf(active);
          if (event.shiftKey && activeIndex <= 0) {
            event.preventDefault();
            last.focus();
            return;
          }

          if (!event.shiftKey && activeIndex === focusable.length - 1) {
            event.preventDefault();
            first.focus();
          }
        }
      };

      controller.onFocusIn = event => {
        if (root.hidden || !managedModals.has(root) || isCentralModalOpen()) return;
        if (panel.contains(event.target)) return;

        const focusable = getFocusableElements(panel);
        (focusable[0] || panel).focus();
      };

      managedModals.set(root, controller);
      root.setAttribute("aria-hidden", "false");
      document.addEventListener("keydown", controller.onKeyDown);
      document.addEventListener("focusin", controller.onFocusIn);
      lockModalBody();

      const initialFocus = options.initialFocus instanceof HTMLElement ? options.initialFocus : panel;
      window.requestAnimationFrame(() => initialFocus.focus());
      return controller;
    },

    deactivateModal(root, options = {}) {
      if (!(root instanceof HTMLElement)) return;
      const controller = managedModals.get(root);
      if (!controller) return;

      document.removeEventListener("keydown", controller.onKeyDown);
      document.removeEventListener("focusin", controller.onFocusIn);
      managedModals.delete(root);
      root.setAttribute("aria-hidden", "true");
      unlockModalBody();

      if (options.restoreFocus !== false && controller.lastFocused instanceof HTMLElement) {
        controller.lastFocused.focus();
      }
    },

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
    document.addEventListener("DOMContentLoaded", () => {
      ensureModal();
      initCursorGlow();
      initFichaPrefetch();
    }, { once: true });
  } else {
    ensureModal();
    initCursorGlow();
    initFichaPrefetch();
  }
})();
