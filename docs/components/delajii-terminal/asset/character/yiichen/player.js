import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  createWalkAnimationController,
  createWholeObjectOpacityController,
  fitCharacterVisual,
  useBasicCharacterMaterials
} from "../../../core/character/animated-character.js?v=glb-player-2";
import {
  createPlayerBodyRayTarget,
  PLAYER_BODY_BOX
} from "../../../core/character/player-body.js?v=character-height-1";
import { createCharacterProximityFade } from "../../../core/camera/character-proximity-fade.js";

const WALK_CLIP_NAME = "walk-final";
const WALK_TIME_SCALE = 1.5;
const SPRINT_TIME_SCALE = 4;

function selectWalkClip(animations) {
  return animations.find(clip => clip.name === WALK_CLIP_NAME)
    || animations.find(clip => /walk/i.test(clip.name))
    || animations[0];
}

export async function createYiichenPlayer(THREE) {
  const gltf = await new GLTFLoader().loadAsync(
    new URL("./yiichen.glb", import.meta.url).href
  );
  const object = new THREE.Group();
  const visual = gltf.scene;
  useBasicCharacterMaterials(THREE, visual);
  fitCharacterVisual(THREE, visual, PLAYER_BODY_BOX.height);
  object.add(visual);

  const bodyRayTarget = createPlayerBodyRayTarget(THREE);
  object.add(bodyRayTarget);
  const walk = createWalkAnimationController(
    THREE,
    visual,
    selectWalkClip(gltf.animations),
    {
      walkTimeScale: WALK_TIME_SCALE,
      sprintTimeScale: SPRINT_TIME_SCALE
    }
  );
  const updateCameraProximity = createCharacterProximityFade(
    THREE,
    bodyRayTarget,
    createWholeObjectOpacityController(visual)
  );

  return {
    object,
    update: (dt, moving, sprinting) => walk.update(dt, moving, sprinting),
    updateCameraProximity
  };
}

export async function createYiichenCharacter(THREE) {
  return (await createYiichenPlayer(THREE)).object;
}
