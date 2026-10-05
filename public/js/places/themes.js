// Simple brick scenes used for place thumbnails and personal-place templates.
// The real 2008 places listed on the Games page are not available, so their
// thumbnails are approximate scenes suggested by each title (documented as
// reconstructions in docs/RESEARCH.md). The three personal-place templates
// are the 2008 "Reset Place" choices.
import * as THREE from 'three';
import { spawnLocation } from './common.js';

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];

function baseplate(w, color = 28, size = 512) {
  w.brick([size, 1.2, size], [0, -0.6, 0], color);
}

function house(w, x, z, wallColor = 5, roofColor = 21, s = 1) {
  w.brick([16 * s, 1.2, 16 * s], [x, 0.6, z], 194);
  w.brick([16 * s, 8, 1], [x, 5.2, z - 7.5 * s], wallColor);
  w.brick([16 * s, 8, 1], [x, 5.2, z + 7.5 * s], wallColor);
  w.brick([1, 8, 14 * s], [x - 7.5 * s, 5.2, z], wallColor);
  w.brick([1, 8, 14 * s], [x + 7.5 * s, 5.2, z], wallColor);
  w.brick([4, 5, 1.2], [x, 3.7, z - 7.6 * s], 192);
  w.brick([2.4, 2.4, 1.2], [x - 4.5 * s, 5.6, z - 7.6 * s], 45, { transparency: 0.3 });
  w.brick([2.4, 2.4, 1.2], [x + 4.5 * s, 5.6, z - 7.6 * s], 45, { transparency: 0.3 });
  w.brick([18 * s, 1, 9.5 * s], [x, 10.6, z - 3.6 * s], roofColor, { rotation: [25, 0, 0] });
  w.brick([18 * s, 1, 9.5 * s], [x, 10.6, z + 3.6 * s], roofColor, { rotation: [-25, 0, 0] });
}

function tree(w, x, z) {
  w.brick([2, 8, 2], [x, 4, z], 192);
  w.brick([8, 4, 8], [x, 9, z], 37);
  w.brick([5, 2, 5], [x, 12, z], 28);
}

function person(w, x, z, torso = 23) {
  w.brick([2, 2, 1], [x, 3, z], torso, { top: 'Smooth', bottom: 'Smooth' });
  w.brick([1, 2, 1], [x - 1.5, 3, z], 24, { top: 'Smooth', bottom: 'Smooth' });
  w.brick([1, 2, 1], [x + 1.5, 3, z], 24, { top: 'Smooth', bottom: 'Smooth' });
  w.brick([1, 2, 1], [x - 0.5, 1, z], 119, { top: 'Smooth', bottom: 'Smooth' });
  w.brick([1, 2, 1], [x + 0.5, 1, z], 119, { top: 'Smooth', bottom: 'Smooth' });
  w.add({ shape: 'Cylinder', size: [1.2, 1.2, 1.2], position: [x, 4.6, z], color: 24, rotation: [0, 0, 90] });
}

function water(w, size = 600, y = 0) {
  w.brick([size, 1, size], [0, y - 0.5, 0], 102, { top: 'Smooth', bottom: 'Smooth', transparency: 0.15 });
}

function ship(w, x, z, tilt = 0) {
  w.brick([14, 4, 40], [x, 2, z], 192, { rotation: [tilt, 0, 0] });
  w.brick([12, 1, 36], [x, 4.4, z], 5, { rotation: [tilt, 0, 0] });
  w.brick([8, 6, 10], [x, 8, z + 6], 1, { rotation: [tilt, 0, 0] });
  w.brick([2, 4, 2], [x, 13, z + 6], 21, { rotation: [tilt, 0, 0] });
  w.brick([1, 16, 1], [x, 12, z - 10], 192);
}

export const THEMES = {
  happyhome(w) {
    baseplate(w, 28);
    house(w, 0, 0, 5, 21);
    w.brick([4, 0.4, 30], [0, 0.2, -23], 1, { top: 'Smooth' });
    for (let i = 0; i < 14; i++) w.add({ size: [4, 1.2, 2], position: [14 + (i % 4) * 4.2, 0.6 + Math.floor(i / 4) * 1.2, -14], color: pick([21, 23, 24, 37, 1, 26]) });
    tree(w, -16, -12); tree(w, 18, 10);
    spawnLocation(w, 0, 1.2, -40, { yaw: Math.PI });
    return { cam: [34, 22, -46], look: [0, 4, 0] };
  },
  brickbattle(w) {
    baseplate(w, 28);
    for (const [x, z, c] of [[-40, -40, 21], [40, -40, 23], [-40, 40, 24], [40, 40, 37]]) {
      w.brick([16, 1.2, 16], [x, 0.6, z], c);
      w.brick([12, 20, 12], [x, 11, z], 194);
      w.brick([16, 1.2, 16], [x, 21.6, z], c);
      spawnLocation(w, x, 23.4, z, { color: c });
    }
    w.brick([80, 1.2, 4], [0, 21.6, -40], 199);
    return { cam: [90, 60, -90], look: [0, 6, 0] };
  },
  baseplate(w) {
    baseplate(w, 28);
    spawnLocation(w, 0, 1.2, 0);
    return { cam: [30, 20, -30], look: [0, 0, 0] };
  },
  ocean(w) {
    water(w);
    w.brick([30, 3, 30], [0, 1.5, 0], 5);
    w.brick([10, 8, 10], [0, 7, 0], 199);
    for (let i = 0; i < 5; i++) person(w, -8 + i * 4, 10, 37);
    for (let i = 0; i < 4; i++) w.brick([2, 3, 4], [-30 + i * 20, 1, 30 + i * 6], 199, { rotation: [0, 30, 20] });
    return { cam: [40, 24, -40], look: [0, 3, 0] };
  },
  virus(w) {
    baseplate(w, 199);
    for (let i = 0; i < 6; i++) w.brick([10, 14 + i * 3, 10], [-40 + i * 16, 7 + i * 1.5, 20], pick([194, 199, 1]));
    for (let i = 0; i < 6; i++) person(w, -10 + i * 4, -6 + (i % 2) * 4, i % 2 ? 37 : 23);
    w.brick([50, 1, 50], [0, 0.1, 0], 37, { transparency: 0.5, top: 'Smooth' });
    return { cam: [30, 18, -36], look: [0, 4, 6] };
  },
  tsunami(w) {
    baseplate(w, 5);
    for (let i = 0; i < 8; i++) w.add({ size: [4, 1.2, 2], position: [-8 + (i % 4) * 4.1, 0.6 + Math.floor(i / 4) * 1.2, 0], color: pick([21, 23, 24, 37]) });
    w.brick([12, 10, 1], [0, 5, -6], 199);
    w.brick([300, 30, 30], [0, 15, 90], 102, { transparency: 0.25, top: 'Smooth' });
    return { cam: [-30, 20, -40], look: [0, 6, 20] };
  },
  mansion(w) {
    baseplate(w, 141);
    w.setSkyColor(0x1b1b2b);
    house(w, 0, 0, 199, 26, 1.6);
    house(w, 0, 0, 199, 26, 1.0);
    tree(w, -24, -10); tree(w, 24, -14);
    return { cam: [36, 18, -48], look: [0, 6, 0] };
  },
  ship(w) {
    water(w);
    ship(w, 0, 0, 12);
    for (let i = 0; i < 3; i++) w.add({ shape: 'Wedge', size: [1, 3, 3], position: [-20 + i * 18, 1.5, -18 + i * 8], color: 199 });
    return { cam: [38, 20, -36], look: [0, 4, 0] };
  },
  rpg(w) {
    baseplate(w, 37);
    for (let i = 0; i < 3; i++) house(w, -30 + i * 30, 10, pick([5, 1, 194]), pick([21, 192, 23]), 0.8);
    w.brick([4, 0.4, 80], [0, 0.2, -10], 5, { rotation: [0, 90, 0] });
    tree(w, -40, -20); tree(w, 30, -24);
    return { cam: [0, 28, -50], look: [0, 4, 8] };
  },
  military(w) {
    baseplate(w, 141);
    for (let i = 0; i < 4; i++) w.brick([10, 4, 2], [-30 + i * 20, 2, -10 + (i % 2) * 20], 199);
    w.brick([12, 3, 18], [0, 1.5, 20], 141); w.brick([6, 3, 6], [0, 4.5, 18], 141); w.add({ shape: 'Cylinder', size: [10, 1, 1], position: [0, 4.5, 10], color: 199, rotation: [0, 90, 0] });
    for (let i = 0; i < 5; i++) person(w, -12 + i * 6, -16, 141);
    return { cam: [34, 20, -40], look: [0, 2, 4] };
  },
  house(w) { return THEMES.happyhome(w); },
  jail(w) {
    baseplate(w, 199);
    w.brick([40, 1, 40], [0, 0.5, 0], 194);
    for (let i = -18; i <= 18; i += 3) w.brick([0.5, 12, 0.5], [i, 6.5, -20], 26);
    w.brick([40, 1, 1], [0, 12.5, -20], 26);
    for (let i = 0; i < 6; i++) w.brick([4, 1, 4], [-15 + i * 6, 2 + i * 2, 6], pick([21, 23, 24]));
    w.brick([40, 1, 40], [0, 0.6, 30], 21, { top: 'Smooth' });
    return { cam: [30, 22, -40], look: [0, 4, 4] };
  },
  pit(w) {
    baseplate(w, 37);
    w.add({ shape: 'Cylinder', size: [1, 30, 30], position: [0, 0.2, 0], color: 26, rotation: [0, 0, 90] });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; w.brick([4, 6, 4], [Math.cos(a) * 20, 3, Math.sin(a) * 20], 5); }
    for (let i = 0; i < 4; i++) person(w, -6 + i * 4, -22, i % 2 ? 21 : 23);
    return { cam: [0, 30, -40], look: [0, 0, 0] };
  },
  laser(w) {
    w.setSkyColor(0x101020);
    w.brick([20, 1, 120], [0, 0.5, 0], 26);
    for (let i = 0; i < 10; i++) w.brick([18, 0.4, 0.4], [0, 2 + (i % 3) * 2, -50 + i * 11], 21, { material: 'Neon' });
    for (let i = 0; i < 6; i++) w.brick([4, 1, 4], [(i % 2 ? 5 : -5), 1 + i, -40 + i * 15], 102);
    return { cam: [16, 14, -64], look: [0, 2, -10] };
  },
  base(w) {
    baseplate(w, 5);
    w.brick([60, 1, 60], [0, 0.5, 0], 199);
    w.brick([30, 12, 20], [0, 7, 10], 194); w.brick([10, 6, 10], [20, 4, -15], 199);
    w.add({ shape: 'Ball', size: [12, 12, 12], position: [-20, 7, -10], color: 1 });
    for (let i = 0; i < 4; i++) person(w, -8 + i * 5, -20, 37);
    return { cam: [44, 26, -46], look: [0, 4, 0] };
  },
  ramp(w) {
    baseplate(w, 28);
    for (let i = 0; i < 20; i++) w.brick([12, 1, 8], [0, 10 + i * 4, -60 + i * 7], pick([21, 23, 24, 37, 106]));
    w.brick([12, 1, 30], [0, 90, 82], 24);
    return { cam: [60, 60, -80], look: [0, 40, 0] };
  },
  hotel(w) {
    baseplate(w, 28);
    w.brick([40, 40, 20], [0, 20, 20], 1);
    for (let y = 6; y < 38; y += 8) for (let x = -15; x <= 15; x += 6) w.brick([3, 3, 0.4], [x, y, 9.9], 45);
    w.brick([8, 6, 0.4], [0, 3, 9.9], 192);
    tree(w, -26, 0); tree(w, 26, 0);
    return { cam: [30, 24, -40], look: [0, 16, 10] };
  },
  space(w) {
    w.setSkyColor(0x050510);
    w.brick([120, 1.2, 120], [0, -0.6, 0], 199);
    w.brick([20, 4, 30], [0, 6, 0], 194); w.brick([4, 4, 12], [-12, 6, -2], 199); w.brick([4, 4, 12], [12, 6, -2], 199);
    for (let i = 0; i < 6; i++) person(w, -15 + i * 6, -20, i % 2 ? 1 : 194);
    return { cam: [36, 22, -46], look: [0, 5, 0] };
  },
  arena(w) {
    baseplate(w, 5);
    w.add({ shape: 'Cylinder', size: [2, 60, 60], position: [0, 1, 0], color: 194, rotation: [0, 0, 90] });
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; w.brick([6, 10, 2], [Math.cos(a) * 30, 6, Math.sin(a) * 30], 199, { rotation: [0, -a * 57.3 + 90, 0] }); }
    for (let i = 0; i < 4; i++) person(w, -6 + i * 4, 0, pick([21, 23]));
    return { cam: [0, 40, -50], look: [0, 0, 0] };
  },
  armor(w) {
    baseplate(w, 194);
    for (let i = 0; i < 5; i++) w.brick([6, 3, 3], [-14 + i * 7, 1.5, 8], pick([199, 26, 21]));
    for (let i = 0; i < 4; i++) person(w, -9 + i * 6, -6, pick([199, 26]));
    w.brick([40, 10, 1], [0, 5, 14], 192);
    return { cam: [20, 14, -26], look: [0, 3, 4] };
  },
  wall(w) {
    baseplate(w, 37);
    for (let y = 0; y < 8; y++) for (let x = -6; x <= 6; x++) w.add({ size: [4, 1.2, 2], position: [x * 4.1 + (y % 2) * 2, 0.6 + y * 1.2, 0], color: pick([21, 192, 5]) });
    w.brick([20, 1.2, 20], [0, 0.6, 30], 24);
    for (let i = 0; i < 4; i++) person(w, -6 + i * 4, -12, 23);
    return { cam: [28, 16, -34], look: [0, 4, 4] };
  },
  ctf(w) {
    baseplate(w, 28);
    w.brick([20, 10, 20], [0, 5, -60], 21); w.brick([20, 10, 20], [0, 5, 60], 23);
    w.brick([0.6, 10, 0.6], [0, 15, -60], 199); w.brick([0.2, 3, 4], [0, 18, -58], 21);
    w.brick([0.6, 10, 0.6], [0, 15, 60], 199); w.brick([0.2, 3, 4], [0, 18, 62], 23);
    return { cam: [60, 40, -80], look: [0, 0, 0] };
  },
  lava(w) {
    w.brick([512, 1.2, 512], [0, -0.6, 0], 21, { top: 'Smooth' });
    for (let i = 0; i < 9; i++) w.brick([4, 1.2, 4], [(i % 2 ? 4 : -4), 0.6 + i * 0.6, -40 + i * 10], 194);
    w.brick([12, 1.2, 12], [0, 0.6, -56], 194);
    return { cam: [26, 22, -66], look: [0, 2, -20] };
  },
};

export function buildTheme(world, theme, name = '') {
  seed = 1;
  for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  if (seed <= 0) seed = 7;
  const fn = THEMES[theme] || THEMES.baseplate;
  return fn(world) || { cam: [30, 20, -30], look: [0, 0, 0] };
}
