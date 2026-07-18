import {
  CAMERA_COLLISION_LAYER,
  setCameraCollisionEnabled
} from "./camera-collision.js?v=character-ignore-1";

export function createOrbitCamera(
  THREE,
  canvas,
  camera,
  { collisionRoot = null, collisionExclusions = null } = {}
) {
  const target = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  raycaster.layers.set(CAMERA_COLLISION_LAYER);
  if (collisionRoot) setCameraCollisionEnabled(collisionRoot, true);
  let yaw = Math.atan2(18, 30);
  let desiredYaw = yaw;
  let pitch = THREE.MathUtils.degToRad(12);
  let desiredPitch = pitch;
  const minPitch = THREE.MathUtils.degToRad(-5);
  const maxPitch = THREE.MathUtils.degToRad(80);
  const focusHeight = 3.3;
  const defaultDistance = 15;
  const firstPersonDistance = 0.12;
  const obstacleClearance = 0.05;
  const yawEase = 5.6;
  const turnSpeed = Math.PI * 0.75;
  let cameraDistance = defaultDistance;
  let dragging = false;
  let pointerX = 0;
  let pointerY = 0;

  function participatesInCameraCollision(object) {
    for (let node = object; node; node = node.parent) {
      if (node.userData.cameraCollisionIgnored === true) return false;
      if (collisionExclusions?.has(node)) return false;
    }
    return true;
  }

  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    dragging = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    canvas.classList.add("dragging");
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", event => {
    if (!dragging) return;
    desiredYaw -= (event.clientX - pointerX) * 0.006;
    desiredPitch = THREE.MathUtils.clamp(
      desiredPitch + (event.clientY - pointerY) * 0.006,
      minPitch,
      maxPitch
    );
    pointerX = event.clientX;
    pointerY = event.clientY;
  });

  const release = () => {
    dragging = false;
    canvas.classList.remove("dragging");
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  function availableDistance() {
    if (!collisionRoot) return defaultDistance;
    raycaster.set(focus, rayDirection);
    raycaster.near = 0.01;
    raycaster.far = defaultDistance;
    const obstacle = raycaster
      .intersectObject(collisionRoot, true)
      .find(hit => hit.object.isMesh && participatesInCameraCollision(hit.object));
    return obstacle
      ? Math.max(firstPersonDistance, obstacle.distance - obstacleClearance)
      : defaultDistance;
  }

  function angleDelta(from, to) {
    return Math.atan2(Math.sin(to - from), Math.cos(to - from));
  }

  return {
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    setOrientation(nextYaw, nextPitch = pitch) {
      if (Number.isFinite(nextYaw)) {
        yaw = nextYaw;
        desiredYaw = nextYaw;
      }
      if (Number.isFinite(nextPitch)) {
        pitch = THREE.MathUtils.clamp(nextPitch, minPitch, maxPitch);
        desiredPitch = pitch;
      }
    },
    turn(direction, dt) {
      desiredYaw -= direction * turnSpeed * dt;
    },
    update(position, dt = 1 / 60) {
      const yawSmoothing = 1 - Math.exp(-yawEase * dt);
      yaw += angleDelta(yaw, desiredYaw) * yawSmoothing;
      pitch = THREE.MathUtils.lerp(pitch, desiredPitch, yawSmoothing);
      focus.set(position.x, position.y + focusHeight, position.z);
      rayDirection.set(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch)
      ).normalize();

      const nextDistance = availableDistance();
      cameraDistance = nextDistance < cameraDistance
        ? nextDistance
        : THREE.MathUtils.lerp(cameraDistance, nextDistance, 0.08);
      if (Math.abs(cameraDistance - nextDistance) < 0.005) cameraDistance = nextDistance;

      target.copy(focus).addScaledVector(rayDirection, cameraDistance);
      camera.position.copy(target);
      camera.lookAt(focus);
    }
  };
}
