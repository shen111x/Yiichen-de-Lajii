export function createWall(THREE, definition) {
  const { width, height, depth } = definition.size;
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  mesh.position.set(
    definition.position.x,
    definition.position.y,
    definition.position.z
  );
  mesh.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 })
  ));
  return mesh;
}
