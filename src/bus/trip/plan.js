// =============================================================================
// ROUTE PLAN — precomputed once from the route (pure JS):
//  * lane paths (lateral offset of each lane centre, smoothed over ±120 m at
//    road-type changes so merges / diverges are continuous),
//  * the driver's static speed profile: posted limit x a per-road "driver
//    factor" (0.92-0.98), curve speed from a coach-comfortable lateral
//    acceleration (1.6 -> 1.25 m/s² from town to highway speeds, a little
//    credit for superelevation), steep-downgrade limits, speed humps / cattle
//    grids / tunnel, then a backward pass (anticipated deceleration 0.65 m/s²),
//  * deterministic road events (bridge / tunnel joints, potholes on rural
//    roads, manhole covers in town, speed humps, cattle grids),
//  * turn-indicator events (junction turns in town, lane-path shifts),
//  * phase bounds along s and the timetable (planned elapsed time vs s,
//    power-limited forward pass + stop dwells) used for ETA and the sun clock.
// =============================================================================
import { ROAD_TYPES } from '../world/route.js';
import { clamp, clamp01, lerp, smoothstep, curve, hash1 } from './util.js';
import { BAY_DEFS } from './bays.js';
import { VEH, G } from './vehicle.js';

export const KMH = 1 / 3.6;
export const DRIVER_FACTOR = { town: 0.92, ramp: 0.93, highway: 0.95, rural: 0.94, mountain: 0.95, coastal: 0.96, city: 0.95 };
export const ROUGHNESS = { town: 0.26, ramp: 0.14, highway: 0.1, rural: 0.4, mountain: 0.3, coastal: 0.28, city: 0.22 };
/** Comfortable acceleration a coach driver uses (m/s²) vs speed (m/s). */
export const A_UP = [0, 1.0, 4, 0.95, 8, 0.85, 15, 0.62, 22, 0.44, 27, 0.32, 30, 0.25];
/** Lateral acceleration comfort limit vs speed. */
export const latComfort = (v) => lerp(1.6, 1.25, smoothstep(7, 26, v));
/** Steep downgrade speed cap (km/h) vs grade. */
const DOWN_CAP = [-0.1, 36, -0.075, 47, -0.06, 55, -0.045, 66, -0.03, 92];
const B_PLAN = 0.65;     // anticipated deceleration for curves / limits (m/s²)
// cross-section taper lengths at road-type changes (same values as the road module's layout)
const TAPER = { 'town>ramp': 60, 'ramp>highway': 380, 'highway>ramp': 380, 'ramp>rural': 120, 'rural>mountain': 80, 'mountain>rural': 80, 'rural>coastal': 80, 'coastal>city': 220 };

export function buildPlan(R, opts = {}) {
  const n = R.n, step = R.step, L = R.length;
  const plan = { n, step, L, R };
  // cross-section with the same tapers the road module renders (src/bus/road/layout.js);
  // replaced by the road module's own arrays at runtime when it exposes them (useLayout)
  const med = new Float32Array(n), laneW = new Float32Array(n), edge = new Float32Array(n), pave = new Float32Array(n);
  {
    const segs = R.segments;
    const sec = segs.map((g) => { const T = ROAD_TYPES[g.type]; const m = (T.median || 0) / 2; return { med: m, laneW: T.laneW, edge: m + T.lanes * T.laneW, pave: m + T.lanes * T.laneW + T.shoulder }; });
    let k = 0;
    for (let i = 0; i < n; i++) {
      const s = i * step;
      while (k < segs.length - 1 && s > segs[k].s1) k++;
      const a = sec[k];
      let b = null, w = 0;
      if (k > 0) {
        const Lt = TAPER[`${segs[k - 1].type}>${segs[k].type}`] || 60, d = s - segs[k].s0;
        if (d < Lt / 2) { b = sec[k - 1]; w = 1 - smoothstep(-Lt / 2, Lt / 2, d); }
      }
      if (k < segs.length - 1 && !b) {
        const Lt = TAPER[`${segs[k].type}>${segs[k + 1].type}`] || 60, d = segs[k].s1 - s;
        if (d < Lt / 2) { b = sec[k + 1]; w = 1 - smoothstep(-Lt / 2, Lt / 2, d); }
      }
      med[i] = b ? a.med + (b.med - a.med) * w : a.med;
      laneW[i] = b ? a.laneW + (b.laneW - a.laneW) * w : a.laneW;
      edge[i] = b ? a.edge + (b.edge - a.edge) * w : a.edge;
      pave[i] = b ? a.pave + (b.pave - a.pave) * w : a.pave;
    }
  }
  plan.lane0 = new Float32Array(n); plan.lane1 = new Float32Array(n);
  plan.lanes = new Uint8Array(n);
  plan.edge = edge; plan.pave = pave;
  const lanePaths = (M, W, E) => {
    for (let i = 0; i < n; i++) {
      plan.lane0[i] = M[i] + W[i] * 0.5;
      plan.lane1[i] = Math.max(plan.lane0[i], E[i] - W[i] * 0.5);
      plan.lanes[i] = Math.max(1, Math.round((E[i] - M[i]) / W[i] - 0.15));
    }
  };
  lanePaths(med, laneW, edge);
  /** Adopt the road module's rendered cross-section (RoadLayout-like: med/laneW/edge/pave arrays per sample). */
  plan.useLayout = (lay) => {
    if (!lay || !lay.med || !lay.laneW || !lay.edge || lay.med.length !== n) return false;
    lanePaths(lay.med, lay.laneW, lay.edge);
    if (lay.pave && lay.pave.length === n) plan.edge = lay.edge, plan.pave = lay.pave;
    return true;
  };
  const lanes = plan.lanes;

  // ------------------------------------------------------------------ phases
  const segs = R.segments;
  const firstSeg = (type, after = 0) => segs.find((g) => g.type === type && g.s0 >= after);
  const stop = (id) => R.stops.find((s) => s.id === id);
  const rest = stop('hollow-pass'), ridge = stop('ridgefield');
  const ramp1 = firstSeg('ramp');
  const hw = firstSeg('highway', ramp1 ? ramp1.s0 : 0);
  const ramp2 = firstSeg('ramp', hw ? hw.s1 - 10 : 0);
  const mtn = firstSeg('mountain');
  const coast = firstSeg('coastal');
  const city = firstSeg('city', coast ? coast.s0 : 0);
  const sHw = ramp1 ? ramp1.s0 : L * 0.03;
  const sFoot = ramp2 ? ramp2.s0 : (hw ? hw.s1 : L * 0.22);
  const sMtn = mtn ? mtn.s0 : L * 0.28;
  const sRest = rest ? rest.s : L * 0.37;
  const sCoast = coast ? coast.s0 : L * 0.64;
  const sCity = city ? city.s0 : L * 0.95;
  plan.phaseS = {
    boarding: [0, 0], town: [0, sHw], highway: [sHw, sFoot], foothills: [sFoot, sMtn], mountain: [sMtn, sRest - 320],
    reststop: [sRest - 320, sRest + 160], valley: [sRest + 160, sCoast], coast: [sCoast, sCity], city: [sCity, L], arrived: [L, L],
  };
  plan.marks = { highwayMerge: hw ? hw.s0 : sHw + 3000, exit: ramp2 ? ramp2.s0 : sFoot, rest: sRest, ridge: ridge ? ridge.s : sFoot + 4000, coast: sCoast, city: sCity };

  // ------------------------------------------------------------------ road events
  const ev = [];
  const add = (s, kind, intensity, side = 0, len = 0) => { if (s > 3 && s < L - 3) ev.push({ s, kind, intensity, side, len }); };
  const straightAt = (s0, span = 20) => {
    for (let s = s0; s < s0 + 3000; s += 4) {
      let ok = true;
      for (let d = -span; d <= span; d += 4) { const i = Math.round((s + d) / step); if (i < 0 || i >= n || Math.abs(R.curvature[i]) > 1 / 500) { ok = false; break; } }
      if (ok) return s;
    }
    return s0;
  };
  for (const st of R.structures) {
    if (st.type === 'tunnel') { add(st.s0 + 1, 'joint', 0.35); add(st.s1 - 1, 'joint', 0.35); }
    else {
      add(st.s0 + 2, 'joint', 0.6); add(st.s1 - 2, 'joint', 0.6);
      for (let s = st.s0 + 90; s < st.s1 - 60; s += 90) add(s, 'joint', 0.45);
    }
  }
  // speed humps: Cedar Bay (station street & a residential stretch), Port Solano (station approach)
  const humps = [straightAt(250, 14), straightAt(2180, 14), straightAt(L - 520, 14)];
  for (const s of humps) add(s, 'speedbump', 1, 0, 3.7);
  // cattle grids on the rural roads (farm boundaries)
  const grids = [straightAt(sFoot + 5300, 30), straightAt(sRest + 9200, 30)];
  for (const s of grids) add(s, 'cattlegrid', 0.6, 0, 2.6);
  // potholes / patches on rural roads, manholes in towns, seams elsewhere
  let k = 0;
  for (let s = 400; s < L - 400; k++) {
    const i = Math.round(s / step), seg = R.seg[i];
    const r1 = hash1(k, 7331), r2 = hash1(k, 913), r3 = hash1(k, 4127);
    if (seg === 'rural') { add(s, 'pothole', 0.35 + 0.55 * r1, r2 < 0.45 ? -1 : r2 < 0.9 ? 1 : 0); s += 280 + 900 * r3; }
    else if (seg === 'town' || seg === 'city') { add(s, 'joint', 0.14 + 0.16 * r1, r2 < 0.5 ? -1 : 1); s += 120 + 200 * r3; }
    else if (seg === 'mountain' || seg === 'coastal') { if (r1 > 0.55) add(s, 'pothole', 0.25 + 0.35 * r2, r3 < 0.5 ? -1 : 1); else add(s, 'joint', 0.12, 0); s += 450 + 900 * r3; }
    else { add(s, 'joint', 0.08 + 0.06 * r1, 0); s += 700 + 1100 * r3; }
  }
  ev.sort((a, b) => a.s - b.s);
  plan.events = ev;

  // ------------------------------------------------------------------ speed profile
  const vLimit = new Float32Array(n), vStatic = new Float32Array(n), vProfile = new Float32Array(n);
  const tunnelAt = new Uint8Array(n);
  for (const st of R.structures) if (st.type === 'tunnel') for (let i = st.i0; i <= st.i1; i++) tunnelAt[i] = 1;
  for (let i = 0; i < n; i++) {
    const seg = R.seg[i], t = ROAD_TYPES[seg], s = i * step;
    let lim = t.limitKmh;
    // the exit-31 deceleration lane: the ramp limit applies ~150 m after the diverge
    if (ramp2 && s >= ramp2.s0 && s < ramp2.s0 + 150) lim = ROAD_TYPES.highway.limitKmh;
    if (tunnelAt[i]) lim = Math.min(lim, 60);
    if (s < 60 || s > L - 160) lim = Math.min(lim, 20);        // bus-station forecourts
    vLimit[i] = lim * KMH;
    let v = lim * KMH * (DRIVER_FACTOR[seg] || 0.95);
    // curve speed (max curvature over the coach length, our lane radius)
    let kmax = 0, ks = 0;
    for (let j = Math.max(0, i - 4); j <= Math.min(n - 1, i + 4); j++) { const c = Math.abs(R.curvature[j]); if (c > kmax) { kmax = c; ks = Math.sign(R.curvature[j]); } }
    if (kmax > 1e-5) {
      const lat = plan.lane1[i];
      const Re = Math.max(6, 1 / kmax - ks * lat);
      const vg = Math.sqrt(1.45 * Re);
      const vc = Math.sqrt((latComfort(vg) + 0.5 * G * Math.abs(R.bank[i])) * Re);
      v = Math.min(v, vc);
    }
    // steep downgrades: low gear, retarder, moderate speed
    if (R.grade[i] < -0.03) v = Math.min(v, curve(DOWN_CAP, R.grade[i]) * KMH);
    vStatic[i] = v;
  }
  for (const e of ev) {
    if (e.kind !== 'speedbump' && e.kind !== 'cattlegrid') continue;
    const cap = (e.kind === 'speedbump' ? 13 : 45) * KMH, span = e.kind === 'speedbump' ? 10 : 8;
    for (let i = Math.max(0, Math.round((e.s - span - 6.5) / step)); i <= Math.min(n - 1, Math.round((e.s + span + 6.5) / step)); i++) vStatic[i] = Math.min(vStatic[i], cap);
  }
  vProfile[n - 1] = vStatic[n - 1];
  for (let i = n - 2; i >= 0; i--) vProfile[i] = Math.min(vStatic[i], Math.sqrt(vProfile[i + 1] * vProfile[i + 1] + 2 * B_PLAN * step));
  plan.vLimit = vLimit; plan.vStatic = vStatic; plan.vProfile = vProfile; plan.tunnelAt = tunnelAt;

  // ------------------------------------------------------------------ turn indicators
  const turns = [];
  {
    let i = 0;
    while (i < n) {
      const seg = R.seg[i];
      const urban = seg === 'town' || seg === 'city' || seg === 'ramp';
      if (urban && Math.abs(R.curvature[i]) > 1 / 90) {
        const sg = Math.sign(R.curvature[i]);
        let j = i, tot = 0;
        while (j < n && Math.sign(R.curvature[j]) === sg && Math.abs(R.curvature[j]) > 1 / 140) { tot += R.curvature[j] * step; j++; }
        if (Math.abs(tot) > 40 * Math.PI / 180) turns.push({ s0: i * step, s1: j * step, side: sg > 0 ? 'R' : 'L', kind: 'turn', angle: tot });
        i = j + 1;
      } else i++;
    }
    // lateral shifts of the keep-right lane path (merges, diverges, lane drops)
    const W = 30;   // 60 m
    let iS = -1;
    for (let i2 = W; i2 < n - W; i2 += 5) {
      const d = plan.lane1[i2 + W] - plan.lane1[i2 - W];
      if (Math.abs(d) > 0.5 && iS < 0) iS = i2;
      if ((Math.abs(d) <= 0.5 || i2 >= n - W - 5) && iS >= 0) {
        const tot = plan.lane1[Math.min(n - 1, i2 + W)] - plan.lane1[Math.max(0, iS - W)];
        if (Math.abs(tot) > 1.2) turns.push({ s0: (iS - W) * step, s1: (i2 + W) * step, side: tot > 0 ? 'R' : 'L', kind: 'shift', shift: tot });
        iS = -1;
      }
    }
    turns.sort((a, b) => a.s0 - b.s0);
  }
  plan.turns = turns;

  // ------------------------------------------------------------------ timetable
  const restMin = opts.restMinutes ?? 10;
  const dwellOf = (id) => (id === 'ridgefield' ? 35 + 24 : id === 'hollow-pass' ? restMin * 60 + 32 : 0);
  const vt = Float32Array.from(vProfile);
  const stopIdx = [];
  for (const st of R.stops) {
    if (st.id === 'cedar-bay') continue;
    const i = Math.round(Math.min(L, st.s) / step);
    stopIdx.push({ i, dwell: dwellOf(st.id), id: st.id });
    vt[Math.min(n - 1, i)] = 0;
  }
  for (let i = n - 2; i >= 0; i--) vt[i] = Math.min(vt[i], Math.sqrt(vt[i + 1] * vt[i + 1] + 2 * 0.95 * step));
  // forward pass: power-limited acceleration
  const Peff = 0.78 * 353000;
  vt[0] = 0;
  for (let i = 0; i < n - 1; i++) {
    const v = vt[i], gr = R.grade[i];
    const th = Math.atan(gr);
    const res = VEH.mass * G * (Math.sin(th) + VEH.crr) + 0.5 * VEH.rho * VEH.cdA * v * v;
    const a = Math.min(curve(A_UP, v), (Peff / Math.max(v, 2.5) - res) / VEH.mass);
    vt[i + 1] = Math.min(vt[i + 1], Math.sqrt(Math.max(0.04, v * v + 2 * a * step)));
  }
  const T = new Float64Array(n);
  let si = 0;
  for (let i = 1; i < n; i++) {
    const vm = Math.max(0.6, 0.5 * (vt[i] + vt[i - 1]));
    let urban = R.seg[i] === 'town' || R.seg[i] === 'city' ? 1.06 : 1.01;   // signals / traffic allowance
    T[i] = T[i - 1] + step / vm * urban;
    while (si < stopIdx.length && stopIdx[si].i === i) { T[i] += stopIdx[si].dwell; si++; }
  }
  plan.tPlan = T;
  plan.vTimetable = vt;
  plan.totalTime = T[n - 1];
  plan.restMinutes = restMin;

  // ------------------------------------------------------------------ helpers
  const at = (arr, s) => {
    const f = clamp(s, 0, L) / step;
    const i = Math.min(n - 2, Math.floor(f)), t = f - i;
    return arr[i] + (arr[i + 1] - arr[i]) * t;
  };
  plan.at = at;
  plan.profileAt = (s) => at(vProfile, s);
  plan.limitAt = (s) => vLimit[Math.min(n - 1, Math.max(0, Math.round(s / step)))];
  plan.laneAt = (s, k) => at(k > 0 ? plan.lane1 : plan.lane0, s);
  plan.lanesAt = (s) => lanes[Math.min(n - 1, Math.max(0, Math.round(s / step)))];
  plan.timeAt = (s) => at(T, s);
  plan.bays = BAY_DEFS;
  plan.roughnessAt = (seg) => ROUGHNESS[seg] ?? 0.25;
  return plan;
}

/** Speed (m/s) on a comfortable stopping trajectory with distance d (m) to go; soft final release. */
export function stopSpeed(d, b = 1.0, vf = 1.15, bf = 0.38) {
  if (d <= 0) return 0;
  const df = vf * vf / (2 * bf);
  if (d <= df) return Math.sqrt(2 * bf * d);
  return Math.sqrt(vf * vf + 2 * b * (d - df));
}
/** Deceleration implied by stopSpeed at distance d. */
export function stopDecel(d, b = 1.0, vf = 1.15, bf = 0.38) {
  const df = vf * vf / (2 * bf);
  return d <= df ? bf : b;
}
export { clamp01 };
