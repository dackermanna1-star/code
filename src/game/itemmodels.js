// Low-poly PS1 weapon & item model library (procedural, vertex-coloured, one shared material).
//
// Weapons: forward (barrel / blade) = -Z, +Y up, origin = right-hand grip.
// Items:   origin = bottom-centre resting on the floor, upright, front = +Z.
//
// root.userData (weapons):
//   id, kind ('pistol'|'smg'|'shotgun'|'rifle'|'sniper'|'launcher'|'mg'|'chainsaw'|'melee'),
//   muzzle   Vector3 | null   muzzle tip (firearms + chainsaw bar tip; null for melee)
//   tip      Vector3          muzzle for guns, striking point / blade tip for melee
//   leftHand Vector3          support-hand position
//   mag      Object3D | null  magazine mesh (shotguns/launcher: 'mag' loading-port marker whose child shell mesh is hidden)
//   pump     Object3D | null  pump shotgun fore-end (slides along +Z)
//   slide    Object3D | null  pistol slide (slides along +Z)
//   barrel   Object3D         grenade launcher only: barrel group, pivot at the break-action hinge (rotate +X to open)
//   twoHanded (melee), length (Z extent, m), size Vector3, bounds Box3, tris, viewmodel
// root.userData (items): id, kind 'item', category, length (largest dimension), size, bounds, tris,
//   plus light (pipebomb blinking light mesh) and wick (molotov rag tip Vector3).
//
// Models are cached per (id, viewmodel); every call returns a fresh Object3D whose geometry and
// material are SHARED with the cache - do not dispose them. Pass { cache: false } for unique geometry.
import * as THREE from 'three';
import { assemble, instantiate, itemMaterial as sharedMaterial, itemAtlas } from './models/kit.js';
import { FIREARMS_A } from './models/firearms_a.js';
import { FIREARMS_B } from './models/firearms_b.js';
import { MELEE } from './models/melee.js';
import { ITEMS } from './models/items.js';

export const WEAPON_IDS = ['pistol', 'magnum', 'smg', 'smg_silenced', 'pump_shotgun', 'chrome_shotgun', 'auto_shotgun', 'spas', 'm16', 'ak47', 'scar', 'hunting_rifle', 'sniper_military', 'grenade_launcher', 'm60', 'chainsaw',
  'fireaxe', 'crowbar', 'cricket_bat', 'baseball_bat', 'katana', 'knife', 'golf_club', 'frying_pan', 'machete', 'guitar'];
export const ITEM_IDS = ['medkit', 'defib', 'pills', 'adrenaline', 'pipebomb', 'molotov', 'bilejar', 'upgrade_incendiary', 'upgrade_explosive', 'laser_sight', 'gascan', 'propane', 'oxygen', 'fireworks', 'cola', 'ammo_pile'];
export const MELEE_IDS = Object.keys(MELEE);
export const FIREARM_IDS = WEAPON_IDS.filter((id) => !MELEE[id]);

const WEAPONS = { ...FIREARMS_A, ...FIREARMS_B, ...MELEE };
const cache = new Map();

/** The single shared PS1 material (vertex colours x 128px items atlas, dynamic lighting). */
export function itemMaterial() { return sharedMaterial(); }
export { itemAtlas };

function finishWeapon(root, id) {
  const ud = root.userData;
  ud.id = id;
  ud.kind = ud.kind || 'melee';
  for (const key of ['mag', 'pump', 'slide']) if (ud[key] === undefined) ud[key] = null;
  if (ud.kind === 'melee') ud.muzzle = null;
  if (!ud.tip) ud.tip = ud.muzzle ? ud.muzzle.clone() : new THREE.Vector3(0, 0, -ud.size.z);
  if (!ud.leftHand) ud.leftHand = new THREE.Vector3(0, 0, 0.08);
  ud.length = ud.bounds.max.z - ud.bounds.min.z;
  root.name = 'weapon:' + id;
  return root;
}

/** Shift an item so its bounds are centred in X/Z and rest on y = 0. */
function groundItem(root) {
  const b = root.userData.bounds;
  const off = new THREE.Vector3(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  for (const c of root.children) c.position.add(off);
  for (const key in root.userData) { const val = root.userData[key]; if (val && val.isVector3 && key !== 'size') val.add(off); }
  b.translate(off);
  return root;
}

function finishItem(root, id) {
  groundItem(root);
  const ud = root.userData;
  ud.id = id; ud.kind = 'item';
  ud.length = Math.max(ud.size.x, ud.size.y, ud.size.z);
  ud.muzzle = null; ud.leftHand = null; ud.mag = null; ud.pump = null;
  root.name = 'item:' + id;
  return root;
}

function get(id, opts, table, finish, label) {
  const build = table[id];
  if (!build) throw new Error(`unknown ${label} id "${id}"`);
  if (opts.cache === false) return finish(assemble(build, opts), id);
  const key = id + (opts.viewmodel ? ':vm' : ':tp');
  let tpl = cache.get(key);
  if (!tpl) { tpl = finish(assemble(build, opts), id); cache.set(key, tpl); }
  return instantiate(tpl);
}

/** Build a weapon model. opts.viewmodel adds first-person detail (sights, ribs, extra segments). */
export function buildWeaponModel(id, opts = {}) { return get(id, opts, WEAPONS, finishWeapon, 'weapon'); }

/** Build a pickup / throwable / carryable item model (bottom-centre origin, front +Z). */
export function buildItemModel(id, opts = {}) { return get(id, opts, ITEMS, finishItem, 'item'); }

export function isMelee(id) { return !!MELEE[id]; }
