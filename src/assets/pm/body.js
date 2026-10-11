// Low-poly body geometry for the eight CS 1.6 skins (bind pose, model space, Z up, facing +X).
import { SkinBuilder, frameFor } from './geom.js';
import { BONE_INDEX } from './rig.js';
import { REG, ZR, TEX, vOf } from './layout.js';

const mirrorY = (rings) => rings.map((r) => ({
  ...r,
  c: [r.c[0], -r.c[1], r.c[2]],
  ryL: r.ryR ?? r.ry ?? r.r, ryR: r.ryL ?? r.ry ?? r.r,
  bone: typeof r.bone === 'string' ? r.bone.replace(/_r$/, '_l') : r.bone.map(([n, w]) => [n.replace(/_r$/, '_l'), w]),
}));

const withV = (range, rings, axis = 2) => rings.map((r) => ({ ...r, v: vOf(range, r.c[axis]) }));

// ---------------------------------------------------------------- parts
function torso(sb, o) {
  const bulk = o.bulk || 0; // vests / heavy jackets
  const hem = o.hem || 0; // jacket flare at the hips
  const rings = [
    { c: [0.6, 0, 34.6], apex: true, bone: 'pelvis' },
    { c: [0, 0, 39.6], rxF: 5.3 + hem, rxB: 5.8 + hem, ry: 7.6 + hem, p: 2.6, bone: 'pelvis' },
    { c: [0.1, 0, 44.2], rxF: 5.2 + bulk * 0.7, rxB: 4.9 + bulk * 0.45, ry: 6.9 + bulk * 0.4, p: 2.7, bone: [['pelvis', 0.3], ['spine', 0.7]] },
    { c: [0.3, 0, 51.4], rxF: 6.1 + bulk, rxB: 5.3 + bulk * 0.6, ry: 7.7 + bulk * 0.4, p: 2.9, bone: [['spine', 0.25], ['chest', 0.75]] },
    { c: [0.2, 0, 56.3], rxF: 5.8 + bulk * 0.8, rxB: 5.3 + bulk * 0.5, ry: 8.3 + bulk * 0.25, p: 3.0, bone: 'chest' },
    { c: [0, 0, 59.2], rxF: 4.2, rxB: 4.4, ry: 7.0, p: 2.6, bone: 'chest' },
    { c: [0.2, 0, 60.7], rxF: 2.9, rxB: 3.0, ry: 3.4, bone: [['chest', 0.5], ['neck', 0.5]] },
    { c: [0.5, 0, 63.0], r: 2.45, bone: 'neck' },
  ];
  return sb.loft(withV(ZR.torso, rings), { sides: 10, region: REG.torso });
}

function head(sb, o) {
  const rings = [
    { c: [0.6, 0, 61.4], rxF: 2.6, rxB: 2.3, ry: 2.5, bone: 'head' },
    { c: [1.0, 0, 62.8], rxF: 3.2, rxB: 2.4, ry: 2.8, p: 2.2, bone: 'head' },
    { c: [0.8, 0, 64.3], rxF: 3.85, rxB: 3.2, ry: 3.3, p: 2.3, bone: 'head' },
    { c: [0.5, 0, 66.1], rxF: 3.95, rxB: 3.9, ry: 3.55, p: 2.3, bone: 'head' },
    { c: [0.4, 0, 67.9], rxF: 3.85, rxB: 4.3, ry: 3.6, p: 2.3, bone: 'head' },
    { c: [0.2, 0, 70.0], rxF: 3.45, rxB: 4.0, ry: 3.35, p: 2.2, bone: 'head' },
    { c: [0.0, 0, 71.6], rxF: 2.0, rxB: 2.5, ry: 2.0, bone: 'head' },
    { c: [-0.2, 0, 72.2], apex: true, bone: 'head' },
  ];
  let n = sb.loft(withV(ZR.head, rings), { sides: 10, region: REG.head });
  // nose wedge
  const uvH = (u, z) => sb.uvOf(REG.head, u, vOf(ZR.head, z));
  const S = (q) => q;
  const nose = [
    { p: S([5.3, 0, 65.4]), uv: uvH(0.5, 65.6), bone: 'head' }, // tip
    { p: S([4.25, 0, 67.3]), uv: uvH(0.5, 67.3), bone: 'head' }, // bridge
    { p: S([4.4, 0.8, 65.1]), uv: uvH(0.535, 65.2), bone: 'head' },
    { p: S([4.4, -0.8, 65.1]), uv: uvH(0.465, 65.2), bone: 'head' },
    { p: S([4.6, 0, 64.9]), uv: uvH(0.5, 64.95), bone: 'head' },
  ];
  n += sb.addPart(nose, [[1, 3, 0], [1, 0, 2], [3, 4, 0], [4, 2, 0]], false);
  return n;
}

function arm(sb, side) {
  const rings = [
    { c: [0, -8, 34.0], apex: true, bone: 'forearm_r' },
    { c: [0, -8, 34.8], rxF: 1.7, rxB: 1.7, ry: 1.8, bone: 'forearm_r' },
    { c: [0.2, -8, 42.2], rxF: 2.5, rxB: 2.4, ry: 2.5, bone: 'forearm_r' },
    { c: [0, -8, 45.0], rxF: 2.3, rxB: 2.6, ry: 2.4, bone: [['forearm_r', 0.5], ['upperarm_r', 0.5]] },
    { c: [0, -8.3, 54.0], rxF: 3.0, rxB: 3.1, ry: 3.0, bone: 'upperarm_r' },
    { c: [0, -8.2, 57.6], rxF: 3.2, rxB: 3.2, ry: 3.3, bone: 'upperarm_r' },
    { c: [0, -7.6, 59.8], rxF: 2.1, rxB: 2.2, ry: 2.3, bone: 'upperarm_r' },
    { c: [0, -7.0, 60.6], apex: true, bone: 'upperarm_r' },
  ];
  const r = side === 'l' ? mirrorY(rings) : rings;
  return sb.loft(withV(ZR.arm, r), { sides: 6, region: side === 'l' ? REG.armL : REG.armR });
}

function hand(sb, side) {
  // fist / mitten; palm faces +Y for the right hand (medial), thumb toward +X
  const rings = [
    { c: [0.3, -7.3, 28.0], apex: true, bone: 'hand_r' },
    { c: [0.35, -7.55, 29.2], rxF: 1.75, rxB: 1.7, ryL: 1.35, ryR: 1.2, p: 3, bone: 'hand_r' },
    { c: [0.2, -7.85, 31.3], rxF: 1.9, rxB: 1.75, ryL: 1.2, ryR: 1.15, p: 3, bone: 'hand_r' },
    { c: [0, -8, 33.4], rxF: 1.6, rxB: 1.55, ry: 1.3, bone: 'hand_r' },
    { c: [0, -8, 35.4], rxF: 1.55, rxB: 1.5, ry: 1.5, bone: 'hand_r' },
  ];
  const thumb = [
    { c: [1.2, -7.4, 33.2], r: 0.85, bone: 'hand_r', ...frameFor([0.55, 0.25, -0.8]) },
    { c: [2.0, -7.0, 31.2], r: 0.7, bone: 'hand_r', ...frameFor([0.55, 0.25, -0.8]) },
    { c: [2.3, -6.85, 30.2], apex: true, bone: 'hand_r' },
  ];
  const reg = side === 'l' ? REG.handL : REG.handR;
  let n = sb.loft(withV(ZR.hand, side === 'l' ? mirrorY(rings) : rings), { sides: 5, region: reg });
  const th = withV(ZR.hand, side === 'l' ? mirrorY(thumb).map((r) => (r.ey ? { ...r, ey: [r.ey[0], -r.ey[1], r.ey[2]], ex: [r.ex[0], -r.ex[1], r.ex[2]] } : r)) : thumb);
  n += sb.loft(th, { sides: 4, region: reg, uMap: (u) => 0.4 + u * 0.2 });
  return n;
}

function leg(sb, side, o) {
  const baggy = o.baggy || 0;
  const rings = [
    { c: [0.2, -4.3, 3.0], apex: true, bone: 'shin_r' },
    { c: [0.2, -4.3, 3.8], rxF: 2.5, rxB: 2.6, ry: 2.4, bone: 'shin_r' },
    { c: [0.4, -4.3, 8.6], rxF: 2.9, rxB: 3.0, ry: 2.85, bone: 'shin_r' },
    { c: [0.2, -4.3, 13.2], rxF: 3.0 + baggy * 0.5, rxB: 3.5 + baggy * 0.5, ry: 3.1 + baggy * 0.5, bone: 'shin_r' },
    { c: [0.3, -4.25, 20.0], rxF: 3.5 + baggy * 0.4, rxB: 3.2 + baggy * 0.4, ry: 3.4 + baggy * 0.4, bone: [['shin_r', 0.5], ['thigh_r', 0.5]] },
    { c: [0.2, -4.25, 31.0], rxF: 4.5 + baggy * 0.5, rxB: 4.5 + baggy * 0.5, ry: 4.5 + baggy * 0.5, bone: 'thigh_r' },
    { c: [0, -4.3, 36.0], rxF: 4.8, rxB: 5.1, ry: 4.8, bone: 'thigh_r' },
    { c: [0, -3.6, 41.2], apex: true, bone: 'thigh_r' },
  ];
  return sb.loft(withV(ZR.leg, side === 'l' ? mirrorY(rings) : rings), { sides: 7, region: side === 'l' ? REG.legL : REG.legR });
}

function foot(sb, side) {
  // loft heel -> toe; ex = up (top of the boot is u = 0.5), ey = +Y
  const F = { ex: [0, 0, 1], ey: [0, 1, 0] };
  const rings = [
    { c: [-3.9, -4.4, 2.6], apex: true, bone: 'foot_r', ...F },
    { c: [-3.1, -4.4, 3.0], rxF: 2.7, rxB: 3.0, ry: 2.25, p: 3.5, bone: 'foot_r', ...F },
    { c: [0.6, -4.4, 3.1], rxF: 3.2, rxB: 3.1, ry: 2.5, p: 3.5, bone: 'foot_r', ...F },
    { c: [7.6, -4.6, 1.5], rxF: 1.45, rxB: 1.5, ry: 2.45, p: 3.2, bone: 'foot_r', ...F },
    { c: [9.8, -4.6, 1.2], apex: true, bone: 'foot_r', ...F },
  ];
  const r = side === 'l' ? mirrorY(rings).map((x) => ({ ...x, ...F })) : rings;
  return sb.loft(withV(ZR.foot, r, 0), { sides: 6, region: side === 'l' ? REG.footL : REG.footR });
}

// ---------------------------------------------------------------- gear
function helmet(sb, o) {
  const tilt = frameFor([-0.26, 0, 1], [1, 0, 0.26]); // brim higher at the front
  const big = o.big || 0;
  const rings = [
    { c: [0.2, 0, 67.6], rxF: 4.75 + big, rxB: 5.05 + big, ry: 4.55 + big, p: 2.3, bone: 'head', ...tilt },
    { c: [0.15, 0, 69.3], rxF: 4.85 + big, rxB: 5.15 + big, ry: 4.65 + big, p: 2.3, bone: 'head' },
    { c: [0.0, 0, 71.9], rxF: 3.7 + big, rxB: 4.0 + big, ry: 3.6 + big, bone: 'head' },
    { c: [-0.2, 0, 73.4], apex: true, bone: 'head' },
  ];
  rings[0].v = 0; rings[1].v = vOf(ZR.helmet, 69.3); rings[2].v = vOf(ZR.helmet, 71.9); rings[3].v = 1;
  let n = sb.loft(rings, { sides: 9, region: REG.helmet });
  // underside of the brim (so the helmet edge has thickness from below)
  const lip = [
    { c: [0.2, 0, 67.6], rxF: 4.75 + big, rxB: 5.05 + big, ry: 4.55 + big, p: 2.3, bone: 'head', ...tilt, v: 0 },
    { c: [0.2, 0, 67.9], rxF: 4.0 + big, rxB: 4.4 + big, ry: 3.9 + big, p: 2.3, bone: 'head', ...tilt, v: 0.06 },
  ];
  n += sb.loft(lip, { sides: 9, region: REG.helmet, flip: true, smooth: false });
  return n;
}

function visor(sb) {
  // GIGN face shield: an arc in front of the face hinged on the helmet
  const rings = [
    { c: [0.4, 0, 62.2], rxF: 5.35, ry: 4.6, bone: 'head', v: 0 },
    { c: [0.3, 0, 65.9], rxF: 5.55, ry: 4.9, bone: 'head', v: 0.5 },
    { c: [0.1, 0, 69.6], rxF: 5.25, ry: 4.9, bone: 'head', v: 1 },
  ];
  const a = 78 * Math.PI / 180;
  return sb.loft(rings, { sides: 6, region: REG.visor, arc: [-a, a] });
}

function goggles(sb) {
  const rings = [
    { c: [0.4, 0, 66.3], rxF: 4.55, ry: 4.0, p: 2.6, bone: 'head', v: 0 },
    { c: [0.4, 0, 68.4], rxF: 4.45, ry: 4.05, p: 2.6, bone: 'head', v: 1 },
  ];
  const a = 62 * Math.PI / 180;
  return sb.loft(rings, { sides: 6, region: REG.visor, arc: [-a, a] });
}

function gasmask(sb) {
  // filter canister on the model's left cheek + voice emitter
  const axis = [0.55, 0.7, -0.45];
  const fr = frameFor(axis);
  const base = [3.6, 2.0, 64.2];
  const len = 2.2;
  const tip = base.map((x, i) => x + axis[i] / Math.hypot(...axis) * len);
  const can = [
    { c: base, r: 1.25, bone: 'head', v: 0, ...fr },
    { c: tip, r: 1.25, bone: 'head', v: 0.8, ...fr },
    { c: tip.map((x, i) => x + axis[i] * 0.05), apex: true, bone: 'head', v: 1, ...fr },
  ];
  let n = sb.loft(can, { sides: 6, region: REG.can });
  const fr2 = frameFor([1, 0, -0.15]);
  const em = [
    { c: [4.0, 0, 64.0], r: 1.05, bone: 'head', v: 0, ...fr2 },
    { c: [5.3, 0, 63.8], r: 0.95, bone: 'head', v: 0.8, ...fr2 },
    { c: [5.4, 0, 63.8], apex: true, bone: 'head', v: 1, ...fr2 },
  ];
  n += sb.loft(em, { sides: 6, region: REG.emit });
  return n;
}

function beret(sb) {
  const fr = frameFor([0.08, -0.22, 1]);
  const rings = [
    { c: [0.1, -0.2, 69.2], rxF: 4.0, rxB: 4.45, ry: 3.85, bone: 'head', ...fr },
    { c: [-0.2, -0.75, 70.6], rxF: 4.75, rxB: 5.0, ry: 4.7, bone: 'head', ...fr },
    { c: [-0.4, -1.05, 71.7], rxF: 3.7, rxB: 3.9, ry: 3.6, bone: 'head', ...fr },
    { c: [-0.5, -1.2, 72.3], apex: true, bone: 'head', ...fr },
  ];
  return sb.loft(withV(ZR.misc, rings), { sides: 9, region: REG.misc });
}

function headwrap(sb) {
  const tilt = frameFor([-0.2, 0, 1], [1, 0, 0.2]);
  const rings = [
    { c: [0.35, 0, 68.0], rxF: 4.15, rxB: 4.6, ry: 3.95, p: 2.3, bone: 'head', ...tilt },
    { c: [0.15, 0, 70.2], rxF: 3.95, rxB: 4.55, ry: 3.85, p: 2.3, bone: 'head' },
    { c: [-0.1, 0, 71.9], rxF: 2.6, rxB: 3.2, ry: 2.7, bone: 'head' },
    { c: [-0.3, 0, 72.6], apex: true, bone: 'head' },
  ];
  rings[0].v = 0; rings[1].v = 0.45; rings[2].v = 0.85; rings[3].v = 1;
  let n = sb.loft(rings, { sides: 10, region: REG.misc });
  // knot + tail hanging down the back of the head
  const fr = frameFor([-0.35, 0, -1]);
  const tail = [
    { c: [-4.2, 0, 68.6], rxF: 0.6, rxB: 0.6, ry: 1.6, bone: 'head', v: 1, ...fr },
    { c: [-5.0, 0, 64.6], rxF: 0.45, rxB: 0.45, ry: 1.3, bone: 'head', v: 0.4, ...fr },
    { c: [-5.4, 0, 62.4], apex: true, bone: 'head', v: 0, ...fr },
  ];
  n += sb.loft(tail, { sides: 5, region: REG.misc2 });
  return n;
}

function pouches(sb, o) {
  // chest rig pouches (front) + small radio / pack (back) for the CTs
  const P = [];
  const box = (cx, cy, cz, sx, sy, sz, bone, region) => {
    const k = 0.5 / Math.SQRT1_2; // corners of a 4-sided ring at 45 degrees
    const rings = [
      { c: [cx, cy, cz - sz / 2], rx: sx * k, ry: sy * k, bone, v: 0 },
      { c: [cx, cy, cz + sz / 2], rx: sx * k, ry: sy * k, bone, v: 1 },
      { c: [cx, cy, cz + sz / 2 + 0.01], apex: true, bone, v: 1 },
    ];
    return sb.loft(rings, { sides: 4, region, flat: true, phase: Math.PI / 4 });
  };
  let n = 0;
  const reg = REG.pouch;
  // (front pouches are painted on the vest; only the back pack / radio is geometry)
  if (o.pack) n += box(-6.0, 0, 51.5, 2.6, 7.0, 7.5, 'chest', reg);
  return n;
}

// ---------------------------------------------------------------- per skin
export const SKIN_BODY = {
  terror: { bulk: 0.4, hem: 0.5, baggy: 0.3 },
  leet: { bulk: 0.6, hem: 0.2, baggy: 0.4, wrap: true },
  arctic: { bulk: 0.9, hem: 0.6, baggy: 0.6 },
  guerilla: { bulk: 0.6, hem: 0.7, baggy: 0.4, beret: true },
  urban: { bulk: 1.0, baggy: 0.4, helmet: true, goggles: true, pouches: true, pack: true },
  gsg9: { bulk: 1.0, baggy: 0.3, helmet: true },
  sas: { bulk: 1.1, baggy: 0.4, gasmask: true, pouches: true, pack: true },
  gign: { bulk: 1.0, baggy: 0.3, helmet: true, helmetBig: 0.15, visor: true },
};

export function buildBodyGeometry(skin) {
  const o = SKIN_BODY[skin];
  const sb = new SkinBuilder(BONE_INDEX, TEX);
  let tris = 0;
  tris += torso(sb, o);
  tris += head(sb, o);
  tris += arm(sb, 'r') + arm(sb, 'l');
  tris += hand(sb, 'r') + hand(sb, 'l');
  tris += leg(sb, 'r', o) + leg(sb, 'l', o);
  tris += foot(sb, 'r') + foot(sb, 'l');
  if (o.helmet) tris += helmet(sb, { big: o.helmetBig || 0 });
  if (o.visor) { sb.translucent = true; tris += visor(sb); sb.translucent = false; }
  if (o.goggles) tris += goggles(sb);
  if (o.gasmask) tris += gasmask(sb);
  if (o.beret) tris += beret(sb);
  if (o.wrap) tris += headwrap(sb);
  if (o.pouches) tris += pouches(sb, o);
  // the head and everything worn on it: 5% larger, scaled about the jaw
  sb.scaleBone('head', [0.3, 0, 63.4], 1.05);
  const g = sb.build();
  g.userData.triangles = tris;
  return g;
}
