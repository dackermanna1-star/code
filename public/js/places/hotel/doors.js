// Doors, the elevators and the places you can hide. A door is a hinged
// panel (merged into three meshes: wood, brass, its number plate) with a
// collision part that only collides while it's shut, a frame in the wall,
// and an "Open / Close / Locked" interaction on both sides. The Night
// Manager bursts them open. The elevators have sliding brass doors, a dial
// with an arrow, and a car behind (that only he rides). Wardrobes and
// lockers are hiding places: you step in and the doors close on you.
import * as THREE from 'three';
import { H } from './state.js';
import { bake, boxGeo, M4, cylGeo, sphereGeo } from './kit.js';
import { flat } from './materials.js';
import { sign } from './textures.js';

const DEG = Math.PI / 180;

/** A world-space frame around a doorway (casing on both faces, jamb lining). */
export function doorFrame(axis, cx, cz, y, w, h, t = 1, mat = H.M.woodDark, o = {}) {
  const k = H.kit, cw = 0.55, ct = 0.22;
  const B = (u0, u1, y0, y1, d0, d1, m = mat) => (axis === 'x' ? k.box(cx + u0, cx + u1, y0, y1, cz + d0, cz + d1, m, { cast: false }) : k.box(cx + d0, cx + d1, y0, y1, cz + u0, cz + u1, m, { cast: false }));
  for (const s of [-1, 1]) {
    const d0 = s * t / 2, d1 = s * (t / 2 + ct);
    B(-w / 2 - cw, -w / 2, y, y + h + cw, Math.min(d0, d1), Math.max(d0, d1));
    B(w / 2, w / 2 + cw, y, y + h + cw, Math.min(d0, d1), Math.max(d0, d1));
    B(-w / 2 - cw, w / 2 + cw, y + h, y + h + cw, Math.min(d0, d1), Math.max(d0, d1));
    if (o.cap !== false) { const e0 = s * t / 2, e1 = s * (t / 2 + ct + 0.25); B(-w / 2 - cw - 0.25, w / 2 + cw + 0.25, y + h + cw, y + h + cw + 0.3, Math.min(e0, e1), Math.max(e0, e1)); }
  }
  // the lining inside the opening
  B(-w / 2, -w / 2 + 0.12, y, y + h, -t / 2, t / 2); B(w / 2 - 0.12, w / 2, y, y + h, -t / 2, t / 2); B(-w / 2, w / 2, y + h - 0.12, y + h, -t / 2, t / 2);
}

export class Door {
  /**
   * o: {x, y, z (centre of the doorway at floor level), axis 'x' (in a wall along x) | 'z',
   *     w, h, hinge -1|1 (which end), swing -1|1 (opens toward -/+ of the wall's normal axis),
   *     style 'guest'|'staff'|'metal'|'plain'|'double'|'glass', number (plate text), plate -1|1 (which face),
   *     name, locked, key (item id), lockedMsg, wall: thickness, frame: false, noFrame}
   */
  constructor(o) {
    const k = H.kit, M = H.M;
    this.o = o;
    this.name = o.name || (o.number ? `Room ${o.number}` : 'Door');
    const w = o.w ?? 4, h = o.h ?? 8.4;
    this.w = w; this.h = h;
    this.locked = !!o.locked; this.key = o.key || null;
    this.angle = 0; this.target = 0; this.speed = 2.2; this.isOpen = false;
    this.center = new THREE.Vector3(o.x, o.y, o.z);
    this.normal = o.axis === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    if (o.frame !== false) doorFrame(o.axis, o.x, o.z, o.y, w, h, o.wall ?? 1, o.frameMat || M.woodDark);
    const leaves = o.style === 'double' || o.double ? [[-1, w / 2], [1, w / 2]] : [[o.hinge ?? -1, w]];
    this.leaves = [];
    for (const [hinge, lw] of leaves) {
      const pivot = new THREE.Group();
      const hu = hinge * w / 2;
      if (o.axis === 'x') pivot.position.set(o.x + hu, o.y, o.z); else pivot.position.set(o.x, o.y, o.z + hu);
      pivot.rotation.y = o.axis === 'x' ? 0 : -Math.PI / 2;
      const inner = new THREE.Group(); pivot.add(inner);
      const meshes = this._leafMeshes(lw, h, hinge, o);
      for (const m of meshes) { m.castShadow = m.material !== M.glass; m.receiveShadow = true; inner.add(m); }
      H.world.scene.add(pivot);
      const localSwing = o.axis === 'x' ? (o.swing ?? 1) : -(o.swing ?? 1);
      this.leaves.push({ pivot, inner, hinge, sign: localSwing * hinge, lw });
    }
    // collision while shut
    if (o.axis === 'x') this.col = k.solid(o.x - w / 2, o.x + w / 2, o.y, o.y + h, o.z - 0.2, o.z + 0.2, { name: 'Door' });
    else this.col = k.solid(o.x - 0.2, o.x + 0.2, o.y, o.y + h, o.z - w / 2, o.z + w / 2, { name: 'Door' });
    this.col.userData.door = this;
    // use it from either side
    this.handles = [];
    if (!o.noUse) for (const s of [-1, 1]) {
      const pos = this.center.clone().addScaledVector(this.normal, s * 1.1).setY(o.y + 3.8);
      this.handles.push(H.interact.add({
        pos, r: 4.2, door: this,
        label: () => (this.locked ? `${this.name}` : this.isOpen ? 'Close' : 'Open'),
        verb: () => (this.locked ? 'Locked' : null),
        act: () => this.use(),
      }));
    }
    H.doors.push(this);
  }

  _leafMeshes(lw, h, hinge, o) {
    const M = H.M, style = o.style || 'guest';
    const wood = [], brass = [], plate = [];
    const off = -hinge * lw / 2; // the leaf's centre, from the hinge
    const sw = lw - 0.12, sh = h - 0.1, th = style === 'metal' ? 0.25 : 0.3;
    const glass = [];
    if (style === 'glass') {
      // stiles and rails round a tall pane of glass
      const st = 0.55, br = h * 0.28, tr = 0.7;
      wood.push([boxGeo(sw, br, th), M4(off, br / 2, 0)], [boxGeo(sw, tr, th), M4(off, h - 0.05 - tr / 2, 0)]);
      for (const sx of [-1, 1]) wood.push([boxGeo(st, sh, th), M4(off + sx * (sw / 2 - st / 2), h / 2, 0)]);
      glass.push([boxGeo(sw - st * 2, h - br - tr - 0.05, 0.06), M4(off, br + (h - br - tr - 0.05) / 2, 0)]);
      for (const z of [th / 2 + 0.02, -th / 2 - 0.02]) brass.push([boxGeo(sw - st * 2 + 0.1, 0.12, 0.04), M4(off, br, z)], [boxGeo(sw - st * 2 + 0.1, 0.12, 0.04), M4(off, h - tr, z)]);
    } else wood.push([boxGeo(sw, sh, th, [4, 4]), M4(off, h / 2, 0)]);
    if (style !== 'metal' && style !== 'freezer' && style !== 'glass') {
      for (const z of [th / 2 + 0.03, -th / 2 - 0.03]) {
        const pw = sw - (style === 'double' ? 0.7 : 1.1);
        if (style === 'glass') { brass.push([boxGeo(pw + 0.2, sh * 0.55 + 0.2, 0.05), M4(off, h * 0.62, z)]); }
        else {
          wood.push([boxGeo(pw, sh * 0.42, 0.06), M4(off, h * 0.68, z)]);
          wood.push([boxGeo(pw, sh * 0.3, 0.06), M4(off, h * 0.23, z)]);
        }
      }
    } else {
      // a riveted metal door with a push bar or a big freezer latch
      for (const z of [th / 2 + 0.02, -th / 2 - 0.02]) brass.push([boxGeo(sw * 0.9, 0.2, 0.06), M4(off, h * 0.48, z)]);
    }
    // knobs and plates on both faces, near the free edge
    const kx = off - hinge * (sw / 2 - 0.45);
    for (const s of [1, -1]) {
      brass.push([boxGeo(0.32, 0.95, 0.05), M4(kx, 3.6, s * (th / 2 + 0.02))]);
      brass.push([sphereGeo(0.2, 10), M4(kx, 3.55, s * (th / 2 + 0.28))]);
      brass.push([cylGeo(0.06, 0.06, 0.26, 6), M4(kx, 3.55, s * (th / 2 + 0.13), Math.PI / 2, 0, 0)]);
    }
    if (o.number || o.plateText) {
      const s = o.plate ?? 1;
      plate.push([boxGeo(1.3, 0.55, 0.04, [1, 1], { uv: 'local' }), M4(off, 6.4, s * (th / 2 + 0.03), 0, s < 0 ? Math.PI : 0, 0)]);
      brass.push([cylGeo(0.07, 0.07, 0.1, 8), M4(off, 5.35, s * (th / 2 + 0.05), Math.PI / 2, 0, 0)]); // peephole
    }
    const out = [new THREE.Mesh(bake(wood), o.leafMat || (style === 'metal' || style === 'freezer' ? M.steel : M.woodDark)), new THREE.Mesh(bake(brass), M.brass)];
    if (glass.length) { const g = new THREE.Mesh(bake(glass), M.glass); g.renderOrder = 3; out.push(g); }
    if (o.hanger) {
      // a card hung on the handle
      const s = o.plate ?? 1;
      const card = new THREE.Mesh(bake([[boxGeo(0.7, 1.3, 0.02, [1, 1], { uv: 'local' }), M4(kx, 2.75, s * (th / 2 + 0.36), 0.05, s < 0 ? Math.PI : 0, 0.04)]]), flat(sign(o.hanger.replace(/ (?=DO)/, '\n').replace(/ (?=DISTURB)/, '\n'), { w: 96, h: 176, style: 'enamel', bg: '#e8dcc0', fg: '#7a1010' }), { rough: 0.9 }));
      out.push(card);
    }
    if (plate.length) {
      const tex = sign(o.plateText || String(o.number), { w: 192, h: 80, style: o.plateStyle || 'brass' });
      out.push(new THREE.Mesh(bake(plate), flat(tex, { rough: 0.4, metal: 0.6 })));
    }
    return out;
  }

  get openAmount() { return Math.abs(this.angle); }
  /** The player uses it. */
  use() {
    if (this.locked) {
      if (this.key && H.inv?.has(this.key)) {
        this.locked = false;
        H.ui?.toast(`Unlocked with the ${H.items?.[this.key]?.name || 'key'}.`);
        H.audio?.unlock(this.center);
        this.o.onUnlock?.();
        this.setOpen(true);
        return;
      }
      H.audio?.locked(this.center);
      H.ui?.toast(typeof this.o.lockedMsg === 'function' ? this.o.lockedMsg() : (this.o.lockedMsg || "It's locked."));
      this.o.onTry?.();
      H.noise?.(this.center, 5);
      return;
    }
    this.setOpen(!this.isOpen);
  }
  setOpen(open, fast = false) {
    if (open === this.isOpen && !fast) return;
    this.isOpen = open;
    this.speed = fast ? 9 : 2.4;
    this.target = open ? 1 : 0;
    if (fast) { H.audio?.doorSlam(this.center); H.noise?.(this.center, 24); H.shake?.(this.center, 0.6); }
    else if (open) { H.audio?.doorOpen(this.center); H.noise?.(this.center, 9); }
    else { H.audio?.doorClose(this.center); H.noise?.(this.center, 11); }
    if (open) this.o.onOpen?.();
  }
  /** The Night Manager doesn't knock. */
  burst() { if (!this.isOpen) { this.locked = false; this.setOpen(true, true); } }
  update(dt) {
    const want = this.target;
    if (Math.abs(this.angle - want) < 1e-4) return;
    const step = dt * this.speed * (this.speed > 4 ? 1 : 0.6 + 0.4 * Math.sin(Math.min(1, Math.abs(this.angle - want)) * Math.PI));
    this.angle += Math.sign(want - this.angle) * Math.min(Math.abs(want - this.angle), step);
    const a = this.angle * (this.o.maxAngle ?? 100) * DEG;
    for (const L of this.leaves) L.inner.rotation.y = L.sign * a;
    this.col.setCanCollide(this.angle < 0.12);
  }
}

/** The elevator on one floor: sliding brass doors, the dial with its arrow, the car behind. */
export class Elevator {
  constructor(o) {
    const k = H.kit, M = H.M;
    this.o = o; this.floor = o.floor;
    const { x, y, z } = o; // centre of the doorway, on the lobby side of the wall (wall along x at z, car toward -z)
    const w = 5, h = 8.4;
    this.pos = new THREE.Vector3(x, y, z);
    this.inside = new THREE.Vector3(x, y, z - 4.5);
    // the art-deco surround
    k.box(x - w / 2 - 1.1, x + w / 2 + 1.1, y + h, y + h + 1.2, z, z + 0.35, M.brass, { cast: false });
    for (const s of [-1, 1]) k.box(x + s * (w / 2 + 0.55) - 0.55, x + s * (w / 2 + 0.55) + 0.55, y, y + h, z, z + 0.3, M.brass, { cast: false });
    k.box(x - 1.6, x + 1.6, y + h + 1.2, y + h + 2.9, z, z + 0.2, M.woodDark, { cast: false });
    // the dial (texture) and its arrow
    const dialTex = flat(H.T.dial(), { rough: 0.4, emissive: 0.15 });
    H.kit.at(x, y + h + 2.05, z + 0.22, 0).box(0, 0, 0, 2.6, 1.3, 0.05, dialTex, { uv: 'local', cast: false, faces: ['pz'] });
    this.arrow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.04).translate(0, 0.47, 0), M.black);
    this.arrow.position.set(x, y + h + 1.45, z + 0.28);
    H.world.scene.add(this.arrow);
    this.setFloor(o.shown ?? 3);
    // the doors
    this.panels = [];
    for (const s of [-1, 1]) {
      const g = bake([[boxGeo(w / 2, h, 0.2), M4(0, h / 2, 0)], [boxGeo(w / 2 - 0.5, h - 1.2, 0.04), M4(0, h / 2, 0.12)], [boxGeo(0.08, h - 1.2, 0.06), M4(-s * (w / 4 - 0.1), h / 2, 0.13)]]);
      const m = new THREE.Mesh(g, M.brass); m.castShadow = true; m.receiveShadow = true;
      m.position.set(x + s * w / 4, y, z - 0.1);
      H.world.scene.add(m);
      this.panels.push({ m, s, x0: x + s * w / 4 });
    }
    this.col = k.solid(x - w / 2, x + w / 2, y, y + h, z - 0.3, z + 0.1, { name: 'Door' });
    this.open = 0; this.target = 0;
    // the car: wood panels, a mirror, a brass rail, a bulb
    const cz0 = z - 9, cz1 = z - 0.3, cx0 = x - 4, cx1 = x + 4;
    k.floor(cx0, cx1, cz0, cz1, y, M.carpetRed);
    k.ceiling(cx0, cx1, cz0, cz1, y + 10, M.woodDark);
    k.wall('z', cx0, cz0, cz1, y, y + 10, { pos: M.panel, neg: null, t: 0.4 });
    k.wall('z', cx1, cz0, cz1, y, y + 10, { neg: M.panel, pos: null, t: 0.4 });
    k.wall('x', cz0, cx0, cx1, y, y + 10, { pos: M.mirror, neg: null, t: 0.4 });
    k.at(x, y, cz0 + 0.5, 0).box(0, 3.6, 0, 7.6, 0.2, 0.3, M.brass);
    for (const s of [-1, 1]) k.at(x + s * 3.6, y, (cz0 + cz1) / 2, 0).box(0, 3.6, 0, 0.3, 0.2, 8, M.brass);
    this.light = H.lights.add({ pos: new THREE.Vector3(x, y + 9.2, (cz0 + cz1) / 2), color: 0xffc890, power: 22, range: 14, circuit: 'event', flicker: 0.3, halo: 1.2 });
    this.light.on = false;
    H.lights.glow(this.light, 'bowl', M4(x, y + 9.9, (cz0 + cz1) / 2, Math.PI, 0, 0, 0.7), 0.8);
    H.interact.add({ pos: new THREE.Vector3(x + w / 2 + 1.2, y + 4, z + 0.8), r: 4, label: () => 'Call the elevator', act: () => { H.audio?.button(this.pos); H.ui?.toast(H.power ? "It won't come. Something is holding it." : 'No power. The button is dead.'); } });
    H.elevators.push(this);
  }
  setFloor(f) { this.shownFloor = f; this.arrowTarget = (f / 3 - 0.5) * Math.PI * 0.75 * -1 + (0); this.arrow.rotation.z = -((f + 0.5) / 4 - 0.5) * Math.PI * 0.95; }
  setOpen(on) {
    if ((this.target > 0.5) === on) return;
    this.target = on ? 1 : 0;
    H.audio?.elevatorDoors(this.pos);
    if (on) this.light.on = true;
  }
  update(dt) {
    if (Math.abs(this.open - this.target) > 1e-3) {
      this.open += Math.sign(this.target - this.open) * Math.min(Math.abs(this.target - this.open), dt * 0.55);
      for (const p of this.panels) p.m.position.x = p.x0 + p.s * this.open * 2.4;
      this.col.setCanCollide(this.open < 0.7);
      if (this.open <= 0.001) this.light.on = false;
    }
  }
}

/** A wardrobe or locker you can hide in. */
export class HidingSpot {
  constructor(o) {
    // o: {front (where you stand to get in), inside (eye), yaw (facing out), leaves: [{pivot, sign}], name, node}
    Object.assign(this, o);
    this.open = 0; this.target = 0; this.occupied = false;
    this.useHandle = H.interact.add({ pos: o.front.clone().setY(o.front.y + 3.6), r: 4.2, spot: this, label: () => 'Hide', act: () => H.player?.hide(this) });
    H.spots.push(this);
  }
  setOpen(v, speed = 3) { this.target = v; this.speed = speed; }
  update(dt) {
    if (Math.abs(this.open - this.target) < 1e-3) return;
    this.open += Math.sign(this.target - this.open) * Math.min(Math.abs(this.target - this.open), dt * (this.speed || 3));
    for (const L of this.leaves) L.pivot.rotation.y = L.base + L.sign * this.open * 1.7;
  }
}
