export const GEOMETRY_EPSILON = 1e-6;

export function attachSurfaceSupport(THREE, collider, object) {
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3(0, -1, 0);
  const surfaceHeightAt = (x, z, minY = -Infinity, maxY = Infinity) => {
    if (x < collider.minX - GEOMETRY_EPSILON || x > collider.maxX + GEOMETRY_EPSILON
      || z < collider.minZ - GEOMETRY_EPSILON || z > collider.maxZ + GEOMETRY_EPSILON) {
      return null;
    }
    const rayOriginY = Number.isFinite(maxY)
      ? maxY + GEOMETRY_EPSILON
      : collider.top + 1;
    origin.set(x, rayOriginY, z);
    raycaster.set(origin, direction);
    const intersection = raycaster.intersectObject(object, true).find(hit =>
      hit.object.isMesh
      && hit.point.y >= minY - GEOMETRY_EPSILON
      && hit.point.y <= maxY + GEOMETRY_EPSILON
    );
    return intersection ? intersection.point.y : null;
  };
  Object.defineProperty(collider, "supportHeightAt", {
    value: surfaceHeightAt,
    enumerable: false
  });
  return collider;
}
