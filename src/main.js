import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Vec3, clamp } from './physics/math.js';
import { World } from './physics/world.js';
import { Ragdoll } from './human/ragdoll.js';
import { BodyShape } from './human/bodyShape.js';
import { buildBodyMesh } from './human/bodyMesh.js';
import MeshWorker from './render/meshWorker.js?worker&inline';
import { Sandbox } from './game/sandbox.js';
import { WEAPONS } from './game/weapons.js';
import { THROWABLES } from './game/throwables.js';
import { AudioEngine } from './game/audio.js';
import { createRenderer, Arena } from './render/arena.js';
import { FloorDecals } from './render/floorDecals.js';
import { HumanMesh } from './render/humanMesh.js';
import { BloodParticles, SkinBlood, buildAdjacency, buildVertexHash } from './render/blood.js';
import { Effects } from './render/effects.js';
import { ViewModel } from './render/viewmodel.js';
import { DebugDraw, interpPose } from './render/debugDraw.js';
import * as OM from './render/objectMeshes.js';
import { UI, WEAPON_KEYS, THROW_KEYS } from './ui/ui.js';

const FIXED = 1 / 60;
const WOUND_KIND = { entry: 0, exit: 1, laceration: 2, bruise: 3, abrasion: 4 };

// ---------------------------------------------------------------------------------------------
// scene
const container = document.getElementById('app');
const renderer = createRenderer(container);
renderer.autoClear = false;
const decals = new FloorDecals(renderer, { half: 7, size: 2048 });
const arena = new Arena(renderer, decals);
const scene = arena.scene;
const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.03, 200);
camera.position.set(2.3, 1.55, 3.3);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0);
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.minDistance = 0.35;
controls.maxDistance = 30;
controls.maxPolarAngle = Math.PI * 0.497;
controls.zoomSpeed = 1.1;
controls.update();

const segNames = new Ragdoll(new World()).segList.map((s) => s.name);
const shape = new BodyShape(segNames);
const sandbox = new Sandbox({ shape });
const particles = new BloodParticles(scene, decals);
const effects = new Effects(scene, { shardFactory: typeof OM.createShardMesh === 'function' ? OM.createShardMesh : null });
const viewmodel = new ViewModel(OM, camera.aspect);
viewmodel.setEnvironment(arena.envMap);
const audio = new AudioEngine({ volume: 0.7 });
const dbg = new DebugDraw(scene);
dbg.setVisible(false);
const balanceViz = createBalanceViz(scene);

const state = {
  tool: 'w:pistol',
  paused: false,
  timeScale: 1,
  stepOnce: false,
  follow: false,
  debug: false,
  tracers: true,
  gore: true,
  throwPower: 1,
  shoveImpulse: 60,
  firing: false,
  lastShot: -1,
  selected: null,
  pointer: new THREE.Vector2(),
  pointerPx: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  grabDepth: 0,
  keys: new Set(),
};

const ui = new UI(document.body, { onTool: setTool, onAction: doAction, onSetting: setSetting });
ui.setActiveTool(state.tool);
ui.setTime(1, false);

// ---------------------------------------------------------------------------------------------
// body mesh (generated in a worker) and per-person render state
let meshShared = null;
const renders = new Map();
ui.setLoading(true);
// generate prop/weapon textures in idle slices now rather than on the first throw
if (typeof OM.preloadObjectMeshes === 'function') setTimeout(() => OM.preloadObjectMeshes().catch(() => {}), 300);

function onMeshReady(data) {
  meshShared = { data, adjacency: buildAdjacency(data), vhash: buildVertexHash(data) };
  for (const p of sandbox.people) attachRender(p);
  ui.setLoading(false);
  window.__sim.ready = true;
}
function buildMeshHere() {
  // fallback when workers are unavailable (e.g. some file:// setups): build on the main thread
  setTimeout(() => onMeshReady(buildBodyMesh(new BodyShape(segNames))), 50);
}
try {
  const worker = new MeshWorker();
  worker.onmessage = (e) => onMeshReady(e.data);
  worker.onerror = (e) => {
    console.warn('mesh worker failed, building on the main thread', e);
    buildMeshHere();
  };
  worker.postMessage({ segNames });
} catch (e) {
  console.warn('mesh worker unavailable', e);
  buildMeshHere();
}

function attachRender(person) {
  if (!meshShared || renders.has(person)) return;
  const hm = new HumanMesh(meshShared.data, person.rd, shape);
  scene.add(hm.mesh);
  const skin = new SkinBlood(hm, meshShared, particles, decals, person);
  const r = { hm, skin, decals: [], decalsDirty: true, decalTimer: 0 };
  renders.set(person, r);
  // wounds that happened before the mesh was ready
  for (const w of person.injury.wounds) addWoundDecal(person, r, w);
  for (const seg of person.rd.segList) {
    if (seg.fractured) hm.addFracture(seg, seg.fractured.extra[0], seg.fractured.pointBind, seg.fractured.axis);
  }
}

function detachRender(person) {
  const r = renders.get(person);
  if (!r) return;
  scene.remove(r.hm.mesh);
  r.hm.dispose();
  renders.delete(person);
}

function woundModelPos(w) {
  const seg = w.seg;
  const bindPos = w.body.userData.fragment ? w.body.userData.bindPos : seg.bindPos;
  return shape.localToModel(seg.name, bindPos, w.local, new Vec3());
}

function addWoundDecal(person, r, w) {
  if (!w.modelPos) w.modelPos = woundModelPos(w);
  const mp = shape.modelPose[w.seg.name];
  const dir = w.dir ? w.dir.clone().applyQuat(mp.q) : null;
  r.decals.push({ wound: w, modelPos: w.modelPos, radius: w.radius, kind: WOUND_KIND[w.kind] ?? 0, age: 0, severity: w.severity ?? 0.5, seed: w.seed ?? Math.random(), dir });
  r.decalsDirty = true;
}

// ---------------------------------------------------------------------------------------------
// props
const propMeshes = new Map();

function makePropMesh(type) {
  try {
    return OM.createThrowableMesh(type);
  } catch (e) {
    console.warn('prop mesh', type, e);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    return m;
  }
}

// ---------------------------------------------------------------------------------------------
// tools & actions
function setTool(id) {
  state.tool = id;
  ui.setActiveTool(id);
  viewmodel.setWeapon(id.startsWith('w:') ? id.slice(2) : null);
  if (id.startsWith('w:')) ui.notify(`${WEAPONS[id.slice(2)].label} — ${WEAPONS[id.slice(2)].round}`);
  else if (id.startsWith('t:')) ui.notify(`${THROWABLES[id.slice(2)].label} (${THROWABLES[id.slice(2)].mass} kg) — click to throw, shift+click to drop`);
}

function facingCamera(p) {
  return Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
}

function doAction(act) {
  audio.unlock();
  switch (act) {
    case 'spawn': {
      const p = sandbox.freeSpot(new Vec3(controls.target.x, 0, controls.target.z));
      const person = sandbox.spawnPerson(p, facingCamera(p));
      state.selected = person;
      ui.notify(`Dummy #${person.id} spawned`);
      break;
    }
    case 'reset':
      resetAll();
      ui.notify('Simulation reset');
      break;
    case 'clear':
      sandbox.clearObjects();
      effects.clearDebris();
      ui.notify('Props cleared');
      break;
    case 'pause':
      state.paused = !state.paused;
      ui.setTime(state.timeScale, state.paused);
      break;
    case 'step':
      state.paused = true;
      state.stepOnce = true;
      ui.setTime(state.timeScale, true);
      break;
    case 'slowmo':
      state.timeScale = state.timeScale < 0.99 ? 1 : 0.25;
      ui.setTime(state.timeScale, state.paused);
      break;
    case 'follow':
      state.follow = !state.follow;
      ui.setFlag('follow', state.follow);
      break;
    case 'debug':
      state.debug = !state.debug;
      dbg.setVisible(state.debug);
      balanceViz.group.visible = state.debug;
      ui.setFlag('debug', state.debug);
      for (const r of renders.values()) {
        r.hm.mesh.material.transparent = state.debug;
        r.hm.mesh.material.opacity = state.debug ? 0.35 : 1;
        r.hm.mesh.material.depthWrite = !state.debug;
      }
      break;
  }
}

function setSetting(key, v) {
  switch (key) {
    case 'assist':
      sandbox.setAssist(v);
      break;
    case 'throwPower':
      state.throwPower = v;
      break;
    case 'shove':
      state.shoveImpulse = v;
      break;
    case 'force':
      sandbox.settings.forceScale = v;
      break;
    case 'bleed':
      sandbox.setBleedScale(v);
      break;
    case 'volume':
      audio.setVolume(v);
      break;
    case 'tracers':
      state.tracers = v;
      break;
    case 'gore':
      state.gore = v;
      break;
  }
}

function resetAll() {
  for (const p of [...renders.keys()]) detachRender(p);
  sandbox.resetAll();
  const p0 = sandbox.people[0];
  if (p0) {
    // face the viewer
    const yaw = facingCamera(new Vec3(0, 0, 0));
    sandbox.removePerson(p0);
    sandbox.nextId = 1;
    state.selected = sandbox.spawnPerson(new Vec3(0, 0, 0), yaw);
  }
  decals.clear();
  particles.clear();
  effects.clearDebris();
}

// ---------------------------------------------------------------------------------------------
// input
const raycaster = new THREE.Raycaster();

function pointerRay() {
  raycaster.setFromCamera(state.pointer, camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  return { origin: new Vec3(o.x, o.y, o.z), dir: new Vec3(d.x, d.y, d.z).normalize() };
}

function updatePointer(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  state.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  state.pointerPx = { x: e.clientX, y: e.clientY };
  ui.crosshair.style.setProperty('--cx', `${e.clientX}px`);
  ui.crosshair.style.setProperty('--cy', `${e.clientY}px`);
}

function personOfBody(b) {
  return b ? sandbox.people.find((p) => p.rd.isRagdollBody(b)) : null;
}

function fireWeapon() {
  const type = state.tool.slice(2);
  const w = WEAPONS[type];
  const now = performance.now() / 1000;
  if (now - state.lastShot < 60 / w.rpm) return false;
  state.lastShot = now;
  const { origin, dir } = pointerRay();
  // muzzle sits a little ahead of the eye
  origin.addScaled(dir, 0.25);
  sandbox.fire(type, origin, dir);
  viewmodel.fire(w.recoil);
  // view kick
  const kick = w.kick * (0.6 + 0.4 * Math.random());
  camera.position.y += kick * 0.02;
  return true;
}

function throwProp(shift) {
  const type = state.tool.slice(2);
  const def = THROWABLES[type];
  const { origin, dir } = pointerRay();
  const hit = sandbox.pick(origin, dir, 80);
  if (shift) {
    // drop it from above the pointed spot
    const p = hit ? hit.point : origin.clone().addScaled(dir, 4);
    const o = sandbox.addObject(type, new Vec3(p.x, Math.max(p.y, 0) + 1.6, p.z));
    o.body.angVel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    return;
  }
  const speed = def.speed * state.throwPower;
  const start = origin.clone().addScaled(dir, 0.45);
  start.y -= 0.12;
  const target = hit ? hit.point : origin.clone().addScaled(dir, 20);
  // aim above the target to compensate the drop of the ballistic arc
  const d = target.distanceTo(start);
  const t = d / speed;
  const aim = target.clone();
  aim.y += 0.5 * 9.81 * t * t;
  const v = aim.sub(start).normalize();
  sandbox.throwObject(type, start, v, speed);
}

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointermove', (e) => {
  updatePointer(e);
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  updatePointer(e);
  audio.unlock();
  if (e.button !== 0) return;
  const t = state.tool;
  if (t === 'grab') {
    const { origin, dir } = pointerRay();
    const hit = sandbox.pick(origin, dir, 80);
    if (hit && hit.body) {
      sandbox.startGrab(hit.body, hit.point, personOfBody(hit.body) ? 2200 : 3000);
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      state.grabDepth = (hit.point.x - camera.position.x) * fwd.x + (hit.point.y - camera.position.y) * fwd.y + (hit.point.z - camera.position.z) * fwd.z;
      const p = personOfBody(hit.body);
      if (p) state.selected = p;
      renderer.domElement.setPointerCapture(e.pointerId);
    }
  } else if (t === 'shove') {
    const { origin, dir } = pointerRay();
    const hit = sandbox.pick(origin, dir, 80);
    if (hit && hit.body) {
      const d = dir.clone();
      d.y *= 0.3;
      d.normalize();
      sandbox.shove(hit.body, hit.point, d.scale(state.shoveImpulse * (personOfBody(hit.body) ? 1 : 0.15)), 0.12);
      const p = personOfBody(hit.body);
      if (p) state.selected = p;
      audio.impact('flesh', 0.4, hit.point);
    }
  } else if (t.startsWith('w:')) {
    state.firing = true;
    fireWeapon();
    renderer.domElement.setPointerCapture(e.pointerId);
  } else if (t.startsWith('t:')) {
    throwProp(e.shiftKey);
  }
});
window.addEventListener('pointerup', (e) => {
  if (e.button !== 0) return;
  state.firing = false;
  sandbox.endGrab();
});

window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  audio.unlock();
  const k = e.key.toLowerCase();
  state.keys.add(k);
  if (k >= '1' && k <= '6') setTool('w:' + WEAPON_KEYS[+k - 1]);
  else if (k === 'g') setTool('grab');
  else if (k === 'f') setTool('shove');
  else if (k === 'q' || k === 'e') {
    const cur = state.tool.startsWith('t:') ? THROW_KEYS.indexOf(state.tool.slice(2)) : -1;
    const n = THROW_KEYS.length;
    const next = cur < 0 ? 0 : (cur + (k === 'e' ? 1 : n - 1)) % n;
    setTool('t:' + THROW_KEYS[next]);
  } else if (k === ' ') {
    e.preventDefault();
    doAction('pause');
  } else if (k === 't') doAction('slowmo');
  else if (k === '.') doAction('step');
  else if (k === 'r') doAction('reset');
  else if (k === 'n') doAction('spawn');
  else if (k === 'c') doAction('clear');
  else if (k === 'b') doAction('follow');
  else if (k === 'v') doAction('debug');
  else if (k === 'h') ui.toggleHidden();
});
window.addEventListener('keyup', (e) => state.keys.delete(e.key.toLowerCase()));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  viewmodel.setAspect(camera.aspect);
  particles.setViewportHeight(window.innerHeight * renderer.getPixelRatio(), camera.fov);
});
particles.setViewportHeight(window.innerHeight * renderer.getPixelRatio(), camera.fov);

// ---------------------------------------------------------------------------------------------
// simulation events -> visuals and sound
const _tv = new THREE.Vector3();

function muzzleWorld(out) {
  viewmodel.muzzleCameraSpace(_tv);
  out.copy(_tv);
  camera.localToWorld(out);
  return out;
}

function handleFx(e) {
  switch (e.type) {
    case 'personAdded':
      attachRender(e.person);
      if (!state.selected) state.selected = e.person;
      break;
    case 'personRemoved':
      detachRender(e.person);
      if (state.selected === e.person) state.selected = sandbox.people[0] || null;
      break;
    case 'objectAdded': {
      const m = makePropMesh(e.object.type);
      scene.add(m);
      propMeshes.set(e.object, m);
      interpPose(e.object.body, 1, m);
      break;
    }
    case 'objectRemoved': {
      const m = propMeshes.get(e.object);
      if (m) scene.remove(m);
      propMeshes.delete(e.object);
      break;
    }
    case 'shot': {
      audio.gunshot(e.weapon, e.origin);
      const mw = muzzleWorld(new THREE.Vector3());
      effects.muzzleLight(mw, WEAPONS[e.weapon].recoil > 2 ? 1.4 : 1);
      if (state.tracers) for (const p of e.paths) effects.tracer(mw, new THREE.Vector3(p.to.x, p.to.y, p.to.z));
      break;
    }
    case 'fleshHit':
      goreForHit(e);
      audio.bulletImpact(e.bone ? 'bone' : 'flesh', e.entry, clamp(e.energy / 600, 0.3, 1));
      state.selected = e.person;
      break;
    case 'objectHit': {
      const mat = e.material;
      const n = new THREE.Vector3(e.normal.x, e.normal.y, e.normal.z);
      const p = new THREE.Vector3(e.point.x, e.point.y, e.point.z);
      if (mat === 'metal' || mat === 'bowling') effects.puff(p, n, undefined, 10, 3, 0.25, true);
      else effects.puff(p, n, mat === 'wood' || mat === 'crate' ? 0x9a7a55 : 0xbbbbbb, 10, 1, 0.5);
      audio.bulletImpact(mat === 'metal' ? 'metal' : mat === 'wood' ? 'wood' : 'ground', e.point, 0.8);
      break;
    }
    case 'groundHit': {
      decals.splat(e.point.x, e.point.z, 0.014 + Math.random() * 0.006, 1, 0.95, 1, Math.random() * 6.28, Math.random());
      const p = new THREE.Vector3(e.point.x, 0.005, e.point.z);
      effects.puff(p, new THREE.Vector3(-e.dir.x * 0.3, 1, -e.dir.z * 0.3).normalize(), 0xb8b2a8, 16, 1.4, 0.7);
      effects.puff(p, new THREE.Vector3(0, 1, 0), undefined, 6, 2.5, 0.2, true);
      audio.bulletImpact('ground', e.point, 0.8);
      break;
    }
    case 'impact':
      impactSound(e);
      break;
    case 'shatter':
      shatterFx(e);
      break;
    case 'throw':
      audio.whoosh(e.speed, e.object.body.pos);
      break;
    case 'injury':
      injuryFx(e.person, e.event);
      break;
  }
}

function goreForHit(e) {
  if (!state.gore) return;
  const d = new THREE.Vector3(e.dir.x, e.dir.y, e.dir.z);
  const entry = new THREE.Vector3(e.entry.x, e.entry.y, e.entry.z);
  const E = e.energy;
  // back spatter at the entry (small droplets thrown back toward the shooter)
  particles.spray(entry, d.clone().negate(), 6 + Math.round(E / 120), 1.2 + E / 600, 0.7, 0.0005, 0.0018, 0, 0.02);
  if (e.highVelocity) particles.addMist(entry, d.clone().negate(), 5, 0.6, 0xa01212, 0.025, 0.25);
  if (e.exit) {
    const exit = new THREE.Vector3(e.exit.x, e.exit.y, e.exit.z);
    const big = clamp(E / 900, 0, 1.5);
    particles.spray(exit, d, 16 + Math.round(big * 60), 3 + 5 * big, 0.38, 0.0007, 0.0032, 0, 0.08);
    if (big > 0.25) particles.spray(exit, d, Math.round(big * 10), 2.5 + 3 * big, 0.45, 0.002, 0.006, 1, 0.2);
    if (e.bone) particles.spray(exit, d, 3 + Math.round(big * 6), 3 + 4 * big, 0.4, 0.0015, 0.004, 2, 0.05);
    particles.addMist(exit, d, Math.round(6 + 24 * big), 1.5 + 3 * big, 0xa01414, 0.03 + 0.035 * big, 0.3 + 0.3 * big);
    if (e.head && big > 0.6) {
      particles.spray(exit, d, 14, 5, 0.5, 0.003, 0.008, 1, 0.3);
      particles.addMist(exit, d, 30, 4, 0xb03030, 0.06, 0.6);
    }
  }
}

function impactSound(e) {
  const it = clamp((e.speed - 0.7) / 7, 0, 1) * clamp(0.3 + e.impulse / 6, 0, 1);
  if (it < 0.02) return;
  const matOf = (m) => {
    if (m === 'flesh' || m === 'shoe') return 'flesh';
    if (m === 'baseball') return 'leather';
    if (m === 'melon') return 'flesh';
    return m;
  };
  if (e.ragdollA || e.ragdollB) {
    const body = e.ragdollA ? e.bodyA : e.bodyB;
    const seg = body.userData.segment ? body.userData.segment.name : '';
    if (e.ground && /chest|abdomen|pelvis|head/.test(seg) && e.speed > 1.3) audio.bodyFall(clamp(e.speed / 4, 0.2, 1), e.point);
    else if (e.ground) audio.impact('flesh', it * 0.7, e.point);
    else {
      const other = e.ragdollA ? e.matB : e.matA;
      if (other !== 'flesh' && other !== 'shoe') audio.impact(matOf(other), it, e.point);
      audio.impact('flesh', it * 0.8, e.point);
    }
  } else if (e.ground) audio.impact(matOf(e.matA), it, e.point);
  else audio.impact(matOf(e.matA), it, e.point);
}

function shatterFx(e) {
  const p = new THREE.Vector3(e.point.x, e.point.y, e.point.z);
  const v = new THREE.Vector3(e.vel.x, e.vel.y, e.vel.z);
  if (e.kind === 'glass') {
    effects.burst('glass', p, v, 22, 2.2);
    audio.glassShatter(clamp(v.length() / 12, 0.4, 1), e.point);
    // beer splash
    particles.spray(p, new THREE.Vector3(0, 1, 0), 30, 1.8, 1.2, 0.001, 0.003, 3, 0.02);
  } else {
    effects.burst('melon', p, v, 16, 2.6);
    particles.spray(p, new THREE.Vector3(0, 0.6, 0).add(v.clone().normalize().multiplyScalar(0.4)).normalize(), 60, 3, 1.1, 0.001, 0.004, 3, 0.05);
    particles.spray(p, new THREE.Vector3(0, 1, 0), 14, 2, 1.0, 0.004, 0.01, 4, 0.1);
    particles.addMist(p, new THREE.Vector3(0, 1, 0), 30, 2, 0xc02a3a, 0.08, 0.6);
    decals.splat(p.x, p.z, 0.25, 2, 0.8, 1, Math.random() * 6, Math.random());
    audio.splat(clamp(v.length() / 10, 0.4, 1), e.point);
  }
}

function injuryFx(person, ev) {
  const r = renders.get(person);
  const head = person.rd.segments.head.body.pos;
  switch (ev.type) {
    case 'wound':
      if (r) addWoundDecal(person, r, ev.wound);
      break;
    case 'bonebreak': {
      const info = ev.info;
      if (r) r.hm.addFracture(info.seg, info.fragment, info.pointBind, info.axisBind);
      audio.boneCrack(1, info.fragment.pos);
      break;
    }
    case 'fracture':
      if (!ev.physical) audio.boneCrack(0.7, head);
      break;
    case 'grunt':
      audio.grunt(ev.intensity, head);
      break;
    case 'death':
      ui.notify(`Dummy #${person.id} died: ${ev.cause}`);
      break;
    case 'ko':
      ui.notify(`Dummy #${person.id} knocked out`);
      break;
    case 'paralysis':
      ui.notify(`Dummy #${person.id}: spinal cord injury (${ev.level})`);
      break;
  }
}

// ---------------------------------------------------------------------------------------------
// main loop
let acc = 0;
let last = performance.now();
let heartbeatOn = false;
const _fwd = new THREE.Vector3();

function stepSim() {
  // grab follows the pointer on a plane facing the camera
  if (sandbox.grab) {
    const { origin, dir } = pointerRay();
    camera.getWorldDirection(_fwd);
    const denom = dir.x * _fwd.x + dir.y * _fwd.y + dir.z * _fwd.z;
    if (denom > 1e-3) {
      const t = state.grabDepth / denom;
      const p = origin.clone().addScaled(dir, t);
      p.y = Math.max(p.y, 0.02);
      sandbox.updateGrab(p);
    }
  }
  sandbox.viewer = new Vec3(camera.position.x, camera.position.y, camera.position.z);
  sandbox.step(FIXED);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min((now - last) / 1000, 0.1);
  last = now;
  // automatic weapons keep firing while the button is held
  if (state.firing && state.tool.startsWith('w:') && WEAPONS[state.tool.slice(2)].auto) fireWeapon();
  let simDt = 0;
  if (!state.paused) {
    acc += dtReal * state.timeScale;
    let n = 0;
    while (acc >= FIXED && n < 4) {
      stepSim();
      acc -= FIXED;
      simDt += FIXED;
      n++;
    }
    if (n === 4) acc = 0;
  } else if (state.stepOnce) {
    stepSim();
    simDt = FIXED;
    state.stepOnce = false;
  }
  for (const e of sandbox.drainFx()) handleFx(e);
  const alpha = state.paused ? 1 : clamp(acc / FIXED, 0, 1);

  // people
  for (const [person, r] of renders) {
    r.hm.update(alpha);
    if (simDt > 0) r.skin.update(simDt, shape);
    r.decalTimer -= dtReal;
    if (r.decalsDirty || r.decalTimer <= 0) {
      for (const d of r.decals) d.age = d.wound.age;
      r.hm.setWounds(r.decals);
      r.decalsDirty = false;
      r.decalTimer = 0.25;
    }
    const inj = person.injury;
    const loss = 1 - inj.blood / 5000;
    r.hm.setPhysiology(clamp((loss - 0.1) * 2.5, 0, 1) + (inj.alive ? 0 : 0.3), clamp((0.9 - inj.spo2) * 3, 0, 1));
  }
  // props
  for (const [o, m] of propMeshes) interpPose(o.body, alpha, m);
  particles.update(simDt);
  effects.update(simDt || (state.paused ? 0 : dtReal * state.timeScale));
  decals.flush();
  if (state.debug) {
    dbg.sync(sandbox.world.bodies, alpha);
    balanceViz.update(sandbox.people);
  }

  // camera: WASD pans the view, follow mode tracks the selected dummy
  const sel = state.selected && sandbox.people.includes(state.selected) ? state.selected : sandbox.people[0];
  const move = new THREE.Vector3();
  camera.getWorldDirection(_fwd);
  _fwd.y = 0;
  _fwd.normalize();
  const right = new THREE.Vector3(-_fwd.z, 0, _fwd.x);
  if (state.keys.has('w')) move.add(_fwd);
  if (state.keys.has('s')) move.sub(_fwd);
  if (state.keys.has('d')) move.add(right);
  if (state.keys.has('a')) move.sub(right);
  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(3 * dtReal);
    camera.position.add(move);
    controls.target.add(move);
  }
  if (state.follow && sel) {
    const com = sel.ctl.sens.com;
    const tgt = new THREE.Vector3(com.x, clamp(com.y + 0.1, 0.35, 1.1), com.z);
    const delta = tgt.sub(controls.target).multiplyScalar(1 - Math.exp(-dtReal * 3));
    controls.target.add(delta);
    camera.position.add(delta);
  }
  controls.update();
  arena.focus(sel ? sel.rd.pelvis.pos : controls.target);

  // view model aims along the pointer ray
  raycaster.setFromCamera(state.pointer, camera);
  const dirCam = raycaster.ray.direction.clone().transformDirection(camera.matrixWorldInverse);
  viewmodel.setAim(dirCam);
  viewmodel.update(dtReal);

  // audio
  camera.getWorldDirection(_fwd);
  audio.setListener(camera.position, _fwd);
  if (sel && sel.injury.alive && (sel.injury.status === 'critical' || sel.injury.hr > 140)) {
    audio.heartbeat(sel.injury.hr);
    heartbeatOn = true;
  } else if (heartbeatOn) {
    audio.heartbeat(0);
    heartbeatOn = false;
  }

  ui.updateHud(sel, dtReal, sel ? `Dummy #${sel.id}` : 'No dummy');

  renderer.clear();
  renderer.render(scene, camera);
  viewmodel.render(renderer);
}

// physics debug: centre of mass, capture point, support polygon
function createBalanceViz(scene) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const pool = [];
  const comMat = new THREE.MeshBasicMaterial({ color: 0x33ff88, depthTest: false });
  const cpMat = new THREE.MeshBasicMaterial({ color: 0xff3355, depthTest: false });
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffee55, depthTest: false });
  function get(i) {
    if (!pool[i]) {
      const com = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), comMat);
      const comG = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.03, 20).rotateX(-Math.PI / 2), comMat);
      const cp = new THREE.Mesh(new THREE.RingGeometry(0.025, 0.04, 20).rotateX(-Math.PI / 2), cpMat);
      const poly = new THREE.LineLoop(new THREE.BufferGeometry(), lineMat);
      for (const o of [com, comG, cp, poly]) {
        o.renderOrder = 10;
        group.add(o);
      }
      pool[i] = { com, comG, cp, poly };
    }
    return pool[i];
  }
  return {
    group,
    update(people) {
      people.forEach((p, i) => {
        const v = get(i);
        const d = p.ctl.debug;
        v.com.position.set(d.com.x, d.com.y, d.com.z);
        v.comG.position.set(d.com.x, 0.004, d.com.z);
        v.cp.position.set(d.cp.x, 0.004, d.cp.z);
        const pts = (d.support || []).map((q) => new THREE.Vector3(q.x, 0.005, q.z));
        v.poly.geometry.setFromPoints(pts.length ? pts : [new THREE.Vector3()]);
      });
      for (let i = people.length; i < pool.length; i++) for (const o of Object.values(pool[i])) o.visible = false;
      for (let i = 0; i < people.length; i++) for (const o of Object.values(pool[i])) o.visible = true;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// start
resetAll();
setTool('w:pistol');
requestAnimationFrame(frame);

// test / automation hooks
window.__sim = {
  ready: false,
  sandbox,
  renderer,
  camera,
  controls,
  state,
  setTool,
  doAction,
  /** Fire the current or given weapon at a segment of the first dummy. */
  shoot(weapon = 'pistol', seg = 'chest', from = null) {
    const p = sandbox.people[0];
    const b = p.rd.segments[seg].body;
    const o = from ? new Vec3(from[0], from[1], from[2]) : new Vec3(camera.position.x, camera.position.y, camera.position.z);
    const d = b.pos.clone().sub(o).normalize();
    sandbox.fire(weapon, o, d);
  },
  throwAt(type = 'brick', seg = 'head', speed) {
    const p = sandbox.people[0];
    const b = p.rd.segments[seg].body;
    const o = new Vec3(camera.position.x, camera.position.y - 0.1, camera.position.z);
    const d = b.pos.clone().sub(o).normalize();
    sandbox.throwObject(type, o.addScaled(d, 0.5), d, speed);
  },
  view(px, py, pz, tx, ty, tz) {
    camera.position.set(px, py, pz);
    controls.target.set(tx, ty, tz);
    controls.update();
  },
  advance(frames) {
    for (let i = 0; i < frames; i++) {
      stepSim();
      for (const e of sandbox.drainFx()) handleFx(e);
      for (const [, r] of renders) r.skin.update(FIXED, shape);
      particles.update(FIXED);
      effects.update(FIXED);
    }
    decals.flush();
  },
};
