/**
 * Ambient island life (tropical island worlds): seagulls wheeling over the beaches and lagoon by
 * day, and schools of reef fish (yellow tangs, clownfish, blue tangs, angelfish) swimming in the
 * lagoon around the player. They are scenery, not entities: cheap meshes in the G-buffer (so
 * they are lit, shadowed, fogged and refracted under the water like everything else), placed
 * around the player and relocated as the player travels.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Game } from '../game';
import type { GameSystem } from '../systems';
import { createEntityMaterial, setEntityLight } from '../../render/entityMaterial';
import { BIOMES } from '../../world/biomes';
import { T_LIQUID } from '../../world/blocks/registry';

const SEA = 63;

/** Geometry with per-vertex colours (`color` attribute), built from parts. */
function coloured(parts: [THREE.BufferGeometry, number | ((p: THREE.Vector3) => number)][]): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [];
  const v = new THREE.Vector3(), c = new THREE.Color();
  for (const [g0, col] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position;
    const arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      c.set(typeof col === 'number' ? col : col(v)).convertSRGBToLinear();
      arr[i * 3] = Math.sqrt(c.r); arr[i * 3 + 1] = Math.sqrt(c.g); arr[i * 3 + 2] = Math.sqrt(c.b);
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    out.push(g);
  }
  return mergeGeometries(out)!;
}

// ------------------------------------------------------------------------------- seagull
function gullGeometry() {
  const body = coloured([
    [new THREE.SphereGeometry(1, 12, 8).scale(0.09, 0.085, 0.24), (p) => (p.y > 0.03 ? 0xf2f2ee : 0xffffff)],
    [new THREE.SphereGeometry(1, 10, 8).scale(0.065, 0.065, 0.075).translate(0, 0.06, -0.22), 0xffffff],
    [new THREE.ConeGeometry(0.018, 0.07, 6).rotateX(-Math.PI / 2).translate(0, 0.055, -0.32), 0xf0c020],
    [new THREE.SphereGeometry(1, 6, 4).scale(0.012, 0.012, 0.012).translate(0.045, 0.08, -0.25), 0x101010],
    [new THREE.SphereGeometry(1, 6, 4).scale(0.012, 0.012, 0.012).translate(-0.045, 0.08, -0.25), 0x101010],
    [new THREE.ConeGeometry(0.07, 0.16, 6).rotateX(Math.PI / 2).scale(1, 0.25, 1).translate(0, 0.01, 0.27), 0xe8e8e4],
  ]);
  // wing (right side; mirrored for the left): grey upper wing, black tips
  const wing = coloured([[new THREE.BoxGeometry(0.62, 0.02, 0.17, 6, 1, 1).translate(0.31, 0, 0), (p) => (p.x > 0.48 ? 0x1a1a1a : p.x > 0.4 ? 0x6a6e74 : 0xa8adb4)]]);
  const pos = wing.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, pos.getZ(i) * (1 - x * 0.7) + x * 0.12); // swept, tapering
  }
  wing.computeVertexNormals();
  return { body, wing, wingL: wing.clone().scale(-1, 1, 1) };
}

interface Gull {
  root: THREE.Object3D;
  wl: THREE.Object3D;
  wr: THREE.Object3D;
  cx: number; cz: number; r: number; alt: number; ang: number; w: number; flapT: number; flap: number; seed: number;
}

// ------------------------------------------------------------------------------- fish
const FISH: { name: string; size: number; col: (p: THREE.Vector3) => number }[] = [
  { name: 'yellow tang', size: 1, col: () => 0xf2d21a },
  { name: 'clownfish', size: 0.7, col: (p) => (Math.abs(p.z + 0.02) < 0.018 || Math.abs(p.z - 0.07) < 0.016 ? 0xffffff : Math.abs(p.z + 0.02) < 0.026 ? 0x101010 : 0xf06a10) },
  { name: 'blue tang', size: 1.1, col: (p) => (p.z > 0.13 ? 0xf2d21a : p.y > 0.02 && p.z < 0.08 && p.z > -0.04 ? 0x101828 : 0x1e5ad8) },
  { name: 'angelfish', size: 1, col: (p) => (Math.sin(p.z * 120) > 0.3 ? 0x101010 : 0xf2f0e0) },
];

function fishGeometry(col: (p: THREE.Vector3) => number, size: number) {
  return coloured([
    [new THREE.SphereGeometry(1, 10, 8).scale(0.022, 0.05, 0.075), col],
    [new THREE.ConeGeometry(0.035, 0.05, 4).rotateX(Math.PI / 2).scale(0.3, 1.2, 1).translate(0, 0, 0.1), col],
    [new THREE.ConeGeometry(0.03, 0.05, 4).scale(0.25, 1, 1.4).translate(0, 0.055, 0.01), col],
  ]).scale(size, size, size);
}

interface School {
  meshes: THREE.Mesh[];
  off: THREE.Vector3[];
  c: THREE.Vector3;
  goal: THREE.Vector3;
  vel: THREE.Vector3;
  t: number;
  floor: number;
  surf: number;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

export class IslandLifeSystem implements GameSystem {
  readonly name = 'islandLife';
  private game!: Game;
  private scene = new THREE.Scene();
  private gulls: Gull[] = [];
  private schools: School[] = [];
  private gullMat: THREE.RawShaderMaterial | null = null;
  private fishMat: THREE.RawShaderMaterial | null = null;
  private time = 0;
  private relocate = 0;

  init(game: Game) {
    this.game = game;
    const ex: any = game.renderExtras;
    (ex.gbuffer ??= []).push(this.scene);
    (ex.shadow ??= []).push(this.scene);
  }

  private active(g: Game) {
    return !!g.world && (g.world as any).worldType === 'island' && g.dimension === 'overworld' && !!g.player;
  }

  private build() {
    const geo = gullGeometry();
    this.gullMat = createEntityMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
    for (let i = 0; i < 12; i++) {
      const root = new THREE.Object3D();
      root.add(new THREE.Mesh(geo.body, this.gullMat));
      const wr = new THREE.Object3D(), wl = new THREE.Object3D();
      wr.position.set(0.07, 0.03, -0.03);
      wl.position.set(-0.07, 0.03, -0.03);
      wr.add(new THREE.Mesh(geo.wing, this.gullMat));
      wl.add(new THREE.Mesh(geo.wingL, this.gullMat));
      root.add(wr, wl);
      root.visible = false;
      for (const o of [root, wr, wl, ...root.children]) o.frustumCulled = false;
      this.scene.add(root);
      this.gulls.push({ root, wl, wr, cx: 0, cz: 0, r: 10, alt: 80, ang: 0, w: 0.3, flapT: 0, flap: 0, seed: Math.random() * 100 });
    }
    this.fishMat = createEntityMaterial({ vertexColors: true, roughness: 0.35, sss: 0.2 });
    for (let s = 0; s < 6; s++) {
      const kind = FISH[s % FISH.length];
      const g = fishGeometry(kind.col, kind.size * (0.8 + Math.random() * 0.4));
      const n = 7 + Math.floor(Math.random() * 6);
      const school: School = { meshes: [], off: [], c: new THREE.Vector3(), goal: new THREE.Vector3(), vel: new THREE.Vector3(), t: 0, floor: 0, surf: 0 };
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(g, this.fishMat);
        m.frustumCulled = false;
        m.visible = false;
        this.scene.add(m);
        school.meshes.push(m);
        school.off.push(new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 1.6));
      }
      this.schools.push(school);
    }
  }

  update(game: Game, dt: number) {
    if (!this.active(game)) {
      if (this.gulls.length) this.scene.visible = false;
      return;
    }
    if (!this.gulls.length) this.build();
    this.scene.visible = true;
    this.time += dt;
    const p = game.player.pos;
    const w = game.world;
    // light: sky light at the player's eye (ambient creatures share it)
    const L0 = w.getLight(Math.floor(p.x), Math.floor(p.y + 1.6), Math.floor(p.z));
    const L = L0 < 0 ? 0xf000 : L0;
    if (this.gullMat) setEntityLight(this.gullMat, L | 0xf000);
    if (this.fishMat) setEntityLight(this.fishMat, L);
    if ((this.relocate -= dt) <= 0) {
      this.relocate = 1.5;
      this.placeGulls(game);
      this.placeSchools(game);
    }
    this.updateGulls(game, dt);
    this.updateSchools(game, dt);
  }

  // ---------------------------------------------------------------- gulls
  private placeGulls(game: Game) {
    const p = game.player.pos;
    const day = game.skyLightFactor > 0.55;
    for (const g of this.gulls) {
      const far = Math.hypot(g.cx - p.x, g.cz - p.z) > 110;
      if (!day) { g.root.visible = false; continue; }
      if (g.root.visible && !far) continue;
      // circle over the shore or the lagoon near the player
      const spot = this.findShore(game, 25, 80);
      if (!spot) { g.root.visible = false; continue; }
      g.cx = spot.x; g.cz = spot.z;
      g.r = 6 + Math.random() * 16;
      g.alt = SEA + 10 + Math.random() * 22;
      g.ang = Math.random() * Math.PI * 2;
      g.w = (0.25 + Math.random() * 0.25) * (Math.random() < 0.5 ? 1 : -1);
      g.root.visible = true;
    }
  }

  private findShore(game: Game, rMin: number, rMax: number): { x: number; z: number } | null {
    const p = game.player.pos, w = game.world;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, d = rMin + Math.random() * (rMax - rMin);
      const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      if (!w.isLoaded(x, z)) continue;
      const b = BIOMES[w.getBiome(x, z)]?.name ?? '';
      if (/tropical_beach|tropical_lagoon|stony_shore|palm_grove/.test(b)) return { x, z };
    }
    return null;
  }

  private updateGulls(game: Game, dt: number) {
    for (const g of this.gulls) {
      if (!g.root.visible) continue;
      g.ang += (g.w * dt * 8) / Math.max(4, g.r);
      // drifting circles, gently rising and sinking on the breeze
      const t = this.time + g.seed;
      const cx = g.cx + Math.sin(t * 0.05) * 6, cz = g.cz + Math.cos(t * 0.04) * 6;
      const y = g.alt + Math.sin(t * 0.3) * 2.5;
      const x = cx + Math.cos(g.ang) * g.r, z = cz + Math.sin(g.ang) * g.r;
      // heading: tangent of the circle
      const dirx = -Math.sin(g.ang) * Math.sign(g.w), dirz = Math.cos(g.ang) * Math.sign(g.w);
      const yaw = Math.atan2(-dirx, -dirz);
      const bank = -Math.sign(g.w) * Math.min(0.6, (8 * Math.abs(g.w)) / Math.max(4, g.r) * 4);
      g.root.position.set(x, y, z);
      g.root.rotation.set(Math.cos(t * 0.3) * 0.08, yaw, bank, 'YXZ');
      // flap in bursts, otherwise glide with a slight dihedral
      if ((g.flapT -= dt) <= 0) { g.flapT = 3 + Math.random() * 6; g.flap = 1.2 + Math.random() * 1.2; }
      g.flap = Math.max(0, g.flap - dt);
      const beat = g.flap > 0 ? Math.sin(t * 13) * 0.55 : 0.12 + Math.sin(t * 1.3) * 0.04;
      g.wr.rotation.set(0, 0, beat);
      g.wl.rotation.set(0, 0, -beat);
    }
  }

  // ---------------------------------------------------------------- fish
  private placeSchools(game: Game) {
    const p = game.player.pos;
    for (const s of this.schools) {
      const vis = s.meshes[0].visible;
      if (vis && s.c.distanceTo(p) < 40) continue;
      const spot = this.findWater(game, 6, 30);
      for (const m of s.meshes) m.visible = !!spot;
      if (!spot) continue;
      s.c.copy(spot);
      s.goal.copy(spot);
      s.vel.set(0, 0, 0);
      s.t = 0;
    }
  }

  /** A point in water at least 2 deep (lagoon / reef), or null. */
  private findWater(game: Game, rMin: number, rMax: number): THREE.Vector3 | null {
    const p = game.player.pos, w = game.world;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, d = rMin + Math.random() * (rMax - rMin);
      const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      if (!w.isLoaded(x, z)) continue;
      const col = this.waterColumn(game, x, z);
      if (!col || col.surf - col.floor < 2) continue;
      return new THREE.Vector3(x + 0.5, col.floor + 0.6 + Math.random() * (col.surf - col.floor - 1.2), z + 0.5);
    }
    return null;
  }

  private waterColumn(game: Game, x: number, z: number): { floor: number; surf: number } | null {
    const w = game.world;
    let y = SEA - 1;
    if (!T_LIQUID[w.getBlock(x, y, z) >>> 4]) return null;
    while (y > 2 && T_LIQUID[w.getBlock(x, y - 1, z) >>> 4]) y--;
    return { floor: y, surf: SEA - 1 };
  }

  private updateSchools(game: Game, dt: number) {
    for (const s of this.schools) {
      if (!s.meshes[0].visible) continue;
      s.t -= dt;
      if (s.t <= 0 || s.c.distanceToSquared(s.goal) < 0.5) {
        s.t = 3 + Math.random() * 5;
        // next waypoint nearby, inside the water
        for (let i = 0; i < 8; i++) {
          const x = Math.floor(s.c.x + (Math.random() - 0.5) * 12), z = Math.floor(s.c.z + (Math.random() - 0.5) * 12);
          const col = this.waterColumn(game, x, z);
          if (!col || col.surf - col.floor < 2) continue;
          s.goal.set(x + 0.5, col.floor + 0.7 + Math.random() * (col.surf - col.floor - 1.4), z + 0.5);
          break;
        }
      }
      // scatter from the player when they swim close
      const pl = game.player.pos;
      _v.copy(s.goal).sub(s.c);
      const d = _v.length();
      if (d > 1e-3) _v.multiplyScalar(Math.min(1.4, d) / d);
      const dp = s.c.distanceTo(pl);
      if (dp < 2.5) _v.add(s.c.clone().sub(pl).setY(0).normalize().multiplyScalar(3));
      s.vel.lerp(_v, 1 - Math.exp(-1.5 * dt));
      s.c.addScaledVector(s.vel, dt);
      const speed = s.vel.length();
      const yaw = Math.atan2(-s.vel.x, -s.vel.z);
      for (let i = 0; i < s.meshes.length; i++) {
        const m = s.meshes[i], o = s.off[i];
        const t = this.time * 1.3 + i * 1.7;
        const ox = o.x + Math.sin(t * 0.7) * 0.3, oy = o.y + Math.sin(t * 0.9) * 0.15, oz = o.z + Math.cos(t * 0.6) * 0.3;
        // rotate the formation with the heading
        const c = Math.cos(yaw), sn = Math.sin(yaw);
        m.position.set(s.c.x + ox * c + oz * sn, s.c.y + oy, s.c.z - ox * sn + oz * c);
        // keep inside the water
        if (m.position.y > SEA - 1.3) m.position.y = SEA - 1.3;
        const wig = Math.sin(this.time * (10 + speed * 6) + i) * (0.18 + speed * 0.1);
        _e.set(-s.vel.y * 0.3, yaw + wig, 0, 'YXZ');
        _q.setFromEuler(_e);
        m.quaternion.copy(_q);
      }
    }
  }

  onWorldChange() {
    for (const g of this.gulls) g.root.visible = false;
    for (const s of this.schools) for (const m of s.meshes) m.visible = false;
    this.relocate = 0;
  }
}
