// Base class for a playable character: a vehicle built from physics bodies, plus a
// Ragdoll rider attached by breakable joints (seat + hand grips). Subclasses define the
// vehicle, the riding pose, handling and abilities.

import { Vec2, Circle, Box, Polygon, RevoluteJoint, WheelJoint, WeldJoint } from 'planck';
import { CAT, MASK } from '../config.js';
import { Ragdoll } from './ragdoll.js';
import { clamp, wrapAngle } from '../core/math.js';

export class Character {
  // ---- static metadata (overridden by subclasses) ----
  static id = 'base';
  static displayName = 'Nobody';
  static vehicleName = 'Nothing';
  static blurb = '';
  static ability = '';
  static ability2 = '';
  static stats = { speed: 3, accel: 3, handling: 3, toughness: 3 };

  constructor(game, x, y) {
    this.game = game;
    this.phys = game.phys;
    this.group = this.phys.nextGroup();
    this.bodies = [];
    this.vjoints = [];
    this.grips = [];
    this.seat = null;
    this.mounted = true;
    this.ejected = false;
    this.dead = false;
    this.time = 0;
    this.lean = 0;
    this.meter = null; // { label, value, color }
    this.uid = Math.random().toString(36).slice(2, 8);
    this.spawnX = x;
    this.spawnY = y;

    this.buildVehicle(x, y);
    const setup = this.riderSetup();
    this.rider = new Ragdoll(game, this, setup, this.constructor.look, {
      group: this.group,
      toughness: this.constructor.toughness ?? 1,
      headArmor: this.constructor.headArmor ?? 1,
      voice: { ...(this.constructor.voice || {}), id: this.uid },
    });
    this.attachRider(setup);
  }

  // ------------------------------------------------------------ construction helpers

  vehicleFilter() {
    return { filterCategoryBits: CAT.VEHICLE, filterMaskBits: MASK.VEHICLE, filterGroupIndex: this.group };
  }

  makeBody(name, x, y, opts = {}) {
    const b = this.phys.body(
      {
        type: 'dynamic',
        position: new Vec2(x, y),
        angle: opts.angle || 0,
        bullet: !!opts.bullet,
        angularDamping: opts.angularDamping ?? 0.05,
        linearDamping: opts.linearDamping ?? 0,
      },
      { kind: 'vehicle', character: this, name, material: opts.material || 'metal' }
    );
    this.bodies.push(b);
    return b;
  }

  addFixture(body, shape, opts = {}) {
    return body.createFixture(shape, {
      density: opts.density ?? 1,
      friction: opts.friction ?? 0.6,
      restitution: opts.restitution ?? 0.1,
      ...this.vehicleFilter(),
    });
  }

  makeWheel(name, x, y, r, opts = {}) {
    const b = this.makeBody(name, x, y, { bullet: true, angularDamping: opts.angularDamping ?? 0.1, material: 'rubber' });
    this.addFixture(b, new Circle(r), { density: opts.density ?? 1.5, friction: opts.friction ?? 1.3, restitution: opts.restitution ?? 0.12 });
    b.wheelRadius = r;
    return b;
  }

  /** Suspension wheel joint. */
  wheelJoint(frame, wheel, axis, opts = {}) {
    const j = this.phys.createJoint(
      new WheelJoint(
        {
          enableMotor: true,
          maxMotorTorque: 0,
          motorSpeed: 0,
          frequencyHz: opts.hz ?? 4,
          dampingRatio: opts.damping ?? 0.7,
        },
        frame,
        wheel,
        wheel.getPosition(),
        new Vec2(axis[0], axis[1])
      )
    );
    this.vjoints.push({ joint: j, brk: opts.brk ?? 26000, name: opts.name || 'wheel' });
    return j;
  }

  /** Wheel joint from a physical spring rate k (N/m) and damper c (N*s/m). */
  springJoint(frame, wheel, axis, k, c, opts = {}) {
    const mA = frame.getMass();
    const mB = wheel.getMass();
    const m = (mA * mB) / (mA + mB);
    const w = Math.sqrt(k / m);
    const l = Math.hypot(axis[0], axis[1]);
    return this.wheelJoint(frame, wheel, [axis[0] / l, axis[1] / l], { ...opts, hz: w / (2 * Math.PI), damping: c / (2 * m * w) });
  }

  axle(frame, wheel, opts = {}) {
    const j = this.phys.createJoint(
      new RevoluteJoint({ enableMotor: true, maxMotorTorque: 0, motorSpeed: 0 }, frame, wheel, wheel.getPosition())
    );
    this.vjoints.push({ joint: j, brk: opts.brk ?? 24000, name: opts.name || 'axle' });
    return j;
  }

  /** Attach rider: seat revolute + hand grips. */
  attachRider(setup) {
    const r = this.rider;
    const hips = r.parts.hips;
    const seatBody = setup.seatBody || this.frame;
    const sj = this.phys.createJoint(
      new RevoluteJoint(
        {
          enableLimit: true,
          lowerAngle: -(setup.seatPlay ?? 0.3),
          upperAngle: setup.seatPlay ?? 0.3,
          enableMotor: true,
          maxMotorTorque: 160,
          motorSpeed: 0,
        },
        seatBody,
        hips.body,
        new Vec2(setup.seat.x, setup.seat.y)
      )
    );
    this.seat = { joint: sj, brk: setup.seatBreak ?? 20000 };
    for (const side of ['N', 'F']) {
      const h = setup.hands && setup.hands[side];
      if (!h || !h.body) continue;
      const fore = r.parts['fore' + side];
      const tip = r.handWorld(side);
      const j = this.phys.createJoint(new RevoluteJoint({ collideConnected: false }, h.body, fore.body, tip));
      this.grips.push({ side, joint: j, body: h.body, local: h.body.getLocalPoint(new Vec2(h.x, h.y)), brk: setup.gripBreak ?? 9000 });
    }
  }

  // ------------------------------------------------------------ queries

  get alive() {
    return this.rider.alive;
  }

  get canControl() {
    return this.rider.alive && this.mounted;
  }

  focus() {
    const fb = this.rider.focusBody();
    const b = fb || this.frame;
    const p = b.getPosition();
    const v = b.getLinearVelocity();
    return { x: p.x, y: p.y, vx: v.x, vy: v.y };
  }

  speed() {
    const v = this.frame.getLinearVelocity();
    return Math.hypot(v.x, v.y);
  }

  frameAngle() {
    return wrapAngle(this.frame.getAngle());
  }

  touching(body) {
    for (let ce = body.getContactList(); ce; ce = ce.next) {
      const c = ce.contact;
      if (!c.isTouching()) continue;
      const fa = c.getFixtureA();
      const fb = c.getFixtureB();
      if (fa.isSensor() || fb.isSensor()) continue;
      return true;
    }
    return false;
  }

  gripWorld(side) {
    for (const g of this.grips) {
      if (g.side === side && !g.joint._gone) return g.body.getWorldPoint(g.local);
    }
    return null;
  }

  /** Vehicle bodies still attached to the frame plus rider parts still connected to the torso. */
  attachedBodies() {
    const out = [];
    const seen = new Set([this.frame]);
    const stack = [this.frame];
    while (stack.length) {
      const b = stack.pop();
      if (b._gone) continue;
      out.push(b);
      for (let je = b.getJointList(); je; je = je.next) {
        const o = je.other;
        if (seen.has(o) || je.joint._gone) continue;
        seen.add(o);
        const u = o.getUserData();
        if (u && (u.kind === 'vehicle' || u.kind === 'part') && u.character === this) stack.push(o);
      }
    }
    return out;
  }

  allBodies() {
    return [...this.bodies.filter((b) => !b._gone), ...this.rider.bodies()];
  }

  // ------------------------------------------------------------ per-step

  preStep(dt, input) {
    this.time += dt;
    let lean = 0;
    if (this.rider.alive) {
      if (input.isDown('left')) lean -= 1;
      if (input.isDown('right')) lean += 1;
    }
    this.lean = lean;

    if (this.canControl) {
      this.control(dt, input);
      if (input.gamePressed('eject')) this.eject();
    } else {
      this.idle(dt);
    }
    this.abilityTick(dt, input);

    const ctrl = this.riderCtrl(dt);
    ctrl.mode = this.mounted ? 'ride' : 'free';
    ctrl.lean = this.mounted ? lean : lean;
    this.rider.preStep(dt, ctrl);
  }

  postStep(dt) {
    const invDt = this.phys.invDt;
    this.detectCrash(dt);
    // grips
    for (let i = this.grips.length - 1; i >= 0; i--) {
      const g = this.grips[i];
      if (g.joint._gone) {
        this.grips.splice(i, 1);
        continue;
      }
      const f = g.joint.getReactionForce(invDt);
      g.fAvg = (g.fAvg || 0) * 0.6 + Math.hypot(f.x, f.y) * 0.4;
      const gf = g.fAvg;
      if (gf > g.brk * (this.rider.braceTimer > 0 ? 1.6 : 1)) {
        this.rider.note('grip' + g.side, 'break', gf);
        this.phys.destroyJoint(g.joint);
        this.grips.splice(i, 1);
      }
    }
    // seat
    if (this.seat && !this.seat.joint._gone) {
      const f = this.seat.joint.getReactionForce(invDt);
      this.seat.fAvg = (this.seat.fAvg || 0) * 0.6 + Math.hypot(f.x, f.y) * 0.4;
      const fm = this.seat.fAvg;
      this.seatPeak = Math.max(this.seatPeak || 0, fm);
      if (fm > this.seat.brk * (this.rider.braceTimer > 0 ? 1.5 : 1)) {
        this.rider.note('seat', 'break', fm);
        this.dismount();
      }
    } else if (this.mounted) {
      this.dismount();
    }
    // vehicle structural joints
    for (let i = this.vjoints.length - 1; i >= 0; i--) {
      const vj = this.vjoints[i];
      if (vj.joint._gone) {
        this.vjoints.splice(i, 1);
        continue;
      }
      const f = vj.joint.getReactionForce(invDt);
      if (Math.hypot(f.x, f.y) > vj.brk) {
        const a = vj.joint.getAnchorA();
        this.phys.destroyJoint(vj.joint);
        this.vjoints.splice(i, 1);
        this.game.audio.impact(1, 'metal', a.x, a.y);
        this.game.particles.sparks(a.x, a.y, 14, 5);
        this.onVehicleJointBroken(vj);
      }
    }
    this.rider.postStep(dt);
    this.vehiclePostStep(dt);
  }

  /**
   * A sudden change in the vehicle's velocity (hitting a wall, landing on your face,
   * being blown up) throws the rider off — momentum does the rest.
   */
  detectCrash(dt) {
    if (this.frame._gone) return;
    const v = this.frame.getLinearVelocity();
    const h = (this.vHist ||= []);
    h.push(v.x, v.y);
    if (h.length > 24) h.splice(0, 2);
    if (this.noCrash > 0) {
      this.noCrash -= dt;
      h.length = 0;
      return;
    }
    if (!this.mounted || h.length < 24) return;
    const dvx = v.x - h[0];
    const dvy = v.y - h[1];
    const ax = this.frame.getWorldVector(new Vec2(1, 0));
    const along = dvx * ax.x + dvy * ax.y;
    const perp = -dvx * ax.y + dvy * ax.x;
    const brace = this.rider.braceTimer > 0 ? 1.5 : 1;
    const k = (this.constructor.crashTolerance ?? 1) * brace; // head-on / rear impacts
    const kl = (this.constructor.landingTolerance ?? 1) * brace; // hard vertical landings
    // a mostly-upward jolt is a landing (judged on its own tolerance); anything else is a collision
    const landing = dvy > Math.abs(dvx) * 1.5;
    const crashed = landing ? Math.hypot(dvx, dvy) > 14 * kl : Math.abs(along) > 7 * k || Math.abs(perp) > 14 * kl;
    if (crashed) {
      this.rider.note('crash', along.toFixed(1), perp);
      this.crash();
    }
  }

  crash() {
    for (const g of this.grips) if (!g.joint._gone) this.phys.destroyJoint(g.joint);
    this.grips.length = 0;
    this.dismount();
  }

  dismount() {
    if (!this.mounted) return;
    this.mounted = false;
    if (this.seat && !this.seat.joint._gone) this.phys.destroyJoint(this.seat.joint);
    this.seat = null;
    this.onDismount();
    if (this.rider.alive) this.rider.scream(0.8);
    this.game.onDismount(this);
  }

  eject() {
    this.noCrash = 0.3;
    for (const g of this.grips) if (!g.joint._gone) this.phys.destroyJoint(g.joint);
    this.grips.length = 0;
    this.dismount();
    this.ejected = true;
    const fv = this.frame.getLinearVelocity();
    for (const b of this.rider.bodies()) {
      const m = b.getMass();
      b.applyLinearImpulse(new Vec2(m * (fv.x * 0.1 + 2), m * 6.5), b.getWorldCenter(), true);
    }
  }

  onRiderDeath(cause) {
    this.dead = true;
    this.game.onPlayerDeath(this, cause);
  }

  onPartSevered(part) {
    // a hand that is no longer connected to the body cannot steer; drop the bar after a moment
    if (!this.rider.alive) return;
    const lostHands = ['N', 'F'].filter((s) => !this.rider.connectedToCore(this.rider.parts['fore' + s])).length;
    if (lostHands === 2 && this.mounted && Math.random() < 0.5) {
      // still sat on the seat; steering is now... optimistic
    }
  }

  destroy() {
    this.stopAudio();
    for (const b of this.bodies) this.phys.destroyBody(b);
    this.rider.destroy();
  }

  // ------------------------------------------------------------ drawing helpers

  withBody(ctx, body, fn) {
    if (body._gone) return;
    const p = body.getPosition();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(body.getAngle());
    fn();
    if (this.game.particles.bodyDecals.has(body)) this.game.particles.drawBodyDecals(ctx, body);
    ctx.restore();
  }

  draw(ctx) {
    this.rider.drawBack(ctx);
    this.drawVehicle(ctx);
    this.rider.drawFront(ctx);
    if (this.drawVehicleFront) this.drawVehicleFront(ctx);
  }

  // ------------------------------------------------------------ overridables

  buildVehicle(x, y) {}
  riderSetup() {
    return {};
  }
  riderCtrl(dt) {
    return {};
  }
  control(dt, input) {}
  idle(dt) {}
  abilityTick(dt, input) {}
  vehiclePostStep(dt) {}
  onDismount() {}
  onVehicleJointBroken(vj) {}
  drawVehicle(ctx) {}
  stopAudio() {}
  updateAudio(dt) {}

  /**
   * Spin the whole character (vehicle + attached rider) like one rigid body: every body
   * gets the same angular velocity `w` around the shared centre of mass, plus an optional
   * upward velocity. Joints feel no stress because the motion is perfectly rigid.
   */
  spinRigid(w, liftVy = null) {
    const bodies = this.attachedBodies();
    let m = 0;
    let cx = 0;
    let cy = 0;
    let vx = 0;
    let vy = 0;
    for (const b of bodies) {
      const bm = b.getMass();
      const c = b.getWorldCenter();
      const v = b.getLinearVelocity();
      m += bm;
      cx += c.x * bm;
      cy += c.y * bm;
      vx += v.x * bm;
      vy += v.y * bm;
    }
    if (m <= 0) return;
    cx /= m;
    cy /= m;
    vx /= m;
    vy /= m;
    if (liftVy !== null) vy = Math.max(vy, liftVy);
    for (const b of bodies) {
      const c = b.getWorldCenter();
      b.setLinearVelocity(new Vec2(vx - w * (c.y - cy), vy + w * (c.x - cx)));
      const wheel = b.getUserData() && b.getUserData().material === 'rubber';
      b.setAngularVelocity(wheel ? b.getAngularVelocity() + w : w);
      b.setAwake(true);
    }
    this.noCrash = Math.max(this.noCrash || 0, 0.35);
  }

  /** Standard air/ground lean torque. */
  applyLean(dt, torque) {
    if (this.lean !== 0) this.frame.applyTorque(-this.lean * torque, true);
  }

  /** Drive a wheel/axle motor toward a target angular velocity (rad/s, negative = forward). */
  static drive(joint, speed, torque) {
    if (!joint || joint._gone) return;
    joint.enableMotor(true);
    joint.setMotorSpeed(speed);
    joint.setMaxMotorTorque(torque);
  }

  static freewheel(joint, drag = 0.4) {
    if (!joint || joint._gone) return;
    joint.enableMotor(true);
    joint.setMotorSpeed(0);
    joint.setMaxMotorTorque(drag);
  }
}

export { Vec2, Circle, Box, Polygon, RevoluteJoint, WheelJoint, WeldJoint, clamp };
