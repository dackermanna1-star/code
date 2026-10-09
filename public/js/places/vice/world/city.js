// The city: every block of the plan cut into lots that front its streets and filled with buildings in
// its district's style (build/districts.js), the landmarks (build/landmarks.js), their signs, neon and
// murals - all built through the kit (build/kit.js) into merged meshes per cell, drawn with the
// building material (build/materials.js) whose shader draws the windows and the rooms behind them.
//
//   const city = new City(world, plan, ground, phys)
//   city.real = true                          (the debug stand-in boxes switch off)
//   city.places[id] = { x, z, door: {x, z, heading}, kind, name }   (layout PLACES and a few more)
//   city.spawnPoints = { parking: [{x, z, heading}], peds: [{x, z}] }
//   city.spawnPoints.police / .ambulance = [{x, z, heading}]   (station car parks, the hospitals' bays)
//   city.docks = [{x, z, heading}]            private docks (villas on the canals, Star Island) for moored boats
//   city.roadAt(x, z) -> plan edge | null     the road (carriageway or sidewalk) covering a point
//   city.update(dt, camera)                   LOD (mouldings < 2000, small things < 560) and the night glow
//   city.buildMs, city.stats() -> {buildings, lots, boxes, verts, tris, meshes, signs, murals}
//
// LOD tiers: BASE (the masses; always), MID (mouldings, balconies, fins, rooftop kit), NEAR (awnings,
// café tables, AC units, fences...). Collision: a box or a few per building mass ({building: true}).
import * as THREE from 'three';
import { V } from '../state.js';
import { GROUND } from './layout.js';
import { viceTextures } from './textures.js';
import { rng, hash2 } from '../../outbreak/noise.js';
import { Kit } from '../build/kit.js';
import { buildingMaterial, kitGeometry, SignAtlas, neonMaterial, paintMaterial, signGeometry, muralAtlas, decalGeometry, CITY_U } from '../build/materials.js';
import { blockLots } from '../build/lots.js';
import { DISTRICT_STYLES, buildYard } from '../build/districts.js';
import { buildLandmarks } from '../build/landmarks.js';

const MID_RANGE = 2000, NEAR_RANGE = 560, PAINT_RANGE = 1100, NEON_RANGE = 3600, MURAL_RANGE = 1600;

export class City {
  constructor(world, plan, ground, phys) {
    const t0 = performance.now();
    this.world = world; this.plan = plan; this.ground = ground; this.phys = phys;
    this.places = {};
    this.spawnPoints = { parking: [], peds: [] };
    this.reserved = [];       // rectangles taken by landmarks: [x0, z0, x1, z1]
    this.K = new Kit(phys);
    const C = this._context();
    this.C = C;
    this._streetIndex();
    // the landmarks first: they claim their ground
    buildLandmarks(C);
    // then every block, in its district's style
    let lotsN = 0;
    for (const b of this.plan.blocks) lotsN += this._block(C, b);
    this.lots = lotsN;
    this.tBuild = Math.round(performance.now() - t0);
    this._meshes();
    this.real = true;
    this.buildMs = Math.round(performance.now() - t0);
    this._v = new THREE.Vector3();
  }

  /** What the district builders get: the kit, the map, helpers that put down spawn points and greenery. */
  _context() {
    const city = this, plan = this.plan, ground = this.ground;
    return {
      city, K: this.K, plan, ground, phys: this.phys,
      /** Dry street-level land (not beach, not water) at every corner and the middle of a rectangle. */
      landOK(x0, z0, x1, z1) {
        // the height map knows: the sea and the canals are carved below 0, beaches slope down to it
        const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
        for (let i = 0; i < 9; i++) {
          const x = i % 3 === 0 ? x0 : i % 3 === 1 ? xm : x1, z = i < 3 ? z0 : i < 6 ? zm : z1;
          if (Math.abs(ground.heightAt(x, z) - GROUND) > 0.35) return false;
          const k = ground.kindAt(x, z);
          if (k >= 1 && k <= 4) return false;
        }
        return true;
      },
      /** Dry land, no road on it and nobody else's: somewhere to build. */
      clear(x0, z0, x1, z1) {
        if (!this.landOK(x0, z0, x1, z1) || !this.free(x0, z0, x1, z1)) return false;
        for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) if (city.roadAt(x0 + ((x1 - x0) * i) / 4, z0 + ((z1 - z0) * j) / 4)) return false;
        return true;
      },
      /** Is a rectangle free of the landmarks' ground? */
      free(x0, z0, x1, z1) { return !city.reserved.some((r) => x1 > r[0] && x0 < r[2] && z1 > r[1] && z0 < r[3]); },
      reserve(x0, z0, x1, z1) { city.reserved.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]); },
      park(x, z, heading) { city.spawnPoints.parking.push({ x, z, heading }); },
      ped(x, z) { city.spawnPoints.peds.push({ x, z }); },
      place(id, o) { city.places[id] = { ...(city.places[id] || {}), ...o }; },
      palm(x, z, s = 1, lean = 0) { V.props?.palm?.(x, ground.heightAt(x, z), z, s, lean); },
      palmAt(x, y, z, s = 1, lean = 0) { V.props?.palm?.(x, y, z, s, lean); },
      bush(x, z, s = 1) { V.props?.bush?.(x, ground.heightAt(x, z), z, s); },
      rng: (seed) => rng(seed >>> 0),
      hash: hash2,
      GROUND,
    };
  }

  // ---- blocks ------------------------------------------------------------------------------------------------------
  /** A lookup of the ground-level roads: which street runs along each side of a block. */
  _streetIndex() {
    const G = 64, grid = new Map();
    for (const e of this.plan.edges) {
      if (e.elevated) continue;
      for (let i = 0; i < e.pts.length - 1; i++) {
        const a = e.pts[i], b = e.pts[i + 1];
        const x0 = Math.min(a.x, b.x) - 60, x1 = Math.max(a.x, b.x) + 60, z0 = Math.min(a.z, b.z) - 60, z1 = Math.max(a.z, b.z) + 60;
        for (let gi = Math.floor(x0 / G); gi <= Math.floor(x1 / G); gi++) for (let gj = Math.floor(z0 / G); gj <= Math.floor(z1 / G); gj++) {
          const k = gi * 4096 + gj;
          let c = grid.get(k); if (!c) grid.set(k, (c = []));
          c.push({ e, a, b });
        }
      }
    }
    this._roads = { G, grid };
  }
  /** The road whose carriageway or sidewalk covers (x, z), or null. */
  roadAt(x, z) {
    const { G, grid } = this._roads;
    const c = grid.get(Math.floor(x / G) * 4096 + Math.floor(z / G));
    if (!c) return null;
    let best = null, bd = Infinity;
    for (const s of c) {
      const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, L2 = dx * dx + dz * dz || 1;
      let t = ((x - s.a.x) * dx + (z - s.a.z) * dz) / L2; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (s.a.x + dx * t), z - (s.a.z + dz * t));
      if (d <= s.e.width / 2 + (s.e.walk || 0) + 1 && d < bd) { bd = d; best = s.e; }
    }
    return best;
  }
  _sideStreet(b, s) {
    const pts = [0.3, 0.5, 0.7];
    let e = null;
    for (const t of pts) {
      const x = s === 'e' ? b.x1 + 6 : s === 'w' ? b.x0 - 6 : b.x0 + (b.x1 - b.x0) * t;
      const z = s === 's' ? b.z1 + 6 : s === 'n' ? b.z0 - 6 : b.z0 + (b.z1 - b.z0) * t;
      const r = this.roadAt(x, z);
      if (r && !r.bridge) { e = r; break; }
    }
    return e ? { cls: e.cls, name: e.name || '', edge: e } : null;
  }

  _block(C, b0) {
    const b = { ...b0, edge: { ...b0.edge } };
    const D = this.plan.districts.find((d) => d.id === b.district);
    const style = DISTRICT_STYLES[D?.style] || null;
    if (!style) return 0;
    // the beach island's oceanfront north of Ocean Drive: one deep block from Collins to the sand
    if (b.grid === 'beach' && b.x0 > 2780) return 0;
    const streets = {};
    for (const s of ['n', 's', 'e', 'w']) { const st = this._sideStreet(b, s); b.edge[s] = !!st; if (st) streets[s] = st; }
    if (b.grid === 'beach' && b.x0 > 2630 && b.x1 < 2740 && !streets.e) {
      // the oceanfront where Ocean Drive doesn't run: South Beach's hotels still face the sea (over the
      // promenade); further north the resorts take the whole depth from Collins to the sand
      if (D.style === 'deco') { b.edge.e = true; streets.e = { cls: 'drive', name: 'Ocean Drive', promenade: true }; }
      else { b.x1 = 2990; }
    }
    if (!b.edge.n && !b.edge.s && !b.edge.e && !b.edge.w) return 0;
    const r = rng(b.id * 7349 + 11);
    const info = { streets, district: D };
    const opts = style.lots(b, info, r);
    const L = blockLots(b, info, opts, r);
    let n = 0, k = 0;
    for (const lot of L.lots) {
      lot.district = D; lot.seed = (b.id * 131 + k++ * 17 + 7) >>> 0; lot.y = GROUND; lot.mall = !!opts.mall;
      if (!C.free(lot.x0, lot.z0, lot.x1, lot.z1)) continue;
      if (!C.landOK(lot.x0, lot.z0, lot.x1, lot.z1)) { if (!style.trim || !this._trim(C, lot)) continue; }
      if (this._onRoad(lot.x0, lot.z0, lot.x1, lot.z1)) continue; // a ring road round a park, the airport's perimeter
      try { style.build(C, lot, rng(lot.seed)); n++; } catch (e) { console.warn('city: lot failed', D.id, e); }
    }
    if (L.yard && !this._onRoad(L.yard.x0, L.yard.z0, L.yard.x1, L.yard.z1) && C.free(L.yard.x0, L.yard.z0, L.yard.x1, L.yard.z1) && C.landOK(L.yard.x0, L.yard.z0, L.yard.x1, L.yard.z1)) {
      try { buildYard(C, L.yard, D, rng(b.id * 3 + 5), style); } catch (e) { console.warn('city: yard failed', e); }
    }
    return n;
  }
  /** Does a road (carriageway or sidewalk) cross the rectangle? */
  _onRoad(x0, z0, x1, z1) {
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) if (this.roadAt(x0 + 3 + ((x1 - x0 - 6) * i) / 4, z0 + 3 + ((z1 - z0 - 6) * j) / 4)) return true;
    return false;
  }
  /** Shrink a lot (from the back, then from either side) until it stands on dry land; false if too little is left. */
  _trim(C, lot) {
    const fx = Math.sin(lot.yaw), fz = Math.cos(lot.yaw), rx = Math.cos(lot.yaw), rz = -Math.sin(lot.yaw);
    const try_ = (d, w, off) => {
      // keep the front where it is; `off` slides the lot along the street
      const cx = lot.x + fx * (lot.d - d) / 2 + rx * off, cz = lot.z + fz * (lot.d - d) / 2 + rz * off;
      const ns = Math.abs(fx) < 0.5, hx = ns ? w / 2 : d / 2, hz = ns ? d / 2 : w / 2;
      if (!C.landOK(cx - hx, cz - hz, cx + hx, cz + hz)) return false;
      Object.assign(lot, { x: cx, z: cz, d, w, x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz });
      return true;
    };
    for (let k = 0.88; k >= 0.2; k -= 0.08) if (lot.d * k >= 18 && try_(lot.d * k, lot.w, 0)) return true;
    for (let k = 0.8; k >= 0.4; k -= 0.2) for (const s of [-1, 1]) for (let kd = 1; kd >= 0.55; kd -= 0.45) if (lot.w * k > 20 && try_(lot.d * kd, lot.w * k, s * lot.w * (1 - k) / 2)) return true;
    return false;
  }

  // ---- meshes ------------------------------------------------------------------------------------------------------
  _meshes() {
    const tex = viceTextures(this.world.renderer);
    this.tex = tex;
    this.mat = buildingMaterial(tex, { key: 'city' });
    this.group = new THREE.Group(); this.group.name = 'city';
    this.cells = [];    // {x, z, r, base, mid}
    this.ncells = [];   // {x, z, near}
    let verts = 0, tris = 0;
    const mk = (vb, shadow) => {
      const a = vb.arrays();
      if (!a.nv) return null;
      const m = new THREE.Mesh(kitGeometry(a), this.mat);
      m.castShadow = shadow; m.receiveShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix();
      for (const at of Object.values(m.geometry.attributes)) at.onUpload(freeArray);
      m.geometry.index.onUpload(freeArray);
      this.group.add(m);
      verts += a.nv; tris += a.idx.length / 3;
      return m;
    };
    for (const c of this.K.big.values()) {
      const base = mk(c.base, true), mid = mk(c.mid, true);
      this.cells.push({ x: c.x, z: c.z, base, mid });
      c.base = c.mid = null;
    }
    for (const c of this.K.small.values()) {
      const near = mk(c.near, false);
      if (near) this.ncells.push({ x: c.x, z: c.z, near });
      c.near = null;
    }
    this.verts = verts; this.tris = tris;
    // signs: neon and painted, per 512 cell
    const signs = this.K.signs;
    this.signCells = [];
    if (signs.length && typeof document !== 'undefined') {
      const atlas = new SignAtlas(signs);
      this.atlas = atlas;
      this.neonMat = neonMaterial(atlas); this.paintMat = paintMaterial(atlas);
      const byCell = new Map();
      for (const s of signs) {
        const k = Math.floor(s.x / 512) * 4096 + Math.floor(s.z / 512);
        let c = byCell.get(k); if (!c) byCell.set(k, (c = { x: (Math.floor(s.x / 512) + 0.5) * 512, z: (Math.floor(s.z / 512) + 0.5) * 512, neon: [], paint: [] }));
        (atlas.kindOf(s) === 0 ? c.paint : c.neon).push(s);
      }
      for (const c of byCell.values()) {
        const rec = { x: c.x, z: c.z, neon: null, paint: null };
        if (c.neon.length) { rec.neon = new THREE.Mesh(signGeometry(c.neon, atlas), this.neonMat); rec.neon.renderOrder = 3; rec.neon.matrixAutoUpdate = false; this.group.add(rec.neon); }
        if (c.paint.length) { rec.paint = new THREE.Mesh(signGeometry(c.paint, atlas), this.paintMat); rec.paint.receiveShadow = true; rec.paint.matrixAutoUpdate = false; this.group.add(rec.paint); }
        this.signCells.push(rec);
      }
    }
    // murals
    this.muralCells = [];
    if (this.K.decals.length && typeof document !== 'undefined') {
      this.muralTex = muralAtlas();
      this.muralMat = new THREE.MeshStandardMaterial({ map: this.muralTex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      const byCell = new Map();
      for (const d of this.K.decals) {
        const k = Math.floor(d.x / 512) * 4096 + Math.floor(d.z / 512);
        let c = byCell.get(k); if (!c) byCell.set(k, (c = { x: (Math.floor(d.x / 512) + 0.5) * 512, z: (Math.floor(d.z / 512) + 0.5) * 512, list: [] }));
        c.list.push(d);
      }
      for (const c of byCell.values()) {
        const m = new THREE.Mesh(decalGeometry(c.list), this.muralMat);
        m.receiveShadow = true; m.matrixAutoUpdate = false;
        this.group.add(m);
        this.muralCells.push({ x: c.x, z: c.z, mesh: m });
      }
    }
    this.world.scene.add(this.group);
  }

  stats() {
    let calls = 0;
    this.group.traverse((o) => { if (o.isMesh && o.visible) calls++; });
    return { buildings: this.K.buildings.length, lots: this.lots, boxes: this.K.boxes, verts: this.verts, tris: this.tris, meshes: calls, signs: this.K.signs.length, murals: this.K.decals.length, buildMs: this.buildMs, kitMs: this.tBuild };
  }

  update(dt, camera) {
    const st = V.sky?.state;
    CITY_U.night.value = st?.lamps ?? st?.night ?? 0;
    CITY_U.dayL.value = st?.light ?? 1;
    CITY_U.uTime.value += dt;
    const p = camera.position;
    for (const c of this.cells) if (c.mid) c.mid.visible = cellDist(p, c, 256) < MID_RANGE;
    for (const c of this.ncells) c.near.visible = cellDist(p, c, 128) < NEAR_RANGE;
    const neonR = CITY_U.night.value > 0.2 ? NEON_RANGE : MID_RANGE;
    for (const c of this.signCells) {
      const d = cellDist(p, c, 256);
      if (c.neon) c.neon.visible = d < neonR;
      if (c.paint) c.paint.visible = d < PAINT_RANGE;
    }
    for (const c of this.muralCells) c.mesh.visible = cellDist(p, c, 256) < MURAL_RANGE;
  }
}
function freeArray() { if (!globalThis.__vcKeepArrays) this.array = null; }
/** Distance from the camera to a cell (a square of half size `half` round c.x, c.z; height above the roofs counts too). */
function cellDist(p, c, half) {
  const dx = Math.max(0, Math.abs(p.x - c.x) - half), dz = Math.max(0, Math.abs(p.z - c.z) - half), dy = Math.max(0, p.y - 30);
  return Math.sqrt(dx * dx + dz * dz + dy * dy);
}
