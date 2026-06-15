/* ── echos-init.js ─────────────────────────────────────────────────────
   Boot da página de Echos: autentica, carrega o diretório (para alvos de
   transferência) e renderiza os Echos do usuário logado. */

function preFillEchosHeader() {
  try {
    const session = JSON.parse(localStorage.getItem("tc_session"));
    if (!session?.username) return;
    const user = document.getElementById("echosUser");
    if (user) user.textContent = session.username;
    const role = document.getElementById("echosHeaderRole");
    if (role) role.textContent = session.role === "master" ? "Painel do mestre" : "Echos";
    const intro = document.getElementById("echosIntro");
    if (intro) {
      intro.textContent =
        session.role === "master"
          ? "Visualize, conceda e ajuste os Echos de todos os jogadores e NPCs."
          : "Gerencie os Echos que você obteve derrotando monstros.";
    }
  } catch {}
}

function initEchosPageGlow() {
  const root = document.body;
  if (!root) return;
  if (typeof window.matchMedia === "function" && !window.matchMedia("(pointer: fine)").matches) return;

  const setGlow = (x, y) => {
    root.style.setProperty("--page-glow-x", x);
    root.style.setProperty("--page-glow-y", y);
  };
  setGlow("50%", "16%");

  let frameId = 0;
  const handleMove = event => {
    const { clientX, clientY } = event;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(() => {
      const x = Math.max(0, Math.min(100, (clientX / (window.innerWidth || 1)) * 100)).toFixed(2);
      const y = Math.max(0, Math.min(100, (clientY / (window.innerHeight || 1)) * 100)).toFixed(2);
      setGlow(`${x}%`, `${y}%`);
    });
  };

  root.addEventListener("pointermove", handleMove);
  root.addEventListener("pointerleave", () => setGlow("50%", "16%"));
}

document.addEventListener("DOMContentLoaded", async () => {
  initEchosPageGlow();
  preFillEchosHeader();

  await AUTH_READY;
  echosState.session = AUTH.requireAuth();
  if (!echosState.session) return;

  echosState.isMaster = echosState.session.role === "master";

  bindEchoPageEvents();

  if (AUTH.isBackendEnabled()) {
    try {
      await AUTH.refreshDirectory();
    } catch {}
  }

  await loadEchos();
});
