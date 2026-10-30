import * as THREE from 'three';

/**
 * Persistent floor stains rendered into a texture that the arena floor samples:
 *   R = blood film thickness, G = bullet marks / scuffs, B = melon juice.
 * Splats are instanced quads drawn with MAX blending, so redrawing a growing pool only extends it
 * and overlapping droplets never over-darken. Shapes are procedural: noisy rims, satellite
 * droplets and elongation along the impact direction (as in real spatter, the length/width ratio
 * of a stain is 1/sin(impact angle)).
 */

const MAX_SPLATS = 4096;

const vert = /* glsl */ `
attribute vec4 aSplat;   // x, z, radius, rotation
attribute vec4 aParams;  // elongation, kind (0 blood, 1 hole, 2 juice, 3 pool), seed, strength
varying vec2 vUv;
varying vec4 vParams;
uniform vec4 uRect; // centre x, centre z, half extents x, z
void main() {
  vParams = aParams;
  vUv = position.xy; // -1..1
  float c = cos(aSplat.w), s = sin(aSplat.w);
  vec2 p = position.xy * aSplat.z * 1.6;
  p.x *= aParams.x;
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  vec2 world = aSplat.xy + p;
  gl_Position = vec4((world - uRect.xy) / uRect.zw, 0.0, 1.0);
}`;

const frag = /* glsl */ `
varying vec2 vUv;
varying vec4 vParams;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n2(p); p *= 2.1; a *= 0.5; } return s; }
void main() {
  float kind = vParams.y;
  float seed = vParams.z;
  float strength = vParams.w;
  vec2 uv = vUv * 1.6;
  float r = length(uv);
  float ang = atan(uv.y, uv.x);
  float v = 0.0;
  if (kind < 0.5 || kind > 2.5) {
    // blood: irregular rim; pools are smoother and thicker in the middle
    bool pool = kind > 2.5;
    float rim = 1.0 + (pool ? 0.18 : 0.28) * (fbm(vec2(ang * 1.7 + seed * 10.0, seed * 3.0)) - 0.5) * 2.0;
    rim += pool ? 0.0 : 0.25 * pow(max(0.0, sin(ang * 7.0 + seed * 20.0)), 12.0); // scallops / spines
    float d = r / rim;
    v = (1.0 - smoothstep(0.86, 1.0, d)) * strength;
    if (pool) v *= 0.55 + 0.45 * (1.0 - smoothstep(0.0, 1.0, d));
    // satellite droplets around small splats
    if (!pool) {
      vec2 g = uv * 6.0 + seed * 17.0;
      vec2 cell = floor(g);
      vec2 f = fract(g) - 0.5;
      float rnd = h21(cell + seed);
      float sat = (rnd > 0.86 && r > 1.05 && r < 1.55) ? 1.0 - smoothstep(0.08, 0.16, length(f)) : 0.0;
      v = max(v, sat * strength * 0.8);
    }
    gl_FragColor = vec4(v, 0.0, 0.0, 1.0);
  } else if (kind < 1.5) {
    // bullet mark on concrete: dark pit, chipped grey ring
    float rim = 1.0 + 0.35 * (fbm(vec2(ang * 2.0 + seed * 9.0, seed)) - 0.5);
    float d = r / rim;
    v = (1.0 - smoothstep(0.25, 0.4, d)) + 0.45 * (1.0 - smoothstep(0.4, 1.0, d)) * fbm(uv * 8.0 + seed);
    gl_FragColor = vec4(0.0, v * strength, 0.0, 1.0);
  } else {
    float rim = 1.0 + 0.4 * (fbm(vec2(ang * 1.5 + seed * 7.0, seed)) - 0.5);
    v = (1.0 - smoothstep(0.8, 1.0, r / rim)) * strength;
    gl_FragColor = vec4(0.0, 0.0, v, 1.0);
  }
  if (v < 0.003) discard;
}`;

export class FloorDecals {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.half = opts.half ?? 7; // covered square half-size (m)
    this.size = opts.size ?? 2048;
    // covered area: a square of `half` round the origin, or opts.rect {minX, maxX, minZ, maxZ}
    // (texture `size` along x, proportionally fewer texels along z)
    const r = opts.rect || { minX: -this.half, maxX: this.half, minZ: -this.half, maxZ: this.half };
    this.rect = { ...r };
    const sx = this.size, sz = Math.max(64, Math.round((this.size * (r.maxZ - r.minZ)) / (r.maxX - r.minX)));
    this.texSize = [sx, sz];
    this.target = new THREE.WebGLRenderTarget(sx, sz, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    const quad = new THREE.PlaneGeometry(2, 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.attributes.position = quad.attributes.position;
    this.aSplat = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPLATS * 4), 4);
    this.aParams = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPLATS * 4), 4);
    this.aSplat.setUsage(THREE.DynamicDrawUsage);
    this.aParams.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSplat', this.aSplat);
    geo.setAttribute('aParams', this.aParams);
    geo.instanceCount = 0;
    this.geo = geo;
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uRect: { value: new THREE.Vector4((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, (r.maxX - r.minX) / 2, (r.maxZ - r.minZ) / 2) } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.count = 0;
    this.pools = []; // persistent growing pools {x, z, vol, seed, radius}
    this.clear();
  }

  clear() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.setRenderTarget(prev);
    this.pools.length = 0;
    this.count = 0;
  }

  inside(x, z) {
    const r = this.rect;
    return x > r.minX + 0.05 && x < r.maxX - 0.05 && z > r.minZ + 0.05 && z < r.maxZ - 0.05;
  }

  /** Uniform for floor shaders: (centre x, centre z, half x, half z) of the covered area. */
  get rectUniform() {
    return this.material.uniforms.uRect.value;
  }

  /**
   * Queue a splat. kind: 0 blood, 1 bullet mark, 2 juice, 3 pool. elong >= 1 stretches it along
   * `rot` (radians in the xz plane).
   */
  splat(x, z, radius, kind = 0, strength = 0.6, elong = 1, rot = 0, seed = Math.random()) {
    if (!this.inside(x, z) || this.count >= MAX_SPLATS) return;
    const i = this.count++;
    this.aSplat.array.set([x, z, radius, rot], i * 4);
    this.aParams.array.set([elong, kind, seed, strength], i * 4);
  }

  /** Add blood volume (mL) to the floor at x,z: merges into a nearby pool or starts one. */
  addPoolVolume(x, z, ml) {
    if (!this.inside(x, z)) return;
    let best = null, bd = Infinity;
    for (const p of this.pools) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < Math.max(0.08, p.radius * 0.8) && d < bd) {
        bd = d;
        best = p;
      }
    }
    if (!best) {
      best = { x, z, vol: 0, seed: Math.random(), radius: 0, drawn: 0 };
      this.pools.push(best);
    } else {
      // the pool's centre drifts toward where blood keeps arriving
      const w = ml / (best.vol + ml);
      best.x += (x - best.x) * w;
      best.z += (z - best.z) * w;
    }
    best.vol += ml;
    // film ~2.5 mm thick on smooth concrete
    best.radius = Math.min(1.4, Math.sqrt((best.vol * 1e-6) / (Math.PI * 0.0025)));
  }

  /** Render queued splats and grown pools into the floor texture. */
  flush() {
    for (const p of this.pools) {
      if (p.radius - p.drawn > 0.004 && p.radius > 0.012) {
        this.splat(p.x, p.z, p.radius, 3, Math.min(1, 0.55 + p.vol / 900), 1, p.seed * 6.28, p.seed);
        p.drawn = p.radius;
      }
    }
    if (!this.count) return;
    this.aSplat.needsUpdate = true;
    this.aParams.needsUpdate = true;
    this.aSplat.addUpdateRange(0, this.count * 4);
    this.aParams.addUpdateRange(0, this.count * 4);
    this.geo.instanceCount = this.count;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const ac = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(this.target);
    r.render(this.scene, this.camera);
    r.setRenderTarget(prev);
    r.autoClear = ac;
    this.count = 0;
    this.geo.instanceCount = 0;
  }
}
