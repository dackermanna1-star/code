import { Vec3, clamp, smoothstep } from '../physics/math.js';
import { buildAnatomy, pathToStructure, boneAxis } from './organs.js';

/**
 * Injury and physiology model for one person.
 *
 * Penetrating trauma: a projectile's wound channel through each segment is tested against the
 * internal anatomy (organs, vessels, spinal cord, bones). Damage depends on the energy deposited
 * along the channel, with a temporary-cavity radius for high-velocity rounds. Every hit structure
 * has a specific consequence: haemorrhage (external or internal), loss of cardiac or lung function,
 * airway compromise, paralysis by spinal level, fractures (long bones physically break).
 *
 * Blunt trauma: impacts measured by the physics (thrown objects, falls, the floor) are converted
 * into peak forces from the contact impulse and a contact time that depends on both materials, then
 * compared against tissue tolerances (bruising, fractures, concussion, organ rupture).
 *
 * Physiology runs continuously: blood volume (5 L), bleeding modulated by blood pressure, clotting
 * and hand pressure on the wound, heart rate, blood pressure, oxygen saturation, brain perfusion,
 * consciousness, pain, adrenaline and death. Its outputs drive the motor controller (muscle
 * strength per limb, balance skill, pain behaviours, consciousness).
 */

export const BLOOD_VOLUME = 5000; // mL

const SEGMENT_LABEL = {
  head: 'head', neck: 'neck', chest: 'chest', abdomen: 'abdomen', pelvis: 'pelvis',
  upperArmL: 'left upper arm', upperArmR: 'right upper arm', forearmL: 'left forearm', forearmR: 'right forearm',
  handL: 'left hand', handR: 'right hand', thighL: 'left thigh', thighR: 'right thigh',
  shinL: 'left lower leg', shinR: 'right lower leg', footL: 'left foot', footR: 'right foot',
};

// Peak-force tolerances (N) for blunt impacts, and soft-tissue contact time (s) per segment.
const BLUNT = {
  head: { tau: 0.0005, bruise: 1200, fracture: 9000, label: 'skull' },
  neck: { tau: 0.003, bruise: 900, fracture: 5000, label: 'cervical vertebrae' },
  chest: { tau: 0.004, bruise: 1500, fracture: 3600, label: 'ribs' },
  abdomen: { tau: 0.008, bruise: 1400, fracture: Infinity, organ: 4200 },
  pelvis: { tau: 0.006, bruise: 1800, fracture: 7500, label: 'pelvis' },
  upperArm: { tau: 0.003, bruise: 1100, fracture: 3600, label: 'humerus' },
  forearm: { tau: 0.0015, bruise: 900, fracture: 2600, label: 'radius/ulna' },
  hand: { tau: 0.0015, bruise: 800, fracture: 2200, label: 'hand bones' },
  thigh: { tau: 0.006, bruise: 1600, fracture: 5200, label: 'femur' },
  shin: { tau: 0.0012, bruise: 1100, fracture: 4200, label: 'tibia' },
  foot: { tau: 0.002, bruise: 1200, fracture: 4500, label: 'foot bones' },
};

// Contact time of the other body's material (s). Small, hard objects give short, violent impacts.
const MATERIAL_TAU = {
  concrete: 0.0012, baseball: 0.0008, brick: 0.0012, bowling: 0.0015, metal: 0.001, glass: 0.0009,
  wood: 0.003, rubber: 0.008, melon: 0.012, leather: 0.006, flesh: 0.01, default: 0.002,
};

// Fraction of a floor impact's impulse that loads the struck part locally (contact area effect).
const GROUND_SPREAD = {
  head: 0.6, neck: 0.5, chest: 0.18, abdomen: 0.22, pelvis: 0.3, upperArm: 0.35, forearm: 0.5, hand: 0.55,
  thigh: 0.3, shin: 0.45, foot: 0.5,
};

const PAIN_BY_SEGMENT = {
  head: 0.9, neck: 0.8, chest: 0.65, abdomen: 0.8, pelvis: 0.7, upperArm: 0.5, forearm: 0.5, hand: 0.7,
  thigh: 0.55, shin: 0.6, foot: 0.7,
};

const _v0 = new Vec3();
const _v1 = new Vec3();
const _v2 = new Vec3();

function segKind(name) {
  return name.replace(/[LR]$/, '');
}

function sideOf(name) {
  const c = name[name.length - 1];
  return c === 'L' || c === 'R' ? c : null;
}

let woundIds = 1;

export class InjurySystem {
  constructor(ragdoll, controller, opts = {}) {
    this.rd = ragdoll;
    this.ctl = controller;
    this.world = ragdoll.world;
    this.rng = opts.rng ?? Math.random;
    this.bleedScale = opts.bleedScale ?? 1;
    this.anatomy = buildAnatomy();
    this.bySeg = {};
    for (const s of this.anatomy) (this.bySeg[s.seg] || (this.bySeg[s.seg] = [])).push(s);
    this.reset();
  }

  reset() {
    this.time = 0;
    this.wounds = [];
    this.events = [];
    this.injuries = []; // human-readable log: {time, text, severity}
    this.blood = BLOOD_VOLUME;
    this.lostExternal = 0;
    this.lostInternal = 0;
    this.bleedRate = 0; // mL/s total
    this.externalRate = 0;
    this.hr = 72;
    this.bpSys = 120;
    this.spo2 = 0.98;
    this.perfusion = 1;
    this.cardiac = 1; // pump function
    this.lungs = { L: 1, R: 1 };
    this.airway = 1;
    this.breathing = 1;
    this.pain = 0;
    this.painAcute = 0;
    this.adrenaline = 0;
    this.alive = true;
    this.conscious = true;
    this.hypoxia = 0; // accumulated cerebral ischaemia (s-equivalent)
    this.brainDamage = 0; // 0..1 (1 = brain death)
    this.koTimer = 0;
    this.concussion = 0;
    this.arrestTime = -1;
    this.spinal = null; // highest spinal lesion level
    this.paralysis = { armsL: 1, armsR: 1, legs: 1, trunk: 1, neck: 1 };
    this.muscle = {}; // segment -> damage 0..1
    this.limbPain = {}; // segment -> pain contribution
    this.fractures = []; // {seg, label, physical}
    this.buckle = { L: 1, R: 1, arms: { L: 1, R: 1 }, trunk: 1 };
    this.deathCause = null;
    this.status = 'healthy';
    this.coughTimer = 0;
    this.lastGrunt = -10;
    this.bruiseCooldown = new Map();
    this.pendingBreaks = [];
  }

  // ------------------------------------------------------------------------------------------
  // helpers

  bodyBindPos(body) {
    if (body.userData && body.userData.fragment) return body.userData.bindPos;
    return body.userData.segment.bindPos;
  }

  /** World point -> anatomical bind coordinates (through the body it lies in). */
  toBind(body, pW, out) {
    body.worldToLocal(pW, out);
    return out.add(this.bodyBindPos(body));
  }

  log(text, severity = 1) {
    this.injuries.push({ time: this.time, text, severity });
  }

  addPain(amount, seg) {
    this.painAcute = Math.min(this.painAcute + amount, 2.5);
    if (seg) this.limbPain[seg] = Math.min((this.limbPain[seg] || 0) + amount, 2);
    this.adrenaline = Math.min(1, this.adrenaline + amount * 0.6);
  }

  addWound(w) {
    w.id = woundIds++;
    w.age = 0;
    w.clot = 0;
    w.pressure = 0;
    w.seed = this.rng();
    w.extRate = w.extRate || 0;
    w.intRate = w.intRate || 0;
    w.arterial = w.arterial || false;
    w.spurtPhase = 0;
    this.wounds.push(w);
    this.events.push({ type: 'wound', wound: w });
    return w;
  }

  // ------------------------------------------------------------------------------------------
  /**
   * Wound channel of a projectile through one body (segment or fragment).
   * entryW: skin entry point (world). exitW: exit point or null if the channel ends inside at
   * stopW. dirW: unit travel direction. proj: { speed, mass, diameter, energy, pen, kind }.
   * Returns { deposited, stopped, energyLeft, penLeft }.
   */
  bulletThrough(body, entryW, exitW, dirW, proj) {
    const seg = body.userData.segment;
    const name = seg.name;
    const kind = segKind(name);
    const pathW = exitW ? entryW.distanceTo(exitW) : 0.15;
    // penetration budget (m of soft tissue); bone costs extra
    const entryB = this.toBind(body, entryW, new Vec3());
    let endW = exitW ? exitW.clone() : entryW.clone().addScaled(dirW, pathW);
    let endB = this.toBind(body, endW, new Vec3());
    const structs = this.bySeg[name] || [];
    // bone in the way?
    let boneCost = 0;
    for (const s of structs) {
      if (s.kind !== 'bone') continue;
      const r = pathToStructure(entryB, endB, s);
      if (r.dist < proj.diameter * 0.5) boneCost += s.long ? 0.1 : 0.06;
    }
    const need = pathW + boneCost;
    let stopped = false;
    let frac = 1;
    if (proj.pen < need) {
      stopped = true;
      frac = clamp((proj.pen - boneCost * 0.5) / pathW, 0.05, 1);
      endW = entryW.clone().addScaled(dirW, pathW * frac);
      endB = this.toBind(body, endW, new Vec3());
    }
    const pen0 = proj.pen0 || proj.pen;
    const penBefore = proj.pen;
    proj.pen = Math.max(0, proj.pen - need);
    const eBefore = proj.energy;
    // energy falls with the remaining penetration (velocity bleeds off roughly linearly)
    const eAfter = stopped ? 0 : proj.energy0 * Math.pow(proj.pen / pen0, 1.6);
    const deposited = Math.max(0, eBefore - eAfter) * (proj.fragmenting ? 1.15 : 1);
    proj.energy = eAfter;
    proj.speed = proj.speed0 * Math.sqrt(Math.max(eAfter, 0) / proj.energy0);
    // temporary cavity: high-velocity rounds stretch tissue well away from the channel
    const highVel = proj.speed0 > 600;
    const cavity = proj.diameter * 0.5 + (highVel ? 0.00003 : 0.000008) * deposited;

    const hit = { deposited, structures: [], fracture: null };
    let extRate = 0.3 + deposited / 260; // mL/s from torn muscle and skin
    let intRate = 0;
    let arterial = false;
    let painAdd = PAIN_BY_SEGMENT[kind] * clamp(0.35 + deposited / 500, 0.35, 1.2);
    const toLog = [];

    for (const s of structs) {
      const r = pathToStructure(entryB, endB, s);
      const direct = r.dist <= proj.diameter * 0.5 + 0.001;
      if (r.dist > cavity) continue;
      const sev = direct ? 1 : clamp(1 - r.dist / Math.max(cavity, 1e-4), 0, 1) * (s.kind === 'lung' || s.kind === 'gut' ? 0.3 : 0.6);
      if (sev < 0.08) continue;
      hit.structures.push({ s, sev, direct });
      switch (s.kind) {
        case 'brain':
          if (sev > 0.25) this.kill('gunshot wound to the brain');
          else {
            this.knockOut(30 + 60 * sev, 0.8);
            this.brainDamage = Math.max(this.brainDamage, sev);
          }
          toLog.push([`${s.label} destroyed`, 3]);
          break;
        case 'brainstem':
          this.kill('brain stem destroyed');
          toLog.push(['brain stem destroyed', 3]);
          break;
        case 'cord':
          if (direct || sev > 0.55) {
            this.spinalInjury(s.level);
            toLog.push([`${s.label} severed`, 3]);
          }
          break;
        case 'heart':
          this.cardiac = Math.min(this.cardiac, direct ? 0.12 : 0.45);
          intRate += s.bleed * sev * (1 - s.external);
          extRate += s.bleed * sev * s.external * 0.4;
          arterial = true;
          toLog.push([direct ? 'heart perforated' : 'heart contused', 3]);
          painAdd += 0.4;
          break;
        case 'lung':
          this.lungs[s.side] = Math.max(0, this.lungs[s.side] - (direct ? 0.65 : 0.3 * sev));
          intRate += s.bleed * sev * (1 - s.external);
          extRate += s.bleed * sev * s.external;
          toLog.push([`${s.label} punctured`, 2]);
          break;
        case 'airway':
          this.airway = Math.min(this.airway, direct ? 0.35 : 0.7);
          toLog.push(['trachea torn', 2]);
          painAdd += 0.3;
          break;
        case 'artery':
        case 'vein': {
          const rate = s.bleed * (direct ? 1 : 0.4 * sev);
          extRate += rate * s.external;
          intRate += rate * (1 - s.external);
          if (s.kind === 'artery' && direct) arterial = true;
          toLog.push([`${s.label} ${direct ? 'severed' : 'lacerated'}`, rate > 15 ? 3 : 2]);
          break;
        }
        case 'organ':
        case 'gut':
          intRate += s.bleed * sev * (1 - s.external);
          extRate += s.bleed * sev * s.external;
          painAdd += s.kind === 'gut' ? 0.45 : 0.3;
          toLog.push([`${s.label} ${direct ? 'perforated' : 'damaged'}`, 2]);
          break;
        case 'bone': {
          const p = direct ? clamp(0.3 + deposited / 380, 0, 0.98) : clamp(deposited / 1500, 0, 0.5) * sev;
          if (this.rng() < p) {
            const open = deposited > 250;
            if (s.long) {
              hit.fracture = { seg, t: r.along, open };
              this.queueBreak(seg, r.along, open);
            } else {
              this.addFracture(seg, s.bone, open, false);
            }
            if (s.nearCord && (direct ? this.rng() < 0.45 : this.rng() < 0.12)) {
              this.spinalInjury(s.nearCord);
              toLog.push([`spinal cord injured by ${s.label} fragments`, 3]);
            }
            painAdd += 0.5;
          } else if (direct) toLog.push([`${s.label} chipped`, 1]);
          break;
        }
        default:
          break;
      }
    }
    // muscle damage weakens the limb
    this.muscle[name] = clamp((this.muscle[name] || 0) + 0.15 + deposited / 700, 0, 1);
    this.addPain(painAdd, name);

    // wounds on the skin
    const dirLocal = body.worldDirToLocal(dirW, new Vec3());
    const entryLocal = body.worldToLocal(entryW, new Vec3());
    const exitLocal = !stopped && exitW ? body.worldToLocal(exitW, new Vec3()) : null;
    const total = extRate + intRate;
    const extEntry = exitLocal ? extRate * 0.4 : extRate;
    const entryWound = this.addWound({
      body,
      seg,
      kind: 'entry',
      local: entryLocal,
      normal: dirLocal.clone().negate(),
      dir: dirLocal.clone(),
      radius: proj.diameter * 0.55 + 0.0015,
      severity: clamp(deposited / 600, 0.2, 1),
      extRate: extEntry,
      intRate,
      arterial,
      pain: painAdd,
      cause: proj.label || 'gunshot',
      energy: deposited,
    });
    let exitWound = null;
    if (exitLocal) {
      const big = clamp(deposited / 900, 0, 1);
      exitWound = this.addWound({
        body,
        seg,
        kind: 'exit',
        local: exitLocal,
        normal: dirLocal.clone(),
        dir: dirLocal.clone(),
        radius: proj.diameter * 0.6 + 0.003 + 0.022 * big * (highVel ? 1 : 0.4),
        severity: clamp(0.3 + big, 0.3, 1),
        extRate: extRate - extEntry,
        intRate: 0,
        arterial,
        pain: painAdd * 0.5,
        cause: proj.label || 'gunshot',
        energy: deposited,
      });
    }
    entryWound.partner = exitWound;
    const where = SEGMENT_LABEL[name] || name;
    this.log(`${proj.label || 'Gunshot'} wound, ${where}${exitWound ? ' (through and through)' : ' (bullet lodged)'}`, total > 15 ? 3 : total > 4 ? 2 : 1);
    for (const [t, s] of toLog) this.log(`  ${t}`, s);

    // the hit itself: transient loss of tone in the area + startle (shot reaction)
    this.reactToHit(name, clamp(deposited / 400, 0.25, 1.2), dirW, 'bullet');
    hit.stopped = stopped;
    hit.energyLeft = proj.energy;
    hit.penUsed = penBefore - proj.pen;
    hit.entryWound = entryWound;
    hit.exitWound = exitWound;
    hit.endW = endW;
    return hit;
  }

  queueBreak(seg, t, open) {
    if (seg.fractured || this.pendingBreaks.some((b) => b.seg === seg)) return;
    this.pendingBreaks.push({ seg, t, open });
  }

  addFracture(seg, label, open, physical) {
    if (this.fractures.some((f) => f.seg === seg.name && f.label === label)) return;
    this.fractures.push({ seg: seg.name, label, open, physical });
    this.log(`${open ? 'Open' : 'Closed'} fracture: ${label} (${SEGMENT_LABEL[seg.name] || seg.name})`, 2);
    this.events.push({ type: 'fracture', seg, label, open, physical });
    this.addPain(0.8, seg.name);
    if (label === 'pelvis') this.muscle.pelvis = Math.max(this.muscle.pelvis || 0, 0.6);
  }

  /** Physically break a long bone: splits the segment body (see Ragdoll.fractureSegment). */
  breakLongBone(seg, t, open, onBroken) {
    const info = this.rd.fractureSegment(seg, t);
    if (!info) return null;
    // wounds on the proximal fragment live in the re-centred body frame
    for (const w of this.wounds) if (w.body === seg.body) w.local.sub(info.delta);
    for (const w of this.wounds) {
      if (w.body !== seg.body) continue;
      // wounds beyond the break now ride on the distal fragment
      const bindP = _v0.copy(w.local).add(seg.bindPos);
      if (_v1.subVectors(bindP, info.pointBind).dot(info.axisBind) > 0) {
        w.body = info.fragment;
        w.local.copy(bindP).sub(info.fragment.userData.bindPos);
      }
    }
    this.addFracture(seg, seg.bone ? seg.bone.name : 'bone', open, true);
    if (onBroken) onBroken(info);
    return info;
  }

  spinalInjury(level) {
    const order = { C1: 0, C5: 1, T6: 2, L1: 3, S1: 4 };
    if (this.spinal && order[this.spinal] <= order[level]) return;
    this.spinal = level;
    const P = this.paralysis;
    if (level === 'C1') {
      P.armsL = P.armsR = P.legs = P.trunk = P.neck = 0;
      this.breathing = 0; // phrenic nerve (C3-C5) cut off: respiratory paralysis
      this.log('Quadriplegia with respiratory paralysis (high cervical)', 3);
    } else if (level === 'C5') {
      P.armsL = P.armsR = 0.08;
      P.legs = 0;
      P.trunk = 0.05;
      P.neck = 0.6;
      this.breathing = Math.min(this.breathing, 0.7);
      this.log('Quadriplegia (cervical cord injury)', 3);
    } else if (level === 'T6') {
      P.legs = 0;
      P.trunk = 0.35;
      this.log('Paraplegia (thoracic cord injury)', 3);
    } else if (level === 'L1') {
      P.legs = 0;
      P.trunk = 0.8;
      this.log('Paraplegia (lumbar cord injury)', 3);
    } else {
      P.legs = Math.min(P.legs, 0.45);
      this.log('Cauda equina injury (leg weakness)', 2);
    }
    this.events.push({ type: 'paralysis', level });
  }

  knockOut(seconds, concussion = 0.5) {
    if (!this.alive) return;
    this.koTimer = Math.max(this.koTimer, seconds);
    this.concussion = Math.max(this.concussion, concussion);
    if (this.conscious) {
      this.conscious = false;
      this.events.push({ type: 'ko' });
      this.log('Knocked unconscious', 2);
    }
  }

  kill(cause) {
    if (!this.alive) return;
    this.alive = false;
    this.conscious = false;
    this.deathCause = cause;
    this.hr = 0;
    this.events.push({ type: 'death', cause });
    this.log(`DEATH: ${cause}`, 3);
  }

  /** Transient muscular reaction to a hit (Euphoria-style shot/impact reaction). */
  reactToHit(segName, strength, dirW, kind) {
    if (!this.alive) return;
    const side = sideOf(segName);
    const k = segKind(segName);
    const s = clamp(strength, 0, 1.2);
    if (k === 'thigh' || k === 'shin' || k === 'foot') {
      this.buckle[side] = Math.min(this.buckle[side], 1 - 0.75 * s);
    } else if (k === 'pelvis' || k === 'abdomen') {
      this.buckle.L = Math.min(this.buckle.L, 1 - 0.5 * s);
      this.buckle.R = Math.min(this.buckle.R, 1 - 0.5 * s);
      this.buckle.trunk = Math.min(this.buckle.trunk, 1 - 0.5 * s);
    } else if (k === 'chest' || k === 'neck') {
      this.buckle.L = Math.min(this.buckle.L, 1 - 0.3 * s);
      this.buckle.R = Math.min(this.buckle.R, 1 - 0.3 * s);
      this.buckle.trunk = Math.min(this.buckle.trunk, 1 - 0.4 * s);
    } else if (k === 'upperArm' || k === 'forearm' || k === 'hand') {
      this.buckle.arms[side] = Math.min(this.buckle.arms[side], 1 - 0.85 * s);
    }
    if (this.ctl && this.ctl.onHit) this.ctl.onHit({ segment: segName, strength: s, dir: dirW, kind });
    if (this.conscious && this.time - this.lastGrunt > 0.35) {
      this.lastGrunt = this.time;
      this.events.push({ type: 'grunt', intensity: clamp(0.4 + s * 0.6, 0, 1) });
    }
  }

  // ------------------------------------------------------------------------------------------
  /**
   * Blunt impact on a body of this ragdoll. pointW: contact point; impulse: N*s over the frame;
   * speed: approach speed (m/s); material: other body's material key.
   */
  blunt(body, pointW, normalW, impulse, speed, material, other) {
    if (!body.userData || !body.userData.segment) return;
    const seg = body.userData.segment;
    const name = seg.name;
    const k = segKind(name);
    const T = BLUNT[k];
    if (!T) return;
    const tau = T.tau + (MATERIAL_TAU[material] ?? MATERIAL_TAU.default);
    const F = impulse / tau;
    if (F < T.bruise * 0.7) return;
    // rate-limit repeated reports of the same resting contact
    const key = body.id * 7 + (other ? other.id % 7 : 0);
    const last = this.bruiseCooldown.get(key) ?? -1;
    if (this.time - last < 0.25) return;
    this.bruiseCooldown.set(key, this.time);
    const local = body.worldToLocal(pointW, new Vec3());
    const nLocal = body.worldDirToLocal(normalW, new Vec3());
    const sev = clamp((F - T.bruise * 0.7) / (T.fracture === Infinity ? 4000 : T.fracture), 0, 1);
    const where = SEGMENT_LABEL[name] || name;
    // contusion
    this.addWound({
      body,
      seg,
      kind: 'bruise',
      local,
      normal: nLocal.clone().negate(), // outward
      dir: nLocal.clone(),
      radius: 0.025 + 0.035 * sev,
      severity: clamp(0.3 + sev, 0, 1),
      extRate: 0,
      intRate: F > T.bruise * 2 ? 0.2 * sev : 0,
      pain: 0.05 + 0.6 * sev,
      cause: 'blunt',
      energy: 0,
    });
    this.addPain(PAIN_BY_SEGMENT[k] * (0.1 + 0.9 * sev), name);
    this.muscle[name] = clamp((this.muscle[name] || 0) + 0.12 * sev, 0, 1);
    const result = { F, fracture: null };
    if (F > T.bruise * 1.6) this.log(`Blunt trauma, ${where} (${(F / 1000).toFixed(1)} kN)`, sev > 0.5 ? 2 : 1);
    // fractures
    const pFrac = 1 / (1 + Math.exp(-(F - T.fracture) / (0.08 * T.fracture)));
    if (T.fracture < Infinity && this.rng() < pFrac) {
      if (seg.bone) {
        // break where it was struck: project the contact onto the bone axis
        const ax = boneAxis(name);
        if (ax && !seg.fractured) {
          const pb = _v0.copy(local).add(this.bodyBindPos(body));
          const ab = _v1.subVectors(ax.b, ax.a);
          const t = clamp(_v2.subVectors(pb, ax.a).dot(ab) / ab.lengthSq(), 0, 1);
          result.fracture = { seg, t, open: F > T.fracture * 2.2 };
          this.queueBreak(seg, t, F > T.fracture * 2.2);
        }
      } else {
        this.addFracture(seg, T.label, F > T.fracture * 2.5, false);
        if (k === 'chest' && F > T.fracture * 1.8) {
          const side = local.x >= 0 ? 'L' : 'R';
          this.lungs[side] = Math.max(0, this.lungs[side] - 0.35);
          this.log(`  ${side === 'L' ? 'left' : 'right'} lung contusion`, 2);
        }
        if (k === 'neck' && F > T.fracture * 1.5) this.spinalInjury(this.rng() < 0.5 ? 'C5' : 'C1');
      }
    }
    // organs
    if (k === 'abdomen' && F > T.organ) {
      const side = local.x;
      const organ = side < -0.02 ? 'liver' : side > 0.02 ? 'spleen' : 'small intestine';
      const rate = organ === 'liver' ? 6 : organ === 'spleen' ? 5 : 1;
      const w = this.wounds[this.wounds.length - 1];
      w.intRate += rate * clamp((F - T.organ) / T.organ + 0.3, 0, 1);
      this.log(`  ${organ} ruptured (internal bleeding)`, 2);
      this.addPain(0.5, name);
    }
    // head: concussion / knockout / fatal brain injury
    if (k === 'head') {
      const pKO = 1 / (1 + Math.exp(-(F - 4200) / 700));
      this.concussion = clamp(this.concussion + F / 12000, 0, 1);
      if (F > 16000) {
        this.kill('massive head trauma');
      } else if (this.rng() < pKO) {
        this.knockOut(4 + 30 * clamp((F - 3000) / 6000, 0, 1) + 10 * this.rng(), clamp(F / 8000, 0.3, 1));
      }
      if (F > 2500) this.log(`  concussion`, 2);
    }
    // only real blows provoke a hit reaction (not every bump against the floor)
    if (F > T.bruise * 1.3) this.reactToHit(name, clamp(F / (T.fracture === Infinity ? 4000 : T.fracture), 0.15, 1), normalW, 'blunt');
    return result;
  }

  // ------------------------------------------------------------------------------------------
  /** Physiology and controller coupling; dt in seconds. */
  update(dt) {
    this.time += dt;
    // long-bone fractures are executed between physics steps
    while (this.pendingBreaks.length) {
      const b = this.pendingBreaks.shift();
      const info = this.breakLongBone(b.seg, b.t, b.open);
      if (info) this.events.push({ type: 'bonebreak', info, open: b.open });
    }
    this.handPressure();
    const lossFrac = 1 - this.blood / BLOOD_VOLUME;
    // ---------------- circulation ----------------
    const hypovolaemia = smoothstep(0.12, 0.5, lossFrac);
    if (lossFrac > 0.5 && this.arrestTime < 0) this.cardiacArrest('exsanguination');
    if (this.cardiac < 0.15 && this.arrestTime < 0 && this.time > 0) this.cardiacArrestTimer = (this.cardiacArrestTimer || 0) + dt;
    if ((this.cardiacArrestTimer || 0) > 25 && this.arrestTime < 0) this.cardiacArrest('cardiac tamponade / heart wound');
    if (this.spo2 < 0.45 && this.arrestTime < 0) this.cardiacArrest('hypoxia');
    const pump = this.arrestTime >= 0 ? 0 : this.cardiac;
    this.perfusion = clamp(pump * (1 - 0.92 * hypovolaemia) * (1 + 0.08 * this.adrenaline), 0, 1.1);
    const hrTarget = this.arrestTime >= 0 || !this.alive ? 0 : clamp(72 + 95 * smoothstep(0.08, 0.4, lossFrac) + 28 * this.pain + 32 * this.adrenaline + (this.cardiac < 0.5 ? 40 : 0) - 60 * smoothstep(0.4, 0.5, lossFrac), 30, 185);
    this.hr += (hrTarget - this.hr) * clamp(dt * 1.5, 0, 1);
    this.bpSys = 120 * this.perfusion;

    // ---------------- bleeding ----------------
    const pressureFactor = Math.pow(clamp(this.perfusion, 0, 1.1), 1.3);
    let ext = 0, int = 0;
    for (const w of this.wounds) {
      w.age += dt;
      if (w.extRate <= 0 && w.intRate <= 0) continue;
      // clotting: small vessels seal within a minute or two, arteries barely
      const tauClot = w.arterial ? 700 : w.extRate + w.intRate > 6 ? 240 : 70;
      w.clot = Math.min(0.92, w.clot + dt / tauClot);
      const press = w.pressure > 0 ? (w.arterial ? 0.45 : 0.25) : 1;
      const f = pressureFactor * (1 - w.clot) * this.bleedScale;
      w.extNow = w.extRate * f * press;
      w.intNow = w.intRate * f;
      ext += w.extNow;
      int += w.intNow;
      // arterial spurting follows the heartbeat
      w.spurtPhase += dt * (this.hr / 60);
      w.pressure = Math.max(0, w.pressure - dt * 4);
    }
    this.externalRate = ext;
    this.bleedRate = ext + int;
    if (this.arrestTime < 0 || this.time - this.arrestTime < 20) {
      // after circulatory arrest only gravity drains the wounds
      const k = this.arrestTime >= 0 ? 0.08 : 1;
      this.blood = Math.max(0, this.blood - (ext + int) * dt * k);
      this.lostExternal += ext * dt * k;
      this.lostInternal += int * dt * k;
    }

    // ---------------- respiration / oxygen ----------------
    const lungFn = 0.5 * (this.lungs.L + this.lungs.R);
    const vent = this.alive ? this.breathing * this.airway : 0;
    const spo2Target = this.arrestTime >= 0 ? 0.2 : 0.98 * clamp(0.3 + 0.7 * lungFn, 0, 1) * clamp(0.25 + 0.75 * vent, 0, 1) + (vent > 0.2 ? 0 : -0.5);
    const tauO2 = spo2Target < this.spo2 ? (vent < 0.2 ? 45 : 25) : 12;
    this.spo2 += (clamp(spo2Target, 0, 1) - this.spo2) * clamp(dt / tauO2, 0, 1);

    // ---------------- brain ----------------
    const delivery = this.perfusion * clamp(this.spo2 / 0.95, 0, 1.05);
    this.delivery = delivery;
    if (delivery < 0.5) this.hypoxia += dt * (0.5 - delivery) * 2.6;
    else this.hypoxia = Math.max(0, this.hypoxia - dt * 0.4);
    if (delivery < 0.25) this.brainDamage += dt * ((0.25 - delivery) / 0.25) / 150;
    if (this.brainDamage >= 1) this.kill(this.deathCause || this.arrestCause || 'cerebral hypoxia');
    if (this.arrestTime >= 0 && this.time - this.arrestTime > 45) this.kill(this.arrestCause || 'cardiac arrest');

    // ---------------- consciousness ----------------
    if (this.koTimer > 0) this.koTimer = Math.max(0, this.koTimer - dt);
    const faint = this.hypoxia > 4.5;
    if (this.alive) {
      const shouldBeConscious = this.koTimer <= 0 && !faint && this.brainDamage < 0.5;
      if (this.conscious && !shouldBeConscious) {
        this.conscious = false;
        this.events.push({ type: 'unconscious' });
        if (faint) this.log('Lost consciousness (cerebral hypoperfusion)', 2);
      } else if (!this.conscious && shouldBeConscious && this.hypoxia < 2) {
        this.conscious = true;
        this.events.push({ type: 'wake' });
        this.log('Regained consciousness', 1);
      }
    }

    // ---------------- pain ----------------
    this.painAcute *= Math.exp(-dt / 9);
    let chronic = 0;
    for (const w of this.wounds) chronic += (w.pain || 0) * (0.35 + 0.65 * Math.exp(-w.age / 90));
    for (const f of this.fractures) chronic += 0.35;
    for (const k in this.limbPain) this.limbPain[k] *= Math.exp(-dt / 60);
    const mask = 1 - 0.45 * this.adrenaline;
    this.pain = this.conscious ? clamp(1 - Math.exp(-(this.painAcute + chronic * 0.6) * mask), 0, 1) : 0;
    this.adrenaline *= Math.exp(-dt / 50);

    // ---------------- transient hit reactions recover ----------------
    const rec = (x, rate) => Math.min(1, x + dt * rate);
    this.buckle.L = rec(this.buckle.L, 1.4);
    this.buckle.R = rec(this.buckle.R, 1.4);
    this.buckle.trunk = rec(this.buckle.trunk, 1.6);
    this.buckle.arms.L = rec(this.buckle.arms.L, 1.2);
    this.buckle.arms.R = rec(this.buckle.arms.R, 1.2);

    // ---------------- death from catastrophic loss ----------------
    if (this.alive && this.blood < BLOOD_VOLUME * 0.35) this.kill('exsanguination');

    this.status = !this.alive ? 'dead' : !this.conscious ? 'unconscious' : this.arrestTime >= 0 ? 'cardiac arrest' : lossFrac > 0.3 ? 'critical' : this.pain > 0.6 || lossFrac > 0.15 ? 'injured' : this.wounds.length ? 'hurt' : 'healthy';
    this.applyToController(dt, lossFrac);
  }

  cardiacArrest(cause) {
    if (this.arrestTime >= 0) return;
    this.arrestTime = this.time;
    this.arrestCause = cause;
    this.log(`Cardiac arrest (${cause})`, 3);
    this.events.push({ type: 'arrest', cause });
  }

  applyToController(dt, lossFrac) {
    const ctl = this.ctl;
    if (!ctl) return;
    ctl.alive = this.alive;
    ctl.conscious = this.alive && this.conscious;
    ctl.pain = this.pain;
    const weak = clamp(smoothstep(0.15, 0.42, lossFrac) + smoothstep(0.75, 0.5, this.delivery ?? 1) * 0.6, 0, 1);
    const P = this.paralysis;
    const m = (n) => this.muscle[n] || 0;
    const broken = (n) => this.fractures.some((f) => f.seg === n && f.physical);
    const fracLeg = (s) => (broken('thigh' + s) ? 0.04 : broken('shin' + s) ? 0.08 : this.fractures.some((f) => f.seg === 'foot' + s) ? 0.55 : 1);
    const fracArm = (s) => (broken('upperArm' + s) ? 0.05 : broken('forearm' + s) ? 0.25 : this.fractures.some((f) => f.seg === 'hand' + s) ? 0.6 : 1);
    const pelvisFx = this.fractures.some((f) => f.label === 'pelvis') ? 0.3 : 1;
    for (const s of ['L', 'R']) {
      const muscle = 1 - 0.55 * m('thigh' + s) - 0.35 * m('shin' + s) - 0.2 * m('foot' + s) - 0.25 * m('pelvis');
      const limbPain = clamp(((this.limbPain['thigh' + s] || 0) + (this.limbPain['shin' + s] || 0) + (this.limbPain['foot' + s] || 0)) * 0.25, 0, 0.5);
      ctl.legStrength[s] = clamp(muscle * fracLeg(s) * pelvisFx * P.legs * (1 - 0.85 * weak) * this.buckle[s] * (1 - limbPain), 0, 1);
      const am = 1 - 0.5 * m('upperArm' + s) - 0.4 * m('forearm' + s);
      ctl.armStrength[s] = clamp(am * fracArm(s) * (s === 'L' ? P.armsL : P.armsR) * (1 - 0.7 * weak) * this.buckle.arms[s], 0, 1);
    }
    ctl.spineStrength = clamp(P.trunk * (1 - 0.7 * weak) * this.buckle.trunk * (1 - 0.3 * m('abdomen')), 0, 1);
    ctl.neckStrength = clamp(P.neck * (1 - 0.6 * weak), 0, 1);
    ctl.balanceSkill = clamp((1 - 0.7 * this.concussion) * (1 - 0.6 * weak) * (1 - 0.3 * this.pain), 0.05, 1);
    this.concussion = Math.max(0, this.concussion - dt / 240);
    // wounds worth clutching (most painful first), excluding ones on a useless arm
    const list = [];
    for (const w of this.wounds) {
      if (w.kind === 'exit' && w.partner) continue;
      const pr = (w.pain || 0) * (0.4 + 0.6 * Math.exp(-w.age / 60)) + (w.extNow || 0) * 0.08;
      if (pr < 0.12) continue;
      list.push({ wound: w, body: w.body, segment: w.seg, local: w.local, normal: w.normal, priority: pr });
    }
    list.sort((a, b) => b.priority - a.priority);
    ctl.wounds = list.slice(0, 3);
  }

  /** A conscious hand resting on a bleeding wound presses on it (direct pressure). */
  handPressure() {
    if (!this.conscious) return;
    for (const s of ['L', 'R']) {
      const hand = this.rd.segments['hand' + s].body;
      const hp = hand.localToWorld(_v1.set(s === 'L' ? -0.012 : 0.012, -0.03, 0), _v1);
      for (const w of this.wounds) {
        if (w.extRate <= 0 || w.body === hand) continue;
        w.body.localToWorld(w.local, _v2);
        if (_v2.distanceTo(hp) < 0.065) w.pressure = 1;
      }
    }
  }

  /**
   * Blunt trauma from the physics impacts of the last step. Contacts between this ragdoll and
   * other bodies (or the floor) are converted to peak forces; `materialOf(shape)` names the other
   * surface.
   */
  processImpacts(world) {
    if (!this.alive && this.time > 0) {
      // the dead still bruise, but nothing else matters
    }
    for (const imp of world.impactList) {
      const A = imp.bodyA, B = imp.bodyB;
      if (!B && this.time < 1) continue; // feet settling onto the floor after spawning
      // deliberate floor contacts of the limbs while getting up are not trauma
      if (!B && imp.speed < 4 && this.ctl && this.ctl.mode === 'getup') continue;
      const segA = this.rd.segmentOf(A), segB = B ? this.rd.segmentOf(B) : null;
      if (!segA && !segB) continue;
      if (segA && segB) continue; // self-contact
      const mine = segA ? A : B;
      const other = segA ? B : A;
      const otherShape = segA ? imp.shapeB : imp.shapeA;
      if (imp.speed < 1.4) continue;
      const seg = mine.userData.segment;
      const k = segKind(seg.name);
      const ground = !other;
      let material = ground ? 'concrete' : otherShape && otherShape.material ? otherShape.material : 'default';
      if (other && other.userData && other.userData.ragdoll) material = 'flesh';
      // the local load is limited by the momentum of the struck part itself
      const mEff = mine.mass * (k === 'head' ? 1.25 : 2.5);
      let J = Math.min(imp.impulse, mEff * (imp.speed + 0.5));
      // a flat floor spreads the load: broad body parts are loaded far less than by a
      // concentrated blow of the same impulse
      if (ground) J *= GROUND_SPREAD[k] ?? 0.5;
      // contact normal pointing from the other surface into this body
      const n = imp.normal.clone();
      if (!segA) n.negate();
      this.blunt(mine, imp.point, n, J, imp.speed, material, other);
    }
  }

  // ------------------------------------------------------------------------------------------
  /** Vital signs and injury list for the HUD. */
  vitals() {
    return {
      status: this.status,
      alive: this.alive,
      conscious: this.conscious,
      hr: Math.round(this.hr),
      bp: `${Math.round(this.bpSys)}/${Math.round(this.bpSys * 0.65)}`,
      spo2: Math.round(this.spo2 * 100),
      blood: Math.round(this.blood),
      bloodPct: Math.round((this.blood / BLOOD_VOLUME) * 100),
      bleedRate: this.bleedRate,
      externalRate: this.externalRate,
      pain: this.pain,
      concussion: this.concussion,
      spinal: this.spinal,
      deathCause: this.deathCause,
      injuries: this.injuries,
      fractures: this.fractures,
      wounds: this.wounds.length,
    };
  }
}
