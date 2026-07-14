import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js";
import { createRuntime } from "./base/runtime.js";
import { createOrbitCamera } from "./camera/orbit-camera.js";
import { createKeyboard } from "./input/keyboard.js";
import { landingHeight, moveWithCollisions, supportHeightAt } from "./physics/collision.js?v=platforms";
import { createHud } from "./ui/hud.js";
import { createMinimap } from "./ui/minimap.js?v=map-100";
import { createPanels } from "./ui/panels.js";
import { createCharacter } from "../asset/character/yiichen/create-character.js";
import { createFurniture } from "../asset/furniture/table-set.js?v=black-90";
import { createGround, createBoundaryWalls } from "../asset/surface/ground/create-ground.js";

const WORLD_SIZE = 500;
const TABLES = [{ x: 5, z: 0, rotation: 0 }];

export async function startGame() {
  const runtime = createRuntime(THREE, document.querySelector("#game"));
  const { scene, camera, renderer, loader, resize } = runtime;
  const character = await createCharacter(THREE, loader);
  const furniture = createFurniture(THREE, TABLES);
  const boundary = createBoundaryWalls(THREE, WORLD_SIZE);
  const keyboard = createKeyboard(document.querySelector(".control-panel"));
  const orbit = createOrbitCamera(THREE, renderer.domElement, camera);
  const hud = createHud();
  createPanels();

  scene.add(createGround(THREE, loader, WORLD_SIZE), boundary.object, furniture.object, character.object);
  const minimap = createMinimap(
    THREE,
    document.querySelector("#map-view"),
    WORLD_SIZE,
    renderer,
    scene,
    character.object
  );
  const colliders = [...furniture.colliders, ...boundary.colliders];
  character.object.position.set(0, 0, 0);
  addEventListener("resize", resize);
  resize();

  let previousTime = performance.now();
  let verticalVelocity = 0;
  let jumpsUsed = 0;
  let grounded = true;
  function frame(now) {
    const dt = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    const input = keyboard.movement();
    const moving = Boolean(input.x || input.z);

    if (keyboard.consumeJump() && jumpsUsed < 2) {
      verticalVelocity = 8.5;
      jumpsUsed += 1;
      grounded = false;
    }

    if (moving) {
      const length = Math.hypot(input.x, input.z);
      const worldX = (input.x * Math.cos(orbit.yaw) + input.z * Math.sin(orbit.yaw)) / length;
      const worldZ = (-input.x * Math.sin(orbit.yaw) + input.z * Math.cos(orbit.yaw)) / length;
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
      const support = supportHeightAt(character.object.position, colliders);
      if (Math.abs(character.object.position.y - support) > 0.06) grounded = false;
      else character.object.position.y = support;
    }

    if (!grounded) {
      const fromY = character.object.position.y;
      verticalVelocity -= 20 * dt;
      const toY = fromY + verticalVelocity * dt;
      const landing = verticalVelocity <= 0
        ? landingHeight(character.object.position, fromY, toY, colliders)
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
    orbit.update(character.object.position);
    hud.update(character.object.position, orbit.yaw);
    minimap.update(character.object.position, orbit.yaw, now);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
