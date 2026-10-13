// The boss trophy (zombie survival, Milestone 3.4: relics.js TROPHY): a gold skull idol on a
// stone plinth, horned in the boss's colour, under a tall beam of that colour you can spot
// across the map, with a ring on the floor. Procedural; GoldSrc axes (z up, the origin on the
// floor). pickups.js spins and bobs the parts (MODELS.bosstrophy, registered by bosses.js).
// Geometry and materials are shared (one set per colour): pickups never disposes them.
import * as THREE from 'three';

const GEO = new Map(), MAT = new Map();
const geo = (key, make) => GEO.get(key) || (GEO.set(key, make()), GEO.get(key));
const mat = (key, make) => MAT.get(key) || (MAT.set(key, make()), MAT.get(key));
const basic = (hex) => mat(`b${hex}`, () => new THREE.MeshBasicMaterial({ color: hex }));
const glow = (hex, opacity) => mat(`g${hex}:${opacity}`, () => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
const part = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };

/** MODELS-style builder: d = { id, data: { rgb } } -> the meshes. */
export function buildTrophy(d) {
  const rgb = d?.data?.rgb || [255, 190, 60];
  const hex = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
  const gold = basic(0xe8b236), goldDark = basic(0x9a6a18), stone = basic(0x2c2620), dark = basic(0x140c06);
  const out = [];
  // the plinth
  out.push(part(geo('plinth', () => new THREE.BoxGeometry(14, 14, 4)), stone, 0, 0, 2));
  out.push(part(geo('trim', () => new THREE.BoxGeometry(15, 15, 1.2)), goldDark, 0, 0, 4.4));
  // the skull: cranium, cheeks, jaw, sockets, teeth
  const cr = part(geo('cranium', () => new THREE.SphereGeometry(5.4, 14, 10)), gold, 0, 0, 12.5);
  cr.scale.set(1.05, 0.92, 1);
  out.push(cr);
  out.push(part(geo('cheek', () => new THREE.BoxGeometry(6.4, 7.6, 3.4)), gold, 1.2, 0, 8.6));
  out.push(part(geo('jaw', () => new THREE.BoxGeometry(5, 6, 2.2)), goldDark, 1.8, 0, 6.2));
  for (const s of [-1, 1]) {
    out.push(part(geo('socket', () => new THREE.SphereGeometry(1.45, 8, 6)), dark, 4.4, 2.1 * s, 11.6));
    // horns in the boss's colour, curling up and out
    const h = part(geo('horn', () => new THREE.ConeGeometry(1.5, 8, 8).rotateX(Math.PI / 2)), basic(hex), -0.5, 4.6 * s, 15);
    h.rotation.x = -0.75 * s;
    out.push(h);
  }
  out.push(part(geo('nose', () => new THREE.BoxGeometry(1, 1.6, 1.8)), dark, 5.2, 0, 9.6));
  out.push(part(geo('teeth', () => new THREE.BoxGeometry(1, 5, 0.9)), basic(0xfff0c0), 4.1, 0, 7.4));
  // the beam and the floor ring (additive, the boss's colour)
  const beam = part(geo('beam', () => new THREE.CylinderGeometry(5, 9, 150, 16, 1, true).rotateX(Math.PI / 2)), glow(hex, 0.2), 0, 0, 78);
  beam.renderOrder = 5;
  out.push(beam);
  const core = part(geo('core', () => new THREE.CylinderGeometry(1.4, 2.4, 110, 8, 1, true).rotateX(Math.PI / 2)), glow(0xfff0c0, 0.35), 0, 0, 60);
  core.renderOrder = 5;
  out.push(core);
  const ring = part(geo('ring', () => new THREE.RingGeometry(13, 17, 40)), glow(hex, 0.5), 0, 0, 0.6);
  ring.renderOrder = 5;
  out.push(ring);
  return out;
}
