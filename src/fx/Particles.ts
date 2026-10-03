import * as THREE from 'three';

export interface ParticleOpts {
  max: number;
  blending?: 'normal' | 'additive';
  texture?: THREE.Texture | null;
  /** Multiply color by the scene ambient uniform (smoke, blood). */
  lit?: boolean;
  /** Stretch the quad along its screen-space velocity (sparks, rain of blood). */
  stretch?: number;
  /** Clamp to the ground plane and rest there. */
  ground?: boolean;
  /** Write depth (opaque-ish chunks). */
  depthWrite?: boolean;
  renderOrder?: number;
  /** Alpha-test cutoff (pixel-crisp particles). */
  alphaTest?: number;
  fog?: boolean;
  /** Fade particles out within this distance of the camera: [gone, full] (metres). */
  nearFade?: [number, number];
}

const VERT = /* glsl */ `
attribute vec3 aPos; attribute vec3 aVel; attribute vec4 aTime; attribute vec4 aSize; attribute vec4 aC0; attribute vec4 aC1;
uniform float uTime; uniform float uStretch; uniform float uGround; uniform vec2 uNearFade;
varying vec4 vColor; varying vec2 vUv;
#include <fog_pars_vertex>
void main(){
  float age = uTime - aTime.x;
  float life = aTime.y;
  if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float t = age / life;
  float k = aTime.z;
  vec3 g = vec3(0.0, -9.81 * aTime.w, 0.0);
  vec3 p; vec3 vel;
  if (k > 0.001) {
    float e = exp(-k * age);
    p = aPos + aVel * (1.0 - e) / k + g * (age / k - (1.0 - e) / (k * k));
    vel = aVel * e + g * (1.0 - e) / k;
  } else {
    p = aPos + aVel * age + 0.5 * g * age * age;
    vel = aVel + g * age;
  }
  float landed = 0.0;
  if (uGround > 0.5 && p.y < 0.012) { p.y = 0.012; vel = vec3(0.0); landed = 1.0; }
  float size = mix(aSize.x, aSize.y, t);
  vColor = mix(aC0, aC1, t);
  if (landed > 0.5) vColor.a *= 1.0 - smoothstep(0.55, 1.0, t);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec2 corner = position.xy;
  vUv = corner + 0.5;
  float rot = aSize.z + aSize.w * age;
  float cr = cos(rot), sr = sin(rot);
  vec2 c2 = vec2(corner.x * cr - corner.y * sr, corner.x * sr + corner.y * cr);
  if (uStretch > 0.0 && landed < 0.5) {
    vec3 vv = mat3(viewMatrix) * vel;
    float sp = length(vv.xy);
    vec2 dir = sp > 1e-3 ? vv.xy / sp : vec2(0.0, 1.0);
    vec2 perp = vec2(-dir.y, dir.x);
    float len = size + sp * uStretch;
    mv.xy += perp * corner.x * size + dir * corner.y * len;
  } else {
    mv.xy += c2 * size;
  }
  if (uNearFade.y > 0.0) vColor.a *= smoothstep(uNearFade.x, uNearFade.y, -mv.z);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap; uniform float uUseMap; uniform float uLit; uniform vec3 uAmbient; uniform float uAlphaTest;
varying vec4 vColor; varying vec2 vUv;
#include <fog_pars_fragment>
void main(){
  vec4 c = vColor;
  if (uUseMap > 0.5) c *= texture2D(uMap, vUv);
  if (c.a < uAlphaTest) discard;
  if (uLit > 0.5) c.rgb *= uAmbient;
  gl_FragColor = c;
  #include <fog_fragment>
}`;

/**
 * GPU-evaluated particles: each particle's motion is analytic (drag + gravity)
 * so the CPU only writes spawn data into a ring buffer.
 */
export class ParticleSystem {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private geo: THREE.InstancedBufferGeometry;
  private pos: Float32Array;
  private vel: Float32Array;
  private time: Float32Array;
  private size: Float32Array;
  private c0: Float32Array;
  private c1: Float32Array;
  private attrs: THREE.InstancedBufferAttribute[];
  private head = 0;
  private dMin = Infinity;
  private dMax = -1;
  private wrapped = false;
  readonly max: number;
  now = 0;

  constructor(o: ParticleOpts) {
    const max = o.max;
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.time = new Float32Array(max * 4).fill(-1000);
    for (let i = 0; i < max; i++) this.time[i * 4 + 1] = 0.0001;
    this.size = new Float32Array(max * 4);
    this.c0 = new Float32Array(max * 4);
    this.c1 = new Float32Array(max * 4);
    const mk = (arr: Float32Array, n: number) => {
      const a = new THREE.InstancedBufferAttribute(arr, n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.attrs = [mk(this.pos, 3), mk(this.vel, 3), mk(this.time, 4), mk(this.size, 4), mk(this.c0, 4), mk(this.c1, 4)];
    ['aPos', 'aVel', 'aTime', 'aSize', 'aC0', 'aC1'].forEach((n, i) => g.setAttribute(n, this.attrs[i]));
    g.instanceCount = max;
    this.geo = g;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uStretch: { value: o.stretch ?? 0 },
          uGround: { value: o.ground ? 1 : 0 },
          uMap: { value: o.texture ?? null },
          uUseMap: { value: o.texture ? 1 : 0 },
          uLit: { value: o.lit ? 1 : 0 },
          uAmbient: { value: new THREE.Color(1, 1, 1) },
          uAlphaTest: { value: o.alphaTest ?? 0.01 },
          uNearFade: { value: new THREE.Vector2(o.nearFade?.[0] ?? 0, o.nearFade?.[1] ?? 0) },
        },
      ]),
      transparent: true,
      depthWrite: o.depthWrite ?? false,
      blending: o.blending === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: o.fog ?? true,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.renderOrder ?? 10;
  }

  get ambient(): THREE.Color {
    return this.material.uniforms.uAmbient.value;
  }

  emit(
    px: number, py: number, pz: number,
    vx: number, vy: number, vz: number,
    life: number,
    s0: number, s1: number,
    r0: number, g0: number, b0: number, a0: number,
    r1: number, g1: number, b1: number, a1: number,
    drag = 0, gravity = 0, rot = 0, rotSpeed = 0, delay = 0,
  ) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    if (this.head === 0) this.wrapped = true;
    const i3 = i * 3;
    const i4 = i * 4;
    this.pos[i3] = px;
    this.pos[i3 + 1] = py;
    this.pos[i3 + 2] = pz;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.time[i4] = this.now + delay;
    this.time[i4 + 1] = life;
    this.time[i4 + 2] = drag;
    this.time[i4 + 3] = gravity;
    this.size[i4] = s0;
    this.size[i4 + 1] = s1;
    this.size[i4 + 2] = rot;
    this.size[i4 + 3] = rotSpeed;
    this.c0[i4] = r0;
    this.c0[i4 + 1] = g0;
    this.c0[i4 + 2] = b0;
    this.c0[i4 + 3] = a0;
    this.c1[i4] = r1;
    this.c1[i4 + 1] = g1;
    this.c1[i4 + 2] = b1;
    this.c1[i4 + 3] = a1;
    if (i < this.dMin) this.dMin = i;
    if (i > this.dMax) this.dMax = i;
  }

  update(time: number) {
    this.now = time;
    this.material.uniforms.uTime.value = time;
    if (this.dMax < this.dMin) return;
    let a = this.dMin;
    let n = this.dMax - this.dMin + 1;
    if (this.wrapped) {
      a = 0;
      n = this.max;
      this.wrapped = false;
    }
    const sizes = [3, 3, 4, 4, 4, 4];
    this.attrs.forEach((at, k) => {
      at.clearUpdateRanges();
      at.addUpdateRange(a * sizes[k], n * sizes[k]);
      at.needsUpdate = true;
    });
    this.dMin = Infinity;
    this.dMax = -1;
  }

  /** Kills all live particles. */
  clear() {
    for (let i = 0; i < this.max; i++) this.time[i * 4] = -1000;
    this.wrapped = true;
    this.dMin = 0;
    this.dMax = this.max - 1;
  }
}
