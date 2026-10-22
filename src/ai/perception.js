// Perception and shooting helpers shared by all AI brains: spotting with
// limited line-of-sight checks per scan, detection probability, target
// selection by threat and weapon suitability, firing solutions (lead, drop)
// and dispersion.

import { Vector3 } from 'three';
import { rng } from '../core/rng.js';
import { clamp, ballisticAngle, GRAVITY } from '../core/math.js';
import { ammoParams } from '../sim/weapons.js';

const _cand = [];
const _top = [];
const _topD = [];
const _v = new Vector3();
const _c = new Vector3();

const ROLE_THREAT = { rifleman: 1, leader: 1.3, grenadier: 1.1, mg: 1.6, at: 1.5, atgm: 2.0, sniper: 1.5, manpads: 1.1, drone_op: 1.4, crew: 0.4, pilot: 0.3 };
const TYPE_THREAT = { mbt: 7, ifv: 4.5, apc: 3, scout: 2.5, spaag: 3.5, spg: 3, mlrs: 3, attack_heli: 8, transport_heli: 4, jet: 6, transport_plane: 3, recon_uav: 2, fpv_drone: 2.5 };

export function threatValue(c, viewer) {
  if (c.cat === 'inf') {
    let t = ROLE_THREAT[c.def.role] ?? 1;
    if (viewer.cat === 'veh' && (c.def.role === 'at' || c.def.role === 'atgm')) t *= 2.5;
    if (viewer.cat === 'air' && c.def.role === 'manpads') t *= 4;
    if (c.wounded) t *= 0.7;
    return t;
  }
  let t = TYPE_THREAT[c.type] ?? 3;
  if (c.cat === 'veh' && (c.mobilityKill || c.firepowerKill)) t *= c.firepowerKill ? 0.4 : 0.8;
  if (c.type === 'fpv_drone' && viewer.cat === 'veh') t *= 2;
  if (c.type === 'spaag' && viewer.cat === 'air') t *= 3;
  return t;
}

const THERMAL_ROLES = new Set(['atgm', 'sniper', 'manpads']);

export function hasThermal(u) {
  return u.cat !== 'inf' || THERMAL_ROLES.has(u.def.role);
}

export function groundVision(u, world) {
  const w = world.weather;
  const env = hasThermal(u) ? w.thermalVisibility : w.visibility;
  return Math.min(u.visionRange, env);
}

export function airVision(u, world) {
  const base = u.def.airVision || (u.cat === 'air' ? u.visionRange : 1800);
  return Math.min(base, world.weather.thermalVisibility * (u.def.airVision ? 1.5 : 1));
}

// Look around: LOS-check a few promising enemies and report what is seen.
// Fills u.visible with currently seen enemies.
export function scan(u, world, maxChecks = 4) {
  const f = u.faction;
  const e = 1 - f;
  const intel = world.factions[f].intel;
  const t = world.time;
  if (!u.visible) u.visible = [];
  const vis = u.visible;
  vis.length = 0;
  const range = groundVision(u, world);
  const ux = u.pos.x;
  const uz = u.pos.z;
  // Top-K candidates by priority (distance, discounted if firing or already known).
  // Nearby enemies first; the whole vision range only every third scan, when
  // nothing is close, or for long-range observers (keeps big battles cheap).
  _top.length = 0;
  _topD.length = 0;
  u.scanN = (u.scanN || 0) + 1;
  const near = Math.min(range, 320);
  const farSighted = u.cat !== 'inf' || maxChecks > 3;
  world.factionGrids[e].queryRadius(ux, uz, farSighted ? range : near, _cand);
  if (!farSighted && range > near && (_cand.length < maxChecks * 2 || u.scanN % 3 === 0)) world.factionGrids[e].queryRadius(ux, uz, range, _cand);
  for (let i = 0; i < _cand.length; i++) {
    const c = _cand[i];
    if (!c.alive || c.dying || c.cat === 'air') continue;
    let pr = Math.hypot(c.pos.x - ux, c.pos.z - uz);
    if (t - c.lastFired < 2.5) pr *= 0.35;
    if (c === u.target) pr *= 0.3;
    if (c.spotted[f] > t) pr *= 0.7;
    insertTop(c, pr, maxChecks);
  }
  // Aircraft (few, visible from far away against the sky).
  const ar = airVision(u, world);
  const air = world.airUnits[e];
  for (let i = 0; i < air.length; i++) {
    const c = air[i];
    if (!c.alive || c.dying) continue;
    const d = Math.hypot(c.pos.x - ux, c.pos.z - uz, c.pos.y - u.pos.y);
    if (d > ar) continue;
    insertTop(c, d * (c.aclass === 'drone' ? 2.5 : 0.5), maxChecks + 1);
  }
  for (let i = 0; i < _top.length; i++) {
    const c = _top[i];
    const d = Math.hypot(c.pos.x - ux, c.pos.z - uz, c.pos.y - u.pos.y);
    const v = world.unitLOS(u, c);
    if (v < 0) break; // out of LOS budget this tick
    if (v === 0) continue;
    let conceal;
    let rr = range;
    if (c.cat === 'inf') {
      conceal = c.stance === 0 ? 1 : c.stance === 1 ? 0.7 : 0.38;
      if (c.def.camo) conceal *= 1 - c.def.camo;
      if (c.speed > 1) conceal *= 1.35;
      if (c.cover) conceal *= 0.8;
      if (world.los.forestDensityAt(c.pos.x, c.pos.z) > 0.4) conceal *= 0.6;
    } else if (c.cat === 'veh') {
      conceal = 2.4 * (c.speed > 1 ? 1.3 : 1);
    } else {
      conceal = c.aclass === 'drone' ? 0.9 : 3;
      rr = ar;
    }
    if (t - c.lastFired < 2) conceal *= 3;
    const p = v * clamp(conceal * (1.25 - d / rr), 0, 1);
    if (c.spotted[f] > t || rng.next() < p) {
      vis.push(c);
      intel.report(c, u);
    }
  }
  u.lastScan = t;
  return vis;
}

function insertTop(c, pr, k) {
  let i = _top.length;
  if (i >= k && pr >= _topD[k - 1]) return;
  if (i < k) {
    _top.push(c);
    _topD.push(pr);
  } else i = k - 1;
  while (i > 0 && _topD[i - 1] > pr) {
    _top[i] = _top[i - 1];
    _topD[i] = _topD[i - 1];
    i--;
  }
  _top[i] = c;
  _topD[i] = pr;
}

// Choose the best (target, weapon) pair. Considers enemies seen this scan and
// enemies spotted by friendlies within weapon range (which then need LOS).
// Returns true if a target was selected (u.target / u.weapon set).
export function pickTarget(u, world, opts = {}) {
  const f = u.faction;
  const t = world.time;
  let maxRange = 0;
  for (const w of u.weapons) {
    if (w.empty || w.disabled || w.def.thrown || (opts.only && !opts.only(w))) continue;
    if (w.def.indirect) continue;
    maxRange = Math.max(maxRange, w.def.range);
  }
  if (maxRange === 0) {
    u.target = null;
    u.weapon = null;
    return false;
  }
  const seen = u.visible || [];
  let best = null;
  let bestW = null;
  let bestS = 0;
  let bestSeen = false;
  const consider = (c, isSeen) => {
    if (!c.alive || c.dying || c.hidden) return;
    const dx = c.pos.x - u.pos.x;
    const dz = c.pos.z - u.pos.z;
    const d = Math.hypot(dx, dz, c.pos.y - u.pos.y);
    const tv = threatValue(c, u);
    for (const w of u.weapons) {
      if (w.empty || w.disabled || w.def.thrown || w.def.indirect || (opts.only && !opts.only(w))) continue;
      const suit = w.def.targets[c.tclass] || 0;
      if (suit <= 0) continue;
      if (d > w.def.range || d < (w.def.minRange || 0)) continue;
      let s = suit * tv * (1.15 - (d / w.def.range) * 0.6);
      if (c === u.target) s *= 1.4;
      if (c.threatSource === u || (u.squad && c.threatSource && c.threatSource.squad === u.squad)) s *= 1.5;
      if (!isSeen) s *= 0.55;
      // Single-shot heavy weapons shouldn't be wasted on lone infantry.
      if ((w.def.kind === 'rocket' || w.def.kind === 'missile') && c.cat === 'inf' && !w.def.antiAir) s *= 0.3;
      if (s > bestS) {
        bestS = s;
        best = c;
        bestW = w;
        bestSeen = isSeen;
      }
    }
  };
  for (let i = 0; i < seen.length; i++) consider(seen[i], true);
  // Known (spotted) enemies within weapon range.
  if (opts.known !== false) {
    let n = 0;
    world.factionGrids[1 - f].forEachInRadius(u.pos.x, u.pos.z, Math.min(maxRange, 1500), (c) => {
      if (c.spotted[f] > t && seen.indexOf(c) < 0) {
        consider(c, false);
        if (++n >= 24) return true;
      }
      return false;
    });
    if (maxRange > 1000) {
      const air = world.airUnits[1 - f];
      for (const c of air) if (c.spotted[f] > t && seen.indexOf(c) < 0) consider(c, false);
    }
  }
  if (best && !bestSeen) {
    const v = world.unitLOS(u, best);
    if (v <= 0) best = null;
  }
  if (best !== u.target) {
    for (const w of u.weapons) w.aimT = 0;
  }
  u.target = best;
  u.weapon = best ? bestW : null;
  return !!best;
}

// Aim direction for a mount at a target from a muzzle origin, with target
// lead and gravity drop. Writes a unit vector to out; returns the distance.
export function aimAt(u, w, target, origin, out, skill = 1) {
  const def = w.def;
  const ap = ammoParams(def, w.ammoType);
  target.centerPos(_c);
  if (target.cat === 'veh') _c.y = target.pos.y + target.spec.height * 0.5;
  let dx = _c.x - origin.x;
  let dy = _c.y - origin.y;
  let dz = _c.z - origin.z;
  let d = Math.hypot(dx, dy, dz);
  let speed = ap.speed || def.speed || 300;
  if (def.kind === 'rocket') speed = (speed + (def.maxSpeed || speed)) * 0.5;
  if (def.kind === 'missile') {
    out.set(dx, dy + (def.topAttack || def.loft ? d * 0.25 : d * 0.03), dz).normalize();
    return d;
  }
  const drag = ap.drag ?? def.drag ?? 0;
  let tof = (d / speed) * (1 + drag * d * 0.5);
  // Lead (imperfect for people, near-perfect for fire control).
  const lead = u.cat === 'inf' ? 0.65 * skill : 0.95;
  dx += target.vel.x * tof * lead;
  dy += (target.vel.y || 0) * tof * lead;
  dz += target.vel.z * tof * lead;
  const hd = Math.hypot(dx, dz);
  if (def.lob) {
    // Grenades: solve the ballistic arc.
    const a = ballisticAngle(speed, hd, dy, false);
    if (Number.isNaN(a)) return -1;
    const ca = Math.cos(a);
    out.set((dx / hd) * ca, Math.sin(a), (dz / hd) * ca);
    return d;
  }
  // Gravity drop compensation.
  tof = (Math.hypot(hd, dy) / speed) * (1 + drag * hd * 0.5);
  dy += 0.5 * GRAVITY * tof * tof;
  out.set(dx, dy, dz).normalize();
  return d;
}

// Shot dispersion (radians std) for a soldier firing a weapon.
export function infantryDispersion(u, w) {
  let s = w.def.spread || 0.003;
  s *= u.stance === 2 ? 0.55 : u.stance === 1 ? 0.75 : 1;
  if (u.speed > 0.5) s *= 1.6 + u.speed * 0.25;
  s *= 1 + u.suppression * 2.5;
  s /= u.skill;
  if (u.wounded) s *= 1.4;
  if (u.roof) s *= 0.9;
  // Settling: the first shots after acquiring are less precise.
  s *= 1 + 1.2 * Math.exp(-w.aimT * 1.5);
  return s;
}

export function vehicleDispersion(v, w) {
  let s = w.def.spread || 0.002;
  if (Math.abs(v.speed) > 1) s *= v.def.vclass === 'armor' ? 1.6 : 2.4;
  return s;
}

// Fire control: lead + drop elevation for a vehicle turret on a target.
// Returns an aim point object usable as vehicle.aimTarget.
export function vehicleAimPoint(v, w, target, out) {
  const def = w.def;
  const ap = ammoParams(def, w.ammoType);
  target.centerPos(_c);
  if (target.cat === 'veh') _c.y = target.pos.y + target.spec.height * 0.45;
  const dx = _c.x - v.pos.x;
  const dz = _c.z - v.pos.z;
  const d = Math.hypot(dx, dz);
  const speed = def.kind === 'missile' ? 200 : ap.speed || def.speed || 800;
  const tof = (d / speed) * (1 + (ap.drag ?? def.drag ?? 0) * d * 0.5);
  out.x = _c.x + target.vel.x * tof * 0.95;
  out.y = _c.y + (target.vel.y || 0) * tof * 0.95;
  out.z = _c.z + target.vel.z * tof * 0.95;
  out.loft = def.kind === 'missile' ? 0 : Math.atan((0.5 * GRAVITY * tof * tof) / Math.max(1, d));
  return out;
}
