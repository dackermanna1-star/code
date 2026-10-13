// Perk glyphs (zombie survival perk draft, perks.js): one white silhouette per perk in a
// 24 x 24 box, rasterised like the HUD sprites (icons.js rasterSprite: bevelled intensity,
// tinted and drawn additively), so they sit in the HUD's perk strip, on the draft cards and
// in the run report. A row's `icon` names a glyph here; else its id; else its first tag's.
//
//   import { perkIcon, glyphFor } from '../ui/perkicons.js';
//   hud.spr(perkIcon(glyphFor(id, PERKS[id]), 16 * k), x, y, rgb);   // the HUD (additive)
//   drawPerkIcon(ctx, key, x, y, px, rgb)                             // a card's canvas
import { drawOps, rasterSprite, tinted, RAMP_ICON } from './icons.js';

const R = (x, y, w, h) => ['r', x, y, w, h];
const P = (...pts) => ['p', ...pts];
const C = (x, y, r) => ['c', x, y, r];
const E = (x, y, rx, ry) => ['e', x, y, rx, ry];
const L = (x0, y0, x1, y1, w) => ['l', x0, y0, x1, y1, w];

const cut = (g, f) => { g.globalCompositeOperation = 'destination-out'; f(); g.globalCompositeOperation = 'source-over'; };

function heart(g, cx, cy, s) {
  g.beginPath();
  g.moveTo(cx, cy + s * 0.78);
  g.bezierCurveTo(cx - s * 1.15, cy - s * 0.05, cx - s * 0.75, cy - s * 0.95, cx, cy - s * 0.42);
  g.bezierCurveTo(cx + s * 0.75, cy - s * 0.95, cx + s * 1.15, cy - s * 0.05, cx, cy + s * 0.78);
  g.closePath();
  g.fill();
}

function flame(g, cx, by, h, w) {
  g.beginPath();
  g.moveTo(cx, by);
  g.bezierCurveTo(cx - w, by, cx - w * 1.05, by - h * 0.45, cx - w * 0.35, by - h * 0.7);
  g.bezierCurveTo(cx - w * 0.45, by - h * 0.45, cx - w * 0.1, by - h * 0.42, cx - w * 0.05, by - h * 0.55);
  g.bezierCurveTo(cx - w * 0.25, by - h * 0.8, cx + w * 0.1, by - h * 0.9, cx + w * 0.05, by - h);
  g.bezierCurveTo(cx + w * 0.8, by - h * 0.7, cx + w * 1.1, by - h * 0.3, cx + w * 0.55, by - h * 0.02);
  g.bezierCurveTo(cx + w * 0.35, by, cx + w * 0.15, by, cx, by);
  g.closePath();
  g.fill();
}

function drop(g, cx, cy, s) {
  g.beginPath();
  g.moveTo(cx, cy - s);
  g.bezierCurveTo(cx + s * 0.25, cy - s * 0.45, cx + s * 0.75, cy + s * 0.05, cx + s * 0.75, cy + s * 0.4);
  g.arc(cx, cy + s * 0.4, s * 0.75, 0, Math.PI);
  g.bezierCurveTo(cx - s * 0.75, cy + s * 0.05, cx - s * 0.25, cy - s * 0.45, cx, cy - s);
  g.closePath();
  g.fill();
}

function skull(g, cx, cy, s) {
  drawOps(g, [E(cx, cy - s * 0.15, s, s * 0.9), R(cx - s * 0.55, cy + s * 0.35, s * 1.1, s * 0.75)]);
  cut(g, () => drawOps(g, [E(cx - s * 0.42, cy - s * 0.05, s * 0.27, s * 0.3), E(cx + s * 0.42, cy - s * 0.05, s * 0.27, s * 0.3),
    P(cx, cy + s * 0.22, cx - s * 0.14, cy + s * 0.5, cx + s * 0.14, cy + s * 0.5),
    R(cx - s * 0.3, cy + s * 0.78, s * 0.12, s * 0.35), R(cx - s * 0.06, cy + s * 0.78, s * 0.12, s * 0.35), R(cx + s * 0.18, cy + s * 0.78, s * 0.12, s * 0.35)]));
}

function bolt(g, ox = 0, oy = 0, s = 1) {
  drawOps(g, [P(ox + 14 * s, oy + 1 * s, ox + 5 * s, oy + 13 * s, ox + 11 * s, oy + 13 * s, ox + 8 * s, oy + 23 * s, ox + 19 * s, oy + 9.5 * s, ox + 13 * s, oy + 9.5 * s, ox + 16.5 * s, oy + 1 * s)]);
}

function speedLines(g, x, ys, len, w = 1.6) { drawOps(g, ys.map((y, i) => L(x + (i % 2) * 1.5, y, x + len + (i % 2) * 1.5, y, w))); }

function text(g, str, x, y, px, weight = 900) {
  g.font = `${weight} ${px}px Verdana, "DejaVu Sans", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(str, x, y);
}

function gear(g, cx, cy, r, teeth = 8) {
  const ops = [C(cx, cy, r)];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    ops.push(L(cx + c * r * 0.6, cy + s * r * 0.6, cx + c * (r + 2.6), cy + s * (r + 2.6), 3.2));
  }
  drawOps(g, ops);
}

function shield(g, cx, top, w, h) {
  g.beginPath();
  g.moveTo(cx - w / 2, top + h * 0.12);
  g.quadraticCurveTo(cx, top - h * 0.06, cx + w / 2, top + h * 0.12);
  g.lineTo(cx + w / 2, top + h * 0.45);
  g.bezierCurveTo(cx + w / 2, top + h * 0.75, cx + w * 0.2, top + h * 0.92, cx, top + h);
  g.bezierCurveTo(cx - w * 0.2, top + h * 0.92, cx - w / 2, top + h * 0.75, cx - w / 2, top + h * 0.45);
  g.closePath();
  g.fill();
}

function wing(g, x, y, dir) {
  // three feathers sweeping out to one side (dir 1: right, -1: left)
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(x, y + i * 2.4);
    g.quadraticCurveTo(x + dir * (5 + i * 1.5), y - 3 + i * 2.6, x + dir * (9 - i * 1.6), y - 1 + i * 3.4);
    g.quadraticCurveTo(x + dir * (4 + i), y + 1.6 + i * 2.6, x, y + 2 + i * 2.4);
    g.closePath();
    g.fill();
  }
}

/** The glyphs: key -> draw(g) in a 24 x 24 box (white fill; cut() punches holes). */
export const GLYPHS = {
  // ---------------------------------------------------------------- drafted perks
  toughness: (g) => { heart(g, 12, 12.5, 10.5); cut(g, () => drawOps(g, [R(10.6, 7.8, 2.8, 9), R(7.5, 10.9, 9, 2.8)])); },
  quickhands: (g) => { drawOps(g, [P(11, 5, 17, 5, 19.5, 21, 13.5, 21.5), R(10, 2.5, 8, 3)]); cut(g, () => drawOps(g, [L(12.5, 9, 17, 9, 1), L(13, 13, 17.7, 13, 1), L(13.6, 17, 18.3, 17, 1)])); speedLines(g, 1.5, [8, 12.5, 17], 6.5); },
  fleetfoot: (g) => {
    drawOps(g, [P(5, 12, 10, 12, 11.5, 15, 16, 15.5, 21.5, 17.5, 22, 20.5, 5, 20.5), R(5, 9, 5, 4)]);
    wing(g, 9, 6, -1);
    cut(g, () => drawOps(g, [L(5, 18.4, 22, 18.4, 0.9)]));
  },
  thickskin: (g) => { shield(g, 12, 2, 17, 20); cut(g, () => drawOps(g, [R(4, 9.5, 16, 2.2), R(4, 13.3, 16, 2.2)])); },
  hollowpoints: (g) => {
    drawOps(g, [R(8.5, 10, 7, 11.5), P(8.5, 10.5, 9.3, 5.5, 12, 2.2, 14.7, 5.5, 15.5, 10.5), R(7.6, 19.5, 8.8, 2.4)]);
    cut(g, () => drawOps(g, [C(12, 5, 1.6), R(8.5, 17.6, 7, 0.9)]));
  },
  gunslinger: (g) => {
    drawOps(g, [R(9, 6.5, 13, 3.4), R(6, 6, 6, 7.5), E(9.5, 10.6, 3.6, 3.1), P(5, 11.5, 9.5, 11.5, 8.8, 21, 3.4, 21), R(20.5, 5.4, 1.4, 1.4)]);
    cut(g, () => drawOps(g, [C(9.5, 10.6, 1.1), P(9.8, 13.6, 12.6, 13.6, 11, 16.2)]));
    drawOps(g, [L(10.7, 13.9, 11.6, 16, 1)]);
  },
  closequarters: (g) => {
    for (const x of [4.5, 13]) {
      drawOps(g, [R(x, 4, 6.5, 12.5), R(x - 0.6, 16, 7.7, 5.5), E(x + 3.25, 4.2, 3.25, 1.2)]);
      cut(g, () => drawOps(g, [R(x, 17.8, 6.5, 0.9), L(x + 1.5, 6.5, x + 1.5, 14, 0.8)]));
    }
  },
  sprayandpray: (g) => {
    for (let i = 0; i < 5; i++) {
      const a = -0.95 + i * 0.36, c = Math.cos(a), s = Math.sin(a), d0 = 6 + (i % 2) * 4, d1 = d0 + 6;
      drawOps(g, [L(3 + c * d0, 19 + s * d0, 3 + c * d1, 19 + s * d1, 2.6), C(3 + c * (d1 + 1.2), 19 + s * (d1 + 1.2), 1.3)]);
    }
    drawOps(g, [C(3.5, 19.5, 2.6)]);
  },
  discipline: (g) => { for (let i = 0; i < 3; i++) drawOps(g, [P(3, 8 + i * 5.2, 12, 2.8 + i * 5.2, 21, 8 + i * 5.2, 21, 11.4 + i * 5.2, 12, 6.2 + i * 5.2, 3, 11.4 + i * 5.2)]); },
  scavenger: (g) => {
    drawOps(g, [R(3, 12, 18, 9.5), R(2.4, 11, 19.2, 2.6)]);
    cut(g, () => drawOps(g, [R(5, 15.5, 4, 3), R(15, 15.5, 4, 3)]));
    drawOps(g, [P(12, 1.5, 17.5, 7, 14, 7, 14, 10, 10, 10, 10, 7, 6.5, 7)]);
  },
  fieldmedic: (g) => { drawOps(g, [C(12, 12, 10.5)]); cut(g, () => drawOps(g, [R(9.8, 5.5, 4.4, 13), R(5.5, 9.8, 13, 4.4)])); },
  bountyhunter: (g) => {
    drawOps(g, [C(12, 12, 10.5)]);
    cut(g, () => { drawOps(g, [C(12, 12, 8.3)]); });
    drawOps(g, [C(12, 12, 7.2)]);
    cut(g, () => text(g, '$', 12, 12.6, 12));
    drawOps(g, [L(12, 0, 12, 4, 1.4), L(12, 20, 12, 24, 1.4), L(0, 12, 4, 12, 1.4), L(20, 12, 24, 12, 1.4)]);
  },
  deadeye: (g) => {
    g.beginPath();
    g.moveTo(1.5, 12); g.quadraticCurveTo(12, 1.5, 22.5, 12); g.quadraticCurveTo(12, 22.5, 1.5, 12); g.closePath(); g.fill();
    cut(g, () => drawOps(g, [C(12, 12, 4.6)]));
    drawOps(g, [C(12, 12, 2.3), L(12, 4.5, 12, 7.8, 1), L(12, 16.2, 12, 19.5, 1)]);
  },
  bulkorder: (g) => {
    drawOps(g, [P(2, 12, 9, 4, 22, 4, 22, 20, 9, 20)]);
    cut(g, () => { drawOps(g, [C(8, 12, 1.7)]); text(g, '%', 15.5, 12.4, 11); });
  },
  pyromaniac: (g) => { flame(g, 12, 22.5, 21, 9); cut(g, () => flame(g, 12, 22.5, 10, 4.2)); },
  demolitions: (g) => {
    drawOps(g, [C(10, 14.5, 7.6), R(12.5, 6, 4, 3.6)]);
    g.lineWidth = 1.5; g.beginPath(); g.moveTo(14.5, 6.5); g.quadraticCurveTo(16, 2.5, 19, 3.5); g.stroke();
    drawOps(g, [L(19.5, 0.5, 19.5, 6, 1), L(16.8, 3.3, 22.3, 3.3, 1), L(17.6, 1.4, 21.4, 5.2, 0.8), L(21.4, 1.4, 17.6, 5.2, 0.8)]);
    cut(g, () => drawOps(g, [E(7.5, 12, 1.8, 2.6)]));
  },
  livewire: (g) => bolt(g),
  overclock: (g) => { gear(g, 12, 12, 7.2); cut(g, () => drawOps(g, [C(12, 12, 4.2)])); drawOps(g, [P(13, 8.5, 9.8, 12.6, 12, 12.6, 11, 15.5, 14.2, 11.4, 12, 11.4)]); },
  deepmags: (g) => {
    g.beginPath(); g.moveTo(8, 2); g.lineTo(14, 2); g.quadraticCurveTo(14.5, 13, 19.5, 21); g.lineTo(13.5, 23); g.quadraticCurveTo(8.5, 14, 8, 2); g.closePath(); g.fill();
    cut(g, () => drawOps(g, [L(9.5, 6, 13, 6, 0.9), L(9.8, 10, 13.4, 10, 0.9), L(10.6, 14, 14.4, 14, 0.9), L(12, 18, 16.2, 18, 0.9)]));
  },
  heavygunner: (g) => {
    for (let i = 0; i < 4; i++) {
      const x = 2.5 + i * 5;
      drawOps(g, [R(x, 9 + (i % 2), 3.4, 9), P(x, 9.2 + (i % 2), x + 1.7, 4 + (i % 2), x + 3.4, 9.2 + (i % 2))]);
    }
    drawOps(g, [R(1.5, 15.5 + 0.5, 21, 2.2)]);
  },
  butcher: (g) => {
    drawOps(g, [P(3, 5, 15.5, 3, 17, 13, 4.5, 15.5), L(15.8, 8, 22.5, 6.5, 2.6)]);
    cut(g, () => drawOps(g, [C(13.5, 6.2, 1.2), L(4.4, 13.6, 16.4, 11.4, 0.6)]));
  },
  steadyaim: (g) => {
    drawOps(g, [C(12, 12, 10.5)]);
    cut(g, () => drawOps(g, [C(12, 12, 8.6)]));
    drawOps(g, [L(12, 1.5, 12, 9.5, 1.3), L(12, 14.5, 12, 22.5, 1.3), L(1.5, 12, 9.5, 12, 1.3), L(14.5, 12, 22.5, 12, 1.3), C(12, 12, 1.2)]);
  },
  laststand: (g) => {
    heart(g, 12, 12.5, 10.5);
    cut(g, () => drawOps(g, [L(11, 4.5, 13.5, 9.5, 1.6), L(13.5, 9.5, 10, 13.5, 1.6), L(10, 13.5, 13, 18, 1.6)]));
  },
  luckycharm: (g) => {
    drawOps(g, [C(8.5, 8.5, 4.4), C(15.5, 8.5, 4.4), C(8.5, 15.5, 4.4), C(15.5, 15.5, 4.4), L(13, 13, 20.5, 22.5, 1.8)]);
    cut(g, () => drawOps(g, [L(12, 4, 12, 20, 0.9), L(4, 12, 20, 12, 0.9)]));
  },
  giantslayer: (g) => {
    drawOps(g, [P(10.6, 4, 12, 1, 13.4, 4, 13.6, 16, 10.4, 16), R(6.5, 15.4, 11, 2.4), R(11, 17.8, 2, 3.6), C(12, 22.2, 1.6)]);
    cut(g, () => drawOps(g, [L(12, 4.5, 12, 15, 0.7)]));
  },
  bloodthirst: (g) => {
    drop(g, 12, 9, 10);
    cut(g, () => drawOps(g, [P(8, 13, 10.5, 13, 9.25, 18), P(13.5, 13, 16, 13, 14.75, 18)]));
  },
  rally: (g) => { drawOps(g, [R(4, 2.5, 2.2, 20), C(5.1, 2.4, 1.6), P(6.2, 4, 20.5, 5.5, 16, 9.5, 20.5, 13.5, 6.2, 13)]); },
  adrenaline: (g) => {
    drawOps(g, [L(4.5, 19.5, 15.5, 8.5, 5.2), L(14.5, 9.5, 21.5, 2.5, 1.2), L(1.5, 22.5, 5.5, 18.5, 1.8), L(1.3, 18.8, 5.2, 22.7, 1.8)]);
    cut(g, () => drawOps(g, [L(7.3, 18.3, 9.1, 16.5, 1), L(9.8, 15.8, 11.6, 14, 1), L(12.3, 13.3, 14.1, 11.5, 1)]));
  },
  // ---------------------------------------------------------------- curses (boon-and-curse gambles)
  bloodpact: (g) => {
    drawOps(g, [P(4, 4, 6, 2, 15, 11, 13, 13), L(12, 14.5, 16.5, 10, 2.4), L(14.5, 14, 18.5, 18, 2.6)]);
    drop(g, 18.5, 3.8, 3.4);
    drop(g, 7, 17.5, 4.6);
  },
  glasscannon: (g) => {
    drawOps(g, [P(12, 1.5, 21.5, 9.5, 12, 22.5, 2.5, 9.5)]);
    cut(g, () => drawOps(g, [L(12, 1.5, 10.5, 8, 1.1), L(10.5, 8, 14, 12, 1.1), L(14, 12, 11, 17, 1.1), L(2.5, 9.5, 21.5, 9.5, 0.7)]));
  },
  hairtrigger: (g) => {
    drawOps(g, [E(12, 14, 9.5, 7.2), R(2.5, 3, 19, 4)]);
    cut(g, () => drawOps(g, [E(12, 14, 7.2, 5)]));
    g.beginPath(); g.moveTo(10.5, 6.5); g.quadraticCurveTo(14.8, 10.5, 12.6, 17.5); g.lineTo(11, 17); g.quadraticCurveTo(12.4, 11.5, 9.2, 7.2); g.closePath(); g.fill();
  },
  juggernaut: (g) => {
    g.beginPath(); g.moveTo(3, 21); g.lineTo(3, 10); g.quadraticCurveTo(3, 2, 12, 2); g.quadraticCurveTo(21, 2, 21, 10); g.lineTo(21, 21); g.closePath(); g.fill();
    cut(g, () => drawOps(g, [R(5, 10, 14, 2.6), R(10.8, 13.5, 2.4, 7)]));
  },
  greed: (g) => {
    for (let i = 0; i < 4; i++) drawOps(g, [E(9, 19.5 - i * 3.6, 7, 2.4), R(2, 16 - i * 3.6, 14, 3.5)]);
    drawOps(g, [C(17.5, 8.5, 5.4)]);
    cut(g, () => text(g, '$', 17.5, 9, 8));
  },
  // ---------------------------------------------------------------- synergies
  plasmaarc: (g) => { flame(g, 12, 23, 22, 9.5); cut(g, () => bolt(g, 4.5, 6, 0.65)); },
  napalm: (g) => {
    const pts = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 5.5 : 11; pts.push(12 + Math.cos(a) * r, 12 + Math.sin(a) * r); }
    drawOps(g, [P(...pts)]);
    cut(g, () => flame(g, 12, 17, 10, 4.6));
  },
  executioner: (g) => {
    skull(g, 12, 11, 8);
    drawOps(g, [L(12, 0, 12, 3.5, 1.3), L(0, 11, 3.5, 11, 1.3), L(20.5, 11, 24, 11, 1.3)]);
  },
  guardianangel: (g) => {
    drawOps(g, [E(12, 3.6, 5.5, 2.2)]);
    cut(g, () => drawOps(g, [E(12, 3.6, 3.8, 0.9)]));
    shield(g, 12, 7.5, 9, 14.5);
    wing(g, 7, 9, -1);
    wing(g, 17, 9, 1);
  },
  blackmarket: (g) => {
    drawOps(g, [P(12, 1.5, 22.5, 12, 12, 22.5, 1.5, 12)]);
    cut(g, () => text(g, '$', 12, 12.8, 13));
  },
  hitandrun: (g) => {
    drawOps(g, [P(9, 15, 21, 3, 22.5, 4.5, 10.5, 16.5), L(6, 15.5, 10.5, 20, 2.6), L(5, 18, 8.5, 21.5, 3)]);
    speedLines(g, 0.5, [6, 10, 14], 6, 1.4);
  },
  // ---------------------------------------------------------------- shared names (relics, power-ups, notices)
  heart: (g) => heart(g, 12, 12.5, 10.5),
  ironheart: (g) => { heart(g, 12, 12.5, 10.5); cut(g, () => drawOps(g, [R(2, 10.6, 20, 2.6)])); drawOps(g, [C(7.5, 11.9, 0.9), C(16.5, 11.9, 0.9)]); },
  eye: (g) => GLYPHS.deadeye(g),
  hunterseye: (g) => { GLYPHS.deadeye(g); drawOps(g, [P(1, 1, 7, 3.5, 3.5, 7)]); },
  cash: (g) => { drawOps(g, [R(1.5, 6, 21, 12)]); cut(g, () => { drawOps(g, [R(3, 7.5, 18, 9)]); }); drawOps(g, [C(12, 12, 3.6)]); cut(g, () => text(g, '$', 12, 12.4, 6.5)); },
  doublecash: (g) => { drawOps(g, [C(8.5, 12, 7), C(15.5, 12, 7)]); cut(g, () => { drawOps(g, [L(12, 5.5, 12, 18.5, 1.2)]); text(g, '$', 7.5, 12.6, 9); text(g, '$', 16.5, 12.6, 9); }); },
  skull: (g) => skull(g, 12, 11, 9.5),
  trophy: (g) => {
    drawOps(g, [P(6, 3, 18, 3, 17, 11, 7, 11), E(12, 11, 5, 4), R(10.8, 14, 2.4, 4), R(7, 18, 10, 3.5)]);
    g.lineWidth = 1.8; g.beginPath(); g.arc(6, 7, 3, Math.PI * 0.5, Math.PI * 1.5); g.stroke(); g.beginPath(); g.arc(18, 7, 3, -Math.PI * 0.5, Math.PI * 0.5); g.stroke();
  },
  star: (g) => {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 4.6 : 11; pts.push(12 + Math.cos(a) * r, 12.6 + Math.sin(a) * r); }
    drawOps(g, [P(...pts)]);
  },
};
// timed buffs drawn with their perk's glyph
GLYPHS.adrenalinerush = GLYPHS.adrenaline;
GLYPHS.hitandrunrush = GLYPHS.hitandrun;
GLYPHS.guarded = GLYPHS.guardianangel;

/** A glyph per tag (rows another module registers without an icon of their own). */
const TAG_GLYPH = {
  body: 'heart', guns: 'quickhands', aim: 'eye', money: 'cash', loot: 'scavenger', fire: 'pyromaniac', blast: 'demolitions', tesla: 'livewire',
  melee: 'butcher', speed: 'fleetfoot', medic: 'fieldmedic', pistol: 'gunslinger', shotgun: 'closequarters', smg: 'sprayandpray', rifle: 'discipline',
  sniper: 'steadyaim', mg: 'heavygunner', squad: 'rally', blood: 'bloodthirst', boss: 'giantslayer',
};

/** The glyph key for perk id (its row: icon, else the id, else its first tag's, else a star). */
export function glyphFor(id, row = null) {
  if (row?.icon && GLYPHS[row.icon]) return row.icon;
  if (GLYPHS[id]) return id;
  for (const t of row?.tags || []) if (TAG_GLYPH[t]) return TAG_GLYPH[t];
  return 'star';
}

const cache = new Map(); // ramp -> glyph -> px -> sprite (the HUD asks every frame: no keys built)
const sub = (m, k) => m.get(k) || (m.set(k, new Map()), m.get(k));
/** The glyph as a white sprite px pixels square (alpha = intensity; tint with icons.js tinted). Cached. */
export function perkIcon(key, px, ramp = RAMP_ICON) {
  px = Math.max(6, Math.round(px));
  const byPx = sub(sub(cache, ramp === RAMP_ICON ? '' : ramp.join(',')), key);
  let c = byPx.get(px);
  if (!c) {
    const draw = GLYPHS[key] || GLYPHS.star;
    c = rasterSprite(24, 24, px / 24, (g) => { g.lineCap = 'round'; draw(g); }, ramp);
    byPx.set(px, c);
  }
  return c;
}

/** Draw glyph key px square at (x, y) on a 2D context, coloured rgb. */
export function drawPerkIcon(ctx, key, x, y, px, rgb = [255, 255, 255], ramp = RAMP_ICON) {
  ctx.drawImage(tinted(perkIcon(key, px, ramp), rgb), Math.round(x), Math.round(y));
}

const urls = new Map();
/** The glyph coloured rgb as a PNG data URL px square (DOM menus: the scoreboard). Cached. */
export function perkIconURL(key, px, rgb) {
  const k = `${key}|${px}|${rgb.join(',')}`;
  let u = urls.get(k);
  if (!u) { u = tinted(perkIcon(key, px, [1, 0.8, 0.66]), rgb).toDataURL(); urls.set(k, u); }
  return u;
}
