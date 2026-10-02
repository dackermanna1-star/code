/**
 * Painters for tools, weapons, armor, transport and utility items.
 */
import { type Painter, type Col, type Ctx, type Mat, poly, smooth, ellipse, circle, capsule, rrect, lin, rad, rgba, lighten, darken, mix, tint, METAL, POLISHED, GEM, CLOTH, luma } from './kit';
import { stick, bottle, eggPath, WOOD_STICK } from './shapes';

type P = Painter;

export const TIER_COLORS: Record<string, Col> = {
  wooden: 0xa8844e, stone: 0x8c8c8c, iron: 0xdadada, golden: 0xf4cf3a, diamond: 0x4ce6d4, netherite: 0x4a4246,
};
export function tierOf(name: string): string {
  return name.split('_')[0];
}
export function tierMat(tier: string): Mat {
  if (tier === 'wooden') return { rough: 0.7 };
  if (tier === 'stone') return { rough: 0.8 };
  if (tier === 'diamond') return GEM;
  if (tier === 'golden') return POLISHED;
  return METAL;
}

/** Map a point in a frame along the main diagonal (s along, t across) to icon space. */
function diag(ox: number, oy: number, s: number, t: number): [number, number] {
  const k = Math.SQRT1_2;
  return [ox + (s + t) * k, oy + (-s + t) * k];
}
function diagPts(ox: number, oy: number, st: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < st.length; i += 2) out.push(...diag(ox, oy, st[i], st[i + 1]));
  return out;
}

/** Tool head material shading (metal sheen / stone speckle / wood grain / gem facets). */
function headShade(p: P, g: Ctx, tier: string, c: Col, x0: number, y0: number, x1: number, y1: number) {
  g.fillStyle = lin(g, x0, y0, x1, y1, [[0, lighten(c, 0.45)], [0.35, lighten(c, 0.12)], [0.65, darken(c, 0.12)], [1, darken(tint(c, -0.5), 0.5)]]);
  g.fillRect(0, 0, 16, 16);
  if (tier === 'stone') { p.speckle(g, 50, 0, 0, 16, 16, 0.35, 0x4a4a4a, 0.55); p.speckle(g, 30, 0, 0, 16, 16, 0.3, 0xc8c8c8, 0.5); }
  if (tier === 'wooden') {
    g.strokeStyle = rgba(darken(c, 0.4), 0.4);
    g.lineWidth = 0.18;
    for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(i * 1.8 - 2, 16); g.lineTo(i * 1.8 + 8, 0); g.stroke(); }
  }
  if (tier === 'netherite') p.speckle(g, 25, 0, 0, 16, 16, 0.3, 0x2a2228, 0.6);
}

// ------------------------------------------------------------------------------ tools
export function sword(p: P) {
  const tier = tierOf(p.params.name);
  const c = TIER_COLORS[tier] ?? 0xcccccc;
  const O: [number, number] = [5.4, 10.6];
  // grip + pommel
  stick(p, 2.0, 14.0, 5.0, 11.0, 0.85, 0x6a4a2a);
  p.part((g) => { circle(g, 1.8, 14.2, 1.15); g.fillStyle = rgba(darken(c, 0.15)); g.fill(); }, (g) => p.volume(g, 1.8, 14.2, 1.15, darken(c, 0.15), 0.5, 0.5), tierMat(tier));
  // blade
  const blade = diagPts(O[0], O[1], [0.4, -1.55, 10.2, -1.35, 12.7, 0, 10.2, 1.35, 0.4, 1.55]);
  p.part((g) => { poly(g, blade); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    headShade(p, g, tier, c, ...diag(O[0], O[1], 5, -1.2), ...diag(O[0], O[1], 5, 1.2));
    // central ridge (fuller): light/dark halves
    g.fillStyle = rgba(0xffffff, tier === 'stone' || tier === 'wooden' ? 0.12 : 0.28);
    poly(g, diagPts(O[0], O[1], [0.4, -1.55, 10.2, -1.35, 12.7, 0, 0.4, 0]));
    g.fill();
    g.fillStyle = rgba(0x000000, 0.18);
    poly(g, diagPts(O[0], O[1], [0.4, 0, 12.7, 0, 10.2, 1.35, 0.4, 1.55]));
    g.fill();
    g.strokeStyle = rgba(lighten(c, 0.6), 0.75);
    g.lineWidth = 0.18;
    g.beginPath(); g.moveTo(...diag(O[0], O[1], 1, -0.4)); g.lineTo(...diag(O[0], O[1], 10.4, -0.25)); g.stroke();
    if (tier === 'diamond' || tier === 'iron' || tier === 'golden' || tier === 'netherite') p.spec(g, ...diag(O[0], O[1], 6.5, -0.5), 2.4, 0.35, -Math.PI / 4, 0.6);
  }, tierMat(tier));
  // cross guard
  const guard = diagPts(O[0], O[1], [-0.45, -3.3, 0.85, -3.3, 0.85, 3.3, -0.45, 3.3]);
  const gc = tier === 'wooden' ? darken(c, 0.2) : tier === 'golden' || tier === 'iron' ? darken(c, 0.25) : mix(darken(c, 0.35), 0x3a3a3a, 0.3);
  p.part((g) => { smooth(g, guard, true, 0.15); g.fillStyle = rgba(gc); g.fill(); }, (g) => headShade(p, g, tier, gc, ...diag(O[0], O[1], -0.4, -3), ...diag(O[0], O[1], 0.8, 3)), tierMat(tier));
}

function handle(p: P, x0 = 1.8, y0 = 14.2, x1 = 11.2, y1 = 4.8) {
  stick(p, x0, y0, x1, y1, 0.85, WOOD_STICK);
}

export function pickaxe(p: P) {
  const tier = tierOf(p.params.name);
  const c = TIER_COLORS[tier] ?? 0xcccccc;
  handle(p, 2.0, 14.0, 11.0, 5.0);
  // crescent head: outer and inner arcs around a centre at the lower-left
  const cx = 5.0, cy = 11.0;
  const R = 9.7, r = 7.5;
  const a0 = -Math.PI * 0.56, a1 = Math.PI * 0.06;
  p.part((g) => {
    g.beginPath();
    g.arc(cx, cy, R, a0, a1);
    const e1 = [cx + Math.cos(a1 + 0.08) * (R + r) / 2, cy + Math.sin(a1 + 0.08) * (R + r) / 2];
    g.lineTo(e1[0], e1[1]);
    g.arc(cx, cy, r, a1, a0, true);
    const e0 = [cx + Math.cos(a0 - 0.08) * (R + r) / 2, cy + Math.sin(a0 - 0.08) * (R + r) / 2];
    g.lineTo(e0[0], e0[1]);
    g.closePath();
    g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    g.fillStyle = rad(g, cx, cy, r - 0.3, cx, cy, R + 0.3, [[0, darken(c, 0.35)], [0.35, lighten(c, 0.2)], [0.6, lighten(c, 0.4)], [1, darken(c, 0.25)]]);
    g.fillRect(0, 0, 16, 16);
    headShade(p, g, tier, c, 4, 2, 14, 12);
    g.globalAlpha = 1;
    g.strokeStyle = rgba(lighten(c, 0.55), 0.6);
    g.lineWidth = 0.2;
    g.beginPath(); g.arc(cx, cy, R - 0.6, a0 + 0.12, a1 - 0.12); g.stroke();
    if (tier !== 'stone' && tier !== 'wooden') p.spec(g, 9.4, 3.2, 1.6, 0.4, 0.4, 0.55);
  }, tierMat(tier));
  // binding where head meets the handle
  p.part((g) => { g.save(); g.translate(11.0, 5.0); g.rotate(-Math.PI / 4); rrect(g, -1.2, -1.05, 2.4, 2.1, 0.4); g.restore(); g.fillStyle = rgba(darken(c, 0.3)); g.fill(); }, (g) => headShade(p, g, tier, darken(c, 0.3), 10, 4, 12, 6), tierMat(tier));
}

export function axe(p: P) {
  const tier = tierOf(p.params.name);
  const c = TIER_COLORS[tier] ?? 0xcccccc;
  handle(p, 2.0, 14.0, 11.6, 4.4);
  // blade: wedge on the upper-left side of the handle top, edge curved
  p.part((g) => {
    g.beginPath();
    g.moveTo(8.6, 3.6);
    g.lineTo(10.4, 1.6);
    g.bezierCurveTo(11.6, 2.6, 12.6, 3.6, 13.2, 4.4);
    g.lineTo(11.6, 6.6);
    g.bezierCurveTo(10.4, 8.4, 9.6, 9.4, 8.8, 10.6);
    g.bezierCurveTo(6.4, 10.8, 4.6, 8.6, 4.6, 6.4);
    g.bezierCurveTo(4.6, 5.6, 4.8, 4.8, 5.2, 4.0);
    g.bezierCurveTo(6.4, 4.2, 7.6, 4.2, 8.6, 3.6);
    g.closePath();
    g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    headShade(p, g, tier, c, 5, 4, 12, 10);
    // edge bevel along the cutting edge
    g.strokeStyle = rgba(lighten(c, 0.6), 0.85);
    g.lineWidth = 0.45;
    g.beginPath(); g.moveTo(5.3, 4.4); g.bezierCurveTo(4.7, 6.0, 5.6, 9.4, 8.6, 10.2); g.stroke();
    if (tier !== 'stone' && tier !== 'wooden') p.spec(g, 7.0, 6.0, 1.6, 0.9, -0.6, 0.45);
  }, tierMat(tier));
}

export function shovel(p: P) {
  const tier = tierOf(p.params.name);
  const c = TIER_COLORS[tier] ?? 0xcccccc;
  handle(p, 1.8, 14.2, 9.6, 6.4);
  p.part((g) => {
    g.save();
    g.translate(11.0, 5.0);
    g.rotate(Math.PI / 4);
    g.beginPath();
    g.moveTo(-2.6, 1.6);
    g.lineTo(-2.6, -2.4);
    g.quadraticCurveTo(-2.4, -5.0, 0, -5.6);
    g.quadraticCurveTo(2.4, -5.0, 2.6, -2.4);
    g.lineTo(2.6, 1.6);
    g.quadraticCurveTo(0, 2.6, -2.6, 1.6);
    g.closePath();
    g.restore();
    g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    headShade(p, g, tier, c, 9, 3, 14, 8);
    g.save(); g.translate(11.0, 5.0); g.rotate(Math.PI / 4);
    g.strokeStyle = rgba(darken(c, 0.35), 0.5);
    g.lineWidth = 0.35;
    g.beginPath(); g.moveTo(0, 1.4); g.lineTo(0, -4.4); g.stroke();
    g.restore();
    if (tier !== 'stone' && tier !== 'wooden') p.spec(g, 10.4, 3.4, 1.3, 0.6, -0.8, 0.5);
  }, tierMat(tier));
}

export function hoe(p: P) {
  const tier = tierOf(p.params.name);
  const c = TIER_COLORS[tier] ?? 0xcccccc;
  handle(p, 2.0, 14.0, 11.6, 4.4);
  p.part((g) => {
    g.beginPath();
    g.moveTo(4.6, 2.2);
    g.lineTo(11.8, 2.0);
    g.quadraticCurveTo(13.4, 2.2, 13.4, 3.6);
    g.lineTo(12.6, 5.2);
    g.lineTo(10.4, 5.6);
    g.lineTo(10.4, 4.2);
    g.lineTo(5.6, 4.4);
    g.quadraticCurveTo(4.0, 4.2, 4.6, 2.2);
    g.closePath();
    g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    headShade(p, g, tier, c, 5, 1.5, 7, 5.5);
    g.strokeStyle = rgba(lighten(c, 0.6), 0.7);
    g.lineWidth = 0.25;
    g.beginPath(); g.moveTo(5.0, 2.5); g.lineTo(11.6, 2.4); g.stroke();
  }, tierMat(tier));
}

export function shears(p: P) {
  const steel = 0xd0d0d4;
  // blades
  for (const side of [-1, 1]) {
    p.part((g) => {
      g.save(); g.translate(7.4, 8.6); g.rotate(-Math.PI / 4 + side * 0.16);
      g.beginPath(); g.moveTo(0, -0.9 * side); g.lineTo(7.2, -0.3 * side); g.lineTo(7.4, 0.2 * side); g.lineTo(0, 0.9 * side); g.closePath();
      g.restore();
      g.fillStyle = rgba(steel); g.fill();
    }, (g) => headShade(p, g, 'iron', steel, 7, 4, 14, 10), POLISHED);
  }
  // handles (dark loops)
  for (const [x, y] of [[3.4, 9.4], [6.4, 12.6]] as [number, number][]) {
    p.part((g) => { ellipse(g, x, y, 2.3, 1.7, -Math.PI / 4); g.lineWidth = 1.0; g.strokeStyle = rgba(0x4a4a50); g.stroke(); }, (g) => headShade(p, g, 'iron', 0x5a5a62, x - 2, y - 2, x + 2, y + 2), METAL);
  }
  p.part((g) => { circle(g, 7.4, 8.6, 0.8); g.fillStyle = rgba(0x8a8a90); g.fill(); }, (g) => p.volume(g, 7.4, 8.6, 0.8, 0x8a8a90, 0.6, 0.5), METAL);
}

export function bow(p: P) {
  const pull = Math.max(0, Math.min(1, p.params.data?.pull ?? 0));
  const wood = 0x8a5a2a;
  const s0: [number, number] = [2.6, 2.2], s1: [number, number] = [13.8, 13.4];
  const mid: [number, number] = [(s0[0] + s1[0]) / 2 - pull * 2.4, (s0[1] + s1[1]) / 2 + pull * 2.4];
  // limb
  p.part((g) => {
    g.beginPath();
    g.moveTo(s0[0], s0[1]);
    g.bezierCurveTo(7.0 + pull, -0.6 + pull, 16.6 - pull, 9.0 - pull, s1[0], s1[1]);
    g.strokeStyle = rgba(wood);
    g.lineWidth = 1.5;
    g.stroke();
  }, (g) => {
    g.fillStyle = lin(g, 6, 2, 12, 8, [[0, lighten(wood, 0.35)], [1, darken(wood, 0.4)]]);
    g.fillRect(0, 0, 16, 16);
  }, { rough: 0.55 });
  // grip wrap
  p.part((g) => { g.save(); g.translate(11.2, 4.8); g.rotate(Math.PI / 4); rrect(g, -1.1, -1.6, 2.2, 3.2, 0.5); g.restore(); g.fillStyle = rgba(0x4a3020); g.fill(); }, (g) => {
    g.strokeStyle = 'rgba(200,170,120,0.5)';
    g.lineWidth = 0.18;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(9.8 + i * 0.7, 4.0 + i * 0.7 - 1.4); g.lineTo(11.6 + i * 0.7, 5.8 + i * 0.7 - 1.4); g.stroke(); }
  }, CLOTH);
  // string
  p.part((g) => { g.beginPath(); g.moveTo(s0[0], s0[1]); g.lineTo(mid[0], mid[1]); g.lineTo(s1[0], s1[1]); g.strokeStyle = 'rgba(235,235,235,1)'; g.lineWidth = 0.35; g.stroke(); }, undefined, CLOTH);
  if (pull > 0) arrowShape(p, mid[0] - 0.4, mid[1] + 0.4, mid[0] + 9.0, mid[1] - 9.0, 0x9a9a9a, 0.8);
}

function arrowShape(p: P, x0: number, y0: number, x1: number, y1: number, head: Col, scale = 1) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  p.part((g) => { capsule(g, x0, y0, x1 - Math.cos(ang) * 1.5, y1 - Math.sin(ang) * 1.5, 0.42 * scale); g.fillStyle = rgba(0x9a7444); g.fill(); }, (g) => p.cylinder(g, x0, y0, x1, y1, 0.42, 0x9a7444, 0.4, 0.5), { rough: 0.6 });
  // fletching
  p.part((g) => {
    g.save(); g.translate(x0, y0); g.rotate(ang);
    g.beginPath(); g.moveTo(0.2, 0); g.lineTo(-0.6, -1.5 * scale); g.lineTo(2.6 * scale, -1.0 * scale); g.lineTo(3.2 * scale, 0); g.lineTo(2.6 * scale, 1.0 * scale); g.lineTo(-0.6, 1.5 * scale); g.closePath();
    g.restore();
    g.fillStyle = rgba(0xf0f0f0); g.fill();
  }, (g) => {
    g.fillStyle = lin(g, x0 - 2, y0 - 2, x0 + 2, y0 + 2, [[0, 0xffffff], [1, 0xa8a8b0]]);
    g.fillRect(0, 0, 16, 16);
  }, CLOTH);
  // head
  p.part((g) => {
    g.save(); g.translate(x1, y1); g.rotate(ang);
    g.beginPath(); g.moveTo(0.6, 0); g.lineTo(-2.2 * scale, -1.4 * scale); g.lineTo(-1.6 * scale, 0); g.lineTo(-2.2 * scale, 1.4 * scale); g.closePath();
    g.restore();
    g.fillStyle = rgba(head); g.fill();
  }, (g) => {
    g.fillStyle = lin(g, x1 - 2, y1 - 2, x1 + 1, y1 + 1, [[0, lighten(head, 0.45)], [1, darken(head, 0.45)]]);
    g.fillRect(0, 0, 16, 16);
  }, { metal: 0, rough: 0.35 });
  void len;
}

export function arrow(p: P) {
  const spectral = p.params.name === 'spectral_arrow';
  arrowShape(p, 2.4, 13.6, 13.8, 2.2, spectral ? 0xf2d24a : 0x5a5a60);
  if (spectral) p.part((g) => { capsule(g, 5, 11, 11, 5, 0.25); g.fillStyle = 'rgba(255,230,120,0.9)'; g.fill(); }, undefined, { emissive: 0.8 });
}
export function tippedArrow(p: P) {
  arrowShape(p, 2.4, 13.6, 13.8, 2.2, p.params.color || 0x385dc6);
}

export function trident(p: P) {
  const c = 0x5fae9c, d = 0x2f6a60;
  p.part((g) => { capsule(g, 1.6, 14.4, 10.4, 5.6, 0.7); g.fillStyle = rgba(c); g.fill(); }, (g) => p.cylinder(g, 1.6, 14.4, 10.4, 5.6, 0.7, c, 0.5, 0.5), METAL);
  // prongs
  const prong = (s: number, t: number, len: number) => {
    const base = diag(9.6, 6.4, s, t), tip = diag(9.6, 6.4, s + len, t);
    p.part((g) => {
      g.save(); g.translate(base[0], base[1]); g.rotate(-Math.PI / 4);
      g.beginPath(); g.moveTo(0, -0.5); g.lineTo(len - 1.2, -0.5); g.lineTo(len, 0); g.lineTo(len - 1.2, 0.5); g.lineTo(0, 0.5); g.closePath();
      g.restore();
      g.fillStyle = rgba(c); g.fill();
    }, (g) => headShade(p, g, 'iron', c, base[0] - 1, base[1] - 1, tip[0] + 1, tip[1] + 1), METAL);
  };
  p.part((g) => { const a = diagPts(9.6, 6.4, [-0.6, -2.4, 0.6, -2.4, 0.6, 2.4, -0.6, 2.4]); poly(g, a); g.fillStyle = rgba(d); g.fill(); }, (g) => headShade(p, g, 'iron', d, 8, 5, 11, 8), METAL);
  prong(0, -2.0, 5.6);
  prong(0, 2.0, 5.6);
  prong(0, 0, 7.2);
}

export function shield(p: P) {
  const wood = 0x9a7040, rim = 0x6a6a72;
  const outline = (g: Ctx) => rrect(g, 3.0, 1.2, 10.0, 13.6, 1.4);
  p.part((g) => { outline(g); g.fillStyle = rgba(rim); g.fill(); }, (g) => headShade(p, g, 'iron', rim, 3, 1, 13, 15), METAL);
  p.part((g) => { rrect(g, 4.0, 2.2, 8.0, 11.6, 0.9); g.fillStyle = rgba(wood); g.fill(); }, (g) => {
    g.fillStyle = lin(g, 4, 2, 12, 14, [[0, lighten(wood, 0.25)], [0.6, wood], [1, darken(wood, 0.35)]]);
    g.fillRect(0, 0, 16, 16);
    g.strokeStyle = rgba(darken(wood, 0.45), 0.8);
    g.lineWidth = 0.25;
    for (const x of [6.0, 8.0, 10.0]) { g.beginPath(); g.moveTo(x, 2.2); g.lineTo(x, 13.8); g.stroke(); }
    g.strokeStyle = rgba(darken(wood, 0.3), 0.35);
    g.lineWidth = 0.12;
    for (let i = 0; i < 16; i++) { const x = 4.2 + p.rand() * 7.6, y = 2.5 + p.rand() * 11; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.1, y + 1.5); g.stroke(); }
  }, { rough: 0.65 });
  p.part((g) => { circle(g, 8, 8, 1.5); g.fillStyle = rgba(rim); g.fill(); }, (g) => p.volume(g, 8, 8, 1.5, rim, 0.6, 0.5), METAL);
}

export function flintAndSteel(p: P) {
  // steel striker (C loop)
  p.part((g) => {
    g.beginPath();
    g.arc(6.2, 6.2, 3.8, 0.9, Math.PI * 2 - 0.2);
    g.strokeStyle = rgba(0xb8b8be);
    g.lineWidth = 1.5;
    g.stroke();
  }, (g) => headShade(p, g, 'iron', 0xb8b8be, 2, 2, 10, 10), METAL);
  // flint
  const pts = [8.0, 11.0, 9.6, 7.6, 12.8, 7.2, 14.6, 10.2, 13.0, 14.0, 9.4, 14.4];
  p.part((g) => { poly(g, pts); g.fillStyle = rgba(0x3a3a40); g.fill(); }, (g) => {
    g.fillStyle = rgba(0x6a6a72);
    poly(g, [9.6, 7.6, 12.8, 7.2, 12.0, 10.4, 9.0, 10.6]);
    g.fill();
    g.fillStyle = rgba(0x222226);
    poly(g, [12.0, 10.4, 14.6, 10.2, 13.0, 14.0, 10.6, 13.0]);
    g.fill();
    p.spec(g, 10.6, 8.6, 1.2, 0.5, -0.4, 0.6);
  }, { rough: 0.25 });
}

export function fishingRod(p: P, bait?: 'carrot' | 'fungus') {
  // line
  p.part((g) => {
    g.beginPath(); g.moveTo(13.8, 2.0); g.quadraticCurveTo(15.0, 6.0, 13.6, bait ? 10.0 : 11.6);
    g.strokeStyle = 'rgba(230,230,230,0.95)'; g.lineWidth = 0.3; g.stroke();
  }, undefined, CLOTH);
  // rod
  p.part((g) => { capsule(g, 1.6, 14.6, 13.8, 2.0, 0.75, 0.35); g.fillStyle = rgba(0x6a4422); g.fill(); }, (g) => p.cylinder(g, 1.6, 14.6, 13.8, 2.0, 0.75, 0x6a4422, 0.45, 0.5), { rough: 0.5 });
  // reel
  p.part((g) => { circle(g, 5.0, 12.2, 1.3); g.fillStyle = rgba(0x8a8a90); g.fill(); }, (g) => p.volume(g, 5, 12.2, 1.3, 0x8a8a90, 0.5, 0.5), METAL);
  if (!bait) {
    p.part((g) => { g.beginPath(); g.arc(12.8, 11.6, 0.9, -0.2, Math.PI * 0.9); g.strokeStyle = rgba(0xa0a0a8); g.lineWidth = 0.4; g.stroke(); }, undefined, METAL);
  } else if (bait === 'carrot') {
    p.part((g) => { g.save(); g.translate(13.4, 12.8); g.rotate(0.3); g.beginPath(); g.moveTo(0, -2.4); g.quadraticCurveTo(1.4, 0, 0, 3.0); g.quadraticCurveTo(-1.4, 0, 0, -2.4); g.restore(); g.fillStyle = rgba(0xf08a1a); g.fill(); }, (g) => p.volume(g, 13.4, 12.8, 2.4, 0xf08a1a, 0.4, 0.5), { rough: 0.45 });
    p.part((g) => { g.beginPath(); g.moveTo(13.2, 10.6); g.lineTo(12.2, 9.2); g.moveTo(13.4, 10.6); g.lineTo(14.2, 9.2); g.strokeStyle = rgba(0x4a9a2a); g.lineWidth = 0.55; g.stroke(); }, undefined, { rough: 0.5 });
  } else {
    p.part((g) => { ellipse(g, 13.4, 11.6, 2.2, 1.3); g.fillStyle = rgba(0x1aa38a); g.fill(); }, (g) => p.volume(g, 13.4, 11.6, 2.2, 0x1aa38a, 0.4, 0.5), { rough: 0.45 });
    p.part((g) => { capsule(g, 13.4, 12.4, 13.6, 14.4, 0.4); g.fillStyle = rgba(0xd8c8a8); g.fill(); }, undefined, { rough: 0.5 });
  }
}
export function onAStick(p: P) {
  fishingRod(p, p.params.name.startsWith('carrot') ? 'carrot' : 'fungus');
}

export function compass(p: P, recovery = false) {
  const angle = p.params.data?.angle ?? -Math.PI / 4;
  const rimC = recovery ? 0x2a3a48 : 0x6a6a70;
  p.part((g) => { circle(g, 8, 8, 6.6); g.fillStyle = rgba(rimC); g.fill(); }, (g) => headShade(p, g, 'iron', rimC, 2, 2, 14, 14), METAL);
  p.part((g) => { circle(g, 8, 8, 5.2); g.fillStyle = rgba(recovery ? 0x0f2a30 : 0xd8d0c0); g.fill(); }, (g) => {
    g.fillStyle = rad(g, 7, 7, 0.5, 8, 8, 5.4, [[0, recovery ? 0x1a4a50 : 0xf4ece0], [1, recovery ? 0x061418 : 0xa8a090]]);
    g.fillRect(0, 0, 16, 16);
    g.strokeStyle = rgba(recovery ? 0x3ac8d0 : 0x5a5048, 0.7);
    g.lineWidth = 0.22;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r0 = i % 2 ? 4.4 : 3.8;
      g.beginPath(); g.moveTo(8 + Math.cos(a) * r0, 8 + Math.sin(a) * r0); g.lineTo(8 + Math.cos(a) * 4.9, 8 + Math.sin(a) * 4.9); g.stroke();
    }
  }, { rough: 0.4 });
  // needle
  p.part((g) => {
    g.save(); g.translate(8, 8); g.rotate(angle);
    g.beginPath(); g.moveTo(0, -4.4); g.lineTo(0.9, 0); g.lineTo(-0.9, 0); g.closePath();
    g.fillStyle = rgba(recovery ? 0x4af0ff : 0xd8281e); g.fill();
    g.beginPath(); g.moveTo(0, 4.4); g.lineTo(0.9, 0); g.lineTo(-0.9, 0); g.closePath();
    g.fillStyle = rgba(recovery ? 0x8aa0a8 : 0x8a8a90); g.fill();
    g.restore();
  }, undefined, { metal: 0.6, rough: 0.3, emissive: recovery ? 0.6 : 0 });
  p.part((g) => { circle(g, 8, 8, 0.6); g.fillStyle = rgba(0x3a3a3a); g.fill(); }, undefined, METAL);
  // glass reflection
  p.part((g) => { circle(g, 8, 8, 5.2); g.fillStyle = 'rgba(0,0,0,0)'; g.fill(); }, (g) => p.spec(g, 6.0, 5.6, 2.4, 1.2, -0.6, 0.45), { rough: 0.05 });
}
export const recoveryCompass = (p: P) => compass(p, true);

export function clock(p: P) {
  const t = p.params.data?.time ?? 0.25; // 0 sunrise
  const gold = 0xe8c040;
  p.part((g) => { circle(g, 8, 8, 6.6); g.fillStyle = rgba(gold); g.fill(); }, (g) => headShade(p, g, 'golden', gold, 2, 2, 14, 14), POLISHED);
  p.part((g) => { circle(g, 8, 8, 5.2); g.fillStyle = '#88c'; g.fill(); }, (g) => {
    g.save();
    g.translate(8, 8);
    g.rotate(-t * Math.PI * 2 + Math.PI / 2);
    // day half
    g.fillStyle = lin(g, 0, -5, 0, 0, [[0, 0x8ec8ff], [1, 0x4a90e0]]);
    g.beginPath(); g.arc(0, 0, 5.4, Math.PI, 0); g.closePath(); g.fill();
    g.fillStyle = lin(g, 0, 0, 0, 5, [[0, 0x1a2050], [1, 0x080a20]]);
    g.beginPath(); g.arc(0, 0, 5.4, 0, Math.PI); g.closePath(); g.fill();
    // sun & moon
    g.fillStyle = rgba(0xfff0a0);
    circle(g, 0, -3.2, 1.3); g.fill();
    g.fillStyle = rgba(0xe8e8f0);
    circle(g, 0, 3.2, 1.1); g.fill();
    g.fillStyle = rgba(0x101430);
    circle(g, 0.5, 3.0, 0.9); g.fill();
    g.restore();
    // ground horizon (bottom half shaded)
    g.fillStyle = 'rgba(20,40,10,0.65)';
    g.fillRect(0, 8.6, 16, 8);
  }, { rough: 0.35 });
  p.part((g) => { poly(g, [8, 2.4, 8.8, 4.0, 7.2, 4.0]); g.fillStyle = rgba(0x3a2a10); g.fill(); }, undefined, METAL);
  p.part((g) => { circle(g, 8, 8, 5.2); g.fillStyle = 'rgba(0,0,0,0)'; g.fill(); }, (g) => p.spec(g, 6.0, 5.6, 2.4, 1.2, -0.6, 0.4), { rough: 0.05 });
}

export function map(p: P) {
  const paper = 0xe8d8b0;
  p.part((g) => { poly(g, [2.0, 2.6, 13.6, 1.8, 14.2, 13.4, 2.6, 14.4]); g.fillStyle = rgba(paper); g.fill(); }, (g) => {
    g.fillStyle = lin(g, 2, 2, 14, 14, [[0, lighten(paper, 0.3)], [1, darken(paper, 0.2)]]);
    g.fillRect(0, 0, 16, 16);
    g.strokeStyle = rgba(0x8a6a40, 0.7);
    g.lineWidth = 0.35;
    poly(g, [3.2, 3.6, 12.6, 3.0, 13.0, 12.4, 3.6, 13.2]);
    g.stroke();
    p.speckle(g, 30, 3, 3, 13, 13, 0.25, 0xa08a60, 0.35);
    g.strokeStyle = rgba(0xa08860, 0.35);
    g.lineWidth = 0.15;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(3.2 + i * 2.4, 3.4); g.lineTo(3.6 + i * 2.4, 13.0); g.stroke(); g.beginPath(); g.moveTo(3.3, 3.6 + i * 2.4); g.lineTo(12.8, 3.1 + i * 2.4); g.stroke(); }
  }, CLOTH);
}

export function spyglass(p: P) {
  const copper = 0xc87a4a;
  p.part((g) => { capsule(g, 2.6, 13.4, 12.2, 3.8, 1.25, 1.55); g.fillStyle = rgba(copper); g.fill(); }, (g) => {
    p.cylinder(g, 2.6, 13.4, 12.2, 3.8, 1.5, copper, 0.55, 0.5);
    g.strokeStyle = rgba(darken(copper, 0.45));
    g.lineWidth = 0.45;
    for (const t of [0.3, 0.55]) { const x = 2.6 + 9.6 * t, y = 13.4 - 9.6 * t; g.beginPath(); g.moveTo(x - 1.2, y - 1.2); g.lineTo(x + 1.2, y + 1.2); g.stroke(); }
  }, { metal: 1, rough: 0.3 });
  p.part((g) => { capsule(g, 1.4, 14.6, 3.4, 12.6, 1.0); g.fillStyle = rgba(0x2a2a2e); g.fill(); }, undefined, { rough: 0.6 });
  p.part((g) => { ellipse(g, 12.6, 3.4, 1.6, 0.9, -Math.PI / 4); g.fillStyle = rgba(0x8ac8e8); g.fill(); }, (g) => p.spec(g, 12.2, 3.0, 0.8, 0.4, -Math.PI / 4, 0.9), { rough: 0.05 });
}

export function brush(p: P) {
  stick(p, 1.6, 14.4, 8.0, 8.0, 0.8);
  p.part((g) => { capsule(g, 7.4, 8.6, 9.6, 6.4, 1.1); g.fillStyle = rgba(0xc87a4a); g.fill(); }, (g) => p.cylinder(g, 7.4, 8.6, 9.6, 6.4, 1.1, 0xc87a4a, 0.5, 0.5), METAL);
  p.part((g) => {
    g.save(); g.translate(11.6, 4.4); g.rotate(-Math.PI / 4);
    rrect(g, -1.8, -2.0, 4.6, 4.0, 0.8);
    g.restore();
    g.fillStyle = rgba(0xe8dcc0); g.fill();
  }, (g) => {
    g.strokeStyle = rgba(0x9a8a6a, 0.6);
    g.lineWidth = 0.15;
    for (let i = 0; i < 12; i++) { const t = i / 12; g.beginPath(); g.moveTo(9.4 + t * 2.4, 7.0 - t * 0.6 - 1); g.lineTo(12.2 + t * 2.4, 4.2 - t * 0.6 - 1); g.stroke(); }
  }, CLOTH);
}

export function lead(p: P) {
  const rope = 0xb89a6a;
  p.part((g) => { ellipse(g, 8.4, 7.4, 5.2, 4.4, -0.3); g.strokeStyle = rgba(rope); g.lineWidth = 1.5; g.stroke(); }, (g) => {
    g.strokeStyle = rgba(darken(rope, 0.4), 0.7);
    g.lineWidth = 0.2;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = 8.4 + Math.cos(a) * 5.2, y = 7.4 + Math.sin(a) * 4.4;
      g.beginPath(); g.moveTo(x - 0.5, y - 0.6); g.lineTo(x + 0.5, y + 0.6); g.stroke();
    }
  }, CLOTH);
  p.part((g) => { g.beginPath(); g.moveTo(4.2, 10.4); g.quadraticCurveTo(2.6, 13.0, 4.8, 14.6); g.strokeStyle = rgba(rope); g.lineWidth = 1.3; g.stroke(); }, undefined, CLOTH);
  p.part((g) => { circle(g, 4.0, 10.2, 1.3); g.fillStyle = rgba(darken(rope, 0.15)); g.fill(); }, (g) => p.volume(g, 4, 10.2, 1.3, rope, 0.4, 0.5), CLOTH);
}

export function nameTag(p: P) {
  const tag = 0xd8c8a0;
  p.part((g) => { g.beginPath(); g.moveTo(2.2, 3.6); g.quadraticCurveTo(4.0, 1.6, 6.0, 3.0); g.strokeStyle = rgba(0xe8e8e8); g.lineWidth = 0.4; g.stroke(); }, undefined, CLOTH);
  p.part((g) => {
    g.save(); g.translate(8.6, 8.6); g.rotate(-Math.PI / 4);
    g.beginPath(); g.moveTo(-5.6, -2.4); g.lineTo(3.6, -2.4); g.lineTo(5.8, 0); g.lineTo(3.6, 2.4); g.lineTo(-5.6, 2.4); g.closePath();
    g.restore();
    g.fillStyle = rgba(tag); g.fill();
  }, (g) => {
    g.fillStyle = lin(g, 4, 4, 12, 12, [[0, lighten(tag, 0.3)], [1, darken(tag, 0.25)]]);
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = rgba(0x3a2a1a);
    circle(g, 11.6, 5.6, 0.6); g.fill();
    g.strokeStyle = rgba(0x8a7a5a, 0.6);
    g.lineWidth = 0.3;
    g.beginPath(); g.moveTo(5.0, 11.4); g.lineTo(9.6, 6.8); g.stroke();
  }, CLOTH);
}

export function saddle(p: P) {
  const leather = 0x8a4a22;
  p.part((g) => { ellipse(g, 7.0, 12.6, 1.6, 1.4); g.strokeStyle = rgba(0x9a9aa0); g.lineWidth = 0.6; g.stroke(); }, undefined, METAL);
  p.part((g) => { g.beginPath(); g.moveTo(7.0, 7.6); g.lineTo(7.0, 11.2); g.strokeStyle = rgba(0x4a2a12); g.lineWidth = 0.7; g.stroke(); }, undefined, CLOTH);
  p.part((g) => {
    g.beginPath();
    g.moveTo(1.6, 5.0);
    g.quadraticCurveTo(2.0, 3.0, 3.6, 3.6);
    g.quadraticCurveTo(8.0, 6.4, 12.0, 4.0);
    g.quadraticCurveTo(14.4, 2.8, 14.6, 5.0);
    g.quadraticCurveTo(14.2, 9.4, 11.0, 10.2);
    g.quadraticCurveTo(8.0, 10.8, 5.0, 10.0);
    g.quadraticCurveTo(1.6, 9.0, 1.6, 5.0);
    g.closePath();
    g.fillStyle = rgba(leather); g.fill();
  }, (g) => {
    p.volume(g, 8, 6, 7, leather, 0.35, 0.5);
    g.setLineDash([0.4, 0.4]);
    g.strokeStyle = rgba(lighten(leather, 0.45), 0.7);
    g.lineWidth = 0.18;
    g.beginPath(); g.moveTo(2.6, 5.6); g.quadraticCurveTo(8, 9.6, 13.6, 5.4); g.stroke();
    g.setLineDash([]);
    p.spec(g, 4.6, 5.0, 1.6, 0.5, 0.4, 0.4);
  }, { rough: 0.45 });
}

export function totem(p: P) {
  const gold = 0xf0c640;
  const part = (draw: (g: Ctx) => void, cx: number, cy: number, r: number) =>
    p.part((g) => { draw(g); g.fillStyle = rgba(gold); g.fill(); }, (g) => { p.volume(g, cx, cy, r, gold, 0.55, 0.5); }, POLISHED);
  // wings / arms
  part((g) => { g.beginPath(); g.moveTo(5, 7.6); g.lineTo(1.4, 6.0); g.lineTo(1.6, 9.4); g.lineTo(5, 10.4); g.closePath(); g.moveTo(11, 7.6); g.lineTo(14.6, 6.0); g.lineTo(14.4, 9.4); g.lineTo(11, 10.4); g.closePath(); }, 8, 8, 7);
  // body
  part((g) => { rrect(g, 5.0, 7.2, 6.0, 6.0, 0.8); }, 8, 10, 3.5);
  // base / feet
  part((g) => { rrect(g, 5.6, 13.0, 4.8, 2.2, 0.5); }, 8, 14, 2.5);
  // head
  part((g) => { rrect(g, 4.4, 1.0, 7.2, 6.6, 1.2); }, 8, 4.2, 3.8);
  p.part((g) => {
    g.fillStyle = rgba(0x1fd06a);
    rrect(g, 5.4, 3.4, 1.8, 1.4, 0.3); g.fill();
    rrect(g, 8.8, 3.4, 1.8, 1.4, 0.3); g.fill();
    g.fillStyle = rgba(0x6a4a10);
    rrect(g, 6.6, 5.6, 2.8, 0.6, 0.2); g.fill();
  }, (g) => { p.spec(g, 6.0, 3.6, 0.6, 0.35, 0, 0.9); p.spec(g, 9.4, 3.6, 0.6, 0.35, 0, 0.9); }, { rough: 0.1, emissive: 0.3 });
}

export function elytra(p: P) {
  const c = 0x8a8aa0;
  for (const side of [-1, 1]) {
    p.part((g) => {
      g.save(); g.translate(8, 2.0); g.scale(side, 1);
      g.beginPath();
      g.moveTo(0.4, 0);
      g.quadraticCurveTo(5.6, 0.4, 6.8, 3.4);
      g.quadraticCurveTo(6.6, 9.0, 4.4, 13.8);
      g.quadraticCurveTo(2.4, 12.6, 1.4, 10.6);
      g.quadraticCurveTo(0.4, 5.0, 0.4, 0);
      g.closePath();
      g.restore();
      g.fillStyle = rgba(side < 0 ? c : darken(c, 0.12)); g.fill();
    }, (g) => {
      g.fillStyle = lin(g, 8 + side * 1, 2, 8 + side * 7, 14, [[0, lighten(c, 0.3)], [1, darken(c, 0.4)]]);
      g.fillRect(0, 0, 16, 16);
      g.strokeStyle = rgba(darken(c, 0.4), 0.6);
      g.lineWidth = 0.22;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(8 + side * 0.8, 2.4 + i * 0.6); g.quadraticCurveTo(8 + side * (3 + i), 6 + i, 8 + side * (2.2 + i * 0.9), 11.6 + i * 0.4); g.stroke(); }
    }, { rough: 0.7 });
  }
}

export function armorStand(p: P) {
  const wood = 0xc8a46a;
  const bar = (x0: number, y0: number, x1: number, y1: number, r: number) => p.part((g) => { capsule(g, x0, y0, x1, y1, r); g.fillStyle = rgba(wood); g.fill(); }, (g) => p.cylinder(g, x0, y0, x1, y1, r, wood, 0.45, 0.5), { rough: 0.6 });
  p.part((g) => { rrect(g, 3.0, 13.4, 10.0, 1.8, 0.4); g.fillStyle = rgba(0x9a9aa0); g.fill(); }, (g) => headShade(p, g, 'stone', 0x9a9aa0, 3, 13, 13, 15), { rough: 0.7 });
  bar(8, 2.8, 8, 13.6, 0.65);
  bar(3.0, 4.6, 13.0, 4.6, 0.65);
  bar(5.6, 9.0, 10.4, 9.0, 0.55);
  bar(6.8, 9.0, 6.8, 13.4, 0.5);
  bar(9.2, 9.0, 9.2, 13.4, 0.5);
}

export function itemFrame(p: P) {
  const wood = 0x8a5a30, inner = p.params.color;
  p.part((g) => { rrect(g, 1.6, 1.6, 12.8, 12.8, 0.6); g.fillStyle = rgba(wood); g.fill(); }, (g) => {
    headShade(p, g, 'wooden', wood, 1, 1, 15, 15);
  }, { rough: 0.65 });
  p.part((g) => { rrect(g, 3.6, 3.6, 8.8, 8.8, 0.2); g.fillStyle = rgba(inner); g.fill(); }, (g) => {
    g.fillStyle = lin(g, 3, 3, 13, 13, [[0, darken(inner, 0.45)], [1, lighten(inner, 0.1)]]);
    g.fillRect(0, 0, 16, 16);
    p.speckle(g, 30, 3.6, 3.6, 12.4, 12.4, 0.3, darken(inner, 0.5), 0.4);
  }, { rough: 0.85, emissive: p.params.name.startsWith('glow') ? 0.4 : 0 });
}

export function painting(p: P) {
  p.part((g) => { rrect(g, 1.2, 2.6, 13.6, 10.8, 0.4); g.fillStyle = rgba(0x8a5a30); g.fill(); }, (g) => headShade(p, g, 'wooden', 0x8a5a30, 1, 2, 15, 14), { rough: 0.6 });
  p.part((g) => { g.fillStyle = '#6ab0e8'; g.fillRect(2.6, 4.0, 10.8, 8.0); }, (g) => {
    g.fillStyle = lin(g, 0, 4, 0, 9, [[0, 0x5aa0e0], [1, 0xc8e8ff]]);
    g.fillRect(2.6, 4, 10.8, 5);
    g.fillStyle = rgba(0x4a8a3a);
    g.beginPath(); g.moveTo(2.6, 9.6); g.quadraticCurveTo(6, 6.8, 9, 9.0); g.quadraticCurveTo(11.4, 7.6, 13.4, 9.2); g.lineTo(13.4, 12); g.lineTo(2.6, 12); g.closePath(); g.fill();
    g.fillStyle = rgba(0xfff0a0);
    circle(g, 11.0, 5.6, 0.9); g.fill();
  }, { rough: 0.7 });
}

export function goatHorn(p: P) {
  const c = 0xc8bca0;
  p.part((g) => {
    g.beginPath();
    g.moveTo(2.0, 13.6);
    g.bezierCurveTo(4.6, 6.0, 9.6, 1.2, 14.4, 2.4);
    g.bezierCurveTo(12.4, 3.0, 9.2, 5.8, 7.4, 9.4);
    g.bezierCurveTo(6.4, 11.6, 5.6, 13.6, 5.2, 15.0);
    g.closePath();
    g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    g.fillStyle = lin(g, 4, 6, 8, 10, [[0, lighten(c, 0.35)], [1, darken(c, 0.4)]]);
    g.fillRect(0, 0, 16, 16);
    g.strokeStyle = rgba(darken(c, 0.4), 0.6);
    g.lineWidth = 0.3;
    for (let i = 0; i < 7; i++) { const t = i / 7; const x = 3.4 + t * 9, y = 13.6 - t * 10.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2.2 - t, y + 0.6 + t * 0.6); g.stroke(); }
  }, { rough: 0.5 });
}

export function minecart(p: P) {
  const metal = 0x8a8a90, load = p.params.color;
  // wheels
  for (const x of [4.6, 11.4]) p.part((g) => { circle(g, x, 13.0, 1.6); g.fillStyle = rgba(0x2a2a2e); g.fill(); }, (g) => p.volume(g, x, 13, 1.6, 0x3a3a40, 0.4, 0.5), METAL);
  if (p.params.name !== 'minecart') {
    // contents peeking out
    p.part((g) => { rrect(g, 3.4, 2.6, 9.2, 5.6, 0.6); g.fillStyle = rgba(load); g.fill(); }, (g) => {
      headShade(p, g, 'wooden', load, 3, 2, 13, 8);
      if (p.params.name === 'tnt_minecart') { g.fillStyle = '#eee'; g.fillRect(3.4, 4.6, 9.2, 1.6); g.fillStyle = '#222'; g.font = '1.4px sans-serif'; }
      if (p.params.name === 'chest_minecart') { g.fillStyle = rgba(0x3a2a1a); g.fillRect(3.4, 5.0, 9.2, 0.4); g.fillStyle = rgba(0xc8c8c8); g.fillRect(7.4, 4.6, 1.2, 1.4); }
      if (p.params.name === 'furnace_minecart') { g.fillStyle = rgba(0x1a1a1a); g.fillRect(6.0, 4.4, 4.0, 2.6); }
    }, { rough: 0.6 });
  }
  p.part((g) => { poly(g, [1.4, 5.6, 14.6, 5.6, 13.2, 12.4, 2.8, 12.4]); g.fillStyle = rgba(metal); g.fill(); }, (g) => {
    headShade(p, g, 'iron', metal, 2, 5, 14, 12);
    g.strokeStyle = rgba(darken(metal, 0.45), 0.8);
    g.lineWidth = 0.3;
    poly(g, [2.4, 6.6, 13.6, 6.6, 12.5, 11.4, 3.5, 11.4]);
    g.stroke();
    g.fillStyle = rgba(0x5a5a60);
    for (const [x, y] of [[3.2, 7.4], [12.8, 7.4], [3.8, 10.6], [12.2, 10.6]]) { circle(g, x, y, 0.35); g.fill(); }
  }, METAL);
  if (p.params.name === 'minecart') {
    p.part((g) => { poly(g, [2.4, 5.6, 13.6, 5.6, 13.0, 7.0, 3.0, 7.0]); g.fillStyle = rgba(0x2a2a2e); g.fill(); }, undefined, METAL);
  }
}

export function boat(p: P, chest = false) {
  const wood = p.params.color;
  // paddles (behind)
  for (const [x0, y0, x1, y1] of [[2.6, 2.8, 6.2, 9.0], [13.6, 2.4, 10.6, 9.0]] as [number, number, number, number][]) {
    p.part((g) => { capsule(g, x0, y0, x1, y1, 0.35); g.fillStyle = rgba(darken(wood, 0.15)); g.fill(); }, (g) => p.cylinder(g, x0, y0, x1, y1, 0.35, darken(wood, 0.15), 0.4, 0.5), { rough: 0.6 });
    p.part((g) => { ellipse(g, x0, y0, 0.9, 1.6, Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2); g.fillStyle = rgba(wood); g.fill(); }, (g) => p.volume(g, x0, y0, 1.6, wood, 0.35, 0.5), { rough: 0.6 });
  }
  // hull: open boat seen from slightly above
  const hull = (g: Ctx) => {
    g.beginPath();
    g.moveTo(0.8, 7.4);
    g.quadraticCurveTo(8, 5.2, 15.2, 7.4);
    g.quadraticCurveTo(14.6, 12.4, 11.4, 13.8);
    g.lineTo(4.6, 13.8);
    g.quadraticCurveTo(1.4, 12.4, 0.8, 7.4);
    g.closePath();
  };
  p.part((g) => { hull(g); g.fillStyle = rgba(wood); g.fill(); }, (g) => {
    headShade(p, g, 'wooden', wood, 2, 7, 13, 14);
    g.strokeStyle = rgba(darken(wood, 0.5), 0.75);
    g.lineWidth = 0.25;
    for (const y of [10.0, 12.0]) { g.beginPath(); g.moveTo(1.2, y - 0.4); g.quadraticCurveTo(8, y + 1.0, 14.8, y - 0.4); g.stroke(); }
  }, { rough: 0.6 });
  // inside of the hull
  p.part((g) => { g.beginPath(); g.moveTo(2.0, 7.6); g.quadraticCurveTo(8, 5.8, 14.0, 7.6); g.quadraticCurveTo(8, 10.0, 2.0, 7.6); g.closePath(); g.fillStyle = rgba(darken(wood, 0.35)); g.fill(); }, (g) => {
    g.fillStyle = lin(g, 0, 6, 0, 9, [[0, darken(wood, 0.6)], [1, darken(wood, 0.25)]]);
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = rgba(lighten(wood, 0.1));
    g.fillRect(7.2, 6.4, 1.6, 2.8);
  }, { rough: 0.7 });
  if (chest) {
    p.part((g) => { rrect(g, 5.6, 2.8, 4.8, 4.6, 0.4); g.fillStyle = rgba(0xa2783a); g.fill(); }, (g) => {
      headShade(p, g, 'wooden', 0xa2783a, 5.6, 2.8, 10.4, 7.4);
      g.fillStyle = rgba(0x3a2a1a); g.fillRect(5.6, 4.2, 4.8, 0.35);
      g.fillStyle = rgba(0xc8c8c8); g.fillRect(7.6, 4.0, 0.9, 1.0);
    }, { rough: 0.6 });
  }
}
export const chestBoat = (p: P) => boat(p, true);

export function musicDisc(p: P) {
  const label = p.params.color;
  p.part((g) => { circle(g, 8, 8, 7.0); g.fillStyle = rgba(0x141418); g.fill(); }, (g) => {
    g.strokeStyle = 'rgba(90,90,110,0.35)';
    g.lineWidth = 0.14;
    for (let r = 3.4; r < 6.8; r += 0.45) { g.beginPath(); g.arc(8, 8, r, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = lin(g, 2, 2, 14, 14, [[0, 0xffffff, 0.0], [0.3, 0xffffff, 0.18], [0.5, 0xffffff, 0], [0.7, 0xffffff, 0.12], [1, 0xffffff, 0]]);
    g.fillRect(0, 0, 16, 16);
  }, { rough: 0.15 });
  p.part((g) => { circle(g, 8, 8, 2.8); g.fillStyle = rgba(label); g.fill(); }, (g) => {
    p.volume(g, 8, 8, 2.8, label, 0.35, 0.4);
    g.fillStyle = rgba(0x0a0a0a);
    circle(g, 8, 8, 0.55); g.fill();
  }, { rough: 0.6 });
}

export function crossbow(p: P) {
  const charged = !!p.params.data?.charged;
  const wood = 0x7a4a24, iron = 0x6a6a72;
  // stock
  p.part((g) => { capsule(g, 1.8, 14.2, 12.6, 3.4, 1.35, 1.0); g.fillStyle = rgba(wood); g.fill(); }, (g) => {
    p.cylinder(g, 1.8, 14.2, 12.6, 3.4, 1.35, wood, 0.4, 0.5);
    g.strokeStyle = rgba(0x3a2410, 0.6);
    g.lineWidth = 0.25;
    g.beginPath(); g.moveTo(3.0, 13.6); g.lineTo(11.8, 4.8); g.stroke();
  }, { rough: 0.6 });
  // prod (bow arms) across the front
  p.part((g) => {
    g.beginPath();
    g.moveTo(4.2, 1.6);
    g.quadraticCurveTo(11.6, 2.6, 14.4, 11.8);
    g.strokeStyle = rgba(iron);
    g.lineWidth = 1.5;
    g.stroke();
  }, (g) => headShade(p, g, 'iron', iron, 5, 2, 14, 11), METAL);
  // string
  const nock: [number, number] = charged ? [6.0, 10.0] : [8.0, 8.0];
  p.part((g) => { g.beginPath(); g.moveTo(4.2, 1.6); g.lineTo(nock[0], nock[1]); g.lineTo(14.4, 11.8); g.strokeStyle = 'rgba(230,230,230,1)'; g.lineWidth = 0.35; g.stroke(); }, undefined, CLOTH);
  if (charged) arrowShape(p, 6.0, 10.0, 14.2, 1.8, 0x5a5a60, 0.75);
  // trigger
  p.part((g) => { capsule(g, 5.0, 11.0, 6.0, 12.6, 0.35); g.fillStyle = rgba(iron); g.fill(); }, undefined, METAL);
}

// ------------------------------------------------------------------------------ armor
function armorColor(p: P): Col {
  return p.params.data?.color ?? p.params.color;
}
function armorShade(p: P, g: Ctx, c: Col, chain: boolean, x0: number, y0: number, x1: number, y1: number) {
  g.fillStyle = lin(g, x0, y0, x1, y1, [[0, lighten(c, 0.4)], [0.35, lighten(c, 0.1)], [0.7, darken(c, 0.15)], [1, darken(tint(c, -0.5), 0.5)]]);
  g.fillRect(0, 0, 16, 16);
  if (chain) {
    g.strokeStyle = 'rgba(30,30,34,0.75)';
    g.lineWidth = 0.18;
    for (let y = 0; y < 16; y += 0.9) for (let x = (y / 0.9) % 2 ? 0 : 0.45; x < 16; x += 0.9) { g.beginPath(); g.arc(x, y, 0.36, 0, Math.PI * 2); g.stroke(); }
  }
}
function armorMat(p: P): Mat {
  const kind = p.params.color2; // 1 chainmail, 2 leather
  if (kind === 2) return { rough: 0.7 };
  const n = p.params.name;
  if (n.startsWith('diamond')) return { metal: 0.2, rough: 0.15 };
  if (n.startsWith('golden')) return POLISHED;
  return METAL;
}
function trimStitch(g: Ctx, path: () => void, c: Col) {
  g.setLineDash([0.4, 0.35]);
  g.strokeStyle = rgba(lighten(c, 0.45), 0.7);
  g.lineWidth = 0.18;
  path();
  g.stroke();
  g.setLineDash([]);
}

export function helmet(p: P) {
  const c = armorColor(p);
  const chain = p.params.color2 === 1, leather = p.params.color2 === 2;
  const path = (g: Ctx) => {
    g.beginPath();
    g.moveTo(1.8, 12.6);
    g.lineTo(1.8, 6.6);
    g.bezierCurveTo(1.8, 2.6, 4.6, 1.6, 8, 1.6);
    g.bezierCurveTo(11.4, 1.6, 14.2, 2.6, 14.2, 6.6);
    g.lineTo(14.2, 12.6);
    g.lineTo(11.4, 12.6);
    g.lineTo(11.4, 8.8);
    g.lineTo(4.6, 8.8);
    g.lineTo(4.6, 12.6);
    g.closePath();
  };
  p.part((g) => { path(g); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    armorShade(p, g, c, chain, 3, 2, 13, 12);
    // brow band
    g.fillStyle = rgba(darken(c, 0.25), 0.8);
    g.fillRect(1.8, 7.4, 12.4, 1.4);
    g.fillStyle = rgba(lighten(c, 0.4), 0.6);
    g.fillRect(1.8, 7.4, 12.4, 0.35);
    if (leather) trimStitch(g, () => { g.beginPath(); g.moveTo(2.6, 12.2); g.lineTo(2.6, 6.8); g.bezierCurveTo(2.6, 3.4, 5, 2.4, 8, 2.4); g.bezierCurveTo(11, 2.4, 13.4, 3.4, 13.4, 6.8); g.lineTo(13.4, 12.2); }, c);
    if (!leather && !chain) p.spec(g, 5.2, 3.6, 2.2, 0.8, -0.3, 0.55);
  }, armorMat(p));
}

export function chestplate(p: P) {
  const c = armorColor(p);
  const chain = p.params.color2 === 1, leather = p.params.color2 === 2;
  const path = (g: Ctx) => {
    g.beginPath();
    g.moveTo(1.2, 2.2);
    g.lineTo(5.0, 1.6);
    g.quadraticCurveTo(8, 3.8, 11.0, 1.6);
    g.lineTo(14.8, 2.2);
    g.lineTo(14.8, 8.2);
    g.lineTo(12.6, 8.2);
    g.lineTo(12.4, 14.4);
    g.lineTo(3.6, 14.4);
    g.lineTo(3.4, 8.2);
    g.lineTo(1.2, 8.2);
    g.closePath();
  };
  p.part((g) => { path(g); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    armorShade(p, g, c, chain, 2, 2, 14, 14);
    // chest plates / shoulder seams
    g.strokeStyle = rgba(darken(c, 0.4), 0.75);
    g.lineWidth = 0.28;
    g.beginPath(); g.moveTo(8, 3.4); g.lineTo(8, 14.2); g.stroke();
    g.beginPath(); g.moveTo(3.4, 8.2); g.lineTo(3.4, 2.0); g.moveTo(12.6, 8.2); g.lineTo(12.6, 2.0); g.stroke();
    g.beginPath(); g.moveTo(3.6, 11.0); g.lineTo(12.4, 11.0); g.stroke();
    if (leather) trimStitch(g, () => { g.beginPath(); g.moveTo(4.2, 13.6); g.lineTo(11.8, 13.6); }, c);
    if (!leather && !chain) { p.spec(g, 5.6, 6.0, 1.6, 2.4, 0, 0.45); p.spec(g, 10.4, 6.0, 1.2, 2.0, 0, 0.2); }
  }, armorMat(p));
}

export function leggings(p: P) {
  const c = armorColor(p);
  const chain = p.params.color2 === 1, leather = p.params.color2 === 2;
  const path = (g: Ctx) => {
    g.beginPath();
    g.moveTo(2.6, 1.6);
    g.lineTo(13.4, 1.6);
    g.lineTo(13.8, 14.6);
    g.lineTo(9.6, 14.6);
    g.lineTo(8.6, 6.0);
    g.lineTo(7.4, 6.0);
    g.lineTo(6.4, 14.6);
    g.lineTo(2.2, 14.6);
    g.closePath();
  };
  p.part((g) => { path(g); g.fillStyle = rgba(c); g.fill(); }, (g) => {
    armorShade(p, g, c, chain, 3, 2, 13, 14);
    g.fillStyle = rgba(darken(c, 0.3), 0.85);
    g.fillRect(2.6, 1.6, 10.8, 1.6);
    g.fillStyle = rgba(lighten(c, 0.4), 0.6);
    g.fillRect(2.6, 1.6, 10.8, 0.35);
    g.strokeStyle = rgba(darken(c, 0.4), 0.6);
    g.lineWidth = 0.25;
    g.beginPath(); g.moveTo(4.4, 3.4); g.lineTo(4.2, 14.4); g.moveTo(11.6, 3.4); g.lineTo(11.8, 14.4); g.stroke();
    if (leather) trimStitch(g, () => { g.beginPath(); g.moveTo(2.8, 13.8); g.lineTo(6.0, 13.8); g.moveTo(10.0, 13.8); g.lineTo(13.4, 13.8); }, c);
    if (!leather && !chain) p.spec(g, 5.0, 7.0, 0.8, 3.0, 0, 0.45);
  }, armorMat(p));
}

export function boots(p: P) {
  const c = armorColor(p);
  const chain = p.params.color2 === 1, leather = p.params.color2 === 2;
  for (const [dx, dy, shade] of [[4.4, -1.6, 0.25], [0, 0, 0]] as [number, number, number][]) {
    const cc = darken(c, shade);
    p.part((g) => {
      g.save(); g.translate(dx, dy);
      g.beginPath();
      g.moveTo(1.8, 5.8);
      g.lineTo(6.6, 5.8);
      g.lineTo(6.8, 10.2);
      g.quadraticCurveTo(7.4, 11.0, 9.0, 11.2);
      g.quadraticCurveTo(11.0, 11.6, 11.0, 13.4);
      g.lineTo(11.0, 14.6);
      g.lineTo(1.8, 14.6);
      g.closePath();
      g.restore();
      g.fillStyle = rgba(cc); g.fill();
    }, (g) => {
      armorShade(p, g, cc, chain, 2 + dx, 6 + dy, 10 + dx, 14 + dy);
      g.fillStyle = rgba(darken(cc, 0.4), 0.85);
      g.fillRect(1.8 + dx, 13.6 + dy, 9.2, 1.0);
      g.fillStyle = rgba(lighten(cc, 0.35), 0.6);
      g.fillRect(1.8 + dx, 6.2 + dy, 4.6, 0.6);
      if (leather) trimStitch(g, () => { g.beginPath(); g.moveTo(2.4 + dx, 7.2 + dy); g.lineTo(5.8 + dx, 7.2 + dy); }, cc);
    }, armorMat(p));
  }
}

export function turtleHelmet(p: P) {
  const c = p.params.color;
  p.part((g) => {
    g.beginPath();
    g.moveTo(1.4, 11.6);
    g.bezierCurveTo(1.4, 3.0, 4.6, 1.6, 8, 1.6);
    g.bezierCurveTo(11.4, 1.6, 14.6, 3.0, 14.6, 11.6);
    g.lineTo(12.2, 12.8);
    g.lineTo(3.8, 12.8);
    g.closePath();
    g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    armorShade(p, g, c, false, 3, 2, 13, 12);
    g.strokeStyle = rgba(lighten(c, 0.35), 0.8);
    g.lineWidth = 0.35;
    poly(g, [8, 3.6, 10.8, 5.2, 10.8, 8.4, 8, 10.0, 5.2, 8.4, 5.2, 5.2]);
    g.stroke();
    g.beginPath(); g.moveTo(2, 9.2); g.lineTo(5.2, 8.4); g.moveTo(14, 9.2); g.lineTo(10.8, 8.4); g.moveTo(8, 10); g.lineTo(8, 12.8); g.stroke();
    g.fillStyle = rgba(0x2a1a0a, 0.85);
    g.fillRect(3.8, 11.8, 8.4, 1.0);
  }, { rough: 0.35 });
}

export function horseArmor(p: P) {
  const c = p.params.color;
  p.part((g) => {
    g.beginPath();
    g.moveTo(3.0, 14.6);
    g.lineTo(3.4, 9.0);
    g.quadraticCurveTo(3.6, 4.6, 7.0, 2.6);
    g.lineTo(9.4, 1.4);
    g.lineTo(9.8, 3.0);
    g.quadraticCurveTo(13.6, 4.4, 14.6, 8.0);
    g.lineTo(13.8, 9.6);
    g.lineTo(10.4, 8.6);
    g.quadraticCurveTo(8.4, 10.6, 8.6, 14.6);
    g.closePath();
    g.fillStyle = rgba(c); g.fill();
  }, (g) => {
    armorShade(p, g, c, false, 3, 2, 13, 14);
    g.fillStyle = rgba(0x3a2a1a);
    circle(g, 10.0, 5.0, 0.6); g.fill();
    g.strokeStyle = rgba(darken(c, 0.4), 0.7);
    g.lineWidth = 0.3;
    g.beginPath(); g.moveTo(4.2, 9.4); g.quadraticCurveTo(6, 6, 9, 4.2); g.stroke();
  }, p.params.name.startsWith('leather') ? { rough: 0.7 } : METAL);
}

export function spawnEgg(p: P) {
  const a = p.params.color, b = p.params.color2;
  p.part((g) => { eggPath(g, 8, 8.4, 9.6, 12.8, 0); g.fillStyle = rgba(a); g.fill(); }, (g) => {
    p.volume(g, 8, 8.6, 6.8, a, luma(a) > 0.8 ? 0.2 : 0.4, 0.5);
    // spots
    const spots: [number, number, number][] = [[5.6, 5.6, 1.3], [10.2, 4.6, 1.0], [9.4, 8.8, 1.5], [5.0, 10.8, 1.2], [11.0, 12.0, 1.0], [7.4, 13.4, 0.8], [7.0, 3.0, 0.7]];
    for (const [x, y, r] of spots) {
      g.fillStyle = rgba(b);
      g.beginPath();
      smooth(g, [x - r, y, x - r * 0.3, y - r * 0.9, x + r * 0.8, y - r * 0.5, x + r, y + r * 0.4, x, y + r], true, 0.5, false);
      g.fill();
    }
    g.fillStyle = rad(g, 8, 8.6, 3, 8, 8.6, 7.2, [[0, 0x000000, 0], [1, 0x000000, 0.25]]);
    g.fillRect(0, 0, 16, 16);
    p.spec(g, 5.8, 5.0, 1.5, 1.0, -0.4, 0.75);
  }, { rough: 0.35 });
}

// ------------------------------------------------------------------------------ bottles
export function potionIcon(p: P, shape: 'potion' | 'splash' | 'lingering', color: Col | null) {
  bottle(p, color, shape);
}

export const _u = [mix, rad, POLISHED, GEM];
