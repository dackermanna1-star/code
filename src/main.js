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
import { OBSTACLES, OBSTACLE_KEYS } from './game/obstacles.js';
import { AudioEngine } from './game/audio.js';
import { createRenderer, Arena } from './render/arena.js';
import { FloorDecals } from './render/floorDecals.js';
import { HumanMesh } from './render/humanMesh.js';
import { BloodParticles, SkinBlood, buildAdjacency, buildVertexHash } from './render/blood.js';
import { Effects } from './render/effects.js';
import { ViewModel } from './render/viewmodel.js';
import { DebugDraw, interpPose } from './render/debugDraw.js';
import * as OM from './render/objectMeshes.js';
import { createObstacleMesh, disposeObstacleMesh, createObstacleGhost, setObstacleGhostColor, obstacleFootprint } from './render/obstacleMeshes.js';
import { WalkMarkers, goalsAhead } from './render/walkMarkers.js';
import { UI, WEAPON_KEYS, THROW_KEYS, MELEE_TOOLS } from './ui/ui.js';
import { SurvivalMode } from './modes/survivalMode.js';
import { FpsSandboxMode } from './modes/fpsSandbox.js';
import { KillCam } from './modes/killCam.js';
import { XRayRig } from './render/xray.js';
import { zombieLook, ZombieGear } from './render/zombieGear.js';

const FIXED = 1 / 60;
const WOUND_KIND = { entry: 0, exit: 1, laceration: 2, bruise: 3, abrasion: 4 };

// ---------------------------------------------------------------------------------------------
// scene
const container = document.getElementById('app');
const renderer = createRenderer(container);
renderer.autoClear = false;
let decals = new FloorDecals(renderer, { half: 7, size: 2048 });
const arena = new Arena(renderer, decals);
let scene = arena.scene;
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
let sandbox = new Sandbox({ shape });
let particles = new BloodParticles(scene, decals);
let effects = new Effects(scene, { shardFactory: typeof OM.createShardMesh === 'function' ? OM.createShardMesh : null });
const viewmodel = new ViewModel(OM, camera.aspect);
viewmodel.setEnvironment(arena.envMap);
const audio = new AudioEngine({ volume: 0.7 });
const dbg = new DebugDraw(scene);
dbg.setVisible(false);
const balanceViz = createBalanceViz(scene);
const walkMarkers = new WalkMarkers(scene);

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
  melee: null, // a melee tool blow being wound up (button held)
  lastShot: -1,
  selected: null,
  pointer: new THREE.Vector2(),
  pointerPx: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  grabDepth: 0,
  keys: new Set(),
  pointerIn: false,
  obstacleType: OBSTACLE_KEYS[0],
  obstacleYaw: 0,
};

const ui = new UI(document.body, { onTool: setTool, onAction: doAction, onSetting: setSetting });
ui.setActiveTool(state.tool);
ui.setTime(1, false);

// ---------------------------------------------------------------------------------------------
// body mesh (generated in a worker) and per-person render state
let meshShared = null;
// a lighter body mesh (~43k instead of ~153k triangles) for the crowds of the survival mode
let meshLod = null;
const LOD_OPTS = { h: 0.014, fine: 0.45 };
let renders = new Map();
const xrays = new Map(); // X-ray rigs (kill cam), per person
ui.setLoading(true);
// generate prop/weapon textures in idle slices now rather than on the first throw
if (typeof OM.preloadObjectMeshes === 'function') setTimeout(() => OM.preloadObjectMeshes().catch(() => {}), 300);

function onMeshReady(data) {
  if (data.tag === 'lod') {
    meshLod = { data, adjacency: buildAdjacency(data), vhash: buildVertexHash(data) };
    return;
  }
  meshShared = { data, adjacency: buildAdjacency(data), vhash: buildVertexHash(data) };
  for (const p of sandbox.people) attachRender(p);
  ui.setLoading(false);
  window.__sim.ready = true;
}
function buildMeshHere() {
  // fallback when workers are unavailable (e.g. some file:// setups): build on the main thread
  setTimeout(() => {
    onMeshReady(buildBodyMesh(new BodyShape(segNames)));
    setTimeout(() => onMeshReady({ ...buildBodyMesh(new BodyShape(segNames), LOD_OPTS), tag: 'lod' }), 50);
  }, 50);
}
try {
  const worker = new MeshWorker();
  worker.onmessage = (e) => onMeshReady(e.data);
  worker.onerror = (e) => {
    console.warn('mesh worker failed, building on the main thread', e);
    buildMeshHere();
  };
  worker.postMessage({ segNames });
  worker.postMessage({ segNames, opts: LOD_OPTS, tag: 'lod' });
} catch (e) {
  console.warn('mesh worker unavailable', e);
  buildMeshHere();
}

function attachRender(person) {
  if (!meshShared || renders.has(person)) return;
  const ms = person.zombie && meshLod ? meshLod : meshShared;
  const hm = new HumanMesh(ms.data, person.rd, shape, person.look ? zombieLook(person) : {});
  scene.add(hm.mesh);
  const gear = person.zombie ? new ZombieGear(person, scene) : null;
  const skin = new SkinBlood(hm, ms, particles, decals, person);
  const r = { hm, skin, gear, decals: [], decalsDirty: true, decalTimer: 0 };
  renders.set(person, r);
  // wounds that happened before the mesh was ready
  for (const w of person.injury.wounds) addWoundDecal(person, r, w);
  for (const seg of person.rd.segList) {
    if (seg.fractured) hm.addFracture(seg, seg.fractured.extra[0], seg.fractured.pointBind, seg.fractured.axis);
  }
}

function detachRender(person) {
  const xr = xrays.get(person);
  if (xr) {
    xr.dispose();
    xrays.delete(person);
  }
  const r = renders.get(person);
  if (!r) return;
  scene.remove(r.hm.mesh);
  r.hm.dispose();
  if (r.gear) r.gear.dispose();
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
let propMeshes = new Map();

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
// fixed obstacles and the placement ghost
let obstacleMeshes = new Map();
const ghosts = new Map(); // type -> preview group (one shown at a time)
const GHOST_OK = 0xbfe6ff, GHOST_BAD = 0xff4d4d;

function ghostOf(type) {
  let g = ghosts.get(type);
  if (!g) {
    g = createObstacleGhost(type);
    g.visible = false;
    scene.add(g);
    ghosts.set(type, g);
  }
  return g;
}

function hideGhosts() {
  for (const g of ghosts.values()) g.visible = false;
}

/** Where the pointer ray meets the floor (obstacles stand on it), or null. */
function floorPoint(origin, dir) {
  if (dir.y > -1e-3) return null;
  const t = -origin.y / dir.y;
  return t < 80 ? origin.clone().addScaled(dir, t) : null;
}

/** First person with a body part inside an obstacle footprint at `pos`/`yaw` (placing it there would crush them). */
function personInFootprint(type, pos, yaw) {
  const fp = obstacleFootprint(type), m = 0.08;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const p of sandbox.people) {
    for (const b of p.rd.allBodies()) {
      const dx = b.pos.x - pos.x, dz = b.pos.z - pos.z;
      const lx = c * dx - s * dz, lz = s * dx + c * dz;
      if (b.pos.y < fp.height + 0.15 && lx > fp.minX - m && lx < fp.maxX + m && lz > fp.minZ - m && lz < fp.maxZ + m) return p;
    }
  }
  return null;
}

/** Ghost preview of the obstacle tool: placement at the pointer, or (shift) the obstacle to remove. */
function updateGhost() {
  hideGhosts();
  if (!state.tool.startsWith('o:') || !state.pointerIn) return;
  const { origin, dir } = pointerRay();
  if (state.keys.has('shift')) {
    const hit = sandbox.pick(origin, dir, 80);
    const ob = hit && hit.body ? sandbox.obstacleOfBody(hit.body) : null;
    if (!ob) return;
    const g = ghostOf(ob.type);
    g.position.set(ob.body.pos.x, ob.body.pos.y, ob.body.pos.z);
    g.quaternion.set(ob.body.rot.x, ob.body.rot.y, ob.body.rot.z, ob.body.rot.w);
    setObstacleGhostColor(GHOST_BAD);
    g.visible = true;
    return;
  }
  const type = state.tool.slice(2);
  const p = floorPoint(origin, dir);
  if (!p) return;
  const g = ghostOf(type);
  g.position.set(p.x, 0, p.z);
  g.rotation.set(0, state.obstacleYaw, 0);
  setObstacleGhostColor(personInFootprint(type, p, state.obstacleYaw) ? GHOST_BAD : GHOST_OK);
  g.visible = true;
}

function obstacleClick(shift) {
  const { origin, dir } = pointerRay();
  if (shift) {
    const hit = sandbox.pick(origin, dir, 80);
    const ob = hit && hit.body ? sandbox.obstacleOfBody(hit.body) : null;
    if (ob) {
      sandbox.removeObstacle(ob);
      ui.notify(`${ob.def.label} removed`);
    }
    return;
  }
  const type = state.tool.slice(2);
  const p = floorPoint(origin, dir);
  if (!p) return;
  const who = personInFootprint(type, p, state.obstacleYaw);
  if (who) {
    ui.notify(`Too close to Dummy #${who.id}`);
    return;
  }
  sandbox.addObstacle(type, p, state.obstacleYaw);
  audio.impact(OBSTACLES[type].material, 0.5, p);
}

// ---------------------------------------------------------------------------------------------
// walking orders
/** Who a walk order goes to: the selected dummy, else the nearest one standing. */
function walkerFor(point) {
  if (state.selected && sandbox.people.includes(state.selected)) return state.selected;
  let best = null, bd = Infinity;
  for (const p of sandbox.people) {
    if (p.ctl.mode !== 'balance') continue;
    const d = Math.hypot(p.rd.pelvis.pos.x - point.x, p.rd.pelvis.pos.z - point.z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** Send `person` to `point`; with `append` the point becomes the next goal after the current ones. */
function sendWalk(person, point, append = false) {
  if (!person.ctl.alive || !person.ctl.conscious) {
    ui.notify(`Dummy #${person.id} is ${person.ctl.alive ? 'unconscious' : 'dead'}`);
    return null;
  }
  const nav = person.ctl.nav;
  const ahead = append ? goalsAhead(nav) : [];
  let path;
  if (!ahead.length) path = sandbox.walkTo(person, point);
  else if (ahead.length === nav.goals.length) path = sandbox.walkTo(person, point, { append: true });
  else {
    // the walk's goal list still holds the goals already passed: re-issue the ones ahead
    const goals = [...ahead.map((g) => nav.goals[g]), point];
    path = sandbox.walkTo(person, goals[0]);
    for (let k = 1; path && k < goals.length; k++) path = sandbox.walkTo(person, goals[k], { append: true });
  }
  state.selected = person;
  if (!path) ui.notify("Can't get there");
  else ui.notify(ahead.length ? `Dummy #${person.id}: waypoint ${person.ctl.nav.goals.length}` : `Dummy #${person.id} walking`);
  return path;
}

function walkClick(shift) {
  const { origin, dir } = pointerRay();
  const hit = sandbox.pick(origin, dir, 80);
  if (!hit) return;
  if (hit.person) {
    state.selected = hit.person;
    ui.notify(`Dummy #${hit.person.id} selected`);
    return;
  }
  const person = walkerFor(hit.point);
  if (person) sendWalk(person, hit.point, shift);
}

// walks that ended badly get a short note (arrivals and stops are visible enough)
const reportedWalks = new WeakSet();
const WALK_END_NOTE = { stuck: 'stuck, gave up', unreachable: "can't get there", 'too injured': 'too injured to walk on' };

function checkWalks() {
  for (const p of sandbox.people) {
    const nav = p.ctl.nav;
    if (!nav || !nav.done || reportedWalks.has(nav)) continue;
    reportedWalks.add(nav);
    if (WALK_END_NOTE[nav.status]) ui.notify(`Dummy #${p.id}: ${WALK_END_NOTE[nav.status]}`);
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
  else if (id === 'walk') ui.notify('Walk — click a dummy to select it, click a spot to send it there, shift+click adds a waypoint');
  else if (id.startsWith('m:')) {
    const m = MELEE_TOOLS.find((x) => x[0] === id.slice(2));
    ui.notify(`${m[1]} — ${m[2]}; click a dummy, hold the button to put more into the blow`);
  }
  else if (id.startsWith('o:')) {
    state.obstacleType = id.slice(2);
    ui.notify(`${OBSTACLES[id.slice(2)].label} (${OBSTACLES[id.slice(2)].note}) — click to place, Z rotates, shift+click removes`);
  }
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
    case 'stopWalk': {
      const p = state.selected && sandbox.people.includes(state.selected) ? state.selected : null;
      if (p && p.ctl.nav && !p.ctl.nav.done) {
        sandbox.stopWalking(p);
        ui.notify(`Dummy #${p.id} stopped`);
      }
      break;
    }
    case 'course': {
      // build it, put a fresh dummy at the west end and send it across (over the step platform)
      const c = sandbox.buildCourse();
      const start = sandbox.freeSpot(c.start);
      const p = sandbox.spawnPerson(start, Math.PI / 2);
      state.selected = p;
      setTool('walk');
      camera.position.set(start.x + 1.5, 1.9, start.z + 4.2);
      controls.target.set(start.x + 1.5, 0.9, start.z);
      controls.update();
      if (!state.follow) doAction('follow');
      // give it a moment to find its feet before setting off
      setTimeout(() => {
        if (!sandbox.people.includes(p)) return;
        sandbox.walkTo(p, c.via);
        sandbox.walkTo(p, c.end, { append: true });
      }, 900);
      ui.notify(`Test course built — Dummy #${p.id} is walking it`);
      break;
    }
    case 'clearObstacles':
      sandbox.clearObstacles();
      ui.notify('Obstacles cleared');
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
    case 'nextDummy': {
      const list = sandbox.people;
      if (!list.length) break;
      const i = list.indexOf(state.selected);
      state.selected = list[(i + 1) % list.length];
      break;
    }
    case 'follow':
      state.follow = !state.follow;
      ui.setFlag('follow', state.follow);
      break;
    case 'survival':
      enterSurvival();
      break;
    case 'fps':
      enterFps();
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
        r.hm.mesh.material.needsUpdate = true;
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
    case 'rdr':
      sandbox.setReactions(v ? 'rdr' : 'realistic');
      ui.notify(v ? 'RDR reactions: bigger hits, head shots stagger before they drop' : 'Realistic reactions');
      break;
    case 'killcam':
      killCam.mode = v ? 'sniper' : 'off';
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
  if (!killCam.tryStart(type, origin, dir, null)) sandbox.fire(type, origin, dir);
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
  state.pointerIn = true;
  if (e.shiftKey) state.keys.add('shift');
  else state.keys.delete('shift');
});
renderer.domElement.addEventListener('pointerenter', () => (state.pointerIn = true));
renderer.domElement.addEventListener('pointerleave', () => (state.pointerIn = false));
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (mode === 'survival' || mode === 'fps') return;
  if (killCam.active) {
    killCam.skip();
    return;
  }
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
  } else if (t.startsWith('m:')) {
    state.melee = { tool: t.slice(2), t0: performance.now(), shift: e.shiftKey };
    renderer.domElement.setPointerCapture(e.pointerId);
  } else if (t.startsWith('t:')) {
    throwProp(e.shiftKey);
  } else if (t === 'walk') {
    walkClick(e.shiftKey);
  } else if (t.startsWith('o:')) {
    obstacleClick(e.shiftKey);
  }
});
window.addEventListener('pointerup', (e) => {
  if (e.button !== 0) return;
  state.firing = false;
  sandbox.endGrab();
  if (state.melee && mode === 'sandbox') {
    const m = state.melee;
    state.melee = null;
    meleeClick(m.tool, clamp(((performance.now() - m.t0) / 1000 - 0.1) / 0.8, 0, 1), m.shift || e.shiftKey);
  }
});

/**
 * Melee tool: a blow at the pointed spot from the camera's side, with the weapon's speed and mass
 * for the charge (how long the button was held). The boot stamps on a body lying on the floor and
 * kicks a standing one; the knife stabs (shift: a slash across the spot).
 */
function meleeClick(weapon, charge, shift) {
  const { origin, dir } = pointerRay();
  const hit = sandbox.pick(origin, dir, 60);
  const p = hit && hit.body ? personOfBody(hit.body) : null;
  if (!p) {
    audio.whoosh(weapon === 'bat' ? 14 + 16 * charge : 8, null);
    return;
  }
  const P = hit.point, d = dir.clone();
  const opts = { charge, by: 'tool' };
  let from, to;
  if (weapon === 'boot' && P.y < 0.45 && p.ctl.mode !== 'balance') {
    // a stamp from above, the sole across the body
    from = new Vec3(P.x, P.y + 0.45, P.z);
    to = new Vec3(P.x, P.y - 0.12, P.z);
    const ax = new Vec3(d.x, 0, d.z);
    opts.axis = ax.lengthSq() > 1e-6 ? ax.normalize() : new Vec3(0, 0, 1);
  } else if (weapon === 'knife' && shift) {
    // a slash: the edge drawn across the spot, the blade pointing into the body
    const right = new Vec3().crossVectors(d, new Vec3(0, 1, 0)).normalize();
    from = P.clone().addScaled(right, -0.22).addScaled(d, -0.02);
    to = P.clone().addScaled(right, 0.22).addScaled(d, -0.02);
    opts.mode = 'slash';
    opts.into = d.clone();
  } else {
    from = P.clone().addScaled(d, -0.4);
    to = P.clone().addScaled(d, 0.15);
    if (weapon === 'knife') opts.mode = 'stab';
  }
  audio.whoosh(weapon === 'bat' ? 14 + 16 * charge : weapon === 'fists' ? 9 + 3 * charge : 8, P);
  const r = sandbox.meleeStrike(weapon, from, to, opts);
  state.selected = p;
  if (!r.hits.length) ui.notify('Missed');
}

window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (mode === 'survival' || mode === 'fps') return;
  if (killCam.active) {
    killCam.skip();
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    enterFps();
    return;
  }
  audio.unlock();
  const k = e.key.toLowerCase();
  state.keys.add(k);
  if (k >= '1' && k <= '6') setTool('w:' + WEAPON_KEYS[+k - 1]);
  else if (k >= '7' && k <= '9') setTool('m:' + MELEE_TOOLS[+k - 7][0]);
  else if (k === '0') setTool('m:' + MELEE_TOOLS[3][0]);
  else if (k === 'g') setTool('grab');
  else if (k === 'f') setTool('shove');
  else if (k === 'm') setTool('walk');
  else if (k === 'x') doAction('stopWalk');
  else if (k === 'q' || k === 'e') {
    const cur = state.tool.startsWith('t:') ? THROW_KEYS.indexOf(state.tool.slice(2)) : -1;
    const n = THROW_KEYS.length;
    const next = cur < 0 ? 0 : (cur + (k === 'e' ? 1 : n - 1)) % n;
    setTool('t:' + THROW_KEYS[next]);
  } else if (k === 'o') {
    // first press: the obstacle type used last; then cycle (shift: backwards)
    const n = OBSTACLE_KEYS.length;
    const cur = state.tool.startsWith('o:') ? OBSTACLE_KEYS.indexOf(state.tool.slice(2)) : -1;
    const next = cur < 0 ? OBSTACLE_KEYS.indexOf(state.obstacleType) : (cur + (e.shiftKey ? n - 1 : 1)) % n;
    setTool('o:' + OBSTACLE_KEYS[next]);
  } else if (k === 'z') {
    // placement turn in 45 degree steps (shift: the other way)
    state.obstacleYaw = (state.obstacleYaw + (e.shiftKey ? -1 : 1) * (Math.PI / 4) + 2 * Math.PI) % (2 * Math.PI);
    if (state.tool.startsWith('o:')) ui.notify(`Rotation ${Math.round((state.obstacleYaw * 180) / Math.PI)}°`);
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
  else if (k === 'p') doAction('survival');
});
window.addEventListener('keyup', (e) => state.keys.delete(e.key.toLowerCase()));

window.addEventListener('resize', () => {
  if (mode === 'survival') {
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  viewmodel.setAspect(camera.aspect);
  killCam.setAspect(camera.aspect);
  particles.setViewportHeight(window.innerHeight * renderer.getPixelRatio(), camera.fov);
});
particles.setViewportHeight(window.innerHeight * renderer.getPixelRatio(), camera.fov);

// ---------------------------------------------------------------------------------------------
// simulation events -> visuals and sound
const _tv = new THREE.Vector3();

function muzzleWorld(out) {
  if (mode === 'fps') {
    fpsMode.view.muzzleCameraSpace(_tv);
    out.copy(_tv);
    fpsMode.camera.localToWorld(out);
    return out;
  }
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
    case 'obstacleAdded': {
      const b = e.obstacle.body;
      const m = createObstacleMesh(e.obstacle.type);
      m.position.set(b.pos.x, b.pos.y, b.pos.z);
      m.quaternion.set(b.rot.x, b.rot.y, b.rot.z, b.rot.w);
      scene.add(m);
      obstacleMeshes.set(e.obstacle, m);
      break;
    }
    case 'obstacleRemoved': {
      const m = obstacleMeshes.get(e.obstacle);
      if (m) disposeObstacleMesh(m);
      obstacleMeshes.delete(e.obstacle);
      break;
    }
    case 'shot': {
      // (the kill cam's round has already been seen flying: no second report or tracer)
      if (e.by === 'killcam') break;
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
    case 'meleeHit':
      meleeFx(e);
      break;
  }
}

/** Sound, blood and (for a bone-breaking full-power blow) a beat of slow motion with the X-ray. */
function meleeFx(e) {
  const P = new THREE.Vector3(e.point.x, e.point.y, e.point.z);
  const n = new THREE.Vector3(e.normal.x, e.normal.y, e.normal.z);
  const d = new THREE.Vector3(e.dir.x, e.dir.y, e.dir.z);
  const it = clamp(e.energy / 250, 0.25, 1);
  const breaks = e.fractures || [];
  state.selected = e.person;
  if (e.kind === 'blunt') {
    if (e.weapon === 'bat') audio.impact('wood', it, e.point);
    audio.impact('flesh', it, e.point);
    if (breaks.length) audio.boneCrack(clamp(0.6 + 0.2 * breaks.length, 0.6, 1), e.point);
    // a broken nose or a split brow bleeds at once
    if (state.gore && (breaks.some((f) => /nasal|zygoma|maxilla|mandible|skull/.test(f.label || '')) || (e.seg === 'head' && e.energy > 300))) {
      particles.spray(P, n, 8 + Math.round(10 * it), 1.2 + 1.5 * it, 0.6, 0.0006, 0.002, 0, 0.04);
      particles.addMist(P, n, 6, 0.8, 0xa01414, 0.02, 0.25);
    }
  } else {
    audio.splat(e.kind === 'stab' ? 0.7 : 0.45, e.point);
    if (state.gore) {
      // a cut sprays along the stroke and off the edge; a stab spurts as the blade comes out
      const along = d.clone().addScaled(n, 0.5).normalize();
      particles.spray(P, e.kind === 'stab' ? n : along, e.kind === 'stab' ? 14 : 22, e.kind === 'stab' ? 1.6 : 2.4, 0.55, 0.0005, 0.0022, 0, 0.06);
      if ((e.structures || []).some((s) => /carotid|jugular|artery|aorta|heart/.test(s))) particles.spray(P, n, 30, 3.2, 0.25, 0.0008, 0.003, 0, 0.02);
    }
  }
  // bullet time for a blow that breaks the ribs, the skull or the jaw, or knocks the lights out
  const big = (e.charge ?? 0) >= 0.75 || e.weapon === 'boot';
  const bones = breaks.some((f) => /ribs|skull|sternum|mandible|cervical/.test(f.label || ''));
  if (big && (bones || e.ko || e.killed) && killCam.impactMoment(e.person, bones ? 1.2 : 0.9)) {
    const rig = killCam.moment && killCam.moment.xray;
    if (rig) {
      // (a blunt blow cracks and caves bone in rather than bursting it: modest debris)
      const E = clamp(e.energy * 2, 300, 1200);
      for (const f of breaks) {
        const at = f.pointW || e.point;
        const seg = f.segName || e.seg || 'chest';
        if (/ribs/.test(f.label)) rig.breakBone('chest', at, e.dir, E, { blunt: true, count: f.ribs ? f.ribs.length : 1 });
        else rig.breakBone(/skull|nasal|zygoma|maxilla|mandible/.test(f.label) ? 'head' : seg, at, e.dir, E, { blunt: true });
      }
    }
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
    case 'armor':
      if (ev.part === 'helmet' && ev.left === 0 && r && r.gear) {
        const v = person.rd.segments.head.body.vel;
        r.gear.dropHelmet(v.lengthSq() > 0.01 ? v : new Vec3(Math.random() - 0.5, 0, Math.random() - 0.5), (x, z) => sandbox.world.surfaceAt(x, z, 3));
        audio.impact('metal', 0.9, head);
      }
      break;
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
      if (!ev.physical) audio.boneCrack(0.7, ev.pointW || head);
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
    case 'arrest':
      ui.notify(`Dummy #${person.id}: cardiac arrest (${ev.cause})`);
      break;
    case 'gasp':
      // agonal breathing: a weak, low gasp
      audio.grunt(0.15, head);
      break;
    case 'cough': {
      audio.grunt(0.25, head);
      // coughing up blood: a fine spray from the mouth
      if (ev.blood && state.gore) {
        const h = person.rd.segments.head.body;
        const mouth = h.localToWorld(new Vec3(0, -0.05, 0.09), new Vec3());
        const fwd = h.localDirToWorld(new Vec3(0, -0.2, 1), new Vec3()).normalize();
        particles.spray(new THREE.Vector3(mouth.x, mouth.y, mouth.z), new THREE.Vector3(fwd.x, fwd.y, fwd.z), 10, 1.4, 0.5, 0.0006, 0.0018, 0, 0.03);
      }
      break;
    }
  }
}

/** People meshes: pose from the bodies, skin blood, wound decals, pallor. */
function updateRenders(simDt, dtReal, alpha) {
  // (X-ray debris moves smoothly in slow motion: real time scaled, not whole physics steps)
  const xdt = dtReal * killCam.worldScale() * (mode === 'sandbox' ? (state.paused ? 0 : state.timeScale) : 1);
  for (const [person, r] of renders) {
    if (!person.frozen) r.hm.update(alpha);
    else if (!r.frozenPosed) {
      r.hm.update(1);
      r.frozenPosed = true;
    }
    const xr = xrays.get(person);
    if (xr) xr.update(Math.min(xdt, 0.05), alpha);
    if (simDt > 0 && !person.frozen) r.skin.update(simDt, shape);
    if (r.gear) r.gear.update(person.frozen ? 1 : alpha, simDt);
    r.decalTimer -= dtReal;
    if (r.decalsDirty || r.decalTimer <= 0) {
      for (const d of r.decals) d.age = d.wound.age;
      r.hm.setWounds(r.decals);
      r.decalsDirty = false;
      r.decalTimer = person.frozen ? 2 : 0.25;
    }
    const inj = person.injury;
    const loss = 1 - inj.blood / 5000;
    // (the undead keep their own grey-green: no living pallor or cyanosis on top)
    if (person.zombie) r.hm.setPhysiology(inj.alive ? 0.08 : 0.2, 0.15);
    else r.hm.setPhysiology(clamp((loss - 0.1) * 2.5, 0, 1) + (inj.alive ? 0 : 0.3), clamp((0.9 - inj.spo2) * 3, 0, 1));
  }
}

// ---------------------------------------------------------------------------------------------
// modes: the sandbox, and first-person survival (which brings its own world and swaps it in)
let mode = 'sandbox';
const sandboxCtx = { sandbox, scene, decals, particles, effects, renders, propMeshes, obstacleMeshes };
function useWorld(ctx) {
  ({ sandbox, scene, decals, particles, effects, renders, propMeshes, obstacleMeshes } = ctx);
}
const survival = new SurvivalMode({
  renderer, OM, audio, shape, ui, envMap: arena.envMap,
  useWorld, attachRender, detachRender, handleFx, updateRenders,
  exitSurvival: () => exitSurvival(),
});
function enterSurvival() {
  if (mode === 'survival') return;
  if (!meshShared) {
    ui.notify('Still building the body mesh — one moment');
    return;
  }
  audio.unlock();
  audio.heartbeat(0);
  state.firing = false;
  sandbox.endGrab();
  mode = 'survival';
  survival.enter();
}
function exitSurvival() {
  if (mode !== 'survival') return;
  survival.exit();
  useWorld(sandboxCtx);
  mode = 'sandbox';
  last = performance.now();
}

// sniper kill cam (both views of the sandbox)
const killCam = new KillCam({
  renderer, audio, canvas: renderer.domElement,
  sandbox: () => sandbox,
  scene: () => scene,
  xray: (person) => xrayFor(person),
  ghost: (person, on) => ghostFor(person, on),
  hideUi: (on) => {
    if (mode === 'sandbox') ui.root.style.visibility = on ? 'hidden' : '';
    if (mode === 'fps') fpsMode.hud.root.style.visibility = on ? 'hidden' : '';
    viewmodel.visible = !on && viewmodel.type !== null;
  },
});
/** X-ray rig of a person (skeleton, organs, damage) for the kill cam, built on first use. */
function xrayFor(person) {
  if (!renders.has(person)) return null;
  let rig = xrays.get(person);
  if (!rig) {
    rig = new XRayRig(person, scene, { floorY: sandbox.world.groundY });
    xrays.set(person, rig);
  }
  return rig;
}
/** The person's skin as a translucent glass shell (on) or its own skin again (off). */
function ghostFor(person, on) {
  const r = renders.get(person);
  if (r) XRayRig.setGhost(r.hm, on);
}
// the X-ray's shared skeleton and organ geometry takes about a second to build: do it in slices
// while the sandbox idles after loading
setTimeout(() => XRayRig.prebuildAsync(), 2500);

// first person in the sandbox (Tab)
const scopeEl = document.createElement('div');
scopeEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:12;opacity:0;background:radial-gradient(circle at center, rgba(0,0,0,0) 0, rgba(0,0,0,0) 38vmin, #000 38.4vmin)';
scopeEl.innerHTML = '<div style="position:absolute;left:50%;top:12%;bottom:12%;width:1.5px;background:#000;transform:translateX(-50%)"></div><div style="position:absolute;top:50%;left:calc(50% - 38vmin);right:calc(50% - 38vmin);height:1.5px;background:#000;transform:translateY(-50%)"></div><div style="position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#d22"></div>';
document.body.appendChild(scopeEl);
const fpsMode = new FpsSandboxMode({
  renderer, OM, audio, ui, envMap: arena.envMap, killCam,
  sandbox: () => sandbox,
  exitFps: () => exitFps(),
  stepSim: () => stepSim(),
  afterSim: (simDt, dtReal, cam) => afterSim(simDt, dtReal, cam),
  renderWorld: (cam) => {
    renderer.clear();
    renderer.render(scene, cam);
  },
  setScope: (a) => {
    scopeEl.style.opacity = a > 0.92 ? 1 : 0;
  },
  spawnInFront: (pl) => {
    const f = pl.forward(new Vec3());
    const p = sandbox.freeSpot(new Vec3(pl.pos.x + f.x * 3.2, 0, pl.pos.z + f.z * 3.2));
    const person = sandbox.spawnPerson(p, Math.atan2(pl.pos.x - p.x, pl.pos.z - p.z));
    state.selected = person;
  },
});
function enterFps() {
  if (mode !== 'sandbox') return;
  if (!meshShared) {
    ui.notify('Still building the body mesh — one moment');
    return;
  }
  audio.unlock();
  state.firing = false;
  sandbox.endGrab();
  viewmodel.setWeapon(null);
  mode = 'fps';
  fpsMode.enter();
}
function exitFps() {
  if (mode !== 'fps') return;
  fpsMode.exit();
  scopeEl.style.opacity = 0;
  mode = 'sandbox';
  setTool(state.tool);
  // the orbit camera picks up from where the player stood
  const pl = fpsMode.player;
  controls.target.set(pl.pos.x - Math.sin(pl.yaw) * 2, 0.9, pl.pos.z - Math.cos(pl.yaw) * 2);
  camera.position.set(pl.pos.x + Math.sin(pl.yaw) * 1.5, pl.pos.y + 1.8, pl.pos.z + Math.cos(pl.yaw) * 1.5);
  controls.update();
  last = performance.now();
}

/** After the world has been stepped: events, people, props, particles (shared by the views). */
function afterSim(simDt, dtReal, cam) {
  for (const e of sandbox.drainFx()) {
    killCam.onFx(e);
    handleFx(e);
  }
  const alpha = clamp(acc / FIXED, 0, 1);
  updateRenders(simDt, dtReal, alpha);
  for (const [o, m] of propMeshes) interpPose(o.body, alpha, m);
  particles.update(simDt);
  effects.update(simDt);
  decals.flush();
  arena.focus(cam.position);
  camera.getWorldDirection(_fwd);
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
  if (mode === 'survival') {
    survival.frame(now, dtReal);
    return;
  }
  if (mode === 'fps') {
    fpsMode.frame(now, dtReal);
    return;
  }
  if (killCam.active) {
    // the kill cam owns time and the camera
    const ts = killCam.update(dtReal);
    acc += dtReal * ts;
    let simDt = 0;
    while (acc >= FIXED) {
      stepSim();
      acc -= FIXED;
      simDt += FIXED;
    }
    afterSim(simDt, dtReal, killCam.active ? killCam.camera : camera);
    renderer.clear();
    renderer.render(scene, killCam.active ? killCam.camera : camera);
    return;
  }
  // automatic weapons keep firing while the button is held
  if (state.firing && state.tool.startsWith('w:') && WEAPONS[state.tool.slice(2)].auto) fireWeapon();
  let simDt = 0;
  if (!state.paused) {
    acc += dtReal * state.timeScale * killCam.momentScale(dtReal);
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

  updateRenders(simDt, dtReal, alpha);
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

  // walking overlay and the obstacle placement preview
  checkWalks();
  walkMarkers.setVisible(!ui.hidden);
  walkMarkers.update(dtReal, sandbox.people, sel || null, sandbox.world, state.tool === 'walk');
  updateGhost();

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
  get sandbox() {
    return sandbox;
  },
  survival,
  enterSurvival,
  exitSurvival,
  get mode() {
    return mode;
  },
  fpsMode,
  killCam,
  enterFps,
  exitFps,
  scene,
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
  /** Send dummy `i` walking to floor point (x, z); returns the route as [x, y, z] waypoints, or null. */
  walkTo(i, x, z, append = false) {
    const p = sandbox.people[i];
    if (!p) return null;
    const path = sendWalk(p, new Vec3(x, sandbox.world.surfaceAt(x, z, 5), z), append);
    return path ? path.map((q) => [q.x, q.y, q.z]) : null;
  },
  stopWalk(i) {
    const p = sandbox.people[i];
    if (p) sandbox.stopWalking(p);
  },
  addObstacle(type, x, z, yaw = 0) {
    const ob = sandbox.addObstacle(type, new Vec3(x, 0, z), yaw);
    return ob ? ob.id : null;
  },
  course() {
    sandbox.buildCourse();
    return sandbox.obstacles.length;
  },
  /** Per person: mode, walking state and the last walk's status ('walking', 'arrived', 'stuck', ...). */
  walkState() {
    return sandbox.people.map((p) => {
      const nav = p.ctl.nav, pel = p.rd.pelvis.pos;
      return { id: p.id, mode: p.ctl.mode, walking: p.ctl.walking, status: nav ? nav.status : null, x: pel.x, y: pel.y, z: pel.z, goals: nav ? nav.goals.length : 0 };
    });
  },
};
