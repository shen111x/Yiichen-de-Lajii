const COLLISION_RADIUS = 0.42;
const SUPPORT_TOLERANCE = 0.06;

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

function pointInsideSegmentPolygon(x, z, segments) {
  let inside = false;
  segments.forEach(segment => {
    const crossesZ = (segment.startZ > z) !== (segment.endZ > z);
    if (!crossesZ) return;
    const crossingX = segment.startX
      + ((z - segment.startZ) * (segment.endX - segment.startX))
        / (segment.endZ - segment.startZ);
    if (x < crossingX) inside = !inside;
  });
  return inside;
}

export function colliderDistanceSquared(x, z, box) {
  if (box.collisionRule === "character") {
    const centerDistance = Math.hypot(x - box.centerX, z - box.centerZ);
    const outsideDistance = Math.max(0, centerDistance - box.radius);
    return outsideDistance ** 2;
  }
  if (Array.isArray(box.segments) && box.segments.length) {
    if (box.solid && pointInsideSegmentPolygon(x, z, box.segments)) return 0;
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
  const nextDistance = colliderDistanceSquared(x, z, box);
  if (nextDistance >= radius ** 2) return false;
  const currentDistance = colliderDistanceSquared(position.x, position.z, box);
  if (nextDistance > currentDistance + Number.EPSILON) return false;
  const localSupport = typeof box.supportHeightAt === "function"
    ? box.supportHeightAt(x, z)
    : null;
  if (!box.blocksWhileSupported && typeof box.supportHeightAt === "function") {
    const currentSupport = box.supportHeightAt(
      position.x,
      position.z,
      -Infinity,
      position.y + SUPPORT_TOLERANCE
    );
    const standingOnThisObject = currentSupport !== null
      && Math.abs(position.y - currentSupport) <= SUPPORT_TOLERANCE;
    if (standingOnThisObject
      && (localSupport === null || localSupport <= position.y + SUPPORT_TOLERANCE)) {
      return false;
    }
  }
  const top = box.blocksWhileSupported
    ? box.top ?? Infinity
    : localSupport ?? box.top ?? Infinity;
  return position.y < top - 0.05;
}

export function moveWithCollisions(position, dx, dz, colliders, radius = COLLISION_RADIUS) {
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

export function supportHeightAt(position, colliders, floorHeight, radius = COLLISION_RADIUS) {
  let support = floorHeight;
  colliders.forEach(box => {
    if (box.collisionRule === "character") return;
    const hasSurfaceSampler = typeof box.supportHeightAt === "function";
    if (!hasSurfaceSampler && !overlaps(position.x, position.z, radius, box)) return;
    const localSupport = hasSurfaceSampler
      ? box.supportHeightAt(position.x, position.z, -Infinity, position.y + SUPPORT_TOLERANCE)
      : box.top;
    if (localSupport !== null && localSupport <= position.y + SUPPORT_TOLERANCE) {
      support = Math.max(support, localSupport);
    }
  });
  return support;
}

export function landingHeight(position, fromY, toY, colliders, floorHeight, radius = COLLISION_RADIUS) {
  let landing = fromY >= floorHeight && toY <= floorHeight ? floorHeight : null;
  colliders.forEach(box => {
    if (box.collisionRule === "character") return;
    const hasSurfaceSampler = typeof box.supportHeightAt === "function";
    if (!hasSurfaceSampler && !overlaps(position.x, position.z, radius, box)) return;
    const localSupport = hasSurfaceSampler
      ? box.supportHeightAt(position.x, position.z, toY, fromY)
      : box.top;
    if (localSupport !== null && fromY >= localSupport && toY <= localSupport) {
      landing = landing === null ? localSupport : Math.max(landing, localSupport);
    }
  });
  return landing;
}
