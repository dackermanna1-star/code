// Impacts and gore on top of the engine's droplets, mist and floor decals:
//  - GoreParticles: GPU particles whose motion is analytic (drag + gravity, resting on the floor),
//    so the CPU only writes a particle once when it is born. Dust plumes and haze, debris chips,
//    splinters and blood mist (normal blending); sparks and impact flashes (additive, HDR).
//  - GoreFX: per-material bullet impacts (dust, chips, sparks, ricochets, holes, exit holes where a
//    round passes through), blood (energy-scaled spray and mist, spatter that lands on walls and
//    props after its flight time, runs of blood down walls), the engine's droplets stopped at walls
//    instead of flying through them, and blood on the bodycam lens.
// Everything is pooled: ring buffers for particles and decals, fixed queues for delayed decals and
// exit holes.

const GORE_PARTICLE_VS = /* glsl */ `
attribute vec4 aP; // start position, birth time
attribute vec4 aV; // start velocity, life
attribute vec4 aS; // size, growth, drag, gravity scale
attribute vec4 aC; // colour, alpha
attribute vec4 aK; // kind, floor height, streak time, seed
uniform float uTime;
varying vec4 vC; varying vec2 vUv; varying float vT; varying float vKind; varying float vSeed; varying float vFog;
void main() {
    float age = uTime - aP.w;
    vUv = position.xy + 0.5;
    if (age < 0.0 || age > aV.w) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float k = max(aS.z, 0.02), e = exp(-k * age);
    vec3 g = vec3(0.0, -9.81 * aS.w, 0.0);
    vec3 p = aP.xyz + aV.xyz * (1.0 - e) / k + g * (age / k - (1.0 - e) / (k * k));
    vec3 vel = aV.xyz * e + g * (1.0 - e) / k;
    if (p.y < aK.y) { p.y = aK.y; vel *= 0.0; }
    float t = age / aV.w;
    vec4 mvPosition = viewMatrix * vec4(p, 1.0);
    float size = aS.x * (1.0 + aS.y * sqrt(t));
    vec2 q = position.xy;
    if (aK.z > 0.0) {
      // streak along the screen-space velocity, head at the particle
      vec2 sv = (mat3(viewMatrix) * vel).xy;
      float sl = length(sv);
      vec2 ax = sl > 1e-4 ? sv / sl : vec2(1.0, 0.0);
      float len = size + sl * aK.z;
      q = ax * (q.x * len - (len - size) * 0.5) + vec2(-ax.y, ax.x) * q.y * size;
    } else {
      // tumbling (chips) or slowly turning (dust); the spin dies with the drag
      float r = aK.w * 6.2832 + (aK.w - 0.5) * 14.0 * (1.0 - e) / k;
      float c = cos(r), s = sin(r);
      q = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * size;
    }
    mvPosition.xy += q;
    gl_Position = projectionMatrix * mvPosition;
    vC = aC; vT = t; vKind = aK.x; vSeed = aK.w;
    vFog = -mvPosition.z;
}`;

const GORE_PARTICLE_FS = /* glsl */ `
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uAdditive;
varying vec4 vC; varying vec2 vUv; varying float vT; varying float vKind; varying float vSeed; varying float vFog;
float gpH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gpN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(gpH(i), gpH(i + vec2(1, 0)), f.x), mix(gpH(i + vec2(0, 1)), gpH(i + vec2(1, 1)), f.x), f.y); }
void main() {
    vec2 c = vUv - 0.5;
    float d = length(c) * 2.0;
    vec3 col = vC.rgb;
    float a = 0.0;
    int kind = int(vKind + 0.5);
    if (kind == 0) {
      // dust or mist: a soft, lumpy puff that thins out as it grows
      float n = gpN(c * 5.0 + vSeed * 37.0) + 0.5 * gpN(c * 11.0 - vSeed * 19.0);
      a = smoothstep(1.0, 0.15, d + 0.35 * (n - 0.75));
      a *= smoothstep(0.0, 0.06, vT) * (1.0 - vT) * (1.0 - vT);
      col *= 0.85 + 0.3 * n;
    } else if (kind == 1) {
      // debris chip: a hard little polygon with a lit and a shaded face
      float ang = atan(c.y, c.x);
      float r = 0.3 + 0.12 * sin(ang * 3.0 + vSeed * 40.0) + 0.06 * sin(ang * 5.0 + vSeed * 13.0);
      a = 1.0 - smoothstep(r - 0.06, r, length(c));
      col *= 0.7 + 0.6 * step(0.0, c.x + c.y * (vSeed - 0.5));
      a *= 1.0 - smoothstep(0.85, 1.0, vT);
    } else if (kind == 2) {
      // spark streak: white-hot core cooling to orange
      a = (1.0 - smoothstep(0.15, 1.0, abs(c.y) * 2.0)) * (1.0 - smoothstep(0.35, 0.5, abs(c.x)));
      col *= mix(vec3(1.0, 0.95, 0.85), vec3(1.0, 0.45, 0.12), smoothstep(0.0, 0.6, vT));
      a *= 1.0 - vT;
    } else if (kind == 3) {
      // muzzle-style impact flash: hot core and a few rays
      float ang = atan(c.y, c.x);
      float rays = pow(abs(cos(ang * 2.5 + vSeed * 6.0)), 12.0) * (1.0 - smoothstep(0.1, 1.0, d));
      a = (exp(-d * d * 10.0) + rays * 0.7) * (1.0 - vT);
    } else {
      // splinter: a thin sliver along its streak
      a = (1.0 - smoothstep(0.25, 0.45, abs(c.y) * 2.0)) * (1.0 - smoothstep(0.38, 0.5, abs(c.x)));
      col *= 0.8 + 0.4 * step(0.0, c.y);
      a *= 1.0 - smoothstep(0.85, 1.0, vT);
    }
    a *= vC.a;
    if (a < 0.004) discard;
    float f = 1.0 - exp(-uFogDensity * uFogDensity * vFog * vFog);
    if (uAdditive > 0.5) { a *= 1.0 - f; gl_FragColor = vec4(col, a); }
    else gl_FragColor = vec4(mix(col, uFogColor, f), a);
}`;

class GoreParticles {
  constructor(scene, max, additive) {
    this.max = max;
    this.head = 0;
    this.written = 0; // particles written since the last upload
    this.start = 0;
    const geo = new T3.InstancedBufferGeometry();
    geo.setAttribute('position', new T3.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.attrs = [];
    for (const name of ['aP', 'aV', 'aS', 'aC', 'aK']) {
      const arr = new Float32Array(max * 4);
      if (name === 'aP') for (let i = 0; i < max; i++) arr[i * 4 + 3] = -1e6; // all dead
      const at = new T3.InstancedBufferAttribute(arr, 4);
      at.setUsage(T3.DynamicDrawUsage);
      geo.setAttribute(name, at);
      this[name] = arr;
      this.attrs.push(at);
    }
    geo.instanceCount = max;
    this.uniforms = { uTime: { value: 0 }, uFogColor: { value: new T3.Color() }, uFogDensity: { value: 0 }, uAdditive: { value: additive ? 1 : 0 } };
    const mat = new T3.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: GORE_PARTICLE_VS, fragmentShader: GORE_PARTICLE_FS,
      transparent: true, depthWrite: false, blending: additive ? T3.AdditiveBlending : T3.NormalBlending,
    });
    this.mesh = new T3.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 4;
    scene.add(this.mesh);
  }

  // kind: 0 dust/mist, 1 chip, 2 spark, 3 flash, 4 splinter; streak: seconds of velocity drawn as a trail
  emit(t, x, y, z, vx, vy, vz, life, size, grow, drag, grav, col, alpha, kind, floorY, streak = 0) {
    const i = this.head, o = i * 4;
    this.head = (i + 1) % this.max;
    if (this.written === 0) this.start = i;
    this.written++;
    const P = this.aP, V = this.aV, S = this.aS, C = this.aC, K = this.aK;
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = t;
    V[o] = vx; V[o + 1] = vy; V[o + 2] = vz; V[o + 3] = life;
    S[o] = size; S[o + 1] = grow; S[o + 2] = drag; S[o + 3] = grav;
    C[o] = col.r; C[o + 1] = col.g; C[o + 2] = col.b; C[o + 3] = alpha;
    K[o] = kind; K[o + 1] = floorY; K[o + 2] = streak; K[o + 3] = Math.random();
  }

  // upload what was written since the last frame (one or two ranges of the ring)
  flush(time, fog) {
    this.uniforms.uTime.value = time;
    if (fog) { this.uniforms.uFogColor.value.copy(fog.color); this.uniforms.uFogDensity.value = fog.density || 0; }
    const n = Math.min(this.written, this.max);
    if (!n) return;
    const s = this.written >= this.max ? 0 : this.start, first = Math.min(n, this.max - s);
    for (const at of this.attrs) {
      at.clearUpdateRanges();
      if (n >= this.max) at.addUpdateRange(0, this.max * 4);
      else {
        at.addUpdateRange(s * 4, first * 4);
        if (n > first) at.addUpdateRange(0, (n - first) * 4);
      }
      at.needsUpdate = true;
    }
    this.written = 0;
  }
}

const _gc = new T3.Color(), _gc2 = new T3.Color();
const _gv = new I(), _gu = new I(), _gw = new I(), _gr = new I(), _gp = new I(), _gEye = new I();
const _gV3 = new T3.Vector3(), _gN3 = new T3.Vector3(), _gD3 = new T3.Vector3();
const _gOpt = { dir: null, stretch: 1 }; // reused decal options
const gOpt = (dir, stretch) => { _gOpt.dir = dir; _gOpt.stretch = stretch; return _gOpt; };

class GoreFX {
  constructor(game) {
    this.game = game;
    this.clock = 0;
    this.dust = null;
    this.glow = null;
    // delayed decals (blood in flight), a fixed ring
    this.later = Array.from({ length: 64 }, () => ({ t: -1, kind: '', p: new T3.Vector3(), n: new T3.Vector3(), d: new T3.Vector3(), dir: false, size: 0, stretch: 1 }));
    this.laterHead = 0;
    // rounds that may come out of the far side of what they hit, waiting for the rest of their shot
    this.exits = Array.from({ length: 12 }, () => ({ on: false, dx: 0, dy: 0, dz: 0, p: new T3.Vector3(), n: new T3.Vector3(), mat: '', ef: 1 }));
    this.dropBudget = 0;
    this.boxOf = new Map();
    this.near = [];
    this.levelOnly = (b) => !!(b.userData && b.userData.level);
    this.lastRico = 0;
    this.flashAt = new T3.Vector3();
    this.flashT = 0;
    game.hooks.push(this);
  }

  onLevel(level) {
    const g = this.game, view = g.view;
    // the previous scene (and these meshes with it) was disposed by LevelView
    this.dust = new GoreParticles(view.scene, 3072, false);
    this.glow = new GoreParticles(view.scene, 1024, true);
    view.wallDecals.useLattice(view.shared);
    view.wallDecals.clock = () => this.game.time;
    this.boxOf.clear();
    if (level.bodies) level.bodies.forEach((b, i) => this.boxOf.set(b, level.boxes[i]));
    for (const l of this.later) l.t = -1;
    for (const x of this.exits) x.on = false;
    // the engine's blood droplets only know the floor: stop them at walls, props and the ceiling.
    // Particles.update() asks floorAt() once per droplet in index order (asking again for the same
    // index after it removes one), so following along gives each query its droplet's velocity.
    const P = g.particles, upd = P.update.bind(P);
    P.update = (dt) => { this.pIdx = 0; this.pDt = dt; upd(dt); };
    P.floorAt = (x, z, y) => this.dropletFloor(x, z, y - 0.5);
  }

  // ---- per step / frame ------------------------------------------------------------------------
  step() {
    // exit holes not confirmed by the rest of their shot: the round stopped inside
    for (const x of this.exits) x.on = false;
  }

  frame(dt, simDt) {
    if (!this.dust) return;
    const g = this.game;
    this.clock += simDt;
    this.dropBudget = 14;
    for (const l of this.later) {
      if (l.t < 0) continue;
      l.t -= simDt;
      if (l.t <= 0) {
        l.t = -1;
        if (g.settings.gore || !DECAL_BLOOD[l.kind]) g.view.wallDecals.add(l.kind, l.p, l.n, l.size, l.dir ? gOpt(l.d, l.stretch) : null);
      }
    }
    if (this.flashT > 0) {
      this.flashT -= Math.max(simDt, dt * 0.25);
      const fx = g.effects;
      if (fx && fx.light && fx.lightT <= 0 && this.flashT > 0) { fx.light.position.copy(this.flashAt); fx.light.intensity = 6; fx.lightT = 0.05; this.flashT = 0; }
    }
    const fog = g.view.scene.fog;
    this.dust.flush(this.clock, fog);
    this.glow.flush(this.clock, fog);
  }

  queueDecal(delay, kind, p, n, size, dir = null, stretch = 1) {
    const l = this.later[this.laterHead];
    this.laterHead = (this.laterHead + 1) % this.later.length;
    if (l.t >= 0) this.game.view.wallDecals.add(l.kind, l.p, l.n, l.size, l.dir ? gOpt(l.d, l.stretch) : null); // ring full: place the oldest now
    l.t = delay; l.kind = kind; l.size = size; l.stretch = stretch;
    l.p.set(p.x, p.y, p.z); l.n.set(n.x, n.y, n.z);
    l.dir = !!dir;
    if (dir) l.d.set(dir.x, dir.y, dir.z);
  }

  // how brightly the level lights a point (for particles that do not run the lighting shader)
  lit(p, base = 0.25, gain = 0.45) {
    const g = this.game;
    return clamp(base + gain * g.view.lightAt(p.x, p.y, p.z), 0.08, 1.0);
  }

  floorBelow(x, z, y) {
    const s = this.game.sb.world.surfaceAt(x, z, y);
    return (Number.isFinite(s) ? s : 0) + 0.002;
  }

  // ---- surfaces ----------------------------------------------------------------------------------
  // a round hit a wall, prop or the ceiling (prof: IMPACT_FX entry)
  surface(e, prof, mat) {
    const g = this.game, p = e.point, n = e.normal, d = e.dir;
    const cosI = -(d.x * n.x + d.y * n.y + d.z * n.z);
    const ef = clamp(Math.sqrt(Math.max(e.energy || 0, 60) / 1400), 0.32, 1.35);
    // reflected direction: glancing rounds and the dust they throw leave along it
    _gr.set(d.x + 2 * cosI * n.x, d.y + 2 * cosI * n.y, d.z + 2 * cosI * n.z);
    const glancing = prof.rico > 0 && cosI < prof.rico;
    this.burst(p, n, _gr, prof, ef, glancing ? 0.4 : 1, cosI);
    const onLevel = this.boxOf.has(e.body);
    if (glancing) {
      // ricochet: a streak of sparks off along the reflection, a gouge and a whine
      this.sparks(p, n, _gr, prof.sparks ? 10 + 8 * ef : 5 + 4 * ef, 1.2);
      if (onLevel) {
        _gD3.set(d.x, d.y, d.z);
        g.view.wallDecals.add('graze', p, n, prof.size * (1.1 + 0.4 * ef), gOpt(_gD3, clamp(1 / Math.max(cosI, 0.2), 1.4, 3) * 0.75));
      }
      if (g.sfx && g.sfx.ricochet && g.time - this.lastRico > 0.06) { this.lastRico = g.time; g.sfx.ricochet(p, ef); }
    } else if (onLevel && (mat !== 'ceiling' || Math.random() < 0.6)) {
      const sz = prof.size * (0.85 + 0.3 * Math.random()) * (0.8 + 0.25 * ef);
      // an oblique hit leaves an oval hole, stretched along the shot
      _gD3.set(d.x, d.y, d.z);
      const st = clamp(1 / Math.max(cosI, 0.35), 1, 1.8);
      g.view.wallDecals.add('hole:' + prof.hole, p, n, sz, st > 1.15 ? gOpt(_gD3, st) : null);
    }
    if (g.sfx && g.sfx.debris && prof.debris) g.sfx.debris(p, prof.debris, ef);
    // might it come out the other side? (thin level boxes only; confirmed by the rest of the shot)
    const box = onLevel && !glancing && prof.pass ? this.boxOf.get(e.body) : null;
    if (box) {
      let tOut = Infinity, ax = -1;
      const ds = [d.x, d.y, d.z], ps = [p.x, p.y, p.z], mn = [box.min.x, box.min.y, box.min.z], mx = [box.max.x, box.max.y, box.max.z];
      for (let a = 0; a < 3; a++) {
        if (Math.abs(ds[a]) < 1e-6) continue;
        const tt = ((ds[a] > 0 ? mx[a] : mn[a]) - ps[a]) / ds[a];
        if (tt < tOut) { tOut = tt; ax = a; }
      }
      if (ax >= 0 && tOut > 0.004 && tOut < 0.7) {
        const x = this.exits.find((q) => !q.on) || this.exits[0];
        x.on = true; x.dx = d.x; x.dy = d.y; x.dz = d.z; x.mat = mat; x.ef = ef; x.prof = prof;
        x.p.set(p.x + d.x * tOut, p.y + d.y * tOut, p.z + d.z * tOut);
        x.n.set(0, 0, 0).setComponent(ax, Math.sign(ds[ax]));
      }
    }
  }

  // a later event of the same shot (same direction) beyond a candidate exit confirms it
  confirmExit(dir, q) {
    for (const x of this.exits) {
      if (!x.on || x.dx !== dir.x || x.dy !== dir.y || x.dz !== dir.z) continue;
      if ((q.x - x.p.x) * dir.x + (q.y - x.p.y) * dir.y + (q.z - x.p.z) * dir.z < 0.002) continue;
      x.on = false;
      const prof = x.prof, g = this.game;
      g.view.wallDecals.add('exit:' + prof.hole, x.p, x.n, prof.size * (1.25 + 0.35 * Math.random()) * (0.8 + 0.3 * x.ef));
      // the far side spalls outwards, along the shot
      _gr.set(dir.x, dir.y, dir.z);
      this.burst(x.p, x.n, _gr, prof, x.ef * 0.8, 1, 1);
    }
  }

  // dust plume, lingering haze, debris chips or splinters, sparks
  burst(p, n, r, prof, ef, amount, cosI) {
    const g = this.game, D = this.dust, t = this.clock;
    const L = this.lit(p);
    const floorY = this.floorBelow(p.x, p.z, p.y + 0.05);
    _gc.setHex(prof.dust).multiplyScalar(L);
    // fast plume: out of the hole and back up the shot line
    const np = Math.round(prof.puffs * (0.6 + 0.6 * ef) * amount);
    for (let k = 0; k < np; k++) {
      const s = (0.8 + 2.6 * Math.random()) * ef;
      const jx = (Math.random() - 0.5) * 0.9, jy = (Math.random() - 0.5) * 0.9, jz = (Math.random() - 0.5) * 0.9;
      const vx = n.x * 0.75 + r.x * 0.35 + jx, vy = n.y * 0.75 + r.y * 0.35 + jy, vz = n.z * 0.75 + r.z * 0.35 + jz;
      const il = s / Math.hypot(vx, vy, vz);
      D.emit(t, p.x + n.x * 0.01, p.y + n.y * 0.01, p.z + n.z * 0.01, vx * il, vy * il, vz * il,
        0.5 + 0.8 * Math.random(), (0.014 + 0.02 * Math.random()) * (0.7 + 0.4 * ef), 3 + 4 * Math.random(), 4 + 4 * Math.random(), 0.06, _gc, 0.3 + 0.25 * Math.random(), 0, -10);
    }
    // haze that hangs in the air for a moment
    const nh = Math.round((prof.haze ?? 2) * amount * (0.6 + 0.4 * ef));
    for (let k = 0; k < nh; k++) {
      const s = 0.25 + 0.4 * Math.random();
      D.emit(t, p.x + n.x * 0.03, p.y + n.y * 0.03, p.z + n.z * 0.03, (n.x + (Math.random() - 0.5) * 0.6) * s, (n.y + (Math.random() - 0.3) * 0.6) * s, (n.z + (Math.random() - 0.5) * 0.6) * s,
        1.4 + 1.4 * Math.random(), 0.035 + 0.03 * Math.random(), 2.5 + 1.5 * Math.random(), 2.5, -0.004, _gc, 0.14 + 0.1 * Math.random(), 0, -10);
    }
    // debris: chips (or splinters) thrown out with gravity, coming to rest on the floor
    _gc2.setHex(prof.chip).multiplyScalar(L * 1.1);
    const nc = Math.round(prof.chips * (0.5 + 0.7 * ef) * amount);
    for (let k = 0; k < nc; k++) {
      const s = (1.2 + 3.2 * Math.random()) * ef;
      const vx = n.x * 0.65 + r.x * 0.3 + (Math.random() - 0.5) * 1.1, vy = n.y * 0.65 + r.y * 0.3 + (Math.random() - 0.35) * 1.1, vz = n.z * 0.65 + r.z * 0.3 + (Math.random() - 0.5) * 1.1;
      const il = s / Math.hypot(vx, vy, vz);
      const sz = prof.chipSize * (0.4 + 1.1 * Math.random());
      if (prof.splinter && Math.random() < 0.6) D.emit(t, p.x + n.x * 0.005, p.y, p.z + n.z * 0.005, vx * il, vy * il, vz * il, 2 + 2 * Math.random(), sz * 0.8, 0, 0.8, 1, _gc2, 1, 4, floorY, 0.012);
      else D.emit(t, p.x + n.x * 0.005, p.y, p.z + n.z * 0.005, vx * il, vy * il, vz * il, 2.5 + 2.5 * Math.random(), sz, 0, 0.6 + 0.6 * Math.random(), 1, _gc2, 1, 1, floorY);
    }
    if (prof.sparks && amount >= 1) this.sparks(p, n, r, prof.sparks * (0.6 + 0.5 * ef), cosI > 0.6 ? 0.7 : 1);
  }

  sparks(p, n, r, count, speed = 1) {
    const G = this.glow, t = this.clock, floorY = this.floorBelow(p.x, p.z, p.y + 0.05);
    for (let k = 0; k < count; k++) {
      const s = (2.5 + 7 * Math.random()) * speed;
      const vx = r.x * 0.7 + n.x * 0.35 + (Math.random() - 0.5) * 1.0, vy = r.y * 0.7 + n.y * 0.35 + (Math.random() - 0.4) * 1.0, vz = r.z * 0.7 + n.z * 0.35 + (Math.random() - 0.5) * 1.0;
      const il = s / Math.hypot(vx, vy, vz);
      _gc.setRGB(7, 4.2, 1.8).multiplyScalar(0.6 + 0.6 * Math.random());
      G.emit(t, p.x + n.x * 0.004, p.y + n.y * 0.004, p.z + n.z * 0.004, vx * il, vy * il, vz * il, 0.12 + 0.35 * Math.random(), 0.0035 + 0.003 * Math.random(), 0, 1.2, 1, _gc, 1, 2, floorY, 0.022);
    }
    _gc.setRGB(9, 6.5, 3.5);
    G.emit(t, p.x + n.x * 0.01, p.y + n.y * 0.01, p.z + n.z * 0.01, 0, 0, 0, 0.06, 0.09 + 0.07 * Math.random(), 0.5, 1, 0, _gc, 1, 3, -10);
    // a flicker from the shared effects light once the shot's muzzle flash has let go of it
    this.flashAt.set(p.x + n.x * 0.1, p.y + n.y * 0.1, p.z + n.z * 0.1);
    this.flashT = 0.15;
  }

  // the floor (carpet in most levels, bare concrete in the warehouse)
  ground(e) {
    const g = this.game, p = e.point, d = e.dir;
    const concrete = g.level.theme.style === 4;
    const prof = concrete ? IMPACT_FX.concrete : IMPACT_FX.carpet;
    const el = clamp(-d.y, 0.05, 1); // sine of the elevation
    const st = clamp(1 / Math.max(el, 0.3), 1, 2.6);
    g.view.decals.splat(p.x, p.z, (0.011 + Math.random() * 0.006) * (concrete ? 1.3 : 1), 1, 0.95, st, Math.atan2(d.z, d.x), Math.random());
    const ef = clamp(Math.sqrt(Math.max(e.energy || 0, 60) / 1400), 0.32, 1.35);
    _gp.set(p.x, 0.004, p.z);
    _gv.set(0, 1, 0);
    _gr.set(d.x, -d.y, d.z);
    this.burst(_gp, _gv, _gr, prof, ef, 1, el);
    if (concrete && el < 0.35) this.sparks(_gp, _gv, _gr, 5 + 4 * ef, 1);
  }

  // ---- blood --------------------------------------------------------------------------------------
  mist(p, d, count, speed, size, life, L, dens = 1) {
    const D = this.dust, t = this.clock;
    _gc.setRGB(0.16, 0.026, 0.02).multiplyScalar(L);
    for (let k = 0; k < count; k++) {
      const s = speed * (0.25 + Math.random());
      D.emit(t, p.x, p.y, p.z,
        d.x * s + (Math.random() - 0.5) * speed * 0.6, d.y * s + (Math.random() - 0.5) * speed * 0.6, d.z * s + (Math.random() - 0.5) * speed * 0.6,
        life * (0.5 + 0.7 * Math.random()), size * (0.4 + Math.random()), 3 + 3 * Math.random(), 7 + 5 * Math.random(), 0.3, _gc, (0.24 + 0.22 * Math.random()) * dens, 0, -10);
    }
  }

  // a round went through flesh (n: the engine's fleshHit event)
  flesh(n) {
    const g = this.game, P = g.particles;
    const E = n.energy || 0, d = n.dir;
    const kin = clamp(E / 600, 0.12, 1.3), k = clamp(E / 900, 0, 1.5);
    const en = n.entry, head = !!n.head;
    const L = this.lit(en, 0.2, 0.45);
    // entry: back-spatter toward the shooter (fine droplets in a tight cone) and a puff of mist
    _gV3.set(-d.x, -d.y, -d.z);
    _gN3.set(en.x, en.y, en.z);
    P.spray(_gN3, _gV3, 3 + Math.round(7 * kin), 0.8 + 1.4 * kin, 0.5, 3e-4, 0.0012, 0, 0.004);
    _gv.set(-d.x, -d.y, -d.z);
    this.mist(en, _gv, Math.round(3 + 6 * kin), 0.6 + 0.9 * kin, 0.03 + 0.02 * kin, 0.5, L, head ? 1.2 : 0.9);
    // a few heavier drops fall straight from the wound to the floor under the target
    for (let q = 0; q < 1 + Math.round(2 * kin); q++) P.emit(en.x + (Math.random() - 0.5) * 0.04, en.y, en.z + (Math.random() - 0.5) * 0.04, d.x * 0.3, -0.2, d.z * 0.3, 0.002 + 0.0015 * Math.random(), 0.06 + 0.2 * Math.random(), 0);
    if (n.exit) {
      const s = n.exit;
      _gN3.set(s.x, s.y, s.z);
      _gV3.set(d.x, d.y, d.z);
      // a cone of streaking droplets whose count, speed and reach follow the energy
      P.spray(_gN3, _gV3, 10 + Math.round(48 * k), 2.4 + 5.5 * k, 0.2 + 0.12 * k, 4e-4, 0.0026, 0, 0.03);
      P.spray(_gN3, _gV3, 6 + Math.round(26 * k), 4 + 7 * k, 0.1 + 0.05 * k, 2e-4, 7e-4, 0, 0.004);
      if (k > 0.35) P.spray(_gN3, _gV3, Math.round(3 + 9 * k), 2 + 3 * k, 0.3, 0.0016, 0.0045, 1, 0.12);
      if (n.bone) P.spray(_gN3, _gV3, 2 + Math.round(5 * k), 3 + 4 * k, 0.35, 0.0012, 0.0032, 2, 0.02);
      this.mist(s, d, Math.round(6 + 20 * k), 1.4 + 3.4 * k, 0.04 + 0.035 * k, 0.75, L, 1);
      if (head && k > 0.4) {
        P.spray(_gN3, _gV3, 14, 4.5, 0.45, 0.0018, 0.006, 1, 0.25);
        this.mist(s, d, 18, 3.5, 0.08, 1, L, 1.2);
      }
      this.spatter(s, d, k + (head ? 0.45 : 0), head);
    }
    // close enough for it to reach the bodycam
    const cam = g.player.eye(_gEye);
    const dc = Math.hypot(en.x - cam.x, en.y - cam.y, en.z - cam.z);
    if (g.post && g.post.lensBlood && dc < 2.6 && E > 50) {
      const toCam = -((cam.x - en.x) * d.x + (cam.y - en.y) * d.y + (cam.z - en.z) * d.z) / dc; // back-spatter flies back along the shot
      const amt = clamp((2.6 - dc) / 1.8, 0, 1) * clamp(E / 400, 0.4, 1.2) * (head || n.seg.name === 'neck' ? 1.5 : 1) * clamp(toCam + 0.3, 0, 1);
      if (amt > 0.1) g.post.lensBlood(amt);
    }
  }

  // blood thrown out of an exit wound lands on what is behind the target after its flight time
  spatter(from, dir, strength, head) {
    const g = this.game, world = g.sb.world, wd = g.view.wallDecals;
    const str = Math.min(strength, 1.6);
    const rays = Math.min(16, 4 + Math.round(str * 6) + (head ? 3 : 0));
    const reach = 1.1 + 2.0 * Math.min(str, 1.3);
    const speed = 3.5 + 5 * str;
    // a frame round the shot direction
    _gv.set(dir.x, dir.y, dir.z).normalize();
    if (Math.abs(_gv.y) < 0.9) _gu.set(0, 1, 0); else _gu.set(1, 0, 0);
    _gu.crossVectors(_gv, _gu).normalize();
    _gw.crossVectors(_gu, _gv).normalize();
    _gp.set(from.x, from.y, from.z);
    for (let r = 0; r < rays; r++) {
      const sp = r === 0 ? 0.03 : 0.12 + 0.3 * Math.random(), a = Math.random() * TAU;
      _gr.set(_gv.x, _gv.y, _gv.z).addScaled(_gu, Math.cos(a) * sp).addScaled(_gw, Math.sin(a) * sp).normalize();
      const hits = world.raycastAll(_gp, _gr, reach, this.levelOnly);
      let h = null;
      for (const q of hits) if (!h || q.tIn < h.tIn) h = q;
      if (!h || h.tIn < 0.02) continue;
      const dist = h.tIn, nx = h.normal.x, ny = h.normal.y, nz = h.normal.z;
      const cosInc = Math.max(0.05, -(_gr.x * nx + _gr.y * ny + _gr.z * nz));
      const tf = dist / speed;
      _gV3.set(h.point.x, h.point.y, h.point.z);
      // the droplets drop on their way (walls only), and what would land on the floor is the engine's
      if (Math.abs(ny) < 0.5) { _gV3.y -= 0.5 * 9.81 * tf * tf * 0.6; if (_gV3.y < 0.04) continue; }
      _gN3.set(nx, ny, nz);
      _gD3.set(_gr.x, _gr.y - 9.81 * tf * 0.6 / speed, _gr.z);
      const stretch = clamp(1 / cosInc, 1, 3.2);
      const near = 1 - dist / reach;
      let kind, size;
      if (r === 0) {
        // the main mass: radial spatter when it strikes square on, a long streaking one otherwise
        kind = stretch > 1.5 ? 'spatter' : str > 0.6 ? 'heavy' : 'blood';
        size = (0.14 + 0.24 * str) * (0.75 + 0.5 * (1 - near));
      } else {
        kind = stretch > 1.35 ? 'spatter' : Math.random() < 0.5 ? 'drops' : 'blood';
        size = (0.05 + 0.09 * str * Math.random()) * (0.7 + 0.6 * (1 - near));
      }
      const useDir = kind === 'spatter';
      this.queueDecal(tf, kind, _gV3, _gN3, size, useDir ? _gD3 : null, useDir ? Math.min(stretch, 2.2) : 1);
      // a heavy splash on a wall runs down it
      if (r === 0 && Math.abs(ny) < 0.4 && str > 0.45) {
        // (the run's tile has its source near the top: put that on the splash)
        const ds = Math.min(0.32, size * (0.5 + 0.3 * Math.random()));
        _gV3.y -= ds * 0.34;
        this.queueDecal(tf + 0.35, 'drip', _gV3, _gN3, ds);
      }
    }
    void wd;
  }

  // the engine droplets ask for the floor under them every step: a droplet inside a wall, prop or
  // the ceiling slab has hit it (it leaves a drop or a streak there, and ends); one coming down on a
  // prop top lands there
  dropletFloor(x, z, y) {
    const g = this.game, L = g.level, P = g.particles;
    // which droplet is asking (see onLevel)
    let l = this.pIdx;
    if (!(l < P.n && P.pos[l * 3] === x && P.pos[l * 3 + 2] === z)) {
      l = -1;
      for (let k = Math.max(0, this.pIdx - 2); k < Math.min(P.n, this.pIdx + 3); k++) if (P.pos[k * 3] === x && P.pos[k * 3 + 2] === z) { l = k; this.pIdx = k; break; }
    }
    let M = 0, hit = false;
    if (y > L.ceiling - 0.005) {
      hit = true;
      this.dropOn(l, x, L.ceiling, z, 0, -1, 0);
      M = y + 1;
    } else {
      const near = L.boxesNear(x, z, 0, this.near);
      for (let i = 0; i < near.length && !hit; i++) {
        const b = near[i];
        if (y < b.min.y || y > b.max.y || x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) continue;
        hit = true;
        M = y + 1;
        this.dropInto(l, b, x, y, z);
      }
      if (!hit) {
        M = g.sb.world.surfaceAt(x, z, y + 0.5);
        if (M > 0.05 && l >= 0 && y <= M + P.size[l] * 0.5) this.dropOn(l, x, M, z, 0, 1, 0);
      }
    }
    // the engine removes the droplet if it is old or has landed, then asks again for this index
    if (l >= 0 && !hit && !(P.age[l] > 6 || y <= M + P.size[l] * 0.5)) this.pIdx = l + 1;
    return M;
  }

  // a droplet ended up inside box b: find the face it came in through (from its velocity)
  dropInto(l, b, x, y, z) {
    const P = this.game.particles;
    let ax = -1, sg = 0, px = x, py = y, pz = z;
    if (l >= 0) {
      const vx = P.vel[l * 3], vy = P.vel[l * 3 + 1], vz = P.vel[l * 3 + 2], dt = this.pDt || 1 / 60;
      // where it was a step ago, and the latest slab it crossed on the way in
      const ox = x - vx * dt, oy = y - vy * dt, oz = z - vz * dt;
      let tIn = -1;
      const o = [ox, oy, oz], d = [vx * dt, vy * dt, vz * dt], mn = [b.min.x, b.min.y, b.min.z], mx = [b.max.x, b.max.y, b.max.z];
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) continue;
        const t = ((d[a] > 0 ? mn[a] : mx[a]) - o[a]) / d[a];
        if (t > tIn && t <= 1.0001) { tIn = t; ax = a; sg = d[a] > 0 ? -1 : 1; }
      }
      if (ax >= 0 && tIn >= 0) { px = ox + d[0] * tIn; py = oy + d[1] * tIn; pz = oz + d[2] * tIn; }
      else ax = -1;
    }
    if (ax < 0) {
      // nearest face
      let dm = x - b.min.x; ax = 0; sg = -1;
      if (b.max.x - x < dm) { dm = b.max.x - x; sg = 1; }
      if (z - b.min.z < dm) { dm = z - b.min.z; ax = 2; sg = -1; }
      if (b.max.z - z < dm) { dm = b.max.z - z; ax = 2; sg = 1; }
      if (b.max.y - y < dm) { ax = 1; sg = 1; }
      px = ax === 0 ? (sg > 0 ? b.max.x : b.min.x) : x;
      py = ax === 1 ? b.max.y : y;
      pz = ax === 2 ? (sg > 0 ? b.max.z : b.min.z) : z;
    }
    this.dropOn(l, px, py, pz, ax === 0 ? sg : 0, ax === 1 ? sg : 0, ax === 2 ? sg : 0);
  }

  // leave the mark of droplet l (blood or tissue; bone chips leave none) on a surface
  dropOn(l, x, y, z, nx, ny, nz) {
    const g = this.game, P = g.particles;
    if (!g.settings.gore || this.dropBudget <= 0) return;
    const kind = l >= 0 ? P.kind[l] : 0;
    if (kind > 1) return;
    this.dropBudget--;
    _gV3.set(x, y, z);
    _gN3.set(nx, ny, nz);
    let size = 0.04, opts = null, tile = 'drops';
    if (l >= 0) {
      const vx = P.vel[l * 3], vy = P.vel[l * 3 + 1], vz = P.vel[l * 3 + 2], sp = Math.hypot(vx, vy, vz);
      size = clamp(P.size[l] * (16 + 2.5 * sp) * (kind === 1 ? 1.4 : 1), 0.018, 0.16);
      const cosI = sp > 1e-4 ? Math.abs(vx * nx + vy * ny + vz * nz) / sp : 1;
      if (sp > 1.5 && cosI < 0.85) {
        // a fast drop striking at an angle streaks out along its path
        tile = 'spatter';
        _gD3.set(vx, vy, vz);
        opts = gOpt(_gD3, clamp(1 / Math.max(cosI, 0.3), 1.2, 2.6));
      } else if (P.size[l] > 0.0028 && Math.abs(ny) < 0.3 && Math.random() < 0.3) {
        tile = 'drip'; // a big drop runs down the wall
        size = Math.min(0.2, size * 2.2);
      }
    }
    g.view.wallDecals.add(tile, _gV3, _gN3, size, opts);
  }

  // ---- the player ---------------------------------------------------------------------------------
  onHurt(e) {
    const g = this.game;
    if (!g.settings.gore || !g.post || !g.post.lensBlood) return;
    if (e.amount >= 18 && Math.random() < 0.3 + e.amount / 60) g.post.lensBlood(clamp(e.amount / 70, 0.15, 0.7));
  }
}
