// Packs facades into texture-array layers (each PAINT_LAYER_W x PAINT_LAYER_H
// meters) and owns the three layered textures sampled by the facade shader:
//   color  RGBA8  graffiti paint colour + coverage
//   props  RGBA8  metallic, gloss, paper mask, any-paint (half resolution)
//   grime  RGBA8  soot, damp streaks, efflorescence, rust (low resolution)
import * as THREE from 'three';
import { PAINT_LAYER_W, PAINT_LAYER_H } from '../world/units.js';

export const MAX_FACADES = 40;

export class PaintAtlas {
  constructor({ colorPPM = 48, propsPPM = 24, grimePPM = 16 } = {}) {
    this.colorPPM = colorPPM;
    this.propsPPM = propsPPM;
    this.grimePPM = grimePPM;
    this.entries = new Map(); // facade id -> { layer, uOffset, v0, width }
    this.layerFill = [];
  }

  /** First-fit packing of facades (that want paint) into layers. */
  pack(facades) {
    const items = facades
      .map((f, index) => ({ f, index }))
      .filter(({ f }) => f.paint || f.ghost || !f.blank);
    // widest first for tighter packing
    items.sort((a, b) => b.f.width - a.f.width);
    for (const { f } of items) {
      let remaining = f.width;
      let uStart = 0;
      // facades wider than a layer span several consecutive layers
      const parts = [];
      while (remaining > 0.01) {
        const w = Math.min(PAINT_LAYER_W, remaining);
        let layer = this.layerFill.findIndex((fill) => fill + w <= PAINT_LAYER_W + 1e-6);
        // facades spanning several layers occupy fresh consecutive layers from u = 0
        if (parts.length > 0 || layer < 0 || f.width > PAINT_LAYER_W) {
          layer = this.layerFill.length;
          this.layerFill.push(0);
        }
        parts.push({ layer, uOffset: this.layerFill[layer] - uStart, u0: uStart, u1: uStart + w });
        this.layerFill[layer] += w + 0.25;
        uStart += w;
        remaining -= w;
      }
      const v0 = f.base && f.base > 0 ? f.base : 0;
      this.entries.set(f.id, { parts, v0, width: f.width });
    }
    this.layers = this.layerFill.length;
    return this;
  }

  createTextures() {
    const make = (ppm, fill = 0) => {
      const w = Math.round(PAINT_LAYER_W * ppm);
      const h = Math.round(PAINT_LAYER_H * ppm);
      const data = new Uint8Array(w * h * 4 * this.layers);
      if (fill) data.fill(fill);
      const tex = new THREE.DataArrayTexture(data, w, h, this.layers);
      tex.format = THREE.RGBAFormat;
      tex.type = THREE.UnsignedByteType;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      return { tex, w, h, data };
    };
    this.color = make(this.colorPPM);
    this.props = make(this.propsPPM);
    this.grime = make(this.grimePPM);
    return this;
  }

  /**
   * Copy a canvas covering one whole facade (width x PAINT_LAYER_H meters at the
   * target's ppm) into the layers it was packed into.
   * @param {'color'|'props'|'grime'} target
   */
  blitFacade(target, facadeId, canvas) {
    const e = this.entries.get(facadeId);
    if (!e) return;
    const T = this[target];
    const ppm = target === 'color' ? this.colorPPM : target === 'props' ? this.propsPPM : this.grimePPM;
    let src;
    if (canvas.data) src = canvas.data; // raw image {width,height,data}
    else src = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
    const sh = canvas.height;
    const sw = canvas.width;
    for (const p of e.parts) {
      const sx0 = Math.round(p.u0 * ppm);
      const sx1 = Math.min(sw, Math.round(p.u1 * ppm));
      const dx0 = Math.round((p.u0 + p.uOffset) * ppm);
      const layerOff = p.layer * T.w * T.h * 4;
      const rows = Math.min(sh, T.h);
      for (let y = 0; y < rows; y++) {
        const sRow = (y * sw + sx0) * 4;
        const dRow = layerOff + (y * T.w + dx0) * 4;
        const n = Math.min(sx1 - sx0, T.w - dx0);
        if (n <= 0) continue;
        T.data.set(src.subarray(sRow, sRow + n * 4), dRow);
      }
    }
    T.tex.needsUpdate = true;
  }

  /** Per-facade uniform: (layer, uOffset, vShift, 0) indexed by facade index. */
  facadeUniform(facades) {
    const arr = [];
    for (let i = 0; i < MAX_FACADES; i++) arr.push(new THREE.Vector4(-1, 0, 0, 0));
    facades.forEach((f, i) => {
      const e = this.entries.get(f.id);
      if (!e) return;
      // the shader maps u to a single layer; facades split over two layers use
      // the first one for u < 32 and the second for the rest via uOffset trick:
      // we encode the first part here and handle multi-part facades by giving
      // each part a separate facade index in the mesh (see world builder).
      const p = e.parts[0];
      arr[i].set(p.layer, p.uOffset, (f.base ?? 0) - e.v0, 0);
    });
    return arr;
  }
}
