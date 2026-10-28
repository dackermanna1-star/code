// Procedural texture registry. Generator names are the part after "proc:" in
// src/render/surfaces.ts (e.g. "proc:pcb" → "pcb"), plus procedural stand-ins for every photo
// texture name (used when the downloaded CC0 photos are missing).

import type { TexOutput } from "./kit.ts";
import { MATERIAL_GENERATORS, genericTexture } from "./materials.ts";
import { TECH_GENERATORS } from "./tech.ts";
import { PRINTED_GENERATORS } from "./printed.ts";

export type { TexOutput } from "./kit.ts";
export { SIZE } from "./kit.ts";

export const PROC_PREFIX = "proc:";

const ALL: Readonly<Record<string, () => TexOutput>> = {
  ...MATERIAL_GENERATORS,
  ...TECH_GENERATORS,
  ...PRINTED_GENERATORS,
};

/** Strip the "proc:" prefix if present. */
export function procName(tex: string): string {
  return tex.startsWith(PROC_PREFIX) ? tex.slice(PROC_PREFIX.length) : tex;
}

export function hasGenerator(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALL, procName(name));
}

/** All generator names (procedural art + photo stand-ins). */
export function generatorNames(): string[] {
  return Object.keys(ALL);
}

/**
 * Generate a texture by name ("proc:" prefix optional). Unknown names get a neutral seeded
 * fallback (and `known=false`) so a typo never breaks rendering.
 */
export function generateTexture(name: string): { out: TexOutput; known: boolean } {
  const key = procName(name);
  const gen = ALL[key];
  if (!gen) return { out: genericTexture(key), known: false };
  return { out: gen(), known: true };
}
