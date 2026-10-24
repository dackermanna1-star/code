// Particle systems:
//  * Debris: small voxel cubes simulated on the CPU, colliding with the voxel world, rendered as instanced
//    lit cubes in the G-buffer (and shadow maps). Resting debris may settle into the world as rubble voxels.
//  * Billboards: smoke, dust, fire, sparks, flashes. Soft, depth-faded, lit (sun shadows, ambient, point
//    lights) with a pseudo-volumetric spherical shading and animated noise.

import { GL, Program, GLSL_HEADER } from './gl';
import { Renderer, GeometryPass, ForwardPass } from './renderer';
import { MAX_LIGHTS, NUM_CASCADES } from './shaders';
import { World, VOXEL } from '../world/world';
import { PAL_RUBBLE, PAL_MAT, Mat } from '../world/materials';
import { hash3 } from '../engine/math';

export const enum PT { Smoke = 0, Dust = 1, Fire = 2, Spark = 3, Flash = 4, Steam = 5, Ember = 6, Shock = 7 }

// --------------------------------------------------------------------------- shaders
const CUBE_VS = GLSL_HEADER + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 iPosSize;
layout(location=3) in vec4 iQuat;
layout(location=4) in vec4 iPrevPal;
uniform mat4 uViewProj;
uniform mat4 uPrevViewProj;
uniform vec2 uJitter;
out vec3 vNormal;
out vec4 vCur;
out vec4 vPrev;
out vec3 vLocal;
flat out uint vPal;
vec3 qrot(vec4 q, vec3 v) { vec3 t = 2.0 * cross(q.xyz, v); return v + q.w * t + cross(q.xyz, t); }
void main() {
  vec3 lp = qrot(iQuat, aPos * iPosSize.w);
  vec3 wp = lp + iPosSize.xyz;
  vec3 pwp = lp + iPrevPal.xyz;
  vNormal = qrot(iQuat, aNrm);
  vLocal = aPos;
  vPal = uint(iPrevPal.w + 0.5);
  vec4 c = uViewProj * vec4(wp, 1.0);
  vCur = c; vPrev = uPrevViewProj * vec4(pwp, 1.0);
  c.xy += uJitter * c.w;
  gl_Position = c;
}`;

const CUBE_FS = GLSL_HEADER + `
in vec3 vNormal;
in vec4 vCur;
in vec4 vPrev;
in vec3 vLocal;
flat in uint vPal;
uniform sampler2D uPalAlbedo;
uniform sampler2D uPalParams;
layout(location=0) out vec4 oAlbedo;
layout(location=1) out vec4 oNormal;
layout(location=2) out vec4 oMat;
void main() {
  vec3 alb = texelFetch(uPalAlbedo, ivec2(int(vPal), 0), 0).rgb;
  vec4 prm = texelFetch(uPalParams, ivec2(int(vPal), 0), 0);
  // subtle edge darkening so tiny cubes read as voxels
  vec3 a = abs(vLocal) * 2.0;
  float e = max(max(min(a.x, a.y), min(a.y, a.z)), min(a.x, a.z));
  alb *= 1.0 - 0.18 * smoothstep(0.82, 1.0, e);
  vec2 vel = (vCur.xy / vCur.w - vPrev.xy / vPrev.w) * 0.5;
  oAlbedo = vec4(alb, prm.b);
  oNormal = vec4(normalize(vNormal) * 0.5 + 0.5, 0.85);
  oMat = vec4(vel, prm.r, prm.g);
}`;

const CUBE_SHADOW_VS = GLSL_HEADER + `
layout(location=0) in vec3 aPos;
layout(location=2) in vec4 iPosSize;
layout(location=3) in vec4 iQuat;
uniform mat4 uLightVP;
vec3 qrot(vec4 q, vec3 v) { vec3 t = 2.0 * cross(q.xyz, v); return v + q.w * t + cross(q.xyz, t); }
void main() { gl_Position = uLightVP * vec4(qrot(iQuat, aPos * iPosSize.w) + iPosSize.xyz, 1.0); }`;

const SHADOW_FS = GLSL_HEADER + `void main() {}`;

const BB_VS = GLSL_HEADER + `
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iPosSize;
layout(location=2) in vec4 iColor;
layout(location=3) in vec4 iVelRot;
layout(location=4) in vec4 iParams; // type, emissive, lifeFrac, seed
uniform mat4 uViewProj;
uniform vec2 uJitter;
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform sampler2DArrayShadow uShadow;
uniform mat4 uCascadeVP[${NUM_CASCADES}];
uniform vec4 uCascadeSplits;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uGroundColor;
uniform float uAmbient;
uniform vec4 uLightPos[${MAX_LIGHTS}];
uniform vec4 uLightCol[${MAX_LIGHTS}];
uniform int uLightCount;
out vec2 vUV;
out vec4 vColor;
out vec3 vSun;
out vec3 vAmb;
out float vDepth;
flat out int vType;
out float vSeed;
out float vLife;
out float vEmis;
out vec3 vViewSun;
void main() {
  vec3 p = iPosSize.xyz;
  float s = iPosSize.w;
  int type = int(iParams.x + 0.5);
  vec3 toCam = uCamPos - p;
  vec3 viewDir = -normalize(toCam);
  vec3 right, up;
  if (type == 3) {
    vec3 v = iVelRot.xyz;
    vec3 vp = v - viewDir * dot(v, viewDir);
    float len = length(vp);
    vec3 d = len > 1e-4 ? vp / len : uCamUp;
    up = d * (s + len * 0.022);
    right = normalize(cross(d, viewDir)) * s * 0.35;
  } else {
    float c = cos(iVelRot.w), sn = sin(iVelRot.w);
    right = (uCamRight * c + uCamUp * sn) * s;
    up = (-uCamRight * sn + uCamUp * c) * s;
  }
  vec3 wp = p + right * aCorner.x + up * aCorner.y;
  // pull the quad towards the camera a bit so big smoke does not clip into geometry too hard
  vec4 clip = uViewProj * vec4(wp, 1.0);
  vDepth = dot(-toCam, viewDir) ;
  clip.xy += uJitter * clip.w;
  gl_Position = clip;
  vUV = aCorner;
  vColor = iColor;
  vType = type;
  vEmis = iParams.y;
  vLife = iParams.z;
  vSeed = iParams.w;
  // ---- lighting at particle center (smoke / dust / steam)
  float dist = length(toCam);
  float sh = 1.0;
  if (type == 0 || type == 1 || type == 5) {
    int ci = dist > uCascadeSplits.x ? (dist > uCascadeSplits.y ? (dist > uCascadeSplits.z ? 3 : 2) : 1) : 0;
    if (dist < uCascadeSplits.w) {
      vec4 lp = uCascadeVP[ci] * vec4(p, 1.0);
      vec3 sc = lp.xyz / lp.w * 0.5 + 0.5;
      if (sc.x > 0.0 && sc.y > 0.0 && sc.x < 1.0 && sc.y < 1.0) {
        // average a few taps spread over the particle size for soft volumetric shadowing
        float acc = 0.0;
        for (int k = 0; k < 4; k++) {
          vec3 o = vec3(float(k & 1) - 0.5, 0.0, float(k >> 1) - 0.5) * s * 0.8;
          vec4 l2 = uCascadeVP[ci] * vec4(p + o, 1.0);
          vec3 s2 = l2.xyz / l2.w * 0.5 + 0.5;
          acc += texture(uShadow, vec4(s2.xy, float(ci), s2.z - 0.002));
        }
        sh = acc * 0.25;
      }
    }
    vec3 pl = vec3(0.0);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= uLightCount) break;
      vec3 L = uLightPos[i].xyz - p;
      float d2 = dot(L, L), r2 = uLightPos[i].w * uLightPos[i].w;
      if (d2 > r2) continue;
      float win = 1.0 - d2 / r2; win *= win;
      pl += uLightCol[i].rgb * win / (d2 + 0.5) * 0.6;
    }
    vSun = uSunColor * sh;
    vAmb = mix(uGroundColor, mix(uSkyHorizon, uSkyZenith, 0.5), 0.7) * uAmbient + pl;
  } else { vSun = vec3(0.0); vAmb = vec3(0.0); }
  // sun direction in billboard space (for pseudo-volumetric shading)
  vec3 rn = normalize(right), un = normalize(up);
  vViewSun = vec3(dot(uSunDir, rn), dot(uSunDir, un), dot(uSunDir, -viewDir));
}`;

const BB_FS = GLSL_HEADER + `
in vec2 vUV;
in vec4 vColor;
in vec3 vSun;
in vec3 vAmb;
in float vDepth;
flat in int vType;
in float vSeed;
in float vLife;
in float vEmis;
in vec3 vViewSun;
uniform sampler2D uNoise;
uniform sampler2D uLinDepth;
uniform vec2 uRes;
uniform float uTime;
out vec4 oColor;
void main() {
  float r2 = dot(vUV, vUV);
  if (r2 > 1.0) discard;
  float sceneD = texelFetch(uLinDepth, ivec2(gl_FragCoord.xy), 0).r;
  if (vType == 3) {
    // spark: bright streak
    float a = (1.0 - abs(vUV.x)) * smoothstep(1.0, 0.3, abs(vUV.y));
    vec3 c = vColor.rgb * vEmis * a;
    oColor = vec4(c, 0.0);
    return;
  }
  vec2 nuv = vUV * 0.42 + vec2(vSeed * 7.31, vSeed * 3.17) + vec2(uTime * 0.01, -uTime * 0.015);
  vec4 nz = texture(uNoise, nuv);
  vec4 nz2 = texture(uNoise, nuv * 2.13 + vec2(0.37, 0.71));
  float n = nz.r * 0.65 + nz2.g * 0.35;
  float edge = 1.0 - sqrt(r2);
  if (vType == 2 || vType == 4 || vType == 6) {
    // fire / flash / ember (additive)
    float d = smoothstep(0.0, 0.7, edge) * (0.55 + 0.9 * n);
    if (vType == 4) d = pow(edge, 1.6);
    if (vType == 6) d = smoothstep(0.0, 0.8, edge);
    float life = vLife;
    vec3 hot = vec3(1.0, 0.93, 0.75), mid = vec3(1.0, 0.45, 0.08), cool = vec3(0.6, 0.12, 0.02);
    vec3 c = life < 0.3 ? mix(hot, mid, life / 0.3) : mix(mid, cool, (life - 0.3) / 0.7);
    if (vType != 2) c = vColor.rgb;
    float fade = clamp((sceneD - vDepth) / 0.6, 0.0, 1.0);
    oColor = vec4(c * vEmis * d * vColor.a * fade, 0.0);
    return;
  }
  // smoke / dust / steam: alpha blended, pseudo-volumetric shading
  float density = smoothstep(0.0, 0.85, edge) * (0.35 + 0.85 * n);
  density = clamp(density - (1.0 - vColor.a) * 0.6, 0.0, 1.0) * vColor.a;
  vec3 nrm = normalize(vec3(vUV * 1.1 + (nz.gb - 0.5) * 0.9, sqrt(max(0.0, 1.0 - r2)) + 0.25));
  float diff = clamp(dot(nrm, normalize(vViewSun)) * 0.55 + 0.45, 0.0, 1.0);
  // forward scattering when looking towards the sun
  float fwd = pow(clamp(-vViewSun.z, 0.0, 1.0), 6.0) * 0.6;
  vec3 col = vColor.rgb * (vSun * (diff + fwd) * 0.9 + vAmb * (0.55 + 0.45 * nrm.y));
  float soft = vType == 1 ? 0.25 : 0.8;
  float fade = clamp((sceneD - vDepth) / soft, 0.0, 1.0);
  // fade near the camera
  fade *= smoothstep(0.2, 1.2, vDepth);
  float alpha = density * fade;
  oColor = vec4(col * alpha, alpha);
}`;

// --------------------------------------------------------------------------- cube mesh
function cubeMesh(): Float32Array {
  const f: number[] = [];
  const faces = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  ];
  for (const [n, u, v] of faces) {
    const c = (a: number, b: number) => [n[0] * 0.5 + u[0] * a + v[0] * b, n[1] * 0.5 + u[1] * a + v[1] * b, n[2] * 0.5 + u[2] * a + v[2] * b];
    const quad = [c(-0.5, -0.5), c(0.5, -0.5), c(-0.5, 0.5), c(-0.5, 0.5), c(0.5, -0.5), c(0.5, 0.5)];
    for (const p of quad) f.push(p[0], p[1], p[2], n[0], n[1], n[2]);
  }
  return new Float32Array(f);
}

function noiseTexture(gl: GL): WebGLTexture {
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const lattice = (x: number, y: number, period: number, seed: number) => hash3(((x % period) + period) % period, ((y % period) + period) % period, seed) / 4294967296;
  const vn = (x: number, y: number, period: number, seed: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = lattice(xi, yi, period, seed), b = lattice(xi + 1, yi, period, seed), c = lattice(xi, yi + 1, period, seed), d = lattice(xi + 1, yi + 1, period, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    for (let ch = 0; ch < 4; ch++) {
      let s = 0, amp = 0.5, tot = 0;
      for (let o = 0; o < 5; o++) {
        const period = 4 << o;
        s += amp * vn((x / N) * period, (y / N) * period, period, ch * 31 + o * 7);
        tot += amp; amp *= 0.5;
      }
      data[(x + y * N) * 4 + ch] = Math.round((s / tot) * 255);
    }
  }
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return t;
}

// --------------------------------------------------------------------------- systems
export class Particles implements GeometryPass, ForwardPass {
  // debris cubes
  readonly DMAX = 9000;
  dn = 0;
  private dP = new Float32Array(this.DMAX * 3);
  private dPrev = new Float32Array(this.DMAX * 3);
  private dV = new Float32Array(this.DMAX * 3);
  private dQ = new Float32Array(this.DMAX * 4);
  private dW = new Float32Array(this.DMAX * 3);
  private dSize = new Float32Array(this.DMAX);
  private dPal = new Uint8Array(this.DMAX);
  private dLife = new Float32Array(this.DMAX);
  private dRest = new Float32Array(this.DMAX);
  private dInst = new Float32Array(this.DMAX * 12);
  // billboards
  readonly BMAX = 14000;
  bn = 0;
  private bP = new Float32Array(this.BMAX * 3);
  private bV = new Float32Array(this.BMAX * 3);
  private bSize = new Float32Array(this.BMAX);
  private bGrow = new Float32Array(this.BMAX);
  private bLife = new Float32Array(this.BMAX);
  private bMax = new Float32Array(this.BMAX);
  private bCol = new Float32Array(this.BMAX * 4);
  private bType = new Uint8Array(this.BMAX);
  private bRot = new Float32Array(this.BMAX);
  private bRotV = new Float32Array(this.BMAX);
  private bDrag = new Float32Array(this.BMAX);
  private bBuoy = new Float32Array(this.BMAX);
  private bEmis = new Float32Array(this.BMAX);
  private bSeed = new Float32Array(this.BMAX);
  private bInst = new Float32Array(this.BMAX * 16);
  private order = new Uint32Array(this.BMAX);
  private keys = new Float32Array(this.BMAX);

  // GL
  private pCube: Program; private pCubeShadow: Program; private pBB: Program;
  private cubeVao: WebGLVertexArrayObject; private cubeInstBuf: WebGLBuffer;
  private cubeShadowVao: WebGLVertexArrayObject;
  private bbVao: WebGLVertexArrayObject; private bbInstBuf: WebGLBuffer;
  private noise: WebGLTexture;
  private uploadedCubes = 0;
  /** wind (m/s) */
  windX = 0.6; windZ = 0.25;
  /** called when debris settles into a world voxel (for remeshing stats etc.) */
  depositChance = 0.35;
  maxDepositsPerFrame = 40;
  private depositsThisFrame = 0;

  constructor(readonly gl: GL, readonly world: World) {
    this.pCube = new Program(gl, CUBE_VS, CUBE_FS, 'debrisCube');
    this.pCubeShadow = new Program(gl, CUBE_SHADOW_VS, SHADOW_FS, 'debrisShadow');
    this.pBB = new Program(gl, BB_VS, BB_FS, 'billboard');
    this.noise = noiseTexture(gl);
    // cube VAO
    const cube = cubeMesh();
    const cubeBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cube, gl.STATIC_DRAW);
    this.cubeInstBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeInstBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.dInst.byteLength, gl.DYNAMIC_DRAW);
    const mkCubeVao = (withNormal: boolean) => {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      if (withNormal) { gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12); }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeInstBuf);
      for (let i = 0; i < 3; i++) {
        gl.enableVertexAttribArray(2 + i);
        gl.vertexAttribPointer(2 + i, 4, gl.FLOAT, false, 48, i * 16);
        gl.vertexAttribDivisor(2 + i, 1);
      }
      gl.bindVertexArray(null);
      return vao;
    };
    this.cubeVao = mkCubeVao(true);
    this.cubeShadowVao = mkCubeVao(false);
    // billboard VAO
    const corners = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const cb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
    this.bbInstBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bbInstBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.bInst.byteLength, gl.DYNAMIC_DRAW);
    this.bbVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.bbVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bbInstBuf);
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 64, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);
  }

  // ------------------------------------------------------------------ spawning
  debris(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, pal: number, life = 6): void {
    let i: number;
    if (this.dn < this.DMAX) i = this.dn++;
    else i = (Math.random() * this.DMAX) | 0; // recycle a random one
    this.dP[i * 3] = x; this.dP[i * 3 + 1] = y; this.dP[i * 3 + 2] = z;
    this.dPrev[i * 3] = x; this.dPrev[i * 3 + 1] = y; this.dPrev[i * 3 + 2] = z;
    this.dV[i * 3] = vx; this.dV[i * 3 + 1] = vy; this.dV[i * 3 + 2] = vz;
    const a = Math.random() * 6.28, b = Math.random() * 6.28;
    const s1 = Math.sin(a), c1 = Math.cos(a);
    this.dQ[i * 4] = s1 * Math.cos(b); this.dQ[i * 4 + 1] = s1 * Math.sin(b) * 0.7; this.dQ[i * 4 + 2] = s1 * 0.3; this.dQ[i * 4 + 3] = c1;
    const ql = Math.hypot(this.dQ[i * 4], this.dQ[i * 4 + 1], this.dQ[i * 4 + 2], this.dQ[i * 4 + 3]);
    for (let k = 0; k < 4; k++) this.dQ[i * 4 + k] /= ql;
    this.dW[i * 3] = (Math.random() - 0.5) * 20; this.dW[i * 3 + 1] = (Math.random() - 0.5) * 20; this.dW[i * 3 + 2] = (Math.random() - 0.5) * 20;
    this.dSize[i] = size; this.dPal[i] = pal; this.dLife[i] = life * (0.7 + Math.random() * 0.6); this.dRest[i] = 0;
  }

  spawn(type: PT, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number,
    r: number, g: number, b: number, a: number, opts?: { grow?: number; drag?: number; buoy?: number; emissive?: number; rotV?: number }): void {
    let i: number;
    if (this.bn < this.BMAX) i = this.bn++;
    else { i = (Math.random() * this.BMAX) | 0; }
    this.bP[i * 3] = x; this.bP[i * 3 + 1] = y; this.bP[i * 3 + 2] = z;
    this.bV[i * 3] = vx; this.bV[i * 3 + 1] = vy; this.bV[i * 3 + 2] = vz;
    this.bSize[i] = size; this.bGrow[i] = opts?.grow ?? 0; this.bLife[i] = life; this.bMax[i] = life;
    this.bCol[i * 4] = r; this.bCol[i * 4 + 1] = g; this.bCol[i * 4 + 2] = b; this.bCol[i * 4 + 3] = a;
    this.bType[i] = type; this.bRot[i] = Math.random() * 6.28; this.bRotV[i] = opts?.rotV ?? (Math.random() - 0.5) * 0.6;
    this.bDrag[i] = opts?.drag ?? 1.0; this.bBuoy[i] = opts?.buoy ?? 0; this.bEmis[i] = opts?.emissive ?? 1; this.bSeed[i] = Math.random();
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number): void {
    this.depositsThisFrame = 0;
    const w = this.world;
    // debris
    const P = this.dP, V = this.dV, Q = this.dQ, Wv = this.dW, PR = this.dPrev;
    for (let i = 0; i < this.dn; i++) {
      PR[i * 3] = P[i * 3]; PR[i * 3 + 1] = P[i * 3 + 1]; PR[i * 3 + 2] = P[i * 3 + 2];
      this.dLife[i] -= dt;
      if (this.dLife[i] <= 0) {
        if (this.dLife[i] < -0.6) { this.killDebris(i); i--; continue; }
        this.dSize[i] *= 1 - dt * 3; // shrink away
      }
      let vx = V[i * 3], vy = V[i * 3 + 1] - 9.81 * dt, vz = V[i * 3 + 2];
      const drag = 1 / (1 + dt * 0.25);
      vx *= drag; vy *= drag; vz *= drag;
      let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      let grounded = false;
      // axis-separated collision with the voxel grid
      const half = this.dSize[i] * 0.5;
      let nx = x + vx * dt;
      if (w.get(Math.floor(nx * 10), Math.floor(y * 10), Math.floor(z * 10))) { vx = -vx * 0.25; vy *= 0.8; vz *= 0.8; nx = x; }
      x = nx;
      let ny = y + vy * dt;
      if (w.get(Math.floor(x * 10), Math.floor((ny - half) * 10), Math.floor(z * 10))) {
        if (vy < 0) { grounded = true; ny = Math.floor((ny - half) * 10 + 1) * VOXEL + half; }
        else ny = y;
        vy = -vy * 0.22; vx *= 0.55; vz *= 0.55;
        if (Math.abs(vy) < 0.4) vy = 0;
      }
      y = ny;
      let nz = z + vz * dt;
      if (w.get(Math.floor(x * 10), Math.floor(y * 10), Math.floor(nz * 10))) { vz = -vz * 0.25; vx *= 0.8; vy *= 0.8; nz = z; }
      z = nz;
      P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
      V[i * 3] = vx; V[i * 3 + 1] = vy; V[i * 3 + 2] = vz;
      // rotation
      let wx = Wv[i * 3], wy = Wv[i * 3 + 1], wz = Wv[i * 3 + 2];
      if (grounded) { wx *= 0.7; wy *= 0.7; wz *= 0.7; Wv[i * 3] = wx; Wv[i * 3 + 1] = wy; Wv[i * 3 + 2] = wz; }
      const hx = wx * dt * 0.5, hy = wy * dt * 0.5, hz = wz * dt * 0.5;
      const qx = Q[i * 4], qy = Q[i * 4 + 1], qz = Q[i * 4 + 2], qw = Q[i * 4 + 3];
      let ax = qx + hx * qw + hy * qz - hz * qy, ay = qy + hy * qw + hz * qx - hx * qz, az = qz + hz * qw + hx * qy - hy * qx, aw = qw - hx * qx - hy * qy - hz * qz;
      const ql = 1 / Math.hypot(ax, ay, az, aw);
      Q[i * 4] = ax * ql; Q[i * 4 + 1] = ay * ql; Q[i * 4 + 2] = az * ql; Q[i * 4 + 3] = aw * ql;
      // rest -> deposit as rubble or fade
      const sp = vx * vx + vy * vy + vz * vz;
      if (grounded && sp < 0.05) {
        this.dRest[i] += dt;
        if (this.dRest[i] > 0.6) {
          if (this.dSize[i] >= 0.07 && this.depositsThisFrame < this.maxDepositsPerFrame && Math.random() < this.depositChance) {
            const gx = Math.floor(x * 10), gy = Math.floor(y * 10), gz = Math.floor(z * 10);
            const pal = this.dPal[i];
            const rubble = PAL_RUBBLE[pal] || (PAL_MAT[pal] === Mat.Glass ? 0 : pal);
            if (rubble && !w.get(gx, gy, gz) && w.get(gx, gy - 1, gz)) {
              w.set(gx, gy, gz, rubble);
              this.depositsThisFrame++;
              this.killDebris(i); i--; continue;
            }
          }
          if (this.dLife[i] > 0.5) this.dLife[i] = Math.min(this.dLife[i], 2.5 + Math.random() * 2);
        }
      } else this.dRest[i] = 0;
      if (y < -10) { this.killDebris(i); i--; continue; }
    }
    // billboards
    const bP = this.bP, bV = this.bV;
    for (let i = 0; i < this.bn; i++) {
      this.bLife[i] -= dt;
      if (this.bLife[i] <= 0) { this.killBB(i); i--; continue; }
      const t = this.bType[i];
      const drag = 1 / (1 + dt * this.bDrag[i]);
      let vx = bV[i * 3] * drag, vy = bV[i * 3 + 1] * drag, vz = bV[i * 3 + 2] * drag;
      vy += this.bBuoy[i] * dt;
      if (t === PT.Spark || t === PT.Ember) vy -= 9.81 * dt * (t === PT.Ember ? 0.15 : 1);
      if (t === PT.Smoke || t === PT.Dust || t === PT.Steam) {
        const wf = Math.min(1, (this.bMax[i] - this.bLife[i]) * 0.4);
        vx += (this.windX - vx) * dt * 0.3 * wf;
        vz += (this.windZ - vz) * dt * 0.3 * wf;
      }
      let x = bP[i * 3] + vx * dt, y = bP[i * 3 + 1] + vy * dt, z = bP[i * 3 + 2] + vz * dt;
      if (t === PT.Spark) {
        if (this.world.get(Math.floor(x * 10), Math.floor(y * 10), Math.floor(z * 10))) {
          // bounce
          y = bP[i * 3 + 1]; vy = -vy * 0.35; vx *= 0.6; vz *= 0.6;
          x = bP[i * 3]; z = bP[i * 3 + 2];
          this.bLife[i] *= 0.8;
        }
      } else if (t === PT.Smoke || t === PT.Dust) {
        // keep smoke out of solid ground a bit
        if (vy < 0 && this.world.get(Math.floor(x * 10), Math.floor((y - this.bSize[i] * 0.3) * 10), Math.floor(z * 10))) { vy = 0.2; y = bP[i * 3 + 1]; }
      }
      bP[i * 3] = x; bP[i * 3 + 1] = y; bP[i * 3 + 2] = z;
      bV[i * 3] = vx; bV[i * 3 + 1] = vy; bV[i * 3 + 2] = vz;
      this.bSize[i] += this.bGrow[i] * dt;
      this.bRot[i] += this.bRotV[i] * dt;
    }
  }

  private killDebris(i: number): void {
    const j = --this.dn;
    if (i === j) return;
    for (let k = 0; k < 3; k++) { this.dP[i * 3 + k] = this.dP[j * 3 + k]; this.dPrev[i * 3 + k] = this.dPrev[j * 3 + k]; this.dV[i * 3 + k] = this.dV[j * 3 + k]; this.dW[i * 3 + k] = this.dW[j * 3 + k]; }
    for (let k = 0; k < 4; k++) this.dQ[i * 4 + k] = this.dQ[j * 4 + k];
    this.dSize[i] = this.dSize[j]; this.dPal[i] = this.dPal[j]; this.dLife[i] = this.dLife[j]; this.dRest[i] = this.dRest[j];
  }

  private killBB(i: number): void {
    const j = --this.bn;
    if (i === j) return;
    for (let k = 0; k < 3; k++) { this.bP[i * 3 + k] = this.bP[j * 3 + k]; this.bV[i * 3 + k] = this.bV[j * 3 + k]; }
    for (let k = 0; k < 4; k++) this.bCol[i * 4 + k] = this.bCol[j * 4 + k];
    this.bSize[i] = this.bSize[j]; this.bGrow[i] = this.bGrow[j]; this.bLife[i] = this.bLife[j]; this.bMax[i] = this.bMax[j];
    this.bType[i] = this.bType[j]; this.bRot[i] = this.bRot[j]; this.bRotV[i] = this.bRotV[j]; this.bDrag[i] = this.bDrag[j];
    this.bBuoy[i] = this.bBuoy[j]; this.bEmis[i] = this.bEmis[j]; this.bSeed[i] = this.bSeed[j];
  }

  // ------------------------------------------------------------------ rendering
  private uploadCubes(alpha: number): void {
    const n = this.dn, I = this.dInst;
    for (let i = 0; i < n; i++) {
      const o = i * 12;
      const px = this.dPrev[i * 3] + (this.dP[i * 3] - this.dPrev[i * 3]) * alpha;
      const py = this.dPrev[i * 3 + 1] + (this.dP[i * 3 + 1] - this.dPrev[i * 3 + 1]) * alpha;
      const pz = this.dPrev[i * 3 + 2] + (this.dP[i * 3 + 2] - this.dPrev[i * 3 + 2]) * alpha;
      I[o] = px; I[o + 1] = py; I[o + 2] = pz; I[o + 3] = this.dSize[i];
      I[o + 4] = this.dQ[i * 4]; I[o + 5] = this.dQ[i * 4 + 1]; I[o + 6] = this.dQ[i * 4 + 2]; I[o + 7] = this.dQ[i * 4 + 3];
      I[o + 8] = this.dPrev[i * 3]; I[o + 9] = this.dPrev[i * 3 + 1]; I[o + 10] = this.dPrev[i * 3 + 2]; I[o + 11] = this.dPal[i];
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeInstBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, I, 0, n * 12);
    this.uploadedCubes = n;
  }

  /** Called once per frame before rendering. */
  prepare(alpha: number): void { this.uploadCubes(alpha); }

  drawGBuffer(r: Renderer): void {
    if (this.uploadedCubes === 0) return;
    const gl = this.gl;
    const p = this.pCube.use();
    p.m4('uViewProj', r.viewProj).m4('uPrevViewProj', r.prevViewProj).f2('uJitter', r.jitter[0], r.jitter[1]);
    p.tex('uPalAlbedo', 2, r.palAlbedo).tex('uPalParams', 3, r.palParams);
    gl.bindVertexArray(this.cubeVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, this.uploadedCubes);
  }

  drawShadow(r: Renderer, lightVP: Float32Array, cascade: number): void {
    if (this.uploadedCubes === 0 || cascade > 1) return;
    const gl = this.gl;
    const p = this.pCubeShadow.use();
    p.m4('uLightVP', lightVP);
    gl.bindVertexArray(this.cubeShadowVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, this.uploadedCubes);
  }

  draw(r: Renderer): void {
    const n = this.bn;
    if (n === 0) return;
    const gl = this.gl;
    const cam = r.cam;
    // sort alpha-blended types back to front, additive ones after
    const v = cam.view;
    const fx = -v[2], fy = -v[6], fz = -v[10];
    let na = 0, nadd = 0;
    const order = this.order, keys = this.keys;
    for (let i = 0; i < n; i++) {
      const t = this.bType[i];
      if (t === PT.Smoke || t === PT.Dust || t === PT.Steam) {
        keys[i] = (this.bP[i * 3] - cam.x) * fx + (this.bP[i * 3 + 1] - cam.y) * fy + (this.bP[i * 3 + 2] - cam.z) * fz;
        order[na++] = i;
      }
    }
    const alphaIdx = Array.from(order.subarray(0, na)).sort((a, b) => keys[b] - keys[a]);
    const I = this.bInst;
    let o = 0;
    const write = (i: number) => {
      const life = 1 - this.bLife[i] / this.bMax[i];
      let a = this.bCol[i * 4 + 3];
      const t = this.bType[i];
      // fade in quickly, fade out over the last part of life
      if (t === PT.Smoke || t === PT.Dust || t === PT.Steam) a *= Math.min(1, life * 8) * Math.min(1, (1 - life) * 2.2);
      else if (t === PT.Fire) a *= Math.min(1, (1 - life) * 3);
      else if (t === PT.Flash) a *= (1 - life) * (1 - life);
      else a *= Math.min(1, (1 - life) * 4);
      I[o] = this.bP[i * 3]; I[o + 1] = this.bP[i * 3 + 1]; I[o + 2] = this.bP[i * 3 + 2]; I[o + 3] = this.bSize[i];
      I[o + 4] = this.bCol[i * 4]; I[o + 5] = this.bCol[i * 4 + 1]; I[o + 6] = this.bCol[i * 4 + 2]; I[o + 7] = a;
      I[o + 8] = this.bV[i * 3]; I[o + 9] = this.bV[i * 3 + 1]; I[o + 10] = this.bV[i * 3 + 2]; I[o + 11] = this.bRot[i];
      I[o + 12] = t; I[o + 13] = this.bEmis[i]; I[o + 14] = life; I[o + 15] = this.bSeed[i];
      o += 16;
    };
    for (const i of alphaIdx) write(i);
    for (let i = 0; i < n; i++) {
      const t = this.bType[i];
      if (t === PT.Smoke || t === PT.Dust || t === PT.Steam) continue;
      write(i); nadd++;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bbInstBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, I, 0, o);
    const p = this.pBB.use();
    p.m4('uViewProj', r.viewProj).f2('uJitter', r.jitter[0], r.jitter[1]).f3('uCamPos', cam.x, cam.y, cam.z);
    p.f3('uCamRight', v[0], v[4], v[8]).f3('uCamUp', v[1], v[5], v[9]);
    p.tex('uShadow', 5, r.shadowTex, gl.TEXTURE_2D_ARRAY);
    r.setCascadeUniforms(p);
    r.setEnvUniforms(p, r.env, cam);
    p.f4v('uLightPos', r.lightPos).f4v('uLightCol', r.lightCol).i('uLightCount', r.lightCount);
    p.tex('uNoise', 6, this.noise).tex('uLinDepth', 7, r.linDepth).f2('uRes', r.w, r.h).f('uTime', r.time);
    gl.bindVertexArray(this.bbVao);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    if (na > 0) {
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, na);
    }
    if (nadd > 0) {
      gl.blendFunc(gl.ONE, gl.ONE);
      // draw additive instances: they start at offset na in the buffer
      for (let k = 0; k < 4; k++) gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, 64, na * 64 + k * 16);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nadd);
      for (let k = 0; k < 4; k++) gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, 64, k * 16);
    }
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
  }
}
