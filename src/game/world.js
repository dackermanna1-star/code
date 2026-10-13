// Loads the level: builds brushes, compiles faces + collision, loads (or bakes)
// lightmaps and builds the render meshes. Also provides light sampling for models.

import { prepareMap, BAKE_QUALITY } from '../map/prepare.js';
import { bakeLightmapsAsync, encodeLightmap } from '../map/lightmap.js';
import { buildWorldMeshes, makeLightmapTexture } from '../map/meshbuilder.js';
import { decodeRgbPng } from '../map/bakeio.js';
import { albedoOf } from '../map/lighting.js';
import { TraceResult, MASK_SHOT } from '../engine/collision.js';
import { assetUrl } from '../engine/assetpath.js';
import { loadBspWorld } from '../bsp/bspworld.js';
import { createSkybox } from '../bsp/skybox.js';
import { loadMapFiles, MAPS } from './maps.js';
import { setActiveMap } from './mapmeta.js';

const now = () => performance.now();

export async function loadWorld(texLib, onProgress = () => {}, opts = {}) {
  // an original GoldSrc map the player supplied (src/game/maps.js)
  if (opts.mapDef && !opts.mapDef.builtin) {
    onProgress(`Loading ${opts.mapDef.title}`, 0.02);
    const files = await loadMapFiles(opts.mapDef, opts.mapsrc);
    const W = await loadBspWorld({ ...files, name: opts.mapDef.id }, onProgress);
    W.mapDef = opts.mapDef;
    if (files.sky) {
      W.skybox = createSkybox(files.sky);
      W.meshes.push(W.skybox);
    }
    setActiveMap(W.mapDef);
    return W;
  }
  // a built-in map (src/map/maps/*): de_dust2 unless another is asked for
  const def = opts.mapDef?.builtin ? opts.mapDef : MAPS.de_dust2;
  const t0 = now();
  onProgress('Building world geometry', 0.05);
  await tick();
  const { map, compiled, alloc, lighting, hash, encoding } = prepareMap(def);
  let rgba = null, lmSource = 'baked';
  if (!opts.forceBake) {
    try {
      const meta = await (await fetch(assetUrl(`maps/${def.id}.lm.json`))).json();
      if (meta.hash === hash && meta.width === alloc.width && meta.height === alloc.height) {
        onProgress('Loading lightmaps', 0.2);
        const buf = await (await fetch(assetUrl(`maps/${def.id}.lm.png`))).arrayBuffer();
        const { rgb } = await decodeRgbPng(buf);
        rgba = new Uint8Array(alloc.width * alloc.height * 4);
        for (let i = 0, n = alloc.width * alloc.height; i < n; i++) {
          rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = 255;
        }
        lmSource = 'prebaked';
      } else {
        console.warn('lightmap cache mismatch', def.id, meta.hash, hash);
      }
    } catch (e) {
      console.warn('no prebaked lightmap', def.id, e);
    }
  }
  if (!rgba) {
    // (tools/bake.mjs <id> ships one; this keeps an edited map playable meanwhile)
    onProgress('Computing lighting', 0.25);
    await tick();
    const q = { ...BAKE_QUALITY.load, ...(opts.skySamples ? { skySamples: opts.skySamples } : {}) };
    const rgb = await bakeLightmapsAsync(compiled.faces, compiled.world, alloc, { ...lighting, ...q }, albedoOf,
      (p) => onProgress(`Computing lighting ${Math.round(p * 100)}%`, 0.25 + p * 0.5));
    rgba = encodeLightmap(rgb, alloc.width, alloc.height, encoding);
  }
  onProgress('Creating meshes', 0.8);
  await tick();
  const lmTex = makeLightmapTexture(rgba, alloc.width, alloc.height);
  const meshes = buildWorldMeshes(compiled.faces, alloc, lmTex, (n) => texLib.get(n), (n) => texLib.info(n), { encoding });
  const sampler = new LightSampler(compiled, alloc, rgba, encoding);
  setActiveMap(def);
  return { map, compiled, collision: compiled.world, alloc, lmTex, meshes, lighting, sampler, hash, mapDef: def, brushEnts: [], lmSource, loadMs: now() - t0 };
}

function tick() { return new Promise((r) => setTimeout(r, 0)); }

// GoldSrc lights studio models with the lightmap colour of the surface below them.
export class LightSampler {
  constructor(compiled, alloc, rgba, encoding = 'linear') {
    this.world = compiled.world;
    this.W = alloc.width;
    this.H = alloc.height;
    this.rgba = rgba;
    this.sqrt = encoding === 'sqrt'; // (lightmap.js encodeLightmap)
    this.byBrush = new Map();
    for (const f of compiled.faces) {
      let l = this.byBrush.get(f.brush);
      if (!l) this.byBrush.set(f.brush, l = []);
      l.push(f);
    }
    this.tr = new TraceResult();
  }

  // Returns [r,g,b] light (0..2) at the floor below pos.
  sample(pos, out = [1, 1, 1]) {
    const end = [pos[0], pos[1], pos[2] - 512];
    this.world.trace(pos, end, [0, 0, 0], [0, 0, 0], MASK_SHOT, this.tr);
    if (this.tr.fraction >= 1 || !this.tr.brush) return out;
    const p = this.tr.endpos;
    const list = this.byBrush.get(this.tr.brush.userData);
    if (!list) return out;
    let face = null;
    for (const f of list) {
      if (f.n[2] < 0.6) continue;
      const lm = f.lm;
      const s = (p[0] * lm.ax.s[0] + p[1] * lm.ax.s[1] + p[2] * lm.ax.s[2]);
      const t = (p[0] * lm.ax.t[0] + p[1] * lm.ax.t[1] + p[2] * lm.ax.t[2]);
      const i = s / lm.luxel - lm.s0, j = t / lm.luxel - lm.t0;
      if (i >= -0.5 && j >= -0.5 && i <= lm.w - 0.5 && j <= lm.h - 0.5) { face = f; break; }
      face = face || f;
    }
    if (!face) return out;
    const lm = face.lm;
    const s = (p[0] * lm.ax.s[0] + p[1] * lm.ax.s[1] + p[2] * lm.ax.s[2]) / lm.luxel - lm.s0;
    const t = (p[0] * lm.ax.t[0] + p[1] * lm.ax.t[1] + p[2] * lm.ax.t[2]) / lm.luxel - lm.t0;
    const i = Math.max(0, Math.min(lm.w - 1, Math.round(s)));
    const j = Math.max(0, Math.min(lm.h - 1, Math.round(t)));
    const o = ((lm.y + j) * this.W + (lm.x + i)) * 4;
    if (this.sqrt) {
      const r = this.rgba[o] / 255, g = this.rgba[o + 1] / 255, b = this.rgba[o + 2] / 255;
      out[0] = r * r * 2; out[1] = g * g * 2; out[2] = b * b * 2;
      return out;
    }
    out[0] = this.rgba[o] / 127.5; out[1] = this.rgba[o + 1] / 127.5; out[2] = this.rgba[o + 2] / 127.5;
    return out;
  }
}
