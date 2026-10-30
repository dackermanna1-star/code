import { Vec3, Quat, clamp, lerp, smoothstep, wrapAngle } from '../physics/math.js';

/**
 * The undead. A zombie is an ordinary simulated person (same ragdoll, muscles, balance and gait)
 * with a different injury model (see InjurySystem `undead`), no fear, and this brain on top: it
 * goes for the player (or, in the sandbox, for the nearest living dummy), re-routing as the target
 * moves, and swings its arms at it once in reach. Nothing here moves the body directly: the brain
 * only gives walking orders and arm targets, so a zombie that is shot, shoved or tripped staggers
 * and falls like anyone else - and gets back up.
 */
export const ZOMBIE_KINDS = {
  walker: {
    label: 'Walker', speed: 0.85, hp: 230, drive: [2.0, 0.12], lean: 0.2, reach: 0.95,
    damage: 12, cooldown: 1.15, windup: 0.22, strike: 0.2, arms: 'reach', knockback: 1, score: 100,
  },
  runner: {
    label: 'Runner', speed: 2.0, hp: 150, drive: [3, 0.3], lean: 0.15, reach: 0.9,
    damage: 9, cooldown: 0.75, windup: 0.14, strike: 0.16, arms: 'pump', knockback: 1, score: 150,
  },
  brute: {
    label: 'Brute', speed: 1.1, hp: 1900, drive: [2.6, 0.22], lean: 0.12, reach: 1.05,
    damage: 30, cooldown: 1.6, windup: 0.32, strike: 0.22, arms: 'wide', knockback: 0.35, score: 1500,
    armor: { helmet: 4, vest: 0.7 }, boss: true, strength: 1.35,
  },
};

const SIDES = ['L', 'R'];
const _a = new Vec3();
const _b = new Vec3();
const _c = new Vec3();
const _d = new Vec3();
const _q = new Quat();

export class ZombieBrain {
  constructor(sandbox, person, kind = 'walker') {
    this.sb = sandbox;
    this.p = person;
    this.kind = kind;
    this.def = ZOMBIE_KINDS[kind] || ZOMBIE_KINDS.walker;
    const rng = sandbox.rng;
    this.replanT = rng() * 0.4;
    this.attack = null; // { side, t, hit }
    this.cool = 0.5 + rng() * 0.5;
    this.target = null;
    this.phase = rng() * 10;
    this.groan = 1 + rng() * 4;
    this.side = rng() < 0.5 ? 'L' : 'R';
    this.lastPath = null;
    const ctl = person.ctl;
    ctl.fearless = true;
    ctl.driveGain = this.def.drive[0];
    ctl.driveMax = this.def.drive[1];
    ctl.walkLean = this.def.lean;
    // (the undead keep their feet through more: the balance assist holds on to a lurching body
    // longer before it gives up on it - a real fall is still a fall)
    ctl.assistTilt = 0.24;
    // (and they do not trip over their own turns: a stride that falls short is stretched and the
    // body nudged back over it rather than broken off into a stumble)
    ctl.loco.catchMargin = 0.3;
    ctl.violationAssist = 2;
    // the helpers that hold up a body in control (Euphoria-style: they fade out the moment it is
    // knocked off balance, or its legs are shot out from under it) are stronger for the undead -
    // over a chase of a minute a zombie would otherwise stumble over its own feet now and then
    this.assistBoost = { gain: 1.3, vertical: 2 };
    this.applyAssist();
    ctl.loco.maxSpeed = this.def.speed * (0.92 + 0.16 * rng());
    ctl.armDriver = (dt) => this.driveArms(dt);
    if (this.def.strength) ctl.strengthScale = this.def.strength;
  }

  /** Re-apply the boost over the sandbox's assist setting (see Sandbox.applyAssist). */
  applyAssist() {
    const ctl = this.p.ctl;
    ctl.assistGain *= this.assistBoost.gain;
    ctl.vAssist *= this.assistBoost.vertical;
  }

  get alive() {
    return this.p.ctl.alive;
  }

  // ------------------------------------------------------------------------------------------
  /** What to go for: the player if there is one, else the nearest living person who is not undead. */
  pickTarget() {
    const sb = this.sb, me = this.p.rd.pelvis.pos;
    const t = this.target || (this.target = { pos: new Vec3(), aim: new Vec3(), head: new Vec3(), vel: new Vec3(), prev: null, lead: new Vec3(), radius: 0.3, person: null, player: null, height: 1.75 });
    const pl = sb.player;
    if (pl && pl.alive) {
      t.player = pl;
      t.person = null;
      t.pos.set(pl.pos.x, pl.pos.y, pl.pos.z);
      t.head.set(pl.pos.x, pl.pos.y + pl.height - 0.12, pl.pos.z);
      t.aim.set(pl.pos.x, pl.pos.y + pl.height * 0.78, pl.pos.z);
      t.radius = pl.radius ?? 0.3;
      t.height = pl.height;
      return t;
    }
    let best = null, bd = Infinity;
    for (const q of sb.people) {
      if (q === this.p || q.zombie || !q.ctl.alive) continue;
      const o = q.rd.pelvis.pos, d = Math.hypot(o.x - me.x, o.z - me.z);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    if (!best) return null;
    t.player = null;
    t.person = best;
    const pp = best.rd.pelvis.pos, hp = best.rd.segments.head.body.pos, cp = best.rd.segments.chest.body.pos;
    t.pos.set(pp.x, best.ctl.sens.floorY ?? 0, pp.z);
    t.head.copy(hp);
    t.aim.copy(best.ctl.mode === 'balance' ? cp : pp);
    t.radius = 0.22;
    t.height = hp.y - t.pos.y + 0.1;
    return t;
  }

  /** Per frame, before the controller: route to the target, decide to swing. */
  update(dt) {
    const ctl = this.p.ctl;
    if (!ctl.alive) {
      this.attack = null;
      return;
    }
    this.phase += dt;
    this.cool = Math.max(0, this.cool - dt);
    const t = this.pickTarget();
    if (t) ctl.lookTarget = t.head;
    if (ctl.mode !== 'balance') {
      // stumbling, down or getting up: the controller deals with that on its own
      this.attack = null;
      return;
    }
    if (!t) {
      if (ctl.walking) ctl.stopWalk();
      return;
    }
    const me = this.p.rd.pelvis.pos;
    const dx = t.pos.x - me.x, dz = t.pos.z - me.z, dist = Math.hypot(dx, dz);
    // where the target is going: it is headed off rather than followed round (a chase that only
    // ever aims at where the prey is now keeps turning, and a runner cannot turn on a sixpence)
    if (t.prev && t.prev.distanceTo(t.pos) < 1) t.vel.lerp(_a.subVectors(t.pos, t.prev).scale(1 / dt), 0.15);
    else t.vel.setZero();
    (t.prev || (t.prev = new Vec3())).copy(t.pos);
    const ahead = clamp((dist - 1.2) / Math.max(0.8, ctl.loco.maxSpeed), 0, 1.2) * 0.7;
    t.lead.set(t.pos.x + t.vel.x * ahead, t.pos.y, t.pos.z + t.vel.z * ahead);
    // closing in, each takes its own side of the prey (a crowd surrounds it instead of piling up
    // behind one another and tripping over each other's feet)
    if (dist < 4) {
      const ang = Math.atan2(me.x - t.pos.x, me.z - t.pos.z);
      let push = 0;
      for (const o of this.sb.people) {
        if (o === this.p || !o.zombie || !o.ctl.alive) continue;
        const op = o.rd.pelvis.pos, od = Math.hypot(op.x - t.pos.x, op.z - t.pos.z);
        if (od > 4) continue;
        const da = wrapAngle(ang - Math.atan2(op.x - t.pos.x, op.z - t.pos.z));
        if (Math.abs(da) < 0.9) push += (da >= 0 ? 1 : -1) * (0.9 - Math.abs(da)) * (od < dist ? 1 : 0.4);
      }
      if (Math.abs(push) > 0.02) {
        const a = ang + clamp(push, -0.9, 0.9), r = Math.min(dist, 1.5);
        t.lead.set(t.pos.x + Math.sin(a) * r * 0.6, t.pos.y, t.pos.z + Math.cos(a) * r * 0.6);
      }
    }
    // (distances between the pelvis and the target's axis)
    const stopAt = t.radius + 0.42 * (this.def.reach / 0.95), resume = stopAt + 0.35;
    const reach = t.radius + this.def.reach * 0.8;
    this.dist = dist;
    // ---- chase: walk up to arm's length, re-routing as the target moves; close by but facing
    // away, the same walk turns it round (the gait turns on the spot first)
    this.replanT -= dt;
    const err = wrapAngle(Math.atan2(dx, dz) - ctl.heading);
    const far = dist > (ctl.walking ? stopAt : resume);
    const turn = Math.abs(err) > (ctl.walking ? 0.25 : 0.5) && dist > 0.45;
    // (a straight chase is re-aimed every frame, so the way to go turns smoothly as the target
    // moves; a route around things only every few tenths of a second)
    const direct = this.lastPath && this.lastPath.length === 1;
    if ((far || turn) && (this.replanT <= 0 || !ctl.walking || direct)) {
      this.replanT = 0.3 + this.sb.rng() * 0.25;
      // (a walk shorter than ~0.5 m is no walk at all: people just stand there - the brain stops
      // this one at arm's length instead)
      const path = this.route(t, Math.min(stopAt - 0.12, dist - 0.6));
      if (path) {
        if (ctl.walking) {
          ctl.updateRoute(path);
          ctl.nav.goals[0].copy(path[path.length - 1]);
        } else ctl.walkTo(path, null, { speed: far ? ctl.loco.maxSpeed : 0.5 });
      }
    } else if (!far && !turn && ctl.walking && Math.hypot(ctl.sens.comVel.x, ctl.sens.comVel.z) < 0.8) ctl.stopWalk('arrived');
    // a hard turn to make: ease off first (it is made at a walk, not at a run)
    if (ctl.walking && ctl.nav && far) {
      const lerr = Math.abs(wrapAngle(Math.atan2(t.lead.x - me.x, t.lead.z - me.z) - ctl.heading));
      ctl.nav.speed = ctl.loco.maxSpeed * clamp(1.3 - 0.9 * lerr, 0.4, 1);
    }
    // ---- attack: a swing with one arm, then the other
    if (!this.attack && this.cool <= 0 && dist < reach) {
      const facing = Math.abs(wrapAngle(Math.atan2(dx, dz) - ctl.heading)) < 0.9;
      if (facing && ctl.armStrength[this.side] > 0.3) {
        this.attack = { side: this.side, t: 0, hit: false };
        this.side = this.side === 'L' ? 'R' : 'L';
        this.cool = this.def.cooldown * (0.85 + 0.3 * this.sb.rng());
        this.sb.fx({ type: 'zombieSwing', person: this.p, kind: this.kind });
      }
    }
    if (this.attack) {
      const A = this.attack;
      A.t += dt;
      const strikeEnd = this.def.windup + this.def.strike;
      if (!A.hit && A.t > this.def.windup * 0.7 && A.t < strikeEnd + 0.06) this.checkHit(A, t);
      if (A.t > strikeEnd + 0.3) this.attack = null;
    }
    this.groan -= dt;
    if (this.groan <= 0) {
      this.groan = 2.5 + this.sb.rng() * 5;
      this.sb.fx({ type: 'zombieGroan', person: this.p, kind: this.kind, near: dist });
    }
  }

  /** Route toward the target, ending `stop` metres short of it. */
  route(t, stop) {
    const me = this.p.rd.pelvis.pos;
    const goal = t.lead.lengthSq() > 0 ? t.lead : t.pos;
    const path = this.sb.zombieRoute(me, goal);
    if (!path || !path.length) return null;
    const last = path[path.length - 1];
    const prev = path.length > 1 ? path[path.length - 2] : me;
    const lx = goal.x - prev.x, lz = goal.z - prev.z, ll = Math.hypot(lx, lz);
    // (a negative `stop` runs on past the target's centre line: see update)
    if (ll > stop + 0.05 && ll > 1e-3) last.set(goal.x - (lx / ll) * stop, last.y, goal.z - (lz / ll) * stop);
    else if (path.length > 1) path.pop();
    else return null;
    this.lastPath = path;
    return path;
  }

  /** The swinging hand reached the target? (the player: a capsule; a dummy: its real bodies) */
  checkHit(A, t) {
    const ctl = this.p.ctl;
    const hand = this.p.rd.segments['hand' + A.side].body;
    const hp = hand.pos;
    if (t.player) {
      // distance from the hand to the player's axis between the knees and the top of the head
      const y0 = t.pos.y + 0.45, y1 = t.pos.y + t.height;
      const cy = clamp(hp.y, y0, y1);
      const d = Math.hypot(hp.x - t.pos.x, hp.y - cy, hp.z - t.pos.z);
      if (d < t.radius + 0.12) {
        A.hit = true;
        const dmg = this.def.damage * (0.85 + 0.3 * this.sb.rng());
        this.sb.hitPlayer(dmg, hp, this.kind === 'brute' ? 'smash' : 'claw', this.p);
        // the blow costs the zombie a little balance too (it has hit something solid)
        _a.set(t.pos.x - hp.x, 0, t.pos.z - hp.z).normalize().scale(-20 * this.def.knockback);
        hand.applyImpulse(_a, hp);
      }
      return;
    }
    if (!t.person) return;
    // a dummy: find its body nearest to the hand; the physical contact does the rest, helped along
    // by the zombie's weight behind the blow
    let best = null, bd = Infinity;
    for (const sg of t.person.rd.segList) {
      const d = sg.body.pos.distanceTo(hp);
      if (d < bd) {
        bd = d;
        best = sg.body;
      }
    }
    if (best && bd < 0.2) {
      A.hit = true;
      _a.copy(hand.vel);
      _a.y = Math.max(_a.y, 0);
      const sp = _a.length();
      if (sp > 0.5) _a.scale((this.def.damage * 0.9) / sp);
      else _a.set(t.pos.x - this.p.rd.pelvis.pos.x, 0.2, t.pos.z - this.p.rd.pelvis.pos.z).normalize().scale(this.def.damage * 0.9);
      best.applyImpulse(_a, hp);
      this.sb.fx({ type: 'zombieHit', person: this.p, victim: t.person, point: hp.clone(), kind: this.kind });
      ctl.events.push({ type: 'zombieHit' });
    }
  }

  // ------------------------------------------------------------------------------------------
  /**
   * Arm targets (called by the controller after its own arm layer, in standing balance): the
   * classic reach toward the prey, pumping arms on a runner, and the swings.
   */
  driveArms(dt) {
    const ctl = this.p.ctl;
    if (!ctl.alive || !ctl.conscious || ctl.mode !== 'balance') return;
    // a stumble needs the arms for balance
    if ((ctl.flail || 0) > 0.35 || (ctl.wmAmount || 0) > 0.05) return;
    const chest = this.p.rd.segments.chest.body;
    const t = this.target;
    const hx = Math.sin(ctl.heading), hz = Math.cos(ctl.heading);
    const lx = hz, lz = -hx;
    const speed = Math.hypot(ctl.sens.comVel.x, ctl.sens.comVel.z);
    for (const s of SIDES) {
      if (ctl.armStrength[s] < 0.15) continue;
      const sg = s === 'L' ? 1 : -1;
      const sh = chest.localToWorld(ctl.geo['shoulderAnchor' + s], _a);
      const A = this.attack && this.attack.side === s ? this.attack : null;
      const wrist = _b;
      let k = 0.45;
      if (A) {
        // wind-up: the hand goes up and back beside the head; strike: down and through the target
        const w = this.def.windup, st = this.def.strike;
        const aim = t ? t.aim : _c.set(sh.x + hx, sh.y, sh.z + hz);
        const up = _c.set(sh.x - hx * 0.05 + lx * sg * 0.18, sh.y + 0.28, sh.z - hz * 0.05 + lz * sg * 0.18);
        const thru = _d.subVectors(aim, sh);
        const tl = Math.max(0.3, thru.length());
        thru.scale(Math.min(0.72, tl + 0.12) / tl).add(sh);
        if (A.t < w) wrist.lerpVectors(this.restWrist(s, sh, hx, hz, lx, lz, speed, _b), up, smoothstep(0, w, A.t));
        else if (A.t < w + st) wrist.lerpVectors(up, thru, smoothstep(w, w + st, A.t));
        else wrist.copy(thru);
        k = A.t < w ? 0.8 : 1.4;
      } else this.restWrist(s, sh, hx, hz, lx, lz, speed, wrist);
      _c.set(lx * sg * 0.6, -0.6, 0).add(_d.set(-hx * 0.3, 0, -hz * 0.3)).normalize();
      ctl.reachArm(s, wrist, _c, k * Math.max(0.3, ctl.armStrength[s]));
    }
  }

  /** Wrist position of an arm that is not swinging (world), by kind. */
  restWrist(s, sh, hx, hz, lx, lz, speed, out) {
    const sg = s === 'L' ? 1 : -1;
    const ph = this.phase;
    const arms = this.def.arms;
    const t = this.target, dist = this.dist ?? 9;
    if (arms === 'pump') {
      // a runner's arms swing hard with the stride (opposite to the legs), hands clawing forward
      const sw = this.p.ctl.loco.armSwing() * 1.6 * sg;
      const fw = 0.22 + 0.25 * Math.max(0, sw), dn = 0.32 - 0.12 * Math.max(0, sw);
      return out.set(sh.x + hx * fw + lx * sg * 0.07, sh.y - dn, sh.z + hz * fw + lz * sg * 0.07);
    }
    // reaching for the prey: higher and further the closer it is, swaying, a little out of step
    const eager = t ? smoothstep(6, 1.2, dist) : 0;
    const wob = Math.sin(ph * 1.7 + sg * 1.3) * 0.04;
    const fw = (arms === 'wide' ? 0.42 : 0.46) + 0.12 * eager;
    const wide = arms === 'wide' ? 0.3 : 0.12 - 0.04 * eager;
    const dn = (arms === 'wide' ? 0.2 : 0.14) - 0.12 * eager + wob;
    out.set(sh.x + hx * fw + lx * sg * wide, sh.y - dn, sh.z + hz * fw + lz * sg * wide);
    if (t && eager > 0.2) {
      // the hands go for the target's head/chest
      _d.subVectors(t.aim, sh);
      const dl = _d.length();
      if (dl > 0.05) out.lerp(_d.scale(Math.min(0.6, dl) / dl).add(sh), 0.35 * eager);
    }
    return out;
  }
}
