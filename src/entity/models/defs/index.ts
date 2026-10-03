/**
 * Model definition registry: `getModelDef(model, variant)` builds (and memoizes) the
 * deterministic definition of a mob model. Imported by the main thread (geometry/rig) and by
 * the texture worker (painting), which is why definitions must not depend on THREE/DOM.
 */
import type { ModelDef } from '../def';
import { zombieModel } from './zombie';
import { skeletonModel, creeperModel, spiderModel, cowModel, pigModel, sheepModel, chickenModel } from './creatures';

type Factory = (variant: string) => ModelDef;

const FACTORIES: Record<string, Factory> = {
  zombie: (v) => zombieModel((v || 'zombie') as any),
  skeleton: () => skeletonModel(),
  creeper: () => creeperModel(),
  spider: () => spiderModel(),
  cow: () => cowModel(),
  pig: () => pigModel(),
  sheep: () => sheepModel(),
  chicken: () => chickenModel(),
};

const memo = new Map<string, ModelDef>();

export function registerModel(name: string, f: Factory) {
  FACTORIES[name] = f;
}

export function getModelDef(model: string, variant = ''): ModelDef {
  const k = model + '|' + variant;
  let d = memo.get(k);
  if (!d) {
    const f = FACTORIES[model];
    if (!f) throw new Error(`unknown mob model '${model}'`);
    d = f(variant);
    memo.set(k, d);
  }
  return d;
}

export function modelNames(): string[] {
  return Object.keys(FACTORIES);
}
