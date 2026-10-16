// GPU snowfall. Flakes live in a box that wraps around the camera; they are lit by the same
// lights as the world (so they glitter in lamp cones) and stop at roofs via the roof texture.

import * as THREE from 'three'
import { commonUniformsGLSL, hashGLSL, lightingGLSL, fogGLSL } from './shaderChunks.js'
import { mulberry32 } from '../core/rng.js'
import { WORLD_SIZE } from '../core/constants.js'

export class Snowfall {
  constructor(shared, count = 60000) {
    this.count = count
    const rnd = mulberry32(4242)
    const a = new Float32Array(count * 4)
    for (let i = 0; i < count * 4; i++) a[i] = rnd()
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('aRand', new THREE.BufferAttribute(a, 4))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    this.uniforms = {
      ...shared,
      uBox: { value: new THREE.Vector3(44, 26, 44) },
      uWindOff: { value: new THREE.Vector3() },
      uFallOff: { value: 0 },
      uIntensity: { value: 0.3 },
      uFlakeSize: { value: 0.022 },
      uPixel: { value: 600 },
      uRoof: { value: null },
      uWorldSize: { value: WORLD_SIZE },
      uSwirl: { value: 0.3 },
    }
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec4 aRand;
        uniform vec3 uBox;
        uniform vec3 uWindOff;
        uniform float uFallOff;
        uniform float uIntensity;
        uniform float uFlakeSize;
        uniform float uPixel;
        uniform sampler2D uRoof;
        uniform float uWorldSize;
        uniform float uSwirl;
        ${commonUniformsGLSL}
        ${hashGLSL}
        ${lightingGLSL}
        ${fogGLSL}
        varying vec3 vCol;
        varying float vAlpha;
        void main() {
          float r = aRand.w;
          vec3 p = aRand.xyz * uBox;
          p.y -= uFallOff * (0.65 + 0.7 * fract(r * 7.13));
          p.xz += uWindOff.xz * (0.75 + 0.5 * fract(r * 3.7));
          float t = uTime * (0.6 + r);
          p.x += sin(t + aRand.x * 40.0) * 0.35 * (0.4 + uSwirl);
          p.z += cos(t * 0.8 + aRand.z * 40.0) * 0.35 * (0.4 + uSwirl);
          p.y += sin(t * 1.3 + aRand.y * 30.0) * 0.12 * uSwirl;
          vec3 cam = cameraPosition;
          p = mod(p - cam + uBox * 0.5, uBox) + cam - uBox * 0.5;
          float visible = step(r, uIntensity);
          // roof occlusion
          vec2 ruv = (p.xz + 0.5) / uWorldSize;
          float roof = texture2D(uRoof, ruv).r;
          if (p.y < roof) visible = 0.0;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          float size = uFlakeSize * (0.6 + 0.8 * fract(r * 13.7));
          float px = size * uPixel / max(d, 0.1);
          vAlpha = visible * clamp(px * 1.2, 0.0, 1.0) * smoothstep(0.15, 0.6, d);
          gl_PointSize = visible > 0.0 ? clamp(px, 1.4, 18.0) : 0.0;
          vec3 spec = vec3(0.0);
          vec3 dl = evalLights(p, vec3(0.0, 1.0, 0.0), 1.0, vec3(0.0, 1.0, 0.0), 0.0, 1000.0, spec);
          vec3 c = vec3(0.85, 0.88, 0.95) * (uSkyAmb * 1.6 + uGroundAmb + dl * 1.1 + uSunCol * 0.5);
          vec3 rd = p - cam; float dist = length(rd); rd /= max(dist, 1e-3);
          float tr = exp(-fogAmount(cam, rd, dist) - uWhiteout * dist * 0.06);
          vCol = c * tr + fogSky(rd) * (1.0 - tr);
          vAlpha *= mix(0.25, 1.0, tr);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float rr = dot(c, c);
          if (rr > 1.0) discard;
          float a = (1.0 - rr) * vAlpha;
          gl_FragColor = vec4(vCol, a * 0.9);
        }`,
      transparent: true,
      depthWrite: false,
    })
    this.points = new THREE.Points(g, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 10
    this.windOff = new THREE.Vector3()
    this.fallOff = 0
  }

  setPixelScale(heightPx, fovDeg) {
    this.uniforms.uPixel.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360))
  }

  /** intensity 0..1, wind = Vector3 (m/s), fallSpeed m/s */
  update(dt, intensity, wind, fallSpeed, swirl) {
    this.windOff.addScaledVector(wind, dt)
    this.fallOff += fallSpeed * dt
    // keep offsets bounded for float precision (box is wrapped anyway)
    const B = this.uniforms.uBox.value
    this.windOff.x %= B.x * 1000; this.windOff.z %= B.z * 1000
    this.fallOff %= B.y * 1000
    this.uniforms.uWindOff.value.copy(this.windOff)
    this.uniforms.uFallOff.value = this.fallOff
    this.uniforms.uIntensity.value = intensity
    this.uniforms.uSwirl.value = swirl
  }
}
