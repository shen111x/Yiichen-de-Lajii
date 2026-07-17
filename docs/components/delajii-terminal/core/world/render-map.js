import { createTableSet } from "../../asset/furniture/table-set/create-table-set.js?v=static-map-2";
import { createGround } from "../../asset/surface/ground/create-ground.js?v=static-map-1";
import { createWall } from "../../asset/structure/wall/create-wall.js?v=static-map-2";
import { findAsset } from "../../asset/asset-catalog.js?v=collision-strategies-1";
import { colliderForObject } from "../physics/object-collider.js?v=collision-strategies-1";

async function renderEntity(THREE, loader, entity) {
  if (entity.category) {
    const asset = findAsset(entity.category, entity.asset);
    if (!asset) throw new Error(`Unknown map asset: ${entity.category}/${entity.asset}`);
    const content = await asset.create({ THREE, textureLoader: loader });
    const object = new THREE.Group();
    object.add(content);
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
  const entities = [];

  for (const mapEntity of mapData.entities) {
    const entityObject = await renderEntity(THREE, loader, mapEntity);
    object.add(entityObject);
    const collider = colliderForObject(THREE, entityObject)
      || mapEntity.collider;
    if (collider) mapEntity.collider = collider;
    entities.push({
      id: mapEntity.id,
      object: entityObject,
      collider,
      mapEntity,
      category: mapEntity.category || null,
      name: mapEntity.asset
    });
  }

  return {
    object,
    entities,
    colliders: entities.flatMap(entity => entity.collider ? [entity.collider] : [])
  };
}
