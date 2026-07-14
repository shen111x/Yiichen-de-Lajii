function overlaps(x, z, radius, box) {
  const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
  const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
  return (x - nearestX) ** 2 + (z - nearestZ) ** 2 < radius ** 2;
}

function blocksAtHeight(position, x, z, radius, box) {
  const top = box.top ?? Infinity;
  return position.y < top - 0.05 && overlaps(x, z, radius, box);
}

export function moveWithCollisions(position, dx, dz, colliders, radius = 0.42) {
  const nextX = position.x + dx;
  if (!colliders.some(box => blocksAtHeight(position, nextX, position.z, radius, box))) position.x = nextX;

  const nextZ = position.z + dz;
  if (!colliders.some(box => blocksAtHeight(position, position.x, nextZ, radius, box))) position.z = nextZ;
}

export function supportHeightAt(position, colliders, radius = 0.42) {
  let support = 0;
  colliders.forEach(box => {
    if (box.top <= position.y + 0.06 && overlaps(position.x, position.z, radius, box)) {
      support = Math.max(support, box.top);
    }
  });
  return support;
}

export function landingHeight(position, fromY, toY, colliders, radius = 0.42) {
  let landing = fromY >= 0 && toY <= 0 ? 0 : null;
  colliders.forEach(box => {
    if (fromY >= box.top && toY <= box.top && overlaps(position.x, position.z, radius, box)) {
      landing = landing === null ? box.top : Math.max(landing, box.top);
    }
  });
  return landing;
}
