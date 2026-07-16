export function createLighting(THREE, scene) {
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  ambient.name = "ambient-light";

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x666666, 1.2);
  hemisphere.name = "hemisphere-light";

  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.name = "key-light";
  key.position.set(10, 20, 10);

  scene.add(ambient, hemisphere, key);

  return { ambient, hemisphere, key };
}
