import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  fitCharacterVisual,
  useBasicCharacterMaterials
} from "../../../core/character/animated-character.js?v=ydlpd-1";
import { PLAYER_BODY_BOX } from "../../../core/character/player-body.js?v=character-height-1";
import {
  landingHeight,
  moveWithCollisions,
  supportHeightAt
} from "../../../core/physics/collision.js?v=ydlpd-1";

const IDLE_CLIP_NAME = "A-pose-frame";
const WALK_CLIP_NAME = "walk-final";
const WALK_SPEED = 3;
const RUN_SPEED = 8;
const CRAZY_RUN_SPEED = 11;
const GRAVITY = 20;
const PLAYER_NOTICE_DISTANCE = 2;
const PLAYER_CHARGE_DISTANCE = 10;
const PLAYER_HIT_DISTANCE = PLAYER_BODY_BOX.width;

function randomBetween(minimum, maximum) {
  return minimum + Math.random() * (maximum - minimum);
}

function createAnimationController(THREE, visual, animations) {
  const idleClip = animations.find(clip => clip.name === IDLE_CLIP_NAME)
    || animations.find(clip => /idle|pose/i.test(clip.name));
  const walkClip = animations.find(clip => clip.name === WALK_CLIP_NAME)
    || animations.find(clip => /walk/i.test(clip.name));
  if (!idleClip || !walkClip) {
    throw new Error("ydlpd requires an idle frame and a walk cycle");
  }

  const mixer = new THREE.AnimationMixer(visual);
  const idle = mixer.clipAction(idleClip);
  const walk = mixer.clipAction(walkClip);
  idle.setLoop(THREE.LoopOnce, 1);
  idle.clampWhenFinished = true;
  walk.setLoop(THREE.LoopRepeat, Infinity);
  let current = null;

  function play(action, timeScale = 1) {
    if (current !== action) {
      current?.stop();
      current = action;
      action.reset().play();
    }
    action.timeScale = timeScale;
  }

  return {
    update(dt, moving, running) {
      play(moving ? walk : idle, running ? 2.7 : 1.25);
      mixer.update(dt);
    }
  };
}

function createMovingCollider(position) {
  const halfWidth = PLAYER_BODY_BOX.width / 2;
  const halfDepth = PLAYER_BODY_BOX.depth / 2;
  const collider = {
    collisionRule: "character",
    solid: true,
    width: PLAYER_BODY_BOX.width,
    height: PLAYER_BODY_BOX.height,
    depth: PLAYER_BODY_BOX.depth
  };
  collider.sync = () => {
    collider.centerX = position.x;
    collider.centerY = position.y + PLAYER_BODY_BOX.height / 2;
    collider.centerZ = position.z;
    collider.minX = position.x - halfWidth;
    collider.maxX = position.x + halfWidth;
    collider.minZ = position.z - halfDepth;
    collider.maxZ = position.z + halfDepth;
    collider.bottom = position.y;
    collider.top = position.y + PLAYER_BODY_BOX.height;
  };
  collider.sync();
  return collider;
}

function createPoliceBehavior(THREE, object, animation, colliders, floorHeight) {
  const collider = createMovingCollider(object.position);
  const obstacleColliders = colliders.filter(candidate => candidate !== collider);
  const previousPosition = new THREE.Vector3();
  let state = "initial-walk";
  let stateTime = 0;
  let distanceRemaining = randomBetween(2, 10);
  let verticalVelocity = 0;
  let grounded = true;
  let noticeConditionActive = false;
  let crazyTurnTime = 0;
  let crazyJumpTime = randomBetween(0.35, 1.2);

  function facePosition(position) {
    const dx = position.x - object.position.x;
    const dz = position.z - object.position.z;
    if (Math.abs(dx) + Math.abs(dz) > Number.EPSILON) {
      object.rotation.y = Math.atan2(dx, dz);
    }
  }

  function startNormalWalk() {
    state = "walk";
    distanceRemaining = randomBetween(2, 10);
  }

  function startCrazy() {
    state = "crazy";
    stateTime = 10;
    crazyTurnTime = 0;
    crazyJumpTime = randomBetween(0.35, 1.2);
  }

  function judgeNextAction() {
    const roll = Math.random();
    if (roll < 0.01) {
      startCrazy();
      return;
    }
    if (roll < 0.09) {
      object.rotation.y += randomBetween(-Math.PI / 2, Math.PI / 2);
      state = "sprint";
      distanceRemaining = randomBetween(2, 10);
      return;
    }
    object.rotation.y += randomBetween(-Math.PI, Math.PI);
    state = "idle";
    stateTime = randomBetween(1, 5);
  }

  function moveForward(dt, speed) {
    const requestedDistance = Math.min(distanceRemaining, speed * dt);
    previousPosition.copy(object.position);
    moveWithCollisions(
      object.position,
      Math.sin(object.rotation.y) * requestedDistance,
      Math.cos(object.rotation.y) * requestedDistance,
      obstacleColliders,
      PLAYER_BODY_BOX
    );
    const movedDistance = Math.hypot(
      object.position.x - previousPosition.x,
      object.position.z - previousPosition.z
    );
    distanceRemaining -= movedDistance;
    return requestedDistance > 0.0001 && movedDistance < requestedDistance * 0.25;
  }

  function updateVerticalMotion(dt) {
    if (grounded) {
      const support = supportHeightAt(
        object.position,
        obstacleColliders,
        floorHeight,
        PLAYER_BODY_BOX
      );
      object.position.y = support;
      return;
    }

    const fromY = object.position.y;
    verticalVelocity -= GRAVITY * dt;
    const toY = fromY + verticalVelocity * dt;
    const landing = verticalVelocity <= 0
      ? landingHeight(
        object.position,
        fromY,
        toY,
        obstacleColliders,
        floorHeight,
        PLAYER_BODY_BOX
      )
      : null;
    if (landing !== null) {
      object.position.y = landing;
      verticalVelocity = 0;
      grounded = true;
    } else {
      object.position.y = toY;
    }
  }

  function beginPlayerReaction() {
    if (Math.random() >= 0.3) return;
    if (Math.random() < 0.95) {
      state = "watch-short";
      stateTime = 3;
    } else {
      state = "watch-long";
      stateTime = 30;
    }
  }

  function update(dt, { playerPosition, playerMoving }) {
    const horizontalDistance = Math.hypot(
      playerPosition.x - object.position.x,
      playerPosition.z - object.position.z
    );
    const canNoticePlayer = playerMoving && horizontalDistance <= PLAYER_NOTICE_DISTANCE;
    const normalState = state === "idle" || state === "walk" || state === "sprint";
    if (normalState && canNoticePlayer && !noticeConditionActive) beginPlayerReaction();
    noticeConditionActive = canNoticePlayer;

    let moving = false;
    let running = false;
    if (state === "initial-walk" || state === "walk" || state === "sprint") {
      moving = true;
      running = state === "sprint";
      const blocked = moveForward(dt, running ? RUN_SPEED : WALK_SPEED);
      if (blocked || distanceRemaining <= 0.001) judgeNextAction();
    } else if (state === "idle") {
      stateTime -= dt;
      if (stateTime <= 0) startNormalWalk();
    } else if (state === "crazy") {
      moving = true;
      running = true;
      stateTime -= dt;
      crazyTurnTime -= dt;
      crazyJumpTime -= dt;
      if (crazyTurnTime <= 0) {
        object.rotation.y += randomBetween(-Math.PI, Math.PI);
        crazyTurnTime = randomBetween(0.25, 0.8);
      }
      distanceRemaining = Infinity;
      moveForward(dt, CRAZY_RUN_SPEED);
      if (grounded && crazyJumpTime <= 0) {
        grounded = false;
        verticalVelocity = randomBetween(7, 11);
        crazyJumpTime = randomBetween(0.35, 1.2);
      }
      if (stateTime <= 0) judgeNextAction();
    } else if (state === "watch-short") {
      facePosition(playerPosition);
      stateTime -= dt;
      if (stateTime <= 0) {
        object.rotation.y += randomBetween(-Math.PI, Math.PI);
        startNormalWalk();
      }
    } else if (state === "watch-long") {
      facePosition(playerPosition);
      stateTime -= dt;
      if (horizontalDistance >= PLAYER_CHARGE_DISTANCE) {
        state = "charge";
      } else if (stateTime <= 0) {
        object.rotation.y += randomBetween(-Math.PI, Math.PI);
        startNormalWalk();
      }
    } else if (state === "charge") {
      moving = true;
      running = true;
      facePosition(playerPosition);
      distanceRemaining = Infinity;
      moveForward(dt, CRAZY_RUN_SPEED);
      if (horizontalDistance <= PLAYER_HIT_DISTANCE) {
        state = "charge-pause";
        stateTime = 1;
      }
    } else if (state === "charge-pause") {
      facePosition(playerPosition);
      stateTime -= dt;
      if (stateTime <= 0) judgeNextAction();
    }

    updateVerticalMotion(dt);
    collider.sync();
    animation.update(dt, moving, running);
  }

  return { collider, forceCrazy: startCrazy, update };
}

export async function createYdlPolice(THREE, { colliders, floorHeight }) {
  const gltf = await new GLTFLoader().loadAsync(
    new URL("./ydlpd.glb", import.meta.url).href
  );
  const object = new THREE.Group();
  object.name = "ydlpd";
  const visual = gltf.scene;
  useBasicCharacterMaterials(THREE, visual);
  fitCharacterVisual(THREE, visual, PLAYER_BODY_BOX.height);
  object.add(visual);

  const animation = createAnimationController(THREE, visual, gltf.animations);
  const behavior = createPoliceBehavior(
    THREE,
    object,
    animation,
    colliders,
    floorHeight
  );
  return {
    object,
    collider: behavior.collider,
    forceCrazy: behavior.forceCrazy,
    update: behavior.update
  };
}
