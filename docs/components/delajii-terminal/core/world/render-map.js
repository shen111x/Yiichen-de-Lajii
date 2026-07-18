import { createTableSet } from "../../asset/furniture/table-set/create-table-set.js?v=static-map-2";
import { createGround } from "../../asset/surface/ground/create-ground.js?v=static-map-1";
import { createWall } from "../../asset/structure/wall/create-wall.js?v=static-map-2";
import { findAsset } from "../../asset/asset-catalog.js?v=load-timing-1";
import {
  persistentColliderForObject,
  restorePersistentCollider
} from "../physics/object-collider.js?v=character-collider-1";
import {
  loadMark,
  loadMeasure,
  measureLoadStep
} from "../performance/load-performance.js?v=load-timing-1";

async function renderEntity(THREE, loader, entity, timingName, detail) {
  loadMark(`${timingName}:asset:start`, detail);
  let object;
  if (entity.category) {
    const asset = findAsset(entity.category, entity.asset);
    if (!asset) throw new Error(`Unknown map asset: ${entity.category}/${entity.asset}`);
    const content = await asset.create({ THREE, textureLoader: loader });
    object = new THREE.Group();
    object.add(content);
    object.userData.update = content.userData.update;
    object.position.set(entity.position.x, entity.position.y, entity.position.z);
    object.rotation.y = entity.rotation || 0;
  } else if (entity.asset === "wall") {
    object = createWall(THREE, entity);
  } else if (entity.asset === "table-set") {
    object = await createTableSet(THREE, [{
      x: entity.position.x,
      z: entity.position.z,
      rotation: entity.rotation || 0
    }]);
  } else {
    throw new Error(`Unknown static map asset: ${entity.asset}`);
  }
  loadMark(`${timingName}:asset:end`, detail);
  loadMeasure(
    `${timingName}:asset`,
    `${timingName}:asset:start`,
    `${timingName}:asset:end`,
    detail
  );
  return object;
}

export async function renderMap(THREE, loader, mapData) {
  loadMark("delajii:world:start", { entityCount: mapData.entities.length });
  const object = new THREE.Group();
  loadMark("delajii:ground:start");
  object.add(createGround(THREE, loader, mapData.ground));
  loadMark("delajii:ground:end");
  loadMeasure("delajii:ground", "delajii:ground:start", "delajii:ground:end");

  const entities = await measureLoadStep(
    "delajii:entities-parallel",
    () => Promise.all(mapData.entities.map(async (mapEntity, index) => {
    const label = `${mapEntity.category || "static"}/${mapEntity.asset}`;
    const identity = mapEntity.id || index;
    const timingName = `delajii:entity:${index}:${label}`;
    const detail = { index, id: identity, asset: label };
    loadMark(`${timingName}:start`, detail);
    const entityObject = await renderEntity(
      THREE,
      loader,
      mapEntity,
      timingName,
      detail
    );
    loadMark(`${timingName}:collider:start`, detail);
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
    loadMark(`${timingName}:collider:end`, detail);
    loadMeasure(
      `${timingName}:collider`,
      `${timingName}:collider:start`,
      `${timingName}:collider:end`,
      { ...detail, restored: Boolean(storedCollider), hasCollider: Boolean(collider) }
    );
    const result = {
      id: mapEntity.id,
      object: entityObject,
      collider,
      mapEntity,
      category: mapEntity.category || null,
      name: mapEntity.asset,
      update: entityObject.userData.update
    };
    loadMark(`${timingName}:end`, detail);
    loadMeasure(timingName, `${timingName}:start`, `${timingName}:end`, detail);
    return result;
  })),
    { entityCount: mapData.entities.length }
  );

  // Promise.all preserves the JSON order even when assets finish loading at
  // different times.
  loadMark("delajii:entities-attach:start", { entityCount: entities.length });
  entities.forEach(entity => object.add(entity.object));
  loadMark("delajii:entities-attach:end", { entityCount: entities.length });
  loadMeasure(
    "delajii:entities-attach",
    "delajii:entities-attach:start",
    "delajii:entities-attach:end",
    { entityCount: entities.length }
  );

  const result = {
    object,
    entities,
    colliders: entities.flatMap(entity => entity.collider ? [entity.collider] : [])
  };
  loadMark("delajii:world:end", {
    entityCount: entities.length,
    colliderCount: result.colliders.length
  });
  loadMeasure("delajii:world", "delajii:world:start", "delajii:world:end");
  return result;
}
