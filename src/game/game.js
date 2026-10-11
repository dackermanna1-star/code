// The game: players, simulation tick (100 Hz like fps_max 100), camera, view model,
// weapons, damage, grenades, rounds and bots.

import * as THREE from 'three';
import { Player, TEAM_T, TEAM_CT, TEAM_SPEC } from './player.js';
import { PlayerMover, IN_JUMP, IN_DUCK, IN_WALK, HULL_STAND, HULL_DUCK, VEC_VIEW, PLAYER_MAX_SAFE_FALL_SPEED, PLAYER_FATAL_FALL_SPEED } from '../engine/pmove.js';
import { makeDynamicBox, setDynamicBox, TraceResult, MASK_SHOT, MASK_WORLD_PLAYER, MASK_PLAYER } from '../engine/collision.js';
import { angleVectors, DEG } from '../engine/coords.js';
import { createViewModel } from '../assets/viewmodels.js';
import { createPlayerModel, PLAYER_SKINS } from '../assets/playermodels.js';
import { createDroppedWeapon } from '../assets/worldweapons.js';
import * as WS from './weaponsys.js';
import * as CR from './combatrules.js';
import { Effects } from './effects.js';
import { BulletCam } from './bulletcam.js';
import { MapEntities } from './mapents.js';
import { Hostages } from './hostages.js';
import { ZombieMode, MASK_ZOMBIE_MOVE, MASK_HUMAN_MOVE } from './zombies.js';
import { FireSystem } from './fire.js';
import { Projectiles } from './projectiles.js';
import { Gore } from './gore.js';
import { BossDirector } from './bosses.js';
import { NavGraph } from './nav.js';
import { RoundManager } from './rounds.js';
import { BotManager } from './bots.js';
import { Grenades } from './grenades.js';
import { RagdollSystem } from './ragdoll.js';
import { surfaceOfBrush } from './surfaces.js';
import { lightCurve } from '../map/meshbuilder.js';

export const TICK = 0.01;

// weaponsys sound names -> sound bank names
const SOUND_ALIAS = {
  knife_slash1: 'knife_slash', knife_slash2: 'knife_slash', knife_hit1: 'knife_hit', knife_hit2: 'knife_hit', knife_hit3: 'knife_hit', knife_hit4: 'knife_hit',
  knife_hitwall1: 'knife_hitwall', knife_deploy1: 'knife_deploy', c4_plant: 'c4_planted',
  usp_silencer_on: 'silencer_screw', usp_silencer_off: 'silencer_screw', m4a1_silencer_on: 'silencer_screw', m4a1_silencer_off: 'silencer_screw',
  reload1: 'shotgun_insert', reload3: 'shotgun_insert', m3_insertshell: 'shotgun_insert', m3_pump: 'shotgun_pump',
};

const HUD_TEXT = {
  '#C4_Plant_At_Bomb_Spot': 'C4 must be planted at a bomb site!',
  '#C4_Plant_Must_Be_On_Ground': 'You must be standing on\nthe ground to plant the C4!',
  '#C4_Arming_Cancelled': 'Arming Sequence Canceled.\nC4 can only be placed at a Bomb Target.',
  '#Switch_To_BurstFire': 'Switched to Burst-Fire mode',
  '#Switch_To_FullAuto': 'Switched to Automatic',
  '#Switch_To_SemiAuto': 'Switched to Semi-Automatic',
};
export const BTN_ATTACK = 1, BTN_ATTACK2 = 2, BTN_RELOAD = 4, BTN_USE = 8;

const tmpTr = new TraceResult();
const _f = [0, 0, 0], _r = [0, 0, 0], _u = [0, 0, 0];

export class Game {
  constructor(env) {
    Object.assign(this, env); // renderer, input, sound, texLib, W, hud, menus, settings
    this.collision = this.W.collision;
    this.map = this.W.map;
    this.time = 0;
    this.players = [];
    this.local = null;
    this.mover = new PlayerMover(this.collision);
    this.effects = new Effects(this);
    this.bulletCam = new BulletCam(this);
    this.grenades = new Grenades(this);
    this.ragdolls = new RagdollSystem(this.collision);
    this.dropped = []; // weapons on the ground { weapon, pos, vel, obj, rest }
    this.acc = 0;
    this.vmCache = new Map();
    this.vm = null;
    this.viewTarget = null;
    this.spectate = { mode: 'death', target: null, until: 0, free: [0, 0, 0], angles: [0, 0, 0] };
    this.bob = { time: 0, value: 0 };
    this.oldz = 0;
    this.lastViewZ = 0;
    this.raycaster = new THREE.Raycaster();
    this.paused = false;
    this.started = false;
    this.zoomFov = 0;
    this.lightOut = [1, 1, 1];
    this.listeners = [];
    this.spawns = {
      T: this.map.entities.filter((e) => e.classname === 'info_player_deathmatch'),
      CT: this.map.entities.filter((e) => e.classname === 'info_player_start'),
    };
    this.bombTargets = this.map.entities.filter((e) => e.classname === 'func_bomb_target');
    this.buyZones = this.map.entities.filter((e) => e.classname === 'func_buyzone');
    const seeds = [...this.spawns.T, ...this.spawns.CT].map((e) => [e.origin[0], e.origin[1], e.origin[2] - 36]);
    // doors open when walked into: build the graph through them
    const doors = (this.W.brushEnts || []).filter((be) => be.handle && /^func_door/.test(be.classname));
    for (const d of doors) d.handle.active = false;
    this.nav = new NavGraph(this.collision, this.map.bounds).build(seeds);
    for (const d of doors) d.handle.active = true;
    this.mapEnts = new MapEntities(this); // doors, breakables, buttons (BSP maps)
    this.hostages = new Hostages(this); // hostage rescue (cs_ maps)
    this.zombies = new ZombieMode(this); // zombie survival mode
    this.bosses = new BossDirector(this); // ...and its bosses
    this.fire = new FireSystem(this); // molotovs, flamethrower, burning
    this.projectiles = new Projectiles(this); // rockets, 40 mm, bottles, boss fireballs / acid
    this.gore = new Gore(this); // gibs, permanent bodies
    this.shake = null;
    this.rounds = new RoundManager(this);
    this.bots = new BotManager(this);
  }

  // ------------------------------------------------------------------ setup
  newGame(opts) {
    for (const p of this.players) this.removePlayer(p, true);
    this.players = [];
    this.effects.clearAll();
    this.grenades.clear();
    this.fire.clear();
    this.projectiles.clear();
    this.gore.clear();
    this.clearDropped();
    this.rounds.configure(opts);
    this.time = 0;
    const local = new Player({ name: opts.playerName || 'Player', team: TEAM_SPEC });
    local.isLocal = true;
    this.local = local;
    this.addPlayer(local);
    this.bots.populate(opts);
    this.rounds.startMatch();
    this.started = true;
  }

  addPlayer(p) {
    p.box = makeDynamicBox(p);
    this.collision.dynamic.push(p.box);
    this.players.push(p);
    p.money = this.rounds.startMoney;
    return p;
  }

  removePlayer(p, silent, keepModel = false) {
    if (p.model && !keepModel) p.model.dispose();
    p.model = null;
    const i = this.collision.dynamic.indexOf(p.box);
    if (i >= 0) this.collision.dynamic.splice(i, 1);
    this.players = this.players.filter((q) => q !== p);
  }

  joinTeam(p, team, skin = null) {
    if (p.team === team && p.skin && !skin) return;
    const wasAlive = p.alive;
    if (wasAlive && p.team !== TEAM_SPEC && p.team !== team) this.killPlayer(p, null, 'world', false, true);
    p.team = team;
    if (team === TEAM_SPEC) { p.skin = null; return; }
    const skins = team === TEAM_T ? PLAYER_SKINS.t : PLAYER_SKINS.ct;
    p.skin = skin || skins[Math.floor(Math.random() * skins.length)];
    if (p.model) { p.model.dispose(); p.model = null; }
    p.model = createPlayerModel(p.skin);
    p.model.object3D.visible = false;
    this.renderer.world.add(p.model.object3D);
    // joining during freeze time (or before anyone could have moved) spawns immediately
    if (this.rounds.canSpawnLate()) this.spawnPlayer(p);
  }

  spawnPoint(team, used, self) {
    const list = this.spawns[team];
    // CS SelectSpawnPoint: walk the list from a random start and take the first
    // spot with no other player within 64 units (IsSpawnPointValid)
    const occupied = (s) => used.has(s) || this.players.some((q) => q !== self && q.alive && q.box?.active &&
      Math.abs(q.pm.origin[0] - s.origin[0]) < 64 && Math.abs(q.pm.origin[1] - s.origin[1]) < 64 && Math.abs(q.pm.origin[2] - s.origin[2]) < 72);
    const start = Math.floor(Math.random() * list.length);
    let s = null;
    for (let i = 0; i < list.length && !s; i++) if (!occupied(list[(start + i) % list.length])) s = list[(start + i) % list.length];
    s = s || list[start];
    used.add(s);
    return s;
  }

  spawnPlayer(p, used = new Set()) {
    if (p.team !== TEAM_T && p.team !== TEAM_CT) return;
    p.box.active = false;
    const s = this.spawnPoint(p.team, used, p);
    p.resetForSpawn(s.origin, s.angle);
    // keep weapons if survived, else default loadout
    if (!p.weapons[3]) p.weapons[3] = this.newWeapon('knife');
    if (!p.weapons[2] && !p.weapons[1]) {
      p.weapons[2] = this.newWeapon(p.team === TEAM_T ? 'glock' : 'usp', true);
    } else if (!p.weapons[2]) {
      p.weapons[2] = this.newWeapon(p.team === TEAM_T ? 'glock' : 'usp', true);
    }
    p.active = null;
    if (p.isLocal) {
      this.viewTarget = p;
      this.oldz = p.pm.origin[2];
    }
    const best = p.weapons[1] || p.weapons[2] || p.weapons[3];
    this.selectWeapon(p, best, true);
    if (p.model) {
      p.model.object3D.visible = !p.isLocal || this.viewTarget !== p;
      p.model.reset?.();
    }
    p.deadBodyVisible = false;
    p.box.active = true;
    setDynamicBox(p.box, p.pm.origin, p.hull().mins, p.hull().maxs);
  }

  newWeapon(id, spawnAmmo = false) {
    const spawnRes = CR.RULES.spawn?.T?.reserve?.[id] ?? CR.RULES.spawn?.CT?.reserve?.[id] ?? (spawnAmmo ? WS.WEAPON_DEFS[id]?.spawnReserve : null);
    return WS.createWeapon(id, spawnAmmo && spawnRes != null ? { reserve: spawnRes } : {});
  }

  // ------------------------------------------------------------------ weapons
  giveWeapon(p, id, { select = true, fullAmmo = false } = {}) {
    const def = WS.WEAPON_DEFS[id];
    if (!def) return null;
    const slot = def.slot;
    if (slot === 4) {
      const have = p.weapons[4].filter((g) => g.id === id);
      const max = id === 'flashbang' ? 2 : id === 'molotov' ? 3 : 1;
      if (have.length) {
        const g = have[0];
        if ((g.count || 1) >= max) return null;
        g.count = (g.count || 1) + 1;
        return g;
      }
      const g = this.newWeapon(id);
      g.count = 1;
      p.weapons[4].push(g);
      if (select && !p.active) this.selectWeapon(p, g);
      return g;
    }
    if (p.weapons[slot]) this.dropWeapon(p, p.weapons[slot], false);
    const w = this.newWeapon(id);
    if (fullAmmo) w.ammo = def.maxAmmo;
    p.weapons[slot] = w;
    if (select) this.selectWeapon(p, w);
    return w;
  }

  weaponCtx(p) {
    const g = this;
    const ctx = p._ctx || (p._ctx = {
      punch: null,
      setFov(f) { p.fov = f || 90; if (p === g.viewTarget) g.renderer.setZoom(p.fov === 90 ? 0 : p.fov); },
      fireBullets: (o) => g.fireBullets(p, o),
      knifeTrace: (range) => g.knifeTrace(p, range),
      knifeDamage: (target, dmg, hg) => g.damagePlayer(target, p, dmg, hg ?? CR.HITGROUP.GENERIC, 'knife', null),
      throwGrenade: (type, params) => g.grenades.throw(p, type, params),
      flame: () => { g.fire.stream(p); p.lastShot = g.time; },
      launch: (type) => g.launchFrom(p, type),
      plantBomb: () => g.rounds.plantBomb(p),
      canPlant: () => g.rounds.canPlant(p),
      playSound: (name, opts = {}) => g.weaponSound(p, name, opts),
      playAnim: (name, opts = {}) => { g.onWeaponAnim(p, name, opts); },
      emitShell: (type) => g.ejectShell(p, type),
      random: Math.random,
      randomInt: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
      onEmpty: () => {},
      retire: (w) => g.retireWeapon(p, w),
      event: (type, data) => g.weaponEvent(p, type, data),
    });
    ctx.time = this.time;
    ctx.dt = TICK;
    ctx.onGround = p.pm.onground;
    ctx.ducking = p.pm.ducking;
    ctx.speed2d = Math.hypot(p.pm.velocity[0], p.pm.velocity[1]);
    ctx.waterLevel = 0;
    ctx.punch = p.pm.punch;
    ctx.fov = p.fov;
    ctx.player = p;
    ctx.viewAngles = p.pm.angles;
    ctx.inBombZone = p.team === TEAM_T && !!this.bombZoneOf(p) && this.rounds.state === 'live';
    ctx.isDefusing = !!p.defusing;
    ctx.canShoot = !this.rounds.freeze;
    return ctx;
  }

  selectWeapon(p, w, instant = false) {
    if (!w || (p.active === w && !instant)) return;
    if (p.active && p.active !== w) {
      WS.weaponHolster(p.active, this.weaponCtx(p));
      p.lastWeapon = p.active;
    }
    p.active = w;
    p.fov = 90;
    if (p === this.viewTarget) {
      this.renderer.setZoom(0);
      this.setViewModel(w);
    }
    WS.weaponDeploy(w, this.weaponCtx(p));
    p.pm.maxspeed = WS.weaponMaxSpeed(w, false);
    p.model?.setWeapon(w.id);
  }

  setViewModel(w) {
    const r = this.renderer;
    if (this.vm) r.vmScene.remove(this.vm.object3D);
    this.vm = null;
    if (!w) return;
    const key = w.id;
    let vm = this.vmCache.get(key);
    if (!vm) {
      try { vm = createViewModel(w.id, { silenced: !!w.silenced }); } catch (e) { console.warn(e); return; }
      this.vmCache.set(key, vm);
    }
    if (vm.setSilencer) vm.setSilencer(!!w.silenced);
    r.vmScene.add(vm.object3D);
    this.vm = vm;
  }

  slotCommand(p, slot) {
    if (!p.alive) return;
    if (slot === 4) {
      const g = p.weapons[4];
      if (!g.length) return;
      const i = g.indexOf(p.active);
      this.selectWeapon(p, g[(i + 1) % g.length]);
      return;
    }
    const w = p.weapons[slot];
    if (w) this.selectWeapon(p, w);
  }

  cycleWeapon(p, dir) {
    const list = [p.weapons[1], p.weapons[2], p.weapons[3], ...p.weapons[4], p.weapons[5]].filter(Boolean);
    if (!list.length) return;
    const i = list.indexOf(p.active);
    this.selectWeapon(p, list[(i + dir + list.length) % list.length]);
  }

  lastInv(p) {
    if (p.lastWeapon && p.allWeapons().includes(p.lastWeapon)) this.selectWeapon(p, p.lastWeapon);
  }

  removeWeaponFromInventory(p, w) {
    for (const s of [1, 2, 3, 5]) if (p.weapons[s] === w) p.weapons[s] = null;
    p.weapons[4] = p.weapons[4].filter((g) => g !== w);
    if (p.lastWeapon === w) p.lastWeapon = null;
  }

  dropWeapon(p, w, selectNext = true, vel = null) {
    if (!w || w.id === 'knife') return;
    if (w.def.slot === 4) return; // grenades are not dropped in 1.6 (only thrown)
    this.removeWeaponFromInventory(p, w);
    if (p.active === w) {
      p.active = null;
      if (selectNext) this.selectWeapon(p, p.weapons[1] || p.weapons[2] || p.weapons[3] || p.weapons[4][0]);
    }
    const f = [0, 0, 0];
    angleVectors(p.pm.angles[0], p.pm.angles[1], f, null, null);
    const pos = p.eyePos();
    pos[2] -= 12;
    const v = vel || [f[0] * 300 + p.pm.velocity[0], f[1] * 300 + p.pm.velocity[1], f[2] * 300 + 100];
    this.spawnDropped(w, pos, v);
    if (w.id === 'c4') this.rounds.onBombDropped(p);
  }

  spawnDropped(w, pos, vel) {
    let obj;
    try { obj = createDroppedWeapon(w.id); } catch { obj = new THREE.Group(); }
    obj.position.set(pos[0], pos[1], pos[2]);
    this.renderer.world.add(obj);
    this.dropped.push({ weapon: w, pos: pos.slice(), vel: vel.slice(), obj, rest: false, time: this.time });
  }

  clearDropped() {
    for (const d of this.dropped) { d.obj.removeFromParent(); d.obj.userData.dispose?.(); }
    this.dropped = [];
  }

  updateDropped(dt) {
    const h = { mins: [-6, -6, 0], maxs: [6, 6, 4] };
    for (const d of this.dropped) {
      if (!d.rest) {
        d.vel[2] -= 800 * dt;
        const end = [d.pos[0] + d.vel[0] * dt, d.pos[1] + d.vel[1] * dt, d.pos[2] + d.vel[2] * dt];
        this.collision.trace(d.pos, end, h.mins, h.maxs, MASK_WORLD_PLAYER, tmpTr);
        if (tmpTr.fraction < 1) {
          d.pos = tmpTr.endpos.slice();
          if (tmpTr.normal[2] > 0.7) { d.rest = true; d.vel = [0, 0, 0]; }
          else {
            const n = tmpTr.normal, dd = d.vel[0] * n[0] + d.vel[1] * n[1] + d.vel[2] * n[2];
            d.vel = [(d.vel[0] - 1.5 * dd * n[0]) * 0.4, (d.vel[1] - 1.5 * dd * n[1]) * 0.4, (d.vel[2] - 1.5 * dd * n[2]) * 0.4];
          }
        } else d.pos = end;
        d.obj.position.set(d.pos[0], d.pos[1], d.pos[2]);
        if (d.rest) d.obj.rotation.set(0, 0, Math.random() * Math.PI * 2);
      }
      // pickup by walking over (after a short delay)
      if (this.time - d.time < 0.5) continue;
      for (const p of this.players) {
        if (!p.alive) continue;
        const o = p.pm.origin;
        if (Math.abs(o[0] - d.pos[0]) > 28 || Math.abs(o[1] - d.pos[1]) > 28 || Math.abs(o[2] + p.hull().mins[2] - d.pos[2]) > 48) continue;
        if (this.tryPickup(p, d)) break;
      }
    }
    this.dropped = this.dropped.filter((d) => !d.taken);
  }

  tryPickup(p, d) {
    const w = d.weapon;
    if (w.id === 'c4') {
      if (p.team !== TEAM_T) return false;
      p.weapons[5] = w;
      this.rounds.onBombPickup(p);
    } else {
      const slot = w.def.slot;
      if (p.weapons[slot]) return false;
      p.weapons[slot] = w;
      if (p.isLocal || !p.active || p.active.id === 'knife') this.selectWeapon(p, w);
    }
    d.taken = true;
    d.obj.removeFromParent();
    d.obj.userData.dispose?.();
    if (p.isLocal) this.sound.play('ammo_pickup', { volume: 0.8 });
    return true;
  }

  weaponSound(p, name, opts) {
    name = SOUND_ALIAS[name] || name;
    const local = p === this.viewTarget;
    this.sound.play(name, {
      pos: local ? null : p.eyePos(),
      volume: opts.volume ?? 1,
      pitch: opts.pitch ?? 1,
      channel: opts.channel ? `${p.id}:${opts.channel}` : `${p.id}:weapon`,
      attenuation: opts.attenuation,
    });
    if (opts.loud !== false && /^(ak47|m4a1|awp|deagle|usp|glock|p228|elite|fiveseven|mp5|mac10|tmp|ump45|p90|galil|famas|sg552|aug|scout|g3sg1|sg550|m249|m3|xm1014|rpg_fire|m32_fire)$/.test(name)) {
      p.lastShot = this.time;
      this.bots.onNoise(p, p.eyePos(), name.includes('silenced') || name === 'tmp' ? 400 : 2000);
    }
  }

  ejectShell(p, type) {
    const eye = p.eyePos();
    angleVectors(p.pm.angles[0], p.pm.angles[1], _f, _r, _u);
    const o = [eye[0] + _f[0] * 16 + _r[0] * 6 - _u[0] * 6, eye[1] + _f[1] * 16 + _r[1] * 6 - _u[1] * 6, eye[2] + _f[2] * 16 + _r[2] * 6 - _u[2] * 6];
    const v = [_r[0] * (60 + Math.random() * 40) + _u[0] * 90 + p.pm.velocity[0], _r[1] * (60 + Math.random() * 40) + _u[1] * 90 + p.pm.velocity[1], _r[2] * 60 + _u[2] * 90 + p.pm.velocity[2]];
    this.effects.shell(o, v, type);
  }

  // ------------------------------------------------------------------ shooting
  fireBullets(p, o) {
    const ang = p.pm.angles, pu = p.pm.punch;
    angleVectors(ang[0] + pu[0], ang[1] + pu[1], _f, _r, _u);
    const src = p.eyePos();
    const dir = CR.fireShot({
      src, forward: _f.slice(), right: _r.slice(), up: _u.slice(),
      random: Math.random, ...o,
    }, (start, end, ignore) => this.traceShot(start, end, ignore ?? p), (hit) => this.onBulletImpact(p, hit, o));
    return dir;
  }

  /** Everything with hitboxes: players and (living, unrescued) hostages. */
  shootables() {
    const h = this.hostages?.list;
    return h && h.length ? this.players.concat(h.filter((q) => q.alive && !q.rescued)) : this.players;
  }

  // trace for bullets: world (brushes) + player hitboxes
  traceShot(start, end, ignore) {
    const tr = this.collision.trace(start, end, [0, 0, 0], [0, 0, 0], MASK_SHOT, new TraceResult());
    const res = { fraction: tr.fraction, endpos: tr.endpos, normal: tr.normal, entity: null, hitgroup: 0, surface: surfaceOfBrush(tr.brush?.userData, tr.normal), startsolid: tr.startsolid, allsolid: tr.allsolid, brushEnt: tr.ent || null };
    // players
    const dx = end[0] - start[0], dy = end[1] - start[1], dz = end[2] - start[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return res;
    const maxDist = len * tr.fraction;
    const rc = this.raycaster;
    rc.ray.origin.set(start[0], start[2], -start[1]);
    rc.ray.direction.set(dx / len, dz / len, -dy / len);
    rc.near = 0; rc.far = maxDist;
    let best = null;
    for (const q of this.shootables()) {
      if (!q.alive || q === ignore || !q.model) continue;
      // quick reject: distance from ray to player centre
      const o = q.pm.origin;
      const px = o[0] - start[0], py = o[1] - start[1], pz = o[2] - start[2];
      const t = (px * dx + py * dy + pz * dz) / len;
      if (t < -40 || t > maxDist + 40) continue;
      const cx = px - dx / len * t, cy = py - dy / len * t, cz = pz - dz / len * t;
      const rr = q.boss ? 60 * q.boss.scale + 30 : 60;
      if (cx * cx + cy * cy + cz * cz > rr * rr) continue;
      const boxes = q.model.getHitboxes();
      const hits = rc.intersectObjects(boxes, false);
      if (hits.length && (!best || hits[0].distance < best.distance)) best = { distance: hits[0].distance, player: q, hitgroup: hits[0].object.userData.hitgroup, point: hits[0].point };
    }
    if (best) {
      const f = best.distance / len;
      res.fraction = f;
      res.endpos = [start[0] + dx * f, start[1] + dy * f, start[2] + dz * f];
      res.entity = best.player;
      res.hitgroup = best.hitgroup;
      res.normal = [-dx / len, -dy / len, -dz / len];
      res.surface = 'flesh';
      res.brushEnt = null;
    }
    return res;
  }

  onBulletImpact(attacker, hit, o) {
    if (hit.entity) {
      const victim = hit.entity;
      // the bullet goes on through the body (FireBullets3 penetration left) -> exit wound;
      // a stopped round still tears through a head or a limb now and then
      const left = (o?.penetration ?? 1) - (hit.penetrated ?? 0) - 1;
      const thin = hit.hitgroup === CR.HITGROUP.HEAD || (hit.hitgroup >= CR.HITGROUP.LEFTARM && hit.hitgroup <= CR.HITGROUP.RIGHTLEG);
      const exit = left > 0 || (thin && hit.damage >= 20 && Math.random() < 0.5);
      this.damagePlayer(victim, attacker, hit.damage, hit.hitgroup, attacker.active?.id || 'world', hit.dir, hit.point, { exit });
    } else if (hit.point && hit.normal) {
      // zombie survival: bodies on the floor take the bullet (and come apart)
      if (this.zombies.enabled && hit.dir) {
        const a = attacker.eyePos();
        const ch = this.gore.corpseHit(a, hit.point, this.zombies.pool);
        if (ch) { this.gore.hitCorpse(ch, hit.damage, hit.dir); return; }
      }
      this.effects.impact(hit.point, hit.normal, hit.surface, hit.dir);
      if (hit.brushEnt) this.mapEnts.damage(hit.brushEnt, hit.damage, hit.point, hit.dir);
    }
  }

  knifeTrace(p, range) {
    angleVectors(p.pm.angles[0], p.pm.angles[1], _f, null, null);
    const src = p.eyePos();
    const end = [src[0] + _f[0] * range, src[1] + _f[1] * range, src[2] + _f[2] * range];
    let r = this.traceShot(src, end, p);
    if (r.fraction >= 1) {
      // CS falls back to a hull trace (small box) when the line misses
      const box = this.collision.trace(src, end, [-16, -16, -18], [16, 16, 18], MASK_SHOT, new TraceResult());
      if (box.fraction < 1) r = { ...r, fraction: box.fraction, endpos: box.endpos, normal: box.normal, surface: surfaceOfBrush(box.brush?.userData, box.normal) };
      else {
        // players within a small cone
        for (const q of this.players) {
          if (!q.alive || q === p) continue;
          const o = q.pm.origin;
          const d = Math.hypot(o[0] - src[0], o[1] - src[1]);
          if (d > range + 16) continue;
          const dir = [(o[0] - src[0]) / d, (o[1] - src[1]) / d];
          if (dir[0] * _f[0] + dir[1] * _f[1] < 0.85) continue;
          r = { ...r, fraction: d / range, entity: q, hitgroup: CR.HITGROUP.CHEST, endpos: o.slice() };
          break;
        }
      }
    }
    let behind = false;
    if (r.entity) {
      const q = r.entity;
      const qf = [0, 0, 0];
      angleVectors(0, q.pm.angles[1], qf, null, null);
      const to = [q.pm.origin[0] - p.pm.origin[0], q.pm.origin[1] - p.pm.origin[1]];
      const l = Math.hypot(to[0], to[1]) || 1;
      behind = (to[0] / l) * qf[0] + (to[1] / l) * qf[1] > 0.8;
    } else if (r.fraction < 1) {
      this.effects.decal('decal_bullet', r.endpos, r.normal, 5);
    }
    return { hit: r.fraction < 1, hitPlayer: r.entity, behind, fraction: r.fraction, hitgroup: r.hitgroup, point: r.endpos, normal: r.normal, surface: r.surface };
  }

  // ------------------------------------------------------------------ damage
  damagePlayer(victim, attacker, damage, hitgroup, weaponId, dir, point = null, opts = {}) {
    if (victim.isHostage) { this.hostages.damage(victim, attacker, damage, hitgroup, weaponId, dir, point, opts); return; }
    if (!victim.alive || damage <= 0) return;
    if (victim.boss) { damage = this.bosses.adjust(victim, attacker, damage, hitgroup, weaponId, opts); if (damage <= 0) return; }
    const teammate = !!(attacker && attacker !== victim && attacker.team === victim.team);
    const res = CR.computeDamage({ health: victim.health, armor: victim.armor, helmet: victim.helmet, ducking: victim.pm.ducking, speed: Math.hypot(victim.pm.velocity[0], victim.pm.velocity[1]) },
      damage, hitgroup, { attackerWeapon: weaponId, teammate, self: attacker === victim, friendlyFire: this.rounds.friendlyFire, blast: opts.blast });
    if (res.refused) return;
    if (victim.god) return;
    if (victim.boss) { res.knockback = 0; if (res.velocityModifier) res.velocityModifier = Math.max(res.velocityModifier, 0.9); } // too heavy to shove
    victim.health = res.health;
    victim.armor = res.armor;
    victim.helmet = res.helmet;
    victim.lastHurt = this.time;
    victim.lastAttacker = attacker;
    victim.lastHit = { time: this.time, dir, point, damage, hitgroup: res.hitgroup ?? hitgroup, weaponId, blast: !!opts.blast, explode: !!opts.explode, from: attacker && attacker !== victim ? attacker.pm.origin.slice() : null }; // ragdoll impulse
    if (res.velocityModifier) victim.pm.velocityModifier = Math.min(victim.pm.velocityModifier ?? 1, res.velocityModifier);
    if (res.knockback && dir) {
      victim.pm.velocity[0] += dir[0] * res.knockback;
      victim.pm.velocity[1] += dir[1] * res.knockback;
    }
    if (res.victimPunch) {
      if (res.victimPunch.x != null) victim.pm.punch[0] = res.victimPunch.x;
      if (res.victimPunch.z != null) victim.pm.punch[2] = res.victimPunch.z;
    }
    const pos = point || victim.eyePos();
    const head = (res.hitgroup ?? hitgroup) === CR.HITGROUP.HEAD;
    const bleedDir = dir || (weaponId === 'knife' && attacker && attacker !== victim ? this.effects.dirFrom(attacker.eyePos(), pos) : null);
    // every flesh hit shows blood, kevlar or not (the server-side bShouldBleed only drove
    // TraceBleed; the 1.6 client drew the blood spray on any player hit)
    const flesh = !(teammate && !this.rounds.friendlyFire);
    if (dir && head && res.helmetHit) this.effects.sprite({ tex: 'spr_spark', pos: pos.slice(), size: 4, life: 0.2, additive: true });
    if (bleedDir && flesh) {
      const dmg = res.damageToHealth || damage;
      this.effects.blood(pos, bleedDir, dmg, { head, victim, blast: !!opts.blast, exit: !!opts.exit });
      if (!opts.blast) this.effects.wound(victim, pos, bleedDir, { head, exit: !!opts.exit, damage: dmg, knife: weaponId === 'knife' });
    }
    if (opts.blast) { if ((opts.fire || opts.acid) && victim.isLocal && Math.random() < 0.3) this.sound.play('pain', { volume: 0.5 }); }
    else if (head) this.sound.play(res.helmetHit ? 'hit_kevlar' : 'headshot', { pos, volume: 1 });
    else if (!res.bleed) this.sound.play('hit_kevlar', { pos, volume: 0.8 });
    else this.sound.play('hit_flesh', { pos, volume: 0.9 });
    if (victim === this.local && attacker && attacker !== victim) this.hudDamage(attacker);
    if (victim.isBot) this.bots.onHurt(victim, attacker);
    if (victim.health <= 0) this.killPlayer(victim, attacker, weaponId, head && !opts.blast);
    else if (!opts.blast && Math.random() < (victim.isZombie ? 0.35 : 0.25)) this.sound.play(victim.isZombie ? 'zombie_pain' : 'pain', { pos, volume: 0.6, channel: victim.isZombie ? `${victim.id}:voice` : null });
  }

  // velocity "tagging" recovery: +0.01 per on-ground frame (CBasePlayer::PreThink)
  recoverVelocityModifier(p) {
    const pm = p.pm;
    if (pm.velocityModifier < 1 && pm.onground) pm.velocityModifier = Math.min(1, pm.velocityModifier + 0.01);
  }

  hudDamage(attacker) {
    const a = this.local;
    const dx = attacker.pm.origin[0] - a.pm.origin[0], dy = attacker.pm.origin[1] - a.pm.origin[1];
    const ang = Math.atan2(dy, dx) / DEG - a.pm.angles[1];
    const n = ((ang % 360) + 540) % 360 - 180;
    const d = Math.abs(n) < 45 ? 'front' : Math.abs(n) > 135 ? 'back' : n > 0 ? 'left' : 'right';
    (this.damageIndicators || (this.damageIndicators = [])).push({ dir: d, t: this.time });
  }

  killPlayer(victim, attacker, weaponId, headshot, suicide = false) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.health = 0;
    victim.deathTime = this.time;
    victim.deaths++;
    victim.box.active = false;
    victim.planting = victim.defusing = false;
    this.rounds.onDefuseInterrupted?.(victim);
    // score & money
    if (attacker && attacker !== victim) {
      if (attacker.team === victim.team) {
        attacker.kills--;
        this.rounds.addMoney(attacker, CR.RULES.teamKillPenalty ? -CR.RULES.teamKillPenalty : -3300);
      } else {
        attacker.kills++;
        this.rounds.addMoney(attacker, CR.RULES.killReward ?? 300);
      }
    } else if (!suicide) {
      victim.kills--;
    }
    const aName = attacker ? attacker.name : victim.name;
    this.hud?.addKill({ attacker: attacker && attacker !== victim ? aName : '', attackerTeam: attacker?.team, victim: victim.name, victimTeam: victim.team, weapon: weaponId === 'world' ? 'world' : weaponId, headshot });
    if (this.local) this.menus?.print?.(`${attacker && attacker !== victim ? aName + ' killed ' + victim.name : victim.name + ' died'}${weaponId && weaponId !== 'world' ? ' with ' + weaponId : ''}`);
    // drop primary (or pistol) and the bomb
    const pos = victim.eyePos();
    const dropW = victim.weapons[1] || victim.weapons[2];
    if (dropW) this.dropWeapon(victim, dropW, false, [Math.random() * 60 - 30, Math.random() * 60 - 30, 60]);
    if (victim.weapons[5]) this.dropWeapon(victim, victim.weapons[5], false, [Math.random() * 40 - 20, Math.random() * 40 - 20, 40]);
    // throw a live grenade? (not in CS) — just clear inventory
    victim.weapons = { 1: null, 2: null, 3: null, 4: [], 5: null };
    victim.active = null;
    victim.armor = 0; victim.helmet = false; victim.defuser = false;
    this.sound.play(victim.isZombie ? 'zombie_die' : 'die', { pos, volume: 1, channel: victim.isZombie ? `${victim.id}:voice` : null });
    this.effects.bloodPuddle(victim); // after ~0.5 s, follows the settling body
    if (victim.model) {
      victim.model.object3D.visible = true;
      victim.model.setWeapon?.(null);
      const kind = headshot ? 'headshot' : victim.pm.ducking ? 'crouch' : ['back', 'forward', 'left'][Math.floor(Math.random() * 3)];
      const hit = victim.lastHit && victim.lastHit.time === this.time ? victim.lastHit : null;
      const gz = victim.isZombie && !victim.isBoss && this.zombies.enabled && this.gore.enabled;
      if (gz && hit && (hit.explode || (hit.damage >= 150 && !headshot))) {
        // blown apart
        const d = hit.dir || [0, 0, 1];
        this.gore.gibPlayer(victim, [d[0], d[1], Math.max(0.3, d[2] || 0)], Math.min(2.2, 0.7 + hit.damage / 150));
      } else if (victim.noRagdoll || !this.ragdolls.spawn(victim.model, { origin: victim.pm.origin, velocity: victim.pm.velocity, hit, headshot, weaponId })) victim.model.playDeath(kind);
      if (gz && headshot && hit && !hit.blast && hit.damage >= 70 && !victim.gibbed) this.gore.popHead(victim, hit.dir || [1, 0, 0]);
    }
    this.bulletCam.trigger(attacker, victim, weaponId, headshot);
    if (victim === this.viewTarget) {
      this.setViewModel(null);
      this.renderer.setZoom(0);
      this.spectate = { mode: 'death', target: victim, killer: attacker, until: this.time + 3, angles: victim.pm.angles.slice() };
    }
    this.bots.onDeath(victim, attacker);
    this.rounds.onPlayerKilled(victim, attacker);
  }

  // ------------------------------------------------------------------ input
  localCommand(cmd) {
    const p = this.local;
    if (!p) return;
    const m = /^slot(\d+)$/.exec(cmd);
    if (m) {
      const n = +m[1];
      if (this.menus?.isOpen?.()) return;
      if (n >= 1 && n <= 5) this.slotCommand(p, n);
      return;
    }
    switch (cmd) {
      case 'lastinv': this.lastInv(p); break;
      case 'invnext': this.cycleWeapon(p, 1); break;
      case 'invprev': this.cycleWeapon(p, -1); break;
      case 'drop': if (p.alive && p.active) this.dropWeapon(p, p.active); break;
      case 'buyammo1': this.rounds.buy(p, 'primammo'); break;
      case 'buyammo2': this.rounds.buy(p, 'secammo'); break;
      default: break;
    }
  }

  buildLocalCmd() {
    const p = this.local, inp = this.input;
    const blocked = this.paused || this.menus?.isOpen?.() || this.chatting || !!this.bulletCam.active || !!this.mapEnts?.camera;
    const on = (n) => !blocked && inp.is(n);
    let buttons = 0;
    if (on('jump')) buttons |= IN_JUMP;
    if (on('duck')) buttons |= IN_DUCK;
    if (on('speed')) buttons |= IN_WALK;
    let wbtn = 0;
    if (on('attack')) wbtn |= BTN_ATTACK;
    if (on('attack2')) wbtn |= BTN_ATTACK2;
    if (on('reload')) wbtn |= BTN_RELOAD;
    if (on('use')) wbtn |= BTN_USE;
    return {
      forwardmove: (on('forward') ? 400 : 0) - (on('back') ? 400 : 0),
      sidemove: (on('moveright') ? 400 : 0) - (on('moveleft') ? 400 : 0),
      upmove: 0,
      buttons,
      wbuttons: wbtn,
    };
  }

  applyMouse() {
    const p = this.local;
    const [dx, dy] = this.input.consumeMouse();
    if (!p || this.paused || this.menus?.isOpen?.()) return;
    const zoom = p.fov < 90 ? p.fov / 90 * 1.2 : 1; // zoom_sensitivity_ratio 1.2
    const s = 0.022 * this.input.sensitivity * zoom;
    if (p.alive) {
      p.pm.angles[1] -= dx * s;
      p.pm.angles[0] += dy * s * (this.input.invertY ? -1 : 1);
      p.pm.angles[0] = Math.max(-89, Math.min(89, p.pm.angles[0]));
      p.pm.angles[1] = ((p.pm.angles[1] % 360) + 360) % 360;
    } else {
      const a = this.spectate.angles || (this.spectate.angles = [0, 0, 0]);
      a[1] -= dx * s;
      a[0] = Math.max(-89, Math.min(89, a[0] + dy * s));
    }
  }

  // ------------------------------------------------------------------ simulation
  tick() {
    this.time += TICK;
    const local = this.local;
    // local command
    if (local) {
      const c = this.buildLocalCmd();
      local.cmd = c;
    }
    this.bots.think(TICK);
    this.zombies.think(TICK);
    for (const p of this.players) {
      if (!p.alive) continue;
      const cmd = p.cmd || { forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: 0 };
      this.simulatePlayer(p, cmd);
    }
    this.mapEnts.update(TICK);
    this.hostages.update(TICK);
    this.grenades.update(TICK);
    this.projectiles.update(TICK);
    this.fire.update(TICK);
    this.updateDropped(TICK);
    this.rounds.tick(TICK);
  }

  simulatePlayer(p, cmd) {
    const pm = p.pm;
    pm.frozen = this.rounds.freeze || p.planting || p.defusing;
    this.recoverVelocityModifier(p);
    const w = p.active;
    const zoomed = p.fov < 90;
    pm.maxspeed = p.isZombie ? (p.speedNow ?? p.zSpeed) : w ? WS.weaponMaxSpeed(w, zoomed) : 250;
    p.prevOrigin = pm.origin.slice();
    this.mover.ignore = p.box;
    p.box.active = false; // don't collide with own box
    if (this.zombies.enabled) this.mover.mask = p.isZombie ? MASK_ZOMBIE_MOVE : MASK_HUMAN_MOVE;
    this.mover.move(pm, cmd, TICK);
    this.mover.mask = MASK_PLAYER;
    p.box.active = true;
    setDynamicBox(p.box, pm.origin, p.hull().mins, p.hull().maxs);
    if (cmd.forwardmove || cmd.sidemove) p.hasMovedSinceSpawn = true;
    // movement events
    for (const e of pm.events) this.onMoveEvent(p, e);
    pm.events.length = 0;
    // weapons
    const ctx = this.weaponCtx(p);
    let wb = cmd.wbuttons || 0;
    if (this.rounds.freeze) wb &= ~(BTN_ATTACK | BTN_ATTACK2);
    if (w) {
      WS.weaponFrame(w, ctx, wb, p.prevWButtons || 0);
      if (w.spent) {
        w.spent = false;
        if (w.def.slot === 4) {
          w.count = Math.max(0, (w.count || 1) - 1);
          if (w.id === 'molotov' && w.count > 0) w.ammo = w.count; // keep the next bottle in hand
        }
        if (w.id === 'c4') this.retireWeapon(p, w);
      }
    }
    p.planting = !!(p.active && p.active.id === 'c4' && p.active.startedArming);
    this.processWeaponSounds(p);
    p.prevWButtons = wb;
    if ((wb & BTN_USE) && !p.prevUse && !this.rounds.bomb?.defuser) {
      if (!this.hostages.use(p)) this.mapEnts.use(p);
    }
    this.rounds.useButton(p, !!(wb & BTN_USE), !!((p.prevUse || 0)));
    p.prevUse = wb & BTN_USE;
  }

  // weapon used up (grenade thrown, C4 planted) or switched away from (flashbang quirk)
  retireWeapon(p, w) {
    const empty = (w.def.slot === 4 && (w.count ?? 0) <= 0) || w.id === 'c4';
    if (empty) this.removeWeaponFromInventory(p, w);
    if (p.active === w) {
      p.active = null;
      const next = p.weapons[1] || p.weapons[2] || p.weapons[4].find((g) => g !== w && (g.count ?? 1) > 0) || p.weapons[3];
      this.selectWeapon(p, next, true);
    }
  }

  // events emitted by weaponsys
  weaponEvent(p, type, data = {}) {
    const local = p === this.viewTarget;
    switch (type) {
      case 'muzzleflash':
        if (local) this.vmFlash = this.time;
        else {
          const e = p.eyePos();
          angleVectors(p.pm.angles[0], p.pm.angles[1], _f, null, null);
          this.effects.muzzleFlash([e[0] + _f[0] * 30, e[1] + _f[1] * 30, e[2] - 8 + _f[2] * 30], p.active?.silenced ? 6 : 14);
        }
        break;
      case 'hud_message':
        if (p.isLocal) this.hud?.centerPrint?.(HUD_TEXT[data.text] || data.text, 2);
        break;
      case 'progress_bar':
        if (p.isLocal) this.progress = data.time ? { start: this.time, end: this.time + data.time } : null;
        break;
      case 'radio':
        if (data.message === 'fire_in_the_hole') this.rounds.radio(p, 'Fire in the hole!');
        break;
      case 'reload_sound':
        break;
      default:
    }
  }

  // view model animation + the sound events GoldSrc plays from the model's sequences
  onWeaponAnim(p, name, opts) {
    const w = p.active;
    if (p === this.viewTarget && this.vm) this.vm.play(name, opts);
    if (!w) return;
    const dur = opts.duration ?? this.vm?.duration?.(name) ?? 1;
    const at = (frac, snd, vol = 0.8) => (p.soundQueue || (p.soundQueue = [])).push({ t: this.time + dur * frac, name: snd, vol, weapon: w });
    const kind = w.def.kind;
    if (name === 'reload' && (kind === 'flame' || kind === 'launcher')) {
      if (w.id === 'flamethrower') { at(0.12, 'clipout'); at(0.5, 'fuel_in'); at(0.8, 'boltpull'); }
      else if (w.id === 'rpg') { at(0.35, 'rocket_load'); at(0.75, 'clipin'); }
      else { at(0.15, 'clipout'); at(0.45, 'shotgun_insert'); at(0.6, 'shotgun_insert'); at(0.85, 'boltpull'); }
    } else if (name === 'reload') {
      if (kind === 'pistol') { at(0.15, 'pistol_clipout'); at(0.55, 'pistol_clipin'); at(0.85, 'sliderelease'); }
      else if (kind === 'sniper') { at(0.15, 'clipout'); at(0.5, 'clipin'); at(0.8, w.id === 'awp' || w.id === 'scout' ? 'awp_bolt' : 'boltpull'); }
      else if (kind === 'mg') { at(0.15, 'clipout'); at(0.45, 'clipin'); at(0.8, 'boltpull'); }
      else { at(0.18, 'clipout'); at(0.55, 'clipin'); at(0.82, 'boltpull'); }
    } else if (name === 'reload_insert') at(0.4, 'shotgun_insert');
    else if (name === 'reload_end') at(0.2, 'shotgun_pump');
    else if (name === 'draw') { if (kind !== 'knife' && kind !== 'grenade') at(0.05, 'deploy', 0.6); }
    else if (name === 'pinpull') at(0.05, 'pinpull');
    else if (name === 'plant') { for (let i = 0; i < 7; i++) at(0.12 + i * 0.1, 'c4_plant_press', 0.6); }
    else if (/^shoot/.test(name)) {
      if (w.id === 'm3') at(0.35, 'shotgun_pump', 0.7);
      if (w.id === 'awp' || w.id === 'scout') at(0.4, 'awp_bolt', 0.7);
    } else if (name === 'attach_silencer' || name === 'detach_silencer') at(0.3, 'silencer_screw');
  }

  processWeaponSounds(p) {
    const q = p.soundQueue;
    if (!q || !q.length) return;
    for (let i = q.length - 1; i >= 0; i--) {
      const e = q[i];
      if (this.time < e.t) continue;
      q.splice(i, 1);
      if (p.active !== e.weapon || !p.alive) continue;
      const local = p === this.viewTarget;
      if (!local && this.camPos && Math.hypot(p.pm.origin[0] - this.camPos[0], p.pm.origin[1] - this.camPos[1]) > 512) continue;
      this.sound.play(e.name, { pos: local ? null : p.eyePos(), volume: e.vol, channel: `${p.id}:item`, attenuation: 'static' });
    }
  }

  onMoveEvent(p, e) {
    const local = p === this.viewTarget;
    if (e.type === 'footstep' || (e.type === 'jump' && e.footstep)) {
      const surf = surfaceOfBrush(p.pm.groundBrush?.userData, [0, 0, 1]);
      const name = surf === 'wood' ? 'step_wood' : surf === 'metal' ? 'step_metal' : (surf === 'sand' || surf === 'dirt') ? 'step_sand' : 'step_stone';
      this.sound.play(name, { pos: local ? null : p.feet(), volume: local ? 0.45 : 0.9, attenuation: 'static', channel: `${p.id}:body` });
      this.bots.onNoise(p, p.feet(), 900);
    } else if (e.type === 'land') {
      const fv = e.fallVelocity;
      this.sound.play('land', { pos: local ? null : p.feet(), volume: 0.8 });
      if (fv > PLAYER_MAX_SAFE_FALL_SPEED) {
        const dmg = (fv - PLAYER_MAX_SAFE_FALL_SPEED) * (100 / (PLAYER_FATAL_FALL_SPEED - PLAYER_MAX_SAFE_FALL_SPEED)) * 1.25;
        this.sound.play('fall_damage', { pos: local ? null : p.feet() });
        p.health -= Math.round(dmg);
        if (p.health <= 0) this.killPlayer(p, null, 'world', false);
      }
    } else if (e.type === 'softland') {
      this.sound.play('land', { pos: local ? null : p.feet(), volume: 0.35 });
    }
  }

  // ------------------------------------------------------------------ frame
  frame(dt) {
    dt = Math.min(dt, 0.1);
    const realDt = dt;
    // bullet cam: the world runs frozen / in slow motion while it plays
    const cine = this.bulletCam.active && !this.paused;
    if (cine) { this.bulletCam.update(dt); dt *= this.bulletCam.worldScale; }
    if (this.started && !this.paused) {
      if (cine) this.input.consumeMouse();
      else this.applyMouse();
      this.acc += dt;
      let n = 0;
      while (this.acc >= TICK && n < 12) { this.tick(); this.acc -= TICK; n++; }
      if (n >= 12) this.acc = 0;
    } else {
      this.input.consumeMouse();
    }
    const alpha = this.acc / TICK;
    this.ragdolls.update(this.paused ? 0 : dt);
    if (this.zombies.enabled && !this.paused) {
      this.gore.update(dt);
      this.gore.bakeSettled(this.zombies.pool);
      if (this.bosses.boss) this.gore.bakeSettled([this.bosses.boss]);
    }
    this.updateModels(dt, alpha);
    this.effects.update(this.paused ? 0 : dt);
    this.fire.render(this.paused ? 0 : dt);
    this.updateCamera(cine ? realDt : dt, alpha);
    this.updateSoundListener();
  }

  updateModels(dt, alpha) {
    const list = this.hostages?.list?.length ? this.players.concat(this.hostages.list) : this.players;
    for (const p of list) {
      if (!p.model) continue;
      const m = p.model;
      if (p.rescued) { m.object3D.visible = false; continue; }
      const show = p.team !== TEAM_SPEC && (p.alive || p.deathTime) && !(p === this.viewTarget && p.alive && this.camMode !== 'third');
      m.object3D.visible = !!show && (p.alive || ((this.time - p.deathTime < 30 || p.isZombie) && !p.baked && !p.gibbed));
      if (!p.alive && !p.deathTime) continue;
      if (!m.object3D.visible) continue;
      const o = p.pm.origin;
      const po = p.prevOrigin;
      const x = po[0] + (o[0] - po[0]) * alpha, y = po[1] + (o[1] - po[1]) * alpha, z = po[2] + (o[2] - po[2]) * alpha;
      const fz = z + p.hull().mins[2];
      if (p.alive) {
        m.object3D.position.set(x, y, fz);
        m.object3D.rotation.set(0, 0, p.pm.angles[1] * DEG);
      }
      const v = p.pm.velocity;
      const spd = Math.hypot(v[0], v[1]);
      m.update(dt, {
        speed: spd, moveYaw: spd > 10 ? ((Math.atan2(v[1], v[0]) / DEG - p.pm.angles[1]) % 360 + 540) % 360 - 180 : 0, crouch: p.pm.ducking || p.pm.inDuck, onGround: p.pm.onground,
        pitch: p.pm.angles[0], firing: p.lastShot > this.time - dt - 0.001 && p.lastShot <= this.time && p.alive,
        reloading: !!p.active?.inReload, planting: p.planting || p.defusing,
      });
      // GoldSrc lighting: ambient/shade from the light below the model
      // ragdolls are lit where the body actually lies (chest point)
      const rd = m.ragdoll && !m.ragdoll.removed ? m.ragdoll.particle(13, this._rdPos || (this._rdPos = [0, 0, 0])) : null;
      const l = this.W.sampler.sample(rd ? [rd[0], rd[1], rd[2] + 8] : [x, y, fz + 8], this.lightOut).map(lightCurve);
      const amb = [l[0] * 0.55 + 0.1, l[1] * 0.55 + 0.1, l[2] * 0.55 + 0.1];
      if (this.fire.patches.length || this.fire.burning.size || this.fire.streamers.size) {
        const fl = this.fire.lightAt([x, y, fz + 30], this._fl || (this._fl = [0, 0, 0]));
        amb[0] += fl[0] * 0.8; amb[1] += fl[1] * 0.8; amb[2] += fl[2] * 0.8;
      }
      const shade = [l[0] * 0.5, l[1] * 0.5, l[2] * 0.5];
      m.setLight(amb, shade, this.W.lighting.sunDir);
    }
  }

  // HL V_CalcBob
  calcBob(p, dt) {
    const b = this.bob;
    if (!p.pm.onground) return b.value;
    b.time += dt;
    const cycleLen = 0.8, up = 0.5;
    let cycle = b.time - Math.floor(b.time / cycleLen) * cycleLen;
    cycle /= cycleLen;
    if (cycle < up) cycle = Math.PI * cycle / up;
    else cycle = Math.PI + Math.PI * (cycle - up) / (1 - up);
    const v = p.pm.velocity;
    let bob = Math.hypot(v[0], v[1]) * 0.01;
    bob = bob * 0.3 + bob * 0.7 * Math.sin(cycle);
    b.value = Math.max(-7, Math.min(4, bob));
    return b.value;
  }

  updateCamera(dt, alpha) {
    const r = this.renderer;
    const p = this.viewTarget;
    if (this.bulletCam.active && this.bulletCam.applyCamera()) { this.drawVm = false; return; }
    // a security monitor's trigger_camera
    const tc = this.mapEnts.cameraActive();
    if (tc && tc.player === p) {
      const e = tc.pos, l = tc.look;
      const yaw = l ? Math.atan2(l[1] - e[1], l[0] - e[0]) / DEG : tc.yaw;
      const pitch = l ? -Math.atan2(l[2] - e[2], Math.hypot(l[0] - e[0], l[1] - e[1])) / DEG : 0;
      r.setView(e, pitch, yaw, 0);
      this.camPos = e;
      this.drawVm = false;
      return;
    }
    if (p && p.alive) {
      const o = p.pm.origin, po = p.prevOrigin;
      const x = po[0] + (o[0] - po[0]) * alpha, y = po[1] + (o[1] - po[1]) * alpha;
      let z = po[2] + (o[2] - po[2]) * alpha;
      // smooth out stair step-ups (V_CalcRefdef)
      if (p.pm.onground && z - this.oldz > 0) {
        this.oldz += dt * 150;
        if (this.oldz > z) this.oldz = z;
        if (z - this.oldz > 18) this.oldz = z - 18;
      } else this.oldz = z;
      const bob = this.paused ? this.bob.value : this.calcBob(p, dt);
      const eye = [x, y, this.oldz + p.pm.viewOfs + bob];
      const pu = p.pm.punch;
      const sh = this.shakeOffset(dt);
      r.setView(eye, p.pm.angles[0] + pu[0] + sh[0], p.pm.angles[1] + pu[1] + sh[1], pu[2] + sh[2]);
      this.camPos = eye;
      // view model
      if (this.vm) {
        // zombie survival view models: the RPG's warhead, the flamethrower's jet
        const aw = p.active;
        this.vm.state.empty = !!(aw && aw.def.clip > 0 && aw.clip === 0);
        this.vm.state.flaming = !!(aw && aw.flaming > this.time - 0.08);
        const showVm = p.fov >= 90 || !(p.active && /awp|scout|g3sg1|sg550/.test(p.active.id));
        this.vm.object3D.visible = showVm;
        this.vm.update(this.paused ? 0 : dt, { bobX: 0, bobY: bob * 0.4, swayYaw: -bob * 0.5, swayPitch: -bob * 0.3 });
        // GoldSrc runs model light through the lightgamma table, which lifts shadowed
        // view models well above the raw light value
        const vl = this.W.sampler.sample([x, y, z], [1, 1, 1]).map((c) => Math.min(1.3, Math.max(0.35, Math.pow(lightCurve(c), 0.8))));
        if (this.fire.patches.length || this.fire.streamers.size || this.fire.burning.size) {
          const fl = this.fire.lightAt([x, y, z], this._fl || (this._fl = [0, 0, 0]));
          for (let k = 0; k < 3; k++) vl[k] = Math.min(1.6, vl[k] + fl[k] * 0.7);
        }
        this.vm.setLight(vl);
      }
      this.drawVm = true;
    } else {
      this.drawVm = false;
      this.updateSpectatorCamera(dt, alpha);
    }
  }

  updateSpectatorCamera(dt, alpha) {
    const r = this.renderer;
    const s = this.spectate;
    if (s.mode === 'death' && s.target) {
      // look at your corpse from above, then towards the killer
      const o = s.target.pm.origin;
      const eye = [o[0], o[1], o[2] + 48];
      let pitch = 30, yaw = s.angles ? s.angles[1] : 0;
      if (s.killer && s.killer.alive) {
        const k = s.killer.pm.origin;
        yaw = Math.atan2(k[1] - o[1], k[0] - o[0]) / DEG;
        pitch = 10;
      }
      r.setView(eye, pitch, yaw, 0);
      this.camPos = eye;
      if (this.time > s.until) this.nextSpectateTarget(1);
      return;
    }
    if (s.mode === 'chase' && s.target && s.target.alive) {
      const t = s.target;
      const o = t.pm.origin, po = t.prevOrigin;
      const x = po[0] + (o[0] - po[0]) * alpha, y = po[1] + (o[1] - po[1]) * alpha, z = po[2] + (o[2] - po[2]) * alpha;
      // in-eye view of the spectated player
      r.setView([x, y, z + t.pm.viewOfs], t.pm.angles[0], t.pm.angles[1], 0);
      this.camPos = [x, y, z + t.pm.viewOfs];
      return;
    }
    if (s.mode === 'chase') this.nextSpectateTarget(1);
    // free look fallback (overview of T spawn)
    const a = s.angles || [20, 90, 0];
    const eye = s.free && s.free[2] ? s.free : [-1380, -700, 320];
    r.setView(eye, a[0], a[1], 0);
    this.camPos = eye;
  }

  nextSpectateTarget(dir) {
    const me = this.local;
    const cands = this.players.filter((q) => q.alive && q !== me && (me.team === TEAM_SPEC || q.team === me.team));
    const all = cands.length ? cands : this.players.filter((q) => q.alive && q !== me);
    if (!all.length) { this.spectate.mode = 'free'; return; }
    const i = all.indexOf(this.spectate.target);
    this.spectate = { mode: 'chase', target: all[(i + dir + all.length) % all.length], angles: this.spectate.angles };
  }

  updateSoundListener() {
    if (!this.camPos) return;
    const c = this.renderer.camera;
    // derive yaw/pitch from camera rotation (YXZ)
    const yaw = c.rotation.y / DEG + 90, pitch = -c.rotation.x / DEG;
    this.sound.setListener(this.camPos, yaw, pitch);
  }

  // in bomb/buy zone tests
  // trigger touch: the player's box overlaps the zone brush (like SV_LinkEdict touching a trigger)
  // ------------------------------------------------------------------ zombie survival weapons
  /** RPG / M32: the projectile leaves the muzzle along the aim. */
  launchFrom(p, type) {
    const a = p.pm.angles, pu = p.pm.punch;
    angleVectors(a[0] + pu[0] - (type === 'grenade40' ? 2.5 : 0), a[1] + pu[1], _f, _r, _u);
    const e = p.eyePos();
    const src = [e[0] + _f[0] * 18 + _r[0] * 5 - _u[0] * 5, e[1] + _f[1] * 18 + _r[1] * 5 - _u[1] * 5, e[2] + _f[2] * 18 + _r[2] * 5 - _u[2] * 5];
    // don't start inside a wall
    this.collision.trace(e, src, [0, 0, 0], [0, 0, 0], MASK_SHOT, tmpTr);
    if (tmpTr.fraction < 1) { src[0] = e[0] + (src[0] - e[0]) * tmpTr.fraction * 0.8; src[1] = e[1] + (src[1] - e[1]) * tmpTr.fraction * 0.8; src[2] = e[2] + (src[2] - e[2]) * tmpTr.fraction * 0.8; }
    const sp = type === 'rocket' ? 1150 : 1250;
    this.projectiles.launch(type, p, src, [_f[0] * sp, _f[1] * sp, _f[2] * sp]);
    if (type === 'rocket') {
      // back blast
      for (let i = 0; i < 10; i++) this.fire.emit('smoke', [e[0] - _f[0] * 30, e[1] - _f[1] * 30, e[2] - 4], [-_f[0] * 200 + (Math.random() - 0.5) * 120, -_f[1] * 200 + (Math.random() - 0.5) * 120, (Math.random() - 0.3) * 80], { life: 1.2, size: 14, size1: 50, drag: 2 });
    }
    p.lastShot = this.time;
    this.bots.onNoise(p, e, 2500);
  }

  /**
   * An explosion: fireball, sound, radius damage with knockback (rocket jumps work) that
   * walls block, corpses torn apart. o: { owner, damage, radius, weapon, selfScale, push,
   * sound, scale, shake, fire, noGore }
   */
  explode(pos, o = {}) {
    const owner = o.owner || null, R = o.radius ?? 250, D = o.damage ?? 150, weapon = o.weapon || 'hegrenade';
    this.effects.explosion([pos[0], pos[1], pos[2]], o.scale ?? R / 260);
    this.sound.play(o.sound || 'he_explode', { pos, volume: 1 });
    for (let i = 0; i < 14; i++) this.fire.emit(i < 6 ? 'fire' : 'spark', pos, [(Math.random() - 0.5) * 700, (Math.random() - 0.5) * 700, Math.random() * 500], i < 6 ? { life: 0.45, size: 40, size1: 90, drag: 4, buoy: 120 } : { life: 0.6, size: 2.5, size1: 1, drag: 1, buoy: -600 });
    for (const q of this.players) {
      if (!q.alive) continue;
      const sc = q.boss ? q.boss.scale : 1;
      const c = [q.pm.origin[0], q.pm.origin[1], q.pm.origin[2] + 10 * sc];
      const d = Math.hypot(c[0] - pos[0], c[1] - pos[1], c[2] - pos[2]);
      const reach = R + (sc - 1) * 30;
      if (d > reach) continue;
      if (!this.visible(pos, c) && !this.visible(pos, [c[0], c[1], c[2] + 30])) continue;
      let dmg = D * (1 - d / reach);
      if (dmg < 1) continue;
      if (q === owner) dmg *= o.selfScale ?? 0.5;
      else if (owner && q.team === owner.team && !this.rounds.friendlyFire) continue;
      const l = d || 1;
      const dir = [(c[0] - pos[0]) / l, (c[1] - pos[1]) / l, Math.max(0.25, (c[2] - pos[2]) / l)];
      const kb = Math.min(720, dmg * 5 * (o.push ?? 1)) * (q.boss ? 0.12 : 1);
      q.pm.velocity[0] += dir[0] * kb; q.pm.velocity[1] += dir[1] * kb; q.pm.velocity[2] += dir[2] * kb + kb * 0.35;
      this.damagePlayer(q, owner, dmg, 0, weapon, dir, null, { blast: true, explode: !o.noGore, fire: !!o.fire });
    }
    if (!o.noGore && this.zombies.enabled) this.gore.blast(pos, R * 0.9, D, this.zombies.pool);
    this.shakeAt(pos, o.shake ?? 8);
    this.bots.onNoise(owner, pos, 2500);
  }

  /** Shake the view of the local player by distance to pos. */
  shakeAt(pos, amp, range = 1400) {
    const e = this.camPos || this.local?.eyePos();
    if (!e) return;
    const k = Math.max(0, 1 - Math.hypot(pos[0] - e[0], pos[1] - e[1], pos[2] - e[2]) / range);
    if (k <= 0.02) return;
    const s = this.shake;
    const a = amp * k;
    if (!s || this.time > s.until || a > s.amp) this.shake = { until: this.time + 0.35 + 0.6 * k, amp: a, start: this.time };
  }

  shakeOffset() {
    const s = this.shake, o = this._shk || (this._shk = [0, 0, 0]);
    if (!s || this.time > s.until) { o[0] = o[1] = o[2] = 0; return o; }
    const k = (s.until - this.time) / Math.max(0.1, s.until - (s.start ?? this.time));
    const a = s.amp * Math.min(1, k) * 0.35;
    o[0] = (Math.random() - 0.5) * a; o[1] = (Math.random() - 0.5) * a; o[2] = (Math.random() - 0.5) * a * 0.6;
    return o;
  }

  inZone(p, zone) {
    const o = p.pm.origin, h = p.hull();
    return o[0] + h.maxs[0] > zone.mins[0] && o[0] + h.mins[0] < zone.maxs[0] && o[1] + h.maxs[1] > zone.mins[1] && o[1] + h.mins[1] < zone.maxs[1] &&
      o[2] + h.maxs[2] > zone.mins[2] && o[2] + h.mins[2] < zone.maxs[2];
  }

  inBuyZone(p) {
    if (this.zombies.enabled) return p.team === TEAM_CT; // buy anywhere
    // maps without func_buyzone: within 200 units of one of your team's spawn points (OLD_CheckBuyZone)
    if (!this.buyZones.length) {
      const o = p.pm.origin;
      return (this.spawns[p.team] || []).some((s) => Math.hypot(s.origin[0] - o[0], s.origin[1] - o[1], s.origin[2] - o[2]) < 200);
    }
    return this.buyZones.some((z) => (z.team === p.team || z.team === 'any') && this.inZone(p, z));
  }

  bombZoneOf(p) {
    return this.bombTargets.find((z) => this.inZone(p, z)) || null;
  }

  // line of sight between two points (world only)
  visible(a, b) {
    this.collision.trace(a, b, [0, 0, 0], [0, 0, 0], MASK_SHOT, tmpTr);
    return tmpTr.fraction >= 1;
  }
}
