// Dirt trails into the woods (polylines). Planned before terrain (flat corridors), painted after.
import { SURFACE } from '../World.js';
import { B } from '../blocks.js';
import { OCC } from './plan.js';
import { RM } from './roads.js';

export const TRAILS = [
  { name: 'Ridge Trail', w: 1, pts: [[606, 92], [650, 88], [690, 70]] },
  { name: 'Hunters Trail', w: 1, pts: [[938, 640], [958, 632], [968, 614]] },
  { name: 'Mill Trail', w: 1, pts: [[84, 914], [72, 860], [62, 800], [56, 768]] },
  { name: 'Crash Trail', w: 1, pts: [[517, 150], [580, 156], [640, 150]] },
  { name: 'North Trail', w: 1, pts: [[432, 196], [426, 150], [422, 116]] },
  { name: 'Lakeshore Path', w: 1, pts: [[300, 236], [292, 270], [270, 300]] },
];

function raster(ctx, t, cb) {
  for (let i = 0; i < t.pts.length - 1; i++) {
    const [ax, az] = t.pts[i], [bx, bz] = t.pts[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const r = t.w + 0.6;
    for (let z = Math.floor(Math.min(az, bz) - r - 2); z <= Math.ceil(Math.max(az, bz) + r + 2); z++) {
      for (let x = Math.floor(Math.min(ax, bx) - r - 2); x <= Math.ceil(Math.max(ax, bx) + r + 2); x++) {
        if (x < 0 || z < 0 || x >= ctx.SX || z >= ctx.SZ) continue;
        let u = ((x - ax) * dx + (z - az) * dz) / L2;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const ex = x - (ax + dx * u), ez = z - (az + dz * u);
        cb(x, z, Math.sqrt(ex * ex + ez * ez), r);
      }
    }
  }
}

export function planTrails(ctx) {
  for (const t of TRAILS) {
    raster(ctx, t, (x, z, d, r) => {
      const k = z * ctx.SX + x;
      if (d <= r + 1.5) ctx.flat[k] = 1;
      if (d <= r && !ctx.occ[k]) ctx.occ[k] = OCC.ROAD;
    });
  }
}

export function paintTrails(ctx) {
  const { world } = ctx;
  for (const t of TRAILS) {
    raster(ctx, t, (x, z, d, r) => {
      const k = z * ctx.SX + x;
      if (d > r || ctx.water[k]) return;
      if (ctx.roadMask[k] && ctx.roadMask[k] !== RM.DIRT) return;
      const y = ctx.ground[k];
      if (y !== SURFACE) return;
      world.set(x, y, z, B.dirt_path);
      ctx.roadMask[k] = RM.DIRT;
    });
  }
}
