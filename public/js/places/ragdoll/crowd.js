// Spectators and flags. The crowd is two instanced meshes (bodies tinted by
// their shirt, and heads), animated in the vertex shader: they bob, sway,
// jump up and throw their arms in the air when the crowd gets excited
// (uCheer). Flags wave by moving their vertices on the CPU (there are only a
// few dozen).
import * as THREE from 'three';
import { rng } from './kit.js';

const SHIRTS = [0xd8332a, 0x1f6fd1, 0xf7c51e, 0x2a9a46, 0xffffff, 0xf07c1a, 0x7a3fc4, 0x1aa6a6, 0xf06aa6, 0x222222, 0x8a5a32, 0x9ad0ff];
const SKIN = [0xf5cd30, 0xf5cd30, 0xf5cd30, 0xd9a066, 0xa86b3c, 0xffd9b3, 0x6b4226];

/** A blocky spectator: legs (seated, bent forward), torso, arms (tagged so the shader can raise them). */
function bodyGeometry() {
  const parts = [];
  const add = (sx, sy, sz, x, y, z, shade, arm = 0) => {
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
    g.translate(x, y, z);
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(shade), 3));
    g.setAttribute('aArm', new THREE.Float32BufferAttribute(new Array(n).fill(arm), 1));
    parts.push(g);
  };
  add(2, 2, 1, 0, 2.6, 0, 1); // torso
  add(1, 2, 1, 1.5, 2.6, 0, 1, 1); // right arm (pivot at the shoulder)
  add(1, 2, 1, -1.5, 2.6, 0, 1, -1); // left arm
  add(2, 1, 2, 0, 1.1, -0.5, 0.42); // thighs (seated)
  add(2, 1.6, 1, 0, 0.3, -1.5, 0.42); // shins
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color', 'aArm']) {
    const arrs = parts.map((g) => g.attributes[k]);
    const size = arrs[0].itemSize, total = arrs.reduce((a, b) => a + b.count, 0);
    const buf = new Float32Array(total * size); let o = 0;
    for (const a of arrs) { buf.set(a.array, o); o += a.array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(buf, size));
  }
  return out;
}

function crowdMaterial(uniforms, isHead) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: !isHead });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uCheer = uniforms.uCheer;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uCheer;
        attribute float aPhase; ${isHead ? '' : 'attribute float aArm;'}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ex = clamp(uCheer * (0.55 + 0.45 * fract(aPhase * 7.13)), 0.0, 1.0);
        float bob = sin(uTime * (2.2 + fract(aPhase * 3.7) * 2.0) + aPhase * 6.28) * 0.12;
        float jump = max(0.0, sin(uTime * 9.0 + aPhase * 12.0)) * 1.2 * ex;
        ${isHead ? '' : `
        if (abs(aArm) > 0.5) {
          // raise the arm about the shoulder (local x = +-1.5, y = 3.5)
          float a = (0.15 + ex * (2.6 + 0.35 * sin(uTime * 11.0 + aPhase * 9.0))) * sign(aArm);
          vec2 p = transformed.xy - vec2(1.0 * sign(aArm), 3.5);
          float c = cos(a), s = sin(a);
          transformed.xy = vec2(p.x * c - p.y * s, p.x * s + p.y * c) + vec2(1.0 * sign(aArm), 3.5);
        }`}
        transformed.y += bob * (1.0 - ex) + jump;
        transformed.x += sin(uTime * 1.3 + aPhase * 5.0) * 0.08;`);
  };
  return m;
}

export class Crowd {
  constructor(world, max = 6000) {
    this.world = world;
    this.u = { uTime: { value: 0 }, uCheer: { value: 0 } };
    this.cheer = 0; this.target = 0.1;
    this.list = [];
    this.max = max;
  }
  /** Seat someone at x,y,z (feet on the row) facing yaw. */
  seat(x, y, z, yaw, r = Math.random) { if (this.list.length < this.max) this.list.push([x, y, z, yaw, r()]); }
  /** Make the meshes (after all seats are known). */
  build() {
    const n = this.list.length;
    if (!n) return;
    const bodyG = bodyGeometry();
    const headG = new THREE.BoxGeometry(1.15, 1.15, 1.15).toNonIndexed(); headG.translate(0, 4.2, 0);
    const phase = new Float32Array(n);
    this.list.forEach((s, i) => { phase[i] = s[4]; });
    bodyG.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    headG.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    const body = new THREE.InstancedMesh(bodyG, crowdMaterial(this.u, false), n);
    const head = new THREE.InstancedMesh(headG, crowdMaterial(this.u, true), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(0.62, 0.62, 0.62), p = new THREE.Vector3(), c = new THREE.Color();
    const r = rng(77);
    this.list.forEach(([x, y, z, yaw], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + (r() - 0.5) * 0.3);
      p.set(x, y, z);
      m.compose(p, q, s);
      body.setMatrixAt(i, m); head.setMatrixAt(i, m);
      body.setColorAt(i, c.setHex(SHIRTS[Math.floor(r() * SHIRTS.length)]));
      head.setColorAt(i, c.setHex(SKIN[Math.floor(r() * SKIN.length)]));
    });
    for (const im of [body, head]) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true; this.world.scene.add(im); }
    this.meshes = [body, head];
  }
  /** A burst of excitement (0..1), fading back to a murmur. */
  excite(k) { this.cheer = Math.max(this.cheer, k); }
  update(dt, t) {
    this.cheer += (this.target - this.cheer) * Math.min(1, dt * 0.9);
    this.u.uTime.value = t; this.u.uCheer.value = this.cheer;
  }
}

// --- flags --------------------------------------------------------------------------------------------------------------------------------------
const FLAG_COLORS = [['#0081c8', '#fff'], ['#fcb131', '#fff'], ['#000000', '#fff'], ['#00a651', '#fff'], ['#ee334e', '#fff'], ['#ffffff', '#0081c8'], ['#d8332a', '#f7c51e'], ['#1f6fd1', '#ffffff'], ['#2a9a46', '#ffffff'], ['#f7c51e', '#d8332a']];
function flagTexture(i) {
  const [a, b] = FLAG_COLORS[i % FLAG_COLORS.length];
  const c = document.createElement('canvas'); c.width = 128; c.height = 80;
  const x = c.getContext('2d');
  x.fillStyle = a; x.fillRect(0, 0, 128, 80);
  x.fillStyle = b;
  const style = i % 4;
  if (style === 0) x.fillRect(0, 30, 128, 20);
  else if (style === 1) { x.fillRect(48, 0, 22, 80); x.fillRect(0, 29, 128, 22); }
  else if (style === 2) { x.beginPath(); x.arc(64, 40, 20, 0, Math.PI * 2); x.fill(); }
  else { x.fillRect(0, 0, 43, 80); x.fillStyle = FLAG_COLORS[(i + 3) % FLAG_COLORS.length][0]; x.fillRect(85, 0, 43, 80); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export class Flags {
  constructor(world) { this.world = world; this.list = []; this.poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 1, 8); this.poleMat = new THREE.MeshStandardMaterial({ color: 0xdadfe4, metalness: 0.7, roughness: 0.35 }); }
  /** A flag on a pole (h tall) at x,z (ground y), flying towards dir (radians). */
  add(x, y, z, h, dir, i = this.list.length, w = 6, fh = 3.75) {
    const pole = new THREE.Mesh(this.poleGeo, this.poleMat); pole.scale.y = h; pole.position.set(x, y + h / 2, z); pole.castShadow = true;
    const g = new THREE.PlaneGeometry(w, fh, 12, 3); g.translate(w / 2, 0, 0);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: flagTexture(i), side: THREE.DoubleSide, roughness: 0.8 }));
    m.position.set(x, y + h - fh / 2 - 0.2, z); m.rotation.y = dir; m.castShadow = true;
    this.world.scene.add(pole); this.world.scene.add(m);
    this.list.push({ m, base: Float32Array.from(g.attributes.position.array), ph: Math.random() * 6 });
  }
  update(t) {
    for (const f of this.list) {
      const pos = f.m.geometry.attributes.position, b = f.base;
      for (let i = 0; i < pos.count; i++) {
        const x = b[i * 3], k = x / 6;
        pos.array[i * 3 + 2] = Math.sin(t * 5 + x * 0.9 + f.ph) * 0.45 * k;
        pos.array[i * 3 + 1] = b[i * 3 + 1] - k * k * 0.3;
      }
      pos.needsUpdate = true;
      f.m.geometry.computeVertexNormals();
    }
  }
}
