export function boundaryColliderForObject(THREE, object, id) {
  object.updateMatrixWorld(true);
  const segments = [];

  object.traverse(node => {
    const boundary = node.userData.collisionBoundary;
    if (!Array.isArray(boundary)) return;

    boundary.forEach(segment => {
      const startBottom = new THREE.Vector3(segment.startX, segment.bottom, segment.startZ)
        .applyMatrix4(node.matrixWorld);
      const startTop = new THREE.Vector3(segment.startX, segment.top, segment.startZ)
        .applyMatrix4(node.matrixWorld);
      const endBottom = new THREE.Vector3(segment.endX, segment.bottom, segment.endZ)
        .applyMatrix4(node.matrixWorld);
      const endTop = new THREE.Vector3(segment.endX, segment.top, segment.endZ)
        .applyMatrix4(node.matrixWorld);
      segments.push({
        startX: startBottom.x,
        startZ: startBottom.z,
        endX: endBottom.x,
        endZ: endBottom.z,
        bottom: Math.min(startBottom.y, endBottom.y),
        top: Math.max(startTop.y, endTop.y)
      });
    });
  });

  if (!segments.length) return null;
  return {
    minX: Math.min(...segments.flatMap(segment => [segment.startX, segment.endX])),
    maxX: Math.max(...segments.flatMap(segment => [segment.startX, segment.endX])),
    minZ: Math.min(...segments.flatMap(segment => [segment.startZ, segment.endZ])),
    maxZ: Math.max(...segments.flatMap(segment => [segment.startZ, segment.endZ])),
    top: Math.max(...segments.map(segment => segment.top)),
    segments,
    adminObjectId: id
  };
}

export function boxColliderForObject(THREE, object, id) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  return {
    minX: bounds.min.x,
    maxX: bounds.max.x,
    minZ: bounds.min.z,
    maxZ: bounds.max.z,
    top: bounds.max.y,
    adminObjectId: id
  };
}

export function colliderForObject(THREE, object, id) {
  return boundaryColliderForObject(THREE, object, id)
    || boxColliderForObject(THREE, object, id);
}
