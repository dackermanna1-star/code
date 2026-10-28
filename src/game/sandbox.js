import { Vec3, clamp } from '../physics/math.js';
import { World } from '../physics/world.js';
import { PointConstraint } from '../physics/joints.js';
import { Ragdoll } from '../human/ragdoll.js';
import { HumanController } from '../human/controller.js';
import { InjurySystem } from '../human/injury.js';
import { THROWABLES, createThrowableBody, applyDrag, launch } from './throwables.js';
import { WEAPONS, makeProjectile, traceProjectile, spreadDirections, raycastPeople } from './weapons.js';

const G = new Vec3(0, -9.81, 0);

/**
 * The simulation: one physics world with people (ragdoll + motor controller + injury model) and
 * props, plus the user's tools (throw, shoot, grab, shove). Everything that the renderer and the
 * audio need to know about is published as events in `fx` (drained by the app each frame).
 */
export class Sandbox {
  constructor(opts = {}) {
    this.shape = opts.shape; // BodyShape for ballistic hit tests
    this.world = new World({ substeps: opts.substeps ?? 20, groundHalfSize: 12 });
    this.world.onBodyRemoved = (b) => this.onBodyRemoved(b);
    this.people = [];
    this.objects = [];
    this.fxQueue = [];
    this.time = 0;
    this.rng = opts.rng ?? Math.random;
    this.settings = { forceScale: 1, bleedScale: 1, assist: 1, painReactions: true };
    this.grab = null;
    this.shoves = [];
    this.viewer = null; // camera position (people glance at it)
    this.nextId = 1;
  }

  fx(e) {
    this.fxQueue.push(e);
  }

  drainFx() {
    const q = this.fxQueue;
    this.fxQueue = [];
    return q;
  }

  // ------------------------------------------------------------------------------------------
  spawnPerson(pos = new Vec3(0, 0, 0), yaw = 0) {
    const rd = new Ragdoll(this.world, { position: pos, yaw });
    rd.addToWorld();
    const ctl = new HumanController(rd, { rng: this.rng });
    const injury = new InjurySystem(rd, ctl, { rng: this.rng, bleedScale: this.settings.bleedScale });
    const person = { id: this.nextId++, rd, ctl, injury, seen: new Map() };
    this.applyAssist(person);
    this.people.push(person);
    this.fx({ type: 'personAdded', person });
    return person;
  }

  removePerson(person) {
    if (this.grab && person.rd.allBodies().includes(this.grab.body)) this.endGrab();
    person.rd.removeFromWorld();
    for (const s of ['L', 'R']) this.world.removeConstraint(person.ctl.footSpring[s]);
    this.people = this.people.filter((p) => p !== person);
    this.fx({ type: 'personRemoved', person });
  }

  applyAssist(person) {
    const a = this.settings.assist;
    const c = person.ctl;
    c.assistGain = a;
    c.stepAssist = a;
    c.vAssist = 0.3 * a;
    c.chestAssist = a;
  }

  setAssist(a) {
    this.settings.assist = clamp(a, 0, 1);
    for (const p of this.people) this.applyAssist(p);
  }

  setBleedScale(s) {
    this.settings.bleedScale = s;
    for (const p of this.people) p.injury.bleedScale = s;
  }

  /** Free spawn spot near `around` that keeps clear of other people. */
  freeSpot(around = new Vec3()) {
    for (let i = 0; i < 40; i++) {
      const p = i === 0 ? around.clone() : new Vec3(around.x + (this.rng() - 0.5) * 6, 0, around.z + (this.rng() - 0.5) * 6);
      if (this.people.every((q) => Math.hypot(q.rd.pelvis.pos.x - p.x, q.rd.pelvis.pos.z - p.z) > 1.2)) return p;
    }
    return new Vec3(around.x + 2, 0, around.z);
  }

  resetAll() {
    for (const p of [...this.people]) this.removePerson(p);
    this.clearObjects();
    this.nextId = 1;
    this.spawnPerson(new Vec3(0, 0, 0), 0);
  }

  clearObjects() {
    for (const o of [...this.objects]) this.removeObject(o);
  }

  // ------------------------------------------------------------------------------------------
  addObject(type, pos, q = null) {
    const body = createThrowableBody(type);
    if (q) body.setPose(pos, q);
    else body.setPose(pos, body.rot);
    this.world.addBody(body);
    const obj = { body, type, def: THROWABLES[type], born: this.time, broken: false };
    body.userData.object = obj;
    this.objects.push(obj);
    this.fx({ type: 'objectAdded', object: obj });
    return obj;
  }

  removeObject(obj) {
    if (this.grab && this.grab.body === obj.body) this.endGrab();
    this.world.removeBody(obj.body);
    this.objects = this.objects.filter((o) => o !== obj);
    this.fx({ type: 'objectRemoved', object: obj });
  }

  onBodyRemoved(b) {
    const obj = b.userData && b.userData.object;
    if (obj) {
      this.objects = this.objects.filter((o) => o !== obj);
      this.fx({ type: 'objectRemoved', object: obj });
    }
  }

  throwObject(type, origin, dir, speed) {
    const def = THROWABLES[type];
    const obj = this.addObject(type, origin);
    launch(obj.body, origin, dir, speed ?? def.speed, 1, this.rng);
    obj.thrownAt = this.time;
    this.fx({ type: 'throw', object: obj, speed: speed ?? def.speed });
    // keep the count of loose props bounded
    if (this.objects.length > 60) this.removeObject(this.objects[0]);
    return obj;
  }

  // ------------------------------------------------------------------------------------------
  fire(weaponType, origin, dir) {
    const w = WEAPONS[weaponType];
    const dirs = spreadDirections(dir, w.spread, w.pellets, this.rng);
    const ctx = { world: this.world, people: this.people, shape: this.shape, forceScale: this.settings.forceScale, fx: (e) => this.fx(e) };
    const paths = [];
    for (const d of dirs) {
      const proj = makeProjectile(w);
      const res = traceProjectile(ctx, origin, d, proj);
      paths.push({ from: origin.clone(), to: res.end, dir: d });
    }
    // everyone nearby flinches at the report
    for (const p of this.people) {
      const d = p.rd.segments.head.body.pos.distanceTo(origin);
      p.ctl.startle = Math.min(1, p.ctl.startle + clamp(1.2 - d / 15, 0.15, 0.8));
    }
    this.fx({ type: 'shot', weapon: weaponType, origin: origin.clone(), dir: dir.clone(), paths });
    return paths;
  }

  // ------------------------------------------------------------------------------------------
  // Hand of god: grab a body at a point and drag it toward a target with limited force.
  startGrab(body, pointW, maxForce = 1800) {
    this.endGrab();
    const local = body.worldToLocal(pointW, new Vec3());
    const c = new PointConstraint(body, local, pointW, { compliance: 2e-5, maxForce, damping: 6 });
    this.world.addConstraint(c);
    this.grab = { body, constraint: c };
    body.wake();
    return this.grab;
  }

  updateGrab(targetW) {
    if (this.grab) this.grab.constraint.target.copy(targetW);
  }

  endGrab() {
    if (!this.grab) return;
    this.world.removeConstraint(this.grab.constraint);
    this.grab = null;
  }

  /** A shove: impulse delivered as a constant force over `duration` seconds at a point. */
  shove(body, pointW, impulse, duration = 0.12) {
    const frames = Math.max(1, Math.round(duration * 60));
    this.shoves.push({ body, point: pointW.clone(), local: body.worldToLocal(pointW, new Vec3()), force: impulse.clone().scale(60 / frames), frames });
    const person = this.people.find((p) => p.rd.isRagdollBody(body));
    if (person) person.ctl.startle = Math.min(1, person.ctl.startle + 0.3);
  }

  // ------------------------------------------------------------------------------------------
  /** Perception: incoming objects become threats the person reacts to (after a reaction delay). */
  perceive(person, dt) {
    const ctl = person.ctl;
    ctl.threat = null;
    if (!ctl.alive || !ctl.conscious) return;
    const head = person.rd.segments.head.body.pos;
    const pel = person.rd.pelvis.pos;
    let best = null;
    for (const o of this.objects) {
      const b = o.body;
      const v = b.vel;
      const sp = v.length();
      const seenKey = o;
      if (sp < 3.5) {
        person.seen.delete(seenKey);
        continue;
      }
      // closest approach of the ballistic path to the head-pelvis line within 0.8 s
      let minD = Infinity, tMin = 0;
      const p = new Vec3(), q = new Vec3();
      for (let t = 0; t <= 0.8; t += 0.02) {
        p.copy(b.pos).addScaled(v, t).addScaled(G, 0.5 * t * t);
        // distance to segment pel->head
        const ax = head.x - pel.x, ay = head.y - pel.y, az = head.z - pel.z;
        const l2 = ax * ax + ay * ay + az * az;
        const s = clamp(((p.x - pel.x) * ax + (p.y - pel.y) * ay + (p.z - pel.z) * az) / l2, 0, 1);
        q.set(pel.x + ax * s, pel.y + ay * s, pel.z + az * s);
        const d = p.distanceTo(q);
        if (d < minD) {
          minD = d;
          tMin = t;
        }
      }
      const radius = 0.32;
      if (minD > radius || tMin < 0.03) {
        person.seen.delete(seenKey);
        continue;
      }
      // reaction time: the object has to be tracked for ~150 ms before a response
      const seen = (person.seen.get(seenKey) || 0) + dt;
      person.seen.set(seenKey, seen);
      if (seen < 0.15) continue;
      if (!best || tMin < best.tti) {
        const at = new Vec3().copy(b.pos).addScaled(v, tMin).addScaled(G, 0.5 * tMin * tMin);
        best = { point: at, from: v.clone().normalize(), tti: tMin, miss: minD, body: b };
      }
    }
    if (best) {
      ctl.threat = best;
      // dodge direction: move the head away from the incoming line
      const off = new Vec3().subVectors(head, best.point);
      off.addScaled(best.from, -off.dot(best.from));
      off.y = 0;
      if (off.lengthSq() < 1e-4) off.set(-best.from.z, 0, best.from.x);
      ctl.dodge.copy(off.normalize());
      ctl.lookTarget = best.point;
    } else if (this.viewer) {
      // glance at the person interacting with them when they are in front
      const f = person.rd.segments.chest.body.localDirToWorld(new Vec3(0, 0, 1), new Vec3());
      const to = new Vec3().subVectors(this.viewer, head);
      const fl = Math.hypot(f.x, f.z), tl = Math.hypot(to.x, to.z);
      const cos = (f.x * to.x + f.z * to.z) / (fl * tl + 1e-9);
      ctl.lookTarget = cos > 0.1 ? this.viewer : null;
    }
  }

  // ------------------------------------------------------------------------------------------
  step(dt) {
    this.time += dt;
    const world = this.world;
    for (const p of this.people) {
      this.perceive(p, dt);
      p.ctl.update(dt);
    }
    for (const s of this.shoves) {
      if (s.frames-- > 0 && s.body.world) {
        s.body.applyForceAt(s.force, s.body.localToWorld(s.local, s.point));
      }
    }
    this.shoves = this.shoves.filter((s) => s.frames > 0);
    for (const o of this.objects) applyDrag(o.body, o.def);
    world.step(dt);
    // impacts: blunt trauma, breakage, sounds
    for (const p of this.people) p.injury.processImpacts(world);
    this.handleImpacts();
    for (const p of this.people) {
      p.injury.update(dt);
      for (const e of p.injury.events) this.onInjuryEvent(p, e);
      p.injury.events.length = 0;
    }
  }

  handleImpacts() {
    for (const imp of this.world.impactList) {
      if (imp.speed < 0.7) continue;
      const A = imp.bodyA, B = imp.bodyB;
      const oA = A.userData && A.userData.object, oB = B && B.userData && B.userData.object;
      const pA = A.userData && A.userData.ragdoll, pB = B && B.userData && B.userData.ragdoll;
      const matA = imp.shapeA ? imp.shapeA.material : 'default';
      const matB = B ? (imp.shapeB ? imp.shapeB.material : 'default') : 'concrete';
      // breakables
      for (const [o, other] of [[oA, B], [oB, A]]) {
        if (!o || o.broken || !o.def.breakSpeed) continue;
        if (imp.speed > o.def.breakSpeed) this.breakObject(o, imp, other);
      }
      this.fx({ type: 'impact', point: imp.point.clone(), speed: imp.speed, impulse: imp.impulse, matA, matB, ragdollA: !!pA, ragdollB: !!pB, ground: !B, bodyA: A, bodyB: B });
    }
  }

  breakObject(o, imp, other) {
    o.broken = true;
    const b = o.body;
    const person = other ? this.people.find((p) => p.rd.isRagdollBody(other)) : null;
    if (person && o.type === 'bottle') {
      // broken glass cuts: scalp and face lacerations bleed freely
      const inj = person.injury;
      const seg = other.userData.segment;
      const local = other.worldToLocal(imp.point, new Vec3());
      const n = new Vec3().subVectors(imp.point, other.pos).normalize();
      const nl = other.worldDirToLocal(n, new Vec3());
      const cuts = 1 + Math.floor(this.rng() * 3);
      for (let i = 0; i < cuts; i++) {
        const jitter = new Vec3((this.rng() - 0.5) * 0.05, (this.rng() - 0.5) * 0.05, (this.rng() - 0.5) * 0.05);
        const dir = new Vec3(this.rng() - 0.5, this.rng() - 0.5, this.rng() - 0.5).normalize();
        inj.addWound({
          body: other, seg, kind: 'laceration', local: local.clone().add(jitter), normal: nl.clone(), dir,
          radius: 0.008 + this.rng() * 0.012, severity: 0.6, extRate: (seg.name === 'head' ? 1.2 : 0.5) * (0.5 + this.rng()),
          intRate: 0, pain: 0.35, cause: 'glass', energy: 0,
        });
      }
      inj.log(`Lacerations from broken glass (${seg.name})`, 1);
    }
    this.fx({ type: 'shatter', object: o, kind: o.type === 'bottle' ? 'glass' : 'melon', point: b.pos.clone(), vel: b.vel.clone(), angVel: b.angVel.clone(), rot: b.rot.clone(), contact: imp.point.clone() });
    this.removeObject(o);
  }

  onInjuryEvent(person, e) {
    if (e.type === 'bonebreak') {
      const info = e.info;
      // keep a grab attached to the same material point after the body frame moved
      if (this.grab && this.grab.body === info.seg.body) this.grab.constraint.localPoint.sub(info.delta);
    }
    this.fx({ type: 'injury', person, event: e });
  }

  // ------------------------------------------------------------------------------------------
  /** Pick the body under a ray (people are tested against their visible skin). */
  pick(origin, dir, maxDist = 100) {
    let best = null;
    if (this.shape) {
      for (const h of raycastPeople(this.people, this.shape, origin, dir, maxDist)) {
        if (!best || h.tIn < best.t) best = { body: h.body, t: h.tIn, person: h.person };
      }
    }
    const h = this.world.raycast(origin, dir, maxDist, (b) => !(b.userData && b.userData.ragdoll));
    if (h && (!best || h.tIn < best.t)) best = h.ground ? { body: null, t: h.tIn, ground: true } : { body: h.body, t: h.tIn, person: null };
    if (best) best.point = new Vec3().copy(origin).addScaled(dir, best.t);
    return best;
  }
}
