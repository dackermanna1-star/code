import { Vec3, Quat, clamp } from '../physics/math.js';
import { Body } from '../physics/body.js';
import { Shape } from '../physics/shapes.js';

/**
 * The survival level: an underground station with an island platform between two tracks. x runs
 * along the tracks, z across them (platform edges at z = +-W, track centre lines at z = +-TRACK_Z),
 * y up from the platform floor. Everything solid is an axis-aligned box: the same list serves the
 * ragdoll physics (static bodies, which behave like the floor), the player's collision, the
 * zombies' flow field and the renderer.
 *
 * Trains run in the track pits: they brake into the station, stop with the doors facing the
 * platform, open (the car interiors become floor the zombies can walk out over), wait until the
 * passengers are out, close and leave. Anything left on the tracks in front of a moving train is
 * hit by it.
 */
export const STATION = {
  halfLen: 32, // platform from x = -32 to 32
  W: 4.2, // platform edge at z = +-W
  pitDepth: 1.15, // track bed below the platform
  trackZ: 5.85, // track centre lines at z = +-trackZ
  wallZ: 7.7, // tunnel walls behind the tracks
  ceiling: 4.4,
  tunnel: 80, // the tracks run on into the tunnels to x = +-(halfLen + tunnel)
};

export const CAR = { len: 17, gap: 0.9, width: 3.0, height: 2.45, doors: [-5.6, 0, 5.6], doorWidth: 1.3, cars: 3 };
const TRAIN_LEN = CAR.cars * CAR.len + (CAR.cars - 1) * CAR.gap;

/** Box {min, max, kind, material} from centre/size. */
function box(cx, cy, cz, sx, sy, sz, kind, material = 'concrete') {
  return { min: new Vec3(cx - sx / 2, cy - sy / 2, cz - sz / 2), max: new Vec3(cx + sx / 2, cy + sy / 2, cz + sz / 2), kind, material };
}

/** The fixed geometry of the station (see STATION for the layout). */
export function stationBoxes() {
  const S = STATION, L = S.halfLen, W = S.W, D = S.pitDepth, far = L + S.tunnel;
  const out = [];
  // the platform block itself (its top is the floor plane, so it sits just under it) and the
  // track beds, with the tunnel walls behind them
  out.push(box(0, -D / 2 - 0.03, 0, L * 2, D - 0.06, W * 2, 'platform'));
  for (const sd of [-1, 1]) {
    out.push(box(0, -D - 0.25, sd * (W + S.wallZ) / 2, far * 2, 0.5, S.wallZ - W, 'trackbed', 'gravel'));
    out.push(box(0, (S.ceiling + 1.5 - D) / 2 - 0.3, sd * (S.wallZ + 0.25), far * 2, S.ceiling + D + 1.5, 0.5, 'wall', 'tile'));
    // platform ends: the station's end walls (the tracks go on into the tunnels)
    out.push(box(sd * (L + 0.25), S.ceiling / 2, 0, 0.5, S.ceiling, W * 2, 'wall', 'tile'));
  }
  // columns: two rows along the platform
  for (const x of [-24, -16, -8, 8, 16, 24]) for (const z of [-2.4, 2.4]) out.push(box(x, S.ceiling / 2, z, 0.6, S.ceiling, 0.6, 'column', 'tile'));
  // benches on the centre line (too high to step over: walked round, vaulted by the player)
  for (const x of [-28, -20, -12, 12, 20, 28]) out.push(box(x, 0.23, 0, 1.8, 0.46, 0.5, 'bench', 'wood'));
  // the stairwell up to the street (its gate is locked shut): a solid block in the middle
  out.push(box(0, S.ceiling / 2, 0, 7.2, S.ceiling, 2.6, 'stairs', 'concrete'));
  // bins and a ticket machine against the columns
  out.push(box(-8, 0.45, -3.05, 0.5, 0.9, 0.5, 'bin', 'metal'));
  out.push(box(16, 0.45, 3.05, 0.5, 0.9, 0.5, 'bin', 'metal'));
  out.push(box(-16, 0.85, 3.1, 0.9, 1.7, 0.6, 'machine', 'metal'));
  return out;
}

function staticBody(b, name) {
  const body = new Body({ name, isStatic: true });
  const r = 0.004;
  const hx = (b.max.x - b.min.x) / 2, hy = (b.max.y - b.min.y) / 2, hz = (b.max.z - b.min.z) / 2;
  const s = Shape.box(hx - r, hy - r, hz - r, { radius: r, friction: b.material === 'gravel' ? 0.9 : 0.75, restitution: 0.05, material: b.material });
  body.addShape(s);
  body.makeStatic();
  body.setPose(new Vec3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2), new Quat());
  // (marked as an obstacle: the walking planner and surface queries see it)
  body.userData = { obstacle: true, level: true, kind: b.kind };
  return body;
}

// ---------------------------------------------------------------------------------------------
/**
 * A train on track `side` (+1 north, -1 south) running in direction `dir` (+1 toward +x). It
 * comes in from the tunnel at line speed, brakes to a stop centred on the platform, opens its
 * doors (platform side) and leaves again once `hold()` says so.
 */
export class Train {
  constructor(level, side, dir, opts = {}) {
    this.level = level;
    this.side = side;
    this.dir = dir;
    this.id = Train.nextId = (Train.nextId || 0) + 1;
    this.speed0 = opts.speed ?? 15;
    this.brake = opts.brake ?? 1.9; // m/s^2
    this.accel = opts.accel ?? 1.1;
    const run = this.speed0 * this.speed0 / (2 * this.brake);
    this.x = -dir * (run + 4);
    this.v = this.speed0;
    this.state = 'arriving'; // arriving | stopped | departing | gone
    this.t = 0;
    this.doorOpen = 0; // 0 closed .. 1 open
    this.bodies = [];
    this.passengers = []; // spawn requests [{kind, at}] handed out once the doors are open
    this.z = side * STATION.trackZ;
    this.holdUntil = opts.minStop ?? 4;
  }

  get len() {
    return TRAIN_LEN;
  }

  /** Centre x of car k. */
  carX(k) {
    return this.x + (k - (CAR.cars - 1) / 2) * (CAR.len + CAR.gap);
  }

  /** Door openings on the platform side: [{x, z (platform edge), inside: Vec3 (a spot just inside)}]. */
  doors() {
    const out = [];
    for (let k = 0; k < CAR.cars; k++) {
      for (const d of CAR.doors) {
        const x = this.carX(k) + d;
        out.push({ x, z: this.side * STATION.W, inside: new Vec3(x, 0, this.side * (STATION.W + 0.95)) });
      }
    }
    return out;
  }

  /** Axis-aligned boxes of the stopped train (floor and walls with the door gaps). */
  boxes() {
    const out = [];
    const sd = this.side, W = STATION.W;
    const zIn = sd * (W + 0.12), zOut = sd * (W + 0.12 + CAR.width);
    const zc = (zIn + zOut) / 2, wz = Math.abs(zOut - zIn);
    for (let k = 0; k < CAR.cars; k++) {
      const cx = this.carX(k);
      // floor level with the platform (and the sill bridging the small gap at the doors)
      out.push(box(cx, -0.2, zc, CAR.len, 0.4, wz, 'carFloor', 'metal'));
      for (const d of CAR.doors) out.push(box(cx + d, -0.05, sd * (W + 0.06), CAR.doorWidth, 0.1, 0.12, 'sill', 'metal'));
      // far side wall, ends, and the platform side wall between the doors
      out.push(box(cx, CAR.height / 2, zOut + sd * 0.06, CAR.len, CAR.height, 0.12, 'carWall', 'metal'));
      for (const e of [-1, 1]) out.push(box(cx + e * (CAR.len / 2 - 0.06), CAR.height / 2, zc, 0.12, CAR.height, wz, 'carWall', 'metal'));
      const edges = [-CAR.len / 2, ...CAR.doors.flatMap((d) => [d - CAR.doorWidth / 2, d + CAR.doorWidth / 2]), CAR.len / 2];
      for (let i = 0; i < edges.length; i += 2) {
        const a = edges[i], b = edges[i + 1];
        out.push(box(cx + (a + b) / 2, CAR.height / 2, zIn + sd * 0.06, b - a, CAR.height, 0.12, 'carWall', 'metal'));
      }
    }
    return out;
  }

  /** True while a point (x, z) is inside one of the cars (on its floor). */
  inside(x, z) {
    const sd = this.side, W = STATION.W;
    const zz = z * sd;
    // (from the platform edge: the sills bridge the gap at the doors)
    if (zz < W - 0.01 || zz > W + 0.12 + CAR.width) return false;
    return Math.abs(x - this.x) < TRAIN_LEN / 2;
  }

  update(dt) {
    this.t += dt;
    const L = this.level;
    if (this.state === 'arriving') {
      // constant deceleration onto the stopping mark (x = 0)
      const togo = -this.dir * this.x;
      this.v = Math.sqrt(Math.max(0, 2 * this.brake * togo));
      this.v = Math.min(this.v, this.speed0);
      this.x += this.dir * this.v * dt;
      if (togo <= 0.02 || this.v < 0.05) {
        this.x = 0;
        this.v = 0;
        this.state = 'stopped';
        this.t = 0;
        L.trainStopped(this);
      }
    } else if (this.state === 'stopped') {
      if (!this.closing && this.t > this.holdUntil && (!this.hold || !this.hold(this))) {
        this.closing = true;
        L.events.push({ type: 'doorsClosing', train: this });
      }
      if (!this.closing) {
        if (this.t > 0.9) {
          if (this.doorOpen === 0) L.events.push({ type: 'doorsOpening', train: this });
          this.doorOpen = Math.min(1, this.doorOpen + dt / 0.8);
        }
      } else {
        this.doorOpen = Math.max(0, this.doorOpen - dt / 0.9);
        if (this.doorOpen <= 0) {
          this.state = 'departing';
          this.t = 0;
          L.trainDeparting(this);
        }
      }
    } else if (this.state === 'departing') {
      this.v = Math.min(this.speed0, this.v + this.accel * dt);
      this.x += this.dir * this.v * dt;
      if (Math.abs(this.x) > STATION.halfLen + STATION.tunnel - 10 + TRAIN_LEN / 2) this.state = 'gone';
    }
    if (this.state !== 'stopped') L.sweep(this, dt);
  }

  /** Front of the train (x) and its velocity (m/s along x). */
  get front() {
    return this.x + this.dir * TRAIN_LEN / 2;
  }
}

// ---------------------------------------------------------------------------------------------
export class SubwayLevel {
  /**
   * @param sandbox the simulation the station is built into (its floor becomes the platform)
   */
  constructor(sandbox) {
    this.sb = sandbox;
    this.boxes = stationBoxes();
    this.trains = [];
    this.trainBodies = new Map(); // train -> static bodies while stopped
    this.version = 0; // bumped when the walkable layout changes (a train stops or leaves)
    this.events = [];
    const S = STATION;
    const w = sandbox.world;
    w.setGroundRect(-S.halfLen, -S.W, S.halfLen, S.W);
    this.bodies = this.boxes.map((b, i) => staticBody(b, 'level:' + b.kind + i));
    for (const b of this.bodies) w.addBody(b);
  }

  /** Floor height under (x, z): the platform, a car floor, the track bed or a bench top. */
  floorAt(x, z, from = 3) {
    return this.sb.world.surfaceAt(x, z, from);
  }

  /** All solid boxes right now (the station plus stopped trains), for the player's collision. */
  colliders() {
    const out = this.boxes.slice();
    for (const [, list] of this.trainBodies) out.push(...list.boxes);
    return out;
  }

  /** Start a train in on track `side`, travelling `dir` (defaults: alternate). */
  addTrain(side, dir, opts = {}) {
    const t = new Train(this, side, dir, opts);
    this.trains.push(t);
    this.events.push({ type: 'trainAdded', train: t });
    return t;
  }

  trainStopped(t) {
    const boxes = t.boxes();
    const bodies = boxes.map((b, i) => staticBody(b, `train${t.id}:${b.kind}${i}`));
    for (const b of bodies) this.sb.world.addBody(b);
    this.trainBodies.set(t, { boxes, bodies });
    this.version++;
    this.events.push({ type: 'trainStopped', train: t });
  }

  trainDeparting(t) {
    const e = this.trainBodies.get(t);
    if (e) for (const b of e.bodies) this.sb.world.removeBody(b);
    this.trainBodies.delete(t);
    this.version++;
    this.events.push({ type: 'trainDeparting', train: t });
    // anyone still aboard (a corpse, a straggler) goes with it
    for (const p of [...this.sb.people]) {
      const q = p.rd.pelvis.pos;
      if (t.inside(q.x, q.z) && q.y > -0.6) this.events.push({ type: 'carriedOff', person: p, train: t });
    }
  }

  /**
   * A moving train sweeps its track: people (and props) on the rails in front of it are thrown
   * along by it - and the undead (or the player) killed outright.
   */
  sweep(t, dt) {
    if (t.v < 0.5) return;
    const f = t.front, zc = t.z;
    const lo = Math.min(f - t.dir * 0.4, f + t.dir * (t.v * dt + 0.35)), hi = Math.max(f - t.dir * 0.4, f + t.dir * (t.v * dt + 0.35));
    for (const p of this.sb.people) {
      let hit = false;
      for (const b of p.rd.allBodies()) {
        if (b.pos.x >= lo && b.pos.x <= hi && Math.abs(b.pos.z - zc) < CAR.width / 2 + 0.25 && b.pos.y < CAR.height - 0.2) {
          hit = true;
          break;
        }
      }
      if (!hit || p.trainHit === t) continue;
      p.trainHit = t;
      const v = new Vec3(t.dir * t.v * 1.15, 1.2 + 0.08 * t.v, 0);
      for (const b of p.rd.allBodies()) {
        b.vel.set(v.x + (Math.random() - 0.5), v.y * (0.6 + 0.8 * Math.random()), (Math.random() - 0.5) * 2);
        b.angVel.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      }
      if (p.injury.alive) p.injury.kill('hit by a train');
      this.events.push({ type: 'trainHit', train: t, person: p, speed: t.v });
    }
    const pl = this.sb.player;
    if (pl && pl.alive && pl.pos.x >= lo - 0.3 && pl.pos.x <= hi + 0.3 && Math.abs(pl.pos.z - zc) < CAR.width / 2 + 0.2 && pl.pos.y < -0.3) {
      this.events.push({ type: 'trainHitPlayer', train: t, speed: t.v });
      this.sb.hitPlayer(1000, new Vec3(f, pl.pos.y + 1, zc), 'train', null);
    }
  }

  update(dt) {
    for (const t of this.trains) t.update(dt);
    const gone = this.trains.filter((t) => t.state === 'gone');
    for (const t of gone) this.events.push({ type: 'trainRemoved', train: t });
    if (gone.length) this.trains = this.trains.filter((t) => t.state !== 'gone');
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** A stopped train on track `side`, or null. */
  stoppedTrain(side) {
    return this.trains.find((t) => t.side === side && t.state === 'stopped') || null;
  }

  /** Is (x, z) on the platform proper (not on the tracks or in a car)? */
  onPlatform(x, z) {
    return Math.abs(x) < STATION.halfLen && Math.abs(z) < STATION.W;
  }

  /** Clear trains (and their bodies) for a restart. */
  reset() {
    for (const [t] of this.trainBodies) this.trainDeparting(t);
    this.trains.length = 0;
    this.events.length = 0;
    this.version++;
  }
}

export { TRAIN_LEN };
