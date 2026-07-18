import {
  loadMark,
  loadMeasure
} from "./core/performance/load-performance.js?v=load-timing-1";
import { startGame } from "./core/game.js?v=load-timing-1";

loadMark("delajii:entry-module-ready");
const adminEnabled = new URLSearchParams(location.search).get("game-admin") === "1"
  && (location.hostname === "127.0.0.1" || location.hostname === "localhost");
loadMark("delajii:mode-detected", { adminEnabled });
loadMark("delajii:extension-import:start", { adminEnabled });
const extensionFactory = adminEnabled
  ? (await import("./admin/admin.js?v=character-collider-1")).createAdminMode
  : null;
loadMark("delajii:extension-import:end", { adminEnabled });
loadMeasure(
  "delajii:extension-import",
  "delajii:extension-import:start",
  "delajii:extension-import:end",
  { adminEnabled }
);

loadMark("delajii:start-game-call");
startGame({
  extensionFactory,
  unlimitedJumps: adminEnabled
}).catch(error => {
  loadMark("delajii:start-game-error", {
    message: error instanceof Error ? error.message : String(error)
  });
  console.error("[DeLajii Load] Game startup failed", error);
});
