// Prop catalog: name -> generator(rng, opts) => { model, parts?, meta }
// See src/props/README.md for conventions.
import { VoxelGrid, Palette, VoxelModel } from '../voxel/VoxelGrid.js';
import { MCLS } from '../render/voxelMaterial.js';
import { VS_FINE } from '../world/units.js';

/** Example: plastic milk crate (open top, slotted sides). */
function milkCrate(rng, opts = {}) {
  const vs = VS_FINE;
  const W = Math.round(0.33 / vs), D = Math.round(0.33 / vs), H = Math.round(0.28 / vs);
  const g = new VoxelGrid(W, H, D);
  const P = new Palette();
  const color = opts.color ?? rng.pick([[30, 64, 120], [140, 30, 28], [36, 36, 38], [190, 150, 40]]);
  const body = P.add('body', { color, rough: 0.55, cls: MCLS.PLASTIC, vari: 0.06 });
  const dirt = P.add('dirt', { color: color.map((c) => c * 0.6), rough: 0.8, cls: MCLS.PLASTIC, vari: 0.1 });
  // shell
  g.box(0, 0, 0, W, 2, D, body); // bottom
  for (let y = 2; y < H; y++) {
    const rim = y >= H - 3 || y < 4;
    for (let x = 0; x < W; x++)
      for (let z = 0; z < D; z++) {
        const edge = x < 2 || x >= W - 2 || z < 2 || z >= D - 2;
        if (!edge) continue;
        // slots in the side walls
        const along = x < 2 || x >= W - 2 ? z : x;
        const slot = !rim && along % 5 >= 3 && along > 3 && along < (x < 2 || x >= W - 2 ? D : W) - 4;
        if (!slot) g.set(x, y, z, y < 6 && rng.chance(0.3) ? dirt : body);
      }
  }
  const model = new VoxelModel(g, P, vs, [(-W * vs) / 2, 0, (-D * vs) / 2]);
  return { model, meta: { size: [W * vs, H * vs, D * vs], footprint: [W * vs, D * vs] } };
}

export const PROPS = {
  milkCrate,
};
