// STUB — replaced by the seats + driver cockpit module. Implements the descriptor contract.
import * as THREE from 'three';
import { SEAT_LIST, SEAT } from '../core/constants.js';
export async function init(app) {
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.44, 0.9, 0.5), new THREE.MeshStandardMaterial({ color: 0x1f4b52, roughness: 0.9 }), SEAT_LIST.length);
  const m = new THREE.Matrix4();
  const list = SEAT_LIST.map((s, i) => {
    m.makeTranslation(s.x, 0.45, s.z + 0.05);
    inst.setMatrixAt(i, m);
    return {
      ...s,
      position: new THREE.Vector3(s.x, SEAT.cushionY, s.z),
      eye: new THREE.Vector3(s.x, SEAT.seatedEyeHeight, s.z + 0.12),
      standPoint: new THREE.Vector3(0, 0, s.z + 0.1),
      state: { recline: 0, belt: false, armrest: 0, footrest: 0, tray: 0, occupied: false },
    };
  });
  app.cabinRoot.add(inst);
  const byId = new Map(list.map((s) => [s.id, s]));
  const driver = { id: 'driver', eye: new THREE.Vector3(-0.68, 0.8, -5.62), standPoint: new THREE.Vector3(-0.1, -0.42, -5.2) };
  return { stub: true, list, byId: (id) => (id === 'driver' ? driver : byId.get(id)), driver };
}
