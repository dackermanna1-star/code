// =============================================================================
// Cabin cross-section ("profile") of the Boeing Sky Interior lining, right side
// (x >= 0, mirrored for the left). All values in aircraft-local metres.
//
//  y
//  2.185 ┤            ___ceiling panel___
//  2.10  ┤    cove ◜ (LED wash)            ◝
//  2.075 ┤  bin face top ╲
//        │                ╲  pivot bin bucket (moves)
//  1.60  ┤   bin lip ──────╲___ PSU channel (fixed, 1.00..1.33)
//  1.45  ┤                      ╲ upper sidewall (LED sidewall wash under the PSU)
//  1.03  ┤                       │ window centre (reveal 0.33 x 0.47)
//  0.30  ┤                       │ dado top
//  0.00  ┴───────────────────────┘ floor
//        0                      1.69 (lining radius about y = 0.55)
//
// In the door/galley areas (no bins) the sidewall arc continues up to the cove.
// =============================================================================
import { AIRCRAFT, WINDOW } from '../../core/constants.js';

const F = AIRCRAFT.fuselage;
export const RL = F.radiusInner - F.liningInset;      // 1.69 lining radius
export const CY = F.centerY;                          // 0.55
export const R_FRAME = F.radiusInner;                 // 1.76
export const R_BLOCK = 1.80;                          // invisible light-blocker shell (shadow only)
export const R_OUTER_PANE = 1.845;

export const PROF = {
  dadoBottom: [1.625, 0.0],
  dadoTop: [1.668, 0.30],
  arcY0: 0.30,
  arcY1: 1.45,               // cabin zone: top of the sculpted sidewall
  entryArcY1: 2.07,          // door zones: sidewall arc continues to the cove
  psuY: 1.585,               // PSU channel surface (faces down)
  psuX0: 1.00, psuX1: 1.33,
  binLipX: 0.794, binLipY: 1.625,
  binTopX: 0.70, binTopY: 2.075,
  binPivot: [1.00, 1.60],
  binOpenDeg: 25,
  coveLipX: 0.685, coveY: 2.082,
  ceilEdgeX: 0.655, ceilEdgeY: 2.128, ceilCenterY: 2.185,
  ledCove: [0.745, 2.095],   // ceiling-wash LED line (right side)
  ledSide: [1.345, 1.565],   // sidewall-wash LED line
};

/** x of the lining circle at height y. */
export function arcX(y, r = RL) {
  const dy = y - CY;
  return Math.sqrt(Math.max(0, r * r - dy * dy));
}
/** angle of the lining circle at height y (radians, 0 = horizontal outboard). */
export function arcPhi(y, r = RL) { return Math.asin((y - CY) / r); }

// window frame (right side): centre on the lining surface, outward normal N, up tangent U
export const PHI_W = arcPhi(WINDOW.centerY);
export const WIN = {
  phi: PHI_W,
  cx: RL * Math.cos(PHI_W), cy: CY + RL * Math.sin(PHI_W),
  nx: Math.cos(PHI_W), ny: Math.sin(PHI_W),          // outward normal (right side)
  ux: -Math.sin(PHI_W), uy: Math.cos(PHI_W),         // up along the lining
  // reveal shape (z half-size, v half-size along the arc, corner radius)
  rev: { hz: WINDOW.revealWidth / 2, hv: WINDOW.revealHeight / 2, r: 0.125 },
  inner: { hz: 0.148, hv: 0.205, r: 0.105, d: 0.078 },       // inner pane (depth from the lining)
  shade: { d: 0.066, hz: 0.158, hv: 0.214 },                // shade plane
  outer: { hz: WINDOW.paneWidth / 2 + 0.006, hv: WINDOW.paneHeight / 2 + 0.006, r: 0.095, d: 0.165 },
};

/** Point on the lining surface at window-relative (z, v) where v is arc length from the window centre. */
export function liningPoint(v, out) {
  const phi = PHI_W + v / RL;
  out[0] = RL * Math.cos(phi); out[1] = CY + RL * Math.sin(phi);
  out[2] = -Math.cos(phi); out[3] = -Math.sin(phi);   // inward normal
  return out;
}
export function vOfY(y) { return (arcPhi(y) - PHI_W) * RL; }

/**
 * Rounded rectangle point for a ray at angle `a` from the centre (star-shaped):
 * returns [z, u]. hz/hu half sizes, r corner radius. Uses the superellipse-like
 * exact rounded rect intersection.
 */
export function roundedRectRay(a, hz, hu, r) {
  const dz = Math.cos(a), du = Math.sin(a);
  // intersect ray with rounded rect: try straight edges first
  const ez = hz - r, eu = hu - r;
  let t = Infinity;
  if (Math.abs(dz) > 1e-9) { const tt = hz / Math.abs(dz); const u = du * tt; if (Math.abs(u) <= eu) t = Math.min(t, tt); }
  if (Math.abs(du) > 1e-9) { const tt = hu / Math.abs(du); const z = dz * tt; if (Math.abs(z) <= ez) t = Math.min(t, tt); }
  if (t === Infinity) {
    // corner circle at (sign*ez, sign*eu)
    const cz = Math.sign(dz) * ez, cu = Math.sign(du) * eu;
    // |t*d - c| = r  ->  t^2 - 2 t (d.c) + |c|^2 - r^2 = 0
    const b = dz * cz + du * cu, c = cz * cz + cu * cu - r * r;
    t = b + Math.sqrt(Math.max(0, b * b - c));
  }
  return [dz * t, du * t];
}

/** Sample a rounded rectangle uniformly along its perimeter, starting at angle 0 going CCW. */
export function roundedRectOutline(hz, hu, r, n) {
  // perimeter param: straight right edge, corner, top edge, ...
  const ez = hz - r, eu = hu - r;
  const segs = [
    { len: 2 * eu, f: (t) => [hz, -eu + 2 * eu * t] },
    { len: Math.PI * r / 2, f: (t) => { const a = t * Math.PI / 2; return [ez + r * Math.cos(a), eu + r * Math.sin(a)]; } },
    { len: 2 * ez, f: (t) => [ez - 2 * ez * t, hu] },
    { len: Math.PI * r / 2, f: (t) => { const a = Math.PI / 2 + t * Math.PI / 2; return [-ez + r * Math.cos(a), eu + r * Math.sin(a)]; } },
    { len: 2 * eu, f: (t) => [-hz, eu - 2 * eu * t] },
    { len: Math.PI * r / 2, f: (t) => { const a = Math.PI + t * Math.PI / 2; return [-ez + r * Math.cos(a), -eu + r * Math.sin(a)]; } },
    { len: 2 * ez, f: (t) => [-ez + 2 * ez * t, -hu] },
    { len: Math.PI * r / 2, f: (t) => { const a = 1.5 * Math.PI + t * Math.PI / 2; return [ez + r * Math.cos(a), -eu + r * Math.sin(a)]; } },
  ];
  const total = segs.reduce((s, g) => s + g.len, 0);
  const pts = [];
  // start at the middle of the right edge (angle 0)
  const start = eu;
  for (let i = 0; i < n; i++) {
    let s = (start + (i / n) * total) % total;
    for (const g of segs) {
      if (s <= g.len + 1e-9) { pts.push(g.f(g.len > 0 ? s / g.len : 0)); break; }
      s -= g.len;
    }
  }
  return pts;
}

/** Ceiling panel height at x (shallow vault). */
export function ceilingY(x) {
  const e = PROF.ceilEdgeX, s = PROF.ceilCenterY - PROF.ceilEdgeY;
  const R = (e * e + s * s) / (2 * s);
  const cyc = PROF.ceilCenterY - R;
  return cyc + Math.sqrt(Math.max(0, R * R - x * x));
}

// Bin face (cubic Bezier from the top at the cove down to the lip).
export const BIN_FACE = [[PROF.binTopX, PROF.binTopY], [0.80, 2.03], [0.838, 1.87], [0.824, 1.70]];
export const BIN_BACK_R = 1.712;
/** Point + outward (aisle-facing) normal on the closed bin face at t (0 = top, 1 = bottom of the curved face). */
export function binFacePoint(t) {
  const [P0, P1, P2, P3] = BIN_FACE, a = 1 - t;
  const x = a * a * a * P0[0] + 3 * a * a * t * P1[0] + 3 * a * t * t * P2[0] + t * t * t * P3[0];
  const y = a * a * a * P0[1] + 3 * a * a * t * P1[1] + 3 * a * t * t * P2[1] + t * t * t * P3[1];
  const dx = 3 * a * a * (P1[0] - P0[0]) + 6 * a * t * (P2[0] - P1[0]) + 3 * t * t * (P3[0] - P2[0]);
  const dy = 3 * a * a * (P1[1] - P0[1]) + 6 * a * t * (P2[1] - P1[1]) + 3 * t * t * (P3[1] - P2[1]);
  const l = Math.hypot(dx, dy) || 1;
  // travelling downwards along the face, the aisle side (-x) is on the right: normal = (dy, -dx)/l
  return { x, y, nx: dy / l, ny: -dx / l };
}

/** Closed bin bucket outer profile (right side), from face top -> lip -> floor -> back wall -> back top. */
export function binOuterProfile() {
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N; i++) { const p = binFacePoint(i / N); pts.push([p.x, p.y]); }
  // rounded lip
  const lipC = [0.794, 1.655], lr = 0.03;
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push([lipC[0] + lr * Math.cos(a), lipC[1] - lr * Math.sin(a)]);
  }
  // floor, nearly level (hidden part above the PSU channel)
  pts.push([0.86, 1.6245], [0.96, 1.622], [1.06, 1.621], [1.16, 1.621], [1.24, 1.622], [1.29, 1.626]);
  // back wall along r = BIN_BACK_R
  const rb = BIN_BACK_R;
  const phiA = Math.atan2(1.665 - CY, arcX(1.665, rb)), phiB = Math.atan2(2.05 - CY, arcX(2.05, rb));
  for (let i = 0; i <= 8; i++) {
    const phi = phiA + (phiB - phiA) * (i / 8);
    pts.push([rb * Math.cos(phi), CY + rb * Math.sin(phi)]);
  }
  return pts;
}

/**
 * Matrix for placing objects on the sidewall lining at height y (aircraft-local),
 * offset `inset` towards the cabin. Local frame: +x into the cabin, +y up along
 * the lining, z = (0,0,-s) so that PlaneGeometry.rotateY(PI/2) reads correctly
 * from inside the cabin on either side.
 */
export function liningFrame(side, y, inset, z, target) {
  const s = side === 'left' ? -1 : 1;
  const phi = arcPhi(Math.min(y, CY + RL * 0.999));
  const nx = Math.cos(phi) * s, ny = Math.sin(phi);
  const ux = -Math.sin(phi) * s, uy = Math.cos(phi);
  const px = RL * Math.cos(phi) * s - nx * inset, py = CY + RL * Math.sin(phi) - ny * inset;
  target.set(-nx, ux, 0, px, -ny, uy, 0, py, 0, 0, -s, z, 0, 0, 0, 1);
  return target;
}
