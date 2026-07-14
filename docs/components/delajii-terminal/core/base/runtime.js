export function createRuntime(THREE, host) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 160);
  camera.position.set(18, 14, 30);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  host.appendChild(renderer.domElement);

  function resize() {
    const { clientWidth: width, clientHeight: height } = host;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  return { scene, camera, renderer, loader: new THREE.TextureLoader(), resize };
}
