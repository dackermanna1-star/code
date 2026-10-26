// Item instances: creation, persistence, locations (world / hand / containers /
// storage / worn), colliders for furniture and the per-item interactable.
import * as THREE from 'three';
import { G } from '../game.js';
import { ITEMS, defBounds, takePrebuilt, getDef } from './registry.js';
import { CONTAINERS } from './container.js';
import { Interactable } from '../world/interactable.js';
import { uid, disposeObject } from '../core/utils.js';
import { queueSave } from '../core/state.js';
import { blobShadow } from './kit.js';

const ABSTRACT = new Set(['storage', 'wardrobe', 'pantry', 'worn', 'package', 'gone']);

export class ItemInstance {
  constructor(record) {
    this.data = record;
    this.def = getDef(record.id);
    this._object = null;
    this.interactable = new ItemInteractable(this);
    this.footprint = null;
    this.collider = null;
    this.runtime = {}; // non-persistent behavior state (lights, sounds...)
  }
  get uid() { return this.data.uid; }
  get loc() { return this.data.loc; }
  get st() { return this.data.st; }
  get built() { return !!this._object; }
  get object() {
    if (!this._object) {
      const model = (!this.def.dynamic && takePrebuilt(this.def)) || this.def.build(this.def, this.data.st || {});
      const root = new THREE.Group();
      root.name = 'item:' + this.def.id;
      root.add(model);
      this.model = model;
      root.userData.interactable = this.interactable;
      root.userData.item = this;
      this.interactable.object = root;
      const b = defBounds(this.def);
      if (this.def.place !== 'wall' && !this.def.noShadowBlob && b.size.y < 1.5) {
        const blob = blobShadow(b.size.x * 1.25, b.size.z * 1.25, this.def.furniture ? 0.28 : 0.32);
        blob.position.x = b.center.x; blob.position.z = b.center.z;
        root.add(blob);
        this.blob = blob;
      }
      this._object = root;
      G.behaviors.init(this);
    }
    return this._object;
  }
  dispose() {
    if (this._object) {
      G.behaviors.dispose(this);
      this._object.parent?.remove(this._object);
      disposeObject(this._object);
      this._object = null;
    }
  }
}

class ItemInteractable extends Interactable {
  constructor(inst) { super(() => inst.displayName?.() || inst.def.name, 'item'); this.inst = inst; }
  getActions() { return G.items.actionsFor(this.inst); }
  get reach() {
    const t = this.inst.def.use?.type;
    if (['tv', 'speaker', 'radio', 'smartspeaker', 'turntable', 'projector', 'arcade'].includes(t) || this.inst.def.use?.smart) return 7;
    return this.inst.def.furniture ? 3.2 : 2.7;
  }
  get subtitleText() { return G.behaviors.subtitle?.(this.inst) || ''; }
}

export class ItemManager {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'items';
    scene.add(this.root);
    this.list = [];
    this.byUid = new Map();
    this.colliders = [];
    this.rugs = [];
    this._meshCache = null;
  }

  all() { return this.list; }
  get(uid) { return this.byUid.get(uid); }
  inLoc(loc) { return this.list.filter((i) => i.data.loc === loc); }
  owned() { return this.list.filter((i) => !['package', 'gone'].includes(i.data.loc)); }
  countOwned(id) { return this.owned().filter((i) => i.def.id === id).length; }

  loadFromState() {
    const records = G.state.items;
    for (const r of records) {
      if (!ITEMS[r.id]) { console.warn('Unknown item in save:', r.id); continue; }
      if (r.loc === 'hand') r.loc = 'storage';
      const inst = new ItemInstance(r);
      this.list.push(inst);
      this.byUid.set(r.uid, inst);
    }
    G.state.items = this.list.map((i) => i.data);
    for (const inst of this.list) this._apply(inst);
    this._rebuildColliders();
  }

  // Create a brand new item (persisted)
  spawn(id, { loc = 'storage', pos = null, rot = null, st = {}, slot = undefined, yaw = null } = {}) {
    const def = ITEMS[id];
    if (!def) { console.warn('spawn unknown item', id); return null; }
    const record = { uid: uid(), id, loc, pos: pos ? [pos.x, pos.y, pos.z] : null, rot: null, st: { ...(def.initState?.() || {}), ...st } };
    if (rot) record.rot = [rot.x, rot.y, rot.z, rot.w];
    else if (yaw != null) { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw); record.rot = [q.x, q.y, q.z, q.w]; }
    if (slot !== undefined) record.slot = slot;
    G.state.items.push(record);
    const inst = new ItemInstance(record);
    this.list.push(inst);
    this.byUid.set(record.uid, inst);
    if (!G.state.discovered[id]) { G.state.discovered[id] = Date.now(); G.events.emit('discovered', def); }
    this._apply(inst);
    if (loc === 'world') this._rebuildColliders();
    G.events.emit('inventoryChanged');
    queueSave();
    return inst;
  }

  destroy(inst) {
    if (G.hand.held === inst) G.hand.release(true);
    G.physics?.remove(inst);
    inst.dispose();
    this.list = this.list.filter((i) => i !== inst);
    this.byUid.delete(inst.uid);
    G.state.items = G.state.items.filter((r) => r !== inst.data);
    // detach anything parented on it
    for (const i of this.list) if (i.data.parent === inst.uid) i.data.parent = null;
    this._rebuildColliders();
    G.events.emit('inventoryChanged');
    queueSave();
  }

  // ------------------------------------------------------------ locations
  setLoc(inst, loc, extra = {}) {
    const prev = inst.data.loc;
    inst.data.loc = loc;
    Object.assign(inst.data, extra);
    if (loc !== 'world') inst.data.parent = null;
    this._apply(inst);
    if (prev === 'world' || loc === 'world') this._rebuildColliders();
    G.events.emit('inventoryChanged');
    queueSave();
  }

  toStorage(inst, quiet = false) {
    const def = inst.def;
    let loc = 'storage';
    if (def.use?.type === 'wear') loc = 'wardrobe';
    if (G.hand.held === inst) G.hand.release(true);
    this.setLoc(inst, loc, { slot: undefined });
    if (!quiet) { G.ui.toast(`${def.name} → ${loc === 'wardrobe' ? 'Wardrobe' : 'Storage'}`, { icon: loc === 'wardrobe' ? '👕' : '📦' }); G.audio.play('rustle'); }
  }

  toContainer(inst, container) {
    const slot = container.freeSlot();
    if (slot < 0) return false;
    if (G.hand.held === inst) G.hand.release(true);
    this.setLoc(inst, container.id, { slot });
    return true;
  }

  toWorld(inst, pos, quat, parentUid = null) {
    inst.data.pos = [pos.x, pos.y, pos.z];
    inst.data.rot = [quat.x, quat.y, quat.z, quat.w];
    inst.data.parent = parentUid;
    this.setLoc(inst, 'world');
  }

  _apply(inst) {
    const loc = inst.data.loc;
    if (ABSTRACT.has(loc) || loc === 'hand') {
      if (inst.built && loc !== 'hand') { G.behaviors.onLeaveWorld?.(inst); inst.object.parent?.remove(inst.object); }
      if (loc !== 'hand' && inst.built && !inst.def.keepBuilt) inst.dispose();
      return;
    }
    if (loc === 'world') {
      const o = inst.object;
      this.root.add(o);
      setLayers(o, 0);
      o.position.fromArray(inst.data.pos || [0, 0, 0]);
      if (inst.data.rot) o.quaternion.fromArray(inst.data.rot); else o.quaternion.identity();
      o.scale.setScalar(1);
      if (inst.blob) inst.blob.visible = true;
      G.behaviors.onEnterWorld?.(inst);
      return;
    }
    const c = CONTAINERS[loc];
    if (c && c.physical) {
      const o = inst.object;
      c.parent.add(o);
      setLayers(o, 0);
      const sp = c.slots[inst.data.slot ?? 0] || c.slots[0];
      o.position.copy(sp);
      o.quaternion.identity();
      const b = defBounds(inst.def);
      const k = Math.min(1, c.slotSize[0] / Math.max(0.01, b.size.x), c.slotSize[1] / Math.max(0.01, b.size.y), c.slotSize[2] / Math.max(0.01, b.size.z));
      o.scale.setScalar(k);
      if (inst.blob) inst.blob.visible = false;
      G.behaviors.onLeaveWorld?.(inst);
      return;
    }
    if (c) { // abstract container
      if (inst.built) { G.behaviors.onLeaveWorld?.(inst); inst.object.parent?.remove(inst.object); inst.dispose(); }
    }
  }

  // ------------------------------------------------------------ colliders / raycast meshes
  _rebuildColliders() {
    this.colliders.length = 0;
    this.rugs.length = 0;
    this._meshCache = null;
    for (const inst of this.list) {
      inst.footprint = null;
      if (inst.data.loc !== 'world' || !inst.built) continue;
      const def = inst.def;
      const b = defBounds(def);
      const o = inst.object;
      o.updateMatrixWorld(true);
      const box = b.box.clone().applyMatrix4(o.matrixWorld);
      inst.footprint = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, minY: box.min.y, maxY: box.max.y };
      if (def.tags.includes('rug')) { this.rugs.push(inst); continue; }
      if (!def.furniture || def.noCollide || b.size.y < 0.25 || def.place === 'wall') continue;
      const shrink = 0.06;
      const c = { minX: box.min.x + shrink, maxX: box.max.x - shrink, minZ: box.min.z + shrink, maxZ: box.max.z - shrink, enabled: true, tag: 'item', item: inst, yMax: box.max.y };
      if (c.maxX > c.minX && c.maxZ > c.minZ) this.colliders.push(c);
    }
  }
  refreshColliders() { this._rebuildColliders(); }

  // meshes of world items (for placement / physics raycasts)
  worldMeshes(exclude = null) {
    if (!this._meshCache) {
      this._meshCache = [];
      for (const inst of this.list) {
        if (inst.data.loc !== 'world' || !inst.built) continue;
        inst.object.traverse((m) => { if (m.isMesh && !m.userData.noBounds && m.visible) { m.userData.ownerUid = inst.uid; this._meshCache.push(m); } });
      }
    }
    if (!exclude) return this._meshCache;
    return this._meshCache.filter((m) => m.userData.ownerUid !== exclude.uid && !isDescendantOfUid(m, exclude));
  }
  invalidateMeshes() { this._meshCache = null; }

  // ------------------------------------------------------------ actions
  actionsFor(inst) {
    const def = inst.def;
    const loc = inst.data.loc;
    const acts = [];
    const held = G.hand.held;
    if (loc === 'world') {
      const beh = G.behaviors.worldActions(inst) || [];
      for (const a of beh) acts.push(a);
      const used = new Set(acts.map((a) => a.key));
      if (def.furniture || def.place === 'wall') {
        acts.push({ key: used.has('F') ? 'R' : 'F', label: def.place === 'wall' ? 'Move' : 'Move', run: () => G.placement.begin(inst, { from: 'world' }) });
      } else {
        const k = used.has('E') ? 'F' : 'E';
        if (!used.has(k)) acts.push({ key: k, label: held ? 'Swap with held item' : 'Pick up', run: () => this.pickUp(inst) });
      }
      acts.push({ key: 'X', label: 'Store', run: () => this.toStorage(inst), hold: def.furniture ? 0.5 : 0 });
    } else if (CONTAINERS[loc]) {
      acts.push({ key: 'E', label: 'Take', run: () => this.pickUp(inst) });
      const beh = G.behaviors.containerActions?.(inst) || [];
      acts.push(...beh);
    }
    return acts;
  }

  pickUp(inst) {
    if (inst.def.furniture) { G.placement.begin(inst, { from: inst.data.loc === 'world' ? 'world' : 'storage' }); return; }
    const held = G.hand.held;
    if (held && held !== inst) {
      this.toStorage(held, true);
      G.ui.toast(`Stashed ${held.def.name} in storage`, { icon: '📦' });
    }
    // anything resting on it stays where it is (parent link cleared)
    for (const i of this.list) if (i.data.parent === inst.uid) i.data.parent = null;
    G.physics?.remove(inst);
    G.hand.take(inst);
    G.audio.play('paper', { volume: 0.4 });
  }

  update(dt) {
    for (const inst of this.list) {
      if (inst.built && (inst.data.loc === 'world' || inst.data.loc === 'hand' || CONTAINERS[inst.data.loc]?.physical)) G.behaviors.update(inst, dt);
    }
  }

  // items resting on a given furniture item (to move together)
  childrenOf(inst) { return this.list.filter((i) => i.data.parent === inst.uid && i.data.loc === 'world'); }
}

export function setLayers(obj, layer) {
  obj.traverse((o) => { if (!o.isLight) o.layers.set(layer); });
}
function isDescendantOfUid(m, inst) {
  let o = m;
  while (o) { if (o.userData?.item === inst) return true; o = o.parent; }
  return false;
}
export { CONTAINERS };
