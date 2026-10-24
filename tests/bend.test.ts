// Blast next to a sheet-metal wall: the sheet must bulge away from the blast and stay connected
// (no confetti of single detached voxels).
import { World } from '../src/world/world';
import { Game } from '../src/game/game';
import { Destruction } from '../src/game/destruction';
import { P, PAL_MAT, Mat } from '../src/world/materials';
const world = new World(256, 128, 256, 48);
world.initTerrain(() => 48, () => 0);
// steel frame posts and a 1-voxel sheet wall at z = 130 (x 60..200, y 48..100)
for (let y = 48; y < 100; y++) for (let x = 60; x < 200; x++) world.set(x, y, 130, P.sheetBlue);
for (const px of [60, 100, 140, 180]) for (let y = 48; y < 104; y++) for (let x = px; x < px + 3; x++) for (let z = 131; z < 134; z++) world.set(x, y, z, P.steel);
const game = new Game(null, world, {} as any, 0);
const d = new Destruction(game);
game.destruction = d;
const before = new Map<number, number>();
let sheetBefore = 0;
world.forEachSolid(0, 48, 100, 255, 127, 160, (x, y, z, v) => { if (PAL_MAT[v] === Mat.Metal && v !== P.steel) sheetBefore++; });
d.explode(12.0, 7.0, 12.4, 2.5);   // 60 cm in front of the wall (blast side z < 13)
for (let i = 0; i < 120; i++) game.step(1 / 60);
let behind = 0, sheetAfter = 0, maxZ = 0;
world.forEachSolid(0, 48, 100, 255, 127, 160, (x, y, z, v) => {
  if (PAL_MAT[v] !== Mat.Metal || v === P.steel) return;
  sheetAfter++;
  if (z > 130) { behind++; maxZ = Math.max(maxZ, z); }
});
const debrisBodies = game.physics.bodies.length;
console.log(`sheet voxels ${sheetBefore} -> ${sheetAfter}, pushed behind the wall plane: ${behind} (max ${maxZ - 130} voxels), bodies ${debrisBodies}, detached ${game.stats.detached}`);
console.log(behind > 50 && maxZ - 130 >= 2 && game.stats.detached < 40 ? 'PASS sheet bulged and stayed attached' : 'FAIL');
void before;
