// Surface sky: Noita's dusky violet-pink gradient, pixel stars and layered jagged mountain silhouettes.
// Fades to black underground.
import * as THREE from 'three';

const VS = /* glsl */ `
out vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const FS = /* glsl */ `
precision highp float;
in vec3 vDir;
uniform float uTime;
uniform float uVisible;
uniform float uSeed;
out vec4 outColor;

float h1(float n) { return fract(sin(n * 127.1 + uSeed) * 43758.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
float vnoise(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
float ridge(float az, float scale, float seed) {
  float v = 0.0; float a = 0.5; float s = scale;
  for (int i = 0; i < 4; i++) { v += a * vnoise(az * s + seed * 13.1); s *= 2.1; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float el = d.y;
  float az = atan(d.x, d.z) / 6.2831853 + 0.5;
  // pixelate direction for a chunky look
  float px = 420.0;
  float azq = floor(az * px * 3.0) / (px * 3.0);
  float elq = floor(el * px) / px;
  vec3 top = vec3(0.10, 0.08, 0.20);
  vec3 mid = vec3(0.30, 0.17, 0.30);
  vec3 hor = vec3(0.62, 0.36, 0.40);
  vec3 col = mix(hor, mid, smoothstep(-0.02, 0.18, elq));
  col = mix(col, top, smoothstep(0.15, 0.7, elq));
  // stars
  vec2 sp = floor(vec2(azq * 900.0, elq * 300.0));
  float s = h2(sp);
  if (s > 0.9965 && elq > 0.08) {
    float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h2(sp + 3.0) * 3.0) + s * 50.0);
    col += vec3(0.9, 0.85, 0.95) * tw * smoothstep(0.08, 0.3, elq);
  }
  // mountain layers (far to near)
  float m1 = 0.04 + 0.16 * ridge(azq, 7.0, 1.0);
  float m2 = -0.01 + 0.13 * ridge(azq, 11.0, 2.0);
  float m3 = -0.05 + 0.11 * ridge(azq, 17.0, 3.0);
  // misty cloud band
  float cloud = smoothstep(0.02, 0.0, abs(elq - 0.045 - 0.02 * vnoise(azq * 40.0))) * 0.35;
  col = mix(col, vec3(0.46, 0.33, 0.45), cloud);
  if (elq < m1) col = vec3(0.24, 0.20, 0.30);
  if (elq < m2) col = vec3(0.19, 0.16, 0.25);
  if (elq < m3) col = vec3(0.13, 0.11, 0.18);
  if (elq < -0.08) col = vec3(0.08, 0.07, 0.10);
  outColor = vec4(col * uVisible, 1.0);
}
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly uniforms = { uTime: { value: 0 }, uVisible: { value: 1 }, uSeed: { value: 0 } };
  constructor(seed: number) {
    this.uniforms.uSeed.value = (seed % 1000) / 10;
    const geo = new THREE.SphereGeometry(1, 32, 16);
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.scale.setScalar(500);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }
  update(cam: THREE.Vector3, visible: number, time: number): void {
    this.mesh.position.copy(cam);
    this.uniforms.uVisible.value = visible;
    this.uniforms.uTime.value = time;
    this.mesh.visible = visible > 0.001;
  }
}
