import { createTableSet } from "../../asset/furniture/table-set/create-table-set.js?v=static-map-2";
import { createGround } from "../../asset/surface/ground/create-ground.js?v=static-map-1";
import { createWall } from "../../asset/structure/wall/create-wall.js?v=static-map-2";
import { findAsset } from "../../asset/asset-catalog.js?v=asset-cleanup-1";
import {
  persistentColliderForObject,
  restorePersistentCollider
} from "../physics/object-collider.js?v=character-collider-1";

async function renderEntity(THREE, loader, entity) {
  if (entity.category) {
    const asset = findAsset(entity.category, entity.asset);
    if (!asset) throw new Error(`Unknown map asset: ${entity.category}/${entity.asset}`);
    const content = await asset.create({ THREE, textureLoader: loader });
    const object = new THREE.Group();
    object.add(content);
    object.userData.update = content.userData.update;
    object.position.set(entity.position.x, entity.position.y, entity.position.z);
    object.rotation.y = entity.rotation || 0;
    return object;
  }
  if (entity.asset === "wall") return createWall(THREE, entity);
  if (entity.asset === "table-set") {
    return createTableSet(THREE, [{
      x: entity.position.x,
      z: entity.position.z,
      rotation: entity.rotation || 0
    }]);
  }
  throw new Error(`Unknown static map asset: ${entity.asset}`);
}

export async function renderMap(THREE, loader, mapData) {
  const object = new THREE.Group();
  object.add(createGround(THREE, loader, mapData.ground));

  const entities = await Promise.all(mapData.entities.map(async mapEntity => {
    const entityObject = await renderEntity(THREE, loader, mapEntity);
    const storedCollider = mapEntity.category
      ? restorePersistentCollider(THREE, entityObject, mapEntity.collider, {
        category: mapEntity.category
      })
      : mapEntity.collider;
    const collider = storedCollider
      || persistentColliderForObject(THREE, entityObject, {
        category: mapEntity.category
      });
    if (collider) mapEntity.collider = collider;
    return {
      id: mapEntity.id,
      object: entityObject,
      collider,
      mapEntity,
      category: mapEntity.category || null,
      name: mapEntity.asset,
      update: entityObject.userData.update
    };
  }));

  // Promise.all preserves the JSON order even when assets finish loading at
  // different times.
  entities.forEach(entity => object.add(entity.object));

  return {
    object,
    entities,
    colliders: entities.flatMap(entity => entity.collider ? [entity.collider] : [])
  };
}
