// Overcast winter sky: low cloud deck lit from below by the city's sodium glow, fading into
// the same fog color as the ground so the horizon never shows a seam.

import * as THREE from 'three'
import { commonUniformsGLSL, hashGLSL, fogGLSL } from './shaderChunks.js'

export class Sky {
  constructor(shared) {
    this.uniforms = { ...shared, uCloudShift: { value: new THREE.Vector2() }, uCloudCover: { value: 0.9 }, uStars: { value: 0 } }
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec2 uCloudShift;
        uniform float uCloudCover;
        uniform float uStars;
        ${commonUniformsGLSL}
        ${hashGLSL}
        ${fogGLSL}
        varying vec3 vDir;
        float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise2(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
        void main() {
          vec3 rd = normalize(vDir);
          vec3 base = fogSky(rd);
          float y = max(rd.y, 0.0);
          // cloud deck projected on a plane
          vec2 cp = rd.xz / (y + 0.08) * 1.4 + uCloudShift;
          float cl = fbm(cp * 0.6);
          float dens = smoothstep(0.25, 0.75, cl + uCloudCover - 0.55);
          vec3 lit = uFogHorizon * 1.15 + uFogGlow * 0.6;
          vec3 cloud = mix(base * 0.85, lit, 0.5 + 0.5 * cl);
          vec3 col = mix(base, cloud, dens * smoothstep(0.0, 0.25, y));
          // gaps in the clouds at night show a darker sky and rare stars
          if (uStars > 0.0) {
            vec2 sp = rd.xz / (rd.y + 0.2) * 220.0;
            float st = step(0.9965, hash12(floor(sp))) * (1.0 - dens) * uStars * smoothstep(0.1, 0.4, y);
            col += vec3(0.7, 0.75, 0.9) * st * 0.35;
          }
          vec3 ro = cameraPosition;
          vec3 sc = lampScatter(ro, rd, 400.0) * uScatter;
          col += sc * 0.6;
          col = mix(col, uFogHorizon * 1.15 + vec3(0.02), clamp(uWhiteout, 0.0, 1.0) * 0.85);
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -10
  }

  update(dt, wind) {
    this.uniforms.uCloudShift.value.x += wind.x * dt * 0.0015
    this.uniforms.uCloudShift.value.y += wind.z * dt * 0.0015
  }
}
