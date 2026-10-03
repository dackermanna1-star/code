// Central lookup of ingredient / product models. Category files register themselves here.
import * as THREE from 'three';
import type { ModelDef, ModelTable } from './types';
import { getDef, hasDef } from '../food/catalog';
import { blobGeometry, foodMat, mesh, sitOnGround, lazy } from './kit';
import { MODELS as FRUIT } from './fruit';
import { MODELS as VEG } from './veg';
import { MODELS as MEAT } from './meat';
import { MODELS as SEAFOOD } from './seafood';
import { MODELS as DAIRY } from './dairy';
import { MODELS as BAKERY } from './bakery';
import { MODELS as SWEETS } from './sweets';
import { MODELS as PANTRY } from './pantry';
import { MODELS as PRODUCTS } from './products';

const TABLE: ModelTable = { ...FRUIT, ...VEG, ...MEAT, ...SEAFOOD, ...DAIRY, ...BAKERY, ...SWEETS, ...PANTRY, ...PRODUCTS };

const fallbackCache = new Map<string, ModelDef>();

/** A soft coloured blob, used until a real model exists (keeps the game playable). */
function fallback(id: string): ModelDef {
  let m = fallbackCache.get(id);
  if (m) return m;
  const def = hasDef(id) ? getDef(id) : null;
  const size = def?.size ?? 0.08;
  const skin = lazy(() => foodMat({ color: def?.colors.skin ?? '#cccccc', flesh: def?.colors.flesh, cookColor: def?.colors.cooked, roughness: 0.55 }));
  const flesh = lazy(() => foodMat({ color: def?.colors.flesh ?? '#eeeeee', cookColor: def?.colors.cooked, roughness: 0.7 }));
  m = {
    build: (r) => sitOnGround(mesh(blobGeometry(size / 2, { seed: r.range(0, 10), amp: size * 0.04 }), skin(), { skin: true })),
    skin,
    flesh,
  };
  fallbackCache.set(id, m);
  return m;
}

export function getModel(id: string): ModelDef {
  return TABLE[id] ?? fallback(id);
}

export function hasModel(id: string): boolean {
  return !!TABLE[id];
}

export function modelIds(): string[] {
  return Object.keys(TABLE);
}

export { THREE };
