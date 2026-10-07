// The other riders. Each has a personality: how brave they are about
// stepping out, whether they dawdle (and get left behind), whether they
// can't stop jumping. When the doors open they decide whether to go and
// look, wander to a few places on the floor, say something about it, and
// (usually) come back before the doors close.
import * as THREE from 'three';
import { BotBrain, CHAT_LINES, pick } from '../../engine/Bots.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DOOR_Z = -9;
const CAR_LINES = ['which floor is next', 'i love elevator music', 'dont press the alarm', 'lol', 'this elevator is so slow', 'what floor are we on', 'i hope its the lava floor', 'is this elevator going anywhere', 'press the button', 'elevator gang', 'hi', 'wait for me next time', 'im not getting out', 'who farted', 'this music tho', 'how many floors are there', 'i got to the top 5 times'];
const BOARD_LINES = ['get in get in', 'elevator time', 'come on', 'lets go', 'wait for meee', 'everybody in'];

export class Rider extends BotBrain {
  constructor(game, player, E) {
    super(game, player, { chattiness: 0.45 });
    this.E = E;
    this.bravery = Math.random() < 0.2 ? rnd(0.05, 0.3) : rnd(0.4, 1.1);
    this.dawdle = Math.random() < 0.22; // comes back late
    this.jumpy = Math.random() < 0.28;
    this.mode = 'car'; this.plan = []; this.waitT = 0; this.goAt = 0; this.backAt = 0;
    this.home = null;
    this.arriveRadius = 1.4;
    this.jumpT = rnd(1, 4);
  }
  idleChat() { this.say(pick(this.mode === 'out' && this.E.cur?.def.lines ? this.E.cur.def.lines : CAR_LINES)); }
  /** Stand somewhere inside. */
  goHome() { this.mode = 'car'; this.home = this.E.car.spot(); this.target = this.home.clone(); this.plan = []; }
  /** The doors have opened on a floor. */
  floorOpened(def, F) {
    if (!this.ch?.alive) return;
    const b = def.bots || {};
    this.allowGapJumps = !!b.gaps; this.jumpGaps = b.gaps !== false;
    if (def.lobby) { this.mode = 'lobby'; this.boardAt = rnd(4, 14); this.target = null; return; }
    const venture = (b.venture ?? 0.5) * this.bravery;
    if (Math.random() > venture) { this.goHome(); if (Math.random() < 0.25) this.later(rnd(1, 4), () => this.say(pick(['nope', 'im staying in here', 'not going out there', 'ill wait', 'nah']))); return; }
    this.mode = 'wait'; this.goAt = F.t + rnd(0.3, 3.5);
    const spots = typeof b.spots === 'function' ? b.spots(F) : b.spots;
    const n = 1 + Math.floor(Math.random() * 3);
    this.plan = [];
    for (let i = 0; i < n; i++) {
      let p;
      if (spots?.length) { const s = pick(spots); p = V(s[0] + rnd(-1.5, 1.5), 0, s[1] + rnd(-1.5, 1.5)); }
      else { const a = b.area || [-20, -40, 20, -14]; p = V(rnd(a[0], a[2]), 0, rnd(a[1], a[3])); }
      this.plan.push(p);
    }
    const left = def.time;
    this.backAt = this.dawdle && Math.random() < 0.7 ? left - rnd(-0.5, 2.5) : left - rnd(5.5, 10);
    if (def.lines && Math.random() < 0.45) this.later(rnd(1.5, 5), () => this.say(pick(def.lines)));
  }
  /** The doors are about to close: come back (if you were going to). */
  floorClosing() { if (this.mode === 'out' || this.mode === 'wait') { if (!this.dawdle || Math.random() < 0.5) this.mode = 'return'; } }
  later(s, fn) { this.game.world.delay(s, () => { if (this.ch?.alive) fn(); }); }
  think() {
    const E = this.E, F = E.cur?.F, ch = this.ch;
    if (!ch) return;
    const inCar = E.car.inside(ch.rootPosition);
    switch (this.mode) {
      case 'lobby': {
        const def = E.cur?.def;
        if (def?.lobby && E.phase === 'open' && def.time - (F?.t || 0) < this.boardAt) { this.mode = 'return'; if (Math.random() < 0.3) this.say(pick(BOARD_LINES)); break; }
        if (!this.target || this.reached()) { const a = def?.bots?.area || [-30, -60, 30, -14]; this.target = Math.random() < 0.3 ? null : V(rnd(a[0], a[2]), 0, rnd(a[1], a[3])); }
        break;
      }
      case 'wait': if (F && F.t >= this.goAt) this.mode = 'out'; else if (!this.target) this.target = (this.home ||= E.car.spot()).clone(); break;
      case 'out': {
        if (!F || F.t >= this.backAt) { this.mode = 'return'; break; }
        if (this.waitT > 0) { this.target = null; break; }
        if (!this.plan.length) { const b = E.cur.def.bots || {}; const a = b.area; if (a && Math.random() < 0.5) this.plan.push(V(rnd(a[0], a[2]), 0, rnd(a[1], a[3]))); else { this.waitT = rnd(1, 3); break; } }
        this.target = this.plan[0];
        if (this.reached()) { this.plan.shift(); this.waitT = rnd(0.8, 3.5); E.cur.def.botReached?.(F, this); }
        break;
      }
      case 'return':
        if (inCar && ch.rootPosition.z > -6) { this.goHome(); break; }
        this.target = this.home && this.home.z > -6 ? this.home : (this.home = E.car.spot());
        break;
      default: // car
        if (!this.home) this.home = E.car.spot();
        this.target = this.reached() ? null : this.home;
        if (Math.random() < 0.01) this.home = E.car.spot();
    }
  }
  /** Go through the doorway, not into the walls either side of it. */
  steer(dt) {
    const ch = this.ch, t = this.target;
    if (!t || !ch?.alive) return super.steer(dt);
    const p = ch.rootPosition, inCar = this.E.car.inside(p), tIn = t.z > DOOR_Z + 0.5;
    const door = V(Math.max(-3, Math.min(3, p.x)), 0, DOOR_Z - 2.5);
    let via = null;
    if (inCar && !tIn && p.z > DOOR_Z - 1.5) via = door;
    else if (!inCar && tIn && (Math.abs(p.x) > 3.5 || p.z < DOOR_Z - 3.5)) via = door;
    if (!via) return super.steer(dt);
    this.target = via;
    super.steer(dt);
    if (this.target === via) this.target = t;
  }
  update(dt) {
    super.update(dt);
    const ch = this.ch; if (!ch?.alive) return;
    this.waitT -= dt;
    // some people just can't stop jumping
    this.jumpT -= dt;
    if (this.jumpT <= 0) { this.jumpT = this.jumpy ? rnd(0.6, 2.5) : rnd(6, 20); if (ch.grounded && (this.mode === 'out' || this.jumpy)) ch.input.jump = true; }
    // a floor can drive its riders too (go for the idol, run from the dinosaur)
    if (this.mode === 'out' || this.mode === 'return') this.E.cur?.def.botTick?.(this.E.cur.F, this, dt);
  }
}

export function deathLine() { return pick([...CHAT_LINES.die, 'NOOO', 'i was so close', 'why did i go out there', 'rip me', 'ok that was dumb', 'lol i died', 'not again']); }
