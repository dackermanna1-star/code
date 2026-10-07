// The sky, the time of day and the weather. A dome drawn by a shader - the
// blue deepening overhead, haze at the horizon, the sun and its glow, red
// sunsets, stars and the moon at night, and two layers of drifting clouds
// that thicken when the weather turns - plus the sun and sky light, the fog
// and the reflections that go with it all.
import * as THREE from 'three';
import { clamp, lerp, smooth } from '../noise.js';

const VS = `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const FS = `
uniform vec3 sunDir, moonDir, zenith, horizon, ground, sunCol;
uniform float time, cover, night, stars, sunVis;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  // the gradient: haze at the horizon, deep blue overhead
  float hz = pow(1.0 - clamp(up, 0.0, 1.0), 3.2);
  vec3 col = mix(zenith, horizon, hz);
  if (up < 0.0) col = mix(horizon, ground, smoothstep(0.0, -0.25, up));
  // the sun: a hot disc, a glow, and the sky round it warming at dawn and dusk
  float sd = max(dot(d, sunDir), 0.0);
  float low = 1.0 - smoothstep(0.0, 0.35, sunDir.y);
  col += sunCol * (pow(sd, 6.0) * 0.18 + pow(sd, 60.0) * 0.35) * (1.0 - night);
  col = mix(col, col + sunCol * 0.45 * hz, low * pow(sd, 2.0) * (1.0 - night));
  // stars and the moon
  if (stars > 0.01 && up > -0.05) {
    vec2 g = vec2(atan(d.x, d.z) * 180.0, d.y * 160.0);
    vec2 cell = floor(g); float h = hash(cell);
    if (h > 0.985) { vec2 c = fract(g) - 0.5; float s = smoothstep(0.08 + (h - 0.985) * 6.0, 0.0, length(c)); col += vec3(0.9, 0.95, 1.0) * s * stars * (0.6 + 0.4 * sin(time * 2.0 + h * 90.0)) * smoothstep(-0.05, 0.25, up); }
    float md = max(dot(d, moonDir), 0.0);
    col += vec3(0.85, 0.88, 1.0) * (smoothstep(0.9993, 0.9996, md) * 1.6 + pow(md, 80.0) * 0.12) * stars;
  }
  // clouds: a layer overhead, flattened towards the horizon
  if (up > 0.0) {
    vec2 p = d.xz / (up + 0.12) * 1.6 + vec2(time * 0.006, time * 0.002);
    float c = fbm(p * 1.3);
    float c2 = fbm(p * 3.1 + 5.0);
    float dens = smoothstep(0.62 - cover * 0.42, 0.95 - cover * 0.25, c * 0.75 + c2 * 0.35);
    dens *= smoothstep(0.0, 0.18, up);
    vec3 lit = mix(horizon * 0.9, vec3(1.0), 0.6) * mix(vec3(1.0), sunCol, 0.35) * (1.0 - night * 0.9);
    vec3 shade = mix(zenith, horizon, 0.5) * (0.55 - cover * 0.25);
    vec3 cc = mix(lit, shade, smoothstep(0.3, 1.0, c2) * (0.4 + cover * 0.6));
    cc += sunCol * pow(sd, 10.0) * 0.4 * (1.0 - night);
    col = mix(col, cc, dens * (0.85 + cover * 0.15));
  }
  // overcast: everything greys over
  col = mix(col, mix(horizon, zenith, 0.4) * 0.92, cover * 0.55);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Keyframes over the day (hour -> colours and light). */
const KEYS = [
  { h: 0, zen: 0x02040a, hor: 0x0a1220, sun: 0x000000, sunI: 0, amb: [0x2e3a58, 0x0c0c14, 0.2], moonI: 0.34 },
  { h: 4.5, zen: 0x040814, hor: 0x141c30, sun: 0x000000, sunI: 0, amb: [0x2e3a58, 0x0c0c14, 0.2], moonI: 0.3 },
  { h: 5.6, zen: 0x1a2a50, hor: 0xd88a5a, sun: 0xff8a40, sunI: 0.5, amb: [0x6a7898, 0x3a2a24, 0.35], moonI: 0.05 },
  { h: 7, zen: 0x3a68b0, hor: 0xf0c8a0, sun: 0xffc890, sunI: 1.8, amb: [0x9ab0d0, 0x5a4a3a, 0.6], moonI: 0 },
  { h: 9, zen: 0x3f74c4, hor: 0xc8dcf0, sun: 0xfff2e0, sunI: 2.7, amb: [0xb0c8e8, 0x6a5e48, 0.75], moonI: 0 },
  { h: 13, zen: 0x3a72c8, hor: 0xc4daf2, sun: 0xffffff, sunI: 3.0, amb: [0xb8cff0, 0x6e6450, 0.8], moonI: 0 },
  { h: 17, zen: 0x3a6ab8, hor: 0xd8d0c0, sun: 0xfff0d8, sunI: 2.5, amb: [0xb0c4e0, 0x6a5a44, 0.72], moonI: 0 },
  { h: 18.8, zen: 0x2a4a90, hor: 0xf09a5a, sun: 0xff9a50, sunI: 1.3, amb: [0x8a90b0, 0x4a3628, 0.5], moonI: 0 },
  { h: 19.7, zen: 0x141e40, hor: 0x9a5a4a, sun: 0xff6a30, sunI: 0.3, amb: [0x4a5070, 0x20181a, 0.25], moonI: 0.08 },
  { h: 20.6, zen: 0x050a18, hor: 0x1a2236, sun: 0x000000, sunI: 0, amb: [0x2e3a58, 0x0c0c14, 0.2], moonI: 0.3 },
  { h: 24, zen: 0x02040a, hor: 0x0a1220, sun: 0x000000, sunI: 0, amb: [0x2e3a58, 0x0c0c14, 0.2], moonI: 0.34 },
];
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function lerpHex(a, b, t, out) { _c1.setHex(a); _c2.setHex(b); return out.copy(_c1).lerp(_c2, t); }

export const WEATHER = {
  clear: { cover: 0.05, fog: 1, rain: 0, wind: 0.3 },
  cloudy: { cover: 0.45, fog: 0.85, rain: 0, wind: 0.5 },
  overcast: { cover: 0.8, fog: 0.62, rain: 0, wind: 0.6 },
  rain: { cover: 0.95, fog: 0.45, rain: 1, wind: 0.85 },
  storm: { cover: 1, fog: 0.35, rain: 1.4, wind: 1.2 },
  fog: { cover: 0.6, fog: 0.16, rain: 0, wind: 0.15 },
};

export class Sky {
  constructor(world) {
    this.world = world;
    this.uniforms = {
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, moonDir: { value: new THREE.Vector3(0, 1, 0) },
      zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color(0x3a3a38) }, sunCol: { value: new THREE.Color() },
      time: { value: 0 }, cover: { value: 0.2 }, night: { value: 0 }, stars: { value: 0 }, sunVis: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    this.dome.scale.setScalar(5000);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    if (world.skyMesh) world.scene.remove(world.skyMesh);
    world.skyMesh = null;
    world.scene.background = null;
    world.scene.add(this.dome);
    // the lights
    this.sun = world.sun; this.hemi = world.ambient;
    world.fill.intensity = 0;
    this.moon = new THREE.DirectionalLight(0x8aa0d8, 0);
    world.scene.add(this.moon, this.moon.target);
    world.scene.fog = new THREE.Fog(0xc8d8e8, 300, 2600);
    this.hour = 8;
    this.weather = 'clear'; this.w = { ...WEATHER.clear }; this.wTarget = { ...WEATHER.clear };
    this.env = null; this.envHour = -99; this.envCover = -1;
    this.pm = null;
    this.state = { sunI: 1, night: 0, fogFar: 2600, rain: 0, wind: 0.3, dark: 0, light: 1 };
  }

  setWeather(kind, instant = false) {
    this.weather = kind;
    this.wTarget = { ...WEATHER[kind] };
    if (instant) this.w = { ...this.wTarget };
  }

  /** hour: 0..24. Moves the sun, recolours everything. */
  update(dt, hour, camPos) {
    this.hour = hour;
    for (const k of Object.keys(this.w)) this.w[k] = lerp(this.w[k], this.wTarget[k], Math.min(1, dt * 0.05));
    const u = this.uniforms;
    u.time.value += dt;
    // where the sun and moon are
    const a = (hour / 24) * Math.PI * 2 - Math.PI / 2; // 6:00 -> rising in the east
    const sun = u.sunDir.value.set(Math.cos(a) * 0.85, Math.sin(a), 0.38).normalize();
    u.moonDir.value.set(-sun.x, Math.max(0.25, -sun.y), -0.3).normalize();
    // colours from the keyframes
    let k0 = KEYS[0], k1 = KEYS[1];
    for (let i = 0; i < KEYS.length - 1; i++) if (hour >= KEYS[i].h && hour <= KEYS[i + 1].h) { k0 = KEYS[i]; k1 = KEYS[i + 1]; break; }
    const t = (hour - k0.h) / Math.max(0.001, k1.h - k0.h);
    const cover = this.w.cover;
    lerpHex(k0.zen, k1.zen, t, u.zenith.value);
    lerpHex(k0.hor, k1.hor, t, u.horizon.value);
    lerpHex(k0.sun, k1.sun, t, u.sunCol.value);
    const sunI = lerp(k0.sunI, k1.sunI, t), moonI = lerp(k0.moonI, k1.moonI, t);
    const night = 1 - smooth(0, 1.2, sunI);
    u.night.value = night;
    u.stars.value = night * (1 - cover * 0.95);
    u.cover.value = cover;
    // overcast: greyer, flatter light
    const grey = new THREE.Color().copy(u.horizon.value).lerp(new THREE.Color(0x9aa2aa).multiplyScalar(0.25 + 0.75 * (1 - night)), cover * 0.6);
    u.horizon.value.copy(grey);
    u.zenith.value.lerp(new THREE.Color(0x707a84).multiplyScalar(0.2 + 0.8 * (1 - night)), cover * 0.5);
    // the lights
    const S = this.sun;
    S.color.copy(u.sunCol.value);
    S.intensity = sunI * (1 - cover * 0.72) * smooth(-0.04, 0.08, sun.y);
    const amb = [lerp(0, 1, t), 0];
    void amb;
    this.hemi.color.setHex(k0.amb[0]).lerp(_c2.setHex(k1.amb[0]), t);
    this.hemi.groundColor.setHex(k0.amb[1]).lerp(_c2.setHex(k1.amb[1]), t);
    this.hemi.intensity = lerp(k0.amb[2], k1.amb[2], t) * (1 + cover * 0.25) * 1.6;
    this.moon.intensity = moonI * (1 - cover * 0.8);
    // shadows follow the camera
    const p = camPos || this.world.camera.position;
    const sd = sun.y > 0.02 ? sun : u.moonDir.value;
    const snap = 8;
    S.target.position.set(Math.round(p.x / snap) * snap, Math.round(p.y / snap) * snap, Math.round(p.z / snap) * snap);
    S.position.copy(S.target.position).addScaledVector(sun.y > 0.02 ? sun : sd, 600);
    S.target.updateMatrixWorld();
    this.moon.position.copy(S.target.position).addScaledVector(u.moonDir.value, 600); this.moon.target.position.copy(S.target.position);
    // fog: the colour of the horizon; thicker in bad weather and at night
    const fog = this.world.scene.fog;
    fog.color.copy(u.horizon.value).lerp(u.zenith.value, 0.12);
    const far = (2800 * this.w.fog) * (1 - night * 0.45);
    fog.far = far; fog.near = Math.min(far * 0.12, 240);
    this.state = { sunI: S.intensity, night, fogFar: far, rain: this.w.rain, wind: this.w.wind, cover, light: Math.max(S.intensity / 3, this.hemi.intensity / 1.3) };
    this.dome.position.copy(p);
  }

  /** Reflections for shiny things: the sky, re-baked now and then. */
  updateEnv(renderer, scene) {
    if (Math.abs(this.hour - this.envHour) < 0.5 && Math.abs(this.w.cover - this.envCover) < 0.1 && this.env) return;
    this.envHour = this.hour; this.envCover = this.w.cover;
    if (!this.pm) this.pm = new THREE.PMREMGenerator(renderer);
    const s = new THREE.Scene();
    const dome = this.dome.clone(); dome.position.set(0, 0, 0); dome.scale.setScalar(100);
    s.add(dome);
    const rt = this.pm.fromScene(s, 0, 0.1, 400);
    if (this.env) this.env.dispose();
    this.env = rt;
    scene.environment = rt.texture;
  }
}
