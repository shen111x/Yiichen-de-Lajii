const CHEAT_CODE = "ydl-9527";

function installCheatStyles() {
  if (document.querySelector("style[data-cheat-styles]")) return;
  const style = document.createElement("style");
  style.dataset.cheatStyles = "";
  style.textContent = `
    .cheat-command-browser {
      height: 100%;
      overflow: auto;
      padding: 14px;
      font-size: var(--product-info-font-size);
    }
    .cheat-command-browser header {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: var(--terminal-stroke) solid #111;
    }
    .cheat-command-browser header span:last-child { text-align: right; }
    .cheat-command-browser details { border-bottom: var(--terminal-stroke) solid #111; }
    .cheat-command-browser summary { padding: 9px 0; cursor: pointer; }
    .cheat-command-items {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 8px;
      padding: 0 0 10px 16px;
    }
    .cheat-command-items button {
      min-height: 34px;
      padding: 6px 8px;
      border: var(--terminal-stroke) solid #111;
      text-align: left;
    }
    .cheat-command-items button:active { color: #fff; background: #000; }
    .cheat-active .identity span::after { content: " / 9527"; }
  `;
  document.head.append(style);
}

export function createCheatCommands({ enableUnlimitedJumps, triggerPoliceCrazy }) {
  const chat = document.querySelector("#chat-panel");
  const chatInput = chat?.querySelector('input[aria-label="Chat message"]');
  const browserHost = chat?.querySelector(".chat-placeholder");
  const expandButton = chat?.querySelector("[data-expand-chat]");
  if (!chat || !chatInput || !browserHost || !expandButton) {
    return { active: false };
  }

  installCheatStyles();
  let active = false;
  let statusMessage = "9527 mode · unlimited jumps enabled";

  function renderCommands() {
    if (!active) return;
    browserHost.replaceChildren();
    const browser = document.createElement("section");
    browser.className = "cheat-command-browser";

    const header = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = "9527 Commands";
    const status = document.createElement("span");
    status.dataset.cheatStatus = "";
    status.textContent = statusMessage;
    header.append(title, status);

    const general = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "通用";
    const items = document.createElement("div");
    items.className = "cheat-command-items";
    const policeCrazy = document.createElement("button");
    policeCrazy.type = "button";
    policeCrazy.dataset.cheatCommand = "police-crazy";
    policeCrazy.textContent = "警察发疯";
    items.append(policeCrazy);
    general.append(summary, items);
    browser.append(header, general);
    browserHost.append(browser);
  }

  function activate() {
    if (!active) {
      active = true;
      enableUnlimitedJumps();
      document.body.classList.add("cheat-active");
    }
    chatInput.value = "";
    statusMessage = "9527 mode · unlimited jumps enabled";
    if (!chat.classList.contains("expanded")) expandButton.click();
    else renderCommands();
  }

  function consumeCheatCode(event) {
    if (chatInput.value.trim().toLowerCase() !== CHEAT_CODE) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    activate();
    return true;
  }

  chat.addEventListener("submit", consumeCheatCode);
  chatInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.repeat) consumeCheatCode(event);
  });

  expandButton.addEventListener("click", () => {
    if (active && chat.classList.contains("expanded")) renderCommands();
  });

  browserHost.addEventListener("click", event => {
    const button = event.target.closest("[data-cheat-command]");
    if (!active || !button) return;
    if (button.dataset.cheatCommand === "police-crazy") {
      const triggeredImmediately = triggerPoliceCrazy();
      statusMessage = triggeredImmediately
        ? "警察已进入10秒疯狂状态"
        : "警察加载完成后立即发疯";
      renderCommands();
      browserHost.querySelector("details")?.setAttribute("open", "");
    }
  });

  return {
    get active() {
      return active;
    }
  };
}
