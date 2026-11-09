/**
 * Stylized toon materials shared by every module.
 *
 *   toon(scene, "#d9822b")             -> flat-color cel-shaded material (cached)
 *   toon(scene, "#fff", {emissive: 1}) -> glowing (lights, neon, fire)
 *   outline(mesh)                      -> black ink outline (cars, zombies, key props)
 *
 * Cel shading is done with a MaterialPlugin that quantizes the accumulated
 * diffuse light into 3 soft bands and adds a subtle rim light, so it still
 * works with Babylon's lights, shadows and fog.
 */
import {
  Color3,
  MaterialPluginBase,
  StandardMaterial,
  type AbstractMesh,
  type Material,
  type Scene,
} from "@babylonjs/core";

class ToonPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, "Toon", 200, { TOON: false });
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines.TOON = true;
  }

  override getClassName(): string {
    return "ToonPlugin";
  }

  override getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        vec3 toonBands(vec3 light) {
          float l = max(max(light.r, light.g), light.b);
          // three soft bands: shadow / mid / lit
          float b = smoothstep(0.18, 0.24, l) * 0.45 + smoothstep(0.62, 0.68, l) * 0.55;
          float q = 0.38 + b * 0.72;
          return l > 0.0001 ? light / l * q : vec3(q);
        }
      `,
      "!vec3 finalDiffuse=": `
        diffuseBase = toonBands(diffuseBase);
        {
          float rim = 1.0 - max(dot(viewDirectionW, normalW), 0.0);
          diffuseBase += vec3(smoothstep(0.62, 0.78, rim) * 0.22);
        }
        vec3 finalDiffuse=`,
    };
  }
}

export interface ToonOptions {
  /** 0..n: how much the base color glows on its own (lamps, fire, neon). */
  emissive?: number;
  alpha?: number;
  /** Disable cel shading (flat unlit color). */
  unlit?: boolean;
  backFaceCulling?: boolean;
}

const cache = new WeakMap<Scene, Map<string, StandardMaterial>>();

export function toon(scene: Scene, hex: string, opts: ToonOptions = {}): StandardMaterial {
  const key = `${hex}|${opts.emissive ?? 0}|${opts.alpha ?? 1}|${opts.unlit ? 1 : 0}|${opts.backFaceCulling ?? true}`;
  let byScene = cache.get(scene);
  if (!byScene) {
    byScene = new Map();
    cache.set(scene, byScene);
  }
  const hit = byScene.get(key);
  if (hit) return hit;

  const m = new StandardMaterial(`toon_${key}`, scene);
  const c = Color3.FromHexString(hex);
  m.diffuseColor = c;
  m.specularColor = Color3.Black();
  m.ambientColor = c.scale(0.25);
  if (opts.emissive) m.emissiveColor = c.scale(opts.emissive);
  if (opts.unlit) {
    m.disableLighting = true;
    m.emissiveColor = c;
  } else {
    new ToonPlugin(m);
  }
  if (opts.alpha !== undefined && opts.alpha < 1) m.alpha = opts.alpha;
  if (opts.backFaceCulling === false) m.backFaceCulling = false;
  byScene.set(key, m);
  return m;
}

/** Black ink outline. Use on cars, zombies, ragdolls and hero props only. */
export function outline(mesh: AbstractMesh, width = 0.035): void {
  mesh.renderOutline = true;
  mesh.outlineColor = Color3.FromHexString("#120d14");
  mesh.outlineWidth = width;
}

/** Lighten (+) or darken (-) a hex color by `amount` (-1..1). */
export function shade(hex: string, amount: number): string {
  const c = Color3.FromHexString(hex);
  const t = amount < 0 ? Color3.Black() : Color3.White();
  return Color3.Lerp(c, t, Math.abs(amount)).toHexString();
}
