export function createKeyboard(panel) {
  const keys = new Set();
  const pointers = new Map();
  const lastTap = new Map();
  let sprintKey = null;
  let jumpQueued = false;
  const actionFor = key => ({
    w: "up", arrowup: "up", s: "down", arrowdown: "down",
    a: "left", arrowleft: "left", d: "right", arrowright: "right"
  })[key];

  function registerTap(action) {
    const now = performance.now();
    const previousTap = lastTap.get(action);
    if (previousTap && now - previousTap < 280) sprintKey = action;
    lastTap.set(action, now);
  }

  addEventListener("keydown", event => {
    const key = event.key.toLowerCase();
    if ((key === " " || key === "spacebar") && !event.repeat) {
      event.preventDefault();
      jumpQueued = true;
      return;
    }
    const action = actionFor(key);
    if (!action || event.repeat) return;
    registerTap(action);
    keys.add(key);
  });

  addEventListener("keyup", event => {
    const key = event.key.toLowerCase();
    if (actionFor(key) === sprintKey) sprintKey = null;
    keys.delete(key);
  });

  panel?.querySelectorAll("[data-move]").forEach(button => {
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      const action = button.dataset.move;
      registerTap(action);
      pointers.set(event.pointerId, action);
      button.classList.add("active");
    });
    const release = event => {
      const action = pointers.get(event.pointerId);
      if (action === sprintKey) sprintKey = null;
      pointers.delete(event.pointerId);
      button.classList.remove("active");
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
  });

  const jumpButton = panel?.querySelector("[data-jump]");
  jumpButton?.addEventListener("pointerdown", event => {
    event.preventDefault();
    jumpButton.setPointerCapture(event.pointerId);
    jumpQueued = true;
    jumpButton.classList.add("active");
  });
  jumpButton?.addEventListener("pointerup", () => jumpButton.classList.remove("active"));
  jumpButton?.addEventListener("pointercancel", () => jumpButton.classList.remove("active"));

  addEventListener("blur", () => {
    keys.clear();
    pointers.clear();
    sprintKey = null;
    jumpQueued = false;
  });

  const active = action => [...keys].some(key => actionFor(key) === action) || [...pointers.values()].includes(action);

  return {
    movement() {
      return {
        x: Number(active("right")) - Number(active("left")),
        z: Number(active("down")) - Number(active("up")),
        sprinting: sprintKey !== null && active(sprintKey)
      };
    },
    consumeJump() {
      const queued = jumpQueued;
      jumpQueued = false;
      return queued;
    }
  };
}
