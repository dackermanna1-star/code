// Texture-set resolution from public/assets/textures/manifest.json (several plausible manifest shapes).
import { describe, expect, it } from 'vitest';
import { LAYER_KEYWORDS, pickSet, setIdsFromManifest } from '../src/world/terrain/TerrainTextures';

describe('terrain texture manifest resolution', () => {
  it('reads ids from array, {sets:[]} and keyed-object manifests', () => {
    expect(setIdsFromManifest([{ id: 'grass_green' }, { id: 'rock_cliff' }])).toEqual(['grass_green', 'rock_cliff']);
    expect(setIdsFromManifest({ sets: [{ id: 'sand_beach' }] })).toEqual(['sand_beach']);
    expect(setIdsFromManifest({ textures: [{ id: 'asphalt' }, { id: 'mud_wet' }] })).toEqual(['asphalt', 'mud_wet']);
    expect(setIdsFromManifest({ grass_dry: { albedo: 'albedo.jpg' }, gravel_01: { albedo: 'albedo.jpg' } }).sort()).toEqual(['grass_dry', 'gravel_01']);
  });

  it('maps sets to terrain layers by keyword, honouring exclusions', () => {
    const ids = ['grass_dry', 'grass_green', 'forest_floor_pine', 'dirt_path', 'soil_plowed', 'mud', 'rock_cliff', 'beach_sand', 'gravel'];
    const picks = LAYER_KEYWORDS.map((k) => pickSet(ids, k));
    expect(picks).toEqual(['grass_green', 'grass_dry', 'forest_floor_pine', 'dirt_path', 'mud', 'rock_cliff', 'beach_sand', 'gravel', 'soil_plowed']);
    expect(pickSet(['grass_dry'], LAYER_KEYWORDS[0])).toBeNull(); // dry grass is not used as lush grass
  });
});
