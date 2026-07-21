export function createCharacterProximityFade(
  THREE,
  rayTarget,
  setOpacity,
  { fadeStartDistance = 7, fadeEndDistance = 5, nearOpacity = 0.1 } = {}
) {
  const raycaster = new THREE.Raycaster();
  const worldCenter = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const localCamera = new THREE.Vector3();
  const body = rayTarget.userData.fixedPlayerBody;
  const localBounds = new THREE.Box3(
    new THREE.Vector3(-body.width / 2, -body.height / 2, -body.depth / 2),
    new THREE.Vector3(body.width / 2, body.height / 2, body.depth / 2)
  );

  return cameraPosition => {
    rayTarget.updateWorldMatrix(true, false);
    localCamera.copy(cameraPosition);
    rayTarget.worldToLocal(localCamera);

    let distance = 0;
    if (!localBounds.containsPoint(localCamera)) {
      rayTarget.getWorldPosition(worldCenter);
      direction.subVectors(worldCenter, cameraPosition);
      const centerDistance = direction.length();
      if (centerDistance > 0) direction.multiplyScalar(1 / centerDistance);
      raycaster.set(cameraPosition, direction);
      raycaster.near = 0;
      raycaster.far = centerDistance;
      distance = raycaster.intersectObject(rayTarget, false)[0]?.distance ?? centerDistance;
    }

    const fadeAmount = THREE.MathUtils.clamp(
      (fadeStartDistance - distance) / (fadeStartDistance - fadeEndDistance),
      0,
      1
    );
    setOpacity(THREE.MathUtils.lerp(1, nearOpacity, fadeAmount));
  };
}
