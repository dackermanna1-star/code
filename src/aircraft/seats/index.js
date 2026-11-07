// STUB — replaced by the seats module. Implements the seat descriptor contract
// (see docs/ARCHITECTURE.md) with placeholder boxes.
import * as THREE from 'three';
import { SEAT_LIST, SEAT, AISLE } from '../../core/constants.js';
export async function init(app) {
  const list = [];
  const geo = new THREE.BoxGeometry(0.42, 0.9, 0.5);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1d3557, roughness: 0.9 });
  const inst = new THREE.InstancedMesh(geo, mat, SEAT_LIST.length);
  const m = new THREE.Matrix4();
  SEAT_LIST.forEach((s, i) => {
    const dims = s.cls === 'business' ? SEAT.business : SEAT.economy;
    m.makeTranslation(s.x, 0.45, s.z + 0.05);
    inst.setMatrixAt(i, m);
    const anchor = new THREE.Object3D();
    anchor.name = `screenAnchor-${s.id}`;
    anchor.position.set(s.x, 0.88, s.z - (s.bulkheadInFront ? 0.6 : dims.pitch - 0.33));
    app.cabinRoot.add(anchor);
    list.push({
      ...s,
      position: new THREE.Vector3(s.x, dims.cushionY, s.z),
      eye: new THREE.Vector3(s.x, SEAT.seatedEyeHeight, s.z + 0.12),
      standPoint: new THREE.Vector3(0, 0, s.z + 0.1),
      screenAnchor: anchor,
      screenSize: { w: 0.256, h: 0.16 },
      state: { tray: 0, recline: 0, belt: false, armrests: [0, 0], occupied: false },
    });
  });
  app.cabinRoot.add(inst);
  const byId = new Map(list.map((s) => [s.id, s]));
  return { stub: true, list, byId: (id) => byId.get(id), aisleHalfWidth: AISLE.halfWidth };
}
