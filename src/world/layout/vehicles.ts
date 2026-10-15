// Vehicle spawn points: parked beside roads in towns/farms/roadsides (land) and moored on the coast/river (water).
import type { LayoutBuilder } from './LayoutBuilder';
import type { BridgeDef } from './types';

/** Land spawn hints (snapped to the nearest road shoulder) with preferred vehicles. */
const LAND_HINTS: [number, number, string[]?][] = [
  // Volodino
  [1300, 1400], [1460, 1405, ['vehicle_dacia']], [1380, 1290], [1380, 1530, ['vehicle_dacia']], [1222, 1460],
  // Zalivsk
  [500, 500, ['vehicle_dacia']], [380, 560], [560, 690, ['vehicle_uaz']], [500, 330],
  // School
  [1545, 960, ['vehicle_dacia']], [1700, 830], [1540, 1050],
  // Military
  [1600, 2702, ['vehicle_uaz']], [1700, 2702, ['vehicle_uaz']], [1652, 2620, ['vehicle_uaz']], [1655, 2800, ['vehicle_buggy']],
  [2100, 2860, ['vehicle_motorcycle']],
  // Power plant
  [2650, 1420, ['vehicle_uaz']], [2770, 1462], [2600, 1600],
  // Prison
  [2430, 690, ['vehicle_uaz']], [2600, 800],
  // Villages
  [1250, 400], [1185, 305, ['vehicle_motorcycle']], [590, 2030], [470, 2110, ['vehicle_buggy']], [1700, 2160], [1820, 2085],
  // Quarry, ruins, radio tower
  [560, 1395, ['vehicle_uaz']], [785, 1220, ['vehicle_buggy']], [1990, 1430, ['vehicle_motorcycle']],
  // Farms / countryside
  [1800, 560, ['vehicle_pickup', 'vehicle_uaz']], [2450, 1880, ['vehicle_pickup']], [720, 1760, ['vehicle_buggy']],
  [1450, 2230], [2300, 950, ['vehicle_motorcycle']], [880, 600],
  // Roadside
  [1000, 590], [2000, 1560], [1520, 1820, ['vehicle_motorcycle']], [2300, 2120], [1700, 320],
];

/** Water spawn points (boats). */
const WATER: [number, number, number][] = [
  [285, 735, 2.0],
  [345, 770, 2.3],
  [920, 1110, 0.9],
  [1225, 1860, 0.6],
  [790, 2690, 1.6],
  [385, 2215, 0.8],
  [3000, 1460, -1.5],
  [1600, 2432, 1.57],
  [2660, 175, 0.2],
];

export function addVehicleSpawns(b: LayoutBuilder, bridges: BridgeDef[]): void {
  for (const [hx, hz, prefer] of LAND_HINTS) {
    // nearest road sample
    let best = Infinity, bx = hx, bz = hz, btx = 1, btz = 0, bw = 6;
    for (const r of b.roads) {
      const p = r.points;
      for (let i = 0; i < p.length - 1; i++) {
        const d = Math.hypot(p[i].x - hx, p[i].z - hz);
        if (d < best) {
          best = d;
          bx = p[i].x;
          bz = p[i].z;
          const L = Math.hypot(p[i + 1].x - p[i].x, p[i + 1].z - p[i].z) || 1;
          btx = (p[i + 1].x - p[i].x) / L;
          btz = (p[i + 1].z - p[i].z) / L;
          bw = r.width;
        }
      }
    }
    if (best > 60) continue;
    // try both shoulders, sliding along the road if the first spot is blocked
    search: for (const shift of [0, 8, -8, 16, -16, 26, -26]) {
      for (const side of [1, -1]) {
        const off = (bw / 2 + 2.4) * side;
        const x = bx + btx * shift - btz * off, z = bz + btz * shift + btx * off;
        let nearBridge = false;
        for (const br of bridges) if (Math.hypot(x - (br.a.x + br.b.x) / 2, z - (br.a.z + br.b.z) / 2) < Math.hypot(br.b.x - br.a.x, br.b.z - br.a.z) / 2 + 25) nearBridge = true;
        if (nearBridge) continue;
        if (b.roadClearance(x, z) < 0.6) continue; // a crossing street right there
        if (b.overlapsLots({ x, z, hw: 2.6, hd: 2.6, rot: 0 }, 0.5)) continue;
        if (b.overlapsProps(x, z, 2.6)) continue; // fences, poles, wrecks, hay bales...
        if (b.riverClearance(x, z) < 6 || b.coastDistance(x, z) < 8) continue;
        b.vehicle(x, z, Math.atan2(btx, btz) + (b.rng.chance(0.5) ? Math.PI : 0), 'land', prefer);
        break search;
      }
    }
  }
  for (const [x, z, r] of WATER) b.vehicle(x, z, r, 'water', ['vehicle_boat']);
}
