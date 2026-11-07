import * as THREE from 'three';

// =============================================================================
// Procedural textures generated at start-up (no downloads):
//   * noise: 512^2 RGBA8, four independent tileable gradient-noise octaves
//            (periods 8, 16, 32, 64 cells per tile) - fast macro variation.
//   * waves: 256^2 RGBA8 tileable ocean normal map from a directional
//            spectrum of periodic waves (RG = slope, B = height, A = crest/foam).
// Plus the downloaded CC0 ground textures (assets/textures/env-*).
// =============================================================================

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable 2D gradient noise sampled on an S x S grid with `cells` lattice cells per tile. */
function tileGradientNoise(S, cells, seed) {
  const rnd = mulberry32(seed);
  const gx = new Float32Array(cells * cells), gy = new Float32Array(cells * cells);
  for (let i = 0; i < cells * cells; i++) { const a = rnd() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const out = new Float32Array(S * S);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  for (let y = 0; y < S; y++) {
    const fy = (y + 0.5) / S * cells, iy = Math.floor(fy), ty = fy - iy;
    for (let x = 0; x < S; x++) {
      const fx = (x + 0.5) / S * cells, ix = Math.floor(fx), tx = fx - ix;
      const x0 = ix % cells, x1 = (ix + 1) % cells, y0 = iy % cells, y1 = (iy + 1) % cells;
      const d00 = gx[y0 * cells + x0] * tx + gy[y0 * cells + x0] * ty;
      const d10 = gx[y0 * cells + x1] * (tx - 1) + gy[y0 * cells + x1] * ty;
      const d01 = gx[y1 * cells + x0] * tx + gy[y1 * cells + x0] * (ty - 1);
      const d11 = gx[y1 * cells + x1] * (tx - 1) + gy[y1 * cells + x1] * (ty - 1);
      const u = fade(tx), v = fade(ty);
      const a = d00 + (d10 - d00) * u, b = d01 + (d11 - d01) * u;
      out[y * S + x] = a + (b - a) * v;
    }
  }
  return out;
}

export function createNoiseTexture(S = 512) {
  const chans = [
    [tileGradientNoise(S, 8, 11), tileGradientNoise(S, 16, 12)],
    [tileGradientNoise(S, 16, 21), tileGradientNoise(S, 32, 22)],
    [tileGradientNoise(S, 32, 31), tileGradientNoise(S, 64, 32)],
    [tileGradientNoise(S, 64, 41), tileGradientNoise(S, 128, 42)],
  ];
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    for (let c = 0; c < 4; c++) {
      const v = chans[c][0][i] * 0.72 + chans[c][1][i] * 0.36;   // ~[-1,1]
      data[i * 4 + c] = Math.max(0, Math.min(255, Math.round((v * 0.5 + 0.5) * 255)));
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  t.name = 'env.noise';
  t.needsUpdate = true;
  return t;
}

/** Tileable wind-wave normal map (directional spectrum of periodic sinusoids). */
export function createWaveTexture(S = 256) {
  const rnd = mulberry32(777);
  const waves = [];
  // integer wave numbers keep the tile periodic
  for (let i = 0; i < 70; i++) {
    const k = 2 + Math.floor(Math.pow(rnd(), 1.6) * 34);
    const ang = (rnd() - 0.5) * 2.2 + (rnd() < 0.15 ? Math.PI : 0);   // mostly down-wind
    const kx = Math.round(Math.cos(ang) * k), ky = Math.round(Math.sin(ang) * k);
    if (kx === 0 && ky === 0) continue;
    const kk = Math.hypot(kx, ky);
    const amp = Math.pow(kk, -1.55) * (0.6 + 0.8 * rnd());
    waves.push({ kx, ky, amp, ph: rnd() * Math.PI * 2 });
  }
  const H = new Float32Array(S * S), DX = new Float32Array(S * S), DY = new Float32Array(S * S);
  let maxS = 0, minH = Infinity, maxH = -Infinity;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S * Math.PI * 2, v = y / S * Math.PI * 2;
      let h = 0, dx = 0, dy = 0;
      for (const w of waves) {
        const a = w.kx * u + w.ky * v + w.ph;
        // slightly peaked crests (Gerstner-like)
        const s = Math.sin(a), c = Math.cos(a);
        h += w.amp * (s + 0.18 * (1 - c * c));
        dx += w.amp * w.kx * (c + 0.36 * s * c);
        dy += w.amp * w.ky * (c + 0.36 * s * c);
      }
      const i = y * S + x;
      H[i] = h; DX[i] = dx; DY[i] = dy;
      maxS = Math.max(maxS, Math.abs(dx), Math.abs(dy));
      minH = Math.min(minH, h); maxH = Math.max(maxH, h);
    }
  }
  const data = new Uint8Array(S * S * 4);
  const sc = 1 / maxS;
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = Math.round((DX[i] * sc * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round((DY[i] * sc * 0.5 + 0.5) * 255);
    const hn = (H[i] - minH) / (maxH - minH);
    data[i * 4 + 2] = Math.round(hn * 255);
    data[i * 4 + 3] = Math.round(Math.pow(Math.max(0, hn - 0.62) / 0.38, 1.5) * 255);
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  t.name = 'env.waves';
  t.needsUpdate = true;
  return t;
}

/** Ground texture sets (CC0, see assets/credits/environment.md). Missing files fall back to flat grey/blue. */
export function loadGroundTextures(app) {
  const A = app.assets;
  const base = 'assets/textures';
  const col = (name) => A.texture(`${base}/${name}/color.jpg`, { srgb: true, fallbackColor: '#7a7a6a' });
  const nrm = (name) => A.texture(`${base}/${name}/normal.jpg`, { srgb: false, fallbackColor: '#8080ff' });
  return {
    grass: col('env-grass'), grassN: nrm('env-grass'),
    dirt: col('env-dirt'), dirtN: nrm('env-dirt'),
    rock: col('env-rock'), rockN: nrm('env-rock'),
    sand: col('env-sand'),
    meadow: col('env-meadow'),
  };
}
