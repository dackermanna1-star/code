/**
 * Single shared shadow generator, owned by the level (created with its sun).
 * Any module can register casters without importing the level.
 */
import type { AbstractMesh, ShadowGenerator } from "@babylonjs/core";

let generator: ShadowGenerator | null = null;

export const Shadows = {
  set(g: ShadowGenerator | null): void {
    generator = g;
  },
  get(): ShadowGenerator | null {
    return generator;
  },
  /** Register a mesh (and its children) as a shadow caster. */
  cast(mesh: AbstractMesh, includeDescendants = true): void {
    generator?.addShadowCaster(mesh, includeDescendants);
  },
  remove(mesh: AbstractMesh): void {
    generator?.removeShadowCaster(mesh, true);
  },
};
