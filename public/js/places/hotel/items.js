// What you carry, the things lying about that you can pick up (each with a
// small model of its own), and the notes left round the hotel.
import * as THREE from 'three';
import { H } from './state.js';
import { bake, boxGeo, cylGeo, sphereGeo, torusGeo, M4 } from './kit.js';
import * as T from './textures.js';

export const ITEMS = {
  flashlight: { name: 'Flashlight', icon: 'flash' },
  staffKey: { name: 'Staff Key', icon: 'key', desc: 'A heavy key on a brass tag: STAFF - ALL DOORS.' },
  officeKey: { name: "Manager's Office Key", icon: 'key', desc: 'A small key on a red tag: MANAGER.' },
  fuse: { name: 'Fuse', icon: 'fuse', stack: true },
  battery: { name: 'Battery', icon: 'battery', use: true },
  boltCutters: { name: 'Bolt Cutters', icon: 'cutters', desc: 'Long-handled bolt cutters. They could cut through a chain.' },
};

export class Inventory {
  constructor() { this.items = new Map(); }
  has(id) { return (this.items.get(id) || 0) > 0; }
  count(id) { return this.items.get(id) || 0; }
  add(id, n = 1) { this.items.set(id, this.count(id) + n); H.ui?.inventory(this); }
  remove(id, n = 1) { const c = this.count(id) - n; if (c > 0) this.items.set(id, c); else this.items.delete(id); H.ui?.inventory(this); }
  toJSON() { return [...this.items]; }
  load(list) { this.items = new Map(list || []); H.ui?.inventory(this); }
}

// --- the little models ------------------------------------------------------------------------------------------------------
function model(kind) {
  const M = H.M;
  switch (kind) {
    case 'key': return [new THREE.Mesh(bake([[torusGeo(0.18, 0.05, 12), M4(0, 0, 0)], [cylGeo(0.04, 0.04, 0.8, 6), M4(0.55, 0, 0, 0, 0, Math.PI / 2)], [boxGeo(0.1, 0.22, 0.04), M4(0.85, -0.1, 0)], [boxGeo(0.08, 0.14, 0.04), M4(0.7, -0.08, 0)]]), M.brass), new THREE.Mesh(boxGeo(0.4, 0.5, 0.03), M.cardboard)].map((m, i) => { if (i) m.position.set(-0.35, -0.35, 0); return m; });
    case 'fuse': return [new THREE.Mesh(cylGeo(0.16, 0.16, 0.7, 10), M.glass), new THREE.Mesh(bake([[cylGeo(0.19, 0.19, 0.18, 10), M4(0, 0.36, 0)], [cylGeo(0.19, 0.19, 0.18, 10), M4(0, -0.36, 0)], [cylGeo(0.03, 0.03, 0.6, 4), M4(0, 0, 0)]]), M.brass)].map((m) => { m.rotation.z = Math.PI / 2; return m; });
    case 'battery': return [new THREE.Mesh(cylGeo(0.14, 0.14, 0.55, 10), new THREE.MeshStandardMaterial({ color: 0x8a1a10, roughness: 0.5, metalness: 0.3 })), new THREE.Mesh(cylGeo(0.06, 0.06, 0.08, 6), M.chrome)].map((m, i) => { if (i) m.position.y = 0.3; m.rotation.z = Math.PI / 2; return m; });
    case 'cutters': {
      const g = bake([[boxGeo(0.12, 3.0, 0.1), M4(-0.18, -1.2, 0, 0, 0, 0.08)], [boxGeo(0.12, 3.0, 0.1), M4(0.18, -1.2, 0, 0, 0, -0.08)], [boxGeo(0.3, 0.6, 0.12), M4(0, 0.5, 0)], [boxGeo(0.12, 0.5, 0.1), M4(-0.1, 1.0, 0, 0, 0, 0.15)], [boxGeo(0.12, 0.5, 0.1), M4(0.1, 1.0, 0, 0, 0, -0.15)]]);
      const grips = bake([[cylGeo(0.1, 0.1, 1.0, 6), M4(-0.28, -2.4, 0, 0, 0, 0.08)], [cylGeo(0.1, 0.1, 1.0, 6), M4(0.28, -2.4, 0, 0, 0, -0.08)]]);
      return [new THREE.Mesh(g, M.iron), new THREE.Mesh(grips, new THREE.MeshStandardMaterial({ color: 0xa01810, roughness: 0.6 }))];
    }
    case 'flash': return [new THREE.Mesh(bake([[cylGeo(0.16, 0.16, 1.1, 10), M4(0, 0, 0, Math.PI / 2, 0, 0)], [cylGeo(0.26, 0.17, 0.35, 12), M4(0, 0, 0.7, Math.PI / 2, 0, 0)]]), M.chrome), new THREE.Mesh(cylGeo(0.22, 0.22, 0.02, 12), new THREE.MeshBasicMaterial({ color: 0x7a7060 }))].map((m, i) => { if (i) { m.rotation.x = Math.PI / 2; m.position.z = 0.88; } return m; });
    default: return [new THREE.Mesh(sphereGeo(0.2, 8), M.brass)];
  }
}

/**
 * Something you can pick up. o: {pos, ry, kind (model), mesh (an existing object instead), name, verb, hidden,
 * onTake(), give (inventory id, default id), count}
 */
export function pickup(id, o) {
  const g = new THREE.Group();
  if (o.mesh) g.add(o.mesh);
  else for (const m of model(o.kind || ITEMS[id]?.icon)) { m.castShadow = true; g.add(m); }
  g.position.copy(o.pos); g.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  if (o.scale) g.scale.setScalar(o.scale);
  H.world.scene.add(g);
  const name = o.name || ITEMS[o.give || id]?.name || id;
  const it = {
    id, g, taken: false,
    handle: H.interact.add({
      pos: o.pos.clone().add(new THREE.Vector3(0, o.lift ?? 0.2, 0)), r: o.r ?? 5, size: 0.6, cone: 0.22, label: () => name, verb: o.verb || 'Take',
      can: () => !it.taken && (!o.can || o.can()),
      act: () => take(),
    }),
  };
  const take = () => {
    if (it.taken) return;
    it.taken = true;
    H.world.scene.remove(g);
    H.interact.remove(it.handle);
    const give = o.give === null ? null : (o.give || id);
    if (give) H.inv.add(give, o.count || 1);
    H.audio?.pickup(o.pos, o.kind || ITEMS[give]?.icon);
    if (give && ITEMS[give]) H.ui?.toast(`${ITEMS[give].name}${ITEMS[give].desc ? `<small>${ITEMS[give].desc}</small>` : ''}`);
    o.onTake?.();
    H.story?.event('take:' + id);
  };
  it.take = take;
  (H.pickups ||= new Map()).set(id, it);
  return it;
}

/** Throw away a pickup that's already been taken (loading a save). */
export function alreadyTaken(id) {
  const it = H.pickups?.get(id);
  if (!it || it.taken) return;
  it.taken = true; H.world.scene.remove(it.g); H.interact.remove(it.handle);
}

/** A note lying somewhere (a sheet of paper, or on o.mesh). */
export function note(id, o) {
  const M = H.M;
  let mesh = null;
  if (!o.noMesh) {
    const tex = T.paper(o.seed || id.length * 7 + 3, { typed: o.typed });
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.w ?? 0.9, o.h ?? 1.15), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    mesh.position.copy(o.pos);
    if (o.wall) mesh.rotation.set(0, o.ry || 0, o.rz || 0);
    else mesh.rotation.set(-Math.PI / 2, 0, o.ry || 0);
    mesh.receiveShadow = true;
    H.world.scene.add(mesh);
  }
  void M;
  const n = {
    id, title: o.title, text: o.text, read: false, mesh,
    handle: H.interact.add({ pos: o.pos.clone().add(new THREE.Vector3(0, 0.15, 0)), r: o.r ?? 4.5, size: 0.5, cone: 0.25, label: () => o.title, verb: 'Read', act: () => readNote(n) }),
  };
  (H.notes ||= []).push(n);
  return n;
}
export function readNote(n) {
  if (!n.read) { n.read = true; H.story?.event('read:' + n.id); }
  H.audio?.paper();
  H.ui?.showNote(n.title, typeof n.text === 'function' ? n.text() : n.text);
}
