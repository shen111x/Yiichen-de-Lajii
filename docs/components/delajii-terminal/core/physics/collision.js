import { PLAYER_BODY_BOX } from "../character/player-body.js?v=character-height-1";

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
  if (Array.isArray(box.segments) && box.segments.length) {
    if (box.solid && pointInsideSegmentPolygon(x, z, box.segments)) return 0;
    return Math.min(...box.segments.map(segment => pointToSegmentDistanceSquared(x, z, segment)));
  }
  const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
  const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
  return (x - nearestX) ** 2 + (z - nearestZ) ** 2;
}

function pointInsideBox(x, z, minX, maxX, minZ, maxZ) {
  return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
}

function segmentIntersectsBox(segment, minX, maxX, minZ, maxZ) {
  const dx = segment.endX - segment.startX;
  const dz = segment.endZ - segment.startZ;
  let near = 0;
  let far = 1;

  for (const [origin, delta, minimum, maximum] of [
    [segment.startX, dx, minX, maxX],
    [segment.startZ, dz, minZ, maxZ]
  ]) {
    if (Math.abs(delta) < Number.EPSILON) {
      if (origin < minimum || origin > maximum) return false;
      continue;
    }
    const first = (minimum - origin) / delta;
    const second = (maximum - origin) / delta;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return false;
  }
  return true;
}

function footprintOverlaps(x, z, body, box) {
  const halfWidth = body.width / 2;
  const halfDepth = body.depth / 2;
  const minX = x - halfWidth;
  const maxX = x + halfWidth;
  const minZ = z - halfDepth;
  const maxZ = z + halfDepth;

  if (!Array.isArray(box.segments) || !box.segments.length) {
    return minX < box.maxX && maxX > box.minX
      && minZ < box.maxZ && maxZ > box.minZ;
  }

  if (box.segments.some(segment => segmentIntersectsBox(
    segment,
    minX,
    maxX,
    minZ,
    maxZ
  ))) return true;
  if (!box.solid) return false;

  const corners = [
    [minX, minZ],
    [minX, maxZ],
    [maxX, minZ],
    [maxX, maxZ]
  ];
  if (corners.some(([cornerX, cornerZ]) => pointInsideSegmentPolygon(
    cornerX,
    cornerZ,
    box.segments
  ))) return true;
  return box.segments.some(segment => pointInsideBox(
    segment.startX,
    segment.startZ,
    minX,
    maxX,
    minZ,
    maxZ
  ));
}

function blocksAtHeight(position, x, z, body, box) {
  if (!footprintOverlaps(x, z, body, box)) return false;
  const nextDistance = colliderDistanceSquared(x, z, box);
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
  const bottom = box.bottom ?? -Infinity;
  return position.y < top - 0.05
    && position.y + body.height > bottom + 0.05;
}

export function moveWithCollisions(
  position,
  dx,
  dz,
  colliders,
  body = PLAYER_BODY_BOX
) {
  const stepSize = Math.min(body.width, body.depth) * 0.25;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / stepSize));
  const stepX = dx / steps;
  const stepZ = dz / steps;
  for (let step = 0; step < steps; step += 1) {
    const nextX = position.x + stepX;
    if (!colliders.some(box => blocksAtHeight(position, nextX, position.z, body, box))) position.x = nextX;

    const nextZ = position.z + stepZ;
    if (!colliders.some(box => blocksAtHeight(position, position.x, nextZ, body, box))) position.z = nextZ;
  }
}

export function supportHeightAt(
  position,
  colliders,
  floorHeight,
  body = PLAYER_BODY_BOX
) {
  let support = floorHeight;
  colliders.forEach(box => {
    if (box.collisionRule === "character") return;
    const hasSurfaceSampler = typeof box.supportHeightAt === "function";
    if (!hasSurfaceSampler && !footprintOverlaps(position.x, position.z, body, box)) return;
    const localSupport = hasSurfaceSampler
      ? box.supportHeightAt(position.x, position.z, -Infinity, position.y + SUPPORT_TOLERANCE)
      : box.top;
    if (localSupport !== null && localSupport <= position.y + SUPPORT_TOLERANCE) {
      support = Math.max(support, localSupport);
    }
  });
  return support;
}

export function landingHeight(
  position,
  fromY,
  toY,
  colliders,
  floorHeight,
  body = PLAYER_BODY_BOX
) {
  let landing = fromY >= floorHeight && toY <= floorHeight ? floorHeight : null;
  colliders.forEach(box => {
    if (box.collisionRule === "character") return;
    const hasSurfaceSampler = typeof box.supportHeightAt === "function";
    if (!hasSurfaceSampler && !footprintOverlaps(position.x, position.z, body, box)) return;
    const localSupport = hasSurfaceSampler
      ? box.supportHeightAt(position.x, position.z, toY, fromY)
      : box.top;
    if (localSupport !== null && fromY >= localSupport && toY <= localSupport) {
      landing = landing === null ? localSupport : Math.max(landing, localSupport);
    }
  });
  return landing;
}
