/**
 * Visuals for the hero's punches (forward HDR scene + HUD):
 *  - AirBlast: the pressure wave of a punch, a widening translucent cone streaked with
 *    wind lines that races out to its full length and fades;
 *  - ShockRing: a ring of compressed air expanding around the punch axis;
 *  - HeroHud: manga-style callouts ("SERIOUS SERIES: SERIOUS PUNCH") and speed lines.
 */
import * as THREE from 'three';

const BLAST_VERT = /* glsl */ `
in vec3 position;
in vec2 uv;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
uniform float u_len;
uniform float u_r0;
uniform float u_r1;
out vec2 v_uv;
out float v_fres;
void main(){
  float a = uv.x * 6.2831853;
  float t = uv.y;
  float r = mix(u_r0, u_r1, sqrt(t));
  vec3 p = vec3(cos(a) * r, sin(a) * r, t * u_len);
  vec3 n = normalize(vec3(cos(a), sin(a), -(u_r1 - u_r0) / u_len));
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec3 wn = normalize(mat3(modelMatrix) * n);
  vec3 vd = normalize(cameraPosition - wp.xyz);
  v_fres = 1.0 - abs(dot(wn, vd));
  v_uv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const BLAST_FRAG = /* glsl */ `
precision highp float;
uniform float u_time;
uniform float u_front;   // 0..1 how far the wave has travelled
uniform float u_fade;    // overall fade
uniform float u_len;
uniform float u_bright;
uniform vec3 u_color;
in vec2 v_uv;
in float v_fres;
out vec4 o;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
void main(){
  float t = v_uv.y;
  if (t > u_front) discard;
  // wind streaks: thin lines around the cone, stretched along it, racing forward
  float s = noise(vec2(v_uv.x * 64.0, t * u_len * 0.05 - u_time * 6.0));
  float lines = smoothstep(0.62, 0.95, s);
  float lead = exp(-(u_front - t) * u_len / 3.0);           // bright leading edge
  float body = (0.18 + 0.82 * pow(v_fres, 2.0)) * (0.35 + lines * 1.6);
  float ends = smoothstep(0.0, 0.04, t);
  float a = (body * 0.6 + lead * 1.4) * ends * u_fade;
  o = vec4(u_color * a * u_bright, 0.0);
}`;

const RING_FRAG = /* glsl */ `
precision highp float;
uniform float u_fade;
uniform vec3 u_color;
in vec2 v_uv;
in float v_fres;
out vec4 o;
void main(){
  vec2 p = v_uv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float band = exp(-pow((r - 0.86) / 0.07, 2.0)) + 0.25 * exp(-pow((r - 0.7) / 0.18, 2.0));
  o = vec4(u_color * band * u_fade * 2.5, 0.0);
}`;

const RING_VERT = /* glsl */ `
in vec3 position;
in vec2 uv;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
out vec2 v_uv;
out float v_fres;
void main(){ v_uv = uv; v_fres = 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

let CONE_GEO: THREE.BufferGeometry | null = null;
function coneGeo() {
  if (CONE_GEO) return CONE_GEO;
  const seg = 48, len = 24;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= len; j++) for (let i = 0; i <= seg; i++) { pos.push(0, 0, 0); uv.push(i / seg, j / len); }
  for (let j = 0; j < len; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + seg + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  CONE_GEO = g;
  return g;
}
const RING_GEO = new THREE.PlaneGeometry(2, 2);

const additive = {
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
} as const;

const Z = new THREE.Vector3(0, 0, 1);

/** The pressure wave of a punch. */
export class AirBlast {
  readonly mesh: THREE.Mesh;
  private mat: THREE.RawShaderMaterial;
  age = 0;
  constructor(o: THREE.Vector3, d: THREE.Vector3, readonly length: number, r0: number, r1: number, readonly speed: number, readonly life: number, bright = 1, color = new THREE.Color(0.85, 0.92, 1.0)) {
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: BLAST_VERT,
      fragmentShader: BLAST_FRAG,
      uniforms: {
        u_len: { value: length }, u_r0: { value: r0 }, u_r1: { value: r1 }, u_time: { value: 0 }, u_front: { value: 0 },
        u_fade: { value: 1 }, u_bright: { value: bright }, u_color: { value: color },
      },
      ...additive,
    });
    this.mesh = new THREE.Mesh(coneGeo(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.position.copy(o);
    this.mesh.quaternion.setFromUnitVectors(Z, d.clone().normalize());
  }
  /** Returns false when finished. */
  update(dt: number): boolean {
    this.age += dt;
    const u = this.mat.uniforms;
    u.u_time.value = this.age;
    u.u_front.value = Math.min(1, (this.age * this.speed) / this.length);
    const tail = this.life - this.length / this.speed;
    const k = this.age * this.speed > this.length ? (this.age - this.length / this.speed) / Math.max(0.05, tail) : 0;
    u.u_fade.value = Math.max(0, 1 - k) * Math.min(1, this.age * 30);
    return this.age < this.life;
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mat.dispose();
  }
}

/** An expanding ring of compressed air around the punch axis. */
export class ShockRing {
  readonly mesh: THREE.Mesh;
  private mat: THREE.RawShaderMaterial;
  age = 0;
  constructor(c: THREE.Vector3, normal: THREE.Vector3, readonly r0: number, readonly r1: number, readonly life: number, color = new THREE.Color(0.9, 0.95, 1.0)) {
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      uniforms: { u_fade: { value: 1 }, u_color: { value: color } },
      ...additive,
    });
    this.mesh = new THREE.Mesh(RING_GEO, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.position.copy(c);
    this.mesh.quaternion.setFromUnitVectors(Z, normal.clone().normalize());
    this.mesh.scale.setScalar(r0);
  }
  update(dt: number): boolean {
    this.age += dt;
    const k = Math.min(1, this.age / this.life);
    const e = 1 - Math.pow(1 - k, 3);
    this.mesh.scale.setScalar(this.r0 + (this.r1 - this.r0) * e);
    this.mat.uniforms.u_fade.value = (1 - k) * (1 - k);
    return this.age < this.life;
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mat.dispose();
  }
}

// ------------------------------------------------------------------------------- HUD
const CSS = `
.hero-hud { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.hero-lines { position: absolute; inset: -20%; opacity: 0;
  background: repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0.0) 0deg 2.2deg, rgba(255,255,255,0.55) 2.4deg 2.7deg, rgba(255,255,255,0.0) 2.9deg 5.3deg);
  -webkit-mask-image: radial-gradient(circle at 50% 50%, transparent 0 28%, #000 62%); mask-image: radial-gradient(circle at 50% 50%, transparent 0 28%, #000 62%); }
.hero-callout { position: absolute; left: 50%; top: 66%; transform: translate(-50%, -50%) skewX(-12deg); white-space: nowrap; text-align: center;
  font: 900 italic 46px/1.05 'Inter Tight', 'Arial Black', Impact, sans-serif; letter-spacing: 0.02em; color: #fff;
  -webkit-text-stroke: 3px #111; paint-order: stroke fill; text-shadow: 4px 5px 0 #c8161d, 0 0 18px rgba(0,0,0,0.5); opacity: 0; }
.hero-callout small { display: block; font-size: 22px; letter-spacing: 0.24em; -webkit-text-stroke: 2px #111; color: #ffd21f; text-shadow: 3px 3px 0 #111; }
.hero-hint { position: absolute; left: 50%; top: 9%; transform: translateX(-50%); padding: 10px 16px; max-width: 760px; text-align: center;
  font: 500 13px/1.6 'Inter Tight', system-ui, sans-serif; color: #f4f1e8; background: rgba(12,12,14,0.62); border-radius: 8px; opacity: 0; transition: opacity 0.4s; }
.hero-hint b { color: #ffd21f; }
.hero-hint kbd { font: 600 11px 'JetBrains Mono', monospace; padding: 1px 5px; border-radius: 4px; background: rgba(255,255,255,0.14); }
`;

export class HeroHud {
  readonly el: HTMLElement;
  private lines: HTMLElement;
  private callout: HTMLElement;
  private hint: HTMLElement;
  private calloutT = 0;
  private calloutLife = 0;
  private hintT = 0;

  constructor(parent: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.className = 'hero-hud';
    this.lines = document.createElement('div');
    this.lines.className = 'hero-lines';
    this.callout = document.createElement('div');
    this.callout.className = 'hero-callout';
    this.hint = document.createElement('div');
    this.hint.className = 'hero-hint';
    this.hint.innerHTML = `<b>HERO GLOVES</b> · <kbd>LMB</kbd> normal punch · hold <kbd>LMB</kbd> consecutive normal punches<br>`
      + `<kbd>RMB</kbd> serious punch (aim at the ground to break the world) · hold <kbd>RMB</kbd> consecutive serious punches<br>`
      + `Sprint to run, <kbd>Shift</kbd>+<kbd>Space</kbd> super leap · you cannot be hurt`;
    this.el.append(this.lines, this.callout, this.hint);
    parent.appendChild(this.el);
  }

  /** Show a callout (`sub` = small line above). */
  say(text: string, sub = '', life = 1.4) {
    this.callout.innerHTML = (sub ? `<small>${sub}</small>` : '') + text;
    this.calloutT = 0;
    this.calloutLife = life;
  }

  showHint() {
    this.hintT = 12;
  }

  update(dt: number, visible: boolean, speedLines: number) {
    this.el.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    this.calloutT += dt;
    const k = this.calloutT / Math.max(0.01, this.calloutLife);
    const pop = this.calloutT < 0.08 ? 1.35 - this.calloutT / 0.08 * 0.35 : 1;
    this.callout.style.opacity = k < 1 ? String(Math.min(1, (1 - k) * 4)) : '0';
    this.callout.style.transform = `translate(-50%, -50%) skewX(-12deg) scale(${pop})`;
    this.lines.style.opacity = String(Math.min(0.9, speedLines));
    this.lines.style.transform = `rotate(${(performance.now() / 40) % 360}deg)`;
    if (this.hintT > 0) this.hintT -= dt;
    this.hint.style.opacity = this.hintT > 0 ? String(Math.min(1, this.hintT)) : '0';
  }

  dispose() {
    this.el.remove();
  }
}
