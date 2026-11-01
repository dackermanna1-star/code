// Furniture catalog (pure data). Local space: the piece's "front" faces +z, x is its width.
// size: [width (x), depth (z)], h: height. collide: footprint blocks movement (default true).
// spots: activity points — pos: local [x, z] where the user ends up; y: seat/lie height;
//   yaw: local facing; approach: candidate local points to walk to first; pose: animation set;
//   activity: key into gameplay/activities.js.
const sit = (x, z, yaw, activity, extra = {}) => ({ pos: [x, z], y: 0.46, yaw, pose: 'sit', activity, approach: [[x + Math.sin(yaw) * -0.62, z + Math.cos(yaw) * -0.62]], ...extra });
const stand = (x, z, yaw, activity, extra = {}) => ({ pos: [x, z], y: 0, yaw, pose: 'stand', activity, approach: [[x, z]], ...extra });

export const FURNITURE_TYPES = {
  bunk: { size: [0.95, 2.05], h: 1.9, spots: [
    { pos: [0, -0.05], y: 0.5, yaw: 0, pose: 'lie', activity: 'sleep', approach: [[0.85, 0.35], [-0.85, 0.35]], bunk: 'low' },
    { pos: [0, -0.05], y: 1.47, yaw: 0, pose: 'lie', activity: 'sleep', approach: [[0.85, 0.55], [-0.85, 0.55]], bunk: 'high' },
  ] },
  cot: { size: [0.8, 1.9], h: 0.45, spots: [{ pos: [0, -0.05], y: 0.45, yaw: 0, pose: 'lie', activity: 'sleep', approach: [[0.75, 0.3], [-0.75, 0.3]] }] },
  toilet: { size: [0.5, 0.62], h: 0.8, spots: [{ pos: [0, 0.18], y: 0.42, yaw: 0, pose: 'sit', activity: 'toilet', approach: [[0, 0.8]] }] },
  sink: { size: [0.55, 0.4], h: 0.95, spots: [stand(0, 0.62, Math.PI, 'wash')] },
  desk: { size: [1.0, 0.5], h: 0.78, spots: [sit(0, 0.6, Math.PI, 'write')] },
  poster: { size: [0.7, 0.04], h: 1.0, collide: false, decor: true },
  steelTable: { size: [1.1, 1.1], h: 0.75, spots: [
    sit(0.82, 0, -Math.PI / 2, 'hangout'), sit(-0.82, 0, Math.PI / 2, 'hangout'), sit(0, 0.82, Math.PI, 'hangout'), sit(0, -0.82, 0, 'hangout')] },
  payphone: { size: [0.5, 0.3], h: 1.9, spots: [stand(0, 0.55, Math.PI, 'phone')] },
  tvWall: { size: [1.3, 0.2], h: 0.1, collide: false, decor: true },
  blockSign: { size: [5, 0.05], collide: false, decor: true },
  messSign: { size: [5, 0.05], collide: false, decor: true },
  gymSign: { size: [5, 0.05], collide: false, decor: true },
  yardSign: { size: [3, 0.05], collide: false, decor: true },
  guardDesk: { size: [3.0, 1.0], h: 1.1, spots: [stand(0, 1.0, Math.PI, 'askGuard', { public: true })] },
  noticeBoard: { size: [2.0, 0.1], h: 1.2, collide: false, spots: [stand(0, 0.7, Math.PI, 'jobBoard')] },
  bench: { size: [2.0, 0.45], h: 0.45, spots: [sit(-0.5, 0.02, 0, 'rest'), sit(0.5, 0.02, 0, 'rest')] },
  benchOut: { size: [2.0, 0.45], h: 0.45, spots: [sit(-0.5, 0.02, 0, 'rest'), sit(0.5, 0.02, 0, 'rest')] },
  plant: { size: [0.55, 0.55], h: 1.3 },
  vending: { size: [0.95, 0.8], h: 1.95, spots: [stand(0, 0.78, Math.PI, 'vend')] },
  infirmaryBed: { size: [0.95, 2.05], h: 0.62, spots: [{ pos: [0, -0.05], y: 0.62, yaw: 0, pose: 'lie', activity: 'heal', approach: [[0.85, 0.3], [-0.85, 0.3]] }] },
  nurseDesk: { size: [1.6, 0.7], h: 0.78, spots: [
    { ...sit(0, -0.7, 0, 'staffNurse'), staffOnly: true }, stand(0, 0.95, Math.PI, 'nurse')] },
  medCabinet: { size: [1.0, 0.45], h: 1.9 },
  curtain: { size: [2.2, 0.05], h: 2.2, collide: false, decor: true },
  wardenDesk: { size: [2.0, 0.9], h: 0.8, spots: [
    { ...sit(0, -0.85, 0, 'staffWarden'), staffOnly: true }, stand(0, 1.05, Math.PI, 'warden')] },
  filing: { size: [0.6, 0.6], h: 1.3 },
  flag: { size: [0.4, 0.4], h: 2.2 },
  lockers: { size: [2.0, 0.5], h: 2.0 },
  guardTable: { size: [1.6, 1.0], h: 0.76, spots: [{ ...sit(0, 0.85, Math.PI, 'staffRest'), staffOnly: true }, { ...sit(0, -0.85, 0, 'staffRest'), staffOnly: true }] },
  monitorDesk: { size: [2.4, 0.8], h: 0.8, spots: [{ ...sit(0, 0.85, Math.PI, 'staffMonitor'), staffOnly: true }] },
  crate: { size: [1.0, 1.0], h: 0.9 },
  servingCounter: { size: [10, 1.0], h: 1.05, spots: [
    stand(-3, 0.9, Math.PI, 'getFood'), stand(0, 0.9, Math.PI, 'getFood'), stand(3, 0.9, Math.PI, 'getFood'),
    stand(-2, -0.9, 0, 'serve', { job: 'kitchen' }), stand(2, -0.9, 0, 'serve', { job: 'kitchen' })] },
  stove: { size: [1.2, 0.8], h: 0.95, spots: [stand(0, 0.78, Math.PI, 'cook', { job: 'kitchen' })] },
  prepTable: { size: [2.0, 0.9], h: 0.9, spots: [stand(-0.5, 0.8, Math.PI, 'prep', { job: 'kitchen' }), stand(0.5, -0.8, 0, 'prep', { job: 'kitchen' })] },
  fridge: { size: [1.0, 0.75], h: 2.0, spots: [stand(0, 0.72, Math.PI, 'raidFridge')] },
  kitchenShelf: { size: [2.0, 0.5], h: 2.0 },
  dishSink: { size: [1.6, 0.7], h: 0.95, spots: [stand(0, 0.7, Math.PI, 'washDishes', { job: 'kitchen' })] },
  messTable: { size: [4.0, 1.9], h: 0.78, spots: [
    ...[-1.5, -0.5, 0.5, 1.5].map((x) => ({ ...sit(x, 0.72, Math.PI, 'eat'), approach: [[x, 1.3]] })),
    ...[-1.5, -0.5, 0.5, 1.5].map((x) => ({ ...sit(x, -0.72, 0, 'eat'), approach: [[x, -1.3]] }))] },
  trashCan: { size: [0.5, 0.5], h: 0.8 },
  tvStand: { size: [2.0, 0.5], h: 1.0 },
  couch: { size: [1.8, 0.85], h: 0.8, spots: [sit(-0.45, 0.08, 0, 'watchTV'), sit(0.45, 0.08, 0, 'watchTV')] },
  poolTable: { size: [2.5, 1.35], h: 0.85, spots: [stand(1.6, 0, -Math.PI / 2, 'pool'), stand(-1.6, 0, Math.PI / 2, 'pool')] },
  cardTable: { size: [1.0, 1.0], h: 0.75, spots: [
    sit(0.8, 0, -Math.PI / 2, 'cards'), sit(-0.8, 0, Math.PI / 2, 'cards'), sit(0, 0.8, Math.PI, 'cards'), sit(0, -0.8, 0, 'cards')] },
  pingPong: { size: [2.7, 1.5], h: 0.78, spots: [stand(1.85, 0, -Math.PI / 2, 'pingPong'), stand(-1.85, 0, Math.PI / 2, 'pingPong')] },
  bookshelf: { size: [2.0, 0.45], h: 2.2, spots: [stand(0, 0.72, Math.PI, 'browse')] },
  readingTable: { size: [1.8, 0.9], h: 0.76, spots: [
    sit(-0.45, 0.75, Math.PI, 'read'), sit(0.45, 0.75, Math.PI, 'read'), sit(-0.45, -0.75, 0, 'read'), sit(0.45, -0.75, 0, 'read')] },
  chessTable: { size: [0.8, 0.8], h: 0.75, spots: [sit(0, 0.72, Math.PI, 'chess'), sit(0, -0.72, 0, 'chess')] },
  librarianDesk: { size: [1.6, 0.7], h: 0.8, spots: [{ ...sit(0, -0.72, 0, 'shelve', { job: 'library' }) }] },
  showerHead: { size: [0.4, 0.25], h: 2.1, collide: false, spots: [stand(0, 0.6, Math.PI, 'shower')] },
  drain: { size: [0.4, 0.4], collide: false, decor: true },
  washer: { size: [0.8, 0.75], h: 1.0, spots: [stand(0, 0.72, Math.PI, 'laundry', { job: 'laundry' })] },
  dryer: { size: [0.8, 0.75], h: 1.0, spots: [stand(0, 0.72, Math.PI, 'laundry', { job: 'laundry' })] },
  foldTable: { size: [2.0, 0.9], h: 0.9, spots: [stand(-0.5, 0.8, Math.PI, 'fold', { job: 'laundry' }), stand(0.5, -0.8, 0, 'fold', { job: 'laundry' })] },
  laundryCart: { size: [0.9, 0.6], h: 0.9 },
  detergentShelf: { size: [2.0, 0.5], h: 1.8 },
  weightBench: { size: [0.7, 1.9], h: 1.2, spots: [{ pos: [0, 0.15], y: 0.48, yaw: 0, pose: 'benchPress', activity: 'benchPress', approach: [[0.8, 0.4], [-0.8, 0.4]] }] },
  weightBenchOut: { size: [0.7, 1.9], h: 1.2, spots: [{ pos: [0, 0.15], y: 0.48, yaw: 0, pose: 'benchPress', activity: 'benchPress', approach: [[0.8, 0.4], [-0.8, 0.4]] }] },
  squatRack: { size: [1.6, 1.2], h: 2.2, colliders: [[-0.75, -0.55, -0.6, 0.55], [0.6, -0.55, 0.75, 0.55]], spots: [{ pos: [0, 0], y: 0, yaw: 0, pose: 'squat', activity: 'squat', approach: [[0, 1.0]] }] },
  punchBag: { size: [0.56, 0.56], h: 2.0, spots: [stand(0, 0.8, Math.PI, 'punchBag')] },
  treadmill: { size: [0.85, 1.9], h: 1.3, spots: [{ pos: [0, -0.15], y: 0.18, yaw: 0, pose: 'treadmill', activity: 'treadmill', approach: [[0, -1.35], [0.85, -0.5], [-0.85, -0.5]] }] },
  pullupBar: { size: [1.3, 0.3], h: 2.35, colliders: [[-0.65, -0.15, -0.5, 0.15], [0.5, -0.15, 0.65, 0.15]], spots: [{ pos: [0, 0], y: 0, yaw: 0, pose: 'pullup', activity: 'pullup', approach: [[0, 0.8]] }] },
  pullupBarOut: { size: [1.3, 0.3], h: 2.35, colliders: [[-0.65, -0.15, -0.5, 0.15], [0.5, -0.15, 0.65, 0.15]], spots: [{ pos: [0, 0], y: 0, yaw: 0, pose: 'pullup', activity: 'pullup', approach: [[0, 0.8]] }] },
  dumbbellRack: { size: [1.5, 0.5], h: 0.75 },
  mat: { size: [2.0, 1.2], collide: false, spots: [{ pos: [0, 0], y: 0.02, yaw: 0, pose: 'situps', activity: 'situps', approach: [[0, 0.9]] }] },
  plateStamper: { size: [1.2, 1.0], h: 1.35, spots: [stand(0, 0.85, Math.PI, 'stamp', { job: 'workshop' })] },
  workbench: { size: [2.2, 0.9], h: 0.9, spots: [stand(-0.6, 0.78, Math.PI, 'tinker', { job: 'workshop' }), stand(0.6, 0.78, Math.PI, 'tinker', { job: 'workshop' })] },
  toolRack: { size: [2.0, 0.25], h: 1.8, collide: false, decor: true },
  plateStack: { size: [1.0, 0.8], h: 1.0 },
  courtLines: { size: [24, 16], collide: false, decor: true },
  hoop: { size: [0.4, 0.4], h: 3.6, spots: [stand(0, 4.2, Math.PI, 'hoops')] },
  picnicTable: { size: [2.0, 1.8], h: 0.76, spots: [
    sit(-0.5, 0.7, Math.PI, 'hangout'), sit(0.5, 0.7, Math.PI, 'hangout'), sit(-0.5, -0.7, 0, 'hangout'), sit(0.5, -0.7, 0, 'hangout')] },
  bleachers: { size: [16, 5], h: 2.2, spots: [] },
  guardTower: { size: [3.2, 3.2], h: 8, spots: [{ pos: [0, 0], y: 6.2, yaw: 0, pose: 'stand', activity: 'towerWatch', approach: [[0, 2.2]], staffOnly: true, tower: true }] },
  lightPole: { size: [0.3, 0.3], h: 8 },
};

// Bleacher seats are generated: 3 tiers x 14 seats facing front (+z local).
for (let tier = 0; tier < 3; tier++) {
  for (let i = 0; i < 14; i++) {
    const x = -6.5 + i * 1.0;
    const z = 1.9 - tier * 1.5;
    FURNITURE_TYPES.bleachers.spots.push({ pos: [x, z], y: 0.5 + tier * 0.6, yaw: 0, pose: 'sit', activity: 'hangout', approach: [[x, 3.1]], snap: true });
  }
}

/** Transform a local point of a furniture instance into world space. */
export function furnitureToWorld(f, lx, lz) {
  const yaw = f.rot * Math.PI / 2;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
}
export function furnitureYaw(f) { return f.rot * Math.PI / 2; }
