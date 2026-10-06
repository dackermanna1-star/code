// Puts the Mega Obby together: the 32 stages chained into a spiral that
// winds up round the Mega Tower, a checkpoint pad at the start of each
// one, scenery for each zone (floating islands, volcanoes, a neon skyline,
// icebergs, planets), the sea far below, and the winners' platform on top.
import * as THREE from 'three';
import { Kit, V, rect } from './kit.js';
import { STAGES, ZONES } from './stages.js';

const lerp = (a, b, t) => a + (b - a) * t;
const DECO = { noPhysics: true, top: 'Smooth', bottom: 'Smooth' };

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** A canvas sign texture (text on a coloured board). */
const texCache = new Map();
export function boardTex(text, bg, fg, w = 512, h = 192, border = 'rgba(255,255,255,0.8)') {
  const key = [text, bg, fg, w, h].join('|');
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.strokeStyle = border; x.lineWidth = Math.max(6, h * 0.05); x.strokeRect(x.lineWidth, x.lineWidth, w - x.lineWidth * 2, h - x.lineWidth * 2);
  const lines = String(text).split('\n');
  let fs = h * 0.62 / lines.length;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const font = () => { x.font = `bold ${fs}px "Arial Black", Arial, sans-serif`; };
  font();
  while (fs > 10 && Math.max(...lines.map((l) => x.measureText(l).width)) > w * 0.86) { fs -= 2; font(); }
  lines.forEach((l, i) => {
    const y = h / 2 + (i - (lines.length - 1) / 2) * fs * 1.1;
    x.lineWidth = fs * 0.14; x.strokeStyle = 'rgba(0,0,0,0.6)'; x.strokeText(l, w / 2, y);
    x.fillStyle = fg; x.fillText(l, w / 2, y);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

// --- checkpoints ----------------------------------------------------------------------------------------------------
function checkpoint(k, stage, C) {
  const z = ZONES[stage.zone];
  // a round pad (the course turns at each checkpoint, and a square one's corners would stick out over the stages)
  k.box(0, -0.6, 0, 1.2, 10.8, 10.8, z.pad, { shape: 'Cylinder', rotation: [0, 0, 90] });
  k.box(0, -0.68, 0, 1.2, 11.3, 11.3, z.trim, { shape: 'Cylinder', rotation: [0, 0, 90], material: 'Neon', noPhysics: true });
  k.box(0, 0.05, 0, 0.1, 3.4, 3.4, z.trim, { material: 'Neon', top: 'Smooth', shape: 'Cylinder', rotation: [0, 0, 90], noPhysics: true });
  // the flag (it turns green when you've got this checkpoint) and the number
  k.box(-3.5, 4, 3.5, 0.4, 8, 0.4, 1, { top: 'Smooth', noPhysics: true });
  const flag = k.dp({ size: [0.2, 2.4, 3.4], position: [-3.5, 6.6, 1.7], color: z.flag, noPhysics: true, top: 'Smooth', bottom: 'Smooth' });
  // the sign, at the front corner (facing you as you arrive, and from the spawn)
  const sign = k.dp({ size: [4.2, 1.7, 0.3], position: [3.3, 6.3, -3.4], color: 26, noPhysics: true, top: 'Smooth', bottom: 'Smooth' });
  sign.addDecal('Back', boardTex(`STAGE ${stage.n}\n${stage.name}`, '#151a22', z.color, 512, 205, z.color));
  for (const s of [-1, 1]) k.box(3.3 + s * 1.8, 2.75, -3.4, 0.3, 5.5, 0.3, 26, { noPhysics: true });
  const trig = k.dp({ size: [9.5, 5, 9.5], position: [0, 2.5, 0], transparency: 1, canCollide: false, name: 'Checkpoint' });
  trig.onTouched((ch) => C.reach?.(ch, stage.index));
  stage.flag = flag;
  stage.spawn = { at: k.W(0, 0.05, 0.8), yaw: k.yaw };
}

// --- scenery ------------------------------------------------------------------------------------------------------------
function scenery(k, stage, len, R) {
  const zone = ZONES[stage.zone].id;
  const rand = rng(stage.n * 977 + 13);
  const r = (a, b) => a + rand() * (b - a);
  const box = (x, y, z, sx, sy, sz, color, o = {}) => k.sp({ size: [sx, sy, sz], position: [x, y, z], color, ...DECO, ...o });
  const ball = (x, y, z, d, color, o = {}) => k.sp({ shape: 'Ball', size: [d, d, d], position: [x, y, z], color, ...DECO, ...o });
  // spots either side of the path (further out on the outside; local +x is toward the tower)
  const spots = [];
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    const out = side > 0 ? r(22, 34) : r(26, 60);
    spots.push([side * out, r(-22, 10), -r(0, len)]);
  }
  for (const [x, y, z] of spots) {
    // (not inside the Mega Tower)
    const w = k.W(x, y, z);
    if (Math.hypot(w.x, w.z) < 40) continue;
    if (zone === 'meadow') {
      const s = r(8, 15), c = [37, 119, 28][Math.floor(r(0, 3))];
      box(x, y, z, s, 2, s, c, { top: 'Studs' });
      for (let j = 1; j <= 3; j++) box(x, y - 1 - j * 1.8, z, s * (1 - j * 0.24), 1.8, s * (1 - j * 0.24), j % 2 ? 192 : 217);
      box(x + r(-1, 1), y + 3.5, z + r(-1, 1), 1, 5, 1, 217); ball(x, y + 7.5, z, r(5, 7), 28);
      for (let j = 0; j < 4; j++) ball(x + r(-s / 2.5, s / 2.5), y + 1.3, z + r(-s / 2.5, s / 2.5), 0.9, [21, 24, 1, 22][j]);
      // a cloud drifting below
      if (rand() < 0.6) for (let j = 0; j < 4; j++) ball(x + r(-12, 12), r(-36, -26), z + r(-12, 12), r(9, 15), 1, { transparency: 0.35, material: 'Neon' });
    } else if (zone === 'volcano') {
      const h = r(14, 30);
      for (let j = 0; j < 4; j++) box(x + r(-1, 1), y - 10 + j * h / 4, z + r(-1, 1), (4 - j) * 2.5, h / 4 + 1, (4 - j) * 2.4, j % 2 ? 199 : 26, { rotation: [0, r(0, 90), 0] });
      box(x, y - 10 + h + 0.5, z, 3.5, 1, 3.4, 106, { material: 'Neon' });
      if (rand() < 0.7) box(x + r(3, 5), y - 6 + h / 2, z, 1.2, h, 1.2, 106, { material: 'Neon', transparency: 0.1 });
      box(x + r(-8, 8), y - 18, z + r(-8, 8), r(8, 14), 1, r(8, 14), 106, { material: 'Neon' });
    } else if (zone === 'neon') {
      // the city is below you: towers whose roofs stay under the course
      const top = r(-24, -10), y0 = -90, h = top - y0, w = r(8, 14), xx = Math.sign(x) * (26 + Math.abs(x));
      box(xx, y0 + h / 2, z, w, h, w, [26, 149, 199][Math.floor(r(0, 3))]);
      const col = [104, 107, 22, 23][Math.floor(r(0, 4))];
      for (let yy = 4; yy < h - 2; yy += 6) box(xx, y0 + yy, z, w + 0.2, 0.5, w + 0.2, col, { material: 'Neon' });
      box(xx, top + 3, z, 0.5, 6, 0.5, 194); ball(xx, top + 6.5, z, 1.2, 21, { material: 'Neon' });
    } else if (zone === 'frozen') {
      const s = r(10, 18);
      box(x, y - 4, z, s, 8, s * 0.8, 1, { rotation: [0, r(0, 90), r(-8, 8)] });
      box(x, y - 10, z, s * 0.8, 6, s * 0.6, 45, { rotation: [0, r(0, 90), 0], transparency: 0.2 });
      for (let j = 0; j < 3; j++) {
        const px = x + r(-s / 3, s / 3), pz = z + r(-s / 3, s / 3);
        box(px, y + 1.5, pz, 0.8, 3, 0.8, 217);
        for (let q = 0; q < 3; q++) box(px, y + 3 + q * 1.6, pz, 4 - q * 1.2, 1.6, 4 - q * 1.2, q === 2 ? 1 : 141, { rotation: [0, q * 45, 0] });
      }
      k.sp({ shape: 'Wedge', size: [2, 6, 2], position: [x + r(-4, 4), y + 3, z + r(-4, 4)], color: 45, ...DECO, transparency: 0.3 });
    } else {
      const d = r(12, 34);
      ball(x * 1.6, y + r(-10, 30), z, d, [104, 110, 23, 106, 24][Math.floor(r(0, 5))], { material: rand() < 0.4 ? 'Neon' : 'Plastic' });
      if (rand() < 0.5) k.sp({ shape: 'Cylinder', size: [0.6, d * 1.8, d * 1.8], position: [x * 1.6, y + 10, z], rotation: [r(-30, 30), 0, 90 + r(-30, 30)], color: 1, transparency: 0.5, ...DECO });
      // a few asteroids drifting below, and stars
      for (let j = 0; j < 3; j++) ball(x * 1.4 + r(-10, 10), r(-30, -10), z + r(-12, 12), r(2, 5), [199, 25, 194][j]);
      for (let j = 0; j < 4; j++) ball(x * 1.6 + r(-30, 30), r(15, 60), z + r(-30, 30), r(0.6, 1.4), 1, { material: 'Neon' });
    }
  }
  void R;
}

/** The Mega Tower in the middle of the spiral: bands in each zone's colours, a trophy on top. */
function megaTower(world, st, top) {
  const add = (o) => st.add({ ...DECO, ...o });
  const bands = [[37, 24], [199, 106], [26, 104], [1, 45], [149, 110]];
  const y0 = -70, h = top - y0;
  for (let i = 0; i < 25; i++) {
    const y = y0 + (i + 0.5) * h / 25, b = bands[Math.min(4, Math.floor(i / 5))];
    add({ size: [26, h / 25, 26], position: [0, y, 0], rotation: [0, i * 9, 0], color: b[0] });
    add({ size: [26.6, 1, 26.6], position: [0, y + h / 50, 0], rotation: [0, i * 9, 0], color: b[1], material: 'Neon' });
  }
  // the giant trophy
  add({ shape: 'Cylinder', size: [4, 18, 18], position: [0, top + 2, 0], rotation: [0, 0, 90], color: 26 });
  add({ shape: 'Cylinder', size: [10, 4, 4], position: [0, top + 9, 0], rotation: [0, 0, 90], color: 24, reflectance: 0.4 });
  add({ shape: 'Ball', size: [20, 20, 20], position: [0, top + 22, 0], color: 24, reflectance: 0.4 });
  add({ shape: 'Cylinder', size: [10, 20, 20], position: [0, top + 27, 0], rotation: [0, 0, 90], color: 24, reflectance: 0.4 });
  for (const s of [-1, 1]) add({ shape: 'Cylinder', size: [1.6, 10, 10], position: [s * 11, top + 24, 0], rotation: [0, 0, 0], color: 24, reflectance: 0.4 });
  add({ shape: 'Ball', size: [6, 6, 6], position: [0, top + 36, 0], color: 24, material: 'Neon' });
}

export function buildCourse(world, st, C) {
  const k = new Kit(world, st);
  const stages = [];
  const R0 = 240, R1 = 95;
  let O = V(R0, 40, 0), yaw = Math.PI;
  STAGES.forEach((def, i) => {
    const stage = { n: i + 1, index: i, name: def.name, zone: def.zone, route: [] };
    k.begin(stage, O, yaw);
    checkpoint(k, stage, C);
    const end = def.build(k, C);
    const len = end ? Math.abs(end.z) : 30;
    scenery(k, stage, len, R0);
    stage.F = k.frame();
    stages.push(stage);
    if (end) {
      stage.end = k.W(end.x, end.y, end.z);
      const R = lerp(R0, R1, (i + 1) / (STAGES.length - 1));
      O = stage.end; yaw -= len / R;
    } else {
      // the top of the final stage: the winners' platform
      stage.end = k.W(0, 35.4, -26.5);
      finish(k, stage, C);
    }
  });
  const top = stages[stages.length - 1].end.y;
  megaTower(world, st, top + 25);
  // the sea far below, and a layer of cloud
  world.add({ name: 'Sea', size: [8000, 2, 8000], position: [0, -62, 0], color: 23, top: 'Smooth', noPhysics: true, reflectance: 0.2 });
  const rand = rng(7);
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, d = 120 + rand() * 600;
    st.add({ shape: 'Ball', size: [40, 40, 40].map((v) => v * (0.5 + rand())), position: [Math.cos(a) * d, -40 + rand() * 12, Math.sin(a) * d], color: 1, transparency: 0.3, material: 'Neon', ...DECO });
  }
  return { stages, kit: k, warnings: k.warnings };
}

function finish(k, stage, C) {
  const top = 35.4, cz = -26.5;
  k.plat(0, top, cz, 11, 11, 24, { reflectance: 0.3, top: 'Smooth' });
  for (const [x, z, sx, sz] of [[0, cz - 5.4, 11, 0.4], [0, cz + 5.4, 11, 0.4], [-5.4, cz, 0.4, 10.4], [5.4, cz, 0.4, 10.4]]) k.box(x, top + 0.1, z, sx, 0.2, sz, 24, { material: 'Neon' });
  const trig = k.dp({ size: [9, 6, 9], position: [0, top + 3, cz], transparency: 1, canCollide: false, name: 'Finish' });
  trig.onTouched((ch) => C.win?.(ch));
  // a trophy, a sign, and a pad back to the start
  k.box(0, top + 1, cz - 3.5, 2.4, 2, 2.4, 26, { shape: 'Cylinder', rotation: [0, 0, 90] });
  k.box(0, top + 3, cz - 3.5, 2, 0.8, 0.8, 24, { shape: 'Cylinder', rotation: [0, 0, 90], reflectance: 0.4 });
  k.box(0, top + 5, cz - 3.5, 3.6, 3.6, 3.6, 24, { shape: 'Ball', reflectance: 0.4 });
  for (const s of [-1, 1]) k.box(s * 2, top + 5.5, cz - 3.5, 0.4, 1.6, 1.6, 24, { shape: 'Cylinder', rotation: [0, 90, 0] });
  const sign = k.dp({ size: [10, 3, 0.3], position: [0, top + 10, cz - 5.2], color: 26, noPhysics: true });
  sign.addDecal('Back', boardTex('YOU BEAT THE\nMEGA OBBY!', '#1b1407', '#ffd84a', 512, 154, '#ffd84a'));
  const back = k.dp({ size: [3, 0.3, 3], position: [3.5, top + 0.15, cz + 3], color: 107, material: 'Neon', name: 'Restart' });
  back.onTouched((ch) => C.restart?.(ch));
  const bs = k.dp({ size: [4, 1.4, 0.2], position: [3.5, top + 2.2, cz + 4.4], color: 26, noPhysics: true });
  bs.addDecal('Back', boardTex('PLAY AGAIN', '#062a2a', '#3affe0', 512, 180, '#3affe0'));
  stage.finishAt = k.W(0, top, cz);
  stage.restartAt = k.W(3.5, top, cz + 3);
  stage.route.push({ type: 'win' });
}
