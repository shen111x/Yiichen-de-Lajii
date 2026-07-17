import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/loaders/GLTFLoader.js/+esm";

// Public size handle for this asset. Change height, or pass an override to
// createLounge(), to resize the model uniformly in world units.
export const LOUNGE_SIZE_HANDLE = Object.freeze({ height: 8 });
export const LOUNGE_FLOOR_OFFSET = 0.01;

function createWallBoundary(THREE, object, targetHeight) {
  object.updateMatrixWorld(true);
  const boundary = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const normal = new THREE.Vector3();

  object.traverse(child => {
    if (!child.isMesh) return;
    const position = child.geometry.getAttribute("position");
    const index = child.geometry.getIndex();
    const triangleCount = (index ? index.count : position.count) / 3;

    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const offset = triangle * 3;
      const ia = index ? index.getX(offset) : offset;
      const ib = index ? index.getX(offset + 1) : offset + 1;
      const ic = index ? index.getX(offset + 2) : offset + 2;
      a.fromBufferAttribute(position, ia).applyMatrix4(child.matrixWorld);
      b.fromBufferAttribute(position, ib).applyMatrix4(child.matrixWorld);
      c.fromBufferAttribute(position, ic).applyMatrix4(child.matrixWorld);

      edgeA.subVectors(b, a);
      edgeB.subVectors(c, a);
      normal.crossVectors(edgeA, edgeB).normalize();
      const bottom = Math.min(a.y, b.y, c.y);
      const top = Math.max(a.y, b.y, c.y);
      if (top - bottom < targetHeight * 0.2 || Math.abs(normal.y) > 0.25) continue;

      const points = [a, b, c];
      let start = a;
      let end = b;
      let longest = -1;
      for (let first = 0; first < points.length; first += 1) {
        for (let second = first + 1; second < points.length; second += 1) {
          const distance = (points[first].x - points[second].x) ** 2
            + (points[first].z - points[second].z) ** 2;
          if (distance > longest) {
            longest = distance;
            start = points[first];
            end = points[second];
          }
        }
      }
      if (longest < 0.01) continue;
      boundary.push({
        startX: start.x,
        startZ: start.z,
        endX: end.x,
        endZ: end.z,
        bottom,
        top
      });
    }
  });
  return boundary;
}

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

export async function createLounge(
  THREE,
  { sizeHandle = LOUNGE_SIZE_HANDLE } = {}
) {
  const gltf = await new GLTFLoader().loadAsync(
    new URL("./ydl-lounge.glb", import.meta.url).href
  );
  const object = gltf.scene;
  useUnlitMaterials(THREE, object);

  const bounds = new THREE.Box3().setFromObject(object);
  const sourceHeight = bounds.getSize(new THREE.Vector3()).y;
  const targetHeight = Number(sizeHandle.height);
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) {
    throw new Error("Lounge model has no measurable height");
  }
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
    throw new Error("Lounge sizeHandle.height must be greater than zero");
  }

  object.scale.multiplyScalar(targetHeight / sourceHeight);
  object.updateMatrixWorld(true);

  bounds.setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.y += LOUNGE_FLOOR_OFFSET - bounds.min.y;
  object.position.z -= center.z;
  object.updateMatrixWorld(true);

  const result = new THREE.Group();
  result.userData.environmentCollision = {
    boundary: createWallBoundary(THREE, object, targetHeight),
    // The room floor and walls share one model. Standing on its floor must not
    // disable the wall boundary that surrounds it.
    blocksWhileSupported: true
  };
  result.add(object);
  return result;
}
