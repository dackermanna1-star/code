// Game view preview: the real World drawn through GameView on the real
// Environment, for scripted scenes (headless screenshots) and live play.
//
// URL params: q=low|medium|high (env quality) · post=off|low|medium|high ·
//   tod=0..1 (time of day) · scene=<name> · live=1 (rAF loop + keyboard, bot=1 for the bot)
//   seed, chapter, money, god (default 1)
// window.lf = { world, view, stage, env, advance(seconds, {fps, render}), render(), scene(name), ... }
import { Stage, type PostQuality } from '../src/render/Stage';
import { Environment, type EnvQuality } from '../src/render/env/Environment';
import { GameView } from '../src/render/GameView';
import { World } from '../src/core/World';
import { Bot } from '../src/core/Bot';
import { TICK } from '../src/config/world';
import { WEAPON_ORDER, type WeaponId, type ZombieKind } from '../src/config/ids';
import * as THREE from 'three';
import { CAMERA_FOV, CAMERA_POS, CAMERA_TARGET, DESIGN_H, DESIGN_W } from '../src/config/view';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
if (q.has('shot')) document.body.classList.add('shot');

const stage = new Stage(document.getElementById('app')!, { post: (q.get('post') as PostQuality | null) ?? 'high' });
const env = new Environment(stage, { quality: (q.get('q') as EnvQuality | null) ?? 'high' });
const view = new GameView(stage, env);
view.setOptions({ blood: (q.get('blood') as 'low' | 'normal' | 'max' | null) ?? 'normal', shake: num('shake', 1) });
stage.renderer.info.autoReset = false;

let world!: World;
let bot: Bot | null = null;
let acc = 0;
const tod = q.has('tod') ? num('tod', 0) : null;
let todOverride: number | null = tod;

function newWorld(opts: { quiet?: boolean; chapter?: number; money?: number; seed?: number } = {}): World {
  world = new World({ seed: opts.seed ?? num('seed', 1), startChapter: opts.chapter ?? num('chapter', 1), money: opts.money ?? num('money', 50000), god: q.get('god') !== '0', quiet: opts.quiet ?? true, skipSplash: true });
  view.attach(world);
  bot = null;
  return world;
}

/** Override the world's time of day (scenes at night). */
function forceTod(t: number): void {
  todOverride = t;
  (world as unknown as { tod: number }).tod = t;
  env.setTimeOfDay(t, true);
}

/** Advance `seconds` of game time at `fps` presentation frames; renders the last frame. */
function advance(seconds: number, o: { fps?: number; render?: boolean; each?: () => void } = {}): void {
  const fps = o.fps ?? 30;
  const dt = 1 / fps;
  const n = Math.max(1, Math.round(seconds * fps));
  for (let i = 0; i < n; i++) {
    acc += dt;
    while (acc >= TICK) {
      acc -= TICK;
      view.beforeStep();
      if (bot) bot.think(world);
      o.each?.();
      world.step();
      if (todOverride !== null) (world as unknown as { tod: number }).tod = todOverride;
    }
    view.update(dt, acc / TICK);
    const last = i === n - 1;
    if (!last || o.render === false) {
      stage.frame(dt, false);
      view.blood.flush();
    } else {
      stage.renderer.info.reset();
      stage.frame(dt, true);
    }
  }
  info();
}

function render(): void {
  stage.renderer.info.reset();
  stage.frame(0, true);
  info();
}

function info(): void {
  const s = view.stats;
  const r = stage.renderer.info.render;
  document.getElementById('info')!.textContent = `t=${(world.tick * TICK).toFixed(2)} tod=${world.timeOfDay.toFixed(2)} zombies=${s.zombies} corpses=${s.corpses} ragdolls=${s.ragdolls} drops=${s.drops} calls=${r.calls} tris=${r.triangles}`;
}

// ------------------------------------------------------------------ zoomed camera (inspection)
const zoomCam = new THREE.PerspectiveCamera(CAMERA_FOV, DESIGN_W / DESIGN_H, 0.5, 600);
zoomCam.layers.enableAll();
/** k = zoom factor toward (cx, cy, cz) keeping the game pitch; k <= 1 restores the game camera. */
function zoom(k: number, cx = 0, cz: number = CAMERA_TARGET.z, cy = 0): void {
  if (k <= 1) {
    stage.renderFn = null;
    return;
  }
  const t = new THREE.Vector3(cx, cy, cz);
  const d = new THREE.Vector3(CAMERA_POS.x - CAMERA_TARGET.x, CAMERA_POS.y - CAMERA_TARGET.y, CAMERA_POS.z - CAMERA_TARGET.z);
  zoomCam.position.copy(t).addScaledVector(d, 1 / k).add(stage.shakeOffset);
  zoomCam.lookAt(t);
  zoomCam.updateMatrixWorld();
  stage.renderFn = () => stage.renderer.render(stage.scene, zoomCam);
}

// ------------------------------------------------------------------ input helpers
const P = () => world.player;
function hold(fire: boolean): void {
  P().input.fire = fire;
}
/** Press a key-like input for one tick (horn, cannon, jump). */
function press(k: 'horn' | 'cannon' | 'jump'): void {
  P().input[k] = true;
  view.beforeStep();
  world.step();
  P().input[k] = false;
}
function give(...ids: WeaponId[]): void {
  P().money = 99999;
  for (const id of ids) P().selectOrBuy(id);
}
function place(x: number, z: number): void {
  const p = P();
  p.x = x;
  p.z = z;
  p.vx = p.vz = 0;
}
function spawn(kind: ZombieKind, x: number, z: number, o: Record<string, unknown> = {}): number {
  const zb = world.spawn(kind, x, z, o as never);
  if (o.speed !== undefined) zb.speed = o.speed as number;
  return zb.id;
}

// ------------------------------------------------------------------ scenes
const scenes: Record<string, () => void> = {
  /** A row of the horde walking at the hunter, every kind. */
  lineup() {
    place(14, 0.5);
    const kinds: ZombieKind[] = ['shambler', 'jogger', 'bloater', 'riot', 'shambler', 'shambler'];
    kinds.forEach((k, i) => spawn(k, -8 + i * 2.4, -3.6 + i * 1.3, { speed: k === 'jogger' ? 0.8 : undefined }));
    world.spawnTeam(-14, 2.6);
    spawn('bigdave', -18, -1.5, { boss: true });
  },
  /** Shamblers in the hunter's lane for weapon tests. */
  lane() {
    place(12, 0);
    for (let i = 0; i < 6; i++) spawn('shambler', -2 - i * 1.6, (i % 3) * 0.25 - 0.25);
  },
  bodies() {
    place(14, 0.5);
    for (let i = 0; i < 24; i++) world.addCorpse('shambler', -6 + (i % 6) * 1.5, -3 + Math.floor(i / 6) * 1.8, { risesIn: i < 6 ? 2.5 : 30 });
  },
  fire() {
    place(12, 0.2);
    for (let i = 0; i < 12; i++) world.addCorpse('shambler', -3 + (i % 4) * 0.9, -1 + Math.floor(i / 4) * 0.9, { risesIn: 30 });
    for (let i = 0; i < 6; i++) spawn('shambler', -10 - i * 1.2, (i % 3) - 1);
    spawn('bloater', -1, 2.5);
  },
};

scenes.none = () => {};

function scene(name: string): void {
  newWorld();
  scenes[name]?.();
  view.beforeStep();
}

// ------------------------------------------------------------------ live mode
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  const p = world.player;
  if (e.code === 'KeyR') p.reload();
  if (e.code === 'KeyB') p.buyBest();
  if (e.code === 'KeyQ') p.cycle(1);
  if (e.code === 'KeyT') bot = bot ? null : new Bot(p, { skill: 0.9 });
  const d = /^Digit([1-6])$/.exec(e.code);
  if (d) p.selectOrBuy(WEAPON_ORDER[Number(d[1]) - 1]);
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
function readInput(): void {
  if (bot) return;
  const i = world.player.input;
  const k = (...c: string[]) => c.some((x) => keys.has(x));
  i.left = k('KeyA', 'ArrowLeft');
  i.right = k('KeyD', 'ArrowRight');
  i.up = k('KeyW', 'ArrowUp');
  i.down = k('KeyS', 'ArrowDown');
  i.fire = k('Space');
  i.jump = k('KeyE');
  i.horn = k('KeyH');
  i.cannon = k('KeyF');
}

// ------------------------------------------------------------------ boot
if (q.get('live') === '1') {
  newWorld({ quiet: q.get('quiet') === '1', money: num('money', 0) });
  if (q.get('bot') === '1') bot = new Bot(world.player, { skill: 0.9 });
  if (q.get('scene')) scenes[q.get('scene')!]?.();
  let last = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= TICK) {
      acc -= TICK;
      view.beforeStep();
      readInput();
      if (bot) bot.think(world);
      world.step();
    }
    view.update(dt, acc / TICK);
    stage.renderer.info.reset();
    stage.frame(dt, true);
    info();
  };
  requestAnimationFrame(loop);
} else {
  scene(q.get('scene') ?? 'lineup');
  if (tod !== null) forceTod(tod);
  advance(0.1);
}

const api = {
  get world() {
    return world;
  },
  view,
  stage,
  env,
  advance,
  render,
  scene,
  newWorld,
  forceTod,
  hold,
  press,
  give,
  place,
  spawn,
  P,
  zoom,
  THREE,
  setBot(on: boolean) {
    bot = on ? new Bot(world.player, { skill: 0.9 }) : null;
  },
};
Object.assign(window as unknown as Record<string, unknown>, { lf: api, lfReady: true });
