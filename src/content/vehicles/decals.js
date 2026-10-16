// Moving decals: licence plates, route boards and fleet numbers on vehicles that drive. The
// engine's Signs are merged static geometry, so moving vehicles get their own tiny meshes: one
// shared canvas atlas, one small quad mesh per vehicle (local space), lit and fogged like signs
// (normals rotate with the vehicle), with an optional glow for lit route boards.

import * as THREE from 'three'
import { commonUniformsGLSL, hashGLSL, lightingGLSL, fogGLSL } from '../../render/shaderChunks.js'

const ATLAS_W = 1024, ATLAS_H = 1024

export class DecalAtlas {
  constructor(uniforms) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = ATLAS_W; this.canvas.height = ATLAS_H
    this.c = this.canvas.getContext('2d')
    this.c.imageSmoothingEnabled = false
    this.tex = new THREE.CanvasTexture(this.canvas)
    this.tex.colorSpace = THREE.SRGBColorSpace
    this.tex.magFilter = THREE.NearestFilter
    this.tex.minFilter = THREE.LinearMipmapLinearFilter
    this.tex.anisotropy = 4
    this.tex.flipY = false
    this.x = 0; this.y = 0; this.rowH = 0
    this.uniforms = uniforms
    this.full = false
  }

  /** Reserve a W×H pixel rect and draw into it with draw(ctx2d, W, H). Returns uv box or null. */
  alloc(W, H, draw) {
    W = Math.min(ATLAS_W - 2, Math.round(W)); H = Math.min(ATLAS_H - 2, Math.round(H))
    if (this.x + W + 2 > ATLAS_W) { this.x = 0; this.y += this.rowH + 2; this.rowH = 0 }
    if (this.y + H + 2 > ATLAS_H) { this.full = true; return null }
    const u = this.x + 1, v = this.y + 1
    this.c.save()
    this.c.translate(u, v)
    this.c.beginPath(); this.c.rect(0, 0, W, H); this.c.clip()
    try { draw(this.c, W, H) } catch (e) { /* a broken drawing must never stop the city */ }
    this.c.restore()
    this.x += W + 2
    this.rowH = Math.max(this.rowH, H)
    this.tex.needsUpdate = true
    return { u0: u / ATLAS_W, v0: v / ATLAS_H, u1: (u + W) / ATLAS_W, v1: (v + H) / ATLAS_H }
  }

  material() {
    return new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uMap: { value: this.tex }, uLit: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 aEmis;
        varying vec2 vUv; varying vec3 vWorld; varying vec3 vN; varying vec3 vEmis;
        void main() {
          vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vEmis = aEmis;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform float uLit;
        ${commonUniformsGLSL}
        ${hashGLSL}
        ${lightingGLSL}
        ${fogGLSL}
        varying vec2 vUv; varying vec3 vWorld; varying vec3 vN; varying vec3 vEmis;
        void main() {
          vec4 tx = texture2D(uMap, vUv);
          if (tx.a < 0.4) discard;
          vec3 N = normalize(vN);
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 spec = vec3(0.0);
          vec3 amb = mix(uGroundAmb, uSkyAmb, 0.6);
          vec3 dl = evalLights(vWorld + N * 0.05, N, 1.0, V, 0.1, 0.2, spec);
          vec3 col = tx.rgb * (amb + dl) + spec * 0.3;
          float on = vEmis.y < 0.5 ? 1.0 : vEmis.y < 1.5 ? uNight : uStreetOn;
          col += tx.rgb * vEmis.x * on * uLit;
          col = applyFog(col, vWorld);
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.FrontSide,
    })
  }
}

/**
 * Build a decal mesh. items: [{ pos:[lx,ly,lz], normal:[nx,0,nz], w, h, uv, emissive, schedule }]
 * (local metres; the mesh is moved with the vehicle).
 */
export function buildDecalMesh(atlas, items) {
  const pos = [], uv = [], nrm = [], emi = [], idx = []
  let n = 0
  for (const it of items) {
    if (!it.uv) continue
    const [nx, , nz] = it.normal
    const rx = nz, rz = -nx // reading direction (right vector) for a viewer facing the decal
    const hw = it.w / 2, hh = it.h / 2
    const { u0, v0, u1, v1 } = it.uv
    const corners = [[-hw, -hh, u0, v1], [hw, -hh, u1, v1], [hw, hh, u1, v0], [-hw, hh, u0, v0]]
    for (const [a, b, uu, vv] of corners) {
      pos.push(it.pos[0] + rx * a, it.pos[1] + b, it.pos[2] + rz * a)
      uv.push(uu, vv)
      nrm.push(nx, 0, nz)
      emi.push(it.emissive ?? 0, it.schedule === 'night' ? 1 : it.schedule === 'street' ? 2 : 0, 0)
    }
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3)
    n += 4
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('aEmis', new THREE.Float32BufferAttribute(emi, 3))
  g.setIndex(idx)
  g.computeBoundingSphere()
  const mesh = new THREE.Mesh(g, atlas.material())
  mesh.name = 'vehicle-decals'
  mesh.visible = false
  mesh.frustumCulled = true
  return mesh
}
