/**
 * Visual catalog: model name -> definition variant + animator + placeholder colour + mass.
 * `createRig(model, variant)` builds a ready-to-animate instance (textures stream in).
 */
import { getModelDef } from './defs/index';
import { Rig } from './rig';
import { getTextures } from './textures';
import type { Animator } from './anim/common';
import { animateHumanoid } from './anim/humanoid';

export interface ModelSpec {
  animate: Animator;
  baseColor: number;
  mass: number;
}

const SPECS: Record<string, ModelSpec> = {
  zombie: { animate: (r, s, dt, m) => animateHumanoid(r, s, dt, m, { zombieArms: true }), baseColor: 0x4a7a3a, mass: 75 },
};

export function registerSpec(model: string, spec: ModelSpec) {
  SPECS[model] = spec;
}

export function modelSpec(model: string): ModelSpec {
  const s = SPECS[model];
  if (!s) throw new Error(`no model spec for '${model}'`);
  return s;
}

export function createRig(model: string, variant = '', massOverride?: number): Rig {
  const def = getModelDef(model, variant);
  const spec = modelSpec(model);
  const tex = getTextures(def, model, variant, spec.baseColor);
  return new Rig(def, tex, massOverride ?? spec.mass);
}
