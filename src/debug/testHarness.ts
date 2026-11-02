import * as THREE from 'three';
import type { Game } from '../game';
import { Enemy } from '../ai/enemy';
import type { Fighter } from '../combat/fighter';
import { ARCHETYPES } from '../ai/archetypes';
import { clamp, rand } from '../core/math';
import type { Incoming } from '../ai/director';
import { Archetype } from '../character/variants';
import { makeHit } from '../combat/types';
import { ENEMY_ATTACKS } from '../combat/moves';
import { B } from '../anim/skeleton';

/** Drive the player like a competent human (for automated playtests). */
export class Bot {
  private atkT = 0;
  private actT = 0;
  /**
   * human=1: a fallible player rather than a frame-perfect one - each counter goes in early or
   * late around the right moment (a spread like a decent human's), a few attacks are missed
   * altogether. What boss tuning is measured against.
   */
  readonly human: boolean;
  private plans = new WeakMap<Incoming, number>();
  constructor(public game: Game) {
    this.human = game.params.get('human') === '1';
  }
  /** When this player's thumb goes down for an incoming attack (Infinity: never saw it). */
  private pressAt(inc: Incoming, counter: boolean): number {
    let t = this.plans.get(inc);
    if (t === undefined) {
      const gauss = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
      t = Math.random() < (counter ? 0.1 : 0.15) ? Infinity : inc.hitTime - clamp((counter ? 0.16 : 0.2) + gauss * 0.085, -0.04, 0.5);
      this.plans.set(inc, t);
    }
    return t;
  }
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
    // (bosses only take perfect counters: the bot waits for the last moment on them)
    if (ctr && this.actT <= 0 && (this.human ? now >= this.pressAt(ctr, true) : ctr.hitTime - now < (ctr.enemy.brain ? 0.13 : 0.22))) {
      inp.press('counter');
      inp.release('counter');
      this.actT = 0.12;
      return;
    }
    const imm = g.director.imminent(this.human ? 0.6 : 0.32);
    if (imm && !imm.counterable && this.actT <= 0 && (!this.human || now >= this.pressAt(imm, false))) {
      inp.press('dodge');
      inp.release('dodge');
      this.actT = 0.25;
      return;
    }
    // the special when it's loaded and there's a crowd (or a boss) to use it on
    if (p.specialCharges > 0 && p.action === 'free' && this.actT <= 0) {
      const near = g.enemies().filter((e) => e.alive && !e.down && e.distTo(p) < 9);
      if (near.length >= 3 || near.some((e) => e.cfg.boss)) {
        inp.press('special');
        inp.release('special');
        this.actT = 0.4;
        return;
      }
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
    if (best.state === 'down' && bd < 2.4 && p.execCd <= 0) {
      inp.press('finisher');
      this.actT = 0.6;
      return;
    }
    // (a boss on its feet can't be finished: only once he's dazed)
    if (p.charges > 0 && p.execCd <= 0 && bd < 3.5 && (!best.cfg.boss || best.state === 'stunned') && Math.random() < 0.02) {
      inp.press('finisher');
      this.actT = 0.6;
      return;
    }
    // (stun strikes for brutes and guards - not a boss, who shrugs them off)
    if ((best.cfg.needsStun || best.cfg.block > 0.5) && !best.cfg.boss && best.state !== 'stunned' && bd < 3 && Math.random() < 0.05) {
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
  if (name === 'view') {
    // a still of the map: the player at px,pz facing pyaw, the camera at camyaw/campitch/camdist
    game.player.spawn(Number(params.get('px') ?? 0), Number(params.get('pz') ?? 2), Number(params.get('pyaw') ?? Math.PI));
    const cd = params.get('camdist');
    for (let i = 0; i < frames; i++) {
      if (cd) game.cam.framingDist = Number(cd) - 4.6;
      game.step(dt);
    }
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
    if (params.get('audio') === '1') {
      game.audio.resume();
      game.audio.startAmbience(game.arena.map);
      game.music.start();
    }
    game.waves.start(Number(params.get('wave') ?? 1));
    const god = params.get('god') === '1';
    // fair=1: how much warning enemy attacks give (registration to contact), per archetype
    const tells: { k: string; d: number; c: boolean; t: number }[] = [];
    if (params.get('fair') === '1') {
      const orig = game.director.registerAttack.bind(game.director);
      game.director.registerAttack = (e, hitDelay, counterable, feint) => {
        tells.push({ k: e.cfg.key, d: hitDelay, c: counterable, t: game.time + hitDelay });
        orig(e, hitDelay, counterable, feint);
      };
    }
    const probe = params.get('probe') === '1' ? new (await import('./animProbe')).AnimProbe(game) : null;
    // boss=1: when the wave's boss died and what the fight cost the bot
    const bossRep = { start: -1, end: -1, dmg0: 0, dmg: 0, name: '', counters0: 0, counters: 0, hits0: 0, hits: 0 };
    // ...and where the damage came from (attacker:move, 'special' for a boss's own signature moves;
    // why=1 adds what the player was doing when it landed)
    const dmgBy: Record<string, number> = {};
    if (params.get('boss') === '1') {
      const pl = game.player;
      const take = pl.takeHit.bind(pl);
      pl.takeHit = (h) => {
        const hp0 = pl.hp;
        const act0 = pl.action;
        const res = take(h);
        const lost = hp0 - pl.hp;
        if (lost > 0 && bossRep.start >= 0) {
          const a = h.attacker as Enemy | null;
          const mv = a?.state === 'attack' && a.attackDef ? (Object.keys(ENEMY_ATTACKS).find((k) => ENEMY_ATTACKS[k] === a.attackDef) ?? '?') : 'special';
          const key = (a ? `${a.cfg.boss ? a.cfg.key : 'minion'}:${a.cfg.boss ? mv : a.cfg.key}` : 'other') + (params.get('why') === '1' ? `@${act0}` : '');
          dmgBy[key] = Math.round((dmgBy[key] ?? 0) + lost);
        }
        return res;
      };
    }
    // trace=hips: a body's hips jumping in one frame - what its root, pose and blend did
    const hipTr = params.get('trace') === 'hips' ? new Map<object, { h: THREE.Vector3; x: number; z: number; d: THREE.Vector3; ctx: string }>() : null;
    for (let i = 0; i < frames; i++) {
      bot.update(dt);
      if (god) game.player.hp = Math.max(game.player.hp, 60);
      game.step(dt);
      probe?.sample(dt);
      if (hipTr) {
        for (const f of game.fighters) {
          if (!f.alive) continue;
          const h = f.anim.boneWorld(B.hips, new THREE.Vector3());
          const an = f.anim as unknown as { out: { hips: THREE.Vector3 }; src: { hips: THREE.Vector3 }; offH: THREE.Vector3; mode: string; clip: { clip: { name: string }; time: number } | null };
          const ctx = an.mode === 'clip' && an.clip ? `clip:${an.clip.clip.name}@${an.clip.time.toFixed(2)}` : an.mode;
          const pr = hipTr.get(f);
          const d = pr ? h.clone().sub(pr.h) : new THREE.Vector3();
          // (a change of the hips' velocity of over 3.6 m/s from one frame to the next)
          if (pr && d.distanceTo(pr.d) > 0.06) {
            console.log(`HIPJUMP ${f === game.player ? 'player' : (f as Enemy).cfg.key} jump=${d.distanceTo(pr.d).toFixed(3)} d=${d.length().toFixed(3)} prevD=${pr.d.length().toFixed(3)} ${pr.ctx} -> ${ctx} root d=${Math.hypot(f.x - pr.x, f.z - pr.z).toFixed(3)} hips local=${an.out.hips.toArray().map((v) => v.toFixed(2))} src=${an.src.hips.toArray().map((v) => v.toFixed(2))} offH=${an.offH.toArray().map((v) => v.toFixed(3))} state=${(f as Enemy).state ?? ''} paired=${!!f.paired}`);
          }
          hipTr.set(f, { h, x: f.x, z: f.z, d, ctx });
        }
      }
      if (params.get('boss') === '1') {
        const b = game.bosses.active;
        if (b && bossRep.start < 0) Object.assign(bossRep, { start: game.time, dmg0: game.player.stats.damageTaken, name: b.cfg.key, counters0: game.player.stats.counters, hits0: game.player.stats.hits, brain: b.brain });
        if (!b && bossRep.start >= 0 && bossRep.end < 0) {
          Object.assign(bossRep, { end: game.time, dmg: game.player.stats.damageTaken - bossRep.dmg0, counters: game.player.stats.counters - bossRep.counters0, hits: game.player.stats.hits - bossRep.hits0 });
          const st = (bossRep as unknown as { brain?: { stats: Record<string, number> } }).brain?.stats ?? {};
          console.log('BOSS ' + JSON.stringify({ name: bossRep.name, seconds: +(bossRep.end - bossRep.start).toFixed(1), damageTaken: Math.round(bossRep.dmg), hpLeft: Math.round(game.player.hp), counters: bossRep.counters, hits: bossRep.hits, dmgBy, brain: Object.fromEntries(Object.entries(st).map(([k, v]) => [k, Math.round(v)])) }));
          break;
        }
      }
      if (i % 600 === 0) {
        const boss = game.enemies().find((e) => e.alive && e.cfg.boss);
        console.log(`t=${(i / 60).toFixed(0)}s wave=${game.waves.wave} corpses=${game.corpses.count} enemies=${game.enemies().filter((e) => e.alive).length} hp=${game.player.hp.toFixed(0)} combo=${game.player.bestCombo}${boss ? ` boss=${boss.cfg.key}:${Math.round(boss.hp)}/${boss.maxHp} ${boss.state}` : ''}`);
      }
      if (!game.player.alive && !god) {
        const b = game.bosses.active;
        if (params.get('boss') === '1' && b && bossRep.start >= 0) {
          // (the boss won: how far the fight got)
          const st = b.brain?.stats ?? {};
          console.log('BOSSWIN ' + JSON.stringify({ name: b.cfg.key, seconds: +(game.time - bossRep.start).toFixed(1), bossHp: +(b.hp / b.maxHp).toFixed(2), phase: b.phase, counters: game.player.stats.counters - bossRep.counters0, dmgBy, brain: Object.fromEntries(Object.entries(st).map(([k, v]) => [k, Math.round(v)])) }));
        }
        break;
      }
    }
    if (probe) console.log('PROBE ' + JSON.stringify(probe.report((frames * dt))));
    if (tells.length) {
      const by: Record<string, number[]> = {};
      for (const x of tells) (by[x.k] ??= []).push(x.d);
      const q = (a: number[], f: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * f))];
      const hits = tells.map((x) => x.t).sort((a, b) => a - b);
      let close = 0;
      for (let i = 1; i < hits.length; i++) if (hits[i] - hits[i - 1] < 0.25) close++;
      console.log('FAIR ' + JSON.stringify({ n: tells.length, wave: game.waves.wave, hp: Math.round(game.player.hp), dmgTaken: Math.round(game.player.stats.damageTaken), within250ms: close, byType: Object.fromEntries(Object.entries(by).map(([k, a]) => [k, { n: a.length, min: +q(a, 0).toFixed(3), p10: +q(a, 0.1).toFixed(3), med: +q(a, 0.5).toFixed(3) }])) }));
    }
    if (params.get('rtime') === '1') {
      const gl = game.renderer.gl;
      for (let k = 0; k < 3; k++) {
        let t0 = performance.now();
        game.blood.flush(gl);
        const tf = performance.now() - t0;
        t0 = performance.now();
        game.renderFrame();
        gl.getContext().finish();
        console.log(`render ${k}: flush=${tf.toFixed(1)}ms frame=${(performance.now() - t0).toFixed(1)}ms pools=${game.blood.pools.length} rivulets=${game.blood.rivulets.length} corpses=${game.corpses.count}`);
        game.step(dt);
      }
    }
    const ec = game.euphoria.counters;
    result.euphoria = { created: ec.created, peak: ec.peak, steps: ec.steps, avgStepMs: +(ec.stepMsTotal / Math.max(1, ec.steps)).toFixed(3), worstStepMs: +ec.worstStepMs.toFixed(2), statics: game.euphoria.staticCount, ...game.euphoria.events };
    result.wave = game.waves.wave;
    const mu = game.music as unknown as { bar: number; intensity: number };
    result.audio = { state: game.audio.ctx?.state ?? 'none', bars: mu.bar, intensity: +mu.intensity.toFixed(2) };
    result.playerHp = game.player.hp;
    result.stats = game.player.stats;
    result.bestCombo = game.player.bestCombo;
    result.score = game.player.score;
  }
  if (name === 'duel') {
    // single enemy type vs bot, for animation review
    const key = params.get('enemy') ?? 'brawler';
    const n = Number(params.get('n') ?? 1);
    const foes: Enemy[] = [];
    for (let i = 0; i < n; i++) foes.push(spawnEnemy(key, rand(-3, 3), -3 - i));
    const bot = new Bot(game);
    game.started = true;
    let killedAt = -1;
    for (let i = 0; i < frames; i++) {
      bot.update(dt);
      game.player.hp = Math.max(game.player.hp, 50);
      game.step(dt);
      // (how long the first one lasts against the bot - boss balance)
      if (killedAt < 0 && !foes[0].alive) killedAt = i * dt;
      if (i % 600 === 0) console.log(`duel t=${(i * dt).toFixed(0)}s ${key} hp=${foes.map((f) => Math.round(f.hp)).join(',')} adds=${game.enemies().filter((o) => o.alive && !foes.includes(o)).length}`);
    }
    console.log(`duel ${key} killedAt=${killedAt.toFixed(1)}s hp=${foes.map((f) => Math.round(f.hp)).join(',')}/${foes[0].maxHp}`);
    result.stats = game.player.stats;
  }
  if (name === 'film') {
    // set up a fight, then let the runner step + screenshot frame by frame
    const key = params.get('enemy') ?? 'brawler';
    const n = Number(params.get('n') ?? 3);
    // wave=N films the real wave (mixed enemies, the director) instead of n of one kind
    if (params.get('wave')) game.waves.start(Number(params.get('wave')));
    else for (let i = 0; i < n; i++) spawnEnemy(key, rand(-3.5, 3.5), -2.5 - i * 0.8);
    const bot = new Bot(game);
    game.started = true;
    game.cam.framingDist = Number(params.get('framing') ?? 0);
    const warm = Number(params.get('warm') ?? 120);
    for (let i = 0; i < warm; i++) {
      bot.update(dt);
      game.player.hp = Math.max(game.player.hp, 50);
      game.step(dt);
    }
    // special=1: load the special and use it right away (film the pistol)
    if (params.get('special') === '1') {
      game.player.specialCharges = 1;
      game.player.trySpecial();
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
  if (name === 'replay') {
    // fight a wave, fall, then watch it back (film.mjs steps it): rcam=game|free, rfrom=seconds
    // relative to the fall, rspeed
    game.waves.start(Number(params.get('wave') ?? 3));
    const bot = new Bot(game);
    game.started = true;
    for (let i = 0; i < frames; i++) {
      bot.update(dt);
      game.player.hp = Math.max(game.player.hp, 50);
      game.step(dt);
    }
    const p = game.player;
    if (params.get('special') === '1') {
      // the pistol on a thug just in front, a second and a half before the fall
      const e = spawnEnemy('brawler', p.x + Math.sin(p.yaw) * 2.6, p.z + Math.cos(p.yaw) * 2.6);
      e.attackCooldown = 1e9;
      for (let i = 0; i < 20; i++) game.step(dt);
      if (p.action !== 'free') (p as unknown as { toFree(h: number): void }).toFree(0.05);
      p.specialCharges = 1;
      p.trySpecial();
      console.log(`special action=${p.action} t=${game.time.toFixed(2)}`);
      for (let i = 0; i < 90; i++) game.step(dt);
    }
    p.hp = 1;
    p.invuln = 0;
    if (p.isLocked() || p.action !== 'free') (p as unknown as { toFree(h: number): void }).toFree(0.05);
    const killer = game.enemies().find((e) => e.alive) ?? null;
    p.takeHit(makeHit({ dir: new THREE.Vector3(0, 0, 1), point: new THREE.Vector3(p.x, 1.4, p.z), damage: 999, strength: 1.2, kind: 'punch', region: 'head', attacker: killer }));
    for (let i = 0; i < 330; i++) game.step(dt);
    const r = game.replay;
    console.log(`REPLAY span=${r.length.toFixed(1)}s start=${r.start.toFixed(1)} fall=${r.deathT.toFixed(1)} end=${r.end.toFixed(1)} corpses=${game.corpses.count} fighters=${game.fighters.length}`);
    if (params.get('rcam') === 'game') r.cam = 'game';
    game.openReplay();
    if (params.get('rfrom')) r.seek(r.deathT + Number(params.get('rfrom')));
    if (params.get('rspeed')) r.speed = Number(params.get('rspeed'));
    const vis = () => game.scene.children.filter((o) => o.type === 'Group' && o.visible && (o as THREE.Group).children.some((c) => (c as THREE.SkinnedMesh).isSkinnedMesh)).length;
    console.log(`open active=${r.active} t=${(r.t - r.deathT).toFixed(2)} cam=${r.cam} models=${vis()}`);
    (window as unknown as { __film: { step: (k: number) => void } }).__film = {
      step(k: number) {
        for (let i = 0; i < k; i++) game.step(dt);
        game.renderFrame();
        console.log(`cam t=${(r.t - r.deathT).toFixed(2)} playing=${r.playing} models=${vis()} fired=${r.fired}/${r.eventCount}`);
      },
    };
    if (params.get('close') === '1') {
      for (let i = 0; i < 120; i++) game.step(dt);
      game.closeReplay();
      console.log(`closed active=${r.active} models=${vis()} fighters=${game.fighters.length}`);
      if (params.get('look') === 'body') {
        // frame the player's body where it lies (a corpse now)
        const rec = game.corpses.records[game.corpses.records.length - 1];
        const at = new THREE.Vector3(rec ? rec.x : p.x, 0.15, rec ? rec.z : p.z);
        const from = at.clone().add(new THREE.Vector3(1.1, 1.0, 1.1));
        const m = new THREE.Matrix4().lookAt(from, at, new THREE.Vector3(0, 1, 0));
        game.cam.setPose(from, new THREE.Quaternion().setFromRotationMatrix(m), 45);
        game.cam.camera.updateMatrixWorld(true);
        game.preStep = () => game.cam.setPose(from, new THREE.Quaternion().setFromRotationMatrix(m), 45);
      }
    }
    game.renderFrame();
  }
  if (name === 'counters') {
    // counters on one attacker lunging in from further and further away: how fast the planted
    // feet of each side slide over the counter
    const p = game.player;
    game.started = true;
    const out: { d: number; player: number; victim: number; name: string }[] = [];
    const feetSlide = (f: Fighter, prev: { x: number; z: number; on: boolean }[]) => {
      let worst = 0;
      for (let k = 0; k < 2; k++) {
        const lp = f.anim.fk.pos[k === 0 ? B.footL : B.footR];
        const c = Math.cos(f.yaw), sn = Math.sin(f.yaw);
        const wx = f.x + lp.x * c + lp.z * sn, wz = f.z - lp.x * sn + lp.z * c;
        const on = lp.y < f.def.ankleHeight + 0.02;
        if (on && prev[k].on) worst = Math.max(worst, Math.hypot(wx - prev[k].x, wz - prev[k].z) / dt);
        prev[k] = { x: wx, z: wz, on };
      }
      return worst;
    };
    let trial = 0;
    for (const d of [1.2, 1.6, 2.0, 2.4]) {
      for (let rep = 0; rep < 3; rep++) {
        const ox = (trial++ % 5) * 7 - 14, oz = Math.floor(trial / 5) * 7 - 7;
        p.x = ox;
        p.z = oz;
        p.yaw = Math.PI;
        p.vx = p.vz = 0;
        p.anim.initAt(p.x, p.z, p.yaw);
        const e = spawnEnemy('brawler', ox, oz - d);
        e.yaw = 0;
        e.anim.initAt(e.x, e.z, 0);
        for (let i = 0; i < 20; i++) game.step(dt);
        e.attackDef = ENEMY_ATTACKS.punch;
        (e as unknown as { startAttack(c: boolean): void }).startAttack(false);
        let countered = false;
        let ps = 0, vs = 0;
        const pp = [{ x: 0, z: 0, on: false }, { x: 0, z: 0, on: false }], vp = [{ x: 0, z: 0, on: false }, { x: 0, z: 0, on: false }];
        let name = '';
        for (let f = 0; f < 110; f++) {
          const inc = game.director.findCounterable();
          if (!countered && inc && inc.enemy === e && inc.hitTime - game.time < 0.15) {
            game.input.press('counter');
            game.input.release('counter');
            countered = true;
          }
          game.step(dt);
          if (p.action === 'counter') {
            name = (p.anim.clip?.clip.name ?? '') || name;
            ps = Math.max(ps, feetSlide(p, pp));
            vs = Math.max(vs, feetSlide(e, vp));
          }
        }
        out.push({ d, player: +ps.toFixed(2), victim: +vs.toFixed(2), name });
        if (e.alive) {
          e.hp = 1;
          e.takeHit(makeHit({ dir: new THREE.Vector3(0, 0, -1), point: new THREE.Vector3(e.x, 1.4, e.z), damage: 99, strength: 1, kind: 'punch', region: 'head', attacker: p }));
        }
        for (let i = 0; i < 30; i++) game.step(dt);
      }
    }
    console.log('COUNTERS ' + JSON.stringify(out));
  }
  if (name === 'spectate') {
    // fight a real wave for a while, die, then fly the spectator camera round the aftermath
    game.waves.start(Number(params.get('wave') ?? 6));
    const bot = new Bot(game);
    game.started = true;
    for (let i = 0; i < frames; i++) {
      bot.update(dt);
      game.player.hp = Math.max(game.player.hp, 50);
      game.step(dt);
    }
    const p = game.player;
    p.hp = 1;
    // (out of whatever move or dodge had it untouchable)
    p.invuln = 0;
    if (p.isLocked() || p.action !== 'free') (p as unknown as { toFree(h: number): void }).toFree(0.05);
    const killer = game.enemies().find((e) => e.alive) ?? null;
    p.takeHit(makeHit({ dir: new THREE.Vector3(0, 0, 1), point: new THREE.Vector3(p.x, 1.4, p.z), damage: 999, strength: 1.2, kind: 'punch', region: 'head', attacker: killer }));
    for (let i = 0; i < 200; i++) game.step(dt);
    game.startSpectate();
    // fly: back and up, turning to look over the room
    for (let i = 0; i < 90; i++) {
      game.input.virtual = { moveX: 0.3, moveY: -1 };
      game.input.lookDX += 6;
      game.input.lookDY += 1.5;
      game.step(dt);
      if (i % 15 === 0) {
        const q = game.cam.camera.position, d = new THREE.Vector3();
        game.cam.camera.getWorldDirection(d);
        console.log(`fly ${i} pos=${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(2)} dir=${d.x.toFixed(2)},${d.y.toFixed(2)},${d.z.toFixed(2)} mx=${game.input.moveX.toFixed(2)} my=${game.input.moveY.toFixed(2)}`);
      }
    }
    game.input.virtual = { moveX: 0, moveY: 0 };
    for (let i = 0; i < 30; i++) game.step(dt);
    game.renderFrame();
    const c = game.cam.camera.position;
    const sp = document.querySelector('.spectate') as HTMLElement | null;
    if (sp) {
      const r = sp.getBoundingClientRect();
      console.log(`spectate bar class=${sp.className} display=${getComputedStyle(sp).display} z=${getComputedStyle(sp).zIndex} rect=${r.x.toFixed(0)},${r.y.toFixed(0)},${r.width.toFixed(0)}x${r.height.toFixed(0)} parent=${sp.parentElement?.tagName}`);
    } else console.log('spectate bar missing');
    console.log(`spectating=${game.spectating} freeCam=${game.cam.freeCam} cam=${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)} over=${game.over} corpses=${game.corpses.count}`);
  }
  if (name === 'ledge') {
    // rooftop: knock (mode=knock), kill (death) or stagger an enemy into the north parapet
    const mode = params.get('mode') ?? 'knock';
    const gap = Number(params.get('gap') ?? 1.4);
    const ox = Number(params.get('ox') ?? 0);
    game.player.spawn(ox, -11 + gap + 2.0, Math.PI);
    game.cam.yaw = Number(params.get('camyaw') ?? 0);
    const e = spawnEnemy(params.get('enemy') ?? 'brawler', ox, -11 + gap);
    e.attackCooldown = 1e9;
    e.stunNow(100);
    game.started = true;
    for (let f = 0; f < frames; f++) {
      e.attackCooldown = 1e9;
      if (f === 30) {
        const p = game.player;
        const dir = new THREE.Vector3(0, 0, -1);
        const pt = new THREE.Vector3();
        e.bodyPoint('chest', pt);
        const h = makeHit({ dir, point: pt, damage: 5, strength: Number(params.get('str') ?? 1.1), kind: 'punch', region: 'chest', attacker: p, knockdown: mode === 'knock' });
        if (mode === 'death') {
          e.hp = 1;
          e.takeHit({ ...h, damage: 50 });
        } else if (mode === 'stagger') e.physStagger(h, 0.6);
        else e.takeHit(h);
      }
      game.step(dt);
      if (f % 10 === 0 && f >= 30) {
        const r = e.ragdoll;
        const pv = r ? r.pelvisPos(new THREE.Vector3()) : null;
        console.log(`f=${f} alive=${e.alive} state=${e.state} pelvis=${pv ? pv.toArray().map((v) => v.toFixed(2)).join(',') : '-'} dying=${game.death.dying.length} fighters=${game.fighters.length} kills=${game.player.stats.kills} score=${game.player.score} cine=${game.cam.inCinematic} cam=${game.cam.camera.position.toArray().map((v) => v.toFixed(2)).join(',')}`);
      }
    }
    result.kills = game.player.stats.kills;
    result.fighters = game.fighters.length;
  }
  if (name === 'euph') {
    // scripted active-ragdoll reactions for filming: mode = stagger | knock | death | throw | pile
    const mode = params.get('mode') ?? 'knock';
    const key = params.get('enemy') ?? 'brawler';
    game.player.x = 0;
    game.player.z = 1.6;
    game.player.yaw = Math.PI;
    game.cam.yaw = 0;
    const es: Enemy[] = [];
    const n = mode === 'pile' ? 5 : Number(params.get('n') ?? 1);
    if (mode === 'prop') {
      // knock an enemy into an oil drum
      const d = game.props.list[Number(params.get('prop') ?? 0)].body.translation();
      game.player.x = d.x + 2.3;
      game.player.z = d.z;
      es.push(spawnEnemy(key, d.x + 0.85, d.z));
    } else for (let i = 0; i < n; i++) es.push(spawnEnemy(key, mode === 'pile' ? (i - 2) * 0.35 : (i - (n - 1) / 2) * 1.4, mode === 'pile' ? -0.6 - i * 0.25 : -0.4 - (i % 2) * 0.5));
    // probe=1: animation quality over the run (get-ups after a knockdown: run=1 with pgu=0)
    const probe = params.get('probe') === '1' ? new (await import('./animProbe')).AnimProbe(game) : null;
    game.started = true;
    for (const e of es) {
      e.attackCooldown = 1e9;
      e.stunNow(100); // dazed in place: a still target to film
    }
    game.cam.framingDist = Number(params.get('framing') ?? -1.8);
    let frame = 0;
    const fire = () => {
      const p = game.player;
      for (const [i, e] of es.entries()) {
        if (!e.alive) continue;
        const at = frame === 30 + i * 4;
        if (!at) continue;
        const dir = new THREE.Vector3(e.x - p.x, 0, e.z - p.z).normalize();
        const head = new THREE.Vector3();
        e.bodyPoint(mode === 'stagger' || mode === 'agony' ? 'chest' : 'head', head);
        const h = makeHit({ dir, point: head, damage: 5, strength: 1.1, kind: 'punch', region: mode === 'agony' ? 'gut' : 'head', attacker: p, knockdown: mode !== 'stagger', launch: mode === 'throw' ? 4 : 0 });
        if (mode === 'stagger') e.physStagger(h, Number(params.get('imp') ?? 0.42));
        else if (mode === 'agony') {
          // a beating to the body: bruises and a bleeding gut wound, then the fatal blow
          const pt = new THREE.Vector3();
          e.bodyPoint('chest', pt);
          e.woundAt(pt.clone().add(new THREE.Vector3(0.05, -0.18, 0.1)), 0, 0.07, 1, 0.18);
          e.woundAt(pt.clone().add(new THREE.Vector3(-0.08, 0.05, 0.1)), 1, 0.09, 0.9);
          e.bodyPoint('head', pt);
          e.woundAt(pt.clone().add(new THREE.Vector3(0.05, 0.02, 0.08)), 1, 0.06, 0.9);
          e.bleedRate = 3;
          e.hp = 1;
          e.takeHit({ ...h, damage: 50, knockdown: false });
        } else if (mode === 'death' || mode === 'pile') {
          e.hp = 1;
          e.takeHit({ ...h, damage: 50, knockdown: false });
        } else {
          e.knockdown(h);
          const pgu = params.get('pgu');
          if (pgu !== null) e.physGetUp = pgu === '1';
        }
      }
    };
    const stepOne = () => {
      for (const e of es) e.attackCooldown = 1e9;
      fire();
      game.step(dt);
      probe?.sample(dt);
      frame++;
      if (frame % (Number(params.get('logEvery') ?? 30)) === 0) {
        const e = es[0];
        const r = e.downRag as unknown as { mode?: string; getUpPhase?: string | null; ctl?: { sens: { pelvisH: number } } } | null;
        if (mode === 'prop') {
          const pb = game.props.list[Number(params.get('prop') ?? 0)].body;
          const t = pb.translation(), lv = pb.linvel();
          console.log(`prop pos=${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)} speed=${Math.hypot(lv.x, lv.y, lv.z).toFixed(2)}`);
        }
        const dr = e.ragdoll as unknown as { mode?: string; inAgony?: boolean; agonyProgress?: number; settled?: boolean; ctl?: { modeTime: number; legStrength: { L: number }; pain: number; tone: number; alive: boolean; conscious: boolean; sens: { pelvisH: number; upTilt: number } } } | null;
        const fk = e.anim.fk;
        const kneeAng = (th: number, sh: number, ft: number) => {
          const a = fk.pos[sh].clone().sub(fk.pos[th]).normalize(), b = fk.pos[ft].clone().sub(fk.pos[sh]).normalize();
          return (Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 57.3).toFixed(0);
        };
        if (dr && !e.alive) {
          const hipAng = (th: number, sh: number) => {
            const sp = fk.pos[B.spine].clone().sub(fk.pos[B.hips]).normalize(), a = fk.pos[sh].clone().sub(fk.pos[th]).normalize();
            return (180 - Math.acos(Math.max(-1, Math.min(1, sp.dot(a)))) * 57.3).toFixed(0);
          };
          console.log(`knees L=${kneeAng(B.thighL, B.shinL, B.footL)} R=${kneeAng(B.thighR, B.shinR, B.footR)} hipflex L=${hipAng(B.thighL, B.shinL)} R=${hipAng(B.thighR, B.shinR)} ${(dr as unknown as { dbgWrithe: string }).dbgWrithe}`);
        }
        if (dr && !e.alive) console.log(`f=${frame} dying mode=${dr.mode} agony=${dr.inAgony} k=${dr.agonyProgress?.toFixed(2)} settled=${dr.settled} corpses=${game.corpses.count} mt=${dr.ctl?.modeTime.toFixed(2)} leg=${dr.ctl?.legStrength.L.toFixed(2)} pain=${dr.ctl?.pain.toFixed(2)} tone=${dr.ctl?.tone.toFixed(2)} alive=${dr.ctl?.alive} cons=${dr.ctl?.conscious} pelvisH=${dr.ctl?.sens.pelvisH.toFixed(2)} tilt=${dr.ctl?.sens.upTilt.toFixed(2)}`);
        console.log(`f=${frame} state=${e.state} alive=${e.alive} mode=${r?.mode ?? '-'} gu=${r?.getUpPhase ?? '-'} pelvisH=${r?.ctl?.sens.pelvisH.toFixed(2) ?? '-'} active=${game.euphoria.actives.length} stepMs=${game.euphoria.stepMs.toFixed(2)} sub=${game.euphoria.world.substeps}`);
      }
    };
    // fixed side-on witness camera on the first enemy (camera rig would sit behind the player)
    const camAng = Number(params.get('camang') ?? 1.35);
    const camDist = Number(params.get('camdist') ?? 3.4);
    const look = new THREE.Vector3(es[0].x, 0.75, es[0].z);
    const placeCam = () => {
      const c = game.cam.camera;
      c.position.set(look.x + Math.sin(camAng) * camDist, 1.45, look.z + Math.cos(camAng) * camDist);
      c.lookAt(look);
    };
    (window as unknown as { __film: { step: (k: number) => void } }).__film = {
      step(k: number) {
        for (let i = 0; i < k; i++) stepOne();
        if (params.get('track') === '1') {
          const e = es[0];
          look.lerp(new THREE.Vector3(e.x, 0.75, e.z), 0.5);
        }
        placeCam();
        game.renderFrame();
      },
    };
    for (let i = 0; i < Number(params.get('warm') ?? 20); i++) stepOne();
    if (params.get('run')) for (let i = 0; i < frames; i++) stepOne();
    if (probe) console.log('PROBE ' + JSON.stringify(probe.report(frame * dt)));
    game.renderFrame();
  }
  if (name === 'moves') {
    // scripted player movement for reviewing locomotion: idle, run, stop, sharp turn, blocked
    // strafe and backpedal, half-stick walk; side camera tracking the player
    const p = game.player;
    game.started = true;
    const inp = game.input;
    const script: [number, number, number, boolean][] = [
      // until (s), moveX, moveY, block  (camera basis: moveY = away from the camera)
      [1.2, 0, 0, false],
      [2.8, 0, 1, false],
      [3.6, 0, 0, false],
      [5.0, 1, -0.3, false],
      [5.8, 0, 0, false],
      [7.2, -1, 0, true],
      [8.4, 0, -1, true],
      [9.0, 0, 0, false],
      [11.0, 0.3, 0.25, false],
      [12.0, 0, 0, false],
    ];
    let frame = 0;
    let blocking = false;
    const stepOne = () => {
      const t = frame * dt;
      const seg = script.find((sg) => t < sg[0]) ?? script[script.length - 1];
      inp.virtual = { moveX: seg[1], moveY: seg[2] };
      if (seg[3] && !blocking) inp.press('block');
      if (!seg[3] && blocking) inp.release('block');
      blocking = seg[3];
      game.step(dt);
      frame++;
    };
    const camAng = Number(params.get('camang') ?? 1.57);
    const camDist = Number(params.get('camdist') ?? 4.2);
    const look = new THREE.Vector3(p.x, 0.9, p.z);
    (window as unknown as { __film: { step: (k: number) => void } }).__film = {
      step(k: number) {
        for (let i = 0; i < k; i++) stepOne();
        look.lerp(new THREE.Vector3(p.x, 0.9, p.z), 0.6);
        const c = game.cam.camera;
        c.position.set(look.x + Math.sin(camAng) * camDist, 1.5, look.z + Math.cos(camAng) * camDist);
        c.lookAt(look);
        game.renderFrame();
      },
    };
    for (let i = 0; i < Number(params.get('warm') ?? 0); i++) stepOne();
    const probe = params.get('probe') === '1' ? new (await import('./animProbe')).AnimProbe(game) : null;
    if (params.get('run')) {
      for (let i = 0; i < frames; i++) {
        stepOne();
        probe?.sample(dt);
      }
      if (probe) console.log('PROBE ' + JSON.stringify(probe.report(frames * dt)));
    }
  }
  if (name === 'eatk') {
    // one enemy attack on a passive player, side on, for reviewing telegraphs:
    // test=eatk&enemy=elite&atk=elite_jab&wave=14 (wave sets the speed scaling)
    const { ENEMY_ATTACKS } = await import('../combat/moves');
    const p = game.player;
    p.x = 0; p.z = 0; p.yaw = Math.PI;
    p.anim.initAt(0, 0, Math.PI);
    const e = spawnEnemy(params.get('enemy') ?? 'elite', 0, -1.9);
    game.director.setWave(Number(params.get('wave') ?? 1));
    game.started = true;
    game.godMode = true;
    const atk = ENEMY_ATTACKS[params.get('atk') ?? 'elite_jab'];
    let frame = 0;
    const stepOne = () => {
      e.attackCooldown = 1e9;
      if (frame === 20) {
        (e as unknown as { attackDef: unknown }).attackDef = atk;
        e.attackCombo = 1;
        const t0 = game.time;
        const orig = e.onEvent.bind(e);
        e.onEvent = (ev) => {
          if (ev.type === 'hit') console.log(`EATK hit landed after ${(game.time - t0).toFixed(3)} s`);
          orig(ev);
        };
        e.startAttack(false);
        const inc = game.director.incoming.find((x) => x.enemy === e);
        console.log(`EATK tell=${inc ? (inc.hitTime - game.time).toFixed(3) : '?'}`);
      }
      game.step(dt);
      frame++;
    };
    const camDist = Number(params.get('camdist') ?? 3.6);
    (window as unknown as { __film: { step: (k: number) => void } }).__film = {
      step(k: number) {
        for (let i = 0; i < k; i++) stepOne();
        const c = game.cam.camera;
        c.position.set(camDist, 1.4, -0.95);
        c.lookAt(0, 1.1, -0.95);
        game.renderFrame();
      },
    };
    for (let i = 0; i < Number(params.get('warm') ?? 15); i++) stepOne();
  }
  if (name === 'clips') {
    // every player strike against a still target, one after another; per bone and frame the
    // swing (change of the bone's direction) and twist (roll about it) are split, and single-frame
    // spikes of either are reported: limb flips, roll pops, one-frame snaps
    const { getClip } = await import('../anim/clip');
    const p = game.player;
    const PLAYER_STRIKES = p.style.strikes;
    const e = spawnEnemy(params.get('enemy') ?? 'brawler', 0, -1.6);
    game.started = true;
    const want = (params.get('list') ?? '').split(',').filter(Boolean);
    const moves = PLAYER_STRIKES.flatMap((m) => [m, { ...m, clip: m.clip + '_m' }]).filter((m) => getClip(m.clip) && (!want.length || want.includes(m.clip)));
    const extra = want.filter((c) => !moves.some((m) => m.clip === c) && getClip(c));
    const PAIRS: [number, number][] = [
      [B.hips, B.spine], [B.spine, B.chest], [B.chest, B.neck], [B.neck, B.head],
      [B.uarmL, B.farmL], [B.farmL, B.handL], [B.uarmR, B.farmR], [B.farmR, B.handR],
      [B.thighL, B.shinL], [B.shinL, B.footL], [B.thighR, B.shinR], [B.shinR, B.footR], [B.footL, B.toeL], [B.footR, B.toeR],
    ];
    const NAMES = ['hips', 'spine', 'chest', 'neck', 'uarmL', 'farmL', 'uarmR', 'farmR', 'thighL', 'shinL', 'thighR', 'shinR', 'footL', 'footR'];
    const qW = new THREE.Quaternion(), qY = new THREE.Quaternion(), dq = new THREE.Quaternion();
    const Y = new THREE.Vector3(0, 1, 0);
    const out: { clip: string; worst: string[]; maxSwing: number; maxTwist: number; skate?: string; footMiss?: string; handMiss?: string; skateDump?: string; maxTwistAt?: string }[] = [];
    const runOne = (clip: string, range: string, reach: number) => {
      const back = range === 'back';
      // (as close as the player's approach would have brought it before the strike)
      const lc = getClip(clip);
      const dist = Number(params.get('dist')) || (range === 'far' ? 5 : range === 'close' ? 0.95 : range === 'back' ? reach + 0.28 : lc.footFromStart ? Math.min(1.6, reach + lc.lunge * 0.85) : 1.6);
      p.x = 0; p.z = 0; p.vx = p.vz = 0;
      p.yaw = back ? 0 : Math.PI;
      p.anim.initAt(0, 0, p.yaw);
      e.x = 0; e.z = -dist; e.vx = e.vz = 0; e.yaw = 0;
      e.anim.initAt(e.x, e.z, e.yaw);
      e.attackCooldown = 1e9;
      e.stunNow(100);
      for (let i = 0; i < 20; i++) game.step(dt);
      if (back) {
        // (the warm-up turned her to face him: a back move is for someone behind, so face away again)
        p.yaw = 0;
        p.anim.initAt(p.x, p.z, p.yaw);
        game.step(dt);
      }
      if (params.get('plan') === clip) {
        const f = (b: number) => p.anim.fk.pos[b].toArray().map((x) => x.toFixed(3)).join(',');
        console.log(`START ${clip} yaw=${p.yaw.toFixed(2)} action=${p.action} mode=${p.anim.mode} footL=${f(B.footL)} footR=${f(B.footR)} (character space)`);
      }
      const pq = (p as unknown as { play: (n: string, o: object) => unknown });
      const cpl = pq.play(clip, { target: e, reach, maxWarp: range === 'far' ? 7.5 : 4.2, back, halflife: 0.07, speed: 1.05, entryHalflife: 0.06, anySide: params.get('anyside') === '1' }) as { plannedFeet(k: number): { x: number; z: number }[]; clip: { keys: { t: number; lf: { via: boolean }; rf: { via: boolean } }[] } };
      if (params.get('plan') === clip && cpl.plannedFeet) {
        const ck = (cpl as unknown as { clip: { keys: { t: number; lf: { p: number[] }; rf: { p: number[] } }[] } }).clip.keys;
        for (let i = 0; i < Math.min(ck.length, 24); i++) {
          const L = cpl.plannedFeet(0)[i], R = cpl.plannedFeet(1)[i];
          console.log(`PLAN k${i} t=${ck[i].t.toFixed(3)} L=${L.x.toFixed(3)},${L.z.toFixed(3)} (clip y ${ck[i].lf.p[1].toFixed(3)}) R=${R.x.toFixed(3)},${R.z.toFixed(3)} (clip y ${ck[i].rf.p[1].toFixed(3)})`);
        }
      }
      // (a 'via' key plants nothing: a step through it is measured from the key before to the one after)
      (p as unknown as { __plan?: unknown }).__plan = cpl.plannedFeet
        ? {
            feet: [0, 1].map((k) => cpl.plannedFeet(k).map((v, i) => ({ x: v.x, z: v.z, via: (k === 0 ? cpl.clip.keys[i].lf : cpl.clip.keys[i].rf).via }))),
            t: cpl.clip.keys.map((k) => k.t / 1.05),
          }
        : undefined;
      (p as unknown as { action: string }).action = 'attack';
      (p as unknown as { curMove: unknown }).curMove = null;
      const prevQ = PAIRS.map(() => new THREE.Quaternion());
      const prevA = PAIRS.map(() => new THREE.Vector3());
      const sw: number[][] = [], tw: number[][] = [], times: number[] = [];
      // planted-foot slide (m/s) and IK reach shortfall of feet and hands (m)
      const footPrev = [new THREE.Vector3(), new THREE.Vector3()], footWas = [false, false];
      let skate = 0, skateT = -1, footMiss = 0, footMissT = -1, handMiss = 0, handMissT = -1, skateDump = '';
      // tail=N: keep measuring N frames into the hand-back to locomotion (spikes there show as t=-1)
      let tail = Number(params.get('tail') ?? 0);
      let locoK = 0;
      for (let f = 0; f < 150 + tail; f++) {
        game.step(dt);
        const fk = p.anim.fk;
        if (p.anim.mode === 'clip' && p.anim.clip) {
          const ct = p.anim.clip.time, pr = p.anim.clip.params;
          for (let k = 0; k < 2; k++) {
            const lp = fk.pos[k === 0 ? B.footL : B.footR];
            const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
            const wx = p.x + lp.x * c + lp.z * sn, wz = p.z - lp.x * sn + lp.z * c;
            const planted = lp.y < p.def.ankleHeight + 0.02;
            if (planted && footWas[k]) {
              const v = Math.hypot(wx - footPrev[k].x, wz - footPrev[k].z) / dt;
              if (v > skate) {
                skate = v;
                skateT = ct;
                const [ki] = p.anim.clip.segment(ct);
                const fw = p.anim.clip.plannedFeet(k);
                const keys = p.anim.clip.clip.keys;
                skateDump = `side=${k} t=${ct.toFixed(3)} v=${v.toFixed(2)} y=${lp.y.toFixed(3)} ` + [ki - 1, ki, ki + 1, ki + 2].map((i) => {
                  const j = Math.max(0, Math.min(fw.length - 1, i));
                  const ff = k === 0 ? keys[j].lf : keys[j].rf;
                  return `| k${j} t=${keys[j].t.toFixed(3)} w=${fw[j].x.toFixed(3)},${fw[j].y.toFixed(3)},${fw[j].z.toFixed(3)} c=${ff.p.map((x) => x.toFixed(3)).join(',')} p=${ff.pitch.toFixed(0)} yaw=${ff.yaw.toFixed(0)}`;
                }).join(' ');
              }
            }
            footPrev[k].set(wx, 0, wz);
            footWas[k] = planted;
            // (past the entry blend, which offsets the output from the clip's own targets)
            const m = ct > 0.12 ? pr.feet[k].pos.distanceTo(lp) : 0;
            if (m > footMiss) { footMiss = m; footMissT = ct; }
            const hm = ct > 0.12 ? pr.hands[k].pos.distanceTo(fk.pos[k === 0 ? B.handL : B.handR]) : 0;
            if (hm > handMiss) { handMiss = hm; handMissT = ct; }
          }
        }
        qY.setFromAxisAngle(Y, p.yaw);
        const sR: number[] = [], tR: number[] = [];
        PAIRS.forEach(([b, c], i) => {
          qW.copy(qY).multiply(fk.rot[b]);
          const a = new THREE.Vector3().subVectors(fk.pos[c], fk.pos[b]).applyQuaternion(qY).normalize();
          if (f > 0) {
            const swing = Math.acos(Math.min(1, Math.max(-1, a.dot(prevA[i]))));
            dq.copy(qW).multiply(prevQ[i].clone().invert());
            const vp = dq.x * a.x + dq.y * a.y + dq.z * a.z;
            const twist = 2 * Math.atan2(Math.abs(vp), Math.abs(dq.w));
            sR.push(swing / dt);
            tR.push(twist / dt);
          }
          prevQ[i].copy(qW);
          prevA[i].copy(a);
        });
        // trace=clip: around the hand-back, how far the solved source and the blended output of a few
        // bones turn per frame (a jump in the source the blend didn't absorb, or one of the blend's own)
        if (params.get('trace') === clip && (p.anim.mode !== 'clip' || (p.anim.clip && p.anim.clip.time > p.anim.clip.clip.recoverT - 0.05))) {
          const an = p.anim as unknown as { src: { q: THREE.Quaternion[] }; out: { q: THREE.Quaternion[] } };
          const tr = (window as unknown as { __tr?: Record<string, THREE.Quaternion> }).__tr ??= {};
          const row = [B.thighL, B.shinL, B.thighR, B.shinR, B.uarmL, B.uarmR, B.farmR].map((b) => {
            const s0 = tr['s' + b], o0 = tr['o' + b];
            const ds = s0 ? (2 * Math.acos(Math.min(1, Math.abs(s0.dot(an.src.q[b])))) / dt).toFixed(0) : '-';
            const dout = o0 ? (2 * Math.acos(Math.min(1, Math.abs(o0.dot(an.out.q[b])))) / dt).toFixed(0) : '-';
            tr['s' + b] = an.src.q[b].clone();
            tr['o' + b] = an.out.q[b].clone();
            return `${b}:${ds}/${dout}`;
          });
          console.log(`TRACE ${p.anim.mode} k=${p.anim.mode === 'clip' ? 'c' : locoK} ${row.join(' ')}`);
        }
        if (f > 0) {
          sw.push(sR);
          tw.push(tR);
          // (in the tail: -1 - frames since the hand-back, in thousandths)
          times.push(p.anim.mode === 'clip' && p.anim.clip ? p.anim.clip.time : -1 - 0.001 * locoK++);
        }
        // dump=clip@t0-t1: per-frame effector params and limb geometry around a spike
        const dump = params.get('dump');
        if (dump && dump.startsWith(clip + '@') && p.anim.mode === 'clip' && p.anim.clip) {
          const [t0, t1] = dump.slice(clip.length + 1).split('-').map(Number);
          const ct = p.anim.clip.time;
          if (ct >= t0 && ct <= t1) {
            const pr = p.anim.clip.params;
            const v = (x: THREE.Vector3) => `${x.x.toFixed(3)},${x.y.toFixed(3)},${x.z.toFixed(3)}`;
            const bend = (r: number, m: number, en: number) => {
              const ax = new THREE.Vector3().subVectors(fk.pos[en], fk.pos[r]).normalize();
              const bm = new THREE.Vector3().subVectors(fk.pos[m], fk.pos[r]);
              bm.addScaledVector(ax, -bm.dot(ax));
              return v(bm.normalize());
            };
            console.log(`DUMP t=${ct.toFixed(3)} hips=${v(pr.hipsPos)} | footL pos=${v(pr.feet[0].pos)} pole=${v(pr.feet[0].pole)} bend=${bend(B.thighL, B.shinL, B.footL)} | footR pos=${v(pr.feet[1].pos)} pole=${v(pr.feet[1].pole)} bend=${bend(B.thighR, B.shinR, B.footR)} | handL pos=${v(pr.hands[0].pos)} pole=${v(pr.hands[0].pole)} bend=${bend(B.uarmL, B.farmL, B.handL)} roll=${pr.hands[0].roll.toFixed(0)} | handR pos=${v(pr.hands[1].pos)} pole=${v(pr.hands[1].pole)} bend=${bend(B.uarmR, B.farmR, B.handR)} roll=${pr.hands[1].roll.toFixed(0)}`);
          }
        }
        if (p.anim.mode !== 'clip' && f > 5 && tail-- <= 0) break;
      }
      // the planned steps: the fastest a foot is asked to travel between two keys (m/s)
      let stepV = 0, stepAt = '';
      const lastPlan = (p as unknown as { __plan?: { feet: { x: number; z: number; via?: boolean }[][]; t: number[] } }).__plan;
      if (lastPlan) {
        for (let k = 0; k < 2; k++) {
          const fw = lastPlan.feet[k];
          for (let i = 0; i + 1 < fw.length; i++) {
            if (fw[i].via) continue;
            let j = i + 1;
            while (j < fw.length - 1 && fw[j].via) j++;
            const dtk = lastPlan.t[j] - lastPlan.t[i];
            if (dtk < 1e-3) continue;
            const v = Math.hypot(fw[j].x - fw[i].x, fw[j].z - fw[i].z) / dtk;
            if (v > stepV) {
              stepV = v;
              stepAt = `${k === 0 ? 'L' : 'R'}@${lastPlan.t[i].toFixed(2)}`;
            }
          }
        }
      }
      const worst: { w: number; s: string }[] = [];
      let maxSwing = 0, maxTwist = 0, maxTwistAt = '';
      for (const [kind, arr] of [['swing', sw], ['twist', tw]] as const) {
        for (let t = 1; t < arr.length - 1; t++) {
          for (let i = 0; i < PAIRS.length; i++) {
            const w = arr[t][i], nb = Math.max(arr[t - 1][i], arr[t + 1][i], 3);
            if (kind === 'swing') maxSwing = Math.max(maxSwing, w);
            else if (w > maxTwist) {
              maxTwist = w;
              maxTwistAt = `${NAMES[i]}@${times[t].toFixed(3)} (${arr[t - 1][i].toFixed(0)}/${arr[t + 1][i].toFixed(0)})`;
            }
            if (w > (kind === 'twist' ? 10 : 14) && w > 2.4 * nb) worst.push({ w, s: `${NAMES[i]} ${kind} ${w.toFixed(0)} (${arr[t - 1][i].toFixed(0)}/${arr[t + 1][i].toFixed(0)}) t=${times[t].toFixed(3)}` });
          }
        }
      }
      worst.sort((a, b) => b.w - a.w);
      out.push({ clip, stepV: +stepV.toFixed(1), stepAt, worst: worst.slice(0, 6).map((x) => x.s), maxSwing: +maxSwing.toFixed(0), maxTwist: +maxTwist.toFixed(0), skate: `${skate.toFixed(2)}@${skateT.toFixed(2)}`, footMiss: `${footMiss.toFixed(3)}@${footMissT.toFixed(2)}`, handMiss: `${handMiss.toFixed(3)}@${handMissT.toFixed(2)}`, skateDump: skate > 1 ? skateDump : undefined, maxTwistAt } as (typeof out)[number]);
    };
    for (const m of moves) runOne(m.clip, m.range, m.reach);
    for (const c of extra) runOne(c, 'mid', 0.9);
    console.log('CLIPS ' + JSON.stringify(out));
  }
  if (name === 'wounds') {
    // a beaten face and body up close: cuts, a bloody nose, bruises
    const key = params.get('enemy') ?? 'brawler';
    const e = spawnEnemy(key, 0, -0.6);
    game.started = true;
    e.attackCooldown = 1e9;
    // a still, relaxed subject (no AI, hands down)
    (e as unknown as { think: (dt: number) => void }).think = () => {
      e.vx = e.vz = 0;
      e.anim.locoIn.style = 'relaxed';
      e.anim.locoIn.guard = 0;
      e.anim.locoIn.look = 0;
    };
    for (let i = 0; i < 30; i++) game.step(dt);
    const P = (name: string, x: number, y: number, z: number) => {
      const v = new THREE.Vector3();
      e.bodyPoint(name, v);
      // offsets in the fighter's facing frame
      const c = Math.cos(e.yaw), sn = Math.sin(e.yaw);
      return v.add(new THREE.Vector3(x * c + z * sn, y, -x * sn + z * c));
    };
    const beat = Number(params.get('beat') ?? 1);
    if (params.get('all') === '1') {
      // large wounds and bruises everywhere: whichever way the body lands, they must show
      for (const b of [B.head, B.chest, B.spine, B.hips, B.uarmL, B.uarmR, B.farmL, B.farmR, B.thighL, B.thighR, B.shinL, B.shinR]) {
        const v = new THREE.Vector3();
        e.anim.boneWorld(b, v);
        for (const off of [[0, 0, 0.12], [0, 0, -0.12], [0.1, 0, 0], [-0.1, 0, 0]]) {
          const c2 = Math.cos(e.yaw), sn2 = Math.sin(e.yaw);
          const p = v.clone().add(new THREE.Vector3(off[0] * c2 + off[2] * sn2, 0.03, -off[0] * sn2 + off[2] * c2));
          e.woundAt(p, b === B.head || b === B.chest ? 1 : 0, 0.09, 1, b === B.head ? 0.1 : 0);
        }
      }
    }
    if (beat > 0) {
      e.woundAt(P('head', 0.035, 0.0, 0.02), 0, 0.025, 1, 0.12); // split brow
      e.woundAt(P('jaw', 0.0, 0.035, 0.01), 0, 0.02, 0.9, 0.1); // bloody nose
      e.woundAt(P('head', -0.045, -0.03, 0.0), 1, 0.05, 0.9); // swollen cheek
      e.woundAt(P('head', 0.04, 0.01, 0.0), 1, 0.04, 0.8); // black eye
      e.woundAt(P('jaw', -0.03, -0.01, 0.0), 0, 0.018, 0.8, 0.06); // split lip
      e.woundAt(P('chest', 0.06, 0.0, 0.0), 1, 0.08, 0.9); // ribs
      e.woundAt(P('gut', -0.05, 0.02, 0.0), 1, 0.07, 0.8);
      e.woundAt(P('chest', -0.08, 0.05, 0.0), 2, 0.08, 0.8);
    }
    for (let i = 0; i < Number(params.get('wait') ?? 60); i++) game.step(dt);
    const c = game.cam.camera;
    const look = new THREE.Vector3();
    e.bodyPoint(params.get('at') ?? 'head', look);
    if (params.get('kill') === '1') {
      // kill it and wait for the body to settle and bake into a corpse; then look at its head
      const dir = new THREE.Vector3(0, 0, -1);
      const hit = makeHit({ dir, point: look.clone(), damage: 500, strength: 0.6, kind: 'punch', region: 'head', attacker: game.player });
      e.takeHit(hit);
      const head = new THREE.Vector3();
      for (let i = 0; i < 900 && game.death.dying.length > 0; i++) {
        game.step(dt);
        if (game.death.dying.length) e.anim.boneWorld(B.head, head);
      }
      console.log(`corpses=${game.corpses.count} dying=${game.death.dying.length}`);
      const cs = game.corpses as unknown as { records: { wounds: unknown[] }[]; woundData: Float32Array; woundTex: THREE.DataTexture; corpseUniforms: { uCorpseWounds: { value: THREE.DataTexture } } };
      const rec = cs.records[cs.records.length - 1];
      console.log(`corpse wounds=${rec?.wounds.length} row0=${Array.from(cs.woundData.slice(0, 8)).map((x) => x.toFixed(3)).join(',')} texSame=${cs.corpseUniforms.uCorpseWounds.value === cs.woundTex} live=${e.model.wounds.length}`);
      look.copy(head);
    }
    const dist = Number(params.get('dist') ?? 0.75);
    const ang = e.yaw + Number(params.get('ang') ?? 0.35);
    c.position.set(look.x + Math.sin(ang) * dist, look.y + Number(params.get('up') ?? 0.05), look.z + Math.cos(ang) * dist);
    c.lookAt(look);
    game.renderFrame();
  }
  if (name === 'pools') {
    // blood pools spreading and running along the floor, seen from above
    const cx = Number(params.get('x') ?? 0), cz = Number(params.get('z') ?? 0);
    const n = Number(params.get('n') ?? 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      game.blood.addPool(cx + Math.cos(a) * 1.1, cz + Math.sin(a) * 1.1, 0.35 + (i % 3) * 0.12, 9 + i * 2, i * 0.4);
    }
    game.player.x = cx + 6;
    game.player.z = cz + 6;
    if (params.get('manual') === '1') game.blood.addRivulet(cx - 1.5, cz - 1.6, 1, 0, 1.6, 0.025, 0.2, 0);
    for (let i = 0; i < frames; i++) {
      game.step(dt);
      if (i % 120 === 0) console.log(`t=${(i * dt).toFixed(1)} pools=${game.blood.pools.length} rivulets=${game.blood.rivulets.length} log=${game.blood.logCount} ` + game.blood.rivulets.slice(0, 3).map((r) => `[${r.x.toFixed(2)},${r.z.toFixed(2)} vol=${r.vol.toFixed(2)} w=${r.w0.toFixed(3)} d=${r.delay.toFixed(1)}]`).join(' '));
    }
    const c = game.cam.camera;
    const h = Number(params.get('h') ?? 4.5);
    c.position.set(cx + 0.01, h, cz + Number(params.get('tilt') ?? 1.2));
    c.lookAt(cx, 0, cz);
    game.renderFrame();
    result.rivulets = game.blood.rivulets.length;
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
    // cost of fresh active ragdolls falling into the crowded floor (lab world now holds every corpse)
    const ec = game.euphoria.counters;
    const before = { steps: ec.steps, ms: ec.stepMsTotal };
    const keys2 = Object.keys(ARCHETYPES).filter((k) => !ARCHETYPES[k].boss);
    const late: Enemy[] = [];
    for (let i = 0; i < 6; i++) late.push(spawnEnemy(keys2[i % keys2.length], rand(-6, 6), rand(-6, 6)));
    for (let i = 0; i < 2; i++) game.step(dt);
    for (const e of late) {
      e.hp = 1;
      e.takeHit(makeHit({ dir: new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize(), point: new THREE.Vector3(e.x, 1.6, e.z), damage: 50, strength: 1, attacker: game.player }));
    }
    const ftimes: number[] = [];
    for (let i = 0; i < 120; i++) {
      const a = performance.now();
      game.step(dt);
      ftimes.push(performance.now() - a);
    }
    ftimes.sort((a, b) => a - b);
    result.activeFrameMsMedian = +ftimes[60].toFixed(2);
    result.activeFrameMsP90 = +ftimes[108].toFixed(2);
    result.euphoriaAfterPile = { steps: ec.steps - before.steps, avgStepMs: +((ec.stepMsTotal - before.ms) / Math.max(1, ec.steps - before.steps)).toFixed(3), statics: game.euphoria.staticCount, bodies: game.euphoria.world.bodies.length };
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
