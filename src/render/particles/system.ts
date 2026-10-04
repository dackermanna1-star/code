/**
 * CPU-simulated, GPU-instanced particle system.
 *
 * Three pools (see defs.ts `Pool`): block crumbs (instanced cubes in the G-buffer, lit by the
 * deferred pass exactly like terrain), premultiplied-alpha billboards (sorted back to front) and
 * additive billboards. Particles are simulated on the CPU in dense SoA pools (ParticlePool):
 * gravity, drag, wind, wobble, attractor paths, drips, point-vs-voxel collision with bounce and
 * resting, light re-sampling when crossing blocks. Visual curves (size, alpha, erosion, emission
 * ramps) are evaluated when the instance buffers are written each frame.
 */
import * as THREE from 'three';
import { ParticlePool, PFlag } from './pool';
import { PARTICLE_DEFS, Pool, Mode, Orient, Motion, Ramp, Land, type PDef } from './defs';
import { generateAtlas, type AtlasData } from './atlas';
import { billboardVertex, BILLBOARD_FRAG, CRUMB_VERT, CRUMB_FRAG } from './shaders';
import { pointSolid, type BoxHit, type ParticleWorld } from './blockInfo';
import { FlashPass } from './flash';
import { T_LIQUID } from '../../world/blocks/registry';

/** What the system needs from the renderer (structural; satisfied by `Renderer`). */
export interface ParticleRendererLike {
  readonly lightUniforms: Record<string, THREE.IUniform>;
  readonly shadowUniforms: Record<string, THREE.IUniform>;
  readonly terrainUniforms: Record<string, THREE.IUniform>;
  readonly linearDepthTexture: THREE.Texture;
  readonly atmosphere: { glsl: string; uniforms: Record<string, THREE.IUniform> };
}

export interface ParticleStats {
  crumbs: number;
  alpha: number;
  additive: number;
  simMs: number;
  uploadMs: number;
  dropped: number;
}

const POOL_CAP = { low: [2500, 5000, 5000], medium: [4000, 8000, 8000], high: [6000, 12000, 12000], ultra: [8000, 16000, 16000] } as const;
const DENSITY = { low: 0.45, medium: 0.7, high: 1, ultra: 1.25 } as const;

const hit: BoxHit = { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, liquid: 0 };
const cellHash = (x: number, y: number, z: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) | 0;
const rnd = Math.random;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Queued spawn from inside a simulation step (sub-effects). */
interface Pending {
  kind: 'splash' | 'lava' | 'blood' | 'smoke';
  x: number; y: number; z: number;
  r: number; g: number; b: number;
}

export class ParticleSystem {
  readonly pools: [ParticlePool, ParticlePool, ParticlePool];
  /** Effect density multiplier from the quality preset (scales spawn counts). */
  density = 1;
  world: ParticleWorld | null = null;
  /** Wind velocity (b/s) applied to wind-coupled particles. */
  readonly wind = new THREE.Vector3(0.3, 0, 0.15);
  /** Scene drawn after translucents (alpha + additive billboards). */
  readonly forwardScene = new THREE.Scene();
  /** Scene drawn into the G-buffer (crumbs). */
  readonly gbufferScene = new THREE.Scene();
  readonly stats: ParticleStats = { crumbs: 0, alpha: 0, additive: 0, simMs: 0, uploadMs: 0, dropped: 0 };
  /** Called when a blood droplet hits a surface (decal workstreams hook in here). */
  onBloodLand: ((x: number, y: number, z: number, r: number, g: number, b: number) => void) | null = null;
  /** Called when any drip/splash lands (audio may hook in). */
  onDripLand: ((x: number, y: number, z: number, lava: boolean) => void) | null = null;
  time = 0;
  private frame = 0;
  private pending: Pending[] = [];
  private atlas!: THREE.DataArrayTexture;
  private bb: BillboardBatch[] = [];
  private crumbBatch!: CrumbBatch;
  private linDepthUniform: THREE.IUniform = { value: null };
  private camX = 0;
  private camY = 0;
  private camZ = 0;

  constructor(quality: keyof typeof POOL_CAP = 'high', atlasData?: AtlasData) {
    const cap = POOL_CAP[quality] ?? POOL_CAP.high;
    this.density = DENSITY[quality] ?? 1;
    this.pools = [new ParticlePool(cap[0]), new ParticlePool(cap[1]), new ParticlePool(cap[2])];
    this.atlasData = atlasData ?? null;
  }
  private atlasData: AtlasData | null;

  /** Creates GPU resources. Call after the renderer's materials and atmosphere are installed. */
  attach(renderer: ParticleRendererLike) {
    const data = this.atlasData ?? generateAtlas(128);
    this.atlasData = null;
    const tex = new THREE.DataArrayTexture(data.data, data.size, data.size, data.layers);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.UnsignedByteType;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = true;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    this.atlas = tex;
    const lu = renderer.lightUniforms, tu = renderer.terrainUniforms;
    // the renderer points this at the linear depth of whichever view is drawing (main or portal)
    this.linDepthUniform = lu.u_linDepth;
    const shared: Record<string, THREE.IUniform> = {
      ...renderer.shadowUniforms,
      ...renderer.atmosphere.uniforms,
      u_cameraPos: lu.u_cameraPos,
      u_lightDir: lu.u_lightDir,
      u_lightColor: lu.u_lightColor,
      u_sh: lu.u_sh,
      u_skyLightScale: lu.u_skyLightScale,
      u_dimAmbient: lu.u_dimAmbient,
      u_minAmbient: lu.u_minAmbient,
      u_albedo: tu.u_albedo,
      u_resolution: tu.u_resolution,
      u_linDepth: this.linDepthUniform,
      u_atlas: { value: tex },
      u_hasBlockTex: { value: tu.u_albedo.value ? 1 : 0 },
    };
    const vert = billboardVertex(renderer.atmosphere.glsl);
    this.bb = [
      new BillboardBatch(this.pools[Pool.Alpha], vert, { ...shared, u_additive: { value: 0 } }, 10),
      new BillboardBatch(this.pools[Pool.Add], vert, { ...shared, u_additive: { value: 1 } }, 11),
    ];
    for (const b of this.bb) this.forwardScene.add(b.mesh);
    this.crumbBatch = new CrumbBatch(this.pools[Pool.Crumb], { u_albedo: tu.u_albedo, u_normalTex: tu.u_normalTex, u_props: tu.u_props });
    this.gbufferScene.add(this.crumbBatch.mesh);
    this.flash = new FlashPass(lu, this.linDepthUniform);
    this.forwardScene.add(this.flash.mesh);
    this.renderer = renderer;
  }
  /** Transient lights (explosions, fireworks, lightning sky flash). Null until attached. */
  flash: FlashPass | null = null;
  private renderer: ParticleRendererLike | null = null;

  get attached() {
    return this.renderer !== null;
  }

  get count() {
    return this.pools[0].count + this.pools[1].count + this.pools[2].count;
  }

  clear() {
    for (const p of this.pools) p.clear();
    this.pending.length = 0;
    this.flash?.clear();
  }

  // ------------------------------------------------------------------------------ spawning
  /** Pool of the most recent successful spawn (to customise fields after `spawn`). */
  lp: ParticlePool = null as any;

  /**
   * Spawns one particle of type `type` (PT id). Returns its index in `this.lp` or -1.
   */
  spawn(type: number, x: number, y: number, z: number, vx = 0, vy = 0, vz = 0): number {
    const d = PARTICLE_DEFS[type];
    if (!d) return -1;
    const pool = this.pools[d.pool];
    const life = lerp(d.life[0], d.life[1], rnd());
    const i = pool.alloc(type, x, y, z, life);
    if (i < 0) return -1;
    this.lp = pool;
    pool.vx[i] = vx; pool.vy[i] = vy; pool.vz[i] = vz;
    pool.size[i] = lerp(d.size[0], d.size[1], rnd());
    pool.spin[i] = (rnd() * 2 - 1) * d.spin;
    pool.rot[i] = d.orient === Orient.Velocity ? 0 : rnd() * Math.PI * 2;
    const cv = d.colorVar;
    const k = cv ? 1 + (rnd() - 0.5) * 2 * cv : 1;
    pool.r[i] = d.color[0] * k; pool.g[i] = d.color[1] * k; pool.b[i] = d.color[2] * k;
    pool.a[i] = d.alpha;
    pool.sprite[i] = d.sprite + (d.variants > 1 ? Math.floor(rnd() * d.variants) : 0);
    let f = 0;
    if (d.collide) f |= PFlag.Collide;
    if (d.trackLight) f |= PFlag.TrackLight;
    pool.flags[i] = f;
    pool.u3[i] = -1; // block texture layer for block-coloured dust (none)
    if (d.motion === Motion.Drip) {
      pool.u0[i] = 1.2 + rnd() * 1.6; // hang time
    } else if (d.motion === Motion.Attract) {
      pool.u0[i] = x; pool.u1[i] = y; pool.u2[i] = z;
    }
    this.sampleLight(pool, i, true);
    return i;
  }

  /** Overrides colour (linear RGB) of the last spawned particle. */
  tint(i: number, r: number, g: number, b: number, a?: number) {
    if (i < 0) return;
    const p = this.lp;
    p.r[i] = r; p.g[i] = g; p.b[i] = b;
    if (a !== undefined) p.a[i] = a;
  }

  private sampleLight(p: ParticlePool, i: number, force: boolean) {
    const w = this.world;
    if (!w) return;
    const bx = Math.floor(p.px[i]), by = Math.floor(p.py[i]), bz = Math.floor(p.pz[i]);
    const h = cellHash(bx, by, bz);
    if (!force && h === p.cell[i]) return;
    p.cell[i] = h;
    let l = w.getLight(bx, by, bz);
    // inside an opaque block (light 0): use the brightest neighbour above
    if (l === 0) l = w.getLight(bx, by + 1, bz);
    p.light[i] = l;
  }

  // ------------------------------------------------------------------------------ simulation
  update(dt: number, camera: THREE.PerspectiveCamera) {
    const camPos = camera.position;
    const t0 = performance.now();
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.frame++;
    this.camX = camPos.x; this.camY = camPos.y; this.camZ = camPos.z;
    if (dt > 0) for (const p of this.pools) this.simulate(p, dt);
    this.flushPending();
    const t1 = performance.now();
    if (this.renderer) {
      for (const b of this.bb) b.write(this, this.camX, this.camY, this.camZ, b.pool === this.pools[Pool.Alpha]);
      this.crumbBatch.write(this.camX, this.camY, this.camZ);
      this.flash?.update(dt, camera);
    }
    const t2 = performance.now();
    this.stats.crumbs = this.pools[0].count;
    this.stats.alpha = this.pools[1].count;
    this.stats.additive = this.pools[2].count;
    this.stats.simMs = t1 - t0;
    this.stats.uploadMs = t2 - t1;
    this.stats.dropped = this.pools[0].dropped + this.pools[1].dropped + this.pools[2].dropped;
  }

  private simulate(p: ParticlePool, dt: number) {
    const w = this.world;
    const wx = this.wind.x, wz = this.wind.z;
    const time = this.time;
    const frame = this.frame;
    for (let i = 0; i < p.count; ) {
      const d = PARTICLE_DEFS[p.type[i]];
      const age = (p.age[i] += dt);
      if (age >= p.life[i]) {
        p.kill(i);
        continue;
      }
      let fl = p.flags[i];
      p.rot[i] += p.spin[i] * dt;
      // ---------------- motion
      if (d.motion === Motion.Attract) {
        const t = age / p.life[i];
        // ease in: start at target + offset, converge on the target (Minecraft portal/enchant)
        const g = 1 - (2 * t * t - t);
        const k = Math.max(0, Math.min(1.2, g));
        p.px[i] = p.u0[i] + p.vx[i] * k;
        p.py[i] = p.u1[i] + p.vy[i] * k + (p.type[i] === PT_PORTAL ? (1 - t) * 0.6 : -t * t * t * 0.4);
        p.pz[i] = p.u2[i] + p.vz[i] * k;
        i++;
        continue;
      }
      if (d.motion === Motion.Drip && (fl & PFlag.StateA) === 0) {
        // hanging: grow, then release
        if (age >= p.u0[i]) {
          p.flags[i] = fl |= PFlag.StateA;
          p.age[i] = 0;
          p.life[i] = 4;
        }
        i++;
        continue;
      }
      let vx = p.vx[i], vy = p.vy[i], vz = p.vz[i];
      if ((fl & PFlag.Resting) === 0) {
        vy -= d.gravity * dt;
        if (d.drag) {
          const k = Math.exp(-d.drag * dt);
          if (d.gravity < 0) {
            // buoyant: drag only horizontally strongly, vertical terminal speed ~ -g/drag
            vx *= k; vz *= k; vy *= k;
          } else {
            vx *= k; vy *= k; vz *= k;
          }
        }
        if (d.wind) {
          const k = 1 - Math.exp(-d.wind * 0.8 * dt);
          vx += (wx - vx) * k;
          vz += (wz - vz) * k;
        }
        if (d.wobble) {
          const s = p.seed[i] * 40;
          vx += Math.sin(time * 2.1 + s) * d.wobble * dt * 3;
          vz += Math.cos(time * 1.7 + s * 1.3) * d.wobble * dt * 3;
          if (d.motion === Motion.Wander) vy += Math.sin(time * 1.3 + s * 0.7) * d.wobble * dt * 2;
        }
        let nx = p.px[i] + vx * dt, ny = p.py[i] + vy * dt, nz = p.pz[i] + vz * dt;
        if ((fl & PFlag.Collide) && w) {
          const r = d.pool === Pool.Crumb ? p.size[i] * 0.3 : 0.02;
          // Y
          if (vy < 0 && pointSolid(w, p.px[i], ny - r, p.pz[i], hit)) {
            ny = hit.y1 + r;
            if (d.land !== Land.None) {
              this.land(p, i, d, nx, ny, nz);
              p.kill(i);
              continue;
            }
            fl |= PFlag.Landed;
            if (-vy < 1.2) {
              vy = 0;
              const fr = Math.exp(-12 * dt);
              vx *= fr; vz *= fr;
              if (vx * vx + vz * vz < 0.01) {
                vx = vz = 0;
                fl |= PFlag.Resting;
                p.spin[i] = 0;
              }
            } else {
              vy = -vy * d.bounce;
              vx *= 0.7; vz *= 0.7;
              p.spin[i] *= 0.6;
            }
          } else if (vy > 0 && pointSolid(w, p.px[i], ny + r, p.pz[i], hit)) {
            ny = hit.y0 - r;
            vy = 0;
          }
          // X / Z
          if (vx !== 0 && pointSolid(w, nx + (vx > 0 ? r : -r), ny, p.pz[i], hit)) {
            nx = p.px[i];
            vx = -vx * d.bounce;
          }
          if (vz !== 0 && pointSolid(w, nx, ny, nz + (vz > 0 ? r : -r), hit)) {
            nz = p.pz[i];
            vz = -vz * d.bounce;
          }
          if (d.land === Land.None && hit.liquid && d.pool === Pool.Crumb) {
            // sinking in water: heavy drag
            const k = Math.exp(-6 * dt);
            vx *= k; vy *= k; vz *= k;
          }
        }
        p.px[i] = nx; p.py[i] = ny; p.pz[i] = nz;
        p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
        p.flags[i] = fl;
      } else if (((frame + i) & 15) === 0 && w) {
        // resting: check the support is still there
        if (!pointSolid(w, p.px[i], p.py[i] - p.size[i] * 0.3 - 0.02, p.pz[i], hit)) p.flags[i] = fl & ~PFlag.Resting;
      }
      // ---------------- environment checks
      if ((d.needsWater || d.diesInLiquid) && w && ((frame + i) & 1) === 0) {
        const st = w.getBlock(Math.floor(p.px[i]), Math.floor(p.py[i]), Math.floor(p.pz[i]));
        const liq = st ? T_LIQUID[st >>> 4] : 0;
        if ((d.needsWater && liq !== 1) || (d.diesInLiquid && liq !== 0)) {
          if (d.needsWater && d.name.startsWith('bubble')) this.queue('splash', p.px[i], p.py[i], p.pz[i], 1, 1, 1);
          p.kill(i);
          continue;
        }
      }
      if (fl & PFlag.TrackLight) this.sampleLight(p, i, false);
      i++;
    }
  }

  private land(p: ParticlePool, i: number, d: PDef, x: number, y: number, z: number) {
    switch (d.land) {
      case Land.Splash:
        this.queue('splash', x, y, z, p.r[i], p.g[i], p.b[i]);
        this.onDripLand?.(x, y, z, false);
        break;
      case Land.Lava:
        this.queue('lava', x, y, z, 1, 1, 1);
        if (d.motion === Motion.Drip) this.onDripLand?.(x, y, z, true);
        break;
      case Land.Blood:
        this.queue('blood', x, y, z, p.r[i], p.g[i], p.b[i]);
        break;
    }
  }

  private queue(kind: Pending['kind'], x: number, y: number, z: number, r: number, g: number, b: number) {
    if (this.pending.length < 512) this.pending.push({ kind, x, y, z, r, g, b });
  }

  private flushPending() {
    const list = this.pending;
    if (!list.length) return;
    this.pending = [];
    for (const e of list) {
      if (e.kind === 'splash') {
        const n = 2 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const a = rnd() * Math.PI * 2, s = 0.6 + rnd() * 1.2;
          this.spawn(PT_SPLASH, e.x, e.y + 0.03, e.z, Math.cos(a) * s, 1.5 + rnd() * 1.8, Math.sin(a) * s);
        }
      } else if (e.kind === 'lava') {
        this.spawn(PT_LANDING_LAVA, e.x, e.y + 0.01, e.z);
        if (rnd() < 0.6) this.spawn(PT_SMOKE, e.x, e.y + 0.05, e.z, 0, 0.3, 0);
      } else if (e.kind === 'blood') {
        this.onBloodLand?.(e.x, e.y, e.z, e.r, e.g, e.b);
      }
    }
  }

  dispose() {
    for (const b of this.bb) b.dispose();
    this.crumbBatch?.dispose();
    this.atlas?.dispose();
    this.flash?.dispose();
  }
}

// ids resolved lazily (defs are registered in defs.ts at import time)
let PT_SPLASH = 0, PT_LANDING_LAVA = 0, PT_SMOKE = 0, PT_PORTAL = 0;
{
  const byName = (n: string) => PARTICLE_DEFS.findIndex((d) => d.name === n);
  PT_SPLASH = byName('splash');
  PT_LANDING_LAVA = byName('landing_lava');
  PT_SMOKE = byName('smoke');
  PT_PORTAL = byName('portal');
}

// ================================================================================ billboards
const ATTRS = ['a_posSize', 'a_color', 'a_emis', 'a_params', 'a_misc', 'a_vel'] as const;

/** Computes the lava/spark/explosion colour ramps (linear RGB, unscaled). */
function rampColor(ramp: Ramp, t: number, seed: number, out: number[]) {
  switch (ramp) {
    case Ramp.Lava: {
      // yellow-white -> orange -> deep red
      out[0] = 1; out[1] = lerp(0.75, 0.12, sat(t * 1.3)); out[2] = lerp(0.3, 0.0, sat(t * 2));
      return;
    }
    case Ramp.Spark: {
      out[0] = 1; out[1] = lerp(0.85, 0.25, sat(t * 1.5)); out[2] = lerp(0.55, 0.02, sat(t * 2.5));
      return;
    }
    case Ramp.Explosion: {
      out[0] = 1; out[1] = lerp(0.8, 0.22, sat(t * 2.2)); out[2] = lerp(0.45, 0.02, sat(t * 3));
      return;
    }
    case Ramp.Portal: {
      const j = 0.4 + 0.6 * seed;
      out[0] = j * 0.55; out[1] = j * 0.15; out[2] = j;
      return;
    }
    case Ramp.EndRod: {
      out[0] = 1; out[1] = lerp(0.97, 0.9, t); out[2] = lerp(0.95, 0.82, t);
      return;
    }
    default:
      out[0] = out[1] = out[2] = 1;
  }
}

const rc = [1, 1, 1];

class BillboardBatch {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private attrs: THREE.InstancedBufferAttribute[] = [];
  private arrays: Float32Array[] = [];
  private keys: Uint16Array;
  private order: Uint32Array;
  private tmpOrder: Uint32Array;

  constructor(readonly pool: ParticlePool, vert: string, uniforms: Record<string, THREE.IUniform>, renderOrder: number) {
    const cap = pool.capacity;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    for (const n of ATTRS) {
      const arr = new Float32Array(cap * 4);
      const a = new THREE.InstancedBufferAttribute(arr, 4);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(n, a);
      this.attrs.push(a);
      this.arrays.push(arr);
    }
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.geo = g;
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vert,
      fragmentShader: BILLBOARD_FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.keys = new Uint16Array(cap);
    this.order = new Uint32Array(cap);
    this.tmpOrder = new Uint32Array(cap);
  }

  /** Back-to-front order via 2-pass LSD radix sort on 16-bit quantised distance. */
  private sort(n: number, cx: number, cy: number, cz: number) {
    const p = this.pool, keys = this.keys;
    for (let i = 0; i < n; i++) {
      const dx = p.px[i] - cx, dy = p.py[i] - cy, dz = p.pz[i] - cz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // far first: invert
      keys[i] = 65535 - Math.min(65535, (dist * 200) | 0);
    }
    const a = this.order, b = this.tmpOrder;
    for (let i = 0; i < n; i++) a[i] = i;
    const cnt = new Uint32Array(256);
    for (let pass = 0; pass < 2; pass++) {
      const shift = pass * 8;
      const src = pass === 0 ? a : b, dst = pass === 0 ? b : a;
      cnt.fill(0);
      for (let i = 0; i < n; i++) cnt[(keys[src[i]] >> shift) & 255]++;
      let s = 0;
      for (let k = 0; k < 256; k++) { const c = cnt[k]; cnt[k] = s; s += c; }
      for (let i = 0; i < n; i++) { const v = src[i]; dst[cnt[(keys[v] >> shift) & 255]++] = v; }
    }
  }

  write(sys: ParticleSystem, cx: number, cy: number, cz: number, sorted: boolean) {
    const p = this.pool;
    const n = p.count;
    if (sorted && n > 1) this.sort(n, cx, cy, cz);
    const [PS, CO, EM, PA, MI, VE] = this.arrays;
    const order = this.order;
    const time = sys.time;
    for (let k = 0; k < n; k++) {
      const i = sorted && n > 1 ? order[k] : k;
      const d = PARTICLE_DEFS[p.type[i]];
      const lifeT = p.age[i] / p.life[i];
      let t = lifeT > 1 ? 1 : lifeT;
      const fl = p.flags[i];
      let size = p.size[i];
      let alpha = p.a[i];
      let posY = p.py[i];
      let vx = p.vx[i], vy = p.vy[i], vz = p.vz[i];
      if (d.motion === Motion.Drip) {
        if ((fl & PFlag.StateA) === 0) {
          // hanging & growing drop
          const g = Math.min(1, p.age[i] / Math.max(0.01, p.u0[i]));
          size *= 0.4 + 0.6 * g;
          vx = 0; vz = 0; vy = -0.4 - 1.6 * g * g; // a little stretch while hanging
          posY -= size * 0.5 * g;
          t = 0.5; // full alpha
        } else t = 0.5;
      }
      // size curve
      if (d.sizeEnd !== 1) size *= lerp(1, d.sizeEnd, d.sizePow === 1 ? t : Math.pow(t, d.sizePow));
      // fades
      if (d.fadeIn > 0 && t < d.fadeIn) alpha *= t / d.fadeIn;
      const fo = d.fadeOut > 0 ? sat((1 - t) / d.fadeOut) : 1;
      alpha *= fo;
      const o = k * 4;
      PS[o] = p.px[i] - cx; PS[o + 1] = posY - cy; PS[o + 2] = p.pz[i] - cz; PS[o + 3] = size;
      CO[o] = p.r[i]; CO[o + 1] = p.g[i]; CO[o + 2] = p.b[i]; CO[o + 3] = alpha;
      // emission
      let ex = 0, ey = 0, ez = 0, ew = 0;
      if (d.mode === Mode.Flame) {
        const e = d.emissive * lerp(1, d.emissiveEnd, t);
        ex = ey = ez = e;
        ew = (1.15 - t * 0.6) * (d.ramp === Ramp.Soul ? -1 : 1);
      } else if (d.emissive > 0) {
        let e = d.emissive * lerp(1, d.emissiveEnd, t);
        if (d.ramp === Ramp.Explosion) e = d.emissive * Math.pow(sat(1 - t / 0.55), 2.2);
        if (d.name === 'firefly') e *= 0.08 + 0.92 * Math.pow(Math.max(0, Math.sin(time * 2.3 + p.seed[i] * 40)), 6);
        if (d.ramp === Ramp.EndRod && t > 0.7) e *= 0.5 + 0.5 * Math.sin(time * 40 + p.seed[i] * 100);
        if (d.ramp !== Ramp.None) {
          rampColor(d.ramp, t, p.seed[i], rc);
          ex = rc[0] * e; ey = rc[1] * e; ez = rc[2] * e;
          if (d.ramp === Ramp.Portal) { ex *= p.r[i]; ey *= p.g[i]; ez *= p.b[i]; }
        } else {
          ex = p.r[i] * e; ey = p.g[i] * e; ez = p.b[i] * e;
        }
        ew = 0;
      }
      if (d.mode === Mode.Sprite) ew = d.selfLit;
      EM[o] = ex; EM[o + 1] = ey; EM[o + 2] = ez; EM[o + 3] = ew;
      const erode = d.erode ? Math.pow(sat((t - 0.25) / 0.75), 1.3) * 0.85 : 0;
      PA[o] = p.rot[i]; PA[o + 1] = p.sprite[i]; PA[o + 2] = d.mode; PA[o + 3] = erode;
      MI[o] = p.light[i]; MI[o + 1] = p.seed[i]; MI[o + 2] = d.orient; MI[o + 3] = d.stretch;
      VE[o] = vx; VE[o + 1] = vy; VE[o + 2] = vz; VE[o + 3] = p.u3[i];
    }
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, Math.max(1, n) * 4);
      a.needsUpdate = n > 0;
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
  }

  dispose() {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ================================================================================ crumbs
const CRUMB_ATTRS = ['a_posSize', 'a_quat', 'a_tex', 'a_tint', 'a_light'] as const;

class CrumbBatch {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private attrs: THREE.InstancedBufferAttribute[] = [];
  private arrays: Float32Array[] = [];

  constructor(readonly pool: ParticlePool, uniforms: Record<string, THREE.IUniform>) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', box.getAttribute('position'));
    g.setAttribute('normal', box.getAttribute('normal'));
    g.setAttribute('uv', box.getAttribute('uv'));
    g.setIndex(box.getIndex());
    // per-vertex tangent (+u direction) per face
    const pos = box.getAttribute('position'), uv = box.getAttribute('uv');
    const tan = new Float32Array(pos.count * 3);
    for (let f = 0; f < pos.count; f += 4) {
      // vertices 0,1 differ in u only on BoxGeometry faces
      const du = uv.getX(f + 1) - uv.getX(f);
      const sx = (pos.getX(f + 1) - pos.getX(f)) / du, sy = (pos.getY(f + 1) - pos.getY(f)) / du, sz = (pos.getZ(f + 1) - pos.getZ(f)) / du;
      for (let v = 0; v < 4; v++) { tan[(f + v) * 3] = sx; tan[(f + v) * 3 + 1] = sy; tan[(f + v) * 3 + 2] = sz; }
    }
    g.setAttribute('a_tangent', new THREE.BufferAttribute(tan, 3));
    const cap = pool.capacity;
    for (const n of CRUMB_ATTRS) {
      const arr = new Float32Array(cap * 4);
      const a = new THREE.InstancedBufferAttribute(arr, 4);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(n, a);
      this.attrs.push(a);
      this.arrays.push(arr);
    }
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.geo = g;
    const mat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: CRUMB_VERT, fragmentShader: CRUMB_FRAG, uniforms });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
  }

  write(cx: number, cy: number, cz: number) {
    const p = this.pool;
    const n = p.count;
    const [PS, Q, TX, TI, LI] = this.arrays;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const t = p.age[i] / p.life[i];
      let size = p.size[i];
      if (t > 0.8) size *= 1 - 0.8 * ((t - 0.8) / 0.2);
      PS[o] = p.px[i] - cx; PS[o + 1] = p.py[i] - cy; PS[o + 2] = p.pz[i] - cz; PS[o + 3] = size;
      // rotation about a per-particle axis (flat on the ground once resting)
      const half = p.rot[i] * 0.5;
      const s = Math.sin(half), c = Math.cos(half);
      if (p.flags[i] & PFlag.Resting) {
        Q[o] = 0; Q[o + 1] = s; Q[o + 2] = 0; Q[o + 3] = c;
      } else {
        const sd = p.seed[i] * 6.2831853;
        let ax = Math.cos(sd), ay = 0.6 * Math.sin(sd * 3.1), az = Math.sin(sd);
        const l = Math.hypot(ax, ay, az) || 1;
        ax /= l; ay /= l; az /= l;
        Q[o] = ax * s; Q[o + 1] = ay * s; Q[o + 2] = az * s; Q[o + 3] = c;
      }
      TX[o] = p.sprite[i]; TX[o + 1] = p.u0[i]; TX[o + 2] = p.u1[i]; TX[o + 3] = p.u2[i];
      TI[o] = p.r[i]; TI[o + 1] = p.g[i]; TI[o + 2] = p.b[i]; TI[o + 3] = p.seed[i] * 10;
      const L = p.light[i];
      LI[o] = ((L >>> 12) & 15) / 15; LI[o + 1] = ((L >>> 8) & 15) / 15; LI[o + 2] = ((L >>> 4) & 15) / 15; LI[o + 3] = (L & 15) / 15;
    }
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, Math.max(1, n) * 4);
      a.needsUpdate = n > 0;
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
  }

  dispose() {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
