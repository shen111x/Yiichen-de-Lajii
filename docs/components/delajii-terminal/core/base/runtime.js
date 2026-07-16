const DEFAULT_CAMERA_FOV = 32;
const FISHEYE_START_WIDTH = 1000;
const FISHEYE_MAX_FOV = 37;
const FISHEYE_FULL_EFFECT_WIDTH = 320;

export function createRuntime(THREE, host) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  const camera = new THREE.PerspectiveCamera(DEFAULT_CAMERA_FOV, 1, 0.1, 160);
  camera.position.set(18, 14, 30);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  host.appendChild(renderer.domElement);

  function resize() {
    const { clientWidth: width, clientHeight: height } = host;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const fisheyeProgress = THREE.MathUtils.clamp(
      (FISHEYE_START_WIDTH - width)
        / (FISHEYE_START_WIDTH - FISHEYE_FULL_EFFECT_WIDTH),
      0,
      1
    );
    camera.fov = THREE.MathUtils.lerp(
      DEFAULT_CAMERA_FOV,
      FISHEYE_MAX_FOV,
      fisheyeProgress
    );
    camera.updateProjectionMatrix();
  }

  return { scene, camera, renderer, loader: new THREE.TextureLoader(), resize };
}
