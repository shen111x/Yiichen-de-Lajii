import { attachSurfaceSupport } from "./surface-support.js";

export function environmentColliderForObject(THREE, object) {
  object.updateMatrixWorld(true);
  const segments = [];
  let solid = false;
  let blocksWhileSupported = false;

  object.traverse(node => {
    const definition = node.userData.environmentCollision;
    if (!definition || !Array.isArray(definition.boundary)) return;
    if (definition.solid) solid = true;
    if (definition.blocksWhileSupported) blocksWhileSupported = true;

    definition.boundary.forEach(segment => {
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
  return attachSurfaceSupport(THREE, {
    collisionRule: "environment",
    minX: Math.min(...segments.flatMap(segment => [segment.startX, segment.endX])),
    maxX: Math.max(...segments.flatMap(segment => [segment.startX, segment.endX])),
    minZ: Math.min(...segments.flatMap(segment => [segment.startZ, segment.endZ])),
    maxZ: Math.max(...segments.flatMap(segment => [segment.startZ, segment.endZ])),
    bottom: Math.min(...segments.map(segment => segment.bottom)),
    top: Math.max(...segments.map(segment => segment.top)),
    segments,
    solid,
    blocksWhileSupported
  }, object);
}
