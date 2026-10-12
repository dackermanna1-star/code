// Blood: flying droplets and the permanent decal map painted on the ice.
//
// The original never cleared blood — every droplet that landed was drawn into
// the static field image, which is why the floe turns red over a match. We do
// the same on the GPU: landed droplets, pools, drag trails and scorch marks are
// rendered (premultiplied alpha, accumulating) into a render target that the ice
// material samples.
import * as THREE from 'three';
import { REFLECT_LAYER } from './Stage';

export const DECAL_RECT = { minX: -28, minZ: -20, sizeX: 56, sizeZ: 39 };

const MAX_SPLATS_PER_FRAME = 4096;
const MAX_DROPS = 6000;

export type SplatKind = 'drop' | 'pool' | 'smear' | 'scorch' | 'soot';

interface Splat {
  x: number;
  z: number;
  /** Half size along the main axis and across (m). */
  sx: number;
  sy: number;
  angle: number;
  /** Premultiplied colour. */
  r: number;
  g: number;
  b: number;
  a: number;
  /** Edge noise seed / shape style. */
  seed: number;
  style: number;
}

interface Drop {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  shade: number;
  life: number;
}

const splatVert = /* glsl */ `
  attribute vec4 aRect;   // x, z, sx, sy
  attribute vec4 aColor;  // premultiplied rgba
  attribute vec3 aMisc;   // angle, seed, style
  uniform vec4 uBounds;   // minX, minZ, sizeX, sizeZ
  varying vec2 vUv;
  varying vec4 vColor;
  varying vec2 vMisc;
  void main() {
    float c = cos(aMisc.x), s = sin(aMisc.x);
    vec2 local = position.xy * vec2(aRect.z, aRect.w);
    vec2 w = aRect.xy + vec2(local.x * c - local.y * s, local.x * s + local.y * c);
    vec2 ndc = (w - uBounds.xy) / uBounds.zw * 2.0 - 1.0;
    gl_Position = vec4(ndc, 0.0, 1.0);
    vUv = position.xy;
    vColor = aColor;
    vMisc = aMisc.yz;
  }
`;

const splatFrag = /* glsl */ `
  varying vec2 vUv;
  varying vec4 vColor;
  varying vec2 vMisc;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    float seed = vMisc.x;
    float style = vMisc.y;
    float r = length(vUv);
    float ang = atan(vUv.y, vUv.x);
    float edge;
    if (style < 0.5) {
      // droplet: slightly irregular ellipse
      edge = 1.0 - 0.18 * noise(vec2(ang * 2.0 + seed * 13.0, seed));
      float a = smoothstep(edge, edge - 0.25, r);
      gl_FragColor = vColor * a;
    } else if (style < 1.5) {
      // pool: lobed blob with a darker rim
      edge = 0.72 + 0.28 * noise(vec2(ang * 2.2 + seed * 7.0, seed * 3.1)) ;
      float a = smoothstep(edge, edge - 0.12, r);
      float rim = smoothstep(edge - 0.25, edge - 0.05, r) * 0.25;
      vec4 c = vColor;
      c.rgb *= (1.0 - rim);
      gl_FragColor = c * a;
    } else if (style < 2.5) {
      // smear: soft streak along x
      float a = smoothstep(1.0, 0.55, abs(vUv.y)) * smoothstep(1.0, 0.6, abs(vUv.x));
      a *= 0.6 + 0.4 * noise(vUv * vec2(6.0, 2.0) + seed);
      gl_FragColor = vColor * a;
    } else {
      // scorch / soot: radial falloff with ragged edge
      edge = 0.8 + 0.2 * noise(vec2(ang * 3.0 + seed * 5.0, seed));
      float a = smoothstep(edge, 0.0, r);
      a = a * a * (0.75 + 0.25 * noise(vUv * 5.0 + seed));
      gl_FragColor = vColor * a;
    }
  }
`;

const dropVert = /* glsl */ `
  attribute vec4 aDrop; // x y z size
  attribute vec4 aVel;  // vx vy vz shade
  varying float vShade;
  void main() {
    vec3 vel = aVel.xyz;
    float sp = length(vel);
    vec3 dir = sp > 0.001 ? vel / sp : vec3(1.0, 0.0, 0.0);
    // stretch along velocity a little (motion streak)
    vec3 p = position * aDrop.w;
    p += dir * dot(position, vec3(1.0, 0.0, 0.0)) * min(sp * 0.012, 0.12);
    vec4 mv = modelViewMatrix * vec4(aDrop.xyz + p, 1.0);
    gl_Position = projectionMatrix * mv;
    vShade = aVel.w;
  }
`;

const dropFrag = /* glsl */ `
  varying float vShade;
  void main() {
    gl_FragColor = vec4(vec3(0.42, 0.015, 0.02) * vShade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class BloodSystem {
  readonly target: THREE.WebGLRenderTarget;
  private paintScene = new THREE.Scene();
  private paintCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private splatGeo: THREE.InstancedBufferGeometry;
  private aRect: THREE.InstancedBufferAttribute;
  private aColor: THREE.InstancedBufferAttribute;
  private aMisc: THREE.InstancedBufferAttribute;
  private pending: Splat[] = [];
  private needsClear = true;

  private drops: Drop[] = [];
  private dropMesh: THREE.Mesh;
  private dropGeo: THREE.InstancedBufferGeometry;
  private aDrop: THREE.InstancedBufferAttribute;
  private aVel: THREE.InstancedBufferAttribute;
  /** 0.4 / 1 / 1.8 multiplier from options. */
  amount = 1;
  /** Tells whether (x,z) is on the ice (droplets landing elsewhere sink). */
  isOnFloe: (x: number, z: number) => boolean = () => true;
  gravity = 42;
  /** Called for every droplet that lands on the ice (corpses soak up blood). */
  onLand: ((x: number, z: number, size: number) => void) | null = null;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, resolution = 2048) {
    const w = resolution;
    const h = Math.round((resolution * DECAL_RECT.sizeZ) / DECAL_RECT.sizeX);
    this.target = new THREE.WebGLRenderTarget(w, h, {
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.target.texture.name = 'BloodDecals';

    // --- painter
    const quad = new THREE.PlaneGeometry(2, 2);
    this.splatGeo = new THREE.InstancedBufferGeometry();
    this.splatGeo.index = quad.index;
    this.splatGeo.setAttribute('position', quad.getAttribute('position'));
    this.aRect = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPLATS_PER_FRAME * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPLATS_PER_FRAME * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPLATS_PER_FRAME * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.splatGeo.setAttribute('aRect', this.aRect);
    this.splatGeo.setAttribute('aColor', this.aColor);
    this.splatGeo.setAttribute('aMisc', this.aMisc);
    const mat = new THREE.ShaderMaterial({
      vertexShader: splatVert,
      fragmentShader: splatFrag,
      uniforms: { uBounds: { value: new THREE.Vector4(DECAL_RECT.minX, DECAL_RECT.minZ, DECAL_RECT.sizeX, DECAL_RECT.sizeZ) } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    const paintMesh = new THREE.Mesh(this.splatGeo, mat);
    paintMesh.frustumCulled = false;
    this.paintScene.add(paintMesh);

    // --- flying droplets
    const cube = new THREE.IcosahedronGeometry(1, 0);
    this.dropGeo = new THREE.InstancedBufferGeometry();
    this.dropGeo.index = cube.index;
    this.dropGeo.setAttribute('position', cube.getAttribute('position'));
    this.aDrop = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DROPS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DROPS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.dropGeo.setAttribute('aDrop', this.aDrop);
    this.dropGeo.setAttribute('aVel', this.aVel);
    this.dropGeo.instanceCount = 0;
    this.dropMesh = new THREE.Mesh(
      this.dropGeo,
      new THREE.ShaderMaterial({ vertexShader: dropVert, fragmentShader: dropFrag }),
    );
    this.dropMesh.frustumCulled = false;
    this.dropMesh.layers.enable(REFLECT_LAYER);
    scene.add(this.dropMesh);
  }

  get texture(): THREE.Texture {
    return this.target.texture;
  }

  clear(): void {
    this.needsClear = true;
    this.pending.length = 0;
    this.drops.length = 0;
  }

  // ------------------------------------------------------------------ painting
  splat(kind: SplatKind, x: number, z: number, size: number, opts: { angle?: number; stretch?: number; alpha?: number; shade?: number } = {}): void {
    if (this.pending.length >= MAX_SPLATS_PER_FRAME) return;
    const shade = opts.shade ?? 0.8 + Math.random() * 0.4;
    let r: number;
    let g: number;
    let b: number;
    let a = opts.alpha ?? 1;
    let style = 0;
    switch (kind) {
      case 'drop':
        r = 0.48 * shade;
        g = 0.016 * shade;
        b = 0.008 * shade;
        a *= 0.92;
        break;
      case 'pool':
        r = 0.36 * shade;
        g = 0.008;
        b = 0.006;
        style = 1;
        break;
      case 'smear':
        r = 0.32 * shade;
        g = 0.01;
        b = 0.012;
        a *= 0.55;
        style = 2;
        break;
      case 'scorch':
        r = 0.05;
        g = 0.045;
        b = 0.045;
        a *= 0.75;
        style = 3;
        break;
      case 'soot':
        r = 0.16;
        g = 0.15;
        b = 0.15;
        a *= 0.35;
        style = 3;
        break;
    }
    const stretch = opts.stretch ?? 1;
    this.pending.push({
      x,
      z,
      sx: size * stretch,
      sy: size,
      angle: opts.angle ?? Math.random() * Math.PI * 2,
      r: r * a,
      g: g * a,
      b: b * a,
      a,
      seed: Math.random() * 100,
      style,
    });
  }

  /** A pool of blood that spreads under a body (several overlapping lobes). */
  pool(x: number, z: number, radius: number): void {
    const n = 3 + Math.floor(radius * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * radius * 0.55;
      this.splat('pool', x + Math.cos(a) * d, z + Math.sin(a) * d * 0.8, radius * (0.35 + Math.random() * 0.4));
    }
  }

  // ------------------------------------------------------------------ droplets
  /**
   * Spray droplets from a point. `dir` is the main direction in XZ (unit),
   * `speed` the main speed; `up` vertical speed range.
   */
  spray(
    p: { x: number; y: number; z: number },
    n: number,
    o: {
      dirX?: number;
      dirZ?: number;
      speed?: [number, number];
      up?: [number, number];
      spread?: number;
      size?: [number, number];
      /** Random sideways (depth) speed, m/s. */
      jitter?: number;
    } = {},
  ): void {
    n = Math.round(n * this.amount);
    const dirX = o.dirX ?? -1;
    const dirZ = o.dirZ ?? 0;
    const [s0, s1] = o.speed ?? [3, 10];
    const [u0, u1] = o.up ?? [-0.5, 3];
    const spread = o.spread ?? 0.35;
    const [z0, z1] = o.size ?? [0.03, 0.085];
    const jitter = o.jitter ?? 0.8;
    for (let i = 0; i < n; i++) {
      if (this.drops.length >= MAX_DROPS) this.drops.shift();
      const sp = s0 + Math.random() * (s1 - s0);
      const a = (Math.random() - 0.5) * 2 * spread;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const dx = dirX * c - dirZ * s;
      const dz = dirX * s + dirZ * c;
      this.drops.push({
        x: p.x,
        y: Math.max(0.02, p.y),
        z: p.z + (Math.random() - 0.5) * 0.08,
        vx: dx * sp,
        vy: u0 + Math.random() * (u1 - u0),
        vz: dz * sp * 0.6 + (Math.random() - 0.5) * 2 * jitter,
        size: z0 + Math.random() * (z1 - z0),
        shade: 0.75 + Math.random() * 0.5,
        life: 3,
      });
    }
  }

  update(dt: number): void {
    const g = this.gravity;
    let w = 0;
    const ad = this.aDrop.array as Float32Array;
    const av = this.aVel.array as Float32Array;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      d.vy -= g * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.life -= dt;
      if (d.y <= 0) {
        if (this.isOnFloe(d.x, d.z)) {
          const sp = Math.hypot(d.vx, d.vz);
          // Fast droplets smear into streaks along their travel (the original's
          // horizontal blood bands).
          const stretch = 1 + Math.min(2.8, sp * 0.16);
          this.splat('drop', d.x, d.z, d.size * (1.1 + Math.random() * 0.7), { angle: Math.atan2(d.vz, d.vx), stretch, shade: d.shade });
          this.onLand?.(d.x, d.z, d.size);
          continue;
        } else if (d.y < -4) continue;
      }
      if (d.life <= 0) continue;
      this.drops[w++] = d;
      const k = (w - 1) * 4;
      ad[k] = d.x;
      ad[k + 1] = d.y;
      ad[k + 2] = d.z;
      ad[k + 3] = d.size;
      av[k] = d.vx;
      av[k + 1] = d.vy;
      av[k + 2] = d.vz;
      av[k + 3] = d.shade;
    }
    this.drops.length = w;
    this.dropGeo.instanceCount = w;
    this.aDrop.needsUpdate = true;
    this.aVel.needsUpdate = true;
    this.aDrop.clearUpdateRanges();
    this.aVel.clearUpdateRanges();
    this.aDrop.addUpdateRange(0, w * 4);
    this.aVel.addUpdateRange(0, w * 4);
  }

  /** Paint pending splats into the decal map. Call before rendering the scene. */
  flush(): void {
    const r = this.renderer;
    if (!this.needsClear && this.pending.length === 0) return;
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.target);
    if (this.needsClear) {
      r.setClearColor(0x000000, 0);
      r.clear(true, false, false);
      this.needsClear = false;
    }
    const n = Math.min(this.pending.length, MAX_SPLATS_PER_FRAME);
    if (n > 0) {
      const rect = this.aRect.array as Float32Array;
      const col = this.aColor.array as Float32Array;
      const misc = this.aMisc.array as Float32Array;
      for (let i = 0; i < n; i++) {
        const s = this.pending[i];
        rect[i * 4] = s.x;
        rect[i * 4 + 1] = s.z;
        rect[i * 4 + 2] = s.sx;
        rect[i * 4 + 3] = s.sy;
        col[i * 4] = s.r;
        col[i * 4 + 1] = s.g;
        col[i * 4 + 2] = s.b;
        col[i * 4 + 3] = s.a;
        misc[i * 3] = s.angle;
        misc[i * 3 + 1] = s.seed;
        misc[i * 3 + 2] = s.style;
      }
      this.aRect.needsUpdate = this.aColor.needsUpdate = this.aMisc.needsUpdate = true;
      this.splatGeo.instanceCount = n;
      r.autoClear = false;
      r.render(this.paintScene, this.paintCam);
    }
    this.pending.length = 0;
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
    r.setClearColor(prevClear, prevAlpha);
  }

  get activeDrops(): number {
    return this.drops.length;
  }
}
