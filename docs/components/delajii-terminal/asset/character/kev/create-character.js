import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { STANDARD_CHARACTER_HEIGHT } from "../../../core/character/player-body.js?v=character-height-1";

// Kev owns its proximity animation behavior so it also works when the asset is
// placed somewhere else on the map.
export const KEV_ACTION_DISTANCE = 12;
export const KEV_SIZE_HANDLE = Object.freeze({ height: STANDARD_CHARACTER_HEIGHT });

export async function createKev(
  THREE,
  { sizeHandle = KEV_SIZE_HANDLE } = {}
) {
  const gltf = await new GLTFLoader().loadAsync(
    new URL("./kev.glb", import.meta.url).href
  );
  const object = gltf.scene;
  const clip = gltf.animations[0];

  if (!clip) throw new Error("Kev model does not contain an animation");

  const bounds = new THREE.Box3().setFromObject(object, true);
  const sourceHeight = bounds.getSize(new THREE.Vector3()).y;
  const targetHeight = Number(sizeHandle.height);
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) {
    throw new Error("Kev model has no measurable height");
  }
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
    throw new Error("Kev sizeHandle.height must be greater than zero");
  }

  object.scale.multiplyScalar(targetHeight / sourceHeight);
  object.updateMatrixWorld(true);
  bounds.setFromObject(object, true);
  object.position.y -= bounds.min.y;

  const mixer = new THREE.AnimationMixer(object);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  action.paused = true;
  action.time = 0;
  mixer.update(0);

  const worldPosition = new THREE.Vector3();
  const triggerDistanceSquared = KEV_ACTION_DISTANCE ** 2;
  let playerIsNear = false;

  object.userData.update = (dt, playerPosition) => {
    object.getWorldPosition(worldPosition);
    const isNear = worldPosition.distanceToSquared(playerPosition) <= triggerDistanceSquared;

    if (isNear !== playerIsNear) {
      playerIsNear = isNear;
      action.enabled = true;
      action.paused = false;
      action.timeScale = isNear ? 1 : -1;
      action.play();
    }

    mixer.update(dt);
  };

  return object;
}
