// Last Ferry model factory (contract: ./types.ts).
//
// Zombies face +X, the Bosun faces -X; root origins at the feet centre.
// Geometry is generated once per look variant and shared by later rigs.
import type * as THREE from 'three';
import type { WeaponId, ZombieKind } from '../../config/ids';
import type { WeaponModel } from './types';
import { createZombie, type ZombieRigExt } from './zombie/rig';
import { decodeLook } from './zombie/looks';
import { createHunterRig as createBosun, holdMuzzleOffset, type BosunRig } from './hunter';
import { createWeaponModel as createWeapon, kickCurve, muzzleRest, type LFWeaponModel } from './weapons';
import {
  CRATE_MODEL,
  HARPOON_BOLT_LENGTH,
  PALLET_MODEL,
  STRETCHER_MODEL,
  createCrate as createCrateModel,
  createCratePallet as createPallet,
  createFlareCartridge as createFlare,
  createHarpoonBolt as createBolt,
  createNail as createNailModel,
  createStretcher as createStretcherModel,
} from './props';

/** A zombie of `kind` dressed by the look seed (any 32-bit integer). */
export function createZombieRig(kind: ZombieKind, look: number): ZombieRigExt {
  return createZombie(kind, look);
}

/**
 * Build (and cache) the geometry of every zombie look variant ahead of time,
 * a slice at a time: call repeatedly (e.g. once per frame on the title screen)
 * until it returns true. Each new variant costs ≈ 5–15 ms of CPU the first
 * time it is seen; ~210 variants in all.
 */
let prewarmQueue: Array<[ZombieKind, number]> | null = null;
export function prewarmZombies(budgetMs = 8, kinds: ZombieKind[] = ['shambler', 'jogger', 'bloater', 'medic', 'patient', 'riot', 'bigdave']): boolean {
  if (!prewarmQueue) {
    prewarmQueue = [];
    const seen = new Set<string>();
    for (const kind of kinds)
      for (let s = 1; s < 4000; s++) {
        const k = decodeLook(kind, s).key;
        if (seen.has(k)) continue;
        seen.add(k);
        prewarmQueue.push([kind, s]);
      }
  }
  const t0 = performance.now();
  while (prewarmQueue.length && performance.now() - t0 < budgetMs) {
    const [kind, s] = prewarmQueue.pop()!;
    createZombie(kind, s);
  }
  return prewarmQueue.length === 0;
}

/** The Bosun (faces -X). */
export function createHunterRig(): BosunRig {
  return createBosun();
}

export function createWeaponModel(id: WeaponId): LFWeaponModel {
  return createWeapon(id);
}

/** Origin at its centre on the deck, long axis X (head end +X). See STRETCHER_MODEL. */
export function createStretcher(): THREE.Group {
  return createStretcherModel();
}
/** Origin at the pallet's bottom centre; the net's lifting ring at PALLET_MODEL.ringY. */
export function createCratePallet(): THREE.Group {
  return createPallet();
}
/** A single fish crate, origin at its centre (CRATE_MODEL half extents). `seed` varies the wood. */
export function createCrate(seed = 1): THREE.Group {
  return createCrateModel(seed);
}
/** Origin at the tail, tip toward -X (HARPOON_BOLT_LENGTH long). */
export function createHarpoonBolt(): THREE.Group {
  return createBolt();
}
/** Origin at the head, point toward -X. */
export function createNail(): THREE.Group {
  return createNailModel();
}
/** Burning flare stick lying on the deck; userData.tip = the burning end. */
export function createFlareCartridge(): THREE.Group {
  return createFlare();
}

export { CRATE_MODEL, HARPOON_BOLT_LENGTH, PALLET_MODEL, STRETCHER_MODEL, holdMuzzleOffset, kickCurve, muzzleRest };
export type { BosunRig, LFWeaponModel, WeaponModel, ZombieRigExt };
export { CARRY } from './zombie/anim';
export { decodeLook, type Look, type Outfit } from './zombie/looks';
export { BIG_DAVE_SCALE, BLOATER_SCALE } from './zombie/rig';
export { charredTint, applyCharred, MATERIALS } from './kit';
