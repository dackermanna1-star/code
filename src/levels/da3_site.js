// Dead Air 3 — the SKYLINE TOWER construction site (Newburg Construction Co.):
// hoardings plastered with safety signs and bills, the front yard (stacked
// site cabins, the barricaded site office where the crew made their last
// stand, a Witch sobbing in a dark trailer, portaloos, cement mixers, block
// pallets, rebar, the tower crane), the concrete frame (ground floor walled off
// by a partial collapse, core stair, level 2 slab with shoring, edge
// protection and the fallen bay), the scaffold stair tower and the rear yard
// where the gate is blocked by the barricade (see da3_barricade.js).
import * as THREE from 'three';
import { ceilingLight, graffiti, poster, posterWall, wallMessages, supplies, physProp, floorWithHoles, P } from './kit.js';
import { DF } from '../render/decals.js';
import { container } from './ch3_props.js';
import { workLight, concreteBags, sawhorse, toolCart, drywallStack, PlasticSheets } from './ch4_parts.js';
import { formStack, concreteHopper, cardboard } from './da2_parts.js';
import { billboard, adTexture } from './da_parts.js';
import {
  rng, NC, CLIP, blood, safetySign, hoarding, hardHat, blockPallet, wheelbarrow, timberStack, cableDrum, sandPile,
  edgeRail, column, shoring, scaffoldStairTower, towerCrane, materialHoist, festoon, F_SOLID, F_SHOOT, F_DEFAULT, sign,
} from './da3_parts.js';
import { SITE, BLD, LV, CORE, TOWER_ST, BAR } from './da3_layout.js';

const CX = [96.3, 101.9, 107.5, 114.2, 118.9, 123.7];
const CZ = [-21.7, -16.1, -10.5, -4.9, 0.7, 5.7];
const SEP = [110.7, 113.14]; // container line separating the front and rear yards

// Enterable site cabin (raised floor, door + steps on the n/s face).
function cabin(L, x0, z0, x1, z1, o = {}) {
  const fy = 0.62, h = 2.5, t = 0.08, tint = o.tint ?? 0xd8d4c8;
  const face = o.door ?? 's', dx = o.doorX ?? (x0 + x1) / 2, dw = 0.95;
  L.box(x0, 0.4, z0, x1, fy, z1, 'metalDark', { tint: 0x2a2a2a });
  for (const bx of [x0 + 0.8, x1 - 0.8]) for (const bz of [z0 + 0.4, z1 - 0.4]) L.box(bx - 0.2, 0, bz - 0.15, bx + 0.2, 0.4, bz + 0.15, 'concrete', { collide: false });
  L.box(x0, 0, z0 + 0.3, x1, 0.4, z1 - 0.3, 'concrete', { visible: false });
  L.box(x0 + t, fy - 0.01, z0 + t, x1 - t, fy + 0.005, z1 - t, 'linoleum', { collide: false, tint: o.floorTint ?? 0x6a6a60 });
  const doorWall = (z, s) => {
    L.wallX(x0, x1, z, fy, fy + h, 'paintedWhite', t, [{ a: dx - dw / 2, b: dx + dw / 2, y0: fy, y1: fy + 2.05 }], { tint });
    for (let x = x0 + 0.15; x < x1; x += 0.3) if (Math.abs(x - dx) > dw / 2 + 0.05) L.box(x - 0.02, fy + 0.1, z + s * (t / 2), x + 0.02, fy + h - 0.1, z + s * (t / 2 + 0.015), 'paintedWhite', { collide: false, tint: new THREE.Color(tint).multiplyScalar(0.86).getHex() });
    // steps
    for (let i = 0; i < 3; i++) L.box(dx - 0.65, 0, z + s * (0.05 + (3 - i) * 0.3), dx + 0.65, 0.2 + i * 0.2, z + s * (0.05 + (2 - i) * 0.3), 'diamond', {});
  };
  const plainWall = (z) => L.wallX(x0, x1, z, fy, fy + h, 'paintedWhite', t, [], { tint });
  if (face === 's') { doorWall(z1 - t / 2, 1); plainWall(z0 + t / 2); } else { doorWall(z0 + t / 2, -1); plainWall(z1 - t / 2); }
  L.wallZ(z0 + t, z1 - t, x0 + t / 2, fy, fy + h, 'paintedWhite', t, [], { tint });
  L.wallZ(z0 + t, z1 - t, x1 - t / 2, fy, fy + h, 'paintedWhite', t, [], { tint });
  L.box(x0 - 0.05, fy + h, z0 - 0.05, x1 + 0.05, fy + h + 0.12, z1 + 0.05, 'metal', { tint: 0x9a9e9e });
  // windows on the outside (boarded or dark glass)
  const wz = face === 's' ? z1 + 0.005 : z0 - 0.005, ws = face === 's' ? 1 : -1;
  for (const wx of [x0 + 1.2, x1 - 1.2]) {
    if (Math.abs(wx - dx) < 1.3) continue;
    L.box(wx - 0.6, fy + 1.0, wz, wx + 0.6, fy + 1.8, wz + ws * 0.015, 'glassDirty', { collide: false, tint: 0x1a2024 });
    if (o.boarded) for (let k = 0; k < 3; k++) L.box(wx - 0.75, fy + 1.05 + k * 0.28, wz + ws * 0.02, wx + 0.75, fy + 1.25 + k * 0.28, wz + ws * 0.05, 'wood', { collide: false, tint: 0xa88a60 });
  }
  L.reverb(x0, fy, z0, x1, fy + h, z1, 'room');
  return { fy, h };
}

// ------------------------------------------------------------- perimeter --
function perimeter(L, game) {
  const { x0, x1, z0, z1 } = SITE;
  L.box(x0, -0.3, z0, x1, 0, z1, 'dirt', { tint: 0x7a7064 });
  // gravel tracks
  L.box(68.2, 0.001, -2.5, 96, 0.012, 1.5, 'concrete', { collide: false, tint: 0x6a6660 });
  L.box(124.5, 0.001, -6.5, 147.8, 0.012, 0.5, 'concrete', { collide: false, tint: 0x6a6660 });
  hoarding(L, 'z', z0, z1, 68.06, [SITE.gate], { side: 1 });
  hoarding(L, 'x', x0, x1, z0 + 0.06, [], { side: 1 });
  hoarding(L, 'x', x0, x1, z1 - 0.06, [], { side: -1 });
  hoarding(L, 'z', z0, z1, x1 - 0.06, [[BAR.z0, BAR.z1]], { side: -1 });
  // gate: steel posts, one leaf swung in, one flattened
  for (const z of SITE.gate) L.box(67.86, 0, z - 0.14, 68.26, 3.2, z + 0.14, 'paintedYellow', { tint: 0xc8a020 });
  L.box(67.9, 3.0, SITE.gate[0], 68.22, 3.3, SITE.gate[1], 'metalDark', NC);
  const lf = P.prop(L, 70.2, 0, -2.6, -1.1); lf.box(0, 1.2, 0, 3.4, 2.2, 0.03, 'chainLink').box(0, 2.3, 0, 3.4, 0.05, 0.05, 'metalDark').box(0, 0.1, 0, 3.4, 0.05, 0.05, 'metalDark').box(-1.7, 1.2, 0, 0.05, 2.25, 0.05, 'metalDark').box(1.7, 1.2, 0, 0.05, 2.25, 0.05, 'metalDark').col(0, 1.2, 0, 3.4, 2.3, 0.1, 'metal', F_SOLID | F_SHOOT);
  const fl = P.prop(L, 70.4, 0, 2.0, 0.25); fl.box(0, 0.06, 0, 3.4, 0.04, 2.2, 'chainLink').box(0, 0.05, -1.1, 3.4, 0.06, 0.06, 'metalDark').box(0, 0.05, 1.1, 3.4, 0.06, 0.06, 'metalDark');
  // outside face (street side): safety signage + bills + developer board
  const ox = 67.98;
  safetySign(L, 'DANGER\nCONSTRUCTION SITE\nKEEP OUT', ox, 1.7, -6.2, Math.PI / 2, 1.3, 0.9, 'danger');
  safetySign(L, 'HARD HAT\nAREA', ox, 1.8, 4.6, Math.PI / 2, 0.7, 0.7, 'mandatory');
  safetySign(L, 'SAFETY BOOTS\nMUST BE WORN', ox, 1.8, 5.5, Math.PI / 2, 0.7, 0.7, 'mandatory');
  safetySign(L, 'HI-VIS\nVESTS', ox, 1.8, 6.4, Math.PI / 2, 0.7, 0.7, 'mandatory');
  safetySign(L, 'ALL VISITORS MUST\nREPORT TO THE SITE OFFICE', ox, 1.8, 8.2, Math.PI / 2, 1.3, 0.55, 'notice');
  safetySign(L, 'NO UNAUTHORISED\nENTRY', ox, 1.8, -8.2, Math.PI / 2, 1.0, 0.5, 'danger');
  for (const [z, w] of [[-14, 3.2], [-24, 2.6], [15, 3.0], [24, 2.4]]) posterWall(L, ox, 1.3, z, Math.PI / 2, w, 1.5, { kinds: ['concert', 'movie', 'flyer', 'missing', 'evac'] });
  poster(L, 'quarantine', ox, 1.5, -10.4, Math.PI / 2, 0.6, 0.85, {});
  graffiti(L, 'THE TOWER\nSTILL BLINKS\nPLANES LAND\nTHERE', ox, 1.4, 11.8, Math.PI / 2, 2.0, 1.0, '#b8201a');
  graffiti(L, 'NCC', ox, 1.2, -30.0, Math.PI / 2, 1.2, 0.6, '#e8c020', { style: 'tag' });
  // developer billboard behind the hoarding, facing Kessler Ave
  const tex = adTexture((g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0e1c34'); gr.addColorStop(1, '#3a6aa0');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e8b050'; g.fillRect(0, H - 30, W, 30);
    // tower rendering
    g.fillStyle = '#c8d8e8';
    g.beginPath(); g.moveTo(380, H - 30); g.lineTo(392, 26); g.lineTo(446, 12); g.lineTo(452, H - 30); g.fill();
    g.fillStyle = 'rgba(40,70,110,0.7)';
    for (let y = 30; y < H - 36; y += 9) g.fillRect(396, y, 50, 4);
    g.fillStyle = '#ffffff'; g.font = 'bold 54px Georgia, serif'; g.textAlign = 'left';
    g.fillText('SKYLINE TOWER', 22, 78);
    g.font = 'italic 24px Georgia, serif'; g.fillStyle = '#d8e4f0';
    g.fillText('32 storeys of waterfront living', 26, 118);
    g.font = 'bold 20px Arial, sans-serif'; g.fillStyle = '#ffe0a0';
    g.fillText('PENTHOUSES FROM $1.9M · COMPLETION 2027', 26, 160);
    g.fillStyle = '#0e1c34'; g.font = 'bold 18px Arial, sans-serif';
    g.fillText('NEWBURG CONSTRUCTION CO.  ·  SALES SUITE OPEN DAILY', 22, H - 9);
  });
  billboard(L, 70.0, 0, -19.0, -Math.PI / 2, 9, 3.4, tex, { legs: 2.9, lightIntensity: 7, flicker: 0.1 });
  // inside face
  safetySign(L, 'KEEP CLEAR\nCRANE OPERATING OVERHEAD', 68.14, 1.8, 9.0, Math.PI / 2, 1.3, 0.55, 'warning');
  safetySign(L, 'SITE OFFICE ↖', 68.14, 1.9, -6.0, Math.PI / 2, 1.0, 0.3, 'notice');
  L.reverb(x0, 0, z0, x1, 30, z1, 'outdoor');
  L.ambience(x0, -1, z0, x1, 40, z1, 'city');
}

// ------------------------------------------------------------ front yard --
function frontYard(L, game) {
  // ---- stacked site cabins (NW), a solid block with an outside stair
  P.siteTrailer(L, 75.5, 0, -30.6, Math.PI, 7);
  const up = P.prop(L, 75.5, 2.72, -30.6, Math.PI);
  up.rbox(0, 1.35, 0, 7, 2.5, 2.6, 0.04, 'paintedWhite', 0xc8b890);
  for (const wx of [-2.3, 0, 2.3]) up.box(wx, 1.6, -1.31, 1.2, 0.8, 0.02, 'glassDirty', 0x1a2024);
  up.col(0, 1.3, 0, 7, 2.6, 2.6, 'metal');
  const st = P.prop(L, 80.4, 0, -28.7, 0);
  for (let i = 0; i < 13; i++) st.box(1.2 - i * 0.2, 0.2 + i * 0.2, 0, 0.22, 0.05, 0.9, 'diamond', null);
  st.tube(1.2, 1.1, 0.45, -1.2, 3.5, 0.45, 0.02, 'metalDark').tube(1.2, 0.2, 0.45, 1.2, 1.1, 0.45, 0.02, 'metalDark');
  sign(L, 'NEWBURG CONSTRUCTION CO.\nSITE MANAGER', 75.5, 4.6, -29.28, 0, 3.0, 0.6, { bg: '#1a3a5a', fg: '#e8e0c0' });
  // ---- barricaded site office: the crew's last stand (enterable)
  const ox0 = 84, ox1 = 93, oz0 = -32.4, oz1 = -28.2, dxo = 86.6;
  const C = cabin(L, ox0, oz0, ox1, oz1, { door: 's', doorX: dxo, boarded: true, tint: 0xd8d4c8 });
  const fy = C.fy;
  sign(L, 'SITE OFFICE', 89.2, fy + 2.15, oz1 + 0.02, 0, 1.6, 0.3, { bg: '#1a3a5a', fg: '#fff' });
  graffiti(L, 'STILL\nALIVE\nIN HERE', 90.6, fy + 1.4, oz1 + 0.05, 0, 1.3, 0.8, '#b8201a');
  graffiti(L, 'NOT ANYMORE', 90.8, fy + 0.55, oz1 + 0.05, 0, 1.4, 0.35, '#202020');
  P.desk(L, 91.6, fy, -31.6, Math.PI, true);
  P.officeChair(L, 91.3, fy, -30.9, 2.9);
  P.table(L, 89.0, fy, -30.4, 0.05, 1.8, 1.0, 'woodPale');
  P.papers(L, 89.0, fy + 0.77, -30.4, 0.7, 10);
  P.filingCabinet(L, 84.45, fy, -31.6, -Math.PI / 2);
  P.filingCabinet(L, 84.45, fy, -30.9, -Math.PI / 2);
  // flipped desk + sandbags against the door: where they held the line
  const fd = P.prop(L, 86.6, fy, -29.3, 0.1); fd.box(0, 0.4, 0, 1.4, 0.8, 0.05, 'woodDark', 0x4a3020).box(0, 0.05, -0.35, 1.4, 0.05, 0.7, 'woodDark', 0x4a3020).col(0, 0.4, 0, 1.4, 0.8, 0.12, 'wood', F_SOLID | F_SHOOT);
  P.sandbags(L, 92.2, fy, -28.75, 0, 1.4, 2);
  P.radioTable(L, 84.9, fy, -29.2, Math.PI / 2);
  P.corpse(L, 88.2, fy + 0.01, -31.4, 0.4, 0xd8a020); blood(L, 88.2, fy, -31.4, 1.6, 4);
  P.corpse(L, 90.4, fy + 0.01, -29.1, 2.0, 0x3a4a2a); blood(L, 90.4, fy, -29.1, 1.2, 1);
  P.corpse(L, 86.4, 0.01, -26.8, 1.3, 0xe86a10); blood(L, 86.4, 0, -26.8, 1.8, 5);
  for (let i = 0; i < 4; i++) hardHat(L, 85.2 + i * 1.9, fy, -31.9 + (i % 2) * 2.4, rng() * 6, [0xe8c020, 0xf0f0e8, 0xe8c020, 0xe86a10][i]);
  wallMessages(L, 88.6, fy + 1.55, oz0 + 0.1, 0, 2.6, 1.1, { lines: ['NCC CREW — 6 OF US', 'ARMY SAID STAY PUT\nTHEN THEY LEFT', 'DAY 3 — NO WATER', 'SORRY MOM — DANNY'], density: 0.8 });
  sign(L, 'SKYLINE TOWER — L2 POUR\nFRI 06:00 · PUMP BOOKED', 91.8, fy + 1.6, oz0 + 0.1, 0, 1.3, 0.5, { bg: '#f0f0e8', fg: '#1a2a8a', font: '"Comic Sans MS", cursive' });
  L.item('ammo', 88.4, fy + 0.78, -30.2);
  L.item('health', 91.8, fy + 0.78, -31.7, { chance: 0.7 });
  L.item('pipebomb', 89.7, fy + 0.78, -30.6, { chance: 0.5 });
  L.item('tier2', 85.4, fy + 0.02, -31.9, { chance: 0.4 });
  const lamp = P.prop(L, 92.5, fy, -31.9, 0); lamp.box(0, 0.15, 0, 0.3, 0.3, 0.2, 'paintedYellow', 0xd8a020).glow(0, 0.16, -0.105, 0.24, 0.2, 0.01, 0xfff0d0);
  L.light(91.6, fy + 0.8, -31.0, 0xfff0d0, 5, 7, { flicker: 0.35 });
  // ---- portaloos (north edge)
  for (let i = 0; i < 5; i++) P.portableToilet(L, 95.2 + i * 1.25, 0, -32.9, 0);
  const tipped = P.prop(L, 102.4, 0.55, -31.6, 0.4); tipped.rbox(0, 0, 0, 1.1, 1.1, 2.2, 0.05, 'plastic', 0x2a5a9a, [Math.PI / 2, 0, 0]).col(0, 0, 0, 1.1, 1.1, 2.2, 'plastic');
  // ---- materials (north)
  blockPallet(L, 76.2, 0, -21.4, 0.1); blockPallet(L, 77.5, 0, -21.3, -0.05); blockPallet(L, 76.4, 0, -19.9, 0.2, 3);
  timberStack(L, 81.2, 0, -21.0, Math.PI / 2 + 0.05, 6, 3.6);
  P.dumpster(L, 99.2, 0, -26.4, 0.2, 0xb8601a);
  cableDrum(L, 92.4, 0, -21.2, 0.3, 0.7); cableDrum(L, 94.0, 0, -22.6, 1.4, 0.55, 0x8a1a14);
  P.generator(L, 86.8, 0, -12.6, 0.4);
  P.pipe(L, 87.2, 0.05, -12.0, 96, 0.05, -10.4, 0.03, 'rubber', 0x151515);
  P.floodLight(L, 74.2, 0, -14.4, -1.8, { h: 5.2, intensity: 40, range: 30 });
  sawhorse(L, 90.4, 0, -16.2, 0.4);
  wheelbarrow(L, 88.6, 0, -18.4, 1.1);
  for (const [x, z] of [[80.2, -16.4], [94.6, -17.8], [72.8, -8.4]]) hardHat(L, x, 0, z, rng() * 6);
  // ---- south: crane, mixers, rebar, formwork, sand, the Witch trailer
  const crane = towerCrane(L, 91.0, 12.0, { h: 46, jib: 46, counter: 14, trolley: 30, hookY: 22 });
  P.cementMixer(L, 80.6, 0, 6.2, 0.4);
  P.cementMixer(L, 101.0, 0, 11.4, -0.5);
  P.rebarBundle(L, 84.4, 0, 20.4, 0.1, 5, 16);
  P.rebarBundle(L, 84.6, 0, 21.4, 0.06, 5, 12);
  formStack(L, 98.6, 0, 16.8, 0.3, 9); formStack(L, 98.8, 0.72, 16.7, 0.35, 6);
  sandPile(L, 76.0, 0, 14.0, 2.0, 1.1);
  blockPallet(L, 103.2, 0, 14.4, 0.2); blockPallet(L, 104.5, 0, 14.6, 0.05, 3);
  cableDrum(L, 95.6, 0, 3.6, 0.9, 0.62);
  concreteHopper(L, 106.2, 0, 21.4);
  concreteBags(L, 94.2, 0, 22.6, 0.2);
  P.dumpster(L, 104.6, 0, 26.2, Math.PI + 0.1, 0x2a4a3a);
  P.floodLight(L, 100.6, 0, 27.2, -0.2, { h: 5, intensity: 34, range: 26, flicker: 0.1 });
  const wt0 = [72, 22.4, 80, 25.8];
  cabin(L, wt0[0], wt0[1], wt0[2], wt0[3], { door: 'n', doorX: 77.2, tint: 0xc8b890, boarded: false });
  L.light(73.4, 0.62 + 2.1, 24.8, 0xff2a10, 3, 5, { flicker: 0.2 });
  L.box(73.3, 0.62 + 2.3, 25.62, 73.5, 0.62 + 2.4, 25.7, 'emissiveRed', NC);
  L.witchSpots.push({ x: 73.6, y: 0.62, z: 24.3 });
  L.item('pills', 79.2, 0.64, 25.3, { chance: 0.6 });
  L.item('molotov', 74.4, 0.64, 22.9, { chance: 0.5 });
  P.corpse(L, 76.4, 0.63, 24.9, 2.2, 0xe8c020); blood(L, 76.4, 0.62, 24.9, 1.4, 4);
  safetySign(L, 'FIRST AID', 78.8, 2.2, 22.36, 0, 0.6, 0.3, 'safe');
  graffiti(L, 'SHE CRIES\nLET HER', 75.0, 1.5, 22.34, 0, 1.4, 0.7, '#b8201a');
  // (loot the crew left behind)
  L.item('throwable', 96.8, 0.02, 4.2, { chance: 0.5 });
  L.item('ammo', 72.5, 0.02, 1.8, { chance: 0.5 });
  // ---- collapsed scaffold on the south face of the frame
  const cs = P.prop(L, 103.5, 0, 8.4, 0);
  for (let i = 0; i < 9; i++) cs.tube(-6 + i * 1.4, 0.05 + (i % 3) * 0.08, -1.8 + rng() * 0.8, -5 + i * 1.3 + rng() * 2, 0.1 + rng() * 1.6, 1.4 + rng() * 1.2, 0.024, 'metalClean', 0x9a9e9e, 6);
  for (let i = 0; i < 7; i++) cs.box(-5 + i * 1.6 + rng(), 0.12 + rng() * 0.5, -0.4 + rng() * 2, 2.4, 0.05, 0.26, 'wood', rng.pick([0xb09a78, 0xa08a68]), [rng() * 0.4, rng() * 1.2, rng() * 0.3]);
  cs.box(-2, 0.9, 1.6, 6, 0.004, 2.2, 'chainLink', 0x3a6a3a, [0.9, 0.1, 0.1]);
  cs.col(-1, 0.4, 0.2, 12, 0.8, 3.2, 'metal', F_SOLID | F_SHOOT);
  P.scaffolding(L, 99.4, 0, 6.8, 0, 6, 1, { walkable: false });
  P.corpse(L, 106.8, 0.02, 9.6, 0.8, 0xe86a10); blood(L, 106.8, 0, 9.6, 2.0, 4);
  hardHat(L, 105.8, 0, 10.4, 0.5, 0xf0f0e8);
  safetySign(L, 'SCAFFOLD\nINCOMPLETE\nDO NOT USE', 96.6, 1.2, 6.9, 0, 0.6, 0.6, 'danger');
  // ---- front-side scaffold run on the north face (decks unreachable for survivors)
  P.scaffolding(L, 103.0, 0, -23.0, 0, 12, 2, { netting: true });
  // signs in the yard
  const sp = (x, z, text, kind, ry = 0) => { L.box(x - 0.04, 0, z - 0.04, x + 0.04, 1.6, z + 0.04, 'metalDark'); safetySign(L, text, x, 1.9, z, ry, 1.1, 0.6, kind); };
  sp(82.6, -6.4, 'SITE OFFICE\n← VISITORS', 'notice', 0.4);
  sp(93.2, -2.2, 'HARD HAT AREA\nBEYOND THIS POINT', 'mandatory', Math.PI / 2);
  sp(86.2, 8.2, 'DANGER\nOVERHEAD LOADS', 'warning', 0.3);
  safetySign(L, 'EMERGENCY\nASSEMBLY POINT', 69.0, 2.2, 28.0, 0, 1.1, 0.6, 'safe');
  // blood trail from the gate toward the office
  for (let i = 0; i < 9; i++) L.decal(71 + i * 1.9, 0.013, -3 - i * 2.4 + Math.sin(i) * 0.6, 0, 1, 0, 0.9, DF.SMEAR);
  L.reverb(68, 0, -34, SEP[0], 30, 30, 'outdoor');
  // festoon of caged work bulbs strung along the haul road to the frame (the path reads from the gate)
  festoon(L, [[69.4, 2.9], [78.2, 3.3], [87.0, 2.7], [95.2, 2.3]], 3.3, { dead: [3, 11], every: 5 });
  return { crane };
}

// ------------------------------------------------------------- the frame --
function frame(L, game) {
  const { x0, x1, z0, z1 } = BLD;
  const G = LV.G, L2 = LV.L2;
  L.box(x0, 0, z0, x1, G, z1, 'concreteFloor', { tint: 0x8a8680 });
  const coreHole = [CORE.x0, CORE.z0, CORE.x1, CORE.z1];
  const fallHole = [113.1, -4.9, x1, z1];
  floorWithHoles(L, x0, z0, x1, z1, L2, 0.3, 'concreteFloor', [coreHole, fallHole], { tint: 0x9a968e });
  floorWithHoles(L, x0, z0, x1, z1, LV.L3, 0.3, 'concrete', [coreHole], { tint: 0xa09c94 });
  floorWithHoles(L, x0, z0, x1, z1, LV.L4, 0.3, 'concrete', [coreHole], { tint: 0xa09c94 });
  floorWithHoles(L, x0, z0, 110, z1, LV.L5, 0.3, 'concrete', [[CORE.x0, CORE.z0, 110, CORE.z1]], { tint: 0xa8a49c });
  // slab edge lips (visual thickness under each slab edge)
  for (const y of [L2, LV.L3, LV.L4]) {
    L.box(x0 - 0.02, y - 0.42, z0 - 0.02, x1 + 0.02, y - 0.3, z0 + 0.25, 'concrete', { collide: false, tint: 0x8a867e });
    L.box(x0 - 0.02, y - 0.42, z1 - 0.25, x1 + 0.02, y - 0.3, z1 + 0.02, 'concrete', { collide: false, tint: 0x8a867e });
  }
  // columns (skip the core; one ground-floor column in the collapsed bay is broken)
  const inCore = (x, z) => x > CORE.x0 - 0.3 && x < CORE.x1 + 0.3 && z > CORE.z0 - 0.3 && z < CORE.z1 + 0.3;
  for (const x of CX) for (const z of CZ) {
    if (inCore(x, z)) continue;
    const broken = x === 118.9 && z === 0.7;
    column(L, x, z, G, broken ? 1.8 : L2 - 0.3, { bars: broken });
    column(L, x, z, L2, LV.L3 - 0.3);
    column(L, x, z, LV.L3, LV.L4 - 0.3);
    column(L, x, z, LV.L4, LV.L5 - 0.3, { collide: false });
    if (x < 110) column(L, x, z, LV.L5, LV.L5 + 1.2, { collide: false, bars: true });
    else column(L, x, z, LV.L5 - 0.3, LV.L5 + 0.4, { collide: false, bars: true });
  }
  // core: cast walls with openings (G west entry, L2 east exit)
  const cw = 'concreteDark', top = LV.L5 + 2.4;
  L.wallZ(CORE.z0, CORE.z1, CORE.x0 + 0.15, G, top, cw, 0.3, [{ a: -11.7, b: -9.9, y0: G, y1: G + 2.3 }]);
  L.wallZ(CORE.z0, CORE.z1, CORE.x1 - 0.15, G, top, cw, 0.3, [{ a: -11.7, b: -9.9, y0: L2, y1: L2 + 2.3 }]);
  L.wallX(CORE.x0 + 0.3, CORE.x1 - 0.3, CORE.z0 + 0.15, G, top, cw, 0.3);
  L.wallX(CORE.x0 + 0.3, CORE.x1 - 0.3, CORE.z1 - 0.15, G, top, cw, 0.3);
  // stairs: flight 1 (+z, west half) -> landing -> flight 2 (-z, east half) -> top landing
  const ix0 = CORE.x0 + 0.3, ix1 = CORE.x1 - 0.3, xm = 108.9, zi0 = CORE.z0 + 0.3, zi1 = CORE.z1 - 0.3;
  L.stairs(ix0, -9.9, xm, -6.1, G, 2.3, '+z', 'concrete', { stepH: 0.21 });
  L.box(ix0, G, -6.1, ix1, 2.3, zi1, 'concrete', { tint: 0x9a968e });
  L.stairs(xm + 0.2, -9.9, ix1, -6.1, 2.3, L2, '-z', 'concrete', { stepH: 0.21 });
  L.box(xm + 0.2, G, -9.9, ix1, 2.1, -6.1, cw);
  L.box(xm, G, -9.9, xm + 0.2, 5.4, -6.1, cw);
  L.box(xm + 0.2, L2 - 0.3, zi0, ix1, L2, -9.9, 'concrete');
  L.box(xm + 0.2, G, zi0, ix1, L2 - 0.3, -9.9, cw);
  L.box(xm + 0.15, L2, zi0, xm + 0.25, L2 + 1.1, -9.9, 'metalDark', { tint: 0xd8a820 });
  L.box(xm + 0.1, L2, zi0, xm + 0.3, L2 + 1.6, -9.9, 'concrete', { visible: false, flags: CLIP });
  ceilingLight(L, 107.6, LV.L3 - 0.3, -8.0, { type: 'cage', intensity: 7, range: 9, flicker: 0.3 });
  ceilingLight(L, 110.4, L2 + 2.6, -11.0, { type: 'cage', intensity: 5, range: 6, flicker: 0.15 });
  sign(L, 'CORE A\nSTAIR ↑ L2', CORE.x0 - 0.02, G + 2.7, -10.8, -Math.PI / 2, 1.0, 0.45, { bg: '#e8c020', fg: '#111' });
  graffiti(L, 'UP & OVER\n↑', CORE.x0 - 0.02, G + 1.3, -12.9, -Math.PI / 2, 1.1, 0.6, '#e8e8d8', { style: 'stencil' });
  graffiti(L, 'LEVEL 2', CORE.x1 + 0.02, L2 + 1.8, -8.0, Math.PI / 2, 1.6, 0.5, '#d8d8c8', { style: 'stencil' });
  graffiti(L, 'LEVEL 1', CORE.x0 - 0.02, G + 3.0, -6.5, -Math.PI / 2, 1.6, 0.5, '#d8d8c8', { style: 'stencil' });
  L.reverb(CORE.x0, G, CORE.z0, CORE.x1, L2 + 3, CORE.z1, 'stairwell');
  // ---- ground floor, west part (front side): stacked materials, plastic sheeting
  const PS = new PlasticSheets();
  for (const [a, b] of [[-21.7, -16.1], [-4.9, 0.7]]) PS.add(x0 + 0.28, G + 0.2, a, x0 + 0.3, L2 - 0.4, b, 0xd8e0e0);
  PS.add(CX[1], G + 0.3, z1 - 0.3, CX[2], L2 - 0.4, z1 - 0.28, 0xd8e0e0);
  shoring(L, 97.5, -3.5, 104.5, 4.5, G, L2 - 0.3, 1.5);
  drywallStack(L, 100.4, G, -19.4, 0.1, 14); drywallStack(L, 100.4, G + 0.45, -19.4, 0.15, 10);
  concreteBags(L, 103.2, G, -17.6, 0.3);
  blockPallet(L, 98.8, G, -12.6, 0.2); blockPallet(L, 98.6, G, -14.0, -0.1, 3);
  timberStack(L, 104.6, G, -1.2, 0.05, 5, 3.6);
  toolCart(L, 104.2, G, -13.6, 0.8);
  P.cementMixer(L, 101.8, G, -7.4, 1.2);
  wheelbarrow(L, 103.4, G, -8.8, 2.2, 0xd86a1a);
  cableDrum(L, 110.4, G, 2.8, 0.2, 0.55);
  hardHat(L, 102.8, G, -10.6, 0.3); hardHat(L, 100.2, G, -9.2, 1.9, 0xf0f0e8);
  workLight(L, 98.6, G, -9.6, -Math.PI / 2 - 0.4, { intensity: 14, range: 13, flicker: 0.12 });
  P.corpse(L, 105.0, G + 0.01, -11.0, 1.4, 0xe8c020); blood(L, 105.0, G, -11.0, 1.8, 4);
  for (let i = 0; i < 5; i++) L.decal(99 + i * 1.5, G + 0.013, -10.5 + Math.sin(i * 2) * 0.4, 0, 1, 0, 0.8, DF.SMEAR);
  L.item('health', 104.3, G + 0.92, -13.6, { chance: 0.5 });
  L.item('melee', 99.8, G + 0.02, -6.6, { chance: 0.5 });
  // partition that closes off the collapsed east half of the ground floor
  L.box(113.1, G, z0, 113.3, L2 - 0.3, z1, 'woodPale', { tint: 0x2a4a5e, surf: 'wood' });
  for (let z = z0 + 1.2; z < z1; z += 2.44) L.box(112.98, G, z, 113.1, L2 - 0.35, z + 0.1, 'wood', { collide: false, tint: 0x9a8a6a });
  safetySign(L, 'DANGER\nUNSAFE STRUCTURE\nNO ENTRY', 113.08, G + 1.7, -8.0, -Math.PI / 2, 1.3, 0.9, 'danger');
  safetySign(L, 'DANGER\nUNSAFE STRUCTURE\nNO ENTRY', 113.32, G + 1.7, -8.0, Math.PI / 2, 1.3, 0.9, 'danger');
  graffiti(L, 'SLAB CAME\nDOWN. 3\nUNDER IT', 113.08, G + 1.3, 0.5, -Math.PI / 2, 1.6, 1.0, '#b8201a');
  ceilingLight(L, 101.9, L2 - 0.3, -10.5, { type: 'bulb', intensity: 8, range: 9, flicker: 0.2 });
  ceilingLight(L, 101.9, L2 - 0.3, 0.7, { type: 'bulb', on: false });
  L.reverb(x0, G, z0, 113.1, L2 - 0.3, z1, 'room');
  // ---- ground floor, east part (rear side): the collapsed bay
  const fs = P.prop(L, 118.6, 0, 0.6, 0);
  fs.box(0, 2.1, 0, 11.4, 0.3, 10.6, 'concrete', 0x8a867e, [0, 0, -0.34]);
  for (let i = 0; i < 18; i++) fs.tube(-5 + rng() * 10, 1.0 + rng() * 2.2, -5 + rng() * 10, -5 + rng() * 10, 1.4 + rng() * 2.4, -5 + rng() * 10, 0.012, 'rust', 0x6a4a36, 4);
  L.box(113.3, G, -4.6, 116.8, 3.6, 5.8, 'concrete', { visible: false });
  L.box(116.8, G, -4.6, 120.4, 2.4, 5.8, 'concrete', { visible: false });
  L.box(120.4, G, -4.6, 123.2, 1.2, 5.8, 'concrete', { visible: false });
  P.debris(L, 121.6, G, -3.2, 1.6, 'concrete', 12);
  P.debris(L, 116.0, G, 5.0, 1.2, 'concreteDark', 10);
  P.corpse(L, 122.8, G + 0.01, 2.2, 0.3, 0xe86a10); blood(L, 122.6, G, 2.0, 2.0, 4);
  formStack(L, 118.8, G, -12.0, 0.2, 10); formStack(L, 116.2, G, -18.4, 1.4, 8);
  drywallStack(L, 121.6, G, -14.8, 1.5, 16);
  L.reverb(113.3, G, z0, x1, L2 - 0.3, z1, 'room');
  // ---- level 2
  shoring(L, 97.2, -21, 105, 4.8, L2, LV.L3 - 0.3, 1.5);
  const PS2 = PS;
  PS2.add(x0 + 0.28, L2 + 0.2, -10, x0 + 0.3, LV.L3 - 0.4, -4.9, 0xd8e0e0);
  drywallStack(L, 115.6, L2, -8.4, 0.3, 12);
  blockPallet(L, 118.8, L2, -13.0, 0.4); blockPallet(L, 120.2, L2, -13.2, 0.1, 3);
  P.rebarBundle(L, 116.8, L2, -20.6, 0.02, 4.5, 14);
  cableDrum(L, 121.8, L2, -7.4, 1.1, 0.55);
  concreteBags(L, 114.2, L2, -15.0, 0.2);
  sawhorse(L, 117.4, L2, -16.8, 1.2);
  P.portableToilet(L, 122.8, L2, -21.2, Math.PI);
  wheelbarrow(L, 119.6, L2, -9.4, 0.4);
  P.generator(L, 114.0, L2, -18.6, 0.1);
  workLight(L, 114.8, L2, -12.4, -2.4, { intensity: 16, range: 14, flicker: 0.05 });
  workLight(L, 122.4, L2, -16.2, Math.PI / 2 + 0.3, { intensity: 12, range: 12, flicker: 0.2 });
  P.corpse(L, 118.2, L2 + 0.01, -17.6, 2.8, 0x3a4a5a); blood(L, 118.2, L2, -17.6, 1.6, 4);
  hardHat(L, 119.2, L2, -18.4, 0.8, 0xe8c020);
  for (let i = 0; i < 6; i++) L.decal(113 + i * 1.8, L2 + 0.013, -10.8 - i * 1.3, 0, 1, 0, 0.8, DF.SMEAR);
  L.item('pills', 115.6, L2 + 0.55, -8.4, { chance: 0.6 });
  L.item('tier2', 121.0, L2 + 0.02, -20.8, { chance: 0.4 });
  L.item('throwable', 114.0, L2 + 1.2, -18.6, { chance: 0.4 });
  // festoon lights strung along the core on L2
  for (let i = 0; i < 9; i++) { const x = 112.4 + i * 1.3; L.box(x - 0.05, L2 + 2.7 - (i % 2) * 0.12, -12.3, x + 0.05, L2 + 2.8 - (i % 2) * 0.12, -12.2, i === 4 ? 'blackMatte' : 'emissiveWarm', NC); }
  L.light(116, L2 + 2.5, -12.6, 0xffd0a0, 6, 10, { flicker: 0.1 });
  // edge protection on L2 (gap for the scaffold stair tower; the collapse hole)
  edgeRail(L, 'x', x0, x1, z0 + 0.05, L2);
  edgeRail(L, 'z', z0, TOWER_ST.z0, x1 - 0.05, L2);
  edgeRail(L, 'z', TOWER_ST.z0 + 1.6, -4.9, x1 - 0.05, L2);
  edgeRail(L, 'x', 113.1, x1, -4.95, L2, { meshTint: 0xc8a020 });
  edgeRail(L, 'z', -4.9, z1, 113.05, L2);
  edgeRail(L, 'z', z0, -10.0, x0 + 0.05, L2);
  edgeRail(L, 'x', x0, 104, z1 - 0.05, L2, { mesh: false });
  safetySign(L, 'FLOOR OPENING\nFALL HAZARD', 116.0, L2 + 1.3, -4.9, 0, 0.9, 0.5, 'danger');
  safetySign(L, 'SHORING\nDO NOT REMOVE', 104.6, L2 + 1.6, -12.1, 0, 0.8, 0.45, 'warning');
  safetySign(L, 'SCAFFOLD STAIR →\nPERMIT HOLDERS ONLY', 123.5, L2 + 1.6, -21.9, 0, 1.1, 0.45, 'notice');
  graffiti(L, 'THEY TOOK\nTHE STAIRS\nDOWN →', 123.0, L2 + 1.3, -12.2, 0, 1.4, 0.8, '#b8201a');
  L.reverb(x0, L2, z0, x1, LV.L3 - 0.3, z1, 'room');
  // ---- upper floors (unreachable): formwork, rebar mats, a concrete bucket
  P.formwork(L, 100.0, LV.L5, -21.6, 0, 6, 1.6);
  P.formwork(L, 96.4, LV.L5, -14.0, Math.PI / 2, 6, 1.6);
  for (let i = 0; i < 4; i++) P.rebarBundle(L, 99.0 + i * 2.4, LV.L5, -6.0, 0.02, 4, 10);
  edgeRail(L, 'x', x0, x1, z1 - 0.05, LV.L3, { clip: false });
  edgeRail(L, 'x', x0, x1, z0 + 0.05, LV.L3, { clip: false });
  edgeRail(L, 'x', x0, x1, z0 + 0.05, LV.L4, { clip: false, mesh: false });
  edgeRail(L, 'z', z0, z1, x0 + 0.05, LV.L4, { clip: false, mesh: false });
  concreteHopper(L, 103.6, LV.L5, -1.0);
  for (const [x, y, z] of [[99, LV.L3, -22.3], [120, LV.L4, 6.3], [104, LV.L5 + 0.8, 6.3]]) L.light(x, y + 1.6, z, 0xffd8a0, 5, 9, { flicker: 0.2 });
  for (const [x, y, z] of [[99, LV.L3, -22.3], [120, LV.L4, 6.3], [104, LV.L5 + 0.8, 6.3]]) L.box(x - 0.2, y + 1.5, z - 0.05, x + 0.2, y + 1.75, z + 0.05, 'emissiveWarm', NC);
  PS.add(CX[3], LV.L3 + 0.2, z1 - 0.3, CX[5], LV.L4 - 0.4, z1 - 0.28, 0xd8e0e0);
  PS.add(CX[0], LV.L4 + 0.2, z0 + 0.28, CX[2], LV.L5 - 0.4, z0 + 0.3, 0xd8e0e0);
  PS.build(L);
  sign(L, 'SKYLINE TOWER', 110, LV.L4 + 1.8, z0 - 0.06, Math.PI, 8, 1.6, { bg: '#1a3a5a', fg: '#e8e0c0' });
  // ---- scaffold stair tower (L2 -> rear yard)
  scaffoldStairTower(L, TOWER_ST, 0, L2);
  L.reverb(TOWER_ST.x0, 0, TOWER_ST.z0, TOWER_ST.x1, L2 + 2, TOWER_ST.z1, 'outdoor');
  // material hoist on the north face (rear side)
  materialHoist(L, 118.0, -23.4, LV.L5 + 3, { cageY: 0.2 });
  safetySign(L, 'MATERIAL HOIST\nNO PASSENGERS', 118.0, 2.2, -25.6, 0, 1.2, 0.5, 'danger');
  return { PS };
}

// ------------------------------------------------------------- rear yard --
function rearYard(L, game) {
  // container lines separating the yards (2 high), north and south of the frame
  const cc = [0x2a4a7a, 0x8a2a1a, 0x3a5a3a, 0xb86a1a];
  container(L, SEP[0], 0, -33.88, SEP[1], 2.6, -22.0, cc[0], {});
  container(L, SEP[0], 2.6, -33.88, SEP[1], 5.2, -22.0, cc[2], {});
  container(L, SEP[0], 0, 6.0, SEP[1], 2.6, 18.0, cc[1], {});
  container(L, SEP[0], 0, 18.0, SEP[1], 2.6, 29.88, cc[3], {});
  container(L, SEP[0], 2.6, 6.0, SEP[1], 5.2, 18.0, cc[3], {});
  container(L, SEP[0], 2.6, 18.0, SEP[1], 5.2, 29.88, cc[0], {});
  for (const [z, t] of [[-28, 'NCC SITE STORAGE 04'], [12, 'NCC 11'], [24, 'HAUL-IT']]) { sign(L, t, SEP[0] - 0.05, 1.8, z, -Math.PI / 2, 2.2, 0.5, { bg: '#e8e0c8', fg: '#1a2a4a' }); sign(L, t, SEP[1] + 0.05, 1.8, z, Math.PI / 2, 2.2, 0.5, { bg: '#e8e0c8', fg: '#1a2a4a' }); }
  // site cabins along the north hoarding
  P.siteTrailer(L, 131.0, 0, -31.0, Math.PI, 7);
  P.siteTrailer(L, 139.5, 0, -31.0, Math.PI, 7);
  // pre-crescendo supplies on a cabin porch table
  supplies(L, 135.2, 0, -27.2, 0, [{ type: 'ammo' }, { type: 'health', chance: 0.7 }, { type: 'throwable', chance: 0.6 }], { w: 2.0, mat: 'metalDark' });
  L.item('tier2', 133.6, 0.02, -26.6, { chance: 0.6 });
  L.item('pills', 137.0, 0.02, -26.4, { chance: 0.5 });
  // concrete truck + pump abandoned mid-pour (south)
  const ct = P.prop(L, 132.4, 0, 16.6, Math.PI / 2 + 0.2);
  ct.box(0, 0.8, 0, 2.3, 0.3, 8.0, 'metalDark', 0x222222).rbox(0, 1.6, -3.1, 2.4, 1.9, 1.8, 0.1, 'carPaint', 0xe8e4d8).box(0, 1.9, -4.02, 2.1, 0.8, 0.03, 'glassDirty', 0x1a2024);
  ct.frustum(0, 2.3, 0.6, 1.1, 1.3, 2.8, 'paintedWhite', 0xd8d4c8, [Math.PI / 2 - 0.25, 0, 0], 18).frustum(0, 2.9, 2.6, 0.5, 1.1, 1.6, 'paintedWhite', 0xd8d4c8, [Math.PI / 2 - 0.25, 0, 0], 18);
  ct.tube(0, 2.6, 3.4, 0, 1.2, 4.6, 0.25, 'paintedYellow', 0xd8a020, 10);
  for (const sz of [-3.1, 1.2, 2.6]) for (const sx of [-1.05, 1.05]) ct.cylX(sx, 0.5, sz, 0.5, 0.3, 'rubber', 0x151515, 14);
  ct.col(0, 1.6, 0, 2.5, 3.2, 8.4, 'metal');
  sign(L, 'NEWBURG READY-MIX', 131.0, 2.4, 16.2, Math.PI / 2 + 0.2, 2.4, 0.5, { bg: '#e8e4d8', fg: '#1a3a8a' });
  L.decal(134.4, 0.015, 21.0, 0, 1, 0, 3.0, DF.POOL, { alpha: 0.4 });
  // rebar cages, blocks, formwork, a skip, portaloos
  for (const [x, z, r] of [[119.5, 12.6, 0.1], [121.8, 15.4, 1.5], [140.0, 20.8, 0.4]]) {
    const rc = P.prop(L, x, 0, z, r);
    for (const sx of [-0.5, 0.5]) for (const sy of [0.1, 1.1]) rc.cylZ(sx, sy + 0.05, 0, 0.012, 4, 'rust', 0x6a4a36, 4);
    for (let k = -1.8; k <= 1.8; k += 0.4) rc.box(0, 0.65, k, 1.05, 1.1, 0.02, 'rust', 0x6a4a36);
    rc.col(0, 0.6, 0, 1.1, 1.2, 4, 'metal', F_SOLID | F_SHOOT);
  }
  blockPallet(L, 128.6, 0, 4.6, 0.2); blockPallet(L, 130.0, 0, 4.4, -0.1); blockPallet(L, 129.2, 0, 5.9, 0.3, 2);
  formStack(L, 142.6, 0, -18.6, 0.2, 8);
  timberStack(L, 141.4, 0, 12.4, 0.1, 5, 3.6);
  P.dumpster(L, 118.2, 0, 26.6, Math.PI, 0xb8601a);
  for (let i = 0; i < 2; i++) P.portableToilet(L, 145.8, 0, 22.4 + i * 1.25, -Math.PI / 2);
  cableDrum(L, 137.8, 0, -14.2, 0.4, 0.7);
  P.generator(L, 144.6, 0, -24.8, Math.PI / 2);
  sandPile(L, 124.8, 0, 22.4, 2.2, 1.2);
  // floodlights on the gate (the barricade is lit up like a stage)
  P.floodLight(L, 134.2, 0, -12.6, -2.2, { h: 5, intensity: 40, range: 28 });
  P.floodLight(L, 135.4, 0, 8.4, -0.65, { h: 5, intensity: 34, range: 26, flicker: 0.15 });
  for (const [x, z] of [[131.4, -18.0], [126.8, 10.4], [143.6, 14.6]]) hardHat(L, x, 0, z, rng() * 6);
  P.corpse(L, 138.4, 0.01, -9.8, 2.2, 0x3a4a2a); blood(L, 138.4, 0, -9.8, 1.6, 4);
  P.corpse(L, 129.6, 0.01, -3.6, 0.2, 0xe8c020);
  safetySign(L, 'SITE EXIT\nDELIVERIES ONLY', 147.86, 2.2, BAR.z0 - 1.2, -Math.PI / 2, 1.0, 0.5, 'notice');
  safetySign(L, 'CAUTION\nWIDE LOADS', 147.86, 2.2, BAR.z1 + 1.2, -Math.PI / 2, 0.9, 0.5, 'warning');
  L.reverb(SEP[1], 0, -34, 148, 30, 30, 'outdoor');
}

export function buildSite(L, game) {
  perimeter(L, game);
  const F = frontYard(L, game);
  const B = frame(L, game);
  rearYard(L, game);
  return { crane: F.crane, ...B };
}
