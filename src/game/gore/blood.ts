/** Blood appearance per entity type (shared by particles, decals, wounds and stumps). */
import type { Entity } from '../../entity/entity';

export interface BloodProfile {
  /** Linear RGB of fresh blood; null = bleeds nothing (skeletons, golems ...). */
  color: [number, number, number] | null;
  /** Block whose crumbs fly instead (bone dust) */
  dust?: string;
  /** Matches the shader `u_bloodType` (0 red, 1 none, 2 green, 3 purple). */
  shaderType: number;
}

const RED: [number, number, number] = [0.22, 0.004, 0.004];

export function bloodFor(e: Entity): BloodProfile {
  const t = e.type;
  if (t === 'skeleton' || t === 'wither_skeleton' || t === 'stray') return { color: null, dust: 'bone_block', shaderType: 1 };
  if (t === 'slime' || t === 'magma_cube') return { color: t === 'slime' ? [0.12, 0.55, 0.08] : [0.6, 0.15, 0.02], dust: t === 'slime' ? 'slime_block' : undefined, shaderType: 2 };
  if (t === 'creeper') return { color: [0.1, 0.35, 0.06], shaderType: 2 };
  if (t === 'enderman' || t === 'endermite' || t === 'shulker') return { color: [0.35, 0.05, 0.5], shaderType: 3 };
  if (t === 'iron_golem' || t === 'snow_golem' || t === 'blaze' || t === 'item' || t === 'armor_stand') return { color: null, shaderType: 1 };
  if (t === 'zombie' || t === 'husk' || t === 'drowned' || t === 'zombie_villager' || t === 'zombified_piglin') return { color: [0.16, 0.018, 0.01], shaderType: 0 };
  return { color: RED, shaderType: 0 };
}
