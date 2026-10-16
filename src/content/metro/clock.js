// Interval clock (интервальные часы) over the tunnel mouths: left half the time of day, right
// half the time since the last train left. A canvas texture shared by every mount, redrawn once
// a second, shown on small planes that glow and take the same fog as the voxel world.

import * as THREE from 'three'
import { commonUniformsGLSL, fogGLSL } from '../../render/shaderChunks.js'

// 7-segment layout: a b c d e f g (standard order)
const DIGITS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', ' ': '', '-': 'g',
}

function segPath(ctx, s, x, y, w, h, t) {
  // segment rectangles with slanted ends, in a w × h cell, stroke thickness t
  const k = t / 2
  ctx.beginPath()
  const H = (x0, y0, len) => { ctx.moveTo(x0 + k, y0); ctx.lineTo(x0 + len - k, y0); ctx.lineTo(x0 + len, y0 + k); ctx.lineTo(x0 + len - k, y0 + t); ctx.lineTo(x0 + k, y0 + t); ctx.lineTo(x0, y0 + k); ctx.closePath() }
  const Vv = (x0, y0, len) => { ctx.moveTo(x0, y0 + k); ctx.lineTo(x0 + k, y0); ctx.lineTo(x0 + t, y0 + k); ctx.lineTo(x0 + t, y0 + len - k); ctx.lineTo(x0 + k, y0 + len); ctx.lineTo(x0, y0 + len - k); ctx.closePath() }
  const hh = (h - t) / 2
  if (s === 'a') H(x + t * 0.5, y, w - t)
  if (s === 'g') H(x + t * 0.5, y + hh, w - t)
  if (s === 'd') H(x + t * 0.5, y + 2 * hh, w - t)
  if (s === 'f') Vv(x, y + t * 0.5, hh)
  if (s === 'b') Vv(x + w - t, y + t * 0.5, hh)
  if (s === 'e') Vv(x, y + hh + t * 0.5, hh)
  if (s === 'c') Vv(x + w - t, y + hh + t * 0.5, hh)
}

function drawDigit(ctx, ch, x, y, w, h, t) {
  const on = DIGITS[ch] ?? ''
  for (const s of 'abcdefg') {
    segPath(ctx, s, x, y, w, h, t)
    if (on.includes(s)) {
      ctx.fillStyle = '#ff3a1e'
      ctx.shadowColor = 'rgba(255,60,30,0.9)'; ctx.shadowBlur = t * 1.2
      ctx.fill()
      ctx.shadowBlur = 0
    } else {
      ctx.fillStyle = '#2a0805'
      ctx.fill()
    }
  }
}

export class IntervalClock {
  constructor(ctx) {
    this.ctx = ctx
    this.canvas = document.createElement('canvas')
    this.canvas.width = 512; this.canvas.height = 112
    this.g = this.canvas.getContext('2d')
    this.tex = new THREE.CanvasTexture(this.canvas)
    this.tex.colorSpace = THREE.SRGBColorSpace
    this.tex.magFilter = THREE.LinearFilter
    this.tex.minFilter = THREE.LinearFilter
    this.tex.generateMipmaps = false
    this.meshes = []
    this.key = ''
    this.material = null
  }

  /** Create the display meshes. mounts: [{ x, y, z, angle }] (angle 0 faces +z, like signs). */
  build(mounts) {
    const shared = this.ctx.game?.uniforms
    if (!shared) return
    this.material = new THREE.ShaderMaterial({
      uniforms: { ...shared, uMap: { value: this.tex }, uGain: { value: 2.4 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform float uGain;
        ${commonUniformsGLSL}
        ${fogGLSL}
        varying vec2 vUv; varying vec3 vWorld;
        void main() {
          vec3 c = texture2D(uMap, vUv).rgb * uGain;
          c = applyFog(c, vWorld);
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
    const geo = new THREE.PlaneGeometry(1.6, 0.35)
    for (const m of mounts) {
      const mesh = new THREE.Mesh(geo, this.material)
      mesh.position.set(m.x, m.y, m.z)
      mesh.rotation.y = m.angle
      mesh.name = 'metro_interval_clock'
      mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      this.ctx.scene.add(mesh)
      this.meshes.push(mesh)
    }
  }

  /** Redraw if the shown values changed. minutes: game clock; interval: seconds. */
  set(minutes, interval, blink) {
    const m = Math.floor(minutes) % 1440
    const hh = String(Math.floor(m / 60)).padStart(2, '0'), mm = String(m % 60).padStart(2, '0')
    const iv = Math.max(0, Math.floor(interval))
    const im = Math.min(99, Math.floor(iv / 60)), is = iv % 60
    const left = hh + mm, right = (im < 10 ? ' ' + im : String(im)) + String(is).padStart(2, '0')
    const key = left + right + (blink ? 1 : 0)
    if (key === this.key) return
    this.key = key
    const g = this.g, W = this.canvas.width, H = this.canvas.height
    g.fillStyle = '#060606'; g.fillRect(0, 0, W, H)
    g.fillStyle = '#121212'; g.fillRect(W / 2 - 3, 6, 6, H - 12) // divider
    const dw = 40, dh = 74, t = 9, gap = 14, y = (H - dh) / 2
    const drawGroup = (s, x0, colon) => {
      let x = x0
      for (let i = 0; i < 4; i++) {
        drawDigit(g, s[i], x, y, dw, dh, t)
        x += dw + gap
        if (i === 1) {
          g.fillStyle = colon ? '#ff3a1e' : '#2a0805'
          g.fillRect(x - gap / 2 - 4, y + dh * 0.28, 8, 8)
          g.fillRect(x - gap / 2 - 4, y + dh * 0.64, 8, 8)
          x += 6
        }
      }
    }
    drawGroup(left, 16, blink)
    drawGroup(right, W / 2 + 18, true)
    this.tex.needsUpdate = true
  }

  dispose() {
    for (const m of this.meshes) this.ctx.scene.remove(m)
    this.tex.dispose()
    this.material?.dispose()
  }
}
