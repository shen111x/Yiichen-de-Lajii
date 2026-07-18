import { afterFirstFrame } from "../media/deferred-media.js?v=deferred-tv-3";

export function createMinimap(THREE, canvas, worldSize, renderer, scene, player) {
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;

  const resolution = 64;
  const worldPixels = document.createElement("canvas");
  worldPixels.width = worldPixels.height = resolution;
  const worldContext = worldPixels.getContext("2d");
  const pixels = new Uint8Array(resolution * resolution * 4);
  const target = new THREE.WebGLRenderTarget(resolution, resolution, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true
  });
  const viewSize = 100;
  const viewHalf = viewSize / 2;
  const mapCamera = new THREE.OrthographicCamera(-viewHalf, viewHalf, viewHalf, -viewHalf, 0.1, worldSize * 2);
  mapCamera.position.set(0, worldSize, 0);
  mapCamera.up.set(0, 0, -1);
  mapCamera.lookAt(0, 0, 0);
  mapCamera.updateProjectionMatrix();
  let nextCapture = 0;
  let captureEnabled = false;
  afterFirstFrame(() => {
    captureEnabled = true;
    nextCapture = 0;
  });

  function captureWorld(position) {
    const previousTarget = renderer.getRenderTarget();
    const playerWasVisible = player.visible;
    player.visible = false;
    mapCamera.position.set(position.x, worldSize, position.z);
    mapCamera.lookAt(position.x, 0, position.z);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, mapCamera);
    renderer.readRenderTargetPixels(target, 0, 0, resolution, resolution, pixels);
    renderer.setRenderTarget(previousTarget);
    player.visible = playerWasVisible;

    const image = worldContext.createImageData(resolution, resolution);
    for (let y = 0; y < resolution; y += 1) {
      const source = (resolution - y - 1) * resolution * 4;
      image.data.set(pixels.subarray(source, source + resolution * 4), y * resolution * 4);
    }
    worldContext.putImageData(image, 0, 0);
  }

  return {
    update(position, yaw, now) {
      if (captureEnabled && now >= nextCapture) {
        captureWorld(position);
        nextCapture = now + 100;
      }

      const size = canvas.width;

      context.fillStyle = "white";
      context.fillRect(0, 0, size, size);
      context.drawImage(worldPixels, 0, 0, size, size);
      context.save();
      context.translate(size / 2, size / 2);
      context.rotate(-yaw);
      context.fillStyle = "black";
      context.fillRect(-2, -3, 4, 6);
      context.restore();
    }
  };
}
