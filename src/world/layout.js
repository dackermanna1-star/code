// GRAVELMOUTH STATE PENITENTIARY — original facility layout (pure data, metres).
// Map axes: +x = east, +z = south. Rooms are axis-aligned rectangles [x0, z0, x1, z1].
// Walls are generated automatically on room boundaries; `openings` punch doorways,
// barred fronts and door entities into those boundaries.

export const BUILDING = { x0: 0, z0: 0, x1: 76, z1: 66, height: 7.5 };
export const WORLD_BOUNDS = { x0: -20, z0: -6, x1: 96, z1: 120 };

// floor: texture key; ceil: ceiling height (null = outdoors); restricted: who may be here.
export const ROOMS = [
  { id: 'infirmary', name: 'Infirmary', rect: [0, 0, 32, 10], floor: 'linoBlue', wall: 'clinic', ceil: 4.5 },
  { id: 'warden', name: "Warden's Office", rect: [32, 0, 44, 6], floor: 'carpet', wall: 'office', ceil: 4.5, restricted: 'office' },
  { id: 'guardroom', name: 'Guard Room', rect: [44, 0, 64, 10], floor: 'concrete', wall: 'staff', ceil: 4.5, restricted: 'staff' },
  { id: 'solitary', name: 'Solitary', rect: [64, 0, 76, 10], floor: 'concreteDark', wall: 'grim', ceil: 4.2, restricted: 'staff' },
  { id: 'hall', name: 'Central Hall', rect: [32, 6, 44, 66], floor: 'concretePolished', wall: 'institution', ceil: 6.5 },
  { id: 'blockA', name: 'Cell Block A', rect: [0, 10, 32, 32], floor: 'concrete', wall: 'institution', ceil: 7.0 },
  { id: 'blockB', name: 'Cell Block B', rect: [44, 10, 76, 32], floor: 'concrete', wall: 'institution', ceil: 7.0 },
  { id: 'kitchen', name: 'Kitchen', rect: [0, 32, 10, 50], floor: 'tileRed', wall: 'kitchen', ceil: 5, restricted: 'kitchen' },
  { id: 'mess', name: 'Mess Hall', rect: [10, 32, 32, 50], floor: 'checker', wall: 'mess', ceil: 5.5 },
  { id: 'rec', name: 'Rec Room', rect: [44, 32, 62, 50], floor: 'linoGreen', wall: 'rec', ceil: 5 },
  { id: 'library', name: 'Library', rect: [62, 32, 76, 50], floor: 'carpetRed', wall: 'library', ceil: 5 },
  { id: 'showers', name: 'Showers', rect: [0, 50, 14, 66], floor: 'tileWhite', wall: 'tile', ceil: 4.5 },
  { id: 'laundry', name: 'Laundry', rect: [14, 50, 32, 66], floor: 'concrete', wall: 'institution', ceil: 5 },
  { id: 'gym', name: 'Gym', rect: [44, 50, 62, 66], floor: 'rubber', wall: 'gym', ceil: 5.5 },
  { id: 'workshop', name: 'Workshop', rect: [62, 50, 76, 66], floor: 'concreteLines', wall: 'workshop', ceil: 5.5, restricted: 'workshop' },
  // Outdoors
  { id: 'yard', name: 'The Yard', rect: [-10, 66, 86, 102], floor: 'grass', ceil: null, outdoor: true, restricted: 'yard' },
  { id: 'noman', name: 'Perimeter', rect: [-16, 60, 92, 108], floor: 'gravel', ceil: null, outdoor: true, restricted: 'always', under: true },
  { id: 'outside', name: 'Outside', rect: [-20, 108, 96, 120], floor: 'grass', ceil: null, outdoor: true, restricted: 'escape', under: true },
];

// Prison cells: generated per block. Each is 5m wide x 4.5m deep with a barred front.
export const CELL_W = 5, CELL_D = 4.5, CELL_H = 3.4;
function makeCells(block, xStart, zNorth, zSouth) {
  const cells = [];
  for (let i = 0; i < 6; i++) {
    const x0 = xStart + i * CELL_W;
    cells.push({ id: `${block}${String(i + 1).padStart(2, '0')}`, block, rect: [x0, zNorth, x0 + CELL_W, zNorth + CELL_D], front: 'S' });
  }
  for (let i = 0; i < 6; i++) {
    const x0 = xStart + i * CELL_W;
    cells.push({ id: `${block}${String(i + 7).padStart(2, '0')}`, block, rect: [x0, zSouth - CELL_D, x0 + CELL_W, zSouth], front: 'N' });
  }
  return cells;
}
export const CELLS = [...makeCells('A', 1, 10, 32), ...makeCells('B', 45, 10, 32)];
export const SOLITARY_CELLS = [
  { id: 'H1', block: 'H', rect: [64, 0, 68, 4.5], front: 'S', solitary: true },
  { id: 'H2', block: 'H', rect: [68, 0, 72, 4.5], front: 'S', solitary: true },
  { id: 'H3', block: 'H', rect: [72, 0, 76, 4.5], front: 'S', solitary: true },
];

// Openings on room boundaries. Segment from (x0,z0) to (x1,z1) must lie on a boundary line.
// kind: open (archway) | door (door entity) ; door: {style, access}
export const OPENINGS = [
  { a: [32, 6.5], b: [32, 8.5], kind: 'open' },                                   // infirmary -> hall
  { a: [37, 6], b: [39, 6], kind: 'door', door: { id: 'd_warden', style: 'office', access: 'office' } },
  { a: [44, 6.5], b: [44, 8.5], kind: 'door', door: { id: 'd_guardroom', style: 'staff', access: 'staff' } },
  { a: [64, 7], b: [64, 9], kind: 'door', door: { id: 'd_solitary', style: 'staff', access: 'staff' } },
  { a: [32, 19], b: [32, 23], kind: 'open' },                                      // block A
  { a: [44, 19], b: [44, 23], kind: 'open' },                                      // block B
  { a: [32, 39], b: [32, 43], kind: 'open' },                                      // mess hall
  { a: [10, 47], b: [10, 49], kind: 'door', door: { id: 'd_kitchen', style: 'staff', access: 'kitchen' } },
  { a: [10, 35], b: [10, 45], kind: 'open', counter: true },                       // serving counter gap
  { a: [44, 39], b: [44, 43], kind: 'open' },                                      // rec room
  { a: [62, 40], b: [62, 42.5], kind: 'open' },                                    // library
  { a: [32, 56], b: [32, 60], kind: 'open' },                                      // laundry
  { a: [14, 57], b: [14, 59.5], kind: 'open' },                                    // showers
  { a: [44, 56], b: [44, 60], kind: 'open' },                                      // gym
  { a: [62, 57], b: [62, 59], kind: 'door', door: { id: 'd_workshop', style: 'staff', access: 'workshop' } },
  { a: [36, 66], b: [40, 66], kind: 'door', door: { id: 'd_yardgate', style: 'gate', access: 'yard' } },
];

// Fences (outdoor). cut: id of a weak section that bolt cutters can open.
export const FENCES = [
  { a: [-10, 66], b: [-10, 102] }, { a: [86, 66], b: [86, 102] },
  { a: [-10, 102], b: [36, 102] }, { a: [36, 102], b: [39, 102], cut: 'f_inner' }, { a: [39, 102], b: [86, 102] },
  { a: [-10, 66], b: [0, 66] }, { a: [76, 66], b: [86, 66] },
  // outer perimeter
  { a: [-16, 60], b: [-16, 108] }, { a: [92, 60], b: [92, 108] },
  { a: [-16, 108], b: [36, 108] }, { a: [36, 108], b: [39, 108], cut: 'f_outer' }, { a: [39, 108], b: [92, 108] },
  { a: [-16, 60], b: [0, 60] }, { a: [76, 60], b: [92, 60] },
];

// Furniture placements: [type, x, z, rot(0..3 quarter turns), extra]
// Default "front" of a piece faces +z; rot 1 = faces +x... (yaw = rot * PI/2).
export const FURNITURE = [];
const F = (type, x, z, rot = 0, extra = {}) => FURNITURE.push({ type, x, z, rot, ...extra });

// --- Cells: bunk, toilet, sink, desk -------------------------------------------------
for (const c of [...CELLS, ...SOLITARY_CELLS]) {
  const [x0, z0, x1, z1] = c.rect;
  const north = c.front === 'S'; // north-row cells have the bars on their south side
  const back = north ? z0 + 0.15 : z1 - 0.15;
  const dir = north ? 1 : -1; // direction from back wall into the cell
  if (c.solitary) {
    F('cot', x0 + 0.7, back + dir * 1.2, north ? 0 : 2, { cell: c.id });
    F('toilet', x1 - 0.6, back + dir * 0.4, north ? 0 : 2, { cell: c.id });
    continue;
  }
  F('bunk', x0 + 0.65, back + dir * 1.15, north ? 0 : 2, { cell: c.id });
  F('toilet', x1 - 0.55, back + dir * 0.4, north ? 0 : 2, { cell: c.id });
  F('sink', x1 - 1.45, back + dir * 0.3, north ? 0 : 2, { cell: c.id });
  F('desk', x1 - 0.45, back + dir * 2.35, north ? 3 : 3, { cell: c.id });
  F('poster', (x0 + x1) / 2 - 0.4, back, north ? 0 : 2, { cell: c.id, seed: x0 * 7 + z0 });
}
// --- Cell block common areas -----------------------------------------------------------
for (const [bx, label] of [[0, 'A'], [44, 'B']]) {
  F('steelTable', bx + 7, 18.2); F('steelTable', bx + 13, 23.8); F('steelTable', bx + 19, 18.2); F('steelTable', bx + 25, 23.8);
  F('payphone', bx === 0 ? 0.2 : 75.8, 21, bx === 0 ? 1 : 3);
  F('tvWall', bx === 0 ? 0.2 : 75.8, 24.5, bx === 0 ? 1 : 3);
  F('blockSign', bx + 16, 14.4, 0, { text: `CELL BLOCK ${label}` });
}
// --- Central hall --------------------------------------------------------------------------
F('guardDesk', 38, 27, 0);
F('noticeBoard', 43.85, 30, 3);
F('bench', 33, 46, 1); F('bench', 33, 50, 1);
F('plant', 33, 12); F('plant', 43, 12); F('plant', 33, 64); F('plant', 43, 64);
F('vending', 43.4, 35, 3, { stock: 'snacks' });
// --- Infirmary -------------------------------------------------------------------------------
for (let i = 0; i < 5; i++) F('infirmaryBed', 3 + i * 4.2, 1.4, 0);
F('nurseDesk', 26, 6, 0); F('medCabinet', 30.5, 0.4, 0); F('curtain', 23.2, 2.5, 1);
F('plant', 31, 9);
// --- Warden's office --------------------------------------------------------------------
F('wardenDesk', 38, 2.2, 0); F('filing', 33, 0.6, 0); F('filing', 34, 0.6, 0); F('flag', 43, 0.8, 0); F('plant', 42.8, 5);
// --- Guard room --------------------------------------------------------------------------------
F('lockers', 50, 0.4, 0); F('lockers', 54, 0.4, 0); F('guardTable', 52, 5.5, 0); F('monitorDesk', 60, 0.6, 0);
F('crate', 62.6, 8.6, 0);
// --- Kitchen -------------------------------------------------------------------------------------
F('servingCounter', 10, 40, 1);
F('stove', 0.6, 36, 1); F('stove', 0.6, 39, 1); F('stove', 0.6, 42, 1);
F('prepTable', 5, 37.5, 0); F('prepTable', 5, 42.5, 0);
F('fridge', 2, 32.6, 0); F('fridge', 3.2, 32.6, 0); F('kitchenShelf', 7, 49.5, 2);
F('dishSink', 2.5, 49.4, 2);
// --- Mess hall ------------------------------------------------------------------------------------
for (const tx of [16, 25]) for (const tz of [35, 39.5, 44, 48]) F('messTable', tx, tz, 0);
F('trashCan', 31, 33); F('trashCan', 31, 49);
F('messSign', 21, 32.2, 0, { text: 'MESS HALL' });
// --- Rec room ---------------------------------------------------------------------------------------
F('tvStand', 52, 32.5, 0); F('couch', 50.2, 35.6, 2); F('couch', 53.8, 35.6, 2);
F('poolTable', 55, 44, 1);
F('cardTable', 47.5, 46.5, 0); F('cardTable', 47.5, 41.5, 0);
F('vending', 61.4, 33.5, 3, { stock: 'snacks' }); F('vending', 61.4, 35, 3, { stock: 'drinks' });
F('payphone', 61.8, 46, 3); F('payphone', 61.8, 47.4, 3);
F('pingPong', 57, 37.5, 0);
// --- Library ------------------------------------------------------------------------------------------
F('bookshelf', 64.5, 32.3, 0); F('bookshelf', 67, 32.3, 0); F('bookshelf', 69.5, 32.3, 0); F('bookshelf', 72, 32.3, 0); F('bookshelf', 74.5, 32.3, 0);
F('bookshelf', 75.7, 37, 3); F('bookshelf', 75.7, 39.5, 3); F('bookshelf', 75.7, 42, 3);
F('readingTable', 67, 39.5, 1); F('readingTable', 70.5, 45, 1);
F('chessTable', 66, 46.5, 0); F('chessTable', 74, 46.5, 0);
F('librarianDesk', 65.5, 42.8, 1);
// --- Showers --------------------------------------------------------------------------------------------
for (let i = 0; i < 6; i++) F('showerHead', 0.15, 52 + i * 2.2, 1);
F('bench', 7, 57.5, 0); F('bench', 7, 61.5, 0); F('lockers', 13.6, 52, 3); F('lockers', 13.6, 63, 3); F('drain', 3, 58);
// --- Laundry ---------------------------------------------------------------------------------------------
for (let i = 0; i < 5; i++) F('washer', 16 + i * 1.3, 65.4, 2);
for (let i = 0; i < 4; i++) F('dryer', 24 + i * 1.3, 65.4, 2);
F('foldTable', 20, 55, 0); F('foldTable', 26, 55, 0);
F('laundryCart', 17, 52); F('laundryCart', 29, 52.6); F('detergentShelf', 22, 50.4, 0);
// --- Gym ---------------------------------------------------------------------------------------------------
F('weightBench', 47, 53, 0); F('weightBench', 50.5, 53, 0); F('weightBench', 54, 53, 0);
F('squatRack', 58.5, 53, 0);
F('punchBag', 47.5, 61); F('punchBag', 50.5, 61);
F('treadmill', 55, 63.6, 2); F('treadmill', 57, 63.6, 2);
F('pullupBar', 60.8, 59, 3); F('dumbbellRack', 60.8, 55, 3); F('mat', 53.5, 58.5, 0);
F('gymSign', 53, 50.2, 0, { text: 'IRON IS PATIENT' });
// --- Workshop ------------------------------------------------------------------------------------------------
F('plateStamper', 66, 53, 0); F('plateStamper', 69, 53, 0); F('plateStamper', 72, 53, 0);
F('workbench', 67, 62.5, 2); F('workbench', 72, 62.5, 2);
F('toolRack', 75.8, 58, 3); F('crate', 64, 64.6); F('crate', 65, 64.8); F('plateStack', 75, 51.2);
// --- Yard ------------------------------------------------------------------------------------------------------
F('courtLines', 14, 80, 0);
F('hoop', 2.4, 80, 1); F('hoop', 25.6, 80, 3);
F('picnicTable', 37, 76, 0); F('picnicTable', 43, 76, 0); F('picnicTable', 40, 82, 0);
F('weightBenchOut', 60, 74, 0); F('weightBenchOut', 64, 74, 0); F('pullupBarOut', 70, 76, 1); F('dumbbellRack', 74, 74, 3);
F('bleachers', 40, 96, 2);
F('guardTower', 82, 98, 0); F('guardTower', -6, 98, 0);
F('benchOut', 10, 67.5, 0); F('benchOut', 66, 67.5, 0); F('benchOut', 50, 67.5, 0);
F('trashCan', 47, 70); F('lightPole', 14, 90); F('lightPole', 62, 90); F('lightPole', 45, 71.5);
F('yardSign', 38, 66.3, 0, { text: 'YARD' });

// Item spawn points: [itemType, x, z, respawnMinutes?]
export const ITEM_SPAWNS = [
  ['mop', 31, 64.5], ['mop', 15.4, 51], ['broom', 33.3, 65.3], ['broom', 2, 48.6], ['bucket', 31.3, 63.8],
  ['plasticChair', 47, 48.6], ['plasticChair', 49.6, 48.8], ['plasticChair', 58.8, 47.5], ['plasticChair', 34, 9.4],
  ['plasticChair', 3, 25], ['plasticChair', 74, 25], ['plasticChair', 20, 9.6],
  ['book', 65, 38.5], ['book', 71, 46], ['book', 66.4, 33.4], ['book', 73.5, 33.4],
  ['dumbbell', 60.2, 54.6], ['dumbbell', 60.2, 55.4], ['dumbbell', 73.4, 73.6], ['dumbbell', 73.4, 74.4],
  ['basketball', 14, 79], ['basketball', 8, 84],
  ['fryingPan', 5, 37.2], ['ladle', 5.4, 42.8], ['apple', 2.2, 33.6],
  ['wrench', 67, 62.2], ['screwdriver', 72.2, 62.2], ['boltCutters', 75.3, 58.4],
  ['keycard', 52, 5.4], ['baton', 60, 1.2],
  ['cards', 47.5, 46.5], ['cards', 47.5, 41.5], ['poolCue', 55, 46.2], ['poolCue', 55.4, 41.8],
  ['soap', 6.8, 57.6], ['soap', 1.2, 60.3], ['toiletRoll', 12.6, 64.5], ['pillow', 8, 1.3],
  ['tray', 10.6, 37], ['tray', 10.6, 41], ['tray', 10.6, 44], ['mug', 37.2, 27.3], ['newspaper', 33, 46.4],
];

// Guard posts and patrol loops.
export const GUARD_POSTS = {
  hallDesk: { x: 38, z: 25.9, yaw: 0 },
  blockA: { x: 30, z: 21, yaw: -Math.PI / 2 },
  blockB: { x: 46, z: 21, yaw: Math.PI / 2 },
  mess: { x: 30.5, z: 46, yaw: -Math.PI / 2 },
  yard: { x: 40, z: 69, yaw: 0 },
  yardEast: { x: 70, z: 88, yaw: -Math.PI / 2 },
  gym: { x: 46, z: 64, yaw: Math.PI / 2 },
  guardroom: { x: 56, z: 6, yaw: Math.PI },
  solitary: { x: 70, z: 8, yaw: Math.PI },
  infirmary: { x: 28, z: 8.5, yaw: -Math.PI / 2 },
  workshop: { x: 64, z: 60, yaw: Math.PI / 2 },
  laundry: { x: 30, z: 62, yaw: -Math.PI / 2 },
};
export const PATROLS = {
  hallLoop: [[38, 12], [38, 34], [38, 60], [38, 34]],
  blockLoop: [[38, 21], [16, 21], [4, 21], [16, 21], [38, 21], [60, 21], [72, 21], [60, 21]],
  wingLoop: [[38, 41], [21, 41], [38, 41], [53, 41], [38, 58], [23, 58], [38, 58], [53, 58]],
  yardLoop: [[38, 70], [14, 74], [8, 92], [38, 90], [70, 92], [78, 72], [38, 70]],
};

// Where the player and others enter the facility.
export const SPAWNS = { intake: { x: 38, z: 9.5, yaw: 0 }, infirmaryWake: { x: 3, z: 3.2, yaw: 0 } };

// Signs over doorways for navigation (text, x, z, facing yaw, y).
export const SIGNS = [
  { text: 'INFIRMARY', x: 32.2, z: 7.5, yaw: Math.PI / 2, y: 3.1 },
  { text: 'WARDEN', x: 38, z: 6.2, yaw: Math.PI, y: 3.1 },
  { text: 'STAFF ONLY', x: 43.8, z: 7.5, yaw: -Math.PI / 2, y: 3.1, warn: true },
  { text: 'CELL BLOCK A', x: 32.2, z: 21, yaw: Math.PI / 2, y: 4.6 },
  { text: 'CELL BLOCK B', x: 43.8, z: 21, yaw: -Math.PI / 2, y: 4.6 },
  { text: 'MESS HALL', x: 32.2, z: 41, yaw: Math.PI / 2, y: 4.6 },
  { text: 'REC ROOM', x: 43.8, z: 41, yaw: -Math.PI / 2, y: 4.6 },
  { text: 'LAUNDRY', x: 32.2, z: 58, yaw: Math.PI / 2, y: 4.6 },
  { text: 'GYM', x: 43.8, z: 58, yaw: -Math.PI / 2, y: 4.6 },
  { text: 'YARD', x: 38, z: 65.8, yaw: 0, y: 4.6 },
  { text: 'SHOWERS', x: 14.2, z: 58.2, yaw: Math.PI / 2, y: 3.0 },
  { text: 'LIBRARY', x: 61.8, z: 41.2, yaw: -Math.PI / 2, y: 3.0 },
  { text: 'WORKSHOP', x: 61.8, z: 58, yaw: -Math.PI / 2, y: 3.0 },
  { text: 'KITCHEN', x: 10.2, z: 48, yaw: Math.PI / 2, y: 3.0 },
];
