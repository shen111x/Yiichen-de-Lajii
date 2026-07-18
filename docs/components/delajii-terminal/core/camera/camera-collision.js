export const CAMERA_COLLISION_LAYER = 31;

export function setCameraCollisionEnabled(object, enabled) {
  function visit(node, ignoredByParent = false) {
    const ignored = ignoredByParent || node.userData.cameraCollisionIgnored === true;
    if (enabled && !ignored) node.layers.enable(CAMERA_COLLISION_LAYER);
    else node.layers.disable(CAMERA_COLLISION_LAYER);
    node.children.forEach(child => visit(child, ignored));
  }

  visit(object);
}

export function ignoreCameraCollision(object) {
  object.userData.cameraCollisionIgnored = true;
  setCameraCollisionEnabled(object, false);
}
