// What you're wearing and carrying, on your figure, seen in third person. A helmet, cap, beanie or fur
// hat on the head; a vest over the shirt; a backpack sized to its capacity;
// the gun in your hands and the long gun or melee weapon slung on your back.
// Each piece follows a limb's matrix from the crowd every frame.
import * as THREE from 'three';
import { O } from '../state.js';
import { def } from './inventory.js';
import { buildGun } from '../../warzone/guns.js';
import { itemModel } from './loot.js';

const mats = new Map();
const mat = (col, rough = 0.85) => { const k = col + ':' + rough; if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: 0.05 })); return mats.get(k); };
const FIX = new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
const _t = new THREE.Matrix4(), _r = new THREE.Matrix4();

function headModel(it) {
  const d = def(it), col = it.tint || d.color || '#444', g = new THREE.Group();
  const dome = (r, y, sy, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(c)); m.position.y = y; m.scale.y = sy; return m; };
  if (d.shape === 'helmet') {
    g.add(dome(0.74, 0.08, 0.92, col));
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.82, 0.08, 16), mat(col)); brim.position.y = 0.08; g.add(brim);
  } else if (d.shape === 'cap') {
    g.add(dome(0.66, 0.2, 0.7, col));
    const bill = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.55), mat(col)); bill.position.set(0, 0.22, 0.75); bill.rotation.x = -0.12; g.add(bill);
  } else if (d.shape === 'beanie') {
    g.add(dome(0.66, 0.16, 0.95, col));
  } else if (d.shape === 'ushanka') {
    g.add(dome(0.74, 0.12, 0.9, col));
    for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.62), mat(col)); f.position.set(s * 0.66, -0.12, 0); g.add(f); }
  } else if (d.light) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.63, 0.12, 16, 1, true), mat('#222')); band.position.y = 0.25; g.add(band);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.12), mat('#2a2a2a')); lamp.position.set(0, 0.25, 0.64); g.add(lamp);
  } else return null;
  return g;
}
function vestModel(it) {
  const d = def(it), g = new THREE.Group(), col = it.tint || d.color || '#3a3a30';
  const thick = it.id === 'chestRig' ? 0.1 : 0.16;
  for (const z of [1, -1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.35, thick), mat(col)); p.position.set(0, 0.25, z * (0.5 + thick / 2)); g.add(p); }
  for (const x of [-1, 1]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 1.0), mat(col)); s.position.set(x * 0.98, 0.15, 0); g.add(s); }
  // pouches on the front
  for (let k = 0; k < 3; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.18), mat(col)); p.position.set(-0.55 + k * 0.55, -0.1, 0.5 + thick + 0.09); g.add(p); }
  return g;
}
function packModel(it) {
  const d = def(it), cargo = d.wear.cargo || [4, 4], col = it.tint || d.color || '#5a5a3a', g = new THREE.Group();
  const w = 1.1 + cargo[0] * 0.08, h = 1.1 + cargo[1] * 0.14, dep = 0.45 + cargo[0] * 0.05;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, dep), mat(col)); body.position.set(0, 0.15 - (h - 1.6) / 2, -0.5 - dep / 2 - 0.02); g.add(body);
  const flap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.25, dep * 0.9), mat(new THREE.Color(col).multiplyScalar(0.8).getStyle())); flap.position.set(0, body.position.y + h / 2, body.position.z); g.add(flap);
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, h * 0.35, 0.2), mat(col)); pocket.position.set(0, body.position.y - h * 0.18, body.position.z - dep / 2 - 0.1); g.add(pocket);
  for (const s of [-1, 1]) { const strap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.9, 0.08), mat('#222')); strap.position.set(s * 0.5, 0.15, 0.53); g.add(strap); }
  return g;
}

export class Gear {
  constructor(world) {
    this.world = world;
    this.parts = { head: null, vest: null, back: null, hands: null, slung: null };
    this.keys = {};
  }
  _set(slot, it, make) {
    const key = it ? it.uid + ':' + (it.tint || '') + ':' + JSON.stringify(it.attach || {}) : '';
    if (this.keys[slot] === key) return this.parts[slot];
    this.keys[slot] = key;
    const old = this.parts[slot];
    if (old) { this.world.scene.remove(old); old.traverse((m) => m.geometry?.dispose()); }
    let g = null;
    if (it) { try { g = make(it); } catch { g = null; } }
    if (g) {
      g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      const holder = new THREE.Group(); holder.add(g); holder.matrixAutoUpdate = false;
      this.world.scene.add(holder); g = holder;
    }
    this.parts[slot] = g;
    return g;
  }
  _gun(it) {
    const d = def(it);
    const info = buildGun(d.gun, Object.values(it.attach || {}).filter(Boolean).filter((a) => d.attach?.includes(a)));
    info.group.scale.setScalar(3.0);
    return info.group;
  }

  /** person: the figure (its limb matrices are fresh from the crowd); show: whether to draw it all. */
  update(person, inv, show) {
    const s = inv?.slots || {};
    const hands = s.hands && def(s.hands).gun ? s.hands : null;
    // a rifle or melee weapon not in your hands hangs across your back
    const slungIt = s.shoulder && s.shoulder !== s.hands ? s.shoulder : s.melee && s.melee !== s.hands ? s.melee : null;
    const head = this._set('head', s.head, headModel), vest = this._set('vest', s.vest, vestModel), back = this._set('back', s.back, packModel);
    const gun = this._set('hands', hands, (it) => this._gun(it));
    const slung = this._set('slung', slungIt, (it) => (def(it).gun ? this._gun(it) : itemModel(it)));
    const vis = show && person && !person.hidden && !person.culled && person.mats;
    for (const g of [head, vest, back, gun, slung]) if (g) g.visible = !!vis;
    if (!vis) return;
    const put = (g, base, local) => { if (!g) return; g.matrix.copy(base); if (local) g.matrix.multiply(local); g.matrixWorldNeedsUpdate = true; };
    put(head, person.mats[0], _t.makeTranslation(0, 0.18, 0));
    put(vest, person.mats[1]);
    put(back, person.mats[1]);
    if (gun) { const hm = O.crowd.handMatrix(person, new THREE.Matrix4()); if (hm) put(gun, hm, FIX); else gun.visible = false; }
    if (slung) {
      // across the back, muzzle up and to the left
      const m = _t.makeTranslation(0.1, 0.1, back ? -1.45 : -0.75).multiply(_r.makeRotationZ(-0.85)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
      put(slung, person.mats[1], def(slungIt).gun ? m.multiply(new THREE.Matrix4().makeScale(1, 1, 1)) : m);
    }
  }
}
