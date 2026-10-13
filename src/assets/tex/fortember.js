// Fort Ember texture pack (zm_fort_ember). Owned by the map's builder: add the map's own
// textures here, prefixed fe_. Helpers: tex/core.js (noise, voronoi, shading), tex/stone.js
// (masonry), tex/shared.js (tinted, containerTex and the shared generators).
import { tinted, woodDark } from './shared.js';

export const PACK = {
  name: 'fortember',
  textures: {
    // placeholder: weathered palisade timber
    fe_palisade: { size: [128, 128], world: [128, 128], gen: tinted(woodDark, [1.2, 1.05, 0.9]) },
  },
};
