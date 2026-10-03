// Seasoning decals that sit ON the food: ketchup squiggles, sprinkles, pepper specks,
// whipped-cream swirls. Generated deterministically from the item's seasoning amounts, so they
// survive rebuilds (cutting, cooking) and grow while you keep pouring.

import * as THREE from 'three';
import type { Game } from '../game/Game';
import type { FoodItem } from '../game/FoodItem';
import type { FoodState, SeasoningDef } from '../food/types';
import { getSeasoning } from '../food/catalog';
import { foodMat, rng, sweepGeometry, merge } from '../models/kit';

const matCache = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material) {
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = make()));
  return m;
}

const SPECK_COLORS: Record<string, string[]> = {
  salt: ['#ffffff', '#f4f7fb'],
  pepper: ['#2b2422', '#3d3330', '#1e1a19'],
  sugar: ['#fffdf6', '#ffffff'],
  cinnamon: ['#a0522d', '#8b4513'],
  'chili-flakes': ['#c8321e', '#e0442a', '#f2c14a'],
  herbs: ['#4a8a2e', '#5aa83e', '#3a7a26'],
  sprinkles: ['#ff5fa8', '#ffd23f', '#5fd3ff', '#7ce08a', '#b9a6f2', '#ff8a4a'],
};

/** Find the top surface under (x, z) in content space. */
function surfaceAt(meshes: THREE.Mesh[], ray: THREE.Raycaster, x: number, z: number, top: number): THREE.Intersection | null {
  ray.set(new THREE.Vector3(x, top + 0.2, z), new THREE.Vector3(0, -1, 0));
  const hits = ray.intersectObjects(meshes, false);
  return hits.find((h) => !(h.object.userData.decal)) ?? null;
}

/**
 * Build decals for a state onto an already-built content object (content space = model space).
 * Returns null when there is nothing to show.
 */
export function buildSeasoningDecals(state: FoodState, content: THREE.Object3D): THREE.Group | null {
  const entries = Object.entries(state.season ?? {}).filter(([, a]) => a > 0.05);
  if (!entries.length) return null;
  content.updateMatrixWorld(true);
  // work in content-local space: temporarily treat content as the root
  const inv = new THREE.Matrix4().copy(content.matrixWorld).invert();
  const meshes: THREE.Mesh[] = [];
  const box = new THREE.Box3();
  content.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.decal) {
      meshes.push(m);
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld).applyMatrix4(inv));
    }
  });
  if (!meshes.length || box.isEmpty()) return null;
  const ray = new THREE.Raycaster();
  const toLocal = (p: THREE.Vector3) => p.clone().applyMatrix4(inv);
  const worldTop = new THREE.Vector3(0, box.max.y, 0).applyMatrix4(content.matrixWorld).y;
  const c = box.getCenter(new THREE.Vector3());
  const R = Math.max(0.015, Math.min(box.max.x - box.min.x, box.max.z - box.min.z) * 0.42);
  const out = new THREE.Group();
  out.userData.decalRoot = true;
  const r = rng(state.seed + 77);
  const local2world = content.matrixWorld;

  for (const [id, amount] of entries) {
    let def: SeasoningDef;
    try {
      def = getSeasoning(id);
    } catch {
      continue;
    }
    if (def.kind === 'squeeze') {
      const lines = Math.min(4, Math.ceil(amount * 1.6));
      for (let l = 0; l < lines; l++) {
        const ang = r.range(0, Math.PI) + l * 0.9;
        const dir = new THREE.Vector2(Math.cos(ang), Math.sin(ang));
        const perp = new THREE.Vector2(-dir.y, dir.x);
        const off = (l - (lines - 1) / 2) * R * 0.35;
        const pts: THREE.Vector3[] = [];
        const N = 36;
        const zig = 3 + (l % 2);
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          const along = (t - 0.5) * 2 * R * 0.95;
          const side = Math.sin(t * Math.PI * zig) * R * 0.28 + off;
          const lx = c.x + dir.x * along + perp.x * side;
          const lz = c.z + dir.y * along + perp.y * side;
          const wp = new THREE.Vector3(lx, 0, lz).applyMatrix4(local2world);
          const hit = surfaceAt(meshes, ray, wp.x, wp.z, worldTop);
          if (!hit) continue;
          const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
          pts.push(toLocal(hit.point.clone().addScaledVector(n, 0.0025)));
        }
        if (pts.length < 4) continue;
        const curve = new THREE.CatmullRomCurve3(pts);
        const g = sweepGeometry(curve, { radius: (t) => 0.0034 * (0.75 + 0.25 * Math.sin(t * 40 + l)), radialSegments: 8, tubularSegments: pts.length * 3, caps: 'round' });
        const m = new THREE.Mesh(g, mat('sq:' + id, () => foodMat({ color: def.color, flesh: def.color, roughness: 0.22, clearcoat: 0.6, cookColor: '#5a2a10', cookAmount: 0.6 })));
        m.userData.decal = true;
        m.castShadow = false;
        out.add(m);
      }
    } else if (def.kind === 'shake') {
      const count = Math.min(90, Math.round(amount * 34));
      const cols = SPECK_COLORS[id] ?? [def.color];
      const geos: THREE.BufferGeometry[] = [];
      for (let i = 0; i < count; i++) {
        const [dx, dz] = r.disc();
        const lx = c.x + dx * R * 1.05, lz = c.z + dz * R * 1.05;
        const wp = new THREE.Vector3(lx, 0, lz).applyMatrix4(local2world);
        const hit = surfaceAt(meshes, ray, wp.x, wp.z, worldTop);
        if (!hit) continue;
        const p = toLocal(hit.point);
        let g: THREE.BufferGeometry;
        if (id === 'sprinkles') {
          g = new THREE.CapsuleGeometry(0.0011, 0.005, 2, 5);
          g.rotateZ(Math.PI / 2);
          g.rotateY(r.range(0, Math.PI));
        } else if (id === 'herbs' || id === 'chili-flakes') {
          g = new THREE.CircleGeometry(0.0022 * r.range(0.7, 1.3), 5);
          g.rotateX(-Math.PI / 2 + r.range(-0.3, 0.3));
        } else if (id === 'cinnamon') {
          g = new THREE.CircleGeometry(0.004 * r.range(0.6, 1.4), 7);
          g.rotateX(-Math.PI / 2);
        } else {
          g = new THREE.BoxGeometry(0.0016, 0.0016, 0.0016);
          g.rotateY(r.range(0, 3));
          g.rotateX(r.range(0, 3));
        }
        g.translate(p.x, p.y + 0.001, p.z);
        const col = new THREE.Color(cols[i % cols.length]);
        const n = g.attributes.position.count;
        const arr = new Float32Array(n * 3);
        for (let k = 0; k < n; k++) {
          arr[k * 3] = col.r;
          arr[k * 3 + 1] = col.g;
          arr[k * 3 + 2] = col.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        geos.push(g);
      }
      if (geos.length) {
        const m = new THREE.Mesh(merge(geos), mat('sh:' + (id === 'sugar' ? 'sugar' : 'specks'), () => foodMat({ color: '#ffffff', vertexColors: true, roughness: id === 'sugar' ? 0.15 : 0.6, cookAmount: 0.4, cookColor: '#3a2a1a' })));
        m.userData.decal = true;
        m.castShadow = false;
        out.add(m);
      }
    } else if (def.kind === 'spray') {
      // whipped cream swirl on the top centre
      const hit = surfaceAt(meshes, ray, ...((): [number, number] => {
        const wp = new THREE.Vector3(c.x, 0, c.z).applyMatrix4(local2world);
        return [wp.x, wp.z];
      })(), worldTop);
      if (!hit) continue;
      const p = toLocal(hit.point);
      const size = Math.min(1.4, 0.6 + amount * 0.4);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const a = t * Math.PI * 2 * 2.6;
        const rr = (1 - t) * 0.022 * size;
        pts.push(new THREE.Vector3(p.x + Math.cos(a) * rr, p.y + t * 0.03 * size, p.z + Math.sin(a) * rr));
      }
      const g = sweepGeometry(new THREE.CatmullRomCurve3(pts), {
        radius: (t) => 0.009 * size * (1 - t * 0.7),
        shape: (a) => 1 + 0.14 * Math.cos(a * 6),
        radialSegments: 18,
        tubularSegments: 90,
        caps: 'round',
      });
      const m = new THREE.Mesh(g, mat('whip', () => foodMat({ color: '#fffdf8', flesh: '#fffdf8', roughness: 0.35, clearcoat: 0.3, cookColor: '#e8c890', cookAmount: 0.5 })));
      m.userData.decal = true;
      out.add(m);
    }
  }
  out.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.userData.disposable = true;
  });
  return out.children.length ? out : null;
}

/** Throttled live refresh while the player is pouring. */
export class Decals {
  private pending = new Map<FoodItem, number>();

  constructor(private game: Game) {
    const tick = () => {
      const now = performance.now();
      for (const [item, t] of this.pending) {
        if (now >= t) {
          this.pending.delete(item);
          if (this.game.items.list.includes(item)) item.visual.refreshDecals();
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  add(item: FoodItem, _def: SeasoningDef, _at: THREE.Vector3) {
    if (!this.pending.has(item)) this.pending.set(item, performance.now() + 260);
  }
}
