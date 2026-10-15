// Hotel interior props: bedroom & lobby furniture, lighting fixtures, kitchen,
// restrooms, laundry and survivor barricades. Wall-mounted props have their back
// on the wall plane at local z = 0 and (x,y,z) at floor level.
import {
  PI, TAU, HP, V3, R, C, subR, rgb, mix, mul, pick, range, PALETTE, defProp, box, cbox, panel, quad, quadUV, quadTo,
  solid, clipQuad, extrude, rod, vcyl, loft, ringPts, blob, pushR, wp, beam, lamp, cable, crossCards, triTo, canvasMat,
} from './kit.js';

const FABRIC = (o, r, def) => rgb(o.color !== undefined ? o.color : def !== undefined ? def : pick(r, PALETTE.fabric));

// ---------------------------------------------------------------- bedroom
/** Bed. opts: size 'single'|'queen'|'king', color (bedspread), messy */
export const bed = defProp('bed', (L, o, r) => {
  const hw = { single: 0.5, queen: 0.8, king: 1.0 }[o.size || 'queen'] || 0.8;
  const spread = FABRIC(o, r);
  const wood = o.wood || 'woodDark';
  box(L, -hw - 0.02, 0.08, -1.05, hw + 0.02, 0.34, 1.05, wood, { faces: { ny: false } });
  for (const [x, z] of [[-hw, -1.0], [hw, -1.0], [-hw, 1.0], [hw, 1.0]]) cbox(L, x, 0, z, 0.08, 0.08, 0.08, wood, { faces: { ny: false } });
  box(L, -hw, 0.34, -1.02, hw, 0.56, 1.0, 'p_quilt', { tint: [0.95, 0.94, 0.9], faces: { ny: false } });
  pushR(L, [0, 0, 0], o.messy ? range(r, -0.03, 0.03) : 0, o.messy ? range(r, -0.08, 0.08) : 0, 0);
  box(L, -hw - 0.05, 0.28, -0.5, hw + 0.05, 0.6, 1.07, 'p_fabric', { tint: spread, faces: { ny: false } });
  box(L, -hw - 0.04, 0.58, -0.62, hw + 0.04, 0.62, -0.42, 'p_fabric', { tint: mul(spread, 0.8), faces: { ny: false } });
  L.pop();
  const np = hw > 0.6 ? [-hw * 0.5, hw * 0.5] : [0];
  for (const x of np) blob(L, x, 0.62, -0.78, Math.min(0.32, hw * 0.45), 0.07, 0.18, 5, 'p_fabric', { rng: r, tint: [0.95, 0.95, 0.92], jitter: 0.06, rings: [[-1, 0], [-0.3, 1], [0.4, 0.92], [1, 0]] });
  box(L, -hw - 0.06, 0.08, -1.13, hw + 0.06, 1.15, -1.05, wood);
  box(L, -hw - 0.08, 1.15, -1.15, hw + 0.08, 1.2, -1.03, wood);
  panel(L, 'p_fabric', null, 0, 0.82, -1.048, hw * 2 - 0.2, 0.5, 'pz', { tint: mul(spread, 0.7) });
  solid(L, -hw, 0, -1.02, hw, 0.55, 1.02, 'cloth');
  solid(L, -hw - 0.06, 0, -1.13, hw + 0.06, 1.12, -1.07, 'wood');
  return { topY: wp(L, 0, 0.62, 0)[1] };
});

function cabinet(L, w, h, d, mat, front = 'drawers', cols = 1, rows = 1, tint) {
  box(L, -w / 2, 0.06, -d / 2, w / 2, h - 0.03, d / 2, mat, { tint, faces: { ny: false } });
  box(L, -w / 2 - 0.02, h - 0.03, -d / 2 - 0.02, w / 2 + 0.02, h, d / 2 + 0.02, mat, { tint });
  box(L, -w / 2 + 0.02, 0, -d / 2 + 0.02, w / 2 - 0.02, 0.06, d / 2 - 0.02, mat, { tint: mul(tint || [1, 1, 1], 0.6), faces: { ny: false } });
  const fw = (w - 0.04) / cols, fh = (h - 0.12) / rows;
  for (let c = 0; c < cols; c++) for (let k = 0; k < rows; k++) panel(L, 'p_decal', R(front), -w / 2 + 0.02 + fw * (c + 0.5), 0.07 + fh * (k + 0.5), d / 2 + 0.004, fw - 0.01, fh - 0.01, 'pz');
}
export const nightstand = defProp('nightstand', (L, o) => {
  cabinet(L, 0.5, 0.62, 0.42, o.wood || 'woodDark', 'drawers');
  solid(L, -0.24, 0, -0.2, 0.24, 0.6, 0.2, 'wood');
  return { topY: wp(L, 0, 0.62, 0)[1] };
});
export const dresser = defProp('dresser', (L, o) => {
  cabinet(L, 1.4, 0.86, 0.5, o.wood || 'woodDark', 'drawers', 3, 2);
  if (o.mirror) {
    box(L, -0.5, 0.86, -0.25, 0.5, 1.75, -0.2, o.wood || 'woodDark');
    panel(L, 'p_decal', R('mirror'), 0, 1.3, -0.196, 0.86, 0.8, 'pz');
  }
  solid(L, -0.69, 0, -0.24, 0.69, 0.84, 0.24, 'wood');
  return { topY: wp(L, 0, 0.86, 0)[1] };
});
/** Wardrobe. opts: open (doors swung open) */
export const wardrobe = defProp('wardrobe', (L, o, r) => {
  const w = 1.0, h = 2.0, d = 0.6, mat = o.wood || 'woodDark';
  if (!o.open) {
    cabinet(L, w, h, d, mat, 'doors2');
  } else {
    box(L, -w / 2, 0.06, -d / 2, w / 2, h - 0.03, d / 2, mat, { faces: { pz: false, ny: false } });
    box(L, -w / 2 - 0.02, h - 0.03, -d / 2 - 0.02, w / 2 + 0.02, h, d / 2 + 0.02, mat);
    panel(L, 'woodDark', null, 0, h / 2, -d / 2 + 0.03, w - 0.06, h - 0.1, 'pz', { tint: [0.35, 0.3, 0.28] });
    for (const s of [-1, 1]) { pushR(L, [s * w / 2, 0.06, d / 2], 0, s * 1.9, 0); box(L, s > 0 ? -0.5 : 0, 0, 0, s > 0 ? 0 : 0.5, h - 0.1, 0.03, mat); L.pop(); }
    rod(L, [-w / 2 + 0.05, 1.7, 0], [w / 2 - 0.05, 1.7, 0], 0.015, 4, 'p_chrome', { up: [0, 1, 0] });
    for (let i = 0; i < 2; i++) quadUV(L, [-0.4 + i * 0.4, 0.9, range(r, -0.1, 0.1)], [i * 0.4, 0.9, range(r, -0.1, 0.1)], [i * 0.4, 1.7, 0], [-0.4 + i * 0.4, 1.7, 0], 'p_cards', C('shirts'));
  }
  solid(L, -w / 2, 0, -d / 2, w / 2, h, d / 2 - 0.02, 'wood');
  return { topY: wp(L, 0, h, 0)[1] };
});

export const desk = defProp('desk', (L, o) => {
  const mat = o.wood || 'woodDark', w = 1.4, d = 0.7;
  box(L, -w / 2, 0.72, -d / 2, w / 2, 0.76, d / 2, mat);
  box(L, 0.28, 0, -d / 2 + 0.03, w / 2 - 0.03, 0.72, d / 2 - 0.03, mat, { faces: { ny: false, py: false } });
  panel(L, 'p_decal', R('drawers'), (0.28 + w / 2 - 0.03) / 2, 0.36, d / 2 - 0.026, 0.38, 0.66, 'pz');
  box(L, -w / 2 + 0.03, 0, -d / 2 + 0.03, -w / 2 + 0.06, 0.72, d / 2 - 0.03, mat, { faces: { ny: false, py: false } });
  box(L, -w / 2 + 0.06, 0.3, -d / 2 + 0.03, 0.28, 0.72, -d / 2 + 0.05, mat, { faces: { ny: false, py: false } });
  solid(L, -w / 2, 0, -d / 2, w / 2, 0.74, d / 2 - 0.06, 'wood');
  return { topY: wp(L, 0, 0.76, 0)[1] };
});

export const office_chair = defProp('office_chair', (L, o, r) => {
  const t = FABRIC(o, r, 0x2a2c30);
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; beam(L, [0, 0.1, 0], [Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3], 0.04, 0.03, 'p_rubber', { ends: false }); cbox(L, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, 0.05, 0.05, 0.05, 'p_rubber', { faces: { ny: false, py: false } }); }
  rod(L, [0, 0.1, 0], [0, 0.42, 0], 0.03, 5, 'p_chrome');
  box(L, -0.25, 0.42, -0.24, 0.25, 0.5, 0.24, 'p_fabric', { tint: t });
  pushR(L, [0, 0.5, -0.24], -0.12, 0, 0);
  box(L, -0.23, 0.08, -0.06, 0.23, 0.58, 0.0, 'p_fabric', { tint: t });
  box(L, -0.03, -0.05, -0.08, 0.03, 0.1, -0.04, 'p_rubber');
  L.pop();
  for (const s of [-1, 1]) box(L, s * 0.24, 0.5, -0.18, s * 0.3, 0.69, -0.12, 'p_rubber', { faces: { ny: false } });
  solid(L, -0.26, 0, -0.26, 0.26, 0.9, 0.26, 'cloth', { bullet: false });
  return { seatY: wp(L, 0, 0.5, 0)[1] };
});

/** Wooden side / dining chair. opts: color (seat), wood */
export const chair = defProp('chair', (L, o, r) => {
  const mat = o.wood || 'woodDark';
  const t = FABRIC(o, r);
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) box(L, x - 0.02, 0, z - 0.02, x + 0.02, 0.44, z + 0.02, mat, { faces: { ny: false, py: false } });
  box(L, -0.22, 0.44, -0.21, 0.22, 0.49, 0.21, 'p_fabric', { tint: t, faces: { ny: false } });
  box(L, -0.21, 0.49, -0.21, 0.21, 0.95, -0.18, mat);
  panel(L, 'p_fabric', null, 0, 0.7, -0.178, 0.3, 0.3, 'pz', { tint: mul(t, 0.9) });
  solid(L, -0.22, 0, -0.21, 0.22, 0.95, 0.21, 'wood', { bullet: false });
  return { seatY: wp(L, 0, 0.49, 0)[1] };
});

function upholstered(L, o, r, w) {
  const t = FABRIC(o, r);
  const mat = o.leather ? 'p_leather' : 'p_fabric';
  for (const [x, z] of [[-w / 2 + 0.06, -0.36], [w / 2 - 0.06, -0.36], [-w / 2 + 0.06, 0.36], [w / 2 - 0.06, 0.36]]) cbox(L, x, 0, z, 0.06, 0.1, 0.06, 'woodDark', { faces: { ny: false } });
  box(L, -w / 2, 0.1, -0.42, w / 2, 0.38, 0.42, mat, { tint: t, faces: { ny: false } });
  box(L, -w / 2, 0.38, -0.45, w / 2, 0.92, -0.25, mat, { tint: mul(t, 0.92) });
  for (const s of [-1, 1]) box(L, s * (w / 2 - 0.16), 0.38, -0.25, s * w / 2, 0.64, 0.44, mat, { tint: mul(t, 0.95) });
  const n = Math.max(1, Math.round((w - 0.32) / 0.6));
  const cw = (w - 0.32) / n;
  for (let i = 0; i < n; i++) box(L, -w / 2 + 0.16 + i * cw + 0.01, 0.38, -0.25, -w / 2 + 0.16 + (i + 1) * cw - 0.01, 0.5, 0.42, mat, { tint: mul(t, 1.05), faces: { ny: false } });
  solid(L, -w / 2, 0, -0.45, w / 2, 0.5, 0.44, 'cloth');
  solid(L, -w / 2, 0.5, -0.45, w / 2, 0.9, -0.27, 'cloth');
  return { seatY: wp(L, 0, 0.5, 0)[1] };
}
export const armchair = defProp('armchair', (L, o, r) => upholstered(L, o, r, 0.9));
export const sofa = defProp('sofa', (L, o, r) => upholstered(L, o, r, o.length || 2.0));

export const coffee_table = defProp('coffee_table', (L, o) => {
  const mat = o.wood || 'woodDark';
  box(L, -0.6, 0.4, -0.3, 0.6, 0.44, 0.3, mat);
  for (const [x, z] of [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]]) box(L, x - 0.03, 0, z - 0.03, x + 0.03, 0.4, z + 0.03, mat, { faces: { ny: false, py: false } });
  box(L, -0.52, 0.1, -0.22, 0.52, 0.12, 0.22, mat, { faces: { ny: false } });
  solid(L, -0.6, 0, -0.3, 0.6, 0.44, 0.3, 'wood');
  return { topY: wp(L, 0, 0.44, 0)[1] };
});

/** Round table. opts: radius (0.5), cloth (tablecloth), wood */
export const table_round = defProp('table_round', (L, o) => {
  const rr = o.radius || 0.5, mat = o.wood || 'woodDark';
  if (o.cloth) {
    rod(L, [0, 0.76, 0], [0, 0.78, 0], rr + 0.02, 8, 'p_fabric', { capB: 'p_fabric', tint: [0.95, 0.95, 0.92], phase: PI / 8 });
    rod(L, [0, 0.42, 0], [0, 0.76, 0], rr + 0.12, 8, 'p_fabric', { r2: rr + 0.02, tint: [0.92, 0.92, 0.88], phase: PI / 8 });
  } else rod(L, [0, 0.73, 0], [0, 0.77, 0], rr, 8, mat, { capB: mat, phase: PI / 8 });
  rod(L, [0, 0, 0], [0, 0.73, 0], 0.05, 5, mat);
  for (const a of [0, HP]) { pushR(L, [0, 0, 0], 0, a, 0); box(L, -0.3, 0, -0.04, 0.3, 0.05, 0.04, mat, { faces: { ny: false } }); L.pop(); }
  const k = rr * 0.7;
  solid(L, -k, 0, -k, k, 0.77, k, 'wood');
  return { topY: wp(L, 0, o.cloth ? 0.78 : 0.77, 0)[1] };
});

/** Conference table. opts: length (3.6), width (1.2) */
export const table_long = defProp('table_long', (L, o) => {
  const l = o.length || 3.6, w = o.width || 1.2, mat = o.wood || 'woodDark';
  box(L, -l / 2, 0.72, -w / 2, l / 2, 0.76, w / 2, mat);
  for (const s of [-1, 1]) box(L, s * (l / 2 - 0.45) - 0.04, 0, -w / 2 + 0.15, s * (l / 2 - 0.45) + 0.04, 0.72, w / 2 - 0.15, mat, { faces: { ny: false, py: false } });
  box(L, -l / 2 + 0.45, 0.4, -0.03, l / 2 - 0.45, 0.48, 0.03, mat, { faces: { ny: false } });
  solid(L, -l / 2, 0, -w / 2, l / 2, 0.76, w / 2, 'wood');
  return { topY: wp(L, 0, 0.76, 0)[1] };
});

// ---------------------------------------------------------------- lighting
export const lamp_floor = defProp('lamp_floor', (L, o) => {
  vcyl(L, 0, 0, 0, 0.16, 0.03, 6, 'p_brass');
  rod(L, [0, 0.03, 0], [0, 1.45, 0], 0.015, 4, 'p_brass');
  const on = o.light !== false;
  rod(L, [0, 1.3, 0], [0, 1.6, 0], 0.24, 8, 'p_fabric', { r2: 0.15, tint: [1.0, 0.92, 0.75], uvs: 'cyl' });
  rod(L, [0, 1.6, 0], [0, 1.3, 0], 0.15, 8, on ? 'p_emWarm' : 'p_fabric', { r2: 0.235, inward: true, tint: on ? null : [0.6, 0.55, 0.45] });
  lamp(L, o, [0, 1.45, 0], 0xffd8a0, 5, 0.9, { shadows: false });
  return {};
});
export const lamp_table = defProp('lamp_table', (L, o) => {
  rod(L, [0, 0, 0], [0, 0.12, 0], 0.08, 6, 'p_brass', { r2: 0.11 });
  rod(L, [0, 0.12, 0], [0, 0.3, 0], 0.11, 6, 'p_brass', { r2: 0.04 });
  rod(L, [0, 0.3, 0], [0, 0.38, 0], 0.012, 4, 'p_brass');
  const on = o.light !== false;
  rod(L, [0, 0.36, 0], [0, 0.56, 0], 0.18, 8, 'p_fabric', { r2: 0.12, tint: [1.0, 0.92, 0.75], uvs: 'cyl' });
  rod(L, [0, 0.56, 0], [0, 0.36, 0], 0.12, 8, on ? 'p_emWarm' : 'p_fabric', { r2: 0.175, inward: true, tint: on ? null : [0.6, 0.55, 0.45] });
  lamp(L, o, [0, 0.45, 0], 0xffd8a0, 3.5, 0.8, { shadows: false });
  return {};
});

/** CRT television. opts: on (static screen), stand (adds a cart) */
export const tv = defProp('tv', (L, o) => {
  let y = 0;
  if (o.stand) { box(L, -0.35, 0.05, -0.25, 0.35, 0.65, 0.25, 'woodDark', { faces: { ny: false } }); for (const [x, z] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]) cbox(L, x, 0, z, 0.05, 0.05, 0.05, 'p_rubber'); y = 0.65; solid(L, -0.35, 0, -0.25, 0.35, 0.65, 0.25, 'wood'); }
  const t = [0.22, 0.22, 0.23];
  box(L, -0.3, y, -0.02, 0.3, y + 0.46, 0.2, 'p_plastic', { tint: t, faces: { ny: false } });
  loft(L, [[-0.3, y, -0.02], [0.3, y, -0.02], [0.3, y + 0.46, -0.02], [-0.3, y + 0.46, -0.02]], [[-0.18, y + 0.04, -0.3], [0.18, y + 0.04, -0.3], [0.18, y + 0.36, -0.3], [-0.18, y + 0.36, -0.3]], 'p_plastic', { tint: t, capB: 'p_plastic' });
  panel(L, o.on ? 'p_decalLit' : 'p_decal', R(o.on ? 'tvStatic' : 'tvOff'), -0.04, y + 0.24, 0.203, 0.44, 0.34, 'pz');
  panel(L, 'p_decal', R('knobs'), 0.24, y + 0.3, 0.203, 0.08, 0.2, 'pz');
  for (const s of [-1, 1]) beam(L, [s * 0.04, y + 0.46, -0.1], [s * 0.3, y + 0.85, -0.15], 0.01, 0.01, 'p_chrome', { ends: false });
  return { topY: wp(L, 0, y + 0.46, 0)[1] };
});

// ---------------------------------------------------------------- lobby & service
export const luggage_cart = defProp('luggage_cart', (L, o, r) => {
  box(L, -0.55, 0.16, -0.32, 0.55, 0.24, 0.32, 'p_brass');
  box(L, -0.53, 0.24, -0.3, 0.53, 0.25, 0.3, 'carpetRed', { faces: { ny: false } });
  for (const [x, z] of [[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]]) rod(L, [x, 0.08, z - 0.03], [x, 0.08, z + 0.03], 0.08, 4, 'p_rubber', { up: [0, 1, 0] });
  const pts = [];
  for (let i = 0; i <= 6; i++) { const a = i / 6 * PI; pts.push([Math.cos(a) * 0.55, 1.5 + Math.sin(a) * 0.3, 0]); }
  for (const s of [-1, 1]) rod(L, [s * 0.55, 0.24, 0], [s * 0.55, 1.5, 0], 0.025, 4, 'p_brass');
  for (let i = 0; i < pts.length - 1; i++) rod(L, pts[i], pts[i + 1], 0.025, 4, 'p_brass');
  rod(L, [-0.55, 1.4, 0], [0.55, 1.4, 0], 0.018, 4, 'p_brass', { up: [0, 1, 0] });
  if (o.luggage !== false) {
    for (let i = 0; i < 3; i++) {
      const c = pick(r, [0x3a2a1e, 0x1e2a3a, 0x5a1e1e, 0x2a2a2a, 0x6a5a3a]);
      const x = -0.3 + i * 0.3, h = range(r, 0.4, 0.6);
      box(L, x - 0.12, 0.25, -0.25, x + 0.12, 0.25 + h, 0.2, 'p_leather', { tint: rgb(c), faces: { ny: false } });
    }
  }
  solid(L, -0.56, 0, -0.32, 0.56, 1.5, 0.32, 'metal', { bullet: false });
  return { topY: wp(L, 0, 0.25, 0)[1] };
});

export const room_service_cart = defProp('room_service_cart', (L, o) => {
  for (const [x, z] of [[-0.42, -0.27], [0.42, -0.27], [-0.42, 0.27], [0.42, 0.27]]) { box(L, x - 0.02, 0.06, z - 0.02, x + 0.02, 0.5, z + 0.02, 'p_chrome', { faces: { ny: false, py: false } }); cbox(L, x, 0, z, 0.05, 0.06, 0.05, 'p_rubber', { faces: { ny: false, py: false } }); }
  box(L, -0.45, 0.15, -0.3, 0.45, 0.17, 0.3, 'p_chrome');
  box(L, -0.5, 0.5, -0.35, 0.5, 0.78, 0.35, 'p_fabric', { tint: [0.95, 0.95, 0.92], faces: { ny: false } });
  for (const [x, z] of [[-0.22, 0], [0.22, 0.05]]) {
    rod(L, [x, 0.78, z], [x, 0.795, z], 0.17, 6, 'p_porcelain', { capB: 'p_porcelain' });
    rod(L, [x, 0.795, z], [x, 0.98, z], 0.14, 6, 'p_chrome', { r2: 0.03, capB: 'p_chrome' });
  }
  solid(L, -0.5, 0, -0.35, 0.5, 0.78, 0.35, 'metal');
  return { topY: wp(L, 0, 0.78, 0)[1] };
});

export const ice_machine = defProp('ice_machine', (L, o) => {
  box(L, -0.4, 0, -0.38, 0.4, 1.75, 0.38, 'steel', { faces: { ny: false } });
  box(L, -0.42, 0, 0.38, 0.42, 0.12, 0.4, 'metalDark');
  panel(L, 'steel', null, 0, 0.75, 0.385, 0.66, 0.5, 'pz', { tint: [0.85, 0.85, 0.88] });
  box(L, -0.25, 1.0, 0.38, 0.25, 1.04, 0.43, 'p_chrome');
  panel(L, 'p_decal', R('ice'), 0, 1.5, 0.384, 0.5, 0.14, 'pz');
  panel(L, 'p_decal', R('vent'), 0, 0.25, 0.384, 0.6, 0.18, 'pz');
  solid(L, -0.4, 0, -0.38, 0.4, 1.75, 0.38, 'metal');
  return { topY: wp(L, 0, 1.75, 0)[1] };
});

/** Vending machine. opts: kind 'soda'|'snack', lit (default true), color */
export const vending_machine = defProp('vending_machine', (L, o) => {
  const snack = o.kind === 'snack';
  const t = rgb(o.color !== undefined ? o.color : snack ? 0x2a2c30 : 0xa81818);
  box(L, -0.47, 0, -0.42, 0.47, 1.85, 0.42, 'p_paint', { tint: t, faces: { ny: false } });
  panel(L, o.lit === false ? 'p_decal' : 'p_decalLit', R(snack ? 'snack' : 'soda'), 0, 0.98, 0.424, 0.86, 1.72, 'pz');
  if (snack) panel(L, 'p_glass', [0, 0, 1, 1], -0.1, 1.15, 0.43, 0.6, 1.2, 'pz');
  box(L, -0.47, 1.85, -0.42, 0.47, 1.9, 0.44, 'p_paint', { tint: mul(t, 0.7) });
  if (o.light) lamp(L, o, [0, 1.2, 0.8], snack ? 0xc8d8ff : 0xffa0a0, 3, 0.5, { shadows: false });
  solid(L, -0.47, 0, -0.42, 0.47, 1.9, 0.42, 'metal');
  return { topY: wp(L, 0, 1.9, 0)[1] };
});

/** Wall-mounted fire extinguisher (opts.floor: standing on the floor). */
export const fire_extinguisher = defProp('fire_extinguisher', (L, o) => {
  const y = o.floor ? 0 : (o.height || 0.95);
  const z = o.floor ? 0 : 0.1;
  if (!o.floor) { box(L, -0.05, y + 0.1, 0, 0.05, y + 0.45, 0.02, 'metalDark'); box(L, -0.07, y + 0.15, 0.02, 0.07, y + 0.18, 0.1, 'metalDark'); }
  rod(L, [0, y, z], [0, y + 0.48, z], 0.075, 6, 'p_paint', { tint: [0.75, 0.08, 0.06], capA: 'p_paint', capB: 'p_paint', uvs: 'cyl' });
  rod(L, [0, y + 0.48, z], [0, y + 0.56, z], 0.03, 4, 'metalDark');
  box(L, -0.02, y + 0.55, z - 0.02, 0.08, y + 0.58, z + 0.02, 'metalDark');
  cable(L, [[0.03, y + 0.52, z + 0.03], [0.09, y + 0.4, z + 0.07], [0.08, y + 0.2, z + 0.08]], 0.025);
  panel(L, 'p_decal', R('fireBox'), 0, y + 0.27, z + 0.076, 0.08, 0.08, 'pz');
  return {};
});
/** Fire alarm pull station + strobe (small red wall box). opts: height (box centre, 1.3) */
export const fire_alarm_strobe = defProp('fire_alarm_strobe', (L, o) => {
  const y = o.height || 1.3;
  box(L, -0.07, y - 0.09, 0, 0.07, y + 0.09, 0.05, 'p_paint', { tint: [0.72, 0.08, 0.06] });
  panel(L, 'p_decal', R('fireBox'), 0, y, 0.052, 0.13, 0.16, 'pz');
  box(L, -0.05, y + 0.12, 0, 0.05, y + 0.2, 0.04, 'p_paint', { tint: [0.72, 0.08, 0.06] });
  box(L, -0.035, y + 0.135, 0.04, 0.035, y + 0.185, 0.07, o.on ? 'p_emWhite' : 'p_flat', { tint: o.on ? null : [0.9, 0.9, 0.85] });
  return { strobe: wp(L, 0, y + 0.16, 0.08) };
});
/** Wall sconce with built-in light. opts: height (1.8), light, flicker */
export const wall_sconce = defProp('wall_sconce', (L, o) => {
  const y = o.height || 1.8;
  box(L, -0.06, y - 0.12, 0, 0.06, y + 0.06, 0.02, 'p_brass');
  beam(L, [0, y - 0.05, 0.02], [0, y + 0.02, 0.12], 0.02, 0.02, 'p_brass', { ends: false });
  const on = o.light !== false;
  rod(L, [0, y, 0.12], [0, y + 0.16, 0.12], 0.1, 6, 'p_fabric', { r2: 0.07, tint: [1, 0.9, 0.7] });
  rod(L, [0, y + 0.16, 0.12], [0, y, 0.12], 0.07, 6, on ? 'p_emWarm' : 'p_fabric', { r2: 0.095, inward: true, tint: on ? null : [0.6, 0.5, 0.4] });
  lamp(L, o, [0, y + 0.1, 0.25], 0xffcf90, 4.5, 0.85);
  return { lamp: wp(L, 0, y + 0.1, 0.2) };
});
/** Fluorescent ceiling troffer. y = ceiling height. opts: size 'large'|'small', light, flicker, broken */
export const ceiling_light = defProp('ceiling_light', (L, o) => {
  const w = o.size === 'small' ? 0.6 : 1.2, d = 0.6;
  const on = o.light !== false && !o.broken;
  box(L, -w / 2 - 0.03, -0.05, -d / 2 - 0.03, w / 2 + 0.03, 0, d / 2 + 0.03, 'p_paint', { tint: [0.9, 0.9, 0.88], faces: { py: false } });
  panel(L, on ? 'p_emCool' : 'p_flat', null, 0, -0.052, 0, w, d, 'ny', { tint: on ? null : [0.55, 0.56, 0.58] });
  for (const x of [-w / 4, w / 4]) panel(L, 'p_flat', null, x, -0.054, 0, 0.02, d, 'ny', { tint: [0.6, 0.6, 0.6] });
  if (o.broken) { pushR(L, [w / 2, -0.05, 0], 0, 0, 0.6); box(L, -w, -0.01, -d / 2, 0, 0, d / 2, 'p_flat', { tint: [0.5, 0.5, 0.52] }); L.pop(); }
  if (o.light !== false) lamp(L, o, [0, -0.35, 0], 0xe8f0ff, o.broken ? 4 : 7, o.broken ? 0.4 : 1.0, { flicker: o.flicker || (o.broken ? 1 : 0) });
  return { lamp: wp(L, 0, -0.3, 0) };
});
/** Lobby chandelier hanging from the ceiling at y. opts: drop (chain length), light */
export const chandelier = defProp('chandelier', (L, o, r) => {
  const drop = o.drop || 0.6, cy = -drop - 0.6;
  rod(L, [0, -drop, 0], [0, 0, 0], 0.012, 4, 'p_brass');
  box(L, -0.12, -0.04, -0.12, 0.12, 0, 0.12, 'p_brass');
  loft(L, ringPts(V3(0, cy - 0.25, 0), V3(1, 0, 0), V3(0, 0, 1), 0.04, 6), ringPts(V3(0, cy, 0), V3(1, 0, 0), V3(0, 0, 1), 0.16, 6), 'p_brass', { capA: 'p_brass' });
  loft(L, ringPts(V3(0, cy, 0), V3(1, 0, 0), V3(0, 0, 1), 0.16, 6), ringPts(V3(0, -drop, 0), V3(1, 0, 0), V3(0, 0, 1), 0.04, 6), 'p_brass');
  const on = o.light !== false;
  const flame = (p) => { for (let k = 0; k < 2; k++) { const a = k * HP; const dx = Math.cos(a) * 0.035, dz = Math.sin(a) * 0.035; quad(L, [p.x - dx, p.y, p.z - dz], [p.x + dx, p.y, p.z + dz], [p.x + dx, p.y + 0.1, p.z + dz], [p.x - dx, p.y + 0.1, p.z - dz], on ? 'p_emWarmDS' : 'p_porcelain'); } };
  const ring = ringPts(V3(0, cy + 0.02, 0), V3(1, 0, 0), V3(0, 0, 1), 0.62, 8);
  for (let i = 0; i < 8; i++) beam(L, ring[i], ring[(i + 1) % 8], 0.03, 0.03, 'p_brass', { ends: false, faces: { ny: false } });
  for (let i = 0; i < 8; i += 2) beam(L, [0, cy + 0.12, 0], ring[i], 0.025, 0.025, 'p_brass', { ends: false });
  for (const p of ring) { box(L, p.x - 0.025, p.y, p.z - 0.025, p.x + 0.025, p.y + 0.04, p.z + 0.025, 'p_brass', { faces: { ny: false, py: false } }); flame(V3(p.x, p.y + 0.04, p.z)); }
  for (const p of ringPts(V3(0, cy + 0.3, 0), V3(1, 0, 0), V3(0, 0, 1), 0.2, 4, PI / 4)) flame(p);
  const cr = ringPts(V3(0, cy - 0.02, 0), V3(1, 0, 0), V3(0, 0, 1), 0.55, 8, 0.2);
  for (const p of cr) crossCards(L, p.x, p.y - 0.2, p.z, 0.08, 0.2, C('crystal'), { count: 1, angle: range(r, 0, PI) });
  lamp(L, o, [0, cy - 0.1, 0], 0xffd8a0, 9, 1.2, { shadows: false });
  return { lamp: wp(L, 0, cy, 0) };
});

/** Hotel front desk (straight). opts: width (4), topY anchor = transaction counter */
export const reception_desk = defProp('reception_desk', (L, o) => {
  const w = o.width || 4.0, hw = w / 2;
  box(L, -hw, 0, 0.25, hw, 1.06, 0.35, 'wainscot', { faces: { ny: false } });
  box(L, -hw - 0.04, 1.06, 0.12, hw + 0.04, 1.12, 0.5, 'marble');
  box(L, -hw, 0, 0.35, hw, 0.1, 0.39, 'woodDark', { faces: { ny: false } });
  box(L, -hw, 0.72, -0.45, hw, 0.76, 0.25, 'woodDark');
  for (const s of [-1, 1]) box(L, s * hw - 0.04, 0, -0.45, s * hw + 0.04, 1.06, 0.25, 'woodDark', { faces: { ny: false } });
  box(L, -hw + 0.04, 0, -0.42, hw - 0.04, 0.72, -0.38, 'woodDark', { faces: { ny: false, py: false } });
  // monitor, bell, register book
  box(L, 0.6, 0.76, -0.2, 0.98, 1.06, -0.12, 'p_plastic', { tint: [0.8, 0.78, 0.7] });
  panel(L, 'p_decalLit', R('screen'), 0.79, 0.93, -0.118, 0.32, 0.24, 'pz');
  rod(L, [-0.6, 1.12, 0.3], [-0.6, 1.16, 0.3], 0.06, 6, 'p_brass', { r2: 0.02, capB: 'p_brass' });
  box(L, 0.1, 1.12, 0.2, 0.5, 1.14, 0.42, 'p_plastic', { tint: [0.9, 0.88, 0.8] });
  panel(L, 'p_decal', R('hotelPlate'), 0, 0.8, 0.352, 0.5, 0.25, 'pz');
  solid(L, -hw - 0.04, 0, 0.14, hw + 0.04, 1.1, 0.5, 'wood');
  solid(L, -hw, 0, -0.43, hw, 0.74, 0.14, 'wood');
  return { topY: wp(L, 0, 1.12, 0)[1], staff: wp(L, 0, 0, -0.9) };
});

/** Brushed steel elevator doors flush to a wall. opts: open (0..1), floor (indicator digit is fixed) */
export const elevator_doors = defProp('elevator_doors', (L, o) => {
  const f = Math.max(0, Math.min(1, o.open === true ? 1 : o.open || 0));
  const hw = 0.55, h = 2.12;
  for (const s of [-1, 1]) box(L, s * hw, 0, 0, s * (hw + 0.12), h + 0.1, 0.06, 'steel');
  box(L, -hw - 0.12, h, 0, hw + 0.12, h + 0.2, 0.06, 'steel');
  if (f > 0) {
    panel(L, 'black', null, 0, h / 2, -0.6, hw * 2, h, 'pz');
    quad(L, [-hw, 0, 0], [-hw, 0, -0.6], [-hw, h, -0.6], [-hw, h, 0], 'black');
    quad(L, [hw, 0, -0.6], [hw, 0, 0], [hw, h, 0], [hw, h, -0.6], 'black');
    quad(L, [-hw, 0.002, 0], [hw, 0.002, 0], [hw, 0.002, -0.12], [-hw, 0.002, -0.12], 'metalDiamond');
  }
  const z0 = f > 0 ? -0.05 : 0.0;
  for (const s of [-1, 1]) {
    const x0 = s * hw * f, x1 = s * (hw * f + hw);
    box(L, x0, 0, z0, x1, h, z0 + 0.03, 'steel', { faces: { ny: false } });
  }
  if (f === 0) panel(L, 'p_flat', null, 0, h / 2, 0.031, 0.01, h, 'pz', { tint: [0.1, 0.1, 0.1] });
  box(L, hw + 0.25, 1.0, 0, hw + 0.37, 1.24, 0.015, 'steel');
  panel(L, 'p_decal', R('callBtn'), hw + 0.31, 1.12, 0.016, 0.08, 0.16, 'pz');
  panel(L, 'p_decalLit', R('elevInd'), 0, h + 0.1, 0.062, 0.3, 0.12, 'pz');
  if (f < 0.5) solid(L, -hw, 0, 0, hw, h, 0.04, 'metal');
  return { center: wp(L, 0, 0, 0.6), button: wp(L, hw + 0.31, 1.12, 0.05), open: f };
});

/** Railing segment along X. opts: length (2), rise (sloped run along +X), height (1.0), color */
export const stairwell_railing = defProp('stairwell_railing', (L, o) => {
  const len = o.length || 2.0, rise = o.rise || 0, h = o.height || 1.0;
  const t = rgb(o.color !== undefined ? o.color : 0x2a3a2e);
  const n = Math.max(1, Math.round(len / 1.0));
  for (let i = 0; i <= n; i++) { const x = -len / 2 + i * len / n; const y = rise * i / n; box(L, x - 0.025, y, -0.025, x + 0.025, y + h, 0.025, 'p_paint', { tint: t }); }
  for (const yy of [h, h * 0.5]) beam(L, [-len / 2 - 0.03, yy, 0], [len / 2 + 0.03, yy + rise, 0], 0.05, yy === h ? 0.05 : 0.03, 'p_paint', { tint: t });
  for (let i = 0; i < n * 8; i++) { const x = -len / 2 + (i + 0.5) * len / (n * 8); const y = rise * (i + 0.5) / (n * 8); quad(L, [x - 0.008, y + 0.05, 0], [x + 0.008, y + 0.05, 0], [x + 0.008, y + h * 0.5, 0], [x - 0.008, y + h * 0.5, 0], 'p_wireBlack'); }
  clipQuad(L, [-len / 2, 0, 0], [len / 2, rise, 0], [len / 2, rise + h, 0], [-len / 2, h, 0], 'metal', { bullet: false });
  return {};
});

// ---------------------------------------------------------------- kitchen
export const kitchen_oven = defProp('kitchen_oven', (L, o) => {
  box(L, -0.45, 0.08, -0.4, 0.45, 0.88, 0.4, 'steel', { faces: { ny: false } });
  for (const [x, z] of [[-0.4, -0.35], [0.4, -0.35], [-0.4, 0.35], [0.4, 0.35]]) cbox(L, x, 0, z, 0.05, 0.08, 0.05, 'metalDark');
  box(L, -0.46, 0.88, -0.41, 0.46, 0.92, 0.41, 'metalDark');
  for (const [x, z] of [[-0.21, -0.18], [0.21, -0.18], [-0.21, 0.18], [0.21, 0.18]]) panel(L, 'p_decal', R('burner'), x, 0.922, z, 0.32, 0.32, 'py');
  panel(L, 'steel', null, 0, 0.42, 0.402, 0.78, 0.48, 'pz', { tint: [0.8, 0.8, 0.82] });
  panel(L, 'p_decal', R('tvOff'), 0, 0.45, 0.404, 0.4, 0.22, 'pz');
  rod(L, [-0.32, 0.7, 0.44], [0.32, 0.7, 0.44], 0.015, 4, 'p_chrome', { up: [0, 1, 0] });
  panel(L, 'p_decal', R('knobs'), 0, 0.81, 0.403, 0.7, 0.08, 'pz');
  box(L, -0.45, 0.92, -0.4, 0.45, 1.5, -0.36, 'steel');
  box(L, -0.45, 1.4, -0.36, 0.45, 1.44, -0.12, 'steel');
  solid(L, -0.45, 0, -0.4, 0.45, 0.92, 0.4, 'metal');
  return { topY: wp(L, 0, 0.92, 0)[1] };
});
export const prep_table = defProp('prep_table', (L, o) => {
  const l = o.length || 1.8, w = 0.75;
  box(L, -l / 2, 0.86, -w / 2, l / 2, 0.9, w / 2, 'steel');
  box(L, -l / 2 + 0.05, 0.2, -w / 2 + 0.05, l / 2 - 0.05, 0.23, w / 2 - 0.05, 'steel', { faces: { ny: false } });
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rod(L, [x * (l / 2 - 0.06), 0, z * (w / 2 - 0.06)], [x * (l / 2 - 0.06), 0.86, z * (w / 2 - 0.06)], 0.02, 4, 'p_chrome');
  solid(L, -l / 2, 0, -w / 2, l / 2, 0.9, w / 2, 'metal');
  return { topY: wp(L, 0, 0.9, 0)[1] };
});
/** Wire shelving with stock. opts: empty */
export const kitchen_shelf = defProp('kitchen_shelf', (L, o, r) => {
  const w = 1.2, d = 0.5, h = 1.8;
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) rod(L, [x, 0, z], [x, h, z], 0.015, 4, 'p_chrome');
  for (const y of [0.15, 0.6, 1.05, 1.5]) {
    quadUV(L, [-w / 2, y, d / 2], [w / 2, y, d / 2], [w / 2, y, -d / 2], [-w / 2, y, -d / 2], 'p_wire', [0, 0, 8, 3]);
    beam(L, [-w / 2, y, d / 2], [w / 2, y, d / 2], 0.02, 0.03, 'p_chrome', { ends: false });
    if (!o.empty && r() < 0.85) {
      const iw = range(r, 0.5, 1.0), ih = range(r, 0.18, 0.32);
      const x0 = range(r, -w / 2 + 0.05, w / 2 - 0.05 - iw);
      box(L, x0, y, -d / 2 + 0.05, x0 + iw, y + ih, d / 2 - 0.06, 'p_cardboard', { faces: { ny: false } });
      panel(L, 'p_decal', R(r() < 0.5 ? 'products' : 'productsB'), x0 + iw / 2, y + ih / 2, d / 2 - 0.055, iw - 0.02, ih - 0.02, 'pz');
    }
  }
  solid(L, -w / 2, 0, -d / 2, w / 2, h, d / 2, 'metal', { bullet: false });
  return {};
});
/** Walk-in cooler door on a wall. */
export const fridge_walkin_door = defProp('fridge_walkin_door', (L, o) => {
  const w = 1.0, h = 2.05;
  box(L, -w / 2 - 0.1, 0, 0, w / 2 + 0.1, h + 0.12, 0.05, 'steel');
  box(L, -w / 2, 0.02, 0.05, w / 2, h, 0.14, 'steel', { tint: [0.9, 0.92, 0.95] });
  for (const y of [0.3, h - 0.3]) box(L, -w / 2 - 0.05, y, 0.05, -w / 2 + 0.08, y + 0.14, 0.17, 'p_chrome');
  box(L, w / 2 - 0.2, 1.0, 0.14, w / 2 - 0.05, 1.12, 0.22, 'p_chrome');
  box(L, w / 2 - 0.08, 0.9, 0.18, w / 2 - 0.04, 1.2, 0.22, 'p_chrome');
  panel(L, 'p_decalLit', R('screenGreen'), w / 2 + 0.25, 1.6, 0.051, 0.16, 0.08, 'pz');
  box(L, w / 2 + 0.15, 1.52, 0, w / 2 + 0.35, 1.68, 0.05, 'metalDark', { faces: { pz: false } });
  panel(L, 'p_decal', R('hazard'), 0, 0.1, 0.142, w, 0.1, 'pz');
  solid(L, -w / 2, 0, 0, w / 2, h, 0.14, 'metal');
  return { handle: wp(L, w / 2 - 0.12, 1.06, 0.3) };
});
export const buffet_table = defProp('buffet_table', (L, o) => {
  const l = o.length || 2.4, w = 0.8;
  box(L, -l / 2, 0.72, -w / 2, l / 2, 0.76, w / 2, 'p_fabric', { tint: [0.95, 0.95, 0.92] });
  box(L, -l / 2 + 0.01, 0.02, -w / 2 + 0.01, l / 2 - 0.01, 0.72, w / 2 - 0.01, 'p_fabric', { tint: [0.6, 0.12, 0.12], faces: { ny: false, py: false } });
  for (let i = 0; i < 3; i++) {
    const x = -l / 2 + l * (i + 0.5) / 3;
    box(L, x - 0.28, 0.76, -0.2, x + 0.28, 0.86, 0.15, 'p_chrome');
    loft(L, [[x - 0.27, 0.86, -0.19], [x + 0.27, 0.86, -0.19], [x + 0.27, 0.86, 0.14], [x - 0.27, 0.86, 0.14]], [[x - 0.2, 0.96, -0.12], [x + 0.2, 0.96, -0.12], [x + 0.2, 0.96, 0.07], [x - 0.2, 0.96, 0.07]], 'p_chrome', { capB: 'p_chrome' });
  }
  for (const s of [-1, 1]) rod(L, [s * (l / 2 - 0.1), 0.76, 0.3], [s * (l / 2 - 0.1), 1.25, 0.3], 0.012, 4, 'p_chrome');
  quad(L, [-l / 2 + 0.1, 1.05, 0.38], [l / 2 - 0.1, 1.05, 0.38], [l / 2 - 0.1, 1.25, 0.25], [-l / 2 + 0.1, 1.25, 0.25], 'p_glass');
  solid(L, -l / 2, 0, -w / 2, l / 2, 0.76, w / 2, 'cloth');
  return { topY: wp(L, 0, 0.76, 0)[1] };
});
/** Table with four chairs. opts: square (default round), neat (aligned chairs), cloth */
export const restaurant_table_set = defProp('restaurant_table_set', (L, o, r) => {
  let topY;
  if (o.square) {
    box(L, -0.45, 0.73, -0.45, 0.45, 0.77, 0.45, 'woodDark');
    rod(L, [0, 0, 0], [0, 0.73, 0], 0.05, 5, 'metalDark');
    box(L, -0.3, 0, -0.3, 0.3, 0.04, 0.3, 'metalDark', { faces: { ny: false } });
    solid(L, -0.45, 0, -0.45, 0.45, 0.77, 0.45, 'wood');
    topY = wp(L, 0, 0.77, 0)[1];
  } else topY = table_round(L, 0, 0, 0, 0, { cloth: o.cloth !== false, radius: 0.55, seed: 1 }).topY;
  const seat = FABRIC(o, r);
  for (let i = 0; i < 4; i++) {
    const a = i * HP + (o.neat ? 0 : range(r, -0.25, 0.25));
    const d = o.neat ? 0.72 : range(r, 0.68, 0.95);
    chair(L, Math.sin(a) * d, 0, Math.cos(a) * d, a + PI + (o.neat ? 0 : range(r, -0.3, 0.3)), { color: seat, seed: i });
  }
  return { topY };
});

export const potted_plant = defProp('potted_plant', (L, o, r) => {
  const pot = rgb(o.color !== undefined ? o.color : 0xa85a32);
  rod(L, [0, 0, 0], [0, 0.45, 0], 0.18, 8, 'p_paint', { r2: 0.26, tint: pot, uvs: 'cyl', phase: PI / 8 });
  rod(L, [0, 0.45, 0], [0, 0.5, 0], 0.27, 8, 'p_paint', { tint: mul(pot, 0.85), phase: PI / 8 });
  vcyl(L, 0, 0.44, 0, 0.25, 0.02, 8, 'dirt', { phase: PI / 8 });
  if (o.variant === 'ficus') {
    rod(L, [0, 0.45, 0], [0.05, 1.3, 0], 0.03, 4, 'p_bark');
    blob(L, 0.05, 1.5, 0, 0.42, 0.4, 0.42, 6, 'p_leaf', { rng: r, tint: [0.8, 1, 0.75], jitter: 0.2 });
  } else {
    for (let i = 0; i < 3; i++) crossCards(L, 0, 0.45, 0, 0.9, 0.95, C('plant'), { count: 1, angle: i * PI / 3 + range(r, 0, 0.3), tint: mix([1, 1, 1], [0.8, 0.9, 0.7], r()) });
  }
  solid(L, -0.2, 0, -0.2, 0.2, 0.5, 0.2, 'tile');
  return { topY: wp(L, 0, 0.5, 0)[1] };
});

// ---------------------------------------------------------------- wall decor
/** Framed painting on a wall. opts: variant 'land'|'port'|'flower', width, height, y (centre height) */
export const painting = defProp('painting', (L, o, r) => {
  const v = o.variant || pick(r, ['land', 'port', 'flower']);
  const port = v === 'port';
  const w = o.width || (port ? 0.55 : 0.9), h = o.height || (port ? 0.75 : 0.65), y = o.y || 1.6;
  box(L, -w / 2, y - h / 2, 0, w / 2, y + h / 2, 0.04, 'p_brass', { tint: [0.8, 0.65, 0.4], faces: { nz: false } });
  panel(L, 'p_decal', R({ land: 'paintLand', port: 'paintPort', flower: 'paintFlower' }[v]), 0, y, 0.042, w - 0.1, h - 0.1, 'pz');
  return {};
});
export const mirror = defProp('mirror', (L, o) => {
  const w = o.width || 0.7, h = o.height || 1.0, y = o.y || 1.5;
  box(L, -w / 2, y - h / 2, 0, w / 2, y + h / 2, 0.03, o.wood || 'woodDark', { faces: { nz: false } });
  panel(L, 'p_decal', R('mirror'), 0, y, 0.032, w - 0.08, h - 0.08, 'pz');
  return {};
});

// ---------------------------------------------------------------- restrooms & laundry
/** Toilet stall against a wall (back at z=0). opts: open (door ajar), width */
export const toilet_stall = defProp('toilet_stall', (L, o, r) => {
  const w = o.width || 0.9, d = 1.5, h0 = 0.15, h1 = 1.85;
  const t = rgb(o.color !== undefined ? o.color : 0x8a9aa0);
  for (const s of [-1, 1]) box(L, s * w / 2 - 0.015, h0, 0, s * w / 2 + 0.015, h1, d, 'p_paint', { tint: t });
  for (const s of [-1, 1]) box(L, s * w / 2 - 0.015 - (s > 0 ? 0.12 : 0), 0, d - 0.015, s * w / 2 + 0.015 + (s < 0 ? 0.12 : 0), h1, d + 0.015, 'p_paint', { tint: t });
  const dw = w - 0.26;
  pushR(L, [-dw / 2, h0, d], 0, o.open ? -1.2 : 0, 0);
  box(L, 0, 0, -0.015, dw, h1 - h0, 0.015, 'p_paint', { tint: mul(t, 0.95) });
  box(L, dw - 0.08, 0.85, 0.015, dw - 0.04, 0.95, 0.03, 'p_chrome');
  L.pop();
  // toilet
  box(L, -0.2, 0.4, 0.02, 0.2, 0.75, 0.2, 'p_porcelain');
  rod(L, [0, 0, 0.45], [0, 0.38, 0.45], 0.14, 6, 'p_porcelain', { r2: 0.2, rv: undefined });
  rod(L, [0, 0.38, 0.42], [0, 0.42, 0.42], 0.21, 8, 'p_porcelain', { capB: 'p_decal', capRectB: R('toiletTop') });
  box(L, 0.3, 0.7, 0.4, 0.42, 0.8, 0.5, 'p_chrome');
  for (const s of [-1, 1]) solid(L, s * w / 2 - 0.02, h0, 0, s * w / 2 + 0.02, h1, d, 'metal');
  if (!o.open) solid(L, -dw / 2, h0, d - 0.02, dw / 2, h1, d + 0.02, 'metal');
  return { door: wp(L, 0, 0, d + 0.5) };
});
/** Wall-hung sink basin with faucet. */
export const sink = defProp('sink', (L, o) => {
  const y = o.height || 0.85;
  const rect = (x, yy, z0, z1) => [[-x, yy, z0], [x, yy, z0], [x, yy, z1], [-x, yy, z1]];
  loft(L, rect(0.22, y - 0.2, 0, 0.36), rect(0.28, y, 0, 0.48), 'p_porcelain', {});
  loft(L, rect(0.23, y, 0.06, 0.42), rect(0.18, y - 0.12, 0.1, 0.36), 'p_porcelain', { inward: true, capB: 'p_porcelain' });
  quad(L, [-0.28, y, 0.48], [0.28, y, 0.48], [0.28, y, 0.42], [-0.28, y, 0.42], 'p_porcelain');
  for (const [x0, x1, z0, z1] of [[-0.28, 0.28, 0, 0.06], [-0.28, -0.23, 0.06, 0.42], [0.23, 0.28, 0.06, 0.42]]) quad(L, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], 'p_porcelain');
  rod(L, [0, y, 0.04], [0, y + 0.14, 0.04], 0.02, 4, 'p_chrome');
  beam(L, [0, y + 0.13, 0.04], [0, y + 0.1, 0.16], 0.025, 0.02, 'p_chrome');
  for (const s of [-1, 1]) cbox(L, s * 0.09, y, 0.04, 0.04, 0.05, 0.04, 'p_chrome');
  rod(L, [0, y - 0.2, 0.15], [0, 0.3, 0.15], 0.02, 4, 'p_chrome');
  beam(L, [0, 0.35, 0.15], [0, 0.35, 0], 0.03, 0.03, 'p_chrome', { ends: false });
  solid(L, -0.26, y - 0.18, 0, 0.26, y, 0.46, 'tile');
  return { topY: wp(L, 0, y, 0)[1] };
});
/** Wall-hung urinal. opts: divider (privacy screen on +X side) */
export const urinal = defProp('urinal', (L, o) => {
  extrude(L, [[0, 0.45], [0.22, 0.5], [0.33, 0.68], [0.3, 1.0], [0.14, 1.12], [0, 1.12]], 'x', -0.2, 0.2, { side: 'p_porcelain', cap0: 'p_porcelain', cap1: 'p_porcelain', edges: [undefined, undefined, undefined, undefined, undefined, null] });
  quad(L, [-0.15, 0.62, 0.3], [0.15, 0.62, 0.3], [0.13, 1.0, 0.25], [-0.13, 1.0, 0.25], 'p_flat', { tint: [0.6, 0.62, 0.62] });
  rod(L, [0, 1.12, 0.05], [0, 1.45, 0.05], 0.018, 4, 'p_chrome');
  box(L, -0.05, 1.3, 0.02, 0.05, 1.38, 0.1, 'p_chrome');
  if (o.divider) { box(L, 0.4, 0.35, 0, 0.43, 1.55, 0.6, 'p_paint', { tint: [0.6, 0.66, 0.7] }); solid(L, 0.38, 0.35, 0, 0.45, 1.55, 0.6, 'metal'); }
  solid(L, -0.2, 0.45, 0, 0.2, 1.1, 0.3, 'tile');
  return {};
});
export const laundry_cart = defProp('laundry_cart', (L, o, r) => {
  const t = rgb(o.color !== undefined ? o.color : 0x5a6a7a);
  const rect = (x, y, z) => [[-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]];
  loft(L, rect(0.4, 0.2, 0.3), rect(0.46, 0.95, 0.36), 'p_fabric', { tint: t, capA: 'p_fabric' });
  loft(L, rect(0.46, 0.95, 0.36), rect(0.42, 0.75, 0.32), 'p_fabric', { inward: true, tint: mul(t, 0.6) });
  const top = rect(0.47, 0.96, 0.37);
  for (let i = 0; i < 4; i++) beam(L, top[i], top[(i + 1) % 4], 0.025, 0.025, 'p_chrome', { ends: false });
  for (const [x, z] of [[-0.42, -0.32], [0.42, -0.32], [-0.42, 0.32], [0.42, 0.32]]) { beam(L, [x, 0.08, z], [x * 1.1, 0.96, z * 1.15], 0.025, 0.025, 'p_chrome', { ends: false }); cbox(L, x, 0, z, 0.06, 0.08, 0.06, 'p_rubber'); }
  if (o.full !== false) blob(L, 0, 0.85, 0, 0.36, 0.14, 0.28, 5, 'p_fabric', { rng: r, tint: [0.95, 0.95, 0.92], jitter: 0.25 });
  solid(L, -0.46, 0, -0.36, 0.46, 0.96, 0.36, 'cloth');
  return {};
});
export const washing_machine = defProp('washing_machine', (L, o) => {
  const mat = o.steel ? 'steel' : 'p_plastic';
  box(L, -0.35, 0, -0.35, 0.35, 0.95, 0.35, mat, { faces: { ny: false }, tint: o.steel ? null : [0.95, 0.95, 0.93] });
  panel(L, 'p_decal', R('porthole'), 0, 0.45, 0.352, 0.46, 0.46, 'pz');
  box(L, -0.35, 0.82, 0.35, 0.35, 0.95, 0.38, 'p_plastic', { tint: [0.6, 0.62, 0.65] });
  panel(L, 'p_decal', R('knobs'), 0.1, 0.885, 0.382, 0.4, 0.07, 'pz');
  panel(L, 'p_decalLit', R('screenGreen'), -0.2, 0.885, 0.382, 0.14, 0.07, 'pz');
  solid(L, -0.35, 0, -0.35, 0.35, 0.95, 0.35, 'metal');
  return { topY: wp(L, 0, 0.95, 0)[1] };
});
export const ironing_board = defProp('ironing_board', (L, o, r) => {
  const cover = FABRIC(o, r, 0x8aa0b8);
  extrude(L, [[-0.65, -0.17], [0.4, -0.17], [0.6, -0.08], [0.68, 0], [0.6, 0.08], [0.4, 0.17], [-0.65, 0.17]], 'y', 0.84, 0.87, { side: 'metal', cap0: 'metal', cap1: 'p_fabric' }, { capTint: cover });
  for (const s of [-1, 1]) { beam(L, [s * 0.35, 0.84, -0.1], [-s * 0.3, 0, -0.12], 0.025, 0.02, 'p_chrome', { ends: false }); beam(L, [s * 0.35, 0.84, 0.1], [-s * 0.3, 0, 0.12], 0.025, 0.02, 'p_chrome', { ends: false }); }
  if (o.iron !== false) { extrude(L, [[-0.12, -0.06], [0.06, -0.06], [0.14, 0], [0.06, 0.06], [-0.12, 0.06]], 'y', 0.87, 0.92, 'p_plastic', { tint: [0.7, 0.75, 0.8] }); box(L, -0.08, 0.92, -0.015, 0.04, 0.97, 0.015, 'p_plastic', { tint: [0.3, 0.3, 0.32] }); }
  return { topY: wp(L, 0, 0.87, 0)[1] };
});
export const sleeping_bag = defProp('sleeping_bag', (L, o, r) => {
  const t = FABRIC(o, r, pick(r, [0x2a5a3a, 0x2a3a6a, 0x8a2a1e, 0x5a4a2a]));
  const sec = (z, w, h) => [[-w, 0.005, z], [w, 0.005, z], [w * 0.8, h, z], [-w * 0.8, h, z]];
  const rings = [sec(-0.95, 0.3, 0.1), sec(-0.6, 0.38, 0.14), sec(0.3, 0.36, 0.12), sec(0.92, 0.28, 0.1)];
  for (let i = 0; i < rings.length - 1; i++) loft(L, rings[i], rings[i + 1], 'p_fabric', { tint: t, capA: i === 0 ? 'p_fabric' : false, capB: i === rings.length - 2 ? 'p_fabric' : false });
  quad(L, [-0.3, 0.115, 0.92], [0.05, 0.13, 0.95], [0.12, 0.13, 0.35], [-0.3, 0.14, 0.3], 'p_fabric', { tint: mul(t, 0.75) });
  if (o.pillow !== false) blob(L, 0, 0.11, -0.8, 0.22, 0.06, 0.13, 5, 'p_fabric', { rng: r, tint: [0.85, 0.85, 0.8], jitter: 0.08 });
  return {};
});

// ---------------------------------------------------------------- survivor dressing
/** Furniture piled against a door/wall (wall at z=0, pile toward +Z). opts: width (2) */
export const barricade_furniture = defProp('barricade_furniture', (L, o, r) => {
  const w = o.width || 2.0;
  const sub = { collide: false };
  // table on its side against the door
  pushR(L, [range(r, -0.2, 0.2), 0, 0.12], -HP + 0.08, 0, 0);
  box(L, -0.7, 0, -0.04, 0.7, 0.04, 1.1, 'woodDark');
  for (const x of [-0.6, 0.6]) for (const z of [0.15, 0.95]) box(L, x - 0.03, 0.04, z - 0.03, x + 0.03, 0.75, z + 0.03, 'woodDark');
  L.pop();
  // mattress leaning
  pushR(L, [-w / 2 + 0.5, 0, 0.55], -0.35, 0.15, 0);
  box(L, -0.45, 0, -0.1, 0.45, 1.9, 0.1, 'p_quilt', { tint: [0.9, 0.88, 0.8] });
  L.pop();
  dresser(L, w / 2 - 0.55, 0, 0.55, range(r, -0.2, 0.2), { ...sub });
  chair(L, w / 2 - 0.6, 0.86, 0.5, range(r, 0, TAU), { ...sub, seed: 3 });
  pushR(L, [0.1, 0.0, 0.85], 0, range(r, 0, TAU), HP * 0.95);
  chair(L, 0, 0.22, 0, 0, { ...sub, seed: 4 });
  L.pop();
  chair(L, -0.3, 0, 1.05, range(r, 0, TAU), { ...sub, seed: 5 });
  box(L, -0.2, 0, 0.35, 0.35, 0.5, 0.75, 'p_cardboard', { tint: [0.9, 0.85, 0.75] });
  solid(L, -w / 2, 0, 0, w / 2, 1.8, 1.0, 'wood', { bullet: false });
  return { topY: wp(L, 0, 1.8, 0)[1] };
});
/** Plywood boards nailed over a window (wall at z=0). opts: width (1.2), height (1.4), y (window centre, 1.4), variant 'planks'|'sheet' */
export const plywood_board = defProp('plywood_board', (L, o, r) => {
  const w = o.width || 1.2, h = o.height || 1.4, y = o.y || 1.4;
  if (o.variant === 'sheet') box(L, -w / 2 - 0.1, y - h / 2 - 0.1, 0, w / 2 + 0.1, y + h / 2 + 0.1, 0.02, 'p_plywood', { faces: { nz: false } });
  else {
    const n = Math.max(3, Math.round(h / 0.32));
    for (let i = 0; i < n; i++) {
      const yy = y - h / 2 + (i + 0.5) * h / n;
      pushR(L, [range(r, -0.05, 0.05), yy, 0.012 + i * 0.006], 0, 0, range(r, -0.12, 0.12));
      box(L, -w / 2 - 0.18, -0.11, -0.01, w / 2 + 0.18, 0.11, 0.012, i % 2 ? 'p_plywood' : 'woodLight', { tint: mix([1, 1, 1], [0.8, 0.75, 0.65], r()), faces: { nz: false } });
      L.pop();
    }
  }
  solid(L, -w / 2, y - h / 2, 0, w / 2, y + h / 2, 0.05, 'wood');
  return {};
});
function cardboardTextMat(L, text) {
  return canvasMat(L, 'cbsign:' + text, 64, 48, (g) => {
    g.fill(0xb08a58); for (let x = 0; x < 64; x += 3) g.rect(0xa47e4e, x, 0, 1, 48);
    g.stains(0x5a4028, 6, 0.15, 8);
    const lines = String(text).split('\n');
    lines.forEach((ln, i) => { g.ctx.save(); g.ctx.translate(32, (i + 0.5) * 48 / lines.length); g.ctx.rotate((g.r() - 0.5) * 0.15); g.text(ln, 0 - g.ox, 0 - g.oy, Math.min(18, Math.floor(40 / lines.length)), 0x141008, { maxW: 58, font: 'Impact, sans-serif' }); g.ctx.restore(); });
    g.noise(12);
  });
}
/** Hand-written cardboard sign leaning against a wall. opts: text */
export const cardboard_sign = defProp('cardboard_sign', (L, o) => {
  const text = o.text || 'HELP US';
  pushR(L, [0, 0, 0.16], -0.16, 0, 0);
  box(L, -0.45, 0, -0.008, 0.45, 0.66, 0.0, 'p_cardboard', { faces: { pz: false, ny: false } });
  panel(L, cardboardTextMat(L, text), [0, 0, 1, 1], 0, 0.33, 0.002, 0.9, 0.66, 'pz');
  L.pop();
  return {};
});

export const HOTEL = {
  bed, nightstand, dresser, wardrobe, desk, office_chair, chair, armchair, sofa, coffee_table, table_round, table_long,
  lamp_floor, lamp_table, tv, luggage_cart, room_service_cart, ice_machine, vending_machine, fire_extinguisher,
  fire_alarm_strobe, wall_sconce, ceiling_light, chandelier, reception_desk, elevator_doors, stairwell_railing,
  kitchen_oven, prep_table, kitchen_shelf, fridge_walkin_door, buffet_table, restaurant_table_set, potted_plant,
  painting, mirror, toilet_stall, sink, urinal, laundry_cart, washing_machine, ironing_board, sleeping_bag,
  barricade_furniture, plywood_board, cardboard_sign,
};
export const HOTEL_MOUNT = {
  fire_extinguisher: 'wall', fire_alarm_strobe: 'wall', wall_sconce: 'wall', ceiling_light: 'ceiling', chandelier: 'ceiling',
  elevator_doors: 'wall', fridge_walkin_door: 'wall', painting: 'wall', mirror: 'wall', toilet_stall: 'wall', sink: 'wall',
  urinal: 'wall', barricade_furniture: 'wall', plywood_board: 'wall', cardboard_sign: 'wall',
};
