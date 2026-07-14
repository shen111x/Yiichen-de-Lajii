export function createGround(THREE, loader, size = 500) {
  const map = loader.load(new URL("./blank.png", import.meta.url).href);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(size / 4.17, size / 4.17);
  map.colorSpace = THREE.SRGBColorSpace;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map })
  );
  ground.rotation.x = -Math.PI / 2;
  return ground;
}

export function createBoundaryWalls(THREE, size = 500) {
  const object = new THREE.Group();
  const fill = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const line = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
  const thickness = 1;
  const height = 4;
  const half = size / 2;

  function wall(width, depth, x, z) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geometry, fill);
    mesh.position.set(x, height / 2, z);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), line));
    object.add(mesh);
  }

  wall(size, thickness, 0, -half);
  wall(size, thickness, 0, half);
  wall(thickness, size, -half, 0);
  wall(thickness, size, half, 0);

  return {
    object,
    colliders: [
      { minX: -half, maxX: half, minZ: -half - thickness / 2, maxZ: -half + thickness / 2, top: height },
      { minX: -half, maxX: half, minZ: half - thickness / 2, maxZ: half + thickness / 2, top: height },
      { minX: -half - thickness / 2, maxX: -half + thickness / 2, minZ: -half, maxZ: half, top: height },
      { minX: half - thickness / 2, maxX: half + thickness / 2, minZ: -half, maxZ: half, top: height }
    ]
  };
}
