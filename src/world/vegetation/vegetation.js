import * as THREE from 'three';
import { heightAt, terrainInfo, hash2, gnoise, oasisDistance, WIND_X, WIND_Z, OASIS_STRETCH } from '../heightfield.js';
import { frondTexture, grassTexture, bushTexture, reedTexture } from './textures.js';
import { palmGeometry, cardClump } from './geometry.js';
import { createFoliageMaterial, createFoliageDepthMaterial } from './foliageMaterial.js';

// Streams instanced vegetation around the player:
//  - sparse dry grass tufts and twiggy shrubs, favouring interdune hollows
//  - date-palm groves and green reeds ringing each oasis lake

const CELL = 48;
const SHADOW_LAYER = 1;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

class InstancedLayer {
  constructor(geometry, material, depthMaterial, capacity, castShadow) {
    const g = new THREE.InstancedBufferGeometry();
    g.index = geometry.index;
    for (const [k, v] of Object.entries(geometry.attributes)) g.setAttribute(k, v);
    this.offsets = new Float32Array(capacity * 4);
    this.params = new Float32Array(capacity * 4);
    this.offsetAttr = new THREE.InstancedBufferAttribute(this.offsets, 4);
    this.paramAttr = new THREE.InstancedBufferAttribute(this.params, 4);
    this.offsetAttr.setUsage(THREE.DynamicDrawUsage);
    this.paramAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aOffset', this.offsetAttr);
    g.setAttribute('aParams', this.paramAttr);
    g.instanceCount = 0;
    this.geometry = g;
    this.capacity = capacity;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.userData.depthMaterial = depthMaterial;
    if (castShadow) this.mesh.layers.enable(SHADOW_LAYER);
    this.castShadow = castShadow;
    this.count = 0;
    // Instances are pushed nearest-first; dist lets shadow passes draw only a prefix.
    this.dist = new Float32Array(capacity);
  }

  begin() {
    this.count = 0;
  }

  /** Draw only instances closer than d (they are sorted by distance). */
  limit(d) {
    let n = this.count;
    if (d < Infinity) {
      let lo = 0;
      let hi = this.count;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.dist[mid] <= d) lo = mid + 1;
        else hi = mid;
      }
      n = lo;
    }
    this.geometry.instanceCount = n;
  }

  push(x, y, z, yaw, scale, tint, phase, dist = 0) {
    if (this.count >= this.capacity) return;
    this.dist[this.count] = dist;
    const o = this.count * 4;
    this.offsets[o] = x;
    this.offsets[o + 1] = y;
    this.offsets[o + 2] = z;
    this.offsets[o + 3] = yaw;
    this.params[o] = scale;
    this.params[o + 1] = tint;
    this.params[o + 2] = phase;
    this.params[o + 3] = 0;
    this.count++;
  }

  end() {
    this.geometry.instanceCount = this.count;
    for (const a of [this.offsetAttr, this.paramAttr]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, Math.max(4, this.count * 4));
      a.needsUpdate = true;
    }
    this.mesh.visible = this.count > 0;
  }
}

export class Vegetation {
  constructor(atmosphere, atlas, quality) {
    this.quality = quality;
    this.radius = quality.vegetationRadius;
    this.density = quality.vegetationDensity;
    this.group = new THREE.Group();

    const shadows = !!quality.objectShadows;
    const a2c = quality.msaa > 0;
    const frondMap = frondTexture();
    const grassMap = grassTexture();
    const reedMap = reedTexture();
    const lushMap = grassTexture({ green: true, seed: 9 });
    const bushMap = bushTexture();

    const palmMat = createFoliageMaterial(atmosphere, atlas, {
      map: frondMap,
      leafTint: [0.84, 0.88, 0.86],
      deadTint: [0.3, 0.24, 0.16],
      translucency: 0.55,
      stiffness: 1.6,
      objectShadows: shadows,
      alphaToCoverage: a2c,
    });
    const palmDepth = createFoliageDepthMaterial({ map: frondMap, stiffness: 1.6 });
    const grassMat = createFoliageMaterial(atmosphere, atlas, { map: grassMap, translucency: 0.6, objectShadows: shadows, alphaToCoverage: a2c });
    const grassDepth = createFoliageDepthMaterial({ map: grassMap });
    const reedMat = createFoliageMaterial(atmosphere, atlas, { map: reedMap, leafTint: [0.92, 0.95, 0.85], translucency: 0.9, objectShadows: shadows, alphaToCoverage: a2c });
    const reedDepth = createFoliageDepthMaterial({ map: reedMap });
    const lushMat = createFoliageMaterial(atmosphere, atlas, { map: lushMap, leafTint: [0.86, 0.84, 0.7], translucency: 0.7, objectShadows: shadows, alphaToCoverage: a2c });
    const bushMat = createFoliageMaterial(atmosphere, atlas, { map: bushMap, leafTint: [1.0, 0.98, 0.95], translucency: 0.3, stiffness: 1.8, objectShadows: shadows, alphaToCoverage: a2c });
    const bushDepth = createFoliageDepthMaterial({ map: bushMap, stiffness: 1.8 });
    this.materials = [palmMat, grassMat, reedMat, bushMat, lushMat];

    const lowPoly = quality.gridRes <= 24;
    const palmSpecs = [
      { height: 4.2, bend: 0.06, fronds: 22 },
      { height: 6.8, bend: 0.05, fronds: 24 },
      { height: 9.2, bend: 0.045, fronds: 26 },
      { height: 11.4, bend: 0.04, fronds: 28 },
      { height: 13.6, bend: 0.035, fronds: 28 },
    ];
    this.palmHeights = palmSpecs.map((p) => p.height);
    this.palms = palmSpecs.map((spec, i) => {
      const geo = palmGeometry(101 + i * 17, { ...spec, fronds: lowPoly ? spec.fronds - 6 : spec.fronds, segs: lowPoly ? 6 : 9 });
      return new InstancedLayer(geo, palmMat, palmDepth, 600, true);
    });
    // Distant palms: same crowns, far fewer segments.
    this.palmsFar = palmSpecs.map((spec, i) => {
      const geo = palmGeometry(101 + i * 17, { ...spec, fronds: spec.fronds - 8, segs: 3, tSegs: 4, radial: 5, deadSegs: 2 });
      return new InstancedLayer(geo, palmMat, palmDepth, 900, true);
    });
    this.palmLodDistance = lowPoly ? 90 : 150;
    this.grass = new InstancedLayer(cardClump(5, { cards: 3, width: 1.0, height: 0.75 }), grassMat, grassDepth, 9000, quality.vegetationDensity >= 1);
    this.reeds = new InstancedLayer(cardClump(8, { cards: 3, width: 1.5, height: 1.4, spread: 0.25 }), reedMat, reedDepth, 6000, false);
    this.lush = new InstancedLayer(cardClump(17, { cards: 3, width: 0.7, height: 0.45 }), lushMat, reedDepth, 6000, false);
    this.bushes = new InstancedLayer(cardClump(13, { cards: 4, width: 1.6, height: 1.2, spread: 0.3 }), bushMat, bushDepth, 3000, true);
    this.layers = [...this.palms, ...this.palmsFar, this.grass, this.reeds, this.bushes, this.lush];
    for (const l of this.layers) this.group.add(l.mesh);

    this.cells = new Map();
    this.oases = new Map();
    this.dirty = true;
    this.lastBuild = new THREE.Vector2(1e9, 1e9);
    this.trunks = [];
    this.stats = { palms: 0, grass: 0, bushes: 0, reeds: 0 };
  }

  _genCell(cx, cz) {
    const h = [0, 0];
    hash2(cx * 7 + 3, cz * 13 - 5, h);
    const r = rng(Math.floor(h[0] * 4294967296));
    const out = { grass: [], bushes: [] };
    const n = Math.round(9 * this.density);
    for (let i = 0; i < n; i++) {
      const x = (cx + r()) * CELL;
      const z = (cz + r()) * CELL;
      const y = heightAt(x, z);
      if (terrainInfo.oasisMask > 0.15 || terrainInfo.lee > 0.15) continue;
      const gx = heightAt(x + 0.6, z) - y;
      const gz = heightAt(x, z + 0.6) - y;
      if (Math.hypot(gx, gz) / 0.6 > 0.32) continue;
      // Plants hold on in hollows between dunes, where moisture and finer soil collect.
      const mean = 0.25 * (heightAt(x + 22, z) + heightAt(x - 22, z) + heightAt(x, z + 22) + heightAt(x, z - 22));
      const p = 0.05 + 0.75 * smoothstep(-1, 3.5, mean - y);
      if (r() > p) continue;
      if (r() < 0.86) {
        const k = 1 + Math.floor(r() * 3);
        for (let j = 0; j < k; j++) {
          const gx2 = x + (r() - 0.5) * 2.4 * (j > 0 ? 1 : 0);
          const gz2 = z + (r() - 0.5) * 2.4 * (j > 0 ? 1 : 0);
          out.grass.push([gx2, heightAt(gx2, gz2) - 0.04, gz2, r() * 6.283, 0.55 + 0.75 * r(), r(), r()]);
        }
      } else {
        out.bushes.push([x, y - 0.06, z, r() * 6.283, 0.7 + 0.8 * r(), r(), r()]);
      }
    }
    return out;
  }

  _genOasis(o) {
    const r = rng(((o.cx * 92821) ^ (o.cz * 68917)) >>> 0);
    const palms = [];
    const reeds = [];
    const R = o.radius;
    const px = WIND_Z;
    const pz = -WIND_X;
    const target = 60 + Math.round(R * 0.9);
    for (let i = 0; i < 2600 && palms.length < target; i++) {
      // Uniform sample in the bounding ellipse, then keep the vegetated ring.
      const a = r() * Math.PI * 2;
      const s = Math.sqrt(r()) * 2.1 * R;
      const ea = Math.cos(a) * s * OASIS_STRETCH;
      const eb = Math.sin(a) * s;
      const x = o.x + px * ea + WIND_X * eb;
      const z = o.z + pz * ea + WIND_Z * eb;
      const k = oasisDistance(o, x, z);
      const grove = 0.5 + 0.5 * Math.sin(gnoise(x / 38 + 3.3, z / 38 - 1.7) * 7);
      const dens = smoothstep(0.7, 0.88, k) * (1 - smoothstep(1.3, 2.0, k)) * (0.25 + 0.75 * grove);
      if (r() > dens) continue;
      const y = heightAt(x, z);
      if (y < o.waterLevel + 0.3) continue;
      let ok = true;
      for (const p of palms) {
        if ((p[0] - x) ** 2 + (p[2] - z) ** 2 < 12) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      // Taller palms further from the water; young ones near the shore.
      const variant = Math.min(4, Math.max(0, Math.floor(r() * 3 + (k - 0.8) * 2.2)));
      palms.push([x, y - 0.1, z, r() * 6.283, 0.85 + 0.3 * r(), r(), r(), variant]);
    }
    // Reed beds hug the waterline in clumps.
    const lush = [];
    for (let i = 0; i < 3000 && reeds.length < 140 + R * 1.5; i++) {
      const a = r() * Math.PI * 2;
      const s = (0.4 + 0.9 * r()) * R;
      const x = o.x + px * Math.cos(a) * s * OASIS_STRETCH + WIND_X * Math.sin(a) * s;
      const z = o.z + pz * Math.cos(a) * s * OASIS_STRETCH + WIND_Z * Math.sin(a) * s;
      const y = heightAt(x, z);
      const above = y - o.waterLevel;
      if (above < -0.3 || above > 0.45) continue;
      if (gnoise(x / 9 + 1.7, z / 9 - 4.1) < -0.05) continue;
      reeds.push([x, y - 0.05, z, r() * 6.283, 0.6 + 0.7 * r(), r(), r()]);
    }
    // Low green grass on the damp rim under the palms.
    for (let i = 0; i < 3000 && lush.length < 120 + R; i++) {
      const a = r() * Math.PI * 2;
      const s = (0.7 + 0.9 * r()) * R;
      const x = o.x + px * Math.cos(a) * s * OASIS_STRETCH + WIND_X * Math.sin(a) * s;
      const z = o.z + pz * Math.cos(a) * s * OASIS_STRETCH + WIND_Z * Math.sin(a) * s;
      const k = oasisDistance(o, x, z);
      if (k < 0.75 || k > 1.45) continue;
      const y = heightAt(x, z);
      if (y < o.waterLevel + 0.15) continue;
      lush.push([x, y - 0.03, z, r() * 6.283, 0.6 + 0.8 * r(), r(), r()]);
    }
    // Some dry grass and shrubs on the outer rim.
    const rim = [];
    for (let i = 0; i < 120; i++) {
      const a = r() * Math.PI * 2;
      const s = (1.3 + 0.8 * r()) * R;
      const x = o.x + px * Math.cos(a) * s * OASIS_STRETCH + WIND_X * Math.sin(a) * s;
      const z = o.z + pz * Math.cos(a) * s * OASIS_STRETCH + WIND_Z * Math.sin(a) * s;
      rim.push([x, heightAt(x, z) - 0.05, z, r() * 6.283, 0.6 + 0.6 * r(), r(), r()]);
    }
    return { palms, reeds, rim, lush };
  }

  /** activeOases: oases within range (from the oasis manager). */
  update(center, activeOases, budgetCells = 3) {
    const R = this.radius;
    const cx0 = Math.floor((center.x - R) / CELL);
    const cx1 = Math.floor((center.x + R) / CELL);
    const cz0 = Math.floor((center.z - R) / CELL);
    const cz1 = Math.floor((center.z + R) / CELL);
    let generated = 0;
    const wanted = new Set();
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const dx = (cx + 0.5) * CELL - center.x;
        const dz = (cz + 0.5) * CELL - center.z;
        if (dx * dx + dz * dz > (R + CELL) * (R + CELL)) continue;
        const key = cx * 65536 + cz;
        wanted.add(key);
        if (!this.cells.has(key) && generated < budgetCells) {
          this.cells.set(key, this._genCell(cx, cz));
          generated++;
          this.dirty = true;
        }
      }
    }
    for (const key of this.cells.keys()) {
      if (!wanted.has(key)) {
        this.cells.delete(key);
        this.dirty = true;
      }
    }
    const oasisKeys = new Set();
    for (const o of activeOases) {
      const key = `${o.cx},${o.cz}`;
      oasisKeys.add(key);
      if (!this.oases.has(key)) {
        this.oases.set(key, { o, data: this._genOasis(o) });
        this.dirty = true;
      }
    }
    for (const key of this.oases.keys()) {
      if (!oasisKeys.has(key)) {
        this.oases.delete(key);
        this.dirty = true;
      }
    }

    // Trunk colliders near the player.
    this.trunks.length = 0;
    for (const { data } of this.oases.values()) {
      for (const p of data.palms) {
        if (Math.abs(p[0] - center.x) < 30 && Math.abs(p[2] - center.z) < 30) this.trunks.push({ x: p[0], z: p[2], r: 0.28 * p[4] });
      }
    }

    // Re-sort nearest-first every so often so LODs and shadow ranges stay right.
    if (Math.hypot(center.x - this.lastBuild.x, center.z - this.lastBuild.y) > 18) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;
    this.lastBuild.set(center.x, center.z);
    const cx = center.x;
    const cz = center.z;
    const sorted = (items) => {
      const out = items.map((it) => [Math.hypot(it[0] - cx, it[2] - cz), it]);
      out.sort((a, b) => a[0] - b[0]);
      return out;
    };
    const grass = [];
    const bushes = [];
    const palms = [];
    const reeds = [];
    const lush = [];
    for (const cell of this.cells.values()) {
      grass.push(...cell.grass);
      bushes.push(...cell.bushes);
    }
    for (const { data } of this.oases.values()) {
      palms.push(...data.palms);
      reeds.push(...data.reeds);
      grass.push(...data.rim);
      lush.push(...data.lush);
    }
    for (const l of this.layers) l.begin();
    for (const [d, g] of sorted(grass)) this.grass.push(g[0], g[1], g[2], g[3], g[4], g[5], g[6], d);
    for (const [d, g] of sorted(bushes)) this.bushes.push(g[0], g[1], g[2], g[3], g[4], g[5], g[6], d);
    for (const [d, g] of sorted(reeds)) this.reeds.push(g[0], g[1], g[2], g[3], g[4], g[5], g[6], d);
    for (const [d, g] of sorted(lush)) this.lush.push(g[0], g[1], g[2], g[3], g[4], g[5], g[6], d);
    for (const [d, p] of sorted(palms)) {
      const layer = d < this.palmLodDistance ? this.palms[p[7]] : this.palmsFar[p[7]];
      layer.push(p[0], p[1], p[2], p[3], p[4], p[5], p[6], d);
    }
    for (const l of this.layers) l.end();
    this.stats.palms = this.palms.reduce((s, l) => s + l.count, 0) + this.palmsFar.reduce((s, l) => s + l.count, 0);
    this.stats.grass = this.grass.count;
    this.stats.bushes = this.bushes.count;
    this.stats.reeds = this.reeds.count;
  }

  /** Meshes that cast object shadows. */
  casters() {
    return this.layers.filter((l) => l.castShadow).map((l) => l.mesh);
  }

  /**
   * Restrict shadow casters to those that can reach a cascade. range = Infinity
   * restores normal drawing. Small plants only matter in the nearest cascade.
   */
  setShadowRange(range, smallRange = range) {
    for (const l of this.layers) {
      if (!l.castShadow) continue;
      const small = l === this.grass || l === this.bushes;
      l.limit(small ? smallRange : range);
    }
  }
}

export { SHADOW_LAYER };
