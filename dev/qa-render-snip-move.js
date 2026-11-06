// deterministic movement tests on a floating test course (raw world edits, physics only)
const { Player } = await import('/src/player/Player.js');
const { B, BLOCKS } = await import('/src/world/blocks.js');
const w = g.world, P = g.player;
P.flying = true; // freeze the game's own movement while we simulate
const Y = 44, Z0 = 40, X0 = 600;
const clear = () => { for (let x = X0 - 2; x < X0 + 40; x++) for (let z = Z0 - 3; z <= Z0 + 3; z++) for (let y = Y - 12; y < Y + 6; y++) { w.set(x, y, z, 0); w.setMeta(x, y, z, 0); } };
clear();
const floor = (x0, x1, y = Y - 1) => { for (let x = x0; x <= x1; x++) for (let z = Z0 - 3; z <= Z0 + 3; z++) w.set(x, y, z, B.stone || 1); };
const ctx = { world: w, vehicles: null, carryFactor: 1, dt: 1 / 60 };
const sim = (x, y, z, yaw, input, secs, log) => {
  const p = P;
  p.x = x; p.y = y; p.z = z; p.vx = p.vy = p.vz = 0; p.yaw = yaw; p.onGround = true; p.fallStartY = null; p.crouching = false; p.h = 1.8; p.stamina = 100;
  const evs = [];
  let maxY = y;
  const n = Math.round(secs * 60);
  for (let i = 0; i < n; i++) {
    const inp = typeof input === 'function' ? input(i, p) : input;
    const ev = Player.prototype.updateMovement.call(p, 1 / 60, { fwd: 0, strafe: 0, jump: false, sprint: false, crouch: false, ...inp }, ctx);
    if (ev.landed) evs.push('landed:' + ev.landed.toFixed(2));
    maxY = Math.max(maxY, p.y);
    if (log && i % 10 === 0) log.push([+(p.x).toFixed(2), +(p.y).toFixed(2)]);
  }
  return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), maxY: +maxY.toFixed(2), ground: p.onGround, evs };
};
const R = {};
const E = -Math.PI / 2; // yaw facing +X
// A: slab step
floor(X0, X0 + 12); w.set(X0 + 4, Y, Z0, B.slab_wood); for (let z = Z0 - 3; z <= Z0 + 3; z++) w.set(X0 + 4, Y, z, B.slab_wood);
for (let x = X0 + 5; x <= X0 + 12; x++) for (let z = Z0 - 3; z <= Z0 + 3; z++) w.set(x, Y, z, B.slab_wood);
R.slab = sim(X0 + 1.5, Y, Z0 + 0.5, E, { fwd: 1 }, 2.5);
clear();
// B: stairs (facing 1 = west: climbed walking east), two steps then a landing
floor(X0, X0 + 12);
for (let z = Z0 - 3; z <= Z0 + 3; z++) { w.place(X0 + 4, Y, z, 'stairs_wood', 1); w.set(X0 + 5, Y, z, B.stone); w.place(X0 + 5, Y + 1, z, 'stairs_wood', 1); for (let x = X0 + 6; x <= X0 + 12; x++) { w.set(x, Y, z, B.stone); w.set(x, Y + 1, z, B.stone); } }
R.stairsWalk = sim(X0 + 1.5, Y, Z0 + 0.5, E, { fwd: 1 }, 3);
R.stairsSprint = sim(X0 + 1.5, Y, Z0 + 0.5, E, { fwd: 1, sprint: true }, 3);
R.stairsDown = sim(X0 + 10.5, Y + 2, Z0 + 0.5, Math.PI / 2, { fwd: 1 }, 3);
clear();
// C: full block, no jump vs jump
floor(X0, X0 + 12);
for (let z = Z0 - 3; z <= Z0 + 3; z++) for (let x = X0 + 4; x <= X0 + 12; x++) w.set(x, Y, z, B.stone);
R.blockNoJump = sim(X0 + 1.5, Y, Z0 + 0.5, E, { fwd: 1 }, 2);
R.blockJump = sim(X0 + 1.5, Y, Z0 + 0.5, E, (i) => ({ fwd: 1, jump: i > 20 && i < 40 }), 2.5);
R.blockJumpSprint = sim(X0 + 1.5, Y, Z0 + 0.5, E, (i) => ({ fwd: 1, sprint: true, jump: i > 10 && i < 30 }), 2.5);
clear();
// D: jump height & 2-block wall
floor(X0, X0 + 12);
for (let z = Z0 - 3; z <= Z0 + 3; z++) { w.set(X0 + 4, Y, z, B.stone); w.set(X0 + 4, Y + 1, z, B.stone); }
R.jumpPeak = sim(X0 + 1.5, Y, Z0 + 0.5, E, (i) => ({ jump: i === 2 }), 1.5);
R.wall2 = sim(X0 + 1.5, Y, Z0 + 0.5, E, (i) => ({ fwd: 1, jump: true }), 2.5);
clear();
// E: crouch at a ledge (Minecraft: sneaking never walks off an edge)
floor(X0, X0 + 4, Y - 1);
R.crouchEdge = sim(X0 + 1.5, Y, Z0 + 0.5, E, { fwd: 1, crouch: true }, 3);
R.crouchEdgeDiag = sim(X0 + 1.5, Y, Z0 + 0.5, E + 0.6, { fwd: 1, crouch: true }, 3);
R.walkEdge = sim(X0 + 1.5, Y, Z0 + 0.5, E, { fwd: 1 }, 1.2);
clear();
// F: falls
for (const h of [3, 4, 6, 10]) {
  floor(X0, X0 + 6, Y - 1 - h);
  R['fall' + h] = sim(X0 + 2.5, Y, Z0 + 0.5, E, {}, 2.5);
  clear();
}
// G: ladder: 6 high ladder against a wall, climb and hold
floor(X0, X0 + 8);
for (let y = Y; y < Y + 6; y++) { w.set(X0 + 4, y, Z0, B.stone); w.place(X0 + 3, y, Z0, 'ladder', 1); }
R.ladderClimb = sim(X0 + 3.5, Y, Z0 + 0.5, E, { fwd: 1 }, 2);
R.ladderHold = sim(X0 + 3.5, Y + 2, Z0 + 0.5, E, {}, 1);
R.ladderDown = sim(X0 + 3.5, Y + 4, Z0 + 0.5, E, { crouch: true }, 1);
clear();
P.flying = false;
return R;
