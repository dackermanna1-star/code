// Material library: PBR materials built from procedural textures. Every
// environment material uses vertex colours so merged geometry can carry
// per-object tint variation without extra draw calls.
import * as THREE from 'three';
import { getTexture } from './textures.js';

// name -> { tex: [kind, opts], scale: metres per texture tile, surf: impact surface type, extra }
const DEFS = {
  concrete: { tex: ['concrete', {}], scale: 3, surf: 'concrete' },
  concreteDark: { tex: ['concrete', { color: 0x5a5854, seed: 13, stain: 0.5 }], scale: 3, surf: 'concrete' },
  concreteFloor: { tex: ['concrete', { color: 0x76736c, seed: 15, crackCount: 9 }], scale: 4, surf: 'concrete' },
  plaster: { tex: ['plaster', {}], scale: 2.5, surf: 'plaster' },
  plasterGreen: { tex: ['plaster', { color: 0x9fae96, seed: 23 }], scale: 2.5, surf: 'plaster' },
  plasterBlue: { tex: ['plaster', { color: 0x8e9eaa, seed: 24 }], scale: 2.5, surf: 'plaster' },
  plasterHosp: { tex: ['plaster', { color: 0xc9d3cf, seed: 25, grime: 0.35 }], scale: 2.5, surf: 'plaster' },
  plasterDirty: { tex: ['plaster', { color: 0xa89c86, seed: 26, grime: 0.9, stain: 0.5, cracks: true }], scale: 2.5, surf: 'plaster' },
  wallpaper: { tex: ['wallpaper', {}], scale: 2.4, surf: 'plaster' },
  wallpaperGreen: { tex: ['wallpaper', { color: 0x5a6a4a, color2: 0x46543a, seed: 33, stripes: 16 }], scale: 2.4, surf: 'plaster' },
  wallpaperRose: { tex: ['wallpaper', { color: 0x8a5a58, color2: 0x74484a, seed: 34, stripes: 10 }], scale: 2.4, surf: 'plaster' },
  brick: { tex: ['brick', {}], scale: 3, surf: 'brick' },
  brickDark: { tex: ['brick', { color: 0x4e2a22, seed: 43, stain: 0.6 }], scale: 3, surf: 'brick' },
  brickTan: { tex: ['brick', { color: 0x9a7a58, mortarColor: 0x7a746a, seed: 44 }], scale: 3, surf: 'brick' },
  tileWhite: { tex: ['tiles', { cols: 10, rows: 20, color: 0xdcdad0, offset: 0.5, grout: 0.004, gloss: 0.15 }], scale: 2, surf: 'tile' },
  tileSubway: { tex: ['tiles', { cols: 8, rows: 16, color: 0xcfd2c8, offset: 0.5, grout: 0.004, gloss: 0.15, stain: 0.6 }], scale: 2, surf: 'tile' },
  tileGreen: { tex: ['tiles', { cols: 8, rows: 16, color: 0x6e8a74, offset: 0.5, grout: 0.004, gloss: 0.15, stain: 0.5 }], scale: 2, surf: 'tile' },
  tileChecker: { tex: ['tiles', { cols: 8, rows: 8, color: 0xd6d2c6, color2: 0x2a2a2c, checker: true, grout: 0.003 }], scale: 2.4, surf: 'tile' },
  tileFloor: { tex: ['tiles', { cols: 6, rows: 6, color: 0x9a968a, grout: 0.005, gloss: 0.35 }], scale: 2.4, surf: 'tile' },
  woodFloor: { tex: ['woodfloor', {}], scale: 3, surf: 'wood' },
  woodFloorDark: { tex: ['woodfloor', { color: 0x4a3020, seed: 63 }], scale: 3, surf: 'wood' },
  wood: { tex: ['wood', {}], scale: 1.2, surf: 'wood' },
  woodDark: { tex: ['wood', { color: 0x4e3622, seed: 73 }], scale: 1.2, surf: 'wood' },
  woodPale: { tex: ['wood', { color: 0xb8a078, seed: 74 }], scale: 1.2, surf: 'wood' },
  carpet: { tex: ['carpet', {}], scale: 2, surf: 'carpet' },
  carpetBlue: { tex: ['carpet', { color: 0x2e3a52, seed: 83 }], scale: 2, surf: 'carpet' },
  carpetGray: { tex: ['carpet', { color: 0x4a4846, seed: 84 }], scale: 2, surf: 'carpet' },
  asphalt: { tex: ['asphalt', {}], scale: 6, surf: 'concrete' },
  sidewalk: { tex: ['sidewalk', {}], scale: 3, surf: 'concrete' },
  metal: { tex: ['metal', {}], scale: 2, surf: 'metal' },
  metalDark: { tex: ['metal', { color: 0x2e3234, seed: 113, rust: 0.4 }], scale: 2, surf: 'metal' },
  metalClean: { tex: ['metal', { color: 0x9aa2a6, seed: 114, rust: 0.05, rough: 0.3, metal: 0.9 }], scale: 1.5, surf: 'metal' },
  rust: { tex: ['metal', { color: 0x6a4a36, seed: 115, rust: 1.4 }], scale: 2, surf: 'metal' },
  diamond: { tex: ['diamond', {}], scale: 1.5, surf: 'metal' },
  roof: { tex: ['rooftar', {}], scale: 4, surf: 'concrete' },
  ceiling: { tex: ['ceiling', {}], scale: 2.4, surf: 'plaster' },
  linoleum: { tex: ['linoleum', {}], scale: 3, surf: 'tile' },
  linoleumBlue: { tex: ['linoleum', { color: 0x8aa0a8, seed: 153 }], scale: 3, surf: 'tile' },
  sewer: { tex: ['sewer', {}], scale: 3, surf: 'brick' },
  dirt: { tex: ['dirt', {}], scale: 4, surf: 'dirt' },
  fabric: { tex: ['fabric', {}], scale: 1, surf: 'fabric' },
  fabricRed: { tex: ['fabric', { color: 0x6a2a26, seed: 193 }], scale: 1, surf: 'fabric' },
  fabricGreen: { tex: ['fabric', { color: 0x3a4a32, seed: 194 }], scale: 1, surf: 'fabric' },
  fabricBlue: { tex: ['fabric', { color: 0x2c3a5a, seed: 195 }], scale: 1, surf: 'fabric' },
  marble: { tex: ['marble', {}], scale: 3, surf: 'tile' },
  paintedRed: { tex: ['paintedMetal', {}], scale: 2, surf: 'metal' },
  paintedYellow: { tex: ['paintedMetal', { color: 0xb8942a, seed: 213 }], scale: 2, surf: 'metal' },
  paintedGreen: { tex: ['paintedMetal', { color: 0x2e4a36, seed: 214 }], scale: 2, surf: 'metal' },
  paintedWhite: { tex: ['paintedMetal', { color: 0xc8c8c0, seed: 215 }], scale: 2, surf: 'metal' },
  paintedBlue: { tex: ['paintedMetal', { color: 0x2a4a7a, seed: 216 }], scale: 2, surf: 'metal' },
  rubber: { tex: ['rubber', {}], scale: 1, surf: 'rubber' },
};

const SURF_OF = {};
for (const k in DEFS) SURF_OF[k] = DEFS[k].surf;

export class MaterialLib {
  constructor() {
    this.cache = new Map();
    this.anisotropy = 8;
  }
  surfOf(name) {
    return SURF_OF[name] || 'concrete';
  }
  scaleOf(name) {
    return DEFS[name]?.scale ?? 2;
  }
  has(name) {
    return !!DEFS[name] || this.cache.has(name);
  }
  get(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const d = DEFS[name];
    let m;
    if (d) {
      const t = getTexture(d.tex[0], { ...d.tex[1], anisotropy: this.anisotropy });
      m = new THREE.MeshStandardMaterial({
        map: t.map,
        normalMap: t.normalMap,
        normalScale: new THREE.Vector2(1, 1),
        roughnessMap: t.ormMap,
        metalnessMap: t.ormMap,
        aoMap: t.ormMap,
        aoMapIntensity: 1,
        roughness: 1,
        metalness: 1,
        vertexColors: true,
      });
      m.name = name;
    } else {
      m = this.special(name);
    }
    this.cache.set(name, m);
    return m;
  }
  // Non-textured / special materials.
  special(name) {
    let m;
    switch (name) {
      case 'glass':
        m = new THREE.MeshStandardMaterial({ color: 0x9fb4b8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25, depthWrite: false, vertexColors: true });
        break;
      case 'glassDirty':
        m = new THREE.MeshStandardMaterial({ color: 0x7a8a78, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false, vertexColors: true });
        break;
      case 'emissiveWarm':
        m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd9a0, emissiveIntensity: 3.0, vertexColors: true });
        break;
      case 'emissiveCool':
        m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xd8f0ff, emissiveIntensity: 3.0, vertexColors: true });
        break;
      case 'emissiveRed':
        m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2010, emissiveIntensity: 4.0, vertexColors: true });
        break;
      case 'emissiveGreen':
        m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x30ff60, emissiveIntensity: 3.0, vertexColors: true });
        break;
      case 'emissiveWindow':
        m = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffc070, emissiveIntensity: 1.2, vertexColors: true });
        break;
      case 'plastic':
        m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.0, vertexColors: true });
        break;
      case 'plasticGloss':
        m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.0, vertexColors: true });
        break;
      case 'chrome':
        m = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.15, metalness: 1.0, vertexColors: true });
        break;
      case 'carPaint':
        m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.4, vertexColors: true });
        break;
      case 'blackMatte':
        m = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, metalness: 0, vertexColors: true });
        break;
      case 'paper':
        m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
        break;
      case 'waterSurface':
        m = new THREE.MeshStandardMaterial({ color: 0x1a2016, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.88, vertexColors: true });
        break;
      case 'foliage':
        m = new THREE.MeshStandardMaterial({ color: 0x2a3a1e, roughness: 0.9, vertexColors: true });
        break;
      case 'skybox':
        m = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: false });
        break;
      default:
        m = new THREE.MeshStandardMaterial({ color: 0xff00ff, vertexColors: true });
        console.warn('Unknown material', name);
    }
    m.name = name;
    return m;
  }
}

export const materials = new MaterialLib();
