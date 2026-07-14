export function createFurniture(THREE, placements = [{ x: 5, z: 0, rotation: 0 }]) {
  const object = new THREE.Group();
  const tableMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.8
  });
  const black = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });

  function box(size, position, rotation = 0) {
    const geometry = new THREE.BoxGeometry(...size);
    const mesh = new THREE.Mesh(geometry, tableMaterial);
    mesh.position.set(...position);
    mesh.rotation.y = rotation;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), black));
    object.add(mesh);
  }

  function table(x, z, rotation = 0) {
    box([3.2, 0.18, 1.6], [x, 1.45, z], rotation);
    [[-1.35, -0.65], [1.35, -0.65], [-1.35, 0.65], [1.35, 0.65]].forEach(([dx, dz]) =>
      box([0.12, 1.4, 0.12], [x + dx, 0.7, z + dz], rotation)
    );
  }

  placements.forEach(point => table(point.x, point.z, point.rotation || 0));

  const collider = (x, z, width, depth, top) => ({
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
    top
  });

  return {
    object,
    colliders: placements.map(point => collider(point.x, point.z, 3.2, 1.6, 1.54))
  };
}
