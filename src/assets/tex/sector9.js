// Sector 9 texture pack (zm_sector9). Owned by the map's builder: add the map's own
// textures here, prefixed s9_. Helpers: tex/core.js (noise, voronoi, shading), tex/stone.js
// (masonry), tex/shared.js (tinted, containerTex and the shared generators).
import { tinted, labPanel } from './shared.js';

export const PACK = {
  name: 'sector9',
  textures: {
    // placeholder: a darker, cooler lab panel
    s9_panel_dark: { size: [128, 128], world: [128, 128], gen: tinted(labPanel, [0.6, 0.66, 0.72]) },
  },
};
