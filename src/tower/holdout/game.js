// HOLDOUT — the on-foot mode of Last Lookout, without any rendering (runs in Node for the tests):
// endless rounds of the dead coming for you across the valley. Points for every hit and kill buy
// your way through the barricades into the rest of the valley, guns off the walls, a roll of the
// crate, a gunsmith's rebuild and field kits. The zombies are Last Lookout's hybrids: posed by
// their motion clips while they come (chasing the player down a distance field over the open
// ground), full Euphoria-style ragdolls with the injury model the moment a round, a boot or a
// blast meets them.
//
// The front end (front.js) feeds input to step() and turns the events into pictures and sound.
// Events: zombieSpawned / zombieRemoved / corpseRemoved / zombieWoke / zombieRecovered (horde),
// rise, attack, fire, hit, kill, points, hurt, arsenal {e}, player {e}, roundStart, roundEnd,
// doorOpened, bought, denied, gunChanged, upgraded, perk, crate, pickupDrop, pickup, pickupGone,
// buffEnd, grenadeThrow, grenadeBounce, explosion, shockwave, meleeHit, scream, over,
// sandbox {fx}.
import { Vec3, Quat, clamp, lerp, makeRng } from '../../physics/math.js';
import { Body } from '../../physics/body.js';
import { Shape } from '../../physics/shapes.js';
import { Sandbox } from '../../game/sandbox.js';
import { WEAPONS, spreadDirections, raycastPeople } from '../../game/weapons.js';
import { meleeParams } from '../../game/melee.js';
import { FpsPlayer, MOVE } from '../../fps/player.js';
import { Arsenal } from '../../fps/arsenal.js';
import { Horde, Zombie } from '../game/horde.js';
import { ENEMIES } from '../catalog.js';
import { AnimPlayer, CLIP_INFO } from '../anim/animPlayer.js';
import { isWater, channelY } from '../level/layout.js';
import { ChaseField } from './chase.js';
import {
  AREAS, DOORS, SPAWNS, LOCKERS, CRATE_SPOTS, CRATE, BENCH, PERKS, GUNS, CRATE_POOL, POINTS, ROUNDS, HERO,
  PICKUPS, PICKUP_CHANCE, areaById, inRect,
} from './areas.js';

const UP = new Vec3(0, 1, 0);
const _v0 = new Vec3();
const _v1 = new Vec3();

// The gunsmith's rebuilds: the same guns with hotter loads (more damage to the undead, deeper
// penetration through a crowd), a faster action and tighter groups.
for (const type of Object.keys(GUNS)) {
  const b = WEAPONS[type];
  WEAPONS[type + '+'] = {
    ...b, label: GUNS[type].up, dmg: 2.2, pen: b.pen * 1.6, rpm: b.rpm * (b.auto ? 1.15 : 1.3),
    spread: b.spread * 0.75, pellets: type === 'shotgun' ? 12 : b.pellets,
  };
}

function staticBox(c) {
  const body = new Body({ name: `level:${c.kind}`, isStatic: true });
  const r = 0.004;
  // (the compound's chain-link stops the dead, not the rounds)
  const material = c.kind === 'fence' && c.material === 'metal' ? 'chainlink' : c.material || 'concrete';
  body.addShape(Shape.box(c.h[0] - r, c.h[1] - r, c.h[2] - r, { radius: r, friction: 0.8, restitution: 0.05, material }));
  body.makeStatic();
  body.setPose(new Vec3(c.c[0], c.c[1], c.c[2]), new Quat().setFromAxisAngle(UP, c.yaw || 0));
  body.userData = { obstacle: true, level: true, kind: c.kind };
  return body;
}

/** Push a point (x, z, radius r) out of an oriented box (world -> box frame -> back). */
function pushOut(b, x, z, r, out) {
  const dx = x - b.x, dz = z - b.z;
  const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
  const cx = clamp(lx, -b.hx, b.hx), cz = clamp(lz, -b.hz, b.hz);
  const ox = lx - cx, oz = lz - cz;
  const d = Math.hypot(ox, oz);
  if (d >= r) return false;
  let nl, ml, push;
  if (d < 1e-6) {
    // centre inside: out through the nearest face
    const e0 = lx + b.hx, e1 = b.hx - lx, e2 = lz + b.hz, e3 = b.hz - lz;
    const m = Math.min(e0, e1, e2, e3);
    nl = m === e0 ? -1 : m === e1 ? 1 : 0;
    ml = nl ? 0 : m === e2 ? -1 : 1;
    push = m + r;
  } else {
    nl = ox / d;
    ml = oz / d;
    push = r - d;
  }
  out.nx = nl * b.c + ml * b.s;
  out.nz = -nl * b.s + ml * b.c;
  out.push = push;
  return true;
}

/**
 * The player on foot: the first-person controller with oriented boxes for walls (the valley's
 * wrecks and buildings stand at all angles) and the edge of the open ground (barricaded areas,
 * the river) as a wall.
 */
export class HoldoutPlayer extends FpsPlayer {
  moveHorizontal(dx, dz, env) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
    for (let s = 0; s < n; s++) {
      const px = this.pos.x, pz = this.pos.z;
      this.pos.x += dx / n;
      this.pos.z += dz / n;
      this.resolve(env);
      if (env.allowed && !env.allowed(this.pos.x, this.pos.z)) {
        const nx = this.pos.x, nz = this.pos.z;
        if (env.allowed(nx, pz)) {
          this.pos.z = pz;
          this.vel.z = 0;
        } else if (env.allowed(px, nz)) {
          this.pos.x = px;
          this.vel.x = 0;
        } else {
          this.pos.x = px;
          this.pos.z = pz;
          this.vel.x = this.vel.z = 0;
        }
      }
    }
  }

  resolve(env) {
    const r = this.radius, y0 = this.pos.y + MOVE.step, y1 = this.pos.y + lerp(MOVE.height, MOVE.crouchHeight, this.crouch);
    const o = this._o || (this._o = { nx: 0, nz: 0, push: 0 });
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const b of env.obbs) {
        if (b.y1 <= y0 || b.y0 >= y1) continue;
        if (Math.abs(this.pos.x - b.x) > b.reach + r || Math.abs(this.pos.z - b.z) > b.reach + r) continue;
        if (!pushOut(b, this.pos.x, this.pos.z, r, o)) continue;
        this.pos.x += o.nx * o.push;
        this.pos.z += o.nz * o.push;
        const vn = this.vel.x * o.nx + this.vel.z * o.nz;
        if (vn < 0) {
          this.vel.x -= vn * o.nx;
          this.vel.z -= vn * o.nz;
        }
        moved = true;
      }
      if (!moved) break;
    }
    // the dead standing in the way hold the player back (and the ones on their feet are shoved)
    if (env.people) {
      for (const p of env.people) {
        const dx = this.pos.x - p.x, dz = this.pos.z - p.z, d = Math.hypot(dx, dz), min = r + p.r;
        if (d >= min || d < 1e-6) continue;
        const nx = dx / d, nz = dz / d, pen = min - d;
        this.pos.x += nx * pen * 0.8;
        this.pos.z += nz * pen * 0.8;
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) {
          this.vel.x -= vn * nx * 0.85;
          this.vel.z -= vn * nz * 0.85;
        }
        if (env.push && p.physical) env.push(p.person, new Vec3(-nx, 0, -nz).scale(Math.min(260, 900 * pen + 40 * Math.max(0, -vn))));
      }
    }
  }
}

/** A Holdout zombie: walkers come at a pace that quickens with the rounds. */
class HoldoutZombie extends Zombie {
  speed() {
    const H = this.horde;
    if (this.mode === 'crawl') return 0.85 * this.speedVar;
    let s = (this.pace === 'jog' ? 2.45 : this.pace === 'sprint' ? 4.05 : this.def.speed) * this.speedVar;
    if (this.mode === 'limpL' || this.mode === 'limpR') s = Math.min(s, 0.8 * this.speedVar);
    else if (this.alertUntil > H.time) s = Math.max(s, 3.7 * this.speedVar);
    return s;
  }

  clipFor() {
    if (this.state === 'attack') return this.mode === 'crawl' ? 'crawl' : 'attack';
    if (this.state === 'getup') return 'getup';
    if (this.mode !== 'walk') return this.mode;
    if (this.alertUntil > this.horde.time || this.pace === 'sprint') return 'sprint';
    if (this.pace === 'jog') return 'jog';
    return this.def.clip;
  }
}

/** The horde, hunting the player instead of battering the compound's gates. */
export class HoldoutHorde extends Horde {
  constructor(game, opts) {
    super(game, opts);
    this.ZombieClass = HoldoutZombie;
  }

  /** A zombie claws its way out of the ground at pos. */
  spawnRising(kind, pos, yaw, hp, pace) {
    const z = this.spawn(kind, pos, yaw);
    const inj = z.person.injury;
    inj.hpMax = inj.hp = hp;
    z.pace = pace || null;
    z.rising = true;
    z.riseT = 0;
    if (z.mode === 'crawl') {
      z.riseDur = 1.6;
      z.playClip(true);
    } else {
      z.riseDur = 1.05;
      z.state = 'getup';
      z.anim.play('getup', { fade: 0, phase: 0 });
      z.anim.setRate(0.85 + 0.3 * this.rng());
    }
    z.root.pos.y = -0.8;
    this.poseAnimated(z, 1 / 60);
    return z;
  }

  /** Move an animated zombie, sliding along walls (it never walks into one). */
  slide(z, mx, mz) {
    const F = this.game.chase, p = z.root.pos;
    if (!F.free(p.x, p.z)) {
      // pushed into a wall's margin or across a barricade line: just let it out
      p.x += mx;
      p.z += mz;
      return;
    }
    if (F.free(p.x + mx, p.z + mz)) {
      p.x += mx;
      p.z += mz;
    } else if (F.free(p.x + mx, p.z)) p.x += mx;
    else if (F.free(p.x, p.z + mz)) p.z += mz;
  }

  reachOf(z) {
    return z.def.boss ? 1.55 : z.mode === 'crawl' ? 1.05 : 1.25;
  }

  stepAnimated(z, dt) {
    const G = this.game, F = G.chase, root = z.root, p = root.pos, pl = G.player, P = pl.pos;
    if (!z.alive || z.person.injury.dying) {
      this.wake(z, { mode: z.alive ? 'balance' : 'falling' });
      return;
    }
    // out of the ground at spawn
    if (z.rising) {
      z.riseT += dt;
      const u = clamp(z.riseT / z.riseDur, 0, 1);
      p.y = -0.8 * (1 - u) * (1 - u);
      if (u >= 1) z.rising = false;
    }
    const dx = P.x - p.x, dz = P.z - p.z, dist = Math.hypot(dx, dz);
    const reach = this.reachOf(z);
    const canReach = pl.alive && P.y - p.y < 1.5;
    switch (z.state) {
      case 'getup':
        if (z.anim.finished) {
          z.state = 'walk';
          z.rising = false;
          p.y = 0;
          z.playClip();
        }
        break;
      case 'walk': {
        const dir = this._dir;
        if (dist > 1e-3 && dist < 8 && F.clearLine(p.x, p.z, P.x, P.z)) dir.set(dx / dist, 0, dz / dist);
        else if (!F.direction(p.x, p.z, dir)) {
          if (dist > 1e-3) dir.set(dx / dist, 0, dz / dist);
          else dir.set(Math.sin(z.facing), 0, Math.cos(z.facing));
        }
        const sep = this.separation(z, this._sep);
        dir.x += sep.x * 0.9;
        dir.z += sep.z * 0.9;
        const l = Math.hypot(dir.x, dir.z) || 1;
        const want = Math.atan2(dir.x / l, dir.z / l);
        let dy = want - z.facing;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        const turn = (z.mode === 'crawl' ? 1.6 : z.pace === 'sprint' || z.kind === 'runner' ? 3.4 : 2.8) * dt;
        z.facing += clamp(dy, -turn, turn);
        // (slow for sharp turns: no moonwalking round corners; and no walking into the player)
        let s = (z.rising ? 0.3 : 1) * z.speed() * (0.45 + 0.55 * Math.max(0, Math.cos(dy)));
        if (dist < reach * 0.75) s = 0;
        this.slide(z, Math.sin(z.facing) * s * dt + sep.x * 0.4 * dt, Math.cos(z.facing) * s * dt + sep.z * 0.4 * dt);
        root.yaw = z.facing;
        z.syncRate(Math.max(s, 0.3));
        if (dist < reach && canReach && !z.rising) this.startAttack(z);
        if (z.kind === 'screamer') this.screamerThink(z, dt);
        this.watchStuck(z, dt, dist);
        break;
      }
      case 'attack': {
        // face the player, shuffle in close
        const want = Math.atan2(dx, dz);
        let dy = want - z.facing;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        z.facing += clamp(dy, -4 * dt, 4 * dt);
        root.yaw = z.facing;
        // (shuffling in close; the crowd round the player spreads out instead of stacking up)
        const sep = this.separation(z, this._sep);
        const s = z.mode !== 'crawl' && dist > 0.85 ? Math.min(0.7, dist - 0.85) * dt : 0;
        this.slide(z, (dx / dist) * s + sep.x * 0.6 * dt, (dz / dist) * s + sep.z * 0.6 * dt);
        z.attackT += dt;
        // the blow lands on the clip's hit event (a crawler claws on a beat)
        let blow = false;
        if (z.mode === 'crawl') {
          if (z.attackT > 1.25) {
            z.attackT = 0;
            blow = true;
          }
        } else for (const e of z.anim.events) if (e.type === 'hit') blow = true;
        if (blow && canReach && dist < reach + 0.5 && Math.abs(dy) < 1.1) G.zombieStrikes(z);
        if (dist > reach + 0.8 || !canReach) {
          z.state = 'walk';
          z.playClip();
        }
        break;
      }
    }
    this.poseAnimated(z, dt);
  }

  startAttack(z) {
    z.state = 'attack';
    z.attackT = 0;
    if (z.mode === 'crawl') {
      z.anim.play('crawl', { fade: 0.2 });
      z.anim.setRate(0.6);
    } else {
      z.anim.play('attack', { fade: 0.18, phase: 0 });
      z.anim.setRate(z.def.boss ? 0.85 : 1.05 + 0.15 * this.rng());
    }
    this.game.emit({ type: 'attack', zombie: z });
  }

  /** A zombie that has gone nowhere for a long while (wedged, cut off) rises somewhere else. */
  watchStuck(z, dt, dist) {
    const p = z.root.pos;
    const A = z.anchor || (z.anchor = { x: p.x, z: p.z, t: 0 });
    A.t += dt;
    if (Math.hypot(p.x - A.x, p.z - A.z) > 3) {
      A.x = p.x;
      A.z = p.z;
      A.t = 0;
    }
    const lost = !isFinite(this.game.chase.distanceAt(p.x, p.z));
    if ((A.t > 12 && dist > 6) || (lost && A.t > 6 && dist > 10)) {
      z.anchor = null;
      this.game.respawn(z);
    }
  }

  screamerThink(z, dt) {
    z.screamT -= dt;
    const p = z.root.pos, P = this.game.player.pos;
    if (z.screamT > 0 || Math.hypot(p.x - P.x, p.z - P.z) > 32) return;
    z.screamT = 16 + this.rng() * 8;
    const S = z.def.scream;
    for (const o of this.list) {
      if (!o.alive || o.kind === 'screamer' || o.kind === 'crawler' || o.def.boss) continue;
      if (o.root.pos.distanceTo(p) < S.radius * 0.6) {
        o.alertUntil = this.time + S.dur;
        if (o.animated && o.state === 'walk') o.playClip();
      }
    }
    this.game.emit({ type: 'scream', zombie: z, pos: p.clone() });
  }
}

export class HoldoutGame {
  /**
   * opts: { layout, shape (BodyShape), walkGrid (built without the gates), rng, makeAnim(rd, seed),
   *         clipInfo, maxPhysical, maxCorpses, substeps }
   */
  constructor(opts) {
    this.layout = opts.layout;
    this.rng = opts.rng ?? makeRng(Date.now() & 0xffff);
    // (12 substeps: close-quarters fighting keeps many ragdolls awake at once; they stay stable)
    this.sb = new Sandbox({ shape: opts.shape, rng: this.rng, groundHalfSize: 270, substeps: opts.substeps ?? 12 });
    this.sb.setAssist(1);
    // the valley as Last Lookout has it, except that the compound's gates stand open
    this.obbs = [];
    for (const c of this.layout.colliders) {
      if (c.kind === 'gate') continue;
      this.sb.world.addBody(staticBox(c));
      const y = c.yaw || 0;
      this.obbs.push({
        x: c.c[0], z: c.c[2], hx: c.h[0], hz: c.h[2], c: Math.cos(y), s: Math.sin(y), y0: c.c[1] - c.h[1], y1: c.c[1] + c.h[1],
        reach: Math.hypot(c.h[0], c.h[2]), kind: c.kind, thin: Math.min(c.h[0], c.h[2]) < 0.1, // (fences: rounds go through)
      });
    }
    this.chase = new ChaseField(opts.walkGrid);
    this.field = { gates: [] }; // (the horde's gate bookkeeping: none here)
    this.makeAnim = opts.makeAnim ?? ((rd, seed) => new AnimPlayer(rd, { seed }));
    this.clipInfo = opts.clipInfo ?? CLIP_INFO;
    this.events = [];
    this.time = 0;
    this.horde = new HoldoutHorde(this, { maxPhysical: opts.maxPhysical ?? 10, maxCorpses: opts.maxCorpses ?? 40 });
    this.player = new HoldoutPlayer({ x: 0, z: 2, yaw: 0 });
    this.arsenal = new Arsenal([]);
    this.recoil = { p: 0, y: 0 };
    this.strike = null;
    this.env = {
      obbs: this.obbs,
      boxes: [],
      floorAt: (x, z, from) => {
        const y = this.sb.world.surfaceAt(x, z, from);
        return y > 0.001 ? y : Math.min(y, channelY(x, z));
      },
      people: [],
      push: (person, force) => {
        if (!person.dormant && !person.frozen) this.sb.pushPerson(person, force);
      },
      allowed: (x, z) => this.allowedAt(x, z),
    };
    this.newRun();
  }

  emit(e) {
    this.events.push(e);
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  // -------------------------------------------------------------------------------------------
  newRun() {
    this.horde.clear();
    for (const e of this.sb.drainFx()) void e;
    this.time = 0;
    this.round = 0;
    this.phase = 'intro'; // intro | fight | break | over
    this.timer = 4;
    this.toSpawn = 0;
    this.total = 0;
    this.bosses = [];
    this.queue = [];
    this.spawnT = 0;
    this.points = POINTS.start;
    this.stats = { kills: 0, headshots: 0, shots: 0, hits: 0, earned: 0, doors: 0, rounds: 0, melee: 0, grenadeKills: 0, bossKills: 0 };
    this.open = new Set(AREAS.filter((a) => a.open).map((a) => a.id));
    this.doorsOpen = new Set();
    this.perks = new Set();
    this.maxSlots = 2;
    this.grenades = HERO.grenades;
    this.grenadesLive = [];
    this.pickups = [];
    this.pickupsThisRound = 0;
    this.buffs = { fury: 0, bounty: 0 };
    this.shock = null;
    this.over = null;
    this.prompt = null;
    this.nextId = 1;
    const spots = CRATE_SPOTS.filter((c) => this.open.has(c.area));
    this.crate = { spot: spots[0], state: 'idle', t: 0, uses: 0, movesAt: this.rollMoves(), gun: null, up: false };
    // the player: by the tower's foot, a sidearm
    const pl = this.player;
    pl.pos.set(0.5, 0, 2.5);
    pl.vel.setZero();
    pl.yaw = 0;
    pl.pitch = -0.05;
    pl.maxHealth = pl.health = HERO.hp;
    pl.alive = true;
    pl.crouch = 0;
    pl.stamina = 1;
    pl.mantling = null;
    pl.hurt.length = 0;
    pl.lastHurt = -10;
    pl.time = 0;
    const ar = this.arsenal;
    ar.guns = [this.makeGun('pistol')];
    ar.index = 0;
    ar.prevIndex = 0;
    ar.state = 'equip';
    ar.t = 0;
    ar.melee = null;
    ar.pending = null;
    ar.adsAmount = 0;
    this.endStrike();
    this.recoil.p = this.recoil.y = 0;
    this.updateOpen();
    this.chase.rebuild(pl.pos.x, pl.pos.z);
  }

  rollMoves() {
    return CRATE.movesAfter[0] + Math.floor(this.rng() * (CRATE.movesAfter[1] - CRATE.movesAfter[0] + 1));
  }

  /** The open areas changed: the chase field and the player's bounds follow. */
  updateOpen() {
    this.openAreas = AREAS.filter((a) => this.open.has(a.id));
    this.chase.setOpen(this.openAreas.map((a) => a.rect));
  }

  inOpen(x, z) {
    for (const a of this.openAreas) {
      const r = a.rect;
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return true;
    }
    return false;
  }

  /** Where the player may stand: on open ground, out of the river. */
  allowedAt(x, z) {
    if (isWater(x, z)) return false;
    const r = 0.3;
    return this.inOpen(x, z) && this.inOpen(x - r, z) && this.inOpen(x + r, z) && this.inOpen(x, z - r) && this.inOpen(x, z + r);
  }

  /** The area at (x, z) (null outside every area). */
  areaAt(x, z) {
    for (const a of AREAS) if (inRect(a.rect, x, z)) return a;
    return null;
  }

  // -------------------------------------------------------------------------------------------
  // guns
  makeGun(type, up = false) {
    const G = GUNS[type];
    const mag = up ? Math.round(G.mag * 1.5) : G.mag;
    const reserve = up ? G.reserve * 2 : G.reserve;
    return {
      ...G, type, up, key: up ? type + '+' : type, w: WEAPONS[up ? type + '+' : type], mag, reserve, ammo: mag, spare: reserve,
      cool: 0, baseReload: G.reload, reload: G.reload * (this.perks && this.perks.has('quick') ? 0.5 : 1), name: up ? G.up : G.name,
    };
  }

  /** The gun in hand (null while it is a melee item, which Holdout has none of). */
  get gun() {
    return this.arsenal.guns[this.arsenal.index] || null;
  }

  ownsGun(type) {
    return this.arsenal.guns.some((g) => g.type === type);
  }

  /** Into the hands: a new slot while there is room, else in place of the gun held. */
  giveGun(type, up = false) {
    const ar = this.arsenal;
    const i = ar.guns.findIndex((g) => g.type === type);
    if (i >= 0) {
      const g = ar.guns[i];
      g.ammo = g.mag;
      g.spare = g.reserve;
      if (i !== ar.index) ar.select(i);
      return g;
    }
    const gun = this.makeGun(type, up);
    if (ar.guns.length < this.maxSlots) {
      ar.guns.push(gun);
      ar.select(ar.guns.length - 1);
    } else {
      ar.guns[ar.index] = gun;
      ar.state = 'equip';
      ar.t = 0;
      ar.pending = null;
      ar.shotsInBurst = 0;
      this.emit({ type: 'gunChanged', gun });
    }
    return gun;
  }

  // -------------------------------------------------------------------------------------------
  /**
   * One fixed step. input (FpsInput.poll's shape): { move: {x, z}, look: {dx, dy}, sprint, crouch,
   * jump, fire, ads, pressed: Set of key codes, wheel }.
   */
  step(dt, input = null) {
    if (this.over && this.over.t > 12) return;
    this.time += dt;
    for (const e of this.sb.drainFx()) this.onSandboxFx(e);
    const pl = this.player;
    if (this.over) this.over.t += dt;
    if (input && pl.alive && !this.over) this.stepPlayer(dt, input);
    else if (!pl.alive) pl.update(dt, NO_INPUT, this.env);
    this.chase.update(dt, pl.pos.x, pl.pos.z);
    this.stepRounds(dt);
    this.horde.step(dt);
    this.stepGrenades(dt);
    this.stepPickups(dt);
    this.stepShock(dt);
    this.stepCrate(dt);
    this.sb.step(dt);
    for (const e of this.sb.drainFx()) this.onSandboxFx(e);
    this.updatePrompt();
    if (!pl.alive && !this.over) this.gameOver();
  }

  stepPlayer(dt, inp) {
    const pl = this.player, ar = this.arsenal;
    const P = inp.pressed || NO_KEYS;
    for (const k of P) {
      if (k.startsWith('Digit')) ar.select(+k.slice(5) - 1);
      else if (k === 'KeyQ') ar.swapLast();
      else if (k === 'KeyR') ar.reload();
      else if (k === 'KeyF') this.use();
      else if (k === 'KeyG') this.throwGrenade();
      else if (k === 'KeyV' && ar.kick(this.stompTarget() !== null)) this.wakeInFront(1.9);
    }
    if (inp.wheel && ar.guns.length > 1) ar.select((ar.index + (inp.wheel > 0 ? 1 : ar.guns.length - 1)) % ar.guns.length);
    ar.ads = !!inp.ads;
    pl.ads = ar.adsAmount > 0.5;
    // the dead within reach of the player block the way
    const people = this.env.people;
    people.length = 0;
    for (const z of this.horde.list) {
      if (!z.alive) continue;
      const q = z.animated ? z.root.pos : z.person.rd.pelvis.pos;
      if (Math.abs(q.x - pl.pos.x) > 3 || Math.abs(q.z - pl.pos.z) > 3) continue;
      if (z.animated ? z.rising || z.mode === 'crawl' : z.person.ctl.mode !== 'balance') continue;
      people.push({ x: q.x, z: q.z, r: z.def.boss ? 0.42 : 0.28, person: z.person, physical: !z.animated });
    }
    pl.update(dt, { move: inp.move, look: inp.look, sprint: inp.sprint, crouch: inp.crouch, jump: inp.jump }, this.env);
    // field kit: adrenaline halves the sprint's cost
    if (this.perks.has('adrenaline') && pl.sprinting) pl.stamina = Math.min(1, pl.stamina + dt / 14);
    for (const e of pl.events) this.emit({ type: 'player', e });
    const fired = ar.update(dt, !!inp.fire, pl.sprinting || !!pl.mantling, false);
    for (const e of ar.events) this.emit({ type: 'arsenal', e });
    if (fired) this.fireGun();
    if (ar.melee && ar.melee.phase === 'strike') this.meleeStep(dt);
    else this.endStrike();
    const k = Math.exp(-dt * 9);
    this.recoil.p *= k;
    this.recoil.y *= k;
    // health comes back after a moment out of harm's way
    const adr = this.perks.has('adrenaline');
    if (pl.time - pl.lastHurt > (adr ? 1.8 : HERO.regenDelay)) pl.health = Math.min(pl.maxHealth, pl.health + HERO.regen * (adr ? 1.6 : 1) * dt);
    // buffs run out
    for (const b of ['fury', 'bounty']) {
      if (this.buffs[b] && this.buffs[b] <= this.time) {
        this.buffs[b] = 0;
        this.emit({ type: 'buffEnd', kind: b });
      }
    }
  }

  viewDir(out = new Vec3()) {
    const pl = this.player;
    const p = pl.pitch + this.recoil.p, y = pl.yaw + this.recoil.y, cp = Math.cos(p);
    return out.set(-Math.sin(y) * cp, Math.sin(p), -Math.cos(y) * cp);
  }

  // -------------------------------------------------------------------------------------------
  // shooting
  fireGun() {
    const pl = this.player, ar = this.arsenal, g = ar.gun;
    const eye = pl.eye(new Vec3()), dir = this.viewDir(new Vec3());
    const w = WEAPONS[g.key];
    const dirs = spreadDirections(dir, w.spread * ar.spreadScale(pl), w.pellets, this.rng);
    // the dead the rounds will meet come out of their clips first: the engine's ballistics then
    // resolve every hit on the full ragdoll and its anatomy
    for (const d of dirs) this.wakeOnRay(eye, d, 160, g.up ? 4 : 3);
    const paths = this.sb.fire(g.key, eye, dir, { dirs, by: 'player' });
    this.stats.shots++;
    this.registerHits(paths, g);
    const rc = ar.recoil(this.rng);
    pl.pitch = clamp(pl.pitch + rc.up * 0.5, -1.45, 1.45);
    pl.yaw += rc.side * 0.5;
    this.recoil.p += rc.up * 0.5;
    this.recoil.y += rc.side * 0.5;
    this.emit({ type: 'fire', gun: g.type, up: g.up, origin: eye, dir, paths, recoil: w.recoil });
    return paths;
  }

  /** Wake the first few animated zombies a ray passes through (and not past a wall). */
  wakeOnRay(o, d, maxD, max = 3) {
    const sb = this.sb;
    const hits = raycastPeople(sb.people, sb.shape, o, d, maxD);
    if (!hits.length) return;
    hits.sort((a, b) => a.tIn - b.tIn);
    const wall = this.rayWall(o, d, Math.min(maxD, hits[hits.length - 1].tIn + 0.1));
    const seen = new Set();
    for (const h of hits) {
      if (h.tIn > wall) break;
      if (seen.has(h.person)) continue;
      seen.add(h.person);
      const z = h.person.towerZombie;
      if (z && z.animated) this.horde.wake(z, { cause: 'shot' });
      if (seen.size >= max) break;
    }
  }

  /** Distance along a ray to the first wall (oriented boxes, 2D slab test with the height). */
  rayWall(o, d, maxD) {
    let best = maxD;
    for (const b of this.obbs) {
      if (b.thin) continue;
      const dx = o.x - b.x, dz = o.z - b.z;
      if (Math.hypot(dx, dz) - b.reach > best) continue;
      // into the box frame
      const ox = dx * b.c - dz * b.s, oz = dx * b.s + dz * b.c;
      const vx = d.x * b.c - d.z * b.s, vz = d.x * b.s + d.z * b.c;
      let t0 = 0, t1 = best;
      const slab = (p, v, h) => {
        if (Math.abs(v) < 1e-9) return Math.abs(p) <= h;
        let a = (-h - p) / v, c = (h - p) / v;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, c);
        return t0 <= t1;
      };
      if (!slab(ox, vx, b.hx) || !slab(oz, vz, b.hz) || !slab(o.y - (b.y0 + b.y1) / 2, d.y, (b.y1 - b.y0) / 2)) continue;
      best = Math.min(best, t0);
    }
    return best;
  }

  registerHits(paths, g) {
    const seen = new Set();
    const fury = this.buffs.fury > this.time;
    for (const p of paths) {
      for (const h of p.hits) {
        const z = h.person.towerZombie;
        if (!z || seen.has(z)) continue;
        seen.add(z);
        if (z.state === 'dead' || z.state === 'frozen' || z.state === 'gone') continue;
        const head = h.seg === 'head' || h.seg === 'neck';
        z.lastHit = { by: 'player', time: this.time, head, gun: g.type, order: seen.size };
        this.addPoints(POINTS.hit, 'hit');
        if (fury && z.alive) z.person.injury.kill('fury');
        this.emit({ type: 'hit', zombie: z, head, kill: !z.alive || !!z.person.injury.dying, armor: !!h.armor });
      }
    }
    if (seen.size) this.stats.hits++;
  }

  addPoints(n, why, pos = null) {
    const v = Math.round(n * (this.buffs.bounty > this.time ? 2 : 1));
    this.points += v;
    this.stats.earned += v;
    this.emit({ type: 'points', amount: v, why, pos });
  }

  onSandboxFx(e) {
    if (e.type === 'meleeHit' && e.by === 'player' && e.person) {
      const z = e.person.towerZombie;
      if (z) this.emit({ type: 'meleeHit', zombie: z, point: e.point || null });
    }
    this.emit({ type: 'sandbox', fx: e });
  }

  // -------------------------------------------------------------------------------------------
  // the boot
  /** Wake the animated dead standing within `r` in front of the player (a kick is coming). */
  wakeInFront(r) {
    const pl = this.player;
    const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
    for (const z of this.horde.list) {
      if (!z.animated || !z.alive) continue;
      const dx = z.root.pos.x - pl.pos.x, dz = z.root.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d < r && (dx * fx + dz * fz) / Math.max(d, 1e-3) > 0.15) this.horde.wake(z, { cause: 'kick' });
    }
  }

  /** Someone lying just in front (a kick becomes a stomp on them). */
  stompTarget() {
    const pl = this.player;
    const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
    let best = null, bd = 1.3;
    for (const p of this.sb.people) {
      if (p.dormant || p.ctl.mode === 'balance') continue;
      for (const n of ['head', 'chest', 'abdomen']) {
        const q = p.rd.segments[n].body.pos;
        if (q.y > 0.45) continue;
        const dx = q.x - pl.pos.x, dz = q.z - pl.pos.z, d = Math.hypot(dx, dz);
        if (d < bd && (dx * fx + dz * fz) / Math.max(d, 1e-3) > 0.3) {
          bd = d;
          best = { person: p, seg: n, point: q };
        }
      }
    }
    return best;
  }

  meleeStep(dt) {
    const ar = this.arsenal, M = ar.melee;
    if (!this.strike || this.strike.M !== M) {
      this.endStrike();
      const charge = clamp((M.power - 0.45) / 0.55, 0, 1);
      this.strike = { M, charge, s: this.sb.meleeStriker('boot', { charge, by: 'player' }), pose: { a: new Vec3(), b: new Vec3() }, target: M.move === 'stomp' ? this.stompTarget() : null };
    }
    const S = this.strike;
    if (M.done) return;
    const T = ar.moves[M.move], hw = (T && T.hitWindow) || [0, 1];
    const u = clamp(M.t / (T ? T.strike : 0.14), 0, 1);
    if (u < hw[0] || u > hw[1]) return;
    S.u = (u - hw[0]) / Math.max(1e-3, hw[1] - hw[0]);
    this.bootPose(S, S.pose);
    const prm = meleeParams('boot', S.charge);
    const r = S.s.update(S.pose, dt, { speed: prm.speed * S.s.speedLeft });
    if (r.hits.length) {
      M.hit = true;
      for (const h of r.hits) {
        const z = h.person && h.person.towerZombie;
        if (!z || !z.alive) continue;
        z.lastHit = { by: 'player', time: this.time, head: h.seg === 'head', melee: true };
        this.addPoints(POINTS.hit, 'hit');
        if (this.buffs.fury > this.time) z.person.injury.kill('fury');
      }
      M.rate = r.stopped ? 0 : Math.max(0.3, r.speedLeft);
      if (r.stopped) M.done = true;
    }
  }

  endStrike() {
    if (!this.strike) return;
    this.strike.s.end();
    this.strike = null;
  }

  /** Where the sole is in the kick (or the stomp) now. */
  bootPose(S, out) {
    const pl = this.player, u = S.u ?? 0;
    const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
    if (S.M.move === 'stomp') {
      const t = S.target ? S.target.point : _v0.set(pl.pos.x + fx * 0.7, pl.pos.y, pl.pos.z + fz * 0.7);
      let y = pl.pos.y + lerp(0.6, -0.05, u);
      if (S.target) y = Math.max(y, t.y - 0.25);
      out.a.set(t.x - fx * 0.08, y, t.z - fz * 0.08);
      out.b.set(t.x + fx * 0.19, y, t.z + fz * 0.19);
      return out;
    }
    const reach = lerp(0.15, 0.85, u), y = pl.pos.y + lerp(0.35, 0.95, u);
    out.a.set(pl.pos.x + fx * reach, y - 0.08, pl.pos.z + fz * reach);
    out.b.set(pl.pos.x + fx * reach, y + 0.19, pl.pos.z + fz * reach);
    return out;
  }

  // -------------------------------------------------------------------------------------------
  // the dead
  /** A zombie's blow lands on the player. */
  zombieStrikes(z) {
    const pl = this.player;
    if (!pl.alive || this.over) return;
    const dmg = HERO.hit(this.round) * (z.def.boss ? 1.8 : z.mode === 'crawl' ? 0.6 : 1);
    pl.damage(dmg, z.root.pos, z.def.boss ? 'smash' : 'hit');
    this.emit({ type: 'hurt', amount: dmg, from: z.root.pos.clone(), hp: pl.health, zombie: z });
  }

  /** A zombie died (from the horde): points, the pickup roll, a bloater bursting. */
  zombieDied(z) {
    const H = z.lastHit, def = z.def;
    const byPlayer = !!(H && H.by === 'player' && this.time - H.time < 12);
    let pts = 0;
    if (byPlayer) {
      pts = H.melee ? POINTS.melee : POINTS.kill + (H.head ? POINTS.head : 0);
      if (def.boss) pts += 450;
      if (H.head) this.stats.headshots++;
      if (H.melee) this.stats.melee++;
      if (H.grenade) this.stats.grenadeKills++;
    }
    this.stats.kills++;
    if (def.boss) this.stats.bossKills++;
    if (pts) this.addPoints(pts, H.head ? 'head' : H.melee ? 'melee' : 'kill', z.person.rd.pelvis.pos.clone());
    this.emit({ type: 'kill', zombie: z, head: !!(H && H.head), points: pts, by: H ? H.by : null, boss: !!def.boss });
    // the dead drop things now and then
    if (H && (H.by === 'player' || H.by === 'grenade') && this.pickupsThisRound < 4 && !this.shock && this.rng() < (def.boss ? 1 : PICKUP_CHANCE)) {
      this.dropPickup(z.person.rd.pelvis.pos);
    }
    if (z.kind === 'bloater') {
      const p = z.person.rd.segments.abdomen.body.pos.clone();
      this.explode(p, { radius: def.burst.radius, power: def.burst.power, kind: 'bloater', by: 'bloater', hurt: 40 });
    }
  }

  /** Put a stuck zombie back in the ground somewhere it can come at the player from. */
  respawn(z) {
    const sp = this.spawnPoint();
    if (!sp) return;
    z.root.pos.set(sp.x, -0.8, sp.z);
    z.facing = z.root.yaw = Math.atan2(this.player.pos.x - sp.x, this.player.pos.z - sp.z);
    z.anchor = null;
    z.rising = true;
    z.riseT = 0;
    z.riseDur = 1.05;
    if (z.mode !== 'crawl') {
      z.state = 'getup';
      z.anim.play('getup', { fade: 0, phase: 0 });
    }
    this.emit({ type: 'rise', zombie: z, pos: new Vec3(sp.x, 0, sp.z) });
  }

  // -------------------------------------------------------------------------------------------
  // rounds
  stepRounds(dt) {
    if (this.phase === 'over') return;
    this.timer -= dt;
    if (this.queue.length) this.spawnOne(this.queue.shift());
    if (this.phase === 'intro' || this.phase === 'break') {
      if (this.timer <= 0) this.startRound(this.round + 1);
      return;
    }
    const n = this.round, H = this.horde;
    this.spawnT -= dt;
    const alive = H.aliveCount;
    if (this.spawnT <= 0 && this.toSpawn > 0 && alive + this.queue.length < ROUNDS.maxAlive(n)) {
      this.queue.push(this.pickKind());
      this.toSpawn--;
      this.spawnT = ROUNDS.interval(n) * (0.5 + this.rng());
    }
    if (this.bosses.length && this.total - this.toSpawn >= this.total * 0.3) {
      const kind = this.bosses.shift();
      this.queue.push(kind);
      this.emit({ type: 'bossComing', kind, name: ENEMIES[kind].name });
    }
    if (this.toSpawn === 0 && !this.bosses.length && !this.queue.length && alive === 0) this.endRound();
  }

  startRound(n) {
    this.round = n;
    this.phase = 'fight';
    this.total = ROUNDS.count(n);
    this.toSpawn = this.total;
    this.bosses = ROUNDS.bosses(n).slice();
    this.queue.length = 0;
    this.spawnT = 1.2;
    this.pickupsThisRound = 0;
    if (n > 1) this.grenades = Math.min(HERO.maxGrenades, this.grenades + 2);
    this.emit({ type: 'roundStart', n, bosses: this.bosses.map((b) => ENEMIES[b].name) });
  }

  endRound() {
    this.phase = 'break';
    this.timer = ROUNDS.breakTime;
    this.stats.rounds = this.round;
    this.emit({ type: 'roundEnd', n: this.round });
  }

  /** The dead still to come this round (alive, queued and to spawn). */
  get remaining() {
    return this.toSpawn + this.bosses.length + this.queue.length + this.horde.aliveCount;
  }

  pickKind() {
    const mix = ROUNDS.mix(this.round);
    let sum = 0;
    for (const k in mix) sum += mix[k];
    let r = this.rng() * sum;
    for (const k in mix) {
      r -= mix[k];
      if (r <= 0) return k;
    }
    return 'walker';
  }

  /** How fast a walker comes this round. */
  rollPace() {
    const n = this.round, r = this.rng();
    const sprint = n < 5 ? 0 : Math.min(0.55, (n - 4) * 0.06);
    const jog = n < 3 ? 0 : Math.min(0.5, (n - 2) * 0.12);
    return r < sprint ? 'sprint' : r < sprint + jog ? 'jog' : 'walk';
  }

  /**
   * Where the next one rises: a spawn point in an open area, mostly 15-45 m from the player along
   * the ground (close enough to matter, far enough to see it coming), jittered over open ground.
   */
  spawnPoint() {
    const F = this.chase, P = this.player.pos, rng = this.rng;
    const cands = [];
    let sum = 0;
    for (const id of this.open) {
      for (const sp of SPAWNS[id] || []) {
        let d = F.distanceAt(sp[0], sp[1]);
        if (!isFinite(d)) d = Math.hypot(sp[0] - P.x, sp[1] - P.z) * 1.4 + 30;
        if (d < 15) continue;
        const w = d < 45 ? 1 : d < 75 ? 0.45 : d < 120 ? 0.15 : 0.04;
        cands.push({ sp, w });
        sum += w;
      }
    }
    if (!cands.length) return null;
    let r = rng() * sum, pick = cands[0].sp;
    for (const c of cands) {
      r -= c.w;
      if (r <= 0) {
        pick = c.sp;
        break;
      }
    }
    for (let k = 0; k < 10; k++) {
      const x = pick[0] + (rng() - 0.5) * 8, z = pick[1] + (rng() - 0.5) * 8;
      if (F.free(x, z) && F.free(x + 0.6, z) && F.free(x - 0.6, z) && F.free(x, z + 0.6) && F.free(x, z - 0.6) && Math.hypot(x - P.x, z - P.z) > 12) return { x, z };
    }
    return F.free(pick[0], pick[1]) ? { x: pick[0], z: pick[1] } : null;
  }

  spawnOne(kind) {
    const sp = this.spawnPoint();
    if (!sp) {
      this.queue.push(kind); // nowhere to rise just now: try again
      return null;
    }
    const n = this.round, def = ENEMIES[kind], P = this.player.pos;
    const hp = def.hp * (def.boss ? 1 + 0.08 * (n - 1) : ROUNDS.hpScale(n));
    const yaw = Math.atan2(P.x - sp.x, P.z - sp.z) + (this.rng() - 0.5) * 0.5;
    const z = this.horde.spawnRising(kind, new Vec3(sp.x, 0, sp.z), yaw, hp, kind === 'walker' ? this.rollPace() : null);
    this.emit({ type: 'rise', zombie: z, pos: new Vec3(sp.x, 0, sp.z) });
    if (def.boss) this.emit({ type: 'boss', zombie: z, name: def.name });
    return z;
  }

  gameOver() {
    this.over = { round: this.round, stats: { ...this.stats, rounds: Math.max(0, this.round - 1) }, t: 0 };
    this.phase = 'over';
    this.prompt = null;
    this.endStrike();
    this.emit({ type: 'over', round: this.round, stats: this.over.stats, points: this.points });
  }

  // -------------------------------------------------------------------------------------------
  // what can be bought or used where
  /** Everything usable now: [{ kind, id, pos, price, text, can, range }]. */
  usables() {
    const out = [];
    const g = this.gun;
    for (const d of DOORS) {
      if (this.doorsOpen.has(d.id) || this.open.has(d.a) === this.open.has(d.b)) continue;
      const to = areaById(this.open.has(d.a) ? d.b : d.a);
      out.push({ kind: 'door', id: d.id, pos: d.pos, price: d.price, text: `CLEAR THE BARRICADE · ${to.name}`, range: 3.2 });
    }
    for (const l of LOCKERS) {
      if (!this.open.has(l.area)) continue;
      const own = this.ownsGun(l.gun), G = GUNS[l.gun];
      out.push({ kind: 'locker', id: l.id, gun: l.gun, pos: l.pos, price: own ? Math.round(l.price / 2) : l.price, text: own ? `AMMUNITION · ${G.name}` : `BUY ${G.name}`, range: 2.2 });
    }
    const C = this.crate;
    if (C.spot && this.open.has(C.spot.area)) {
      if (C.state === 'idle') out.push({ kind: 'crate', id: 'crate', pos: C.spot.pos, price: CRATE.price, text: 'ROLL THE CRATE · A RANDOM GUN', range: 2.4 });
      else if (C.state === 'offer') out.push({ kind: 'crateTake', id: 'crate', pos: C.spot.pos, price: 0, text: `TAKE THE ${GUNS[C.gun].name}`, range: 2.6 });
    }
    if (this.open.has(BENCH.area)) {
      const ok = g && !g.up;
      out.push({ kind: 'bench', id: 'bench', pos: BENCH.pos, price: BENCH.price, text: ok ? `REBUILD THE ${g.name} → ${GUNS[g.type].up}` : 'THE GUNSMITH\'S BENCH · ALREADY REBUILT', range: 2.4, disabled: !ok });
    }
    for (const p of PERKS) {
      if (!this.open.has(p.area) || this.perks.has(p.id)) continue;
      out.push({ kind: 'perk', id: p.id, pos: p.pos, price: p.price, text: `${p.name} · ${p.desc.toUpperCase()}`, range: 2.2 });
    }
    return out;
  }

  updatePrompt() {
    const pl = this.player;
    if (!pl.alive || this.over) {
      this.prompt = null;
      return;
    }
    let best = null, bd = Infinity;
    for (const u of this.usables()) {
      const d = Math.hypot(u.pos[0] - pl.pos.x, u.pos[1] - pl.pos.z);
      if (d < u.range && d < bd) {
        bd = d;
        best = u;
      }
    }
    if (best) best.can = !best.disabled && this.points >= best.price;
    this.prompt = best;
  }

  /** F: use / buy whatever the prompt offers. */
  use() {
    this.updatePrompt();
    const u = this.prompt;
    if (!u) return false;
    if (u.disabled) {
      this.emit({ type: 'denied', reason: 'disabled', usable: u });
      return false;
    }
    if (this.points < u.price) {
      this.emit({ type: 'denied', reason: 'points', usable: u });
      return false;
    }
    switch (u.kind) {
      case 'door':
        this.spend(u);
        this.openDoor(DOORS.find((d) => d.id === u.id));
        break;
      case 'locker':
        this.spend(u);
        this.giveGun(u.gun);
        break;
      case 'crate':
        this.spend(u);
        this.rollCrate();
        break;
      case 'crateTake': {
        const C = this.crate;
        this.giveGun(C.gun, false);
        C.state = 'idle';
        C.gun = null;
        this.emit({ type: 'crate', state: 'taken', spot: C.spot });
        break;
      }
      case 'bench':
        this.spend(u);
        this.upgradeGun();
        break;
      case 'perk':
        this.spend(u);
        this.givePerk(u.id);
        break;
    }
    this.updatePrompt();
    return true;
  }

  spend(u) {
    this.points -= u.price;
    if (u.price) this.emit({ type: 'bought', kind: u.kind, id: u.id, price: u.price, pos: u.pos });
  }

  openDoor(d) {
    if (!d || this.doorsOpen.has(d.id)) return;
    this.doorsOpen.add(d.id);
    this.stats.doors++;
    const opened = [];
    for (const id of [d.a, d.b]) {
      if (!this.open.has(id)) {
        this.open.add(id);
        opened.push(id);
      }
    }
    this.emit({ type: 'doorOpened', door: d, auto: false, areas: opened.map((id) => areaById(id)) });
    // any other barricade now standing between two open areas comes down by itself
    for (const o of DOORS) {
      if (!this.doorsOpen.has(o.id) && this.open.has(o.a) && this.open.has(o.b)) {
        this.doorsOpen.add(o.id);
        this.emit({ type: 'doorOpened', door: o, auto: true, areas: [] });
      }
    }
    this.updateOpen();
    // the crate may now have somewhere new to go
    if (!this.crate.spot) this.crate.spot = CRATE_SPOTS.find((c) => this.open.has(c.area)) || null;
  }

  givePerk(id) {
    this.perks.add(id);
    const pl = this.player;
    if (id === 'kevlar') {
      pl.maxHealth = HERO.kevlarHp;
      pl.health = pl.maxHealth;
    } else if (id === 'quick') {
      for (const g of this.arsenal.guns) g.reload = g.baseReload * 0.5;
    } else if (id === 'thirdArm') this.maxSlots = 3;
    this.emit({ type: 'perk', id, name: PERKS.find((p) => p.id === id).name });
  }

  upgradeGun() {
    const ar = this.arsenal, g = ar.guns[ar.index];
    if (!g || g.up) return;
    const up = this.makeGun(g.type, true);
    ar.guns[ar.index] = up;
    ar.state = 'equip';
    ar.t = 0;
    this.emit({ type: 'upgraded', gun: up });
    this.emit({ type: 'gunChanged', gun: up });
  }

  // -------------------------------------------------------------------------------------------
  // the crate
  rollCrate() {
    const C = this.crate;
    C.uses++;
    C.state = 'rolling';
    C.t = 0;
    if (C.uses >= C.movesAt && CRATE_SPOTS.some((c) => c !== C.spot && this.open.has(c.area))) C.gun = null; // the crate moves on
    else {
      const pool = Object.entries(CRATE_POOL).filter(([t]) => !this.ownsGun(t));
      let sum = 0;
      for (const [, w] of pool) sum += w;
      let r = this.rng() * sum;
      C.gun = pool.length ? pool[pool.length - 1][0] : 'pistol';
      for (const [t, w] of pool) {
        r -= w;
        if (r <= 0) {
          C.gun = t;
          break;
        }
      }
    }
    this.emit({ type: 'crate', state: 'rolling', spot: C.spot, gun: C.gun });
  }

  stepCrate(dt) {
    const C = this.crate;
    if (C.state === 'idle') return;
    C.t += dt;
    if (C.state === 'rolling' && C.t >= 3.6) {
      C.t = 0;
      if (C.gun) {
        C.state = 'offer';
        this.emit({ type: 'crate', state: 'offer', spot: C.spot, gun: C.gun });
      } else {
        // it is off: the price back, a new spot in a while
        C.state = 'leaving';
        this.points += CRATE.price;
        this.emit({ type: 'crate', state: 'leaving', spot: C.spot });
      }
    } else if (C.state === 'offer' && C.t >= 9) {
      C.state = 'idle';
      C.gun = null;
      this.emit({ type: 'crate', state: 'expired', spot: C.spot });
    } else if (C.state === 'leaving' && C.t >= 5) {
      const spots = CRATE_SPOTS.filter((c) => c !== C.spot && this.open.has(c.area));
      C.spot = spots[Math.floor(this.rng() * spots.length)] || C.spot;
      C.state = 'idle';
      C.uses = 0;
      C.movesAt = this.rollMoves();
      this.emit({ type: 'crate', state: 'arrived', spot: C.spot });
    }
  }

  // -------------------------------------------------------------------------------------------
  // grenades and blasts
  throwGrenade() {
    const pl = this.player;
    if (this.grenades <= 0 || !pl.alive) return null;
    this.grenades--;
    const eye = pl.eye(new Vec3()), d = this.viewDir(new Vec3());
    const g = {
      id: this.nextId++, pos: eye.clone().addScaled(d, 0.45), vel: d.clone().scale(14).add(_v0.set(pl.vel.x, 2.6, pl.vel.z)), t: 0, fuse: 2.3,
      spin: new Vec3((this.rng() - 0.5) * 20, (this.rng() - 0.5) * 20, (this.rng() - 0.5) * 20),
    };
    g.pos.y -= 0.1;
    this.grenadesLive.push(g);
    this.emit({ type: 'grenadeThrow', grenade: g });
    return g;
  }

  stepGrenades(dt) {
    const o = { nx: 0, nz: 0, push: 0 };
    for (let i = this.grenadesLive.length - 1; i >= 0; i--) {
      const g = this.grenadesLive[i];
      g.t += dt;
      g.vel.y -= 9.81 * dt;
      g.pos.addScaled(g.vel, dt);
      // walls: bounce off
      for (const b of this.obbs) {
        if (g.pos.y > b.y1 || g.pos.y < b.y0) continue;
        if (Math.abs(g.pos.x - b.x) > b.reach + 0.1 || Math.abs(g.pos.z - b.z) > b.reach + 0.1) continue;
        if (!pushOut(b, g.pos.x, g.pos.z, 0.06, o)) continue;
        g.pos.x += o.nx * o.push;
        g.pos.z += o.nz * o.push;
        const vn = g.vel.x * o.nx + g.vel.z * o.nz;
        if (vn < 0) {
          g.vel.x -= 1.4 * vn * o.nx;
          g.vel.z -= 1.4 * vn * o.nz;
          g.vel.x *= 0.7;
          g.vel.z *= 0.7;
          if (vn < -2) this.emit({ type: 'grenadeBounce', grenade: g, speed: -vn });
        }
      }
      const floor = this.env.floorAt(g.pos.x, g.pos.z, g.pos.y + 0.3) + 0.05;
      if (g.pos.y < floor) {
        g.pos.y = floor;
        if (g.vel.y < 0) {
          if (g.vel.y < -2) this.emit({ type: 'grenadeBounce', grenade: g, speed: -g.vel.y });
          g.vel.y = -g.vel.y * 0.32;
          g.vel.x *= 0.62;
          g.vel.z *= 0.62;
          g.spin.scale(0.6);
        }
      }
      if (g.t >= g.fuse) {
        this.grenadesLive.splice(i, 1);
        this.explode(g.pos.clone(), { radius: 7, power: 1.25, kind: 'grenade', by: 'grenade', hurt: 55 });
      }
    }
  }

  /**
   * A blast: everything within `radius` is thrown (animated zombies go physical), hurt with the
   * falloff, legs broken near the middle. opts.hurt: what it does to the player at its centre.
   */
  explode(pos, opts = {}) {
    const R = opts.radius ?? 5, power = opts.power ?? 1;
    for (const z of this.horde.list) {
      if (z.state === 'frozen' || z.state === 'gone') continue;
      const rd = z.person.rd, c = rd.pelvis.pos;
      const d = Math.hypot(c.x - pos.x, c.y - pos.y, c.z - pos.z);
      if (d > R) continue;
      const f = Math.pow(1 - d / R, 1.4);
      if (z.animated) this.horde.wake(z, { mode: 'falling', cause: 'blast' });
      const inj = z.person.injury;
      for (const b of rd.allBodies()) {
        const dx = b.pos.x - pos.x, dy = b.pos.y - pos.y + 0.6, dz = b.pos.z - pos.z;
        const l = Math.hypot(dx, dy, dz) || 1;
        const dv = power * 10 * f * (0.75 + 0.5 * this.rng()) * (z.def.boss ? 0.35 : 1);
        b.vel.x += (dx / l) * dv;
        b.vel.y += (dy / l) * dv + 1.5 * f * power;
        b.vel.z += (dz / l) * dv;
        b.angVel.x += (this.rng() - 0.5) * 12 * f;
        b.angVel.z += (this.rng() - 0.5) * 12 * f;
      }
      if (inj.alive) {
        const dmg = 1300 * power * f * f * (z.def.boss ? 0.4 : 1) * (0.6 + 0.4 * ROUNDS.hpScale(this.round));
        inj.hp -= dmg;
        if (f > 0.45 && !z.def.boss) {
          const s = this.rng() < 0.5 ? 'L' : 'R';
          const seg = rd.segments[(this.rng() < 0.5 ? 'shin' : 'thigh') + s];
          if (!seg.fractured) inj.queueBreak(seg, 0.35 + this.rng() * 0.3, true);
        }
        if (inj.hp <= 0) inj.kill('blast');
        if (opts.by === 'grenade') z.lastHit = { by: 'player', time: this.time, head: false, grenade: true };
        else if (!z.lastHit || this.time - z.lastHit.time > 1) z.lastHit = { by: opts.by || 'blast', time: this.time };
      }
    }
    // and the player, if close
    const pl = this.player;
    if (opts.hurt && pl.alive) {
      const d = Math.hypot(pl.pos.x - pos.x, pl.pos.y + 0.9 - pos.y, pl.pos.z - pos.z);
      if (d < R) {
        const dmg = opts.hurt * Math.pow(1 - d / R, 1.2);
        if (dmg > 2) {
          pl.damage(dmg, pos, 'smash');
          this.emit({ type: 'hurt', amount: dmg, from: pos.clone(), hp: pl.health, blast: true });
        }
      }
    }
    this.emit({ type: 'explosion', pos: pos.clone(), radius: R, power, kind: opts.kind || 'blast' });
  }

  // -------------------------------------------------------------------------------------------
  // pickups
  dropPickup(at) {
    let sum = 0;
    for (const k in PICKUPS) sum += PICKUPS[k].weight;
    let r = this.rng() * sum, kind = 'ammo';
    for (const k in PICKUPS) {
      r -= PICKUPS[k].weight;
      if (r <= 0) {
        kind = k;
        break;
      }
    }
    const p = { id: this.nextId++, kind, pos: new Vec3(at.x, 0, at.z), t: 0, life: 26 };
    // (on open ground the player can reach)
    if (!this.allowedAt(p.pos.x, p.pos.z)) {
      const P = this.player.pos;
      for (let k = 1; k <= 8 && !this.allowedAt(p.pos.x, p.pos.z); k++) p.pos.set(lerp(at.x, P.x, k / 8), 0, lerp(at.z, P.z, k / 8));
    }
    this.pickups.push(p);
    this.pickupsThisRound++;
    this.emit({ type: 'pickupDrop', pickup: p });
    return p;
  }

  stepPickups(dt) {
    const P = this.player.pos;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      if (this.player.alive && Math.hypot(p.pos.x - P.x, p.pos.z - P.z) < 1.4) {
        this.pickups.splice(i, 1);
        this.takePickup(p);
      } else if (p.t > p.life) {
        this.pickups.splice(i, 1);
        this.emit({ type: 'pickupGone', pickup: p });
      }
    }
  }

  takePickup(p) {
    switch (p.kind) {
      case 'ammo':
        for (const g of this.arsenal.guns) g.spare = g.reserve;
        this.grenades = HERO.maxGrenades;
        break;
      case 'fury':
        this.buffs.fury = this.time + PICKUPS.fury.dur;
        break;
      case 'bounty':
        this.buffs.bounty = this.time + 20;
        break;
      case 'shockwave':
        this.shock = { pos: p.pos.clone(), r: 0, done: new Set() };
        this.addPoints(POINTS.pickup, 'shockwave');
        this.emit({ type: 'shockwave', pos: p.pos.clone() });
        break;
    }
    this.emit({ type: 'pickup', pickup: p, kind: p.kind, name: PICKUPS[p.kind].name });
  }

  /** The shockwave rolls out over the valley and drops every one of the dead it passes. */
  stepShock(dt) {
    const S = this.shock;
    if (!S) return;
    S.r += dt * 42;
    let n = 0;
    for (const z of this.horde.list) {
      if (!z.alive || S.done.has(z)) continue;
      const q = z.animated ? z.root.pos : z.person.rd.pelvis.pos;
      const dx = q.x - S.pos.x, dz = q.z - S.pos.z, d = Math.hypot(dx, dz);
      if (d > S.r || n >= 2) continue;
      n++;
      S.done.add(z);
      if (z.animated) this.horde.wake(z, { mode: 'falling', cause: 'blast' });
      z.lastHit = { by: 'shockwave', time: this.time };
      z.person.injury.kill('shockwave');
      const l = d || 1;
      for (const b of z.person.rd.allBodies()) {
        b.vel.x += (dx / l) * 3.5;
        b.vel.z += (dz / l) * 3.5;
        b.vel.y += 1.6;
      }
    }
    if (S.r > 320) this.shock = null;
  }
}

const NO_KEYS = new Set();
const NO_INPUT = { move: { x: 0, z: 0 }, look: { dx: 0, dy: 0 }, sprint: false, crouch: false, jump: false };

export { GUNS, AREAS, DOORS, PERKS, LOCKERS, CRATE_SPOTS, BENCH, PICKUPS };
