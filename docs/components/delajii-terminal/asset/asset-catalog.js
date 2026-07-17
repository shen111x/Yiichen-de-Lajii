import { createCharacter } from "./character/yiichen/create-character.js";
import { createRamen } from "./food/ramen/create-ramen.js?v=size-3x";
import { createLoungeTv } from "./furniture/lounge-tv/create-lounge-tv.js?v=precise-bounds-1";
import { createPhantomChair } from "./furniture/phantom-chair/create-phantom-chair.js?v=decoupled-1";
import { createTableSet } from "./furniture/table-set/create-table-set.js";
import { createLounge } from "./rooms/lounge/create-lounge.js?v=collision-strategies-1";
import { createWall } from "./structure/wall/create-wall.js";
import { createGround } from "./surface/ground/create-ground.js";

export const ASSET_CATALOG = [
  {
    category: "character",
    items: [{
      name: "yiichen",
      create: async ({ THREE, textureLoader }) => (await createCharacter(THREE, textureLoader)).object
    }]
  },
  {
    category: "food",
    items: [{ name: "ramen", create: ({ THREE }) => createRamen(THREE) }]
  },
  {
    category: "furniture",
    items: [
      { name: "lounge-tv", create: ({ THREE }) => createLoungeTv(THREE) },
      { name: "phantom-chair", create: ({ THREE }) => createPhantomChair(THREE) },
      {
        name: "table-set",
        create: async ({ THREE }) => createTableSet(THREE, [{ x: 0, z: 0, rotation: 0 }])
      }
    ]
  },
  {
    category: "rooms",
    items: [{ name: "lounge", create: ({ THREE }) => createLounge(THREE) }]
  },
  {
    category: "structure",
    items: [{
      name: "wall",
      create: async ({ THREE }) => createWall(THREE, {
        size: { width: 4, height: 4, depth: 1 },
        position: { x: 0, y: 2, z: 0 }
      })
    }]
  },
  {
    category: "surface",
    items: [{
      name: "ground",
      create: async ({ THREE, textureLoader }) => createGround(THREE, textureLoader, {
        width: 4,
        depth: 4,
        textureRepeat: { x: 1, y: 1 }
      })
    }]
  }
];

export function findAsset(category, name) {
  return ASSET_CATALOG
    .find(group => group.category === category)
    ?.items.find(item => item.name === name);
}
