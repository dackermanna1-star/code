/**
 * Painters for minerals, ingredients and mob drops.
 */
import { type Painter, type Ctx, type Col, poly, smooth, ellipse, circle, capsule, lin, rad, rgba, lighten, darken, mix, tint, mul, METAL, GEM, GLOW, CLOTH, WET, saturate } from './kit';
import { blob, blobPts, eggPath } from './shapes';

type P = Painter;

/** Facet helper: fill a polygon with a flat colour (+ optional gradient) inside a part. */
function facet(g: Ctx, pts: number[], c: Col, a = 1) {
  poly(g, pts);
  g.fillStyle = rgba(c, a);
  g.fill();
}
function facetEdges(g: Ctx, lines: number[][], c: Col, a: number, w = 0.18) {
  g.strokeStyle = rgba(c, a);
  g.lineWidth = w;
  for (const l of lines) {
    g.beginPath();
    g.moveTo(l[0], l[1]);
    for (let i = 2; i < l.length; i += 2) g.lineTo(l[i], l[i + 1]);
    g.stroke();
  }
}

export function diamond(p: P) {
  const c = p.params.color;
  const T0 = [4.3, 2.2], T1 = [8, 2.0], T2 = [11.7, 2.2];
  const G = [[1.4, 5.8], [4.8, 6.1], [8, 6.2], [11.2, 6.1], [14.6, 5.8]];
  const C = [8, 14.6];
  const outline = [T0[0], T0[1], T2[0], T2[1], G[4][0], G[4][1], C[0], C[1], G[0][0], G[0][1]];
  p.part((g) => facet(g, outline, c), (g) => {
    // crown
    facet(g, [G[0][0], G[0][1], T0[0], T0[1], G[1][0], G[1][1]], lighten(c, 0.35));
    facet(g, [T0[0], T0[1], T1[0], T1[1], G[2][0], G[2][1], G[1][0], G[1][1]], lighten(c, 0.6));
    facet(g, [T1[0], T1[1], T2[0], T2[1], G[3][0], G[3][1], G[2][0], G[2][1]], lighten(c, 0.15));
    facet(g, [T2[0], T2[1], G[4][0], G[4][1], G[3][0], G[3][1]], darken(c, 0.05));
    // pavilion
    facet(g, [G[0][0], G[0][1], G[1][0], G[1][1], C[0], C[1]], mix(c, 0x0a4a50, 0.25));
    facet(g, [G[1][0], G[1][1], G[2][0], G[2][1], C[0], C[1]], lighten(c, 0.2));
    facet(g, [G[2][0], G[2][1], G[3][0], G[3][1], C[0], C[1]], mix(c, 0x0a5a60, 0.45));
    facet(g, [G[3][0], G[3][1], G[4][0], G[4][1], C[0], C[1]], mix(c, 0x063038, 0.6));
    // internal refraction streaks
    g.fillStyle = lin(g, 3, 6, 12, 14, [[0, 0xffffff, 0.0], [0.45, 0xffffff, 0.25], [0.55, 0xffffff, 0], [1, 0x002a30, 0.3]]);
    g.fillRect(0, 0, 16, 16);
    facetEdges(g, [[G[0][0], G[0][1], G[4][0], G[4][1]], [T0[0], T0[1], G[1][0], G[1][1], C[0], C[1]], [T1[0], T1[1], G[2][0], G[2][1], C[0], C[1]], [T2[0], T2[1], G[3][0], G[3][1], C[0], C[1]]], 0xffffff, 0.55, 0.16);
    p.spec(g, 6.0, 3.6, 1.6, 0.8, -0.3, 0.95);
    p.spec(g, 5.0, 8.4, 0.9, 0.5, 0.8, 0.7);
    // sparkle
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 0.22;
    g.beginPath(); g.moveTo(10.6, 2.8); g.lineTo(10.6, 5.2); g.moveTo(9.4, 4.0); g.lineTo(11.8, 4.0); g.stroke();
  }, GEM);
}

export function emerald(p: P) {
  const c = p.params.color;
  const O = [5.2, 1.2, 10.8, 1.2, 13.2, 4.0, 13.2, 12.0, 10.8, 14.8, 5.2, 14.8, 2.8, 12.0, 2.8, 4.0];
  const I = [6.4, 4.0, 9.6, 4.0, 10.6, 5.2, 10.6, 10.8, 9.6, 12.0, 6.4, 12.0, 5.4, 10.8, 5.4, 5.2];
  p.part((g) => facet(g, O, c), (g) => {
    const tr = (a: number, b: number, cc: Col) => facet(g, [O[a * 2], O[a * 2 + 1], O[b * 2], O[b * 2 + 1], I[b * 2], I[b * 2 + 1], I[a * 2], I[a * 2 + 1]], cc);
    tr(0, 1, lighten(c, 0.55));
    tr(1, 2, lighten(c, 0.3));
    tr(2, 3, darken(c, 0.2));
    tr(3, 4, darken(c, 0.4));
    tr(4, 5, darken(c, 0.5));
    tr(5, 6, darken(c, 0.25));
    tr(6, 7, lighten(c, 0.1));
    tr(7, 0, lighten(c, 0.4));
    g.fillStyle = lin(g, 5, 4, 11, 12, [[0, lighten(c, 0.25)], [0.5, c], [1, darken(c, 0.3)]]);
    poly(g, I);
    g.fill();
    // step-cut inner lines
    g.strokeStyle = rgba(lighten(c, 0.5), 0.45);
    g.lineWidth = 0.15;
    poly(g, [7.0, 5.6, 9.0, 5.6, 9.4, 6.2, 9.4, 9.8, 9.0, 10.4, 7.0, 10.4, 6.6, 9.8, 6.6, 6.2]);
    g.stroke();
    facetEdges(g, [[O[0], O[1], I[0], I[1]], [O[2], O[3], I[2], I[3]], [O[8], O[9], I[8], I[9]], [O[10], O[11], I[10], I[11]], [O[4], O[5], I[4], I[5]], [O[6], O[7], I[6], I[7]], [O[12], O[13], I[12], I[13]], [O[14], O[15], I[14], I[15]]], 0xffffff, 0.35, 0.14);
    p.spec(g, 6.2, 2.4, 1.6, 0.55, 0, 0.9);
    p.spec(g, 6.6, 6.6, 0.8, 1.8, 0.1, 0.4);
  }, GEM);
}

export function lapis(p: P) {
  const c = p.params.color;
  const pts = [3.0, 6.0, 6.0, 2.6, 10.4, 2.2, 13.6, 5.0, 13.8, 9.6, 11.4, 13.6, 6.6, 14.2, 2.8, 11.6];
  p.part((g) => { smooth(g, pts, true, 0.35); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 8.2, 8.2, 6.8, c, 0.35, 0.55);
    // facets / chips
    g.fillStyle = rgba(lighten(c, 0.25), 0.6);
    poly(g, [4.0, 6.2, 6.4, 3.4, 9.6, 3.2, 7.4, 6.8]);
    g.fill();
    g.fillStyle = rgba(darken(c, 0.35), 0.5);
    poly(g, [9.6, 9.4, 13.4, 9.8, 11.0, 13.2, 7.8, 12.8]);
    g.fill();
    // pyrite (gold) and calcite flecks
    p.speckle(g, 12, 3.5, 3.5, 13, 13, 0.55, 0xe8c048, 0.95);
    p.speckle(g, 10, 3.5, 3.5, 13, 13, 0.4, 0xdfe8f8, 0.7);
    p.speckle(g, 30, 3, 3, 13.5, 13.5, 0.3, darken(c, 0.5), 0.5);
    p.spec(g, 6.0, 5.0, 1.8, 0.8, -0.5, 0.5);
  }, { rough: 0.35 });
}

export function quartz(p: P) {
  const base = p.params.color;
  const crystal = (x: number, y: number, len: number, w: number, ang: number, shade: number) => {
    p.part((g) => {
      g.save(); g.translate(x, y); g.rotate(ang);
      poly(g, [-w, 0, -w, -len + w * 1.3, 0, -len, w, -len + w * 1.3, w, 0]);
      g.fillStyle = rgba(base); g.fill();
      g.restore();
    }, (g) => {
      g.save(); g.translate(x, y); g.rotate(ang);
      g.fillStyle = rgba(lighten(base, 0.6));
      poly(g, [-w, 0, -w, -len + w * 1.3, 0, -len, 0, 0]);
      g.fill();
      g.fillStyle = rgba(mix(darken(base, 0.18 + shade), 0xe0b0a8, 0.2));
      poly(g, [0, 0, 0, -len, w, -len + w * 1.3, w, 0]);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 0.15;
      g.beginPath(); g.moveTo(-w * 0.55, -0.4); g.lineTo(-w * 0.55, -len + w * 1.6); g.stroke();
      g.restore();
    }, GEM);
  };
  crystal(5.6, 14.4, 9.5, 1.6, -0.42, 0.1);
  crystal(10.6, 14.6, 8.0, 1.5, 0.38, 0.2);
  crystal(8.0, 15.0, 13.0, 1.9, 0.02, 0.05);
}

export function shard(p: P) {
  const c = p.params.color, d = p.params.color2 || darken(c, 0.4);
  const pts = [2.4, 14.0, 4.0, 9.0, 9.8, 2.8, 13.8, 1.6, 12.6, 5.8, 7.0, 12.0];
  p.part((g) => { poly(g, pts); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    g.fillStyle = rgba(lighten(c, 0.35));
    poly(g, [2.4, 14.0, 4.0, 9.0, 9.8, 2.8, 13.8, 1.6, 8.0, 7.4]);
    g.fill();
    g.fillStyle = rgba(d);
    poly(g, [2.4, 14.0, 8.0, 7.4, 13.8, 1.6, 12.6, 5.8, 7.0, 12.0]);
    g.fill();
    g.strokeStyle = rgba(lighten(c, 0.7), 0.8);
    g.lineWidth = 0.18;
    g.beginPath(); g.moveTo(2.6, 13.8); g.lineTo(13.6, 1.8); g.stroke();
    p.spec(g, 8.0, 5.4, 1.6, 0.5, -0.8, 0.8);
  }, GEM);
}

export function crystals(p: P) {
  const c = p.params.color;
  const beads: [number, number, number][] = [[5, 6, 2.2], [10.2, 4.8, 2.0], [8, 10, 2.6], [4.2, 11.4, 1.7], [11.8, 10.8, 1.9], [7.4, 3.0, 1.4]];
  for (const [x, y, r] of beads) {
    p.part((g) => { poly(g, [x, y - r, x + r * 0.9, y - r * 0.3, x + r * 0.7, y + r * 0.8, x - r * 0.6, y + r * 0.9, x - r * 0.95, y - r * 0.2]); g.fillStyle = rgba(c); g.fill(); }, (g) => {
      g.fillStyle = rgba(mix(c, 0x6ac8a8, 0.45));
      poly(g, [x, y, x + r * 0.9, y - r * 0.3, x + r * 0.7, y + r * 0.8, x - r * 0.6, y + r * 0.9]);
      g.fill();
      g.fillStyle = rgba(0xffffff, 0.8);
      poly(g, [x, y - r, x + r * 0.3, y - r * 0.2, x - r * 0.5, y - r * 0.1]);
      g.fill();
    }, { rough: 0.15, emissive: 0.35 });
  }
}

export function coal(p: P) {
  const c = p.params.color;
  const charcoal = p.params.name === 'charcoal';
  const pts = [2.2, 8.0, 4.4, 3.4, 8.6, 2.0, 12.8, 3.6, 14.0, 8.4, 12.0, 13.2, 7.0, 14.2, 3.2, 12.0];
  p.part((g) => { poly(g, pts); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    const f = (pp: number[], k: number) => { poly(g, pp); g.fillStyle = rgba(mul(lighten(c, 0.18), k)); g.fill(); };
    f([4.4, 3.4, 8.6, 2.0, 9.4, 6.0, 5.8, 7.4], 1.5);
    f([8.6, 2.0, 12.8, 3.6, 12.2, 7.6, 9.4, 6.0], 1.15);
    f([2.2, 8.0, 4.4, 3.4, 5.8, 7.4, 4.8, 10.6], 1.25);
    f([5.8, 7.4, 9.4, 6.0, 12.2, 7.6, 10.4, 11.0, 6.6, 10.8], 0.95);
    f([12.2, 7.6, 14.0, 8.4, 12.0, 13.2, 10.4, 11.0], 0.6);
    f([3.2, 12.0, 4.8, 10.6, 6.6, 10.8, 7.0, 14.2], 0.75);
    f([6.6, 10.8, 10.4, 11.0, 12.0, 13.2, 7.0, 14.2], 0.5);
    if (charcoal) {
      g.strokeStyle = rgba(0x6a4a30, 0.5);
      g.lineWidth = 0.2;
      for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(3 + i * 1.8, 3.5); g.lineTo(2 + i * 1.8, 13.5); g.stroke(); }
    }
    p.speckle(g, 14, 3, 3, 13, 13, 0.35, 0xc8c8d8, 0.55);
    p.spec(g, 6.4, 4.6, 1.4, 0.6, -0.4, 0.55);
  }, { rough: 0.45 });
}

export function rawOre(p: P) {
  const c = p.params.color, d = p.params.color2;
  const pts = blobPts(p, 8, 8.4, 5.8, 5.4, 11, 0.16, 0.3);
  blob(p, pts, c, { rough: 0.55 }, { light: 0.4, dark: 0.6 });
  p.overlay((g) => smooth(g, pts), (g) => {
    p.speckle(g, 22, 3, 3.5, 13, 13.5, 0.9, d, 0.65);
    p.speckle(g, 16, 3, 3.5, 13, 13.5, 0.45, lighten(c, 0.5), 0.6);
    // pits
    for (let i = 0; i < 5; i++) {
      const x = 4 + p.rand() * 8, y = 4.5 + p.rand() * 8;
      g.fillStyle = rgba(darken(d, 0.4), 0.7);
      circle(g, x, y, 0.45);
      g.fill();
      g.fillStyle = rgba(lighten(c, 0.5), 0.6);
      circle(g, x - 0.25, y - 0.25, 0.25);
      g.fill();
    }
  });
}

/** Isometric bar: ingots and bricks. */
export function ingot(p: P, matte = false) {
  const c = p.params.color;
  const A = [1.6, 9.4], B = [10.6, 4.0], C = [14.4, 6.2], D = [5.4, 11.6];
  const h = 2.6;
  const mat = matte ? { rough: 0.8 } : METAL;
  // front face
  p.part((g) => { poly(g, [D[0], D[1], C[0], C[1], C[0], C[1] + h, D[0], D[1] + h]); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    g.fillStyle = lin(g, D[0], D[1], C[0], C[1] + h, [[0, darken(c, 0.12)], [0.5, darken(c, 0.32)], [1, darken(tint(c, -0.5), 0.55)]]);
    g.fillRect(0, 0, 16, 16);
    if (!matte) {
      g.strokeStyle = rgba(lighten(c, 0.4), 0.55);
      g.lineWidth = 0.25;
      g.beginPath(); g.moveTo(D[0] + 0.3, D[1] + 0.5); g.lineTo(C[0] - 0.3, C[1] + 0.5); g.stroke();
    }
  }, mat);
  // end face
  p.part((g) => { poly(g, [A[0], A[1], D[0], D[1], D[0], D[1] + h, A[0], A[1] + h]); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    g.fillStyle = lin(g, A[0], A[1], D[0], D[1] + h, [[0, lighten(c, 0.05)], [1, darken(c, 0.2)]]);
    g.fillRect(0, 0, 16, 16);
  }, mat);
  // top face (inset trapezoid for the sloped ingot look)
  p.part((g) => { poly(g, [A[0], A[1], B[0], B[1], C[0], C[1], D[0], D[1]]); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    g.fillStyle = lin(g, A[0], A[1], C[0], C[1], [[0, lighten(c, 0.45)], [0.45, lighten(c, 0.15)], [1, darken(c, 0.05)]]);
    g.fillRect(0, 0, 16, 16);
    // bevel ring
    g.strokeStyle = rgba(lighten(c, matte ? 0.15 : 0.55), matte ? 0.4 : 0.7);
    g.lineWidth = 0.3;
    poly(g, [A[0] + 1.2, A[1] - 0.05, B[0] + 0.3, B[1] + 0.75, C[0] - 1.2, C[1] + 0.05, D[0] - 0.3, D[1] - 0.75]);
    g.stroke();
    if (!matte) {
      // specular streak along the bar
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 0.55;
      g.beginPath(); g.moveTo(3.6, 9.0); g.lineTo(10.4, 5.0); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(4.2, 9.4); g.lineTo(9.8, 6.0); g.stroke();
    } else {
      p.speckle(g, 30, 2, 4, 14, 12, 0.3, darken(c, 0.4), 0.45);
      p.speckle(g, 12, 2, 4, 14, 12, 0.25, lighten(c, 0.4), 0.4);
    }
  }, mat);
  if (matte) {
    p.part((g) => { poly(g, [D[0], D[1], C[0], C[1], C[0], C[1] + h, D[0], D[1] + h]); g.fillStyle = 'rgba(0,0,0,0)'; g.fill(); }, (g) => {
      p.speckle(g, 30, 4, 6, 15, 15, 0.3, darken(c, 0.5), 0.5);
    }, mat);
  }
}
export const brick = (p: P) => ingot(p, true);

export function nugget(p: P) {
  const c = p.params.color;
  const lumps: [number, number, number][] = [[6.2, 9.4, 3.0], [10.2, 8.2, 2.5], [8.4, 5.6, 2.2]];
  for (const [x, y, r] of lumps) {
    const pts = blobPts(p, x, y, r, r * 0.85, 8, 0.15);
    blob(p, pts, c, METAL, { light: 0.6, dark: 0.55, spec: 0.8 });
  }
}

export function scrap(p: P) {
  const c = p.params.color;
  const pts = [2.4, 7.0, 5.6, 2.8, 10.6, 2.4, 13.8, 6.0, 13.2, 11.6, 8.6, 14.0, 3.6, 12.4];
  p.part((g) => { poly(g, pts); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 8, 8, 6.8, c, 0.35, 0.6);
    g.strokeStyle = rgba(darken(c, 0.6), 0.85);
    g.lineWidth = 0.45;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      const y = 4 + i * 2.1;
      g.moveTo(3 + p.rand(), y + p.rand());
      g.bezierCurveTo(6, y - 1 + p.rand() * 2, 9, y + p.rand() * 2, 13 - p.rand(), y - 0.5 + p.rand());
      g.stroke();
    }
    p.speckle(g, 18, 3, 3, 13, 13, 0.35, 0xb08a70, 0.6);
  }, { metal: 0.6, rough: 0.55 });
}

export function dust(p: P) {
  const c = p.params.color, d = p.params.color2 || darken(c, 0.5);
  const glow = /glowstone|blaze/.test(p.params.name) ? 0.6 : p.params.name === 'redstone' ? 0.25 : 0;
  const pts = [1.2, 13.6, 2.6, 11.0, 5.0, 8.6, 6.8, 5.6, 8.4, 4.6, 10.0, 6.2, 11.6, 8.8, 13.8, 11.0, 14.8, 13.6, 12.0, 14.6, 4.0, 14.6];
  p.part((g) => { smooth(g, pts, true, 0.4); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 7.6, 8.4, 7.4, c, 0.45, 0.55);
    p.speckle(g, 90, 1.5, 4.5, 14.5, 14.6, 0.32, d, 0.75);
    p.speckle(g, 70, 1.5, 4.5, 14.5, 14.6, 0.26, lighten(c, 0.6), 0.75);
    if (p.params.name === 'sugar') p.speckle(g, 20, 2, 5, 14, 14, 0.35, 0xffffff, 1);
  }, { rough: 0.85, emissive: glow });
  // loose grains around the heap
  p.part((g) => {
    g.fillStyle = rgba(c);
    for (let i = 0; i < 9; i++) { circle(g, 1.5 + p.rand() * 13, 13.4 + p.rand() * 1.4, 0.35 + p.rand() * 0.25); g.fill(); }
  }, undefined, { rough: 0.85, emissive: glow });
}

export function boneMeal(p: P) {
  p.params.color2 = 0xb8b4a8;
  dust(p);
}

export function flint(p: P) {
  const c = p.params.color;
  const pts = [3.4, 12.6, 2.6, 7.6, 5.4, 3.2, 10.2, 2.0, 13.4, 5.0, 13.0, 10.4, 9.0, 14.2, 5.6, 14.4];
  p.part((g) => { poly(g, pts); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    const f = (pp: number[], cc: Col) => { poly(g, pp); g.fillStyle = rgba(cc); g.fill(); };
    f([2.6, 7.6, 5.4, 3.2, 10.2, 2.0, 7.4, 7.6], lighten(c, 0.35));
    f([10.2, 2.0, 13.4, 5.0, 11.2, 8.4, 7.4, 7.6], lighten(c, 0.12));
    f([2.6, 7.6, 7.4, 7.6, 6.4, 12.0, 3.4, 12.6], c);
    f([7.4, 7.6, 11.2, 8.4, 13.0, 10.4, 9.0, 14.2, 6.4, 12.0], darken(c, 0.3));
    // conchoidal ripples
    g.strokeStyle = rgba(lighten(c, 0.55), 0.45);
    g.lineWidth = 0.18;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(4.0, 4.6, 1.6 + i * 1.2, 0.1, 1.5); g.stroke(); }
    p.spec(g, 6.0, 4.6, 1.8, 0.6, -0.6, 0.6);
  }, { rough: 0.25 });
}

export function clayBall(p: P) {
  const c = p.params.color;
  const pts = blobPts(p, 8, 8.4, 5.8, 5.2, 10, 0.08, 0.4);
  blob(p, pts, c, { rough: 0.75 }, { light: 0.4, dark: 0.5 });
  p.overlay((g) => smooth(g, pts), (g) => {
    p.speckle(g, 30, 3, 3, 13, 13, 0.3, darken(c, 0.3), 0.4);
    g.strokeStyle = rgba(darken(c, 0.25), 0.35);
    g.lineWidth = 0.25;
    g.beginPath(); g.arc(9, 9, 2.4, 0.4, 2.2); g.stroke();
    g.beginPath(); g.arc(6.4, 7.0, 1.6, 3.4, 5.0); g.stroke();
  });
}

export function string(p: P) {
  const c = p.params.color;
  p.part((g) => {
    g.beginPath();
    g.moveTo(2.4, 13.4);
    g.bezierCurveTo(6.0, 13.8, 4.2, 9.0, 7.2, 8.6);
    g.bezierCurveTo(10.6, 8.2, 11.6, 12.6, 8.6, 12.4);
    g.bezierCurveTo(5.6, 12.2, 6.0, 5.4, 9.6, 4.6);
    g.bezierCurveTo(12.4, 4.0, 13.0, 6.6, 11.2, 7.0);
    g.bezierCurveTo(9.6, 7.4, 9.6, 3.0, 13.8, 2.4);
    g.strokeStyle = rgba(c);
    g.lineWidth = 0.95;
    g.stroke();
  }, (g) => {
    g.strokeStyle = rgba(darken(c, 0.3), 0.6);
    g.lineWidth = 0.18;
    g.setLineDash([0.35, 0.35]);
    g.beginPath();
    g.moveTo(2.4, 13.6);
    g.bezierCurveTo(6.0, 14.0, 4.2, 9.2, 7.2, 8.8);
    g.bezierCurveTo(10.6, 8.4, 11.6, 12.8, 8.6, 12.6);
    g.bezierCurveTo(5.6, 12.4, 6.0, 5.6, 9.6, 4.8);
    g.stroke();
    g.setLineDash([]);
  }, CLOTH);
}

export function feather(p: P) {
  const c = p.params.color;
  const vane = [2.2, 14.0, 3.6, 10.6, 6.6, 6.6, 10.6, 3.2, 14.0, 1.6, 13.2, 4.4, 10.4, 8.6, 6.4, 12.0, 3.4, 13.6];
  p.part((g) => { smooth(g, vane, true, 0.45); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    g.fillStyle = lin(g, 4, 6, 10, 12, [[0, lighten(c, 0.5)], [0.5, c], [1, darken(tint(c, -0.4), 0.3)]]);
    g.fillRect(0, 0, 16, 16);
    // barbs
    g.strokeStyle = rgba(darken(c, 0.25), 0.55);
    g.lineWidth = 0.14;
    for (let i = 0; i < 14; i++) {
      const t = i / 14;
      const x = 3.2 + t * 10.2, y = 13.2 - t * 11.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 1.4, y - 2.6 + t); g.stroke();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2.4 - t, y + 0.9); g.stroke();
    }
    // notch in the vane
    g.globalCompositeOperation = 'destination-out';
    poly(g, [6.6, 10.4, 8.6, 10.4, 7.0, 9.0]);
    g.fill();
  }, CLOTH);
  // rachis (quill)
  p.part((g) => {
    g.beginPath();
    g.moveTo(1.6, 14.8);
    g.quadraticCurveTo(7, 8.4, 13.6, 2.0);
    g.strokeStyle = rgba(lighten(c, 0.2));
    g.lineWidth = 0.55;
    g.stroke();
  }, (g) => {
    g.fillStyle = rgba(0xd8d0c0, 0.6);
    g.fillRect(0, 10, 6, 6);
  }, { rough: 0.4 });
}

export function hide(p: P) {
  const c = p.params.color;
  const pts = [2.0, 3.6, 4.4, 2.6, 6.6, 3.8, 9.6, 3.4, 11.8, 2.2, 14.0, 3.8, 13.0, 7.0, 14.2, 10.6, 12.6, 13.6, 9.6, 12.4, 6.8, 13.4, 3.6, 14.0, 2.2, 10.8, 3.2, 7.4];
  p.part((g) => { smooth(g, pts, true, 0.4); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 8, 8, 7.5, c, 0.3, 0.5);
    // grain + wrinkles
    p.speckle(g, 60, 2, 2, 14, 14, 0.25, darken(c, 0.4), 0.35);
    g.strokeStyle = rgba(darken(c, 0.35), 0.45);
    g.lineWidth = 0.25;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(3.5 + i * 2.4, 5 + p.rand() * 2);
      g.quadraticCurveTo(5 + i * 2.4, 8, 4 + i * 2.4, 11 + p.rand() * 2);
      g.stroke();
    }
    if (p.params.name === 'rabbit_hide') {
      g.strokeStyle = rgba(lighten(c, 0.35), 0.5);
      g.lineWidth = 0.15;
      for (let i = 0; i < 40; i++) {
        const x = 3 + p.rand() * 10, y = 3 + p.rand() * 10;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.5, y + 0.9); g.stroke();
      }
    }
    // edge stitching
    g.setLineDash([0.5, 0.5]);
    g.strokeStyle = rgba(lighten(c, 0.45), 0.6);
    g.lineWidth = 0.2;
    smooth(g, pts.map((v, i) => (i % 2 === 0 ? 8 + (v - 8) * 0.8 : 8.2 + (v - 8.2) * 0.8)), true, 0.4);
    g.stroke();
    g.setLineDash([]);
  }, { rough: 0.7 });
}

export function rabbitFoot(p: P) {
  const c = p.params.color;
  p.part((g) => {
    g.beginPath();
    g.moveTo(4.0, 13.8);
    g.bezierCurveTo(2.6, 11.2, 4.6, 6.6, 8.0, 4.2);
    g.bezierCurveTo(10.4, 2.4, 13.8, 2.6, 13.6, 5.2);
    g.bezierCurveTo(13.4, 7.6, 10.4, 9.4, 8.4, 11.8);
    g.bezierCurveTo(7.0, 13.6, 5.6, 15.0, 4.0, 13.8);
    g.closePath();
    g.fillStyle = rgba(c);
    g.fill();
  }, (g) => {
    p.volume(g, 9, 7, 6.5, c, 0.4, 0.5);
    g.strokeStyle = rgba(lighten(c, 0.4), 0.6);
    g.lineWidth = 0.16;
    for (let i = 0; i < 70; i++) {
      const x = 4 + p.rand() * 9.5, y = 3 + p.rand() * 11;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 0.4, y + 0.9); g.stroke();
    }
    g.fillStyle = rgba(0x8a5a4a);
    for (const [x, y] of [[12.2, 3.4], [13.4, 4.8], [11.2, 2.8]]) { ellipse(g, x, y, 0.55, 0.4, 0.5); g.fill(); }
    g.fillStyle = rgba(0x6a3a2a, 0.9);
    ellipse(g, 4.6, 13.2, 1.2, 0.9, 0.3);
    g.fill();
  }, CLOTH);
}

export function bone(p: P) {
  const c = p.params.color;
  p.part((g) => {
    capsule(g, 4.0, 12.0, 12.0, 4.0, 1.25);
    for (const [x, y] of [[2.6, 12.0], [4.0, 13.4], [12.0, 2.6], [13.4, 4.0]]) circle(g, x, y, 1.75, false);
    g.fillStyle = rgba(c);
    g.fill();
  }, (g) => {
    p.cylinder(g, 4, 12, 12, 4, 2.6, c, 0.35, 0.45);
    p.speckle(g, 25, 2, 2, 14, 14, 0.25, darken(c, 0.25), 0.4);
    g.strokeStyle = rgba(darken(c, 0.25), 0.5);
    g.lineWidth = 0.25;
    g.beginPath(); g.moveTo(5.2, 12.0); g.lineTo(11.6, 5.6); g.stroke();
  }, { rough: 0.55 });
}

export function ball(p: P) {
  const c = p.params.color;
  const pts = blobPts(p, 8, 8.6, 5.6, 5.0, 10, 0.06, 0.2);
  p.part((g) => { smooth(g, pts); g.fillStyle = rgba(c, 0.95); g.fill(); }, (g) => {
    p.volume(g, 8, 8.6, 5.8, c, 0.45, 0.45);
    g.fillStyle = rgba(darken(saturate(c, 1.2), 0.25), 0.65);
    ellipse(g, 8.6, 9.4, 3.0, 2.6);
    g.fill();
    g.fillStyle = rgba(darken(c, 0.15), 0.5);
    circle(g, 6.0, 11.0, 0.6); g.fill();
    circle(g, 10.6, 6.4, 0.45); g.fill();
    p.spec(g, 6.0, 5.8, 1.9, 0.9, -0.5, 0.95);
    p.spec(g, 11.0, 11.2, 0.8, 0.4, 0.6, 0.35);
  }, WET);
}

export function magmaCream(p: P) {
  const c = p.params.color;
  const pts = blobPts(p, 8, 8.6, 5.6, 5.2, 10, 0.08, 0.1);
  p.part((g) => { smooth(g, pts); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 8, 8.6, 5.8, c, 0.5, 0.35);
    // dark slime skin with glowing magma showing through cracks
    g.fillStyle = rgba(0x4a1c08, 0.85);
    for (let i = 0; i < 7; i++) {
      const x = 3 + p.rand() * 10, y = 3.5 + p.rand() * 10, r = 0.9 + p.rand() * 1.4;
      ellipse(g, x, y, r, r * (0.6 + p.rand() * 0.4), p.rand() * 3);
      g.fill();
    }
    g.strokeStyle = rgba(0xffd060, 0.9);
    g.lineWidth = 0.22;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      const x = 3.5 + p.rand() * 9, y = 4 + p.rand() * 9;
      g.moveTo(x, y); g.lineTo(x + (p.rand() - 0.5) * 3, y + (p.rand() - 0.5) * 3); g.lineTo(x + (p.rand() - 0.5) * 4, y + (p.rand() - 0.5) * 4);
      g.stroke();
    }
    p.spec(g, 6.2, 6.0, 1.6, 0.8, -0.5, 0.7, 0xfff0a0);
  }, { rough: 0.3, emissive: 0.55 });
}

export function rod(p: P) {
  const c = p.params.color;
  p.part((g) => { capsule(g, 3.2, 12.8, 12.8, 3.2, 1.25); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.cylinder(g, 3.2, 12.8, 12.8, 3.2, 1.25, c, 0.55, 0.45);
    g.strokeStyle = 'rgba(255,255,220,0.85)';
    g.lineWidth = 0.4;
    g.beginPath(); g.moveTo(3.6, 12.0); g.lineTo(12.0, 3.6); g.stroke();
    // rough nodes
    for (let i = 0; i < 4; i++) {
      const t = 0.15 + i * 0.22;
      g.fillStyle = rgba(0xb05000, 0.75);
      ellipse(g, 3.2 + 9.6 * t + 0.6, 12.8 - 9.6 * t + 0.6, 0.6, 0.35, -0.8);
      g.fill();
    }
  }, GLOW);
}

export function tear(p: P) {
  const c = p.params.color;
  p.part((g) => {
    g.beginPath();
    g.moveTo(8, 1.6);
    g.bezierCurveTo(9.4, 4.6, 12.8, 7.4, 12.8, 10.4);
    g.bezierCurveTo(12.8, 13.2, 10.6, 14.8, 8, 14.8);
    g.bezierCurveTo(5.4, 14.8, 3.2, 13.2, 3.2, 10.4);
    g.bezierCurveTo(3.2, 7.4, 6.6, 4.6, 8, 1.6);
    g.closePath();
    g.fillStyle = rgba(c, 0.9);
    g.fill();
  }, (g) => {
    g.fillStyle = rad(g, 6.6, 9.4, 0.5, 8, 10.4, 6, [[0, 0xffffff], [0.35, c], [0.8, mix(c, 0x6aa8c0, 0.45)], [1, mix(c, 0x3a7088, 0.6)]]);
    g.fillRect(0, 0, 16, 16);
    p.spec(g, 6.0, 9.0, 1.2, 2.0, 0.3, 0.9);
    p.spec(g, 10.4, 12.6, 0.8, 0.5, 0.4, 0.5);
  }, { rough: 0.05 });
}

export function membrane(p: P) {
  const c = p.params.color;
  const pts = [2.0, 4.0, 6.0, 2.4, 10.0, 3.6, 14.2, 2.6, 13.4, 7.0, 14.0, 12.0, 10.4, 11.0, 7.0, 13.8, 3.0, 12.4, 3.6, 8.0];
  p.part((g) => { smooth(g, pts, true, 0.35); g.fillStyle = rgba(c, 0.85); g.fill(); }, (g) => {
    p.volume(g, 8, 8, 7, c, 0.3, 0.4);
    g.strokeStyle = rgba(darken(c, 0.35), 0.6);
    g.lineWidth = 0.25;
    for (const [x0, y0, x1, y1] of [[3, 4, 12, 11], [6, 3, 8, 12], [12, 3.5, 5, 12]]) {
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(8, 7, x1, y1); g.stroke();
    }
    p.spec(g, 6, 5, 2, 0.8, -0.4, 0.4);
  }, { rough: 0.35 });
}

export function enderPearl(p: P) {
  const c = p.params.color;
  p.part((g) => { circle(g, 8, 8.4, 5.9); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    g.fillStyle = rad(g, 6.2, 6.4, 0.5, 8, 8.4, 6.4, [[0, 0x9af0d8], [0.3, lighten(c, 0.15)], [0.75, darken(c, 0.35)], [1, 0x061a18]]);
    g.fillRect(0, 0, 16, 16);
    g.strokeStyle = 'rgba(140,255,220,0.35)';
    g.lineWidth = 0.4;
    g.beginPath(); g.arc(8.6, 9.0, 3.4, 2.4, 5.6); g.stroke();
    g.beginPath(); g.arc(7.4, 8.0, 2.0, -0.6, 2.2); g.stroke();
    p.spec(g, 5.8, 5.8, 1.7, 0.9, -0.6, 0.95);
  }, { rough: 0.08 });
}

export function enderEye(p: P) {
  const c = p.params.color;
  p.part((g) => { circle(g, 8, 8.4, 5.9); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    g.fillStyle = rad(g, 8, 8.4, 0.5, 8, 8.4, 6.0, [[0, 0xc8f070], [0.35, 0x6ab84a], [0.75, c], [1, 0x082a10]]);
    g.fillRect(0, 0, 16, 16);
    // iris rays
    g.strokeStyle = 'rgba(20,60,20,0.5)';
    g.lineWidth = 0.2;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.beginPath(); g.moveTo(8 + Math.cos(a) * 1.4, 8.4 + Math.sin(a) * 1.4); g.lineTo(8 + Math.cos(a) * 4.2, 8.4 + Math.sin(a) * 4.2); g.stroke();
    }
    // slit pupil
    g.fillStyle = rgba(0x050a05);
    ellipse(g, 8, 8.4, 0.9, 3.0);
    g.fill();
    p.spec(g, 5.8, 5.8, 1.6, 0.9, -0.6, 0.95);
  }, { rough: 0.08, emissive: 0.2 });
}

export function paper(p: P) {
  const c = p.params.color;
  const sheet = (dx: number, dy: number, rot: number, shade: number) => {
    p.part((g) => {
      g.save(); g.translate(8 + dx, 8 + dy); g.rotate(rot);
      g.beginPath();
      g.moveTo(-5.2, -6.0); g.lineTo(4.4, -6.0); g.quadraticCurveTo(5.4, -5.6, 5.2, -4.6); g.lineTo(5.2, 6.0); g.lineTo(-4.8, 6.0); g.quadraticCurveTo(-5.6, 5.0, -5.2, 4.2); g.closePath();
      g.fillStyle = rgba(darken(c, shade)); g.fill();
      g.restore();
    }, (g) => {
      g.fillStyle = lin(g, 2, 2, 14, 14, [[0, 0xffffff, 0.5], [0.6, 0xffffff, 0], [1, 0x8a7a60, 0.25]]);
      g.fillRect(0, 0, 16, 16);
      p.speckle(g, 25, 2, 2, 14, 14, 0.2, 0xb8a888, 0.3);
    }, CLOTH);
  };
  sheet(0.8, 0.6, 0.12, 0.12);
  sheet(-0.6, -0.4, -0.08, 0);
}

export function nautilusShell(p: P) {
  const c = p.params.color;
  p.part((g) => {
    g.beginPath();
    g.moveTo(3.0, 12.8);
    g.bezierCurveTo(1.0, 7.6, 4.6, 2.4, 9.6, 2.6);
    g.bezierCurveTo(13.6, 2.8, 15.0, 7.4, 13.4, 10.6);
    g.bezierCurveTo(12.0, 13.4, 8.2, 14.8, 3.0, 12.8);
    g.closePath();
    g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    p.volume(g, 9, 8, 6.5, c, 0.35, 0.45);
    g.strokeStyle = rgba(0xa05a3a, 0.75);
    g.lineWidth = 0.55;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(9.6, 7.8, 1.2 + i * 1.1, 1.8 + i * 0.25, 4.4 + i * 0.25);
      g.stroke();
    }
    g.fillStyle = rgba(darken(c, 0.5));
    ellipse(g, 10.2, 8.2, 1.4, 1.8, 0.3);
    g.fill();
  }, { rough: 0.3 });
}

export function heartOfTheSea(p: P) {
  const c = p.params.color;
  p.part((g) => { circle(g, 8, 8.2, 6.2); g.fillStyle = rgba(0x3a4a58); g.fill(); }, (g) => {
    p.volume(g, 8, 8.2, 6.2, 0x4a5a6a, 0.35, 0.55);
    p.speckle(g, 40, 2, 2, 14, 14, 0.4, 0x2a3440, 0.6);
  }, { rough: 0.55 });
  p.part((g) => { circle(g, 8, 8.2, 3.9); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    g.fillStyle = rad(g, 7, 7, 0.3, 8, 8.2, 4.2, [[0, 0xd8f4ff], [0.35, lighten(c, 0.35)], [0.8, c], [1, darken(c, 0.5)]]);
    g.fillRect(0, 0, 16, 16);
    p.spec(g, 6.6, 6.6, 1.2, 0.7, -0.6, 0.95);
  }, { rough: 0.05, emissive: 0.45 });
}

export function scute(p: P) {
  const c = p.params.color;
  const hex = [8, 2.0, 13.4, 5.0, 13.4, 11.0, 8, 14.2, 2.6, 11.0, 2.6, 5.0];
  p.part((g) => { smooth(g, hex, true, 0.15); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 8, 8, 6.5, c, 0.35, 0.5);
    g.strokeStyle = rgba(lighten(c, 0.35), 0.7);
    g.lineWidth = 0.35;
    poly(g, [8, 4.6, 10.8, 6.2, 10.8, 9.8, 8, 11.4, 5.2, 9.8, 5.2, 6.2]);
    g.stroke();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
      g.beginPath(); g.moveTo(8 + Math.cos(a) * 3.2, 8 + Math.sin(a) * 3.2); g.lineTo(8 + Math.cos(a) * 5.8, 8 + Math.sin(a) * 5.8); g.stroke();
    }
    p.spec(g, 6, 5, 2, 0.8, -0.5, 0.5);
  }, { rough: 0.3 });
}

export function shulkerShell(p: P) {
  const c = p.params.color;
  p.part((g) => {
    g.beginPath();
    g.moveTo(1.6, 11.6);
    g.bezierCurveTo(1.6, 4.0, 4.6, 2.2, 8, 2.2);
    g.bezierCurveTo(11.4, 2.2, 14.4, 4.0, 14.4, 11.6);
    g.lineTo(14.4, 13.2); g.lineTo(1.6, 13.2); g.closePath();
    g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    p.volume(g, 8, 7, 7.5, c, 0.35, 0.5);
    g.fillStyle = rgba(darken(c, 0.35));
    g.fillRect(1.6, 11.2, 12.8, 2.0);
    g.strokeStyle = rgba(lighten(c, 0.3), 0.6);
    g.lineWidth = 0.3;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(3 + i * 2.5, 11.2); g.lineTo(3.4 + i * 2.3, 4.0 + Math.abs(i - 2) * 0.8); g.stroke(); }
  }, { rough: 0.4 });
}

export function netherStar(p: P) {
  const c = p.params.color;
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? 7.2 : 2.6;
    pts.push(8 + Math.cos(a) * r, 8 + Math.sin(a) * r);
  }
  p.part((g) => { poly(g, pts); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    for (let i = 0; i < 8; i += 2) {
      const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
      const tip = [8 + Math.cos(a) * 7.2, 8 + Math.sin(a) * 7.2];
      const l = [8 + Math.cos(a - Math.PI / 4) * 2.6, 8 + Math.sin(a - Math.PI / 4) * 2.6];
      const r = [8 + Math.cos(a + Math.PI / 4) * 2.6, 8 + Math.sin(a + Math.PI / 4) * 2.6];
      facet(g, [8, 8, l[0], l[1], tip[0], tip[1]], i < 4 ? 0xffffff : 0xd8d0f0);
      facet(g, [8, 8, tip[0], tip[1], r[0], r[1]], i < 4 ? 0xc8c0e8 : 0x9a90c8);
    }
    p.spec(g, 8, 8, 2.4, 2.4, 0, 0.9);
  }, { rough: 0.15, emissive: 0.6 });
}

export function discFragment(p: P) {
  const c = p.params.color;
  p.part((g) => { poly(g, [2.4, 13.2, 7.6, 2.4, 13.6, 9.6, 9.0, 13.6]); g.fillStyle = rgba(0x1a1a1e); g.fill(); }, (g) => {
    g.strokeStyle = 'rgba(120,120,140,0.35)';
    g.lineWidth = 0.18;
    for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(2.0, 15.0, 4 + i * 1.4, -1.4, -0.1); g.stroke(); }
    g.fillStyle = rgba(c);
    g.beginPath(); g.arc(2.0, 15.0, 3.6, -1.3, -0.05); g.lineTo(2, 15); g.fill();
    p.spec(g, 8, 6, 2, 0.6, -1, 0.5);
  }, { rough: 0.2 });
}

export function honeycomb(p: P) {
  const c = p.params.color;
  const cells: [number, number][] = [[5.0, 5.6], [9.0, 4.4], [12.4, 7.2], [7.4, 9.0], [11.0, 11.2], [4.0, 10.6], [7.6, 13.0]];
  const hex = (g: Ctx, x: number, y: number, r: number) => {
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i / 6) * Math.PI * 2; pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    poly(g, pts);
  };
  p.part((g) => {
    g.fillStyle = rgba(c);
    for (const [x, y] of cells) { hex(g, x, y, 2.3); g.fill(); }
  }, (g) => {
    p.volume(g, 8, 8.4, 7, c, 0.35, 0.5);
    for (const [x, y] of cells) {
      g.fillStyle = rgba(darken(c, 0.35));
      hex(g, x, y, 1.5);
      g.fill();
      g.fillStyle = rgba(0xffe080, 0.85);
      hex(g, x - 0.25, y - 0.25, 1.1);
      g.fill();
      p.spec(g, x - 0.6, y - 0.6, 0.6, 0.35, -0.6, 0.85);
    }
  }, { rough: 0.2 });
}

export function inkSac(p: P) {
  const c = p.params.color;
  const glow = p.params.name === 'glow_ink_sac';
  p.part((g) => {
    g.beginPath();
    g.moveTo(8, 2.0);
    g.bezierCurveTo(9.6, 2.0, 9.4, 4.4, 10.6, 5.6);
    g.bezierCurveTo(13.6, 7.0, 14.0, 10.2, 12.6, 12.4);
    g.bezierCurveTo(11.0, 14.8, 5.0, 14.8, 3.4, 12.4);
    g.bezierCurveTo(2.0, 10.2, 2.4, 7.0, 5.4, 5.6);
    g.bezierCurveTo(6.6, 4.4, 6.4, 2.0, 8, 2.0);
    g.closePath();
    g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    p.volume(g, 8, 9.4, 6, c, 0.4, 0.5);
    if (glow) p.speckle(g, 10, 4, 7, 12, 13, 0.9, p.params.color2, 0.9);
    g.strokeStyle = rgba(lighten(c, 0.3), 0.5);
    g.lineWidth = 0.3;
    g.beginPath(); g.moveTo(7.2, 3.4); g.quadraticCurveTo(6.6, 5, 5.6, 6); g.stroke();
    p.spec(g, 6.0, 8.6, 1.6, 0.9, -0.5, 0.75);
  }, { rough: 0.25, emissive: glow ? 0.5 : 0 });
}

export function cocoaBeans(p: P) {
  const c = p.params.color;
  for (const [x, y, rot] of [[5.4, 9.8, 0.7], [10.6, 10.4, -0.5], [8.2, 5.4, 0.1]] as [number, number, number][]) {
    p.part((g) => { ellipse(g, x, y, 2.6, 3.6, rot); g.fillStyle = rgba(c); g.fill(); }, (g) => {
      p.volume(g, x, y, 3.6, c, 0.4, 0.55);
      g.save(); g.translate(x, y); g.rotate(rot);
      g.strokeStyle = rgba(darken(c, 0.55), 0.85);
      g.lineWidth = 0.35;
      g.beginPath(); g.moveTo(0, -2.6); g.quadraticCurveTo(0.6, 0, 0, 2.6); g.stroke();
      g.restore();
      p.spec(g, x - 1, y - 1.4, 0.8, 0.5, rot, 0.6);
    }, { rough: 0.45 });
  }
}

export function wheat(p: P) {
  const c = p.params.color;
  const stalks: [number, number, number, number][] = [[4.0, 14.6, 9.8, 4.0], [4.6, 14.8, 12.6, 6.6], [3.6, 14.2, 6.8, 2.8], [5.0, 15.0, 13.6, 9.6]];
  for (const [x0, y0, x1, y1] of stalks) {
    p.part((g) => { g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 - 0.6, (y0 + y1) / 2 + 0.6, x1, y1); g.strokeStyle = rgba(darken(c, 0.15)); g.lineWidth = 0.45; g.stroke(); }, undefined, CLOTH);
  }
  for (const [, , x1, y1] of stalks) {
    const a = Math.atan2(y1 - 14.6, x1 - 4.2);
    p.part((g) => {
      g.save(); g.translate(x1, y1); g.rotate(a);
      for (let i = 0; i < 4; i++) { ellipse(g, -i * 0.95, (i % 2 ? 0.55 : -0.55), 0.85, 0.5, 0.35 * (i % 2 ? -1 : 1), false); }
      ellipse(g, 0.9, 0, 0.8, 0.45, 0, false);
      g.fillStyle = rgba(c); g.fill();
      g.restore();
    }, (g) => {
      g.save(); g.translate(x1, y1); g.rotate(a);
      g.fillStyle = lin(g, 0, -1.2, 0, 1.2, [[0, lighten(c, 0.45)], [1, darken(c, 0.35)]]);
      g.fillRect(-5, -2, 7, 4);
      g.strokeStyle = rgba(lighten(c, 0.5), 0.6);
      g.lineWidth = 0.1;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-i * 0.95 + 0.6, (i % 2 ? 0.55 : -0.55)); g.lineTo(-i * 0.95 + 2.2, (i % 2 ? 1.3 : -1.3)); g.stroke(); }
      g.restore();
    }, CLOTH);
  }
  // twine
  p.part((g) => { ellipse(g, 4.6, 13.0, 1.2, 0.55, -0.6); g.fillStyle = rgba(0x9a7a3a); g.fill(); }, undefined, CLOTH);
}

export function egg(p: P) {
  const c = p.params.color;
  p.part((g) => { eggPath(g, 8, 8.4, 9.0, 12.0, 0.25); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 8.3, 8.6, 6.6, c, 0.5, 0.45);
    p.speckle(g, 22, 4, 3, 12, 14, 0.3, darken(c, 0.3), 0.45);
    p.spec(g, 6.4, 5.6, 1.6, 1.0, -0.4, 0.5);
  }, { rough: 0.5 });
}

export function snowball(p: P) {
  const c = p.params.color;
  const pts = blobPts(p, 8, 8.6, 5.8, 5.4, 12, 0.06, 0.2);
  p.part((g) => { smooth(g, pts); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    g.fillStyle = rad(g, 6.2, 6.6, 0.5, 8, 8.6, 6.6, [[0, 0xffffff], [0.45, 0xeef4ff], [0.85, 0xa8c0dc], [1, 0x7890b0]]);
    g.fillRect(0, 0, 16, 16);
    p.speckle(g, 50, 2.5, 3, 13.5, 14, 0.4, 0xc8d8f0, 0.6);
    p.speckle(g, 25, 2.5, 3, 13.5, 14, 0.3, 0xffffff, 0.9);
  }, { rough: 0.8 });
}

export function fermentedSpiderEye(p: P) {
  spiderEyeBase(p, p.params.color, true);
}
export function spiderEye(p: P) {
  spiderEyeBase(p, p.params.color, false);
}
function spiderEyeBase(p: P, c: Col, fermented: boolean) {
  p.part((g) => { ellipse(g, 8, 9.6, 5.6, 4.8, 0.1); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 8, 9.6, 5.6, c, 0.35, 0.55);
    g.strokeStyle = rgba(darken(c, 0.55), 0.7);
    g.lineWidth = 0.22;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      const a = (i / 6) * Math.PI * 2;
      g.moveTo(8 + Math.cos(a) * 1.5, 9.6 + Math.sin(a) * 1.3);
      g.quadraticCurveTo(8 + Math.cos(a + 0.3) * 3.5, 9.6 + Math.sin(a + 0.3) * 3, 8 + Math.cos(a) * 5.2, 9.6 + Math.sin(a) * 4.3);
      g.stroke();
    }
    // cluster of small black eyes
    g.fillStyle = rgba(0x120808);
    for (const [x, y, r] of [[7.0, 8.6, 1.0], [9.4, 8.4, 0.85], [8.2, 10.6, 0.75], [10.2, 10.4, 0.55]] as [number, number, number][]) { circle(g, x, y, r); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (const [x, y] of [[6.7, 8.3], [9.1, 8.1], [7.9, 10.3]]) { circle(g, x, y, 0.25); g.fill(); }
    p.spec(g, 5.4, 7.0, 1.4, 0.7, -0.5, 0.6);
  }, WET);
  if (fermented) {
    // brown mushroom on top + sugar
    p.part((g) => {
      g.beginPath();
      g.moveTo(9.0, 6.4); g.lineTo(10.0, 6.4); g.lineTo(9.9, 3.8); g.lineTo(9.2, 3.8); g.closePath();
      g.fillStyle = rgba(0xe8dcc8); g.fill();
      ellipse(g, 9.6, 3.4, 3.0, 1.6);
      g.fillStyle = rgba(0x9a6a4a); g.fill();
    }, (g) => {
      g.fillStyle = lin(g, 6.6, 2, 12.6, 5, [[0, 0xc89a78], [1, 0x6a4028]]);
      ellipse(g, 9.6, 3.4, 3.0, 1.6);
      g.fill();
    }, { rough: 0.6 });
    p.part((g) => { g.fillStyle = '#fff'; for (let i = 0; i < 10; i++) { circle(g, 4 + p.rand() * 8, 12 + p.rand() * 2.4, 0.3); g.fill(); } }, undefined, { rough: 0.6 });
  }
}

export function fireCharge(p: P) {
  const c = p.params.color;
  const pts = blobPts(p, 8, 8.4, 5.8, 5.6, 10, 0.1, 0.2);
  p.part((g) => { smooth(g, pts); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 8, 8.4, 6, c, 0.25, 0.6);
    g.strokeStyle = rgba(0xff8a1a);
    g.lineWidth = 0.55;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      const x = 3 + p.rand() * 9, y = 3.5 + p.rand() * 9;
      g.moveTo(x, y); g.lineTo(x + (p.rand() - 0.5) * 4, y + (p.rand() - 0.5) * 4); g.lineTo(x + (p.rand() - 0.5) * 5, y + (p.rand() - 0.5) * 5);
      g.stroke();
    }
    p.speckle(g, 12, 3, 3, 13, 13, 0.7, 0xffd040, 0.9);
  }, { rough: 0.6, emissive: 0.5 });
}

export function fireworkRocket(p: P) {
  const c = p.params.color;
  // stick
  p.part((g) => { capsule(g, 2.0, 14.6, 7.0, 9.6, 0.35); g.fillStyle = rgba(0x9a7040); g.fill(); }, undefined, { rough: 0.7 });
  p.part((g) => { capsule(g, 5.6, 10.4, 11.6, 4.4, 1.9); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.cylinder(g, 5.6, 10.4, 11.6, 4.4, 1.9, c, 0.35, 0.5);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 1.0;
    g.beginPath(); g.moveTo(7.2, 6.4); g.lineTo(9.6, 8.8); g.stroke();
  }, { rough: 0.7 });
  p.part((g) => { poly(g, [10.0, 3.0, 13.0, 6.0, 14.6, 1.4]); g.fillStyle = rgba(0xd8d0c8); g.fill(); }, (g) => {
    g.fillStyle = lin(g, 10, 3, 14, 6, [[0, 0xffffff], [1, 0x8a8a8a]]);
    g.fillRect(0, 0, 16, 16);
  }, { rough: 0.6 });
}

export function fireworkStar(p: P) {
  const pts = blobPts(p, 8, 8.4, 5.4, 5.2, 9, 0.08);
  blob(p, pts, 0x5a5a5e, { rough: 0.8 }, { light: 0.35, dark: 0.55 });
  p.overlay((g) => smooth(g, pts), (g) => {
    p.speckle(g, 14, 3, 3, 13, 13, 0.9, p.params.data?.color ?? 0xc83a3a, 0.9);
    p.speckle(g, 30, 3, 3, 13, 13, 0.35, 0x2a2a2a, 0.6);
    p.speckle(g, 12, 3, 3, 13, 13, 0.3, 0xb0b0b0, 0.6);
  });
}

export function seeds(p: P) {
  const c = p.params.color, d = p.params.color2 || darken(c, 0.4);
  const pos: [number, number, number][] = [[5.0, 5.0, 0.4], [10.4, 4.0, -0.6], [7.6, 8.4, 1.2], [4.2, 11.2, -0.3], [11.4, 10.0, 0.8], [8.2, 12.8, 0.1], [12.6, 13.4, -1.0]];
  for (const [x, y, r] of pos) {
    p.part((g) => { eggPath(g, x, y, 1.9, 2.8, r); g.fillStyle = rgba(c); g.fill(); }, (g) => {
      p.volume(g, x, y, 1.6, c, 0.4, 0.5);
      g.strokeStyle = rgba(d, 0.7);
      g.lineWidth = 0.2;
      g.save(); g.translate(x, y); g.rotate(r);
      g.beginPath(); g.moveTo(0, -1.2); g.lineTo(0, 1.2); g.stroke();
      g.restore();
    }, { rough: 0.5 });
  }
}

export function netherWart(p: P) {
  const c = p.params.color;
  p.part((g) => { g.beginPath(); g.moveTo(7.6, 15); g.quadraticCurveTo(7.2, 11, 8.4, 8); g.strokeStyle = rgba(0x6a1a1a); g.lineWidth = 0.9; g.stroke(); }, undefined, { rough: 0.6 });
  const lumps: [number, number, number][] = [[8.2, 6.4, 3.2], [5.2, 8.6, 2.4], [11.0, 8.8, 2.4], [7.6, 3.4, 1.9], [10.4, 4.6, 1.6]];
  for (const [x, y, r] of lumps) blob(p, blobPts(p, x, y, r, r * 0.9, 8, 0.12), c, { rough: 0.45 }, { light: 0.4, dark: 0.55, spec: 0.35 });
}

export function bamboo(p: P) {
  const c = p.params.color;
  p.part((g) => { capsule(g, 3.6, 14.2, 11.6, 2.6, 1.05); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.cylinder(g, 3.6, 14.2, 11.6, 2.6, 1.05, c, 0.4, 0.5);
    for (const t of [0.3, 0.62, 0.9]) {
      const x = 3.6 + 8 * t, y = 14.2 - 11.6 * t;
      g.strokeStyle = rgba(darken(c, 0.45));
      g.lineWidth = 0.45;
      g.beginPath(); g.moveTo(x - 1.1, y - 0.6); g.lineTo(x + 1.1, y + 0.6); g.stroke();
      g.strokeStyle = rgba(lighten(c, 0.4), 0.7);
      g.lineWidth = 0.2;
      g.beginPath(); g.moveTo(x - 1.0, y - 0.9); g.lineTo(x + 0.9, y + 0.2); g.stroke();
    }
  }, { rough: 0.35 });
  for (const [x, y, a] of [[10.8, 4.0, -0.4], [9.4, 6.6, 2.4]] as [number, number, number][]) {
    p.part((g) => { g.save(); g.translate(x, y); g.rotate(a); ellipse(g, 2.2, 0, 2.6, 0.75); g.restore(); g.fillStyle = rgba(0x5aa03a); g.fill(); }, (g) => {
      g.fillStyle = lin(g, x - 2, y - 2, x + 3, y + 2, [[0, 0x8ad05a], [1, 0x2a6a1a]]);
      g.fillRect(0, 0, 16, 16);
    }, { rough: 0.5 });
  }
}

export function dye(p: P) {
  const c = p.params.color;
  // a dollop of pigment powder in a little heap
  const pts = [1.6, 12.8, 2.4, 10.2, 4.4, 8.2, 6.0, 6.2, 8.2, 4.6, 10.4, 5.0, 11.6, 7.0, 13.4, 9.0, 14.4, 11.6, 13.4, 14.2, 8.0, 14.8, 2.8, 14.4];
  p.part((g) => { smooth(g, pts, true, 0.42); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 7.8, 8.6, 7.0, c, 0.5, 0.5);
    // swirl ridge
    g.strokeStyle = rgba(lighten(c, 0.45), 0.7);
    g.lineWidth = 0.35;
    g.beginPath(); g.moveTo(3.6, 11.4); g.quadraticCurveTo(8, 8.4, 12.6, 11.2); g.stroke();
    g.strokeStyle = rgba(darken(c, 0.35), 0.5);
    g.beginPath(); g.moveTo(4.0, 12.2); g.quadraticCurveTo(8, 9.4, 12.6, 12.0); g.stroke();
    g.strokeStyle = rgba(lighten(c, 0.4), 0.55);
    g.beginPath(); g.moveTo(5.8, 8.2); g.quadraticCurveTo(8.6, 6.0, 10.6, 7.8); g.stroke();
    p.speckle(g, 90, 1.5, 4, 14.5, 15, 0.26, darken(c, 0.45), 0.4);
    p.speckle(g, 70, 1.5, 4, 14.5, 15, 0.22, lighten(c, 0.55), 0.5);
    p.spec(g, 6.6, 7.0, 1.4, 0.5, -0.6, 0.35);
  }, { rough: 0.7 });
}

export function experienceBottleIcon(p: P, bottleFn: (p: P, c: Col | null, glow: number) => void) {
  bottleFn(p, 0x9cf05a, 0.8);
  p.part((g) => { g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 1, 1); }, undefined);
  p.part((g) => {
    g.fillStyle = 'rgba(255,255,160,0.95)';
    for (const [x, y, r] of [[6.4, 10.4, 0.55], [9.6, 12.0, 0.45], [10.4, 9.4, 0.35], [7.6, 13.0, 0.3]] as [number, number, number][]) {
      g.beginPath();
      g.moveTo(x, y - r * 2); g.lineTo(x + r * 0.5, y - r * 0.5); g.lineTo(x + r * 2, y); g.lineTo(x + r * 0.5, y + r * 0.5); g.lineTo(x, y + r * 2); g.lineTo(x - r * 0.5, y + r * 0.5); g.lineTo(x - r * 2, y); g.lineTo(x - r * 0.5, y - r * 0.5); g.closePath();
      g.fill();
    }
  }, undefined, { emissive: 1, rough: 0.2 });
}
