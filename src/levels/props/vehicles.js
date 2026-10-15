// Vehicles: sedans, trucks, emergency vehicles, helicopter and the finale stock car.
// Bodies are side profiles (with wheel-arch cut-outs) extruded across the width,
// greenhouses are tapered extrusions, wheels are 8-sided cylinders with an atlas face.
import {
  PI, TAU, HP, V3, R, subR, rgb, mix, pick, PALETTE, defProp, box, cbox, panel, quad, quadUV, quadTo, solid,
  extrude, rod, xcyl, zcyl, vcyl, loft, pushR, wp, beam, lamp, tri, triTo, C,
} from './kit.js';

// ---------------------------------------------------------------- shared builders
/** Side profile (z,y) from rear-bottom along the bottom (with arches) to the front, then `top` (front->rear). */
export function sideProfile({ rearZ, rearBottom, frontZ, frontBottom, sill, wheels, wr, gap = 0.06, top, archN = 6 }) {
  const pts = [[rearZ, rearBottom]], kinds = ['bottom'];
  const ar = wr + gap;
  for (const zw of [...wheels].sort((a, b) => a - b)) {
    const s = Math.max(-0.9, Math.min(0.9, (sill - wr) / ar));
    const t0 = Math.asin(s);
    for (let k = 0; k <= archN; k++) {
      const t = (PI - t0) - k * (PI - 2 * t0) / archN;
      pts.push([zw + ar * Math.cos(t), wr + ar * Math.sin(t)]);
      kinds.push(k < archN ? 'arch' : 'bottom');
    }
  }
  pts.push([frontZ, frontBottom]); kinds.push('body');
  for (const p of top) { pts.push(p); kinds.push('body'); }
  return { pts, kinds };
}

/** Extrude a side profile: paint sides, dark wheel wells, no bottom faces. */
function bodyShell(L, prof, hw, paint, tint, o = {}) {
  const edges = prof.kinds.map((k, i) => (k === 'bottom' ? null : k === 'arch' ? 'p_rubber' : (o.edgeMats && o.edgeMats[i]) || paint));
  const edgeTint = prof.kinds.map((k, i) => (k === 'arch' ? [0.7, 0.7, 0.7] : (o.edgeTints && o.edgeTints[i]) || undefined));
  extrude(L, prof.pts, 'x', -hw, hw, { side: paint, cap0: o.cap0 || paint, cap1: o.cap1 || paint, edges }, { tint, edgeTint });
}

/** Tapered greenhouse: pts (z,y) [rearBase, frontBase, roofFront, roofRear,...], half width shrinking with height. */
function greenhouse(L, pts, belt, hwB, hwT, roofY, paint, glass, tint, o = {}) {
  const hwAt = (v) => hwB + (hwT - hwB) * Math.max(0, (v - belt) / (roofY - belt));
  const gl = [1, 1, 1];
  const edges = o.edges || [null, glass, paint, glass];
  const edgeTint = edges.map((m) => (m === paint ? tint : gl));
  extrude(L, pts, 'x', (u, v) => -hwAt(v), (u, v) => hwAt(v), { side: paint, cap0: o.cap0 !== undefined ? o.cap0 : glass, cap1: o.cap1 !== undefined ? o.cap1 : glass, edges }, { tint, edgeTint, capTint: o.capTint || gl });
  return hwAt;
}

/** Wheel along X at side sx (+1/-1): tire tread + atlas face on the outside. */
export function wheel(L, x, y, z, r, w, face = 'wheel', n = 8) {
  const s = Math.sign(x) || 1;
  rod(L, [x - s * w / 2, y, z], [x + s * w / 2, y, z], r, n, 'p_tire', { up: [0, 1, 0], capB: 'p_decal', capRectB: R(face), phase: PI / n });
}

/** Paint tint / material set for a road vehicle given opts. */
function finish(o, r, defColor) {
  const burned = !!o.burned, wrecked = !!o.wrecked || burned;
  let tint = rgb(o.color !== undefined ? o.color : defColor !== undefined ? defColor : pick(r, PALETTE.car));
  if (wrecked && !burned) tint = mix(tint, [0.42, 0.38, 0.32], 0.3 + r() * 0.2);
  if (burned) tint = mix([1, 1, 1], [0.75, 0.62, 0.5], r() * 0.5);
  return {
    burned, wrecked, tint,
    paint: burned ? 'p_charred' : 'p_paint',
    glass: burned ? 'black' : wrecked && r() < 0.8 ? 'p_carGlassBroken' : 'p_carGlass',
    chrome: burned ? 'p_rust' : 'p_chrome',
    trim: burned ? 'p_charred' : 'p_rubber',
    face: burned ? 'wheelBurnt' : 'wheel',
  };
}

/** Wrecked / burned stance: returns wheel radius modifiers and pushes a tilted frame. */
function stance(L, F, r, wr, wheelZs, hw) {
  const flat = F.wrecked && !F.burned ? (r() * 4) | 0 : -1;
  if (F.burned) { const rim = wr * 0.72; L.push([0, rim - wr, 0]); return { rim, flat: -1 }; }
  if (flat >= 0) {
    const sx = flat % 2 ? 1 : -1, front = flat >= 2;
    pushR(L, [0, -0.05, 0], (front ? 1 : -1) * 0.03, 0, -sx * 0.035);
  } else L.push([0, 0, 0]);
  return { rim: 0, flat };
}

function wheelsFor(L, F, st, wr, ww, hw, zs, face, n = 8) {
  let k = 0;
  for (const z of zs) {
    for (const sx of [-1, 1]) {
      const idx = (z === Math.max(...zs) ? 2 : 0) + (sx > 0 ? 1 : 0);
      const x = sx * (hw - ww / 2 - 0.02);
      if (F.burned) wheel(L, x, wr, z, st.rim, ww * 0.8, 'wheelBurnt', n);
      else if (idx === st.flat) wheel(L, x, wr - 0.06, z, wr * 0.86, ww, face, n);
      else wheel(L, x, wr, z, wr, ww, face, n);
      k++;
    }
  }
}

function lightsFront(L, F, z, y, xo, w, h, kind = 'headlight') {
  for (const s of [-1, 1]) panel(L, F.burned ? 'p_charred' : 'p_decal', F.burned ? null : R(kind), s * xo, y, z, w, h, 'pz');
}
function lightsRear(L, F, z, y, xo, w, h) {
  for (const s of [-1, 1]) panel(L, F.burned ? 'p_charred' : 'p_decal', F.burned ? null : R('tail'), s * xo, y, z, w, h, 'nz', { flipU: s > 0 });
}
function mirrors(L, F, hw, y, z, tint) {
  for (const s of [-1, 1]) {
    box(L, s * hw, y, z - 0.06, s * (hw + 0.16), y + 0.12, z + 0.04, F.paint, { tint });
    panel(L, 'p_chrome', null, s * (hw + 0.08), y + 0.06, z - 0.062, 0.14, 0.1, 'nz');
  }
}
function sideLine(L, hw, z, y0, y1, s, w = 0.014) { panel(L, 'p_flat', null, s * (hw + 0.004), (y0 + y1) / 2, z, w, y1 - y0, s > 0 ? 'px' : 'nx', { tint: [0.08, 0.08, 0.08] }); }

// ---------------------------------------------------------------- passenger cars
function passengerCar(L, o, r, spec) {
  const F = finish(o, r, spec.color);
  const { hw, wr, ww, wz, sill, belt, roof } = spec;
  const st = stance(L, F, r, wr, wz, hw);
  const crumple = F.wrecked && !F.burned && r() < 0.6 ? 0.18 : 0;
  const top = spec.top.map(([z, y], i) => (crumple && z > spec.frontZ - 0.6 ? [z - crumple, y + (i === 0 ? 0.0 : 0.05)] : [z, y]));
  const prof = sideProfile({ rearZ: spec.rearZ, rearBottom: sill + 0.06, frontZ: spec.frontZ - crumple, frontBottom: sill + 0.06, sill, wheels: wz, wr, top });
  bodyShell(L, prof, hw, F.paint, F.tint);
  const hwAt = greenhouse(L, spec.cabin, belt, spec.hwB, spec.hwT, roof, F.paint, F.glass, F.tint);
  const fz = spec.frontZ - crumple + 0.012, rz = spec.rearZ - 0.012;
  // lights, grille, bumpers, plates
  const ly = spec.lightY;
  lightsFront(L, F, fz, ly, hw - 0.24, 0.3, 0.16, spec.headRect ? 'headRect' : 'headlight');
  if (!F.burned) panel(L, 'p_decal', R('grille'), 0, ly - 0.02, fz, hw * 0.85, 0.2, 'pz');
  lightsRear(L, F, rz, ly + 0.04, hw - 0.22, 0.36, 0.14);
  box(L, -hw + 0.02, sill + 0.02, spec.frontZ - crumple - 0.04, hw - 0.02, sill + 0.17, spec.frontZ - crumple + 0.09, F.chrome);
  box(L, -hw + 0.02, sill + 0.02, spec.rearZ - 0.09, hw - 0.02, sill + 0.17, spec.rearZ + 0.04, F.chrome);
  if (!F.burned) { panel(L, 'p_decal', R('plate'), 0, sill + 0.26, rz, 0.3, 0.15, 'nz'); panel(L, 'p_decal', R('plate'), 0, sill + 0.095, spec.frontZ - crumple + 0.092, 0.3, 0.15, 'pz'); }
  // side details: door seams, handles, mirrors
  for (const s of [-1, 1]) {
    for (const z of spec.seams) sideLine(L, hw, z, sill + 0.06, belt - 0.03, s);
    for (const z of spec.handles) panel(L, F.chrome, null, s * (hw + 0.006), belt - 0.1, z, 0.14, 0.035, s > 0 ? 'px' : 'nx');
    // B pillar strip on the glass
    if (spec.bPillar !== undefined) {
      const zb = spec.bPillar, x0 = hwAt(belt) + 0.008, x1 = hwAt(roof) + 0.008;
      quadTo(L, [s * x0, belt, zb - 0.06], [s * x0, belt, zb + 0.06], [s * x1, roof - 0.02, zb + 0.06], [s * x1, roof - 0.02, zb - 0.06], F.paint, V3(s, 0.3, 0), { tint: F.tint });
    }
  }
  mirrors(L, F, hwAt(belt), belt + 0.02, spec.cabin[1][0] - 0.2, F.tint);
  wheelsFor(L, F, st, wr, ww, hw, wz, F.face);
  // collision hulls (inset so visual vertices stay outside for light baking)
  solid(L, -hw + 0.06, 0, spec.rearZ + 0.06, hw - 0.06, belt - 0.05, spec.frontZ - crumple - 0.06, 'metal');
  const rz0 = Math.min(spec.cabin[2][0], spec.cabin[3][0]), rz1 = Math.max(spec.cabin[2][0], spec.cabin[3][0]);
  solid(L, -spec.hwT + 0.05, belt - 0.05, rz0 + 0.05, spec.hwT - 0.05, roof - 0.06, rz1 - 0.05, 'metal');
  const extra = spec.extra ? spec.extra(L, F, { hwAt, st }) : {};
  L.pop();
  return { topY: wp(L, 0, roof, 0)[1], ...extra };
}

const SEDAN = {
  hw: 0.9, wr: 0.33, ww: 0.22, wz: [-1.42, 1.42], sill: 0.3, belt: 0.92, roof: 1.42,
  rearZ: -2.42, frontZ: 2.42, lightY: 0.66,
  top: [[2.44, 0.78], [2.32, 0.86], [1.08, 0.92], [-1.22, 0.93], [-2.3, 0.9], [-2.44, 0.8]],
  cabin: [[-1.22, 0.92], [1.06, 0.92], [0.36, 1.42], [-0.72, 1.42]], hwB: 0.86, hwT: 0.7,
  seams: [1.0, 0.05, -1.0], handles: [0.15, -0.9], bPillar: -0.05,
};
export const car = defProp('car', (L, o, r) => passengerCar(L, o, r, SEDAN));

export const hatchback = defProp('hatchback', (L, o, r) => passengerCar(L, o, r, {
  hw: 0.86, wr: 0.31, ww: 0.2, wz: [-1.22, 1.3], sill: 0.28, belt: 0.9, roof: 1.44,
  rearZ: -1.95, frontZ: 2.0, lightY: 0.64, headRect: true,
  top: [[2.02, 0.76], [1.9, 0.84], [0.96, 0.9], [-1.84, 0.92], [-1.97, 0.84]],
  cabin: [[-1.84, 0.9], [0.95, 0.9], [0.3, 1.44], [-1.62, 1.44], [-1.84, 1.12]], hwB: 0.82, hwT: 0.68,
  seams: [0.9, -0.35], handles: [-0.2], bPillar: -0.4,
}));

export const police_car = defProp('police_car', (L, o, r) => passengerCar(L, o, r, {
  ...SEDAN, color: o.color !== undefined ? o.color : 0x18181a,
  extra(L, F, { hwAt }) {
    if (!F.burned) {
      for (const s of [-1, 1]) panel(L, 'p_decal', R('police'), s * (0.9 + 0.012), 0.6, 0.0, 2.0, 0.5, s > 0 ? 'px' : 'nx');
      for (const s of [-1, 1]) panel(L, 'p_decal', R('badge'), s * (0.9 + 0.02), 0.68, 0.62, 0.22, 0.22, s > 0 ? 'px' : 'nx');
    }
    // light bar
    const y = 1.42;
    box(L, -0.62, y, -0.32, 0.62, y + 0.05, -0.08, F.trim);
    const off = o.lights === false || F.burned;
    box(L, -0.6, y + 0.05, -0.3, -0.04, y + 0.17, -0.1, off ? 'p_flat' : 'p_emRed', { tint: off ? [0.5, 0.1, 0.1] : null });
    box(L, 0.04, y + 0.05, -0.3, 0.6, y + 0.17, -0.1, off ? 'p_flat' : 'p_emBlue', { tint: off ? [0.1, 0.15, 0.5] : null });
    box(L, -0.04, y + 0.05, -0.3, 0.04, y + 0.15, -0.1, 'p_chrome');
    // push bar
    box(L, -0.5, 0.35, 2.5, -0.42, 0.9, 2.58, F.trim); box(L, 0.42, 0.35, 2.5, 0.5, 0.9, 2.58, F.trim);
    box(L, -0.5, 0.78, 2.5, 0.5, 0.86, 2.58, F.trim); box(L, -0.5, 0.5, 2.5, 0.5, 0.58, 2.58, F.trim);
    // spotlight + antenna
    box(L, 0.86, 1.02, 0.95, 0.96, 1.12, 1.1, 'p_chrome');
    quad(L, [0.0, 1.42, -0.62], [0.01, 1.42, -0.62], [0.01, 2.1, -0.66], [0.0, 2.1, -0.66], 'p_wireBlack');
    return { lightBar: wp(L, 0, y + 0.2, -0.2) };
  },
}));

export const taxi = defProp('taxi', (L, o, r) => passengerCar(L, o, r, {
  ...SEDAN, color: o.color !== undefined ? o.color : 0xe8b818,
  extra(L, F) {
    if (!F.burned) for (const s of [-1, 1]) panel(L, 'p_decal', R('checker'), s * 0.913, 0.7, 0.0, 1.95, 0.1, s > 0 ? 'px' : 'nx');
    const y = 1.42;
    box(L, -0.3, y, -0.32, 0.3, y + 0.04, -0.12, F.trim);
    extrude(L, [[-0.36, y + 0.04], [0.36, y + 0.04], [0.3, y + 0.22], [-0.3, y + 0.22]], 'z', -0.28, -0.16, F.burned ? 'p_charred' : 'p_plastic', { tint: [1, 0.95, 0.75] });
    if (!F.burned) for (const s of [-1, 1]) panel(L, 'p_decal', R('taxiSign'), 0, y + 0.13, s > 0 ? -0.16 + 0.004 : -0.28 - 0.004, 0.56, 0.17, s > 0 ? 'pz' : 'nz');
    return {};
  },
}));

// ---------------------------------------------------------------- pickup
export const pickup_truck = defProp('pickup_truck', (L, o, r) => {
  const F = finish(o, r);
  const hw = 0.98, wr = 0.38, ww = 0.26, sill = 0.46, belt = 1.1, roof = 1.8;
  const st = stance(L, F, r, wr, [-1.75, 1.65], hw);
  // front + cab lower body
  const prof = sideProfile({ rearZ: -0.55, rearBottom: sill, frontZ: 2.6, frontBottom: sill, sill, wheels: [1.65], wr, top: [[2.62, 0.98], [2.5, 1.08], [0.96, 1.12], [-0.55, 1.12]] });
  bodyShell(L, prof, hw, F.paint, F.tint);
  const hwAt = greenhouse(L, [[-0.55, 1.12], [0.95, 1.12], [0.42, 1.8], [-0.5, 1.8]], 1.12, 0.94, 0.84, 1.8, F.paint, F.glass, F.tint);
  // bed
  const bed = sideProfile({ rearZ: -2.68, rearBottom: 0.55, frontZ: -0.62, frontBottom: 0.55, sill: 0.55, wheels: [-1.75], wr, top: [[-0.62, 1.08], [-2.68, 1.08]] });
  for (const s of [-1, 1]) extrude(L, bed.pts, 'x', s * (hw - 0.07), s * hw, { side: F.paint, cap0: F.paint, cap1: F.paint, edges: bed.kinds.map((k) => (k === 'bottom' ? null : k === 'arch' ? 'p_rubber' : F.paint)) }, { tint: F.tint });
  box(L, -hw, 0.55, -0.68, hw, 1.08, -0.6, F.paint, { tint: F.tint });
  box(L, -hw + 0.07, 0.55, -2.68, hw - 0.07, 1.06, -2.6, F.paint, { tint: F.tint });
  box(L, -hw + 0.07, 0.62, -2.6, hw - 0.07, 0.7, -0.68, 'metalDiamond', { faces: { ny: false } });
  box(L, -0.6, 0.32, -2.5, 0.6, 0.62, -0.7, 'p_rubber', { faces: { py: false } });
  if (!F.burned) panel(L, 'p_decal', R('tail'), 0, 0.98, -2.693, 1.2, 0.08, 'nz');
  lightsRear(L, F, -2.693, 0.82, hw - 0.12, 0.14, 0.3);
  // front
  lightsFront(L, F, 2.635, 0.82, hw - 0.22, 0.3, 0.18, 'headRect');
  if (!F.burned) panel(L, 'p_decal', R('grilleTruck'), 0, 0.8, 2.632, 1.0, 0.3, 'pz');
  box(L, -hw, sill - 0.02, 2.58, hw, sill + 0.16, 2.74, F.chrome);
  box(L, -hw + 0.07, 0.45, -2.78, hw - 0.07, 0.6, -2.66, F.chrome);
  for (const s of [-1, 1]) { sideLine(L, hw, -0.5, sill + 0.05, 1.08, s); sideLine(L, hw, 0.92, sill + 0.05, 1.08, s); panel(L, F.chrome, null, s * (hw + 0.006), 0.98, -0.32, 0.16, 0.04, s > 0 ? 'px' : 'nx'); }
  mirrors(L, F, hwAt(1.12), 1.15, 0.7, F.tint);
  wheelsFor(L, F, st, wr, ww, hw, [-1.75, 1.65], F.face);
  solid(L, -hw + 0.06, 0, -0.5, hw - 0.06, 1.06, 2.58, 'metal');
  solid(L, -0.8, 1.06, -0.45, 0.8, 1.74, 0.4, 'metal');
  solid(L, -hw + 0.05, 0, -2.66, hw - 0.05, 0.6, -0.62, 'metal');
  solid(L, -hw, 0.6, -2.66, -hw + 0.06, 1.04, -0.62, 'metal'); solid(L, hw - 0.06, 0.6, -2.66, hw, 1.04, -0.62, 'metal');
  solid(L, -hw, 0.6, -2.66, hw, 1.02, -2.6, 'metal');
  L.pop();
  return { topY: wp(L, 0, 1.8, 0)[1], bed: wp(L, 0, 0.7, -1.6) };
});

// ---------------------------------------------------------------- van
export const van = defProp('van', (L, o, r) => {
  const F = finish(o, r, 0xe0ddd4);
  const hw = 1.0, wr = 0.36, ww = 0.24, sill = 0.4;
  const st = stance(L, F, r, wr, [-1.75, 1.8], hw);
  const prof = sideProfile({ rearZ: -2.7, rearBottom: sill, frontZ: 2.72, frontBottom: sill, sill, wheels: [-1.75, 1.8], wr, top: [[2.74, 0.95], [2.3, 1.1], [1.72, 1.24], [1.16, 2.04], [0.98, 2.1], [-2.62, 2.1], [-2.72, 2.0]] });
  const em = prof.kinds.map(() => undefined), et = prof.kinds.map(() => undefined);
  const wi = prof.pts.findIndex(([z, y]) => z === 1.72 && y === 1.24);
  em[wi] = F.glass; et[wi] = [1, 1, 1];
  bodyShell(L, prof, hw, F.paint, F.tint, { edgeMats: em, edgeTints: et });
  for (const s of [-1, 1]) {
    const x = s * (hw + 0.006);
    quadTo(L, [x, 1.28, 0.92], [x, 1.28, 1.66], [x, 1.9, 1.24], [x, 1.9, 0.92], F.glass, V3(s, 0, 0));
    sideLine(L, hw, 0.85, sill + 0.05, 2.0, s); sideLine(L, hw, 1.95, sill + 0.05, 1.2, s);
    if (s < 0) { sideLine(L, hw, -0.4, sill + 0.05, 1.95, s); quad(L, [x, 1.62, -0.38], [x, 1.62, 0.8], [x, 1.66, 0.8], [x, 1.66, -0.38], 'p_rubber'); }
    panel(L, F.chrome, null, s * (hw + 0.008), 1.2, 0.98, 0.04, 0.12, s > 0 ? 'px' : 'nx');
  }
  // rear doors with windows
  panel(L, 'p_flat', null, 0, 1.15, -2.714, 0.014, 1.5, 'nz', { tint: [0.08, 0.08, 0.08] });
  for (const s of [-1, 1]) panel(L, F.glass, null, s * 0.48, 1.62, -2.716, 0.7, 0.45, 'nz');
  lightsRear(L, F, -2.716, 1.0, hw - 0.1, 0.14, 0.4);
  lightsFront(L, F, 2.752, 0.82, hw - 0.22, 0.28, 0.16, 'headRect');
  if (!F.burned) panel(L, 'p_decal', R('grille'), 0, 0.8, 2.752, 1.0, 0.24, 'pz');
  box(L, -hw, sill - 0.02, 2.68, hw, sill + 0.18, 2.84, F.trim);
  box(L, -hw, sill - 0.02, -2.84, hw, sill + 0.18, -2.66, F.trim);
  mirrors(L, F, hw, 1.3, 1.3, F.tint);
  wheelsFor(L, F, st, wr, ww, hw, [-1.75, 1.8], F.face);
  solid(L, -hw + 0.06, 0, -2.64, hw - 0.06, 2.04, 1.0, 'metal');
  solid(L, -hw + 0.06, 0, 1.0, hw - 0.06, 1.18, 2.66, 'metal');
  L.pop();
  return { topY: wp(L, 0, 2.1, 0)[1] };
});

// ---------------------------------------------------------------- trucks
/** Conventional truck cab from z0 (back of cab) to z1 (front face). */
function truckCab(L, F, { z0, z1, hw, wr, wz, sill = 0.55, belt = 1.5, roof = 2.5, tint = F.tint }) {
  const hood = z1 - 0.62;
  const prof = sideProfile({ rearZ: z0, rearBottom: sill, frontZ: z1, frontBottom: sill, sill, wheels: [wz], wr, top: [[z1 + 0.02, belt - 0.16], [z1 - 0.12, belt], [hood, belt + 0.06], [hood - 0.42, roof - 0.06], [hood - 0.52, roof], [z0, roof]] });
  const em = prof.kinds.map(() => undefined), et = prof.kinds.map(() => undefined);
  const wi = prof.pts.findIndex(([z, y]) => z === hood && y === belt + 0.06);
  em[wi] = F.glass; et[wi] = [1, 1, 1];
  bodyShell(L, prof, hw, F.paint, tint, { edgeMats: em, edgeTints: et });
  for (const s of [-1, 1]) {
    const x = s * (hw + 0.006);
    quadTo(L, [x, belt + 0.1, z0 + 0.15], [x, belt + 0.1, hood - 0.04], [x, roof - 0.12, hood - 0.46], [x, roof - 0.12, z0 + 0.15], F.glass, V3(s, 0, 0));
    sideLine(L, hw, z0 + 0.08, sill + 0.05, roof - 0.05, s); sideLine(L, hw, hood + 0.02, sill + 0.05, belt + 0.04, s);
    box(L, s * hw, sill - 0.2, z0 + 0.2, s * (hw + 0.12), sill - 0.15, z0 + 0.7, 'metalDiamond', { faces: { ny: false } });
    // west-coast mirror
    beam(L, [s * (hw + 0.02), belt + 0.12, hood - 0.08], [s * (hw + 0.28), belt + 0.12, hood - 0.08], 0.04, 0.04, F.chrome, { ends: false });
    box(L, s * (hw + 0.26), belt + 0.12, hood - 0.14, s * (hw + 0.32), belt + 0.6, hood - 0.04, F.trim);
  }
  lightsFront(L, F, z1 + 0.032, belt - 0.42, hw - 0.24, 0.3, 0.2, 'headRect');
  if (!F.burned) panel(L, 'p_decal', R('grilleTruck'), 0, belt - 0.4, z1 + 0.03, hw * 1.1, 0.55, 'pz');
  box(L, -hw - 0.04, sill - 0.12, z1 - 0.04, hw + 0.04, sill + 0.14, z1 + 0.16, F.chrome);
  for (const s of [-1, 1]) box(L, s * 0.32, roof, z0 + 0.4, s * 0.42, roof + 0.12, z0 + 0.5, 'p_emAmber', { faces: { ny: false, nz: false } });
  solid(L, -hw + 0.06, 0, z0 + 0.05, hw - 0.06, belt - 0.02, z1 - 0.05, 'metal');
  solid(L, -hw + 0.06, belt - 0.02, z0 + 0.05, hw - 0.06, roof - 0.06, hood - 0.55, 'metal');
}

export const box_truck = defProp('box_truck', (L, o, r) => {
  const F = finish(o, r, 0xe8e4dc);
  const st = stance(L, F, r, 0.5, [-2.1, 3.0], 1.15);
  truckCab(L, F, { z0: 2.2, z1: 3.95, hw: 1.08, wr: 0.5, wz: 3.0 });
  // cargo box
  const body = F.burned ? 'p_charred' : 'p_dirtyWhite';
  box(L, -1.24, 1.05, -3.7, 1.24, 3.55, 2.12, body, { faces: { ny: false }, tint: F.burned ? null : [1, 1, 1] });
  box(L, -1.24, 0.98, -3.7, 1.24, 1.05, 2.12, 'p_rubber');
  if (!F.burned) {
    for (const s of [-1, 1]) panel(L, 'p_decal', R('movers'), s * 1.252, 2.35, -0.8, 4.4, 2.0, s > 0 ? 'px' : 'nx', { flipU: false });
    panel(L, 'shutter', [0, 0, 1.2, 1.2], 0, 2.25, -3.712, 2.2, 2.4, 'nz');
    panel(L, 'p_decal', R('hazard'), 0, 1.0, -3.716, 2.4, 0.12, 'nz');
  }
  box(L, -0.9, 0.55, -3.5, 0.9, 1.0, 2.2, 'p_rubber', { faces: { py: false } });
  box(L, -1.1, 0.45, -3.82, 1.1, 0.62, -3.66, 'metalDiamond');
  zcyl(L, 0.95, 0.75, 0.6, 0.24, 1.0, 8, 'p_chrome', { capA: 'p_chrome', capB: 'p_chrome' });
  lightsRear(L, F, -3.722, 1.2, 1.05, 0.2, 0.18);
  for (const z of [-2.1]) for (const s of [-1, 1]) { wheel(L, s * 1.02, 0.5, z, F.burned ? 0.36 : 0.5, 0.3, F.burned ? 'wheelBurnt' : 'wheelSteel'); }
  for (const s of [-1, 1]) wheel(L, s * 0.96, 0.5, 3.0, F.burned ? 0.36 : 0.5, 0.26, F.burned ? 'wheelBurnt' : 'wheelSteel');
  solid(L, -1.2, 0, -3.66, 1.2, 3.5, 2.1, 'metal');
  L.pop();
  return { topY: wp(L, 0, 3.55, 0)[1] };
});

export const bus = defProp('bus', (L, o, r) => {
  const F = finish(o, r, 0xdcd8cc);
  const hw = 1.27, wr = 0.5, sill = 0.36;
  const st = stance(L, F, r, wr, [-3.0, 3.9], hw);
  const prof = sideProfile({ rearZ: -6.0, rearBottom: sill, frontZ: 6.0, frontBottom: sill, sill, wheels: [-3.0, 3.9], wr, top: [[6.03, 1.02], [6.06, 1.1], [5.98, 2.72], [5.82, 2.98], [-5.86, 2.98], [-6.02, 2.76]] });
  const em = prof.kinds.map(() => undefined), et = prof.kinds.map(() => undefined);
  const wi = prof.pts.findIndex(([z, y]) => z === 6.06 && y === 1.1);
  em[wi] = F.glass; et[wi] = [1, 1, 1];
  bodyShell(L, prof, hw, F.paint, F.tint, { edgeMats: em, edgeTints: et });
  const stripe = rgb(o.stripe !== undefined ? o.stripe : 0x1a4a8a);
  for (const s of [-1, 1]) {
    const x = s * (hw + 0.005), d = s > 0 ? 'px' : 'nx';
    // window band (glass with pillars from the shutter-like texture), stripe below
    panel(L, F.glass, [0, 0, 8, 1], x, 2.0, -0.3, 10.6, 0.95, d);
    for (let k = 0; k <= 8; k++) panel(L, F.paint, null, x + s * 0.003, 2.0, -5.6 + k * 1.325, 0.08, 0.95, d, { tint: F.tint });
    if (!F.burned) panel(L, 'p_flat', null, x, 1.32, 0, 11.6, 0.2, d, { tint: stripe });
    if (s > 0 && !F.burned) panel(L, 'p_decal', R('busAd'), x + 0.003, 0.95, -1.2, 3.0, 0.75, d);
  }
  // curb side (-x) doors
  for (const zc of [5.2, 0.6]) { panel(L, F.glass, null, -hw - 0.009, 1.5, zc, 1.1, 2.2, 'nx'); panel(L, 'p_flat', null, -hw - 0.012, 1.5, zc, 0.04, 2.2, 'nx', { tint: [0.1, 0.1, 0.1] }); }
  panel(L, F.burned ? 'p_charred' : 'p_decalLit', F.burned ? null : R('busDest'), 0, 2.85, 5.92, 1.9, 0.22, 'pz');
  box(L, -hw, 0.3, 5.98, hw, 0.62, 6.14, F.trim); box(L, -hw, 0.3, -6.14, hw, 0.62, -5.98, F.trim);
  lightsFront(L, F, 6.045, 0.85, hw - 0.3, 0.36, 0.18, 'headRect');
  lightsRear(L, F, -6.03, 1.0, hw - 0.18, 0.2, 0.4);
  panel(L, 'p_decal', R('vent'), 0, 1.6, -6.025, 1.6, 0.6, 'nz');
  box(L, -0.8, 2.98, -4.8, 0.8, 3.28, -2.8, 'metal');
  for (const z of [-3.0, 3.9]) for (const s of [-1, 1]) wheel(L, s * (hw - 0.17), wr, z, F.burned ? 0.36 : wr, 0.3, F.burned ? 'wheelBurnt' : 'wheelSteel');
  solid(L, -hw + 0.06, 0, -5.94, hw - 0.06, 2.92, 5.92, 'metal');
  L.pop();
  return { topY: wp(L, 0, 2.98, 0)[1], door: wp(L, -hw - 0.5, 0, 5.2) };
});

export const tanker_truck = defProp('tanker_truck', (L, o, r) => {
  const F = finish(o, r, 0xb82a1e);
  const st = stance(L, F, r, 0.5, [-2.6, 3.0], 1.15);
  truckCab(L, F, { z0: 2.2, z1: 3.95, hw: 1.08, wr: 0.5, wz: 3.0 });
  // chassis + tank (elliptical, 12 sides)
  box(L, -0.55, 0.62, -4.4, 0.55, 0.95, 2.2, 'p_rubber');
  const tankMat = F.burned ? 'p_charred' : 'steel';
  rod(L, [0, 2.0, -4.3], [0, 2.0, 1.95], 1.15, 10, tankMat, { up: [0, 1, 0], rv: 0.92, capA: tankMat, capB: tankMat, uvs: 'cyl', phase: PI / 10 });
  rod(L, [0, 2.0, -1.2 - 0.03], [0, 2.0, -1.2 + 0.03], 1.17, 10, 'metalDark', { up: [0, 1, 0], rv: 0.94, phase: PI / 10 });
  box(L, -0.3, 2.92, -3.8, 0.3, 2.98, 1.6, 'metalDiamond');
  for (const z of [-2.6, 0.4]) vcyl(L, 0, 2.86, z, 0.22, 0.14, 4, 'metalDark', { phase: PI / 4 });
  quadUV(L, [0.64, 0.9, -4.42], [0.4, 0.9, -4.42], [0.4, 2.85, -4.42], [0.64, 2.85, -4.42], 'p_cards', C('ladder'));
  if (!F.burned) {
    for (const s of [-1, 1]) {
      panel(L, 'p_decal', R('tankText'), s * 1.165, 2.05, -1.2, 2.6, 0.62, s > 0 ? 'px' : 'nx');
      panel(L, 'p_decal', R('flammable'), s * 1.17, 1.95, 0.6, 0.55, 0.55, s > 0 ? 'px' : 'nx');
    }
    panel(L, 'p_decal', R('flammable'), 0, 1.6, -4.32, 0.55, 0.55, 'nz');
  }
  zcyl(L, -0.85, 0.72, -1.0, 0.12, 1.6, 5, 'p_rubber', { capB: 'p_chrome' });
  lightsRear(L, F, -4.42, 0.8, 0.9, 0.2, 0.16);
  box(L, -1.1, 0.5, -4.5, 1.1, 0.66, -4.36, F.trim);
  for (const z of [-2.1, -3.2]) for (const s of [-1, 1]) wheel(L, s * 1.0, 0.5, z, F.burned ? 0.36 : 0.5, 0.32, F.burned ? 'wheelBurnt' : 'wheelSteel', 6);
  for (const s of [-1, 1]) wheel(L, s * 0.96, 0.5, 3.0, F.burned ? 0.36 : 0.5, 0.26, F.burned ? 'wheelBurnt' : 'wheelSteel', 6);
  solid(L, -1.1, 0, -4.3, 1.1, 2.9, 1.95, 'metal');
  L.pop();
  return { topY: wp(L, 0, 3.0, 0)[1], valve: wp(L, 0.9, 0.72, -1.4) };
});

export const ambulance = defProp('ambulance', (L, o, r) => {
  const F = finish(o, r, 0xecebe6);
  const st = stance(L, F, r, 0.4, [-2.3, 2.6], 1.15);
  truckCab(L, F, { z0: 1.5, z1: 3.4, hw: 1.0, wr: 0.4, wz: 2.6, sill: 0.45, belt: 1.25, roof: 2.25 });
  const body = F.burned ? 'p_charred' : 'p_paint';
  box(L, -1.16, 0.72, -3.4, 1.16, 2.95, 1.55, body, { tint: F.tint, faces: { ny: false } });
  box(L, -1.16, 0.55, -3.4, 1.16, 0.72, 1.55, 'p_rubber', { faces: { py: false } });
  const red = [0.75, 0.08, 0.06];
  if (!F.burned) {
    for (const s of [-1, 1]) {
      const d = s > 0 ? 'px' : 'nx', x = s * 1.166;
      panel(L, 'p_flat', null, x, 1.55, -0.92, 4.9, 0.32, d, { tint: red });
      panel(L, 'p_decal', R('ambText'), x + s * 0.004, 2.15, -0.9, 2.4, 0.6, d);
      panel(L, 'p_decal', R('starLife'), x + s * 0.004, 1.02, -2.3, 0.0001 + 0.55, 0.55, d);
      panel(L, F.glass, null, x, 2.1, 0.95, 0.6, 0.55, d);
      sideLine(L, 1.16, 0.4, 0.75, 2.6, s); sideLine(L, 1.16, 1.3, 0.75, 2.6, s);
    }
    panel(L, 'p_flat', null, 0, 1.55, -3.412, 2.3, 0.32, 'nz', { tint: red });
    panel(L, 'p_decal', R('starLife'), 0, 2.5, -3.416, 0.6, 0.6, 'nz');
    panel(L, 'p_decal', R('starLife'), 0, 2.956, -1.0, 1.0, 1.0, 'py');
    for (const s of [-1, 1]) panel(L, F.glass, null, s * 0.5, 2.15, -3.414, 0.6, 0.5, 'nz');
    panel(L, 'p_flat', null, 0, 1.6, -3.416, 0.016, 2.0, 'nz', { tint: [0.1, 0.1, 0.1] });
  }
  // light bars
  const off = o.lights === false || F.burned;
  for (const [x, z, m] of [[-1.0, 1.5, 'p_emRed'], [1.0, 1.5, 'p_emRed'], [-1.0, -3.35, 'p_emRed'], [1.0, -3.35, 'p_emRed'], [0, 1.5, 'p_emWhite']]) cbox(L, x, 2.95, z, 0.28, 0.12, 0.1, off ? 'p_flat' : m, { tint: off ? [0.4, 0.1, 0.1] : null, faces: { ny: false } });
  box(L, -0.7, 2.25, 2.0, 0.7, 2.37, 2.18, off ? 'p_flat' : 'p_emRed', { tint: off ? [0.4, 0.1, 0.1] : null });
  lightsRear(L, F, -3.416, 1.0, 1.0, 0.2, 0.22);
  box(L, -1.05, 0.48, -3.55, 1.05, 0.62, -3.38, 'metalDiamond');
  for (const s of [-1, 1]) { wheel(L, s * 0.98, 0.4, -2.3, F.burned ? 0.3 : 0.4, 0.3, F.burned ? 'wheelBurnt' : 'wheelSteel'); wheel(L, s * 0.88, 0.4, 2.6, F.burned ? 0.3 : 0.4, 0.24, F.burned ? 'wheelBurnt' : 'wheelSteel'); }
  solid(L, -1.12, 0, -3.36, 1.12, 2.9, 1.52, 'metal');
  L.pop();
  return { topY: wp(L, 0, 2.95, 0)[1], rearDoor: wp(L, 0, 0, -3.9) };
});

export const ceda_trailer = defProp('ceda_trailer', (L, o, r) => {
  const F = finish(o, r, 0xc8c8c4);
  const hw = 1.28, y0 = 1.25, y1 = 4.05, zr = -6.2, zf = 6.2;
  const body = F.burned ? 'p_charred' : 'p_dirtyWhite';
  box(L, -hw, y0, zr, hw, y1, zf, body, { tint: F.burned ? null : F.tint, maxQuad: 4, subdivide: true });
  box(L, -hw + 0.02, y1, zr + 0.02, hw - 0.02, y1 + 0.04, zf - 0.02, 'metal');
  // underframe, axles, landing gear
  box(L, -0.5, 0.95, zr + 0.2, 0.5, y0, zf - 0.3, 'p_rubber', { faces: { py: false } });
  for (const s of [-1, 1]) {
    box(L, s * 0.62, 0.15, 3.8, s * 0.74, y0, 3.92, 'metalDark');
    box(L, s * 0.5, 0.0, 3.68, s * 0.86, 0.15, 4.04, 'metalDark');
  }
  box(L, -0.74, 0.55, 3.82, 0.74, 0.62, 3.9, 'metalDark');
  for (const z of [-4.4, -5.5]) for (const s of [-1, 1]) wheel(L, s * (hw - 0.16), 0.5, z, F.burned ? 0.36 : 0.5, 0.32, F.burned ? 'wheelBurnt' : 'wheelSteel');
  box(L, -hw, 0.95, -5.0, hw, 1.25, -3.9, 'p_rubber', { faces: { py: false } });
  if (!F.burned) {
    for (const s of [-1, 1]) {
      const x = s * (hw + 0.006), d = s > 0 ? 'px' : 'nx';
      panel(L, 'p_decal', R('ceda'), x, 2.85, 0.6, 4.6, 2.3, d, { flipU: false });
      panel(L, 'p_decal', R('stripeRW'), x, 1.36, 0, 12.2, 0.18, d);
      panel(L, 'p_flat', null, x, 3.85, 0, 12.2, 0.2, d, { tint: [0.15, 0.25, 0.6] });
      panel(L, 'p_decal', R('hazard'), x + s * 0.002, 1.62, -2.5, 3.0, 0.24, d);
    }
    panel(L, 'p_decal', R('ceda'), 0, 3.2, zr - 0.006, 1.6, 0.8, 'nz');
    panel(L, 'p_decal', R('stripeRW'), 0, 1.36, zr - 0.006, 2.5, 0.18, 'nz');
  }
  for (const x of [-0.6, 0.6]) box(L, x - 0.025, 1.5, zr - 0.06, x + 0.025, 3.9, zr - 0.02, 'p_chrome');
  panel(L, 'p_flat', null, 0, 2.65, zr - 0.012, 0.02, 2.7, 'nz', { tint: [0.15, 0.15, 0.15] });
  box(L, -1.2, 0.85, zr - 0.15, 1.2, 1.0, zr + 0.2, F.trim);
  lightsRear(L, F, zr - 0.012, 1.1, 1.05, 0.22, 0.16);
  solid(L, -hw + 0.04, y0 + 0.04, zr + 0.04, hw - 0.04, y1 - 0.04, zf - 0.04, 'metal');
  solid(L, -hw + 0.1, 0, -5.9, hw - 0.1, y0 + 0.04, -3.95, 'metal');
  solid(L, -0.86, 0, 3.7, 0.86, y0 + 0.04, 4.02, 'metal');
  return { topY: wp(L, 0, y1, 0)[1], rearDoor: wp(L, 0, 0, zr - 0.6) };
});

// ---------------------------------------------------------------- helicopter (set dressing, no collision)
export const helicopter = defProp('helicopter', (L, o, r) => {
  const tint = rgb(o.color !== undefined ? o.color : 0x4a5636);
  const rings = [
    [2.55, 0.12, 0.18, 1.25], [2.15, 0.62, 0.6, 1.3], [1.2, 0.86, 0.95, 1.45], [-0.6, 0.86, 0.95, 1.5], [-1.6, 0.42, 0.55, 1.75],
  ];
  const ring = ([z, rx, ry, cy]) => { const pts = []; for (let i = 0; i < 6; i++) { const a = (i + 0.5) / 6 * TAU; pts.push([Math.cos(a) * rx, cy + Math.sin(a) * ry, z]); } return pts; };
  for (let i = 0; i < rings.length - 1; i++) {
    const A = ring(rings[i + 1]), B = ring(rings[i]);
    loft(L, A, B, i <= 1 ? 'p_carGlass' : 'p_paint', { tint: i <= 1 ? null : tint, capB: i === 0 ? 'p_carGlass' : false });
  }
  { const rp = ring(rings[rings.length - 1]); for (let i = 1; i < rp.length - 1; i++) triTo(L, rp[0], rp[i], rp[i + 1], 'p_paint', V3(0, 0, -1), { tint }); }
  rod(L, [0, 1.85, -1.6], [0, 2.05, -6.4], 0.34, 5, 'p_paint', { r2: 0.13, tint, capB: 'p_paint' });
  extrude(L, [[-6.0, 2.0], [-6.5, 2.0], [-6.85, 3.0], [-6.55, 3.0]], 'x', -0.04, 0.04, 'p_paint', { tint });
  box(L, -1.0, 2.0, -6.35, 1.0, 2.04, -6.15, 'p_paint', { tint });
  // tail rotor
  box(L, 0.08, 2.05, -6.72, 0.11, 3.15, -6.6, 'metalDark');
  // engine housing + mast + rotor
  box(L, -0.6, 2.35, -1.3, 0.6, 2.75, 0.8, 'p_paint', { tint });
  rod(L, [0, 2.75, 0.0], [0, 3.15, 0.0], 0.1, 5, 'metalDark');
  cbox(L, 0, 3.12, 0, 0.36, 0.12, 0.36, 'metalDark');
  const a0 = o.rotor !== undefined ? o.rotor : r() * PI;
  for (let k = 0; k < 4; k++) {
    const a = a0 + k * HP;
    pushR(L, [0, 3.18, 0], 0, a, 0); box(L, 0.15, -0.02, -0.16, 7.2, 0.02, 0.16, 'metalDark'); L.pop();
  }
  // skids
  for (const s of [-1, 1]) {
    rod(L, [s * 1.05, 0.1, -1.8], [s * 1.05, 0.1, 2.0], 0.05, 4, 'metalDark', { capA: 'metalDark', capB: 'metalDark' });
    for (const z of [-0.9, 1.1]) beam(L, [s * 1.05, 0.1, z], [s * 0.6, 0.9, z], 0.07, 0.07, 'metalDark');
  }
  for (const s of [-1, 1]) panel(L, 'p_decal', R('ceda'), s * 0.955, 1.35, -0.2, 1.2, 0.6, s > 0 ? 'px' : 'nx');
  return { topY: wp(L, 0, 3.2, 0)[1] };
});

// ---------------------------------------------------------------- finale stock car
/**
 * 1960s winged stock car (finale centrepiece). Blue, white #29, invented sponsors.
 * opts: color, number decals are fixed '29'; stand (display plinth); wing (default true).
 * Returns { fuelCap, topY, nose, tail, driverDoor }.
 */
export const stock_car = defProp('stock_car', (L, o, r) => {
  const tint = rgb(o.color !== undefined ? o.color : 0x1d4fa8);
  const W = [1, 1, 1];
  let lift = 0;
  if (o.stand) {
    const rr = 3.7, n = 12;
    const pts = []; for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * TAU; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    extrude(L, pts, 'y', 0, 0.22, { side: 'p_chrome', cap0: null, cap1: 'carpetRed' });
    solid(L, -rr * 0.92, 0, -rr * 0.92, rr * 0.92, 0.22, rr * 0.92, 'metal');
    lift = 0.22;
  }
  L.push([0, lift, 0]);
  const hw = 0.97, wr = 0.34, sill = 0.24, belt = 0.9, roof = 1.31;
  const wz = [-1.55, 1.5];
  // ---- main body (rear .. start of nose cone)
  const prof = sideProfile({ rearZ: -2.74, rearBottom: 0.3, frontZ: 1.95, frontBottom: sill, sill, wheels: wz, wr, gap: 0.07, archN: 7,
    top: [[1.95, 0.74], [1.8, 0.8], [1.2, 0.9], [-1.45, 0.92], [-2.62, 0.9], [-2.76, 0.8]] });
  const em = prof.kinds.map(() => undefined);
  const deck = prof.pts.findIndex(([z, y]) => z === 1.2 && y === 0.9);
  em[deck] = 'black';
  bodyShell(L, prof, hw, 'p_paint', tint, { edgeMats: em, edgeTints: prof.kinds.map((k, i) => (i === deck ? W : undefined)) });
  // ---- nose cone (3 rings)
  const ringAt = (z, xs, ys) => [[-xs[0], ys[0], z], [xs[0], ys[0], z], [xs[0], ys[1], z], [xs[1], ys[2], z], [-xs[1], ys[2], z], [-xs[0], ys[1], z]];
  const nA = ringAt(1.95, [0.97, 0.85], [0.24, 0.7, 0.745]);
  const nM = ringAt(2.5, [0.88, 0.7], [0.23, 0.6, 0.67]);
  const nB = ringAt(2.98, [0.52, 0.36], [0.27, 0.43, 0.5]);
  loft(L, nA, nM, 'p_paint', { tint });
  const g = R('grille');
  loft(L, nM, nB, 'p_paint', { tint, capB: 'p_decal', capUVB: nB.map(([x, y]) => [g[0] + (x + 0.52) / 1.04 * (g[2] - g[0]), g[1] + (y - 0.27) / 0.23 * (g[3] - g[1])]) });
  box(L, -0.72, 0.17, 2.3, 0.72, 0.23, 2.96, 'black');
  // hidden headlight covers (seams) + hood decal + scoop + hood pins
  for (const s of [-1, 1]) quad(L, [s * 0.75, 0.665, 2.45], [s * 0.42, 0.665, 2.45], [s * 0.4, 0.61, 2.7], [s * 0.72, 0.61, 2.7], 'p_flat', { tint: [0.05, 0.08, 0.15] });
  const hy = (z) => 0.8 + (1.8 - z) / 0.6 * 0.1 + 0.012;
  quadUV(L, [-0.46, hy(1.74), 1.74], [0.46, hy(1.74), 1.74], [0.46, hy(1.5), 1.5], [-0.46, hy(1.5), 1.5], 'p_decal', R('spGator'));
  extrude(L, [[1.22, hy(1.22) - 0.012], [1.46, hy(1.46) - 0.012], [1.46, hy(1.46) + 0.05], [1.22, hy(1.22) + 0.075]], 'x', -0.24, 0.24, { side: 'p_paint', cap0: 'p_paint', cap1: 'p_paint', edges: [null, 'black', 'p_paint', 'p_paint'] }, { tint, edgeTint: [W, W, tint, tint] });
  for (const s of [-1, 1]) cbox(L, s * 0.62, hy(1.85) - 0.01, 1.85, 0.05, 0.03, 0.05, 'p_chrome');
  // ---- greenhouse (transparent glass, open driver window with net)
  const cab = [[-1.45, 0.91], [1.18, 0.9], [0.28, roof], [-0.56, roof]];
  const hwAt = (v) => 0.86 + (0.66 - 0.86) * Math.max(0, (v - belt) / (roof - belt));
  extrude(L, cab, 'x', (u, v) => -hwAt(v), (u, v) => hwAt(v), { side: 'p_paint', cap0: 'p_glass', cap1: null, edges: [null, 'p_glass', 'p_paint', 'p_paint'] }, { tint, edgeTint: [W, W, tint, tint], capTint: W });
  // rear window inset on the fastback
  const rw = (t) => [-0.56 + (-1.45 + 0.56) * t, roof + (0.91 - roof) * t];
  { const [za, ya] = rw(0.08), [zb, yb] = rw(0.8); const xa = hwAt(ya) - 0.1, xb = hwAt(yb) - 0.1; quadTo(L, [-xb, yb + 0.012, zb], [xb, yb + 0.012, zb], [xa, ya + 0.012, za], [-xa, ya + 0.012, za], 'p_carGlass', V3(0, 1, -0.6)); }
  // headliner + driver window net
  quad(L, [-0.66, roof - 0.01, -0.56], [0.66, roof - 0.01, -0.56], [0.66, roof - 0.01, 0.28], [-0.66, roof - 0.01, 0.28], 'black');
  { const x0 = hwAt(0.95) + 0.01, x1 = hwAt(1.26) + 0.01; quadUV(L, [x0, 0.95, 0.62], [x0, 0.95, -0.42], [x1, 1.26, -0.42], [x1, 1.26, 0.28], 'p_decal', R('net')); }
  // windshield banner
  { const a = [1.18, 0.9], b = [0.28, roof]; const t0 = 0.8; const p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0]; const nz = 0.41, ny = 0.9, e = 0.012;
    const x0 = hwAt(p0[1]) - 0.02, x1 = hwAt(roof) - 0.02;
    quadUV(L, [-x0, p0[1] + ny * e, p0[0] + nz * e], [x0, p0[1] + ny * e, p0[0] + nz * e], [x1, roof - 0.005 + ny * e, b[0] + nz * e], [-x1, roof - 0.005 + ny * e, b[0] + nz * e], 'p_decal', R('banner')); }
  // ---- interior: seat, dash, wheel, roll cage
  box(L, 0.2, 0.92, -0.78, 0.7, 1.24, -0.62, 'p_fabric', { tint: [0.15, 0.15, 0.17] });
  box(L, 0.3, 1.24, -0.76, 0.6, 1.3, -0.64, 'p_fabric', { tint: [0.15, 0.15, 0.17] });
  box(L, -0.8, 0.92, 0.75, 0.8, 1.02, 1.05, 'black');
  { const c = V3(0.45, 1.06, 0.55); const pts = []; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; pts.push(c.clone().add(V3(Math.cos(a) * 0.17, Math.sin(a) * 0.17 * 0.8, Math.sin(a) * 0.17 * 0.55))); } for (let i = 1; i < 7; i++) { triTo(L, pts[0], pts[i], pts[i + 1], 'black', V3(0, 0.5, -0.8)); triTo(L, pts[0], pts[i], pts[i + 1], 'black', V3(0, -0.5, 0.8)); } }
  const cage = (a, b) => rod(L, a, b, 0.03, 4, 'p_paint', { tint: [0.85, 0.85, 0.85] });
  cage([0.78, 0.92, -0.86], [0.62, 1.27, -0.86]); cage([0.62, 1.27, -0.86], [-0.62, 1.27, -0.86]); cage([-0.62, 1.27, -0.86], [-0.78, 0.92, -0.86]);
  cage([0.62, 1.27, -0.86], [0.5, 1.27, 0.25]); cage([-0.62, 1.27, -0.86], [-0.5, 1.27, 0.25]);
  cage([0.76, 0.95, -0.86], [0.76, 1.08, 0.75]); cage([0.62, 1.27, -0.86], [0.2, 0.93, -1.3]);
  // ---- wing: swept struts + blade
  for (const s of [-1, 1]) extrude(L, [[-2.64, 0.9], [-2.05, 0.91], [-2.5, 1.56], [-2.8, 1.56]], 'x', s * 0.82, s * 0.865, 'p_paint', { tint });
  if (o.wing !== false) {
    pushR(L, [0, 1.56, -2.64], -0.08, 0, 0);
    box(L, -0.99, 0, -0.22, 0.99, 0.06, 0.22, 'p_paint', { tint });
    panel(L, 'p_decal', R('spGator'), 0, 0.061, 0, 1.2, 0.3, 'py');
    L.pop();
  }
  // ---- bumpers, valance, tail lights, exhaust, mirror, antenna, fuel cap
  box(L, -0.92, 0.3, -2.84, 0.92, 0.44, -2.72, 'p_chrome');
  box(L, -0.9, 0.16, -2.72, 0.9, 0.3, -2.3, 'black', { faces: { pz: false } });
  panel(L, 'p_decal', R('tail'), 0, 0.64, -2.762, 1.5, 0.13, 'nz');
  panel(L, 'p_decal', R('plate'), 0, 0.52, -2.762, 0.3, 0.15, 'nz');
  for (const s of [-1, 1]) {
    rod(L, [s * 0.99, 0.24, -0.7], [s * 0.99, 0.24, 0.62], 0.055, 6, 'p_chrome', { capA: 'black', capB: 'p_chrome' });
  }
  box(L, hwAt(belt) + 0.02, belt + 0.03, 0.95, hwAt(belt) + 0.15, belt + 0.12, 1.08, 'p_paint', { tint });
  panel(L, 'p_chrome', null, hwAt(belt) + 0.085, belt + 0.075, 0.948, 0.12, 0.08, 'nz');
  quad(L, [0.3, roof, -0.5], [0.31, roof, -0.5], [0.33, roof + 0.55, -0.62], [0.32, roof + 0.55, -0.62], 'p_wireBlack');
  const fc = [hw + 0.005, 0.8, -2.3];
  rod(L, [hw - 0.01, fc[1], fc[2]], [hw + 0.035, fc[1], fc[2]], 0.085, 8, 'p_chrome', { capB: 'p_chrome' });
  rod(L, [hw + 0.035, fc[1], fc[2]], [hw + 0.05, fc[1], fc[2]], 0.04, 4, 'metalDark', { capB: 'metalDark' });
  // ---- panel seams, drip rails, A-pillars, chin trim, fuel tag
  for (const s of [-1, 1]) for (const z of [1.07, -1.13]) sideLine(L, hw, z, sill + 0.05, 0.86, s, 0.012);
  for (const [a, b2] of [[[-0.75, 0.926, -1.56], [0.75, 0.926, -1.56]], [[-0.75, 0.926, -1.56], [-0.75, 0.905, -2.6]], [[0.75, 0.926, -1.56], [0.75, 0.905, -2.6]]]) beam(L, a, b2, 0.012, 0.004, 'p_flat', { ends: false, tint: [0.06, 0.06, 0.08] });
  for (const s of [-1, 1]) {
    beam(L, [s * (hwAt(roof) + 0.005), roof - 0.01, 0.26], [s * (hwAt(roof) + 0.005), roof - 0.01, -0.54], 0.02, 0.02, 'p_chrome', { ends: false });
    const x0 = hwAt(0.9) - 0.01, x1 = hwAt(roof) - 0.01;
    quadTo(L, [s * x0, 0.905, 1.19], [s * (x0 - 0.07), 0.905, 1.19], [s * (x1 - 0.07), roof + 0.004, 0.27], [s * x1, roof + 0.004, 0.27], 'p_flat', V3(0, 0.9, 0.42), { tint: [0.05, 0.05, 0.06] });
  }
  box(L, -0.5, 0.25, 2.9, 0.5, 0.29, 3.0, 'p_chrome', { faces: { ny: false } });
  panel(L, 'p_decal', R('fuelTag'), hw + 0.009, 0.66, -2.3, 0.2, 0.08, 'px');
  // ---- decals: numbers, sponsors
  for (const s of [-1, 1]) {
    const x = s * (hw + 0.008), d = s > 0 ? 'px' : 'nx';
    panel(L, 'p_decal', R('n29'), x, 0.56, -0.28, 0.56, 0.56, d);
    panel(L, 'p_decal', R('spPeach'), x, 0.66, 0.62, 0.8, 0.2, d);
    panel(L, 'p_decal', R('spContin'), x, 0.42, 0.62, 0.8, 0.2, d);
    panel(L, 'p_decal', R('spThunder'), x, 0.5, -2.32, 0.66, 0.17, d);
    panel(L, 'p_flat', null, x, 0.86, 0.15, 3.6, 0.04, d, { tint: [0.92, 0.92, 0.9] });
  }
  quadUV(L, [-0.3, roof + 0.012, -0.42], [-0.3, roof + 0.012, 0.14], [0.3, roof + 0.012, 0.14], [0.3, roof + 0.012, -0.42], 'p_decal', R('n29'));
  quadUV(L, [0.5, 0.932, -2.36], [-0.5, 0.932, -2.36], [-0.5, 0.932, -2.1], [0.5, 0.932, -2.1], 'p_decal', R('banner'));
  // ---- wheels (10-sided race wheels)
  for (const z of wz) for (const s of [-1, 1]) wheel(L, s * (hw - 0.15), wr, z, wr, 0.29, 'wheelRace', 10);
  // ---- collision
  solid(L, -hw + 0.06, 0, -2.7, hw - 0.06, 0.84, 1.9, 'metal');
  solid(L, -0.6, 0, 1.9, 0.6, 0.42, 2.9, 'metal');
  solid(L, -0.6, 0.84, -0.5, 0.6, roof - 0.06, 0.22, 'metal');
  solid(L, -0.95, 1.52, -2.84, 0.95, 1.62, -2.46, 'metal');
  const res = {
    fuelCap: wp(L, fc[0] + 0.06, fc[1], fc[2]),
    topY: wp(L, 0, 1.62, 0)[1],
    nose: wp(L, 0, 0.4, 3.0), tail: wp(L, 0, 0.5, -2.85), driverDoor: wp(L, hw + 0.6, 0, 0),
  };
  L.pop();
  return res;
});

export const VEHICLES = { car, hatchback, police_car, taxi, pickup_truck, van, box_truck, bus, tanker_truck, ambulance, ceda_trailer, helicopter, stock_car };
