// Signs, posters, plates and notices: small canvas-drawn quads packed into texture atlases and
// merged into a few draw calls. They are lit by the same lights and fog as the voxels, can
// glow (shop signs, metro "М"), and use crisp low-resolution pixels to match the voxel world.

import * as THREE from 'three'
import { commonUniformsGLSL, hashGLSL, lightingGLSL, fogGLSL } from './shaderChunks.js'

const PAGE = 2048

export const SIGN_FONT = '"Arial Narrow", "Roboto Condensed", "DejaVu Sans Condensed", "Liberation Sans Narrow", Arial, sans-serif'
export const PLAIN_FONT = 'Arial, "DejaVu Sans", "Liberation Sans", sans-serif'
export const SERIF_FONT = '"Times New Roman", "DejaVu Serif", "Liberation Serif", serif'
export const HAND_FONT = '"Comic Sans MS", "Segoe Print", "DejaVu Sans", cursive'

/**
 * Draw text lines onto a canvas.
 * o: { lines: string[] | string, size (fraction of H per line, default auto), font, weight ('bold'),
 *      color, bg, border (color), borderW (px), align ('center'|'left'|'right'), valign, pad (px),
 *      lineGap (fraction), italic, shadow, jitter (handwriting wobble px) }
 */
export function drawText(ctx, W, H, o) {
  const lines = Array.isArray(o.lines) ? o.lines : String(o.lines ?? o.text ?? '').split('\n')
  if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, W, H) }
  const pad = o.pad ?? Math.round(Math.min(W, H) * 0.08)
  if (o.border) {
    ctx.strokeStyle = o.border
    const bw = o.borderW ?? Math.max(1, Math.round(Math.min(W, H) * 0.04))
    ctx.lineWidth = bw
    ctx.strokeRect(bw / 2, bw / 2, W - bw, H - bw)
  }
  const gap = o.lineGap ?? 0.18
  const n = lines.length
  let size = o.size ? o.size * H : (H - pad * 2) / (n + (n - 1) * gap)
  const family = o.font ?? SIGN_FONT
  const weight = o.weight ?? 'bold'
  const style = o.italic ? 'italic ' : ''
  // shrink to fit width
  ctx.font = `${style}${weight} ${size}px ${family}`
  let maxW = 0
  for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width)
  if (maxW > W - pad * 2) { size *= (W - pad * 2) / maxW; ctx.font = `${style}${weight} ${size}px ${family}` }
  const total = size * n + size * gap * (n - 1)
  let y = o.valign === 'top' ? pad : o.valign === 'bottom' ? H - pad - total : (H - total) / 2
  ctx.textBaseline = 'top'
  ctx.textAlign = o.align ?? 'center'
  const x = ctx.textAlign === 'left' ? pad : ctx.textAlign === 'right' ? W - pad : W / 2
  for (const l of lines) {
    if (o.shadow) { ctx.fillStyle = o.shadow; ctx.fillText(l, x + 1, y + 1) }
    ctx.fillStyle = o.color ?? '#111'
    if (o.jitter) {
      // per-character wobble for handwriting
      let cx = ctx.textAlign === 'left' ? x : x - ctx.measureText(l).width / (ctx.textAlign === 'center' ? 2 : 1)
      const save = ctx.textAlign
      ctx.textAlign = 'left'
      for (const ch of l) {
        ctx.save()
        ctx.translate(cx, y + (Math.random() - 0.5) * o.jitter)
        ctx.rotate((Math.random() - 0.5) * 0.08)
        ctx.fillText(ch, 0, 0)
        ctx.restore()
        cx += ctx.measureText(ch).width
      }
      ctx.textAlign = save
    } else ctx.fillText(l, x, y)
    y += size * (1 + gap)
  }
}

export class Signs {
  constructor(shared) {
    this.shared = shared
    this.items = []
    this.meshes = []
  }

  /**
   * Add a sign.
   * o: { x, y, z (center, meters), angle (radians; 0 = facing +Z / south), rot (quarter turns),
   *      w, h (meters), ppm (pixels per meter, default 56), draw(ctx, W, H) or text options
   *      (see drawText: lines, bg, color, ...), emissive (0..n self-light), schedule
   *      ('always'|'night'|'street'), indoor (bool), aged (0..1 dirt & fading), double (both sides) }
   */
  add(o) {
    const ppm = o.ppm ?? 56
    const W = Math.max(4, Math.round(o.w * ppm)), H = Math.max(4, Math.round(o.h * ppm))
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const ctx = c.getContext('2d')
    ctx.imageSmoothingEnabled = false
    if (o.draw) o.draw(ctx, W, H)
    else drawText(ctx, W, H, o)
    if (o.aged) ageCanvas(ctx, W, H, o.aged, o.seed ?? this.items.length)
    const item = { ...o, canvas: c, W, H, angle: o.angle ?? (o.rot ?? 0) * Math.PI / 2 }
    this.items.push(item)
    return item
  }

  build(scene) {
    // shelf-pack into pages
    const items = [...this.items].sort((a, b) => b.H - a.H)
    const pages = []
    let page = null
    for (const it of items) {
      const w = Math.min(PAGE, it.W + 2), h = Math.min(PAGE, it.H + 2)
      if (!page || !fits(page, w, h)) {
        if (page && fitsNewShelf(page, w, h)) newShelf(page, h)
        else { page = { shelves: [], items: [], y: 0 }; pages.push(page); newShelf(page, h) }
      }
      const sh = page.shelves[page.shelves.length - 1]
      it.u = sh.x + 1; it.v = sh.y + 1
      sh.x += w
      page.items.push(it)
    }
    for (const pg of pages) this._buildPage(pg, scene)
  }

  _buildPage(pg, scene) {
    const canvas = document.createElement('canvas')
    canvas.width = PAGE; canvas.height = PAGE
    const ctx = canvas.getContext('2d')
    for (const it of pg.items) ctx.drawImage(it.canvas, it.u, it.v, Math.min(it.W, PAGE - 2), Math.min(it.H, PAGE - 2))
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.anisotropy = 4
    tex.flipY = false
    const pos = [], uv = [], nrm = [], emi = [], idx = []
    let v = 0
    const push = (it, flip) => {
      const ang = it.angle + (flip ? Math.PI : 0)
      const nx = Math.sin(ang), nz = Math.cos(ang)
      const rx = Math.cos(ang), rz = -Math.sin(ang) // right vector (reading direction)
      const hw = it.w / 2, hh = it.h / 2
      const off = 0.006 * (flip ? -1 : 1)
      const cx = it.x + Math.sin(it.angle) * off, cz = it.z + Math.cos(it.angle) * off
      const u0 = it.u / PAGE, v0 = it.v / PAGE, u1 = (it.u + it.W) / PAGE, v1 = (it.v + it.H) / PAGE
      const corners = [[-hw, -hh, u0, v1], [hw, -hh, u1, v1], [hw, hh, u1, v0], [-hw, hh, u0, v0]]
      for (const [a, b, uu, vv] of corners) {
        pos.push(cx + rx * a, it.y + b, cz + rz * a)
        uv.push(uu, vv)
        nrm.push(nx, 0, nz)
        const sched = it.schedule === 'night' ? 1 : it.schedule === 'street' ? 2 : 0
        emi.push(it.emissive ?? 0, sched, it.indoor ? 1 : 0)
      }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3)
      v += 4
    }
    for (const it of pg.items) {
      push(it, false)
      if (it.double) push(it, true)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
    g.setAttribute('aEmis', new THREE.Float32BufferAttribute(emi, 3))
    g.setIndex(idx)
    g.computeBoundingSphere()
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.shared, uMap: { value: tex } },
      vertexShader: /* glsl */ `
        attribute vec3 aEmis;
        varying vec2 vUv; varying vec3 vWorld; varying vec3 vN; varying vec3 vEmis;
        void main() {
          vUv = uv; vN = normal; vEmis = aEmis;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
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
          float domain = vEmis.z > 0.5 ? 2.0 : 1.0;
          vec3 spec = vec3(0.0);
          vec3 amb = domain > 1.5 ? uIndoorAmb : mix(uGroundAmb, uSkyAmb, 0.6);
          vec3 dl = evalLights(vWorld + N * 0.05, N, domain, V, 0.1, 0.2, spec);
          vec3 col = tx.rgb * (amb + dl) + spec * 0.3;
          float on = vEmis.y < 0.5 ? 1.0 : vEmis.y < 1.5 ? uNight : uStreetOn;
          col += tx.rgb * vEmis.x * on;
          col = applyFog(col, vWorld);
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.FrontSide,
    })
    const mesh = new THREE.Mesh(g, mat)
    mesh.name = 'signs'
    mesh.matrixAutoUpdate = false
    scene.add(mesh)
    this.meshes.push(mesh)
  }
}

function fits(page, w, h) {
  const sh = page.shelves[page.shelves.length - 1]
  return sh && sh.x + w <= PAGE && h <= sh.h
}
function fitsNewShelf(page, w, h) { return page.y + h <= PAGE && w <= PAGE }
function newShelf(page, h) { page.shelves.push({ x: 0, y: page.y, h }); page.y += h }

/** Weather a canvas: fade, dirt speckles, water streaks, torn corners. */
export function ageCanvas(ctx, W, H, amount, seed = 1) {
  let s = seed * 9301 + 49297
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = `rgba(150,140,110,${0.25 * amount})`
  ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < W * H * 0.004 * amount; i++) {
    ctx.fillStyle = `rgba(${40 + r() * 40},${35 + r() * 30},${30 + r() * 20},${0.15 + r() * 0.3 * amount})`
    ctx.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2)
  }
  for (let i = 0; i < 6 * amount; i++) {
    const x = r() * W
    const g = ctx.createLinearGradient(x, 0, x, H)
    g.addColorStop(0, 'rgba(90,80,60,0)')
    g.addColorStop(0.5 + r() * 0.5, `rgba(90,80,60,${0.25 * amount})`)
    g.addColorStop(1, 'rgba(90,80,60,0)')
    ctx.fillStyle = g
    ctx.fillRect(x, 0, 1 + r() * 3, H)
  }
  ctx.restore()
  // torn corner
  if (amount > 0.4 && r() < 0.6) {
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    const cx = r() < 0.5 ? 0 : W, cy = r() < 0.5 ? 0 : H
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + (cx ? -1 : 1) * W * (0.1 + r() * 0.2), cy)
    ctx.lineTo(cx, cy + (cy ? -1 : 1) * H * (0.1 + r() * 0.2))
    ctx.fill()
    ctx.restore()
  }
}
