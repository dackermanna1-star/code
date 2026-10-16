// Footprint decals pressed into the snow. Multiplicative blending darkens whatever lit snow
// is beneath, so prints read correctly under sodium light or blue night ambient. Prints fill
// back in as fresh snow accumulates.

import * as THREE from 'three'

const MAX = 1400

export class Footprints {
  constructor(shared) {
    this.shared = shared
    const g = new THREE.PlaneGeometry(0.16, 0.34)
    g.rotateX(-Math.PI / 2)
    this.spawn = new Float32Array(MAX * 2) // spawn accumulation, depth
    this.geometry = g
    this.attr = new THREE.InstancedBufferAttribute(this.spawn, 2)
    this.attr.setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('aSpawn', this.attr)
    this.uniforms = { ...shared, uAccum: { value: 0 } }
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec2 aSpawn;
        uniform float uAccum;
        varying vec2 vUv;
        varying float vFade;
        varying float vDist;
        void main() {
          vUv = uv;
          float age = uAccum - aSpawn.x;
          vFade = clamp(1.0 - age / 0.9, 0.0, 1.0) * aSpawn.y;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vDist = length(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vFade;
        varying float vDist;
        float sdSole(vec2 p) {
          // boot sole: toe ellipse + heel ellipse
          vec2 a = (p - vec2(0.5, 0.66)) / vec2(0.42, 0.30);
          vec2 b = (p - vec2(0.5, 0.22)) / vec2(0.34, 0.20);
          return min(length(a), length(b));
        }
        void main() {
          float d = sdSole(vUv);
          float m = 1.0 - smoothstep(0.75, 1.0, d);
          float rim = smoothstep(0.85, 1.0, d) * (1.0 - smoothstep(1.0, 1.2, d));
          // tread pattern
          float tread = 0.85 + 0.15 * step(0.5, fract(vUv.y * 9.0));
          vec3 dark = vec3(0.62, 0.68, 0.80) * tread;
          float a = m * vFade * clamp(1.0 - vDist / 45.0, 0.0, 1.0);
          vec3 c = mix(vec3(1.0), dark, a);
          c = mix(c, vec3(1.06), rim * vFade * 0.5);
          gl_FragColor = vec4(c, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.ZeroFactor,
      blendEquation: THREE.AddEquation,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    this.mesh = new THREE.InstancedMesh(g, this.material, MAX)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
    this.next = 0
    this.total = 0
    this.accum = 0
    this._m = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._s = new THREE.Vector3(1, 1, 1)
    this._p = new THREE.Vector3()
  }

  /** Add one print. heading = yaw (radians), side = -1 left / +1 right, depth 0..1 visibility. */
  add(x, y, z, heading, side, depth = 1, ageOffset = 0) {
    const i = this.next
    this.next = (this.next + 1) % MAX
    this.total = Math.min(MAX, this.total + 1)
    const ox = Math.cos(heading) * 0.09 * side, oz = -Math.sin(heading) * 0.09 * side
    this._p.set(x + ox, y + 0.012, z + oz)
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading + (side * 0.06))
    this._m.compose(this._p, this._q, this._s)
    this.mesh.setMatrixAt(i, this._m)
    this.spawn[i * 2] = this.accum - ageOffset
    this.spawn[i * 2 + 1] = depth
    this.mesh.count = this.total
    this.mesh.instanceMatrix.needsUpdate = true
    this.attr.needsUpdate = true
  }

  /** A pre-existing trail of prints between points [[x,z],...]; age 0..1 (1 = almost filled). */
  addTrail(points, terrain, age = 0.3, stride = 0.72) {
    let side = 1
    for (let k = 0; k < points.length - 1; k++) {
      const [x0, z0] = points[k], [x1, z1] = points[k + 1]
      const len = Math.hypot(x1 - x0, z1 - z0)
      const heading = Math.atan2(-(x1 - x0), -(z1 - z0))
      for (let d = 0; d < len; d += stride / 2) {
        const t = d / len
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t
        const y = terrain.heightAt(x, z)
        if (!Number.isFinite(y)) continue
        this.add(x, y, z, heading, side, 0.85, age * 0.9)
        side = -side
      }
    }
  }

  /** Advance snow accumulation (prints fill at a rate proportional to snowfall). */
  update(dt, snowIntensity) {
    this.accum += dt * snowIntensity * 0.0045
    this.uniforms.uAccum.value = this.accum
  }
}
