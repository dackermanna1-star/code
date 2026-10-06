// The 3D world: three.js scene + cannon-es physics, stepped at a fixed rate.
import * as THREE from 'three';
import * as CANNON from '../vendor/cannon-es.js';
import { Part, GROUP } from './Part.js';
import { skyTexture } from './textures.js';
import { SparseCollisionMatrix, StaticGridBroadphase } from './broadphase.js';

export const GRAVITY = 196.2; // studs/s^2 (ROBLOX default Workspace gravity)
const FIXED_DT = 1 / 120;

export class World {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    if (opts.renderer) {
      this.renderer = opts.renderer; // shared (thumbnail rendering)
    } else {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 5000);

    // Fixed-function-like lighting: strong ambient + one sun, no shadows.
    this.ambient = new THREE.HemisphereLight(0xe8eef6, 0x9a948a, 1.45);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.35);
    this.sun.position.set(-0.4, 1, -0.6).multiplyScalar(100);
    this.scene.add(this.sun);
    this.fill = new THREE.DirectionalLight(0xffffff, 0.35);
    this.fill.position.set(0.5, 0.3, 0.8).multiplyScalar(100);
    this.scene.add(this.fill);

    if (opts.sky !== false) this.setSky(opts.skyTexture || skyTexture());

    this.physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
    this.physics.broadphase = new CANNON.SAPBroadphase(this.physics);
    // cannon's dense pair matrix costs N^2 per step; keep only touching pairs
    this.physics.collisionMatrix = new SparseCollisionMatrix();
    this.physics.collisionMatrixPrevious = new SparseCollisionMatrix();
    this.physics.allowSleep = true;
    this.physics.solver.iterations = 12;
    this.defaultPhysMaterial = new CANNON.Material('plastic');
    this.physics.defaultContactMaterial.friction = 0.35;
    this.physics.defaultContactMaterial.restitution = 0.25;
    this.physics.defaultContactMaterial.contactEquationStiffness = 1e8;
    this.physics.defaultContactMaterial.contactEquationRelaxation = 3;

    this.parts = new Set();
    this.touchParts = new Set();
    this.kinematicParts = new Set();
    this.dynamicParts = new Set();
    this.characters = new Set();
    this.updaters = new Set();
    this.timers = [];
    this.time = 0;
    this._acc = 0;
    this.fallenPartsDestroyHeight = -500;
  }

  setSky(tex) {
    const geo = new THREE.SphereGeometry(2400, 32, 16);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false });
    if (this.skyMesh) this.scene.remove(this.skyMesh);
    this.skyMesh = new THREE.Mesh(geo, mat);
    this.skyMesh.renderOrder = -1;
    this.scene.add(this.skyMesh);
  }

  setSkyColor(color) {
    if (this.skyMesh) this.scene.remove(this.skyMesh);
    this.skyMesh = null;
    this.scene.background = new THREE.Color(color);
  }

  add(propsOrPart) {
    const part = propsOrPart instanceof Part ? propsOrPart : new Part(this, propsOrPart);
    this.parts.add(part);
    this.scene.add(part.mesh);
    if (part.body) this.physics.addBody(part.body);
    if (part.body && !part.anchored) this.dynamicParts.add(part);
    if (this.shadows) this._shadowFlags(part);
    return part;
  }

  /** Convenience: anchored brick. size/pos arrays, color BrickColor number. */
  brick(size, position, color = 194, extra = {}) {
    return this.add({ size, position, color, ...extra });
  }

  remove(part) {
    if (!this.parts.has(part)) return;
    this.parts.delete(part);
    this.touchParts.delete(part);
    this.kinematicParts.delete(part);
    this.dynamicParts.delete(part);
    this.scene.remove(part.mesh);
    if (part.body) {
      for (const c of [...this.physics.constraints]) {
        if (c.bodyA === part.body || c.bodyB === part.body) this.physics.removeConstraint(c);
      }
      this.physics.removeBody(part.body);
    }
    part.destroyed = true;
  }

  weld(a, b) {
    const c = new CANNON.LockConstraint(a.body, b.body);
    c.parts = [a, b];
    this.physics.addConstraint(c);
    return c;
  }

  /** setTimeout in game time (paused with the simulation). */
  delay(seconds, fn) {
    const t = { at: this.time + seconds, fn };
    this.timers.push(t);
    return t;
  }
  cancel(t) { this.timers = this.timers.filter((x) => x !== t); }

  onUpdate(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); }

  /**
   * Raycast against parts. Returns {part, point, normal, distance} or null.
   * opts.ignore: Set of bodies to ignore; opts.mask: collision groups.
   */
  raycast(from, to, opts = {}) {
    const result = new CANNON.RaycastResult();
    const f = new CANNON.Vec3(from.x, from.y, from.z);
    const t = new CANNON.Vec3(to.x, to.y, to.z);
    const mask = opts.mask ?? (GROUP.WORLD | GROUP.DYNAMIC);
    let best = null;
    // cannon's raycastClosest can't ignore specific bodies; use raycastAll.
    this.physics.raycastAll(f, t, { collisionFilterMask: mask, skipBackfaces: true, checkCollisionResponse: true }, (r) => {
      if (opts.ignore && opts.ignore.has(r.body)) return;
      if (!best || r.distance < best.distance) {
        best = {
          part: r.body.part || null,
          body: r.body,
          point: new THREE.Vector3(r.hitPointWorld.x, r.hitPointWorld.y, r.hitPointWorld.z),
          normal: new THREE.Vector3(r.hitNormalWorld.x, r.hitNormalWorld.y, r.hitNormalWorld.z),
          distance: r.distance,
        };
      }
    });
    return best;
  }

  /**
   * ROBLOX Explosion: kills characters inside BlastRadius (by breaking their
   * joints), unanchored parts get flung away and welds inside the radius break.
   */
  explode(position, radius = 4, pressure = 500000, opts = {}) {
    const pos = new THREE.Vector3().copy(position);
    for (const c of [...this.physics.constraints]) {
      if (!c.parts) continue;
      if (c.parts.some((p) => p.mesh.position.distanceTo(pos) < radius + 1)) this.physics.removeConstraint(c);
    }
    for (const part of this.dynamicParts) {
      if (!part.body) continue;
      const d = part.mesh.position.clone().sub(pos);
      const dist = d.length();
      if (dist > radius * 1.5) continue;
      d.normalize();
      const strength = Math.min(1, pressure / 500000) * 260 * (1 - dist / (radius * 1.5) + 0.3);
      part.body.wakeUp();
      part.body.velocity.x += d.x * strength;
      part.body.velocity.y += d.y * strength + 40;
      part.body.velocity.z += d.z * strength;
      part.body.angularVelocity.set(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10);
    }
    for (const ch of this.characters) {
      if (!ch.alive) continue;
      const dist = ch.rootPosition.distanceTo(pos);
      if (dist < radius + 1.5) {
        if (ch.forceField) continue;
        ch.breakJoints(opts.creator, pos);
      }
    }
    this.spawnExplosionEffect(pos, radius);
    for (const fn of this.explosionListeners || []) fn(pos, radius, opts);
  }

  /** Scripts can watch explosions (e.g. to loosen bricks that were joined by studs). */
  onExplosion(fn) { (this.explosionListeners ||= []).push(fn); }

  spawnExplosionEffect(pos, radius) {
    // 2008 explosions: textures/explosion.png (an orange-yellow billowing
    // fireball) drawn additively as a burst of particles flying outward for
    // about a second (docs/RESEARCH.md, "Explosion visual"; the particle
    // numbers follow Super Nostalgia Zone's emulation, scaled down).
    const tex = explosionTexture();
    const group = new THREE.Group();
    group.position.copy(pos);
    this.scene.add(group);
    const parts = [];
    const emit = (n) => {
      for (let i = 0; i < n; i++) {
        const m = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffffff });
        const s = new THREE.Sprite(m);
        const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        s.material.rotation = Math.random() * Math.PI * 2;
        group.add(s);
        parts.push({ s, v: dir.multiplyScalar((20 + Math.random() * 5) * Math.max(0.6, radius / 4)), age: 0, life: 0.3 + Math.random() * 0.2 });
      }
    };
    let t = 0, emitted = 0;
    const off = this.onUpdate((dt) => {
      t += dt;
      while (emitted < 6 && t >= emitted * 0.12) { emit(22); emitted++; }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        const k = p.age / p.life;
        if (k >= 1) { group.remove(p.s); p.s.material.dispose(); parts.splice(i, 1); continue; }
        p.s.position.addScaledVector(p.v, dt);
        p.s.scale.setScalar(3 - 0.4 * k);
        const c = 1 - 0.5 * k; // white -> 50% grey
        p.s.material.color.setRGB(c, c, c);
        p.s.material.opacity = 1 - k;
      }
      if (emitted >= 6 && !parts.length) { off(); this.scene.remove(group); }
    });
  }


  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  step(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    // timers
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.time);
        for (const t of due) t.fn();
      }
    }
    for (const fn of [...this.updaters]) fn(dt, this.time);
    for (const ch of this.characters) ch.preStep?.(dt);
    this.physics.step(FIXED_DT, dt, 12);
    for (const ch of this.characters) ch.postStep?.(dt);
    for (const p of this.kinematicParts) p.syncFromBody();
    for (const p of this.dynamicParts) {
      p.syncFromBody();
      if (p.mesh.position.y < this.fallenPartsDestroyHeight) this.remove(p);
    }
    this._checkTouches();
  }

  /**
   * 2008 stencil shadows: hard-edged, cast by characters and moving parts
   * onto everything else. Approximated with a basic (unfiltered) shadow map
   * that follows the camera's focus.
   */
  /** For places with thousands of anchored parts: a grid broadphase (see broadphase.js). */
  useStaticGrid(cell = 16) {
    const old = this.physics.broadphase;
    if (old?._addBodyHandler) { this.physics.removeEventListener('addBody', old._addBodyHandler); this.physics.removeEventListener('removeBody', old._removeBodyHandler); }
    this.physics.broadphase = new StaticGridBroadphase(cell);
    this.physics.broadphase.setWorld(this.physics);
  }

  enableShadows() {
    this.shadows = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 1; c.far = 400;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun.target);
    for (const p of this.parts) this._shadowFlags(p);
  }

  _shadowFlags(part) {
    part.mesh.receiveShadow = true;
    part.mesh.castShadow = !part.anchored || !!part.kinematic;
  }

  render(focus) {
    if (this.skyMesh) this.skyMesh.position.copy(this.camera.position);
    if (this.shadows) {
      const f = focus || this.camera.position;
      const dir = new THREE.Vector3(-0.4, 1, -0.6).normalize();
      this.sun.target.position.set(Math.round(f.x / 4) * 4, Math.round(f.y / 4) * 4, Math.round(f.z / 4) * 4);
      this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 200);
    }
    this.renderer.render(this.scene, this.camera);
    // extra passes drawn on top (a first-person gun)
    for (const fn of this.overlays || []) fn(this.renderer);
  }

  // --- Touched events ------------------------------------------------------
  // Characters are tested against every part with a Touched handler using an
  // OBB-vs-AABB separating-axis test (works for non-colliding trigger parts).
  _checkTouches() {
    if (!this.touchParts.size) return;
    const obb = {};
    for (const part of this.touchParts) {
      if (part.destroyed || !part.touchHandlers.length) continue;
      part.getOBB(obb);
      for (const ch of this.characters) {
        if (!ch.alive && !part.touchesDead) continue;
        const box = ch.getTouchAABB();
        if (obbIntersectsAABB(obb, box)) {
          for (const h of part.touchHandlers) h(ch, part);
        }
      }
      if (part.touchesParts) {
        for (const other of this.dynamicParts) {
          if (other === part) continue;
          const ob = other.getOBB({});
          if (obbIntersectsAABB(obb, aabbOfOBB(ob))) for (const h of part.touchHandlers) h(other, part);
        }
      }
    }
  }
}

const _tmp = new THREE.Vector3();
export function aabbOfOBB(o) {
  const ext = new THREE.Vector3();
  for (let i = 0; i < 3; i++) {
    const a = o.axes[i];
    const h = [o.half.x, o.half.y, o.half.z][i];
    ext.x += Math.abs(a.x) * h; ext.y += Math.abs(a.y) * h; ext.z += Math.abs(a.z) * h;
  }
  return { min: o.center.clone().sub(ext), max: o.center.clone().add(ext) };
}

/** SAT test: oriented box (or sphere if o.radius set) vs axis-aligned box. */
export function obbIntersectsAABB(o, box) {
  const bc = _tmp.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
  const bh = [(box.max.x - box.min.x) / 2, (box.max.y - box.min.y) / 2, (box.max.z - box.min.z) / 2];
  if (o.radius !== undefined) {
    const cx = Math.max(box.min.x, Math.min(o.center.x, box.max.x));
    const cy = Math.max(box.min.y, Math.min(o.center.y, box.max.y));
    const cz = Math.max(box.min.z, Math.min(o.center.z, box.max.z));
    const dx = cx - o.center.x, dy = cy - o.center.y, dz = cz - o.center.z;
    return dx * dx + dy * dy + dz * dz <= o.radius * o.radius;
  }
  const t = [o.center.x - bc.x, o.center.y - bc.y, o.center.z - bc.z];
  const A = o.axes; // columns of rotation
  const ah = [o.half.x, o.half.y, o.half.z];
  // R[i][j] = worldAxis_i · A_j
  const R = [
    [A[0].x, A[1].x, A[2].x],
    [A[0].y, A[1].y, A[2].y],
    [A[0].z, A[1].z, A[2].z],
  ];
  const AbsR = R.map((row) => row.map((v) => Math.abs(v) + 1e-6));
  // world axes
  for (let i = 0; i < 3; i++) {
    const ra = ah[0] * AbsR[i][0] + ah[1] * AbsR[i][1] + ah[2] * AbsR[i][2];
    if (Math.abs(t[i]) > bh[i] + ra) return false;
  }
  // OBB axes
  for (let j = 0; j < 3; j++) {
    const rb = bh[0] * AbsR[0][j] + bh[1] * AbsR[1][j] + bh[2] * AbsR[2][j];
    const tp = t[0] * R[0][j] + t[1] * R[1][j] + t[2] * R[2][j];
    if (Math.abs(tp) > ah[j] + rb) return false;
  }
  // cross products
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const i1 = (i + 1) % 3, i2 = (i + 2) % 3, j1 = (j + 1) % 3, j2 = (j + 2) % 3;
      const ra = bh[i1] * AbsR[i2][j] + bh[i2] * AbsR[i1][j];
      const rb = ah[j1] * AbsR[i][j2] + ah[j2] * AbsR[i][j1];
      const tp = t[i2] * R[i1][j] - t[i1] * R[i2][j];
      if (Math.abs(tp) > ra + rb) return false;
    }
  }
  return true;
}

let _explosionTex = null;
function explosionTexture() {
  if (_explosionTex) return _explosionTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 128, 128);
  // billowing puffs: overlapping radial blobs, yellow core, orange edges
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * 30;
    const cx = 64 + Math.cos(a) * d, cy = 64 + Math.sin(a) * d, r = 14 + rnd() * 18;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,230,140,0.55)');
    g.addColorStop(0.5, 'rgba(255,140,30,0.35)');
    g.addColorStop(1, 'rgba(120,30,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  }
  _explosionTex = new THREE.CanvasTexture(c);
  _explosionTex.colorSpace = THREE.SRGBColorSpace;
  return _explosionTex;
}
