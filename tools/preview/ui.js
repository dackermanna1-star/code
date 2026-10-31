// LAST LOOKOUT — interface preview: the HUD over a stand-in valley rendered the retro way (low
// internal resolution, ordered dither, nearest upscale), a fake game state cycling through
// situations, and buttons for every sound and every effect.
//
//   ?view=fight|scope|scope-night|boss|cleared|shop|title|pause|settings|over|place|focus|hurt|fx|cycle
//   &panel=0  hide the button panel (screenshots)        &h=360  internal render height
// Playwright hooks: window.__ui = { hud, fx, audio, S, setView(name), ready }.
import * as THREE from 'three';
import { TowerHud } from '../../src/tower/ui/hud.js';
import { RIFLES, AMMO } from '../../src/tower/catalog.js';
import { TowerAudio } from '../../src/tower/audio/towerAudio.js';
import { TowerFx } from '../../src/tower/fx/towerFx.js';

const q = new URLSearchParams(location.search);
const INTERNAL_H = +(q.get('h') || 360);

// ---------------------------------------------------------------------------------------------
// renderer: low-res target -> dither/quantise -> nearest upscale

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight, false);
app.appendChild(renderer.domElement);
let rt = null;
function makeTarget() {
  const h = INTERNAL_H, w = Math.round((h * innerWidth) / innerHeight);
  if (rt) rt.dispose();
  rt = new THREE.WebGLRenderTarget(w, h, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, depthBuffer: true });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  post.material.uniforms.uSize.value.set(w, h);
  post.material.uniforms.tex.value = rt.texture;
}
const post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { tex: { value: null }, uSize: { value: new THREE.Vector2(640, 360) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D tex; uniform vec2 uSize; varying vec2 vUv;
    float bayer(vec2 p){ int x = int(mod(p.x,4.0)), y = int(mod(p.y,4.0)); int i = x + y*4;
      int b[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); for(int k=0;k<16;k++) if(k==i) return (float(b[k])+0.5)/16.0; return 0.5; }
    void main(){ vec2 px = floor(vUv * uSize); vec3 c = texture2D(tex, (px + 0.5) / uSize).rgb;
      float d = bayer(px) - 0.5; c = floor(c * 24.0 + d + 0.5) / 24.0; gl_FragColor = vec4(c, 1.0); }`,
  depthTest: false, depthWrite: false,
}));
const postScene = new THREE.Scene();
postScene.add(post);
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ---------------------------------------------------------------------------------------------
// stand-in valley

const scene = new THREE.Scene();
const DUSK = new THREE.Color(0x7a5a6a), NIGHT = new THREE.Color(0x141826);
scene.fog = new THREE.Fog(DUSK.clone(), 50, 330);
const skyGeo = new THREE.SphereGeometry(800, 24, 12);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uNight: { value: 0 } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `varying vec3 vP; uniform float uNight;
    void main(){ float h = normalize(vP).y; vec3 dusk = mix(vec3(0.95,0.55,0.32), vec3(0.24,0.16,0.34), smoothstep(0.0,0.35,h));
      dusk = mix(dusk, vec3(0.48,0.33,0.42), smoothstep(-0.05,0.0,-h)*0.6);
      vec3 night = mix(vec3(0.10,0.11,0.17), vec3(0.03,0.035,0.07), smoothstep(0.0,0.4,h));
      gl_FragColor = vec4(mix(dusk, night, uNight), 1.0); }`,
});
scene.add(new THREE.Mesh(skyGeo, skyMat));
const hemi = new THREE.HemisphereLight(0xffc9a0, 0x2a2232, 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffa070, 1.4);
sun.position.set(-200, 60, -120);
scene.add(sun);

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 256 * 256; i++) {
    const v = rnd();
    const k = v < 0.6 ? [78, 84, 46] : v < 0.85 ? [92, 88, 52] : v < 0.97 ? [64, 66, 38] : [110, 96, 60];
    img.data.set([k[0], k[1], k[2], 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(90, 90);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ map: groundTexture() }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const propMat = new THREE.MeshLambertMaterial({ color: 0x6e5a4e });
const darkMat = new THREE.MeshLambertMaterial({ color: 0x3a3430 });
const props = [
  [-55, -40, 10, 5, 8, propMat], [30, 60, 4.4, 1.5, 2, darkMat], [70, -30, 2, 1.5, 4.4, darkMat], [-20, -120, 14, 7, 9, propMat],
  [90, -140, 6, 9, 6, propMat], [-110, 70, 5, 4, 5, darkMat], [5, -60, 3, 1.4, 1.6, darkMat], [-35, -75, 1, 3, 1, darkMat],
];
for (const [x, z, w, h, d, m] of props) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, h / 2, z);
  scene.add(b);
}
// fence round the compound below the tower
const fenceMat = new THREE.MeshLambertMaterial({ color: 0x55504a });
for (let i = -7; i <= 7; i++) {
  for (const [x, z] of [[i, -7.5], [i, 7.5], [-7.5, i], [7.5, i]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), fenceMat);
    p.position.set(x, 1.1, z);
    scene.add(p);
  }
}
// shamblers: crude stand-ins walking in
const zMat = new THREE.MeshLambertMaterial({ color: 0x4b5a3a });
const zHead = new THREE.MeshLambertMaterial({ color: 0x8a8a6a });
const zombies = [];
for (let i = 0; i < 26; i++) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.3), zMat);
  body.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), zHead);
  head.position.y = 1.75;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.2), darkMat);
  legs.position.y = 0.28;
  g.add(body, head, legs);
  const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
  const r = 50 + Math.random() * 170;
  g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
  g.userData = { speed: 0.6 + Math.random() * 0.8, ph: Math.random() * 6 };
  g.lookAt(0, 0, 0);
  scene.add(g);
  zombies.push(g);
}

const EYE = new THREE.Vector3(0, 22.6, 0);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 1200);
camera.position.copy(EYE);
camera.rotation.order = 'YXZ';
let yaw = 0, pitch = -0.1;

// ---------------------------------------------------------------------------------------------
// HUD and fake state

const log = [];
const handlers = {
  onResume: () => { log.push('resume'); setView('fight'); },
  onQuit: () => { log.push('quit'); setView('title'); },
  onSetting: (k, v) => {
    log.push(`setting ${k}=${v}`);
    if (k === 'masterVol') audio.setVolume(v);
    if (k === 'musicVol') audio.setMix({ music: v });
    if (k === 'sfxVol') audio.setMix({ sfx: v });
  },
  onShopBuy: (id, info) => {
    log.push(`buy ${id} ${JSON.stringify(info)}`);
    const st = shopState;
    const r = RIFLES[id];
    if (info.kind === 'rifle') {
      if (info.action === 'equip') st.equipped.rifle = id;
      else if (st.cash >= r.price) { st.cash -= r.price; st.owned.rifles.add(id); st.equipped.rifle = id; }
    } else if (info.kind === 'ammo') {
      if (info.action === 'equip') st.equipped.ammo = id;
      else if (st.cash >= AMMO[id].price) { st.cash -= AMMO[id].price; st.owned.ammo[id] = (st.owned.ammo[id] || 0) + AMMO[id].pack; }
    } else if (info.kind === 'upgrade') {
      st.owned.upgrades[id] = (st.owned.upgrades[id] || 0) + 1;
      st.cash -= 500;
    } else {
      st.cash -= 220;
      if (id === 'repair') st.gate.hp = Math.min(st.gate.max, st.gate.hp + 250);
      else st.owned.defences[id] = (st.owned.defences[id] || 0) + 1;
    }
    S.cash = st.cash;
    hud.showShop(st);
  },
  onShopClose: () => { log.push('next wave'); hud.hideShop(); setView('boss'); },
  onPlace: (kind) => { log.push(`place ${kind}`); hud.hideShop(); S.placing = kind; S.phase = 'shop'; },
  onStart: (o) => { log.push(`start ${JSON.stringify(o)}`); audio.unlock(); audio.music('calm'); setView('fight'); },
  onRestart: () => { log.push('restart'); setView('fight'); },
};
const audio = new TowerAudio({ volume: 0.8 });
const fx = new TowerFx(scene, { onCasing: (p) => audio.casing(p) });
const hud = new TowerHud(document.body, handlers, { settings: { showFps: true }, audio });
addEventListener('pointerdown', () => audio.unlock(), { once: true });
addEventListener('keydown', () => audio.unlock(), { once: true });

const S = {
  cash: 1250, wave: 5, phase: 'fight', alive: 23, toKill: 31,
  gate: { hp: 740, max: 1000 }, player: { hp: 100, max: 100 },
  rifle: { id: 'm91', name: 'M91 Bolt', mag: 3, ammo: Infinity, reloading: false, bolting: false },
  ammoType: { id: 'fmj', name: 'FMJ', count: Infinity },
  scope: 0, zoom: 4, rangeM: null, wind: { speed: 3.2, dirScreen: 0.5 }, breath: 1, holding: false, sway: 0.35,
  focus: 0.65, focusActive: false, boss: null, placing: null, timeOfDay: 0.15, fps: 60, thermal: false, countdown: null,
};
const shopState = {
  cash: 6850, wave: 5,
  owned: { rifles: new Set(['m91', 'sr10']), upgrades: { rangefinder: 1, steady: 1, optics: 2 }, ammo: { hp: 20, ap: 0 }, defences: { wire: 2, mine: 1 } },
  equipped: { rifle: 'sr10', ammo: 'hp' }, gate: { hp: 610, max: 1000 }, countdown: 42,
};

let view = 'fight';
let viewT = 0;
const timeline = [];
function at(t, fn) {
  timeline.push({ t, fn });
}

function resetState() {
  Object.assign(S, {
    cash: 1250, wave: 5, phase: 'fight', alive: 23, toKill: 31, scope: 0, zoom: 4, rangeM: null, breath: 1, holding: false,
    focus: 0.65, focusActive: false, boss: null, placing: null, timeOfDay: 0.15, thermal: false, countdown: null, sway: 0.35,
  });
  S.gate = { hp: 740, max: 1000 };
  S.player = { hp: 100, max: 100 };
  S.rifle = { id: 'm91', name: 'M91 Bolt', mag: 3, ammo: Infinity, reloading: false, bolting: false };
  S.ammoType = { id: 'fmj', name: 'FMJ', count: Infinity };
}

function setView(name) {
  view = name;
  viewT = 0;
  timeline.length = 0;
  resetState();
  hud.hideScreens();
  hud.hideShop();
  yaw = 0;
  pitch = -0.1;
  camera.fov = 70;
  skyMat.uniforms.uNight.value = 0;
  if (name === 'fight') {
    at(0.3, () => { hud.event({ type: 'hit', head: true, kill: true }); hud.event({ type: 'bonus', text: 'HEADSHOT', cash: 20 }); hud.event({ type: 'bonus', text: 'LONG SHOT 182 m', cash: 5 }); hud.event({ type: 'killfeed', text: 'WALKER · HEADSHOT · 182 m' }); S.cash += 45; S.alive--; });
    at(0.9, () => { hud.event({ type: 'killfeed', text: 'RUNNER · 96 m' }); hud.event({ type: 'hit', kill: true }); S.cash += 35; });
    at(1.4, () => { hud.event({ type: 'bonus', text: 'COLLATERAL', cash: 150 }); hud.event({ type: 'killfeed', text: 'WALKER · COLLATERAL' }); S.cash += 150; });
    at(1.6, () => { hud.event({ type: 'gateHit' }); S.gate.hp -= 60; });
  } else if (name === 'scope' || name === 'scope-night') {
    S.scope = 1;
    S.zoom = 10;
    S.rangeM = 238.4;
    S.holding = true;
    S.breath = 0.62;
    S.rifle = { id: 'anvil', name: 'Anvil .50', mag: 4, ammo: 25, reloading: false, bolting: false };
    S.ammoType = { id: 'ap', name: 'Armour-piercing', count: 25 };
    camera.fov = 70 / 10;
    yaw = -0.05;
    pitch = -0.085;
    if (name === 'scope-night') {
      S.timeOfDay = 0.85;
      S.thermal = true;
      skyMat.uniforms.uNight.value = 1;
    }
  } else if (name === 'boss') {
    S.wave = 5;
    S.phase = 'intro';
    S.countdown = 6;
    S.boss = { name: 'Brute', hp: 2200, max: 2200 };
    at(0.05, () => hud.event({ type: 'wave', n: 5, boss: 'brute' }));
    at(1.5, () => { S.phase = 'fight'; S.countdown = null; });
    at(2.2, () => { S.boss.hp = 1500; hud.event({ type: 'hit', kill: false }); });
  } else if (name === 'cleared') {
    S.phase = 'fight';
    at(0.05, () => { hud.event({ type: 'cleared', n: 5, kills: 42, headshots: 17, bonus: 300 }); S.phase = 'cleared'; S.countdown = 8; S.cash += 300; S.alive = 0; S.toKill = 0; });
  } else if (name === 'shop') {
    S.phase = 'shop';
    hud.showShop(shopState);
  } else if (name === 'title') {
    hud.showTitle({ bestWave: 12, bestScore: 48210, continueWave: 7 });
  } else if (name === 'pause') {
    hud.showPause({ wave: 5, cash: 1250 });
  } else if (name === 'settings') {
    hud.showPause({ wave: 5, cash: 1250 });
    hud.screens.openSettings('pause');
  } else if (name === 'over') {
    hud.showGameOver({ wave: 9, kills: 214, headshots: 87, longest: 246.3, shots: 301, hits: 233, cashEarned: 18450, score: 51230, best: { wave: 9, score: 51230 }, newBest: true, cause: 'gate' });
  } else if (name === 'place') {
    S.phase = 'shop';
    S.placing = 'wire';
    pitch = -0.35;
  } else if (name === 'focus') {
    S.focusActive = true;
    S.focus = 0.4;
    S.scope = 1;
    S.zoom = 6;
    S.rangeM = 121;
    camera.fov = 70 / 6;
    pitch = -0.17;
  } else if (name === 'fx' || name === 'fx-night') {
    pitch = -0.2;
    if (name === 'fx-night') { S.timeOfDay = 0.9; skyMat.uniforms.uNight.value = 1; }
    fx.clear();
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    at(0.02, () => { fx.fire(V(16, 0, -70), 2.5, 30); fx.gasCloud(V(42, 0, -95), 7, 30); });
    at(0.3, () => fx.explosion(V(-16, 0, -62), 1.3));
    at(0.5, () => { fx.bloodMist(V(2, 1.6, -48), V(0.3, 0.15, -1).normalize(), 1.6); fx.impact(V(-4, 0, -40), V(0, 1, 0), 'dirt'); });
    at(0.55, () => { fx.impact(V(8, 1.2, -36), V(0, 0.3, 1).normalize(), 'metal'); fx.impact(V(-30, 2, -80), V(0, 0, 1), 'wood'); });
    at(0.6, () => { const m = muzzlePos(); fx.tracer(m.p, V(2, 1.6, -48)); fx.dust(V(24, 0, -40)); });
  } else if (name === 'fx-scope') {
    S.scope = 1;
    S.zoom = 8;
    S.rangeM = 212;
    camera.fov = 70 / 8;
    yaw = 0.0;
    pitch = Math.atan2(-21, 212);
    fx.clear();
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    at(0.2, () => { fx.bloodMist(V(0, 1.6, -212), V(0.1, 0.1, -1).normalize(), 1.5); fx.impact(V(3, 0, -208), V(0, 1, 0), 'dirt'); fx.explosion(V(-14, 0, -240), 0.8); });
  } else if (name === 'hurt') {
    S.player.hp = 22;
    at(0.1, () => { hud.event({ type: 'playerHurt' }); S.player.hp = 18; });
    at(0.5, () => hud.event({ type: 'gateHit' }));
  }
}
const CYCLE = ['fight', 'scope', 'boss', 'cleared', 'shop', 'scope-night', 'fx', 'title', 'over', 'pause', 'place', 'focus'];
let cycleI = 0, cycleT = 0;

// ---------------------------------------------------------------------------------------------
// panel

const panel = document.getElementById('panel');
if (q.get('panel') === '0') panel.classList.add('hidden');
function section(title, items) {
  const h = document.createElement('h3');
  h.textContent = title;
  panel.appendChild(h);
  for (const [label, fn] of items) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => {
      if (audio) audio.unlock();
      fn();
    };
    panel.appendChild(b);
  }
}
section('VIEWS', CYCLE.concat(['settings', 'hurt', 'fx-night', 'fx-scope']).map((v) => [v, () => setView(v)]));
section('HUD EVENTS', [
  ['hit', () => hud.event({ type: 'hit' })], ['head', () => hud.event({ type: 'hit', head: true })],
  ['kill', () => hud.event({ type: 'hit', kill: true })], ['headkill', () => hud.event({ type: 'hit', head: true, kill: true })],
  ['bonus', () => { hud.event({ type: 'bonus', text: 'HEADSHOT', cash: 20 }); S.cash += 20; }],
  ['wave', () => hud.event({ type: 'wave', n: S.wave, boss: null })], ['gateHit', () => hud.event({ type: 'gateHit' })],
  ['hurt', () => hud.event({ type: 'playerHurt' })], ['shot', () => { hud.event({ type: 'shot' }); S.rifle.mag = Math.max(0, S.rifle.mag - 1); }],
  ['reload', () => { S.rifle.mag = RIFLES[S.rifle.id].mag; }],
]);
// where the view ray meets the ground (FX land in the middle of the screen in any view)
const _ray = new THREE.Vector3();
function aimPoint(dist = 70) {
  camera.getWorldDirection(_ray);
  const t = _ray.y < -0.02 ? Math.min(dist * 4, -camera.position.y / _ray.y) : dist;
  return camera.position.clone().addScaledVector(_ray, t).setY(0);
}
const up = new THREE.Vector3(0, 1, 0);
function muzzlePos() {
  camera.getWorldDirection(_ray);
  const right = new THREE.Vector3().crossVectors(_ray, up).normalize();
  return { p: camera.position.clone().addScaledVector(_ray, 0.9).addScaledVector(right, 0.08).add(new THREE.Vector3(0, -0.12, 0)), d: _ray.clone(), right };
}
section('FX', [
  ['explosion', () => { const p = aimPoint(); fx.explosion(p, 1); audio.explosion(p, 1); }],
  ['big boom', () => { const p = aimPoint(); fx.explosion(p, 2); audio.explosion(p, 2); }],
  ['fire', () => { const p = aimPoint(); fx.fire(p, 2.5, 12); audio.fire(p, true); setTimeout(() => audio.fire(p, false), 12000); }],
  ['gas', () => fx.gasCloud(aimPoint(), 6, 10)],
  ['muzzle', () => { const m = muzzlePos(); fx.muzzle(m.p, m.d, {}); }],
  ['muzzle brake', () => { const m = muzzlePos(); fx.muzzle(m.p, m.d, { brake: true }); }],
  ['tracer', () => { const m = muzzlePos(); fx.tracer(m.p, aimPoint().setY(1)); }],
  ['dirt', () => { const p = aimPoint(); fx.impact(p, up, 'dirt'); audio.bulletImpact('dirt', p, p.distanceTo(camera.position)); }],
  ['wood', () => { const p = aimPoint().setY(1.2); fx.impact(p, up, 'wood'); audio.bulletImpact('wood', p, p.distanceTo(camera.position)); }],
  ['metal', () => { const p = aimPoint().setY(1); fx.impact(p, up, 'metal'); audio.bulletImpact('metal', p, p.distanceTo(camera.position)); }],
  ['concrete', () => { const p = aimPoint(); fx.impact(p, up, 'concrete'); audio.bulletImpact('concrete', p, p.distanceTo(camera.position)); }],
  ['flesh', () => { const p = aimPoint().setY(1.4); fx.impact(p, up, 'flesh'); audio.bulletImpact('flesh', p, p.distanceTo(camera.position)); }],
  ['blood mist', () => { const p = aimPoint().setY(1.6); const m = muzzlePos(); fx.bloodMist(p, m.d, 1.2); }],
  ['dust', () => fx.dust(aimPoint())],
  ['casing', () => { const m = muzzlePos(); fx.shellCasing(m.p.clone().addScaledVector(m.d, -0.6), m.right.clone().add(new THREE.Vector3(0, 0.3, 0))); }],
]);
const rifleShot = (id) => () => {
  const m = muzzlePos();
  audio.rifle(id, {});
  fx.muzzle(m.p, m.d, { suppressed: id === 'whisper', brake: id === 'anvil' });
  const p = aimPoint().setY(1);
  fx.tracer(m.p, p);
  const d = p.distanceTo(camera.position);
  setTimeout(() => { fx.impact(p, up, 'dirt'); audio.bulletImpact('dirt', p, d); }, 1000 * d / 820);
  hud.event({ type: 'shot' });
  S.rifle.mag = Math.max(0, S.rifle.mag - 1);
  if (RIFLES[id].action === 'bolt') setTimeout(() => { audio.bolt(id); fx.shellCasing(m.p.clone().addScaledVector(m.d, -0.6), m.right.clone().add(new THREE.Vector3(0, 0.3, 0))); }, 450);
  else fx.shellCasing(m.p.clone().addScaledVector(m.d, -0.6), m.right.clone().add(new THREE.Vector3(0, 0.3, 0)));
};
section('RIFLES', [
  ['m91', rifleShot('m91')], ['sr10', rifleShot('sr10')], ['whisper', rifleShot('whisper')], ['anvil', rifleShot('anvil')],
  ['bolt', () => audio.bolt('m91')], ['charge', () => audio.bolt('sr10')], ['magOut', () => audio.magOut('sr10')],
  ['magIn', () => audio.magIn('sr10')], ['clip', () => audio.magIn('m91')], ['dry', () => audio.dryFire()],
]);
const zpos = () => aimPoint(60).setY(1.6);
section('SOUNDS', [
  ['headshot', () => audio.headshotCrack(zpos())], ['thump', () => audio.distantThump(aimPoint(150))],
  ['groan', () => audio.zombieGroan('walker', zpos())], ['runner', () => audio.zombieGroan('runner', zpos())],
  ['bloater', () => audio.zombieGroan('bloater', zpos())], ['armored', () => audio.zombieGroan('armored', zpos())],
  ['scream', () => audio.zombieScream(zpos())], ['brute roar', () => audio.bossRoar('brute', zpos())],
  ['jugg roar', () => audio.bossRoar('juggernaut', zpos())], ['gate hit', () => audio.gateHit(0.8)], ['gate break', () => audio.gateBreak()],
  ['body fall', () => audio.bodyFall(zpos(), 1)], ['bone', () => audio.boneCrack(zpos(), 1)],
  ['siren', () => audio.waveSiren()], ['cleared', () => audio.waveCleared()], ['cash', () => audio.cash()],
  ['ui click', () => audio.ui('click')], ['ui buy', () => audio.ui('buy')], ['ui deny', () => audio.ui('deny')], ['ui open', () => audio.ui('open')],
  ['breath on', () => audio.breathHold(true)], ['breath off', () => audio.breathHold(false)], ['gasp', () => audio.breathHold(false, { gasp: true })],
  ['slowmo on', () => audio.slowMo(true)], ['slowmo off', () => audio.slowMo(false)],
  ['heart 110', () => audio.heartbeat(110)], ['heart off', () => audio.heartbeat(0)],
  ['casing', () => audio.casing(camera.position.clone().add(new THREE.Vector3(0.4, -1.2, 0)))],
  ['climb', () => audio.climb(new THREE.Vector3(2.4, 12, 2.4))], ['thermal', () => audio.thermal(true)],
  ['scope', () => audio.scope(true)], ['zoom', () => audio.zoomClick()],
]);
section('AMBIENCE / MUSIC', [
  ['dusk', () => audio.ambience(0.1, 3, 0)], ['night', () => audio.ambience(0.9, 2, 0)], ['rain', () => audio.ambience(0.7, 5, 0.8)],
  ['windy', () => audio.ambience(0.3, 9, 0)], ['horde 10 far', () => audio.horde(10, 180)], ['horde 60 near', () => audio.horde(60, 25)],
  ['horde off', () => audio.horde(0, 999)],
  ['music calm', () => audio.music('calm')], ['music fight', () => audio.music('fight')], ['music boss', () => audio.music('boss')], ['music off', () => audio.music('off')],
]);
addEventListener('keydown', (e) => {
  if (e.key === '`') panel.classList.toggle('hidden');
});

// ---------------------------------------------------------------------------------------------
// loop

let last = performance.now();
const tmpV = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  viewT += dt;
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (viewT >= timeline[i].t) {
      timeline[i].fn();
      timeline.splice(i, 1);
    }
  }
  if (view === 'cycle') {
    cycleT += dt;
    if (cycleT > 5) {
      cycleT = 0;
      cycleI = (cycleI + 1) % CYCLE.length;
      const v = CYCLE[cycleI];
      setView(v);
      view = 'cycle';
    }
  }
  // world
  for (const z of zombies) {
    const u = z.userData;
    tmpV.set(-z.position.x, 0, -z.position.z);
    const d = tmpV.length();
    if (d > 9) z.position.addScaledVector(tmpV.normalize(), u.speed * dt);
    z.children[0].rotation.z = Math.sin(now / 400 + u.ph) * 0.08;
  }
  const n = skyMat.uniforms.uNight.value;
  scene.fog.color.copy(DUSK).lerp(NIGHT, n);
  hemi.intensity = 1.5 - 1.1 * n;
  sun.intensity = 1.4 * (1 - n);
  const sway = S.scope > 0.5 ? (S.holding ? 0.15 : 1) * 0.004 : 0;
  camera.rotation.set(pitch + Math.sin(now / 700) * sway, yaw + Math.sin(now / 1100) * sway, 0);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  fx.update(dt, camera);
  {
    camera.getWorldDirection(tmpV);
    audio.setListener(camera.position, tmpV);
  }
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
  S.fps = 1 / Math.max(dt, 1e-3);
  hud.update(dt, S);
}
makeTarget();
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  makeTarget();
});
setView(q.get('view') || 'fight');
if (q.get('view') === 'cycle') view = 'cycle';
requestAnimationFrame(frame);

window.__ui = { hud, S, setView, fx, audio, log, ready: true, shopState, scene, camera, aimPoint, muzzlePos, THREE };
window.__sim = { ready: true };
