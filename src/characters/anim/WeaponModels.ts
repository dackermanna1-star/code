// Weapon visuals for characters: builds the held/slung weapon object from ctx.combat.createWeaponModel
// (when implemented), else the weapon def's GLB, else a procedural stand-in with the same named nodes
// (origin at the firing grip, barrel +Z, nodes: muzzle, grip_support, sight_eye, mag).
import * as THREE from 'three';
import { ctx } from '../../core/GameContext';
import { Assets } from '../../core/Assets';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { IWeaponInstance } from '../../core/contracts';
import type { WeaponClass } from '../../core/types';

export type HoldStyle = 'rifle' | 'pistol' | 'melee' | 'throwable';

export function holdStyleFor(cls: WeaponClass | undefined): HoldStyle | null {
  if (!cls) return null;
  if (cls === 'pistol') return 'pistol';
  if (cls === 'melee') return 'melee';
  if (cls === 'throwable') return 'throwable';
  return 'rifle';
}

export interface WeaponVisual {
  object: THREE.Object3D;
  style: HoldStyle;
  weapon: IWeaponInstance;
  /** Nodes (may be null until the asset is loaded). */
  muzzle: THREE.Object3D | null;
  support: THREE.Object3D | null;
  sightEye: THREE.Object3D | null;
  mag: THREE.Object3D | null;
  /** Upward offset (weapon space, m) that clears the rear sight for the ADS eye; computed per sight node. */
  sightLift?: number;
  sightLiftFor?: THREE.Object3D | null;
}

const procCache = new Map<string, THREE.Object3D>();
const MAT_METAL = new THREE.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 0.45, metalness: 0.7 });
const MAT_POLY = new THREE.MeshStandardMaterial({ color: 0x1d1f1c, roughness: 0.8, metalness: 0.05 });
const MAT_WOOD = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.7 });

function box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function empty(name: string, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

/** Procedural stand-in weapon by class (used until/unless real models exist). */
export function proceduralWeapon(cls: WeaponClass, id: string): THREE.Object3D {
  const key = `${cls}|${id}`;
  let tpl = procCache.get(key);
  if (!tpl) {
    const g = new THREE.Group();
    g.name = `proc_${id}`;
    const wood = /akm|kar98|sks|win94|s1897|s686|tommy|dp28|m24/.test(id);
    const body = wood ? MAT_WOOD : MAT_POLY;
    if (cls === 'pistol') {
      g.add(box(0.03, 0.11, 0.045, 0, -0.045, -0.005, MAT_POLY)); // grip
      g.add(box(0.032, 0.035, 0.19, 0, 0.035, 0.06, MAT_METAL)); // slide
      empty('muzzle', 0, 0.035, 0.16, g);
      empty('grip_support', 0.035, -0.04, 0.0, g);
      empty('sight_eye', 0, 0.06, -0.5, g);
      empty('mag', 0, -0.1, -0.01, g);
    } else if (cls === 'melee') {
      g.add(box(0.03, 0.03, 0.42, 0, 0, 0.16, MAT_WOOD));
      g.add(box(0.012, 0.09, 0.32, 0, 0.02, 0.5, MAT_METAL));
      empty('muzzle', 0, 0, 0.7, g);
    } else if (cls === 'throwable') {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.6 }));
      s.position.set(0, 0.02, 0.03);
      g.add(s);
      empty('muzzle', 0, 0.02, 0.06, g);
    } else {
      const long = cls === 'sr' || cls === 'dmr' ? 1.15 : cls === 'smg' ? 0.62 : cls === 'lmg' ? 1.1 : 0.9;
      const barrelLen = long * 0.42;
      g.add(box(0.035, 0.11, 0.045, 0, -0.05, -0.01, MAT_POLY)); // pistol grip
      g.add(box(0.05, 0.08, long * 0.5, 0, 0.035, long * 0.12, MAT_METAL)); // receiver
      g.add(box(0.055, 0.06, long * 0.28, 0, 0.03, long * 0.47, body)); // handguard
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, barrelLen, 8).rotateX(Math.PI / 2), MAT_METAL);
      barrel.position.set(0, 0.04, long * 0.6 + barrelLen * 0.3);
      barrel.castShadow = true;
      g.add(barrel);
      g.add(box(0.04, 0.09, 0.26, 0, 0.0, -0.22, body)); // stock
      if (cls !== 'sg' && cls !== 'sr') g.add(box(0.03, 0.14, 0.05, 0, -0.06, 0.09, MAT_POLY)); // magazine
      const scoped = cls === 'sr' || cls === 'dmr';
      if (scoped) {
        const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 10).rotateX(Math.PI / 2), MAT_METAL);
        sc.position.set(0, 0.11, 0.1);
        g.add(sc);
      } else {
        // Iron sights: rear aperture ring + front post on the sight line (y = 0.115).
        const rear = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.004, 6, 12), MAT_METAL);
        rear.position.set(0, 0.115, long * 0.0);
        g.add(rear, box(0.012, 0.04, 0.02, 0, 0.09, long * 0.0, MAT_METAL));
        g.add(box(0.004, 0.035, 0.006, 0, 0.1, long * 0.58, MAT_METAL));
        g.add(box(0.03, 0.03, 0.03, 0, 0.075, long * 0.58, MAT_METAL));
      }
      empty('muzzle', 0, 0.04, long * 0.6 + barrelLen * 0.8, g);
      empty('grip_support', 0, 0.005, long * 0.42, g);
      empty('sight_eye', 0, scoped ? 0.11 : 0.115, -0.14, g);
      empty('mag', 0, -0.07, 0.09, g);
    }
    tpl = mergeStatic(g);
    procCache.set(key, tpl);
  }
  return tpl.clone(true);
}

const MERGED_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35 });

/**
 * Merge all meshes of a static group into one vertex-coloured mesh (one draw call instead of ~8),
 * keeping the named empties.
 */
export function mergeStatic(g: THREE.Object3D, material: THREE.Material = MERGED_MAT): THREE.Object3D {
  g.updateMatrixWorld(true);
  const geos: THREE.BufferGeometry[] = [];
  const keep: THREE.Object3D[] = [];
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      geo.applyMatrix4(m.matrixWorld);
      const col = ((m.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(0x808080)).clone();
      const n = geo.attributes.position.count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.toArray(c, i * 3);
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
      geos.push(geo);
    } else if (o !== g && o.name) keep.push(o);
  });
  const out = new THREE.Group();
  out.name = g.name;
  if (geos.length) {
    const merged = mergeGeometries(geos, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      out.add(mesh);
    }
  }
  for (const o of keep) {
    const e = new THREE.Object3D();
    e.name = o.name;
    o.getWorldPosition(e.position);
    o.getWorldQuaternion(e.quaternion);
    out.add(e);
  }
  return out;
}

function findNode(root: THREE.Object3D, ...names: string[]): THREE.Object3D | null {
  for (const n of names) {
    const o = root.getObjectByName(n);
    if (o) return o;
  }
  // GLTFLoader may sanitize names (e.g. dots); try case-insensitive prefix matches.
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && names.some((n) => o.name.toLowerCase() === n.toLowerCase())) found = o;
  });
  return found;
}

/** Re-resolve nodes (after an async model load). */
export function refreshNodes(v: WeaponVisual): void {
  v.muzzle = findNode(v.object, 'muzzle');
  v.support = findNode(v.object, 'grip_support', 'support', 'handguard');
  v.sightEye = findNode(v.object, 'sight_eye', 'eye');
  v.mag = findNode(v.object, 'mag', 'magazine');
}

const _ray = new THREE.Raycaster();
const _so = new THREE.Vector3();
const _su = new THREE.Vector3();
const _sf = new THREE.Vector3();
const _sq = new THREE.Quaternion();
const SIGHT_LIFTS = [0, 0.002, 0.004, 0.007, 0.01, 0.014, 0.018, 0.024];

function visibleUnder(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (!p.visible) return false;
  return true;
}

/**
 * Iron sights modelled solid (rear sight block / ears on the sight line) would fill the ADS view: find the
 * smallest lift above `sight_eye` (weapon up axis) whose line of sight passes the rear sight (first hit
 * beyond 0.22 m, i.e. the front sight or nothing). Raycasts once per sight node.
 */
export function sightLift(v: WeaponVisual): number {
  const se = v.sightEye;
  if (!se) return 0;
  if (v.sightLiftFor === se && v.sightLift !== undefined) return v.sightLift;
  v.object.updateWorldMatrix(true, true);
  se.getWorldPosition(_so);
  v.object.getWorldQuaternion(_sq);
  _su.set(0, 1, 0).applyQuaternion(_sq);
  _sf.set(0, 0, 1).applyQuaternion(_sq);
  let lift = 0;
  for (const dy of SIGHT_LIFTS) {
    _ray.set(_sf.clone().multiplyScalar(-0.02).add(_so).addScaledVector(_su, dy), _sf);
    _ray.near = 0;
    _ray.far = 0.6;
    const hit = _ray.intersectObject(v.object, true).find((h) => visibleUnder(h.object, v.object));
    lift = dy;
    if (!hit || hit.distance > 0.24) break;
  }
  v.sightLift = lift;
  v.sightLiftFor = se;
  return lift;
}

/** Build a weapon visual for a weapon instance (returns immediately; real meshes may stream in). */
export function createWeaponVisual(w: IWeaponInstance): WeaponVisual | null {
  const cls = w.def?.class;
  const style = holdStyleFor(cls);
  if (!style) return null;
  let object: THREE.Object3D;
  const fromCombat = ctx.combat?.createWeaponModel?.(w);
  const holder = new THREE.Group();
  holder.name = `weapon_${w.def.id}`;
  const v: WeaponVisual = { object: holder, style, weapon: w, muzzle: null, support: null, sightEye: null, mag: null };
  if (fromCombat) {
    object = fromCombat;
    holder.add(object);
    refreshNodes(v);
    if (!object.userData.loaded) {
      // Poll for async completion (combat fills meshes later).
      const t0 = performance.now();
      const poll = () => {
        if (object.userData.loaded || performance.now() - t0 > 15000) refreshNodes(v);
        else setTimeout(poll, 200);
      };
      setTimeout(poll, 200);
    }
  } else {
    // Procedural stand-in now; swap to the def's GLB if it loads.
    object = proceduralWeapon(cls!, w.def.id);
    holder.add(object);
    refreshNodes(v);
    if (w.def.model) {
      void ctx.assets.tryGltf(w.def.model).then((g) => {
        if (!g) return;
        const real = Assets.cloneScene(g.scene);
        real.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
        });
        holder.remove(object);
        holder.add(real);
        refreshNodes(v);
        // Keep procedural nodes as a fallback where the asset lacks them.
        if (!v.sightEye || !v.support || !v.muzzle) {
          const proc = proceduralWeapon(cls!, w.def.id);
          proc.visible = false;
          holder.add(proc);
          v.sightEye ??= findNode(proc, 'sight_eye');
          v.support ??= findNode(proc, 'grip_support');
          v.muzzle ??= findNode(proc, 'muzzle');
          v.mag ??= findNode(proc, 'mag');
        }
      });
    }
  }
  holder.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  return v;
}
