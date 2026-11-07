// STUB — replaced by the exterior aircraft module.
import * as THREE from 'three';
import { AIRCRAFT } from '../../core/constants.js';
function simpleAircraft(color = 0xf2f2f2) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.88, 1.88, 36, 24).rotateX(Math.PI / 2), m);
  fus.position.y = AIRCRAFT.fuselage.centerY;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(34, 0.3, 4), m);
  wing.position.set(0, -1.1, 1);
  g.add(fus, wing);
  return g;
}
export async function init(app) {
  const own = simpleAircraft();
  own.children[0].visible = false; // fuselage hidden in first person
  app.aircraftRoot.add(own);
  return { stub: true, createAircraft: (opts = {}) => ({ group: simpleAircraft(opts.color), setState() {} }), setFuselageVisible(v) { own.children[0].visible = v; } };
}
