function pointToSegmentDistanceSquared(x, z, segment) {
  const dx = segment.endX - segment.startX;
  const dz = segment.endZ - segment.startZ;
  const lengthSquared = dx ** 2 + dz ** 2;
  const amount = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((x - segment.startX) * dx + (z - segment.startZ) * dz) / lengthSquared))
    : 0;
  const nearestX = segment.startX + dx * amount;
  const nearestZ = segment.startZ + dz * amount;
  return (x - nearestX) ** 2 + (z - nearestZ) ** 2;
}

export function colliderDistanceSquared(x, z, box) {
  if (Array.isArray(box.segments) && box.segments.length) {
    return Math.min(...box.segments.map(segment => pointToSegmentDistanceSquared(x, z, segment)));
  }
  const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
  const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
  return (x - nearestX) ** 2 + (z - nearestZ) ** 2;
}

function overlaps(x, z, radius, box) {
  return colliderDistanceSquared(x, z, box) < radius ** 2;
}

function blocksAtHeight(position, x, z, radius, box) {
  const top = box.top ?? Infinity;
  if (box.allowExit && overlaps(position.x, position.z, radius, box)) return false;
  if (box.allowExit) box.allowExit = false;
  return position.y < top - 0.05 && overlaps(x, z, radius, box);
}

export function moveWithCollisions(position, dx, dz, colliders, radius = 0.42) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (radius * 0.5)));
  const stepX = dx / steps;
  const stepZ = dz / steps;
  for (let step = 0; step < steps; step += 1) {
    const nextX = position.x + stepX;
    if (!colliders.some(box => blocksAtHeight(position, nextX, position.z, radius, box))) position.x = nextX;

    const nextZ = position.z + stepZ;
    if (!colliders.some(box => blocksAtHeight(position, position.x, nextZ, radius, box))) position.z = nextZ;
  }
}

export function supportHeightAt(position, colliders, floorHeight, radius = 0.42) {
  let support = floorHeight;
  colliders.forEach(box => {
    if (box.top <= position.y + 0.06 && overlaps(position.x, position.z, radius, box)) {
      support = Math.max(support, box.top);
    }
  });
  return support;
}

export function landingHeight(position, fromY, toY, colliders, floorHeight, radius = 0.42) {
  let landing = fromY >= floorHeight && toY <= floorHeight ? floorHeight : null;
  colliders.forEach(box => {
    if (fromY >= box.top && toY <= box.top && overlaps(position.x, position.z, radius, box)) {
      landing = landing === null ? box.top : Math.max(landing, box.top);
    }
  });
  return landing;
}
