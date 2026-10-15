// The World: one loaded chapter with all its entities and systems.
import * as THREE from 'three';
import { G, MAX_POINT_LIGHTS, MAX_SPOT_LIGHTS } from '../engine/ps1material.js';
import { CollisionWorld, SURF } from '../engine/collision.js';
import { NavGrid } from '../engine/nav.js';
import { Effects } from './effects.js';
import { DIFFICULTY, SURVIVOR, COMMON, U } from './config.js';
import { Survivor, newIntent } from './survivor.js';
import { SURVIVORS } from './characters.js';
import { Common } from './infected.js';
import { Director } from './director.js';
import { Pickup, Projectile, FireArea, AcidPool, Carryable, Door, Lure, Breakable, spawnExplosion } from './items.js';
import { VOICE } from './voice.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _c = new THREE.Color();

class Emitter {
  constructor() { this.h = {}; }
  on(e, f) { (this.h[e] || (this.h[e] = [])).push(f); return () => this.off(e, f); }
  off(e, f) { const a = this.h[e]; if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } }
  emit(e, ...args) { const a = this.h[e]; if (a) for (const f of a.slice()) f(...args); }
}

export class World {
  constructor(game, levelModule, builder, opts = {}) {
    this.game = game;
    this.audio = game.audio;
    this.settings = game.settings;
    this.level = levelModule;
    this.builder = builder;
    this.difficulty = opts.difficulty || 'normal';
    this.diff = DIFFICULTY[this.difficulty];
    this.chapter = opts.chapter;
    this.scene = new THREE.Scene();
    this.glowScene = new THREE.Scene();
    this.events = new Emitter();
    this.time = 0; this.frame = 0;
    this.survivors = []; this.infected = []; this.breakables = []; this.pickups = []; this.projectiles = []; this.hazards = []; this.doors = []; this.carryables = []; this.interactables = []; this.lures = [];
    this.transientLights = [];
    this.messages = [];
    this.subtitles = [];
    this.cameraMode = 'fp';
    this.drawDistance = 90;
    this.saferoomLocked = false;
    this.paused = false;
    this.objective = null;
    this.flags = {};
    this.timers = [];
    this.stats = { time: 0, commons: 0, specials: 0 };
    // level geometry
    this.scene.add(builder.group);
    this.collision = new CollisionWorld();
    this.collision.build(builder.moveBVH, builder.shootBVH);
    const bounds = new THREE.Box3().setFromBufferAttribute(builder.colGeo.getAttribute('position'));
    const noSpawn = builder.zones.filter((z) => z.saferoom).map((z) => z.box);
    this.nav = new NavGrid(builder.moveBVH, bounds, { noSpawn }).generate();
    this.fieldAll = new Float32Array(this.nav.count).fill(Infinity);
    this.fieldBile = new Float32Array(this.nav.count).fill(Infinity);
    this.fieldT = 0;
    this.effects = new Effects(this.scene, this.collision);
    this.effects.lights = (p, c, r, life, intensity) => this.addLight(p, c, r, life, intensity);
    this.effects.decals.lightFn = (p) => this.probeAt(p, new THREE.Color()).clone();
    this.probeCache = new Map();
    // fog/ambience from level
    const env = levelModule.env || {};
    this.env = env;
    G.uFogColor.value.set(env.fog !== undefined ? env.fog : 0x202020);
    G.uFogNear.value = env.fogNear || 12; G.uFogFar.value = env.fogFar || 70;
    this.scene.userData.clearColor = env.clear !== undefined ? env.clear : (env.fog !== undefined ? env.fog : 0x101010);
    G.uHemiSky.value.setRGB(0.09, 0.09, 0.1); G.uHemiGround.value.setRGB(0.05, 0.045, 0.04); G.uSunColor.value.setRGB(0, 0, 0);
    if (env.sky) this.buildSky(env);
    this.staticFlicker = builder.dynLights.map((l) => ({ ...l, base: l.color.clone(), phase: Math.random() * 10 }));
    // flow distance from the escape goal (progress metric)
    this.director = new Director(this);
    // survivors
    const starts = builder.markers.filter((m) => m.type === 'survivorStart');
    const roster = opts.roster || SURVIVORS;
    roster.forEach((def, i) => {
      const s = new Survivor(this, def, i);
      const st = starts[i] || starts[0] || { pos: new THREE.Vector3(), yaw: 0 };
      s.body.pos.copy(st.pos); s.yaw = st.yaw || 0;
      s.intent = newIntent(); s.intent.yaw = s.yaw;
      this.survivors.push(s);
    });
  }

  // ------------------------------------------------------------------ setup
  buildSky(env) {
    // gradient dome (vertex colours), drawn behind everything and following the camera
    const geo = new THREE.SphereGeometry(400, 16, 10);
    const top = new THREE.Color(env.sky.top), hor = new THREE.Color(env.sky.horizon), bot = new THREE.Color(env.sky.bottom !== undefined ? env.sky.bottom : env.sky.horizon);
    const pos = geo.getAttribute('position'); const col = new Float32Array(pos.count * 3); const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 400;
      if (y >= 0) c.copy(hor).lerp(top, Math.pow(y, 0.6)); else c.copy(hor).lerp(bot, Math.min(1, -y * 3));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  setFog(color, near, far) {
    G.uFogColor.value.set(color); G.uFogNear.value = near; G.uFogFar.value = far;
    this.scene.userData.clearColor = G.uFogColor.value.getHex();
  }
  /** Smoothly move the fog towards a target (call every frame). */
  fogTo(color, near, far, dt) {
    const k = Math.min(1, dt * 1.5);
    const tc = _c.set(color);
    G.uFogColor.value.lerp(tc, k);
    G.uFogNear.value += (near - G.uFogNear.value) * k;
    G.uFogFar.value += (far - G.uFogFar.value) * k;
    if (!this.sky) this.scene.userData.clearColor = G.uFogColor.value.getHex();
  }

  init(savedState = null) {
    // spawn level entities from markers
    for (const m of this.builder.markers) {
      if (m.type === 'item' || m.type === 'weapon') {
        if (m.chance !== undefined && Math.random() > m.chance) continue;
        let id = m.id;
        if (Array.isArray(id)) id = id[(Math.random() * id.length) | 0];
        this.spawnPickup(id, m.pos, { count: m.count, infinite: m.infinite, yaw: m.yaw, fixed: true });
      } else if (m.type === 'carry') {
        this.spawnCarry(m.id, m.pos, m);
      } else if (m.type === 'ammo') {
        this.spawnPickup('ammo_pile', m.pos, { infinite: true, yaw: m.yaw });
      }
    }
    for (const d of this.builder.doors) this.doors.push(new Door(this, d));
    for (const g of (this.builder.glass || [])) this.breakables.push(new Breakable(this, g));
    if (this.level.setup) this.level.setup(this);
    this.director.init();
    if (savedState) this.applyCarryOver(savedState);
  }

  applyCarryOver(state) {
    state.forEach((st, i) => {
      const s = this.survivors[i]; if (!s || !st) return;
      if (st.dead) { s.health = 50; s.temp = 0; s.incapCount = 0; s.inv.secondary = s.inv.secondary; return; }
      s.health = Math.max(1, st.health); s.temp = Math.max(0, st.temp); s.incapCount = st.incapCount || 0;
      if (st.primary) { s.give(st.primary.id, { clip: st.primary.clip, reserve: st.primary.reserve }); if (st.primary.laser) s.inv.primary.laser = true; }
      if (st.secondary) s.give(st.secondary.id === 'dual_pistols' ? 'pistol' : st.secondary.id, {}), st.secondary.id === 'dual_pistols' && s.give('pistol');
      for (const k of ['throwable', 'kit', 'pills']) if (st[k]) s.inv[k] = st[k];
      s.slot = s.inv.primary ? 0 : 1;
    });
  }

  carryOverState() {
    return this.survivors.map((s) => ({
      dead: s.state === 'dead' || !!s.leftBehind,
      health: s.state === 'alive' ? s.health : 50, temp: s.state === 'alive' ? s.temp : 0, incapCount: s.state === 'alive' ? s.incapCount : 0,
      primary: s.inv.primary ? { id: s.inv.primary.id, clip: s.inv.primary.clip, reserve: s.inv.primary.reserve, laser: s.inv.primary.laser } : null,
      secondary: s.inv.secondary ? { id: s.inv.secondary.id } : null,
      throwable: s.inv.throwable, kit: s.inv.kit, pills: s.inv.pills,
    }));
  }

  /**
   * Safety net: a survivor who ends up somewhere the escape route can't be
   * reached from (pushed through a wall, fell outside the playable area) is
   * returned to the team after a few seconds.
   */
  checkOutOfBounds(dt) {
    this.oobT = (this.oobT || 0) - dt;
    if (this.oobT > 0) return;
    this.oobT = 0.5;
    const nav = this.nav, esc = this.director && this.director.escape;
    if (!nav || !esc) return;
    const good = (x, y, z) => { const n = nav.nearest(x, y + 0.3, z, 2.5); return n >= 0 && esc[n] < Infinity ? n : -1; };
    for (const s of this.survivors) {
      if (s.state === 'dead' || s.pinnedBy) { s.oob = 0; continue; }
      const p = s.state === 'ledge' && s.ledgePos ? s.ledgePos.top : s.body.pos;
      const n = good(p.x, p.y, p.z);
      if (n >= 0) {
        s.oob = 0;
        if (s.state === 'alive' && s.body.grounded) (s.lastSafe || (s.lastSafe = new THREE.Vector3())).set(nav.x[n], nav.y[n], nav.z[n]);
        continue;
      }
      s.oob = (s.oob || 0) + 0.5;
      if (s.oob < 3 && p.y > -20) continue;
      s.oob = 0;
      // nearest teammate standing on the route, else our last safe spot
      let dest = null, bd = Infinity;
      for (const o of this.survivors) {
        if (o === s || o.state !== 'alive' || o.pinnedBy) continue;
        const on = good(o.body.pos.x, o.body.pos.y, o.body.pos.z);
        if (on < 0) continue;
        const d = o.body.pos.distanceTo(s.body.pos);
        if (d < bd) { bd = d; dest = _v.set(nav.x[on], nav.y[on], nav.z[on]); }
      }
      if (!dest && s.lastSafe) dest = _v.copy(s.lastSafe);
      if (!dest) continue;
      if (s.state === 'ledge') { s.state = 'alive'; s.ledgePos = null; s.noLedgeGrab = 1; }
      (this.oobLog || (this.oobLog = [])).push({ who: s.name, t: +this.time.toFixed(1), from: p.toArray().map((v) => +v.toFixed(2)), mode: s.controller && s.controller.mode });
      s.body.pos.set(dest.x, dest.y + 0.05, dest.z); s.body.vel.set(0, 0, 0);
      if (s.lastGrounded) s.lastGrounded.copy(s.body.pos);
      if (s.controller) s.controller.path = null;
      this.oobRescues = (this.oobRescues || 0) + 1;
    }
  }

  // ------------------------------------------------------------------ main update
  update(dt) {
    if (this.paused) return;
    this.time += dt; this.frame++;
    this.stats.time += dt;
    // timers
    for (let i = 0; i < this.timers.length; i++) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); i--; t.fn(); } }
    // survivors
    for (const s of this.survivors) {
      if (s.controller) s.controller.think(dt, s.intent);
      s.update(dt, s.intent);
    }
    this.checkOutOfBounds(dt);
    this.updateFlowFields(dt);
    this.director.update(dt);
    // infected
    this.buildSpatial();
    for (let i = 0; i < this.infected.length; i++) {
      const z = this.infected[i];
      z.update(dt);
      if (z.removed) { this.infected.splice(i, 1); i--; }
    }
    this.separate(dt);
    for (let i = 0; i < this.projectiles.length; i++) { const p = this.projectiles[i]; p.update(dt); if (p.dead) { p.dispose(); this.projectiles.splice(i, 1); i--; } }
    for (let i = 0; i < this.hazards.length; i++) { const h = this.hazards[i]; h.update(dt); if (h.dead) { h.dispose(); this.hazards.splice(i, 1); i--; } }
    for (let i = 0; i < this.lures.length; i++) { const l = this.lures[i]; l.update(dt); if (!l.active) { this.lures.splice(i, 1); i--; } }
    for (const p of this.pickups) p.update(dt);
    for (const c of this.carryables) c.update(dt);
    for (const d of this.doors) d.update(dt);
    for (const it of this.interactables) if (it.update) it.update(dt);
    this.updateTriggers();
    this.cullCorpses();
    if (this.level.update) this.level.update(this, dt);
    this.effects.update(dt, this.camPos);
    this.updateLights(dt);
    if (this.sky && this.camPos) this.sky.position.copy(this.camPos);
    this.updateMessages(dt);
    this.checkWipe(dt);
  }

  // ------------------------------------------------------------------ flow fields
  updateFlowFields(dt) {
    this.fieldT -= dt;
    if (this.fieldT > 0) return;
    this.fieldT = 0.25;
    const srcs = [], bile = [];
    for (const s of this.survivors) {
      if (s.state === 'dead') continue;
      const n = this.nav.nearest(s.body.pos.x, s.body.pos.y + 0.2, s.body.pos.z, 3);
      s.navNode = n;
      if (n >= 0) { srcs.push(n); if (s.biled > 0) bile.push(n); }
    }
    this.nav.flowField(srcs, this.fieldAll, true, 85);
    this.hasBile = bile.length > 0;
    if (this.hasBile) this.nav.flowField(bile, this.fieldBile, true, 85);
  }
  fieldFor(s) { return s && s.biled > 0 && this.hasBile ? this.fieldBile : this.fieldAll; }
  pickTargetFor(z) {
    let best = null, bd = Infinity;
    for (const s of this.survivors) {
      if (s.state === 'dead') continue;
      let d = s.body.pos.distanceToSquared(z.position);
      if (s.biled > 0) d *= 0.05;
      if (s.state === 'incap') d *= 1.5;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // ------------------------------------------------------------------ spatial hash / separation
  buildSpatial() {
    const cell = 1.5;
    const map = this.spatial || (this.spatial = new Map());
    map.clear();
    for (const z of this.infected) {
      if (!z.alive || z.climb) continue;
      const k = Math.floor(z.position.x / cell) * 73856093 ^ Math.floor(z.position.z / cell) * 19349663;
      let a = map.get(k); if (!a) { a = []; map.set(k, a); } a.push(z);
    }
    this.spatialCell = cell;
  }
  nearbyInfected(x, z, cb) {
    const cell = this.spatialCell, map = this.spatial;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = map.get((cx + i) * 73856093 ^ (cz + j) * 19349663);
      if (a) for (const e of a) cb(e);
    }
  }
  separate(dt) {
    for (const z of this.infected) {
      if (!z.alive || z.climb || z.noSeparate) continue;
      this.nearbyInfected(z.position.x, z.position.z, (o) => {
        if (o === z || !o.alive || o.noSeparate) return;
        const dx = z.position.x - o.position.x, dz = z.position.z - o.position.z;
        const r = z.radius + o.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 1e-6 && Math.abs(z.position.y - o.position.y) < 1.2) {
          const d = Math.sqrt(d2), push = (r - d) * 0.5;
          z.vel.x += dx / d * push * 8 * dt * 10; z.vel.z += dz / d * push * 8 * dt * 10;
        }
      });
    }
    // survivors vs infected (infected body-block survivors)
    for (const s of this.survivors) {
      if (s.state !== 'alive' || s.pinnedBy) continue;
      const p = s.body.pos;
      this.nearbyInfected(p.x, p.z, (z) => {
        if (!z.alive || z.noSeparate) return;
        const dx = p.x - z.position.x, dz = p.z - z.position.z;
        const r = s.body.radius + z.radius - 0.08;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 1e-6 && Math.abs(p.y - z.position.y) < 1.4) {
          const d = Math.sqrt(d2), pen = r - d;
          let massS = z.heavy ? 0.9 : 0.3;
          // never shove a survivor off a ledge: only displace them if there is floor there
          const nx = p.x + dx / d * pen * massS, nz = p.z + dz / d * pen * massS;
          const g = this.collision.groundAt(nx, p.y + 0.4, nz, 1.2);
          if (!g) massS = 0;
          else { p.x = nx; p.z = nz; }
          z.position.x -= dx / d * pen * (1 - massS) * 0.6; z.position.z -= dz / d * pen * (1 - massS) * 0.6;
        }
      });
    }
    // survivors vs survivors
    for (let i = 0; i < this.survivors.length; i++) for (let j = i + 1; j < this.survivors.length; j++) {
      const a = this.survivors[i], b = this.survivors[j];
      if (a.state !== 'alive' || b.state !== 'alive' || a.pinnedBy || b.pinnedBy) continue;
      const dx = a.body.pos.x - b.body.pos.x, dz = a.body.pos.z - b.body.pos.z;
      const r = 0.6, d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6 && Math.abs(a.body.pos.y - b.body.pos.y) < 1.5) {
        const d = Math.sqrt(d2), push = (r - d) * 0.25;
        a.body.pos.x += dx / d * push; a.body.pos.z += dz / d * push;
        b.body.pos.x -= dx / d * push; b.body.pos.z -= dz / d * push;
      }
    }
  }

  // ------------------------------------------------------------------ combat
  traceBullet(origin, dir, o) {
    const maxRange = o.range || 120;
    const hit = this.collision.raycast(origin, dir, maxRange, { forBullets: true });
    const maxT = hit ? hit.distance : maxRange;
    const hits = [];
    for (const z of this.infected) {
      if (!z.alive) continue;
      const r = z.rayTest(origin, dir, maxT);
      if (r) hits.push({ ent: z, t: r.t, group: r.group, limb: r.limb });
    }
    // friendly fire (human shooters only)
    const shooter = o.shooter;
    if (shooter && shooter.isSurvivor && !shooter.isBot && this.diff.ff > 0) {
      for (const s of this.survivors) {
        if (s === shooter || s.state === 'dead') continue;
        const base = s.body.pos;
        const top = s.state === 'alive' ? 1.6 : 0.6;
        const a = _v.set(base.x, base.y + 0.3, base.z), b = _v2.set(base.x, base.y + top, base.z);
        const t = raySegDist(origin, dir, a, b, 0.28);
        if (t !== null && t < maxT) hits.push({ ent: s, t, group: 'chest' });
      }
    }
    hits.sort((a, b) => a.t - b.t);
    let dmg = o.damage, pen = o.pen || 0;
    let endT = maxT;
    let stopped = false;
    for (const h of hits) {
      const falloff = Math.pow(o.rangeMod || 1, h.t / (500 * U));
      const d = dmg * falloff;
      const p = _v3.copy(origin).addScaledVector(dir, h.t);
      if (h.ent.isSurvivor) {
        const s = h.ent;
        s.takeDamage(d * this.diff.ff, { type: 'ff', attacker: shooter, dir });
        this.effects.blood(p, dir, 0.4);
        if (shooter) { this.message(`${shooter.name} attacked ${s.name}`, 'ff'); this.speak(s, 'ff', 0.6); }
        endT = h.t; stopped = true; break;
      }
      const z = h.ent;
      const wasAlive = z.alive;
      const info = { attacker: shooter, type: 'bullet', group: h.group, limb: h.limb, dir: dir.clone(), weapon: o.weapon, special: o.special, close: h.t < 5, damage: d, point: p.clone() };
      let dealt = d;
      if (z.type === 'tank' && o.weapon && o.weapon.tankScale) dealt *= o.weapon.tankScale;
      z.takeDamage(dealt, info);
      if (shooter && shooter.isSurvivor) shooter.stats.hits++;
      this.effects.blood(p, dir, z.type === 'tank' ? 0.6 : 0.8);
      if (o.special === 'incendiary') z.ignite(shooter);
      if (o.special === 'explosive') { spawnExplosion(this, p, { radius: 2, damage: 40, owner: shooter, small: true, noFF: false }); }
      if (wasAlive && !z.alive && h.group === 'head' && shooter && shooter.isSurvivor) shooter.stats.headshots++;
      if (pen <= 0 || o.special) { endT = h.t; stopped = true; break; }
      pen--; dmg *= 0.75;
    }
    if (!stopped && hit) {
      endT = hit.distance;
      this.effects.impact(hit.point, hit.normal, hit.surface);
      if (Math.random() < 0.35) this.sound(hit.surface === SURF.METAL ? 'bullet_impact_metal' : hit.surface === SURF.WOOD ? 'bullet_impact_wood' : hit.surface === SURF.GLASS ? 'bullet_impact_glass' : 'bullet_impact_concrete', hit.point, { volume: 0.5, priority: 0 });
      if (hit.dynamic && hit.dynamic.owner && hit.dynamic.owner.onShot) hit.dynamic.owner.onShot(o.damage, shooter, hit.point, o.special);
      if (o.special === 'explosive') spawnExplosion(this, hit.point, { radius: 2, damage: 40, owner: shooter, small: true });
    }
    if (o.tracer) {
      const from = o.muzzle || origin;
      const end = _v.copy(origin).addScaledVector(dir, endT);
      if (Math.random() < 0.5 || o.weapon && o.weapon.kind !== 'shotgun') this.effects.tracers.add(from, end);
    }
  }

  onWeaponFired(shooter, ws, muzzle) {
    const d = ws.def;
    const loud = d.quiet ? 0.45 : d.kind === 'shotgun' || d.kind === 'sniper' || d.id === 'magnum' ? 1.4 : 1;
    const fp = shooter.isPlayer && this.cameraMode === 'fp';
    this.sound(d.sound, fp ? null : muzzle, { volume: shooter.isPlayer ? 1 : 0.8, randomPitch: 0.04, priority: 2 });
    if (!fp) this.effects.muzzleFlash(muzzle, d.kind === 'shotgun' ? 0.45 : 0.3);
    this.addLight(muzzle, _c.setRGB(1, 0.75, 0.4), 6 * loud, 0.05, 1.5);
    this.noise(muzzle, (d.quiet ? 6 : 22) * loud, shooter);
    this.events.emit('fired', shooter, ws);
  }

  commonHitsSurvivor(z, s) {
    const fwd = _v.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    const to = _v2.set(z.position.x - s.body.pos.x, 0, z.position.z - s.body.pos.z).normalize();
    const behind = fwd.dot(to) < -0.3;
    let dmg = this.diff.commonDmg * (behind ? 0.5 : 1);
    if (s.state === 'incap') dmg = 10 * this.diff.incapFactor;
    s.takeDamage(dmg, { type: 'common', attacker: z, dir: to.clone().negate() });
    this.sound('zombie_hit_survivor', s.body.pos, { volume: 0.7, randomPitch: 0.1 });
    if (Math.random() < 0.5 && !(s.isPlayer && this.cameraMode === 'fp')) this.effects.blood(_v3.set(s.body.pos.x, s.body.pos.y + 1.2, s.body.pos.z), to.clone().negate(), 0.35, { wall: false });
  }

  onInfectedKilled(z, info) {
    const a = info.attacker;
    if (z.type === 'common') { this.stats.commons++; if (a && a.isSurvivor) a.stats.commons++; }
    else {
      this.stats.specials++;
      if (a && a.isSurvivor) { a.stats.specials++; this.message(`${a.name} killed the ${z.displayName || z.type}`, 'kill'); if (Math.random() < 0.4) this.speak(a, 'kill_special'); }
    }
    this.director.onInfectedKilled(z, info);
    this.events.emit('infectedKilled', z, info);
  }

  /** Boomer bile on a survivor: blinds them, makes them the horde's target and calls a mob. */
  bileSurvivor(s, by) {
    if (s.state === 'dead' || s.biled > 0) return;
    s.biled = 20; s.bileScreen = 10;
    this.sound('survivor_vomit_spit', s.body.pos, { volume: 0.8 });
    this.events.emit('biled', s, by);
    this.message(`${s.name} was vomited on!`, 'warn');
    if (!this.lastBileMob || this.time - this.lastBileMob > 15) {
      this.lastBileMob = this.time;
      this.director.spawnMob(20, { near: s.body.pos, reason: 'bile' });
      this.director.mobTimer = Math.max(this.director.mobTimer, 30);
    }
  }

  /** Knock a survivor through the air (tank punch, charger side hit, explosions). */
  flingSurvivor(s, dir, speed, up) {
    if (s.state !== 'alive') return;
    if (s.pinnedBy && s.pinnedBy.releaseVictim) s.pinnedBy.releaseVictim();
    s.cancelAction();
    s.body.vel.set(dir.x * speed, up, dir.z * speed);
    s.body.grounded = false;
    s.fling = { t: 0.25 };
    s.stunned = Math.max(s.stunned, speed > 5 ? 1.2 : 0.5);
    s.jumped = false; s.airTime = 0.06;
    if (s.inv.carry) this.dropCarry(s, true);
  }

  /** Shoves / melee swings break glass in front of the attacker. */
  breakNear(origin, dir, range) {
    for (const g of this.breakables) {
      if (g.broken) continue;
      const to = _v.copy(g.center).sub(origin);
      const d = to.length();
      if (d > range + 0.8) continue;
      if (to.normalize().dot(dir) > 0.5 || d < 0.9) g.break();
    }
  }

  /** Alert idle infected within radius. */
  noise(pos, radius, source) {
    const r2 = radius * radius;
    for (const z of this.infected) {
      if (!z.alive || !z.alert) continue;
      if (z.position.distanceToSquared(pos) < r2) z.alert(pos);
    }
  }

  isLastStanding(s) {
    return this.survivors.filter((o) => o !== s && o.state === 'alive' && !o.pinnedBy).length === 0;
  }

  // ------------------------------------------------------------------ items & interactions
  spawnPickup(id, pos, data = {}) {
    const p = new Pickup(this, id, pos, data);
    this.pickups.push(p);
    return p;
  }
  removePickup(p) { const i = this.pickups.indexOf(p); if (i >= 0) this.pickups.splice(i, 1); p.dispose(); }
  spawnCarry(id, pos, data = {}) { const c = new Carryable(this, id, pos, data); this.carryables.push(c); return c; }

  pickup(s, p) { p.takeBy(s); }
  pickupCarry(s, c) {
    if (s.inv.carry) this.dropCarry(s, false);
    c.carriedBy(s);
  }
  dropCarry(s, forced) { if (s.inv.carry) s.inv.carry.drop(s, forced ? 0 : 1.5); }
  throwCarry(s) { if (s.inv.carry) s.inv.carry.drop(s, 7); }
  throwItem(s, item) {
    const eye = s.eyePos(new THREE.Vector3());
    const dir = s.aimDir(new THREE.Vector3());
    const v = dir.clone().multiplyScalar(item === 'pipebomb' ? 15 : 14).add(new THREE.Vector3(0, 3, 0)).add(_v.copy(s.body.vel).multiplyScalar(0.5));
    const p = new Projectile(this, item, eye.addScaledVector(dir, 0.5), v, s);
    this.projectiles.push(p);
    this.sound('melee_swing', s.body.pos, { volume: 0.5 });
    this.speak(s, item === 'pipebomb' ? 'throw_pipe' : item === 'molotov' ? 'throw_molotov' : 'throw_bile');
  }
  spawnGrenade(pos, dir, shooter, special) {
    const p = new Projectile(this, 'grenade', pos.clone(), dir.clone().multiplyScalar(1200 * U).add(new THREE.Vector3(0, 100 * U, 0)), shooter, { special });
    this.projectiles.push(p);
  }
  deployUpgrade(s, type) {
    const pos = s.body.pos.clone().add(new THREE.Vector3(-Math.sin(s.yaw) * 0.7, 0, -Math.cos(s.yaw) * 0.7));
    const g = this.collision.groundAt(pos.x, pos.y + 0.5, pos.z, 2);
    if (g) pos.y = g.y;
    this.spawnPickup(type + '_deployed', pos, { uses: 4 });
    this.sound('pickup_item', pos);
  }

  /** What is the survivor looking at to interact with? */
  findUseTarget(s) {
    const eye = s.eyePos(_v); const dir = s.aimDir(_v2);
    const R = SURVIVOR.useRange;
    let best = null, bestScore = -Infinity;
    const consider = (kind, target, pos, radius = 0.4, maxR = R) => {
      const dx = pos.x - eye.x, dy = pos.y - eye.y, dz = pos.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > maxR + radius) return;
      const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / Math.max(d, 0.01);
      const ang = Math.acos(Math.min(1, dot));
      const tol = Math.atan2(radius + 0.25, d);
      if (ang > tol + 0.15 && d > 0.9) return;
      // line of sight to the target, ignoring geometry it rests on / in (last 35cm)
      const to = _v3.copy(pos).sub(eye); const tl = to.length();
      if (tl > 0.4 && this.collision.raycast(eye, to.multiplyScalar(1 / tl), tl - 0.35, { dynamic: false })) return;
      const score = -ang - d * 0.05 + (kind === 'revive' || kind === 'ledge' ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = { kind, target }; }
    };
    for (const o of this.survivors) {
      if (o === s) continue;
      if (o.state === 'incap' && !o.pinnedBy) consider('revive', o, o.center(new THREE.Vector3()), 0.6);
      if (o.state === 'ledge') consider('ledge', o, o.ledgePos.top.clone().setY(o.ledgePos.top.y + 0.1), 0.8);
    }
    for (const p of this.pickups) if (p.usable(s)) consider('pickup', p, p.focusPos(), p.radius || 0.3);
    for (const c of this.carryables) if (!c.carrier && c.mesh.visible) consider('carry', c, c.focusPos(), 0.35);
    for (const it of this.interactables) if (it.usable && it.usable(s)) consider(it.pourable ? 'pour' : 'interact', it, it.focusPos(), it.radius || 0.4, it.useRange || R);
    for (const d of this.doors) if (d.usable(s)) consider('interact', d, d.center, 0.6);
    return best;
  }
  findSurvivorInView(s, range) {
    const eye = s.eyePos(_v); const dir = s.aimDir(_v2);
    let best = null, bd = -1;
    for (const o of this.survivors) {
      if (o === s || o.state === 'dead') continue;
      const c = o.center(_v3);
      const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > range + 0.5) continue;
      const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
      if (dot > 0.8 && dot > bd) { bd = dot; best = o; }
    }
    return best;
  }
  findDeadBody(s) {
    let best = null, bd = SURVIVOR.useRange + 0.5;
    for (const o of this.survivors) {
      if (o.state !== 'dead' || !o.bodyDefibable) continue;
      const d = o.body.pos.distanceTo(s.body.pos);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  doorBlocking(z, nx, nz) {
    for (const d of this.doors) {
      if (!d.closed || d.broken) continue;
      const b = d.box;
      const y = z.position.y + 0.9;
      if (y < b.min.y || y > b.max.y) continue;
      const r = z.radius;
      if (nx > b.min.x - r && nx < b.max.x + r && nz > b.min.z - r && nz < b.max.z + r) return d;
    }
    return null;
  }

  // ------------------------------------------------------------------ triggers
  updateTriggers() {
    for (const t of this.builder.triggers) {
      if (t.fired && t.once !== false) continue;
      let inside = false;
      const who = [];
      for (const s of this.survivors) {
        if (s.state === 'dead') continue;
        if (t.box.containsPoint(_v.set(s.body.pos.x, s.body.pos.y + 0.5, s.body.pos.z))) { inside = true; who.push(s); }
      }
      const cond = t.all ? who.length > 0 && who.length === this.survivors.filter((s) => s.state !== 'dead').length : inside;
      if (cond && !t.fired) { t.fired = true; if (t.onEnter) t.onEnter(this, who); this.events.emit('trigger', t.name, who); }
      else if (!cond && t.once === false) t.fired = false;
    }
  }

  after(sec, fn) { this.timers.push({ t: sec, fn }); }

  // ------------------------------------------------------------------ corpses
  cullCorpses() {
    if (this.frame % 30) return;
    const dead = this.infected.filter((z) => !z.alive);
    const max = 40;
    if (dead.length > max) {
      dead.sort((a, b) => b.deathT - a.deathT);
      for (let i = 0; i < dead.length - max; i++) dead[i].remove();
    }
    for (const z of dead) if (z.deathT > 90) z.remove();
  }

  // ------------------------------------------------------------------ lighting
  addLight(pos, color, range, life = 0.05, intensity = 1, opts = {}) {
    const l = { pos: pos.clone(), color: color.clone().multiplyScalar(intensity), range, life, max: life, follow: opts.follow || null, persist: !!opts.persist, flicker: opts.flicker || 0, base: color.clone().multiplyScalar(intensity), phase: Math.random() * 10 };
    this.transientLights.push(l);
    return l;
  }
  removeLight(l) { const i = this.transientLights.indexOf(l); if (i >= 0) this.transientLights.splice(i, 1); }
  updateLights(dt) {
    const cam = this.camPos || _v.set(0, 0, 0);
    const cands = [];
    for (let i = 0; i < this.transientLights.length; i++) {
      const l = this.transientLights[i];
      if (!l.persist) { l.life -= dt; if (l.life <= 0) { this.transientLights.splice(i, 1); i--; continue; } }
      if (l.follow) l.pos.copy(l.follow.position || l.follow);
      let k = l.persist ? 1 : Math.min(1, l.life / Math.max(0.001, l.max) * 1.5);
      if (l.flicker) { l.phase += dt; k *= 0.75 + 0.25 * Math.sin(l.phase * 13) * Math.sin(l.phase * 7.3) + Math.random() * 0.1; }
      const d = l.pos.distanceTo(cam) - l.range;
      cands.push({ l, k, score: d });
    }
    for (const l of this.staticFlicker) {
      l.phase += dt;
      const k = l.flickerOnly ? (0.5 + 0.5 * Math.sin(l.phase * 11) * Math.sin(l.phase * 5.7)) : 0.85 + 0.15 * Math.sin(l.phase * 9);
      const d = l.pos.distanceTo(cam) - l.range;
      if (d < 40) cands.push({ l, k: l.flickerOnly ? k : k, score: d + 2 });
    }
    cands.sort((a, b) => a.score - b.score);
    for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
      const c = cands[i];
      if (c) { G.uPointPos.value[i].copy(c.l.pos); G.uPointColor.value[i].copy(c.l.base || c.l.color).multiplyScalar(c.k); G.uPointRange.value[i] = c.l.range; }
      else { G.uPointPos.value[i].set(0, -9999, 0); G.uPointColor.value[i].setRGB(0, 0, 0); G.uPointRange.value[i] = 1; }
    }
    // flashlights
    let si = 0;
    const order = this.survivors.slice().sort((a, b) => (b.isPlayer ? 1 : 0) - (a.isPlayer ? 1 : 0));
    for (const s of order) {
      if (si >= MAX_SPOT_LIGHTS) break;
      if (!s.flashlight || s.state === 'dead') continue;
      const eye = s.eyePos(_v2);
      const dir = s.aimDir(_v3);
      if (s.isPlayer && this.cameraMode === 'fp') { eye.addScaledVector(dir, 0.2); eye.y -= 0.12; }
      G.uSpotPos.value[si].copy(eye);
      G.uSpotDir.value[si].copy(dir);
      G.uSpotColor.value[si].setRGB(1.25, 1.2, 1.05);
      G.uSpotParams.value[si].set(Math.cos(0.42), Math.cos(0.18), 22);
      si++;
    }
    for (; si < MAX_SPOT_LIGHTS; si++) { G.uSpotColor.value[si].setRGB(0, 0, 0); G.uSpotPos.value[si].set(0, -9999, 0); }
  }

  /** Light probe for dynamic objects (cached on a 1m grid). */
  probeAt(pos, out) {
    const kx = Math.floor(pos.x), ky = Math.floor(pos.y + 0.5), kz = Math.floor(pos.z);
    const key = kx * 73856093 ^ ky * 19349663 ^ kz * 83492791;
    let c = this.probeCache.get(key);
    if (!c) {
      c = new THREE.Color(0, 0, 0);
      const b = this.builder;
      const px = kx + 0.5, py = ky + 0.6, pz = kz + 0.5;
      const N = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
      for (const n of N) { const r = b.bakeVertex(px, py, pz, n[0], n[1], n[2], b.shootBVH, _c); c.r += r.r; c.g += r.g; c.b += r.b; }
      c.multiplyScalar(1 / N.length * 0.95);
      this.probeCache.set(key, c);
    }
    return out ? out.copy(c) : c;
  }

  // ------------------------------------------------------------------ audio / messages / voice
  sound(name, pos, opts = {}) {
    if (!this.audio || !this.audio.ready) return null;
    const o = { ...opts };
    if (pos) o.pos = pos;
    if (opts.delay) { this.after(opts.delay, () => this.audio.play(name, { ...o, delay: 0 })); return null; }
    if (pos && this.camPos && o.occlusion === undefined && opts.occlude !== false) {
      const d2 = pos.distanceToSquared(this.camPos);
      if (d2 > 4 && d2 < 3600 && (this.frame % 2 === 0)) o.occlusion = this.collision.blocked(this.camPos, pos, { dynamic: false }) ? 0.7 : 0;
    }
    return this.audio.play(name, o);
  }
  footstep(s, vol = 1) {
    const g = this.collision.groundAt(s.body.pos.x, s.body.pos.y + 0.2, s.body.pos.z, 0.6);
    const surf = g ? g.surface : 1;
    const name = { 2: 'step_metal', 3: 'step_wood', 4: 'step_carpet', 5: 'step_tile', 7: 'step_gravel', 8: 'step_grass', 9: 'step_water', 11: 'step_gravel' }[surf] || 'step_concrete';
    this.sound(name, s.body.pos, { volume: (s.isPlayer ? 0.45 : 0.35) * vol, randomPitch: 0.08, priority: 0, occlude: false });
  }
  chainsawSound(s, on) {
    if (on && !s.sawSnd) s.sawSnd = this.sound('chainsaw_cut', s.body.pos, { loop: true, follow: { position: s.body.pos } });
    if (!on && s.sawSnd) { s.sawSnd.stop(0.1); s.sawSnd = null; }
  }
  message(text, kind = 'info') {
    this.messages.push({ text, kind, t: 6 });
    if (this.messages.length > 6) this.messages.shift();
  }
  speak(s, key, chance = 1) {
    if (!s || s.state === 'dead' || Math.random() > chance) return;
    const lines = VOICE[s.id] && VOICE[s.id][key] || VOICE.common[key];
    if (!lines) return;
    const now = this.time;
    if ((s.speechCd[key] || -99) > now) return;
    if ((s.speechCd._any || -99) > now && key !== 'incap' && key !== 'pinned') return;
    s.speechCd[key] = now + (VOICE.cooldowns[key] || 8);
    s.speechCd._any = now + 1.5;
    const text = lines[(Math.random() * lines.length) | 0];
    this.subtitles.push({ who: s.name, text, t: 3.5 });
    if (this.subtitles.length > 3) this.subtitles.shift();
    this.events.emit('speech', s, key, text);
    if (this.game.voice) this.game.voice.say(s, text);
  }
  updateMessages(dt) {
    for (let i = 0; i < this.messages.length; i++) { this.messages[i].t -= dt; if (this.messages[i].t <= 0) { this.messages.splice(i, 1); i--; } }
    for (let i = 0; i < this.subtitles.length; i++) { this.subtitles[i].t -= dt; if (this.subtitles[i].t <= 0) { this.subtitles.splice(i, 1); i--; } }
  }

  checkWipe(dt) {
    if (this.ended) return;
    const up = this.survivors.filter((s) => s.state === 'alive' && !(s.pinnedBy && s.pinnedBy.type !== 'jockey'));
    const anyFree = this.survivors.some((s) => s.state === 'alive' && !s.pinnedBy);
    const allGone = this.survivors.every((s) => s.state === 'dead' || s.state === 'incap' || s.state === 'ledge' || (s.pinnedBy && s.state !== 'alive'));
    if (!anyFree && allGone) {
      this.wipeT = (this.wipeT || 0) + dt;
      if (this.wipeT > 1.5) { this.ended = 'wipe'; this.events.emit('wipe'); }
    } else this.wipeT = 0;
  }

  dispose() {
    for (const s of this.survivors) s.dispose();
    for (const z of this.infected) z.remove();
    this.scene.clear(); this.glowScene.clear();
    this.events.h = {};
  }
}

// distance-based ray vs vertical segment test; returns t or null
function raySegDist(o, d, a, b, r) {
  const ux = d.x, uy = d.y, uz = d.z;
  const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z;
  const wx = o.x - a.x, wy = o.y - a.y, wz = o.z - a.z;
  const A_ = 1, B_ = ux * vx + uy * vy + uz * vz, C_ = vx * vx + vy * vy + vz * vz, D_ = ux * wx + uy * wy + uz * wz, E_ = vx * wx + vy * wy + vz * wz;
  const den = A_ * C_ - B_ * B_;
  let t = den > 1e-8 ? (A_ * E_ - B_ * D_) / den : 0;
  t = Math.max(0, Math.min(1, t));
  let s = B_ * t - D_;
  if (s < 0) return null;
  const px = o.x + ux * s - (a.x + vx * t), py = o.y + uy * s - (a.y + vy * t), pz = o.z + uz * s - (a.z + vz * t);
  const d2 = px * px + py * py + pz * pz;
  if (d2 > r * r) return null;
  return s - Math.sqrt(r * r - d2);
}
