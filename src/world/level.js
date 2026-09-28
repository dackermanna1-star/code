// Level: builder API used by chapter scripts, plus runtime container for the
// static world (merged meshes, collision, navigation, lights, triggers, spawns).
import * as THREE from 'three';
import { CollisionWorld, F_DEFAULT, F_SOLID, F_SHOOT, F_SIGHT } from './collision.js';
import { Bucket, pushBox, pushGeometry, FACE_ALL, tintArray, trs, unitBox, unitCyl } from './geom.js';
import { materials } from '../render/materials.js';
import { NavGrid } from './nav.js';

const SECTOR = 28;

export class Level {
  constructor(game, def = {}) {
    this.game = game;
    this.def = def;
    this.name = def.name || 'Level';
    this.col = new CollisionWorld();
    this.root = new THREE.Group();
    this.root.name = 'level';
    this.buckets = new Map();
    this.meshes = [];
    this.lights = []; // virtual lights {x,y,z,color,intensity,range,flicker,on}
    this.triggers = [];
    this.timers = [];
    this.survivorStart = [];
    this.itemSpawns = []; // {type, x,y,z, group, chance}
    this.fixedItems = [];
    this.specialSpots = [];
    this.hordeSpots = []; // {x,y,z, name}
    this.witchSpots = [];
    this.tankSpots = [];
    this.doors = [];
    this.dynamics = []; // updatable level objects {update(dt)}
    this.reverbZones = []; // {box:[...], preset}
    this.ambientZones = [];
    this.startSafe = null; // [x0,y0,z0,x1,y1,z1]
    this.endSafe = null;
    this.endDoor = null;
    this.flowPath = [];
    this.bounds = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
    this.env = Object.assign({
      fog: 0x0a0c10, fogDensity: 0.03, hemiSky: 0x303848, hemiGround: 0x141210, hemiIntensity: 0.35,
      moon: null, // {dir:[x,y,z], color, intensity, shadow:true}
      sky: 'city', exposure: 1.0, reverb: 'outdoor',
    }, def.env || {});
    this.nav = null;
    this.objective = '';
    this.hazards = []; // {box, dps, type}
    this.killZones = []; // falling death volumes
    this.ladders = [];
    this.time = 0;
    this.script = null;
  }

  // ------------------------------------------------------------ builders --
  bucket(mat, x, z) {
    const sx = Math.floor(x / SECTOR), sz = Math.floor(z / SECTOR);
    const key = mat + '|' + sx + ',' + sz;
    let b = this.buckets.get(key);
    if (!b) {
      b = new Bucket();
      b.mat = mat;
      this.buckets.set(key, b);
    }
    return b;
  }
  _expand(x0, y0, z0, x1, y1, z1) {
    const b = this.bounds;
    b.minX = Math.min(b.minX, x0, x1); b.maxX = Math.max(b.maxX, x0, x1);
    b.minY = Math.min(b.minY, y0, y1); b.maxY = Math.max(b.maxY, y0, y1);
    b.minZ = Math.min(b.minZ, z0, z1); b.maxZ = Math.max(b.maxZ, z0, z1);
  }

  // Axis aligned box, visual + collision.
  // opts: {collide=true, flags, tint, faces, scale, visible=true, surf, ao}
  box(x0, y0, z0, x1, y1, z1, mat = 'concrete', opts = {}) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    if (opts.visible !== false) {
      const b = this.bucket(mat, (x0 + x1) / 2, (z0 + z1) / 2);
      pushBox(b, x0, y0, z0, x1, y1, z1, {
        faces: opts.faces ?? FACE_ALL,
        scale: opts.scale ?? materials.scaleOf(mat),
        tint: opts.tint,
        ao: opts.ao ?? 0.72,
        uvOffset: opts.uvOffset ?? 0,
      });
    }
    let id = -1;
    if (opts.collide !== false) {
      id = this.col.addBox(x0, y0, z0, x1, y1, z1, opts.surf ?? materials.surfOf(mat), opts.flags ?? F_DEFAULT);
      this._expand(x0, y0, z0, x1, y1, z1);
    }
    return id;
  }
  // Invisible collision-only box
  clip(x0, y0, z0, x1, y1, z1, flags = F_SOLID) {
    this._expand(x0, y0, z0, x1, y1, z1);
    return this.col.addBox(x0, y0, z0, x1, y1, z1, 'concrete', flags);
  }
  floor(x0, z0, x1, z1, y, mat = 'concreteFloor', thick = 0.3, opts = {}) {
    return this.box(x0, y - thick, z0, x1, y, z1, mat, opts);
  }
  ceiling(x0, z0, x1, z1, y, mat = 'ceiling', thick = 0.3, opts = {}) {
    return this.box(x0, y, z0, x1, y + thick, z1, mat, opts);
  }
  // Wall running along X at z (centre), from x0..x1. openings: [{a, b, y0, y1}] in X coords.
  wallX(x0, x1, z, y0, y1, mat = 'plaster', thick = 0.2, openings = [], opts = {}) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    const z0 = z - thick / 2, z1 = z + thick / 2;
    const ops = openings.map((o) => ({ a: Math.max(x0, o.a), b: Math.min(x1, o.b), y0: o.y0 ?? y0, y1: o.y1 ?? y0 + 2.2 })).sort((p, q) => p.a - q.a);
    let cx = x0;
    for (const o of ops) {
      if (o.a > cx) this.box(cx, y0, z0, o.a, y1, z1, mat, opts);
      if (o.y0 > y0) this.box(o.a, y0, z0, o.b, o.y0, z1, mat, opts); // sill
      if (o.y1 < y1) this.box(o.a, o.y1, z0, o.b, y1, z1, mat, opts); // lintel
      cx = Math.max(cx, o.b);
    }
    if (cx < x1) this.box(cx, y0, z0, x1, y1, z1, mat, opts);
  }
  wallZ(z0, z1, x, y0, y1, mat = 'plaster', thick = 0.2, openings = [], opts = {}) {
    if (z0 > z1) [z0, z1] = [z1, z0];
    const x0 = x - thick / 2, x1 = x + thick / 2;
    const ops = openings.map((o) => ({ a: Math.max(z0, o.a), b: Math.min(z1, o.b), y0: o.y0 ?? y0, y1: o.y1 ?? y0 + 2.2 })).sort((p, q) => p.a - q.a);
    let cz = z0;
    for (const o of ops) {
      if (o.a > cz) this.box(x0, y0, cz, x1, y1, o.a, mat, opts);
      if (o.y0 > y0) this.box(x0, y0, o.a, x1, o.y0, o.b, mat, opts);
      if (o.y1 < y1) this.box(x0, o.y1, o.a, x1, y1, o.b, mat, opts);
      cz = Math.max(cz, o.b);
    }
    if (cz < z1) this.box(x0, y0, cz, x1, y1, z1, mat, opts);
  }
  // Straight staircase. dir: '+x','-x','+z','-z' (direction of ascent).
  stairs(x0, z0, x1, z1, y0, y1, dir = '+z', mat = 'concrete', opts = {}) {
    const rise = y1 - y0;
    const steps = Math.max(2, Math.round(Math.abs(rise) / (opts.stepH ?? 0.2)));
    const sh = rise / steps;
    const len = dir[1] === 'x' ? x1 - x0 : z1 - z0;
    const sl = len / steps;
    for (let i = 0; i < steps; i++) {
      const top = y0 + sh * (i + 1);
      let a, b;
      const bot = opts.thin ? top - 0.42 : y0 - 0.2;
      if (dir === '+x') { a = x0 + sl * i; b = x0 + sl * (i + 1); this.box(a, bot, z0, b, top, z1, mat, opts); }
      else if (dir === '-x') { a = x1 - sl * (i + 1); b = x1 - sl * i; this.box(a, bot, z0, b, top, z1, mat, opts); }
      else if (dir === '+z') { a = z0 + sl * i; b = z0 + sl * (i + 1); this.box(x0, bot, a, x1, top, b, mat, opts); }
      else { a = z1 - sl * (i + 1); b = z1 - sl * i; this.box(x0, bot, a, x1, top, b, mat, opts); }
    }
  }
  // Arbitrary geometry merged into static batches. collide: [[x0,y0,z0,x1,y1,z1],...] or 'bbox'
  mesh(geo, mat, matrix, opts = {}) {
    const e = matrix.elements;
    const b = this.bucket(mat, e[12], e[14]);
    pushGeometry(b, geo, matrix, { tint: opts.tint, tintArr: opts.tintArr, uvScale: opts.uvScale, worldUV: opts.worldUV });
    if (opts.collide === 'bbox') {
      if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox.clone().applyMatrix4(matrix);
      this.col.addBox(bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z, opts.surf ?? materials.surfOf(mat), opts.flags ?? F_DEFAULT);
      this._expand(bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z);
    }
  }
  // Oriented primitive helpers for props (visual only unless collide given)
  part(kind, x, y, z, sx, sy, sz, mat, opts = {}) {
    const m = trs(x, y, z, opts.rx || 0, opts.ry || 0, opts.rz || 0, sx, sy, sz);
    if (opts.parent) m.premultiply(opts.parent);
    const geo = kind === 'box' ? unitBox() : kind === 'cyl' ? unitCyl(opts.seg ?? 12) : kind;
    this.mesh(geo, mat, m, { tint: opts.tint, uvScale: opts.uvScale, worldUV: opts.worldUV ?? (kind === 'box' ? materials.scaleOf(mat) : undefined) });
    return m;
  }
  // Static decal for level dressing (blood, grime, scorch). frame: see render/decals.js DF
  decal(x, y, z, nx, ny, nz, size, frame, opts = {}) {
    this.game.staticDecals.add(x, y, z, nx, ny, nz, size, frame, opts);
  }
  addObject(obj) {
    this.root.add(obj);
    return obj;
  }
  light(x, y, z, color = 0xffe0b0, intensity = 8, range = 12, opts = {}) {
    const L = {
      x, y, z, color: new THREE.Color(color), intensity, range,
      flicker: opts.flicker || 0, // 0..1 flicker amount
      buzz: opts.buzz || 0,
      on: opts.on !== false,
      priority: opts.priority || 0,
      phase: Math.random() * 100,
      shadow: !!opts.shadow,
      cur: 0,
      dynamic: !!opts.dynamic,
      life: opts.life ?? -1,
    };
    this.lights.push(L);
    return L;
  }
  trigger(x0, y0, z0, x1, y1, z1, fn, opts = {}) {
    const t = {
      box: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
      fn, once: opts.once !== false, fired: false, all: !!opts.all, humanOnly: !!opts.humanOnly, enabled: opts.enabled !== false, name: opts.name,
    };
    this.triggers.push(t);
    return t;
  }
  after(sec, fn) {
    this.timers.push({ t: this.time + sec, fn });
  }
  item(type, x, y, z, opts = {}) {
    this.itemSpawns.push({ type, x, y, z, chance: opts.chance ?? 1, group: opts.group, yaw: opts.yaw ?? Math.random() * 6.28, count: opts.count });
  }
  hazard(x0, y0, z0, x1, y1, z1, type = 'fire', dps = 10) {
    const h = { box: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], type, dps, on: true };
    this.hazards.push(h);
    return h;
  }
  killZone(x0, y0, z0, x1, y1, z1) {
    this.killZones.push([Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)]);
  }
  reverb(x0, y0, z0, x1, y1, z1, preset) {
    this.reverbZones.push({ box: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], preset });
  }
  ambience(x0, y0, z0, x1, y1, z1, name) {
    this.ambientZones.push({ box: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], name });
  }

  // -------------------------------------------------------------- finalize --
  finalize() {
    for (const b of this.buckets.values()) {
      if (b.vcount === 0) continue;
      const geo = b.toGeometry();
      const mat = materials.get(b.mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      const transparent = mat.transparent;
      mesh.castShadow = !transparent && !b.mat.startsWith('emissive');
      mesh.receiveShadow = !b.mat.startsWith('emissive');
      mesh.name = 'static:' + b.mat;
      this.root.add(mesh);
      this.meshes.push(mesh);
    }
    this.buckets.clear();
    this.col.build();
    const bb = this.bounds;
    const t0 = performance.now();
    this.nav = new NavGrid(this.col, {
      minX: bb.minX, minZ: bb.minZ, maxX: bb.maxX, maxZ: bb.maxZ, minY: bb.minY, maxY: bb.maxY,
    }, this.def.navCell ?? 0.5);
    this.nav.build();
    // door flags
    for (const d of this.doors) d.bindNav?.(this.nav);
    this.navBuildMs = performance.now() - t0;
    // Flow distances from start and to exit
    if (this.flowStart) this.nav.computeStatic('fromStart', [this.flowStart], { survivor: false });
    if (this.flowEnd) this.nav.computeStatic('toExit', [this.flowEnd]);
  }

  // Progress 0..1 of a world position along the chapter.
  progressAt(x, y, z) {
    if (!this.nav || !this.nav.fields.toExit) return 0;
    const n = this.nav.nodeAt(x, y, z);
    if (n < 0) return -1;
    const toExit = this.nav.fields.toExit[n];
    const total = this.nav.fields.toExit[this.nav.nodeAt(this.flowStart[0], this.flowStart[1], this.flowStart[2])] || 1;
    if (toExit >= 1e8) return -1;
    return 1 - toExit / total;
  }

  update(dt, survivors) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      if (this.time >= t.t) {
        this.timers.splice(i, 1);
        t.fn();
      }
    }
    for (const t of this.triggers) {
      if (!t.enabled || (t.once && t.fired)) continue;
      let inside = 0, alive = 0;
      let who = null;
      for (const s of survivors) {
        if (s.dead) continue;
        if (t.humanOnly && !s.isHuman && s.remote == null) continue;
        alive++;
        const b = t.box;
        if (s.pos.x >= b[0] && s.pos.x <= b[3] && s.pos.y + 0.5 >= b[1] && s.pos.y <= b[4] && s.pos.z >= b[2] && s.pos.z <= b[5]) {
          inside++;
          who = who || s;
        }
      }
      const ok = t.all ? inside > 0 && inside === alive : inside > 0;
      if (ok) {
        t.fired = true;
        t.fn(who);
      }
    }
    for (const d of this.dynamics) d.update?.(dt);
    if (this.script && this.script.update) this.script.update(dt);
  }

  inBox(b, p, pad = 0) {
    return p.x >= b[0] - pad && p.x <= b[3] + pad && p.y >= b[1] - pad - 0.5 && p.y <= b[4] + pad && p.z >= b[2] - pad && p.z <= b[5] + pad;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}

export { F_DEFAULT, F_SOLID, F_SHOOT, F_SIGHT };
