function isChatTarget(target) {
  return target instanceof Element && Boolean(target.closest("#chat-panel"));
}

export function createGameInteractionGuard() {
  ["contextmenu", "selectstart", "dragstart", "copy"].forEach(type => {
    document.addEventListener(type, event => {
      if (!isChatTarget(event.target)) event.preventDefault();
    });
  });
}
