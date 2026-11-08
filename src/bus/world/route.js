// =============================================================================
// ROUTE CONTRACT — the single road the coach drives: Coastline Express 214,
// Cedar Bay Central -> Port Solano Central via the Hollow Pass (~110 km).
//
// buildRoute() (memoised via getRoute()) turns WAYPOINTS into a dense centreline
// (2 m samples) with: fillet curves (per-waypoint radius), heading, curvature,
// segment type, lanes, speed limit, a road elevation PROFILE (smoothed natural
// terrain, grade-limited per road type), superelevation, automatic TUNNELS
// (deep cuttings) and BRIDGES (high fills / water), and stops. It registers a
// RouteIndex with the bus geography (geo.js setRoadIndex) so the CPU terrain
// height includes the road corridor; the road module renders the same data
// into the GLSL road-field textures (see geo.js GEO_UNIFORMS).
//
// Conventions: s = distance along the route (m) from Cedar Bay Central. Travel
// direction = increasing s. Lateral offset `lat`: + = RIGHT of the travel
// direction (right-hand traffic: our lanes are at lat > 0). Heading in compass
// degrees (0 = north = -Z, 90 = east = +X).
// =============================================================================
import { GEO, BUS_ANCHORS, setRoadIndex, coastXSmooth, ARR_DOWNTOWN, DEP_TOWN, VALLEY } from './geo.js';

const DEP = BUS_ANCHORS.dep, ARR = BUS_ANCHORS.arr;

// Road types: geometry & rules. lanes = per direction. halfW = formation half width
// (carriageway + shoulders + verge), used to cut the terrain corridor.
export const ROAD_TYPES = {
  town: { lanes: 1, laneW: 3.4, shoulder: 0.5, median: 0, halfW: 9.0, limitKmh: 40, maxGrade: 0.08, smooth: 80, kerb: true, sidewalk: 2.5, light: 'street' },
  ramp: { lanes: 1, laneW: 3.75, shoulder: 2.5, median: 0, halfW: 9.0, limitKmh: 70, maxGrade: 0.05, smooth: 200, kerb: false, light: 'none' },
  highway: { lanes: 2, laneW: 3.75, shoulder: 3.0, median: 4.0, halfW: 17.0, limitKmh: 100, maxGrade: 0.04, smooth: 700, kerb: false, light: 'none', divided: true },
  rural: { lanes: 1, laneW: 3.5, shoulder: 1.0, median: 0, halfW: 8.0, limitKmh: 80, maxGrade: 0.06, smooth: 300, kerb: false, light: 'none' },
  mountain: { lanes: 1, laneW: 3.5, shoulder: 0.75, median: 0, halfW: 7.0, limitKmh: 60, maxGrade: 0.075, smooth: 140, kerb: false, light: 'none', guardrail: true },
  coastal: { lanes: 1, laneW: 3.5, shoulder: 1.25, median: 0, halfW: 8.0, limitKmh: 70, maxGrade: 0.06, smooth: 220, kerb: false, light: 'none', guardrail: true },
  city: { lanes: 2, laneW: 3.3, shoulder: 0.5, median: 2.0, halfW: 14.0, limitKmh: 50, maxGrade: 0.07, smooth: 100, kerb: true, sidewalk: 4.0, light: 'street', divided: true },
};

// Valley waypoints: follow the meandering valley floor (geo.js VALLEY), skipping the first point.
function valleyPoints() {
  const pass = VALLEY.reduce((best, v, i) => (v[2] > VALLEY[best][2] ? i : best), 0);
  return VALLEY.slice(1).map((v, k) => {
    const i = k + 1;
    const seg = i <= pass + 6 ? 'mountain' : (i === VALLEY.length - 1 ? 'coastal' : 'rural');
    const wp = { x: v[0], z: v[1], r: seg === 'mountain' ? 210 : 420, seg };
    if (i === pass) wp.name = 'Hollow Pass';
    if (i === VALLEY.length - 1) wp.name = 'Hollow River mouth';
    return wp;
  });
}

// Coast-road waypoints (world) generated along the smoothed shoreline, ~650 m inland.
function coastPoints() {
  const pts = [];
  for (let lz = -46000; lz <= -14000; lz += 2300) {
    pts.push({ x: ARR.x + coastXSmooth(lz) + 650, z: ARR.z + lz, r: 450, seg: 'coastal' });
  }
  return pts;
}

/**
 * Waypoints in WORLD metres. r = fillet radius at the waypoint, seg = road type of
 * the leg starting at this waypoint, name = optional label.
 */
export const WAYPOINTS = [
  // Cedar Bay town (station at the town centre, heading west)
  { x: DEP.x + DEP_TOWN.x + 120, z: DEP.z + DEP_TOWN.z, r: 12, seg: 'town', name: 'Cedar Bay Central' },
  { x: DEP.x + 3300, z: DEP.z - 5200, r: 14, seg: 'town' },
  { x: DEP.x + 3300, z: DEP.z - 5650, r: 16, seg: 'town' },
  { x: DEP.x + 2150, z: DEP.z - 5650, r: 60, seg: 'town' },
  { x: DEP.x + 1400, z: DEP.z - 5950, r: 220, seg: 'ramp', name: 'Highway 9 on-ramp' },
  // Highway 9 west across the farmland
  { x: DEP.x - 1800, z: DEP.z - 6700, r: 1800, seg: 'highway' },
  { x: DEP.x - 9000, z: DEP.z - 7600, r: 2200, seg: 'highway' },
  { x: DEP.x - 15500, z: DEP.z - 9300, r: 2000, seg: 'highway' },
  { x: DEP.x - 20200, z: DEP.z - 10300, r: 260, seg: 'ramp', name: 'Exit 31 Ridgefield' },
  // foothills, Ridgefield village
  { x: DEP.x - 21800, z: DEP.z - 10900, r: 300, seg: 'rural' },
  { x: DEP.x - 24300, z: DEP.z - 11350, r: 350, seg: 'rural', name: 'Ridgefield' },
  { x: DEP.x - 26800, z: DEP.z - 12100, r: 260, seg: 'rural' },
  // up the Hollow valley to the pass, then down the Hollow River valley to the gulf
  ...valleyPoints(),
  // the coast road south along the gulf (sea on the RIGHT), into Port Solano
  ...coastPoints(),
  { x: ARR.x + coastXSmooth(-12200) + 900, z: ARR.z - 12200, r: 260, seg: 'city', name: 'Port Solano city limits' },
  { x: ARR.x + coastXSmooth(-9600) + 1100, z: ARR.z - 9600, r: 40, seg: 'city' },
  { x: ARR.x + ARR_DOWNTOWN.x + 120, z: ARR.z - 9600, r: 30, seg: 'city' },
  { x: ARR.x + ARR_DOWNTOWN.x + 120, z: ARR.z + ARR_DOWNTOWN.z + 250, r: 12, seg: 'city', name: 'Port Solano Central' },
];

/** Stops along the route. `at` = world point; s is resolved to the nearest route position. */
export const STOP_DEFS = [
  { id: 'cedar-bay', name: 'Cedar Bay Central', kind: 'terminal', at: [WAYPOINTS[0].x, WAYPOINTS[0].z], dwell: 0, bay: 'Bay 4' },
  { id: 'ridgefield', name: 'Ridgefield, Main St', kind: 'shelter', at: [DEP.x - 24300, DEP.z - 11350], dwell: 35 },
  { id: 'hollow-pass', name: 'Hollow Pass Summit Rest Area', kind: 'restArea', at: [DEP.x - 37300, DEP.z - 14300], dwell: 600, offset: 'right' },
  { id: 'port-solano', name: 'Port Solano Central', kind: 'terminal', at: [WAYPOINTS[WAYPOINTS.length - 1].x, WAYPOINTS[WAYPOINTS.length - 1].z], dwell: 0, bay: 'Bay 11' },
];

const STEP = 2;
const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// --- centreline with per-waypoint fillets -----------------------------------------
function filletPolyline(wps) {
  const out = []; // {x, z, wp}
  const push = (x, z, wp) => {
    const l = out[out.length - 1];
    if (l && Math.hypot(x - l.x, z - l.z) < 1e-6) return;
    out.push({ x, z, wp });
  };
  push(wps[0].x, wps[0].z, 0);
  for (let i = 1; i < wps.length - 1; i++) {
    const a = wps[i - 1], b = wps[i], c = wps[i + 1];
    const d1x = b.x - a.x, d1z = b.z - a.z, l1 = Math.hypot(d1x, d1z);
    const d2x = c.x - b.x, d2z = c.z - b.z, l2 = Math.hypot(d2x, d2z);
    const u1x = d1x / l1, u1z = d1z / l1, u2x = d2x / l2, u2z = d2z / l2;
    const turn = Math.acos(Math.max(-1, Math.min(1, u1x * u2x + u1z * u2z)));
    if (turn < 1e-4) { push(b.x, b.z, i); continue; }
    let r = b.r || 30;
    let t = r * Math.tan(turn / 2);
    const maxT = Math.min(l1, l2) * 0.49;
    if (t > maxT) { t = maxT; r = t / Math.tan(turn / 2); }
    const sx = b.x - u1x * t, sz = b.z - u1z * t, ex = b.x + u2x * t, ez = b.z + u2z * t;
    const cross = u1x * u2z - u1z * u2x;
    const nx = cross > 0 ? -u1z : u1z, nz = cross > 0 ? u1x : -u1x;
    const cx = sx + nx * r, cz = sz + nz * r;
    push(sx, sz, i - 1);
    const a0 = Math.atan2(sz - cz, sx - cx), a1 = Math.atan2(ez - cz, ex - cx);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const n = Math.max(2, Math.ceil(Math.abs(da) * r / 1.0));
    for (let k = 1; k <= n; k++) {
      const ang = a0 + da * (k / n);
      push(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r, k < n / 2 ? i - 1 : i);
    }
  }
  push(wps[wps.length - 1].x, wps[wps.length - 1].z, wps.length - 2);
  return out;
}

function movingAverage(arr, windowFor) {
  const n = arr.length, pre = new Float64Array(n + 1), out = new Float64Array(n);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + arr[i];
  for (let i = 0; i < n; i++) {
    const w = Math.max(1, Math.round(windowFor(i) / 2 / STEP));
    const a = Math.max(0, i - w), b = Math.min(n - 1, i + w);
    out[i] = (pre[b + 1] - pre[a]) / (b - a + 1);
  }
  return out;
}

export class Route {
  constructor() {
    const poly = filletPolyline(WAYPOINTS);
    // resample at STEP metres
    const xs = [], zs = [], wpi = [];
    let carry = 0;
    xs.push(poly[0].x); zs.push(poly[0].z); wpi.push(0);
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i], b = poly[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      let t = STEP - carry;
      while (t <= len) { xs.push(a.x + (b.x - a.x) * t / len); zs.push(a.z + (b.z - a.z) * t / len); wpi.push(a.wp); t += STEP; }
      carry = len - (t - STEP);
    }
    const n = xs.length;
    this.n = n; this.step = STEP; this.length = (n - 1) * STEP;
    this.x = new Float64Array(xs); this.z = new Float64Array(zs);
    this.y = new Float64Array(n); this.natural = new Float64Array(n);
    this.heading = new Float64Array(n); this.curvature = new Float64Array(n);
    this.bank = new Float64Array(n); this.grade = new Float64Array(n);
    this.mode = new Float32Array(n);   // 1 normal, 0 tunnel / bridge
    this.seg = new Array(n); this.wp = new Int32Array(wpi);
    for (let i = 0; i < n; i++) this.seg[i] = WAYPOINTS[Math.min(wpi[i], WAYPOINTS.length - 1)].seg;

    // heading & curvature
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      this.heading[i] = ((Math.atan2(this.x[b] - this.x[a], -(this.z[b] - this.z[a])) * 180 / Math.PI) + 360) % 360;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
      let dh = this.heading[b] - this.heading[a];
      while (dh > 180) dh -= 360; while (dh < -180) dh += 360;
      this.curvature[i] = (dh * Math.PI / 180) / Math.max(STEP, (b - a) * STEP); // + = turning right
    }

    // natural terrain & water along the centreline
    const water = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.natural[i] = GEO.naturalHeight(this.x[i], this.z[i], DEP, ARR);
      water[i] = GEO.waterMask(this.x[i], this.z[i], DEP, ARR);
      if (water[i] > 0.5) this.natural[i] = Math.min(this.natural[i], -3);
    }

    // profile: smooth, then grade-limit forward/backward, then soften vertical curves
    const T = (i) => ROAD_TYPES[this.seg[i]];
    const base = Float64Array.from(this.natural, (h, i) => Math.max(h, water[i] > 0.5 ? 4 : h));
    let p = movingAverage(base, (i) => T(i).smooth);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < n; i++) { const g = T(i).maxGrade * STEP; p[i] = Math.min(Math.max(p[i], p[i - 1] - g), p[i - 1] + g); }
      for (let i = n - 2; i >= 0; i--) { const g = T(i).maxGrade * STEP; p[i] = Math.min(Math.max(p[i], p[i + 1] - g), p[i + 1] + g); }
      p = movingAverage(p, () => 60);
    }
    for (let i = 0; i < n; i++) this.y[i] = p[i];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 5), b = Math.min(n - 1, i + 5);
      this.grade[i] = (this.y[b] - this.y[a]) / ((b - a) * STEP);
    }

    // structures
    this.structures = [];
    const mark = (pred, minLen, pad, mergeGap, type) => {
      const runs = [];
      let start = -1;
      for (let i = 0; i <= n; i++) {
        const on = i < n && pred(i);
        if (on && start < 0) start = i;
        if (!on && start >= 0) { runs.push([start, i - 1]); start = -1; }
      }
      const merged = [];
      for (const r of runs) {
        const last = merged[merged.length - 1];
        if (last && (r[0] - last[1]) * STEP < mergeGap) last[1] = r[1]; else merged.push([...r]);
      }
      for (const [a, b] of merged) {
        if ((b - a) * STEP < minLen) continue;
        const i0 = Math.max(0, a - Math.round(pad / STEP)), i1 = Math.min(n - 1, b + Math.round(pad / STEP));
        this.structures.push({ type, s0: i0 * STEP, s1: i1 * STEP, i0, i1, maxDepth: 0 });
      }
    };
    const urban = (i) => this.seg[i] === 'town' || this.seg[i] === 'city';
    mark((i) => !urban(i) && this.natural[i] - this.y[i] > 32, 120, 12, 160, 'tunnel');
    mark((i) => !urban(i) && (this.y[i] - this.natural[i] > 14 || water[i] > 0.5), 40, 8, 80, 'bridge');
    this.structures.sort((a, b) => a.s0 - b.s0);
    this.mode.fill(1);
    for (const st of this.structures) {
      let depth = 0;
      for (let i = st.i0; i <= st.i1; i++) { this.mode[i] = 0; depth = Math.max(depth, Math.abs(this.natural[i] - this.y[i])); }
      st.maxDepth = depth;
      st.name = st.type === 'tunnel' ? `${this._nearName(st.i0)} Tunnel` : `${this._nearName(st.i0)} Viaduct`;
    }

    // superelevation (design speed = type limit), capped 6 % (4 % urban)
    for (let i = 0; i < n; i++) {
      const t = T(i), v = t.limitKmh / 3.6;
      const e = Math.min(urban(i) ? 0.0 : 0.06, Math.abs(this.curvature[i]) * v * v / 9.81 * 0.45);
      this.bank[i] = Math.sign(this.curvature[i]) * e; // + = right side lower (curve to the right)
    }

    this.index = new RouteIndex(this);

    // stops
    this.stops = STOP_DEFS.map((d) => ({ ...d, s: this.nearestS(d.at[0], d.at[1]) }));
    this.stops[0].s = 0;
    this.stops[this.stops.length - 1].s = this.length;

    // named waypoints -> s
    this.landmarks = WAYPOINTS.map((w, i) => ({ name: w.name, i, s: this.nearestS(w.x, w.z) })).filter((l) => l.name);

    // segments (contiguous runs of the same type)
    this.segments = [];
    for (let i = 0; i < n; i++) {
      const last = this.segments[this.segments.length - 1];
      if (!last || last.type !== this.seg[i]) this.segments.push({ type: this.seg[i], s0: i * STEP, s1: i * STEP });
      else last.s1 = i * STEP;
    }

    setRoadIndex(this.index);
  }

  _nearName(i) {
    let best = 'Hollow', bd = Infinity;
    for (const w of WAYPOINTS) { if (!w.name) continue; const d = Math.hypot(w.x - this.x[i], w.z - this.z[i]); if (d < bd) { bd = d; best = w.name.replace(/ (Central|Pass|Summit.*|village)$/i, ''); } }
    return best;
  }

  /** Interpolated centreline sample at distance s. */
  sample(s, out = {}) {
    const f = Math.max(0, Math.min(this.length, s)) / STEP;
    const i = Math.min(this.n - 2, Math.floor(f)), t = f - i;
    const L = (arr) => arr[i] + (arr[i + 1] - arr[i]) * t;
    let dh = this.heading[i + 1] - this.heading[i];
    while (dh > 180) dh -= 360; while (dh < -180) dh += 360;
    out.s = s; out.x = L(this.x); out.z = L(this.z); out.y = L(this.y);
    out.heading = (this.heading[i] + dh * t + 360) % 360;
    out.curvature = L(this.curvature); out.grade = L(this.grade); out.bank = L(this.bank);
    out.natural = L(this.natural); out.mode = L(this.mode);
    out.seg = this.seg[t < 0.5 ? i : i + 1]; out.type = ROAD_TYPES[out.seg];
    return out;
  }

  /** World position of a point at distance s and lateral offset lat (+ = right of travel). */
  pointAt(s, lat = 0, out = {}) {
    const c = this.sample(s, out);
    const h = c.heading * Math.PI / 180;
    // right vector of heading h: forward = (sin h, -cos h) in (x, z) -> right = (cos h, sin h)
    out.x = c.x + Math.cos(h) * lat; out.z = c.z + Math.sin(h) * lat;
    out.y = c.y - c.bank * lat;
    return out;
  }

  /** Centre of lane k (0 = rightmost... no: 0 = lane next to the centre/median) in direction dir (+1 ours, -1 oncoming). */
  laneOffset(s, dir = 1, k = 0) {
    const t = ROAD_TYPES[this.sample(s).seg];
    const inner = (t.median || 0) / 2;
    const lat = inner + t.laneW * (k + 0.5);
    return dir > 0 ? lat : -lat;
  }

  structureAt(s) { return this.structures.find((st) => s >= st.s0 && s <= st.s1) || null; }
  segmentAt(s) { return this.segments.find((g) => s >= g.s0 && s <= g.s1) || this.segments[this.segments.length - 1]; }
  nearestS(x, z) { return this.index.nearest(x, z).s; }
}

// --- spatial index -----------------------------------------------------------------
export class RouteIndex {
  constructor(route, cell = 200) {
    this.r = route; this.cell = cell;
    this.map = new Map();
    for (let i = 0; i < route.n - 1; i++) {
      const x0 = Math.min(route.x[i], route.x[i + 1]), x1 = Math.max(route.x[i], route.x[i + 1]);
      const z0 = Math.min(route.z[i], route.z[i + 1]), z1 = Math.max(route.z[i], route.z[i + 1]);
      for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) {
        for (let cz = Math.floor(z0 / cell); cz <= Math.floor(z1 / cell); cz++) {
          const k = cx * 1e6 + cz;
          let a = this.map.get(k);
          if (!a) { a = []; this.map.set(k, a); }
          a.push(i);
        }
      }
    }
    let xm = Infinity, xM = -Infinity, zm = Infinity, zM = -Infinity;
    for (let i = 0; i < route.n; i++) { xm = Math.min(xm, route.x[i]); xM = Math.max(xM, route.x[i]); zm = Math.min(zm, route.z[i]); zM = Math.max(zM, route.z[i]); }
    this.bounds = { xMin: xm, xMax: xM, zMin: zm, zMax: zM };
  }

  /** Nearest centreline point: { d, s, i, t, lat (+ right of travel), y, mode, halfW, seg } (d = Infinity beyond maxD). */
  nearest(x, z, maxD = 450, out = {}) {
    const R = this.r, c = this.cell;
    const rad = Math.ceil(maxD / c);
    const cx0 = Math.floor(x / c), cz0 = Math.floor(z / c);
    let best = Infinity, bi = -1, bt = 0;
    const seen = new Set();
    for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
      const a = this.map.get((cx0 + dx) * 1e6 + (cz0 + dz));
      if (!a) continue;
      for (const i of a) {
        if (seen.has(i)) continue; seen.add(i);
        const ax = R.x[i], az = R.z[i], bx = R.x[i + 1] - ax, bz = R.z[i + 1] - az;
        const L2 = bx * bx + bz * bz;
        let t = L2 > 0 ? ((x - ax) * bx + (z - az) * bz) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        const px = ax + bx * t - x, pz = az + bz * t - z;
        const d2 = px * px + pz * pz;
        if (d2 < best) { best = d2; bi = i; bt = t; }
      }
    }
    if (bi < 0 || best > maxD * maxD) { out.d = Infinity; out.s = NaN; return out; }
    const i = bi, t = bt;
    const ax = R.x[i], az = R.z[i], bx = R.x[i + 1] - ax, bz = R.z[i + 1] - az;
    const L = Math.hypot(bx, bz) || 1;
    // signed lateral: right of travel direction is (fz... ) right = (-fwd.z, fwd.x) in (x,z) with fwd=(bx,bz)/L
    const rx = -bz / L, rz = bx / L;
    out.d = Math.sqrt(best); out.i = i; out.t = t; out.s = (i + t) * STEP;
    out.lat = (x - (ax + bx * t)) * rx + (z - (az + bz * t)) * rz;
    out.y = R.y[i] + (R.y[i + 1] - R.y[i]) * t - R.bank[i] * out.lat * (Math.abs(out.lat) < 20 ? 1 : 0);
    out.mode = R.mode[i] + (R.mode[i + 1] - R.mode[i]) * t;
    out.seg = R.seg[i];
    out.halfW = ROAD_TYPES[R.seg[i]].halfW;
    return out;
  }

  /** Terrain-corridor data used by geo.applyRoad (same values the GPU road field stores). */
  field(x, z) {
    const n = this.nearest(x, z, 420, this._tmp || (this._tmp = {}));
    if (!Number.isFinite(n.d)) return null;
    return { ry: this.r.y[n.i] + (this.r.y[n.i + 1] - this.r.y[n.i]) * n.t, d: n.d, mode: n.mode, halfW: n.halfW };
  }
}

let _route = null;
/** The (memoised) route. Building takes ~0.2-0.5 s; call once at init. */
export function getRoute() { if (!_route) _route = new Route(); return _route; }
