import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js";
import { createRuntime } from "./base/runtime.js?v=responsive-fov";
import { createOrbitCamera } from "./camera/orbit-camera.js?v=decoupled-1";
import { createKeyboard } from "./input/keyboard.js";
import { createGameInteractionGuard } from "./input/game-interaction-guard.js";
import { createLighting } from "./lighting.js?v=studio-rig";
import {
  colliderDistanceSquared,
  landingHeight,
  moveWithCollisions,
  supportHeightAt
} from "./physics/collision.js?v=character-collider-1";
import { persistentColliderForObject } from "./physics/object-collider.js?v=character-collider-1";
import { createHud } from "./ui/hud.js";
import { createMinimap } from "./ui/minimap.js?v=map-100";
import { createPanels } from "./ui/panels.js?v=map-toggle-exact";
import { createCharacter } from "../asset/character/yiichen/create-character.js?v=head-fade-range";
import { renderMap } from "./world/render-map.js?v=load-timing-1";
import {
  loadMark,
  loadMeasure,
  measureLoadStep,
  reportLoadPerformance
} from "./performance/load-performance.js?v=load-timing-1";

export async function startGame({
  extensionFactory = null,
  unlimitedJumps = false
} = {}) {
  loadMark("delajii:start-game:start", {
    adminEnabled: Boolean(extensionFactory)
  });
  createGameInteractionGuard();
  loadMark("delajii:interaction-guard-ready");
  loadMark("delajii:runtime:start");
  const runtime = createRuntime(THREE, document.querySelector("#game"));
  loadMark("delajii:runtime:end");
  loadMeasure("delajii:runtime", "delajii:runtime:start", "delajii:runtime:end");
  const { scene, camera, renderer, loader, resize } = runtime;
  loadMark("delajii:lighting:start");
  createLighting(THREE, scene);
  loadMark("delajii:lighting:end");
  loadMeasure("delajii:lighting", "delajii:lighting:start", "delajii:lighting:end");
  const mapUrl = new URL("../data/maps/current-map.json", import.meta.url);
  const mapResponse = await measureLoadStep("delajii:map-fetch", async () => {
    const response = await fetch(mapUrl);
    if (!response.ok) throw new Error(`Unable to load map: ${response.status}`);
    return response;
  }, { url: mapUrl.pathname });
  const mapData = await measureLoadStep(
    "delajii:map-json-parse",
    () => mapResponse.json()
  );
  loadMark("delajii:map-ready", {
    entityCount: mapData.entities.length,
    mapSize: mapData.size
  });
  const character = await measureLoadStep(
    "delajii:player-character",
    () => createCharacter(THREE, loader)
  );
  const world = await renderMap(THREE, loader, mapData);
  loadMark("delajii:core-assets-ready", {
    entityCount: world.entities.length,
    colliderCount: world.colliders.length
  });
  loadMark("delajii:ui:start");
  const keyboard = createKeyboard(document.querySelector(".control-panel"));
  const cameraCollisionExclusions = new WeakSet();
  const cameraCollision = Object.freeze({
    exclude: object => cameraCollisionExclusions.add(object),
    include: object => cameraCollisionExclusions.delete(object)
  });
  const orbit = createOrbitCamera(THREE, renderer.domElement, camera, {
    collisionRoot: world.object,
    collisionExclusions: cameraCollisionExclusions
  });
  const hud = createHud();
  createPanels();
  loadMark("delajii:ui:end");
  loadMeasure("delajii:ui", "delajii:ui:start", "delajii:ui:end");

  loadMark("delajii:scene-attach:start");
  scene.add(world.object, character.object);
  const minimap = createMinimap(
    THREE,
    document.querySelector("#map-view"),
    mapData.size,
    renderer,
    scene,
    character.object
  );
  loadMark("delajii:scene-attach:end");
  loadMeasure(
    "delajii:scene-attach",
    "delajii:scene-attach:start",
    "delajii:scene-attach:end"
  );
  const colliders = world.colliders;
  character.object.position.set(mapData.spawn.x, mapData.spawn.y, mapData.spawn.z);
  orbit.setOrientation(mapData.spawn.yaw, mapData.spawn.pitch);
  let extension = null;
  if (extensionFactory) {
    extension = await measureLoadStep("delajii:admin-extension-setup", () => extensionFactory({
      THREE,
      worldObject: world.object,
      worldEntities: world.entities,
      textureLoader: loader,
      character: character.object,
      orbit,
      colliders,
      mapData,
      createCollider: (object, options) => persistentColliderForObject(THREE, object, options),
      colliderDistanceSquared,
      cameraCollision
    }));
  }
  loadMark("delajii:resize-listener:start");
  addEventListener("resize", resize);
  resize();
  loadMark("delajii:resize-listener:end");
  loadMeasure(
    "delajii:initial-resize",
    "delajii:resize-listener:start",
    "delajii:resize-listener:end"
  );

  let previousTime = performance.now();
  let verticalVelocity = 0;
  let jumpsUsed = 0;
  let grounded = true;
  let firstFrame = true;
  function frame(now) {
    if (firstFrame) loadMark("delajii:first-frame:start");
    const dt = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    const input = keyboard.movement();
    const movingForward = input.z < 0;
    const moveX = movingForward ? input.x : 0;
    const moveZ = input.z;
    const moving = Boolean(moveX || moveZ);

    extension?.update?.();

    if (input.x) orbit.turn(input.x, dt);

    if (keyboard.consumeJump() && (unlimitedJumps || jumpsUsed < 2)) {
      verticalVelocity = 8.5;
      if (!unlimitedJumps) jumpsUsed += 1;
      grounded = false;
    }

    if (moving) {
      const length = Math.hypot(moveX, moveZ);
      const worldX = (moveX * Math.cos(orbit.yaw) + moveZ * Math.sin(orbit.yaw)) / length;
      const worldZ = (-moveX * Math.sin(orbit.yaw) + moveZ * Math.cos(orbit.yaw)) / length;
      const speed = 4 * (input.sprinting ? 3 : 1);
      moveWithCollisions(
        character.object.position,
        worldX * dt * speed,
        worldZ * dt * speed,
        colliders
      );
      character.object.rotation.y = Math.atan2(worldX, worldZ);
    }

    if (grounded) {
      const support = supportHeightAt(character.object.position, colliders, mapData.floorHeight);
      if (Math.abs(character.object.position.y - support) > 0.06) grounded = false;
      else character.object.position.y = support;
    }

    if (!grounded) {
      const fromY = character.object.position.y;
      verticalVelocity -= 20 * dt;
      const toY = fromY + verticalVelocity * dt;
      const landing = verticalVelocity <= 0
        ? landingHeight(character.object.position, fromY, toY, colliders, mapData.floorHeight)
        : null;
      if (landing !== null) {
        character.object.position.y = landing;
        verticalVelocity = 0;
        jumpsUsed = 0;
        grounded = true;
      } else {
        character.object.position.y = toY;
      }
    }

    character.update(now, moving, input.sprinting);
    world.entities.forEach(entity => entity.update?.(dt, character.object.position));
    orbit.update(character.object.position, dt);
    character.updateCameraProximity(camera.position);
    hud.update(character.object.position, orbit.yaw);
    minimap.update(character.object.position, orbit.yaw, now);
    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      loadMark("delajii:first-frame:end");
      loadMeasure(
        "delajii:first-frame-render",
        "delajii:first-frame:start",
        "delajii:first-frame:end"
      );
      loadMark("delajii:interactive");
      loadMeasure(
        "delajii:total-to-interactive",
        "delajii:navigation-start",
        "delajii:interactive"
      );
      requestAnimationFrame(() => reportLoadPerformance());
    }
    requestAnimationFrame(frame);
  }

  loadMark("delajii:start-game:end");
  loadMeasure(
    "delajii:start-game",
    "delajii:start-game:start",
    "delajii:start-game:end"
  );
  loadMark("delajii:first-frame-requested");
  requestAnimationFrame(frame);
}
