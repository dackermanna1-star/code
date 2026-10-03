import * as THREE from 'three';
import { G } from '../core/G';

const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false } as const;

// ------------------------------------------------------------------ slashes
const MAXSL = 220;
const SEGS = 24;

const SLASH_VERT = /* glsl */ `
attribute float aU; attribute float aSide;
attribute vec3 iColor; attribute float iFade; attribute float iThick; attribute float iBulge;
varying float vSide; varying float vU; varying vec3 vCol; varying float vFade;
void main(){
  vec3 local = vec3(aU * 0.5, iBulge * (1.0 - aU * aU), 0.0);
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(local, 1.0);
  vec3 ny = normalize(mat3(m) * vec3(0.0, 1.0, 0.0));
  float taper = 1.0 - aU * aU;
  wp.xyz += ny * aSide * iThick * 0.5 * (0.2 + 0.8 * taper);
  vSide = aSide; vU = aU; vCol = iColor; vFade = iFade;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const SLASH_FRAG = /* glsl */ `
varying float vSide; varying float vU; varying vec3 vCol; varying float vFade;
void main(){
  float core = exp(-vSide * vSide * 22.0);
  float glow = exp(-vSide * vSide * 3.0) * 0.4;
  float tip = smoothstep(1.0, 0.7, abs(vU));
  vec3 col = mix(vCol, vec3(1.6, 1.55, 1.5), core * 0.85) * (core * 2.4 + glow) * tip * vFade;
  gl_FragColor = vec4(col, 1.0);
}`;

export interface SlashSpec {
  pos: THREE.Vector3;
  /** Travel direction (the slash faces along it). */
  fwd: THREE.Vector3;
  /** Direction of the blade's edge (perpendicular to fwd). */
  axis: THREE.Vector3;
  len: number;
  thick?: number;
  bulge?: number;
  color?: [number, number, number];
  fade?: number;
}

interface Flash {
  pos: THREE.Vector3;
  fwd: THREE.Vector3;
  axis: THREE.Vector3;
  len: number;
  thick: number;
  bulge: number;
  color: [number, number, number];
  t: number;
  life: number;
  delay: number;
}

/**
 * Crescent slash ribbons, the visible edge of Dismantle and Cleave. Flashes
 * live on their own for a moment; moving slashes are drawn fresh each frame.
 * Thickness never drops below a couple of pixels so far cuts still read.
 */
export class Slashes {
  readonly mesh: THREE.InstancedMesh;
  private col: THREE.InstancedBufferAttribute;
  private fade: THREE.InstancedBufferAttribute;
  private thick: THREE.InstancedBufferAttribute;
  private bulge: THREE.InstancedBufferAttribute;
  private flashes: Flash[] = [];
  private once: SlashSpec[] = [];
  private shown = 0;
  private m = new THREE.Matrix4();
  private x = new THREE.Vector3();
  private y = new THREE.Vector3();
  private z = new THREE.Vector3();
  private cp = new THREE.Vector3();

  constructor(scene: THREE.Scene, private camera: () => THREE.PerspectiveCamera = () => G.camera) {
    const g = new THREE.BufferGeometry();
    const pos: number[] = [];
    const u: number[] = [];
    const side: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= SEGS; i++) {
      const t = (i / SEGS) * 2 - 1;
      for (const s of [-1, 1]) {
        pos.push(t * 0.5, 0, 0);
        u.push(t);
        side.push(s);
      }
      if (i < SEGS) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aU', new THREE.Float32BufferAttribute(u, 1));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    g.setIndex(idx);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(MAXSL * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(MAXSL), 1).setUsage(THREE.DynamicDrawUsage);
    this.thick = new THREE.InstancedBufferAttribute(new Float32Array(MAXSL), 1).setUsage(THREE.DynamicDrawUsage);
    this.bulge = new THREE.InstancedBufferAttribute(new Float32Array(MAXSL), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iColor', this.col);
    g.setAttribute('iFade', this.fade);
    g.setAttribute('iThick', this.thick);
    g.setAttribute('iBulge', this.bulge);
    const mat = new THREE.ShaderMaterial({ vertexShader: SLASH_VERT, fragmentShader: SLASH_FRAG, side: THREE.DoubleSide, ...additive });
    this.mesh = new THREE.InstancedMesh(g, mat, MAXSL);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 36;
    scene.add(this.mesh);
  }

  /** A cut that flashes in place and fades. */
  flash(s: SlashSpec, life = 0.18, delay = 0) {
    if (this.flashes.length >= MAXSL - 20) this.flashes.shift();
    this.flashes.push({
      pos: s.pos.clone(),
      fwd: s.fwd.clone(),
      axis: s.axis.clone(),
      len: s.len,
      thick: s.thick ?? 0.05,
      bulge: s.bulge ?? 0.12,
      color: s.color ?? [1.6, 0.2, 0.15],
      t: 0,
      life,
      delay,
    });
  }

  /** Draw a moving slash for this frame only. */
  draw(s: SlashSpec) {
    if (this.once.length < 40) this.once.push(s);
  }

  clear() {
    this.flashes.length = 0;
    this.once.length = 0;
  }

  update(dt: number) {
    const cam = this.camera();
    cam.getWorldPosition(this.cp);
    const pxAng = (2 * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(120, G.renderer?.internalH ?? 540);
    let n = 0;
    const write = (pos: THREE.Vector3, fwd: THREE.Vector3, axis: THREE.Vector3, len: number, thick: number, bulge: number, c: [number, number, number], fade: number) => {
      if (n >= MAXSL) return;
      this.x.copy(axis).multiplyScalar(len);
      this.y.crossVectors(fwd, axis).normalize().multiplyScalar(len);
      this.z.copy(fwd);
      this.m.makeBasis(this.x, this.y, this.z).setPosition(pos);
      this.mesh.setMatrixAt(n, this.m);
      this.col.setXYZ(n, c[0], c[1], c[2]);
      this.fade.setX(n, fade);
      const d = pos.distanceTo(this.cp);
      this.thick.setX(n, Math.max(thick, d * pxAng * 2.2));
      this.bulge.setX(n, bulge);
      n++;
    };
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.t += dt;
      if (f.t >= f.life) {
        this.flashes.splice(i, 1);
        continue;
      }
      const k = f.t / f.life;
      // snaps open, then thins out and fades
      const grow = Math.min(1, f.t / 0.05);
      write(f.pos, f.fwd, f.axis, f.len * (0.55 + 0.45 * grow), f.thick * (1 - k * 0.6), f.bulge, f.color, (1 - k) * (1 - k));
    }
    for (const s of this.once) write(s.pos, s.fwd, s.axis, s.len, s.thick ?? 0.06, s.bulge ?? 0.14, s.color ?? [1.6, 0.25, 0.2], s.fade ?? 1);
    this.once.length = 0;
    if (n === 0 && this.shown === 0) return;
    this.shown = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.col.needsUpdate = this.fade.needsUpdate = this.thick.needsUpdate = this.bulge.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ ground cuts
const MAXGC = 320;
/** Thin gashes left in the road by slashes. They fade after a while. */
export class GroundCuts {
  readonly mesh: THREE.InstancedMesh;
  private age = new Float32Array(MAXGC);
  private life = new Float32Array(MAXGC);
  private aAlpha: THREE.InstancedBufferAttribute;
  private head = 0;
  private count = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private dirty = false;

  constructor(scene: THREE.Scene) {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    this.aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(MAXGC), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aAlpha', this.aAlpha);
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aAlpha; varying vec2 vUv; varying float vA;
        #include <fog_pars_vertex>
        void main(){
          vUv = uv; vA = aAlpha;
          vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying float vA;
        #include <fog_pars_fragment>
        void main(){
          // a dark gash with pale lips along both edges, pointed at the ends
          float x = abs(vUv.y - 0.5) * 2.0;
          float ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          float w = 0.35 + 0.65 * sin(vUv.x * 3.14159);
          if (x > w) discard;
          float lip = smoothstep(w * 0.55, w, x);
          vec3 col = mix(vec3(0.015, 0.008, 0.008), vec3(0.32, 0.29, 0.27), lip * 0.6);
          gl_FragColor = vec4(col, vA * ends * (1.0 - lip * 0.5));
          #include <fog_fragment>
        }`,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    this.mesh = new THREE.InstancedMesh(g, mat, MAXGC);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  /** A gash from (x0,z0) to (x1,z1), width w. */
  add(x0: number, z0: number, x1: number, z1: number, w: number, life = 25) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.05) return;
    const i = this.head;
    this.head = (this.head + 1) % MAXGC;
    this.count = Math.min(MAXGC, this.count + 1);
    this.q.setFromAxisAngle(this.up, Math.atan2(-(z1 - z0), x1 - x0));
    this.s.set(len, 1, w);
    this.p.set((x0 + x1) / 2, 0.015, (z0 + z1) / 2);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
    this.age[i] = 0;
    this.life[i] = life;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = true;
  }

  clear() {
    this.count = 0;
    this.head = 0;
    this.mesh.count = 0;
  }

  update(dt: number) {
    if (this.count === 0) return;
    let live = false;
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] >= this.life[i]) {
        if (this.aAlpha.getX(i) !== 0) {
          this.aAlpha.setX(i, 0);
          this.dirty = true;
        }
        continue;
      }
      live = true;
      this.age[i] += dt;
      const k = this.age[i] / this.life[i];
      this.aAlpha.setX(i, Math.min(1, this.age[i] / 0.05) * (k < 0.8 ? 0.9 : 0.9 * (1 - (k - 0.8) / 0.2)));
      this.dirty = true;
    }
    this.mesh.count = this.count;
    if (this.dirty) this.aAlpha.needsUpdate = true;
    this.dirty = false;
    if (!live) this.clear();
  }
}

// ------------------------------------------------------------------ flame arrow
const ARROW_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vP = position;
  gl_Position = projectionMatrix * mv;
}`;

const ARROW_FRAG = /* glsl */ `
uniform float uTime; uniform float uI; uniform float uLen;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main(){
  float ndv = abs(dot(normalize(vN), normalize(vV)));
  // flames stream back along the shaft (z: 0 tail .. 1 head)
  float t = vP.z;
  float ang = atan(vP.y, vP.x);
  float n = n3(vec3(cos(ang) * 2.0, sin(ang) * 2.0, t * 9.0 + uTime * 14.0)) * 0.6 + n3(vec3(ang * 3.0, t * 23.0 + uTime * 25.0, uTime)) * 0.4;
  float core = pow(ndv, 2.5);
  vec3 col = vec3(1.6, 0.25, 0.04) * (0.6 + n)
    + vec3(2.4, 1.1, 0.25) * core * (0.8 + n * 0.6)
    + vec3(3.0, 2.6, 1.6) * pow(core, 4.0) * smoothstep(0.2, 0.9, t);
  float flick = 0.8 + 0.2 * sin(uTime * 37.0 + t * 20.0);
  gl_FragColor = vec4(col * uI * flick * (0.35 + 0.65 * smoothstep(0.0, 0.25, t)), 1.0);
}`;

/** Lathe profile of the Fuga arrow: a long flame with a broad, pointed head. Length 1 along +Z. */
function arrowGeometry() {
  const pts: THREE.Vector2[] = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let r: number;
    if (t < 0.78) r = 0.18 + 0.42 * Math.pow(t / 0.78, 1.6);
    else r = 1.0 * Math.pow(1 - (t - 0.78) / 0.22, 0.85);
    if (t > 0.74 && t < 0.8) r = Math.max(r, 1.0);
    pts.push(new THREE.Vector2(Math.max(0.0001, r), t));
  }
  const g = new THREE.LatheGeometry(pts, 14);
  // lathe runs along +Y: lay it along +Z
  g.rotateX(Math.PI / 2);
  return g;
}

/** ■「開」: an arrow of fire, shaped between the hands and loosed like a bowshot. */
export class FlameArrow {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private halo: THREE.Mesh;
  private hmat: THREE.MeshBasicMaterial;
  length = 1;
  radius = 0.05;
  intensity = 1;

  constructor(glow: THREE.Texture) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: ARROW_VERT,
      fragmentShader: ARROW_FRAG,
      uniforms: { uTime: { value: 0 }, uI: { value: 1 }, uLen: { value: 1 } },
      side: THREE.DoubleSide,
      ...additive,
    });
    this.mesh = new THREE.Mesh(arrowGeometry(), this.mat);
    this.mesh.renderOrder = 37;
    this.group.add(this.mesh);
    this.hmat = new THREE.MeshBasicMaterial({ map: glow, color: new THREE.Color(3.2, 1.3, 0.35), ...additive });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.hmat);
    this.halo.renderOrder = 38;
    this.group.add(this.halo);
    this.group.visible = false;
  }

  /** Point the arrow from tail to head. */
  aim(tail: THREE.Vector3, head: THREE.Vector3) {
    const d = new THREE.Vector3().subVectors(head, tail);
    this.length = Math.max(1e-4, d.length());
    this.group.position.copy(tail);
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.multiplyScalar(1 / this.length));
  }

  update(time: number, cam: THREE.Camera) {
    this.mesh.scale.set(this.radius, this.radius, this.length);
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uI.value = this.intensity;
    // a glare at the arrowhead, facing the camera
    this.halo.position.set(0, 0, this.length * 0.8);
    const s = this.radius * 9 * (0.9 + Math.random() * 0.2);
    this.halo.scale.set(s, s, s);
    this.halo.quaternion.copy(this.group.quaternion).invert().multiply(cam.quaternion);
    this.hmat.opacity = 1;
    this.hmat.color.setRGB(3.2 * this.intensity, 1.3 * this.intensity, 0.35 * this.intensity);
  }
}
