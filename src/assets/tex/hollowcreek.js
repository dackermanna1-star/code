// Hollow Creek texture pack (zm_hollow_creek). Owned by the map's builder: add the map's own
// textures here, prefixed hc_. Helpers: tex/core.js (noise, voronoi, shading), tex/stone.js
// (masonry), tex/shared.js (tinted, containerTex and the shared generators).
import { tinted, sidingPaint } from './shared.js';

export const PACK = {
  name: 'hollowcreek',
  textures: {
    // placeholder: blue-painted clapboard
    hc_siding_blue: { size: [128, 128], world: [128, 128], gen: tinted(sidingPaint, [0.72, 0.86, 1.0]) },
  },
};
