const ATLAS_WIDTH = 1185;
const ATLAS_HEIGHT = 1327;

const REGIONS = {
  head: {
    front: [426, 233, 173, 167], back: [770, 233, 171, 167],
    left: [248, 233, 176, 167], right: [600, 233, 168, 167], top: [427, 51, 171, 163]
  },
  torso: {
    front: [428, 593, 168, 188], back: [754, 593, 157, 188],
    left: [274, 593, 151, 188], right: [598, 593, 154, 188], top: [429, 468, 166, 123]
  },
  leftArm: { front: [31, 593, 80, 188], back: [113, 593, 96, 188], top: [65, 461, 108, 116] },
  rightArm: { front: [982, 593, 85, 188], back: [1069, 593, 86, 188], top: [1013, 463, 107, 115] },
  leftLeg: { front: [300, 1031, 118, 147], back: [440, 1031, 117, 147], top: [300, 966, 118, 51] },
  rightLeg: { front: [596, 1031, 118, 147], back: [741, 1031, 116, 147], top: [596, 966, 118, 51] }
};

export async function createCharacter(THREE, loader) {
  const atlas = await loader.loadAsync(new URL("./skin.png", import.meta.url).href);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = atlas.minFilter = THREE.NearestFilter;

  function material([x, y, width, height]) {
    const map = atlas.clone();
    map.repeat.set(width / ATLAS_WIDTH, height / ATLAS_HEIGHT);
    map.offset.set(x / ATLAS_WIDTH, 1 - (y + height) / ATLAS_HEIGHT);
    return new THREE.MeshBasicMaterial({ map });
  }

  function sides(part) {
    const front = material(part.front);
    const back = material(part.back || part.front);
    const top = material(part.top || part.front);
    return [front, front, top, top, front, back];
  }

  const object = new THREE.Group();
  const outline = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });

  function box(size, position, materials) {
    const geometry = new THREE.BoxGeometry(...size);
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.position.set(...position);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), outline));
    object.add(mesh);
    return mesh;
  }

  function limb(size, topPosition, materials) {
    const pivot = new THREE.Group();
    const geometry = new THREE.BoxGeometry(...size);
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.position.y = -size[1] / 2;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), outline));
    pivot.position.set(...topPosition);
    pivot.add(mesh);
    object.add(pivot);
    return pivot;
  }

  const head = box([0.8, 0.8, 0.8], [0, 2.8, 0], [
    material(REGIONS.head.right), material(REGIONS.head.left), material(REGIONS.head.top), material(REGIONS.head.top),
    material(REGIONS.head.front), material(REGIONS.head.back)
  ]);
  box([0.9, 1.2, 0.45], [0, 1.8, 0], [
    material(REGIONS.torso.right), material(REGIONS.torso.left), material(REGIONS.torso.top), material(REGIONS.torso.top),
    material(REGIONS.torso.front), material(REGIONS.torso.back)
  ]);
  const leftArm = limb([0.3, 1.2, 0.4], [-0.65, 2.4, 0], sides(REGIONS.leftArm));
  const rightArm = limb([0.3, 1.2, 0.4], [0.65, 2.4, 0], sides(REGIONS.rightArm));
  const leftLeg = limb([0.38, 1.2, 0.42], [-0.22, 1.2, 0], sides(REGIONS.leftLeg));
  const rightLeg = limb([0.38, 1.2, 0.42], [0.22, 1.2, 0], sides(REGIONS.rightLeg));

  return {
    object,
    update(now, moving, sprinting) {
      const step = moving ? Math.sin(now * (sprinting ? 0.021 : 0.012)) * (sprinting ? 0.9 : 0.6) : 0;
      leftArm.rotation.x = step;
      rightArm.rotation.x = -step;
      leftLeg.rotation.x = -step;
      rightLeg.rotation.x = step;
      head.rotation.y = Math.sin(now * 0.001) * 0.08;
    }
  };
}
