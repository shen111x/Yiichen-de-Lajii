export function characterColliderForObject(THREE, object) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object, true);
  if (bounds.isEmpty()) return null;

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());

  return {
    collisionRule: "character",
    centerX: center.x,
    centerY: center.y,
    centerZ: center.z,
    width: size.x,
    height: size.y,
    depth: size.z,
    minX: bounds.min.x,
    maxX: bounds.max.x,
    minZ: bounds.min.z,
    maxZ: bounds.max.z,
    bottom: bounds.min.y,
    top: bounds.max.y,
    solid: true
  };
}
