// =============================================================================
// DESCENT / APPROACH PLANNING
//
// At the top of descent the director calls planDescent() with the current
// position (cruise track ≈ 090). The planner chooses where the ARRIVAL airport
// must be (app.world.setArrivalOrigin) so that this lateral route fits the
// descent time budget of the pacing setting:
//
//          P0 ─────── eastbound (E) ───────╮  B (right turn, high altitude)
//                                           ╲   base leg 165°, ~10-20 km off the
//                                            ╲  coast: city + coastline on the LEFT
//                                             ╰─╮ C (left turn onto final, ~2600 ft)
//                                               FAF ─── 15 km ─── THR 09 ═══ runway
//
// Vertical: idle descent with a smooth pitch-over, a constant path, a smooth
// level-off at the FAF altitude a few km before the FAF (glideslope intercepted
// from level flight, like an ILS) — h(s) and dh/ds are tabulated along the route.
// Speeds: Mach 0.78 / 290-300 kt, 250 kt below 10 000 ft, then 220 / 200 / 180 kt
// with distance to go (flaps 1 and 5 are extended by the script).
// =============================================================================
import { DEG, G, KT, FT } from '../core/constants.js';
import { ARRIVAL } from '../world/layout.js';
import { buildFilletPath, projectOnPath, isaInto, tasFromIas, smoothstep, clamp, lerp, table } from './fmath.js';

export const GS_TAN = Math.tan(ARRIVAL.approach.glideslopeDeg * DEG);
export const WHEEL_OFF = 2.9;                    // aircraft origin above the main wheels on approach
export const THR_X = ARRIVAL.approach.threshold[0];
export const AIM_X = ARRIVAL.approach.aimPoint[0];
export const FAF_X = THR_X - ARRIVAL.approach.finalApproachFixDistance;
export const H_FAF = WHEEL_OFF + (AIM_X - FAF_X) * GS_TAN;     // ≈ 805 m (2640 ft)
export const RUNWAY_END_X = 1500;
/** Glideslope height (aircraft origin, m above the runway) at arrival-local x. */
export const gsHeight = (lx) => WHEEL_OFF + Math.max(0, AIM_X - lx) * GS_TAN;

// Compressed pacing keeps the speed up (320 kt, 280 kt below FL100), slows down late and flies a
// continuous descent that blends straight into the 3° glide path at the FAF, so the whole descent
// fits ~7½ minutes with a ≈ 7½° speedbrake-assisted path. Realistic pacing flies the textbook ~3°
// idle descent, 250 kt below FL100, and intercepts the glideslope from level flight.
export const PACE = {
  compressed: {
    T: 480, N: 17000, finalStraight: 3000, sLvl: 0, cda: true, s1: 12000, sTr: 8000, bank: 19, highIas: 320, lowIas: 280, sb: [0.14, 0.5],
    distCap: [[0, 180], [3000, 180], [6000, 195], [9500, 210], [13500, 230], [18000, 260], [23000, 300], [27000, 400]],
  },
  realistic: {
    T: 1200, N: 26000, finalStraight: 6000, sLvl: 9000, cda: false, s1: 7000, sTr: 18000, bank: 19, highIas: 290, lowIas: 250, sb: [0.30, 0.42],
    distCap: [[0, 180], [7500, 180], [10500, 200], [15000, 200], [19000, 220], [26000, 220], [32000, 250], [34000, 400]],
  },
};
const BASE_HDG = 165;                            // base-leg heading (deg)
const _isa = { T: 0, rho: 0, a: 0 };

/** Planned indicated airspeed (kt) for distance-to-go (m) to the FAF and altitude (m). */
export function iasPlanKt(dtg, h, P) {
  const hft = h / FT;
  const ias = hft > 11500 ? P.highIas : hft > 10000 ? lerp(P.lowIas, P.highIas, (hft - 10000) / 1500) : P.lowIas;
  return Math.min(ias, table(P.distCap, dtg));
}
/** TAS (m/s) for an IAS (kt) at altitude h, limited to Mach 0.78. */
export function tasFor(iasKt, h, mach = 0.78) {
  isaInto(h, _isa);
  return Math.min(tasFromIas(iasKt * KT, _isa.rho), mach * _isa.a);
}

// tan γ(s) = k·w(s) + tan3°·u(s): w = pitch-over ramp × end transition, u = blend into the
// glide path (continuous descent) — or a level segment of length sLvl before the FAF.
function makeProfile(L, h0, hEnd, P) {
  const ds = 50, n = Math.ceil(L / ds) + 1;
  const w = new Float32Array(n), u = new Float32Array(n), W = new Float64Array(n), U = new Float64Array(n);
  const Ld = L - P.sLvl;
  for (let i = 0; i < n; i++) {
    const s = Math.min(L, i * ds);
    const tr = smoothstep(Ld - P.sTr, Ld, s);
    w[i] = smoothstep(0, P.s1, s) * (1 - tr);
    u[i] = P.cda ? tr : 0;
    if (i > 0) {
      const d = Math.min(L, i * ds) - Math.min(L, (i - 1) * ds);
      W[i] = W[i - 1] + 0.5 * (w[i] + w[i - 1]) * d;
      U[i] = U[i - 1] + 0.5 * (u[i] + u[i - 1]) * d;
    }
  }
  const k = (h0 - hEnd - GS_TAN * U[n - 1]) / Math.max(1, W[n - 1]);
  const at = (arr, s) => {
    if (s <= 0) return arr[0];
    const f = s / ds, i = Math.floor(f);
    if (i >= n - 1) return arr[n - 1];
    return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
  };
  return {
    L, k, h0, hEnd,
    hAt: (s) => (s >= L ? hEnd - (P.cda ? GS_TAN * (s - L) : 0) : h0 - k * at(W, s) - GS_TAN * at(U, s)),
    dhds: (s) => (s >= L ? (P.cda ? -GS_TAN : 0) : -k * at(w, s) - GS_TAN * at(u, s)),
  };
}

function geometry(L, rB, rC, P) {
  const dB = (BASE_HDG - 90) * DEG, dC = dB;
  const tB = rB * Math.tan(dB / 2), tC = rC * Math.tan(dC / 2);
  const xc = FAF_X - P.finalStraight - tC;
  const xb = xc - P.N * Math.tan((180 - BASE_HDG) * DEG);
  const baseLen = P.N / Math.cos((180 - BASE_HDG) * DEG);
  const baseStraight = Math.max(500, baseLen - tB - tC);
  const arcB = rB * dB, arcC = rC * dC;
  const F = arcB + baseStraight + arcC + P.finalStraight;
  return { xb, xc, tB, tC, arcB, arcC, baseStraight, F, E: L - F };
}

/**
 * Plan the descent from the current position. Returns
 * { route, origin {x, z}, sFAF, sThr, hAt(s), dhds(s), iasKt(s, h), sb0, sb1, corners, pacing }.
 */
export function planDescent({ x0, z0, h0, pacing = 'compressed' }) {
  const P = PACE[pacing] || PACE.compressed;
  let L = P.T * 185, rB = 8000, rC = 2300, g = null, prof = null;
  const tanB = Math.tan(P.bank * DEG);
  for (let it = 0; it < 8; it++) {
    prof = makeProfile(L, h0, H_FAF, P);
    g = geometry(L, rB, rC, P);
    if (g.E < 3000) { L = g.F + 3000; prof = makeProfile(L, h0, H_FAF, P); g = geometry(L, rB, rC, P); }
    const sB = g.E + g.arcB / 2, sC = g.E + g.arcB + g.baseStraight + g.arcC / 2;
    const vB = tasFor(iasPlanKt(L - sB, prof.hAt(sB), P), prof.hAt(sB));
    const vC = tasFor(iasPlanKt(L - sC, prof.hAt(sC), P), prof.hAt(sC));
    rB = vB * vB / (G * tanB); rC = vC * vC / (G * tanB);
    // time estimate
    let T = 0;
    for (let s = 0; s < L; s += 250) {
      const h = prof.hAt(s + 125);
      T += 250 / Math.max(60, tasFor(iasPlanKt(L - s - 125, h, P), h));
    }
    const Lnew = L + (P.T - T) * (L / T);
    if (Math.abs(Lnew - L) < 50 && it > 2) break;
    L = Math.max(g.F + 3000, Lnew);
  }
  prof = makeProfile(L, h0, H_FAF, P);
  g = geometry(L, rB, rC, P);
  const E = Math.max(3000, g.E);
  const ox = x0 - (g.xb - g.tB - E), oz = z0 + P.N;
  const pts = [
    [x0, z0], [ox + g.xb, oz - P.N], [ox + g.xc, oz], [ox + FAF_X, oz], [ox + THR_X, oz], [ox + RUNWAY_END_X + 6000, oz],
  ];
  const route = buildFilletPath(pts, [0, rB, rC, 0, 0, 0], 25);
  const sFAF = projectOnPath(route, ox + FAF_X, oz, L, 100000);
  const sThr = projectOnPath(route, ox + THR_X, oz, sFAF + 15000, 100000);
  // the planned profile is defined on the nominal length L; rescale to the built path
  const scale = sFAF / L;
  const sb = P.sb;
  return {
    route, origin: { x: ox, z: oz }, sFAF, sThr, pacing, corners: route.corners, P,
    hAt: (s) => prof.hAt(s / scale),
    dhds: (s) => prof.dhds(s / scale) / scale,
    iasKt: (s, h) => iasPlanKt(Math.max(0, sFAF - s), h, P),
    sb0: sb[0] * sFAF, sb1: sb[1] * sFAF,
    gamma: Math.atan(prof.k),
  };
}

/** Straight-in approach plan (used by skipTo('approach')): start `dist` m before the threshold. */
export function planApproach(origin, dist = 21000) {
  const ox = origin.x, oz = origin.z;
  const pts = [[ox + THR_X - dist, oz], [ox + FAF_X, oz], [ox + THR_X, oz], [ox + RUNWAY_END_X + 6000, oz]];
  const route = buildFilletPath(pts, [0, 0, 0, 0], 25);
  const sFAF = dist - ARRIVAL.approach.finalApproachFixDistance;
  return {
    route, origin: { x: ox, z: oz }, sFAF, sThr: dist, pacing: 'compressed', corners: [],
    hAt: () => H_FAF, dhds: () => 0, iasKt: () => 200, sb0: -1, sb1: -1, gamma: 0,
  };
}

export { clamp };
