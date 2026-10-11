// Player model line-up preview (all eight skins on a sandy floor, GoldSrc Z-up world group).
// Query params:
//   anim     idle | walk | run | crouch | crouchwalk | jump | crouchjump | fire | reload | plant
//            | death (&kind=back|forward|left|headshot|crouch) | death_<kind> | weapons (every world weapon)
//   t        seconds of simulated time before the frame is rendered (default 0.6; deaths start at 0)
//   weapon   weapon id for everybody (default: T ak47 / CT m4a1, c4 when planting; 'none' = empty hands)
//   weapons  comma list, one weapon per model
//   pitch    aim pitch in degrees (+ = down)      speed / crouch=1 / moveyaw  override the state
//   skin     comma list of skins (default: all eight)
//   strip=N  filmstrip: N copies of the first skin, copy i simulated dt*i later (&dt=0.05, &sp=48 spacing)
//   cam      front | side | back | three | close | top  (+ cx,cy,cz camera position, lz look-at height, fov)
//   yaw      extra model yaw (degrees)            amb, shade, dir  GoldSrc light (comma triples)
//   hitboxes=1 show hitboxes   live=1 animate in real time   tex=skin,... show painted skins (&texw=px)
//   raytest=1 log hit groups of rays cast at the first model   bench=1 time update() for 20 players
import * as THREE from 'three';
import { createPlayerModel, PLAYER_SKINS } from '../../src/assets/playermodels.js';
import { createWorldWeapon, createDroppedWeapon, createPlantedC4, createDefuseKit, WORLD_WEAPON_IDS } from '../../src/assets/worldweapons.js';
import { getSkinTexture } from '../../src/assets/pm/skins.js';

THREE.ColorManagement.enabled = false;
const Q = new URLSearchParams(location.search);
if (Q.get('tex')) showTextures(Q.get('tex').split(','));
else main();

function showTextures(list) {
  document.body.style.background = '#444';
  for (const sk of list) {
    const c = getSkinTexture(sk).userData.canvas;
    c.style.cssText = 'width:' + (Q.get('texw') || '512') + 'px;image-rendering:pixelated;margin:4px';
    document.body.appendChild(c);
  }
  console.log('ready textures');
}

function main() {
const anim = Q.get('anim') || 'idle';
const T = parseFloat(Q.get('t') ?? '0.6');
const pitch = parseFloat(Q.get('pitch') ?? '0');
const camMode = Q.get('cam') || 'front';
const yawDeg = parseFloat(Q.get('yaw') ?? '0');
const live = Q.get('live') === '1';
const showHit = Q.get('hitboxes') === '1';
let skins = (Q.get('skin') || [...PLAYER_SKINS.t, ...PLAYER_SKINS.ct].join(',')).split(',');
// strip=N : N copies of the first skin, copy i simulated dt*i seconds later (animation filmstrip)
const strip = parseInt(Q.get('strip') || '0', 10);
const stripDt = parseFloat(Q.get('dt') || '0.05');
if (strip > 0) skins = Array.from({ length: strip }, () => skins[0]);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cb8d8);
const world = new THREE.Group();
world.rotation.x = -Math.PI / 2; // GoldSrc Z-up
scene.add(world);

// sandy floor
function sandTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b89a68'; g.fillRect(0, 0, 256, 256);
  let s = 99;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${120 + r() * 60},${100 + r() * 40},${70 + r() * 30},${0.12 + r() * 0.15})`;
    g.beginPath(); g.ellipse(r() * 256, r() * 256, 2 + r() * 14, 1 + r() * 8, r() * 3, 0, 7); g.fill();
  }
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) { const n = (r() - 0.5) * 30; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(12, 12);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapNearestFilter;
  return t;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(2048, 2048), new THREE.MeshBasicMaterial({ map: sandTexture(), color: 0xe8e0d0 }));
world.add(floor);

const arr = (k, d) => (Q.has(k) ? Q.get(k).split(',').map(Number) : d);
const AMB = arr('amb', [0.55, 0.52, 0.48]), SHADE = arr('shade', [0.72, 0.68, 0.6]), DIR = arr('dir', [0.55, -0.35, 0.76]);

// ------------------------------------------------------------------ anim state
function stateAt(t) {
  const s = { speed: 0, crouch: false, onGround: true, pitch, firing: false, reloading: false, planting: false };
  switch (anim) {
    case 'walk': s.speed = 130; break;
    case 'run': s.speed = 250; break;
    case 'crouch': s.crouch = true; break;
    case 'crouchwalk': s.crouch = true; s.speed = 83; break;
    case 'jump': s.onGround = live ? t % 1.4 > 0.8 : t < 0.2; s.speed = 250; break;
    case 'crouchjump': s.onGround = live ? t % 1.4 > 0.8 : t < 0.2; s.crouch = !s.onGround; s.speed = 250; break;
    case 'fire': s.firing = Math.floor(t * 10) !== Math.floor((t - 1 / 60) * 10); break;
    case 'reload': s.reloading = true; break;
    case 'plant': s.planting = true; break;
    default: break;
  }
  if (Q.has('speed')) s.speed = parseFloat(Q.get('speed'));
  if (Q.get('crouch') === '1') s.crouch = true;
  if (Q.has('moveyaw')) s.moveYaw = parseFloat(Q.get('moveyaw'));
  return s;
}
let deathKind = Q.get('kind') || 'back';
const isDeath = anim.startsWith('death');
if (anim.startsWith('death_')) deathKind = anim.slice(6);

// ------------------------------------------------------------------ line-up
const models = [];
const spacing = skins.length > 1 ? 40 : 0;
skins.forEach((skin, i) => {
  const m = createPlayerModel(skin);
  const team = PLAYER_SKINS.t.includes(skin) ? 't' : 'ct';
  const perModel = Q.get('weapons') ? Q.get('weapons').split(',') : null;
  const weapon = (perModel && perModel[i % perModel.length]) || Q.get('weapon') || (anim === 'plant' ? 'c4' : team === 't' ? 'ak47' : 'm4a1');
  if (weapon !== 'none') m.setWeapon(weapon);
  m.object3D.position.set(0, (i - (skins.length - 1) / 2) * spacing, 0);
  if (strip > 0 && camMode === 'side') m.object3D.position.set((i - (skins.length - 1) / 2) * (Q.has('sp') ? +Q.get('sp') : 48), 0, 0);
  m.object3D.rotation.z = (yawDeg * Math.PI) / 180;
  world.add(m.object3D);
  m.setLight(AMB, SHADE, DIR);
  if (showHit) m.setHitboxesVisible(true);
  models.push({ m, skin });
});

if (anim === 'weapons') {
  // every world weapon in side profile (barrel to the right), plus the planted C4 and defuse kit
  models.forEach(({ m }) => m.object3D.removeFromParent());
  models.length = 0;
  const ids = [...WORLD_WEAPON_IDS];
  const wt = [];
  ids.forEach((id, i) => {
    const w = createWorldWeapon(id);
    let tri = 0; w.traverse((o) => { if (o.isMesh && o.visible) tri += o.geometry.userData.triangles || 0; });
    wt.push(`${id}:${tri}(${w.userData.hold})`);
    const col = i % 4, row = Math.floor(i / 4);
    w.position.set(0, (col - 1.5) * 52 - 8, 118 - row * 15);
    w.rotation.z = Math.PI / 2;
    w.userData.setLight(AMB, SHADE, DIR);
    world.add(w);
    const d = document.createElement('div');
    d.className = 'lbl'; d.textContent = id;
    d.dataset.gs = JSON.stringify([0, (col - 1.5) * 52 - 8, 118 - row * 15 - 6]);
    document.body.appendChild(d);
  });
  console.log('weapons ' + wt.join(' '));
  const c4 = createPlantedC4(); c4.object3D.position.set(0, -40, 0); c4.object3D.rotation.z = 0.5; c4.setBlink(true); world.add(c4.object3D);
  c4.object3D.userData.setLight(AMB, SHADE, DIR);
  const kit = createDefuseKit(); kit.position.set(0, 30, 0); kit.rotation.z = 0.5; world.add(kit);
  kit.userData.setLight(AMB, SHADE, DIR);
  // a few dropped (w_) weapons lying on the floor
  ['ak47', 'm4a1', 'awp', 'deagle', 'mp5', 'hegrenade'].forEach((id, i) => {
    const d = createDroppedWeapon(id);
    d.position.set(-30 - (i % 2) * 30, -100 + i * 40, 0);
    d.rotation.z = 0.3 + i;
    d.userData.setLight(AMB, SHADE, DIR);
    world.add(d);
  });
}

// ------------------------------------------------------------------ simulate
const DT = 1 / 60;
models.forEach((e, i) => { e.simT = 0; e.endT = (isDeath ? T + 0.2 : T) + (strip > 0 ? i * stripDt : 0); });
function stepModel(e, dt) {
  if (isDeath && !e.m.dead && e.simT >= 0.2) e.m.playDeath(deathKind);
  e.m.update(dt, stateAt(e.simT));
  e.simT += dt;
}
function step(dt) { for (const e of models) stepModel(e, dt); }
for (const e of models) {
  while (e.simT < e.endT - 1e-6) stepModel(e, Math.min(DT, e.endT - e.simT));
}

// ------------------------------------------------------------------ camera
function gs(x, y, z) { return new THREE.Vector3(x, z, -y); }
const camera = new THREE.PerspectiveCamera(Q.has('fov') ? +Q.get('fov') : 40, innerWidth / innerHeight, 1, 8000);
const span = Math.max(1, skins.length) * 40;
const camPos = {
  front: [span * 0.78 + 40, 0, 44], side: [0, -(span * (strip > 0 ? 0.95 : 0.78) + 60), 40], back: [-(span * 0.78 + 40), 0, 44],
  three: [span * 0.6 + 30, -(span * 0.45 + 40), 70], close: [70, -20, 52], top: [60, 0, 220],
}[camMode] || [span * 0.78 + 40, 0, 44];
if (anim === 'weapons') camPos.splice(0, 3, 175, 0, 62);
if (Q.has('cx')) camPos[0] = +Q.get('cx');
if (Q.has('cy')) camPos[1] = +Q.get('cy');
if (Q.has('cz')) camPos[2] = +Q.get('cz');
camera.position.copy(gs(...camPos));
const lookZ = Q.has('lz') ? +Q.get('lz') : (isDeath ? 14 : anim.startsWith('crouch') || anim === 'plant' ? 26 : 36);
camera.lookAt(gs(0, 0, anim === 'weapons' ? 62 : lookZ));
camera.up.set(0, 1, 0);

// labels
let labelsIdx = 0;
const labels = models.map(({ m, skin }) => {
  const d = document.createElement('div');
  d.className = 'lbl'; d.textContent = strip > 0 ? `t=${(T + labelsIdx++ * stripDt).toFixed(2)}` : skin + (Q.get('weapons') ? ' / ' + (m.weaponId || '-') : '');
  document.body.appendChild(d);
  return { d, m };
});
function placeLabels() {
  for (const d of document.querySelectorAll('.lbl[data-gs]')) {
    const p = gs(...JSON.parse(d.dataset.gs)).project(camera);
    d.style.left = ((p.x + 1) / 2) * innerWidth + 'px';
    d.style.top = ((1 - p.y) / 2) * innerHeight + 'px';
  }
  for (const { d, m } of labels) {
    const p = new THREE.Vector3();
    m.object3D.getWorldPosition(p);
    p.project(camera);
    d.style.left = ((p.x + 1) / 2) * innerWidth + 'px';
    d.style.top = ((1 - p.y) / 2) * innerHeight + 6 + 'px';
    d.style.display = anim === 'weapons' || p.z > 1 ? 'none' : '';
  }
}

const tris = models.map(({ m, skin }) => `${skin}:${m.mesh.geometry.userData.triangles}`).join(' ');
document.getElementById('info').textContent = `anim=${anim}${isDeath ? '(' + deathKind + ')' : ''} t=${T} pitch=${pitch}  tris ${tris}  eye=${models[0] ? models[0].m.getEyeHeight().toFixed(1) : ''}`;

function frame() {
  if (live) step(Math.min(0.05, clock.getDelta()));
  renderer.render(scene, camera);
  placeLabels();
  if (live) requestAnimationFrame(frame);
}
const clock = new THREE.Clock();
frame();
window.__players = models.map(({ m }) => m);
// ?raytest=1 : cast rays at the first model (from +X) at several heights and log the hit groups
if (Q.get('raytest') === '1' && models[0]) {
  const m = models[0].m;
  world.updateMatrixWorld(true);
  const rc = new THREE.Raycaster();
  const base = m.object3D.position;
  const out = [];
  for (const [y, z] of [[0, 68], [0, 55], [0, 45], [0, 38], [-4.5, 20], [4.5, 20], [-4.5, 8], [4.5, 8], [-11, 50], [11, 50]]) {
    const o = gs(base.x + 200, base.y + y, z), d = gs(-1, 0, 0);
    rc.set(o, d);
    const hit = rc.intersectObjects(m.getHitboxes(), false)[0];
    out.push(`y${y} z${z}:${hit ? hit.object.userData.hitgroup + '(' + hit.object.name.replace('hitbox_', '') + ')' : '-'}`);
  }
  console.log('raytest ' + out.join('  '));
}
// ?bench=1 : time update() for 20 players
if (Q.get('bench') === '1') {
  const bm = Array.from({ length: 20 }, (_, i) => { const m = createPlayerModel(skins[i % skins.length]); m.setWeapon('ak47'); world.add(m.object3D); return m; });
  const t0 = performance.now();
  let n = 0;
  for (let f = 0; f < 300; f++) for (const m of bm) { m.update(1 / 60, { speed: (f * 7) % 250, crouch: f % 120 > 60, onGround: true, pitch: 20, firing: f % 6 === 0 }); n++; }
  const dt = performance.now() - t0;
  console.log('bench: ' + (dt / n * 1000).toFixed(1) + ' us per update, ' + (dt / 300).toFixed(2) + ' ms per frame for 20 players');
  bm.forEach((m) => m.dispose());
}
console.log('ready', tris);
}
