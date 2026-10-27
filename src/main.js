import * as THREE from 'three';
import { buildAtlas } from './textures.js';
import { AudioSystem } from './audio.js';
import { createAtlasTexture, createWorldMaterial, PS1Pipeline } from './ps1.js';
import { MeshBuilder, decodeChunkKey, CHUNK } from './builder.js';
import { buildLayout, dress } from './layout.js';
import { buildArchitecture } from './architecture.js';
import { Dresser } from './props.js';
import { Baker, LampController, markClosedDoors, los } from './lighting.js';
import { DoorSystem } from './doors.js';
import { buildBeams } from './beams.js';
import { Player } from './player.js';
import { HUD } from './hud.js';
import { NOTES, NOTE_COUNT } from './notes.js';
import { FLOOR_NAMES, mulberry32, ci, cj, T, GW, GD, CELL, GX0, GZ0 } from './plan.js';

const FAR = 18;
const INTERNAL_H = 240;
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ settings
const settings = { sens: 1, invertY: false, brightness: 1, jitter: true, affine: true, dither: true, aspect43: false, volume: 0.8 };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('st-agatha-settings') || '{}'));
} catch {}
function saveSettings() {
  try {
    localStorage.setItem('st-agatha-settings', JSON.stringify(settings));
  } catch {}
}

// ------------------------------------------------------------------ setup
const canvas = $('game');
const hudCanvas = $('hud');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(1);
renderer.autoClear = true;
renderer.info.autoReset = false;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0x040405, 1);

const pipeline = new PS1Pipeline(renderer);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 4 / 3, 0.05, FAR + 1);
const hud = new HUD(hudCanvas);
const audio = new AudioSystem();

let W = 320, H = INTERNAL_H;
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  let cssW = vw, cssH = vh;
  if (settings.aspect43) {
    cssW = Math.min(vw, Math.round((vh * 4) / 3));
    cssH = Math.round((cssW * 3) / 4);
  }
  H = INTERNAL_H;
  W = Math.max(320, Math.min(560, Math.round((H * cssW) / cssH)));
  renderer.setSize(W, H, false);
  pipeline.setSize(W, H);
  hud.resize(W, H);
  for (const c of [canvas, hudCanvas]) {
    c.style.width = cssW + 'px';
    c.style.height = cssH + 'px';
    c.style.left = Math.round((vw - cssW) / 2) + 'px';
    c.style.top = Math.round((vh - cssH) / 2) + 'px';
  }
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  if (material) material.uniforms.uSnap.value.set(W / 2, H / 2);
  if (beams) beams.material.uniforms.uSnap.value.set(W / 2, H / 2);
}

// ------------------------------------------------------------------ world
let material, level, doors, player, lamps, chunks, baker, beams;
const notesRead = new Set();

function buildWorld() {
  const t0 = performance.now();
  const atlasData = buildAtlas();
  const atlas = { rects: atlasData.rects, width: atlasData.canvas.width, height: atlasData.canvas.height };
  const atlasTex = createAtlasTexture(atlasData.canvas);
  material = createWorldMaterial(atlasTex);
  const t1 = performance.now();

  level = buildLayout();
  const b = new MeshBuilder(atlas);
  buildArchitecture(level, b);
  const D = new Dresser(level, b, mulberry32(1998));
  dress(level, b, D);
  level.buildSpatialIndex();
  markClosedDoors(level);
  const t2 = performance.now();

  baker = new Baker(level);
  const bake = baker.bake(b);
  const t3 = performance.now();
  chunks = [];
  for (const { key, geometry } of b.buildChunks(bake)) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    scene.add(mesh);
    const { f } = decodeChunkKey(key);
    chunks.push({ mesh, f, box: geometry.boundingBox, samples: chunkSamples(level, f, geometry.boundingBox), visible: true });
  }
  doors = new DoorSystem(level, atlas, material, baker, scene);
  lamps = new LampController(level);
  material.uniforms.uLamps.value = lamps.levels;
  beams = buildBeams(level);
  for (const m of beams.meshes) scene.add(m);
  player = new Player(level, doors);
  const t4 = performance.now();
  console.info(
    `atlas ${(t1 - t0).toFixed(0)}ms, layout ${(t2 - t1).toFixed(0)}ms, bake ${(t3 - t2).toFixed(0)}ms (${b.vertexCount} verts), meshes ${(t4 - t3).toFixed(0)}ms, ${chunks.length} chunks, ${level.lamps.filter((l) => l.idx).length} live lamps`,
  );
  resize();
}

// Sample points (open cells) used to test whether a chunk can be seen.
function chunkSamples(L, f, box) {
  const g = L.grid(f);
  if (!g) return [];
  const out = [];
  const i0 = Math.max(0, ci(box.min.x - 1)), i1 = Math.min(GW - 1, ci(box.max.x + 1));
  const j0 = Math.max(0, cj(box.min.z - 1)), j1 = Math.min(GD - 1, cj(box.max.z + 1));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const t = g.at(i, j);
      if (t === T.SOLID || t === T.OUT) continue;
      if (t === T.DOOR || t === T.WINDOW || (i % 2 === 0 && j % 2 === 0)) out.push([GX0 + (i + 0.5) * CELL, GZ0 + (j + 0.5) * CELL]);
    }
  return out;
}

// ------------------------------------------------------------------ input
const keys = new Set();
const input = { fwd: 0, strafe: 0, sprint: false, jump: false };
let locked = false;
let state = 'title'; // title | play | paused | note
let readingNote = null;

addEventListener('keydown', (e) => {
  if (e.code === 'Tab') e.preventDefault();
  if (state === 'note' && (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter')) {
    closeNote();
    return;
  }
  if (state !== 'play') return;
  if (!keys.has(e.code)) {
    if (e.code === 'KeyC' || e.code === 'ControlLeft') player.toggleCrouch();
    if (e.code === 'KeyF') toggleFlashlight();
    if (e.code === 'KeyE') interact();
    if (e.code === 'Backquote') debugOn = !debugOn;
  }
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

addEventListener('mousemove', (e) => {
  if (!locked || state !== 'play') return;
  const s = 0.0022 * settings.sens;
  player.yaw -= e.movementX * s;
  player.pitch -= e.movementY * s * (settings.invertY ? -1 : 1);
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
});
addEventListener('mousedown', (e) => {
  if (state === 'note') closeNote();
  else if (state === 'play' && locked && e.button === 0) interact();
});

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && (state === 'play' || state === 'note')) pause();
});
document.addEventListener('pointerlockerror', () => {
  // e.g. re-locking too soon after Esc: show the menu so the player can retry
  locked = false;
  if (state === 'play' && !window.__test) pause();
});
canvas.addEventListener('click', () => {
  if (state === 'play' && !locked) requestLock();
});

function readInput() {
  const k = (c) => keys.has(c);
  input.fwd = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
  input.strafe = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
  input.sprint = k('ShiftLeft') || k('ShiftRight');
  input.jump = k('Space');
}

function requestLock() {
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => canvas.requestPointerLock());
  } catch {
    canvas.requestPointerLock();
  }
}

// ------------------------------------------------------------------ flashlight
const flash = { on: true, dir: new THREE.Vector3(0, 0, -1), pos: new THREE.Vector3(), level: 1 };
function toggleFlashlight() {
  flash.on = !flash.on;
  audio.play(flash.on ? 'flashlight_on' : 'flashlight_off');
}

// ------------------------------------------------------------------ interaction
const _fwd = new THREE.Vector3();
let focus = null;
function findFocus() {
  camera.getWorldDirection(_fwd);
  const o = camera.position;
  let best = null;
  let bestT = 1.9;
  const hit = doors.raycast(o, _fwd, bestT);
  if (hit) {
    best = { type: 'door', door: hit.door };
    bestT = hit.t;
  }
  for (const it of level.interactables) {
    const dx = it.x - o.x, dy = it.y - o.y, dz = it.z - o.z;
    if (dx * dx + dy * dy + dz * dz > 9) continue;
    const t = dx * _fwd.x + dy * _fwd.y + dz * _fwd.z;
    if (t < 0 || t > 2.2) continue;
    const px = o.x + _fwd.x * t - it.x, py = o.y + _fwd.y * t - it.y, pz = o.z + _fwd.z * t - it.z;
    const d2 = px * px + py * py + pz * pz;
    if (d2 > it.r * it.r) continue;
    if (t < bestT + 0.4 && lineClear(o, it)) {
      best = { type: 'note', note: it };
      bestT = t;
    }
  }
  return best;
}
function lineClear(o, it) {
  const g = level.grid(level.floorAt(player.pos.y + 0.1));
  return los(g, o.x, o.z, it.x, it.z, false);
}

function interact() {
  if (!focus) return;
  if (focus.type === 'door') {
    const msg = doors.use(focus.door, player.pos, audio);
    if (msg) hud.showMessage(msg);
  } else if (focus.type === 'note') openNote(focus.note.id);
}

function openNote(id) {
  const n = NOTES[id];
  if (!n) return;
  state = 'note';
  readingNote = id;
  audio.play('paper');
  $('note-title').textContent = n.title;
  $('note-body').textContent = n.body;
  $('note').className = 'show ' + n.kind;
  const first = !notesRead.has(id);
  if (n.kind !== 'sign') notesRead.add(id);
  if (first && n.kind !== 'sign') {
    hud.showCounter(`DOCUMENTS ${notesRead.size}/${NOTE_COUNT}`);
    onNoteRead(id);
  }
  keys.clear();
}
function closeNote() {
  $('note').className = '';
  state = 'play';
  readingNote = null;
}

// ------------------------------------------------------------------ restrained scripted beats
const scripts = { timers: [] };
function later(sec, fn) {
  scripts.timers.push({ t: sec, fn });
}
function onNoteRead(id) {
  if (id === 'journal3') {
    later(3.0, () => {
      for (const l of level.lamps) if (l.behavior === 'scripted') l.scriptLevel = 0;
      audio.play('flicker_click', { x: 9.5, y: 4.2, z: 10 });
    });
  }
  if (id === 'morguelog') later(9, () => audio.play('elevator_groan', { x: 29.2, y: -2, z: 5.2 }));
  if (id === 'workorder') later(5, () => audio.play('distant_metal', { x: 30, y: -2, z: 8 }));
}
const visited = new Set();
function onEnterRoom(room) {
  if (visited.has(room.id)) return;
  visited.add(room.id);
  if (room.name === 'FIRST FLOOR CORRIDOR') later(7, () => audio.play('distant_door', { x: 54, y: 5, z: 8.5 }, { volume: 0.7 }));
  if (room.name === 'MORTUARY — COLD STORAGE') later(14, () => audio.play('whisper_wind', null, { volume: 0.5 }));
}

// ------------------------------------------------------------------ menus
function startGame() {
  audio.start();
  audio.setMasterVolume(settings.volume);
  audio.resume();
  if (!emittersAdded) addEmitters();
  state = 'play';
  $('title').classList.add('hidden');
  $('pause').classList.add('hidden');
  requestLock();
}
function pause() {
  if (state === 'title') return;
  if (state === 'note') closeNote();
  state = 'paused';
  keys.clear();
  $('pause').classList.remove('hidden');
  $('pause-settings-slot').appendChild($('settings'));
  $('docs').textContent = `DOCUMENTS FOUND: ${notesRead.size} / ${NOTE_COUNT}`;
  audio.suspend();
}
let emittersAdded = false;
const emitterIds = [];
function addEmitters() {
  emittersAdded = true;
  for (const e of level.emitters) {
    const id = audio.addEmitter(e.type, { x: e.x, y: e.y, z: e.z }, { rate: e.rate, volume: e.quiet ? 0.4 : 1 });
    emitterIds.push({ id, e });
  }
}

function bindSettings() {
  const bind = (id, key, conv = (v) => v, prop = 'value') => {
    const el = $(id);
    if (!el) return;
    el[prop] = settings[key];
    el.addEventListener('input', () => {
      settings[key] = conv(el[prop]);
      applySettings();
      saveSettings();
    });
  };
  bind('opt-sens', 'sens', Number);
  bind('opt-bright', 'brightness', Number);
  bind('opt-vol', 'volume', Number);
  bind('opt-invert', 'invertY', Boolean, 'checked');
  bind('opt-jitter', 'jitter', Boolean, 'checked');
  bind('opt-affine', 'affine', Boolean, 'checked');
  bind('opt-dither', 'dither', Boolean, 'checked');
  bind('opt-43', 'aspect43', Boolean, 'checked');
}
function applySettings() {
  if (!material) return;
  material.uniforms.uBrightness.value = settings.brightness;
  material.uniforms.uJitter.value = settings.jitter ? 1 : 0;
  material.uniforms.uAffine.value = settings.affine ? 1 : 0;
  pipeline.postMaterial.uniforms.uDither.value = settings.dither ? 1 : 0;
  audio.setMasterVolume(settings.volume);
  resize();
}

// ------------------------------------------------------------------ per-frame
let debugOn = false;
let lastRoom = null;
const fpsHist = [];
let occlFrame = 0;
const brokenWindows = [];

function updateVisibility() {
  const cp = camera.position;
  const camF = level.floorAt(player.pos.y + 0.1);
  let vertical = false;
  for (const z of level.verticalZones)
    if (cp.x > z.x0 && cp.x < z.x1 && cp.z > z.z0 && cp.z < z.z1 && camF >= z.kmin && camF <= z.kmax) vertical = true;
  const doOccl = (occlFrame++ & 1) === 0;
  for (const c of chunks) {
    if (!vertical && c.f !== camF) {
      c.mesh.visible = false;
      continue;
    }
    const b = c.box;
    const dx = Math.max(b.min.x - cp.x, 0, cp.x - b.max.x);
    const dy = Math.max(b.min.y - cp.y, 0, cp.y - b.max.y);
    const dz = Math.max(b.min.z - cp.z, 0, cp.z - b.max.z);
    const d = Math.hypot(dx, dy, dz);
    if (d > FAR + 0.5) {
      c.mesh.visible = false;
      continue;
    }
    if (d < 4) {
      c.mesh.visible = true;
      continue;
    }
    if (!doOccl) continue;
    // simple occlusion: is any open cell of the chunk in line of sight?
    const g = level.grid(c.f);
    let vis = false;
    for (const [sx, sz] of c.samples) {
      const ex = sx - cp.x, ez = sz - cp.z;
      if (ex * ex + ez * ez > (FAR + 1) * (FAR + 1)) continue;
      if (los(g, cp.x, cp.z, sx, sz, false)) {
        vis = true;
        break;
      }
    }
    c.mesh.visible = vis;
  }
  for (const m of beams.meshes) m.visible = vertical || m.userData.k === camF;
  doors.setVisibility(cp, FAR);
}

function simulate(dt) {
  readInput();
  const active = state === 'play';
  if (!active) {
    input.fwd = input.strafe = 0;
    input.sprint = input.jump = false;
  }
  player.update(dt, input);
  doors.update(dt);
  for (const l of level.lamps) if (l.behavior === 'scripted' && l.idx) lamps.levels[l.idx] = l.scriptLevel ?? 1;
  lamps.update(dt);
  for (const l of level.lamps) if (l.behavior === 'scripted' && l.idx) lamps.levels[l.idx] = l.scriptLevel ?? 1;
  for (let i = scripts.timers.length - 1; i >= 0; i--) {
    const s = scripts.timers[i];
    s.t -= dt;
    if (s.t <= 0) {
      scripts.timers.splice(i, 1);
      s.fn();
    }
  }
  // audio events from the player
  for (const ev of player.events) {
    if (ev.type === 'step') audio.footstep(ev.surface, { speed: ev.speed, crouch: ev.crouch });
    else if (ev.type === 'ladder') audio.play('ladder_step');
    else if (ev.type === 'land') {
      if (ev.impact > 7) audio.play('land_hard');
      else if (ev.impact > 2) audio.footstep(ev.surface, { speed: 1, crouch: false });
    }
  }
  hud.update(dt);
}

function frameUpdate(dt) {
  player.applyCamera(camera);
  camera.updateMatrixWorld();
  // flashlight: held slightly right and low, lagging behind the view
  camera.getWorldDirection(_fwd);
  flash.dir.lerp(_fwd, 1 - Math.exp(-dt * 14)).normalize();
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  flash.pos.copy(camera.position).addScaledVector(right, 0.18).add(new THREE.Vector3(0, -0.2, 0));
  const u = material.uniforms;
  u.uFlashPos.value.copy(flash.pos);
  u.uFlashDir.value.copy(flash.dir);
  flash.level += ((flash.on ? 1 : 0) - flash.level) * Math.min(1, dt * 25);
  u.uFlashOn.value = flash.level;
  beams.material.uniforms.uTime.value += dt;

  updateVisibility();

  // interaction focus + prompt
  if (state === 'play') {
    focus = findFocus();
    let prompt = '';
    if (focus?.type === 'door') prompt = focus.door.isOpen ? '[E] CLOSE' : focus.door.barricaded || focus.door.locked || focus.door.oneWay ? '[E] TRY DOOR' : '[E] OPEN';
    else if (focus?.type === 'note') prompt = NOTES[focus.note.id]?.kind === 'sign' ? '[E] READ DIRECTORY' : '[E] READ';
    hud.prompt = prompt;
    let hint = '';
    if (player.ladder) hint = 'W/S CLIMB · SPACE LET GO';
    else if (level.hints) {
      const p = player.pos;
      for (const h of level.hints) if (Math.abs(h.k * 4 - p.y) < 1 && Math.hypot(h.x - p.x, h.z - p.z) < h.r && !player.crouched) hint = h.text;
    }
    hud.hint = hint;
  } else {
    hud.prompt = '';
    hud.hint = '';
  }

  // area names
  const room = level.roomAtPos(player.pos.x, player.pos.y + 0.6, player.pos.z);
  if (room && room !== lastRoom) {
    if (!lastRoom || room.name !== lastRoom.name) {
      const fl = room.stair || room.shaft ? '' : FLOOR_NAMES[room.k] + ' · ';
      hud.showArea(room.corridor ? room.name : fl + room.name);
    }
    lastRoom = room;
    onEnterRoom(room);
  }

  // audio
  if (audio.started) {
    audio.setListener({ x: camera.position.x, y: camera.position.y, z: camera.position.z }, { x: _fwd.x, y: _fwd.y, z: _fwd.z });
    let exposure = 0;
    const py = player.pos.y;
    for (const w of brokenWindows) {
      if (Math.abs(w.y - py) > 2) continue;
      const d = Math.hypot(w.x - player.pos.x, w.z - player.pos.z);
      exposure = Math.max(exposure, 1 - d / 9);
    }
    audio.update(dt, { exposure, underground: py < -1.5, inStairwell: !!(room && (room.stair || room.shaft)) });
    for (const { id, e } of emitterIds) if (e.lamp) audio.setEmitterLevel(id, e.lamp.idx ? lamps.levels[e.lamp.idx] : 0);
  }
}

// fixed-step simulation, rendering capped at 60 FPS
const STEP = 1 / 60;
let last = performance.now();
let simAcc = 0;
let renderDue = 0;
function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  renderDue += dt;
  if (renderDue < STEP - 0.0025) return;
  renderDue = Math.min(renderDue - STEP, STEP);
  simAcc += Math.max(dt, 0);
  let n = 0;
  while (simAcc >= STEP && n < 4) {
    simulate(STEP);
    simAcc -= STEP;
    n++;
  }
  if (n === 4) simAcc = 0;
  frameUpdate(STEP * Math.max(1, n));
  renderer.info.reset();
  pipeline.render(scene, camera);
  fpsHist.push(now);
  while (fpsHist.length && fpsHist[0] < now - 1000) fpsHist.shift();
  if (debugOn) {
    const p = player.pos;
    $('debug').textContent = `${fpsHist.length} FPS  ${renderer.info.render.calls} calls  ${renderer.info.render.triangles} tris  ${W}x${H}  pos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}`;
  } else $('debug').textContent = '';
}

// ------------------------------------------------------------------ boot
function boot() {
  $('loading').textContent = 'LOADING...';
  // allow the loading text to paint before the heavy build
  setTimeout(() => {
    try {
      buildWorld();
    } catch (err) {
      $('loading').textContent = 'FAILED TO BUILD WORLD: ' + err.message;
      throw err;
    }
    for (const w of level.windows)
      if (w.broken && !w.boarded) brokenWindows.push({ x: (w.x0 + w.x1) / 2, y: w.k * 4, z: (w.z0 + w.z1) / 2 });
    for (const l of level.lamps) if (l.behavior === 'scripted') l.scriptLevel = 1;
    bindSettings();
    applySettings();
    player.applyCamera(camera);
    $('loading').textContent = '';
    $('title').classList.remove('hidden');
    $('start').addEventListener('click', startGame);
    $('resume').addEventListener('click', startGame);
    window.__game = { level, player, camera, renderer, chunks, doors, lamps, settings, startGame, openNote, state: () => state, hud, flash, beams };
    requestAnimationFrame(loop);
  }, 30);
}
addEventListener('resize', resize);
boot();
