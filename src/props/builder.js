// Declarative helper for describing props: a prop is a set of rigid bodies,
// each made of parts (convex chunks with a material). Touching parts of the
// same body are bonded automatically when the prop is spawned; hinges and
// latches connect separate bodies.
import * as THREE from 'three';
import * as F from '../core/fracture.js';
import { surface } from '../core/materials.js';
import { boxUV, panelGeometry, buildPolyGeometry } from '../core/geometry.js';

const AXIS_ROT = [
  new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)),
  null,
  new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)),
];

export function eulerQuat(rot) {
  const q = new THREE.Quaternion();
  if (rot) q.setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ'));
  return q;
}

export class PropBuilder {
  constructor(type, label) {
    this.type = type;
    this.label = label;
    this.bodies = [{ name: 'main', parts: [], sleeping: true }];
    this.cur = this.bodies[0];
    this.joints = [];
    this.bonds = [];
    this.behaviors = [];
    this.xf = [{ pos: new THREE.Vector3(), quat: new THREE.Quaternion() }];
    this.seed = 1;
  }

  // --- structure -----------------------------------------------------------

  /** Start a new rigid body; following parts belong to it. */
  body(name, opts) {
    const b = { name, parts: [], sleeping: true, ...opts };
    this.bodies.push(b);
    this.cur = b;
    return b;
  }

  use(body) {
    this.cur = body || this.bodies[0];
    return this;
  }

  /** Run fn with an extra local transform (position + yaw or full euler). */
  at(pos, rot, fn) {
    const top = this.xf[this.xf.length - 1];
    const q = Array.isArray(rot) ? eulerQuat(rot) : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot || 0);
    const p = new THREE.Vector3(pos[0], pos[1], pos[2]).applyQuaternion(top.quat).add(top.pos);
    this.xf.push({ pos: p, quat: top.quat.clone().multiply(q) });
    fn();
    this.xf.pop();
    return this;
  }

  _world(p) {
    const top = this.xf[this.xf.length - 1];
    return new THREE.Vector3(p[0], p[1], p[2]).applyQuaternion(top.quat).add(top.pos);
  }

  _add(part) {
    const top = this.xf[this.xf.length - 1];
    part.lp.applyQuaternion(top.quat).add(top.pos);
    part.lq.premultiply(top.quat);
    this.cur.parts.push(part);
    return part;
  }

  _common(name, s, o) {
    return {
      name, phys: o.phys || s.phys, mats: o.mats || s.mats,
      mass: o.mass, density: o.density, thick: o.thick, strengthMul: o.strength,
      fracturable: o.fracturable, pattern: o.pattern, tags: o.tags ? new Set(o.tags) : null,
      bondMul: o.bond ?? 1, dentable: !!o.dentable, hollow: !!o.hollow, sound: o.sound,
      castShadow: o.castShadow, releaseMul: o.release, minRefracture: o.minRefracture,
    };
  }

  _uv(s, grain, o) {
    if (o.uv) return o.uv;
    this.seed = (this.seed * 16807) % 2147483647;
    const u = (this.seed % 1000) / 1000;
    this.seed = (this.seed * 16807) % 2147483647;
    const v = (this.seed % 1000) / 1000;
    return boxUV(o.texScale || s.scale, grain, u, v);
  }

  // --- parts ---------------------------------------------------------------

  /** Box. size = full extents, pos = centre. o.rot = euler XYZ. */
  box(name, size, pos, surf, o = {}) {
    const s = typeof surf === 'string' ? surface(surf) : surf;
    const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
    const grain = o.grain ?? (size[0] >= size[1] && size[0] >= size[2] ? 0 : size[1] >= size[2] ? 1 : 2);
    const uvFn = this._uv(s, grain, o);
    const part = {
      ...this._common(name, s, o),
      poly: F.boxPoly(hx, hy, hz), lp: new THREE.Vector3(pos[0], pos[1], pos[2]), lq: eulerQuat(o.rot),
      uvFn, uvOff: [0, 0, 0], shape: 'box', dims: [hx, hy, hz], grain,
    };
    if (o.dentable) part.geometry = panelGeometry(size[0], size[1], size[2], uvFn, o.dentCell || 0.05);
    if (o.geometry) part.geometry = o.geometry;
    return this._add(part);
  }

  /** Cylinder along `axis` (0|1|2). */
  cyl(name, radius, height, pos, surf, o = {}) {
    const s = typeof surf === 'string' ? surface(surf) : surf;
    const axis = o.axis ?? 1;
    const segs = o.segs ?? 18;
    const uvFn = this._uv(s, axis, o);
    const part = {
      ...this._common(name, s, o),
      poly: F.cylinderPoly(radius, height / 2, segs, axis), lp: new THREE.Vector3(pos[0], pos[1], pos[2]), lq: eulerQuat(o.rot),
      uvFn, uvOff: [0, 0, 0], grain: axis,
      shape: o.hull ? 'hull' : 'cyl', dims: [height / 2, radius], colRot: AXIS_ROT[axis],
    };
    if (o.geometry) part.geometry = o.geometry;
    return this._add(part);
  }

  /** Arbitrary convex polyhedron given in local coordinates around `pos`. */
  poly(name, poly, pos, surf, o = {}) {
    const s = typeof surf === 'string' ? surface(surf) : surf;
    const mp = F.polyMassProps(poly);
    const c = mp.centroid;
    const q = eulerQuat(o.rot);
    const centered = F.translatePoly(poly, -c[0], -c[1], -c[2]);
    const lp = new THREE.Vector3(c[0], c[1], c[2]).applyQuaternion(q).add(new THREE.Vector3(pos[0], pos[1], pos[2]));
    const uvFn = o.uv || this._uv(s, o.grain ?? 1, o);
    const part = {
      ...this._common(name, s, o),
      poly: centered, lp, lq: q, uvFn, uvOff: [c[0], c[1], c[2]], shape: 'hull', grain: o.grain, volume: mp.volume,
    };
    if (o.geometry) {
      o.geometry.translate(-c[0], -c[1], -c[2]);
      part.geometry = o.geometry;
    }
    return this._add(part);
  }

  /** Ball (non-fracturable). */
  ball(name, radius, pos, surf, o = {}) {
    const s = typeof surf === 'string' ? surface(surf) : surf;
    const geo = o.geometry || new THREE.SphereGeometry(radius, o.segs ?? 28, o.rings ?? 18);
    const part = {
      ...this._common(name, s, { ...o, fracturable: false }),
      poly: F.boxPoly(radius * 0.8, radius * 0.8, radius * 0.8), lp: new THREE.Vector3(pos[0], pos[1], pos[2]), lq: eulerQuat(o.rot),
      uvFn: boxUV(s.scale, 1), uvOff: [0, 0, 0], shape: 'ball', dims: [radius], geometry: geo,
      volume: (4 / 3) * Math.PI * radius ** 3,
    };
    return this._add(part);
  }

  // --- connections ---------------------------------------------------------

  /** Ball-joint hinge point between two parts of different bodies. */
  hinge(a, b, anchor, o = {}) {
    const p = this._world(anchor);
    const top = this.xf[this.xf.length - 1];
    const ax = o.axis ? new THREE.Vector3(o.axis[0], o.axis[1], o.axis[2]).applyQuaternion(top.quat) : null;
    this.joints.push({ a, b, anchor: [p.x, p.y, p.z], strength: o.strength ?? 90, kind: o.kind || 'hinge', axis: ax ? [ax.x, ax.y, ax.z] : null, span: o.span || 0, sound: o.sound });
  }

  latch(a, b, anchor, strength = 10, sound) {
    this.hinge(a, b, anchor, { strength, kind: 'latch', sound });
  }

  /** Override / add a bond between two parts of the same body. */
  bond(a, b, o = {}) {
    const bd = { a, b, ...o };
    if (o.anchor) {
      const p = this._world(o.anchor);
      bd.anchor = [p.x, p.y, p.z];
    }
    this.bonds.push(bd);
  }

  behave(factory) {
    this.behaviors.push(factory);
  }

  // --- output --------------------------------------------------------------

  build() {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const v = new THREE.Vector3();
    let mass = 0, parts = 0;
    for (const b of this.bodies) {
      for (const p of b.parts) {
        parts++;
        const vol = p.volume ?? F.polyMassProps(p.poly).volume;
        mass += p.mass ?? vol * (p.density ?? p.phys.density);
        for (const f of p.poly.faces) {
          for (const pt of f.pts) {
            v.set(pt[0], pt[1], pt[2]).applyQuaternion(p.lq).add(p.lp);
            min.min(v);
            max.max(v);
          }
        }
      }
    }
    const behaviors = this.behaviors;
    return {
      type: this.type, label: this.label,
      bodies: this.bodies.filter((b) => b.parts.length), joints: this.joints, bonds: this.bonds,
      bounds: { min, max }, mass, parts,
      behavior: behaviors.length
        ? (prop, sim) => {
            const list = behaviors.map((f) => f(prop, sim));
            const call = (name) => (...args) => { for (const b of list) if (b[name]) b[name](...args); };
            return {
              list, onFracture: call('onFracture'), onSplit: call('onSplit'), onDamage: call('onDamage'),
              onJointBreak: call('onJointBreak'), update: call('update'),
            };
          }
        : null,
    };
  }
}

/** Build display-only meshes for a prop definition (thumbnails, placement ghost). */
export function buildPreview(def) {
  const root = new THREE.Group();
  for (const b of def.bodies) {
    for (const p of b.parts) {
      const geo = p.geometry ? p.geometry.clone() : buildPolyGeometry(p.poly, p.uvFn, p.uvOff);
      const mesh = new THREE.Mesh(geo, p.mats);
      mesh.position.copy(p.lp);
      mesh.quaternion.copy(p.lq);
      root.add(mesh);
    }
  }
  return root;
}
