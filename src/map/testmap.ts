// Small test scene used while developing the renderer and physics.
import { World } from '../world/world';
import { Builder, m } from './builder';
import { P } from '../world/materials';
import { Ground } from '../world/terrain';
import { fbm2 } from '../engine/math';

export function generateTestMap(world: World): void {
  const t = world.terrain;
  const G = 40;
  // heightmap: flat yard with a hill in one corner
  for (let z = 0; z < world.sz; z++) for (let x = 0; x < world.sx; x++) {
    let h = G;
    const hx = x - world.sx * 0.8, hz = z - world.sz * 0.8;
    const d = Math.sqrt(hx * hx + hz * hz);
    if (d < 180) h += Math.round((1 - d / 180) ** 2 * 60 * fbm2(x * 0.01, z * 0.01, 3));
    t.height[x + z * world.sx] = h;
    let g = Ground.Asphalt;
    if (h > G + 2) g = Ground.Grass;
    else if (x < 120 || z < 120) g = Ground.Grass;
    else if ((x % 60) < 2 && z > 200 && z < 700) g = Ground.LineWhite;
    t.ground[x + z * world.sx] = g;
  }
  world.initTerrain();
  const b = new Builder(world);
  // brick building with windows
  const bx = 300, bz = 300;
  b.walls(bx, G, bz, bx + m(16), G + m(8), bz + m(10), 3, P.brick);
  b.box(bx, G + m(8), bz, bx + m(16), G + m(8) + 3, bz + m(10), P.concrete);
  b.box(bx + 3, G, bz + 3, bx + m(16) - 3, G + 2, bz + m(10) - 3, P.concreteFloor);
  for (let i = 0; i < 5; i++) {
    const wx = bx + 15 + i * 30;
    b.clear(wx, G + 12, bz, wx + 16, G + 40, bz + 3);
    b.box(wx, G + 12, bz + 1, wx + 16, G + 40, bz + 2, P.glass);
  }
  b.clear(bx + m(16) - 3, G, bz + 30, bx + m(16), G + 28, bz + 50);
  // concrete tower
  b.walls(560, G, 300, 620, G + 200, 360, 4, P.concrete);
  for (let y = G + 30; y < G + 200; y += 30) b.box(560, y, 300, 620, y + 3, 360, P.concreteMid);
  // corrugated shed
  b.walls(300, G, 520, 420, G + 50, 600, 1, P.galv);
  b.box(300, G + 50, 520, 420, G + 51, 600, P.sheetRust);
  // storage tank
  b.cylY(520, 560, 40, G, G + 90, P.paintWhite, 1, true);
  // wood crates
  for (let i = 0; i < 6; i++) b.box(250 + i * 14, G, 450, 260 + i * 14, G + 10, 460, P.crate);
  // tree
  b.cylY(200, 600, 2.5, G, G + 50, P.bark);
  b.sphere(200, G + 60, 600, 18, Builder.mix([[P.leaves, 0.4], [P.leaves + 1, 0.3], [P.leaves + 2, 0.3]]));
  // emissive lamp
  b.box(345, G + m(8) - 6, bz + 50, 355, G + m(8) - 5, bz + 52, P.lampWarm);
  // explosive barrels
  b.cylY(450, 460, 3, G, G + 9, P.fuelRed);
  // a container
  b.walls(650, G, 450, 650 + m(6), G + m(2.6), 450 + m(2.4), 1, P.contBlue);
  b.box(650, G + m(2.6), 450, 650 + m(6), G + m(2.6) + 1, 450 + m(2.4), P.contBlue);
}
