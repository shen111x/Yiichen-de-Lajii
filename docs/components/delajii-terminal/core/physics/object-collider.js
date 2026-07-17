import { environmentColliderForObject } from "./environment-collider.js";
import { itemColliderForObject } from "./item-collider.js";

export function colliderForObject(THREE, object) {
  return environmentColliderForObject(THREE, object)
    || itemColliderForObject(THREE, object);
}
