// The Stacking Maze: bare windowless corridors where towering columns of nested folding chairs
// stand at every turn and dead end, trembling very slightly. A low drone; dim, failing tubes.
import { defineZone } from '../zonetypes.js';
import { W, M, env, floorDecal } from '../gen/common.js';
import { key } from './util.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function params(zone, rng) {
  const p = {
    wallMat: rng.weighted([[M.cmu, 3], [M.concrete, 2], [M.paint_dirty, 2], [M.drywall_raw, 1.5]]),
    floorMat: rng.weighted([[M.concrete_floor, 4], [M.lino_vct, 1], [M.concrete_dark, 1]]),
    ceilMat: rng.weighted([[M.concrete, 3], [M.ceil_tile_old, 1]]),
    ceilH: rng.pick([3.6, 3.8, 4.0]),
    cell: 3,
    ambient: [0.165, 0.165, 0.17],
  };
  p.env = env({ fog: [0.085, 0.085, 0.09], fogNear: 3, fogFar: 24, hum: 0.3, hvac: 0.15, reverb: 'corridor', tone: 'dark' });
  return p;
}

function gen(zb) {
  const p = zb.params, r = zb.rng;
  const { x0, z0, x1, z1 } = zb;
  const S = p.cell;
  const ni = Math.floor(zb.w / S), nj = Math.floor(zb.d / S);
  // maze node (i, j) covers cells [cx(i), cx(i+1)) - the last row/column absorbs any remainder
  const cx = (i) => (i >= ni ? x1 : x0 + i * S), cz = (j) => (j >= nj ? z1 : z0 + j * S);
  const wm = p.wallMat;

  // passages: open[i][j] bit 1 east, 2 south
  const open = new Uint8Array(ni * nj);
  const seen = new Uint8Array(ni * nj);
  const stack = [[r.int(0, ni - 1), r.int(0, nj - 1)]];
  seen[stack[0][1] * ni + stack[0][0]] = 1;
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const opts = DIRS.filter(([dx, dz]) => { const a = i + dx, b = j + dz; return a >= 0 && b >= 0 && a < ni && b < nj && !seen[b * ni + a]; });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dz] = r.pick(opts);
    const a = i + dx, b = j + dz;
    if (dx === 1) open[j * ni + i] |= 1; else if (dx === -1) open[j * ni + a] |= 1;
    else if (dz === 1) open[j * ni + i] |= 2; else open[b * ni + i] |= 2;
    seen[b * ni + a] = 1;
    stack.push([a, b]);
  }
  // a few loops so it is a place, not a puzzle
  for (let k = 0; k < ni * nj * 0.12; k++) {
    const i = r.int(0, ni - 2), j = r.int(0, nj - 2);
    open[j * ni + i] |= r.chance(0.5) ? 1 : 2;
  }
  const isOpen = (i, j, dx, dz) => {
    const a = i + dx, b = j + dz;
    if (a < 0 || b < 0 || a >= ni || b >= nj) return false;
    if (dx === 1) return (open[j * ni + i] & 1) !== 0;
    if (dx === -1) return (open[j * ni + a] & 1) !== 0;
    if (dz === 1) return (open[j * ni + i] & 2) !== 0;
    return (open[b * ni + i] & 2) !== 0;
  };
  // walls between nodes
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
    if (i + 1 < ni && !isOpen(i, j, 1, 0)) zb.vLine(cx(i + 1), cz(j), cz(j + 1), W.WALL, wm, wm);
    if (j + 1 < nj && !isOpen(i, j, 0, 1)) zb.hLine(cz(j + 1), cx(i), cx(i + 1), W.WALL, wm, wm);
  }

  // gates count as openings; the cells just inside them stay clear
  const keep = new Set();
  const gateDir = new Map();
  for (const g of zb.gates) {
    for (let k = 0; k < 2; k++) keep.add(key(g.x + g.dx * k, g.z + g.dz * k));
    const i = Math.min(ni - 1, Math.floor((g.x - x0) / S)), j = Math.min(nj - 1, Math.floor((g.z - z0) / S));
    const ent = gateDir.get(j * ni + i) || [];
    ent.push([-g.dx, -g.dz]);
    gateDir.set(j * ni + i, ent);
  }

  const place = (x, z, n) => {
    if (keep.has(key(Math.floor(x), Math.floor(z)))) return;
    zb.prop('c_stack', x, 0, z, r.range(0, Math.PI * 2), { n, tint: tints[r.int(0, tints.length - 1)] });
  };
  // up to 48 chairs (4.2 m): taller columns would poke into whatever the level above has sunk
  const tallN = () => r.int(25, 48);
  // most columns are grey steel, some beige or brown enamel
  const tints = [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1.08, 1.0, 0.84], [0.92, 0.8, 0.68]];

  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
    const ax = cx(i), az = cz(j), bx = cx(i + 1), bz = cz(j + 1);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, hx = (bx - ax) / 2, hz = (bz - az) / 2;
    const exits = DIRS.filter(([dx, dz]) => isOpen(i, j, dx, dz));
    for (const g of gateDir.get(j * ni + i) || []) if (!exits.some((e) => e[0] === g[0] && e[1] === g[1])) exits.push(g);
    const inset = 0.42;
    if (exits.length === 1) {
      // dead end: the far end is filled with columns
      const [dx, dz] = exits[0];
      const ex = mx - dx * (hx - inset), ez = mz - dz * (hz - inset);
      const n = r.int(1, 3);
      for (let k = 0; k < n; k++) {
        const s = n === 1 ? 0 : (k / (n - 1) - 0.5) * (dz !== 0 ? 2 * hx - 0.9 : 2 * hz - 0.9);
        place(ex + (dz !== 0 ? s : 0) + r.range(-0.05, 0.05), ez + (dx !== 0 ? s : 0) + r.range(-0.05, 0.05), tallN());
      }
    } else if (exits.length === 2 && exits[0][0] !== -exits[1][0] && exits[0][1] !== -exits[1][1]) {
      // turn: a column in the outer corner, sometimes two
      const ox = -(exits[0][0] + exits[1][0]), oz = -(exits[0][1] + exits[1][1]);
      place(mx + ox * (hx - inset), mz + oz * (hz - inset), tallN());
      if (r.chance(0.35)) {
        if (r.chance(0.5)) place(mx + ox * (hx - inset) - ox * 0.55, mz + oz * (hz - inset), tallN());
        else place(mx + ox * (hx - inset), mz + oz * (hz - inset) - oz * 0.55, tallN());
      }
    } else if (exits.length === 3 && r.chance(0.4)) {
      // T-junction: against the closed side
      const [dx, dz] = DIRS.find(([a, b]) => !exits.some((e) => e[0] === a && e[1] === b));
      place(mx + dx * (hx - inset), mz + dz * (hz - inset), tallN());
    } else if (exits.length === 2 && r.chance(0.08)) {
      // straight run: a shorter stack left against a wall
      const side = exits[0][0] !== 0 ? [0, r.sign()] : [r.sign(), 0];
      place(mx + side[0] * (hx - inset), mz + side[1] * (hz - inset), r.int(8, 20));
    }
    // dim tubes along the corridor
    if (r.chance(0.62)) {
      const u = r.next();
      const state = u < 0.2 ? 'off' : u < 0.3 ? 'flicker' : u < 0.36 ? 'dying' : 'on';
      const chn = state === 'flicker' ? r.int(1, 4) : state === 'dying' ? r.int(5, 8) : 0;
      const alongX = exits.some(([dx]) => dx !== 0) && !exits.some(([, dz]) => dz !== 0) ? 1 : exits.some(([, dz]) => dz !== 0) && !exits.some(([dx]) => dx !== 0) ? 0 : r.int(0, 1);
      zb.fixture(mx, mz, 'tube', state !== 'off', { ch: chn, rot: alongX, l: 1.2 });
      if (state !== 'off') zb.light(mx, p.ceilH - 0.5, mz, { rad: 6, int: 0.58, color: [0.88, 0.95, 1.0], ch: chn });
    }
  }

  // the drone
  for (let z = z0 + 6; z < z1; z += 12) for (let x = x0 + 6; x < x1; x += 12) zb.emitter(x + r.range(-2, 2), 1.8, z + r.range(-2, 2), 'drone', { vol: 0.35, rad: 11 });
  // bare: stains on walls and floor only
  for (let k = 0; k < (zb.w * zb.d) / 50; k++) {
    const x = r.int(x0, x1 - 1), z = r.int(z0, z1 - 1);
    if (r.chance(0.5)) floorDecal(zb, x + r.next(), z + r.next(), r.pick(['dec_stain', 'dec_puddle', 'dec_crack']), r.range(0.6, 1.5), r);
  }
}

defineZone('stacking_maze', {
  border: 'wall',
  gate: 'door',
  minW: 24, minD: 24, maxW: 64, maxD: 64,
  allowStairs: false,
  weight: (c) => (c.dim === 0 && c.dist > 200 ? 0.18 * (0.5 + c.ind) : 0),
  params,
  gen,
});
