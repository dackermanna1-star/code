// Measure how open each biome is: open-voxel fraction, how much of the open space has headroom for
// the player, and how wide the guaranteed route is. Usage: npx vite-node scripts/openness.mjs [seed]
import { WorldGenerator } from '../src/world/generator';
import { BIOMES, layerTopY, BIOME_HEIGHT } from '../src/world/biomes';
import { Rng } from '../src/core/rng';

const seed = Number(process.argv[2] ?? 1234);
const g = new WorldGenerator(seed);
const rng = new Rng(99);
for (let l = 0; l < BIOMES.length; l++) {
  const top = layerTopY(l);
  let open = 0, n = 0, roomy = 0, openN = 0;
  for (let i = 0; i < 6000; i++) {
    const x = rng.int(30, 225), z = rng.int(30, 225), y = top - rng.int(20, BIOME_HEIGHT - 20);
    n++;
    if (!g.isOpen(x, y, z)) continue;
    open++;
    // "roomy": open sphere of radius 8 around the point (room to fight in, not a crawlspace)
    let ok = 0;
    for (const [dx, dy, dz] of [[8, 0, 0], [-8, 0, 0], [0, 8, 0], [0, -8, 0], [0, 0, 8], [0, 0, -8], [6, 6, 0], [-6, 6, 0], [0, 6, 6], [0, 6, -6]]) if (g.isOpen(x + dx, y + dy, z + dz)) ok++;
    openN++;
    if (ok >= 9) roomy++;
  }
  // route width: mean distance to rock sideways from route centre points
  const pts = g.routePoints[l];
  let wsum = 0, hsum = 0, wn = 0;
  for (let i = 4; i < pts.length - 6; i += 3) {
    const p = pts[i];
    let w = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let d = 0;
      while (d < 60 && g.isOpen(Math.floor(p.x + dx * d), Math.floor(p.y), Math.floor(p.z + dz * d))) d++;
      w += d;
    }
    let h = 0;
    while (h < 80 && g.isOpen(Math.floor(p.x), Math.floor(p.y) + h, Math.floor(p.z))) h++;
    let dn = 0;
    while (dn < 80 && g.isOpen(Math.floor(p.x), Math.floor(p.y) - dn, Math.floor(p.z))) dn++;
    wsum += w / 2; hsum += h + dn; wn++;
  }
  console.log(`${BIOMES[l].display.padEnd(20)} open ${(100 * open / n).toFixed(0).padStart(3)}%  roomy ${(100 * roomy / Math.max(1, openN)).toFixed(0).padStart(3)}% of open  route width ~${(wsum / wn).toFixed(0)}  height ~${(hsum / wn).toFixed(0)}`);
}
