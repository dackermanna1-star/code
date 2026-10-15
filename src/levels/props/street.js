// Street / exterior props: lights, signs, furniture, barriers, vegetation,
// construction & rooftop clutter, CEDA evacuation dressing, corpses and debris.
import {
  PI, TAU, HP, V3, R, C, subR, rgb, mix, mul, pick, range, PALETTE, defProp, box, cbox, panel, quad, quadUV, quadTo,
  solid, clipQuad, extrude, rod, vcyl, xcyl, zcyl, loft, ringPts, blob, pushR, wp, beam, lamp, cable, sag, crossCards,
  tri, triTo, canvasMat, signMat, genMat,
} from './kit.js';
import { wheel } from './vehicles.js';

// ---------------------------------------------------------------- lighting & traffic
/** Cobra-head streetlight (8 m). opts: light (false = off), arms (1|2), color (pole tint) */
export const streetlight = defProp('streetlight', (L, o) => {
  const pole = rgb(o.color !== undefined ? o.color : 0x6a6e68);
  vcyl(L, 0, 0, 0, 0.26, 0.32, 8, 'concrete');
  rod(L, [0, 0.32, 0], [0, 7.7, 0], 0.11, 6, 'p_paint', { r2: 0.07, tint: pole, uvs: 'cyl' });
  const arms = o.arms === 2 ? [1, -1] : [1];
  const on = o.light !== false;
  const lamps = [];
  for (const s of arms) {
    rod(L, [0, 7.3, 0], [0, 7.95, s * 0.9], 0.05, 4, 'p_paint', { tint: pole });
    rod(L, [0, 7.95, s * 0.9], [0, 8.05, s * 2.0], 0.045, 4, 'p_paint', { tint: pole });
    const z0 = s * 1.95, z1 = s * 2.85;
    extrude(L, [[z0, 7.98], [z1, 7.94], [z1 + s * 0.06, 8.06], [z1 - s * 0.15, 8.16], [z0, 8.14]], 'x', -0.21, 0.21, 'p_paint', { tint: [0.75, 0.75, 0.72] });
    panel(L, on ? 'p_emSodium' : 'p_flat', null, 0, 7.955, s * 2.4, 0.32, 0.7, 'ny', { tint: on ? null : [0.35, 0.35, 0.32] });
    lamps.push(wp(L, 0, 7.75, s * 2.4));
    if (on) lamp(L, o, [0, 7.7, s * 2.4], 0xffb468, 15, 1.25);
  }
  solid(L, -0.12, 0, -0.12, 0.12, 7.6, 0.12, 'metal');
  return { lamp: lamps[0], lamps };
});

/** Mast-arm traffic signal. opts: state 'red'|'amber'|'green'|'off', arm (length, default 6) */
export const traffic_light = defProp('traffic_light', (L, o) => {
  const arm = o.arm || 6;
  const state = o.state || 'red';
  vcyl(L, 0, 0, 0, 0.25, 0.25, 8, 'concrete');
  rod(L, [0, 0.25, 0], [0, 6.4, 0], 0.13, 6, 'p_paint', { r2: 0.11, tint: [0.42, 0.44, 0.42], uvs: 'cyl', capB: 'p_paint' });
  rod(L, [0, 5.9, 0], [arm, 6.05, 0], 0.08, 5, 'p_paint', { r2: 0.05, tint: [0.42, 0.44, 0.42], capB: 'p_paint' });
  beam(L, [0, 6.3, 0], [arm * 0.4, 6.07, 0], 0.03, 0.03, 'metalDark');
  const head = (x, y) => {
    box(L, x - 0.17, y - 0.5, -0.12, x + 0.17, y + 0.5, 0.14, 'p_paint', { tint: [0.75, 0.62, 0.15] });
    panel(L, 'p_flat', null, x, y, -0.121, 0.42, 1.12, 'nz', { tint: [0.1, 0.1, 0.1] });
    const lit = { red: 0, amber: 1, green: 2 }[state];
    [['p_emRed', [0.35, 0.05, 0.04]], ['p_emAmber', [0.35, 0.22, 0.04]], ['p_emGreen', [0.05, 0.3, 0.1]]].forEach(([m, dim], i) => {
      const ly = y + 0.31 - i * 0.31;
      panel(L, lit === i ? m : 'p_flat', null, x, ly, 0.142, 0.2, 0.2, 'pz', { tint: lit === i ? null : dim });
      box(L, x - 0.13, ly + 0.11, 0.14, x + 0.13, ly + 0.13, 0.32, 'p_paint', { tint: [0.15, 0.15, 0.15], faces: { nz: false } });
    });
    beam(L, [x, y + 0.5, 0], [x, 6.0, 0], 0.04, 0.04, 'metalDark');
  };
  head(arm * 0.48, 5.3); head(arm * 0.92, 5.3);
  const sm = signMat(L, { text: o.street || 'PEACH ST', bg: 'rgb(30,100,50)', fg: 'rgb(240,240,230)', w: 64, h: 16, border: 'rgb(240,240,230)' });
  box(L, arm * 0.2, 6.15, -0.02, arm * 0.2 + 1.3, 6.45, 0.02, 'p_flat', { tint: [0.12, 0.38, 0.2] });
  panel(L, sm, [0, 0, 1, 1], arm * 0.2 + 0.65, 6.3, 0.022, 1.3, 0.3, 'pz');
  panel(L, sm, [0, 0, 1, 1], arm * 0.2 + 0.65, 6.3, -0.022, 1.3, 0.3, 'nz');
  // pedestrian head on pole
  box(L, -0.16, 2.6, 0.13, 0.16, 2.95, 0.4, 'p_paint', { tint: [0.15, 0.15, 0.15] });
  panel(L, state === 'off' ? 'p_flat' : 'p_emAmber', null, 0, 2.775, 0.402, 0.24, 0.26, 'pz', { tint: state === 'off' ? [0.2, 0.15, 0.05] : null });
  solid(L, -0.13, 0, -0.13, 0.13, 6.2, 0.13, 'metal');
  return { heads: [wp(L, arm * 0.48, 5.3, 0), wp(L, arm * 0.92, 5.3, 0)] };
});

/** Octagonal stop sign on a post. */
export const stop_sign = defProp('stop_sign', (L, o) => {
  beam(L, [0, 0, 0], [0, 2.05, 0], 0.06, 0.06, 'metal');
  const rr = 0.38, cy = 2.05; const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * TAU; pts.push([Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  const s = R('stopSign');
  extrude(L, pts, 'z', 0.035, 0.05, { side: 'metal', cap0: 'metal', cap1: 'p_decal' }, {
    capUV: (u, v, dir) => (dir.z > 0 ? [s[0] + (u + rr) / (2 * rr) * (s[2] - s[0]), s[1] + (v - cy + rr) / (2 * rr) * (s[3] - s[1])] : [u, v]),
  });
  solid(L, -0.04, 0, -0.04, 0.04, 1.8, 0.04, 'metal');
  return {};
});

export const fire_hydrant = defProp('fire_hydrant', (L, o) => {
  const t = rgb(o.color !== undefined ? o.color : 0xb8261c);
  vcyl(L, 0, 0, 0, 0.17, 0.07, 6, 'p_paint', { tint: t, capB: false });
  rod(L, [0, 0.07, 0], [0, 0.55, 0], 0.125, 6, 'p_paint', { r2: 0.115, tint: t, uvs: 'cyl' });
  vcyl(L, 0, 0.55, 0, 0.14, 0.05, 6, 'p_paint', { tint: t, capB: false });
  rod(L, [0, 0.6, 0], [0, 0.72, 0], 0.14, 6, 'p_paint', { r2: 0.05, tint: t, capA: 'p_paint', capB: 'p_paint' });
  cbox(L, 0, 0.72, 0, 0.05, 0.05, 0.05, 'p_paint', { tint: mul(t, 0.7) });
  for (const s of [-1, 1]) rod(L, [s * 0.1, 0.42, 0], [s * 0.21, 0.42, 0], 0.05, 5, 'p_paint', { tint: t, capB: 'p_paint' });
  rod(L, [0, 0.4, 0.1], [0, 0.4, 0.22], 0.07, 5, 'p_paint', { tint: t, capB: 'p_paint' });
  solid(L, -0.16, 0, -0.16, 0.16, 0.7, 0.16, 'metal');
  return { topY: wp(L, 0, 0.75, 0)[1] };
});

export const mailbox = defProp('mailbox', (L, o) => {
  const t = rgb(o.color !== undefined ? o.color : 0x1e3c7c);
  const pts = [[-0.26, 0.26], [0.26, 0.26], [0.26, 1.04], [0.19, 1.18], [0, 1.24], [-0.19, 1.18], [-0.26, 1.04]];
  extrude(L, pts, 'x', -0.25, 0.25, 'p_paint', { tint: t });
  for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) cbox(L, x, 0, z, 0.05, 0.27, 0.05, 'p_paint', { tint: mul(t, 0.8) });
  panel(L, 'p_paint', null, 0, 0.92, 0.262, 0.4, 0.2, 'pz', { tint: mul(t, 0.6) });
  box(L, -0.12, 0.96, 0.262, 0.12, 0.99, 0.3, 'p_chrome');
  for (const s of [-1, 1]) panel(L, 'p_decal', R('mail'), s * 0.255, 0.75, 0, 0.42, 0.11, s > 0 ? 'px' : 'nx');
  panel(L, 'p_decal', R('mail'), 0, 0.6, 0.262, 0.4, 0.1, 'pz');
  solid(L, -0.24, 0, -0.24, 0.24, 1.18, 0.24, 'metal');
  return { topY: wp(L, 0, 1.24, 0)[1] };
});

export const newspaper_box = defProp('newspaper_box', (L, o, r) => {
  const t = rgb(o.color !== undefined ? o.color : pick(r, [0xb82a20, 0x1e4a8a, 0xd8a820, 0x2a6a3a, 0xd8d4c8]));
  cbox(L, 0, 0, 0, 0.4, 0.3, 0.36, 'metalDark');
  box(L, -0.25, 0.3, -0.22, 0.25, 1.02, 0.22, 'p_paint', { tint: t });
  panel(L, 'p_decal', R('newsFront'), 0, 0.72, 0.222, 0.36, 0.3, 'pz');
  panel(L, 'p_carGlass', [0, 0, 0.3, 0.3], 0, 0.72, 0.224, 0.38, 0.32, 'pz');
  panel(L, 'p_decal', R('news'), 0, 0.94, 0.223, 0.44, 0.11, 'pz');
  box(L, 0.12, 0.45, 0.22, 0.2, 0.55, 0.25, 'p_chrome');
  box(L, -0.08, 0.4, 0.22, 0.08, 0.43, 0.26, 'p_chrome');
  solid(L, -0.24, 0, -0.21, 0.24, 1.0, 0.21, 'metal');
  return { topY: wp(L, 0, 1.02, 0)[1] };
});

export const trash_can = defProp('trash_can', (L, o) => {
  const t = rgb(o.color !== undefined ? o.color : 0x2a4232);
  rod(L, [0, 0, 0], [0, 0.92, 0], 0.27, 8, 'shutter', { r2: 0.3, uvs: 'cyl', tint: mix(t, [1, 1, 1], 0.3), phase: PI / 8 });
  rod(L, [0, 0.92, 0], [0, 0.98, 0], 0.32, 8, 'p_paint', { tint: t, phase: PI / 8 });
  rod(L, [0, 0.88, 0], [0, 0.98, 0], 0.27, 8, 'p_paint', { tint: mul(t, 0.6), phase: PI / 8, inward: true });
  loft(L, ringPts(V3(0, 0.98, 0), V3(1, 0, 0), V3(0, 0, 1), 0.32, 8, PI / 8), ringPts(V3(0, 0.98, 0), V3(1, 0, 0), V3(0, 0, 1), 0.27, 8, PI / 8), 'p_paint', { tint: t, want: [0, 1, 0] });
  panel(L, 'black', null, 0, 0.88, 0, 0.5, 0.5, 'py');
  solid(L, -0.25, 0, -0.25, 0.25, 0.95, 0.25, 'metal');
  return { topY: wp(L, 0, 0.98, 0)[1] };
});

/** Front-load dumpster (1.9 x 1.25 m). opts: color, ladder (adds a ladder on the +X side), lids ('closed'|'open') */
export const dumpster = defProp('dumpster', (L, o) => {
  const t = rgb(o.color !== undefined ? o.color : 0x2a4a34);
  const pts = [[-0.62, 0.14], [0.5, 0.14], [0.66, 0.42], [0.66, 1.08], [0.56, 1.14], [-0.62, 1.26]];
  extrude(L, pts, 'x', -0.95, 0.95, 'p_paint', { tint: t });
  for (const s of [-1, 1]) {
    box(L, s * 0.95, 0.72, -0.3, s * 1.05, 0.9, 0.42, 'p_paint', { tint: mul(t, 0.8) });
    panel(L, 'p_flat', null, s * 1.052, 0.81, 0.06, 0.6, 0.12, s > 0 ? 'px' : 'nx', { tint: [0.05, 0.05, 0.05] });
  }
  for (const [x, z] of [[-0.8, -0.5], [0.8, -0.5], [-0.8, 0.4], [0.8, 0.4]]) xcyl(L, x, 0.07, z, 0.07, 0.06, 4, 'p_rubber', { phase: PI / 4 });
  // two black plastic lids following the slanted top
  const ang = Math.atan2(1.26 - 1.14, 0.56 + 0.62);
  const lids = o.lids === 'open';
  for (const s of [-1, 1]) {
    pushR(L, [s * 0.475, 1.26, -0.62], lids && s > 0 ? -2.3 : ang, 0, 0);
    box(L, -0.46, 0, 0, 0.46, 0.04, 1.22, 'p_rubber');
    L.pop();
  }
  panel(L, 'p_decal', R('hazard'), 0, 0.95, 0.663, 1.6, 0.1, 'pz');
  const res = { topY: wp(L, 0, 1.28, 0)[1] };
  if (o.ladder) {
    const x = 1.07;
    for (const z of [-0.2, 0.2]) beam(L, [x, 0, z], [x, 1.55, z], 0.04, 0.04, 'metalDark');
    for (let y = 0.3; y < 1.5; y += 0.3) beam(L, [x, y, -0.2], [x, y, 0.2], 0.03, 0.03, 'metalDark');
    res.ladder = { bottom: wp(L, x + 0.4, 0, 0), top: wp(L, 0.6, 1.28, 0) };
  }
  solid(L, -0.95, 0, -0.62, 0.95, 1.24, 0.64, 'metal');
  return res;
});

export const bench = defProp('bench', (L, o) => {
  const wood = o.material || 'woodLight';
  for (const s of [-1, 1]) extrude(L, [[-0.28, 0], [-0.2, 0], [-0.18, 0.4], [0.2, 0.4], [0.24, 0], [0.32, 0], [0.26, 0.46], [-0.24, 0.48], [-0.3, 0.92], [-0.36, 0.92]], 'x', s * 0.84, s * 0.88, 'p_paint', { tint: [0.15, 0.17, 0.16] });
  for (let i = 0; i < 4; i++) box(L, -0.95, 0.42, -0.22 + i * 0.12, 0.95, 0.46, -0.13 + i * 0.12, wood, { faces: { ny: false, px: false, nx: false } });
  pushR(L, [0, 0.5, -0.26], -0.28, 0, 0);
  for (let i = 0; i < 3; i++) box(L, -0.95, i * 0.13, -0.02, 0.95, i * 0.13 + 0.09, 0.02, wood, { faces: { px: false, nx: false } });
  L.pop();
  solid(L, -0.9, 0, -0.22, 0.9, 0.46, 0.28, 'wood', { bullet: false });
  return { seatY: wp(L, 0, 0.46, 0)[1] };
});

export const bus_stop = defProp('bus_stop', (L, o) => {
  const frame = [0.3, 0.32, 0.34];
  for (const [x, z] of [[-1.65, -0.7], [1.65, -0.7], [-1.65, 0.7], [1.65, 0.7]]) beam(L, [x, 0, z], [x, 2.35, z], 0.08, 0.08, 'p_paint', { tint: frame });
  box(L, -1.8, 2.35, -0.85, 1.8, 2.47, 0.85, 'p_paint', { tint: frame });
  box(L, -1.75, 2.32, -0.8, 1.75, 2.35, 0.8, 'p_dirtyWhite');
  quad(L, [-1.62, 0.15, -0.7], [1.62, 0.15, -0.7], [1.62, 2.3, -0.7], [-1.62, 2.3, -0.7], 'p_glass');
  box(L, -1.62, 0.1, -0.73, 1.62, 0.15, -0.67, 'p_paint', { tint: frame });
  // side ad panel (both faces) and bench
  box(L, -1.69, 0.12, -0.66, -1.61, 2.3, 0.66, 'p_paint', { tint: frame });
  const pm = genMat(L, 'poster', { text: 'TRANSIT', seed: 4 });
  panel(L, pm, [0, 0, 1, 1], -1.6, 1.25, 0, 1.15, 1.75, 'px');
  panel(L, pm, [0, 0, 1, 1], -1.7, 1.25, 0, 1.15, 1.75, 'nx');
  box(L, -1.3, 0.42, -0.65, 1.3, 0.47, -0.3, 'p_paint', { tint: [0.5, 0.52, 0.55] });
  for (const x of [-1.1, 1.1]) box(L, x - 0.03, 0, -0.55, x + 0.03, 0.42, -0.45, 'metalDark');
  beam(L, [2.1, 0, 0.7], [2.1, 2.6, 0.7], 0.06, 0.06, 'metal');
  box(L, 2.08, 2.0, 0.6, 2.12, 2.6, 0.8, 'p_flat', { tint: [0.9, 0.9, 0.88] });
  panel(L, 'p_decal', R('busStop'), 2.122, 2.3, 0.7, 0.18, 0.18, 'px'); panel(L, 'p_decal', R('busStop'), 2.078, 2.3, 0.7, 0.18, 0.18, 'nx');
  solid(L, -1.66, 0.15, -0.74, 1.66, 2.3, -0.66, 'glass', { bullet: false });
  solid(L, -1.7, 0, -0.66, -1.6, 2.3, 0.66, 'metal');
  solid(L, -1.8, 2.35, -0.85, 1.8, 2.47, 0.85, 'metal');
  solid(L, -1.3, 0, -0.65, 1.3, 0.47, -0.3, 'metal', { bullet: false });
  return { seatY: wp(L, 0, 0.47, 0)[1] };
});

export const porta_potty = defProp('porta_potty', (L, o) => {
  const t = rgb(o.color !== undefined ? o.color : 0x2a5ab0);
  box(L, -0.55, 0, -0.55, 0.55, 2.2, 0.55, 'p_fiberglass', { tint: t });
  loft(L, [[-0.57, 2.2, -0.57], [0.57, 2.2, -0.57], [0.57, 2.2, 0.57], [-0.57, 2.2, 0.57]], [[-0.3, 2.42, -0.3], [0.3, 2.42, -0.3], [0.3, 2.42, 0.3], [-0.3, 2.42, 0.3]], 'p_fiberglass', { capB: 'p_fiberglass', tint: [0.92, 0.92, 0.9] });
  box(L, -0.42, 0.05, 0.55, 0.42, 2.05, 0.6, 'p_fiberglass', { tint: mul(t, 0.85) });
  panel(L, 'p_decal', R('vent'), 0, 1.85, 0.602, 0.5, 0.2, 'pz');
  box(L, 0.28, 1.0, 0.6, 0.34, 1.2, 0.65, 'p_rubber');
  for (const s of [-1, 1]) { panel(L, 'p_decal', R('vent'), s * 0.552, 2.0, 0, 0.6, 0.15, s > 0 ? 'px' : 'nx'); panel(L, 'p_decal', R('restroom'), s * 0.552, 1.4, 0, 0.3, 0.3, s > 0 ? 'px' : 'nx'); }
  solid(L, -0.5, 0, -0.5, 0.5, 2.15, 0.5, 'plastic');
  return { door: wp(L, 0, 0, 0.9) };
});

export const phone_booth = defProp('phone_booth', (L, o) => {
  const al = [0.75, 0.77, 0.8];
  for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) box(L, x - 0.04, 0, z - 0.04, x + 0.04, 2.2, z + 0.04, 'p_paint', { tint: al });
  box(L, -0.5, 2.0, -0.5, 0.5, 2.3, 0.5, 'p_paint', { tint: al });
  for (const [d, x, z] of [['pz', 0, 0.502], ['nz', 0, -0.502], ['px', 0.502, 0], ['nx', -0.502, 0]]) panel(L, 'p_decal', R('phone'), x, 2.15, z, 0.8, 0.2, d);
  box(L, -0.5, 0, -0.5, 0.5, 0.08, 0.5, 'metalDark');
  quad(L, [-0.41, 0.15, -0.41], [0.41, 0.15, -0.41], [0.41, 1.95, -0.41], [-0.41, 1.95, -0.41], 'p_glass');
  quad(L, [-0.41, 0.15, 0.41], [-0.41, 0.15, -0.41], [-0.41, 1.95, -0.41], [-0.41, 1.95, 0.41], 'p_glass');
  quad(L, [0.41, 0.15, -0.41], [0.41, 0.15, 0.41], [0.41, 1.95, 0.41], [0.41, 1.95, -0.41], 'p_glass');
  quad(L, [-0.41, 0.15, 0.43], [0.41, 0.15, 0.43], [0.41, 1.95, 0.43], [-0.41, 1.95, 0.43], 'p_glass');
  box(L, -0.02, 0.1, 0.4, 0.02, 2.0, 0.46, 'p_paint', { tint: al });
  box(L, -0.18, 1.1, -0.44, 0.18, 1.6, -0.3, 'metalDark');
  panel(L, 'p_decal', R('keypad'), 0, 1.38, -0.298, 0.14, 0.14, 'pz');
  box(L, -0.17, 1.42, -0.3, -0.1, 1.58, -0.26, 'black');
  box(L, -0.25, 0.9, -0.41, 0.25, 0.94, -0.25, 'metal');
  solid(L, -0.5, 0, -0.5, 0.5, 2.25, 0.5, 'glass', { bullet: false });
  return {};
});

// ---------------------------------------------------------------- barriers
export const jersey_barrier = defProp('jersey_barrier', (L, o) => {
  const len = o.length || 3.0;
  const t = rgb(o.color !== undefined ? o.color : 0xd8d4cc);
  const pts = [[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.12, 0.33], [0.08, 0.81], [-0.08, 0.81], [-0.12, 0.33], [-0.3, 0.08]];
  extrude(L, pts, 'x', -len / 2, len / 2, { side: 'concrete', cap0: 'concrete', cap1: 'concrete', edges: [null, undefined, undefined, undefined, undefined, undefined, undefined, undefined] }, { tint: t, collide: true });
  if (o.stripes) {
    const rr = R('stripeOW');
    for (const s of [-1, 1]) {
      const zA = s * (0.12 - (0.45 - 0.33) / 0.48 * 0.04 + 0.012), zB = s * (0.12 - (0.7 - 0.33) / 0.48 * 0.04 + 0.012);
      quadTo(L, [-len / 2 + 0.2, 0.45, zA], [len / 2 - 0.2, 0.45, zA], [len / 2 - 0.2, 0.7, zB], [-len / 2 + 0.2, 0.7, zB], 'p_decal', V3(0, 0.1, s), { uv: [[rr[0], rr[1]], [rr[2], rr[1]], [rr[2], rr[3]], [rr[0], rr[3]]] });
    }
  }
  return { topY: wp(L, 0, 0.81, 0)[1] };
});

export const police_barrier = defProp('police_barrier', (L, o) => {
  const w = o.width || 2.0;
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.15);
    beam(L, [x, 1.0, 0], [x, 0, 0.36], 0.06, 0.04, 'woodLight');
    beam(L, [x, 1.0, 0], [x, 0, -0.36], 0.06, 0.04, 'woodLight');
    box(L, x - 0.04, 0.3, -0.2, x + 0.04, 0.34, 0.2, 'woodLight');
  }
  box(L, -w / 2, 0.82, -0.025, w / 2, 1.06, 0.025, 'p_flat', { tint: [0.9, 0.9, 0.88] });
  for (const s of [-1, 1]) panel(L, 'p_decal', subR(R('stripeOW'), 0, 0, 1, 1), 0, 0.94, s * 0.027, w - 0.02, 0.22, s > 0 ? 'pz' : 'nz');
  box(L, -0.4, 0.86, -0.034, 0.4, 1.02, 0.034, 'p_flat', { tint: [0.92, 0.92, 0.9] });
  for (const s of [-1, 1]) panel(L, 'p_decal', R('police'), 0, 0.94, s * 0.036, 0.72, 0.15, s > 0 ? 'pz' : 'nz');
  solid(L, -w / 2, 0, -0.05, w / 2, 1.05, 0.05, 'wood', { bullet: false });
  return {};
});

export const sandbags = defProp('sandbags', (L, o, r) => {
  const len = o.length || 2.0, rows = o.rows || 4;
  const prof = [[-0.17, 0], [0.17, 0], [0.19, 0.09], [0, 0.17], [-0.19, 0.09]];
  for (let row = 0; row < rows; row++) {
    const n = Math.max(1, Math.round(len / 0.56) - (row % 2));
    const span = n * 0.56; const x0 = -span / 2 + 0.28;
    for (let i = 0; i < n; i++) {
      const tint = mix([0.78, 0.72, 0.6], [0.58, 0.54, 0.46], r());
      pushR(L, [x0 + i * 0.56 + range(r, -0.03, 0.03), row * 0.155, range(r, -0.04, 0.04)], 0, range(r, -0.12, 0.12), range(r, -0.05, 0.05));
      extrude(L, prof, 'x', (u, v) => -0.29 + v * 0.45, (u, v) => 0.29 - v * 0.45, { side: 'p_sandbag', cap0: 'p_sandbag', cap1: 'p_sandbag', edges: [null] }, { tint, capTint: mul(tint, 0.8) });
      L.pop();
    }
  }
  solid(L, -len / 2 + 0.05, 0, -0.14, len / 2 - 0.05, rows * 0.155, 0.14, 'dirt');
  return { topY: wp(L, 0, rows * 0.16, 0)[1] };
});

/** Chain-link fence segment centred on the origin, running along X. opts: length, height, barbed, posts ('both'|'start'|'none') */
export const chain_link_fence = defProp('chain_link_fence', (L, o) => {
  const len = o.length || 3.0, h = o.height || 2.1;
  const posts = o.posts || 'both';
  const px = posts === 'none' ? [] : posts === 'start' ? [-len / 2] : [-len / 2, len / 2];
  for (const x of px) { rod(L, [x, 0, 0], [x, h + 0.05, 0], 0.045, 6, 'metal', { capB: 'metal' }); }
  rod(L, [-len / 2, h - 0.02, 0], [len / 2, h - 0.02, 0], 0.025, 4, 'metal', { up: [0, 1, 0] });
  quadUV(L, [-len / 2, 0.03, 0], [len / 2, 0.03, 0], [len / 2, h, 0], [-len / 2, h, 0], 'p_fence', [0, 0, len / 0.5, h / 0.5], { collide: true });
  if (o.barbed) {
    for (const x of px) beam(L, [x, h, 0], [x, h + 0.42, -0.3], 0.03, 0.03, 'metal');
    for (let k = 0; k < 3; k++) cable(L, [[-len / 2, h + 0.14 * (k + 1), -0.1 * (k + 1)], [len / 2, h + 0.14 * (k + 1), -0.1 * (k + 1)]], 0.02);
  }
  for (const x of px) solid(L, x - 0.05, 0, -0.05, x + 0.05, h, 0.05, 'metal');
  return { height: h };
});

// ---------------------------------------------------------------- vegetation
export const hedge = defProp('hedge', (L, o, r) => {
  const len = o.length || 2.0, h = o.height || 1.1, d = o.depth || 0.8;
  const t = rgb(o.color !== undefined ? o.color : mix([0.85, 0.95, 0.8], [0.7, 0.8, 0.6], r()));
  const hx = len / 2, hz = d / 2;
  const rect = (x, y, z) => [[-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]];
  loft(L, rect(hx, 0, hz), rect(hx + 0.04, h * 0.8, hz + 0.04), 'p_leaf', { tint: t });
  loft(L, rect(hx + 0.04, h * 0.8, hz + 0.04), rect(hx - 0.08, h, hz - 0.1), 'p_leaf', { tint: t, capB: 'p_leaf' });
  solid(L, -hx + 0.1, 0, -hz + 0.1, hx - 0.1, h - 0.1, hz - 0.1, 'grass', { bullet: false });
  return { topY: wp(L, 0, h, 0)[1] };
});

export const bush = defProp('bush', (L, o, r) => {
  const s = o.size || 1;
  const t = rgb(o.color !== undefined ? o.color : mix([0.85, 1, 0.8], [0.7, 0.75, 0.55], r()));
  blob(L, 0, 0.45 * s, 0, 0.7 * s, 0.5 * s, 0.65 * s, 6, 'p_leaf', { rng: r, tint: t, jitter: 0.18 });
  blob(L, 0.35 * s, 0.35 * s, 0.25 * s, 0.45 * s, 0.35 * s, 0.45 * s, 5, 'p_leaf', { rng: r, tint: mul(t, 0.9), jitter: 0.2 });
  if (o.solid) solid(L, -0.4 * s, 0, -0.4 * s, 0.4 * s, 0.7 * s, 0.4 * s, 'grass', { bullet: false });
  return { topY: wp(L, 0, 0.95 * s, 0)[1] };
});

/** Southern live oak (default) or generic round tree. opts: size, variant 'oak'|'generic', moss (default true for oak) */
export const tree = defProp('tree', (L, o, r) => {
  const s = o.size || 1;
  const oak = (o.variant || 'oak') === 'oak';
  const leaf = rgb(o.color !== undefined ? o.color : oak ? [0.78, 0.88, 0.72] : [0.85, 0.98, 0.7]);
  const top = [range(r, -0.3, 0.3) * s, (oak ? 2.6 : 3.2) * s, range(r, -0.3, 0.3) * s];
  rod(L, [0, -0.1, 0], top, 0.4 * s, 6, 'p_bark', { r2: 0.28 * s, uvs: 'cyl', capB: false });
  const limbs = [];
  const nl = oak ? 5 : 3;
  for (let i = 0; i < nl; i++) {
    const a = i / nl * TAU + range(r, -0.4, 0.4);
    const reach = (oak ? range(r, 2.6, 4.0) : range(r, 1.0, 1.8)) * s;
    const end = [top[0] + Math.cos(a) * reach, top[1] + (oak ? range(r, 1.0, 2.4) : range(r, 1.6, 2.6)) * s, top[2] + Math.sin(a) * reach];
    rod(L, top, end, 0.2 * s, 5, 'p_bark', { r2: 0.07 * s, uvs: 'cyl' });
    limbs.push(end);
  }
  for (const e of limbs) blob(L, e[0], e[1] + 0.3 * s, e[2], (oak ? range(r, 2.0, 2.6) : range(r, 1.6, 2.1)) * s, (oak ? range(r, 1.1, 1.4) : range(r, 1.4, 1.8)) * s, (oak ? range(r, 2.0, 2.6) : range(r, 1.6, 2.1)) * s, 6, 'p_leaf', { rng: r, tint: mix(leaf, mul(leaf, 0.75), r()), jitter: 0.16 });
  blob(L, top[0], top[1] + (oak ? 3.0 : 3.6) * s, top[2], (oak ? 2.6 : 2.2) * s, (oak ? 1.5 : 2.0) * s, (oak ? 2.6 : 2.2) * s, 6, 'p_leaf', { rng: r, tint: leaf, jitter: 0.14 });
  if (oak && o.moss !== false) {
    for (const e of limbs) for (let k = 0; k < 2; k++) {
      const a = range(r, 0, TAU), d = range(r, 0.6, 1.6) * s;
      crossCards(L, e[0] + Math.cos(a) * d, e[1] - 1.9 * s, e[2] + Math.sin(a) * d, 0.9 * s, 1.6 * s, C('moss'), { count: 1, angle: range(r, 0, PI) });
    }
  }
  solid(L, -0.32 * s, 0, -0.32 * s, 0.32 * s, 2.4 * s, 0.32 * s, 'wood');
  return { topY: wp(L, 0, top[1] + 4.5 * s, 0)[1] };
});

/** Cabbage palmetto palm. opts: height (default 7) */
export const palm_tree = defProp('palm_tree', (L, o, r) => {
  const h = o.height || range(r, 6, 8);
  const lean = [range(r, -0.6, 0.6), range(r, -0.6, 0.6)];
  const pts = [[0, 0, 0], [lean[0] * 0.3, h * 0.4, lean[1] * 0.3], [lean[0] * 0.75, h * 0.75, lean[1] * 0.75], [lean[0], h, lean[1]]];
  for (let i = 0; i < 3; i++) rod(L, pts[i], pts[i + 1], 0.2 - i * 0.02, 6, 'p_palmBark', { r2: 0.18 - i * 0.02, uvs: 'cyl' });
  const c = pts[3];
  blob(L, c[0], c[1], c[2], 0.32, 0.4, 0.32, 5, 'p_bark', { rng: r, tint: [0.7, 0.6, 0.45] });
  const fr = C('frond');
  const nf = 9;
  for (let i = 0; i < nf; i++) {
    const a = i / nf * TAU + range(r, -0.2, 0.2);
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz * 0.38, pz = dx * 0.38;
    const droop = range(r, 0.2, 0.9);
    const p0 = [c[0], c[1] + 0.2, c[2]], p1 = [c[0] + dx * 1.4, c[1] + 0.55 - droop * 0.2, c[2] + dz * 1.4], p2 = [c[0] + dx * 2.7, c[1] - 0.2 - droop, c[2] + dz * 2.7];
    const t = mix([1, 1, 1], [0.8, 0.75, 0.55], r() * 0.6);
    quadUV(L, [p0[0] - px * 0.5, p0[1], p0[2] - pz * 0.5], [p0[0] + px * 0.5, p0[1], p0[2] + pz * 0.5], [p1[0] + px, p1[1], p1[2] + pz], [p1[0] - px, p1[1], p1[2] - pz], 'p_cards', subR(fr, 0, 1, 1, 0.5), { tint: t });
    quadUV(L, [p1[0] - px, p1[1], p1[2] - pz], [p1[0] + px, p1[1], p1[2] + pz], [p2[0] + px * 0.4, p2[1], p2[2] + pz * 0.4], [p2[0] - px * 0.4, p2[1], p2[2] - pz * 0.4], 'p_cards', subR(fr, 0, 0.5, 1, 0), { tint: t });
  }
  solid(L, -0.18, 0, -0.18, 0.18, 2.5, 0.18, 'wood');
  return { topY: wp(L, c[0], c[1] + 0.6, c[2])[1] };
});

export const planter = defProp('planter', (L, o, r) => {
  const w = o.width || 1.2, h = o.height || 0.6;
  const mat = o.material || 'concreteWarm';
  if (o.round) {
    rod(L, [0, 0, 0], [0, h, 0], w / 2 * 0.9, 8, mat, { r2: w / 2, uvs: 'cyl' });
    rod(L, [0, h - 0.1, 0], [0, h, 0], w / 2 - 0.08, 8, mat, { inward: true });
    rod(L, [0, h - 0.12, 0], [0, h - 0.1, 0], w / 2 - 0.08, 8, 'dirt', { capB: 'dirt' });
    loft(L, ringPts(V3(0, h, 0), V3(1, 0, 0), V3(0, 0, 1), w / 2, 8), ringPts(V3(0, h, 0), V3(1, 0, 0), V3(0, 0, 1), w / 2 - 0.08, 8), mat, { want: [0, 1, 0] });
  } else {
    box(L, -w / 2, 0, -w / 2, w / 2, h, w / 2, mat, { faces: { py: false } });
    for (const [x0, z0, x1, z1] of [[-w / 2, -w / 2, w / 2, -w / 2 + 0.08], [-w / 2, w / 2 - 0.08, w / 2, w / 2], [-w / 2, -w / 2 + 0.08, -w / 2 + 0.08, w / 2 - 0.08], [w / 2 - 0.08, -w / 2 + 0.08, w / 2, w / 2 - 0.08]]) quad(L, [x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], mat);
    box(L, -w / 2 + 0.08, h - 0.1, -w / 2 + 0.08, w / 2 - 0.08, h - 0.08, w / 2 - 0.08, 'dirt', { faces: { ny: false, px: false, nx: false, pz: false, nz: false } });
  }
  if (o.plant !== false) blob(L, 0, h + 0.3, 0, w * 0.42, 0.45, w * 0.42, 6, 'p_leaf', { rng: r, tint: [0.8, 0.95, 0.75], jitter: 0.2 });
  solid(L, -w / 2 + 0.05, 0, -w / 2 + 0.05, w / 2 - 0.05, h - 0.02, w / 2 - 0.05, 'concrete');
  return { topY: wp(L, 0, h, 0)[1] };
});

// ---------------------------------------------------------------- signage on the street
function billboardMat(L, text, color) {
  return canvasMat(L, 'bb:' + text + ':' + color, 128, 48, (g) => {
    const base = rgb(color);
    const c = `rgb(${(base[0] * 255) | 0},${(base[1] * 255) | 0},${(base[2] * 255) | 0})`;
    g.fill(c);
    for (let y = 0; y < 48; y++) g.rect(`rgba(0,0,0,${y / 48 * 0.35})`, 0, y, 128, 1);
    g.circle(0xf0d060, 108, 14, 10); g.rect(0xffffff, 0, 38, 128, 10);
    const lines = String(text).split('\n');
    lines.forEach((ln, i) => g.text(ln, 54, 11 + i * 15, 13, 0xffffff, { maxW: 100, outline: 0x101010, outlineW: 2 }));
    g.text('NEXT EXIT  -  OPEN 24 HRS', 64, 43.5, 7, 0x202020, { maxW: 120 });
    g.stains(0x302010, 8, 0.15, 10); g.noise(14);
  });
}
/** Roadside billboard. opts: text (invented copy, '\n' separated), color, light (adds floodlights) */
export const billboard = defProp('billboard', (L, o) => {
  const text = o.text || 'COLD BEER\nHOT WINGS';
  const W = o.width || 8, H = 3, y0 = 4.6;
  for (const x of [-W * 0.3, W * 0.3]) { box(L, x - 0.15, 0, -0.3, x + 0.15, y0 + H, -0.1, 'metalDark'); box(L, x - 0.04, 0, -0.4, x + 0.04, y0 + H, 0, 'metalDark'); }
  box(L, -W / 2 - 0.1, y0 - 0.1, -0.12, W / 2 + 0.1, y0 + H + 0.1, 0, 'metalDark');
  panel(L, billboardMat(L, text, o.color !== undefined ? o.color : 0x2a5a9a), [0, 0, 1, 1], 0, y0 + H / 2, 0.005, W, H, 'pz');
  box(L, -W / 2, y0 - 0.2, 0, W / 2, y0 - 0.15, 0.8, 'metalDiamond');
  for (let i = 0; i < 4; i++) {
    const x = -W / 2 + W * (i + 0.5) / 4;
    beam(L, [x, y0 - 0.15, 0.1], [x, y0 - 0.15, 1.1], 0.04, 0.04, 'metalDark');
    box(L, x - 0.12, y0 - 0.3, 1.0, x + 0.12, y0 - 0.1, 1.2, 'metalDark');
    if (o.light) lamp(L, o, [x, y0, 1.3], 0xffe0b0, 6, 0.8, { shadows: false });
  }
  solid(L, -W * 0.3 - 0.15, 0, -0.4, -W * 0.3 + 0.15, y0 + H, 0, 'metal');
  solid(L, W * 0.3 - 0.15, 0, -0.4, W * 0.3 + 0.15, y0 + H, 0, 'metal');
  solid(L, -W / 2 - 0.1, y0 - 0.1, -0.12, W / 2 + 0.1, y0 + H + 0.1, 0, 'metal');
  return { topY: wp(L, 0, y0 + H, 0)[1] };
});

function stripeMat(L, color) {
  const c = rgb(color);
  return canvasMat(L, 'awning:' + color, 32, 32, (g) => { g.fill(0xf0eee6); for (let x = 0; x < 32; x += 16) g.rect(`rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`, x, 0, 8, 32); g.stains(0x302820, 6, 0.12, 6); g.noise(12); }, { clamp: false, doubleSide: true, surf: 4, scale: 1 });
}
/** Wall-mounted striped awning. (x,y,z) = wall at floor level. opts: width, depth, height (top edge), color */
export const awning = defProp('awning', (L, o) => {
  const w = o.width || 3, d = o.depth || 1.2, h = o.height || 2.8;
  const m = stripeMat(L, o.color !== undefined ? o.color : 0x9a1e1e);
  const hw = w / 2, drop = 0.55;
  quadUV(L, [-hw, h - drop, d], [hw, h - drop, d], [hw, h, 0], [-hw, h, 0], m, [0, 0, w, 1.2]);
  quadUV(L, [-hw, h - drop - 0.28, d], [hw, h - drop - 0.28, d], [hw, h - drop, d], [-hw, h - drop, d], m, [0, 0, w, 0.25]);
  for (const s of [-1, 1]) triTo(L, [s * hw, h, 0], [s * hw, h - drop, d], [s * hw, h - drop - 0.28, d], m, V3(s, 0, 0), { uv: [[0, 1], [1, 0.5], [1, 0]] });
  for (const s of [-1, 1]) beam(L, [s * (hw - 0.05), h - 0.9, 0], [s * (hw - 0.05), h - drop - 0.02, d - 0.05], 0.03, 0.03, 'metalDark');
  return {};
});

/** Wooden utility pole with crossarm, insulators, transformer and optional sagging wires (along local Z). */
export const utility_pole = defProp('utility_pole', (L, o) => {
  const h = o.height || 9.5;
  rod(L, [0, 0, 0], [0, h, 0], 0.16, 6, 'woodDark', { r2: 0.12, uvs: 'cyl', capB: 'woodDark' });
  box(L, -1.2, h - 0.75, -0.06, 1.2, h - 0.63, 0.06, 'woodDark');
  beam(L, [-0.7, h - 1.4, 0], [-0.05, h - 0.7, 0], 0.05, 0.05, 'metalDark');
  beam(L, [0.7, h - 1.4, 0], [0.05, h - 0.7, 0], 0.05, 0.05, 'metalDark');
  const xs = [-1.05, -0.35, 0.35, 1.05];
  for (const x of xs) rod(L, [x, h - 0.63, 0], [x, h - 0.45, 0], 0.05, 4, 'p_porcelain', { r2: 0.035, capB: 'p_porcelain', tint: [0.75, 0.82, 0.78] });
  vcyl(L, 0, h - 2.6, 0.38, 0.26, 0.75, 8, 'p_paint', { tint: [0.55, 0.58, 0.58] });
  cbox(L, 0, h - 2.2, 0.17, 0.12, 0.3, 0.12, 'metalDark');
  for (let y = 2.4, k = 0; y < h - 1; y += 0.6, k++) { const s = k % 2 ? 1 : -1; box(L, s * 0.12, y, -0.015, s * 0.3, y + 0.03, 0.015, 'metalDark', { faces: { px: false, nx: false, ny: false } }); }
  if (o.wires !== false) {
    const span = o.span || 10;
    for (const x of xs) {
      const p = [x, h - 0.45, 0];
      cable(L, sag([x, p[1], -span / 2], p, 0.45, 3), 0.025);
      cable(L, sag(p, [x, p[1], span / 2], 0.45, 3), 0.025);
    }
  }
  solid(L, -0.14, 0, -0.14, 0.14, h - 0.5, 0.14, 'wood');
  return { topY: wp(L, 0, h, 0)[1] };
});

export const generator = defProp('generator', (L, o) => {
  const t = rgb(o.color !== undefined ? o.color : 0xd0a020);
  box(L, -0.5, 0.42, -1.0, 0.5, 1.55, 0.95, 'p_paint', { tint: t });
  box(L, -0.52, 1.55, -1.02, 0.52, 1.62, 0.97, 'p_paint', { tint: mul(t, 0.8) });
  for (const s of [-1, 1]) for (const z of [-0.5, 0.35]) panel(L, 'p_decal', R('vent'), s * 0.505, 1.0, z, 0.6, 0.7, s > 0 ? 'px' : 'nx');
  panel(L, 'p_decal', R('generator'), 0, 1.1, 0.955, 0.8, 0.4, 'pz');
  panel(L, 'p_decal', R('hazard'), 0, 0.5, 0.955, 1.0, 0.12, 'pz');
  rod(L, [0.25, 1.62, -0.6], [0.25, 2.05, -0.6], 0.06, 6, 'metalDark', { capB: 'black' });
  vcyl(L, -0.25, 1.62, -0.5, 0.07, 0.05, 6, 'p_chrome');
  box(L, -0.35, 0.3, -1.1, 0.35, 0.42, 1.05, 'metalDark');
  beam(L, [0, 0.36, 1.05], [0, 0.36, 1.9], 0.1, 0.1, 'metalDark');
  rod(L, [0, 0.0, 1.75], [0, 0.6, 1.75], 0.04, 5, 'metalDark');
  for (const s of [-1, 1]) wheel(L, s * 0.62, 0.3, -0.2, 0.3, 0.18, 'wheelSteel');
  solid(L, -0.5, 0, -1.0, 0.5, 1.6, 0.95, 'metal');
  return { topY: wp(L, 0, 1.62, 0)[1], panel: wp(L, 0, 1.1, 1.2) };
});

/** Tube & plank scaffolding. opts: bays (default 2), levels (default 2), width (bay width, 2.4) */
export const scaffolding = defProp('scaffolding', (L, o) => {
  const bays = o.bays || 2, lv = o.levels || 2, bw = o.width || 2.4, d = 1.2, lh = 2.0;
  const W = bays * bw, x0 = -W / 2, top = lv * lh + 1.0;
  const tube = 'p_paint', tt = [0.65, 0.66, 0.68], E = { tint: tt, ends: false };
  for (let i = 0; i <= bays; i++) for (const z of [0, d]) {
    const x = x0 + i * bw;
    beam(L, [x, 0, z], [x, top, z], 0.05, 0.05, tube, { tint: tt, faces: { nz: false } });
    panel(L, 'metalDark', null, x, 0.01, z, 0.2, 0.2, 'py');
  }
  const platforms = [];
  for (let k = 1; k <= lv; k++) {
    const y = k * lh;
    for (const z of [0, d]) { beam(L, [x0, y, z], [x0 + W, y, z], 0.045, 0.045, tube, E); beam(L, [x0, y + 1.0, z], [x0 + W, y + 1.0, z], 0.04, 0.04, tube, { ...E, tint: [0.75, 0.6, 0.2] }); }
    for (let i = 0; i <= bays; i++) beam(L, [x0 + i * bw, y, 0], [x0 + i * bw, y, d], 0.045, 0.045, tube, E);
    box(L, x0, y + 0.03, 0.04, x0 + W, y + 0.08, d - 0.04, 'woodFloor', { tint: [1.1, 1.0, 0.85] });
    platforms.push(wp(L, 0, y + 0.08, d / 2));
    solid(L, x0, y, 0, x0 + W, y + 0.08, d, 'wood');
  }
  for (let i = 0; i < bays; i++) { const xa = x0 + i * bw; beam(L, [xa, 0.1, 0], [xa + bw, lh, 0], 0.035, 0.035, tube, E); if (lv > 1) beam(L, [xa + bw, lh, 0], [xa, 2 * lh, 0], 0.035, 0.035, tube, E); }
  for (let i = 0; i <= bays; i++) for (const z of [0, d]) solid(L, x0 + i * bw - 0.04, 0, z - 0.04, x0 + i * bw + 0.04, top, z + 0.04, 'metal');
  return { platforms, topY: wp(L, 0, lv * lh + 0.08, 0)[1] };
});

export const pallet = defProp('pallet', (L, o) => {
  const w = 1.2, d = 1.0, t = o.material || 'wood';
  const tint = [1.15, 1.05, 0.9];
  for (const x of [-0.55, 0, 0.55]) box(L, x - 0.05, 0, -d / 2, x + 0.05, 0.12, d / 2, t, { tint: [0.9, 0.8, 0.7], faces: { ny: false, py: false } });
  for (let i = 0; i < 5; i++) { const z = -d / 2 + 0.06 + i * (d - 0.12) / 4; box(L, -w / 2, 0.12, z - 0.06, w / 2, 0.144, z + 0.06, t, { tint, faces: { ny: false, px: false, nx: false } }); }
  solid(L, -w / 2, 0, -d / 2, w / 2, 0.14, d / 2, 'wood');
  return { topY: wp(L, 0, 0.144, 0)[1] };
});

function crateMat(L) {
  return canvasMat(L, 'crate', 32, 32, (g) => {
    g.fill(0x8a6a3e);
    for (let y = 0; y < 32; y += 6) { g.rect(0x5a4024, 0, y, 32, 1); }
    g.stroke(0x5a4024, 0, 0, 32, 32, 1);
    g.rect(0xa8844e, 1, 1, 30, 3); g.rect(0xa8844e, 1, 28, 30, 3); g.rect(0xa8844e, 1, 1, 3, 30); g.rect(0xa8844e, 28, 1, 3, 30);
    g.line(0xa8844e, 4, 27, 27, 4, 3);
    g.stains(0x3a2a18, 5, 0.18, 6); g.noise(18);
  }, { surf: 3 });
}
/** Wooden crate. opts: size (edge, 1.0), stencil ('ceda' adds a logo) */
export const crate = defProp('crate', (L, o) => {
  const s = o.size || 1.0, h = s / 2;
  const m = crateMat(L);
  const full = [0, 0, 1, 1];
  for (const [d, x, y, z] of [['pz', 0, h, h], ['nz', 0, h, -h], ['px', h, h, 0], ['nx', -h, h, 0], ['py', 0, s, 0]]) panel(L, m, full, x, y, z, s, s, d, { collide: true });
  if (o.stencil === 'ceda') for (const [d, x, z] of [['pz', 0, h + 0.006], ['px', h + 0.006, 0]]) panel(L, 'p_decal', R('ceda'), x, h, z, s * 0.8, s * 0.4, d);
  return { topY: wp(L, 0, s, 0)[1] };
});

export const barrel = defProp('barrel', (L, o, r) => {
  const t = rgb(o.color !== undefined ? o.color : pick(r, [0x1e3c8a, 0x9a1e14, 0xc8a020, 0x3a5a2a, 0x2a2a2a]));
  const mat = o.rust ? 'p_rust' : 'p_paint';
  const tint = o.rust ? [1, 1, 1] : t;
  rod(L, [0, 0, 0], [0, 0.88, 0], 0.29, 8, mat, { tint, uvs: 'cyl', capB: mat, phase: PI / 8 });
  for (const y of [0.29, 0.59]) rod(L, [0, y - 0.015, 0], [0, y + 0.015, 0], 0.305, 8, mat, { tint: mul(tint, 0.8), phase: PI / 8 });
  rod(L, [0, 0.87, 0], [0, 0.9, 0], 0.3, 8, mat, { tint: mul(tint, 0.85), phase: PI / 8, capB: mat });
  cbox(L, 0.15, 0.9, 0.05, 0.06, 0.02, 0.06, 'metalDark');
  if (o.hazard) panel(L, 'p_decal', R('flammable'), 0, 0.45, 0.295, 0.22, 0.22, 'pz');
  solid(L, -0.26, 0, -0.26, 0.26, 0.86, 0.26, 'metal');
  return { topY: wp(L, 0, 0.9, 0)[1] };
});

export const cardboard_boxes = defProp('cardboard_boxes', (L, o, r) => {
  const n = o.count || 3 + ((r() * 3) | 0);
  const spots = [[-0.3, -0.25], [0.32, -0.2], [0, 0.3], [-0.35, 0.35], [0.4, 0.38]];
  let topY = 0;
  for (let i = 0; i < n; i++) {
    const sx = range(r, 0.35, 0.6), sy = range(r, 0.25, 0.45), sz = range(r, 0.3, 0.5);
    let x, z, y = 0;
    if (i < Math.min(n, 3)) [x, z] = spots[i];
    else { [x, z] = spots[i - 3]; y = 0.42; }
    const tint = mix([1, 1, 1], [0.8, 0.72, 0.6], r());
    pushR(L, [x, y, z], 0, range(r, -0.4, 0.4), 0);
    box(L, -sx / 2, 0, -sz / 2, sx / 2, sy, sz / 2, 'p_cardboard', { tint, collide: true, faces: { ny: false } });
    panel(L, 'p_decal', R('tape'), 0, sy + 0.004, 0, 0.07, sz, 'py');
    if (r() < 0.6) panel(L, 'p_decal', R('cardboardPrint'), 0, sy / 2, sz / 2 + 0.004, 0.14, 0.14, 'pz');
    L.pop();
    topY = Math.max(topY, y + sy);
  }
  return { topY: wp(L, 0, topY, 0)[1] };
});

export const tire_stack = defProp('tire_stack', (L, o, r) => {
  const n = o.count || 4;
  for (let i = 0; i < n; i++) {
    const x = range(r, -0.05, 0.05), z = range(r, -0.05, 0.05), y = i * 0.24;
    rod(L, [x, y, z], [x, y + 0.24, z], 0.37, 8, 'p_tire', { uvs: 'cyl', capB: i === n - 1 ? 'p_decal' : false, capRectB: R('tireTop'), phase: range(r, 0, 1) });
  }
  solid(L, -0.34, 0, -0.34, 0.34, n * 0.24, 0.34, 'plastic');
  return { topY: wp(L, 0, n * 0.24, 0)[1] };
});

export const shopping_cart = defProp('shopping_cart', (L, o, r) => {
  const b0 = [[-0.27, 0.45, -0.45], [0.27, 0.45, -0.45], [0.24, 0.45, 0.45], [-0.24, 0.45, 0.45]];
  const b1 = [[-0.29, 0.98, -0.5], [0.29, 0.98, -0.5], [0.27, 0.98, 0.5], [-0.27, 0.98, 0.5]];
  loft(L, b0, b1, 'p_wire', { capA: 'p_wire', uvs: 'cyl', scale: 0.12 });
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; beam(L, b1[i], b1[j], 0.02, 0.02, 'p_chrome', { ends: false }); }
  rod(L, [-0.3, 1.05, -0.58], [0.3, 1.05, -0.58], 0.025, 4, 'p_flat', { tint: [0.7, 0.1, 0.1] });
  for (const s of [-1, 1]) beam(L, [s * 0.29, 0.98, -0.5], [s * 0.3, 1.05, -0.58], 0.02, 0.02, 'p_chrome', { ends: false });
  quadUV(L, [-0.22, 0.14, 0.42], [0.22, 0.14, 0.42], [0.22, 0.14, -0.42], [-0.22, 0.14, -0.42], 'p_wire', [0, 0, 4, 7]);
  for (const [x, z] of [[-0.24, -0.42], [0.24, -0.42], [-0.21, 0.42], [0.21, 0.42]]) { beam(L, [x, 0.08, z], [x * 1.08, 0.46, z * 1.05], 0.025, 0.025, 'p_chrome', { ends: false }); cbox(L, x, 0, z, 0.03, 0.09, 0.08, 'p_rubber', { faces: { ny: false, py: false } }); }
  if (o.tipped) { /* reserved */ }
  solid(L, -0.28, 0, -0.5, 0.28, 0.98, 0.5, 'metal', { bullet: false });
  return {};
});

// ---------------------------------------------------------------- rooftop
export const ac_unit = defProp('ac_unit', (L, o) => {
  const t = rgb(o.color !== undefined ? o.color : 0xb8b4a6);
  box(L, -1.1, 0.12, -0.7, 1.1, 1.3, 0.7, 'p_paint', { tint: t });
  box(L, -1.15, 0, -0.75, 1.15, 0.12, 0.75, 'metalDark');
  for (const s of [-1, 1]) { panel(L, 'p_decal', R('vent'), 0, 0.7, s * 0.702, 1.9, 0.9, s > 0 ? 'pz' : 'nz'); panel(L, 'p_decal', R('vent'), s * 1.102, 0.7, 0, 1.1, 0.9, s > 0 ? 'px' : 'nx'); }
  for (const x of [-0.5, 0.5]) { vcyl(L, x, 1.3, 0, 0.42, 0.08, 8, 'metalDark', { capB: 'p_decal', capRectB: R('burner') }); }
  box(L, 0.7, 0.4, 0.7, 1.0, 0.9, 0.85, 'metalDark');
  box(L, -0.35, 0, -1.3, 0.35, 0.7, -0.7, 'metal');
  solid(L, -1.1, 0, -0.7, 1.1, 1.36, 0.7, 'metal');
  return { topY: wp(L, 0, 1.38, 0)[1] };
});

export const roof_vent = defProp('roof_vent', (L, o) => {
  box(L, -0.35, 0, -0.35, 0.35, 0.12, 0.35, 'metal');
  vcyl(L, 0, 0.12, 0, 0.14, 0.5, 6, 'metal', { capB: false });
  if (o.variant === 'turbine') {
    rod(L, [0, 0.62, 0], [0, 0.92, 0], 0.26, 8, 'shutter', { uvs: 'cyl' });
    rod(L, [0, 0.92, 0], [0, 1.02, 0], 0.26, 8, 'metal', { r2: 0.05, capB: 'metal' });
  } else rod(L, [0, 0.58, 0], [0, 0.8, 0], 0.32, 8, 'metal', { r2: 0.04, capA: 'metalDark', capB: 'metal' });
  solid(L, -0.16, 0, -0.16, 0.16, 0.7, 0.16, 'metal');
  return {};
});

export const water_tower = defProp('water_tower', (L, o) => {
  const legH = o.legHeight || 5, tr = 2.3, th = 3.4;
  const tankMat = canvasMat(L, 'tankWood', 32, 64, (g) => {
    g.fill(0x6a5038); for (let x = 0; x < 32; x += 4) g.rect(0x4a3624, x, 0, 1, 64);
    for (const y of [8, 30, 54]) { g.rect(0x202020, 0, y, 32, 2); g.rect(0x404040, 0, y + 2, 32, 1); }
    g.stains(0x2a1c10, 8, 0.2, 8); g.noise(14);
  }, { clamp: false, scale: th, surf: 3 });
  for (const [x, z] of [[-1.7, -1.7], [1.7, -1.7], [1.7, 1.7], [-1.7, 1.7]]) beam(L, [x * 1.1, 0, z * 1.1], [x, legH, z], 0.18, 0.18, 'metalDark', { ends: false });
  for (const [a, b] of [[[-1.8, 0.4, -1.8], [1.75, legH - 0.4, -1.75]], [[1.8, 0.4, -1.8], [1.75, legH - 0.4, 1.75]], [[1.8, 0.4, 1.8], [-1.75, legH - 0.4, 1.75]], [[-1.8, 0.4, 1.8], [-1.75, legH - 0.4, -1.75]]]) cable(L, [a, b], 0.04);
  box(L, -2.2, legH, -2.2, 2.2, legH + 0.15, 2.2, 'metalDiamond');
  rod(L, [0, legH + 0.15, 0], [0, legH + 0.15 + th, 0], tr, 12, tankMat, { uvs: 'cyl', scale: th });
  rod(L, [0, legH + 0.15 + th, 0], [0, legH + 1.25 + th, 0], tr + 0.15, 12, 'roof', { r2: 0.08, capB: 'roof' });
  vcyl(L, 0, legH + 1.2 + th, 0, 0.06, 0.4, 4, 'metalDark');
  for (let k = 0; k < 4; k++) { const y0 = k * (legH + th) / 4, y1 = (k + 1) * (legH + th) / 4; const x = k < 2 ? 2.0 : 2.36; quadUV(L, [x, y0, 0.22], [x, y0, -0.22], [x, y1, -0.22], [x, y1, 0.22], 'p_cards', C('ladder')); }
  for (const [x, z] of [[-1.7, -1.7], [1.7, -1.7], [1.7, 1.7], [-1.7, 1.7]]) solid(L, x - 0.1, 0, z - 0.1, x + 0.1, legH, z + 0.1, 'metal');
  solid(L, -2.2, legH, -2.2, 2.2, legH + 0.15, 2.2, 'metal');
  solid(L, -tr * 0.7, legH + 0.15, -tr * 0.7, tr * 0.7, legH + 0.1 + th, tr * 0.7, 'wood');
  return { topY: wp(L, 0, legH + th + 1.3, 0)[1], platformY: wp(L, 0, legH + 0.15, 0)[1] };
});

export const satellite_dish = defProp('satellite_dish', (L, o) => {
  const r0 = o.radius || 0.6;
  box(L, -0.3, 0, -0.3, 0.3, 0.05, 0.3, 'metalDark');
  rod(L, [0, 0.05, 0], [0, 1.0, 0], 0.04, 5, 'metal', { capB: 'metal' });
  pushR(L, [0, 1.05, 0.05], -0.5, 0, 0);
  const n = 8;
  const rim = ringPts(V3(0, 0, 0.2), V3(1, 0, 0), V3(0, 1, 0), r0, n), mid = ringPts(V3(0, 0, 0.06), V3(1, 0, 0), V3(0, 1, 0), r0 * 0.55, n), c = ringPts(V3(0, 0, 0), V3(1, 0, 0), V3(0, 1, 0), 0.08, n);
  loft(L, mid, rim, 'p_plastic', { inward: true, tint: [0.92, 0.92, 0.9] });
  loft(L, c, mid, 'p_plastic', { inward: true, tint: [0.92, 0.92, 0.9] });
  loft(L, mid, rim, 'p_plastic', { tint: [0.7, 0.7, 0.7] });
  loft(L, c, mid, 'p_plastic', { tint: [0.7, 0.7, 0.7], capA: 'p_plastic' });
  beam(L, [0, -r0 * 0.9, 0.18], [0, 0, r0 * 1.2], 0.03, 0.03, 'metal');
  cbox(L, 0, -0.06, r0 * 1.15, 0.09, 0.12, 0.14, 'p_plastic', { tint: [0.3, 0.3, 0.3] });
  L.pop();
  solid(L, -0.06, 0, -0.06, 0.06, 1.0, 0.06, 'metal');
  return {};
});

/** Wall ladder (visual; climbing handled by the game). (x,y,z) = wall at floor. opts: height */
export const ladder = defProp('ladder', (L, o) => {
  const h = o.height || 3.0, w = 0.22;
  for (const s of [-1, 1]) { box(L, s * w - 0.025, 0, 0.12, s * w + 0.025, h + 0.9, 0.17, 'p_paint', { tint: [0.5, 0.52, 0.5] }); }
  for (let y = 0.3; y < h + 0.6; y += 0.3) box(L, -w, y - 0.015, 0.13, w, y + 0.015, 0.16, 'metalDark', { faces: { px: false, nx: false, nz: false } });
  for (const y of [0.4, h - 0.2]) for (const s of [-1, 1]) box(L, s * w - 0.02, y, 0, s * w + 0.02, y + 0.04, 0.12, 'metalDark', { faces: { nz: false } });
  return { bottom: wp(L, 0, 0, 0.5), top: wp(L, 0, h, 0.15), height: h };
});

// ---------------------------------------------------------------- CEDA evacuation dressing
function ledMat(L, text) {
  return canvasMat(L, 'led:' + text, 96, 48, (g) => {
    const t = document.createElement('canvas'); t.width = 48; t.height = 24;
    const c = t.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, 48, 24);
    const lines = String(text).split('\n');
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    lines.forEach((ln, i) => { c.font = `bold ${Math.floor(22 / lines.length)}px monospace`; const mw = c.measureText(ln).width; c.save(); c.translate(24, (i + 0.5) * 24 / lines.length + 0.5); if (mw > 46) c.scale(46 / mw, 1); c.fillText(ln, 0, 0); c.restore(); });
    const d = c.getImageData(0, 0, 48, 24).data;
    g.fill(0x050505);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) {
      const on = d[(y * 48 + x) * 4] > 100;
      g.rect(on ? 0xffb020 : 0x2a1c08, x * 2, y * 2, 1, 1);
    }
  }, { unlit: true });
}
/** CEDA message board trailer. opts: text ('\n' lines, max ~3), color */
export const solar_message_sign = defProp('solar_message_sign', (L, o) => {
  const text = o.text || 'EVACUATION\nCENTER\nAHEAD';
  const t = rgb(o.color !== undefined ? o.color : 0xd88a1a);
  box(L, -0.8, 0.38, -1.2, 0.8, 0.75, 0.6, 'p_paint', { tint: t });
  beam(L, [0, 0.5, -1.2], [0, 0.5, -2.1], 0.1, 0.1, 'metalDark');
  for (const s of [-1, 1]) { wheel(L, s * 0.9, 0.32, -0.3, 0.32, 0.18, 'wheelSteel'); box(L, s * 0.8, 0.55, -0.6, s * 0.95, 0.62, 0.0, 'metalDark'); }
  for (const [x, z] of [[-0.75, 0.55], [0.75, 0.55], [-0.75, -1.15], [0.75, -1.15]]) box(L, x - 0.04, 0, z - 0.04, x + 0.04, 0.4, z + 0.04, 'metalDark');
  box(L, -0.12, 0.75, -0.12, 0.12, 2.4, 0.12, 'metalDark');
  box(L, -1.6, 2.3, -0.18, 1.6, 4.3, 0.04, 'p_paint', { tint: [0.12, 0.12, 0.12] });
  panel(L, ledMat(L, text), [0, 0, 1, 1], 0, 3.3, 0.045, 3.0, 1.8, 'pz');
  beam(L, [0, 4.3, -0.1], [0, 4.6, -0.3], 0.06, 0.06, 'metalDark');
  pushR(L, [0, 4.6, -0.3], 0.5, 0, 0);
  box(L, -0.8, -0.03, -0.55, 0.8, 0.0, 0.55, 'metalDark');
  panel(L, 'p_decal', R('solar'), 0, 0.002, 0, 1.56, 1.06, 'py');
  L.pop();
  panel(L, 'p_decal', R('ceda'), 0.81, 0.56, -0.3, 0.6, 0.3, 'px');
  solid(L, -0.8, 0, -1.2, 0.8, 0.75, 0.6, 'metal');
  solid(L, -1.6, 2.3, -0.18, 1.6, 4.3, 0.04, 'metal');
  solid(L, -0.12, 0.75, -0.12, 0.12, 2.3, 0.12, 'metal');
  return { topY: wp(L, 0, 4.3, 0)[1] };
});

/** CEDA medical frame tent, 4 x 6 m, door at +Z. opts: open (door flap rolled up), color */
export const tent = defProp('tent', (L, o) => {
  const W = 2.0, D = 3.0, wh = 2.1, rh = 3.1;
  const tint = rgb(o.color !== undefined ? o.color : 0xd8d8d0);
  const m = 'p_tent';
  if (!L.matDefs[m]) L.defMat(m, { tex: ['fabric', { color: 0xe0e0dc }], scale: 1.5, surf: 4, doubleSide: true });
  const Q = (a, b, c, d, opts = {}) => quad(L, a, b, c, d, m, { tint, collide: true, ...opts });
  // side walls (+-x), back wall, roof
  Q([W, 0, D], [W, 0, -D], [W, wh, -D], [W, wh, D]);
  Q([-W, 0, -D], [-W, 0, D], [-W, wh, D], [-W, wh, -D]);
  Q([W, 0, -D], [-W, 0, -D], [-W, wh, -D], [W, wh, -D]);
  triTo(L, [W, wh, -D], [-W, wh, -D], [0, rh, -D], m, V3(0, 0, -1), { tint, collide: true });
  Q([W, wh, D], [W, wh, -D], [0, rh, -D], [0, rh, D]);
  Q([-W, wh, -D], [-W, wh, D], [0, rh, D], [0, rh, -D]);
  // front with door opening (1.4 x 2.0)
  const dw = 0.7, dh = 2.0;
  Q([-W, 0, D], [-dw, 0, D], [-dw, wh, D], [-W, wh, D]);
  Q([dw, 0, D], [W, 0, D], [W, wh, D], [dw, wh, D]);
  Q([-dw, dh, D], [dw, dh, D], [dw, wh, D], [-dw, wh, D]);
  triTo(L, [-W, wh, D], [W, wh, D], [0, rh, D], m, V3(0, 0, 1), { tint, collide: true });
  if (o.open) {
    rod(L, [-dw - 0.05, dh + 0.1, D + 0.08], [dw + 0.05, dh + 0.1, D + 0.08], 0.09, 6, m, { up: [0, 1, 0], tint: mul(tint, 0.9), capA: m, capB: m });
  } else {
    quad(L, [-dw, 0.02, D + 0.02], [dw, 0.02, D + 0.02], [dw, dh, D + 0.02], [-dw, dh, D + 0.02], m, { tint: mul(tint, 0.92) });
    panel(L, 'p_flat', null, 0, dh / 2, D + 0.03, 0.03, dh, 'pz', { tint: [0.2, 0.2, 0.2] });
  }
  // markings
  for (const s of [-1, 1]) {
    const x = s * (W + 0.012), d = s > 0 ? 'px' : 'nx';
    panel(L, 'p_decal', R('ceda'), x, 1.25, 0, 2.6, 1.3, d);
    panel(L, 'p_flat', null, x, 0.2, 0, 6.0, 0.16, d, { tint: [0.15, 0.25, 0.6] });
  }
  panel(L, 'p_decal', R('medical'), 0, 2.45, D + 0.012, 1.6, 0.4, 'pz');
  // frame poles & guy ropes
  for (const [x, z] of [[-W, -D], [W, -D], [-W, D], [W, D]]) box(L, x - 0.03, 0, z - 0.03, x + 0.03, wh, z + 0.03, 'metalDark');
  for (const z of [-D, 0, D]) for (const s of [-1, 1]) cable(L, [[s * W, wh, z], [s * (W + 1.0), 0, z]], 0.02);
  return { door: wp(L, 0, 0, D + 0.8), center: wp(L, 0, 0, 0), topY: wp(L, 0, rh, 0)[1] };
});

export const cot = defProp('cot', (L, o) => {
  const t = rgb(o.color !== undefined ? o.color : 0x5a6a42);
  box(L, -0.34, 0.38, -0.95, 0.34, 0.42, 0.95, 'p_fabric', { tint: t });
  for (const s of [-1, 1]) rod(L, [s * 0.35, 0.4, -0.97], [s * 0.35, 0.4, 0.97], 0.02, 4, 'metal', { up: [0, 1, 0] });
  for (const z of [-0.85, 0, 0.85]) { beam(L, [-0.35, 0.4, z], [0.35, 0.0, z], 0.025, 0.025, 'metal', { ends: false }); beam(L, [0.35, 0.4, z], [-0.35, 0.0, z], 0.025, 0.025, 'metal', { ends: false }); }
  if (o.pillow !== false) blob(L, 0, 0.45, -0.75, 0.22, 0.05, 0.14, 5, 'p_fabric', { tint: [0.9, 0.9, 0.88], jitter: 0.05 });
  solid(L, -0.34, 0, -0.95, 0.34, 0.42, 0.95, 'cloth', { bullet: false });
  return { topY: wp(L, 0, 0.42, 0)[1] };
});

export const iv_stand = defProp('iv_stand', (L, o) => {
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; beam(L, [0, 0.08, 0], [Math.cos(a) * 0.3, 0.04, Math.sin(a) * 0.3], 0.03, 0.02, 'p_chrome', { ends: false, faces: { ny: false } }); cbox(L, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, 0.04, 0.04, 0.04, 'p_rubber', { faces: { ny: false } }); }
  rod(L, [0, 0.04, 0], [0, 1.95, 0], 0.015, 4, 'p_chrome', { capB: 'p_chrome' });
  for (const s of [-1, 1]) beam(L, [0, 1.9, 0], [s * 0.15, 1.95, 0], 0.012, 0.012, 'p_chrome', { ends: false });
  cbox(L, 0.15, 1.65, 0, 0.12, 0.24, 0.04, 'p_sheet');
  cable(L, [[0.15, 1.65, 0], [0.2, 1.2, 0.05], [0.25, 0.8, 0.25]], 0.01, 'p_wireBlack');
  return {};
});

// ---------------------------------------------------------------- corpses & gore
/** Static corpse. opts: pose 'back'|'front'|'sitting', blood (default true), shirt, pants, skin */
export const body = defProp('body', (L, o, r) => {
  const pose = o.pose || 'back';
  const shirt = rgb(o.shirt !== undefined ? o.shirt : pick(r, PALETTE.cloth));
  const pants = rgb(o.pants !== undefined ? o.pants : pick(r, PALETTE.pants));
  const skin = rgb(o.skin !== undefined ? o.skin : pick(r, PALETTE.skin));
  const bloody = o.bloody !== undefined ? o.bloody : r() < 0.7;
  const cm = bloody ? 'p_clothBloody' : 'p_cloth';
  const shoe = [0.12, 0.1, 0.09];
  if (o.blood !== false) L.floorDecal(range(r, -0.2, 0.2), 0, pose === 'sitting' ? 0.3 : -0.2, range(r, 1.2, 1.8), range(r, 0, TAU), 'blood', { seed: (r() * 4) | 0 });
  const limb = (pos, ry, rx, sx, sy, sz, mat, tint, rz = 0) => {
    pushR(L, pos, rx, ry, rz);
    if (rx === HP) box(L, -sx / 2, 0, -sz, sx / 2, sy, 0, mat, { tint, faces: { pz: false } });
    else box(L, -sx / 2, 0, -sz / 2, sx / 2, sy, sz / 2, mat, { tint });
    L.pop();
  };
  if (pose === 'sitting') {
    // back against a wall at z=0, legs toward +Z
    pushR(L, [0, 0, 0.12], -0.15, 0, 0);
    box(L, -0.18, 0.0, -0.11, 0.18, 0.22, 0.13, 'p_cloth', { tint: pants });
    box(L, -0.2, 0.2, -0.12, 0.2, 0.75, 0.12, cm, { tint: shirt });
    pushR(L, [0, 0.78, 0.02], 0.5, range(r, -0.4, 0.4), range(r, -0.3, 0.3));
    box(L, -0.1, 0, -0.11, 0.1, 0.24, 0.11, 'p_skin', { tint: skin });
    panel(L, 'p_decal', R(r() < 0.5 ? 'deadFaceA' : 'deadFaceB'), 0, 0.12, 0.112, 0.2, 0.24, 'pz');
    panel(L, 'p_decal', R('hairBack'), 0, 0.241, 0, 0.2, 0.22, 'py');
    L.pop();
    for (const s of [-1, 1]) { limb([s * 0.24, 0.72, 0], 0, 0.2, 0.1, -0.6, 0.1, cm, shirt, s * -0.1); }
    L.pop();
    for (const s of [-1, 1]) { limb([s * 0.1, 0.06, 0.2], s * range(r, 0.05, 0.3), HP, 0.14, 0.85, 0.15, 'p_cloth', pants); }
    for (const s of [-1, 1]) cbox(L, s * 0.1 + s * 0.12, 0, 1.05, 0.1, 0.16, 0.24, 'p_rubber', { tint: shoe });
    return {};
  }
  const up = pose === 'back';
  // lying: head toward -Z
  box(L, -0.2, 0, -0.55, 0.2, 0.2, 0.05, cm, { tint: shirt, faces: { ny: false } });
  box(L, -0.18, 0, 0.05, 0.18, 0.18, 0.28, 'p_cloth', { tint: pants, faces: { ny: false } });
  const ha = range(r, -0.4, 0.4);
  pushR(L, [0, 0, -0.62], 0, ha, 0);
  box(L, -0.1, 0, -0.24, 0.1, 0.2, 0, 'p_skin', { tint: skin, faces: { ny: false } });
  panel(L, 'p_decal', up ? R(r() < 0.5 ? 'deadFaceA' : 'deadFaceB') : R('hairBack'), 0, 0.201, -0.12, 0.2, 0.24, 'py');
  L.pop();
  for (const s of [-1, 1]) {
    const splay = range(r, 0.05, 0.35);
    limb([s * 0.1, 0, 0.26], s * splay, HP, 0.15, 0.78, 0.14, 'p_cloth', pants);
    const fz = 0.26 + Math.cos(splay) * 0.8, fx = s * 0.1 + s * Math.sin(splay) * 0.8;
    cbox(L, fx, 0, fz, 0.11, up ? 0.2 : 0.1, up ? 0.12 : 0.24, 'p_rubber', { tint: shoe });
    const armA = range(r, 0.2, 1.6);
    limb([s * 0.22, 0, -0.48], s * armA, HP, 0.11, 0.62, 0.1, cm, shirt);
    const hx = s * 0.22 + s * Math.sin(armA) * 0.62, hz = -0.48 + Math.cos(armA) * 0.62;
    cbox(L, hx, 0, hz, 0.09, 0.07, 0.12, 'p_skin', { tint: skin });
  }
  return {};
});

export const body_bag = defProp('body_bag', (L, o, r) => {
  const t = rgb(o.color !== undefined ? o.color : 0x1c1c1e);
  const sec = (z, w, h) => { const p = []; for (let i = 0; i < 6; i++) { const a = (i + 0.5) / 6 * TAU; p.push([Math.cos(a) * w, Math.max(0, h * 0.5 + Math.sin(a) * h * 0.55), z]); } return p; };
  const rings = [sec(-0.95, 0.12, 0.08), sec(-0.7, 0.24, 0.2), sec(-0.35, 0.3, 0.24), sec(0.4, 0.26, 0.2), sec(0.92, 0.14, 0.12)];
  for (let i = 0; i < rings.length - 1; i++) loft(L, rings[i], rings[i + 1], 'p_leather', { tint: t, capA: i === 0 ? 'p_leather' : false, capB: i === rings.length - 2 ? 'p_leather' : false });
  const zy = [[-0.7, 0.21], [-0.35, 0.255], [0.4, 0.21], [0.85, 0.13]];
  const zr = R('zipper');
  for (let i = 0; i < zy.length - 1; i++) quadUV(L, [-0.02, zy[i][1] + 0.012, zy[i][0]], [0.02, zy[i][1] + 0.012, zy[i][0]], [0.02, zy[i + 1][1] + 0.012, zy[i + 1][0]], [-0.02, zy[i + 1][1] + 0.012, zy[i + 1][0]], 'p_decal', zr);
  box(L, -0.05, 0.06, 0.92, 0.05, 0.12, 0.98, 'p_flat', { tint: [0.9, 0.86, 0.7] });
  return {};
});

/** Blood pool decal. opts: size, variant 'pool'|'smear' */
export const blood_pool = defProp('blood_pool', (L, o, r) => {
  const size = o.size || 1.5;
  if (o.variant === 'smear') {
    for (let i = 0; i < 4; i++) L.floorDecal(range(r, -0.1, 0.1), 0.001 * i, i * size * 0.45, size * (1 - i * 0.18), range(r, 0, TAU), 'blood', { seed: (r() * 4) | 0 });
  } else L.floorDecal(0, 0, 0, size, range(r, 0, TAU), 'blood', { seed: (r() * 4) | 0 });
  return {};
});

/** Scattered newspapers on the floor (no collision). */
export const newspapers = defProp('newspapers', (L, o, r) => {
  const n = o.count || 4;
  for (let i = 0; i < n; i++) {
    pushR(L, [range(r, -0.8, 0.8), 0.006 + i * 0.002, range(r, -0.8, 0.8)], 0, range(r, 0, TAU), 0);
    panel(L, 'p_decal', R('newsprint'), 0, 0, 0, 0.42, 0.56, 'py', { tint: mix([1, 1, 1], [0.8, 0.75, 0.6], r()) });
    L.pop();
  }
  return {};
});

/** Rubble mound with plaster chunks and boards. opts: size */
export const debris_pile = defProp('debris_pile', (L, o, r) => {
  const s = o.size || 1;
  const rect = (x, y, z) => [[-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]];
  loft(L, rect(1.0 * s, 0, 0.8 * s), rect(0.45 * s, 0.32 * s, 0.35 * s), 'gravel', { capB: 'gravel', collide: true, tint: [0.95, 0.92, 0.88] });
  const mats = ['concrete', 'plaster', 'brickTan', 'plasterDirty', 'concreteWarm'];
  for (let i = 0; i < 9; i++) {
    const a = range(r, 0, TAU), d = range(r, 0, 0.8) * s;
    const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.8;
    const y = Math.max(0, 0.32 * s * (1 - d / (0.9 * s)));
    pushR(L, [x, y - 0.05, z], range(r, -0.6, 0.6), range(r, 0, PI), range(r, -0.6, 0.6));
    const sx = range(r, 0.15, 0.4) * s, sy = range(r, 0.06, 0.18) * s, sz = range(r, 0.12, 0.35) * s;
    box(L, -sx / 2, 0, -sz / 2, sx / 2, sy, sz / 2, pick(r, mats));
    L.pop();
  }
  for (let i = 0; i < 3; i++) {
    const a = range(r, 0, TAU);
    pushR(L, [Math.cos(a) * 0.3 * s, 0.15 * s, Math.sin(a) * 0.3 * s], range(r, -0.4, 0.4), a, range(r, -0.3, 0.3));
    box(L, -0.05, 0, -0.7 * s, 0.05, 0.03, 0.7 * s, pick(r, ['wood', 'woodLight', 'p_plywood']));
    L.pop();
  }
  return { topY: wp(L, 0, 0.35 * s, 0)[1] };
});

/** Heap of charred furniture (fire effects are added by the game at `fire`). */
export const burning_wreckage = defProp('burning_wreckage', (L, o, r) => {
  const s = o.size || 1;
  L.floorDecal(0, 0, 0, 3.2 * s, range(r, 0, TAU), 'scorch', {});
  const rect = (x, y, z) => [[-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]];
  loft(L, rect(0.9 * s, 0, 0.7 * s), rect(0.5 * s, 0.35 * s, 0.4 * s), 'p_charred', { capB: 'p_charred' });
  // overturned table
  pushR(L, [0.3 * s, 0.35 * s, -0.1 * s], 0.2, 0.4, 1.3);
  box(L, -0.5, 0, -0.4, 0.5, 0.05, 0.4, 'p_charred');
  for (const [x, z] of [[-0.42, -0.32], [0.42, -0.32], [-0.42, 0.32], [0.42, 0.32]]) box(L, x - 0.03, 0.05, z - 0.03, x + 0.03, 0.7, z + 0.03, 'p_charred');
  L.pop();
  // mattress & boards
  pushR(L, [-0.5 * s, 0.1, 0.2 * s], 0.0, -0.3, 0.5);
  box(L, -0.6, 0, -0.9, 0.6, 0.18, 0.9, 'p_charred', { tint: [1.1, 0.95, 0.85] });
  L.pop();
  for (let i = 0; i < 6; i++) {
    const a = range(r, 0, TAU);
    pushR(L, [Math.cos(a) * 0.4 * s, range(r, 0.1, 0.5) * s, Math.sin(a) * 0.4 * s], range(r, -0.7, 0.7), a, range(r, -0.5, 0.5));
    box(L, -0.04, 0, -0.6 * s, 0.04, 0.05, 0.6 * s, 'p_charred');
    L.pop();
  }
  // chair frame
  pushR(L, [0.1 * s, 0.4 * s, 0.4 * s], 0.9, 1.2, 0.3);
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) box(L, x - 0.02, 0, z - 0.02, x + 0.02, 0.45, z + 0.02, 'p_charred');
  box(L, -0.22, 0.45, -0.22, 0.22, 0.48, 0.22, 'p_charred');
  L.pop();
  solid(L, -0.85 * s, 0, -0.65 * s, 0.85 * s, 0.6 * s, 0.65 * s, 'wood');
  return { fire: wp(L, 0, 0.4 * s, 0), topY: wp(L, 0, 0.6 * s, 0)[1] };
});

export const STREET = {
  streetlight, traffic_light, stop_sign, fire_hydrant, mailbox, newspaper_box, trash_can, dumpster, bench, bus_stop,
  porta_potty, phone_booth, jersey_barrier, police_barrier, sandbags, chain_link_fence, hedge, bush, tree, palm_tree,
  planter, billboard, awning, utility_pole, generator, scaffolding, pallet, crate, barrel, cardboard_boxes, tire_stack,
  shopping_cart, ac_unit, roof_vent, water_tower, satellite_dish, ladder, solar_message_sign, tent, cot, iv_stand,
  body, body_bag, blood_pool, newspapers, debris_pile, burning_wreckage,
};
export const STREET_MOUNT = { awning: 'wall', ladder: 'wall' };
