// Thin sagging wires (trolleybus overhead lines, power lines, washing lines). Voxels are too
// coarse for wires, so they are drawn as fogged 1-pixel lines.

import * as THREE from 'three'
import { commonUniformsGLSL, hashGLSL, fogGLSL } from './shaderChunks.js'

export class Wires {
  constructor(shared) {
    this.shared = shared
    this.pos = []
    this.col = []
    this.mesh = null
  }

  /**
   * Add a wire through points [[x,y,z], ...]. Each span sags by `sag` meters (default 2% of length).
   * opts: { sag, color (hex, sRGB), segments (per span) }
   */
  add(points, opts = {}) {
    const c = new THREE.Color(opts.color ?? 0x15161a)
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      const sag = opts.sag ?? len * 0.02
      const n = opts.segments ?? Math.max(4, Math.min(24, Math.ceil(len / 2)))
      let prev = a
      for (let k = 1; k <= n; k++) {
        const t = k / n
        const y = a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t)
        const p = [a[0] + (b[0] - a[0]) * t, y, a[2] + (b[2] - a[2]) * t]
        this.pos.push(prev[0], prev[1], prev[2], p[0], p[1], p[2])
        this.col.push(c.r, c.g, c.b, c.r, c.g, c.b)
        prev = p
      }
    }
  }

  build(scene) {
    if (!this.pos.length) return
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.computeBoundingSphere()
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.shared },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        varying vec3 vC; varying vec3 vW;
        void main() { vC = color; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        ${commonUniformsGLSL}
        ${hashGLSL}
        ${fogGLSL}
        varying vec3 vC; varying vec3 vW;
        void main() {
          vec3 col = vC * (uSkyAmb + uGroundAmb);
          gl_FragColor = vec4(applyFog(col, vW), 1.0);
        }`,
    })
    this.mesh = new THREE.LineSegments(g, mat)
    this.mesh.name = 'wires'
    this.mesh.matrixAutoUpdate = false
    scene.add(this.mesh)
  }
}
