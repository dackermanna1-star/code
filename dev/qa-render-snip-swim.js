const { Player } = await import('/src/player/Player.js');
const { B, BLOCKS } = await import('/src/world/blocks.js');
const w = g.world, P = g.player;
P.flying = true;
// find shoreline east of the lake centre at z=188
let sx = 0, SZ = 188;
const isW = (x, y, z) => BLOCKS[w.get(x, y, z)].render === 'liquid';
outer: for (let z = 150; z < 240; z++) for (let x = 150; x < 300; x++) {
  if (isW(x, 18, z) && isW(x - 1, 18, z) && isW(x - 2, 18, z) && isW(x - 3, 18, z) && !isW(x + 1, 18, z) && BLOCKS[w.get(x + 1, 19, z)].solid && !w.get(x + 1, 20, z) && !w.get(x + 1, 21, z)) { sx = x + 1; SZ = z; break outer; }
}
const col = [];
for (let x = sx - 4; x <= sx + 2; x++) { let top = 0; for (let y = 40; y > 0; y--) if (w.get(x, y, SZ)) { top = y; break; } col.push(x + ':' + BLOCKS[w.get(x, top, SZ)].name + '@' + top); }
const ctx = { world: w, vehicles: null, carryFactor: 1 };
const run = (input, secs) => {
  P.x = sx - 3.5; P.y = 17.2; P.z = SZ + 0.5; P.vx = P.vy = P.vz = 0; P.yaw = -Math.PI / 2; P.onGround = false; P.crouching = false; P.h = 1.8; P.stamina = 100;
  const log = [];
  for (let i = 0; i < secs * 60; i++) {
    Player.prototype.updateMovement.call(P, 1 / 60, { fwd: 0, strafe: 0, jump: false, sprint: false, crouch: false, ...input }, ctx);
    if (i % 15 === 0) log.push(P.x.toFixed(1) + '/' + P.y.toFixed(2) + (P.inWater ? 'w' : ''));
  }
  return { end: [P.x.toFixed(2), P.y.toFixed(2)], inWater: P.inWater, log: log.join(' ') };
};
const R = { shore: sx, col, swimFwdJump: run({ fwd: 1, jump: true }, 5), swimFwd: run({ fwd: 1 }, 5), float: run({ jump: true }, 3) };
P.flying = false;
return R;
