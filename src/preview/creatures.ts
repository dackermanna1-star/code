// Creature preview: all eight rigs in a lineup cycling through their states
// under the gameplay camera, or a close-up of one.
//
// Query params:
//   close=<type>    close-up of one creature (separate camera)
//   state=<state>   hold one state (looped) instead of cycling
//   shapes=1        overlay the gameplay hit-shape ellipses
//   t=<sec>         freeze at this time (simulated deterministically from 0)
//   yaw=<deg>       rotate the creature(s) about Y
//   cam=game        close-up from the gameplay pitch (32 deg)
//   pitch=<deg>, view=<deg>  close-up camera pitch / orbit angle
//   zoom=<k>        lineup: zoom the gameplay camera in
//   speed=<m/s>, rage=<0..3>, hasCub=0|1  override params
import * as THREE from 'three';
import { Stage, CAMERA_TARGET } from '../render/Stage';
import { createCreatureRig } from '../render/models/creatures';
import type { EnemyType } from '../config/enemies';
import { ENEMIES } from '../config/enemies';
import type { AnimInput, CreatureRig } from '../render/models/types';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

const stage = new Stage(document.body);
const scene = stage.scene;
stage.renderer.setClearColor(0xaebbd0);
scene.fog = null;

// ---------------------------------------------------------------- lights + ground
const hemi = new THREE.HemisphereLight(0xe8eefa, 0x8d97a8, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff6ea, 2.3);
sun.position.set(-8, 14, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
const sc = sun.shadow.camera;
sc.left = -24;
sc.right = 24;
sc.top = 16;
sc.bottom = -16;
sc.near = 1;
sc.far = 60;
scene.add(sun);
scene.add(sun.target);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.85 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------- state programs
interface StateDef {
  state: string;
  dur: number;
  speed: number | ((t: number) => number);
  params?: Record<string, number | boolean>;
  y?: (t: number) => number;
}
const S = (state: string, dur: number, speed: StateDef['speed'], params?: StateDef['params'], y?: StateDef['y']): StateDef => ({
  state, dur, speed, params, y,
});
const dropY = (t: number) => Math.max(0, 1.0 - 0.5 * 26 * t * t);

const PROGRAM: Record<EnemyType, StateDef[]> = {
  seal: [S('walk', 4, 2.4), S('startcrawl', 0.96, 0), S('crawl', 3, 0.625)],
  fatseal: [S('walk', 4.5, 2.19), S('stopped', 3, 0)],
  cub: [S('walk', 4, 1.8), S('sniff', 2.96, 0), S('drop', 0.7, (t) => (t < 0.3 ? 0.4 : 1.6), {}, dropY)],
  activist: [
    S('run', 3.5, 5, { hasCub: true }),
    S('panic', 0.9, (t) => 5 * Math.pow(0.9, t * 50), { hasCub: false }),
    S('flee', 3, 6.25, { hasCub: false }),
  ],
  penguin: [S('walk', 4, 2.6), S('glide', 3, 7)],
  bear: [S('walk', 3.5, 3.2, { rage: 0 }), S('walk', 3, 6.5, { rage: 1 }), S('walk', 3.5, 14, { rage: 3 })],
  turtle: [S('walk', 4, 1.9), S('hide', 0.2, 0), S('hidden', 2, 0), S('emerge', 0.32, 0)],
  walrus: [S('walk', 3.5, 2.9), S('charge', 1.2, 0), S('rush', 2, 37.5), S('eat', 1.2, 0)],
};

// ---------------------------------------------------------------- hit shapes (copied from src/core/enemies.ts)
type Shape = { cx: number; cy: number; a: number; b: number; part: string };
function shapesFor(type: EnemyType, st: string, stateTime: number, distance: number, p: Record<string, number | boolean>, y: number): Shape[] {
  const ticks = stateTime * 50;
  switch (type) {
    case 'seal': {
      if (st === 'crawl')
        return [
          { cx: -0.05, cy: 0.18, a: 0.62, b: 0.18, part: 'body' },
          { cx: 0.55, cy: 0.24, a: 0.16, b: 0.14, part: 'head' },
        ];
      if (st === 'startcrawl') {
        const t = Math.min(1, ticks / 40);
        const l = (a: number, b: number) => a + (b - a) * t;
        return [
          { cx: l(-0.12, -0.05), cy: l(0.3, 0.18), a: l(0.5, 0.62), b: l(0.3, 0.18), part: 'body' },
          { cx: l(0.36, 0.55), cy: l(0.95, 0.24), a: 0.17, b: 0.16, part: 'head' },
        ];
      }
      const bob = Math.sin(distance * 4.2) * 0.04;
      return [
        { cx: -0.12, cy: 0.3, a: 0.5, b: 0.3, part: 'body' },
        { cx: 0.2, cy: 0.62 + bob, a: 0.24, b: 0.3, part: 'body' },
        { cx: 0.36, cy: 0.95 + bob, a: 0.17, b: 0.16, part: 'head' },
      ];
    }
    case 'fatseal': {
      const bob = st === 'walk' ? Math.sin(distance * 2.4) * 0.05 : 0;
      return [
        { cx: -0.25, cy: 0.72, a: 1.25, b: 0.72, part: 'body' },
        { cx: 0.55, cy: 1.05 + bob, a: 0.55, b: 0.5, part: 'body' },
        { cx: 1.02, cy: 1.22 + bob, a: 0.42, b: 0.4, part: 'head' },
      ];
    }
    case 'cub': {
      const lift = st === 'sniff' ? 0.06 * Math.max(0, Math.sin(ticks * 0.12)) : 0;
      return [
        { cx: -0.05, cy: y + 0.21, a: 0.44, b: 0.21, part: 'body' },
        { cx: 0.33, cy: y + 0.28 + lift, a: 0.15, b: 0.14, part: 'head' },
      ];
    }
    case 'activist': {
      const bob = Math.abs(Math.sin(distance * 2.6)) * 0.05;
      const s: Shape[] = [
        { cx: 0, cy: 0.45, a: 0.22, b: 0.45, part: 'leg' },
        { cx: 0.02, cy: 1.2 + bob, a: 0.26, b: 0.36, part: 'body' },
        { cx: 0.06, cy: 1.7 + bob, a: 0.14, b: 0.15, part: 'head' },
      ];
      if (p.hasCub) s.push({ cx: 0.3, cy: 1.07 + bob, a: 0.38, b: 0.16, part: 'cub' });
      return s;
    }
    case 'penguin': {
      if (st === 'glide') {
        const t = Math.min(1, ticks / 14);
        const l = (a: number, b: number) => a + (b - a) * t;
        return [
          { cx: l(0, -0.1), cy: l(0.6, 0.27), a: l(0.3, 0.66), b: l(0.6, 0.27), part: 'body' },
          { cx: l(0.08, 0.62), cy: l(1.22, 0.32), a: 0.16, b: 0.16, part: 'head' },
        ];
      }
      const sway = Math.sin(distance * 3.4) * 0.03;
      return [
        { cx: sway, cy: 0.58, a: 0.3, b: 0.58, part: 'body' },
        { cx: 0.08 + sway, cy: 1.2, a: 0.17, b: 0.17, part: 'head' },
      ];
    }
    case 'bear': {
      const running = (p.speed as number) > 7.8;
      const gait = running ? 0.12 : 0.05;
      const bob = Math.sin(distance * (running ? 1.6 : 2.2)) * gait;
      return [
        { cx: -0.25, cy: 1.32 + bob, a: 1.25, b: 0.62, part: 'body' },
        { cx: 0.85, cy: 0.5, a: 0.3, b: 0.5, part: 'leg' },
        { cx: -1.15, cy: 0.5, a: 0.32, b: 0.5, part: 'leg' },
        { cx: 0.95, cy: 1.35 + bob, a: 0.45, b: 0.45, part: 'body' },
        { cx: 1.5, cy: 1.38 + bob * 1.3, a: 0.36, b: 0.3, part: 'head' },
      ];
    }
    case 'turtle': {
      if (st === 'hidden' || st === 'hide') return [{ cx: -0.15, cy: 0.88, a: 1.5, b: 0.88, part: 'shell' }];
      const t = st === 'emerge' ? Math.min(1, ticks / 16) : 1;
      const step = Math.sin(distance * 2.0) * 0.04;
      return [
        { cx: -0.15, cy: 1.02, a: 1.5, b: 0.82, part: 'shell' },
        { cx: 0.95 + step, cy: 0.2, a: 0.3, b: 0.22, part: 'leg' },
        { cx: -1.15 - step, cy: 0.2, a: 0.3, b: 0.22, part: 'leg' },
        { cx: 1.2 + 0.35 * t, cy: 0.8, a: 0.32, b: 0.26, part: 'head' },
      ];
    }
    case 'walrus': {
      const lunge = st === 'walk' ? Math.sin(distance * 1.8) * 0.08 : 0;
      const charge = st === 'charge' ? -0.35 : 0;
      return [
        { cx: -0.3, cy: 1.05, a: 1.45, b: 1.05, part: 'body' },
        { cx: 0.6, cy: 1.75 + lunge + charge, a: 0.75, b: 0.75, part: 'body' },
        { cx: 1.05, cy: 2.3 + lunge + charge, a: 0.6, b: 0.58, part: 'head' },
      ];
    }
  }
}
const PART_COLORS: Record<string, number> = { head: 0xff2030, body: 0xffd000, leg: 0x00e0ff, cub: 0xff40ff, shell: 0x30ff60 };

// ---------------------------------------------------------------- items
interface Item {
  type: EnemyType;
  rig: CreatureRig;
  holder: THREE.Group;
  prog: StateDef[];
  total: number;
  distance: number;
  lastIdx: number;
  shapeGroup: THREE.Group;
  tris: number;
  cur: { state: string; stateTime: number; params: Record<string, number | boolean> };
}

const TYPES: EnemyType[] = ['seal', 'cub', 'activist', 'penguin', 'fatseal', 'turtle', 'bear', 'walrus'];
const close = q.get('close') as EnemyType | null;
const holdState = q.get('state');
const showShapes = q.get('shapes') === '1';
const yaw = (num('yaw', 0) * Math.PI) / 180;
const items: Item[] = [];

function countTris(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && m.visible !== false) {
      const g = m.geometry;
      n += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });
  return n;
}

function makeItem(type: EnemyType, x: number, z: number): Item {
  const rig = createCreatureRig(type);
  const holder = new THREE.Group();
  holder.position.set(x, 0, z);
  scene.add(holder);
  holder.add(rig.root);
  rig.root.rotation.y = yaw;
  let prog = PROGRAM[type];
  if (holdState) {
    const found = prog.find((s) => s.state === holdState) ?? S(holdState, 3, 0);
    const transitional = ['startcrawl', 'hide', 'emerge', 'panic', 'drop', 'charge', 'eat'].includes(holdState);
    prog = [{ ...found, dur: transitional ? found.dur + 1.2 : 1e9 }];
  }
  if (q.has('speed')) prog = prog.map((p) => ({ ...p, speed: num('speed', 0) }));
  const total = prog.reduce((s, p) => s + p.dur, 0);
  const shapeGroup = new THREE.Group();
  holder.add(shapeGroup);
  return {
    type, rig, holder, prog, total, distance: 0, lastIdx: -1, shapeGroup, tris: countTris(rig.root),
    cur: { state: '', stateTime: 0, params: {} },
  };
}

if (close) {
  items.push(makeItem(close, 0, 0));
} else {
  const xs = [-16.6, -13.4, -10.6, -7.6, -3.9, 1.0, 6.6, 13.6];
  TYPES.forEach((t, i) => items.push(makeItem(t, xs[i], CAMERA_TARGET.z + (i % 2 ? -1.2 : 1.2))));
}

// ---------------------------------------------------------------- shapes overlay
function drawShapes(it: Item, shapes: Shape[]): void {
  const g = it.shapeGroup;
  while (g.children.length) {
    const c = g.children.pop() as THREE.Mesh;
    c.geometry.dispose();
  }
  it.holder.updateMatrixWorld(true);
  for (const s of shapes) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pts.push(new THREE.Vector3(s.cx + Math.cos(a) * s.a, s.cy + Math.sin(a) * s.b, 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: PART_COLORS[s.part] ?? 0xffffff, depthTest: false, transparent: true });
    const line = new THREE.LineLoop(geo, mat);
    line.renderOrder = 999;
    g.add(line);
  }
  // spark point markers (walrus tusk tips)
  for (const name of ['tusks', 'tuskTipL', 'tuskTipR']) {
    const b = it.rig.bones.get(name);
    if (!b) continue;
    const p = b.getWorldPosition(new THREE.Vector3());
    g.worldToLocal(p);
    const geo = new THREE.SphereGeometry(name === 'tusks' ? 0.06 : 0.035, 8, 6);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff00ff, depthTest: false }));
    m.position.copy(p);
    m.renderOrder = 999;
    g.add(m as unknown as THREE.Line);
  }
}

// ---------------------------------------------------------------- simulation
function step(it: Item, time: number, dt: number): void {
  const local = it.total > 0 ? time % it.total : 0;
  let acc = 0;
  let idx = 0;
  for (; idx < it.prog.length - 1; idx++) {
    if (local < acc + it.prog[idx].dur) break;
    acc += it.prog[idx].dur;
  }
  const def = it.prog[idx];
  const stateTime = local - acc;
  const speed = typeof def.speed === 'function' ? def.speed(stateTime) : def.speed;
  it.distance += speed * dt;
  const params: Record<string, number | boolean> = { ...(def.params ?? {}) };
  if (q.has('rage')) params.rage = num('rage', 0);
  if (q.has('hasCub')) params.hasCub = q.get('hasCub') === '1';
  if (it.type === 'activist' && params.hasCub === undefined) params.hasCub = true;
  params.speed = speed;
  const y = def.y ? def.y(stateTime) : 0;
  it.rig.root.position.y = y;
  if (it.rig.cub) it.rig.cub.visible = params.hasCub !== false;
  const a: AnimInput = { state: def.state, stateTime, time, distance: it.distance, speed, dt, params };
  it.rig.animate(a);
  it.cur = { state: def.state, stateTime, params };
  if (showShapes) drawShapes(it, shapesFor(it.type, def.state, stateTime, it.distance, params, y));
}

// ---------------------------------------------------------------- cameras
let closeCam: THREE.PerspectiveCamera | null = null;
if (close) {
  const def = ENEMIES[close];
  const len = def.halfLength * 2 + 0.3;
  const h = def.height;
  const gameCam = q.get('cam') === 'game';
  const fov = gameCam ? 11 : 24;
  closeCam = new THREE.PerspectiveCamera(fov, 4 / 3, 0.1, 500);
  closeCam.layers.enable(2);
  const pitch = (num('pitch', gameCam ? 32 : 12) * Math.PI) / 180;
  const view = (num('view', 0) * Math.PI) / 180;
  const size = Math.max(len / (4 / 3), h) * 1.25;
  const dist = size / (2 * Math.tan(((fov / 2) * Math.PI) / 180));
  const target = new THREE.Vector3(0, h * 0.48, 0);
  closeCam.position.set(
    target.x + Math.sin(view) * Math.cos(pitch) * dist,
    target.y + Math.sin(pitch) * dist,
    target.z + Math.cos(view) * Math.cos(pitch) * dist,
  );
  closeCam.lookAt(target);
  sun.position.set(-4, 9, 6);
  sc.left = -6;
  sc.right = 6;
  sc.top = 6;
  sc.bottom = -6;
  sc.updateProjectionMatrix();
  stage.renderFn = () => stage.renderer.render(scene, closeCam!);
} else {
  const zoom = num('zoom', 1);
  if (zoom !== 1) {
    stage.camera.zoom = zoom;
    stage.camera.updateProjectionMatrix();
  }
  sun.target.position.copy(CAMERA_TARGET);
  sun.position.copy(CAMERA_TARGET).add(new THREE.Vector3(-8, 14, 9));
}

// ---------------------------------------------------------------- run
const info = document.getElementById('info')!;
const DT = 1 / 60;
const frozen = q.has('t') ? num('t', 0) : null;
let simTime = 0;
if (frozen !== null) {
  while (simTime < frozen - 1e-9) {
    const dt = Math.min(DT, frozen - simTime);
    simTime += dt;
    for (const it of items) step(it, simTime, dt);
  }
  for (const it of items) step(it, simTime, 0);
}
const triLog = items.map((it) => `${it.type}: ${Math.round(it.tris)} tris`).join(', ');
console.log('TRIS', triLog);

stage.onUpdate((dt) => {
  if (frozen === null) {
    simTime += dt;
    for (const it of items) step(it, simTime, dt);
  }
  info.textContent =
    items.map((it) => `${it.type.padEnd(8)} ${it.cur.state.padEnd(10)} t=${it.cur.stateTime.toFixed(2)}  ${Math.round(it.tris)} tris`).join('\n') +
    `\ntime ${simTime.toFixed(2)}`;
});
stage.start();
