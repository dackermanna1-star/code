/**
 * Crafting entry point: installs vanilla + special recipes once and re-exports the API.
 */
import { registerRecipes } from './recipes';
import { VANILLA_RECIPES } from './vanillaRecipes';
import { installSpecialRecipes } from './specialRecipes';

let installed = false;
export function installCrafting() {
  if (installed) return;
  installed = true;
  registerRecipes(VANILLA_RECIPES);
  installSpecialRecipes();
}

export * from './recipes';
export * from './ingredients';
export * from './smelting';
export { mixLeatherColor, DYE_RGB, DYE_FIREWORK } from './specialRecipes';
