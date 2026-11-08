// =============================================================================
// ROAD LAYOUT — deterministic analysis of the route (computed once at init):
//   * per-sample (2 m) cross-section: median half width, lane width/count,
//     carriageway edge, paved edge, kerb, sidewalk, formation half width, with
//     smooth tapers at road-type changes; visual bank (clamped so the road
//     surface never dips below the terrain formation, see notes in index.js)
//   * centre-line style (dashed / warning / solid / double) from sight distance
//   * guardrail flags (drop side, outside of tight curves, tunnel approaches)
//   * street-lighting rows (spacing, phase, lateral position, mounting height)
//   * features: junctions & side roads, signalised intersections, zebra
//     crossings, bus stops, signs (speed limits, direction, warnings, town
//     boards, km posts...), tunnel/bridge info, overpasses.
// Everything is keyed by s (metres along the route) so chunks can be built
// independently and identically.
// =============================================================================
import { ROAD_TYPES, WAYPOINTS } from '../world/route.js';
import { GEO, BUS_ANCHORS } from '../world/geo.js';
import { clamp, sstep, hash1, hash2, rng } from './util.js';

export const CAT = { town: 0, ramp: 1, highway: 2, rural: 3, mountain: 4, coastal: 5, city: 6 };
export const CAT_NAMES = ['town', 'ramp', 'highway', 'rural', 'mountain', 'coastal', 'city'];
// centre-line styles
export const CL = { NONE: 0, DASH: 1, WARN: 2, SOLID: 3, DOUBLE: 4, SOLID_L: 5, SOLID_R: 6 };
const DEP = BUS_ANCHORS.dep, ARR = BUS_ANCHORS.arr;

const TAPER = { 'town>ramp': 60, 'ramp>highway': 380, 'highway>ramp': 380, 'ramp>rural': 120, 'rural>mountain': 80, 'mountain>rural': 80, 'rural>coastal': 80, 'coastal>city': 220 };

function base(type) {
  const T = ROAD_TYPES[type];
  const med = (T.median || 0) / 2;
  const edge = med + T.lanes * T.laneW;
  return {
    med, laneW: T.laneW, lanes: T.lanes, edge, pave: edge + T.shoulder,
    kerb: T.kerb ? (type === 'city' ? 0.14 : 0.13) : 0, walk: T.sidewalk || 0, halfW: T.halfW,
    surf: type === 'highway' ? 1 : 0, cat: CAT[type],
  };
}

export class RoadLayout {
  constructor(route) {
    const R = this.R = route;
    const n = R.n;
    this.n = n;
    const F = (k = Float32Array) => new k(n);
    this.med = F(); this.laneW = F(); this.edge = F(); this.pave = F(); this.kerb = F(); this.walk = F(); this.halfW = F();
    this.lanes = F(Uint8Array); this.surf = F(Uint8Array); this.cat = F(Uint8Array);
    this.bankV = F(); this.centre = F(Uint8Array); this.guard = F(Uint8Array); this.tunnel = F(Uint8Array); this.bridge = F(Uint8Array);
    this.medKerb = F(Uint8Array);     // raised (kerbed) median island
    this.medBarrier = F(Uint8Array);  // concrete median barrier
    this.edgeLine = F(Uint8Array);    // bit 1 right, bit 2 left
    this.noDelin = F(Uint8Array);     // bit 1 right, bit 2 left: no posts (junction mouths, stops...)
    this.kerbGap = F(Uint8Array);     // bit 1 right, bit 2 left
    this.lamp = new Float32Array(n * 8);  // 2 rows x (spacing, phase, lat, signed height: + LED, - sodium)
    this.natL = F(); this.natR = F();     // natural terrain at the formation edges (for guardrails / cuts)

    // ---- 1. base sections + tapers --------------------------------------------------
    const segs = R.segments;
    const tmp = segs.map((g) => base(g.type));
    const keys = ['med', 'laneW', 'edge', 'pave', 'walk', 'halfW'];
    for (let i = 0; i < n; i++) {
      const s = i * R.step;
      let k = 0;
      while (k < segs.length - 1 && s > segs[k].s1) k++;
      let a = tmp[k], w = 0, b = null;
      // blend with the neighbour segment inside the taper zone around each boundary
      if (k > 0) {
        const L = TAPER[`${segs[k - 1].type}>${segs[k].type}`] || 60;
        const d = s - segs[k].s0;
        if (d < L / 2) { b = tmp[k - 1]; w = 1 - sstep(-L / 2, L / 2, d); }
      }
      if (k < segs.length - 1 && !b) {
        const L = TAPER[`${segs[k].type}>${segs[k + 1].type}`] || 60;
        const d = segs[k].s1 - s;
        if (d < L / 2) { b = tmp[k + 1]; w = 1 - sstep(-L / 2, L / 2, d); }
      }
      for (const key of keys) this[key][i] = b ? a[key] + (b[key] - a[key]) * w : a[key];
      this.kerb[i] = (b && w > 0.5) ? b.kerb : a.kerb;
      if (b && a.kerb !== b.kerb) this.kerb[i] = (a.kerb ? 1 - w : w) * Math.max(a.kerb, b.kerb) * (w > 0.15 && w < 0.85 ? 0 : 1);
      this.surf[i] = (b && w > 0.5) ? b.surf : a.surf;
      this.cat[i] = a.cat;
      const lw = this.laneW[i];
      this.lanes[i] = Math.max(1, Math.round((this.edge[i] - this.med[i]) / lw - 0.15));
      this.medKerb[i] = this.cat[i] === CAT.city && this.med[i] > 0.6 ? 1 : 0;
      this.medBarrier[i] = (this.cat[i] === CAT.highway || (b && CAT_NAMES[b.cat] === 'highway' && w > 0.5)) && this.med[i] > 1.2 ? 1 : 0;
    }
    // concrete pavement only on the full-width highway (asphalt in the tapers)
    for (let i = 0; i < n; i++) if (this.surf[i] && this.med[i] < 1.95) this.surf[i] = 0;

    // ---- 2. structures --------------------------------------------------------------
    for (const st of R.structures) {
      for (let i = st.i0; i <= st.i1; i++) {
        if (st.type === 'tunnel') {
          this.tunnel[i] = 1;
          this.pave[i] = this.edge[i] + 0.3;
          this.kerb[i] = 0.22; this.walk[i] = 0.9;
        } else this.bridge[i] = 1;
      }
    }

    // ---- 3. visual bank: keep the paved edge above the terrain formation (ry - 0.3)
    for (let i = 0; i < n; i++) {
      const b = R.bank[i], lim = 0.26 / Math.max(3, this.pave[i] + (this.kerb[i] ? this.walk[i] : 0.6));
      this.bankV[i] = Math.sign(b) * Math.min(Math.abs(b), lim);
    }

    // natural terrain beside the road (sampled every 10 m, interpolated)
    for (let i = 0; i < n; i += 5) {
      const h = R.heading[i] * Math.PI / 180, c = Math.cos(h), sn = Math.sin(h);
      const off = this.halfW[i] + 12;
      this.natR[i] = GEO.naturalHeight(R.x[i] + c * off, R.z[i] + sn * off, DEP, ARR);
      this.natL[i] = GEO.naturalHeight(R.x[i] - c * off, R.z[i] - sn * off, DEP, ARR);
    }
    for (let i = 0; i < n; i++) {
      if (i % 5 === 0) continue;
      const a = i - (i % 5), b = Math.min(n - 1, a + 5), t = (i - a) / 5;
      this.natR[i] = this.natR[a] + (this.natR[b] - this.natR[a]) * t;
      this.natL[i] = this.natL[a] + (this.natL[b] - this.natL[a]) * t;
    }

    this._features();
    this._centreLines();
    this._guardrails();
    this._lighting();
  }

  // --------------------------------------------------------------------------------
  /** Index of the sample at or before s. */
  idx(s) { return clamp(Math.floor(s / this.R.step), 0, this.n - 1); }
  /** Interpolated section at s into `o`. */
  at(s, o = {}) {
    const f = clamp(s / this.R.step, 0, this.n - 1.0001);
    const i = Math.floor(f), t = f - i, j = Math.min(this.n - 1, i + 1);
    const L = (a) => a[i] + (a[j] - a[i]) * t;
    o.med = L(this.med); o.laneW = L(this.laneW); o.edge = L(this.edge); o.pave = L(this.pave);
    o.kerb = L(this.kerb); o.walk = L(this.walk); o.halfW = L(this.halfW); o.bank = L(this.bankV);
    const k = t < 0.5 ? i : j;
    o.lanes = this.lanes[k]; o.surf = this.surf[k]; o.cat = this.cat[k]; o.tunnel = this.tunnel[k]; o.bridge = this.bridge[k];
    o.medKerb = this.medKerb[k]; o.medBarrier = this.medBarrier[k];
    return o;
  }
  /** Road-surface height at (s, lat) as rendered (visual bank). */
  heightAt(s, lat) {
    const R = this.R;
    const f = clamp(s / R.step, 0, this.n - 1.0001);
    const i = Math.floor(f), t = f - i;
    const y = R.y[i] + (R.y[i + 1] - R.y[i]) * t;
    const b = this.bankV[i] + (this.bankV[i + 1] - this.bankV[i]) * t;
    return y - b * lat;
  }

  // --------------------------------------------------------------------------------
  _features() {
    const R = this.R;
    const F = this.features = [];
    const sOfWp = (k) => R.nearestS(WAYPOINTS[k].x, WAYPOINTS[k].z);
    const hdg = (s) => R.sample(s).heading;
    const lastWp = WAYPOINTS.length - 1;
    this.junctions = [];
    this.crossings = [];
    this.signalDefs = [];
    this.signs = [];
    this.stops = [];
    this.overpasses = [];
    this.sideRoads = [];
    const segAt = (s) => this.cat[this.idx(s)];
    const addJ = (j) => { this.junctions.push(j); return j; };

    // ---- Cedar Bay (town): corners & cross streets ----------------------------------
    const c1 = sOfWp(1), c2 = sOfWp(2), c3 = sOfWp(3), townEnd = R.segments.find((g) => g.type === 'town').s1;
    // corner 1: arriving westbound, turning north; legs continue west & south
    addJ({ s: c1, legs: [hdg(c1 - 40), (hdg(c1 + 40) + 180) % 360], kind: 'street', signal: true, name: 'Harbor Ave' });
    addJ({ s: c2, legs: [hdg(c2 - 40), (hdg(c2 + 40) + 180) % 360], kind: 'street', signal: true, name: 'Mill St' });
    const mid = (c2 + c3) / 2 + 40;
    addJ({ s: mid, legs: [(hdg(mid) + 90) % 360, (hdg(mid) + 270) % 360], kind: 'street', signal: true, name: 'Elm St' });
    // unsignalised side streets (alternating sides), avoiding the signalised ones
    const town = [];
    for (let s = 150; s < townEnd - 250; s += 120 + 90 * hash1(Math.round(s))) {
      if (this.junctions.some((j) => Math.abs(j.s - s) < 70)) continue;
      town.push(s);
    }
    town.forEach((s, k) => {
      const side = (k + Math.round(s)) % 3 === 0 ? 0 : (k % 2 ? 1 : -1);
      const h = hdg(s);
      const legs = side === 0 ? [(h + 90) % 360, (h + 270) % 360] : [(h + (side > 0 ? 90 : 270)) % 360];
      addJ({ s, legs, kind: 'street', signal: false, giveWay: true });
    });
    // zebra crossings in town (mid-block, near the station)
    for (const s of [95, c1 - 260, c2 + 230]) if (s > 30 && s < townEnd - 50) this.crossings.push({ s, kind: 'zebra', w: 4 });

    // ---- Port Solano (city) --------------------------------------------------------
    const p1 = sOfWp(lastWp - 2), p2 = sOfWp(lastWp - 1), cityS0 = R.segments.find((g) => g.type === 'city').s0;
    addJ({ s: p1, legs: [hdg(p1 - 50), (hdg(p1 + 50) + 180) % 360], kind: 'avenue', signal: true, name: 'Marina Blvd' });
    addJ({ s: p2, legs: [hdg(p2 - 40), (hdg(p2 + 40) + 180) % 360], kind: 'avenue', signal: true, name: 'Harbour Rd' });
    const pm1 = (p1 + p2) / 2, pm2 = p2 + (R.length - p2) * 0.45;
    addJ({ s: pm1, legs: [(hdg(pm1) + 90) % 360, (hdg(pm1) + 270) % 360], kind: 'avenue', signal: true, name: 'Calle Mayor' });
    if (R.length - pm2 > 120) addJ({ s: pm2, legs: [(hdg(pm2) + 90) % 360, (hdg(pm2) + 270) % 360], kind: 'avenue', signal: true, name: 'Via Solano' });
    for (let s = cityS0 + 600; s < R.length - 120; s += 160 + 80 * hash1(Math.round(s) + 7)) {
      if (this.junctions.some((j) => Math.abs(j.s - s) < 80)) continue;
      const side = hash1(Math.round(s)) < 0.5 ? 1 : -1, h = hdg(s);
      addJ({ s, legs: [(h + (side > 0 ? 90 : 270)) % 360], kind: 'street', signal: false, giveWay: true });
    }
    for (const j of this.junctions.filter((jj) => jj.signal)) this.crossings.push({ s: j.s - (j.kind === 'avenue' ? 13 : 10), kind: 'zebra', w: 4, signal: true }, { s: j.s + (j.kind === 'avenue' ? 13 : 10), kind: 'zebra', w: 4, signal: true });

    // ---- rural side roads, farm tracks, Ridgefield crossroads ---------------------------
    const ridge = R.stops.find((s) => s.id === 'ridgefield');
    if (ridge) {
      addJ({ s: ridge.s + 140, legs: [(hdg(ridge.s + 140) + 80) % 360, (hdg(ridge.s + 140) + 265) % 360], kind: 'lane', signal: false, giveWay: true, name: 'Church Rd' });
      this.crossings.push({ s: ridge.s - 45, kind: 'zebra', w: 3.5 });
      this.village = { s0: ridge.s - 650, s1: ridge.s + 550, name: 'Ridgefield' };
    }
    const r = rng(214);
    for (let s = 300; s < R.length - 200; s += 500 + r() * 1300) {
      const c = segAt(s);
      if (c !== CAT.rural && c !== CAT.coastal && c !== CAT.mountain && c !== CAT.ramp) continue;
      const i = this.idx(s);
      if (this.tunnel[i] || this.bridge[i]) continue;
      if (Math.abs(R.curvature[i]) > 1 / 500) continue;
      if (this.junctions.some((j) => Math.abs(j.s - s) < 250)) continue;
      if (R.stops.some((st) => Math.abs(st.s - s) < 300)) continue;
      if (R.structures.some((st) => s > st.s0 - 300 && s < st.s1 + 300)) continue;
      const side = r() < 0.5 ? 1 : -1;
      const h = hdg(s);
      const kind = c === CAT.mountain ? (r() < 0.6 ? 'track' : 'lane') : (r() < 0.65 ? 'track' : 'lane');
      addJ({ s, legs: [(h + (side > 0 ? 1 : -1) * (70 + r() * 35) + 360) % 360], kind, signal: false, giveWay: kind === 'lane' });
    }
    // highway: exit 31 (the highway continues west), the on-ramp merge (continues east)
    const ex = R.landmarks.find((l) => /Exit 31/.test(l.name));
    const onr = R.segments.find((g) => g.type === 'highway');
    if (ex) this.exit31 = { s: ex.s, gore: ex.s - 260 };
    if (onr) this.merge = { s: onr.s0 };
    // overpasses (cross roads bridging the highway) on straight stretches
    if (onr) {
      for (const f of [0.22, 0.62]) {
        let s = onr.s0 + (onr.s1 - onr.s0) * f;
        for (let k = 0; k < 40 && Math.abs(R.curvature[this.idx(s)]) > 1 / 3000; k++) s += 50;
        this.overpasses.push({ s, angle: 78 + 18 * hash1(Math.round(s)), name: f < 0.5 ? 'County Rd 12' : 'Fairview Rd' });
      }
    }
    this.junctions.sort((a, b) => a.s - b.s);
    this.crossings.sort((a, b) => a.s - b.s);
    // junction mouths: no kerbs / posts / edge lines across the side-road opening
    for (const j of this.junctions) {
      const w = j.kind === 'avenue' ? 12 : j.kind === 'street' ? 8 : j.kind === 'lane' ? 6.5 : 4.5;
      const h0 = R.sample(j.s).heading;
      for (const L of j.legs) {
        let rel = ((L - h0 + 540) % 360) - 180;      // -180..180, + = to the right
        const side = rel > 0 ? 1 : 2;
        if (Math.abs(Math.abs(rel) - 180) < 30 || Math.abs(rel) < 30) continue;   // straight-on legs (corners): handled by the corner itself
        const half = w / 2 / Math.max(0.5, Math.abs(Math.sin(rel * Math.PI / 180))) + (j.kind === 'track' ? 3 : 6);
        for (let i = this.idx(j.s - half); i <= this.idx(j.s + half); i++) { this.kerbGap[i] |= side; this.noDelin[i] |= side; this.edgeLine[i] |= side << 2; }
      }
      if (j.signal || j.kind === 'avenue') {
        // corners of town intersections: open both sides
        const half = j.kind === 'avenue' ? 16 : 11;
        for (let i = this.idx(j.s - half); i <= this.idx(j.s + half); i++) { this.kerbGap[i] |= 3; this.noDelin[i] |= 3; }
      }
    }
    // stops: no posts / guardrails at the stop bay
    for (const st of R.stops) {
      const a = st.id === 'hollow-pass' ? 180 : 60;
      for (let i = this.idx(st.s - a); i <= this.idx(st.s + a); i++) this.noDelin[i] |= 1;
      if (st.kind === 'shelter') this.stops.push({ s: st.s, id: st.id, side: 1, kind: 'bus' });
    }
    // ---- signals (stop lines) ------------------------------------------------------
    let sid = 0;
    for (const j of this.junctions) {
      if (!j.signal) continue;
      const back = j.kind === 'avenue' ? 17 : 13.5;
      const cycle = j.kind === 'avenue' ? 72 : 60;
      const green = j.kind === 'avenue' ? 34 : 27;
      this.signalDefs.push({ id: `sig${sid++}`, junction: j, s: j.s - back, sOpp: j.s + back, cycle, green, amber: 3, allRed: 2, offset: hash1(Math.round(j.s)) * cycle, town: j.kind === 'avenue' ? 'port-solano' : 'cedar-bay' });
    }
    this._signs();
  }

  // --------------------------------------------------------------------------------
  _signs() {
    const R = this.R, S = this.signs;
    const km = (s) => Math.max(1, Math.round(s / 1000));
    const stopS = (id) => R.stops.find((s) => s.id === id)?.s ?? 0;
    const L = R.length;
    const add = (o) => S.push({ side: 1, facing: 1, ...o });
    // speed limits at segment changes (both directions)
    for (let k = 1; k < R.segments.length; k++) {
      const g = R.segments[k], prev = R.segments[k - 1];
      const lim = ROAD_TYPES[g.type].limitKmh, limPrev = ROAD_TYPES[prev.type].limitKmh;
      if (lim !== limPrev) {
        add({ s: g.s0 + 40, kind: 'speed', value: lim });
        add({ s: g.s0 - 40, kind: 'speed', value: limPrev, side: -1, facing: -1 });
      }
      if (g.type !== 'highway') add({ s: g.s0 + 40 + 1000 + 600 * hash1(k), kind: 'speed', value: lim, repeat: true });
    }
    // village limits (Ridgefield: 50 within the village)
    if (this.village) {
      const v = this.village;
      add({ s: v.s0, kind: 'town', text: v.name, sub: 'Hollow County' });
      add({ s: v.s0 + 8, kind: 'speed', value: 50 });
      add({ s: v.s1, kind: 'townEnd', text: v.name });
      add({ s: v.s1 + 10, kind: 'speed', value: 80 });
      add({ s: v.s1, kind: 'town', text: v.name, side: -1, facing: -1 });
      add({ s: v.s0, kind: 'townEnd', text: v.name, side: -1, facing: -1 });
    }
    const townEnd = R.segments.find((g) => g.type === 'town').s1;
    add({ s: townEnd - 60, kind: 'townEnd', text: 'Cedar Bay' });
    add({ s: townEnd - 60, kind: 'town', text: 'Cedar Bay', side: -1, facing: -1 });
    const cityS0 = R.segments.find((g) => g.type === 'city').s0;
    add({ s: cityS0 - 80, kind: 'town', text: 'Port Solano', sub: 'City of' });
    // direction signs
    const kmTo = (s1, s0) => Math.max(1, Math.round((s1 - s0) / 1000));
    add({ s: townEnd - 380, kind: 'dir', panel: 'green', lines: [['9', 'Highway 9 West', ''], ['', 'Ridgefield', `${kmTo(stopS('ridgefield'), townEnd - 380)}`], ['', 'Port Solano', `${kmTo(L, townEnd - 380)}`]] });
    const hw = R.segments.find((g) => g.type === 'highway');
    add({ s: hw.s0 + 900, kind: 'dir', panel: 'green', lines: [['', 'Ridgefield', `${kmTo(stopS('ridgefield'), hw.s0 + 900)}`], ['', 'Hollow Pass', `${kmTo(stopS('hollow-pass'), hw.s0 + 900)}`], ['', 'Port Solano', `${kmTo(L, hw.s0 + 900)}`]] });
    if (this.exit31) {
      const e = this.exit31.gore;
      for (const d of [2000, 1000, 500]) add({ s: e - d, kind: 'dir', panel: 'green', lines: [['31', 'Ridgefield', ''], ['', 'Hollow Pass  525 m', ''], ['', `${d >= 1000 ? d / 1000 + ' km' : d + ' m'}`, '']], exit: true });
      for (const d of [300, 200, 100]) add({ s: e - d, kind: 'countdown', value: d / 100 });
      add({ s: e - 40, kind: 'gantry', panels: [{ lat: -6.5, lines: [['9', 'Highway 9 West', ''], ['', 'Lakeview', ''], ['', 'Westport', '']], arrow: 'down' }, { lat: 5.5, lines: [['31', 'Ridgefield', ''], ['', 'Hollow Pass', ''], ['', 'Port Solano', '']], arrow: 'upright', exit: true }] });
      add({ s: e + 120, kind: 'exitGore' });
    }
    if (this.merge) add({ s: this.merge.s + 250, kind: 'dir', panel: 'green', lines: [['9', 'West', ''], ['', 'Exit 31  Ridgefield', '']] });
    const ridge = stopS('ridgefield');
    add({ s: ridge + 650, kind: 'dir', panel: 'white', lines: [['', 'Hollow Pass  525 m', `${kmTo(stopS('hollow-pass'), ridge + 650)}`], ['', 'Port Solano', `${kmTo(L, ridge + 650)}`]], status: 'OPEN' });
    add({ s: ridge - 300, kind: 'busStopAhead' });
    // tunnels: advance signs
    for (const st of R.structures) {
      if (st.type !== 'tunnel') continue;
      add({ s: st.s0 - 350, kind: 'tunnel', text: st.name, sub: `${Math.round(st.s1 - st.s0)} m` });
      add({ s: st.s0 - 220, kind: 'lights' });
      add({ s: st.s1 + 350, kind: 'tunnel', text: st.name, sub: `${Math.round(st.s1 - st.s0)} m`, side: -1, facing: -1 });
    }
    // summit
    const pass = R.landmarks.find((l) => l.name === 'Hollow Pass');
    if (pass) {
      add({ s: pass.s - 30, kind: 'summit', text: 'Hollow Pass', sub: '525 m' });
      add({ s: pass.s + 30, kind: 'summit', text: 'Hollow Pass', sub: '525 m', side: -1, facing: -1 });
      const rest = stopS('hollow-pass');
      add({ s: rest - 1000, kind: 'rest', sub: '1000 m' });
      add({ s: rest - 300, kind: 'rest', sub: '300 m' });
    }
    // valley / coast
    const mouth = R.landmarks.find((l) => /mouth/.test(l.name));
    if (mouth) {
      add({ s: mouth.s - 1500, kind: 'dir', panel: 'white', lines: [['', 'Gulf Coast', ''], ['', 'Port Solano', `${kmTo(L, mouth.s - 1500)}`]] });
      add({ s: mouth.s + 900, kind: 'dir', panel: 'white', lines: [['', 'Port Solano', `${kmTo(L, mouth.s + 900)}`], ['', 'Cliff Viewpoint', '5']] });
    }
    const coast = R.segments.find((g) => g.type === 'coastal');
    if (coast) {
      for (const f of [0.35, 0.7]) { const s = coast.s0 + (coast.s1 - coast.s0) * f; add({ s, kind: 'dir', panel: 'white', lines: [['', 'Port Solano', `${kmTo(L, s)}`]] }); }
      add({ s: coast.s0 + 2400, kind: 'warn', icon: 'rocks' });
      add({ s: coast.s0 + 9000, kind: 'warn', icon: 'wind' });
    }
    add({ s: cityS0 + 400, kind: 'dir', panel: 'blue', lines: [['', 'Centro', ''], ['', 'Central Station', ''], ['', 'Port', '']] });
    add({ s: L - 300, kind: 'busStation' });
    // curve warnings & chevrons on tight curves (rural / mountain / coastal / ramp)
    this.chevrons = [];
    let i = 0;
    const n = this.n;
    while (i < n) {
      const k = R.curvature[i], c = this.cat[i];
      if ((c === CAT.rural || c === CAT.mountain || c === CAT.coastal || c === CAT.ramp) && Math.abs(k) > 1 / 190 && !this.tunnel[i]) {
        let j = i;
        while (j < n && Math.abs(R.curvature[j]) > 1 / 260 && Math.sign(R.curvature[j]) === Math.sign(k)) j++;
        const s0 = i * R.step, s1 = j * R.step;
        if (s1 - s0 > 25) {
          const dir = k > 0 ? 'R' : 'L';
          add({ s: s0 - 140, kind: 'curve', dir, value: Math.abs(1 / k) < 120 ? 'tight' : '' });
          add({ s: s1 + 140, kind: 'curve', dir: dir === 'R' ? 'L' : 'R', side: -1, facing: -1 });
          // chevrons on the outside of the curve, visible from both directions
          const nb = Math.max(3, Math.min(8, Math.round((s1 - s0) / 22)));
          for (let b = 0; b < nb; b++) this.chevrons.push({ s: s0 + (s1 - s0) * (b + 0.5) / nb, side: k > 0 ? -1 : 1, dir });
        }
        i = j + 50;
        continue;
      }
      i++;
    }
    // km posts every km (right side), hectometre posts on the highway
    this.kmPosts = [];
    for (let s = 1000; s < L - 200; s += 1000) this.kmPosts.push({ s, km: km(s) });
    S.sort((a, b) => a.s - b.s);
    // drop signs that fall inside tunnels or right on junction mouths
    this.signs = S.filter((g) => {
      const ii = this.idx(g.s);
      if (this.tunnel[ii] || this.bridge[ii]) return false;
      if (g.kind !== 'gantry' && (this.noDelin[ii] & (g.side > 0 ? 1 : 2))) g.s += 18;
      return true;
    });
  }

  // --------------------------------------------------------------------------------
  _centreLines() {
    const R = this.R, n = this.n, C = this.centre;
    // sliding max of |curvature| over ±W samples
    const W = 70;
    const kmax = new Float32Array(n);
    {
      const dq = [];
      const ak = (i) => Math.abs(R.curvature[i]);
      // two-pass running max (window [i-W, i+W])
      for (let i = 0, head = 0; i < n + W; i++) {
        if (i < n) { while (dq.length > head && ak(dq[dq.length - 1]) <= ak(i)) dq.pop(); dq.push(i); }
        const c = i - W;
        if (c >= 0) {
          while (dq[head] < c - W) head++;
          kmax[c] = ak(dq[head]);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const c = this.cat[i];
      if (this.med[i] > 0.4) { C[i] = CL.NONE; continue; }
      const crest = Math.abs(R.grade[Math.min(n - 1, i + 40)] - R.grade[Math.max(0, i - 40)]) > 0.045;
      let st = CL.DASH;
      if (c === CAT.town) st = CL.DASH;
      else if (c === CAT.ramp) st = CL.DOUBLE;
      else {
        const lim = c === CAT.mountain ? 1 / 480 : 1 / 330;
        if (kmax[i] > lim || crest) st = CL.SOLID;
        if (kmax[i] > (c === CAT.mountain ? 1 / 170 : 1 / 140)) st = CL.DOUBLE;
      }
      if (this.tunnel[i]) st = CL.DOUBLE;
      C[i] = st;
    }
    // merge short dashed gaps (< 70 m) between no-passing zones, then warning lines before solids
    const gap = 35;
    for (let i = 0; i < n; i++) {
      if (C[i] !== CL.DASH) continue;
      let j = i;
      while (j < n && C[j] === CL.DASH) j++;
      const prevSolid = i > 0 && C[i - 1] >= CL.SOLID, nextSolid = j < n && C[j] >= CL.SOLID;
      if (prevSolid && nextSolid && j - i < gap) for (let k = i; k < j; k++) C[k] = CL.SOLID;
      i = j;
    }
    for (let i = 1; i < n; i++) {
      if (C[i] >= CL.SOLID && C[i - 1] === CL.DASH) {
        for (let k = Math.max(0, i - 45); k < i; k++) if (C[k] === CL.DASH) C[k] = CL.WARN;
      }
    }
    // no-passing near junctions with side roads, crossings and signals (town too)
    const mark = (s, a, b, st) => { for (let k = this.idx(s - a); k <= this.idx(s + b); k++) if (this.med[k] < 0.4 && C[k] < st) C[k] = st; };
    for (const j of this.junctions) mark(j.s, j.kind === 'track' ? 20 : 40, j.kind === 'track' ? 15 : 30, CL.SOLID);
    for (const c of this.crossings) mark(c.s, 20, 10, CL.SOLID);
    // edge lines (bit 1 right, bit 2 left); bit 4/8 = interrupted at junction mouth
    for (let i = 0; i < n; i++) {
      const c = this.cat[i];
      let e = 3;
      if (c === CAT.town || (c === CAT.city && !this.tunnel[i])) e = 0;
      const gapBits = this.edgeLine[i] >> 2;
      this.edgeLine[i] = e & ~gapBits;
    }
  }

  // --------------------------------------------------------------------------------
  _guardrails() {
    const R = this.R, n = this.n, G = this.guard;
    for (let i = 0; i < n; i++) {
      const c = this.cat[i];
      if (c === CAT.town || c === CAT.city || this.tunnel[i]) continue;
      const y = R.y[i];
      let g = 0;
      const drop = c === CAT.highway ? 2.5 : (c === CAT.rural ? 3.5 : 2.2);
      if (y - this.natR[i] > drop) g |= 1;
      if (y - this.natL[i] > drop) g |= 2;
      const k = R.curvature[i];
      const tight = c === CAT.highway ? 1 / 700 : 1 / 280;
      if (Math.abs(k) > tight && c !== CAT.ramp) g |= k > 0 ? 2 : 1;          // outside of the curve
      if (c === CAT.ramp && Math.abs(k) > 1 / 400) g |= k > 0 ? 2 : 1;
      if (c === CAT.coastal && R.y[i] > 30) g |= 1;   // sea side on the cliff-top terrace
      G[i] = g;
    }
    // tunnel approaches & bridges
    for (const st of R.structures) {
      for (let i = this.idx(st.s0 - 90); i <= this.idx(st.s1 + 90); i++) if (!this.tunnel[i]) G[i] |= 3;
    }
    // highway: guardrails around overpass piers and gantries
    for (const o of this.overpasses) for (let i = this.idx(o.s - 70); i <= this.idx(o.s + 70); i++) G[i] |= 3;
    // cleanup per side: fill gaps < 50 m, drop runs < 40 m, remove at junction mouths / stops
    for (const bit of [1, 2]) {
      const on = (i) => (G[i] & bit) !== 0;
      for (let i = 0; i < n; i++) {
        if (on(i)) continue;
        let j = i;
        while (j < n && !on(j)) j++;
        if (i > 0 && j < n && (j - i) * R.step < 50) for (let k = i; k < j; k++) G[k] |= bit;
        i = j;
      }
      for (let i = 0; i < n; i++) if (this.noDelin[i] & bit) G[i] &= ~bit;
      for (let i = 0; i < n; i++) {
        if (!on(i)) continue;
        let j = i;
        while (j < n && on(j)) j++;
        if ((j - i) * R.step < 40) for (let k = i; k < j; k++) G[k] &= ~bit;
        i = j;
      }
    }
  }

  // --------------------------------------------------------------------------------
  _lighting() {
    const R = this.R, n = this.n, Lp = this.lamp;
    const set = (i, row, spacing, phase, lat, h) => { const o = i * 8 + row * 4; Lp[o] = spacing; Lp[o + 1] = phase; Lp[o + 2] = lat; Lp[o + 3] = h; };
    const villa = this.village;
    for (let i = 0; i < n; i++) {
      const s = i * R.step, c = this.cat[i];
      if (this.tunnel[i]) {
        set(i, 0, 9, 0, this.edge[i] + 0.25, -5.1);          // sodium rows at the upper wall corners, staggered
        set(i, 1, 9, 4.5, -(this.edge[i] + 0.25), -5.1);
      } else if (c === CAT.town) {
        set(i, 0, 64, 0, this.pave[i] - 1.1, -7.5);
        set(i, 1, 64, 32, -(this.pave[i] - 1.1), -7.5);
      } else if (c === CAT.city) {
        set(i, 0, 36, 0, this.med[i] + 1.4, 9);              // median double-arm LED poles
        set(i, 1, 36, 0, -(this.med[i] + 1.4), 9);
      } else if (villa && s > villa.s0 && s < villa.s1) {
        set(i, 0, 40, 0, this.pave[i] - 0.9, 8);
      } else if ((this.merge && Math.abs(s - this.merge.s) < 500) || (this.exit31 && Math.abs(s - this.exit31.gore) < 500)) {
        set(i, 0, 48, 0, this.pave[i] - 1.2, 12);
        set(i, 1, 48, 24, -(this.pave[i] - 1.2), 12);
      }
    }
  }
}
