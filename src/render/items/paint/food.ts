/**
 * Painters for food items.
 */
import { type Painter, type Col, type Ctx, poly, smooth, ellipse, circle, capsule, lin, rad, rgba, lighten, darken, mix, tint, WET, METAL } from './kit';
import { blob, blobPts, bowl, bottle } from './shapes';

type P = Painter;
const isGolden = (p: P) => /golden|glistering/.test(p.params.name);

export function apple(p: P) {
  const c = p.params.color;
  const gold = isGolden(p);
  const mat = gold ? { metal: 0.85, rough: 0.22 } : { rough: 0.3 };
  // stem
  p.part((g) => { g.beginPath(); g.moveTo(8.2, 5.2); g.quadraticCurveTo(8.0, 3.0, 9.4, 1.6); g.strokeStyle = rgba(0x5a3a1a); g.lineWidth = 0.7; g.stroke(); }, undefined, { rough: 0.7 });
  p.part((g) => {
    g.beginPath();
    g.moveTo(8, 5.2);
    g.bezierCurveTo(9.6, 3.8, 13.8, 3.6, 14.2, 7.6);
    g.bezierCurveTo(14.6, 11.4, 11.6, 15.0, 9.6, 14.6);
    g.bezierCurveTo(8.8, 14.4, 8.4, 14.0, 8, 14.0);
    g.bezierCurveTo(7.6, 14.0, 7.2, 14.4, 6.4, 14.6);
    g.bezierCurveTo(4.4, 15.0, 1.4, 11.4, 1.8, 7.6);
    g.bezierCurveTo(2.2, 3.6, 6.4, 3.8, 8, 5.2);
    g.closePath();
    g.fillStyle = rgba(c);
    g.fill();
  }, (g) => {
    p.volume(g, 7.8, 9.0, 6.6, c, gold ? 0.6 : 0.4, 0.55);
    if (!gold) {
      g.strokeStyle = rgba(lighten(c, 0.35), 0.25);
      g.lineWidth = 0.2;
      for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(3 + i * 1.1, 6); g.quadraticCurveTo(3.5 + i * 1.0, 10, 4 + i * 0.9, 14); g.stroke(); }
      p.speckle(g, 25, 3, 5, 13, 14, 0.18, 0xf0e080, 0.45);
    } else {
      g.strokeStyle = 'rgba(255,250,210,0.55)';
      g.lineWidth = 0.3;
      g.beginPath(); g.arc(8, 9.6, 5.0, 3.6, 4.6); g.stroke();
    }
    // stem dimple shadow
    g.fillStyle = rgba(darken(c, 0.5), 0.6);
    ellipse(g, 8, 5.4, 1.4, 0.6);
    g.fill();
    p.spec(g, 4.8, 7.2, 1.3, 2.0, 0.35, gold ? 0.95 : 0.75);
  }, mat);
  // leaf
  p.part((g) => {
    g.beginPath();
    g.moveTo(9.0, 3.6);
    g.bezierCurveTo(10.0, 1.4, 13.0, 1.0, 14.2, 1.8);
    g.bezierCurveTo(13.4, 3.6, 11.0, 4.4, 9.0, 3.6);
    g.closePath();
    g.fillStyle = rgba(gold ? 0xd8b030 : 0x4a9a2a);
    g.fill();
  }, (g) => {
    g.fillStyle = lin(g, 9, 3.6, 14, 1.6, [[0, gold ? 0xb08010 : 0x2a6a1a], [1, gold ? 0xfff0a0 : 0x8ad05a]]);
    g.fillRect(0, 0, 16, 16);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 0.15;
    g.beginPath(); g.moveTo(9.2, 3.5); g.lineTo(13.8, 1.9); g.stroke();
  }, gold ? METAL : { rough: 0.45 });
}

export function bread(p: P) {
  const c = p.params.color;
  const pts = [1.6, 11.4, 2.4, 8.0, 5.6, 4.6, 9.8, 2.6, 13.2, 2.6, 14.6, 4.6, 14.0, 7.6, 11.4, 11.0, 7.4, 13.6, 3.4, 14.0];
  p.part((g) => { smooth(g, pts, true, 0.5); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 8, 7.6, 7.4, c, 0.4, 0.55);
    // scoring cuts across the top
    for (let i = 0; i < 4; i++) {
      const x = 4.4 + i * 2.4, y = 9.6 - i * 2.0;
      g.strokeStyle = rgba(lighten(c, 0.45), 0.9);
      g.lineWidth = 0.75;
      g.beginPath(); g.moveTo(x - 0.6, y - 1.6); g.quadraticCurveTo(x + 0.6, y - 0.6, x + 1.0, y + 1.2); g.stroke();
      g.strokeStyle = rgba(darken(c, 0.45), 0.7);
      g.lineWidth = 0.25;
      g.beginPath(); g.moveTo(x - 0.2, y - 1.6); g.quadraticCurveTo(x + 1.0, y - 0.5, x + 1.3, y + 1.0); g.stroke();
    }
    p.speckle(g, 40, 2, 3, 14, 13, 0.22, 0xfff4e0, 0.5);
    p.speckle(g, 30, 2, 3, 14, 13, 0.25, darken(c, 0.45), 0.4);
  }, { rough: 0.75 });
}

export function cookie(p: P) {
  const c = p.params.color;
  const pts = blobPts(p, 8, 8.2, 6.4, 6.0, 14, 0.05);
  p.part((g) => { smooth(g, pts); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    g.fillStyle = rad(g, 7, 7, 0.5, 8, 8.2, 6.8, [[0, lighten(c, 0.35)], [0.6, c], [0.9, darken(c, 0.3)], [1, darken(c, 0.5)]]);
    g.fillRect(0, 0, 16, 16);
    p.speckle(g, 40, 2.5, 2.5, 13.5, 13.5, 0.3, darken(c, 0.3), 0.5);
    for (const [x, y] of [[5.4, 6.0], [9.6, 4.8], [11.2, 9.0], [6.6, 10.8], [8.6, 8.0], [4.4, 9.2], [10.0, 12.0]]) {
      g.fillStyle = rgba(0x3a1e10);
      ellipse(g, x, y, 0.85, 0.7, p.rand());
      g.fill();
      g.fillStyle = 'rgba(255,220,180,0.35)';
      circle(g, x - 0.25, y - 0.25, 0.25);
      g.fill();
    }
  }, { rough: 0.8 });
}

export function pumpkinPie(p: P) {
  const c = p.params.color;
  const crust = 0xd8a050;
  p.part((g) => {
    g.beginPath();
    g.moveTo(1.4, 7.6); g.lineTo(2.4, 12.4);
    g.bezierCurveTo(4.0, 14.8, 12.0, 14.8, 13.6, 12.4);
    g.lineTo(14.6, 7.6);
    g.ellipse(8, 7.6, 6.6, 3.2, 0, 0, Math.PI, true);
    g.closePath();
    g.fillStyle = rgba(crust); g.fill();
  }, (g) => {
    g.fillStyle = lin(g, 1, 0, 15, 0, [[0, darken(crust, 0.2)], [0.3, lighten(crust, 0.25)], [1, darken(crust, 0.45)]]);
    g.fillRect(0, 0, 16, 16);
    g.strokeStyle = rgba(darken(crust, 0.35), 0.6);
    g.lineWidth = 0.3;
    for (let i = 0; i < 9; i++) { const x = 2.4 + i * 1.4; g.beginPath(); g.moveTo(x, 9.5); g.lineTo(x + 0.2, 13.4); g.stroke(); }
  }, { rough: 0.7 });
  p.part((g) => { ellipse(g, 8, 7.6, 6.6, 3.2); g.fillStyle = rgba(crust); g.fill(); }, (g) => {
    g.fillStyle = rad(g, 6.6, 6.8, 0.3, 8, 7.6, 6.2, [[0, lighten(c, 0.3)], [0.7, c], [1, darken(c, 0.3)]]);
    ellipse(g, 8, 7.6, 5.6, 2.5);
    g.fill();
    g.strokeStyle = rgba(darken(c, 0.25), 0.5);
    g.lineWidth = 0.3;
    g.beginPath(); g.arc(8, 7.6, 2.2, 0.4, 2.8); g.stroke();
    p.spec(g, 6.0, 6.6, 1.6, 0.5, 0, 0.5);
    g.strokeStyle = rgba(lighten(crust, 0.3));
    g.lineWidth = 0.5;
    ellipse(g, 8, 7.6, 6.2, 2.9);
    g.stroke();
  }, { rough: 0.4 });
}

export function carrot(p: P) {
  const c = p.params.color;
  const gold = isGolden(p);
  p.part((g) => {
    g.beginPath();
    g.moveTo(1.6, 14.6);
    g.bezierCurveTo(3.6, 11.4, 7.6, 6.6, 10.6, 4.4);
    g.bezierCurveTo(12.0, 3.4, 13.6, 4.8, 12.4, 6.4);
    g.bezierCurveTo(9.8, 9.6, 5.4, 13.0, 1.6, 14.6);
    g.closePath();
    g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    p.cylinder(g, 2, 14, 11.6, 5.2, 1.6, c, gold ? 0.6 : 0.4, 0.5);
    g.strokeStyle = rgba(darken(c, 0.4), 0.7);
    g.lineWidth = 0.22;
    for (let i = 0; i < 6; i++) {
      const t = 0.15 + i * 0.13;
      const x = 1.8 + 9.8 * t, y = 14.4 - 9.6 * t;
      g.beginPath(); g.moveTo(x - 0.4, y - 0.8 - t); g.lineTo(x + 0.6 + t, y + 0.4); g.stroke();
    }
    if (gold) p.speckle(g, 10, 3, 4, 12, 13, 0.4, 0xffffff, 0.9);
  }, gold ? { metal: 0.8, rough: 0.25 } : { rough: 0.45 });
  // leafy top
  const leaves: [number, number, number][] = [[12.6, 2.0, -0.3], [14.4, 3.6, 0.6], [13.8, 1.0, -0.9]];
  for (const [x, y, a] of leaves) {
    p.part((g) => {
      g.save(); g.translate(11.6, 4.6); g.rotate(Math.atan2(y - 4.6, x - 11.6));
      const l = Math.hypot(x - 11.6, y - 4.6) + 0.8;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(l * 0.5, -0.9, l, 0); g.quadraticCurveTo(l * 0.5, 0.9, 0, 0); g.closePath();
      g.restore();
      g.fillStyle = rgba(gold ? 0xd8b030 : 0x4a9a2a); g.fill();
      void a;
    }, (g) => {
      g.fillStyle = lin(g, 11, 5, 15, 1, [[0, gold ? 0xa07a10 : 0x2a6a1a], [1, gold ? 0xfff0a0 : 0x9ae06a]]);
      g.fillRect(0, 0, 16, 16);
    }, { rough: 0.5 });
  }
}

export function potato(p: P) {
  const c = p.params.color;
  const pts = blobPts(p, 8, 8.4, 6.2, 4.6, 10, 0.1, 0.5);
  p.part((g) => {
    g.save(); g.translate(8, 8.4); g.rotate(-0.55); g.translate(-8, -8.4);
    smooth(g, pts); g.restore(); g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    p.volume(g, 8, 8.4, 6.4, c, 0.35, 0.55);
    p.speckle(g, 30, 2, 3, 14, 14, 0.25, darken(c, 0.35), 0.5);
    for (let i = 0; i < 4; i++) {
      const x = 4 + p.rand() * 8, y = 5 + p.rand() * 7;
      g.fillStyle = rgba(darken(c, 0.5), 0.8);
      ellipse(g, x, y, 0.45, 0.3, p.rand() * 3);
      g.fill();
    }
    if (p.params.name === 'poisonous_potato') p.speckle(g, 12, 3, 4, 13, 13, 0.6, 0x5a7a20, 0.7);
  }, { rough: 0.6 });
}

export function bakedPotato(p: P) {
  const c = p.params.color;
  const pts = blobPts(p, 8, 8.6, 6.4, 4.8, 10, 0.08, 0.2);
  p.part((g) => { g.save(); g.translate(8, 8.6); g.rotate(-0.5); g.translate(-8, -8.6); smooth(g, pts); g.restore(); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 8, 8.6, 6.6, c, 0.4, 0.55);
    p.speckle(g, 40, 2, 3, 14, 14, 0.25, darken(c, 0.4), 0.5);
    // split with fluffy interior
    g.fillStyle = rgba(0xf8e8a0);
    g.save(); g.translate(8.4, 7.8); g.rotate(-0.5);
    g.beginPath(); g.ellipse(0, 0, 3.6, 1.0, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,230,0.8)';
    g.beginPath(); g.ellipse(-0.6, -0.2, 2.0, 0.45, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }, { rough: 0.6 });
}

export function beetroot(p: P) {
  const c = p.params.color;
  p.part((g) => {
    g.beginPath();
    g.moveTo(8, 4.6);
    g.bezierCurveTo(12.6, 4.6, 14.0, 8.4, 12.4, 11.0);
    g.bezierCurveTo(11.0, 13.0, 9.0, 13.2, 8.4, 15.4);
    g.bezierCurveTo(7.6, 13.2, 5.0, 13.0, 3.6, 11.0);
    g.bezierCurveTo(2.0, 8.4, 3.4, 4.6, 8, 4.6);
    g.closePath();
    g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    p.volume(g, 8, 8.4, 5.6, c, 0.4, 0.55);
    g.strokeStyle = rgba(darken(c, 0.4), 0.5);
    g.lineWidth = 0.2;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(8, 15, 4 + i * 1.6, -2.4, -0.7); g.stroke(); }
    p.spec(g, 5.8, 7.0, 1.2, 0.7, -0.5, 0.6);
  }, { rough: 0.35 });
  for (const [x, a] of [[6.4, -0.5], [8, 0], [9.6, 0.5]] as [number, number][]) {
    p.part((g) => {
      g.save(); g.translate(x, 5.0); g.rotate(a);
      g.beginPath(); g.moveTo(-0.35, 0); g.lineTo(-0.5, -3.6); g.lineTo(0.5, -3.6); g.lineTo(0.35, 0); g.closePath();
      g.restore();
      g.fillStyle = rgba(0x6a1a3a); g.fill();
    }, (g) => { g.fillStyle = lin(g, 0, 1.5, 0, 5, [[0, 0x4a9a3a], [1, 0x8a1a3a]]); g.fillRect(0, 0, 16, 16); }, { rough: 0.5 });
  }
}

export function stew(p: P) {
  bowl(p, p.params.color, p.params.color2 || undefined);
}

export function melonSlice(p: P) {
  const c = p.params.color, rind = p.params.color2;
  const gold = isGolden(p);
  p.part((g) => {
    g.beginPath();
    g.moveTo(1.6, 12.6);
    g.bezierCurveTo(4.0, 5.0, 10.4, 1.6, 14.6, 2.4);
    g.lineTo(14.4, 4.2);
    g.bezierCurveTo(11.6, 6.4, 7.4, 10.6, 3.4, 14.6);
    g.closePath();
    g.fillStyle = rgba(rind); g.fill();
  }, (g) => {
    g.fillStyle = lin(g, 2, 6, 6, 10, [[0, lighten(rind, gold ? 0.6 : 0.25)], [1, darken(rind, 0.35)]]);
    g.fillRect(0, 0, 16, 16);
    if (gold) p.speckle(g, 12, 2, 2, 14, 12, 0.4, 0xffffff, 0.9);
  }, gold ? { metal: 0.85, rough: 0.2 } : { rough: 0.35 });
  p.part((g) => {
    g.beginPath();
    g.moveTo(2.8, 12.4);
    g.bezierCurveTo(5.0, 6.0, 10.4, 3.0, 14.0, 3.4);
    g.bezierCurveTo(11.6, 6.4, 7.4, 10.4, 3.6, 13.8);
    g.closePath();
    g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    g.fillStyle = lin(g, 4, 6, 10, 12, [[0, lighten(c, 0.3)], [0.6, c], [1, darken(c, 0.25)]]);
    g.fillRect(0, 0, 16, 16);
    g.strokeStyle = 'rgba(255,240,220,0.75)';
    g.lineWidth = 0.35;
    g.beginPath(); g.moveTo(3.2, 12.2); g.bezierCurveTo(5.2, 6.4, 10.4, 3.4, 13.8, 3.6); g.stroke();
    g.fillStyle = rgba(0x1a1410);
    for (const [x, y] of [[6.4, 9.4], [8.6, 7.0], [10.6, 5.4], [7.4, 11.0], [9.6, 8.6]]) { eggSeed(g, x, y); }
  }, WET);
}
function eggSeed(g: Ctx, x: number, y: number) {
  ellipse(g, x, y, 0.35, 0.55, 0.7);
  g.fill();
}

export function berries(p: P) {
  const c = p.params.color;
  const glow = p.params.name === 'glow_berries';
  p.part((g) => {
    g.beginPath(); g.moveTo(8.4, 1.6); g.quadraticCurveTo(7.4, 4.4, 5.4, 6.4); g.moveTo(7.8, 3.4); g.quadraticCurveTo(10, 5, 10.6, 7.4);
    g.strokeStyle = rgba(0x5a3a1a); g.lineWidth = 0.5; g.stroke();
  }, undefined, { rough: 0.7 });
  if (!glow) {
    p.part((g) => {
      g.beginPath(); g.moveTo(8.4, 1.8); g.bezierCurveTo(10.6, 0.6, 13.6, 1.4, 14.2, 2.8); g.bezierCurveTo(12.0, 3.6, 10.0, 3.2, 8.4, 1.8); g.closePath();
      g.fillStyle = rgba(0x3a7a2a); g.fill();
    }, (g) => { g.fillStyle = lin(g, 8, 2, 14, 2, [[0, 0x2a5a1a], [1, 0x6ab04a]]); g.fillRect(0, 0, 16, 16); }, { rough: 0.5 });
  }
  const pos: [number, number, number][] = [[5.0, 8.4, 2.4], [10.6, 9.0, 2.5], [7.6, 12.2, 2.6], [3.8, 12.6, 1.8], [11.8, 13.0, 1.9]];
  for (const [x, y, r] of pos) {
    p.part((g) => { circle(g, x, y, r); g.fillStyle = rgba(c); g.fill(); }, (g) => {
      p.volume(g, x, y, r, c, 0.45, 0.55);
      p.spec(g, x - r * 0.4, y - r * 0.4, r * 0.35, r * 0.25, -0.6, 0.95);
      if (!glow) { g.fillStyle = rgba(darken(c, 0.6), 0.8); circle(g, x + r * 0.35, y + r * 0.45, 0.25); g.fill(); }
    }, { rough: 0.2, emissive: glow ? 0.65 : 0 });
  }
}

export function driedKelp(p: P) {
  const c = p.params.color;
  p.part((g) => {
    g.beginPath();
    g.moveTo(2.4, 13.6);
    g.bezierCurveTo(4.6, 10.0, 3.6, 7.0, 7.2, 5.6);
    g.bezierCurveTo(10.0, 4.6, 11.0, 2.0, 13.8, 2.0);
    g.lineTo(14.2, 4.6);
    g.bezierCurveTo(11.6, 5.0, 11.4, 7.6, 8.6, 8.8);
    g.bezierCurveTo(5.8, 10.0, 7.0, 12.6, 4.6, 15.0);
    g.closePath();
    g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    g.fillStyle = lin(g, 3, 6, 10, 12, [[0, lighten(c, 0.35)], [0.5, c], [1, darken(c, 0.5)]]);
    g.fillRect(0, 0, 16, 16);
    g.strokeStyle = rgba(darken(c, 0.5), 0.7);
    g.lineWidth = 0.25;
    for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(3 + i * 1.6, 13.6 - i * 1.7); g.lineTo(4.6 + i * 1.5, 14.4 - i * 1.6); g.stroke(); }
  }, { rough: 0.6 });
}

/** Steak (beef): raw with marbling, cooked with grill marks. */
export function steak(p: P) {
  const c = p.params.color, fat = p.params.color2;
  const cooked = p.params.name.startsWith('cooked');
  const pts = [2.0, 8.6, 3.2, 4.4, 7.0, 2.4, 11.6, 2.6, 14.2, 5.0, 14.0, 9.2, 11.6, 12.4, 7.6, 14.0, 4.0, 13.2];
  p.part((g) => { smooth(g, pts, true, 0.45); g.fillStyle = rgba(fat); g.fill(); }, (g) => {
    p.volume(g, 8, 8, 7, fat, 0.3, 0.5);
  }, { rough: 0.45 });
  const inner = pts.map((v, i) => (i % 2 === 0 ? 8.2 + (v - 8.2) * 0.82 : 8.0 + (v - 8.0) * 0.8));
  p.part((g) => { smooth(g, inner, true, 0.45); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 8, 8, 6, c, 0.3, 0.55);
    if (!cooked) {
      g.strokeStyle = rgba(lighten(fat, 0.2), 0.75);
      g.lineWidth = 0.35;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        const y = 5 + i * 1.6;
        g.moveTo(3.8 + p.rand(), y);
        g.bezierCurveTo(6, y - 1 + p.rand() * 2, 9, y + 1 - p.rand() * 2, 12 + p.rand(), y + p.rand());
        g.stroke();
      }
      p.spec(g, 6.2, 5.4, 2.2, 0.8, -0.3, 0.45);
    } else {
      g.strokeStyle = rgba(0x2a1408, 0.8);
      g.lineWidth = 0.6;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(3 + i * 2.6, 12); g.lineTo(6 + i * 2.6, 3.6); g.stroke(); }
      p.speckle(g, 30, 3, 3, 13, 13, 0.25, 0x1a0c04, 0.5);
      p.spec(g, 6.2, 5.4, 2.2, 0.8, -0.3, 0.3);
    }
  }, cooked ? { rough: 0.55 } : WET);
}

export function porkchop(p: P) {
  const c = p.params.color, fat = p.params.color2;
  const cooked = p.params.name.startsWith('cooked');
  // a chop: rounded wedge of meat with a thick fat cap along the top edge
  const outer = [2.0, 9.6, 2.8, 5.6, 6.0, 3.0, 10.4, 2.2, 14.0, 3.6, 14.6, 7.0, 12.8, 10.6, 9.4, 13.2, 5.4, 14.2, 2.6, 12.6];
  p.part((g) => { smooth(g, outer, true, 0.45); g.fillStyle = rgba(fat); g.fill(); }, (g) => p.volume(g, 8.2, 7.6, 7, fat, 0.35, 0.45), { rough: 0.4 });
  const inner = [3.2, 10.0, 4.0, 6.8, 6.8, 5.0, 10.4, 4.4, 13.0, 5.4, 13.2, 7.8, 11.6, 10.4, 8.8, 12.4, 5.4, 13.0, 3.6, 11.8];
  p.part((g) => { smooth(g, inner, true, 0.45); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 8.4, 8.6, 6, c, 0.35, 0.5);
    if (cooked) {
      g.strokeStyle = rgba(0x3a1e0a, 0.75);
      g.lineWidth = 0.55;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(4.4 + i * 3.0, 12.6); g.lineTo(7.4 + i * 3.0, 5.0); g.stroke(); }
      p.speckle(g, 25, 3, 4, 13, 13, 0.25, 0x2a1408, 0.45);
    } else {
      g.strokeStyle = rgba(lighten(c, 0.4), 0.55);
      g.lineWidth = 0.25;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(4.6 + i * 2.4, 11.6); g.quadraticCurveTo(6.6 + i * 2.2, 8.4, 6.2 + i * 2.6, 6.0); g.stroke(); }
    }
    // small bone cross-section
    g.fillStyle = rgba(0xf4ecdc);
    ellipse(g, 11.2, 9.2, 1.0, 0.8, 0.3);
    g.fill();
    g.fillStyle = rgba(0xc8a888);
    ellipse(g, 11.2, 9.2, 0.45, 0.35, 0.3);
    g.fill();
    p.spec(g, 6.4, 6.6, 1.8, 0.7, -0.4, cooked ? 0.3 : 0.5);
  }, cooked ? { rough: 0.55 } : WET);
}

export function drumstick(p: P) {
  const c = p.params.color;
  const cooked = p.params.name.startsWith('cooked');
  // bone
  p.part((g) => {
    capsule(g, 3.0, 13.0, 7.0, 9.0, 0.8);
    circle(g, 2.2, 12.6, 1.05, false);
    circle(g, 3.4, 13.8, 1.05, false);
    g.fillStyle = rgba(0xf2ead8); g.fill();
  }, (g) => p.cylinder(g, 3, 13, 7, 9, 1.2, 0xf2ead8, 0.3, 0.4), { rough: 0.5 });
  const pts = [6.0, 10.6, 5.6, 7.0, 7.4, 3.6, 11.0, 2.0, 14.2, 3.6, 14.4, 7.0, 12.2, 9.6, 8.8, 10.8];
  p.part((g) => { smooth(g, pts, true, 0.5); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 10.2, 6.2, 5.4, c, 0.4, 0.55);
    // bumpy skin
    p.speckle(g, 40, 6, 2, 14.5, 10.5, 0.3, darken(c, cooked ? 0.35 : 0.15), 0.5);
    p.speckle(g, 25, 6, 2, 14.5, 10.5, 0.25, lighten(c, 0.4), 0.5);
    p.spec(g, 8.8, 4.6, 1.6, 0.8, -0.6, cooked ? 0.55 : 0.35);
  }, cooked ? { rough: 0.35 } : { rough: 0.45 });
}

export function mutton(p: P) {
  const c = p.params.color, fat = p.params.color2;
  const cooked = p.params.name.startsWith('cooked');
  // leg of lamb: teardrop meat with the shank bone sticking out at the bottom-left
  p.part((g) => { capsule(g, 1.8, 14.2, 5.6, 10.4, 0.75); circle(g, 1.7, 14.3, 1.0, false); g.fillStyle = rgba(0xf0e8d8); g.fill(); }, (g) => p.cylinder(g, 1.8, 14.2, 5.6, 10.4, 1, 0xf0e8d8, 0.3, 0.4), { rough: 0.5 });
  const meat = [4.4, 11.6, 4.4, 8.0, 6.6, 4.4, 10.4, 2.0, 14.0, 2.6, 14.6, 6.4, 12.4, 10.0, 8.4, 12.2, 5.6, 12.6];
  p.part((g) => { smooth(g, meat, true, 0.5); g.fillStyle = rgba(fat); g.fill(); }, (g) => p.volume(g, 10, 6.6, 6, fat, 0.3, 0.45), { rough: 0.45 });
  const inner = meat.map((v, i) => (i % 2 === 0 ? 10.2 + (v - 10.2) * 0.8 : 6.8 + (v - 6.8) * 0.8));
  p.part((g) => { smooth(g, inner, true, 0.5); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 10.2, 6.8, 5, c, 0.35, 0.5);
    if (cooked) p.speckle(g, 25, 5, 2, 14, 11, 0.3, 0x2a1408, 0.5);
    else { g.strokeStyle = rgba(lighten(fat, 0.1), 0.6); g.lineWidth = 0.3; g.beginPath(); g.moveTo(6.4, 10); g.quadraticCurveTo(9.6, 6.4, 13.2, 4.4); g.stroke(); }
    p.spec(g, 9.0, 4.6, 1.6, 0.6, -0.5, cooked ? 0.25 : 0.45);
  }, cooked ? { rough: 0.55 } : WET);
}

export function rabbitMeat(p: P) {
  const c = p.params.color;
  const cooked = p.params.name.startsWith('cooked');
  // small skinned carcass: body with hind and front legs
  const legs: [number, number, number, number, number][] = [[4.0, 9.6, 1.4, 13.6, 0.95], [5.6, 10.4, 4.0, 14.4, 0.85], [11.0, 9.0, 12.8, 13.0, 0.75], [12.2, 8.6, 14.6, 11.6, 0.7]];
  for (const [x0, y0, x1, y1, r] of legs) p.part((g) => { capsule(g, x0, y0, x1, y1, r, r * 0.7); g.fillStyle = rgba(darken(c, 0.08)); g.fill(); }, (g) => p.cylinder(g, x0, y0, x1, y1, r, darken(c, 0.08), 0.35, 0.5), cooked ? { rough: 0.5 } : WET);
  const body = [2.6, 8.6, 4.0, 5.4, 8.0, 4.2, 12.0, 4.6, 14.4, 6.4, 13.8, 9.0, 10.0, 10.6, 5.6, 10.8];
  p.part((g) => { smooth(g, body, true, 0.5); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 8.4, 7.2, 6, c, 0.4, 0.5);
    if (cooked) p.speckle(g, 30, 3, 4, 14, 11, 0.3, 0x3a1e0a, 0.45);
    else {
      g.strokeStyle = rgba(lighten(c, 0.45), 0.55);
      g.lineWidth = 0.2;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(5 + i * 2.2, 5.0); g.quadraticCurveTo(5.6 + i * 2.2, 7.4, 5 + i * 2.2, 9.8); g.stroke(); }
    }
    p.spec(g, 6.6, 5.6, 1.8, 0.7, -0.3, cooked ? 0.3 : 0.5);
  }, cooked ? { rough: 0.5 } : WET);
}

function fishBody(p: P, c: Col, belly: Col, cooked: boolean) {
  // diagonal fish: head bottom-left, tail top-right
  p.part((g) => {
    g.beginPath();
    g.moveTo(2.0, 13.8);
    g.bezierCurveTo(1.6, 10.0, 5.4, 5.4, 10.0, 5.6);
    g.lineTo(12.6, 3.6);
    g.lineTo(14.6, 1.4); g.lineTo(14.4, 4.6); g.lineTo(15.0, 7.0); g.lineTo(12.6, 6.6);
    g.lineTo(11.2, 8.4);
    g.bezierCurveTo(10.6, 12.6, 6.0, 15.0, 2.0, 13.8);
    g.closePath();
    g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    g.fillStyle = lin(g, 5, 6, 8, 13, [[0, lighten(c, 0.3)], [0.55, c], [1, belly]]);
    g.fillRect(0, 0, 16, 16);
    if (!cooked) {
      p.speckle(g, 30, 3, 6, 11, 12, 0.35, darken(c, 0.45), 0.55);
      // scales
      g.strokeStyle = rgba(lighten(c, 0.4), 0.35);
      g.lineWidth = 0.15;
      for (let i = 0; i < 12; i++) { const x = 4 + (i % 4) * 1.6, y = 8 + Math.floor(i / 4) * 1.4; g.beginPath(); g.arc(x, y, 0.7, -1.2, 1.2); g.stroke(); }
      // eye
      g.fillStyle = '#111';
      circle(g, 3.6, 11.0, 0.55); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      circle(g, 3.45, 10.85, 0.2); g.fill();
      p.spec(g, 6.0, 8.0, 2.4, 0.6, -0.6, 0.55);
    } else {
      p.speckle(g, 40, 3, 5, 13, 13, 0.3, darken(c, 0.5), 0.5);
      g.strokeStyle = rgba(darken(c, 0.4), 0.7);
      g.lineWidth = 0.4;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(4 + i * 1.8, 13.6 - i * 1.6); g.lineTo(5.6 + i * 1.8, 8.6 - i * 0.6); g.stroke(); }
    }
    // gill line
    g.strokeStyle = rgba(darken(c, 0.4), 0.6);
    g.lineWidth = 0.25;
    g.beginPath(); g.arc(3.0, 12.6, 2.6, -1.4, 0.2); g.stroke();
  }, cooked ? { rough: 0.5 } : WET);
}
export function fish(p: P) {
  fishBody(p, p.params.color, p.params.color2, false);
}
export function cookedFish(p: P) {
  fishBody(p, p.params.color, p.params.color2, true);
}

export function tropicalFish(p: P) {
  const c = p.params.color;
  p.part((g) => {
    g.beginPath();
    g.moveTo(2.0, 8.4);
    g.bezierCurveTo(3.0, 4.0, 8.6, 3.0, 11.4, 6.6);
    g.lineTo(14.6, 3.6); g.lineTo(14.0, 8.4); g.lineTo(14.6, 13.0); g.lineTo(11.4, 10.2);
    g.bezierCurveTo(8.6, 13.8, 3.0, 12.8, 2.0, 8.4);
    g.closePath();
    g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    p.volume(g, 7, 8.4, 6, c, 0.4, 0.5);
    g.fillStyle = 'rgba(250,250,245,0.95)';
    for (const x of [5.0, 9.0]) { g.beginPath(); g.ellipse(x, 8.4, 0.8, 4.0, 0.08, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(20,20,20,0.6)';
    g.lineWidth = 0.2;
    for (const x of [5.0, 9.0]) { g.beginPath(); g.ellipse(x, 8.4, 0.85, 4.05, 0.08, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = '#111';
    circle(g, 3.4, 7.6, 0.55); g.fill();
    p.spec(g, 6, 6, 2, 0.6, -0.3, 0.6);
  }, WET);
}

export function pufferfish(p: P) {
  const c = p.params.color;
  // spines
  p.part((g) => {
    g.strokeStyle = rgba(0xe8e0c0);
    g.lineWidth = 0.45;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      g.beginPath(); g.moveTo(8 + Math.cos(a) * 4.6, 8.4 + Math.sin(a) * 4.4); g.lineTo(8 + Math.cos(a) * 6.8, 8.4 + Math.sin(a) * 6.6); g.stroke();
    }
  }, undefined, { rough: 0.5 });
  p.part((g) => { ellipse(g, 8, 8.4, 5.4, 5.0); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 8, 8.4, 5.4, c, 0.4, 0.5);
    g.fillStyle = rgba(0xf8f0d0, 0.85);
    ellipse(g, 8.4, 11.0, 3.8, 2.0);
    g.fill();
    p.speckle(g, 14, 4, 4, 12, 9, 0.5, darken(c, 0.4), 0.6);
    g.fillStyle = '#111';
    circle(g, 5.2, 7.4, 0.8); g.fill();
    circle(g, 10.6, 7.4, 0.8); g.fill();
    g.fillStyle = '#fff';
    circle(g, 5.0, 7.2, 0.25); g.fill();
    circle(g, 10.4, 7.2, 0.25); g.fill();
    g.fillStyle = rgba(0x6a3a2a);
    ellipse(g, 7.9, 9.6, 0.9, 0.5); g.fill();
  }, WET);
}

export function rottenFlesh(p: P) {
  const c = p.params.color, d = p.params.color2;
  const pts = [2.0, 9.6, 3.6, 5.0, 7.0, 2.4, 10.4, 3.6, 13.6, 2.8, 14.4, 7.4, 12.6, 11.0, 13.4, 13.6, 9.2, 14.0, 5.4, 13.8, 2.6, 12.8];
  p.part((g) => { smooth(g, pts, true, 0.4); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    p.volume(g, 8.2, 8.2, 7, c, 0.3, 0.55);
    p.speckle(g, 12, 3, 3, 13, 13, 1.1, d, 0.75);
    p.speckle(g, 30, 3, 3, 13, 13, 0.35, 0x3a2a1a, 0.6);
    p.speckle(g, 10, 3, 3, 13, 13, 0.5, 0xe8d0b0, 0.6);
    g.strokeStyle = rgba(0x8a2a2a, 0.6);
    g.lineWidth = 0.35;
    g.beginPath(); g.moveTo(4, 8); g.quadraticCurveTo(8, 6, 12, 9); g.stroke();
  }, { rough: 0.4 });
}

export function chorusFruit(p: P) {
  const c = p.params.color;
  const lumps: [number, number, number][] = [[8, 9.4, 4.4], [5.0, 6.4, 2.6], [11.0, 6.0, 2.8], [8.2, 4.0, 2.4], [4.4, 11.4, 2.4], [11.8, 11.6, 2.4]];
  for (const [x, y, r] of lumps) {
    p.part((g) => { smooth(g, blobPts(p, x, y, r, r * 0.92, 7, 0.1)); g.fillStyle = rgba(c); g.fill(); }, (g) => {
      p.volume(g, x, y, r, c, 0.4, 0.55);
      p.speckle(g, 6, x - r, y - r, x + r, y + r, 0.4, 0xe0c8f0, 0.5);
    }, { rough: 0.45 });
  }
}

export function honeyBottle(p: P) {
  bottle(p, p.params.color, 'potion', { opaque: true, fill: 5.9 });
}

export const _unused = [mix, tint, rad, poly, blob];
