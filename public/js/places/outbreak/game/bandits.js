// Bandits: survivors who decided everyone else is prey. They keep camps in
// the woods (four of them), and squads of two to four walk the roads between
// towns. They see further than the infected and they shoot back. Once one has
// spotted you, they all know where you are: they spread out into cover,
// crouch behind it and pop up to fire in bursts, one of them circles round
// your flank, they reload behind cover, back off when they're hurt, and when
// it's over they go through the pockets of whoever's lying there.
import * as THREE from 'three';
import { O } from '../state.js';
import { BANDIT_OUTFITS } from './humanoid.js';
import { makeItem, def } from './inventory.js';
import { ITEMS } from './items.js';
import { buildGun } from '../../warzone/guns.js';
import { playShot } from '../../warzone/fx.js';
import { spread } from './combat.js';

const TAU = Math.PI * 2;
const LOADOUTS = [
  { gun: 'akm', w: 4 }, { gun: 'remington', w: 2 }, { gun: 'makarov', w: 2 }, { gun: 'mp5', w: 1.5 }, { gun: 'm4', w: 1 }, { gun: 'm24', w: 0.5 },
];
let bid = 1;

class Bandit {
  constructor(x, y, z, squad) {
    this.id = bid++;
    this.squad = squad;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * TAU; this.pitch = 0;
    this.hp = 100;
    this.armor = Math.random() < 0.4 ? 0.3 : 0;
    this.state = 'patrol';
    this.crouch = 0; this.wantCrouch = false;
    this.grounded = true;
    // a gun and what goes with it
    let t = 0; for (const l of LOADOUTS) t += l.w;
    let r = Math.random() * t; let gun = 'akm'; for (const l of LOADOUTS) { r -= l.w; if (r <= 0) { gun = l.gun; break; } }
    this.gunId = gun; this.gd = ITEMS[gun];
    this.mag = this.gd.internal || ITEMS[this.gd.mag].cap;
    this.ammo = this.mag; this.reserve = this.mag * (2 + Math.floor(Math.random() * 3));
    this.skill = 0.6 + Math.random() * 0.6; // lower is better
    this.cool = 0; this.burst = 0; this.reloadT = 0;
    this.react = 0;
    this.phase = Math.random() * TAU;
    this.stuckT = 0; this.lastD = 1e9; this.detour = 0;
    this.dead = false; this.deadT = 0;
    this.outfit = BANDIT_OUTFITS()[Math.floor(Math.random() * BANDIT_OUTFITS().length)];
    this.person = { x, y, z, yaw: this.yaw, outfit: this.outfit, scale: 0.98 + Math.random() * 0.06, pose: { arms: 'aim', walk: 0, stride: 0 }, owner: this };
    this.model = null;
    this.speakT = 5 + Math.random() * 10;
  }
  get alive() { return !this.dead; }
  hit(dmg, part, dir, by, o = {}) {
    if (this.dead) return;
    const armor = part === 'torso' ? this.armor * (1 - (o.pierce || 0)) : 0;
    this.hp -= dmg * (1 - armor);
    this.person.flash = 1;
    this.suppressed = 2;
    if (this.hp <= 0) { this.die(dir, by); return; }
    // they know where it came from
    if (by?.pos && by.squad !== this.squad) { if (by.squad || by === O.player) this.squad.spot(by, this); else this.zTarget = by; this.hurtT = 3; }
    if (this.hp < 35 && Math.random() < 0.6) this.retreat = 8;
    O.audio?.voice('hurt', this.pos);
  }
  die(dir, by) {
    this.dead = true; this.deadT = 0; this.state = 'dead';
    const fwd = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    this.person.pose.fallDir = dir && (dir.x * fwd.x + dir.z * fwd.z) > 0 ? -1 : 1;
    if (by === O.player) O.stats.bandits++;
    O.audio?.voice('die', this.pos);
    // what they carried
    const items = [];
    const g = makeItem(this.gunId, { cond: 0.35 + Math.random() * 0.5 });
    const gd = this.gd;
    if (gd.mag) g.mag = makeItem(gd.mag, { n: Math.max(0, this.ammo) }); else g.rounds = Math.max(0, Math.min(gd.internal, this.ammo));
    items.push(g);
    const ammoId = 'ammo' + gd.cal.replace(/[^0-9a-z]/gi, '');
    if (this.reserve > 0 && ITEMS[ammoId]) items.push(makeItem(ammoId, { n: Math.min(ITEMS[ammoId].stack, Math.round(this.reserve * 0.6)) }));
    if (gd.mag && Math.random() < 0.6) items.push(makeItem(gd.mag, { n: Math.floor(ITEMS[gd.mag].cap * Math.random()) }));
    for (const id of ['bandage', 'tushonka', 'water', 'vodka', 'morphine', 'beans', 'rag']) if (Math.random() < 0.22) items.push(makeItem(id));
    if (this.armor > 0 && Math.random() < 0.7) items.push(makeItem(Math.random() < 0.3 ? 'plateCarrier' : 'policeVest', { cond: 0.3 + Math.random() * 0.4 }));
    if (Math.random() < 0.25) items.push(makeItem(Math.random() < 0.5 ? 'huntingPack' : 'chestRig', { cond: 0.5 + Math.random() * 0.4 }));
    O.bodies.add({ x: this.pos.x, y: this.pos.y, z: this.pos.z, name: 'Bandit', items, person: this.person, owner: this, t: 0, life: 600 });
    if (this.model) this.model.visible = false;
  }
}

class Squad {
  constructor(home, kind) {
    this.home = home; this.kind = kind; // 'camp' | 'roam'
    this.members = [];
    this.target = null; this.lastSeen = null; this.alertT = 0;
    this.route = null; this.wp = 0;
  }
  get alive() { return this.members.filter((m) => !m.dead); }
  spot(who, by) {
    if (!this.target) O.audio?.voice('spot', by.pos);
    this.target = who; this.lastSeen = who.pos.clone(); this.alertT = 0;
    for (const m of this.alive) if (m.state !== 'combat') { m.state = 'combat'; m.react = m === by ? 0.2 : 0.8 + Math.random() * 0.8; m.cover = null; }
    // one of them goes round the side
    const f = this.alive.filter((m) => !m.flank);
    if (f.length > 2) f[f.length - 1].flank = 1;
  }
}

export class Bandits {
  constructor(world) {
    this.world = world;
    this.squads = [];
    this.roamT = 120;
    this._m = new THREE.Matrix4(); this._fix = new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
    this._s = new THREE.Matrix4();
  }
  get list() { return this.squads.flatMap((s) => s.members); }

  /** Camps fill up when you come near; roaming squads turn up now and then. */
  _spawn(dt) {
    const P = O.player;
    if (!P?.alive) return;
    for (const c of O.camps || []) {
      const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
      const sq = this.squads.find((s) => s.home === c);
      if (!sq && d < 520 && d > 160 && !(c.clearedT > 0)) {
        const s = new Squad(c, 'camp');
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) { const a = Math.random() * TAU, r = 8 + Math.random() * 18; this._add(s, c.x + Math.cos(a) * r, c.z + Math.sin(a) * r); }
        this.squads.push(s);
      } else if (sq && d > 800 && !sq.target) this._despawn(sq);
    }
    for (const c of O.camps || []) if (c.clearedT > 0) c.clearedT -= dt;
    // a squad on the road
    this.roamT -= dt;
    if (this.roamT <= 0) {
      this.roamT = 300 + Math.random() * 360;
      if (this.squads.filter((s) => s.kind === 'roam').length < 2) {
        // somewhere on a road 300-450 studs away, not in view
        const roads = O.terrain.roads.filter((r) => r.type !== 'street');
        for (let tries = 0; tries < 12; tries++) {
          const rd = roads[Math.floor(Math.random() * roads.length)], k = Math.floor(Math.random() * rd.pts.length), p = rd.pts[k];
          const d = Math.hypot(p.x - P.pos.x, p.z - P.pos.z);
          if (d < 300 || d > 480) continue;
          const s = new Squad({ x: p.x, z: p.z }, 'roam');
          s.road = rd; s.k = k; s.dir = Math.random() < 0.5 ? 1 : -1;
          const n = 2 + Math.floor(Math.random() * 2);
          for (let i = 0; i < n; i++) this._add(s, p.x + (Math.random() - 0.5) * 6, p.z + (Math.random() - 0.5) * 6);
          this.squads.push(s);
          break;
        }
      }
    }
    for (const s of this.squads.slice()) {
      if (s.kind === 'roam' && s.members.every((m) => Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) > 900)) this._despawn(s);
      if (!s.alive.length && s.kind === 'camp') { s.home.clearedT = 1800; }
    }
  }
  _add(s, x, z) {
    const y = O.phys.groundAt(x, O.terrain.heightAt(x, z) + 3, z, 0.6, 6);
    const b = new Bandit(x, y, z, s);
    if (!O.crowd.add(b.person)) return;
    s.members.push(b);
    // the gun in their hands
    try {
      const info = buildGun(this._modelOf(b.gunId), []);
      info.group.scale.setScalar(3.0);
      info.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      b.model = new THREE.Group(); b.model.add(info.group); b.model.matrixAutoUpdate = false;
      this.world.scene.add(b.model);
      b.muzzle = info.muzzle.clone().multiplyScalar(3.0);
    } catch { b.model = null; }
  }
  _modelOf(id) { return ITEMS[id].gun; }
  _despawn(s) {
    for (const m of s.members) { m.removed = true; O.crowd.remove(m.person); if (m.model) this.world.scene.remove(m.model); O.bodies.removeOwner(m); }
    this.squads.splice(this.squads.indexOf(s), 1);
  }
  hear(x, y, z, r, src) {
    for (const s of this.squads) for (const m of s.alive) {
      if (Math.hypot(m.pos.x - x, m.pos.z - z) > r * 1.3) continue;
      if (src && src !== m && !s.members.includes(src)) {
        if (s.target) { if (src === s.target) s.lastSeen = new THREE.Vector3(x, y, z); }
        else { m.state = 'investigate'; m.inv = new THREE.Vector3(x, y, z); m.invT = 20; }
      }
    }
  }

  update(dt) {
    this._spawn(dt);
    for (const s of this.squads) {
      // the squad's picture of things
      if (s.target) {
        s.alertT += dt;
        if (s.target === O.player && !O.player.alive) { s.target = null; for (const m of s.alive) { m.state = 'loot'; m.lootT = 25; } }
        else if (s.target.dead) { s.target = null; for (const m of s.alive) m.state = 'patrol'; }
        else if (s.alertT > 45) { s.target = null; for (const m of s.alive) m.state = 'patrol'; }
      }
      for (const m of s.members) {
        if (m.dead) { this._dead(m, dt); continue; }
        this._think(m, s, dt);
        this._move(m, dt);
        this._pose(m, dt);
      }
    }
  }

  _sees(m, who) {
    const d = Math.hypot(who.pos.x - m.pos.x, who.pos.z - m.pos.z);
    const night = O.sky?.state?.night ?? 0;
    let range = (150 - night * 95) * (who === O.player ? (O.player.stance === 'prone' ? 0.45 : O.player.stance === 'crouch' ? 0.7 : 1) : 1);
    if (who === O.player && O.weapons?.light?.intensity > 0) range = Math.max(range, 140);
    if (d > range) return false;
    const dx = who.pos.x - m.pos.x, dz = who.pos.z - m.pos.z;
    const facing = (dx * Math.sin(m.yaw) + dz * Math.cos(m.yaw)) / Math.max(0.01, d);
    if (facing < -0.1 && d > 10) return false;
    const eyeY = m.pos.y + (m.crouch > 0.5 ? 3 : 4.5);
    const th = who === O.player ? who.pos.y + who.eye - 0.4 : who.pos.y + 3.5;
    return O.phys.sees(m.pos.x, eyeY, m.pos.z, who.pos.x, th, who.pos.z, { skip: (b) => b.tree && d > 60 ? false : false });
  }

  _think(m, s, dt) {
    const P = O.player;
    m.person.flash = Math.max(0, (m.person.flash || 0) - dt * 5);
    m.cool = Math.max(0, m.cool - dt); m.suppressed = Math.max(0, (m.suppressed || 0) - dt);
    m.seeT = (m.seeT ?? Math.random() * 0.3) - dt;
    m.retreat = Math.max(0, (m.retreat || 0) - dt);
    // reloading
    if (m.reloadT > 0) { m.reloadT -= dt; if (m.reloadT <= 0) { const k = Math.min(m.mag - m.ammo, m.reserve); m.ammo += k; m.reserve -= k; } }
    // look for you (and the infected close by)
    if (m.seeT <= 0) {
      m.seeT = 0.35;
      if (P.alive && this._sees(m, P)) { if (s.target !== P) s.spot(P, m); else s.lastSeen = P.pos.clone(); m.canSee = P; s.alertT = 0; }
      else m.canSee = null;
      // infected right on top of them
      if (!m.canSee) for (const z of O.zombies?.list || []) if (!z.dead && Math.hypot(z.pos.x - m.pos.x, z.pos.z - m.pos.z) < 22 && z.state === 'chase') { m.zTarget = z; break; }
      const zt = m.zTarget;
      if (zt && (zt.dead || !O.zombies.list.includes(zt) || Math.hypot(zt.pos.x - m.pos.x, zt.pos.z - m.pos.z) > 45 || !O.phys.sees(m.pos.x, m.pos.y + 4.4, m.pos.z, zt.pos.x, zt.pos.y + 3.5, zt.pos.z))) m.zTarget = null;
    }
    const T = s.target;
    if (m.state === 'combat' && T) {
      m.react -= dt;
      const tp = m.canSee ? T.pos : s.lastSeen;
      // where to be: in cover from the target, or flanking
      if (!m.cover || m.coverT <= 0 || (m.retreat > 0 && !m.retreating)) { m.cover = this._coverFrom(m, tp, m.retreat > 0 ? 45 : m.flank ? 35 : 22); m.coverT = 6 + Math.random() * 6; m.retreating = m.retreat > 0; }
      m.coverT -= dt;
      m.goal = m.cover;
      // in cover: crouch; pop up to shoot
      const atCover = m.cover && Math.hypot(m.cover.x - m.pos.x, m.cover.z - m.pos.z) < 2;
      m.peekT = (m.peekT ?? 0) - dt;
      if (atCover) { if (m.peekT <= 0) { m.peek = !m.peek; m.peekT = m.peek ? 1.5 + Math.random() * 2 : 1 + Math.random() * 1.5; } m.wantCrouch = !m.peek || m.suppressed > 1 || m.reloadT > 0; }
      else m.wantCrouch = false;
      // aim at them and shoot when you can see them
      if (tp) { m.aimYaw = Math.atan2(tp.x - m.pos.x, tp.z - m.pos.z); }
      if (m.canSee && m.react <= 0 && (!atCover || m.peek) && m.reloadT <= 0) this._shoot(m, T, dt);
    } else if (m.zTarget && !m.zTarget.dead && (m.state !== 'combat' || !T)) {
      m.aimYaw = Math.atan2(m.zTarget.pos.x - m.pos.x, m.zTarget.pos.z - m.pos.z);
      m.goal = null;
      this._shoot(m, m.zTarget, dt);
    } else if (m.state === 'investigate') {
      m.invT -= dt;
      m.goal = m.inv;
      if (m.invT <= 0 || (m.inv && Math.hypot(m.inv.x - m.pos.x, m.inv.z - m.pos.z) < 4)) m.state = 'patrol';
      m.wantCrouch = false;
    } else if (m.state === 'loot') {
      // go through the body's pockets
      const body = O.bodies.list.find((b) => b.owner === O.playerBodyOwner) || null;
      m.lootT -= dt;
      if (body && m.lootT > 0) {
        m.goal = new THREE.Vector3(body.x, body.y, body.z);
        if (Math.hypot(body.x - m.pos.x, body.z - m.pos.z) < 3 && body.items.length && Math.random() < dt * 0.5) { body.items.splice(Math.floor(Math.random() * body.items.length), 1); O.audio?.voice('loot', m.pos); }
      } else m.state = 'patrol';
    } else {
      // patrolling: camps walk about their camp; road squads walk the road
      m.wantCrouch = false;
      if (!m.goal || Math.hypot(m.goal.x - m.pos.x, m.goal.z - m.pos.z) < 3 || (m.patrolT = (m.patrolT ?? 0) - dt) <= 0) {
        m.patrolT = 20;
        if (s.kind === 'camp') { const a = Math.random() * TAU, r = 6 + Math.random() * 30; m.goal = new THREE.Vector3(s.home.x + Math.cos(a) * r, 0, s.home.z + Math.sin(a) * r); m.pause = Math.random() < 0.5 ? 4 + Math.random() * 8 : 0; }
        else {
          // follow the road; the squad keeps together behind the leader
          const lead = s.alive[0];
          if (m === lead) { s.k = Math.max(0, Math.min(s.road.pts.length - 1, s.k + s.dir * 12)); if (s.k === 0 || s.k === s.road.pts.length - 1) s.dir = -s.dir; const p = s.road.pts[s.k]; m.goal = new THREE.Vector3(p.x + s.road.w * 0.3, 0, p.z); }
          else m.goal = lead.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
        }
      }
      m.aimYaw = null;
      // chatter
      m.speakT -= dt; if (m.speakT <= 0) { m.speakT = 10 + Math.random() * 20; if (Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) < 60) O.audio?.voice('chatter', m.pos); }
    }
    m.crouch += ((m.wantCrouch ? 1 : 0) - m.crouch) * Math.min(1, dt * 6);
  }

  /** A spot near (r) with something solid between it and the threat (p). */
  _coverFrom(m, p, r) {
    if (!p) return null;
    let best = null, bs = -1e9;
    const tx = p.x - m.pos.x, tz = p.z - m.pos.z, td = Math.hypot(tx, tz) || 1;
    O.phys.query(m.pos.x - r, m.pos.z - r, m.pos.x + r, m.pos.z + r, (b) => {
      if (!b.solid || b.noStand && !b.tree) return;
      const top = b.y + b.hy;
      if (top < m.pos.y + 2.2 || b.y - b.hy > m.pos.y + 2 || Math.max(b.hx, b.hz) < 0.6) return;
      // the far side of the box from the threat
      const dx = b.x - p.x, dz = b.z - p.z, dl = Math.hypot(dx, dz) || 1;
      const off = Math.max(b.hx, b.hz) + 1.6;
      const cx = b.x + dx / dl * off, cz = b.z + dz / dl * off;
      const d = Math.hypot(cx - m.pos.x, cz - m.pos.z);
      if (d > r) return;
      // flankers want to be off to the side; others closer and still in range
      const side = Math.abs((cx - p.x) * (-tz / td) + (cz - p.z) * (tx / td));
      const dist = Math.hypot(cx - p.x, cz - p.z);
      let score = -d * 0.6 - Math.abs(dist - (m.retreat > 0 ? 90 : 45)) * 0.3 + (m.flank ? side * 0.6 : 0) + (b.cover ? 5 : 0) + Math.random() * 3;
      for (const o of m.squad.alive) if (o !== m && o.cover && Math.hypot(o.cover.x - cx, o.cover.z - cz) < 5) score -= 20;
      if (score > bs) { bs = score; best = new THREE.Vector3(cx, b.y - b.hy, cz); }
    });
    return best;
  }

  _shoot(m, T, dt) {
    if (m.ammo <= 0) { if (m.reserve > 0 && m.reloadT <= 0) { m.reloadT = 2.4; O.audio?.voice('reload', m.pos); } return; }
    if (m.cool > 0) return;
    const gd = m.gd;
    const eye = new THREE.Vector3(m.pos.x, m.pos.y + (m.crouch > 0.5 ? 3.0 : 4.4), m.pos.z);
    const isP = T === O.player;
    const aimAt = new THREE.Vector3(T.pos.x, T.pos.y + (isP ? Math.max(0.6, O.player.eye - 1.2) : 3.2), T.pos.z);
    const dir = aimAt.sub(eye); const dist = dir.length(); dir.normalize();
    // lead a moving target (badly)
    const tv = T.vel || new THREE.Vector3();
    dir.addScaledVector(tv, dist / (gd.vel * 1.15) / dist * 0.7).normalize();
    // hold over for drop at range
    dir.y += dist * dist * 0.5 * 30 / ((gd.vel * 1.15) ** 2) / dist * 0.9;
    const moving = Math.hypot(m.vel.x, m.vel.z) > 2 ? 2.5 : 0;
    const err = (gd.pellets ? gd.spread[0] * 0.55 : 1.2 + m.skill * 2.4 + moving + (m.suppressed > 0 ? 2 : 0) + (isP && O.player.stance === 'prone' ? 1.5 : 0)) * (dist > 80 ? 1.3 : 1);
    m.yaw = Math.atan2(dir.x, dir.z);
    O.combat.shoot(eye.clone().addScaledVector(dir, 1.5), dir, { dmg: gd.dmg * 0.8, vel: gd.vel * 1.15, shooter: m, pellets: gd.pellets, spread: err, armorPierce: 0.2 });
    m.ammo--;
    playShot(gd.sound, m.pos, false, false);
    O.audio?.distantShot(m.pos, gd.sound);
    const mz = eye.clone().addScaledVector(dir, 3); O.fx.muzzle(mz.x, mz.y, mz.z);
    O.combat.noise(m.pos.x, m.pos.y, m.pos.z, gd.noise * 0.6, m);
    // bursts for automatic guns, steady shots otherwise
    if (gd.auto) { m.burst = (m.burst || 0) + 1; if (m.burst >= 3 + Math.floor(Math.random() * 3)) { m.burst = 0; m.cool = 0.6 + Math.random() * 0.8; } else m.cool = 60 / gd.rpm; }
    else m.cool = Math.max(60 / gd.rpm, gd.bolt ? 1.6 : gd.pump ? 1.0 : 0.45) + Math.random() * 0.4;
    m.kick = 1;
  }

  _move(m, dt) {
    let speed = 0;
    const g = m.goal;
    if (g && !m.pause) {
      const dx = g.x - m.pos.x, dz = g.z - m.pos.z, d = Math.hypot(dx, dz);
      if (d > 1.2) {
        speed = m.state === 'combat' ? (m.crouch > 0.5 ? 6 : 13) : m.state === 'investigate' ? 8 : 6.5;
        let ux = dx / d, uz = dz / d;
        if (m.detour > 0) { m.detour -= dt; const s = m.detourSide; const nx = ux * 0.3 - uz * s, nz = uz * 0.3 + ux * s; ux = nx; uz = nz; }
        m.stuckT += dt;
        if (m.stuckT > 1) { if (d > m.lastD - 0.8) { m.detour = 1 + Math.random(); m.detourSide = Math.random() < 0.5 ? 1 : -1; } m.lastD = d; m.stuckT = 0; }
        m.vel.x += (ux * speed - m.vel.x) * Math.min(1, dt * 6); m.vel.z += (uz * speed - m.vel.z) * Math.min(1, dt * 6);
        if (m.aimYaw == null) { const want = Math.atan2(ux, uz); let da = want - m.yaw; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; m.yaw += da * Math.min(1, dt * 5); }
      }
    }
    if (m.pause) { m.pause = Math.max(0, m.pause - dt); }
    if (!speed) { m.vel.x *= Math.exp(-dt * 8); m.vel.z *= Math.exp(-dt * 8); }
    if (m.aimYaw != null) { let da = m.aimYaw - m.yaw; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; m.yaw += da * Math.min(1, dt * 8); }
    const res = O.phys.moveBody(m.pos, m.vel, dt, { r: 1.0, h: m.crouch > 0.5 ? 3.6 : 5, step: 1.7, grounded: m.grounded });
    m.grounded = res.grounded;
    m.moving = Math.hypot(m.vel.x, m.vel.z);
  }

  _pose(m, dt) {
    const p = m.person, P = p.pose;
    m.phase += dt * (m.moving || 0) * 0.6;
    P.walk = m.phase; P.stride = Math.min(1, (m.moving || 0) / 10);
    P.arms = m.gd.pistol ? 'pistol' : (m.state === 'combat' || m.zTarget) ? 'aim' : 'carry';
    P.crouch = m.crouch;
    P.look = m.state === 'combat' ? 0.05 : 0;
    m.kick = Math.max(0, (m.kick || 0) - dt * 10);
    P.lean = -m.kick * 0.04;
    p.x = m.pos.x; p.y = m.pos.y; p.z = m.pos.z; p.yaw = m.yaw;
    m.person.flash = Math.max(0, (m.person.flash || 0) - dt * 4);
    // the gun in their hand
    if (m.model && !p.culled) {
      const hm = O.crowd.handMatrix(p, this._m);
      if (hm) { m.model.matrix.copy(hm).multiply(this._fix); m.model.matrixWorldNeedsUpdate = true; m.model.visible = true; }
    }
  }

  _dead(m, dt) {
    m.deadT += dt;
    const P = m.person.pose;
    const k = Math.min(1, m.deadT / 0.6);
    P.dead = k * k * (3 - 2 * k); P.stride = 0; P.arms = null; P.crouch = 0;
    if (m.model && m.deadT < 0.1) m.model.visible = false;
  }

  clear() { for (const s of this.squads.slice()) this._despawn(s); }
}

export { def };
