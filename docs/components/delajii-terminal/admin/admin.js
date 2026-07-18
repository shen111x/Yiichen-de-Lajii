import { ASSET_CATALOG, findAsset } from "../asset/asset-catalog.js?v=self-hosted-three-1";
import { saveMap } from "./map-persistence.js?v=1";

const DOUBLE_PRESS_MS = 320;

export function createAdminMode({
  THREE,
  worldObject,
  worldEntities,
  textureLoader,
  character,
  orbit,
  colliders,
  mapData,
  createCollider,
  colliderDistanceSquared,
  cameraCollision
}) {
  const chat = document.querySelector("#chat-panel");
  const chatInput = chat.querySelector('input[aria-label="Chat message"]');
  const expandButton = chat.querySelector("[data-expand-chat]");
  const browserHost = chat.querySelector(".chat-placeholder");
  const actionButtons = [...document.querySelectorAll(".action-large")];
  const placeButton = actionButtons.find(button => button.textContent.trim() === "＊");
  const deleteButton = actionButtons.find(button => button.textContent.trim() === "#");
  let selected = { category: "food", name: "ramen" };
  let placing = false;
  let deleting = false;
  let settingSpawn = false;
  let lastDeleteKey = 0;
  let lastDeletePointer = 0;
  let nextObjectId = 1;
  const pendingCollisionRecords = new Set();
  const placementAppearances = new WeakMap();

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = new URL("./admin.css", import.meta.url).href;
  document.head.append(stylesheet);

  function renderAssetBrowser(message = "Z / ＊ to place · double X / # to delete") {
    browserHost.replaceChildren();
    const browser = document.createElement("section");
    browser.className = "admin-asset-browser";
    const header = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = "Asset Placement";
    const status = document.createElement("span");
    status.dataset.adminStatus = "";
    status.textContent = message;
    header.append(title, status);
    browser.append(header);

    ASSET_CATALOG.forEach(group => {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = group.category;
      const items = document.createElement("div");
      items.className = "admin-asset-items";
      group.items.forEach(item => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.adminCategory = group.category;
        button.dataset.adminAsset = item.name;
        button.textContent = item.name;
        button.classList.toggle(
          "selected",
          selected.category === group.category && selected.name === item.name
        );
        items.append(button);
      });
      details.append(summary, items);
      browser.append(details);
    });
    browserHost.append(browser);
  }

  function setStatus(message) {
    const status = browserHost.querySelector("[data-admin-status]");
    if (status) status.textContent = message;
  }

  function foldChat() {
    chat.classList.remove("expanded");
    expandButton.textContent = "Expand";
  }

  function toggleAdminChat() {
    if (chat.hidden) {
      chat.hidden = false;
      const chatButton = document.querySelector('[data-toggle-panel="chat-panel"]');
      chatButton?.classList.add("active");
      chatButton?.setAttribute("aria-expanded", "true");
    }
    expandButton.click();
  }

  function playerTouches(collider) {
    if (Array.isArray(collider.segments) && !collider.solid
      && character.position.x >= collider.minX && character.position.x <= collider.maxX
      && character.position.z >= collider.minZ && character.position.z <= collider.maxZ) {
      return true;
    }
    return colliderDistanceSquared(character.position.x, character.position.z, collider) <= 0.42 ** 2;
  }

  function setPlacementOpacity(object, amount) {
    const visitedMaterials = new Set();
    object.traverse(node => {
      if (!node.isMesh) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.filter(Boolean).forEach(material => {
        if (visitedMaterials.has(material)) return;
        visitedMaterials.add(material);
        let original = placementAppearances.get(material);
        if (!original && amount !== null) {
          original = {
            opacity: material.opacity,
            transparent: material.transparent,
            depthWrite: material.depthWrite
          };
          placementAppearances.set(material, original);
        }
        if (amount === null) {
          if (!original) return;
          material.opacity = original.opacity;
          material.transparent = original.transparent;
          material.depthWrite = original.depthWrite;
          placementAppearances.delete(material);
        } else {
          material.opacity = original.opacity * amount;
          material.transparent = true;
          material.depthWrite = false;
        }
        material.needsUpdate = true;
      });
    });
  }

  function activatePlacedCollider(record) {
    if (record.colliderActive) return;
    record.colliderActive = true;
    colliders.push(record.collider);
    pendingCollisionRecords.delete(record);
    cameraCollision.include(record.object);
    setPlacementOpacity(record.object, null);
  }

  function removeRuntimeEntity(record) {
    record.object.removeFromParent();
    const colliderIndex = colliders.indexOf(record.collider);
    if (colliderIndex >= 0) colliders.splice(colliderIndex, 1);
    pendingCollisionRecords.delete(record);
    cameraCollision.include(record.object);
    const mapIndex = mapData.entities.indexOf(record.mapEntity);
    if (mapIndex >= 0) mapData.entities.splice(mapIndex, 1);
    const runtimeIndex = worldEntities.indexOf(record);
    if (runtimeIndex >= 0) worldEntities.splice(runtimeIndex, 1);
  }

  async function placeAsset(category, name, position, rotation) {
    if (placing) return null;
    const asset = findAsset(category, name);
    if (!asset) return null;
    placing = true;
    setStatus(`Loading ${name}…`);
    let record = null;
    try {
      const content = await asset.create({ THREE, textureLoader });
      const object = new THREE.Group();
      const id = `admin-${Date.now().toString(36)}-${nextObjectId++}`;
      object.name = id;
      if (category === "character") cameraCollision.ignore(object);
      else cameraCollision.exclude(object);
      object.add(content);
      object.userData.update = content.userData.update;
      object.position.set(position.x, 0, position.z);
      object.rotation.y = rotation;
      worldObject.add(object);
      object.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(object, true);
      object.position.y += position.y - bounds.min.y;
      object.updateMatrixWorld(true);
      const collider = createCollider(object, { category, name });
      const placedPosition = {
        x: object.position.x,
        y: object.position.y,
        z: object.position.z
      };
      const mapEntity = {
        id,
        asset: name,
        category,
        position: placedPosition,
        rotation,
        collider
      };
      record = {
        id,
        object,
        collider,
        colliderActive: false,
        mapEntity,
        category,
        name,
        update: object.userData.update
      };
      setPlacementOpacity(object, 0.5);
      pendingCollisionRecords.add(record);
      mapData.entities.push(mapEntity);
      worldEntities.push(record);
      await saveMap(mapData);
      setStatus(`${name} saved at ${placedPosition.x.toFixed(1)}, ${position.y.toFixed(1)}, ${placedPosition.z.toFixed(1)}`);
      return object;
    } catch (error) {
      if (record) {
        removeRuntimeEntity(record);
        record.object.traverse(node => node.userData.disposeMedia?.());
      }
      console.error(`Unable to place ${name}`, error);
      setStatus(`Unable to save ${name}`);
      return null;
    } finally {
      placing = false;
    }
  }

  function placeSelected() {
    placeAsset(
      selected.category,
      selected.name,
      { x: character.position.x, y: character.position.y, z: character.position.z },
      character.rotation.y
    );
  }

  async function setSpawnAtCharacter() {
    if (settingSpawn) return;
    settingSpawn = true;
    const previousSpawn = { ...mapData.spawn };
    const nextSpawn = {
      x: character.position.x,
      y: character.position.y,
      z: character.position.z,
      yaw: orbit.yaw,
      pitch: orbit.pitch
    };
    mapData.spawn = nextSpawn;
    setStatus("Saving spawn…");
    try {
      await saveMap(mapData);
      chatInput.value = "";
      setStatus(`Spawn saved at ${nextSpawn.x.toFixed(1)}, ${nextSpawn.y.toFixed(1)}, ${nextSpawn.z.toFixed(1)}`);
    } catch (error) {
      mapData.spawn = previousSpawn;
      console.error("Unable to save spawn", error);
      setStatus("Unable to save spawn");
    } finally {
      settingSpawn = false;
    }
  }

  function playerContactDistanceSquared(collider) {
    return colliderDistanceSquared(character.position.x, character.position.z, collider);
  }

  function playerContactCenterDistanceSquared(collider) {
    const centerX = (collider.minX + collider.maxX) / 2;
    const centerZ = (collider.minZ + collider.maxZ) / 2;
    return (character.position.x - centerX) ** 2 + (character.position.z - centerZ) ** 2;
  }

  async function deleteTouchingObject() {
    if (deleting) return;
    const radius = 0.42;
    const target = worldEntities
      .filter(item => item.collider)
      .map(item => ({
        item,
        contactDistance: playerContactDistanceSquared(item.collider),
        centerDistance: playerContactCenterDistanceSquared(item.collider)
      }))
      .filter(candidate => candidate.contactDistance <= radius ** 2)
      .filter(candidate => character.position.y <= candidate.item.collider.top + 0.16)
      .sort((a, b) =>
        a.contactDistance - b.contactDistance || a.centerDistance - b.centerDistance
      )[0]?.item;
    if (!target) {
      setStatus("No map asset touching player");
      return;
    }

    deleting = true;
    const runtimeIndex = worldEntities.indexOf(target);
    const colliderIndex = colliders.indexOf(target.collider);
    const mapIndex = mapData.entities.indexOf(target.mapEntity);
    removeRuntimeEntity(target);
    try {
      await saveMap(mapData);
      target.object.traverse(node => node.userData.disposeMedia?.());
      setStatus(`${target.name} deleted and saved`);
    } catch (error) {
      worldObject.add(target.object);
      worldEntities.splice(runtimeIndex, 0, target);
      if (target.colliderActive !== false) colliders.splice(Math.max(0, colliderIndex), 0, target.collider);
      else {
        pendingCollisionRecords.add(target);
        cameraCollision.exclude(target.object);
      }
      mapData.entities.splice(mapIndex, 0, target.mapEntity);
      console.error(`Unable to delete ${target.name}`, error);
      setStatus(`Unable to save deletion of ${target.name}`);
    } finally {
      deleting = false;
    }
  }

  expandButton.addEventListener("click", () => {
    if (chat.classList.contains("expanded")) renderAssetBrowser();
  });

  browserHost.addEventListener("click", event => {
    const button = event.target.closest("[data-admin-asset]");
    if (!button) return;
    selected = {
      category: button.dataset.adminCategory,
      name: button.dataset.adminAsset
    };
    renderAssetBrowser(`${selected.name} selected`);
    foldChat();
  });

  chat.addEventListener("submit", event => {
    if (chatInput.value.trim().toLowerCase() !== "ydl-set-spawn") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setSpawnAtCharacter();
  });

  placeButton?.addEventListener("click", placeSelected);
  deleteButton?.addEventListener("pointerdown", event => {
    event.preventDefault();
    const now = performance.now();
    if (now - lastDeletePointer <= DOUBLE_PRESS_MS) deleteTouchingObject();
    lastDeletePointer = now;
  });

  addEventListener("keydown", event => {
    if (event.repeat) return;
    if (event.target instanceof Element && event.target.matches("input, textarea, [contenteditable='true']")) return;
    const key = event.key.toLowerCase();
    if (key === "c") {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleAdminChat();
      return;
    }
    if (key === "z") {
      event.preventDefault();
      event.stopImmediatePropagation();
      placeSelected();
      return;
    }
    if (key === "x") {
      const now = performance.now();
      if (now - lastDeleteKey <= DOUBLE_PRESS_MS) {
        event.preventDefault();
        event.stopImmediatePropagation();
        deleteTouchingObject();
      }
      lastDeleteKey = now;
    }
  }, true);

  document.body.classList.add("admin-active");
  renderAssetBrowser("Game Admin active · map writes enabled");

  function update() {
    [...pendingCollisionRecords].forEach(record => {
      if (!playerTouches(record.collider)) activatePlacedCollider(record);
    });
  }

  return { placeSelected, deleteTouchingObject, update };
}
