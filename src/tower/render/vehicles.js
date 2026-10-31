import { hash2 } from './textures.js';

/**
 * Car wrecks from boxes and a few trapezoids, merged into the 'car' builder (one texture atlas:
 * paint, glass, tyre, burnt shell) plus 'black' for gaps. Local +X is the car's nose (as the
 * colliders in the layout); y up; the wheels sit on the ground (burnt ones on their rims).
 */

const A = { tex: [64, 64] };
const PAINT = [0, 0, 32, 32], GLASS = [32, 0, 32, 32], TYRE = [0, 32, 32, 32], BURNT = [32, 32, 32, 32];

function body(b, burnt) {
  return { tex: A.tex, all: burnt ? BURNT : PAINT };
}

/** Trapezoid prism along x (a cabin): bottom x0..x1, top tx0..tx1, from y0 to y1, half width hw (top htw). */
function cabin(b, x0, x1, tx0, tx1, y0, y1, hw, htw, o) {
  const P = (x, y, z) => [x, y, z];
  const uvP = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const map = (rect) => {
    const [W, H] = A.tex;
    const [rx, ry, rw, rh] = rect;
    return uvP.map(([u, v]) => [(rx + u * rw) / W, 1 - (ry + (1 - v) * rh) / H]);
  };
  const side = map(o.glass ? GLASS : o.burnt ? BURNT : PAINT);
  const top = map(o.burnt ? BURNT : PAINT);
  // sides (glass)
  b.quad(P(x0, y0, hw), P(x1, y0, hw), P(tx1, y1, htw), P(tx0, y1, htw), side[0], side[1], side[2], side[3]);
  b.quad(P(x1, y0, -hw), P(x0, y0, -hw), P(tx0, y1, -htw), P(tx1, y1, -htw), side[0], side[1], side[2], side[3]);
  // windshield (front, +x) and rear window
  b.quad(P(x1, y0, hw), P(x1, y0, -hw), P(tx1, y1, -htw), P(tx1, y1, htw), side[0], side[1], side[2], side[3]);
  b.quad(P(x0, y0, -hw), P(x0, y0, hw), P(tx0, y1, htw), P(tx0, y1, -htw), side[0], side[1], side[2], side[3]);
  // roof
  b.quad(P(tx0, y1, htw), P(tx1, y1, htw), P(tx1, y1, -htw), P(tx0, y1, -htw), top[0], top[1], top[2], top[3]);
}

function wheel(b, x, z, r, w, burnt) {
  const y = burnt ? r * 0.72 : r;
  b.push();
  b.local(x, y, z, 0, Math.PI / 2, 0);
  b.b('car').cyl(0, -w / 2, 0, burnt ? r * 0.78 : r, w, { seg: 8, caps: 'both', atlas: { tex: A.tex, side: [0, 60, 32, 4], top: TYRE } });
  b.pop();
}

/** Add one wreck. w: { type, pos, yaw, color: [r,g,b], burnt (0..1) } */
export function wreck(bank, w) {
  const burnt = (w.burnt ?? 0) > 0.6;
  const rust = w.burnt ?? 0;
  bank.at(w.pos[0], 0, w.pos[1], w.yaw);
  const b = bank.b('car');
  const col = w.color ?? [0.5, 0.5, 0.5];
  const k = burnt ? 0.9 : 1;
  b.setColor(col[0] * k + (burnt ? 0.25 : 0), col[1] * k + (burnt ? 0.22 : 0), col[2] * k + (burnt ? 0.2 : 0));
  if (burnt) b.setColor(0.8, 0.78, 0.76);
  const sag = burnt ? -0.1 : 0;
  const t = w.type;
  if (t === 'sedan' || t === 'police') {
    b.box(0, 0.6 + sag, 0, 4.6, 0.56, 1.84, { atlas: body(b, burnt) });
    cabin(b, -1.25, 0.95, -0.95, 0.35, 0.88 + sag, 1.42 + sag, 0.88, 0.76, { glass: !burnt, burnt });
    if (t === 'police') {
      b.setColor(0.9, 0.9, 0.88);
      b.box(0.2, 0.62 + sag, 0, 1.6, 0.5, 1.86, { atlas: body(b, burnt), skip: 'py ny px nx' });
      b.setColor(0.7, 0.1, 0.08);
      b.box(-0.3, 1.5 + sag, -0.3, 0.25, 0.14, 0.55, { atlas: body(b, false) });
      b.setColor(0.12, 0.2, 0.7);
      b.box(-0.3, 1.5 + sag, 0.3, 0.25, 0.14, 0.55, { atlas: body(b, false) });
    }
    for (const [x, z] of [[1.45, 0.86], [1.45, -0.86], [-1.45, 0.86], [-1.45, -0.86]]) wheel(bank, x, z, 0.33, 0.22, burnt);
  } else if (t === 'pickup') {
    b.box(0.9, 0.7 + sag, 0, 3.4, 0.7, 1.96, { atlas: body(b, burnt) }); // front + cab base
    cabin(b, 0.0, 1.35, 0.15, 1.0, 1.05 + sag, 1.82 + sag, 0.95, 0.88, { glass: !burnt, burnt });
    // the bed: floor + walls
    b.box(-1.6, 0.62 + sag, 0, 1.9, 0.18, 1.96, { atlas: body(b, burnt) });
    for (const s of [-1, 1]) b.box(-1.6, 0.92 + sag, s * 0.93, 1.9, 0.5, 0.1, { atlas: body(b, burnt) });
    b.box(-2.52, 0.92 + sag, 0, 0.1, 0.5, 1.96, { atlas: body(b, burnt) });
    for (const [x, z] of [[1.6, 0.9], [1.6, -0.9], [-1.5, 0.9], [-1.5, -0.9]]) wheel(bank, x, z, 0.38, 0.26, burnt);
    if (w.inside) {
      // gear in the bed: jerry cans, a tarp bundle
      const P = bank.b('props');
      P.setColor(1, 1, 1);
      P.box(-1.9, 0.98, 0.5, 0.35, 0.5, 0.18, { atlas: { tex: [128, 128], all: [32, 32, 32, 32] } });
      P.box(-1.9, 0.98, 0.2, 0.35, 0.5, 0.18, { atlas: { tex: [128, 128], all: [32, 32, 32, 32] } });
      P.box(-1.3, 0.9, -0.35, 0.9, 0.36, 0.9, { atlas: { tex: [128, 128], all: [0, 96, 32, 32] } });
    }
  } else if (t === 'van') {
    b.box(-0.3, 1.25 + sag, 0, 4.4, 1.7, 1.98, { atlas: body(b, burnt) });
    b.box(2.15, 0.75 + sag, 0, 0.7, 0.7, 1.9, { atlas: body(b, burnt) });
    cabin(b, 1.7, 2.0, 1.7, 1.85, 1.1 + sag, 1.9 + sag, 0.96, 0.96, { glass: !burnt, burnt });
    for (const [x, z] of [[1.5, 0.9], [1.5, -0.9], [-1.6, 0.9], [-1.6, -0.9]]) wheel(bank, x, z, 0.36, 0.24, burnt);
  } else if (t === 'semi') {
    b.box(1.9, 1.9 + sag, 0, 2.4, 2.4, 2.4, { atlas: body(b, burnt) }); // cab
    cabin(b, 2.95, 3.12, 2.95, 3.12, 1.9 + sag, 2.9 + sag, 1.1, 1.1, { glass: !burnt, burnt });
    b.box(-1.0, 0.85, 0, 4.0, 0.4, 1.2, { atlas: body(b, true) }); // chassis
    b.box(2.6, 1.0, 0, 1.4, 1.0, 2.3, { atlas: body(b, burnt) }); // hood
    for (const [x, z] of [[2.5, 1.0], [2.5, -1.0], [-1.2, 1.0], [-1.2, -1.0], [-2.4, 1.0], [-2.4, -1.0]]) wheel(bank, x, z, 0.5, 0.32, burnt);
  } else if (t === 'trailer') {
    b.setColor(col[0], col[1], col[2]);
    b.box(0, 2.45, 0, 13.2, 2.7, 2.56, { atlas: { tex: A.tex, all: PAINT } });
    b.box(0, 1.0, 0, 12.6, 0.25, 1.0, { atlas: body(b, true) });
    for (const x of [-4.6, -5.8]) for (const z of [1.0, -1.0]) wheel(bank, x, z, 0.5, 0.3, false);
    // landing legs (the cab is gone)
    b.box(4.5, 0.55, 0.8, 0.15, 1.1, 0.15, { atlas: body(b, true) });
    b.box(4.5, 0.55, -0.8, 0.15, 1.1, 0.15, { atlas: body(b, true) });
  } else if (t === 'bus') {
    b.box(0, 1.65 + sag, 0, 11.2, 2.3, 2.5, { atlas: body(b, burnt) });
    b.setColor(0.08, 0.08, 0.08);
    b.box(0, 0.9 + sag, 0, 11.22, 0.12, 2.52, { atlas: body(b, true), skip: 'py ny' });
    // window rows
    const g = bank.b(burnt ? 'black' : 'car');
    for (const s of [-1, 1]) {
      for (let x = -4.8; x < 4.6; x += 1.2) {
        const z = s * 1.255;
        const uv = [[32 / 64, 1 - 32 / 64], [1, 1 - 32 / 64], [1, 1], [32 / 64, 1]];
        if (s > 0) g.quad([x, 1.85 + sag, z], [x + 1.0, 1.85 + sag, z], [x + 1.0, 2.55 + sag, z], [x, 2.55 + sag, z], uv[0], uv[1], uv[2], uv[3], [0, 0, 1]);
        else g.quad([x + 1.0, 1.85 + sag, z], [x, 1.85 + sag, z], [x, 2.55 + sag, z], [x + 1.0, 2.55 + sag, z], uv[0], uv[1], uv[2], uv[3], [0, 0, -1]);
      }
    }
    for (const [x, z] of [[3.6, 1.1], [3.6, -1.1], [-3.4, 1.1], [-3.4, -1.1]]) wheel(bank, x, z, 0.5, 0.3, burnt);
  } else if (t === 'tractor') {
    b.box(0.6, 1.1, 0, 2.0, 0.9, 0.9, { atlas: body(b, false) }); // hood
    b.box(-0.8, 1.0, 0, 1.0, 0.8, 1.2, { atlas: body(b, false) }); // seat base
    const St = bank.b('steel');
    St.setColor(0.3, 0.3, 0.3);
    for (const s of [-1, 1]) St.beam([-1.1, 1.3, s * 0.6], [-1.1, 2.6, s * 0.6], 0.07);
    St.beam([-1.1, 2.6, -0.6], [-1.1, 2.6, 0.6], 0.07);
    St.beam([1.6, 1.5, 0.2], [1.6, 2.3, 0.2], 0.08); // exhaust
    wheel(bank, -0.9, 0.95, 0.82, 0.42, false);
    wheel(bank, -0.9, -0.95, 0.82, 0.42, false);
    wheel(bank, 1.3, 0.6, 0.42, 0.24, false);
    wheel(bank, 1.3, -0.6, 0.42, 0.24, false);
  }
  // rust streaks via colour noise on old wrecks
  if (rust > 0 && !burnt && hash2(Math.floor(w.pos[0]), Math.floor(w.pos[1]), 1) < rust) {
    /* the atlas already carries rust spots */
  }
  bank.identity();
}
