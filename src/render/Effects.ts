// Particles, beams (tracers, laser), ground rings and flash lights.
// Everything is pooled and drawn with a handful of instanced draw calls.
import * as THREE from 'three';
import { REFLECT_LAYER } from './Stage';

// ---------------------------------------------------------------- texture atlas
export const enum Frame {
  Dot = 0,
  Smoke = 1,
  Fire = 2,
  Spark = 3,
  Star = 4,
  Ring = 5,
  Mist = 6,
  Flake = 7,
}

function makeAtlas(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S * 4;
  const g = c.getContext('2d')!;
  const cell = (i: number) => [(i % 4) * S, Math.floor(i / 4) * S] as const;
  const radial = (x: number, y: number, r: number, stops: Array<[number, string]>) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // 0 dot
  {
    const [x, y] = cell(0);
    radial(x + S / 2, y + S / 2, S / 2, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
  }
  // 1 smoke: clustered soft blobs
  {
    const [x, y] = cell(1);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * S * 0.22;
      radial(x + S / 2 + Math.cos(a) * d, y + S / 2 + Math.sin(a) * d, S * (0.14 + rnd() * 0.16), [
        [0, 'rgba(255,255,255,0.32)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
    }
  }
  // 2 fire: hot core + lumpy edge
  {
    const [x, y] = cell(2);
    for (let i = 0; i < 18; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * S * 0.2;
      radial(x + S / 2 + Math.cos(a) * d, y + S / 2 + Math.sin(a) * d, S * (0.16 + rnd() * 0.14), [
        [0, 'rgba(255,255,255,0.55)'],
        [0.6, 'rgba(255,255,255,0.25)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
    }
  }
  // 3 spark: horizontal streak
  {
    const [x, y] = cell(3);
    const gr = g.createLinearGradient(x, 0, x + S, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.7, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0.2)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x + S / 2, y + S / 2, S / 2, S * 0.08, 0, 0, Math.PI * 2);
    g.fill();
  }
  // 4 star: muzzle flash with spikes
  {
    const [x, y] = cell(4);
    const cx = x + S / 2;
    const cy = y + S / 2;
    g.save();
    g.translate(cx, cy);
    const spikes = 7;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2 + rnd() * 0.3;
      const len = S * (0.3 + rnd() * 0.2);
      const gr = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = gr;
      g.lineWidth = S * 0.07;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      g.stroke();
    }
    g.restore();
    radial(cx, cy, S * 0.22, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
  }
  // 5 ring
  {
    const [x, y] = cell(5);
    radial(x + S / 2, y + S / 2, S / 2, [
      [0, 'rgba(255,255,255,0)'],
      [0.72, 'rgba(255,255,255,0)'],
      [0.86, 'rgba(255,255,255,0.9)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
  }
  // 6 mist (blood puff): irregular soft
  {
    const [x, y] = cell(6);
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * S * 0.25;
      radial(x + S / 2 + Math.cos(a) * d, y + S / 2 + Math.sin(a) * d, S * (0.08 + rnd() * 0.12), [
        [0, 'rgba(255,255,255,0.6)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
    }
  }
  // 7 flake / chip (hard-edged small polygon)
  {
    const [x, y] = cell(7);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = S * (0.28 + rnd() * 0.18);
      const px = x + S / 2 + Math.cos(a) * r;
      const py = y + S / 2 + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- particles
interface P {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  g: number;
  drag: number;
  life: number;
  max: number;
  s0: number;
  s1: number;
  rot: number;
  vr: number;
  c0: THREE.Color;
  c1: THREE.Color;
  a0: number;
  a1: number;
  frame: number;
  /** >0: streak aligned to velocity with this length factor. */
  streak: number;
  /** Stops on the ice (y=0). */
  ground: boolean;
}

export interface EmitOpts {
  vel?: [number, number, number];
  g?: number;
  drag?: number;
  life?: number;
  size?: [number, number];
  rot?: number;
  vr?: number;
  color?: THREE.ColorRepresentation;
  color1?: THREE.ColorRepresentation;
  alpha?: [number, number];
  frame?: Frame;
  streak?: number;
  ground?: boolean;
}

const partVert = /* glsl */ `
  attribute vec4 aPos;   // xyz size
  attribute vec4 aCol;   // rgb alpha
  attribute vec4 aMisc;  // rot frame streak -
  attribute vec3 aVel;
  varying vec2 vUv;
  varying vec4 vCol;
  void main() {
    vec4 mv = modelViewMatrix * vec4(aPos.xyz, 1.0);
    vec2 corner = position.xy;
    float size = aPos.w;
    vec2 off;
    if (aMisc.z > 0.0) {
      vec3 vv = mat3(modelViewMatrix) * aVel;
      vec2 d = length(vv.xy) > 1e-4 ? normalize(vv.xy) : vec2(1.0, 0.0);
      vec2 n = vec2(-d.y, d.x);
      float len = size * (1.0 + aMisc.z * length(aVel) * 0.05);
      off = d * corner.x * len + n * corner.y * size * 0.35;
    } else {
      float c = cos(aMisc.x), s = sin(aMisc.x);
      off = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * size;
    }
    mv.xy += off;
    gl_Position = projectionMatrix * mv;
    float f = aMisc.y;
    vec2 cell = vec2(mod(f, 4.0), floor(f / 4.0));
    vUv = (cell + (corner * 0.5 + 0.5)) / 4.0;
    vUv.y = 1.0 - vUv.y;
    vCol = aCol;
  }
`;

const partFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uAdditive;
  varying vec2 vUv;
  varying vec4 vCol;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * vCol.a;
    if (a < 0.003) discard;
    vec3 c = vCol.rgb * mix(1.0, t.r, 0.4);
    if (uAdditive > 0.5) gl_FragColor = vec4(c * a, a);
    else gl_FragColor = vec4(c, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

class ParticleLayer {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private aPos: THREE.InstancedBufferAttribute;
  private aCol: THREE.InstancedBufferAttribute;
  private aMisc: THREE.InstancedBufferAttribute;
  private aVel: THREE.InstancedBufferAttribute;
  readonly list: P[] = [];

  constructor(private max: number, map: THREE.Texture, additive: boolean) {
    const quad = new THREE.PlaneGeometry(2, 2);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    const mk = (n: number) => new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
    this.aPos = mk(4);
    this.aCol = mk(4);
    this.aMisc = mk(4);
    this.aVel = mk(3);
    this.geo.setAttribute('aPos', this.aPos);
    this.geo.setAttribute('aCol', this.aCol);
    this.geo.setAttribute('aMisc', this.aMisc);
    this.geo.setAttribute('aVel', this.aVel);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: partVert,
      fragmentShader: partFrag,
      uniforms: { uMap: { value: map }, uAdditive: { value: additive ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 10;
    this.mesh.layers.enable(REFLECT_LAYER);
  }

  add(p: P): void {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push(p);
  }

  update(dt: number): void {
    const pos = this.aPos.array as Float32Array;
    const col = this.aCol.array as Float32Array;
    const misc = this.aMisc.array as Float32Array;
    const vel = this.aVel.array as Float32Array;
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k - p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.ground && p.y < 0.01) {
        p.y = 0.01;
        p.vy = Math.abs(p.vy) * 0.2;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      p.rot += p.vr * dt;
      this.list[w++] = p;
      const t = 1 - p.life / p.max;
      const j = (w - 1) * 4;
      pos[j] = p.x;
      pos[j + 1] = p.y;
      pos[j + 2] = p.z;
      pos[j + 3] = p.s0 + (p.s1 - p.s0) * t;
      col[j] = p.c0.r + (p.c1.r - p.c0.r) * t;
      col[j + 1] = p.c0.g + (p.c1.g - p.c0.g) * t;
      col[j + 2] = p.c0.b + (p.c1.b - p.c0.b) * t;
      col[j + 3] = p.a0 + (p.a1 - p.a0) * t;
      misc[j] = p.rot;
      misc[j + 1] = p.frame;
      misc[j + 2] = p.streak;
      const v = (w - 1) * 3;
      vel[v] = p.vx;
      vel[v + 1] = p.vy;
      vel[v + 2] = p.vz;
    }
    this.list.length = w;
    this.geo.instanceCount = w;
    for (const a of [this.aPos, this.aCol, this.aMisc, this.aVel]) {
      a.needsUpdate = true;
      a.clearUpdateRanges();
      a.addUpdateRange(0, w * a.itemSize);
    }
  }
}

// ---------------------------------------------------------------- beams
interface Beam {
  a: THREE.Vector3;
  b: THREE.Vector3;
  width: number;
  color: THREE.Color;
  alpha: number;
  life: number;
  max: number;
  /** Drawn for exactly one frame (per-frame beams such as a laser sight). */
  once?: boolean;
  drawn?: boolean;
}

const beamVert = /* glsl */ `
  attribute vec3 aA;
  attribute vec3 aB;
  attribute vec4 aCol;
  attribute float aW;
  varying vec4 vCol;
  varying float vAcross;
  void main() {
    vec4 a = modelViewMatrix * vec4(aA, 1.0);
    vec4 b = modelViewMatrix * vec4(aB, 1.0);
    vec2 d = b.xy - a.xy;
    d = length(d) > 1e-5 ? normalize(d) : vec2(1.0, 0.0);
    vec2 n = vec2(-d.y, d.x);
    vec4 p = mix(a, b, position.x);
    p.xy += n * position.y * aW;
    gl_Position = projectionMatrix * p;
    vCol = aCol;
    vAcross = position.y;
  }
`;
const beamFrag = /* glsl */ `
  varying vec4 vCol;
  varying float vAcross;
  void main() {
    float a = vCol.a * (1.0 - abs(vAcross));
    gl_FragColor = vec4(vCol.rgb * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

class BeamLayer {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private aA: THREE.InstancedBufferAttribute;
  private aB: THREE.InstancedBufferAttribute;
  private aCol: THREE.InstancedBufferAttribute;
  private aW: THREE.InstancedBufferAttribute;
  readonly list: Beam[] = [];
  /** `additive` glows (tracers); otherwise normal (premultiplied) blending, visible on bright ice. */
  constructor(private max: number, additive = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = g.index;
    this.geo.setAttribute('position', g.getAttribute('position'));
    const mk = (n: number) => new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
    this.aA = mk(3);
    this.aB = mk(3);
    this.aCol = mk(4);
    this.aW = mk(1);
    this.geo.setAttribute('aA', this.aA);
    this.geo.setAttribute('aB', this.aB);
    this.geo.setAttribute('aCol', this.aCol);
    this.geo.setAttribute('aW', this.aW);
    this.geo.instanceCount = 0;
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.ShaderMaterial({
        vertexShader: beamVert,
        fragmentShader: beamFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 30 : 29;
  }
  add(b: Beam): void {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push(b);
  }
  update(dt: number): void {
    let w = 0;
    const A = this.aA.array as Float32Array;
    const B = this.aB.array as Float32Array;
    const C = this.aCol.array as Float32Array;
    const W = this.aW.array as Float32Array;
    for (let i = 0; i < this.list.length; i++) {
      const b = this.list[i];
      if (b.once) {
        if (b.drawn) continue;
        b.drawn = true;
      } else {
        b.life -= dt;
        if (b.life <= 0) continue;
      }
      this.list[w++] = b;
      const k = w - 1;
      A[k * 3] = b.a.x;
      A[k * 3 + 1] = b.a.y;
      A[k * 3 + 2] = b.a.z;
      B[k * 3] = b.b.x;
      B[k * 3 + 1] = b.b.y;
      B[k * 3 + 2] = b.b.z;
      const f = b.max > 0 ? Math.min(1, b.life / b.max) : 1;
      C[k * 4] = b.color.r;
      C[k * 4 + 1] = b.color.g;
      C[k * 4 + 2] = b.color.b;
      C[k * 4 + 3] = b.alpha * f;
      W[k] = b.width;
    }
    this.list.length = w;
    this.geo.instanceCount = w;
    for (const a of [this.aA, this.aB, this.aCol, this.aW]) {
      a.needsUpdate = true;
      a.clearUpdateRanges();
      a.addUpdateRange(0, w * a.itemSize);
    }
  }
}

// ---------------------------------------------------------------- ground rings
interface Ring {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  r0: number;
  r1: number;
  a0: number;
}

// ---------------------------------------------------------------- effects facade
const _c = new THREE.Color();

export class Effects {
  readonly atlas = makeAtlas();
  readonly add: ParticleLayer;
  readonly norm: ParticleLayer;
  readonly beams: BeamLayer;
  /** Normal-blended beams (laser sight cores). */
  readonly solidBeams: BeamLayer;
  private rings: Ring[] = [];
  private ringPool: THREE.Mesh[] = [];
  private lights: Array<{ light: THREE.PointLight; life: number; max: number; peak: number }> = [];
  /** Particle density multiplier (quality). */
  density = 1;

  constructor(private scene: THREE.Scene, lightCount = 3) {
    this.add = new ParticleLayer(5000, this.atlas, true);
    this.norm = new ParticleLayer(4000, this.atlas, false);
    this.beams = new BeamLayer(400);
    this.solidBeams = new BeamLayer(32, false);
    scene.add(this.norm.mesh, this.add.mesh, this.beams.mesh, this.solidBeams.mesh);
    for (let i = 0; i < lightCount; i++) {
      const l = new THREE.PointLight(0xffc070, 0, 9, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push({ light: l, life: 0, max: 1, peak: 0 });
    }
  }

  emit(additive: boolean, x: number, y: number, z: number, o: EmitOpts = {}): void {
    const life = o.life ?? 0.5;
    const c0 = new THREE.Color(o.color ?? 0xffffff);
    const p: P = {
      x,
      y,
      z,
      vx: o.vel?.[0] ?? 0,
      vy: o.vel?.[1] ?? 0,
      vz: o.vel?.[2] ?? 0,
      g: o.g ?? 0,
      drag: o.drag ?? 0,
      life,
      max: life,
      s0: o.size?.[0] ?? 0.2,
      s1: o.size?.[1] ?? o.size?.[0] ?? 0.2,
      rot: o.rot ?? Math.random() * Math.PI * 2,
      vr: o.vr ?? 0,
      c0,
      c1: o.color1 !== undefined ? new THREE.Color(o.color1) : c0,
      a0: o.alpha?.[0] ?? 1,
      a1: o.alpha?.[1] ?? 0,
      frame: o.frame ?? Frame.Dot,
      streak: o.streak ?? 0,
      ground: o.ground ?? false,
    };
    (additive ? this.add : this.norm).add(p);
  }

  beam(a: THREE.Vector3, b: THREE.Vector3, width: number, color: THREE.ColorRepresentation, alpha: number, life: number): void {
    this.beams.add({ a: a.clone(), b: b.clone(), width, color: new THREE.Color(color), alpha, life, max: life });
  }

  /** A beam drawn for this frame only (re-add it every frame to keep it visible). */
  beamFrame(a: THREE.Vector3, b: THREE.Vector3, width: number, color: THREE.ColorRepresentation, alpha: number, solid = false): void {
    (solid ? this.solidBeams : this.beams).add({ a: a.clone(), b: b.clone(), width, color: new THREE.Color(color), alpha, life: 1, max: 0, once: true });
  }

  flash(x: number, y: number, z: number, color: THREE.ColorRepresentation, intensity: number, life: number, distance = 9): void {
    let slot = this.lights[0];
    for (const l of this.lights) if (l.life <= 0 || l.life / l.max < slot.life / slot.max) slot = l;
    slot.light.position.set(x, y, z);
    slot.light.color.set(color);
    slot.light.distance = distance;
    slot.life = slot.max = life;
    slot.peak = intensity;
    slot.light.intensity = intensity;
  }

  ring(x: number, y: number, z: number, r0: number, r1: number, life: number, color: THREE.ColorRepresentation, alpha: number): void {
    let mesh = this.ringPool.pop();
    if (!mesh) {
      const m = new THREE.MeshBasicMaterial({
        map: this.atlas,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        // additive: first-person fog would add a haze-coloured quad wherever alpha > 0
        fog: false,
      });
      const g = new THREE.PlaneGeometry(2, 2);
      // Use the ring cell of the atlas.
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (1 + uv.getX(i)) / 4, 1 - (1 + (1 - uv.getY(i))) / 4);
      mesh = new THREE.Mesh(g, m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 5;
    }
    mesh.position.set(x, y, z);
    (mesh.material as THREE.MeshBasicMaterial).color.set(color);
    this.scene.add(mesh);
    this.rings.push({ mesh, life, max: life, r0, r1, a0: alpha });
  }

  // ------------------------------------------------------------ presets
  muzzle(p: THREE.Vector3, kind: 'small' | 'big' | 'shotgun', dirX = -1): void {
    const size = kind === 'small' ? 0.2 : kind === 'big' ? 0.32 : 0.42;
    this.emit(true, p.x + dirX * size * 0.4, p.y, p.z, {
      size: [size, size * 1.25],
      life: 0.06,
      color: 0xfff0b0,
      color1: 0xff9a30,
      alpha: [1, 0.2],
      frame: Frame.Star,
    });
    this.emit(true, p.x + dirX * size * 0.9, p.y, p.z, {
      size: [size * 0.7, size * 0.3],
      life: 0.05,
      color: 0xffd080,
      alpha: [0.9, 0],
      frame: Frame.Spark,
      streak: 0.0001,
      vel: [dirX * 30, 0, 0],
    });
    this.emit(false, p.x + dirX * 0.15, p.y + 0.02, p.z, {
      vel: [dirX * 0.8 + (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3],
      drag: 2,
      size: [size * 0.4, size * 1.6],
      life: 0.6 + Math.random() * 0.4,
      color: 0xd8d8d8,
      alpha: [0.28, 0],
      frame: Frame.Smoke,
      vr: (Math.random() - 0.5) * 2,
    });
    this.flash(p.x + dirX * 0.3, p.y + 0.1, p.z + 0.4, 0xffc070, kind === 'small' ? 6 : kind === 'big' ? 10 : 14, 0.06, 7);
  }

  bloodPuff(p: { x: number; y: number; z: number }, dirX: number, strength: number): void {
    const n = Math.max(1, Math.round(1 + strength * 2));
    for (let i = 0; i < n; i++) {
      this.emit(false, p.x, p.y, p.z, {
        vel: [dirX * (0.5 + Math.random() * 1.6), Math.random() * 0.6, (Math.random() - 0.5) * 0.6],
        drag: 4,
        size: [0.08 + strength * 0.05, 0.25 + strength * 0.2],
        life: 0.25 + Math.random() * 0.2,
        color: 0x8a0606,
        color1: 0x5a0303,
        alpha: [0.85, 0],
        frame: Frame.Mist,
      });
    }
  }

  sparks(p: { x: number; y: number; z: number }, n: number, dirX = 1, speed = 7): void {
    n = Math.round(n * this.density);
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * 2.2;
      this.emit(true, p.x, p.y, p.z, {
        vel: [dirX * Math.cos(a) * speed * (0.4 + Math.random()), Math.abs(Math.sin(a)) * speed * 0.8 + 1, (Math.random() - 0.5) * speed * 0.6],
        g: 14,
        drag: 1.5,
        size: [0.035, 0.02],
        life: 0.18 + Math.random() * 0.25,
        color: 0xfff2b0,
        color1: 0xff7a20,
        alpha: [1, 0.2],
        frame: Frame.Spark,
        streak: 1.2,
        ground: true,
      });
    }
    this.emit(true, p.x, p.y, p.z, { size: [0.18, 0.05], life: 0.05, color: 0xfff4c0, alpha: [0.9, 0], frame: Frame.Star });
  }

  snowPuff(p: { x: number; y: number; z: number }, n: number, size = 0.25, spread = 1): void {
    n = Math.max(1, Math.round(n * this.density));
    for (let i = 0; i < n; i++) {
      this.emit(false, p.x + (Math.random() - 0.5) * 0.3 * spread, p.y + 0.05, p.z + (Math.random() - 0.5) * 0.3 * spread, {
        vel: [(Math.random() - 0.5) * 2 * spread, 0.3 + Math.random() * 1.2, (Math.random() - 0.5) * 2 * spread],
        drag: 3,
        g: 0.6,
        size: [size * 0.5, size * 1.6],
        life: 0.5 + Math.random() * 0.6,
        color: 0xf4f8ff,
        alpha: [0.55, 0],
        frame: Frame.Smoke,
        vr: (Math.random() - 0.5),
      });
    }
  }

  splash(p: { x: number; y: number; z: number }, size: number): void {
    const n = Math.round((6 + size * 14) * this.density);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.8 + Math.random() * 2.5 * size;
      this.emit(false, p.x, p.y, p.z, {
        vel: [Math.cos(a) * s, 2 + Math.random() * 4 * size, Math.sin(a) * s],
        g: 16,
        size: [0.06 + size * 0.05, 0.03],
        life: 0.5 + Math.random() * 0.3,
        color: 0xe8f2ff,
        alpha: [0.9, 0.2],
        frame: Frame.Dot,
      });
    }
    this.ring(p.x, p.y + 0.02, p.z, 0.2, 1 + size * 1.6, 0.9, 0xa8c0d8, 0.6);
  }

  explosion(p: { x: number; y: number; z: number }, radius: number): void {
    const d = this.density;
    this.flash(p.x, p.y + 1.2, p.z + 0.5, 0xffa040, 90, 0.35, 22);
    // fireball
    for (let i = 0; i < Math.round(14 * d); i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.25;
      this.emit(true, p.x + Math.cos(a) * r, p.y + 0.3 + Math.random() * 0.6, p.z + Math.sin(a) * r * 0.7, {
        vel: [Math.cos(a) * 3 * Math.random(), 1.5 + Math.random() * 3, Math.sin(a) * 2 * Math.random()],
        drag: 3,
        size: [0.4 + Math.random() * 0.4, radius * (0.35 + Math.random() * 0.25)],
        life: 0.35 + Math.random() * 0.35,
        color: 0xfff0a0,
        color1: 0xc02a08,
        alpha: [1, 0],
        frame: Frame.Fire,
        vr: (Math.random() - 0.5) * 3,
      });
    }
    this.emit(true, p.x, p.y + 0.6, p.z, { size: [radius * 0.5, radius * 0.9], life: 0.12, color: 0xffffe0, alpha: [1, 0], frame: Frame.Dot });
    // smoke
    for (let i = 0; i < Math.round(12 * d); i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.3;
      this.emit(false, p.x + Math.cos(a) * r, p.y + 0.5 + Math.random(), p.z + Math.sin(a) * r * 0.7, {
        vel: [Math.cos(a) * 1.5, 1.2 + Math.random() * 1.8, Math.sin(a) * 1.0],
        drag: 1.2,
        size: [0.8, radius * (0.6 + Math.random() * 0.4)],
        life: 1.6 + Math.random() * 1.6,
        color: 0x3a3532,
        color1: 0x9a9a9e,
        alpha: [0.75, 0],
        frame: Frame.Smoke,
        vr: (Math.random() - 0.5) * 0.8,
      });
    }
    // embers
    for (let i = 0; i < Math.round(26 * d); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 5 + Math.random() * 10;
      this.emit(true, p.x, p.y + 0.4, p.z, {
        vel: [Math.cos(a) * s, 3 + Math.random() * 8, Math.sin(a) * s * 0.7],
        g: 16,
        drag: 0.8,
        size: [0.05, 0.03],
        life: 0.5 + Math.random() * 0.6,
        color: 0xffe080,
        color1: 0xff5010,
        alpha: [1, 0.2],
        frame: Frame.Spark,
        streak: 1.5,
        ground: true,
      });
    }
    // ice chips and snow dust
    for (let i = 0; i < Math.round(22 * d); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 6;
      this.emit(false, p.x, p.y + 0.2, p.z, {
        vel: [Math.cos(a) * s, 3 + Math.random() * 7, Math.sin(a) * s * 0.7],
        g: 18,
        size: [0.06 + Math.random() * 0.08, 0.05],
        life: 0.8 + Math.random() * 0.6,
        color: 0xeef6ff,
        color1: 0xc8d8ea,
        alpha: [1, 0.6],
        frame: Frame.Flake,
        vr: (Math.random() - 0.5) * 16,
        ground: true,
      });
    }
    for (let i = 0; i < Math.round(14 * d); i++) {
      const a = (i / 14) * Math.PI * 2;
      this.emit(false, p.x + Math.cos(a) * 0.4, 0.15, p.z + Math.sin(a) * 0.3, {
        vel: [Math.cos(a) * 7, 0.4, Math.sin(a) * 5],
        drag: 3.2,
        size: [0.4, 1.4],
        life: 0.8 + Math.random() * 0.5,
        color: 0xf2f6fa,
        alpha: [0.6, 0],
        frame: Frame.Smoke,
      });
    }
    this.ring(p.x, 0.03, p.z, 0.3, radius * 1.3, 0.28, 0xffd8a0, 0.7);
  }

  update(dt: number): void {
    this.add.update(dt);
    this.norm.update(dt);
    this.beams.update(dt);
    this.solidBeams.update(dt);
    for (const l of this.lights) {
      if (l.life > 0) {
        l.life -= dt;
        const t = Math.max(0, l.life / l.max);
        l.light.intensity = l.peak * t * t;
      } else l.light.intensity = 0;
    }
    let w = 0;
    for (const r of this.rings) {
      r.life -= dt;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        this.ringPool.push(r.mesh);
        continue;
      }
      const t = 1 - r.life / r.max;
      const s = r.r0 + (r.r1 - r.r0) * (1 - (1 - t) * (1 - t));
      r.mesh.scale.set(s, s, s);
      const m = r.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = r.a0 * (1 - t);
      this.rings[w++] = r;
    }
    this.rings.length = w;
    _c.set(0);
  }

  clear(): void {
    this.add.list.length = 0;
    this.norm.list.length = 0;
    this.beams.list.length = 0;
    this.solidBeams.list.length = 0;
  }
}
