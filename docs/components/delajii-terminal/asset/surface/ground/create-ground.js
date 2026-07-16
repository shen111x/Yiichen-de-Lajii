export function createGround(THREE, loader, definition) {
  const map = loader.load(new URL("./blank.png", import.meta.url).href);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(definition.textureRepeat.x, definition.textureRepeat.y);
  map.colorSpace = THREE.SRGBColorSpace;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(definition.width, definition.depth),
    new THREE.MeshBasicMaterial({ map })
  );
  ground.rotation.x = -Math.PI / 2;
  return ground;
}
