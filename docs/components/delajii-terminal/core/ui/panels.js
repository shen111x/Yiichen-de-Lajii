export function createPanels() {
  const chat = document.querySelector("#chat-panel");
  const expand = document.querySelector("[data-expand-chat]");
  const map = document.querySelector(".map");
  const movementButton = document.querySelector(".movement-pad button");

  function sizeCompactMap() {
    if (!map.classList.contains("compact")) return;
    map.style.setProperty("--map-scale", movementButton.getBoundingClientRect().width / map.offsetWidth);
  }

  map.addEventListener("click", () => {
    map.classList.toggle("compact");
    map.setAttribute("aria-pressed", String(map.classList.contains("compact")));
    sizeCompactMap();
  });
  addEventListener("resize", sizeCompactMap);

  document.querySelectorAll("[data-toggle-panel]").forEach(button => {
    const panel = document.querySelector(`#${button.dataset.togglePanel}`);
    button.addEventListener("click", () => {
      const willOpen = panel.hidden;
      panel.hidden = !willOpen;
      if (panel === chat) {
        chat.classList.remove("expanded");
        expand.textContent = "Expand";
      }
      button.classList.toggle("active", !panel.hidden);
      button.setAttribute("aria-expanded", String(!panel.hidden));
    });
  });

  expand.addEventListener("click", () => {
    chat.classList.toggle("expanded");
    expand.textContent = chat.classList.contains("expanded") ? "Fold" : "Expand";
  });
}
