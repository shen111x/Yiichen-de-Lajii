export const STANDARD_CHARACTER_HEIGHT = 5.5;

export const PLAYER_BODY_BOX = Object.freeze({
  width: 0.84,
  height: STANDARD_CHARACTER_HEIGHT,
  depth: 0.84
});

export function createPlayerBodyRayTarget(THREE, body = PLAYER_BODY_BOX) {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  material.colorWrite = false;
  material.depthWrite = false;
  const target = new THREE.Mesh(
    new THREE.BoxGeometry(body.width, body.height, body.depth),
    material
  );
  target.name = "player-body-ray-target";
  target.position.y = body.height / 2;
  target.visible = false;
  target.userData.fixedPlayerBody = body;
  return target;
}
