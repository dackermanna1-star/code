// Chapter 3 — THE SEWER
// Lucky Star Pawn (start safe room) -> Kessler Avenue at night -> through the
// Burger Barn (dining room, counter, kitchen, walk-in freezer) -> freight lot
// with the Bridgeway gas station and a fuel tanker (both explode when shot) ->
// Halversen Freight loading dock: the scissor-lift crescendo up to the
// warehouse roof -> broken skylight -> warehouse interior (racks, mezzanine)
// -> storm-drain access down into the sewer -> flooded tunnels, pump station
// (locked door + release crescendo), maintenance corridor, junction chamber
// -> stairs up through a hatch into the military triage plaza in front of
// Mercy Hospital -> ER lobby -> security office safe room.
import * as THREE from 'three';
import { ceilingLight, street, floorWithHoles, facade, sign, graffiti, supplies, fireSource, burningBarrel, physProp, alarmCar, hittable, usable, P, railSegment, textTexture } from './kit.js';
import { Door, WindowPane } from '../world/dynamic.js';
import { F_SOLID, F_SHOOT } from '../world/collision.js';
import { DF } from '../render/decals.js';
import { Helicopter } from './helicopter.js';
import { makeRng, damp } from '../core/math.js';
import * as C from './ch3_props.js';
import { buildGasStation, buildTanker } from './ch3_gas.js';
import { buildLift } from './ch3_lift.js';

const rng = makeRng(3301);
const SW = 0.15; // sidewalk / shop floor height
const WF = 1.2; // warehouse floor (dock height)
const ROOF = 9.0; // warehouse roof
const YC = -5.4; // sewer channel floor
const YW = -5.02; // sewer water surface
const YD = -4.97; // dry sewer walkways / rooms
const GLASS = F_SOLID | F_SHOOT;
const MZ_Y = 5.2; // warehouse mezzanine deck

// --------------------------------------------------------------- helpers --
// Four walls whose outer faces lie on the rectangle. ops: {n,s,w,e: [{a,b,y0,y1}]}
function shell(L, x0, z0, x1, z1, y0, y1, mat, t, ops = {}, opts = {}) {
  L.wallX(x0, x1, z0 + t / 2, y0, y1, ops.nMat ?? mat, t, ops.n || [], opts);
  L.wallX(x0, x1, z1 - t / 2, y0, y1, ops.sMat ?? mat, t, ops.s || [], opts);
  L.wallZ(z0 + t, z1 - t, x0 + t / 2, y0, y1, ops.wMat ?? mat, t, ops.w || [], opts);
  L.wallZ(z0 + t, z1 - t, x1 - t / 2, y0, y1, ops.eMat ?? mat, t, ops.e || [], opts);
}
// Wall opening that fits a Door (frame sits inside the opening, no coplanar faces)
const doorOp = (c, w, y, h = 2.15) => ({ a: c - w / 2 - 0.08, b: c + w / 2 + 0.08, y0: y, y1: y + h + 0.08 });
function wallPack(L, x, y, z, nx, nz, o = {}) {
  L.box(x - 0.18 - Math.abs(nz) * 0.0, y - 0.12, z - 0.18, x + 0.18, y + 0.12, z + 0.18, 'metalDark', { collide: false });
  const on = o.on !== false;
  L.box(x - 0.14 + nx * 0.19, y - 0.1, z - 0.14 + nz * 0.19, x + 0.14 + nx * 0.19, y + 0.02, z + 0.14 + nz * 0.19, on ? 'emissiveWarm' : 'blackMatte', { collide: false });
  if (on) return L.light(x + nx * 0.6, y - 0.2, z + nz * 0.6, o.color ?? 0xffc880, o.intensity ?? 14, o.range ?? 12, { flicker: o.flicker ?? 0 });
  return null;
}
// storefront window (static glass) + sign on a street-facing facade (face at z, normal nz)
function storefront(L, x0, x1, z, nz, name, col, o = {}) {
  const za = z + nz * 0.012, zb = z + nz * 0.03;
  L.box(x0 + 0.4, 0.6, Math.min(za, zb), x1 - 0.4, 2.8, Math.max(za, zb), 'glassDirty', { collide: false, tint: o.lit ? 0x3a3a2a : 0x151c20 });
  if (o.lit) L.box(x0 + 0.4, 0.6, Math.min(z, z + nz * 0.01), x1 - 0.4, 2.8, Math.max(z, z + nz * 0.01), 'emissiveWindow', { collide: false });
  L.box(x0, 2.9, Math.min(z, z + nz * 0.9), x1, 3.02, Math.max(z, z + nz * 0.9), 'fabric', { collide: false, tint: o.awning ?? rng.pick([0x7a1a14, 0x1a3a6a, 0x2a4a2a, 0x6a5a2a]) });
  sign(L, name, (x0 + x1) / 2, 3.45, z + nz * 0.04, nz > 0 ? Math.PI : 0, Math.min(6, x1 - x0 - 1), 0.55, { fg: col, glow: o.glow ?? 1.4, light: false });
}
// Big landmark sign that ignores fog (visible from across the city).
// Single-sided: PlaneGeometry's front is +Z, so ry = PI faces -Z.
function landmarkSign(L, text, x, y, z, ry, w, h, o) {
  const tex = textTexture(text, o);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false, color: new THREE.Color(o.bright ?? 1.6, o.bright ?? 1.6, o.bright ?? 1.6) }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  L.addObject(m);
  return m;
}
function bodyWithBlood(L, x, y, z, ry, color) {
  P.corpse(L, x, y + 0.01, z, ry, color);
  L.decal(x, y + 0.015, z, 0, 1, 0, 1.6 + rng() * 0.8, DF.POOL);
}
function bloodTrail(L, x0, z0, x1, z1, y, n = 6) {
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    L.decal(x0 + (x1 - x0) * t + (rng() - 0.5) * 0.3, y + 0.013, z0 + (z1 - z0) * t + (rng() - 0.5) * 0.3, 0, 1, 0, 0.6 + rng() * 0.5, rng() < 0.5 ? DF.SMEAR : DF.BLOOD2);
  }
}
// Visual railing (posts + rails) with an optional collider.
function railing(L, x0, z0, x1, z1, y, h = 1.0, collide = true) {
  railSegment(L, x0, y + h, z0, x1, y + h, z1);
  P.pipe(L, x0, y + h * 0.5, z0, x1, y + h * 0.5, z1, 0.02, 'metalDark');
  if (collide) L.box(Math.min(x0, x1) - 0.03, y, Math.min(z0, z1) - 0.03, Math.max(x0, x1) + 0.03, y + h, Math.max(z0, z1) + 0.03, 'metal', { visible: false, flags: F_SOLID });
}

// Water regions for splashy footsteps [x0,z0,x1,z1]
const WATER = [];
function water(L, x0, z0, x1, z1) {
  L.box(x0, YW - 0.02, z0, x1, YW, z1, 'waterSurface', { collide: false });
  WATER.push([x0, z0, x1, z1]);
}

// Vaulted brick sewer tunnel. axis 'x' | 'z'. a0..a1 along the axis, w0..w1 across.
// o: {ledge: 'lo'|'hi', ledgeW, top (ceiling height above YC), open: {lo:[[a,b,y1?]], hi:[...]}, lights:[a...], pipes, noWater}
function tunnel(L, axis, a0, a1, w0, w1, o = {}) {
  const X = (a, w) => (axis === 'x' ? [a, w] : [w, a]);
  const bx = (a0_, w0_, a1_, w1_, y0, y1, mat, opts) => {
    const [xa, za] = X(a0_, w0_), [xb, zb] = X(a1_, w1_);
    L.box(Math.min(xa, xb), y0, Math.min(za, zb), Math.max(xa, xb), y1, Math.max(za, zb), mat, opts);
  };
  const top = YC + (o.top ?? 3.9);
  const lw = o.ledgeW ?? 1.1;
  // floor (channel bed)
  bx(a0, w0, a1, w1, YC - 0.3, YC, 'sewer', { tint: 0x4a4a3a });
  // side walls with optional openings
  for (const side of ['lo', 'hi']) {
    const wc = side === 'lo' ? w0 - 0.25 : w1 + 0.25;
    const ops = (o.open?.[side] || []).map(([a, b, y1]) => ({ a, b, y0: YC - 0.3, y1: y1 ?? YC + 3.2 }));
    if (axis === 'x') L.wallX(a0, a1, wc, YC - 0.3, top + 0.3, 'sewer', 0.5, ops);
    else L.wallZ(a0, a1, wc, YC - 0.3, top + 0.3, 'sewer', 0.5, ops);
  }
  // ceiling + vault bevels (stepped arch)
  bx(a0, w0 - 0.5, a1, w1 + 0.5, top, top + 0.3, 'sewer');
  const bev = [[0.9, 0.35], [0.45, 0.8]];
  for (const [dw, dy] of bev) {
    bx(a0, w0, a1, w0 + dw, top - dy, top, 'sewer', { tint: 0x8a8a7a });
    bx(a0, w1 - dw, a1, w1, top - dy, top, 'sewer', { tint: 0x8a8a7a });
  }
  // ledge
  let chLo = w0, chHi = w1;
  if (o.ledge) {
    if (o.ledge === 'lo') { bx(a0, w0, a1, w0 + lw, YC - 0.3, YD, 'concreteDark', { tint: 0x6a6a5e }); bx(a0, w0 + lw, a1, w0 + lw + 0.08, YD - 0.1, YD + 0.02, 'concrete', { collide: false, tint: 0x8a8a7a }); chLo = w0 + lw; }
    else { bx(a0, w1 - lw, a1, w1, YC - 0.3, YD, 'concreteDark', { tint: 0x6a6a5e }); bx(a0, w1 - lw - 0.08, a1, w1 - lw, YD - 0.1, YD + 0.02, 'concrete', { collide: false, tint: 0x8a8a7a }); chHi = w1 - lw; }
  }
  // water + grime line on the walls
  if (!o.noWater) {
    const [xa, za] = X(a0, chLo), [xb, zb] = X(a1, chHi);
    water(L, Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb));
  }
  bx(a0, w0, a1, w0 + 0.012, YW, YW + 0.45, 'sewer', { collide: false, tint: 0x2a2a1e });
  bx(a0, w1 - 0.012, a1, w1, YW, YW + 0.45, 'sewer', { collide: false, tint: 0x2a2a1e });
  // pipes along the high wall
  if (o.pipes !== false) {
    const pw = o.ledge === 'lo' ? w1 - 0.3 : w0 + 0.3;
    const [p0x, p0z] = X(a0 + 0.2, pw), [p1x, p1z] = X(a1 - 0.2, pw);
    P.pipe(L, p0x, YC + 2.6, p0z, p1x, YC + 2.6, p1z, 0.18, 'rust', 0x6a5a4a);
    const [q0x, q0z] = X(a0 + 0.2, o.ledge === 'lo' ? w0 + 0.15 : w1 - 0.15), [q1x, q1z] = X(a1 - 0.2, o.ledge === 'lo' ? w0 + 0.15 : w1 - 0.15);
    P.pipe(L, q0x, YC + 3.0, q0z, q1x, YC + 3.0, q1z, 0.07, 'metalDark');
  }
  // lights on the ledge-side wall
  for (const a of o.lights || []) {
    const lwc = o.ledge === 'hi' ? w1 - 0.05 : w0 + 0.05;
    const [lx, lz] = X(a, lwc);
    const n = o.ledge === 'hi' ? -1 : 1;
    const [nx, nz] = axis === 'x' ? [0, n] : [n, 0];
    L.box(lx - 0.12, YC + 2.7, lz - 0.12, lx + 0.12, YC + 2.95, lz + 0.12, 'metalDark', { collide: false });
    L.box(lx - 0.07 + nx * 0.12, YC + 2.72, lz - 0.07 + nz * 0.12, lx + 0.07 + nx * 0.12, YC + 2.86, lz + 0.07 + nz * 0.12, 'emissiveWarm', { collide: false });
    L.light(lx + nx * 0.5, YC + 2.6, lz + nz * 0.5, 0xffc27a, 9, 10, { flicker: rng() < 0.4 ? 0.6 : 0.1 });
  }
  const [rx0, rz0] = X(a0, w0 - 0.5), [rx1, rz1] = X(a1, w1 + 0.5);
  L.reverb(Math.min(rx0, rx1), YC - 0.5, Math.min(rz0, rz1), Math.max(rx0, rx1), top, Math.max(rz0, rz1), 'sewer');
  L.ambience(Math.min(rx0, rx1), YC - 0.5, Math.min(rz0, rz1), Math.max(rx0, rx1), top, Math.max(rz0, rz1), 'sewer');
}

// ================================================================ AREAS ==
function pawnShop(L, game) {
  const y = SW, top = 3.55;
  L.box(0, -0.3, 0, 12, y, 9, 'woodFloorDark');
  L.box(0.3, top, 0.3, 11.7, top + 0.3, 8.7, 'ceiling');
  L.wallX(0, 12, 0.15, y, 3.7, 'plasterDirty', 0.3, [doorOp(10, 1.0, y)]);
  new Door(L, 10, y, 0.15, 'x', { width: 1.0, locked: true, material: 'woodDark' });
  L.box(9.2, y, -1.2, 10.8, 3.7, 0, 'plasterDirty');
  L.wallZ(0.3, 8.7, 0.15, y, 3.7, 'plasterDirty', 0.3);
  L.wallZ(0.3, 8.7, 11.85, y, 3.7, 'plasterDirty', 0.3);
  const wins = [[1.2, 4.6], [7.4, 10.8]];
  L.wallX(0, 12, 8.85, y, 3.7, 'brickTan', 0.3, [{ a: wins[0][0], b: wins[0][1], y0: 0.95, y1: 2.75 }, doorOp(6, 1.1, y), { a: wins[1][0], b: wins[1][1], y0: 0.95, y1: 2.75 }]);
  const door = new Door(L, 6, y, 8.85, 'x', { width: 1.1, safe: true, hinge: 1 });
  for (const [a, b] of wins) {
    L.box(a, 0.95, 8.83, b, 2.75, 8.87, 'glassDirty', { flags: GLASS });
    for (let x = a + 0.12; x < b - 0.05; x += 0.16) L.box(x - 0.015, 0.95, 9.02, x + 0.015, 2.75, 9.05, 'metalDark', { collide: false });
    for (const yy of [1.05, 1.85, 2.65]) L.box(a, yy, 9.0, b, yy + 0.04, 9.07, 'metalDark', { collide: false });
    L.box(a - 0.05, 0.9, 8.68, b + 0.05, 0.95, 9.1, 'woodDark', { collide: false });
  }
  // wainscot + chair rail
  L.box(0.3, y, 0.32, 0.32, y + 1.0, 8.7, 'woodDark', { collide: false });
  L.box(11.68, y, 0.32, 11.7, y + 1.0, 8.7, 'woodDark', { collide: false });
  L.box(0.32, y, 0.3, 9.37, y + 1.0, 0.32, 'woodDark', { collide: false });
  L.box(10.63, y, 0.3, 11.68, y + 1.0, 0.32, 'woodDark', { collide: false });
  // stock: showcases, counter, TVs, guitars, safe
  C.showcase(L, 3.0, y, 4.3, 0, 2.6);
  C.showcase(L, 9.0, y, 4.3, 0, 2.6);
  C.showcase(L, 11.05, y, 2.3, Math.PI / 2, 1.8);
  P.counter(L, 6.0, y, 2.2, 0, 3.0, 'woodDark');
  C.cashRegister(L, 6.6, y + 0.92, 2.25, Math.PI);
  C.floorSafe(L, 10.9, y, 0.8, Math.PI);
  C.shelving(L, 2.5, y, 0.6, Math.PI, 3.2, 'tv', 0.5);
  C.shelving(L, 0.6, y, 6.9, -Math.PI / 2, 2.4, 'goods', 0.5);
  const gcol = [0x8a4a1a, 0x2a1a10, 0xb81a14, 0xd8c8a0, 0x1a1a1a, 0x3a5a8a];
  for (let i = 0; i < 5; i++) C.guitar(L, 11.64, 0.9 + (i % 2) * 0.12, 5.0 + i * 0.75, Math.PI / 2, gcol[i], i % 2 === 1);
  for (let i = 0; i < 4; i++) C.guitar(L, 5.0 + i * 0.8, 1.35, 0.36, Math.PI, gcol[(i + 2) % 6], i % 2 === 0);
  P.prop(L, 8.3, y, 0.8, 0).cyl(0, 0.3, 0, 0.3, 0.45, 'plasticGloss', 0xb81a14, [Math.PI / 2, 0, 0], 16).cyl(0, 0.3, -0.23, 0.29, 0.01, 'paper', 0xe8e4d8, [Math.PI / 2, 0, 0], 16).cyl(0.55, 0.55, 0.1, 0.18, 0.12, 'chrome', null, null, 14).cyl(0.55, 0.3, 0.1, 0.02, 0.5, 'chrome').col(0.2, 0.35, 0, 1.1, 0.7, 0.7, 'metal');
  sign(L, 'NO REFUNDS\nALL SALES FINAL', 3.0, 2.7, 0.32, Math.PI, 1.6, 0.6, { bg: '#e8e0c8', fg: '#8a1010' });
  sign(L, 'WE BUY GOLD', 6.0, 2.35, 8.68, 0, 2.2, 0.45, { fg: '#ffd040', glow: 2.0, light: false });
  sign(L, 'CASH FOR\nANYTHING', 0.32, 2.5, 3.0, -Math.PI / 2, 1.4, 0.6, { bg: '#1a1a1a', fg: '#ffd040' });
  ceilingLight(L, 3.5, top, 4.5, { type: 'fluoro', intensity: 9, flicker: 0.2 });
  ceilingLight(L, 8.5, top, 4.5, { type: 'cage', intensity: 8, color: 0xffe2b0 });
  L.light(6, 2.6, 7.6, 0xffc040, 3, 5, {});
  // supplies
  supplies(L, 2.9, y, 7.8, 0, ['medkit', 'medkit', 'medkit', 'medkit'], { w: 2.0 });
  supplies(L, 9.1, y, 7.8, 0, ['smg', 'pumpShotgun', 'silencedSmg', 'chromeShotgun'], { w: 2.2 });
  L.item('ammo', 6.0, y + 0.02, 3.3);
  L.item('pills', 5.1, y + 0.94, 2.2, { chance: 0.6 });
  L.item('melee', 7.4, y + 0.94, 2.1, { chance: 0.7 });
  L.item('magnum', 9.0, y + 1.08, 4.3, { chance: 0.3 });
  const msgs = [['HOSPITAL IS\nPAST THE SEWER', '#b8201a', 0.32, 2.2, 1.6, Math.PI / 2], ['DONT TRUST\nTHE ARMY', '#1a2a8a', 0.32, 1.6, 4.6, Math.PI / 2], ['FIVE OF US\nLEFT 9/14', '#202020', 11.68, 2.3, 2.0, -Math.PI / 2], ['BURGER BARN\n= NEST', '#3a6a2a', 3.0, 1.9, 0.33, Math.PI]];
  for (const [t, c, x, yy, z, ry] of msgs) graffiti(L, t, x, y + yy - 0.6, z, ry, 1.8, 0.75, c);
  L.decal(4.5, y + 0.013, 6.5, 0, 1, 0, 1.1, DF.SMEAR);
  // exterior: sign, awning over the door
  sign(L, 'LUCKY STAR PAWN', 6, 3.15, 9.02, Math.PI, 7, 0.7, { bg: '#141414', fg: '#ffd040', border: '#ffd040', glow: 1.5, lightColor: 0xffc040, lightIntensity: 4 });
  L.box(4.9, 2.62, 9.0, 7.1, 2.7, 10.0, 'fabric', { collide: false, tint: 0x7a1a14 });
  sign(L, 'PAWN · LOANS · GOLD', 6, 2.95, 10.01, Math.PI, 2.1, 0.22, { fg: '#e8e0c8' });
  L.startSafe = [0.3, y - 0.2, 0.3, 11.7, top, 8.7];
  L.ambience(0.3, y, 0.3, 11.7, top, 8.7, 'safe');
  L.reverb(0.3, y, 0.3, 11.7, top, 8.7, 'safe');
  L.survivorStart.push({ x: 4.3, y, z: 6.5, yaw: Math.PI }, { x: 5.4, y, z: 7.0, yaw: Math.PI }, { x: 6.8, y, z: 7.0, yaw: Math.PI }, { x: 7.9, y, z: 6.5, yaw: Math.PI });
  L.flowStart = [6, y, 6.0];
  return door;
}

function kesslerAve(L, game) {
  street(L, -26, 9, 96, 27, 'x', { sidewalk: 3 });
  sign(L, 'KESSLER AV', 13.5, 3.2, 9.4, Math.PI, 1.6, 0.35, { bg: '#1a5a2a', fg: '#fff', border: '#fff' });
  L.box(13.45, SW, 9.3, 13.55, 3.1, 9.5, 'metalDark');
  // north building row (pawn shop sits in it)
  facade(L, -26, -14, 0, 9, 0, 15, { mat: 'brickDark', faces: ['s'], lit: 0.06, skipBelow: 3.4 });
  facade(L, 0, -14, 12, 9, 3.7, 12.5, { mat: 'brickTan', faces: ['s'], lit: 0.05, skipBelow: 4 });
  L.box(0, 0, -14, 12, 3.7, -1.2, 'brickTan');
  facade(L, 12, -14, 44, 9, 0, 13, { mat: 'brick', faces: ['s'], lit: 0.07, skipBelow: 3.4 });
  facade(L, 44, -14, 70, 9, 0, 19, { mat: 'concrete', faces: ['s'], lit: 0.05, skipBelow: 3.4 });
  facade(L, 70, -14, 96, 9, 0, 14, { mat: 'brickDark', faces: ['s'], lit: 0.06, skipBelow: 3.4 });
  storefront(L, 13, 22, 9, 1, 'KWIK CASH', '#40ff70');
  storefront(L, 23, 31, 9, 1, 'NAILS', '#ff5ab0', { lit: true });
  storefront(L, 33, 43, 9, 1, 'HONG FA MARKET', '#ff4030');
  storefront(L, 46, 58, 9, 1, 'CITY PHARMACY', '#40a0ff', { glow: 0 });
  storefront(L, 60, 69, 9, 1, 'DONUTS', '#ffb040');
  storefront(L, 72, 81, 9, 1, 'TATTOO', '#ff3a3a', { lit: true });
  // south row
  facade(L, -26, 27, 20, 47, 0, 12, { mat: 'brickTan', faces: ['n'], lit: 0.06, skipBelow: 3.4 });
  facade(L, 20, 27, 26, 47, 0, 12, { mat: 'brickTan', faces: ['n', 's'], lit: 0.06, skipBelow: 3.4 });
  facade(L, 36, 27, 44, 47, 0, 11, { mat: 'brick', faces: ['n', 's'], lit: 0.05, skipBelow: 3.4 });
  facade(L, 66, 27, 96, 47, 0, 11, { mat: 'brickDark', faces: ['n', 's'], lit: 0.05, skipBelow: 3.4 });
  storefront(L, -24, -14, 27, -1, 'LAUNDRY', '#6ab0ff');
  storefront(L, -12, 0, 27, -1, 'CHECKS CASHED', '#40ff70', { lit: true });
  storefront(L, 2, 18, 27, -1, 'SUNRISE ELECTRONICS', '#ffd080');
  storefront(L, 68, 80, 27, -1, 'SHOE REPAIR', '#e8e0c8', { glow: 0 });
  // street ends
  facade(L, -46, -14, -26, 47, 0, 16, { mat: 'concreteDark', faces: ['e'], lit: 0.04 });
  facade(L, 96, -14, 125, 27, 0, 16, { mat: 'concreteDark', faces: ['w'], lit: 0.04 });
  L.clip(-26, 0, 9, -25.5, 8, 27);
  // notices
  const notice = (t, x, yy, z, ry, w = 0.9, h = 1.2) => sign(L, t, x, yy, z, ry, w, h, { bg: '#e8e2d0', fg: '#1a1a1a', border: '#8a1010' });
  notice('EVACUATION\nNOTICE\n\nALL RESIDENTS\nREPORT TO\nMERCY HOSPITAL', 14.6, 1.7, 9.03, Math.PI);
  notice('EVACUATION\nNOTICE\n\nALL RESIDENTS\nREPORT TO\nMERCY HOSPITAL', 44.8, 1.6, 9.03, Math.PI);
  notice('MISSING\n\nHAVE YOU SEEN\nMY DAUGHTER?', 40.5, 1.6, 26.97, 0, 0.7, 0.95);
  notice('MISSING\n\nDANNY R.\nAGE 9', 41.4, 1.5, 26.97, 0, 0.7, 0.95);
  notice('CURFEW\nIN EFFECT\n6PM - 6AM', 67.5, 1.7, 26.97, 0, 0.8, 0.9);
  // street lights
  for (const [x, on, fl] of [[4, true, 0], [30, true, 0.6], [56, false, 0], [80, true, 0.2]]) P.streetLight(L, x, SW, 11.4, Math.PI, { on, flicker: fl, intensity: 32 });
  for (const [x, on, fl] of [[-8, true, 0], [18, true, 0], [42, true, 0.3], [70, false, 0]]) P.streetLight(L, x, SW, 24.6, 0, { on, flicker: fl, intensity: 32 });
  P.trafficLight(L, -18, SW, 26.2, 0);
  P.hydrant(L, 26, SW, 10.2);
  P.mailbox(L, 10.5, SW, 26.4, 0);
  P.newsBox(L, 20.4, SW, 26.5, 0);
  P.newsBox(L, 21.2, SW, 26.5, 0, 0x1a4a8a);
  P.trashCan(L, 38, SW, 9.8);
  P.trashCan(L, 64, SW, 26.2);
  P.trashBags(L, 24.5, SW, 9.9, 5);
  P.trashBags(L, 66.5, SW, 26.2, 4);
  P.papers(L, 30, 0.01, 18, 8, 20);
  // bus stop shelter (south sidewalk)
  const bs = P.prop(L, 8, SW, 25.9, 0);
  bs.box(0, 1.2, 0.55, 3.2, 2.4, 0.04, 'glassDirty', 0x2a3030).box(-1.58, 1.2, 0, 0.06, 2.4, 1.2, 'metalDark').box(1.58, 1.2, 0, 0.06, 2.4, 1.2, 'metalDark').box(0, 2.42, 0, 3.3, 0.08, 1.3, 'metalDark');
  bs.col(0, 1.2, 0.55, 3.2, 2.4, 0.1, 'glass', GLASS);
  P.bench(L, 8, SW, 26.1, 0);
  sign(L, 'BURGER BARN\nHOME OF THE BARNBUSTER', 8.9, 1.5, 26.42, 0, 1.3, 1.0, { bg: '#7a1410', fg: '#ffd040', glow: 0.8, light: false });
  // vehicles
  P.car(L, 3, 0, 22.8, -Math.PI / 2);
  P.car(L, 22, 0, 13.4, Math.PI / 2 + 0.05);
  C.ambulance(L, 14.5, 0, 19, 1.95, { doorsOpen: true });
  alarmCar(L, 33, 0, 22.7, -Math.PI / 2 + 0.05, 0x8a8a88);
  P.car(L, 45, 0, 16.5, 0.65, { burnt: true });
  fireSource(L, 45, 0.9, 16.5, 0.8, { hazard: false });
  P.car(L, 59, 0, 15, 2.2, { police: true });
  L.item('secondary', 60.8, 0.02, 13.2, { chance: 0.7 });
  L.item('pipebomb', 58, 0.02, 12.8, { chance: 0.5 });
  P.barricade(L, 62, 0, 18, 1.2);
  P.car(L, 70, 0, 20.5, -0.35, { taxi: true, color: 0xd8b020 });
  P.car(L, 51, 0, 22.8, -Math.PI / 2, {});
  P.van(L, 76.5, 0, 13.8, 1.25);
  physProp(L, 'cone', 63, 0, 20.5);
  physProp(L, 'cone', 64, 0, 21.6);
  physProp(L, 'trashcan', 36, SW, 26);
  physProp(L, 'propane', 12.3, SW, 9.8);
  bodyWithBlood(L, 17, 0, 22, 0.4, 0x3a3a4a);
  bodyWithBlood(L, 40, 0, 14, 2.1, 0x5a4a2a);
  bodyWithBlood(L, 61, SW, 25.4, 1.3, 0x2a2a3a);
  for (let i = 0; i < 10; i++) L.decal(-10 + rng() * 85, 0.012, 12.5 + rng() * 11, 0, 1, 0, 0.8 + rng() * 1.4, DF.BLOOD1 + (i % 4));
  // west blockade: burnt bus + wrecks
  C.bus(L, -19.5, 0, 17.8, 0.22, { burnt: true });
  fireSource(L, -19.8, 2.9, 16, 1.1, { hazard: false });
  P.car(L, -21.5, 0, 25, 1.9, { burnt: true });
  P.car(L, -22, 0, 10.8, -1.3, { burnt: true });
  P.dumpster(L, -17.5, SW, 10.3, 0.3);
  burningBarrel(L, -16, SW, 25.8);
  // east blockade: military checkpoint
  for (const z of [11, 14, 17, 20, 23, 25.8]) C.jersey(L, 82.5, 0, z, Math.PI / 2 + (rng() - 0.5) * 0.15, 2.8);
  P.sandbags(L, 80.8, 0, 16, Math.PI / 2, 5, 4);
  C.razorWire(L, 83.6, 0.86, 18, Math.PI / 2, 16);
  L.clip(82, 0, 9, 83.2, 6, 27);
  P.fenceChain(L, 84.2, 9.2, 84.2, 26.8, 0, 3.4);
  sign(L, 'MILITARY CHECKPOINT\nROAD CLOSED', 81.35, 2.1, 18.5, -Math.PI / 2, 2.6, 1.0, { bg: '#d8c030', fg: '#101010', border: '#101010' });
  L.box(81.33, 0.8, 18.45, 81.4, 1.6, 18.55, 'metalDark', { collide: false });
  P.truck(L, 89, 0, 17, 1.35, 0x3a4a2a);
  fireSource(L, 89.5, 2.5, 16, 1.3, { hazard: false });
  P.car(L, 91, 0, 24, 0.5, { burnt: true });
  burningBarrel(L, 79.8, 0, 24.6);
  P.bodyBag(L, 79, 0.01, 12.5, 0.1);
  P.bodyBag(L, 79.3, 0.01, 14.4, -0.1);
  L.reverb(-26, 0, 9, 96, 15, 27, 'outdoor');
  L.ambience(-26, -1, 9, 96, 20, 27, 'city');
}

function cornerMart(L, game) {
  const y = SW, X0 = 26, X1 = 36, Z0 = 27, Z1 = 37;
  L.box(X0, -0.3, Z0, X1, y, Z1, 'linoleum');
  L.box(X0 + 0.3, 3.75, Z0 + 0.3, X1 - 0.3, 4.05, Z1 - 0.3, 'ceiling');
  shell(L, X0, Z0, X1, Z1, y, 3.9, 'brickTan', 0.3, { n: [{ a: 26.8, b: 30.4, y0: 1.0, y1: 2.6 }, { a: 31.3, b: 32.9, y0: y, y1: 2.45 }, { a: 33.6, b: 35.2, y0: 1.0, y1: 2.6 }] });
  L.box(33.6, 1.0, 27.13, 35.2, 2.6, 27.17, 'glassDirty', { flags: GLASS });
  L.box(26.8, 0.95, 26.9, 30.4, 1.0, 27.4, 'woodDark', { collide: false });
  P.prop(L, 32.1, y, 28.6, 0).box(0, 0.03, 0, 0.9, 0.05, 2.05, 'woodDark', 0x6a4a30, [0, 0.4, 0]);
  facade(L, X0, Z1, X1, 47, 0, 3.9, { mat: 'brickTan', faces: ['s'], lit: 0 });
  facade(L, X0, Z0, X1, 47, 3.9, 12, { mat: 'brickTan', faces: ['n', 's'], lit: 0.06 });
  sign(L, 'CORNER MART', 31, 3.35, 26.98, 0, 4.4, 0.7, { bg: '#1a3a6a', fg: '#ffffff', glow: 1.0, lightColor: 0x6ab0ff, lightIntensity: 3 });
  sign(L, 'ATM', 35.4, 2.1, 26.98, 0, 0.5, 0.25, { fg: '#40ff70', glow: 2, light: false });
  // gondolas, counter, coolers
  C.shelving(L, 29.2, y, 31.7, 0, 3.2, 'store', 0.5);
  C.shelving(L, 29.2, y, 32.2, Math.PI, 3.2, 'store', 0.5);
  C.shelving(L, 29.2, y, 35.9, Math.PI, 3.2, 'store', 0.5);
  P.counter(L, 34.6, y, 30.4, Math.PI / 2, 2.2);
  C.cashRegister(L, 34.6, y + 0.92, 30.0, -Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const cz = 32.4 + i * 1.3;
    const p = P.prop(L, 35.35, y, cz, Math.PI / 2);
    p.box(0, 1.0, 0, 1.2, 2.0, 0.6, 'metalClean', 0x9aa0a0).box(0, 1.05, -0.305, 1.1, 1.8, 0.01, i === 1 ? 'glassDirty' : 'emissiveCool', i === 1 ? 0x1a2024 : 0x445055).col(0, 1.0, 0, 1.2, 2.0, 0.6, 'metal');
  }
  ceilingLight(L, 31, 3.75, 32, { type: 'fluoro', intensity: 9, flicker: 0.7 });
  L.item('pills', 29.2, y + 1.14, 31.5, { chance: 0.6 });
  L.item('throwable', 34.6, y + 0.94, 31.0, { chance: 0.7 });
  L.item('tier1', 35.2, y + 0.02, 28.4, { chance: 0.35 });
  L.item('ammo', 27.2, y + 0.02, 35.9, { chance: 0.5 });
  bodyWithBlood(L, 33.2, y, 33.5, 2.6, 0x6a3a2a);
  graffiti(L, 'NO FOOD\nLEFT', 26.32, 1.8, 34, Math.PI / 2, 1.6, 0.7, '#b8201a');
  L.reverb(X0, y, Z0, X1, 3.75, Z1, 'room');
  L.ambience(X0, y, Z0, X1, 3.75, Z1, 'apartments');
}

function burgerBarn(L, game) {
  const y = SW, X0 = 44, X1 = 66, Z0 = 27, Z1 = 47, TOP = 5.2, CEIL = 4.15;
  const red = { tint: 0x8a2a1a };
  L.box(X0, -0.3, Z0, X1, y, 40, 'tileChecker');
  L.box(X0, -0.3, 40, X1, y, Z1, 'tileFloor');
  L.box(X0 + 0.3, CEIL, Z0 + 0.3, X1 - 0.3, 4.6, Z1 - 0.3, 'ceiling');
  L.box(X0 + 0.3, 4.6, Z0 + 0.3, X1 - 0.3, 4.62, Z1 - 0.3, 'roof', { collide: false });
  const W1 = [45.0, 52.6], W2 = [57.4, 65.0];
  L.wallX(X0, X1, 27.15, y, TOP, 'woodDark', 0.3, [{ a: W1[0], b: W1[1], y0: 1.0, y1: 3.0 }, { a: 53.52, b: 56.48, y0: y, y1: y + 2.48 }, { a: W2[0], b: W2[1], y0: 1.0, y1: 3.0 }], red);
  L.wallX(X0, X1, 46.85, y, TOP, 'woodDark', 0.3, [doorOp(56, 1.0, y)], red);
  L.wallZ(27.3, 46.7, 44.15, y, TOP, 'woodDark', 0.3, [], red);
  L.wallZ(27.3, 46.7, 65.85, y, TOP, 'woodDark', 0.3, [], red);
  new Door(L, 54.3, y, 27.15, 'x', { width: 1.4, height: 2.4, hinge: 1, open: true, material: 'glassDirty' });
  new Door(L, 55.7, y, 27.15, 'x', { width: 1.4, height: 2.4, hinge: -1, open: true, material: 'glassDirty' });
  // window panes (two already smashed)
  for (const [a, b] of [W1, W2]) {
    const n = 4, pw = (b - a) / n;
    for (let i = 0; i < n; i++) {
      const pa = a + i * pw, pb = pa + pw;
      if (i > 0) L.box(pa - 0.03, 1.0, 27.05, pa + 0.03, 3.0, 27.25, 'metalDark');
      const smashed = (a === W1[0] && i === 1) || (a === W2[0] && i === 2);
      if (smashed) { for (let k = 0; k < 4; k++) L.decal(pa + rng() * pw, y + 0.012, 27.6 + rng() * 1.2, 0, 1, 0, 0.5, DF.CRACK, { alpha: 0.6 }); continue; }
      new WindowPane(L, pa + 0.03, 1.0, 27.13, pb - 0.03, 3.0, 27.17, { dirty: true });
    }
    L.box(a - 0.05, 0.95, 26.95, b + 0.05, 1.0, 27.45, 'woodPale', { collide: false });
  }
  // exterior dressing
  sign(L, 'BURGER BARN', 55, 4.4, 26.97, 0, 8.5, 1.15, { bg: '#7a1410', fg: '#ffd040', border: '#ffd040', glow: 1.3, lightColor: 0xff7030, lightIntensity: 6 });
  const gable = P.prop(L, 55, TOP, 27.0, 0);
  gable.box(-1.7, 0.75, 0, 3.8, 0.22, 0.3, 'woodDark', 0xe8e0d0, [0, 0, 0.42]).box(1.7, 0.75, 0, 3.8, 0.22, 0.3, 'woodDark', 0xe8e0d0, [0, 0, -0.42]);
  gable.box(0, 0.7, 0.05, 2.2, 1.0, 0.1, 'woodDark', 0x8a2a1a);
  for (const x of [45.2, 64.8]) L.box(x - 0.15, 0, 26.8, x + 0.15, 3.2, 27.0, 'woodDark', { tint: 0xe8e0d0, collide: false });
  // rooftop burger sign
  const bg = P.prop(L, 60, 4.62, 34, 0);
  bg.cyl(0, 2.6, 0, 0.12, 5.2, 'metalDark', null, null, 8);
  bg.cyl(0, 5.6, 0, 1.3, 0.45, 'plastic', 0xc8802a, null, 20).cyl(0, 5.95, 0, 1.45, 0.3, 'plastic', 0x4a2a14, null, 20).cyl(0, 6.14, 0, 1.52, 0.08, 'plastic', 0x3a8a2a, null, 20).cyl(0, 6.22, 0, 1.36, 0.1, 'plastic', 0xc02a1a, null, 20).box(0, 6.1, 0, 2.2, 0.05, 2.2, 'plastic', 0xe8b020, [0, 0.785, 0]).sph(0, 6.35, 0, 1.38, 'plastic', 0xd8902a, [1, 0.55, 1]);
  bg.col(0, 2.6, 0, 0.3, 5.2, 0.3, 'metal');
  L.light(60, 8.8, 31.5, 0xffc080, 14, 11, { flicker: 0.1 });
  // ---- dining
  for (const x of [46.0, 48.7, 51.4, 58.6, 61.3, 64.0]) C.booth(L, x, y, 28.2, Math.PI / 2);
  for (const [x, z] of [[47.2, 32.6], [50.4, 32.2], [47.6, 35.4], [60.8, 32.4], [64.0, 33.6], [58.2, 35.2]]) C.diner_table(L, x, y, z, rng() * 0.6, 2);
  const tr = P.prop(L, 44.8, y, 36.2, Math.PI / 2);
  tr.box(0, 0.55, 0, 0.9, 1.1, 0.5, 'woodPale', 0x8a5a2a).box(0, 0.8, -0.26, 0.4, 0.1, 0.02, 'blackMatte').col(0, 0.55, 0, 0.9, 1.1, 0.5, 'wood');
  sign(L, 'THANK YOU', 45.06, 1.0, 36.2, -Math.PI / 2, 0.6, 0.12, { fg: '#e8e0c8' });
  // counter
  L.box(48, y, 37.2, 60.5, y + 0.98, 37.9, 'woodPale', { tint: 0xa8683a });
  L.box(47.95, y + 0.98, 37.15, 60.55, y + 1.04, 37.95, 'marble');
  for (let x = 48.3; x < 60.3; x += 0.9) L.box(x, y + 0.3, 37.17, x + 0.5, y + 0.7, 37.2, 'paintedRed', { collide: false, tint: 0xb81a14 });
  for (const x of [50.2, 53.8, 57.4]) C.cashRegister(L, x, y + 1.04, 37.6, Math.PI);
  C.drinkMachine(L, 59.0, y, 39.45, Math.PI);
  const ht = P.prop(L, 53.3, y, 39.55, 0);
  ht.box(0, 0.45, 0, 3.2, 0.9, 0.6, 'metalClean', 0xb8bcb8).col(0, 0.45, 0, 3.2, 0.9, 0.6, 'metal');
  for (let i = 0; i < 6; i++) ht.box(-1.3 + i * 0.52, 0.98, 0, 0.4, 0.12, 0.4, 'paper', rng.pick([0xe8c890, 0xd8b050, 0xe8e0d0]));
  ht.box(0, 1.55, 0, 3.0, 0.06, 0.4, 'emissiveWarm', 0x777777);
  for (const [x, t] of [[50.2, 'BARNBUSTER\nCOMBO  $6.99'], [54.3, 'CLUCKER\nSANDWICH  $4.49'], [58.4, 'SHAKES\nFRIES  SODA']]) {
    L.box(x - 1.9, 2.85, 37.5, x + 1.9, 3.85, 37.56, 'blackMatte', { collide: false });
    sign(L, t, x, 3.35, 37.48, 0, 3.6, 0.9, { bg: '#1a1a1a', fg: '#ffd040', glow: 0.9, light: false });
  }
  // kitchen partition
  L.wallX(X0 + 0.3, X1 - 0.3, 40, y, CEIL, 'tileWhite', 0.2, [{ a: 44.9, b: 46.5, y0: y, y1: y + 2.3 }, { a: 50, b: 56, y0: y + 1.0, y1: y + 1.9 }, doorOp(62.5, 1.4, y)]);
  new Door(L, 62.5, y, 40, 'x', { width: 1.4, open: true, material: 'metalClean' });
  L.box(50, y + 1.0, 39.85, 56, y + 1.04, 40.25, 'metalClean', { collide: false });
  // kitchen
  const cook = [[48.0, 1.4, 'grill'], [49.5, 1.2, 'fryer'], [50.8, 1.2, 'fryer'], [52.2, 1.4, 'grill'], [53.7, 1.4, 'flat'], [55.2, 1.4, 'flat']];
  for (const [x, w, k] of cook) C.grill(L, x, y, 40.52, Math.PI, w, k);
  C.hood(L, 51.6, 3.45, 40.62, 0, 8.6);
  C.prepTable(L, 49.8, y, 43.3, 0, 2.4);
  C.prepTable(L, 53.6, y, 43.3, 0, 2.4);
  C.shelving(L, 47.4, y, 46.4, Math.PI, 2.4, 'kitchen', 0.5);
  C.shelving(L, 50.6, y, 46.4, Math.PI, 2.4, 'kitchen', 0.5);
  const sink = P.prop(L, 44.65, y, 43.2, Math.PI / 2);
  sink.box(0, 0.45, 0, 2.2, 0.9, 0.6, 'metalClean', 0xb8bcb8).box(0, 0.905, 0, 2.0, 0.01, 0.45, 'blackMatte').col(0, 0.45, 0, 2.2, 0.9, 0.6, 'metal');
  L.box(44.3, y, 40.1, 44.32, y + 2.4, 46.7, 'tileWhite', { collide: false });
  L.box(65.68, y, 40.1, 65.7, y + 2.4, 41.7, 'tileWhite', { collide: false });
  L.box(44.3, y, 46.68, 55.34, y + 2.4, 46.7, 'tileWhite', { collide: false });
  L.box(56.66, y, 46.68, 59.4, y + 2.4, 46.7, 'tileWhite', { collide: false });
  physProp(L, 'bucket', 57.8, y, 45.8);
  P.trashBags(L, 58.2, y, 41.2, 3);
  bodyWithBlood(L, 52.2, y, 45.2, 0.8, 0xd8d0c0);
  bloodTrail(L, 55.5, 38.8, 52.5, 44.5, y, 7);
  L.decal(47, y + 0.013, 44.5, 0, 1, 0, 2.0, DF.POOL, { alpha: 0.5 });
  // walk-in freezer (ambush)
  L.wallZ(41.9, 46.7, 59.5, y, CEIL, 'metalClean', 0.2, [doorOp(43.7, 1.4, y)]);
  L.wallX(59.4, 65.7, 41.8, y, CEIL, 'metalClean', 0.2);
  L.box(59.6, y, 41.9, 65.7, y + 0.01, 46.7, 'diamond', { collide: false, tint: 0x8a9aa8 });
  C.shelving(L, 65.4, y, 44.3, -Math.PI / 2, 3.0, 'kitchen', 0.5);
  for (const [x, z] of [[60.6, 45.6], [61.6, 45.9], [62.8, 45.7], [61.0, 42.6], [62.2, 42.4]]) C.meatHook(L, x, 2.95, z);
  P.pipe(L, 60.2, 2.95, 45.8, 64.4, 2.95, 45.8, 0.03, 'chrome');
  P.pipe(L, 60.2, 2.95, 42.5, 64.4, 2.95, 42.5, 0.03, 'chrome');
  ceilingLight(L, 62.6, CEIL, 44.2, { type: 'cage', intensity: 7, color: 0xa8d0ff, flicker: 0.3 });
  L.item('tier2', 63.0, y + 0.02, 44.4, { chance: 0.45 });
  L.item('pipebomb', 65.3, y + 0.64, 43.0, { chance: 0.5 });
  let ambushed = false;
  new Door(L, 59.5, y, 43.7, 'z', {
    width: 1.4, material: 'metalClean', hinge: 1,
    onOpen: (s) => {
      if (ambushed) return;
      ambushed = true;
      const pts = [[62.3, 44.0], [63.4, 45.0], [61.2, 43.4], [64.0, 42.8], [62.6, 46.1]];
      for (const [x, z] of pts) {
        const c = game.infected.spawnCommon(x, y, z, { outfit: 'civilian' });
        if (c) c.alert(0.2 + Math.random() * 0.4, s);
      }
      game.audio.play('zAlert', { pos: new THREE.Vector3(62, 1.5, 44), vol: 1.2 });
      game.voice.say(s, 'hordeIncoming', 1, { text: 'Freezer! They were in the freezer!' });
    },
  });
  // back door exit sign
  sign(L, 'EXIT', 56, y + 2.5, 46.68, 0, 0.6, 0.2, { bg: '#0a2a0a', fg: '#3aff5a', glow: 1.5, lightColor: 0x30ff50, lightIntensity: 2 });
  // lights
  ceilingLight(L, 49, CEIL, 31.2, { type: 'fluoro', intensity: 10, flicker: 0.3 });
  ceilingLight(L, 60.5, CEIL, 31.2, { type: 'fluoro', intensity: 10, on: false });
  ceilingLight(L, 54.5, CEIL, 35, { type: 'fluoro', intensity: 10, flicker: 0.6 });
  ceilingLight(L, 49.5, CEIL, 43.6, { type: 'fluoro', intensity: 10, flicker: 0.4 });
  ceilingLight(L, 56.5, CEIL, 43.6, { type: 'fluoro', intensity: 9, flicker: 0.1 });
  L.item('melee', 53.6, y + 0.95, 43.3, { chance: 0.6 });
  L.item('pills', 49.8, y + 0.95, 43.1, { chance: 0.5 });
  L.item('ammo', 46.5, y + 0.02, 41.5, { chance: 0.4 });
  graffiti(L, 'THEY HIDE\nIN THE COLD', 59.38, 2.1, 45.2, Math.PI / 2, 1.6, 0.7, '#b8201a');
  graffiti(L, 'SEWER ENTRANCE\nIN WAREHOUSE', 44.33, 1.6, 34, Math.PI / 2, 2.2, 0.8, '#1a1a1a');
  L.reverb(X0, y, Z0, X1, CEIL, Z1, 'room');
  L.ambience(X0, y, Z0, X1, CEIL, Z1, 'apartments');
}

function freightLot(L, game) {
  L.floor(20, 47, 125, 96, 0, 'asphalt', 0.5);
  facade(L, 0, 47, 20, 146, 0, 13, { mat: 'brickDark', faces: ['e'], lit: 0.04 });
  facade(L, 20, 96, 50, 146, 0, 11, { mat: 'concreteDark', faces: ['n'], lit: 0.03 });
  facade(L, 125, 47, 150, 146, 0, 15, { mat: 'brick', faces: ['w'], lit: 0.05 });
  // back yard of the burger barn
  hittable(L, 'dumpster', 49.5, 0, 48.7, 0);
  P.dumpster(L, 61.5, 0, 48.7, 0, 0x2a3a5a);
  P.barrel(L, 64, 0, 48.6, 0x3a3a2a);
  P.trashBags(L, 47, 0, 48.6, 6);
  P.pallet(L, 58.8, 0, 49.2, 0.2, false);
  P.van(L, 70, 0, 52, Math.PI / 2 + 0.12, 0xd8d4c8);
  sign(L, 'BURGER BARN\nDELIVERIES', 56, 3.2, 47.02, Math.PI, 1.6, 0.6, { bg: '#e8e0c8', fg: '#7a1410' });
  wallPack(L, 56, 3.0, 47.1, 0, 1, { intensity: 10, flicker: 0.4 });
  // parking lines + lamps
  for (let x = 24; x < 36; x += 2.8) L.box(x, 0.003, 76, x + 0.1, 0.01, 81, 'paintedWhite', { collide: false });
  for (const [x, z, ry, on, fl] of [[40, 52.8, 0, true, 0], [100, 60, -Math.PI / 2, true, 0.3], [66, 88.5, Math.PI, false, 0], [36, 90, Math.PI, true, 0.5]]) P.streetLight(L, x, 0, z, ry, { on, flicker: fl, intensity: 28 });
  // parked / wrecked cars
  P.car(L, 25.4, 0, 78.5, 0);
  P.car(L, 31, 0, 78.5, 0.08, { burnt: true });
  P.car(L, 45, 0, 83, 1.2);
  P.car(L, 115, 0, 70, 0.4, { burnt: true });
  fireSource(L, 115, 0.9, 70, 0.8, { hazard: false });
  hittable(L, 'car', 82, 0, 61, 0.25, { color: 0x2a3a5a });
  // gas station kiosk
  const ky = SW;
  L.box(36, -0.3, 58, 50, ky, 71, 'linoleum');
  L.box(36.3, 3.4, 58.3, 49.7, 3.7, 70.7, 'ceiling');
  shell(L, 36, 58, 50, 71, ky, 3.6, 'brickTan', 0.3, { e: [{ a: 59.2, b: 63.6, y0: 1.0, y1: 2.7 }, doorOp(64.6, 1.0, ky), { a: 66.0, b: 70.0, y0: 1.0, y1: 2.7 }] });
  L.box(36, 3.6, 58, 50, 3.9, 71, 'roof');
  new Door(L, 49.85, ky, 64.6, 'z', { width: 1.0, material: 'glassDirty', open: true });
  new WindowPane(L, 49.83, 1.0, 59.2, 49.87, 2.7, 63.6, { dirty: true });
  L.box(49.83, 1.0, 66.0, 49.87, 2.7, 70.0, 'glassDirty', { flags: GLASS });
  sign(L, 'GAS & GO', 50.02, 3.1, 64.5, -Math.PI / 2, 3.6, 0.6, { bg: '#b81810', fg: '#ffffff', glow: 1.0, lightColor: 0xff4020, lightIntensity: 3 });
  C.shelving(L, 42, ky, 62, 0, 3.0, 'store');
  C.shelving(L, 42, ky, 62.5, Math.PI, 3.0, 'store');
  C.shelving(L, 42, ky, 66.5, 0, 3.0, 'store');
  C.shelving(L, 42, ky, 67.0, Math.PI, 3.0, 'store');
  P.counter(L, 47.8, ky, 60.2, 0, 2.4);
  C.cashRegister(L, 47.4, ky + 0.92, 60.2, Math.PI);
  for (let i = 0; i < 4; i++) { const p = P.prop(L, 37.0 + i * 1.25, ky, 70.35, Math.PI); p.box(0, 1.0, 0, 1.2, 2.0, 0.6, 'metalClean', 0x9aa0a0).box(0, 1.05, -0.305, 1.1, 1.8, 0.01, 'emissiveCool', 0x3a4a50).col(0, 1.0, 0, 1.2, 2.0, 0.6, 'metal'); }
  ceilingLight(L, 43, 3.4, 64.5, { type: 'fluoro', intensity: 9, flicker: 0.5 });
  L.item('pills', 47.2, ky + 0.94, 60.3, { chance: 0.6 });
  L.item('molotov', 42, ky + 1.14, 66.3, { chance: 0.7 });
  L.item('adrenaline', 42, ky + 0.64, 62.7, { chance: 0.4 });
  L.item('health', 38, ky + 0.02, 59.5, { chance: 0.45 });
  bodyWithBlood(L, 45.5, ky, 64.5, 1.1, 0x2a4a6a);
  L.reverb(36, ky, 58, 50, 3.4, 71, 'room');
  L.ambience(36, ky, 58, 50, 3.4, 71, 'apartments');
  // propane exchange cage + ice chest outside the kiosk
  const cage = P.prop(L, 51.3, 0, 59.4, Math.PI / 2);
  cage.box(0, 0.9, 0.4, 1.6, 1.8, 0.04, 'metal', 0x6a6e6a).box(-0.78, 0.9, 0, 0.04, 1.8, 0.8, 'metal', 0x6a6e6a).box(0.78, 0.9, 0, 0.04, 1.8, 0.8, 'metal', 0x6a6e6a).box(0, 1.82, 0, 1.6, 0.04, 0.8, 'metal', 0x6a6e6a).col(0, 0.9, 0.1, 1.6, 1.8, 0.6, 'metal');
  sign(L, 'PROPANE', 50.88, 1.95, 59.4, -Math.PI / 2, 1.0, 0.25, { bg: '#e8e8e0', fg: '#1a3a8a' });
  physProp(L, 'propane', 51.9, 0, 59.0);
  physProp(L, 'propane', 51.9, 0, 59.8);
  const ice = P.prop(L, 51.1, 0, 62, Math.PI / 2);
  ice.box(0, 0.6, 0, 1.6, 1.2, 0.8, 'paintedWhite', 0xe8e8e4).box(0, 0.8, -0.41, 1.0, 0.3, 0.01, 'paintedBlue', 0x2a5aa8).col(0, 0.6, 0, 1.6, 1.2, 0.8, 'metal');
  // gas station canopy + pumps
  const gs = buildGasStation(L, game, { x0: 55, z0: 58, x1: 77, z1: 72, h: 5.0, islands: [61, 71], pumpZ: [63.2, 66.8], onBoom: () => game.voice.script([{ who: 'louis', text: 'Whoa! The whole station just went up!', d: 0.8 }]) });
  physProp(L, 'gascan', 63.2, 0, 70.4);
  physProp(L, 'gascan', 73.4, 0, 60.2);
  // price pylon
  const py = P.prop(L, 80.5, 0, 55.5, 0);
  py.box(0, 3.0, 0, 0.35, 6.0, 0.35, 'metalDark').box(0, 6.8, 0, 2.6, 2.4, 0.4, 'paintedWhite', 0xd8d8d0).col(0, 3.0, 0, 0.4, 6.0, 0.4, 'metal');
  sign(L, 'BRIDGEWAY\nREG  4.19\nPREM 4.59', 80.5, 6.8, 55.28, 0, 2.4, 2.2, { bg: '#b81810', fg: '#ffffff', glow: 0.8, light: false });
  sign(L, 'BRIDGEWAY\nREG  4.19\nPREM 4.59', 80.5, 6.8, 55.72, Math.PI, 2.4, 2.2, { bg: '#b81810', fg: '#ffffff', glow: 0.8, light: false });
  // fuel tanker parked beside the lot
  C.tankerCab(L, 97.0, 0, 74, -Math.PI / 2, 0x8a1a14);
  const tk = buildTanker(L, game, 88.6, 74, () => game.voice.script([{ who: 'francis', text: 'Ha! Now THAT is a barbecue.', d: 1.0 }]));
  L.box(92.9, 0.3, 73.1, 95.9, 1.3, 74.9, 'metal', { visible: false });
  // --- loading dock (warehouse north side)
  L.box(62, 0, 90, 100, WF, 96, 'concrete', { tint: 0xa8a49a });
  L.box(62, WF, 90, 100, WF + 0.01, 90.25, 'paintedYellow', { collide: false, tint: 0xd8b020 });
  for (let x = 64; x < 100; x += 4) L.box(x - 0.3, 0.2, 89.8, x + 0.3, 1.0, 90, 'rubber', { tint: 0x151515 });
  L.stairs(59.6, 90.2, 62, 92.6, 0, WF, '+x', 'concrete');
  L.stairs(97, 87.6, 100, 90, 0, WF, '+z', 'concrete');
  P.truck(L, 70, 0, 84.7, 0, 0xd8d4c8);
  P.truck(L, 82, 0, 84.7, 0.02, 0xc8c8c0);
  C.forklift(L, 90.5, WF, 92.5, 1.1);
  P.pallet(L, 76, WF, 94.8, 0);
  P.pallet(L, 77.3, WF, 94.8, 0.1);
  C.wrappedPallet(L, 94, WF, 94.6, 0.1, 1.2);
  C.wrappedPallet(L, 65, WF, 94.6, -0.05, 1.5);
  P.barrel(L, 88, 0, 88, 0x3a4a6a);
  P.barrel(L, 88.7, 0, 88.6, 0x6a2a1a);
  P.crate(L, 76, 0, 88.5, 0.3, 1.1);
  physProp(L, 'box', 78, 0, 88.3);
  physProp(L, 'propane', 91, 0, 89.2);
  burningBarrel(L, 86, 0, 86.5);
  for (const x of [67, 75, 83, 91]) {
    C.rollDoor(L, x, WF, 96, 3.4, 3.8, -1);
    wallPack(L, x, WF + 4.6, 95.8, 0, -1, { on: x !== 83, flicker: x === 75 ? 0.5 : 0.05, intensity: 12 });
  }
  sign(L, 'HALVERSEN FREIGHT & STORAGE', 80, 7.3, 95.97, 0, 14, 1.0, { bg: '#1a2a4a', fg: '#e8e8e0', border: '#e8e8e0' });
  for (let i = 0; i < 4; i++) sign(L, String(i + 1), 67 + i * 8, WF + 4.25, 95.95, 0, 0.5, 0.5, { bg: '#d8b020', fg: '#101010' });
  graffiti(L, 'LIFT WORKS\nLOUD AS HELL', 103, 3.8, 95.97, 0, 2.4, 1.0, '#d8d8c8');
  // work area next to the lift: stock up before the crescendo
  supplies(L, 101.4, 0, 87.6, 0, ['ammo', 'tier2'], { w: 1.8 });
  L.item('throwable', 103.2, 0.02, 88.8, { chance: 0.8 });
  L.item('medkit', 99.7, 0.02, 86.4, { chance: 0.5 });
  L.item('grenadeLauncher', 102.2, 0.79, 87.5, { chance: 0.12 });
  // light the crescendo stage: flood tower aimed at the lift + wall pack above it
  C.floodlight(L, 95.5, 0, 81.5, -2.356, { intensity: 34, range: 28, flicker: 0.05 });
  wallPack(L, 107.8, 7.6, 95.85, 0, -1, { intensity: 16, range: 14, flicker: 0.1 });
  L.light(101.4, 1.6, 87.2, 0xffd8a0, 6, 6, {});
  P.lamp(L, 100.6, 0.77, 87.9);
  // extra lot dressing
  for (const [x, z] of [[33, 88], [33.9, 88.4], [33.4, 89.2]]) P.barrel(L, x, 0, z, rng.pick([0x3a4a6a, 0x6a2a1a, 0x3a3a2a]));
  for (let i = 0; i < 4; i++) P.prop(L, 44 + (i % 2) * 0.75, 0.13 * Math.floor(i / 2) * 2, 92.5, 0).cyl(0, 0.13, 0, 0.36, 0.26, 'rubber', 0x151515, null, 14);
  P.truck(L, 26, 0, 64, Math.PI + 0.05, 0x8a8a86);
  P.car(L, 104, 0, 55, 2.8, { burnt: true });
  fireSource(L, 104, 0.9, 55, 0.7, { hazard: false });
  for (const [x, z, r] of [[99, 72, 0.4], [70, 80, 1.2], [56, 62, 2.9]]) bodyWithBlood(L, x, 0, z, r, rng.pick([0x3a4a5a, 0x6a4a2a, 0x2a2a2a]));
  bloodTrail(L, 58, 49, 66, 57, 0, 7);
  graffiti(L, 'LIFT TO THE\nROOF  →', 45, 1.9, 71.02, Math.PI, 2.0, 0.8, '#d8d8c8');
  // yard east of the warehouse + back alley (seen from the roof, not reachable)
  L.floor(111.3, 96.6, 125, 107.2, 0, 'asphalt', 0.5);
  L.floor(110.4, 107.2, 125, 146, 0, 'asphalt', 0.5);
  L.floor(50, 136.4, 110.4, 147, 0, 'concreteDark', 0.5);
  L.floor(110.4, 146, 118, 147, 0, 'concreteDark', 0.5);
  P.dumpster(L, 115, 0, 118, Math.PI / 2);
  P.dumpster(L, 70, 0, 142, 0.1, 0x3a2a2a);
  P.trashBags(L, 73, 0, 142.5, 6);
  P.truck(L, 118, 0, 128, 0.05, 0xb8b4a8);
  C.wrappedPallet(L, 114, 0, 104, 0.3, 1.2);
  C.wrappedPallet(L, 115.5, 0, 104.4, 0.1, 0.8);
  burningBarrel(L, 96, 0, 141.5);
  P.car(L, 84, 0, 142, Math.PI / 2 + 0.2, { burnt: true });
  // fence to the east of the warehouse
  P.fenceChain(L, 111.3, 96.55, 125, 96.55, 0, 3.4);
  L.clip(111.3, 0, 96.4, 125, 7, 96.7);
  // lot boundary clips (tops of walls)
  L.reverb(20, 0, 47, 125, 20, 96, 'outdoor');
  L.ambience(20, -1, 47, 125, 25, 96, 'city');
  return { gs, tk };
}

// stack of containers / crates next to the lift (infected climb it; survivors can't)
function containerStack(L) {
  C.container(L, 100.3, 0, 93.4, 105.9, 2.6, 96.0, 0x2a4a7a, { faces: { s: false } });
  L.box(101.0, 0, 91.6, 103.4, 1.5, 93.4, 'fabric', { tint: 0x9a8060 });
  L.box(101.1, 1.5, 91.7, 103.3, 1.52, 93.3, 'plastic', { collide: false, tint: 0xc8c8c0 });
  C.container(L, 101.9, 2.6, 93.4, 105.9, 5.2, 96.0, 0x8a2a1a, { faces: { s: false } });
  L.box(103.9, 5.2, 93.8, 105.9, 7.1, 96.0, 'wood', { tint: 0x9a8a6a });
  for (const [x0, z0] of [[103.9, 93.8]]) L.box(x0 + 0.05, 5.25, z0 - 0.02, x0 + 1.95, 7.05, z0, 'woodDark', { collide: false });
}

// Narrow conveyor/chute tower from the lot to the warehouse roof. It is too
// narrow for survivors (0.6 m) but is a nav connection, so the progress
// field, director and infected can path between the lot and the roof.
function chuteTower(L) {
  const cx0 = 110.4, cx1 = 111.0;
  L.box(cx0, -0.3, 96.0, cx1, 0.0, 96.6, 'concrete');
  L.stairs(cx0, 96.6, cx1, 105.6, 0, ROOF, '+z', 'metalDark', { stepH: 0.25 });
  L.box(cx0, ROOF - 0.3, 105.6, cx1, ROOF, 106.9, 'metalDark');
  // entrance slot in the north wall
  L.wallX(110.1, 111.3, 95.25, 0, 11.9, 'metal', 0.3, [{ a: cx0, b: cx1, y0: 0, y1: 2.2 }], { tint: 0x7a7e7a });
  L.box(110.1, 0, 95.4, 110.4, 11.6, 96.0, 'metal', { tint: 0x7a7e7a });
  L.box(111.0, 0, 95.4, 111.3, 11.6, 106.9, 'metal', { tint: 0x7a7e7a });
  L.wallZ(96.0, 106.9, 110.25, ROOF, 11.6, 'metal', 0.3, [{ a: 105.95, b: 106.55, y0: ROOF, y1: ROOF + 2.1 }], { tint: 0x7a7e7a });
  L.box(110.1, 0, 106.9, 111.3, 11.9, 107.2, 'metal', { tint: 0x7a7e7a });
  L.box(110.1, 11.6, 95.4, 111.3, 11.9, 106.9, 'metalDark');
  // stepped ceiling inside the chute (keeps 2.4 m headroom over the slope)
  for (let z = 95.4; z < 106.9 - 1e-6; z += 0.5) {
    const ze = Math.min(106.9, z + 0.5);
    const b = Math.min(ROOF, Math.max(0, ze - 96.6)) + 2.4;
    if (b < 11.6) L.box(cx0, b, z, cx1, 11.6, ze, 'metalDark');
  }
  // rubber strip curtain over the slot + signage
  for (let x = cx0 + 0.04; x < cx1; x += 0.1) L.box(x, 0.35, 95.07, x + 0.08, 2.2, 95.09, 'rubber', { collide: false, tint: 0x1a1a1a });
  sign(L, 'CONVEYOR 2\nKEEP CLEAR', 110.7, 2.75, 95.08, 0, 1.0, 0.5, { bg: '#d8b020', fg: '#101010' });
  for (let x = cx0 + 0.04; x < cx1; x += 0.1) L.box(111.23, ROOF + 0.3, x - 110.4 + 105.97, 111.25, ROOF + 2.05, x - 110.4 + 106.03, 'rubber', { collide: false, tint: 0x1a1a1a });
  wallPack(L, 110.7, 4.2, 95.05, 0, -1, { intensity: 8, flicker: 0.6 });
}

function warehouse(L, game) {
  const X0 = 50, X1 = 110.4, Z0 = 96, Z1 = 136.4;
  // walls (exterior from ground level; interior floor is at dock height)
  L.box(X0, 0, Z0, X1, ROOF, Z0 + 0.4, 'concrete', { tint: 0x9a968a });
  L.box(X0, 0, Z1 - 0.4, X1, ROOF, Z1, 'concrete', { tint: 0x9a968a });
  L.box(X0, 0, Z0 + 0.4, X0 + 0.4, ROOF, Z1 - 0.4, 'concrete', { tint: 0x9a968a });
  L.box(X1 - 0.4, 0, Z0 + 0.4, X1, ROOF, Z1 - 0.4, 'concrete', { tint: 0x9a968a });
  // interior wall finish: painted block lower band
  L.box(X0 + 0.4, WF, Z0 + 0.4, X1 - 0.4, WF + 2.4, Z0 + 0.42, 'concreteDark', { collide: false, tint: 0x5a6a7a });
  L.box(X0 + 0.4, WF, Z1 - 0.42, X1 - 0.4, WF + 2.4, Z1 - 0.4, 'concreteDark', { collide: false, tint: 0x5a6a7a });
  L.box(X1 - 0.42, WF, Z0 + 0.42, X1 - 0.4, WF + 2.4, Z1 - 0.42, 'concreteDark', { collide: false, tint: 0x5a6a7a });
  // parapets
  const par = (x0, z0, x1, z1) => { L.box(x0, ROOF, z0, x1, ROOF + 0.9, z1, 'concrete', { tint: 0x8a867a }); L.box(x0 - 0.03, ROOF + 0.9, z0 - 0.03, x1 + 0.03, ROOF + 0.98, z1 + 0.03, 'metalDark', { collide: false }); };
  par(X0, Z0, 106, Z0 + 0.4);
  par(109.6, Z0, 110.1, Z0 + 0.4);
  par(X0, Z1 - 0.4, X1, Z1);
  par(X0, Z0 + 0.4, X0 + 0.4, Z1 - 0.4);
  par(X1 - 0.4, 107.2, X1, Z1 - 0.4);
  // invisible fall guards above parapets (not above the stack / lift)
  L.clip(X0, ROOF + 0.9, Z0, 100, ROOF + 3, Z0 + 0.4);
  L.clip(X0, ROOF + 0.9, Z1 - 0.4, X1, ROOF + 3, Z1);
  L.clip(X0, ROOF + 0.9, Z0, X0 + 0.4, ROOF + 3, Z1);
  L.clip(X1 - 0.4, ROOF + 0.9, 107.2, X1, ROOF + 3, Z1);
  // roof slab with skylight holes
  const sky = [57, 116, 59.5, 118.5];
  const intact = [];
  for (const x of [72, 86, 100]) for (const z of [104, 124]) intact.push([x, z, x + 2.5, z + 2.5]);
  const holes = [sky, ...intact];
  floorWithHoles(L, X0 + 0.4, Z0 + 0.4, X1 - 0.4, Z1 - 0.4, ROOF, 0.3, 'roof', holes);
  for (const h of holes) {
    const [a, b, c, d] = h;
    L.box(a - 0.15, ROOF, b - 0.15, c + 0.15, ROOF + 0.25, b, 'metalDark');
    L.box(a - 0.15, ROOF, d, c + 0.15, ROOF + 0.25, d + 0.15, 'metalDark');
    L.box(a - 0.15, ROOF, b, a, ROOF + 0.25, d, 'metalDark');
    L.box(c, ROOF, b, c + 0.15, ROOF + 0.25, d, 'metalDark');
    if (h !== sky) {
      L.box(a, ROOF + 0.18, b, c, ROOF + 0.22, d, 'glassDirty', { flags: GLASS });
      for (let x = a + 0.6; x < c - 0.1; x += 0.62) L.box(x - 0.02, ROOF + 0.2, b, x + 0.02, ROOF + 0.24, d, 'metalDark', { collide: false });
    }
  }
  // broken skylight: glass teeth
  for (let i = 0; i < 7; i++) {
    const t = rng();
    const side = i % 4;
    const [x, z] = side === 0 ? [sky[0] + t * 2.5, sky[1] + 0.1] : side === 1 ? [sky[0] + t * 2.5, sky[3] - 0.1] : side === 2 ? [sky[0] + 0.1, sky[1] + t * 2.5] : [sky[2] - 0.1, sky[1] + t * 2.5];
    L.box(x - 0.12, ROOF + 0.12, z - 0.02, x + 0.12, ROOF + 0.24, z + 0.02, 'glass', { collide: false });
  }
  L.decal(58.2, ROOF + 0.01, 119.5, 0, 1, 0, 1.4, DF.SMEAR);
  bodyWithBlood(L, 60.6, ROOF, 119.8, 2.2, 0x4a4a3a);
  graffiti(L, 'DOWN HERE →', 56.2, ROOF + 0.9, Z0 + 0.42, Math.PI, 2.2, 0.7, '#d8d8c8');
  // roof dressing
  for (const [x, z, r] of [[66, 102, 0], [80, 112, Math.PI / 2], [95, 116, 0], [78, 130, 0], [104, 130, Math.PI / 2], [68, 124, Math.PI / 2]]) P.acUnit(L, x, ROOF, z, r);
  for (const [x, z] of [[74, 110], [90, 128], [62, 131], [99, 110]]) { L.box(x - 0.3, ROOF, z - 0.3, x + 0.3, ROOF + 1.2, z + 0.3, 'metal'); L.box(x - 0.42, ROOF + 1.2, z - 0.42, x + 0.42, ROOF + 1.32, z + 0.42, 'metalDark'); }
  P.antenna(L, 92, ROOF, 134, 7);
  P.pipe(L, 66, ROOF + 0.35, 100, 66, ROOF + 0.35, 133, 0.1, 'rust');
  P.pipe(L, 66, ROOF + 0.35, 133, 96, ROOF + 0.35, 133, 0.1, 'rust');
  for (let i = 0; i < 6; i++) L.decal(60 + rng() * 45, ROOF + 0.012, 100 + rng() * 32, 0, 1, 0, 1.5 + rng() * 2, DF.POOL, { alpha: 0.25 });
  wallPack(L, 107.8, ROOF + 2.4, 106.9 + 0.35, 0, 1, { intensity: 9, flicker: 0.3 });
  // rooftop stair bulkhead (locked) with a lamp: a landmark between the lift and the skylight
  L.box(82, ROOF, 118, 86, ROOF + 2.8, 121, 'brickDark');
  L.box(81.9, ROOF + 2.8, 117.9, 86.1, ROOF + 3.0, 121.1, 'roof');
  new Door(L, 84, ROOF, 117.9, 'x', { width: 1.0, locked: true, material: 'paintedGreen' });
  wallPack(L, 84, ROOF + 2.55, 117.85, 0, -1, { intensity: 10, range: 11, flicker: 0.2 });
  sign(L, 'ROOF ACCESS\nNO ENTRY', 85.5, ROOF + 1.7, 117.88, 0, 0.8, 0.4, { bg: '#e8e0c8', fg: '#8a1010' });
  L.box(107.6, ROOF + 2.2, 106.9, 108.0, ROOF + 2.6, 107.2, 'metalDark', { collide: false });
  L.reverb(X0, ROOF, Z0, X1, ROOF + 12, Z1, 'outdoor');
  L.ambience(X0, ROOF - 0.2, Z0, X1, ROOF + 12, Z1, 'rooftop');

  // ---- interior
  floorWithHoles(L, X0 + 0.4, Z0 + 0.4, X1 - 0.4, Z1 - 0.4, WF, 0.3, 'concreteFloor', [[100, 127, 101.5, 128.5]]);
  for (const x of [67, 75, 83, 91]) C.rollDoor(L, x, WF, Z0 + 0.4, 3.4, 3.8, 1, { tint: 0x7a7e7a });
  // mezzanine (west end)
  const MZ = 5.2;
  L.box(X0 + 0.4, MZ - 0.2, 108, 64, MZ, Z1 - 0.4, 'diamond', { tint: 0x8a8e8a });
  L.box(63.7, MZ - 0.55, 108, 64, MZ - 0.2, Z1 - 0.4, 'paintedYellow', { collide: false, tint: 0xc8961a });
  L.box(X0 + 0.4, MZ - 0.55, 108, 64, MZ - 0.2, 108.3, 'paintedYellow', { collide: false, tint: 0xc8961a });
  for (const z of [109, 115, 121, 127, 133]) L.box(63.55, WF, z - 0.15, 63.85, MZ - 0.2, z + 0.15, 'paintedYellow', { tint: 0xc8961a });
  for (const x of [56, 62]) L.box(x - 0.15, WF, 108.15, x + 0.15, MZ - 0.2, 108.45, 'paintedYellow', { tint: 0xc8961a });
  L.stairs(64, 108.2, 71, 109.8, WF, MZ, '-x', 'diamond', { thin: true });
  railing(L, X0 + 0.4, 108.05, 64, 108.05, MZ, 1.0);
  railing(L, 63.95, 109.9, 63.95, Z1 - 0.4, MZ, 1.0);
  railSegment(L, 64, MZ + 0.95, 109.85, 71, WF + 0.95, 109.85);
  railSegment(L, 64, MZ + 0.95, 108.15, 71, WF + 0.95, 108.15);
  // mezzanine office
  shell(L, X0 + 0.4, 128, 57, Z1 - 0.4, MZ, MZ + 2.8, 'plaster', 0.15, { n: [{ a: 51.5, b: 55.8, y0: MZ + 1.0, y1: MZ + 2.2 }], e: [doorOp(130.5, 1.0, MZ), { a: 132.2, b: 135.4, y0: MZ + 1.0, y1: MZ + 2.2 }] }, { tint: 0xc8c4b8 });
  new Door(L, 56.925, MZ, 130.5, 'z', { width: 1.0, material: 'woodPale' });
  L.box(X0 + 0.4, MZ + 2.8, 128, 57, MZ + 2.95, Z1 - 0.4, 'ceiling');
  L.box(51.5, MZ + 1.0, 128.06, 55.8, MZ + 2.2, 128.09, 'glassDirty', { flags: GLASS });
  L.box(56.9, MZ + 1.0, 132.2, 56.95, MZ + 2.2, 135.4, 'glassDirty', { flags: GLASS });
  P.desk(L, 53, MZ, 133.5, Math.PI);
  P.officeChair(L, 53, MZ, 132.6, 0.3);
  P.filingCabinet(L, 51.0, MZ, 129.0, -Math.PI / 2);
  P.filingCabinet(L, 51.0, MZ, 129.6, -Math.PI / 2);
  C.shelving(L, 55.5, MZ, 135.7, Math.PI, 1.8, 'goods');
  ceilingLight(L, 53.6, MZ + 2.8, 131.5, { type: 'bulb', intensity: 7, flicker: 0.4 });
  L.item('medkit', 53, MZ + 0.78, 133.6, { chance: 0.6 });
  L.item('pipebomb', 51.6, MZ + 1.34, 129.3, { chance: 0.5 });
  sign(L, 'SHIPPING OFFICE', 57.0, MZ + 2.45, 130.5, -Math.PI / 2, 1.4, 0.25, { bg: '#e8e0c8', fg: '#1a1a1a' });
  // mezzanine storage
  for (const [x, z] of [[52, 110], [52, 112], [54.5, 110.5], [60, 124], [61.2, 125.3], [52, 124]]) C.wrappedPallet(L, x, MZ, z, rng() * 0.3, 0.9 + rng() * 0.8);
  C.shelving(L, 50.7, MZ, 118, -Math.PI / 2, 3.0, 'goods');
  ceilingLight(L, 58.2, ROOF - 0.3, 117.2, { type: 'cage', intensity: 10, flicker: 0.2 });
  // racks
  for (const z of [102, 110, 118]) C.rackRow(L, 74, 100.5, z, WF);
  sign(L, 'AISLE A', 73.6, WF + 4.2, 102, -Math.PI / 2, 1.1, 0.3, { bg: '#d8b020', fg: '#101010' });
  sign(L, 'AISLE B', 73.6, WF + 4.2, 110, -Math.PI / 2, 1.1, 0.3, { bg: '#d8b020', fg: '#101010' });
  sign(L, 'AISLE C', 73.6, WF + 4.2, 118, -Math.PI / 2, 1.1, 0.3, { bg: '#d8b020', fg: '#101010' });
  // south floor: containers, forklift, pallets
  C.container(L, 70, WF, 128.5, 82, WF + 2.6, 131.0, 0x3a5a3a);
  C.container(L, 84, WF, 131.0, 92, WF + 2.6, 133.6, 0x6a4a2a);
  C.forklift(L, 88.5, WF, 124.5, 2.4);
  hittable(L, 'dumpster', 106.5, WF, 133.5, Math.PI / 2);
  for (const [x, z] of [[96, 124], [97.3, 124.2], [66, 124], [67.4, 122.6], [94, 106.5], [70, 99], [71.5, 99.2]]) C.wrappedPallet(L, x, WF, z, rng() * 0.4, 1.0 + rng() * 0.6);
  for (let i = 0; i < 6; i++) P.crate(L, 58 + (i % 3) * 0.9, WF, 99.6 + Math.floor(i / 3) * 0.9, rng() * 0.3, 0.9);
  // floor markings
  for (const z of [106, 114]) L.box(74, WF + 0.004, z - 0.05, 100.5, WF + 0.01, z + 0.05, 'paintedYellow', { collide: false, tint: 0xd8b020 });
  // break room (NE corner)
  shell(L, 102, Z0 + 0.4, X1 - 0.4, 101.5, WF, WF + 3, 'plaster', 0.15, { s: [doorOp(104, 1.0, WF), { a: 105.5, b: 108.8, y0: WF + 1.0, y1: WF + 2.2 }] }, { tint: 0xb8c0b8 });
  new Door(L, 104, WF, 101.425, 'x', { width: 1.0, material: 'woodPale', open: true });
  L.box(105.5, WF + 1.0, 101.4, 108.8, WF + 2.2, 101.44, 'glassDirty', { flags: GLASS });
  L.box(102, WF + 3, Z0 + 0.4, X1 - 0.4, WF + 3.15, 101.5, 'ceiling');
  P.table(L, 106, WF, 98.8, 0, 1.6, 0.8);
  P.chair(L, 105.4, WF, 99.6, 0.2);
  P.chair(L, 106.9, WF, 98.0, 2.6, 'woodDark', true);
  P.vending(L, 109.5, WF, 99.6, -Math.PI / 2);
  C.locker(L, 102.6, WF, 99.0, Math.PI / 2, 3);
  ceilingLight(L, 106, WF + 3, 99, { type: 'fluoro', intensity: 8, flicker: 0.5 });
  L.item('ammo', 106.5, WF + 0.79, 98.8, { chance: 0.8 });
  L.item('pills', 105.6, WF + 0.79, 98.9, { chance: 0.5 });
  L.item('m60', 108.6, WF + 0.02, 97.6, { chance: 0.12 });
  // drain access (down into the sewer)
  const dg = P.prop(L, 99.3, WF, 126.4, 0.3);
  dg.box(0, 0.03, 0, 1.4, 0.05, 1.4, 'rust', 0x3a3430);
  for (const [x, z] of [[99.6, 126.6], [102.2, 126.8], [99.7, 129.1], [102.1, 129.0]]) physProp(L, 'cone', x, WF, z);
  sign(L, 'STORM DRAIN\nACCESS', 100.75, WF + 0.012, 126.6, 0, 1.4, 0.5, { fg: '#d8b020' }).rotation.set(-Math.PI / 2, 0, 0);
  const tripod = P.prop(L, 103.2, WF, 127.8, 0);
  tripod.cyl(0, 0.9, 0, 0.02, 1.8, 'metalDark', null, null, 6).box(0, 1.85, -0.1, 0.35, 0.28, 0.18, 'metalDark', null, [0.4, 0, 0]).box(0, 1.84, -0.2, 0.28, 0.22, 0.02, 'emissiveWarm', null, [0.4, 0, 0]);
  L.light(101.5, WF + 1.8, 127.8, 0xfff0d0, 12, 9, { flicker: 0.1 });
  bloodTrail(L, 96, 122, 100.3, 127.3, WF, 6);
  // lights
  for (const [x, z, fl, on] of [[80, 106, 0.2, true], [96, 106, 0.6, true], [80, 114, 0.1, false], [96, 114, 0.2, true], [80, 124, 0.4, true], [70, 116, 0.7, true]]) ceilingLight(L, x, ROOF - 0.3, z, { type: 'cage', intensity: 20, range: 17, flicker: fl, on });
  L.light(108.5, WF + 3.5, 116, 0xff2010, 5, 8, { flicker: 0.8 });
  L.box(109.55, WF + 3.3, 115.8, 109.6, WF + 3.6, 116.2, 'emissiveRed', { collide: false });
  bodyWithBlood(L, 86, WF, 106.5, 0.4, 0x6a4a1a);
  bodyWithBlood(L, 68, WF, 113, 2.1, 0x2a3a5a);
  sign(L, 'SAFETY FIRST\n214 DAYS WITHOUT\nAN ACCIDENT', 80, WF + 3.2, Z0 + 0.43, Math.PI, 2.6, 1.1, { bg: '#1a3a6a', fg: '#ffffff', border: '#d8b020' });
  graffiti(L, 'THE SEWER\nGOES TO MERCY', X1 - 0.42, WF + 1.9, 124, -Math.PI / 2, 2.2, 0.9, '#b8201a');
  L.witchSpots.push({ x: 89, y: WF, z: 114 });
  L.reverb(X0, WF, Z0, X1, ROOF - 0.3, Z1, 'hall');
  L.ambience(X0, WF - 0.2, Z0, X1, ROOF - 0.3, Z1, 'apartments');
}

function sewer(L, game) {
  // ---- access room below the warehouse floor
  const AX0 = 90, AX1 = 106, AZ0 = 120, AZ1 = 136;
  L.box(AX0, YC - 0.3, AZ0, AX1, YC, AZ1, 'concreteDark', { tint: 0x5a5a50 });
  L.box(97, YC - 0.3, 121, AX1, -2.2, 131, 'concrete', { tint: 0x7a786e });
  L.stairs(92.2, 128, 97, 130.5, YC, -2.2, '+x', 'concrete');
  L.wallX(AX0 - 0.4, AX1 + 0.4, AZ0 - 0.2, YC - 0.3, WF - 0.3, 'sewer', 0.4);
  L.wallZ(AZ0, AZ1, AX0 - 0.2, YC - 0.3, WF - 0.3, 'sewer', 0.4);
  L.wallZ(AZ0, AZ1, AX1 + 0.2, YC - 0.3, WF - 0.3, 'sewer', 0.4);
  L.wallX(AX0 - 0.4, AX1 + 0.4, AZ1 + 0.2, YC - 0.3, 0, 'sewer', 0.4, [{ a: 91, b: 96, y0: YC, y1: YC + 3.9 }]);
  water(L, 91, AZ1, 94.9, AZ1 + 0.4);
  water(L, AX0, 131, AX1, AZ1);
  water(L, AX0, AZ0, 97, 131);
  railing(L, 97.05, 121.2, 97.05, 127.9, -2.2, 1.0);
  railing(L, 97.2, 130.95, AX1, 130.95, -2.2, 1.0);
  railing(L, 92.2, 130.55, 97, 130.55, -2.2, 1.0, false);
  railSegment(L, 92.2, YC + 1.0, 130.55, 97, -2.2 + 1.0, 130.55);
  P.pumpMachine(L, 93.5, YC, 123.5, Math.PI / 2);
  P.electricPanel(L, 105.7, -2.2, 124.5, -Math.PI / 2);
  P.electricPanel(L, 105.7, -2.2, 126.0, -Math.PI / 2, false);
  C.locker(L, 98.0, -2.2, 121.4, 0, 3);
  C.workbench(L, 103.5, -2.2, 130.3, Math.PI, 2.2);
  L.item('ammo', 103.2, -2.2 + 0.94, 130.3);
  L.item('pills', 104.2, -2.2 + 0.94, 130.2, { chance: 0.6 });
  L.item('health', 98.5, -2.2 + 0.02, 124.2, { chance: 0.4 });
  for (const z of [122, 134]) P.pipe(L, AX0 + 0.3, -1.0, z, AX1 - 0.3, -1.0, z, 0.2, 'rust', 0x6a5a4a);
  P.pipe(L, 105.6, -2.2, 132, 105.6, WF - 0.3, 132, 0.15, 'metalDark');
  P.valveWheel(L, 105.35, -2.2 + 1.3, 132, Math.PI / 2);
  ceilingLight(L, 101, WF - 0.3, 124.5, { type: 'cage', intensity: 9, flicker: 0.3 });
  L.light(93.5, YC + 2.4, 134.5, 0xffb870, 8, 9, { flicker: 0.5 });
  L.box(93.4, YC + 2.4, 135.55, 93.6, YC + 2.6, 135.6, 'emissiveWarm', { collide: false });
  sign(L, 'CITY SEWER DEPT.\nAUTHORIZED PERSONNEL ONLY', 101, -2.2 + 2.0, AZ0 + 0.02, Math.PI, 2.4, 0.7, { bg: '#e8e0c8', fg: '#1a3a8a', border: '#1a3a8a' });
  graffiti(L, 'IT\'S IN\nTHE WATER', AX0 + 0.02, YC + 2.2, 126, Math.PI / 2, 1.8, 0.8, '#3a6a2a');
  L.reverb(AX0, YC - 0.5, AZ0, AX1, WF - 0.3, AZ1, 'sewer');
  L.ambience(AX0, YC - 0.5, AZ0, AX1, WF - 0.3, AZ1, 'sewer');

  // ---- tunnel A (south) x 91..96, z 136.4..149.6, ledge on the east
  tunnel(L, 'z', AZ1 + 0.4, 149.6, 91, 96, { ledge: 'hi', lights: [143], ledgeW: 1.1 });
  P.debris(L, 93, YC, 146.5, 0.9, 'sewer', 7);
  bodyWithBlood(L, 95.4, YD - 0.01, 140.5, 1.4, 0x5a4a2a);
  P.pipe(L, 90.9, YC + 1.2, 141.5, 91.8, YC + 1.2, 141.5, 0.28, 'concrete');
  const inflow = { t: 0, update(dt) { const cp = game.camPos; if ((cp.x - 91.9) ** 2 + (cp.z - 141.5) ** 2 > 900) return; if (Math.random() < 0.6) game.fx.splash(92.1 + Math.random() * 0.4, YW + 0.02, 141.5 + (Math.random() - 0.5) * 0.4, 2); } };
  L.dynamics.push(inflow);
  L.box(91.8, YC + 0.4, 141.35, 92.3, YC + 1.2, 141.65, 'waterSurface', { collide: false });

  // ---- pump station x 86..106, z 150..168 (dry floor)
  const PX0 = 86, PX1 = 106, PZ0 = 150, PZ1 = 168, PC = -1.2;
  L.box(PX0, YC - 0.3, PZ0, PX1, YD, PZ1, 'concreteDark', { tint: 0x6a6a60 });
  L.box(PX0 - 0.4, PC, PZ0 - 0.4, PX1 + 0.4, PC + 0.3, PZ1 + 0.4, 'concrete', { tint: 0x5a5a54 });
  L.wallX(PX0 - 0.4, PX1 + 0.4, PZ0 - 0.2, YC - 0.3, PC, 'concrete', 0.4, [{ a: 91, b: 96, y0: YC, y1: YC + 3.9 }], { tint: 0x8a867a });
  water(L, 91, PZ0 - 0.4, 94.9, PZ0);
  L.box(94.9, YC, PZ0 - 0.4, 96, YD, PZ0, 'concreteDark', { tint: 0x6a6a5e });
  L.wallX(PX0 - 0.4, PX1 + 0.4, PZ1 + 0.2, YC - 0.3, PC, 'concrete', 0.4, [], { tint: 0x8a867a });
  L.wallZ(PZ0, PZ1, PX0 - 0.2, YC - 0.3, PC, 'concrete', 0.4, [], { tint: 0x8a867a });
  L.wallZ(PZ0, PZ1, PX1 + 0.2, YC - 0.3, PC, 'concrete', 0.4, [doorOp(158.2, 1.2, YD)], { tint: 0x8a867a });
  L.box(PX0, YD, PZ0, 91, YD + 1.2, PZ0 + 0.02, 'paintedYellow', { collide: false, tint: 0x8a7a2a });
  L.box(96, YD, PZ0, 100.8, YD + 1.2, PZ0 + 0.02, 'paintedYellow', { collide: false, tint: 0x8a7a2a });
  const pumpDoor = new Door(L, PX1 + 0.2, YD, 158.2, 'z', { width: 1.2, locked: true, material: 'paintedYellow' });
  pumpDoor.hp = 1e9;
  for (const x of [90, 95.5, 101]) {
    L.box(x - 1.5, YD, 160.9, x + 1.5, YD + 0.25, 163.1, 'concrete');
    P.pumpMachine(L, x, YD + 0.25, 162, 0);
    P.pipe(L, x + 0.6, YD + 2.0, 162, x + 0.6, PC, 162, 0.16, 'paintedGreen', 0x2e5a4a);
    P.pipe(L, x - 1.2, YD + 0.95, 162, x - 1.2, YD + 0.95, 166.5, 0.18, 'paintedGreen', 0x2e5a4a);
    P.valveWheel(L, x - 1.2, YD + 1.5, 164.5, 0);
  }
  P.pipe(L, PX0 + 0.5, YD + 0.95, 166.5, PX1 - 1, YD + 0.95, 166.5, 0.3, 'paintedGreen', 0x2e5a4a);
  P.pipe(L, PX0 + 0.5, PC - 0.4, 157, PX1 - 0.5, PC - 0.4, 157, 0.25, 'rust', 0x6a5a4a);
  for (const z of [151.2, 154, 156.8]) P.electricPanel(L, PX0 + 0.4, YD, z, -Math.PI / 2, z !== 154);
  sign(L, 'PUMP STATION 4', 96, YD + 2.6, PZ1 - 0.02, 0, 3.2, 0.5, { bg: '#1a3a2a', fg: '#e8e8e0', border: '#e8e8e0' });
  sign(L, 'DANGER\nHIGH VOLTAGE', PX0 + 0.02, YD + 2.2, 154, Math.PI / 2, 1.1, 0.6, { bg: '#d8c030', fg: '#101010', border: '#101010' });
  // control booth (east side, raised)
  const BY = YD + 1.2;
  L.box(100.8, YC - 0.3, 150, PX1, BY, 156.2, 'concrete', { tint: 0x7a786e });
  L.stairs(98.4, 151.4, 100.8, 153.6, YD, BY, '+x', 'metal');
  railing(L, 100.85, 153.7, 100.85, 156.2, BY, 1.0);
  L.box(100.8, BY, 156.1, PX1, BY + 1.05, 156.3, 'concrete', { tint: 0x8a867a });
  L.box(100.8, BY + 1.05, 156.18, PX1, BY + 2.2, 156.22, 'glassDirty', { flags: GLASS });
  L.box(101.0, BY, 150.4, 104.5, BY + 0.9, 151.1, 'metal', { tint: 0x6a7a70 });
  for (let i = 0; i < 6; i++) L.box(101.3 + i * 0.5, BY + 0.9, 150.6, 101.5 + i * 0.5, BY + 0.96, 150.8, i % 2 ? 'emissiveGreen' : 'emissiveRed', { collide: false });
  P.radioTable(L, 104.9, BY, 153.3, -Math.PI / 2);
  P.officeChair(L, 103.6, BY, 152.4, 0.4);
  const lever = P.prop(L, 105.75, BY + 1.2, 151.6, -Math.PI / 2);
  lever.box(0, 0, 0, 0.5, 0.7, 0.2, 'paintedYellow', 0xd8a020).box(0, 0.1, -0.12, 0.08, 0.35, 0.06, 'paintedRed', 0xc02010, [0.5, 0, 0]).box(0, 0.25, -0.105, 0.3, 0.08, 0.01, 'emissiveRed');
  sign(L, 'DOOR 4\nEMERGENCY RELEASE', 105.78, BY + 1.85, 151.6, -Math.PI / 2, 0.9, 0.35, { bg: '#e8e0c8', fg: '#8a1010' });
  L.item('medkit', 104.9, BY + 0.94, 152.9, { chance: 0.6 });
  L.item('tier2', 101.6, BY + 0.02, 155.4, { chance: 0.4 });
  L.item('bile', 104.9, BY + 0.94, 153.8, { chance: 0.3 });
  const alarmLights = [L.light(103, PC - 0.4, 157.5, 0xff2010, 0, 12, { priority: 1 }), L.light(92, PC - 0.4, 158, 0xff2010, 0, 12, { priority: 1 })];
  for (const [x, z] of [[103, 157.5], [92, 158]]) L.box(x - 0.1, PC - 0.3, z - 0.1, x + 0.1, PC, z + 0.1, 'emissiveRed', { collide: false });
  ceilingLight(L, 90, PC, 155, { type: 'cage', intensity: 10, flicker: 0.2 });
  ceilingLight(L, 96, PC, 165, { type: 'cage', intensity: 8, flicker: 0.6 });
  ceilingLight(L, 103.3, PC, 153, { type: 'fluoro', intensity: 8, flicker: 0.3 });
  bodyWithBlood(L, 97.5, YD, 157.5, 2.4, 0x3a5a7a);
  bodyWithBlood(L, 88.5, YD, 164.5, 0.7, 0x6a4a1a);
  graffiti(L, 'HIT THE\nRELEASE ↑', PX1 - 0.02, YD + 1.7, 160.2, -Math.PI / 2, 1.4, 0.7, '#d8d8c8');
  L.witchSpots.push({ x: 88, y: YD, z: 152 });
  L.reverb(PX0, YC, PZ0, PX1, PC, PZ1, 'hall');
  L.ambience(PX0, YC, PZ0, PX1, PC, PZ1, 'sewer');
  // door release crescendo
  let released = false;
  L.trigger(98, YD - 0.2, 156, PX1, YD + 2, 160.5, (s) => {
    if (released) return;
    game.session.objective('Release the door lock in the control booth');
    game.voice.script([{ who: 'francis', text: 'Door\'s locked. Figures.', d: 0 }, { who: 'zoey', text: 'There\'s a release up in the control booth!', d: 2.2 }]);
  });
  usable(L, 105.55, BY + 1.3, 151.6, 'Pull emergency release', (s) => {
    released = true;
    game.session.objective('Get through the pump station door');
    const alarm = game.audio.loop('alarm', { pos: new THREE.Vector3(103, YD + 2, 157), vol: 1 });
    game.voice.script([{ who: 'louis', text: 'That alarm is gonna bring every one of them down here!', d: 0.8 }]);
    game.director.panic('pumpDoor', { waves: 2, size: [12, 18], interval: 13, where: 'any', minD: 16, maxD: 45 });
    let t = 0;
    const blink = { update(dt) { t += dt; const on = Math.floor(t * 3) % 2 === 0 && t < 12; for (const l of alarmLights) l.intensity = on ? 10 : 0; if (t > 12 && alarm) { alarm.stop(1); } } };
    L.dynamics.push(blink);
    L.after(4.5, () => {
      pumpDoor.locked = false;
      pumpDoor.open = true;
      pumpDoor.dirSign = -pumpDoor.hingeSign;
      pumpDoor.targetAngle = Math.PI / 2 * 0.95;
      game.audio.play('metalGate', { pos: pumpDoor.usable.pos, vol: 1 });
    });
  }, { hold: 1.5, holdLabel: 'Pulling release', radius: 1.6, sound: 'metalGate' });

  // ---- maintenance corridor x 106.4..127.6, z 157..159.4 (dry, dark)
  const KZ0 = 157, KZ1 = 159.4, KC = YD + 2.8;
  L.box(PX1 + 0.4, YC - 0.3, KZ0, 127.6, YD, KZ1, 'concrete', { tint: 0x6a6860 });
  L.box(PX1 + 0.4, KC, KZ0 - 0.4, 127.6, KC + 0.3, KZ1 + 0.4, 'concrete', { tint: 0x5a5854 });
  L.wallX(PX1 + 0.4, 127.6, KZ0 - 0.2, YC - 0.3, KC, 'concreteDark', 0.4);
  L.wallX(PX1 + 0.4, 127.6, KZ1 + 0.2, YC - 0.3, KC, 'concreteDark', 0.4);
  P.pipe(L, PX1 + 0.5, KC - 0.25, KZ0 + 0.3, 127.5, KC - 0.25, KZ0 + 0.3, 0.12, 'rust');
  P.pipe(L, PX1 + 0.5, KC - 0.45, KZ0 + 0.25, 127.5, KC - 0.45, KZ0 + 0.25, 0.06, 'metalDark');
  P.pipe(L, PX1 + 0.5, YD + 0.3, KZ1 - 0.2, 127.5, YD + 0.3, KZ1 - 0.2, 0.1, 'paintedGreen', 0x2e5a4a);
  ceilingLight(L, 111, KC, 158.2, { type: 'fluoro', intensity: 8, flicker: 0.8 });
  ceilingLight(L, 118, KC, 158.2, { type: 'fluoro', on: false });
  ceilingLight(L, 124.5, KC, 158.2, { type: 'fluoro', intensity: 6, flicker: 0.5 });
  P.electricPanel(L, 115, YD, KZ1 - 0.2, Math.PI, true);
  bodyWithBlood(L, 120, YD, 158.4, 1.5, 0xc86818);
  bloodTrail(L, 112, 158.2, 127, 158.0, YD, 9);
  graffiti(L, 'DONT GO\nTOWARD THE\nCRYING', 116.5, YD + 1.3, KZ0 + 0.02, Math.PI, 2.0, 1.0, '#b8201a');
  L.reverb(PX1, YC, KZ0, 127.6, KC, KZ1, 'tunnel');
  L.ambience(PX1, YC, KZ0, 127.6, KC, KZ1, 'sewer');

  // ---- tunnel B x 128..149.6, z 155.5..160.5 (ledge on the north)
  tunnel(L, 'x', 128, 149.6, 155.5, 160.5, { ledge: 'lo', lights: [139], ledgeW: 1.1 });
  L.wallZ(155, 161, 127.8, YC - 0.3, YC + 4.2, 'sewer', 0.4, [{ a: KZ0, b: KZ1, y0: YD, y1: KC }]);
  // storm grate light shaft in tunnel B
  for (let x = 144; x < 146; x += 0.25) L.box(x, YC + 3.88, 157.4, x + 0.05, YC + 3.9, 158.6, 'metalDark', { collide: false });
  L.light(145, YC + 3.2, 158, 0x9aaccc, 7, 8, {});
  P.debris(L, 134, YC, 159, 1.0, 'brick', 9);

  // ---- junction chamber x 150..172, z 146..170
  const JX0 = 150, JX1 = 172, JZ0 = 146, JZ1 = 170, JC = -0.8;
  L.box(JX0, YC - 0.3, JZ0, JX1, YC, JZ1, 'sewer', { tint: 0x4a4a3a });
  L.box(JX0 - 0.4, JC, JZ0 - 0.4, JX1 + 0.4, JC + 0.3, JZ1 + 0.4, 'sewer');
  L.wallZ(JZ0, JZ1, JX0 - 0.2, YC - 0.3, JC, 'sewer', 0.4, [{ a: 155.5, b: 160.5, y0: YC, y1: YC + 3.9 }]);
  water(L, JX0 - 0.4, 156.6, JX0, 160.5);
  L.box(JX0 - 0.4, YC, 155.5, JX0, YD, 156.6, 'concreteDark', { tint: 0x6a6a5e });
  L.wallZ(JZ0, JZ1, JX1 + 0.2, YC - 0.3, JC, 'sewer', 0.4, [{ a: 148.5, b: 153.1, y0: YC, y1: YC + 3.9 }, { a: 162, b: 166, y0: YD, y1: YC + 3.2 }]);
  water(L, JX1, 148.5, JX1 + 0.4, 153.1);
  L.wallX(JX0 - 0.4, JX1 + 0.4, JZ0 - 0.2, YC - 0.3, JC, 'sewer', 0.4, [{ a: 158.5, b: 163.5, y0: YD, y1: YC + 3.4 }]);
  L.wallX(JX0 - 0.4, JX1 + 0.4, JZ1 + 0.2, YC - 0.3, JC, 'sewer', 0.4);
  // walkways (dry) around the basin
  const WW = 1.8;
  const walk = (x0, z0, x1, z1) => { L.box(x0, YC - 0.3, z0, x1, YD, z1, 'concreteDark', { tint: 0x6a6a5e }); };
  walk(JX0, JZ0, JX1, JZ0 + WW);
  walk(JX0, JZ1 - WW, JX1, JZ1);
  walk(JX0, JZ0 + WW, JX0 + WW, 155.5);
  walk(JX0, 160.5, JX0 + WW, JZ1 - WW);
  walk(JX1 - WW, 153.1, JX1, JZ1 - WW);
  walk(JX1 - WW, JZ0 + WW, JX1, 148.5);
  water(L, JX0 + WW, JZ0 + WW, JX1 - WW, JZ1 - WW);
  water(L, JX0, 155.5, JX0 + WW, 160.5);
  water(L, JX1 - WW, 148.5, JX1, 153.1);
  // dead-end mouths with grates
  L.box(158.5, YC - 0.3, JZ0 - 1.6, 163.5, YD, JZ0 - 0.4, 'sewer');
  L.box(158.1, YC - 0.3, JZ0 - 2.0, 163.9, JC, JZ0 - 1.6, 'sewer');
  L.box(158.1, YC - 0.3, JZ0 - 1.6, 158.5, JC, JZ0 - 0.4, 'sewer');
  L.box(163.5, YC - 0.3, JZ0 - 1.6, 163.9, JC, JZ0 - 0.4, 'sewer');
  L.box(158.1, YC + 3.4, JZ0 - 1.6, 163.9, JC, JZ0 - 0.4, 'sewer');
  C.grate(L, 158.5, YD, JZ0 - 0.5, 163.5, YC + 3.4, JZ0 - 0.4, 'x');
  L.box(JX1 + 0.4, YC - 0.3, 161.6, JX1 + 1.6, YD, 166.4, 'sewer');
  L.box(JX1 + 1.6, YC - 0.3, 161.6, JX1 + 2.0, JC, 166.4, 'sewer');
  L.box(JX1 + 0.4, YC + 3.2, 161.6, JX1 + 1.6, JC, 166.4, 'sewer');
  C.grate(L, JX1 + 0.4, YD, 162, JX1 + 0.5, YC + 3.2, 166, 'z');
  // pillars
  for (const [x, z] of [[156, 153], [166, 153], [156, 163], [166, 163]]) {
    L.box(x - 0.6, YC, z - 0.6, x + 0.6, JC, z + 0.6, 'brickDark', { tint: 0x7a6a5a });
    L.box(x - 0.66, YW - 0.05, z - 0.66, x + 0.66, YW + 0.4, z + 0.66, 'sewer', { collide: false, tint: 0x2a2a1e });
  }
  // waterfalls from big outflow pipes
  const falls = [[154.5, JZ0 + 0.2, 0], [JX1 - 0.2, 158, 1]];
  for (const [x, z, ax] of falls) {
    if (ax === 0) {
      P.pipe(L, x, YC + 2.8, JZ0 - 0.2, x, YC + 2.8, JZ0 + 1.2, 0.55, 'concrete');
      L.box(x - 0.45, YW, JZ0 + 1.1, x + 0.45, YC + 2.6, JZ0 + 1.25, 'waterSurface', { collide: false });
    } else {
      P.pipe(L, JX1 + 0.2, YC + 2.8, z, JX1 - 1.2, YC + 2.8, z, 0.55, 'concrete');
      L.box(JX1 - 1.25, YW, z - 0.45, JX1 - 1.1, YC + 2.6, z + 0.45, 'waterSurface', { collide: false });
    }
  }
  L.dynamics.push({
    update(dt) {
      const cp = game.camPos;
      if ((cp.x - 161) ** 2 + (cp.z - 158) ** 2 > 1600 || cp.y > -1) return;
      if (Math.random() < 0.8) game.fx.splash(154.5 + (Math.random() - 0.5) * 0.8, YW + 0.02, JZ0 + 1.9 + (Math.random() - 0.5) * 0.5, 3);
      if (Math.random() < 0.8) game.fx.splash(JX1 - 1.9 + (Math.random() - 0.5) * 0.5, YW + 0.02, 158 + (Math.random() - 0.5) * 0.8, 3);
    },
  });
  // storm grate shaft in the ceiling
  for (let x = 159.8; x < 162.2; x += 0.3) L.box(x, JC - 0.02, 157.2, x + 0.06, JC, 158.8, 'metalDark', { collide: false });
  L.light(161, JC - 0.6, 158, 0x9aaccc, 12, 12, {});
  ceilingLight(L, 153, JC, 148.5, { type: 'cage', intensity: 9, flicker: 0.5 });
  ceilingLight(L, 169, JC, 167.5, { type: 'cage', intensity: 7, flicker: 0.8 });
  bodyWithBlood(L, 152, YD, 150.5, 0.2, 0x3a3a3a);
  P.corpse(L, 163.5, YC + 0.02, 156, 1.9, 0x5a5a4a);
  L.item('throwable', 170.9, YD + 0.02, 168.8, { chance: 0.6 });
  L.item('pills', 151.0, YD + 0.02, 168.8, { chance: 0.4 });
  graffiti(L, 'HOSPITAL\n→ EXIT HATCH', JX1 - 0.02, YD + 1.8, 150.8, -Math.PI / 2, 2.0, 0.9, '#d8d8c8');
  L.witchSpots.push({ x: 170.9, y: YD, z: 166.5 }, { x: 151.0, y: YD, z: 166.5 });
  L.reverb(JX0, YC, JZ0, JX1, JC, JZ1, 'sewer');
  L.ambience(JX0, YC - 0.5, JZ0, JX1, JC, JZ1, 'sewer');

  // ---- tunnel C (east) x 172.4..180.2, z 148.5..153.1 -> exit stairs (+z) up to the plaza hatch
  tunnel(L, 'x', JX1 + 0.4, 180.2, 148.5, 153.1, { ledge: null, open: { hi: [[177.2, 179.8, YC + 3.9]] }, lights: [175], pipes: false });
  L.wallZ(148, 153.6, 180.45, YC - 0.3, YC + 4.2, 'sewer', 0.5);
  L.stairs(177.2, 153.1, 179.8, 161.1, YC, 0, '+z', 'concrete', { stepH: 0.2 });
  L.box(176.8, YC - 0.3, 153.6, 177.2, -0.5, 161.1, 'sewer');
  L.box(179.8, YC - 0.3, 153.6, 180.2, -0.5, 161.1, 'sewer');
  L.light(178.5, -1.2, 157, 0xb8c8e0, 8, 9, {});
  railing(L, 177.12, 157.5, 177.12, 161.1, 0, 1.0);
  railing(L, 179.88, 157.5, 179.88, 161.1, 0, 1.0);
  railing(L, 177.12, 157.42, 179.88, 157.42, 0, 1.0);
  L.reverb(172, YC, 148, 181, 0, 161.1, 'tunnel');
}

function plaza(L, game) {
  const X0 = 118, X1 = 182, Z0 = 147, Z1 = 205;
  floorWithHoles(L, X0, Z0, X1, 187, 0, 0.5, 'sidewalk', [[177.2, 157.5, 179.8, 161.1]]);
  L.floor(X0, 187, X1, 195, 0, 'asphalt', 0.5);
  L.floor(X0, 195, X1, Z1, 0, 'sidewalk', 0.5);
  for (let x = 122; x < 180; x += 6) L.box(x, 0.003, 190.9, x + 3, 0.01, 191.1, 'paintedWhite', { collide: false });
  // boundaries
  facade(L, 50, 147, X0, Z1, 0, 8, { mat: 'brickDark', faces: ['n', 'e'], lit: 0.04 });
  facade(L, X1, 100, 205, 245, 0, 18, { mat: 'concreteDark', faces: ['w'], lit: 0.05 });
  facade(L, 150, 100, X1, 146, 0, 12, { mat: 'brick', faces: ['s'], lit: 0.04 });
  L.box(X0, 0, 146, X1, 3.4, 147, 'concrete', { tint: 0xb8b4a8 });
  C.razorWire(L, 150, 3.4, 146.5, 0, 64);
  for (let x = 120; x < 182; x += 4) L.box(x - 0.05, 3.4, 146.45, x + 0.05, 4.4, 146.55, 'metalDark', { collide: false });
  sign(L, 'QUARANTINE LINE\nAUTHORIZED MILITARY PERSONNEL ONLY', 150, 2.2, 147.02, Math.PI, 3.6, 0.9, { bg: '#d8c030', fg: '#101010', border: '#101010' });
  // triage tents
  C.tent(L, 140, 0, 166, Math.PI, 6, 4.5);
  C.tent(L, 158, 0, 166, Math.PI, 6, 4.5);
  C.tent(L, 128, 0, 178, -Math.PI / 2, 5, 4);
  for (const [x, z, b] of [[138, 165.6, true], [140, 165.6, false], [142, 165.4, true], [156.5, 165.6, true], [159.5, 165.8, false]]) C.cot(L, x, 0, z, 0, b);
  P.ivStand(L, 139, 0, 164.2);
  P.ivStand(L, 157.8, 0, 164.5);
  C.medCrate(L, 143.3, 0, 167.6, 0.2);
  C.medCrate(L, 160.3, 0, 167.4, -0.1);
  C.medCrate(L, 126.8, 0, 178.8, 0.3);
  for (const [x, t] of [[144.4, 'TRIAGE A'], [162.4, 'TRIAGE B']]) {
    L.box(x - 0.04, 0, 169.0, x + 0.04, 1.9, 169.08, 'metalDark');
    sign(L, t, x, 1.65, 169.1, Math.PI, 1.3, 0.4, { bg: '#e8e8e0', fg: '#8a1010' });
  }
  L.item('medkit', 142, 0.02, 164.5, { chance: 0.6 });
  L.item('pills', 157, 0.02, 164.4, { chance: 0.6 });
  L.item('tier2', 127.6, 0.02, 177.2, { chance: 0.7 });
  L.item('m60', 128.2, 0.02, 179.0, { chance: 0.12 });
  // body bag rows
  for (let i = 0; i < 7; i++) P.bodyBag(L, 146 + i * 0.9, 0.01, 158.5, (rng() - 0.5) * 0.2);
  for (let i = 0; i < 5; i++) P.bodyBag(L, 146.5 + i * 0.9, 0.01, 155.5, (rng() - 0.5) * 0.2);
  // checkpoint: sandbags + jerseys channel the approach to the ER
  P.sandbags(L, 150, 0, 181, 0, 6, 4);
  P.sandbags(L, 136, 0, 184, 0.1, 5, 4);
  P.sandbags(L, 168, 0, 176, Math.PI / 2, 4, 3);
  for (const [x, z, r] of [[160, 183.5, 0.1], [163, 184, -0.2], [144, 182.5, 0], [122, 184.5, 0.3], [171, 185, 0.4]]) C.jersey(L, x, 0, z, r, 2.2);
  supplies(L, 150, 0, 179.5, 0, ['ammo'], { w: 1.4 });
  L.item('throwable', 150.6, 0.79, 179.5, { chance: 0.7 });
  sign(L, 'EVACUATION CHECKPOINT\nHAVE ID READY', 150, 1.9, 181.26, Math.PI, 2.4, 0.8, { bg: '#e8e8e0', fg: '#1a1a1a', border: '#8a1010' });
  // vehicles
  C.ambulance(L, 125, 0, 190.5, Math.PI / 2 + 0.1, { doorsOpen: true, lit: true });
  C.ambulance(L, 140.5, 0, 191, -Math.PI / 2 + 0.25);
  C.ambulance(L, 170, 0, 189.5, 2.6, { burnt: true });
  fireSource(L, 170, 1.4, 189.5, 1.0, { hazard: false });
  P.truck(L, 173, 0, 170, 0.12, 0x3a4a2a);
  P.car(L, 131, 0, 153, 0.9, { burnt: true });
  fireSource(L, 131, 0.9, 153, 0.8, { hazard: false });
  hittable(L, 'car', 152, 0, 191, 0.3, { color: 0x4a4a48 });
  P.car(L, 165, 0, 199, Math.PI / 2 - 0.2, { police: true });
  // floodlights
  C.floodlight(L, 136, 0, 172, Math.PI + 0.4, { intensity: 30 });
  C.floodlight(L, 170, 0, 158, Math.PI / 2 + 0.6, { flicker: 0.3, intensity: 28 });
  C.floodlight(L, 124, 0, 158, -0.5, { on: false });
  C.floodlight(L, 176, 0, 196, -Math.PI / 2 - 0.3, { intensity: 26 });
  burningBarrel(L, 147.5, 0, 186);
  burningBarrel(L, 120.5, 0, 166);
  P.barricade(L, 132, 0, 186.6, 0.1);
  P.barricade(L, 176, 0, 181, 1.4);
  C.stretcherPile(L, 133, 0, 170, 0.4);
  P.wheelchair(L, 135.5, 0, 194.5, 1.1);
  P.gurney(L, 138, 0, 194.8, 0.3, true);
  for (let i = 0; i < 12; i++) L.decal(X0 + 3 + rng() * 58, 0.012, 150 + rng() * 45, 0, 1, 0, 0.9 + rng() * 1.5, DF.BLOOD1 + (i % 4));
  bodyWithBlood(L, 155, 0, 176, 0.9, 0x3a4a2a);
  bodyWithBlood(L, 133, 0, 188.5, 2.4, 0xd8dcd8);
  bodyWithBlood(L, 177, 0, 186, 1.2, 0x3a4a2a);
  P.papers(L, 150, 0.01, 172, 8, 20);
  // hatch leaves folded open beside the exit
  L.box(175.7, 0, 157.6, 177.0, 0.05, 161.0, 'metal', { collide: false, tint: 0x5a5e5a });
  L.box(180.0, 0, 157.6, 181.3, 0.05, 161.0, 'metal', { collide: false, tint: 0x5a5e5a });
  sign(L, 'STORM DRAIN 12', 178.5, 1.1, 157.3, 0, 1.2, 0.25, { bg: '#d8b020', fg: '#101010' });
  L.reverb(X0, 0, Z0, X1, 30, Z1, 'outdoor');
  L.ambience(X0, -0.5, Z0, X1, 40, Z1, 'city');
}

function hospital(L, game) {
  const y = SW;
  // building masses around the ER wing
  facade(L, 146, 205, 182, 240, 0, 48, { mat: 'concrete', faces: ['n'], lit: 0.1, skipBelow: 3.8 });
  facade(L, 110, 205, 118, 240, 0, 30, { mat: 'concrete', faces: [], lit: 0 });
  facade(L, 118, 220, 146, 240, 0, 30, { mat: 'concrete', faces: [], lit: 0 });
  facade(L, 118, 205, 146, 220, 4.5, 30, { mat: 'concrete', faces: ['n'], lit: 0.08, skipBelow: 6 });
  // ER annex shell (x 118..146, z 196..210)
  L.box(118, -0.3, 196, 146, y, 210, 'linoleum');
  L.box(118.3, 4.35, 196.3, 145.7, 4.5, 210, 'ceiling');
  L.box(118.3, 4.5, 196.3, 145.7, 4.8, 205, 'roof');
  L.wallX(118, 146, 196.15, y, 5.3, 'plasterHosp', 0.3, [{ a: 129, b: 133, y0: y, y1: 3.0 }, { a: 120, b: 127.5, y0: 1.1, y1: 2.8 }, { a: 135, b: 144.5, y0: 1.1, y1: 2.8 }], { tint: 0xd8d8d0 });
  L.box(120, 1.1, 196.13, 127.5, 2.8, 196.17, 'glassDirty', { flags: GLASS });
  new WindowPane(L, 135, 1.1, 196.13, 144.5, 2.8, 196.17, { dirty: true });
  L.box(118, y, 196.3, 118.3, 5.3, 205, 'plasterHosp', { tint: 0xd8d8d0 });
  L.box(118, y, 205, 118.3, 4.5, 210, 'plasterHosp', { tint: 0xd8d8d0 });
  L.box(145.7, y, 196.3, 146, 5.3, 205, 'plasterHosp', { tint: 0xd8d8d0 });
  L.box(145.7, y, 205, 146, 4.5, 210, 'plasterHosp', { tint: 0xd8d8d0 });
  L.wallX(118.3, 145.7, 209.85, y, 4.35, 'plasterHosp', 0.3, [doorOp(137, 1.1, y)]);
  // sliding doors (open, glass shattered) + canopy
  L.box(127.4, y, 196.32, 129, 2.9, 196.36, 'glassDirty', { collide: false });
  L.box(133, y, 196.32, 134.6, 2.9, 196.36, 'glassDirty', { collide: false });
  L.box(128.95, 2.95, 196.0, 133.05, 3.1, 196.3, 'metalClean', { collide: false });
  for (let k = 0; k < 6; k++) L.decal(129.5 + rng() * 3, y + 0.012, 196.8 + rng() * 1.5, 0, 1, 0, 0.5, DF.CRACK, { alpha: 0.6 });
  L.box(120, 4.2, 188, 146, 4.5, 196, 'concrete', { tint: 0xc8c8c0 });
  for (const x of [121, 145]) L.box(x - 0.2, 0, 188.4, x + 0.2, 4.2, 188.8, 'concrete', { tint: 0xc8c8c0 });
  for (const x of [125, 131, 137, 143]) L.box(x - 0.5, 4.17, 191.5, x + 0.5, 4.2, 192.5, 'emissiveCool', { collide: false });
  L.light(131, 3.9, 192, 0xdcecff, 16, 13, { flicker: 0.25 });
  L.light(141, 3.9, 192, 0xdcecff, 12, 11, { flicker: 0.7 });
  sign(L, 'EMERGENCY', 131, 3.75, 195.98, 0, 5.2, 0.9, { bg: '#b81810', fg: '#ffffff', glow: 1.6, lightColor: 0xff3020, lightIntensity: 6 });
  sign(L, 'AMBULANCE ENTRANCE ONLY', 140, 3.3, 195.98, 0, 3.2, 0.35, { bg: '#e8e8e0', fg: '#8a1010' });
  // main entrance on the tower (closed, barricaded)
  L.box(158, y, 204.95, 170, 3.2, 205, 'glassDirty', { collide: false, tint: 0x101418 });
  sign(L, 'MAIN ENTRANCE CLOSED\nUSE EMERGENCY ENTRANCE', 164, 2.0, 204.93, 0, 3.8, 0.8, { bg: '#e8e8e0', fg: '#8a1010', border: '#8a1010' });
  for (const x of [160, 164, 168]) P.barricade(L, x, 0, 204.2, 0);
  // Mercy Hospital landmark signs
  landmarkSign(L, 'MERCY HOSPITAL', 164, 42, 204.85, Math.PI, 26, 4.2, { fg: '#ff3a2a', font: 'Arial Black, Impact, sans-serif', w: 1024, h: 164, bright: 1.8 });
  sign(L, 'MERCY HOSPITAL', 132, 4.78, 195.97, 0, 7, 0.8, { fg: '#e8f0f0', glow: 1.2, light: false });
  landmarkSign(L, '+', 148.8, 42, 204.85, Math.PI, 4.2, 4.2, { fg: '#ff3a2a', w: 256, h: 256, bright: 2 });
  // lobby interior
  L.box(118.3, y, 196.3, 118.32, y + 1.2, 209.7, 'tileWhite', { collide: false });
  L.box(145.68, y, 196.3, 145.7, y + 1.2, 209.7, 'tileWhite', { collide: false });
  P.receptionDesk(L, 138.5, y, 200.5, 0, 4.2);
  P.officeChair(L, 138, y, 201.4, 0.4);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) if (!(r === 1 && i === 3)) P.chair(L, 121.2 + i * 0.6, y, 200.4 + r * 1.6, Math.PI, 'plastic');
  P.vending(L, 144.9, y, 203.8, -Math.PI / 2, 0x2a5aa8);
  P.gurney(L, 125.5, y, 207.5, 1.4, true);
  P.gurney(L, 122, y, 208.3, 0.2, false);
  P.wheelchair(L, 128.5, y, 205.5, 2.2);
  P.ivStand(L, 126.5, y, 208.8);
  P.medCabinet(L, 118.55, y, 204.5, -Math.PI / 2);
  // barricaded doors deeper into the ER
  L.box(118.3, y, 206.5, 118.35, y + 2.2, 208.5, 'paintedWhite', { collide: false, tint: 0xb8c0c0 });
  L.box(143.5, y, 209.65, 145.5, y + 2.2, 209.7, 'paintedWhite', { collide: false, tint: 0xb8c0c0 });
  P.gurney(L, 144.5, y, 208.4, Math.PI / 2, false);
  sign(L, 'RADIOLOGY →\nELEVATORS →', 144.5, y + 2.6, 209.68, 0, 1.6, 0.6, { bg: '#2a5a7a', fg: '#ffffff' });
  sign(L, 'EMERGENCY\nWAITING', 124, y + 3.4, 209.68, 0, 2.0, 0.7, { bg: '#2a5a7a', fg: '#ffffff' });
  sign(L, 'SECURITY', 137, y + 3.05, 209.68, 0, 1.3, 0.3, { bg: '#1a1a1a', fg: '#ffd040' });
  sign(L, 'TRIAGE\nSEE NURSE', 138.5, y + 1.6, 200.13, 0, 1.2, 0.4, { bg: '#e8e8e0', fg: '#1a3a8a' });
  ceilingLight(L, 124, 4.35, 200.5, { type: 'fluoro', intensity: 10, flicker: 0.5 });
  ceilingLight(L, 138, 4.35, 200.5, { type: 'fluoro', intensity: 10, flicker: 0.1 });
  ceilingLight(L, 131, 4.35, 206.5, { type: 'fluoro', intensity: 9, flicker: 0.8 });
  L.light(144, 3.8, 208.5, 0xff2010, 4, 7, { flicker: 0.9 });
  bodyWithBlood(L, 130.5, y, 202.5, 1.8, 0xd8dcd8);
  bloodTrail(L, 131, 197, 135.5, 208.9, y, 8);
  L.item('pills', 139.5, y + 1.16, 200.4, { chance: 0.6 });
  L.reverb(118.3, y, 196.3, 145.7, 4.35, 210, 'room');
  L.ambience(118.3, y, 196.3, 145.7, 4.35, 210, 'hospital');
  // ---- security office: end safe room
  const S = { x0: 132, z0: 210, x1: 142, z1: 217, h: 3.4 };
  L.box(S.x0, -0.3, S.z0, S.x1, y, S.z1, 'linoleumBlue');
  L.box(S.x0 + 0.2, y + S.h, S.z0, S.x1 - 0.2, y + S.h + 0.3, S.z1 - 0.2, 'ceiling');
  L.wallX(S.x0, S.x1, S.z1 - 0.1, y, y + S.h + 0.3, 'plasterHosp', 0.2, [], { tint: 0xc8d0cc });
  L.wallZ(S.z0, S.z1 - 0.2, S.x0 + 0.1, y, y + S.h + 0.3, 'plasterHosp', 0.2, [], { tint: 0xc8d0cc });
  L.wallZ(S.z0, S.z1 - 0.2, S.x1 - 0.1, y, y + S.h + 0.3, 'plasterHosp', 0.2, [], { tint: 0xc8d0cc });
  L.box(S.x0 + 0.2, y, S.z1 - 0.22, S.x1 - 0.2, y + 1.1, S.z1 - 0.2, 'tileGreen', { collide: false });
  L.box(S.x0 + 0.2, y, S.z0, S.x0 + 0.22, y + 1.1, S.z1 - 0.22, 'tileGreen', { collide: false });
  L.box(S.x1 - 0.22, y, S.z0, S.x1 - 0.2, y + 1.1, S.z1 - 0.22, 'tileGreen', { collide: false });
  const endDoor = new Door(L, 137, y, 209.85, 'x', { width: 1.1, safe: true, hinge: 1 });
  L.endSafe = [S.x0 + 0.2, y - 0.2, S.z0, S.x1 - 0.2, y + S.h, S.z1 - 0.2];
  L.endDoor = endDoor;
  sign(L, 'SAFE ROOM', 137, y + 2.62, 209.68, 0, 1.3, 0.35, { bg: '#8a1a14', fg: '#fff' });
  C.cctvDesk(L, 134.2, y, 216.2, Math.PI);
  P.officeChair(L, 134.2, y, 215.2, 0.3);
  C.locker(L, 141.5, y, 214.3, -Math.PI / 2, 4);
  P.gurney(L, 139.6, y, 215.9, Math.PI / 2, true);
  P.medCabinet(L, 132.45, y, 212.5, Math.PI / 2);
  supplies(L, 133.5, y, 211.2, 0, ['medkit', 'medkit', 'medkit', 'medkit'], { w: 2.0 });
  supplies(L, 140.3, y, 211.2, 0, ['tier2', 'tier1', 'ammo'], { w: 1.8 });
  L.item('pills', 136.4, y + 0.02, 216.4, { chance: 0.6 });
  L.item('pipebomb', 141.4, y + 0.02, 216.4, { chance: 0.4 });
  ceilingLight(L, 137, y + S.h, 213.5, { type: 'cage', intensity: 9, range: 9, color: 0xffe2b0 });
  const gmsg = [['THE ROOF\nHAS A HELIPAD', '#b8201a', S.x0 + 0.22, 1.5, 214, Math.PI / 2], ['ELEVATORS\nSTILL WORK', '#1a2a8a', S.x1 - 0.22, 1.7, 212.4, -Math.PI / 2], ['WE WAITED\n3 DAYS', '#202020', 137.6, 1.8, S.z1 - 0.22, Math.PI], ['DON\'T WAKE\nTHE NURSE', '#3a6a2a', 140.3, 1.3, S.z1 - 0.22, Math.PI]];
  for (const [t, c, x, yy, z, ry] of gmsg) graffiti(L, t, x, y + yy, z, ry, 1.8, 0.75, c);
  L.ambience(S.x0, y, S.z0, S.x1, y + S.h, S.z1, 'safe');
  L.reverb(S.x0, y, S.z0, S.x1, y + S.h, S.z1, 'safe');
  L.flowEnd = [137, y, 214];
}

// ================================================================ CHAPTER ==
export default {
  id: 'sewer',
  title: 'The Sewer',
  def: {
    director: {
      wanderers: 24, mobInterval: [70, 120], mobSize: [12, 20], tank: 0.35, witches: 1.3, relax: [30, 50], outfit: 'civilian', maxSpecials: 2,
      noSpawnBoxes: [[110.1, -1, 95.1, 111.3, 12, 107.2]],
    },
    navCell: 0.5,
  },
  build(L, game) {
    WATER.length = 0;
    L.env = Object.assign(L.env, {
      fog: 0x0b0d12, fogDensity: 0.013, hemiSky: 0x3a4660, hemiGround: 0x1a1612, hemiIntensity: 0.42, envIntensity: 0.1,
      moon: { dir: [0.35, 1, -0.45], intensity: 0.5, color: 0x8a9ac0 }, exposure: 1.1, reverb: 'outdoor', ambience: 'city',
      skyOpts: { hospitalAz: 0.33, hospitalH: 250, moonAz: 0.15, fires: 8, rotation: 0 },
    });
    L.menuCam = { x: 72, y: 3, z: 50, yaw: -2.6, pitch: 0.05 };
    pawnShop(L, game);
    kesslerAve(L, game);
    cornerMart(L, game);
    burgerBarn(L, game);
    const lot = freightLot(L, game);
    containerStack(L);
    chuteTower(L);
    warehouse(L, game);
    sewer(L, game);
    plaza(L, game);
    hospital(L, game);
    // backdrop skyline
    facade(L, -60, -60, 130, -14, 0, 26, { mat: 'concreteDark', faces: ['s'], lit: 0.05 });
    facade(L, -70, -14, -46, 150, 0, 28, { mat: 'brickDark', faces: ['e'], lit: 0.05 });
    facade(L, 150, -40, 200, 100, 0, 30, { mat: 'concrete', faces: ['w'], lit: 0.05 });
    facade(L, -20, 146, 50, 240, 0, 22, { mat: 'brickDark', faces: ['e', 'n'], lit: 0.04 });
    L.killZone(-200, -60, -200, 400, -25, 400);

    // water for footsteps
    L.waterY = YW;
    L.inWater = (p) => p.y < YW + 0.05 && WATER.some((w) => p.x >= w[0] && p.x <= w[2] && p.z >= w[1] && p.z <= w[3]);

    // ------------------------------------------------ lift crescendo
    const lift = buildLift(L, game, {
      x0: 106, z0: 92.2, x1: 109.6, z1: 95.9, deckTop: 0.4, rise: ROOF - 0.4, duration: 50,
      callBox: [110.8, 1.3, 91.2],
      interval: 11,
      waveSets: [
        [[56, 0, 50], [74, 0, 50], [90, 0, 52], [44, 0, 62]], // street side (behind the burger barn)
        [[66, WF, 93], [72, 0, 88], [118, 0, 60], [121, 0, 88]], // dock + east lot
        [[92, ROOF, 112], [100, ROOF, 128], [80, ROOF, 104], [104, ROOF, 104]], // rooftop
        [[28, 0, 90], [24, 0, 55], [40, 0, 90], [120, 0, 75]], // west alley / kiosk + east
        [[56, 0, 50], [30, 0, 88], [118, 0, 62], [88, ROOF, 122]], // everything
      ],
      sizes: [[9, 12], [10, 14], [10, 13], [12, 16], [14, 18]],
      tankChance: 0.3, tankWave: 3,
      onProgress: (k) => {
        if (k > 0.35 && !lift.v1) { lift.v1 = true; game.voice.script([{ who: 'francis', text: 'This thing moves like my grandma!', d: 0 }]); }
        if (k > 0.72 && !lift.v2) { lift.v2 = true; game.voice.script([{ who: 'zoey', text: 'Almost there! Hang on!', d: 0 }]); }
      },
      onArrive: () => {
        game.session.objective('Find a way into the warehouse');
        game.voice.script([{ who: 'bill', text: 'We\'re up! Get off this thing!', d: 0.3 }]);
        game.infected.outfit = 'worker';
        L.after(9, () => {
          heli.fly([{ x: 260, y: 70, z: 40, t: 0 }, { x: 120, y: 40, z: 110, t: 7 }, { x: 150, y: 55, z: 190, t: 12 }, { x: 170, y: 80, z: 260, t: 18 }, { x: 150, y: 120, z: 420, t: 28 }], { hideAtEnd: true });
          heli.setSearchlight(true);
          game.voice.script([{ who: 'zoey', text: 'Chopper! It\'s heading for the hospital!', d: 2 }, { who: 'louis', text: 'Then that\'s where we\'re going.', d: 4.5 }]);
        });
      },
    });
    P.prop(L, 110.8, 0, 91.2, 0).box(0, 0.6, 0, 0.1, 1.2, 0.1, 'metalDark').box(0, 1.3, 0, 0.32, 0.42, 0.22, 'paintedYellow', 0xd8a020).box(0, 1.36, -0.115, 0.1, 0.1, 0.02, 'emissiveGreen').col(0, 0.7, 0, 0.3, 1.4, 0.3, 'metal');
    sign(L, 'LIFT CALL', 110.8, 1.62, 91.08, 0, 0.36, 0.1, { bg: '#101010', fg: '#d8a020' });
    const heli = new Helicopter(game, { color: 0x3a4a3a, stripe: 0x2a2e2a });
    L.dynamics.push(heli);

    // ------------------------------------------------ story triggers
    const say = (lines) => game.voice.script(lines);
    L.trigger(34, -1, 11, 70, 4, 27, () => {
      game.session.objective('Cut through the Burger Barn');
      say([{ who: 'louis', text: 'Street\'s blocked by the army. Through the burger place!', d: 0.2 }, { who: 'francis', text: 'Hope they left some fries.', d: 3 }]);
    });
    L.trigger(44, -1, 47, 70, 4, 56, () => {
      game.session.objective('Head for the warehouse across the lot');
      game.infected.outfit = 'worker';
      say([{ who: 'francis', text: 'Gas station. Anybody feel like barbecue?', d: 0.5 }, { who: 'zoey', text: 'Just don\'t shoot the pumps while we\'re standing next to them.', d: 3 }]);
    });
    L.trigger(95, -1, 78, 118, 4, 92, () => {
      game.session.objective('Use the scissor lift to reach the warehouse roof');
      say('ch3Lift');
    });
    L.trigger(90, ROOF - 0.5, 110, 110, ROOF + 3, 136, () => {
      say([{ who: 'bill', text: 'See that glow? Mercy Hospital. Just past the quarantine wall.', d: 0.5 }, { who: 'francis', text: 'And a whole lot of dead people in between.', d: 4 }]);
    });
    L.trigger(52, ROOF - 0.5, 110, 66, ROOF + 3, 124, () => {
      say([{ who: 'zoey', text: 'Skylight\'s busted. We can drop in here!', d: 0 }]);
    });
    L.trigger(50.5, MZ_Y - 0.5, 108, 64, MZ_Y + 3, 136, () => game.session.objective('Find the way down into the sewer'));
    L.trigger(96, WF - 0.5, 122, 106, WF + 3, 132, () => {
      game.session.objective('Follow the sewer to Mercy Hospital');
      say([{ who: 'louis', text: 'Storm drain! Straight down into the sewer.', d: 0 }]);
    });
    L.trigger(90, YC - 1, 120, 106, -1.5, 136, () => {
      say([{ who: 'zoey', text: 'Ugh. It\'s up to my knees.', d: 0.8 }, { who: 'francis', text: 'Add wet socks to the list.', d: 3 }]);
    });
    L.trigger(128, YC - 1, 155, 150, YD + 3, 161, () => say([{ who: 'bill', text: 'Keep your lights on and your mouths shut.', d: 0 }]));
    // escalation toward the hospital: the plaza fills up while they're in the last tunnels
    L.trigger(170, YC - 1, 147, 181, YD + 3, 154, () => {
      game.infected.outfit = 'hospital';
      say([{ who: 'louis', text: 'I can hear them up there. A lot of them.', d: 0 }]);
      const nav = game.level.nav;
      const pts = [];
      for (let i = 0; i < 26; i++) pts.push([122 + rng() * 56, 0, 150 + rng() * 44]);
      for (const [x, yy, z] of pts) {
        if (Math.hypot(x - 178.5, z - 161) < 12) continue;
        const n = nav.nearestNode(x, yy, z, 2);
        if (n < 0 || Math.abs(nav.nodeY[n]) > 0.5) continue;
        game.infected.spawnCommon(nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n), { outfit: rng() < 0.35 ? 'police' : 'hospital' });
      }
    });
    L.trigger(176.5, -2.5, 156, 180.5, 3, 163, () => {
      game.session.objective('Get inside Mercy Hospital');
      say('ch3Hospital');
      L.after(5, () => { game.director.spawnMob(18, { where: 'ahead', minD: 18, maxD: 50 }); });
      L.after(12, () => { game.director.spawnSpecial(Math.random() < 0.5 ? 'boomer' : 'hunter', { where: 'ahead' }); });
    });
    L.trigger(118.3, -1, 196.3, 145.7, 4, 209.7, (s) => {
      game.session.objective('Get to the security office safe room');
      game.voice.say(s, 'safeRoom', 2);
      L.after(4, () => game.director.spawnMob(12, { where: 'behind', minD: 14, maxD: 40 }));
    });
    L.trigger(132.2, -1, 210.2, 141.8, 4, 216.8, () => say('ch3Safe'));

    // ------------------------------------------------ zone lighting (moon/hemi/fog by area)
    const zones = {
      indoor: [[0, -1, 0, 12, 4, 9], [26, -1, 27, 36, 4, 37], [44, -1, 27, 66, 4.6, 47], [36, -1, 58, 50, 3.5, 71], [50.4, WF - 0.5, 96.4, 110, ROOF - 0.3, 136], [118.3, -1, 196.3, 146, 4.4, 217]],
    };
    const env = L.env;
    const base = { moon: env.moon.intensity, hemi: env.hemiIntensity, fog: env.fogDensity, sky: new THREE.Color(env.hemiSky), ground: new THREE.Color(env.hemiGround), fogCol: new THREE.Color(env.fog) };
    const sewerCol = { sky: new THREE.Color(0x3a4a40), ground: new THREE.Color(0x0e100c), fog: new THREE.Color(0x0a0d0b) };
    const cur = { moon: base.moon, hemi: base.hemi, fog: base.fog, k: 0 };
    const tmpC = new THREE.Color();
    L.script = {
      start() {
        L.after(1, () => game.session.objective('Get to Mercy Hospital'));
      },
      update(dt) {
        const p = game.player?.pos;
        if (!p) return;
        let tm = base.moon, th = base.hemi, tf = base.fog, tk = 0;
        if (p.y < -1.3) { tm = 0; th = 0.26; tf = 0.03; tk = 1; }
        else if (zones.indoor.some((b) => p.x > b[0] && p.x < b[3] && p.z > b[2] && p.z < b[5] && p.y > b[1] && p.y < b[4])) { tm = 0.06; th = 0.3; tf = 0.018; }
        cur.moon = damp(cur.moon, tm, 3, dt);
        cur.hemi = damp(cur.hemi, th, 3, dt);
        cur.fog = damp(cur.fog, tf, 3, dt);
        cur.k = damp(cur.k, tk, 3, dt);
        if (game.moon) game.moon.intensity = cur.moon;
        if (game.hemi) {
          game.hemi.intensity = cur.hemi;
          game.hemi.color.copy(base.sky).lerp(sewerCol.sky, cur.k);
          game.hemi.groundColor.copy(base.ground).lerp(sewerCol.ground, cur.k);
        }
        if (game.scene?.fog) {
          game.scene.fog.density = cur.fog;
          tmpC.copy(base.fogCol).lerp(sewerCol.fog, cur.k);
          game.scene.fog.color.copy(tmpC);
          if (game.scene.background?.isColor) game.scene.background.copy(tmpC);
        }
      },
    };
    L.lift = lift;
    L.gas = lot;
  },
  onStart(game, session) {
    game.voice.script('ch3Start');
  },
  onLeaveSafe(game, session) {
    game.infected.outfit = 'civilian';
  },
};
