import * as THREE from 'three';
import { SIGN_UV, PROP_UV, rng, hash2 } from './textures.js';

/**
 * Buildings of the valley, merged into a Bank (one builder per material). Houses are four wall
 * slabs (so a burnt house can be an open shell under a half-collapsed roof), gable roofs with
 * overhangs, window and door decals, porches, chimneys; soot is baked into the vertex colours.
 *
 * Materials used: clap, planks, red, brick, charred, shingle, corr, concrete, window, windowBroken,
 * black, signs, paint, stone, steel, glass.
 */

const SIGN_TEX = [256, 256];

function smooth01(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Atlas helper for the signs texture. */
export function signAtlas(key) {
  return { tex: SIGN_TEX, all: SIGN_UV[key] };
}

/** A flat decal quad on a wall plane z = zf (local), facing +z, from (x0, y0) to (x1, y1). */
function decalZ(b, x0, y0, x1, y1, zf, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
  b.quad([x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf], uv[0], uv[1], uv[2], uv[3], [0, 0, 1]);
}

function rectUV(atlasRect, W = 256, H = 256) {
  const [x, y, w, h] = atlasRect;
  const u0 = x / W, u1 = (x + w) / W, v0 = 1 - (y + h) / H, v1 = 1 - y / H;
  return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
}

/**
 * A house. spec: { pos, yaw, size: [w, d, h], storeys, wall: 'clapboard'|'planks'|'brick',
 * roof, porch, chimney, burnt (0..1), help (HELP painted on the roof), id }.
 * Local frame: x across the front, z out of the front, y up; ridge along x.
 */
export function house(bank, spec, R = rng(hashId(spec.id))) {
  const [w, d, h] = spec.size;
  const burnt = spec.burnt ?? 0;
  const shell = burnt > 0.55;
  bank.at(spec.pos[0], 0, spec.pos[1], spec.yaw);
  const wallMat = spec.wall === 'brick' ? 'brick' : spec.wall === 'planks' ? 'planks' : 'clap';
  const W = bank.b(shell && wallMat !== 'brick' ? 'charred' : wallMat);
  const soot = (wx, wy) => 1 - burnt * 0.75 * smooth01(h * 0.3, h + 0.5, wy) * (0.7 + 0.3 * hash2(Math.floor(wx), Math.floor(wy), 3));
  W.vc = soot;
  W.setColor(spec.wall === 'clapboard' ? [0.96, 0.95, 0.9] : [1, 1, 1]);
  const t = 0.2;
  const tile = wallMat === 'brick' ? [2.4, 2.4] : wallMat === 'clap' ? [2, 2] : [2.4, 2.4];
  // walls: front/back full width, sides between them
  W.box(0, h / 2, d / 2 - t / 2, w, h, t, { uv: tile });
  W.box(0, h / 2, -d / 2 + t / 2, w, h, t, { uv: tile });
  W.box(w / 2 - t / 2, h / 2, 0, t, h, d - 2 * t, { uv: tile });
  W.box(-w / 2 + t / 2, h / 2, 0, t, h, d - 2 * t, { uv: tile });
  W.vc = null;
  // foundation
  bank.b('concrete').setColor(0.8, 0.78, 0.74).box(0, 0.12, 0, w + 0.3, 0.24, d + 0.3, { uv: [3, 3], skip: 'ny' });
  // floor inside a shell: charred debris
  if (shell) {
    const C = bank.b('charred');
    C.setColor(0.6, 0.6, 0.6);
    C.box(0, 0.3, 0, w - 2 * t, 0.1, d - 2 * t, { uv: [2, 2], skip: 'ny' });
    // fallen beams inside
    for (let k = 0; k < 4; k++) {
      const x0 = (R() - 0.5) * (w - 1), z0 = (R() - 0.5) * (d - 1);
      C.beam([x0 - 1.4, 0.35, z0 - 0.6], [x0 + 1.4, 0.35 + R() * 1.2, z0 + 0.6], 0.18);
    }
  }
  // gable roof: ridge along x
  const pitch = spec.storeys === 1 ? 0.62 : 0.7;
  const rh = (d / 2) * Math.tan(pitch * 0.85) * 0.75;
  const oh = 0.45;
  const roofMat = shell ? 'charred' : 'shingle';
  const Rf = bank.b(roofMat);
  Rf.setColor(shell ? [0.7, 0.7, 0.7] : [0.95, 0.95, 0.95]);
  const ex = w / 2 + oh, ez = d / 2 + oh, ey = h - oh * (rh / (d / 2)), ry = h + rh;
  const roofLen = Math.hypot(ez, ry - ey);
  // roof as strips along x so a burnt roof can lose some of them
  const strips = 6;
  const holeA = shell ? Math.floor(R() * 3) : -1, holeB = shell ? holeA + 1 + Math.floor(R() * 3) : -1;
  for (const side of [1, -1]) {
    for (let s = 0; s < strips; s++) {
      const xa = -ex + (2 * ex * s) / strips, xb = -ex + (2 * ex * (s + 1)) / strips;
      if (shell && s >= holeA && s <= holeB && (side === 1 || R() < 0.6)) {
        // exposed rafters
        const C = bank.b('charred');
        for (let k = 0; k < 2; k++) {
          const xr = xa + ((k + 0.5) * (xb - xa)) / 2;
          C.beam([xr, ey, side * ez * 0.95], [xr, ry, 0], 0.14);
        }
        continue;
      }
      const a = [xa, ey, side * ez], bb = [xb, ey, side * ez], c = [xb, ry, 0], dd = [xa, ry, 0];
      const uvs = [[xa / 3, 0], [xb / 3, 0], [xb / 3, roofLen / 3], [xa / 3, roofLen / 3]];
      if (side === 1) Rf.quad(a, bb, c, dd, uvs[0], uvs[1], uvs[2], uvs[3]);
      else Rf.quad(bb, a, dd, c, uvs[1], uvs[0], uvs[3], uvs[2]);
      // roof thickness edge (fascia)
    }
  }
  // gable triangles (walls)
  const G = bank.b(shell && wallMat !== 'brick' ? 'charred' : wallMat);
  G.vc = soot;
  for (const sx of [1, -1]) {
    const x = (sx * w) / 2;
    const p0 = [x, h, -d / 2], p1 = [x, h, d / 2], p2 = [x, ry - 0.05, 0];
    if (sx > 0) G.tri(p1, p0, p2, [d / 2 / tile[0], h / tile[1]], [-d / 2 / tile[0], h / tile[1]], [0, (h + rh) / tile[1]]);
    else G.tri(p0, p1, p2, [-d / 2 / tile[0], h / tile[1]], [d / 2 / tile[0], h / tile[1]], [0, (h + rh) / tile[1]]);
  }
  G.vc = null;
  // chimney
  if (spec.chimney) {
    const B = bank.b('brick');
    B.vc = soot;
    B.box(w / 2 - 1.2, (ry + 0.9) / 2, -d * 0.18, 0.7, ry + 0.9, 0.7, { uv: [2.4, 2.4] });
    B.vc = null;
  }
  // windows & doors on the walls (decals 2 cm proud)
  const storeys = spec.storeys ?? 1;
  const sh = h / storeys;
  const win = shell ? 'black' : burnt > 0.3 || R() < 0.3 ? 'windowBroken' : 'window';
  const Wn = bank.b(win);
  Wn.setColor(shell ? [0.05, 0.04, 0.04] : [1, 1, 1]);
  const addWindows = (len, zf, rotY, door) => {
    bank.push();
    bank.local(0, 0, 0, rotY);
    const n = Math.max(1, Math.floor(len / 2.6));
    for (let st = 0; st < storeys; st++) {
      for (let k = 0; k < n; k++) {
        const cx = -len / 2 + (len * (k + 0.5)) / n;
        if (door && st === 0 && k === Math.floor(n / 2)) {
          // door
          bank.b(shell ? 'black' : 'planks').setColor(shell ? [0.05, 0.04, 0.04] : [0.55, 0.42, 0.32]);
          decalZ(bank.b(shell ? 'black' : 'planks'), cx - 0.5, 0.25, cx + 0.5, 2.25, zf + 0.025);
          continue;
        }
        const y0 = st * sh + 0.95, y1 = Math.min(st * sh + 2.25, h - 0.25);
        decalZ(Wn, cx - 0.55, y0, cx + 0.55, y1, zf + 0.025);
        if (shell || burnt > 0.3) {
          // soot plume above the window
          const S = bank.b('black');
          S.setColor(0.05, 0.04, 0.04);
          S.quad([cx - 0.5, y1, zf + 0.022], [cx + 0.5, y1, zf + 0.022], [cx + 0.2, Math.min(h, y1 + 1.0), zf + 0.022], [cx - 0.25, Math.min(h, y1 + 0.9), zf + 0.022], [0, 0], [1, 0], [1, 1], [0, 1], [0, 0, 1]);
        }
      }
    }
    bank.pop();
  };
  // front (+z), back (-z), sides (+x, -x): rotate the local frame so each wall is "z = zf"
  addWindows(w, d / 2, 0, true);
  addWindows(w, d / 2, Math.PI, false);
  addWindows(d, w / 2, Math.PI / 2, false);
  addWindows(d, w / 2, -Math.PI / 2, false);
  // porch on the front
  if (spec.porch) {
    const P = bank.b('planks');
    P.setColor(0.85, 0.8, 0.72);
    P.box(0, 0.3, d / 2 + 1.1, w * 0.8, 0.12, 2.2, { uv: [2.4, 2.4] });
    for (const sx of [-1, 1]) for (const f of [0.38, 0.0]) {
      if (f === 0 && storeys > 1) continue;
      P.box(sx * w * f + sx * (f === 0 ? 0.0 : 0), 1.45, d / 2 + 2.05, 0.14, 2.3, 0.14, { uv: [2.4, 2.4] });
    }
    const pr = bank.b(shell ? 'charred' : 'corr');
    pr.setColor(0.9, 0.9, 0.9);
    pr.quad([-w * 0.42, 2.6, d / 2 + 2.3], [w * 0.42, 2.6, d / 2 + 2.3], [w * 0.42, 3.0, d / 2], [-w * 0.42, 3.0, d / 2], [0, 0], [w * 0.84, 0], [w * 0.84, 2.3], [0, 2.3]);
  }
  // HELP on the roof (the side facing the tower)
  if (spec.help) {
    const S = bank.b('signs');
    const uv = rectUV(SIGN_UV.help);
    const side = 1;
    const k0 = 0.2, k1 = 0.85;
    const p = (u, k) => [u, ey + (ry - ey) * k + 0.04, side * ez * (1 - k)];
    S.quad(p(-ex * 0.75, k0), p(ex * 0.75, k0), p(ex * 0.75, k1), p(-ex * 0.75, k1), uv[0], uv[1], uv[2], uv[3]);
  }
  bank.identity();
}

function hashId(id = '') {
  let h = 7;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** The red barn: gambrel roof, ridge along local z (its long axis), doors on the +z gable. */
export function barn(bank, spec) {
  const [w, d, h] = spec.size;
  bank.at(spec.pos[0], 0, spec.pos[1], spec.yaw);
  const Rd = bank.b('red');
  Rd.setColor(0.95, 0.92, 0.9);
  const t = 0.2;
  Rd.box(-w / 2 + t / 2, h / 2, 0, t, h, d, { uv: [2.4, 2.4] });
  Rd.box(w / 2 - t / 2, h / 2, 0, t, h, d, { uv: [2.4, 2.4] });
  Rd.box(0, h / 2, -d / 2 + t / 2, w - 2 * t, h, t, { uv: [2.4, 2.4] });
  Rd.box(0, h / 2, d / 2 - t / 2, w - 2 * t, h, t, { uv: [2.4, 2.4] });
  bank.b('concrete').setColor(0.75, 0.73, 0.7).box(0, 0.15, 0, w + 0.4, 0.3, d + 0.4, { uv: [3, 3], skip: 'ny' });
  // gambrel profile (x, y) from eave to ridge
  const kx = w / 2 - 1.7, ky = h + 2.9, ry = h + 4.6, oh = 0.5;
  const prof = [[w / 2 + oh, h - 0.35], [kx, ky], [0, ry]];
  const C = bank.b('corr');
  C.setColor(0.95, 0.95, 0.95);
  const zf = d / 2 + 0.4, zb = -d / 2 - 0.4;
  for (const sx of [1, -1]) {
    for (let i = 0; i < 2; i++) {
      const [x0, y0] = prof[i], [x1, y1] = prof[i + 1];
      const L0 = 0, L1 = Math.hypot(x1 - x0, y1 - y0);
      if (sx > 0) C.quad([x0, y0, zf], [x0, y0, zb], [x1, y1, zb], [x1, y1, zf], [zf / 1.2, L0], [zb / 1.2, L0], [zb / 1.2, L1], [zf / 1.2, L1]);
      else C.quad([-x0, y0, zb], [-x0, y0, zf], [-x1, y1, zf], [-x1, y1, zb], [zb / 1.2, L0], [zf / 1.2, L0], [zf / 1.2, L1], [zb / 1.2, L1]);
    }
  }
  // gable ends (red boards): polygon fan
  for (const sz of [1, -1]) {
    const z = (sz * d) / 2;
    const pts = [[-w / 2, h], [w / 2, h], [kx, ky], [0, ry], [-kx, ky]];
    const uv = (p) => [p[0] / 2.4, p[1] / 2.4];
    const tri = (a, b2, c) => (sz > 0 ? Rd.tri([a[0], a[1], z], [b2[0], b2[1], z], [c[0], c[1], z], uv(a), uv(b2), uv(c)) : Rd.tri([b2[0], b2[1], z], [a[0], a[1], z], [c[0], c[1], z], uv(b2), uv(a), uv(c)));
    tri(pts[0], pts[1], pts[2]);
    tri(pts[0], pts[2], pts[4]);
    tri(pts[4], pts[2], pts[3]);
  }
  // big doors with white X trim on the front gable, the hayloft door above
  const Wt = bank.b('planks');
  Wt.setColor(0.95, 0.93, 0.86);
  const zd = d / 2 + 0.03;
  for (const sx of [-1, 1]) {
    const x0 = sx > 0 ? 0.05 : -2.6, x1 = sx > 0 ? 2.6 : -0.05;
    // frame
    Wt.box((x0 + x1) / 2, 4.1, zd, x1 - x0, 0.18, 0.06, { uv: [2.4, 2.4] });
    Wt.box((x0 + x1) / 2, 0.15, zd, x1 - x0, 0.18, 0.06, { uv: [2.4, 2.4] });
    Wt.box(x0 + 0.09, 2.1, zd, 0.18, 4.1, 0.06, { uv: [2.4, 2.4] });
    Wt.box(x1 - 0.09, 2.1, zd, 0.18, 4.1, 0.06, { uv: [2.4, 2.4] });
    Wt.beam([x0 + 0.1, 0.2, zd], [x1 - 0.1, 4.0, zd], 0.14);
    Wt.beam([x1 - 0.1, 0.2, zd], [x0 + 0.1, 4.0, zd], 0.14);
  }
  // one door hangs open (dark gap behind)
  bank.b('black').setColor(0.03, 0.03, 0.03);
  decalZ(bank.b('black'), -1.0, 5.2, 1.0, 6.6, d / 2 + 0.02);
  Wt.box(0, 5.15, zd, 2.3, 0.14, 0.06, { uv: [2.4, 2.4] });
  Wt.box(0, 6.65, zd, 2.3, 0.14, 0.06, { uv: [2.4, 2.4] });
  // weathervane
  const S = bank.b('steel');
  S.beam([0, ry, d / 2 - 2], [0, ry + 1.6, d / 2 - 2], 0.06);
  S.beam([-0.5, ry + 1.4, d / 2 - 2], [0.6, ry + 1.4, d / 2 - 2], 0.04);
  bank.identity();
}

/** Silo: corrugated cylinder, domed cap, cage ladder. */
export function silo(bank, s) {
  bank.at(s.pos[0], 0, s.pos[1], 0);
  const C = bank.b('corr');
  C.setColor(0.86, 0.86, 0.84);
  C.cyl(0, 0, 0, s.r, s.h, { seg: 16, caps: '', uv: [1.0, 1.0] });
  // cap: a shallow cone in two steps
  const S = bank.b('steel');
  S.setColor(0.8, 0.8, 0.8);
  S.cyl(0, s.h, 0, s.r + 0.15, s.r * 0.45, { seg: 16, r1: s.r * 0.35, caps: '', uv: [1, 1] });
  S.cyl(0, s.h + s.r * 0.45, 0, s.r * 0.35, 0.6, { seg: 8, r1: 0.25, caps: 'top', uv: [1, 1] });
  // ladder
  const ang = Math.PI * 1.2;
  const lx = Math.cos(ang) * (s.r + 0.25), lz = Math.sin(ang) * (s.r + 0.25);
  const tx = -Math.sin(ang) * 0.25, tz = Math.cos(ang) * 0.25;
  S.beam([lx + tx, 1.5, lz + tz], [lx + tx, s.h, lz + tz], 0.05);
  S.beam([lx - tx, 1.5, lz - tz], [lx - tx, s.h, lz - tz], 0.05);
  for (let y = 2; y < s.h; y += 0.6) S.beam([lx + tx, y, lz + tz], [lx - tx, y, lz - tz], 0.03);
  bank.b('concrete').setColor(0.75, 0.73, 0.7).cyl(0, 0, 0, s.r + 0.3, 0.3, { seg: 16, caps: 'top', uv: [3, 3] });
  bank.identity();
}

/** The church: nave with a steep roof, a steeple at the front (local +z) with belfry and spire. */
export function church(bank, spec) {
  const [w, d, h] = spec.size;
  bank.at(spec.pos[0], 0, spec.pos[1], spec.yaw);
  const soot = (wx, wy) => 1 - 0.55 * smooth01(h * 0.5, h + 3, wy) * (0.6 + 0.4 * hash2(Math.floor(wx * 0.5), Math.floor(wy), 5));
  const W = bank.b('clap');
  W.setColor(0.93, 0.92, 0.88);
  W.vc = soot;
  const t = 0.22;
  W.box(-w / 2 + t / 2, h / 2, 0, t, h, d, { uv: [2, 2] });
  W.box(w / 2 - t / 2, h / 2, 0, t, h, d, { uv: [2, 2] });
  W.box(0, h / 2, -d / 2 + t / 2, w - 2 * t, h, t, { uv: [2, 2] });
  W.box(0, h / 2, d / 2 - t / 2, w - 2 * t, h, t, { uv: [2, 2] });
  // steep roof, ridge along z
  const rh = w * 0.62, oh = 0.4;
  const Rf = bank.b('shingle');
  Rf.setColor(0.8, 0.8, 0.82);
  const ex = w / 2 + oh, ey = h - 0.25, ry = h + rh;
  const L = Math.hypot(ex, ry - ey);
  const zf = d / 2 + oh, zb = -d / 2 - oh;
  Rf.quad([ex, ey, zf], [ex, ey, zb], [0, ry, zb], [0, ry, zf], [zf / 3, 0], [zb / 3, 0], [zb / 3, L / 3], [zf / 3, L / 3]);
  // the far slope has burnt through near the back
  Rf.quad([-ex, ey, zb * 0.1], [-ex, ey, zf], [0, ry, zf], [0, ry, zb * 0.1], [zb * 0.03, 0], [zf / 3, 0], [zf / 3, L / 3], [zb * 0.03, L / 3]);
  const C = bank.b('charred');
  for (let z = zb + 0.5; z < zb * 0.1; z += 1.2) C.beam([-ex * 0.95, ey, z], [0, ry, z], 0.14);
  for (const sz of [1, -1]) {
    const z = (sz * d) / 2;
    if (sz > 0) W.tri([-w / 2, h, z], [w / 2, h, z], [0, ry - 0.05, z], [-w / 4, h / 2], [w / 4, h / 2], [0, ry / 2]);
    else W.tri([w / 2, h, z], [-w / 2, h, z], [0, ry - 0.05, z], [w / 4, h / 2], [-w / 4, h / 2], [0, ry / 2]);
  }
  W.vc = null;
  // tall pointed windows along both sides
  const Bk = bank.b('black');
  Bk.setColor(0.06, 0.05, 0.07);
  for (const sx of [1, -1]) {
    for (let k = 0; k < 4; k++) {
      const z = -d / 2 + 2.6 + k * ((d - 5.2) / 3);
      const x = sx * (w / 2 + 0.02);
      const p = (zz, y) => [x, y, zz];
      if (sx > 0) {
        Bk.quad(p(z + 0.5, 1.3), p(z - 0.5, 1.3), p(z - 0.5, 3.9), p(z + 0.5, 3.9), [0, 0], [1, 0], [1, 1], [0, 1], [1, 0, 0]);
        Bk.tri(p(z + 0.5, 3.9), p(z - 0.5, 3.9), p(z, 4.6), [0, 0], [1, 0], [0.5, 1], [1, 0, 0]);
      } else {
        Bk.quad(p(z - 0.5, 1.3), p(z + 0.5, 1.3), p(z + 0.5, 3.9), p(z - 0.5, 3.9), [0, 0], [1, 0], [1, 1], [0, 1], [-1, 0, 0]);
        Bk.tri(p(z - 0.5, 3.9), p(z + 0.5, 3.9), p(z, 4.6), [0, 0], [1, 0], [0.5, 1], [-1, 0, 0]);
      }
    }
  }
  // the steeple at the front
  const sz0 = d / 2 + 1.9;
  const T = bank.b('clap');
  T.setColor(0.95, 0.94, 0.9);
  T.vc = (wx, wy) => 1 - 0.35 * smooth01(8, 15, wy);
  T.box(0, 6, sz0, 3.6, 12, 3.6, { uv: [2, 2] });
  // belfry: four corner posts, louvres, a small roof edge
  for (const sx of [-1, 1]) for (const szz of [-1, 1]) T.box(sx * 1.55, 13.5, sz0 + szz * 1.55, 0.4, 3, 0.4, { uv: [2, 2] });
  T.box(0, 12.1, sz0, 3.9, 0.25, 3.9, { uv: [2, 2] });
  T.box(0, 15.1, sz0, 3.9, 0.25, 3.9, { uv: [2, 2] });
  T.vc = null;
  bank.b('black').setColor(0.05, 0.05, 0.06).box(0, 13.5, sz0, 2.8, 2.8, 2.8, { uv: [1, 1], skip: 'py ny' });
  // spire (4-sided pyramid) and the cross
  const Sp = bank.b('shingle');
  Sp.setColor(0.75, 0.75, 0.78);
  const sb = 15.2, st = 23.2, hs = 2.0;
  const P = (x, y, z) => [x, y, sz0 + z];
  Sp.tri(P(-hs, sb, hs), P(hs, sb, hs), P(0, st, 0), [0, 0], [1.3, 0], [0.65, 2.6]);
  Sp.tri(P(hs, sb, hs), P(hs, sb, -hs), P(0, st, 0), [0, 0], [1.3, 0], [0.65, 2.6]);
  Sp.tri(P(hs, sb, -hs), P(-hs, sb, -hs), P(0, st, 0), [0, 0], [1.3, 0], [0.65, 2.6]);
  Sp.tri(P(-hs, sb, -hs), P(-hs, sb, hs), P(0, st, 0), [0, 0], [1.3, 0], [0.65, 2.6]);
  const S = bank.b('steel');
  S.setColor(0.35, 0.35, 0.35);
  S.beam(P(0, st - 0.2, 0), P(0, st + 1.6, 0), 0.1);
  S.beam(P(-0.5, st + 1.1, 0), P(0.5, st + 1.1, 0), 0.09);
  // the doors (double, dark), steps
  decalZ(Bk, -0.8, 0.3, 0.8, 2.8, sz0 + 1.82);
  bank.b('concrete').setColor(0.8, 0.78, 0.75).box(0, 0.15, sz0 + 2.4, 2.4, 0.3, 1.2, { uv: [2, 2] });
  bank.b('concrete').box(0, 0.12, 0, w + 0.3, 0.24, d + 0.3, { uv: [3, 3], skip: 'ny' });
  bank.identity();
}

/** A brick store with a false front facing local +z, its board, broken shop windows, an awning. */
export function store(bank, spec) {
  const [w, d, h] = spec.size;
  bank.at(spec.pos[0], 0, spec.pos[1], spec.yaw);
  const B = bank.b('brick');
  B.setColor(1, 1, 1);
  B.vc = (wx, wy) => 1 - 0.45 * smooth01(2.5, 5.5, wy);
  const t = 0.25;
  B.box(-w / 2 + t / 2, h / 2, 0, t, h, d, { uv: [2.4, 2.4] });
  B.box(w / 2 - t / 2, h / 2, 0, t, h, d, { uv: [2.4, 2.4] });
  B.box(0, h / 2, -d / 2 + t / 2, w - 2 * t, h, t, { uv: [2.4, 2.4] });
  B.box(0, (h + 1.6) / 2, d / 2 - t / 2, w, h + 1.6, t, { uv: [2.4, 2.4] }); // false front
  B.vc = null;
  bank.b('concrete').setColor(0.55, 0.54, 0.52).box(0, h - 0.1, 0, w - 0.1, 0.2, d - 0.1, { uv: [3, 3] });
  const S = bank.b('signs');
  const uv = rectUV(SIGN_UV.store);
  S.quad([-w * 0.42, h + 0.1, d / 2 + 0.03], [w * 0.42, h + 0.1, d / 2 + 0.03], [w * 0.42, h + 1.3, d / 2 + 0.03], [-w * 0.42, h + 1.3, d / 2 + 0.03], uv[0], uv[1], uv[2], uv[3], [0, 0, 1]);
  const Wn = bank.b('windowBroken');
  decalZ(Wn, -w / 2 + 0.6, 0.7, -0.9, 2.8, d / 2 + 0.03);
  decalZ(Wn, 0.9, 0.7, w / 2 - 0.6, 2.8, d / 2 + 0.03);
  bank.b('black').setColor(0.04, 0.03, 0.03);
  decalZ(bank.b('black'), -0.7, 0.2, 0.7, 2.6, d / 2 + 0.03);
  const A = bank.b('corr');
  A.setColor(0.7, 0.66, 0.6);
  A.quad([-w / 2, 2.9, d / 2 + 1.8], [w / 2, 2.9, d / 2 + 1.8], [w / 2, 3.3, d / 2], [-w / 2, 3.3, d / 2], [0, 0], [w, 0], [w, 1.8], [0, 1.8]);
  // graffiti on the side wall
  const G = rectUV(SIGN_UV.graffiti);
  bank.push().local(w / 2 + 0.03, 0, 0, Math.PI / 2);
  S.quad([-4, 1.2, 0], [4, 1.2, 0], [4, 2.0, 0], [-4, 2.0, 0], G[0], G[1], G[2], G[3], [0, 0, 1]);
  bank.pop();
  bank.identity();
}

/** Open-fronted pole shed / cattle shelter: back wall, posts, a sloping corrugated roof. */
export function shed(bank, spec) {
  const [w, d, h] = spec.size;
  bank.at(spec.pos[0], 0, spec.pos[1], spec.yaw);
  const P = bank.b('planks');
  P.setColor(0.85, 0.82, 0.78);
  P.box(0, h * 0.45, -d / 2 + 0.1, w, h * 0.9, 0.2, { uv: [2.4, 2.4] });
  P.box(-w / 2 + 0.1, h * 0.4, 0, 0.2, h * 0.8, d - 0.4, { uv: [2.4, 2.4] });
  for (const sx of [-1, -0.33, 0.33, 1]) P.box((sx * (w - 0.3)) / 2, h / 2, d / 2 - 0.2, 0.18, h, 0.18, { uv: [2.4, 2.4] });
  const C = bank.b('corr');
  C.setColor(0.9, 0.88, 0.85);
  C.quad([-w / 2 - 0.3, h + 0.05, d / 2 + 0.4], [w / 2 + 0.3, h + 0.05, d / 2 + 0.4], [w / 2 + 0.3, h * 0.85, -d / 2 - 0.3], [-w / 2 - 0.3, h * 0.85, -d / 2 - 0.3], [0, 0], [w, 0], [w, d], [0, d]);
  C.quad([w / 2 + 0.3, h * 0.85 - 0.04, -d / 2 - 0.3], [w / 2 + 0.3, h + 0.01, d / 2 + 0.4], [-w / 2 - 0.3, h + 0.01, d / 2 + 0.4], [-w / 2 - 0.3, h * 0.85 - 0.04, -d / 2 - 0.3], [0, 0], [w, 0], [w, d], [0, d]);
  // stuff inside: old hay, a cart
  bank.b('hay').setColor(0.9, 0.9, 0.9).box(-w / 4, 0.5, -d / 4, w * 0.35, 1.0, d * 0.4, { uv: [1, 1] });
  bank.identity();
}

/** A stone crypt with a pediment. */
export function crypt(bank, spec) {
  const [w, d, h] = spec.size;
  bank.at(spec.pos[0], 0, spec.pos[1], spec.yaw);
  const S = bank.b('stone');
  S.setColor(0.85, 0.85, 0.85);
  S.box(0, h / 2, 0, w, h, d, { uv: [1.5, 1.5] });
  S.box(0, h + 0.15, 0, w + 0.4, 0.3, d + 0.4, { uv: [1.5, 1.5] });
  S.tri([-w / 2 - 0.2, h + 0.3, d / 2 + 0.2], [w / 2 + 0.2, h + 0.3, d / 2 + 0.2], [0, h + 1.3, d / 2 + 0.2], [0, 0], [3, 0], [1.5, 0.7]);
  S.quad([w / 2 + 0.2, h + 0.3, d / 2 + 0.2], [w / 2 + 0.2, h + 0.3, -d / 2 - 0.2], [0, h + 1.3, -d / 2 - 0.2], [0, h + 1.3, d / 2 + 0.2], [0, 0], [3, 0], [3, 1], [0, 1]);
  S.quad([-w / 2 - 0.2, h + 0.3, -d / 2 - 0.2], [-w / 2 - 0.2, h + 0.3, d / 2 + 0.2], [0, h + 1.3, d / 2 + 0.2], [0, h + 1.3, -d / 2 - 0.2], [0, 0], [3, 0], [3, 1], [0, 1]);
  bank.b('black').setColor(0.03, 0.03, 0.03);
  decalZ(bank.b('black'), -0.6, 0, 0.6, 2.2, d / 2 + 0.02);
  bank.identity();
}

/** The gas station: canopy on pillars, pumps, the shop, the pole sign, the fuel tanks. */
export function gasStation(bank, G, shop) {
  const c = G.canopy;
  bank.at(c.pos[0], 0, c.pos[1], 0);
  const P = bank.b('paint');
  // canopy slab and fascia
  P.setColor(0.86, 0.85, 0.82);
  P.box(0, c.h + 0.3, 0, 9, 0.6, 15, { atlas: { tex: [64, 64], all: [0, 0, 32, 32] } });
  P.setColor(0.62, 0.12, 0.08);
  P.box(0, c.h + 0.3, 0, 9.08, 0.22, 15.08, { atlas: { tex: [64, 64], all: [0, 0, 32, 32] }, skip: 'py ny' });
  // pillars
  const Cc = bank.b('concrete');
  Cc.setColor(0.9, 0.88, 0.85);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) Cc.box(sx * 3.2, c.h / 2, sz * 5.4, 0.45, c.h, 0.45, { uv: [2, 2] });
  // islands and pumps
  for (const [px, pz] of G.pumps) {
    const lx = px - c.pos[0], lz = pz - c.pos[1];
    Cc.box(lx, 0.1, lz, 1.4, 0.2, 3.4, { uv: [2, 2] });
    for (const o of [-0.85, 0.85]) {
      P.setColor(0.7, 0.14, 0.1);
      P.box(lx, 0.95, lz + o, 0.6, 1.5, 0.5, { atlas: { tex: [64, 64], all: [0, 0, 32, 32] } });
      P.setColor(0.85, 0.84, 0.78);
      P.box(lx, 1.4, lz + o, 0.62, 0.35, 0.52, { atlas: { tex: [64, 64], all: [0, 0, 32, 32] }, skip: 'ny' });
    }
  }
  bank.identity();
  // the shop
  {
    const [w, d, h] = shop.size;
    bank.at(shop.pos[0], 0, shop.pos[1], shop.yaw);
    const W = bank.b('concrete');
    W.setColor(0.82, 0.8, 0.76);
    W.vc = (wx, wy) => 1 - 0.3 * smooth01(2, 4.5, wy);
    const t = 0.25;
    W.box(-w / 2 + t / 2, h / 2, 0, t, h, d, { uv: [3, 3] });
    W.box(w / 2 - t / 2, h / 2, 0, t, h, d, { uv: [3, 3] });
    W.box(0, h / 2, -d / 2 + t / 2, w - 2 * t, h, t, { uv: [3, 3] });
    W.box(0, h / 2, d / 2 - t / 2, w - 2 * t, h, t, { uv: [3, 3] });
    W.vc = null;
    W.box(0, h + 0.1, 0, w + 0.6, 0.2, d + 0.6, { uv: [3, 3] });
    const Wn = bank.b('windowBroken');
    decalZ(Wn, -w / 2 + 0.8, 0.6, -1.2, 2.7, d / 2 + 0.03);
    decalZ(Wn, 1.2, 0.6, w / 2 - 0.8, 2.7, d / 2 + 0.03);
    bank.b('black').setColor(0.04, 0.04, 0.04);
    decalZ(bank.b('black'), -0.9, 0.1, 0.9, 2.5, d / 2 + 0.03);
    // red stripe along the top
    const Pp = bank.b('paint');
    Pp.setColor(0.62, 0.12, 0.08);
    Pp.box(0, h - 0.3, 0, w + 0.02, 0.35, d + 0.02, { atlas: { tex: [64, 64], all: [0, 0, 32, 32] }, skip: 'py ny' });
    // graffiti on the back wall
    const S = bank.b('signs');
    const gu = rectUV(SIGN_UV.graffiti);
    bank.push().local(0, 0, -d / 2 - 0.03, Math.PI);
    S.quad([-4.5, 1.0, 0], [4.5, 1.0, 0], [4.5, 1.9, 0], [-4.5, 1.9, 0], gu[0], gu[1], gu[2], gu[3], [0, 0, 1]);
    bank.pop();
    bank.identity();
  }
  // pole sign facing the tower
  {
    const s = G.sign;
    const yaw = Math.atan2(-s.pos[0], -s.pos[1]);
    bank.at(s.pos[0], 0, s.pos[1], yaw);
    const St = bank.b('steel');
    St.setColor(0.6, 0.6, 0.6);
    St.box(-1.2, s.h / 2, 0, 0.3, s.h, 0.3, { uv: [1, 1] });
    St.box(1.2, s.h / 2, 0, 0.3, s.h, 0.3, { uv: [1, 1] });
    const S = bank.b('signs');
    const uv = rectUV(SIGN_UV.gas);
    const y0 = s.h - 0.2, ww = 2.4, hh = (ww * 72) / 96 * 1.4;
    S.quad([-ww, y0, 0.2], [ww, y0, 0.2], [ww, y0 + hh * 2, 0.2], [-ww, y0 + hh * 2, 0.2], uv[0], uv[1], uv[2], uv[3], [0, 0, 1]);
    St.box(0, y0 + hh, 0, ww * 2 + 0.2, hh * 2 + 0.2, 0.35, { uv: [1, 1] });
    bank.identity();
  }
  // fuel tanks on cradles
  for (const t of G.tanks) {
    bank.at(t.pos[0], 0, t.pos[1], t.yaw);
    const P2 = bank.b('paint');
    P2.setColor(0.85, 0.84, 0.8);
    P2.hcyl(0, t.r + 0.4, 0, t.r, t.len, { seg: 12, atlas: { tex: [64, 64], side: [0, 0, 32, 32], top: [0, 0, 32, 32] } });
    const Cc2 = bank.b('concrete');
    Cc2.setColor(0.8, 0.78, 0.74);
    for (const o of [-t.len * 0.32, t.len * 0.32]) Cc2.box(o, 0.35, 0, 0.5, 0.7, t.r * 1.6, { uv: [2, 2] });
    const S = bank.b('signs');
    const uv = rectUV(SIGN_UV[t.label === 'DIESEL' ? 'diesel' : 'unleaded']);
    bank.push().local(0, 0, 0, 0);
    S.quad([-1.6, t.r + 0.1, t.r + 0.02], [1.6, t.r + 0.1, t.r + 0.02], [1.6, t.r + 0.7, t.r + 0.02], [-1.6, t.r + 0.7, t.r + 0.02], uv[0], uv[1], uv[2], uv[3], [0, 0, 1]);
    bank.pop();
    bank.identity();
  }
}

/** The water tower: four legs with X-bracing, a tank with a conical roof and the town's name. */
export function waterTower(bank, Wt) {
  bank.at(Wt.pos[0], 0, Wt.pos[1], Math.atan2(-Wt.pos[0], -Wt.pos[1]));
  const S = bank.b('steel');
  S.setColor(0.75, 0.75, 0.73);
  const base = 2.6, top = 1.9, H = Wt.h - 4;
  const leg = (sx, sz, y) => {
    const k = y / H;
    return [sx * (base + (top - base) * k), y, sz * (base + (top - base) * k)];
  };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) S.beam(leg(sx, sz, 0), leg(sx, sz, H), 0.22);
  for (const y of [0.4, H / 2, H]) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
      S.beam(leg(ax, az, y), leg(bx, bz, y), 0.1);
    }
  }
  for (const [y0, y1] of [[0.4, H / 2], [H / 2, H]]) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
      S.beam(leg(ax, az, y0), leg(bx, bz, y1), 0.06);
      S.beam(leg(bx, bz, y0), leg(ax, az, y1), 0.06);
    }
  }
  const P = bank.b('paint');
  P.setColor(0.82, 0.82, 0.78);
  P.cyl(0, H, 0, Wt.r, 4, { seg: 16, caps: 'bottom', atlas: { tex: [64, 64], side: [0, 0, 32, 32], top: [0, 0, 32, 32] } });
  P.cyl(0, H + 4, 0, Wt.r + 0.15, 1.6, { seg: 16, r1: 0.2, caps: '', atlas: { tex: [64, 64], side: [0, 0, 32, 32] } });
  // the name band facing the tower (a curved strip of quads)
  const Sg = bank.b('signs');
  const [ux, uy, uw, uh] = SIGN_UV.tower;
  const n = 8, a0 = Math.PI / 2 - 0.9, a1 = Math.PI / 2 + 0.9;
  for (let i = 0; i < n; i++) {
    const aa = a0 + ((a1 - a0) * i) / n, ab = a0 + ((a1 - a0) * (i + 1)) / n;
    const r = Wt.r + 0.03;
    const u0 = (ux + uw * (1 - i / n)) / 256, u1 = (ux + uw * (1 - (i + 1) / n)) / 256, v0 = 1 - (uy + uh) / 256, v1 = 1 - uy / 256;
    const pa = [Math.cos(aa) * r, H + 1.4, Math.sin(aa) * r], pb = [Math.cos(ab) * r, H + 1.4, Math.sin(ab) * r];
    Sg.quad([pb[0], pb[1], pb[2]], [pa[0], pa[1], pa[2]], [pa[0], pa[1] + 1.3, pa[2]], [pb[0], pb[1] + 1.3, pb[2]], [u1, v0], [u0, v0], [u0, v1], [u1, v1]);
  }
  bank.identity();
}

/** The windmill's lattice tower (the turning wheel is a separate dynamic object). */
export function windmillTower(bank, M) {
  bank.at(M.pos[0], 0, M.pos[1], 0.3);
  const S = bank.b('steel');
  S.setColor(0.7, 0.7, 0.68);
  const base = 1.3, top = 0.25, H = M.h;
  const leg = (sx, sz, y) => {
    const k = y / H;
    return [sx * (base + (top - base) * k), y, sz * (base + (top - base) * k)];
  };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) S.beam(leg(sx, sz, 0), leg(sx, sz, H), 0.09);
  for (let y = 0.5; y < H; y += 2.2) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
      S.beam(leg(ax, az, y), leg(bx, bz, y), 0.05);
      S.beam(leg(ax, az, y), leg(bx, bz, Math.min(H, y + 2.2)), 0.035);
    }
  }
  S.box(0, H + 0.1, 0, 0.7, 0.2, 0.7, { uv: [1, 1] });
  // the stock tank at its foot
  bank.b('paint').setColor(0.55, 0.57, 0.55).cyl(1.8, 0, 1.4, 1.1, 0.7, { seg: 12, caps: 'top', atlas: { tex: [64, 64], side: [0, 0, 32, 32], top: [32, 0, 32, 32] } });
  bank.identity();
}

/** A bridge: 'concrete' (highway: slab, parapets, piers) or 'wood' (planks, stringers, piles). */
export function bridge(bank, B, waterY) {
  const len = B.z1 - B.z0, cz = (B.z0 + B.z1) / 2;
  bank.at(B.x, 0, cz, 0);
  if (B.kind === 'concrete') {
    const C = bank.b('concrete');
    C.setColor(0.86, 0.85, 0.82);
    C.box(0, -0.33, 0, B.half * 2, 0.72, len, { uv: [3, 3] });
    for (const s of [-1, 1]) {
      C.box(s * (B.half - 0.22), 0.5, 0, 0.44, 1.0, len, { uv: [3, 3] });
      C.box(s * (B.half - 0.22), 1.02, 0, 0.56, 0.08, len + 0.1, { uv: [3, 3] });
    }
    for (const o of [-len * 0.18, len * 0.18]) C.box(0, (waterY - 1.8 - 0.7) / 2, o, B.half * 1.5, -(waterY - 1.8) - 0.7 + 0.1, 1.0, { uv: [3, 3] });
    for (const s of [-1, 1]) C.box(0, -0.9, s * (len / 2 - 1.2), B.half * 2 + 0.4, 1.6, 2.4, { uv: [3, 3] });
  } else {
    const P = bank.b('planks');
    P.setColor(0.82, 0.8, 0.76);
    // deck planks across (alternating tones via colour)
    for (let z = -len / 2; z < len / 2 - 0.01; z += 0.45) {
      const k = 0.85 + hash2(Math.floor(z * 10), 3, 9) * 0.25;
      P.setColor(0.8 * k, 0.78 * k, 0.74 * k);
      P.box(0, -0.04, z + 0.21, B.half * 2 - 0.1, 0.12, 0.42, { uv: [2.4, 2.4], skip: 'ny' });
    }
    P.setColor(0.6, 0.58, 0.55);
    for (const s of [-1, -0.33, 0.33, 1]) P.box(s * (B.half - 0.35), -0.32, 0, 0.3, 0.42, len, { uv: [2.4, 2.4] });
    const Bk = bank.b('bark');
    Bk.setColor(0.7, 0.68, 0.65);
    for (const o of [-len * 0.3, 0, len * 0.3]) for (const s of [-1, 1]) Bk.cyl(s * (B.half - 0.35), waterY - 1.9, o, 0.18, -waterY + 1.6, { seg: 6, caps: '', uv: [1, 1] });
    // rails: posts + top and mid rails
    P.setColor(0.75, 0.73, 0.7);
    for (const s of [-1, 1]) {
      const x = s * (B.half - 0.12);
      for (let z = -len / 2; z <= len / 2 + 0.01; z += 2) P.box(x, 0.55, z, 0.14, 1.1, 0.14, { uv: [2.4, 2.4] });
      P.box(x, 1.05, 0, 0.1, 0.12, len, { uv: [2.4, 2.4] });
      P.box(x, 0.6, 0, 0.08, 0.1, len, { uv: [2.4, 2.4] });
    }
  }
  bank.identity();
}
