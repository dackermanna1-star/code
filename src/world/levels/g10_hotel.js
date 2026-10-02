// Group 10: furniture of the two hotel pools (levels 50 and 90). The same geometry is defined
// twice under different prefixes, with a material table per level, so the abandoned pool uses
// grey sheets and dead fronds where the night pool has striped towels and living palms.
import { defineProp, propMat as S, propTex as T, propGlow as G, propWithXf as withXf } from '../props.js';
import { xfMul, xfTranslate, xfRotY, xfRotX, xfRotZ } from '../../core/math.js';

const FIT = [0, 0, 1, 1];

// mats: { cushion, frame, canopy, canopyB, trunk, frond (texture), post, stone, lampGlow (texture) }
export function defineHotelProps(pre, mats, opt = {}) {
  const dead = !!opt.dead;

  // a sun lounger: head toward +z, the back rest raised
  defineProp(pre + '_lounger', {
    build(mb, p, r) {
      const fr = S(mats.frame), cu = S(mats.cushion, p.opts.tint ? { tint: p.opts.tint } : undefined);
      for (const sx of [-1, 1]) {
        mb.box(sx * 0.3 - 0.025, 0.2, -0.95, sx * 0.3 + 0.025, 0.26, 0.3, fr, { skip: 8 });
        mb.box(sx * 0.3 - 0.025, 0, -0.9, sx * 0.3 + 0.025, 0.2, -0.84, fr, { skip: 12 });
        mb.box(sx * 0.3 - 0.025, 0, 0.22, sx * 0.3 + 0.025, 0.2, 0.28, fr, { skip: 12 });
      }
      mb.box(-0.29, 0.26, -0.98, 0.29, 0.33, 0.3, cu);
      const up = p.opts.up ?? (dead ? r.range(0.2, 0.7) : 0.62);
      // back rest hinged at z = 0.3
      const bz = 0.3 + 0.7 * Math.cos(up), by = 0.28 + 0.7 * Math.sin(up);
      mb.poly4([0.29, 0.33, 0.3], [-0.29, 0.33, 0.3], [-0.29, by + 0.06, bz], [0.29, by + 0.06, bz], cu, [0, 1, 1, 1, 1, 0, 0, 0]);
      mb.poly4([-0.29, 0.26, 0.3], [0.29, 0.26, 0.3], [0.29, by, bz], [-0.29, by, bz], fr, [0, 1, 1, 1, 1, 0, 0, 0]);
      mb.tri3([-0.29, 0.26, 0.3], [-0.29, by, bz], [-0.29, 0.33, 0.3], fr, [0, 1, 1, 0, 0, 0]);
      mb.tri3([0.29, 0.26, 0.3], [0.29, 0.33, 0.3], [0.29, by, bz], fr, [0, 1, 1, 0, 0, 0]);
    },
    boxes: [[-0.32, 0, -1.0, 0.32, 0.5, 1.0]],
  });

  // a table and a closed parasol leaning in a stand
  defineProp(pre + '_table', {
    build(mb, p) {
      mb.cyl(0, 0, 0, 0.3, 0.04, 8, S(mats.frame), 3);
      mb.cyl(0, 0.04, 0, 0.03, 0.5, 4, S(mats.frame), 0);
      mb.cyl(0, 0.54, 0, 0.36, 0.04, 8, S(mats.stone), 3);
      if (p.opts.lamp) {
        mb.cyl(0, 0.58, 0, 0.05, 0.1, 5, S(mats.frame), 3);
        mb.cyl(0, 0.68, 0, 0.07, 0.1, 6, G(mats.lampGlow, 1.0), 3);
      }
    },
    boxes: [[-0.36, 0, -0.36, 0.36, 0.6, 0.36]],
    light: { y: 0.8, color: [1.0, 0.78, 0.5], rad: 4, int: 0.4, cond: (p) => !!p.opts.lamp },
  });

  // an open parasol: a pole and eight panels
  defineProp(pre + '_parasol', {
    build(mb, p, r) {
      const R = p.opts.r || 1.7, h = p.opts.h || 2.3, tilt = dead ? r.range(-0.25, 0.25) : 0;
      const a = S(mats.canopy), b = S(mats.canopyB);
      mb.cyl(0, 0, 0, 0.2, 0.05, 6, S(mats.frame), 3);
      mb.cyl(0, 0.05, 0, 0.025, h, 4, S(mats.frame), 0);
      withXf(mb, xfMul(xfTranslate(0, h, 0), xfRotX(tilt)), () => {
        for (let k = 0; k < 8; k++) {
          const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
          const st = k % 2 ? a : b;
          mb.tri3([0, 0.32, 0], [Math.sin(a1) * R, 0, -Math.cos(a1) * R], [Math.sin(a0) * R, 0, -Math.cos(a0) * R], st, [0.5, 0, 1, 1, 0, 1]);
          mb.tri3([0, 0.32, 0], [Math.sin(a0) * R, 0, -Math.cos(a0) * R], [Math.sin(a1) * R, 0, -Math.cos(a1) * R], st, [0.5, 0, 0, 1, 1, 1]);
        }
      });
    },
    boxes: [[-0.15, 0, -0.15, 0.15, 2.4, 0.15]],
  });

  // a palm: a leaning trunk and a crown of fronds
  defineProp(pre + '_palm', {
    build(mb, p, r) {
      const H = p.opts.h || r.range(4.5, 6.5), lean = r.range(-0.18, 0.18), lean2 = r.range(-0.18, 0.18);
      const tr = S(mats.trunk);
      let x = 0, z = 0, y = 0;
      const segs = 4;
      for (let k = 0; k < segs; k++) {
        const nx = x + lean * (H / segs) * (0.4 + k * 0.3), nz = z + lean2 * (H / segs) * (0.4 + k * 0.3);
        mb.rod(x, y, z, nx, y + H / segs, nz, 0.16 - k * 0.018, 6, tr);
        x = nx; z = nz; y += H / segs;
      }
      const fr = T(mats.frond, { lit: true });
      const n = dead ? 6 : 9;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r.range(-0.2, 0.2);
        const L = (dead ? 1.6 : 2.2) + r.range(-0.2, 0.3), drop = dead ? r.range(0.8, 1.6) : r.range(0.35, 0.8);
        const sx = Math.sin(a), sz = -Math.cos(a), px = -sz, pz = sx, w = 0.55;
        mb.card([x - px * 0.04, y, z - pz * 0.04, x + px * 0.04, y, z + pz * 0.04, x + sx * L + px * w, y - drop, z + sz * L + pz * w, x + sx * L - px * w, y - drop, z + sz * L - pz * w], [0, 1, 0], fr, [0, 1, 1, 1, 1, 0, 0, 0]);
      }
    },
    boxes: [[-0.2, 0, -0.2, 0.2, 3, 0.2]],
  });

  // a stone planter, with or without a plant
  defineProp(pre + '_planter', {
    build(mb, p, r) {
      const s = p.opts.s || 0.9;
      mb.box(-s / 2, 0, -s / 2, s / 2, 0.55, s / 2, S(mats.stone));
      mb.box(-s / 2 - 0.04, 0.55, -s / 2 - 0.04, s / 2 + 0.04, 0.6, s / 2 + 0.04, S(mats.stone));
      const fr = T(mats.frond, { lit: true });
      const h = dead ? r.range(0.3, 0.6) : r.range(0.9, 1.3);
      for (let k = 0; k < 3; k++) {
        const a = r.range(0, Math.PI), c = Math.cos(a) * 0.5, sn = Math.sin(a) * 0.5;
        mb.card([-c, 0.58, -sn, c, 0.58, sn, c * 0.8, 0.58 + h, sn * 0.8, -c * 0.8, 0.58 + h, -sn * 0.8], [sn, 0, -c], fr, [0, 1, 1, 1, 1, 0, 0, 0]);
      }
    },
    boxes: (p) => { const s = (p.opts.s || 0.9) / 2 + 0.04; return [[-s, 0, -s, s, 0.6, s]]; },
  });

  // a cabana: four posts, a striped roof, a daybed, curtains tied back
  defineProp(pre + '_cabana', {
    build(mb, p, r) {
      const W = p.opts.w || 4.2, D = p.opts.d || 3.2, H = 2.7;
      const post = S(mats.post), a = S(mats.canopy), b = S(mats.canopyB);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * W / 2 - 0.06, 0, sz * D / 2 - 0.06, sx * W / 2 + 0.06, H, sz * D / 2 + 0.06, post, { skip: 8 });
      // roof: pitched, panels alternate
      const n = Math.round(W / 0.7);
      for (let k = 0; k < n; k++) {
        const x0 = -W / 2 - 0.2 + (k * (W + 0.4)) / n, x1 = -W / 2 - 0.2 + ((k + 1) * (W + 0.4)) / n;
        const st = k % 2 ? a : b;
        mb.poly4([x0, H, D / 2 + 0.25], [x1, H, D / 2 + 0.25], [x1, H + 0.5, 0], [x0, H + 0.5, 0], st, [0, 1, 1, 1, 1, 0, 0, 0]);
        mb.poly4([x0, H + 0.5, 0], [x1, H + 0.5, 0], [x1, H, -D / 2 - 0.25], [x0, H, -D / 2 - 0.25], st, [0, 1, 1, 1, 1, 0, 0, 0]);
        // underside, so the roof reads from below
        mb.poly4([x1, H, D / 2 + 0.25], [x0, H, D / 2 + 0.25], [x0, H + 0.48, 0], [x1, H + 0.48, 0], st, [0, 1, 1, 1, 1, 0, 0, 0]);
        mb.poly4([x1, H + 0.48, 0], [x0, H + 0.48, 0], [x0, H, -D / 2 - 0.25], [x1, H, -D / 2 - 0.25], st, [0, 1, 1, 1, 1, 0, 0, 0]);
      }
      // back wall of fabric (+z side) and the daybed
      mb.box(-W / 2, 0.1, D / 2 - 0.05, W / 2, H - 0.05, D / 2 - 0.03, a, { skip: 8 });
      if (!p.opts.door) {
        mb.box(-W / 2 + 0.35, 0.0, -D / 2 + 0.7, W / 2 - 0.35, 0.34, D / 2 - 0.45, S(mats.post));
        mb.box(-W / 2 + 0.35, 0.34, -D / 2 + 0.7, W / 2 - 0.35, 0.5, D / 2 - 0.45, S(mats.cushion));
        for (let k = 0; k < 3; k++) mb.box(-W / 2 + 0.5 + k * 0.62, 0.5, D / 2 - 0.9, -W / 2 + 1.0 + k * 0.62, 0.7, D / 2 - 0.5, S(mats.cushion, { tint: [1.2, 1.2, 1.2] }));
      }
      // curtains
      for (const sx of [-1, 1]) mb.box(sx * (W / 2 - 0.12) - 0.04, 0.05, -D / 2 + 0.05, sx * (W / 2 - 0.12) + 0.04, H - 0.1, -D / 2 + 0.45, a);
      if (!dead) mb.box(-0.08, H - 0.45, 0, 0.08, H - 0.2, 0.16, G(mats.lampGlow, 1.0), { skip: 4 });
    },
    boxes: (p) => { const W = p.opts.w || 4.2, D = p.opts.d || 3.2; return [...(p.opts.door ? [] : [[-W / 2 + 0.3, 0, -D / 2 + 0.65, W / 2 - 0.3, 0.7, D / 2 - 0.4]]), [-W / 2 - 0.08, 0, D / 2 - 0.08, W / 2 + 0.08, 2.6, D / 2 + 0.02]]; },
    light: { y: 2.2, z: 0.1, color: [1.0, 0.76, 0.46], rad: 6, int: 0.62, cond: () => !dead },
  });

  // a tall post lamp with a globe
  defineProp(pre + '_lamp', {
    build(mb, p) {
      const H = p.opts.h || 3.8, on = !dead && p.opts.on !== false;
      mb.cyl(0, 0, 0, 0.17, 0.35, 6, S(mats.post), 3);
      mb.cyl(0, 0.35, 0, 0.055, H - 0.35, 5, S(mats.frame), 0);
      mb.cyl(0, H - 0.1, 0, 0.12, 0.1, 6, S(mats.frame), 3);
      if (on) mb.cyl(0, H, 0, 0.2, 0.34, 7, G(mats.lampGlow, 1.05), 2);
      else mb.cyl(0, H, 0, 0.2, 0.34, 7, S(mats.post, { tint: [0.6, 0.6, 0.6] }), 2);
      mb.cyl(0, H + 0.34, 0, 0.12, 0.06, 6, S(mats.frame), 3);
    },
    boxes: [[-0.17, 0, -0.17, 0.17, 3.8, 0.17]],
    light: { y: 3.6, color: [1.0, 0.78, 0.48], rad: 9, int: 0.82, cond: (p) => !dead && p.opts.on !== false },
  });
}
