import * as THREE from 'three';

// =============================================================================
// Stand-in road-corridor field for the terrain (bus geography only).
//
// The road module (src/bus/road) owns the real road-field textures in
// geo.js GEO_UNIFORMS. While it is still a stub (app.road.stub) or when forced
// with ?module=env-roadtest, this builds equivalent textures on the CPU from
// app.route.index.field() so the terrain corridor (cuttings / embankments,
// flat formation under the road) can be validated:
//   coarse: whole route, 64 m texels; fine: 2 km x 2 km around the bus, 4 m
//   texels, re-centred when the bus is > 500 m from the window centre.
// Texels farther than ~460 m from the centreline keep d = 1e6 ("no road").
// =============================================================================

const NONE = 1e6;

export class RoadFieldTest {
  constructor(app, U) {
    this.app = app;
    this.U = U;
    this.route = app.route;
    const r = app.renderer;
    this.linear = !!r?.extensions?.has?.('OES_texture_float_linear');
    this._tmp = {};
    this._buildCoarse();
    this.fine = null;
    this.fineCenter = { x: NaN, z: NaN };
    this._updateFine(true);
    U.uRoadReady.value = 1;
    app.events.emit('road:field', { coarse: true, fine: true, source: 'env-test' });
  }

  _tex(data, w, h) {
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = this.linear ? THREE.LinearFilter : THREE.NearestFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }

  /** Fill the texels of rect (x0, z0, cell) within ~460 m of the route. */
  _fill(data, w, h, x0, z0, cell) {
    for (let i = 0; i < w * h; i++) { data[i * 4] = 0; data[i * 4 + 1] = NONE; data[i * 4 + 2] = 0; data[i * 4 + 3] = 0; }
    const R = this.route, idx = R.index;
    // mark candidate texels by stamping the route samples (every 8 m) with a 470 m radius
    const mark = new Uint8Array(w * h);
    const rad = Math.ceil(470 / cell);
    for (let i = 0; i < R.n; i += 4) {
      const cx = Math.floor((R.x[i] - x0) / cell), cz = Math.floor((R.z[i] - z0) / cell);
      if (cx < -rad || cz < -rad || cx >= w + rad || cz >= h + rad) continue;
      for (let dz = -rad; dz <= rad; dz++) {
        const z = cz + dz; if (z < 0 || z >= h) continue;
        const row = z * w;
        for (let dx = -rad; dx <= rad; dx++) {
          const x = cx + dx; if (x < 0 || x >= w) continue;
          if (dx * dx + dz * dz <= rad * rad) mark[row + x] = 1;
        }
      }
    }
    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        const k = z * w + x;
        if (!mark[k]) continue;
        const f = idx.field(x0 + (x + 0.5) * cell, z0 + (z + 0.5) * cell);
        if (!f) continue;
        data[k * 4] = f.ry; data[k * 4 + 1] = f.d; data[k * 4 + 2] = f.mode; data[k * 4 + 3] = f.halfW;
      }
    }
  }

  _buildCoarse() {
    const b = this.route.index.bounds, cell = 64, pad = 600;
    const x0 = Math.floor((b.xMin - pad) / cell) * cell, z0 = Math.floor((b.zMin - pad) / cell) * cell;
    const w = Math.ceil((b.xMax + pad - x0) / cell), h = Math.ceil((b.zMax + pad - z0) / cell);
    const data = new Float32Array(w * h * 4);
    this._fill(data, w, h, x0, z0, cell);
    this.coarse = this._tex(data, w, h);
    // texel centres sit at x0 + (i + 0.5) * cell: rect spans the texel edges
    this.U.uRoadCoarse.value = this.coarse;
    this.U.uRoadCoarseRect.value.set(x0, z0, 1 / (w * cell), 1 / (h * cell));
  }

  _updateFine(force = false) {
    const p = this.app.trip?.state?.position || this.app.flight?.state?.position;
    if (!p) return;
    if (!force && Math.hypot(p.x - this.fineCenter.x, p.z - this.fineCenter.z) < 500) return;
    const cell = 4, n = 512, half = n * cell / 2;
    const cx = Math.round(p.x / 64) * 64, cz = Math.round(p.z / 64) * 64;
    const x0 = cx - half, z0 = cz - half;
    const data = this.fine ? this.fine.image.data : new Float32Array(n * n * 4);
    this._fill(data, n, n, x0, z0, cell);
    if (!this.fine) this.fine = this._tex(data, n, n); else this.fine.needsUpdate = true;
    this.U.uRoadFine.value = this.fine;
    this.U.uRoadFineRect.value.set(x0, z0, 1 / (n * cell), 1 / (n * cell));
    this.fineCenter.x = cx; this.fineCenter.z = cz;
    if (!force) this.app.events.emit('road:field', { fine: true, source: 'env-test' });
  }

  update() { this._updateFine(false); }

  dispose() { this.coarse?.dispose(); this.fine?.dispose(); }
}
