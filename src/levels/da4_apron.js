// Dead Air 4 — the apron detour. The fire shutter blocks the concourse, so
// the way on is gate C3's jet bridge: through the tunnel to the cab, out onto
// the service landing and down the steel stair to the tarmac. A wall of
// burning wreckage (a baggage train, a torn-off fuselage section, a fuel
// tanker on fire) splits the stands, so the survivors loop north along the
// perimeter fence and climb the C4 bridge's stair back into the terminal.
// Around it: the SKYLINE AIR jet parked at C2, another at the west stand, the
// retracted C1 / C5 bridges, flood-light masts, ground equipment, the dead
// ramp crews, taxiway lights and the runway beyond the fence.
import * as THREE from 'three';
import { P, sign, graffiti, poster, stencil, physProp, fireSource } from './kit.js';
import { DF } from '../render/decals.js';
import { VisualBatch, airlinerModel } from './da_parts.js';
import { jersey, razorWire, tent, medCrate } from './ch3_props.js';
import { YD, GATES, APRON, JB, CON } from './da4_layout.js';
import { rng, NC, wayfind, notice, body, strewLuggage, trail, uld, beltLoader, F_SOLID, F_NONAV, F_SHOOT, F_SIGHT } from './da4_parts.js';

const FZ = CON.z0 - 0.3;          // outer face of the terminal (-42.3)
const CLIP = F_SOLID | F_NONAV;
export const STAIRS = {};          // name -> {x0, x1, zTop, zBot}

export function buildApron(L, game, S) {
  ground(L);
  walkBridge(L, game, S, 'C3', GATES.C3, 1);
  walkBridge(L, game, S, 'C4', GATES.C4, -1);
  otherBridges(L);
  planes(L, game, S);
  wreckLine(L, game, S);
  dressing(L, game, S);
  beyond(L, game);
}

function fence(L, x0, z0, x1, z1, h = 3.2) {
  P.fenceChain(L, x0, z0, x1, z1, 0, h);
  if (Math.abs(x1 - x0) > Math.abs(z1 - z0)) L.box(Math.min(x0, x1), 0, z0 - 0.06, Math.max(x0, x1), 5.0, z0 + 0.06, 'concrete', { visible: false, flags: CLIP });
  else L.box(x0 - 0.06, 0, Math.min(z0, z1), x0 + 0.06, 5.0, Math.max(z0, z1), 'concrete', { visible: false, flags: CLIP });
}

// ================================================================ GROUND, FENCES, FACADE
function ground(L) {
  const { x0, x1, z0 } = APRON;
  L.floor(x0, z0, x1, FZ, 0, 'concrete', 0.4, { tint: 0x7a7872 });
  // slab joints + markings: lead-in lines, stop bars, the red equipment line
  for (let x = x0 + 5; x < x1; x += 5) L.box(x - 0.02, 0.001, z0, x + 0.02, 0.004, FZ, 'blackMatte', { collide: false });
  for (let z = FZ - 5; z > z0; z -= 5) L.box(x0, 0.001, z - 0.02, x1, 0.004, z + 0.02, 'blackMatte', { collide: false });
  for (const gx of [GATES.C3, GATES.C4]) {
    L.box(gx - 0.08, 0.005, z0 + 1, gx + 0.08, 0.009, FZ - 3, 'paintedYellow', { collide: false, tint: 0xd8b020 });
    for (const z of [-54, -57]) L.box(gx - 1.6, 0.005, z - 0.1, gx + 1.6, 0.009, z + 0.1, 'paintedYellow', { collide: false, tint: 0xd8b020 });
  }
  L.box(x0, 0.005, -47.1, x1, 0.009, -46.9, 'paintedRed', { collide: false, tint: 0xa82018 });
  for (let x = x0 + 1; x < x1; x += 2) L.box(x, 0.005, -83.2, x + 1, 0.009, -82.9, 'paintedYellow', { collide: false, tint: 0xd8b020 });
  // perimeter fences (razor wire on top, clips to 5 m)
  fence(L, x0, z0, x1, z0);
  fence(L, x1, FZ, x1, z0);
  fence(L, x0, FZ, x0, z0);
  for (const [x, z, r] of [[-20, z0 + 0.2, 0], [4, z0 + 0.2, 0]]) razorWire(L, x, 3.2, z, r, 8);
  sign(L, 'AIRSIDE · RESTRICTED AREA\nAUTHORIZED VEHICLES ONLY', -12, 1.6, z0 + 0.08, 0, 1.8, 0.6, { bg: '#e8e2d0', fg: '#8a1a14' });
  // terminal base under the concourse: roll-up doors of the baggage make-up, service door, wall packs
  for (const [x, lab] of [[-30, 'MAKE-UP C5'], [-20, 'MAKE-UP C4'], [12, 'MAKE-UP C3']]) {
    for (let y = 0.2; y < 3.8; y += 0.16) L.box(x - 2.2, y, FZ - 0.05, x + 2.2, y + 0.12, FZ - 0.01, 'metal', { collide: false, tint: 0x8a8e8e });
    L.box(x - 2.45, 0, FZ - 0.14, x - 2.2, 4.0, FZ, 'paintedYellow', { collide: false, tint: 0xc8a020 });
    L.box(x + 2.2, 0, FZ - 0.14, x + 2.45, 4.0, FZ, 'paintedYellow', { collide: false, tint: 0xc8a020 });
    L.box(x - 2.5, 3.8, FZ - 0.4, x + 2.5, 4.3, FZ, 'metalDark', NC);
    sign(L, lab, x, 4.6, FZ - 0.02, Math.PI, 1.6, 0.3, { bg: '#e8c020', fg: '#101010', clean: true });
  }
  L.box(-7.4, 0, FZ - 0.06, -6.2, 2.2, FZ, 'metalDark', { collide: false, tint: 0x4a4e52 });
  sign(L, 'NO SMOKING\nWITHIN 50 FT', -4.6, 1.8, FZ - 0.02, Math.PI, 0.7, 0.45, { bg: '#e8e2d0', fg: '#b01e18', clean: true });
  for (let x = -38; x < 16; x += 6) L.box(x - 0.05, 0.4, FZ - 0.2, x + 0.05, YD - 0.6, FZ - 0.12, 'metalDark', { collide: false, tint: 0x5a5e62 });
  for (const x of [-26, -6, 14]) {
    L.box(x - 0.25, 4.6, FZ - 0.25, x + 0.25, 4.9, FZ, 'metalDark', NC);
    L.box(x - 0.2, 4.55, FZ - 0.22, x + 0.2, 4.6, FZ - 0.03, 'emissiveWarm', NC);
    L.light(x, 4.2, FZ - 1.2, 0xffa04a, 9, 12, { flicker: x === -6 ? 0.4 : 0.05 });
  }
  L.reverb(x0, 0, z0, x1, 20, FZ, 'outdoor');
  L.ambience(x0, -0.5, z0, x1, 20, FZ, 'city');
}

// ================================================================ WALKABLE JET BRIDGE + SERVICE STAIR
function walkBridge(L, game, S, name, gx, side) {
  const fy = YD, zg = FZ + 0.1, zc0 = JB.z0, zc1 = JB.cab0;
  // tunnel: floor, underside, walls with window bands, roof, outside ribs
  L.box(gx - 1.2, fy - 0.25, zc0, gx + 1.2, fy, zg, 'rubber', { tint: 0x2a2c30 });
  L.box(gx - 1.35, fy - 0.8, zc0, gx + 1.35, fy - 0.25, zg, 'metal', { tint: 0x9a9e9e, flags: F_SOLID | F_SHOOT | F_SIGHT | F_NONAV });
  for (const s of [-1, 1]) {
    const xw = gx + s * 1.28;
    L.box(xw - 0.07, fy, zc0, xw + 0.07, fy + 2.6, zg, 'metal', { tint: 0xb4b8b8 });
    for (const off of [-0.075, 0.075]) L.box(xw + off - 0.004, fy + 1.05, zc0 + 0.4, xw + off + 0.004, fy + 1.9, zg - 0.4, 'glassDirty', { tint: 0x1a2226, collide: false });
    for (let z = zg - 0.6; z > zc0; z -= 1.2) L.box(xw + s * 0.07, fy - 0.8, z - 0.03, xw + s * 0.1, fy + 2.8, z + 0.03, 'metalDark', { tint: 0x6a6e6e, collide: false });
  }
  L.box(gx - 1.4, fy + 2.6, zc0, gx + 1.4, fy + 2.85, zg, 'metal', { tint: 0xa8acac, flags: F_SOLID | F_SHOOT | F_SIGHT | F_NONAV });
  // recessed ceiling fixtures (discrete panels, a few dead; a continuous strip blooms into a glare tunnel)
  for (let z = zg - 1.4, k = 0; z > zc0 + 0.8; z -= 2.6, k++) {
    const on = (k + (name === 'C3' ? 0 : 1)) % 3 !== 2;
    P.prop(L, gx, fy + 2.56, z, 0).box(0, 0.02, 0, 0.48, 0.04, 1.0, 'metalDark', 0x3a3c40).glow(0, -0.005, 0, 0.36, 0.012, 0.84, on ? 0x7a8894 : 0x101214);
  }
  L.box(gx - 0.5, fy + 0.002, zc0 + 0.2, gx + 0.5, fy + 0.008, zg - 0.2, 'carpet', { collide: false, tint: 0x3a3a5a });
  const side0 = gx - side * 1.2;
  L.box(side0 - 0.03, fy + 0.9, zc0 + 0.5, side0 + 0.03, fy + 0.95, zg - 0.5, 'chrome', NC);
  L.light(gx, fy + 2.2, (zg + zc0) / 2, 0xd8e8ff, name === 'C3' ? 4 : 2.5, 9, { flicker: name === 'C3' ? 0.3 : 0.6 });
  // cab (rotunda): wider box at the end, bellows closed (the plane pulled away)
  const cx0 = gx - 2.4, cx1 = gx + 2.4;
  L.box(cx0, fy - 0.25, zc1, cx1, fy, zc0, 'rubber', { tint: 0x2a2c30 });
  L.box(cx0, fy - 0.8, zc1, cx1, fy - 0.25, zc0, 'metal', { tint: 0x9a9e9e, flags: F_SOLID | F_SHOOT | F_SIGHT | F_NONAV });
  L.box(cx0, fy + 2.8, zc1, cx1, fy + 3.05, zc0, 'metal', { tint: 0xa8acac, flags: F_SOLID | F_SHOOT | F_SIGHT | F_NONAV });
  L.box(cx0, fy, zc0, gx - 1.35, fy + 2.8, zc0 + 0.14, 'metal', { tint: 0xb4b8b8 });
  L.box(gx + 1.35, fy, zc0, cx1, fy + 2.8, zc0 + 0.14, 'metal', { tint: 0xb4b8b8 });
  L.box(gx - 1.35, fy + 2.6, zc0, gx + 1.35, fy + 2.8, zc0 + 0.14, 'metal', { tint: 0xb4b8b8 });
  L.box(cx0, fy, zc1 - 0.14, cx1, fy + 2.8, zc1, 'metal', { tint: 0xb4b8b8 });
  L.box(gx - 1.5, fy + 0.2, zc1 - 0.5, gx + 1.5, fy + 2.7, zc1 - 0.14, 'rubber', { tint: 0x1a1a1a, collide: false });
  L.box(gx - 0.7, fy + 1.3, zc1 - 0.01, gx + 0.7, fy + 2.0, zc1 + 0.01, 'glassDirty', { tint: 0x1a2226, collide: false });
  // side walls: door gap on the stair side
  const dz0 = -60.4, dz1 = -59.1;
  for (const s of [-1, 1]) {
    const xw = s < 0 ? cx0 : cx1;
    if (s === side) {
      L.box(xw - 0.07, fy, zc1, xw + 0.07, fy + 2.8, dz0, 'metal', { tint: 0xb4b8b8 });
      L.box(xw - 0.07, fy, dz1, xw + 0.07, fy + 2.8, zc0, 'metal', { tint: 0xb4b8b8 });
      L.box(xw - 0.07, fy + 2.2, dz0, xw + 0.07, fy + 2.8, dz1, 'metal', { tint: 0xb4b8b8 });
      L.box(xw + side * 0.08 - 0.03, fy + 2.3, dz0 - 0.2, xw + side * 0.08 + 0.03, fy + 2.34, dz1 + 0.2, 'paintedYellow', { collide: false, tint: 0xc8a020 });
    } else L.box(xw - 0.07, fy, zc1, xw + 0.07, fy + 2.8, zc0, 'metal', { tint: 0xb4b8b8 });
  }
  // cab console + dead operator
  const con = P.prop(L, gx - side * 1.5, fy, zc1 + 0.6, 0);
  con.rbox(0, 0.5, 0, 1.2, 1.0, 0.6, 0.04, 'metalDark', 0x3a3e44).box(0, 1.02, -0.1, 1.2, 0.05, 0.5, 'plastic', 0x1a1a1a, [-0.4, 0, 0]);
  for (let i = 0; i < 4; i++) con.glow(-0.4 + i * 0.26, 1.06, -0.12, 0.08, 0.02, 0.06, [0x3a0808, 0x083a10, 0x3a2a08, 0x080808][i]);
  con.col(0, 0.5, 0, 1.2, 1.0, 0.6, 'metal');
  body(L, gx - side * 0.8, fy, zc1 + 1.6, 1.3, 0xe07a10);
  L.light(gx, fy + 2.4, (zc0 + zc1) / 2, 0xffc890, name === 'C3' ? 3 : 2, 6, { flicker: 0.5 });
  sign(L, 'SERVICE STAIR  ' + (side > 0 ? '→' : '←'), side > 0 ? cx1 - 0.09 : cx0 + 0.09, fy + 2.55, (dz0 + dz1) / 2, side > 0 ? -Math.PI / 2 : Math.PI / 2, 1.3, 0.24, { bg: '#e8c020', fg: '#101010', clean: true });
  sign(L, `BRIDGE  ${name}`, gx, fy + 2.35, zg - 0.08, Math.PI, 1.1, 0.26, { bg: '#16191e', fg: '#f2c230', clean: true });
  // landing outside the cab door + the stair down to the apron (ascends +z)
  const [la, lb] = side > 0 ? [cx1 + 0.07, cx1 + 1.75] : [cx0 - 1.75, cx0 - 0.07];
  L.box(la, fy - 0.12, zc1, lb, fy, zc0, 'diamond', { tint: 0x8a8e8a });
  const sx0 = la + 0.12, sx1 = sx0 + 1.4;
  const zTop = zc1, zBot = zc1 - 9.6;
  L.stairs(sx0, zBot, sx1, zTop, 0, fy, '+z', 'diamond', { thin: true, stepH: 0.2, tint: 0x8a8e8a });
  STAIRS[name] = { x0: sx0, x1: sx1, zTop, zBot };
  // stringers, handrails, posts (visual) + clips on both sides
  const run = zTop - zBot, ang = Math.atan2(fy, run), len = Math.hypot(run, fy);
  for (const xs of [sx0 - 0.06, sx1 + 0.06]) {
    L.part('box', xs, fy / 2 - 0.2, (zTop + zBot) / 2, 0.08, 0.35, len, 'paintedYellow', { rx: ang, tint: 0xb89a2a });
    L.part('box', xs, fy / 2 + 0.95, (zTop + zBot) / 2, 0.05, 0.05, len, 'metalClean', { rx: ang, tint: 0xc8a020 });
    for (let k = 0; k <= 6; k++) { const z = zBot + run * k / 6, y = fy * k / 6; L.box(xs - 0.025, y, z - 0.025, xs + 0.025, y + 0.95, z + 0.025, 'metalClean', { collide: false, tint: 0xc8a020 }); }
    for (let k = 0; k < 8; k++) {
      const za = zBot + run * k / 8, zb = zBot + run * (k + 1) / 8, y = fy * (k + 0.5) / 8;
      L.clip(xs - 0.06, y - 0.6, za, xs + 0.06, y + 2.0, zb, CLIP);
    }
  }
  // no walking under the stair: stepped blockers below the flight
  for (let k = 0; k < 8; k++) {
    const za = zBot + run * k / 8, zb = zBot + run * (k + 1) / 8, y = fy * k / 8 - 0.5;
    if (y > 0.3) L.clip(sx0, 0, za, sx1, y, zb, CLIP | F_SHOOT);
  }
  // landing rails (outer edge + south end)
  const xo = side > 0 ? lb : la;
  L.box(xo - 0.03, fy, zc1, xo + 0.03, fy + 1.0, zc0, 'metalClean', { collide: false, tint: 0xc8a020 });
  L.box(la, fy + 0.95, zc0 - 0.03, lb, fy + 1.0, zc0 + 0.03, 'metalClean', { collide: false, tint: 0xc8a020 });
  L.box(la, fy + 0.95, zc1 - 0.03, side > 0 ? sx0 - 0.1 : la, fy + 1.0, zc1 + 0.03, 'metalClean', { collide: false, tint: 0xc8a020 });
  L.clip(xo - 0.08, fy, zc1, xo + 0.08, fy + 2.2, zc0, CLIP);
  L.clip(la, fy, zc0 - 0.08, lb, fy + 2.2, zc0 + 0.08, CLIP);
  if (lb - sx1 > 0.15) L.clip(sx1 + 0.1, fy, zc1 - 0.08, lb, fy + 2.2, zc1 + 0.08, CLIP);
  if (sx0 - la > 0.15) L.clip(la, fy, zc1 - 0.08, sx0 - 0.1, fy + 2.2, zc1 + 0.08, CLIP);
  // drive column + wheel bogie under the cab, landing posts, tunnel support near the terminal
  const leg = P.prop(L, gx, 0, (zc0 + zc1) / 2, 0);
  for (const s of [-0.7, 0.7]) leg.box(s, (fy - 0.8) / 2, 0, 0.26, fy - 0.8, 0.26, 'metalDark', 0x3a3e44);
  leg.box(0, 0.7, 0, 2.6, 0.5, 1.0, 'paintedYellow', 0xc8a020);
  for (const s of [-1, 1]) leg.cylX(s * 1.1, 0.48, 0, 0.48, 0.4, 'rubber', 0x151515, 14);
  leg.box(0, fy - 1.3, 0, 1.8, 0.8, 0.8, 'metal', 0x9a9e9e);
  leg.col(0, (fy - 0.8) / 2, 0, 2.6, fy - 0.8, 1.0, 'metal');
  for (const z of [zc0 - 0.1, zc1 + 0.1]) {
    const px = side > 0 ? lb - 0.1 : la + 0.1;
    L.box(px - 0.08, 0, z - 0.08, px + 0.08, fy - 0.12, z + 0.08, 'metalDark', { tint: 0x3a3e44 });
  }
  const sup = P.prop(L, gx, 0, FZ - 3.2, 0);
  sup.cyl(0, (fy - 0.8) / 2, 0, 0.35, fy - 0.8, 'concrete', 0x8a867e, null, 14).box(0, fy - 1.0, 0, 2.8, 0.4, 0.8, 'metalDark', 0x3a3e44);
  sup.col(0, (fy - 0.8) / 2, 0, 0.7, fy - 0.8, 0.7, 'concrete');
  // dressing inside the tunnel
  P.suitcase(L, gx + side * 0.6, fy, -47.2, 0.3, undefined, true);
  body(L, gx + side * 0.3, fy, -51.6, 1.5, 0x2a3a5a);
  trail(L, gx, -51.6, gx - side * 0.2, -56.8, fy, 5);
  poster(L, 'airline', gx - side * 1.19, fy + 1.5, -45.6, side > 0 ? Math.PI / 2 : -Math.PI / 2, 1.2, 0.8, { title: name === 'C3' ? 'SKYLINE AIR' : 'FLY NEWBURG' });
  S['bridge' + name] = { stairTop: [((sx0 + sx1) / 2), fy, zTop + 0.6], stairBot: [(sx0 + sx1) / 2, 0, zBot - 0.6] };
}

// ================================================================ OTHER BRIDGES (visual)
function otherBridges(L) {
  P.jetBridge(L, GATES.C1, 0, FZ, 0.35, 9, { floorY: YD });
  P.jetBridge(L, GATES.C5, 0, FZ, -0.3, 8.5, { floorY: YD });
  // C2 reaches out to the parked jet (floor ramps down to its door)
  P.jetBridge(L, GATES.C2, 0, FZ, -0.36, 13.4, { floorY: YD - 0.9 });
}

// ================================================================ PARKED AIRLINERS
function planes(L, game, S) {
  const put = (x, z, ry, livery, s = 1.25) => {
    const m = airlinerModel({ livery, color: 0xe4e2dc });
    m.position.set(x, 4.45 * s, z);
    m.rotation.y = ry;
    m.scale.setScalar(s);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
    L.addObject(m);
    return m;
  };
  S.planeC2 = put(30, -72.5, Math.PI, 0xb01e28);
  S.planeW = put(-66, -74, Math.PI, 0x1a3a8a);
  // wheel chocks, cones and a GPU cable at C2 (outside the fence, visible from the gates)
  for (const [x, z] of [[30, -54.6], [27.6, -79.4], [32.4, -79.4], [22.8, -74], [37.2, -74]]) P.trafficCone(L, x, 0, z);
  const gpu = P.prop(L, 25.2, 0, -58.6, 0.3);
  gpu.rbox(0, 0.75, 0, 1.4, 1.1, 2.2, 0.06, 'carPaint', 0xd8d4c8).glow(0.71, 0.9, 0.5, 0.01, 0.1, 0.1, 0x30a040);
  for (const s of [-1, 1]) for (const zz of [-0.7, 0.7]) gpu.cylX(s * 0.72, 0.28, zz, 0.28, 0.2, 'rubber', 0x151515, 10);
  // lit cabin + beacon on the C2 jet (a few passengers never got off)
  L.light(30, 6.6, -60, 0xffe0b0, 3, 8, { flicker: 0.1 });
  const bc = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.1, 0.05), toneMapped: false }));
  bc.position.set(30, 4.45 * 1.25 + 2.55, -72.5);
  L.addObject(bc);
  L.dynamics.push({ t: 0, update(dt) { this.t += dt; bc.visible = (this.t % 1.2) < 0.15; } });
}

// ================================================================ THE WRECK LINE (forces the loop north)
function wreckLine(L, game, S) {
  const x = -2.6;
  // baggage train abandoned mid-turn, a fuselage section torn off something that came down on the apron, a fuel tanker burning
  P.baggageTug(L, x, 0, -45.4, 0.05, 0xd8a020);
  P.baggageCart(L, x - 0.1, 0, -48.8, 0.08, { color: 0x2a4a8a, loaded: true });
  P.baggageCart(L, x + 0.1, 0, -52.1, -0.1, { color: 0x8a1a14, loaded: true });
  P.baggageCart(L, x - 0.2, 0, -55.4, 0.2, { color: 0x2a4a8a, loaded: false });
  P.airlinerSection(L, x + 0.4, 0, -64.2, 0.12, { len: 11, burnt: true, ground: true, wing: true });
  P.fuelTanker(L, x - 0.3, 0, -76.2, 0.04, { color: 0x2e2a26, cabColor: 0x2a2420, pump: false });
  L.clip(x - 1.3, 0, -81.0, x + 1.3, 5.0, FZ, F_SOLID | F_NONAV);   // no nav walkway on top of the wreck line
  // fires + scorched ground, burning debris in the gaps
  S.wreckFires = [
    fireSource(L, x - 0.2, 2.9, -75.2, 1.6, { hazard: true, intensity: 16 }),
    fireSource(L, x + 0.6, 0.15, -70.9, 1.2, { hazard: true, intensity: 12 }),
    fireSource(L, x + 1.2, 2.6, -61.0, 1.3, { hazard: false, intensity: 12 }),
    fireSource(L, x + 0.4, 0.15, -57.1, 0.9, { hazard: true, intensity: 10 }),
  ];
  for (let i = 0; i < 16; i++) L.decal(x + (rng() - 0.5) * 9, 0.013, -46 - rng() * 35, 0, 1, 0, 2 + rng() * 3, DF.SCORCH);
  for (let i = 0; i < 6; i++) P.debris(L, x + (rng() - 0.5) * 6, 0, -58 - rng() * 22, 0.9, 'metal', 5);
  // fuel spill sheen
  for (let i = 0; i < 5; i++) L.decal(x + 3 + rng() * 3, 0.012, -72 - rng() * 8, 0, 1, 0, 2.2 + rng() * 2, DF.POOL, { tint: 0x101010 });
  sign(L, 'DANGER\nJET FUEL', x + 2.2, 1.4, -44.4, 0, 0.7, 0.45, { bg: '#e8c020', fg: '#101010' });
  P.prop(L, x + 2.2, 0, -44.44, 0).cyl(0, 0.6, 0.03, 0.025, 1.2, 'metalDark', null, null, 6);
}

// ================================================================ APRON DRESSING
function dressing(L, game, S) {
  // east (C3 stand): belt loader, ULD dollies, tug, cones, the GPU
  beltLoader(L, 12.6, 0, -62, 0.1, 0xd8a020);
  for (const [xx, z, r] of [[13.6, -48.8, 0], [13.4, -51.4, 0.05], [11.2, -80.4, 1.57]]) uld(L, xx, 0, z, r, { color: 0xa8acae });
  P.baggageTug(L, 12.8, 0, -71.4, 0.3, 0xd8a020);
  for (const [xx, z] of [[3.4, -57], [8.6, -57], [2.6, -66], [14.6, -76]]) P.trafficCone(L, xx, 0, z);
  const gpu = P.prop(L, 1.6, 0, -50, 1.3);
  gpu.rbox(0, 0.75, 0, 1.4, 1.1, 2.2, 0.06, 'carPaint', 0xd8d4c8).glow(0.71, 0.9, 0.5, 0.01, 0.1, 0.1, 0x3a0808);
  for (const s of [-1, 1]) for (const zz of [-0.7, 0.7]) gpu.cylX(s * 0.72, 0.28, zz, 0.28, 0.2, 'rubber', 0x151515, 10);
  gpu.col(0, 0.75, 0, 1.4, 1.1, 2.2, 'metal');
  // west (C4 / C5 stands): passenger stair truck, catering truck, the army's cordon and triage tent
  P.aircraftStairs(L, -30.6, 0, -68, 0.25, 3.6, { walkable: false });
  P.truck(L, -24.6, 0, -77.8, -Math.PI / 2 + 0.15, 0xe8e4dc);
  tent(L, -34, 0, -56, 0, 6, 5, {});
  P.sandbags(L, -22.4, 0, -60, Math.PI / 2, 4, 3);
  P.sandbags(L, -24.2, 0, -62.2, 0, 3.2, 3);
  jersey(L, -8.4, 0, -48.6, 0.3, 3.0, 0xb8b4a8);
  jersey(L, -35, 0, -66, 1.3, 3.0, 0xb8b4a8);
  medCrate(L, -30.2, 0, -59.8, 0.2, 1);
  L.item('ammo', -23.4, 0.02, -61.2);
  L.item('health', -30.2, 0.02, -58.5, { chance: 0.6 });
  L.item('tier2', -35.2, 0.02, -60.4, { chance: 0.5 });
  P.floodLight(L, -26.8, 0, -62.8, -2.4, { h: 6.5, intensity: 26, range: 30, beamLen: 14 });
  P.floodLight(L, 13.8, 0, -66.6, 2.2, { h: 6.5, intensity: 22, range: 26, beamLen: 12, on: true });
  // the dead: ramp crews in hi-vis, soldiers, passengers who ran for the planes
  for (const [xx, z, r, c] of [[6.8, -74.6, 0.4, 0xe07a10], [-9.6, -79.6, 2.1, 0x4a5a3a], [-20.4, -71.8, 1.2, 0xd8d020], [9.8, -48.2, 2.6, 0x2a3a5a], [-28.6, -58.2, 0.8, 0x4a5a3a], [-14.2, -52.4, 1.9, 0x6a2a2a]]) body(L, xx, 0, z, r, c);
  trail(L, -20.4, -71.8, -16.2, -66.4, 0, 6);
  strewLuggage(L, -12, -80, -6, -76, 0, 3);
  strewLuggage(L, 1, -80, 12, -76, 0, 3);
  P.luggagePile(L, 5.2, 0, -80.6, 5, 1.2);
  for (let i = 0; i < 8; i++) L.decal(-36 + rng() * 50, 0.012, -80 + rng() * 34, 0, 1, 0, 1.2 + rng() * 2.4, DF.POOL, { tint: 0x0c0c0c });
  physProp(L, 'gascan', -21.6, 0, -58.8);
  physProp(L, 'propane', 10.6, 0, -46.4);
  for (const [xx, z] of [[-37.6, -82], [-36.2, -82.6], [14.4, -44.4]]) P.barrel(L, xx, 0, z, 0x3a4a6a, true);
  stencil(L, 'C4', -12, 0.9, FZ - 0.02, Math.PI, 0.9, 0.5, '#e8c020');
  stencil(L, 'C3', 6, 0.9, FZ - 0.02, Math.PI, 0.9, 0.5, '#e8c020');
  for (const [x, z, t] of [[4.6, -75.6, '←  GATES C4 · C5\nVIA SERVICE ROAD'], [-17.6, -72.6, 'BRIDGE C4  ↑\nGATES C4 · C5']]) {
    P.prop(L, x, 0, z, 0).cyl(0, 0.8, 0.04, 0.035, 1.6, 'metalDark', null, null, 8).box(0, 0.02, 0.04, 0.3, 0.04, 0.3, 'concrete');
    wayfind(L, t, x, 1.75, z, 0, 1.3, 0.42);
  }
  S.apronTrigger = [6, -0.5, -74, 12, 3, -66];
  S.loopTrigger = [-6, -0.5, -84, 2, 3, -80];
  S.c4StairTrigger = [-18, -0.5, -74, -13, 3, -69];
}

// ================================================================ BEYOND THE FENCE (visual)
function beyond(L, game) {
  const B = new VisualBatch(L);
  const r = rng;
  // ground: apron concrete east / west of the fenced detour, taxiway, grass, runway
  B.box(16.2, -0.4, -90, 140, 0.0, FZ, 'concrete', { tint: 0x6a6862 });
  B.box(-160, -0.4, -90, -40.2, 0.0, FZ, 'concrete', { tint: 0x6a6862 });
  B.box(-160, -0.4, -84.1 - 5.9, 140, 0.0, -84.1, 'concrete', { tint: 0x6a6862 });
  B.box(-400, -0.5, -120, 500, -0.02, -90, 'asphalt', { tint: 0x3a3a3c });
  B.box(-400, -0.5, -150, 500, -0.04, -120, 'dirt', { tint: 0x3a3a2a });
  B.box(-400, -0.5, -200, 500, -0.02, -150, 'asphalt', { tint: 0x34343a });
  B.box(-400, -0.5, -500, 500, -0.04, -200, 'dirt', { tint: 0x2e2e24 });
  for (let x = -390; x < 490; x += 12) B.box(x, -0.015, -175.2, x + 6, -0.01, -174.8, 'paintedWhite', { tint: 0xb8b8b0 });
  for (let x = -390; x < 490; x += 3) B.box(x, -0.015, -105.1, x + 1.5, -0.01, -104.9, 'paintedYellow', { tint: 0xc8a020 });
  // taxiway edge lights (blue) + centreline (green) as cheap props near the fence
  for (let x = -60; x < 60; x += 9) { P.runwayLight(L, x, 0, -91, 0x2050ff); P.runwayLight(L, x + 4.5, 0, -118.5, 0x2050ff); }
  for (let x = -56; x < 60; x += 6) P.runwayLight(L, x, 0, -105, 0x30ff60);
  // a burning wreck out on the taxiway (lights the smoke) + far fires
  P.airlinerSection(L, -38, 0, -134, 1.2, { len: 14, burnt: true, ground: true, wing: true });
  fireSource(L, -38, 1.8, -134, 2.4, { hazard: false, intensity: 22 });
  fireSource(L, -30, 0.3, -130, 1.4, { hazard: false, intensity: 12 });
  fireSource(L, 52, 0.4, -118, 1.5, { hazard: false, intensity: 12 });
  // blast fence on the far side of the runway, hangars, fuel farm silhouettes
  for (let x = -300; x < 460; x += 60) B.box(x, 0, -222, x + 40 + r() * 10, 6 + r() * 6, -214, 'metal', { tint: 0x4a4c50 });
  B.build(L);
  void game;
}
