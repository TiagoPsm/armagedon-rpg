document.addEventListener("DOMContentLoaded", () => {
  initReveal();
  initDice();
});

function initReveal() {
  const items = document.querySelectorAll("[data-reveal]");
  if (!items.length) return;

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.14 }
  );

  items.forEach(item => observer.observe(item));
}

function initDice() {
  const card = document.getElementById("diceCard");
  const result = document.getElementById("diceResult");
  if (!card || !result) return;

  card.addEventListener("click", () => {
    if (card.classList.contains("rolling")) return;

    card.classList.add("rolling");
    result.textContent = "";

    setTimeout(() => {
      const roll = Math.floor(Math.random() * 20) + 1;
      result.textContent = String(roll);
      card.classList.remove("rolling");

      if (roll === 20) {
        result.style.color = "var(--gold)";
      } else if (roll === 1) {
        result.style.color = "var(--red-glow)";
      } else {
        result.style.color = "";
      }
    }, 380);
  });
}
