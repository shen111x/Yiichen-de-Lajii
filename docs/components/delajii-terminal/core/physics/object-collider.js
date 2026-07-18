import { environmentColliderForObject } from "./environment-collider.js";
import { itemColliderForObject } from "./item-collider.js";
import { attachSurfaceSupport } from "./surface-support.js";
import { characterColliderForObject } from "./character-collider.js";

export const PERSISTED_COLLIDER_VERSION = 1;

export function colliderForObject(THREE, object) {
  return environmentColliderForObject(THREE, object)
    || itemColliderForObject(THREE, object);
}

export function persistentColliderForObject(
  THREE,
  object,
  { category = null } = {}
) {
  const collider = category === "character"
    ? characterColliderForObject(THREE, object)
    : colliderForObject(THREE, object);
  if (collider) collider.version = PERSISTED_COLLIDER_VERSION;
  return collider;
}

export function restorePersistentCollider(
  THREE,
  object,
  collider,
  { category = null } = {}
) {
  if (collider?.version !== PERSISTED_COLLIDER_VERSION) return null;
  if (category === "character") {
    return collider.collisionRule === "character" ? collider : null;
  }
  if (collider.collisionRule === "character") return null;
  return attachSurfaceSupport(THREE, collider, object);
}
