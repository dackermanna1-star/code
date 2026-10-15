// Survivor bot AI. Produces the same `intent` the human player does.
import * as THREE from 'three';
import { SURVIVOR, WEAPONS, MELEE } from './config.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const TIER_SCORE = { pistol: 0, dual_pistols: 1, magnum: 2, smg: 10, smg_silenced: 11, pump_shotgun: 10, chrome_shotgun: 11, auto_shotgun: 20, spas: 21, m16: 22, ak47: 22, scar: 21, hunting_rifle: 19, sniper_military: 20 };
const REACT = { easy: 2.5, normal: 2.0, advanced: 1.0, expert: 0.5 };

export class BotController {
  constructor(world, survivor) {
    this.w = world; this.s = survivor;
    survivor.isBot = true; survivor.isPlayer = false; survivor.controller = this;
    this.yaw = survivor.yaw; this.pitch = 0;
    this.thinkT = Math.random() * 0.3;
    this.path = null; this.pathI = 0; this.goal = null; this.goalNode = -1; this.repathT = 0;
    this.target = null; this.targetT = 0; this.losCache = new Map();
    this.stuckT = 0; this.lastPos = survivor.body.pos.clone();
    this.mode = 'follow';
    this.useHold = false;
    this.pinnedSeen = new Map();
    this.aimErr = new THREE.Vector2();
    this.fireHold = 0;
    this.pref = survivor.def.prefers || ['rifle'];
  }

  get leader() {
    // follow the human; if the human is down/dead, follow the furthest-ahead healthy survivor
    const p = this.w.player;
    if (p && p.state === 'alive' && !p.pinnedBy) return p;
    let best = null, bp = -1;
    for (const o of this.w.survivors) if (o !== this.s && o.state === 'alive') { const pr = this.w.director.progressOf(o); if (pr > bp) { bp = pr; best = o; } }
    return best || p;
  }

  think(dt, it) {
    const s = this.s, w = this.w;
    it.attackPressed = false; it.attack2Pressed = false; it.usePressed = false; it.jump = false; it.reload = false; it.slot = -1; it.flashlight = false; it.cycle = 0; it.lastWeapon = false; it.drop = false;
    if (s.state === 'dead') return;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.25 + Math.random() * 0.1; this.decide(); }
    // combat aiming (every frame)
    this.combat(dt, it);
    // movement
    this.move(dt, it);
    it.yaw = this.yaw; it.pitch = this.pitch;
  }

  // ------------------------------------------------------------------ decisions
  decide() {
    const s = this.s, w = this.w;
    if (s.state !== 'alive' || s.pinnedBy) { this.mode = 'idle'; return; }
    // hopelessly separated from the leader for a while: regroup out of sight
    const Lg = this.leader;
    if (Lg && Lg !== s && !this.autopilot) {
      const far = Lg.body.pos.distanceTo(s.body.pos) > 22 || Math.abs(Lg.body.pos.y - s.body.pos.y) > 3;
      this.farT = far ? (this.farT || 0) + 0.3 : 0;
      if (this.farT > 9 && !this.visibleToPlayer() && this.mode !== 'revive' && this.mode !== 'rescue') { this.teleportNear(Lg); this.farT = 0; this.itemTarget = null; }
    }
    const threats = this.nearThreats(6);
    // 1. pinned teammates (after a reaction delay)
    let pinned = null, pd = Infinity;
    for (const o of w.survivors) {
      if (o === s || !o.pinnedBy || o.state === 'dead') { this.pinnedSeen.delete(o); continue; }
      if (!this.pinnedSeen.has(o)) this.pinnedSeen.set(o, w.time);
      if (w.time - this.pinnedSeen.get(o) < REACT[w.difficulty]) continue;
      const d = o.body.pos.distanceTo(s.body.pos);
      if (d < pd) { pd = d; pinned = o; }
    }
    if (pinned && !this.witchAngry()) { this.mode = 'rescue'; this.rescueTarget = pinned; this.setGoal(pinned.pinnedBy.position || pinned.body.pos, 1.2); return; }
    // 2. incapacitated / hanging teammates
    let down = null; pd = Infinity;
    for (const o of w.survivors) {
      if (o === s || !(o.state === 'incap' || o.state === 'ledge') || o.pinnedBy) continue;
      if (o.helper && o.helper !== s) continue;
      let d = o.body.pos.distanceTo(s.body.pos);
      if (o.isPlayer) d *= 0.5;
      if (d < pd) { pd = d; down = o; }
    }
    if (down && pd < 60) {
      this.mode = 'revive'; this.reviveTarget = down;
      const tp = down.state === 'ledge' && down.ledgePos ? down.ledgePos.top : down.body.pos;
      this.setGoal(tp, 0.9);
      return;
    }
    // 3. healing
    if (s.inv.kit === 'medkit') {
      const healThresh = s.inSaferoom ? (w.difficulty === 'expert' ? 40 : 75) : 30;
      if (s.total < healThresh && threats < 2 && !s.action) { this.mode = 'healself'; return; }
      for (const o of w.survivors) {
        if (o === s || o.state !== 'alive' || o.pinnedBy) continue;
        if (o.health + o.temp * 0.5 < 40 && !o.inv.kit && threats < 2 && o.body.pos.distanceTo(s.body.pos) < 25) { this.mode = 'healother'; this.healTarget = o; this.setGoal(o.body.pos, 1.0); return; }
      }
    }
    if (s.inv.pills && s.total <= 50 && s.total < 99) { this.mode = 'pills'; return; }
    if (s.inv.pills) {
      for (const o of w.survivors) if (o !== s && o.state === 'alive' && !o.inv.pills && o.total <= 50 && o.body.pos.distanceTo(s.body.pos) < 2.2) { this.mode = 'givepills'; this.healTarget = o; return; }
    }
    // 4. items worth grabbing nearby
    if (this.itemTarget && this.mode === 'item') {
      const tries = this.itemTries || (this.itemTries = new Map());
      const tt = (tries.get(this.itemTarget) || 0) + 0.3;
      tries.set(this.itemTarget, tt);
      if (tt > 6) { (this.badItems || (this.badItems = new Set())).add(this.itemTarget); this.itemTarget = null; }
    }
    const item = this.findItem();
    if (item && threats < 3) { this.mode = 'item'; this.itemTarget = item; this.setGoal(_v3.copy(item.pos).setY(item.pos.y - 1.0), 0.9); return; }
    // 5. follow the leader
    this.mode = 'follow';
    const L = this.leader;
    if (!L || L === s) { this.goal = null; return; }
    // gather zones (elevators etc.): pack in with the leader
    if (w.gatherZones) {
      for (const gz of w.gatherZones) {
        if (!gz.box.containsPoint(_v.set(L.body.pos.x, L.body.pos.y + 0.5, L.body.pos.z))) continue;
        const idx = w.survivors.filter((o) => o.isBot).indexOf(s);
        const pt = gz.points[(idx + 1) % gz.points.length];
        this.setGoal(pt, 0.35);
        return;
      }
    }
    const d = L.body.pos.distanceTo(s.body.pos);
    if (d > 4.5 || Math.abs(L.body.pos.y - s.body.pos.y) > 2 || this.path) {
      // formation slot behind / beside the leader (relative to the leader's facing)
      const idx = w.survivors.filter((o) => o.isBot && o !== L).indexOf(s);
      const fx = -Math.sin(L.yaw), fz = -Math.cos(L.yaw), rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
      const lat = [-1.4, 1.4, 0][idx % 3], back = [1.6, 1.6, 2.8][idx % 3];
      const slot = _v.set(L.body.pos.x - fx * back + rx * lat, L.body.pos.y, L.body.pos.z - fz * back + rz * lat);
      const sn = w.nav.nearest(slot.x, slot.y + 0.3, slot.z, 2);
      if (sn >= 0 && Math.abs(w.nav.y[sn] - L.body.pos.y) < 1.5 && w.nav.comp[sn] === w.nav.comp[w.nav.nearest(L.body.pos.x, L.body.pos.y + 0.3, L.body.pos.z, 2)]) slot.set(w.nav.x[sn], w.nav.y[sn], w.nav.z[sn]); else slot.copy(L.body.pos);
      if (d > 3.2 || slot.distanceTo(s.body.pos) > 2.5) this.setGoal(slot, 1.0); else this.goal = null;
    } else this.goal = null;
    // teleport if hopelessly far and unseen
    if (d > 45 && !this.visibleToPlayer()) this.teleportNear(L);
  }

  witchAngry() { return this.w.infected.some((z) => z.type === 'witch' && z.alive && z.startled && z.target === this.s); }
  nearThreats(r) {
    let n = 0;
    for (const z of this.w.infected) if (z.alive && (z.state === 'chase' || z.state === 'attack' || z.type !== 'common') && z.position.distanceToSquared(this.s.body.pos) < r * r) n++;
    return n;
  }
  visibleToPlayer() {
    const p = this.w.player; if (!p || p.state === 'dead') return false;
    const e = p.eyePos(_v);
    const to = _v2.copy(this.s.body.pos).add(_v3.set(0, 1, 0)).sub(e);
    const dir = p.aimDir(_v3);
    if (to.clone().normalize().dot(dir) < 0.5) return false;
    return !this.w.collision.blocked(e, _v2.copy(this.s.body.pos).add(_v3.set(0, 1, 0)), { dynamic: false });
  }
  teleportNear(L) {
    const w = this.w;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const n = w.nav.nearest(L.body.pos.x + Math.cos(a) * 3, L.body.pos.y + 0.3, L.body.pos.z + Math.sin(a) * 3, 2);
      if (n >= 0 && Math.abs(w.nav.y[n] - L.body.pos.y) < 1) {
        const p = _v.set(w.nav.x[n], w.nav.y[n] + 0.05, w.nav.z[n]);
        const e = w.player ? w.player.eyePos(_v2) : null;
        if (e && !w.collision.blocked(e, _v3.copy(p).setY(p.y + 1), { dynamic: false })) continue;
        this.s.body.pos.copy(p); this.s.body.vel.set(0, 0, 0); this.path = null;
        return;
      }
    }
  }

  findItem() {
    const s = this.s, w = this.w;
    let best = null, bs = 0;
    for (const p of w.pickups) {
      if (p.taken || (this.badItems && this.badItems.has(p))) continue;
      const d = p.pos.distanceTo(s.body.pos);
      if (d > 10 || Math.abs(p.pos.y - s.body.pos.y) > 2.5) continue;
      let score = 0;
      const id = p.id;
      if (WEAPONS[id] && WEAPONS[id].slot === 0 && TIER_SCORE[id] !== undefined) {
        const cur = s.inv.primary ? (TIER_SCORE[s.inv.primary.id] || 0) : -10;
        let val = TIER_SCORE[id];
        if (this.pref.some((k) => WEAPONS[id].kind === k)) val += 3;
        if (s.inv.primary && this.pref.some((k) => s.inv.primary.def.kind === k)) val -= 0;
        if (val > cur + 2) score = val - cur;
        if (s.inv.primary && s.inv.primary.id === id && s.inv.primary.reserve < s.inv.primary.def.reserve * 0.5) score = 5;
      } else if (id === 'pistol' && s.inv.secondary.id === 'pistol') score = 3;
      else if (id === 'magnum' && (s.inv.secondary.id === 'pistol' || s.inv.secondary.id === 'dual_pistols')) score = 4;
      else if (id === 'ammo_pile') { const pr = s.inv.primary; if (pr && pr.def.reserve !== Infinity && pr.reserve < pr.def.reserve * 0.6 && pr.id !== 'grenade_launcher') score = 8; }
      else if (id === 'medkit' && !s.inv.kit) score = 7;
      else if ((id === 'pills' || id === 'adrenaline') && !s.inv.pills) score = 6;
      else if (id === 'laser_sight' && s.inv.primary && !s.inv.primary.laser) score = 3;
      else if (id.endsWith('_deployed') && p.usable(s)) score = 3;
      if (!score) continue;
      score -= d * 0.3;
      if (score > bs && this.itemReachable(p)) { bs = score; best = p; }
    }
    return best;
  }

  /** Cached check: a walkable path to the floor beside the item, and a clear line to it. */
  itemReachable(p) {
    const w = this.w, s = this.s, nav = w.nav;
    const cache = this.reachCache || (this.reachCache = new Map());
    const c = cache.get(p);
    if (c && w.time - c.t < 10) return c.ok;
    let ok = false;
    const gn = nav.nearest(p.pos.x, p.pos.y - 0.7, p.pos.z, 3);
    const sn = nav.nearest(s.body.pos.x, s.body.pos.y + 0.3, s.body.pos.z, 3);
    if (gn >= 0 && sn >= 0 && Math.hypot(nav.x[gn] - p.pos.x, nav.z[gn] - p.pos.z) < 1.6 && Math.abs(nav.y[gn] - (p.pos.y - 0.2)) < 1.6) {
      const path = nav.path(sn, gn, false, 2.6, 6000);
      if (path) {
        const eye = new THREE.Vector3(nav.x[gn], nav.y[gn] + 1.5, nav.z[gn]);
        const tgt = p.focusPos();
        const dir = tgt.clone().sub(eye); const len = dir.length();
        const hit = w.collision.raycast(eye, dir.normalize(), Math.max(0, len - 0.35), { dynamic: false });
        ok = !hit;
      }
    }
    cache.set(p, { t: w.time, ok });
    return ok;
  }

  setGoal(pos, radius) {
    const w = this.w;
    const n = w.nav.nearest(pos.x, pos.y + 0.3, pos.z, 3);
    this.goalRadius = radius;
    if (!this.goal) this.goal = new THREE.Vector3();
    this.goal.copy(pos);
    if (n !== this.goalNode || !this.path || this.repathT <= 0) {
      this.goalNode = n;
      const sn = w.nav.nearest(this.s.body.pos.x, this.s.body.pos.y + 0.3, this.s.body.pos.z, 3);
      this.path = n >= 0 && sn >= 0 ? w.nav.path(sn, n, false, 2.6, 25000) : null;
      this.pathI = 0;
      this.repathT = 1.0;
    }
  }

  // ------------------------------------------------------------------ movement
  move(dt, it) {
    const s = this.s, w = this.w;
    this.repathT -= dt;
    it.moveX = 0; it.moveY = 0; it.walk = false; it.crouch = false;
    if (s.state !== 'alive' || s.pinnedBy) return;
    // timed actions
    it.use = false; it.attack2 = false;
    if (this.mode === 'revive' && this.reviveTarget) {
      const t = this.reviveTarget;
      const tp = t.state === 'ledge' && t.ledgePos ? t.ledgePos.top : t.body.pos;
      const d = Math.hypot(tp.x - s.body.pos.x, tp.z - s.body.pos.z);
      if (d < SURVIVOR.useRange - 0.6 && (t.state === 'incap' || t.state === 'ledge')) {
        this.lookAt(t.state === 'ledge' ? _v.copy(tp).setY(tp.y + 0.2) : t.center(_v), dt, 10);
        it.use = true;
        if (!s.action) it.usePressed = true;
        return;
      }
    }
    if (this.mode === 'healself' && s.inv.kit === 'medkit') {
      if (s.slot !== 3) it.slot = 3;
      else { it.attack = true; if (!s.action) it.attackPressed = true; }
      return;
    }
    if (this.mode === 'pills' && s.inv.pills) { if (s.slot !== 4) it.slot = 4; else it.attackPressed = true; return; }
    if (this.mode === 'givepills' && s.inv.pills && this.healTarget) {
      this.lookAt(this.healTarget.center(_v), dt, 10);
      if (s.slot !== 4) it.slot = 4; else if (this.aimedAt(this.healTarget.center(_v), 0.9)) it.attack2Pressed = true;
      return;
    }
    if (this.mode === 'healother' && this.healTarget) {
      const t = this.healTarget;
      if (t.body.pos.distanceTo(s.body.pos) < 1.8) {
        this.lookAt(t.center(_v), dt, 10);
        if (s.slot !== 3) it.slot = 3;
        else if (this.aimedAt(t.center(_v), 0.85)) { it.attack2 = true; if (!s.action) it.attack2Pressed = true; }
        return;
      }
    }
    if (this.mode === 'item' && this.itemTarget) {
      const p = this.itemTarget;
      if (p.taken) { this.mode = 'follow'; this.itemTarget = null; }
      else if (p.pos.distanceTo(s.body.pos) < 1.9) {
        this.lookAt(p.focusPos(), dt, 12);
        if (this.aimedAt(p.focusPos(), 0.9)) { it.usePressed = true; this.itemTarget = null; this.thinkT = 0.3; }
        return;
      }
    }
    if (s.action && s.action.type !== 'revive') { return; }
    // follow path
    if (!this.goal) { this.stuckT = 0; return; }
    const gd = Math.hypot(this.goal.x - s.body.pos.x, this.goal.z - s.body.pos.z);
    if (gd < this.goalRadius && Math.abs(this.goal.y - s.body.pos.y) < 1.5) { this.path = null; return; }
    let tx = this.goal.x, tz = this.goal.z;
    if (this.path && this.path.length) {
      const nav = w.nav;
      // advance waypoints we've reached (or can skip with a clear line)
      while (this.pathI < this.path.length - 1) {
        const n = this.path[this.pathI];
        const dd = Math.hypot(nav.x[n] - s.body.pos.x, nav.z[n] - s.body.pos.z);
        if (dd < 0.6) { this.pathI++; continue; }
        break;
      }
      // look ahead for smoothing
      let ai = this.pathI;
      for (let k = Math.min(this.path.length - 1, this.pathI + 6); k > this.pathI; k--) {
        const n = this.path[k];
        if (Math.abs(nav.y[n] - s.body.pos.y) < 0.6 && nav.walkable(s.body.pos.x, s.body.pos.y, s.body.pos.z, nav.x[n], nav.y[n], nav.z[n])) { ai = k; break; }
      }
      const n = this.path[ai];
      tx = nav.x[n]; tz = nav.z[n];
      // jump up onto ledges / counters along the path
      const nn = this.path[Math.min(this.path.length - 1, this.pathI + 1)];
      if (nav.y[nn] - s.body.pos.y > 0.4 && Math.hypot(nav.x[nn] - s.body.pos.x, nav.z[nn] - s.body.pos.z) < 1.3 && s.body.grounded) it.jump = true;
      if (this.pathI >= this.path.length - 1) { tx = this.goal.x; tz = this.goal.z; }
    }
    // doors in the way
    for (const d of w.doors) if (d.closed && !d.broken && !d.locked && d.center.distanceTo(s.body.pos) < 1.8 && d.type !== 'saferoom') { const dir = _v.set(tx - s.body.pos.x, 0, tz - s.body.pos.z).normalize(); if (_v2.copy(d.center).sub(s.body.pos).setY(0).normalize().dot(dir) > 0.5) d.open(s); }
    const dx = tx - s.body.pos.x, dz = tz - s.body.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    // world move dir -> intent relative to bot yaw
    const mx = dx / len, mz = dz / len;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let speedK = 1;
    const L = this.leader;
    if (this.mode === 'follow' && L && L.isPlayer && Math.hypot(L.body.vel.x, L.body.vel.z) < 2.5 && gd < 6) speedK = 0.45;
    it.moveY = (mx * fx + mz * fz) * speedK; it.moveX = (mx * rx + mz * rz) * speedK;
    it.walk = speedK < 0.6;
    if (!this.target) this.faceDir(mx, mz, dt, 4);
    // stuck detection
    const moved = this.lastPos.distanceTo(s.body.pos);
    this.lastPos.copy(s.body.pos);
    if (moved < 0.4 * dt && len > 0.5) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 0.8) { it.jump = true; this.repathT = 0; }
    if (this.stuckT > 4 && L && !this.visibleToPlayer()) { this.teleportNear(L); this.stuckT = 0; }
  }

  faceDir(x, z, dt, rate) {
    const tgt = Math.atan2(-x, -z);
    let d = Math.atan2(Math.sin(tgt - this.yaw), Math.cos(tgt - this.yaw));
    this.yaw += d * Math.min(1, rate * dt);
    this.pitch += (0 - this.pitch) * Math.min(1, rate * dt);
  }
  lookAt(p, dt, rate = 8) {
    const e = this.s.eyePos(_v3);
    const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
    const tyaw = Math.atan2(-dx, -dz);
    const tpitch = Math.atan2(dy, Math.hypot(dx, dz));
    const dyaw = Math.atan2(Math.sin(tyaw - this.yaw), Math.cos(tyaw - this.yaw));
    const k = Math.min(1, rate * dt);
    this.yaw += dyaw * k;
    this.pitch += (tpitch - this.pitch) * k;
    return Math.abs(dyaw) + Math.abs(tpitch - this.pitch);
  }
  aimedAt(p, cos = 0.97) {
    const e = this.s.eyePos(_v3); const d = _v2.copy(p).sub(e).normalize();
    return this.s.aimDir(_v).dot(d) > cos;
  }

  // ------------------------------------------------------------------ combat
  hasLOS(z) {
    const k = z.id;
    const c = this.losCache.get(k);
    const now = this.w.time;
    if (c && now - c.t < 0.3) return c.v;
    const v = !this.w.collision.blocked(this.s.eyePos(_v), z.center(_v2), { dynamic: false });
    this.losCache.set(k, { t: now, v });
    return v;
  }
  pickTarget() {
    const s = this.s, w = this.w;
    let best = null, bs = -Infinity;
    for (const z of w.infected) {
      if (!z.alive) continue;
      const d = z.position.distanceTo(s.body.pos);
      if (d > 35) continue;
      let score = -d;
      if (z.type === 'witch') { if (!z.startled) continue; score += 60; }
      else if (z.type === 'tank') { if (!z.aware && d > 12) continue; score += 25; }
      else if (z.type !== 'common') { score += 30; if (z.victim) score += 40; if (z.type === 'boomer' && d < 4) score -= 40; }
      else {
        if (z.state === 'idle' || z.state === 'wander') { if (d > 14) continue; score -= 10; }
        if (z.state === 'attack' && z.target === s) score += 15;
        else if (z.state === 'attack') score += 8;
        if (z.burning > 0) score -= 20;
      }
      if (this.rescueTarget && z === this.rescueTarget.pinnedBy) score += 100;
      if (score <= bs) continue;
      if (!this.hasLOS(z)) continue;
      bs = score; best = z;
    }
    return best;
  }
  combat(dt, it) {
    const s = this.s, w = this.w;
    it.attack = false;
    if (s.state === 'dead' || s.pinnedBy || s.state === 'ledge') return;
    if (s.action && s.action.type !== 'revive') return;
    if (w.noBotCombat) { this.target = null; return; }
    this.targetT -= dt;
    if (this.targetT <= 0 || (this.target && !this.target.alive)) {
      this.targetT = 0.2; this.target = this.pickTarget();
      if (this.target !== this.lastTarget) {
        this.lastTarget = this.target;
        this.aimErr.set((Math.random() - 0.5) * 0.07, (Math.random() - 0.5) * 0.06);
        this.headAim = Math.random() < 0.3;
        // reaction time before engaging a newly noticed threat
        const base = { easy: 0.7, normal: 0.45, advanced: 0.3, expert: 0.2 }[w.difficulty] || 0.45;
        this.acquireT = this.target ? (this.target.type === 'common' ? base * 0.6 : base) * (0.7 + Math.random() * 0.6) : 0;
      }
    }
    if (this.acquireT > 0) { this.acquireT -= dt; if (this.target) this.lookAt(this.target.center(_v), dt, 3); return; }
    const z = this.target;
    // weapon management
    const ws = s.activeWeapon;
    if (s.state === 'alive' && !s.inv.carry && !s.action) {
      if (this.mode !== 'healself' && this.mode !== 'pills' && this.mode !== 'givepills' && this.mode !== 'healother') {
        const want = s.inv.primary && (s.inv.primary.clip > 0 || s.inv.primary.reserve > 0) && !(s.inv.primary.def.kind === 'sniper' && z && z.position.distanceTo(s.body.pos) < 4) ? 0 : 1;
        if (s.slot !== want) it.slot = want;
      }
      if (ws && !ws.isMelee && ws.clip < ws.def.clip * 0.3 && ws.canReload && (!z || z.position.distanceTo(s.body.pos) > 8)) it.reload = true;
    }
    if (!z) return;
    const aimPt = z.alive ? (this.headAim && z.type !== 'tank' ? z.headPos(_v) : z.center(_v)) : z.center(_v);
    aimPt.x += this.aimErr.x * aimPt.distanceTo(s.body.pos); aimPt.y += this.aimErr.y * aimPt.distanceTo(s.body.pos);
    const err = this.lookAt(aimPt, dt, 9);
    const d = z.position.distanceTo(s.body.pos);
    // shove close commons / pinners
    if (d < 1.7 && (z.type === 'common' || z.victim && z.type !== 'charger' && z.type !== 'tank') && s.shoveCd <= 0 && Math.random() < 0.15) { it.attack2Pressed = true; return; }
    if (this.mode === 'rescue' && this.rescueTarget && this.rescueTarget.body.pos.distanceTo(s.body.pos) < 1.6 && s.shoveCd <= 0 && this.rescueTarget.pinnedBy && this.rescueTarget.pinnedBy.type !== 'charger') { this.lookAt(this.rescueTarget.center(_v2), dt, 12); it.attack2Pressed = true; }
    if (err < 0.08 || (d < 3 && err < 0.25)) {
      const w2 = s.activeWeapon;
      if (w2 && (w2.def.semi || w2.def.burst)) { this.fireHold -= dt; if (this.fireHold <= 0) { it.attackPressed = true; it.attack = true; this.fireHold = w2.def.cycle + 0.05 + Math.random() * 0.12; } }
      else it.attack = true;
      if (!it.attack && w2 && !w2.def.semi) it.attack = true;
    }
  }
}

/**
 * Autopilot for automated play-testing: drives the "player" survivor along the
 * survivor escape route, presses interactables it walks past, and fights like a bot.
 */
export class AutoPilot extends BotController {
  constructor(world, survivor) {
    super(world, survivor);
    survivor.isBot = false; survivor.isPlayer = true;
    this.autopilot = true;
    this.useT = 0;
  }
  get leader() { return this.s; }
  decide() {
    const s = this.s, w = this.w, nav = w.nav;
    if (s.state !== 'alive' || s.pinnedBy) { this.mode = 'idle'; return; }
    // rescue / revive like a bot (reuse base logic) but never "follow"
    const before = this.mode;
    super.decide();
    if (this.mode !== 'follow') return;
    this.mode = 'advance';
    const d = w.director;
    if (!d.escapeS) { d.escapeS = new Float32Array(nav.count); const goals = w.builder.markers.filter((m) => m.type === 'goal').map((m) => nav.nearest(m.pos.x, m.pos.y + 0.3, m.pos.z, 4)).filter((n) => n >= 0); nav.flowField(goals, d.escapeS, false, 1e6, 3, true); }
    // wait for stragglers
    const behind = w.survivors.filter((o) => o !== s && o.state === 'alive' && o.body.pos.distanceTo(s.body.pos) > 14);
    if (behind.length && Math.random() < 0.7) { this.goal = null; return; }
    let u = nav.nearest(s.body.pos.x, s.body.pos.y + 0.3, s.body.pos.z, 3);
    if (u < 0) return;
    if (w.autopilotTarget) { this.setGoal(w.autopilotTarget, 0.6); return; }
    for (let i = 0; i < 16; i++) { let v = -1, bv = d.escapeS[u]; for (let k = 0; k < 8; k++) { const n2 = nav.link[u * 8 + k]; if (n2 >= 0 && nav.traversable(u, k, false) && d.escapeS[n2] < bv) { bv = d.escapeS[n2]; v = n2; } } if (v < 0) { const vo = nav.vOut.get(u); if (vo && vo.length) v = vo[0].v; else break; } u = v; }
    this.setGoal(nav.pos(u), 0.6);
  }
  move(dt, it) {
    super.move(dt, it);
    const s = this.s, w = this.w;
    // press things in reach (doors in the way are handled in base move; buttons, pry, pour...)
    this.useT -= dt;
    if (this.useT <= 0 && s.state === 'alive' && !s.action) {
      this.useT = 0.6;
      for (const t of w.interactables) {
        if (!t.usable || !t.focusPos || !t.usable(s)) continue;
        const fp = t.focusPos();
        if (fp.distanceTo(s.eyePos(new THREE.Vector3())) < 2.3) {
          this.lookAt(fp, 1, 30);
          this.pendingUse = t; break;
        }
      }
    }
    if (this.pendingUse) {
      const fp = this.pendingUse.focusPos();
      this.lookAt(fp, dt, 20);
      if (this.aimedAt(fp, 0.95)) { it.usePressed = true; it.use = true; if (!this.pendingUse.holdTime || (s.action && s.action.t >= s.action.dur - 0.05) || !s.action && this.holdStarted) { this.pendingUse = null; this.holdStarted = false; } else this.holdStarted = true; }
      it.moveX = 0; it.moveY = 0;
    }
    for (const d of w.doors) if (d.closed && !d.broken && !d.locked && d.center.distanceTo(s.body.pos) < 2.0 && d.name !== 'endDoor') d.open(s);
    // close the end door behind us when everyone is in
    const endDoor = w.doors.find((d) => d.name === 'endDoor');
    if (endDoor && !endDoor.closed && s.inEndRoom && w.survivors.every((o) => o.state === 'dead' || o.inEndRoom)) endDoor.close(s);
  }
}
