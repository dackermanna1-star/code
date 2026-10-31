// Stand-in for the zombie looks: a capsule mannequin following the ragdoll's bodies.
import * as THREE from 'three';

const MAT = new THREE.MeshLambertMaterial({ color: 0x7a8a6a });
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

export async function prepareZombieMeshes() {}

export function createZombieVisual(person, kind, scene) {
  const group = new THREE.Group();
  const parts = [];
  for (const b of person.rd.allBodies()) {
    const g = new THREE.Group();
    for (const s of b.shapes) {
      let geo;
      if (s.type === 1) geo = new THREE.CapsuleGeometry(s.radius, s.halfHeight * 2, 3, 6);
      else if (s.type === 2) geo = new THREE.BoxGeometry(s.halfExtents.x * 2 + s.radius * 2, s.halfExtents.y * 2 + s.radius * 2, s.halfExtents.z * 2 + s.radius * 2);
      else geo = new THREE.SphereGeometry(s.radius, 8, 6);
      const m = new THREE.Mesh(geo, MAT);
      m.position.set(s.localPos.x, s.localPos.y, s.localPos.z);
      m.quaternion.set(s.localRot.x, s.localRot.y, s.localRot.z, s.localRot.w);
      g.add(m);
    }
    group.add(g);
    parts.push([b, g]);
  }
  scene.add(group);
  return {
    object: group, hm: null,
    update(alpha = 1) {
      for (const [b, g] of parts) {
        g.position.set(b.framePos.x + (b.pos.x - b.framePos.x) * alpha, b.framePos.y + (b.pos.y - b.framePos.y) * alpha, b.framePos.z + (b.pos.z - b.framePos.z) * alpha);
        _q.set(b.frameRot.x, b.frameRot.y, b.frameRot.z, b.frameRot.w);
        _q2.set(b.rot.x, b.rot.y, b.rot.z, b.rot.w);
        g.quaternion.slerpQuaternions(_q, _q2, alpha);
      }
    },
    setWounds() {},
    setPhysiology() {},
    addFracture() {},
    setHidden(on) {
      group.visible = !on;
    },
    dispose() {
      scene.remove(group);
    },
  };
}
