import * as THREE from 'three';

/** Shared look of the day: one place for the sky, fog and light colours. */
export const DAY = {
  // Dec 24, noon in Tokyo: a low winter sun to the south
  sunDir: new THREE.Vector3(-0.18, 0.5, 0.85).normalize(),
  sunColor: new THREE.Color(1.0, 0.9, 0.76),
  sunIntensity: 2.7,
  zenith: new THREE.Color(0.02, 0.12, 0.6),
  horizon: new THREE.Color(0.42, 0.62, 0.92),
  haze: new THREE.Color(0.56, 0.68, 0.84),
  hemiSky: new THREE.Color(0.55, 0.68, 0.95),
  hemiGround: new THREE.Color(0.42, 0.38, 0.34),
  hemiIntensity: 1.25,
  fogDensity: 0.00105,
};

const VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */ `
uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uHaze;
uniform float uTime; uniform float uDim; uniform vec3 uTintSky;
varying vec3 vDir;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }

// distant ranges with Fuji to the west-south-west
float ridge(float az){
  float m = 0.0;
  m += (fbm(vec2(az * 3.0, 1.3)) - 0.45) * 0.035;
  m += (fbm(vec2(az * 11.0, 7.7)) - 0.5) * 0.008;
  float fa = 4.33;
  float fd = abs(az - fa);
  float fuji = max(0.0, 1.0 - fd / 0.16);
  fuji = pow(fuji, 1.55) * 0.052;
  fuji = min(fuji, 0.047 + fd * 0.02);
  return max(m * smoothstep(0.0, 0.2, abs(sin(az * 0.5 - 0.9))) + 0.004, fuji);
}

vec3 sky(vec3 d){
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.5));
  float sd = max(dot(d, uSun), 0.0);
  col += uSunCol * (pow(sd, 5.0) * 0.1 + pow(sd, 48.0) * 0.28);
  col = mix(col, uHaze, exp(-h * 22.0) * 0.6);
  // anime cumulus: banked low, posterised shading
  if (d.y > 0.004) {
    vec2 p = d.xz / (d.y + 0.035) * 1.15 + vec2(uTime * 0.004, uTime * 0.0015);
    vec2 w = vec2(fbm(p * 0.6 + 3.1), fbm(p * 0.6 + 8.4));
    float c = fbm(p * 0.9 + w * 1.4);
    float band = smoothstep(0.6, 0.02, d.y) * 0.85 + 0.15;
    float cover = smoothstep(0.52, 0.6, c * band + 0.12);
    vec2 toSun = normalize(uSun.xz + vec2(1e-4)) * 0.18;
    float cs = fbm((p + toSun) * 0.9 + w * 1.4);
    float lit = smoothstep(-0.02, 0.05, c - cs);
    vec3 shade = mix(vec3(0.5, 0.6, 0.78), vec3(0.72, 0.78, 0.9), lit * 0.5);
    vec3 top = vec3(1.25, 1.22, 1.15);
    vec3 cc = mix(shade, top, step(0.5, lit) * 0.8 + lit * 0.2);
    // bright rims where the sun catches the edges
    cc += vec3(0.25) * smoothstep(0.6, 0.66, c * band + 0.12) * (1.0 - smoothstep(0.66, 0.7, c * band + 0.12));
    float fadeH = smoothstep(0.004, 0.08, d.y);
    col = mix(col, mix(uHaze * 1.05, cc, fadeH), cover * (0.25 + 0.75 * fadeH));
    // a few high cirrus streaks
    float ci = fbm(vec2(p.x * 0.25 + p.y * 0.6, p.y * 2.6) * 1.3);
    col += vec3(0.16, 0.18, 0.2) * smoothstep(0.62, 0.8, ci) * smoothstep(0.05, 0.4, d.y);
  }
  // the sun disk
  col += uSunCol * smoothstep(0.99955, 0.9998, sd) * 12.0;
  // far mountains in the haze
  float az = atan(d.x, -d.z);
  if (az < 0.0) az += 6.2831853;
  float m = ridge(az);
  if (d.y < m) {
    float fuji = smoothstep(0.16, 0.0, abs(az - 4.33));
    vec3 mc = mix(uHaze * 0.78, uHaze * 0.9 + vec3(0.04, 0.05, 0.08), smoothstep(0.0, m, d.y) * 0.4);
    // snow cap
    mc = mix(mc, vec3(0.93, 0.95, 1.0), fuji * smoothstep(0.03, 0.04, d.y) * 0.85);
    col = mc;
  }
  if (d.y < 0.0) col = mix(uHaze * 0.92, uHaze * 0.7, smoothstep(0.0, -0.3, d.y));
  return col * uTintSky * uDim;
}

void main(){
  vec3 d = normalize(vDir);
  gl_FragColor = vec4(sky(d), 1.0);
}`;

/** Sky dome that follows the camera. */
export class Sky {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uSun: { value: DAY.sunDir.clone() },
        uSunCol: { value: DAY.sunColor.clone().multiplyScalar(1.4) },
        uZenith: { value: DAY.zenith.clone() },
        uHorizon: { value: DAY.horizon.clone() },
        uHaze: { value: DAY.haze.clone() },
        uTime: { value: 0 },
        uDim: { value: 1 },
        uTintSky: { value: new THREE.Color(1, 1, 1) },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  update(time: number, cam: THREE.Camera) {
    this.mesh.position.copy(cam.position);
    this.mat.uniforms.uTime.value = time;
  }
}
