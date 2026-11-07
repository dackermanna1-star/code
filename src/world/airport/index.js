// STUB — replaced by the airport module.
import * as THREE from 'three';
import { DEPARTURE, ARRIVAL, RUNWAY } from '../layout.js';
function build(def) {
  const g = new THREE.Group();
  g.position.set(...def.origin);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.9 });
  const rwy = new THREE.Mesh(new THREE.PlaneGeometry(RUNWAY.length, RUNWAY.width).rotateX(-Math.PI / 2), mat);
  rwy.position.y = 0.02;
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(1500, 160).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.9 }));
  apron.position.set(0, 0.02, -400);
  const term = new THREE.Mesh(new THREE.BoxGeometry(1200, 18, 80), new THREE.MeshStandardMaterial({ color: 0xb8c4cc, roughness: 0.5 }));
  term.position.set(0, 9, -515);
  g.add(rwy, apron, term);
  return g;
}
export async function init(app) {
  const dep = build(DEPARTURE), arr = build(ARRIVAL);
  app.worldRoot.add(dep, arr);
  app.events.on('world:arrivalMoved', ({ origin }) => arr.position.copy(origin));
  return { stub: true, airports: { departure: { group: dep, def: DEPARTURE }, arrival: { group: arr, def: ARRIVAL } } };
}
