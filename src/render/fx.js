// Visual effects: glow particles, smoke, physical chunks (blood, bone, debris), decals,
// shockwave rings and floating damage numbers.
import * as THREE from 'three';
import { rand, randomUnitVector, randomInCone } from '../core/math.js';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function pointsMaterial(tex, additive) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, scale: { value: 600 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0.05 } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec4 pcolor;
      uniform float scale;
      varying vec4 vColor;
      varying float vFog;
      void main() {
        vColor = pcolor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / max(0.1, -mv.z);
        gl_Position = projectionMatrix * mv;
        vFog = -mv.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 fogColor;
      uniform float fogDensity;
      varying vec4 vColor;
      varying float vFog;
      void main() {
        vec4 t = texture2D(map, gl_PointCoord);
        float f = 1.0 - exp(-fogDensity * fogDensity * vFog * vFog);
        ${additive ? 'gl_FragColor = vec4(vColor.rgb * t.a * vColor.a * (1.0 - f), 1.0);' : 'gl_FragColor = vec4(mix(vColor.rgb * t.rgb, fogColor, f), t.a * vColor.a);'}
        if (gl_FragColor.a < 0.003) discard;
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

class PointPool {
  constructor(scene, tex, max, additive) {
    this.max = max;
    this.count = 0;
    this.p = [];
    const g = new THREE.BufferGeometry();
    this.posArr = new Float32Array(max * 3);
    this.colArr = new Float32Array(max * 4);
    this.sizeArr = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.colArr, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.sizeArr, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = pointsMaterial(tex, additive);
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
  }

  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push(o);
  }

  update(dt, world) {
    const P = this.p;
    let n = 0;
    for (let i = 0; i < P.length; i++) {
      const o = P[i];
      o.life -= dt;
      if (o.life <= 0) continue;
      o.vel.y -= (o.grav || 0) * dt;
      if (o.drag) o.vel.multiplyScalar(Math.max(0, 1 - o.drag * dt));
      o.pos.addScaledVector(o.vel, dt);
      if (o.floor && world) {
        const fy = world.floorAt(o.pos.x, o.pos.z) + 0.02;
        if (o.pos.y < fy) { o.pos.y = fy; o.vel.y *= -0.3; o.vel.x *= 0.6; o.vel.z *= 0.6; }
      }
      const t = 1 - o.life / o.max;
      const a = o.fadeIn ? Math.min(1, t / o.fadeIn) * (1 - t) : (1 - t * t);
      let flick = 1;
      if (o.flicker) flick = 0.6 + Math.random() * 0.4;
      this.posArr[n * 3] = o.pos.x;
      this.posArr[n * 3 + 1] = o.pos.y;
      this.posArr[n * 3 + 2] = o.pos.z;
      const col = o.c1 ? _c.copy(o.color).lerp(o.c1, t) : o.color;
      this.colArr[n * 4] = col.r;
      this.colArr[n * 4 + 1] = col.g;
      this.colArr[n * 4 + 2] = col.b;
      this.colArr[n * 4 + 3] = a * (o.alpha ?? 1) * flick;
      this.sizeArr[n] = o.size + (o.size1 !== undefined ? (o.size1 - o.size) * t : 0);
      P[n] = o;
      n++;
    }
    P.length = n;
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pcolor.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }

  clear() { this.p.length = 0; }
}

const CHUNK_KINDS = {
  blood: { color: 0x5e0606, rough: 0.25, decal: true, size: [0.016, 0.042], bounce: 0 },
  goo: { color: 0x48a830, rough: 0.2, decal: true, size: [0.02, 0.05], bounce: 0, emissive: 0x0c2a06 },
  ichor: { color: 0x3e1256, rough: 0.2, decal: true, size: [0.016, 0.042], bounce: 0 },
  bone: { color: 0xc8bea8, rough: 0.6, decal: false, size: [0.018, 0.042], bounce: 0.35 },
  stone: { color: 0x8a8278, rough: 0.9, decal: false, size: [0.04, 0.1], bounce: 0.3 },
  wood: { color: 0x7a5536, rough: 0.9, decal: false, size: [0.03, 0.09], bounce: 0.35, elongate: true },
  clay: { color: 0x9a5a3a, rough: 0.8, decal: false, size: [0.03, 0.08], bounce: 0.3 },
  gold: { color: 0xffcc55, rough: 0.3, decal: false, size: [0.02, 0.04], bounce: 0.5, metal: true },
  ember: { color: 0xff8030, rough: 1, decal: false, size: [0.02, 0.04], bounce: 0.2, emissive: 0xff5010 },
};

class ChunkPool {
  constructor(scene, max) {
    this.max = max;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.c = [];
  }

  spawn(o) {
    if (this.c.length >= this.max) this.c.shift();
    this.c.push(o);
  }

  update(dt, world, fx) {
    const C = this.c;
    let n = 0;
    for (let i = 0; i < C.length; i++) {
      const o = C[i];
      o.life -= dt;
      if (o.life <= 0) continue;
      if (!o.resting) {
        o.vel.y -= 18 * dt;
        o.pos.addScaledVector(o.vel, dt);
        o.rot.x += o.spin.x * dt;
        o.rot.y += o.spin.y * dt;
        o.rot.z += o.spin.z * dt;
        // walls
        if (world.solidAt(o.pos.x, o.pos.z)) {
          const h = world.raycast(o.pos.x - o.vel.x * dt, o.pos.y, o.pos.z - o.vel.z * dt, o.vel.x, 0, o.vel.z, 1);
          if (o.kind.decal) {
            if (h && Math.random() < 0.7 && fx) fx.decal(_v.set(h.x, o.pos.y, h.z), _s.set(h.nx, 0, h.nz), o.size * rand(4, 7), o.color, 0.9);
            continue;
          }
          o.pos.x -= o.vel.x * dt * 1.5;
          o.pos.z -= o.vel.z * dt * 1.5;
          o.vel.x *= -o.kind.bounce;
          o.vel.z *= -o.kind.bounce;
        }
        const fy = world.floorAt(o.pos.x, o.pos.z) + o.size * 0.5;
        if (o.pos.y < fy) {
          if (o.kind.decal) {
            if (Math.random() < 0.8 && fx) fx.decal(_v.set(o.pos.x, fy - o.size * 0.5, o.pos.z), UP, o.size * rand(8, 15), o.color, 0.95);
            continue;
          }
          o.pos.y = fy;
          if (Math.abs(o.vel.y) > 1.2) {
            o.vel.y *= -o.kind.bounce;
            o.vel.x *= 0.6;
            o.vel.z *= 0.6;
            o.spin.multiplyScalar(0.6);
          } else {
            o.resting = true;
            o.life = Math.min(o.life, o.restLife ?? 4);
          }
        }
      }
      const shrink = o.life < 0.6 ? o.life / 0.6 : 1;
      _e.set(o.rot.x, o.rot.y, o.rot.z);
      _q.setFromEuler(_e);
      const s = o.size * shrink;
      if (o.kind.elongate) _s.set(s * 0.5, s * 0.5, s * 2.5);
      else if (!o.resting && o.kind.decal) _s.set(s * 0.8, s * 0.8, s * 1.6);
      else _s.set(s, s * (o.resting ? 0.5 : 1), s);
      _m.compose(o.pos, _q, _s);
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, o.color);
      C[n] = o;
      n++;
    }
    C.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.c.length = 0; this.mesh.count = 0; }
}

class DecalPool {
  constructor(scene, textures, maxEach) {
    this.meshes = textures.map((t) => {
      const mat = new THREE.MeshStandardMaterial({
        map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
        roughness: 0.22, metalness: 0.05,
      });
      const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, maxEach);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxEach * 3), 3);
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = 1;
      scene.add(m);
      return { mesh: m, next: 0, max: maxEach, used: 0 };
    });
    this.growing = [];
  }

  add(pos, normal, size, color, rotation = Math.random() * Math.PI * 2) {
    pos = pos.clone();
    normal = normal.clone();
    const d = this.meshes[Math.floor(Math.random() * this.meshes.length)];
    const i = d.next;
    d.next = (d.next + 1) % d.max;
    d.used = Math.min(d.max, d.used + 1);
    d.mesh.count = d.used;
    _q.setFromUnitVectors(_v.set(0, 0, 1), normal);
    const rq = new THREE.Quaternion().setFromAxisAngle(_v.set(0, 0, 1), rotation);
    _q.multiply(rq);
    const p = pos.addScaledVector(normal, 0.012 + Math.random() * 0.006);
    _m.compose(p, _q, _s.set(size, size, 1));
    d.mesh.setMatrixAt(i, _m);
    d.mesh.setColorAt(i, color);
    d.mesh.instanceMatrix.needsUpdate = true;
    d.mesh.instanceColor.needsUpdate = true;
    return { d, i, pos: p, quat: _q.clone() };
  }

  // A pool that slowly spreads (corpses).
  addGrowing(pos, size, color, duration = 3) {
    const h = this.add(pos, UP, 0.05, color);
    this.growing.push({ h, size, t: 0, duration });
  }

  update(dt) {
    for (let k = this.growing.length - 1; k >= 0; k--) {
      const g = this.growing[k];
      g.t += dt;
      const f = Math.min(1, g.t / g.duration);
      const s = 0.05 + (g.size - 0.05) * (1 - Math.pow(1 - f, 2));
      _m.compose(g.h.pos, g.h.quat, _s.set(s, s, 1));
      g.h.d.mesh.setMatrixAt(g.h.i, _m);
      g.h.d.mesh.instanceMatrix.needsUpdate = true;
      if (f >= 1) this.growing.splice(k, 1);
    }
  }

  clear() {
    for (const d of this.meshes) { d.mesh.count = 0; d.next = 0; d.used = 0; }
    this.growing.length = 0;
  }
}

export class FX {
  constructor(renderer, assets) {
    this.renderer = renderer;
    const scene = renderer.scene;
    this.scene = scene;
    this.glow = new PointPool(scene, assets.tex.glow, 2500, true);
    this.smoke = new PointPool(scene, assets.tex.smoke, 600, false);
    this.chunks = new ChunkPool(scene, 700);
    this.decals = new DecalPool(scene, assets.tex.splats, 220);
    this.gore = 1;
    this.rings = [];
    this.trails = [];
    this.world = null;
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.numbers = new DamageNumbers(renderer);
    this.emitters = [];
  }

  setWorld(world, theme) {
    this.world = world;
    this.theme = theme;
    const fog = new THREE.Color(theme.fog);
    for (const pool of [this.glow, this.smoke]) {
      pool.mat.uniforms.fogColor.value.copy(fog);
      pool.mat.uniforms.fogDensity.value = theme.fogDensity;
    }
  }

  clear() {
    this.glow.clear();
    this.smoke.clear();
    this.chunks.clear();
    this.decals.clear();
    for (const r of this.rings) r.mesh.removeFromParent();
    this.rings.length = 0;
    this.emitters.length = 0;
    this.numbers.clear();
  }

  update(dt, camera) {
    // ambient dust motes drifting around the viewer
    if (this.world && dt > 0) {
      this._dustAcc = (this._dustAcc || 0) + dt * 14;
      while (this._dustAcc >= 1) {
        this._dustAcc -= 1;
        const p = camera.position;
        const pos = new THREE.Vector3(p.x + rand(-6, 6), p.y + rand(-1.4, 2), p.z + rand(-6, 6));
        if (this.world.solidAt(pos.x, pos.z)) continue;
        const life = rand(4, 7);
        this.glow.spawn({ pos, vel: new THREE.Vector3(rand(-0.06, 0.06), rand(-0.03, 0.05), rand(-0.06, 0.06)), color: new THREE.Color(0xffe2b8), life, max: life, size: rand(0.02, 0.035), size1: 0.02, grav: 0, drag: 0, floor: false, alpha: 0.35, fadeIn: 0.3 });
      }
    }
    const h = this.renderer.renderer.domElement.height;
    this.glow.mat.uniforms.scale.value = h * 0.5;
    this.smoke.mat.uniforms.scale.value = h * 0.5;
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.t += dt;
      if (e.t >= e.dur || (e.alive && !e.alive())) { this.emitters.splice(i, 1); continue; }
      e.acc += dt * e.rate;
      while (e.acc >= 1) { e.acc -= 1; e.fn(e.t / e.dur); }
    }
    this.glow.update(dt, this.world);
    this.smoke.update(dt, this.world);
    if (this.world) this.chunks.update(dt, this.world, this);
    this.decals.update(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const f = r.t / r.dur;
      if (f >= 1) { r.mesh.removeFromParent(); r.mesh.material.dispose(); this.rings.splice(i, 1); continue; }
      const s = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - f, 3));
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = (1 - f) * r.alpha;
    }
    this.numbers.update(dt, camera);
  }

  // continuous emitter: fn(progress) called `rate` times per second for `dur` seconds
  emit(rate, dur, fn, alive) {
    this.emitters.push({ rate, dur, fn, t: 0, acc: 0, alive });
  }

  // ---- primitives
  spark(pos, vel, color, life = 0.4, size = 0.08, opts = {}) {
    this.glow.spawn({ pos: pos.clone(), vel: vel.clone(), color: new THREE.Color(color), life, max: life, size, size1: opts.size1 ?? size * 0.2, grav: opts.grav ?? 9, drag: opts.drag ?? 1.5, floor: opts.floor ?? true, flicker: opts.flicker, c1: opts.c1 ? new THREE.Color(opts.c1) : null, alpha: opts.alpha });
  }

  puff(pos, vel, color, life = 1.2, size = 0.6, size1 = 1.6, alpha = 0.5) {
    this.smoke.spawn({ pos: pos.clone(), vel: vel.clone(), color: new THREE.Color(color), life, max: life, size, size1, grav: -0.3, drag: 1.5, alpha, fadeIn: 0.15 });
  }

  chunk(kindName, pos, vel, color = null, life = 6) {
    const kind = CHUNK_KINDS[kindName];
    this.chunks.spawn({
      kind, pos: pos.clone(), vel: vel.clone(), rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3(rand(-15, 15), rand(-15, 15), rand(-15, 15)), size: rand(kind.size[0], kind.size[1]),
      color: new THREE.Color(color ?? kind.color), life, resting: false, restLife: kindName === 'bone' ? 10 : 4,
    });
  }

  decal(pos, normal, size, color, alpha = 1) {
    void alpha;
    return this.decals.add(pos, normal, size, color instanceof THREE.Color ? color : new THREE.Color(color));
  }

  ring(pos, color, r1 = 4, dur = 0.45, alpha = 0.8, r0 = 0.3) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: alpha, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.copy(pos);
    mesh.position.y += 0.06;
    this.scene.add(mesh);
    this.rings.push({ mesh, t: 0, dur, r0, r1, alpha });
  }

  // ---- composite effects

  sparks(pos, dir, count = 14, color = 0xffd080, speed = 7) {
    for (let i = 0; i < count; i++) {
      const v = randomInCone(dir, 0.9, new THREE.Vector3()).multiplyScalar(speed * rand(0.4, 1.2));
      this.spark(pos, v, color, rand(0.15, 0.45), rand(0.04, 0.09), { c1: 0xff5010, grav: 14 });
    }
    this.spark(pos, new THREE.Vector3(), 0xfff0c0, 0.08, 0.6, { size1: 0.9, grav: 0, floor: false });
  }

  blood(pos, dir, amount = 1, kind = 'blood', color = null) {
    const g = this.gore;
    if (g <= 0 && kind === 'blood') { this.sparks(pos, dir, 6, 0xffffff, 3); return; }
    const n = Math.round((8 + 14 * amount) * g);
    const col = color ?? CHUNK_KINDS[kind].color;
    for (let i = 0; i < n; i++) {
      const v = randomInCone(dir, 0.75, new THREE.Vector3()).multiplyScalar(rand(2, 7) * (0.6 + amount * 0.4));
      v.y += rand(0.5, 2.5);
      this.chunk(kind, pos, v, col, 3);
    }
    // mist
    const c = new THREE.Color(col).multiplyScalar(0.6);
    for (let i = 0; i < 3 * g; i++) this.puff(pos, randomInCone(dir, 0.6, new THREE.Vector3()).multiplyScalar(rand(0.5, 2)), c, 0.5, 0.25, 0.8, 0.45);
  }

  // A pumping blood fountain (for stumps): returns nothing, emits over time
  fountain(getPos, getDir, dur = 1.5, kind = 'blood', color = null) {
    if (this.gore <= 0) return;
    this.emit(28 * this.gore, dur, (t) => {
      const p = getPos();
      const d = getDir();
      const v = randomInCone(d, 0.35, new THREE.Vector3()).multiplyScalar(rand(2, 5) * (1 - t * 0.7));
      this.chunk(kind, p, v, color, 2.5);
    });
  }

  debris(pos, kind, count = 8, power = 4) {
    for (let i = 0; i < count; i++) {
      const v = randomUnitVector(new THREE.Vector3()).multiplyScalar(rand(1, power));
      v.y = Math.abs(v.y) + rand(1, 3);
      this.chunk(kind, pos, v, null, rand(3, 6));
    }
  }

  dust(pos, count = 6, color = 0x9a9080, spread = 0.5) {
    for (let i = 0; i < count; i++) {
      const v = randomUnitVector(new THREE.Vector3()).multiplyScalar(rand(0.3, 1.2));
      v.y = Math.abs(v.y) * 0.6;
      const p = pos.clone().add(new THREE.Vector3(rand(-spread, spread), rand(0, spread * 0.5), rand(-spread, spread)));
      this.puff(p, v, color, rand(0.8, 1.6), rand(0.4, 0.8), rand(1.2, 2.2), 0.35);
    }
  }

  fire(pos, intensity = 1, spread = 0.2) {
    const p = pos.clone().add(new THREE.Vector3(rand(-spread, spread), rand(0, spread), rand(-spread, spread)));
    this.spark(p, new THREE.Vector3(rand(-0.3, 0.3), rand(1.2, 2.5) * intensity, rand(-0.3, 0.3)), 0xffa040, rand(0.3, 0.6), rand(0.15, 0.3) * intensity, { size1: 0.02, c1: 0xff3000, grav: -2, drag: 1, floor: false, flicker: true });
  }

  explosion(pos, radius = 3, color = 0xff8030) {
    this.renderer.flash(pos, color, 60 * radius / 3, radius * 4, 0.45);
    for (let i = 0; i < 70; i++) {
      const v = randomUnitVector(new THREE.Vector3()).multiplyScalar(rand(2, 10) * radius / 3);
      this.spark(pos, v, i % 3 ? 0xffb050 : 0xffffff, rand(0.3, 0.8), rand(0.12, 0.35), { c1: 0xff2000, grav: 3, drag: 2.5 });
    }
    for (let i = 0; i < 18; i++) {
      const v = randomUnitVector(new THREE.Vector3()).multiplyScalar(rand(0.5, 3));
      v.y = Math.abs(v.y) + 0.5;
      this.puff(pos, v, i < 8 ? 0x3a302a : 0x222222, rand(1.2, 2.5), rand(0.8, 1.4), rand(2.5, 4), 0.55);
    }
    for (let i = 0; i < 12; i++) this.chunk('ember', pos, randomUnitVector(new THREE.Vector3()).multiplyScalar(rand(3, 9)).setY(rand(2, 7)), null, 2);
    this.ring(pos, color, radius * 1.2, 0.4, 0.9);
    const fy = this.world ? this.world.floorAt(pos.x, pos.z) : 0;
    this.decal(new THREE.Vector3(pos.x, fy, pos.z), UP, radius * 0.9, 0x0a0806);
  }

  magic(pos, color, count = 20, speed = 3) {
    for (let i = 0; i < count; i++) {
      const v = randomUnitVector(new THREE.Vector3()).multiplyScalar(rand(0.5, speed));
      this.spark(pos, v, color, rand(0.4, 0.9), rand(0.06, 0.14), { grav: -1, drag: 2, floor: false });
    }
  }

  lightning(a, b, color = 0x9ad8ff) {
    const segs = 10;
    const prev = a.clone();
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const p = a.clone().lerp(b, t);
      if (i < segs) p.add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3)));
      for (let k = 0; k < 4; k++) {
        const q = prev.clone().lerp(p, k / 4);
        this.spark(q, new THREE.Vector3(), k % 2 ? color : 0xffffff, 0.16, 0.16, { grav: 0, floor: false, size1: 0.05 });
      }
      prev.copy(p);
    }
    this.renderer.flash(b, color, 14, 8, 0.15);
  }

  levelUp(pos) {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * 2, rand(1, 4), Math.sin(a) * 2);
      this.spark(pos, v, 0xffe080, 1.2, 0.12, { grav: 0.5, drag: 1, floor: false });
    }
  }
}

// Floating combat text (DOM, projected).
class DamageNumbers {
  constructor(renderer) {
    this.renderer = renderer;
    this.root = document.createElement('div');
    this.root.id = 'damage-numbers';
    document.getElementById('ui').appendChild(this.root);
    this.items = [];
  }

  add(pos, text, cls = '') {
    const el = document.createElement('div');
    el.className = 'dmg ' + cls;
    el.textContent = text;
    this.root.appendChild(el);
    this.items.push({ el, pos: pos.clone(), vel: new THREE.Vector3(rand(-0.6, 0.6), rand(1.8, 2.6), rand(-0.6, 0.6)), t: 0, dur: cls.includes('big') ? 1.1 : 0.85 });
    if (this.items.length > 40) this.items.shift().el.remove();
  }

  update(dt, camera) {
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.t > it.dur) { it.el.remove(); this.items.splice(i, 1); continue; }
      it.vel.y -= 5 * dt;
      it.pos.addScaledVector(it.vel, dt);
      _v.copy(it.pos).project(camera);
      if (_v.z > 1) { it.el.style.display = 'none'; continue; }
      it.el.style.display = '';
      const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
      const f = it.t / it.dur;
      const s = f < 0.12 ? 0.6 + (f / 0.12) * 0.7 : 1.3 - Math.min(0.3, (f - 0.12) * 1.2);
      it.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`;
      it.el.style.opacity = f > 0.7 ? (1 - f) / 0.3 : 1;
    }
  }

  clear() {
    for (const it of this.items) it.el.remove();
    this.items.length = 0;
  }
}
