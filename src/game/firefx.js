// Batched particles for fire, acid, sparks and smoke (molotovs, the flamethrower,
// burning zombies, boss attacks, rocket trails): instanced camera-facing quads, one
// draw call for everything additive and one for the alpha-blended smoke. Colour runs
// along a per-kind ramp with the particle's age. CPU-simulated (position, velocity,
// drag, buoyancy); nothing collides.
import * as THREE from 'three';

const VERT = /* glsl */`
  attribute vec3 iPos;
  attribute vec4 iCol;
  attribute vec3 iSRF; // size, rotation, frame
  uniform vec2 cells;
  varying vec2 vUv;
  varying vec4 vCol;
  void main() {
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    vec2 ax = vec2(cos(iSRF.y), sin(iSRF.y));
    vec2 ay = vec2(-ax.y, ax.x);
    mv.xy += (ax * position.x + ay * position.y) * iSRF.x;
    gl_Position = projectionMatrix * mv;
    float f = iSRF.z;
    vUv = (vec2(mod(f, cells.x), floor(f / cells.x)) + vec2(uv.x, 1.0 - uv.y)) / cells;
    vCol = iCol;
  }
`;
const FRAG = /* glsl */`
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec4 vCol;
  void main() {
    vec4 t = texture2D(map, vUv);
    float a = t.a * vCol.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(t.rgb * vCol.rgb, a);
  }
`;

// colour ramps: [t, r, g, b, a]
const RAMPS = {
  fire: [[0, 1, 0.95, 0.75, 0], [0.08, 1, 0.9, 0.55, 0.95], [0.35, 1, 0.55, 0.12, 0.85], [0.7, 0.85, 0.25, 0.05, 0.5], [1, 0.3, 0.06, 0.02, 0]],
  acid: [[0, 0.8, 1, 0.5, 0], [0.1, 0.6, 1, 0.25, 0.8], [0.5, 0.35, 0.85, 0.1, 0.6], [1, 0.1, 0.35, 0.02, 0]],
  spark: [[0, 1, 1, 0.8, 1], [0.5, 1, 0.7, 0.2, 1], [1, 0.8, 0.2, 0.05, 0]],
  ember: [[0, 1, 0.8, 0.4, 0], [0.1, 1, 0.6, 0.2, 1], [1, 0.6, 0.12, 0.02, 0]],
  smoke: [[0, 0.25, 0.23, 0.21, 0], [0.15, 0.2, 0.19, 0.18, 0.5], [1, 0.32, 0.31, 0.3, 0]],
  mist: [[0, 0.06, 0.06, 0.1, 0], [0.2, 0.08, 0.08, 0.14, 0.7], [1, 0.12, 0.12, 0.18, 0]],
  dust: [[0, 0.55, 0.48, 0.38, 0], [0.12, 0.5, 0.44, 0.35, 0.55], [1, 0.6, 0.55, 0.45, 0]],
  trail: [[0, 0.75, 0.73, 0.7, 0.6], [1, 0.55, 0.54, 0.53, 0]],
  gas: [[0, 0.42, 0.5, 0.14, 0], [0.15, 0.38, 0.46, 0.12, 0.5], [0.7, 0.3, 0.36, 0.1, 0.35], [1, 0.26, 0.3, 0.1, 0]], // a bloater's cloud (zroster.js)
};
const ADDITIVE = new Set(['fire', 'acid', 'spark', 'ember']);
const FRAME = { fire: [0, 1], acid: [0, 1], spark: [3, 3], ember: [3, 3], smoke: [2, 2], mist: [2, 2], dust: [2, 2], trail: [2, 2], gas: [2, 2] };
const KIND_IDS = Object.keys(RAMPS);

function sampleRamp(r, t, out) {
  let i = 1;
  while (i < r.length - 1 && r[i][0] < t) i++;
  const a = r[i - 1], b = r[i];
  const k = Math.max(0, Math.min(1, (t - a[0]) / ((b[0] - a[0]) || 1)));
  for (let c = 0; c < 4; c++) out[c] = a[c + 1] + (b[c + 1] - a[c + 1]) * k;
  return out;
}

// 2x2 atlas: flame blob, flame tongue, smoke puff, spark
function makeTexture() {
  const N = 128, H = N / 2;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  let s = 777;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const soft = (cx, cy, r, stops) => {
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  };
  // 0: flame blob (bright core, soft edge, a few licks)
  soft(H / 2, H / 2, H / 2 - 1, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
  for (let i = 0; i < 6; i++) soft(H / 2 + (rnd() - 0.5) * 18, H / 2 + (rnd() - 0.5) * 18, 6 + rnd() * 6, [[0, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
  // 1: flame tongue (teardrop pointing up)
  g.save();
  g.translate(H, 0);
  const tg = g.createLinearGradient(0, H, 0, 0);
  tg.addColorStop(0, 'rgba(255,255,255,0.95)'); tg.addColorStop(0.6, 'rgba(255,255,255,0.6)'); tg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = tg;
  g.beginPath();
  g.moveTo(H / 2, 2);
  g.bezierCurveTo(H * 0.75, H * 0.35, H * 0.95, H * 0.62, H / 2, H - 3);
  g.bezierCurveTo(H * 0.05, H * 0.62, H * 0.25, H * 0.35, H / 2, 2);
  g.fill();
  g.restore();
  g.save();
  g.beginPath(); g.rect(H, 0, H, H); g.clip();
  soft(H + H / 2, H * 0.68, H * 0.3, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);
  g.restore();
  // 2: smoke puff (lumpy, soft)
  g.save();
  g.beginPath(); g.rect(0, H, H, H); g.clip();
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * H * 0.22;
    soft(H / 2 + Math.cos(a) * d, H + H / 2 + Math.sin(a) * d, H * (0.16 + rnd() * 0.14), [[0, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
  }
  g.restore();
  // 3: spark / ember dot
  soft(H + H / 2, H + H / 2, H * 0.22, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

class Batch {
  constructor(parent, tex, max, additive) {
    this.max = max;
    this.n = 0;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    // age, life, size0, size1, rot, spin, drag, buoy, kind, frame
    this.s = new Float32Array(max * 10);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const inst = (name, n) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    this.iPos = inst('iPos', 3);
    this.iCol = inst('iCol', 4);
    this.iSRF = inst('iSRF', 3);
    g.instanceCount = 0;
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, cells: { value: new THREE.Vector2(2, 2) } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = additive ? 3 : 2;
    parent.add(this.mesh);
    this._c = [0, 0, 0, 0];
  }

  spawn(kind, pos, vel, o) {
    let i = this.n;
    if (i >= this.max) i = Math.floor(Math.random() * this.max);
    else this.n++;
    const P = this.p, V = this.v, S = this.s;
    P[i * 3] = pos[0]; P[i * 3 + 1] = pos[1]; P[i * 3 + 2] = pos[2];
    V[i * 3] = vel[0]; V[i * 3 + 1] = vel[1]; V[i * 3 + 2] = vel[2];
    const k = i * 10;
    const size = o.size ?? 12;
    S[k] = 0;
    S[k + 1] = o.life ?? 0.6;
    S[k + 2] = size;
    S[k + 3] = o.size1 ?? size * 1.6;
    S[k + 4] = o.rot ?? Math.random() * Math.PI * 2;
    S[k + 5] = o.spin ?? (Math.random() - 0.5) * 2;
    S[k + 6] = o.drag ?? 1.5;
    S[k + 7] = o.buoy ?? 0;
    S[k + 8] = KIND_IDS.indexOf(kind);
    const fr = FRAME[kind];
    S[k + 9] = o.frame ?? fr[Math.floor(Math.random() * fr.length)];
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    this.p.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.v.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.s.copyWithin(i * 10, j * 10, j * 10 + 10);
  }

  update(dt) {
    const P = this.p, V = this.v, S = this.s;
    if (dt > 0) {
      for (let i = 0; i < this.n; i++) {
        const k = i * 10;
        S[k] += dt;
        if (S[k] >= S[k + 1]) { this.kill(i--); continue; }
        const o = i * 3;
        const f = Math.max(0, 1 - S[k + 6] * dt);
        V[o] *= f; V[o + 1] *= f; V[o + 2] = V[o + 2] * f + S[k + 7] * dt;
        P[o] += V[o] * dt; P[o + 1] += V[o + 1] * dt; P[o + 2] += V[o + 2] * dt;
        S[k + 4] += S[k + 5] * dt;
      }
    }
    const n = this.n;
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; }
    cx /= n; cy /= n; cz /= n;
    this.mesh.position.set(cx, cy, cz);
    const ip = this.iPos.array, ic = this.iCol.array, is = this.iSRF.array, c = this._c;
    for (let i = 0; i < n; i++) {
      const k = i * 10, o = i * 3;
      const t = S[k] / S[k + 1];
      ip[o] = P[o] - cx; ip[o + 1] = P[o + 1] - cy; ip[o + 2] = P[o + 2] - cz;
      sampleRamp(RAMPS[KIND_IDS[S[k + 8]]], t, c);
      ic[i * 4] = c[0]; ic[i * 4 + 1] = c[1]; ic[i * 4 + 2] = c[2]; ic[i * 4 + 3] = c[3];
      is[o] = S[k + 2] + (S[k + 3] - S[k + 2]) * t; is[o + 1] = S[k + 4]; is[o + 2] = S[k + 9];
    }
    for (const at of [this.iPos, this.iCol, this.iSRF]) {
      at.clearUpdateRanges();
      at.addUpdateRange(0, n * at.itemSize);
      at.needsUpdate = true;
    }
  }

  clear() { this.n = 0; this.geometry.instanceCount = 0; this.mesh.visible = false; }
}

export class FireFX {
  constructor(parent) {
    const tex = makeTexture();
    this.add = new Batch(parent, tex, 2600, true);
    this.alpha = new Batch(parent, tex, 1200, false);
    // ground glow under fires: additive radial quads
    const gc = document.createElement('canvas');
    gc.width = gc.height = 64;
    const g = gc.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.glowTex = new THREE.CanvasTexture(gc);
    this.glowTex.colorSpace = THREE.NoColorSpace;
    this.glowGeo = new THREE.PlaneGeometry(1, 1);
    this.parent = parent;
  }

  /** kind: fire | acid | spark | ember | smoke | mist | dust | trail. o: { life, size, size1, drag, buoy, rot, spin } */
  emit(kind, pos, vel, o = {}) {
    (ADDITIVE.has(kind) ? this.add : this.alpha).spawn(kind, pos, vel, o);
  }

  /** A glowing disc on the floor (fire / acid pools). Returns the mesh; set .material.opacity, remove when done. */
  glow(pos, radius, color) {
    const m = new THREE.Mesh(this.glowGeo, new THREE.MeshBasicMaterial({
      map: this.glowTex, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    m.position.set(pos[0], pos[1], pos[2] + 0.5);
    m.scale.set(radius * 2, radius * 2, 1);
    m.renderOrder = 1;
    this.parent.add(m);
    return m;
  }

  update(dt) {
    this.add.update(dt);
    this.alpha.update(dt);
  }

  clear() { this.add.clear(); this.alpha.clear(); }
}
