import {
  attachSurfaceSupport,
  GEOMETRY_EPSILON
} from "./surface-support.js";

function cross2d(origin, a, b) {
  return (a.x - origin.x) * (b.z - origin.z)
    - (a.z - origin.z) * (b.x - origin.x);
}

function convexHull(points) {
  points.sort((a, b) => a.x - b.x || a.z - b.z);
  const unique = points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous
      || Math.abs(point.x - previous.x) > GEOMETRY_EPSILON
      || Math.abs(point.z - previous.z) > GEOMETRY_EPSILON;
  });
  if (unique.length < 3) return [];

  const lower = [];
  unique.forEach(point => {
    while (lower.length >= 2 && cross2d(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  });

  const upper = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index];
    while (upper.length >= 2 && cross2d(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function collectFootprintPoints(THREE, object) {
  object.updateMatrixWorld(true);
  const points = [];
  const vertex = new THREE.Vector3();
  object.traverse(node => {
    if (!node.isMesh) return;
    const position = node.geometry.getAttribute("position");
    if (!position) return;
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(node.matrixWorld);
      points.push({ x: vertex.x, z: vertex.z });
    }
  });
  return points;
}

function meshItemColliderForObject(THREE, object) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object, true);
  const hull = convexHull(collectFootprintPoints(THREE, object));
  if (hull.length < 3 || bounds.isEmpty()) return null;
  const segments = hull.map((start, index) => {
    const end = hull[(index + 1) % hull.length];
    return {
      startX: start.x,
      startZ: start.z,
      endX: end.x,
      endZ: end.z,
      bottom: bounds.min.y,
      top: bounds.max.y
    };
  });
  return attachSurfaceSupport(THREE, {
    collisionRule: "item",
    minX: bounds.min.x,
    maxX: bounds.max.x,
    minZ: bounds.min.z,
    maxZ: bounds.max.z,
    bottom: bounds.min.y,
    top: bounds.max.y,
    segments,
    solid: true
  }, object);
}

function boxItemColliderForObject(THREE, object) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object, true);
  if (bounds.isEmpty()) return null;
  return attachSurfaceSupport(THREE, {
    collisionRule: "item",
    minX: bounds.min.x,
    maxX: bounds.max.x,
    minZ: bounds.min.z,
    maxZ: bounds.max.z,
    bottom: bounds.min.y,
    top: bounds.max.y
  }, object);
}

export function itemColliderForObject(THREE, object) {
  return meshItemColliderForObject(THREE, object)
    || boxItemColliderForObject(THREE, object);
}
