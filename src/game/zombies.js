// Zombie survival: you (and any bot teammates) start with $16000 and hold out
// against endless, growing waves of zombies until you die.
//  - waves: a 12 s break to buy before the first, 15 s between waves (the difficulty's);
//    buying works anywhere, any time; a cleared wave pays a bonus and patches you up a little
//  - each wave brings more zombies, with more health, more damage and, from wave 3,
//    runners faster than a knife; at most 12 are up at once (zdiff.js waveStats)
//  - the difficulty (zdiff.js, from the New Game options) is this.diff; what happens in a
//    run goes out on this.events and is tallied in this.runStats (runstats.js)
//  - zombies are Player objects on the T side (hitboxes, blood, wounds, ragdolls and
//    the kill feed work as for players) that walk through each other but not through
//    people; they hunt along a flow field over the bots' nav graph toward the nearest
//    survivor and claw whoever they reach
// game.js / rounds.js hand the mode its ticks, kills and buy / spawn rules.
import { Player, TEAM_T, TEAM_CT } from './player.js';
import { createPlayerModel } from '../assets/playermodels.js';
import { setDynamicBox, CONTENTS_SOLID, CONTENTS_PLAYERCLIP, CONTENTS_PLAYER, CONTENTS_ZOMBIE } from '../engine/collision.js';
import { IN_JUMP } from '../engine/pmove.js';
import { MinHeap } from './nav.js';
import * as CR from './combatrules.js';
import { Specials } from './specials.js';
import { waveStats, zombieOptions, resolveDiff } from './zdiff.js';
import { RunEvents, RunStats } from './runstats.js';
import { ZEconomy } from './zeconomy.js';
import { ZDowned } from './zdowned.js';
import { ZFeedback } from './zfeedback.js';

export { waveStats };

/** Zombies move through each other but not through people; people bump into both. */
export const MASK_ZOMBIE_MOVE = CONTENTS_SOLID | CONTENTS_PLAYERCLIP | CONTENTS_PLAYER;
export const MASK_HUMAN_MOVE = MASK_ZOMBIE_MOVE | CONTENTS_ZOMBIE;

export const ZOMBIE_START_MONEY = 16000;
const POOL = 20; // zombie bodies reused wave after wave (a model each)
const CORPSE_TIME = 4; // a body lies at least this long before its zombie comes back
const REACH = 46; // start a swipe within this (horizontal, hull edge to hull edge ~14)
const HIT_RANGE = 72; // the swipe lands if still within this when it comes down
const WINDUP = 0.3, COOLDOWN = 0.95;
const BEST_KEY = 'cs16-zombies-best';

const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => ((a - b) % 360 + 540) % 360 - 180;

export class ZombieMode {
  constructor(game) {
    this.game = game;
    this.enabled = false;
    this.state = 'idle'; // idle | break | wave | over
    this.wave = 0;
    this.pool = [];
    this.dist = null;
    this.rev = null;
    this.cands = null;
    this.specials = new Specials(game);
    this.events = new RunEvents(game);
    this.runStats = new RunStats(game, this.events);
    // Milestone 1 features, a module each (they hook in through events, tick and hud)
    this.economy = new ZEconomy(game);
    this.downed = new ZDowned(game);
    this.feedback = new ZFeedback(game);
    this.configure({});
    this.best = this.bestBefore = this.loadBest();
  }

  /** New Game options: the mode, and the difficulty with its options (zdiff.js). */
  configure(opts) {
    this.enabled = opts.mode === 'zombies';
    this.opts = zombieOptions(opts);
    this.diff = resolveDiff(this.opts);
  }

  /** What waveStats scales with: the difficulty, and the squad (humans + botCrowd x bots). */
  waveOpts() {
    let crowd = 0;
    for (const p of this.game.players) if (p.team === TEAM_CT && !p.isZombie) crowd += p.isBot ? this.diff.horde.botCrowd : 1;
    return { diff: this.diff, crowd: Math.max(1, crowd) };
  }

  // ---------------------------------------------------------------- game flow
  /** A new zombie game (RoundManager.startMatch). */
  start() {
    const g = this.game;
    this.pool = [];
    this.wave = 0;
    this.kills = 0; // yours
    this.squadKills = 0; // everybody's on your side
    this.killed = 0; // of this wave's count
    this.spawned = 0;
    this.survived = 0;
    this.state = 'break';
    this.nextWaveAt = g.time + this.diff.firstBreak;
    this.flowAt = 0;
    this.overAt = 0;
    this.best = this.bestBefore = this.loadBest(); // (a new best is measured against this)
    this.stats = waveStats(1, this.waveOpts());
    g.rounds.removeBomb();
    g.clearDropped();
    g.grenades.clear();
    g.effects.clearBlood?.();
    g.mapEnts?.reset();
    g.hostages?.reset(); // (disabled in this mode: clears any left over)
    g.bosses?.clear();
    this.specials.clear();
    g.explosives?.clear();
    this.bossAt = 0;
    g.spectate = { mode: 'free', angles: [20, 90, 0] };
    g.hud?.centerPrint?.(`Zombie survival (${this.diff.label})\nBuy anything, anywhere. The first wave comes in ${this.diff.firstBreak} seconds.`, 6);
    g.bots.onRoundStart();
    this.events.mode('run', { phase: 'start', wave: 0, diff: this.diff.id });
  }

  /** Joining a team spawns you only before the first wave (no respawns after that). */
  canSpawnLate() { return this.state === 'break' && this.wave === 0; }

  startWave(n) {
    const g = this.game;
    this.wave = n;
    this.stats = waveStats(n, this.waveOpts());
    this.spawned = 0;
    this.killed = 0;
    this.state = 'wave';
    this.nextSpawn = g.time + 1;
    // every 5th wave: a boss (and half the usual crowd)
    this.bossWave = n % 5 === 0;
    if (this.bossWave) { this.stats = { ...this.stats, count: Math.ceil(this.stats.count * 0.5) }; this.bossAt = g.time + 3; }
    // bot teammates who fell come back for the next wave
    for (const p of g.players) {
      if (p.team === TEAM_CT && p.isBot && !p.alive) {
        p.weapons = { 1: null, 2: null, 3: null, 4: [], 5: null };
        g.spawnPlayer(p);
      }
    }
    if (n > 1) g.bots.onRoundStart();
    g.hud?.centerPrint?.(this.bossWave ? `WAVE ${n}\nSomething big is coming...` : `WAVE ${n}`, 3);
    g.sound?.play('zombie_wave', { volume: 1, attenuation: 'none' });
    g.announce?.(`Wave ${n}`);
    this.events.mode('wave', { phase: 'start', wave: n, boss: this.bossWave, count: this.stats.count });
  }

  waveCleared() {
    const g = this.game;
    this.state = 'break';
    const brk = this.diff.breakLen;
    this.nextWaveAt = g.time + brk;
    const bonus = this.stats.bonus, heal = this.diff.econ.waveHeal;
    for (const p of g.players) {
      if (p.team !== TEAM_CT || !p.alive) continue;
      g.rounds.addMoney(p, bonus);
      p.health = Math.min(100, p.health + heal);
    }
    g.hud?.centerPrint?.(`Wave ${this.wave} cleared!\n+$${bonus}${heal ? `, +${heal} health` : ''}. Next wave in ${brk} seconds.`, 5);
    g.sound?.play('radio_beep', { volume: 0.6 });
    this.saveBest(this.wave);
    this.events.mode('wave', { phase: 'cleared', wave: this.wave, boss: this.bossWave, count: this.stats.count, bonus, heal });
  }

  gameOver() {
    const g = this.game;
    if (this.state === 'over') return;
    // dying in a break, the wave before it was cleared: it counts
    this.survived = this.state === 'break' ? this.wave : Math.max(0, this.wave - 1);
    this.state = 'over';
    this.overAt = g.time;
    this.saveBest(this.survived);
    g.hud?.centerPrint?.(`GAME OVER\nYou survived ${this.survived} wave${this.survived === 1 ? '' : 's'} and killed ${this.kills} zombies.`, 8);
    this.events.mode('run', { phase: 'over', diff: this.diff.id, survived: this.survived, kills: this.kills });
  }

  /** Records: the most waves survived. A new best beats bestBefore (the best when the run began). */
  isNewBest() { return this.survived > this.bestBefore; }

  loadBest() {
    try { return +(localStorage.getItem(BEST_KEY) || 0) || 0; } catch { return 0; } // (storage blocked)
  }

  saveBest(waves) {
    if (waves <= this.best) return;
    this.best = waves;
    try { localStorage.setItem(BEST_KEY, String(waves)); } catch { /* storage blocked */ }
  }

  /** Per tick, after everyone moved (RoundManager.tick). */
  tick() {
    const g = this.game, t = g.time;
    this.economy.tick(t);
    this.downed.tick(t);
    this.feedback.tick(t);
    if (this.state === 'break' && t >= this.nextWaveAt) this.startWave(this.wave + 1);
    if (this.state !== 'wave') return;
    const S = this.stats;
    if (this.bossAt && t >= this.bossAt) { if (this.game.bosses.spawn(this.wave)) this.bossAt = 0; else this.bossAt = t + 1; }
    let alive = 0;
    for (const z of this.pool) if (z.alive) alive++;
    if (this.spawned < S.count && alive < S.maxAlive && t >= this.nextSpawn) {
      const n0 = this.spawned;
      const kind = this.specials.pick(this.wave);
      // (a sprinter pack never takes the wave past its count)
      if (kind) this.spawned += this.specials.spawn(kind, { max: S.count - this.spawned }) || (this.spawnZombie() ? 1 : 0);
      else if (this.spawnZombie()) this.spawned++;
      alive += this.spawned - n0; // (the last of the wave just came up: not cleared yet)
      this.nextSpawn = t + S.interval * rand(0.6, 1.4);
    }
    if (this.spawned >= S.count && alive === 0 && !this.bossAt && !this.game.bosses.alive()) this.waveCleared();
  }

  /** RoundManager.onPlayerKilled */
  onKilled(victim, attacker) {
    if (victim.isZombie) {
      if (attacker && attacker === this.game.local) this.kills++; // (yours: the record)
      if (attacker && attacker.team === TEAM_CT && !attacker.isZombie) this.squadKills++;
    }
    if (victim.isBoss) {
      this.game.bosses.onKilled(victim, attacker);
      const B = victim.boss;
      this.events.mode('boss', { phase: 'death', id: B?.def.id, name: B?.def.name, boss: victim, attacker: attacker || null });
      return;
    }
    if (victim.isZombie) {
      if (victim.special) {
        this.specials.onDeath(victim, attacker);
        this.events.mode('special', { phase: 'death', kind: victim.special, zombie: victim, attacker: attacker || null });
      }
      if (!victim.extra) this.killed++;
      return;
    }
    if (victim === this.game.local) this.gameOver();
  }

  humans() { return this.game.players.filter((p) => p.alive && p.team === TEAM_CT); }

  /**
   * A key bind or console command the stock game doesn't handle (F1 is 'autobuy', N
   * 'nightvision'; typed ones like 'zm_ready'), from player p: the features get a look.
   * Returns true when one of them took it.
   */
  command(p, cmd, args = []) {
    return this.economy.command(p, cmd, args) || this.downed.command(p, cmd, args) || this.feedback.command(p, cmd, args);
  }

  hudInfo() {
    const S = this.stats || waveStats(1, this.waveOpts());
    const t = this.game.time;
    let extras = 0;
    for (const z of this.pool) if (z.alive && z.extra) extras++;
    return {
      wave: this.wave,
      state: this.state,
      boss: this.game.bosses?.hudInfo() || null,
      left: this.state === 'wave' ? Math.max(0, S.count - this.killed) : 0, // of the wave's count
      extras: this.state === 'wave' ? extras : 0, // summoned ones up (bile hordes, broods, packs): on top
      next: this.state === 'break' ? Math.max(0, this.nextWaveAt - t) : null,
      kills: this.kills,
      squadKills: this.squadKills,
      best: this.best,
      diff: this.diff.label,
      hardcore: this.diff.hardcore,
    };
  }

  /** Take every zombie (and the boss) off the map at once: no kills, no bodies (cheats, skips). */
  clearHorde() {
    for (const z of this.pool) if (z.alive) this.despawn(z);
    this.game.bosses?.despawn();
    this.bossAt = 0;
  }

  despawn(z) {
    const S = z.sp;
    if (S?.victim) { if (z.special === 'hunter') this.specials.unpin(z); else if (z.special === 'smoker') this.specials.release(z); }
    this.game.stopWeaponLoops(z);
    z.alive = false;
    z.health = 0;
    z.deathTime = 0; // (free for the next spawn; nothing left lying)
    z.cmd = null;
    z.box.active = false;
    if (z.model) z.model.object3D.visible = false;
  }

  // ---------------------------------------------------------------- zombies
  makeZombie() {
    const g = this.game;
    const z = new Player({ name: 'Zombie', team: TEAM_T, skin: 'zombie', isBot: true });
    z.isZombie = true;
    g.addPlayer(z);
    z.box.contents = CONTENTS_ZOMBIE;
    z.model = createPlayerModel('zombie');
    z.model.object3D.visible = false;
    g.renderer.world.add(z.model.object3D);
    this.pool.push(z);
    return z;
  }

  /**
   * Bring a zombie in. o: { at: [x,y,z] origin, near: [x,y,z] (a nav spot close by),
   * health, speed, crawler (small and fast), risen (climbs out of the ground) }. Zombies
   * placed with at / near are extras (summoned by bosses): not counted in the wave.
   */
  spawnZombie(o = {}) {
    const g = this.game, t = g.time;
    let z = o.use || this.pool.find((q) => !q.special && !q.alive && (!q.deathTime || q.baked || q.gibbed || t - q.deathTime > CORPSE_TIME));
    if (!z) {
      if (this.pool.filter((q) => !q.special).length >= POOL) return false;
      z = this.makeZombie();
    }
    let pos;
    if (o.at) pos = o.at.slice();
    else {
      const n = o.near ? this.pickNear(o.near) : this.pickSpawn();
      if (!n) return false;
      pos = [n.x, n.y, n.z + 37];
    }
    // the last body this zombie left stays where it fell
    if (z.deathTime && !z.baked && !z.gibbed) g.gore?.bakePlayer(z);
    z.baked = z.gibbed = false;
    z.char = 0;
    z.burn = null;
    z.extra = !o.special && !!(o.at || o.near);
    z.sp = null; z.visualCrouch = false; z.pm.speedCap = null; z.speedNow = null;
    const humans = this.humans();
    const h = humans[0];
    const yaw = h ? Math.atan2(h.pm.origin[1] - pos[1], h.pm.origin[0] - pos[0]) * 180 / Math.PI : Math.random() * 360;
    const S = this.stats;
    z.resetForSpawn(pos, yaw);
    z.health = z.maxHealth = o.health ?? S.health;
    z.armor = 0; z.helmet = false;
    z.weapons = { 1: null, 2: null, 3: null, 4: [], 5: null };
    z.active = null;
    z.deathTime = 0;
    z.lastHurt = 0;
    z.zSpeed = o.speed ?? (Math.random() < S.runners ? rand(262, 280) : S.speed * rand(0.9, 1.06));
    z.zDamage = S.damage;
    z.target = null; z.targetT = 0;
    z.node = null; z.nodeT = 0;
    z.goal = null; z.goalT = 0;
    z.windup = 0; z.nextAttack = t + 0.5;
    z.progPos = z.pm.origin.slice(); z.progT = t; z.stuckSince = 0;
    z.nextGrowl = t + rand(0.5, 4);
    z.model.reset();
    z.model.object3D.scale.setScalar(o.crawler ? 0.8 : 1);
    z.model.object3D.visible = true;
    if (o.at || o.near) {
      // climbing out of the ground / out of the pack
      for (let i = 0; i < 12; i++) g.fire?.emit(o.risen ? 'mist' : 'dust', [pos[0] + rand(-20, 20), pos[1] + rand(-20, 20), pos[2] - 34], [rand(-60, 60), rand(-60, 60), rand(20, 90)], { life: 1, size: 18, size1: 44, drag: 2 });
      if (o.risen) g.sound?.play('zombie_idle', { pos, volume: 1, channel: `${z.id}:voice` });
    }
    z.deadBodyVisible = false;
    z.box.active = true;
    setDynamicBox(z.box, z.pm.origin, z.hull().mins, z.hull().maxs);
    return true;
  }

  /** Nav nodes good for spawning: open floor, not ledges. */
  spawnCandidates() {
    if (this.cands) return this.cands;
    const nodes = this.game.nav.nodes;
    let c = nodes.filter((n) => n.edges.length >= 6 && (n.support ?? 5) >= 3);
    if (c.length < 20) c = nodes.slice();
    const step = Math.max(1, Math.floor(c.length / 1500));
    this.cands = c.filter((_, i) => i % step === 0);
    return this.cands;
  }

  /** A nav spot 100-380 units (walking) from pos. */
  pickNear(pos) {
    const nav = this.game.nav;
    const start = nav.nearest([pos[0], pos[1], pos[2] - 36], 200) || nav.nearestXY([pos[0], pos[1], pos[2] - 36], 300, 120);
    if (!start) return null;
    const ring = nav.around(start, 380, 300).filter((x) => x.dist > 100);
    return ring.length ? ring[Math.floor(Math.random() * ring.length)].node : start;
  }

  /** Out of sight of every survivor, 700+ units away, and with a way to them. */
  pickSpawn() {
    const g = this.game, cands = this.spawnCandidates();
    if (!cands.length) return null;
    const humans = this.humans();
    const eyes = humans.map((h) => h.eyePos());
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 40; i++) {
      const n = cands[Math.floor(Math.random() * cands.length)];
      let dmin = Infinity;
      for (const h of humans) dmin = Math.min(dmin, Math.hypot(h.pm.origin[0] - n.x, h.pm.origin[1] - n.y, (h.pm.origin[2] - n.z) * 2));
      if (dmin < 700) continue;
      const pd = this.dist ? this.dist[n.id] : 0;
      if (!(pd < Infinity)) continue; // can't reach anybody from there
      const head = [n.x, n.y, n.z + 64];
      if (eyes.some((e) => g.visible(e, head))) continue;
      // closer (by path) is better: they come at you sooner
      const score = -Math.abs(pd - 1400) - (dmin > 3500 ? 1000 : 0);
      if (score > bestScore) { bestScore = score; best = n; }
      if (score > -400) break;
    }
    return best;
  }

  // ---------------------------------------------------------------- flow field
  /** Path distance from every nav node to the nearest survivor (Dijkstra on the reversed graph). */
  buildFlow() {
    const g = this.game, nav = g.nav, nodes = nav.nodes, N = nodes.length;
    if (!N) return;
    if (!this.rev) {
      this.rev = nodes.map(() => []);
      for (const n of nodes) for (const e of n.edges) this.rev[e.to].push({ from: n.id, cost: e.cost + nodes[e.to].wallPenalty });
      this.dist = new Float32Array(N).fill(Infinity);
    }
    const dist = this.dist;
    dist.fill(Infinity);
    const heap = new MinHeap();
    for (const h of this.humans()) {
      const f = h.feet();
      const n = nav.nearest(f, 160) || nav.nearestXY(f, 260, 120);
      if (!n) continue;
      dist[n.id] = 0;
      heap.push(n.id, 0);
    }
    while (heap.size) {
      const id = heap.pop();
      const d = dist[id];
      for (const r of this.rev[id]) {
        const nd = d + r.cost;
        if (nd < dist[r.from]) { dist[r.from] = nd; heap.push(r.from, nd); }
      }
    }
  }

  /** The neighbour of n on the shortest way to a survivor (and the edge to it). */
  nextHop(n) {
    const nodes = this.game.nav.nodes, dist = this.dist;
    let best = null, bd = Infinity, be = null;
    for (const e of n.edges) {
      if (!(dist[e.to] < dist[n.id])) continue; // only ever downhill
      const d = e.cost + nodes[e.to].wallPenalty + dist[e.to];
      if (d < bd) { bd = d; best = nodes[e.to]; be = e; }
    }
    return best ? { node: best, edge: be } : null;
  }

  // ---------------------------------------------------------------- AI
  /** Movement / attack commands for every zombie (before the players move). */
  think() {
    if (!this.enabled) return;
    const g = this.game, t = g.time;
    if (t >= this.flowAt && this.state !== 'over') { this.flowAt = t + 0.4; this.buildFlow(); }
    g.bosses?.think();
    const humans = this.humans();
    for (const z of this.pool) {
      if (!z.alive) { z.cmd = null; continue; }
      const cmd = { forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: 0 };
      z.cmd = cmd;
      this.growl(z, t);
      const target = this.pickTarget(z, humans, t);
      if (!target) { z.pm.angles[0] = 0; continue; }
      if (z.special && this.specials.think(z, target, cmd, t)) continue; // its own trick this tick
      this.chase(z, target, cmd, t);
      this.separate(z, cmd);
      this.attack(z, target, cmd, t);
    }
  }

  growl(z, t) {
    if (t < z.nextGrowl) return;
    z.nextGrowl = t + rand(3, 8);
    const cam = this.game.camPos;
    if (cam && Math.hypot(z.pm.origin[0] - cam[0], z.pm.origin[1] - cam[1]) > 1800) return;
    this.game.sound?.play((z.special && this.specials.idleSound(z)) || 'zombie_idle', { pos: z.eyePos(), volume: 0.85, channel: `${z.id}:voice` });
  }

  pickTarget(z, humans, t) {
    if (z.target && z.target.alive && t < z.targetT) return z.target;
    let best = null, bd = Infinity;
    for (const h of humans) {
      // loud guns draw them (a suppressor doesn't)
      const loud = t - (h.lastLoud ?? -99) < 2 ? 0.8 : 1;
      const d = Math.hypot(h.pm.origin[0] - z.pm.origin[0], h.pm.origin[1] - z.pm.origin[1], (h.pm.origin[2] - z.pm.origin[2]) * 1.5) * this.specials.lure(h, t) * loud;
      if (d < bd) { bd = d; best = h; }
    }
    z.target = best;
    z.targetT = t + 1;
    return best;
  }

  chase(z, target, cmd, t) {
    const g = this.game, nav = g.nav;
    const feet = z.feet(), tf = target.feet();
    const dx = tf[0] - feet[0], dy = tf[1] - feet[1], dz = tf[2] - feet[2];
    const dxy = Math.hypot(dx, dy);
    // close and nothing in between: straight at him; otherwise down the flow field
    if (!z.goal || t >= z.goalT || Math.hypot(z.goal[0] - feet[0], z.goal[1] - feet[1]) < 20) {
      z.goalT = t + 0.3;
      z.jumpGoal = false;
      if (dxy < 420 && Math.abs(dz) < 48 && nav.canWalk(feet, tf)) z.goal = tf.slice();
      else z.goal = this.flowGoal(z, feet, t) || tf.slice();
    }
    const goal = z.goal;
    const yaw = Math.atan2(goal[1] - feet[1], goal[0] - feet[0]) * 180 / Math.PI;
    const turn = angDiff(yaw, z.pm.angles[1]);
    const maxTurn = 9; // per tick (900 deg/s)
    z.pm.angles[1] += Math.max(-maxTurn, Math.min(maxTurn, turn));
    z.pm.angles[0] = 0;
    cmd.forwardmove = Math.abs(turn) > 100 ? 60 : 400;
    if (z.jumpGoal && goal[2] - feet[2] > 12 && z.pm.onground) cmd.buttons |= IN_JUMP;
    // stuck: hop, then give up and come back somewhere else (out of sight)
    if (Math.hypot(z.pm.origin[0] - z.progPos[0], z.pm.origin[1] - z.progPos[1]) > 24) {
      z.progPos = z.pm.origin.slice(); z.progT = t; z.stuckSince = 0;
    } else if (t - z.progT > 1.0 && dxy > REACH + 20) {
      if (z.pm.onground) cmd.buttons |= IN_JUMP;
      z.progT = t;
      z.goalT = 0;
      z.careful = t + 2.5; // node by node for a while (ledges, drops, tight corners)
      z.stuckSince = z.stuckSince || t;
      if (z.isBoss) { if (t - z.stuckSince > 4) this.nudge(z, t); }
      else if (t - z.stuckSince > 6 && !this.humans().some((h) => g.visible(h.eyePos(), z.eyePos()))) this.recycle(z);
    }
  }

  /** A point a few hops down the flow field that can be walked to in a straight line. */
  flowGoal(z, feet, t) {
    const nav = this.game.nav;
    if (!this.dist) return null;
    if (!z.node || t >= z.nodeT || Math.hypot(z.node.x - feet[0], z.node.y - feet[1]) > 40) {
      z.node = nav.nearest(feet, 120) || nav.nearestXY(feet, 200, 80);
      z.nodeT = t + 0.25;
    }
    if (!z.node) return null;
    const chain = [];
    let n = z.node, jump = false;
    for (let i = 0; i < 7; i++) {
      const h = this.nextHop(n);
      if (!h) break;
      chain.push(h.node);
      if (i === 0 && h.edge.kind === 'jump') jump = true;
      if (h.edge.kind === 'jump') break; // a jump is taken one hop at a time
      n = h.node;
    }
    if (!chain.length) return null;
    z.jumpGoal = jump;
    if (t < (z.careful || 0)) { const q = chain[0]; return [q.x, q.y, q.z]; }
    for (const k of [chain.length - 1, Math.min(chain.length - 1, 3)]) {
      if (k <= 0) break;
      const q = chain[k];
      if (nav.canWalk(feet, [q.x, q.y, q.z])) return [q.x, q.y, q.z];
    }
    const q = chain[0];
    return [q.x, q.y, q.z];
  }

  /** Zombies walk through each other: spread them out sideways so they don't merge. */
  separate(z, cmd) {
    const o = z.pm.origin;
    let ax = 0, ay = 0;
    for (const q of this.pool) {
      if (q === z || !q.alive) continue;
      const dx = o[0] - q.pm.origin[0], dy = o[1] - q.pm.origin[1];
      const d = Math.hypot(dx, dy);
      if (d > 40 || Math.abs(o[2] - q.pm.origin[2]) > 60) continue;
      const w = (40 - d) / 40;
      if (d < 0.5) { ax += Math.cos(z.id) * w; ay += Math.sin(z.id) * w; } else { ax += dx / d * w; ay += dy / d * w; }
    }
    if (!ax && !ay) return;
    const y = z.pm.angles[1] * Math.PI / 180;
    // sidemove is +right: right vector = (sin y, -cos y)
    const side = ax * Math.sin(y) - ay * Math.cos(y);
    cmd.sidemove = Math.max(-250, Math.min(250, side * 400));
  }

  attack(z, target, cmd, t) {
    const g = this.game;
    const o = z.pm.origin, to = target.pm.origin;
    const dxy = Math.hypot(to[0] - o[0], to[1] - o[1]);
    const dz = to[2] - o[2];
    const onHead = dxy < 40 && dz > 40 && dz < 92; // somebody standing on its head gets clawed (and shoved off)
    const close = (dxy < 32 + REACH && Math.abs(dz) < 56) || onHead;
    if (close) {
      const eye = z.eyePos(), te = target.eyePos();
      z.pm.angles[1] = Math.atan2(to[1] - o[1], to[0] - o[0]) * 180 / Math.PI;
      z.pm.angles[0] = Math.max(-30, Math.min(30, -Math.atan2(te[2] - 10 - eye[2], dxy) * 180 / Math.PI));
      if (dxy < 36) cmd.forwardmove = 0;
      if (!z.windup && t >= z.nextAttack && this.state !== 'over') {
        z.windup = t + WINDUP;
        z.lastShot = t; // the model's swipe
        g.sound?.play('zombie_attack', { pos: eye, volume: 0.9, channel: `${z.id}:voice` });
      }
    }
    if (z.windup && t >= z.windup) {
      z.windup = 0;
      z.nextAttack = t + COOLDOWN;
      const eye = z.eyePos();
      const chest = [to[0], to[1], to[2] + 10];
      const d = Math.hypot(chest[0] - eye[0], chest[1] - eye[1], chest[2] - eye[2]);
      const y = z.pm.angles[1] * Math.PI / 180;
      const facing = ((chest[0] - o[0]) * Math.cos(y) + (chest[1] - o[1]) * Math.sin(y)) / Math.max(1, dxy);
      if (target.alive && d < HIT_RANGE && (facing > 0.4 || dxy < 24) && g.visible(eye, chest)) {
        const dir = [(chest[0] - eye[0]) / d, (chest[1] - eye[1]) / d, (chest[2] - eye[2]) / d];
        const point = [chest[0] - dir[0] * 12, chest[1] - dir[1] * 12, chest[2] - dir[2] * 12];
        g.damagePlayer(target, z, z.zDamage, CR.HITGROUP.CHEST, 'zombie', dir, point);
        // a claw staggers less than a bullet's "tagging" (you can still run for it)
        target.pm.velocityModifier = Math.max(target.pm.velocityModifier ?? 1, 0.8);
        if (dz > 40 && dxy < 40) { const a = dxy > 1 ? Math.atan2(to[1] - o[1], to[0] - o[0]) : y; target.pm.velocity[0] += Math.cos(a) * 220; target.pm.velocity[1] += Math.sin(a) * 220; target.pm.velocity[2] += 120; }
      } else {
        g.sound?.play('knife_slash', { pos: eye, volume: 0.6 });
      }
    }
  }

  /** A boss that can't get past something hops a few nodes along its way. */
  nudge(z, t) {
    const feet = z.feet();
    let n = this.game.nav.nearest(feet, 120) || this.game.nav.nearestXY(feet, 200, 80);
    if (!n || !this.dist) return;
    for (let i = 0; i < 3; i++) { const h = this.nextHop(n); if (!h) break; n = h.node; }
    z.pm.origin = [n.x, n.y, n.z + 37];
    z.prevOrigin = z.pm.origin.slice();
    z.pm.velocity = [0, 0, 0];
    z.progPos = z.pm.origin.slice(); z.progT = t; z.stuckSince = 0;
    z.node = null; z.goal = null;
    setDynamicBox(z.box, z.pm.origin, z.hull().mins, z.hull().maxs);
  }

  /** A stuck zombie (out of sight) comes back at a fresh spot. */
  recycle(z) {
    const n = this.pickSpawn();
    if (!n) return;
    z.pm.origin = [n.x, n.y, n.z + 37];
    z.prevOrigin = z.pm.origin.slice();
    z.pm.velocity = [0, 0, 0];
    z.progPos = z.pm.origin.slice(); z.progT = this.game.time; z.stuckSince = 0;
    z.node = null; z.goal = null;
    setDynamicBox(z.box, z.pm.origin, z.hull().mins, z.hull().maxs);
  }

  // ---------------------------------------------------------------- bot teammates
  /** Bot.objective in this mode: stay with the human, or go hunting when he's gone. */
  allyObjective(bot, it) {
    const g = this.game, p = bot.p, me = g.local;
    if (me && me.alive && me.team === TEAM_CT && me !== p) {
      const d = Math.hypot(me.pm.origin[0] - p.pm.origin[0], me.pm.origin[1] - p.pm.origin[1]);
      if (d > 180) it.move = me.feet();
      return true;
    }
    let best = null, bd = Infinity;
    for (const z of this.pool) {
      if (!z.alive) continue;
      const d = Math.hypot(z.pm.origin[0] - p.pm.origin[0], z.pm.origin[1] - p.pm.origin[1]);
      if (d < bd) { bd = d; best = z; }
    }
    if (best && bd > 300) it.move = best.feet();
    return true;
  }
}

