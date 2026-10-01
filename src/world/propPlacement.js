// Places props from the catalog into the world: inserts into facade openings,
// hand-authored hero props, and scattered debris. Static props are batched;
// emissive lamp lenses and animated parts stay separate meshes.
import * as THREE from 'three';
import { PROPS } from '../props/catalog.js';
import { meshModel } from '../voxel/mesher.js';
import { StaticBatcher } from '../voxel/batch.js';
import { createVoxelMaterial } from '../render/voxelMaterial.js';
import { RNG } from '../core/rng.js';
import { FACADES, LAMPS, POLES, FACE_ROT, facadeById, facadeToWorld, facadeNormal } from './layout.js';
import { LAYER_REFLECT } from './units.js';

const DOOR_COLORS = [[58, 66, 60], [92, 40, 34], [44, 50, 62], [70, 66, 58], [30, 30, 32], [96, 84, 60]];
const SASH_COLORS = [[150, 146, 136], [86, 70, 54], [70, 80, 70], [130, 120, 100], [52, 50, 48]];

export class PropWorld {
  constructor(engine) {
    this.engine = engine;
    this.world = engine.world;
    this.rng = new RNG(31337);
    this.cache = new Map();
    this.batch = new StaticBatcher({ chunkLength: 14, name: 'props' });
    this.batchNoRefl = new StaticBatcher({ chunkLength: 14, name: 'debris' });
    this.material = createVoxelMaterial({ name: 'props' });
    this.emissive = []; // { mesh, lampId }
    this.animated = []; // { mesh, kind, axis, speed }
    this.panes = new Map(); // fixture -> panes
    this.missing = new Set();
    this.count = 0;
    this.lampAnchors = new Map();
  }

  /** Generate (cached) a prop. Returns null if the generator is missing. */
  gen(name, opts = {}, variant = 0) {
    const g = PROPS[name];
    if (!g) {
      this.missing.add(name);
      return null;
    }
    const key = `${name}|${JSON.stringify(opts)}|${variant}`;
    let e = this.cache.get(key);
    if (!e) {
      let res;
      try {
        res = g(new RNG(1000 + variant * 7919 + name.length * 31), opts);
      } catch (err) {
        console.warn('prop failed', name, err);
        this.missing.add(name);
        return null;
      }
      e = {
        res,
        geo: meshModel(res.model),
        parts: (res.parts ?? []).map((p) => ({ ...p, geo: meshModel(p.model) })),
      };
      this.cache.set(key, e);
    }
    return e;
  }

  /**
   * Place a prop. where = { pos: Vector3, yaw?, pitch?, roll? } or Matrix4.
   * opts.reflect: include in planar reflections; opts.collide: add footprint.
   */
  place(name, genOpts, where, opts = {}) {
    const e = this.gen(name, genOpts, opts.variant ?? 0);
    if (!e) return null;
    const m = where.isMatrix4
      ? where
      : new THREE.Matrix4().compose(
          where.pos,
          new THREE.Quaternion().setFromEuler(new THREE.Euler(where.pitch ?? 0, where.yaw ?? 0, where.roll ?? 0, 'YXZ')),
          new THREE.Vector3(1, 1, 1),
        );
    const seed = [this.rng.int(0, 900) * 37, this.rng.int(0, 900) * 37, this.rng.int(0, 900) * 37];
    const target = opts.reflect === false ? this.batchNoRefl : this.batch;
    target.add(e.geo, m, { seed });
    for (const p of e.parts) {
      const pm = new THREE.Matrix4().compose(
        new THREE.Vector3(...(p.position ?? [0, 0, 0])),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rotation ?? [0, 0, 0]))),
        new THREE.Vector3(1, 1, 1),
      );
      const wm = m.clone().multiply(pm);
      if (p.emissive) {
        const mat = createVoxelMaterial({ name: 'lampLens', emissive: 1, emissiveColor: opts.lightColor ?? 0xffc888 });
        const mesh = new THREE.Mesh(p.geo, mat);
        mesh.applyMatrix4(wm);
        mesh.layers.enable(LAYER_REFLECT);
        this.engine.scene.add(mesh);
        this.emissive.push({ mesh, mat, lampId: opts.lampId ?? null, base: opts.emissiveBase ?? 14 });
      } else if (p.animate) {
        const mesh = new THREE.Mesh(p.geo, this.material);
        mesh.matrixAutoUpdate = false;
        mesh.userData.base = wm.clone();
        mesh.matrix.copy(wm);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        this.engine.scene.add(mesh);
        this.animated.push({ mesh, kind: p.animate, phase: this.rng.range(0, 6), speed: p.speed ?? this.rng.range(2, 5) });
      } else {
        target.add(p.geo, wm, { seed });
      }
    }
    const meta = e.res.meta ?? {};
    if (opts.collide !== false && meta.footprint && !where.isMatrix4) {
      const [w, d] = meta.footprint;
      this.world.collision?.addRect(where.pos.x, where.pos.z, w / 2, d / 2, -(where.yaw ?? 0), 0.02);
    }
    this.count++;
    return { meta, matrix: m };
  }

  /** Place on a facade in its local frame (u along the wall, y up, zOut out of the wall). */
  onFacade(f, u, y, zOut, name, genOpts, opts = {}) {
    const pos = facadeToWorld(f, u, y, zOut);
    return this.place(name, genOpts, { pos, yaw: FACE_ROT[f.face] + (opts.yaw ?? 0) }, { ...opts, collide: false });
  }

  build(fixtures) {
    const t0 = performance.now();
    this.placeFixtures(fixtures);
    this.placeLamps();
    this.placeInfrastructure();
    this.placeClutter();
    this.placeDebris();
    const g1 = this.batch.build(this.material, { castShadow: true, receiveShadow: true });
    g1.traverse((o) => o.isMesh && o.layers.enable(LAYER_REFLECT));
    const g2 = this.batchNoRefl.build(this.material, { castShadow: true, receiveShadow: true });
    this.engine.scene.add(g1, g2);
    this.ms = Math.round(performance.now() - t0);
    if (this.missing.size) console.info('props not yet available:', [...this.missing].join(', '));
    return this;
  }

  // ───────────────────────── openings ─────────────────────────
  placeFixtures(fixtures) {
    const r = this.rng.fork('fixtures');
    for (const fx of fixtures) {
      const f = fx.facade;
      const cu = fx.u + fx.w / 2;
      if (fx.kind === 'window') {
        if (fx.boarded) {
          this.onFacade(f, cu, fx.y, 0.0, 'boardedWindow', { w: fx.w + 0.08, h: fx.h + 0.08 }, { variant: r.int(0, 5) });
          continue;
        }
        const style = fx.sub === 'fe' ? 'fe' : fx.sub === 'steel' ? 'steel' : fx.sub === 'small' ? 'small' : r.chance(0.25) ? 'alu' : 'dh';
        const res = this.onFacade(f, cu, fx.y, -fx.recess, 'windowSash', {
          w: +fx.w.toFixed(3), h: +fx.h.toFixed(3), style,
          color: r.pick(SASH_COLORS), raised: r.chance(0.15) ? +r.range(0.05, 0.3).toFixed(2) : 0,
          broken: r.chance(0.08) ? [r.int(0, 3)] : [],
        }, { variant: r.int(0, 3) });
        if (res?.meta?.panes) this.panes.set(fx, res.meta.panes);
        if (fx.bars) this.onFacade(f, cu, fx.y - 0.05, 0.0, 'windowBars', { w: +(fx.w + 0.12).toFixed(2), h: +(fx.h + 0.1).toFixed(2) }, { variant: r.int(0, 2) });
        if (fx.ac) this.onFacade(f, cu, fx.y + 0.02, -fx.recess + 0.06, 'acUnit', {}, { variant: r.int(0, 3) });
      } else if (fx.kind === 'door') {
        const style = fx.sub ?? 'steel';
        this.onFacade(f, cu, 0, -fx.recess, 'door', { w: fx.w, h: fx.h, style, color: r.pick(DOOR_COLORS) }, { variant: r.int(0, 3) });
        if (fx.stoop) {
          const res = this.onFacade(f, cu, 0, 0, 'stoop', { w: +(fx.w + 0.5).toFixed(2), steps: fx.steps ?? 1, depth: 0.62, rail: !!fx.rail }, {});
          // stoop collision
          const p = facadeToWorld(f, cu, 0, 0.31);
          const n = facadeNormal(f);
          this.world.collision?.addRect(p.x, p.z, Math.abs(n.x) > 0.5 ? 0.31 : (fx.w + 0.5) / 2, Math.abs(n.x) > 0.5 ? (fx.w + 0.5) / 2 : 0.31, 0, 0);
        }
      } else if (fx.kind === 'rollup') {
        this.onFacade(f, cu, 0, -fx.recess, 'rollupDoor', { w: fx.w, h: fx.h }, {});
        if (fx.bollards) {
          for (const s of [-1, 1]) {
            const u = cu + s * (fx.w / 2 + 0.32);
            this.onFacade(f, u, 0, 0.32, 'bollard', {}, { variant: s > 0 ? 1 : 0 });
            const p = facadeToWorld(f, u, 0, 0.32);
            this.world.collision?.addCircle(p.x, p.z, 0.12);
          }
        }
      } else if (fx.kind === 'garage') {
        this.onFacade(f, cu, 0, -fx.recess, 'garageDoor', { w: fx.w, h: fx.h }, {});
      } else if (fx.kind === 'sliding') {
        this.onFacade(f, cu, 0, -fx.recess + 0.08, 'slidingDoor', { w: fx.w, h: fx.h }, {});
      } else if (fx.kind === 'dock') {
        // roll-up door in the back wall of the recess, at dock height
        this.onFacade(f, cu - 0.0, fx.dockH, -fx.recess - 0.12, 'rollupDoor', { w: 4.6, h: +(3.85 - fx.dockH).toFixed(2) }, {});
      }
    }
  }

  // ───────────────────────── lamps ─────────────────────────
  placeLamps() {
    const kindToProp = { cage: 'cageLamp', rlm: 'rlmLamp', wallpack: 'wallPack', bulkhead: 'bulkhead', fluoro: 'fluoroFixture' };
    for (const L of LAMPS) {
      const f = facadeById(L.facade);
      const name = kindToProp[L.kind];
      const e = this.gen(name, {}, 0);
      if (!e) continue;
      const lamp = this.world.lamps.find((l) => l.def.id === L.id);
      const anchor = e.res.meta?.anchors?.light ?? [0, 0, 0.15];
      const yaw = FACE_ROT[f.face];
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
      // place the prop so that its light anchor sits where the light is
      const wallPos = facadeToWorld(f, L.u, L.y, L.out && L.out < 0 ? L.out : 0);
      let pos;
      if (lamp) {
        const a = new THREE.Vector3(...anchor).applyQuaternion(q);
        pos = lamp.light.position.clone().sub(a);
        // keep it flush with the wall plane
        const n = facadeNormal(f);
        const off = pos.clone().sub(wallPos).dot(n);
        pos.addScaledVector(n, -off);
        // move the light to the real anchor (in case the anchor is lower than the wall mount)
        lamp.light.position.copy(pos.clone().add(a));
      } else pos = wallPos;
      if (L.out && L.out < 0) {
        // mounted under the dock soffit: hang it from the ceiling
        pos.y = L.y + 0.25;
      }
      this.place(name, {}, { pos, yaw }, { collide: false, lampId: L.id, lightColor: L.color, emissiveBase: L.kind === 'rlm' ? 22 : 12 });
    }
  }

  // ───────────────────────── infrastructure ─────────────────────────
  placeInfrastructure() {
    const r = this.rng.fork('infra');
    // fire escapes (centered on the access windows)
    const fes = [
      { f: 'L0', u: 16.2, ys: [3.6, 6.9, 10.2] },
      { f: 'L1', u: 6.1, ys: [4.2, 7.5, 10.8, 14.1] },
      { f: 'L3', u: 10.6, ys: [3.8, 7.1, 10.4] },
    ];
    for (const fe of fes) {
      const f = facadeById(fe.f);
      const y0 = fe.ys[0] + 0.32;
      this.onFacade(f, fe.u, y0, 0.0, 'fireEscape', { width: 4.4, platformYs: fe.ys.map((y) => +(y + 0.32 - y0).toFixed(2)), depth: 1.1, dropLadder: true }, { variant: 1 });
    }
    // utility poles
    for (const P of POLES) {
      const res = this.place('utilityPole', { height: P.height, transformers: P.transformer, streetlight: P.light ? 'cobra' : null, meterBox: !!P.meterBox, side: P.x > 0 ? 1 : -1 },
        { pos: new THREE.Vector3(P.x, 0, P.z), yaw: P.x > 0 ? Math.PI / 2 : -Math.PI / 2 }, { collide: false, variant: POLES.indexOf(P) });
      this.world.collision?.addCircle(P.x, P.z, 0.2);
    }
    // downspouts
    const spouts = [['L0', 23.7], ['L1', 22.6], ['L2', 15.7], ['L3', 0.35], ['R0', 21.7], ['R2', 16.15], ['R4', 0.3], ['R5', 11.7], ['E', 21.0], ['E', 29.8]];
    for (const [id, u] of spouts) {
      const f = facadeById(id);
      this.onFacade(f, u, 0, 0, 'downspout', { height: +(f.height - 0.5).toFixed(2) }, { variant: r.int(0, 3) });
    }
    // meters, gas, junction boxes, conduits
    const L0 = facadeById('L0');
    this.onFacade(L0, 10.4, 1.15, 0, 'meterBank', { count: 4 }, {});
    this.onFacade(L0, 16.0, 0.3, 0, 'gasMeter', {}, {});
    this.onFacade(L0, 10.4, 2.3, 0, 'conduitRun', { length: 4.0, axis: 'y' }, {});
    const R0 = facadeById('R0');
    this.onFacade(R0, 10.6, 1.2, 0, 'meterBank', { count: 3 }, { variant: 1 });
    this.onFacade(R0, 10.6, 2.2, 0, 'conduitRun', { length: 4.2, axis: 'y' }, {});
    const R4 = facadeById('R4');
    this.onFacade(R4, 6.2, 1.3, 0, 'electricMeter', {}, {});
    this.onFacade(R4, 6.2, 2.0, 0, 'conduitRun', { length: 4.6, axis: 'y' }, {});
    const L3 = facadeById('L3');
    this.onFacade(L3, 5.2, 1.4, 0, 'junctionBox', {}, {});
    this.onFacade(L3, 2.0, 2.9, 0, 'conduitRun', { length: 6.0, axis: 'x' }, { variant: 1 });
    const L1 = facadeById('L1');
    this.onFacade(L1, 13.0, 3.0, 0, 'conduitRun', { length: 7.5, axis: 'x' }, { variant: 2 });
    this.onFacade(L1, 9.4, 1.5, 0, 'junctionBox', {}, { variant: 1 });
    // kitchen exhaust, vents, condenser
    const L2 = facadeById('L2');
    this.onFacade(L2, 14.6, 2.75, 0, 'exhaustFan', {}, {});
    this.onFacade(R0, 2.9, 2.6, 0, 'dryerVent', {}, {});
    this.onFacade(L3, 13.9, 3.0, 0, 'wallVent', {}, {});
    this.onFacade(facadeById('R2'), 10.3, 3.2, 0, 'wallVent', {}, { variant: 1 });
    const R5 = facadeById('R5');
    const cond = this.onFacade(R5, 8.0, 0, 0.5, 'hvacCondenser', {}, {});
    if (cond) {
      const p = facadeToWorld(R5, 8.0, 0, 0.5);
      this.world.collision?.addRect(p.x, p.z, 0.45, 0.45, 0, 0.02);
      this.condenserPos = p;
    }
    // signs
    this.onFacade(facadeById('R2'), 11.4, 1.9, 0.0, 'sign', { kind: 'noParking' }, {});
    this.onFacade(L1, 7.5, 2.35, 0.0, 'sign', { kind: 'fireExit' }, {});
    this.onFacade(facadeById('R4'), 2.4, 2.2, 0.0, 'sign', { kind: 'privateProperty' }, {});
    // rooftop silhouettes
    const roof = [['L0', 6.0, 'chimney'], ['L1', 8.5, 'rooftopHVAC'], ['L1', 17.0, 'ventStack'], ['R2', 6.0, 'satelliteDish'], ['R4', 12.0, 'antenna'], ['L3', 4.0, 'ventStack'], ['E', 20.0, 'rooftopHVAC'], ['R0', 15.0, 'ventStack'], ['L2', 6.0, 'rooftopHVAC']];
    for (const [id, u, name] of roof) {
      const f = facadeById(id);
      const back = name === 'satelliteDish' || name === 'antenna' ? 0.1 : name === 'chimney' ? -1.2 : -2.4;
      this.onFacade(f, u, f.height - (name === 'chimney' ? 1.4 : 0.6), back, name, {}, { variant: r.int(0, 3) });
    }
    // fences
    this.place('chainLinkFence', { length: 5.6, height: 2.4, gate: true }, { pos: new THREE.Vector3(0, 0, 7.0), yaw: Math.PI }, { collide: false });
    this.world.collision?.addRect(0, 7.0, 2.9, 0.05, 0, 0.02);
    this.place('woodFence', { length: 6.5, height: 2.05, gate: true }, { pos: new THREE.Vector3(2.8, 0, -11.25), yaw: -Math.PI / 2 }, { collide: false });
    this.world.collision?.addRect(2.8, -11.25, 0.06, 3.3, 0, 0.02);
    this.place('chainLinkFence', { length: 5.5, height: 2.6, gate: false }, { pos: new THREE.Vector3(-21.8, 0, -76.75), yaw: Math.PI / 2 }, { collide: false, variant: 1 });
    this.world.collision?.addRect(-21.8, -76.75, 0.06, 2.8, 0, 0.02);
    // wooden rear porches
    this.place('rearPorch', { width: 11.6, depth: 2.1, levels: [0.0, 3.6, 7.0] }, { pos: new THREE.Vector3(5.6, 0, -38.7), yaw: -Math.PI / 2 }, { collide: false });
    for (const z of [-44.3, -38.7, -33.1]) this.world.collision?.addCircle(3.6, z, 0.12);
    this.place('rearPorch', { width: 5.2, depth: 2.0, levels: [0.0, 3.4, 6.6] }, { pos: new THREE.Vector3(9.2, 0, -11.25), yaw: -Math.PI / 2 }, { collide: false, variant: 1 });
    // shoes on a wire, between L1 and R2
    this.place('shoesOnWire', {}, { pos: new THREE.Vector3(0.4, 7.25, -19.6), yaw: 0.3 }, { collide: false });
  }

  // ───────────────────────── clutter ─────────────────────────
  placeClutter() {
    const r = this.rng.fork('clutter');
    const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const g = (x, z) => this.world.groundHeight(x, z);
    const P = (name, opts, x, z, yaw, extra = {}) => this.place(name, opts, { pos: v3(x, g(x, z) + (extra.y ?? 0), z), yaw, pitch: extra.pitch ?? 0, roll: extra.roll ?? 0 }, { variant: extra.variant ?? r.int(0, 5), collide: extra.collide, reflect: extra.reflect });
    // dumpsters
    P('dumpster', { color: 'brown', lidOpen: true, overflow: 0.85 }, 2.1, -22.2, -Math.PI / 2 + 0.05);
    P('dumpster', { color: 'green', lidOpen: false, overflow: 0.4 }, -2.15, -34.9, Math.PI / 2 - 0.04, { variant: 2 });
    P('dumpster', { color: 'blue', lidOpen: true, overflow: 0.6 }, 18.6, -78.6, 0.02, { variant: 3 });
    // trash carts
    const carts = [[-2.35, 4.2, 1.5], [-2.3, 3.4, 1.62], [2.4, -47.6, -1.6], [2.35, -48.5, -1.45], [3.2, -36.0, -1.4], [3.15, -35.2, -1.75], [-2.35, -60.6, 1.5], [-2.4, -61.4, 1.7], [-10.0, -79.0, 0.2]];
    carts.forEach(([x, z, yaw], i) => P('trashCart', { color: ['black', 'green', 'black', 'grey'][i % 4], lidOpen: i % 3 === 0 }, x, z, yaw, { variant: i }));
    P('trashCart', { color: 'black', lidOpen: true }, -14.5, -76.0, 0.4, { variant: 9, roll: Math.PI / 2, y: 0.33, collide: true });
    // metal & plastic cans
    P('metalCan', {}, -2.4, -16.2, 0.3);
    P('metalCan', { lidOff: true }, -2.42, -16.75, 1.0, { variant: 2 });
    P('plasticCan', {}, 2.42, -58.9, 0.6);
    // pallets, cardboard, mattress
    P('palletStack', { count: 5 }, 2.25, -55.0, -Math.PI / 2 + 0.06);
    P('pallet', { leaning: true }, 2.62, -56.6, -Math.PI / 2, { collide: false });
    P('pallet', { broken: true }, -2.0, -38.0, 0.7);
    P('mattress', { leaning: true }, 2.62, -57.8, -Math.PI / 2, { collide: false });
    this.world.collision?.addRect(2.45, -57.8, 0.25, 1.0, 0, 0);
    P('flatCardboard', {}, 1.6, -24.4, -1.2);
    P('flatCardboard', {}, -2.2, -45.8, 0.5, { variant: 2 });
    P('cardboardBox', { wet: true }, 1.9, -20.2, 0.3);
    P('cardboardBox', {}, 2.35, -21.0, 1.2, { variant: 3 });
    P('cardboardBox', { wet: true }, -2.1, -46.4, 0.2, { variant: 4 });
    P('cardboardBox', {}, -18.0, -78.9, 0.4, { variant: 1 });
    // trash bags around dumpsters and carts
    const bags = [[1.5, -21.6], [1.7, -23.4], [1.25, -22.8], [-1.75, -35.8], [-1.6, -36.3], [2.0, -46.8], [-2.0, 5.0], [-2.1, 2.9], [17.2, -78.0], [17.0, -79.0], [-1.9, -62.2], [3.0, -37.0], [-2.25, -66.8]];
    bags.forEach(([x, z], i) => P('trashBag', { color: i % 5 === 0 ? 'white' : 'black' }, x + r.range(-0.1, 0.1), z, r.range(0, 6.28), { variant: i }));
    // kitchen door: milk-crate seat, cigarette can, grease bin, bucket + mop
    P('milkCrate', {}, -2.25, -46.9, 0.3);
    P('cigaretteCan', {}, -2.5, -46.4, 0.0, { collide: false });
    P('greaseBin', {}, -2.3, -48.2, Math.PI / 2);
    P('bucket', {}, -2.45, -45.3, 0.4);
    P('mop', {}, -2.55, -45.1, Math.PI / 2, { collide: false });
    // misc storytelling
    P('shoppingCart', { tipped: true }, -1.6, -63.4, 0.9);
    P('tire', { leaning: true }, -2.55, -55.4, Math.PI / 2, { collide: false });
    P('brokenChair', {}, 3.9, -41.5, 2.2);
    P('bicycleFrame', {}, 3.75, -33.3, -0.3);
    P('paintCan', {}, 4.2, -42.5, 0.3);
    P('rubble', {}, -2.5, -23.2, 0.4);
    P('rubble', {}, -2.45, -0.2, 1.3, { variant: 2 });
    P('crateSeat', {}, 3.9, -40.3, 0.7);
    P('plasticChair', {}, -19.5, -77.6, 0.6);
    P('newspaperBox', {}, 6.5, 15.2, Math.PI);
  }

  // ───────────────────────── debris ─────────────────────────
  placeDebris() {
    const r = this.rng.fork('debris');
    const types = [
      ['can', 70, 6], ['bottle', 35, 6], ['cup', 14, 4], ['foodBox', 6, 4], ['paperScrap', 120, 8],
      ['cigaretteButt', 260, 4], ['bottleCap', 60, 3], ['leaf', 220, 6], ['glassShard', 70, 4], ['plasticBag', 10, 4],
    ];
    const hot = [[-2.2, 2.0], [-2.2, -46.6], [2.2, -22.2], [-2.2, -34.9], [2.4, -48.0], [-2.3, -61.0], [18.0, -78.5], [2.5, -55.5], [0, -27.2], [0, -61.0], [-2.4, -16.5], [3.9, -40.0]];
    const ground = this.world.ground?.sample;
    for (const [name, count, variants] of types) {
      if (!PROPS[name]) {
        this.missing.add(name);
        continue;
      }
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 20) {
        tries++;
        let x, z;
        if (r.chance(0.55)) {
          const h = r.pick(hot);
          x = h[0] + r.normal(0, 0.9);
          z = h[1] + r.normal(0, 1.4);
        } else {
          // along the walls and the centre drain line, plus anywhere
          const mode = r.next();
          z = r.range(-73.5, 6.5);
          if (mode < 0.45) x = r.sign() * r.range(1.9, 2.72);
          else if (mode < 0.65) x = r.normal(0, 0.35);
          else x = r.range(-2.6, 2.6);
          if (r.chance(0.12)) {
            x = r.range(-21, 21);
            z = r.range(-79.2, -74.2);
          }
        }
        if (this.world.collision?.circleBlocked(x, z, 0.06)) continue;
        const water = ground ? ground.water(x, z) : 0;
        if (water > 0.006 && name !== 'leaf' && name !== 'paperScrap' && name !== 'cigaretteButt') continue;
        const y = this.world.groundHeight(x, z) + (water > 0 ? water * 0.5 : 0);
        const variant = r.int(0, variants - 1);
        const lying = name === 'can' || name === 'bottle' || name === 'cup' ? r.chance(0.8) : false;
        this.place(name, { variant }, { pos: new THREE.Vector3(x, y, z), yaw: r.range(0, 6.28), roll: lying ? Math.PI / 2 : 0 }, { variant, collide: false, reflect: false });
        placed++;
      }
    }
  }

  update(dt, t) {
    // drive lamp lens emission from the lamp intensities (flicker)
    for (const e of this.emissive) {
      const lamp = e.lampId ? this.world.lamps.find((l) => l.def.id === e.lampId) : null;
      const k = lamp ? lamp.light.intensity / lamp.base : 1;
      e.mat.userData.uniforms.uEmissive.value = e.base * k;
    }
    for (const a of this.animated) {
      const m = a.mesh;
      if (a.kind === 'spin-y' || a.kind === 'spin-z') {
        const ang = t * a.speed + a.phase;
        const rot = new THREE.Matrix4().makeRotationAxis(a.kind === 'spin-y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1), ang);
        m.matrix.copy(m.userData.base).multiply(rot);
      } else if (a.kind === 'sway') {
        const w = this.engine.world.windAt(t);
        const rot = new THREE.Matrix4().makeRotationZ(Math.sin(t * 2.1 + a.phase) * 0.12 * (0.3 + w));
        m.matrix.copy(m.userData.base).multiply(rot);
      }
      m.matrixWorldNeedsUpdate = true;
    }
  }
}
