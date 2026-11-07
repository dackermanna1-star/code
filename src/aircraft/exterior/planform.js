// =============================================================================
// 737-800 wing planform + airfoil maths (no Three.js objects).
//
// Everything is for the RIGHT wing (x >= 0) in the aircraft-local frame; the
// left wing is a mirrored copy. The wing is described by a span parameter `s`:
//   S0 .. TIP_S     straight wing, s = x (lateral distance from the centreline)
//   TIP_S .. S_END  blended winglet: an arc (radius WL_R) turning the section up
//                   to WL_CANT, then a straight canted blade (path length).
// A wing point is addressed by (s, f, side): f = chord fraction (0 = leading
// edge, 1 = trailing edge), side = +1 upper / -1 lower surface.
// The texture atlas UV of a point: u = (s - S0) / (S_END - S0),
// v = 0.5 + 0.5 f (upper) or 0.5 - 0.5 f (lower)  -> LE in the middle of the atlas.
// =============================================================================
import { AIRCRAFT, DEG } from '../../core/constants.js';

const W = AIRCRAFT.wing;
export const DIHEDRAL = W.dihedralDeg * DEG;
export const SIN_D = Math.sin(DIHEDRAL), COS_D = Math.cos(DIHEDRAL), TAN_D = Math.tan(DIHEDRAL);
export const S0 = 1.0;                       // inner end of the modelled wing (hidden in the belly fairing)
export const TIP_S = W.semiSpan;             // 17.15
export const ROOT_LE_Z = W.rootLeadingEdgeZ; // -2.6
export const ROOT_TE_Z = W.rootTrailingEdgeZ; // 4.72
export const Y0 = AIRCRAFT.wing.rootY;       // chord-line height at the root LE (x = 0)
const ROOT_QC = ROOT_LE_Z + 0.25 * W.rootChord;
const TIP_QC = ROOT_QC + TIP_S * Math.tan(W.sweepDeg * DEG);
export const TIP_LE_Z = TIP_QC - 0.25 * W.tipChord;
export const TIP_TE_Z = TIP_LE_Z + W.tipChord;
export const LE_SLOPE = (TIP_LE_Z - ROOT_LE_Z) / TIP_S;
export const KINK_X = 5.9;                   // trailing-edge break (inboard TE much less swept)
export const KINK_TE_Z = 5.25;

// winglet path
export const WL_R = 0.45;
export const WL_CANT = 84 * DEG;
const WL_ARC = WL_R * (WL_CANT - DIHEDRAL);
const WL_LINE = (W.wingletHeight - WL_R * (Math.cos(DIHEDRAL) - Math.cos(WL_CANT))) / Math.sin(WL_CANT);
export const WL_ARC_END = TIP_S + WL_ARC;
export const S_END = WL_ARC_END + WL_LINE;
export const S_RANGE = S_END - S0;

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** leading-edge z at lateral x (straight wing) */
export const leZ = (x) => ROOT_LE_Z + x * LE_SLOPE;
/** trailing-edge z at lateral x */
export function teZ(x) {
  if (x <= KINK_X) return lerp(ROOT_TE_Z, KINK_TE_Z, x / KINK_X);
  return lerp(KINK_TE_Z, TIP_TE_Z, (x - KINK_X) / (TIP_S - KINK_X));
}
export const chordX = (x) => teZ(x) - leZ(x);
/** chord line height at the LE for lateral x */
export const y0 = (x) => Y0 + x * TAN_D;
/** thickness ratio along the span */
export function tcX(x) {
  if (x <= 1.9) return 0.14;
  if (x <= KINK_X) return lerp(0.14, 0.12, (x - 1.9) / (KINK_X - 1.9));
  return lerp(0.12, 0.104, (x - KINK_X) / (TIP_S - KINK_X));
}
/** geometric twist (radians, nose up +) */
export const twistX = (x) => (1.6 - 2.9 * clamp01(x / TIP_S)) * DEG;

// --- airfoil (NACA-like thickness, aft-loaded camber, small blunt TE) -----------
const CAM_M = 0.021, CAM_P = 0.45;
export function camber(f) {
  if (f < CAM_P) return CAM_M / (CAM_P * CAM_P) * (2 * CAM_P * f - f * f);
  return CAM_M / ((1 - CAM_P) * (1 - CAM_P)) * ((1 - 2 * CAM_P) + 2 * CAM_P * f - f * f);
}
/** half thickness as a fraction of chord, t = thickness ratio */
export function halfThick(f, t) {
  const x = clamp01(f);
  // flattened-top supercritical-ish distribution (NACA 4-digit with a fuller aft section)
  const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
  return yt + 0.0012 * x;
}

/** Station (section frame) at span parameter s. Writes into `o` and returns it. */
export function station(s, o = {}) {
  if (s <= TIP_S) {
    const x = Math.max(s, 0);
    o.bx = x; o.by = y0(x); o.z = leZ(x);
    o.chord = chordX(x); o.t = tcX(x); o.tw = twistX(x);
    o.nx = -SIN_D; o.ny = COS_D;           // thickness direction (section "up")
    o.h = 0;
    return o;
  }
  // winglet
  const tipY = y0(TIP_S);
  const tw = twistX(TIP_S);
  let px, py, th;
  if (s <= WL_ARC_END) {
    th = DIHEDRAL + (s - TIP_S) / WL_R;
    const cx = TIP_S - SIN_D * WL_R, cy = tipY + COS_D * WL_R;   // arc centre on the upper side
    px = cx + Math.sin(th) * WL_R; py = cy - Math.cos(th) * WL_R;
  } else {
    th = WL_CANT;
    const cx = TIP_S - SIN_D * WL_R, cy = tipY + COS_D * WL_R;
    const ax = cx + Math.sin(th) * WL_R, ay = cy - Math.cos(th) * WL_R;
    const d = s - WL_ARC_END;
    px = ax + Math.cos(th) * d; py = ay + Math.sin(th) * d;
  }
  const h = py - tipY;                      // height above the tip chord line
  const hn = clamp01(h / AIRCRAFT.wing.wingletHeight);
  o.bx = px; o.by = py; o.h = h;
  o.z = TIP_LE_Z + 0.35 * h + 0.9 * h * hn;  // LE sweeps back progressively
  let c = AIRCRAFT.wing.tipChord - 0.68 * Math.pow(hn, 0.85);
  c *= 1 - 0.55 * sstep(0.9, 1.0, hn);
  o.chord = c;
  o.t = lerp(0.104, 0.088, sstep(0, 0.3, hn));
  o.tw = tw;
  o.nx = -Math.sin(th); o.ny = Math.cos(th);
  return o;
}

/**
 * Section point in 2D (a = along chord [m], b = up [m]) for chord fraction f
 * with an optional outward offset (metres, along the 2D surface normal).
 */
export function section2D(st, f, side, offset, out) {
  const c = st.chord;
  const yc = camber(f), yt = halfThick(f, st.t);
  let a = f * c, b = (yc + side * yt) * c;
  if (offset) {
    // numeric normal of the section curve
    const e = 0.002;
    const f2 = Math.min(1, f + e), f1 = Math.max(0, f - e);
    const b2 = (camber(f2) + side * halfThick(f2, st.t)) * c, b1 = (camber(f1) + side * halfThick(f1, st.t)) * c;
    let ta = (f2 - f1) * c, tb = b2 - b1;
    const L = Math.hypot(ta, tb) || 1; ta /= L; tb /= L;
    // outward normal: for upper (side +1) rotate tangent +90 (=(-tb, ta)), lower -> (tb, -ta)
    let na = -tb * side, nb = ta * side;
    if (f < 0.0015) { na = -1; nb = 0; }
    a += na * offset; b += nb * offset;
  }
  out.a = a; out.b = b;
  return out;
}

/** Convert section coordinates (a along chord, b up) at a station to 3D. */
export function toWorld(st, a, b, out) {
  const ct = Math.cos(st.tw), sn = Math.sin(st.tw);
  // twist about the LE: nose-up twist moves the aft part down
  const za = a * ct + b * sn;
  const yb = b * ct - a * sn;
  out.x = st.bx + st.nx * yb;
  out.y = st.by + st.ny * yb;
  out.z = st.z + za;
  return out;
}

const _st = {}, _s2 = {};
/** Wing surface point (right wing). */
export function wingPoint(s, f, side, out, offset = 0) {
  station(s, _st);
  section2D(_st, f, side, offset, _s2);
  return toWorld(_st, _s2.a, _s2.b, out);
}
export function atlasU(s) { return (s - S0) / S_RANGE * 0.97; }
/** flat colour swatches in the atlas column u > 0.975 */
export const SWATCH = { cove: [0.988, 0.04], under: [0.988, 0.14], canoe: [0.988, 0.3], vg: [0.988, 0.46], wick: [0.988, 0.62], light: [0.988, 0.78] };
export function atlasV(f, side) { return side > 0 ? 0.5 + 0.5 * f : 0.5 - 0.5 * f; }

// --- control surface layout (right wing, lateral x ranges) --------------------
export const LAYOUT = {
  spoilerHingeF: 0.62, spoilerTeF: 0.80,
  coveLowerF: 0.70,                 // fixed lower skin ends here in the flap bays
  flapNoseF: 0.675, flapMainTeF: 0.905, aftFlapNoseF: 0.86,
  aileronNoseF: 0.765, aileronCoveF: 0.78,
  inboardFlap: [1.95, KINK_X - 0.03],
  outboardFlap: [KINK_X + 0.03, 11.55],
  aileron: [11.68, 15.22],
  groundSpoilers: [[2.25, 3.75], [3.8, 5.3]],
  flightSpoilers: [[6.15, 7.5], [7.55, 8.9], [8.95, 10.25], [10.3, 11.5]],
  fixedSpoilerFill: [[S0, 2.25], [5.3, 6.15], [11.5, 11.68]],
  slats: [[5.75, 8.45], [8.5, 11.2], [11.25, 13.95], [14.0, 16.65]],
  slatChordF: 0.16,
  kruegers: [[2.05, 3.2], [3.25, 4.35]],
  canoes: [2.95, 6.55, 8.75, 10.75],
};
