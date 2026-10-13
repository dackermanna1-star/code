// Blackwater Docks texture pack (zm_blackwater). Owned by the map's builder: add the map's own
// textures here, prefixed bw_. Helpers: tex/core.js (noise, voronoi, shading), tex/stone.js
// (masonry), tex/shared.js (tinted, containerTex and the shared generators).
import { containerTex } from './shared.js';

export const PACK = {
  name: 'blackwater',
  textures: {
    // placeholder: a teal container side
    bw_container_teal: { size: [128, 128], world: [128, 128], gen: () => containerTex([52, 110, 108], 7101) },
  },
};
