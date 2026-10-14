// Models preview: zombies, the Bosun, weapons and props.
//
// Query params:
//   mode=lineup   (default) every kind × several looks walking under the GAME camera, hunter on the right
//   mode=close    close-up line of looks: kind=<kind|all> n=<looks> state=<state>
//   mode=states   contact sheet: every animation state (rows) × sample times (cols): kind=, look=
//   mode=hunter   the Bosun with every weapon: rows idle / fire / reload (or state=<PlayerState>)
//   mode=hstates  the Bosun's body states (stand, walk, air, stomp, kick, grabbed, hurt, dead) × times; weapon=<id>
//   mode=weapons  weapon models laid out large; mode=props  props laid out
//   mode=ragdoll  drop every kind as a ragdoll (physics), reports settle time / max speed
// Common: t=<sec> freezes time (deterministic), zoom=<k>, light=day|dusk|blue|night, yaw=<deg>, pitch=<deg>
// Playwright hooks: window.__ready (bool), window.__step(seconds, frames) advances + renders.
import * as THREE from 'three';
import { Stage } from '../src/render/Stage';
import { CAMERA_FOV, CAMERA_PITCH_DEG, CAMERA_POS, CAMERA_TARGET, DESIGN_H, DESIGN_W } from '../src/config/view';
import { WEAPON_ORDER, type WeaponId, type ZombieKind } from '../src/config/ids';
import * as M from '../src/render/models/index';
import type { AnimInput, CreatureRig, HunterRig, ZombieRig } from '../src/render/models/types';
import { Physics } from '../src/render/Physics';
import { decodeLook } from '../src/render/models/zombie/looks';
import { Ragdoll } from '../src/render/Ragdoll';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const str = (k: string, d: string) => q.get(k) ?? d;
const info = document.getElementById('info')!;
const mode = str('mode', 'lineup');
const frozen = q.has('t');
const T0 = num('t', 0);

const stage = new Stage(document.body);
const scene = stage.scene;
const KINDS: ZombieKind[] = ['shambler', 'jogger', 'bloater', 'medic', 'patient', 'riot', 'bigdave'];
const ZSTATES = ['walk', 'run', 'crawl', 'rise', 'stagger', 'trip', 'burn', 'grab', 'carry', 'carried', 'belch', 'enrage', 'spawn', 'down'];

// ---------------------------------------------------------------- lighting presets
function lights(kind: string) {
  const presets: Record<string, { sky: number; ground: number; hemi: number; sun: number; sunCol: number; sunPos: [number, number, number]; clear: number; deck: number; fill?: number }> = {
    day: { sky: 0xe8eefa, ground: 0x8d97a8, hemi: 1.25, sun: 2.3, sunCol: 0xfff6ea, sunPos: [-8, 14, 9], clear: 0xaebbd0, deck: 0x8a7a66 },
    dusk: { sky: 0xb0b8d8, ground: 0x403830, hemi: 0.95, sun: 2.3, sunCol: 0xffc49a, sunPos: [-20, 11, 8], clear: 0x8a7a8a, deck: 0x8a8078 },
    blue: { sky: 0x7a90c8, ground: 0x2a2a3a, hemi: 0.85, sun: 1.0, sunCol: 0xa8b8ff, sunPos: [-10, 12, 6], clear: 0x3a4a78, deck: 0x4a4a52 },
    night: { sky: 0x3a4870, ground: 0x141418, hemi: 0.45, sun: 0.5, sunCol: 0x8aa0ff, sunPos: [-6, 14, 8], clear: 0x0e1424, deck: 0x34302e, fill: 1 },
  };
  const p = presets[kind] ?? presets.dusk;
  stage.renderer.setClearColor(p.clear);
  scene.add(new THREE.HemisphereLight(p.sky, p.ground, p.hemi));
  const sun = new THREE.DirectionalLight(p.sunCol, p.sun);
  sun.position.set(...p.sunPos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  const sc = sun.shadow.camera;
  sc.left = -30;
  sc.right = 30;
  sc.top = 20;
  sc.bottom = -20;
  sc.near = 1;
  sc.far = 80;
  scene.add(sun, sun.target);
  if (p.fill) {
    const lamp = new THREE.PointLight(0xffc070, 30, 14, 1.6);
    lamp.position.set(0, 4, 2);
    scene.add(lamp);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: p.deck, roughness: 0.85 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // plank lines for scale
  const lines = new THREE.Group();
  const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.deck).multiplyScalar(0.7) });
  for (let x = -40; x <= 40; x += 0.25) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 30), lm);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.001, 0);
    lines.add(m);
  }
  scene.add(lines);
}
// env=1: use the real Environment (agent B's pier, sky, lights) for game-scale readability checks
const useEnv = q.get('env') === '1';
let envUpdate: ((dt: number, t: number) => void) | null = null;
if (!useEnv) lights(str('light', mode === 'lineup' ? 'dusk' : 'day'));

// ---------------------------------------------------------------- cameras
const closeCam = new THREE.PerspectiveCamera(CAMERA_FOV, DESIGN_W / DESIGN_H, 0.1, 400);
function aimClose(target: THREE.Vector3, dist: number, pitchDeg = CAMERA_PITCH_DEG, yawDeg = 0) {
  const p = (pitchDeg * Math.PI) / 180;
  const y = (yawDeg * Math.PI) / 180;
  closeCam.position.set(target.x + Math.sin(y) * Math.cos(p) * dist, target.y + Math.sin(p) * dist, target.z + Math.cos(y) * Math.cos(p) * dist);
  closeCam.lookAt(target);
  closeCam.updateMatrixWorld();
  stage.renderFn = () => stage.renderer.render(scene, closeCam);
}
function zoomGame(k: number, cx = 0, cz: number = CAMERA_TARGET.z) {
  if (k === 1 && cx === 0) return;
  // keep the game pitch; move toward the target
  const t = new THREE.Vector3(cx, 0, cz);
  const d = new THREE.Vector3(CAMERA_POS.x - CAMERA_TARGET.x, CAMERA_POS.y - CAMERA_TARGET.y, CAMERA_POS.z - CAMERA_TARGET.z);
  closeCam.fov = CAMERA_FOV;
  closeCam.position.copy(t).addScaledVector(d, 1 / k);
  closeCam.lookAt(t);
  closeCam.updateMatrixWorld();
  stage.renderFn = () => stage.renderer.render(scene, closeCam);
}

// ---------------------------------------------------------------- labels
const labels: Array<{ el: HTMLDivElement; p: THREE.Vector3 }> = [];
function label(text: string, p: THREE.Vector3) {
  const el = document.createElement('div');
  el.className = 'lbl';
  el.textContent = text;
  stage.view.appendChild(el);
  labels.push({ el, p: p.clone() });
}
function placeLabels() {
  const cam = stage.renderFn ? closeCam : stage.camera;
  for (const l of labels) {
    const v = l.p.clone().project(cam);
    l.el.style.left = `${(v.x * 0.5 + 0.5) * stage.viewW}px`;
    l.el.style.top = `${(-v.y * 0.5 + 0.5) * stage.viewH}px`;
  }
}

// ---------------------------------------------------------------- actors
interface Actor {
  rig: CreatureRig;
  holder: THREE.Object3D;
  /** Per-frame input (time = global). */
  input: (time: number, dt: number) => AnimInput;
  walkSpeed: number;
  distance: number;
}
const actors: Actor[] = [];
function inp(state: string, stateTime: number, time: number, distance: number, speed: number, dt: number, params: Record<string, number | boolean> = {}): AnimInput {
  return { state, stateTime, time, distance, speed, dt, params };
}
function addZombie(kind: ZombieKind, look: number, x: number, z: number, state: string | ((t: number) => [string, number]), speed: number, params: Record<string, number | boolean> = {}): ZombieRig {
  const rig = M.createZombieRig(kind, look);
  rig.root.position.set(x, 0, z);
  scene.add(rig.root);
  if (q.has('charred')) rig.setCharred(num('charred', 1));
  if (q.has('plates')) rig.setPlates?.(num('plates', 7));
  if (q.has('medal')) (rig as M.ZombieRigExt).setMedal?.(true);
  const a: Actor = {
    rig,
    holder: rig.root,
    walkSpeed: speed,
    distance: 0,
    input(time, dt) {
      a.distance += a.walkSpeed * dt;
      const [s, st] = typeof state === 'string' ? [state, time] : state(time);
      return inp(s, st, time, a.distance, a.walkSpeed, dt, params);
    },
  };
  actors.push(a);
  return rig;
}

const SPEED: Record<ZombieKind, number> = { shambler: 1.1, jogger: 5, bloater: 0.62, medic: 1.3, patient: 0, riot: 0.8, bigdave: 0.45 };
let hunter: HunterRig | null = null;
export const getHunter = () => hunter;
let extraUpdate: ((time: number, dt: number) => void) | null = null;
let physics: Physics | null = null;
const ragdolls: Ragdoll[] = [];

function hunterAt(x: number, z: number, weapon: WeaponId, prog: (t: number) => { state: string; stateTime: number; fireT: number; reloadT: number; spin?: number; heat?: number; cock?: number; loaded?: boolean; hurt?: number; speed?: number }): HunterRig | null {
  let h: HunterRig;
  try {
    h = M.createHunterRig();
  } catch {
    return null;
  }
  h.root.position.set(x, 0, z);
  scene.add(h.root);
  const wi = WEAPON_ORDER.indexOf(weapon);
  try {
    h.setWeapon(M.createWeaponModel(weapon));
  } catch {
    /* not yet */
  }
  const a: Actor = {
    rig: h,
    holder: h.root,
    walkSpeed: 0,
    distance: 0,
    input(time, dt) {
      const p = prog(time);
      a.distance += (p.speed ?? 0) * dt;
      return inp(p.state, p.stateTime, time, a.distance, p.speed ?? 0, dt, {
        weapon: wi,
        fireT: p.fireT,
        reloadT: p.reloadT,
        spin: p.spin ?? 0,
        heat: p.heat ?? 0,
        cock: p.cock ?? 0,
        loaded: p.loaded ?? true,
        hurt: p.hurt ?? 0,
      });
    },
  };
  actors.push(a);
  return h;
}

// ---------------------------------------------------------------- modes
const looksN = num('n', 6);
const lookBase = num('look', 1);
if (mode === 'lineup') {
  // rows of kinds across the deck, walking right; joggers run
  const rows: Array<[ZombieKind, number]> = [
    ['shambler', 8],
    ['jogger', 4],
    ['bloater', 3],
    ['medic', 2],
    ['riot', 2],
    ['bigdave', 1],
  ];
  let zi = 0;
  for (const [kind, n] of rows) {
    const z = -4.2 + zi * 1.6;
    for (let i = 0; i < n; i++) {
      const x = -20 + i * (kind === 'bigdave' ? 4 : 2.4) + (zi % 2) * 1.2;
      addZombie(kind, lookBase + i * 7919 + zi * 31, x, z, kind === 'jogger' ? 'run' : 'walk', SPEED[kind]);
    }
    zi++;
  }
  // a paramedic team
  {
    const z = 4.4;
    const cx = -3;
    let s: THREE.Group | null = null;
    try {
      s = M.createStretcher();
    } catch {
      s = null;
    }
    if (s) {
      s.position.set(cx, 0.73, z);
      scene.add(s);
    }
    addZombie('medic', 11, cx + 1.15, z, 'carry', 1.3, { front: true });
    addZombie('medic', 12, cx - 1.15, z, 'carry', 1.3, { front: false });
    const p = addZombie('patient', 5, cx, z, 'carried', 0);
    p.root.position.y = 0.85;
  }
  hunter = hunterAt(10, 0, (str('weapon', 'shotgun') as WeaponId), (t) => ({ state: 'stand', stateTime: t, fireT: (t % 1.2), reloadT: -1, cock: Math.max(0, Math.min(1, ((t % 1.2) - 0.25) / 0.4)) }));
  // props on the deck
  const pal = M.createCratePallet();
  pal.position.set(-6, 0, -1.5);
  scene.add(pal);
  for (let i = 0; i < 3; i++) {
    const c = M.createCrate(i + 2);
    c.position.set(4 + i * 0.7, M.CRATE_MODEL.halfY, 3.2 + (i % 2) * 0.3);
    c.rotation.y = i * 0.7;
    scene.add(c);
  }
  const fl = M.createFlareCartridge();
  fl.position.set(2, 0, 1);
  scene.add(fl);
  zoomGame(num('zoom', 1), num('cx', 0), num('cz', CAMERA_TARGET.z));
} else if (mode === 'close') {
  const kinds = str('kind', 'shambler') === 'all' ? KINDS : [str('kind', 'shambler') as ZombieKind];
  const state = str('state', 'walk');
  // outfit=<name>[:pal],... picks the first seeds that decode to those outfits
  const wanted = q.has('outfit') ? str('outfit', '').split(',') : null;
  const seedFor = (kind: ZombieKind, w: string, skip: number) => {
    const [o, pal] = w.split(':');
    let found = 0;
    for (let s = 1; s < 200000; s++) {
      const L = decodeLook(kind, s);
      if (L.outfit === o && (pal === undefined || L.pal === Number(pal))) {
        if (found++ >= skip) return s;
      }
    }
    return 1;
  };
  let i = 0;
  for (const kind of kinds) {
    const n = wanted ? wanted.length : kinds.length > 1 ? 1 : looksN;
    for (let k = 0; k < n; k++) {
      const look = wanted ? seedFor(kind, wanted[k], num('skip', 0)) : q.has('looks') ? Number(str('looks', '1').split(',')[k] ?? k) : lookBase + k * 7919;
      const total = kinds.length > 1 ? kinds.length : n;
      const x = (i - total / 2 + 0.5) * num('spacing', 1.4);
      const r = addZombie(kind, look, x, 0, state, state === 'walk' || state === 'run' ? SPEED[kind] : 0, { front: true });
      label(`${kind} ${(r as ZombieRig & { lookInfo?: { outfit: string; pal: number } }).lookInfo?.outfit ?? ''}:${(r as ZombieRig & { lookInfo?: { pal: number } }).lookInfo?.pal ?? ''}`, new THREE.Vector3(x, -0.25, 0.6));
      i++;
    }
  }
  const span = Math.max(4, i * 1.4);
  aimClose(new THREE.Vector3(0, 0.9, 0), num('dist', span * 2.6 + 3), num('pitch', 14), num('yaw', 0));
} else if (mode === 'states') {
  const kind = str('kind', 'shambler') as ZombieKind;
  const states = q.has('states') ? str('states', '').split(',') : ZSTATES;
  const cols = num('cols', 5);
  const dur: Record<string, number> = { rise: 1.6, trip: 0.9, belch: 1.0, enrage: 1.2, stagger: 1.5, spawn: 0.4 };
  states.forEach((s, r) => {
    for (let c = 0; c < cols; c++) {
      const D = dur[s] ?? 1.2;
      const st = (c / (cols - 1)) * D;
      const x = (c - (cols - 1) / 2) * 1.9;
      const z = (r - (states.length - 1) / 2) * 1.5;
      const look = lookBase;
      const moving = s === 'walk' || s === 'run' || s === 'crawl' || s === 'burn' || s === 'carry' || s === 'spawn';
      const spd = s === 'run' ? 5 : s === 'crawl' ? 0.65 : s === 'burn' ? 1.5 : moving ? SPEED[kind] || 1 : 0;
      const rig = addZombie(kind, look, x, z, () => [s, frozen ? st : st], spd, { front: c % 2 === 0, enraged: s === 'enrage' ? false : false, twitch: true });
      // spread the gait phase across the columns
      const a = actors[actors.length - 1];
      a.distance = st * spd + c * 0.21;
      void rig;
      if (c === 0) label(s, new THREE.Vector3(x - 1.3, 0, z));
    }
  });
  aimClose(new THREE.Vector3(0, 0.4, 0), num('dist', 7 + states.length * 2.6), num('pitch', 40), num('yaw', 0));
} else if (mode === 'team') {
  // the paramedic team: stretcher between two medics, patient on top (logic: medics ±1.15, patient y 0.85)
  const z = 0;
  const cx = 0;
  const st = q.get('state') ?? 'carry';
  const s = M.createStretcher();
  const carried = st === 'carry';
  s.position.set(cx, carried ? M.STRETCHER_MODEL.carryY : 0, z);
  scene.add(s);
  addZombie('medic', num('l1', 11), cx + 1.15, z, carried ? 'carry' : 'walk', carried ? 1.3 : 0, { front: true });
  addZombie('medic', num('l2', 12), cx - 1.15, z, carried ? 'carry' : 'walk', carried ? 1.3 : 0, { front: false });
  const p = addZombie('patient', num('l3', 5), cx, z, 'carried', 0);
  p.root.position.y = carried ? 0.85 : 0.12;
  aimClose(new THREE.Vector3(0, 0.8, 0), num('dist', 7), num('pitch', 22), num('yaw', 0));
} else if (mode === 'hunter') {
  // rows: idle / fire / reload; columns: the six weapons
  const rows = q.has('state') ? [str('state', 'stand')] : ['idle', 'fire', 'reload'];
  const rt = num('rt', 0.5);
  WEAPON_ORDER.forEach((w, c) => {
    rows.forEach((row, r) => {
      const x = (c - 2.5) * num('spacing', 2.1);
      const z = (r - (rows.length - 1) / 2) * 2.4;
      hunterAt(x, z, w, (t) => {
        if (row === 'fire') return { state: 'stand', stateTime: t, fireT: num('fireT', 0.03), reloadT: -1, spin: w === 'outboard' ? 1 : 0, heat: w === 'outboard' ? 0.8 : 0, cock: 0 };
        if (row === 'reload') return { state: 'stand', stateTime: t, fireT: 9, reloadT: rt, loaded: false };
        if (row === 'idle') return { state: 'stand', stateTime: t, fireT: 9, reloadT: -1 };
        return { state: row, stateTime: num('st', 0.2), fireT: 9, reloadT: -1, speed: row === 'walk' ? 2 : 0, hurt: num('hurt', 0) };
      });
      if (c === 0) label(row, new THREE.Vector3(x - 1.2, 0, z));
      if (r === rows.length - 1) label(w, new THREE.Vector3(x, 0, z + 0.9));
    });
  });
  aimClose(new THREE.Vector3(0, 0.8, 0), num('dist', 19), num('pitch', 20), num('yaw', 0));
} else if (mode === 'hstates') {
  const w = str('weapon', 'shotgun') as WeaponId;
  const states = q.has('states') ? str('states', '').split(',') : ['stand', 'walk', 'air', 'stomp', 'kick', 'grabbed', 'hurt', 'dead'];
  const cols = num('cols', 5);
  const dur: Record<string, number> = { stomp: 0.4, kick: 0.32, dead: 1.0, air: 0.4, grabbed: 1.0, hurt: 0.5, walk: 1.0, stand: 1.0 };
  states.forEach((s, r) => {
    for (let c = 0; c < cols; c++) {
      const st = (c / (cols - 1)) * (dur[s] ?? 1);
      const x = (c - (cols - 1) / 2) * 1.6;
      const z = (r - (states.length - 1) / 2) * 1.5;
      hunterAt(x, z, w, () => ({ state: s === 'hurt' ? 'stand' : s, stateTime: st, fireT: 9, reloadT: -1, speed: s === 'walk' ? 2 : 0, hurt: s === 'hurt' ? Math.sin((st / 0.5) * Math.PI) : 0 }));
      const a = actors[actors.length - 1];
      a.distance = st * 2;
      if (c === 0) label(s, new THREE.Vector3(x - 1.1, 0, z));
    }
  });
  aimClose(new THREE.Vector3(0, 0.6, 0), num('dist', 8 + states.length * 2.4), num('pitch', 40), num('yaw', 0));
} else if (mode === 'reload') {
  // one weapon's reload as a strip of snapshots
  const w = str('weapon', 'revolver') as WeaponId;
  const cols = num('cols', 8);
  for (let c = 0; c < cols; c++) {
    const rt = c / (cols - 1);
    const x = (c - (cols - 1) / 2) * 1.25;
    hunterAt(x, 0, w, () => ({ state: 'stand', stateTime: 1, fireT: 9, reloadT: rt >= 1 ? 0.999 : rt, loaded: false, spin: 0 }));
    label(rt.toFixed(2), new THREE.Vector3(x, 0, 0.8));
  }
  aimClose(new THREE.Vector3(0, 0.95, 0), num('dist', 11), num('pitch', 14), num('yaw', 0));
} else if (mode === 'weapons') {
  WEAPON_ORDER.forEach((w, i) => {
    const m = M.createWeaponModel(w);
    m.group.position.set((i % 3 - 1) * 1.5, 1.0 + Math.floor(i / 3) * -0.55, 0);
    if (w === 'outboard') m.group.position.x += 0.6;
    scene.add(m.group);
    m.animate({ fireT: 9, reloadT: num('rt', -1), spin: 0, heat: num('heat', 0), cock: 0, loaded: true, dt: 0.016 });
    label(w, new THREE.Vector3(m.group.position.x - 0.3, m.group.position.y - 0.25, 0.2));
  });
  aimClose(new THREE.Vector3(0, 0.75, 0), num('dist', 5.2), num('pitch', 8), num('yaw', 0));
} else if (mode === 'props') {
  const items: Array<[string, THREE.Object3D, number, number]> = [
    ['stretcher', M.createStretcher(), -2.4, 0],
    ['pallet', M.createCratePallet(), 1.4, -0.5],
    ['crate', M.createCrate(3), -0.6, 1.5],
    ['bolt', M.createHarpoonBolt(), -2.0, 1.6],
    ['nail', M.createNail(), 0.6, 1.7],
    ['flare', M.createFlareCartridge(), 1.6, 1.7],
  ];
  for (const [n, o, x, z] of items) {
    o.position.set(x, n === 'crate' ? M.CRATE_MODEL.halfY : n === 'bolt' || n === 'nail' ? 0.1 : 0, z);
    if (n === 'nail') o.scale.setScalar(3);
    scene.add(o);
    label(n, new THREE.Vector3(x, 0, z + 0.5));
  }
  aimClose(new THREE.Vector3(0, 0.4, 0.5), num('dist', 9), num('pitch', 36), num('yaw', 0));
} else if (mode === 'ragdoll') {
  physics = new Physics();
  /** Detach a piece (prop / plate / apron) and drop it as a one-body ragdoll. */
  const dropPiece = (obj: THREE.Object3D, spec: import('../src/render/models/types').BoneSpec) => {
    obj.updateMatrixWorld(true);
    const holder = new THREE.Group();
    obj.matrixWorld.decompose(holder.position, holder.quaternion, holder.scale);
    scene.add(holder);
    obj.removeFromParent();
    obj.position.set(0, 0, 0);
    obj.quaternion.identity();
    obj.scale.set(1, 1, 1);
    holder.add(obj);
    const fake: CreatureRig = { root: new THREE.Group(), bones: new Map([['piece', holder]]), spec: { piece: spec }, head: 'piece', animate: () => {} };
    const r = new Ragdoll(physics!, fake, { velocity: new THREE.Vector3(-1.5, 2, (Math.random() - 0.5) * 2), groundOnly: true });
    r.parts[0].body.angularVelocity.set(3, 2, 5);
    ragdolls.push(r);
  };
  // props + armour + apron pieces
  {
    const pieces: Array<[ZombieKind, string]> = [['shambler', 'waiter'], ['shambler', 'granny'], ['shambler', 'fisherman:0'], ['riot', 'riot'], ['bigdave', 'chef']];
    pieces.forEach(([kind, o], i) => {
      let seed = 1;
      for (let s2 = 1; s2 < 5000; s2++) {
        const L = decodeLook(kind, s2);
        const [oo, pp] = o.split(':');
        if (L.outfit === oo && (pp === undefined || L.pal === Number(pp))) {
          seed = s2;
          break;
        }
      }
      const rig = M.createZombieRig(kind, seed);
      const x = (i - 2) * 3;
      rig.root.position.set(x, 0, 4);
      scene.add(rig.root);
      rig.animate(inp('walk', 0.5, 0.5, 0.3, 1, 0.016));
      rig.root.updateMatrixWorld(true);
      if (rig.prop && rig.propSpec) dropPiece(rig.prop, rig.propSpec);
      if (rig.plates && rig.plateSpec) for (const [f, obj] of Object.entries(rig.plates)) dropPiece(obj, rig.plateSpec[Number(f)]);
      if (rig.apron && rig.apronSpec) dropPiece(rig.apron, rig.apronSpec);
      const r = new Ragdoll(physics!, rig, { velocity: new THREE.Vector3(1, 0, 0), impulse: { point: new THREE.Vector3(x, 1.2, 4), dir: new THREE.Vector3(-1, 0.3, 0), speed: 3 } });
      ragdolls.push(r);
      label(`${kind} ${o} + pieces`, new THREE.Vector3(x, 0, 5));
    });
  }
  const kinds = KINDS;
  kinds.forEach((kind, i) => {
    for (let k = 0; k < 2; k++) {
      const x = (i - (kinds.length - 1) / 2) * 2.6;
      const z = k * 2.4 - 1.2;
      const rig = M.createZombieRig(kind, lookBase + i * 13 + k * 101);
      rig.root.position.set(x, 0, z);
      scene.add(rig.root);
      rig.animate(inp(k === 0 ? 'walk' : kind === 'jogger' ? 'run' : 'walk', 0.5, 0.5, 0.3, SPEED[kind], 0.016));
      rig.root.updateMatrixWorld(true);
      const dir = new THREE.Vector3(-1, 0.3, (Math.random() - 0.5) * 0.4).normalize();
      const r = new Ragdoll(physics!, rig, {
        velocity: new THREE.Vector3(SPEED[kind], 0, 0),
        impulse: { point: new THREE.Vector3(x + 0.1, k === 0 ? 1.55 : 1.1, z), dir, speed: k === 0 ? 3 : 5, bone: k === 0 ? rig.head : undefined },
        detach: k === 1 && (kind === 'shambler' || kind === 'riot') ? new Set([rig.head]) : undefined,
      });
      ragdolls.push(r);
      label(`${kind}${k ? ' (hit)' : ' (head)'}`, new THREE.Vector3(x, 0, z + 1));
    }
  });
  aimClose(new THREE.Vector3(0, 0.3, 0), num('dist', 26), num('pitch', 36), num('yaw', 0));
}

// ---------------------------------------------------------------- loop
let time = 0;
async function loadEnv(): Promise<void> {
  if (!useEnv) return;
  const mod = await import('../src/render/env/Environment');
  const env = new mod.Environment(stage, { quality: 'medium' } as never);
  env.setTimeOfDay(num('tod', 0.1), true);
  envUpdate = (dt, t) => env.update(dt, t);
  env.update(0.016, 0);
}
function update(dt: number) {
  time += dt;
  for (const a of actors) a.rig.animate(a.input(time, dt));
  extraUpdate?.(time, dt);
  envUpdate?.(dt, time);
  if (physics) {
    physics.update(dt);
    for (const r of ragdolls) r.sync(dt);
  }
}
function render() {
  stage.frame(0, true);
  placeLabels();
  let tris = 0;
  let calls = 0;
  if (q.has('stats')) {
    calls = stage.renderer.info.render.calls;
    tris = stage.renderer.info.render.triangles;
  }
  let rag = '';
  if (ragdolls.length) {
    const frozenN = ragdolls.filter((r) => r.frozen).length;
    const maxV = Math.max(...ragdolls.map((r) => (r.frozen ? 0 : r.speed)));
    rag = `\nragdolls frozen ${frozenN}/${ragdolls.length}  max speed ${maxV.toFixed(2)}  ages ${ragdolls.map((r) => r.age.toFixed(1)).join(',')}`;
  }
  info.textContent = `mode=${mode} t=${time.toFixed(2)}  actors=${actors.length}${calls ? `  calls=${calls} tris=${tris}` : ''}${rag}`;
}

declare global {
  interface Window {
    __ready?: boolean;
    __step?: (seconds: number, frames?: number) => void;
  }
}
(window as unknown as { __bones: (name: string) => unknown }).__bones = (name: string) => {
  const a = actors.find((x) => x.rig.root.name === name);
  const out: Record<string, number> = {};
  a?.rig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    const k = `${m.parent?.name}/${m.userData.matClass}`;
    out[k] = (out[k] ?? 0) + (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return out;
};
(window as unknown as { __muzzles: () => unknown }).__muzzles = () => {
  const out: Array<Record<string, unknown>> = [];
  for (const a of actors) {
    const h = a.rig as HunterRig & { debugReach?: () => number };
    if (!h.getWeapon) continue;
    const w = h.getWeapon();
    if (!w) continue;
    const p = w.muzzle.getWorldPosition(new THREE.Vector3()).sub(h.root.position);
    out.push({ id: w.id, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), reach: +(h.debugReach?.() ?? 0).toFixed(3) });
  }
  return out;
};
(window as unknown as { __budget: () => unknown }).__budget = () => {
  // build every geometry variant once and sum unique vertices per material class
  const seen = new Set<string>();
  const geos = new Map<string, Set<THREE.BufferGeometry>>();
  const t0 = performance.now();
  let rigs = 0;
  for (const kind of KINDS) {
    for (let s = 1; s < 4000; s++) {
      const L = decodeLook(kind, s);
      if (seen.has(L.key)) continue;
      seen.add(L.key);
      const r = M.createZombieRig(kind, s);
      rigs++;
      r.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const cls = String(m.userData.matClass);
        if (!geos.has(cls)) geos.set(cls, new Set());
        geos.get(cls)!.add(m.geometry);
      });
    }
  }
  const out: Record<string, number> = {};
  for (const [cls, set] of geos) {
    let v = 0;
    for (const g of set) v += g.attributes.position.count;
    out[cls] = v;
  }
  return { variants: seen.size, rigs, ms: Math.round(performance.now() - t0), verticesPerClass: out };
};
(window as unknown as { __stats: () => unknown }).__stats = () => {
  const per: Record<string, { meshes: number; tris: number; n: number }> = {};
  for (const a of actors) {
    const k = a.rig.root.name;
    const e = (per[k] ??= { meshes: 0, tris: 0, n: 0 });
    e.n++;
    a.rig.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      e.meshes++;
      const g = m.geometry;
      e.tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    });
  }
  for (const k of Object.keys(per)) {
    per[k].meshes = Math.round(per[k].meshes / per[k].n);
    per[k].tris = Math.round(per[k].tris / per[k].n);
  }
  return per;
};
window.__step = (seconds: number, frames = 1) => {
  const n = Math.max(1, frames);
  for (let i = 0; i < n; i++) update(seconds / n);
  render();
};
await loadEnv().catch((e) => console.error('env failed', e));
if (frozen) {
  // simulate deterministically from 0 to T0 at 60 fps (cheap: no rendering)
  const steps = Math.round(T0 * 60);
  for (let i = 0; i < steps; i++) update(1 / 60);
  if (!steps) update(0);
  render();
} else {
  let last = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
  };
  requestAnimationFrame(loop);
}
window.__ready = true;
export {};
