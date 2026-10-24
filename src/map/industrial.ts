// Industrial infrastructure and site furniture of the factory level.
import { Ctx, column, catwalk, railing, steelStairs, pipe, lamp, hazard, windowRow, opening, weathered, flatRoof, rollerDoor } from './parts';
import { P } from '../world/materials';
import { hash3, Rng, valueNoise3 } from '../engine/math';
import { PropKind } from './props';

// ============================================================================ tank farm
export function buildTankFarm(c: Ctx): void {
  const { b, G } = c;
  // bund wall
  b.walls(1980, G, 780, 2420, G + 9, 1400, 3, P.concrete);
  b.clear(1980, G, 1180, 1983, G + 9, 1230); // access gap
  // tanks: two fuel tanks (explosive shell) and two water tanks
  tank(c, 2100, 900, 52, 118, true);
  tank(c, 2300, 900, 52, 118, true);
  tank(c, 2100, 1090, 46, 100, false);
  tank(c, 2300, 1090, 46, 100, false);
  // gas sphere on legs
  const sx = 2200, sz = 1290, sy = G + 86, R = 46;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const lx = Math.round(sx + Math.cos(a) * 40), lz = Math.round(sz + Math.sin(a) * 40);
    b.box(lx - 2, G, lz - 2, lx + 2, sy, lz + 2, P.paintWhite);
    const a2 = ((k + 1) / 8) * Math.PI * 2;
    const nx = Math.round(sx + Math.cos(a2) * 40), nz = Math.round(sz + Math.sin(a2) * 40);
    b.line(lx, G + 4, lz, nx, sy - 30, nz, 1, P.steelDark);
    b.box(lx - 4, G, lz - 4, lx + 4, G + 3, lz + 4, P.concreteMid);
  }
  b.sphere(sx, sy, sz, R, P.gasWhite, 1.6);
  b.cylY(sx, sz, R + 2, sy - 1, sy + 1, P.paintRed);
  steelStairs(c, 'z', -1, sx - 4, G, sz - 44, 8, 40);
  b.box(sx - 6, sy + R - 1, sz - 6, sx + 6, sy + R + 1, sz + 6, P.grate);
  // pipe rack along the west side of the bund, turning west towards the rail loading gantry
  for (let z = 790; z < 1390; z += 50) { b.box(2000, G, z, 2003, G + 40, z + 3, P.paintGreyBlue); b.box(2020, G, z, 2023, G + 40, z + 3, P.paintGreyBlue); b.box(2000, G + 40, z, 2023, G + 42, z + 3, P.paintGreyBlue); }
  pipe(c, 'z', 790, 1200, 2006, G + 46, 3, P.paintYellow, 50);
  pipe(c, 'z', 790, 1200, 2016, G + 46, 3, P.steel, 50);
  pipe(c, 'z', 790, 1200, 2011, G + 53, 2.2, P.paintRed, 50);
  for (const [tx, tz] of [[2100, 900], [2300, 900]]) pipe(c, 'x', 2006, tx - 50, G + 20, tz, 2.6, P.paintYellow, 60);
  pipe(c, 'y', G + 20, G + 46, 2006, 900, 2.6, P.paintYellow, 60);
  // loading gantry at the end of the rail
  const gx0 = 1840, gx1 = 1950;
  for (let x = gx0; x <= gx1; x += 36) for (const z of [1090, 1144]) column(c, x, z, G, G + 52, 3, P.paintYellow);
  b.box(gx0, G + 52, 1090, gx1 + 3, G + 54, 1147, P.grate);
  railing(c, 'x', gx0, gx1 + 3, G + 54, 1090);
  railing(c, 'x', gx0, gx1 + 3, G + 54, 1146);
  for (let x = gx0 + 18; x < gx1; x += 36) { b.box(x, G + 30, 1116, x + 2, G + 52, 1118, P.steel); b.line(x, G + 30, 1117, x + 10, G + 36, 1117, 1, P.steel); }
  steelStairs(c, 'x', 1, gx0 - 78, G, 1150, 8, 26);
  pipe(c, 'x', 1950, 2010, G + 46, 1200, 3, P.paintYellow, 50);
  // pump house
  b.walls(2330, G, 1340, 2400, G + 30, 1390, 3, weathered(P.brick, P.brickDark, G, 5));
  flatRoof(c, 2326, 1336, 2404, 1394, G + 30, 2, P.concreteMid, 0);
  opening(c, 'z', 2330, 3, 1355, 12, G, 22, P.concreteDark);
  b.box(2345, G, 1350, 2370, G + 12, 1380, P.machineBlue);
  lamp(c, 2365, G + 29, 1365, true, 9, 3, false);
}

function tank(c: Ctx, cx: number, cz: number, R: number, H: number, fuel: boolean): void {
  const b = c.b, G = c.G;
  b.cylY(cx, cz, R + 4, G, G + 4, P.concreteMid);
  const shell = fuel ? P.fuelTank : P.sheetWhite;
  b.cylY(cx, cz, R, G + 4, G + 4 + H, (x, y, z) => ((y - G) % 30 === 0 ? P.steelDark : (y - G - 4) > H - 8 && fuel ? P.paintRed : shell), 1.2);
  // roof cone
  const top = G + 4 + H;
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx + 0.5, dz + 0.5);
    if (d > R) continue;
    const y = top + Math.round((1 - d / R) * 10);
    b.set(cx + dx, y, cz + dz, fuel ? P.fuelTank : P.sheetWhite);
    b.set(cx + dx, y - 1, cz + dz, fuel ? P.fuelTank : P.sheetWhite);
  }
  // ladder + top railing ring
  for (let y = G + 6; y < top; y += 4) b.box(cx + R, y, cz - 2, cx + R + 2, y + 1, cz + 3, P.steel);
  b.box(cx + R + 2, G + 6, cz - 2, cx + R + 3, top + 10, cz - 1, P.steel);
  b.box(cx + R + 2, G + 6, cz + 2, cx + R + 3, top + 10, cz + 3, P.steel);
  for (let a = 0; a < 360; a += 3) {
    const r = a * Math.PI / 180;
    const x = Math.round(cx + Math.cos(r) * (R - 2)), z = Math.round(cz + Math.sin(r) * (R - 2));
    b.box(x, top + 10, z, x + 1, top + 11, z + 1, P.paintYellow);
    if (a % 15 === 0) b.box(x, top + 1, z, x + 1, top + 10, z + 1, P.paintYellow);
  }
}

// ============================================================================ silos
export function buildSilos(c: Ctx): void {
  const { b, G } = c;
  const xs = [260, 360, 460], z = 270, R = 42, base = G + 50, top = G + 270;
  for (const x of xs) {
    // legs
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const lx = Math.round(x + Math.cos(a) * 32), lz = Math.round(z + Math.sin(a) * 32);
      b.box(lx - 3, G, lz - 3, lx + 3, base, lz + 3, P.concrete);
    }
    // cone bottom
    for (let y = G + 22; y < base; y++) {
      const r = 6 + ((y - G - 22) / (base - G - 22)) * (R - 6);
      b.cylY(x, z, r, y, y + 1, P.concreteMid, 3);
    }
    b.cylY(x, z, 6, G + 16, G + 22, P.steelDark, 1.5);
    // body with stain streaks
    b.cylY(x, z, R, base, top, (xx, y, zz) => {
      const streak = hash3(xx, 0, zz) % 9 === 0 && (y - base) % 37 > 8;
      return (y - base) % 44 < 2 ? P.concreteDark : streak ? P.concreteStain : P.concrete + ((y >> 3) % 2);
    }, 3);
    // roof
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx + 0.5, dz + 0.5);
      if (d > R) continue;
      b.set(x + dx, top + Math.round((1 - d / R) * 6), z + dz, P.concreteDark);
    }
  }
  // gallery on top
  const gx0 = xs[0] - 20, gx1 = xs[2] + 70, gz0 = z - 14, gz1 = z + 14, gy = top + 6;
  b.box(gx0, gy, gz0, gx1, gy + 2, gz1, P.steelDark);
  b.walls(gx0, gy + 2, gz0, gx1, gy + 26, gz1, 1, P.sheetGreen);
  b.box(gx0, gy + 26, gz0 - 2, gx1, gy + 27, gz1 + 2, P.sheetGreen);
  windowRow(c, 'x', gz0, 1, gx0 + 10, gx1 - 10, gy + 12, 16, 8, 30, P.glassFrost, P.steelDark, P.steelDark);
  windowRow(c, 'x', gz1 - 1, 1, gx0 + 10, gx1 - 10, gy + 12, 16, 8, 30, P.glassFrost, P.steelDark, P.steelDark);
  for (let x = gx0 + 6; x < gx1; x += 50) for (const zz of [gz0 + 2, gz1 - 4]) b.box(x, top, zz, x + 2, gy, zz + 2, P.steelDark);
  // bucket elevator tower
  const ex = xs[2] + 50;
  for (const [dx, dz] of [[0, 0], [18, 0], [0, 18], [18, 18]]) b.box(ex + dx, G, z - 9 + dz, ex + dx + 2, gy + 26, z - 9 + dz + 2, P.paintGreen);
  for (let y = G + 20; y < gy; y += 30) { b.line(ex, y, z - 9, ex + 19, y + 30, z - 9, 1, P.paintGreen); b.line(ex, y, z + 10, ex + 19, y + 30, z + 10, 1, P.paintGreen); }
  b.box(ex + 4, G, z - 5, ex + 16, gy + 20, z + 5, P.sheetGreen);
  steelStairs(c, 'z', 1, ex + 22, G, z - 60, 8, 40);
  // truck hopper house under the silos
  b.box(xs[0] - 50, G, z + 50, xs[2] + 40, G + 2, z + 70, hazard());
  c.props.push({ kind: 'truck', x: 300, y: G, z: 255, rot: 0 });
  lamp(c, 360, G + 20, 270, true, 16, 5, false);
}

// ============================================================================ water tower
export function buildWaterTower(c: Ctx): void {
  const { b, G } = c;
  const cx = 520, cz = 1350, S = 26, H = 200;
  const col = P.paintDarkGreen;
  for (const [dx, dz] of [[-S, -S], [S, -S], [-S, S], [S, S]]) {
    b.box(cx + dx - 4, G, cz + dz - 4, cx + dx + 4, G + 6, cz + dz + 4, P.concreteMid);
    b.line(cx + dx, G + 6, cz + dz, cx + Math.round(dx * 0.75), G + H, cz + Math.round(dz * 0.75), 3, col);
  }
  for (let y = G + 30; y < G + H; y += 45) {
    const s = Math.round(S - ((y - G) / H) * S * 0.25);
    b.box(cx - s, y, cz - s, cx + s, y + 2, cz - s + 2, col); b.box(cx - s, y, cz + s - 2, cx + s, y + 2, cz + s, col);
    b.box(cx - s, y, cz - s, cx - s + 2, y + 2, cz + s, col); b.box(cx + s - 2, y, cz - s, cx + s, y + 2, cz + s, col);
    const s2 = Math.round(S - ((y + 45 - G) / H) * S * 0.25);
    b.line(cx - s, y, cz - s, cx + s2, y + 44, cz - s2, 1, P.steelDark);
    b.line(cx + s, y, cz + s, cx - s2, y + 44, cz + s2, 1, P.steelDark);
  }
  // tank
  b.box(cx - 36, G + H, cz - 36, cx + 36, G + H + 2, cz + 36, P.grate);
  b.cylY(cx, cz, 32, G + H + 2, G + H + 48, (x, y) => ((y - G - H) % 12 === 0 ? P.steelDark : P.sheetGreen), 1, true);
  for (let dz = -32; dz <= 32; dz++) for (let dx = -32; dx <= 32; dx++) {
    const d = Math.hypot(dx + 0.5, dz + 0.5);
    if (d > 32) continue;
    b.set(cx + dx, G + H + 48 + Math.round((1 - d / 32) * 12), cz + dz, P.sheetGreen);
  }
  for (let a = 0; a < 360; a += 4) {
    const r = a * Math.PI / 180;
    const x = Math.round(cx + Math.cos(r) * 35), z = Math.round(cz + Math.sin(r) * 35);
    b.box(x, G + H + 2, z, x + 1, G + H + 12, z + 1, a % 20 === 0 ? P.paintYellow : -1);
    b.box(x, G + H + 11, z, x + 1, G + H + 12, z + 1, P.paintYellow);
  }
  for (let y = G + 4; y < G + H; y += 4) b.box(cx - 2, y, cz - S - 2, cx + 3, y + 1, cz - S, P.steel);
  pipe(c, 'y', G, G + H, cx, cz, 4, P.rust, 40);
}

// ============================================================================ substation
export function buildSubstation(c: Ctx): void {
  const { b, G } = c;
  const X0 = 180, X1 = 560, Z0 = 1800, Z1 = 2250;
  chainFence(c, 'x', X0, X1, Z0, G);
  chainFence(c, 'x', X0, X1, Z1, G);
  chainFence(c, 'z', Z0, Z1, X0, G);
  chainFence(c, 'z', Z0, Z1 - 0, X1, G, [[1980, 2040]]);
  for (let k = 0; k < 3; k++) transformer(c, 240 + k * 100, 1880);
  // gantries with busbars and insulators
  for (let x = 220; x < 520; x += 75) {
    for (const z of [1980, 2060]) { b.box(x, G, z, x + 3, G + 90, z + 3, P.galv); b.line(x, G, z, x + 30, G + 40, z, 1, P.galv); }
    b.box(x, G + 90, 1980, x + 3, G + 93, 2063, P.galv);
    for (const z of [2000, 2020, 2040]) { b.box(x + 1, G + 76, z, x + 2, G + 90, z + 1, P.plasticWhite); }
  }
  for (const z of [2000, 2020, 2040]) b.box(220, G + 76, z, 523, G + 77, z + 1, P.copper);
  // control building
  b.walls(420, G, 2120, 540, G + 34, 2220, 3, weathered(P.brick, P.brickDark, G, 5));
  flatRoof(c, 416, 2116, 544, 2224, G + 34, 2, P.concreteMid, 2);
  windowRow(c, 'x', 2120, 3, 430, 530, G + 12, 16, 12, 30, P.glass, P.paintWhite, P.concrete);
  opening(c, 'z', 420, 3, 2160, 12, G, 24, P.concreteDark);
  for (let k = 0; k < 5; k++) b.box(440 + k * 18, G, 2190, 454 + k * 18, G + 24, 2210, P.paintGreyBlue);
  lamp(c, 480, G + 33, 2170, false, 10, 3, true);
  // lattice pylon
  pylon(c, 300, 2160);
}

function transformer(c: Ctx, x: number, z: number): void {
  const b = c.b, G = c.G;
  b.box(x - 6, G, z - 6, x + 46, G + 4, z + 40, P.concreteMid);
  b.box(x, G + 4, z, x + 40, G + 34, z + 34, P.machineGrey);
  for (let k = 0; k < 8; k++) b.box(x + 3 + k * 5, G + 6, z - 5, x + 4 + k * 5, G + 30, z, P.machineGrey + 1); // radiator fins
  for (let k = 0; k < 8; k++) b.box(x + 3 + k * 5, G + 6, z + 34, x + 4 + k * 5, G + 30, z + 39, P.machineGrey + 1);
  // oil inside (explosive core) + conservator tank
  b.box(x + 4, G + 8, z + 4, x + 36, G + 30, z + 30, P.oilTank);
  b.cylX(G + 44, z + 8, 5, x + 4, x + 36, P.oilTank);
  b.box(x + 8, G + 34, z + 6, x + 10, G + 40, z + 9, P.steelDark);
  for (let k = 0; k < 3; k++) {
    b.cylY(x + 10 + k * 10, z + 22, 2.2, G + 34, G + 52, (xx, y) => (y % 3 === 0 ? P.plasticWhite : P.ibcWhite));
    b.box(x + 9 + k * 10, G + 52, z + 21, x + 12 + k * 10, G + 54, z + 24, P.copper);
  }
  b.box(x + 30, G + 20, z + 34, x + 38, G + 28, z + 35, hazard());
}

function pylon(c: Ctx, cx: number, cz: number): void {
  const b = c.b, G = c.G;
  const H = 360;
  const col = P.galv;
  const w = (y: number) => Math.round(30 - (y / H) * 22);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    b.box(cx + sx * 30 - 4, G, cz + sz * 30 - 4, cx + sx * 30 + 4, G + 4, cz + sz * 30 + 4, P.concreteMid);
    b.line(cx + sx * 30, G + 4, cz + sz * 30, cx + sx * w(H), G + H, cz + sz * w(H), 2, col);
  }
  for (let y = 0; y < H - 30; y += 30) {
    const a = w(y), d = w(y + 30);
    for (const s of [-1, 1]) {
      b.line(cx - a, G + y + 4, cz + s * a, cx + d, G + y + 34, cz + s * d, 1, col);
      b.line(cx + a, G + y + 4, cz + s * a, cx - d, G + y + 34, cz + s * d, 1, col);
      b.line(cx + s * a, G + y + 4, cz - a, cx + s * d, G + y + 34, cz + d, 1, col);
      b.line(cx + s * a, G + y + 4, cz + a, cx + s * d, G + y + 34, cz - d, 1, col);
    }
  }
  // cross arms
  for (const [y, len] of [[H - 100, 70], [H - 50, 55], [H, 40]]) {
    b.box(cx - len, G + y, cz - 2, cx + len, G + y + 3, cz + 2, col);
    b.line(cx - len, G + y, cz, cx - w(y), G + y - 20, cz, 1, col);
    b.line(cx + len, G + y, cz, cx + w(y), G + y - 20, cz, 1, col);
    for (const s of [-1, 1]) {
      b.box(cx + s * (len - 4), G + y - 14, cz, cx + s * (len - 4) + 1, G + y, cz + 1, P.plasticWhite);
      // conductors leaving to the west (off-map) with sag
      for (let x = cx + s * (len - 4); x >= 0; x -= 1) {
        const t = (cx - x) / 300;
        const sag = Math.round(Math.sin(Math.min(1, t) * Math.PI) * 25);
        if (x === cx + s * (len - 4) && s > 0) continue;
        b.set(x, G + y - 14 - sag, cz, P.rubber);
      }
    }
  }
}

// ============================================================================ container yard
export function buildContainerYard(c: Ctx): void {
  const G = c.G;
  const rng = new Rng(99);
  for (let row = 0; row < 4; row++) {
    const z = 1200 + row * 110;
    for (let k = 0; k < 6; k++) {
      const x = 720 + k * 68;
      const h = rng.int(row === 3 ? 0 : 1, 3);
      for (let l = 0; l < h; l++) c.props.push({ kind: 'container', x, y: G + l * 26, z, rot: 0, seed: rng.int(0, 1e6) });
    }
  }
  c.b.box(700, G, 1180, 1160, G + 1, 1182, hazard());
  c.props.push({ kind: 'forklift', x: 1150, y: G, z: 1300, rot: 1 });
  c.props.push({ kind: 'truck', x: 1100, y: G, z: 1620, rot: 0 });
  for (let k = 0; k < 6; k++) c.props.push({ kind: 'cone', x: 1170, y: G, z: 1190 + k * 30, rot: 0 });
}

// ============================================================================ rail spur
export function buildRail(c: Ctx): void {
  const { b, G } = c;
  const y = G + 1;
  for (let x = 0; x < 1950; x += 7) b.box(x, y, 1102, x + 3, y + 1, 1132, P.woodDark);
  b.box(0, y + 1, 1108, 1950, y + 3, 1110, P.railSteel);
  b.box(0, y + 1, 1124, 1950, y + 3, 1126, P.railSteel);
  // buffer stop
  b.box(1950, y, 1100, 1960, y + 12, 1134, P.paintRed);
  b.box(1946, y + 6, 1104, 1950, y + 10, 1110, P.paintBlack); b.box(1946, y + 6, 1124, 1950, y + 10, 1130, P.paintBlack);
  // wagons
  c.props.push({ kind: 'tankWagon', x: 1830, y: y + 3, z: 1103, rot: 0 });
  c.props.push({ kind: 'tankWagon', x: 1700, y: y + 3, z: 1103, rot: 0 });
  c.props.push({ kind: 'boxcar', x: 1300, y: y + 3, z: 1103, rot: 0 });
  c.props.push({ kind: 'boxcar', x: 1170, y: y + 3, z: 1103, rot: 0 });
  // rail signal
  b.box(1500, G, 1140, 1502, G + 40, 1142, P.steelDark);
  b.box(1498, G + 34, 1138, 1504, G + 44, 1140, P.paintBlack);
  b.box(1500, G + 40, 1137, 1502, G + 42, 1138, P.lampRed);
  c.lamps.push({ x: 1501, y: G + 41, z: 1136, r: 2, g: 0.2, b: 0.1, radius: 5 });
}

// ============================================================================ scrap yard
export function buildScrapYard(c: Ctx): void {
  const { b, G } = c;
  const rng = new Rng(7);
  // scrap heaps: noisy mounds of mixed metal
  for (const [cx, cz, r, h] of [[2120, 1600, 70, 40], [2300, 1640, 60, 34], [2180, 1800, 55, 30]]) {
    for (let z = cz - r; z <= cz + r; z++) for (let x = cx - r; x <= cx + r; x++) {
      const d = Math.hypot(x - cx, z - cz) / r;
      if (d > 1) continue;
      const top = Math.round(h * (1 - d * d) * (0.75 + 0.5 * valueNoise3(x * 0.08, 0, z * 0.08, 5)));
      for (let y = 0; y < top; y++) {
        const n = valueNoise3(x * 0.15, y * 0.15, z * 0.15, 9);
        if (n < 0.38) continue;
        const hh = hash3(x, y, z) % 10;
        b.set(x, G + y, z, hh < 4 ? P.rust + (hh & 3) : hh < 6 ? P.scrap + (hh & 1) : hh < 7 ? P.steelDark : hh < 8 ? P.carBlue : hh < 9 ? P.rubber : P.sheetRust);
      }
    }
  }
  // crushed car blocks
  for (let k = 0; k < 10; k++) {
    const x = 2260 + (k % 5) * 30, z = 1820 + ((k / 5) | 0) * 24, h = rng.int(1, 3);
    for (let l = 0; l < h; l++) {
      const col = rng.pick([P.carRed, P.carBlue, P.carWhite, P.carSilver, P.carGreen, P.rust]);
      b.box(x, G + l * 8, z, x + 26, G + l * 8 + 8, z + 18, (xx, y, zz) => (hash3(xx, y, zz) % 5 === 0 ? P.rust : hash3(xx, y, zz) % 11 === 0 ? P.glassDark : col));
    }
  }
  // material handler (static)
  const mx = 2380, mz = 1560;
  b.box(mx - 16, G, mz - 14, mx + 16, G + 8, mz + 14, P.castIron);
  b.box(mx - 14, G + 8, mz - 12, mx + 14, G + 24, mz + 12, P.machineOrange);
  b.box(mx + 2, G + 24, mz - 10, mx + 12, G + 38, mz, P.machineOrange);
  b.box(mx + 11, G + 28, mz - 9, mx + 12, G + 36, mz - 1, P.glassDark);
  b.line(mx, G + 24, mz + 4, mx - 80, G + 90, mz + 4, 4, P.machineOrange);
  b.line(mx - 80, G + 90, mz + 4, mx - 110, G + 50, mz + 4, 3, P.machineOrange);
  b.box(mx - 111, G + 30, mz + 3, mx - 110, G + 50, mz + 5, P.steelDark);
  b.cylY(mx - 110, mz + 4, 9, G + 24, G + 30, P.castIron);
  for (let k = 0; k < 4; k++) c.props.push({ kind: 'dumpster', x: 2040 + k * 26, y: G, z: 1960, rot: 0 });
  for (let k = 0; k < 6; k++) c.props.push({ kind: 'tireStack', x: 2420 - (k % 3) * 11, y: G, z: 1700 + ((k / 3) | 0) * 11, rot: 0 });
  c.props.push({ kind: 'van', x: 2050, y: G, z: 1520, rot: 1 });
  c.props.push({ kind: 'barrelFuel', x: 2440, y: G, z: 1980, rot: 0 });
  c.props.push({ kind: 'barrelFuel', x: 2447, y: G, z: 1980, rot: 0 });
  c.props.push({ kind: 'propane', x: 2400, y: G, z: 1900, rot: 0 });
}

// ============================================================================ fences
export function chainFence(c: Ctx, axis: 'x' | 'z', a0: number, a1: number, at: number, G: number, gaps: [number, number][] = []): void {
  const b = c.b;
  const H = 22;
  for (let a = a0; a < a1; a++) {
    if (gaps.some(([g0, g1]) => a >= g0 && a < g1)) continue;
    const post = (a - a0) % 30 === 0;
    for (let y = 0; y < H + 3; y++) {
      let v = 0;
      if (post) v = y < H + 2 ? P.concreteMid : 0;
      else if (y < H) v = ((a + y) % 4 === 0 || (a - y + 1000) % 4 === 0) ? P.grate : 0;
      else if (y === H + 1 && a % 2 === 0) v = P.steelDark;
      if (!v) continue;
      if (axis === 'x') b.set(a, G + y, at, v); else b.set(at, G + y, a, v);
    }
    if (axis === 'x') b.set(a, G + H, at, P.steel); else b.set(at, G + H, a, P.steel);
  }
}

export function buildFence(c: Ctx): void {
  const G = c.G;
  chainFence(c, 'x', 80, 2480, 80, G);
  chainFence(c, 'x', 80, 2480, 2480, G, [[1230, 1350]]);
  chainFence(c, 'z', 80, 2480, 80, G);
  chainFence(c, 'z', 80, 2480, 2480, G);
}

// ============================================================================ street lights
export function buildStreetLights(c: Ctx): void {
  const { b, G } = c;
  const light = (x: number, z: number, dx: number, dz: number) => {
    b.box(x, G, z, x + 2, G + 78, z + 2, P.paintGreyBlue);
    b.box(x - 1, G, z - 1, x + 3, G + 4, z + 3, P.concreteMid);
    const ex = x + dx * 14, ez = z + dz * 14;
    b.line(x + 1, G + 77, z + 1, ex, G + 80, ez, 1, P.paintGreyBlue);
    b.box(ex - 3, G + 79, ez - 2, ex + 3, G + 81, ez + 2, P.paintGreyBlue);
    b.box(ex - 2, G + 78, ez - 1, ex + 2, G + 79, ez + 1, P.lampWarm);
    c.lamps.push({ x: ex, y: G + 77, z: ez, r: 9, g: 7, b: 4.5, radius: 22 });
  };
  for (let z = 1180; z < 2460; z += 220) { light(1230, z, 1, 0); light(1350, z + 110, -1, 0); }
  for (let x = 200; x < 2400; x += 240) { light(x, 990, 0, 1); }
  for (let x = 1480; x < 1900; x += 140) light(x, 2430, 0, -1);
}

// ============================================================================ power lines (wooden poles along the west fence)
export function buildPowerLines(c: Ctx): void {
  const { b, G } = c;
  const x = 110;
  const poles: number[] = [];
  for (let z = 300; z <= 2400; z += 260) poles.push(z);
  for (const z of poles) {
    b.cylY(x, z, 1.6, G, G + 100, P.bark + 1);
    b.box(x - 14, G + 92, z - 1, x + 15, G + 94, z + 1, P.woodDark);
    for (const dx of [-12, 0, 12]) b.box(x + dx, G + 94, z, x + dx + 1, G + 98, z + 1, P.plasticWhite);
  }
  for (let i = 0; i + 1 < poles.length; i++) {
    const z0 = poles[i], z1 = poles[i + 1];
    for (const dx of [-12, 0, 12]) {
      for (let z = z0 + 1; z < z1; z++) {
        const t = (z - z0) / (z1 - z0);
        const sag = Math.round(Math.sin(t * Math.PI) * 14);
        b.set(x + dx, G + 97 - sag, z, P.rubber);
      }
    }
  }
  // transformer on one pole
  b.cylY(x + 4, 1340, 3, G + 70, G + 82, P.oilTank);
}

// ============================================================================ trees
function tree(c: Ctx, x: number, z: number, rng: Rng): void {
  const b = c.b;
  const t = (c.b.world as any).terrain;
  const gy = t ? t.heightAt(x, z) : c.G;
  const h = rng.int(38, 68);
  const r = rng.range(1.6, 2.8);
  b.cylY(x, z, r, gy, gy + h, (xx, y, zz) => P.bark + (hash3(xx, y, zz) % 3));
  // a few branches
  for (let k = 0; k < 4; k++) {
    const a = rng.range(0, 6.28), len = rng.range(8, 16), y0 = gy + Math.round(h * rng.range(0.5, 0.8));
    b.line(x, y0, z, x + Math.round(Math.cos(a) * len), y0 + Math.round(len * 0.7), z + Math.round(Math.sin(a) * len), 1, P.bark);
  }
  const leaves = rng.chance(0.15) ? P.leavesYellow : P.leaves;
  const blobs = rng.int(3, 6);
  for (let k = 0; k < blobs; k++) {
    const bx = x + rng.int(-12, 12), by = gy + h + rng.int(-10, 8), bz = z + rng.int(-12, 12), br = rng.range(11, 19);
    const R = Math.ceil(br);
    for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy * 1.4 + dz * dz);
      if (d > br || d < br - 5) continue;
      const n = valueNoise3((bx + dx) * 0.18, (by + dy) * 0.18, (bz + dz) * 0.18, 4);
      if (n < 0.42 + (d / br) * 0.12) continue;
      const hv = hash3(bx + dx, by + dy, bz + dz);
      b.set(bx + dx, by + dy, bz + dz, leaves + (hv % (leaves === P.leaves ? 4 : 2)));
    }
  }
}

export function buildTrees(c: Ctx): void {
  const rng = new Rng(2024);
  // outside the fence: rows along the south and west, a cluster on the north embankment
  for (let x = 40; x < 2540; x += rng.int(55, 110)) { tree(c, x, 2520 + rng.int(-10, 10), rng); }
  for (let z = 120; z < 2500; z += rng.int(60, 120)) tree(c, 2520 + rng.int(-10, 10), z, rng);
  for (let x = 60; x < 2500; x += rng.int(60, 120)) tree(c, x, 30 + rng.int(-10, 10), rng);
  // inside: around the office and parking
  for (const [x, z] of [[1460, 1880], [1860, 1880], [1460, 2230], [1860, 2230], [1600, 2440], [1760, 2440], [1420, 2100]]) tree(c, x, z, rng);
}

// ============================================================================ loose props around the yard
export function buildYardProps(c: Ctx): void {
  const G = c.G;
  const rng = new Rng(31337);
  // parking lot
  const kinds: PropKind[] = ['car', 'car', 'car', 'van', 'car'];
  for (let k = 0; k < 14; k++) {
    if (rng.chance(0.25)) continue;
    const x = 1472 + (k % 7) * 52 + 4, z = k < 7 ? 2262 : 2350;
    c.props.push({ kind: rng.pick(kinds), x, y: G, z, rot: k < 7 ? 1 : 3, seed: rng.int(0, 1e6) });
  }
  // trucks at the warehouse docks
  c.props.push({ kind: 'truck', x: 630, y: G, z: 568, rot: 2 });
  c.props.push({ kind: 'truck', x: 630, y: G, z: 848, rot: 2 });
  // barrels and pallets around buildings
  for (let k = 0; k < 8; k++) c.props.push({ kind: k % 3 === 0 ? 'barrelFuel' : 'barrel', x: 1800 + (k % 4) * 7, y: G, z: 930 + ((k / 4) | 0) * 7, rot: 0 });
  for (let k = 0; k < 6; k++) c.props.push({ kind: 'palletBoxes', x: 720 + (k % 3) * 14, y: G, z: 940 + ((k / 3) | 0) * 13, rot: 0 });
  for (let k = 0; k < 4; k++) c.props.push({ kind: 'dumpster', x: 1180 + k * 25, y: G, z: 935, rot: 0 });
  for (let k = 0; k < 10; k++) c.props.push({ kind: 'gas', x: 1870 + (k % 5) * 4, y: G, z: 640 + ((k / 5) | 0) * 4, rot: 0 });
  c.props.push({ kind: 'propane', x: 1830, y: G, z: 700, rot: 1 });
  c.props.push({ kind: 'van', x: 1850, y: G, z: 520, rot: 0 });
  c.props.push({ kind: 'car', x: 1380, y: G, z: 2300, rot: 3 });
  for (let k = 0; k < 4; k++) c.props.push({ kind: 'ibc', x: 2330 + k * 14, y: G, z: 1420, rot: 0 });
  // cable spools and pipes near the rail
  for (let k = 0; k < 3; k++) c.props.push({ kind: 'spool', x: 1000 + k * 20, y: G, z: 1150, rot: 0 });
}

export { rollerDoor };
