import {
  loadMark,
  loadMeasure
} from "../../../../core/performance/load-performance.js?v=load-timing-1";

const SCREEN_SAFE_PADDING = Object.freeze({
  left: 13 / 256,
  right: 13 / 256,
  top: 19 / 256,
  bottom: 19 / 256
});
const SCREEN_BACKGROUND_DIM_AMOUNT = 0.9;
let tvVideoInstance = 0;

export function attachTvVideo(THREE, television) {
  tvVideoInstance += 1;
  const timingName = `delajii:tv-video:${tvVideoInstance}`;
  loadMark(`${timingName}:setup:start`);
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
  loadMark(`${timingName}:source-assigned`, { url: new URL(video.src).pathname });

  const measuredEvents = new Set();
  const recordVideoEvent = eventName => {
    loadMark(`${timingName}:${eventName}`, {
      readyState: video.readyState,
      networkState: video.networkState,
      duration: Number.isFinite(video.duration) ? video.duration : null,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight
    });
    if (!measuredEvents.has(eventName)) {
      measuredEvents.add(eventName);
      loadMeasure(
        `${timingName}:time-to-${eventName}`,
        `${timingName}:setup:start`,
        `${timingName}:${eventName}`
      );
    }
  };
  ["loadstart", "loadedmetadata", "loadeddata", "canplay", "playing"].forEach(eventName => {
    video.addEventListener(eventName, () => recordVideoEvent(eventName));
  });
  video.addEventListener("error", () => {
    loadMark(`${timingName}:error`, {
      code: video.error?.code ?? null,
      message: video.error?.message ?? "Unknown media error"
    });
  });

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

  const screenBackground = screens[0].material?.map?.image || null;
  screens[0].geometry.computeBoundingBox();
  screens[0].updateWorldMatrix(true, false);
  const screenSize = screens[0].geometry.boundingBox.getSize(new THREE.Vector3());
  const screenScale = screens[0].getWorldScale(new THREE.Vector3());
  const screenDimensions = [
    screenSize.x * Math.abs(screenScale.x),
    screenSize.y * Math.abs(screenScale.y),
    screenSize.z * Math.abs(screenScale.z)
  ].sort((a, b) => b - a);
  const screenAspect = screenDimensions[0] / screenDimensions[1];
  if (!Number.isFinite(screenAspect) || screenAspect <= 0) {
    throw new Error("Lounge TV screen has no measurable aspect ratio");
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.max(1, Math.round(canvas.width / screenAspect));
  const context = canvas.getContext("2d");
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const safeX = canvas.width * SCREEN_SAFE_PADDING.left;
  const safeY = canvas.height * SCREEN_SAFE_PADDING.top;
  const safeWidth = canvas.width * (1 - SCREEN_SAFE_PADDING.left - SCREEN_SAFE_PADDING.right);
  const safeHeight = canvas.height * (1 - SCREEN_SAFE_PADDING.top - SCREEN_SAFE_PADDING.bottom);

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
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (screenBackground) {
      context.drawImage(screenBackground, 0, 0, canvas.width, canvas.height);
      context.fillStyle = `rgba(0, 0, 0, ${SCREEN_BACKGROUND_DIM_AMOUNT})`;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const scale = Math.max(safeWidth / video.videoWidth, safeHeight / video.videoHeight);
      const width = video.videoWidth * scale;
      const height = video.videoHeight * scale;
      const x = safeX + (safeWidth - width) / 2;
      const y = safeY + (safeHeight - height) / 2;
      context.save();
      context.beginPath();
      context.rect(safeX, safeY, safeWidth, safeHeight);
      context.clip();
      context.drawImage(video, x, y, width, height);
      context.restore();
    }
    texture.needsUpdate = true;
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
  loadMark(`${timingName}:setup:end`);
  loadMeasure(
    `${timingName}:setup`,
    `${timingName}:setup:start`,
    `${timingName}:setup:end`
  );

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
