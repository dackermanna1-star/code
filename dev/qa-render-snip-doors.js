const { Player } = await import('/src/player/Player.js');
const { B } = await import('/src/world/blocks.js');
const w = g.world, P = g.player;
P.flying = true;
const Y = 44, Z0 = 40, X0 = 600;
const clear = () => { for (let x = X0 - 2; x < X0 + 20; x++) for (let z = Z0 - 6; z <= Z0 + 6; z++) for (let y = Y - 2; y < Y + 4; y++) { w.set(x, y, z, 0); w.setMeta(x, y, z, 0); } for (let x = X0 - 2; x < X0 + 20; x++) for (let z = Z0 - 6; z <= Z0 + 6; z++) w.set(x, Y - 1, z, B.stone); };
const ctx = { world: w, vehicles: null, carryFactor: 1 };
const sim = (x, z, yaw, input, secs) => {
  P.x = x; P.y = Y; P.z = z; P.vx = P.vy = P.vz = 0; P.yaw = yaw; P.onGround = true; P.crouching = false; P.h = 1.8; P.stamina = 100;
  for (let i = 0; i < secs * 60; i++) Player.prototype.updateMovement.call(P, 1 / 60, { fwd: 0, strafe: 0, jump: false, sprint: false, crouch: false, ...input }, ctx);
  return [+P.x.toFixed(2), +P.z.toFixed(2)];
};
const R = {};
// wall along x = X0+5 with a 1-wide gap at z = Z0 holding a door (open / closed)
for (const [label, open] of [['doorOpen', true], ['doorClosed', false]]) {
  clear();
  for (let z = Z0 - 6; z <= Z0 + 6; z++) if (z !== Z0) { w.set(X0 + 5, Y, z, B.stone); w.set(X0 + 5, Y + 1, z, B.stone); w.set(X0 + 5, Y + 2, z, B.stone); }
  w.set(X0 + 5, Y + 2, Z0, B.stone);
  w.place(X0 + 5, Y, Z0, 'door_wood', 1, open ? 4 : 0);
  w.place(X0 + 5, Y + 1, Z0, 'door_wood', 1, (open ? 4 : 0) | 8);
  // straight, and coming in at an angle from 1 block to the side
  R[label + 'Straight'] = sim(X0 + 1.5, Z0 + 0.5, -Math.PI / 2, { fwd: 1 }, 3);
  R[label + 'Angled'] = sim(X0 + 1.5, Z0 + 1.6, -Math.PI / 2 + 0.35, { fwd: 1 }, 3);
  R[label + 'SprintAngled'] = sim(X0 + 1.5, Z0 - 1.2, -Math.PI / 2 - 0.4, { fwd: 1, sprint: true }, 3);
}
// fence line: walk along it pressed against it (strafe into it)
clear();
for (let x = X0; x < X0 + 18; x++) w.set(x, Y, Z0 + 2, B.fence_wood ?? B.fence_picket ?? B.fence_post);
R.fenceSlide = sim(X0 + 0.5, Z0 + 1.5, -Math.PI / 2, { fwd: 1, strafe: 1 }, 3);
// inside corner: walk diagonally into it
clear();
for (let x = X0; x < X0 + 8; x++) { w.set(x, Y, Z0 + 4, B.stone); w.set(x, Y + 1, Z0 + 4, B.stone); }
for (let z = Z0 - 4; z <= Z0 + 4; z++) { w.set(X0 + 8, Y, z, B.stone); w.set(X0 + 8, Y + 1, z, B.stone); }
R.corner = sim(X0 + 4.5, Z0 + 0.5, -Math.PI / 2 - 0.78, { fwd: 1 }, 3);
R.cornerThenBack = sim(R.corner[0], R.corner[1], Math.PI / 2 + 0.78, { fwd: 1 }, 1);
clear();
for (let x = X0 - 2; x < X0 + 20; x++) for (let z = Z0 - 6; z <= Z0 + 6; z++) w.set(x, Y - 1, z, 0);
P.flying = false;
const names = { fence: B.fence_wood, picket: B.fence_picket, post: B.fence_post };
return { R, names };
