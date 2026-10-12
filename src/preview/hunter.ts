// Hunter + weapons preview.
//
// Modes (query params):
//   (default)            gameplay camera: the hunter walks and cycles weapons every 2 s while firing / reloading
//     grid=1             also a lineup of all 11 weapons (back row) and all states (front row)
//     zoom=<k>           zoom the gameplay camera in on the hunter
//   close=1&weapon=<id>  close-up of the hunter holding one weapon (weapon=all or omitted: grid of all 11)
//   states=1             grid of close-ups: every state + reload / throw snapshots (weapon=<id> to choose)
//   weapons=1            all 11 weapon models laid out large (side=1: pure side view; env=1: env-map lighting)
//   icons=1              generated HUD icons in a 10-slot row like the original HUD
// Common: t=<sec> freezes time, view=game|side|front|top|back (close-ups),
//         fireT=, reload=, throw=, cock=, heat=, state= override the animation inputs.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Stage, CAMERA_TARGET } from '../render/Stage';
import { createHunterRig, holdMuzzleOffset, type HunterRig } from '../render/models/hunter';
import { createWeaponModel, createGrenadeModel, createLauncherRoundModel, createShellModel, createClipModel, type WeaponModel } from '../render/models/weapons';
import { renderWeaponIcons } from '../render/models/weaponIcons';
import { MATERIALS } from '../render/models/kit';
import { HUD_WEAPONS, WEAPONS, WEAPON_ORDER, type WeaponId } from '../config/weapons';
import { PLAYER } from '../config/constants';
import type { AnimInput } from '../render/models/types';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const info = document.getElementById('info')!;
const frozen = q.has('t');
const T0 = num('t', 0);

function addLights(scene: THREE.Scene, shadowExtent = 24) {
  scene.add(new THREE.HemisphereLight(0xe8eefa, 0x8d97a8, 1.25));
  const sun = new THREE.DirectionalLight(0xfff6ea, 2.3);
  sun.position.set(-8, 14, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  const sc = sun.shadow.camera;
  sc.left = -shadowExtent;
  sc.right = shadowExtent;
  sc.top = shadowExtent * 0.7;
  sc.bottom = -shadowExtent * 0.7;
  sc.near = 1;
  sc.far = 80;
  scene.add(sun);
  scene.add(sun.target);
  if (q.get('env') === '1') {
    const pm = new THREE.PMREMGenerator(renderer());
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.6;
  }
}
function addGround(scene: THREE.Scene) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.85 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

let _renderer: THREE.WebGLRenderer | null = null;
function renderer(): THREE.WebGLRenderer {
  if (_renderer) return _renderer;
  const r = new THREE.WebGLRenderer({ antialias: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.setPixelRatio(1);
  r.setSize(window.innerWidth, window.innerHeight);
  r.setClearColor(0xaebbd0);
  document.body.appendChild(r.domElement);
  _renderer = r;
  return r;
}

// ---------------------------------------------------------------- animation programs
interface Inputs {
  state: string;
  stateTime: number;
  distance: number;
  speed: number;
  fireT: number;
  reloadT: number;
  throwT: number;
  cock: number;
  heat: number;
}

/** Fake fire/reload inputs for weapon `id` at local time `lt` within a 2 s slot. */
function weaponProgram(id: WeaponId, lt: number, out: Inputs): Inputs {
  const fi = WEAPONS[id].fireTicks / 50;
  out.fireT = 99;
  out.reloadT = -1;
  out.throwT = -1;
  out.cock = 0;
  out.heat = 0;
  if (id === 'grenades') {
    if (lt < 0.5) out.throwT = lt / 0.5;
    else if (lt < 1.5) out.reloadT = lt - 0.5;
    return out;
  }
  if (id === 'vintage') {
    if (lt < 0.7) out.cock = lt / 0.7;
    else if (lt < 1.2) out.fireT = lt - 0.7;
    else out.reloadT = (lt - 1.2) / 0.8;
    return out;
  }
  const fireEnd = 1.25;
  if (lt < fireEnd) {
    out.fireT = lt % Math.max(fi, 0.1);
    if (id === 'shotgun') out.cock = Math.max(0, Math.min(1, (out.fireT - 0.25) / 0.4));
    if (id === 'minigun') out.heat = Math.min(1, lt / fireEnd);
  } else {
    out.fireT = lt - Math.floor(fireEnd / Math.max(fi, 0.1)) * Math.max(fi, 0.1);
    out.reloadT = (lt - fireEnd) / (2 - fireEnd);
    if (id === 'minigun') out.heat = Math.max(0, 1 - (lt - fireEnd) * 1.5);
  }
  return out;
}

function overrides(inp: Inputs): Inputs {
  if (q.has('state')) inp.state = q.get('state')!;
  if (q.has('fireT')) inp.fireT = num('fireT', 99);
  if (q.has('reload')) inp.reloadT = num('reload', -1);
  if (q.has('throw')) inp.throwT = num('throw', -1);
  if (q.has('cock')) inp.cock = num('cock', 0);
  if (q.has('heat')) inp.heat = num('heat', 0);
  if (q.has('stateTime')) inp.stateTime = num('stateTime', 0);
  return inp;
}

function drive(rig: HunterRig, id: WeaponId | null, inp: Inputs, time: number, dt: number) {
  const a: AnimInput = {
    state: inp.state,
    stateTime: inp.stateTime,
    time,
    distance: inp.distance,
    speed: inp.speed,
    dt,
    params: {
      weapon: id ? WEAPON_ORDER.indexOf(id) : -1,
      fireT: inp.fireT,
      reloadT: inp.reloadT,
      heat: inp.heat,
      cock: inp.cock,
      throwT: inp.throwT,
    },
  };
  rig.animate(a);
}

const blankInputs = (): Inputs => ({ state: 'stand', stateTime: 1, distance: 0, speed: 0, fireT: 99, reloadT: -1, throwT: -1, cock: 0, heat: 0 });

// ---------------------------------------------------------------- muzzle report
function muzzleReport(): string {
  const rig = createHunterRig();
  const lines: string[] = ['muzzle offsets (hold pose, rel. root):'];
  for (const id of WEAPON_ORDER) {
    const m = createWeaponModel(id);
    rig.setWeapon(m);
    for (let i = 0; i < 3; i++) drive(rig, id, blankInputs(), 0, 1 / 60);
    rig.root.updateMatrixWorld(true);
    const p = m.muzzles[0].getWorldPosition(new THREE.Vector3());
    const h = holdMuzzleOffset(id, m);
    const reach = (rig as unknown as { debugReach: () => number }).debugReach();
    let s = `${id.padEnd(9)} x=${p.x.toFixed(3)} y=${p.y.toFixed(3)} z=${p.z.toFixed(3)}  table x=${h.x.toFixed(3)}  reach err=${reach.toFixed(3)}`;
    if (m.muzzles[1]) {
      const p2 = m.muzzles[1].getWorldPosition(new THREE.Vector3());
      s += `  | 2nd x=${p2.x.toFixed(3)} y=${p2.y.toFixed(3)} z=${p2.z.toFixed(3)}`;
    }
    lines.push(s);
  }
  console.log(lines.join('\n'));
  return lines.join('\n');
}

// ---------------------------------------------------------------- multi-viewport helper
interface Cell {
  target: THREE.Vector3;
  label: string;
  cam: THREE.Camera;
}
function layoutCells(n: number, cols: number) {
  const rows = Math.ceil(n / cols);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const cw = Math.floor(W / cols);
  const ch = Math.floor(H / rows);
  return { rows, cw, ch };
}
function viewDir(view: string): THREE.Vector3 {
  switch (view) {
    case 'side':
      return new THREE.Vector3(0, 0.05, 1);
    case 'front':
      return new THREE.Vector3(-1, 0.15, 0.05);
    case 'back':
      return new THREE.Vector3(1, 0.2, 0.3);
    case 'top':
      return new THREE.Vector3(0, 1, 0.02);
    case 'q3':
      return new THREE.Vector3(-0.6, 0.35, 1);
    case 'game':
    default:
      return new THREE.Vector3(0, Math.sin((32 * Math.PI) / 180), Math.cos((32 * Math.PI) / 180));
  }
}

function runCells(scene: THREE.Scene, cells: Cell[], cols: number, update: (time: number, dt: number) => void) {
  const r = renderer();
  const { cw, ch } = layoutCells(cells.length, cols);
  cells.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'lbl';
    d.textContent = c.label;
    d.style.left = `${(i % cols) * cw + 6}px`;
    d.style.top = `${Math.floor(i / cols) * ch + 4}px`;
    document.body.appendChild(d);
  });
  const render = () => {
    r.setScissorTest(true);
    cells.forEach((c, i) => {
      const x = (i % cols) * cw;
      const y = window.innerHeight - (Math.floor(i / cols) + 1) * ch;
      r.setViewport(x, y, cw, ch);
      r.setScissor(x, y, cw, ch);
      r.render(scene, c.cam);
    });
    r.setScissorTest(false);
  };
  let time = T0;
  if (frozen) {
    const dt = 1 / 60;
    for (let t = Math.max(0, T0 - 1); t <= T0; t += dt) update(t, dt);
    render();
    return;
  }
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    update(time, dt);
    render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function closeCam(target: THREE.Vector3, view: string, aspect: number, dist = 4.2): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(num('fov', 22), aspect, 0.1, 100);
  const d = viewDir(view).normalize();
  cam.position.copy(target).addScaledVector(d, dist);
  cam.lookAt(target);
  return cam;
}

// ================================================================ MODES
function modeGame() {
  const stage = new Stage(document.body);
  const scene = stage.scene;
  stage.renderer.setClearColor(0xaebbd0);
  addLights(scene, 26);
  addGround(scene);
  const grid = q.get('grid') === '1';
  const zoom = num('zoom', 1);
  if (zoom !== 1) {
    stage.camera.zoom = zoom;
    stage.camera.updateProjectionMatrix();
  }

  const main = createHunterRig();
  scene.add(main.root);
  const mainZ = grid ? 0 : 0;
  const extras: Array<{ rig: HunterRig; id: WeaponId; state: string; x: number; z: number; reload?: number; throwT?: number }> = [];
  if (grid) {
    WEAPON_ORDER.forEach((id, i) => extras.push({ rig: createHunterRig(), id, state: 'stand', x: -17 + i * 3.4, z: -9 }));
    const st = ['stand', 'walk', 'jump', 'fall', 'sit', 'getup', 'kick', 'air'];
    st.forEach((s, i) => extras.push({ rig: createHunterRig(), id: 'pistol', state: s, x: -14 + i * 4, z: 6 }));
    extras.push({ rig: createHunterRig(), id: 'm4', state: 'stand', x: 14, z: 6, reload: 0.45 });
    extras.push({ rig: createHunterRig(), id: 'grenades', state: 'stand', x: 17, z: 6, throwT: 0.4 });
    for (const e of extras) scene.add(e.rig.root);
  }

  let distance = 0;
  let time = T0;
  const step = (dt: number) => {
    time += dt;
    const slot = Math.floor(time / 2) % WEAPON_ORDER.length;
    const id = WEAPON_ORDER[slot];
    const inp = weaponProgram(id, time % 2, blankInputs());
    const speed = q.get('walk') === '0' ? 0 : 1.6;
    const period = 10;
    const ph = (time % period) / period;
    const x = -4 + 8 * (ph < 0.5 ? ph * 2 : 2 - ph * 2);
    distance += speed * dt;
    inp.state = speed > 0 ? 'walk' : 'stand';
    inp.distance = distance;
    inp.speed = speed;
    overrides(inp);
    main.root.position.set(x, 0, mainZ);
    drive(main, id, inp, time, dt);
    for (const e of extras) {
      e.rig.root.position.set(e.x, 0, e.z);
      const ei = e.state === 'stand' && e.reload === undefined && e.throwT === undefined ? weaponProgram(e.id, (time + e.x) % 2, blankInputs()) : blankInputs();
      ei.state = e.state;
      ei.stateTime = e.state === 'getup' ? (time % 0.5) : e.state === 'kick' ? (time % 0.3) : time % 3;
      ei.distance = time * 1.6;
      ei.speed = e.state === 'walk' ? 1.6 : 0;
      if (e.reload !== undefined) ei.reloadT = e.reload;
      if (e.throwT !== undefined) ei.throwT = e.throwT;
      drive(e.rig, e.id, ei, time, dt);
    }
    info.textContent = `t=${time.toFixed(2)}  weapon=${id}  fireT=${inp.fireT.toFixed(2)} reloadT=${inp.reloadT.toFixed(2)} throwT=${inp.throwT.toFixed(2)}`;
  };
  if (frozen) {
    time = Math.max(0, T0 - 1.5);
    for (let i = 0; i < 90; i++) step(1 / 60);
    stage.frame(0);
  } else {
    stage.onUpdate((dt) => step(dt));
    stage.start();
  }
  // dev check: project the hunter height to screen px
  const top = new THREE.Vector3(0, PLAYER.height, CAMERA_TARGET.z + 7.4);
  const bot = new THREE.Vector3(0, 0, CAMERA_TARGET.z + 7.4);
  const a = stage.project(top);
  const b = stage.project(bot);
  console.log(`hunter height on screen: ${(b.y - a.y).toFixed(1)} px (view ${stage.viewW}x${stage.viewH})`);
  muzzleReport();
}

function modeClose() {
  const scene = new THREE.Scene();
  addLights(scene, 40);
  addGround(scene);
  const view = q.get('view') ?? 'q3';
  const w = q.get('weapon');
  const ids: WeaponId[] = w && w !== 'all' ? [w as WeaponId] : [...WEAPON_ORDER];
  const cols = ids.length === 1 ? 1 : 4;
  const { cw, ch } = layoutCells(ids.length, cols);
  const rigs = ids.map((id, i) => {
    const rig = createHunterRig();
    rig.root.position.set(i * 6, 0, 0);
    scene.add(rig.root);
    return { rig, id };
  });
  const cells: Cell[] = rigs.map(({ id }, i) => {
    const target = new THREE.Vector3(i * 6 - (id === 'vintage' ? 0.6 : id === 'awp' || id === 'shotgun' ? 0.3 : 0.15), 0.85, 0);
    const dist = id === 'vintage' ? 7.2 : ids.length === 1 ? 5.2 : 5.6;
    return { target, label: id, cam: closeCam(target, view, cw / ch, dist) };
  });
  runCells(scene, cells, cols, (time, dt) => {
    rigs.forEach(({ rig, id }) => {
      const inp = q.has('fire') ? weaponProgram(id, time % 2, blankInputs()) : blankInputs();
      inp.stateTime = time;
      inp.distance = time * 1.6;
      overrides(inp);
      if (inp.state === 'walk') inp.speed = 1.6;
      drive(rig, id, inp, time, dt);
    });
  });
  muzzleReport();
}

function modeStates() {
  const scene = new THREE.Scene();
  addLights(scene, 40);
  addGround(scene);
  const view = q.get('view') ?? 'q3';
  const wid = (q.get('weapon') as WeaponId) ?? 'pistol';
  const list: Array<{ label: string; inp: Partial<Inputs>; id?: WeaponId }> = [
    { label: 'stand', inp: { state: 'stand' } },
    { label: 'walk a', inp: { state: 'walk', distance: 0.26, speed: 1.6 } },
    { label: 'walk b', inp: { state: 'walk', distance: 0.79, speed: 1.6 } },
    { label: 'jump', inp: { state: 'jump', stateTime: 0.3 } },
    { label: 'fall', inp: { state: 'fall', stateTime: 0.3 } },
    { label: 'sit', inp: { state: 'sit', stateTime: 1 } },
    { label: 'getup .25', inp: { state: 'getup', stateTime: 0.15 } },
    { label: 'getup .40', inp: { state: 'getup', stateTime: 0.35 } },
    { label: 'kick .15', inp: { state: 'kick', stateTime: 0.13 } },
    { label: 'air', inp: { state: 'air', stateTime: 0.4 } },
    { label: 'fire t=.02', inp: { state: 'stand', fireT: 0.02 } },
    { label: 'reload .3', inp: { state: 'stand', reloadT: 0.3 } },
    { label: 'reload .6', inp: { state: 'stand', reloadT: 0.6 } },
    { label: 'reload .8', inp: { state: 'stand', reloadT: 0.8 } },
    { label: 'throw .25', inp: { state: 'stand', throwT: 0.25 }, id: 'grenades' },
    { label: 'throw .5', inp: { state: 'stand', throwT: 0.5 }, id: 'grenades' },
  ];
  const cols = 4;
  const { cw, ch } = layoutCells(list.length, cols);
  const rigs = list.map((e, i) => {
    const rig = createHunterRig();
    rig.root.position.set(i * 6, 0, 0);
    scene.add(rig.root);
    return rig;
  });
  const cells: Cell[] = list.map((e, i) => {
    const target = new THREE.Vector3(i * 6 - 0.1, 0.75, 0);
    return { target, label: `${e.label} (${e.id ?? wid})`, cam: closeCam(target, view, cw / ch, 5.6) };
  });
  runCells(scene, cells, cols, (time, dt) => {
    list.forEach((e, i) => {
      const inp = Object.assign(blankInputs(), e.inp);
      drive(rigs[i], e.id ?? wid, inp, time, dt);
    });
  });
}

function modeWeapons() {
  const scene = new THREE.Scene();
  addLights(scene, 60);
  const r = renderer();
  r.setClearColor(0x8a9ab2);
  const side = q.get('side') === '1';
  const cols = num('cols', 3);
  const items: Array<{ label: string; obj: THREE.Object3D; m?: WeaponModel }> = [];
  for (const id of WEAPON_ORDER) {
    const m = createWeaponModel(id);
    const g = new THREE.Group();
    g.add(m.group);
    if (m.group2) {
      m.group2.position.set(0.09, 0.07, -0.14);
      g.add(m.group2);
    }
    items.push({ label: `${id}  (${WEAPONS[id].name})`, obj: g, m });
  }
  // debris: shells, clips, grenade, launcher round
  {
    const g = new THREE.Group();
    const kinds = ['small', 'normal', 'shotgun', 'awp', 'minigun'] as const;
    kinds.forEach((k, i) => {
      const mesh = new THREE.Mesh(createShellModel(k), MATERIALS.metal);
      mesh.position.set(i * 0.06, 0.12, 0);
      mesh.rotation.y = 0.5;
      g.add(mesh);
    });
    const clips = ['small', 'mp5', 'mac', 'awp', 'belt'] as const;
    clips.forEach((k, i) => {
      const c = createClipModel(k);
      c.position.set(i * 0.07, -0.08, 0);
      g.add(c);
    });
    const gr = createGrenadeModel();
    gr.position.set(0.36, 0.1, 0);
    g.add(gr);
    const lr = createLauncherRoundModel();
    lr.position.set(0.36, -0.06, 0);
    g.add(lr);
    items.push({ label: 'shells / clips / grenade / 40mm', obj: g });
  }
  items.forEach((it, i) => {
    it.obj.position.set(0, 0, i * 10);
    scene.add(it.obj);
    it.m?.animate({ fireT: 99, reloadT: -1, heat: num('heat', 0), spin: 0, cock: num('cock', 0), dt: 0 });
  });
  const { cw, ch } = layoutCells(items.length, cols);
  const dir = side ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(-0.3, 0.32, 1).normalize();
  const cells: Cell[] = items.map((it) => {
    it.obj.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(it.obj);
    const c = bb.getCenter(new THREE.Vector3());
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
    cam.position.copy(c).addScaledVector(dir, 5);
    cam.lookAt(c);
    cam.updateMatrixWorld(true);
    // fit the bbox corners in camera space
    const inv = cam.matrixWorldInverse;
    let mx = 0;
    let my = 0;
    for (let k = 0; k < 8; k++) {
      const p = new THREE.Vector3(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z).applyMatrix4(inv);
      mx = Math.max(mx, Math.abs(p.x));
      my = Math.max(my, Math.abs(p.y));
    }
    const aspect = cw / ch;
    const half = Math.max(mx, my * aspect) * 1.08;
    cam.left = -half;
    cam.right = half;
    cam.top = half / aspect;
    cam.bottom = -half / aspect;
    cam.updateProjectionMatrix();
    return { target: c, label: it.label, cam };
  });
  runCells(scene, cells, cols, () => undefined);
}

function modeIcons() {
  const r = renderer();
  r.setSize(2, 2);
  r.domElement.style.display = 'none';
  const w = num('w', 160);
  const h = num('h', 80);
  const t0 = performance.now();
  const icons = renderWeaponIcons(r, w, h);
  const ms = performance.now() - t0;
  const hud = document.createElement('div');
  hud.id = 'hud';
  for (const id of HUD_WEAPONS) {
    const s = document.createElement('div');
    s.className = 'slot';
    const img = document.createElement('img');
    img.src = icons[id];
    const cap = document.createElement('span');
    cap.textContent = `$${WEAPONS[id].price}`;
    s.append(img, cap);
    hud.appendChild(s);
  }
  const bigRow = document.createElement('div');
  bigRow.className = 'big';
  for (const id of WEAPON_ORDER) {
    const img = document.createElement('img');
    img.src = icons[id];
    img.width = w * 2;
    img.height = h * 2;
    img.title = id;
    bigRow.appendChild(img);
  }
  hud.appendChild(bigRow);
  document.body.appendChild(hud);
  info.style.top = 'auto';
  info.style.bottom = '6px';
  info.textContent = `icons ${w}x${h} rendered in ${ms.toFixed(0)} ms`;
}

if (q.has('icons')) modeIcons();
else if (q.has('weapons')) modeWeapons();
else if (q.has('states')) modeStates();
else if (q.has('close')) modeClose();
else modeGame();
