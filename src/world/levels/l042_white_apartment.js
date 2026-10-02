// Level 42: White Apartment. An endless run of white rooms joined by doorways and glass, lit from
// nowhere: no shadows, no fixtures that matter, a faint cream warmth over everything. The few
// things that carry colour (a mug, an umbrella, the glow under the doors) lose it as you stay: the
// level slowly drains the colour from the screen, then the warmth, then the contrast.
import { defineZone } from '../zonetypes.js';
import { defineTexture } from '../../gfx/textures.js';
import { pnoise } from '../../gfx/texgen.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S, propTex as T } from '../props.js';
import { LEVEL_ZONE, defineLevel, env, M, W, hr, levelDoor } from './kit.js';
import { Loc, face, clamp } from './g01_kit.js';

const N = 42;
const G = 64, RS = 8;                 // zone, room size
const tx = defineTexture;

// ------------------------------------------------------------------ textures
const CREAM = [248, 244, 236];
const tint = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
function wall(p, base) {
  p.fill(base);
  p.noise(4, 0.012, 2);
  p.rect(0, 59, 64, 5, tint(base, 0.9));       // skirting at the bottom (the texture is one wall tall)
  p.rect(0, 58, 64, 1, tint(base, 0.84));
  p.rect(0, 0, 64, 2, tint(base, 0.94));
  for (let x = 0; x < 64; x += 32) p.rect(x, 2, 1, 56, tint(base, 0.97), 0.7);
}
tx('lv42_wall_a', (p) => wall(p, CREAM), 6);
tx('lv42_wall_b', (p) => wall(p, [242, 245, 248]), 6);
tx('lv42_wall_c', (p) => wall(p, [242, 247, 243]), 6);
tx('lv42_tile', (p) => {
  p.fill([236, 236, 238]); p.noise(6, 0.015, 2);
  for (const t of [0, 32]) { p.rect(0, t, 64, 1, [214, 216, 220]); p.rect(t, 0, 1, 64, [214, 216, 220]); }
  p.speckle(30, [224, 226, 228], 0.5, 0.9);
}, 6);
tx('lv42_wood', (p) => {
  p.fill([238, 234, 226]); p.noise(5, 0.02, 2);
  for (let y = 0; y < 64; y += 8) { p.rect(0, y, 64, 1, [214, 210, 202]); p.rect((y * 5) % 64, y + 1, 1, 7, [218, 214, 206]); }
}, 6);
tx('lv42_carpet', (p) => { p.fill([240, 240, 241]); p.noise(8, 0.03, 2); p.grain(0.03); }, 6);
tx('lv42_ceil', (p) => {
  p.fill([252, 252, 253]); p.noise(4, 0.008, 2);
  p.rect(0, 0, 64, 1, [236, 236, 238]); p.rect(0, 0, 1, 64, [236, 236, 238]); p.rect(0, 32, 64, 1, [244, 244, 246]); p.rect(32, 0, 1, 64, [244, 244, 246]);
}, 4);
tx('lv42_glow', (p) => { p.fill([255, 255, 255]); p.frame(0, 0, 64, 64, [244, 244, 246]); }, 4);
tx('lv42_frame', (p) => { p.fill([128, 132, 144]); p.noise(4, 0.02, 2); }, 4);
tx('lv42_furn', (p) => {
  p.fill([212, 212, 220]); p.noise(5, 0.03, 2);
  p.rect(0, 0, 64, 3, [236, 236, 242]); p.rect(0, 61, 64, 3, [176, 176, 188]);
  p.rect(0, 31, 64, 1, [190, 190, 202], 0.8);
}, 6);
tx('lv42_cloth', (p) => { p.fill([226, 226, 232]); p.noise(6, 0.03, 2); for (let y = 0; y < 64; y += 8) p.rect(0, y, 64, 1, [200, 200, 210], 0.7); }, 6);
tx('lv42_shelf', (p) => {
  p.fill([240, 240, 243]);
  for (let y = 0; y < 64; y += 16) { p.rect(2, y + 2, 60, 12, [214, 214, 222]); p.rect(2, y + 14, 60, 2, [250, 250, 252]); }
  for (let y = 0; y < 64; y += 16) for (let x = 4; x < 58; x += 6 + ((x + y) % 5)) p.rect(x, y + 6, 4, 8, [236, 236, 240]);
}, 6);
defineMaterial('lv42_wall_a', 'lv42_wall_a', { su: 2, sv: 3, surf: 'drywall' });
defineMaterial('lv42_wall_b', 'lv42_wall_b', { su: 2, sv: 3, surf: 'drywall' });
defineMaterial('lv42_wall_c', 'lv42_wall_c', { su: 2, sv: 3, surf: 'drywall' });
defineMaterial('lv42_tile', 'lv42_tile', { s: 2, surf: 'tile' });
defineMaterial('lv42_wood', 'lv42_wood', { s: 2, surf: 'wood' });
defineMaterial('lv42_carpet', 'lv42_carpet', { s: 2, surf: 'carpet' });
defineMaterial('lv42_ceil', 'lv42_ceil', { s: 2, surf: 'drywall' });
defineMaterial('lv42_glow', 'lv42_glow', { s: 1, flags: VF.FULLBRIGHT, glow: 1.0, surf: 'drywall' });
defineMaterial('lv42_frame', 'lv42_frame', { s: 1, surf: 'wood' });
defineMaterial('lv42_furn', 'lv42_furn', { s: 1, surf: 'plastic' });
defineMaterial('lv42_cloth', 'lv42_cloth', { s: 1, surf: 'carpet' });
defineMaterial('lv42_shelf', 'lv42_shelf', { s: 1, surf: 'wood' });

// ------------------------------------------------------------------ white furniture
defineProp('lv42_bed', {
  build(mb) {
    const f = S('lv42_furn'), c = S('lv42_cloth');
    mb.box(-0.85, 0.05, -1.05, 0.85, 0.32, 1.05, f);
    mb.box(-0.8, 0.32, -1.0, 0.8, 0.5, 1.0, c);
    mb.box(-0.62, 0.5, 0.45, -0.05, 0.6, 0.9, c); mb.box(0.05, 0.5, 0.45, 0.62, 0.6, 0.9, c);
    mb.box(-0.88, 0.05, 1.02, 0.88, 0.95, 1.1, f);
  },
  boxes: [[-0.9, 0, -1.05, 0.9, 0.6, 1.1]],
});
defineProp('lv42_sofa', {
  build(mb) {
    const f = S('lv42_furn'), c = S('lv42_cloth');
    mb.box(-1.0, 0.0, -0.4, 1.0, 0.4, 0.42, c);
    mb.box(-1.0, 0.4, 0.2, 1.0, 0.9, 0.42, c);
    for (const s of [-1, 1]) mb.box(s * 1.0 - (s > 0 ? 0.18 : 0), 0.0, -0.4, s * 1.0 + (s < 0 ? 0.18 : 0), 0.62, 0.42, f);
  },
  boxes: [[-1.0, 0, -0.4, 1.0, 0.9, 0.42]],
});
defineProp('lv42_table', {
  build(mb, p) {
    const f = S('lv42_furn'), L = p.opts.len ?? 1.4, D = p.opts.depth ?? 0.8;
    mb.box(-L / 2, 0.7, -D / 2, L / 2, 0.75, D / 2, f);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * (L / 2 - 0.06) - 0.03, 0, sz * (D / 2 - 0.06) - 0.03, sx * (L / 2 - 0.06) + 0.03, 0.7, sz * (D / 2 - 0.06) + 0.03, f, { skip: 8 });
  },
  boxes: (p) => [[-(p.opts.len ?? 1.4) / 2, 0, -(p.opts.depth ?? 0.8) / 2, (p.opts.len ?? 1.4) / 2, 0.75, (p.opts.depth ?? 0.8) / 2]],
});
defineProp('lv42_chair', {
  build(mb) {
    const f = S('lv42_furn');
    mb.box(-0.21, 0.42, -0.21, 0.21, 0.46, 0.21, f);
    mb.box(-0.21, 0.46, 0.17, 0.21, 0.9, 0.21, f);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 0.18 - 0.02, 0, sz * 0.18 - 0.02, sx * 0.18 + 0.02, 0.42, sz * 0.18 + 0.02, f, { skip: 8 });
  },
  boxes: [[-0.22, 0, -0.22, 0.22, 0.9, 0.22]],
});
defineProp('lv42_shelf', {
  build(mb) {
    const f = S('lv42_furn');
    mb.box(-0.55, 0, -0.17, 0.55, 1.9, 0.17, [f, f, f, null, f, S('lv42_shelf')], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 2, 2]] });
  },
  boxes: [[-0.55, 0, -0.17, 0.55, 1.9, 0.17]],
});
defineProp('lv42_counter', {
  build(mb) {
    const f = S('lv42_furn');
    mb.box(-1.1, 0, -0.3, 1.1, 0.88, 0.3, f);
    mb.box(-1.12, 0.88, -0.32, 1.12, 0.92, 0.32, S('lv42_cloth'));
    mb.box(-1.1, 1.35, 0.08, 1.1, 2.0, 0.3, f);
    mb.box(-0.3, 0.9, -0.2, 0.3, 0.93, 0.15, S('porcelain'));
  },
  boxes: [[-1.12, 0, -0.32, 1.12, 2.0, 0.32]],
});
defineProp('lv42_lamp', {
  build(mb) {
    const f = S('lv42_furn');
    mb.cyl(0, 0, 0, 0.14, 0.04, 6, f, 3);
    mb.cyl(0, 0.04, 0, 0.012, 1.3, 4, f, 0);
    mb.cyl(0, 1.2, 0, 0.2, 0.3, 7, { layer: T('lv42_glow').layer, flags: VF.FULLBRIGHT, lit: false, color: [0.1, 0.1, 0.1], flk: [1, 1, 1], chan: 0 }, 3);
  },
  boxes: [[-0.15, 0, -0.15, 0.15, 1.5, 0.15]],
});

// ------------------------------------------------------------------ rooms
const WALLS = ['lv42_wall_a', 'lv42_wall_b', 'lv42_wall_c'];
const wallMat = (rx, rz) => M[WALLS[Math.floor(hr(rx, rz, 4203) * 3)]];
const floorMat = (rx, rz) => M[['lv42_tile', 'lv42_wood', 'lv42_carpet'][Math.floor(hr(rx, rz, 4202) * 3)]];
const roomH = (rx, rz) => [3.0, 3.0, 3.4, 4.2][Math.floor(hr(rx, rz, 4201) * 4)];

// what is in the wall between room (rx, rz) and its neighbour to the north ('N') or west ('W')
function edgeKind(rx, rz, side) {
  // the first row of rooms (z cells 0..7) is a long run of open doorways: the view from arrival
  if (side === 'W' && rz === 0 && rx >= 0 && rx <= 9) return rx === 0 ? 'wall' : 'door';
  const h = hr(rx, rz, side === 'N' ? 4210 : 4211);
  return h < 0.52 ? 'door' : h < 0.7 ? 'glass' : 'wall';
}

function room(Z, rx, rz) {
  const zb = Z.zb;
  const X = rx * RS, Zc = rz * RS;
  const h = (k) => hr(rx, rz, 4220 + k);
  const H = roomH(rx, rz), fm = floorMat(rx, rz), wm = wallMat(rx, rz);
  zb.fill(X, Zc, X + RS, Zc + RS, (x, z, i) => {
    zb.solid[i] = 0; zb.floor[i] = 0; zb.ceil[i] = H; zb.fmat[i] = fm; zb.cmat[i] = M.lv42_ceil; zb.wmat[i] = wm; zb.flags[i] = 0;
    const lu = x - X, lv = z - Zc;
    if (lu >= 3 && lu < 5 && lv >= 3 && lv < 5) zb.cmat[i] = M.lv42_glow;     // the light
  });
  // walls on the north and west edges
  for (const side of ['N', 'W']) {
    const kind = edgeKind(rx, rz, side);
    const nrx = side === 'W' ? rx - 1 : rx, nrz = side === 'N' ? rz - 1 : rz;
    const mm = wallMat(nrx, nrz), mp = wm;
    for (let t = 0; t < RS; t++) {
      const x = side === 'N' ? X + t : X, z = side === 'N' ? Zc : Zc + t;
      let type = W.WALL;
      if (kind === 'door' && (t === 3 || t === 4)) type = W.BIGDOOR;
      else if (kind === 'glass' && t >= 1 && t <= 6) type = W.GLASS;
      zb.setWall(x, z, side, type, mm, mp);
    }
    if (kind === 'door') {
      const a = side === 'N' ? [X + 3, 0, Zc - 0.1, X + 5, 0, Zc + 0.1] : [X - 0.1, 0, Zc + 3, X + 0.1, 0, Zc + 5];
      const fh = 2.45;
      if (side === 'N') { Z.zb.box(a[0] - 0.2, 0, a[2] - 0.02, a[0], fh + 0.2, a[5] + 0.02, M.lv42_frame, {}); Z.zb.box(a[3], 0, a[2] - 0.02, a[3] + 0.2, fh + 0.2, a[5] + 0.02, M.lv42_frame, {}); Z.zb.box(a[0] - 0.2, fh, a[2] - 0.02, a[3] + 0.2, fh + 0.2, a[5] + 0.02, M.lv42_frame, {}); }
      else { Z.zb.box(a[0] - 0.02, 0, a[2] - 0.2, a[3] + 0.02, fh + 0.2, a[2], M.lv42_frame, {}); Z.zb.box(a[0] - 0.02, 0, a[5], a[3] + 0.02, fh + 0.2, a[5] + 0.2, M.lv42_frame, {}); Z.zb.box(a[0] - 0.02, fh, a[2] - 0.2, a[3] + 0.02, fh + 0.2, a[5] + 0.2, M.lv42_frame, {}); }
    }
  }
  furnish(zb, rx, rz, X, Zc, h);
}

function furnish(zb, rx, rz, X, Zc, h) {
  const type = Math.floor(h(1) * 6);        // living, bedroom, kitchen, bath, bare, bare
  const quads = [[X + 1.5, Zc + 1.5, 1, 1], [X + 6.5, Zc + 1.5, -1, 1], [X + 1.5, Zc + 6.5, 1, -1], [X + 6.5, Zc + 6.5, -1, -1]];
  const P = (name, x, z, rot, o) => zb.prop(name, x, 0, z, rot, o || {});
  quads.forEach(([qx, qz, sx, sz], q) => {
    const toX = face(sx, 0), toZ = face(0, sz);          // facing along the room's axes toward the middle
    const r = hr(rx * 4 + q, rz, 4240);
    if (type === 0) {
      if (q === 0) P('lv42_sofa', qx + 0.1, qz - 0.8, face(0, 1), {});
      else if (q === 1) P('lv42_shelf', qx + 1.0, qz - 1.1, toZ, {});
      else if (q === 2) P('lv42_table', qx, qz, 0, { len: 1.0, depth: 0.6 });
      else if (r < 0.7) P('lv42_lamp', qx + sx * 0.4, qz + sz * 0.4, 0, {});
    } else if (type === 1) {
      if (q === 0) P('lv42_bed', qx - 0.2, qz - 0.2, face(0, 1), {});
      else if (q === 1) P('lv42_shelf', qx + 1.0, qz - 1.1, toZ, {});
      else if (q === 3 && r < 0.8) P('lv42_chair', qx, qz, face(-sx, 0), {});
    } else if (type === 2) {
      if (q === 0) P('lv42_counter', qx + 0.5, qz - 1.1, face(0, 1), {});
      else if (q === 3) { P('lv42_table', qx, qz, 0, { len: 1.2, depth: 0.8 }); P('lv42_chair', qx - 0.9, qz, face(1, 0), {}); P('lv42_chair', qx + 0.9, qz, face(-1, 0), {}); }
    } else if (type === 3) {
      if (q === 0) P('bathtub', qx - 0.5, qz, face(0, 1), {});
      else if (q === 1) P('toilet', qx + 0.5, qz - 1.2, face(0, 1), {});
      else if (q === 2) P('sink', qx, qz + 1.2, face(0, -1), {});
    }
  });
  // a thing somebody brought in: the only colour there is
  if (hr(rx, rz, 4250) < 0.22) {
    const k = Math.floor(hr(rx, rz, 4251) * 5), px = X + 5.6, pz = Zc + 5.4;
    const cols = [[1.0, 0.18, 0.15], [0.2, 0.4, 1.0], [1.0, 0.8, 0.1], [0.2, 0.8, 0.35], [1.0, 0.5, 0.1]];
    if (k === 0) P2(zb, 'mug', px, 0.0, pz, { tint: cols[1] });
    else if (k === 1) P2(zb, 'umbrella', px - 0.4, 0, pz + 0.6, { tint: [0.9, 0.2, 0.2] });
    else if (k === 2) P2(zb, 'ball', px, 0, pz, { tint: cols[0] });
    else if (k === 3) P2(zb, 'traffic_cone', px, 0, pz, {});
    else P2(zb, 'bag', px, 0, pz, { tint: cols[3] });
  }
}
function P2(zb, name, x, y, z, o) { zb.prop(name, x, y, z, 0.5, o); }

function gen(zb) {
  zb.noConnectivity = true;
  const Z = new Loc(zb);
  for (let rz = zb.z0 / RS; rz < zb.z1 / RS; rz++) for (let rx = zb.x0 / RS; rx < zb.x1 / RS; rx++) room(Z, rx, rz);
  // a door near the arrival: against the west wall of the first room
}

defineZone('lv42_white', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.92, 0.92, 0.94],
    env: env({ fog: [0.99, 0.99, 1.0], fogNear: 20, fogFar: 84, hum: 0, hvac: 0, reverb: 'room', tone: 'lv42_hush' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'WHITE APARTMENT',
  zoneType: 'lv42_white',
  zoneSize: G,
  entry: { x: 1.5, y: 0, z: 4.5, yaw: Math.PI / 2, pitch: 0 },
  doorDensity: 0.9,
  viewRadius: 4,
  light: { phoneRadius: 3.2, phoneIntensity: 0.12 },
  script(ctx, dt) {
    const s = ctx.state, g = ctx.game;
    s.t = (s.t ?? 0) + dt;
    // 0..1 over eight minutes: colour goes first, then the warmth, then the contrast
    const k = clamp(s.t / 480, 0, 1);
    const look = g.look || (g.look = {});
    look.grade = { sat: 1 - k, tint: [1 - k * 0.04, 1 - k * 0.02, 1 + k * 0.03] };
    if (!s.said1 && k > 0.45) { s.said1 = true; g.ui.say('Everything looks paler.', 4); }
    if (!s.said2 && k >= 1) { s.said2 = true; g.ui.say('There is no colour left.', 4); }
  },
});
void pnoise;
