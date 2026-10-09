// Combat: bullets, blows, blasts and fire, for everyone. The player, cops and
// gangsters all shoot through fire() - one code path - so a bullet is a bullet:
// it can hit a person (by body part; heads take triple), a vehicle (body,
// glass, a tyre, the fuel tank; whoever sits behind the glass), the world
// (dust and a hole, sparks off metal) or the sea. Rockets, grenades and
// molotovs fly as projectiles; explosions hurt and throw people (ragdolls),
// wreck vehicles (chain reactions) and knock over street furniture; fire burns.
// Every shot is heard ('noise') and, when it's you, it's a crime.
//
//   V.combat = new Combat()
//   fire(shooter, origin, dir, weaponId, o) -> first hit {kind:'ped'|'player'|'veh'|'world'|'water'|null, point, d, ...}
//        o: { muzzle (Vector3, where the flash and tracer start), spread (deg), skipVeh, dmgMult, silent, noTracer, suppressed }
//   fireAt(shooter, origin, target (Vector3), weaponId, o) -> hit    (o.error: aim error in degrees, for NPCs)
//   launch(shooter, origin, dir, weaponId, o)  rockets (dir), grenades and molotovs (o.vel: the throw, o.cooked: seconds held)
//   melee(attacker, weaponId, o) -> {target, part, dmg, down, killed} | {veh} | {wall} | null
//        o: { heavy, finisher, dir {x, z}, target, mult }     meleeTarget(attacker, weaponId, dir) -> {target, down, dist} | null
//   explode(pos, radius, dmg, attacker, o)   o: { vehicle (it's that vehicle blowing up), direct (who was hit square on), noFx, size }
//   burn(pos, radius, secs, attacker, dps)   a patch of fire on the ground (molotovs, spilt fuel)
//   trace(shooter, origin, dir, max, o) -> hit   (what a ray would hit; no damage)
//   update(dt)
// Victims get hit(dmg, part, dir, attacker, info) with info {bullet|melee|explosion|fire, weapon, force, point, heavy,
// stagger, knockdown} and, when thrown about, knock(vel, from). Dead bodies are shoved with push(dir, speed, part) if they have it.
// Events: 'noise' {pos, r, kind:'shot'|'explosion', src}, 'crime' {kind:'shots'|'assault'|'explosion', pos, by, victim},
// 'shot' {shooter, weapon, origin, dir, hit}, 'explosion' {pos, radius, attacker}.
import * as THREE from 'three';
import { V, K } from '../state.js';
import { WEAPONS, weapon } from './data.js';
import { playShot, playImpact } from '../../warzone/fx.js';
import { rocketModel, gunModel } from './models.js';

const _d = new THREE.Vector3(), _o = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3(), _u = new THREE.Vector3(), _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4(), _r = new THREE.Vector3(), _t = new THREE.Vector3();
const R = Math.random;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const COPS = (p) => p && (p.team === 'cops' || p.kind === 'cop' || p.kind === 'swat');

/** Turn a direction by a random angle within `deg` degrees (more often near the middle). */
export function spread(dir, deg) {
  if (!deg) return dir;
  const a = (deg * Math.PI / 180) * Math.sqrt(R()), t = R() * Math.PI * 2;
  _r.set(0, 1, 0); if (Math.abs(dir.y) > 0.95) _r.set(1, 0, 0);
  _r.crossVectors(dir, _r).normalize(); _t.crossVectors(_r, dir);
  const k = Math.tan(a);
  dir.addScaledVector(_r, Math.cos(t) * k).addScaledVector(_t, Math.sin(t) * k).normalize();
  return dir;
}

/** What a terrain hit is made of (the city's ground: streets, sand, lawns, mud). */
function groundMat(x, z) {
  const k = V.ground?.kindAt?.(x, z);
  return k === 1 || k === 2 ? 'sand' : k === 4 ? 'dirt' : k === 5 ? 'grass' : k === 3 ? 'sand' : 'asphalt';
}

// ---- small synths (heard through the audio system's panning) ----
function swish(c, out, t, K2) { const n = K2.noise(c); const f = K2.filt(c, 'bandpass', 900, 1.2); f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.12); const g = c.createGain(); K2.env(g, t, 0.03, 0.5, 0.12); K2.chain(n, f, g, out); n.start(t); n.stop(t + 0.22); }
function distantShot(c, out, t, K2) {
  const n = K2.noise(c, 'brown'); const g = c.createGain(); K2.env(g, t, 0.004, 1, 0.35);
  K2.chain(n, K2.filt(c, 'lowpass', 420), g, out); n.start(t); n.stop(t + 0.5);
  const e = K2.noise(c, 'pink'); const eg = c.createGain(); K2.env(eg, t + 0.12, 0.08, 0.25, 1.1); K2.chain(e, K2.filt(c, 'lowpass', 700), eg, out); e.start(t + 0.1); e.stop(t + 1.4);
}
function launchWhoosh(c, out, t, K2) {
  const n = K2.noise(c); const f = K2.filt(c, 'bandpass', 500, 0.8); f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1600, t + 0.5);
  const g = c.createGain(); K2.env(g, t, 0.01, 1, 0.9); K2.chain(n, f, g, out); n.start(t); n.stop(t + 1.1);
  const b = K2.noise(c, 'brown'); const bg = c.createGain(); K2.env(bg, t, 0.002, 1.2, 0.25); K2.chain(b, K2.filt(c, 'lowpass', 300), bg, out); b.start(t); b.stop(t + 0.4);
}
function clink(c, out, t, K2) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 1900 + R() * 900; const g = c.createGain(); K2.env(g, t, 0.001, 0.4, 0.09); K2.chain(o, g, out); o.start(t); o.stop(t + 0.12); }
function shatter(c, out, t, K2) { const n = K2.noise(c); const g = c.createGain(); K2.env(g, t, 0.001, 0.9, 0.3); K2.chain(n, K2.filt(c, 'highpass', 3000), g, out); n.start(t); n.stop(t + 0.4); }
function whoomp(c, out, t, K2) { const n = K2.noise(c, 'brown'); const f = K2.filt(c, 'lowpass', 300); f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.3); const g = c.createGain(); K2.env(g, t, 0.05, 1.2, 0.9); K2.chain(n, f, g, out); n.start(t); n.stop(t + 1.2); }

export class Combat {
  constructor() {
    this.projectiles = [];
    this.fires = [];
    this.noiseT = new WeakMap();   // shooter -> when it last made a 'noise' event (they're throttled)
    this.crimeT = 0;
    this.t = 0;
    this.impactT = 0;              // throttle for impact sounds
    this.rocketPool = [];
    this.WEAPONS = WEAPONS; // (NPC brains look their guns up here)
  }

  get stats() { return V.stats || (V.stats = {}); }

  // ---- hitscan -------------------------------------------------------------------------------------------------------------------------
  /** What a ray from origin along dir hits first (no damage). */
  trace(shooter, origin, dir, max = 400, o = {}) {
    const skipVeh = o.skipVeh || shooter?.vehicle || null;
    const sbox = shooter?.box || null;
    const hw = V.phys?.ray(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, max, { skip: (b) => b.vehicle || b === sbox || b.noShoot || (b.glass && b.brokenGlass) });
    let best = hw ? hw.d : max;
    const h = { kind: hw ? 'world' : null, d: best, point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), mat: null, box: null, ped: null, part: null, veh: null, vpart: null };
    if (hw) { h.point.set(hw.x, hw.y, hw.z); h.normal.set(hw.nx, hw.ny, hw.nz); h.box = hw.box; h.mat = hw.kind === 'terrain' ? groundMat(hw.x, hw.z) : hw.kind === 'deck' ? 'asphalt' : (hw.mat || 'concrete'); }
    // vehicles (more exact than their phys boxes)
    const hv = V.vehicles?.hitTest?.(origin, dir, best, skipVeh);
    if (hv && hv.d < best) { best = hv.d; h.kind = 'veh'; h.d = hv.d; h.point.copy(hv.point); h.normal.copy(hv.normal); h.veh = hv.veh; h.vpart = hv.part; }
    // people
    const hp = this._rayPeds(shooter, origin, dir, best);
    if (hp) { best = hp.d; h.kind = 'ped'; h.d = hp.d; h.point.copy(hp.point); h.normal.copy(dir).negate(); h.ped = hp.ped; h.part = hp.part || 'torso'; }
    // you (you're not in the crowd)
    const P = V.player;
    if (P && shooter !== P && !o.skipPlayer) {
      const r = this._rayPlayer(origin, dir, best);
      if (r) { best = r.d; h.kind = 'player'; h.d = r.d; h.point.copy(r.point); h.normal.copy(dir).negate(); h.ped = P; h.part = r.part; }
    }
    // the sea
    if (dir.y < -0.002 && origin.y > -0.5) {
      const t = (origin.y - 0.1) / -dir.y;
      if (t < best && t > 0) {
        const x = origin.x + dir.x * t, z = origin.z + dir.z * t;
        if (V.ground?.waterAt?.(x, z) === 0) { best = t; h.kind = 'water'; h.d = t; h.point.set(x, 0.1, z); h.normal.set(0, 1, 0); h.ped = null; h.veh = null; }
      }
    }
    if (!h.kind) h.point.copy(origin).addScaledVector(dir, max);
    return h;
  }
  _rayPeds(shooter, origin, dir, max) {
    const peds = V.peds;
    if (!peds?.ray) return null;
    const skip = (p) => p === shooter || p?.owner === shooter || p?.ped === shooter;
    let h = peds.ray(origin, dir, max, skip);
    // (if the crowd doesn't know who to skip, step past the shooter)
    if (h && h.ped === shooter) { _q.copy(h.point || origin).addScaledVector(dir, 0.2); const left = max - h.d - 0.2; h = left > 0 ? peds.ray(_q, dir, left, skip) : null; if (h) h.d += max - left; if (h?.ped === shooter) h = null; }
    if (h && !h.point) h.point = _q.copy(origin).addScaledVector(dir, h.d).clone();
    return h;
  }
  /** The player's figure: an upright capsule (lying down: a low one). */
  _rayPlayer(o, d, max) {
    const P = V.player;
    if (!P?.pos || P.vehicle || (P.dead && P.ragdoll)) return null;
    const down = P.ragdoll || P.dead;
    const r = down ? 1.6 : 1.15, y0 = P.pos.y + (down ? 0 : 0.2), y1 = P.pos.y + (down ? 1.8 : 5.15);
    const ox = o.x - P.pos.x, oz = o.z - P.pos.z;
    const a = d.x * d.x + d.z * d.z, b = 2 * (d.x * ox + d.z * oz), c = ox * ox + oz * oz - r * r;
    let t;
    if (a < 1e-6) { if (c > 0) return null; t = d.y < 0 ? (o.y - y1) / -d.y : (y0 - o.y) / d.y; }
    else {
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0) t = (-b + Math.sqrt(disc)) / (2 * a) > 0 && c < 0 ? 0 : -1;
    }
    if (t < 0 || t > max) return null;
    const y = o.y + d.y * t;
    if (y < y0 || y > y1) return null;
    const hx = o.x + d.x * t, hz = o.z + d.z * t;
    // which part: by height, and arms by the side you're hit from
    const rel = y - P.pos.y;
    let part = 'torso';
    if (down) part = 'torso';
    else if (rel > 4.05) part = 'head';
    else if (rel < 2.0) { const s = (hx - P.pos.x) * Math.cos(P.heading) - (hz - P.pos.z) * Math.sin(P.heading); part = s > 0 ? 'legL' : 'legR'; }
    else { const s = (hx - P.pos.x) * Math.cos(P.heading) - (hz - P.pos.z) * Math.sin(P.heading); if (Math.abs(s) > 0.95) part = s > 0 ? 'armL' : 'armR'; }
    return { d: t, point: new THREE.Vector3(hx, y, hz), part };
  }

  /** Shoot. Hitscan for bullets (with tracers), projectiles for rockets and thrown things. */
  fire(shooter, origin, dir, id = 'pistol', o = {}) {
    const w = weapon(id) || WEAPONS.pistol;
    if (w.projectile) return this.launch(shooter, origin, dir, w.id, o);
    if (w.melee) return this.melee(shooter, w.id, { dir });
    const isP = !!shooter?.isPlayer;
    const muzzle = o.muzzle || origin;
    const cam = V.world.camera.position;
    const camD = Math.abs(cam.x - muzzle.x) + Math.abs(cam.z - muzzle.z);
    if (!o.silent) {
      playShot(w.sound || 'pistol', isP ? null : muzzle, !!o.suppressed, isP);
      if (!isP && camD > 170) V.audio?.play?.(distantShot, muzzle, Math.min(0.9, 0.35 + (w.noise || 250) / 700), { ref: 220, max: 1100 });
    }
    _d.copy(dir).normalize();
    V.fx?.muzzle?.(muzzle, _d, { big: !!(w.pellets || (w.force || 0) > 20), small: !isP && camD > 260, light: isP || camD < 160, mine: isP });
    const n = w.pellets || 1;
    let first = null, hurt = null;
    for (let i = 0; i < n; i++) {
      _u.copy(_d);
      spread(_u, o.spread ?? 0);
      const h = this.trace(shooter, origin, _u, w.max || 300, o);
      const dmg = this._apply(shooter, w, h, _u, o, hurt || (n > 1 ? (hurt = new Map()) : null));
      if (!o.noTracer && (i < 2 || R() < 0.25)) {
        // tracers start at the muzzle (the bullet itself may come from the chest; the eye can't tell)
        V.fx?.tracer?.(muzzle, h.point, n > 1 ? { width: 0.05, len: 12 } : (w.dmg >= 60 ? { width: 0.1, len: 34 } : undefined));
      }
      if (!isP) this._whiz(muzzle, h.point, h.kind === 'player');
      if (!first) { first = h; first.dmg = dmg; }
    }
    // shotguns and heavy rounds can put people on the ground
    if (hurt) for (const [victim, total] of hurt) this._shove(victim, total, w, _d, shooter);
    else if (first && (first.kind === 'ped' || first.kind === 'player') && (w.force || 0) > 0) this._shove(first.ped, first.dmg || 0, w, _d, shooter);
    // heard all round; your shooting is a crime
    this._noise(shooter, muzzle, w.noise || 250, 'shot');
    if (isP) {
      this.stats.shots = (this.stats.shots || 0) + 1;
      if (this.t - this.crimeT > 0.6) { this.crimeT = this.t; V.events?.emit('crime', { kind: 'shots', pos: muzzle.clone(), by: shooter, victim: first?.ped || first?.veh || null }); }
    }
    V.events?.emit('shot', { shooter, weapon: w.id, origin: muzzle, dir: _d.clone(), hit: first });
    return first;
  }

  /** Shoot at a point (NPCs): the aim error is a cone of o.error degrees. */
  fireAt(shooter, origin, target, id = 'pistol', o = {}) {
    const dir = new THREE.Vector3().subVectors(target, origin).normalize();
    spread(dir, o.error ?? 0);
    return this.fire(shooter, origin, dir, id, o);
  }

  /** What one bullet does where it lands; returns the damage dealt to a person (0 otherwise). */
  _apply(shooter, w, h, dir, o, hurt) {
    const isP = !!shooter?.isPlayer;
    const fx = V.fx;
    // damage falls off with range (pellets more so)
    const rg = w.range || [80, 200];
    const fall = h.d <= rg[0] ? 1 : h.d >= rg[1] ? (w.pellets ? 0.12 : 0.45) : 1 - (1 - (w.pellets ? 0.12 : 0.45)) * (h.d - rg[0]) / (rg[1] - rg[0]);
    const base = w.dmg * fall * (o.dmgMult || 1);
    const cam = V.world.camera.position;
    const nearCam = Math.abs(cam.x - h.point.x) + Math.abs(cam.z - h.point.z) < 120;
    if (h.kind === 'ped' || h.kind === 'player') {
      const victim = h.ped;
      // (the victim's hit() applies the body part: peds x4 for heads, the player x1.6; a body just takes the push)
      if (victim.dead) {
        victim.hit?.(base, h.part, dir.clone(), shooter, { bullet: true, weapon: w.id, point: h.point.clone(), noBlood: true });
        fx?.blood?.(h.point, dir, { amount: 0.6 });
        return 0;
      }
      const head = h.part === 'head';
      const dmg = base;
      const alive = !victim.dead;
      victim.hit?.(dmg, h.part, dir.clone(), shooter, { bullet: true, weapon: w.id, force: (w.force || 8) * fall, point: h.point.clone(), noBlood: true, pellets: !!w.pellets });
      fx?.blood?.(h.point, dir, { head, heavy: dmg > 45, amount: w.pellets ? 0.55 : 1 });
      if (nearCam && this.t - this.impactT > 0.04) { this.impactT = this.t; V.audio?.flesh?.(h.point); }
      if (hurt) hurt.set(victim, (hurt.get(victim) || 0) + dmg);
      if (isP && victim !== shooter) {
        const killed = alive && victim.dead;
        V.hud?.hitmark?.(head || killed);
        V.audio?.hitmark?.(head);
        if (killed) this._kill(victim, head);
      }
      return dmg;
    }
    if (h.kind === 'veh') {
      const v = h.veh, part = h.vpart;
      v.damage?.(base * 1.15, h.point, dir, shooter, part);
      fx?.impact?.(h.point, h.normal, part === 'glass' ? 'glass' : 'metal', { dir, noHole: true });
      if (part !== 'glass' && part !== 'tyre') fx?.carHole?.(v, h.point, h.normal);
      // through the glass: whoever sits behind it
      if (part === 'glass' && R() < 0.45) {
        const who = this._occupant(v, h.point);
        if (who && who !== shooter && !who.dead) {
          const alive = !who.dead, head = R() < 0.35;
          who.hit?.(base * 0.8, head ? 'head' : 'torso', dir.clone(), shooter, { bullet: true, weapon: w.id, vehicle: v });
          if (isP) { V.hud?.hitmark?.(head); if (alive && who.dead) this._kill(who, head); }
        }
      }
      if (nearCam && this.t - this.impactT > 0.05) { this.impactT = this.t; playImpact('metal', h.point); }
      return 0;
    }
    if (h.kind === 'world') {
      fx?.impact?.(h.point, h.normal, h.mat, { dir });
      if (nearCam && this.t - this.impactT > 0.05) { this.impactT = this.t; playImpact(h.mat === 'metal' ? 'metal' : 'hard', h.point); }
      return 0;
    }
    if (h.kind === 'water') fx?.impact?.(h.point, h.normal, 'water', { dir });
    return 0;
  }
  /** Big hits put people down (a ragdoll with a push). */
  _shove(victim, dmg, w, dir, attacker) {
    if (!victim || victim.vehicle) return;
    const f = w.force || 0;
    if (victim.dead) { victim.push?.(dir, Math.min(40, 10 + f), 'torso'); return; }
    if (dmg < 34 && !(f >= 25 && dmg > 18)) return;
    const k = Math.min(1.4, dmg / 60) * (f ? 1 : 0.6);
    if (victim.isPlayer && dmg < 60) return; // you stay on your feet unless it's huge
    victim.knock?.(new THREE.Vector3(dir.x * (10 + f * k), 5 + 5 * k, dir.z * (10 + f * k)), attacker);
  }
  /** The seat nearest a point on a vehicle. */
  _occupant(v, p) {
    const seats = v.seats || [];
    let best = null, bd = Infinity;
    for (let i = 0; i < seats.length; i++) {
      const who = seats[i];
      if (!who) continue;
      if (v.seatWorld) { v.seatWorld(i, _m); _q.setFromMatrixPosition(_m); } else _q.copy(v.pos);
      const d = _q.distanceToSquared(p);
      if (d < bd) { bd = d; best = who; }
    }
    return best || v.driver || null;
  }
  /** A near miss past your head: the crack of it going by. */
  _whiz(a, b, hit) {
    if (hit || !V.player?.pos) return;
    const P = V.player.pos;
    _p.set(P.x, P.y + 4.5, P.z);
    _q.subVectors(b, a); const L = _q.length(); if (L < 1) return;
    _q.divideScalar(L);
    const t = clamp(_n.subVectors(_p, a).dot(_q), 0, L);
    _n.copy(a).addScaledVector(_q, t);
    if (t > 3 && _n.distanceToSquared(_p) < 25) { V.audio?.whiz?.(_n); V.weapons?.suppress?.(0.4); }
  }
  /** You killed someone (kills and cop kills are counted by the peds when they die; headshots here). */
  _kill(victim, head) {
    const S = this.stats;
    if (head) S.headshots = (S.headshots || 0) + 1;
    if (!V.peds?.spawn) { S.kills = (S.kills || 0) + 1; if (COPS(victim)) S.copKills = (S.copKills || 0) + 1; }
  }
  _noise(src, pos, r, kind) {
    const last = src ? this.noiseT.get(src) : undefined;
    if (last != null && this.t - last < 0.35) return;
    if (src) this.noiseT.set(src, this.t);
    V.events?.emit('noise', { pos: pos.clone(), r, kind, src });
  }

  // ---- melee ---------------------------------------------------------------------------------------------------------------------------
  /** Who a swing from `attacker` would land on: the nearest in reach and in front (dir: {x, z}, default the way they face). */
  meleeTarget(attacker, id = 'fists', dir = null) {
    const w = weapon(id) || WEAPONS.fists;
    const reach = w.reach || 4.4;
    const fx = dir ? dir.x : Math.sin(attacker.heading), fz = dir ? dir.z : Math.cos(attacker.heading);
    const fl = Math.hypot(fx, fz) || 1;
    const ax = attacker.pos.x, ay = attacker.pos.y, az = attacker.pos.z;
    const list = V.peds?.near?.(ax, az, reach + 3) || [];
    const P = V.player;
    let best = null, bs = Infinity, bdist = 0, bdown = false;
    const n = list.length + (P && attacker !== P ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const p = i < list.length ? list[i] : P;
      if (!p || p === attacker || !p.pos || p.vehicle) continue;
      const down = !!(p.ragdoll || p.down);
      if (p.dead && !down) continue;
      if (p.dead && p.ragdoll && !attacker.isPlayer) continue; // (NPCs don't kick corpses)
      const dx = p.pos.x - ax, dz = p.pos.z - az, dy = p.pos.y - ay, dist = Math.hypot(dx, dz);
      if (dist > reach + (down ? 1.5 : 1) || Math.abs(dy) > 3.5) continue;
      const along = (dx * fx + dz * fz) / (fl * Math.max(0.01, dist));
      if (along < 0.45 && dist > 1.8) continue;
      // nearest, preferring straight ahead; the living before the fallen
      const s = dist * (1.6 - along) + (down ? 2.5 : 0) + (p.dead ? 4 : 0);
      if (s < bs) { bs = s; best = p; bdist = dist; bdown = down; }
    }
    if (!best) return null;
    // a wall in between?
    const dx = best.pos.x - ax, dz = best.pos.z - az, L = Math.hypot(dx, dz);
    if (L > 1.2 && V.phys?.ray(ax, ay + 3, az, dx / L, 0, dz / L, L - 1, { terrain: false, skip: (b) => b.vehicle || b.kerb || b.noBlock })) return null;
    return { target: best, down: bdown, dist: bdist };
  }

  /** A swing (or kick, or stomp). o: { heavy, finisher, dir {x,z}, target (from meleeTarget), mult, part } */
  melee(attacker, id = 'fists', o = {}) {
    const w = (weapon(id)?.melee ? weapon(id) : null) || WEAPONS.fists;
    const heavy = !!o.heavy, fin = !!o.finisher;
    const fx = o.dir ? o.dir.x : Math.sin(attacker.heading), fz = o.dir ? o.dir.z : Math.cos(attacker.heading);
    const fl = Math.hypot(fx, fz) || 1;
    _d.set(fx / fl, 0, fz / fl);
    const isP = !!attacker?.isPlayer;
    const tg = o.target !== undefined ? (o.target ? { target: o.target, down: !!(o.target.ragdoll || o.target.down) } : null) : this.meleeTarget(attacker, id, _d);
    const chest = _o.set(attacker.pos.x, attacker.pos.y + 3.2, attacker.pos.z);
    if (tg && tg.target) {
      const t = tg.target, down = tg.down;
      const blunt = w.kind !== 'stab';
      let dmg = (heavy ? w.heavy : w.dmg) * (o.mult || 1) * (fin ? 1.35 : 1) * (down ? 1.3 : 1);
      const part = o.part || (down ? (R() < 0.3 ? 'head' : 'torso') : fin && blunt ? 'head' : 'torso');
      const hitY = down ? t.pos.y + 0.8 : t.pos.y + (part === 'head' ? 4.5 : 3.2);
      _p.set(t.pos.x - _d.x * 0.6, hitY, t.pos.z - _d.z * 0.6);
      const alive = !t.dead;
      const knock = !down && !t.dead && (heavy || fin || (w.kind === 'blunt' && R() < 0.6));
      t.hit?.(dmg, part, _d.clone(), attacker, { melee: true, weapon: w.id, heavy, stagger: !knock, knockdown: knock, knock, point: _p.clone(), noBlood: true });
      if (knock && !t.dead && !t.vehicle) {
        const k = heavy ? 1 : 0.7, kb = w.kind === 'blunt' ? 1.25 : w.kind === 'fist' ? 0.8 : 1;
        t.knock?.(new THREE.Vector3(_d.x * 22 * k * kb, 8 + 7 * k, _d.z * 22 * k * kb), attacker);
      }
      // blood: knives always; bats and fists when it's a big one
      if (w.kind === 'stab' || (heavy && w.kind === 'blunt') || fin || down || R() < 0.25) V.fx?.blood?.(_p, { x: _d.x, y: 0.15, z: _d.z }, { melee: true, heavy: heavy || w.kind === 'stab', amount: w.kind === 'stab' ? 1 : w.kind === 'blunt' ? 0.8 : 0.5, head: part === 'head' && w.kind !== 'fist' });
      if (w.kind === 'stab') V.audio?.flesh?.(_p); else V.audio?.punch?.(_p, heavy || fin || w.kind === 'blunt');
      if (isP) {
        V.cam?.shake?.(heavy || fin ? 0.55 : 0.28);
        V.audio?.hitmark?.(false);
        if (alive && t.dead) this._kill(t, part === 'head');
        // (assault is reported by whoever sees it: the peds)
      }
      return { target: t, part, dmg, down, killed: alive && !!t.dead };
    }
    // a vehicle in reach: dents (bats break glass)
    const hv = V.vehicles?.hitTest?.(chest, _d, w.reach || 4.4, attacker.vehicle || null);
    if (hv) {
      const amt = (heavy ? w.heavy : w.dmg) * (w.kind === 'blunt' ? 1.4 : 0.35);
      hv.veh.damage?.(amt, hv.point, _d, attacker, w.kind === 'blunt' && hv.part === 'glass' ? 'glass' : 'body');
      V.fx?.impact?.(hv.point, hv.normal, 'metal', { noHole: true });
      playImpact('metal', hv.point);
      V.audio?.punch?.(hv.point, true);
      if (isP) V.cam?.shake?.(0.3);
      return { veh: hv.veh };
    }
    // a wall
    const h = V.phys?.ray(chest.x, chest.y, chest.z, _d.x, 0, _d.z, w.reach || 4.4, { skip: (b) => b.vehicle || b.kerb });
    if (h) {
      _p.set(h.x, h.y, h.z); _n.set(h.nx, h.ny, h.nz);
      V.fx?.impact?.(_p, _n, h.mat || 'concrete', { noHole: true });
      playImpact(h.mat === 'metal' ? 'metal' : 'hard', _p);
      if (isP) V.cam?.shake?.(0.2);
      return { wall: h };
    }
    V.audio?.play?.(swish, chest, heavy ? 0.7 : 0.45, { ref: 6, max: 40 });
    return null;
  }

  // ---- explosions ------------------------------------------------------------------------------------------------------------------------
  /** A blast: people hurt and thrown (behind cover: less), vehicles damaged (and set off), street furniture knocked over. */
  explode(pos, radius = 26, dmg = 200, attacker = null, o = {}) {
    // (re-entrant: a car caught in the blast may blow up inside this call - so no shared temporaries here)
    const P = new THREE.Vector3(pos.x, pos.y, pos.z), dirv = new THREE.Vector3();
    const src = o.vehicle || null;
    const victims = [...(V.peds?.near?.(P.x, P.z, radius + 4) || [])];
    const pl = V.player;
    const n = victims.length + (pl ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const p = i < victims.length ? victims[i] : pl;
      if (!p?.pos || (i === victims.length && victims.includes(pl))) continue;
      if (src && p.vehicle === src) continue; // the vehicle sees to its own occupants
      const cx = p.pos.x, cy = p.pos.y + (p.ragdoll || p.dead ? 0.8 : 2.6), cz = p.pos.z;
      const dx = cx - P.x, dy = cy - P.y, dz = cz - P.z, dist = Math.hypot(dx, dy, dz);
      if (dist > radius) continue;
      let f = 1 - dist / radius;
      f = f * (0.6 + 0.4 * f);
      // behind a wall you're sheltered
      if (dist > 3 && !V.phys?.sees?.(P.x, P.y + 1.2, P.z, cx, cy, cz, { skip: (b) => b.vehicle || b.kerb || b.pole || b.prop })) f *= 0.3;
      if (p.vehicle) f *= p.vehicle.kind === 'bike' ? 0.9 : 0.25;
      const L = Math.max(0.5, Math.hypot(dx, dz));
      dirv.set(dx / L, 0.35, dz / L).normalize();
      if (p.dead) { if (p.push) p.push(dirv, 20 + 40 * f, 'torso'); else p.hit?.(1, 'torso', dirv.clone(), attacker, { explosion: true, noBlood: true }); continue; }
      const alive = !p.dead;
      const dd = dmg * f * (o.direct === p ? 2 : 1);
      p.hit?.(dd, 'torso', dirv.clone(), attacker, { explosion: true, force: 30 + 50 * f });
      if (!p.vehicle && f > 0.12) {
        const k = 26 + 52 * f;
        p.knock?.(new THREE.Vector3(dx / L * k, 16 + 30 * f, dz / L * k), attacker);
      }
      if (p.isPlayer) V.cam?.shake?.(1.5 * f + 0.5);
      if (attacker?.isPlayer && alive && p.dead && p !== attacker) this._kill(p, false);
    }
    // vehicles: a car blowing up has pushed the others itself; everything else does both
    if (src) {
      for (const v of V.vehicles?.list || []) {
        if (v === src || v.dead) continue;
        const c = v.com || v.pos, dist = Math.hypot(c.x - P.x, c.y - P.y, c.z - P.z), rr = v.def?.radius || 6;
        if (dist > radius + rr) continue;
        const f = clamp(1 - Math.max(0, dist - rr * 0.5) / radius, 0, 1);
        if (f > 0) v.damage?.(dmg * f * 4, c, null, attacker);
      }
    } else V.vehicles?.blast?.(P, radius, dmg, attacker, null, false);
    // street furniture goes over
    if (V.props?.knock && V.phys) {
      const r2 = radius * 0.55;
      const hit = [];
      V.phys.query(P.x - r2, P.z - r2, P.x + r2, P.z + r2, (b) => { if (b.prop && !b.knocked && Math.hypot(b.x - P.x, b.z - P.z) < r2) hit.push(b); });
      for (const b of hit) V.props.knock(b);
    }
    if (!o.noFx && !src) V.fx?.explosion?.(P, o.size ?? radius / 26);
    V.events?.emit('noise', { pos: P.clone(), r: 340, kind: 'explosion', src: src ? { isVehicleBoom: true, veh: src, by: attacker } : attacker });
    if (attacker?.isPlayer) V.events?.emit('crime', { kind: 'explosion', pos: P.clone(), by: attacker, victim: src });
    V.events?.emit('explosion', { pos: P.clone(), radius, attacker });
    V.traffic?.panic?.(P, radius * 8);
  }

  // ---- fire ------------------------------------------------------------------------------------------------------------------------------
  /** A patch of burning ground: hurts whoever stands in it, scorches cars. */
  burn(pos, radius = 9, secs = 9, attacker = null, dps = 22) {
    const f = { pos: pos.clone(), r: radius, t: 0, secs, attacker, dps, tick: 0, flames: [] };
    const g = V.phys ? V.phys.groundAt(pos.x, pos.y + 2, pos.z, 0.5, 4) : pos.y;
    const water = V.ground?.waterAt?.(pos.x, pos.z) === 0 && g < 0.3;
    if (water) { V.fx?.splash?.(pos, 0.6); return null; }
    // flames dotted round the patch
    const N = 5 + Math.round(radius / 3);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * 6.283 + R() * 0.6, r = i === 0 ? 0 : radius * (0.25 + R() * 0.65);
      const x = pos.x + Math.cos(a) * r, z = pos.z + Math.sin(a) * r;
      const y = V.phys ? V.phys.groundAt(x, g + 3, z, 0.4, 5) : g;
      f.flames.push(V.fx?.fire?.({ x, y: Number.isFinite(y) ? y : g, z }, 0.8 + R() * 0.7, secs * (0.75 + R() * 0.25)));
      V.fx?.decal?.({ x, y: (Number.isFinite(y) ? y : g) + 0.05, z }, { x: 0, y: 1, z: 0 }, 3 + R() * 3, 'scorch');
    }
    this.fires.push(f);
    V.audio?.play?.(whoomp, pos, 0.9, { ref: 14, max: 220 });
    V.events?.emit('noise', { pos: pos.clone(), r: 120, kind: 'explosion', src: { isVehicleBoom: true, by: attacker } });
    return f;
  }

  // ---- projectiles ---------------------------------------------------------------------------------------------------------------------
  /** Rockets fly straight; grenades and molotovs are thrown (o.vel, or along dir at the weapon's speed) and o.cooked is how long the pin's been out. */
  launch(shooter, origin, dir, id, o = {}) {
    const w = weapon(id);
    if (!w) return null;
    const isP = !!shooter?.isPlayer;
    _d.copy(dir).normalize();
    const p = { kind: w.projectile, w, shooter, pos: origin.clone(), vel: new THREE.Vector3(), t: 0, fuse: (w.fuse || 3) - (o.cooked || 0), mesh: null, rest: false, spin: new THREE.Vector3((R() - 0.5) * 18, (R() - 0.5) * 18, (R() - 0.5) * 18), bounces: 0, skipVeh: o.skipVeh || shooter?.vehicle || null };
    if (w.projectile === 'rocket') {
      p.vel.copy(_d).multiplyScalar(w.speed || 180);
      p.mesh = this.rocketPool.pop() || rocketModel();
      V.fx?.muzzle?.(origin, _d, { big: true });
      // the back-blast
      _p.copy(origin).addScaledVector(_d, -3);
      V.fx?.burst?.(_p, 8, { color: [0.75, 0.73, 0.7], speed: 14, dir: { x: -_d.x, y: -_d.y + 0.2, z: -_d.z }, spread: 0.5, life: 2, size: 1.2, grow: 4, grav: -1, drag: 2.2, alpha: 0.55 });
      V.audio?.play?.(launchWhoosh, isP ? null : origin, 0.9, { ref: 20, max: 300 });
      this._noise(shooter, origin, w.noise || 300, 'shot');
      if (isP) { this.stats.shots = (this.stats.shots || 0) + 1; V.events?.emit('crime', { kind: 'shots', pos: origin.clone(), by: shooter, victim: null }); }
    } else {
      if (o.vel) p.vel.copy(o.vel); else p.vel.copy(_d).multiplyScalar(w.speed || 60).addScaledVector(_up, 14);
      p.mesh = gunModel(id);
      if (p.fuse <= 0 && w.projectile === 'grenade') { this.explode(origin, w.radius, w.dmg, shooter); return p; }
    }
    p.mesh.position.copy(p.pos);
    V.world.scene.add(p.mesh);
    this.projectiles.push(p);
    V.events?.emit('shot', { shooter, weapon: w.id, origin, dir: _d.clone(), hit: null });
    return p;
  }

  _hitAlong(p, a, d, L) {
    // the first thing along a short segment: world, vehicles, people (not the thrower, early on)
    const sbox = p.shooter?.box || null;
    const hw = V.phys?.ray(a.x, a.y, a.z, d.x, d.y, d.z, L, { skip: (b) => b.vehicle || b === sbox || b.noShoot });
    let best = hw ? hw.d : L, res = hw ? { kind: 'world', d: hw.d, nx: hw.nx, ny: hw.ny, nz: hw.nz, mat: hw.mat } : null;
    const early = p.t < 0.25;
    const hv = V.vehicles?.hitTest?.(a, d, best, early ? p.skipVeh : null);
    if (hv && hv.d < best) { best = hv.d; res = { kind: 'veh', d: hv.d, nx: hv.normal.x, ny: hv.normal.y, nz: hv.normal.z, veh: hv.veh, part: hv.part }; }
    if (p.kind !== 'grenade') {
      const hp = this._rayPeds(early ? p.shooter : null, a, d, best);
      if (hp) { best = hp.d; res = { kind: 'ped', d: hp.d, nx: -d.x, ny: -d.y, nz: -d.z, ped: hp.ped }; }
      if (!(early && p.shooter === V.player)) { const r = this._rayPlayer(a, d, best); if (r) { best = r.d; res = { kind: 'ped', d: r.d, nx: -d.x, ny: -d.y, nz: -d.z, ped: V.player }; } }
    }
    // the sea
    const by = a.y + d.y * best;
    if (by < 0.1 && a.y >= 0.1 && d.y < 0) {
      const t = (a.y - 0.1) / -d.y, x = a.x + d.x * t, z = a.z + d.z * t;
      if (t <= best && V.ground?.waterAt?.(x, z) === 0) res = { kind: 'water', d: t, nx: 0, ny: 1, nz: 0 };
    }
    return res;
  }

  update(dt) {
    this.t += dt;
    if (dt <= 0) return;
    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      let done = false;
      if (p.kind === 'rocket') {
        const sp = p.vel.length();
        _d.copy(p.vel).divideScalar(sp);
        const L = sp * dt;
        const h = this._hitAlong(p, p.pos, _d, L);
        if (h) {
          _p.copy(p.pos).addScaledVector(_d, Math.max(0, h.d - 0.6));
          if (h.kind === 'veh') h.veh.damage?.(p.w.dmg * 2, _p, _d, p.shooter, h.part);
          if (h.kind === 'water') { V.fx?.splash?.(_p, 2.5); this.explode(_p, p.w.radius * 0.7, p.w.dmg * 0.6, p.shooter, { size: 0.7 }); } else this.explode(_p, p.w.radius, p.w.dmg, p.shooter, { direct: h.ped || null });
          done = true;
        } else {
          p.pos.addScaledVector(_d, L);
          // the exhaust (behind the rocket)
          _q.copy(p.pos).addScaledVector(_d, -2.2);
          V.fx?.trail?.(_q, _d);
          if (p.t > (p.w.max || 700) / sp) { this.explode(p.pos, p.w.radius, p.w.dmg, p.shooter); done = true; }
        }
        p.mesh.position.copy(p.pos);
        // (the rocket's nose is its -Z: Matrix4.lookAt puts -Z toward the target)
        _m.lookAt(_q.set(0, 0, 0), _d, _up); p.mesh.quaternion.setFromRotationMatrix(_m);
      } else {
        // thrown: fly, bounce, roll, then go off (grenade) or smash and burn (molotov)
        if (!p.rest) {
          p.vel.y -= K.G * dt;
          const sp = p.vel.length();
          if (sp > 1e-3) {
            _d.copy(p.vel).divideScalar(sp);
            const L = sp * dt;
            const h = this._hitAlong(p, p.pos, _d, L + 0.25);
            if (h && h.d <= L + 0.25) {
              _p.copy(p.pos).addScaledVector(_d, Math.max(0, h.d - 0.3));
              if (p.kind === 'molotov') {
                // smash
                V.fx?.glass?.(_p, _d, 0.5);
                V.audio?.play?.(shatter, _p, 0.7, { ref: 10, max: 120 });
                if (h.kind === 'water') V.fx?.splash?.(_p, 0.5); else this.burn(_p, p.w.radius, p.w.burn || 9, p.shooter, p.w.dmg);
                if (h.kind === 'ped' && !h.ped.dead) h.ped.hit?.(12, 'torso', _d.clone(), p.shooter, { fire: true });
                done = true;
              } else {
                // bounce off the surface
                p.pos.copy(_p);
                _n.set(h.nx, h.ny, h.nz);
                const vn = p.vel.dot(_n);
                if (vn < 0) p.vel.addScaledVector(_n, -1.4 * vn);
                p.vel.multiplyScalar(h.kind === 'veh' ? 0.5 : 0.6);
                p.spin.multiplyScalar(0.6);
                if (Math.abs(vn) > 8 && p.bounces++ < 6) V.audio?.play?.(clink, p.pos, 0.6, { ref: 8, max: 80 });
                if (h.kind === 'water') { V.fx?.splash?.(p.pos, 0.4); p.vel.multiplyScalar(0.2); }
                if (_n.y > 0.6 && p.vel.length() < 4) { p.rest = true; p.vel.set(0, 0, 0); }
              }
            } else p.pos.addScaledVector(_d, L);
          }
          p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt;
          if (p.pos.y < -40) done = true;
        }
        p.mesh.position.copy(p.pos);
        if (!done && p.kind === 'grenade') {
          p.fuse -= dt;
          if (p.fuse <= 0) {
            const wet = V.ground?.waterAt?.(p.pos.x, p.pos.z) === 0 && p.pos.y < 0.4;
            if (wet) V.fx?.splash?.(p.pos, 3);
            this.explode(_p.copy(p.pos).add(_q.set(0, 0.5, 0)), p.w.radius * (wet ? 0.6 : 1), p.w.dmg, p.shooter, wet ? { size: 0.6 } : {});
            done = true;
          }
        } else if (!done && p.kind === 'molotov' && p.rest) {
          this.burn(p.pos, p.w.radius, p.w.burn || 9, p.shooter, p.w.dmg); done = true;
        }
        if (!done && p.kind === 'molotov' && R() < dt * 30) V.fx?.burst?.(p.pos, 1, { color: [6, 2.6, 0.6], add: true, speed: 1, life: 0.25, size: 0.5, grow: -0.5, grav: -6, tile: 2 });
      }
      if (done || p.t > 20) {
        V.world.scene.remove(p.mesh);
        if (p.kind === 'rocket' && this.rocketPool.length < 6) this.rocketPool.push(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
    // fires on the ground
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt; f.tick += dt;
      if (f.t > f.secs) { this.fires.splice(i, 1); continue; }
      if (f.tick < 0.25) continue;
      const k = f.tick; f.tick = 0;
      const list = [...(V.peds?.near?.(f.pos.x, f.pos.z, f.r) || [])];
      const pl = V.player;
      const n = list.length + (pl ? 1 : 0);
      for (let j = 0; j < n; j++) {
        const p = j < list.length ? list[j] : pl;
        if (!p?.pos || p.dead || p.vehicle) continue;
        if (Math.hypot(p.pos.x - f.pos.x, p.pos.z - f.pos.z) > f.r || Math.abs(p.pos.y - f.pos.y) > 4) continue;
        p.hit?.(f.dps * k, 'legL', null, f.attacker, { fire: true });
        p.ignite?.(f.attacker);
      }
      for (const v of V.vehicles?.near?.(f.pos.x, f.pos.z, f.r + 4) || []) if (!v.dead) v.damage?.(40 * k, v.com || v.pos, null, f.attacker);
    }
  }

  /** Everything in flight and burning goes (respawn, mission reset). */
  clear() {
    for (const p of this.projectiles) V.world.scene.remove(p.mesh);
    this.projectiles.length = 0;
    for (const f of this.fires) for (const h of f.flames) h?.stop?.();
    this.fires.length = 0;
  }
}
