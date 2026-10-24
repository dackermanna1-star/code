// Buildings of the factory level.
import { Ctx, column, beam, windowRow, opening, rollerDoor, catwalk, railing, steelStairs, stairs, lamp, hangingLamp, flatRoof, hvac, pipe, weathered, hazard } from './parts';
import { Builder } from './builder';
import { P } from '../world/materials';
import { hash3 } from '../engine/math';

// ============================================================================ main production hall
export function buildMainHall(c: Ctx): void {
  const { b, G } = c;
  const X0 = 780, X1 = 1780, Z0 = 480, Z1 = 920;
  const H = 140, RISE = 32, zc = (Z0 + Z1) / 2, half = (Z1 - Z0) / 2;
  const roofY = (z: number) => G + H + Math.round(RISE * (1 - Math.abs(z + 0.5 - zc) / half));
  // ---- walls: brick plinth + corrugated sheet above
  const brick = weathered(P.brick, P.brickDark, G, 10);
  b.box(X0, G, Z0, X1, G + 30, Z0 + 3, brick);
  b.box(X0, G, Z1 - 3, X1, G + 30, Z1, brick);
  b.box(X0, G, Z0, X0 + 3, G + 30, Z1, brick);
  b.box(X1 - 3, G, Z0, X1, G + 30, Z1, brick);
  b.box(X0, G + 30, Z0 - 1, X1, G + 32, Z0 + 3, P.concrete); // concrete band
  b.box(X0, G + 30, Z1 - 3, X1, G + 32, Z1 + 1, P.concrete);
  b.box(X0 - 1, G + 30, Z0, X0 + 3, G + 32, Z1, P.concrete);
  b.box(X1 - 3, G + 30, Z0, X1 + 1, G + 32, Z1, P.concrete);
  const sheet = weathered(P.sheetBlue, P.sheetBlue + 1, G + 32, 40);
  b.box(X0, G + 32, Z0, X1, G + H, Z0 + 1, sheet);
  b.box(X0, G + 32, Z1 - 1, X1, G + H, Z1, sheet);
  for (let z = Z0; z < Z1; z++) { const top = roofY(z); b.box(X0, G + 32, z, X0 + 1, top + 1, z + 1, sheet); b.box(X1 - 1, G + 32, z, X1, top + 1, z + 1, sheet); }
  // window bands
  windowRow(c, 'x', Z0, 1, X0 + 10, X1 - 10, G + 72, 30, 22, 40, P.glass, P.paintWhite, P.paintWhite);
  windowRow(c, 'x', Z1 - 1, 1, X0 + 10, X1 - 10, G + 72, 30, 22, 40, P.glass, P.paintWhite, P.paintWhite);
  windowRow(c, 'z', X0, 1, Z0 + 30, Z1 - 30, G + 72, 30, 22, 50, P.glass, P.paintWhite, P.paintWhite);
  windowRow(c, 'z', X1 - 1, 1, Z0 + 30, Z1 - 30, G + 72, 30, 22, 50, P.glass, P.paintWhite, P.paintWhite);
  // ---- steel frame
  for (let x = X0; x <= X1 - 4; x += 80) {
    column(c, x, Z0 + 1, G, G + H + 2, 4, P.paintBlue);
    column(c, x, Z1 - 5, G, G + H + 2, 4, P.paintBlue);
    // pitched truss across the hall
    const tx = x + 1;
    b.line(tx, G + H, Z0 + 1, tx, G + H, Z1 - 2, 2, P.steel);
    b.line(tx, G + H + 1, Z0 + 1, tx, G + H + RISE, zc, 2, P.steel);
    b.line(tx, G + H + RISE, zc, tx, G + H + 1, Z1 - 2, 2, P.steel);
    for (let z = Z0 + 40, k = 0; z < Z1 - 20; z += 40, k++) {
      b.line(tx, G + H, z, tx, roofY(z) - 1, z, 2, P.steel);
      const zn = Math.min(Z1 - 2, z + 40);
      if (z < zc) b.line(tx, G + H, z, tx, roofY(zn) - 1, zn, 1, P.steel); else b.line(tx, roofY(z) - 1, z, tx, G + H, zn, 1, P.steel);
    }
    // crane rail brackets
    b.box(x, G + 108, Z0 + 5, x + 4, G + 110, Z0 + 12, P.paintBlue);
    b.box(x, G + 108, Z1 - 12, x + 4, G + 110, Z1 - 5, P.paintBlue);
  }
  // end wall columns
  for (let z = Z0 + 80; z < Z1 - 40; z += 80) { column(c, X0 + 1, z, G, roofY(z), 4, P.paintBlue); column(c, X1 - 5, z, G, roofY(z), 4, P.paintBlue); }
  // purlins along the hall
  for (let z = Z0 + 2; z < Z1 - 2; z += 36) b.box(X0, roofY(z), z, X1, roofY(z) + 1, z + 2, P.steelDark);
  // roof sheets with skylight strips
  for (let z = Z0 - 6; z < Z1 + 6; z++) {
    const zz = Math.min(Z1 - 1, Math.max(Z0, z));
    const y = roofY(zz) + 1;
    const sky = (Math.abs(z - (Z0 + 85)) < 18 || Math.abs(z - (Z1 - 85)) < 18);
    for (let x = X0 - 6; x < X1 + 6; x++) {
      const bay = (x - X0) % 80;
      const glass = sky && bay > 10 && bay < 70 && x > X0 && x < X1 - 1;
      b.set(x, y, z, glass ? P.glassFrost : ((x >> 1) & 1) ? P.sheetGrey : P.sheetGrey + 1);
    }
  }
  // ridge cap
  b.box(X0 - 6, roofY(zc) + 2, zc - 3, X1 + 6, roofY(zc) + 3, zc + 3, P.steelDark);
  // ---- crane rails + overhead crane
  b.box(X0 + 4, G + 110, Z0 + 6, X1 - 4, G + 114, Z0 + 10, P.steelDark);
  b.box(X0 + 4, G + 110, Z1 - 10, X1 - 4, G + 114, Z1 - 6, P.steelDark);
  const cx = 1180;
  b.box(cx, G + 114, Z0 + 4, cx + 14, G + 124, Z1 - 4, P.paintYellow);       // bridge girder
  b.box(cx + 1, G + 115, Z0 + 5, cx + 13, G + 123, Z1 - 5, (x, y, z) => (x === cx + 1 || x === cx + 12 || y === G + 115 || y === G + 122 ? P.paintYellow : -1));
  for (let z = Z0 + 40; z < Z1 - 40; z += 30) b.box(cx, G + 112, z, cx + 14, G + 114, z + 2, hazard());
  b.box(cx - 4, G + 112, Z0 + 3, cx + 18, G + 120, Z0 + 14, P.paintYellow);  // end carriages
  b.box(cx - 4, G + 112, Z1 - 14, cx + 18, G + 120, Z1 - 3, P.paintYellow);
  const tz = 640;
  b.box(cx - 2, G + 124, tz - 10, cx + 16, G + 132, tz + 10, P.machineYellow); // trolley
  b.box(cx + 6, G + 60, tz - 1, cx + 7, G + 114, tz, P.steelDark);             // cables
  b.box(cx + 8, G + 60, tz - 1, cx + 9, G + 114, tz, P.steelDark);
  b.box(cx + 3, G + 52, tz - 4, cx + 12, G + 60, tz + 3, hazard());              // hook block
  b.box(cx + 6, G + 46, tz - 1, cx + 9, G + 52, tz + 1, P.castIron);            // hook
  // hanging load: steel coil on chains
  b.box(cx + 7, G + 36, tz, cx + 8, G + 46, tz + 1, P.steelDark);
  b.cylX(G + 30, tz + 0.5, 7, cx + 2, cx + 14, P.steel, 3);
  // ---- doors
  opening(c, 'x', Z1 - 3, 3, 1000, 64, G, 66, P.paintBlue);
  rollerDoor(c, 'x', Z1 - 2, 1000, 64, G, 66, 0.85);
  opening(c, 'x', Z1 - 3, 3, 1440, 64, G, 66, P.paintBlue);
  rollerDoor(c, 'x', Z1 - 2, 1440, 64, G, 66, 0);
  opening(c, 'z', X0, 3, 600, 14, G, 24, P.concreteMid); // personnel door west
  opening(c, 'x', Z0, 3, 1640, 14, G, 24, P.concreteMid); // north door
  opening(c, 'z', X1 - 3, 3, 680, 60, G, 64, P.paintBlue); // east gate (open)
  for (let x = 1000; x < 1064; x += 16) b.box(x, G, Z1 + 2, x + 8, G + 1, Z1 + 6, hazard());
  // ---- control room (elevated), stairs
  const crX0 = 800, crX1 = 900, crZ0 = 810, crZ1 = 900, crY = G + 40;
  for (const [x, z] of [[crX0, crZ0], [crX1 - 4, crZ0], [crX0, crZ1 - 4], [crX1 - 4, crZ1 - 4]]) column(c, x, z, G, crY, 4, P.paintYellow);
  b.box(crX0, crY, crZ0, crX1, crY + 2, crZ1, P.concreteMid);
  b.walls(crX0, crY + 2, crZ0, crX1, crY + 30, crZ1, 2, P.plasterGrey);
  b.box(crX0, crY + 30, crZ0, crX1, crY + 32, crZ1, P.sheetGrey);
  windowRow(c, 'x', crZ0, 2, crX0 + 6, crX1 - 6, crY + 12, 20, 14, 24, P.glass, P.paintBlack, P.plasterGrey);
  windowRow(c, 'z', crX1 - 2, 2, crZ0 + 6, crZ1 - 6, crY + 12, 18, 14, 24, P.glass, P.paintBlack, P.plasterGrey);
  opening(c, 'z', crX1 - 2, 2, crZ1 - 20, 10, crY + 2, 22, null);
  b.box(crX0 + 6, crY + 2, crZ0 + 4, crX0 + 60, crY + 10, crZ0 + 12, P.machineGrey);   // control desk
  b.box(crX0 + 8, crY + 10, crZ0 + 5, crX0 + 58, crY + 14, crZ0 + 7, P.screen);
  lamp(c, (crX0 + crX1) >> 1, crY + 29, (crZ0 + crZ1) >> 1, false, 10, 4, true);
  steelStairs(c, 'x', 1, crX1, G, crZ1 - 30, 10, 20);
  b.box(crX1, crY, crZ1 - 30, crX1 + 14, crY + 1, crZ1 - 10, P.grate);
  railing(c, 'z', crZ1 - 30, crZ1 - 10, crY + 1, crX1 + 13);
  // ---- catwalk along the north wall + stairs
  catwalk(c, 'x', X0 + 120, X1 - 20, G + 60, Z0 + 4, 9);
  steelStairs(c, 'x', -1, X0 + 120 + 60, G, Z0 + 14, 9, 30);
  for (let x = X0 + 120; x < X1 - 20; x += 80) b.box(x + 4, G + 50, Z0 + 4, x + 6, G + 60, Z0 + 6, P.paintYellow);
  // pipes along the north wall
  pipe(c, 'x', X0 + 4, X1 - 4, G + 95, Z0 + 8, 3.2, P.paintGreen, 60);
  pipe(c, 'x', X0 + 4, X1 - 4, G + 88, Z0 + 8, 2, P.paintRed, 60);
  pipe(c, 'x', X0 + 4, X1 - 4, G + 101, Z0 + 16, 4.2, P.steel, 60);
  for (let x = X0 + 40; x < X1; x += 80) b.box(x, G + 84, Z0 + 3, x + 2, G + 106, Z0 + 18, P.steelDark);
  // ---- production line: conveyor + machines
  const cz0 = 720, cz1 = 734;
  for (let x = 880; x < 1640; x += 20) { b.box(x, G, cz0, x + 2, G + 8, cz0 + 2, P.steelDark); b.box(x, G, cz1 - 2, x + 2, G + 8, cz1, P.steelDark); }
  b.box(880, G + 8, cz0, 1640, G + 9, cz1, P.steel);
  b.box(880, G + 9, cz0 + 1, 1640, G + 10, cz1 - 1, P.rubber);
  b.box(880, G + 10, cz0, 1640, G + 11, cz0 + 1, P.paintYellow);
  b.box(880, G + 10, cz1 - 1, 1640, G + 11, cz1, P.paintYellow);
  for (let x = 900; x < 1620; x += 23) if (hash3(x, 1, 7) % 3) b.box(x, G + 10, cz0 + 3, x + 7, G + 16, cz1 - 3, P.cardboard);
  for (let k = 0; k < 6; k++) press(c, 940 + k * 120, cz0 - 34);
  for (let k = 0; k < 5; k++) cnc(c, 1000 + k * 130, cz1 + 14);
  robot(c, 1610, cz0 - 20); robot(c, 870, cz1 + 10);
  // second line: welding cells with steel frames
  for (let k = 0; k < 4; k++) {
    const x = 1300 + k * 110, z = 560;
    b.box(x, G, z, x + 60, G + 1, z + 60, P.steelDark);
    for (const [dx, dz] of [[0, 0], [58, 0], [0, 58], [58, 58]]) b.box(x + dx, G, z + dz, x + dx + 2, G + 40, z + dz + 2, P.paintYellow);
    b.box(x, G + 40, z, x + 60, G + 42, z + 60, P.paintYellow);
    b.box(x + 2, G + 1, z, x + 58, G + 30, z + 1, (xx, y) => ((xx + y) % 4 === 0 ? P.grate : -1));
    b.box(x + 20, G, z + 20, x + 40, G + 10, z + 40, P.steelDark);
    b.box(x + 22, G + 10, z + 22, x + 38, G + 12, z + 38, P.rust);
  }
  // hanging lamps
  for (let x = X0 + 40; x < X1; x += 80) for (const z of [Z0 + 110, zc, Z1 - 110]) hangingLamp(c, x + 2, G + H, G + 104, z, true);
  // ---- props
  c.props.push({ kind: 'forklift', x: 1050, y: G, z: 860, rot: 1 });
  c.props.push({ kind: 'forklift', x: 1500, y: G, z: 780, rot: 0 });
  for (let k = 0; k < 10; k++) c.props.push({ kind: 'palletBoxes', x: 820 + k * 16, y: G, z: 492, rot: 0 });
  for (let k = 0; k < 8; k++) c.props.push({ kind: 'palletBoxes', x: 1620 + (k % 4) * 14, y: G, z: 800 + ((k / 4) | 0) * 12, rot: 0 });
  for (let k = 0; k < 6; k++) c.props.push({ kind: 'barrelFuel', x: 1700 + (k % 3) * 7, y: G, z: 860 + ((k / 3) | 0) * 7, rot: 0 });
  for (let k = 0; k < 8; k++) c.props.push({ kind: 'barrel', x: 1700 + (k % 4) * 7, y: G, z: 500 + ((k / 4) | 0) * 7, rot: 0 });
  // gas cylinder cage
  b.box(1560, G, 492, 1600, G + 1, 504, P.concrete);
  for (let k = 0; k < 12; k++) c.props.push({ kind: 'gas', x: 1562 + (k % 6) * 6, y: G + 1, z: 494 + ((k / 6) | 0) * 5, rot: 0 });
  b.box(1558, G + 1, 491, 1602, G + 16, 492, (x, y) => ((x + y) % 3 === 0 ? P.grate : -1));
  for (let k = 0; k < 6; k++) { c.props.push({ kind: 'workbench', x: 900 + k * 100, y: G, z: 800, rot: 0 }); c.props.push({ kind: 'toolchest', x: 925 + k * 100, y: G, z: 812, rot: 0 }); }
  c.props.push({ kind: 'propane', x: 1730, y: G, z: 620, rot: 1 });
  for (let k = 0; k < 4; k++) c.props.push({ kind: 'ibc', x: 1650 + k * 14, y: G, z: 880, rot: 0 });
  c.props.push({ kind: 'spool', x: 950, y: G, z: 880, rot: 0 });
  c.props.push({ kind: 'pipeStack', x: 1300, y: G, z: 880, rot: 0 });
  c.props.push({ kind: 'generator', x: 1600, y: G, z: 700 - 40, rot: 0 });
}

function press(c: Ctx, x: number, z: number): void {
  const b = c.b, G = c.G;
  b.box(x, G, z, x + 34, G + 12, z + 26, P.machineGreen);
  for (const [dx, dz] of [[0, 0], [28, 0], [0, 20], [28, 20]]) b.box(x + dx, G + 12, z + dz, x + dx + 6, G + 44, z + dz + 6, P.machineGreen + 1);
  b.box(x - 2, G + 44, z - 2, x + 36, G + 58, z + 28, P.machineGreen);
  b.box(x + 8, G + 30, z + 6, x + 26, G + 38, z + 20, P.heavySteel); // ram
  b.box(x + 10, G + 12, z + 8, x + 24, G + 14, z + 18, P.castIron);   // die
  b.box(x + 34, G + 20, z + 8, x + 37, G + 32, z + 16, P.paintGreyBlue); // control box
  b.box(x + 37, G + 25, z + 10, x + 38, G + 27, z + 12, P.lampGreen);
  b.box(x + 37, G + 22, z + 13, x + 38, G + 24, z + 15, P.lampRed);
  b.box(x + 4, G + 58, z + 8, x + 30, G + 62, z + 18, P.castIron);   // motor
}

function cnc(c: Ctx, x: number, z: number): void {
  const b = c.b, G = c.G;
  b.box(x, G, z, x + 40, G + 24, z + 22, P.machineGrey);
  b.box(x + 2, G + 2, z + 22, x + 38, G + 22, z + 22, P.machineGrey);
  b.box(x + 6, G + 8, z - 1, x + 26, G + 20, z, P.glassDark);
  b.box(x + 30, G + 10, z - 2, x + 38, G + 20, z, P.plasticBlack);
  b.box(x + 31, G + 13, z - 3, x + 37, G + 18, z - 2, P.screen);
  b.box(x + 2, G + 24, z + 2, x + 38, G + 28, z + 20, P.machineGrey + 1);
  b.box(x + 18, G + 28, z + 8, x + 22, G + 32, z + 12, P.lampOrange);
}

function robot(c: Ctx, x: number, z: number): void {
  const b = c.b, G = c.G;
  b.cylY(x, z, 7, G, G + 6, P.castIron);
  b.cylY(x, z, 5, G + 6, G + 14, P.machineOrange);
  b.line(x, G + 14, z, x + 14, G + 34, z + 4, 4, P.machineOrange);
  b.line(x + 14, G + 34, z + 4, x + 30, G + 24, z + 8, 3, P.machineOrange);
  b.box(x + 28, G + 18, z + 6, x + 33, G + 24, z + 11, P.steelDark);
}

// ============================================================================ warehouse
export function buildWarehouse(c: Ctx): void {
  const { b, G } = c;
  const X0 = 180, X1 = 620, Z0 = 480, Z1 = 980;
  const H = 100, RISE = 22, xc = (X0 + X1) / 2, half = (X1 - X0) / 2;
  const roofY = (x: number) => G + H + Math.round(RISE * (1 - Math.abs(x + 0.5 - xc) / half));
  const block: (x: number, y: number, z: number) => number = (x, y, z) => {
    const band = y - G === 30 || y - G === 31 || y - G === 70 || y - G === 71;
    if (band) return P.concreteDark;
    return y - G < 6 ? P.concreteStain : P.cinder + ((((x + z) >> 2) + (y >> 1)) % 3);
  };
  b.box(X0, G, Z0, X1, G + H, Z0 + 2, block);
  b.box(X0, G, Z1 - 2, X1, G + H, Z1, block);
  for (let x = X0; x < X1; x++) { const top = roofY(x); b.box(x, G, Z0, x + 1, top, Z0 + 2, block); b.box(x, G, Z1 - 2, x + 1, top, Z1, block); }
  b.box(X0, G, Z0, X0 + 2, G + H, Z1, block);
  b.box(X1 - 2, G, Z0, X1, G + H, Z1, block);
  windowRow(c, 'z', X0, 2, Z0 + 20, Z1 - 20, G + 74, 24, 12, 40, P.glassFrost, P.paintGreen, P.concreteDark);
  windowRow(c, 'x', Z0, 2, X0 + 20, X1 - 20, G + 74, 24, 12, 40, P.glassFrost, P.paintGreen, P.concreteDark);
  // portal frames + roof
  for (let z = Z0 + 2; z < Z1; z += 60) {
    column(c, X0 + 2, z, G, G + H, 3, P.paintRed);
    column(c, X1 - 5, z, G, G + H, 3, P.paintRed);
    b.line(X0 + 2, G + H, z + 1, xc, G + H + RISE - 1, z + 1, 3, P.paintRed);
    b.line(xc, G + H + RISE - 1, z + 1, X1 - 3, G + H, z + 1, 3, P.paintRed);
    b.line(X0 + 2, G + H - 14, z + 1, X0 + 40, roofY(X0 + 40) - 2, z + 1, 2, P.paintRed);
    b.line(X1 - 3, G + H - 14, z + 1, X1 - 40, roofY(X1 - 40) - 2, z + 1, 2, P.paintRed);
  }
  for (let x = X0; x < X1; x += 40) b.box(x, roofY(x), Z0, x + 2, roofY(x) + 1, Z1, P.steelDark);
  for (let x = X0 - 4; x < X1 + 4; x++) {
    const xx = Math.min(X1 - 1, Math.max(X0, x));
    const y = roofY(xx) + 1;
    for (let z = Z0 - 4; z < Z1 + 4; z++) b.set(x, y, z, ((z >> 1) & 1) ? P.sheetRust : P.sheetRust + 1);
  }
  // loading docks on the east side
  for (const z of [560, 700, 840]) {
    opening(c, 'z', X1 - 2, 2, z, 40, G, 48, P.concreteDark);
    rollerDoor(c, 'z', X1 - 1, z, 40, G, 48, z === 700 ? 0.9 : 0);
    b.box(X1, G, z - 4, X1 + 3, G + 10, z - 1, P.rubber);
    b.box(X1, G, z + 41, X1 + 3, G + 10, z + 44, P.rubber);
    b.box(X1, G + 52, z - 6, X1 + 20, G + 53, z + 46, P.sheetGrey); // canopy
    lamp(c, X1 + 6, G + 51, z + 20, true, 12, 4, false);
  }
  opening(c, 'x', Z1 - 2, 2, 360, 12, G, 22, P.concreteDark);
  // pallet racks
  for (const rx of [235, 330, 425, 510]) rack(c, rx, Z0 + 40, Z1 - 120);
  // warehouse office
  const oX0 = X0 + 2, oX1 = X0 + 120, oZ0 = Z1 - 92, oZ1 = Z1 - 2;
  b.walls(oX0, G, oZ0, oX1, G + 32, oZ1, 2, P.plasterBeige);
  b.box(oX0, G + 32, oZ0, oX1, G + 34, oZ1, P.concreteMid);
  windowRow(c, 'x', oZ0, 2, oX0 + 10, oX1 - 10, G + 10, 20, 14, 30, P.glass, P.paintWhite, P.plasterBeige);
  opening(c, 'z', oX1 - 2, 2, oZ0 + 20, 10, G, 22, null);
  c.props.push({ kind: 'desk', x: oX0 + 20, y: G, z: oZ0 + 30, rot: 0 });
  c.props.push({ kind: 'chair', x: oX0 + 26, y: G, z: oZ0 + 40, rot: 2 });
  c.props.push({ kind: 'cabinet', x: oX0 + 4, y: G, z: oZ1 - 10, rot: 0 });
  c.props.push({ kind: 'computer', x: oX0 + 24, y: G + 8, z: oZ0 + 32, rot: 0 });
  lamp(c, (oX0 + oX1) >> 1, G + 31, (oZ0 + oZ1) >> 1, false, 10, 3, true);
  // lamps
  for (let x = X0 + 60; x < X1; x += 100) for (let z = Z0 + 60; z < Z1 - 40; z += 120) hangingLamp(c, x, G + H, G + 88, z, true);
  // props
  c.props.push({ kind: 'forklift', x: 290, y: G, z: 930, rot: 3 });
  c.props.push({ kind: 'forklift', x: 560, y: G, z: 720, rot: 2 });
  for (let k = 0; k < 10; k++) c.props.push({ kind: k % 3 ? 'palletBoxes' : 'pallet', x: 470 + (k % 5) * 16, y: G, z: 900 + ((k / 5) | 0) * 14, rot: 0 });
  for (let k = 0; k < 6; k++) c.props.push({ kind: 'crate', x: 560 + (k % 2) * 13, y: G, z: 520 + ((k / 2) | 0) * 13, rot: 0 });
}

function rack(c: Ctx, x0: number, z0: number, z1: number): void {
  const b = c.b, G = c.G;
  const D = 24;
  for (let z = z0; z <= z1; z += 32) for (const dx of [0, D - 2]) b.box(x0 + dx, G, z, x0 + dx + 2, G + 78, z + 2, P.paintOrange);
  for (const y of [G + 26, G + 52, G + 76]) {
    b.box(x0, y, z0, x0 + 2, y + 2, z1 + 2, P.paintBlue);
    b.box(x0 + D - 2, y, z0, x0 + D, y + 2, z1 + 2, P.paintBlue);
    b.box(x0 + 2, y, z0, x0 + D - 2, y + 1, z1 + 2, P.grate);
  }
  // diagonal bracing on the ends
  b.line(x0, G, z0, x0 + D - 1, G + 26, z0, 1, P.paintOrange);
  b.line(x0, G + 26, z1, x0 + D - 1, G + 52, z1, 1, P.paintOrange);
  // stored goods (static voxels): boxes on pallets
  for (const y of [G, G + 27, G + 53]) {
    for (let z = z0 + 3; z < z1 - 12; z += 16) {
      const h = hash3(x0, y, z);
      if (h % 5 === 0) continue;
      const kind = h % 4;
      b.box(x0 + 3, y + (y === G ? 0 : 1), z, x0 + D - 3, y + (y === G ? 1 : 2), z + 12, P.pallet);
      const top = y + (y === G ? 1 : 2) + 8 + (h % 9);
      if (kind === 3) b.box(x0 + 5, y + 2, z + 1, x0 + D - 5, top, z + 11, P.crate);
      else b.box(x0 + 4, y + 2, z + 1, x0 + D - 4, top, z + 11, (xx, yy, zz) => (((xx >> 2) + (zz >> 2) + (yy >> 2)) % 2 ? P.cardboard : P.cardboard + 1));
    }
  }
}

// ============================================================================ office block
export function buildOffice(c: Ctx): void {
  const { b, G } = c;
  const X0 = 1480, X1 = 1830, Z0 = 1900, Z1 = 2200;
  const FH = 36;
  const brick = weathered(P.brickYellow, P.brickYellow + 1, G, 6);
  // slabs and roof
  for (let f = 1; f <= 3; f++) b.box(X0, G + f * FH, Z0, X1, G + f * FH + 2, Z1, P.concrete);
  b.walls(X0, G + 3 * FH + 2, Z0, X1, G + 3 * FH + 7, Z1, 2, P.concreteDark);
  // facade walls
  b.walls(X0, G, Z0, X1, G + 3 * FH, Z1, 3, brick);
  // columns
  for (let x = X0; x < X1 - 3; x += 70) for (let z = Z0; z < Z1 - 3; z += 75) column(c, x, z, G, G + 3 * FH, 4, P.concrete);
  // windows on every floor
  for (let f = 0; f < 3; f++) {
    const y = G + f * FH + 10;
    windowRow(c, 'x', Z0, 3, X0 + 14, X1 - 14, y, 18, 18, 28, P.glass, P.paintWhite, P.concrete);
    windowRow(c, 'x', Z1 - 3, 3, X0 + 14, X1 - 14, y, 18, 18, 28, P.glass, P.paintWhite, P.concrete);
    windowRow(c, 'z', X0, 3, Z0 + 14, Z1 - 14, y, 18, 18, 28, P.glass, P.paintWhite, P.concrete);
    windowRow(c, 'z', X1 - 3, 3, Z0 + 14, Z1 - 14, y, 18, 18, 28, P.glass, P.paintWhite, P.concrete);
  }
  // entrance: glass front + canopy
  b.clear(1630, G, Z1 - 3, 1690, G + 30, Z1);
  b.box(1630, G, Z1 - 2, 1690, G + 30, Z1 - 1, (x, y) => (x % 15 === 0 || y === G + 29 ? P.alu : P.glass));
  b.clear(1650, G, Z1 - 2, 1670, G + 24, Z1 - 1);
  b.box(1620, G + 32, Z1, 1700, G + 34, Z1 + 30, P.concrete);
  for (const x of [1622, 1694]) b.box(x, G, Z1 + 26, x + 4, G + 32, Z1 + 30, P.alu);
  lamp(c, 1660, G + 31, Z1 + 15, true, 12, 5, false);
  b.box(1600, G + 50, Z1, 1720, G + 58, Z1 + 1, P.paintBlue); // company sign
  b.box(1604, G + 52, Z1 + 1, 1716, G + 56, Z1 + 2, P.lampCool);
  // interior per floor
  const cz0 = 2035, cz1 = 2065; // corridor
  for (let f = 0; f < 3; f++) {
    const y0 = G + f * FH + (f === 0 ? 0 : 2), y1 = G + (f + 1) * FH;
    b.box(X0 + 3, y0, cz0 - 2, X1 - 3, y1, cz0, P.plaster);
    b.box(X0 + 3, y0, cz1, X1 - 3, y1, cz1 + 2, P.plaster);
    for (let x = X0 + 70; x < X1 - 3; x += 70) { b.box(x, y0, Z0 + 3, x + 2, y1, cz0, P.plaster); b.box(x, y0, cz1 + 2, x + 2, y1, Z1 - 3, P.plaster); }
    for (let x = X0 + 25; x < X1 - 20; x += 70) {
      opening(c, 'x', cz0 - 2, 2, x, 10, y0, 22, null);
      opening(c, 'x', cz1, 2, x + 10, 10, y0, 22, null);
    }
    // carpet
    if (f > 0) b.box(X0 + 3, y0, Z0 + 3, X1 - 3, y0 + 1, Z1 - 3, (x, y, z) => (z >= cz0 && z < cz1 + 2 ? P.ceiling : P.carpet + ((x >> 3) & 1)));
    // rooms: furniture
    for (let x = X0 + 10; x < X1 - 60; x += 70) {
      for (const [zz, rot] of [[Z0 + 30, 0], [cz1 + 40, 2]] as [number, number][]) {
        const fy = f === 0 ? G : y0 + 1;
        if (x < X0 + 75 && zz < cz0) continue; // stairwell room
        c.props.push({ kind: 'desk', x: x + 12, y: fy, z: zz, rot });
        c.props.push({ kind: 'computer', x: x + 15, y: fy + 8, z: zz + 2, rot });
        c.props.push({ kind: 'chair', x: x + 16, y: fy, z: rot ? zz - 7 : zz + 10, rot });
        c.props.push({ kind: 'cabinet', x: x + 46, y: fy, z: rot ? zz + 14 : zz - 26, rot: 0 });
        lamp(c, x + 30, y1 - 1, zz + 5, false, 11, 3, true);
      }
    }
    lamp(c, (X0 + X1) >> 1, y1 - 1, (cz0 + cz1) >> 1, false, 14, 3, true);
  }
  // stairwell (west end, north side)
  const sx0 = X0 + 6, sz0 = Z0 + 6;
  for (let f = 0; f < 2; f++) {
    const y = G + f * FH + (f === 0 ? 0 : 2);
    b.clear(sx0, G + (f + 1) * FH, sz0, sx0 + 18, G + (f + 1) * FH + 2, sz0 + 60);
    stairs(c, 'z', 1, sx0, y, sz0, 18, 17, P.concreteMid, 2, 3);
  }
  // rooftop
  const RY = G + 3 * FH + 2;
  hvac(c, X0 + 40, RY, Z0 + 40); hvac(c, X0 + 140, RY, Z0 + 60); hvac(c, X1 - 80, RY, Z1 - 70);
  b.cylY(X1 - 50, Z0 + 50, 14, RY, RY + 30, P.galv, 1, true);
  b.box(X0 + 250, RY, Z0 + 180, X0 + 252, RY + 60, Z0 + 182, P.steelDark);
  b.box(X0 + 251, RY + 60, Z0 + 181, X0 + 252, RY + 61, Z0 + 182, P.lampRed);
  c.lamps.push({ x: X0 + 251, y: RY + 60, z: Z0 + 181, r: 3, g: 0.3, b: 0.2, radius: 6 });
}

// ============================================================================ boiler house + chimneys
export function buildBoilerHouse(c: Ctx): void {
  const { b, G } = c;
  const X0 = 1900, X1 = 2250, Z0 = 300, Z1 = 620;
  const H = 120;
  const brick = weathered(P.brickDark, P.sootBrick, G, 14);
  const wallsTop = (x: number) => G + H + Math.round(18 * (1 - Math.abs(x + 0.5 - (X0 + X1) / 2) / ((X1 - X0) / 2)));
  b.box(X0, G, Z0, X1, G + H, Z0 + 4, brick);
  b.box(X0, G, Z1 - 4, X1, G + H, Z1, brick);
  for (let z = Z0; z < Z1; z++) { b.box(X0, G, z, X0 + 4, G + H, z + 1, brick); b.box(X1 - 4, G, z, X1, G + H, z + 1, brick); }
  for (let x = X0; x < X1; x++) { const t = wallsTop(x); b.box(x, G + H, Z0, x + 1, t, Z0 + 4, brick); b.box(x, G + H, Z1 - 4, x + 1, t, Z1, brick); }
  // pilasters
  for (let x = X0; x < X1; x += 50) { b.box(x, G, Z0 - 3, x + 6, G + H, Z0, brick); b.box(x, G, Z1, x + 6, G + H, Z1 + 3, brick); }
  // tall arched windows
  for (let x = X0 + 15; x + 22 < X1; x += 50) for (const zf of [Z0, Z1 - 4]) {
    b.clear(x, G + 20, zf, x + 22, G + 90, zf + 4);
    for (let k = 0; k < 6; k++) b.clear(x + k, G + 90, zf, x + 22 - k, G + 92 + k * 2, zf + 4);
    b.box(x, G + 20, zf + 2, x + 22, G + 100, zf + 3, (xx, yy) => {
      if (yy >= G + 90) { const k = (yy - G - 90) >> 1; if (xx < x + k || xx >= x + 22 - k) return -1; }
      return (xx - x) % 7 === 0 || (yy - G) % 12 === 0 ? P.steelDark : P.glassGreen;
    });
    b.box(x - 1, G + 19, zf - 1, x + 23, G + 20, zf + 5, P.concrete);
  }
  // roof with monitor
  for (let x = X0 - 4; x < X1 + 4; x++) {
    const xx = Math.min(X1 - 1, Math.max(X0, x));
    const y = wallsTop(xx);
    for (let z = Z0 - 4; z < Z1 + 4; z++) b.set(x, y, z, ((z >> 1) & 1) ? P.sheetGrey : P.sheetGrey + 1);
  }
  const mx = (X0 + X1) >> 1;
  b.box(mx - 40, wallsTop(mx) + 1, Z0 + 20, mx + 40, wallsTop(mx) + 16, Z1 - 20, (x, y, z) => (z === Z0 + 20 || z === Z1 - 21 ? (y % 2 ? P.grate : P.steelDark) : -1));
  b.box(mx - 44, wallsTop(mx) + 16, Z0 + 16, mx + 44, wallsTop(mx) + 17, Z1 - 16, P.sheetGrey);
  for (let x = X0 + 20; x < X1; x += 60) b.line(x, G + H, Z0 + 4, x, G + H, Z1 - 4, 3, P.steelDark);
  // doors
  opening(c, 'z', X0, 4, 420, 56, G, 64, P.concreteMid);
  rollerDoor(c, 'z', X0 + 1, 420, 56, G, 64, 0.5);
  // boilers
  for (const bz of [380, 530]) {
    b.box(1960, G, bz - 26, 2080, G + 10, bz + 26, P.concreteDark);
    b.cylX(G + 34, bz, 24, 1965, 2075, P.machineGrey, 2, true);
    b.cylX(G + 34, bz, 25, 1990, 1992, P.steelDark);
    b.cylX(G + 34, bz, 25, 2048, 2050, P.steelDark);
    b.cylX(G + 34, bz, 10, 2075, 2080, P.castIron);
    b.box(2078, G + 30, bz - 4, 2080, G + 38, bz + 4, P.lampOrange); // furnace glow window
    c.lamps.push({ x: 2084, y: G + 34, z: bz, r: 6, g: 2.2, b: 0.4, radius: 10 });
    pipe(c, 'y', G + 56, G + 112, 2020, bz, 4, P.rust, 30);
    for (let k = 0; k < 3; k++) b.box(1975 + k * 30, G + 54, bz - 6, 1981 + k * 30, G + 60, bz + 6, P.castIron);
  }
  pipe(c, 'z', 370, 545, 2020, G + 112, 5, P.rust, 40); // header
  pipe(c, 'x', 2020, X1 + 60, G + 112, 455, 5, P.rust, 40);
  // control panels
  for (let k = 0; k < 4; k++) { b.box(2120 + k * 22, G, 330, 2138 + k * 22, G + 22, 340, P.paintGreyBlue); b.box(2122 + k * 22, G + 12, 340, 2136 + k * 22, G + 18, 341, P.screen); }
  catwalk(c, 'z', Z0 + 10, Z1 - 10, G + 60, 2090, 8);
  steelStairs(c, 'z', 1, 2090, G, Z1 - 70, 8, 30);
  for (let x = X0 + 60; x < X1; x += 100) for (const z of [400, 520]) hangingLamp(c, x, G + H, G + 96, z, true);
  // ---- brick chimney
  chimney(c, 2330, 460, G, 470);
  // flue duct from the boiler house to the chimney
  b.box(X1, G + 70, 445, 2306, G + 88, 475, P.rust);
  b.box(X1 + 2, G + 72, 447, 2306, G + 86, 473, (x) => (x > X1 + 3 ? 0 : -1));
  // ---- steel stack
  const sx = 2170, sz = 690;
  b.box(sx - 18, G, sz - 18, sx + 18, G + 12, sz + 18, P.concrete);
  b.cylY(sx, sz, 12, G + 12, G + 330, (x, y, z) => ((y - G) % 50 < 2 ? P.steelDark : y > G + 300 ? P.sootBrick : P.galv), 1);
  b.cylY(sx, sz, 16, G + 220, G + 222, P.grate);
  railing(c, 'x', sx - 16, sx + 16, G + 222, sz - 16);
  b.box(sx + 12, G + 12, sz - 1, sx + 13, G + 222, sz + 1, (x, y) => (y % 4 === 0 ? P.steel : -1));
  c.lamps.push({ x: sx, y: G + 332, z: sz, r: 4, g: 0.3, b: 0.2, radius: 8 });
  b.box(sx - 1, G + 330, sz - 1, sx + 1, G + 332, sz + 1, P.lampRed);
}

function chimney(c: Ctx, cx: number, cz: number, G: number, h: number): void {
  const b = c.b;
  b.box(cx - 36, G, cz - 36, cx + 36, G + 24, cz + 36, P.concreteMid);
  for (let y = G + 24; y < G + 24 + h; y++) {
    const t = (y - G - 24) / h;
    const r = 27 - t * 10;
    const th = 5 - t * 2;
    const ring = (y - G) % 55 < 2;
    b.cylY(cx, cz, r + (ring ? 0.8 : 0), y, y + 1, (x, yy, z) => {
      if (ring) return P.rust;
      if (t > 0.9) return P.sootBrick + (((x + z) >> 2) & 1);
      return hash3(x, yy, z) % 17 === 0 ? P.brickDark : P.brick + (((x >> 1) + (z >> 1) + (yy >> 1)) % 4);
    }, th);
  }
  // cap
  const top = G + 24 + h;
  b.cylY(cx, cz, 18.5, top, top + 3, P.concreteDark, 3.5);
  // ladder
  for (let y = G + 26; y < top; y += 4) b.box(cx + 26 - Math.round(((y - G - 24) / h) * 10), y, cz - 2, cx + 28 - Math.round(((y - G - 24) / h) * 10), y + 1, cz + 3, P.steel);
  b.box(cx - 1, top + 3, cz - 1, cx + 1, top + 5, cz + 1, P.lampRed);
  c.lamps.push({ x: cx, y: top + 4, z: cz, r: 5, g: 0.4, b: 0.25, radius: 10 });
}

// ============================================================================ guard house + gate
export function buildGuardHouse(c: Ctx): void {
  const { b, G } = c;
  const X0 = 1360, X1 = 1440, Z0 = 2380, Z1 = 2450;
  b.walls(X0, G, Z0, X1, G + 30, Z1, 2, weathered(P.brick, P.brickDark, G, 5));
  flatRoof(c, X0 - 4, Z0 - 4, X1 + 4, Z1 + 4, G + 30, 2, P.concreteMid, 2);
  windowRow(c, 'z', X0, 2, Z0 + 8, Z1 - 8, G + 10, 24, 14, 30, P.glass, P.paintWhite, P.concrete);
  windowRow(c, 'x', Z0, 2, X0 + 8, X1 - 8, G + 10, 24, 14, 32, P.glass, P.paintWhite, P.concrete);
  opening(c, 'x', Z1 - 2, 2, X0 + 30, 10, G, 22, null);
  b.box(X0 + 4, G, Z0 + 4, X0 + 30, G + 8, Z0 + 12, P.plywood);
  b.box(X0 + 6, G + 8, Z0 + 5, X0 + 12, G + 12, Z0 + 6, P.screen);
  lamp(c, (X0 + X1) >> 1, G + 29, (Z0 + Z1) >> 1, true, 9, 3, false);
  // barrier boom
  b.box(1350, G, 2470, 1356, G + 12, 2476, P.concreteMid);
  b.box(1250, G + 9, 2472, 1350, G + 11, 2474, (x) => (((x >> 3) & 1) ? P.plasticRed : P.plasticWhite));
  b.box(1352, G + 12, 2472, 1354, G + 14, 2474, P.lampRed);
  // gate pillars
  for (const x of [1222, 1348]) b.box(x, G, 2476, x + 10, G + 34, 2486, weathered(P.brick, P.brickDark, G, 4));
}

// ============================================================================ construction site + tower crane
export function buildConstruction(c: Ctx): void {
  const { b, G } = c;
  const xs = [720, 790, 860, 930, 1000], zs = [1820, 1890, 1960, 2030];
  const FH = 34;
  // columns (3 levels, the third partially)
  for (const x of xs) for (const z of zs) {
    const levels = x > 900 && z > 1900 ? 2 : 3;
    column(c, x, z, G, G + levels * FH, 4, P.concrete);
    // rebar sticking out of the top
    for (const [dx, dz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) b.box(x + dx, G + levels * FH, z + dz, x + dx + 1, G + levels * FH + 8, z + dz + 1, P.rust);
  }
  // slabs
  for (let f = 1; f <= 3; f++) {
    const y = G + f * FH;
    const x1 = f === 3 ? 930 : 1004, z1 = f === 3 ? 1960 : 2034;
    b.box(720, y - 2, 1820, x1, y, z1, (x, yy, z) => (f === 3 && (x + z) % 9 === 0 ? P.concreteStain : P.concrete));
    // beams under slabs
    for (const z of zs) if (z <= z1) b.box(720, y - 5, z, x1, y - 2, z + 4, P.concrete);
    if (f < 3) b.clear(940, y - 5, 1830, 990, y, 1880); // stair void
  }
  stairs(c, 'x', 1, 942, G, 1832, 14, 17, P.concreteMid, 2, 3);
  stairs(c, 'x', 1, 942, G + FH, 1852, 14, 17, P.concreteMid, 2, 3);
  // brick infill on part of the ground floor
  b.box(720, G, 1820, 860, G + 30, 1823, (x, y, z) => (y > G + 22 && x > 790 ? -1 : P.brick));
  b.box(720, G, 1820, 723, G + 30, 1960, P.brick);
  // scaffolding along the south face
  const sz0 = 2042, sz1 = 2060;
  for (let x = 716; x <= 1008; x += 20) for (const z of [sz0, sz1]) b.box(x, G, z, x + 1, G + 3 * FH + 10, z + 1, P.galv);
  for (let y = G + 20; y < G + 3 * FH + 10; y += 20) {
    b.box(716, y, sz0, 1009, y + 1, sz0 + 1, P.galv);
    b.box(716, y, sz1, 1009, y + 1, sz1 + 1, P.galv);
    b.box(716, y, sz0, 1009, y + 1, sz1 + 1, (x) => (x % 20 === 0 ? P.galv : -1));
    b.box(716, y + 1, sz0 + 1, 1009, y + 2, sz1, (x) => (x % 20 === 10 ? -1 : P.plank + ((x >> 2) % 3)));
  }
  for (let x = 716; x < 1000; x += 40) b.line(x, G, sz1, x + 20, G + 20, sz1, 1, P.galv);
  // tower crane
  towerCrane(c, 1060, 1870);
  // material piles
  c.props.push({ kind: 'bricks', x: 1020, y: G, z: 2080, rot: 0 });
  c.props.push({ kind: 'bricks', x: 1032, y: G, z: 2080, rot: 0 });
  c.props.push({ kind: 'bricks', x: 1020, y: G, z: 2092, rot: 1 });
  c.props.push({ kind: 'plankStack', x: 760, y: G, z: 2080, rot: 0 });
  c.props.push({ kind: 'pipeStack', x: 820, y: G, z: 2100, rot: 0 });
  c.props.push({ kind: 'spool', x: 900, y: G, z: 2090, rot: 0 });
  for (let k = 0; k < 6; k++) c.props.push({ kind: 'sandbag', x: 950 + (k % 3) * 7, y: G + ((k / 3) | 0) * 2, z: 2110, rot: 0 });
  c.props.push({ kind: 'excavator', x: 760, y: G, z: 1720, rot: 0 });
  for (let k = 0; k < 5; k++) c.props.push({ kind: 'cone', x: 1060 + k * 12, y: G, z: 1990, rot: 0 });
  c.props.push({ kind: 'generator', x: 980, y: G, z: 2150, rot: 0 });
}

function towerCrane(c: Ctx, x: number, z: number): void {
  const b = c.b, G = c.G;
  const H = 420, S = 18;
  const yel: number = P.paintYellow;
  b.box(x - 10, G, z - 10, x + S + 10, G + 10, z + S + 10, P.concreteMid);
  for (const [dx, dz] of [[0, 0], [S - 2, 0], [0, S - 2], [S - 2, S - 2]]) b.box(x + dx, G + 10, z + dz, x + dx + 2, G + H, z + dz + 2, yel);
  for (let y = G + 10; y < G + H - 18; y += 18) {
    b.line(x, y, z, x + S - 1, y + 18, z, 1, yel); b.line(x, y, z + S - 1, x + S - 1, y + 18, z + S - 1, 1, yel);
    b.line(x, y + 18, z, x, y, z + S - 1, 1, yel); b.line(x + S - 1, y + 18, z, x + S - 1, y, z + S - 1, 1, yel);
    b.box(x, y, z, x + S, y + 1, z + 1, yel); b.box(x, y, z + S - 1, x + S, y + 1, z + S, yel);
    b.box(x, y, z, x + 1, y + 1, z + S, yel); b.box(x + S - 1, y, z, x + S, y + 1, z + S, yel);
  }
  // slewing unit + cab
  const top = G + H;
  b.box(x - 2, top, z - 2, x + S + 2, top + 8, z + S + 2, P.steelDark);
  b.box(x + S + 2, top - 6, z - 2, x + S + 14, top + 8, z + 10, yel);
  b.box(x + S + 13, top - 4, z - 1, x + S + 14, top + 6, z + 9, P.glassDark);
  // jib (west, towards the building) and counter-jib (east)
  const jy = top + 8, jl = 380;
  const zc = z + S / 2;
  b.box(x - jl, jy, zc - 5, x + S, jy + 2, zc - 3, yel);
  b.box(x - jl, jy, zc + 3, x + S, jy + 2, zc + 5, yel);
  b.box(x - jl, jy + 12, zc - 1, x + S, jy + 14, zc + 1, yel);
  for (let a = x + S; a > x - jl; a -= 14) {
    b.line(a, jy, zc - 4, a - 7, jy + 13, zc, 1, yel); b.line(a - 7, jy + 13, zc, a - 14, jy, zc - 4, 1, yel);
    b.line(a, jy, zc + 4, a - 7, jy + 13, zc, 1, yel); b.line(a - 7, jy + 13, zc, a - 14, jy, zc + 4, 1, yel);
  }
  // tower head + pendants
  b.box(x + 6, jy, z + 6, x + 12, jy + 40, z + 12, yel);
  b.line(x + 9, jy + 40, zc, x - 200, jy + 14, zc, 1, P.steelDark);
  b.line(x + 9, jy + 40, zc, x + S + 110, jy + 14, zc, 1, P.steelDark);
  // counter jib + counterweights
  b.box(x + S, jy, zc - 5, x + S + 120, jy + 3, zc + 5, yel);
  b.box(x + S + 80, jy - 24, zc - 6, x + S + 118, jy, zc + 6, P.concreteDark);
  // trolley + hook + hanging load (beams bundle)
  const tx = x - 220;
  b.box(tx - 6, jy - 4, zc - 6, tx + 6, jy, zc + 6, P.steelDark);
  b.box(tx - 1, G + 160, zc - 1, tx, jy - 4, zc, P.steelDark);
  b.box(tx + 1, G + 160, zc, tx + 2, jy - 4, zc + 1, P.steelDark);
  b.box(tx - 4, G + 150, zc - 3, tx + 5, G + 160, zc + 3, hazard());
  b.line(tx, G + 150, zc, tx - 30, G + 128, zc, 1, P.steelDark);
  b.line(tx, G + 150, zc, tx + 30, G + 128, zc, 1, P.steelDark);
  b.box(tx - 40, G + 122, zc - 4, tx + 40, G + 128, zc + 4, P.rust);
  // aircraft warning lights
  b.box(x - jl, jy + 2, zc - 1, x - jl + 2, jy + 4, zc + 1, P.lampRed);
  c.lamps.push({ x: x - jl + 1, y: jy + 3, z: zc, r: 4, g: 0.3, b: 0.2, radius: 8 });
  void Builder;
}
