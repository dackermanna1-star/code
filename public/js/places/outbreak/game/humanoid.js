// People: the infected, the bandits, and you (when you look over your
// shoulder). Blocky figures - head, torso, two arms, two legs - drawn as six
// instanced meshes, so a crowd costs six draw calls. What each one wears
// (and what's left of their face) is a cell in one big painted picture, the
// outfit atlas. Poses are worked out each frame from a few numbers - walk
// phase, lean, arms raised, crouching, falling dead - and turned into a
// matrix per limb. Bullets test against each limb's box, so a headshot is a
// headshot.
import * as THREE from 'three';
import { rng } from '../noise.js';

const CELL = 256, COLS = 8, ROWS = 4, AW = CELL * COLS, AH = CELL * ROWS;
export const OUTFITS = {}; // name -> cell index
const _cells = [];

// --- the outfit atlas ------------------------------------------------------------------------------------------------------
// regions inside a cell: [x, y, w, h] in pixels
const R = {
  head: { front: [0, 0, 64, 64], side: [64, 0, 64, 64], back: [128, 0, 64, 64], top: [192, 0, 64, 64] },
  torso: { front: [0, 64, 64, 64], back: [64, 64, 64, 64], side: [128, 64, 32, 64], top: [160, 64, 64, 32] },
  arm: { front: [0, 128, 32, 64], side: [32, 128, 32, 64], back: [64, 128, 32, 64], top: [96, 128, 32, 32] },
  leg: { front: [128, 128, 32, 64], side: [160, 128, 32, 64], back: [192, 128, 32, 64], top: [224, 128, 32, 32] },
};

function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }

/**
 * Paint an outfit into cell i. o: { skin, shirt, pants, shoes, face: 'human' | 'zombie' | 'mask', pattern: 'camo' | 'stripes' | 'police' | 'coat' | 'vest',
 * blood (0..1), sleeves: 'short' | 'long', hair, seed }
 */
function paint(g, i, o) {
  const ox = (i % COLS) * CELL, oy = Math.floor(i / COLS) * CELL;
  const r = rng(o.seed ?? i * 31 + 7);
  const rect = (reg, col) => { g.fillStyle = col; g.fillRect(ox + reg[0], oy + reg[1], reg[2], reg[3]); };
  const noiseOver = (reg, a = 0.12) => { for (let k = 0; k < reg[2] * reg[3] / 6; k++) { g.fillStyle = `rgba(0,0,0,${r() * a})`; g.fillRect(ox + reg[0] + r() * reg[2], oy + reg[1] + r() * reg[3], 2, 2); } };
  const camo = (reg) => { const cols = ['#4a5a32', '#6a6a42', '#3a3a2a', '#5a4a32']; for (let k = 0; k < 18; k++) { g.fillStyle = cols[k % 4]; g.beginPath(); g.ellipse(ox + reg[0] + r() * reg[2], oy + reg[1] + r() * reg[3], 3 + r() * 7, 2 + r() * 4, r() * 3, 0, 7); g.fill(); } };
  const blood = (reg, amt) => { for (let k = 0; k < amt * 10; k++) { g.fillStyle = `rgba(${90 + r() * 50},${8 + r() * 10},${6},${0.5 + r() * 0.4})`; g.beginPath(); g.ellipse(ox + reg[0] + r() * reg[2], oy + reg[1] + r() * reg[3] * 0.8, 1 + r() * 6 * amt, 1 + r() * 9 * amt, r() * 3, 0, 7); g.fill(); } };
  const skin = o.skin, shirt = o.shirt, pants = o.pants, shoes = o.shoes || '#2a2420';
  // head
  for (const k of ['front', 'side', 'back', 'top']) rect(R.head[k], skin);
  const hair = o.hair;
  if (hair) { rect([R.head.top[0], R.head.top[1], 64, 64], hair); rect([R.head.back[0], R.head.back[1], 64, 40], hair); rect([R.head.side[0], R.head.side[1], 64, 18], hair); rect([R.head.front[0], R.head.front[1], 64, 10], hair); }
  const F = R.head.front, fx = ox + F[0], fy = oy + F[1];
  if (o.face === 'mask') {
    rect(R.head.front, o.maskCol || '#1e1e1e'); rect(R.head.side, o.maskCol || '#1e1e1e'); rect(R.head.back, o.maskCol || '#1e1e1e'); rect(R.head.top, o.maskCol || '#1e1e1e');
    g.fillStyle = skin; g.fillRect(fx + 10, fy + 22, 44, 12);
    g.fillStyle = '#141414'; g.fillRect(fx + 16, fy + 25, 10, 6); g.fillRect(fx + 38, fy + 25, 10, 6);
  } else if (o.face === 'zombie') {
    // grey skin, dark sunken eyes, a torn mouth
    noiseOver(R.head.front, 0.25); noiseOver(R.head.side, 0.2);
    g.fillStyle = 'rgba(40,10,10,0.55)'; g.beginPath(); g.ellipse(fx + 20, fy + 27, 8, 6, 0, 0, 7); g.ellipse(fx + 44, fy + 27, 8, 6, 0, 0, 7); g.fill();
    g.fillStyle = r() < 0.5 ? '#d8d0a8' : '#c82a20'; g.fillRect(fx + 18, fy + 25, 4, 3); g.fillRect(fx + 42, fy + 25, 4, 3);
    g.fillStyle = '#1a0606'; g.beginPath(); g.ellipse(fx + 32, fy + 47, 12, 6 + r() * 4, 0, 0, 7); g.fill();
    g.fillStyle = '#d8d0b0'; for (let k = 0; k < 5; k++) g.fillRect(fx + 23 + k * 4, fy + 43, 2, 3);
    g.fillStyle = 'rgba(110,10,8,0.85)'; for (let k = 0; k < 4; k++) g.fillRect(fx + 22 + r() * 20, fy + 50, 2 + r() * 3, 6 + r() * 12);
    blood(R.head.side, 0.6);
  } else {
    g.fillStyle = '#ffffff'; g.fillRect(fx + 16, fy + 24, 10, 7); g.fillRect(fx + 38, fy + 24, 10, 7);
    g.fillStyle = '#2a2018'; g.fillRect(fx + 19, fy + 25, 5, 6); g.fillRect(fx + 41, fy + 25, 5, 6);
    g.fillStyle = shade(hair || '#3a2a1a', 0.9); g.fillRect(fx + 14, fy + 19, 13, 3); g.fillRect(fx + 37, fy + 19, 13, 3);
    g.fillStyle = shade(skin, 0.8); g.fillRect(fx + 29, fy + 32, 6, 8);
    g.fillStyle = '#6a2a24'; g.fillRect(fx + 24, fy + 46, 16, 3);
    if (o.beard) { g.fillStyle = shade(hair || '#3a2a1a', 0.9); g.fillRect(fx + 12, fy + 42, 40, 18); g.fillStyle = '#6a2a24'; g.fillRect(fx + 24, fy + 46, 16, 3); }
  }
  // torso
  for (const k of ['front', 'back', 'side', 'top']) rect(R.torso[k], shirt);
  if (o.pattern === 'camo') for (const k of ['front', 'back', 'side']) camo(R.torso[k]);
  if (o.pattern === 'stripes') for (const k of ['front', 'back']) { const T = R.torso[k]; g.fillStyle = shade(shirt, 1.35); for (let y = 0; y < 64; y += 10) g.fillRect(ox + T[0], oy + T[1] + y, 64, 4); }
  const TF = R.torso.front, tx = ox + TF[0], ty = oy + TF[1];
  if (o.pattern === 'police') { g.fillStyle = '#d8c060'; g.fillRect(tx + 40, ty + 14, 8, 10); g.fillStyle = '#e8e8e8'; g.fillRect(tx + 8, ty + 14, 14, 4); }
  if (o.pattern === 'coat') { g.fillStyle = shade(shirt, 0.8); g.fillRect(tx + 31, ty, 2, 64); g.fillStyle = '#c83a2a'; g.fillRect(tx + 8, ty + 14, 8, 8); }
  if (o.pattern === 'vest') { g.fillStyle = o.vestCol || '#3a3a2a'; g.fillRect(tx + 6, ty + 6, 52, 50); g.fillStyle = shade(o.vestCol || '#3a3a2a', 0.75); for (let k = 0; k < 3; k++) g.fillRect(tx + 10 + k * 16, ty + 34, 12, 16); const B = R.torso.back; g.fillStyle = o.vestCol || '#3a3a2a'; g.fillRect(ox + B[0] + 6, oy + B[1] + 6, 52, 50); }
  if (o.pattern === 'tracksuit') { g.fillStyle = '#e8e8e8'; for (const k of ['side']) { const S = R.torso[k]; g.fillRect(ox + S[0] + 12, oy + S[1], 3, 64); g.fillRect(ox + S[0] + 18, oy + S[1], 3, 64); } }
  if (o.pack) { const B = R.torso.back; g.fillStyle = o.pack; g.fillRect(ox + B[0] + 10, oy + B[1] + 8, 44, 44); g.fillStyle = shade(o.pack, 0.7); g.fillRect(ox + B[0] + 14, oy + B[1] + 30, 36, 16); }
  // collar and belt
  g.fillStyle = shade(shirt, 0.7); g.fillRect(tx + 20, ty, 24, 5);
  g.fillStyle = '#2a2018'; g.fillRect(tx, ty + 58, 64, 6);
  noiseOver(R.torso.front, 0.08); noiseOver(R.torso.back, 0.08);
  // arms: sleeves (short ones show skin), hands
  for (const k of ['front', 'side', 'back', 'top']) rect(R.arm[k], shirt);
  for (const k of ['front', 'side', 'back']) {
    const A = R.arm[k];
    if (o.pattern === 'camo') camo(A);
    if (o.sleeves === 'short') { g.fillStyle = skin; g.fillRect(ox + A[0], oy + A[1] + 22, 32, 42); }
    else { g.fillStyle = skin; g.fillRect(ox + A[0], oy + A[1] + 54, 32, 10); }
    if (o.gloves) { g.fillStyle = o.gloves; g.fillRect(ox + A[0], oy + A[1] + 52, 32, 12); }
    if (o.pattern === 'tracksuit') { g.fillStyle = '#e8e8e8'; g.fillRect(ox + A[0] + 12, oy + A[1], 3, 52); g.fillRect(ox + A[0] + 18, oy + A[1], 3, 52); }
  }
  // legs: trousers, shoes
  for (const k of ['front', 'side', 'back', 'top']) rect(R.leg[k], pants);
  for (const k of ['front', 'side', 'back']) {
    const L = R.leg[k];
    if (o.pantsPattern === 'camo') camo(L);
    g.fillStyle = shoes; g.fillRect(ox + L[0], oy + L[1] + 54, 32, 10);
    noiseOver(L, 0.1);
  }
  // tears and blood
  if (o.blood) {
    blood(R.torso.front, o.blood); blood(R.torso.back, o.blood * 0.6); blood(R.arm.front, o.blood * 0.7); blood(R.leg.front, o.blood * 0.5);
    if (o.face === 'zombie') for (let k = 0; k < 4; k++) { g.fillStyle = skin; g.beginPath(); g.ellipse(tx + r() * 64, ty + r() * 50, 3 + r() * 6, 2 + r() * 5, r() * 3, 0, 7); g.fill(); g.fillStyle = 'rgba(80,6,6,0.8)'; g.beginPath(); g.ellipse(tx + r() * 64, ty + r() * 50, 1 + r() * 3, 1 + r() * 3, 0, 0, 7); g.fill(); }
  }
}

let atlas = null;
function buildAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas'); c.width = AW; c.height = AH;
  const g = c.getContext('2d');
  const r = rng(404);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const SKIN = ['#e8c4a0', '#d8a882', '#c89070', '#f0d0b0', '#b8805a'];
  const ZSKIN = ['#a8a890', '#98a088', '#b0a898', '#8a9478', '#a89a88'];
  const HAIR = ['#2a2018', '#4a3020', '#6a5030', '#1a1a1a', '#8a7a60', '#b8b0a0'];
  const SHIRT = ['#3a5a8a', '#8a2a2a', '#d8d0b8', '#4a6a3a', '#5a5a62', '#2a2a2a', '#b88a3a', '#6a3a5a', '#2a3a8a'];
  const PANTS = ['#3a4a6a', '#2a2a2a', '#5a5a4a', '#4a3a2a', '#2a3a8a'];
  let i = 0;
  const add = (name, o) => { OUTFITS[name] = i; _cells.push(o); paint(g, i++, { seed: i * 13 + 1, ...o }); };
  add('player', { skin: '#e0b896', shirt: '#d8d0b8', pants: '#3a4a6a', hair: '#3a2a1a', face: 'human', sleeves: 'short' });
  for (let k = 0; k < 11; k++) {
    const kind = k < 6 ? 'civ' : k === 6 ? 'police' : k === 7 ? 'soldier' : k === 8 ? 'doctor' : k === 9 ? 'worker' : 'tracksuit';
    const o = { skin: pick(ZSKIN), hair: r() < 0.8 ? pick(HAIR) : null, face: 'zombie', blood: 0.4 + r() * 0.6 };
    if (kind === 'civ') Object.assign(o, { shirt: pick(SHIRT), pants: pick(PANTS), sleeves: r() < 0.5 ? 'short' : 'long', pattern: r() < 0.25 ? 'stripes' : null });
    if (kind === 'police') Object.assign(o, { shirt: '#2a3a5a', pants: '#1e2a40', pattern: 'police' });
    if (kind === 'soldier') Object.assign(o, { shirt: '#5a6a3a', pants: '#5a6a3a', pattern: 'camo', pantsPattern: 'camo', shoes: '#1e1a14' });
    if (kind === 'doctor') Object.assign(o, { shirt: '#e8ece8', pants: '#8aa8a0', pattern: 'coat' });
    if (kind === 'worker') Object.assign(o, { shirt: '#d86a20', pants: '#2a3a5a', sleeves: 'long' });
    if (kind === 'tracksuit') Object.assign(o, { shirt: '#2a3a8a', pants: '#2a3a8a', pattern: 'tracksuit' });
    add('z' + k, { ...o, zkind: kind });
  }
  for (let k = 0; k < 6; k++) {
    const camoK = k % 3 === 0;
    add('b' + k, { skin: pick(SKIN), hair: pick(HAIR), face: k % 2 ? 'mask' : 'human', maskCol: pick(['#1e1e1e', '#3a4a2a', '#4a3a2a']), beard: r() < 0.5, shirt: camoK ? '#5a6a3a' : pick(['#2a2a2a', '#3a3a32', '#4a3a2a', '#2a3a2a']), pattern: camoK ? 'camo' : 'vest', vestCol: pick(['#3a3a2a', '#2a2a2a', '#4a4a3a']), pants: camoK ? '#5a6a3a' : pick(['#2a2a2a', '#3a3a2a', '#3a4a6a']), pantsPattern: camoK ? 'camo' : null, sleeves: 'long', gloves: '#1e1e1e', pack: r() < 0.6 ? pick(['#4a5a3a', '#5a4a3a']) : null, blood: r() < 0.3 ? 0.2 : 0 });
  }
  // your bodies from earlier lives, each in what it died in
  for (let k = 0; k < 3; k++) add('pc' + k, { skin: '#e0b896', shirt: '#d8d0b8', pants: '#3a4a6a', hair: '#3a2a1a', face: 'human', sleeves: 'short' });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  atlas = { canvas: c, g, tex: t };
  return atlas;
}
export const ZOMBIE_OUTFITS = () => Object.keys(OUTFITS).filter((k) => k[0] === 'z');
export const BANDIT_OUTFITS = () => Object.keys(OUTFITS).filter((k) => k[0] === 'b');
export function zombieKind(name) { return _cells[OUTFITS[name]]?.zkind || 'civ'; }

/** Repaint the player's outfit (or one of their old bodies') from what they're wearing. */
export function paintPlayer(o, name = 'player') {
  const A = buildAtlas();
  paint(A.g, OUTFITS[name], { skin: '#e0b896', hair: '#3a2a1a', face: 'human', sleeves: 'short', seed: 5, ...o });
  A.tex.needsUpdate = true;
}

// --- the parts ---------------------------------------------------------------------------------------------------------------
// [half sizes, region set]
const PARTS = [
  { name: 'head', h: [0.6, 0.6, 0.6], reg: R.head },
  { name: 'torso', h: [1, 1, 0.5], reg: R.torso },
  { name: 'armL', h: [0.5, 1, 0.5], reg: R.arm },
  { name: 'armR', h: [0.5, 1, 0.5], reg: R.arm },
  { name: 'legL', h: [0.5, 1, 0.5], reg: R.leg },
  { name: 'legR', h: [0.5, 1, 0.5], reg: R.leg },
];
export const PART_NAMES = PARTS.map((p) => p.name);

function partGeometry(p) {
  const [hx, hy, hz] = p.h;
  const g = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each). The front of a person is -z here? No: +z (they face +z).
  const uv = g.attributes.uv;
  const set = (face, reg, flip = false) => {
    const [x, y, w, h] = reg;
    const u0 = x / CELL, u1 = (x + w) / CELL, v0 = 1 - (y + h) / CELL, v1 = 1 - y / CELL;
    const base = face * 4;
    // box face verts: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right
    const L = flip ? u1 : u0, Rr = flip ? u0 : u1;
    uv.setXY(base, L, v1); uv.setXY(base + 1, Rr, v1); uv.setXY(base + 2, L, v0); uv.setXY(base + 3, Rr, v0);
  };
  set(0, p.reg.side); set(1, p.reg.side, true); set(2, p.reg.top); set(3, p.reg.top); set(4, p.reg.front); set(5, p.reg.back);
  uv.needsUpdate = true;
  return g;
}

function crowdMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
vMapUv = vMapUv * vec2(${(1 / COLS).toFixed(6)}, ${(1 / ROWS).toFixed(6)}) + aCell;
#endif`);
  };
  m.customProgramCacheKey = () => 'ob-crowd';
  return m;
}

// --- a crowd -----------------------------------------------------------------------------------------------------------------
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();

/**
 * Everyone drawn: add(person) returns a slot; each frame set person.pose and
 * call update(). Person: { x, y, z, yaw, scale, outfit (name), pose: {...} }.
 */
export class Crowd {
  constructor(world, max = 96) {
    const A = buildAtlas();
    this.world = world; this.max = max;
    this.mat = crowdMaterial(A.tex);
    this.cell = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
    this.meshes = PARTS.map((p) => {
      const g = partGeometry(p);
      g.setAttribute('aCell', this.cell);
      const m = new THREE.InstancedMesh(g, this.mat, max);
      m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, _c.setRGB(1, 1, 1));
      world.scene.add(m);
      return m;
    });
    // people you can't see but whose shadow falls (you, in first person)
    const shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.shadows = PARTS.map((p) => {
      const m = new THREE.InstancedMesh(partGeometry(p), shadowOnly, 4);
      m.count = 0; m.castShadow = true; m.frustumCulled = false; m.renderOrder = -1;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      world.scene.add(m);
      return m;
    });
    this.people = [];
    this.parts = []; // per person: 6 matrices (for hit tests)
  }
  add(p) { if (this.people.length >= this.max) return false; this.people.push(p); p.mats = PARTS.map(() => new THREE.Matrix4()); p.inv = PARTS.map(() => new THREE.Matrix4()); return true; }
  remove(p) { const i = this.people.indexOf(p); if (i >= 0) this.people.splice(i, 1); }

  /** Work out every limb from the pose and upload. cam: only people within `range` are drawn. */
  update(cam, range = 600) {
    let n = 0, ns = 0;
    for (const p of this.people) {
      if (p.hidden) continue;
      if (cam && Math.abs(p.x - cam.x) + Math.abs(p.z - cam.z) > range * 1.4) { p.culled = true; continue; }
      p.culled = false;
      if (p.rag) p.rag.write(); else this._pose(p);
      if (p.invisible) { if (ns < 4) { for (let k = 0; k < 6; k++) this.shadows[k].setMatrixAt(ns, p.mats[k]); ns++; } continue; }
      for (let k = 0; k < 6; k++) this.meshes[k].setMatrixAt(n, p.mats[k]);
      const ci = OUTFITS[p.outfit] ?? 0;
      this.cell.setXY(n, (ci % COLS) / COLS, 1 - (Math.floor(ci / COLS) + 1) / ROWS);
      const fl = p.flash || 0;
      _c.setRGB(1 + fl * 1.5, 1 - fl * 0.4, 1 - fl * 0.4);
      for (let k = 0; k < 6; k++) this.meshes[k].setColorAt(n, _c);
      n++;
    }
    for (const m of this.meshes) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    for (const m of this.shadows) { m.count = ns; m.instanceMatrix.needsUpdate = true; }
    this.cell.needsUpdate = true;
  }

  /**
   * Limb matrices from the pose: { walk (phase), stride (0..1), arms: 'swing' | 'zombie' | 'aim' | 'pistol' | 'attack' | 'carry', attack (0..1),
   * crouch (0..1), prone (0..1), lean, look (head pitch), dead (0..1 fall), fallDir (1 back, -1 front), headYaw }
   */
  _pose(p) {
    const P = p.pose || {}, s = p.scale || 1;
    const stride = P.stride ?? 0, ph = P.walk ?? 0;
    const crouch = P.crouch || 0, prone = P.prone || 0, dead = P.dead || 0;
    // the root: at the feet, turned; falling over pivots at the feet; prone lies flat
    _q.setFromEuler(_e.set(0, p.yaw, 0));
    _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(s, s, s));
    const fall = dead * (Math.PI / 2) * (P.fallDir || 1) + prone * (-Math.PI / 2);
    // (lying down: lifted so the body rests on the ground rather than through it)
    if (dead || prone) { _m.multiply(_t.makeTranslation(0, 0.5 * Math.max(dead, prone), 0)); }
    if (fall) { _r.makeRotationX(-fall); _m.multiply(_r); }
    const lowered = crouch * 1.25;
    const lean = (P.lean || 0) + crouch * 0.35 + (P.arms === 'zombie' ? 0.18 : 0);
    const hipY = 2 - lowered;
    // torso: pivot at the hips
    const bob = Math.abs(Math.sin(ph)) * 0.12 * stride;
    const tw = Math.sin(ph) * 0.06 * stride;
    const torso = new THREE.Matrix4().makeTranslation(0, hipY + bob, 0).multiply(_r.makeRotationFromEuler(_e.set(lean, tw, P.tilt || 0))).multiply(_t.makeTranslation(0, 1, 0));
    p.mats[1].multiplyMatrices(_m, torso);
    // head: on top of the torso
    const head = torso.clone().multiply(_t.makeTranslation(0, 1, 0)).multiply(_r.makeRotationFromEuler(_e.set(-(P.look || 0) * 0.6 - lean * 0.6 + (P.arms === 'zombie' ? 0.25 : 0), P.headYaw || 0, P.headTilt || 0))).multiply(_t.makeTranslation(0, 0.6, 0));
    p.mats[0].multiplyMatrices(_m, head);
    // arms: from the shoulders
    const swing = Math.sin(ph) * 0.8 * stride;
    for (const side of [-1, 1]) {
      let ax = 0, az = 0, ay = 0;
      switch (P.arms) {
        case 'zombie': ax = -1.35 + Math.sin(ph * 0.5 + side) * 0.15 - (P.attack || 0) * side * 0.4; az = side * 0.08; break;
        case 'attack': { const a = P.attack || 0; ax = -2.4 + Math.sin(a * Math.PI) * 1.8 * (side > 0 ? 1 : 0.6); az = side * 0.15; break; }
        case 'aim': ax = side > 0 ? -1.45 - (P.look || 0) : -1.35 - (P.look || 0); ay = side > 0 ? 0.12 : -0.55; az = side > 0 ? 0 : 0.35; break;
        case 'pistol': ax = -1.5 - (P.look || 0); ay = side > 0 ? 0.2 : -0.35; az = side > 0 ? 0 : 0.3; break;
        case 'melee': { const a = P.attack || 0; ax = side > 0 ? -0.6 - Math.sin(a * Math.PI) * 1.9 : -0.4 - swing * 0.3; az = side * 0.1; break; }
        case 'carry': ax = -0.5; az = side * 0.1; break;
        case 'hands': ax = side > 0 ? -0.9 : swing * side * 0.6; break;
        default: ax = swing * side; az = side * 0.05;
      }
      if (dead) { ax = ax * (1 - dead) + (-0.4 + side * 0.3) * dead; az = side * 0.4 * dead; }
      const arm = torso.clone().multiply(_t.makeTranslation(side * 1.5, 0.8, 0)).multiply(_r.makeRotationFromEuler(_e.set(ax - lean * 0.3, ay, az))).multiply(_t.makeTranslation(0, -0.8, 0));
      p.mats[side < 0 ? 2 : 3].multiplyMatrices(_m, arm);
      if (side > 0) p.handR = arm; else p.handL = arm;
    }
    // legs: from the hips
    for (const side of [-1, 1]) {
      let lx = -swing * side * 0.9;
      if (crouch) lx = lx * (1 - crouch) - 1.15 * crouch + (side > 0 ? 0.25 : -0.1) * crouch;
      if (dead) lx = lx * (1 - dead) + side * 0.15 * dead;
      const leg = new THREE.Matrix4().makeTranslation(side * 0.5, hipY + bob * 0.5, 0).multiply(_r.makeRotationFromEuler(_e.set(lx, 0, side * (P.spread || 0)))).multiply(_t.makeTranslation(0, -1, 0));
      p.mats[side < 0 ? 4 : 5].multiplyMatrices(_m, leg);
    }
    for (let k = 0; k < 6; k++) p.inv[k].copy(p.mats[k]).invert();
  }

  /**
   * Which person and limb a ray hits first: { p, part, d, point } or null.
   * skip(p) -> true to ignore someone (the shooter).
   */
  ray(o, dir, max, skip) {
    let best = null, bd = max;
    for (const p of this.people) {
      if (p.hidden || p.culled || (skip && skip(p))) continue;
      // quick: the ray's closest approach to the person's middle
      const cx = p.x - o.x, cy = p.y + 2.5 - o.y, cz = p.z - o.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t < -4 || t > bd + 4) continue;
      const qx = cx - dir.x * t, qy = cy - dir.y * t, qz = cz - dir.z * t;
      if (qx * qx + qy * qy + qz * qz > 16) continue;
      for (let k = 0; k < 6; k++) {
        const d = rayBox(p.inv[k], PARTS[k].h, o, dir, bd);
        if (d !== null && d < bd) { bd = d; best = { p, part: PARTS[k].name, d }; }
      }
    }
    if (best) best.point = new THREE.Vector3().copy(o).addScaledVector(dir, best.d);
    return best;
  }
  /** Where someone's right hand is (for holding things): a matrix. */
  handMatrix(p, out = new THREE.Matrix4()) {
    if (!p.handR) return null;
    return out.copy(p.mats[3]).multiply(_t.makeTranslation(0, -0.95, 0.1)); // (the right arm, as drawn: lying down too)
  }
}

const _lo = new THREE.Vector3(), _ld = new THREE.Vector3();
function rayBox(inv, h, o, dir, max) {
  _lo.copy(o).applyMatrix4(inv);
  _ld.copy(dir).transformDirection(inv);
  // (transformDirection normalises; scale is ~1 so distances stay close enough)
  let t0 = 0, t1 = max;
  for (let a = 0; a < 3; a++) {
    const oo = a === 0 ? _lo.x : a === 1 ? _lo.y : _lo.z, dd = a === 0 ? _ld.x : a === 1 ? _ld.y : _ld.z, hh = h[a];
    if (Math.abs(dd) < 1e-8) { if (oo < -hh || oo > hh) return null; continue; }
    let ta = (-hh - oo) / dd, tb = (hh - oo) / dd;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  return t0;
}

export { buildAtlas };
