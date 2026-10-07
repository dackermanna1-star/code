// The service stairs at the west end of the building: concrete flights
// switching back and forth from the third floor down to the basement, iron
// railings, a big painted number on each landing. The second floor's door
// is boarded up (the fire); the basement's is a security door that needs
// power. He never takes the stairs. Almost never.
import * as THREE from 'three';
import { H } from './state.js';
import { FL, W, styles } from './shell.js';
import { Door } from './doors.js';
import * as P from './props.js';
import * as P3 from './props3.js';
import { note } from './items.js';
import { NOTES } from './lore.js';
import { flat } from './materials.js';
import * as T from './textures.js';
import { cylGeo } from './kit.js';

const PI = Math.PI;
const X0 = -92, X1 = -72, Z0 = -6, Z1 = 24;

export function buildStairwell() {
  const k = H.kit, M = H.M, S = styles(), nav = H.nav, O = H.obj;
  const top = FL.F3 + 12, bot = FL.B;
  const stair = { mat: M.stairWall, trim: {} };
  // the shaft: outer walls the whole height
  W('z', X0, Z0, Z1, bot, top - bot, null, stair);
  W('x', Z0, X0, X1, bot, top - bot, null, stair);
  W('x', Z1, X0, X1, bot, top - bot, stair, null);
  k.ceiling(X0, X1, Z0, Z1, top, M.ceilingDark);
  // the east wall, floor by floor (the other side is that floor's corridor)
  const sides = { [FL.F3]: S.corridor, [FL.F2]: S.burnt, [FL.F1]: S.brick, [FL.B]: S.concrete };
  for (const Y of [FL.B, FL.F1, FL.F2, FL.F3]) {
    const hh = Y === FL.F3 ? top - Y : 15;
    W('z', X1, Z0, -4, Y, hh, stair, null);
    W('z', X1, -4, 4, Y, hh, stair, sides[Y], { doors: [0], noTrim: Y === FL.B || Y === FL.F2 });
    W('z', X1, 4, Z1, Y, hh, stair, null);
  }
  // landings and flights
  for (const Y of [FL.B, FL.F1, FL.F2, FL.F3]) {
    k.floor(X0, X1, Z0, 4, Y, M.concrete, { surface: 'concrete' });
    k.box(X0, X1, Y - 1.2, Y - 0.5, Z0, 4, M.ceilingDark, { faces: ['ny', 'pz'] });
    // the floor number, painted big on the north wall
    const lbl = { [FL.B]: 'B', [FL.F1]: '1', [FL.F2]: '2', [FL.F3]: '3' }[Y];
    P.decal(-82, Y + 6.5, Z0 + 0.52, 0, 3.2, 3.2, T.sign(lbl, { w: 128, h: 128, style: 'paint', fg: Y === FL.F2 ? 'rgba(40,30,25,0.9)' : 'rgba(200,190,160,0.85)', font: 'Impact, Arial', size: 110 }));
    P3.cageLight(X0 + 0.5, Y + 8, -1, PI / 2, { flicker: Y === FL.F2 ? 0.5 : 0.12, emergency: 0.3, broken: Y === FL.F2, room: 'stairs' });
    P.emergencyLight(X1 - 0.6, Y + 10.4, -3.6, -PI / 2, { power: 5 });
  }
  for (const Y of [FL.F1, FL.F2, FL.F3]) {
    const mid = Y - 7.5;
    k.floor(X0, X1, 14, Z1, mid, M.concrete, { surface: 'concrete' });
    k.box(X0, X1, mid - 1.2, mid - 0.5, 14, Z1, M.ceilingDark, { faces: ['ny', 'nz'] });
    // flight A down from this floor's landing to the half landing, flight B on down to the next floor
    P3.stairs('z', 14, 4, -91.5, -82.5, mid, Y, { mat: M.concrete, rods: true, surface: 'concrete', stringer0: false });
    P3.stairs('z', 4, 14, -81.5, -72.5, Y - 15, mid, { mat: M.concrete, rods: true, surface: 'concrete', stringer1: false });
    // the railings down the middle, and something to stop you dropping into the gap
    rail(-82.5, 4, 14, Y, mid);
    rail(-81.5, 14, 4, mid, Y - 15);
    k.solid(-82.5, -81.5, Y - 16, Y + 4, 4, 14, { name: 'Rail' });
    P3.cageLight(X0 + 0.5, mid + 8, 19, PI / 2, { flicker: 0.15, emergency: 0.3, room: 'stairs' });
  }
  // pipes running up the corner
  for (const px of [-90.8, -90.1]) P3.pipeRun([[px, bot, Z1 - 0.8], [px, top, Z1 - 0.8]], 0.22, M.pipe, { flanges: true });

  // --- the doors ----------------------------------------------------------------------------------------------------------
  const lockedStairs = () => (H.inv.has('staffKey') ? '' : 'The stairwell door. Locked - it needs a staff key.');
  O.dStairs3 = new Door({ x: X1, y: FL.F3, z: 0, axis: 'z', hinge: 1, swing: -1, plate: -1, style: 'metal', plateText: 'STAIRS', plateStyle: 'enamel', name: 'Stairwell', locked: true, key: 'staffKey', lockedMsg: lockedStairs });
  O.dStairs1 = new Door({ x: X1, y: FL.F1, z: 0, axis: 'z', hinge: 1, swing: -1, plate: -1, style: 'metal', plateText: 'STAIRS', plateStyle: 'enamel', name: 'Stairwell' });
  O.dStairsB = new Door({ x: X1, y: FL.B, z: 0, axis: 'z', hinge: 1, swing: -1, plate: 1, style: 'metal', plateText: 'BASEMENT', plateStyle: 'enamel', name: 'Basement security door', locked: true, lockedMsg: () => 'Basement security door. The lock panel is dark - no power.' });
  // the security door's panel: red while locked, green when the power comes on
  const pb = k.at(X1 - 0.55, FL.B + 4.2, 3.0, -PI / 2);
  pb.box(0, 0, 0.05, 0.9, 1.3, 0.1, M.steel);
  O.bPanel = H.lights.add({ pos: pb.W(0, 0.3, 0.4), color: 0xff2010, power: 1.5, range: 4, circuit: 'event', flicker: 0, halo: 0.6 });
  O.bPanel.on = true;
  H.lights.glow(O.bPanel, 'bulb', P.WM(pb, 0, 0.35, 0.12, 0, 0, 0, 0.7), 2);
  // the second floor: boarded up
  P3.boards(X1 - 0.6, FL.F2, 0, -PI / 2, 4.4, 8.4, { sign: 'CONDEMNED\nFIRE DAMAGE', solid: true });
  O.f2Boards = { pos: new THREE.Vector3(X1 - 1, FL.F2 + 4, 0) };
  P3.debris(-78, FL.F2, -1, 3, 10);
  P.decal(X1 - 0.53, FL.F2 + 9.2, -3.2, -PI / 2, 2.6, 2.6, T.handprint());
  // a note left on the third-floor landing
  note('stairs', { pos: new THREE.Vector3(-79.5, FL.F3 + 0.06, -2.2), ry: 0.4, ...NOTES.stairs });
  // somebody spent nights here: a blanket, a candle stub
  k.at(-89, FL.F1 - 7.5, 21, 0.3).box(0, 0.2, 0, 3.4, 0.4, 5, M.sheet, { tint: '#7a7062' });
  P.candles(-90.6, FL.F1 - 7.5, 16.5, { n: 1, power: 3 });

  // --- nav (only used when he takes the stairs) -----------------------------------------------------------------------------------
  const node = (id, x, y, z) => nav.node(id, x, y, z, { floor: 'S' });
  for (const Y of [FL.B, FL.F1, FL.F2, FL.F3]) { node(`sN:${Y}`, -82, Y, -1); node(`sD:${Y}`, -75, Y, 0); nav.link(`sN:${Y}`, `sD:${Y}`, { stairs: true }); }
  for (const Y of [FL.F1, FL.F2, FL.F3]) {
    const mid = Y - 7.5;
    node(`sAt:${Y}`, -87, Y, 2.5); node(`sAb:${Y}`, -87, mid, 15.5); node(`sM:${Y}`, -82, mid, 19); node(`sBt:${Y}`, -77, mid, 15.5); node(`sBb:${Y}`, -77, Y - 15, 2.5);
    nav.link(`sN:${Y}`, `sAt:${Y}`, { stairs: true }); nav.link(`sAt:${Y}`, `sAb:${Y}`, { stairs: true }); nav.link(`sAb:${Y}`, `sM:${Y}`, { stairs: true });
    nav.link(`sM:${Y}`, `sBt:${Y}`, { stairs: true }); nav.link(`sBt:${Y}`, `sBb:${Y}`, { stairs: true }); nav.link(`sBb:${Y}`, `sN:${Y - 15}`, { stairs: true });
  }
  for (const n of nav.nodes) if (n.floor === 'S') n.noAuto = true;
  // the safe zone: inside the shaft
  H.stairBox = new THREE.Box3(new THREE.Vector3(X0, bot - 1, Z0), new THREE.Vector3(X1 - 0.6, top, Z1));
}

/** An iron handrail with balusters down the inside edge of a flight (from (x, za, ya) to (x, zb, yb)). */
function rail(x, za, zb, ya, yb) {
  const k = H.kit, M = H.M, n = 10;
  const a = new THREE.Vector3(x, ya + 3.4, za), b = new THREE.Vector3(x, yb + 3.4, zb), d = b.clone().sub(a);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  k.geo(cylGeo(0.12, 0.12, Math.round(d.length() * 100) / 100, 8), new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), M.woodDark, { cast: false });
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    k.at(x, ya + (yb - ya) * t, za + (zb - za) * t, 0).cyl(0, 1.7, 0, 0.05, 0.05, 3.4, M.iron, { seg: 4, cast: false });
  }
  void flat;
}
