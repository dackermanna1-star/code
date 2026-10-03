/**
 * Visual catalog: model name -> definition variant + animator + placeholder colour + mass.
 * `createRig(model, variant)` builds a ready-to-animate instance (textures stream in).
 */
import { getModelDef } from './defs/index';
import { Rig } from './rig';
import { getTextures } from './textures';
import type { Animator } from './anim/common';
import { animateHumanoid } from './anim/humanoid';
import { animateChicken, animateCreeper, animateQuadruped, animateSpider } from './anim/creatures';

export interface ModelSpec {
  animate: Animator;
  baseColor: number;
  mass: number;
}

const SPECS: Record<string, ModelSpec> = {
  zombie: { animate: (r, s, dt, m) => animateHumanoid(r, s, dt, m, { zombieArms: true }), baseColor: 0x4a7a3a, mass: 75 },
  skeleton: { animate: (r, s, dt, m) => animateHumanoid(r, s, dt, m, { bow: true, stiff: 0.3 }), baseColor: 0xc8c4b4, mass: 35 },
  creeper: { animate: animateCreeper, baseColor: 0x4f9a40, mass: 60 },
  spider: { animate: animateSpider, baseColor: 0x2a221d, mass: 40 },
  cow: { animate: (r, s, dt, m) => animateQuadruped(r, s, dt, m, { amp: 0.7 }), baseColor: 0x4a3a2a, mass: 500 },
  pig: { animate: (r, s, dt, m) => animateQuadruped(r, s, dt, m, { amp: 0.9, cadence: 2.8, headDown: 0.6 }), baseColor: 0xe8a0a0, mass: 120 },
  sheep: { animate: (r, s, dt, m) => animateQuadruped(r, s, dt, m, { amp: 0.7 }), baseColor: 0xe0dcd4, mass: 60 },
  chicken: { animate: animateChicken, baseColor: 0xeeeeee, mass: 2.5 },
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

// install the visual hooks used by Mob (kept out of node tests)
import { MODEL_HOOK } from '../mobs/mob';
MODEL_HOOK.createRig = (model, variant, mass) => createRig(model, variant, mass);
MODEL_HOOK.animate = (model, rig, st, dt, mem) => SPECS[model]?.animate(rig, st, dt, mem);
