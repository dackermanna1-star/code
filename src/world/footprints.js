import * as THREE from 'three';
import { U } from '../engine/uniforms.js';

// Footprints live in a small deformation map that follows the player: R = height
// offset (m), G = disturbance. Prints are kept on the CPU (position, heading, age) and
// redrawn as instanced quads whenever the map moves or the prints change, so the GPU
// side has no persistent state. The wind slowly fills old prints back in.

const MAX_PRINTS = 700;

const VERT = /* glsl */ `
attribute vec4 aPrint;  // x, z, heading (bearing), foot (0 left / 1 right)
attribute vec4 aParams; // strength, running, age01, seed
uniform vec4 uRect;     // origin x, origin z, extent, 1/extent
varying vec2 vLocal;
varying vec4 vParams;
varying float vFoot;
void main() {
  // Quad local coordinates in metres: x across the foot, y along the heading.
  vec2 local = position.xy * vec2(0.36, 0.52);
  float h = aPrint.z;
  vec2 fwd = vec2(sin(h), -cos(h));
  vec2 right = vec2(cos(h), sin(h));
  vec2 w = aPrint.xy + right * local.x + fwd * local.y;
  vec2 ndc = (w - uRect.xy) * uRect.w * 2.0 - 1.0;
  vLocal = local;
  vParams = aParams;
  vFoot = aPrint.w;
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec2 vLocal;
varying vec4 vParams;
varying float vFoot;

float ellipse(vec2 p, vec2 c, vec2 r, float soft) {
  float d = length((p - c) / r);
  return 1.0 - smoothstep(1.0 - soft, 1.0 + soft, d);
}

void main() {
  vec2 p = vLocal;
  // Mirror for the left foot so the arch is on the inside.
  p.x *= vFoot > 0.5 ? 1.0 : -1.0;
  float age = vParams.z;
  float running = vParams.y;
  float soft = 0.1 + 0.55 * age;
  // Boot: heel + forefoot, slightly turned out.
  float heel = ellipse(p, vec2(0.0, -0.085), vec2(0.046, 0.056), soft);
  float sole = ellipse(p, vec2(0.008, 0.045), vec2(0.054, 0.088), soft);
  float shape = max(heel, sole);
  // Toe digs deeper when running; heel strikes harder when walking.
  float toe = ellipse(p, vec2(0.01, 0.085), vec2(0.045, 0.05), soft + 0.1);
  float depth = shape * (0.026 + 0.008 * (1.0 - running)) + toe * running * 0.03 + heel * (1.0 - running) * 0.01;
  // Loose sand slumps back in: the walls are not vertical.
  depth *= 1.0 - 0.45 * age;
  // Displaced sand piles up around the print, more in front when pushing off.
  float rim = ellipse(p, vec2(0.004, 0.0), vec2(0.1, 0.18), 0.35) - ellipse(p, vec2(0.004, 0.0), vec2(0.068, 0.15), 0.25);
  float spray = ellipse(p, vec2(0.0, 0.17 + 0.05 * running), vec2(0.07, 0.06 + 0.04 * running), 0.6);
  float bump = max(rim, 0.0) * 0.009 + spray * (0.004 + 0.006 * running);
  float fade = vParams.x * (1.0 - age);
  float hgt = (bump - depth) * fade;
  float disturb = clamp(shape + rim * 0.5 + spray * 0.4, 0.0, 1.0) * fade;
  gl_FragColor = vec4(hgt, disturb, 0.0, 1.0);
}
`;

export class Footprints {
  constructor(renderer, { size = 512, extent = 40 } = {}) {
    this.renderer = renderer;
    this.size = size;
    this.extent = extent;
    this.rt = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.HalfFloatType,
      format: THREE.RGFormat,
      depthBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.rt.texture.colorSpace = THREE.NoColorSpace;
    U.tDeform.value = this.rt.texture;
    this.origin = new THREE.Vector2(1e9, 1e9);
    this.prints = [];
    this.dirty = true;

    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    this.printAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PRINTS * 4), 4);
    this.paramAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PRINTS * 4), 4);
    this.printAttr.setUsage(THREE.DynamicDrawUsage);
    this.paramAttr.setUsage(THREE.DynamicDrawUsage);
    quad.setAttribute('aPrint', this.printAttr);
    quad.setAttribute('aParams', this.paramAttr);
    quad.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uRect: { value: new THREE.Vector4() } },
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // (right, forward) -> (x, z) is a reflection, which flips the quad's winding.
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(quad, this.material);
    this.mesh.frustumCulled = false;
    this.geometry = quad;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.lastRefresh = 0;
  }

  addStep(e, strength = 1) {
    if (e.water > 0.05) return; // underwater prints wash out immediately
    this.prints.push({ x: e.x, z: e.z, heading: e.heading, foot: e.foot, age: 0, strength, running: e.running ? 1 : 0, seed: Math.random() });
    if (this.prints.length > MAX_PRINTS) this.prints.shift();
    this.dirty = true;
  }

  /** Two prints side by side, e.g. after landing a jump. */
  addLanding(x, z, heading, impact) {
    const s = Math.min(1.6, 0.8 + impact * 0.15);
    for (const foot of [0, 1]) {
      const side = foot ? 0.13 : -0.13;
      this.addStep({ x: x + Math.cos(heading) * side, z: z + Math.sin(heading) * side, heading, foot, running: true, water: 0 }, s);
    }
  }

  update(dt, center, windSpeed, storm) {
    // Lifetime: ~15 minutes in calm air, about a minute in strong wind, seconds in a storm.
    const life = 900 / (1 + Math.max(0, windSpeed - 3) * 1.2 + storm * 30);
    let alive = 0;
    for (const p of this.prints) {
      p.age += dt / life;
      if (p.age < 1) this.prints[alive++] = p;
    }
    if (alive !== this.prints.length) {
      this.prints.length = alive;
      this.dirty = true;
    }

    const ext = this.extent;
    const texel = ext / this.size;
    if (Math.abs(center.x - (this.origin.x + ext / 2)) > ext * 0.2 || Math.abs(center.z - (this.origin.y + ext / 2)) > ext * 0.2) {
      this.origin.set(Math.round((center.x - ext / 2) / texel) * texel, Math.round((center.z - ext / 2) / texel) * texel);
      this.dirty = true;
    }
    U.uDeformRect.value.set(this.origin.x, this.origin.y, ext, 1 / ext);

    // Ageing changes the prints continuously; refresh a few times per second.
    this.lastRefresh += dt;
    if (this.prints.length && this.lastRefresh > 0.25) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;
    this.lastRefresh = 0;

    const pa = this.printAttr.array;
    const qa = this.paramAttr.array;
    let n = 0;
    for (const p of this.prints) {
      if (Math.abs(p.x - center.x) > ext * 0.6 || Math.abs(p.z - center.z) > ext * 0.6) continue;
      pa[n * 4] = p.x;
      pa[n * 4 + 1] = p.z;
      pa[n * 4 + 2] = p.heading;
      pa[n * 4 + 3] = p.foot;
      qa[n * 4] = p.strength;
      qa[n * 4 + 1] = p.running;
      qa[n * 4 + 2] = p.age;
      qa[n * 4 + 3] = p.seed;
      n++;
    }
    this.geometry.instanceCount = n;
    this.printAttr.needsUpdate = true;
    this.paramAttr.needsUpdate = true;
    this.material.uniforms.uRect.value.set(this.origin.x, this.origin.y, ext, 1 / ext);
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    if (n > 0) r.render(this.mesh, this.camera);
    r.setClearColor(0x000000, 1);
  }
}
