export function fitCharacterVisual(THREE, visual, targetHeight) {
  visual.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(visual, true);
  const sourceHeight = bounds.getSize(new THREE.Vector3()).y;
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) {
    throw new Error("Character model has no measurable height");
  }

  visual.scale.multiplyScalar(targetHeight / sourceHeight);
  visual.updateMatrixWorld(true);
  bounds.setFromObject(visual, true);
  const center = bounds.getCenter(new THREE.Vector3());
  visual.position.x -= center.x;
  visual.position.y -= bounds.min.y;
  visual.position.z -= center.z;
  visual.updateMatrixWorld(true);
}

export function useBasicCharacterMaterials(THREE, object) {
  const replacements = new Map();

  function basicMaterialFor(material) {
    if (replacements.has(material)) return replacements.get(material);
    const basic = new THREE.MeshBasicMaterial({
      alphaMap: material.alphaMap || null,
      alphaTest: material.alphaTest,
      color: material.color?.clone() || new THREE.Color(0xffffff),
      depthTest: material.depthTest,
      depthWrite: material.depthWrite,
      map: material.map || null,
      opacity: material.opacity,
      side: material.side,
      transparent: material.transparent,
      vertexColors: material.vertexColors,
      visible: material.visible
    });
    basic.name = material.name;
    basic.toneMapped = material.toneMapped;
    replacements.set(material, basic);
    return basic;
  }

  object.traverse(node => {
    if (!node.isMesh || !node.material) return;
    node.material = Array.isArray(node.material)
      ? node.material.map(basicMaterialFor)
      : basicMaterialFor(node.material);
  });
  replacements.forEach((replacement, original) => original.dispose());
}

export function createWalkAnimationController(
  THREE,
  visual,
  clip,
  { walkTimeScale = 1, sprintTimeScale = 2 } = {}
) {
  if (!clip) throw new Error("Character model does not contain a walk animation");

  const mixer = new THREE.AnimationMixer(visual);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.enabled = true;
  action.clampWhenFinished = false;
  let walking = false;

  return {
    update(dt, moving, sprinting) {
      if (!moving) {
        if (walking) {
          walking = false;
          action.stop();
          mixer.update(0);
        }
        return;
      }

      action.timeScale = sprinting ? sprintTimeScale : walkTimeScale;
      if (!walking) {
        walking = true;
        action.reset().play();
      }
      mixer.update(dt);
    }
  };
}

export function createWholeObjectOpacityController(object) {
  const materials = new Map();
  object.traverse(node => {
    if (!node.isMesh) return;
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    nodeMaterials.filter(Boolean).forEach(material => {
      if (materials.has(material)) return;
      materials.set(material, {
        opacity: material.opacity,
        transparent: material.transparent,
        depthWrite: material.depthWrite
      });
    });
  });

  let currentOpacity = 1;
  return opacity => {
    if (Math.abs(opacity - currentOpacity) < 0.001) return;
    currentOpacity = opacity;
    const faded = opacity < 0.999;
    materials.forEach((original, material) => {
      const nextTransparent = faded || original.transparent;
      const nextDepthWrite = faded ? false : original.depthWrite;
      const pipelineChanged = material.transparent !== nextTransparent
        || material.depthWrite !== nextDepthWrite;
      material.opacity = original.opacity * opacity;
      material.transparent = nextTransparent;
      material.depthWrite = nextDepthWrite;
      if (pipelineChanged) material.needsUpdate = true;
    });
  };
}
