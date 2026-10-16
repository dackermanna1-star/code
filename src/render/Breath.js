// The player's breath condensing in the cold: a few soft puffs in front of the camera on each
// exhale, lit by nearby lamps. Barely noticeable — mostly visible under a street light.

import * as THREE from 'three'
import { commonUniformsGLSL, hashGLSL, lightingGLSL, fogGLSL } from './shaderChunks.js'

const N = 48

export class Breath {
  constructor(shared) {
    this.pos = new Float32Array(N * 3)
    this.dat = new Float32Array(N * 2) // age 0..1 (≥1 dead), seed
    this.vel = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) this.dat[i * 2] = 2
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aDat', new THREE.BufferAttribute(this.dat, 2).setUsage(THREE.DynamicDrawUsage))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    this.geometry = g
    this.uniforms = { ...shared, uPixel: { value: 600 }, uStrength: { value: 1 } }
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec2 aDat;
        uniform float uPixel;
        uniform float uStrength;
        ${commonUniformsGLSL}
        ${hashGLSL}
        ${lightingGLSL}
        ${fogGLSL}
        varying vec3 vCol;
        varying float vA;
        void main() {
          float age = aDat.x;
          vec4 mv = viewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = max(-mv.z, 0.05);
          float size = 0.05 + age * 0.22;
          gl_PointSize = age < 1.0 ? clamp(size * uPixel / d, 1.0, 260.0) : 0.0;
          vec3 spec = vec3(0.0);
          vec3 dl = evalLights(position, vec3(0.0, 1.0, 0.0), 1.0, vec3(0.0, 1.0, 0.0), 0.0, 1000.0, spec);
          vCol = vec3(0.9, 0.92, 0.95) * (uSkyAmb * 1.4 + uGroundAmb + dl + uSunCol);
          vA = (1.0 - age) * smoothstep(0.0, 0.12, age) * 0.11 * uStrength;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol;
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float r = dot(c, c);
          if (r > 1.0) discard;
          gl_FragColor = vec4(vCol, vA * (1.0 - r) * (1.0 - r));
        }`,
      transparent: true,
      depthWrite: false,
    })
    this.points = new THREE.Points(g, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 12
    this.timer = 0
    this.next = 0
    this.exhale = 0
    this._f = new THREE.Vector3()
  }

  setPixelScale(heightPx, fovDeg) {
    this.uniforms.uPixel.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360))
  }

  update(dt, camera, opts) {
    const { active, exertion = 0, wind } = opts
    this.timer += dt
    const period = 3.8 - exertion * 1.4
    if (this.timer > period) { this.timer = 0; this.exhale = active ? 0.9 : 0 }
    if (this.exhale > 0) {
      this.exhale -= dt
      // emit a few puffs during the exhale
      if (Math.random() < dt * 14) {
        camera.getWorldDirection(this._f)
        const i = this.next
        this.next = (this.next + 1) % N
        const p = camera.position
        this.pos[i * 3] = p.x + this._f.x * 0.22
        this.pos[i * 3 + 1] = p.y - 0.12 + this._f.y * 0.2
        this.pos[i * 3 + 2] = p.z + this._f.z * 0.22
        this.vel[i * 3] = this._f.x * 0.35 + (Math.random() - 0.5) * 0.06
        this.vel[i * 3 + 1] = 0.05 + this._f.y * 0.2
        this.vel[i * 3 + 2] = this._f.z * 0.35 + (Math.random() - 0.5) * 0.06
        this.dat[i * 2] = 0
        this.dat[i * 2 + 1] = Math.random()
      }
    }
    for (let i = 0; i < N; i++) {
      if (this.dat[i * 2] >= 1) continue
      this.dat[i * 2] += dt / 1.7
      const k = Math.exp(-dt * 1.2)
      this.vel[i * 3] = this.vel[i * 3] * k + (wind?.x ?? 0) * 0.05 * dt
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2] * k + (wind?.z ?? 0) * 0.05 * dt
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k + 0.04 * dt
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
    }
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.aDat.needsUpdate = true
  }
}
