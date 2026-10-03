// GPU-instanced billboard particles with a procedural sprite atlas.
// One draw call per blending mode. Simulation runs on the CPU (cheap for a few thousand).

import * as THREE from 'three';

export const enum Sprite {
  Soft = 0,
  Puff = 1,
  Star = 2,
  Heart = 3,
  Drop = 4,
  Bubble = 5,
  Flame = 6,
  Flake = 7,
  Dot = 8,
  Note = 9,
  Wisp = 10,
  Crumb = 11,
  Ring = 12,
  Spark = 13,
  Sweat = 14,
  Swirl = 15,
}

function drawAtlas(): HTMLCanvasElement {
  const N = 4, C = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N * C;
  const ctx = c.getContext('2d')!;
  const cell = (i: number, fn: (cx: number, cy: number) => void) => {
    const x = (i % N) * C, y = Math.floor(i / N) * C;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, C, C);
    ctx.clip();
    fn(x + C / 2, y + C / 2);
    ctx.restore();
  };
  const radial = (cx: number, cy: number, r: number, stops: [number, string][]) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // 0 soft
  cell(0, (cx, cy) => radial(cx, cy, 60, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]));
  // 1 puff (cloudy)
  cell(1, (cx, cy) => {
    const blobs = [[0, 0, 34], [-20, 8, 26], [22, 6, 26], [-6, -18, 24], [12, 20, 22], [-22, -12, 18]];
    for (const [dx, dy, r] of blobs) radial(cx + dx, cy + dy, r * 1.25, [[0, 'rgba(255,255,255,0.75)'], [0.6, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
  });
  // 2 star (4-point sparkle)
  cell(2, (cx, cy) => {
    radial(cx, cy, 40, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? 60 : 9;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  });
  // 3 heart
  cell(3, (cx, cy) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    const s = 2.6;
    ctx.moveTo(cx, cy + 20 * s * 0.9);
    ctx.bezierCurveTo(cx - 34 * s * 0.6, cy - 2, cx - 26 * s * 0.6, cy - 30 * s * 0.6, cx, cy - 12 * s * 0.6);
    ctx.bezierCurveTo(cx + 26 * s * 0.6, cy - 30 * s * 0.6, cx + 34 * s * 0.6, cy - 2, cx, cy + 20 * s * 0.9);
    ctx.fill();
  });
  // 4 drop
  cell(4, (cx, cy) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 46);
    ctx.bezierCurveTo(cx + 30, cy - 4, cx + 30, cy + 40, cx, cy + 40);
    ctx.bezierCurveTo(cx - 30, cy + 40, cx - 30, cy - 4, cx, cy - 46);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.0)';
  });
  // 5 bubble
  cell(5, (cx, cy) => {
    radial(cx, cy, 52, [[0, 'rgba(255,255,255,0.08)'], [0.78, 'rgba(255,255,255,0.18)'], [0.9, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);
    radial(cx - 16, cy - 16, 12, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
  });
  // 6 flame
  cell(6, (cx, cy) => {
    const g = ctx.createRadialGradient(cx, cy + 20, 4, cx, cy + 10, 56);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 58);
    ctx.bezierCurveTo(cx + 40, cy - 10, cx + 36, cy + 44, cx, cy + 46);
    ctx.bezierCurveTo(cx - 36, cy + 44, cx - 40, cy - 10, cx, cy - 58);
    ctx.fill();
  });
  // 7 snowflake
  cell(7, (cx, cy) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * 50, cy + Math.sin(a) * 50);
      ctx.stroke();
      const bx = cx + Math.cos(a) * 30, by = cy + Math.sin(a) * 30;
      for (const d of [-0.6, 0.6]) {
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(a + d) * 14, by + Math.sin(a + d) * 14);
        ctx.stroke();
      }
    }
  });
  // 8 dot
  cell(8, (cx, cy) => radial(cx, cy, 46, [[0, 'rgba(255,255,255,1)'], [0.8, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]));
  // 9 music note
  cell(9, (cx, cy) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(cx - 14, cy + 28, 18, 13, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx + 1, cy - 44, 8, 74);
    ctx.beginPath();
    ctx.moveTo(cx + 9, cy - 44);
    ctx.quadraticCurveTo(cx + 40, cy - 30, cx + 30, cy - 6);
    ctx.quadraticCurveTo(cx + 30, cy - 24, cx + 9, cy - 26);
    ctx.fill();
  });
  // 10 wisp (vertical soft)
  cell(10, (cx, cy) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(0.45, 1);
    radial(0, 0, 60, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);
    ctx.restore();
  });
  // 11 crumb (irregular blob)
  cell(11, (cx, cy) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = 30 + ((i * 37) % 17);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  });
  // 12 ring
  cell(12, (cx, cy) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(cx, cy, 46, 0, Math.PI * 2);
    ctx.stroke();
  });
  // 13 spark (streak)
  cell(13, (cx, cy) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(0.18, 1);
    radial(0, 0, 60, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
    ctx.restore();
  });
  // 14 sweat drop (outlined)
  cell(14, (cx, cy) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 44);
    ctx.bezierCurveTo(cx + 28, cy, cx + 26, cy + 36, cx, cy + 36);
    ctx.bezierCurveTo(cx - 26, cy + 36, cx - 28, cy, cx, cy - 44);
    ctx.fill();
  });
  // 15 swirl
  cell(15, (cx, cy) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 80; i++) {
      const t = i / 80;
      const a = t * Math.PI * 4;
      const r = 6 + t * 44;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.stroke();
  });
  return c;
}

let atlasTex: THREE.Texture | null = null;
function atlas(): THREE.Texture {
  if (!atlasTex) {
    atlasTex = new THREE.CanvasTexture(drawAtlas());
    atlasTex.colorSpace = THREE.SRGBColorSpace;
    atlasTex.generateMipmaps = true;
    atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
  }
  return atlasTex;
}

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iColor;
attribute vec3 iMisc; // size, rotation, sprite index
attribute float iStretch; // vertical stretch for streaks
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 mv = viewMatrix * vec4( iPos, 1.0 );
  float c = cos( iMisc.y ), s = sin( iMisc.y );
  vec2 p = position.xy * vec2( 1.0, iStretch );
  vec2 q = vec2( p.x * c - p.y * s, p.x * s + p.y * c ) * iMisc.x;
  mv.xy += q;
  gl_Position = projectionMatrix * mv;
  float idx = iMisc.z;
  vec2 cell = vec2( mod( idx, 4.0 ), 3.0 - floor( idx / 4.0 ) );
  vUv = ( cell + uv ) / 4.0;
  vColor = iColor;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D atlas;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 t = texture2D( atlas, vUv );
  float a = t.a * vColor.a;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( vColor.rgb * t.rgb, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface ParticleSpec {
  pos: THREE.Vector3;
  vel?: THREE.Vector3;
  /** Acceleration (gravity / buoyancy), m/s^2. */
  acc?: THREE.Vector3;
  drag?: number;
  life: number;
  size: number;
  sizeEnd?: number;
  color: THREE.Color | string;
  colorEnd?: THREE.Color | string;
  alpha?: number;
  /** Fade in fraction of life (0..1). */
  fadeIn?: number;
  sprite: Sprite;
  rot?: number;
  spin?: number;
  stretch?: number;
  /** Wiggle sideways (steam), m/s amplitude. */
  wiggle?: number;
}

interface P {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  acc: THREE.Vector3;
  drag: number;
  age: number;
  life: number;
  size0: number;
  size1: number;
  c0: THREE.Color;
  c1: THREE.Color;
  alpha: number;
  fadeIn: number;
  sprite: number;
  rot: number;
  spin: number;
  stretch: number;
  wiggle: number;
  seed: number;
}

class ParticleLayer {
  readonly mesh: THREE.Mesh;
  private readonly max: number;
  private parts: P[] = [];
  private pool: P[] = [];
  private aPos: THREE.InstancedBufferAttribute;
  private aColor: THREE.InstancedBufferAttribute;
  private aMisc: THREE.InstancedBufferAttribute;
  private aStretch: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;

  constructor(max: number, blending: THREE.Blending) {
    this.max = max;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aStretch = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iColor', this.aColor);
    geo.setAttribute('iMisc', this.aMisc);
    geo.setAttribute('iStretch', this.aStretch);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { atlas: { value: atlas() } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = blending === THREE.AdditiveBlending ? 20 : 10;
    this.mesh.userData.noPick = true;
  }

  get count() {
    return this.parts.length;
  }

  emit(s: ParticleSpec) {
    if (this.parts.length >= this.max) {
      // recycle the oldest
      const old = this.parts.shift()!;
      this.pool.push(old);
    }
    const p = this.pool.pop() ?? ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), acc: new THREE.Vector3(), c0: new THREE.Color(), c1: new THREE.Color() } as P);
    p.pos.copy(s.pos);
    p.vel.copy(s.vel ?? ZERO);
    p.acc.copy(s.acc ?? ZERO);
    p.drag = s.drag ?? 0;
    p.age = 0;
    p.life = s.life;
    p.size0 = s.size;
    p.size1 = s.sizeEnd ?? s.size;
    if (typeof s.color === 'string') p.c0.set(s.color);
    else p.c0.copy(s.color);
    if (s.colorEnd === undefined) p.c1.copy(p.c0);
    else if (typeof s.colorEnd === 'string') p.c1.set(s.colorEnd);
    else p.c1.copy(s.colorEnd);
    p.alpha = s.alpha ?? 1;
    p.fadeIn = s.fadeIn ?? 0.1;
    p.sprite = s.sprite;
    p.rot = s.rot ?? Math.random() * Math.PI * 2;
    p.spin = s.spin ?? 0;
    p.stretch = s.stretch ?? 1;
    p.wiggle = s.wiggle ?? 0;
    p.seed = Math.random() * 100;
    this.parts.push(p);
  }

  update(dt: number, time: number) {
    const alive: P[] = [];
    const tmpC = new THREE.Color();
    let n = 0;
    for (const p of this.parts) {
      p.age += dt;
      if (p.age >= p.life) {
        this.pool.push(p);
        continue;
      }
      p.vel.addScaledVector(p.acc, dt);
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.wiggle) {
        p.pos.x += Math.sin(time * 3 + p.seed) * p.wiggle * dt;
        p.pos.z += Math.cos(time * 2.3 + p.seed * 1.7) * p.wiggle * dt;
      }
      p.rot += p.spin * dt;
      const k = p.age / p.life;
      const fadeIn = p.fadeIn > 0 ? Math.min(1, k / p.fadeIn) : 1;
      const fadeOut = Math.min(1, (1 - k) / 0.35);
      const a = p.alpha * fadeIn * fadeOut;
      const size = p.size0 + (p.size1 - p.size0) * k;
      tmpC.copy(p.c0).lerp(p.c1, k);
      if (n < this.max) {
        this.aPos.setXYZ(n, p.pos.x, p.pos.y, p.pos.z);
        this.aColor.setXYZW(n, tmpC.r, tmpC.g, tmpC.b, a);
        this.aMisc.setXYZ(n, size, p.rot, p.sprite);
        this.aStretch.setX(n, p.stretch);
        n++;
      }
      alive.push(p);
    }
    this.parts = alive;
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = this.aColor.needsUpdate = this.aMisc.needsUpdate = this.aStretch.needsUpdate = true;
  }

  clear() {
    this.pool.push(...this.parts);
    this.parts = [];
    this.geo.instanceCount = 0;
  }
}

const ZERO = new THREE.Vector3();

export class Particles {
  readonly normal = new ParticleLayer(1600, THREE.NormalBlending);
  readonly additive = new ParticleLayer(1200, THREE.AdditiveBlending);
  readonly group = new THREE.Group();
  constructor() {
    this.group.add(this.normal.mesh, this.additive.mesh);
  }
  emit(s: ParticleSpec, additive = false) {
    (additive ? this.additive : this.normal).emit(s);
  }
  update(dt: number, time: number) {
    this.normal.update(dt, time);
    this.additive.update(dt, time);
  }
  get count() {
    return this.normal.count + this.additive.count;
  }
  clear() {
    this.normal.clear();
    this.additive.clear();
  }
}
