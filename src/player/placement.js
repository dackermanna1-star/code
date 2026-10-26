// Placement mode: position held items on surfaces, hang art on walls, and
// move furniture around with rotation and collision feedback.
import * as THREE from 'three';
import { G } from '../game.js';
import { defBounds } from '../items/registry.js';
import { setLayers } from '../items/manager.js';
import { roomAt } from '../world/apartment.js';

const _ray = new THREE.Raycaster();
const UP = new THREE.Vector3(0, 1, 0);

export class Placement {
  constructor() {
    this.active = false;
    this.inst = null;
    this.yaw = 0;
    this.valid = false;
    this.from = null;
    this.children = [];
  }

  begin(inst, { from = 'hand' } = {}) {
    if (this.active) this.cancel();
    const def = inst.def;
    defBounds(def);
    this.active = true;
    this.inst = inst;
    this.from = from;
    const o = inst.object;
    this.orig = { pos: o.position.clone(), quat: o.quaternion.clone(), parent: inst.data.parent, loc: inst.data.loc };
    if (from !== 'world') {
      if (from === 'hand') G.hand.release(true);
      o.parent?.remove(o);
      G.items.root.add(o);
      o.scale.setScalar(1);
      this.yaw = G.player.yaw + Math.PI; // face the player
    } else {
      const e = new THREE.Euler().setFromQuaternion(o.quaternion, 'YXZ');
      this.yaw = e.y;
      // carry items resting on this furniture along
      this.children = G.items.childrenOf(inst).map((c) => {
        const co = c.object;
        const local = co.position.clone().sub(o.position).applyAxisAngle(UP, -this.yaw);
        const relYaw = new THREE.Euler().setFromQuaternion(co.quaternion, 'YXZ').y - this.yaw;
        return { inst: c, local, relYaw, y: co.position.y - o.position.y };
      });
    }
    setLayers(o, 0);
    if (inst.blob) inst.blob.visible = true;
    // remove from colliders while moving
    inst.data.loc = 'placing';
    G.items.refreshColliders();
    G.items.invalidateMeshes();
    this._setGhost(true);
    G.ui.setPlacementHelp(def);
    G.audio.play('ui', { pitch: 0.8 });
  }

  _setGhost(on) {
    // light transparency so you can see what's underneath while positioning
    this.inst.object.traverse((m) => {
      if (!m.isMesh || m.userData.noBounds) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (on) {
        m.userData._origMat = m.material;
        const clones = mats.map((mm) => { const c = mm.clone(); c.transparent = true; c.opacity = Math.min(mm.opacity ?? 1, 0.72); c.depthWrite = true; return c; });
        m.material = Array.isArray(m.material) ? clones : clones[0];
      } else if (m.userData._origMat) {
        const cur = Array.isArray(m.material) ? m.material : [m.material];
        cur.forEach((c) => c.dispose());
        m.material = m.userData._origMat;
        delete m.userData._origMat;
      }
    });
  }

  update(dt) {
    if (!this.active) return;
    const inp = G.input;
    const def = this.inst.def;
    const o = this.inst.object;
    // rotation controls
    if (inp.wheel) this.yaw += inp.wheel * (Math.PI / 12);
    if (inp.wasPressed('KeyQ')) this.yaw += Math.PI / 4;
    if (inp.wasPressed('KeyR')) this.yaw -= Math.PI / 4;
    // raycast
    const cam = G.camera;
    _ray.setFromCamera(new THREE.Vector2(0, 0), cam);
    _ray.far = def.furniture ? 6 : 3.2;
    const targets = G.apartment.solids.concat(G.items.worldMeshes(this.inst));
    const hits = _ray.intersectObjects(targets, false).filter((h) => h.face && !this._isChild(h.object));
    const hit = hits[0];
    this.valid = false;
    this.parentUid = null;
    if (hit) {
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      const p = hit.point.clone();
      const b = defBounds(def);
      if (def.place === 'wall') {
        if (Math.abs(n.y) < 0.3 && hit.object.userData.wall !== false) {
          const yaw = Math.atan2(n.x, n.z);
          o.position.copy(p).addScaledVector(n, -b.box.min.z + 0.003);
          // keep wall items from sinking into the floor
          o.position.y = Math.max(o.position.y - b.center.y, 0.15);
          o.quaternion.setFromAxisAngle(UP, yaw);
          this.valid = this._roomOk(p) && hit.distance > 0.3;
        } else {
          o.position.copy(p).addScaledVector(n, 0.1);
          o.quaternion.setFromAxisAngle(UP, G.player.yaw);
        }
      } else if (n.y > 0.7) {
        const onFloor = hit.object.name?.startsWith('floor_') || hit.object.userData.step;
        o.position.copy(p);
        o.quaternion.setFromAxisAngle(UP, this.yaw);
        if (def.place === 'floor' && !onFloor && !def.tags.includes('anywhere')) {
          this.valid = false;
        } else {
          this.valid = this._roomOk(p) && !this._collides(o, def);
        }
        // remember what it's resting on
        let ob = hit.object;
        while (ob) { if (ob.userData?.item) { this.parentUid = ob.userData.item.uid; break; } ob = ob.parent; }
      } else {
        // pointing at a wall with a floor/surface item: slide along it
        const back = p.clone().addScaledVector(n, Math.max(defBounds(def).size.x, defBounds(def).size.z) * 0.5 + 0.02);
        back.y = 0;
        o.position.copy(back);
        o.quaternion.setFromAxisAngle(UP, this.yaw);
        this.valid = def.place === 'floor' && this._roomOk(back) && !this._collides(o, def);
      }
    } else {
      // nothing in reach: float in front of the player
      const f = G.camera.getWorldDirection(new THREE.Vector3());
      o.position.copy(G.camera.position).addScaledVector(f, 1.6);
      o.position.y = Math.max(0, o.position.y - 0.5);
      o.quaternion.setFromAxisAngle(UP, this.yaw);
    }
    // move carried children
    for (const c of this.children) {
      const co = c.inst.object;
      co.position.copy(c.local).applyAxisAngle(UP, this.yaw).add(o.position);
      co.position.y = o.position.y + c.y;
      co.quaternion.setFromAxisAngle(UP, this.yaw + c.relYaw);
    }
    G.engine.setOutline([o]);
    G.engine.outlinePass && G.engine.outlinePass.visibleEdgeColor.set(this.valid ? '#5dff9b' : '#ff4d4d');
    G.ui.setPlacementValid(this.valid);
    // confirm / cancel
    if (inp.wasPressed('Mouse0') || inp.wasPressed('KeyF') || inp.wasPressed('KeyE')) {
      inp.consume('KeyE'); inp.consume('KeyF'); inp.consume('Mouse0');
      if (this.valid) this.confirm(); else G.audio.play('error');
    } else if (inp.wasPressed('Mouse2') || inp.wasPressed('Escape') || inp.wasPressed('KeyG')) {
      inp.consume('Mouse2'); inp.consume('KeyG');
      this.cancel();
    }
  }

  _isChild(obj) {
    let o = obj;
    while (o) {
      if (o.userData?.item && this.children.some((c) => c.inst === o.userData.item)) return true;
      o = o.parent;
    }
    return false;
  }

  _roomOk(p) {
    const r = roomAt(p.x, p.z);
    return r !== 'outside' && r !== 'corridor';
  }

  _collides(o, def) {
    if (!def.furniture || def.tags.includes('rug') || def.noCollide) return false;
    const b = defBounds(def);
    o.updateMatrixWorld(true);
    const box = b.box.clone().applyMatrix4(o.matrixWorld);
    const s = 0.04;
    const test = (c) => box.max.x - s > c.minX && box.min.x + s < c.maxX && box.max.z - s > c.minZ && box.min.z + s < c.maxZ && (c.yMax ?? 3) > box.min.y + 0.05;
    for (const c of G.apartment.colliders) if (c.enabled && test(c) && c.tag !== 'threshold') return true;
    for (const c of G.items.colliders) if (test(c)) return true;
    // walls via bounds
    if (box.min.x < -7 || box.max.x > 7 || box.min.z < -5 || box.max.z > 5) return true;
    return false;
  }

  confirm() {
    const inst = this.inst;
    const o = inst.object;
    this._setGhost(false);
    this.active = false;
    G.engine.setOutline([]);
    G.engine.outlinePass && G.engine.outlinePass.visibleEdgeColor.set('#ffffff');
    G.items.toWorld(inst, o.position.clone(), o.quaternion.clone(), inst.def.furniture ? null : this.parentUid);
    for (const c of this.children) G.items.toWorld(c.inst, c.inst.object.position.clone(), c.inst.object.quaternion.clone(), inst.uid);
    this.children = [];
    const big = inst.def.furniture;
    G.audio.play('thud', { pos: o.position, soft: !big, impact: big ? 0.9 : 0.4, pitch: big ? 0.7 : 1.3 });
    if (big) G.particles.soft.emit({ pos: o.position.clone().add(new THREE.Vector3(0, 0.05, 0)), count: 14, velRand: 1.2, vel: { x: 0, y: 0.15, z: 0 }, life: 0.9, size: 0.08, sizeEnd: 0.35, color: '#e8e2d8', alpha: 0.25 });
    G.state.stats.itemsPlaced++;
    G.events.emit('act', 'place', { item: inst.def.id, wall: inst.def.place === 'wall', furniture: big });
    G.ui.setPlacementHelp(null);
    this.inst = null;
  }

  cancel() {
    const inst = this.inst;
    if (!inst) return;
    this._setGhost(false);
    this.active = false;
    G.engine.setOutline([]);
    G.engine.outlinePass && G.engine.outlinePass.visibleEdgeColor.set('#ffffff');
    G.ui.setPlacementHelp(null);
    if (this.from === 'hand') {
      inst.data.loc = 'storage';
      G.hand.take(inst);
    } else if (this.from === 'storage') {
      inst.object.parent?.remove(inst.object);
      inst.data.loc = 'world';
      G.items.setLoc(inst, 'storage');
    } else {
      inst.object.position.copy(this.orig.pos);
      inst.object.quaternion.copy(this.orig.quat);
      for (const c of this.children) {
        // restore children to original relative spots
        const co = c.inst.object;
        const e = new THREE.Euler().setFromQuaternion(this.orig.quat, 'YXZ');
        co.position.copy(c.local).applyAxisAngle(UP, e.y).add(this.orig.pos);
        co.position.y = this.orig.pos.y + c.y;
        co.quaternion.setFromAxisAngle(UP, e.y + c.relYaw);
      }
      G.items.toWorld(inst, this.orig.pos, this.orig.quat, this.orig.parent);
    }
    this.children = [];
    this.inst = null;
  }
}
