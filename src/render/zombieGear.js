import * as THREE from 'three';

/**
 * How each zombie looks (clothes, skin, how far gone it is: per person, from its id) and the
 * brute's riot gear - a ballistic vest and a helmet with a visor, riding on the chest and head
 * bodies. The helmet comes off when it has taken its last round and tumbles to the floor.
 */
const SHIRTS = [[0.62, 0.6, 0.55], [0.22, 0.3, 0.44], [0.48, 0.12, 0.1], [0.3, 0.32, 0.3], [0.58, 0.52, 0.38], [0.14, 0.14, 0.16], [0.42, 0.47, 0.52], [0.55, 0.36, 0.2]];
const PANTS = [[0.16, 0.21, 0.33], [0.36, 0.32, 0.24], [0.09, 0.09, 0.1], [0.27, 0.29, 0.25], [0.2, 0.24, 0.36]];
const SKIN = { walker: 0x9aa48b, runner: 0xb1b3a3, brute: 0x7f8270 };

function rng(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Material options for HumanMesh / createSkinMaterial. */
export function zombieLook(person) {
  const r = rng(person.id * 31 + 7);
  const kind = person.look || 'walker';
  const pick = (a) => a[Math.floor(r() * a.length)];
  const brute = kind === 'brute';
  return {
    color: SKIN[kind] ?? SKIN.walker,
    zombie: {
      shirt: brute ? [0.13, 0.14, 0.12] : pick(SHIRTS),
      pants: brute ? [0.12, 0.13, 0.11] : pick(PANTS),
      shoes: [0.06 + r() * 0.04, 0.05, 0.045],
      seed: r(),
      rot: 0.35 + 0.55 * r(),
      gore: 0.3 + 0.65 * r(),
      sleeves: brute ? 0.25 : r() < 0.6 ? 1 : 0.15,
    },
  };
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class ZombieGear {
  constructor(person, scene) {
    this.person = person;
    this.scene = scene;
    this.parts = [];
    this.loose = [];
    if (person.look !== 'brute') return;
    const armor = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.62, metalness: 0.25 });
    const strap = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.85 });
    const plate = new THREE.MeshStandardMaterial({ color: 0x2f3338, roughness: 0.45, metalness: 0.4 });
    // vest: an elliptic shell round the chest down to the waist, plates front and back, straps
    const vest = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.03, 1, 22, 1, true), armor);
    shell.scale.set(0.205, 0.38, 0.155);
    shell.position.set(0, -0.1, 0.0);
    shell.material.side = THREE.DoubleSide;
    vest.add(shell);
    for (const f of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.04), plate);
      p.position.set(0, -0.06, f * 0.15);
      vest.add(p);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.3), strap);
      s.position.set(f * 0.1, 0.11, 0.0);
      vest.add(s);
    }
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshBasicMaterial({ color: 0xbfc4c8 }));
    label.position.set(0, 0.02, 0.172);
    vest.add(label);
    this.attach(vest, 'chest', new THREE.Vector3(0, 0, 0.004));
    // helmet: a dome with a brim and a raised visor
    const helmet = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), armor);
    dome.scale.set(0.118, 0.115, 0.135);
    helmet.add(dome);
    const brim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 24), armor);
    brim.rotation.x = Math.PI / 2;
    brim.scale.set(0.12, 0.138, 0.12);
    brim.position.y = -0.015;
    helmet.add(brim);
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 8, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.18, Math.PI * 0.3),
      new THREE.MeshStandardMaterial({ color: 0x9fb4c0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    visor.scale.set(0.13, 0.13, 0.15);
    visor.rotation.y = 0;
    visor.position.set(0, 0.03, 0.005);
    helmet.add(visor);
    helmet.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.helmet = this.attach(helmet, 'head', new THREE.Vector3(0, 0.035, -0.008));
  }

  attach(obj, seg, offset) {
    obj.matrixAutoUpdate = true;
    obj.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.scene.add(obj);
    const part = { obj, body: this.person.rd.segments[seg].body, offset };
    this.parts.push(part);
    return part;
  }

  /** Follow the bodies (interpolated like the mesh's bones). */
  update(alpha = 1, dt = 0) {
    for (const p of this.parts) {
      const b = p.body;
      _p.set(b.framePos.x + (b.pos.x - b.framePos.x) * alpha, b.framePos.y + (b.pos.y - b.framePos.y) * alpha, b.framePos.z + (b.pos.z - b.framePos.z) * alpha);
      _q.set(b.frameRot.x, b.frameRot.y, b.frameRot.z, b.frameRot.w).slerp(new THREE.Quaternion(b.rot.x, b.rot.y, b.rot.z, b.rot.w), alpha);
      p.obj.position.copy(p.offset).applyQuaternion(_q).add(_p);
      p.obj.quaternion.copy(_q);
    }
    // a helmet knocked off tumbles to the floor
    for (const l of this.loose) {
      if (l.rest) continue;
      l.v.y -= 9.81 * dt;
      l.obj.position.addScaledVector(l.v, dt);
      l.obj.rotation.x += l.w.x * dt;
      l.obj.rotation.z += l.w.z * dt;
      const fy = (l.floorAt ? l.floorAt(l.obj.position.x, l.obj.position.z) : 0) + 0.06;
      if (l.obj.position.y < fy) {
        l.obj.position.y = fy;
        l.v.y *= -0.3;
        l.v.x *= 0.6;
        l.v.z *= 0.6;
        l.w.multiplyScalar(0.5);
        if (Math.abs(l.v.y) < 0.4) l.rest = true;
      }
    }
  }

  /** The helmet comes off (shot off): it flies along `dir` and falls. */
  dropHelmet(dir, floorAt) {
    const h = this.helmet;
    if (!h) return;
    this.parts = this.parts.filter((p) => p !== h);
    this.helmet = null;
    const v = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(2.5).add(new THREE.Vector3(0, 2.2, 0));
    this.loose.push({ obj: h.obj, v, w: new THREE.Vector3(8 * (Math.random() - 0.5), 0, 8 * (Math.random() - 0.5)), floorAt });
  }

  dispose() {
    for (const p of this.parts) this.scene.remove(p.obj);
    for (const l of this.loose) this.scene.remove(l.obj);
    this.parts.length = 0;
    this.loose.length = 0;
  }
}
