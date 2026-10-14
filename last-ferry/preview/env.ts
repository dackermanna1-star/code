// Environment preview: the pier world with stand-in capsule figures for scale
// (hunter 1.75 m at x≈14, zombies at x≈-15..5), a BloodSystem painting test
// splats into the deck decal map, and controls for every set piece.
//
// URL params:
//   t=0..1 time of day · q=low|medium|high · post=off|low|medium|high
//   caps=0 (no stand-ins) · blood=0 (no test blood) · panel=0 (hide the panel)
//   crane=hanging|falling|down|gone[:stateTime] · board=N/T · horn=1 · dep=0..1
//   scare=1 (scare the gulls at start) · frames=N (step N frames of 1/30 s, then stop) · warm=S (simulate S seconds first)
// window.lf = { env, stage, setT, crane, board, horn, dep, scare, bloodTest, step }
import * as THREE from 'three';
import { Stage, REFLECT_LAYER, type PostQuality } from '../src/render/Stage';
import { Environment, type EnvQuality } from '../src/render/env/Environment';
import { BloodSystem } from '../src/render/BloodSystem';
import { DECAL_RECT } from '../src/config/world';
import type { CraneState } from '../src/core/events';

const params = new URLSearchParams(location.search);
const quality = (params.get('q') as EnvQuality | null) ?? 'high';
const post = (params.get('post') as PostQuality | null) ?? 'high';
const stage = new Stage(document.getElementById('app')!, { post });
const env = new Environment(stage, { quality });
env.setTimeOfDay(Number(params.get('t') ?? 0), true);

// ---- stand-in figures ------------------------------------------------------------
const caps: THREE.Object3D[] = [];
if (params.get('caps') !== '0') {
  const mk = (x: number, z: number, h: number, color: number) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, h - 0.56 - 0.25, 6, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    body.position.y = (h - 0.25) / 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshStandardMaterial({ color: 0x9ab07a, roughness: 0.6 }));
    head.position.y = h - 0.16;
    g.add(body, head);
    g.position.set(x, 0, z);
    g.traverse((o) => {
      o.castShadow = true;
      o.layers.enable(REFLECT_LAYER);
    });
    stage.scene.add(g);
    caps.push(g);
    return g;
  };
  // The hunter (yellow oilskin) and a horde.
  const hunter = mk(14, 0.6, 1.75, 0xf2c21b);
  (hunter.children[1] as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: 0xf2c21b, roughness: 0.5 });
  const zs: Array<[number, number]> = [
    [-15, -3.8],
    [-12, 1.5],
    [-9.5, -1.0],
    [-8, 3.6],
    [-4.5, -2.6],
    [-2, 0.4],
    [1.5, 2.8],
    [3.5, -3.6],
    [5, 1.2],
    [-18, 4.2],
    [-21, -0.6],
  ];
  for (const [x, z] of zs) mk(x, z, 1.7 + Math.sin(x * 3) * 0.08, 0x4a6a50);
}

// ---- blood test ---------------------------------------------------------------------
const blood = new BloodSystem(stage.renderer, stage.scene, quality === 'low' ? 1024 : 2048);
blood.isOnFloe = (x, z) => env.isOnDeck(x, z);
env.setDecalMap(blood.texture, DECAL_RECT);
stage.onPreRender(() => blood.flush());
function bloodTest(): void {
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // Pools under "bodies", drag smears, sprays along lanes, a scorch mark.
  for (const [x, z, rad] of [
    [-11, 1.4, 0.9],
    [-6.5, -2.2, 1.2],
    [-1.5, 3.0, 0.7],
    [2.2, -0.8, 1.0],
  ]) blood.pool(x, z, rad);
  for (let i = 0; i < 8; i++) blood.splat('smear', 4 + i * 0.5, -0.6 + r() * 0.2, 0.25, { angle: 0, stretch: 2.2 });
  for (const lane of [-3.5, 0.5, 3.2]) {
    blood.spray({ x: 8, y: 1.2, z: lane }, 160, { dirX: -1, dirZ: 0, speed: [3, 11], up: [0, 3], spread: 0.3 });
  }
  blood.splat('scorch', -14, -2.5, 1.6);
  blood.splat('soot', -14, -2.5, 2.4);
  blood.splat('scorch', 8.5, 2.5, 1.1);
}
if (params.get('blood') !== '0') bloodTest();

// ---- set pieces from params -----------------------------------------------------------
const craneP = params.get('crane');
if (craneP) {
  const [st, tm] = craneP.split(':');
  env.setCrane(st as CraneState, Number(tm ?? 0));
}
let boarded = 0;
let total = 48;
env.setBoarding(boarded, total);
const boardP = params.get('board');
if (boardP) {
  [boarded, total] = boardP.split('/').map(Number);
  env.setBoarding(0, total);
  env.setBoarding(boarded, total);
}
if (params.get('horn') === '1') env.ferryHorn();
if (params.get('dep')) env.setDeparture(Number(params.get('dep')));
if (params.get('scare') === '1') env.scareGulls(0, 0, 4);
if (params.get('beam')) (env as unknown as { beamAngle: number }).beamAngle = Number(params.get('beam'));
if (params.get('beamboost')) env.backdrop.beamBoost = Number(params.get('beamboost'));

// Debug: hide objects by name (hide=Atmosphere,Glows) or disable sea shadows (nosh=1).
for (const name of (params.get('hide') ?? '').split(',').filter(Boolean)) {
  stage.scene.traverse((o) => {
    if (o.name === name) o.visible = false;
  });
}
if (params.get('nosh') === '1') env.sea.receiveShadow = false;
if (params.get('norefl') === '1') env.deckUniforms.uReflStrength.value = 0;

stage.renderer.info.autoReset = false;
stage.onUpdate((dt, time) => {
  stage.renderer.info.reset();
  blood.update(dt);
  env.update(dt, time);
});

// ---- controls ------------------------------------------------------------------------------
const info = document.getElementById('info')!;
const panel = document.getElementById('panel')!;
if (params.get('panel') === '0') panel.classList.add('hidden');
const tod = document.getElementById('tod') as HTMLInputElement;
const todv = document.getElementById('todv')!;
tod.value = String(env.timeOfDayValue);
tod.oninput = () => {
  env.setTimeOfDay(Number(tod.value));
  todv.textContent = tod.value;
};
for (const b of panel.querySelectorAll<HTMLButtonElement>('[data-crane]')) b.onclick = () => env.setCrane(b.dataset.crane as CraneState, 0);
(document.getElementById('board') as HTMLButtonElement).onclick = () => env.setBoarding(++boarded, total);
(document.getElementById('horn') as HTMLButtonElement).onclick = () => env.ferryHorn();
(document.getElementById('scare') as HTMLButtonElement).onclick = () => env.scareGulls(0, 0, 4);
(document.getElementById('blood') as HTMLButtonElement).onclick = () => bloodTest();
(document.getElementById('gun') as HTMLButtonElement).onclick = () => {
  env.ferryGunRecoil({ x: -4, y: 0.5, z: 1 });
  env.flashScreen(0.25);
};
const dep = document.getElementById('dep') as HTMLInputElement;
dep.oninput = () => env.setDeparture(Number(dep.value));

let frames = 0;
let lastFps = performance.now();
stage.onPostRender(() => {
  frames++;
  const now = performance.now();
  (window as unknown as Record<string, unknown>).lfInfo = { calls: stage.renderer.info.render.calls, tris: stage.renderer.info.render.triangles, programs: stage.renderer.info.programs?.length };
  if (now - lastFps > 1000) {
    info.textContent = `q=${quality} post=${post} t=${env.timeOfDayValue.toFixed(2)} fps=${((frames * 1000) / (now - lastFps)).toFixed(0)} calls=${stage.renderer.info.render.calls} tris=${stage.renderer.info.render.triangles}`;
    frames = 0;
    lastFps = now;
  }
});

function step(n = 1, dt = 1 / 30): void {
  for (let i = 0; i < n; i++) stage.frame(dt, i === n - 1);
}
const api = {
  env,
  stage,
  blood,
  THREE,
  step,
  setT: (t: number) => env.setTimeOfDay(t),
  crane: (s: CraneState, t = 0) => env.setCrane(s, t),
  board: (b: number, t: number) => env.setBoarding(b, t),
  horn: () => env.ferryHorn(),
  dep: (t: number) => env.setDeparture(t),
  scare: (x = 0, z = 0, s = 3) => env.scareGulls(x, z, s),
  bloodTest,
};
Object.assign(window as unknown as Record<string, unknown>, { lf: api });

const warm = Number(params.get('warm') ?? 0);
if (warm > 0) for (let i = 0; i < Math.ceil(warm * 10); i++) stage.frame(0.1, false);
const maxFrames = Number(params.get('frames') ?? 0);
if (maxFrames > 0) {
  step(maxFrames);
  (window as unknown as Record<string, unknown>).lfReady = true;
} else {
  stage.start();
  (window as unknown as Record<string, unknown>).lfReady = true;
}
