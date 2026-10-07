// The air: dust hanging in the flashlight beam, and the rain outside.
import * as THREE from 'three';
import { H } from './state.js';

const DUST_VS = `
uniform vec3 camPos; uniform vec3 lightPos; uniform vec3 lightDir; uniform float lightOn; uniform float t; uniform float size;
attribute float ph;
varying float vA;
void main() {
  vec3 p = position;
  p.x += sin(t * 0.21 + ph * 6.0) * 0.6; p.y += sin(t * 0.13 + ph * 9.0) * 0.4; p.z += cos(t * 0.17 + ph * 4.0) * 0.6;
  vec3 box = vec3(28.0, 18.0, 28.0);
  p = camPos + mod(p - camPos + box * 0.5, box) - box * 0.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = size / max(d, 0.4);
  vec3 L = p - lightPos; float ld = length(L);
  float cone = smoothstep(0.86, 0.97, dot(L / ld, lightDir)) * lightOn / (1.0 + ld * 0.08);
  vA = cone * smoothstep(0.4, 1.5, d) * (0.6 + 0.4 * sin(t * 1.3 + ph * 20.0));
}`;
const DUST_FS = `
varying float vA;
void main() { vec2 c = gl_PointCoord - 0.5; float r = dot(c, c); if (r > 0.25) discard; gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * vA * (1.0 - r * 4.0) * 0.55, 1.0); }`;

export class Atmos {
  constructor(world) {
    this.world = world;
    const n = 900, pos = new Float32Array(n * 3), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = Math.random() * 28; pos[i * 3 + 1] = Math.random() * 18; pos[i * 3 + 2] = Math.random() * 28; ph[i] = Math.random(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
    this.dustMat = new THREE.ShaderMaterial({
      vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { camPos: { value: new THREE.Vector3() }, lightPos: { value: new THREE.Vector3() }, lightDir: { value: new THREE.Vector3(0, 0, -1) }, lightOn: { value: 0 }, t: { value: 0 }, size: { value: 34 } },
    });
    this.dust = new THREE.Points(g, this.dustMat); this.dust.frustumCulled = false; this.dust.renderOrder = 4;
    world.scene.add(this.dust);
    // rain: streaks falling round you when you're outside
    const m = 1400, rp = new Float32Array(m * 6);
    this.drops = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) { this.drops[i * 3] = (Math.random() - 0.5) * 70; this.drops[i * 3 + 1] = Math.random() * 40; this.drops[i * 3 + 2] = (Math.random() - 0.5) * 70; }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9aa8c0, transparent: true, opacity: 0.32, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    world.scene.add(this.rain);
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const cam = this.world.camera, u = this.dustMat.uniforms, P = H.player;
    u.t.value = this.t; u.camPos.value.copy(cam.position);
    if (P?.spotLight) { u.lightPos.value.copy(P.spotLight.position); u.lightDir.value.copy(P.spotLight.target.position).sub(P.spotLight.position).normalize(); u.lightOn.value = Math.min(1, P.spotLight.intensity / 200); }
    u.size.value = 34 * this.world.renderer.getPixelRatio() * (this.world.renderer.domElement.height / 900);
    const outside = cam.position.z > 56 || H.story?.area?.() === 'outside';
    this.rain.visible = outside;
    if (outside) {
      const a = this.rain.geometry.attributes.position, d = this.drops, n = d.length / 3;
      for (let i = 0; i < n; i++) {
        d[i * 3 + 1] -= dt * 95;
        if (d[i * 3 + 1] < -2) d[i * 3 + 1] += 40;
        const x = cam.position.x + ((d[i * 3] - cam.position.x) % 70 + 105) % 70 - 35;
        const z = cam.position.z + ((d[i * 3 + 2] - cam.position.z) % 70 + 105) % 70 - 35;
        const y = cam.position.y - 12 + d[i * 3 + 1];
        a.setXYZ(i * 2, x, y, z); a.setXYZ(i * 2 + 1, x + 0.15, y + 1.6, z + 0.1);
      }
      a.needsUpdate = true;
    }
  }
}
