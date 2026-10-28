import * as THREE from 'three';
import { SHAPE_SPHERE, SHAPE_CAPSULE, SHAPE_BOX } from '../physics/shapes.js';

/** Wireframe-ish collider visualisation for any physics body (debug overlay). */
export class DebugDraw {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'debug-colliders';
    scene.add(this.group);
    this.entries = new Map();
    this.visible = true;
    this.matBody = new THREE.MeshStandardMaterial({ color: 0x55aaff, transparent: true, opacity: 0.35, depthWrite: false });
    this.matObj = new THREE.MeshStandardMaterial({ color: 0xffaa33, transparent: true, opacity: 0.35, depthWrite: false });
    this.extra = new THREE.Group();
    scene.add(this.extra);
  }

  setVisible(v) {
    this.visible = v;
    this.group.visible = v;
    this.extra.visible = v;
  }

  meshForShape(s, mat) {
    let geo;
    if (s.type === SHAPE_SPHERE) geo = new THREE.SphereGeometry(s.radius, 16, 12);
    else if (s.type === SHAPE_CAPSULE) geo = new THREE.CapsuleGeometry(s.radius, s.halfHeight * 2, 6, 12);
    else {
      const e = s.halfExtents, r = s.radius;
      geo = new THREE.BoxGeometry(2 * (e.x + r), 2 * (e.y + r), 2 * (e.z + r));
    }
    const m = new THREE.Mesh(geo, mat);
    m.position.set(s.localPos.x, s.localPos.y, s.localPos.z);
    m.quaternion.set(s.localRot.x, s.localRot.y, s.localRot.z, s.localRot.w);
    return m;
  }

  sync(bodies, alpha = 1) {
    const seen = new Set();
    for (const b of bodies) {
      seen.add(b);
      let e = this.entries.get(b);
      if (!e || e.shapeCount !== b.shapes.length) {
        if (e) this.group.remove(e.obj);
        const obj = new THREE.Group();
        const mat = b.userData.ragdoll ? this.matBody : this.matObj;
        for (const s of b.shapes) obj.add(this.meshForShape(s, mat));
        this.group.add(obj);
        e = { obj, shapeCount: b.shapes.length };
        this.entries.set(b, e);
      }
      interpPose(b, alpha, e.obj);
    }
    for (const [b, e] of this.entries) {
      if (!seen.has(b)) {
        this.group.remove(e.obj);
        this.entries.delete(b);
      }
    }
  }
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

export function interpPose(b, alpha, obj) {
  obj.position.set(
    b.framePos.x + (b.pos.x - b.framePos.x) * alpha,
    b.framePos.y + (b.pos.y - b.framePos.y) * alpha,
    b.framePos.z + (b.pos.z - b.framePos.z) * alpha,
  );
  _q.set(b.frameRot.x, b.frameRot.y, b.frameRot.z, b.frameRot.w);
  _q2.set(b.rot.x, b.rot.y, b.rot.z, b.rot.w);
  obj.quaternion.slerpQuaternions(_q, _q2, alpha);
}
