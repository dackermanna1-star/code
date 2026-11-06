// Visual effects: blood, gore, decals, impacts, muzzle flashes, shell casings, tracers, explosions, smoke, fire,
// sparks, splashes, dust, block debris. Everything is pooled; 4 draw calls total (cubes, lit sprites,
// additive sprites, decals). No allocations per frame.
import * as THREE from 'three';
import { globalUniforms } from '../../render/materials.js';
import { CubeParticles, CK } from './CubeParticles.js';
import { SpriteParticles, MODE } from './SpriteParticles.js';
import { Decals } from './Decals.js';
import { getSpriteAtlas, getDecalAtlas, SPRITE, DECAL } from './textures.js';

// authoring colours are sRGB 0..255; particle shaders want linear albedo
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const L3 = (r, g, b) => [lin(r), lin(g), lin(b)];

const COL = {
  blood: [L3(104, 10, 8), L3(84, 8, 6), L3(122, 14, 12), L3(70, 6, 5)],
  flesh: [L3(150, 52, 48), L3(120, 30, 28), L3(170, 80, 70), L3(96, 16, 14)],
  bone: L3(214, 204, 180),
  brass: L3(200, 160, 70), brassDark: L3(160, 120, 50), red: L3(170, 30, 26),
  stone: [L3(130, 128, 124), L3(104, 102, 98), L3(150, 148, 142)],
  wood: [L3(160, 120, 74), L3(120, 86, 50), L3(196, 160, 110)],
  dirt: [L3(96, 72, 48), L3(80, 60, 40), L3(110, 86, 58)],
  grass: [L3(80, 120, 50), L3(66, 100, 40)],
  sand: [L3(210, 190, 140), L3(190, 170, 120)],
  gravel: [L3(120, 118, 114), L3(90, 88, 86), L3(140, 136, 130)],
  glass: L3(170, 210, 225),
  leaf: [L3(90, 130, 50), L3(200, 110, 30), L3(170, 60, 30), L3(210, 160, 40)],
  char: [L3(30, 28, 26), L3(50, 44, 40), L3(70, 60, 50)],
  cloth: [L3(120, 120, 116), L3(90, 90, 96)],
};
const DUSTC = {
  stone: [0.62, 0.6, 0.57], wood: [0.55, 0.45, 0.32], dirt: [0.45, 0.36, 0.26], grass: [0.45, 0.4, 0.3],
  sand: [0.8, 0.72, 0.55], gravel: [0.55, 0.54, 0.52], cloth: [0.75, 0.75, 0.72], metal: [0.5, 0.5, 0.5],
};
const rnd = Math.random;
const rr = (a, b) => a + (b - a) * rnd();
const pick = (a) => a[(rnd() * a.length) | 0];

export class FX {
  /**
   * @param scene THREE.Scene
   * @param world voxel world: isSolid(x,y,z), skyAt(x,y,z), blockLightAt(x,y,z) (integer coords)
   */
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'fx';
    scene.add(this.group);
    const spriteMap = getSpriteAtlas();
    this.cubes = new CubeParticles(this.group, 1600);
    this.lit = new SpriteParticles(this.group, spriteMap, 1400, false);
    this.add = new SpriteParticles(this.group, spriteMap, 1400, true);
    this.decals = new Decals(this.group, getDecalAtlas(), 600);
    this.emitters = [];
    this.lights = []; // active dynamic lights: {x,y,z, r,g,b, radius, intensity} (see getLights)
    this._lightPool = [];
    this._camPos = new THREE.Vector3(0, 0, 0);
    this._sky = 1; this._blk = 0;
    this.maxDistance = 160;
    this.onShellLand = null; // optional callback (x, y, z, kind) for audio
    this.cubes.onHit = (i, x, y, z, nx, ny, nz) => this._cubeHit(i, x, y, z, nx, ny, nz);
    this.wind = new THREE.Vector3();
    this._noDecal = false;
  }

  // ------------------------------------------------------------------ helpers
  _light(x, y, z) {
    const w = this.world;
    if (w && w.skyAt) {
      const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
      this._sky = w.skyAt(ix, iy, iz) / 15;
      this._blk = w.blockLightAt ? w.blockLightAt(ix, iy, iz) / 15 : 0;
    } else { this._sky = 1; this._blk = 0; }
  }
  _solid(x, y, z) {
    const w = this.world;
    return w ? w.isSolid(Math.floor(x), Math.floor(y), Math.floor(z)) : y < 0;
  }
  _far(p) {
    const c = this._camPos;
    const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
    return dx * dx + dy * dy + dz * dz > this.maxDistance * this.maxDistance;
  }
  _now() { return globalUniforms.uTime.value; }

  _addLight(x, y, z, r, g, b, radius, life, flicker = 0) {
    let L = this._lightPool.pop();
    if (!L) L = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, radius: 0, intensity: 0, life: 0, age: 0, flicker: 0, base: [0, 0, 0], emitter: null };
    L.x = x; L.y = y; L.z = z; L.base[0] = r; L.base[1] = g; L.base[2] = b; L.r = r; L.g = g; L.b = b;
    L.radius = radius; L.life = life; L.age = 0; L.flicker = flicker; L.intensity = 1; L.emitter = null;
    this.lights.push(L);
    return L;
  }

  /** Is (x,y,z) on a solid face with outward normal n?  Returns the usable decal size (0 = none). */
  _fit(x, y, z, nx, ny, nz, size) {
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    if (Math.max(ax, ay, az) < 0.99) return size; // arbitrary surface (not a voxel face): trust the caller
    if (!this._solid(x - nx * 0.03, y - ny * 0.03, z - nz * 0.03)) return 0;
    let t0, t1, t2, b0, b1, b2;
    if (ay > 0.5) { t0 = 1; t1 = 0; t2 = 0; b0 = 0; b1 = 0; b2 = 1; }
    else if (ax > 0.5) { t0 = 0; t1 = 0; t2 = 1; b0 = 0; b1 = 1; b2 = 0; }
    else { t0 = 1; t1 = 0; t2 = 0; b0 = 0; b1 = 1; b2 = 0; }
    for (let attempt = 0; attempt < 3; attempt++) {
      const h = size * 0.42;
      let ok = true;
      for (let k = 0; k < 4 && ok; k++) {
        const cx = (k & 1) ? h : -h, cy = (k & 2) ? h : -h;
        const px = x + t0 * cx + b0 * cy, py = y + t1 * cx + b1 * cy, pz = z + t2 * cx + b2 * cy;
        if (!this._solid(px - nx * 0.03, py - ny * 0.03, pz - nz * 0.03) || this._solid(px + nx * 0.05, py + ny * 0.05, pz + nz * 0.05)) ok = false;
      }
      if (ok) return size;
      size *= 0.6;
    }
    return 0;
  }

  _decal(x, y, z, nx, ny, nz, size, frame, col, alpha, grow = 0, kind = 0, rot = null, stretchY = 1) {
    if (this._noDecal && kind === 0) return -1;
    const s = this._fit(x, y, z, nx, ny, nz, size);
    if (s <= 0.02) return -1;
    this._light(x + nx * 0.5, y + ny * 0.5, z + nz * 0.5);
    const r = rot === null ? rnd() * Math.PI * 2 : rot;
    return this.decals.add(x, y, z, nx, ny, nz, s, r, frame, col[0], col[1], col[2], alpha, this._sky, this._blk, grow, kind, this._now(), stretchY);
  }

  _bloodDecal(x, y, z, nx, ny, nz, size) {
    const k = 0.85 + rnd() * 0.3;
    const wall = Math.abs(ny) < 0.5;
    const id = this._decal(x, y, z, nx, ny, nz, size, pick(DECAL.blood), [k, k, k], 1, 0.12, 1);
    if (id >= 0 && wall && size > 0.22 && rnd() < 0.6) {
      // drip running down from the splat
      const len = size * (1.2 + rnd());
      this._decal(x, y - len * 0.45, z, nx, ny, nz, size * 0.8, pick(DECAL.drip), [k, k, k], 1, 0, 1, 0, len / (size * 0.8));
    }
    return id;
  }

  _cubeHit(i, x, y, z, nx, ny, nz) {
    const c = this.cubes, kind = c.kind[i];
    if (kind === CK.BLOOD) {
      if (rnd() < 0.75) this._bloodDecal(x, y, z, nx, ny, nz, c.sx[i] * rr(3.5, 7));
      return true;
    }
    if (kind === CK.GORE && c.hits[i] <= 2) this._bloodDecal(x, y, z, nx, ny, nz, rr(0.18, 0.34));
    if (kind === CK.SHELL && c.hits[i] === 1 && ny > 0 && this.onShellLand) this.onShellLand(x, y, z, c.r[i] > c.g[i] * 2 ? 'shotgun' : 'brass');
    return false;
  }

  // ------------------------------------------------------------------ blood & gore
  /** Spray of blood droplets (+ mist). dir: direction of the hit (bullet travel), amount ~1 = one hit. */
  blood(pos, dir, amount = 1) {
    if (this._far(pos)) return;
    this._light(pos.x, pos.y, pos.z);
    const n = Math.min(40, Math.round(10 * amount + rnd() * 4));
    const dx = dir ? dir.x : 0, dy = dir ? dir.y : 0, dz = dir ? dir.z : 0;
    for (let k = 0; k < n; k++) {
      const back = rnd() < 0.3 ? -0.6 : 1; // some spray back towards the shooter
      const sp = rr(1.2, 4.5);
      const s = rr(0.025, 0.06);
      const c = pick(COL.blood);
      this.cubes.spawn(CK.BLOOD, pos.x, pos.y, pos.z,
        dx * sp * back + rr(-1.2, 1.2), dy * sp * back + rr(0, 1.8), dz * sp * back + rr(-1.2, 1.2),
        s, s, s, c[0], c[1], c[2], 3, { drag: 0.6, bounce: 0, sky: this._sky, block: this._blk, gloss: 0.6, spin: 4 });
    }
    const m = Math.min(5, 1 + Math.round(amount * 2));
    for (let k = 0; k < m; k++) {
      this.lit.spawn(pos.x + rr(-0.05, 0.05), pos.y + rr(-0.05, 0.05), pos.z + rr(-0.05, 0.05), {
        vx: dx * rr(0.5, 2) + rr(-0.4, 0.4), vy: rr(-0.1, 0.5), vz: dz * rr(0.5, 2) + rr(-0.4, 0.4), drag: 3.5, grav: -0.6,
        s0: rr(0.12, 0.22), s1: rr(0.5, 0.9) * Math.min(1.6, amount), life: rr(0.35, 0.6), color: [0.42, 0.03, 0.025], alpha: 0.75,
        frame: SPRITE.MIST, spin: rr(-2, 2), sky: this._sky, block: this._blk, fadeOut: 0.7,
      });
    }
  }

  /** Blood splat decal directly on a surface (pos on the surface, normal = face normal). */
  bloodSplat(pos, normal, size = 1) {
    if (this._far(pos)) return;
    this._bloodDecal(pos.x, pos.y, pos.z, normal.x, normal.y, normal.z, rr(0.45, 0.85) * size);
  }

  /** Growing pool of blood under a body (pos = roughly the body centre). */
  bloodPool(pos, size = 1) {
    if (this._far(pos)) return;
    let y = Math.floor(pos.y + 0.3);
    for (let k = 0; k < 4 && !this._solid(pos.x, y - 1, pos.z); k++) y--;
    if (!this._solid(pos.x, y - 1, pos.z)) return;
    const s = rr(1.3, 1.8) * size;
    // pools may hang a bit over block edges: shrink-to-fit but keep at least a small pool
    this._decal(pos.x, y, pos.z, 0, 1, 0, s, pick(DECAL.pool), [0.92, 0.9, 0.9], 0.96, rr(9, 15), 1);
  }

  /** Chunky gore gibs (headshots, explosions) + heavy blood. */
  gore(pos, dir, amount = 1) {
    if (this._far(pos)) return;
    this._light(pos.x, pos.y, pos.z);
    const n = Math.min(24, Math.round(7 * amount));
    const dx = dir ? dir.x : 0, dy = dir ? dir.y : 0, dz = dir ? dir.z : 0;
    for (let k = 0; k < n; k++) {
      const bone = rnd() < 0.12;
      const c = bone ? COL.bone : pick(COL.flesh);
      const s = rr(0.05, 0.13) * (bone ? 0.7 : 1);
      const sp = rr(1.5, 4.5);
      this.cubes.spawn(CK.GORE, pos.x, pos.y, pos.z,
        dx * sp + rr(-2, 2), dy * sp + rr(1, 4), dz * sp + rr(-2, 2),
        s, s * rr(0.6, 1), s * rr(0.7, 1.2), c[0], c[1], c[2], rr(5, 9), { bounce: 0.35, drag: 0.3, sky: this._sky, block: this._blk, gloss: bone ? 0.1 : 0.7, spin: 14 });
    }
    this.blood(pos, dir, amount * 1.8);
    this.lit.spawn(pos.x, pos.y, pos.z, { vx: dx, vy: 0.3, vz: dz, drag: 3, s0: 0.3, s1: 1.4 * Math.min(2, amount), life: 0.7, color: [0.38, 0.03, 0.02], alpha: 0.8, frame: SPRITE.MIST, sky: this._sky, block: this._blk });
  }

  // ------------------------------------------------------------------ impacts
  /**
   * Bullet / melee impact on a surface. mat: stone wood metal dirt grass sand gravel glass cloth leaves water flesh.
   * opts.decal = false skips the bullet-hole decal (use for non-voxel surfaces such as vehicles).
   */
  impact(pos, normal, mat = 'stone', opts = null) {
    if (this._far(pos)) return;
    this._noDecal = !!(opts && opts.decal === false);
    const nx = normal ? normal.x : 0, ny = normal ? normal.y : 1, nz = normal ? normal.z : 0;
    const x = pos.x + nx * 0.02, y = pos.y + ny * 0.02, z = pos.z + nz * 0.02;
    this._light(x + nx * 0.3, y + ny * 0.3, z + nz * 0.3);
    const sky = this._sky, blk = this._blk;
    const puff = (n, col, s1, spd = 0.8, life = 1.0, alpha = 0.6) => {
      for (let k = 0; k < n; k++) {
        this.lit.spawn(x, y, z, {
          vx: nx * rr(0.5, 1.5) * spd + rr(-0.3, 0.3), vy: ny * rr(0.5, 1.5) * spd + rr(0, 0.4), vz: nz * rr(0.5, 1.5) * spd + rr(-0.3, 0.3),
          drag: 3, grav: 0.15, s0: 0.08, s1: s1 * rr(0.7, 1.2), life: life * rr(0.7, 1.3), color: col, alpha, frame: pick([SPRITE.DUST, SPRITE.SMOKE_C]),
          spin: rr(-1, 1), sky, block: blk,
        });
      }
    };
    const chips = (n, cols, s0, s1, spd, kind = CK.DEBRIS, shape = null, extra = null) => {
      for (let k = 0; k < n; k++) {
        const c = pick(cols);
        const s = rr(s0, s1);
        const sp = rr(spd * 0.5, spd);
        const sx = shape ? s * shape[0] : s, sy = shape ? s * shape[1] : s, sz = shape ? s * shape[2] : s;
        this.cubes.spawn(kind, x, y, z, nx * sp + rr(-1.5, 1.5), ny * sp + rr(0.5, 2.5), nz * sp + rr(-1.5, 1.5), sx, sy, sz, c[0], c[1], c[2], rr(1.2, 2.5),
          { bounce: 0.3, sky, block: blk, spin: 18, ...(extra || {}) });
      }
    };
    switch (mat) {
      case 'wood':
        chips(7, COL.wood, 0.05, 0.1, 4, CK.SPLINTER, [0.25, 0.25, 1.0]);
        puff(2, DUSTC.wood, 0.4, 0.8, 0.8, 0.45);
        this._decal(pos.x, pos.y, pos.z, nx, ny, nz, 0.17, DECAL.hole_wood[0], [1, 1, 1], 1);
        break;
      case 'metal':
        this.sparks(pos, normal, 12);
        puff(1, DUSTC.metal, 0.3, 0.6, 0.6, 0.35);
        this._decal(pos.x, pos.y, pos.z, nx, ny, nz, 0.14, DECAL.hole_metal[0], [1, 1, 1], 1);
        break;
      case 'dirt': case 'grass': case 'mud':
        chips(6, mat === 'grass' ? [...COL.dirt, ...COL.grass] : COL.dirt, 0.04, 0.09, 4);
        puff(3, DUSTC.dirt, 0.6, 1.2, 1.1, 0.6);
        this._decal(pos.x, pos.y, pos.z, nx, ny, nz, 0.16, DECAL.hole_dirt[0], [1, 1, 1], 0.9);
        break;
      case 'sand':
        chips(9, COL.sand, 0.02, 0.04, 4);
        puff(4, DUSTC.sand, 0.7, 1.4, 1.2, 0.6);
        break;
      case 'gravel':
        chips(8, COL.gravel, 0.03, 0.07, 4.5);
        puff(2, DUSTC.gravel, 0.5, 1, 1, 0.5);
        this._decal(pos.x, pos.y, pos.z, nx, ny, nz, 0.14, DECAL.hole_dirt[0], [1.2, 1.2, 1.2], 0.8);
        break;
      case 'glass':
        chips(8, [COL.glass], 0.03, 0.07, 3, CK.GLASS, [1, 1, 0.15], { gloss: 1 });
        for (let k = 0; k < 4; k++) this.add.spawn(x + rr(-0.1, 0.1), y + rr(-0.1, 0.1), z + rr(-0.1, 0.1), { s0: 0.12, life: rr(0.1, 0.25), color: [2, 2.2, 2.4], frame: SPRITE.GLINT, rot: 0, fadeIn: 0, fadeOut: 0.8 });
        this._decal(pos.x, pos.y, pos.z, nx, ny, nz, 0.24, DECAL.hole_glass[0], [1, 1, 1], 0.9);
        break;
      case 'cloth':
        puff(2, DUSTC.cloth, 0.35, 0.6, 0.8, 0.5);
        chips(3, COL.cloth, 0.02, 0.04, 2, CK.DEBRIS, null, { grav: 0.3, drag: 2 });
        this._decal(pos.x, pos.y, pos.z, nx, ny, nz, 0.08, DECAL.hole_dirt[0], [1, 1, 1], 0.9);
        break;
      case 'leaves': case 'plant':
        chips(7, COL.leaf, 0.04, 0.07, 2, CK.LEAF, [1, 0.12, 1], { grav: 0.12, drag: 2.5, spin: 6 });
        break;
      case 'water':
        this.splash(pos, 0.5);
        break;
      case 'flesh':
        this.blood(pos, normal, 0.7);
        break;
      default: // stone, concrete, brick, asphalt …
        chips(6, COL.stone, 0.025, 0.055, 4.5);
        puff(3, DUSTC.stone, 0.5, 1, 1.0, 0.55);
        if (rnd() < 0.35) this.sparks(pos, normal, 3);
        this._decal(pos.x, pos.y, pos.z, nx, ny, nz, 0.18, DECAL.hole_stone[0], [1, 1, 1], 1);
    }
    this._noDecal = false;
  }

  // ------------------------------------------------------------------ guns
  /** Bright additive muzzle flash (very short) + smoke wisp + dynamic light. */
  muzzleFlash(pos, dir, scale = 1) {
    const dx = dir ? dir.x : 0, dy = dir ? dir.y : 0, dz = dir ? dir.z : 1;
    this._light(pos.x, pos.y, pos.z);
    this.add.spawn(pos.x + dx * 0.06, pos.y + dy * 0.06, pos.z + dz * 0.06, { s0: 0.42 * scale, s1: 0.55 * scale, life: 0.05, color: [4.5, 3, 1.3], frame: SPRITE.STAR, fadeIn: 0, fadeOut: 0.6 });
    this.add.spawn(pos.x + dx * 0.18, pos.y + dy * 0.18, pos.z + dz * 0.18, { vx: dx * 4, vy: dy * 4, vz: dz * 4, s0: 0.14 * scale, stretch: 0.45 * scale, mode: MODE.STRETCH, life: 0.045, color: [4, 2.4, 0.8], frame: SPRITE.FLAME_A, fadeIn: 0, fadeOut: 0.6 });
    this.add.spawn(pos.x, pos.y, pos.z, { s0: 0.6 * scale, life: 0.05, color: [1.8, 1.0, 0.35], alpha: 0.4, frame: SPRITE.GLOW, fadeIn: 0 });
    for (let k = 0; k < 3; k++) {
      this.lit.spawn(pos.x + dx * 0.1, pos.y + dy * 0.1, pos.z + dz * 0.1, {
        vx: dx * rr(0.8, 2) + rr(-0.2, 0.2), vy: dy * rr(0.8, 2) + rr(0.1, 0.4), vz: dz * rr(0.8, 2) + rr(-0.2, 0.2), drag: 2.5, grav: 0.3,
        s0: 0.08, s1: rr(0.4, 0.7) * scale, life: rr(0.6, 1.1), color: [0.5, 0.5, 0.5], alpha: 0.3, frame: SPRITE.SMOKE_B, spin: rr(-1, 1), sky: this._sky, block: this._blk,
      });
    }
    this._addLight(pos.x + dx * 0.3, pos.y + dy * 0.3, pos.z + dz * 0.3, 3.2, 2.2, 1.0, 9 * scale, 0.07);
  }

  /** Ejected shell casing. dir = ejection direction; kind 'pistol'|'rifle'|'shotgun'|'22'. */
  shell(pos, dir, kind = 'pistol') {
    this._light(pos.x, pos.y, pos.z);
    const dx = dir ? dir.x : 1, dy = dir ? dir.y : 0, dz = dir ? dir.z : 0;
    const sp = rr(1.6, 2.6);
    let sx = 0.012, sy = 0.024, col = COL.brass, o2 = null;
    if (kind === 'rifle') { sx = 0.013; sy = 0.05; }
    else if (kind === '22') { sx = 0.007; sy = 0.016; }
    else if (kind === 'shotgun') { sx = 0.024; sy = 0.062; col = COL.red; o2 = { color2: COL.brass, split: 0.28 }; }
    this.cubes.spawn(CK.SHELL, pos.x, pos.y, pos.z, dx * sp + rr(-0.3, 0.3), dy * sp + rr(1.2, 2.0), dz * sp + rr(-0.3, 0.3), sx, sy, sx,
      col[0], col[1], col[2], rr(5, 7), { bounce: 0.45, drag: 0.2, spin: 26, gloss: kind === 'shotgun' ? 0.3 : 0.9, sky: this._sky, block: this._blk, ...(o2 || {}) });
  }

  /** Faint fast streak from → to. */
  tracer(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1) return;
    const speed = 380;
    const ux = dx / d, uy = dy / d, uz = dz / d;
    const len = Math.min(4, d * 0.5);
    this.add.spawn(from.x + ux * len * 0.5, from.y + uy * len * 0.5, from.z + uz * len * 0.5, {
      vx: ux * speed, vy: uy * speed, vz: uz * speed, drag: 0, s0: 0.025, stretch: len, mode: MODE.STRETCH,
      life: Math.max(0.02, (d - len) / speed), color: [2.4, 1.9, 1.1], alpha: 0.5, frame: SPRITE.STREAK, fadeIn: 0, fadeOut: 0.3,
    });
  }

  // ------------------------------------------------------------------ misc particles
  sparks(pos, dir, count = 14) {
    if (this._far(pos)) return;
    const dx = dir ? dir.x : 0, dy = dir ? dir.y : 1, dz = dir ? dir.z : 0;
    for (let k = 0; k < count; k++) {
      const sp = rr(2, 8);
      this.add.spawn(pos.x + dx * 0.03, pos.y + dy * 0.03, pos.z + dz * 0.03, {
        vx: dx * sp + rr(-2.5, 2.5), vy: dy * sp + rr(-0.5, 3), vz: dz * sp + rr(-2.5, 2.5), grav: -12, drag: 0.6,
        s0: 0.025, stretch: 0.16, mode: MODE.STRETCH, life: rr(0.2, 0.55), color: [4, 2.2, 0.7], color1: [1.5, 0.35, 0.05],
        frame: SPRITE.STREAK, fadeIn: 0, fadeOut: 0.4, collide: true, bounce: 0.4,
      });
    }
    this.add.spawn(pos.x, pos.y, pos.z, { s0: 0.35, life: 0.05, color: [3, 2.2, 1.2], alpha: 0.8, frame: SPRITE.GLOW, fadeIn: 0 });
    if (count >= 8) this._addLight(pos.x + dx * 0.2, pos.y + dy * 0.2, pos.z + dz * 0.2, 1.6, 1.1, 0.5, 4, 0.06);
  }

  /** Water splash (pos at the water surface). */
  splash(pos, scale = 1) {
    if (this._far(pos)) return;
    this._light(pos.x, pos.y + 0.5, pos.z);
    const n = Math.round(16 * scale);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, sp = rr(0.5, 2) * scale;
      this.lit.spawn(pos.x, pos.y + 0.05, pos.z, {
        vx: Math.cos(a) * sp, vy: rr(2, 4.2) * Math.sqrt(scale), vz: Math.sin(a) * sp, grav: -14, drag: 0.3,
        s0: rr(0.07, 0.13) * Math.sqrt(scale), life: rr(0.45, 0.8), color: [0.85, 0.92, 1.0], alpha: 0.85, frame: SPRITE.DROP, rot: 0, sky: this._sky, block: this._blk, fadeOut: 0.3,
      });
    }
    this.lit.spawn(pos.x, pos.y + 0.03, pos.z, { s0: 0.2 * scale, s1: 1.5 * scale, life: 0.7, color: [0.9, 0.95, 1], alpha: 0.55, frame: SPRITE.RING, mode: MODE.FLAT, sky: this._sky, block: this._blk, fadeIn: 0, grow: 0.6 });
    this.lit.spawn(pos.x, pos.y + 0.15, pos.z, { vy: 0.4, s0: 0.3 * scale, s1: 1.1 * scale, life: 0.6, color: [0.9, 0.95, 1], alpha: 0.35, frame: SPRITE.MIST, drag: 2, sky: this._sky, block: this._blk });
  }

  /** Small dust puff (footsteps, landing, bodies hitting the ground). color [r,g,b] 0..1 (optional). */
  dust(pos, color = null, scale = 1) {
    if (this._far(pos)) return;
    this._light(pos.x, pos.y + 0.3, pos.z);
    const c = color || DUSTC.dirt;
    const n = 3 + Math.round(2 * scale);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, sp = rr(0.3, 0.9) * scale;
      this.lit.spawn(pos.x + Math.cos(a) * 0.1, pos.y + 0.05, pos.z + Math.sin(a) * 0.1, {
        vx: Math.cos(a) * sp, vy: rr(0.1, 0.4), vz: Math.sin(a) * sp, drag: 3, grav: 0.05,
        s0: 0.12 * scale, s1: rr(0.45, 0.75) * scale, life: rr(0.6, 1.1), color: c, alpha: 0.5, frame: SPRITE.DUST, spin: rr(-1, 1), sky: this._sky, block: this._blk,
      });
    }
  }

  /** Cube debris of a broken block. pos: block centre (or hit point), colorRGB: [r,g,b] (0..1 or 0..255), hex or THREE.Color */
  blockBreak(pos, colorRGB) {
    if (this._far(pos)) return;
    let r = 0.5, g = 0.5, b = 0.5;
    if (colorRGB && colorRGB.isColor) { r = colorRGB.r; g = colorRGB.g; b = colorRGB.b; }
    else if (typeof colorRGB === 'number') { r = ((colorRGB >> 16) & 255) / 255; g = ((colorRGB >> 8) & 255) / 255; b = (colorRGB & 255) / 255; r = lin(r * 255); g = lin(g * 255); b = lin(b * 255); }
    else if (Array.isArray(colorRGB)) {
      const big = colorRGB[0] > 1 || colorRGB[1] > 1 || colorRGB[2] > 1;
      r = lin(big ? colorRGB[0] : colorRGB[0] * 255); g = lin(big ? colorRGB[1] : colorRGB[1] * 255); b = lin(big ? colorRGB[2] : colorRGB[2] * 255);
    }
    this._light(pos.x, pos.y + 0.6, pos.z);
    for (let k = 0; k < 18; k++) {
      const v = rr(0.8, 1.2);
      const s = rr(0.07, 0.16);
      const ox = rr(-0.4, 0.4), oy = rr(-0.4, 0.4), oz = rr(-0.4, 0.4);
      this.cubes.spawn(CK.DEBRIS, pos.x + ox, pos.y + oy, pos.z + oz, ox * rr(3, 6), rr(1.5, 4), oz * rr(3, 6), s, s, s,
        r * v, g * v, b * v, rr(1.2, 2.2), { bounce: 0.3, sky: this._sky, block: this._blk, spin: 10 });
    }
    const dc = [Math.min(1, Math.sqrt(r) * 1.1), Math.min(1, Math.sqrt(g) * 1.1), Math.min(1, Math.sqrt(b) * 1.1)];
    for (let k = 0; k < 4; k++) {
      this.lit.spawn(pos.x + rr(-0.3, 0.3), pos.y + rr(-0.3, 0.3), pos.z + rr(-0.3, 0.3), { vx: rr(-0.6, 0.6), vy: rr(0, 0.6), vz: rr(-0.6, 0.6), drag: 2.5, s0: 0.3, s1: 0.9, life: rr(0.7, 1.2), color: dc, alpha: 0.5, frame: SPRITE.DUST, sky: this._sky, block: this._blk });
    }
  }

  /** Window breaking: falling glass shards + glints. */
  glass(pos) {
    if (this._far(pos)) return;
    this._light(pos.x, pos.y, pos.z);
    for (let k = 0; k < 26; k++) {
      const s = rr(0.04, 0.12);
      this.cubes.spawn(CK.GLASS, pos.x + rr(-0.45, 0.45), pos.y + rr(-0.45, 0.45), pos.z + rr(-0.45, 0.45),
        rr(-1.5, 1.5), rr(-0.5, 1.5), rr(-1.5, 1.5), s, s * rr(0.6, 1.4), 0.008,
        COL.glass[0], COL.glass[1], COL.glass[2], rr(2.5, 4), { bounce: 0.25, gloss: 1.2, spin: 12, sky: this._sky, block: this._blk });
    }
    for (let k = 0; k < 7; k++) this.add.spawn(pos.x + rr(-0.5, 0.5), pos.y + rr(-0.5, 0.5), pos.z + rr(-0.5, 0.5), { vy: -1, s0: rr(0.1, 0.2), life: rr(0.15, 0.4), color: [2.5, 2.7, 3], frame: SPRITE.GLINT, rot: 0, fadeIn: 0.2 });
    this.dust(pos, DUSTC.cloth, 0.6);
  }

  // ------------------------------------------------------------------ explosions
  explosion(pos, radius = 4) {
    if (this._far(pos)) return;
    const R = radius;
    this._light(pos.x, pos.y + 0.5, pos.z);
    const sky = this._sky, blk = this._blk;
    this.add.spawn(pos.x, pos.y + 0.3, pos.z, { s0: R * 2.6, s1: R * 3.4, life: 0.14, color: [5, 3.2, 1.5], frame: SPRITE.GLOW, fadeIn: 0 });
    this.add.spawn(pos.x, pos.y + 0.3, pos.z, { s0: R * 1.4, s1: R * 2.0, life: 0.09, color: [6, 4.5, 2.5], frame: SPRITE.STAR, fadeIn: 0 });
    for (let k = 0; k < 16; k++) {
      const a = rnd() * 6.283, e = rr(-0.2, 1), sp = rr(0.8, 2.2) * R;
      const c = Math.sqrt(1 - e * e);
      this.add.spawn(pos.x, pos.y + 0.4, pos.z, {
        vx: Math.cos(a) * c * sp, vy: e * sp * 0.7 + 1, vz: Math.sin(a) * c * sp, drag: 5, grav: 2,
        s0: R * rr(0.35, 0.5), s1: R * rr(0.7, 1.0), life: rr(0.4, 0.75), color: [1.5, 0.5, 0.1], color1: [0.5, 0.06, 0.005], alpha: 0.7,
        frame: SPRITE.FLAME_A + ((rnd() * 3) | 0), spin: rr(-3, 3), fadeIn: 0, fadeOut: 0.6,
      });
    }
    for (let k = 0; k < 24; k++) {
      const a = rnd() * 6.283, e = rr(0, 1), sp = rr(0.4, 1.4) * R;
      this.lit.spawn(pos.x + rr(-0.3, 0.3), pos.y + 0.5 + rr(0, 0.5), pos.z + rr(-0.3, 0.3), {
        vx: Math.cos(a) * sp * (1 - e * 0.5), vy: e * sp * 0.6 + rr(0.8, 2), vz: Math.sin(a) * sp * (1 - e * 0.5), drag: 1.6, grav: 0.5,
        s0: R * 0.45, s1: R * rr(1.1, 1.7), life: rr(3, 6.5), color: [0.07, 0.065, 0.06], color1: [0.24, 0.235, 0.23], alpha: 0.88,
        frame: SPRITE.SMOKE_A + ((rnd() * 3) | 0), spin: rr(-0.6, 0.6), sky, block: blk, fadeIn: 0.04, fadeOut: 0.5, grow: 0.4,
      });
    }
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * 6.283 + rr(-0.2, 0.2), sp = rr(1.8, 3.2) * R;
      this.lit.spawn(pos.x + Math.cos(a) * 0.3, pos.y + 0.2, pos.z + Math.sin(a) * 0.3, {
        vx: Math.cos(a) * sp, vy: rr(0.2, 0.8), vz: Math.sin(a) * sp, drag: 3.5,
        s0: 0.6, s1: R * rr(0.5, 0.8), life: rr(1.4, 2.2), color: DUSTC.dirt, alpha: 0.65, frame: SPRITE.DUST, sky, block: blk,
      });
    }
    this.lit.spawn(pos.x, pos.y + 0.1, pos.z, { s0: 0.5, s1: R * 3.2, life: 0.4, color: [0.9, 0.85, 0.75], alpha: 0.5, frame: SPRITE.RING, mode: MODE.FLAT, fadeIn: 0, grow: 0.5, sky, block: blk });
    for (let k = 0; k < 26; k++) {
      const c = pick([...COL.char, ...COL.dirt, ...COL.stone]);
      const s = rr(0.05, 0.16);
      const a = rnd() * 6.283, sp = rr(3, 10);
      this.cubes.spawn(CK.DEBRIS, pos.x, pos.y + 0.3, pos.z, Math.cos(a) * sp, rr(3, 11), Math.sin(a) * sp, s, s, s, c[0], c[1], c[2], rr(2.5, 4.5), { bounce: 0.3, spin: 20, sky, block: blk });
    }
    for (let k = 0; k < 34; k++) {
      const a = rnd() * 6.283, e = rr(0, 1), sp = rr(6, 15);
      this.add.spawn(pos.x, pos.y + 0.4, pos.z, {
        vx: Math.cos(a) * sp * (1 - e * 0.6), vy: e * sp, vz: Math.sin(a) * sp * (1 - e * 0.6), grav: -10, drag: 0.5,
        s0: 0.04, stretch: 0.3, mode: MODE.STRETCH, life: rr(0.4, 1.1), color: [3.5, 1.6, 0.4], color1: [1.2, 0.25, 0.03], frame: SPRITE.STREAK, fadeIn: 0, collide: true, bounce: 0.3,
      });
    }
    // scorch mark on the ground
    let y = Math.floor(pos.y + 0.5);
    for (let k = 0; k < Math.ceil(R) && !this._solid(pos.x, y - 1, pos.z); k++) y--;
    if (this._solid(pos.x, y - 1, pos.z)) this._decal(pos.x, y, pos.z, 0, 1, 0, R * 1.2, DECAL.scorch[0], [1, 1, 1], 0.95);
    const L = this._addLight(pos.x, pos.y + 1, pos.z, 9, 5.5, 2.2, R * 6, 0.55);
    L.decay = 2;
  }

  // ------------------------------------------------------------------ continuous emitters
  /**
   * Smoke column. opts: {color:[r,g,b] 0..1 | hex, rate (puffs/s), size, rise (m/s), life, spread, alpha, duration}
   * @returns {stop(), setPos(p), setRate(r)}
   */
  smoke(pos, opts = {}) {
    const col = parseColor(opts.color, [0.16, 0.16, 0.16]);
    const e = {
      type: 'smoke', x: pos.x, y: pos.y, z: pos.z, acc: 0, alive: true,
      rate: opts.rate ?? 10, size: opts.size ?? 1, rise: opts.rise ?? 1.6, life: opts.life ?? 6, spread: opts.spread ?? 0.35,
      alpha: opts.alpha ?? 0.8, color: col, t: 0, duration: opts.duration ?? Infinity,
    };
    this.emitters.push(e);
    return {
      stop: () => { e.alive = false; },
      setPos: (p) => { e.x = p.x; e.y = p.y; e.z = p.z; },
      setRate: (r) => { e.rate = r; },
      get active() { return e.alive; },
    };
  }

  /**
   * Fire area (molotov fire, burning barrels / cars). opts: {radius, intensity, smoke (bool), light (bool), duration}
   * @returns {stop(), setPos(p), setIntensity(v)}
   */
  fire(pos, opts = {}) {
    const e = {
      type: 'fire', x: pos.x, y: pos.y, z: pos.z, acc: 0, acc2: 0, acc3: 0, alive: true,
      radius: opts.radius ?? 0.5, intensity: opts.intensity ?? 1, smoke: opts.smoke !== false, t: 0, duration: opts.duration ?? Infinity,
      light: null,
    };
    if (opts.light !== false) {
      e.light = this._addLight(pos.x, pos.y + 0.8, pos.z, 3.0, 1.5, 0.5, 9, Infinity, 1);
      e.light.emitter = e;
    }
    this.emitters.push(e);
    return {
      stop: () => { e.alive = false; },
      setPos: (p) => { e.x = p.x; e.y = p.y; e.z = p.z; },
      setIntensity: (v) => { e.intensity = v; },
      get active() { return e.alive; },
    };
  }

  _updateEmitters(dt) {
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      e.t += dt;
      if (e.t > e.duration) e.alive = false;
      if (!e.alive) {
        if (e.light) { e.light.life = 0; e.light.emitter = null; }
        this.emitters[i] = this.emitters[this.emitters.length - 1]; this.emitters.pop(); i--; continue;
      }
      if (this._far(e)) continue;
      if (e.type === 'smoke') {
        e.acc += dt * e.rate;
        if (e.acc > 1) this._light(e.x, e.y + 1, e.z);
        while (e.acc >= 1) {
          e.acc -= 1;
          const s = e.size;
          this.lit.spawn(e.x + rr(-0.2, 0.2) * s, e.y + rr(0, 0.3), e.z + rr(-0.2, 0.2) * s, {
            vx: rr(-e.spread, e.spread), vy: e.rise * rr(0.8, 1.25), vz: rr(-e.spread, e.spread), grav: 0.12, drag: 0.35,
            s0: 0.5 * s, s1: rr(2.4, 3.6) * s, life: e.life * rr(0.8, 1.2), color: e.color, color1: [Math.min(1, e.color[0] * 1.4 + 0.06), Math.min(1, e.color[1] * 1.4 + 0.06), Math.min(1, e.color[2] * 1.4 + 0.06)],
            alpha: e.alpha, frame: SPRITE.SMOKE_A + ((rnd() * 3) | 0), spin: rr(-0.4, 0.4), sky: this._sky, block: this._blk, fadeIn: 0.08, fadeOut: 0.55, grow: 0.6,
          });
        }
      } else {
        const I = e.intensity, R = e.radius;
        e.acc += dt * 40 * I * (0.6 + R);
        e.acc2 += dt * 5 * I;
        e.acc3 += dt * (e.smoke ? 6 * I : 0);
        while (e.acc >= 1) {
          e.acc -= 1;
          const a = rnd() * 6.283, d = Math.sqrt(rnd()) * R;
          this.add.spawn(e.x + Math.cos(a) * d, e.y + rr(0, 0.1), e.z + Math.sin(a) * d, {
            vx: rr(-0.2, 0.2), vy: rr(1.0, 2.2) * Math.sqrt(I), vz: rr(-0.2, 0.2), drag: 1.2,
            s0: rr(0.45, 0.75) * Math.sqrt(I) * (0.7 + R * 0.6), s1: 0.12, life: rr(0.4, 0.85), color: [1.15, 0.36, 0.06], color1: [0.55, 0.05, 0.005], alpha: 0.75,
            frame: SPRITE.FLAME_A + ((rnd() * 3) | 0), rot: rr(-0.3, 0.3), spin: rr(-1, 1), fadeIn: 0.12, fadeOut: 0.5, grow: 1,
          });
        }
        while (e.acc2 >= 1) {
          e.acc2 -= 1;
          this.add.spawn(e.x + rr(-R, R), e.y + rr(0.2, 0.6), e.z + rr(-R, R), {
            vx: rr(-0.5, 0.5), vy: rr(1.2, 3), vz: rr(-0.5, 0.5), drag: 0.8, grav: -0.3,
            s0: 0.06, life: rr(0.8, 2), color: [3, 1.1, 0.25], color1: [1.4, 0.2, 0.03], frame: SPRITE.EMBER, fadeIn: 0, fadeOut: 0.4,
          });
        }
        if (e.acc3 >= 1) this._light(e.x, e.y + 1.5, e.z);
        while (e.acc3 >= 1) {
          e.acc3 -= 1;
          this.lit.spawn(e.x + rr(-R, R) * 0.6, e.y + 0.9 + rr(0, 0.4), e.z + rr(-R, R) * 0.6, {
            vx: rr(-0.2, 0.2), vy: rr(1.2, 2), vz: rr(-0.2, 0.2), grav: 0.15, drag: 0.4,
            s0: 0.4 * (0.6 + R), s1: rr(1.8, 2.8) * (0.6 + R), life: rr(2.5, 4), color: [0.05, 0.045, 0.04], color1: [0.14, 0.135, 0.13], alpha: 0.75,
            frame: SPRITE.SMOKE_A + ((rnd() * 3) | 0), spin: rr(-0.4, 0.4), sky: this._sky, block: this._blk, fadeIn: 0.15, fadeOut: 0.5,
          });
        }
        if (e.light) { e.light.x = e.x; e.light.y = e.y + 0.8; e.light.z = e.z; e.light.radius = 7 + 4 * I * (0.5 + R); }
      }
    }
  }

  _updateLights(dt) {
    const t = this._now();
    for (let i = 0; i < this.lights.length; i++) {
      const L = this.lights[i];
      L.age += dt;
      if (L.age >= L.life) {
        this.lights[i] = this.lights[this.lights.length - 1]; this.lights.pop(); i--;
        this._lightPool.push(L);
        continue;
      }
      let k = 1;
      if (L.life !== Infinity) { const f = 1 - L.age / L.life; k = L.decay ? Math.pow(f, L.decay) : f; }
      if (L.flicker) {
        const e = L.emitter;
        const I = e ? e.intensity : 1;
        k *= I * (0.75 + 0.15 * Math.sin(t * 17 + L.x) + 0.1 * Math.sin(t * 31.7 + L.z));
      }
      L.intensity = k;
      L.r = L.base[0] * k; L.g = L.base[1] * k; L.b = L.base[2] * k;
    }
  }

  /**
   * Active dynamic lights this frame (muzzle flashes, sparks, explosions, fires): [{x,y,z, r,g,b, radius, intensity}].
   * The renderer may copy the strongest ones into globalUniforms.uPL / uPLC (see writeLightsToUniforms).
   */
  getLights() { return this.lights; }

  /**
   * Convenience: write up to `max` FX lights (closest to the camera first) into uPL/uPLC starting at slot `start`.
   * Returns the number of slots used. Only call this if the renderer does not manage those slots itself.
   */
  writeLightsToUniforms(start = 0, max = 4) {
    const G = globalUniforms;
    const c = this._camPos;
    const ls = this.lights;
    let used = 0;
    // simple selection: nearest first (lights list is small)
    const n = ls.length;
    const taken = this._taken || (this._taken = new Uint8Array(64));
    taken.fill(0);
    for (let s = 0; s < max && start + s < G.uPL.value.length; s++) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < n && i < 64; i++) {
        if (taken[i]) continue;
        const L = ls[i];
        const d = (L.x - c.x) ** 2 + (L.y - c.y) ** 2 + (L.z - c.z) ** 2 - L.radius * L.radius;
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) break;
      taken[best] = 1;
      const L = ls[best];
      G.uPL.value[start + s].set(L.x, L.y, L.z, L.radius);
      G.uPLC.value[start + s].set(L.r, L.g, L.b);
      used++;
    }
    return used;
  }

  // ------------------------------------------------------------------ frame
  update(dt, camera) {
    if (dt > 0.1) dt = 0.1;
    if (camera) camera.getWorldPosition(this._camPos);
    const w = globalUniforms.uWind ? globalUniforms.uWind.value : 0.3;
    this.wind.set(0.8 * w * 2.2, 0, 0.5 * w * 2.2);
    this._updateEmitters(dt);
    this.cubes.update(dt, this.world);
    this.lit.update(dt, this.world, this.wind);
    this.add.update(dt, this.world, this.wind);
    this.decals.update();
    this._updateLights(dt);
  }

  /** Remove every particle, decal, emitter and light. */
  clear() {
    this.cubes.clear();
    this.lit.clear();
    this.add.clear();
    this.decals.clear();
    this.decals.update();
    for (const e of this.emitters) e.alive = false;
    this.emitters.length = 0;
    for (const L of this.lights) this._lightPool.push(L);
    this.lights.length = 0;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
    for (const m of [this.cubes.mesh, this.lit.mesh, this.add.mesh, this.decals.mesh]) { m.geometry.dispose(); m.material.dispose(); }
  }
}

function parseColor(c, def) {
  if (c === undefined || c === null) return def;
  if (Array.isArray(c)) return c;
  if (typeof c === 'number') return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  if (c.isColor) return [c.r, c.g, c.b];
  return def;
}
