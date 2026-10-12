// Decodes all graphics from the WAD stack into the atlas and builds the
// lookup tables the renderer and game need (textures, flats, sprite frames,
// UI patches).

import {
  readPalettes, readColormaps, decodePatch, decodeFlat, decodeGraphic,
  readPatchNames, readTextureDefs, composeTexture, nearestIndex,
} from '../wad/graphics.js';
import { Atlas } from '../render/atlas.js';
import { SPRNAMES } from './info.js';

export class Resources {
  constructor(stack) {
    this.stack = stack;
    this.atlas = new Atlas();
    this.images = []; // per atlas id: {width,height,leftOffset,topOffset,name, img}
    this.textures = []; // doom texture number -> {name, id, width, height}
    this.textureByName = new Map();
    this.flats = [];
    this.flatByName = new Map();
    this.patches = new Map();
    this.sprites = []; // sprite index -> frames[]
  }

  init() {
    const s = this.stack;
    this.palettes = readPalettes(s.data('PLAYPAL'));
    this.palette = this.palettes.subarray(0, 768);
    this.colormaps = readColormaps(s.data('COLORMAP'));
    this.loadTextures();
    this.loadFlats();
    this.loadSprites();
    this.buildColorHelpers();
  }

  addImage(img, name) {
    const id = this.atlas.add(img);
    this.images[id] = {
      width: img.width, height: img.height,
      leftOffset: img.leftOffset, topOffset: img.topOffset, name, img,
    };
    return id;
  }

  loadTextures() {
    const s = this.stack;
    const pnames = readPatchNames(s.data('PNAMES'));
    const patchCache = new Map();
    const patchLumps = this.stack.namespace(['P_START', 'PP_START'], ['P_END', 'PP_END']);
    const getPatch = (name) => {
      if (patchCache.has(name)) return patchCache.get(name);
      const lump = patchLumps.get(name) || s.lump(name);
      const p = lump ? decodePatch(lump.wad.data(lump)) : null;
      patchCache.set(name, p);
      return p;
    };
    const defs = [];
    for (const lumpNameStr of ['TEXTURE1', 'TEXTURE2']) {
      const data = s.data(lumpNameStr);
      if (data) defs.push(...readTextureDefs(data, pnames));
    }
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      const img = composeTexture(def, getPatch);
      const id = this.addImage(img, def.name);
      const tex = { name: def.name, id, width: def.width, height: def.height, index: i, masked: img.mask.some((m) => m === 0) };
      this.textures.push(tex);
      if (!this.textureByName.has(def.name)) this.textureByName.set(def.name, tex);
    }
  }

  loadFlats() {
    const flats = this.stack.namespace(['F_START', 'FF_START'], ['F_END', 'FF_END']);
    // Preserve WAD order for animation ranges.
    const ordered = [];
    for (const wad of [...this.stack.fallbacks, ...this.stack.wads]) {
      let inside = false;
      for (const lump of wad.lumps) {
        if (lump.name === 'F_START' || lump.name === 'FF_START') { inside = true; continue; }
        if (lump.name === 'F_END' || lump.name === 'FF_END') { inside = false; continue; }
        if (inside && lump.size >= 4096 && !ordered.includes(lump.name)) ordered.push(lump.name);
      }
    }
    for (const name of ordered) {
      const lump = flats.get(name);
      if (!lump) continue;
      const img = decodeFlat(lump.wad.data(lump));
      const id = this.addImage(img, name);
      const flat = { name, id, index: this.flats.length };
      this.flats.push(flat);
      this.flatByName.set(name, flat);
    }
    this.skyFlat = this.flatByName.get('F_SKY1') || null;
  }

  loadSprites() {
    const lumps = this.stack.namespace(['S_START', 'SS_START'], ['S_END', 'SS_END']);
    const byPrefix = new Map();
    for (const [name, lump] of lumps) {
      const prefix = name.slice(0, 4);
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
      byPrefix.get(prefix).push({ name, lump });
    }
    const decoded = new Map();
    const imageFor = (entry) => {
      if (decoded.has(entry.name)) return decoded.get(entry.name);
      const img = decodePatch(entry.lump.wad.data(entry.lump));
      const id = img ? this.addImage(img, entry.name) : -1;
      decoded.set(entry.name, id);
      return id;
    };
    for (let si = 0; si < SPRNAMES.length; si++) {
      const frames = [];
      const list = byPrefix.get(SPRNAMES[si]) || [];
      const install = (frameChar, rotChar, id, flip) => {
        const f = frameChar.charCodeAt(0) - 65;
        if (f < 0 || f > 28) return;
        const rot = rotChar.charCodeAt(0) - 48;
        if (!frames[f]) frames[f] = { rotate: false, images: new Array(8).fill(-1), flip: new Array(8).fill(false) };
        const fr = frames[f];
        if (rot === 0) {
          // Rotation 0 only applies if no specific rotations were given.
          if (fr.rotate) return;
          fr.images.fill(id);
          fr.flip.fill(flip);
        } else if (rot >= 1 && rot <= 8) {
          if (!fr.rotate) { fr.images.fill(-1); fr.rotate = true; }
          fr.images[rot - 1] = id;
          fr.flip[rot - 1] = flip;
        }
      };
      // Install rotation-0 first so explicit rotations override.
      list.sort((a, b) => (a.name[5] === '0' ? -1 : 0) - (b.name[5] === '0' ? -1 : 0));
      for (const entry of list) {
        const id = imageFor(entry);
        if (id < 0) continue;
        install(entry.name[4], entry.name[5], id, false);
        if (entry.name.length >= 8) install(entry.name[6], entry.name[7], id, true);
      }
      // Fill gaps in rotation sets with the nearest available rotation.
      for (const fr of frames) {
        if (!fr) continue;
        const first = fr.images.findIndex((x) => x >= 0);
        for (let r = 0; r < 8; r++) {
          if (fr.images[r] < 0 && first >= 0) { fr.images[r] = fr.images[first]; fr.flip[r] = fr.flip[first]; }
        }
      }
      this.sprites[si] = frames;
    }
  }

  patch(name) {
    name = name.toUpperCase();
    if (this.patches.has(name)) return this.patches.get(name);
    const data = this.stack.data(name);
    const img = decodeGraphic(data);
    let entry = null;
    if (img) {
      const id = this.addImage(img, name);
      entry = { id, width: img.width, height: img.height, leftOffset: img.leftOffset, topOffset: img.topOffset };
    }
    this.patches.set(name, entry);
    return entry;
  }

  textureNum(name) {
    if (!name || name === '-') return 0;
    const t = this.textureByName.get(name.toUpperCase());
    return t ? t.index : 0;
  }

  flatNum(name) {
    const f = this.flatByName.get(name.toUpperCase());
    return f ? f.index : 0;
  }

  buildColorHelpers() {
    const pal = this.palette;
    this.nearest = (r, g, b) => nearestIndex(pal, r, g, b);
    this.rgbOf = (i) => [pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2]];
  }

  // Sample the palette index of a wall texture or flat at texel coords.
  sampleImage(id, u, v) {
    const info = this.images[id];
    if (!info) return 0;
    const x = ((Math.floor(u) % info.width) + info.width) % info.width;
    const y = ((Math.floor(v) % info.height) + info.height) % info.height;
    const i = y * info.width + x;
    return info.img.mask[i] ? info.img.pixels[i] : -1;
  }
}
