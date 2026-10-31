// LAST LOOKOUT — the horde: every zombie is either ANIMATED (dormant ragdoll posed by a motion
// clip, out of the physics world, still solid to bullets) or PHYSICAL (a full active ragdoll with
// the Euphoria-style controller and the injury model). Shots, blasts and trip wires make an
// animated zombie physical; one that regains its feet blends back into its clip (limping on a
// bad leg, crawling on two); the dead settle and are frozen out of the physics altogether.
import { Vec3, Quat, clamp } from '../../physics/math.js';
import { ENEMIES, PLAYER } from '../catalog.js';

const _v0 = new Vec3();
const _v1 = new Vec3();
const _v2 = new Vec3();
const _q0 = new Quat();
const UP = new Vec3(0, 1, 0);
const SIDES = ['L', 'R'];

/** Which locomotion clip a zombie can still manage, from what its legs can do. */
function gaitFor(person) {
  const ls = person.ctl.legStrength;
  const L = ls.L, R = ls.R;
  if (L < 0.3 && R < 0.3) return 'crawl';
  if (Math.min(L, R) < 0.3) return 'crawl';
  if (L < 0.7) return 'limpL';
  if (R < 0.7) return 'limpR';
  return null;
}

let nextZid = 1;
const ANIMATED = new Set(['walk', 'attack', 'fence', 'getup', 'toLeg', 'climb', 'top']);

export class Zombie {
  constructor(horde, person, kind, anim, opts) {
    this.id = nextZid++;
    this.horde = horde;
    this.person = person;
    this.kind = kind;
    this.def = ENEMIES[kind];
    this.anim = anim;
    const rng = horde.rng;
    this.root = { pos: opts.pos.clone(), yaw: opts.yaw };
    this.facing = opts.yaw;
    this.speedVar = 0.88 + 0.24 * rng();
    this.state = 'walk';
    this.mode = kind === 'crawler' ? 'crawl' : 'walk'; // gait: walk | crawl | limpL | limpR
    this.gate = -1;
    this.slot = (rng() - 0.5) * 2;
    this.t = 0;
    this.physT = 0;
    this.stableT = 0;
    this.downT = 0;
    this.corpseT = 0;
    this.quietT = 0;
    this.alertUntil = -1;
    this.screamT = 8 + rng() * 10;
    this.lastHit = null; // { by, time, head, dist, ammo, shot, moving, climbing, wire }
    this.fragments = [];
    this.climb = null;
    this.attackT = rng();
    this.playClip(true);
  }

  get alive() {
    return this.person.injury.alive;
  }

  /** Posed by its clip (not physical, not a corpse). */
  get animated() {
    return ANIMATED.has(this.state);
  }

  /** Ground speed the zombie means to move at now. */
  speed() {
    const H = this.horde;
    if (this.mode === 'crawl') return ENEMIES.crawler.speed * this.speedVar;
    let s = this.def.speed * this.speedVar;
    if (this.mode === 'limpL' || this.mode === 'limpR') s = Math.min(s, 0.55 * this.speedVar);
    if (this.alertUntil > H.time && this.mode === 'walk') s = Math.max(s, 3.0 * this.speedVar);
    return s;
  }

  clipFor() {
    if (this.state === 'attack') return this.attackClip || 'attack';
    if (this.state === 'climb' || this.state === 'fence') return 'climb';
    if (this.state === 'getup') return 'getup';
    if (this.state === 'top') return 'attack';
    if (this.mode !== 'walk') return this.mode;
    if (this.alertUntil > this.horde.time) return 'sprint';
    return this.def.clip;
  }

  playClip(force = false) {
    const name = this.clipFor();
    if (!force && this.anim.clip === name) return;
    const H = this.horde;
    this.anim.play(name, { fade: force ? 0 : 0.3, phase: force ? H.rng() : undefined });
    this.clipName = name;
  }

  /** Rate so the clip's own ground speed matches how fast the zombie moves. */
  syncRate(speed) {
    const info = this.horde.clipInfo[this.anim.clip];
    if (info && info.speed > 0.05) this.anim.setRate(clamp(speed / info.speed, 0.4, 2.2));
    else this.anim.setRate(0.9 + 0.2 * this.speedVar - 0.1);
  }
}

export class Horde {
  /**
   * game: { sb, field, layout, rng, makeAnim(rd, seed), clipInfo, emit(e), gate: { hp }, player: { hp } }
   */
  constructor(game, opts = {}) {
    this.game = game;
    this.sb = game.sb;
    this.field = game.field;
    this.layout = game.layout;
    this.rng = game.rng;
    this.clipInfo = game.clipInfo;
    this.list = [];
    this.corpses = [];
    this.maxPhysical = opts.maxPhysical ?? 10;
    this.maxCorpses = opts.maxCorpses ?? 60;
    this.time = 0;
    this.gateDps = new Float32Array(this.field.gates.length);
    this.gateCount = new Int16Array(this.field.gates.length);
    this.cell = new Map(); // spatial hash for separation
    this._dir = new Vec3();
    this._sep = new Vec3();
  }

  get physicalCount() {
    let n = 0;
    for (const z of this.list) if (z.state === 'phys' || z.state === 'dead') n++;
    return n;
  }

  get aliveCount() {
    let n = 0;
    for (const z of this.list) if (z.alive) n++;
    return n;
  }

  // -------------------------------------------------------------------------------------------
  spawn(kind, pos, yaw) {
    const def = ENEMIES[kind];
    const sb = this.sb;
    const person = sb.spawnPerson(new Vec3(pos.x, 0, pos.z), yaw, {
      undead: true, hp: def.hp, armor: def.armor ? { ...def.armor } : undefined, look: kind, knockback: def.boss ? 0.35 : 1,
    });
    person.towerKind = kind;
    // a head shot does not drop them on the spot: a stumble, the legs go, then down (Red Dead)
    person.injury.deathStumble = def.boss ? [0.9, 1.6] : [0.45, 1.25];
    const ctl = person.ctl;
    ctl.fearless = true;
    ctl.assistTilt = 0.24;
    if (def.boss) ctl.strengthScale = kind === 'juggernaut' ? 1.6 : 1.35;
    sb.setDormant(person, true);
    const anim = this.game.makeAnim(person.rd, (this.rng() * 1e9) | 0);
    const z = new (this.ZombieClass || Zombie)(this, person, kind, anim, { pos, yaw });
    person.towerZombie = z;
    this.list.push(z);
    // first pose, so it is drawn and hittable at once
    this.poseAnimated(z, 1 / 60);
    this.game.emit({ type: 'zombieSpawned', zombie: z });
    return z;
  }

  // -------------------------------------------------------------------------------------------
  /** One fixed step (before the physics step). */
  step(dt) {
    this.time += dt;
    this.gateDps.fill(0);
    this.gateCount.fill(0);
    this.buildGrid();
    for (const z of this.list) {
      z.t += dt;
      if (z.animated) this.stepAnimated(z, dt);
      else if (z.state === 'phys') this.stepPhysical(z, dt);
      else if (z.state === 'dead') this.stepCorpse(z, dt);
    }
    this.enforceBudget();
    // the gate takes the battering
    let dps = 0;
    for (let i = 0; i < this.gateDps.length; i++) dps += this.gateDps[i];
    if (dps > 0) this.game.damageGate(dps * dt, this.gateDps);
    if (this.list.length > 400) this.list = this.list.filter((z) => z.state !== 'gone');
  }

  buildGrid() {
    const g = this.cell;
    for (const arr of g.values()) arr.length = 0;
    for (const z of this.list) {
      if (!z.animated || z.state === 'climb' || z.state === 'top') continue;
      const k = ((Math.floor(z.root.pos.x / 2) + 512) << 10) | (Math.floor(z.root.pos.z / 2) + 512);
      let arr = g.get(k);
      if (!arr) g.set(k, (arr = []));
      arr.push(z);
    }
  }

  separation(z, out) {
    out.set(0, 0, 0);
    const p = z.root.pos;
    const cx = Math.floor(p.x / 2), cz = Math.floor(p.z / 2);
    const r = z.mode === 'crawl' ? 1.3 : 0.75;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = this.cell.get(((cx + i + 512) << 10) | (cz + j + 512));
        if (!arr) continue;
        for (const o of arr) {
          if (o === z) continue;
          const dx = p.x - o.root.pos.x, dz = p.z - o.root.pos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > r * r || d2 < 1e-8) continue;
          const d = Math.sqrt(d2), k = (r - d) / (r * d);
          out.x += dx * k;
          out.z += dz * k;
        }
      }
    }
    return out;
  }

  // -------------------------------------------------------------------------------------------
  stepAnimated(z, dt) {
    const H = this, F = this.field, root = z.root, p = root.pos;
    if (!z.alive) {
      // (killed while animated - e.g. a blast's injuries): it goes physical to fall
      this.wake(z, { mode: 'falling' });
      return;
    }
    const kind = z.kind;
    if (z.person.injury.dying) {
      this.wake(z, { mode: 'balance', cause: 'shot' });
      return;
    }
    switch (z.state) {
      case 'walk': {
        const dir = this._dir;
        let steer = false;
        // climbers leave the field near the compound and head for their leg
        if (kind === 'climber' && z.mode !== 'crawl') steer = this.climberSteer(z, dir);
        if (!steer && !F.direction(p.x, p.z, dir)) dir.set(-p.x, 0, -p.z).normalize();
        const sep = this.separation(z, this._sep);
        dir.x += sep.x * 0.9;
        dir.z += sep.z * 0.9;
        const l = Math.hypot(dir.x, dir.z) || 1;
        const want = Math.atan2(dir.x / l, dir.z / l);
        let dy = want - z.facing;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        const turn = (z.mode === 'crawl' ? 1.2 : 2.6) * dt;
        z.facing += clamp(dy, -turn, turn);
        // slow down for sharp turns (no moonwalking round corners)
        const s = z.speed() * (0.45 + 0.55 * Math.max(0, Math.cos(dy)));
        p.x += Math.sin(z.facing) * s * dt + sep.x * 0.4 * dt;
        p.z += Math.cos(z.facing) * s * dt + sep.z * 0.4 * dt;
        root.yaw = z.facing;
        z.syncRate(s);
        // at a gate: batter it
        if (kind !== 'climber' && F.distanceAt(p.x, p.z) < 1.1) this.arriveAtGate(z);
        if (kind === 'screamer') this.screamerThink(z, dt);
        this.checkTraps(z);
        break;
      }
      case 'attack': {
        const g = F.gates[z.gate];
        if (this.game.over && this.game.over.reason === 'gate') {
          // the gate is down: in they pour, toward the tower's foot
          _v0.set(-p.x, 0, -p.z);
          const d = _v0.length();
          if (d > 3.2 + z.rank) {
            _v0.scale(1 / d);
            z.facing = Math.atan2(_v0.x, _v0.z);
            root.yaw = z.facing;
            const s = z.speed() * 1.3;
            p.x += _v0.x * s * dt;
            p.z += _v0.z * s * dt;
            if (z.anim.clip !== 'walk' && z.anim.clip !== z.def.clip) z.anim.play(z.def.clip, { fade: 0.3 });
            z.syncRate(s);
          } else if (z.anim.clip !== 'attack') z.anim.play('attack', { fade: 0.3 });
          break;
        }
        // hold the slot (the crowd still shoves a little)
        root.yaw = Math.atan2(-g.normal[0], -g.normal[1]);
        // (the front rank does the work; a crawler can only claw at the bottom of the gate)
        const k = (z.rank === 0 ? 1 : 0.5) * (z.mode === 'crawl' ? 0.4 : 1);
        H.gateDps[z.gate] += z.def.gate * k;
        H.gateCount[z.gate]++;
        z.attackT += dt;
        if (z.attackT > 2.5 + H.rng() * 3) {
          z.attackT = 0;
          z.attackClip = H.rng() < 0.5 ? 'attack' : 'push';
          z.playClip();
        }
        break;
      }
      case 'fence': {
        // up the chain-link, then over the top - as a body, physically
        const c = z.climb;
        p.x = c.fence.x;
        p.z = c.fence.z;
        p.y = Math.min(c.fenceTop, p.y + z.def.climbSpeed * 1.4 * z.speedVar * dt);
        root.yaw = c.inYaw;
        z.syncRate(z.def.climbSpeed * 1.4 * z.speedVar);
        if (p.y >= c.fenceTop - 1e-3) {
          this.poseAnimated(z, dt);
          this.wake(z, { mode: 'falling', cause: 'fence' });
          // the trunk goes over first, the legs follow: it tips over the top and drops inside
          for (const b of z.person.rd.allBodies()) {
            const over = b.pos.y > c.fenceH ? 2.6 : 1.1;
            b.vel.x += c.n.x * over;
            b.vel.z += c.n.z * over;
            b.vel.y += 0.9;
          }
          return;
        }
        break;
      }
      case 'getup':
        // the get-up clip plays out where it lies, then on it goes
        if (z.anim.finished) {
          z.state = 'walk';
          z.playClip();
        }
        break;
      case 'toLeg': {
        const c = z.climb;
        _v0.set(c.foot.x - p.x, 0, c.foot.z - p.z);
        const d = _v0.length();
        if (d < 0.08) {
          z.state = 'climb';
          z.playClip();
          break;
        }
        _v0.scale(1 / d);
        z.facing = Math.atan2(_v0.x, _v0.z);
        root.yaw = z.facing;
        const s = Math.min(z.speed(), d / dt);
        p.x += _v0.x * s * dt;
        p.z += _v0.z * s * dt;
        z.syncRate(s);
        break;
      }
      case 'climb': {
        const c = z.climb;
        const top = c.topY;
        p.y = Math.min(top, p.y + z.def.climbSpeed * z.speedVar * dt);
        const u = clamp(p.y / top, 0, 1);
        // up the tapering leg, on its outer face
        p.x = c.foot.x + (c.top.x - c.foot.x) * u;
        p.z = c.foot.z + (c.top.z - c.foot.z) * u;
        root.yaw = c.yaw;
        z.syncRate(z.def.climbSpeed * z.speedVar);
        if (p.y >= top - 1e-3) {
          z.state = 'top';
          z.playClip();
          this.game.emit({ type: 'climberTop', zombie: z });
        }
        break;
      }
      case 'top':
        root.yaw = z.climb.yaw;
        this.game.damagePlayer(PLAYER.climberDps * dt, z);
        break;
    }
    this.poseAnimated(z, dt);
  }

  /** Pose the dormant ragdoll from its clip (plus fracture fragments, bounds for the shots). */
  poseAnimated(z, dt) {
    z.anim.update(dt, z.root);
    const rd = z.person.rd;
    for (const f of z.fragments) {
      const P = f.parent;
      _v1.copy(f.relPos).applyQuat(P.rot).add(P.pos);
      f.body.framePos.copy(f.body.pos);
      f.body.frameRot.copy(f.body.rot);
      f.body.pos.copy(_v1);
      f.body.rot.multiplyQuats(P.rot, f.relRot);
      f.body.vel.copy(P.vel);
    }
    for (const b of rd.allBodies()) b.computeAABB(0, 0.02);
  }

  /** Climbers: near the compound, leave the field and head for the fence by their leg. */
  climberSteer(z, dir) {
    const R = this.layout.compound.rect, p = z.root.pos;
    if (p.x > R.minX + 0.2 && p.x < R.maxX - 0.2 && p.z > R.minZ + 0.2 && p.z < R.maxZ - 0.2) {
      // over the fence already (it flopped in): straight for a leg
      if (!z.climb) z.climb = this.planClimb(z);
      z.state = 'toLeg';
      z.playClip();
      return true;
    }
    const dx = Math.max(R.minX - p.x, 0, p.x - R.maxX), dz = Math.max(R.minZ - p.z, 0, p.z - R.maxZ);
    if (Math.hypot(dx, dz) > 9) return false;
    if (!z.climb) z.climb = this.planClimb(z);
    const c = z.climb;
    _v0.set(c.from.x - p.x, 0, c.from.z - p.z);
    const d = _v0.length();
    if (d < 0.25) {
      z.state = 'fence';
      p.y = 0;
      z.facing = c.inYaw;
      z.root.yaw = c.inYaw;
      z.playClip();
      return true;
    }
    dir.copy(_v0).scale(1 / d);
    return true;
  }

  planClimb(z) {
    const L = this.layout, T = L.tower, R = L.compound.rect, p = z.root.pos;
    // the leg on this zombie's side of the tower
    let best = 0, bd = Infinity;
    T.legs.forEach((leg, i) => {
      const d = Math.hypot(leg[0] - p.x, leg[1] - p.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    const leg = T.legs[best], top = T.legTop[best];
    const ox = Math.sign(leg[0]) || 1, oz = Math.sign(leg[1]) || 1;
    // over the fence on the side facing the zombie, near the leg's corner
    const sideX = Math.abs(p.x) - Math.abs(leg[0]) > Math.abs(p.z) - Math.abs(leg[1]);
    const fx = sideX ? (ox > 0 ? R.maxX : R.minX) : leg[0] + ox * 1.4;
    const fz = sideX ? leg[1] + oz * 1.4 : oz > 0 ? R.maxZ : R.minZ;
    const n = new Vec3(sideX ? -ox : 0, 0, sideX ? 0 : -oz); // into the compound
    // the leg's near (outer) face: the climb clip grips just in front of root.pos
    const dl = new Vec3(ox, 0, oz).normalize();
    // (the clip grips ~4-11 cm in front of root.pos: keep the hands on the surface, not in it,
    // or the solver throws the body off when it goes physical)
    const face = 0.16 + 0.13;
    return {
      leg: best, n,
      from: new Vec3(fx - n.x * 0.55, 0, fz - n.z * 0.55),
      fence: new Vec3(fx - n.x * 0.2, 0, fz - n.z * 0.2),
      fenceTop: Math.max(0.6, (L.compound.fenceHeight || 2.2) - 0.5), // hips over the top
      fenceH: L.compound.fenceHeight || 2.2,
      inYaw: Math.atan2(n.x, n.z),
      foot: new Vec3(leg[0] + dl.x * face, 0, leg[1] + dl.z * face),
      top: new Vec3(top[0] + dl.x * face, top[1], top[2] + dl.z * face),
      topY: top[1] - 1.75,
      yaw: Math.atan2(-dl.x, -dl.z),
    };
  }

  arriveAtGate(z) {
    const F = this.field, p = z.root.pos;
    const gi = Math.max(0, F.gateAt(p.x, p.z));
    const g = F.gates[gi];
    // a place along the gate, ranks behind it as the crowd builds
    let n = 0;
    for (const o of this.list) if (o.state === 'attack' && o.gate === gi) n++;
    z.rank = Math.floor(n / 4);
    const along = clamp(z.slot, -1, 1) * Math.max(0.2, g.width / 2 - 0.35);
    const ax = (g.b[0] - g.a[0]) / g.width, az = (g.b[1] - g.a[1]) / g.width;
    p.x = g.front.x + ax * along + g.normal[0] * z.rank * 0.65;
    p.z = g.front.z + az * along + g.normal[1] * z.rank * 0.65;
    z.gate = gi;
    z.state = 'attack';
    z.attackClip = this.rng() < 0.5 ? 'attack' : 'push';
    z.attackT = this.rng() * 2;
    z.playClip();
    this.game.emit({ type: 'zombieAtGate', zombie: z, gate: gi });
  }

  screamerThink(z, dt) {
    z.screamT -= dt;
    const p = z.root.pos;
    if (z.screamT > 0 || Math.hypot(p.x, p.z) > 150) return;
    z.screamT = 18 + this.rng() * 8;
    const S = z.def.scream;
    for (const o of this.list) {
      if (!o.alive || o.kind === 'screamer' || o.kind === 'crawler' || o.def.boss) continue;
      if (o.root.pos.distanceTo(p) < S.radius) {
        o.alertUntil = this.time + S.dur;
        if (o.animated) o.playClip();
      }
    }
    this.game.emit({ type: 'scream', zombie: z, pos: p.clone() });
  }

  checkTraps(z) {
    const D = this.game.defences;
    if (D) D.checkZombie(z);
  }

  // -------------------------------------------------------------------------------------------
  /**
   * Make an animated zombie physical (a hit, a blast, a trip). Its bodies keep the velocities the
   * clip gave them. opts.mode: the controller mode to start in.
   */
  wake(z, opts = {}) {
    if (!z.animated) return false;
    const person = z.person;
    // fracture fragments rode along rigidly; joints take over again from here
    this.sb.setDormant(person, false, { mode: opts.mode || (z.root.pos.y > 0.4 ? 'falling' : 'balance') });
    const ctl = person.ctl;
    ctl.heading = z.root.yaw;
    z.wasState = z.state;
    z.state = 'phys';
    z.physT = 0;
    z.stableT = 0;
    z.downT = 0;
    z.gate = -1;
    this.game.emit({ type: 'zombieWoke', zombie: z, cause: opts.cause || 'hit' });
    return true;
  }

  stepPhysical(z, dt) {
    const person = z.person, ctl = person.ctl;
    z.physT += dt;
    if (!z.alive) {
      z.state = 'dead';
      z.corpseT = 0;
      z.quietT = 0;
      this.game.zombieDied(z);
      return;
    }
    // mortally hit and stumbling: no getting back into a clip, it is going down
    if (z.person.injury.dying) return;
    const v = ctl.sens.comVel;
    const vh = Math.hypot(v.x, v.z);
    const pressure = this.physicalCount > this.maxPhysical;
    if (ctl.mode === 'balance' && ctl.modeTime > (pressure ? 0.25 : 0.45) && vh < 1.3) z.stableT += dt;
    else z.stableT = 0;
    if (ctl.mode === 'ground' || ctl.mode === 'unconscious' || ctl.mode === 'falling') z.downT += dt;
    else if (ctl.mode !== 'getup') z.downT = 0;
    const gait = gaitFor(person);
    // back on its feet: into the clip again
    if (z.stableT > (pressure ? 0.1 : 0.3) && z.physT > 0.5) {
      this.recover(z, gait || 'walk');
      return;
    }
    // down with legs that will not carry it: it crawls on
    if (gait === 'crawl' && z.downT > (pressure ? 0.6 : 1.4)) {
      this.recover(z, 'crawl');
      return;
    }
    // on its back for a moment: the get-up clip (cheaper than the physical get-up); face down it
    // gets up physically, or gives up and crawls
    if (ctl.mode !== 'getup' && z.downT > (pressure ? 0.8 : 1.6)) {
      const f = z.anim.bodyFacing();
      if (f === 'up') {
        this.recover(z, gait || 'walk', { getup: true });
        return;
      }
    }
    if (z.downT > (pressure ? 3 : 8) || z.physT > 16) this.recover(z, 'crawl');
  }

  /**
   * Hand a physical zombie back to a clip, blending from where its body is now: straight into its
   * gait when it is on its feet, the get-up clip when it lies on its back, crawling otherwise.
   */
  recover(z, gait, opts = {}) {
    const person = z.person;
    // fragments ride rigidly with their segment while animated
    z.fragments.length = 0;
    for (const seg of person.rd.segList) {
      if (!seg.fractured) continue;
      for (const fb of seg.fractured.extra) {
        const P = seg.body;
        const inv = _q0.copy(P.rot).conjugate();
        z.fragments.push({
          body: fb, parent: P,
          relPos: _v2.subVectors(fb.pos, P.pos).applyQuat(inv).clone(),
          relRot: new Quat().multiplyQuats(inv, fb.rot),
        });
      }
    }
    z.mode = gait === 'crawl' || gait === 'limpL' || gait === 'limpR' ? gait : 'walk';
    const getup = !!opts.getup && z.mode !== 'crawl';
    z.state = getup ? 'getup' : 'walk';
    const clip = getup ? 'getup' : z.clipFor();
    z.anim.rootFromBodies(z.root, clip);
    z.root.pos.y = 0;
    z.facing = z.root.yaw;
    z.climb = null; // (a climber re-plans from wherever it got up)
    this.sb.setDormant(person, true);
    z.anim.play(clip, { fade: 0 });
    z.clipName = clip;
    z.anim.blendFromPhysics(z.mode === 'crawl' ? 0.7 : 0.45);
    this.game.emit({ type: 'zombieRecovered', zombie: z, gait: z.mode, getup });
  }

  stepCorpse(z, dt) {
    z.corpseT += dt;
    let vmax = 0;
    for (const b of z.person.rd.allBodies()) vmax = Math.max(vmax, b.vel.lengthSq());
    if (vmax < 0.06 * 0.06) z.quietT += dt;
    else z.quietT = 0;
    const pressure = this.physicalCount > this.maxPhysical;
    if (z.quietT > 0.6 || z.corpseT > (pressure ? 1.5 : 6)) this.freeze(z);
  }

  freeze(z) {
    this.sb.freezePerson(z.person);
    z.state = 'frozen';
    this.corpses.push(z);
    if (this.corpses.length > this.maxCorpses) {
      const old = this.corpses.shift();
      old.state = 'gone';
      this.game.emit({ type: 'corpseRemoved', zombie: old });
    }
  }

  /** Over the physics budget: settle the oldest corpses first, then hurry recoveries. */
  enforceBudget() {
    let n = this.physicalCount;
    if (n <= this.maxPhysical) return;
    const dead = this.list.filter((z) => z.state === 'dead').sort((a, b) => b.corpseT - a.corpseT);
    for (const z of dead) {
      if (n <= this.maxPhysical) return;
      if (z.corpseT > 0.8) {
        this.freeze(z);
        n--;
      }
    }
  }

  /** Remove everything (a new run). */
  clear() {
    for (const z of this.list) {
      if (z.state !== 'frozen' && z.state !== 'gone') this.sb.removePerson(z.person);
      this.game.emit({ type: 'zombieRemoved', zombie: z });
    }
    this.list.length = 0;
    this.corpses.length = 0;
  }
}

export { SIDES, UP };
