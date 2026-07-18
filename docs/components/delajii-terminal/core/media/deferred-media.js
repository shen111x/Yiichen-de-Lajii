let firstFrameDisplayed = false;
const pendingStarts = new Set();

export function afterFirstFrame(callback) {
  if (firstFrameDisplayed) {
    queueMicrotask(callback);
    return () => {};
  }

  pendingStarts.add(callback);
  return () => pendingStarts.delete(callback);
}

export function releaseMediaAfterFirstFrame() {
  if (firstFrameDisplayed) return;
  firstFrameDisplayed = true;
  pendingStarts.forEach(callback => callback());
  pendingStarts.clear();
}
