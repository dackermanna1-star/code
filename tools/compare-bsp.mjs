// Dev tool: compare the recreated de_dust2 against an original de_dust2.bsp
// (from your own Counter-Strike install) as a top-down floor-height diff.
//
//   node tools/compare-bsp.mjs <path/to/de_dust2.bsp> <out-dir> [step=16] [x0 y0 x1 y1]
//
// For every grid cell it finds the floors a standing player hull can rest on
// (player clips included) and keeps those reachable from the spawns. Writes:
//   diff.ppm   green = floors match (within 8u), red = floor only in the original,
//              blue = floor only in the recreation, grey = nothing in either
//   orig.ppm / mine.ppm   lowest floor height, banded every 32 units
//   diff.json  per-cell mismatch list; floors.json  all reachable floors per cell
// Nothing from the original file is written into the project.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { parseBsp, BspHulls, CONTENTS_SOLID } from '../src/bsp/bsp30.js';
import { buildDust2 } from '../src/map/dust2.js';
import { compileMap } from '../src/map/compile.js';

const [bspPath, outDir, stepArg, ...bounds] = process.argv.slice(2);
const step = +(stepArg || 16);
const [X0, Y0, X1, Y1] = bounds.length === 4 ? bounds.map(Number) : [-2400, -1300, 2100, 3700];
const ZTOP = 560, ZBOT = -360, DZ = 4;

const buf = readFileSync(bspPath);
const bsp = parseBsp(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const hulls = new BspHulls(bsp);
const head0 = bsp.models[0].headnode[0];
// hull 1 = standing player hull (includes player clips); z is the hull centre
const head1 = bsp.models[0].headnode[1];
const origSolid = (x, y, z) => hulls.pointContents(1, head1, [x, y, z]) === CONTENTS_SOLID;

const m = buildDust2();
const world = compileMap(m.brushes).world;
const Z = [0, 0, 0];
const MINS = [-16, -16, -36], MAXS = [16, 16, 36];
const mineSolid = (x, y, z) => world.testBox([x, y, z], MINS, MAXS, 1 | 2); // solid + player clip

// floors under a standing player hull: solid with the hull centre DZ higher free
function floors(solid, x, y) {
  const out = [];
  let open = false;
  for (let z = ZTOP; z >= ZBOT; z -= DZ) {
    const s = solid(x, y, z);
    if (s && open) out.push(z + DZ / 2 - 36);
    open = !s;
  }
  return out;
}

const W = Math.ceil((X1 - X0) / step), H = Math.ceil((Y1 - Y0) / step);
const diff = Buffer.alloc(W * H * 3), imO = Buffer.alloc(W * H * 3), imM = Buffer.alloc(W * H * 3);
const cells = [];
const band = (z, im, i) => {
  if (z == null) { im[i] = im[i + 1] = im[i + 2] = 20; return; }
  const t = Math.max(0, Math.min(1, (z + 300) / 700));
  const stripe = Math.floor(z / 32) % 2 ? 0.85 : 1;
  im[i] = (60 + 195 * t) * stripe; im[i + 1] = (90 + 120 * (1 - Math.abs(t - 0.5) * 2)) * stripe; im[i + 2] = (255 - 200 * t) * stripe;
};
const t0 = Date.now();
const FO = [], FM = [];
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const x = X0 + (i + 0.5) * step, y = Y1 - (j + 0.5) * step;
  FO.push(floors(origSolid, x, y));
  FM.push(floors(mineSolid, x, y));
}
// keep only floors a player can reach from the spawns (step/jump up <= 54, drop any)
function reach(F) {
  const seen = F.map((f) => f.map(() => false));
  const q = [];
  for (const [sx, sy, sz] of [[-640, -800, 140], [256, 2240, -124]]) {
    const i = Math.floor((sx - X0) / step), j = Math.floor((Y1 - sy) / step), c = j * W + i;
    let best = -1, bd = 1e9;
    F[c].forEach((z, k) => { if (Math.abs(z - sz) < bd) { bd = Math.abs(z - sz); best = k; } });
    if (best >= 0) { seen[c][best] = true; q.push([c, best]); }
  }
  while (q.length) {
    const [c, k] = q.pop();
    const z = F[c][k], i = c % W, j = (c - i) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const n = nj * W + ni;
      F[n].forEach((nz, nk) => {
        if (seen[n][nk] || nz - z > 54 || z - nz > 400) return;
        seen[n][nk] = true; q.push([n, nk]);
      });
    }
  }
  return F.map((f, c) => f.filter((_, k) => seen[c][k]));
}
const RO = reach(FO), RM = reach(FM);
// ceiling over each reachable floor (point hull): first solid above it, or null when open to the sky
const origPoint = (x, y, z) => hulls.pointContents(0, head0, [x, y, z]);
function ceilings(R, solidAt, skyAt) {
  return R.map((f, c) => {
    const i = c % W, j = (c - i) / W, x = X0 + (i + 0.5) * step, y = Y1 - (j + 0.5) * step;
    return f.map((z) => {
      for (let h = z + 8; h < 1200; h += 4) {
        if (skyAt(x, y, h)) return null;
        if (solidAt(x, y, h)) return Math.round(h);
      }
      return null;
    });
  });
}
const CO = ceilings(RO, (x, y, z) => origPoint(x, y, z) === CONTENTS_SOLID, (x, y, z) => origPoint(x, y, z) === -6);
const CM = ceilings(RM, (x, y, z) => world.testBox([x, y, z], Z, Z, 1), (x, y, z) => z > 900);
let match = 0, onlyO = 0, onlyM = 0;
for (let c = 0; c < W * H; c++) {
  const fo = RO[c], fm = RM[c], k = c * 3;
  const mo = fo.filter((z) => !fm.some((w) => Math.abs(w - z) <= 8));
  const mm = fm.filter((z) => !fo.some((w) => Math.abs(w - z) <= 8));
  if (!fo.length && !fm.length) { diff[k] = diff[k + 1] = diff[k + 2] = 40; }
  else if (!mo.length && !mm.length) { diff[k] = 40; diff[k + 1] = 150; diff[k + 2] = 40; match++; }
  else {
    // brightness shows the size of the height error when both have a floor here
    const err = fo.length && fm.length ? Math.min(1, Math.abs(fo[fo.length - 1] - fm[fm.length - 1]) / 64) : 1;
    diff[k] = mo.length ? 90 + 165 * err : 30; diff[k + 1] = 30; diff[k + 2] = mm.length ? 90 + 165 * err : 30;
    if (mo.length) onlyO++; if (mm.length) onlyM++;
    const i = c % W, j = (c - i) / W;
    cells.push({ x: X0 + (i + 0.5) * step, y: Y1 - (j + 0.5) * step, orig: fo, mine: fm });
  }
  band(fo.length ? fo[fo.length - 1] : null, imO, k);
  band(fm.length ? fm[fm.length - 1] : null, imM, k);
}
mkdirSync(outDir, { recursive: true });
const ppm = (b) => Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), b]);
writeFileSync(`${outDir}/diff.ppm`, ppm(diff));
writeFileSync(`${outDir}/orig.ppm`, ppm(imO));
writeFileSync(`${outDir}/mine.ppm`, ppm(imM));
writeFileSync(`${outDir}/diff.json`, JSON.stringify({ step, bounds: [X0, Y0, X1, Y1], W, H, cells }));
writeFileSync(`${outDir}/floors.json`, JSON.stringify({ step, bounds: [X0, Y0, X1, Y1], W, H, orig: RO, mine: RM, origCeil: CO, mineCeil: CM }));
console.log(`${W}x${H} cells in ${((Date.now() - t0) / 1000).toFixed(1)}s: match ${match}, only-original ${onlyO}, only-mine ${onlyM}`);
