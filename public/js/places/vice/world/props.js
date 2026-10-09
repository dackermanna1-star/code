// Vice City's public spaces: thousands of palms (and shade trees, shrubs,
// mangroves), the beach with its Art Deco lifeguard towers, umbrellas and
// boardwalk, South Pointe Pier, the seawalls and riprap along every shore,
// the marinas with yachts and moored boats, the port's container yards,
// cranes and ships, the airport's runways and parked airliners, the parks
// (fountains, bandshell, courts, cemetery, golf) and the street furniture.
//
//   const props = new Props(world, plan, ground, phys)   (before the city)
//   props.palm(x, y, z, scale = 1, lean = 0, kind)        queue a palm before finish() (kind 'coconut' | 'royal'; default: a coconut variant)
//   props.bush(x, y, z, s = 1, kind)                      queue a shrub ('shrub' | 'bougain' | 'grass' | 'mangrove')
//   props.tree(x, y, z, s = 1)                            queue a shade tree
//   props.claimed(x, z, r = 0) -> name | null             areas the props fill (CLAIMS): the city should keep buildings out
//   props.free(x, z, r) -> bool                           no city building box there (used to keep props out of buildings)
//   props.finish()                                        (after the city) builds everything
//   props.update(dt, camera)                              wind, near/far greenery, nearby furniture, night glow
//   props.knock(box) -> bool                              a car hit a breakable prop (box.prop): hide it, drop its box
//   props.spots = { benches, busStops, loungers, umbrellas }   [{x, y, z, heading}] for people to use
//   props.parks, props.marinas, props.pier                 what was built where (for missions and spawns)
//   props.stats() -> {buildMs, ms, flora, floraNear, floraFar, near, nearDrawn, boxes, meshes, staticTris}
//
// Static things are merged by material ('surf', 'win' lit windows, 'cont'
// containers, 'fence', 'flat'/'paint' lying on the ground, 'sign', 'ads') in
// 1024-stud chunks, and small details ('detail') in 512-stud chunks hidden
// beyond DETAIL. Repeated small things are instanced near the camera
// (kit.js NearSet), greenery by flora.js, the Kenney boats are one bobbing mesh.
import * as THREE from 'three';
import { V } from '../state.js';
import { viceTextures } from './textures.js';
import { propMaterials, NearSet, RoadIndex, FastChunks, hash } from './props/kit.js';
import { Flora, SP, SPECIES } from './props/flora.js';
import { buildBeach } from './props/beach.js';
import { buildWaterfront, buildKenney } from './props/waterfront.js';
import { buildPort, containerMaterial } from './props/port.js';
import { buildAirport } from './props/airport.js';
import { buildParks } from './props/parks.js';
import { buildStreets } from './props/street.js';
import { buildGreenery } from './props/greenery.js';

const DETAIL = 650;     // merged small things are hidden beyond this

// Areas the props fill (the city should keep its buildings out): [x0, z0, x1, z1, name]
export const CLAIMS = [
  [2794, 240, 3100, 2700, 'beach'],        // Lummus Park and the beach east of Ocean Drive
  [1240, -720, 1700, -380, 'port yard'],   // container yards (east of 1240, south of Caribbean Way)
  [1260, -1010, 1700, -880, 'port quay N'],
  [-4100, -4100, -3240, -760, 'airfield'], // runways, taxiways and the west apron
  [-3200, -1660, -2450, -1300, 'cargo apron'],
];

export class Props {
  constructor(world, plan, ground, phys) {
    const t0 = performance.now();
    this.world = world; this.plan = plan; this.ground = ground; this.phys = phys;
    this.tex = viceTextures(world.renderer);
    this.glow = { value: 0 };
    this.M = propMaterials(this.tex, this.glow);
    // big things in 1024-stud chunks (few draw calls), small details in 512-stud ones (hidden when far)
    const big = new FastChunks(1024), small = new FastChunks(512);
    this.C = { get: (mat, x, z) => (mat === 'detail' ? small : big).get(mat, x, z), meshes: (m, o) => [...big.meshes(m, o), ...small.meshes(m, o)] };
    this.flora = new Flora(world, this.tex);
    this.near = new NearSet(world.scene);
    this.roads = new RoadIndex(plan);
    this.group = new THREE.Group(); this.group.name = 'props';
    this.queued = { palms: [], bushes: [], trees: [] };
    this.boxes = 0;
    this.occ = new Set();
    this.ms = { ctor: Math.round(performance.now() - t0) };
  }

  // ---- the city's greenery (queued until finish) ----
  palm(x, y, z, scale = 1, lean = 0, kind = null) { this.queued.palms.push([x, y, z, scale, lean, kind]); }
  bush(x, y, z, s = 1, kind = 'shrub') { this.queued.bushes.push([x, y, z, s, kind]); }
  tree(x, y, z, s = 1) { this.queued.trees.push([x, y, z, s]); }
  claimed(x, z, r = 0) {
    for (const c of CLAIMS) if (x > c[0] - r && x < c[2] + r && z > c[1] - r && z < c[3] + r) return c[4];
    return null;
  }

  /** Put down a palm now (used by the props' own placement and by the queue). */
  addPalm(x, y, z, s = 1, lean = 0, kind = null, solid = true) {
    const h = hash(x * 7.3, z * 3.1, 5);
    let sp;
    if (kind === 'royal') sp = SP.royal;
    else if (kind === 'coconut' || !kind) sp = h < 0.42 ? SP.coco1 : h < 0.72 ? SP.coco3 : SP.coco2;
    else sp = SP[kind] ?? SP.coco1;
    const yaw = hash(x, z, 9) * Math.PI * 2;
    if (!lean && sp !== SP.royal) lean = (hash(z, x, 3) - 0.5) * 0.12;
    this.flora.add(sp, x, y - 0.3, z, s, yaw, lean, 0.88 + hash(x, z, 4) * 0.24);
    if (solid) this.box(x, y + 6, z, SPECIES[sp].trunk * s, 6, SPECIES[sp].trunk * s, 0, 'wood', { tree: true, shootable: true });
  }
  addTree(x, y, z, s = 1) {
    this.flora.add(SP.tree, x, y - 0.4, z, s, hash(x, z, 9) * Math.PI * 2, 0, 0.85 + hash(x, z, 4) * 0.3);
    this.box(x, y + 7, z, 1.7 * s, 7, 1.7 * s, 0, 'wood', { tree: true, shootable: true });
  }
  addBush(x, y, z, s = 1, kind = 'shrub') {
    this.flora.add(SP[kind] ?? SP.shrub, x, y - 0.3, z, s, hash(x, z, 9) * Math.PI * 2, 0, 0.85 + hash(x, z, 4) * 0.3);
  }
  /** A 4-stud occupancy grid so props don't land on each other. */
  occupy(x, z, r = 2) { const a = Math.floor((x - r) / 4), b = Math.floor((x + r) / 4), c = Math.floor((z - r) / 4), d = Math.floor((z + r) / 4); for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) this.occ.add(i * 8192 + j); }
  isFree(x, z, r = 2) { const a = Math.floor((x - r) / 4), b = Math.floor((x + r) / 4), c = Math.floor((z - r) / 4), d = Math.floor((z + r) / 4); for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) if (this.occ.has(i * 8192 + j)) return false; return true; }
  /** A collision box (counted). */
  box(x, y, z, hx, hy, hz, yaw = 0, mat = 'concrete', extra) { this.boxes++; return this.phys.add(x, y, z, hx, hy, hz, yaw, mat, extra); }

  /** Nothing built by the city (a building box) within r of (x, z)? */
  free(x, z, r = 2) {
    if (!this.bgrid) this._buildingIndex();
    const i0 = Math.floor((x - r) / 64), i1 = Math.floor((x + r) / 64), j0 = Math.floor((z - r) / 64), j1 = Math.floor((z + r) / 64);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const c = this.bgrid.get(i * 8192 + j); if (!c) continue;
      for (const b of c) {
        const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
        if (Math.abs(lx) < b.hx + r && Math.abs(lz) < b.hz + r) return false;
      }
    }
    return true;
  }
  /** The city's building boxes, filed by 64-stud cell (made once, when the props start being placed). */
  _buildingIndex() {
    this.bgrid = new Map();
    const seen = new Set();
    for (const list of this.phys.grid.values()) for (const b of list) {
      if (!b.building || b.debug || seen.has(b)) continue;
      seen.add(b);
      const ex = Math.abs(b.hx * b.c) + Math.abs(b.hz * b.s), ez = Math.abs(b.hx * b.s) + Math.abs(b.hz * b.c);
      for (let i = Math.floor((b.x - ex) / 64); i <= Math.floor((b.x + ex) / 64); i++) for (let j = Math.floor((b.z - ez) / 64); j <= Math.floor((b.z + ez) / 64); j++) {
        const k = i * 8192 + j; let c = this.bgrid.get(k); if (!c) this.bgrid.set(k, (c = [])); c.push(b);
      }
    }
  }
  /** Ground height (street level on dry land). */
  gy(x, z) { return this.ground.heightAt(x, z); }

  finish() {
    const t0 = performance.now(), ms = this.ms;
    const step = (name, fn) => { const t = performance.now(); try { fn(); } catch (e) { console.error('props.' + name, e); } ms[name] = Math.round(performance.now() - t); };
    step('waterfront', () => buildWaterfront(this));
    step('beach', () => buildBeach(this));
    step('port', () => buildPort(this));
    step('airport', () => buildAirport(this));
    step('parks', () => buildParks(this));
    step('streets', () => buildStreets(this));
    step('greenery', () => buildGreenery(this));
    step('queued', () => {
      for (const [x, y, z, s, lean, kind] of this.queued.palms) this.addPalm(x, y, z, s, lean, kind);
      for (const [x, y, z, s, kind] of this.queued.bushes) this.addBush(x, y, z, s, kind);
      for (const [x, y, z, s] of this.queued.trees) this.addTree(x, y, z, s);
    });
    step('meshes', () => {
      const M = this.M;
      this.meshes = this.C.meshes({ surf: M.surf, detail: M.surf, flat: M.flat, paint: M.paint, win: M.win, fence: M.fence, cont: containerMaterial(), ...(this.extraMats || {}) }, { shadow: new Set(['surf', 'detail', 'win', 'cont']) });
      for (const m of this.meshes) {
        if (m.userData.mat === 'flat' || m.userData.mat === 'paint') m.castShadow = false;
        m.userData.detail = m.userData.mat === 'detail';
        this.group.add(m);
      }
      this.detail = this.meshes.filter((m) => m.userData.detail || m.userData.mat === 'sign');
      this.world.scene.add(this.group);
    });
    step('flora', () => this.flora.build());
    step('near', () => {
      this.near.build();
      // where people can sit, wait or lie in the sun
      const spots = this.spots = { benches: [], busStops: this.busStops || [], loungers: [], umbrellas: [] };
      const by = { bench: spots.benches, lounger: spots.loungers, umbrella: spots.umbrellas };
      for (const it of this.near.items) { const list = by[this.near.types[it.t].name]; if (list) list.push({ x: it.x, y: it.y, z: it.z, heading: it.h }); }
    });
    // the Kenney models (boats, buoys) once they are inflated
    V.ready?.then(() => { const t = performance.now(); try { buildKenney(this); } catch (e) { console.error('props.kenney', e); } ms.kenney = Math.round(performance.now() - t); });
    this.buildMs = Math.round(performance.now() - t0) + ms.ctor;
  }

  update(dt, camera) {
    if (!this.meshes) return;
    const st = V.sky?.state;
    this.glow.value = st ? (st.lamps ?? st.night ?? 0) : 0;
    this.flora.update(dt, camera, st?.wind ?? 0.4);
    this.near.update(camera.position);
    // small merged things only near the camera
    const c = camera.position;
    for (const m of this.detail) {
      const s = m.geometry.boundingSphere, dx = s.center.x - c.x, dz = s.center.z - c.z, r = DETAIL + s.radius;
      m.visible = dx * dx + dz * dz < r * r;
    }
    if (this.anim) for (const f of this.anim) f(dt, c);
  }

  /** A car (or an explosion) hit a breakable prop: it disappears and its box goes. */
  knock(box) {
    if (!box?.prop || box.knocked) return false;
    box.knocked = true;
    if (box.item) { box.item.dead = true; this.near.dirty = true; }
    this.phys.remove(box);
    return true;
  }

  stats() {
    let tris = 0;
    for (const m of this.meshes || []) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    return { buildMs: this.buildMs, ms: this.ms, flora: this.flora.items.length, floraNear: this.flora.drawn, floraFar: this.flora.farCount, near: this.near.items.length, nearDrawn: this.near.drawn, boxes: this.boxes, meshes: this.meshes?.length, staticTris: Math.round(tris) };
  }
}
