// Dynamic plates: small canvas-textured quads that, unlike engine Signs, can move (the lift
// cab's button panel rides with the cab) and be redrawn at runtime (the endless stairwell's
// painted floor numbers). Lit and fogged with the same shader code as world signs.

import * as THREE from 'three'
import { commonUniformsGLSL, hashGLSL, lightingGLSL, fogGLSL } from '../../render/shaderChunks.js'

const vert = /* glsl */ `
varying vec2 vUv; varying vec3 vWorld; varying vec3 vN;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

const frag = /* glsl */ `
uniform sampler2D uMap;
uniform float uEmissive;
uniform float uDomain;
${commonUniformsGLSL}
${hashGLSL}
${lightingGLSL}
${fogGLSL}
varying vec2 vUv; varying vec3 vWorld; varying vec3 vN;
void main() {
  vec4 tx = texture2D(uMap, vUv);
  if (tx.a < 0.4) discard;
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 spec = vec3(0.0);
  vec3 amb = uDomain > 1.5 ? uIndoorAmb : mix(uGroundAmb, uSkyAmb, 0.6);
  vec3 dl = evalLights(vWorld + N * 0.05, N, uDomain, V, 0.1, 0.2, spec);
  vec3 col = tx.rgb * (amb + dl) + spec * 0.3 + tx.rgb * uEmissive;
  col = applyFog(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
}`

export class DynPlate {
  /**
   * o: { w, h (m), ppm, draw(ctx2d, W, H), indoor (default true), emissive (0..) }
   */
  constructor(game, o) {
    this.w = o.w; this.h = o.h
    const ppm = o.ppm ?? 96
    this.W = Math.max(4, Math.round(o.w * ppm)); this.H = Math.max(4, Math.round(o.h * ppm))
    this.canvas = document.createElement('canvas')
    this.canvas.width = this.W; this.canvas.height = this.H
    this.ctx = this.canvas.getContext('2d')
    this.tex = new THREE.CanvasTexture(this.canvas)
    this.tex.colorSpace = THREE.SRGBColorSpace
    this.tex.magFilter = THREE.NearestFilter
    this.tex.minFilter = THREE.LinearFilter
    this.tex.generateMipmaps = false
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...game.uniforms, uMap: { value: this.tex }, uEmissive: { value: o.emissive ?? 0 }, uDomain: { value: o.indoor === false ? 1 : 2 } },
      vertexShader: vert, fragmentShader: frag,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), mat)
    this.mesh.matrixAutoUpdate = false
    this.mesh.frustumCulled = true
    this.mesh.name = 'res_plate'
    if (o.draw) this.redraw(o.draw)
    game.scene.add(this.mesh)
  }
  redraw(draw) {
    this.ctx.clearRect(0, 0, this.W, this.H)
    draw(this.ctx, this.W, this.H)
    this.tex.needsUpdate = true
  }
  /** Place the plate centre at (x,y,z); angle 0 faces +Z (same convention as Signs). */
  setTransform(x, y, z, angle) {
    const m = this.mesh
    m.position.set(x, y, z)
    m.rotation.set(0, angle, 0)
    m.updateMatrix()
    m.updateMatrixWorld(true)
  }
  set visible(v) { this.mesh.visible = v }
}
