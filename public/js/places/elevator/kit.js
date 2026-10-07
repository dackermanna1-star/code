// The kit the floors are built with. A floor is put up in front of the
// elevator's doors while they're shut, and everything it makes - bricks
// (merged into a few meshes), moving parts, models, puppets, lights, sounds,
// timers - is tracked so it can all be taken down again before the next one.
// Also: the sky and light of each floor, puppets (people and creatures that
// walk where they're told), and the ways a floor can hurt you.
import * as THREE from 'three';
import { Structure } from '../disasters/structure.js';
import { CharacterModel } from '../../engine/CharacterModel.js';
import { brickColor } from '../../engine/BrickColor.js';
import { canvasTexture } from '../../engine/textures.js';
import { GROUP } from '../../engine/Part.js';
import * as A from './audio.js';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const DOOR_Z = -9; // the landing: the door's threshold (floors are built at z < DOOR_Z)
const DEG = Math.PI / 180;

/** A BrickColor as a three.js colour. */
export function bc(n) { const c = brickColor(n); return new THREE.Color().setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace); }

// --- textures -------------------------------------------------------------------------------------------------------------------------------
let texN = 0;
/** A canvas texture made once per key (srgb). */
export function ctex(key, w, h, draw, o = {}) {
  const t = canvasTexture('elev:' + key, w, h, draw, { srgb: true });
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...o.repeat); }
  return t;
}
/** A copy of a (cached) texture that tiles rx x ry times. */
export function tiled(t, rx, ry) { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(rx, ry); c.needsUpdate = true; return c; }
/** A fresh (not cached) canvas texture that can be redrawn: returns {tex, ctx, canvas, redraw(fn)}. */
export function liveTex(w, h) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.name = 'live' + texN++;
  return { tex, ctx, canvas, redraw(fn) { fn(ctx, w, h); tex.needsUpdate = true; } };
}
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Sky panoramas (equirectangular canvases). */
export function skyTex(id) {
  return ctex('sky:' + id, 1024, 512, (x, W, H) => {
    const R = rng(id.length * 977 + id.charCodeAt(0));
    const grad = (stops) => { const g = x.createLinearGradient(0, 0, 0, H); for (const [o, col] of stops) g.addColorStop(o, col); x.fillStyle = g; x.fillRect(0, 0, W, H); };
    const blob = (cx, cy, rx, ry, col) => { for (const ox of [-W, 0, W]) { const g = x.createRadialGradient(cx + ox, cy, 0, cx + ox, cy, rx); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.save(); x.translate(cx + ox, cy); x.scale(1, ry / rx); x.translate(-(cx + ox), -cy); x.fillStyle = g; x.beginPath(); x.arc(cx + ox, cy, rx, 0, 7); x.fill(); x.restore(); } };
    const clouds = (n, y0, y1, col, sz) => { for (let i = 0; i < n; i++) { const cx = R() * W, cy = y0 + R() * (y1 - y0); for (let j = 0; j < 6; j++) blob(cx + (R() - 0.5) * sz * 2.2, cy + (R() - 0.5) * sz * 0.35, sz * (0.45 + R() * 0.6), sz * 0.32, col); } };
    const stars = (n, y0, y1, a) => { for (let i = 0; i < n; i++) { x.fillStyle = `rgba(255,255,255,${a * (0.3 + R() * 0.7)})`; const s = R() < 0.07 ? 2 : 1; x.fillRect(R() * W, y0 + R() * (y1 - y0), s, s); } };
    const disc = (cx, cy, r, c1, c2) => { const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r); g.addColorStop(0, c1); g.addColorStop(1, c2); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); };
    switch (id) {
      case 'day': grad([[0, '#2a74d0'], [0.4, '#7cbaf0'], [0.5, '#d6ecff'], [0.52, '#eef6ff'], [1, '#c8dcea']]); clouds(9, 80, 170, 'rgba(255,255,255,0.45)', 80); clouds(18, 170, 245, 'rgba(255,255,255,0.85)', 44); break;
      case 'sunset': grad([[0, '#1d2a6a'], [0.3, '#6a4a9a'], [0.42, '#e8706a'], [0.49, '#ffc070'], [0.52, '#ffe0a0'], [1, '#3a2a40']]); clouds(16, 150, 245, 'rgba(255,150,120,0.55)', 50); blob(250, 240, 60, 60, 'rgba(255,240,180,0.95)'); break;
      case 'night': grad([[0, '#02040c'], [0.42, '#0c1636'], [0.5, '#1c2a52'], [1, '#05070e']]); stars(900, 0, 240, 1); disc(700, 110, 26, '#fffbe8', '#c8c4b0'); break;
      case 'space': grad([[0, '#000000'], [1, '#000004']]); stars(2200, 0, H, 1); blob(300, 200, 260, 140, 'rgba(70,40,140,0.25)'); disc(760, 150, 70, '#7ac0ff', '#14306a'); for (let i = 0; i < 9; i++) blob(730 + R() * 70, 120 + R() * 60, 18 + R() * 20, 10, 'rgba(255,255,255,0.5)'); break;
      case 'storm': grad([[0, '#20242a'], [0.45, '#40484e'], [0.5, '#525a5e'], [1, '#2a2e30']]); clouds(40, 40, 250, 'rgba(25,28,32,0.6)', 70); break;
      case 'overcast': grad([[0, '#8a96a2'], [0.5, '#c4ccd2'], [1, '#9aa4ac']]); clouds(30, 60, 250, 'rgba(240,244,248,0.6)', 70); break;
      case 'pink': grad([[0, '#ff8ac8'], [0.45, '#ffc0e4'], [0.5, '#fff0f8'], [1, '#ffd0ea']]); clouds(22, 90, 250, 'rgba(255,255,255,0.8)', 46); break;
      case 'jungle': grad([[0, '#3a7a9a'], [0.45, '#9ac8c0'], [0.5, '#d8f0d0'], [1, '#6a8a5a']]); clouds(14, 100, 230, 'rgba(255,255,255,0.6)', 50); break;
      case 'desert': grad([[0, '#3a6ab0'], [0.45, '#a8c8e0'], [0.5, '#f4e0b0'], [1, '#d8b878']]); blob(560, 90, 30, 30, 'rgba(255,255,230,1)'); break;
      case 'cyber': grad([[0, '#000004'], [0.5, '#020818'], [1, '#000004']]); for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(40,255,200,${0.1 + R() * 0.3})`; const px = R() * W; x.fillRect(px, 0, 1, H); } for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(80,255,220,${R()})`; x.font = '10px monospace'; x.fillText(R() < 0.5 ? '0' : '1', R() * W, R() * H); } break;
      default: grad([[0, '#000'], [1, '#000']]);
    }
  });
}

/** Text drawn on a canvas, for signs and screens: returns a texture. */
export function textTex(text, o = {}) {
  const w = o.w || 512, h = o.h || 128;
  return ctex(`txt:${text}:${o.bg}:${o.fg}:${w}:${h}:${o.font}`, w, h, (x) => {
    if (o.bg) { x.fillStyle = o.bg; x.fillRect(0, 0, w, h); } else x.clearRect(0, 0, w, h);
    if (o.border) { x.strokeStyle = o.border; x.lineWidth = Math.max(4, h * 0.06); x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, w - x.lineWidth, h - x.lineWidth); }
    const lines = String(text).split('\n');
    const size = o.size || Math.min(h / (lines.length + 0.5), (w * 1.7) / Math.max(...lines.map((l) => l.length)));
    x.font = `${o.weight || 'bold'} ${Math.round(size)}px ${o.font || 'Arial, sans-serif'}`;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = o.fg || '#000';
    if (o.glow) { x.shadowColor = o.glow; x.shadowBlur = size * 0.4; }
    lines.forEach((l, i) => x.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.1, w * 0.94));
  });
}

// --- simple block models (non-physical, can be moved and animated) ----------------------------------------------------------------------
const boxGeoCache = new Map();
function unitBox() { if (!boxGeoCache.has('b')) boxGeoCache.set('b', new THREE.BoxGeometry(1, 1, 1)); return boxGeoCache.get('b'); }
const matCache = new Map();
/** A smooth plastic material of a BrickColor (or a hex colour with o.hex), cached. */
export function plastic(color, o = {}) {
  const key = `${color}|${o.hex}|${o.emissive}|${o.opacity}|${o.shininess}`;
  if (matCache.has(key)) return matCache.get(key);
  const c = o.hex != null ? new THREE.Color(o.hex) : bc(color);
  const m = new THREE.MeshPhongMaterial({ color: c, shininess: o.shininess ?? 20, specular: 0x222222, transparent: o.opacity != null && o.opacity < 1, opacity: o.opacity ?? 1, depthWrite: !(o.opacity < 0.6) });
  if (o.emissive) m.emissive = c.clone().multiplyScalar(o.emissive);
  matCache.set(key, m);
  return m;
}
/**
 * A model from boxes: list of [sx,sy,sz, x,y,z, color, {rx,ry,rz, shape:'ball'|'cyl'|'cone', hex, emissive, opacity}].
 * Returns a THREE.Group (its origin is the model's origin).
 */
export function blocks(list, o = {}) {
  const g = new THREE.Group();
  for (const it of list) {
    const [sx, sy, sz, x, y, z, color, e = {}] = it;
    let geo = unitBox();
    if (e.shape === 'ball') geo = sphereGeo();
    else if (e.shape === 'cyl') geo = cylGeo();
    else if (e.shape === 'cone') geo = coneGeo();
    const m = new THREE.Mesh(geo, plastic(color, e));
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    if (e.rx || e.ry || e.rz) m.rotation.set((e.rx || 0) * DEG, (e.ry || 0) * DEG, (e.rz || 0) * DEG);
    m.castShadow = o.shadow !== false; m.receiveShadow = true;
    if (e.name) m.name = e.name;
    g.add(m);
  }
  return g;
}
let _sph, _cyl, _cone;
function sphereGeo() { return _sph ||= new THREE.SphereGeometry(0.5, 16, 12); }
function cylGeo() { return _cyl ||= new THREE.CylinderGeometry(0.5, 0.5, 1, 18); }
function coneGeo() { return _cone ||= new THREE.ConeGeometry(0.5, 1, 14); }

// --- puppets: people moved by script (no physics) -----------------------------------------------------------------------------------------
/**
 * A character model that walks where it's told: feet at pos, facing yaw (0 = -z). o: {scale, faceTex, hat (fn(head)), speed}.
 * Each frame: update(dt). Poses: this.pose = fn(a, t, moving) can set the limb angles a.rs/ls/rh/lh (positive swings forward); walking swings the limbs like the classic Animate script.
 */
export class Puppet {
  constructor(world, appearance, o = {}) {
    this.world = world;
    this.model = new CharacterModel({ face: 'Smile', hats: [], shirt: null, pants: null, tshirt: null, ...appearance });
    this.root = new THREE.Group();
    this.root.add(this.model.root);
    this.scale = o.scale || 1;
    this.model.root.position.y = 3; // torso centre is 3 above the feet
    this.root.scale.setScalar(this.scale);
    this.root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    if (o.faceTex) this.setFace(o.faceTex);
    if (o.hat) o.hat(this.model.head, this);
    world.scene.add(this.root);
    this.pos = V(); this.yaw = 0; this.target = null; this.speed = o.speed ?? 10; this.t = Math.random() * 10;
    this.name = o.name || 'NPC';
    this.walking = false; this.pose = null; this.alive = true;
    this.arms = { rs: 0, ls: 0, rh: 0, lh: 0 };
  }
  setFace(tex) { this.model.head.children[0].material = new THREE.MeshPhongMaterial({ map: tex, transparent: true, depthWrite: false, shininess: 10 }); }
  place(x, y, z, yaw = this.yaw) { this.pos.set(x, y, z); this.yaw = yaw; this._apply(); return this; }
  walkTo(p, speed) { this.target = p.clone ? p.clone() : V(...p); if (speed) this.speed = speed; this.walking = true; return this; }
  stop() { this.target = null; this.walking = false; }
  face(p) { this.yaw = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z)); }
  /** Feet-relative point of its head (for bubbles, collisions). */
  get head() { return this.pos.clone().add(V(0, 5 * this.scale, 0)); }
  get centre() { return this.pos.clone().add(V(0, 3 * this.scale, 0)); }
  /** Is a character within r of this puppet's body (horizontally, and at the same height)? */
  touches(ch, r = 2) { const p = ch.rootPosition; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < r * this.scale && p.y > this.pos.y - 1 && p.y < this.pos.y + 6 * this.scale + 2; }
  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    let moving = false;
    if (this.target) {
      const d = V(this.target.x - this.pos.x, 0, this.target.z - this.pos.z), L = d.length();
      if (L < 0.2) { this.stop(); this.onArrive?.(); }
      else {
        const st = Math.min(L, this.speed * dt);
        this.pos.addScaledVector(d.normalize(), st);
        if (this.target.y != null) this.pos.y += (this.target.y - this.pos.y) * Math.min(1, dt * 6);
        const want = Math.atan2(-d.x, -d.z); let dy = want - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yaw += dy * Math.min(1, dt * 10);
        moving = true;
      }
    }
    const a = this.arms;
    const sw = moving ? Math.sin(this.t * 9 * Math.min(1.6, this.speed / 14)) : Math.sin(this.t * 1.2) * 0.1;
    a.rs = sw; a.ls = -sw; a.rh = -sw; a.lh = sw;
    if (this.pose) this.pose(a, this.t, moving);
    this.model.setAngles(a.rs, -a.ls, a.rh, -a.lh); // (positive = forward, for every limb)
    this._apply();
  }
  _apply() { this.root.position.copy(this.pos); this.root.rotation.set(0, this.yaw, 0); }
  remove() { this.alive = false; this.world.scene.remove(this.root); this.model.dispose(); }
}

/** A face drawn on a canvas (for skeletons, zombies, clowns...): draw(ctx, S) on a 256 canvas, transparent. */
export function faceTex(key, draw) {
  const t = ctex('face:' + key, 256, 256, (x) => { x.clearRect(0, 0, 256, 256); draw(x, 256); });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
export const FACES = {
  skull: () => faceTex('skull', (x, S) => { x.fillStyle = '#111'; for (const ex of [0.4, 0.6]) { x.beginPath(); x.ellipse(S * ex, S * 0.4, S * 0.06, S * 0.075, 0, 0, 7); x.fill(); } x.beginPath(); x.moveTo(S * 0.5, S * 0.47); x.lineTo(S * 0.47, S * 0.54); x.lineTo(S * 0.53, S * 0.54); x.fill(); x.fillRect(S * 0.38, S * 0.6, S * 0.24, S * 0.025); for (let i = 0; i < 6; i++) x.fillRect(S * (0.39 + i * 0.04), S * 0.585, S * 0.01, S * 0.06); }),
  angry: () => faceTex('angry', (x, S) => { x.fillStyle = '#000'; x.lineWidth = S * 0.025; x.strokeStyle = '#000'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(S * (0.5 + s * 0.095), S * 0.42, S * 0.03, S * 0.05, 0, 0, 7); x.fill(); x.beginPath(); x.moveTo(S * (0.5 + s * 0.16), S * 0.33); x.lineTo(S * (0.5 + s * 0.04), S * 0.37); x.stroke(); } x.beginPath(); x.arc(S * 0.5, S * 0.68, S * 0.12, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); }),
  shock: () => faceTex('shock', (x, S) => { x.fillStyle = '#000'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(S * (0.5 + s * 0.095), S * 0.4, S * 0.035, S * 0.07, 0, 0, 7); x.fill(); } x.beginPath(); x.ellipse(S * 0.5, S * 0.62, S * 0.05, S * 0.07, 0, 0, 7); x.fill(); }),
  sleepy: () => faceTex('sleepy', (x, S) => { x.strokeStyle = '#000'; x.lineWidth = S * 0.02; for (const s of [-1, 1]) { x.beginPath(); x.arc(S * (0.5 + s * 0.095), S * 0.4, S * 0.04, 0.2, Math.PI - 0.2); x.stroke(); } x.beginPath(); x.moveTo(S * 0.44, S * 0.62); x.lineTo(S * 0.56, S * 0.62); x.stroke(); }),
  glasses: () => faceTex('glasses', (x, S) => { x.strokeStyle = '#000'; x.lineWidth = S * 0.018; for (const s of [-1, 1]) { x.beginPath(); x.arc(S * (0.5 + s * 0.1), S * 0.41, S * 0.06, 0, 7); x.stroke(); x.fillStyle = '#000'; x.beginPath(); x.arc(S * (0.5 + s * 0.1), S * 0.41, S * 0.018, 0, 7); x.fill(); } x.beginPath(); x.moveTo(S * 0.46, S * 0.41); x.lineTo(S * 0.54, S * 0.41); x.stroke(); x.beginPath(); x.moveTo(S * 0.42, S * 0.63); x.lineTo(S * 0.58, S * 0.63); x.stroke(); }),
  mummy: () => faceTex('mummy', (x, S) => { x.strokeStyle = 'rgba(120,100,70,0.6)'; x.lineWidth = S * 0.03; for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(S * 0.2, S * (0.18 + i * 0.08)); x.lineTo(S * 0.8, S * (0.22 + i * 0.08 + (i % 2 ? 0.03 : -0.02))); x.stroke(); } x.fillStyle = '#ffe23a'; for (const s of [-1, 1]) { x.beginPath(); x.arc(S * (0.5 + s * 0.09), S * 0.42, S * 0.025, 0, 7); x.fill(); } }),
  ghost: () => faceTex('ghost', (x, S) => { x.fillStyle = '#000'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(S * (0.5 + s * 0.1), S * 0.42, S * 0.055, S * 0.1, 0, 0, 7); x.fill(); } x.beginPath(); x.ellipse(S * 0.5, S * 0.68, S * 0.06, S * 0.12, 0, 0, 7); x.fill(); }),
  robot: () => faceTex('robot', (x, S) => { x.fillStyle = '#ff2020'; x.shadowColor = '#ff0000'; x.shadowBlur = 12; x.fillRect(S * 0.32, S * 0.38, S * 0.36, S * 0.06); x.shadowBlur = 0; x.fillStyle = '#222'; for (let i = 0; i < 5; i++) x.fillRect(S * (0.36 + i * 0.06), S * 0.6, S * 0.03, S * 0.06); }),
  grin: () => faceTex('grin', (x, S) => { x.fillStyle = '#000'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(S * (0.5 + s * 0.095), S * 0.4, S * 0.034, S * 0.07, 0, 0, 7); x.fill(); } x.beginPath(); x.arc(S * 0.5, S * 0.52, S * 0.17, 0.1, Math.PI - 0.1); x.closePath(); x.fill(); x.fillStyle = '#fff'; x.fillRect(S * 0.37, S * 0.535, S * 0.26, S * 0.04); }),
};

// --- the environment: sky, light, fog, and a pool of point lights ------------------------------------------------------------------------
export class Env {
  constructor(world) {
    this.world = world;
    if (world.skyMesh) world.scene.remove(world.skyMesh);
    this.skyMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, depthWrite: false, fog: false });
    world.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), this.skyMat);
    world.skyMesh.renderOrder = -1;
    world.scene.add(world.skyMesh);
    world.scene.fog = new THREE.Fog(0x000000, 400, 2000);
    this.pool = [];
    for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffffff, 0, 30, 2); world.scene.add(l); this.pool.push({ l, used: false }); }
  }
  /** o: {sky, skyColor, amb:[sky, ground, intensity], sun:[color, intensity, dir?], fog:[color, near, far]} */
  apply(o = {}) {
    const w = this.world;
    if (o.sky) { this.skyMat.map = skyTex(o.sky); this.skyMat.color.set(0xffffff); }
    else { this.skyMat.map = null; this.skyMat.color.set(o.skyColor ?? 0x000000); }
    this.skyMat.needsUpdate = true;
    const amb = o.amb || [0xe8eef6, 0x9a948a, 1.45];
    w.ambient.color.set(amb[0]); w.ambient.groundColor.set(amb[1]); w.ambient.intensity = amb[2];
    const sun = o.sun || [0xffffff, 1.35];
    w.sun.color.set(sun[0]); w.sun.intensity = sun[1];
    w.fill.intensity = o.fill ?? 0.35;
    const fog = o.fog || [0x000000, 1500, 4000];
    w.scene.fog.color.set(fog[0]); w.scene.fog.near = fog[1]; w.scene.fog.far = fog[2];
  }
  light(pos, color = 0xffffff, intensity = 40, distance = 30) {
    const s = this.pool.find((p) => !p.used);
    if (!s) return { set() {}, off() {}, l: null };
    s.used = true; s.l.position.copy(pos); s.l.color.set(color); s.l.intensity = intensity; s.l.distance = distance;
    return { l: s.l, set: (i) => { s.l.intensity = i; }, off: () => { s.l.intensity = 0; s.used = false; } };
  }
  freeLights() { for (const s of this.pool) { s.l.intensity = 0; s.used = false; } }
}

// --- the floor kit ------------------------------------------------------------------------------------------------------------------------------------
/**
 * Everything a floor needs. E is the shared place state: {world, game, fx, flames, weather, env, car, ui, say, kill, ...}.
 */
export class FloorKit {
  constructor(E, floor) {
    this.E = E; this.world = E.world; this.floor = floor;
    this.st = new Structure(E.world, { cell: 40 });
    this.parts = []; this.objects = []; this.puppets = []; this.npcs = []; this.lights = []; this.loops = []; this.updaters = [];
    this.timers = []; this.t = 0; this.state = {};
    this.touched = new WeakMap();
  }
  get fx() { return this.E.fx; }
  // --- building
  /** An anchored brick by its corners (merged with the others). o: any Part props (top, material, transparency, canCollide, name...) */
  box(x0, y0, z0, x1, y1, z1, color = 194, o = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0]; if (z1 < z0) [z0, z1] = [z1, z0];
    return this.brick([x1 - x0, y1 - y0, z1 - z0], [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], color, o);
  }
  /** An anchored brick by size and centre (merged). */
  brick(size, pos, color = 194, o = {}) {
    const p = this.st.add({ size, position: pos, color, top: o.top ?? 'Smooth', bottom: o.bottom ?? 'Smooth', ...o });
    p.userData.fixed = true;
    return p;
  }
  /** A part of its own (moving, recoloured, touched...). */
  part(props) {
    const p = this.world.add({ top: 'Smooth', bottom: 'Smooth', ...props });
    this.parts.push(p);
    return p;
  }
  /** A part moved by script every frame (it carries characters standing on it). */
  mover(props) { const p = this.part(props); p.setKinematic(); return p; }
  /** A three.js object added to the scene (models, planes, sprites). */
  add(obj) { this.world.scene.add(obj); this.objects.push(obj); return obj; }
  /** A flat textured plane: w x h, centre pos, rotation [rx, ry, rz] (deg). o: {transparent, emissive, double, opacity, basic} */
  plane(tex, w, h, pos, rot = [0, 0, 0], o = {}) {
    const mat = o.basic ? new THREE.MeshBasicMaterial({ map: tex, transparent: o.transparent ?? true, opacity: o.opacity ?? 1, side: o.double ? THREE.DoubleSide : THREE.FrontSide, depthWrite: !o.transparent, color: o.color ?? 0xffffff, fog: o.fog ?? true })
      : new THREE.MeshPhongMaterial({ map: tex, transparent: o.transparent ?? false, opacity: o.opacity ?? 1, side: o.double ? THREE.DoubleSide : THREE.FrontSide, shininess: o.shininess ?? 10, color: o.color ?? 0xffffff, polygonOffset: !!o.decal, polygonOffsetFactor: -2 });
    if (o.emissive && !o.basic) { mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = tex; mat.emissiveIntensity = o.emissive; }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(...pos); m.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, 'YXZ');
    m.receiveShadow = !o.basic;
    if (o.order != null) m.renderOrder = o.order;
    return this.add(m);
  }
  /** A sign: a thin board with text on its face. face: which way it faces ('z' = toward the car, i.e. +z, or '-z', 'x', '-x'). */
  sign(x, y, z, w, h, text, o = {}) {
    const tex = textTex(text, { bg: o.bg ?? '#ffffff', fg: o.fg ?? '#111111', w: 512, h: Math.max(64, Math.round(512 * h / w)), border: o.border, font: o.font, glow: o.glow, size: o.size });
    const face = o.face || 'z';
    const thin = 0.3;
    const size = face === 'x' || face === '-x' ? [thin, h, w] : [w, h, thin];
    if (!o.noBoard) this.brick(size, [x, y, z], o.color ?? 1);
    const off = thin / 2 + 0.03;
    const rot = { z: [0, 0, 0], '-z': [0, 180, 0], x: [0, 90, 0], '-x': [0, -90, 0] }[face];
    const p = { z: [x, y, z + off], '-z': [x, y, z - off], x: [x + off, y, z], '-x': [x - off, y, z] }[face];
    return this.plane(tex, w * 0.98, h * 0.96, p, rot, { emissive: o.glow ? 0.9 : 0, transparent: !o.bg });
  }
  /** The wall the elevator opens out of (with the doorway cut out). From x0 to x1, height h, in a colour. */
  doorWall(color = 194, o = {}) {
    const x0 = o.x0 ?? -40, x1 = o.x1 ?? 40, h = o.h ?? 18, z0 = DOOR_Z - (o.thick ?? 1), z1 = DOOR_Z + 0.02;
    this.box(x0, 0, z0, -6, h, z1, color, o);
    this.box(6, 0, z0, x1, h, z1, color, o);
    this.box(-6, 11, z0, 6, h, z1, color, o);
    // the frame round the doors
    if (o.frame !== false) {
      const fc = o.frameColor ?? 199;
      this.box(-6.4, 0, z0 - 0.3, -5.6, 11.4, z0, fc); this.box(5.6, 0, z0 - 0.3, 6.4, 11.4, z0, fc); this.box(-6.4, 10.6, z0 - 0.3, 6.4, 11.4, z0, fc);
    }
  }
  /** A floor slab: top at y (default 0). */
  ground(x0, z0, x1, z1, color = 194, o = {}) { const y = o.y ?? 0; return this.box(x0, y - (o.thick ?? 1), z0, x1, y, z1, color, o); }
  /**
   * A room in front of the doors: floor, walls, ceiling. r: {x0, x1, z1 (far end, negative), h, floor, wall, ceiling, ...}
   * Leaves the door wall to doorWall().
   */
  room(r) {
    const { x0, x1, z1, h } = r, z0 = DOOR_Z;
    this.ground(x0 - 1, z1 - 1, x1 + 1, z0 + 0.5, r.floor ?? 194, { top: r.floorTop ?? 'Smooth', material: r.floorMaterial });
    if (r.wall != null) {
      this.box(x0 - 1, 0, z1 - 1, x0, h, z0, r.wall); this.box(x1, 0, z1 - 1, x1 + 1, h, z0, r.wall);
      this.box(x0 - 1, 0, z1 - 1, x1 + 1, h, z1, r.wall);
      this.doorWall(r.wall, { x0: x0 - 1, x1: x1 + 1, h, frameColor: r.frame });
    }
    if (r.ceiling != null) this.box(x0 - 1, h, z1 - 1, x1 + 1, h + 1, z0, r.ceiling);
  }
  // --- danger
  /** Touching this part kills (once per life). msg: "fell into the lava" etc. */
  deadly(part, msg, o = {}) {
    part.tags?.add('deadly');
    part.onTouched((other) => { if (other.alive && other.rootPosition) this.kill(other, msg, o.blast ? other.rootPosition.clone() : null); });
    return part;
  }
  /** A box region: every frame, fn(ch, dt) for each live character inside it. */
  zone(x0, y0, z0, x1, y1, z1, fn) {
    const b = new THREE.Box3(V(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), V(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)));
    this.every(0, (dt) => { for (const ch of this.chars()) if (b.containsPoint(ch.rootPosition)) fn(ch, dt); });
    return b;
  }
  kill(ch, msg, pos) { this.E.kill(ch, msg, pos); }
  /** Anyone who falls below y dies (msg). */
  fallKill(y, msg = 'fell to their doom') { this.every(0, () => { for (const ch of this.chars()) if (ch.rootPosition.y < y) this.kill(ch, msg); }); }
  /** Weaker gravity (k = fraction of normal) for everyone out of the elevator (or for whom test(pos) is true). */
  gravity(k, test) { this.every(0, (dt) => { for (const ch of this.chars({ outside: true })) if (!test || test(ch.rootPosition)) { ch.body.velocity.y += 196.2 * (1 - k) * dt; ch.lowG = true; } }); }
  hurt(ch, dmg, msg) { this.E.hurt(ch, dmg, msg); }
  /** Slippery ground wherever test(pos) is true: people speed up and slow down slowly. */
  ice(test, grip = 1.4) {
    this.every(0, (dt) => {
      for (const ch of this.chars()) {
        if (!ch.grounded || !test(ch.rootPosition)) { if (ch.grounded) ch.iceMove = null; continue; }
        const m = ch.input.move;
        if (!ch.iceMove) ch.iceMove = m.clone();
        ch.iceMove.lerp(m, Math.min(1, dt * grip)); m.copy(ch.iceMove);
      }
    });
  }
  /** Knock a character flying: velocity v (Vector3), helpless for secs. */
  fling(ch, v, secs = 1) {
    if (!ch.alive) return;
    ch.platformStand = true; ch.body.velocity.set(v.x, v.y, v.z); ch.flungUntil = this.world.time + secs;
  }
  /** Live characters (players and passengers); o.outside: only those out of the car. */
  chars(o = {}) { return [...this.world.characters].filter((ch) => ch.alive && (!o.outside || !this.E.car.inside(ch.rootPosition))); }
  outside(ch) { return !this.E.car.inside(ch.rootPosition); }
  nearest(pos, o = {}) { let best = null, bd = o.max ?? Infinity; for (const ch of this.chars(o)) { const d = ch.rootPosition.distanceTo(pos); if (d < bd) { bd = d; best = ch; } } return best; }
  // --- people
  puppet(appearance, o = {}) { const p = new Puppet(this.world, appearance, o); this.puppets.push(p); if (o.at) p.place(...o.at); return p; }
  // --- effects
  light(pos, color, intensity, distance) { const h = this.E.env.light(pos, color, intensity, distance); this.lights.push(h); return h; }
  /** Particles: kind is one of the effect materials ('dust', 'spark', ...) or a colour (0xffffff). */
  burst(kind, pos, n, o) {
    let m = this.fx.mats[kind] || kind;
    if (typeof kind === 'number') m = this.fx.mats['c' + kind] ||= new THREE.SpriteMaterial({ map: this.fx.mats.dust.map, color: kind, transparent: true, opacity: 0.8, depthWrite: false });
    this.fx.burst(m, pos, n, o);
  }
  flame(get, size, life) { const h = this.E.flames.add(typeof get === 'function' ? get : () => get, size, life); this.objects.push({ flame: h }); return h; }
  shake(a) { this.E.shake(a); }
  /** Something said out loud by someone on the floor (chat line + speech bubble over obj). */
  say(name, text, obj) { this.E.say(name, text, obj); }
  bonus(ch, label, pts = 1) { this.E.bonus(ch, label, pts); }
  /**
   * Something to grab (a bonus): the first character to come within r of obj (a model, or a point) gets fn(ch).
   * The model disappears (unless o.keep) with a sparkle. Returns a handle: {taken}.
   */
  pickup(obj, r, fn, o = {}) {
    const h = { taken: false };
    const at = () => (obj.isVector3 ? obj : obj.getWorldPosition(V())).clone().add(o.offset || V());
    this.every(0, () => {
      if (h.taken || (obj.visible === false && !o.keep)) return;
      const p = at();
      for (const ch of this.chars()) if (ch.rootPosition.distanceTo(p) < r) { h.taken = true; if (!o.keep && !obj.isVector3) obj.visible = false; A.sparkle(p); fn(ch, p); break; }
    });
    return h;
  }
  /** Keep a model turning (and bobbing). */
  spin(obj, speed = 1, bob = 0) { const y0 = obj.position.y; this.every(0, (dt, t) => { obj.rotation.y += dt * speed; if (bob) obj.position.y = y0 + Math.sin(t * 2) * bob; }); return obj; }
  /** Sit a character down (where it stands) until it moves. */
  sit(ch, drop = 1.5) { if (ch.sat) return; ch.sat = true; ch.rootDrop = drop; }
  unsit(ch) { if (!ch.sat) return; ch.sat = false; ch.rootDrop = 0; }
  /** A looping sound for the life of the floor. */
  sound(handle, name) { this.loops.push(name); return handle; }
  // --- time
  /** fn() at t seconds after the doors open. */
  at(t, fn) { this.timers.push({ t, fn }); }
  /** fn(dt, t) every frame (or every `period` seconds). */
  every(period, fn) { const u = { period, acc: 0, fn }; this.updaters.push(u); return u; }
  update(dt) {
    this.t += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; if (this.t >= tm.t) { this.timers.splice(i, 1); try { tm.fn(); } catch (e) { console.error(e); } } }
    for (const u of this.updaters) {
      if (u.period) { u.acc += dt; if (u.acc < u.period) continue; const d = u.acc; u.acc = 0; u.fn(d, this.t); } else u.fn(dt, this.t);
    }
    for (const p of this.puppets) p.update(dt);
  }
  /** Raycast down onto the floor's ground at (x, z) from height y. */
  groundAt(x, z, y = 60) { const h = this.world.raycast(V(x, y, z), V(x, -400, z), { mask: GROUP.WORLD }); return h ? h.point.y : null; }
  flush() { this.st.flush(); }
  /** Take it all down. */
  clear() {
    for (const n of this.loops) A.stop(n);
    this.st.clear();
    for (const p of this.parts) if (!p.destroyed) p.destroy();
    for (const o of this.objects) { if (o.flame) o.flame.stop(); else { this.world.scene.remove(o); o.traverse?.((m) => { if (m.geometry && !m.geometry.userData?.shared && m.geometry !== unitBox() && m.geometry !== _sph && m.geometry !== _cyl && m.geometry !== _cone) m.geometry.dispose?.(); }); } }
    for (const p of this.puppets) p.remove();
    for (const n of this.npcs) n.destroy?.();
    for (const l of this.lights) l.off();
    for (const ch of this.world.characters) { this.unsit(ch); ch.iceMove = null; if (ch.swimming) { ch.swimming = false; ch.walkSpeed = ch.npc ? 13 : 16; } }
    this.world.scene.remove(this.st.group);
    this.parts = []; this.objects = []; this.puppets = []; this.npcs = []; this.lights = []; this.updaters = []; this.timers = []; this.loops = [];
  }
}
