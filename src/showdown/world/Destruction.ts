import * as THREE from 'three';
import { RAPIER } from '../../physics/Physics';
import { SD } from '../core/SD';
import { Building } from './Buildings';
import { COLLIDE, City } from './City';
import { ConvexPoly, polyGeometry } from './Poly';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Piece {
  b: Building;
  body: RAPIER.RigidBody;
  lastVy: number;
  bornAt: number;
  /** quiet frames (for freezing) */
  calm: number;
  size: number;
  /** held in place (the beat before a cut slides) */
  hold: number;
  /** velocity given when the hold ends */
  go: THREE.Vector3;
}

interface FirePatch {
  p: THREE.Vector3;
  r: number;
  t: number;
}

/** Wall marks left by slashes and crashes. */
class WallMarks {
  readonly mesh: THREE.InstancedMesh;
  private head = 0;
  private n = 0;
  constructor(scene: THREE.Scene) {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 32;
    const g = cv.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.42, 'rgba(20,18,18,0.9)');
    grd.addColorStop(0.5, 'rgba(5,5,6,1)');
    grd.addColorStop(0.58, 'rgba(20,18,18,0.9)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, 16);
    g.quadraticCurveTo(128, 2, 256, 16);
    g.quadraticCurveTo(128, 30, 0, 16);
    g.fill();
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, 120);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  add(p: THREE.Vector3, n: THREE.Vector3, axis: THREE.Vector3, len: number, w: number) {
    const i = this.head;
    this.head = (this.head + 1) % 120;
    this.n = Math.min(120, this.n + 1);
    // lay the mark in the wall plane along the blade
    const x = axis.clone().addScaledVector(n, -axis.dot(n)).normalize();
    const y = new THREE.Vector3().crossVectors(n, x);
    _m.makeBasis(x, y, n);
    _m.scale(_v.set(len, w, 1));
    _m.setPosition(_v2.copy(p).addScaledVector(n, 0.05));
    this.mesh.setMatrixAt(i, _m);
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    this.n = this.head = 0;
    this.mesh.count = 0;
  }
}

/**
 * Everything breakable: buildings split along a plane (the falling half
 * becomes a rigid body), Purple erases slabs, blasts throw cars and debris.
 */
export class Destruction {
  private pieces: Piece[] = [];
  private marks: WallMarks;
  private fires: FirePatch[] = [];
  /** cut buildings that fell recently (for the camera director) */
  lastCollapse = 0;

  constructor(readonly city: City) {
    this.marks = new WallMarks(city.scene);
  }

  get world() {
    return SD.physics.world as RAPIER.World;
  }

  // ---------------------------------------------------------------- slicing
  /**
   * Split every standing building the plane passes through inside `bounds`
   * (world box; null = everywhere). n·x = d in world space. Returns how many split.
   */
  slice(n: THREE.Vector3, d: number, bounds: THREE.Box3 | null, push: THREE.Vector3 | null = null, kind: 'slash' | 'wcs' = 'slash', hold = 0) {
    let count = 0;
    const list = [...this.city.buildings];
    for (const b of list) {
      if (!b.mesh.parent || !b.standing) continue;
      const box = new THREE.Box3().setFromObject(b.mesh);
      if (bounds && !box.intersectsBox(bounds)) continue;
      // does the plane cross the box at all?
      const c = box.getCenter(_v);
      const ext = box.getSize(_v2).multiplyScalar(0.5);
      const r = ext.x * Math.abs(n.x) + ext.y * Math.abs(n.y) + ext.z * Math.abs(n.z);
      const s = n.dot(c) - d;
      if (Math.abs(s) > r) continue;
      if (this.split(b, n, d, push, kind, hold)) count++;
    }
    return count;
  }

  /** Splits one building; the unsupported part comes loose. */
  split(b: Building, n: THREE.Vector3, d: number, push: THREE.Vector3 | null, kind: 'slash' | 'wcs' | 'erase' = 'slash', hold = 0) {
    const m = b.mesh;
    m.updateMatrixWorld();
    const inv = _q.copy(m.quaternion).invert();
    const nl = n.clone().applyQuaternion(inv);
    const dl = d - n.dot(m.position);
    const [front, back] = b.poly.split(nl, dl);
    if (!front || !back) return false;
    if (front.volume() < 2 || back.volume() < 2) return false;
    const isPiece = !b.standing;
    const pieceBody = isPiece ? this.pieces.find((p) => p.b === b)?.body ?? null : null;
    const lin = pieceBody ? pieceBody.linvel() : null;
    const ang = pieceBody ? pieceBody.angvel() : null;
    this.remove(b);
    const minY = (p: ConvexPoly) => p.bounds().min.y;
    const baseY = b.poly.bounds().min.y;
    const parts = [front, back].map((p) => {
      const nb = new Building(p, b.attrs, this.city.facadeMat, b.name);
      nb.mesh.position.copy(m.position);
      nb.mesh.quaternion.copy(m.quaternion);
      nb.mesh.updateMatrixWorld();
      this.city.group.add(nb.mesh);
      return nb;
    });
    // which halves still stand on the ground?
    const grounded = [front, back].map((p) => !isPiece && minY(p) < baseY + 0.3);
    const vols = [front.volume(), back.volume()];
    parts.forEach((nb, i) => {
      const standing = grounded[i] && (!grounded[1 - i] || vols[i] >= vols[1 - i] * 0.6);
      if (standing) {
        nb.standing = true;
        nb.makeStatic(this.world, COLLIDE.world);
        this.city.buildings.push(nb);
      } else {
        nb.standing = false;
        const v = new THREE.Vector3();
        if (lin) v.set(lin.x, lin.y, lin.z);
        // the loose half slides off down the cut, carried along by the blade
        const down = new THREE.Vector3(0, -1, 0).addScaledVector(n, n.y);
        if (down.lengthSq() > 1e-4) v.addScaledVector(down.normalize(), kind === 'wcs' ? 4 : 3);
        if (push) v.addScaledVector(push.clone().setY(0).normalize(), kind === 'wcs' ? 9 : 6);
        this.makeDynamic(nb, v, ang ? new THREE.Vector3(ang.x, ang.y, ang.z) : new THREE.Vector3(rnd(-0.08, 0.08), rnd(-0.05, 0.05), rnd(-0.08, 0.08)), hold);
        this.city.buildings.push(nb);
      }
    });
    this.cutEffects(parts[0], n, d, kind);
    return true;
  }

  private makeDynamic(b: Building, vel: THREE.Vector3, ang: THREE.Vector3, hold = 0) {
    const m = b.mesh;
    const verts = b.poly.vertices();
    const pts = new Float32Array(verts.flatMap((v) => [v.x, v.y, v.z]));
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(m.position.x, m.position.y, m.position.z)
        .setRotation({ x: m.quaternion.x, y: m.quaternion.y, z: m.quaternion.z, w: m.quaternion.w })
        .setLinvel(hold > 0 ? 0 : vel.x, hold > 0 ? 0 : vel.y, hold > 0 ? 0 : vel.z)
        .setAngvel(hold > 0 ? { x: 0, y: 0, z: 0 } : { x: ang.x, y: ang.y, z: ang.z })
        .setGravityScale(hold > 0 ? 0 : 1)
        .setLinearDamping(0.05)
        .setAngularDamping(0.25)
        .setCanSleep(true)
        .setCcdEnabled(true),
    );
    const desc = RAPIER.ColliderDesc.convexHull(pts);
    if (!desc) {
      this.world.removeRigidBody(body);
      return;
    }
    const vol = b.poly.volume();
    desc.setDensity(Math.min(400, 3e6 / Math.max(1, vol)) * 0.4).setFriction(0.12).setRestitution(0.02).setCollisionGroups(COLLIDE.piece);
    b.collider = this.world.createCollider(desc, body);
    b.body = body;
    const size = b.poly.bounds().getSize(_v).length();
    this.pieces.push({ b, body, lastVy: vel.y, bornAt: SD.time, calm: 0, size, hold, go: vel.clone() });
    // keep the count of moving chunks sane
    if (this.pieces.length > 36) this.freeze(this.pieces[0]);
  }

  private freeze(p: Piece) {
    const t = p.body.translation();
    const r = p.body.rotation();
    p.b.mesh.position.set(t.x, t.y, t.z);
    p.b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    this.world.removeRigidBody(p.body);
    p.b.body = null;
    p.b.makeStatic(this.world, COLLIDE.world);
    this.pieces.splice(this.pieces.indexOf(p), 1);
  }

  private remove(b: Building) {
    const i = this.city.buildings.indexOf(b);
    if (i >= 0) this.city.buildings.splice(i, 1);
    const pi = this.pieces.findIndex((p) => p.b === b);
    if (pi >= 0) this.pieces.splice(pi, 1);
    b.dispose(this.world);
  }

  /** Dust, grit and a bright seam along a fresh cut. */
  private cutEffects(b: Building, n: THREE.Vector3, d: number, kind: string) {
    const box = new THREE.Box3().setFromObject(b.mesh);
    const c = box.getCenter(new THREE.Vector3());
    // a point on the plane near the building
    const p = c.clone().addScaledVector(n, d - n.dot(c));
    const big = kind === 'wcs';
    for (let i = 0; i < (big ? 30 : 14); i++) {
      const q = p.clone().add(_v.set(rnd(-1, 1) * 12, rnd(-1, 1) * 2, rnd(-1, 1) * 12));
      q.addScaledVector(n, d - n.dot(q));
      const sz = rnd(1.5, 3.5);
      SD.fx.dust.emit(q.x, q.y, q.z, rnd(-2, 2), rnd(-1, 1), rnd(-2, 2), rnd(2, 4), sz, sz * 3, 0.7, 0.68, 0.64, 0.8, 0.66, 0.64, 0.6, 0, 0.6, 0.05, rnd(0, 6), rnd(-0.3, 0.3));
      if (i % 2 === 0) SD.fx.debris(q, _v2.set(rnd(-1, 1), rnd(-0.5, 0.2), rnd(-1, 1)).normalize(), 0.5, 0x9a958e);
    }
    SD.audio?.play('slashWorld', { x: p.x, y: p.y, z: p.z, volume: big ? 1.4 : 1 });
  }

  // ---------------------------------------------------------------- techniques
  /** Hollow Purple: erases a slab through anything in its path; what's above falls. */
  erase(p: THREE.Vector3, r: number) {
    for (const b of [...this.city.buildings]) {
      if (!b.mesh.parent) continue;
      const box = new THREE.Box3().setFromObject(b.mesh);
      if (box.distanceToPoint(p) > r) continue;
      if (b.body && !b.standing) {
        // a falling chunk caught in the path is simply gone
        this.disintegrate(b);
        continue;
      }
      // two horizontal cuts; the slab between them vanishes
      const lo = p.y - r;
      const hi = p.y + r;
      if (hi < box.min.y + 0.3) continue;
      const up = new THREE.Vector3(0, 1, 0);
      const m = b.mesh;
      const inv = _q.copy(m.quaternion).invert();
      const nl = up.clone().applyQuaternion(inv);
      const off = m.position.y;
      let rest: ConvexPoly | null = b.poly;
      let above: ConvexPoly | null = null;
      if (hi < box.max.y) {
        const [a, bl] = b.poly.split(nl, hi - off);
        above = a;
        rest = bl;
      }
      let below: ConvexPoly | null = null;
      if (rest && lo > box.min.y + 0.2) {
        const [a, bl] = rest.split(nl, lo - off);
        below = bl;
        rest = a;
      }
      // rest is the slab: gone
      this.remove(b);
      if (rest) this.purpleDust(rest, m);
      const add = (poly: ConvexPoly | null, stand: boolean) => {
        if (!poly || poly.volume() < 1) return;
        const nb = new Building(poly, b.attrs, this.city.facadeMat, b.name);
        nb.mesh.position.copy(m.position);
        nb.mesh.quaternion.copy(m.quaternion);
        nb.mesh.updateMatrixWorld();
        this.city.group.add(nb.mesh);
        this.city.buildings.push(nb);
        nb.standing = stand;
        if (stand) nb.makeStatic(this.world, COLLIDE.world);
        else this.makeDynamic(nb, new THREE.Vector3(0, -2, 0), new THREE.Vector3(rnd(-0.05, 0.05), 0, rnd(-0.05, 0.05)));
      };
      add(below, true);
      add(above, false);
      SD.audio?.play('collapse', { x: p.x, y: p.y, z: p.z, volume: 1.2 });
    }
    // cars in the way vanish
    for (const c of this.city.cars) {
      if (!c.mesh.visible) continue;
      if (c.mesh.position.distanceTo(p) < r + 2) {
        c.mesh.visible = false;
        this.world.removeRigidBody(c.body);
        c.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -100, 0));
      }
    }
  }

  private disintegrate(b: Building) {
    const poly = b.poly;
    const m = b.mesh;
    this.purpleDust(poly, m);
    this.remove(b);
  }

  private purpleDust(poly: ConvexPoly, m: THREE.Object3D) {
    const bb = poly.bounds();
    for (let i = 0; i < 60; i++) {
      const q = new THREE.Vector3(rnd(bb.min.x, bb.max.x), rnd(bb.min.y, bb.max.y), rnd(bb.min.z, bb.max.z)).applyQuaternion(m.quaternion).add(m.position);
      SD.fx.energy.emit(q.x, q.y, q.z, rnd(-3, 3), rnd(-3, 3), rnd(-3, 3), rnd(0.4, 1.0), rnd(0.4, 1.2), 0.05, 1.4, 0.5, 2.2, 1, 0.3, 0, 0.6, 0, 1, 0);
    }
  }

  /** Radial shove for cars and loose chunks (Red, Fuga, impacts). */
  blast(p: THREE.Vector3, r: number, power: number) {
    const push = (body: RAPIER.RigidBody, mass: number) => {
      const t = body.translation();
      const d = _v.set(t.x - p.x, t.y - p.y + 1, t.z - p.z);
      const dist = d.length();
      if (dist > r) return;
      const k = (1 - dist / r) * power * mass;
      d.normalize();
      body.wakeUp();
      body.applyImpulse({ x: d.x * k, y: (d.y + 0.6) * k, z: d.z * k }, true);
      body.applyTorqueImpulse({ x: rnd(-1, 1) * k * 0.6, y: rnd(-1, 1) * k * 0.3, z: rnd(-1, 1) * k * 0.6 }, true);
    };
    for (const c of this.city.cars) if (c.mesh.visible) push(c.body, c.body.mass());
    for (const pc of this.pieces) push(pc.body, pc.body.mass() * 0.05);
  }

  /** Blue: everything loose drifts toward the point. */
  pull(p: THREE.Vector3, r: number, power: number) {
    for (const c of this.city.cars) {
      if (!c.mesh.visible) continue;
      const t = c.body.translation();
      const d = _v.set(p.x - t.x, p.y - t.y, p.z - t.z);
      const dist = d.length();
      if (dist > r || dist < 1) continue;
      const k = (1 - dist / r) * power * c.body.mass();
      d.normalize();
      c.body.wakeUp();
      c.body.applyImpulse({ x: d.x * k, y: d.y * k + 9.81 * c.body.mass() * 0.02, z: d.z * k }, true);
    }
  }

  /** A fighter slammed into a wall: chips off the facade. */
  crash(p: THREE.Vector3, n: THREE.Vector3, speed: number, _collider: RAPIER.Collider) {
    if (n.y < 0.6) this.marks.add(p, n, new THREE.Vector3(n.z, 0, -n.x), 1.2 + speed * 0.08, 0.6 + speed * 0.05);
  }

  /** A Dismantle cut that hit a wall. */
  slashMark(p: THREE.Vector3, n: THREE.Vector3, axis: THREE.Vector3, len: number, collider: RAPIER.Collider | null) {
    if (n.y > 0.6) return;
    this.marks.add(p, n, axis, len * 1.4, 0.25);
    // the biggest cuts go all the way through
    void collider;
  }

  /** Fuga leaves the street burning for a while. */
  fire(p: THREE.Vector3, r: number) {
    this.fires.push({ p: p.clone().setY(SD.city.groundY(p.x, p.z)), r, t: 7 });
  }

  update(dt: number) {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const pc = this.pieces[i];
      if (pc.hold > 0) {
        pc.hold -= dt;
        if (pc.hold <= 0) {
          pc.body.setGravityScale(1, true);
          pc.body.setLinvel({ x: pc.go.x, y: pc.go.y, z: pc.go.z }, true);
          pc.bornAt = SD.time;
        }
        continue;
      }
      const t = pc.body.translation();
      const r = pc.body.rotation();
      pc.b.mesh.position.set(t.x, t.y, t.z);
      pc.b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      const v = pc.body.linvel();
      // a heavy landing
      if (pc.lastVy < -7 && v.y > pc.lastVy * 0.4) {
        const bb = new THREE.Box3().setFromObject(pc.b.mesh);
        const at = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2);
        const k = Math.min(2.5, -pc.lastVy / 12) * Math.min(1.5, pc.size / 30);
        SD.fx.dustRing(at.x, Math.max(0.2, at.y), at.z, Math.min(30, pc.size * 0.4), Math.round(20 + 30 * k), 6 + 6 * k);
        SD.fx.debris(at, _v.set(0, 1, 0), Math.min(1.5, k), 0x9a958e);
        SD.audio?.play('collapse', { x: at.x, y: at.y, z: at.z, volume: Math.min(1.5, 0.5 + k) });
        const cam = SD.camera.position.distanceTo(at);
        SD.player?.cam.shake(Math.max(0, Math.min(1, k * 0.8 - cam * 0.004)));
        this.lastCollapse = SD.time;
      }
      pc.lastVy = v.y;
      if (pc.body.isSleeping() || (Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) < 0.05 && SD.time - pc.bornAt > 4)) {
        pc.calm += dt;
        if (pc.calm > 1.5) this.freeze(pc);
      } else pc.calm = 0;
      // fell out of the world
      if (t.y < -50) {
        this.remove(pc.b);
      }
    }
    // burning street
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      if (f.t <= 0) {
        this.fires.splice(i, 1);
        continue;
      }
      const k = Math.min(1, f.t / 2);
      for (let j = 0; j < 6 * k; j++) {
        const a = rnd(0, Math.PI * 2);
        const rr = Math.sqrt(Math.random()) * f.r;
        SD.fx.fire.emit(f.p.x + Math.cos(a) * rr, f.p.y + 0.2, f.p.z + Math.sin(a) * rr, rnd(-0.5, 0.5), rnd(1.5, 4), rnd(-0.5, 0.5), rnd(0.4, 0.9), rnd(0.4, 1.0), 0.1, 2.4, 0.8, 0.2, 1, 0.6, 0.1, 0, 0, 0.6, -0.5);
      }
      if (Math.random() < 0.3 * k) SD.fx.smoke.emit(f.p.x + rnd(-f.r, f.r) * 0.5, f.p.y + 1, f.p.z + rnd(-f.r, f.r) * 0.5, rnd(-0.5, 0.5), rnd(2, 4), rnd(-0.5, 0.5), rnd(3, 5), rnd(1.5, 3), rnd(4, 7), 0.12, 0.11, 0.1, 0.7, 0.3, 0.3, 0.3, 0, 0.6, -0.05, rnd(0, 6), rnd(-0.2, 0.2));
    }
  }

  /** The city as it was before the fight: every cut undone, every car back in its lane. */
  reset() {
    for (const b of [...this.city.buildings]) b.dispose(this.world);
    this.pieces.length = 0;
    this.clear();
    this.city.rebuild();
  }

  clear() {
    this.marks.clear();
    this.fires.length = 0;
  }
}

void polyGeometry;
