// GPU-instanced billboard particle system with a procedurally painted texture
// atlas. Two batches: additive (fire, sparks, flashes) and alpha (smoke, blood,
// dust, bile). Supports velocity-stretched streaks, gravity, drag, simple floor
// collision and blood-decal spawning on impact.
import * as THREE from 'three';

export const FR = {
  GLOW: 0, SMOKE1: 1, SMOKE2: 2, BLOOD: 3, MIST: 4, STREAK: 5, FIRE1: 6, FIRE2: 7,
  CHUNK: 8, FLASH: 9, WATER: 10, BILE: 11, SMOKE3: 12, EMBER: 13, RING: 14, SPRAY: 15,
};

function makeAtlas() {
  const S = 128, N = 4;
  const c = document.createElement('canvas');
  c.width = c.height = S * N;
  const g = c.getContext('2d');
  const cell = (i) => [(i % N) * S, Math.floor(i / N) * S];
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const soft = (i, inner = 0, alpha = 1, color = '255,255,255') => {
    const [x, y] = cell(i);
    const gr = g.createRadialGradient(x + S / 2, y + S / 2, S * inner, x + S / 2, y + S / 2, S / 2);
    gr.addColorStop(0, `rgba(${color},${alpha})`);
    gr.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = gr;
    g.fillRect(x, y, S, S);
  };
  const puff = (i, blobs, dens) => {
    const [x, y] = cell(i);
    for (let k = 0; k < blobs; k++) {
      const a = rnd() * Math.PI * 2, r = rnd() * S * 0.22;
      const cx = x + S / 2 + Math.cos(a) * r, cy = y + S / 2 + Math.sin(a) * r;
      const rr = S * (0.12 + rnd() * 0.2);
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
      gr.addColorStop(0, `rgba(255,255,255,${dens})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(x, y, S, S);
    }
  };
  soft(FR.GLOW, 0.0, 1);
  puff(FR.SMOKE1, 14, 0.18);
  puff(FR.SMOKE2, 20, 0.14);
  puff(FR.SMOKE3, 26, 0.22);
  // blood droplet: irregular splat
  {
    const [x, y] = cell(FR.BLOOD);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const r = S * (0.2 + rnd() * 0.12);
      const px = x + S / 2 + Math.cos(a) * r, py = y + S / 2 + Math.sin(a) * r;
      k === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.fill();
    for (let k = 0; k < 8; k++) {
      g.beginPath();
      g.arc(x + S / 2 + (rnd() - 0.5) * S * 0.8, y + S / 2 + (rnd() - 0.5) * S * 0.8, S * 0.03 * rnd() + 2, 0, 7);
      g.fill();
    }
  }
  puff(FR.MIST, 10, 0.3);
  // streak: horizontal gradient line (stretched in shader)
  {
    const [x, y] = cell(FR.STREAK);
    const gr = g.createLinearGradient(x, 0, x + S, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x, y + S * 0.42, S, S * 0.16);
    const gr2 = g.createLinearGradient(0, y + S * 0.35, 0, y + S * 0.65);
    gr2.addColorStop(0, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = gr2;
    g.globalCompositeOperation = 'source-over';
  }
  // flames
  const flame = (i) => {
    const [x, y] = cell(i);
    for (let k = 0; k < 18; k++) {
      const cx = x + S / 2 + (rnd() - 0.5) * S * 0.3;
      const cy = y + S * 0.62 - rnd() * S * 0.35;
      const rr = S * (0.1 + rnd() * 0.18) * (1 - (y + S - cy) / S * 0.3);
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
      gr.addColorStop(0, 'rgba(255,255,255,0.35)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(x, y, S, S);
    }
  };
  flame(FR.FIRE1);
  flame(FR.FIRE2);
  // chunk
  {
    const [x, y] = cell(FR.CHUNK);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    const n = 7;
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      const r = S * (0.25 + rnd() * 0.18);
      k === 0 ? g.moveTo(x + S / 2 + Math.cos(a) * r, y + S / 2 + Math.sin(a) * r) : g.lineTo(x + S / 2 + Math.cos(a) * r, y + S / 2 + Math.sin(a) * r);
    }
    g.fill();
  }
  // muzzle flash star
  {
    const [x, y] = cell(FR.FLASH);
    g.save();
    g.translate(x + S / 2, y + S / 2);
    for (let k = 0; k < 6; k++) {
      g.rotate(Math.PI / 3 + rnd() * 0.3);
      const gr = g.createLinearGradient(0, 0, S * 0.5, 0);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, -S * 0.05);
      g.lineTo(S * (0.3 + rnd() * 0.2), 0);
      g.lineTo(0, S * 0.05);
      g.fill();
    }
    g.restore();
    soft(FR.FLASH, 0, 0.9);
  }
  soft(FR.WATER, 0.25, 0.8);
  puff(FR.BILE, 8, 0.5);
  soft(FR.EMBER, 0.0, 1);
  // ring
  {
    const [x, y] = cell(FR.RING);
    const gr = g.createRadialGradient(x + S / 2, y + S / 2, S * 0.3, x + S / 2, y + S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.7)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, S, S);
  }
  puff(FR.SPRAY, 30, 0.25);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const VS = /* glsl */ `
  attribute vec3 iPos; attribute vec4 iCol; attribute vec4 iMisc; attribute vec3 iVel;
  varying vec2 vUv; varying vec4 vCol;
  #include <fog_pars_vertex>
  void main(){
    float size = iMisc.x; float rot = iMisc.y; float frame = iMisc.z; float stretch = iMisc.w;
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    vec2 corner = position.xy;
    if (stretch > 0.0) {
      vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
      vec2 dir = vv.xy; float l = length(dir);
      dir = l > 1e-4 ? dir / l : vec2(1.0, 0.0);
      vec2 perp = vec2(-dir.y, dir.x);
      vec2 c = dir * corner.x * (size + l * stretch) + perp * corner.y * size * 0.25;
      mv.xy += c;
    } else {
      float cs = cos(rot), sn = sin(rot);
      mv.xy += vec2(corner.x * cs - corner.y * sn, corner.x * sn + corner.y * cs) * size;
    }
    gl_Position = projectionMatrix * mv;
    vec4 mvPosition = mv;
    #include <fog_vertex>
    float fx = mod(frame, 4.0), fy = floor(frame / 4.0);
    vUv = (vec2(fx, 3.0 - fy) + (position.xy + 0.5)) / 4.0;
    vCol = iCol;
  }
`;
const FS = /* glsl */ `
  uniform sampler2D atlas; uniform float additive;
  varying vec2 vUv; varying vec4 vCol;
  #include <fog_pars_fragment>
  void main(){
    vec4 t = texture2D(atlas, vUv);
    vec4 c = vec4(vCol.rgb * t.rgb, vCol.a * t.a);
    if (c.a < 0.004) discard;
    gl_FragColor = c;
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
      #else
        float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
      #endif
      if (additive > 0.5) gl_FragColor.rgb *= (1.0 - fogFactor);
      else gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
    #endif
  }
`;

class Batch {
  constructor(scene, atlas, cap, additive) {
    this.cap = cap;
    this.n = 0;
    const N = cap;
    this.px = new Float32Array(N); this.py = new Float32Array(N); this.pz = new Float32Array(N);
    this.vx = new Float32Array(N); this.vy = new Float32Array(N); this.vz = new Float32Array(N);
    this.life = new Float32Array(N); this.max = new Float32Array(N);
    this.s0 = new Float32Array(N); this.s1 = new Float32Array(N);
    this.rot = new Float32Array(N); this.rv = new Float32Array(N);
    this.r = new Float32Array(N); this.g = new Float32Array(N); this.b = new Float32Array(N);
    this.a0 = new Float32Array(N); this.a1 = new Float32Array(N);
    this.frame = new Float32Array(N); this.grav = new Float32Array(N); this.drag = new Float32Array(N);
    this.stretch = new Float32Array(N); this.flags = new Uint8Array(N);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iCol', this.aCol);
    geo.setAttribute('iMisc', this.aMisc);
    geo.setAttribute('iVel', this.aVel);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { atlas: { value: atlas }, additive: { value: additive ? 1 : 0 } }]),
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    mat.uniforms.atlas.value = atlas;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 10;
    this.geo = geo;
    scene.add(this.mesh);
  }
  spawn(o) {
    let i;
    if (this.n < this.cap) i = this.n++;
    else i = Math.floor(Math.random() * this.cap); // overwrite random when full
    this.px[i] = o.x; this.py[i] = o.y; this.pz[i] = o.z;
    this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0; this.vz[i] = o.vz || 0;
    this.life[i] = this.max[i] = o.life || 1;
    this.s0[i] = o.size ?? 0.2; this.s1[i] = o.size1 ?? this.s0[i];
    this.rot[i] = o.rot ?? Math.random() * 6.28; this.rv[i] = o.rv || 0;
    const c = o.color || [1, 1, 1];
    this.r[i] = c[0]; this.g[i] = c[1]; this.b[i] = c[2];
    this.a0[i] = o.alpha ?? 1; this.a1[i] = o.alpha1 ?? 0;
    this.frame[i] = o.frame || 0;
    this.grav[i] = o.grav || 0; this.drag[i] = o.drag || 0;
    this.stretch[i] = o.stretch || 0;
    this.flags[i] = (o.collide ? 1 : 0) | (o.decal ? 2 : 0);
    return i;
  }
  kill(i) {
    const j = --this.n;
    if (i !== j) {
      this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
      this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
      this.life[i] = this.life[j]; this.max[i] = this.max[j];
      this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j]; this.rot[i] = this.rot[j]; this.rv[i] = this.rv[j];
      this.r[i] = this.r[j]; this.g[i] = this.g[j]; this.b[i] = this.b[j];
      this.a0[i] = this.a0[j]; this.a1[i] = this.a1[j]; this.frame[i] = this.frame[j];
      this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.stretch[i] = this.stretch[j]; this.flags[i] = this.flags[j];
    }
  }
  update(dt, sys) {
    const P = this.aPos.array, C = this.aCol.array, M = this.aMisc.array, V = this.aVel.array;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= dr; this.vz[i] *= dr;
      this.vy[i] = this.vy[i] * dr - this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.rv[i] * dt;
      if (this.flags[i] & 1 && this.vy[i] < 0 && (sys.frame + i) % 2 === 0) {
        // cheap floor/wall collision via raycast along velocity
        const col = sys.col;
        if (col) {
          const sp = Math.hypot(this.vx[i], this.vy[i], this.vz[i]);
          if (sp > 0.01) {
            const h = col.raycast(this.px[i], this.py[i], this.pz[i], this.vx[i] / sp, this.vy[i] / sp, this.vz[i] / sp, sp * dt * 2.5 + 0.02, 1);
            if (h) {
              if (this.flags[i] & 2 && sys.onBloodHit) sys.onBloodHit(h.x, h.y, h.z, h.nx, h.ny, h.nz, this.s0[i]);
              this.kill(i);
              continue;
            }
          }
        }
      }
    }
    for (let i = 0; i < this.n; i++) {
      const k = 1 - this.life[i] / this.max[i];
      P[i * 3] = this.px[i]; P[i * 3 + 1] = this.py[i]; P[i * 3 + 2] = this.pz[i];
      C[i * 4] = this.r[i]; C[i * 4 + 1] = this.g[i]; C[i * 4 + 2] = this.b[i];
      C[i * 4 + 3] = this.a0[i] + (this.a1[i] - this.a0[i]) * k;
      M[i * 4] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      M[i * 4 + 1] = this.rot[i];
      M[i * 4 + 2] = this.frame[i];
      M[i * 4 + 3] = this.stretch[i];
      V[i * 3] = this.vx[i]; V[i * 3 + 1] = this.vy[i]; V[i * 3 + 2] = this.vz[i];
    }
    this.geo.instanceCount = this.n;
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aMisc.needsUpdate = true; this.aVel.needsUpdate = true;
    this.aPos.addUpdateRange?.(0, this.n * 3);
  }
}

export class Particles {
  constructor(scene, quality = 1) {
    const atlas = makeAtlas();
    this.add = new Batch(scene, atlas, Math.round(2500 * quality), true);
    this.alpha = new Batch(scene, atlas, Math.round(3500 * quality), false);
    this.frame = 0;
    this.col = null;
    this.onBloodHit = null;
    this.q = quality;
  }
  update(dt) {
    this.frame++;
    this.add.update(dt, this);
    this.alpha.update(dt, this);
  }
  clear() { this.add.n = 0; this.alpha.n = 0; }
  // ------------------------------------------------------------ emitters --
  sparks(x, y, z, nx, ny, nz, n = 8, color = [1, 0.75, 0.4], speed = 6) {
    for (let i = 0; i < n; i++) {
      const vx = nx * speed * 0.6 + (Math.random() - 0.5) * speed, vy = ny * speed * 0.6 + (Math.random() - 0.2) * speed, vz = nz * speed * 0.6 + (Math.random() - 0.5) * speed;
      this.add.spawn({ x, y, z, vx, vy, vz, life: 0.15 + Math.random() * 0.3, size: 0.012, frame: FR.STREAK, color, alpha: 1, alpha1: 0.2, grav: 12, stretch: 0.035 });
    }
    this.add.spawn({ x: x + nx * 0.02, y: y + ny * 0.02, z: z + nz * 0.02, life: 0.06, size: 0.18, size1: 0.1, frame: FR.GLOW, color: [1, 0.8, 0.5], alpha: 0.9 });
  }
  dust(x, y, z, nx, ny, nz, color = [0.5, 0.48, 0.44], n = 4, size = 0.25) {
    for (let i = 0; i < n; i++) {
      const s = 0.5 + Math.random() * 1.2;
      this.alpha.spawn({ x, y, z, vx: nx * s + (Math.random() - 0.5) * 0.6, vy: ny * s + Math.random() * 0.4, vz: nz * s + (Math.random() - 0.5) * 0.6,
        life: 0.6 + Math.random() * 0.8, size: size * 0.4, size1: size * (1.3 + Math.random()), frame: FR.SMOKE1 + (i % 2), color, alpha: 0.45, alpha1: 0, drag: 2.5, grav: -0.1, rv: (Math.random() - 0.5) * 2 });
    }
  }
  chips(x, y, z, nx, ny, nz, color = [0.35, 0.33, 0.3], n = 5) {
    for (let i = 0; i < n; i++) {
      const s = 2 + Math.random() * 3;
      this.alpha.spawn({ x, y, z, vx: nx * s + (Math.random() - 0.5) * 3, vy: ny * s + Math.random() * 2, vz: nz * s + (Math.random() - 0.5) * 3,
        life: 0.5 + Math.random() * 0.5, size: 0.02 + Math.random() * 0.02, frame: FR.CHUNK, color, alpha: 1, alpha1: 1, grav: 14, rv: 10 });
    }
  }
  blood(x, y, z, dx, dy, dz, amount = 1, decal = true) {
    const n = Math.round(6 * amount * this.q) + 2;
    for (let i = 0; i < n; i++) {
      const s = 1.5 + Math.random() * 4 * amount;
      this.alpha.spawn({ x, y, z, vx: dx * s + (Math.random() - 0.5) * 2.5, vy: dy * s + Math.random() * 2.2, vz: dz * s + (Math.random() - 0.5) * 2.5,
        life: 0.6 + Math.random() * 0.6, size: 0.025 + Math.random() * 0.03, frame: FR.BLOOD, color: [0.32, 0.015, 0.01], alpha: 1, alpha1: 0.9,
        grav: 13, collide: true, decal: decal && i < 3, stretch: 0.02 });
    }
    // mist puff
    for (let i = 0; i < 2 + amount; i++) {
      this.alpha.spawn({ x, y, z, vx: dx * 1.5 + (Math.random() - 0.5), vy: dy + Math.random() * 0.5, vz: dz * 1.5 + (Math.random() - 0.5),
        life: 0.35 + Math.random() * 0.35, size: 0.08, size1: 0.4 + amount * 0.25, frame: FR.MIST, color: [0.4, 0.02, 0.015], alpha: 0.6, alpha1: 0, drag: 5 });
    }
  }
  bloodSpurt(x, y, z, dx, dy, dz) {
    this.alpha.spawn({ x, y, z, vx: dx * 3 + (Math.random() - 0.5), vy: dy * 3 + 1 + Math.random(), vz: dz * 3 + (Math.random() - 0.5),
      life: 0.7, size: 0.03, frame: FR.BLOOD, color: [0.3, 0.01, 0.01], alpha: 1, alpha1: 1, grav: 12, collide: true, decal: Math.random() < 0.3, stretch: 0.03 });
  }
  muzzle(x, y, z, dx, dy, dz, scale = 1, color = [1, 0.75, 0.4]) {
    this.add.spawn({ x, y, z, life: 0.05, size: 0.35 * scale, size1: 0.25 * scale, frame: FR.FLASH, color, alpha: 1, alpha1: 0.6 });
    this.alpha.spawn({ x: x + dx * 0.1, y: y + dy * 0.1, z: z + dz * 0.1, vx: dx * 1.5, vy: dy * 1.5 + 0.3, vz: dz * 1.5, life: 0.5, size: 0.08 * scale, size1: 0.5 * scale, frame: FR.SMOKE1, color: [0.6, 0.6, 0.58], alpha: 0.18, alpha1: 0, drag: 3, grav: -0.4 });
  }
  tracer(x, y, z, dx, dy, dz, speed = 260, len = 0.03) {
    this.add.spawn({ x, y, z, vx: dx * speed, vy: dy * speed, vz: dz * speed, life: 0.12, size: 0.018, frame: FR.STREAK, color: [1, 0.85, 0.55], alpha: 0.9, alpha1: 0.4, stretch: len });
  }
  explosion(x, y, z, scale = 1) {
    const q = this.q;
    for (let i = 0; i < 18 * q * scale; i++) {
      const a = Math.random() * 6.28, e = Math.random() * 1.2, s = (3 + Math.random() * 7) * scale;
      this.add.spawn({ x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 2, vz: Math.sin(a) * Math.cos(e) * s,
        life: 0.35 + Math.random() * 0.4, size: 0.5 * scale, size1: 1.6 * scale, frame: FR.FIRE1 + (i % 2), color: [1, 0.55, 0.2], alpha: 1, alpha1: 0, drag: 4, rv: 3 });
    }
    this.add.spawn({ x, y, z, life: 0.15, size: 2 * scale, size1: 6 * scale, frame: FR.GLOW, color: [1, 0.8, 0.5], alpha: 1, alpha1: 0 });
    for (let i = 0; i < 24 * q * scale; i++) {
      const a = Math.random() * 6.28, s = (1 + Math.random() * 4) * scale;
      this.alpha.spawn({ x, y: y + 0.3, z, vx: Math.cos(a) * s, vy: 1 + Math.random() * 3, vz: Math.sin(a) * s,
        life: 2 + Math.random() * 2.5, size: 0.6 * scale, size1: 3.5 * scale, frame: FR.SMOKE1 + (i % 3 === 2 ? 11 : i % 2), color: [0.14, 0.13, 0.12], alpha: 0.7, alpha1: 0, drag: 1.5, grav: -0.6, rv: (Math.random() - 0.5) });
    }
    for (let i = 0; i < 30 * q * scale; i++) {
      const a = Math.random() * 6.28, s = 5 + Math.random() * 12;
      this.add.spawn({ x, y, z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 8, vz: Math.sin(a) * s, life: 0.8 + Math.random() * 1.2, size: 0.03, frame: FR.EMBER, color: [1, 0.6, 0.25], alpha: 1, alpha1: 0, grav: 9, collide: true, stretch: 0.02 });
    }
    this.chips(x, y + 0.2, z, 0, 1, 0, [0.15, 0.14, 0.12], 16);
  }
  fire(x, y, z, intensity = 1) {
    if (Math.random() < 0.9) this.add.spawn({ x: x + (Math.random() - 0.5) * 0.4 * intensity, y, z: z + (Math.random() - 0.5) * 0.4 * intensity, vx: (Math.random() - 0.5) * 0.3, vy: 1.2 + Math.random() * 1.4, vz: (Math.random() - 0.5) * 0.3,
      life: 0.5 + Math.random() * 0.5, size: 0.35 * intensity, size1: 0.12, frame: FR.FIRE1 + (Math.random() < 0.5 ? 0 : 1), color: [1, 0.5 + Math.random() * 0.2, 0.15], alpha: 0.9, alpha1: 0, rv: (Math.random() - 0.5) * 2 });
    if (Math.random() < 0.3) this.alpha.spawn({ x, y: y + 0.8 * intensity, z, vx: (Math.random() - 0.5) * 0.4, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 0.4,
      life: 2 + Math.random() * 2, size: 0.3 * intensity, size1: 1.8 * intensity, frame: FR.SMOKE1 + (Math.random() < 0.5 ? 0 : 1), color: [0.1, 0.09, 0.085], alpha: 0.45, alpha1: 0, drag: 0.4, grav: -0.3, rv: (Math.random() - 0.5) });
    if (Math.random() < 0.15) this.add.spawn({ x, y: y + 0.3, z, vx: (Math.random() - 0.5) * 1.5, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 1.5, life: 1 + Math.random(), size: 0.02, frame: FR.EMBER, color: [1, 0.6, 0.2], alpha: 1, alpha1: 0, grav: -0.5 });
  }
  smokeColumn(x, y, z, size = 1, color = [0.12, 0.12, 0.12]) {
    this.alpha.spawn({ x: x + (Math.random() - 0.5) * size, y, z: z + (Math.random() - 0.5) * size, vx: (Math.random() - 0.5) * 0.3 + 0.2, vy: 1 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.3,
      life: 5 + Math.random() * 3, size: 1 * size, size1: 5 * size, frame: FR.SMOKE1 + Math.floor(Math.random() * 2), color, alpha: 0.35, alpha1: 0, drag: 0.1, grav: -0.2, rv: (Math.random() - 0.5) * 0.3 });
  }
  cloud(x, y, z, r, color, n = 20, life = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, d = Math.random() * r;
      this.alpha.spawn({ x: x + Math.cos(a) * d, y: y + Math.random() * 1.2, z: z + Math.sin(a) * d, vx: (Math.random() - 0.5) * 0.3, vy: 0.1 + Math.random() * 0.2, vz: (Math.random() - 0.5) * 0.3,
        life: life * (0.6 + Math.random() * 0.6), size: r * 0.4, size1: r * 1.3, frame: FR.SMOKE1 + (i % 2), color, alpha: 0.5, alpha1: 0, drag: 0.5, rv: (Math.random() - 0.5) * 0.4 });
    }
  }
  splash(x, y, z, n = 8) {
    for (let i = 0; i < n; i++) {
      this.alpha.spawn({ x, y, z, vx: (Math.random() - 0.5) * 2.5, vy: 2 + Math.random() * 2.5, vz: (Math.random() - 0.5) * 2.5, life: 0.5 + Math.random() * 0.3, size: 0.04, frame: FR.WATER, color: [0.5, 0.55, 0.5], alpha: 0.6, alpha1: 0, grav: 12 });
    }
  }
  bileSpray(x, y, z, dx, dy, dz) {
    for (let i = 0; i < 8; i++) {
      const s = 5 + Math.random() * 4;
      this.alpha.spawn({ x, y, z, vx: dx * s + (Math.random() - 0.5) * 1.5, vy: dy * s + Math.random() * 1.5, vz: dz * s + (Math.random() - 0.5) * 1.5,
        life: 0.9, size: 0.08, size1: 0.35, frame: FR.BILE, color: [0.4, 0.5, 0.08], alpha: 0.9, alpha1: 0.2, grav: 8, drag: 0.8 });
    }
  }
  shockwave(x, y, z, r = 4) {
    this.add.spawn({ x, y, z, life: 0.25, size: 0.5, size1: r * 2, frame: FR.RING, color: [1, 0.9, 0.8], alpha: 0.5, alpha1: 0 });
  }
}
