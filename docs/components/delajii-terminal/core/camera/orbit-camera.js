export function createOrbitCamera(THREE, canvas, camera) {
  const target = new THREE.Vector3();
  let yaw = Math.atan2(18, 30);
  const pitch = THREE.MathUtils.degToRad(25);
  let dragging = false;
  let pointerX = 0;

  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    dragging = true;
    pointerX = event.clientX;
    canvas.classList.add("dragging");
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", event => {
    if (!dragging) return;
    yaw -= (event.clientX - pointerX) * 0.006;
    pointerX = event.clientX;
  });

  const release = () => {
    dragging = false;
    canvas.classList.remove("dragging");
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  return {
    get yaw() { return yaw; },
    update(position) {
      const distance = 38;
      const flatDistance = Math.cos(pitch) * distance;
      target.set(
        position.x + Math.sin(yaw) * flatDistance,
        position.y + 1.35 + Math.sin(pitch) * distance,
        position.z + Math.cos(yaw) * flatDistance
      );
      camera.position.lerp(target, 0.07);
      camera.lookAt(position.x, 1.35, position.z);
    }
  };
}
