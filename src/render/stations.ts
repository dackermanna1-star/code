/**
 * Procedural models of crewed orbital stations (no external assets), in
 * station axes: +X along track, +Y zenith, +Z = X × Y. Solar array wings
 * turn about the truss / module axis (Z) to face the Sun, as the real
 * alpha joints do. Docking ports carry a small ring and a target light.
 */
import * as THREE from 'three';
import type { Body } from '../astro/body';
import { preExposed } from './shipmodels';

function mat(color: number, rough: number, metal: number) {
  return preExposed(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
}

interface ArrayPivot {
  obj: THREE.Object3D;
  /** panel normal at zero rotation (station axes, in the XY plane) */
  n0: number;
}

export interface StationModel {
  group: THREE.Group;
  arrays: ArrayPivot[];
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3();

export function buildStation(b: Body): StationModel {
  const info = b.station!;
  const g = new THREE.Group();
  const arrays: ArrayPivot[] = [];
  const white = mat(0xe6e4dc, 0.62, 0.08), cloth = mat(0xd9d2c0, 0.85, 0.0), grey = mat(0x9aa0a8, 0.45, 0.7), dark = mat(0x3a3e44, 0.5, 0.6);
  const cell = mat(0x23294a, 0.28, 0.55), cellGold = mat(0x6a4a22, 0.35, 0.7), radiator = mat(0xf6f6f2, 0.5, 0.05);
  const ringMat = mat(0x707680, 0.35, 0.85);
  const beacon = preExposed(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x80ffb0, emissiveIntensity: 1.5 }));

  const cylX = (r: number, x0: number, x1: number, y = 0, z = 0, m: THREE.Material = white, r1 = r) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r, x1 - x0, 24), m);
    c.rotation.z = -Math.PI / 2; // +Y → +X
    c.position.set((x0 + x1) / 2, y, z);
    g.add(c);
    return c;
  };
  const cylY = (r: number, y0: number, y1: number, x = 0, z = 0, m: THREE.Material = white) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, y1 - y0, 24), m);
    c.position.set(x, (y0 + y1) / 2, z);
    g.add(c);
    return c;
  };
  const cylZ = (r: number, z0: number, z1: number, x = 0, y = 0, m: THREE.Material = white) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, z1 - z0, 24), m);
    c.rotation.x = Math.PI / 2; // +Y → +Z
    c.position.set(x, y, (z0 + z1) / 2);
    g.add(c);
    return c;
  };
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, m: THREE.Material) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  /** a rotating pair of wings about an axis parallel to Z through (x, y, z) */
  const wings = (x: number, y: number, z: number, len: number, width: number, along: 'x' | 'y', gap: number, front: THREE.Material) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? len : 0.08, along === 'y' ? len : 0.08, width), front);
      const off = s * (gap + len / 2);
      w.position.set(along === 'x' ? off : 0, along === 'y' ? off : 0, 0);
      // grid lines: a slightly larger frame behind the cells
      const frame = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? len + 0.3 : 0.05, along === 'y' ? len + 0.3 : 0.05, width + 0.3), cellGold);
      frame.position.copy(w.position);
      frame.position.x -= along === 'y' ? 0.06 : 0;
      frame.position.y -= along === 'x' ? 0.06 : 0;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 6), grey);
      if (along === 'x') mast.rotation.z = Math.PI / 2;
      mast.position.copy(w.position);
      pivot.add(w, frame, mast);
    }
    g.add(pivot);
    arrays.push({ obj: pivot, n0: along === 'y' ? 0 : Math.PI / 2 });
    return pivot;
  };
  /** docking adapter ring + target light at a port */
  const port = (p: [number, number, number], d: [number, number, number]) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.12, 8, 24), ringMat);
    const dir = new THREE.Vector3(...d);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    ring.position.set(...p).addScaledVector(dir, -0.1);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), beacon);
    const side = new THREE.Vector3(1, 1, 1).sub(dir.clone().multiply(dir)).normalize(); // perpendicular to the axis
    lamp.position.set(...p).addScaledVector(side, 0.95);
    g.add(ring, lamp);
  };

  if (info.model === 'iss') {
    // pressurised modules along the flight direction
    cylX(2.1, -38.5, -27, 0, 0, white); cylX(1.4, -27, -25.2, 0, 0, white);   // Zvezda
    cylX(2.05, -25.2, -12.6, 0, 0, white);                                    // Zarya
    cylX(2.25, -12.6, -7, 0, 0, cloth);                                       // Unity
    cylX(2.2, -7, 1.5, 0, 0, cloth);                                          // Destiny
    cylX(2.2, 1.5, 9.2, 0, 0, cloth);                                         // Harmony
    cylX(0.95, 9.2, 11.7, 0, 0, white, 1.45);                                 // PMA-2
    cylX(0.9, 11.7, 12.4, 0, 0, dark);                                        // IDA-2
    cylY(0.9, 2.1, 4.0, 6, 0, white); cylY(0.85, 4.0, 4.7, 6, 0, dark);       // PMA-3 / IDA-3
    cylY(1.2, -2.0, -6.5, -18.5, 0, white); cylY(0.8, -6.5, -7.2, -18.5, 0, dark); // Rassvet
    cylZ(2.2, 2.1, 9, 6, 0, cloth);                                           // Columbus
    cylZ(2.2, -2.1, -13.4, 6, 0, cloth);                                      // Kibo
    box(4, 3, 5.5, 6, 0, -16.5, white);                                       // Kibo exposed facility
    cylZ(2.2, -2.2, -9, -9.8, 0, cloth);                                      // Tranquility
    cylY(1.3, -2.2, -3.6, -9.8, 0, cloth).position.z = -6.5;                  // Cupola
    // Zvezda's fixed arrays
    for (const s of [-1, 1]) box(3.4, 0.08, 12.5, -31, 0, s * 8.8, cell).rotation.x = 0.2 * s;
    // integrated truss above the modules
    box(4.2, 3.2, 109, -6, 6.2, 0, grey);
    for (let i = -10; i <= 10; i++) box(4.4, 3.4, 0.25, -6, 6.2, i * 5.2, dark);
    // radiators
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      const r = box(23, 0.1, 3.2, -19, 6.2 - 0.6 * k, s * (14 + k * 3.5), radiator);
      r.rotation.z = -0.25;
    }
    // eight solar array wings on four power modules, rotated by the alpha joints
    for (const zc of [-50.5, -35.5, 35.5, 50.5]) wings(-6, 6.2, zc, 34, 11.6, 'y', 2.2, cell);
    // the mobile base and Canadarm2
    const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 9, 8), white);
    arm1.position.set(-6, 9.6, 8);
    arm1.rotation.z = 1.0;
    const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8, 8), white);
    arm2.position.set(-9.4, 13.2, 8);
    arm2.rotation.z = -0.35;
    g.add(arm1, arm2);
  } else {
    // Tianhe core, node and the two laboratory modules on the node's sides
    cylX(2.1, -9.5, 5.5, 0, 0, white); cylX(1.4, 5.5, 10.4, 0, 0, white);
    const node = new THREE.Mesh(new THREE.SphereGeometry(1.45, 24, 16), white);
    node.position.set(11.8, 0, 0);
    g.add(node);
    cylX(0.9, 13.0, 14.6, 0, 0, dark);
    cylY(0.85, -1.3, -2.9, 11.8, 0, dark);
    cylX(0.9, -9.9, -9.5, 0, 0, dark);
    cylZ(2.1, 1.3, 18.5, 11.8, 0, white);   // Wentian
    cylZ(2.1, -1.3, -18.5, 11.8, 0, white); // Mengtian
    for (const s of [-1, 1]) {
      wings(11.8, 0, s * 16.5, 26, 4.4, 'x', 2.4, cell);
      box(3, 0.08, 11, -5, 0, s * 8, cell).rotation.x = 0.1 * s; // Tianhe's own arrays
    }
    for (const s of [-1, 1]) box(6, 0.1, 2.4, 11.8, 2.6, s * 9, radiator);
  }
  for (const p of info.ports) port(p.pos, p.dir);
  return { group: g, arrays };
}

export class StationRenderer {
  readonly model: StationModel;
  readonly root = new THREE.Group();

  constructor(readonly body: Body) {
    this.model = buildStation(body);
    this.root.add(this.model.group);
  }

  /** Place the station and turn its arrays toward the Sun (sunDir: world, unit). */
  update(rel: THREE.Vector3, q: THREE.Quaternion, sunDir: THREE.Vector3 | null) {
    this.root.position.copy(rel);
    this.model.group.quaternion.copy(q);
    if (!sunDir) return;
    const s = _v.copy(sunDir).applyQuaternion(_q.copy(q).invert());
    const a = Math.atan2(s.y, s.x);
    for (const p of this.model.arrays) p.obj.rotation.z = a - p.n0;
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}
