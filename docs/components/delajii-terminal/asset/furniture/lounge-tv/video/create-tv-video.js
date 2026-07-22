import { afterFirstFrame } from "../../../../core/media/deferred-media.js?v=deferred-tv-3";

const SCREEN_SAFE_PADDING = Object.freeze({
  left: 13 / 256,
  right: 13 / 256,
  top: 19 / 256,
  bottom: 19 / 256
});

export async function attachTvVideo(
  THREE,
  television,
  { screenMeshName = "mesh_screen" } = {}
) {
  const screens = [];
  television.traverse(child => {
    if (!child.isMesh) return;
    if (/screen_off/i.test(child.name)) {
      child.visible = false;
      return;
    }
    if (child.name !== screenMeshName) return;

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

  if (!screens.length) {
    throw new Error(`Lounge TV screen mesh "${screenMeshName}" was not found`);
  }

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

  const coverTexture = await new THREE.TextureLoader().loadAsync(
    new URL("./lounge-tv-cover.webp?v=deferred-tv-canvas-1", import.meta.url).href
  );
  coverTexture.colorSpace = THREE.SRGBColorSpace;
  coverTexture.flipY = false;
  coverTexture.generateMipmaps = false;
  coverTexture.minFilter = THREE.LinearFilter;
  coverTexture.magFilter = THREE.LinearFilter;
  const coverMaterial = new THREE.MeshBasicMaterial({
    map: coverTexture,
    toneMapped: false
  });
  screens.forEach(child => {
    child.material = coverMaterial;
  });

  let video = null;
  let canvas = null;
  let context = null;
  let texture = null;
  let screenMaterial = null;
  let animationFrame = 0;
  let mediaStarted = false;
  let videoSurfaceReady = false;
  let safeX = 0;
  let safeY = 0;
  let safeWidth = 0;
  let safeHeight = 0;

  function createVideoElement() {
    video = document.createElement("video");
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
  }

  function createVideoSurface() {
    if (videoSurfaceReady) return;
    videoSurfaceReady = true;
    canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = Math.max(1, Math.round(canvas.width / screenAspect));
    context = canvas.getContext("2d");
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);

    safeX = canvas.width * SCREEN_SAFE_PADDING.left;
    safeY = canvas.height * SCREEN_SAFE_PADDING.top;
    safeWidth = canvas.width * (1 - SCREEN_SAFE_PADDING.left - SCREEN_SAFE_PADDING.right);
    safeHeight = canvas.height * (1 - SCREEN_SAFE_PADDING.top - SCREEN_SAFE_PADDING.bottom);

    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    screenMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      toneMapped: false
    });
    screens.forEach(child => {
      child.material = screenMaterial;
    });
  }

  function drawContainedMedia(source, sourceWidth, sourceHeight) {
    if (!sourceWidth || !sourceHeight) return;
    const scale = Math.max(safeWidth / sourceWidth, safeHeight / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    const x = safeX + (safeWidth - width) / 2;
    const y = safeY + (safeHeight - height) / 2;
    context.save();
    context.beginPath();
    context.rect(safeX, safeY, safeWidth, safeHeight);
    context.clip();
    context.drawImage(source, x, y, width, height);
    context.restore();
  }

  function drawVideo() {
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      drawContainedMedia(video, video.videoWidth, video.videoHeight);
    }
    texture.needsUpdate = true;
    animationFrame = requestAnimationFrame(drawVideo);
  }

  const startPlayback = () => {
    if (!video) return Promise.resolve();
    video.muted = true;
    return video.play().catch(() => {});
  };
  const resumeWhenReady = () => {
    createVideoSurface();
    if (!animationFrame) drawVideo();
    return startPlayback();
  };

  function startMedia() {
    if (mediaStarted) return;
    mediaStarted = true;
    createVideoElement();
    video.addEventListener("loadeddata", resumeWhenReady);
    video.addEventListener("canplay", resumeWhenReady);
    addEventListener("pointerdown", startPlayback, { once: true });
    video.src = new URL("./lounge-tv.mp4?v=deferred-tv-canvas-1", import.meta.url).href;
    video.load();
    startPlayback();
  }

  const cancelDeferredStart = afterFirstFrame(startMedia);

  television.userData.disposeMedia = () => {
    cancelDeferredStart();
    removeEventListener("pointerdown", startPlayback);
    cancelAnimationFrame(animationFrame);
    if (video) {
      video.removeEventListener("loadeddata", resumeWhenReady);
      video.removeEventListener("canplay", resumeWhenReady);
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    }
    texture?.dispose();
    screenMaterial?.dispose();
    coverTexture.dispose();
    coverMaterial.dispose();
  };

  return {
    get video() {
      return video;
    },
    get texture() {
      return texture || coverTexture;
    },
    screens,
    startMedia
  };
}
