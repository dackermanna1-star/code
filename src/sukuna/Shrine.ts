import * as THREE from 'three';
import { G } from '../core/G';
import { clamp, easeInOutCubic, easeOutCubic, mulberry32 } from '../core/math';

type V3 = [number, number, number];

/** Collects coloured boxes into one vertex-coloured geometry. */
class Builder {
  private geos: THREE.BufferGeometry[] = [];
  private col = new THREE.Color();

  box(size: V3, pos: V3, color: number, rot: V3 = [0, 0, 0], shade = 0.12) {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    g.rotateX(rot[0]);
    g.rotateY(rot[1]);
    g.rotateZ(rot[2]);
    g.translate(pos[0], pos[1], pos[2]);
    const n = g.getAttribute('position').count;
    const nor = g.getAttribute('normal');
    const c = new Float32Array(n * 3);
    this.col.setHex(color);
    for (let i = 0; i < n; i++) {
      // a touch of baked shading: undersides darker, tops lighter
      const k = 1 + nor.getY(i) * shade - (Math.random() * 0.04);
      c[i * 3] = this.col.r * k;
      c[i * 3 + 1] = this.col.g * k;
      c[i * 3 + 2] = this.col.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.geos.push(g);
    return g;
  }

  /** A box oriented from a to b (thickness w x h). */
  beam(a: V3, b: V3, w: number, h: number, color: number) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const g = new THREE.BoxGeometry(w, h, len);
    const m = new THREE.Matrix4().lookAt(va, vb, new THREE.Vector3(0, 1, 0));
    g.applyMatrix4(m);
    const mid = va.clone().add(vb).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    const n = g.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    this.col.setHex(color);
    for (let i = 0; i < n; i++) {
      c[i * 3] = this.col.r;
      c[i * 3 + 1] = this.col.g;
      c[i * 3 + 2] = this.col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.geos.push(g);
  }

  build() {
    const out = mergeGeos(this.geos);
    this.geos = [];
    return out;
  }
}

function mergeGeos(geos: THREE.BufferGeometry[]) {
  let n = 0;
  for (const g of geos) n += g.index ? g.index.count : g.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let o = 0;
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.getAttribute('position');
    const nn = g.getAttribute('normal');
    const c = g.getAttribute('color');
    for (let i = 0; i < p.count; i++, o++) {
      pos[o * 3] = p.getX(i);
      pos[o * 3 + 1] = p.getY(i);
      pos[o * 3 + 2] = p.getZ(i);
      nor[o * 3] = nn.getX(i);
      nor[o * 3 + 1] = nn.getY(i);
      nor[o * 3 + 2] = nn.getZ(i);
      col[o * 3] = c.getX(i);
      col[o * 3 + 1] = c.getY(i);
      col[o * 3 + 2] = c.getZ(i);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

const STONE = 0x2c2522;
const STONE_L = 0x3b322d;
const WOOD = 0x2a0c0a;
const LACQUER = 0x6c1410;
const BLACK = 0x140707;
const ROOF = 0x1c1213;
const GOLD = 0xb08a2e;
const BONE = 0xd2c6a6;
const BONE_D = 0x9c8f72;
const GUM = 0x5a0b0b;
const TEETH = 0xdcd0b4;
const MOUTH = 0x060101;

/** The Malevolent Shrine: tiered temple with a gaping, fanged mouth, horns and a bull skull. Front faces +Z. */
export function buildShrine() {
  const b = new Builder();
  const glow = new Builder();
  // stepped stone platform and the front stair
  b.box([30, 1.2, 22], [0, 0.6, 0], STONE);
  b.box([27, 1.2, 19], [0, 1.8, -0.4], STONE_L);
  b.box([24, 1.2, 16], [0, 3.0, -0.8], STONE);
  for (let i = 0; i < 5; i++) b.box([8, 0.72, 1.0], [0, 0.36 + i * 0.72, 11.6 - i * 1.0], i % 2 ? STONE : STONE_L);
  // hall
  b.box([20, 9, 12], [0, 8.1, -1], WOOD, [0, 0, 0], 0.05);
  for (const x of [-9.6, -7.2, -5.9, 5.9, 7.2, 9.6]) b.box([1.0, 9.2, 1.0], [x, 8.2, 5.3], LACQUER);
  b.box([22, 1.0, 1.3], [0, 12.4, 5.4], BLACK);
  b.box([21, 0.5, 0.9], [0, 10.9, 5.5], BLACK);
  // side lattice windows
  for (const sx of [-1, 1])
    for (let i = 0; i < 4; i++) b.box([0.25, 3.2, 0.25], [sx * (8.4 - i * 0.6), 8.5, 5.15], BLACK);
  // the mouth: lips, fangs and a red throat
  b.box([11.4, 5.6, 0.8], [0, 7.2, 5.25], MOUTH);
  b.box([12.4, 0.9, 1.4], [0, 10.15, 5.6], GUM);
  b.box([12.4, 0.9, 1.4], [0, 4.25, 5.6], GUM);
  b.box([0.9, 6.4, 1.4], [-6.1, 7.2, 5.6], GUM);
  b.box([0.9, 6.4, 1.4], [6.1, 7.2, 5.6], GUM);
  for (let i = 0; i < 10; i++) {
    const x = -4.95 + i * 1.1;
    const fang = i === 0 || i === 9;
    const h = fang ? 1.5 : 1.0;
    b.box([0.85, h, 0.6], [x, 9.5 - h / 2, 5.75], TEETH);
    b.box([0.55, fang ? 1.3 : 0.65, 0.45], [x, 9.5 - h - (fang ? 0.6 : 0.3), 5.75], TEETH);
    b.box([0.85, 0.9, 0.6], [x + 0.55, 4.9 + 0.45, 5.75], TEETH);
    b.box([0.5, 0.55, 0.45], [x + 0.55, 4.9 + 0.9 + 0.25, 5.75], TEETH);
  }
  b.box([6.5, 0.9, 3.2], [0, 4.95, 3.9], 0x6a1212);
  glow.box([10.6, 4.6, 0.3], [0, 7.2, 4.2], 0x5a0604);
  // lower roof: flared eaves stepping in, gold trim, upturned corners
  const tiers: [number, number, number][] = [
    [27, 18, 13.2],
    [24, 15.5, 14.1],
    [20.5, 13, 15.0],
    [17, 10.5, 15.9],
  ];
  for (const [w, d, y] of tiers) b.box([w, 0.9, d], [0, y, -1], ROOF);
  b.box([27.4, 0.28, 0.3], [0, 12.7, 8.05], GOLD);
  b.box([27.4, 0.28, 0.3], [0, 12.7, -10.05], GOLD);
  b.box([0.3, 0.28, 18.4], [-13.7, 12.7, -1], GOLD);
  b.box([0.3, 0.28, 18.4], [13.7, 12.7, -1], GOLD);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      b.box([4.2, 0.7, 1.2], [sx * 14.2, 13.6, -1 + sz * 8.6], ROOF, [0, 0, sx * 0.42]);
      b.box([1.2, 0.7, 4.2], [sx * 13.2, 13.6, -1 + sz * 9.6], ROOF, [sz * -0.42, 0, 0]);
      b.box([0.5, 1.4, 0.5], [sx * 15.9, 14.6, -1 + sz * 9.0], GOLD, [0, 0, sx * 0.5]);
    }
  // upper hall and roof
  b.box([12, 4.6, 8], [0, 18.6, -1], 0x3a0c0a);
  for (const x of [-5.4, -1.8, 1.8, 5.4]) b.box([0.6, 4.6, 0.6], [x, 18.6, 3.1], LACQUER);
  const upper: [number, number, number][] = [
    [17, 12, 21.3],
    [14, 10, 22.1],
    [11, 7.5, 22.9],
    [7.5, 5, 23.6],
  ];
  for (const [w, d, y] of upper) b.box([w, 0.8, d], [0, y, -1], ROOF);
  b.box([17.4, 0.25, 0.3], [0, 20.95, 5.05], GOLD);
  b.box([9.5, 0.9, 1.1], [0, 24.3, -1], BLACK);
  for (const sx of [-1, 1]) {
    b.box([0.7, 2.4, 0.7], [sx * 4.8, 25.4, -1], GOLD, [0, 0, sx * -0.35]);
    b.box([3.6, 0.6, 1.0], [sx * 9.3, 21.9, 4.6], ROOF, [0, 0, sx * 0.45]);
  }
  // great horns sweeping up off the upper roof
  for (const sx of [-1, 1]) {
    let px = sx * 5.2;
    let py = 22.4;
    for (let i = 0; i < 8; i++) {
      const ang = 0.15 + i * 0.2;
      const nx = px + sx * Math.cos(ang) * 1.9;
      const ny = py + Math.sin(ang) * 1.9;
      const w = 1.5 - i * 0.15;
      b.beam([px, py, -1], [nx, ny, -1 + i * 0.25], w, w, i > 5 ? BONE_D : BONE);
      px = nx;
      py = ny;
    }
  }
  // the bull skull over the mouth, and smaller skulls along the beam
  b.box([2.6, 2.0, 1.6], [0, 11.6, 6.3], BONE);
  b.box([1.6, 1.5, 1.6], [0, 10.6, 6.9], BONE);
  b.box([0.6, 0.5, 0.3], [-0.65, 11.7, 7.15], MOUTH);
  b.box([0.6, 0.5, 0.3], [0.65, 11.7, 7.15], MOUTH);
  b.box([0.25, 0.4, 0.2], [-0.3, 10.3, 7.75], MOUTH);
  b.box([0.25, 0.4, 0.2], [0.3, 10.3, 7.75], MOUTH);
  for (const sx of [-1, 1]) {
    b.beam([sx * 1.2, 12.1, 6.3], [sx * 3.0, 12.6, 6.6], 0.7, 0.7, BONE);
    b.beam([sx * 3.0, 12.6, 6.6], [sx * 3.9, 13.9, 6.8], 0.5, 0.5, BONE_D);
  }
  for (const x of [-8.8, -6.6, 6.6, 8.8]) {
    b.box([0.9, 0.8, 0.8], [x, 11.65, 6.1], BONE);
    b.box([0.6, 0.35, 0.6], [x, 11.2, 6.2], BONE_D);
    b.box([0.22, 0.22, 0.1], [x - 0.2, 11.75, 6.52], MOUTH);
    b.box([0.22, 0.22, 0.1], [x + 0.2, 11.75, 6.52], MOUTH);
  }
  // hanging lanterns under the eaves and fire bowls by the stair
  for (const x of [-12.2, -8.2, 8.2, 12.2]) {
    b.box([0.12, 1.0, 0.12], [x, 11.9, 7.4], BLACK);
    b.box([1.0, 0.25, 1.0], [x, 11.35, 7.4], BLACK);
    glow.box([0.85, 1.25, 0.85], [x, 10.6, 7.4], 0xff3412);
    b.box([1.0, 0.25, 1.0], [x, 9.9, 7.4], BLACK);
  }
  for (const sx of [-1, 1]) {
    b.box([1.4, 1.6, 1.4], [sx * 5.6, 4.4, 10.0], STONE_L);
    b.box([1.9, 0.4, 1.9], [sx * 5.6, 5.4, 10.0], BLACK);
  }
  return { body: b.build(), glow: glow.build() };
}

/** Skull and bone instances strewn through the pool. */
export function skullGeometry() {
  const b = new Builder();
  b.box([0.34, 0.28, 0.38], [0, 0.17, 0], BONE, [0, 0, 0], 0.2);
  b.box([0.28, 0.14, 0.12], [0, 0.07, 0.17], BONE_D);
  b.box([0.22, 0.07, 0.18], [0, 0.0, 0.08], BONE_D);
  b.box([0.09, 0.08, 0.04], [-0.075, 0.17, 0.195], MOUTH);
  b.box([0.09, 0.08, 0.04], [0.075, 0.17, 0.195], MOUTH);
  b.box([0.05, 0.06, 0.04], [0, 0.1, 0.2], MOUTH);
  return b.build();
}
export function boneGeometry() {
  const b = new Builder();
  b.box([0.06, 0.06, 0.52], [0, 0.03, 0], BONE);
  b.box([0.13, 0.1, 0.1], [0, 0.05, 0.27], BONE_D);
  b.box([0.13, 0.1, 0.1], [0, 0.05, -0.27], BONE_D);
  return b.build();
}

export const POOL_VERT = /* glsl */ `
varying vec3 vWorld;
#include <fog_pars_vertex>
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export const POOL_FRAG = /* glsl */ `
uniform vec3 uCam; uniform vec3 uCenter; uniform float uR; uniform float uTime; uniform float uA;
uniform vec3 uMoon; uniform vec3 uSkyLow; uniform vec3 uSkyHigh;
varying vec3 vWorld;
#include <fog_pars_fragment>
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 rel = vWorld.xz - uCenter.xz;
  float dc = length(rel);
  if (dc > uR) discard;
  // a slow, heavy surface: long swells plus fine ripples
  vec2 q = vWorld.xz * 0.35;
  float w1 = n2(q + vec2(uTime * 0.15, uTime * 0.07));
  float w2 = n2(q * 3.1 - vec2(uTime * 0.3, -uTime * 0.2));
  float ring = sin(dc * 1.6 - uTime * 1.8) * exp(-dc * 0.03) * 0.25;
  vec3 nrm = normalize(vec3((w1 - 0.5) * 0.25 + (w2 - 0.5) * 0.12 + ring * rel.x / max(dc, 1.0), 1.0, (w2 - 0.5) * 0.25 + ring * rel.y / max(dc, 1.0)));
  vec3 v = normalize(vWorld - uCam);
  vec3 r = reflect(v, nrm);
  float fres = 0.08 + 0.92 * pow(1.0 - max(0.0, -v.y), 4.0);
  vec3 sky = mix(uSkyLow, uSkyHigh, clamp(r.y * 1.6, 0.0, 1.0));
  float moon = pow(max(dot(r, normalize(uMoon)), 0.0), 220.0) * 3.0 + pow(max(dot(r, normalize(uMoon)), 0.0), 18.0) * 0.25;
  vec3 col = vec3(0.075, 0.002, 0.003) * (0.7 + w1 * 0.5);
  col += sky * fres * 0.75 + vec3(1.0, 0.2, 0.1) * moon * fres;
  // the edge creeps outward
  float edge = smoothstep(uR, uR - 1.5, dc);
  gl_FragColor = vec4(col, uA * edge);
  #include <fog_fragment>
}`;

export const MOON_FRAG = /* glsl */ `
uniform float uA; uniform float uTime;
varying vec2 vUv;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float disc = smoothstep(0.5, 0.49, r);
  float maria = n2(p * 4.0 + 3.0) * 0.6 + n2(p * 11.0) * 0.4;
  vec3 c = vec3(0.95, 0.12, 0.05) * (0.55 + 0.45 * maria) * (1.0 - pow(r / 0.5, 6.0) * 0.4);
  vec3 glow = vec3(0.6, 0.05, 0.02) * exp(-max(r - 0.5, 0.0) * 6.0) * (1.0 - disc);
  gl_FragColor = vec4((c * disc + glow) * uA, 1.0);
}`;

export type ShrinePhase = 'off' | 'sign' | 'rise' | 'inside' | 'fall';

/**
 * Domain Expansion: Malevolent Shrine. No barrier: the real world stays, but
 * within the radius it drowns in a pool of blood and bones, the sky bleeds,
 * and the shrine rises with its mouth open. Sukuna drives the slashing.
 */
export class Shrine {
  phase: ShrinePhase = 'off';
  t = 0;
  readonly R = 62;
  readonly duration = 10;
  readonly center = new THREE.Vector3();
  readonly front = new THREE.Vector3(0, 0, 1);
  onPhase: ((p: ShrinePhase) => void) | null = null;
  private group = new THREE.Group();
  private body: THREE.Mesh;
  private glow: THREE.Mesh;
  private glowMat: THREE.MeshBasicMaterial;
  private pool: THREE.Mesh;
  private poolMat: THREE.ShaderMaterial;
  private skulls: THREE.InstancedMesh;
  private bones: THREE.InstancedMesh;
  private bonePos: Float32Array;
  private moon: THREE.Mesh;
  private moonMat: THREE.ShaderMaterial;
  private light: THREE.PointLight;
  private rise = 0;
  private spread = 0;
  private firesT = 0;
  private readonly moonDir = new THREE.Vector3();
  private readonly shrinePos = new THREE.Vector3();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private e = new THREE.Euler();

  constructor(scene: THREE.Scene) {
    const g = buildShrine();
    this.body = new THREE.Mesh(g.body, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.body.castShadow = true;
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false });
    this.glow = new THREE.Mesh(g.glow, this.glowMat);
    this.group.add(this.body, this.glow);
    this.group.visible = false;
    scene.add(this.group);
    this.light = new THREE.PointLight(0xff2a10, 0, 45, 1.4);
    this.light.layers.enableAll();
    scene.add(this.light);

    this.poolMat = new THREE.ShaderMaterial({
      vertexShader: POOL_VERT,
      fragmentShader: POOL_FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uCam: { value: new THREE.Vector3() },
          uCenter: { value: new THREE.Vector3() },
          uR: { value: 0 },
          uTime: { value: 0 },
          uA: { value: 1 },
          uMoon: { value: new THREE.Vector3(0, 0.2, 1) },
          uSkyLow: { value: new THREE.Color(0.4, 0.03, 0.015) },
          uSkyHigh: { value: new THREE.Color(0.04, 0.003, 0.004) },
        },
      ]),
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -6,
    });
    const pg = new THREE.CircleGeometry(1, 96);
    pg.rotateX(-Math.PI / 2);
    this.pool = new THREE.Mesh(pg, this.poolMat);
    this.pool.renderOrder = 3;
    this.pool.frustumCulled = false;
    this.pool.visible = false;
    scene.add(this.pool);

    const lm = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.skulls = new THREE.InstancedMesh(skullGeometry(), lm, 420);
    this.bones = new THREE.InstancedMesh(boneGeometry(), lm, 320);
    this.bonePos = new Float32Array((420 + 320) * 5);
    for (const im of [this.skulls, this.bones]) {
      im.frustumCulled = false;
      im.visible = false;
      scene.add(im);
    }

    this.moonMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: MOON_FRAG,
      uniforms: { uA: { value: 0 }, uTime: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.moonMat);
    this.moon.renderOrder = -900;
    this.moon.frustumCulled = false;
    this.moon.visible = false;
    scene.add(this.moon);
  }

  get active() {
    return this.phase !== 'off';
  }
  get inside() {
    return this.phase === 'inside';
  }
  /** 0..1: how far the domain has taken hold (amplifies Fuga). */
  get power() {
    return this.phase === 'inside' ? 1 : this.phase === 'rise' ? clamp(this.t / 1.2, 0, 1) : 0;
  }
  get remaining() {
    return this.phase === 'inside' ? 1 - this.t / this.duration : this.phase === 'off' ? 0 : 1;
  }
  /** Inside the shrine's own footprint (Fuga bursts against it). */
  touches(x: number, y: number, z: number) {
    if (this.phase === 'off' || this.rise < 0.9) return false;
    return Math.hypot(x - this.shrinePos.x, z - this.shrinePos.z) < 15 && y < 30;
  }

  contains(x: number, z: number) {
    return Math.hypot(x - this.center.x, z - this.center.z) < this.R * this.spread;
  }

  begin() {
    if (this.phase !== 'off') return false;
    const pl = G.player;
    this.center.set(pl.pos.x, 0, pl.pos.z);
    this.front.set(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw));
    // the shrine stands ahead, facing its master; the moon hangs above and beside its roof
    this.shrinePos.copy(this.center).addScaledVector(this.front, 40);
    const yaw = 0.42;
    const mx = this.front.x * Math.cos(yaw) - this.front.z * Math.sin(yaw);
    const mz = this.front.x * Math.sin(yaw) + this.front.z * Math.cos(yaw);
    this.moonDir.set(mx * Math.cos(0.4), Math.sin(0.4), mz * Math.cos(0.4)).normalize();
    G.atmosphere.shrineDir.copy(this.moonDir);
    this.scatter();
    this.set('sign');
    return true;
  }

  private set(p: ShrinePhase) {
    this.phase = p;
    this.t = 0;
    this.onPhase?.(p);
  }

  end() {
    if (this.phase === 'off') return;
    this.phase = 'off';
    this.hideAll();
    G.atmosphere.shrineMix = 0;
    G.audio?.loop('shrineLoop', 0);
  }

  private hideAll() {
    this.group.visible = this.pool.visible = this.skulls.visible = this.bones.visible = this.moon.visible = false;
    this.light.intensity = 0;
    this.rise = 0;
    this.spread = 0;
  }

  /** Lay out skulls and bones in the pool (they rise with it). */
  private scatter() {
    const rnd = mulberry32((Math.random() * 1e9) | 0);
    const put = (im: THREE.InstancedMesh, n: number, off: number) => {
      for (let i = 0; i < n; i++) {
        let x = 0;
        let z = 0;
        for (let k = 0; k < 6; k++) {
          const a = rnd() * Math.PI * 2;
          const r = 5 + Math.sqrt(rnd()) * (this.R - 6);
          x = this.center.x + Math.cos(a) * r;
          z = this.center.z + Math.sin(a) * r;
          // keep the stair in front of the shrine clear
          if (Math.hypot(x - this.shrinePos.x, z - this.shrinePos.z) > 15) break;
        }
        const j = (off + i) * 5;
        this.bonePos[j] = x;
        this.bonePos[j + 1] = z;
        this.bonePos[j + 2] = rnd() * Math.PI * 2;
        this.bonePos[j + 3] = (rnd() - 0.5) * 0.9;
        this.bonePos[j + 4] = 0.8 + rnd() * 0.7;
      }
    };
    put(this.skulls, 420, 0);
    put(this.bones, 320, 420);
  }

  private placeDebris() {
    const write = (im: THREE.InstancedMesh, n: number, off: number) => {
      for (let i = 0; i < n; i++) {
        const j = (off + i) * 5;
        const x = this.bonePos[j];
        const z = this.bonePos[j + 1];
        const d = Math.hypot(x - this.center.x, z - this.center.z);
        // bones surface as the pool reaches them
        const k = clamp((this.R * this.spread - d) / 4, 0, 1);
        const sc = this.bonePos[j + 4] * (0.2 + 0.8 * k);
        this.e.set(this.bonePos[j + 3], this.bonePos[j + 2], this.bonePos[j + 3] * 0.6);
        this.q.setFromEuler(this.e);
        this.p.set(x, -0.25 + 0.22 * k, z);
        this.s.setScalar(k > 0.001 ? sc : 0.0001);
        this.m.compose(this.p, this.q, this.s);
        im.setMatrixAt(i, this.m);
      }
      im.instanceMatrix.needsUpdate = true;
    };
    write(this.skulls, 420, 0);
    write(this.bones, 320, 420);
  }

  update(dt: number) {
    if (this.phase === 'off') return;
    this.t += dt;
    const post = G.renderer.post;
    const cam = G.camera.position;
    if (this.phase === 'sign') {
      G.atmosphere.shrineMix = Math.min(0.3, this.t * 0.35);
      if (this.t >= 0.9) {
        this.set('rise');
        G.audio?.play('shrineStart', { volume: 1.15 });
        this.group.visible = this.pool.visible = this.skulls.visible = this.bones.visible = this.moon.visible = true;
        G.player.addTrauma(0.45);
        post.aberration = Math.max(post.aberration, 1.2);
      }
    } else if (this.phase === 'rise') {
      const k = clamp(this.t / 1.3, 0, 1);
      this.spread = easeOutCubic(k);
      this.rise = easeInOutCubic(clamp((this.t - 0.15) / 1.15, 0, 1));
      G.atmosphere.shrineMix = 0.3 + 0.7 * k;
      G.player.addTrauma(dt * 0.9);
      // the ground shakes loose dust as the shrine comes up
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        const x = this.shrinePos.x + Math.cos(a) * 19;
        const z = this.shrinePos.z + Math.sin(a) * 14;
        G.fx.dust.emit(x, 0.3, z, Math.cos(a) * 3, Math.random() * 3, Math.sin(a) * 3, 1.6, 1.5, 5, 0.25, 0.08, 0.06, 0.7, 0.2, 0.05, 0.04, 0, 1.2, -0.05, Math.random() * 6, 0);
      }
      if (k >= 1) {
        this.set('inside');
        post.impact = 1.3;
        post.impactColor.setRGB(1.0, 0.12, 0.08);
        post.flash = Math.max(post.flash, 0.3);
        G.player.addTrauma(0.6);
      }
    } else if (this.phase === 'inside') {
      G.atmosphere.shrineMix = 1;
      this.spread = 1;
      this.rise = 1;
      G.audio?.loop('shrineLoop', 0.9);
      if (this.t >= this.duration) {
        this.set('fall');
        G.audio?.loop('shrineLoop', 0);
        G.audio?.play('shrineEnd', { volume: 1.0 });
      }
    } else if (this.phase === 'fall') {
      const k = clamp(this.t / 1.1, 0, 1);
      this.rise = 1 - easeInOutCubic(k);
      this.spread = 1 - easeInOutCubic(k);
      G.atmosphere.shrineMix = 1 - k;
      if (k >= 1) {
        this.phase = 'off';
        this.hideAll();
        G.atmosphere.shrineMix = 0;
        this.onPhase?.('off');
        return;
      }
    }
    // shrine rises out of the ground (and sinks back)
    this.group.position.copy(this.shrinePos);
    this.group.position.y = -34 * (1 - this.rise);
    this.group.scale.setScalar(1.25);
    this.group.rotation.y = Math.atan2(-this.front.x, -this.front.z);
    this.glowMat.color.setScalar(1.6 + Math.sin(this.t * 7) * 0.3 + Math.random() * 0.2);
    this.light.position.set(this.shrinePos.x - this.front.x * 11, 9 + this.group.position.y, this.shrinePos.z - this.front.z * 11);
    this.light.intensity = 60 * this.rise * (0.85 + Math.random() * 0.15);
    // fire bowls by the stair
    this.firesT -= dt;
    if (this.rise > 0.95 && this.firesT <= 0) {
      this.firesT = 0.03;
      const rx = -this.front.z;
      const rz = this.front.x;
      for (const sx of [-1, 1]) {
        const x = this.shrinePos.x + (rx * sx * 5.6 - this.front.x * 10) * 1.25;
        const z = this.shrinePos.z + (rz * sx * 5.6 - this.front.z * 10) * 1.25;
        G.fx.fireAt(x, 7.0, z, 2.0);
      }
    }
    // blood pool, bones, moon
    const u = this.poolMat.uniforms;
    u.uCam.value.copy(cam);
    u.uCenter.value.copy(this.center);
    u.uR.value = Math.max(0.01, this.R * this.spread);
    u.uTime.value += dt;
    u.uMoon.value.copy(this.moonDir);
    this.pool.position.set(this.center.x, 0.025, this.center.z);
    this.pool.scale.setScalar(this.R + 2);
    this.placeDebris();
    this.moon.position.copy(cam).addScaledVector(this.moonDir, 900);
    this.moon.lookAt(cam);
    this.moon.scale.setScalar(260);
    this.moonMat.uniforms.uA.value = this.spread;
    this.moonMat.uniforms.uTime.value += dt;
  }
}
