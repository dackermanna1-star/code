// Small test level used to validate the engine (not part of the game).
import { MapDSL } from './mapdsl.js';

export function buildTestMap() {
  const m = new MapDSL();
  m.floor(-1024, -1024, 1024, 1024, 0, 'ground_sand');
  m.block(-1024, -1056, 1024, -1024, 0, 256);
  m.block(-1024, 1024, 1024, 1056, 0, 256);
  m.block(-1056, -1024, -1024, 1024, 0, 256);
  m.block(1024, -1024, 1056, 1024, 0, 256);
  // building with arch
  m.archWall('x', -400, 400, 200, 232, 0, 256, { c: 0, w: 128, zs: 96 });
  m.block(-400, 232, -368, 600, 0, 256);
  m.block(368, 232, 400, 600, 0, 256);
  m.block(-400, 232, 400, 600, 256, 272, { all: 'wall_stone', bottom: 'wood_planks' });
  m.ramp(500, -300, 700, 0, 0, 96, 'n');
  m.floor(500, 0, 700, 300, 96, 'ground_stone');
  m.stairs(-700, -300, -500, -100, 0, 96, 'n', 8);
  m.floor(-700, -100, -500, 200, 96, 'ground_stone');
  m.crate(-100, -200, 0, 64);
  m.crate(-30, -200, 0, 64, 64, 64, 'crate_b');
  m.crate(-70, -200, 64, 48);
  m.block(-300, -500, 300, -470, 0, 48, { all: 'wall_stone', top: 'trim_band' });
  return m;
}
