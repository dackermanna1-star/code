// 3D monsters: draws monsters as voxel models (see voxelize.js) instead of
// billboards, and turns them into physical ragdolls when they die. Live
// models play the original animation frame by frame, turn smoothly instead
// of snapping between the eight sprite angles and lean away from hits.
// Corpses are articulated rigid bodies (ragdoll.js) thrown by the killing
// blow; they can be shot, blown apart, dismembered, crushed and kicked, and
// stand back up when an arch-vile raises them.
//
// Purely cosmetic: the game's corpse objects carry on exactly as before.

import { Ragdoll, RagdollWorld, qFromAxisAngle, qMatrix } from './ragdoll.js';
import { MF, TAU, angleDiff } from '../game/defs.js';
import { FRAMEMASK, FULLBRIGHT } from '../game/tables.js';
import { VOX_FUZZ, VOX_FULLBRIGHT } from '../render/voxels.js';

const BLOOD_BASE = { red: 181, green: 119, blue: 200, fire: 181 };
const MAX_RAGDOLLS = 160;
const PRESETTLE_PER_FRAME = 2;
const MAX_DRAW_DIST = 4200;

const tmpR = new Float64Array(9);
const tmpQa = new Float64Array(4);
const mat = new Float32Array(12);
const LO = [0, 0, 0], HI = [0, 0, 0];

function nlerpQ(a, b, t, out) {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  let l = 0;
  for (let k = 0; k < 4; k++) { out[k] = a[k] + (b[k] * s - a[k]) * t; l += out[k] * out[k]; }
  l = Math.sqrt(l) || 1;
  for (let k = 0; k < 4; k++) out[k] /= l;
  return out;
}

// Rows of the voxel -> world matrix for a body pose (position of the part's
// centre of mass, orientation q) and the part's model-space centre `com`.
function poseMatrix(model, com, x, y, z, q, out) {
  const R = qMatrix(q, tmpR);
  const s = model.s;
  const gx = model.g0[0] - com[0], gy = model.g0[1] - com[1], gz = model.g0[2] - com[2];
  for (let r = 0; r < 3; r++) {
    out[r * 4] = R[r * 3] * s;
    out[r * 4 + 1] = R[r * 3 + 1] * s;
    out[r * 4 + 2] = R[r * 3 + 2] * s;
    out[r * 4 + 3] = (r === 0 ? x : r === 1 ? y : z) + R[r * 3] * gx + R[r * 3 + 1] * gy + R[r * 3 + 2] * gz;
  }
  return out;
}

export class VoxelMonsters {
  constructor(fx, w, lib) {
    this.fx = fx;
    this.w = w;
    this.lib = lib;
    this.s = w.settings;
    this.physics = new RagdollWorld(w);
    this.views = new WeakMap(); // mobj -> { yaw, t }
    this.ragdolls = new Map(); // mobj -> ragdoll
    this.scanned = false;
    this.presettled = 0;
    // Corpses whose ragdoll was dropped for the cap keep their sprite.
    this.dropped = new WeakSet();
    this.view = null;
  }

  // Per-frame culling setup: the horizontal view cone. Boxes off screen
  // would otherwise still be raymarched (the shader writes depth, so hidden
  // fragments aren't rejected early). REJECT isn't used: maps rig it to
  // blind monsters, and vanilla never hides anything with it.
  beginFrame(r, cam) {
    this.view = {
      x: cam.x, y: cam.y,
      fx: Math.cos(cam.yaw), fy: Math.sin(cam.yaw),
      // Looking steeply up or down shows more to the sides.
      half: Math.atan(r.tanX || 1) + 0.08 + Math.max(0, Math.abs(cam.pitch || 0) - 0.3) * 2,
    };
  }

  // Could something at (x, y), `rad` units across, be on screen?
  visible(x, y, rad) {
    const v = this.view;
    if (!v) return true;
    const dx = x - v.x, dy = y - v.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > MAX_DRAW_DIST) return false;
    if (d > rad) {
      const cos = (dx * v.fx + dy * v.fy) / d;
      const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
      if (ang > v.half + Math.asin(Math.min(1, rad / d))) return false;
    }
    return true;
  }

  get enabled() { return this.s.voxelMonsters !== false; }

  // --- Models ---------------------------------------------------------------

  // Voxel model for a mobj's current frame, once its whole sprite is built.
  modelFor(mo) {
    const lib = this.lib;
    if (!lib.supports(mo.sprite)) return null;
    if (!lib.ready(mo.sprite)) { lib.request(mo.sprite); return null; }
    return lib.model(mo.sprite, mo.frame);
  }

  // Sprites seen on the map start building at once.
  scan() {
    this.scanned = true;
    // Invisible markers (NOSECTOR, e.g. teleport destinations) don't count.
    for (const mo of this.w.mobjs) if (!(mo.flags & MF.NOSECTOR) && this.lib.supports(mo.sprite)) this.lib.request(mo.sprite);
  }

  // Monster art that hangs below the floor is lifted like the sprite renderer does.
  lift(mo, model, z) {
    if (mo.flags & MF.SPAWNCEILING) return 0;
    const bottom = z + model.bot;
    if (bottom < mo.floorz - 0.5 && mo.z <= mo.floorz + 1) return Math.min(mo.floorz - bottom, 8);
    return 0;
  }

  bloodOf(mo) { return this.fx.bloodOf(mo); }

  // --- Live monsters ----------------------------------------------------------

  // Called for every thing the view draws. Returns true when it was drawn
  // here (as a voxel model or as its ragdoll) and the sprite must be skipped.
  drawMobj(r, mo, x, y, z, cam) {
    if (!this.enabled) return false;
    if (this.ragdolls.has(mo)) return true;
    if (!this.lib.supports(mo.sprite)) return false;
    const model = this.modelFor(mo);
    if (!model) {
      if (this.lib.ready(mo.sprite) && !this.dropped.has(mo) && this.isCorpseFrame(mo) && this.presettled < PRESETTLE_PER_FRAME) {
        this.presettled++;
        if (this.presettle(mo)) return true;
      }
      return false;
    }
    if (!this.visible(x, y, Math.max(model.nx, model.ny) * model.s)) return true;
    const v = this.viewState(mo);
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - v.t) / 1000));
    v.t = now;
    // Turn smoothly toward the game angle instead of snapping by 45 degrees.
    const d = angleDiff(mo.angle, v.yaw);
    v.yaw += d * (1 - Math.exp(-dt * 16));
    if (Math.abs(angleDiff(mo.angle, v.yaw)) > 2.5) v.yaw = mo.angle;
    let q = qFromAxisAngle(0, 0, 1, v.yaw);
    const e = mo.ext;
    if (e && e.flinch && e.hitAngle !== undefined) {
      // Lean back along the hit, pivoting at the feet.
      const ha = e.hitAngle;
      const lean = qFromAxisAngle(-Math.sin(ha), Math.cos(ha), 0, Math.min(0.35, Math.abs(e.flinch) * 0.9));
      const out = [0, 0, 0, 0];
      const ax = lean, b = q;
      out[0] = ax[3] * b[0] + ax[0] * b[3] + ax[1] * b[2] - ax[2] * b[1];
      out[1] = ax[3] * b[1] - ax[0] * b[2] + ax[1] * b[3] + ax[2] * b[0];
      out[2] = ax[3] * b[2] + ax[0] * b[1] - ax[1] * b[0] + ax[2] * b[3];
      out[3] = ax[3] * b[3] - ax[0] * b[0] - ax[1] * b[1] - ax[2] * b[2];
      q = out;
    }
    z += this.lift(mo, model, z);
    let flags = 0;
    if (mo.frame & FULLBRIGHT) flags |= VOX_FULLBRIGHT;
    if (mo.flags & MF.SHADOW) flags |= VOX_FUZZ;
    const alpha = e && e.fade !== undefined ? Math.max(0, e.fade) : 1;
    poseMatrix(model, [0, 0, 0], x, y, z, q, mat);
    LO[0] = 0; LO[1] = 0; LO[2] = 0; HI[0] = model.nx; HI[1] = model.ny; HI[2] = model.nz;
    r.voxels.add(model, mat, LO, HI, 0, mo.subsector.sector.lightlevel, flags, 0, alpha);
    return true;
  }

  viewState(mo) {
    let v = this.views.get(mo);
    if (!v) { v = { yaw: mo.angle, t: performance.now() }; this.views.set(mo, v); }
    return v;
  }

  // Is this mobj showing the death pose of a monster with a 3D model? (A
  // corpse from a loaded game, or one placed on the map as decoration.)
  isCorpseFrame(mo) {
    const kind = this.lib.deathFrames.get(mo.sprite * 64 + (mo.frame & FRAMEMASK));
    if (kind !== 'death') return false;
    if (mo.flags & MF.SHOOTABLE) return false;
    if (this.s.physics === false) return false;
    const cfg = this.lib.config(mo.sprite);
    if (!cfg || cfg.ragdoll === false) return false;
    // Only the end of the animation: the body has already fallen.
    return mo.tics === -1 || !!(mo.flags & MF.CORPSE);
  }

  // --- Ragdolls -----------------------------------------------------------------

  // Frame A of the sprite in the standing pose, or the frame on screen.
  baseModel(mo) {
    const lib = this.lib;
    if (!lib.ready(mo.sprite)) return null;
    return lib.model(mo.sprite, mo.frame) || lib.model(mo.sprite, 0) || lib.model(mo.sprite, 1);
  }

  // A thing went through a Chinatown portal: turn its smoothed facing too.
  portaled(mo, rot) {
    const v = this.views.get(mo);
    if (v) v.yaw += rot;
  }

  createRagdoll(mo, model, yaw, vel) {
    if (this.ragdolls.size >= MAX_RAGDOLLS) this.dropOldest();
    const z0 = mo.z + this.lift(mo, model, mo.z);
    const rag = new Ragdoll(model, { x: mo.x, y: mo.y, z: z0, q: qFromAxisAngle(0, 0, 1, yaw), vx: vel[0], vy: vel[1], vz: vel[2] });
    rag.mo = mo;
    rag.blood = this.bloodOf(mo);
    rag.bloodIndex = BLOOD_BASE[rag.blood] || 181;
    rag.fuzz = !!(mo.flags & MF.SHADOW);
    rag.stumps = [];
    rag.severed = new Array(rag.bodies.length).fill(0);
    rag.spawnhealth = mo.info.spawnhealth;
    this.ragdolls.set(mo, rag);
    this.physics.add(rag);
    return rag;
  }

  dropOldest() {
    let victim = null;
    for (const [mo, r] of this.ragdolls) {
      if (r.asleep) { victim = mo; break; }
    }
    if (!victim) victim = this.ragdolls.keys().next().value;
    if (victim) { this.removeRagdoll(victim); this.dropped.add(victim); }
  }

  removeRagdoll(mo) {
    const r = this.ragdolls.get(mo);
    if (!r) return;
    this.ragdolls.delete(mo);
    this.physics.remove(r);
  }

  hasRagdoll(mo) { return this.ragdolls.has(mo); }

  // A corpse with no ragdoll yet (loaded game, decoration): drop the
  // standing model with a small random topple and let it settle at once.
  presettle(mo) {
    const model = this.baseModel(mo);
    if (!model) return false;
    const rag = this.createRagdoll(mo, model, mo.angle, [0, 0, 0]);
    const a = Math.random() * TAU;
    const torso = rag.bodies[0];
    const m = model.mass;
    rag.impulseAt(torso.x[0], torso.x[1], torso.x[2] + 12, Math.cos(a) * 60 * m, Math.sin(a) * 60 * m, 0);
    rag.tone = 0.4;
    for (let t = 0; t < 120 && !rag.asleep; t++) this.physics.simulate(rag, 1 / 35);
    for (const b of rag.bodies) { b.rx.set(b.x); b.rq.set(b.q); }
    rag.pooled = true;
    return true;
  }

  // Death: replace the monster with its ragdoll. `o` carries the fx
  // layer's verdict (direction, launch speed, gib, head shot...).
  onKill(mo, hit, o) {
    if (!this.enabled) return false;
    const cfg = this.lib.config(mo.sprite);
    if (!cfg || cfg.ragdoll === false) return false;
    const model = this.modelFor(mo);
    if (!model) return false;
    const v = this.viewState(mo);
    // Most of the game's damage thrust (a vanilla corpse slides about one
    // body length on it).
    const vel = [mo.momx * 35 * 0.6, mo.momy * 35 * 0.6, mo.momz * 35 * 0.6];
    const rag = this.createRagdoll(mo, model, v.yaw, vel);
    const dir = [Math.cos(o.ang), Math.sin(o.ang)];
    const speed = o.force * 35 * 0.75;
    const up = o.up * 35 * 0.6;
    const M = model.mass;
    if (o.explosive && hit && hit.spot) {
      for (const b of rag.bodies) { b.v[0] += dir[0] * speed * 0.4; b.v[1] += dir[1] * speed * 0.4; b.v[2] += up * 0.5; }
      rag.blast(hit.spot.x, hit.spot.y, hit.spot.z ?? mo.z + 16, 220, speed * 1.4 + 120);
    } else {
      // The game already pushed the body (damage thrust, in vel); add a
      // little more overall and hit the part the shot landed on.
      for (const b of rag.bodies) { b.v[0] += dir[0] * speed * 0.1; b.v[1] += dir[1] * speed * 0.1; b.v[2] += up * 0.2; }
      let hx, hy, hz;
      if (hit && hit.x !== undefined) { hx = hit.x; hy = hit.y; hz = hit.z; } else { hx = mo.x - dir[0] * 8; hy = mo.y - dir[1] * 8; hz = mo.z + model.top * 0.6; }
      const b = rag.nearestBody(hx, hy, hz);
      if (b) {
        const m = 1 / b.invMass;
        // Cap the hit part's kick so a light limb isn't flung off.
        const j = Math.min(speed * 0.35 * M, speed * 1.3 * m);
        b.impulse(hx, hy, hz, dir[0] * j, dir[1] * j, up * 0.3 * m);
        b.damage += o.damage || 0;
      }
    }
    // A little twist so bodies don't all fall the same way.
    const pelvis = rag.bodies[0];
    pelvis.w[2] += (Math.random() - 0.5) * 3;
    if (o.gib) this.gibRagdoll(rag, o.ang, o.explosive ? 9 : 6);
    else if (o.headshot) this.popHead(rag, o.ang);
    return true;
  }

  // Index of a body by part kind.
  find(rag, kind) { return rag.bodies.findIndex((b) => b.part.kind === kind && !b.removed); }

  // Tear body i off at its parent joint; both raw ends bleed for a while.
  tear(rag, i, bleed = 30) {
    const j = rag.parentJoint(i);
    if (!j) return false;
    rag.sever(i);
    const A = j.A.index, B = j.B.index;
    rag.severed[A] |= 1 << (rag.bodies[B].part.label - 1);
    rag.severed[B] |= 1 << (rag.bodies[A].part.label - 1);
    if (this.fx.gore >= 1 && rag.blood !== 'fire') {
      const d = j.def;
      rag.stumps.push({ body: j.A, local: d.ra, dir: d.dirB, ttl: bleed });
      rag.stumps.push({ body: j.B, local: d.rb, dir: [-d.dirB[0], -d.dirB[1], -d.dirB[2]], ttl: Math.round(bleed * 0.6) });
    }
    return true;
  }

  popHead(rag, ang) {
    const hi = this.find(rag, 'head');
    if (hi < 0) return;
    this.tear(rag, hi, 40);
    const b = rag.bodies[hi];
    const m = 1 / b.invMass;
    const sp = 220 + Math.random() * 120;
    b.impulse(b.x[0], b.x[1], b.x[2] - 2, Math.cos(ang) * sp * m, Math.sin(ang) * sp * m, (180 + Math.random() * 100) * m);
    b.w[0] += (Math.random() - 0.5) * 20; b.w[1] += (Math.random() - 0.5) * 20;
    this.fx.spray(b.x[0], b.x[1], b.x[2], ang, 0.3, 26, 5, rag.blood);
    this.w.sound({ x: b.x[0], y: b.x[1], z: b.x[2] }, 'x_splat', { channel: 'gib', volume: 0.7 });
  }

  // Overkill: every joint tears and the pieces fly apart.
  gibRagdoll(rag, ang, power) {
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (const b of rag.bodies) { cx += b.x[0]; cy += b.x[1]; cz += b.x[2]; n++; }
    cx /= n; cy /= n; cz /= n;
    for (let i = 0; i < rag.bodies.length; i++) this.tear(rag, i, 24);
    for (const b of rag.bodies) {
      let dx = b.x[0] - cx, dy = b.x[1] - cy, dz = b.x[2] - cz + 6;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= d; dy /= d; dz /= d;
      const sp = power * 35 * (0.4 + Math.random() * 0.6);
      b.v[0] += dx * sp * 0.7 + Math.cos(ang) * sp * 0.6;
      b.v[1] += dy * sp * 0.7 + Math.sin(ang) * sp * 0.6;
      b.v[2] += Math.abs(dz) * sp * 0.5 + 80 + Math.random() * power * 25;
      b.w[0] += (Math.random() - 0.5) * 24; b.w[1] += (Math.random() - 0.5) * 24; b.w[2] += (Math.random() - 0.5) * 24;
    }
    rag.tone = 0;
    rag.gibbed = true;
    rag.wake();
  }

  // Shot or blasted corpse parts tear off once they've taken enough.
  checkDamage(rag) {
    if (this.s.dismemberment === false || !this.fx.gore) return;
    const limit = 25 + Math.min(120, rag.spawnhealth * 0.12);
    for (let i = 0; i < rag.bodies.length; i++) {
      const b = rag.bodies[i];
      if (b.removed || b.damage < limit) continue;
      const k = b.part.kind;
      if (k === 'pelvis' || k === 'hips' || k === 'body') continue;
      if (rag.parentJoint(i)) {
        if (k === 'head') this.popHead(rag, Math.random() * TAU);
        else this.tear(rag, i, 25);
        this.w.sound({ x: b.x[0], y: b.x[1], z: b.x[2] }, 'x_gibpart', { channel: 'gib2', volume: 0.6 });
      }
      b.damage = -1e9;
    }
  }

  // --- Hooks from the effects layer -------------------------------------------------

  // A player bullet along origin + t*dir (unit), up to maxDist.
  bulletTrace(x0, y0, z0, dx, dy, dz, maxDist, damage, pellet) {
    if (!this.enabled || !this.ragdolls.size) return null;
    let best = null, bt = maxDist;
    for (const rag of this.ragdolls.values()) {
      if (rag.raise) continue;
      const a = rag.aabb;
      if (!rayBox(x0, y0, z0, dx, dy, dz, a, bt)) continue;
      for (const b of rag.bodies) {
        if (b.removed) continue;
        for (let k = 0; k < b.sph.length; k++) {
          const sx = b.sw[k * 3] - x0, sy = b.sw[k * 3 + 1] - y0, sz = b.sw[k * 3 + 2] - z0;
          const r = b.sph[k][3];
          const tc = sx * dx + sy * dy + sz * dz;
          if (tc < 0) continue;
          const d2 = sx * sx + sy * sy + sz * sz - tc * tc;
          if (d2 > r * r) continue;
          const t = tc - Math.sqrt(r * r - d2);
          if (t < bt && t > 0) { bt = t; best = { rag, b }; }
        }
      }
    }
    if (!best) return null;
    const { rag, b } = best;
    const hx = x0 + dx * bt, hy = y0 + dy * bt, hz = z0 + dz * bt;
    const m = 1 / b.invMass;
    const dv = damage * (pellet ? 7 : 9) * Math.min(2, Math.sqrt(600 / m));
    b.impulse(hx, hy, hz, dx * dv * m, dy * dv * m, (dz + 0.15) * dv * m);
    b.damage += damage;
    rag.wake();
    if (rag.raise) rag.raise = null;
    const ang = Math.atan2(dy, dx);
    if (this.fx.gore && rag.blood !== 'fire') {
      this.fx.spray(hx, hy, hz, ang, 0.4, 4 + damage * 0.3, 2.5, rag.blood);
      if (!pellet && Math.random() < 0.3) this.fx.wallBloodBehind(hx, hy, hz, ang, rag.blood, damage);
    }
    this.checkDamage(rag);
    return { x: hx, y: hy, z: hz, dist: bt };
  }

  blast(x, y, z, radius, speed) {
    if (!this.enabled) return;
    for (const rag of this.ragdolls.values()) {
      const a = rag.aabb;
      if (x < a[0] - radius || x > a[3] + radius || y < a[1] - radius || y > a[4] + radius) continue;
      if (rag.raise) continue;
      if (rag.blast(x, y, z, radius, speed)) this.checkDamage(rag);
    }
  }

  // The game crushed or gibbed the corpse object.
  crushed(mo) {
    const rag = this.ragdolls.get(mo);
    if (!rag || rag.gibbed) return false;
    this.gibRagdoll(rag, Math.random() * TAU, 3);
    return true;
  }

  // Arch-vile: the body pulls itself back into its standing pose.
  resurrect(mo) {
    const rag = this.ragdolls.get(mo);
    if (!rag) return;
    rag.raise = { t: 0, dur: 22, from: rag.bodies.map((b) => ({ x: [...b.x], q: [...b.q] })) };
    rag.asleep = true;
    for (const b of rag.bodies) { b.removed = false; }
    for (const j of rag.joints) j.broken = false;
    rag.severed.fill(0);
    rag.stumps.length = 0;
  }

  // --- Per tic --------------------------------------------------------------------

  tick() {
    if (!this.enabled) {
      if (this.ragdolls.size) for (const mo of [...this.ragdolls.keys()]) this.removeRagdoll(mo);
      return;
    }
    if (!this.scanned) this.scan();
    this.lib.pump();
    this.presettled = 0;
    const fx = this.fx;
    for (const [mo, rag] of this.ragdolls) {
      if (mo.removed) { this.removeRagdoll(mo); continue; }
      if (rag.raise) {
        rag.raise.t++;
        for (const b of rag.bodies) { b.rx.set(b.x); b.rq.set(b.q); }
        this.raisePose(rag, mo);
        // Back on its feet once the monster shows a 3D frame again.
        if (rag.raise.t >= rag.raise.dur && this.modelFor(mo)) this.removeRagdoll(mo);
      }
    }
    // Live solid things push bodies around.
    const movers = [];
    for (const mo of this.w.mobjs) {
      if (!(mo.flags & MF.SOLID) || !(mo.flags & MF.SHOOTABLE)) continue;
      movers.push({ x: mo.x, y: mo.y, z: mo.z, radius: mo.radius, height: mo.height, vx: mo.momx * 35, vy: mo.momy * 35 });
    }
    // Remember who was airborne, for landing thuds.
    for (const rag of this.ragdolls.values()) {
      if (rag.asleep) continue;
      for (const b of rag.bodies) { b.preTouch = b.touching; b.preSpeed = Math.sqrt(b.v[0] * b.v[0] + b.v[1] * b.v[1] + b.v[2] * b.v[2]); }
    }
    this.physics.tic(movers, this.s.ragdollLimit ?? 16);
    for (const rag of this.ragdolls.values()) {
      if (rag.raise) continue;
      let thud = false;
      for (const b of rag.bodies) {
        if (b.removed) continue;
        if (b.crushed) {
          // Squeezed by a door or crusher: that part bursts.
          b.crushed = false;
          if (b.part.kind !== 'pelvis' && b.part.kind !== 'hips' && b.part.kind !== 'body') {
            this.tear(rag, b.index, 10);
            b.removed = true;
          }
          if (fx.gore && rag.blood !== 'fire') fx.spray(b.x[0], b.x[1], b.x[2], Math.random() * TAU, 0.6, 14, 3, rag.blood, { cone: TAU });
          continue;
        }
        if (!rag.asleep && b.touching && !b.preTouch && b.preSpeed > 160 && 1 / b.invMass > rag.model.mass * 0.12) {
          thud = true;
          if (fx.gore >= 2 && rag.blood !== 'fire' && fx.decalBudget > 0 && b.preSpeed > 260) {
            fx.decalBudget--;
            const list = fx.img.small[rag.blood];
            if (list) fx.decals.addFlat(b.x[0], b.x[1], list[(Math.random() * list.length) | 0], false, 0.9);
          }
        }
      }
      if (thud && fx.soundBudget > 0 && !rag.thuds) {
        fx.soundBudget--;
        rag.thuds = 1;
        const b = rag.bodies[0];
        this.w.sound({ x: b.x[0], y: b.x[1], z: b.x[2] }, 'x_body_fall', { channel: 'body', volume: 0.8 });
      }
      // Bodies slammed into walls leave a smear.
      for (const hit of rag.impacts) {
        if (fx.gore >= 2 && rag.blood !== 'fire' && fx.decalBudget > 0) {
          fx.decalBudget--;
          const list = fx.img.wallSplat[rag.blood];
          fx.decals.addWall(hit.line, hit.side, hit.x, hit.y, hit.z, list[(Math.random() * list.length) | 0], fx.partAt(hit.line, hit.side, hit.z), Math.min(1.2, 0.5 + hit.speed / 500));
        }
        if (hit.speed > 200 && fx.soundBudget > 0) {
          fx.soundBudget--;
          this.w.sound({ x: hit.x, y: hit.y, z: hit.z }, 'x_body_fall', { channel: 'body2', volume: Math.min(0.9, hit.speed / 400) });
        }
      }
      rag.impacts.length = 0;
      // Severed stumps pump blood for a while.
      if (rag.stumps.length && fx.gore) {
        for (const st of rag.stumps) {
          if (st.ttl <= 0 || st.body.removed) continue;
          st.ttl--;
          if (st.ttl & 1) continue;
          const p = st.body.point(st.local[0], st.local[1], st.local[2], [0, 0, 0]);
          const d = [0, 0, 0];
          const q = st.body.q;
          rotate(q, st.dir, d);
          fx.spray(p[0], p[1], p[2], Math.atan2(d[1], d[0]), Math.asin(Math.max(-1, Math.min(1, d[2]))), 1.6, 2.6, rag.blood, { cone: 0.5, vcone: 0.4, mist: false });
        }
        rag.stumps = rag.stumps.filter((s) => s.ttl > 0 && !s.body.removed);
      }
      // A pool of blood under the body once it has come to rest.
      if (rag.asleep && !rag.pooled) {
        rag.pooled = true;
        if (fx.gore && rag.blood !== 'fire' && !rag.fuzz) {
          const b = rag.bodies[0];
          fx.decals.addFlat(b.x[0], b.x[1], fx.img.splat[rag.blood][(Math.random() * 6) | 0], false, 0.7 + rag.model.mass / 40000);
        }
      }
    }
  }

  // Bodies glide back into the monster's standing pose.
  raisePose(rag, mo) {
    const R = rag.raise;
    const t = Math.min(1, R.t / R.dur);
    const e = t * t * (3 - 2 * t);
    const q0 = qFromAxisAngle(0, 0, 1, mo.angle);
    for (let i = 0; i < rag.bodies.length; i++) {
      const b = rag.bodies[i];
      const f = R.from[i];
      const c = b.part.com;
      const target = [0, 0, 0];
      rotate(q0, c, target);
      target[0] += mo.x; target[1] += mo.y; target[2] += mo.z + this.lift(mo, rag.model, mo.z);
      for (let k = 0; k < 3; k++) b.x[k] = f.x[k] + (target[k] - f.x[k]) * e;
      nlerpQ(f.q, q0, e, tmpQa);
      b.q.set(tmpQa);
      b.v.fill(0); b.w.fill(0);
    }
  }

  // --- Drawing -----------------------------------------------------------------------

  render(r, cam, frac) {
    if (!this.enabled || !this.ragdolls.size) return;
    const q = [0, 0, 0, 1];
    for (const rag of this.ragdolls.values()) {
      const a = rag.aabb;
      const cx = (a[0] + a[3]) / 2, cy = (a[1] + a[4]) / 2;
      const rad = Math.max(a[3] - a[0], a[4] - a[1]) / 2 + 8;
      if (!this.visible(cx, cy, rad)) continue;
      const model = rag.model;
      const mo = rag.mo;
      const e = mo && mo.ext;
      const alpha = e && e.fade !== undefined ? Math.max(0, e.fade) : 1;
      const flags = rag.fuzz ? VOX_FUZZ : 0;
      for (const b of rag.bodies) {
        if (b.removed) continue;
        const x = b.rx[0] + (b.x[0] - b.rx[0]) * frac;
        const y = b.rx[1] + (b.x[1] - b.rx[1]) * frac;
        const z = b.rx[2] + (b.x[2] - b.rx[2]) * frac;
        nlerpQ(b.rq, b.q, frac, q);
        poseMatrix(model, b.part.com, x, y, z, q, mat);
        const sec = b.sSector[0] || this.w.pointInSubsector(x, y).sector;
        if (!b.sSector[0]) b.sSector[0] = sec;
        r.voxels.add(model, mat, b.part.lo, b.part.hi, b.part.label, sec.lightlevel, flags, rag.severed[b.index], alpha, rag.bloodIndex);
      }
    }
  }
}

function rotate(q, v, out) {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const x = v[0], y = v[1], z = v[2];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + (qy * tz - qz * ty);
  out[1] = y + qw * ty + (qz * tx - qx * tz);
  out[2] = z + qw * tz + (qx * ty - qy * tx);
  return out;
}

// Does the ray reach the box within tMax?
function rayBox(x0, y0, z0, dx, dy, dz, a, tMax) {
  let t0 = 0, t1 = tMax;
  const o = [x0, y0, z0], d = [dx, dy, dz];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < a[k] || o[k] > a[k + 3]) return false; continue; }
    let ta = (a[k] - o[k]) / d[k], tb = (a[k + 3] - o[k]) / d[k];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

