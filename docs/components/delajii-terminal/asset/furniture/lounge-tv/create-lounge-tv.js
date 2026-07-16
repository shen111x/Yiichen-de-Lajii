import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/loaders/GLTFLoader.js/+esm";
import { attachTvVideo } from "./video/create-tv-video.js?v=dim-screen-frame";

const WORLD_HEIGHT = 1.8;

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

export async function createLoungeTv(THREE) {
  const gltf = await new GLTFLoader().loadAsync(new URL("./lounge-tv-v2.glb", import.meta.url).href);
  const object = gltf.scene;
  object.traverse(child => {
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    if (materials.some(material => material?.name === "Screen.001")) child.name = "screen_reference";
  });
  useUnlitMaterials(THREE, object);
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) throw new Error("Lounge TV model has no measurable size");
  object.scale.multiplyScalar(WORLD_HEIGHT / size.y);
  object.updateMatrixWorld(true);

  bounds.setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.y -= bounds.min.y;
  object.position.z -= center.z;
  attachTvVideo(THREE, object);
  return object;
}
