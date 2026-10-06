// The Mega Obby's other players. Each bot follows the route its stage wrote
// (walk here, jump there, climb, ride, wait for the moment...) the way a
// person would: it lines up its jumps, steers in the air, waits for a laser
// to switch off or a crusher to go up, and reacts a little late. Each bot
// has a skill: the good ones barely hesitate and rarely slip, the new ones
// stop to think before hard jumps, react slowly, mistime things and fall a
// lot - but they keep going, and they learn the stages they died on. When
// something goes wrong it works out where it is on the route again; when
// it's properly stuck it resets, like anyone would.
import * as THREE from 'three';
import * as CANNON from '../../vendor/cannon-es.js';
import { BotBrain, pick } from '../../engine/Bots.js';
import { ZONES } from './stages.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const res = (p, bot) => (typeof p === 'function' ? p(bot) : p);

/** The velocity of the ground under a character: a moving platform (v + w x r) or a conveyor. */
export function groundVel(ch, out) {
  out.set(0, 0, 0);
  const g = ch.groundPart;
  if (!ch.grounded || !g?.body) return out;
  const b = g.body;
  if (b.type === CANNON.Body.KINEMATIC) {
    const p = ch.body.position, w = b.angularVelocity;
    const rx = p.x - b.position.x, ry = p.y - 3 - b.position.y, rz = p.z - b.position.z;
    out.set(b.velocity.x + (w.y * rz - w.z * ry), 0, b.velocity.z + (w.x * ry - w.y * rx));
  } else if (g.surfaceVelocity) out.set(g.surfaceVelocity.x, 0, g.surfaceVelocity.z);
  return out;
}

const LINES = {
  checkpoint: ['yes!!', 'checkpoint!', 'finally', 'easy', 'lets go', 'ok next', 'woo', 'phew', 'that was close', 'got it'],
  zone: {
    volcano: ['ooh lava', 'VOLCANO ISLES lets gooo', 'its so hot here lol', 'dont touch the lava!!', 'lava zone'],
    neon: ['NEON CITY!!', 'this looks so cool', 'woah the lights', 'laser time', 'its night now'],
    frozen: ['brrr', 'ice level', 'its snowing!!', 'FROZEN PEAKS', 'so cold lol'],
    cosmos: ['SPACE!!', 'we are in space lol', 'last zone!!', 'almost there!!', 'woah look at the planets'],
  },
  die: ['noooo', 'oof', 'lag!!', 'that was lag', 'ugh', 'come on', 'not again', 'i was so close', 'how', 'whyyy', 'aww', 'lol i died'],
  cause: {
    laser: ['those lasers tho', 'laser got me', 'i went too early'], crusher: ['flattened lol', 'squished', 'the crushers!!'],
    glass: ['WRONG GLASS', 'i picked wrong lol', 'it was the other one!!', 'glass bridge is evil'], fire: ['that spinner is op', 'burned lol', 'spinner got me'],
    snowball: ['avalanche got me', 'SNOWBALL', 'the snowballs are huge'], axe: ['the axes!!!', 'pendulum lol', 'got sliced'],
    disco: ['red means stop lol', 'i stood on red', 'disco is hard'], lava: ['lava!!!', 'the lava rose too fast', 'hot hot hot'],
    fell: ['i fell', 'missed the jump', 'slipped', 'i jumped too short'],
    killbrick: ['i touched the red', 'kill brick lol', 'red = dead', 'oops'],
  },
  stuck: ['this stage is impossible', 'how do u pass stage %', 'i give up... jk', 'ok im getting mad', 'stage % is so hard', 'stage % is evil', 'how many times have i died here'],
  win: ['I BEAT THE MEGA OBBY!!!', 'YESSSS', 'gg', 'finally!!!', 'that was hard', 'EZ', 'w00t!!', 'i did it!!!', 'BEAT IT'],
  idle: ['what stage r u on', 'this obby is so cool', 'im on stage %', 'anyone beat it yet?', 'hard obby lol', 'wait for me', 'whos the fastest', 'the glass bridge is evil', 'lol', 'i love this obby', 'stage % now', 'my hands hurt lol', 'who made this its awesome'],
  won: ['gg', 'who wants to race', 'that was fun', 'doing it again', 'wooo', 'the view up here lol', 'come on guys u can do it', 'im the champion'],
};
const say = (s, n) => s.replace('%', n);

export class ObbyBot extends BotBrain {
  /** O: the place's shared state ({stages, C, game}). */
  constructor(game, player, O) {
    super(game, player, { chattiness: 0.7 });
    this.O = O;
    const r = Math.random();
    this.tier = r < 0.2 ? 'pro' : r < 0.75 ? 'average' : 'noob';
    this.skill = this.tier === 'pro' ? rnd(0.93, 0.98) : this.tier === 'average' ? rnd(0.8, 0.93) : rnd(0.62, 0.8);
    this.reaction = this.tier === 'pro' ? rnd(0.06, 0.12) : this.tier === 'average' ? rnd(0.1, 0.2) : rnd(0.16, 0.3);
    this.stage = -1; this.si = 0; this.s = {}; this.mem = {};
    this.fails = new Map(); // stage -> step -> deaths (they get more careful)
    this.deathsHere = 0;
    this.idle = 0; this.stepT = 0; this.stuckT = 0; this.lostT = 0;
    this._last = V(); this._gv = V();
    this.chatTimer = rnd(15, 50);
  }

  get stageDef() { return this.O.stages[this.stage]; }
  get route() { return this.stageDef?.route || []; }

  // --- events from the place --------------------------------------------------------------------------------------
  onSpawn() { this.si = 0; this.s = {}; this.mem = {}; this.lostT = 0; this.stepT = 0; this.stuckT = 0; this.idle = rnd(0.2, 0.9) * (1.3 - this.skill); }
  onDied(cause) {
    const f = this.fails.get(this.stage) || new Map(); this.fails.set(this.stage, f);
    f.set(this.si, (f.get(this.si) || 0) + 1);
    this.deathsHere++;
    const n = this.stage + 1;
    if (this.deathsHere >= 4 && Math.random() < 0.3) this.later(say(pick(LINES.stuck), n), 1, 3);
    else if (Math.random() < 0.35) this.later(pick(Math.random() < 0.5 && LINES.cause[cause] ? LINES.cause[cause] : LINES.die), 0.8, 2.5);
  }
  onCheckpoint(i) {
    const prevZone = this.O.stages[this.stage]?.zone;
    this.enterStage(i);
    const z = this.stageDef.zone;
    if (z !== prevZone && LINES.zone[ZONES[z].id] && Math.random() < 0.6) this.later(pick(LINES.zone[ZONES[z].id]), 0.5, 2);
    else if (Math.random() < 0.18) this.later(Math.random() < 0.3 ? `stage ${i + 1}!` : pick(LINES.checkpoint), 0.3, 1.5);
    // now and then someone stops for a moment (to chat, or look around)
    if (Math.random() < 0.05) this.idle = rnd(3, 9);
  }
  onWin() { this.later(pick(LINES.win), 0.3, 1.2); this.wonAt = this.game.world.time; }
  later(text, a, b) { this.game.world.delay(rnd(a, b), () => { if (this.game.players.includes(this.player)) this.say(text); }); }
  idleChat() {
    if (this.player.obby?.won && this.stage === this.O.stages.length - 1) { this.say(pick(LINES.won)); return; }
    if (Math.random() < 0.55) this.say(say(pick(LINES.idle), this.stage + 1));
  }

  enterStage(i) {
    if (i !== this.stage) this.deathsHere = 0;
    this.stage = i; this.si = 0; this.s = {}; this.mem = {}; this.stepT = 0; this.lostT = 0;
  }

  // --- moving -------------------------------------------------------------------------------------------------------
  /**
   * Move toward a point (horizontally), slowing down to stop on it. The
   * ground's own motion (a conveyor, a spinning plank) is allowed for unless
   * the point moves with it (rel). full: don't slow down (a run-up, or a dash
   * past something). Returns the distance left.
   */
  goTo(target, stopR = 0.3, o = {}) {
    const ch = this.ch, p = ch.rootPosition, sp = ch.walkSpeed;
    const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
    let vx = 0, vz = 0;
    if (d > stopR) {
      const s = o.full ? sp : Math.min(sp, d * (ch.grounded ? 7 : 10));
      vx = dx / d * s; vz = dz / d * s;
    }
    if (!o.rel) { groundVel(ch, this._gv); vx -= this._gv.x; vz -= this._gv.z; }
    let mx = vx / sp, mz = vz / sp;
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    ch.input.move.set(mx, 0, mz);
    return d;
  }
  /** Stand still here (on a moving thing, move along with it). */
  hold(s, rel) {
    if (!s.holdAt) s.holdAt = this.ch.rootPosition.clone();
    if (rel) { this.ch.input.move.set(0, 0, 0); return; }
    this.goTo(s.holdAt, 0.25);
  }
  reactTime() { return this.reaction + rnd(0, 0.08); }
  /** Does it mess this one up? (hard steps, low skill; less often where it died before) */
  slip(st) {
    const f = this.fails.get(this.stage)?.get(this.si) || 0;
    return Math.random() < (st.hard ?? 0.3) * (1 - this.skill) * 1.2 * (f ? 0.55 : 1);
  }
  /**
   * Waiting to go: holds still while the step's condition (the moment to go)
   * is false, reacts a little after it turns true; nervous ones hesitate
   * before hard jumps, and a slip here means going early, without waiting.
   */
  ready(st, s, dt, o = {}) {
    if (s.go) return true;
    const timing = st.timing || o.timing;
    if (s.early == null) s.early = st.cond && timing && this.slip(st) && Math.random() < 0.6 ? rnd(0.15, 0.9) : 0;
    if (s.early > 0) { if ((s.early -= dt) <= 0) s.go = true; return !!s.go; }
    if (s.hes == null) {
      const f = this.fails.get(this.stage)?.get(this.si) || 0;
      // (nobody stands around thinking on something that moves)
      s.hes = !st.hurry && !st.speed && !this.ch.groundPart?.kinematic && (st.hard ?? 0) >= 0.45 && Math.random() < (1 - this.skill) * 1.6 + f * 0.1 ? rnd(0.3, 1.6) : 0;
    }
    if (s.hes > 0) { s.hes -= dt; return false; }
    if (st.cond) {
      // it looks every so often (as often as it can react), and goes when it's the moment:
      // slow ones miss short windows and wait for the next
      if ((s.rt = (s.rt ?? 0) - dt) > 0) return false;
      s.rt = st.quick ? 0 : this.reactTime();
      if (!st.cond(this)) return false;
    }
    s.go = true;
    return true;
  }

  // --- the brain -----------------------------------------------------------------------------------------------------------
  update(dt) {
    const ch = this.ch;
    if (!ch || !ch.alive) return;
    ch.input.jump = false;
    ch.input.move.set(0, 0, 0);
    this.forceJump = false;
    if (ch !== this._ch) { this._ch = ch; this.onSpawn(); }
    const ob = this.player.obby;
    if (ob && ob.stage !== this.stage) this.enterStage(ob.stage);
    this.chatTimer -= dt * this.chattiness;
    if (this.chatTimer <= 0) { this.chatTimer = rnd(30, 90); this.idleChat(); }
    if (this.idle > 0) { this.idle -= dt; return; }
    const stage = this.stageDef;
    if (!stage) return;
    this.stepT += dt;
    if (this.si < 0) this.relocate(dt);
    else {
      for (let n = 0; n < 4 && this.si >= 0 && this.si < this.route.length; n++) {
        const st = this.route[this.si];
        if (!this.run(st, this.s, dt)) break;
        this.si++; this.s = {}; this.stepT = 0;
        dt = 0;
      }
    }
    stage.tick?.(this, dt);
    if (this.forceJump && ch.grounded) ch.input.jump = true;
    // stuck: pushing but not moving (a jump usually frees it), or no progress for ages
    const p = ch.rootPosition;
    if (ch.input.move.lengthSq() > 0.25 && p.distanceTo(this._last) < 2 * dt) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    this._last.copy(p);
    if (this.stuckT > 1.5 && ch.grounded) { ch.input.jump = true; this.stuckT = 0.5; }
    const step = this.route[this.si];
    const patient = step && (step.type === 'win' || step.type === 'custom' || step.type === 'wait');
    if (this.stepT > (patient ? 90 : 35)) { this.stepT = 0; this.reset('stuck'); }
  }
  reset() { const ch = this.ch; if (ch?.alive) { ch.lastCause = 'reset'; ch.breakJoints(); } }

  /** Work out where on the route it is (after landing somewhere unexpected). */
  lost() {
    const ch = this.ch, p = ch.rootPosition, feet = p.y - 3;
    const route = this.route;
    let best = -1, bd = 3.4;
    for (let i = 0; i < route.length; i++) {
      const e = endOf(route[i], this);
      if (!e) continue;
      const d = hd(e, p) + Math.abs(e.y - feet) * 1.5;
      if (d < bd) { bd = d; best = i; }
    }
    this.s = {};
    if (best >= 0) { this.si = route[best].type === 'ride' ? best : best + 1; return; }
    const sp = this.stageDef.spawn.at;
    if (hd(sp, p) < 6 && Math.abs(sp.y - feet) < 2) { this.si = 0; return; }
    this.si = -1; this.lostT = 0;
  }
  relocate(dt) {
    // somewhere off the route: look around, walk back to the nearest bit of
    // the route on this level, or give up and reset
    const ch = this.ch, p = ch.rootPosition, feet = p.y - 3;
    this.lostT += dt;
    if (!ch.grounded || this.lostT < 0.6) return;
    const t = this.lostT; this.lost(); this.lostT = t;
    if (this.si >= 0) return;
    let best = null, bd = 16;
    for (const st of this.route) {
      const e = endOf(st, this);
      if (e && Math.abs(e.y - feet) < 1.2 && hd(e, p) < bd) { bd = hd(e, p); best = e; }
    }
    if (best) this.goTo(best, 0.3);
    if (this.lostT > (best ? 12 : 6)) this.reset('lost');
  }

  /** Runs one step of the route. Returns true when it's done. */
  run(st, s, dt) {
    const ch = this.ch, p = ch.rootPosition, feet = p.y - 3;
    switch (st.type) {
      case 'walk': {
        if (!this.ready(st, s, dt)) { this.hold(s); return false; }
        if (st.pause?.(this)) { s.pz ??= p.clone(); this.goTo(s.pz, 0.2); return false; }
        s.pz = null;
        if (st.via && !s.viaDone) { if (this.goTo(res(st.via, this), 0.3, { full: true }) < 0.9) s.viaDone = true; return false; }
        const t = res(st.p, this);
        // run straight into a jump that comes next (no stopping at the edge)
        const nx = this.route[this.si + 1];
        const runUp = nx?.type === 'jump' && !nx.from && (!nx.cond || nx.quick) && (nx.hurry || nx.speed || (nx.hard ?? 0) < 0.45 || this.skill > 0.88);
        const d = this.goTo(t, 0.15, { full: !!(st.cond || st.pass || st.hurry || runUp), rel: st.rel });
        if (st.pass) { const f = st.pass; if ((p.x - t.x) * f.x + (p.z - t.z) * f.z > -(st.r ?? 1)) return true; }
        if (d < (st.r ?? 1) && Math.abs(feet - t.y) < 2.5) return true;
        // fell off something on the way
        if (ch.grounded && feet < t.y - 3 && feet < (s.y0 ??= feet) - 3) this.lost();
        return false;
      }
      case 'wait': {
        this.hold(s);
        return this.ready(st, s, dt, { timing: true });
      }
      case 'jump': return this.jump(st, s, dt);
      case 'climb': {
        s.y0 ??= feet;
        if (!s.top && feet < st.p.y - 0.4) {
          ch.input.move.copy(st.dir);
          // walked off the side, or slid down: find the way again
          if (ch.grounded && feet < s.y0 - 3) this.lost();
          return false;
        }
        s.top = true;
        const d = this.goTo(st.p, 0.3);
        if (d < 1.2 && ch.grounded && Math.abs(feet - st.p.y) < 1.5) return true;
        if (ch.grounded && feet < st.p.y - 3) this.lost();
        return false;
      }
      case 'ride': {
        const h = res(st.hold, this);
        if (ch.grounded) this.goTo(h, 0.2, { rel: true }); else this.goTo(h, 0.2);
        if (feet < h.y - 3) { this.lost(); return false; }
        return this.ready(st, s, dt, { timing: true });
      }
      case 'bounce': {
        if (!s.up) {
          this.goTo(st.pad, 0.15);
          if (ch.body.velocity.y > 40) s.up = true;
          return false;
        }
        this.goTo(st.p, 0.25);
        if (ch.grounded && ch.body.velocity.y < 1) {
          if (hd(p, st.p) < 3 && Math.abs(feet - st.p.y) < 2) return true;
          this.lost();
        }
        return false;
      }
      case 'custom': return st.run(this, dt, s);
      case 'win': return this.celebrate(st, s, dt);
    }
    return true;
  }

  /** A jump: get to the takeoff, wait for the moment, jump, steer onto the landing spot. */
  jump(st, s, dt) {
    const ch = this.ch, p = ch.rootPosition;
    s.ph ??= 'to';
    if (s.ph === 'to') {
      const from = st.from ? res(st.from, this) : null;
      // (in a hurry - crumbling tiles, a speed boost - near enough is good enough)
      if (from && (this.goTo(from, 0.12, { full: st.hurry || st.speed }) > (st.hurry || st.speed ? 1 : 0.45) || !ch.grounded)) return false;
      s.ph = 'ready';
    }
    if (s.ph === 'ready') {
      // on a moving platform, move with it; on a roller, keep your place
      const g = ch.groundPart?.body, w = g?.angularVelocity;
      this.hold(s, ch.groundPart?.kinematic && Math.abs(w.x) + Math.abs(w.z) < 0.1);
      if (!ch.grounded) return false;
      if (!this.ready(st, s, dt)) return false;
      // someone's still standing on a small landing spot: give them a moment
      const L = res(st.p, this);
      // (only on solid ground, and not when timing matters: nobody waits on a moving thing)
      if (!st.hurry && !st.cond && !ch.groundPart?.kinematic && (s.queue ??= 0) < 1.2 && this.someoneAt(L)) { s.queue += dt; return false; }
      s.ph = 'go'; s.t = 0;
      if (!s.early && this.slip(st)) {
        // a slip: aimed a bit off (short, long or to the side)
        const a = Math.random() * Math.PI * 2, e = rnd(1.8, 3.5);
        s.err = V(Math.cos(a) * e, 0, Math.sin(a) * e);
      }
    }
    const L = res(st.p, this);
    const aim = s.err ? L.clone().add(s.err) : L;
    s.t += dt;
    if (s.ph === 'go') {
      if (ch.grounded) {
        // press jump (again, if it didn't take)
        ch.input.jump = s.t < 0.05 || (s.t % 0.3) < 0.05;
        this.goTo(aim, 0.2, { full: true });
        if (s.t > 1.5) { this.s = {}; }
        return false;
      }
      s.ph = 'air'; s.air = 0;
    }
    s.air += dt;
    this.goTo(aim, 0.2);
    if (ch.grounded && s.air > 0.08 && ch.body.velocity.y < 8) {
      const feet = p.y - 3;
      if (hd(p, L) < 2.6 && Math.abs(feet - L.y) < 1.9) return true;
      this.lost();
    }
    return false;
  }
  someoneAt(L) {
    for (const ch of this.game.world.characters) {
      if (ch === this.ch || !ch.alive || !ch.grounded) continue;
      const q = ch.rootPosition;
      if (Math.hypot(q.x - L.x, q.z - L.z) < 1.4 && Math.abs(q.y - 3 - L.y) < 1.5) return true;
    }
    return false;
  }

  /** On top: walk about, jump around, chat; after a while some go round again. */
  celebrate(st, s, dt) {
    const stage = this.stageDef, ch = this.ch;
    if (!s.init) { s.init = true; s.t = 0; s.next = 0; s.leave = rnd(25, 80); }
    s.t += dt;
    if (s.t > s.leave && !s.goHome) { if (Math.random() < 0.5 && stage.restartAt) s.goHome = true; else s.leave += rnd(30, 70); }
    if (s.goHome) { this.goTo(stage.restartAt, 0.2); return false; }
    if ((s.next -= dt) <= 0) {
      s.next = rnd(1.5, 5);
      const a = Math.random() * Math.PI * 2, r = rnd(0, 3.5);
      s.to = stage.finishAt.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r));
      if (Math.random() < 0.3) s.hops = Math.floor(rnd(1, 4));
    }
    if (s.to) this.goTo(s.to, 0.4);
    if (s.hops > 0 && ch.grounded && Math.random() < 0.1) { ch.input.jump = true; s.hops--; }
    return false;
  }
}

/** Where a step leaves you (for working out where you are): a place, or where a moving thing is now. */
function endOf(st, bot) {
  if (st.type === 'walk' || st.type === 'jump' || st.type === 'climb' || st.type === 'bounce') return typeof st.p === 'function' ? st.p(bot) : st.p;
  if (st.type === 'ride') return st.hold(bot);
  return null;
}
