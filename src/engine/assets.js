// Optional asset modules (textures, sky, models, sounds) are loaded through
// import.meta.glob so the engine still runs if one is missing.
import * as THREE from 'three';
import { devTexture, devAverage } from '../map/devtex.js';
import { makeWorldTexture } from '../map/meshbuilder.js';

const modules = import.meta.glob('../assets/*.js');

export async function loadAssetModule(name) {
  const key = `../assets/${name}.js`;
  if (!modules[key]) return null;
  try {
    return await modules[key]();
  } catch (e) {
    console.error('asset module failed', name, e);
    return null;
  }
}

export class TextureLibrary {
  constructor(lib) {
    this.lib = lib; // textures.js module or null
    this.cache = new Map();
    this.canvases = new Map();
  }

  info(name) {
    const meta = this.lib?.TEXTURES?.[name];
    if (meta) return meta;
    return { size: [64, 64], world: [128, 128] };
  }

  canvas(name) {
    let c = this.canvases.get(name);
    if (c) return c;
    try {
      c = this.lib?.TEXTURES?.[name] ? this.lib.generateTexture(name) : devTexture(name);
    } catch (e) {
      console.error('texture failed', name, e);
      c = devTexture(name);
    }
    this.canvases.set(name, c);
    return c;
  }

  get(name) {
    let t = this.cache.get(name);
    if (t) return t;
    const meta = this.info(name);
    t = makeWorldTexture(this.canvas(name), meta);
    if (meta.alpha && !meta.world) {
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    }
    this.cache.set(name, t);
    return t;
  }

  average(name) {
    if (this.lib?.averageColor && this.lib.TEXTURES?.[name]) {
      try { return this.lib.averageColor(name); } catch { /* fall through */ }
    }
    return devAverage(name);
  }
}
