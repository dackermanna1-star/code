import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TextureBaker } from '../render/TextureBaker';
import { Noise, Rng } from '../core/math';
import * as F from './FoodSurfaces';
import { createPattyMaterial, PattyUniforms } from './PattyMaterial';
import { BunId, IngredientId, INGREDIENTS, PattyId, SauceId } from './Ingredients';
import { canvasTexture } from '../render/CanvasTex';

export const BUN_R = 0.07;
export const PATTY_R = 0.072;
const PATTY_HALF = 0.0085;
const noise = new Noise(4242);

export interface FoodPiece {
  id: IngredientId;
  obj: THREE.Group;
  /** height added to the stack (m) */
  thickness: number;
  radius: number;
  /** patties */
  cook?: { top: number; bottom: number };
  setCook?(top: number, bottom: number): void;
  setSizzle?(s: number): void;
  setHighlight?(h: number): void;
  /** cheese */
  setMelt?(melt: number, supportR: number): void;
  /** sauces 0..1 */
  setGrow?(t: number): void;
  dispose(): void;
}

interface BunLook {
  crust: THREE.MeshPhysicalMaterial;
  heelCrust: THREE.MeshPhysicalMaterial;
  crumb: THREE.MeshStandardMaterial;
  seeds?: THREE.BufferGeometry;
  seedMat?: THREE.Material;
  salt?: boolean;
}

function radialWarp(theta: number, seed: number): number {
  return 1 + 0.022 * noise.noise2(Math.cos(theta) * 1.2 + seed, Math.sin(theta) * 1.2) + 0.008 * noise.noise2(Math.cos(theta) * 4 + seed, Math.sin(theta) * 4 + 3);
}

/** Factory for every ingredient model. Geometry & base materials are shared. */
export class FoodKit {
  private geo = new Map<string, THREE.BufferGeometry>();
  private mats = new Map<string, THREE.Material>();
  private buns = new Map<BunId, BunLook>();
  private pattyLooks: Record<PattyId, Parameters<typeof createPattyMaterial>[0]>;

  constructor(private baker: TextureBaker) {
    const beefTint = { a: 0xa8323f, b: 0xd9616b, fat: 0xf4d2cb };
    const beefCooked = { a: 0x5e2c14, b: 0x8e4c24, fat: 0xb8763c };
    this.pattyLooks = {
      patty_beef: {
        raw: baker.bake(F.groundMeat('beef', 0, beefTint)),
        cooked: baker.bake(F.groundMeat('beef', 1, beefCooked)),
        char: baker.bake(F.groundMeat('beef', 2, beefCooked)),
        cookedTint: new THREE.Color(1, 1, 1),
        marks: 1,
        rawSheen: 1,
      },
      patty_chicken: {
        raw: baker.bake(F.breaded('chickenRaw', 0xe8cf9a, 0xf2dcb0)),
        cooked: baker.bake(F.breaded('chickenCooked', 0xc97a26, 0xe8a845)),
        char: baker.bake(F.groundMeat('beef', 2, beefCooked)),
        cookedTint: new THREE.Color(1, 1, 1),
        marks: 0.55,
        rawSheen: 0.5,
      },
      patty_veggie: {
        raw: baker.bake(F.veggieMash),
        cooked: baker.bake(F.groundMeat('veg', 1, { a: 0x5a4a22, b: 0x7a6a30, fat: 0x9a8a40 })),
        char: baker.bake(F.groundMeat('beef', 2, beefCooked)),
        cookedTint: new THREE.Color(1.05, 1.0, 0.85),
        marks: 0.9,
        rawSheen: 0.6,
      },
    };
    this.buildBuns();
  }

  private g(key: string, make: () => THREE.BufferGeometry) {
    let v = this.geo.get(key);
    if (!v) {
      v = make();
      this.geo.set(key, v);
    }
    return v;
  }
  private m<T extends THREE.Material>(key: string, make: () => T): T {
    let v = this.mats.get(key) as T | undefined;
    if (!v) {
      v = make();
      this.mats.set(key, v);
    }
    return v;
  }

  // ------------------------------------------------------------------ buns
  private crownProfile(): THREE.Vector2[] {
    const R = BUN_R;
    const pts: [number, number][] = [
      [R * 0.962, 0],
      [R * 0.993, 0.004],
      [R, 0.009],
      [R * 0.993, 0.015],
      [R * 0.962, 0.023],
      [R * 0.91, 0.031],
      [R * 0.83, 0.038],
      [R * 0.72, 0.0445],
      [R * 0.58, 0.049],
      [R * 0.42, 0.052],
      [R * 0.24, 0.0538],
      [R * 0.1, 0.0545],
      [0, 0.0547],
    ];
    return pts.map(([x, y]) => new THREE.Vector2(x, y));
  }

  private warpGeometry(g: THREE.BufferGeometry, seed: number, yAmp = 0.05) {
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const th = Math.atan2(z, x);
      const k = radialWarp(th, seed);
      const r = Math.hypot(x, z);
      const fade = Math.min(1, r / (BUN_R * 0.45));
      const yk = 1 + yAmp * fade * noise.noise2(Math.cos(th) * 0.9 + seed * 3, Math.sin(th) * 0.9);
      p.setXYZ(i, x * k, y * yk, z * k);
    }
    g.computeVertexNormals();
  }

  private buildBuns() {
    const crownGeo = this.g('crown', () => {
      const g = new THREE.LatheGeometry(this.crownProfile(), 64);
      this.warpGeometry(g, 1.7);
      return g;
    });
    const cutGeo = this.g('crownCut', () => {
      const g = new THREE.CircleGeometry(BUN_R * 0.962, 64);
      g.rotateX(Math.PI / 2); // face down
      this.warpGeometry(g, 1.7, 0);
      return g;
    });
    void crownGeo;
    void cutGeo;
    this.g('heel', () => {
      const R = BUN_R;
      const pts: [number, number][] = [
        [0, 0],
        [R * 0.7, 0],
        [R * 0.88, 0.0015],
        [R * 0.96, 0.005],
        [R * 0.995, 0.011],
        [R, 0.017],
        [R * 0.99, 0.023],
        [R * 0.968, 0.028],
      ];
      const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 64);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      this.warpGeometry(g, 5.3, 0.03);
      return g;
    });
    this.g('heelCut', () => {
      const g = new THREE.CircleGeometry(BUN_R * 0.968, 64);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0.028, 0);
      this.warpGeometry(g, 5.3, 0);
      return g;
    });

    const seedGeo = (count: number, seed: string, big = false) => {
      const rng = new Rng(seed);
      const prof = this.crownProfile();
      const base = new THREE.SphereGeometry(1, 7, 5);
      const parts: THREE.BufferGeometry[] = [];
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < count; i++) {
        const t = rng.range(0.42, 0.99);
        const fi = t * (prof.length - 1);
        const i0 = Math.floor(fi);
        const i1 = Math.min(prof.length - 1, i0 + 1);
        const f = fi - i0;
        const r = prof[i0].x + (prof[i1].x - prof[i0].x) * f;
        const y = prof[i0].y + (prof[i1].y - prof[i0].y) * f;
        const th = rng.range(0, Math.PI * 2);
        const k = radialWarp(th, 1.7);
        const pos = new THREE.Vector3(Math.cos(th) * r * k, y + 0.0006, Math.sin(th) * r * k);
        // approximate surface normal from profile tangent
        const tx = prof[i1].x - prof[i0].x;
        const ty = prof[i1].y - prof[i0].y;
        const nrm = new THREE.Vector3(Math.cos(th) * ty, -tx, Math.sin(th) * ty).normalize();
        if (nrm.y < 0) nrm.negate();
        q.setFromUnitVectors(up, nrm);
        const spin = new THREE.Quaternion().setFromAxisAngle(nrm, rng.range(0, Math.PI));
        q.premultiply(spin);
        const s = big ? rng.range(0.0022, 0.003) : 1;
        m.compose(pos, q, big ? new THREE.Vector3(s, s * 0.8, s) : new THREE.Vector3(0.0043, 0.0015, 0.0024));
        const g = base.clone().applyMatrix4(m);
        parts.push(g);
      }
      return mergeGeometries(parts)!;
    };

    const make = (id: BunId, top: number, mid: number, rim: number, crumb: number, toast: number, params: { clearcoat: number; rough: number; seeds?: 'white' | 'salt' | 'none'; slash?: boolean; sheen?: number }) => {
      const crustS = this.baker.bake(F.bunCrust(id, top, mid, rim, { slash: params.slash }));
      const crust = new THREE.MeshPhysicalMaterial({
        map: crustS.map,
        normalMap: crustS.normalMap ?? null,
        roughnessMap: crustS.ormMap ?? null,
        roughness: params.rough,
        clearcoat: params.clearcoat,
        clearcoatRoughness: 0.3,
        sheen: params.sheen ?? 0.35,
        sheenColor: new THREE.Color(0xffd9a0),
        sheenRoughness: 0.5,
      });
      const heelCrust = crust.clone();
      heelCrust.clearcoat = params.clearcoat * 0.3;
      const crumbS = this.baker.bake(F.bunCrumb(id, crumb, toast));
      const crumbMat = new THREE.MeshStandardMaterial({ map: crumbS.map, normalMap: crumbS.normalMap ?? null, roughness: 0.9 });
      const look: BunLook = { crust, heelCrust, crumb: crumbMat };
      if (params.seeds === 'white') {
        look.seeds = seedGeo(46, id);
        look.seedMat = this.m('seedMat', () => new THREE.MeshPhysicalMaterial({ color: 0xf6e7c4, roughness: 0.45, clearcoat: 0.4 }));
      } else if (params.seeds === 'salt') {
        look.seeds = seedGeo(30, id, true);
        look.seedMat = this.m('saltMat', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, transmission: 0, clearcoat: 1, flatShading: true }));
      }
      this.buns.set(id, look);
    };
    make('bun_sesame', 0xb5642a, 0xdb9644, 0xf2d192, 0xf3e3c4, 0xd9a55f, { clearcoat: 0.45, rough: 0.5, seeds: 'white' });
    make('bun_brioche', 0x7e3610, 0xb05a1c, 0xe3a45a, 0xf6dfae, 0xd99a4f, { clearcoat: 0.9, rough: 0.35, seeds: 'none', sheen: 0.5 });
    make('bun_pretzel', 0x3f1c0c, 0x5e2d12, 0x9a5a2c, 0xe8d3a8, 0xb07a44, { clearcoat: 0.8, rough: 0.35, seeds: 'salt', slash: true });
    make('bun_charcoal', 0x1a191b, 0x222124, 0x2e2c31, 0x3a3940, 0x2a2a2e, { clearcoat: 0.55, rough: 0.45, seeds: 'white', sheen: 0.2 });
  }

  bunPart(id: BunId, part: 'top' | 'bottom'): FoodPiece {
    const look = this.buns.get(id)!;
    const obj = new THREE.Group();
    obj.name = `${id}_${part}`;
    if (part === 'top') {
      const crust = new THREE.Mesh(this.geo.get('crown')!, look.crust);
      const cut = new THREE.Mesh(this.geo.get('crownCut')!, look.crumb);
      obj.add(crust, cut);
      if (look.seeds) obj.add(new THREE.Mesh(look.seeds, look.seedMat!));
    } else {
      obj.add(new THREE.Mesh(this.geo.get('heel')!, look.heelCrust), new THREE.Mesh(this.geo.get('heelCut')!, look.crumb));
    }
    shadowAll(obj);
    return { id, obj, thickness: part === 'top' ? 0.054 : 0.028, radius: BUN_R, dispose: () => {} };
  }

  // ------------------------------------------------------------------ patties
  private pattyGeo(kind: PattyId): THREE.BufferGeometry {
    return this.g('patty_' + kind, () => {
      const R = kind === 'patty_chicken' ? 0.07 : PATTY_R;
      const h = kind === 'patty_chicken' ? 0.0095 : PATTY_HALF;
      const prof: [number, number][] = [
        [0, -h],
        [R * 0.55, -h],
        [R * 0.82, -h * 0.98],
        [R * 0.93, -h * 0.88],
        [R * 0.985, -h * 0.6],
        [R, -h * 0.2],
        [R, h * 0.2],
        [R * 0.985, h * 0.6],
        [R * 0.93, h * 0.88],
        [R * 0.82, h * 0.98],
        [R * 0.55, h],
        [0, h],
      ];
      const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 56);
      const p = g.attributes.position as THREE.BufferAttribute;
      const seed = kind === 'patty_chicken' ? 9.1 : kind === 'patty_veggie' ? 5.5 : 2.3;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i);
        let y = p.getY(i);
        let z = p.getZ(i);
        const r = Math.hypot(x, z);
        const th = Math.atan2(z, x);
        const edge = r / R;
        const k = 1 + 0.045 * noise.noise2(Math.cos(th) * 1.4 + seed, Math.sin(th) * 1.4) + 0.015 * noise.noise2(Math.cos(th) * 5 + seed, Math.sin(th) * 5);
        x *= k;
        z *= k;
        if (kind === 'patty_chicken') {
          x *= 1.14;
          z *= 0.88;
        }
        const bump = noise.fbm2(x * 70 + seed, z * 70, 3) * 0.0016 + noise.noise2(x * 260, z * 260) * 0.0004;
        y += Math.sign(y) * bump * Math.min(1, (1 - edge) * 4 + 0.3);
        // slight dome
        y += (1 - edge * edge) * 0.0012 * Math.sign(y);
        p.setXYZ(i, x, y, z);
      }
      g.computeVertexNormals();
      // custom UVs: planar on faces, cylindrical on the rim
      const n = g.attributes.normal as THREE.BufferAttribute;
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const S = 12;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        if (Math.abs(n.getY(i)) > 0.6) uv.setXY(i, x * S + 0.5, z * S + 0.5);
        else uv.setXY(i, Math.atan2(z, x) * R * S, y * S);
      }
      return g;
    });
  }

  patty(kind: PattyId): FoodPiece {
    const look = this.pattyLooks[kind];
    const mat = createPattyMaterial(look, kind === 'patty_chicken' ? 0.0095 : PATTY_HALF);
    const mesh = new THREE.Mesh(this.pattyGeo(kind), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const obj = new THREE.Group();
    obj.name = kind;
    obj.add(mesh);
    const u = mat.userData.uniforms as PattyUniforms;
    const piece: FoodPiece = {
      id: kind,
      obj,
      thickness: INGREDIENTS[kind].thickness,
      radius: PATTY_R,
      cook: { top: 0, bottom: 0 },
      setCook(top, bottom) {
        piece.cook!.top = top;
        piece.cook!.bottom = bottom;
        u.uCookTop.value = top;
        u.uCookBottom.value = bottom;
        // shrink & plump as it cooks
        const c = Math.min(1.2, (top + bottom) * 0.5);
        const s = 1 - 0.1 * Math.min(1, c * 1.2);
        mesh.scale.set(s, 1 + 0.22 * Math.min(1, c * 1.3), s);
      },
      setSizzle(s) {
        u.uSizzle.value = s;
      },
      setHighlight(h) {
        u.uHighlight.value = h;
      },
      dispose() {
        mat.dispose();
      },
    };
    return piece;
  }

  // ------------------------------------------------------------------ cheese
  cheese(id: IngredientId): FoodPiece {
    const colors: Record<string, number> = {
      cheese_american: 0xf59a12,
      cheese_swiss: 0xf3e2a0,
      cheese_cheddar: 0xe9861a,
      cheese_pepperjack: 0xf4ecd2,
    };
    const geo = this.g('cheese', () => {
      const g = new THREE.BoxGeometry(0.13, 0.0026, 0.13, 36, 1, 36);
      // round the slice corners a little
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        const m = Math.max(Math.abs(x), Math.abs(z));
        const r = Math.hypot(x, z);
        if (r > 1e-5) {
          const k = THREE.MathUtils.lerp(1, m / r, 0.22);
          p.setX(i, x * k);
          p.setZ(i, z * k);
        }
      }
      g.computeVertexNormals();
      return g;
    });
    const uniforms = { uMelt: { value: 0 }, uSupport: { value: 0.06 } };
    const alpha = id === 'cheese_swiss' ? this.swissHoles() : id === 'cheese_pepperjack' ? null : null;
    const specks = id === 'cheese_pepperjack' ? this.pepperSpecks() : null;
    const mat = new THREE.MeshPhysicalMaterial({
      color: colors[id],
      roughness: 0.38,
      clearcoat: 0.55,
      clearcoatRoughness: 0.25,
      sheen: 0.6,
      sheenColor: new THREE.Color(colors[id]).offsetHSL(0, 0, 0.15),
      sheenRoughness: 0.4,
      alphaMap: alpha,
      alphaTest: alpha ? 0.5 : 0,
      map: specks,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(colors[id]).multiplyScalar(0.06),
    });
    mat.customProgramCacheKey = () => 'cheese-v1' + (alpha ? 'a' : '') + (specks ? 's' : '');
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uMelt;\nuniform float uSupport;`)
        .replace(
          '#include <beginnormal_vertex>',
          `vec3 objectNormal = vec3( normal );
          {
            float d = length(position.xz);
            float over = max(0.0, d - uSupport);
            float slope = uMelt * (over * 2.0 * 30.0 + 0.45) * step(uSupport, d);
            vec2 dir = d > 1e-5 ? position.xz / d : vec2(0.0);
            if (abs(normal.y) > 0.5) objectNormal = normalize(vec3(dir.x * slope, 1.0, dir.y * slope)) * sign(normal.y);
          }
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3( tangent.xyz );
          #endif`,
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3( position );
          {
            float d = length(position.xz);
            float over = max(0.0, d - uSupport);
            transformed.y -= uMelt * (over * over * 30.0 + over * 0.45);
            transformed.xz *= 1.0 - uMelt * 0.12 * smoothstep(uSupport - 0.01, uSupport + 0.05, d);
            transformed.y += sin(position.x * 90.0) * sin(position.z * 70.0) * 0.0006 * uMelt;
          }`,
        );
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = Math.PI / 4 + (Math.random() - 0.5) * 0.3;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const obj = new THREE.Group();
    obj.add(mesh);
    return {
      id,
      obj,
      thickness: INGREDIENTS[id].thickness,
      radius: 0.07,
      setMelt(m, s) {
        uniforms.uMelt.value = m;
        uniforms.uSupport.value = s;
      },
      dispose() {
        mat.dispose();
      },
    };
  }

  private swissHoles(): THREE.Texture {
    const key = 'swissHoles';
    const cached = this.mats.get(key) as unknown as THREE.Texture;
    if (cached) return cached;
    const t = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#000';
      const r = new Rng('swiss');
      for (let i = 0; i < 11; i++) {
        ctx.beginPath();
        ctx.ellipse(r.range(20, w - 20), r.range(20, h - 20), r.range(7, 16), r.range(7, 15), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }, { srgb: false });
    this.mats.set(key, t as unknown as THREE.Material);
    return t;
  }

  private pepperSpecks(): THREE.Texture {
    const key = 'pepperSpecks';
    const cached = this.mats.get(key) as unknown as THREE.Texture;
    if (cached) return cached;
    const t = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      const r = new Rng('pj');
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = r.chance(0.5) ? '#c0392b' : '#3d8b37';
        ctx.beginPath();
        ctx.ellipse(r.range(0, w), r.range(0, h), r.range(1.5, 3.5), r.range(1, 2.5), r.range(0, 3), 0, Math.PI * 2);
        ctx.fill();
      }
    });
    this.mats.set(key, t as unknown as THREE.Material);
    return t;
  }

  // ------------------------------------------------------------------ toppings
  private leafGeo(seed: number, R: number): THREE.BufferGeometry {
    return this.g('leaf' + seed + R, () => {
      const rings = 14;
      const segs = 96;
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        for (let j = 0; j <= segs; j++) {
          const th = (j / segs) * Math.PI * 2;
          const rmax = R * (1 + 0.08 * Math.sin(th * 5 + seed) + 0.06 * noise.noise2(Math.cos(th) * 2 + seed, Math.sin(th) * 2) + 0.025 * Math.sin(th * 23 + seed));
          const r = t * rmax;
          const x = Math.cos(th) * r;
          const z = Math.sin(th) * r;
          const ruffle = t * t * 0.0085 * Math.sin(th * 9 + seed * 2 + noise.noise2(Math.cos(th) * 2, Math.sin(th) * 2 + seed) * 2.0) + t * t * t * 0.0035 * Math.sin(th * 21 + seed);
          const dome = (1 - t * t) * 0.003 - t * t * 0.002;
          const y = ruffle + dome;
          pos.push(x, y, z);
          uv.push(x / (R * 2.4) + 0.5, z / (R * 2.4) + 0.5);
        }
      }
      for (let i = 0; i < rings; i++)
        for (let j = 0; j < segs; j++) {
          const a = i * (segs + 1) + j;
          const b = a + segs + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    });
  }

  private makeGroup(id: IngredientId, meshes: THREE.Object3D[], radius: number): FoodPiece {
    const obj = new THREE.Group();
    obj.name = id;
    for (const m of meshes) obj.add(m);
    shadowAll(obj);
    return { id, obj, thickness: INGREDIENTS[id].thickness, radius, dispose: () => {} };
  }

  topping(id: IngredientId): FoodPiece {
    const rng = new Rng(Math.floor(Math.random() * 1e9));
    switch (id) {
      case 'lettuce': {
        const s = this.baker.bake(F.lettuceLeaf);
        const mat = this.m('lettuceMat', () =>
          new THREE.MeshPhysicalMaterial({
            map: s.map,
            normalMap: s.normalMap ?? null,
            roughness: 0.45,
            side: THREE.DoubleSide,
            sheen: 0.5,
            sheenColor: new THREE.Color(0xd8ffa0),
            clearcoat: 0.3,
            clearcoatRoughness: 0.3,
            emissive: new THREE.Color(0x173d08),
          }),
        );
        const a = new THREE.Mesh(this.leafGeo(1, 0.078), mat);
        const b = new THREE.Mesh(this.leafGeo(2, 0.07), mat);
        a.rotation.y = rng.range(0, Math.PI * 2);
        b.rotation.y = rng.range(0, Math.PI * 2);
        b.position.set(rng.range(-0.008, 0.008), 0.004, rng.range(-0.008, 0.008));
        return this.makeGroup(id, [a, b], 0.08);
      }
      case 'tomato': {
        const s = this.baker.bake(F.tomatoSlice);
        const face = this.m('tomatoFace', () =>
          new THREE.MeshPhysicalMaterial({ map: s.map, normalMap: s.normalMap ?? null, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.3, sheenColor: new THREE.Color(0xffb0a0) }),
        );
        const skin = this.m('tomatoSkin', () => new THREE.MeshPhysicalMaterial({ color: 0xc8230f, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }));
        const geo = this.g('tomatoSlice', () => new THREE.CylinderGeometry(0.041, 0.041, 0.007, 40, 1));
        const meshes = [-1, 1].map((sgn) => {
          const m = new THREE.Mesh(geo, [skin, face, face]);
          m.position.set(sgn * 0.022, 0.0035, rng.range(-0.006, 0.006));
          m.rotation.y = rng.range(0, Math.PI);
          m.rotation.z = sgn * 0.03;
          return m;
        });
        meshes[1].position.y += 0.002;
        return this.makeGroup(id, meshes, 0.065);
      }
      case 'onion': {
        const white = this.m('onionWhite', () => new THREE.MeshPhysicalMaterial({ color: 0xf2e4ef, roughness: 0.28, clearcoat: 0.7, sheen: 0.6, sheenColor: new THREE.Color(0xffffff), transparent: true, opacity: 0.93 }));
        const purple = this.m('onionPurple', () => new THREE.MeshPhysicalMaterial({ color: 0xa44b8f, roughness: 0.3, clearcoat: 0.7 }));
        const meshes: THREE.Object3D[] = [];
        for (const [cx, cz] of [[-0.02, -0.012], [0.024, 0.014]]) {
          const radii = [0.034, 0.027, 0.02, 0.013];
          radii.forEach((r, i) => {
            const geo = this.g('onionRing' + r, () => new THREE.TorusGeometry(r, 0.0028, 6, 40));
            const m = new THREE.Mesh(geo, i === 0 ? purple : white);
            m.rotation.x = Math.PI / 2;
            m.scale.set(1.05, 1, 0.55);
            m.position.set(cx + rng.range(-0.002, 0.002), 0.0022, cz + rng.range(-0.002, 0.002));
            meshes.push(m);
          });
        }
        return this.makeGroup(id, meshes, 0.06);
      }
      case 'pickles': {
        const s = this.baker.bake(F.pickleSlice);
        const face = this.m('pickleFace', () => new THREE.MeshPhysicalMaterial({ map: s.map, normalMap: s.normalMap ?? null, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 }));
        const skin = this.m('pickleSkin', () => new THREE.MeshPhysicalMaterial({ color: 0x3f5f1a, roughness: 0.3, clearcoat: 1 }));
        const geo = this.g('pickleChip', () => {
          const g = new THREE.CylinderGeometry(0.019, 0.019, 0.004, 48, 1);
          const p = g.attributes.position as THREE.BufferAttribute;
          for (let i = 0; i < p.count; i++) {
            const x = p.getX(i);
            const z = p.getZ(i);
            const r = Math.hypot(x, z);
            if (r < 1e-5) continue;
            const th = Math.atan2(z, x);
            const k = 1 + 0.07 * Math.sin(th * 16);
            p.setX(i, x * k);
            p.setZ(i, z * k);
            p.setY(i, p.getY(i) + Math.sin(th * 16) * 0.0005);
          }
          g.computeVertexNormals();
          return g;
        });
        const meshes: THREE.Object3D[] = [];
        const n = 5;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
          const r = i === n - 1 ? 0 : 0.034;
          const m = new THREE.Mesh(geo, [skin, face, face]);
          m.position.set(Math.cos(a) * r, 0.0025 + i * 0.0004, Math.sin(a) * r);
          m.rotation.set(rng.range(-0.08, 0.08), rng.range(0, 6), rng.range(-0.08, 0.08));
          meshes.push(m);
        }
        return this.makeGroup(id, meshes, 0.055);
      }
      case 'bacon': {
        const s = this.baker.bake(F.baconStrip);
        const mat = this.m('baconMat', () => new THREE.MeshPhysicalMaterial({ map: s.map, normalMap: s.normalMap ?? null, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3, side: THREE.DoubleSide }));
        const make = (phase: number) =>
          this.g('bacon' + phase, () => {
            const g = new THREE.BoxGeometry(0.155, 0.0028, 0.03, 60, 1, 4);
            const p = g.attributes.position as THREE.BufferAttribute;
            for (let i = 0; i < p.count; i++) {
              const x = p.getX(i);
              const z = p.getZ(i);
              p.setY(i, p.getY(i) + Math.sin(x * 75 + phase) * 0.0038 + Math.sin(x * 23 + z * 40 + phase) * 0.0012);
              p.setZ(i, z * (1 + 0.12 * Math.sin(x * 40 + phase)));
            }
            g.computeVertexNormals();
            return g;
          });
        const a = new THREE.Mesh(make(0.4), mat);
        const b = new THREE.Mesh(make(2.1), mat);
        a.position.set(0, 0.004, -0.016);
        a.rotation.y = 0.35 + rng.range(-0.1, 0.1);
        b.position.set(0, 0.0065, 0.016);
        b.rotation.y = -0.3 + rng.range(-0.1, 0.1);
        return this.makeGroup(id, [a, b], 0.078);
      }
      case 'jalapenos': {
        const green = this.m('jalaGreen', () => new THREE.MeshPhysicalMaterial({ color: 0x2f8a2a, roughness: 0.2, clearcoat: 1 }));
        const flesh = this.m('jalaFlesh', () => new THREE.MeshPhysicalMaterial({ color: 0xc9dc8a, roughness: 0.35, clearcoat: 0.6, side: THREE.DoubleSide }));
        const seedM = this.m('jalaSeed', () => new THREE.MeshStandardMaterial({ color: 0xf2ecc8, roughness: 0.5 }));
        const ring = this.g('jalaRing', () => new THREE.TorusGeometry(0.0115, 0.0032, 6, 24));
        const disc = this.g('jalaDisc', () => new THREE.CircleGeometry(0.0095, 20).rotateX(-Math.PI / 2));
        const seed = this.g('jalaSeedG', () => new THREE.SphereGeometry(0.0015, 6, 4));
        const meshes: THREE.Object3D[] = [];
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const r = i === 0 ? 0 : 0.035;
          const g = new THREE.Group();
          g.position.set(Math.cos(a) * r, 0.0022, Math.sin(a) * r);
          const t = new THREE.Mesh(ring, green);
          t.rotation.x = Math.PI / 2;
          t.scale.set(1, 1, 0.55);
          const d = new THREE.Mesh(disc, flesh);
          g.add(t, d);
          for (let k = 0; k < 4; k++) {
            const sd = new THREE.Mesh(seed, seedM);
            sd.position.set(Math.cos(k * 1.6) * 0.004, 0.0006, Math.sin(k * 1.6) * 0.004);
            sd.scale.set(1, 0.4, 1.4);
            g.add(sd);
          }
          g.rotation.set(rng.range(-0.1, 0.1), rng.range(0, 6), rng.range(-0.1, 0.1));
          meshes.push(g);
        }
        return this.makeGroup(id, meshes, 0.05);
      }
      case 'mushrooms': {
        const s = this.baker.bake(F.mushroomSlice);
        const mat = this.m('mushMat', () => new THREE.MeshPhysicalMaterial({ map: s.map, normalMap: s.normalMap ?? null, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 }));
        const geo = this.g('mushroom', () => {
          const sh = new THREE.Shape();
          sh.moveTo(-0.006, 0);
          sh.lineTo(-0.005, 0.012);
          sh.quadraticCurveTo(-0.022, 0.012, -0.02, 0.022);
          sh.quadraticCurveTo(-0.012, 0.036, 0, 0.037);
          sh.quadraticCurveTo(0.012, 0.036, 0.02, 0.022);
          sh.quadraticCurveTo(0.022, 0.012, 0.005, 0.012);
          sh.lineTo(0.006, 0);
          sh.lineTo(-0.006, 0);
          const g = new THREE.ExtrudeGeometry(sh, { depth: 0.0035, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 2, curveSegments: 10 });
          g.rotateX(-Math.PI / 2);
          g.translate(0, 0, 0.018);
          const uv = g.attributes.uv as THREE.BufferAttribute;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 25 + 0.5, uv.getY(i) * 25);
          return g;
        });
        const meshes: THREE.Object3D[] = [];
        for (let i = 0; i < 6; i++) {
          const m = new THREE.Mesh(geo, mat);
          const a = (i / 6) * Math.PI * 2 + rng.range(-0.3, 0.3);
          m.position.set(Math.cos(a) * 0.022, 0.001 + (i % 2) * 0.002, Math.sin(a) * 0.022);
          m.rotation.y = -a + Math.PI / 2 + rng.range(-0.4, 0.4);
          m.rotation.z = rng.range(-0.08, 0.08);
          meshes.push(m);
        }
        return this.makeGroup(id, meshes, 0.06);
      }
      case 'avocado': {
        const mat = this.m('avoMat', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
        const geo = this.g('avoSlice', () => {
          const sh = new THREE.Shape();
          sh.absarc(0, 0, 0.05, -0.45, 0.45, false);
          sh.absarc(-0.012, 0, 0.036, 0.52, -0.52, true);
          const g = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 3, curveSegments: 16 });
          g.rotateX(-Math.PI / 2);
          const p = g.attributes.position as THREE.BufferAttribute;
          const col: number[] = [];
          const inner = new THREE.Color(0xe8e27a);
          const outer = new THREE.Color(0x4c8a22);
          const skin = new THREE.Color(0x2c4a14);
          for (let i = 0; i < p.count; i++) {
            const r = Math.hypot(p.getX(i), p.getZ(i));
            const t = THREE.MathUtils.smoothstep(r, 0.032, 0.05);
            const c = inner.clone().lerp(outer, t);
            if (r > 0.049) c.lerp(skin, 0.8);
            col.push(c.r, c.g, c.b);
          }
          g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
          g.translate(-0.022, 0, 0);
          return g;
        });
        const meshes: THREE.Object3D[] = [];
        for (let i = 0; i < 4; i++) {
          const m = new THREE.Mesh(geo, mat);
          m.rotation.y = -0.6 + i * 0.4 + rng.range(-0.05, 0.05);
          m.position.set(-0.012, 0.001 + i * 0.0015, 0);
          meshes.push(m);
        }
        return this.makeGroup(id, meshes, 0.06);
      }
      case 'egg': {
        const s = this.baker.bake(F.eggWhite);
        const white = this.m('eggWhite', () => new THREE.MeshPhysicalMaterial({ map: s.map, normalMap: s.normalMap ?? null, roughness: 0.3, clearcoat: 0.5, sheen: 0.4, side: THREE.DoubleSide }));
        const yolk = this.m('eggYolk', () => new THREE.MeshPhysicalMaterial({ color: 0xffa914, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, emissive: new THREE.Color(0x3a1a00) }));
        const wGeo = this.g('eggWhiteGeo', () => {
          const g = this.leafGeo(9, 0.072).clone();
          const p = g.attributes.position as THREE.BufferAttribute;
          for (let i = 0; i < p.count; i++) {
            const r = Math.hypot(p.getX(i), p.getZ(i));
            p.setY(i, 0.003 * (1 - (r / 0.08) ** 2) + noise.noise2(p.getX(i) * 50, p.getZ(i) * 50) * 0.0008);
          }
          g.computeVertexNormals();
          return g;
        });
        const w = new THREE.Mesh(wGeo, white);
        w.scale.set(1, 1, 0.92);
        const y = new THREE.Mesh(this.g('yolk', () => new THREE.SphereGeometry(0.021, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2)), yolk);
        y.scale.set(1, 0.62, 1);
        y.position.set(rng.range(-0.01, 0.01), 0.0035, rng.range(-0.01, 0.01));
        return this.makeGroup(id, [w, y], 0.075);
      }
      case 'onion_rings': {
        const s = this.baker.bake(F.breaded('onionRing', 0xc98a2e, 0xe9b458));
        const mat = this.m('ringMat', () => new THREE.MeshPhysicalMaterial({ map: s.map, normalMap: s.normalMap ?? null, normalScale: new THREE.Vector2(1.5, 1.5), roughness: 0.55, clearcoat: 0.3 }));
        const geo = this.g('onionRingBig', () => {
          const g = new THREE.TorusGeometry(0.03, 0.0095, 14, 40);
          const uv = g.attributes.uv as THREE.BufferAttribute;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 0.7);
          const p = g.attributes.position as THREE.BufferAttribute;
          for (let i = 0; i < p.count; i++) {
            const k = 1 + noise.noise3(p.getX(i) * 120, p.getY(i) * 120, p.getZ(i) * 120) * 0.08;
            p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i));
          }
          g.computeVertexNormals();
          return g;
        });
        const a = new THREE.Mesh(geo, mat);
        a.rotation.x = Math.PI / 2;
        a.position.set(-0.018, 0.0085, -0.006);
        const b = new THREE.Mesh(geo, mat);
        b.rotation.x = Math.PI / 2 + 0.06;
        b.position.set(0.02, 0.0095, 0.01);
        b.scale.setScalar(0.92);
        return this.makeGroup(id, [a, b], 0.065);
      }
    }
    throw new Error('unknown topping ' + id);
  }

  // ------------------------------------------------------------------ sauces
  sauceMaterial(id: SauceId): THREE.MeshPhysicalMaterial {
    const col: Record<SauceId, number> = {
      ketchup: 0xb3140b,
      mustard: 0xf0b90b,
      mayo: 0xf7f1dc,
      bbq: 0x4a1a0a,
      special: 0xf28a55,
      sriracha: 0xd8300f,
    };
    return this.m('sauce_' + id, () =>
      new THREE.MeshPhysicalMaterial({
        color: col[id],
        roughness: id === 'mayo' ? 0.28 : 0.16,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        sheen: id === 'mayo' ? 0.6 : 0.2,
        sheenColor: new THREE.Color(0xffffff),
        emissive: new THREE.Color(col[id]).multiplyScalar(0.04),
      }),
    );
  }

  sauce(id: SauceId, style?: 'spiral' | 'zigzag' | 'loops'): FoodPiece {
    const st = style ?? (id === 'mustard' || id === 'sriracha' ? 'zigzag' : id === 'special' ? 'loops' : 'spiral');
    const pts: THREE.Vector3[] = [];
    const rr = () => (Math.random() - 0.5) * 0.002;
    if (st === 'spiral') {
      const turns = 2.4;
      const n = 90;
      const a0 = Math.random() * Math.PI * 2;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = a0 + t * turns * Math.PI * 2;
        const r = 0.05 * (1 - t) + 0.006;
        pts.push(new THREE.Vector3(Math.cos(a) * r + rr(), 0, Math.sin(a) * r + rr()));
      }
    } else if (st === 'zigzag') {
      const rows = 7;
      for (let i = 0; i < rows; i++) {
        const z = -0.045 + (i / (rows - 1)) * 0.09;
        const w = Math.sqrt(Math.max(0, 0.052 * 0.052 - z * z));
        const x = i % 2 ? w : -w;
        pts.push(new THREE.Vector3(x * 0.95 + rr(), 0, z + rr()));
      }
    } else {
      const n = 60;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = t * Math.PI * 2 * 5;
        const base = (t - 0.5) * 0.09;
        pts.push(new THREE.Vector3(base + Math.cos(a) * 0.012, 0, Math.sin(a) * 0.018 + Math.sin(t * 6) * 0.01));
      }
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const segs = st === 'zigzag' ? 140 : 200;
    const radius = id === 'sriracha' ? 0.0026 : 0.0036;
    const geo = new THREE.TubeGeometry(curve, segs, radius, 8, false);
    geo.scale(1, 0.55, 1);
    geo.translate(0, radius * 0.5, 0);
    const mesh = new THREE.Mesh(geo, this.sauceMaterial(id));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // end blobs
    const blobGeo = this.g('sauceBlob', () => new THREE.SphereGeometry(1, 12, 8));
    const endA = new THREE.Mesh(blobGeo, mesh.material);
    endA.scale.set(radius * 1.2, radius * 0.7, radius * 1.2);
    endA.position.copy(pts[0]).setY(radius * 0.5);
    const endB = endA.clone();
    endB.position.copy(pts[pts.length - 1]).setY(radius * 0.5);
    const obj = new THREE.Group();
    obj.add(mesh, endA, endB);
    const total = geo.index!.count;
    geo.setDrawRange(0, total);
    return {
      id,
      obj,
      thickness: INGREDIENTS[id].thickness,
      radius: 0.055,
      setGrow(t) {
        const c = Math.floor(Math.max(0, Math.min(1, t)) * segs) * 8 * 6;
        geo.setDrawRange(0, c);
        endA.visible = t > 0.02;
        endB.visible = t >= 0.999;
      },
      dispose() {
        geo.dispose();
      },
    };
  }

  // ------------------------------------------------------------------ generic
  make(id: IngredientId, part: 'top' | 'bottom' = 'bottom'): FoodPiece {
    const cat = INGREDIENTS[id].category;
    if (cat === 'bun') return this.bunPart(id as BunId, part);
    if (cat === 'patty') return this.patty(id as PattyId);
    if (cat === 'cheese') return this.cheese(id);
    if (cat === 'sauce') return this.sauce(id as SauceId);
    return this.topping(id);
  }
}

export function shadowAll(o: THREE.Object3D) {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
}
