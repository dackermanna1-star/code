// The destruction simulation: rigid bodies (Rapier) whose shapes are made of
// bonded convex "chunks". Impacts load the chunks and the bonds between them;
// overloaded chunks fracture into new chunks, overloaded bonds snap (or bend,
// for metal), and any group of chunks that is no longer connected to the rest
// becomes its own rigid body. Nothing is pre-animated — every piece that comes
// off is produced and moved by the physics.
import * as THREE from 'three';
import * as F from './fracture.js';
import { buildPolyGeometry, boxUV, dentGeometry } from './geometry.js';
import { PHYS } from './materials.js';

const G_WORLD = 0x0001, G_PROP = 0x0002, G_DEBRIS = 0x0004;
const groups = (member, filter) => ((member << 16) | filter) >>> 0;
const GROUP_WORLD = groups(G_WORLD, G_WORLD | G_PROP | G_DEBRIS);
const GROUP_PROP = groups(G_PROP, G_WORLD | G_PROP | G_DEBRIS);
const GROUP_DEBRIS = groups(G_DEBRIS, G_WORLD | G_PROP);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Vector3(), _f = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m3 = new THREE.Matrix3(), _m4 = new THREE.Matrix4();

let nextId = 1;

/** Release-radius multiplier per fracture pattern (how big a hole a blow leaves). */
const RELEASE = { radial: 0.52, tempered: 50, wood: 0.3, chunky: 0.42 };
/** Chunks shorter than this (m) are not fractured any further. */
const MIN_REFRACTURE = { radial: 0.11, tempered: 0.2, wood: 0.22, chunky: 0.07 };

export const QUALITY = {
  low: { substep: 1 / 60, iters: 4, detail: 0.7, maxDebris: 450, maxSub: 3 },
  medium: { substep: 1 / 90, iters: 5, detail: 0.9, maxDebris: 900, maxSub: 4 },
  high: { substep: 1 / 120, iters: 6, detail: 1.0, maxDebris: 1600, maxSub: 5 },
  ultra: { substep: 1 / 240, iters: 8, detail: 1.25, maxDebris: 2800, maxSub: 8 },
};

export class Sim {
  constructor(RAPIER, scene) {
    this.R = RAPIER;
    this.scene = scene;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.events = new RAPIER.EventQueue(true);
    this.asms = new Set();
    this.chunkByHandle = new Map();
    this.joints = new Set();
    this.props = new Set();
    this.debris = [];
    this.dying = new Set();
    this.settling = new Set(); // freshly spawned bodies waiting to be put to sleep
    this.rng = F.makeRng(0xc0ffee);
    this.time = 0;
    this.stepCount = 0;
    this.fx = null;
    this.audio = null;
    this.preStep = null;
    this.settings = { ...QUALITY.high, quality: 'high', strength: 1, gravity: 9.81, debrisCollide: false };
    this.stats = { bodies: 0, awake: 0, chunks: 0, debris: 0, joints: 0, stepMs: 0, fractures: 0 };
    this._evs = [];
    this._contact = { p: new THREE.Vector3(), n: new THREE.Vector3(), found: false };
    this._soundClock = new Map();
    this.applyQuality('high');
    this.createGround();
  }

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  applyQuality(name) {
    const q = QUALITY[name] || QUALITY.high;
    Object.assign(this.settings, q, { quality: name });
    this.world.numSolverIterations = q.iters;
  }

  setGravity(g) {
    this.settings.gravity = g;
    this.world.gravity = { x: 0, y: -g, z: 0 };
    this.wakeAll();
  }

  wakeAll() {
    for (const asm of this.asms) asm.body.wakeUp();
  }

  createGround() {
    const R = this.R;
    // an infinite plane: exact contacts at any distance from the origin
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    const col = this.world.createCollider(
      new R.ColliderDesc(new R.HalfSpace({ x: 0, y: 1, z: 0 })).setFriction(0.9).setRestitution(0.05).setCollisionGroups(GROUP_WORLD),
      body
    );
    this.groundBody = body;
    this.groundCollider = col;
    this.groundHandle = col.handle;
  }

  // -------------------------------------------------------------------------
  // Assemblies (one rigid body + the chunks rigidly bonded into it)
  // -------------------------------------------------------------------------

  createAssembly(o) {
    const R = this.R;
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(o.pos.x, o.pos.y, o.pos.z)
      .setRotation(o.quat)
      .setLinearDamping(0.03)
      .setAngularDamping(0.08)
      .setCanSleep(true);
    if (o.sleeping) desc.setSleeping(true);
    if (o.ccd) desc.setCcdEnabled(true);
    const body = this.world.createRigidBody(desc);
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    group.position.copy(o.pos);
    group.quaternion.copy(o.quat);
    group.updateMatrix();
    this.scene.add(group);
    const asm = {
      id: nextId++, body, group, chunks: new Set(), prop: o.prop || null,
      pl: new THREE.Vector3(), pa: new THREE.Vector3(), pc: new THREE.Vector3().copy(o.pos),
      mass: 0, comL: new THREE.Vector3(), radius: 0.1,
      born: this.time, isDebris: false, dirty: true, lastSound: -1, lastSoundI: 0, name: o.name || '',
      projectile: !!o.projectile, held: false,
    };
    group.userData.asm = asm;
    this.asms.add(asm);
    if (asm.prop) asm.prop.asms.add(asm);
    return asm;
  }

  removeAssembly(asm) {
    if (!this.asms.has(asm)) return;
    for (const c of asm.chunks) {
      this.chunkByHandle.delete(c.collider.handle);
      for (const b of c.bonds) b.broken = true;
      c.bonds.length = 0;
      c.dead = true;
      c.asm = null;
      if (c.mesh) c.mesh.geometry.dispose();
      if (c.prop) c.prop.chunks.delete(c);
    }
    for (const jl of [...this.joints]) {
      if (jl.chunkA.asm === null || jl.chunkB.asm === null || jl.chunkA.dead || jl.chunkB.dead) this.breakJoint(jl, true);
    }
    this.world.removeRigidBody(asm.body);
    this.scene.remove(asm.group);
    asm.chunks.clear();
    this.asms.delete(asm);
    this.dying.delete(asm);
    if (asm.prop) asm.prop.asms.delete(asm);
    asm.removed = true;
  }

  /** Recompute cached mass / centre of mass / classification after chunk changes. */
  finishAssembly(asm) {
    if (!asm.chunks.size) return;
    let m = 0;
    asm.comL.set(0, 0, 0);
    for (const c of asm.chunks) {
      m += c.mass;
      asm.comL.addScaledVector(c.lp, c.mass);
    }
    asm.mass = m;
    if (m > 0) asm.comL.multiplyScalar(1 / m);
    let r = 0;
    for (const c of asm.chunks) r = Math.max(r, c.lp.distanceTo(asm.comL) + c.maxDim * 0.5);
    asm.radius = r;
    const single = asm.chunks.size === 1;
    let first = null;
    for (const c of asm.chunks) { first = c; break; }
    const wasDebris = asm.isDebris;
    asm.isDebris = single && first.gen > 0 && first.mass < 1.2;
    if (asm.isDebris && !wasDebris) this.debris.push(asm);
    const small = asm.isDebris && first.mass < 0.09 && !this.settings.debrisCollide;
    for (const c of asm.chunks) {
      c.collider.setCollisionGroups(c.ghost && !single ? 0 : small ? GROUP_DEBRIS : GROUP_PROP);
      c.collider.setContactForceEventThreshold(clamp(Math.min(c.mass, m) * 9.81 * 3.5, 0.25, 160));
    }
    asm.dirty = true;
  }

  // -------------------------------------------------------------------------
  // Chunks
  // -------------------------------------------------------------------------

  /**
   * Create a chunk and attach it to an assembly.
   * spec: { poly, lp, lq, surf|phys+mats, geometry?, uvFn, uvOff, shape, dims,
   *         mass|density, thick, strengthMul, fracturable, pattern, grain, tags,
   *         bondMul, dentable, name, gen }
   */
  addChunk(asm, spec) {
    const phys = spec.phys;
    const poly = spec.poly;
    const [mn, mx] = F.polyBounds(poly);
    const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    let thin = 0;
    if (ext[1] < ext[thin]) thin = 1;
    if (ext[2] < ext[thin]) thin = 2;
    const maxDim = Math.max(ext[0], ext[1], ext[2]);
    const minDim = ext[thin];
    const volume = spec.volume ?? F.polyMassProps(poly).volume;
    const mass = Math.max(1e-4, spec.mass ?? volume * (spec.density ?? phys.density));
    const pattern = spec.pattern === undefined ? phys.pattern : spec.pattern;
    const gen = spec.gen || 0;
    const thick = spec.thick ?? minDim;
    const chunk = {
      id: nextId++, name: spec.name || '', phys, mats: spec.mats, poly,
      lp: spec.lp.clone(), lq: spec.lq.clone(), asm: null, collider: null, mesh: null,
      bonds: [], mass, volume, ext, thin, maxDim, minDim, thick,
      size: Math.sqrt(maxDim * Math.max(ext[0] + ext[1] + ext[2] - maxDim - minDim, minDim)),
      strength: phys.fracture * Math.pow(Math.max(thick, 1e-4) / phys.refThick, 1.1) * (spec.strengthMul ?? 1),
      strengthMul: spec.strengthMul ?? 1,
      damage: 0, pattern,
      fracturable: spec.fracturable !== false && !!pattern && isFinite(phys.fracture) && maxDim > (spec.minRefracture ?? MIN_REFRACTURE[pattern] ?? 0.1) && gen < 3,
      grain: spec.grain ?? (ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : ext[1] >= ext[2] ? 1 : 2),
      uvFn: spec.uvFn || boxUV(0.5, 1), uvOff: spec.uvOff ? spec.uvOff.slice() : [0, 0, 0],
      shape: spec.shape || 'hull', dims: spec.dims || null, colRot: spec.colRot || null,
      tags: spec.tags || null, bondMul: spec.bondMul ?? 1, dentable: !!spec.dentable,
      prop: asm.prop, gen, dead: false, hull: null, density: spec.density, sound: spec.sound || phys.sound,
      castShadow: spec.castShadow, hollow: !!spec.hollow, releaseMul: spec.releaseMul ?? 1,
      ghost: !!spec.ghost, // no collisions while part of a larger assembly (thin trim, hinge barrels)
    };
    // mesh
    const geo = spec.geometry || buildPolyGeometry(poly, chunk.uvFn, chunk.uvOff);
    const mesh = new THREE.Mesh(geo, spec.mats);
    mesh.position.copy(chunk.lp);
    mesh.quaternion.copy(chunk.lq);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    const isGlass = spec.mats[0].transparent;
    mesh.castShadow = spec.castShadow ?? !isGlass;
    mesh.receiveShadow = true;
    mesh.userData.chunk = chunk;
    chunk.mesh = mesh;
    this.attachChunk(chunk, asm);
    if (chunk.prop) chunk.prop.chunks.add(chunk);
    return chunk;
  }

  attachChunk(chunk, asm) {
    chunk.asm = asm;
    asm.chunks.add(chunk);
    asm.group.add(chunk.mesh);
    chunk.collider = this.buildCollider(chunk, asm.body);
    this.chunkByHandle.set(chunk.collider.handle, chunk);
    asm.dirty = true;
  }

  buildCollider(chunk, body) {
    const R = this.R;
    let desc = null;
    let rot = chunk.lq;
    if (chunk.shape === 'box') {
      const d = chunk.dims;
      desc = R.ColliderDesc.cuboid(Math.max(d[0], 0.003), Math.max(d[1], 0.003), Math.max(d[2], 0.003));
    } else if (chunk.shape === 'cyl') {
      desc = R.ColliderDesc.cylinder(chunk.dims[0], chunk.dims[1]);
      if (chunk.colRot) rot = _q2.copy(chunk.lq).multiply(chunk.colRot);
    } else if (chunk.shape === 'ball') {
      desc = R.ColliderDesc.ball(chunk.dims[0]);
    } else {
      const pts = F.polyPoints(chunk.poly);
      // very thin shards get a minimum collision thickness so they do not tunnel
      if (chunk.minDim < 0.005) {
        const k = chunk.thin, s = 0.005 / Math.max(chunk.minDim, 1e-5);
        for (let i = k; i < pts.length; i += 3) pts[i] *= s;
      }
      desc = R.ColliderDesc.convexHull(new Float32Array(pts));
      if (!desc) {
        desc = R.ColliderDesc.cuboid(Math.max(chunk.ext[0] / 2, 0.003), Math.max(chunk.ext[1] / 2, 0.003), Math.max(chunk.ext[2] / 2, 0.003));
      }
    }
    desc
      .setTranslation(chunk.lp.x, chunk.lp.y, chunk.lp.z)
      .setRotation(rot)
      .setMass(chunk.mass)
      .setFriction(chunk.phys.friction)
      .setRestitution(chunk.phys.restitution)
      .setCollisionGroups(GROUP_PROP)
      .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(clamp(chunk.mass * 9.81 * 3.5, 0.25, 160));
    return this.world.createCollider(desc, body);
  }

  /** Delete a chunk entirely (after it has been replaced by fragments). */
  destroyChunk(chunk) {
    const asm = chunk.asm;
    this.chunkByHandle.delete(chunk.collider.handle);
    this.world.removeCollider(chunk.collider, false);
    if (asm) {
      asm.chunks.delete(chunk);
      asm.group.remove(chunk.mesh);
      asm.dirty = true;
    }
    chunk.mesh.geometry.dispose();
    for (const b of chunk.bonds) {
      b.broken = true;
      const o = b.a === chunk ? b.b : b.a;
      const i = o.bonds.indexOf(b);
      if (i >= 0) o.bonds.splice(i, 1);
    }
    chunk.bonds.length = 0;
    chunk.dead = true;
    chunk.asm = null;
    if (chunk.prop) chunk.prop.chunks.delete(chunk);
  }

  /** Hull of a chunk in its body's local space (cached). */
  bodyHull(chunk) {
    if (chunk.hull) return chunk.hull;
    _m3.setFromMatrix4(_m4.makeRotationFromQuaternion(chunk.lq));
    const e = _m3.elements; // column-major
    const rot = [e[0], e[3], e[6], e[1], e[4], e[7], e[2], e[5], e[8]];
    chunk.hull = F.makeHull(chunk.poly, rot, [chunk.lp.x, chunk.lp.y, chunk.lp.z]);
    return chunk.hull;
  }

  // -------------------------------------------------------------------------
  // Bonds
  // -------------------------------------------------------------------------

  addBond(a, b, strength, anchor, area, opts) {
    const ductile = opts?.ductile ?? (!!a.phys.ductile && !!b.phys.ductile);
    const bond = {
      a, b, strength, base: strength, anchor: anchor.clone(), size: Math.sqrt(Math.max(area, 1e-6)),
      ductile, bend: 0, maxBend: opts?.maxBend ?? 0.95, broken: false,
    };
    a.bonds.push(bond);
    b.bonds.push(bond);
    return bond;
  }

  jointStrength(a, b, area) {
    return Math.min(a.phys.joint, b.phys.joint) * Math.sqrt(area) * Math.min(a.bondMul, b.bondMul) * this.settings.strength;
  }

  /** Bond every pair of touching chunks in the list. */
  autoBond(chunks, eps = 0.0025) {
    const n = chunks.length;
    for (let i = 0; i < n; i++) {
      const A = chunks[i];
      if (A.bondMul <= 0) continue;
      const ha = this.bodyHull(A);
      for (let j = i + 1; j < n; j++) {
        const B = chunks[j];
        if (B.bondMul <= 0) continue;
        const ct = F.hullContact(ha, this.bodyHull(B), eps);
        if (!ct) continue;
        this.addBond(A, B, this.jointStrength(A, B, ct.area), _a.set(ct.anchor[0], ct.anchor[1], ct.anchor[2]), ct.area);
      }
    }
  }

  breakBond(b) {
    if (b.broken) return;
    b.broken = true;
    let i = b.a.bonds.indexOf(b);
    if (i >= 0) b.a.bonds.splice(i, 1);
    i = b.b.bonds.indexOf(b);
    if (i >= 0) b.b.bonds.splice(i, 1);
  }

  // -------------------------------------------------------------------------
  // Hinges / latches (real joints between separate bodies)
  // -------------------------------------------------------------------------

  /**
   * o: { chunkA, chunkB, anchorA, anchorB (chunk-local Vector3), strength,
   *      kind:'hinge'|'latch', axisA (chunk-local of A, hinge axis), span }
   */
  addJoint(o) {
    const jl = {
      chunkA: o.chunkA, chunkB: o.chunkB, anchorA: o.anchorA.clone(), anchorB: o.anchorB.clone(),
      strength: o.strength * this.settings.strength, base: o.strength * this.settings.strength,
      kind: o.kind || 'hinge', axisA: o.axisA ? o.axisA.clone() : null, span: o.span || 0,
      joint: null, broken: false, prop: o.chunkA.prop, pull: 0, sound: o.sound || 'metal',
    };
    this.joints.add(jl);
    this.rebuildJoint(jl);
    return jl;
  }

  rebuildJoint(jl) {
    if (jl.joint) {
      try { this.world.removeImpulseJoint(jl.joint, true); } catch (e) { /* body already gone */ }
      jl.joint = null;
    }
    if (jl.broken) return;
    const A = jl.chunkA, B = jl.chunkB;
    if (!A.asm || !B.asm || A.dead || B.dead) { this.breakJoint(jl, true); return; }
    jl.jA = A.asm;
    jl.jB = B.asm;
    if (A.asm === B.asm) return; // rigidly connected for now
    const a1 = _a.copy(jl.anchorA).applyQuaternion(A.lq).add(A.lp);
    const a2 = _b.copy(jl.anchorB).applyQuaternion(B.lq).add(B.lp);
    const data = this.R.JointData.spherical({ x: a1.x, y: a1.y, z: a1.z }, { x: a2.x, y: a2.y, z: a2.z });
    jl.joint = this.world.createImpulseJoint(data, A.asm.body, B.asm.body, true);
  }

  breakJoint(jl, silent) {
    if (jl.broken) return;
    jl.broken = true;
    if (jl.joint) {
      try { this.world.removeImpulseJoint(jl.joint, true); } catch (e) { /* ignore */ }
      jl.joint = null;
    }
    this.joints.delete(jl);
    if (!silent && jl.chunkA.asm) {
      const p = this.chunkPointWorld(jl.chunkA, jl.anchorA, _f);
      if (this.audio) this.audio.fracture(jl.sound, p, jl.kind === 'latch' ? 0.35 : 0.7, 0.2);
      if (this.fx) this.fx.jointBreak(p, jl.kind);
      if (jl.prop?.behavior?.onJointBreak) jl.prop.behavior.onJointBreak(jl);
    }
  }

  jointAnchorWorld(jl, out) {
    return this.chunkPointWorld(jl.chunkA, jl.anchorA, out);
  }

  /** Load the joints of an assembly with an impulse applied at a world point. */
  stressJoints(asm, pointW, J, dirW, noFatigue) {
    if (!this.joints.size) return 0;
    let list = null;
    for (const jl of this.joints) {
      if (jl.broken) continue;
      if (jl.chunkA.asm === asm || jl.chunkB.asm === asm) (list || (list = [])).push(jl);
    }
    if (!list) return 0;
    // weakest first: a latch gives way before the hinges take the load
    list.sort((x, y) => x.strength - y.strength);
    let broke = 0;
    let latched = list.some((j) => j.kind === 'latch');
    for (const jl of list) {
      const other = jl.chunkA.asm === asm ? jl.chunkB.asm : jl.chunkA.asm;
      if (!other || other === asm) continue;
      const aw = this.jointAnchorWorld(jl, _f);
      const dist = aw.distanceTo(pointW);
      const ratio = Math.max(0.5, other.mass / (other.mass + asm.mass));
      let geom;
      if (jl.kind === 'latch') {
        geom = clamp(1.1 - dist / 1.6, 0.35, 1);
      } else if (jl.span > 0 && jl.axisA && !latched) {
        // free-swinging door: reaction at the hinge line vanishes at the centre of percussion
        const ax = _e.copy(jl.axisA).applyQuaternion(jl.chunkA.lq).applyQuaternion(_q.copy(jl.chunkA.asm.body.rotation()));
        const rel = _d.copy(pointW).sub(aw);
        const along = rel.dot(ax);
        const x = Math.sqrt(Math.max(0, rel.lengthSq() - along * along));
        geom = clamp(Math.abs(1 - (1.5 * x) / jl.span), 0.18, 1) * clamp(1.15 - Math.abs(along) / 1.4, 0.45, 1);
      } else {
        geom = clamp(1.05 - dist / 2.2, 0.4, 1) * 0.7;
      }
      const s = J * ratio * geom * (0.85 + 0.3 * this.rng());
      if (s > jl.strength) {
        this.breakJoint(jl);
        broke++;
        if (jl.kind === 'latch') latched = false;
      } else {
        if (!noFatigue) jl.strength = Math.max(jl.base * 0.3, jl.strength - s * 0.12);
      }
    }
    return broke;
  }

  // -------------------------------------------------------------------------
  // Props
  // -------------------------------------------------------------------------

  /** Instantiate a prop definition (see props/builder.js) at a world position. */
  spawnProp(def, pos, yaw = 0, opts = {}) {
    const prop = {
      id: nextId++, type: def.type, label: def.label, asms: new Set(), chunks: new Set(),
      byName: new Map(), behavior: null, def, born: this.time,
    };
    const quat = new THREE.Quaternion().setFromAxisAngle(_a.set(0, 1, 0), yaw);
    const origin = new THREE.Vector3(pos.x, pos.y, pos.z);
    const partToChunk = new Map();
    for (const bodyDef of def.bodies) {
      if (!bodyDef.parts.length) continue;
      const asm = this.createAssembly({ pos: origin, quat, prop, sleeping: !opts.awake && bodyDef.sleeping !== false, ccd: !!bodyDef.ccd, name: bodyDef.name, projectile: bodyDef.projectile });
      const list = [];
      for (const part of bodyDef.parts) {
        const chunk = this.addChunk(asm, part);
        partToChunk.set(part, chunk);
        if (part.name) prop.byName.set(part.name, chunk);
        list.push(chunk);
      }
      if (!bodyDef.noBond && list.length > 1) this.autoBond(list);
      this.finishAssembly(asm);
      if (!opts.awake && bodyDef.sleeping !== false) {
        // Rapier wakes a body when colliders are attached; let it take one step, then park it
        asm.settle = 1;
        this.settling.add(asm);
      }
      if (opts.linvel) asm.body.setLinvel(opts.linvel, true);
      if (opts.angvel) asm.body.setAngvel(opts.angvel, true);
    }
    for (const bd of def.bonds || []) {
      const A = partToChunk.get(bd.a), B = partToChunk.get(bd.b);
      if (!A || !B || A.asm !== B.asm) continue;
      const existing = A.bonds.find((x) => x.a === B || x.b === B);
      if (existing) {
        if (bd.strength !== undefined) existing.strength = existing.base = bd.strength * this.settings.strength;
        if (bd.ductile !== undefined) existing.ductile = bd.ductile;
        if (bd.maxBend !== undefined) existing.maxBend = bd.maxBend;
      } else {
        const anchor = bd.anchor ? _a.set(bd.anchor[0], bd.anchor[1], bd.anchor[2]) : _a.copy(A.lp).add(B.lp).multiplyScalar(0.5);
        this.addBond(A, B, (bd.strength ?? 50) * this.settings.strength, anchor, bd.area ?? 0.001, bd);
      }
    }
    for (const jd of def.joints || []) {
      const A = partToChunk.get(jd.a), B = partToChunk.get(jd.b);
      if (!A || !B) continue;
      const p = _c.set(jd.anchor[0], jd.anchor[1], jd.anchor[2]);
      const la = p.clone().sub(A.lp).applyQuaternion(_q.copy(A.lq).invert());
      const lb = p.clone().sub(B.lp).applyQuaternion(_q.copy(B.lq).invert());
      const axisA = jd.axis ? new THREE.Vector3(jd.axis[0], jd.axis[1], jd.axis[2]).applyQuaternion(_q.copy(A.lq).invert()) : null;
      this.addJoint({ chunkA: A, chunkB: B, anchorA: la, anchorB: lb, strength: jd.strength, kind: jd.kind, axisA, span: jd.span, sound: jd.sound });
    }
    if (def.behavior) prop.behavior = def.behavior(prop, this);
    this.props.add(prop);
    return prop;
  }

  removeProp(prop) {
    for (const asm of [...prop.asms]) this.removeAssembly(asm);
    this.props.delete(prop);
    this.debris = this.debris.filter((a) => !a.removed);
  }

  clearAll() {
    for (const asm of [...this.asms]) this.removeAssembly(asm);
    this.props.clear();
    this.joints.clear();
    this.debris.length = 0;
    this.dying.clear();
    this.settling.clear();
  }

  /** Remove loose fragments but keep everything still recognisable. */
  clearDebris() {
    for (const asm of [...this.debris]) if (!asm.removed) this.removeAssembly(asm);
    this.debris.length = 0;
    for (const prop of [...this.props]) if (!prop.asms.size) this.props.delete(prop);
  }

  // -------------------------------------------------------------------------
  // Queries / helpers
  // -------------------------------------------------------------------------

  chunkPointWorld(chunk, local, out) {
    const body = chunk.asm.body;
    const t = body.translation();
    out.copy(local).applyQuaternion(chunk.lq).add(chunk.lp).applyQuaternion(_q.copy(body.rotation()));
    out.x += t.x; out.y += t.y; out.z += t.z;
    return out;
  }

  chunkCenterWorld(chunk, out) {
    const body = chunk.asm.body;
    const t = body.translation();
    out.copy(chunk.lp).applyQuaternion(_q.copy(body.rotation()));
    out.x += t.x; out.y += t.y; out.z += t.z;
    return out;
  }

  asmComWorld(asm, out) {
    const t = asm.body.translation();
    out.copy(asm.comL).applyQuaternion(_q.copy(asm.body.rotation()));
    out.x += t.x; out.y += t.y; out.z += t.z;
    return out;
  }

  raycast(origin, dir, maxDist = 200, excludeBody = null) {
    const ray = new this.R.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, undefined, undefined, excludeBody || undefined);
    if (!hit) return null;
    const point = new THREE.Vector3(origin.x + dir.x * hit.timeOfImpact, origin.y + dir.y * hit.timeOfImpact, origin.z + dir.z * hit.timeOfImpact);
    const chunk = this.chunkByHandle.get(hit.collider.handle) || null;
    return {
      point, normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z), distance: hit.timeOfImpact,
      chunk, asm: chunk ? chunk.asm : null, ground: hit.collider.handle === this.groundHandle,
    };
  }

  // -------------------------------------------------------------------------
  // Stepping
  // -------------------------------------------------------------------------

  step(dt) {
    if (dt <= 0) return;
    const t0 = performance.now();
    const s = this.settings;
    const n = Math.min(s.maxSub, Math.max(1, Math.ceil(dt / s.substep - 1e-4)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.substep(h);
    this.stats.stepMs = performance.now() - t0;
  }

  substep(h) {
    if (this.preStep) this.preStep(h);
    let awake = 0;
    for (const asm of this.asms) {
      const b = asm.body;
      if (b.isSleeping()) {
        asm.pl.set(0, 0, 0);
        asm.pa.set(0, 0, 0);
        asm.sleeping = true;
      } else {
        const v = b.linvel(), w = b.angvel();
        asm.pl.set(v.x, v.y, v.z);
        asm.pa.set(w.x, w.y, w.z);
        this.asmComWorld(asm, asm.pc);
        asm.sleeping = false;
        awake++;
      }
    }
    this.stats.awake = awake;
    this.world.timestep = h;
    this.world.step(this.events);
    this.time += h;
    this.stepCount++;

    const evs = this._evs;
    evs.length = 0;
    this.events.drainContactForceEvents((e) => {
      evs.push(e.collider1(), e.collider2(), e.totalForceMagnitude());
    });
    for (let i = 0; i < evs.length; i += 3) this.handleContact(evs[i], evs[i + 1], evs[i + 2], h);
    if (this.settling.size) {
      for (const asm of this.settling) {
        if (asm.removed) { this.settling.delete(asm); continue; }
        if (--asm.settle > 0) continue;
        this.settling.delete(asm);
        asm.settle = 0;
        const v = asm.body.linvel();
        if (v.x * v.x + v.y * v.y + v.z * v.z < 0.09) {
          asm.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
          asm.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
          asm.body.sleep();
        }
      }
    }

    if (this.stepCount % 20 === 0) this.housekeeping();
  }

  housekeeping() {
    // drop anything that left the test ground
    for (const asm of this.asms) {
      const t = asm.body.translation();
      if (t.y < -30 || Math.abs(t.x) > 380 || Math.abs(t.z) > 380) {
        asm.dieAt = this.time - 1;
        this.dying.add(asm);
      }
    }
    // debris budget: retire the oldest loose fragments first
    const max = this.settings.maxDebris;
    if (this.debris.length > max) {
      this.debris = this.debris.filter((a) => !a.removed);
      let over = this.debris.length - max;
      for (let i = 0; i < this.debris.length && over > 0; i++) {
        const a = this.debris[i];
        if (a.held || this.dying.has(a)) continue;
        a.dieAt = this.time + 0.35;
        this.dying.add(a);
        over--;
      }
    }
    for (const prop of this.props) if (!prop.asms.size) this.props.delete(prop);
  }

  /** Copy body transforms to the render objects. Call once per frame. */
  sync(dt) {
    let chunks = 0;
    for (const asm of this.asms) {
      chunks += asm.chunks.size;
      const b = asm.body;
      const asleep = b.isSleeping();
      if (!asm.dirty && asleep && asm.syncedAsleep) continue;
      asm.syncedAsleep = asleep;
      const t = b.translation(), r = b.rotation();
      asm.group.position.set(t.x, t.y, t.z);
      asm.group.quaternion.set(r.x, r.y, r.z, r.w);
      asm.group.updateMatrix();
      asm.dirty = false;
    }
    if (this.dying.size) {
      for (const asm of [...this.dying]) {
        const k = (asm.dieAt - this.time) / 0.35;
        if (k <= 0) {
          this.removeAssembly(asm);
          const i = this.debris.indexOf(asm);
          if (i >= 0) this.debris.splice(i, 1);
        } else {
          asm.group.scale.setScalar(clamp(k, 0.02, 1));
          asm.group.updateMatrix();
        }
      }
    }
    for (const prop of this.props) if (prop.behavior?.update) prop.behavior.update(dt);
    const st = this.stats;
    st.bodies = this.asms.size;
    st.chunks = chunks;
    st.debris = this.debris.length;
    st.joints = this.joints.size;
  }

  // -------------------------------------------------------------------------
  // Contact handling
  // -------------------------------------------------------------------------

  handleContact(h1, h2, force, h) {
    const ca = this.chunkByHandle.get(h1), cb = this.chunkByHandle.get(h2);
    const ga = h1 === this.groundHandle, gb = h2 === this.groundHandle;
    if ((!ca && !ga) || (!cb && !gb)) return;
    if ((ca && ca.dead) || (cb && cb.dead)) return;
    const asmA = ca ? ca.asm : null, asmB = cb ? cb.asm : null;
    if (asmA === asmB) return;
    if ((asmA && asmA.settle) || (asmB && asmB.settle)) return;
    const J = force * h;
    if (J < 0.003) return;
    const slowA = !asmA || (asmA.pl.lengthSq() < 0.04 && asmA.pa.lengthSq() < 0.4);
    const slowB = !asmB || (asmB.pl.lengthSq() < 0.04 && asmB.pa.lengthSq() < 0.4);
    if (slowA && slowB && J < 30) return;

    // contact point + normal
    const ct = this._contact;
    ct.found = false;
    const colA = ca ? ca.collider : this.groundCollider;
    const colB = cb ? cb.collider : this.groundCollider;
    this.world.contactPair(colA, colB, (m) => {
      if (ct.found) return;
      if (m.numSolverContacts() > 0) {
        const p = m.solverContactPoint(0);
        if (p) { ct.p.set(p.x, p.y, p.z); ct.found = true; }
      }
      const n = m.normal();
      ct.n.set(n.x, n.y, n.z);
    });
    const P = ct.p, N = ct.n;
    if (!ct.found) {
      const small = !ca ? cb : !cb ? ca : ca.mass < cb.mass ? ca : cb;
      this.chunkCenterWorld(small, P);
      if (ga || gb) P.y = Math.max(0, P.y - small.minDim * 0.5);
      N.set(0, 1, 0);
    }
    // pre-impact relative velocity at the contact (A relative to B)
    const vA = _a.set(0, 0, 0), vB = _b.set(0, 0, 0);
    if (asmA) vA.copy(P).sub(asmA.pc).cross(asmA.pa).negate().add(asmA.pl);
    if (asmB) vB.copy(P).sub(asmB.pc).cross(asmB.pa).negate().add(asmB.pl);
    const vrel = _c.copy(vA).sub(vB);
    let vn = vrel.dot(N);
    if (N.lengthSq() < 0.5) { N.copy(vrel).normalize(); vn = vrel.length(); }
    if (vn < 0) { N.negate(); vn = -vn; }
    if (vn < 0.05 && vrel.lengthSq() < 0.01) {
      // resting contact: orient the normal from A towards B
      if (ga) N.set(0, 1, 0);
      else if (gb) N.set(0, -1, 0);
    }
    const gate = clamp(vn / 0.8, 0.1, 1);
    const Jeff = J * gate;
    if (Jeff < 0.004) return;

    const physA = ca ? ca.phys : PHYS.concrete, physB = cb ? cb.phys : PHYS.concrete;
    this.impactFeedback(ca, cb, asmA, asmB, P, N, Jeff, vn);

    const JA = Jeff * (0.3 + 0.7 * clamp(physB.hardness / physA.hardness, 0, 1));
    const JB = Jeff * (0.3 + 0.7 * clamp(physA.hardness / physB.hardness, 0, 1));
    const Pw = P.clone(), Nw = N.clone(), Vr = vrel.clone();
    const resB = cb ? this.applyImpact(cb, Pw, Nw, JB) : null;
    const resA = ca && !ca.dead ? this.applyImpact(ca, Pw, _d.copy(Nw).negate().clone(), JA) : null;
    if (resB && resB.broke) this.afterBreak(resB, asmB, asmA, Pw, Nw, Vr, vn, JB);
    if (resA && resA.broke) this.afterBreak(resA, asmA, asmB, Pw, Nw.clone().negate(), Vr.clone().negate(), vn, JA);
  }

  /** Sound + small visual feedback for a collision (no damage). */
  impactFeedback(ca, cb, asmA, asmB, P, N, J, vn) {
    const energy = J * Math.max(vn, 0.35);
    const intensity = clamp(0.3 * Math.pow(energy, 0.4), 0, 1.4);
    if (intensity < 0.05) return;
    const now = this.time;
    const audio = this.audio;
    for (let k = 0; k < 2; k++) {
      const c = k ? cb : ca, asm = k ? asmB : asmA;
      if (!c) continue;
      if (now - asm.lastSound < 0.07 && intensity < asm.lastSoundI * 1.3) continue;
      asm.lastSound = now;
      asm.lastSoundI = intensity;
      if (!audio) continue;
      if (asm.isDebris && c.mass < 0.06) audio.debris(c.sound, P, intensity * 1.6);
      else audio.impact(c.sound, P, intensity, clamp(c.size, 0.03, 2), c.hollow ? { hollow: true } : undefined);
    }
    if ((!ca || !cb) && audio && intensity > 0.3) {
      const c = ca || cb;
      if (c.mass > 1.5) audio.impact('concrete', P, intensity * 0.55, clamp(c.size * 1.5, 0.2, 2));
    }
    if (this.fx) this.fx.impact(ca ? ca.phys : PHYS.concrete, cb ? cb.phys : PHYS.concrete, P, N, J, vn, !ca || !cb);
  }

  /**
   * After something broke in a collision: the solver already bounced the two
   * bodies off each other as if nothing had given way. Hand back the share of
   * momentum that the break did not absorb, and throw the loosened pieces.
   */
  afterBreak(res, brokenAsm, impactor, P, N, vrel, vn, J) {
    const k = clamp(1 - res.thr / Math.max(J, 1e-6), 0, 0.9) * 0.92;
    if (k > 0.02) {
      for (const asm of [impactor, brokenAsm]) {
        if (!asm || asm.removed) continue;
        const b = asm.body;
        const lv = b.linvel(), av = b.angvel();
        b.setLinvel({ x: lv.x + (asm.pl.x - lv.x) * k, y: lv.y + (asm.pl.y - lv.y) * k, z: lv.z + (asm.pl.z - lv.z) * k }, true);
        b.setAngvel({ x: av.x + (asm.pa.x - av.x) * k, y: av.y + (asm.pa.y - av.y) * k, z: av.z + (asm.pa.z - av.z) * k }, true);
      }
    }
    if (!res.released.length) return;
    const mA = impactor ? impactor.mass : 0;
    // only what lies in the impactor's path is carried along with it
    const r0 = impactor ? clamp(impactor.radius * 1.25 + 0.04, 0.06, 0.7) : 0.1 + 0.3 * clamp(J / (res.thr * 5 + 1e-6), 0, 1.5);
    const rng = this.rng;
    for (const R of res.released) {
      if (R.removed) continue;
      const com = this.asmComWorld(R, _a);
      const rel = _b.copy(com).sub(P);
      const d = rel.length();
      const w = Math.exp(-(d * d) / (r0 * r0));
      const b = R.body;
      const lv = b.linvel();
      // carry on with (part of) the pre-impact motion of the parent
      const pre = _c.copy(com).sub(R.pc).cross(R.pa).negate().add(R.pl);
      const keep = k * 0.7;
      let vx = lv.x + (pre.x - lv.x) * keep, vy = lv.y + (pre.y - lv.y) * keep, vz = lv.z + (pre.z - lv.z) * keep;
      // pushed along by the impactor
      const ratio = impactor ? mA / (mA + R.mass) : 0;
      const push = vn * 0.9 * w * ratio;
      vx += N.x * push; vy += N.y * push; vz += N.z * push;
      // scattered sideways from the point of impact
      const along = rel.dot(N);
      const side = _d.copy(rel).addScaledVector(N, -along);
      const sl = side.length();
      if (sl > 1e-4) {
        const sp = (vn * 0.28 * (0.3 + rng()) * Math.max(w, 0.25)) / sl;
        vx += side.x * sp; vy += side.y * sp; vz += side.z * sp;
      }
      const j = vn * 0.07;
      vx += (rng() - 0.5) * j; vy += (rng() - 0.5) * j; vz += (rng() - 0.5) * j;
      b.setLinvel({ x: vx, y: vy, z: vz }, true);
      const av = b.angvel();
      const spin = Math.min(25, (vn * (0.6 + w * 2.2)) / Math.max(R.radius * 4, 0.12));
      b.setAngvel({ x: av.x + (rng() - 0.5) * spin, y: av.y + (rng() - 0.5) * spin, z: av.z + (rng() - 0.5) * spin }, true);
    }
  }

  // -------------------------------------------------------------------------
  // Damage model
  // -------------------------------------------------------------------------

  /**
   * Apply a blow of impulse J (N·s) to a chunk at world point P along unit
   * direction D. Returns { broke, thr, released[], fractured }.
   */
  applyImpact(chunk, P, D, J) {
    const asm = chunk.asm;
    if (!asm || chunk.dead) return null;
    const res = { broke: false, thr: Infinity, released: [], fractured: false };
    if (J <= 0) return res;
    const body = asm.body;
    const prop = chunk.prop;
    // body-local impact point / direction
    const t = body.translation();
    const qb = _q.copy(body.rotation()).invert();
    const pB = new THREE.Vector3(P.x - t.x, P.y - t.y, P.z - t.z).applyQuaternion(qb);
    const dB = new THREE.Vector3().copy(D).applyQuaternion(qb);

    if (this.debug && J > 0.5) this.debug.push({ t: +this.time.toFixed(3), ev: 'impact', part: chunk.name, J: +J.toFixed(1), thr: +(chunk.strength * (1 - chunk.damage)).toFixed(1), bonds: chunk.bonds.length, fr: chunk.fracturable });
    const jointsBroken = this.stressJoints(asm, P, J, D);

    let hit = chunk;
    let seeds = null;
    const thr = chunk.strength * this.settings.strength * (1 - chunk.damage);
    if (chunk.fracturable && J > thr) {
      const frags = this.fractureChunk(chunk, pB, dB, J / Math.max(thr, 1e-6), P, D);
      if (frags) {
        res.fractured = true;
        res.broke = true;
        res.thr = thr;
        // continue the shock from the fragment that was actually struck
        let best = null, bd = Infinity;
        for (const f of frags) {
          const d = f.lp.distanceToSquared(pB);
          if (d < bd) { bd = d; best = f; }
        }
        hit = best; // null when the chunk was reduced to dust
        if (!hit || !hit.bonds.length) {
          // the struck fragment came loose: the blow still loads everything the chunk was joined to
          const old = this._oldBonds;
          let total = 0;
          for (const x of old) total += x.s;
          seeds = [];
          for (const x of old) {
            if (x.o.dead || !x.o.asm) continue;
            const beta = Math.min(chunk.phys.brittle || 0, x.o.phys.brittle || 0);
            const stress = J * Math.pow(x.s / total, 1 - beta);
            const br = Math.min(chunk.phys.shock, x.o.phys.shock);
            const passed = (Math.min(stress, x.s) * 0.5 + Math.max(0, stress - x.s) * br * br) * br;
            if (passed > 0.02) seeds.push(x.o, passed, 1);
          }
          if (!seeds.length) seeds = null;
          hit = seeds ? seeds[0] : null;
        }
      }
    } else if (chunk.fracturable) {
      chunk.damage = Math.min(0.8, chunk.damage + (chunk.phys.fatigue * J) / Math.max(chunk.strength, 1e-6));
    }
    if (hit && !hit.dead && hit.dentable && J > 14) this.dent(hit, pB, dB, J);

    if (hit && !hit.dead && (seeds || hit.bonds.length)) {
      const sh = this.propagateShock(hit, J, pB, dB, false, seeds);
      // cracks run on into neighbouring pieces that took more than they can bear
      if (sh.crack.length) {
        const body2 = asm.body;
        const t2 = body2.translation();
        const q2 = new THREE.Quaternion().copy(body2.rotation());
        let n = 0;
        for (let i = 0; i < sh.crack.length && n < 14; i += 2) {
          const c = sh.crack[i], j = sh.crack[i + 1];
          if (c.dead || c.asm !== asm || !c.fracturable) continue;
          const cthr = c.strength * this.settings.strength * (1 - c.damage);
          const toward = new THREE.Vector3().copy(pB).sub(c.lp);
          const dl = toward.length();
          const cp = new THREE.Vector3().copy(c.lp).addScaledVector(toward, dl > 1e-6 ? Math.min(1, (c.maxDim * 0.5) / dl) : 0);
          const cw = cp.clone().applyQuaternion(q2);
          cw.x += t2.x; cw.y += t2.y; cw.z += t2.z;
          if (this.fractureChunk(c, cp, dB, j / Math.max(cthr, 1e-6), cw, D, true)) {
            n++;
            res.broke = true;
            res.fractured = true;
            res.thr = Math.min(res.thr, cthr);
          }
        }
      }
      if (this.debug && (sh.broken || sh.crack.length || sh.bent)) this.debug.push({ ev: 'shock', part: hit.name, broken: sh.broken, absorbed: +sh.absorbed.toFixed(1), crack: sh.crack.length / 2, bent: +sh.bent.toFixed(2) });
      if (sh.broken > 0) {
        res.broke = true;
        res.thr = Math.min(res.thr, Math.max(sh.absorbed, 0.01));
        if (!res.fractured) {
          const ph = sh.phys || hit.phys;
          if (this.audio) this.audio.fracture(ph.sound, P, clamp(0.35 + sh.absorbed / 160, 0.3, 1.1), clamp(hit.size, 0.05, 1.5));
          if (this.fx) this.fx.snap(ph, P, D, sh.absorbed);
        }
      }
      if (sh.bent && this.audio) this.audio.bend(P, clamp(sh.bent * 2.5, 0.3, 1.2), clamp(hit.size, 0.1, 1.5));
    }
    if (res.broke) res.released = this.resolveAssembly(asm);
    else if (jointsBroken) {
      res.broke = true;
      res.thr = Math.min(res.thr, J * 0.5);
    }
    if (res.broke && prop?.behavior?.onDamage) prop.behavior.onDamage(P, J, res);
    return res;
  }

  /** Permanent dent in a sheet-metal panel. */
  dent(chunk, pB, dB, J) {
    const inv = _q.copy(chunk.lq).invert();
    const lp = _a.copy(pB).sub(chunk.lp).applyQuaternion(inv);
    const ld = _b.copy(dB).applyQuaternion(inv);
    const radius = clamp(0.06 + J * 0.0011, 0.06, 0.3);
    const depth = clamp(J * 0.00035, 0.004, 0.07);
    if (dentGeometry(chunk.mesh.geometry, lp, ld, radius, depth)) {
      if (this.audio && J > 40) this.audio.bend(this.chunkCenterWorld(chunk, _c), clamp(J / 300, 0.25, 0.9), chunk.size);
    }
  }

  /**
   * Replace a chunk with fragments following its material's fracture pattern.
   * Fragments near the impact come loose; the rest stay bonded to each other
   * and to whatever the original chunk was attached to (cracked but standing).
   */
  fractureChunk(chunk, pB, dB, intensity, Pw, Dw, secondary) {
    const asm = chunk.asm;
    const phys = chunk.phys;
    const detail = this.settings.detail;
    const rng = this.rng;
    const inv = _q.copy(chunk.lq).invert();
    const lp = _a.copy(pB).sub(chunk.lp).applyQuaternion(inv);
    const impact = [lp.x, lp.y, lp.z];
    const [mn, mx] = F.polyBounds(chunk.poly);
    for (let k = 0; k < 3; k++) impact[k] = clamp(impact[k], mn[k], mx[k]);
    const pattern = chunk.pattern;
    const budget = this.settings.maxDebris * 2.2 - this.stats.chunks;
    let polys = null;
    const thin = chunk.thin;
    const a = (thin + 1) % 3, b = (thin + 2) % 3;
    if (pattern === 'radial') {
      const reach = Math.hypot(mx[a] - mn[a], mx[b] - mn[b]) * 1.05;
      const big = chunk.maxDim > 0.35;
      const cells = F.radialCells(impact[a], impact[b], reach, rng, {
        sectors: Math.round(clamp((big ? 8 : 5) + intensity * 0.9, 5, 12) * Math.sqrt(detail)),
        r0: clamp(chunk.maxDim * 0.05, 0.016, 0.065) / Math.sqrt(detail),
        growth: big ? 1.72 : 1.9,
        jitter: 0.34,
        splitRings: budget < 150 ? [9] : big ? [2, 4] : [3],
      });
      polys = F.fractureByCells(chunk.poly, thin, cells);
    } else if (pattern === 'tempered') {
      const cell = clamp(chunk.maxDim / 9, 0.028, 0.06) / Math.sqrt(detail);
      polys = F.fractureByCells(chunk.poly, thin, F.voronoiCells(mn[a], mn[b], mx[a], mx[b], cell, rng));
    } else if (pattern === 'wood') {
      polys = F.fractureWood(chunk.poly, chunk.grain, impact, intensity * Math.sqrt(detail), rng);
    } else {
      const sizeF = clamp(chunk.maxDim / 0.14, 0.5, 2.2);
      const count = Math.round(clamp((2.2 + intensity * 1.6) * detail * sizeF, 2, chunk.gen > 0 ? 4 : 14));
      polys = F.fractureChunky(chunk.poly, impact, count, rng, { focus: 1.3 });
    }
    if (!polys || polys.length < 2) return null;

    const frags = [];
    const hulls = [];
    const dustPts = [];
    const releaseR = (RELEASE[pattern] ?? 0.4) * chunk.releaseMul * chunk.maxDim * Math.pow(Math.max(intensity - 0.72, 0.02), 0.75);
    const fragInfo = [];
    for (const poly of polys) {
      const mp = F.polyMassProps(poly);
      if (!(mp.volume > 0)) continue;
      const c = mp.centroid;
      if (mp.volume < phys.minFrag) { dustPts.push(c); continue; }
      const centered = F.translatePoly(poly, -c[0], -c[1], -c[2]);
      const flp = _b.set(c[0], c[1], c[2]).applyQuaternion(chunk.lq).add(chunk.lp);
      const frag = this.addChunk(asm, {
        name: chunk.name, phys, mats: chunk.mats, poly: centered, lp: flp, lq: chunk.lq,
        uvFn: chunk.uvFn, uvOff: [chunk.uvOff[0] + c[0], chunk.uvOff[1] + c[1], chunk.uvOff[2] + c[2]],
        volume: mp.volume, density: chunk.mass / chunk.volume, strengthMul: chunk.strengthMul * 1.15,
        thick: Math.min(chunk.thick, 1), pattern, grain: chunk.grain, tags: chunk.tags, bondMul: chunk.bondMul,
        gen: chunk.gen + 1, castShadow: chunk.castShadow, sound: chunk.sound, releaseMul: chunk.releaseMul,
      });
      // a fragment cannot be thicker (for strength purposes) than its parent wall
      frags.push(frag);
      hulls.push(this.bodyHull(frag));
      const dist = Math.hypot(c[0] - impact[0], c[1] - impact[1], c[2] - impact[2]);
      fragInfo.push(dist);
    }
    if (frags.length < 2 && !dustPts.length) {
      // nothing useful came out of it: keep the original
      for (const f of frags) this.destroyChunk(f);
      return null;
    }
    this.stats.chunks += frags.length;
    // bonds between surviving neighbours
    const fj = phys.fragJoint * this.settings.strength;
    for (let i = 0; i < frags.length; i++) {
      if (fragInfo[i] < releaseR) continue;
      for (let j = i + 1; j < frags.length; j++) {
        if (fragInfo[j] < releaseR) continue;
        const ct = F.hullContact(hulls[i], hulls[j], 0.0008);
        if (!ct) continue;
        const far = clamp((Math.min(fragInfo[i], fragInfo[j]) - releaseR) / (releaseR + 0.05), 0.15, 1);
        this.addBond(frags[i], frags[j], fj * Math.sqrt(ct.area) * far * (0.6 + 0.8 * rng()), _c.set(ct.anchor[0], ct.anchor[1], ct.anchor[2]), ct.area);
      }
    }
    // re-attach to whatever the original was joined to
    for (const ob of chunk.bonds) {
      if (ob.broken) continue;
      const nb = ob.a === chunk ? ob.b : ob.a;
      const hn = this.bodyHull(nb);
      const keep = ob.strength / Math.max(ob.base, 1e-6);
      for (let i = 0; i < frags.length; i++) {
        if (fragInfo[i] < releaseR * 0.6) continue;
        const ct = F.hullContact(hulls[i], hn, 0.003);
        if (!ct) continue;
        this.addBond(frags[i], nb, this.jointStrength(frags[i], nb, ct.area) * keep, _c.set(ct.anchor[0], ct.anchor[1], ct.anchor[2]), ct.area, { ductile: ob.ductile });
      }
    }
    // hinges anchored in the broken chunk move to the fragment that holds the anchor
    for (const jl of this.joints) {
      for (const side of ['A', 'B']) {
        if (jl['chunk' + side] !== chunk) continue;
        const an = _c.copy(jl['anchor' + side]).applyQuaternion(chunk.lq).add(chunk.lp);
        let best = -1, bd = Infinity;
        for (let i = 0; i < frags.length; i++) {
          const d = F.hullDistance(hulls[i], [an.x, an.y, an.z]);
          if (d < bd) { bd = d; best = i; }
        }
        if (best < 0 || bd > 0.03 || fragInfo[best] < releaseR * 0.5) { this.breakJoint(jl); continue; }
        const f = frags[best];
        jl['chunk' + side] = f;
        jl['anchor' + side].copy(an).sub(f.lp).applyQuaternion(_q2.copy(f.lq).invert());
        // joint body is unchanged for now (fragment is still in the same assembly)
      }
    }
    const prop = chunk.prop;
    const size = chunk.size, sound = chunk.sound, tags = chunk.tags;
    if (!secondary) {
      this._oldBonds = [];
      for (const ob of chunk.bonds) if (!ob.broken) this._oldBonds.push({ o: ob.a === chunk ? ob.b : ob.a, s: ob.strength });
    }
    if (this.debug) this.debug.push({ t: +this.time.toFixed(3), ev: 'fracture', part: chunk.name, prop: prop?.type, intensity: +intensity.toFixed(2), strength: +chunk.strength.toFixed(2), frags: frags.length, dust: dustPts.length });
    this.destroyChunk(chunk);
    this.stats.fractures++;
    if (this.audio) this.audio.fracture(sound, Pw, clamp(0.45 + intensity * 0.16, 0.4, 1.3) * (secondary ? 0.6 : 1), clamp(size, 0.04, 1.6));
    if (this.fx) {
      const body = asm.body;
      const t = body.translation();
      const qb = _q.copy(body.rotation());
      const pts = dustPts.map((c) => {
        const v = new THREE.Vector3(c[0], c[1], c[2]).applyQuaternion(chunk.lq).add(chunk.lp).applyQuaternion(qb);
        v.x += t.x; v.y += t.y; v.z += t.z;
        return v;
      });
      this.fx.fracture(phys, Pw, Dw, intensity, size, pts, asm);
    }
    if (prop?.behavior?.onFracture) prop.behavior.onFracture(chunk, frags, tags, Pw);
    return frags;
  }

  /**
   * Send a shock of impulse J into the bond graph starting at `hit`.
   * Each bond carries its share; overloaded bonds snap (brittle) or bend
   * (ductile metal), and what gets through travels on to the neighbours.
   */
  propagateShock(hit, J, pB, dB, noFatigue, seeds) {
    const asm = hit.asm;
    const out = { broken: 0, absorbed: 0, bent: 0, phys: null, crack: [] };
    const rng = this.rng;
    const M = asm.mass || 1;
    const queue = seeds || [hit, J, 0];
    const seen = new Set();
    for (let i = 0; i < queue.length; i += 3) seen.add(queue[i]);
    const S = this.settings.strength;
    let qi = 0;
    while (qi < queue.length) {
      const c = queue[qi], j = queue[qi + 1], depth = queue[qi + 2];
      qi += 3;
      if (c.dead) continue;
      if (depth > 0 && !noFatigue && c.fracturable && j > c.strength * S * (1 - c.damage)) out.crack.push(c, j);
      if (!c.bonds.length) continue;
      let total = 0;
      for (const b of c.bonds) total += b.strength;
      if (total <= 0) continue;
      const jt = j * Math.max(0.2, 1 - c.mass / M);
      const maxDepth = c.phys.brittle ? 10 : 3;
      for (const b of c.bonds.slice()) {
        if (b.broken) continue;
        const other = b.a === c ? b.b : b.a;
        // brittle pieces: each joint sees (nearly) the whole shock; tough ones share it out
        const beta = Math.min(c.phys.brittle || 0, other.phys.brittle || 0);
        const share = Math.pow(b.strength / total, 1 - beta);
        let lever = 1;
        if (depth === 0) lever = clamp(1 + (0.45 * pB.distanceTo(b.anchor)) / (4 * b.size + 0.02), 1, 3.2);
        const stress = jt * share * lever * (0.8 + 0.4 * rng());
        const brittle = Math.min(c.phys.shock, other.phys.shock);
        let passed;
        if (b.ductile) {
          const yieldS = b.strength * 0.42;
          if (stress > yieldS) {
            const bent = this.bendBond(b, c, pB, dB, stress / b.strength);
            if (bent > 0) out.bent = Math.max(out.bent, bent);
            if (b.broken || (bent === 0 && stress > b.strength)) {
              if (!b.broken) this.breakBond(b);
              out.broken++;
              out.absorbed += b.strength;
              out.phys = out.phys || c.phys;
            }
            passed = Math.min(stress, b.strength) * 0.5;
          } else passed = stress;
        } else if (stress > b.strength) {
          this.breakBond(b);
          out.broken++;
          out.absorbed += b.strength;
          out.phys = out.phys || (c.phys.joint <= other.phys.joint ? c.phys : other.phys);
          passed = b.strength * 0.5 + (stress - b.strength) * brittle * brittle;
        } else {
          if (!noFatigue) b.strength = Math.max(b.base * 0.35, b.strength - stress * 0.12);
          passed = stress;
        }
        let jn = passed * brittle;
        if (beta > 0) jn *= Math.exp((-beta * c.lp.distanceTo(other.lp)) / Math.min(c.phys.crackLen || 0.08, other.phys.crackLen || 0.08));
        if (!seen.has(other) && depth < maxDepth && jn > 0.02) {
          seen.add(other);
          queue.push(other, jn, depth + 1);
        }
      }
    }
    return out;
  }

  /**
   * Plastic deformation at a ductile joint: everything on the struck side of
   * the bond rotates about the joint. Returns the bend angle (0 if the part
   * is braced by other bonds and cannot bend).
   */
  bendBond(bond, from, pB, dB, load) {
    const asm = from.asm;
    // which chunks hang off this bond on the struck side?
    const side = new Set([from]);
    const stack = [from];
    const far = bond.a === from ? bond.b : bond.a;
    while (stack.length) {
      const c = stack.pop();
      for (const b of c.bonds) {
        if (b === bond || b.broken) continue;
        const o = b.a === c ? b.b : b.a;
        if (o === far) return 0; // braced: a loop around the joint
        if (!side.has(o)) { side.add(o); stack.push(o); }
      }
    }
    let ms = 0;
    for (const c of side) ms += c.mass;
    let rotate = side, sign = 1;
    if (ms > asm.mass * 0.5) {
      // bend the lighter side instead (same relative deformation)
      rotate = new Set();
      for (const c of asm.chunks) if (!side.has(c)) rotate.add(c);
      sign = -1;
    }
    const arm = _a.copy(pB).sub(bond.anchor);
    const axis = _b.copy(arm).cross(dB);
    const al = axis.length();
    if (al < 1e-4) return 0;
    axis.multiplyScalar(1 / al);
    const lever = clamp(al / (arm.length() + 1e-6), 0.2, 1);
    const angle = clamp((load - 0.42) * 0.42 * lever, 0.015, 0.4);
    const q = _q.setFromAxisAngle(axis, angle * sign);
    const pivot = bond.anchor;
    const touched = new Set();
    for (const c of rotate) {
      c.lp.sub(pivot).applyQuaternion(q).add(pivot);
      c.lq.premultiply(q);
      c.hull = null;
      c.collider.setTranslationWrtParent(c.lp);
      c.collider.setRotationWrtParent(c.colRot ? _q2.copy(c.lq).multiply(c.colRot) : c.lq);
      c.mesh.position.copy(c.lp);
      c.mesh.quaternion.copy(c.lq);
      c.mesh.updateMatrix();
      for (const b of c.bonds) {
        if (b === bond || touched.has(b)) continue;
        touched.add(b);
        const o = b.a === c ? b.b : b.a;
        if (rotate.has(o)) b.anchor.sub(pivot).applyQuaternion(q).add(pivot);
      }
    }
    for (const jl of this.joints) {
      if (rotate.has(jl.chunkA) || rotate.has(jl.chunkB)) this.rebuildJoint(jl);
    }
    asm.dirty = true;
    this.finishAssembly(asm);
    bond.bend += angle;
    bond.strength *= 0.93;
    if (bond.bend > bond.maxBend) this.breakBond(bond);
    return angle;
  }

  /**
   * Split an assembly into its connected components. The heaviest component
   * keeps the original body; every other one becomes a new rigid body that
   * inherits the exact velocity field of the parent. Returns the new assemblies.
   */
  resolveAssembly(asm) {
    if (asm.removed) return [];
    if (asm.chunks.size === 0) { this.removeAssembly(asm); return []; }
    if (asm.chunks.size === 1) { this.finishAssembly(asm); return []; }
    const compOf = new Map();
    const comps = [];
    for (const c of asm.chunks) {
      if (compOf.has(c)) continue;
      const list = [c];
      compOf.set(c, list);
      let mass = 0;
      for (let i = 0; i < list.length; i++) {
        const x = list[i];
        mass += x.mass;
        for (const b of x.bonds) {
          const o = b.a === x ? b.b : b.a;
          if (!compOf.has(o) && o.asm === asm) { compOf.set(o, list); list.push(o); }
        }
      }
      list.mass = mass;
      comps.push(list);
    }
    if (comps.length === 1) { this.finishAssembly(asm); return []; }
    let main = comps[0];
    for (const l of comps) if (l.mass > main.mass) main = l;

    const body = asm.body;
    const lv = body.linvel(), av = body.angvel();
    const t = body.translation(), r = body.rotation();
    const rot = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const pos = new THREE.Vector3(t.x, t.y, t.z);
    const oldCom = new THREE.Vector3().copy(asm.comL).applyQuaternion(rot).add(pos);
    const W = new THREE.Vector3(av.x, av.y, av.z);
    const released = [];
    for (const list of comps) {
      if (list === main) continue;
      const na = this.createAssembly({ pos, quat: rot, prop: asm.prop, sleeping: false });
      for (const c of list) {
        this.chunkByHandle.delete(c.collider.handle);
        this.world.removeCollider(c.collider, false);
        asm.chunks.delete(c);
        this.attachChunk(c, na);
      }
      this.finishAssembly(na);
      const com = _a.copy(na.comL).applyQuaternion(rot).add(pos);
      const v = _b.copy(com).sub(oldCom).cross(W).negate();
      na.body.setLinvel({ x: lv.x + v.x, y: lv.y + v.y, z: lv.z + v.z }, true);
      na.body.setAngvel(av, true);
      // matching pre-impact state so later momentum hand-back works for it too
      na.pc.copy(com);
      na.pa.copy(asm.pa);
      na.pl.copy(com).sub(asm.pc).cross(asm.pa).negate().add(asm.pl);
      released.push(na);
    }
    this.finishAssembly(asm);
    const com = _a.copy(asm.comL).applyQuaternion(rot).add(pos);
    const v = _b.copy(com).sub(oldCom).cross(W).negate();
    body.setLinvel({ x: lv.x + v.x, y: lv.y + v.y, z: lv.z + v.z }, true);
    body.wakeUp();
    for (const jl of [...this.joints]) {
      if (jl.jA !== jl.chunkA.asm || jl.jB !== jl.chunkB.asm) this.rebuildJoint(jl);
    }
    if (asm.prop?.behavior?.onSplit) asm.prop.behavior.onSplit(asm, released);
    return released;
  }

  // -------------------------------------------------------------------------
  // Tools
  // -------------------------------------------------------------------------

  /** A direct blow (sledgehammer): damage plus momentum at a point. */
  toolImpact(chunk, P, D, J) {
    if (!chunk || chunk.dead || !chunk.asm) return null;
    const asm = chunk.asm;
    asm.body.wakeUp();
    const res = this.applyImpact(chunk, P, D, J);
    // deliver the momentum to whatever now occupies the struck spot
    const targets = new Map();
    const add = (a, share) => { if (a && !a.removed) targets.set(a, (targets.get(a) || 0) + share); };
    if (res && res.released.length) {
      let wsum = 0;
      const ws = [];
      for (const R of res.released) {
        const d = this.asmComWorld(R, _a).distanceTo(P);
        const w = Math.exp(-(d * d) / 0.05) + 0.02;
        ws.push(w);
        wsum += w;
      }
      const freed = clamp(1 - res.thr / J, 0.25, 0.8);
      res.released.forEach((R, i) => add(R, (freed * ws[i]) / wsum));
      add(asm, 1 - freed);
    } else add(asm, 1);
    for (const [a, share] of targets) {
      const j = J * share;
      const dv = Math.min(j / Math.max(a.mass, 1e-3), 45);
      const imp = dv * a.mass;
      const at = a === asm ? P : this.asmComWorld(a, _a);
      a.body.applyImpulseAtPoint({ x: D.x * imp, y: D.y * imp, z: D.z * imp }, at, true);
      if (a !== asm) {
        const s = Math.min(18, dv * 2.5);
        const rng = this.rng;
        const av = a.body.angvel();
        a.body.setAngvel({ x: av.x + (rng() - 0.5) * s, y: av.y + (rng() - 0.5) * s, z: av.z + (rng() - 0.5) * s }, true);
      }
    }
    return res;
  }

  /**
   * Sustained pull (grab tool): can unlatch doors, rip hinges and tear parts
   * off, but does not shatter anything or fatigue what holds.
   */
  pull(chunk, P, D, J) {
    const asm = chunk.asm;
    if (!asm || chunk.dead) return null;
    this.stressJoints(asm, P, J, D, true);
    if (asm.chunks.size < 2 || !chunk.bonds.length) return null;
    const body = asm.body;
    const t = body.translation();
    const qb = _q.copy(body.rotation()).invert();
    const pB = new THREE.Vector3(P.x - t.x, P.y - t.y, P.z - t.z).applyQuaternion(qb);
    const dB = new THREE.Vector3().copy(D).applyQuaternion(qb);
    const sh = this.propagateShock(chunk, J, pB, dB, true);
    if (sh.bent && this.audio) this.audio.bend(P, clamp(sh.bent * 2.5, 0.3, 1.1), clamp(chunk.size, 0.1, 1.5));
    if (!sh.broken) return null;
    const ph = sh.phys || chunk.phys;
    if (this.audio) this.audio.fracture(ph.sound, P, clamp(0.35 + sh.absorbed / 160, 0.3, 1), clamp(chunk.size, 0.05, 1.5));
    if (this.fx) this.fx.snap(ph, P, D, sh.absorbed);
    return this.resolveAssembly(asm);
  }

  /** Radial blast: pressure impulse on every chunk in range, falling off with distance. */
  explode(center, power, radius) {
    const hits = [];
    const cw = new THREE.Vector3();
    for (const asm of this.asms) {
      if (asm.removed) continue;
      const com = this.asmComWorld(asm, _a);
      if (com.distanceTo(center) > radius + asm.radius) continue;
      for (const c of asm.chunks) {
        this.chunkCenterWorld(c, cw);
        const d = cw.distanceTo(center);
        if (d > radius) continue;
        // presented area ~ the two largest extents
        const e = c.ext;
        const area = clamp((e[0] * e[1] + e[1] * e[2] + e[0] * e[2]) / 3, 0.0004, 1.2);
        const fall = Math.pow(1 - d / radius, 1.6) / (0.35 + d * d);
        const j = power * area * fall;
        if (j < 0.01) continue;
        const dir = cw.clone().sub(center);
        if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
        dir.normalize();
        dir.y += 0.25;
        dir.normalize();
        hits.push({ c, j, dir, p: cw.clone().addScaledVector(dir, -c.minDim * 0.5) });
      }
    }
    // damage first…
    const pending = [];
    for (const hgt of hits) {
      const c = hgt.c;
      if (c.dead || !c.asm) { continue; }
      c.asm.body.wakeUp();
      const before = c.asm;
      const lpB = c.lp.clone();
      const res = this.applyImpact(c, hgt.p, hgt.dir, hgt.j);
      pending.push({ hgt, before, res, lpB });
    }
    // …then push whatever is there now
    for (const { hgt, before, res } of pending) {
      const j = hgt.j;
      const apply = (a, share) => {
        if (!a || a.removed) return;
        const dv = Math.min((j * share) / Math.max(a.mass, 1e-3), 38);
        const imp = dv * a.mass;
        const at = this.asmComWorld(a, _a);
        at.lerp(hgt.p, a === before ? 0.85 : 0.2);
        a.body.applyImpulseAtPoint({ x: hgt.dir.x * imp, y: hgt.dir.y * imp, z: hgt.dir.z * imp }, at, true);
      };
      const c = hgt.c;
      if (!c.dead && c.asm) apply(c.asm, 1);
      else if (res && res.released.length) {
        const n = res.released.length;
        for (const R of res.released) apply(R, 1 / n);
        apply(before, 0.3);
      } else apply(before, 1);
    }
  }
}
