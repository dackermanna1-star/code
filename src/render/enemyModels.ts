// Voxel models for creatures, built from small coloured boxes. Each model exposes named pivots
// (legs, arms, wings, head, body) that the EnemySystem animates.
import * as THREE from 'three';
import { voxelBox } from './spriteMesh';
import { createMeshMaterial, SharedUniforms } from './voxelMaterial';

let SHARED: SharedUniforms | null = null;
/** Provide the world's shared lighting uniforms so creatures are lit like the voxels. */
export function setCreatureUniforms(u: SharedUniforms): void {
  SHARED = u;
}

export interface CreatureMaterial {
  emissive: THREE.Color;
}

export interface EnemyModel {
  root: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  material: THREE.Material & CreatureMaterial;
  glow: THREE.Material;
}

const S = 0.55; // voxels per model pixel

function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

/** Noisy single-colour box (slight per-voxel variation like Noita sprites). */
function box(w: number, h: number, d: number, color: string, alt?: string, seed = 1): THREE.BufferGeometry {
  return voxelBox(w, h, d, S, (x, y, z) => {
    const r = ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ seed) >>> 0;
    if (alt && r % 5 === 0) return alt;
    return color;
  });
}

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, name?: string, parts?: Record<string, THREE.Object3D>): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x * S, y * S, z * S);
  parent.add(m);
  if (name && parts) parts[name] = m;
  return m;
}

/** A pivot group positioned at (x,y,z) model pixels; child geometry hangs below it. */
function pivot(parent: THREE.Object3D, x: number, y: number, z: number, name: string, parts: Record<string, THREE.Object3D>): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x * S, y * S, z * S);
  parent.add(g);
  parts[name] = g;
  return g;
}

export function buildEnemyModel(kind: string, tint = '#808080'): EnemyModel {
  let material: THREE.Material & CreatureMaterial;
  let glow: THREE.Material;
  if (SHARED) {
    const m = createMeshMaterial(SHARED);
    material = Object.assign(m, { emissive: m.uniforms.uEmissive.value as THREE.Color });
    glow = createMeshMaterial(SHARED, true);
  } else {
    material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color(0, 0, 0) });
    glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  }
  const root = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  const body = new THREE.Group();
  root.add(body);
  parts.body = body;
  const T = tint;
  switch (kind) {
    case 'hiisi':
    case 'miner':
    case 'jetpack': {
      const skin = kind === 'miner' ? '#a08060' : '#8c9a5a';
      const pants = '#33303e';
      for (const [n, x] of [['legL', -1.2], ['legR', 1.2]] as const) {
        const lg = pivot(body, x, 5.5, 0, n, parts);
        part(lg, box(2, 5.5, 2, pants, shade(pants, 0.8)), material, 0, -2.75, 0);
        part(lg, box(2, 1, 3, '#2a2018'), material, 0, -5.2, -0.5);
      }
      part(body, box(5, 5, 3, T, shade(T, 0.85), 3), material, 0, 8, 0, 'torso', parts);
      part(body, box(5, 1, 3.2, '#3a2a1a'), material, 0, 6, 0);
      const head = pivot(body, 0, 10.5, 0, 'head', parts);
      part(head, box(4, 4, 4, skin, shade(skin, 0.9), 5), material, 0, 2, 0);
      part(head, box(1, 2, 1, skin), material, -2.5, 2.8, 0.5); // ears
      part(head, box(1, 2, 1, skin), material, 2.5, 2.8, 0.5);
      part(head, box(1, 1, 0.4, '#101010'), glow, -0.8, 2.3, -2.1);
      part(head, box(1, 1, 0.4, '#101010'), glow, 0.8, 2.3, -2.1);
      if (kind === 'miner') part(head, box(4.6, 1.5, 4.6, '#d8b030', '#b08a20'), material, 0, 4.4, 0);
      const armL = pivot(body, -3.2, 10, 0, 'armL', parts);
      part(armL, box(1.6, 5, 1.6, T), material, 0, -2.5, 0);
      const armR = pivot(body, 3.2, 10, 0, 'armR', parts);
      part(armR, box(1.6, 5, 1.6, T), material, 0, -2.5, 0);
      if (kind === 'miner') part(armR, box(1, 3, 1, '#c8281a'), material, 0, -5.5, -0.8, 'weapon', parts);
      else part(armR, box(1, 1, 7, '#2a2a2e', '#4a4a50'), material, -0.2, -4.5, -2.5, 'weapon', parts);
      if (kind === 'jetpack') {
        part(body, box(3, 4, 2, '#5a5a62', '#3a3a40'), material, 0, 8, 2.6, 'pack', parts);
        part(body, box(1, 1, 1, '#ff8030'), glow, -0.8, 5.5, 2.8, 'flameL', parts);
        part(body, box(1, 1, 1, '#ff8030'), glow, 0.8, 5.5, 2.8, 'flameR', parts);
      }
      break;
    }
    case 'mage': {
      const robe = T;
      part(body, box(6, 9, 4, robe, shade(robe, 0.8), 7), material, 0, 4.5, 0, 'torso', parts);
      part(body, box(7, 2, 5, shade(robe, 0.7)), material, 0, 1, 0);
      const head = pivot(body, 0, 9, 0, 'head', parts);
      part(head, box(4, 4, 4, '#2a2420'), material, 0, 2, 0);
      part(head, box(1, 1, 0.4, '#ffe080'), glow, -0.8, 2.2, -2.1, 'eyeL', parts);
      part(head, box(1, 1, 0.4, '#ffe080'), glow, 0.8, 2.2, -2.1, 'eyeR', parts);
      // pointy hat
      part(head, box(6, 1, 6, shade(robe, 0.6)), material, 0, 4.3, 0);
      part(head, box(4, 2, 4, shade(robe, 0.65)), material, 0, 5.6, 0);
      part(head, box(2, 2, 2, shade(robe, 0.7)), material, 0.5, 7.4, 0.5);
      const armL = pivot(body, -3.6, 8, 0, 'armL', parts);
      part(armL, box(1.8, 5, 1.8, shade(robe, 0.9)), material, 0, -2.5, 0);
      const armR = pivot(body, 3.6, 8, 0, 'armR', parts);
      part(armR, box(1.8, 5, 1.8, shade(robe, 0.9)), material, 0, -2.5, 0);
      part(armR, box(0.8, 0.8, 8, '#5a3a20'), material, 0, -4.5, -2, 'weapon', parts);
      part(armR, box(1.4, 1.4, 1.4, '#ffe8a0'), glow, 0, -4.5, -6.2, 'staffgem', parts);
      break;
    }
    case 'hound': {
      part(body, box(4, 4, 8, T, shade(T, 0.75), 11), material, 0, 4.5, 0, 'torso', parts);
      const head = pivot(body, 0, 6, -4.5, 'head', parts);
      part(head, box(3.4, 3.4, 4, shade(T, 0.9)), material, 0, 0, -1.5);
      part(head, box(1, 1, 0.4, '#ff2010'), glow, -0.8, 0.6, -3.6);
      part(head, box(1, 1, 0.4, '#ff2010'), glow, 0.8, 0.6, -3.6);
      part(head, box(2.4, 1, 2, '#e8e0d0'), material, 0, -1.4, -2.6);
      for (const [n, x, z] of [['legL', -1.4, -3], ['legR', 1.4, -3], ['legL2', -1.4, 3], ['legR2', 1.4, 3]] as const) {
        const lg = pivot(body, x, 3, z, n, parts);
        part(lg, box(1.2, 3.4, 1.2, shade(T, 0.6)), material, 0, -1.7, 0);
      }
      break;
    }
    case 'spider': {
      part(body, box(3, 2, 4, '#3e3448', '#2a2232', 13), material, 0, 2.6, 0.5, 'torso', parts);
      part(body, box(2.4, 2, 2, '#4a3e56'), material, 0, 2.6, -2.2, 'head', parts);
      part(body, box(0.6, 0.6, 0.4, '#ff3020'), glow, -0.5, 3.0, -3.3);
      part(body, box(0.6, 0.6, 0.4, '#ff3020'), glow, 0.5, 3.0, -3.3);
      for (let i = 0; i < 6; i++) {
        const side = i < 3 ? -1 : 1;
        const z = -1 + (i % 3) * 1.6;
        const lg = pivot(body, side * 1.6, 2.6, z, `leg${i}`, parts);
        part(lg, box(3, 0.6, 0.6, '#2a2232'), material, side * 1.5, 0.3, 0);
        part(lg, box(0.6, 2.4, 0.6, '#2a2232'), material, side * 3, -1, 0);
      }
      break;
    }
    case 'slime': {
      part(body, box(6, 5, 6, T, shade(T, 0.8), 17), material, 0, 3, 0, 'torso', parts);
      part(body, box(4, 1, 4, shade(T, 1.15)), material, 0, 6, 0);
      part(body, box(1, 1.4, 0.4, '#101010'), glow, -1.2, 3.8, -3.1);
      part(body, box(1, 1.4, 0.4, '#101010'), glow, 1.2, 3.8, -3.1);
      break;
    }
    case 'bat': {
      part(body, box(2, 2, 2.4, T, shade(T, 0.8)), material, 0, 1.6, 0, 'torso', parts);
      part(body, box(0.5, 0.5, 0.3, '#ff3030'), glow, -0.5, 2, -1.3);
      part(body, box(0.5, 0.5, 0.3, '#ff3030'), glow, 0.5, 2, -1.3);
      const wl = pivot(body, -1, 2, 0, 'wingL', parts);
      part(wl, box(4, 0.4, 2.6, shade(T, 0.6)), material, -2, 0, 0);
      const wr = pivot(body, 1, 2, 0, 'wingR', parts);
      part(wr, box(4, 0.4, 2.6, shade(T, 0.6)), material, 2, 0, 0);
      break;
    }
    case 'firefly': {
      part(body, box(1.6, 1.6, 2, '#3a2a1a'), material, 0, 1.2, -0.6, 'torso', parts);
      part(body, box(1.8, 1.8, 2, '#ffd040', '#ffa020'), glow, 0, 1.2, 1.2, 'abdomen', parts);
      const wl = pivot(body, -0.8, 2, -0.4, 'wingL', parts);
      part(wl, box(2, 0.3, 1.2, '#c8c8d8'), material, -1, 0, 0);
      const wr = pivot(body, 0.8, 2, -0.4, 'wingR', parts);
      part(wr, box(2, 0.3, 1.2, '#c8c8d8'), material, 1, 0, 0);
      break;
    }
    case 'skull': {
      part(body, box(4, 4, 4, '#e8e0cc', '#c8c0aa', 19), material, 0, 2.6, 0, 'torso', parts);
      part(body, box(3, 1.4, 3, '#d8d0bc'), material, 0, 0.6, -0.4);
      part(body, box(1.2, 1.2, 0.4, T), glow, -0.9, 3, -2.1, 'eyeL', parts);
      part(body, box(1.2, 1.2, 0.4, T), glow, 0.9, 3, -2.1, 'eyeR', parts);
      break;
    }
    case 'tank': {
      part(body, box(8, 3, 10, '#4a5a34', '#3a482a', 23), material, 0, 3.4, 0, 'torso', parts);
      part(body, box(9, 2, 11, '#22201c'), material, 0, 1, 0, 'treads', parts);
      const tur = pivot(body, 0, 5.5, 0, 'head', parts);
      part(tur, box(4, 3, 4, '#55663c'), material, 0, 0.5, 0);
      part(tur, box(1, 1, 6, '#2a2a2e'), material, 0, 0.6, -4.5, 'weapon', parts);
      part(tur, box(1, 0.6, 0.4, '#ff3020'), glow, 0, 1.4, -2.1);
      break;
    }
    case 'turret': {
      part(body, box(4, 2, 4, '#4a4e56'), material, 0, 1, 0, 'torso', parts);
      const head = pivot(body, 0, 3.5, 0, 'head', parts);
      part(head, box(3, 3, 3, '#6a6e78', '#55585f'), material, 0, 0, 0);
      part(head, box(1, 1, 0.4, '#ff2020'), glow, 0, 0.3, -1.7);
      part(head, box(0.8, 0.8, 3, '#2a2a2e'), material, 0.8, -0.4, -2.6, 'weapon', parts);
      part(head, box(0.8, 0.8, 3, '#2a2a2e'), material, -0.8, -0.4, -2.6);
      break;
    }
    case 'barrel': {
      part(body, voxelBox(4, 6, 4, S, (x, y, z) => ((x === 0 || x === 3) && (z === 0 || z === 3) ? null : y === 1 || y === 4 ? '#3a3a3a' : (x + y + z) % 3 ? T : shade(T, 0.8))), material, 0, 3, 0, 'torso', parts);
      if (T === '#7a4ab0') part(body, box(1.4, 1, 1.4, '#c0c0c8'), material, 0, 6.4, 0);
      break;
    }
    case 'sheep': {
      part(body, box(5, 4, 7, '#f0ece4', '#d8d4cc', 29), material, 0, 3.6, 0, 'torso', parts);
      const head = pivot(body, 0, 5, -4, 'head', parts);
      part(head, box(2.4, 2.6, 2.6, '#2a2624'), material, 0, 0, -0.8);
      for (const [n, x, z] of [['legL', -1.5, -2.4], ['legR', 1.5, -2.4], ['legL2', -1.5, 2.4], ['legR2', 1.5, 2.4]] as const) {
        const lg = pivot(body, x, 2, z, n, parts);
        part(lg, box(1, 2.2, 1, '#2a2624'), material, 0, -1.1, 0);
      }
      break;
    }
    default:
      part(body, box(3, 3, 3, T), material, 0, 1.5, 0, 'torso', parts);
  }
  return { root, parts, material, glow };
}
