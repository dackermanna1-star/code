// Survivor bot AI. Produces the same command stream a human would: movement,
// aiming (with reaction time & error), firing with friendly-fire checks,
// shoving, reloading, reviving, rescuing pinned teammates, healing, sharing
// pills, picking up weapons/items, following the leader, respecting witches,
// kiting tanks, and falling back to chapter-progress navigation.
import * as THREE from 'three';
import { clamp, wrapAngle, randRange, rayCapsule } from '../core/math.js';
import { TIER1, TIER2 } from '../combat/weaponDefs.js';

const _e = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3();
const TIER = { pistol: 0, magnum: 0.5, smg: 1, silencedSmg: 1, pumpShotgun: 1, chromeShotgun: 1, rifle: 2, autoShotgun: 2, huntingRifle: 2, scar: 2, m60: 3, grenadeLauncher: 1.5 };

export class BotBrain {
  constructor(game, s, slotIndex) {
    this.game = game;
    this.s = s;
    this.idx = slotIndex;
    this.perceiveT = Math.random() * 0.2;
    this.target = null;
    this.targetT = 0;
    this.aimErr = new THREE.Vector3();
    this.path = null;
    this.pathGoal = new THREE.Vector3(1e9, 0, 0);
    this.pathT = 0;
    this.pathI = 0;
    this.goal = null;
    this.stuckT = 0;
    this.lastPos = new THREE.Vector3();
    this.lastPosT = 0;
    this.reaction = s.char.bot.reaction;
    this.aimSkill = s.char.bot.aim;
    this.mode = 'follow';
    this.itemT = 0;
    this.helping = null;
    this.spread = [[1.6, 1.4], [-1.6, 1.4], [0, 2.6]][slotIndex % 3];
    this.fireHold = 0;
    this.useHeld = false;
  }

  leader() {
    const g = this.game;
    const p = g.player;
    if (p && !p.dead && !p.incapped) return p;
    // otherwise the living bot furthest along the chapter leads
    let best = null, bp = -1;
    for (const o of g.survivors) {
      if (o.dead || o.incapped || o.pinned) continue;
      const pr = g.level.progressAt(o.pos.x, o.pos.y, o.pos.z);
      if (pr > bp) { bp = pr; best = o; }
    }
    return best;
  }

  perceive() {
    const g = this.game;
    const s = this.s;
    s.eye(_e);
    let best = null, bestScore = -1e9;
    const threats = [];
    const consider = (e, prio) => {
      if (e.dead || e.removed) return;
      const tx = e.pos.x, ty = e.pos.y + (e.special ? e.height * 0.55 : 1.2), tz = e.pos.z;
      const d = Math.hypot(tx - _e.x, ty - _e.y, tz - _e.z);
      if (d > 35) return;
      if (!g.level.col.lineOfSight(_e.x, _e.y, _e.z, tx, ty, tz)) return;
      threats.push(e);
      let score = prio - d * 1.5;
      if (e.target && e.target !== s && e.state === 3) score += 10; // attacking a teammate
      if (e.pinning) score += 60;
      if (e.kind === 'charger' && e.charging) score += 25; // drop it before it connects
      else if (e.kind === 'spitter') score += 12;
      else if (e.kind === 'jockey' && e.state === 'stalk' && d < 10) score += 15;
      if (e === this.target) score += 8; // stickiness
      if (e.kind === 'witch' && !e.enraged) score = -1e9;
      if (score > bestScore) { bestScore = score; best = e; }
    };
    g.infected.forEachNear(s.pos.x, s.pos.z, 30, (e) => {
      if (e.special) return;
      if (e.state === 0 && e.pos.distanceTo(s.pos) > 8) return; // ignore far idle commons
      consider(e, 20);
    });
    for (const sp of g.infected.specials) consider(sp, sp.kind === 'tank' ? 45 : sp.kind === 'witch' ? 70 : 35);
    this.threats = threats;
    if (best !== this.target) {
      this.target = best;
      this.targetT = 0;
      // aim error that shrinks while tracking
      const err = (1.2 - this.aimSkill * (g.difficulty.botAim ?? 1)) * 0.6;
      this.aimErr.set(randRange(-err, err), randRange(-err, err) * 0.6, randRange(-err, err));
    }
    // nearby commons count
    let close = 0;
    g.infected.forEachNear(s.pos.x, s.pos.z, 2.5, (e) => { if (!e.dead && !e.special && e.state !== 0) close++; });
    this.closeCount = close;
  }

  update(dt) {
    const g = this.game;
    const s = this.s;
    const c = s.cmd;
    c.mx = 0; c.my = 0; c.jump = false; c.crouch = false; c.sprint = false; c.fire = false; c.firePressed = false;
    c.shove = false; c.shoveHeld = false; c.reload = false; c.use = false; c.usePressed = false; c.zoom = false; c.slot = -1; c.lastWeapon = false; c.flashlight = false;
    if (s.dead || g.cheats?.botsIdle) return;
    this.perceiveT -= dt;
    if (this.perceiveT <= 0) { this.perceiveT = 0.15 + Math.random() * 0.1; this.perceive(); }
    this.targetT += dt;
    this.itemT -= dt;
    const L = this.leader();

    // flashlight etiquette near witch
    const witch = g.infected.specials.find((w) => w.kind === 'witch' && !w.dead && !w.enraged);
    const nearWitch = witch && witch.pos.distanceTo(s.pos) < 14;
    if (nearWitch === s.flashlight) c.flashlight = true;

    if (s.incapped) { this.combat(dt, true); return; }
    if (s.pinned) return;

    // ---- choose movement goal
    let goal = null, goalRadius = 1.2, urgent = false;
    const pinnedMate = g.survivors.find((o) => o !== s && !o.dead && o.pinned);
    const downMate = g.survivors.filter((o) => o !== s && !o.dead && o.incapped && !o.pinned).sort((a, b) => a.pos.distanceTo(s.pos) - b.pos.distanceTo(s.pos))[0];
    this.mode = 'follow';
    if (pinnedMate && pinnedMate.pinned) {
      const sp = pinnedMate.pinned;
      const md = pinnedMate.pos.distanceTo(s.pos);
      if (sp.shoveable && md < 12) { goal = pinnedMate.pos; goalRadius = 1.2; urgent = true; this.mode = 'rescue'; }
      else if (!sp.shoveable && md < 25) {
        // can't be shoved off (Charger): close to a clear firing range instead
        s.eye(_e);
        const los = g.level.col.lineOfSight(_e.x, _e.y, _e.z, sp.pos.x, sp.pos.y + 1.2, sp.pos.z);
        if (md > 7 || !los) { goal = pinnedMate.pos; goalRadius = los ? 6 : 2; urgent = true; this.mode = 'rescue'; }
      }
      if (sp && !sp.dead) this.target = sp;
    } else if (downMate && (this.closeCount < 4 || downMate.pos.distanceTo(s.pos) < 3) && !this.otherReviving(downMate)) {
      goal = downMate.pos; goalRadius = 1.1; urgent = true; this.mode = 'revive';
      if (downMate.pos.distanceTo(s.pos) < 1.6 && this.closeCount < 5) {
        this.face(downMate.pos.x, downMate.pos.y + 0.3, downMate.pos.z, dt, 8);
        if (!s.action) {
          s.startAction('revive', 5, { hold: 'use', immobile: true, target: downMate });
          downMate.beingRevived = s;
        }
        c.use = true;
        if (s.action && s.action.type === 'revive') return;
      }
    }
    if (s.action && s.action.type === 'revive' && this.mode !== 'revive') s.cancelAction();
    // Items
    if (!goal && this.itemT <= 0) { this.itemT = 0.8; this.itemGoal = this.findItem(); }
    if (!goal && this.itemGoal && !this.threatNear(4)) {
      const it = this.itemGoal;
      if (!it.taken && it.pos.distanceTo(s.pos) < 14) {
        goal = it.pos; goalRadius = 1.0; this.mode = 'item';
        if (it.pos.distanceTo(s.pos) < 1.6) { g.items.take(it, s); this.itemGoal = null; }
      } else this.itemGoal = null;
    }
    // Healing. Calm: nothing within 12 m. During sustained fights (finales,
    // crescendos) bots still pop pills and, when badly hurt, use a kit as soon
    // as nothing is in arm's reach.
    const calm = !this.threatNear(12);
    const clear = calm || !this.threatNear(4.5);
    if (!goal && !s.action && clear) {
      if (s.inv.medkit && s.health < 40 && (calm ? s.totalHealth < 40 : s.totalHealth < 25)) {
        if (s.slot !== 3) c.slot = 3; else c.fire = true;
        this.combat(dt, false, true);
        return;
      }
      if (s.inv.pills && s.totalHealth < 45) {
        if (s.slot !== 4) c.slot = 4; else c.firePressed = true;
      }
    }
    if (!goal && calm && !s.action) {
      // share pills
      if (s.inv.pills && s.totalHealth > 60) {
        const needy = g.survivors.find((o) => o !== s && !o.dead && !o.incapped && !o.inv.pills && o.totalHealth < 40 && o.pos.distanceTo(s.pos) < 2);
        if (needy) { needy.inv.pills = s.inv.pills; s.inv.pills = null; if (s.slot === 4) c.slot = s.bestSlot(); g.onGive?.(s, needy, 'pills'); }
      }
      // heal a badly hurt teammate if they have no kit
      if (s.inv.medkit && s.totalHealth > 50) {
        const mate = g.survivors.find((o) => o !== s && !o.dead && !o.incapped && !o.inv.medkit && o.health < 30 && o.pos.distanceTo(s.pos) < 6);
        if (mate) {
          goal = mate.pos; goalRadius = 1.2;
          if (mate.pos.distanceTo(s.pos) < 1.6) {
            if (s.slot !== 3) c.slot = 3;
            else { this.face(mate.pos.x, mate.pos.y + 1.2, mate.pos.z, dt, 8); c.shoveHeld = true; }
            this.combat(dt, false, true);
            return;
          }
        }
      }
    }
    // abort a heal when infected get into arm's reach (fight first)
    if (s.action && s.action.type === 'heal' && s.health > 12 && this.threatNear(2.2)) s.cancelAction();
    if (s.action && s.action.type === 'heal' && s.action.hold === 'fire') { c.fire = true; return; }
    if (s.action && s.action.type === 'heal' && s.action.hold === 'shove') { c.shoveHeld = true; return; }
    if (!goal && L && L !== s) {
      // formation around the leader
      const lf = new THREE.Vector3(-Math.sin(L.yaw), 0, -Math.cos(L.yaw));
      const lr = new THREE.Vector3(Math.cos(L.yaw), 0, -Math.sin(L.yaw));
      const d = s.pos.distanceTo(L.pos);
      const spot = _t.copy(L.pos).addScaledVector(lr, this.spread[0]).addScaledVector(lf, -this.spread[1]);
      goal = d > 4 || this.moving ? spot : null;
      goalRadius = d > 8 ? 2 : 1.2;
      urgent = d > 12;
      if (L.pos.distanceTo(s.pos) < 3.5 && !this.moving) goal = null;
    } else if (!goal && (!L || L === s)) {
      // lead: head for the exit along the progress field
      goal = this.exitGoal();
      goalRadius = 1;
    }
    // Tank: keep distance
    const tank = g.infected.specials.find((t) => t.kind === 'tank' && !t.dead);
    if (tank && tank.pos.distanceTo(s.pos) < 9) {
      _d.subVectors(s.pos, tank.pos).setY(0).normalize();
      goal = _t.copy(s.pos).addScaledVector(_d, 6);
      goalRadius = 0.5; urgent = true;
    }
    // Witch: never walk close
    if (nearWitch && goal && witch.pos.distanceTo(goal) < 6) goal = null;
    // Charger winding up / charging: sidestep out of its lane
    for (const ch of g.infected.specials) {
      if (ch.kind !== 'charger' || ch.dead || !ch.charging) continue;
      const fx = ch.state === 'charge' ? ch.chargeDir.x : -Math.sin(ch.yaw), fz = ch.state === 'charge' ? ch.chargeDir.z : -Math.cos(ch.yaw);
      const dx = s.pos.x - ch.pos.x, dz = s.pos.z - ch.pos.z;
      const along = dx * fx + dz * fz, side = -dx * fz + dz * fx;
      if (along > 0 && along < 20 && Math.abs(side) < 2.2) {
        const sg = side >= 0 ? 1 : -1;
        goal = _t.set(s.pos.x - fz * sg * 3.5, s.pos.y, s.pos.z + fx * sg * 3.5);
        goalRadius = 0.4; urgent = true; this.mode = 'dodge';
      }
    }
    // Spitter acid: get out of it, and never path into it
    const acid = g.acid;
    if (acid && acid.pools.length) {
      const here = acid.at(s.pos.x, s.pos.y, s.pos.z, 0.6);
      if (here) {
        let ex = s.pos.x - here.x, ez = s.pos.z - here.z;
        const el = Math.hypot(ex, ez);
        if (el < 0.3) { ex = goal ? goal.x - here.x : 1; ez = goal ? goal.z - here.z : 0; }
        const k = 1 / (Math.hypot(ex, ez) || 1);
        goal = _t.set(here.x + ex * k * (here.rMax + 1.5), s.pos.y, here.z + ez * k * (here.rMax + 1.5));
        goalRadius = 0.6; urgent = true; this.mode = 'acid';
      } else if (goal) {
        const p = acid.at(goal.x, goal.y, goal.z, 0.8);
        if (p) {
          let ex = goal.x - p.x, ez = goal.z - p.z;
          if (Math.hypot(ex, ez) < 0.3) { ex = s.pos.x - p.x; ez = s.pos.z - p.z; }
          const k = 1 / (Math.hypot(ex, ez) || 1);
          goal = _d.set(p.x + ex * k * (p.rMax + 1.2), goal.y, p.z + ez * k * (p.rMax + 1.2));
        }
      }
    }

    this.moving = !!goal;
    if (goal) this.moveTo(goal, goalRadius, dt, urgent);
    this.combat(dt, false);
    this.checkStuck(dt, !!goal, L);
  }

  otherReviving(t) {
    return t.beingRevived && t.beingRevived !== this.s;
  }
  threatNear(r) {
    const s = this.s;
    if (!this.threats) return false;
    for (const e of this.threats) if (!e.dead && e.pos.distanceTo(s.pos) < r && (e.state !== 0 || e.special)) return true;
    return false;
  }

  exitGoal() {
    const g = this.game;
    const nav = g.level.nav;
    const f = nav.fields.toExit;
    const s = this.s;
    if (!f) return null;
    const n = nav.nearestNode(s.pos.x, s.pos.y, s.pos.z, 2);
    if (n < 0) return null;
    let cur = n;
    for (let k = 0; k < 16; k++) {
      const nx = nav.descend(f, cur);
      if (nx < 0) break;
      cur = nx;
    }
    if (cur === n) return null;
    return new THREE.Vector3(nav.nodeX(cur), nav.nodeY[cur], nav.nodeZ(cur));
  }

  findItem() {
    const g = this.game;
    const s = this.s;
    let best = null, bs = 0;
    for (const it of g.items.near(s.pos, 12)) {
      if (it.taken) continue;
      if (Math.abs(it.pos.y - s.pos.y) > 1.6) continue; // other floor: not reachable directly
      let v = 0;
      const t = it.type;
      if (TIER[t] != null && t !== 'pistol') {
        const cur = s.inv.primary ? TIER[s.inv.primary.type] ?? 1 : 0;
        const pref = s.char.bot.preferred.includes(t) ? 0.3 : 0;
        if (TIER[t] + pref > cur + 0.2 && t !== 'grenadeLauncher' && t !== 'm60') v = 5 + TIER[t];
      } else if (t === 'pistol' && !s.inv.secondary.dual && s.inv.secondary.type === 'pistol') v = 3;
      else if (t === 'ammo' && s.inv.primary && s.inv.primary.reserve < s.inv.primary.def.reserve * 0.5) v = 6;
      else if (t === 'medkit' && !s.inv.medkit) v = 7;
      else if (t === 'pills' && !s.inv.pills) v = 5;
      else if ((t === 'molotov' || t === 'pipebomb' || t === 'bile') && !s.inv.throwable) v = 3;
      // don't grab if the human is right next to it and lacks it (be polite)
      const p = g.player;
      if (v > 0 && p && !p.dead && p.pos.distanceTo(it.pos) < 2.5 && p.pos.distanceTo(it.pos) < s.pos.distanceTo(it.pos)) v *= 0.3;
      v -= it.pos.distanceTo(s.pos) * 0.3;
      if (v > bs) { bs = v; best = it; }
    }
    return best;
  }

  moveTo(goal, radius, dt, urgent) {
    const g = this.game;
    const s = this.s;
    const nav = g.level.nav;
    // goals hanging off an edge (formation offsets beside a scaffold, a ledge)
    // are snapped onto the nearest walkable node so bots don't walk off
    const gn = nav.nodeAt(goal.x, goal.y, goal.z);
    if (gn < 0 || Math.abs(nav.nodeY[gn] - goal.y) > 0.8) {
      const m = nav.nearestNode(goal.x, goal.y, goal.z, 3);
      if (m >= 0) goal = (this._snapGoal || (this._snapGoal = new THREE.Vector3())).set(nav.nodeX(m), nav.nodeY[m], nav.nodeZ(m));
    }
    const dist = Math.hypot(goal.x - s.pos.x, goal.z - s.pos.z);
    if (dist < radius && Math.abs(goal.y - s.pos.y) < 1.5) { this.path = null; return; }
    this.pathT -= dt;
    if (!this.path || this.pathT <= 0 || this.pathGoal.distanceTo(goal) > 2) {
      this.pathT = 0.8 + Math.random() * 0.4;
      this.pathGoal.copy(goal);
      this.path = nav.findPath(s.pos.x, s.pos.y, s.pos.z, goal.x, goal.y, goal.z, 12000);
      this.pathI = 0;
    }
    let tx = goal.x, tz = goal.z;
    if (this.path && this.path.length > 1) {
      // advance along path; look ahead for straight-line shortcut
      while (this.pathI < this.path.length - 1) {
        const n = this.path[this.pathI];
        const d = Math.hypot(nav.nodeX(n) - s.pos.x, nav.nodeZ(n) - s.pos.z);
        if (d < 0.6 && Math.abs(nav.nodeY[n] - s.pos.y) < 1.2) this.pathI++;
        else break;
      }
      let best = this.pathI;
      for (let k = Math.min(this.path.length - 1, this.pathI + 10); k > this.pathI; k--) {
        const n = this.path[k];
        if (nav.walkable(s.pos.x, s.pos.y, s.pos.z, nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n))) { best = k; break; }
      }
      this.pathI = best;
      const n = this.path[best];
      tx = nav.nodeX(n); tz = nav.nodeZ(n);
      // next node is a drop below us and we're already over it: keep walking
      // along the drop direction instead of hovering on the lip
      if (s.pos.y - nav.nodeY[n] > 1.0 && Math.hypot(tx - s.pos.x, tz - s.pos.z) < 0.8 && best > 0) {
        const p = this.path[best - 1];
        const ddx = tx - nav.nodeX(p), ddz = tz - nav.nodeZ(p);
        const dd = Math.hypot(ddx, ddz);
        if (dd > 0.1) { tx += ddx / dd * 0.8; tz += ddz / dd * 0.8; }
      }
      // doors on the way
      const door = g.level.doors.find((d) => !d.open && !d.broken && Math.hypot(d.cx - s.pos.x, d.cz - s.pos.z) < 1.8 && Math.abs(d.cy - s.pos.y) < 2);
      if (door && door.canUse(s)) door.use(s);
    }
    const dx = tx - s.pos.x, dz = tz - s.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    // convert world dir to local move axes relative to current yaw
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
    const wx = dx / dl, wz = dz / dl;
    s.cmd.my = wx * fx + wz * fz;
    s.cmd.mx = wx * rx + wz * rz;
    const far = dist > 10 || urgent;
    if (far && !this.target && s.cmd.my > 0.7 && s.totalHealth > 40) s.cmd.sprint = true;
    // face movement when nothing to shoot
    if (!this.target || this.target.dead) this.face(s.pos.x + wx * 5, s.pos.y + 1.5, s.pos.z + wz * 5, dt, 4);
  }

  face(x, y, z, dt, rate) {
    const s = this.s;
    s.eye(_e);
    const dx = x - _e.x, dy = y - _e.y, dz = z - _e.z;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const dyaw = wrapAngle(yaw - s.yaw);
    const k = Math.min(1, rate * dt);
    s.yaw += dyaw * k;
    s.pitch += (pitch - s.pitch) * k;
    return Math.abs(dyaw) + Math.abs(pitch - s.pitch);
  }

  combat(dt, incapped, healing = false) {
    const g = this.game;
    const s = this.s;
    const c = s.cmd;
    const t = this.target;
    const w = s.weapon;
    // weapon choice
    if (!incapped && !healing && !s.action) {
      if (s.slot > 1) { if (!(s.slot === 3 && s.inv.medkit && s.totalHealth < 40) && !(s.slot === 4 && s.inv.pills)) c.slot = s.bestSlot(); }
      else if (s.slot === 1 && s.inv.primary && (s.inv.primary.clip > 0 || s.inv.primary.reserve > 0) && !s.inv.secondary.melee) c.slot = 0;
      else if (s.slot === 0 && s.inv.primary && s.inv.primary.clip === 0 && s.inv.primary.reserve === 0) c.slot = 1;
    }
    if (healing) return;
    if (!t || t.dead || t.removed) {
      if (w && w.clip < w.maxClip * 0.5 && w.reserve > 0 && !w.reloading) c.reload = true;
      return;
    }
    // aim point
    const b = t.body;
    let ax, ay, az;
    if (b && !t.special && Math.random() < 0.7) { ax = b.jx(2); ay = b.jy(2); az = b.jz(2); }
    else if (b) { ax = (b.jx(0) + b.jx(1)) / 2; ay = (b.jy(0) + b.jy(1)) / 2; az = (b.jz(0) + b.jz(1)) / 2; }
    else { ax = t.pos.x; ay = t.pos.y + 1.2; az = t.pos.z; }
    // lead moving targets a little
    ax += (t.vel?.x || 0) * 0.08; az += (t.vel?.z || 0) * 0.08;
    const errK = Math.max(0.15, 1 - this.targetT * 1.5);
    const dist = Math.hypot(ax - s.pos.x, az - s.pos.z);
    ax += this.aimErr.x * errK * (0.3 + dist * 0.03);
    ay += this.aimErr.y * errK * (0.3 + dist * 0.03);
    az += this.aimErr.z * errK * (0.3 + dist * 0.03);
    const off = this.face(ax, ay, az, dt, 10 + this.aimSkill * 8);
    if (this.targetT < this.reaction) return;
    // shove if close commons (or pinned teammate)
    if (!incapped && !t.special && dist < 1.3 && this.closeCount >= 1 && s.shoveFatigue < 3) { c.shove = true; }
    if (t.special && t.pinning && t.pinning.pos.distanceTo(s.pos) < 1.8 && t.shoveable) c.shove = true;
    if (!w) return;
    if (w.clip === 0) { if (w.reserve > 0) c.reload = true; else if (s.slot === 0) c.slot = 1; return; }
    // friendly fire check
    s.eye(_e);
    _d.set(ax - _e.x, ay - _e.y, az - _e.z);
    const tl = _d.length();
    _d.divideScalar(tl);
    for (const o of g.survivors) {
      if (o === s || o.dead) continue;
      const tt = rayCapsule(_e.x, _e.y, _e.z, _d.x, _d.y, _d.z, o.pos.x, o.pos.y + 0.2, o.pos.z, o.pos.x, o.pos.y + 1.8, o.pos.z, 0.45);
      if (tt >= 0 && tt < tl) { // teammate in the way: sidestep
        c.mx = this.idx % 2 ? 1 : -1;
        return;
      }
    }
    if (off < 0.25) {
      const def = w.def;
      if (def.melee) { if (dist < def.range) c.fire = true; }
      else if (def.auto) {
        // burst control
        this.fireHold += dt;
        c.fire = this.fireHold < 0.6 || dist < 6;
        if (this.fireHold > 0.8) this.fireHold = 0;
      } else {
        c.firePressed = w.cool <= 0 && Math.random() < 0.8;
      }
    }
  }

  checkStuck(dt, wantMove, L) {
    const g = this.game;
    const s = this.s;
    this.lastPosT += dt;
    if (this.lastPosT > 1.2) {
      const moved = this.lastPos.distanceTo(s.pos);
      if (wantMove && moved < 0.35) this.stuckT += this.lastPosT;
      else this.stuckT = 0;
      this.lastPos.copy(s.pos);
      this.lastPosT = 0;
      if (this.stuckT > 1.5) s.cmd.jump = true;
      if (this.stuckT > 2.5) this.path = null;
      // teleport to leader if hopelessly stuck and out of the human's view
      if (this.stuckT > 6 && L && L !== s && L.pos.distanceTo(s.pos) > 6) {
        const p = g.player;
        const seen = p && !p.dead && g.level.col.lineOfSight(p.pos.x, p.pos.y + 1.6, p.pos.z, s.pos.x, s.pos.y + 1.2, s.pos.z);
        if (!seen) {
          s.teleport(L.pos.x - Math.sin(L.yaw) * -1.5, L.pos.y + 0.05, L.pos.z - Math.cos(L.yaw) * -1.5, L.yaw);
          this.stuckT = 0;
        }
      }
    }
  }
}
