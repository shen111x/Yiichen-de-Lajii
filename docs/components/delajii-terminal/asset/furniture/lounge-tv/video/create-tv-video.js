export function attachTvVideo(THREE, television) {
  const video = document.createElement("video");
  video.muted = true;
  video.defaultMuted = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = "auto";
  video.disablePictureInPicture = true;
  video.tabIndex = -1;
  video.setAttribute("aria-hidden", "true");
  Object.assign(video.style, {
    position: "fixed",
    left: "0",
    bottom: "0",
    width: "1px",
    height: "1px",
    opacity: "0.001",
    zIndex: "-1",
    pointerEvents: "none"
  });
  document.body.append(video);
  video.src = new URL("./lounge-tv.mp4", import.meta.url).href;

  const screens = [];
  television.traverse(child => {
    if (!child.isMesh) return;
    if (/screen_off/i.test(child.name)) {
      child.visible = false;
      return;
    }
    if (!/screen_reference/i.test(child.name)) return;

    child.geometry = child.geometry.clone();
    const sourceUv = child.geometry.getAttribute("uv");
    if (!sourceUv) throw new Error("Lounge TV screen has no UV coordinates");
    const uv = sourceUv.clone();
    let minU = Infinity;
    let minV = Infinity;
    let maxU = -Infinity;
    let maxV = -Infinity;
    for (let index = 0; index < uv.count; index += 1) {
      minU = Math.min(minU, uv.getX(index));
      minV = Math.min(minV, uv.getY(index));
      maxU = Math.max(maxU, uv.getX(index));
      maxV = Math.max(maxV, uv.getY(index));
    }
    const width = maxU - minU;
    const height = maxV - minV;
    for (let index = 0; index < uv.count; index += 1) {
      uv.setXY(index, (uv.getX(index) - minU) / width, (uv.getY(index) - minV) / height);
    }
    child.geometry.setAttribute("uv", uv);
    screens.push(child);
  });

  if (!screens.length) throw new Error("Lounge TV screen mesh was not found");

  screens[0].geometry.computeBoundingBox();
  const screenSize = screens[0].geometry.boundingBox.getSize(new THREE.Vector3());
  const screenDimensions = [screenSize.x, screenSize.y, screenSize.z].sort((a, b) => b - a);
  const screenAspect = screenDimensions[0] / screenDimensions[1];
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.max(1, Math.round(canvas.width / screenAspect));
  const context = canvas.getContext("2d");
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const screenMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    toneMapped: false
  });
  screens.forEach(child => {
    child.material = screenMaterial;
  });

  let animationFrame = 0;
  function drawVideo() {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      const width = video.videoWidth * scale;
      const height = video.videoHeight * scale;
      const x = (canvas.width - width) / 2;
      const y = (canvas.height - height) / 2;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, x, y, width, height);
      texture.needsUpdate = true;
    }
    animationFrame = requestAnimationFrame(drawVideo);
  }

  const startPlayback = () => {
    video.muted = true;
    return video.play().catch(() => {});
  };
  const resumeWhenReady = () => startPlayback();
  drawVideo();
  video.addEventListener("loadeddata", resumeWhenReady);
  video.addEventListener("canplay", resumeWhenReady);
  video.load();
  startPlayback();
  addEventListener("pointerdown", startPlayback, { once: true });

  television.userData.disposeMedia = () => {
    removeEventListener("pointerdown", startPlayback);
    video.removeEventListener("loadeddata", resumeWhenReady);
    video.removeEventListener("canplay", resumeWhenReady);
    cancelAnimationFrame(animationFrame);
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    texture.dispose();
    screenMaterial.dispose();
  };

  return { video, texture, screens };
}
