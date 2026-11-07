// =============================================================================
// Procedural building generators writing into a merged GeoBuilder:
// high-rise towers (podium, setback tiers, chamfered / round shafts, crowns,
// spires, lit lanterns, roof plant, aircraft warning lights), mid-rise blocks,
// low commercial / industrial buildings and generic roof equipment.
// All coordinates are region-local; y0 = ground level under the building.
// =============================================================================
import { ST, lin, scalec, mixc } from './util.js';
import { LAMP } from './roads.js';

export const GLASS_TINTS = [
  lin('#5d7f99', 0.95), lin('#4f7a78', 0.9), lin('#7c6a55', 0.85), lin('#8a9198', 0.95), lin('#3a4249', 0.9),
  lin('#6b8fa8', 1.0), lin('#58706a', 0.9), lin('#9aa3a8', 0.9),
];
export const CONCRETE = [lin('#b9b2a5'), lin('#a8a49b'), lin('#c9c0ae'), lin('#8f8a82'), lin('#d6d0c4'), lin('#b5a48d'), lin('#9a8f80')];
export const STUCCO = [lin('#e8dfcf'), lin('#efe6d4'), lin('#e2d2b8'), lin('#d9c7a8'), lin('#f1ece2'), lin('#e6d5c3'), lin('#cfc3ae'), lin('#e9d9b9'), lin('#d8b99a'), lin('#c9d0c9'), lin('#e3cfc0')];
export const BRICK = [lin('#8a5a44'), lin('#7a4a3a'), lin('#9b6b52'), lin('#6e4434'), lin('#a3785e')];
export const ROOF_FLAT = [lin('#9c9a95'), lin('#b8b6b0'), lin('#7d7b77'), lin('#c9c7c0'), lin('#6a6965'), lin('#d8d6d0')];
const MECH = lin('#5f5e5b');
const DARK = lin('#2c2d2e');

/** Convex prism from a CCW (seen from above, x east z south -> use order with outward normals) local polygon. */
export function prism(B, cx, cz, rot, poly, y0, y1, { vBase = y0, roofStyle = ST.ROOF, roofColor = null, u0 = 0 } = {}) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const W = poly.map(([lx, lz]) => [cx + lx * c + lz * s, cz - lx * s + lz * c]);
  let u = u0;
  const v0 = y0 - vBase, v1 = y1 - vBase;
  for (let i = 0; i < W.length; i++) {
    const a = W[i], b = W[(i + 1) % W.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    B.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], [u, v0, u + len, v0, u + len, v1, u, v1]);
    u += len;
  }
  if (roofStyle !== null) {
    const save = B.style, saveC = B.color;
    B.style = [roofStyle, save[1], save[2], save[3]];
    if (roofColor) B.color = roofColor;
    for (let i = 1; i < W.length - 1; i++) {
      B.tri([W[0][0], y1, W[0][1]], [W[i][0], y1, W[i][1]], [W[i + 1][0], y1, W[i + 1][1]], [W[0][0], W[0][1], W[i][0], W[i][1], W[i + 1][0], W[i + 1][1]]);
    }
    B.style = save; B.color = saveC;
  }
  return W;
}

// polygons with outward-facing walls for the builder's winding (box(): +z, +x, -z, -x order)
export function rectPoly(hw, hd) { return [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]]; }
export function chamferPoly(hw, hd, k) { return [[-hw + k, hd], [hw - k, hd], [hw, hd - k], [hw, -hd + k], [hw - k, -hd], [-hw + k, -hd], [-hw, -hd + k], [-hw, hd - k]]; }
export function roundPoly(r, n = 16, ry = r) { const p = []; for (let i = 0; i < n; i++) { const a = -i / n * Math.PI * 2 + Math.PI / 2; p.push([Math.cos(a) * r, Math.sin(a) * ry]); } return p; }

/** Rooftop plant: HVAC units, mechanical penthouse, a few vents. */
export function roofPlant(B, r, x, z, y, hw, hd, rot, amount = 1) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  B.setStyle(ST.PLAIN, r() * 100, 3, 3);
  // parapet ring
  const pt = 0.35, ph = 1.1;
  B.setColor(scalec(B.color, 1));
  if (hw > 6 && hd > 6) {
    for (const [ax, az, bw, bd] of [[0, hd - pt, hw, pt], [0, -hd + pt, hw, pt], [hw - pt, 0, pt, hd], [-hw + pt, 0, pt, hd]]) {
      const [px, pz] = P(ax, az);
      B.box(px, pz, y, y + ph, bw, bd, rot, { roofStyle: ST.PLAIN });
    }
  }
  const n = Math.round((1 + Math.min(8, hw * hd / 120)) * amount);
  for (let i = 0; i < n; i++) {
    const w = 1.5 + r() * 3.5, d = 1.5 + r() * 3, h = 1.2 + r() * 2.2;
    const lx = (r() * 2 - 1) * Math.max(0, hw - w - 2), lz = (r() * 2 - 1) * Math.max(0, hd - d - 2);
    const [px, pz] = P(lx, lz);
    B.setColor(r() < 0.6 ? lin('#9fa09c') : lin('#cfcfca'));
    B.setStyle(ST.METAL, r() * 100, 3, 3);
    B.box(px, pz, y, y + h, w / 2, d / 2, rot, { roofStyle: ST.METAL });
  }
  if (hw > 10 && hd > 10 && r() < 0.8) {
    const w = hw * (0.3 + r() * 0.25), d = hd * (0.3 + r() * 0.25);
    const [px, pz] = P((r() - 0.5) * hw * 0.5, (r() - 0.5) * hd * 0.5);
    B.setColor(MECH); B.setStyle(ST.PLAIN, r() * 100, 3, 3);
    B.box(px, pz, y, y + 3.5 + r() * 2.5, w, d, rot, { roofStyle: ST.ROOF, roofColor: lin('#7a7975') });
  }
}

/**
 * High-rise tower. o: {x, z, y0, hw, hd, H, rot, kind: 'office'|'resid', seed}
 */
export function tower(B, lights, r, o) {
  const { x, z, y0, rot = 0 } = o;
  let { hw, hd, H } = o;
  const office = o.kind !== 'resid';
  const seed = o.seed ?? r() * 1000;
  const floorH = office ? 3.9 + r() * 0.4 : 3.1 + r() * 0.2;
  const curtain = office ? r() < 0.82 : r() < 0.3;
  const tint = GLASS_TINTS[Math.floor(r() * GLASS_TINTS.length)];
  const wallCol = curtain ? tint : (r() < 0.75 ? CONCRETE[Math.floor(r() * CONCRETE.length)] : STUCCO[Math.floor(r() * STUCCO.length)]);
  const facStyle = curtain ? ST.CURTAIN : (office ? ST.RIBBON : (r() < 0.5 ? ST.PUNCHED : ST.RESID));
  const bay = curtain ? 1.5 : (facStyle === ST.RIBBON ? 1.6 : 3.2);
  // --- podium
  let base = y0 - 2;
  const podFloors = r() < 0.75 ? 2 + Math.floor(r() * 4) : 0;
  if (podFloors > 0 && o.podHW) {
    const pc = CONCRETE[Math.floor(r() * CONCRETE.length)];
    B.setColor(r() < 0.5 ? pc : scalec(tint, 0.9)).setStyle(r() < 0.5 ? ST.RIBBON : ST.PUNCHED, seed + 5, 4.5, 3.0);
    const ph = podFloors * 4.5;
    B.box(x, z, base, y0 + ph, o.podHW, o.podHD, rot, { roofStyle: ST.ROOF, roofColor: ROOF_FLAT[Math.floor(r() * ROOF_FLAT.length)], vBase: y0 });
    roofPlant(B, r, x + (r() - 0.5) * 8, z + (r() - 0.5) * 8, y0 + ph, o.podHW * 0.9, o.podHD * 0.9, rot, 0.6);
    base = y0 + ph - 0.5;
  }
  // --- shaft
  const shape = r();
  const tiers = H > 120 && r() < 0.55 ? 2 + Math.floor(r() * 2) : 1;
  let top = y0 + H;
  B.setColor(wallCol).setStyle(facStyle, seed, floorH, bay);
  let curHW = hw, curHD = hd, y = base;
  let poly = null;
  for (let t = 0; t < tiers; t++) {
    const frac = tiers === 1 ? 1 : (t === 0 ? 0.55 + r() * 0.15 : (t === tiers - 1 ? 1 : 0.8 + r() * 0.1));
    const yT = t === tiers - 1 ? top : y0 + H * frac;
    if (tiers === 1 && shape < 0.18) poly = roundPoly(Math.min(curHW, curHD), 20);
    else if (shape < 0.42) poly = chamferPoly(curHW, curHD, Math.min(curHW, curHD) * (0.18 + r() * 0.15));
    else poly = rectPoly(curHW, curHD);
    prism(B, x, z, rot, poly, y, yT, { vBase: y0, roofStyle: ST.ROOF, roofColor: ROOF_FLAT[Math.floor(r() * ROOF_FLAT.length)] });
    // setback ledge (dark band at the top of each tier)
    y = yT;
    curHW *= 0.72 + r() * 0.12; curHD *= 0.72 + r() * 0.12;
  }
  const tw = tiers > 1 ? curHW / (0.78) : hw, td = tiers > 1 ? curHD / 0.78 : hd;
  // --- crown
  const crown = r();
  let lightTop = top;
  if (crown < 0.22 && H > 100) {
    // lantern: lit band(s) at the top + pointed cap
    B.setColor(r() < 0.5 ? LAMP.led : (r() < 0.5 ? [0.55, 0.75, 1.0] : [1.0, 0.75, 0.4])).setStyle(ST.LAMP, seed, 3, 3);
    const lp = poly && poly.length > 4 ? poly : rectPoly(tw * 0.98, td * 0.98);
    prism(B, x, z, rot, lp.map(([a, b]) => [a * 1.01, b * 1.01]), top - 4, top - 2.2, { roofStyle: null });
    B.setColor(scalec(tint, 0.8)).setStyle(ST.CURTAIN, seed + 1, 2.0, 1.5);
    const capH = 10 + r() * 22;
    const c = Math.cos(rot), s = Math.sin(rot);
    const pts = (lp.length > 4 ? lp : rectPoly(tw, td)).map(([a, b]) => [x + a * c + b * s, top, z - a * s + b * c]);
    for (let i = 0; i < pts.length; i++) B.tri(pts[i], pts[(i + 1) % pts.length], [x, top + capH, z], [0, 0, 6, 0, 3, capH]);
    lightTop = top + capH;
  } else if (crown < 0.45) {
    // spire / antenna mast
    roofPlant(B, r, x, z, top, tw * 0.95, td * 0.95, rot, 1);
    B.setColor(lin('#b9bcbe')).setStyle(ST.METAL, seed, 3, 3);
    const sh = H * (0.08 + r() * 0.14);
    B.cylinder(x, z, top, top + sh, Math.min(tw, td) * 0.08 + 0.5, 0.25, 8);
    lightTop = top + sh;
  } else if (crown < 0.62) {
    // slanted / wedge top in glass
    B.setColor(scalec(tint, 0.85)).setStyle(ST.CURTAIN, seed + 2, floorH, 1.5);
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (a, b, yy) => [x + a * c + b * s, yy, z - a * s + b * c];
    const wh = Math.min(tw, td) * (0.6 + r() * 0.5);
    B.quad(P(-tw, td, top), P(tw, td, top), P(tw, -td, top + wh), P(-tw, -td, top + wh), [0, 0, 2 * tw, 0, 2 * tw, wh, 0, wh]);
    B.quad(P(-tw, -td, top), P(-tw, -td, top + wh), P(tw, -td, top + wh), P(tw, -td, top));
    B.tri(P(tw, td, top), P(tw, -td, top), P(tw, -td, top + wh));
    B.tri(P(-tw, -td, top), P(-tw, td, top), P(-tw, -td, top + wh));
    lightTop = top + wh;
  } else {
    roofPlant(B, r, x, z, top, tw * 0.95, td * 0.95, rot, 1.2);
    lightTop = top + 6;
    if (r() < 0.3 && tw > 12) {
      // helipad
      B.setColor(lin('#4a4b4d')).setStyle(ST.PLAIN, seed, 3, 3);
      B.cylinder(x + tw * 0.3, z, top + 1.0, top + 1.6, Math.min(tw, td) * 0.45, Math.min(tw, td) * 0.45, 12, { capStyle: ST.PLAIN });
    }
  }
  // --- aircraft warning lights (red), flashing on the tallest
  if (lights && H > 90) {
    const red = [1.0, 0.04, 0.02];
    const flash = H > 180;
    const E = flash ? 220 : 90;
    lights.add(x, lightTop + 0.8, z, scalec(red, E), 1.4, 2, flash ? 1.5 : 0, r() * 0.05);
    if (H > 150) {
      const c = Math.cos(rot), s = Math.sin(rot);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        lights.add(x + a * tw * c + b * td * s, top + 0.6, z - a * tw * s + b * td * c, scalec(red, 50), 0.9, 2, 0, 0);
      }
      // mid-height side lights
      for (const [a, b] of [[-1, 0], [1, 0]]) lights.add(x + a * hw * 1.01 * c, y0 + H * 0.5, z - a * hw * 1.01 * s + b, scalec(red, 40), 0.8, 2, 0, 0);
    }
  }
  return lightTop;
}

/** Mid-rise building (4-14 floors) with flat roof + plant. */
export function midrise(B, r, o) {
  const { x, z, y0, hw, hd, floors, rot = 0, seed = r() * 1000 } = o;
  const resid = o.kind === 'resid';
  const style = o.style ?? (resid ? (r() < 0.6 ? ST.RESID : ST.PUNCHED) : (r() < 0.45 ? ST.RIBBON : (r() < 0.6 ? ST.PUNCHED : ST.CURTAIN)));
  let col;
  if (style === ST.CURTAIN) col = GLASS_TINTS[Math.floor(r() * GLASS_TINTS.length)];
  else if (resid) col = r() < 0.75 ? STUCCO[Math.floor(r() * STUCCO.length)] : BRICK[Math.floor(r() * BRICK.length)];
  else col = r() < 0.6 ? CONCRETE[Math.floor(r() * CONCRETE.length)] : (r() < 0.6 ? STUCCO[Math.floor(r() * STUCCO.length)] : BRICK[Math.floor(r() * BRICK.length)]);
  const fh = resid ? 3.0 : 3.7;
  const H = floors * fh + (resid ? 0.5 : 1.0);
  B.setColor(col).setStyle(style, seed, fh, style === ST.CURTAIN ? 1.5 : (style === ST.RIBBON ? 1.6 : 3.1 + r() * 0.6));
  const roofCol = ROOF_FLAT[Math.floor(r() * ROOF_FLAT.length)];
  B.box(x, z, y0 - 1.5, y0 + H, hw, hd, rot, { roofStyle: ST.ROOF, roofColor: roofCol, vBase: y0 });
  let top = y0 + H;
  if (floors > 5 && r() < 0.25) {
    // recessed top floor
    B.box(x, z, top, top + fh, hw * 0.75, hd * 0.75, rot, { roofStyle: ST.ROOF, roofColor: roofCol, vBase: top });
    top += fh;
  }
  B.setColor(roofCol);
  roofPlant(B, r, x, z, top, hw, hd, rot, 0.7);
  return top;
}

/** Low commercial / retail / light industrial building (1-3 floors). */
export function lowCommercial(B, r, o) {
  const { x, z, y0, hw, hd, rot = 0, seed = r() * 1000 } = o;
  const ind = !!o.industrial;
  const floors = ind ? 1 : 1 + Math.floor(r() * 2.4);
  const fh = ind ? 7 + r() * 4 : 3.9;
  const H = floors * fh;
  const col = ind ? (r() < 0.5 ? lin('#c3c4c0') : mixc(lin('#a9b0b5'), lin('#cfc7b6'), r())) : (r() < 0.6 ? STUCCO[Math.floor(r() * STUCCO.length)] : CONCRETE[Math.floor(r() * CONCRETE.length)]);
  B.setColor(col).setStyle(ind ? ST.INDUSTRIAL : (r() < 0.5 ? ST.RIBBON : ST.PUNCHED), seed, fh, ind ? 6 : 3.4);
  const roofCol = ind ? (r() < 0.5 ? lin('#d9dad6') : lin('#9a9b98')) : ROOF_FLAT[Math.floor(r() * ROOF_FLAT.length)];
  B.box(x, z, y0 - 1.0, y0 + H, hw, hd, rot, { roofStyle: ST.ROOF, roofColor: roofCol, vBase: y0 });
  B.setColor(roofCol);
  roofPlant(B, r, x, z, y0 + H, hw, hd, rot, ind ? 0.5 : 0.8);
  if (ind && r() < 0.35) {
    // skylight strips
    B.setColor(lin('#6d7a83')).setStyle(ST.CURTAIN, seed, 2, 2);
    const n = Math.max(1, Math.floor(hw / 12));
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      const lx = -hw + (i + 0.5) * (2 * hw / n);
      B.box(x + lx * c, z - lx * s, y0 + H, y0 + H + 0.6, 1.2, hd * 0.8, rot, { roofStyle: ST.CURTAIN });
    }
  }
  return y0 + H;
}

export { DARK };
