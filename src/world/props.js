// Low-poly prop models. Models face local -z (their "front"), +x is their right side, y=0 is
// the floor they stand on. Each prop may declare collision boxes, an interaction, a sound
// emitter and a light.
import { MATS, M, VF } from './materials.js';
import { matStyle, texStyle } from './mesh.js';
import { RNG } from '../core/rng.js';
import { xfMul, xfTranslate, xfRotY, xfRotX, xfRotZ } from '../core/math.js';

let TEX = {};
export function setPropTextures(index) { TEX = index; }

const cache = new Map();
function S(name, extra) {
  if (extra) return matStyle(M[name], extra);
  let s = cache.get(name);
  if (!s) { s = matStyle(M[name]); cache.set(name, s); }
  return s;
}
function T(name, extra) { return texStyle(TEX[name], extra); }
// self-lit surface; b is brightness on the PS1 scale (1.0 = texture as painted)
function glow(name, b = 1.0, ch = 0) { return { layer: TEX[name], flags: VF.FULLBRIGHT, lit: false, color: [0.08, 0.08, 0.08], flk: [b, b, b], chan: ch }; }
const FIT = [0, 0, 1, 1];
// box with a special style on the front (-z) face
function frontBox(mb, st, front, x0, y0, z0, x1, y1, z1, frontUV = FIT) {
  mb.box(x0, y0, z0, x1, y1, z1, [st, st, st, st, st, front], { uv: ['world', 'world', 'world', 'world', 'world', frontUV] });
}
function withXf(mb, local, fn) {
  const saved = mb.xf;
  mb.xf = saved ? xfMul(saved, local) : local;
  fn();
  mb.xf = saved;
}
function legs4(mb, st, hx, hz, h, t = 0.025) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * hx - t, 0, sz * hz - t, sx * hx + t, h, sz * hz + t, st, { skip: 8 });
}
function starBase(mb, st, r = 0.3) {
  for (let k = 0; k < 5; k++) {
    withXf(mb, xfRotY((k / 5) * Math.PI * 2 + 0.3), () => {
      mb.box(-0.022, 0.05, -r, 0.022, 0.085, 0, st, { skip: 8 });
      mb.box(-0.03, 0, -r - 0.02, 0.03, 0.05, -r + 0.03, st, { skip: 8 });
    });
  }
}

export const PROPS = {};
function P(name, def) { PROPS[name] = def; }
// helpers for prop definitions in other modules
export const defineProp = P;
export const propMat = S;
export const propTex = T;
export const propGlow = glow;
export const propFrontBox = frontBox;
export const propWithXf = withXf;
export const propLegs4 = legs4;
export const PROP_FIT = FIT;

// ------------------------------------------------------------------ seating
P('chair_office', {
  build(mb, p, r) {
    const fab = S(p.opts.fabric || r.pick(['fabric_blue', 'fabric_gray', 'fabric_gray', 'fabric_brown'])), blk = S('plastic_black');
    mb.box(-0.24, 0.42, -0.25, 0.24, 0.5, 0.21, fab);
    mb.box(-0.22, 0.56, 0.2, 0.22, 0.98, 0.27, fab);
    mb.box(-0.03, 0.46, 0.21, 0.03, 0.6, 0.25, blk, { skip: 12 });
    mb.cyl(0, 0.08, -0.02, 0.028, 0.34, 5, blk, 0);
    starBase(mb, blk);
    if (p.opts.arms !== false && r.chance(0.5)) for (const s of [-1, 1]) {
      mb.box(s * 0.27 - 0.02, 0.5, -0.05, s * 0.27 + 0.02, 0.65, 0.0, blk);
      mb.box(s * 0.27 - 0.03, 0.65, -0.18, s * 0.27 + 0.03, 0.68, 0.05, blk);
    }
  },
  boxes: [[-0.24, 0, -0.25, 0.24, 0.6, 0.25]],
});
P('chair_mesh', {
  build(mb, p) {
    const mesh = S('chair_mesh'), blk = S('plastic_black');
    mb.box(-0.24, 0.42, -0.25, 0.24, 0.49, 0.21, mesh);
    mb.box(-0.21, 0.56, 0.21, 0.21, 1.0, 0.25, mesh);
    mb.box(-0.025, 0.46, 0.22, 0.025, 0.6, 0.25, blk, { skip: 12 });
    mb.cyl(0, 0.08, -0.02, 0.028, 0.34, 4, blk, 0);
    starBase(mb, blk, 0.28);
  },
  boxes: [[-0.24, 0, -0.25, 0.24, 0.6, 0.25]],
});
P('chair_folding', {
  build(mb, p) {
    const fr = S('metal_dark'), seat = S(p.opts.seat || 'metal');
    if (p.opts.dent) {
      // seat with a slight dip in the middle, as if somebody just stood up
      const y = 0.45, d = 0.028, c = [0, y - d, 0];
      mb.box(-0.21, 0.42, -0.2, 0.21, y, 0.2, seat, { skip: 4 });
      const A = [-0.21, y, -0.2], B = [0.21, y, -0.2], Cc = [0.21, y, 0.2], D = [-0.21, y, 0.2];
      mb.tri3(D, Cc, c, seat, [0, 1, 1, 1, 0.5, 0.5]);
      mb.tri3(Cc, B, c, seat, [0, 1, 1, 1, 0.5, 0.5]);
      mb.tri3(B, A, c, seat, [0, 1, 1, 1, 0.5, 0.5]);
      mb.tri3(A, D, c, seat, [0, 1, 1, 1, 0.5, 0.5]);
    } else {
      mb.box(-0.21, 0.42, -0.2, 0.21, 0.45, 0.2, seat);
    }
    mb.box(-0.2, 0.62, 0.17, 0.2, 0.84, 0.2, seat);
    for (const s of [-1, 1]) {
      mb.box(s * 0.2 - 0.015, 0, 0.16, s * 0.2 + 0.015, 0.86, 0.19, fr, { skip: 8 });
      mb.box(s * 0.2 - 0.015, 0, -0.2, s * 0.2 + 0.015, 0.44, -0.17, fr, { skip: 8 });
    }
  },
  boxes: [[-0.22, 0, -0.21, 0.22, 0.5, 0.21]],
});
P('chair_plastic', {
  build(mb, p, r) {
    const c = S(p.opts.color || r.pick(['plastic_orange', 'plastic_blue', 'plastic_white', 'plastic_orange'])), fr = S('metal');
    mb.box(-0.22, 0.42, -0.22, 0.22, 0.46, 0.2, c);
    withXf(mb, xfMul(xfTranslate(0, 0.46, 0.2), xfRotX(-0.18)), () => mb.box(-0.21, 0, -0.03, 0.21, 0.4, 0.0, c));
    legs4(mb, fr, 0.19, 0.17, 0.42, 0.012);
  },
  boxes: [[-0.22, 0, -0.22, 0.22, 0.5, 0.22]],
});
P('chair_exec', {
  build(mb, p) {
    const lea = S(p.opts.fabric || 'fabric_brown'), blk = S('plastic_black');
    mb.box(-0.29, 0.42, -0.28, 0.29, 0.55, 0.22, lea);
    mb.box(-0.27, 0.55, 0.2, 0.27, 1.25, 0.32, lea);
    mb.box(-0.24, 1.1, 0.16, 0.24, 1.22, 0.22, lea);
    for (const s of [-1, 1]) mb.box(s * 0.31 - 0.04, 0.5, -0.2, s * 0.31 + 0.04, 0.72, 0.18, lea);
    mb.cyl(0, 0.08, -0.02, 0.03, 0.34, 5, blk, 0);
    starBase(mb, blk, 0.33);
  },
  boxes: [[-0.33, 0, -0.3, 0.33, 0.7, 0.33]],
});
P('chair_school', {
  build(mb) {
    const w = S('wood_light'), fr = S('metal_dark');
    mb.box(-0.2, 0.4, -0.2, 0.2, 0.43, 0.18, w);
    mb.box(-0.19, 0.6, 0.16, 0.19, 0.78, 0.18, w);
    legs4(mb, fr, 0.18, 0.16, 0.4, 0.012);
    for (const s of [-1, 1]) mb.box(s * 0.18 - 0.012, 0.4, 0.15, s * 0.18 + 0.012, 0.78, 0.17, fr);
  },
  boxes: [[-0.21, 0, -0.21, 0.21, 0.45, 0.2]],
});
P('chair_theater', {
  build(mb, p) {
    const vel = S('velvet_red'), fr = S('metal_dark');
    // folded-up seat + tall back
    mb.box(-0.24, 0.3, 0.06, 0.24, 0.72, 0.14, vel);
    mb.box(-0.25, 0.25, 0.14, 0.25, 1.0, 0.24, vel);
    for (const s of [-1, 1]) {
      mb.box(s * 0.27 - 0.03, 0, -0.1, s * 0.27 + 0.03, 0.62, 0.24, fr);
      mb.box(s * 0.27 - 0.035, 0.62, -0.12, s * 0.27 + 0.035, 0.66, 0.2, S('wood_dark'));
    }
    void p;
  },
  boxes: [[-0.3, 0, -0.12, 0.3, 1.0, 0.24]],
});
P('seat_tandem', {
  // row of 3 airport seats on a beam, centred
  build(mb, p) {
    const n = p.opts.n || 3;
    const c = S(p.opts.color || 'plastic_blue'), fr = S('chrome');
    const W = 0.56;
    const x0 = (-n * W) / 2;
    mb.box(x0, 0.32, -0.04, x0 + n * W, 0.36, 0.04, fr);
    for (let k = 0; k < n; k++) {
      const cx = x0 + W * (k + 0.5);
      mb.box(cx - 0.24, 0.4, -0.24, cx + 0.24, 0.45, 0.2, c);
      withXf(mb, xfMul(xfTranslate(cx, 0.45, 0.2), xfRotX(-0.15)), () => mb.box(-0.23, 0, -0.03, 0.23, 0.42, 0.0, c));
      mb.box(cx - 0.02, 0.36, -0.02, cx + 0.02, 0.4, 0.02, fr);
    }
    for (const s of [-1, 1]) {
      const lx = s * (n * W / 2 - 0.15);
      mb.box(lx - 0.03, 0, -0.25, lx + 0.03, 0.32, 0.25, fr);
    }
  },
  boxes: (p) => { const n = p.opts.n || 3; return [[-n * 0.28, 0, -0.26, n * 0.28, 0.5, 0.24]]; },
});
P('bench', {
  build(mb, p) {
    const len = p.opts.len || 1.6;
    const w = S('wood'), fr = S('metal_dark');
    for (let k = 0; k < 3; k++) mb.box(-len / 2, 0.42, -0.2 + k * 0.14, len / 2, 0.45, -0.1 + k * 0.14, w);
    for (const s of [-1, 1]) mb.box(s * (len / 2 - 0.1) - 0.03, 0, -0.18, s * (len / 2 - 0.1) + 0.03, 0.42, 0.18, fr);
  },
  boxes: (p) => [[-(p.opts.len || 1.6) / 2, 0, -0.2, (p.opts.len || 1.6) / 2, 0.46, 0.2]],
});
P('sofa', {
  build(mb, p) {
    const f = S(p.opts.fabric || 'fabric_floral'), wd = S('wood_dark');
    const L = p.opts.len || 1.9;
    mb.box(-L / 2, 0.1, -0.42, L / 2, 0.42, 0.42, f);
    mb.box(-L / 2, 0.42, 0.18, L / 2, 0.85, 0.42, f);
    for (const s of [-1, 1]) mb.box(s * L / 2 - (s > 0 ? 0.18 : 0), 0.1, -0.42, s * L / 2 + (s < 0 ? 0.18 : 0), 0.62, 0.42, f);
    for (let k = 0; k < Math.round(L / 0.62); k++) mb.box(-L / 2 + 0.2 + k * 0.6, 0.42, -0.4, -L / 2 + 0.76 + k * 0.6, 0.5, 0.16, f);
    legs4(mb, wd, L / 2 - 0.08, 0.35, 0.1, 0.03);
  },
  boxes: (p) => [[-(p.opts.len || 1.9) / 2, 0, -0.42, (p.opts.len || 1.9) / 2, 0.85, 0.42]],
});
P('armchair', {
  build(mb, p) {
    const f = S(p.opts.fabric || 'fabric_floral'), wd = S('wood_dark');
    mb.box(-0.42, 0.1, -0.42, 0.42, 0.42, 0.42, f);
    mb.box(-0.42, 0.42, 0.2, 0.42, 0.9, 0.42, f);
    for (const s of [-1, 1]) mb.box(s * 0.42 - (s > 0 ? 0.14 : 0), 0.1, -0.42, s * 0.42 + (s < 0 ? 0.14 : 0), 0.62, 0.42, f);
    legs4(mb, wd, 0.36, 0.36, 0.1, 0.03);
  },
  boxes: [[-0.43, 0, -0.43, 0.43, 0.9, 0.43]],
});

// ------------------------------------------------------------------ tables / desks
P('desk', {
  build(mb, p, r) {
    const top = S(p.opts.top || r.pick(['wood_light', 'wood', 'plastic_beige'])), side = S(p.opts.side || r.pick(['plastic_gray', 'metal_green', 'wood_dark']));
    mb.box(-0.76, 0.71, -0.39, 0.76, 0.75, 0.39, top);
    mb.box(-0.74, 0, -0.36, -0.7, 0.71, 0.36, side, { skip: 8 });
    mb.box(0.7, 0, -0.36, 0.74, 0.71, 0.36, side, { skip: 8 });
    mb.box(-0.7, 0.3, 0.3, 0.7, 0.71, 0.34, side);
    if (r.chance(0.7)) frontBox(mb, side, T('file_cabinet'), 0.24, 0, -0.35, 0.7, 0.69, 0.3, [0, 0.25, 1, 1]);
  },
  boxes: [[-0.76, 0, -0.39, 0.76, 0.75, 0.39]],
});
P('desk_metal', {
  build(mb) {
    const m = S('metal_green');
    mb.box(-0.8, 0.72, -0.4, 0.8, 0.76, 0.4, S('plastic_gray'));
    frontBox(mb, m, T('file_cabinet'), -0.8, 0, -0.38, -0.3, 0.72, 0.38, [0, 0.25, 1, 1]);
    frontBox(mb, m, T('file_cabinet'), 0.3, 0, -0.38, 0.8, 0.72, 0.38, [0, 0.25, 1, 1]);
    mb.box(-0.3, 0.32, 0.32, 0.3, 0.72, 0.36, m);
  },
  boxes: [[-0.8, 0, -0.4, 0.8, 0.76, 0.4]],
});
P('table', {
  build(mb, p) {
    const L = p.opts.len || 2.4, D = p.opts.depth || 1.0;
    const top = S(p.opts.top || 'wood'), leg = S('metal_dark');
    mb.box(-L / 2, 0.71, -D / 2, L / 2, 0.75, D / 2, top);
    legs4(mb, leg, L / 2 - 0.08, D / 2 - 0.08, 0.71, 0.025);
  },
  boxes: (p) => [[-(p.opts.len || 2.4) / 2, 0, -(p.opts.depth || 1) / 2, (p.opts.len || 2.4) / 2, 0.75, (p.opts.depth || 1) / 2]],
});
P('table_round', {
  build(mb, p) {
    const r0 = p.opts.r || 0.5;
    mb.cyl(0, 0.71, 0, r0, 0.04, 8, S(p.opts.top || 'plastic_white'));
    mb.cyl(0, 0, 0, 0.04, 0.71, 4, S('metal_dark'), 0);
    mb.cyl(0, 0, 0, 0.26, 0.03, 6, S('metal_dark'), 1);
  },
  boxes: (p) => { const r0 = p.opts.r || 0.5; return [[-r0 * 0.8, 0, -r0 * 0.8, r0 * 0.8, 0.75, r0 * 0.8]]; },
});
P('coffee_table', {
  build(mb) {
    mb.box(-0.55, 0.36, -0.3, 0.55, 0.42, 0.3, S('wood_dark'));
    legs4(mb, S('wood_dark'), 0.5, 0.25, 0.36, 0.03);
  },
  boxes: [[-0.55, 0, -0.3, 0.55, 0.42, 0.3]],
});
P('school_desk', {
  build(mb) {
    const w = S('wood_light'), fr = S('metal_dark');
    mb.box(-0.32, 0.68, -0.24, 0.32, 0.71, 0.24, w);
    mb.box(-0.3, 0.52, -0.22, 0.3, 0.55, 0.2, fr);
    legs4(mb, fr, 0.28, 0.2, 0.68, 0.014);
  },
  boxes: [[-0.32, 0, -0.24, 0.32, 0.71, 0.24]],
});
P('teacher_desk', {
  build(mb) {
    const w = S('wood');
    mb.box(-0.8, 0.72, -0.42, 0.8, 0.77, 0.42, w);
    frontBox(mb, w, T('file_cabinet'), -0.78, 0, -0.38, -0.3, 0.72, 0.38, [0, 0.25, 1, 1]);
    mb.box(0.72, 0, -0.38, 0.78, 0.72, 0.38, w);
    mb.box(-0.3, 0.2, 0.34, 0.72, 0.72, 0.38, w);
  },
  boxes: [[-0.8, 0, -0.42, 0.8, 0.77, 0.42]],
});
P('counter', {
  build(mb, p) {
    const L = p.opts.len || 1.0;
    frontBox(mb, S('wood_light'), T('door_wood'), -L / 2, 0.08, -0.3, L / 2, 0.88, 0.3, [0, 0, 1, 1]);
    mb.box(-L / 2, 0, -0.26, L / 2, 0.08, 0.3, S('plastic_black'));
    mb.box(-L / 2 - 0.01, 0.88, -0.32, L / 2 + 0.01, 0.92, 0.31, S('plastic_white'));
  },
  boxes: (p) => [[-(p.opts.len || 1) / 2, 0, -0.32, (p.opts.len || 1) / 2, 0.92, 0.31]],
});
P('reception_desk', {
  build(mb, p) {
    const L = p.opts.len || 3;
    const w = S(p.opts.mat || 'wood_dark'), top = S('marble');
    mb.box(-L / 2, 0, -0.35, L / 2, 1.1, -0.25, w);
    mb.box(-L / 2 - 0.02, 1.1, -0.4, L / 2 + 0.02, 1.15, -0.1, top);
    mb.box(-L / 2, 0.7, -0.25, L / 2, 0.74, 0.35, S('wood_light'));
    for (const s of [-1, 1]) mb.box(s * L / 2 - (s > 0 ? 0.08 : 0), 0, -0.25, s * L / 2 + (s < 0 ? 0.08 : 0), 1.1, 0.35, w);
  },
  boxes: (p) => [[-(p.opts.len || 3) / 2, 0, -0.4, (p.opts.len || 3) / 2, 1.15, 0.35]],
});
P('podium', {
  build(mb) {
    const w = S('wood_dark');
    mb.box(-0.3, 0, -0.25, 0.3, 1.0, 0.25, w);
    withXf(mb, xfMul(xfTranslate(0, 1.0, 0), xfRotX(0.3)), () => mb.box(-0.32, 0, -0.28, 0.32, 0.04, 0.22, w));
  },
  boxes: [[-0.32, 0, -0.28, 0.32, 1.15, 0.25]],
});

// ------------------------------------------------------------------ electronics / office
P('crt', {
  build(mb, p) {
    const body = S(p.opts.body || 'plastic_beige');
    const screen = p.opts.screen || 'crt_off';
    let scr;
    if (screen === 'static') scr = { layer: TEX.static0, flags: VF.FULLBRIGHT | VF.ANIM, lit: false, color: [0.04, 0.04, 0.04], flk: [0.85, 0.85, 0.85], chan: p.opts.ch || 0 };
    else if (screen === 'crt_off') scr = T('crt_off');
    else scr = glow(screen, 1.0, p.opts.ch || 0);
    mb.box(-0.2, 0, -0.19, 0.2, 0.34, 0.1, [body, body, body, body, body, scr], { uv: ['world', 'world', 'world', 'world', 'world', [0.08, 0.1, 0.92, 0.88]] });
    mb.box(-0.15, 0.03, 0.1, 0.15, 0.3, 0.33, body);
    mb.box(-0.12, -0.02, -0.12, 0.12, 0.0, 0.12, body);
  },
  boxes: [[-0.2, 0, -0.19, 0.2, 0.34, 0.33]],
});
P('computer', {
  build(mb) { frontBox(mb, S('plastic_beige'), T('computer_front'), -0.22, 0, -0.2, 0.22, 0.14, 0.22); },
  boxes: [[-0.22, 0, -0.2, 0.22, 0.14, 0.22]],
});
P('tower', {
  build(mb) { frontBox(mb, S('plastic_beige'), T('computer_front'), -0.1, 0, -0.22, 0.1, 0.42, 0.22); },
  boxes: [[-0.1, 0, -0.22, 0.1, 0.42, 0.22]],
});
P('keyboard', {
  build(mb) {
    const st = S('plastic_beige');
    mb.box(-0.23, 0, -0.08, 0.23, 0.025, 0.08, [st, st, T('keyboard'), st, st, st], { uv: ['world', 'world', FIT, 'world', 'world', 'world'] });
  },
});
P('phone', {
  build(mb) {
    const c = S('plastic_beige');
    mb.box(-0.11, 0, -0.1, 0.11, 0.06, 0.1, [c, c, T('phone'), c, c, c], { uv: ['world', 'world', FIT, 'world', 'world', 'world'] });
    mb.box(-0.12, 0.06, 0.02, 0.12, 0.1, 0.08, c);
    mb.box(-0.12, 0.1, 0.02, -0.07, 0.12, 0.08, c); mb.box(0.07, 0.1, 0.02, 0.12, 0.12, 0.08, c);
  },
  use: 'save',
});
P('payphone', {
  build(mb) {
    const m = S('metal'), d = S('plastic_black');
    mb.box(-0.18, 0.9, -0.12, 0.18, 1.55, 0.0, [m, m, m, m, m, T('phone')], { uv: ['world', 'world', 'world', 'world', 'world', [0.1, 0.1, 0.9, 0.9]] });
    mb.box(-0.2, 1.4, -0.12, -0.14, 1.52, -0.05, d);
    mb.box(-0.22, 1.18, -0.13, -0.15, 1.42, -0.07, d);
  },
  use: 'save',
  boxes: [[-0.2, 0.9, -0.14, 0.2, 1.55, 0]],
});
P('typewriter', {
  build(mb) {
    const c = S('metal_dark');
    mb.box(-0.22, 0, -0.18, 0.22, 0.1, 0.16, c);
    mb.box(-0.2, 0.1, -0.1, 0.2, 0.13, 0.12, [c, c, T('keyboard'), c, c, c], { uv: ['world', 'world', FIT, 'world', 'world', 'world'] });
    mb.rod(-0.25, 0.18, 0.1, 0.25, 0.18, 0.1, 0.04, 6, S('rubber'), true);
    mb.box(-0.12, 0.15, 0.1, 0.12, 0.3, 0.12, T('paper'), { uv: 'fit' });
  },
  use: 'save',
});
P('filing_cabinet', {
  build(mb, p) {
    const h = p.opts.h || 1.32;
    frontBox(mb, S(p.opts.mat || 'metal'), T('file_cabinet'), -0.24, 0, -0.33, 0.24, h, 0.33, [0, 0, 1, 1]);
  },
  boxes: (p) => [[-0.24, 0, -0.33, 0.24, p.opts.h || 1.32, 0.33]],
});
P('bookshelf', {
  build(mb, p) {
    const W = p.opts.w || 0.9, Hh = p.opts.h || 2.0;
    const w = S('wood_dark');
    mb.box(-W / 2, 0, 0.12, W / 2, Hh, 0.15, w);
    for (const s of [-1, 1]) mb.box(s * W / 2 - (s > 0 ? 0.03 : 0), 0, -0.15, s * W / 2 + (s < 0 ? 0.03 : 0), Hh, 0.15, w);
    const shelves = Math.floor(Hh / 0.4);
    for (let k = 0; k <= shelves; k++) mb.box(-W / 2, k * (Hh / shelves) - (k ? 0.02 : 0), -0.15, W / 2, k * (Hh / shelves) + 0.02, 0.12, w);
    if (p.opts.books !== false) {
      for (let k = 0; k < shelves; k++) {
        const y = k * (Hh / shelves) + 0.02;
        mb.box(-W / 2 + 0.03, y, -0.1, W / 2 - 0.03, y + Hh / shelves - 0.06, 0.1, [null, null, null, null, null, T('books')], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 0.5]] });
      }
    }
  },
  boxes: (p) => [[-(p.opts.w || 0.9) / 2, 0, -0.15, (p.opts.w || 0.9) / 2, p.opts.h || 2, 0.15]],
});
P('shelf_metal', {
  build(mb, p, r) {
    const W = p.opts.w || 1.2, Hh = p.opts.h || 2.0, D = 0.45;
    const m = S('metal');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * W / 2 - 0.02, 0, sz * D / 2 - 0.02, sx * W / 2 + 0.02, Hh, sz * D / 2 + 0.02, m, { skip: 8 });
    const n = 4;
    for (let k = 0; k < n; k++) {
      const y = 0.1 + k * (Hh - 0.15) / (n - 1);
      mb.box(-W / 2, y, -D / 2, W / 2, y + 0.025, D / 2, m);
      if (k < n - 1 && p.opts.empty !== true) {
        let x = -W / 2 + 0.05;
        while (x < W / 2 - 0.25) {
          const bw = r.range(0.22, 0.4), bh = r.range(0.18, (Hh - 0.15) / (n - 1) - 0.06);
          if (r.chance(0.78)) mb.box(x, y + 0.025, -D / 2 + 0.03, Math.min(x + bw, W / 2 - 0.03), y + 0.025 + bh, D / 2 - 0.03, S('cardboard'));
          x += bw + 0.04;
        }
      }
    }
  },
  boxes: (p) => [[-(p.opts.w || 1.2) / 2, 0, -0.24, (p.opts.w || 1.2) / 2, p.opts.h || 2, 0.24]],
});
P('box', {
  build(mb, p, r) {
    const s = p.opts.s || r.range(0.35, 0.6);
    const h = p.opts.h || s * r.range(0.6, 1.0);
    mb.box(-s / 2, 0, -s / 2, s / 2, h, s / 2, S('cardboard'));
  },
  boxes: (p) => { const s = p.opts.s || 0.5; return [[-s / 2, 0, -s / 2, s / 2, p.opts.h || s * 0.8, s / 2]]; },
});
P('box_stack', {
  build(mb, p, r) {
    let y = 0;
    const n = p.opts.n || r.int(2, 4);
    for (let k = 0; k < n; k++) {
      const s = r.range(0.45, 0.62), h = r.range(0.3, 0.45);
      withXf(mb, xfMul(xfTranslate(r.range(-0.05, 0.05), y, r.range(-0.05, 0.05)), xfRotY(r.range(-0.2, 0.2))), () => mb.box(-s / 2, 0, -s / 2, s / 2, h, s / 2, S('cardboard')));
      y += h;
    }
  },
  boxes: (p) => [[-0.3, 0, -0.3, 0.3, (p.opts.n || 3) * 0.38, 0.3]],
});
P('water_cooler', {
  build(mb) {
    const w = S('plastic_white');
    mb.box(-0.16, 0, -0.16, 0.16, 1.0, 0.16, w);
    mb.box(-0.05, 0.75, -0.18, 0.05, 0.82, -0.16, S('plastic_blue'));
    mb.cyl(0, 1.0, 0, 0.14, 0.42, 7, T('cooler_bottle', { lit: true }), 1);
  },
  boxes: [[-0.17, 0, -0.17, 0.17, 1.42, 0.17]],
  emitter: { snd: 'cooler', vol: 0.5, rad: 6, y: 1 },
  use: 'cooler',
});
P('vending', {
  build(mb, p) {
    const front = glow('vending', 1.0, p.opts.ch || 0);
    const body = S('plastic_black');
    mb.box(-0.45, 0, -0.42, 0.45, 1.85, 0.42, [body, body, body, body, body, front], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 1]] });
  },
  boxes: [[-0.46, 0, -0.43, 0.46, 1.86, 0.43]],
  emitter: { snd: 'vending', vol: 0.8, rad: 9, y: 1 },
  light: { y: 1.0, z: -0.8, color: [1.0, 0.85, 0.75], rad: 3.2, int: 0.4 },
  use: 'vending',
});
P('fridge', {
  build(mb) { frontBox(mb, S('plastic_white'), T('fridge'), -0.36, 0, -0.34, 0.36, 1.75, 0.34); },
  boxes: [[-0.36, 0, -0.34, 0.36, 1.75, 0.34]],
  emitter: { snd: 'fridge', vol: 0.5, rad: 6, y: 1 },
});
P('microwave', {
  build(mb) { frontBox(mb, S('plastic_white'), T('crt_off'), -0.25, 0, -0.18, 0.25, 0.28, 0.18, [0.1, 0.15, 0.7, 0.85]); },
});
P('coffee_maker', {
  build(mb) {
    const b = S('plastic_black');
    mb.box(-0.1, 0, -0.06, 0.1, 0.05, 0.14, b);
    mb.box(-0.1, 0.05, 0.06, 0.1, 0.36, 0.14, b);
    mb.box(-0.1, 0.3, -0.06, 0.1, 0.36, 0.06, b);
    mb.cyl(0, 0.05, -0.0, 0.07, 0.14, 6, S('glass'));
  },
});
P('copier', {
  build(mb) {
    const c = S('plastic_beige');
    mb.box(-0.5, 0, -0.32, 0.5, 0.95, 0.32, c);
    mb.box(-0.5, 0.95, -0.3, 0.5, 1.02, 0.3, S('plastic_gray'));
    mb.box(0.5, 0.6, -0.2, 0.75, 0.64, 0.2, S('plastic_gray'));
    mb.box(-0.45, 0.85, -0.33, 0.1, 0.92, -0.32, S('plastic_black'));
  },
  boxes: [[-0.5, 0, -0.32, 0.75, 1.02, 0.32]],
});
P('printer', {
  build(mb) {
    mb.box(-0.22, 0, -0.18, 0.22, 0.2, 0.2, S('plastic_beige'));
    mb.box(-0.15, 0.2, 0.0, 0.15, 0.3, 0.18, S('plastic_gray'));
  },
});
P('trash_can', {
  build(mb, p) {
    mb.cyl(0, 0, 0, 0.16, p.opts.h || 0.42, 6, S(p.opts.mat || 'plastic_gray'), 2);
  },
  boxes: [[-0.16, 0, -0.16, 0.16, 0.42, 0.16]],
});
P('plant', {
  build(mb, p, r) {
    mb.cyl(0, 0, 0, 0.17, 0.32, 6, S('plastic_orange', { tint: [0.7, 0.55, 0.45] }), 1);
    const lv = T('leaves_dead', { lit: true });
    const h = p.opts.h || r.range(0.8, 1.4);
    for (let k = 0; k < 2; k++) {
      const a = k * Math.PI / 2 + r.range(0, 0.6);
      const c = Math.cos(a) * 0.45, s = Math.sin(a) * 0.45;
      mb.card([-c, 0.3, -s, c, 0.3, s, c, 0.3 + h, s, -c, 0.3 + h, -s], [s, 0, -c], lv, [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
  boxes: [[-0.17, 0, -0.17, 0.17, 0.5, 0.17]],
});
P('lamp_desk', {
  build(mb, p) {
    const on = p.opts.on !== false;
    mb.cyl(0, 0, 0, 0.08, 0.03, 6, S('metal_dark'), 1);
    mb.rod(0, 0.03, 0, 0.02, 0.32, 0.06, 0.012, 4, S('metal_dark'));
    mb.cyl(0.02, 0.24, 0.06, 0.09, 0.1, 6, S('metal_green'), 1);
    if (on) mb.cyl(0.02, 0.235, 0.06, 0.07, 0.01, 6, glow('bulb', 1.1), 2);
  },
  light: { y: 0.3, color: [1.0, 0.82, 0.55], rad: 3.2, int: 0.45, cond: (p) => p.opts.on !== false },
});
P('lamp_floor', {
  build(mb, p) {
    const on = p.opts.on !== false;
    mb.cyl(0, 0, 0, 0.16, 0.03, 6, S('metal_dark'), 1);
    mb.cyl(0, 0.03, 0, 0.015, 1.4, 4, S('metal_dark'), 0);
    mb.cyl(0, 1.35, 0, 0.22, 0.3, 7, on ? glow('lamp_shade', 0.85) : T('lamp_shade'), 0);
  },
  boxes: [[-0.16, 0, -0.16, 0.16, 1.7, 0.16]],
  light: { y: 1.45, color: [1.0, 0.8, 0.55], rad: 4.5, int: 0.55, cond: (p) => p.opts.on !== false },
});
P('tv', {
  build(mb, p) {
    const screen = p.opts.screen || 'static';
    const scr = screen === 'static'
      ? { layer: TEX.static0, flags: VF.FULLBRIGHT | VF.ANIM, lit: false, color: [0.04, 0.04, 0.04], flk: [0.9, 0.9, 0.9], chan: p.opts.ch || 0 }
      : screen === 'off' ? T('crt_off') : glow(screen, 1.0);
    const cab = S('wood_dark');
    mb.box(-0.36, 0.45, -0.25, 0.36, 0.98, 0.22, [cab, cab, cab, cab, cab, T('tv_wood')], { uv: ['world', 'world', 'world', 'world', 'world', FIT] });
    mb.box(-0.3, 0.52, -0.255, 0.16, 0.92, -0.25, scr, { skip: 0b011111, uv: 'fit' });
    mb.box(-0.22, 0.6, 0.22, 0.22, 0.9, 0.4, cab);
    if (p.opts.stand !== false) {
      mb.box(-0.4, 0.4, -0.27, 0.4, 0.45, 0.27, S('wood'));
      legs4(mb, S('metal_dark'), 0.36, 0.22, 0.4, 0.015);
    }
  },
  boxes: [[-0.4, 0, -0.27, 0.4, 0.98, 0.4]],
  emitter: { snd: 'static', vol: 0.5, rad: 7, y: 0.7, cond: (p) => (p.opts.screen || 'static') === 'static' },
  light: { y: 0.75, z: -0.5, color: [0.7, 0.75, 0.85], rad: 2.6, int: 0.25, cond: (p) => (p.opts.screen || 'static') !== 'off' },
});
P('locker', {
  build(mb, p) {
    const n = p.opts.n || 2;
    frontBox(mb, S('metal_green', { tint: [0.9, 1.0, 1.15] }), T('locker'), -0.4 * n / 2, 0, -0.25, 0.4 * n / 2, 1.85, 0.25, [0, 0, n / 2, 1]);
  },
  boxes: (p) => [[-0.2 * (p.opts.n || 2), 0, -0.25, 0.2 * (p.opts.n || 2), 1.85, 0.25]],
  use: 'locked',
});
P('radiator', {
  build(mb) { frontBox(mb, S('metal'), T('radiator'), -0.5, 0.1, -0.08, 0.5, 0.75, 0.08); legs4(mb, S('metal_dark'), 0.45, 0.04, 0.1, 0.015); },
  boxes: [[-0.5, 0, -0.08, 0.5, 0.75, 0.08]],
});
P('panel_elec', {
  build(mb) { frontBox(mb, S('metal'), T('panel_elec'), -0.3, 1.0, -0.12, 0.3, 1.8, 0.0); },
  boxes: [[-0.3, 1.0, -0.12, 0.3, 1.8, 0]],
  emitter: { snd: 'transformer', vol: 0.35, rad: 5, y: 1.4 },
});
P('extinguisher', {
  build(mb) {
    mb.cyl(0, 0.9, -0.1, 0.07, 0.48, 6, S('pipe_red'), 1);
    mb.box(-0.03, 1.38, -0.12, 0.03, 1.45, -0.06, S('plastic_black'));
  },
});
P('exit_sign', {
  build(mb, p) {
    const st = glow(p.opts.green ? 'exit_green' : 'exit_sign', 1.1, p.opts.ch || 0);
    mb.box(-0.18, -0.2, -0.04, 0.18, 0.0, 0.04, [S('plastic_white'), S('plastic_white'), S('plastic_white'), S('plastic_white'), st, st], { uv: ['world', 'world', 'world', 'world', FIT, FIT] });
  },
  light: { y: -0.1, color: [1.0, 0.25, 0.2], rad: 2.4, int: 0.35, cond: (p) => !p.opts.green },
});
P('clock', {
  build(mb, p) {
    const face = T(p.opts.face || 'clock_a');
    mb.cyl(0, 0, 0.0, 0.17, 0.04, 8, S('plastic_black'), 0);
    withXf(mb, xfRotX(Math.PI / 2), () => mb.card([-0.16, -0.045, -0.16, 0.16, -0.045, -0.16, 0.16, -0.045, 0.16, -0.16, -0.045, 0.16], [0, -1, 0], face, [0, 0, 1, 0, 1, 1, 0, 1]));
  },
  emitter: { snd: 'tick', vol: 0.4, rad: 5, y: 0 },
});
P('cart_cleaning', {
  build(mb) {
    const y = S('plastic_orange', { tint: [1.1, 1.0, 0.4] }), g = S('plastic_gray');
    mb.box(-0.45, 0.1, -0.25, 0.45, 0.14, 0.25, g);
    mb.box(-0.45, 0.6, -0.25, 0.45, 0.64, 0.25, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 0.43 - 0.02, 0.05, sz * 0.23 - 0.02, sx * 0.43 + 0.02, 0.9, sz * 0.23 + 0.02, g);
    mb.cyl(-0.2, 0.14, 0, 0.16, 0.3, 6, y, 2);
    mb.box(0.05, 0.14, -0.2, 0.4, 0.5, 0.2, S('plastic_black'));
    mb.rod(-0.2, 0.2, 0.05, -0.1, 1.4, 0.15, 0.015, 4, S('wood'));
  },
  boxes: [[-0.46, 0, -0.26, 0.46, 0.9, 0.26]],
});
P('bucket', {
  build(mb) {
    mb.cyl(0, 0, 0, 0.15, 0.3, 6, S('plastic_orange', { tint: [1.15, 1.05, 0.4] }), 2);
    mb.rod(0.02, 0.28, 0, 0.3, 1.3, 0.1, 0.014, 4, S('wood'));
  },
  boxes: [[-0.15, 0, -0.15, 0.15, 0.3, 0.15]],
});
P('wet_sign', {
  build(mb) {
    const y = S('plastic_orange', { tint: [1.2, 1.1, 0.2] });
    withXf(mb, xfRotX(0.22), () => mb.box(-0.15, 0, -0.01, 0.15, 0.6, 0.01, y));
    withXf(mb, xfRotX(-0.22), () => mb.box(-0.15, 0, -0.01, 0.15, 0.6, 0.01, y));
  },
  boxes: [[-0.15, 0, -0.15, 0.15, 0.6, 0.15]],
});
P('pallet', {
  build(mb) {
    const w = S('wood_light', { tint: [0.9, 0.8, 0.65] });
    for (let k = 0; k < 5; k++) mb.box(-0.6, 0.12, -0.5 + k * 0.23, 0.6, 0.145, -0.4 + k * 0.23, w);
    for (const s of [-1, 0, 1]) mb.box(-0.6, 0, s * 0.45 - 0.05, 0.6, 0.12, s * 0.45 + 0.05, w);
  },
  boxes: [[-0.6, 0, -0.5, 0.6, 0.15, 0.5]],
});
P('server_rack', {
  build(mb, p) {
    const fr = S('plastic_black');
    const face = { layer: TEX[p.opts.alt ? 'server_b' : 'server'], flags: VF.FULLBRIGHT, lit: false, color: [0.32, 0.32, 0.32], flk: [0.7, 0.7, 0.7], chan: 14 };
    mb.box(-0.3, 0, -0.5, 0.3, 2.0, 0.5, [fr, fr, fr, fr, fr, face], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 3]] });
  },
  boxes: [[-0.3, 0, -0.5, 0.3, 2.0, 0.5]],
  emitter: { snd: 'server', vol: 0.6, rad: 8, y: 1 },
});
P('mattress', {
  build(mb) { mb.box(-0.48, 0, -1.0, 0.48, 0.22, 1.0, S('mattress')); },
  boxes: [[-0.48, 0, -1.0, 0.48, 0.22, 1.0]],
});
P('washer', {
  build(mb) { frontBox(mb, S('plastic_white'), T('washer'), -0.3, 0, -0.3, 0.3, 0.88, 0.3); },
  boxes: [[-0.3, 0, -0.3, 0.3, 0.88, 0.3]],
  emitter: { snd: 'washer', vol: 0.5, rad: 6, y: 0.5, cond: (p) => !!p.opts.running },
});
P('toilet', {
  build(mb) {
    const c = S('porcelain');
    mb.box(-0.18, 0, -0.3, 0.18, 0.4, 0.15, c);
    mb.box(-0.2, 0.4, -0.32, 0.2, 0.44, 0.15, c);
    mb.box(-0.2, 0.4, 0.15, 0.2, 0.8, 0.3, c);
  },
  boxes: [[-0.2, 0, -0.32, 0.2, 0.8, 0.3]],
});
P('sink', {
  build(mb) {
    const c = S('porcelain');
    mb.box(-0.26, 0.75, -0.22, 0.26, 0.86, 0.22, c);
    mb.box(-0.06, 0, 0.05, 0.06, 0.75, 0.17, c);
    mb.rod(0, 0.86, 0.15, 0, 1.0, 0.06, 0.015, 4, S('chrome'));
  },
  boxes: [[-0.26, 0, -0.22, 0.26, 0.86, 0.22]],
  emitter: { snd: 'drip', vol: 0.4, rad: 5, y: 0.9, cond: (p) => !!p.opts.drip },
});
P('car', {
  // sedan, crumpled nose (local -z) pushed into whatever is in front
  build(mb, p) {
    const paint = S('car_white'), glass = T('car_glass'), dark = S('rubber'), burnt = S('burnt');
    const crushed = p.opts.crushed !== false;
    const nose = crushed ? -1.75 : -2.3;
    // body lower
    mb.box(-0.88, 0.32, -1.6, 0.88, 0.8, 2.25, paint);
    mb.box(-0.86, 0.3, nose, 0.86, 0.72, -1.6, crushed ? burnt : paint);
    if (crushed) {
      // buckled hood
      mb.poly4([-0.86, 0.72, -1.6], [0.86, 0.72, -1.6], [0.8, 1.1, -1.95], [-0.8, 0.98, -1.95], paint, [0, 1, 1, 1, 1, 0, 0, 0]);
      mb.poly4([-0.8, 0.98, -1.95], [0.8, 1.1, -1.95], [0.8, 0.72, -2.0], [-0.8, 0.72, -2.0], burnt, [0, 1, 1, 1, 1, 0, 0, 0]);
    } else {
      mb.box(-0.86, 0.72, -2.3, 0.86, 0.8, -1.6, paint);
      frontBox(mb, paint, T('car_grille'), -0.86, 0.35, -2.32, 0.86, 0.68, -2.3);
    }
    // cabin
    mb.box(-0.8, 0.8, -0.9, 0.8, 1.3, 1.2, [glass, glass, paint, null, glass, glass], { uv: [FIT, FIT, 'world', 'world', FIT, FIT] });
    mb.box(-0.78, 1.3, -0.75, 0.78, 1.34, 1.05, paint);
    // trunk
    mb.box(-0.86, 0.8, 1.2, 0.86, 0.86, 2.25, paint);
    mb.box(-0.86, 0.5, 2.25, 0.86, 0.82, 2.3, [paint, paint, paint, paint, T('taillight'), paint], { uv: ['world', 'world', 'world', 'world', FIT, 'world'] });
    // wheels
    for (const sx of [-1, 1]) for (const z of [-1.25, 1.6]) {
      withXf(mb, xfMul(xfTranslate(sx * 0.8, 0.31, z), xfRotZ(Math.PI / 2)), () => mb.cyl(0, -0.11, 0, 0.31, 0.22, 8, dark, 3));
    }
    // bumper on the ground
    if (crushed) mb.box(-0.9, 0.0, -2.2, 0.7, 0.08, -2.05, S('chrome'));
  },
  boxes: (p) => [[-0.9, 0, (p.opts.crushed !== false ? -1.8 : -2.3), 0.9, 1.34, 2.3]],
});
P('book', {
  build(mb, p, r) {
    const tint = r.pick([[1, 1, 1], [0.5, 0.7, 1.3], [0.6, 1.2, 0.7], [1.3, 1.1, 0.6], [0.7, 0.6, 0.5]]);
    const st = T('book_cover', { tint });
    const open = p.opts.open ?? r.chance(0.25);
    if (open) {
      withXf(mb, xfRotZ(0.12), () => mb.box(0, 0, -0.11, 0.16, 0.012, 0.11, [st, st, T('paper'), st, st, st], { uv: ['world', 'world', FIT, 'world', 'world', 'world'] }));
      withXf(mb, xfRotZ(-0.12), () => mb.box(-0.16, 0, -0.11, 0, 0.012, 0.11, [st, st, T('paper'), st, st, st], { uv: ['world', 'world', FIT, 'world', 'world', 'world'] }));
    } else {
      mb.box(-0.08, 0, -0.11, 0.08, 0.03, 0.11, st);
    }
  },
});
P('papers', {
  build(mb, p, r) {
    const n = p.opts.n || r.int(2, 6);
    for (let k = 0; k < n; k++) {
      const x = r.range(-0.4, 0.4), z = r.range(-0.4, 0.4), a = r.range(0, Math.PI), y = 0.004 + k * 0.002;
      const c = Math.cos(a) * 0.105, s = Math.sin(a) * 0.105, c2 = Math.cos(a) * 0.15, s2 = Math.sin(a) * 0.15;
      mb.quad([x - c + s2, y, z - s - c2, x + c + s2, y, z + s - c2, x + c - s2, y, z + s + c2, x - c - s2, y, z - s + c2], [0, 1, 0], T('paper'), [0, 1, 1, 1, 1, 0, 0, 0]);
    }
  },
});
P('note', {
  build(mb) {
    mb.quad([-0.105, 0.006, 0.15, 0.105, 0.006, 0.15, 0.105, 0.006, -0.15, -0.105, 0.006, -0.15], [0, 1, 0], T('paper'), [0, 1, 1, 1, 1, 0, 0, 0]);
  },
  use: 'note',
});
P('tile_fallen', {
  build(mb, p, r) {
    withXf(mb, xfRotZ(r.range(-0.08, 0.08)), () => mb.box(-0.3, 0, -0.3, 0.3, 0.02, 0.3, S('ceil_tile')));
  },
});
P('ball', {
  build(mb) {
    // low poly ball: an octagonal prism with caps (reads as a sphere at 320x240)
    mb.cyl(0, 0.04, 0, 0.11, 0.14, 7, S('plastic_white'), 0);
    mb.cyl(0, 0.0, 0, 0.07, 0.04, 7, S('plastic_white'), 2);
    mb.cyl(0, 0.18, 0, 0.07, 0.04, 7, S('plastic_white'), 1);
  },
});
P('stack_chairs', {
  build(mb, p, r) {
    const n = p.opts.n || 30;
    const fr = S('metal_dark', { flags: VF.VIBRATE }), seat = S('metal', { flags: VF.VIBRATE });
    for (let k = 0; k < n; k++) {
      const y = k * 0.07;
      withXf(mb, xfMul(xfTranslate(r.range(-0.015, 0.015), y, r.range(-0.015, 0.015)), xfRotY(r.range(-0.04, 0.04))), () => {
        mb.box(-0.21, 0.42, -0.2, 0.21, 0.45, 0.2, seat, { skip: 8 });
        mb.box(-0.2, 0.62, 0.17, 0.2, 0.84, 0.2, seat);
        for (const s of [-1, 1]) mb.box(s * 0.2 - 0.015, 0, 0.16, s * 0.2 + 0.015, 0.86, 0.19, fr, { skip: 12 });
      });
    }
  },
  boxes: (p) => [[-0.24, 0, -0.24, 0.24, (p.opts.n || 30) * 0.07 + 0.86, 0.24]],
});
P('ladder', {
  build(mb, p) {
    const h = p.opts.h || 3;
    const m = S('metal');
    for (const s of [-1, 1]) mb.box(s * 0.22 - 0.02, 0, -0.02, s * 0.22 + 0.02, h, 0.02, m);
    for (let y = 0.3; y < h; y += 0.3) mb.box(-0.22, y - 0.015, -0.015, 0.22, y + 0.015, 0.015, m);
  },
});
P('door', {
  // free-standing door leaf; opts.open in radians (0 = closed); hinge at local x=-0.45
  build(mb, p) {
    const st = T(p.opts.tex || 'door_wood');
    const a = p.opts.open || 0;
    withXf(mb, xfMul(xfTranslate(-0.42, 0, 0), xfRotY(-a)), () => {
      mb.box(0, 0, -0.025, 0.84, 2.05, 0.025, [S('wood_dark'), S('wood_dark'), S('wood_dark'), null, st, st], { uv: ['world', 'world', 'world', 'world', FIT, FIT] });
      mb.box(0.72, 0.98, -0.07, 0.78, 1.02, 0.07, S('chrome'));
    });
  },
  boxes: (p) => ((p.opts.open || 0) < 0.3 ? [[-0.45, 0, -0.06, 0.45, 2.05, 0.06]] : []),
  use: (p) => ((p.opts.open || 0) < 0.3 ? 'locked' : null),
});
P('rack', {
  // pallet racking bay: 2.7m wide, 1.1m deep, levels of beams with pallets & boxes
  build(mb, p, r) {
    const Wd = p.opts.w || 2.7, D = 1.1, Hh = p.opts.h || 6, levels = p.opts.levels || 3;
    const up = S('rack_blue'), beam = S('rack_orange');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * Wd / 2 - 0.05, 0, sz * D / 2 - 0.05, sx * Wd / 2 + 0.05, Hh, sz * D / 2 + 0.05, up, { skip: 8 });
    for (let k = 1; k <= levels; k++) {
      const y = (k * Hh) / (levels + 0.4);
      for (const sz of [-1, 1]) mb.box(-Wd / 2, y - 0.12, sz * D / 2 - 0.04, Wd / 2, y, sz * D / 2 + 0.04, beam);
    }
    for (let k = 0; k <= levels; k++) {
      const y = k === 0 ? 0 : (k * Hh) / (levels + 0.4);
      if (p.opts.empty || r.chance(0.18)) continue;
      for (const px of [-0.66, 0.66]) {
        if (r.chance(0.2)) continue;
        withXf(mb, xfTranslate(px, y, 0), () => {
          PROPS.pallet.build(mb, p, r);
          const bh = r.range(0.4, 1.2);
          mb.box(-0.55, 0.15, -0.45, 0.55, 0.15 + bh, 0.45, S('cardboard'));
          if (r.chance(0.5)) mb.box(-0.4, 0.15 + bh, -0.3, 0.3, 0.45 + bh, 0.35, S('cardboard'));
        });
      }
    }
  },
  boxes: (p) => {
    const Wd = p.opts.w || 2.7, Hh = p.opts.h || 6;
    return [[-Wd / 2 - 0.06, 0, -0.6, Wd / 2 + 0.06, Hh, 0.6]];
  },
});
P('house_small', {
  // simple two storey suburban house volume used in the scaffolded suburb (not enterable)
  build(mb, p, r) {
    const side = S(p.opts.siding || r.pick(['siding', 'siding_blue']));
    const Wd = 5.4, D = 4.6, H1 = 4.6;
    mb.box(-Wd / 2, 0, -D / 2, Wd / 2, H1, D / 2, side);
    // gable roof
    const roof = S('shingles');
    mb.poly4([-Wd / 2 - 0.2, H1, D / 2 + 0.2], [Wd / 2 + 0.2, H1, D / 2 + 0.2], [Wd / 2 + 0.2, H1 + 1.6, 0], [-Wd / 2 - 0.2, H1 + 1.6, 0], roof, [0, 2, 4, 2, 4, 0, 0, 0]);
    mb.poly4([Wd / 2 + 0.2, H1, -D / 2 - 0.2], [-Wd / 2 - 0.2, H1, -D / 2 - 0.2], [-Wd / 2 - 0.2, H1 + 1.6, 0], [Wd / 2 + 0.2, H1 + 1.6, 0], roof, [0, 2, 4, 2, 4, 0, 0, 0]);
    mb.tri3([Wd / 2, H1, D / 2], [Wd / 2, H1, -D / 2], [Wd / 2, H1 + 1.6, 0], side, [0, 1, 1, 1, 0.5, 0]);
    mb.tri3([-Wd / 2, H1, -D / 2], [-Wd / 2, H1, D / 2], [-Wd / 2, H1 + 1.6, 0], side, [0, 1, 1, 1, 0.5, 0]);
    // glowing windows on the front & back
    for (const zz of [-D / 2 - 0.02, D / 2 + 0.02]) {
      const face = zz < 0 ? 'nz' : 'pz';
      for (const [wx, wy] of [[-1.5, 1.2], [1.5, 1.2], [-1.5, 3.3], [1.5, 3.3]]) {
        const st = r.chance(0.85) ? glow('window_lit', 1.05) : T('window_dark');
        if (face === 'nz') mb.quad([wx + 0.5, wy, zz, wx - 0.5, wy, zz, wx - 0.5, wy + 0.9, zz, wx + 0.5, wy + 0.9, zz], [0, 0, -1], st, [0, 1, 1, 1, 1, 0, 0, 0]);
        else mb.quad([wx - 0.5, wy, zz, wx + 0.5, wy, zz, wx + 0.5, wy + 0.9, zz, wx - 0.5, wy + 0.9, zz], [0, 0, 1], st, [0, 1, 1, 1, 1, 0, 0, 0]);
      }
    }
    mb.quad([0.45, 0, -D / 2 - 0.02, -0.45, 0, -D / 2 - 0.02, -0.45, 2.0, -D / 2 - 0.02, 0.45, 2.0, -D / 2 - 0.02], [0, 0, -1], T('house_door'), [0, 1, 1, 1, 1, 0, 0, 0]);
  },
  boxes: [[-2.8, 0, -2.4, 2.8, 6.2, 2.4]],
});

// ------------------------------------------------------------------ mirages
// A lit hallway seen through a doorway; drawn only from a distance (see zb.dynamic showFar).
// Local: the doorway plane is z = 0, the hallway runs toward +z for opts.len metres.
P('mirage_hall', {
  build(mb, p) {
    const L = p.opts.len || 10, hw = 0.5, h = 2.5;
    const wall = S(p.opts.wall || 'wp_stripe'), floor = S(p.opts.floor || 'carpet_y'), ceil = S('ceil_tile');
    mb.grid(-hw, 0, L, 2 * hw, 0, 0, 0, 0, -L, 1, Math.ceil(L / 2), [0, 1, 0], floor, 'world', floor.su, floor.sv);
    mb.grid(hw, h, L, -2 * hw, 0, 0, 0, 0, -L, 1, Math.ceil(L / 2), [0, -1, 0], ceil, 'world', ceil.su, ceil.sv);
    mb.grid(-hw, 0, 0, 0, 0, L, 0, h, 0, Math.ceil(L / 2), 2, [1, 0, 0], wall, 'world', wall.su, wall.sv);
    mb.grid(hw, 0, L, 0, 0, -L, 0, h, 0, Math.ceil(L / 2), 2, [-1, 0, 0], wall, 'world', wall.su, wall.sv);
    mb.grid(-hw, 0, L, 2 * hw, 0, 0, 0, h, 0, 1, 2, [0, 0, -1], wall, 'world', wall.su, wall.sv);
    for (let z = 1.5; z < L - 0.5; z += 2.5) {
      mb.grid(0.3, h - 0.01, z + 0.3, -0.6, 0, 0, 0, 0, -0.6, 1, 1, [0, -1, 0], glow('light_panel', 1.05), FIT);
    }
  },
});
P('mirage_wall', {
  build(mb, p) {
    const wall = S(p.opts.wall || 'wp_stripe');
    mb.grid(0.5, 0, 0.001, -1, 0, 0, 0, 2.5, 0, 1, 2, [0, 0, -1], wall, 'world', wall.su, wall.sv);
  },
});

// ------------------------------------------------------------------ assembly
const ROT_EPS = 1e-4;

function rotBox(b, a) {
  const c = Math.cos(a), s = Math.sin(a);
  // xfRotY: x' = c*x - s*z ; z' = s*x + c*z
  const pts = [[b[0], b[2]], [b[3], b[2]], [b[0], b[5]], [b[3], b[5]]];
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of pts) {
    const X = c * x - s * z, Z = s * x + c * z;
    x0 = Math.min(x0, X); x1 = Math.max(x1, X); z0 = Math.min(z0, Z); z1 = Math.max(z1, Z);
  }
  const axisAligned = Math.abs(Math.sin(2 * a)) < ROT_EPS;
  if (!axisAligned) {
    // shrink enclosing boxes of rotated props a little so they don't feel bloated
    const shx = (x1 - x0) * 0.1, shz = (z1 - z0) * 0.1;
    x0 += shx; x1 -= shx; z0 += shz; z1 -= shz;
  }
  return [x0, b[1], z0, x1, b[4], z1];
}

export function propLightFor(p) {
  const def = PROPS[p.type];
  if (!def || !def.light) return null;
  const L = def.light;
  if (L.cond && !L.cond(p)) return null;
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  const lx = L.x || 0, lz = L.z || 0;
  return { x: p.x + c * lx - s * lz, y: (p.y || 0) + (p.opts.flip ? -L.y : L.y), z: p.z + s * lx + c * lz, color: L.color, rad: L.rad, int: L.int };
}

export function buildProp(mb, trans, p, y0, tex) {
  const def = PROPS[p.type];
  if (!def) return null;
  if (tex && TEX !== tex) TEX = tex;
  const rng = new RNG(p.seed || 1);
  let xf = xfMul(xfTranslate(p.x, y0 + (p.y || 0), p.z), xfRotY(p.rot || 0));
  if (p.opts.flip) xf = xfMul(xf, xfRotX(Math.PI));
  if (p.opts.tilt) xf = xfMul(xf, xfRotX(p.opts.tilt));
  if (p.opts.roll) xf = xfMul(xf, xfRotZ(p.opts.roll));
  const startN = mb.n;
  mb.xf = xf;
  def.build(mb, p, rng);
  mb.xf = null;
  if (p.opts.flags) for (let i = startN; i < mb.n; i++) mb.flags[i] |= p.opts.flags;
  if (p.opts.tint) for (let i = startN; i < mb.n; i++) { mb.tint[i * 3] *= p.opts.tint[0]; mb.tint[i * 3 + 1] *= p.opts.tint[1]; mb.tint[i * 3 + 2] *= p.opts.tint[2]; }
  const res = { boxes: [], interact: null, emitter: null, dynamic: null };
  if (!p.opts.flip && p.opts.collide !== false) {
    const bl = typeof def.boxes === 'function' ? def.boxes(p) : def.boxes;
    if (bl) {
      for (const b of bl) {
        const r = rotBox(b, p.rot || 0);
        res.boxes.push([p.x + r[0], y0 + (p.y || 0) + r[1], p.z + r[2], p.x + r[3], y0 + (p.y || 0) + r[4], p.z + r[5], 255]);
      }
    }
  }
  const use = typeof def.use === 'function' ? def.use(p) : def.use;
  if (use || p.opts.use) {
    res.interact = { x: p.x, y: y0 + (p.y || 0) + (p.opts.useY ?? 0.6), z: p.z, kind: p.opts.use || use, prop: p, r: p.opts.useR || 0.7 };
  }
  if (def.emitter && (!def.emitter.cond || def.emitter.cond(p))) {
    res.emitter = { x: p.x, y: y0 + (p.y || 0) + (def.emitter.y || 0.5), z: p.z, snd: def.emitter.snd, vol: def.emitter.vol, rad: def.emitter.rad };
  }
  return res;
}
