// LAST LOOKOUT — the browser front end: input, the sniper's eye and scope, rendering, sound,
// effects, the HUD and menus around the headless game (game/game.js).
import * as THREE from 'three';
import { Vec3, clamp, lerp, makeRng } from '../physics/math.js';
import { World } from '../physics/world.js';
import { Ragdoll } from '../human/ragdoll.js';
import { BodyShape } from '../human/bodyShape.js';
import * as OM from '../render/objectMeshes.js';
import { FpsView } from '../render/fpsView.js';
import { KillCam } from '../modes/killCam.js';
import { XRayRig } from '../render/xray.js';
import { LAYOUT, isWalkable, lookoutEye, buildWalkGrid, isWater } from './level/layout.js';
import { TowerGame } from './game/game.js';
import { RIFLES, AMMO, ENEMIES, WAVES, UPGRADES, DEFENCES } from './catalog.js';
import { WEAPONS, raycastPeople } from '../game/weapons.js';
import { RetroRenderer, buildLevelScene, prepareZombieMeshes, createZombieVisual, AnimPlayer, CLIP_INFO, TowerHud, TowerAudio, TowerFx } from './parts.js';
import { HoldoutFront } from './holdout/front.js';

const FIXED = 1 / 60;
const SAVE_KEY = 'lastLookout.v1';
const BASE_FOV = 72;
// the sniper's eye: at the window he looks through, leaning out when looking down (smoothed)
const EYE = new Vec3(...lookoutEye(Math.PI, -0.12));
const eyeTarget = [0, 0, 0];

// ---------------------------------------------------------------------------------------------
// persistence
function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY)) || {};
  } catch {
    return {};
  }
}
function writeSave(s) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* private mode: no saves */
  }
}
const save = loadSave();
save.settings = { mouseSens: 1, scopeSens: 1, invertY: false, masterVol: 0.85, musicVol: 0.6, sfxVol: 1, quality: 'medium', showFps: false, killcam: true, ...(save.settings || {}) };

// ---------------------------------------------------------------------------------------------
// the game
const segNames = new Ragdoll(new World()).segList.map((s) => s.name);
const shape = new BodyShape(segNames);
const game = new TowerGame({
  layout: LAYOUT, isWalkable, shape, rng: makeRng((Math.random() * 1e9) | 0),
  makeAnim: (rd, seed) => new AnimPlayer(rd, { seed }), clipInfo: CLIP_INFO, walkGrid: buildWalkGrid(1),
  maxPhysical: save.settings.quality === 'low' ? 7 : save.settings.quality === 'high' ? 12 : 10,
});

// ---------------------------------------------------------------------------------------------
// rendering
const app = document.getElementById('app');
const retro = new RetroRenderer(app, { quality: save.settings.quality });
const renderer = retro.renderer;
const canvas = renderer.domElement;
const level = buildLevelScene(LAYOUT, {
  renderer,
  // thunder rolls in at the speed of sound after the flash
  onLightning: (delay, p) => setTimeout(() => audio.explosion(new Vec3(p[0], p[1], p[2]), 2.2), delay * 1000),
});
const scene = level.scene;
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 1200);
camera.rotation.order = 'YXZ';
const view = new FpsView(OM, camera.aspect);
view.setWeapon('sniper');
const audio = new TowerAudio();
audio.setMix({ master: save.settings.masterVol, music: save.settings.musicVol, sfx: save.settings.sfxVol });
const fx = new TowerFx(scene, { onCasing: (p) => audio.casing(p) });
let meshesReady = false;
prepareZombieMeshes().then(() => (meshesReady = true));
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  retro.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  view.setAspect(camera.aspect);
  killCam.setAspect(camera.aspect);
}

// ---------------------------------------------------------------------------------------------
// thermal sight: the world cold and grey, bodies white hot (material swap, one pass, walls still
// hide what is behind them)
const COLD = new THREE.MeshBasicMaterial({ color: 0x2b2f2c, fog: true });
const COLD_SKY = new THREE.Color(0x0d0f0e);
const HOT = new THREE.MeshBasicMaterial({ color: 0xf4f8f0 });
const savedMats = new Map();
let thermalOn = false;
function setThermal(on) {
  if (on === thermalOn) return;
  thermalOn = on;
  if (on) {
    savedMats.clear();
    scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh && !o.isPoints && !o.isLine) return;
      savedMats.set(o, o.material);
      const hot = !!o.userData.zombie || !!(o.parent && o.parent.userData && o.parent.userData.zombie);
      o.material = hot ? HOT : o.isPoints || o.isLine ? o.material : COLD;
    });
    savedMats.bg = scene.background;
    scene.background = COLD_SKY;
    retro.setThermal(1);
  } else {
    for (const [o, m] of savedMats) o.material = m;
    scene.background = savedMats.bg;
    savedMats.clear();
    retro.setThermal(0);
  }
}

// ---------------------------------------------------------------------------------------------
// zombie visuals
const visuals = new Map(); // zombie -> { v, decals, dirty, t }
function attachVisual(z) {
  if (visuals.has(z)) return;
  const v = createZombieVisual(z.person, z.kind, scene);
  v.zombie = z;
  v.object.userData.zombie = true;
  v.object.traverse((o) => (o.userData.zombie = true));
  if (thermalOn) {
    v.object.traverse((o) => {
      if (o.isMesh) {
        savedMats.set(o, o.material);
        o.material = HOT;
      }
    });
  }
  visuals.set(z, { v, decals: [], dirty: false, t: 0 });
}
function detachVisual(z) {
  const r = visuals.get(z);
  if (!r) return;
  r.v.dispose();
  visuals.delete(z);
  const xr = xrays.get(z.person);
  if (xr) {
    xr.dispose();
    xrays.delete(z.person);
  }
}
const WOUND_KIND = { entry: 0, exit: 1, laceration: 2, bruise: 3, stab: 2, incised: 2 };
function addWound(z, w) {
  const r = visuals.get(z);
  if (!r) return;
  const seg = w.seg;
  const bindPos = w.body.userData.fragment ? w.body.userData.bindPos : seg.bindPos;
  const modelPos = shape.localToModel(seg.name, bindPos, w.local, new Vec3());
  const mp = shape.modelPose[seg.name];
  const dir = w.dir ? w.dir.clone().applyQuat(mp.q) : null;
  r.decals.push({ wound: w, modelPos, radius: w.radius, kind: WOUND_KIND[w.kind] ?? 0, age: 0, severity: w.severity ?? 0.5, seed: w.seed ?? Math.random(), dir });
  r.dirty = true;
}

// X-ray rigs for the kill cam
const xrays = new Map();
const killCam = new KillCam({
  renderer, canvas,
  audio: { gunshot() {}, whoosh: () => audio.slowMo(true), bulletImpact: (k, p) => audio.headshotCrack(p) },
  sandbox: () => game.sb,
  scene: () => scene,
  xray: (person) => {
    let rig = xrays.get(person);
    if (!rig) {
      rig = new XRayRig(person, scene, { floorY: 0 });
      xrays.set(person, rig);
    }
    return rig;
  },
  ghost: (person, on) => {
    const z = person.towerZombie, r = z && visuals.get(z);
    if (r && r.v.hm) XRayRig.setGhost(r.v.hm, on);
    if (r && r.v.setGearVisible) r.v.setGearVisible(!on);
  },
  hideUi: (on) => {
    document.body.classList.toggle('killcam', on);
    if (hudRoot) hudRoot.style.visibility = on ? 'hidden' : '';
  },
  overlay: null,
});
killCam.mode = 'always';
let killCamCooldown = 0;
// the game asks before each step of a round's flight whether the kill cam wants it
game.killcam = {
  consider(b, origin, dir) {
    if (!save.settings.killcam || killCam.active || killCamCooldown > 0) return false;
    const sb = game.sb;
    const hit = sb.pick(origin, dir, 30);
    if (!hit || !hit.person || !hit.body || !hit.person.injury.alive) return false;
    const z = hit.person.towerZombie;
    if (!z) return false;
    const seg = hit.body.userData.segment ? hit.body.userData.segment.name : '';
    const head = seg === 'head' || seg === 'neck';
    const dist = b.travelled + hit.t;
    const last = game.director.toKill <= 1 && game.director.phase === 'fight';
    let lined = 0;
    for (const h of raycastPeople(sb.people, sb.shape, origin, dir, hit.t + 25)) if (h.person.injury.alive && h.person.towerZombie) lined++;
    const want = (z.def.boss && z.person.injury.hp < 900) || (head && (dist > 170 || last || game.rng() < 0.12)) || (last && dist > 60) || lined >= 3;
    if (!want) return false;
    game.wakeAlong(origin, dir, hit.t + 30);
    game.killcamShot = b.shot;
    b.shot.dist = dist;
    killCam.start(b.shot.weaponKey, origin.clone().addScaled(dir, -2), dir.clone(), hit, seg, null);
    killCamCooldown = 14;
    audio.slowMo(true);
    return true;
  },
};

// ---------------------------------------------------------------------------------------------
// HUD
let hudRoot = null;
let mode = 'tower'; // 'tower' (Last Lookout) | 'holdout' (the on-foot mode)
let holdout = null;
const hud = new TowerHud(document.body, {
  onStart: (o) => (o && o.mode === 'holdout' ? enterHoldout() : startRun(!!(o && o.continue))),
  onResume: () => (mode === 'holdout' ? holdout.resume() : resume()),
  onQuit: () => toTitle(),
  onRestart: () => (mode === 'holdout' ? holdout.newRun() : startRun(false)),
  onSetting: (k, v) => setSetting(k, v),
  onShopBuy: (id, info) => shopBuy(id, info),
  onShopClose: () => closeShop(),
  onPlace: (id) => buyAndPlace(id),
  onUi: (kind) => audio.ui(kind),
}, { audio, settings: save.settings });
hudRoot = hud.root || null;

function setSetting(k, v) {
  save.settings[k] = v;
  writeSave(save);
  if (k === 'masterVol' || k === 'musicVol' || k === 'sfxVol') audio.setMix({ master: save.settings.masterVol, music: save.settings.musicVol, sfx: save.settings.sfxVol });
  if (k === 'quality') {
    retro.setQuality(v);
    game.horde.maxPhysical = v === 'low' ? 7 : v === 'high' ? 12 : 10;
  }
  if (holdout && holdout.built) holdout.applySettings();
}

// ---------------------------------------------------------------------------------------------
// HOLDOUT: the on-foot mode in the same valley (holdout/front.js runs the frame while it is on)
holdout = new HoldoutFront({
  retro, level, camera, view, audio, fx, hud, OM, shape, createZombieVisual, prepareZombieMeshes,
  save, writeSave, quality: () => save.settings.quality,
});
function enterHoldout() {
  audio.unlock();
  if (!meshesReady) {
    prepareZombieMeshes().then(() => {
      meshesReady = true;
      enterHoldout();
    });
    return;
  }
  // put the tower's run away: its dead, its traps
  started = false;
  paused = false;
  for (const z of [...visuals.keys()]) detachVisual(z);
  game.horde.clear();
  game.drainEvents();
  for (const t of trapMeshes.values()) level.removeTrapMesh(t);
  trapMeshes.clear();
  overView = null;
  mode = 'holdout';
  holdout.enter();
}
function exitHoldout() {
  if (mode !== 'holdout') return;
  holdout.exit();
  mode = 'tower';
  input.fireQueued = false;
  input.scoped = false;
  input.scopeHold = false;
}

// ---------------------------------------------------------------------------------------------
// input
const input = { yaw: Math.PI, pitch: -0.12, scoped: false, scopeHold: false, firing: false, breath: false, keys: new Set() };
let locked = false;
window.addEventListener('pointerdown', () => audio.unlock());
canvas.addEventListener('click', () => {
  if (phase() === 'play' || placing) canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && phase() === 'play' && !placing && !paused) pause();
});
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
  const zoomK = 1 / lerp(1, game.zoom, scopeView) ** 0.92;
  const sens = 0.0022 * (scopeView > 0.5 ? save.settings.scopeSens : save.settings.mouseSens) * zoomK;
  input.yaw -= e.movementX * sens;
  input.pitch = clamp(input.pitch - e.movementY * sens * (save.settings.invertY ? -1 : 1), -1.45, 0.75);
});
canvas.addEventListener('mousedown', (e) => {
  if (!locked) return;
  if (e.button === 0) {
    if (placing) placeHere();
    else input.fireQueued = true;
  } else if (e.button === 2) input.scopeHold = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 2) input.scopeHold = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  audio.unlock();
  const k = e.code;
  input.keys.add(k);
  if (k === 'Escape' && placing) {
    endPlacement();
    return;
  }
  if (phase() !== 'play') return;
  if (k === 'KeyE' && !e.repeat) input.scoped = !input.scoped;
  else if (k === 'KeyR') {
    if (placing) placeYaw += Math.PI / 4;
    else game.reload();
  } else if (k === 'KeyT') game.cycleAmmo();
  else if (k === 'KeyF') game.toggleFocus();
  else if (k === 'KeyV' && game.upgradeLevel('thermal')) thermal = !thermal;
  else if (k === 'Space' && killCam.active) killCam.skip();
  else if (k.startsWith('Digit')) {
    const order = Object.keys(RIFLES).filter((id) => game.owned.rifles.has(id));
    const id = order[+k.slice(5) - 1];
    if (id && id !== game.rifle.id) game.equip('rifle', id);
  }
});
window.addEventListener('keyup', (e) => input.keys.delete(e.code));
window.addEventListener('resize', resize);

// ---------------------------------------------------------------------------------------------
// state
let paused = false;
let started = false;
let scopeAmt = 0; // 0..1 how far the rifle is raised to the eye
let scopeView = 0; // 0..1 the eye in the scope (zoom)
let breath = 1, breathShake = 0, holding = false;
let thermal = false;
let swayT = 0;
let recoil = 0, shake = 0;
let placing = null, placeYaw = 0, placeGhost = null, placeRefund = 0;
let fpsAvg = 60;
let overView = null; // the camera turning to the broken gate
const aimDir = new Vec3();

function phase() {
  if (!started) return 'title';
  if (game.over) return 'over';
  if (game.director.phase === 'shop') return 'shop';
  return 'play';
}

function startRun(cont) {
  audio.unlock();
  if (!meshesReady) {
    prepareZombieMeshes().then(() => {
      meshesReady = true;
      startRun(cont);
    });
    return;
  }
  for (const z of [...visuals.keys()]) detachVisual(z);
  game.newRun(cont && save.run ? save.run : null);
  for (const t of trapMeshes.values()) level.removeTrapMesh(t);
  trapMeshes.clear();
  // traps restored from a save
  for (const t of [...game.defences.wires, ...game.defences.mines, ...game.defences.barrels]) onTrapPlaced(t);
  if (game.defences.sentry) onTrapPlaced(game.defences.sentry);
  for (const id of game.defences.floodlights) level.addFloodlight(id);
  started = true;
  paused = false;
  overView = null;
  hud.hideScreens();
  if (cont && save.run) openShop();
  else {
    game.nextWave();
    canvas.requestPointerLock();
  }
  audio.music('calm');
}

function toTitle() {
  exitHoldout();
  started = false;
  paused = false;
  document.exitPointerLock();
  hud.showTitle({ bestWave: save.bestWave || 0, bestScore: save.bestScore || 0, continueWave: save.run ? save.run.wave : 0, holdoutBest: save.holdoutBest || 0 });
  audio.music('calm');
}

function pause() {
  paused = true;
  hud.showPause();
}

function resume() {
  paused = false;
  hud.hideScreens();
  canvas.requestPointerLock();
}

// ---------------------------------------------------------------------------------------------
// shop and placement
function shopState() {
  const D = game.defences;
  const placed = {
    wire: D.wires.length, mine: D.mines.length, barrel: D.barrels.length, floodlight: D.floodlights.size,
    sentry: D.sentry ? 1 : 0, steelGate: game.owned.defences.steelGate || 0,
  };
  return { cash: game.cash, wave: game.director.wave, owned: { ...game.owned, defences: placed }, equipped: game.equipped, gate: game.gate, sentry: D.sentry };
}
function openShop() {
  document.exitPointerLock();
  save.run = game.serialize();
  writeSave(save);
  hud.showShop(shopState());
  audio.music('calm');
}
function refreshShop() {
  hud.showShop(shopState());
}
function catOf(id) {
  return RIFLES[id] ? 'rifle' : AMMO[id] ? 'ammo' : UPGRADES[id] ? 'upgrade' : DEFENCES[id] ? 'defence' : null;
}
function shopBuy(id, info = {}) {
  const cat = catOf(id);
  const r = info.action === 'equip' ? game.equip(cat, id) : game.buy(cat, id);
  audio.ui(r.ok ? (info.action === 'equip' ? 'equip' : 'buy') : 'error');
  refreshShop();
  return r;
}
/** PLACE on a defence card: pay for one and put it down from the tower (refunded if cancelled). */
function buyAndPlace(id) {
  const r = game.buy('defence', id);
  audio.ui(r.ok ? 'buy' : 'error');
  if (!r.ok || !r.place) {
    refreshShop();
    return;
  }
  beginPlacement(id, DEFENCES[id].price);
}
function closeShop() {
  hud.hideShop();
  game.nextWave();
  canvas.requestPointerLock();
}

function beginPlacement(kind, refund = 0) {
  placing = kind;
  placeRefund = refund;
  placeYaw = input.yaw;
  hud.hideShop();
  canvas.requestPointerLock();
}
function endPlacement() {
  // (put back what was paid for and not placed)
  if (placing && game.owned.defences[placing] > 0 && placeRefund) {
    game.owned.defences[placing]--;
    game.cash += placeRefund;
  }
  placing = null;
  if (placeGhost) {
    level.removeTrapMesh(placeGhost);
    placeGhost = null;
  }
  if (phase() === 'shop') openShop();
}
function groundPoint(out) {
  // where the crosshair meets the ground
  const d = aimDir;
  if (d.y > -0.01) return null;
  const t = -EYE.y / d.y;
  return out.set(EYE.x + d.x * t, 0, EYE.z + d.z * t);
}
const _gp = new Vec3();
function placeHere() {
  const p = groundPoint(_gp);
  if (!p) return;
  const r = game.placeTrap(placing, p, placeYaw);
  audio.ui(r.ok ? 'place' : 'error');
  if (!r.ok) hud.event({ type: 'alert', text: r.msg.toUpperCase() });
  if (r.ok && !(game.owned.defences[placing] > 0)) {
    placeRefund = 0;
    endPlacement();
  }
}

const trapMeshes = new Map();
function onTrapPlaced(t) {
  if (t.kind === 'wire') {
    const c = new Vec3().addVectors(t.a, t.b).scale(0.5);
    trapMeshes.set(t, level.placeTrapMesh('wire', c, Math.atan2(-(t.b.z - t.a.z), t.b.x - t.a.x)));
  } else if (t.kind === 'sentry') trapMeshes.set(t, level.placeTrapMesh('sentry', t.pos, 0));
  else trapMeshes.set(t, level.placeTrapMesh(t.kind, t.pos, 0));
}

// ---------------------------------------------------------------------------------------------
// events from the game
let bossZombie = null;
let waveStartHs = 0;
const groanT = new Map();
function onEvent(e) {
  switch (e.type) {
    case 'zombieSpawned':
      attachVisual(e.zombie);
      break;
    case 'corpseRemoved':
    case 'zombieRemoved':
      detachVisual(e.zombie);
      break;
    case 'fire': {
      audio.rifle(e.rifle, { suppressed: e.suppressed });
      hud.event({ type: 'shot' });
      view.fire(WEAPONS[RIFLES[e.rifle].weapon].recoil, scopeAmt);
      recoil += RIFLES[e.rifle].kick;
      shake = Math.min(1, shake + RIFLES[e.rifle].kick * 4);
      const mz = new Vec3().copy(e.origin).addScaled(e.dir, 0.9);
      mz.y -= 0.08;
      fx.muzzle(mz, e.dir, { suppressed: e.suppressed, brake: e.rifle === 'anvil', size: e.rifle === 'anvil' ? 1.6 : 1 });
      if (!e.suppressed) level.scare(e.origin);
      break;
    }
    case 'dry':
      audio.dryFire();
      break;
    case 'reloadStart':
      audio.magOut(game.rifle.id);
      break;
    case 'reloadEnd':
      audio.magIn(game.rifle.id);
      break;
    case 'cycle': {
      audio.bolt(game.rifle.id);
      const cp = EYE.clone().addScaled(aimDir, 0.45);
      cp.y -= 0.12;
      fx.shellCasing(cp, new Vec3(Math.cos(input.yaw), 0.4, -Math.sin(input.yaw)));
      break;
    }
    case 'impact': {
      const water = e.material === 'dirt' && isWater(e.point.x, e.point.z);
      audio.bulletImpact(water ? 'water' : e.material, e.point, e.dist);
      fx.impact(e.point, e.normal || new Vec3(0, 1, 0), water ? 'water' : e.material);
      fx.tracer(EYE, e.point);
      break;
    }
    case 'hit':
      hud.event({ type: 'hit', head: e.head, kill: false });
      audio.hitMarker(e.head, false);
      if (e.point) fx.tracer(EYE, e.point);
      if (e.head && !e.armor) audio.headshotCrack(e.point || e.zombie.person.rd.segments.head.body.pos);
      break;
    case 'armor':
      audio.bulletImpact('metal', e.point, e.point.distanceTo(EYE));
      if (e.part === 'helmet' && e.left === 0) {
        const r = visuals.get(e.zombie);
        if (r && r.v.dropHelmet) r.v.dropHelmet(new Vec3(Math.random() - 0.5, 1, Math.random() - 0.5), () => 0);
        hud.event({ type: 'alert', text: 'HELMET OFF' });
      }
      fx.impact(e.point, new Vec3(0, 1, 0), 'metal');
      break;
    case 'kill': {
      hud.event({ type: 'hit', head: e.head, kill: true });
      const p = e.zombie.person.rd.pelvis.pos;
      hud.event({ type: 'bonus', text: e.bonuses.length ? e.bonuses.join(' · ') : ENEMIES[e.zombie.kind].name.toUpperCase(), cash: e.cash, pos: p.clone() });
      hud.event({ type: 'killfeed', text: `${ENEMIES[e.zombie.kind].name}${e.head ? ' · headshot' : ''}${e.dist ? ` · ${Math.round(e.dist)} m` : ''}` });
      if (e.bonuses.length) audio.cash();
      hud.event({ type: 'cash', amount: e.cash });
      if (e.zombie === bossZombie) bossZombie = null;
      break;
    }
    case 'bone':
      audio.boneCrack(e.point, 0.8);
      break;
    case 'zombieAtGate':
      audio.zombieGroan(e.zombie.kind, e.zombie.root.pos);
      break;
    case 'gateHit':
      audio.gateHit(1 - e.hp / e.max);
      hud.event({ type: 'gateHit' });
      for (const gt of LAYOUT.compound.gates) level.gateMesh(gt.id).setDamage(1 - e.hp / e.max);
      break;
    case 'gateRepaired':
      for (const gt of LAYOUT.compound.gates) {
        const gm = level.gateMesh(gt.id);
        if (e.steel) gm.setSteel(true);
        gm.setDamage(1 - e.hp / e.max);
      }
      break;
    case 'climberTop':
      audio.zombieScream(e.zombie.root.pos);
      break;
    case 'playerHurt':
      hud.event({ type: 'playerHurt' });
      audio.playerHurt(1 - e.hp / game.player.max);
      break;
    case 'scream':
      audio.zombieScream(e.pos);
      break;
    case 'tripped':
      audio.bodyFall(e.zombie.root.pos, 0.7);
      break;
    case 'explosion':
      fx.explosion(e.pos, e.power);
      if (e.fire) fx.fire(e.pos, e.radius * 0.5, 9);
      if (e.kind === 'bloater') fx.gasCloud(e.pos, e.radius, 10);
      audio.explosion(e.pos, e.power);
      shake = Math.min(1.2, shake + e.power * clamp(1 - e.pos.distanceTo(EYE) / 200, 0.15, 1));
      level.scare(e.pos);
      break;
    case 'trapPlaced':
      onTrapPlaced(e.trap);
      break;
    case 'trapRemoved': {
      const m = trapMeshes.get(e.trap);
      if (m) level.removeTrapMesh(m);
      trapMeshes.delete(e.trap);
      break;
    }
    case 'floodlight':
      if (e.on) level.addFloodlight(e.id);
      else level.removeFloodlight(e.id);
      break;
    case 'sentryFire':
      audio.sentry(e.pos);
      fx.muzzle(e.pos, e.dir, { size: 0.7 });
      break;
    case 'sentryEmpty':
      hud.event({ type: 'alert', text: 'SENTRY OUT OF AMMUNITION' });
      break;
    case 'waveStart':
      waveStartHs = game.stats.headshots;
      hud.event({ type: 'wave', n: e.n, boss: e.bosses.length ? e.bosses.join(' & ') : null });
      audio.waveSiren();
      audio.music(e.bosses.length ? 'boss' : 'fight');
      break;
    case 'boss':
      bossZombie = e.zombie;
      audio.bossRoar(e.zombie.kind, e.zombie.root.pos);
      hud.event({ type: 'alert', text: e.zombie.kind === 'juggernaut' ? 'JUGGERNAUT · ARMOURED · TAKE OUT ITS LEGS' : 'BRUTE · HELMET AND VEST · AP ROUNDS OR THE LEGS' });
      break;
    case 'waveCleared':
      hud.event({ type: 'cleared', n: e.n, kills: e.kills, headshots: game.stats.headshots - (waveStartHs || 0), bonus: e.bonus });
      audio.waveCleared();
      audio.music('calm');
      break;
    case 'shop':
      openShop();
      break;
    case 'focus':
      audio.slowMo(e.on);
      break;
    case 'over': {
      document.exitPointerLock();
      const score = e.stats.cashEarned + e.stats.kills * 10 + e.wave * 250;
      const newBest = score > (save.bestScore || 0) || e.wave > (save.bestWave || 0);
      save.bestWave = Math.max(save.bestWave || 0, e.wave);
      save.bestScore = Math.max(save.bestScore || 0, score);
      save.run = null;
      writeSave(save);
      audio.music('off');
      const showOver = () => hud.showGameOver({ cause: e.reason, wave: e.wave, ...e.stats, score, best: { wave: save.bestWave, score: save.bestScore }, newBest, accuracy: e.stats.shots ? e.stats.hits / e.stats.shots : 0 });
      if (e.reason === 'gate') {
        audio.gateBreak();
        const gate = LAYOUT.compound.gates[game.over.gate || 0];
        level.gateMesh(gate.id).break();
        // look down at the breach while they pour in, then the verdict
        overView = { t: 0, from: { yaw: input.yaw, pitch: input.pitch }, gate };
        input.scoped = false;
        setTimeout(showOver, 5500);
      } else showOver();
      break;
    }
    case 'sandbox':
      onSandboxFx(e.fx);
      break;
  }
}

function onSandboxFx(f) {
  if (f.type === 'fleshHit') {
    fx.bloodMist(f.entry, new Vec3(-f.dir.x, -f.dir.y, -f.dir.z), clamp(f.energy / 900, 0.3, 1.2));
    if (f.exit) fx.bloodMist(f.exit, f.dir, clamp(f.energy / 600, 0.5, 2));
  } else if (f.type === 'injury' && f.event.type === 'wound') {
    const z = f.person.towerZombie;
    if (z) addWound(z, f.event.wound);
  } else if (f.type === 'injury' && f.event.type === 'bonebreak') {
    const z = f.person.towerZombie, r = z && visuals.get(z);
    const info = f.event.info;
    if (r) r.v.addFracture(info.seg, info.fragment, info.pointBind, info.axisBind);
  } else if (f.type === 'impact' && (f.ragdollA || f.ragdollB) && f.ground && f.speed > 2.5) {
    audio.bodyFall(f.point, clamp(f.speed / 6, 0.3, 1));
    fx.bodyDust(f.point, f.speed);
  }
}

// ---------------------------------------------------------------------------------------------
// the frame
let acc = 0;
let last = performance.now();
let hordeSoundT = 0;
const _fwd = new THREE.Vector3();

function frame(now) {
  const dtReal = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsAvg = lerp(fpsAvg, 1 / Math.max(dtReal, 1e-3), 0.05);
  if (mode === 'holdout') {
    holdout.frame(now, dtReal);
    requestAnimationFrame(frame);
    return;
  }
  const ph = phase();
  killCamCooldown = Math.max(0, killCamCooldown - dtReal);

  // --- the rifle at the eye, breath, sway
  const wantScope = ph === 'play' && !placing && (input.scoped || input.scopeHold) && game.rifle.state !== 'reload';
  scopeAmt = clamp(scopeAmt + (wantScope ? 1 : -1) * dtReal * 4.5, 0, 1);
  scopeView = view.scopeAmount ? view.scopeAmount() : scopeAmt;
  const wantHold = wantScope && input.keys.has('ShiftLeft') && breath > 0 && breathShake < 0.2;
  if (wantHold !== holding) {
    holding = wantHold;
    audio.breathHold(holding);
  }
  if (holding) {
    breath -= dtReal / game.breathHold;
    if (breath <= 0) {
      breath = 0;
      breathShake = 1;
      holding = false;
      audio.breathHold(false);
    }
  } else breath = Math.min(1, breath + dtReal / 5);
  breathShake = Math.max(0, breathShake - dtReal / 2.5);
  swayT += dtReal * (game.focusActive ? 0.4 : 1);
  const swayAmp = scopeView * 0.0018 * game.sway * (holding ? 0.1 : 1 + 1.6 * breathShake) * (game.focusActive ? 0.45 : 1);
  const sx = swayAmp * (Math.sin(swayT * 0.83) * 0.6 + Math.sin(swayT * 2.1 + 1.3) * 0.3 + Math.sin(swayT * 5.3) * 0.08 * (1 + 3 * breathShake));
  const sy = swayAmp * (Math.sin(swayT * 1.21 + 2) * 0.45 + Math.sin(swayT * 1.55) * 0.55 * (holding ? 0.2 : 1));
  recoil *= Math.exp(-dtReal * 6);
  shake *= Math.exp(-dtReal * 4);
  const shk = shake * shake * 0.02;
  if (overView) {
    overView.t += dtReal;
    const gx = (overView.gate.a[0] + overView.gate.b[0]) / 2, gz = (overView.gate.a[1] + overView.gate.b[1]) / 2;
    const dx = gx - EYE.x, dz = gz - EYE.z, dy = -EYE.y;
    const k = Math.min(1, overView.t / 2.5);
    const e = k * k * (3 - 2 * k);
    let d = Math.atan2(-dx, -dz) - overView.from.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    input.yaw = overView.from.yaw + d * e;
    input.pitch = overView.from.pitch + (Math.atan2(dy, Math.hypot(dx, dz)) - overView.from.pitch) * e;
  }
  lookoutEye(input.yaw, input.pitch, eyeTarget);
  const ke = 1 - Math.exp(-dtReal / 0.15);
  EYE.x += (eyeTarget[0] - EYE.x) * ke;
  EYE.y += (eyeTarget[1] - EYE.y) * ke;
  EYE.z += (eyeTarget[2] - EYE.z) * ke;
  camera.position.set(EYE.x, EYE.y, EYE.z);
  camera.rotation.set(input.pitch + sy + recoil + Math.sin(now * 0.05) * shk, input.yaw + sx + Math.sin(now * 0.043) * shk, 0);
  const fov = lerp(BASE_FOV, BASE_FOV / game.zoom, scopeView);
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();
  camera.getWorldDirection(_fwd);
  aimDir.set(_fwd.x, _fwd.y, _fwd.z);

  // --- time
  let ts = ph === 'play' && !paused ? game.timeScale : ph === 'shop' || placing ? 1 : 0;
  if (killCam.active) ts = killCam.update(dtReal);
  acc += dtReal * ts;
  let n = 0;
  while (acc >= FIXED && n < 4) {
    if (input.fireQueued && ph === 'play' && !killCam.active) {
      // the round leaves along the line of sight (the reticle is the point of aim); from the hip it
      // goes roughly where the rifle points
      const d = aimDir.clone();
      const k = 0.035 * (1 - scopeAmt);
      d.x += (Math.random() - 0.5) * k;
      d.y += (Math.random() - 0.5) * k;
      d.z += (Math.random() - 0.5) * k;
      game.fire(EYE.clone().addScaled(d.normalize(), 0.6), d);
    }
    input.fireQueued = false;
    game.step(FIXED);
    for (const e of game.drainEvents()) onEvent(e);
    acc -= FIXED;
    n++;
  }
  if (n === 4) acc = 0;
  const alpha = clamp(acc / FIXED, 0, 1);

  // --- visuals
  for (const [z, r] of visuals) {
    if (z.state === 'frozen') {
      if (!r.frozen) {
        r.v.update(1);
        r.frozen = true;
      }
    } else r.v.update(alpha, dtReal);
    r.t -= dtReal;
    if (r.dirty && r.t <= 0) {
      for (const d of r.decals) d.age = d.wound.age;
      r.v.setWounds(r.decals);
      r.dirty = false;
      r.t = 0.25;
    }
  }
  for (const rig of xrays.values()) rig.update(dtReal * (killCam.active ? killCam.timeScale : 1), alpha);
  level.setTimeOfDay(game.timeOfDay);
  level.setRain(game.rain);
  level.setWind(game.wind.x, game.wind.z, game.wind.length());
  level.update(dtReal * Math.max(ts, 0.05), camera);
  fx.update(dtReal * Math.max(ts, 0.05), camera);
  if (placing) updatePlacementGhost();
  setThermal(thermal && scopeView > 0.5 && !killCam.active);
  const S = game.defences.sentry, sm = S && trapMeshes.get(S);
  if (sm && sm.userData.yaw) sm.userData.yaw.rotation.y = S.yaw + Math.PI; // (barrel along local -z)

  // --- sound
  audio.setListener(EYE, aimDir);
  hordeSoundT -= dtReal;
  if (hordeSoundT <= 0 && ph === 'play') {
    hordeSoundT = 0.5;
    let count = 0, nearest = Infinity;
    for (const z of game.horde.list) {
      if (!z.alive) continue;
      count++;
      const d = Math.hypot(z.root.pos.x, z.root.pos.z);
      nearest = Math.min(nearest, d);
      const gt = groanT.get(z) || 0;
      if (z.animated && d < 90 && now - gt > 4000 + Math.random() * 6000) {
        groanT.set(z, now);
        if (Math.random() < 0.3) audio.zombieGroan(z.kind, z.root.pos);
      }
    }
    audio.horde(count, nearest);
    audio.ambience(game.timeOfDay, game.wind.length(), game.rain);
    audio.heartbeat(game.player.hp < 40 ? 90 + (40 - game.player.hp) * 2 : 0);
  }

  // --- HUD
  const R = game.rifle, A = game.equipped.ammo;
  const boss = bossZombie && bossZombie.alive ? { name: ENEMIES[bossZombie.kind].name, hp: Math.max(0, bossZombie.person.injury.hp), max: ENEMIES[bossZombie.kind].hp } : null;
  // the wind on screen: counter-clockwise from screen-right (right = along the view's right axis,
  // up = away from the viewer)
  const wR = game.wind.x * Math.cos(input.yaw) - game.wind.z * Math.sin(input.yaw);
  const wF = -game.wind.x * Math.sin(input.yaw) - game.wind.z * Math.cos(input.yaw);
  const windSide = Math.atan2(wF, wR);
  hud.update(dtReal, {
    cash: game.cash, wave: game.director.wave, phase: game.over ? 'over' : game.director.phase, alive: game.horde.aliveCount, toKill: game.director.toKill,
    gate: game.gate, player: game.player,
    rifle: { id: R.id, name: RIFLES[R.id].name, mag: R.mag, magSize: R.mag, ammo: R.ammo, reloading: R.state === 'reload', bolting: R.state === 'cycling' },
    countdown: game.director.phase === 'intro' || game.director.phase === 'cleared' ? Math.max(0, game.director.timer) : null,
    ammoType: { id: A, name: AMMO[A].name, count: A === 'fmj' ? Infinity : game.owned.ammo[A] || 0 },
    scope: killCam.active ? 0 : scopeView, zoom: game.zoom, killcam: killCam.active, rangeM: game.upgradeLevel('rangefinder') && scopeView > 0.5 ? rangeUnderCrosshair() : null,
    wind: { speed: game.wind.length(), dirScreen: windSide }, breath, holding, sway: swayAmp / 0.0018,
    focus: game.focus, focusActive: game.focusActive, boss, placing, thermal: thermal && scopeView > 0.5, timeOfDay: game.timeOfDay, fps: save.settings.showFps ? Math.round(fpsAvg) : null,
  });

  // --- render
  retro.setScopeBoost(scopeView > 0.5 && !killCam.active ? 2 : 1);
  if (killCam.active) {
    retro.render(scene, killCam.camera);
  } else {
    // (the viewmodel always runs - it owns how far the eye is into the scope - but is only drawn
    // while the eye is not in it)
    const live = ph !== 'title' && !placing;
    if (live) {
      view.update(dtReal, {
        ads: scopeAmt, sprint: false, speed: 0, step: 0, onGround: true, crouch: 0, look: { dx: 0, dy: 0 }, landed: 0,
        state: R.state === 'reload' ? 'reload' : 'idle', stateT: R.t, reloadTime: R.reloadTime, perShell: false, empty: R.ammo === 0, pitch: input.pitch, melee: null,
      });
      view.setLighting(lerp(1, 0.35, game.timeOfDay));
    }
    const rifle = live && scopeView < 0.98;
    retro.render(scene, camera, !rifle);
    if (rifle) retro.renderOverlay(view.scene, view.camera);
  }
  requestAnimationFrame(frame);
}

let rangeT = 0, rangeV = null;
function rangeUnderCrosshair() {
  rangeT -= 1;
  if (rangeT > 0) return rangeV;
  rangeT = 6;
  const hit = game.sb.pick(EYE, aimDir, 600);
  let d = hit ? hit.t : null;
  if (d === null && aimDir.y < 0) d = -EYE.y / aimDir.y;
  rangeV = d === null ? null : Math.round(d);
  return rangeV;
}

function updatePlacementGhost() {
  const p = groundPoint(_gp);
  if (placeGhost) {
    level.removeTrapMesh(placeGhost);
    placeGhost = null;
  }
  if (!p) return;
  placeGhost = level.placeTrapMesh(placing === 'floodlight' ? 'mine' : placing, p, placeYaw);
}

// ---------------------------------------------------------------------------------------------
resize();
// compile the world's shaders while the title is up (no hitch on the first frame of the run)
if (renderer.compileAsync) renderer.compileAsync(scene, camera).catch(() => {});
toTitle();
requestAnimationFrame(frame);
window.__tower = { game, input, killCam, camera, level, visuals, hud, startRun, openShop, closeShop, retro, WAVES, holdout, enterHoldout, get scopeView() { return scopeView; }, setAim(yaw, pitch) { input.yaw = yaw; input.pitch = pitch; } };
