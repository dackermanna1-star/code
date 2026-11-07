import * as THREE from 'three';

// =============================================================================
// Asset helpers: cached texture loading with sensible defaults, PBR texture
// sets (ambientCG layout), canvas textures and a few procedural fallbacks so a
// missing file never breaks the experience.
//
//   app.assets.texture('assets/textures/fabric/color.jpg', { srgb: true, repeat: [4, 4] })
//   app.assets.pbr('assets/textures/carpet', { repeat: [8, 40] })  -> { map, normalMap, roughnessMap, aoMap }
//   app.assets.canvasTexture(w, h, (ctx, w, h) => {...}, { srgb: true })
//
// Loading is asynchronous; textures are returned immediately and filled when
// the image arrives. app.assets.ready() resolves when all pending loads settle.
// =============================================================================
export class Assets {
  constructor(app) {
    this.app = app;
    this.loader = new THREE.TextureLoader();
    this.cache = new Map();
    this.pending = new Set();
    this.failed = [];
    this.maxAnisotropy = 8;
  }

  texture(url, { srgb = false, repeat = null, wrap = THREE.RepeatWrapping, anisotropy = null, flipY = true, onLoad = null, fallbackColor = null } = {}) {
    const key = `${url}|${srgb}|${repeat ? repeat.join('x') : ''}|${flipY}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const tex = new THREE.Texture();
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = wrap;
    tex.flipY = flipY;
    tex.anisotropy = anisotropy ?? this.maxAnisotropy;
    if (repeat) tex.repeat.set(repeat[0], repeat[1]);
    // 1x1 placeholder until loaded
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const cx = c.getContext('2d'); cx.fillStyle = fallbackColor || (srgb ? '#808080' : '#8080ff'); cx.fillRect(0, 0, 1, 1);
    tex.image = c;
    tex.needsUpdate = true;
    const p = new Promise((resolve) => {
      this.loader.load(url, (loaded) => {
        tex.image = loaded.image;
        tex.needsUpdate = true;
        if (onLoad) onLoad(tex);
        resolve(tex);
      }, undefined, () => {
        this.failed.push(url);
        console.warn('[assets] failed to load', url);
        resolve(tex);
      });
    });
    this.pending.add(p);
    p.finally(() => this.pending.delete(p));
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * Load a PBR set from a folder containing color.jpg, normal.jpg (OpenGL convention),
   * roughness.jpg, ao.jpg, metalness.jpg (whichever exist; list them in `maps`).
   */
  pbr(folder, { repeat = [1, 1], maps = ['color', 'normal', 'roughness'], ext = 'jpg' } = {}) {
    const out = {};
    if (maps.includes('color')) out.map = this.texture(`${folder}/color.${ext}`, { srgb: true, repeat });
    if (maps.includes('normal')) out.normalMap = this.texture(`${folder}/normal.${ext}`, { repeat });
    if (maps.includes('roughness')) out.roughnessMap = this.texture(`${folder}/roughness.${ext}`, { repeat });
    if (maps.includes('ao')) out.aoMap = this.texture(`${folder}/ao.${ext}`, { repeat });
    if (maps.includes('metalness')) out.metalnessMap = this.texture(`${folder}/metalness.${ext}`, { repeat });
    return out;
  }

  canvasTexture(w, h, draw, { srgb = true, repeat = null, wrap = THREE.ClampToEdgeWrapping, mipmaps = true } = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = wrap;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = this.maxAnisotropy;
    t.generateMipmaps = mipmaps;
    if (!mipmaps) t.minFilter = THREE.LinearFilter;
    return t;
  }

  async ready(timeoutMs = 20000) {
    const all = Promise.allSettled([...this.pending]);
    await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  async json(url) {
    try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return await r.json(); } catch (e) { console.warn('[assets] json failed', url, e); return null; }
  }
}
