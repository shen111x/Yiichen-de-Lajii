const MIN_CHARACTER_RADIUS = 0.35;
const CHARACTER_RADIUS_SCALE = 0.35;

export function characterColliderForObject(THREE, object) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object, true);
  if (bounds.isEmpty()) return null;

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(
    MIN_CHARACTER_RADIUS,
    Math.min(size.x, size.z) * CHARACTER_RADIUS_SCALE
  );

  return {
    collisionRule: "character",
    centerX: center.x,
    centerZ: center.z,
    radius,
    minX: center.x - radius,
    maxX: center.x + radius,
    minZ: center.z - radius,
    maxZ: center.z + radius,
    bottom: bounds.min.y,
    top: bounds.max.y,
    solid: true
  };
}
