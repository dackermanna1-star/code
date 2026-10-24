// Voxel models for dynamic props (vehicles, containers, barrels, gas cylinders, crates, furniture...).
// Every model is built in its own grid: x = length, y = up, z = width.

import { Grid, Builder } from './builder';
import { P } from '../world/materials';
import { Rng } from '../engine/math';

export type PropKind = 'car' | 'van' | 'truck' | 'forklift' | 'container' | 'barrel' | 'barrelFuel' | 'gas' | 'propane' | 'ibc' | 'pallet'
  | 'palletBoxes' | 'crate' | 'dumpster' | 'desk' | 'chair' | 'cabinet' | 'computer' | 'spool' | 'cone' | 'workbench' | 'toolchest'
  | 'excavator' | 'generator' | 'tireStack' | 'bricks' | 'pipeStack' | 'plankStack' | 'locker' | 'shelf' | 'sandbag'
  | 'tankWagon' | 'boxcar';

const CAR_COLORS = [P.carRed, P.carBlue, P.carWhite, P.carBlack, P.carSilver, P.carGreen, P.carYellow];
const CONT_COLORS = [P.contRed, P.contBlue, P.contGreen, P.contOrange, P.contGrey, P.contMaroon, P.contWhite];

function wheel(b: Builder, cx: number, cy: number, z0: number, z1: number, r: number): void {
  b.cylZ(cx, cy, r, z0, z1, P.rubber);
  b.cylZ(cx, cy, r * 0.45, z0, z1, P.steel);
}

export function makeProp(kind: PropKind, rng: Rng): Grid {
  switch (kind) {
    case 'car': {
      const g = new Grid(44, 15, 18), b = new Builder(g);
      const col = rng.pick(CAR_COLORS);
      // lower body
      b.box(1, 3, 1, 43, 8, 17, col);
      b.box(0, 3, 2, 1, 6, 16, P.plasticBlack); b.box(43, 3, 2, 44, 6, 16, P.plasticBlack); // bumpers
      // hollow interior
      b.box(3, 4, 2, 41, 8, 16, (x, y, z) => (y === 4 ? P.carpet : -1));
      g.vox.fill(0, 0, 0); // no-op keep type
      for (let y = 5; y < 8; y++) for (let z = 2; z < 16; z++) for (let x = 3; x < 41; x++) g.set(x, y, z, 0);
      // cabin
      for (let y = 8; y < 14; y++) {
        const t = y - 8;
        const x0 = 11 + Math.round(t * 0.9), x1 = 33 - Math.round(t * 0.6);
        for (let z = 2; z < 16; z++) for (let x = x0; x <= x1; x++) {
          const edge = x === x0 || x === x1 || z === 2 || z === 15 || y === 13;
          if (!edge) continue;
          const pillar = x === x0 || x === x1 || (x >= 21 && x <= 22) || y === 13;
          g.set(x, y, z, y === 13 ? col : pillar && (z === 2 || z === 15 || x === x0 || x === x1) && (x === x0 || x === x1 || (x >= 21 && x <= 22)) ? col : P.glassDark);
        }
      }
      // seats
      b.box(14, 5, 3, 17, 10, 8, P.seat); b.box(14, 5, 10, 17, 10, 15, P.seat); b.box(25, 5, 3, 28, 10, 15, P.seat);
      // lights
      b.box(43, 6, 2, 44, 7, 5, P.lampWarm); b.box(43, 6, 13, 44, 7, 16, P.lampWarm);
      b.box(0, 6, 2, 1, 7, 4, P.lampRed); b.box(0, 6, 14, 1, 7, 16, P.lampRed);
      // wheels (cut arches first)
      for (const wx of [9, 35]) {
        for (let y = 0; y < 7; y++) for (let x = wx - 4; x <= wx + 4; x++) { for (let z = 1; z < 4; z++) g.set(x, y, z, 0); for (let z = 14; z < 17; z++) g.set(x, y, z, 0); }
        wheel(b, wx, 3.4, 1, 4, 3.4); wheel(b, wx, 3.4, 14, 17, 3.4);
      }
      return g;
    }
    case 'van': {
      const g = new Grid(50, 21, 19), b = new Builder(g);
      const col = rng.pick([P.carWhite, P.carSilver, P.carBlue, P.truckOrange]);
      b.box(1, 3, 1, 49, 20, 18, col);
      for (let y = 4; y < 19; y++) for (let z = 2; z < 17; z++) for (let x = 2; x < 48; x++) g.set(x, y, z, 0);
      b.box(2, 3, 2, 48, 4, 17, P.plywood);
      // windshield and side windows at the front
      for (let y = 11; y < 18; y++) { for (let z = 2; z < 17; z++) g.set(48, y, z, P.glassDark); for (let x = 38; x < 47; x++) { g.set(x, y, 1, P.glassDark); g.set(x, y, 17, P.glassDark); } }
      b.box(40, 4, 3, 44, 10, 8, P.seat); b.box(40, 4, 11, 44, 10, 16, P.seat);
      b.box(49, 6, 2, 50, 8, 5, P.lampWarm); b.box(49, 6, 14, 50, 8, 17, P.lampWarm);
      b.box(0, 6, 2, 1, 9, 4, P.lampRed); b.box(0, 6, 15, 1, 9, 17, P.lampRed);
      b.box(49, 3, 2, 50, 6, 17, P.plasticBlack); b.box(0, 3, 2, 1, 5, 17, P.plasticBlack);
      for (const wx of [10, 40]) {
        for (let y = 0; y < 7; y++) for (let x = wx - 4; x <= wx + 4; x++) { for (let z = 1; z < 4; z++) g.set(x, y, z, 0); for (let z = 15; z < 18; z++) g.set(x, y, z, 0); }
        wheel(b, wx, 3.5, 1, 4, 3.5); wheel(b, wx, 3.5, 15, 18, 3.5);
      }
      return g;
    }
    case 'truck': {
      const g = new Grid(100, 38, 25), b = new Builder(g);
      const col = rng.pick([P.carRed, P.carBlue, P.truckOrange, P.carWhite, P.carGreen]);
      // chassis
      b.box(4, 5, 4, 98, 8, 21, P.steelDark);
      // cab (front at +x)
      b.box(78, 8, 1, 99, 31, 24, col);
      for (let y = 9; y < 30; y++) for (let z = 2; z < 23; z++) for (let x = 79; x < 98; x++) g.set(x, y, z, 0);
      for (let y = 19; y < 29; y++) for (let z = 3; z < 22; z++) g.set(98, y, z, P.glassDark);
      for (let y = 19; y < 28; y++) for (let x = 85; x < 96; x++) { g.set(x, y, 1, P.glassDark); g.set(x, y, 23, P.glassDark); }
      b.box(84, 9, 3, 90, 17, 11, P.seat); b.box(84, 9, 14, 90, 17, 22, P.seat);
      b.box(95, 14, 4, 97, 18, 21, P.plasticBlack); // dashboard
      b.box(99, 9, 2, 100, 14, 23, P.steelDark); // grille
      b.box(99, 11, 2, 100, 13, 6, P.lampWarm); b.box(99, 11, 19, 100, 13, 23, P.lampWarm);
      b.box(99, 6, 1, 100, 9, 24, P.paintBlack); // bumper
      // cargo box
      b.box(2, 8, 1, 77, 37, 24, P.sheetWhite);
      for (let y = 9; y < 36; y++) for (let z = 2; z < 23; z++) for (let x = 3; x < 76; x++) g.set(x, y, z, 0);
      b.box(3, 9, 2, 76, 10, 23, P.plywood);
      b.box(0, 8, 1, 2, 37, 24, P.steelDark); // rear doors
      b.box(0, 10, 2, 1, 12, 5, P.lampRed); b.box(0, 10, 20, 1, 12, 23, P.lampRed);
      // fuel tank
      b.cylX(9, 0.5, 2.5, 60, 72, P.alu);
      for (const wx of [14, 26, 88]) {
        for (let y = 0; y < 9; y++) for (let x = wx - 6; x <= wx + 6; x++) { for (let z = 1; z < 5; z++) g.set(x, y, z, 0); for (let z = 20; z < 24; z++) g.set(x, y, z, 0); }
        wheel(b, wx, 5, 1, 5, 5); wheel(b, wx, 5, 20, 24, 5);
      }
      return g;
    }
    case 'forklift': {
      const g = new Grid(30, 24, 13), b = new Builder(g);
      b.box(4, 3, 1, 22, 10, 12, P.machineYellow);
      b.box(0, 3, 2, 6, 12, 11, P.castIron); // counterweight
      // overhead guard
      for (const [x, z] of [[7, 1], [7, 11], [19, 1], [19, 11]]) b.box(x, 10, z, x + 1, 22, z + 1, P.paintBlack);
      b.box(7, 21, 1, 20, 22, 12, P.paintBlack);
      b.box(9, 10, 4, 13, 14, 9, P.seat); b.box(9, 14, 4, 10, 18, 9, P.seat);
      b.box(16, 10, 5, 17, 15, 8, P.paintBlack); // steering column
      // mast + forks
      b.box(23, 3, 2, 25, 24, 4, P.steelDark); b.box(23, 3, 9, 25, 24, 11, P.steelDark);
      b.box(23, 5, 2, 25, 7, 11, P.steelDark);
      b.box(25, 1, 3, 30, 2, 5, P.steelDark); b.box(25, 1, 8, 30, 2, 10, P.steelDark);
      b.box(25, 1, 3, 26, 8, 10, P.steelDark);
      wheel(b, 7, 3, 0, 3, 3); wheel(b, 7, 3, 10, 13, 3); wheel(b, 19, 3.5, 0, 3, 3.5); wheel(b, 19, 3.5, 10, 13, 3.5);
      b.box(20, 10, 2, 21, 11, 3, P.lampOrange);
      return g;
    }
    case 'container': {
      const g = new Grid(61, 26, 24), b = new Builder(g);
      const col = rng.pick(CONT_COLORS);
      const c2 = col + 1;
      b.box(0, 0, 0, 61, 26, 24, (x, y, z) => ((x + (y >> 2)) % 3 === 0 ? c2 : col));
      for (let y = 1; y < 25; y++) for (let z = 1; z < 23; z++) for (let x = 1; x < 60; x++) g.set(x, y, z, 0);
      b.box(1, 0, 1, 60, 1, 23, P.plywood);
      // corner posts / rails
      for (const [x, z] of [[0, 0], [59, 0], [0, 22], [59, 22]]) b.box(x, 0, z, x + 2, 26, z + 2, P.steelDark);
      b.box(0, 0, 0, 61, 1, 2, P.steelDark); b.box(0, 0, 22, 61, 1, 24, P.steelDark);
      b.box(0, 25, 0, 61, 26, 2, P.steelDark); b.box(0, 25, 22, 61, 26, 24, P.steelDark);
      // door bars at x = 60
      for (const z of [5, 10, 14, 19]) b.box(60, 1, z, 61, 25, z + 1, P.steelDark);
      return g;
    }
    case 'barrel': case 'barrelFuel': {
      const g = new Grid(6, 9, 6), b = new Builder(g);
      const col = kind === 'barrelFuel' ? P.fuelRed : rng.pick([P.plasticBlue, P.paintGreen, P.rust, P.paintBlack, P.plasticBlue]);
      b.cylY(3, 3, 3, 0, 9, (x, y, z) => (y === 0 || y === 4 || y === 8 ? (kind === 'barrelFuel' ? P.fuelRed : P.steelDark) : col));
      return g;
    }
    case 'gas': {
      const g = new Grid(2, 15, 2), b = new Builder(g);
      const col = rng.pick([P.gasRed, P.gasBlue, P.gasYellow, P.gasRed]);
      b.box(0, 0, 0, 2, 13, 2, col);
      b.box(0, 13, 0, 2, 14, 2, P.gasWhite);
      g.set(0, 14, 0, P.copper);
      return g;
    }
    case 'propane': {
      const g = new Grid(26, 15, 13), b = new Builder(g);
      b.cylX(8.5, 6.5, 6.2, 1, 25, P.propane);
      b.box(4, 0, 2, 6, 4, 11, P.steelDark); b.box(20, 0, 2, 22, 4, 11, P.steelDark);
      b.box(12, 14, 5, 14, 15, 8, P.steelDark);
      return g;
    }
    case 'ibc': {
      const g = new Grid(12, 12, 10), b = new Builder(g);
      b.box(0, 0, 0, 12, 1, 10, P.pallet);
      b.box(1, 1, 1, 11, 11, 9, P.ibcWhite);
      for (let y = 1; y < 12; y += 3) { b.box(0, y, 0, 12, y + 1, 1, P.grate); b.box(0, y, 9, 12, y + 1, 10, P.grate); b.box(0, y, 0, 1, y + 1, 10, P.grate); b.box(11, y, 0, 12, y + 1, 10, P.grate); }
      for (const x of [0, 4, 8, 11]) { b.box(x, 1, 0, x + 1, 12, 1, P.grate); b.box(x, 1, 9, x + 1, 12, 10, P.grate); }
      return g;
    }
    case 'pallet': {
      const g = new Grid(12, 2, 10), b = new Builder(g);
      for (const z of [0, 4, 9]) b.box(0, 0, z, 12, 1, z + 1, P.pallet + 1);
      for (let x = 0; x < 12; x += 2) b.box(x, 1, 0, x + 1, 2, 10, P.pallet);
      return g;
    }
    case 'palletBoxes': {
      const h = rng.int(6, 12);
      const g = new Grid(12, 2 + h, 10), b = new Builder(g);
      for (const z of [0, 4, 9]) b.box(0, 0, z, 12, 1, z + 1, P.pallet + 1);
      for (let x = 0; x < 12; x += 2) b.box(x, 1, 0, x + 1, 2, 10, P.pallet);
      b.box(0, 2, 0, 12, 2 + h, 10, (x, y, z) => ((((x / 4) | 0) + ((z / 5) | 0) + (((y - 2) / 4) | 0)) % 2 ? P.cardboard : P.cardboard + 1));
      // plastic wrap edges
      return g;
    }
    case 'crate': {
      const s = rng.int(7, 11);
      const g = new Grid(s, s, s), b = new Builder(g);
      b.box(0, 0, 0, s, s, s, (x, y, z) => {
        const ex = x === 0 || x === s - 1, ey = y === 0 || y === s - 1, ez = z === 0 || z === s - 1;
        return (ex && ey) || (ey && ez) || (ex && ez) ? P.woodDark : P.crate + ((y >> 1) & 1);
      });
      for (let y = 1; y < s - 1; y++) for (let z = 1; z < s - 1; z++) for (let x = 1; x < s - 1; x++) g.set(x, y, z, 0);
      return g;
    }
    case 'dumpster': {
      const g = new Grid(20, 13, 14), b = new Builder(g);
      const col = rng.pick([P.paintGreen, P.paintBlue, P.paintDarkGreen, P.rust]);
      b.box(0, 1, 0, 20, 12, 14, col);
      for (let y = 2; y < 12; y++) for (let z = 1; z < 13; z++) for (let x = 1; x < 19; x++) g.set(x, y, z, 0);
      b.box(0, 12, 0, 20, 13, 14, P.plasticBlack);
      for (const [x, z] of [[1, 1], [17, 1], [1, 11], [17, 11]]) b.box(x, 0, z, x + 2, 1, z + 2, P.rubber);
      // some trash inside
      b.box(2, 2, 2, 18, 5, 12, (x, y, z) => ((x * 7 + z * 3 + y) % 5 === 0 ? P.cardboard : (x + z) % 7 === 0 ? P.plasticBlack : -1));
      return g;
    }
    case 'desk': {
      const g = new Grid(16, 8, 8), b = new Builder(g);
      b.box(0, 7, 0, 16, 8, 8, P.plywood);
      for (const [x, z] of [[0, 0], [15, 0], [0, 7], [15, 7]]) b.box(x, 0, z, x + 1, 7, z + 1, P.steelDark);
      b.box(10, 2, 0, 16, 7, 8, P.paintGreyBlue);
      return g;
    }
    case 'chair': {
      const g = new Grid(5, 10, 5), b = new Builder(g);
      b.box(0, 4, 0, 5, 5, 5, P.seat);
      b.box(0, 5, 4, 5, 10, 5, P.seat);
      b.box(2, 1, 2, 3, 4, 3, P.steelDark);
      b.box(0, 0, 2, 5, 1, 3, P.plasticBlack); b.box(2, 0, 0, 3, 1, 5, P.plasticBlack);
      return g;
    }
    case 'cabinet': {
      const g = new Grid(5, 13, 6), b = new Builder(g);
      b.box(0, 0, 0, 5, 13, 6, P.paintGreyBlue);
      for (const y of [3, 6, 9, 12]) b.box(0, y, 5, 5, y + 1, 6, P.steelDark);
      return g;
    }
    case 'computer': {
      const g = new Grid(5, 5, 3), b = new Builder(g);
      b.box(0, 1, 1, 5, 5, 2, P.plasticBlack);
      b.box(1, 2, 2, 4, 4, 3, P.screen);
      b.box(2, 0, 0, 3, 1, 3, P.plasticBlack);
      return g;
    }
    case 'spool': {
      const g = new Grid(12, 12, 8), b = new Builder(g);
      b.cylZ(6, 6, 6, 0, 1, P.plywood); b.cylZ(6, 6, 6, 7, 8, P.plywood);
      b.cylZ(6, 6, 4.2, 1, 7, P.rubber);
      return g;
    }
    case 'cone': {
      const g = new Grid(4, 7, 4), b = new Builder(g);
      b.box(0, 0, 0, 4, 1, 4, P.plasticBlack);
      b.box(1, 1, 1, 3, 7, 3, (x, y, z) => (y === 3 || y === 4 ? P.plasticWhite : P.plasticOrange));
      return g;
    }
    case 'workbench': {
      const g = new Grid(20, 10, 7), b = new Builder(g);
      b.box(0, 8, 0, 20, 9, 7, P.woodDark);
      for (const [x, z] of [[0, 0], [19, 0], [0, 6], [19, 6]]) b.box(x, 0, z, x + 1, 8, z + 1, P.steelDark);
      b.box(1, 2, 0, 19, 3, 7, P.steelDark);
      b.box(16, 9, 1, 19, 10, 3, P.castIron); // vise
      b.box(3, 9, 2, 6, 10, 4, P.paintRed);    // toolbox
      return g;
    }
    case 'toolchest': {
      const g = new Grid(7, 10, 5), b = new Builder(g);
      b.box(0, 1, 0, 7, 10, 5, P.paintRed);
      for (const y of [3, 5, 7, 9]) b.box(0, y, 4, 7, y + 1, 5, P.steelDark);
      b.box(0, 0, 0, 1, 1, 1, P.rubber); b.box(6, 0, 0, 7, 1, 1, P.rubber); b.box(0, 0, 4, 1, 1, 5, P.rubber); b.box(6, 0, 4, 7, 1, 5, P.rubber);
      return g;
    }
    case 'excavator': {
      const g = new Grid(64, 40, 30), b = new Builder(g);
      // tracks
      for (const z of [0, 22]) { b.box(4, 0, z, 44, 7, z + 8, P.castIron); for (let x = 4; x < 44; x += 3) b.box(x, 7, z, x + 1, 8, z + 8, P.steelDark); }
      b.box(10, 7, 6, 38, 10, 24, P.steelDark);
      // house
      b.box(6, 10, 2, 40, 22, 28, P.machineYellow);
      b.box(0, 10, 4, 8, 20, 26, P.castIron);
      // cab
      b.box(26, 22, 18, 38, 35, 28, P.machineYellow);
      for (let y = 24; y < 34; y++) { for (let z = 19; z < 27; z++) g.set(37, y, z, P.glassDark); for (let x = 28; x < 36; x++) g.set(x, y, 27, P.glassDark); }
      // boom and arm
      b.line(36, 18, 12, 52, 36, 12, 4, P.machineYellow);
      b.line(52, 36, 12, 60, 14, 12, 3, P.machineYellow);
      b.box(56, 4, 7, 64, 14, 18, P.steelDark); // bucket
      return g;
    }
    case 'generator': {
      const g = new Grid(22, 14, 11), b = new Builder(g);
      b.box(0, 3, 0, 22, 14, 11, P.paintGreen);
      b.box(1, 4, 11, 21, 13, 11, P.grate);
      b.box(16, 14, 4, 18, 16, 6, P.steelDark);
      wheel(b, 4, 2, 0, 2, 2); wheel(b, 4, 2, 9, 11, 2); wheel(b, 18, 2, 0, 2, 2); wheel(b, 18, 2, 9, 11, 2);
      return g;
    }
    case 'tireStack': {
      const n = rng.int(2, 5);
      const g = new Grid(9, n * 3, 9), b = new Builder(g);
      for (let i = 0; i < n; i++) b.cylY(4.5, 4.5, 4.5, i * 3, i * 3 + 3, P.rubber, 1.6);
      return g;
    }
    case 'bricks': {
      const g = new Grid(10, 7, 8), b = new Builder(g);
      b.box(0, 0, 0, 10, 1, 8, P.pallet);
      b.box(0, 1, 0, 10, 7, 8, P.brick);
      return g;
    }
    case 'pipeStack': {
      const g = new Grid(40, 8, 10), b = new Builder(g);
      for (let i = 0; i < 3; i++) b.cylX(2, 1.5 + i * 3.4, 1.7, 0, 40, P.rust, 0.7);
      for (let i = 0; i < 2; i++) b.cylX(5, 3.2 + i * 3.4, 1.7, 0, 40, P.rust, 0.7);
      return g;
    }
    case 'plankStack': {
      const g = new Grid(36, 6, 10), b = new Builder(g);
      b.box(0, 0, 0, 36, 6, 10, (x, y, z) => (y % 2 === 1 && (z === 4 || z === 5) ? -1 : P.plank + ((y + (z >> 1)) % 3)));
      return g;
    }
    case 'locker': {
      const g = new Grid(4, 18, 5), b = new Builder(g);
      b.box(0, 0, 0, 4, 18, 5, P.paintGreyBlue);
      b.box(0, 14, 4, 4, 16, 5, P.grate);
      return g;
    }
    case 'shelf': {
      const g = new Grid(20, 20, 6), b = new Builder(g);
      for (const x of [0, 19]) for (const z of [0, 5]) b.box(x, 0, z, x + 1, 20, z + 1, P.paintOrange);
      for (const y of [0, 6, 12, 18]) b.box(0, y, 0, 20, y + 1, 6, P.grate);
      for (const y of [1, 7, 13]) b.box(1, y, 1, 19, y + 4, 5, (x, yy, z) => ((x % 5) === 0 ? -1 : (x + yy) % 3 ? P.cardboard : P.cardboard + 1));
      return g;
    }
    case 'tankWagon': {
      const g = new Grid(120, 34, 28), b = new Builder(g);
      // bogies
      for (const bx of [18, 102]) {
        b.box(bx - 14, 4, 3, bx + 14, 8, 25, P.castIron);
        for (const wx of [bx - 8, bx + 8]) { b.cylZ(wx, 4, 4, 3, 6, P.steelDark); b.cylZ(wx, 4, 4, 22, 25, P.steelDark); }
      }
      b.box(2, 8, 4, 118, 11, 24, P.steelDark);       // underframe
      b.box(0, 9, 8, 2, 11, 20, P.paintBlack); b.box(118, 9, 8, 120, 11, 20, P.paintBlack); // buffers
      b.cylX(21, 14, 12.5, 6, 114, (x, y, z) => (Math.abs(x - 60) < 2 ? P.steelDark : P.fuelTank), 1, true);
      b.box(56, 33, 11, 64, 34, 17, P.steelDark);        // dome
      b.box(4, 11, 3, 116, 12, 4, P.paintBlack);
      return g;
    }
    case 'boxcar': {
      const g = new Grid(120, 38, 28), b = new Builder(g);
      for (const bx of [18, 102]) {
        b.box(bx - 14, 4, 3, bx + 14, 8, 25, P.castIron);
        for (const wx of [bx - 8, bx + 8]) { b.cylZ(wx, 4, 4, 3, 6, P.steelDark); b.cylZ(wx, 4, 4, 22, 25, P.steelDark); }
      }
      b.box(2, 8, 2, 118, 11, 26, P.steelDark);
      const col = rng.pick([P.sheetRust, P.contMaroon, P.contBlue, P.contGreen]);
      b.box(2, 11, 1, 118, 37, 27, (x, y) => (x % 12 === 0 ? col + 1 : col));
      for (let y = 12; y < 36; y++) for (let z = 2; z < 26; z++) for (let x = 3; x < 117; x++) g.set(x, y, z, 0);
      b.box(48, 12, 0, 72, 34, 1, P.steelDark); // sliding door
      b.box(0, 9, 8, 2, 11, 20, P.paintBlack); b.box(118, 9, 8, 120, 11, 20, P.paintBlack);
      return g;
    }
    case 'sandbag': {
      const g = new Grid(6, 2, 4), b = new Builder(g);
      b.box(0, 0, 0, 6, 2, 4, P.tarpGreen);
      return g;
    }
  }
}
