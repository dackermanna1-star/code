// Transparent glass material for windows, picture frames, screen cover glass, glassware and
// shards. A PBRMaterial in alpha-blend mode driven by the world plugin in glass mode, so glass
// geometry uses the same vertex layout as the world (batch.ts):
//   - opacity per vertex from color.a (clear ≈ 0.18, frosted ≈ 0.55, smoked ≈ 0.8, set by the
//     batcher from the surface), tint from color.rgb (glass_dark, tinted bottles...)
//   - environment reflections with PBR fresnel, kept visible through low alpha
//     (radiance/specular over alpha) so panes read as glass even when almost clear
//   - fresnel term that thickens alpha and adds the green "edge" tint at grazing angles
//   - surface texture (faint streaks / frosting) and normal map from the texture arrays
// Glass meshes do not cast shadows (the batcher registers them as receivers only), so sunlight
// enters through windows. Transparent meshes are depth-sorted per mesh by Babylon; each shard
// island has its own glass mesh, which keeps sorting correct enough even with many shards.

import { PBRMaterial, Color3, Material, type Scene } from "@babylonjs/core";
import type { TextureLibrary } from "./textures.ts";
import { WorldMaterialPlugin, type WorldMaterialHandle } from "./worldMaterial.ts";

export function createGlassMaterial(scene: Scene, lib: TextureLibrary, name = "glassMaterial"): WorldMaterialHandle {
  const g = new PBRMaterial(name, scene);
  g.metallic = 0;
  g.roughness = 0.05;
  g.albedoColor = new Color3(1, 1, 1);
  g.alpha = 1; // opacity comes from vertex alpha
  g.transparencyMode = Material.MATERIAL_ALPHABLEND;
  g.useRadianceOverAlpha = true;
  g.useSpecularOverAlpha = true;
  g.backFaceCulling = true;
  g.forceIrradianceInFragment = true;
  g.maxSimultaneousLights = 8;
  // glass is thin: a little extra direct specular helps sun glints read
  g.specularIntensity = 1.2;
  const plugin = new WorldMaterialPlugin(g, lib, true);
  lib.onRebuild(() => g.markAsDirty(1 /* Material.TextureDirtyFlag */));
  return { material: g, plugin };
}
