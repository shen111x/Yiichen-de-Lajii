import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js";
import { createRuntime } from "./base/runtime.js?v=responsive-fov";
import { createOrbitCamera } from "./camera/orbit-camera.js?v=character-ignore-1";
import {
  ignoreCameraCollision,
  setCameraCollisionEnabled
} from "./camera/camera-collision.js?v=character-ignore-1";
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
import { createMinimap } from "./ui/minimap.js?v=deferred-minimap-1";
import { createPanels } from "./ui/panels.js?v=map-toggle-exact";
import { createCharacter } from "../asset/character/yiichen/create-character.js?v=head-fade-range";
import { renderMap } from "./world/render-map.js?v=deferred-tv-canvas-1";
import { releaseMediaAfterFirstFrame } from "./media/deferred-media.js?v=deferred-tv-3";

const MEDIA_START_AFTER_PAINT_DELAY_MS = 120;

export async function startGame({
  extensionFactory = null,
  unlimitedJumps = false
} = {}) {
  createGameInteractionGuard();
  const runtime = createRuntime(THREE, document.querySelector("#game"));
  const { scene, camera, renderer, loader, resize } = runtime;
  createLighting(THREE, scene);
  const mapDataPromise = fetch(new URL("../data/maps/current-map.json", import.meta.url), {
    credentials: "omit"
  }).then(response => {
    if (!response.ok) throw new Error(`Unable to load map: ${response.status}`);
    return response.json();
  });
  const characterPromise = createCharacter(THREE, loader);
  const worldPromise = mapDataPromise.then(async mapData => ({
    mapData,
    world: await renderMap(THREE, loader, mapData)
  }));
  const [character, { mapData, world }] = await Promise.all([
    characterPromise,
    worldPromise
  ]);
  const keyboard = createKeyboard(document.querySelector(".control-panel"));
  const cameraCollisionExclusions = new WeakSet();
  const cameraCollision = Object.freeze({
    exclude(object) {
      cameraCollisionExclusions.add(object);
      setCameraCollisionEnabled(object, false);
    },
    include(object) {
      cameraCollisionExclusions.delete(object);
      setCameraCollisionEnabled(object, true);
    },
    ignore(object) {
      ignoreCameraCollision(object);
    }
  });
  cameraCollision.ignore(character.object);
  world.entities
    .filter(entity => entity.category === "character")
    .forEach(entity => cameraCollision.ignore(entity.object));
  const orbit = createOrbitCamera(THREE, renderer.domElement, camera, {
    collisionRoot: world.object,
    collisionExclusions: cameraCollisionExclusions
  });
  const hud = createHud();
  createPanels();

  scene.add(world.object, character.object);
  const minimap = createMinimap(
    THREE,
    document.querySelector("#map-view"),
    mapData.size,
    renderer,
    scene,
    character.object
  );
  const colliders = world.colliders;
  character.object.position.set(mapData.spawn.x, mapData.spawn.y, mapData.spawn.z);
  orbit.setOrientation(mapData.spawn.yaw, mapData.spawn.pitch);
  let extension = null;
  if (extensionFactory) {
    extension = await extensionFactory({
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
    });
  }
  addEventListener("resize", resize);
  resize();

  let previousTime = performance.now();
  let verticalVelocity = 0;
  let jumpsUsed = 0;
  let grounded = true;
  let firstFrameRendered = false;
  function frame(now) {
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
    if (!firstFrameRendered) {
      firstFrameRendered = true;
      // Safari may submit WebGL work without compositing it before the next
      // animation callback. Cross two display frames and yield once more so the
      // scene is visibly painted before assigning any deferred media source.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(releaseMediaAfterFirstFrame, MEDIA_START_AFTER_PAINT_DELAY_MS);
        });
      });
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
