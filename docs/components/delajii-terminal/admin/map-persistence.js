let saveQueue = Promise.resolve();

export function saveMap(mapData) {
  const snapshot = JSON.parse(JSON.stringify(mapData));
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    const response = await fetch("/api/delajii-terminal/map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Map save failed: ${response.status}`);
    return payload.map;
  });
  return saveQueue;
}
