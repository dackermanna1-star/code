// Material library: lazily creates StandardMaterials backed by procedural textures.
// `scale` is metres per texture repeat for world-space UV mapping.
import { BABYLON } from './babylon.js';
import { makeTexture } from './textures.js';

const C = (h) => BABYLON.Color3.FromHexString(h);

export const MATERIAL_DEFS = {
  concrete: { tex: 'concrete', scale: 4 }, concreteDark: { tex: 'concreteDark', scale: 4 },
  concretePolished: { tex: 'concretePolished', scale: 4, spec: 0.22 }, concreteLines: { tex: 'concreteLines', scale: 4 },
  linoBlue: { tex: 'linoBlue', scale: 3, spec: 0.18 }, linoGreen: { tex: 'linoGreen', scale: 3, spec: 0.18 },
  checker: { tex: 'checker', scale: 3.2, spec: 0.2 }, tileRed: { tex: 'tileRed', scale: 2 }, tileWhite: { tex: 'tileWhite', scale: 2, spec: 0.3 },
  rubber: { tex: 'rubber', scale: 3 }, carpet: { tex: 'carpet', scale: 2 }, carpetRed: { tex: 'carpetRed', scale: 2.5 },
  grass: { tex: 'grass', scale: 6 }, gravel: { tex: 'gravel', scale: 4 }, asphalt: { tex: 'asphalt', scale: 5 }, dirt: { tex: 'dirt', scale: 5 },
  ground: { tex: 'ground', scale: 14 }, road: { tex: 'road', scale: 8 }, roof: { tex: 'roof', scale: 6 },
  paintGreen: { tex: 'paintGreen', scale: 2 }, paintCream: { tex: 'paintCream', scale: 2 }, paintMint: { tex: 'paintMint', scale: 2 },
  paintBlue: { tex: 'paintBlue', scale: 2 }, paintRed: { tex: 'paintRed', scale: 2 }, paintOrange: { tex: 'paintOrange', scale: 2 },
  paintYellow: { tex: 'paintYellow', scale: 2 }, paintGray: { tex: 'paintGray', scale: 2 }, paintWhite: { tex: 'paintWhite', scale: 2 },
  paintSlate: { tex: 'paintSlate', scale: 2 }, paintTeal: { tex: 'paintTeal', scale: 2 }, grimWall: { tex: 'grimWall', scale: 2.5 },
  trim: { tex: 'trim', scale: 1 }, brick: { tex: 'brick', scale: 3 }, woodPanel: { tex: 'woodPanel', scale: 2 }, wallpaper: { tex: 'wallpaper', scale: 1.5 },
  ceiling: { tex: 'ceiling', scale: 1.2, emissive2: '#4a4842' }, steel: { tex: 'steel', scale: 1, spec: 0.45 }, iron: { tex: 'iron', scale: 1, spec: 0.3 },
  wood: { tex: 'wood', scale: 1.2 }, mattress: { tex: 'mattress', scale: 1 }, fabric: { tex: 'fabric', scale: 0.5 },
  paint: { tex: 'paint', scale: 1, spec: 0.12 }, plastic: { tex: 'paint', scale: 1, spec: 0.35 }, porcelain: { tex: 'porcelain', scale: 1, spec: 0.5 },
  fence: { tex: 'chainLink', scale: 1.0, alpha: true, twoSided: true }, razor: { tex: 'razor', scale: 1, alpha: true, twoSided: true },
  courtLines: { tex: 'courtLines', scale: 1, alpha: true, decal: true }, trackLines: { tex: 'trackLines', scale: 1, alpha: true, decal: true },
  dark: { tex: 'dark', scale: 1 },
  glow: { emissive: '#fff6dc', noLight: true }, glowWarm: { emissive: '#ffd89a', noLight: true },
  screen: { emissive: '#7fb6d9', noLight: true }, glass: { color: '#9fc4d0', alpha: 0.35, spec: 0.8 },
  black: { color: '#121314' }, white: { color: '#f2f2ee' }, rubberBlack: { color: '#1c1d1e' },
  sky: { emissiveVC: true, noLight: true, noFog: true },
};

export class MaterialLibrary {
  constructor(scene) {
    this.scene = scene;
    this.mats = new Map();
    this.textures = new Map();
  }
  scale(key) { return (MATERIAL_DEFS[key] || MATERIAL_DEFS[key.split(':')[0]] || { scale: 1 }).scale || 1; }
  texture(key, alpha) {
    if (!this.textures.has(key)) this.textures.set(key, makeTexture(this.scene, key, alpha));
    return this.textures.get(key);
  }
  /** Register a one-off material (e.g. a sign texture) under a key. */
  register(key, mat, scale = 1) { this.mats.set(key, mat); MATERIAL_DEFS[key] = { scale }; return mat; }
  get(key) {
    if (this.mats.has(key)) return this.mats.get(key);
    const def = MATERIAL_DEFS[key];
    if (!def) throw new Error(`Unknown material ${key}`);
    const m = new BABYLON.StandardMaterial(`m_${key}`, this.scene);
    m.specularColor = new BABYLON.Color3(def.spec || 0.06, def.spec || 0.06, def.spec || 0.06);
    m.specularPower = def.spec ? 48 : 16;
    if (def.tex) {
      m.diffuseTexture = this.texture(def.tex, !!def.alpha);
      if (def.alpha) { m.diffuseTexture.hasAlpha = true; m.useAlphaFromDiffuseTexture = false; m.alphaCutOff = 0.35; }
    }
    if (def.color) m.diffuseColor = C(def.color);
    if (def.alpha != null && typeof def.alpha === 'number') { m.alpha = def.alpha; }
    if (def.twoSided) m.backFaceCulling = false;
    if (def.decal) { m.zOffset = -2; }
    if (def.emissive) { m.emissiveColor = C(def.emissive); m.diffuseColor = BABYLON.Color3.Black(); m.disableLighting = true; }
    if (def.emissiveVC) { m.emissiveColor = BABYLON.Color3.White(); m.diffuseColor = BABYLON.Color3.Black(); m.disableLighting = true; }
    if (def.emissive2) m.emissiveColor = C(def.emissive2);
    if (def.noFog) m.fogEnabled = false;
    m.maxSimultaneousLights = 4;
    this.mats.set(key, m);
    return m;
  }
}
