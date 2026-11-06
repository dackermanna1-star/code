// Zombie population: spawning by zone density / time of day, static spawns, despawning, noise propagation,
// door bashing, corpses and kill tracking.
import * as THREE from 'three';
import { Zombie, OUTFIT_LOOT } from './Zombie.js';
import { createZombieVisual } from './zombie/ZombieModel.js';
import { ZONES } from '../world/World.js';
import { B, BLOCKS, IS_DOOR, SOLID } from '../world/blocks.js';
import { groundAt, standable } from './pathfind.js';
import { generateLoot } from '../items/loot.js';
import { makeRng, clamp } from '../core/rng.js';

const ZONE_DENSITY = {
  [ZONES.WILD]: 0.05, [ZONES.FOREST]: 0.07, [ZONES.FARM]: 0.18, [ZONES.SUBURB]: 0.42, [ZONES.DOWNTOWN]: 0.85,
  [ZONES.COMMERCIAL]: 0.7, [ZONES.INDUSTRIAL]: 0.4, [ZONES.HIGHWAY]: 0.45, [ZONES.MILITARY]: 0.9, [ZONES.HOSPITAL]: 1.0,
  [ZONES.POLICE]: 0.75, [ZONES.PARK]: 0.35, [ZONES.WATER]: 0.0, [ZONES.CAMP]: 0.2, [ZONES.TRAILER]: 0.45,
  [ZONES.SCHOOL]: 0.7, [ZONES.ROAD]: 0.3, [ZONES.CEMETERY]: 0.5, [ZONES.GAS]: 0.45,
};
const GROUND_BLOCKS = new Set(['grass', 'dirt', 'asphalt', 'asphalt_cracked', 'road_yellow_x', 'road_yellow_z', 'road_white_x', 'road_white_z',
  'crosswalk_x', 'crosswalk_z', 'parking_line_x', 'parking_line_z', 'manhole', 'sidewalk', 'concrete', 'concrete_dark', 'gravel', 'sand',
  'forest_floor', 'dry_grass', 'mud', 'dirt_path', 'cobblestone', 'stone'].map((n) => B[n]));

function outfitForZone(zone, r) {
  switch (zone) {
    case ZONES.HOSPITAL: return r < 0.4 ? 'patient' : r < 0.7 ? 'medic' : 'civilian';
    case ZONES.POLICE: return r < 0.5 ? 'police' : r < 0.6 ? 'prisoner' : 'civilian';
    case ZONES.MILITARY: return r < 0.65 ? 'military' : r < 0.8 ? 'medic' : 'civilian';
    case ZONES.FARM: return r < 0.5 ? 'farmer' : 'civilian';
    case ZONES.INDUSTRIAL: return r < 0.55 ? 'worker' : 'civilian';
    case ZONES.FOREST: case ZONES.CAMP: case ZONES.WILD: return r < 0.35 ? 'hunter' : r < 0.55 ? 'survivor' : 'civilian';
    case ZONES.DOWNTOWN: case ZONES.COMMERCIAL: return r < 0.25 ? 'office' : r < 0.6 ? 'civilian_f' : 'civilian';
    case ZONES.HIGHWAY: return r < 0.15 ? 'survivor' : r < 0.25 ? 'military' : r < 0.6 ? 'civilian_f' : 'civilian';
    default: return r < 0.08 ? 'worker' : r < 0.12 ? 'police' : r < 0.5 ? 'civilian_f' : 'civilian';
  }
}

export class ZombieManager {
  constructor(game) {
    this.game = game;
    this.scene = game.renderer.scene;
    this.zombies = [];
    this.corpses = []; // dead zombies (lootable)
    this.grid = new Map();
    this.spawnT = 1;
    this.densityT = 0;
    this.localDensity = 0.3;
    this.pathBudget = 0;
    this.voiceT = 0;
    this.cellKills = new Map();
    this.staticState = new Map(); // spawn index -> remaining
    this.rng = makeRng((game.world.seed || 1) ^ 0x5bd1e995);
    this.tmp = new THREE.Vector3();
  }

  createVisual(o) { return createZombieVisual(o); }

  get maxActive() {
    const s = this.game.settings.zombieDensity ?? 1;
    return Math.round((this.game.isNight ? 78 : 58) * s);
  }

  // ------------------------------------------------------------------ spawning
  pickVariant() {
    const g = this.game;
    const day = g.time.day;
    const r = Math.random();
    const runner = (g.isNight ? 0.16 : 0.06) + Math.min(0.08, day * 0.01);
    const brute = Math.min(0.06, 0.012 + day * 0.006);
    let acc = runner;
    if (r < acc) return 'runner';
    if (r < (acc += brute)) return 'brute';
    if (r < (acc += 0.06)) return 'crawler';
    if (r < (acc += 0.035)) return 'screamer';
    if (r < (acc += 0.035)) return 'bloater';
    return 'walker';
  }

  spawn(x, y, z, opts = {}) {
    const zone = this.game.world.getZone(x, z);
    const variant = opts.variant || this.pickVariant();
    const outfit = opts.outfit || outfitForZone(zone, Math.random());
    const zb = new Zombie(this, { x, y, z, variant, outfit, seed: (Math.random() * 1e9) | 0, state: opts.state });
    zb.staticIdx = opts.staticIdx ?? null;
    if (opts.state === 'feed') zb.yaw = Math.random() * 6.28;
    this.zombies.push(zb);
    return zb;
  }

  densityAt(x, z) {
    const zone = this.game.world.getZone(x, z);
    let d = ZONE_DENSITY[zone] ?? 0.2;
    const ck = this.cellKey(x, z);
    const kills = this.cellKills.get(ck) || 0;
    d *= Math.max(0.15, 1 - kills / 30);
    return d;
  }
  cellKey(x, z) { return (Math.floor(x / 64) << 8) | Math.floor(z / 64); }

  trySpawnAround() {
    const g = this.game, p = g.player, w = g.world;
    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 38 + Math.random() * 52;
      const x = p.x + Math.cos(ang) * dist, z = p.z + Math.sin(ang) * dist;
      if (x < 2 || z < 2 || x > w.SX - 3 || z > w.SZ - 3) continue;
      const dens = this.densityAt(x, z);
      if (Math.random() > dens * 1.2) continue;
      const ix = Math.floor(x), iz = Math.floor(z);
      const top = w.roofY(ix, iz);
      if (!GROUND_BLOCKS.has(w.get(ix, top, iz))) continue;
      const y = top + 1;
      if (!standable(w, ix, y, iz)) continue;
      // avoid spawning in plain view nearby
      const dx = x - p.x, dz = z - p.z;
      const fwd = p.forward(this.tmp);
      const dot = (dx * fwd.x + dz * fwd.z) / dist;
      if (dist < 60 && dot > 0.3) continue;
      const zb = this.spawn(ix + 0.5, y, iz + 0.5);
      if (Math.random() < 0.35) zb.pickWander(14);
      // small groups in dense areas
      if (dens > 0.6 && Math.random() < 0.5) {
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const gx = ix + Math.floor((Math.random() - 0.5) * 6), gz = iz + Math.floor((Math.random() - 0.5) * 6);
          const gy = groundAt(w, gx, y, gz);
          if (gy >= 0) this.spawn(gx + 0.5, gy, gz + 0.5);
        }
      }
      return true;
    }
    return false;
  }

  updateStaticSpawns() {
    const g = this.game, p = g.player, w = g.world;
    w.zombieSpawns.forEach((s, i) => {
      let rem = this.staticState.get(i);
      if (rem === undefined) { rem = s.count; this.staticState.set(i, rem); }
      if (rem <= 0) return;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d > 75 || d < 12) return;
      const r = s.radius || 3;
      let placed = 0;
      for (let k = 0; k < rem * 4 && placed < rem; k++) {
        const x = Math.floor(s.x + (Math.random() - 0.5) * 2 * r), z = Math.floor(s.z + (Math.random() - 0.5) * 2 * r);
        const y = groundAt(w, x, Math.floor(s.y), z);
        if (y < 0 || Math.abs(y - s.y) > 3) continue;
        const types = s.types && s.types.length ? s.types : null;
        const zb = this.spawn(x + 0.5, y, z + 0.5, { variant: types ? types[Math.floor(Math.random() * types.length)] : undefined, outfit: s.outfit, staticIdx: i, state: s.state });
        if (!s.state && Math.random() < 0.5) zb.setState('idle', Math.random() * 3);
        placed++;
      }
      this.staticState.set(i, rem - placed);
    });
  }

  remove(zb) {
    const i = this.zombies.indexOf(zb);
    if (i >= 0) this.zombies.splice(i, 1);
    if (!zb.dead && zb.staticIdx !== null && zb.staticIdx !== undefined) {
      this.staticState.set(zb.staticIdx, (this.staticState.get(zb.staticIdx) || 0) + 1);
    }
    zb.dispose();
  }

  // ------------------------------------------------------------------ helpers used by zombies
  playVoice(zb, name, vol = 1, maxDist = 45) {
    if (this.voiceT > 0.05 && name !== 'zombie_scream' && name !== 'zombie_death') return;
    this.voiceT = 0.12;
    this.game.audio.play(name, { pos: { x: zb.x, y: zb.y + 1.5, z: zb.z }, volume: vol, pitch: zb.variant === 'brute' ? 0.75 : zb.variant === 'runner' ? 1.12 : 0.9 + Math.random() * 0.2, maxDist });
  }

  alertNear(src, r) {
    for (const z of this.zombies) {
      if (z === src || z.dead) continue;
      if ((z.x - src.x) ** 2 + (z.z - src.z) ** 2 < r * r && z.state !== 'chase' && z.state !== 'attack') {
        z.target = { x: src.x, y: src.y, z: src.z };
        z.setState('investigate');
      }
    }
  }

  noise(n) {
    for (const z of this.zombies) {
      if (z.dead) continue;
      if (n.target && (z.x - n.x) ** 2 + (z.z - n.z) ** 2 < n.radius * n.radius) {
        // screams direct zombies to where the player was seen
        z.target = { ...n.target };
        if (z.state !== 'chase' && z.state !== 'attack') z.setState('investigate');
        continue;
      }
      z.hear(n);
    }
  }

  requestPath() {
    if (this.pathBudget <= 0) return false;
    this.pathBudget--;
    return true;
  }

  separation(zb) {
    const out = this.tmp.set(0, 0, 0);
    const cx = Math.floor(zb.x / 3), cz = Math.floor(zb.z / 3);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = this.grid.get(((cx + i) << 12) ^ (cz + j));
      if (!list) continue;
      for (const o of list) {
        if (o === zb || o.dead) continue;
        const dx = zb.x - o.x, dz = zb.z - o.z;
        const d2 = dx * dx + dz * dz;
        const min = zb.hw + o.hw + 0.15;
        if (d2 < min * min && d2 > 1e-6 && Math.abs(zb.y - o.y) < 1.5) {
          const d = Math.sqrt(d2);
          const f = (min - d) / min * 2.5;
          out.x += (dx / d) * f; out.z += (dz / d) * f;
        }
      }
    }
    return out;
  }

  directClear(zb, goal) {
    const w = this.game.world;
    const dx = goal.x - zb.x, dz = goal.z - zb.z;
    const d = Math.hypot(dx, dz);
    const steps = Math.ceil(d / 0.7);
    let y = Math.floor(zb.y + 0.2);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = Math.floor(zb.x + dx * t), z = Math.floor(zb.z + dz * t);
      if (standable(w, x, y, z) === 1) continue;
      if (zb.cfg.canJump && standable(w, x, y + 1, z) === 1) { y += 1; continue; }
      if (standable(w, x, y - 1, z) === 1) { y -= 1; continue; }
      return false;
    }
    return true;
  }

  isBashable(x, y, z) {
    const w = this.game.world;
    const id = w.get(x, y, z);
    if (IS_DOOR[id]) return !(w.getMeta(x, y, z) & 4);
    return id === B.glass || id === B.glass_shop || id === B.barricade;
  }

  bash(zb, t) {
    const g = this.game, w = g.world;
    const id = w.get(t.x, t.y, t.z);
    const pos = { x: t.x + 0.5, y: t.y + 0.5, z: t.z + 0.5 };
    const dmg = zb.cfg.door * (0.8 + Math.random() * 0.4);
    if (IS_DOOR[id]) {
      const door = w.getDoor(t.x, t.y, t.z);
      if (door.barricade > 0) {
        door.barricade -= dmg;
        g.audio.play('zombie_bash', { pos, volume: 1 });
        if (door.barricade <= 0) { door.barricade = 0; w.syncDoor(door); g.audio.play('door_break', { pos }); g.fx?.blockBreak(new THREE.Vector3(pos.x, pos.y, pos.z), [120, 90, 60]); }
      } else {
        door.hp -= dmg;
        g.audio.play('door_bash', { pos, volume: 1.1 });
        if (door.hp <= 0) {
          g.audio.play('door_break', { pos, volume: 1.2 });
          g.fx?.blockBreak(new THREE.Vector3(pos.x, pos.y + 0.5, pos.z), [110, 80, 55]);
          w.removeDoor(door);
          g.noise(pos.x, pos.y, pos.z, 18, 'door_break');
        }
      }
      g.noise(pos.x, pos.y, pos.z, 14, 'bash');
      g.camShakeAt(pos, 0.25);
    } else {
      g.damageBlock(t.x, t.y, t.z, dmg, { tool: 'blunt', byZombie: true });
      g.audio.play(id === B.barricade ? 'zombie_bash' : 'hit_glass', { pos });
      g.noise(pos.x, pos.y, pos.z, 12, 'bash');
    }
  }

  onZombieKilled(zb, o) {
    const g = this.game;
    this.corpses.push(zb);
    zb.loot = null; // generated on first search
    if (o.byPlayer !== false) {
      g.player.kills++;
      const ck = this.cellKey(zb.x, zb.z);
      this.cellKills.set(ck, (this.cellKills.get(ck) || 0) + 1);
    }
    if (zb.staticIdx !== null && zb.staticIdx !== undefined) { /* killed: stays removed */ }
    g.onZombieKilled?.(zb, o);
    // corpse limit
    while (this.corpses.length > 45) {
      const old = this.corpses.shift();
      const i = this.zombies.indexOf(old);
      if (i >= 0) this.zombies.splice(i, 1);
      old.dispose();
    }
  }

  corpseLoot(zb) {
    if (!zb.loot) {
      const table = OUTFIT_LOOT[zb.outfit] || 'zombie_civilian';
      const stacks = generateLoot(table, makeRng((zb.id * 2654435761) >>> 0), { scavenging: this.game.player.skillLevel('scavenging'), day: this.game.time.day, size: 6 });
      zb.loot = new Array(6).fill(null);
      stacks.slice(0, 6).forEach((s, i) => { zb.loot[i] = s; });
    }
    return zb.loot;
  }

  corpsePosition(zb, out) {
    if (zb.visual.getPartPosition) return zb.visual.getPartPosition('torso', out);
    return out.set(zb.x, zb.y + 0.3, zb.z);
  }

  bloaterPop(zb) {
    const g = this.game, p = g.player;
    const pos = new THREE.Vector3(zb.x, zb.y + 1, zb.z);
    g.audio.play('zombie_bloater_pop', { pos, volume: 1.3 });
    g.fx?.gore(pos, new THREE.Vector3(0, 1, 0), 2.5);
    g.fx?.smoke?.(pos, { color: 0x6a7a3a, duration: 6, radius: 2.5 });
    const d = Math.hypot(p.x - zb.x, p.y - zb.y, p.z - zb.z);
    if (d < 3.5) {
      g.survival.hurt(18 * (1 - d / 3.5) + 4, 'Engulfed by bloater gas');
      p.sickness = Math.min(100, p.sickness + 30);
      g.ui?.toast('You inhaled toxic gas!', 'danger');
    }
    for (const z of this.zombies) {
      if (z !== zb && !z.dead && Math.hypot(z.x - zb.x, z.z - zb.z) < 3) z.takeDamage(30, { part: 'torso', dir: new THREE.Vector3(z.x - zb.x, 0, z.z - zb.z).normalize(), knockback: 1, byPlayer: false });
    }
    g.noise(zb.x, zb.y, zb.z, 25, 'explosion');
  }

  // ------------------------------------------------------------------ main update
  update(dt) {
    const g = this.game, p = g.player;
    this.pathBudget = 3;
    this.voiceT -= dt;
    // spatial grid
    this.grid.clear();
    for (const z of this.zombies) {
      if (z.dead) continue;
      const k = (Math.floor(z.x / 3) << 12) ^ Math.floor(z.z / 3);
      let l = this.grid.get(k);
      if (!l) { l = []; this.grid.set(k, l); }
      l.push(z);
    }
    // density estimate around player
    this.densityT -= dt;
    if (this.densityT <= 0) {
      this.densityT = 4;
      let sum = 0;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2, r = 30 + (i % 3) * 25;
        sum += this.densityAt(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
      }
      this.localDensity = sum / 24;
      this.updateStaticSpawns();
    }
    const alive = this.zombies.length - this.corpses.length;
    const target = clamp(Math.round(this.localDensity * this.maxActive * 1.4), 4, this.maxActive);
    this.spawnT -= dt;
    if (this.spawnT <= 0 && !g.noSpawn) {
      this.spawnT = alive < target * 0.5 ? 0.15 : 0.6;
      if (alive < target) this.trySpawnAround();
    }
    // update / despawn
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      z.update(dt);
      if (!z.dead) {
        const d = Math.hypot(z.x - p.x, z.z - p.z);
        if (d > 125 && z.state !== 'chase') this.remove(z);
        else if (d > 95 && alive > target + 8 && z.state !== 'chase' && z.state !== 'investigate') this.remove(z);
      } else if (z.deadT > 420 || Math.hypot(z.x - p.x, z.z - p.z) > 160) {
        const ci = this.corpses.indexOf(z);
        if (ci >= 0) this.corpses.splice(ci, 1);
        this.zombies.splice(i, 1);
        z.dispose();
      }
    }
  }

  /** Living zombies within r of a point */
  near(x, y, z, r) {
    const out = [];
    for (const zb of this.zombies) {
      if (zb.dead) continue;
      if ((zb.x - x) ** 2 + (zb.z - z) ** 2 + (zb.y - y) ** 2 < r * r) out.push(zb);
    }
    return out;
  }

  threatLevel() {
    const p = this.game.player;
    let t = 0;
    for (const z of this.zombies) {
      if (z.dead) continue;
      if (z.state === 'chase' || z.state === 'attack') {
        const d = Math.hypot(z.x - p.x, z.z - p.z);
        if (d < 20) t += (1 - d / 20) * (z.variant === 'brute' ? 0.6 : 0.25);
      }
    }
    return clamp(t, 0, 1);
  }

  clearAll() {
    for (const z of this.zombies) z.dispose();
    this.zombies = [];
    this.corpses = [];
  }

  toJSON() {
    return { cellKills: [...this.cellKills], staticState: [...this.staticState] };
  }
  load(d) {
    if (!d) return;
    this.cellKills = new Map(d.cellKills || []);
    this.staticState = new Map(d.staticState || []);
  }
}
