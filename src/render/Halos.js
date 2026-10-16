// Soft glow sprites around every light — keeps distant street lamps glowing in the fog after
// they fall out of the per-pixel light set.

import * as THREE from 'three'
import { commonUniformsGLSL, hashGLSL, fogGLSL } from './shaderChunks.js'

const MAX = 2048

export class LampHalos {
  constructor(shared) {
    const g = new THREE.BufferGeometry()
    this.pos = new Float32Array(MAX * 3)
    this.col = new Float32Array(MAX * 4)
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage))
    g.setDrawRange(0, 0)
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    this.material = new THREE.ShaderMaterial({
      uniforms: { ...shared, uPixel: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute vec4 aCol;
        uniform float uPixel;
        ${commonUniformsGLSL}
        ${hashGLSL}
        ${fogGLSL}
        varying vec3 vCol;
        void main() {
          vec3 toCam = cameraPosition - position;
          float d = length(toCam);
          vec3 p = position + toCam / max(d, 1e-3) * min(0.6, d * 0.5);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = aCol.a;
          gl_PointSize = clamp(size * uPixel / max(d, 0.5), 0.0, 320.0);
          vec3 rd = -toCam / max(d, 1e-3);
          float tr = exp(-fogAmount(cameraPosition, rd, d) - uWhiteout * d * 0.06);
          float near = smoothstep(1.5, 6.0, d);
          vCol = aCol.rgb * (0.3 + uScatter * 90.0) * mix(0.35, 1.0, sqrt(tr)) * near;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float r = dot(c, c);
          if (r > 1.0) discard;
          float a = exp(-r * 5.0) * 0.8 + exp(-r * 28.0) * 0.6;
          gl_FragColor = vec4(vCol * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.points = new THREE.Points(g, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    this.geometry = g
  }

  setPixelScale(heightPx, fovDeg) {
    this.material.uniforms.uPixel.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360))
  }

  update(lights) {
    let n = 0
    for (const l of lights) {
      if (!l.halo || l.level <= 0.01 || n >= MAX) continue
      this.pos[n * 3] = l.pos.x; this.pos[n * 3 + 1] = l.pos.y; this.pos[n * 3 + 2] = l.pos.z
      const k = Math.min(l.intensity, 80) * 0.004 * l.level * (l.domain === 2 ? 0.4 : 1)
      this.col[n * 4] = l.color.r * k; this.col[n * 4 + 1] = l.color.g * k; this.col[n * 4 + 2] = l.color.b * k
      this.col[n * 4 + 3] = 1.6 * l.haloSize
      n++
    }
    this.geometry.setDrawRange(0, n)
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.aCol.needsUpdate = true
  }
}
