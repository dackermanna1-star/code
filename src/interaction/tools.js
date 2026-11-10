// Player tools: grab / rotate / throw, projectile launcher, sledgehammer,
// explosive charge, and prop placement. All input handling lives here.
import * as THREE from 'three';
import { PROP_BY_TYPE, PROJECTILES } from '../props/index.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export const TOOLS = [
  { id: 'grab', label: 'Grab', key: '1', hint: 'Drag to carry · wheel = distance · hold R + move = rotate · F or right-click = throw' },
  { id: 'launch', label: 'Launcher', key: '2', hint: 'Click to fire a projectile at the cursor · hold to keep firing' },
  { id: 'hammer', label: 'Sledgehammer', key: '3', hint: 'Click a surface to strike it with the set impulse' },
  { id: 'bomb', label: 'Explosive', key: '4', hint: 'Click to detonate a charge at the cursor' },
];

export class Tools {
  constructor({ sim, stage, fx, audio, rig, canvas, app }) {
    this.sim = sim;
    this.stage = stage;
    this.fx = fx;
    this.audio = audio;
    this.rig = rig;
    this.canvas = canvas;
    this.app = app;
    this.tool = 'grab';
    this.settings = {
      launchSpeed: 30, projectile: 'bowling', grabStrength: 2500,
      hammerImpulse: 220, bombPower: 600, bombRadius: 4.5,
    };
    this.ndc = new THREE.Vector2(0, 0);
    this.ray = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) };
    this.mouseInside = false;
    this.hover = null;
    this.hoverAsm = null;
    this.held = null;
    this.placing = null;
    this.rotating = false;
    this.drag = null; // camera drag: {mode, x, y}
    this.fireTimer = 0;
    this.firing = false;
    this.pointers = new Map();
    this.pinch = null;
    this.onChange = () => {};

    // selection brackets
    this.select = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.95, depthTest: false, toneMapped: false })
    );
    this.select.matrixAutoUpdate = false;
    this.select.renderOrder = 20;
    this.select.frustumCulled = false;
    this.selectAsm = null;

    // grab beam
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.beam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.8, depthTest: false, toneMapped: false }));
    this.beam.frustumCulled = false;
    this.beam.visible = false;
    this.beam.renderOrder = 21;
    stage.scene.add(this.beam);
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffc400, depthTest: false, toneMapped: false }));
    this.dot.visible = false;
    this.dot.renderOrder = 22;
    stage.scene.add(this.dot);

    // aim reticle (hammer / bomb radius)
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.93, 1, 56),
      new THREE.MeshBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthTest: false, toneMapped: false })
    );
    this.reticle.visible = false;
    this.reticle.renderOrder = 19;
    stage.scene.add(this.reticle);

    // placement ghost
    this.ghost = new THREE.Group();
    this.ghost.visible = false;
    stage.scene.add(this.ghost);

    sim.preStep = (h) => this.prePhysics(h);
    this.bind();
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => this.pointerDown(e));
    window.addEventListener('pointermove', (e) => this.pointerMove(e));
    window.addEventListener('pointerup', (e) => this.pointerUp(e));
    window.addEventListener('pointercancel', (e) => this.pointerUp(e));
    c.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    c.addEventListener('pointerleave', () => { this.mouseInside = false; });
    c.addEventListener('pointerenter', () => { this.mouseInside = true; });
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keyUp(e));
    window.addEventListener('blur', () => { this.rig.keys.clear(); this.rotating = false; this.firing = false; });
  }

  setNdc(e) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.mouseInside = true;
  }

  pointerDown(e) {
    this.audio.unlock();
    this.setNdc(e);
    this.canvas.setPointerCapture?.(e.pointerId);
    if (e.pointerType === 'touch') {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        // two fingers: orbit + pinch; cancel whatever the first finger started
        this.release();
        this.firing = false;
        const [p, q] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), cx: (p.x + q.x) / 2, cy: (p.y + q.y) / 2 };
        return;
      }
    }
    this.updateRay();
    if (e.button === 2) {
      if (this.held) { this.throwHeld(); return; }
      if (this.placing) { this.cancelPlacement(); return; }
      this.drag = { mode: e.shiftKey ? 'pan' : 'rotate', x: e.clientX, y: e.clientY, id: e.pointerId };
      return;
    }
    if (e.button === 1) {
      this.drag = { mode: 'pan', x: e.clientX, y: e.clientY, id: e.pointerId };
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    if (this.placing) { this.place(e.shiftKey); return; }
    if (this.app.paused && this.tool !== 'grab') this.app.flash('Simulation is paused — press Space to resume');
    if (this.tool === 'grab') this.grab();
    else if (this.tool === 'launch') { this.fire(); this.firing = true; this.fireTimer = 0.22; }
    else if (this.tool === 'hammer') this.strike();
    else if (this.tool === 'bomb') this.detonate();
  }

  pointerMove(e) {
    if (e.pointerType === 'touch' && this.pointers.has(e.pointerId)) {
      const prev = this.pointers.get(e.pointerId);
      const nx = e.clientX, ny = e.clientY;
      if (this.pinch && this.pointers.size >= 2) {
        prev.x = nx; prev.y = ny;
        const [p, q] = [...this.pointers.values()];
        const d = Math.hypot(p.x - q.x, p.y - q.y), cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2;
        this.rig.zoom((this.pinch.d - d) * 4);
        this.rig.rotate(cx - this.pinch.cx, cy - this.pinch.cy);
        this.pinch = { d, cx, cy };
        return;
      }
      prev.x = nx; prev.y = ny;
    }
    if (e.target === this.canvas || this.held || this.drag) this.setNdc(e);
    if (this.drag && e.pointerId === this.drag.id) {
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      if (this.drag.mode === 'rotate') this.rig.rotate(dx, dy);
      else this.rig.pan(dx, dy);
      return;
    }
    if (this.held && this.rotating) {
      // rotate the carried object about the camera's up and right axes
      const cam = this.rig.camera;
      _a.setFromMatrixColumn(cam.matrixWorld, 0);
      _q.setFromAxisAngle(UP, (e.movementX || 0) * 0.008);
      _q2.setFromAxisAngle(_a, (e.movementY || 0) * 0.008);
      this.held.targetQuat.premultiply(_q).premultiply(_q2).normalize();
    }
  }

  pointerUp(e) {
    if (e.pointerType === 'touch') {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
    }
    if (this.drag && e.pointerId === this.drag.id) { this.drag = null; return; }
    if (e.button === 0 || e.pointerType === 'touch') {
      this.firing = false;
      if (this.held) this.release();
    }
  }

  wheel(e) {
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
    if (this.held) {
      this.held.dist = clamp(this.held.dist * Math.exp(-d * 0.0012), 0.6, 60);
    } else if (this.placing) {
      this.placing.yaw += (d > 0 ? 1 : -1) * (Math.PI / 12);
    } else this.rig.zoom(d);
  }

  keyDown(e) {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    this.audio.unlock();
    const code = e.code;
    if (code === 'KeyR') {
      if (this.placing) { if (!e.repeat) this.placing.yaw += Math.PI / 4; }
      else this.rotating = true;
      return;
    }
    if (code === 'Space') { e.preventDefault(); if (!e.repeat) this.app.togglePause(); return; }
    if (e.repeat) return;
    if (code.startsWith('Digit')) {
      const t = TOOLS.find((x) => x.key === code.slice(5));
      if (t) this.setTool(t.id);
      return;
    }
    switch (code) {
      case 'KeyF': if (this.held) this.throwHeld(); break;
      case 'KeyT': this.app.toggleSlowMo(); break;
      case 'KeyH': this.app.toggleHelp(); break;
      case 'Period': this.app.stepOnce(); break;
      case 'Escape': this.cancelPlacement(); this.app.toggleHelp(false); break;
      case 'Delete': case 'Backspace': case 'KeyX': this.deleteHover(); break;
      default: this.rig.keys.add(code);
    }
  }

  keyUp(e) {
    if (e.code === 'KeyR') this.rotating = false;
    this.rig.keys.delete(e.code);
  }

  setTool(id) {
    if (this.tool === id && !this.placing) return;
    this.release();
    this.cancelPlacement();
    this.tool = id;
    this.firing = false;
    this.audio.ui('click');
    this.onChange();
  }

  updateRay() {
    this.rig.ray(this.ndc.x, this.ndc.y, this.ray);
    return this.ray;
  }

  // -------------------------------------------------------------------------
  // Grab
  // -------------------------------------------------------------------------

  grab() {
    const ray = this.updateRay();
    const hit = this.sim.raycast(ray.origin, ray.dir, 120);
    if (!hit || !hit.asm) return;
    const asm = hit.asm;
    const body = asm.body;
    body.wakeUp();
    body.enableCcd(true);
    const t = body.translation();
    const rot = _q.copy(body.rotation());
    const local = hit.point.clone().sub(_a.set(t.x, t.y, t.z)).applyQuaternion(_q2.copy(rot).invert());
    this.held = {
      asm, chunk: hit.chunk, local, dist: hit.distance,
      targetQuat: rot.clone(), pull: 0, tick: 0, anchor: hit.point.clone(), target: hit.point.clone(), force: 0,
    };
    asm.held = true;
    this.beam.visible = true;
    this.dot.visible = true;
    this.audio.ui('click');
  }

  release() {
    if (!this.held) return;
    if (!this.held.asm.removed) this.held.asm.held = false;
    this.held = null;
    this.beam.visible = false;
    this.dot.visible = false;
  }

  throwHeld() {
    const h = this.held;
    if (!h || h.asm.removed) { this.release(); return; }
    const s = this.settings;
    const asm = h.asm;
    const budget = 14 * (s.grabStrength / 2500);
    const dv = s.launchSpeed * Math.min(1, budget / Math.max(asm.mass, 0.01));
    const d = this.ray.dir;
    const b = asm.body;
    const v = b.linvel();
    b.setLinvel({ x: v.x * 0.3 + d.x * dv, y: v.y * 0.3 + d.y * dv + dv * 0.04, z: v.z * 0.3 + d.z * dv }, true);
    this.audio.whoosh(h.anchor, clamp(dv / 40, 0.2, 1));
    this.release();
  }

  /** Runs before every physics substep: drive the carried body towards the cursor. */
  prePhysics(h) {
    const held = this.held;
    if (!held) return;
    let asm = held.asm;
    if (held.chunk && !held.chunk.dead && held.chunk.asm && held.chunk.asm !== asm) {
      // the grabbed part was torn off: keep hold of the part
      const anchor = held.anchor.clone();
      asm.held = false;
      asm = held.asm = held.chunk.asm;
      asm.held = true;
      asm.body.enableCcd(true);
      const t = asm.body.translation();
      held.local.copy(anchor).sub(_a.set(t.x, t.y, t.z)).applyQuaternion(_q.copy(asm.body.rotation()).invert());
      held.targetQuat.copy(_q.copy(asm.body.rotation()));
    }
    if (asm.removed || (held.chunk && held.chunk.dead && !asm.chunks.size)) { this.release(); return; }
    const body = asm.body;
    const s = this.settings;
    const t = body.translation();
    const rot = _q.copy(body.rotation());
    const anchor = held.anchor.copy(held.local).applyQuaternion(rot).add(_a.set(t.x, t.y, t.z));
    const target = held.target.copy(this.ray.origin).addScaledVector(this.ray.dir, held.dist);
    if (target.y < 0.03) target.y = 0.03;
    const m = Math.max(asm.mass, 0.02);
    const w = 13;
    const v = body.velocityAtPoint(anchor);
    const F = _b.copy(target).sub(anchor).multiplyScalar(m * w * w);
    F.x -= v.x * 2 * m * w; F.y -= v.y * 2 * m * w; F.z -= v.z * 2 * m * w;
    if (held.tick % 12 === 0) held.jointed = this.sim.hasJoints(asm);
    // carry the weight too — unless hinges are already doing that
    if (!held.jointed) F.y += m * this.sim.settings.gravity;
    const fl = F.length();
    const maxF = s.grabStrength;
    if (fl > maxF) F.multiplyScalar(maxF / fl);
    held.force = Math.min(fl, maxF);
    body.applyImpulseAtPoint({ x: F.x * h, y: F.y * h, z: F.z * h }, anchor, true);
    // hold orientation (soft angular spring towards the grab-time attitude) —
    // except for anything hanging on hinges, which must stay free to swing
    if (held.jointed) held.targetQuat.copy(rot);
    else {
      const qe = _q2.copy(held.targetQuat).multiply(rot.invert());
      if (qe.w < 0) { qe.x = -qe.x; qe.y = -qe.y; qe.z = -qe.z; qe.w = -qe.w; }
      const ang = 2 * Math.acos(clamp(qe.w, -1, 1));
      const sl = Math.sqrt(Math.max(1 - qe.w * qe.w, 1e-9));
      const I = m * Math.max(asm.radius * asm.radius, 0.0004) * 0.45;
      const wa = 10;
      const av = body.angvel();
      const T = _c.set(qe.x / sl, qe.y / sl, qe.z / sl).multiplyScalar(ang * I * wa * wa);
      T.x -= av.x * 2 * I * wa; T.y -= av.y * 2 * I * wa; T.z -= av.z * 2 * I * wa;
      const maxT = maxF * Math.max(asm.radius, 0.05) * 0.6;
      const tl = T.length();
      if (tl > maxT) T.multiplyScalar(maxT / tl);
      body.applyTorqueImpulse({ x: T.x * h, y: T.y * h, z: T.z * h }, true);
    }
    // a hard, resisted pull loads hinges and joints
    held.tick++;
    if (held.tick % 6 === 0 && held.force > 250 && held.chunk && !held.chunk.dead) {
      const speed = Math.hypot(v.x, v.y, v.z);
      const resisted = clamp(1 - speed / 2.5, 0, 1);
      const J = held.force * 0.02 * resisted;
      if (J > 4) this.sim.pull(held.chunk, anchor, _d.copy(F).normalize(), J);
    }
  }

  // -------------------------------------------------------------------------
  // Launcher / hammer / explosive
  // -------------------------------------------------------------------------

  fire() {
    const ray = this.updateRay();
    const cam = this.rig.camera;
    const right = _a.setFromMatrixColumn(cam.matrixWorld, 0);
    const up = _b.setFromMatrixColumn(cam.matrixWorld, 1);
    const origin = new THREE.Vector3().copy(ray.origin).addScaledVector(ray.dir, 0.7).addScaledVector(right, 0.16).addScaledVector(up, -0.14);
    if (origin.y < 0.2) origin.y = 0.2;
    const hit = this.sim.raycast(ray.origin, ray.dir, 300);
    const aim = hit ? hit.point : _c.copy(ray.origin).addScaledVector(ray.dir, 60);
    const dir = new THREE.Vector3().copy(aim).sub(origin).normalize();
    const sp = this.settings.launchSpeed;
    this.app.launch(this.settings.projectile, origin, dir, sp);
    this.audio.whoosh(origin, clamp(sp / 45, 0.3, 1));
  }

  strike() {
    const ray = this.updateRay();
    const hit = this.sim.raycast(ray.origin, ray.dir, 200);
    if (!hit) return;
    const J = this.settings.hammerImpulse;
    const dir = new THREE.Vector3().copy(ray.dir).multiplyScalar(0.65).addScaledVector(hit.normal, -0.35).normalize();
    this.fx.hammerHit(hit.point, hit.normal, J);
    if (hit.chunk) {
      const c = hit.chunk;
      this.audio.impact(c.sound, hit.point, clamp(0.5 + J / 500, 0.5, 1.4), clamp(c.size, 0.05, 2), c.hollow ? { hollow: true } : undefined);
      this.sim.toolImpact(c, hit.point, dir, J);
    } else {
      this.audio.impact('concrete', hit.point, clamp(0.5 + J / 600, 0.5, 1.3), 1.2);
      this.fx.dustPuff(hit.point, 0xbdb8ae, 8, 0.18, 1.2, 1.4, 0.3);
      this.fx.chips('concrete', hit.point, hit.normal, 8, 3, 1);
    }
  }

  detonate() {
    const ray = this.updateRay();
    const hit = this.sim.raycast(ray.origin, ray.dir, 200);
    if (!hit) return;
    const s = this.settings;
    const center = hit.point.clone().addScaledVector(hit.normal, 0.18);
    this.audio.explosion(center, clamp(s.bombPower / 1200, 0.4, 1.5));
    this.fx.explosion(center, s.bombPower, s.bombRadius);
    this.sim.explode(center, s.bombPower, s.bombRadius);
  }

  // -------------------------------------------------------------------------
  // Placement
  // -------------------------------------------------------------------------

  beginPlacement(type) {
    const entry = PROP_BY_TYPE[type];
    if (!entry) return;
    this.release();
    this.firing = false;
    const def = this.app.previewDef(type);
    const mn = def.bounds.min, mx = def.bounds.max;
    this.ghost.clear();
    const size = new THREE.Vector3().subVectors(mx, mn);
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false })
    );
    box.position.set((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, (mn.z + mx.z) / 2);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: 0xffc400, toneMapped: false }));
    edges.position.copy(box.position);
    // arrow showing which way the prop faces
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 12), new THREE.MeshBasicMaterial({ color: 0xffc400, toneMapped: false }));
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.02, mx.z + 0.22);
    this.ghost.add(box, edges, arrow);
    this.ghost.visible = true;
    this.placing = { type, yaw: 0, valid: false, pos: new THREE.Vector3() };
    this.onChange();
  }

  cancelPlacement() {
    if (!this.placing) return;
    this.placing = null;
    this.ghost.visible = false;
    this.onChange();
  }

  place(keep) {
    const p = this.placing;
    if (!p || !p.valid) return;
    this.app.spawn(p.type, p.pos.clone(), p.yaw, p.pos.y > 0.02);
    if (!keep) this.cancelPlacement();
  }

  deleteHover() {
    const asm = this.hoverAsm;
    if (!asm || asm.removed) return;
    if (this.held && this.held.asm.prop === asm.prop) this.release();
    if (asm.prop) this.sim.removeProp(asm.prop);
    else this.sim.removeAssembly(asm);
    this.setSelect(null);
    this.hoverAsm = null;
    this.audio.ui('click');
  }

  // -------------------------------------------------------------------------
  // Per-frame
  // -------------------------------------------------------------------------

  setSelect(asm) {
    if (this.selectAsm === asm) return;
    if (this.select.parent) this.select.parent.remove(this.select);
    this.selectAsm = asm;
    if (!asm || asm.removed) { this.selectAsm = null; return; }
    // body-local bounds of all chunks
    const mn = new THREE.Vector3(Infinity, Infinity, Infinity), mx = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const c of asm.chunks) {
      const hgt = this.sim.bodyHull(c);
      mn.min(_a.set(hgt.mn[0], hgt.mn[1], hgt.mn[2]));
      mx.max(_a.set(hgt.mx[0], hgt.mx[1], hgt.mx[2]));
    }
    mn.addScalar(-0.012);
    mx.addScalar(0.012);
    const pts = [];
    const ext = [mx.x - mn.x, mx.y - mn.y, mx.z - mn.z];
    const len = ext.map((e) => Math.min(e * 0.22, 0.16));
    for (let i = 0; i < 8; i++) {
      const c = [i & 1 ? mx.x : mn.x, i & 2 ? mx.y : mn.y, i & 4 ? mx.z : mn.z];
      for (let k = 0; k < 3; k++) {
        const e = c.slice();
        e[k] += (i & (1 << k) ? -1 : 1) * len[k];
        pts.push(c[0], c[1], c[2], e[0], e[1], e[2]);
      }
    }
    this.select.geometry.dispose();
    this.select.geometry = new THREE.BufferGeometry();
    this.select.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    asm.group.add(this.select);
    asm.dirty = true;
  }

  update(dt) {
    const ray = this.updateRay();
    // hover
    let hit = null;
    if (this.mouseInside || this.held || this.pointers.size) hit = this.sim.raycast(ray.origin, ray.dir, 250);
    this.hover = hit;
    const hov = this.held ? this.held.asm : hit ? hit.asm : null;
    this.hoverAsm = hov && !hov.removed ? hov : null;
    if (this.selectAsm && this.selectAsm.removed) { this.selectAsm = null; }
    this.setSelect(this.placing ? null : this.hoverAsm);

    // carried-object beam
    if (this.held) {
      const p = this.beam.geometry.attributes.position;
      p.setXYZ(0, this.held.anchor.x, this.held.anchor.y, this.held.anchor.z);
      p.setXYZ(1, this.held.target.x, this.held.target.y, this.held.target.z);
      p.needsUpdate = true;
      this.dot.position.copy(this.held.anchor);
      this.dot.scale.setScalar(0.006 * this.held.anchor.distanceTo(this.rig.camera.position) + 0.004);
    }

    // auto-fire
    if (this.firing && this.tool === 'launch' && !this.app.paused) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) { this.fire(); this.fireTimer = 0.16; }
    }

    // reticle
    const showRet = !this.placing && hit && (this.tool === 'hammer' || this.tool === 'bomb') && this.mouseInside;
    this.reticle.visible = !!showRet;
    if (showRet) {
      const r = this.tool === 'bomb' ? this.settings.bombRadius : 0.05 + 0.012 * hit.distance;
      if (this.tool === 'bomb') {
        this.reticle.position.set(hit.point.x, 0.02, hit.point.z);
        this.reticle.quaternion.setFromUnitVectors(_a.set(0, 0, 1), UP);
      } else {
        this.reticle.position.copy(hit.point).addScaledVector(hit.normal, 0.01);
        this.reticle.quaternion.setFromUnitVectors(_a.set(0, 0, 1), hit.normal);
      }
      this.reticle.scale.setScalar(r);
    }

    // placement ghost follows the cursor
    if (this.placing) {
      const p = this.placing;
      let pos = null;
      if (hit) pos = hit.point;
      else if (ray.dir.y < -0.01) pos = _b.copy(ray.origin).addScaledVector(ray.dir, -ray.origin.y / ray.dir.y);
      p.valid = !!pos && this.mouseInside;
      if (pos) {
        p.pos.set(pos.x, Math.max(0, pos.y) + (pos.y > 0.01 ? 0.004 : 0), pos.z);
        this.ghost.position.copy(p.pos);
        this.ghost.rotation.y = p.yaw;
      }
      this.ghost.visible = p.valid;
    }
  }

  /** Text for the info read-out. */
  describeHover() {
    const asm = this.hoverAsm;
    if (!asm) return null;
    let chunk = this.held ? this.held.chunk : this.hover ? this.hover.chunk : null;
    if (!chunk || chunk.dead) for (const c of asm.chunks) { chunk = c; break; }
    if (!chunk) return null;
    const v = asm.body.linvel();
    return {
      prop: asm.prop ? asm.prop.label : 'Object',
      part: (chunk.name || 'part').replace(/_/g, ' '),
      material: chunk.phys.name,
      mass: asm.mass,
      pieces: asm.chunks.size,
      speed: Math.hypot(v.x, v.y, v.z),
      held: !!this.held,
      force: this.held ? this.held.force : 0,
    };
  }
}

export { PROJECTILES };
