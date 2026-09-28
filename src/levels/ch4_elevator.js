// Chapter 4 — the tower elevator: 4F elevator lobby arena (breachable walls,
// ceiling vents over a crawlspace plenum, sealed stair D), the lower and upper
// elevator cars, and the crescendo + ride controller.
//
// Timeline after the call button: the car creeps down from 28 (floor
// indicator counts down, motor noise travels down the shaft), endless panic
// waves from the halls; walls burst on both sides; infected drop from the
// vents; the car stalls on 12; arrives (ding) ~76 s later. Inside, a button
// closes the doors; the ride shakes and jolts, and mid-ride everyone inside is
// teleported (same offsets) into the identical upper car at 28F, which then
// opens onto the construction floor.
import * as THREE from 'three';
import { ceilingLight, wallLamp, sign, graffiti, physProp, usable, P } from './kit.js';
import { Door } from '../world/dynamic.js';
import { DF } from '../render/decals.js';
import { CH, rng, slab, ceil, finish, breachWall, ventGrate, SlidingDoors, FloorIndicator, seatRow, shelfUnit, F_SOLID, F_SHOOT } from './ch4_parts.js';

export const CAR = { x0: 52.15, x1: 55.85, z0: 20.15, z1: 23.85, cx: 54, cz: 22 };
export const LOW_Y = 12, TOP_Y = 108, TOP_FLOOR = 28;
const W = 'plasterHosp';

// Elevator core (3 bays at x 46..62, z 20..24) with the working car in bay 2.
function core(L, game, y, o) {
  const top = o.top ?? y + 5.9;
  L.box(45.85, y - 0.3, 19.85, 62.15, top, 20.15, 'concreteDark'); // back
  L.box(45.85, y - 0.3, 20.15, 52.15, top, 23.85, 'concreteDark'); // bay 1 block (dead shaft)
  L.box(55.85, y - 0.3, 20.15, 62.15, top, 23.85, 'concreteDark'); // bay 3 block (dead shaft)
  L.box(CAR.x0, top - 0.2, CAR.z0, CAR.x1, top, CAR.z1, 'concreteDark');
  // car: floor, walls, ceiling, rails, mirror
  L.box(CAR.x0, y - 0.3, CAR.z0, CAR.x1, y, CAR.z1, 'diamond', { tint: 0x8a8a88 });
  L.box(CAR.x0, y + 2.9, CAR.z0, CAR.x1, y + 3.1, CAR.z1, 'metalClean', { tint: 0x6a6e70 });
  const pan = (x0, z0, x1, z1) => L.box(x0, y, z0, x1, y + 2.9, z1, 'metalClean', { collide: false, tint: 0xa8a49a });
  pan(CAR.x0, CAR.z0, CAR.x1, CAR.z0 + 0.03); pan(CAR.x0, CAR.z0, CAR.x0 + 0.03, CAR.z1); pan(CAR.x1 - 0.03, CAR.z0, CAR.x1, CAR.z1);
  L.box(CAR.x0 + 0.6, y + 1.0, CAR.z0 + 0.03, CAR.x1 - 0.6, y + 2.3, CAR.z0 + 0.04, 'chrome', { collide: false, tint: 0x8a9090 });
  for (const [x0, z0, x1, z1] of [[CAR.x0 + 0.1, CAR.z0 + 0.06, CAR.x1 - 0.1, CAR.z0 + 0.1], [CAR.x0 + 0.06, CAR.z0 + 0.1, CAR.x0 + 0.1, CAR.z1 - 0.3], [CAR.x1 - 0.1, CAR.z0 + 0.1, CAR.x1 - 0.06, CAR.z1 - 0.3]]) L.box(x0, y + 0.9, z0, x1, y + 0.95, z1, 'chrome', { collide: false });
  L.box(CAR.cx - 0.9, y + 2.88, CAR.cz - 0.5, CAR.cx + 0.9, y + 2.9, CAR.cz + 0.5, 'emissiveCool', { collide: false, tint: 0x9a9a9a });
  const carLight = L.light(CAR.cx, y + 2.6, CAR.cz, 0xe8f0ff, 7, 6, { on: o.lightOn !== false, priority: 1 });
  // interior button panel
  const bp = P.prop(L, CAR.x1 - 0.02, y + 1.25, CAR.z1 - 0.7, Math.PI / 2);
  bp.box(0, 0, 0, 0.32, 0.6, 0.03, 'metalClean', 0x9aa0a0);
  for (let i = 0; i < 6; i++) bp.box(-0.07 + (i % 2) * 0.14, -0.2 + Math.floor(i / 2) * 0.13, -0.02, 0.07, 0.07, 0.02, i === 5 ? 'emissiveRed' : 'metal', i === 5 ? null : 0xd8d0b0);
  // indicators
  const inside = new FloorIndicator(L, CAR.cx, y + 2.6, CAR.z1 - 0.02, Math.PI, 0.5, 0.22);
  const outside = new FloorIndicator(L, CAR.cx, y + 2.75, 24.17, 0, 0.7, 0.3);
  // doors
  const doors = new SlidingDoors(L, game, CAR.cx, y, 24, 1.6, 2.3);
  L.reverb(CAR.x0, y, CAR.z0, CAR.x1, y + 2.9, CAR.z1, 'room');
  return { carLight, inside, outside, doors, y };
}
// Core front wall at z = 24 between x0..x1 with the car-2 door opening and dummy doors.
function coreFront(L, y, x0, x1, mat, h) {
  L.wallX(x0, x1, 24, y - 0.3, y + h, mat, 0.3, [{ a: 53.2, b: 54.8, y0: y, y1: y + 2.3 }]);
  L.box(53.1, y + 2.3, 24.15, 54.9, y + 2.42, 24.2, 'metalClean', { collide: false });
  for (const x of [53.12, 54.88]) L.box(x - 0.06, y, 24.15, x + 0.06, y + 2.42, 24.2, 'metalClean', { collide: false });
  for (const [x, pried] of [[48, false], [60, true]]) {
    const g = pried ? 0.14 : 0;
    L.box(x - 0.8, y, 24.15, x - g / 2, y + 2.3, 24.19, 'paintedWhite', { collide: false, tint: 0x9aa2a4 });
    L.box(x + g / 2, y, 24.15, x + 0.8, y + 2.3, 24.19, 'paintedWhite', { collide: false, tint: 0x9aa2a4 });
    if (pried) L.box(x - g / 2, y, 24.155, x + g / 2, y + 2.3, 24.16, 'blackMatte', { collide: false });
    else L.box(x - 0.01, y, 24.19, x + 0.01, y + 2.3, 24.2, 'blackMatte', { collide: false });
    L.box(x - 0.95, y + 2.3, 24.15, x + 0.95, y + 2.42, 24.2, 'metalClean', { collide: false });
  }
}

// ======================================================= LOWER LOBBY (4F)
export function buildElevatorLobby(L, game, S) {
  const y = LOW_Y;
  const top = 17.9; // plenum roof
  // floors / ceilings (vent holes)
  const V = [[46.5, 33.0], [61.5, 33.0], [54, 39.6]];
  const hole = ([x, z]) => [x - 0.6, z - 0.6, x + 0.6, z + 0.6];
  slab(L, 42, 24, 66, 36, y, 'concreteFloor'); slab(L, 48, 36, 60, 42, y, 'concreteFloor');
  finish(L, 42, 24, 66, 36, y, 'tileChecker'); finish(L, 48, 36, 60, 42, y, 'carpetBlue');
  ceil(L, 42, 24, 66, 36, y + CH, 'ceiling', [hole(V[0]), hole(V[1])]);
  ceil(L, 48, 36, 60, 42, y + CH, 'ceiling', [hole(V[2])]);
  L.box(41.85, top, 23.85, 66.15, top + 0.2, 42.15, 'concreteDark'); // plenum roof
  // walls (thick, run up through the plenum)
  coreFront(L, y, 41.85, 66.15, W, top - y);
  L.wallZ(24.15, 35.85, 42, y - 0.3, top, W, 0.3, [{ a: 25.2, b: 28.8, y0: y, y1: y + 2.8 }, { a: 30.6, b: 34.2, y0: y, y1: y + 3.0 }]);
  L.wallZ(24.15, 35.85, 66, y - 0.3, top, W, 0.3, [{ a: 25.2, b: 28.8, y0: y, y1: y + 2.8 }, { a: 30.6, b: 34.2, y0: y, y1: y + 3.0 }]);
  L.box(41.85, y - 0.3, 35.85, 48, top, 36.15, W); L.box(60, y - 0.3, 35.85, 66.15, top, 36.15, W);
  L.box(48, y + 3.0, 35.85, 60, y + 3.55, 36.15, W);
  L.box(47.85, y - 0.3, 36.15, 48.15, top, 42.15, W); L.box(59.85, y - 0.3, 36.15, 60.15, top, 42.15, W);
  L.box(48.15, y - 0.3, 41.85, 59.85, top, 42.15, W);
  // stair D landing beyond the east hall (dark, infected pour down from above)
  slab(L, 84, 28, 90, 36, y, 'concrete'); ceil(L, 84, 28, 90, 36, y + CH, 'concrete');
  L.box(84, y - 0.3, 27.85, 90.15, y + CH + 0.2, 28.15, 'concreteDark'); L.box(84, y - 0.3, 35.85, 90.15, y + CH + 0.2, 36.15, 'concreteDark');
  L.box(89.85, y - 0.3, 28.15, 90.15, y + CH + 0.2, 35.85, 'concreteDark');
  L.wallZ(28.15, 35.85, 84, y, y + CH, 'concreteDark', 0.16, [{ a: 30.9, b: 33.9, y0: y, y1: y + 2.3 }]);
  L.stairs(86.2, 28.15, 89.85, 32.6, y, y + 2.2, '-z', 'concrete');
  P.debris(L, 87.5, y + 2.2, 29, 0.9, 'concrete', 10); P.debris(L, 86.5, y, 34.5, 0.8, 'plasterHosp', 8);
  L.box(86.2, y + 2.2, 28.15, 89.85, y + CH, 29.5, 'concrete', { tint: 0x5a5854 });
  P.debris(L, 84.8, y, 32.4, 0.5, 'woodDark', 6);
  wallLamp(L, 89.8, y + 2.6, 34, -1, 0, 0xff2010, 2.5, 5);
  L.reverb(84, y, 28, 90, y + CH, 36, 'stairwell');
  // -- dressing
  sign(L, 'TOWER ELEVATORS\nFLOORS 5 - 30', 54, y + 3.1, 24.17, 0, 2.4, 0.5, { bg: '#1a2a3a', fg: '#e8e8e8', font: 'Arial, sans-serif' });
  sign(L, '4', 43.2, y + 2.2, 24.17, 0, 0.9, 0.9, { bg: '#1a3a6a', fg: '#fff' });
  sign(L, 'OUT OF\nSERVICE', 48, y + 1.5, 24.21, 0, 0.8, 0.45, { bg: '#e8e0c8', fg: '#8a1010' });
  L.decal(60, y + 1.2, 24.2, 0, 0, 1, 1.1, DF.HAND, { noRoll: true });
  L.decal(60.4, y + 0.02, 25.2, 0, 1, 0, 1.6, DF.POOL);
  P.corpse(L, 60.4, y + 0.01, 25.4, 0.3, 0x3a3a4a);
  warn(L, 'DO NOT USE\nOPEN SHAFT', 60, y + 1.8, 24.22, 0);
  // call button (lobby side, right of the door)
  const cb = P.prop(L, 55.35, y + 1.25, 24.165, Math.PI);
  cb.box(0, 0, 0, 0.18, 0.34, 0.03, 'metalClean', 0x9aa0a0).box(0, 0.06, -0.02, 0.08, 0.08, 0.02, 'metal', 0xd8d0b0).box(0, -0.06, -0.02, 0.08, 0.08, 0.02, 'metal', 0xd8d0b0);
  S.callLamp = L.box(55.31, y + 1.28, 24.2, 55.39, y + 1.36, 24.215, 'emissiveRed', { collide: false });
  // furniture: a last stand that failed
  seatRow(L, 44.5, y, 26.2, Math.PI / 2, 4, 0x6a4a3a);
  seatRow(L, 63.5, y, 26.2, -Math.PI / 2, 4, 0x6a4a3a);
  P.desk(L, 51, y, 30.5, 1.2, false); L.box(49.8, y, 30.2, 52.2, y + 0.8, 30.8, 'woodPale', { visible: false });
  P.table(L, 57.5, y, 30.8, 0.3, 1.6, 0.8, 'woodPale');
  P.sandbags(L, 54, y, 34.9, 0, 3.0, 2);
  P.planter(L, 43, y, 35, 0.4); P.planter(L, 65, y, 35, 0.4);
  P.corpse(L, 47, y + 0.01, 29, 2.6, 0x2a3a2a); P.corpse(L, 58.5, y + 0.01, 33.5, -0.8, 0x4a4a52);
  L.decal(47, y + 0.012, 29, 0, 1, 0, 1.8, DF.POOL);
  for (let i = 0; i < 7; i++) L.decal(43 + rng() * 22, y + 0.013, 25 + rng() * 10.5, 0, 1, 0, 0.7 + rng(), DF.BLOOD1 + (i % 4));
  graffiti(L, 'IT TAKES\nFOREVER\nHOLD THE\nLINE', 65.83, y + 1.6, 35, -Math.PI / 2, 1.3, 1.1, '#b8201a');
  graffiti(L, 'WALLS ARE\nPAPER THIN', 42.17, y + 1.9, 35, Math.PI / 2, 1.4, 0.7, '#202020');
  // lounge
  seatRow(L, 50, y, 39, Math.PI / 2, 4, 0x3a5a7a); seatRow(L, 58, y, 39, -Math.PI / 2, 4, 0x3a5a7a);
  P.vending(L, 52.5, y, 41.4, Math.PI); P.vending(L, 55.5, y, 41.4, Math.PI, 0x2a5a8a);
  P.table(L, 54, y, 38.6, 0, 1.0, 0.6, 'woodPale');
  L.item('pills', 54, y + 0.78, 38.6, { chance: 0.7 });
  // explosives to defend with
  physProp(L, 'propane', 44.6, y, 34.6); physProp(L, 'gascan', 63.4, y, 34.8); physProp(L, 'oxygen', 43.2, y, 24.8); physProp(L, 'gascan', 64.8, y, 24.7);
  L.item('ammo', 57.5, y + 0.78, 30.8, {});
  L.item('molotov', 49.2, y + 0.02, 41.2, { chance: 0.7 });
  // lights
  for (const [lx, lz, f] of [[48, 28, 0.2], [60, 28, 0.6], [54, 33, 0.3]]) ceilingLight(L, lx, y + CH, lz, { type: 'fluoro', intensity: 11, flicker: f });
  ceilingLight(L, 54, y + CH, 37.5, { type: 'fluoro', intensity: 8, flicker: 0.7 });
  S.alarmLights = [
    wallLamp(L, 42.2, y + 2.9, 30, 1, 0, 0xff2010, 0, 9),
    wallLamp(L, 65.8, y + 2.9, 30, -1, 0, 0xff2010, 0, 9),
  ];
  L.reverb(42, y, 24, 66, y + CH, 42, 'hall');
  L.ambience(42, y, 20, 66, y + CH, 42, 'hospital');
  // breach walls + vents
  S.breachW = breachWall(L, game, { x0: 41.85, y0: y, z0: 25.2, x1: 42.15, y1: y + 2.8, z1: 28.8, dir: 1, face: 1 });
  S.breachE = breachWall(L, game, { x0: 65.85, y0: y, z0: 25.2, x1: 66.15, y1: y + 2.8, z1: 28.8, dir: -1, face: -1 });
  S.vents = V.map(([x, z]) => ventGrate(L, game, x, z, y + CH));
  // spawn anchors (resolved to nav nodes at start)
  S.anchors = {
    hallE: [[87, y, 33.5], [88.5, y, 30.5]],
    hallW: [[14.5, y, 17], [2.5, y, 13.6], [14, y, 32.5]],
    roomW: [[39, y, 27.2], [38, y, 25.5]],
    roomE: [[69, y, 27.2], [70, y, 25.5]],
    vent: [[46.5, y + CH + 0.15, 30.4], [61.5, y + CH + 0.15, 30.4], [54, y + CH + 0.15, 41.2]],
  };
  S.noSpawnBefore = [[36, y - 1, 24, 42, y + 3, 30.4], [66, y - 1, 24, 72, y + 3, 30.4], [42, y + 3.3, 24, 66, y + 6.5, 42], [CAR.x0, y - 1, CAR.z0, CAR.x1, y + 3, CAR.z1]];
  // the working car
  S.low = core(L, game, y, { lightOn: false });
  S.low.outside.set(TOP_FLOOR, 0);
  S.low.inside.set(TOP_FLOOR, 0);
  // core side walls where the lobby is narrower than the podium corridor
  L.box(41.85, y - 0.3, 15.2, 42.15, top, 23.85, W);
}

// ======================================================= UPPER CAR (28F)
export function buildUpperCar(L, game, S) {
  const y = TOP_Y;
  S.up = core(L, game, y, { lightOn: true, top: 115.4 });
  coreFront(L, y, 45.85, 62.15, 'concreteDark', 7.4);
  S.up.outside.set(TOP_FLOOR, 0);
  S.up.inside.set(4, 0);
  sign(L, '28', 46.55, y + 2.2, 24.17, 0, 0.6, 0.5, { bg: '#3a3a3a', fg: '#e8e8e0' });
}

function warn(L, text, x, y, z, ry) { sign(L, text, x, y, z, ry, 0.9, 0.45, { bg: '#d8c030', fg: '#111', border: '#111' }); }

// ============================================================ CONTROLLER
export function elevatorController(L, game, S) {
  const E = { state: 'idle', t: 0, floor: TOP_FLOOR, ev: {}, motor: null, rideT: 0 };
  const nav = () => game.level.nav;
  const node = (p, r = 2.5) => nav().nearestNode(p[0], p[1], p[2], r);
  let N = null;
  const resolve = () => {
    if (N) return N;
    N = {};
    for (const k in S.anchors) N[k] = S.anchors[k].map((p) => node(p)).filter((n) => n >= 0);
    return N;
  };
  const alive = () => game.survivors.filter((s) => !s.dead);
  const inCar = (s, pad = 0.05) => s.pos.x > CAR.x0 - pad && s.pos.x < CAR.x1 + pad && s.pos.z > CAR.z0 - pad && s.pos.z < CAR.z1 + pad && Math.abs(s.pos.y - LOW_Y) < 1.5;
  const say = (lines) => game.voice.script(lines);
  const setFloor = (f, dir, lamp = false) => { S.low.outside.set(f, dir, lamp); S.low.inside.set(f, dir, lamp); };
  const shaftPos = (f) => new THREE.Vector3(CAR.cx, LOW_Y + (f - 4) * 4 + 1.5, CAR.cz);
  const panicNodes = () => { const n = resolve(); let list = n.hallE.concat(n.hallW); if (E.ev.bw) list = list.concat(n.roomW); if (E.ev.be) list = list.concat(n.roomE); if (E.ev.vent) list = list.concat(n.vent); return list; };
  const burst = (key, count) => { const n = resolve()[key]; if (!n.length) return; for (let i = 0; i < count; i++) game.director.queueCommons(n[i % n.length], 1, { chase: true, horde: true }); };
  const DESCENT = 76;
  const floorAt = (T) => (T < 48 ? TOP_FLOOR - (T / 48) * 16 : T < 56 ? 12 : Math.max(4, 12 - ((T - 56) / 20) * 8));

  // ---- call button
  E.callBtn = usable(L, 55.35, LOW_Y + 1.28, 24.35, 'Call the elevator', () => E.call(), { radius: 1.8 });
  E.closeBtn = usable(L, CAR.x1 - 0.2, LOW_Y + 1.25, CAR.z1 - 0.7, 'Close the elevator doors', () => E.close(), { radius: 1.6, once: false, enabled: false });

  E.call = () => {
    if (E.state !== 'idle') return;
    E.state = 'called'; E.t = 0;
    game.session.objective('Hold out until the elevator arrives');
    say([{ who: 'louis', text: 'It\'s coming! Twenty-eight floors... come ON!', d: 0.6 }, { who: 'francis', text: 'Here they come. Told you. I hate elevators.', d: 4.5 }]);
    game.audio.play('elevatorDing', { pos: shaftPos(TOP_FLOOR), vol: 0.4 });
    E.motor = game.audio.loop('elevatorMotor', { pos: shaftPos(TOP_FLOOR), vol: 1.0 });
    for (const l of S.alarmLights) { l.on = true; l.intensity = 7; l.flicker = 0; }
    const d = game.director;
    d.panic('elevator', { endless: true, interval: 13, size: [8, 12], nodes: panicNodes(), where: 'any', force: true, onWave: (i) => {
      const p = d.panicState; if (!p) return;
      p.nodes = panicNodes();
      const k = Math.min(1, E.t / DESCENT);
      p.size = [Math.round(8 + k * 8), Math.round(12 + k * 10)];
      p.interval = 13 - k * 3;
    } });
    d.blockMobs = true;
    S.onCall?.();
  };
  E.arrive = () => {
    E.state = 'arrived'; E.t = 0;
    setFloor(4, 0, true);
    E.motor?.stop(0.4); E.motor = null;
    game.audio.play('elevatorDing', { pos: new THREE.Vector3(CAR.cx, LOW_Y + 2.5, 24), vol: 1.2 });
    S.low.carLight.on = true;
    S.low.doors.open();
    E.closeBtn.enabled = true;
    game.session.objective('Get in the elevator');
    game.voice.script('ch4ElevatorArrive');
  };
  E.close = (auto = false) => {
    if (E.state !== 'arrived') return;
    const p = game.player;
    if (!auto && (!p || p.dead || !inCar(p, 0.1))) return;
    E.state = 'closing'; E.t = 0;
    E.closeBtn.enabled = false;
    game.audio.play('buttonPress', { pos: new THREE.Vector3(CAR.x1 - 0.2, LOW_Y + 1.3, CAR.z1 - 0.7), vol: 1 });
    // stragglers: bots are pulled in with the human (they would otherwise be left behind)
    const spots = [[-1.1, -0.9], [1.1, -0.9], [-1.1, 0.6], [1.1, 0.6], [0, -1.2]];
    let k = 0;
    for (const s of alive()) {
      if (inCar(s)) continue;
      if (s.pinned) s.pinned.releasePin?.();
      const [ox, oz] = spots[k++ % spots.length];
      s.teleport(CAR.cx + ox, LOW_Y + 0.05, CAR.cz + oz, 0);
    }
    S.low.doors.close();
  };
  E.startRide = () => {
    E.state = 'riding'; E.t = 0;
    const d = game.director;
    d.stopPanic();
    d.spawnQueue.length = 0;
    // anything that slipped into the car with us is thrown back out of the story
    for (const c of game.infected.commons.slice()) if (!c.dead && inCar(c, 0.2)) c.takeHit?.({ damage: 999, part: 0, zone: 'torso', x: c.pos.x, y: c.pos.y + 1, z: c.pos.z, dir: new THREE.Vector3(0, 0, 1), kind: 'melee', knockback: 1 });
    for (const sp of game.infected.specials) if (!sp.dead && !sp.removed && inCar(sp, 0.3)) sp.remove();
    E.motor = game.audio.loop('elevatorMotor', { pos: new THREE.Vector3(CAR.cx, LOW_Y + 3, CAR.cz), vol: 1.3 });
    game.shake(0.5);
    say([{ who: 'francis', text: 'Going up. Next stop: anywhere but here.', d: 1.2 }]);
  };
  E.teleport = () => {
    const dy = TOP_Y - LOW_Y;
    for (const s of game.survivors) {
      if (s.dead || !inCar(s, 0.4)) continue;
      s.teleport(s.pos.x, s.pos.y + dy + 0.02, s.pos.z, s.yaw);
      s.phys.onGround = true;
      if (s.brain) { s.brain.path = null; }
    }
    // leave the lower hospital behind
    game.infected.cullFar(55);
    for (const sp of game.infected.specials) if (!sp.dead && !sp.removed && sp.pos.y < 60) { if (sp.kind === 'tank') game.director.tankAlive = false; sp.remove(); }
    const d = game.director;
    d.spawnQueue.length = 0;
    d.cfg.noSpawnBoxes = (S.noSpawnAfter || []).slice();
    d.cand.length = 0; d.candT = 0;
    d.blockMobs = false;
    d.mobT = Math.max(d.mobT, 45);
    d.state = 'relax'; d.stateT = 0; d.relaxDur = 20;
    E.motor?.set({ pos: new THREE.Vector3(CAR.cx, TOP_Y + 3, CAR.cz) });
    S.onTop?.();
  };
  E.arriveTop = () => {
    E.state = 'done'; E.t = 0;
    E.motor?.stop(0.5); E.motor = null;
    S.up.outside.set(TOP_FLOOR, 0, true); S.up.inside.set(TOP_FLOOR, 0, true);
    game.audio.play('elevatorDing', { pos: new THREE.Vector3(CAR.cx, TOP_Y + 2.5, 24), vol: 1.2 });
    S.up.doors.open();
    S.onTopOpen?.();
  };

  E.update = (dt) => {
    E.t += dt;
    if (E.state === 'idle') {
      // human dead: a bot standing at the button calls it
      const p = game.player;
      if ((!p || p.dead) && alive().some((s) => s.pos.distanceTo(E.callBtn.pos) < 3)) { E.callBtn.enabled = false; E.call(); }
      return;
    }
    if (E.state === 'called') {
      const T = E.t;
      const f = floorAt(T);
      const stuck = T >= 48 && T < 56;
      setFloor(Math.round(f), stuck ? 0 : -1);
      if (E.motor) E.motor.set({ pos: shaftPos(f), vol: stuck ? 0.25 : 1.0 });
      for (const [i, l] of S.alarmLights.entries()) l.intensity = 4 + 4 * Math.max(0, Math.sin(game.time * 6 + i * Math.PI));
      const once = (k, t, fn) => { if (!E.ev[k] && T >= t) { E.ev[k] = true; fn(); } };
      once('bangW', 13, () => { burst('roomW', 7); });
      once('bw', 18.5, () => { S.breachW.breach(); game.director.spawnMob(6, { nodes: resolve().roomW, silent: true }); say([{ who: 'zoey', text: 'They\'re coming through the wall!', d: 0.3 }]); const p = game.director.panicState; if (p) p.nodes = panicNodes(); });
      once('bangE', 31, () => { burst('roomE', 7); });
      once('be', 36, () => { S.breachE.breach(); game.director.spawnMob(6, { nodes: resolve().roomE, silent: true }); say([{ who: 'louis', text: 'Other wall! Other wall!', d: 0.3 }]); const p = game.director.panicState; if (p) p.nodes = panicNodes(); });
      once('stall', 48, () => { game.audio.play('metalImpact', { pos: shaftPos(12), vol: 1 }); say([{ who: 'francis', text: 'It stopped. Why\'d it stop?!', d: 0.4 }, { who: 'bill', text: 'Keep shooting! It\'ll move!', d: 2.6 }]); });
      once('rattle', 50, () => { for (const v of S.vents) v.rattle(); });
      once('rattle2', 52, () => { for (const v of S.vents) v.rattle(); });
      once('vent', 53.5, () => { for (const v of S.vents) v.burst(); burst('vent', 9); say([{ who: 'bill', text: 'Vents! They\'re in the ceiling!', d: 0.4 }]); const p = game.director.panicState; if (p) p.nodes = panicNodes(); });
      once('go', 56, () => { game.audio.play('metalImpact', { pos: shaftPos(12), vol: 0.7 }); });
      once('last', 66, () => { burst('vent', 6); burst('hallE', 6); });
      if (T >= 50 && T < 53.5 && Math.random() < dt * 2) for (const v of S.vents) v.rattle();
      if (T >= 13 && T < 18.5 && Math.random() < dt * 1.6) S.breachW.shake();
      if (T >= 31 && T < 36 && Math.random() < dt * 1.6) S.breachE.shake();
      if (T >= DESCENT) E.arrive();
      return;
    }
    if (E.state === 'arrived') {
      for (const l of S.alarmLights) l.intensity = 5;
      // bots-only team: close automatically once everyone alive is inside
      const p = game.player;
      if ((!p || p.dead) && alive().length && alive().every((s) => inCar(s)) && E.t > 3) E.close(true);
      if (E.t > 150 && (!p || p.dead)) E.close(true);
      return;
    }
    if (E.state === 'closing') {
      if (S.low.doors.k <= 0.001 && E.t > 0.5) E.startRide();
      return;
    }
    if (E.state === 'riding') {
      const R = E.t;
      const f = Math.min(TOP_FLOOR, 4 + Math.max(0, R - 0.8) * 2.0);
      const dir = f < TOP_FLOOR ? 1 : 0;
      const tgt = R < 5.2 ? S.low : S.up;
      tgt.outside.set(Math.floor(f), dir); tgt.inside.set(Math.floor(f), dir);
      if (game.ctrl) game.ctrl.shake = Math.max(game.ctrl.shake, R > 4.3 && R < 4.9 ? 1.1 : 0.32);
      const car = R < 5.2 ? S.low : S.up;
      car.carLight.intensity = R > 4.3 && R < 5.6 ? (Math.random() < 0.5 ? 0 : 3) : 7;
      if (!E.ev.jolt && R > 4.3) { E.ev.jolt = true; game.audio.play('metalImpact', { pos: game.player.pos, vol: 1.2 }); game.audio.play('metalGate', { pos: game.player.pos, vol: 0.7 }); say([{ who: 'zoey', text: 'Whoa! Whoa...', d: 0.1 }, { who: 'louis', text: 'Please don\'t fall. Please don\'t fall.', d: 1.4 }]); }
      if (!E.ev.tp && R > 5.2) { E.ev.tp = true; E.teleport(); }
      if (R > 5.2 + (TOP_FLOOR - 4) / 2.0 - 1.4 && !E.ev.top) { E.ev.top = true; E.arriveTop(); }
      return;
    }
  };
  return E;
}
