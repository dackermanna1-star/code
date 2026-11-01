// Low-poly builders for every furniture type. Each builder draws in the piece's local frame
// (x = width, z = front, y = up) through a GeoBatch whose frame is set to the instance.
import { BABYLON } from './babylon.js';
import { RNG } from '../core/random.js';

const COL = {
  steel: [0.78, 0.8, 0.82], dark: [0.25, 0.26, 0.28], black: [0.1, 0.1, 0.11], white: [0.95, 0.95, 0.92],
  blue: [0.25, 0.38, 0.6], navy: [0.17, 0.22, 0.36], red: [0.72, 0.17, 0.13], orange: [0.9, 0.46, 0.13],
  green: [0.24, 0.45, 0.3], felt: [0.12, 0.42, 0.22], yellow: [0.93, 0.75, 0.18], tan: [0.78, 0.66, 0.46],
  brown: [0.45, 0.3, 0.18], teal: [0.2, 0.52, 0.5], cream: [0.92, 0.88, 0.76], pink: [0.85, 0.5, 0.55], gray: [0.55, 0.57, 0.58],
};
const BOOK_COLS = [[0.62, 0.15, 0.12], [0.15, 0.3, 0.55], [0.2, 0.45, 0.25], [0.75, 0.6, 0.2], [0.4, 0.2, 0.45], [0.85, 0.85, 0.8], [0.25, 0.25, 0.25], [0.7, 0.35, 0.15]];

function stool(b, x, z, h = 0.45, col = COL.steel) {
  b.cyl('steel', x, 0, z, 0.05, h - 0.04, { segs: 6, color: col });
  b.cyl('steel', x, h - 0.05, z, 0.19, 0.05, { segs: 10, color: col });
  b.cyl('steel', x, 0, z, 0.16, 0.03, { segs: 8, color: COL.dark });
}
function chair(b, x, z, yaw, col = COL.orange, mat = 'plastic') {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  // Seat facing `yaw`; back on the opposite side.
  b.box(mat, x, 0.44, z, 0.44, 0.05, 0.44, { yaw, color: col });
  b.box(mat, x - s * 0.21, 0.72, z - c * 0.21, 0.44, 0.5, 0.05, { yaw, color: col });
  for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
    const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
    b.cyl('steel', wx, 0, wz, 0.018, 0.42, { segs: 4, color: COL.gray });
  }
}
function legs4(b, w, d, h, inset = 0.06, r = 0.03, col = COL.gray) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.cyl('steel', sx * (w / 2 - inset), 0, sz * (d / 2 - inset), r, h, { segs: 5, color: col });
}
function books(b, x0, x1, y, z, depth, rng, max = 1) {
  let x = x0;
  while (x < x1 - 0.04) {
    const w = rng.range(0.03, 0.07), h = rng.range(0.2, 0.3) * max;
    if (rng.chance(0.08)) { x += w * 2; continue; }
    b.box('paint', x + w / 2, y + h / 2, z, w, h, depth * rng.range(0.8, 1), { color: rng.pick(BOOK_COLS), yaw: rng.chance(0.06) ? 0.2 : 0 });
    x += w + 0.004;
  }
}

const B = {};
B.bunk = (b, f) => {
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box('steel', sx * 0.44, 0.95, sz * 0.98, 0.05, 1.9, 0.05, { color: [0.5, 0.55, 0.6] });
  for (const y of [0.42, 1.38]) {
    b.box('steel', 0, y, 0, 0.92, 0.06, 2.0, { color: [0.5, 0.55, 0.6] });
    b.box('mattress', 0, y + 0.1, 0, 0.84, 0.14, 1.92);
    b.box('fabric', 0, y + 0.2, -0.78, 0.55, 0.1, 0.32, { color: COL.white });
    const blanket = new RNG(f.index * 13 + y * 7).pick([[0.35, 0.4, 0.3], [0.5, 0.25, 0.2], [0.3, 0.35, 0.5], [0.55, 0.5, 0.35]]);
    b.box('fabric', 0, y + 0.18, 0.35, 0.88, 0.04, 1.2, { color: blanket });
  }
  for (let i = 0; i < 4; i++) b.box('steel', 0.46, 0.6 + i * 0.27, 0.85, 0.04, 0.03, 0.3, { color: [0.5, 0.55, 0.6] });
};
B.cot = (b) => { b.box('steel', 0, 0.2, 0, 0.78, 0.4, 1.88, { color: COL.dark }); b.box('mattress', 0, 0.44, 0, 0.72, 0.08, 1.8, { color: [0.75, 0.75, 0.7] }); };
B.toilet = (b) => {
  b.box('steel', 0, 0.2, -0.05, 0.36, 0.4, 0.5);
  b.cyl('steel', 0, 0.38, 0.05, 0.2, 0.05, { segs: 10 });
  b.box('steel', 0, 0.6, -0.25, 0.46, 0.45, 0.14);
  b.box('paint', 0, 0.4, 0.05, 0.28, 0.02, 0.28, { color: [0.2, 0.25, 0.3] });
};
B.sink = (b) => { b.box('steel', 0, 0.85, 0.05, 0.5, 0.16, 0.36); b.box('steel', 0, 0.55, -0.12, 0.08, 0.6, 0.08); b.box('steel', 0, 1.0, -0.12, 0.05, 0.12, 0.05); b.box('glass', 0, 1.5, -0.17, 0.4, 0.5, 0.02); };
B.desk = (b) => { b.box('steel', 0, 0.75, 0, 1.0, 0.05, 0.5, { color: [0.6, 0.62, 0.6] }); b.box('steel', -0.45, 0.37, -0.15, 0.04, 0.74, 0.04); b.box('steel', 0.45, 0.37, -0.15, 0.04, 0.74, 0.04); stool(b, 0, 0.62, 0.45); b.box('paint', 0.25, 0.79, 0, 0.18, 0.04, 0.25, { color: COL.cream }); };
B.poster = (b, f, view) => {
  const pi = Math.floor(Math.abs(f.seed || f.index)) % POSTERS.length;
  const key = `poster${pi}`;
  ensurePoster(view, key, pi);
  b.quad(key, 0, 1.75, 0.02, 0.55, 0.75, { yaw: 0 });
};
B.steelTable = (b) => {
  b.cyl('steel', 0, 0.72, 0, 0.58, 0.05, { segs: 14, color: [0.7, 0.73, 0.75] });
  b.cyl('steel', 0, 0, 0, 0.08, 0.72, { segs: 6, color: COL.gray });
  for (const [x, z] of [[0.82, 0], [-0.82, 0], [0, 0.82], [0, -0.82]]) stool(b, x, z, 0.45, [0.7, 0.73, 0.75]);
};
B.payphone = (b) => {
  b.box('steel', 0, 1.35, 0.0, 0.42, 0.7, 0.22, { color: [0.3, 0.32, 0.35] });
  b.box('paint', 0, 1.42, 0.12, 0.2, 0.25, 0.02, { color: COL.dark });
  b.box('paint', -0.16, 1.4, 0.13, 0.07, 0.3, 0.07, { color: COL.black });
  b.box('steel', 0, 1.82, 0, 0.5, 0.12, 0.3, { color: [0.75, 0.2, 0.15] });
};
B.tvWall = (b, f, view) => {
  b.box('steel', 0, 2.55, -0.05, 0.12, 0.3, 0.12, { color: COL.dark });
  b.box('paint', 0, 2.35, 0.08, 1.1, 0.68, 0.22, { color: COL.black });
  b.box('screen', 0, 2.36, 0.195, 0.98, 0.56, 0.01);
};
B.guardDesk = (b) => {
  b.box('wood', 0, 1.05, 0, 3.0, 0.06, 1.0, { color: [0.8, 0.7, 0.6] });
  b.box('paint', 0, 0.52, 0.42, 3.0, 1.04, 0.1, { color: [0.3, 0.35, 0.42] });
  b.box('paint', -1.45, 0.52, 0, 0.1, 1.04, 0.95, { color: [0.3, 0.35, 0.42] });
  b.box('paint', 1.45, 0.52, 0, 0.1, 1.04, 0.95, { color: [0.3, 0.35, 0.42] });
  b.box('paint', 0.6, 1.25, -0.2, 0.5, 0.35, 0.3, { color: COL.dark }); b.box('screen', 0.6, 1.27, -0.04, 0.42, 0.28, 0.01);
  b.box('paint', -0.6, 1.1, -0.1, 0.4, 0.04, 0.3, { color: COL.cream });
  b.box('paint', 1.2, 1.12, 0.3, 0.6, 0.1, 0.18, { color: [0.85, 0.83, 0.75] });
  chair(b, 0.2, -0.75, 0, COL.black, 'paint');
};
B.noticeBoard = (b) => {
  b.box('wood', 0, 1.5, 0.0, 2.0, 1.2, 0.05, { color: [0.6, 0.45, 0.3] });
  b.box('paint', 0, 1.5, 0.03, 1.85, 1.05, 0.02, { color: [0.72, 0.55, 0.35] });
  const rng = new RNG(4);
  for (let i = 0; i < 9; i++) b.box('paint', rng.range(-0.75, 0.75), rng.range(1.1, 1.9), 0.045, rng.range(0.18, 0.3), rng.range(0.2, 0.32), 0.005, { color: rng.pick([COL.white, COL.cream, [0.95, 0.9, 0.5], [0.7, 0.85, 0.95], [0.95, 0.75, 0.75]]), roll: rng.range(-0.15, 0.15) });
};
B.bench = (b) => { b.box('wood', 0, 0.44, 0, 2.0, 0.06, 0.42); b.box('wood', 0, 0.85, -0.2, 2.0, 0.3, 0.05); for (const x of [-0.85, 0.85]) b.box('steel', x, 0.21, 0, 0.06, 0.42, 0.38, { color: COL.gray }); };
B.benchOut = (b) => { b.box('wood', 0, 0.44, 0, 2.0, 0.06, 0.42, { color: [0.7, 0.85, 0.7] }); for (const x of [-0.85, 0.85]) b.box('steel', x, 0.21, 0, 0.06, 0.42, 0.38, { color: COL.dark }); };
B.plant = (b) => { b.cyl('paint', 0, 0, 0, 0.22, 0.42, { segs: 8, rTop: 0.26, color: [0.65, 0.35, 0.22] }); for (let i = 0; i < 5; i++) b.sphere('paint', Math.cos(i * 1.3) * 0.12, 0.7 + i * 0.12, Math.sin(i * 1.3) * 0.12, 0.2, { segs: 6, rings: 4, color: [0.25, 0.5, 0.25] }); };
B.vending = (b, f) => {
  const col = f.stock === 'drinks' ? [0.15, 0.35, 0.7] : [0.75, 0.15, 0.12];
  b.box('paint', 0, 0.97, 0, 0.95, 1.95, 0.8, { color: col });
  b.box('screen', -0.12, 1.15, 0.405, 0.6, 1.2, 0.01);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) b.box('paint', -0.36 + c * 0.16, 0.7 + r * 0.28, 0.38, 0.1, 0.14, 0.05, { color: [[0.9, 0.8, 0.2], [0.2, 0.7, 0.3], [0.9, 0.4, 0.1], [0.8, 0.8, 0.85]][(r + c) % 4] });
  b.box('paint', 0.33, 1.2, 0.41, 0.18, 0.5, 0.02, { color: COL.dark });
  b.box('paint', 0, 0.25, 0.41, 0.6, 0.18, 0.02, { color: COL.black });
};
B.infirmaryBed = (b) => {
  b.box('steel', 0, 0.38, 0, 0.92, 0.08, 2.0, { color: [0.85, 0.87, 0.88] });
  legs4(b, 0.92, 2.0, 0.38, 0.05, 0.025, [0.8, 0.82, 0.84]);
  b.box('mattress', 0, 0.5, 0, 0.86, 0.14, 1.94, { color: [0.85, 0.92, 1] });
  b.box('fabric', 0, 0.6, -0.78, 0.55, 0.1, 0.3, { color: COL.white });
  b.box('steel', 0, 0.75, -0.98, 0.92, 0.6, 0.05, { color: [0.85, 0.87, 0.88] });
};
B.nurseDesk = (b) => { b.box('paint', 0, 0.39, 0, 1.6, 0.78, 0.7, { color: [0.85, 0.88, 0.9] }); b.box('paint', 0.3, 1.0, -0.1, 0.45, 0.35, 0.05, { color: COL.dark }); b.box('screen', 0.3, 1.0, -0.07, 0.4, 0.28, 0.01); chair(b, 0, -0.75, 0, [0.3, 0.5, 0.6], 'paint'); b.box('paint', -0.5, 0.82, 0.1, 0.25, 0.08, 0.3, { color: COL.white }); };
B.medCabinet = (b) => { b.box('paint', 0, 0.95, 0, 1.0, 1.9, 0.45, { color: COL.white }); b.box('paint', 0, 1.5, 0.23, 0.3, 0.08, 0.01, { color: COL.red }); b.box('paint', 0, 1.5, 0.23, 0.08, 0.3, 0.01, { color: COL.red }); };
B.curtain = (b) => { b.box('steel', 0, 2.25, 0, 2.2, 0.04, 0.04); for (let i = 0; i < 11; i++) b.box('fabric', -1.0 + i * 0.2, 1.3, (i % 2) * 0.05, 0.21, 1.8, 0.02, { color: [0.6, 0.78, 0.8] }); };
B.wardenDesk = (b) => {
  b.box('wood', 0, 0.76, 0, 2.0, 0.07, 0.9, { color: [0.6, 0.38, 0.22] });
  b.box('wood', -0.8, 0.38, 0, 0.35, 0.76, 0.85, { color: [0.55, 0.34, 0.2] }); b.box('wood', 0.8, 0.38, 0, 0.35, 0.76, 0.85, { color: [0.55, 0.34, 0.2] });
  b.box('paint', 0, 1.0, -0.65, 0.6, 1.0, 0.1, { color: [0.25, 0.12, 0.08] }); b.box('paint', 0, 0.48, -0.85, 0.6, 0.1, 0.55, { color: [0.25, 0.12, 0.08] });
  b.cyl('steel', 0.7, 0.8, -0.15, 0.08, 0.35, { segs: 6, color: [0.75, 0.6, 0.2] }); b.cyl('paint', 0.7, 1.12, -0.15, 0.16, 0.14, { segs: 8, rTop: 0.08, color: [0.2, 0.4, 0.2] });
  b.box('paint', 0, 0.82, 0.38, 0.45, 0.08, 0.04, { color: [0.75, 0.6, 0.2] });
  b.box('paint', -0.4, 0.81, 0.05, 0.3, 0.04, 0.38, { color: COL.cream });
};
B.filing = (b) => { b.box('steel', 0, 0.65, 0, 0.58, 1.3, 0.58, { color: [0.55, 0.58, 0.55] }); for (let i = 0; i < 3; i++) b.box('steel', 0, 0.25 + i * 0.4, 0.3, 0.12, 0.03, 0.03, { color: COL.dark }); };
B.flag = (b) => { b.cyl('wood', 0, 0, 0, 0.025, 2.2, { segs: 5, color: [0.7, 0.6, 0.3] }); b.box('paint', 0.35, 1.8, 0, 0.66, 0.42, 0.01, { color: [0.2, 0.3, 0.55] }); b.box('paint', 0.35, 1.8, 0.006, 0.66, 0.1, 0.01, { color: [0.85, 0.75, 0.3] }); b.cyl('paint', 0, 0, 0, 0.18, 0.05, { segs: 8, color: COL.dark }); };
B.lockers = (b) => { b.box('paint', 0, 1.0, 0, 2.0, 2.0, 0.5, { color: [0.35, 0.45, 0.6] }); for (let i = 0; i < 5; i++) { b.box('paint', -0.8 + i * 0.4, 1.0, 0.255, 0.02, 1.95, 0.01, { color: COL.dark }); b.box('paint', -0.8 + i * 0.4 + 0.12, 1.6, 0.256, 0.15, 0.08, 0.01, { color: [0.2, 0.25, 0.35] }); } };
B.guardTable = (b) => { b.box('wood', 0, 0.74, 0, 1.6, 0.05, 1.0); legs4(b, 1.6, 1.0, 0.72); chair(b, 0, 0.85, Math.PI, COL.dark, 'paint'); chair(b, 0, -0.85, 0, COL.dark, 'paint'); b.cyl('paint', 0.3, 0.77, 0.1, 0.05, 0.1, { segs: 8, color: COL.white }); b.box('paint', -0.35, 0.8, 0, 0.35, 0.08, 0.35, { color: [0.95, 0.6, 0.7] }); };
B.monitorDesk = (b) => { b.box('paint', 0, 0.39, 0, 2.4, 0.78, 0.8, { color: [0.3, 0.32, 0.35] }); for (let i = 0; i < 4; i++) { b.box('paint', -0.9 + i * 0.6, 1.05, -0.2, 0.55, 0.42, 0.08, { color: COL.black }); b.box('screen', -0.9 + i * 0.6, 1.05, -0.155, 0.48, 0.34, 0.01); } chair(b, 0, 0.85, Math.PI, COL.black, 'paint'); };
B.crate = (b) => { b.box('wood', 0, 0.45, 0, 1.0, 0.9, 1.0, { color: [0.75, 0.6, 0.4] }); for (const y of [0.2, 0.7]) b.box('wood', 0, y, 0, 1.02, 0.08, 1.02, { color: [0.55, 0.42, 0.28] }); };
B.servingCounter = (b) => {
  b.box('steel', 0, 0.52, 0, 10, 1.04, 1.0);
  b.box('steel', 0, 1.06, 0, 10.1, 0.04, 1.1, { color: [0.85, 0.87, 0.88] });
  b.box('glass', 0, 1.45, 0.15, 9.6, 0.02, 0.5, { pitch: 0.5 });
  for (const x of [-3.5, -1.5, 0.5, 2.5, 4.0]) {
    b.box('steel', x, 1.12, 0, 0.9, 0.1, 0.5, { color: [0.6, 0.62, 0.64] });
    b.box('paint', x, 1.16, 0, 0.8, 0.04, 0.42, { color: [[0.85, 0.75, 0.4], [0.6, 0.35, 0.2], [0.4, 0.6, 0.3], [0.9, 0.85, 0.7], [0.7, 0.3, 0.2]][Math.abs(Math.round(x)) % 5] });
  }
};
B.stove = (b) => { b.box('steel', 0, 0.45, 0, 1.2, 0.9, 0.8); b.box('paint', 0, 0.91, 0, 1.2, 0.04, 0.8, { color: COL.black }); for (const x of [-0.3, 0.3]) for (const z of [-0.2, 0.2]) b.cyl('paint', x, 0.93, z, 0.12, 0.02, { segs: 8, color: [0.3, 0.3, 0.3] }); b.cyl('steel', -0.3, 0.95, 0.2, 0.17, 0.3, { segs: 10 }); b.box('paint', 0, 0.45, 0.41, 1.0, 0.4, 0.02, { color: COL.dark }); };
B.prepTable = (b) => { b.box('steel', 0, 0.88, 0, 2.0, 0.04, 0.9); legs4(b, 2.0, 0.9, 0.86); b.box('steel', 0, 0.25, 0, 1.9, 0.03, 0.85, { color: COL.gray }); b.box('wood', -0.4, 0.92, 0, 0.5, 0.03, 0.35); b.sphere('paint', 0.3, 0.97, 0.1, 0.07, { segs: 6, rings: 4, color: [0.8, 0.3, 0.1] }); b.sphere('paint', 0.45, 0.96, -0.1, 0.06, { segs: 6, rings: 4, color: [0.5, 0.7, 0.2] }); };
B.fridge = (b) => { b.box('steel', 0, 1.0, 0, 1.0, 2.0, 0.75, { color: [0.88, 0.9, 0.9] }); b.box('steel', 0.42, 1.2, 0.39, 0.04, 0.6, 0.04, { color: COL.dark }); b.box('paint', 0, 1.35, 0.38, 0.98, 0.015, 0.01, { color: COL.gray }); };
B.kitchenShelf = (b) => { for (let i = 0; i < 4; i++) b.box('steel', 0, 0.1 + i * 0.6, 0, 2.0, 0.04, 0.5); legs4(b, 2.0, 0.5, 2.0, 0.03, 0.02); const rng = new RNG(3); for (let i = 0; i < 18; i++) b.cyl('paint', rng.range(-0.9, 0.9), 0.12 + rng.int(0, 3) * 0.6, rng.range(-0.15, 0.15), 0.07, rng.range(0.12, 0.3), { segs: 7, color: rng.pick([COL.red, COL.yellow, COL.white, COL.green]) }); };
B.dishSink = (b) => { b.box('steel', 0, 0.45, 0, 1.6, 0.9, 0.7); b.box('paint', 0, 0.9, 0.05, 1.2, 0.02, 0.45, { color: COL.dark }); b.rod('steel', 0, 0.9, -0.3, 0, 1.25, -0.1, 0.02); b.box('paint', 0.5, 0.95, 0.1, 0.3, 0.1, 0.3, { color: COL.white }); };
B.messTable = (b) => {
  b.box('steel', 0, 0.76, 0, 4.0, 0.05, 0.9, { color: [0.72, 0.75, 0.77] });
  for (const z of [-0.72, 0.72]) b.box('steel', 0, 0.44, z, 4.0, 0.05, 0.36, { color: [0.6, 0.63, 0.66] });
  for (const x of [-1.7, 0, 1.7]) { b.box('steel', x, 0.38, 0, 0.08, 0.76, 0.08, { color: COL.gray }); b.box('steel', x, 0.1, 0, 0.08, 0.06, 1.7, { color: COL.gray }); }
};
B.trashCan = (b) => { b.cyl('paint', 0, 0, 0, 0.24, 0.75, { segs: 10, color: [0.2, 0.38, 0.28] }); b.cyl('paint', 0, 0.75, 0, 0.26, 0.05, { segs: 10, color: [0.15, 0.3, 0.2] }); };
B.tvStand = (b) => { b.box('wood', 0, 0.35, 0, 2.0, 0.7, 0.5, { color: [0.5, 0.35, 0.22] }); b.box('paint', 0, 1.05, 0, 1.0, 0.7, 0.55, { color: COL.dark }); b.box('screen', 0, 1.07, 0.28, 0.82, 0.55, 0.01); };
B.couch = (b) => { const c = [0.45, 0.32, 0.25]; b.box('fabric', 0, 0.25, 0, 1.8, 0.4, 0.85, { color: c }); b.box('fabric', 0, 0.62, -0.35, 1.8, 0.55, 0.18, { color: c }); for (const x of [-0.85, 0.85]) b.box('fabric', x, 0.5, 0, 0.16, 0.35, 0.85, { color: c }); for (const x of [-0.45, 0.45]) b.box('fabric', x, 0.47, 0.05, 0.78, 0.1, 0.7, { color: [0.52, 0.37, 0.29] }); };
B.poolTable = (b) => {
  b.box('wood', 0, 0.72, 0, 2.5, 0.16, 1.35, { color: [0.45, 0.28, 0.15] });
  b.box('paint', 0, 0.805, 0, 2.3, 0.02, 1.15, { color: COL.felt });
  for (const [x, z] of [[-1.17, -0.6], [1.17, -0.6], [-1.17, 0.6], [1.17, 0.6], [0, -0.62], [0, 0.62]]) b.cyl('paint', x, 0.79, z, 0.06, 0.03, { segs: 8, color: COL.black });
  legs4(b, 2.3, 1.15, 0.65, 0.1, 0.07, [0.4, 0.25, 0.12]);
  const rng = new RNG(6);
  for (let i = 0; i < 7; i++) b.sphere('paint', rng.range(-0.9, 0.9), 0.84, rng.range(-0.45, 0.45), 0.03, { segs: 6, rings: 4, color: rng.pick([COL.red, COL.yellow, COL.blue, COL.white, COL.black, COL.orange]) });
};
B.cardTable = (b) => { b.box('paint', 0, 0.74, 0, 1.0, 0.04, 1.0, { color: COL.felt }); legs4(b, 1.0, 1.0, 0.72); for (const [x, z, y] of [[0.8, 0, -Math.PI / 2], [-0.8, 0, Math.PI / 2], [0, 0.8, Math.PI], [0, -0.8, 0]]) chair(b, x, z, y, COL.blue); };
B.pingPong = (b) => { b.box('paint', 0, 0.76, 0, 2.7, 0.04, 1.5, { color: [0.15, 0.35, 0.45] }); b.box('paint', 0, 0.785, 0, 0.02, 0.01, 1.5, { color: COL.white }); b.box('paint', 0, 0.86, 0, 0.02, 0.15, 1.55, { color: COL.white }); legs4(b, 2.4, 1.3, 0.74); };
B.bookshelf = (b, f) => {
  b.box('wood', 0, 1.1, -0.18, 2.0, 2.2, 0.06);
  for (const x of [-0.98, 0.98]) b.box('wood', x, 1.1, 0, 0.05, 2.2, 0.45);
  const rng = new RNG(f.index * 31 + 5);
  for (let i = 0; i < 5; i++) { const y = 0.05 + i * 0.43; b.box('wood', 0, y, 0, 1.95, 0.03, 0.44); books(b, -0.94, 0.94, y + 0.015, 0.0, 0.32, rng); }
};
B.readingTable = (b) => { b.box('wood', 0, 0.74, 0, 1.8, 0.05, 0.9); legs4(b, 1.8, 0.9, 0.72, 0.08, 0.04, [0.45, 0.3, 0.18]); for (const [x, z, y] of [[-0.45, 0.75, Math.PI], [0.45, 0.75, Math.PI], [-0.45, -0.75, 0], [0.45, -0.75, 0]]) chair(b, x, z, y, [0.5, 0.33, 0.2], 'wood'); b.box('paint', 0.3, 0.79, 0.1, 0.3, 0.05, 0.22, { color: COL.red }); b.cyl('steel', -0.6, 0.77, 0, 0.08, 0.04, { segs: 8, color: [0.2, 0.4, 0.25] }); b.cyl('steel', -0.6, 0.77, 0, 0.015, 0.4, { segs: 4, color: [0.7, 0.6, 0.3] }); b.cyl('glowWarm', -0.6, 1.1, 0, 0.14, 0.12, { segs: 8, rTop: 0.06 }); };
B.chessTable = (b) => {
  b.box('wood', 0, 0.72, 0, 0.8, 0.04, 0.8); b.cyl('steel', 0, 0, 0, 0.06, 0.72, { segs: 6 });
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) b.box('paint', -0.245 + i * 0.07, 0.745, -0.245 + j * 0.07, 0.07, 0.006, 0.07, { color: COL.black });
  b.box('paint', 0, 0.742, 0, 0.56, 0.004, 0.56, { color: COL.cream });
  const rng = new RNG(2);
  for (let k = 0; k < 10; k++) b.cyl('paint', rng.range(-0.24, 0.24), 0.745, rng.range(-0.24, 0.24), 0.018, 0.05, { segs: 6, color: k % 2 ? COL.black : COL.white });
  chair(b, 0, 0.72, Math.PI, [0.5, 0.33, 0.2], 'wood'); chair(b, 0, -0.72, 0, [0.5, 0.33, 0.2], 'wood');
};
B.librarianDesk = (b) => { b.box('wood', 0, 0.4, 0, 1.6, 0.8, 0.7, { color: [0.55, 0.38, 0.24] }); const rng = new RNG(8); for (let i = 0; i < 3; i++) for (let k = 0; k < 5; k++) b.box('paint', -0.5 + i * 0.35, 0.83 + k * 0.05, 0.05, 0.22, 0.045, 0.3, { color: rng.pick(BOOK_COLS) }); chair(b, 0, -0.72, 0, [0.5, 0.33, 0.2], 'wood'); };
B.showerHead = (b) => { b.rod('steel', 0, 1.0, -0.08, 0, 2.15, -0.08, 0.02); b.rod('steel', 0, 2.15, -0.08, 0, 2.15, 0.22, 0.02); b.cyl('steel', 0, 2.05, 0.25, 0.07, 0.08, { segs: 8, rTop: 0.04 }); b.cyl('steel', 0.12, 1.1, -0.08, 0.04, 0.05, { segs: 6, pitch: Math.PI / 2 }); };
B.drain = (b) => { b.cyl('paint', 0, 0.004, 0, 0.18, 0.01, { segs: 10, color: COL.dark }); };
B.washer = (b) => { b.box('paint', 0, 0.5, 0, 0.8, 1.0, 0.75, { color: COL.white }); b.cyl('paint', 0, 0.48, 0.37, 0.22, 0.03, { segs: 14, pitch: Math.PI / 2, color: COL.dark }); b.cyl('glass', 0, 0.48, 0.385, 0.17, 0.02, { segs: 14, pitch: Math.PI / 2 }); b.box('paint', 0, 0.9, 0.36, 0.7, 0.12, 0.03, { color: COL.gray }); };
B.dryer = (b) => { B.washer(b); b.box('paint', 0.25, 0.9, 0.38, 0.12, 0.06, 0.01, { color: COL.orange }); };
B.foldTable = (b) => { b.box('steel', 0, 0.88, 0, 2.0, 0.04, 0.9); legs4(b, 2.0, 0.9, 0.86); const rng = new RNG(12); for (let i = 0; i < 4; i++) for (let k = 0; k < rng.int(1, 4); k++) b.box('fabric', -0.75 + i * 0.5, 0.93 + k * 0.06, rng.range(-0.15, 0.15), 0.4, 0.06, 0.35, { color: rng.pick([COL.white, COL.tan, [0.75, 0.75, 0.8], COL.orange]) }); };
B.laundryCart = (b) => { b.box('steel', 0, 0.12, 0, 0.9, 0.04, 0.6, { color: COL.gray }); b.box('fabric', 0, 0.55, 0, 0.86, 0.75, 0.56, { color: [0.75, 0.72, 0.62] }); b.box('fabric', 0, 0.85, 0, 0.8, 0.12, 0.5, { color: COL.white }); for (const [x, z] of [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]]) b.cyl('paint', x, 0, z, 0.05, 0.08, { segs: 6, color: COL.black }); };
B.detergentShelf = (b) => { B.kitchenShelf(b); };
B.weightBench = (b) => {
  b.box('paint', 0, 0.45, 0.2, 0.32, 0.1, 1.3, { color: COL.black });
  b.box('steel', 0, 0.22, 0.2, 0.08, 0.44, 1.1, { color: COL.dark });
  for (const x of [-0.42, 0.42]) b.box('steel', x, 0.6, -0.65, 0.06, 1.2, 0.06, { color: COL.dark });
  b.rod('steel', -0.95, 1.12, -0.65, 0.95, 1.12, -0.65, 0.016, { color: [0.85, 0.85, 0.85] });
  for (const x of [-0.75, 0.75]) b.cyl('paint', x - 0.04, 1.12, -0.65, 0.22, 0.08, { segs: 12, roll: Math.PI / 2, color: COL.black });
};
B.weightBenchOut = B.weightBench;
B.squatRack = (b) => {
  for (const x of [-0.68, 0.68]) for (const z of [-0.5, 0.5]) b.box('steel', x, 1.1, z, 0.07, 2.2, 0.07, { color: COL.dark });
  for (const x of [-0.68, 0.68]) b.box('steel', x, 2.18, 0, 0.07, 0.07, 1.07, { color: COL.dark });
  b.rod('steel', -1.0, 1.45, -0.05, 1.0, 1.45, -0.05, 0.017, { color: [0.85, 0.85, 0.85] });
  for (const x of [-0.85, 0.85]) b.cyl('paint', x - 0.04, 1.45, -0.05, 0.25, 0.08, { segs: 12, roll: Math.PI / 2, color: [0.6, 0.12, 0.1] });
};
B.punchBag = (b) => { b.cyl('paint', 0, 0.8, 0, 0.26, 1.1, { segs: 12, color: [0.6, 0.12, 0.1] }); b.cyl('paint', 0, 1.9, 0, 0.27, 0.05, { segs: 12, color: COL.black }); b.rod('steel', 0, 1.95, 0, 0, 3.8, 0, 0.012, { color: COL.gray }); b.cyl('paint', 0, 0.78, 0, 0.27, 0.05, { segs: 12, color: COL.black }); };
B.treadmill = (b) => { b.box('paint', 0, 0.1, 0, 0.8, 0.2, 1.85, { color: COL.dark }); b.box('rubberBlack', 0, 0.205, -0.05, 0.6, 0.02, 1.65); for (const x of [-0.38, 0.38]) b.rod('steel', x, 0.2, 0.75, x, 1.25, 0.85, 0.025, { color: COL.gray }); b.box('paint', 0, 1.25, 0.85, 0.8, 0.22, 0.12, { color: COL.dark }); b.box('screen', 0, 1.28, 0.79, 0.3, 0.12, 0.01); };
B.pullupBar = (b) => { for (const x of [-0.58, 0.58]) b.box('steel', x, 1.17, 0, 0.08, 2.35, 0.08, { color: COL.dark }); b.rod('steel', -0.6, 2.3, 0, 0.6, 2.3, 0, 0.022, { color: [0.85, 0.85, 0.85] }); };
B.pullupBarOut = B.pullupBar;
B.dumbbellRack = (b) => { b.box('steel', 0, 0.35, 0, 1.5, 0.05, 0.45, { color: COL.dark }); b.box('steel', 0, 0.7, 0, 1.5, 0.05, 0.3, { color: COL.dark }); legs4(b, 1.5, 0.45, 0.72, 0.05, 0.025, COL.dark); for (let i = 0; i < 4; i++) for (const z of [-0.1, 0.1]) { b.rod('steel', -0.6 + i * 0.32, 0.4, z, -0.6 + i * 0.32 + 0.22, 0.4, z, 0.015); } };
B.mat = (b) => { b.box('paint', 0, 0.02, 0, 2.0, 0.04, 1.2, { color: [0.2, 0.35, 0.6] }); };
B.plateStamper = (b) => { b.box('paint', 0, 0.4, 0, 1.2, 0.8, 1.0, { color: [0.35, 0.4, 0.35] }); b.box('paint', 0, 1.0, -0.3, 0.3, 1.2, 0.3, { color: [0.35, 0.4, 0.35] }); b.box('paint', 0, 1.2, 0.05, 0.6, 0.25, 0.5, { color: COL.yellow }); b.box('paint', 0, 0.82, 0.1, 0.5, 0.03, 0.25, { color: [0.85, 0.85, 0.8] }); b.box('paint', 0, 1.45, 0.05, 0.62, 0.05, 0.52, { color: COL.black }); };
B.workbench = (b) => { b.box('wood', 0, 0.88, 0, 2.2, 0.06, 0.9, { color: [0.7, 0.55, 0.35] }); legs4(b, 2.2, 0.9, 0.86, 0.08, 0.04, COL.dark); b.box('steel', 0.8, 0.98, 0.3, 0.2, 0.14, 0.18, { color: [0.3, 0.45, 0.6] }); const rng = new RNG(9); for (let i = 0; i < 6; i++) b.box('paint', rng.range(-0.9, 0.5), 0.93, rng.range(-0.3, 0.3), rng.range(0.1, 0.25), 0.03, 0.05, { color: rng.pick([COL.red, COL.yellow, COL.gray, COL.dark]), yaw: rng.range(0, 3) }); };
B.toolRack = (b) => { b.box('paint', 0, 1.3, 0, 2.0, 1.0, 0.03, { color: [0.75, 0.62, 0.42] }); const rng = new RNG(11); for (let i = 0; i < 8; i++) b.box('paint', -0.85 + i * 0.24, 1.3 + rng.range(-0.25, 0.25), 0.03, 0.05, rng.range(0.2, 0.35), 0.03, { color: rng.pick([COL.dark, COL.red, COL.yellow]) }); };
B.plateStack = (b) => { for (let k = 0; k < 12; k++) b.box('paint', 0, 0.05 + k * 0.08, 0, 0.9, 0.06, 0.7, { color: k % 2 ? [0.85, 0.82, 0.6] : [0.75, 0.8, 0.85] }); };
B.courtLines = () => {};
B.hoop = (b) => { b.cyl('steel', 0, 0, -0.3, 0.07, 3.6, { segs: 8, color: [0.3, 0.32, 0.36] }); b.box('steel', 0, 3.5, 0.0, 0.08, 0.08, 0.7, { color: [0.3, 0.32, 0.36] }); b.box('paint', 0, 3.45, 0.38, 1.6, 1.0, 0.05, { color: COL.white }); b.box('paint', 0, 3.3, 0.41, 0.55, 0.42, 0.01, { color: COL.red }); b.torus('paint', 0, 3.05, 0.65, 0.23, 0.015, { color: COL.orange }); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.rod('fabric', Math.cos(a) * 0.22, 3.05, 0.65 + Math.sin(a) * 0.22, Math.cos(a) * 0.12, 2.7, 0.65 + Math.sin(a) * 0.12, 0.006, { color: COL.white }); } };
B.picnicTable = (b) => { b.box('wood', 0, 0.74, 0, 2.0, 0.05, 0.8, { color: [0.75, 0.6, 0.45] }); for (const z of [-0.7, 0.7]) b.box('wood', 0, 0.44, z, 2.0, 0.05, 0.3, { color: [0.75, 0.6, 0.45] }); for (const x of [-0.8, 0.8]) { b.box('wood', x, 0.37, 0, 0.08, 0.74, 0.08, { color: [0.55, 0.42, 0.3] }); b.box('wood', x, 0.38, 0, 0.08, 0.06, 1.7, { color: [0.55, 0.42, 0.3] }); } };
B.bleachers = (b) => {
  for (let t = 0; t < 3; t++) {
    const z = 1.9 - t * 1.5, y = 0.45 + t * 0.6;
    b.box('steel', 0, y, z, 16, 0.06, 0.4, { color: [0.78, 0.8, 0.82] });
    b.box('steel', 0, y - 0.3, z + 0.45, 16, 0.04, 0.4, { color: [0.6, 0.62, 0.64] });
    b.box('paint', 0, y / 2, z - 0.25, 16, y, 1.1, { color: [0.35, 0.36, 0.38] });
  }
  for (let x = -8; x <= 8; x += 2) b.box('steel', x, 1.1, -0.5, 0.08, 2.2, 5, { color: COL.dark });
};
B.guardTower = (b) => {
  for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) b.box('steel', x, 3.0, z, 0.2, 6.0, 0.2, { color: [0.4, 0.42, 0.4] });
  b.box('concrete', 0, 6.0, 0, 3.3, 0.2, 3.3);
  for (const [x, z, w, d] of [[0, -1.6, 3.2, 0.1], [0, 1.6, 3.2, 0.1], [-1.6, 0, 0.1, 3.2], [1.6, 0, 0.1, 3.2]]) b.box('paint', x, 6.55, z, w, 0.9, d, { color: [0.55, 0.55, 0.5] });
  for (const [x, z] of [[-1.55, -1.55], [1.55, -1.55], [-1.55, 1.55], [1.55, 1.55]]) b.box('steel', x, 7.3, z, 0.12, 1.5, 0.12, { color: COL.dark });
  b.box('roof', 0, 8.1, 0, 3.8, 0.2, 3.8);
  for (let i = 0; i < 14; i++) b.box('steel', 1.6, 0.3 + i * 0.42, 1.9, 0.5, 0.04, 0.04, { color: COL.gray });
  b.cyl('glowWarm', 1.5, 7.6, -1.5, 0.15, 0.25, { segs: 8 });
};
B.lightPole = (b) => { b.cyl('steel', 0, 0, 0, 0.12, 8.0, { segs: 8, color: [0.45, 0.47, 0.5] }); b.box('steel', 0, 8.0, 0, 1.2, 0.15, 0.4, { color: COL.dark }); b.box('glowWarm', 0, 7.9, 0, 1.0, 0.04, 0.3); };
B.blockSign = () => {}; B.messSign = () => {}; B.gymSign = () => {}; B.yardSign = () => {};

const POSTERS = [
  (x) => { const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#f5a35b'); g.addColorStop(0.6, '#e2566b'); g.addColorStop(1, '#3a2d5c'); x.fillStyle = g; x.fillRect(0, 0, 192, 256); x.fillStyle = '#ffe7a8'; x.beginPath(); x.arc(96, 150, 40, 0, Math.PI * 2); x.fill(); x.fillStyle = '#2a2342'; x.fillRect(0, 175, 192, 81); x.fillStyle = '#fff'; x.font = 'bold 22px sans-serif'; x.fillText('SOMEDAY', 46, 230); },
  (x) => { x.fillStyle = '#1d3b5c'; x.fillRect(0, 0, 192, 256); x.fillStyle = '#e8d34a'; x.font = 'bold 34px sans-serif'; x.fillText('THE', 20, 60); x.fillText('RUST', 20, 100); x.fillText('BUCKETS', 20, 140); x.fillStyle = '#e85a3a'; x.fillRect(20, 160, 150, 8); x.fillStyle = '#ccc'; x.font = '16px sans-serif'; x.fillText('LIVE AT THE GRANGE', 20, 200); },
  (x) => { x.fillStyle = '#6aa3c8'; x.fillRect(0, 0, 192, 256); x.fillStyle = '#e8d9a0'; x.fillRect(0, 170, 192, 86); x.fillStyle = '#2f7a47'; x.fillRect(120, 70, 10, 110); x.beginPath(); x.ellipse(125, 70, 45, 18, 0.3, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 20px serif'; x.fillText('Wish you', 20, 40); x.fillText('were here', 20, 64); },
  (x) => { x.fillStyle = '#2b2b2b'; x.fillRect(0, 0, 192, 256); x.fillStyle = '#c62f2f'; x.beginPath(); x.moveTo(30, 200); x.lineTo(96, 40); x.lineTo(162, 200); x.fill(); x.fillStyle = '#eee'; x.font = 'bold 26px sans-serif'; x.fillText('MOTOR', 50, 235); },
  (x) => { x.fillStyle = '#e9e1c9'; x.fillRect(0, 0, 192, 256); x.strokeStyle = '#333'; x.lineWidth = 3; for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(20, 40 + i * 30); x.lineTo(172, 40 + i * 30); x.stroke(); } x.fillStyle = '#b23b2a'; x.font = 'bold 18px sans-serif'; x.fillText('DAYS LEFT:', 30, 30); x.fillStyle = '#333'; x.font = '24px monospace'; x.fillText('||||  ||||  |||', 26, 120); },
  (x) => { x.fillStyle = '#3d6b3a'; x.fillRect(0, 0, 192, 256); x.fillStyle = '#f0e6b0'; x.font = 'bold 24px serif'; x.fillText('GRAVELMOUTH', 12, 60); x.font = 'italic 18px serif'; x.fillText('County Fair', 45, 90); x.fillStyle = '#f4a640'; x.beginPath(); x.arc(96, 165, 45, 0, Math.PI * 2); x.fill(); x.fillStyle = '#3d6b3a'; x.font = 'bold 40px serif'; x.fillText('1st', 70, 180); },
];
function ensurePoster(view, key, i) {
  if (view.materials.mats.has(key)) return;
  const tex = new BABYLON.DynamicTexture(key, { width: 192, height: 256 }, view.scene, true);
  POSTERS[i](tex.getContext());
  tex.update(true);
  const m = new BABYLON.StandardMaterial(`m_${key}`, view.scene);
  m.diffuseTexture = tex; m.specularColor = BABYLON.Color3.Black();
  view.materials.register(key, m, 1);
}

export function buildFurniture(batch, f, view) {
  const fn = B[f.type];
  if (!fn) return;
  batch.setFrame(f.x, f.z, f.yaw, 0);
  fn(batch, f, view);
  batch.clearFrame();
}
