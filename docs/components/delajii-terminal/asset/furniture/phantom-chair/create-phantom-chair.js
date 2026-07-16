import { MTLLoader } from "https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/loaders/MTLLoader.js/+esm";
import { OBJLoader } from "https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/loaders/OBJLoader.js/+esm";

export const PHANTOM_CHAIR_SIZE_HANDLE = Object.freeze({ height: 3.1 });

export async function createPhantomChair(
  THREE,
  { sizeHandle = PHANTOM_CHAIR_SIZE_HANDLE } = {}
) {
  const materials = await new MTLLoader().loadAsync(
    new URL("./phantom-chair.mtl", import.meta.url).href
  );
  materials.preload();

  const object = await new OBJLoader()
    .setMaterials(materials)
    .loadAsync(new URL("./phantom-chair.obj", import.meta.url).href);
  const bounds = new THREE.Box3().setFromObject(object);
  const sourceHeight = bounds.getSize(new THREE.Vector3()).y;
  const targetHeight = Number(sizeHandle.height);
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) {
    throw new Error("Phantom chair has no measurable height");
  }
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
    throw new Error("Phantom chair sizeHandle.height must be greater than zero");
  }

  object.scale.multiplyScalar(targetHeight / sourceHeight);
  object.updateMatrixWorld(true);

  bounds.setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.y -= bounds.min.y;
  object.position.z -= center.z;
  return object;
}
