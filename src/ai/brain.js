// NPC brain. Thinks a few times per second (goals: schedule, activities, social, combat) and
// steers every tick (path following with local avoidance and unsticking). The simulation
// systems install higher-level behaviours through `planner` hooks; combat micro lives here.
import { CONFIG } from '../config.js';
import { RNG } from '../core/random.js';
import { angleDiff, yawTo, clamp } from '../core/mathutil.js';

export class Brain {
  constructor(game, c, seed = 1) {
    this.game = game; this.c = c;
    this.rng = new RNG(seed);
    this.goal = null;            // {type, ...}
    this.path = null; this.pathIdx = 0; this.pathTarget = null; this.pathAge = 0;
    this.thinkT = this.rng.range(0, CONFIG.ai.thinkInterval);
    this.stuckT = 0; this.lastPos = [c.x, c.z]; this.stuckCount = 0;
    this.fight = null;           // {target, nextAttack, strafeDir, mode}
    this.reactT = 0;
    this.speedMode = 'walk';
  }

  // ------------------------------------------------------------------ navigation primitives
  /** Walk/run to (x,z). Returns 'arrived' | 'moving' | 'failed'. */
  goTo(x, z, opts = {}) {
    const c = this.c, g = this.game;
    const arrive = opts.arrive ?? 0.35;
    const d = Math.hypot(x - c.x, z - c.z);
    if (d <= arrive) { c.stop(); this.path = null; return 'arrived'; }
    const sameTarget = this.pathTarget && Math.hypot(this.pathTarget[0] - x, this.pathTarget[1] - z) <= 0.8;
    if (!this.path && sameTarget && this.failUntil && g.time < this.failUntil) { c.stop(); return 'failed'; }
    const needPath = !this.path || !sameTarget || this.pathAge > 6;
    if (needPath) {
      this.path = g.world.nav.findPath(c.x, c.z, x, z, c, opts.maxExpand || 25000);
      this.pathIdx = 0; this.pathTarget = [x, z]; this.pathAge = 0;
      if (!this.path) { c.stop(); this.failUntil = g.time + 2 + this.rng.next(); return 'failed'; }
      this.failUntil = 0;
    }
    let wp = this.path[this.pathIdx];
    while (wp && this.pathIdx < this.path.length - 1 && Math.hypot(wp[0] - c.x, wp[1] - c.z) < 0.5) wp = this.path[++this.pathIdx];
    if (!wp) { c.stop(); return 'arrived'; }
    let dx = wp[0] - c.x, dz = wp[1] - c.z;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    // Local avoidance: slide around people in front of us.
    let ax = 0, az = 0;
    for (const o of g.characters) {
      if (o === c || o.isDown) continue;
      const ox = o.x - c.x, oz = o.z - c.z, od = Math.hypot(ox, oz);
      if (od > 1.4 || od < 1e-3) continue;
      const ahead = (ox * dx + oz * dz) / od;
      if (ahead < 0.2) continue;
      const side = ox * dz - oz * dx; // >0: obstacle on our left
      const push = (1.4 - od) / 1.4 * ahead;
      ax += -dz * Math.sign(side || 1) * -push; az += dx * Math.sign(side || 1) * -push;
    }
    dx += ax * 0.9; dz += az * 0.9;
    const speed = opts.run ? c.maxSpeed('run') * 0.95 : clamp(1.75 + c.stats.agi / 110, 1.6, 2.4);
    const slow = this.pathIdx >= this.path.length - 1 && d < 1.2 ? 0.6 : 1;
    c.setMove(dx, dz, speed * slow);
    return 'moving';
  }
  _stuckCheck(dt) {
    const c = this.c;
    if (c.moveSpeed < 0.2) { this.stuckT = 0; this.lastPos = [c.x, c.z]; return; }
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      const moved = Math.hypot(c.x - this.lastPos[0], c.z - this.lastPos[1]);
      if (moved < 0.25) {
        this.stuckCount++;
        this.path = null;
        // Nudge sideways, then if repeatedly stuck while unseen, hop to the next waypoint.
        const a = this.rng.range(0, Math.PI * 2);
        c.vx += Math.cos(a) * 1.5; c.vz += Math.sin(a) * 1.5;
        if (this.stuckCount > 3 && !this.game.isVisibleToPlayer?.(c) && this.pathTarget) {
          const nw = this.game.world.nav.nearestWalkable(this.pathTarget[0], this.pathTarget[1], c, 6);
          if (nw) c.place(nw[0], nw[1]);
          this.stuckCount = 0;
        }
      } else this.stuckCount = Math.max(0, this.stuckCount - 1);
      this.stuckT = 0; this.lastPos = [c.x, c.z];
    }
  }

  // ------------------------------------------------------------------ main loop
  update(dt) {
    const c = this.c;
    this.pathAge += dt;
    if (c.state === 'ko' || c.state === 'down' || c.state === 'thrown' || c.state === 'getup' || c.state === 'grappled' || c.state === 'cuffed') { c.stop(); return; }
    if (this.paused) { c.stop(); return; }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = CONFIG.ai.thinkInterval * this.rng.range(0.8, 1.25); this.think(); }
    if (this.fight && this.fight.target) this._fightTick(dt);
    else if (c.flags.dispatch && this.game.rules && this.game.rules.tickGuard(this, dt)) { /* chasing an offender */ }
    else if (this.goal && this.goal.type === 'follow') this._follow(dt);
    else if (this.goal && this.game.planner) this.game.planner.tick(this, dt);
    else if (this.goal) this._basicGoal(dt);
    else c.stop();
    this._stuckCheck(dt);
  }

  think() {
    const c = this.c, g = this.game;
    // Combat takes priority: fight whoever is fighting us (unless we'd rather run).
    if (this.fight) {
      const t = this.fight.target;
      if (!t || t.state === 'ko' || Math.hypot(t.x - c.x, t.z - c.z) > 16 || (this.fight.until && g.time > this.fight.until)) this.endFight();
    }
    if (!this.fight && c.lastHitBy && g.time - c.lastHitT < 4 && c.lastHitBy.state !== 'ko') {
      const tr = c.def.traits || {};
      if ((tr.bravery ?? 0.5) < 0.25 && c.hp < c.maxHp * 0.6) this.flee(c.lastHitBy);
      else this.startFight(c.lastHitBy, 'retaliate');
    }
    if (g.planner && !this.fight) g.planner.think(this);
    else if (!this.fight && !this.goal) this.goal = { type: 'wander', t: 0 };
  }

  _follow(dt) {
    const p = this.game.player, c = this.c;
    if (!p || !this.game.social?.followers.has(c.id)) { this.goal = null; return; }
    // Fight whoever is fighting the player
    for (const o of this.game.characters) if (o !== c && o.combatTarget === p && o.combatTimer > 0 && !o.isDown && Math.hypot(o.x - c.x, o.z - c.z) < 10) { this.startFight(o, 'defend'); return; }
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d > 2.2) this.goTo(p.x, p.z, { arrive: 1.8, run: d > 5 }); else { c.stop(); if (this.rng.chance(0.02)) this.goal = null; }
  }
  _basicGoal(dt) {
    const c = this.c, gl = this.goal;
    if (gl.type === 'wander') {
      if (!gl.to || gl.t > 12) {
        const room = this.game.world.roomAt(c.x, c.z);
        const pt = room ? this.game.world.randomPointIn(room.id, this.rng, c) : null;
        gl.to = pt; gl.t = 0;
      }
      gl.t += dt;
      const r = gl.to ? this.goTo(gl.to[0], gl.to[1]) : 'failed';
      if (r !== 'moving') { c.stop(); if (r === 'failed' || this.rng.chance(0.01)) gl.to = null; }
    }
  }

  // ------------------------------------------------------------------ combat
  startFight(target, reason = 'fight', opts = {}) {
    if (!target || target === this.c) return;
    this.fight = { target, reason, nextAttack: this.game.time + this.rng.range(0.3, 0.9), strafeDir: this.rng.sign(), mode: 'approach', until: opts.until || 0, dodgeT: 0 };
    this.c.combatTarget = target; this.c.combatTimer = 8;
    this.goal = null;
    this.game.events.emit('fightStart', { c: this.c, target, reason });
  }
  endFight() {
    if (this.fight) this.game.events.emit('fightEnd', { c: this.c, target: this.fight.target });
    this.fight = null; this.c.setBlock(false); this.c.lockTarget = null; this.c.faceYaw = null;
    if (this.token) { this.game.releaseAttackToken?.(this); this.token = false; }
  }
  flee(from) {
    this.endFight();
    const c = this.c;
    const dx = c.x - from.x, dz = c.z - from.z, d = Math.hypot(dx, dz) || 1;
    const to = this.game.world.nav.nearestWalkable(c.x + dx / d * 10, c.z + dz / d * 10, c, 8);
    this.goal = { type: 'flee', to, until: this.game.time + 5 };
  }
  _fightTick(dt) {
    const c = this.c, g = this.game, f = this.fight, t = f.target;
    const tr = c.def.traits || {};
    const skill = clamp((c.stats.agi + c.stats.str) / 200, 0.1, 1);
    const dx = t.x - c.x, dz = t.z - c.z, d = Math.hypot(dx, dz);
    c.combatTarget = t; c.combatTimer = 6;
    // Attack tokens: only a couple of NPCs swing at the player at once.
    const needToken = t.isPlayer;
    if (needToken && !this.token) this.token = g.requestAttackToken?.(this) ?? true;
    const engage = this.token || !needToken;
    const want = engage ? 1.15 : 2.6 + (this.rng.next() * 0.6);
    // Defensive reactions to an incoming strike.
    if (c.incoming && c.incoming.att === t && g.time - c.incoming.at < 0.25 && !f.reacted) {
      f.reacted = true;
      const r = this.rng.next();
      if (c.counterWindow > 0 && r < skill * 0.18) c.counter();
      else if (r < 0.15 + skill * 0.35) { c.setBlock(true); f.blockUntil = g.time + 0.45 + this.rng.range(0, 0.3); }
      else if (r < 0.2 + skill * 0.45 && c.stamina > 25) c.dodge(-dz / (d || 1) * f.strafeDir + -dx / (d || 1) * 0.5, dx / (d || 1) * f.strafeDir + -dz / (d || 1) * 0.5);
    }
    if (!c.incoming || g.time - c.incoming.at > 0.6) f.reacted = false;
    if (f.blockUntil && g.time > f.blockUntil) { c.setBlock(false); f.blockUntil = 0; }
    if (t.state === 'ko') { this.endFight(); return; }
    // Movement: close in / circle / keep distance
    if (c.state === 'free' || c.state === 'action') {
      if (d > want + 0.35) {
        const res = d > 4 ? this.goTo(t.x, t.z, { run: true, arrive: want }) : (c.setMove(dx, dz, c.maxSpeed('run') * (d > 2 ? 0.9 : 0.55)), 'moving');
        void res;
      } else if (d < want - 0.45) c.setMove(-dx, -dz, 1.6);
      else {
        // Circle the opponent like a real scrap.
        const sx = -dz * f.strafeDir, sz = dx * f.strafeDir;
        c.setMove(sx, sz, engage ? 0.9 : 1.5);
        if (this.rng.chance(0.006)) f.strafeDir *= -1;
      }
      c.faceYaw = yawTo(dx, dz);
    }
    // Attack decisions
    if (engage && g.time >= f.nextAttack && d < 1.9 && c.state === 'free' && !c.blocking) {
      const aggr = tr.aggression ?? 0.5;
      const tired = c.stamina < 25;
      if (!tired) {
        const r = this.rng.next();
        if (t.isDown && d < 1.5) c.attack('light');
        else if (r < 0.12 && !c.held && skill > 0.35) c.grab(t);
        else if (r < 0.32) c.attack('heavy');
        else { c.attack('light'); if (this.rng.chance(0.35 + skill * 0.3)) c.queued = 'light'; }
      }
      f.nextAttack = g.time + this.rng.range(0.55, 1.4) / (0.6 + aggr * 0.8) + (tired ? 1.2 : 0);
    }
    if (c.state === 'grapple') {
      if (this.rng.chance(0.05)) c.grappleThrow(this.rng.range(-1, 1), this.rng.range(-1, 1));
      else if (this.rng.chance(0.06)) c.attack(this.rng.chance(0.4) ? 'heavy' : 'light');
    }
    // Low health: back off or give up
    if (c.hp < c.maxHp * 0.2 && (tr.bravery ?? 0.5) < 0.6 && this.rng.chance(0.01)) this.flee(t);
  }
}
