// The other players. As runners they follow the route each hall wrote
// (walk here, jump there, wait at the edge of a trap...) with a personality:
// the brave ones dash straight through, the careful ones wait at the edge of
// a trap for someone else to set it off ("baiting"), and everyone ducks into
// a hiding place when a trap goes off around them. As the Pharaoh they walk
// the galleries to the next trap ahead of the runners and fire it when
// people are inside - sometimes greedy for a few more, sometimes too early.
// In the camp they wander about and chat.
import * as THREE from 'three';
import { BotBrain, pick } from '../../engine/Bots.js';
import { groundVel } from '../megaobby/bot.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const LINES = {
  lobby: ['who is pharaoh next', 'i want to be pharaoh!!', 'this map is so cool', 'gl everyone', 'dont trust the scarabs', 'i always die at the boulder', 'pick me pharaoh', 'lol last round', 'the crocodile is scary', 'gg last round', 'this game is hard lol', 'hi guys', 'ok this time i make it'],
  start: ['GO GO GO', 'run!!', 'good luck', 'dont die', 'here we go', 'lets gooo', 'bait the traps!', 'im not going first lol'],
  bait: ['you go first', 'no u', 'go go', 'bait it', 'im waiting', 'someone go', 'ill wait lol', 'pharaoh is watching...'],
  die: ['NOOO', 'oof', 'lag!!', 'how', 'unfair', 'i was so close', 'nice trap lol', 'ow', 'whyyy', 'rip me', 'i hate that trap', 'gg', 'not again'],
  cause: { boulder: ['THE BOULDER', 'rolled over lol'], croc: ['crocodile got me', 'sobek!!'], nile: ['the crocodiles!!', 'i fell in the nile'], mummy: ['the mummies are so fast', 'MUMMY'], scarab: ['ewww bugs', 'the scarabs!!'], fire: ['so hot', 'burned'], serpent: ['the snake!!', 'apophis got me'] },
  survive: ['ha missed', 'too slow pharaoh', 'nice try', 'ez', 'lol missed me', 'phew'],
  escape: ['I MADE IT', 'yesss', 'GG', 'EYE OF RA!!', 'we win!!', 'escaped!!'],
  pharaoh: ['muahaha', 'you will all perish', 'welcome to my tomb', 'nobody escapes', 'hehe', 'i see you'],
  kill: ['gotcha', 'lol', 'too easy', 'muahaha', 'perish', 'another one', 'hehe'],
};

export class DRBot extends BotBrain {
  constructor(game, player, S) {
    super(game, player, { chattiness: 0.6 });
    this.S = S;
    const r = Math.random();
    this.tier = r < 0.25 ? 'pro' : r < 0.75 ? 'average' : 'noob';
    this.skill = this.tier === 'pro' ? rnd(0.9, 0.98) : this.tier === 'average' ? rnd(0.75, 0.9) : rnd(0.55, 0.75);
    this.reaction = this.tier === 'pro' ? rnd(0.08, 0.15) : this.tier === 'average' ? rnd(0.14, 0.26) : rnd(0.22, 0.4);
    this.brave = Math.random();
    // its own line across the way and its own pace, so a crowd spreads out instead of running as one
    this.lane = rnd(-1, 1); this.pace = this.tier === 'pro' ? rnd(0.95, 1) : rnd(0.82, 0.98);
    this.si = 0; this.s = {}; this.mode = 'route'; this.hide = null;
    this._gv = V(); this._last = V(); this.stuckT = 0; this.stepT = 0;
    this.ph = { target: null, t: 0, react: 0, greed: 0, think: 0 };
    this.chatTimer = rnd(10, 40);
  }
  get dr() { return this.player.dr; }

  // --- events -------------------------------------------------------------------------------------------------------------
  onRound(role) {
    this.si = 0; this.s = {}; this.mode = 'route'; this.hide = null; this.unhide = null; this.stepT = 0; this.stuckT = 0;
    this.startDelay = this.tier === 'pro' ? rnd(0, 0.8) : rnd(0.3, 2.6); // (not everyone bolts the moment the gates open)
    this.ph = { target: null, t: 0, react: 0, greed: 0, think: 0, fired: 0 };
    if (Math.random() < 0.25) this.later(pick(role === 'pharaoh' ? LINES.pharaoh : LINES.start), 1, 4);
  }
  onDied(cause) { if (Math.random() < 0.45) this.later(pick(Math.random() < 0.5 && LINES.cause[cause] ? LINES.cause[cause] : LINES.die), 0.6, 2.4); }
  onKill() { if (Math.random() < 0.2) this.later(pick(LINES.kill), 0.5, 2); }
  onEscape() { if (Math.random() < 0.6) this.later(pick(LINES.escape), 0.3, 1.5); }
  onSurvive() { if (Math.random() < 0.15) this.later(pick(LINES.survive), 0.4, 1.6); }
  later(text, a, b) { this.game.world.delay(rnd(a, b), () => { if (this.game.players.includes(this.player)) this.say(text); }); }
  idleChat() { if (this.S.phase === 'lobby' && Math.random() < 0.6) this.say(pick(LINES.lobby)); }

  // --- moving ---------------------------------------------------------------------------------------------------------------
  goTo(target, stopR = 0.3, o = {}) {
    const ch = this.ch, p = ch.rootPosition, sp = ch.walkSpeed;
    const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
    let vx = 0, vz = 0;
    if (d > stopR) { const s = o.full ? sp * (this.dr?.role === 'runner' ? this.pace : 1) : Math.min(sp, d * (ch.grounded ? 7 : 10)); vx = dx / d * s; vz = dz / d * s; }
    groundVel(ch, this._gv); vx -= this._gv.x; vz -= this._gv.z;
    let mx = vx / sp, mz = vz / sp;
    const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
    ch.input.move.set(mx, 0, mz);
    return d;
  }
  /** The point of a route step shifted onto this bot's lane (st.w: how far it may stray across; st.ox: the lane's centre). */
  laneOf(st) {
    const w = st.w ?? 3;
    if (!w && !st.ox) return st.p;
    return (this._lt || (this._lt = V())).set(st.p.x + (st.ox || 0) + this.lane * w, st.p.y, st.p.z);
  }
  hold() { if (!this.s.holdAt) this.s.holdAt = this.ch.rootPosition.clone(); this.goTo(this.s.holdAt, 0.3); }

  update(dt) {
    const ch = this.ch;
    if (!ch || !ch.alive) return;
    ch.input.jump = false; ch.input.move.set(0, 0, 0);
    this.chatTimer -= dt * this.chattiness;
    if (this.chatTimer <= 0) { this.chatTimer = rnd(25, 70); this.idleChat(); }
    const S = this.S, role = this.dr?.role;
    if ((S.phase === 'run' || S.phase === 'eye') && role === 'runner' && !this.dr.escaped) this.runner(dt);
    else if ((S.phase === 'run' || S.phase === 'eye' || S.phase === 'intro') && role === 'pharaoh') this.pharaoh(dt);
    else if (S.phase === 'intro' && role === 'runner') { /* waiting at the gate */ if (Math.random() < 0.004) ch.input.jump = true; }
    else this.wander(dt);
    // stuck: a jump usually frees it
    const p = ch.rootPosition;
    if (ch.input.move.lengthSq() > 0.25 && p.distanceTo(this._last) < 1.5 * dt) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    this._last.copy(p);
    if (this.stuckT > 1.2 && ch.grounded) { ch.input.jump = true; this.stuckT = 0.4; }
  }

  wander(dt) {
    const ch = this.ch;
    this.thinkTimer -= dt;
    const c = this.S.course.campCentre;
    if (!c || Math.abs(ch.rootPosition.z - c.z) > 120) return;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = rnd(1.5, 6);
      if (Math.random() < 0.55) { const a = Math.random() * Math.PI * 2, r = rnd(4, 30); this.target = V(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r * 0.8); }
      else this.target = null;
      if (Math.random() < 0.1) this.hops = 2;
    }
    if (this.target && this.goTo(this.target, 1) < 1) this.target = null;
    if (this.hops > 0 && ch.grounded && Math.random() < 0.05) { ch.input.jump = true; this.hops--; }
  }

  // --- the runner ---------------------------------------------------------------------------------------------------------------
  runner(dt) {
    const ch = this.ch, p = ch.rootPosition, route = this.S.route;
    if (this.S.runAt != null && this.game.world.time - this.S.runAt < (this.startDelay || 0)) return;
    this.stepT += dt;
    // a trap went off around it: hide, or run for it
    for (const T of this.S.trapsNear(p)) {
      if (!T.dangerous() || !T.inZone(p, 2)) continue;
      if (T.hideW.length && this.mode !== 'hide') {
        let best = null, bd = 1e9;
        for (const h of T.hideW) { const d = hd(h, p); if (d < bd) { bd = d; best = h; } }
        if (best && bd < 40) { this.mode = 'hide'; this.hide = { at: best, trap: T, react: this.reaction + rnd(0, 0.2) }; }
      }
    }
    if (this.mode === 'hide') {
      const H = this.hide;
      if ((H.react -= dt) > 0) { /* still running on, it hasn't reacted */ }
      else this.goTo(H.at, 0.3, { full: true });
      // when it's over, step back out into the way first (out of a niche, off an altar), then carry on
      if (!H.trap.dangerous()) { this.mode = 'route'; this.hide = null; this.lost(); this.unhide = { at: V(Math.max(-7, Math.min(7, p.x)), p.y, p.z), t: 2 }; }
      return;
    }
    if (this.unhide) {
      this.unhide.t -= dt;
      if (this.unhide.t <= 0 || this.goTo(this.unhide.at, 0.5, { full: true }) < 1) this.unhide = null; else return;
    }
    if (this.si >= route.length) { this.goTo(this.S.finishAt || p, 1); return; }
    for (let n = 0; n < 3 && this.si < route.length; n++) {
      const st = route[this.si];
      if (!this.run(st, this.s, dt)) break;
      this.si++; this.s = {}; this.stepT = 0; dt = 0;
    }
    if (this.stepT > 30) { this.stepT = 0; this.lost(); }
  }
  /** Where am I on the route? (after a fall, a dodge, a push) */
  lost() {
    const p = this.ch.rootPosition, feet = p.y - 3, route = this.S.route;
    let best = -1, bd = 12;
    const from = Math.max(0, this.si - 8), to = Math.min(route.length, this.si + 12);
    for (let i = from; i < to; i++) {
      const e = route[i].p;
      if (!e) continue;
      const d = hd(e, p) + Math.abs(e.y - feet) * 1.5;
      if (d < bd) { bd = d; best = i; }
    }
    this.s = {};
    if (best >= 0) this.si = route[best].type === 'gate' ? best : best + 1;
  }
  run(st, s, dt) {
    const ch = this.ch, p = ch.rootPosition, feet = p.y - 3;
    // don't walk into a trap that's going off
    if (st.type !== 'gate' && st.p) for (const T of this.S.trapsNear(st.p)) if (T.dangerous() && T.inZone(st.p, 1) && !T.inZone(p, 0)) { this.hold(); return false; }
    s.holdAt = null;
    switch (st.type) {
      case 'walk': {
        const d = this.goTo(this.laneOf(st), 0.2, { full: true });
        if (d < (st.r ?? 1.6) && Math.abs(feet - st.p.y) < 3) return true;
        // (fell off: well below both the last point and this one - not just at the foot of a long climb)
        const prev = this.si > 0 ? this.S.route[this.si - 1].p : null;
        if (ch.grounded && feet < Math.min(st.p.y, prev ? prev.y : st.p.y) - 6) this.lost();
        return false;
      }
      case 'jump': {
        s.ph ??= 'to';
        if (s.ph === 'to') { if (this.goTo(st.from, 0.3, { full: true }) > 1 || !ch.grounded) return false; s.ph = 'go'; s.t = 0; if (Math.random() < (1 - this.skill) * 0.5) s.err = V(rnd(-2.2, 2.2), 0, rnd(-1.6, 1.6)); }
        s.t += dt;
        const aim = s.err ? st.p.clone().add(s.err) : st.p;
        if (s.ph === 'go') { if (ch.grounded) { ch.input.jump = true; this.goTo(aim, 0.2, { full: true }); if (s.t > 1) s.ph = 'to'; return false; } s.ph = 'air'; s.air = 0; }
        s.air += dt; this.goTo(aim, 0.2);
        if (ch.grounded && s.air > 0.1) { if (hd(p, st.p) < 3 && Math.abs(feet - st.p.y) < 2.5) return true; this.lost(); }
        return false;
      }
      case 'gate': return this.gate(st, s, dt);
    }
    return true;
  }
  /** At the edge of a trap: go now, or wait for it to be set off (or for it to finish). */
  gate(st, s, dt) {
    const T = st.trap, S = this.S, ch = this.ch;
    if (!s.init) {
      s.init = true; s.t = 0;
      // brave: straight on; careful: wait a while to see if somebody else sets it off
      const fear = (1 - this.brave) * (this.tier === 'pro' ? 1.4 : 1);
      s.patience = fear < 0.3 ? rnd(0, 0.4) : rnd(1, 3 + fear * 6);
      s.chat = Math.random() < 0.2 * fear;
    }
    if (T.dangerous()) { this.goTo(this.laneOf(st), 0.6); s.go = false; return false; }
    if (T.used) return this.goNow(s, dt);
    s.t += dt;
    this.goTo(this.laneOf(st), 0.8);
    // nobody's at the button: off we go (the good ones notice)
    const ph = S.pharaohChar();
    const far = !ph || (T.buttonPos && ph.rootPosition.distanceTo(T.buttonPos) > 40 && this.skill > 0.8);
    // someone ahead is in there: let them be the bait
    const someoneIn = S.runnersIn(T, this.ch) > 0;
    if (s.chat && s.t > 1.5) { s.chat = false; this.say(pick(LINES.bait)); }
    const late = S.timeLeft() < 40;
    if (far || late || (!someoneIn && s.t > s.patience) || s.t > s.patience + 9) return this.goNow(s, dt);
    return false;
  }
  goNow(s, dt) {
    if (s.react == null) s.react = this.reaction;
    s.react -= dt;
    return s.react <= 0;
  }

  // --- the Pharaoh ---------------------------------------------------------------------------------------------------------------
  pharaoh(dt) {
    const S = this.S, ch = this.ch, P = this.ph, p = ch.rootPosition;
    if (S.phase === 'intro') return;
    P.think -= dt;
    if (P.think <= 0) { P.think = 0.2; P.target = S.pharaohTarget(); }
    const T = P.target;
    if (!T) { if (Math.random() < 0.002) this.say(pick(LINES.pharaoh)); return; }
    // get to the button (through the portals if it's in another hall)
    const myHall = S.hallAt(p);
    if (myHall !== T.sec) {
      const H = S.course.halls[myHall];
      const portal = S.course.portals.find((q) => q.hall === myHall && q.dir === (T.sec > myHall ? 1 : -1));
      if (portal) this.goTo(portal.at, 0.2, { full: true }); else if (H?.galleryEnd) this.goTo(H.galleryEnd, 0.5, { full: true });
      return;
    }
    const d = this.goTo(T.buttonPos, 1.2, { full: true });
    if (d > 6) return;
    // at the button: wait for people to walk in
    const inside = S.runnersIn(T), coming = S.runnersComing(T, 30);
    if (inside > 0) {
      P.t += dt;
      // a greedy Pharaoh waits for the ones following; a jumpy one fires at once
      if (P.react <= 0) P.react = this.reaction + rnd(0.15, 0.6) + (coming > inside && Math.random() < 0.5 ? rnd(0.3, 1.2) : 0);
      if (P.t >= P.react) { S.fireTrap(T, this.player); P.t = 0; P.react = 0; P.fired++; }
    } else { P.t = 0; P.react = 0; if (coming && Math.random() < 0.002 * (1 - this.skill)) { S.fireTrap(T, this.player); } }
  }
}
