// Loads the level: builds brushes, compiles faces + collision, loads (or bakes)
// lightmaps and builds the render meshes. Also provides light sampling for models.

import { buildDust2 } from '../map/dust2.js';
import { compileMap } from '../map/compile.js';
import { allocateLightmaps, bakeLightmaps, encodeLightmap } from '../map/lightmap.js';
import { buildWorldMeshes, makeLightmapTexture } from '../map/meshbuilder.js';
import { hashMap, decodeRgbPng } from '../map/bakeio.js';
import { DUST2_LIGHTING, albedoOf } from '../map/lighting.js';
import { TraceResult, MASK_SHOT } from '../engine/collision.js';

export async function loadWorld(texLib, onProgress = () => {}, opts = {}) {
  onProgress('Building world geometry', 0.05);
  await tick();
  const map = buildDust2();
  const compiled = compileMap(map.brushes);
  const alloc = allocateLightmaps(compiled.faces);
  const lighting = { ...DUST2_LIGHTING, lights: map.lights };
  const hash = hashMap(map.brushes, lighting);
  let rgba = null;
  if (!opts.forceBake) {
    try {
      const base = import.meta.env?.BASE_URL ?? './';
      const meta = await (await fetch(`${base}maps/de_dust2.lm.json`)).json();
      if (meta.hash === hash && meta.width === alloc.width && meta.height === alloc.height) {
        onProgress('Loading lightmaps', 0.2);
        const buf = await (await fetch(`${base}maps/de_dust2.lm.png`)).arrayBuffer();
        const { rgb } = await decodeRgbPng(buf);
        rgba = new Uint8Array(alloc.width * alloc.height * 4);
        for (let i = 0, n = alloc.width * alloc.height; i < n; i++) {
          rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = 255;
        }
      } else {
        console.warn('lightmap cache mismatch', meta.hash, hash);
      }
    } catch (e) {
      console.warn('no prebaked lightmap', e);
    }
  }
  if (!rgba) {
    onProgress('Computing lighting', 0.25);
    await tick();
    const rgb = bakeLightmaps(compiled.faces, compiled.world, alloc, { ...lighting, skySamples: opts.skySamples || 8, sunSamples: 2 }, albedoOf);
    rgba = encodeLightmap(rgb, alloc.width, alloc.height);
  }
  onProgress('Creating meshes', 0.8);
  await tick();
  const lmTex = makeLightmapTexture(rgba, alloc.width, alloc.height);
  const meshes = buildWorldMeshes(compiled.faces, alloc, lmTex, (n) => texLib.get(n), (n) => texLib.info(n));
  const sampler = new LightSampler(compiled, alloc, rgba);
  return { map, compiled, collision: compiled.world, alloc, lmTex, meshes, lighting, sampler, hash };
}

function tick() { return new Promise((r) => setTimeout(r, 0)); }

// GoldSrc lights studio models with the lightmap colour of the surface below them.
export class LightSampler {
  constructor(compiled, alloc, rgba) {
    this.world = compiled.world;
    this.W = alloc.width;
    this.H = alloc.height;
    this.rgba = rgba;
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
    out[0] = this.rgba[o] / 127.5; out[1] = this.rgba[o + 1] / 127.5; out[2] = this.rgba[o + 2] / 127.5;
    return out;
  }
}
