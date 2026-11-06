import { World, SURFACE } from '../src/world/World.js';
import { B } from '../src/world/blocks.js';
import { findPath, standable } from '../src/entities/pathfind.js';
import { moveBody } from '../src/core/physics.js';

const w = new World(64, 64, 64);
w.fill(0, 0, 0, 63, SURFACE, 63, B.stone);
// room with walls, door on south side
w.walls(20, SURFACE + 1, 20, 30, SURFACE + 3, 30, B.brick_red);
w.placeDoor(25, SURFACE + 1, 30, 0, 'door_wood');
// stairs up to a platform inside
for (let i = 0; i < 4; i++) w.place(22 + i, SURFACE + 1 + i, 24, 'stairs_wood', 1); // facing -X (west): climbed walking east (+X)
w.fill(26, SURFACE + 1, 22, 29, SURFACE + 4, 27, B.planks_oak);
w.computeHeightmap();
const S = SURFACE + 1;
console.log('standable outside', standable(w, 25, S, 35), 'door cell', standable(w, 25, S, 30), 'inside', standable(w, 25, S, 25));
let p = findPath(w, 25, S, 40, 24, S, 25);
console.log('path through door:', p && p.length, p && p.filter((n) => n.bash).length, 'bash nodes');
w.getDoor(25, S, 30).open = true; w.syncDoor(w.getDoor(25, S, 30));
p = findPath(w, 25, S, 40, 24, S, 25);
console.log('path open door:', p && p.length, p && p.filter((n) => n.bash).length, 'bash nodes');
p = findPath(w, 21, S, 24, 28, S + 4, 25);
console.log('path up stairs:', p && p.map((n) => `${n.x - 0.5},${n.y},${n.z - 0.5}`).join(' '));
// physics: walk up the stairs
const b = { x: 21.5, y: S, z: 24.5, vx: 4, vy: 0, vz: 0, hw: 0.3, h: 1.8, onGround: true, stepHeight: 0.55 };
for (let i = 0; i < 120; i++) { b.vx = 4; b.vy -= 27 / 60; moveBody(w, b, 1 / 60); }
console.log('after stairs walk', b.x.toFixed(2), b.y.toFixed(2), b.z.toFixed(2));
// physics: walk into wall
const c = { x: 25.5, y: S, z: 35.5, vx: 0, vy: 0, vz: -4, hw: 0.3, h: 1.8, onGround: true };
w.getDoor(25, S, 30).open = false; w.syncDoor(w.getDoor(25, S, 30));
for (let i = 0; i < 120; i++) { c.vz = -4; c.vy -= 27 / 60; moveBody(w, c, 1 / 60); }
console.log('blocked by closed door at z', c.z.toFixed(2));
