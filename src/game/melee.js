import { Vec3, clamp, smoothstep, lerp } from '../physics/math.js';
import { Shape, SHAPE_SPHERE } from '../physics/shapes.js';
import { ContactCollector, collideShapes } from '../physics/collide.js';

/**
 * Melee combat: hand weapons with physical figures, and the mechanics of a blow.
 *
 * A strike is swept. Every physics step the game hands the striker the world-space striking geometry
 * where it is now (the bat's barrel, the knife's blade, the knuckles, the boot's sole); the striker
 * sweeps it from where it was the step before, finds the first contact with each body part of each
 * person (a part is hit at most once per strike, and a fist or a boot lands on one person once) and
 * resolves the collision as an impulse between two effective masses: the striker's at the point that
 * hits (a bat pivoting in the hands, a fist with the arm and the trunk's rotation behind it, a stamp
 * with the leg and the body's weight) and the struck part's at the point it is hit (its own generalised
 * mass there, plus the share of the body that moves with it during a contact of a few milliseconds).
 * A part lying on the floor cannot get out of the way of a blow that drives it into the floor: it is
 * crushed against it and takes the striker's whole momentum.
 *
 * The impulse moves the ragdoll (bounded: no part is launched faster than it could move, a body on
 * the floor is not driven through it); the injury model gets the closing speed, the masses and the
 * stiffness of the striker, from which it works out the peak force of the blow and its duration, and
 * from those what breaks (see InjurySystem.meleeHit). The striker loses the momentum it gave away: a
 * bat stops dead on a head but carries on through a parrying forearm, a haymaker drives on, a knife
 * slices on and a stab stays in. What is left of the speed is returned so the animation can show it.
 */

// Weapons. speed / massEff / hard are [uncharged, fully charged]: the speed of the striking point
// (m/s), the effective mass at it (kg, including what is behind it during the contact) and the
// fraction of that mass that carries the force peak (a bat is rigid; a fist peaks on the hand and
// forearm while the rest of the arm follows through). k: contact stiffness of the striker (N/m);
// area: contact patch on the body (m²); span: length of the contact along the striker (m);
// maxForce: what the striker itself can carry (a bare fist gives way beyond ~4 kN); maxSpeed: the
// fastest any point of it can plausibly move (m/s; a faster sweep is an animation glitch).
export const MELEE_WEAPONS = {
  bat: {
    label: 'Baseball bat', item: '33" ash bat, 0.9 kg', kind: 'blunt', material: 'wood',
    shape: 'capsule', radius: 0.033, mass: 0.9, length: 0.84,
    // the striking segment the game passes is the barrel: `a` where it starts (`grip` m from the
    // hands), `b` the tip; the sweet spot is `sweet` m from the tip
    grip: 0.3, barrel: 0.5, sweet: 0.16,
    speed: [14, 30], massEff: [1.1, 1.3], hard: [1, 1], maxSpeed: 45,
    k: 4e6, restitution: 0.15, friction: 0.35, maxForce: 60000, area: 0.0012, span: 0.08,
  },
  knife: {
    label: 'Knife', item: '17 cm kitchen knife', kind: 'sharp', material: 'metal',
    // the striking segment is the blade: `a` the guard, `b` the point
    shape: 'capsule', radius: 0.004, mass: 0.2, blade: 0.17, width: 0.03, sharpness: 0.9,
    speed: [6, 8], massEff: [1.2, 2.0], // a slash: hand and forearm
    stabSpeed: [3.5, 6], stabMass: [3, 5], // a thrust with the body behind it
    hard: [0.5, 0.5], maxSpeed: 14, k: 3e6, restitution: 0.02, friction: 0.08, maxForce: 60000, area: 0.0002, span: 0.03,
  },
  fists: {
    label: 'Fists', item: 'bare knuckles', kind: 'blunt', material: 'flesh',
    // the knuckles of the closed fist (a = b, or a short segment across them)
    shape: 'sphere', radius: 0.045,
    speed: [7, 11], massEff: [3, 5], hard: [0.25, 0.4], maxSpeed: 16, // a jab .. a haymaker
    k: 0.8e6, restitution: 0.2, friction: 0.5, maxForce: 4200, area: 0.003, span: 0.07,
  },
  boot: {
    label: 'Boot', item: 'work boot (stamp)', kind: 'blunt', material: 'shoe',
    // the sole: `a` the heel, `b` the toe (a kick drives it much faster than a stamp)
    shape: 'capsule', radius: 0.045, sole: 0.27,
    speed: [4, 5], massEff: [12, 20], hard: [0.8, 0.8], maxSpeed: 14,
    k: 0.6e6, restitution: 0.05, friction: 0.6, maxForce: 60000, area: 0.004, span: 0.09,
  },
};

/** Speed (m/s), effective mass (kg) etc. of a weapon's blow for a charge 0..1. */
export function meleeParams(weapon, charge = 1) {
  const d = MELEE_WEAPONS[weapon];
  if (!d) throw new Error(`unknown melee weapon ${weapon}`);
  const c = clamp(charge, 0, 1);
  const at = (r) => (r ? lerp(r[0], r[1], c) : undefined);
  return { speed: at(d.speed), massEff: at(d.massEff), hard: at(d.hard), stabSpeed: at(d.stabSpeed), stabMass: at(d.stabMass) };
}

// How much of the rest of the body moves with a struck part during a blow (contact of a few ms): the
// struck part's own effective mass is multiplied by this.
export const MELEE_COUPLING = {
  head: 1.3, neck: 1.6, chest: 1.8, abdomen: 1.7, pelvis: 2.0, upperArm: 1.5, forearm: 1.3, hand: 1.15,
  thigh: 1.8, shin: 1.5, foot: 1.4,
};

// Bounds on what a blow does to the ragdoll (per struck body): velocity change of the struck point,
// spin, total impulse, and the velocity into the floor of a part lying on it.
export const MELEE_LIMITS = { dv: 12, spin: 60, impulse: 90, floorDv: 2 };

const segKind = (name) => name.replace(/[LR]$/, '');

// ------------------------------------------------------------------------------------------------
// contact queries (the striker against a body's collider shapes, through the physics narrowphase)

const _col = { depth: -Infinity, pA: new Vec3(), pB: new Vec3(), n: new Vec3() };
const collector = new ContactCollector((sA, sB, ax, ay, az, bx, by, bz, nx, ny, nz) => {
  // pA on the striker, pB on the body, n from the body toward the striker; depth > 0 overlapping
  const d = (bx - ax) * nx + (by - ay) * ny + (bz - az) * nz;
  if (d > _col.depth) {
    _col.depth = d;
    _col.pA.set(ax, ay, az);
    _col.pB.set(bx, by, bz);
    _col.n.set(nx, ny, nz);
  }
});
collector.margin = 0;

function normPose(p) {
  if (p instanceof Vec3) return { a: p.clone(), b: p.clone() };
  if (p.p) return { a: p.p.clone(), b: p.p.clone() };
  return { a: p.a.clone(), b: (p.b || p.a).clone() };
}

// ------------------------------------------------------------------------------------------------
// the skin (the sculpted body when the sandbox has one, the colliders otherwise) as a distance field

/** Signed distance to the skin of `body` at a world point (m, negative inside). */
function skinField(sb, body) {
  const seg = body.userData.segment;
  const shape = sb.shape;
  if (shape && shape.segIndex && shape.segIndex[seg.name] !== undefined && !seg.fractured) {
    const si = shape.segIndex[seg.name];
    const bindPos = body.userData.fragment ? body.userData.bindPos : seg.bindPos;
    const mp = shape.modelPose[seg.name];
    const m = new Vec3();
    return (p) => {
      body.worldToLocal(p, m).add(bindPos).sub(mp.pivot).applyQuat(mp.q).add(mp.pivot);
      return shape.segmentSdf(si, m.x, m.y, m.z);
    };
  }
  for (const s of body.shapes) s.updateWorld(body.pos, body.rot);
  return (p) => {
    let d = Infinity;
    for (const s of body.shapes) d = Math.min(d, s.signedDistance(p));
    return d;
  };
}

const _g = new Vec3();
function fieldGradient(f, p, out, eps = 0.0012) {
  const x = p.x, y = p.y, z = p.z;
  out.set(f(_g.set(x + eps, y, z)) - f(_g.set(x - eps, y, z)), f(_g.set(x, y + eps, z)) - f(_g.set(x, y - eps, z)), f(_g.set(x, y, z + eps)) - f(_g.set(x, y, z - eps)));
  return out.normalize();
}

/** Move p onto the surface f = 0 (Newton steps along the gradient). Returns success. */
function projectToSurface(f, p, n = new Vec3()) {
  for (let i = 0; i < 6; i++) {
    const d = f(p);
    if (!Number.isFinite(d)) return false;
    if (Math.abs(d) < 3e-4) return true;
    fieldGradient(f, p, n);
    if (n.lengthSq() < 0.5) return false;
    p.addScaled(n, -d);
  }
  return Math.abs(f(p)) < 0.003;
}

// ------------------------------------------------------------------------------------------------

/**
 * One strike in progress. Create it when the swing (thrust, stamp) starts, call update() (or
 * sweep()) every physics step while the striking part moves, and end() when the swing is over.
 *
 * opts: { charge 0..1 (default 1), mode: knife 'slash' | 'stab' | undefined (from the motion: the
 *   point leading is a stab), by: who strikes (a person - never hit - or a tag such as 'player',
 *   passed on in the fx), exclude: [people never hit] }
 */
export class MeleeStriker {
  constructor(sandbox, weapon, opts = {}) {
    this.sb = sandbox;
    this.weapon = weapon;
    this.def = MELEE_WEAPONS[weapon];
    if (!this.def) throw new Error(`unknown melee weapon ${weapon}`);
    this.charge = clamp(opts.charge ?? 1, 0, 1);
    this.params = meleeParams(weapon, this.charge);
    this.mode = opts.mode ?? null;
    this.by = opts.by ?? null;
    this.exclude = new Set(opts.exclude || []);
    if (this.by && this.by.rd) this.exclude.add(this.by);
    // a fist or a boot lands once on whoever it hits; a bat or a blade can go on to another part
    this.compact = this.def.shape === 'sphere' || weapon === 'boot';
    this.shape = this.def.shape === 'sphere' ? Shape.sphere(this.def.radius) : Shape.capsule(this.def.radius, 0);
    this.hitBodies = new Set();
    this.hitPeople = new Set();
    this.hits = [];
    this.speedLeft = 1;
    this.stopped = false;
    this.ended = false;
    this.last = null;
    this._a = new Vec3();
    this._b = new Vec3();
  }

  /**
   * The striking geometry where it is now (world): { a, b } (segment: bat barrel start -> tip, knife
   * guard -> point, boot heel -> toe), { p } or a Vec3 (a point: the knuckles). Sweeps it from where
   * it was at the previous call over `dt` seconds. opts.speed overrides the speed measured from the
   * motion (m/s at the sweet spot / point / knuckles; the direction is kept).
   * Returns { hits: [new hits], speedLeft: 0..1 of the striker's speed left after its hits so far,
   * stopped }. Animate the rest of the swing at speedLeft (or stop it when stopped).
   */
  update(pose, dt, opts = {}) {
    if (opts.charge !== undefined && opts.charge !== this.charge) {
      this.charge = clamp(opts.charge, 0, 1);
      this.params = meleeParams(this.weapon, this.charge);
    }
    const cur = normPose(pose);
    const prev = this.last || cur;
    this.last = cur;
    return this.sweep(prev, cur, dt, opts);
  }

  /** As update() with both poses given: the striker moves from `prev` to `cur` over `dt`. */
  sweep(prev, cur, dt, opts = {}) {
    const out = { hits: [], speedLeft: this.speedLeft, stopped: this.stopped };
    if (this.stopped || this.ended || !(dt > 0)) return out;
    prev = normPose(prev);
    cur = normPose(cur);
    this.last = cur;
    const r = this.def.radius;
    // swept bounds of the striker
    const pad = r + 0.01;
    const lo = new Vec3(Infinity, Infinity, Infinity), hi = new Vec3(-Infinity, -Infinity, -Infinity);
    for (const q of [prev.a, prev.b, cur.a, cur.b]) {
      lo.set(Math.min(lo.x, q.x - pad), Math.min(lo.y, q.y - pad), Math.min(lo.z, q.z - pad));
      hi.set(Math.max(hi.x, q.x + pad), Math.max(hi.y, q.y + pad), Math.max(hi.z, q.z + pad));
    }
    const disp = Math.max(prev.a.distanceTo(cur.a), prev.b.distanceTo(cur.b));
    const n = clamp(Math.ceil(disp / Math.max(0.006, 0.4 * (r + 0.02))), 1, 96);
    const cands = [];
    for (const person of this.sb.people) {
      if (this.exclude.has(person) || (this.compact && this.hitPeople.has(person))) continue;
      for (const body of person.rd.allBodies()) {
        if (!body.world || this.hitBodies.has(body) || !body.userData.segment) continue;
        let near = false;
        for (const s of body.shapes) {
          s.updateWorld(body.pos, body.rot);
          if (s.aabbMin.x <= hi.x && s.aabbMax.x >= lo.x && s.aabbMin.y <= hi.y && s.aabbMax.y >= lo.y && s.aabbMin.z <= hi.z && s.aabbMax.z >= lo.z) near = true;
        }
        if (!near) continue;
        // first sample in contact, then the moment of contact by bisection
        let t1 = -1, t0 = 0;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          if (this.overlapAt(body, prev, cur, t)) {
            t1 = t;
            break;
          }
          t0 = t;
        }
        if (t1 < 0) continue;
        if (t1 > 0) {
          let a = t0, b = t1;
          for (let it = 0; it < 9; it++) {
            const m = 0.5 * (a + b);
            if (this.overlapAt(body, prev, cur, m)) b = m;
            else a = m;
          }
          t1 = b;
        }
        this.overlapAt(body, prev, cur, t1);
        cands.push({ person, body, t: t1, pA: _col.pA.clone(), pB: _col.pB.clone(), n: _col.n.clone() });
      }
    }
    cands.sort((x, y) => x.t - y.t);
    const s0 = this.speedLeft;
    for (const c of cands) {
      if (this.stopped) break;
      if (this.hitBodies.has(c.body) || (this.compact && this.hitPeople.has(c.person))) continue;
      // (later contacts of this sweep meet a striker already slowed by the earlier ones)
      const hit = this.resolve(c, prev, cur, dt, this.speedLeft / s0, opts);
      if (hit) out.hits.push(hit);
    }
    out.speedLeft = this.speedLeft;
    out.stopped = this.stopped;
    return out;
  }

  /** The strike is over: emits 'meleeMiss' if it hit nobody. Returns { hits, speedLeft, stopped }. */
  end() {
    if (!this.ended) {
      this.ended = true;
      if (!this.hits.length) this.sb.fx({ type: 'meleeMiss', weapon: this.weapon, point: this.last ? this.last.b.clone() : null, by: this.by });
    }
    return { hits: this.hits, speedLeft: this.speedLeft, stopped: this.stopped };
  }

  overlapAt(body, prev, cur, t) {
    this._a.lerpVectors(prev.a, cur.a, t);
    this._b.lerpVectors(prev.b, cur.b, t);
    const s = this.shape;
    if (s.type === SHAPE_SPHERE) s.wPos.lerpVectors(this._a, this._b, 0.5);
    else {
      s.p0.copy(this._a);
      s.p1.copy(this._b);
      s.wPos.lerpVectors(this._a, this._b, 0.5);
    }
    _col.depth = -Infinity;
    collector.flip = false;
    for (const bs of body.shapes) if (bs.collides) collideShapes(s, bs, collector);
    return _col.depth >= 0;
  }

  /** Parameter (0 at a, 1 at b) of the striker point nearest to world point p at time t. */
  paramAt(p, prev, cur, t) {
    if (this.shape.type === SHAPE_SPHERE) return 0.5;
    const a = this._a.lerpVectors(prev.a, cur.a, t), b = this._b.lerpVectors(prev.b, cur.b, t);
    const ab = new Vec3().subVectors(b, a);
    const l2 = ab.lengthSq();
    return l2 > 1e-10 ? clamp(new Vec3().subVectors(p, a).dot(ab) / l2, 0, 1) : 0.5;
  }

  /** Velocity of the striker point at parameter u (straight-line motion over the step). */
  pointVelocity(prev, cur, u, dt, out = new Vec3()) {
    const p0 = new Vec3().lerpVectors(prev.a, prev.b, u), p1 = new Vec3().lerpVectors(cur.a, cur.b, u);
    return out.subVectors(p1, p0).scale(1 / dt);
  }

  /** Parameter of the point whose speed the weapon's figures refer to. */
  refParam(kind) {
    const d = this.def;
    if (this.weapon === 'bat') return clamp((d.barrel - d.sweet) / d.barrel, 0, 1);
    if (this.weapon === 'knife') return kind === 'stab' ? 1 : 0.65;
    return 0.5;
  }

  /** Collision with one body part: impulses, injury, fx. Returns the hit record or null. */
  resolve(c, prev, cur, dt, vScale, opts) {
    const { person, body } = c;
    const def = this.def;
    const seg = body.userData.segment;
    const k = segKind(seg.name);
    const u = this.paramAt(c.pA, prev, cur, c.t);
    const vW = this.pointVelocity(prev, cur, u, dt).scale(vScale);
    // knife: the point leading (thrust along the blade) is a stab, the edge drawn across a cut
    const axisW = new Vec3().subVectors(this._b.lerpVectors(prev.b, cur.b, c.t), this._a.lerpVectors(prev.a, cur.a, c.t));
    if (axisW.lengthSq() > 1e-10) axisW.normalize();
    else axisW.setZero();
    let kind = 'blunt';
    if (def.kind === 'sharp') {
      const vl = vW.length();
      const along = vl > 1e-6 ? vW.dot(axisW) / vl : 0;
      kind = this.mode === 'stab' ? 'stab' : this.mode === 'slash' ? 'cut' : along > 0.6 && u > 0.7 ? 'stab' : 'cut';
    }
    if (opts.speed) {
      const vr = this.pointVelocity(prev, cur, this.refParam(kind), dt).length();
      if (vr > 1e-6) vW.scale(opts.speed / vr);
    }
    // (a glitch in the animation - a jump of the weapon between two steps - is not a blow at 100 m/s)
    if (vW.length() > def.maxSpeed) vW.scale(def.maxSpeed / vW.length());
    const P = c.pB.clone(); // on the body's collider
    const nIn = c.n.clone().negate(); // into the body
    const vRel = vW.clone().sub(body.velocityAt(P, new Vec3()));
    const vn = vRel.dot(nIn);
    const speed = vRel.length();
    if (kind === 'blunt' && vn < 1) return null;
    if (kind === 'stab' && vRel.dot(axisW) < 0.8) kind = speed > 1.5 ? 'cut' : null;
    if (!kind || (kind === 'cut' && (speed < 1.5 || vn < -0.3))) return null;

    // ---- effective masses
    const prm = this.params;
    let mW = prm.massEff;
    if (this.weapon === 'bat') {
      // a bat pivots in the hands: heavier near them, lighter (and faster) toward the tip
      const rr = def.grip + u * def.barrel, rs = def.grip + def.barrel - def.sweet;
      mW *= clamp((rs / rr) ** 2, 0.6, 2.5);
    }
    if (kind === 'stab') mW = prm.stabMass;
    const mHard = mW * prm.hard;
    const rB = new Vec3().subVectors(P, body.pos);
    const imB = Math.max(body.inverseMassAt(rB, nIn), 1e-6);
    const mBody = (MELEE_COUPLING[k] ?? 1.5) / imB;
    // a part lying on the floor (or on a fixed prop) cannot get out of the way of a blow that drives
    // it down: it is crushed against the floor and takes the striker's whole momentum
    let minY = Infinity;
    for (const s of body.shapes) minY = Math.min(minY, s.aabbMin.y);
    const grounded = body.groundContact || minY - this.sb.world.groundY < 0.03;
    const backed = grounded ? smoothstep(0.35, 0.85, -nIn.y) : 0;
    const mBinj = mBody / Math.max(1 - 0.95 * backed, 0.05);
    const e = kind === 'blunt' ? def.restitution : 0;
    const muFree = 1 / (1 / mW + 1 / mBody), muInj = 1 / (1 / mW + 1 / mBinj);
    const vnc = Math.max(vn, 0);
    const vStab = kind === 'stab' ? Math.max(vRel.dot(axisW), 0) : vnc;
    let Jn = (1 + e) * vStab * muFree; // moves the part
    let Jinj = (1 + e) * vStab * muInj; // what the tissue takes
    if (kind === 'cut') {
      // the edge slices rather than pushes
      Jn *= 0.25;
      Jinj *= 0.25;
    }
    // tangential: friction twists what a glancing blow hits; a blade's drag
    const vt = vRel.clone().addScaled(nIn, -vn);
    const vtl = vt.length();
    const tHat = vtl > 1e-6 ? vt.clone().scale(1 / vtl) : null;
    const Jt = tHat ? Math.min(def.friction * Jn, vtl * muFree) : 0;
    const Jw = nIn.clone().scale(Jn);
    if (tHat) Jw.addScaled(tHat, Jt);

    // ---- the skin where it landed
    const f = skinField(this.sb, body);
    const Ps = P.clone();
    const nOut = c.n.clone();
    const gN = new Vec3();
    if (projectToSurface(f, Ps, gN) && Ps.distanceTo(P) < 0.05) nOut.copy(fieldGradient(f, Ps, gN));
    else Ps.copy(P);

    const info = {
      weapon: this.weapon, label: def.label, kind, vn: vStab, speed, J: Jinj, Jw, energy: 0,
      mW, mHard, mB: mBinj, mBody, kW: def.k, maxForce: def.maxForce, area: def.area, span: def.span,
      radius: def.radius, axisW: axisW.lengthSq() > 0.5 ? axisW.clone() : null, backed, sharpness: def.sharpness ?? 0, charge: this.charge,
    };
    let speedRatio;
    if (kind === 'blunt') {
      info.energy = 0.5 * muInj * vnc * vnc * (1 - e * e);
      // the striker keeps what it did not give away
      const v2 = vW.clone().addScaled(nIn, -Jinj / mW);
      if (tHat) v2.addScaled(tHat, -Jt / mW);
      speedRatio = clamp(v2.length() / Math.max(vW.length(), 1e-6), 0, 1);
    } else if (kind === 'stab') {
      const dirW = axisW.clone().scale(0.75).addScaled(vRel, 0.25 / Math.max(speed, 1e-6)).normalize();
      const E = 0.5 * muInj * vStab * vStab;
      info.energy = E;
      const edge = new Vec3().crossVectors(dirW, Math.abs(dirW.y) < 0.9 ? new Vec3(0, 1, 0) : new Vec3(1, 0, 0)).normalize();
      info.stab = { dirW, energy: E, length: def.blade, width: def.width, edgeW: edge };
      speedRatio = 0; // the blade stays in
    } else {
      // incised wound: the line along which the moving blade crosses the skin (its motion carried on
      // past this step - the slash goes on), as deep as the blade is in but no deeper than the slash
      // can drive it through the tissue, for as long as its energy lasts
      const sharp = def.sharpness ?? 0.9;
      const dMax = clamp(0.004 + 0.0028 * speed * sharp * Math.sqrt(mW / 1.6), 0.002, 0.035);
      const ek = 0.5 * mW * vW.lengthSq();
      const path = this.cutPath(f, prev, cur, c.t, dMax, 0.6 * ek);
      if (!path.pts.length) {
        // only nicked: the blade touched the skin but never went in
        path.pts.push(Ps.clone());
        path.nrm.push(nOut.clone());
        path.depths.push(0.002);
      }
      let dMaxCut = 0;
      for (const d of path.depths) dMaxCut = Math.max(dMaxCut, d);
      info.cut = { pathW: path.pts, normalsW: path.nrm, depths: path.depths, depth: dMaxCut, length: path.length };
      info.energy = path.work;
      speedRatio = Math.sqrt(clamp(1 - path.work / Math.max(ek, 1e-6), 0, 1));
    }

    // ---- the ragdoll: the blow's impulse, bounded
    const Japp = Jw.clone().scale((this.sb.settings ? this.sb.settings.forceScale : 1) * (person.knockback ?? 1));
    const jl = Japp.length();
    let applied = 0;
    if (jl > 1e-9) {
      const dJ = Japp.clone().scale(1 / jl);
      const im = Math.max(body.inverseMassAt(rB, dJ), 1e-9);
      let cap = Math.min(MELEE_LIMITS.impulse, MELEE_LIMITS.dv / im);
      const spin = body.invInertiaMul(new Vec3().crossVectors(rB, dJ), new Vec3()).length();
      if (spin > 1e-9) cap = Math.min(cap, MELEE_LIMITS.spin / spin);
      if (backed > 0) cap = lerp(cap, Math.min(cap, MELEE_LIMITS.floorDv / im), backed);
      applied = Math.min(jl, cap);
      Japp.scale(applied / jl);
      body.applyImpulse(Japp, P);
    }

    // ---- the injury
    const res = person.injury.meleeHit(body, Ps, nIn, info) || { fractures: [], wounds: [], structures: [] };
    this.hitBodies.add(body);
    this.hitPeople.add(person);
    this.speedLeft *= speedRatio;
    if (this.speedLeft < 0.15) this.stopped = true;
    const hit = {
      person, body, seg: seg.name, kind, point: Ps.clone(), normal: nOut.clone(), dir: nIn.clone(), speed,
      impulse: Jinj, applied, force: res.force || 0, energy: res.energy ?? info.energy, fractures: res.fractures, ko: !!res.ko,
      killed: !!res.killed, armor: res.armor || null, depth: res.depth || 0, structures: res.structures, wounds: res.wounds, time: c.t,
      head: res.head || null, // blows to the head: { load (knockout measure, ~1 = 50 %), omega (rad/s), g }
    };
    this.hits.push(hit);
    this.sb.fx({
      type: 'meleeHit', weapon: this.weapon, person, body, seg: seg.name, point: Ps.clone(), normal: nOut.clone(), dir: nIn.clone(),
      velocity: vRel.clone(), speed, energy: hit.energy, impulse: Jinj, force: hit.force, kind, fractures: res.fractures, ko: hit.ko,
      killed: hit.killed, armor: hit.armor, depth: hit.depth, structures: res.structures, charge: this.charge, by: this.by,
    });
    return hit;
  }

  /**
   * The incision a moving blade makes: from the moment of contact (sweep parameter t0) the blade's
   * motion over this step is carried on, and wherever the blade crosses the skin of the part (field
   * f) is a point of the cut, as deep as the blade is in (at most dMax). The cut ends when the blade
   * leaves the part, after 18 cm, or when the cutting work (~12 kJ per m² of cut face) has used up
   * `budget` J. Returns { pts (world), nrm (outward), depths (m), length (m), work (J) }.
   */
  cutPath(f, prev, cur, t0, dMax, budget) {
    const G = 12000;
    const out = { pts: [], nrm: [], depths: [], length: 0, work: 0 };
    const va = new Vec3().subVectors(cur.a, prev.a), vb = new Vec3().subVectors(cur.b, prev.b);
    const travel = Math.max(va.length(), vb.length());
    const dtp = travel > 1e-6 ? 0.004 / travel : 1; // sweep parameter per ~4 mm of travel
    const a = new Vec3(), b = new Vec3(), g = new Vec3();
    let dPrev = 0, misses = 0;
    for (let i = 0; i <= 80; i++) {
      const t = t0 + i * dtp;
      a.copy(prev.a).addScaled(va, t);
      b.copy(prev.b).addScaled(vb, t);
      const e = bladeEntry(f, a, b);
      if (!e) {
        // (the collider may be touched a little before the skin is)
        if (out.pts.length || ++misses > 8) break;
        continue;
      }
      const d = Math.min(e.depth, dMax);
      const last = out.pts[out.pts.length - 1];
      if (last) {
        const ds = e.p.distanceTo(last);
        if (ds < 0.0015) continue;
        const w = G * ds * 0.5 * (d + dPrev);
        if (out.work + w > budget) break;
        out.work += w;
        out.length += ds;
      }
      out.pts.push(e.p);
      out.nrm.push(fieldGradient(f, e.p, g).clone());
      out.depths.push(d);
      dPrev = d;
      if (out.length >= 0.18) break;
    }
    return out;
  }
}

/**
 * Where a blade (guard a -> point b) goes into the skin (field f), and how deep its deepest point
 * is under it; null when the blade is out of the part.
 */
function bladeEntry(f, a, b) {
  const N = 14;
  const p = new Vec3(), q = new Vec3();
  let entry = null, depth = 0;
  const fa = f(a);
  if (fa < 0) {
    entry = a.clone();
    depth = -fa;
  }
  for (let j = 1; j <= N; j++) {
    p.lerpVectors(a, b, j / N);
    const fp = f(p);
    if (fp >= 0) continue;
    depth = Math.max(depth, -fp);
    if (!entry) {
      let lo = (j - 1) / N, hi = j / N;
      for (let it = 0; it < 6; it++) {
        const m = 0.5 * (lo + hi);
        q.lerpVectors(a, b, m);
        if (f(q) < 0) hi = m;
        else lo = m;
      }
      entry = new Vec3().lerpVectors(a, b, hi);
    }
  }
  return entry ? { p: entry, depth } : null;
}

// ------------------------------------------------------------------------------------------------

/**
 * Striking geometry for a straight strike whose striking point travels from `from` to `to`
 * (the sandbox tool). Returns { prev, cur } poses.
 *  bat: barrel across the motion (opts.axis, default horizontal), sweet spot on the line;
 *  fists: the knuckles; boot: sole along opts.axis (default horizontal, across the motion);
 *  knife stab: blade along the motion, point leading; knife slash: the edge drawn along the line
 *  with the blade pointing into the body (opts.into, default straight down the view: opts.view) and
 *  its point `opts.reach` (default 0.04 m) beyond the line.
 */
export function strikePoses(weapon, mode, from, to, opts = {}) {
  const def = MELEE_WEAPONS[weapon];
  const d = new Vec3().subVectors(to, from).normalize();
  const across = () => {
    let a = opts.axis ? opts.axis.clone() : new Vec3().crossVectors(Math.abs(d.y) < 0.9 ? new Vec3(0, 1, 0) : new Vec3(1, 0, 0), d);
    a.addScaled(d, -a.dot(d));
    if (a.lengthSq() < 1e-8) d.anyPerpendicular(a);
    return a.normalize();
  };
  const pose = (S) => {
    if (def.shape === 'sphere') return { a: S.clone(), b: S.clone() };
    if (weapon === 'bat') {
      const ax = across();
      return { a: S.clone().addScaled(ax, -(def.barrel - def.sweet)), b: S.clone().addScaled(ax, def.sweet) };
    }
    if (weapon === 'boot') {
      let ax = opts.axis ? opts.axis.clone() : Math.abs(d.y) > 0.7 ? new Vec3(0, 0, 1) : across();
      ax.addScaled(d, -ax.dot(d));
      if (ax.lengthSq() < 1e-8) d.anyPerpendicular(ax);
      ax.normalize();
      return { a: S.clone().addScaled(ax, -0.3 * def.sole), b: S.clone().addScaled(ax, 0.7 * def.sole) };
    }
    // knife
    if (mode === 'slash') {
      const into = (opts.into || opts.view || new Vec3(0, 0, -1)).clone();
      into.addScaled(d, -into.dot(d));
      if (into.lengthSq() < 1e-8) d.anyPerpendicular(into);
      into.normalize();
      const tip = S.clone().addScaled(into, opts.reach ?? 0.04);
      return { a: tip.clone().addScaled(into, -def.blade), b: tip };
    }
    return { a: S.clone().addScaled(d, -def.blade), b: S.clone() };
  };
  return { prev: pose(from), cur: pose(to) };
}

/**
 * One straight strike (the sandbox tool: strike at a clicked point from the camera): the weapon's
 * striking point travels from `from` to `to` (world) at the weapon's speed for opts.charge (or
 * opts.speed m/s). Knife: opts.mode 'stab' (default) or 'slash' (see strikePoses). Other opts as for
 * MeleeStriker and strikePoses. Returns { hits, speedLeft, stopped }.
 */
export function meleeStrike(sb, weapon, from, to, opts = {}) {
  const def = MELEE_WEAPONS[weapon];
  if (!def) throw new Error(`unknown melee weapon ${weapon}`);
  const charge = clamp(opts.charge ?? 1, 0, 1);
  const mode = def.kind === 'sharp' ? opts.mode || 'stab' : null;
  const prm = meleeParams(weapon, charge);
  const speed = opts.speed ?? (mode === 'stab' ? prm.stabSpeed : prm.speed);
  const dist = from.distanceTo(to);
  if (dist < 1e-4) return { hits: [], speedLeft: 1, stopped: false };
  const { prev, cur } = strikePoses(weapon, mode, from, to, opts);
  const striker = new MeleeStriker(sb, weapon, { ...opts, charge, mode });
  striker.sweep(prev, cur, dist / speed);
  return striker.end();
}
