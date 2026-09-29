import * as THREE from 'three';
import { rand } from '../core/math';

export type ParticleKind =
  | 'smoke'
  | 'darkSmoke'
  | 'steam'
  | 'spark'
  | 'flame'
  | 'confetti'
  | 'star'
  | 'heart'
  | 'drop'
  | 'dust'
  | 'glow'
  | 'puff'
  | 'sizzle';

interface P {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
  s0: number;
  s1: number;
  rot: number;
  rv: number;
  c0: THREE.Color;
  c1: THREE.Color;
  a0: number;
  a1: number;
  g: number;
  drag: number;
  atlas: number;
  floor: number;
  bounce: number;
  additive: boolean;
  fadeIn: number;
}

export interface EmitOpts {
  vel?: THREE.Vector3;
  spread?: number;
  color?: THREE.ColorRepresentation;
  color1?: THREE.ColorRepresentation;
  size?: number;
  size1?: number;
  life?: number;
  gravity?: number;
  floor?: number;
}

const ATLAS_COLS = 4;
const ATLAS_ROWS = 2;

function makeAtlas(): THREE.Texture {
  const cell = 128;
  const c = document.createElement('canvas');
  c.width = cell * ATLAS_COLS;
  c.height = cell * ATLAS_ROWS;
  const ctx = c.getContext('2d')!;
  const at = (i: number) => [(i % ATLAS_COLS) * cell, Math.floor(i / ATLAS_COLS) * cell] as const;
  // 0 glow
  {
    const [x, y] = at(0);
    const g = ctx.createRadialGradient(x + 64, y + 64, 0, x + 64, y + 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, cell, cell);
  }
  // 1 smoke puff (cluster of soft blobs)
  {
    const [x, y] = at(1);
    for (let i = 0; i < 14; i++) {
      const bx = x + 64 + Math.cos(i * 2.4) * rand(8, 30);
      const by = y + 64 + Math.sin(i * 2.4) * rand(8, 30);
      const r = rand(18, 34);
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, cell, cell);
    }
  }
  // 2 spark
  {
    const [x, y] = at(2);
    const g = ctx.createRadialGradient(x + 64, y + 64, 0, x + 64, y + 64, 20);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, cell, cell);
  }
  // 3 star
  {
    const [x, y] = at(3);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 22 : 56;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(x + 64 + Math.cos(a) * r, y + 64 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  // 4 heart
  {
    const [x, y] = at(4);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    const cx = x + 64;
    const cy = y + 70;
    ctx.moveTo(cx, cy + 40);
    ctx.bezierCurveTo(cx - 70, cy - 10, cx - 40, cy - 60, cx, cy - 25);
    ctx.bezierCurveTo(cx + 40, cy - 60, cx + 70, cy - 10, cx, cy + 40);
    ctx.fill();
  }
  // 5 flame
  {
    const [x, y] = at(5);
    const g = ctx.createRadialGradient(x + 64, y + 80, 4, x + 64, y + 70, 56);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + 64, y + 6);
    ctx.quadraticCurveTo(x + 112, y + 80, x + 64, y + 124);
    ctx.quadraticCurveTo(x + 16, y + 80, x + 64, y + 6);
    ctx.fill();
  }
  // 6 droplet
  {
    const [x, y] = at(6);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + 64, y + 72, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 64, y + 20);
    ctx.lineTo(x + 90, y + 62);
    ctx.lineTo(x + 38, y + 62);
    ctx.fill();
  }
  // 7 confetti rect
  {
    const [x, y] = at(7);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 40, y + 24, 48, 80);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  return t;
}

const VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
attribute float aRot;
attribute float aAtlas;
uniform float uScale;
varying vec4 vColor;
varying float vRot;
varying float vAtlas;
void main(){
  vColor = aColor;
  vRot = aRot;
  vAtlas = aAtlas;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.05, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec4 vColor;
varying float vRot;
varying float vAtlas;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
  float col = mod(vAtlas, ${ATLAS_COLS}.0);
  float row = floor(vAtlas / ${ATLAS_COLS}.0);
  vec2 uv = (vec2(col, ${ATLAS_ROWS - 1}.0 - row) + vec2(p.x, 1.0 - p.y)) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
  vec4 t = texture2D(uAtlas, uv);
  vec4 o = vColor * t;
  if (o.a < 0.004) discard;
  gl_FragColor = o;
  #include <colorspace_fragment>
}`;

class Layer {
  readonly points: THREE.Points;
  readonly geo = new THREE.BufferGeometry();
  pos: Float32Array;
  size: Float32Array;
  color: Float32Array;
  rot: Float32Array;
  atlas: Float32Array;
  constructor(max: number, mat: THREE.ShaderMaterial) {
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.color = new Float32Array(max * 4);
    this.rot = new Float32Array(max);
    this.atlas = new Float32Array(max);
    const dyn = (a: THREE.BufferAttribute) => a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', dyn(new THREE.BufferAttribute(this.pos, 3)));
    this.geo.setAttribute('aSize', dyn(new THREE.BufferAttribute(this.size, 1)));
    this.geo.setAttribute('aColor', dyn(new THREE.BufferAttribute(this.color, 4)));
    this.geo.setAttribute('aRot', dyn(new THREE.BufferAttribute(this.rot, 1)));
    this.geo.setAttribute('aAtlas', dyn(new THREE.BufferAttribute(this.atlas, 1)));
    this.geo.setDrawRange(0, 0);
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }
}

/**
 * CPU-simulated point-sprite particles with a shared texture atlas. Two
 * layers: alpha-blended (smoke, steam, confetti) and additive (sparks, fire,
 * glows).
 */
export class Particles {
  private pool: P[] = [];
  private normal: Layer;
  private add: Layer;
  private uniforms = { uAtlas: { value: makeAtlas() }, uScale: { value: 500 } };
  density = 1;

  constructor(scene: THREE.Scene, private max = 2500) {
    const base = { vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false };
    this.normal = new Layer(max, new THREE.ShaderMaterial({ ...base }));
    this.add = new Layer(max, new THREE.ShaderMaterial({ ...base, blending: THREE.AdditiveBlending }));
    this.normal.points.renderOrder = 20;
    this.add.points.renderOrder = 21;
    scene.add(this.normal.points, this.add.points);
    for (let i = 0; i < max; i++)
      this.pool.push({
        alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, s0: 1, s1: 1, rot: 0, rv: 0,
        c0: new THREE.Color(), c1: new THREE.Color(), a0: 1, a1: 0, g: 0, drag: 0, atlas: 0, floor: -99, bounce: 0.3, additive: false, fadeIn: 0,
      });
  }

  setViewport(heightPx: number, fovDeg: number) {
    this.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  private get(): P | null {
    for (const p of this.pool) if (!p.alive) return p;
    return null;
  }

  emit(kind: ParticleKind, at: THREE.Vector3, o: EmitOpts = {}): void {
    if (this.density < 1 && Math.random() > this.density) return;
    const p = this.get();
    if (!p) return;
    p.alive = true;
    p.pos.copy(at);
    p.life = 0;
    p.rot = rand(0, Math.PI * 2);
    p.rv = 0;
    p.drag = 0;
    p.floor = o.floor ?? -99;
    p.bounce = 0.3;
    p.fadeIn = 0;
    const sp = o.spread ?? 1;
    const v = o.vel ?? new THREE.Vector3();
    p.vel.copy(v);
    switch (kind) {
      case 'smoke':
      case 'darkSmoke': {
        const dark = kind === 'darkSmoke';
        p.max = o.life ?? rand(1.6, 2.6);
        p.vel.add(new THREE.Vector3(rand(-0.03, 0.03) * sp, rand(0.18, 0.32), rand(-0.03, 0.03) * sp));
        p.s0 = o.size ?? 0.06;
        p.s1 = o.size1 ?? 0.28;
        p.c0.set(o.color ?? (dark ? 0x3a3330 : 0xd9d2cc));
        p.c1.set(o.color1 ?? (dark ? 0x221e1c : 0xefe9e4));
        p.a0 = dark ? 0.55 : 0.22;
        p.a1 = 0;
        p.g = -0.02;
        p.drag = 0.6;
        p.rv = rand(-0.6, 0.6);
        p.atlas = 1;
        p.additive = false;
        p.fadeIn = 0.15;
        break;
      }
      case 'steam': {
        p.max = o.life ?? rand(1.2, 2.0);
        p.vel.add(new THREE.Vector3(rand(-0.02, 0.02), rand(0.12, 0.22), rand(-0.02, 0.02)));
        p.s0 = o.size ?? 0.04;
        p.s1 = o.size1 ?? 0.16;
        p.c0.set(0xffffff);
        p.c1.set(0xffffff);
        p.a0 = 0.18;
        p.a1 = 0;
        p.drag = 0.8;
        p.rv = rand(-0.8, 0.8);
        p.atlas = 1;
        p.additive = false;
        p.fadeIn = 0.2;
        break;
      }
      case 'spark':
      case 'sizzle': {
        p.max = o.life ?? rand(0.25, 0.55);
        const a = rand(0, Math.PI * 2);
        const sv = kind === 'sizzle' ? rand(0.15, 0.45) : rand(0.4, 1.2);
        p.vel.add(new THREE.Vector3(Math.cos(a) * sv * 0.6 * sp, rand(0.4, 1.1) * sv * 1.6, Math.sin(a) * sv * 0.6 * sp));
        p.s0 = o.size ?? (kind === 'sizzle' ? 0.012 : 0.02);
        p.s1 = p.s0 * 0.4;
        p.c0.set(o.color ?? 0xfff1c0);
        p.c1.set(o.color1 ?? 0xff8a2a);
        p.a0 = 1;
        p.a1 = 0;
        p.g = 3.2;
        p.atlas = 2;
        p.additive = true;
        break;
      }
      case 'flame': {
        p.max = o.life ?? rand(0.25, 0.5);
        p.vel.add(new THREE.Vector3(rand(-0.05, 0.05), rand(0.35, 0.7), rand(-0.05, 0.05)));
        p.s0 = o.size ?? rand(0.05, 0.09);
        p.s1 = p.s0 * 0.3;
        p.c0.set(0xffe08a);
        p.c1.set(0xff3a0a);
        p.a0 = 0.95;
        p.a1 = 0;
        p.g = -0.4;
        p.atlas = 5;
        p.rot = 0;
        p.additive = true;
        break;
      }
      case 'glow': {
        p.max = o.life ?? 0.5;
        p.s0 = o.size ?? 0.2;
        p.s1 = o.size1 ?? 0.35;
        p.c0.set(o.color ?? 0xffe9b0);
        p.c1.set(o.color1 ?? o.color ?? 0xffe9b0);
        p.a0 = 0.7;
        p.a1 = 0;
        p.atlas = 0;
        p.additive = true;
        break;
      }
      case 'confetti': {
        p.max = o.life ?? rand(1.8, 3.0);
        const a = rand(0, Math.PI * 2);
        const s = rand(0.8, 2.4) * sp;
        p.vel.add(new THREE.Vector3(Math.cos(a) * s * 0.5, rand(1.5, 3.2), Math.sin(a) * s * 0.5));
        p.s0 = p.s1 = o.size ?? rand(0.025, 0.04);
        const cols = [0xff4f7b, 0xffd23f, 0x3ad29f, 0x4fa3ff, 0xb46bff, 0xff8a3a];
        p.c0.set(o.color ?? cols[Math.floor(Math.random() * cols.length)]);
        p.c1.copy(p.c0);
        p.a0 = 1;
        p.a1 = 1;
        p.g = 2.4;
        p.drag = 1.4;
        p.rv = rand(-12, 12);
        p.atlas = 7;
        p.additive = false;
        p.floor = o.floor ?? -99;
        p.bounce = 0.1;
        break;
      }
      case 'star':
      case 'heart': {
        p.max = o.life ?? rand(0.9, 1.4);
        const a = rand(0, Math.PI * 2);
        const s = rand(0.2, 0.6) * sp;
        p.vel.add(new THREE.Vector3(Math.cos(a) * s, rand(0.6, 1.2), Math.sin(a) * s));
        p.s0 = o.size ?? 0.07;
        p.s1 = (o.size ?? 0.07) * 0.6;
        p.c0.set(o.color ?? (kind === 'heart' ? 0xff4f7b : 0xffd23f));
        p.c1.copy(p.c0);
        p.a0 = 1;
        p.a1 = 0;
        p.g = 0.6;
        p.drag = 1.0;
        p.rot = kind === 'heart' ? 0 : rand(0, 6);
        p.rv = kind === 'heart' ? 0 : rand(-3, 3);
        p.atlas = kind === 'heart' ? 4 : 3;
        p.additive = false;
        break;
      }
      case 'drop': {
        p.max = o.life ?? rand(0.5, 0.9);
        const a = rand(0, Math.PI * 2);
        const s = rand(0.2, 0.7) * sp;
        p.vel.add(new THREE.Vector3(Math.cos(a) * s, rand(0.5, 1.3), Math.sin(a) * s));
        p.s0 = p.s1 = o.size ?? rand(0.008, 0.016);
        p.c0.set(o.color ?? 0xd8341f);
        p.c1.copy(p.c0);
        p.a0 = 1;
        p.a1 = 0.8;
        p.g = 5.5;
        p.atlas = 6;
        p.rot = 0;
        p.additive = false;
        p.floor = o.floor ?? -99;
        p.bounce = 0;
        break;
      }
      case 'dust': {
        p.max = o.life ?? rand(6, 12);
        p.vel.set(rand(-0.02, 0.02), rand(-0.01, 0.015), rand(-0.02, 0.02));
        p.s0 = p.s1 = o.size ?? rand(0.006, 0.012);
        p.c0.set(o.color ?? 0xfff2d8);
        p.c1.copy(p.c0);
        p.a0 = 0.5;
        p.a1 = 0;
        p.g = 0;
        p.atlas = 0;
        p.additive = true;
        p.fadeIn = 0.3;
        break;
      }
      case 'puff': {
        p.max = o.life ?? rand(0.35, 0.6);
        const a = rand(0, Math.PI * 2);
        const s = rand(0.3, 0.8) * sp;
        p.vel.add(new THREE.Vector3(Math.cos(a) * s, rand(0.05, 0.3), Math.sin(a) * s));
        p.s0 = o.size ?? 0.05;
        p.s1 = o.size1 ?? 0.12;
        p.c0.set(o.color ?? 0xffffff);
        p.c1.set(o.color1 ?? o.color ?? 0xffffff);
        p.a0 = 0.5;
        p.a1 = 0;
        p.drag = 4;
        p.atlas = 1;
        p.rv = rand(-2, 2);
        p.additive = false;
        break;
      }
    }
    if (o.gravity !== undefined) p.g = o.gravity;
    if (o.color && kind !== 'confetti') p.c0.set(o.color);
    if (o.color1) p.c1.set(o.color1);
  }

  burst(kind: ParticleKind, at: THREE.Vector3, count: number, o: EmitOpts = {}) {
    for (let i = 0; i < count; i++) this.emit(kind, at, o);
  }

  update(dt: number) {
    const n = this.normal;
    const a = this.add;
    let ni = 0;
    let ai = 0;
    const tmpC = new THREE.Color();
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.alive = false;
        continue;
      }
      p.vel.y -= p.g * dt;
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.floor) {
        p.pos.y = p.floor;
        p.vel.y = -p.vel.y * p.bounce;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
        p.rv *= 0.5;
      }
      p.rot += p.rv * dt;
      const t = p.life / p.max;
      const L = p.additive ? a : n;
      const i = p.additive ? ai++ : ni++;
      L.pos[i * 3] = p.pos.x;
      L.pos[i * 3 + 1] = p.pos.y;
      L.pos[i * 3 + 2] = p.pos.z;
      L.size[i] = p.s0 + (p.s1 - p.s0) * t;
      tmpC.copy(p.c0).lerp(p.c1, t);
      let alpha = p.a0 + (p.a1 - p.a0) * t;
      if (p.fadeIn > 0) alpha *= Math.min(1, t / p.fadeIn);
      L.color[i * 4] = tmpC.r;
      L.color[i * 4 + 1] = tmpC.g;
      L.color[i * 4 + 2] = tmpC.b;
      L.color[i * 4 + 3] = alpha;
      L.rot[i] = p.rot;
      L.atlas[i] = p.atlas;
    }
    for (const [L, cnt] of [[n, ni], [a, ai]] as const) {
      L.geo.setDrawRange(0, cnt);
      for (const k of ['position', 'aSize', 'aColor', 'aRot', 'aAtlas']) {
        const attr = L.geo.attributes[k] as THREE.BufferAttribute;
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, cnt * attr.itemSize);
        attr.needsUpdate = true;
      }
    }
  }
}
