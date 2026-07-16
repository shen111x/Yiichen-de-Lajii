import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/loaders/GLTFLoader.js/+esm";

const WORLD_WIDTH = 1.65;

function useUnlitMaterials(THREE, object) {
  object.traverse(child => {
    if (!child.isMesh) return;
    const convert = material => new THREE.MeshBasicMaterial({
      map: material.map || null,
      color: material.color?.clone() || new THREE.Color(0xffffff),
      opacity: material.opacity,
      transparent: material.transparent,
      alphaTest: material.alphaTest,
      side: material.side,
      depthWrite: material.depthWrite
    });
    child.material = Array.isArray(child.material)
      ? child.material.map(convert)
      : convert(child.material);
  });
}

export async function createRamen(THREE) {
  const gltf = await new GLTFLoader().loadAsync(
    new URL("./bowl_of_ramen-2.glb", import.meta.url).href
  );
  const object = gltf.scene;
  useUnlitMaterials(THREE, object);
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const sourceWidth = Math.max(size.x, size.z);
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0) throw new Error("Ramen model has no measurable size");
  const scale = WORLD_WIDTH / sourceWidth;
  object.scale.multiplyScalar(scale);
  object.updateMatrixWorld(true);

  bounds.setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.y -= bounds.min.y;
  object.position.z -= center.z;
  return object;
}
