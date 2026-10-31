import * as THREE from 'three';
import type { Game } from '../game';
import { Enemy } from '../ai/enemy';
import { ARCHETYPES } from '../ai/archetypes';
import { rand } from '../core/math';
import { Archetype } from '../character/variants';

/** Drive the player like a competent human (for automated playtests). */
export class Bot {
  private atkT = 0;
  private actT = 0;
  constructor(public game: Game) {}
  update(dt: number) {
    const g = this.game;
    const p = g.player;
    const inp = g.input;
    this.atkT -= dt;
    this.actT -= dt;
    if (!p.alive) return;
    const now = g.time;
    // defensive reactions first
    const ctr = g.director.findCounterable();
    if (ctr && ctr.hitTime - now < 0.22 && this.actT <= 0) {
      inp.press('counter');
      inp.release('counter');
      this.actT = 0.12;
      return;
    }
    const imm = g.director.imminent(0.32);
    if (imm && !imm.counterable && this.actT <= 0) {
      inp.press('dodge');
      inp.release('dodge');
      this.actT = 0.25;
      return;
    }
    // nearest enemy
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of g.enemies()) {
      if (!e.alive || e.state === 'enter') continue;
      const d = e.distTo(p);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (!best) {
      inp.virtual = { moveX: 0, moveY: 0 };
      return;
    }
    // move towards it via camera basis
    const dir = new THREE.Vector3(best.x - p.x, 0, best.z - p.z).normalize();
    const yaw = g.cam.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = -fz, rz = fx;
    const far = bd > 3.2;
    inp.virtual = { moveX: far ? dir.x * rx + dir.z * rz : (dir.x * rx + dir.z * rz) * 0.4, moveY: far ? dir.x * fx + dir.z * fz : (dir.x * fx + dir.z * fz) * 0.4 };
    if (this.actT > 0) return;
    if (best.state === 'down' && bd < 2.4) {
      inp.press('finisher');
      this.actT = 0.6;
      return;
    }
    if (p.charges > 0 && bd < 3.5 && Math.random() < 0.02) {
      inp.press('finisher');
      this.actT = 0.6;
      return;
    }
    if ((best.cfg.needsStun || best.cfg.block > 0.5) && best.state !== 'stunned' && bd < 3 && Math.random() < 0.05) {
      inp.press('stun');
      this.actT = 0.4;
      return;
    }
    if (bd < 4.5 && this.atkT <= 0) {
      inp.press('attack');
      inp.release('attack');
      this.atkT = rand(0.18, 0.32);
    }
  }
}

/** Deterministic headless scenarios: ?test=NAME&frames=N */
export async function runTest(game: Game, params: URLSearchParams) {
  const name = params.get('test')!;
  const frames = Number(params.get('frames') ?? 120);
  const dt = 1 / 60;
  const w = window as unknown as { __ready: boolean; __result: unknown; __step?: (n: number) => void };
  const camYaw = params.get('camyaw');
  if (camYaw) game.cam.yaw = Number(camYaw);
  const camPitch = params.get('campitch');
  if (camPitch) game.cam.pitch = Number(camPitch);
  const result: Record<string, unknown> = {};
  const t0 = performance.now();
  const spawnEnemy = (key: string, x: number, z: number) => {
    const cfg = ARCHETYPES[key];
    const names = game.archetypes[key as Archetype] ?? game.archetypes.brawler;
    const e = new Enemy(game, game.lib, game.lib.get(names[Math.floor(Math.random() * names.length)]), cfg);
    e.spawn(x, z, Math.atan2(-x, -z));
    e.state = 'circle';
    e.ghostWalls = false;
    game.addFighter(e);
    return e;
  };
  if (name === 'merged') {
    game.arena.group.traverse((o) => {
      if (o.name !== 'staticMerged') return;
      const m = o as THREE.Mesh;
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox!;
      const mat = m.material as THREE.MeshStandardMaterial;
      console.log(`merged color=${mat.color?.getHexString()} verts=${m.geometry.attributes.position.count} min=${b.min.toArray().map((v) => v.toFixed(1))} max=${b.max.toArray().map((v) => v.toFixed(1))}`);
    });
  }
  if (name === 'arena') {
    for (let i = 0; i < frames; i++) {
      game.input.virtual = { moveX: 0, moveY: i > 20 && i < 80 ? 1 : 0 };
      game.step(dt);
    }
  }
  if (name === 'ragdoll') {
    const n = Number(params.get('n') ?? 6);
    const waves = Number(params.get('waves') ?? 1);
    const keys = Object.keys(ARCHETYPES).filter((k) => !ARCHETYPES[k].boss);
    for (let wv = 0; wv < waves; wv++) {
      const es: Enemy[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + wv * 0.4;
        const r = 2.2 + (i % 3) * 0.9;
        es.push(spawnEnemy(keys[(i + wv) % keys.length], Math.cos(a) * r, Math.sin(a) * r + 1));
      }
      for (let i = 0; i < 10; i++) game.step(dt);
      for (const e of es) {
        const dir = new THREE.Vector3(e.x - game.player.x, 0, e.z - game.player.z).normalize();
        const head = new THREE.Vector3();
        e.bodyPoint('head', head);
        e.woundAt(head, 0, 0.06, 1, 0.12);
        e.bleedRate = 3;
        game.fx.bloodSpray(head, dir.clone().setY(0.2), 1, 4);
        game.death.kill(e, 'test', dir.clone().multiplyScalar(rand(60, 140)).setY(rand(10, 40)), head);
      }
      for (let i = 0; i < frames; i++) game.step(dt);
    }
  }
  if (name === 'combat' || name === 'waves') {
    // bot plays the real wave game
    const bot = new Bot(game);
    game.started = true;
    game.waves.start(Number(params.get('wave') ?? 1));
    const god = params.get('god') === '1';
    for (let i = 0; i < frames; i++) {
      bot.update(dt);
      if (god) game.player.hp = Math.max(game.player.hp, 60);
      game.step(dt);
      if (i % 600 === 0) console.log(`t=${(i / 60).toFixed(0)}s wave=${game.waves.wave} corpses=${game.corpses.count} enemies=${game.enemies().filter((e) => e.alive).length} hp=${game.player.hp.toFixed(0)} combo=${game.player.bestCombo}`);
      if (!game.player.alive && !god) break;
    }
    result.wave = game.waves.wave;
    result.playerHp = game.player.hp;
    result.stats = game.player.stats;
    result.bestCombo = game.player.bestCombo;
    result.score = game.player.score;
  }
  if (name === 'duel') {
    // single enemy type vs bot, for animation review
    const key = params.get('enemy') ?? 'brawler';
    const n = Number(params.get('n') ?? 1);
    for (let i = 0; i < n; i++) spawnEnemy(key, rand(-3, 3), -3 - i);
    const bot = new Bot(game);
    game.started = true;
    for (let i = 0; i < frames; i++) {
      bot.update(dt);
      game.player.hp = Math.max(game.player.hp, 50);
      game.step(dt);
    }
    result.stats = game.player.stats;
  }
  if (name === 'film') {
    // set up a fight, then let the runner step + screenshot frame by frame
    const key = params.get('enemy') ?? 'brawler';
    const n = Number(params.get('n') ?? 3);
    for (let i = 0; i < n; i++) spawnEnemy(key, rand(-3.5, 3.5), -2.5 - i * 0.8);
    const bot = new Bot(game);
    game.started = true;
    game.cam.framingDist = Number(params.get('framing') ?? 0);
    const warm = Number(params.get('warm') ?? 120);
    for (let i = 0; i < warm; i++) {
      bot.update(dt);
      game.player.hp = Math.max(game.player.hp, 50);
      game.step(dt);
    }
    (window as unknown as { __film: { step: (k: number) => void } }).__film = {
      step(k: number) {
        for (let i = 0; i < k; i++) {
          bot.update(dt);
          game.player.hp = Math.max(game.player.hp, 50);
          game.step(dt);
        }
        game.renderFrame();
        const c = game.cam;
        console.log(`cam yaw=${c.yaw.toFixed(2)} pitch=${c.pitch.toFixed(2)} dist=${c.dist.toFixed(2)} pos=${c.camera.position.toArray().map((v) => v.toFixed(2)).join(',')} cine=${c.inCinematic} action=${game.player.action}`);
      },
    };
    game.renderFrame();
  }
  if (name === 'stress') {
    // populate many permanent corpses and blood quickly, then measure frame cost
    const target = Number(params.get('corpses') ?? 200);
    const keys = Object.keys(ARCHETYPES).filter((k) => !ARCHETYPES[k].boss);
    let made = 0;
    while (made < target) {
      const batch = Math.min(12, target - made);
      const es: Enemy[] = [];
      for (let i = 0; i < batch; i++) es.push(spawnEnemy(keys[(made + i) % keys.length], rand(-11.5, 11.5), rand(-9.5, 9.5)));
      for (let i = 0; i < 2; i++) game.step(dt);
      for (const e of es) {
        const head = new THREE.Vector3();
        e.bodyPoint('head', head);
        e.woundAt(head, 0, 0.07, 1, 0.1);
        const dir = new THREE.Vector3(rand(-1, 1), 0.2, rand(-1, 1)).normalize();
        game.fx.bloodSpray(head, dir, 1.2, 4);
        game.death.kill(e, 'stress', dir.clone().multiplyScalar(rand(40, 120)), head);
      }
      let guard = 0;
      while (game.death.dying.length > 0 && guard++ < 600) game.step(dt);
      made += batch;
    }
    // let pools finish growing
    for (let i = 0; i < 300; i++) game.step(dt);
    // measure CPU frame cost (sim + render submit)
    const times: number[] = [];
    for (let i = 0; i < 60; i++) {
      const a = performance.now();
      game.step(dt);
      game.renderFrame();
      times.push(performance.now() - a);
    }
    times.sort((a, b) => a - b);
    result.frameMsMedian = times[30];
    result.frameMsP90 = times[54];
  }
  result.ms = Math.round(performance.now() - t0);
  result.corpses = game.corpses?.count ?? 0;
  result.corpseVerts = game.corpses?.totalVerts ?? 0;
  result.corpseChunks = game.corpses?.chunks.length ?? 0;
  result.splats = game.blood.totalSplats;
  result.logCount = game.blood.logCount;
  result.dying = game.death?.dying.length ?? 0;
  result.fighters = game.fighters.length;
  result.weapons = game.weapons.length;
  game.renderFrame();
  const info = game.renderer.gl.info;
  result.calls = game.renderer.sceneStats.calls;
  result.tris = game.renderer.sceneStats.triangles;
  result.geometries = info.memory.geometries;
  result.textures = info.memory.textures;
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  if (mem) result.heapMB = Math.round(mem.usedJSHeapSize / 1048576);
  w.__result = result;
  console.log('RESULT ' + JSON.stringify(result));
  // drain queued GPU work (software GL can lag far behind long simulations)
  game.renderer.gl.getContext().finish();
  w.__ready = true;
}
