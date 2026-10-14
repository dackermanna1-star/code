// WAD archive reader and layered resource lookup.
//
// A WadStack holds an IWAD plus any PWADs (e.g. chinatown.wad). Later WADs
// override earlier ones by lump name, except for "fallback" WADs, which only
// fill in lumps that no primary WAD provides (used for the Freedoom extras on
// top of shareware). Maps are only looked up in primary WADs.

const decoder = new TextDecoder('latin1');

export function lumpName(bytes, offset) {
  let end = offset;
  while (end < offset + 8 && bytes[end] !== 0) end++;
  return decoder.decode(bytes.subarray(offset, end)).toUpperCase();
}

export class Wad {
  constructor(buffer, name = 'wad') {
    this.name = name;
    this.bytes = new Uint8Array(buffer);
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    this.ident = decoder.decode(this.bytes.subarray(0, 4));
    if (this.ident !== 'IWAD' && this.ident !== 'PWAD') {
      throw new Error(`${name}: not a WAD file`);
    }
    const count = view.getInt32(4, true);
    const dirOffset = view.getInt32(8, true);
    this.lumps = [];
    for (let i = 0; i < count; i++) {
      const o = dirOffset + i * 16;
      const pos = view.getInt32(o, true);
      const size = view.getInt32(o + 4, true);
      this.lumps.push({ name: lumpName(this.bytes, o + 8), pos, size, wad: this, index: i });
    }
  }

  data(lump) {
    return this.bytes.subarray(lump.pos, lump.pos + lump.size);
  }
}

export class WadStack {
  constructor() {
    this.wads = [];
    this.fallbacks = [];
    this.byName = new Map();
  }

  add(wad, { fallback = false } = {}) {
    if (fallback) this.fallbacks.push(wad);
    else this.wads.push(wad);
    this.rebuild();
  }

  rebuild() {
    this.byName.clear();
    for (const wad of [...this.fallbacks, ...this.wads]) {
      for (const lump of wad.lumps) this.byName.set(lump.name, lump);
    }
  }

  get iwad() {
    return this.wads.find((w) => w.ident === 'IWAD') || this.wads[0];
  }

  has(name) {
    return this.byName.has(name.toUpperCase());
  }

  lump(name) {
    return this.byName.get(name.toUpperCase()) || null;
  }

  data(name) {
    const lump = this.lump(name);
    return lump ? lump.wad.data(lump) : null;
  }

  // All lumps between start/end markers, primaries overriding fallbacks by name.
  // Accepts several marker spellings (S_START / SS_START etc).
  namespace(starts, ends) {
    const out = new Map();
    for (const wad of [...this.fallbacks, ...this.wads]) {
      let inside = false;
      for (const lump of wad.lumps) {
        if (starts.includes(lump.name)) { inside = true; continue; }
        if (ends.includes(lump.name)) { inside = false; continue; }
        if (inside && lump.size > 0) out.set(lump.name, lump);
      }
    }
    return out;
  }

  // Map lumps: the marker lump followed by the fixed-order data lumps.
  mapLumps(mapName) {
    const order = ['THINGS', 'LINEDEFS', 'SIDEDEFS', 'VERTEXES', 'SEGS', 'SSECTORS', 'NODES', 'SECTORS', 'REJECT', 'BLOCKMAP'];
    for (let w = this.wads.length - 1; w >= 0; w--) {
      const wad = this.wads[w];
      const idx = wad.lumps.findIndex((l) => l.name === mapName.toUpperCase());
      if (idx < 0) continue;
      const out = {};
      for (let i = 0; i < order.length; i++) {
        const lump = wad.lumps[idx + 1 + i];
        if (lump && lump.name === order[i]) out[order[i]] = wad.data(lump);
      }
      return out;
    }
    return null;
  }

  mapNames() {
    const names = new Set();
    for (const wad of this.wads) {
      for (const lump of wad.lumps) {
        if (isEpisodeMapName(lump.name)) names.add(lump.name);
      }
    }
    return [...names];
  }

  // Maps with other names (e.g. CHINATWN): any marker followed by THINGS.
  customMapNames() {
    const names = new Set();
    for (const wad of this.wads) {
      wad.lumps.forEach((lump, i) => {
        const next = wad.lumps[i + 1];
        if (next && next.name === 'THINGS' && !isEpisodeMapName(lump.name)) names.add(lump.name);
      });
    }
    return [...names];
  }
}

// ExMy (DOOM) and MAPxx (DOOM II) map names.
export function isEpisodeMapName(name) {
  return /^E\dM\d$/.test(name) || /^MAP\d\d$/.test(name);
}

export function detectGameMode(stack) {
  if (stack.has('MAP01')) return 'commercial';
  if (stack.has('E4M1')) return 'retail';
  if (stack.has('E3M1')) return 'registered';
  return 'shareware';
}
