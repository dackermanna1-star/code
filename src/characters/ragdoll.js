// Articulated ragdoll: 11 rigid parts joined by limited revolute joints with motor
// "muscles". Handles posing (FK/IK), impact damage, dismemberment, impalement,
// gibbing, bleeding and death.

import { Vec2, Box, Circle, RevoluteJoint, WeldJoint } from 'planck';
import { CAT, MASK } from '../config.js';
import { ik2, nearAngle, clamp, rand, pick, DEG } from '../core/math.js';
import { capsulePath, roundRectPath, fillStroke, circle, OUTLINE, LW, shade } from '../render/draw.js';

// Joint limits are relative angles (child dir - parent dir) for a rider facing +x.
// hurt / sever / kill / gib are impact thresholds in m/s of velocity change.
const BASE = {
  hips: { kind: 'hips', len: 0.26, wid: 0.3, mass: 14, hurt: 10, gib: 46 },
  chest: { kind: 'chest', parent: 'hips', at: 1, len: 0.46, wid: 0.32, mass: 22, lo: -1.15, hi: 0.5, str: 700, brk: 42000, hurt: 10, kill: 34, gib: 44 },
  head: { kind: 'head', parent: 'chest', at: 1, len: 0.28, r: 0.135, mass: 5, lo: -0.75, hi: 0.75, str: 150, brk: 15000, hurt: 7.5, kill: 26, gib: 34 },
  arm: { kind: 'arm', parent: 'chest', at: 0.86, len: 0.31, wid: 0.1, mass: 2.6, lo: -4.3, hi: 0.6, str: 70, brk: 11000, hurt: 10, sever: 26, gib: 40 },
  fore: { kind: 'fore', parent: 'arm', at: 1, len: 0.31, wid: 0.09, mass: 1.9, lo: -0.05, hi: 2.7, str: 45, brk: 10000, hurt: 10, sever: 27, gib: 42 },
  thigh: { kind: 'thigh', parent: 'hips', at: 0, len: 0.42, wid: 0.15, mass: 8, lo: -3.7, hi: -0.35, str: 380, brk: 20000, hurt: 10, sever: 27, gib: 42 },
  shin: { kind: 'shin', parent: 'thigh', at: 1, len: 0.44, wid: 0.12, mass: 5, lo: -2.75, hi: 0.02, str: 260, brk: 17000, hurt: 10, sever: 28, gib: 44 },
};

export const PART_ORDER = ['hips', 'chest', 'head', 'armF', 'foreF', 'armN', 'foreN', 'thighF', 'shinF', 'thighN', 'shinN'];

function defFor(name) {
  if (BASE[name]) return { ...BASE[name], name };
  const side = name.slice(-1);
  const kind = name.slice(0, -1);
  const d = { ...BASE[kind], name, side };
  d.parent = d.parent === 'chest' || d.parent === 'hips' ? d.parent : d.parent + side;
  return d;
}

const DEFS = Object.fromEntries(PART_ORDER.map((n) => [n, defFor(n)]));
const HP_LOSS = { head: 999, chest: 999, hips: 999, arm: 16, fore: 10, thigh: 22, shin: 14 };

export const DEATH_TEXT = {
  decapitated: ['Lost your head!', 'Heads will roll. Yours did.', 'Head-first, then head-off.'],
  headsplode: ['Mist-ified.', 'Closed casket it is.', 'Brain? What brain?'],
  neck: ['Neck: 0. Gravity: 1.', 'Your chiropractor is thrilled.', 'Snap, crackle, flop.'],
  halved: ['Half the person you used to be.', 'Some assembly required.', 'Clean cut. Messy everything else.'],
  crushed: ['Pancaked.', 'Flat-packed for shipping.', 'Squish.'],
  gibbed: ['Spontaneous disassembly!', 'Distributed across the landscape.', 'Organ donor of the year.'],
  impaled: ['Shish-kebab’d!', 'Pinned like a butterfly.', 'Point taken.'],
  bled: ['Bled out. Should have stayed home.', 'Ran out of the red stuff.', 'Iron levels: zero.'],
  fell: ['Gravity always wins.', 'Down, down, down…', 'The floor was further than expected.'],
  explosion: ['Ka-BLOOEY.', 'You are now confetti.', 'Bits and pieces.'],
  harpoon: ['Harpooned like a sad whale.', 'Caught and released. Mostly caught.'],
  internal: ['Internal bleeding. Lots of it.', 'Everything inside is now outside-shaped.'],
  default: ['That’s going to leave a mark.', 'Physics: 1, You: 0.', 'Have you tried not dying?'],
};

export class Ragdoll {
  /**
   * @param game
   * @param character  owning Character (may be null for props)
   * @param setup      { seat, hipsDir, chestDir, headDir, hands:{N,F}, feet:{N,F}, armDirs, legDirs }
   * @param look       appearance object
   */
  constructor(game, character, setup, look, opts = {}) {
    this.game = game;
    this.phys = game.phys;
    this.character = character;
    this.look = look;
    this.group = opts.group ?? this.phys.nextGroup();
    this.toughness = opts.toughness ?? 1;
    this.headArmor = opts.headArmor ?? 1;
    this.voice = opts.voice || { pitch: 1, vowel: 'a', id: 'x' };
    this.alive = true;
    this.hp = 100;
    this.deathCause = null;
    this.time = 0;
    this.braceTimer = 0;
    this.hurtTimer = 0;
    this.screamTimer = 0;
    this.impales = [];
    this.parts = {};
    this.stats = { limbsLost: 0, impales: 0, maxImpact: 0, log: [] };
    this.build(setup);
  }

  // ---------------------------------------------------------------- build

  build(s) {
    const D = DEFS;
    const dirs = {};
    const base = {};
    const pos = (p, dir, len) => ({ x: p.x + Math.cos(dir) * len, y: p.y + Math.sin(dir) * len });

    dirs.hips = s.hipsDir;
    base.hips = { x: s.seat.x, y: s.seat.y };
    const hipsTip = pos(base.hips, dirs.hips, D.hips.len);
    dirs.chest = s.chestDir;
    base.chest = hipsTip;
    const chestTip = pos(base.chest, dirs.chest, D.chest.len);
    dirs.head = s.headDir ?? s.chestDir;
    base.head = chestTip;
    const shoulder = pos(base.chest, dirs.chest, D.chest.len * BASE.arm.at);

    for (const side of ['F', 'N']) {
      const hand = s.hands && s.hands[side];
      let a1, a2;
      if (hand) {
        const r = ik2(shoulder.x, shoulder.y, hand.x, hand.y, BASE.arm.len, BASE.fore.len, -1);
        a1 = r.a1;
        a2 = r.a2;
      } else {
        const ad = (s.armDirs && s.armDirs[side]) || [-100 * DEG, -60 * DEG];
        a1 = ad[0];
        a2 = ad[1];
      }
      dirs['arm' + side] = a1;
      base['arm' + side] = shoulder;
      dirs['fore' + side] = a2;
      base['fore' + side] = pos(shoulder, a1, BASE.arm.len);

      const foot = s.feet && s.feet[side];
      if (foot) {
        const r = ik2(base.hips.x, base.hips.y, foot.x, foot.y, BASE.thigh.len, BASE.shin.len, 1);
        a1 = r.a1;
        a2 = r.a2;
      } else {
        const ld = (s.legDirs && s.legDirs[side]) || [-80 * DEG, -100 * DEG];
        a1 = ld[0];
        a2 = ld[1];
      }
      dirs['thigh' + side] = a1;
      base['thigh' + side] = base.hips;
      dirs['shin' + side] = a2;
      base['shin' + side] = pos(base.hips, a1, BASE.thigh.len);
    }

    // Convert to joint-consistent absolute angles (parent angle + normalised relative angle).
    const angle = {};
    for (const name of PART_ORDER) {
      const d = D[name];
      if (!d.parent) {
        angle[name] = dirs[name];
        continue;
      }
      const pa = angle[d.parent];
      const mid = (d.lo + d.hi) / 2;
      let rel = nearAngle(dirs[name] - pa, mid);
      rel = clamp(rel, d.lo, d.hi);
      angle[name] = pa + rel;
    }

    const filter = { filterCategoryBits: CAT.RIDER, filterMaskBits: MASK.RIDER, filterGroupIndex: this.group };
    for (const name of PART_ORDER) {
      const d = D[name];
      const a = angle[name];
      const b0 = base[name];
      const centerOff = d.kind === 'head' ? 0.14 : d.len / 2;
      const c = pos(b0, a, centerOff);
      const body = this.phys.body(
        { type: 'dynamic', position: new Vec2(c.x, c.y), angle: a, angularDamping: 0.6, linearDamping: 0.02 },
        null
      );
      let shape;
      let area;
      if (d.r) {
        shape = new Circle(d.r);
        area = Math.PI * d.r * d.r;
      } else {
        shape = new Box(d.len / 2, d.wid / 2);
        area = d.len * d.wid;
      }
      body.createFixture(shape, { density: d.mass / area, friction: 0.75, restitution: 0.05, ...filter });
      const part = {
        name,
        def: d,
        kind: d.kind,
        side: d.side || null,
        body,
        parent: d.parent ? this.parts[d.parent] : null,
        children: [],
        joint: null,
        attached: true,
        gone: false,
        stumps: [],
        impAcc: 0,
        impMax: 0,
        impPoint: null,
        impOther: null,
        impaled: 0,
        cooldown: 0,
        mass: body.getMass(),
      };
      if (part.parent) part.parent.children.push(part);
      body.setUserData(this.makeUserData(part));
      this.parts[name] = part;

      if (part.parent) {
        const j = this.phys.createJoint(
          new RevoluteJoint(
            {
              enableLimit: true,
              lowerAngle: d.lo,
              upperAngle: d.hi,
              enableMotor: true,
              maxMotorTorque: d.str,
              motorSpeed: 0,
              referenceAngle: 0,
              collideConnected: false,
            },
            part.parent.body,
            body,
            new Vec2(b0.x, b0.y)
          )
        );
        part.joint = j;
      }
    }
  }

  makeUserData(part) {
    const self = this;
    return {
      kind: 'part',
      part,
      ragdoll: this,
      character: this.character,
      onPostSolve(selfF, otherF, contact, impulse) {
        const n = contact.getManifold().pointCount;
        let s = 0;
        for (let i = 0; i < n; i++) s += impulse.normalImpulses[i];
        if (s <= 0) return;
        const ou = otherF.getBody().getUserData();
        // Debris bumps should not be lethal
        if (ou && ou.kind === 'debris') s *= 0.3;
        part.impAcc += s;
        if (s > part.impMax) {
          part.impMax = s;
          part.impOther = otherF.getBody();
          if (s > part.mass * 5) {
            const ci = self.phys.contactInfo(contact);
            if (ci) part.impPoint = ci;
          }
        }
      },
    };
  }

  // ---------------------------------------------------------------- queries

  get partsList() {
    return PART_ORDER.map((n) => this.parts[n]);
  }

  bodies() {
    const out = [];
    for (const n of PART_ORDER) {
      const p = this.parts[n];
      if (!p.gone) out.push(p.body);
    }
    return out;
  }

  /** The best body for the camera to follow. */
  focusBody() {
    for (const n of ['chest', 'hips', 'head', 'thighN', 'thighF', 'armN']) {
      const p = this.parts[n];
      if (!p.gone) return p.body;
    }
    return null;
  }

  /** Is part connected (through intact joints) to the chest? */
  connectedToCore(part) {
    let p = part;
    while (p) {
      if (p.gone) return false;
      if (p.name === 'chest' || p.name === 'hips') {
        if (p.name === 'hips') return !this.parts.chest.gone && this.parts.chest.attached;
        return true;
      }
      if (!p.attached) return false;
      p = p.parent;
    }
    return false;
  }

  worldPoint(part, lx, ly) {
    return part.body.getWorldPoint(new Vec2(lx, ly));
  }

  shoulderWorld() {
    const c = this.parts.chest;
    return c.body.getWorldPoint(new Vec2((BASE.arm.at - 0.5) * DEFS.chest.len, 0));
  }

  hipWorld() {
    return this.parts.hips.body.getWorldPoint(new Vec2(-DEFS.hips.len / 2, 0));
  }

  handWorld(side) {
    const f = this.parts['fore' + side];
    return f.body.getWorldPoint(new Vec2(BASE.fore.len / 2, 0));
  }

  footWorld(side) {
    const s = this.parts['shin' + side];
    return s.body.getWorldPoint(new Vec2(BASE.shin.len / 2, 0));
  }

  // ---------------------------------------------------------------- control

  setMotor(part, target, str) {
    const j = part.joint;
    if (!j || j._gone) return;
    const d = part.def;
    const t = clamp(target, d.lo, d.hi);
    const ang = j.getJointAngle();
    j.setMotorSpeed(clamp((t - ang) * 13, -22, 22));
    j.setMaxMotorTorque(str);
  }

  relFor(part, worldDir, parentAngle) {
    const d = part.def;
    return nearAngle(worldDir - parentAngle, (d.lo + d.hi) / 2);
  }

  /**
   * Called every physics step before world.step().
   * ctrl = { mode: 'ride'|'free'|'limp', lean, waist, hands:{N,F}, feet:{N,F}, armRel:{N,F}, legRel:{N,F} }
   */
  preStep(dt, ctrl) {
    this.time += dt;
    if (this.braceTimer > 0) this.braceTimer -= dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    if (this.screamTimer > 0) this.screamTimer -= dt;
    const P = this.parts;
    const mode = this.alive ? ctrl.mode : 'limp';
    const brace = this.braceTimer > 0 ? 2.2 : 1;
    const hpScale = this.alive ? clamp(0.45 + this.hp / 160, 0.45, 1) : 0;

    if (mode === 'limp') {
      for (const n of PART_ORDER) {
        const p = P[n];
        if (p.joint && !p.joint._gone) {
          p.joint.setMotorSpeed(0);
          p.joint.setMaxMotorTorque(p.kind === 'chest' ? 6 : 1.6);
        }
      }
      return;
    }

    const t = this.time;
    const lean = ctrl.lean || 0;
    const k = hpScale * brace;

    if (mode === 'ride') {
      const waist = (ctrl.waist ?? -0.25) - lean * 0.5;
      this.setMotor(P.chest, waist, P.chest.def.str * k);
      this.setMotor(P.head, (ctrl.neck ?? 0.15) + lean * 0.3, P.head.def.str * k);
      const chestA = P.chest.body.getAngle();
      const sh = this.shoulderWorld();
      for (const side of ['F', 'N']) {
        const arm = P['arm' + side];
        const fore = P['fore' + side];
        const hand = ctrl.hands && ctrl.hands[side];
        if (hand && arm.attached && !arm.gone) {
          const r = ik2(sh.x, sh.y, hand.x, hand.y, BASE.arm.len, BASE.fore.len, -1);
          this.setMotor(arm, this.relFor(arm, r.a1, chestA), arm.def.str * 0.6 * k);
          this.setMotor(fore, this.relFor(fore, r.a2, r.a1), fore.def.str * 0.6 * k);
        } else {
          const ar = (ctrl.armRel && ctrl.armRel[side]) || [-2.6 + Math.sin(t * 3 + (side === 'N' ? 0 : 2)) * 0.3, 0.8];
          this.setMotor(arm, ar[0], arm.def.str * k);
          this.setMotor(fore, ar[1], fore.def.str * k);
        }
        const thigh = P['thigh' + side];
        const shin = P['shin' + side];
        const foot = ctrl.feet && ctrl.feet[side];
        if (foot && thigh.attached && !thigh.gone) {
          const hp = this.hipWorld();
          const r = ik2(hp.x, hp.y, foot.x, foot.y, BASE.thigh.len, BASE.shin.len, 1);
          const hipsA = P.hips.body.getAngle();
          this.setMotor(thigh, this.relFor(thigh, r.a1, hipsA), thigh.def.str * 0.9 * k);
          this.setMotor(shin, this.relFor(shin, r.a2, r.a1), shin.def.str * 0.9 * k);
        } else {
          const lr = (ctrl.legRel && ctrl.legRel[side]) || [-1.6, -1.4];
          this.setMotor(thigh, lr[0], thigh.def.str * 0.7 * k);
          this.setMotor(shin, lr[1], shin.def.str * 0.7 * k);
        }
      }
      return;
    }

    // 'free': alive but dismounted -> flail comically, lean keys wiggle the torso.
    const f = 0.55 * k;
    this.setMotor(P.chest, -0.2 + Math.sin(t * 5) * 0.25, P.chest.def.str * 0.5 * k);
    this.setMotor(P.head, Math.sin(t * 7) * 0.3, P.head.def.str * 0.6 * k);
    for (const side of ['F', 'N']) {
      const ph = side === 'N' ? 0 : Math.PI;
      this.setMotor(P['arm' + side], -1.4 + Math.sin(t * 11 + ph) * 1.4, P['arm' + side].def.str * f);
      this.setMotor(P['fore' + side], 1.2 + Math.sin(t * 9 + ph) * 0.9, P['fore' + side].def.str * f);
      this.setMotor(P['thigh' + side], -1.9 + Math.sin(t * 8 + ph) * 0.6, P['thigh' + side].def.str * f);
      this.setMotor(P['shin' + side], -1.0 + Math.sin(t * 8 + ph + 1) * 0.7, P['shin' + side].def.str * f);
    }
    if (lean && !P.chest.gone) P.chest.body.applyTorque(-lean * 90, true);
  }

  // ---------------------------------------------------------------- damage

  thresholdScale(part) {
    let k = this.toughness * (this.braceTimer > 0 ? 1.7 : 1);
    if (part.kind === 'head') k *= this.headArmor;
    return k;
  }

  postStep(dt) {
    const invDt = this.phys.invDt;
    const P = this.parts;
    for (const n of PART_ORDER) {
      const p = P[n];
      if (p.gone) continue;
      if (p.cooldown > 0) p.cooldown -= dt;

      // joint over-stretch -> tear off
      if (p.attached && p.joint && !p.joint._gone) {
        const f = p.joint.getReactionForce(invDt);
        // low-pass filter: single-step solver spikes should not rip limbs off
        p.fAvg = (p.fAvg || 0) * 0.6 + Math.hypot(f.x, f.y) * 0.4;
        const fm = p.fAvg;
        if (fm > p.def.brk * this.thresholdScale(p)) {
          this.note(p.name, 'tear', fm);
          this.sever(p, 'torn');
        }
      }

      if (p.impAcc > 0) {
        const dv = p.impAcc / p.mass;
        if (dv > this.stats.maxImpact) this.stats.maxImpact = dv;
        this.applyImpact(p, dv);
        p.impAcc = 0;
        p.impMax = 0;
        p.impPoint = null;
        p.impOther = null;
      }

      // bleeding stumps
      for (const st of p.stumps) {
        st.t += dt;
        const rate = st.t < 1.0 ? 85 : st.t < 12 ? 85 * Math.exp(-(st.t - 1) / 2.5) + 4 : 2;
        st.acc += rate * dt;
        if (st.acc >= 1) {
          const wp = p.body.getWorldPoint(new Vec2(st.lx, st.ly));
          const wd = p.body.getWorldVector(new Vec2(st.dx, st.dy));
          const v = p.body.getLinearVelocityFromWorldPoint(wp);
          const cnt = Math.floor(st.acc);
          st.acc -= cnt;
          const spd = st.t < 1 ? 4.5 : 2.2;
          this.game.particles.blood(wp.x, wp.y, v.x, v.y, cnt, spd, 0.7, Math.atan2(wd.y, wd.x));
        }
        if (st.main && this.alive && st.t < 18) this.damage(dt * 1.1, 'bled');
      }
    }

    // impalement joints can rip free
    for (let i = this.impales.length - 1; i >= 0; i--) {
      const im = this.impales[i];
      if (im.joint._gone || im.part.gone) {
        this.impales.splice(i, 1);
        continue;
      }
      const f = im.joint.getReactionForce(invDt);
      if (Math.hypot(f.x, f.y) > im.brk) {
        const a = im.joint.getAnchorA();
        this.phys.destroyJoint(im.joint);
        this.impales.splice(i, 1);
        this.game.particles.gore(a.x, a.y, 0, 0, 0.5);
        this.game.audio.splat(0.7, a.x, a.y);
        im.part.impaled = Math.max(0, im.part.impaled - 1);
      }
    }

    // fell out of the world
    const fb = this.focusBody();
    if (this.alive && fb && fb.getPosition().y < this.game.killY) this.kill('fell');
  }

  note(part, why, val) {
    const l = this.stats.log;
    l.push(`${this.time.toFixed(2)} ${part} ${why} ${Math.round(val)}`);
    if (l.length > 24) l.shift();
  }

  applyImpact(p, dv) {
    const d = p.def;
    if (dv > d.hurt * 0.8) this.note(p.name, 'imp', dv);
    const k = this.thresholdScale(p);
    const pt = p.impPoint || p.body.getPosition();
    const v = p.body.getLinearVelocity();
    const other = p.impOther;
    const ou = other && other.getUserData();
    const crusher = ou && ou.crusher;

    if (dv > d.gib * k || (crusher && dv > d.gib * k * 0.5)) {
      this.gib(p, p.kind === 'head' ? 'headsplode' : crusher ? 'crushed' : 'gibbed');
      return;
    }
    if (d.sever && dv > d.sever * k && p.attached) {
      this.sever(p, 'impact');
      return;
    }
    if (d.kill && dv > d.kill * k && this.alive) {
      if (p.kind === 'head') {
        this.game.audio.crack(pt.x, pt.y);
        this.game.particles.blood(pt.x, pt.y, v.x, v.y, 14, 2.5);
        this.kill('neck');
      } else {
        this.game.audio.crack(pt.x, pt.y);
        this.game.particles.blood(pt.x, pt.y, v.x, v.y, 20, 3);
        this.kill('internal');
      }
    }
    // sustained pressure (pinned against a wall) only hurts as much as its peak
    if (this.time > (p.hurtUntil || 0)) p.hurtPeak = 0;
    if (dv > d.hurt * k && dv > (p.hurtPeak || 0)) {
      const sev = dv / (d.hurt * k);
      const base = Math.max(d.hurt * k, p.hurtPeak || 0);
      p.hurtPeak = dv;
      p.hurtUntil = this.time + 0.25;
      const dmg = (dv - base) * (p.kind === 'head' ? 2.6 : p.kind === 'chest' || p.kind === 'hips' ? 2.2 : 1.3);
      this.damage(dmg, 'internal');
      this.hurtTimer = 0.6;
      const audio = this.game.audio;
      audio.impact(clamp(sev / 3, 0, 1), 'flesh', pt.x, pt.y);
      if (sev > 1.5) {
        this.game.particles.blood(pt.x, pt.y, v.x * 0.3, v.y * 0.3, Math.round(4 + sev * 4), 2 + sev);
        if (Math.random() < 0.5) {
          const lp = p.body.getLocalPoint(new Vec2(pt.x, pt.y));
          this.game.particles.stain(p.body, lp.x, lp.y, rand(0.03, 0.06));
        }
      }
      if (sev > 2) audio.crack(pt.x, pt.y);
      if (this.alive) {
        if (sev > 1.6) this.scream(sev / 4);
        else audio.grunt(this.voice, pt.x, pt.y);
      }
    }
  }

  damage(amount, cause) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.kill(cause);
    }
  }

  scream(intensity = 1) {
    if (!this.alive) return;
    const c = this.parts.head;
    if (c.gone || !c.attached) return;
    const p = c.body.getPosition();
    this.screamTimer = 0.9;
    this.game.audio.scream(this.voice, clamp(intensity, 0.3, 1), p.x, p.y);
  }

  kill(cause = 'default') {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.deathCause = cause;
    if (this.character) this.character.onRiderDeath(cause);
  }

  addStump(part, worldX, worldY, main) {
    const lp = part.body.getLocalPoint(new Vec2(worldX, worldY));
    const c = part.body.getLocalCenter();
    let dx = lp.x - c.x;
    let dy = lp.y - c.y;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    part.stumps.push({ lx: lp.x, ly: lp.y, dx, dy, t: 0, acc: 0, main });
  }

  /** Detach `part` (and its subtree) from its parent. */
  sever(part, cause = 'cut') {
    if (!part.attached || !part.joint || part.gone) return false;
    const j = part.joint;
    if (j._gone) {
      part.attached = false;
      return false;
    }
    const a = j.getAnchorA();
    const ax = a.x;
    const ay = a.y;
    this.phys.destroyJoint(j);
    part.joint = null;
    part.attached = false;
    const parent = part.parent;
    const parentMain = parent && this.connectedToCore(parent);
    if (parent && !parent.gone) this.addStump(parent, ax, ay, parentMain);
    this.addStump(part, ax, ay, false);
    const v = part.body.getLinearVelocity();
    this.game.particles.gore(ax, ay, v.x, v.y, 0.7);
    this.game.audio.gore(ax, ay);
    this.stats.limbsLost++;
    if (this.character) this.character.onPartSevered(part);
    if (part.kind === 'head') {
      this.kill('decapitated');
      this.game.camera.shake(0.25);
    } else if (part.kind === 'chest') {
      this.kill('halved');
      this.game.camera.shake(0.25);
    } else if (this.alive) {
      this.damage(HP_LOSS[part.kind] || 10, 'bled');
      this.scream(1);
    }
    this.game.onGore(part.kind === 'head' ? 'decap' : 'sever');
    return true;
  }

  /** Obliterate a part into meaty chunks. */
  gib(part, cause = 'gibbed') {
    if (part.gone) return;
    const body = part.body;
    const pos = body.getPosition();
    const v = body.getLinearVelocity();
    for (const ch of part.children) if (ch.attached && !ch.gone) this.sever(ch, 'gib');
    if (part.attached && part.joint && !part.joint._gone) {
      const a = part.joint.getAnchorA();
      this.phys.destroyJoint(part.joint);
      if (part.parent && !part.parent.gone) this.addStump(part.parent, a.x, a.y, this.connectedToCore(part.parent));
    }
    part.joint = null;
    part.attached = false;
    part.gone = true;
    this.game.spawnGibs(pos.x, pos.y, v.x, v.y, part, this.look);
    this.phys.destroyBody(body);
    this.game.particles.gore(pos.x, pos.y, v.x, v.y, part.kind === 'head' || part.kind === 'chest' ? 1.6 : 1);
    this.game.audio.gore(pos.x, pos.y);
    this.game.camera.shake(0.3);
    this.stats.limbsLost++;
    if (this.character) this.character.onPartSevered(part);
    if (part.kind === 'head' || part.kind === 'chest' || part.kind === 'hips') this.kill(cause);
    else if (this.alive) {
      this.damage((HP_LOSS[part.kind] || 10) * 1.3, 'bled');
      this.scream(1);
    }
    this.game.onGore('gib');
  }

  /** Pin a part to a body (spikes, harpoons). */
  impale(part, body, x, y, opts = {}) {
    if (part.gone || part.impaled >= (opts.max || 2)) return null;
    const anchor = new Vec2(x, y);
    const joint = opts.weld
      ? new WeldJoint({ frequencyHz: 0, dampingRatio: 0 }, body, part.body, anchor)
      : new RevoluteJoint({ collideConnected: false }, body, part.body, anchor);
    const j = this.phys.createJoint(joint);
    part.impaled++;
    this.stats.impales++;
    this.impales.push({ joint: j, part, brk: opts.brk || 9000 });
    const v = part.body.getLinearVelocity();
    this.game.particles.gore(x, y, v.x * 0.2, v.y * 0.2, 0.6);
    const lp = part.body.getLocalPoint(anchor);
    this.game.particles.stain(part.body, lp.x, lp.y, 0.07);
    this.game.audio.impale(x, y);
    this.addStump(part, x, y, true);
    const dmg = opts.damage ?? (part.kind === 'head' ? 999 : part.kind === 'chest' ? 45 : part.kind === 'hips' ? 30 : 15);
    if (this.alive) {
      this.scream(1);
      this.damage(dmg, opts.cause || 'impaled');
    }
    this.game.onGore('impale');
    return j;
  }

  brace(seconds) {
    this.braceTimer = seconds;
  }

  destroy() {
    for (const n of PART_ORDER) {
      const p = this.parts[n];
      if (!p.gone) this.phys.destroyBody(p.body);
      p.gone = true;
    }
  }

  // ---------------------------------------------------------------- drawing

  expression() {
    if (!this.alive) return 'dead';
    if (this.screamTimer > 0) return 'scream';
    if (this.hurtTimer > 0 || this.hp < 35) return 'pain';
    if (this.braceTimer > 0) return 'grit';
    return 'normal';
  }

  drawBack(ctx) {
    for (const n of ['armF', 'foreF', 'thighF', 'shinF']) this.drawPart(ctx, this.parts[n], true);
  }

  drawFront(ctx) {
    for (const n of ['hips', 'chest', 'head', 'thighN', 'shinN', 'armN', 'foreN']) this.drawPart(ctx, this.parts[n], false);
  }

  drawPart(ctx, part, far) {
    if (part.gone) return;
    const b = part.body;
    const p = b.getPosition();
    const L = this.look;
    const d = part.def;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(b.getAngle());
    const dark = far ? -0.22 : 0;
    const col = (c) => (dark ? shade(c, dark) : c);
    const len = d.len;
    const hw = (d.wid || 0.1) / 2;
    const parts = this.game.particles;
    switch (part.kind) {
      case 'thigh': {
        capsulePath(ctx, -len / 2, len / 2, hw);
        fillStroke(ctx, col(L.pants));
        this.clipDecals(ctx, b, () => capsulePath(ctx, -len / 2, len / 2, hw));
        break;
      }
      case 'shin': {
        capsulePath(ctx, -len / 2, len / 2 - 0.04, hw * 0.92);
        fillStroke(ctx, col(L.pants));
        if (L.socks) {
          ctx.fillStyle = col(L.socks);
          ctx.fillRect(len / 2 - 0.14, -hw * 0.9, 0.1, hw * 1.8);
        }
        // shoe: toe points along local +y (forward when standing)
        roundRectPath(ctx, len / 2 - 0.07, -0.07, 0.11, 0.24 * (L.shoeLen || 1), 0.045);
        fillStroke(ctx, col(L.shoes));
        this.clipDecals(ctx, b, () => capsulePath(ctx, -len / 2, len / 2 - 0.04, hw * 0.92));
        break;
      }
      case 'arm': {
        capsulePath(ctx, -len / 2, len / 2, hw);
        fillStroke(ctx, col(L.sleeve || L.shirt));
        if (L.armStripe) {
          ctx.fillStyle = col(L.armStripe);
          ctx.fillRect(-len / 2 + 0.06, -hw * 0.35, len - 0.1, hw * 0.7);
        }
        this.clipDecals(ctx, b, () => capsulePath(ctx, -len / 2, len / 2, hw));
        break;
      }
      case 'fore': {
        const sleeveEnd = L.shortSleeve ? -len / 2 + 0.05 : len / 2 - 0.08;
        capsulePath(ctx, -len / 2, len / 2 - 0.04, hw * 0.85);
        fillStroke(ctx, col(L.skin));
        if (sleeveEnd > -len / 2 + 0.02) {
          capsulePath(ctx, -len / 2, sleeveEnd, hw);
          fillStroke(ctx, col(L.sleeve || L.shirt));
        }
        if (L.gloves) {
          circle(ctx, len / 2 - 0.03, 0, 0.06, col(L.gloves));
        } else {
          circle(ctx, len / 2 - 0.03, 0, 0.055, col(L.skin));
        }
        this.clipDecals(ctx, b, () => capsulePath(ctx, -len / 2, len / 2, hw));
        break;
      }
      case 'hips': {
        ctx.rotate(-Math.PI / 2);
        roundRectPath(ctx, -d.wid / 2, -len / 2, d.wid, len, 0.08);
        fillStroke(ctx, col(L.pants));
        if (L.belt) {
          ctx.fillStyle = L.belt;
          ctx.fillRect(-d.wid / 2, len / 2 - 0.07, d.wid, 0.05);
        }
        if (L.drawHips) L.drawHips(ctx, d.wid, len);
        ctx.rotate(Math.PI / 2);
        this.clipDecals(ctx, b, () => {
          ctx.beginPath();
          ctx.rect(-len / 2, -d.wid / 2, len, d.wid);
        });
        break;
      }
      case 'chest': {
        ctx.rotate(-Math.PI / 2);
        const w = d.wid;
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 0.02, -len / 2);
        ctx.lineTo(w / 2 - 0.02, -len / 2);
        ctx.quadraticCurveTo(w / 2 + 0.03, len * 0.1, w / 2 - 0.02, len / 2 - 0.02);
        ctx.quadraticCurveTo(0, len / 2 + 0.06, -w / 2 + 0.01, len / 2 - 0.04);
        ctx.quadraticCurveTo(-w / 2 - 0.03, 0, -w / 2 + 0.02, -len / 2);
        ctx.closePath();
        fillStroke(ctx, col(L.shirt));
        if (L.drawChest) {
          ctx.save();
          ctx.clip();
          L.drawChest(ctx, w, len, this);
          ctx.restore();
        }
        ctx.rotate(Math.PI / 2);
        this.clipDecals(ctx, b, () => {
          ctx.beginPath();
          ctx.rect(-len / 2, -w / 2, len, w);
        });
        break;
      }
      case 'head': {
        ctx.rotate(-Math.PI / 2);
        L.drawHead(ctx, d.r, this.expression(), this);
        ctx.rotate(Math.PI / 2);
        this.clipDecals(ctx, b, () => {
          ctx.beginPath();
          ctx.arc(0, 0, d.r, 0, Math.PI * 2);
        });
        break;
      }
      default:
        break;
    }
    // stumps
    for (const s of part.stumps) {
      const r = part.kind === 'head' ? 0.06 : Math.min(0.08, hw * 0.95);
      circle(ctx, s.lx, s.ly, r, '#9c0f1c', '#5a0610', 0.02);
      circle(ctx, s.lx + s.dx * 0.01, s.ly + s.dy * 0.01, r * 0.42, '#efe3c8', null);
    }
    ctx.restore();
  }

  clipDecals(ctx, body, pathFn) {
    const parts = this.game.particles;
    if (!parts.bodyDecals.has(body)) return;
    ctx.save();
    pathFn();
    ctx.clip();
    parts.drawBodyDecals(ctx, body);
    ctx.restore();
  }
}

export { DEFS as PART_DEFS };
