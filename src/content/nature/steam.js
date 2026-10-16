// Steam plumes: one GPU particle system (a single instanced draw call) for every manhole,
// heat-pipe leak, basement vent, boiler-house chimney and car exhaust in the city. Particles are
// soft billboards whose motion is evaluated analytically in the vertex shader from their spawn
// time (no per-frame CPU simulation); they are lit by the shared lamp lights and sit in the
// same fog as everything else, so a manhole plume glows orange under a sodium lamp at night.

import * as THREE from 'three'
import { commonUniformsGLSL, hashGLSL, lightingGLSL, fogGLSL } from '../../render/shaderChunks.js'

const MAX = 4096

/** Emitter presets (all overridable). Sizes in m, rates per second, rise in m/s, life in s. */
export const STEAM_PRESETS = {
  manhole: { rate: 5, size: 0.7, rise: 0.9, life: 5.5, opacity: 0.2, spread: 0.7, color: 0xe2e5e8, maxDist: 160 },
  vent: { rate: 3, size: 0.45, rise: 0.55, life: 3.8, opacity: 0.18, spread: 0.4, color: 0xdcdfe2, maxDist: 110 },
  pipe: { rate: 7, size: 0.55, rise: 1.2, life: 4.2, opacity: 0.2, spread: 0.6, color: 0xe4e6e8, maxDist: 160 },
  chimney: { rate: 5, size: 3.2, rise: 2.4, life: 16, opacity: 0.4, spread: 3.5, color: 0xd5d6d6, maxDist: 900 },
  exhaust: { rate: 11, size: 0.22, rise: 0.22, life: 2.4, opacity: 0.3, spread: 0.25, color: 0xb6b5b0, maxDist: 90 },
  breath: { rate: 1.5, size: 0.18, rise: 0.15, life: 1.4, opacity: 0.18, spread: 0.1, color: 0xdfe2e4, maxDist: 40 },
  kettle: { rate: 3, size: 0.2, rise: 0.4, life: 2.2, opacity: 0.25, spread: 0.15, color: 0xe8e8e8, maxDist: 60 },
  powder: { rate: 0, size: 0.55, rise: -0.15, life: 1.8, opacity: 0.55, spread: 0.6, color: 0xf2f4f6, gravity: 1.2, maxDist: 120 },
}

const vertex = /* glsl */ `
attribute vec4 aSpawn;  // x y z t0
attribute vec4 aParam;  // size life rise seed
attribute vec4 aColor;  // r g b opacity
attribute vec4 aMove;   // vx vz gravity spread
uniform vec3 uWind;
${commonUniformsGLSL}
${hashGLSL}
${lightingGLSL}
${fogGLSL}
varying vec2 vUv;
varying vec4 vCol;
varying float vSeed;
void main() {
  float age = uTime - aSpawn.w;
  float life = aParam.y;
  if (age < 0.0 || age > life || aColor.a <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec4(0.0); return; }
  float k = age / life;
  float sd = aParam.w;
  vec3 p = aSpawn.xyz;
  // buoyant rise that slows as the puff cools; powder falls with gravity
  p.y += aParam.z * life * (1.0 - exp(-2.2 * k)) / 2.2 - 0.5 * aMove.z * age * age;
  p.xz += aMove.xy * life * (1.0 - exp(-2.5 * k)) / 2.5;
  p += uWind * age * (0.25 + 0.75 * k);
  float sp = aMove.w * k;
  p.x += (vnoise2(vec2(age * 0.6 + sd * 31.0, sd * 7.0)) - 0.5) * sp * 2.2;
  p.z += (vnoise2(vec2(sd * 13.0, age * 0.6 + sd * 17.0)) - 0.5) * sp * 2.2;
  p.y += (vnoise2(vec2(sd * 3.0 + age * 0.4, 5.0)) - 0.5) * sp * 0.8;
  float size = aParam.x * (0.35 + 1.45 * sqrt(k));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float rot = sd * 6.2831 + age * (fract(sd * 7.31) - 0.5) * 0.8;
  vec2 c = position.xy;
  mv.xy += vec2(c.x * cos(rot) - c.y * sin(rot), c.x * sin(rot) + c.y * cos(rot)) * size;
  gl_Position = projectionMatrix * mv;
  vUv = c * 0.5 + 0.5;
  vSeed = sd;
  float a = smoothstep(0.0, 0.14, k) * (1.0 - smoothstep(0.4, 1.0, k)) * aColor.a;
  float d = -mv.z;
  a *= smoothstep(0.25, 1.6, d);
  vec3 spec = vec3(0.0);
  vec3 dl = evalLights(p, vec3(0.0, 1.0, 0.0), 1.0, vec3(0.0, 1.0, 0.0), 0.0, 1000.0, spec);
  vec3 col = aColor.rgb * (uSkyAmb * 1.5 + uGroundAmb + dl * 0.85 + uSunCol * 0.6);
  vec3 rd = p - cameraPosition;
  float dist = length(rd);
  rd /= max(dist, 1e-3);
  float tr = exp(-fogAmount(cameraPosition, rd, dist) - uWhiteout * dist * 0.06);
  col = col * tr + fogSky(rd) * (1.0 - tr);
  a *= mix(0.35, 1.0, tr);
  vCol = vec4(col, a);
}
`

const fragment = /* glsl */ `
${hashGLSL}
varying vec2 vUv;
varying vec4 vCol;
varying float vSeed;
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float r = dot(c, c);
  if (r > 1.0 || vCol.a <= 0.0) discard;
  float n = vnoise2(vUv * 3.0 + vSeed * 17.0) * 0.6 + vnoise2(vUv * 6.5 - vSeed * 5.0) * 0.4;
  float f = 1.0 - r;
  float a = f * f * (0.45 + 1.0 * n) * vCol.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol.rgb * a, a);
}
`

export class SteamSystem {
  constructor(ctx) {
    this.ctx = ctx
    const g = new THREE.InstancedBufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
    g.setIndex([0, 1, 2, 0, 2, 3])
    const mk = () => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4)
      a.setUsage(THREE.DynamicDrawUsage)
      return a
    }
    this.attrs = { aSpawn: mk(), aParam: mk(), aColor: mk(), aMove: mk() }
    for (const [k, a] of Object.entries(this.attrs)) g.setAttribute(k, a)
    g.instanceCount = 0 // grows to the highest slot in use
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    this.uniforms = { ...ctx.game.uniforms, uWind: { value: new THREE.Vector3() } }
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    })
    this.mesh = new THREE.Mesh(g, this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 8
    this.mesh.name = 'nature_steam'
    ctx.scene.add(this.mesh)
    this.emitters = []
    this.cursor = 0
    this.dirty0 = MAX
    this.dirty1 = -1
    this._c = new THREE.Color()
    this.time = 0
  }

  /** Register an emitter. Returns a handle. */
  add(o) {
    const pre = STEAM_PRESETS[o.kind] || STEAM_PRESETS.manhole
    const col = this._c.set(o.color ?? pre.color)
    const em = {
      x: o.x, y: o.y, z: o.z,
      rate: o.rate ?? pre.rate, size: o.size ?? pre.size, rise: o.rise ?? pre.rise, life: o.life ?? pre.life,
      opacity: o.opacity ?? pre.opacity, spread: o.spread ?? pre.spread, gravity: o.gravity ?? pre.gravity ?? 0,
      vx: o.vel?.[0] ?? 0, vz: o.vel?.[1] ?? 0, jitter: o.jitter ?? 0.15,
      r: col.r, g: col.g, b: col.b,
      maxDist: o.maxDist ?? pre.maxDist ?? 150,
      active: o.active ?? true, acc: 0, warm: false, gust: o.gust ?? 0, kind: o.kind ?? 'manhole', tag: o.tag ?? null,
      seed: (o.seed ?? (this.emitters.length * 0.618)) % 1,
    }
    this.emitters.push(em)
    const sys = this
    return {
      emitter: em,
      set(x, y, z) { em.x = x; em.y = y; em.z = z },
      setVelocity(vx, vz) { em.vx = vx; em.vz = vz },
      setRate(r) { em.rate = r },
      setOpacity(a) { em.opacity = a },
      start() { em.active = true },
      stop() { em.active = false; em.warm = false },
      remove() { const i = sys.emitters.indexOf(em); if (i >= 0) sys.emitters.splice(i, 1) },
    }
  }

  /** One-off burst of particles (snow powder puffs, a door opening onto frost...). */
  burst(o, n) {
    const pre = STEAM_PRESETS[o.kind] || STEAM_PRESETS.powder
    const col = this._c.set(o.color ?? pre.color)
    const em = {
      x: o.x, y: o.y, z: o.z, size: o.size ?? pre.size, rise: o.rise ?? pre.rise, life: o.life ?? pre.life,
      opacity: o.opacity ?? pre.opacity, spread: o.spread ?? pre.spread, gravity: o.gravity ?? pre.gravity ?? 0,
      vx: 0, vz: 0, jitter: o.jitter ?? 0.4, r: col.r, g: col.g, b: col.b, seed: hashish(this.time, o.x + o.z),
    }
    const speed = o.speed ?? 0.8
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hashish(i, em.x) * 2
      em.vx = Math.cos(a) * speed * (0.4 + hashish(i + 7, em.z))
      em.vz = Math.sin(a) * speed * (0.4 + hashish(i + 3, em.y))
      this._spawn(em, this.time - hashish(i, 1.7) * 0.15, i)
    }
  }

  _spawn(em, t0, salt) {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % MAX
    if (i >= this.mesh.geometry.instanceCount) this.mesh.geometry.instanceCount = i + 1
    if (i < this.dirty0) this.dirty0 = i
    if (i > this.dirty1) this.dirty1 = i
    const j = em.jitter
    const h1 = hashish(i + salt * 3.1, t0), h2 = hashish(i * 1.7 + 3, t0 + salt), h3 = hashish(i * 2.3 + 11, t0 * 1.3)
    const s = this.attrs.aSpawn.array, p = this.attrs.aParam.array, c = this.attrs.aColor.array, m = this.attrs.aMove.array
    const o = i * 4
    s[o] = em.x + (h1 - 0.5) * j * 2; s[o + 1] = em.y; s[o + 2] = em.z + (h2 - 0.5) * j * 2; s[o + 3] = t0
    p[o] = em.size * (0.75 + 0.5 * h3); p[o + 1] = em.life * (0.75 + 0.5 * h1); p[o + 2] = em.rise * (0.8 + 0.4 * h2); p[o + 3] = hashish(i, t0 * 7.7)
    const shade = 0.9 + 0.2 * h2
    c[o] = em.r * shade; c[o + 1] = em.g * shade; c[o + 2] = em.b * shade; c[o + 3] = em.opacity
    m[o] = em.vx; m[o + 1] = em.vz; m[o + 2] = em.gravity; m[o + 3] = em.spread
  }

  update(dt, time, cam, wind) {
    this.time = time
    this.uniforms.uWind.value.copy(wind)
    const cx = cam.x, cy = cam.y, cz = cam.z
    let budget = 200
    for (let e = 0; e < this.emitters.length; e++) {
      const em = this.emitters[e]
      if (!em.active || em.rate <= 0) continue
      const dx = em.x - cx, dy = em.y - cy, dz = em.z - cz
      if (dx * dx + dy * dy + dz * dz > em.maxDist * em.maxDist) { em.warm = false; continue }
      if (!em.warm) {
        // pre-warm: back-date a full plume so it is already there when it comes into range
        const n = Math.min(Math.ceil(em.rate * em.life), 400)
        for (let k = 0; k < n; k++) this._spawn(em, time - (k + hashish(k, em.seed)) / em.rate, k)
        em.warm = true
        em.acc = 0
        continue
      }
      em.acc += em.rate * dt * (em.gust ? 0.6 + 0.8 * hashish(Math.floor(time * 2), em.seed) : 1)
      while (em.acc >= 1 && budget-- > 0) {
        em.acc -= 1
        this._spawn(em, time - em.acc / em.rate, e)
      }
      if (em.acc > 4) em.acc = 0
    }
    if (this.dirty1 >= this.dirty0) {
      for (const a of Object.values(this.attrs)) {
        a.clearUpdateRanges()
        a.addUpdateRange(this.dirty0 * 4, (this.dirty1 - this.dirty0 + 1) * 4)
        a.needsUpdate = true
      }
      this.dirty0 = MAX
      this.dirty1 = -1
    }
  }
}

function hashish(a, b) {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return x - Math.floor(x)
}
