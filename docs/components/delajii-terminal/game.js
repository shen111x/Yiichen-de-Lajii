import { startGame } from "./core/game.js?v=glb-player-2";

const adminEnabled = new URLSearchParams(location.search).get("game-admin") === "1"
  && (location.hostname === "127.0.0.1" || location.hostname === "localhost");
const extensionFactory = adminEnabled
  ? (await import("./admin/admin.js?v=glb-player-2")).createAdminMode
  : null;

startGame({
  extensionFactory,
  unlimitedJumps: adminEnabled
});
