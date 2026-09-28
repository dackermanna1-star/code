// Dead Air 5 — the apron arena (playable ground south of Concourse C).
// Service road along the terminal, a lighted taxi lane (z=24) curving south to
// stand 41 where Evac 41 waits, baggage trains and GSE, bomb craters, the
// burning regional jet (west), the overrun military checkpoint (z=34), the
// evacuation staging area (tents, supply tables, sandbagged minigun nests, the
// fuel tanker under the right wing), high-mast lights, T-wall perimeter
// (infected climb over from the outside strips), Hangar 3 (east, spawn) and
// the GSE shed. Beyond the walls: grass, taxiway, the runway and the city.
import * as THREE from 'three';
import { sign, graffiti, stencil, poster, posterWall, wallMessages, supplies, P } from './kit.js';
import { F_SOLID, F_SHOOT, F_SIGHT, F_NONAV } from '../world/collision.js';
import { DF } from '../render/decals.js';
import { VisualBatch } from './da_parts.js';
import { makeRng } from '../core/math.js';
import { tent, razorWire, medCrate, jersey, cot, container, forklift } from './ch3_props.js';
import { uld, beltLoader, body, strewLuggage, trail } from './da4_parts.js';
import { cables } from './clutter.js';
import { decalTexture, decalMesh } from './da5_fx.js';
import { APRON, TW, STRIP, HANGAR, PLANE, TANKER, CHECK_Z, RUNWAY, NEST_A, NEST_B, FAC_Z } from './da5_layout.js';

const rng = makeRng(5207);
const NC = { collide: false };
export const rot = (x, z, ry, lx, lz) => { const c = Math.cos(ry), s = Math.sin(ry); return [x + c * lx + s * lz, z - s * lx + c * lz]; };
export const LANE_Z = 24;           // taxi lane centreline
export const GATE7 = { x0: 48, x1: 68 }; // south airside gate (the escape route)
export const CRATERS = [[7, 30.5, 4.2], [-31, 28, 5.2], [75, 13.5, 3.6], [-50, 76, 4.4], [-8, 60, 3.4]];
export const REGIONAL = { x: -44, z: 50 };

// flat painted text lying on the ground
function groundText(L, text, x, z, ry, w, h, color = '#e8c030', y = 0.028) {
  const tex = decalTexture(512, Math.round(512 * h / w), (c, W, H) => {
    c.fillStyle = color; c.font = `bold ${Math.round(H * 0.78)}px Arial Narrow, Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.globalAlpha = 0.82; c.fillText(text, W / 2, H * 0.54);
    // wear
    c.globalCompositeOperation = 'destination-out';
    let s = text.length * 7 + 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) { c.globalAlpha = 0.2 + r() * 0.5; c.fillRect(r() * W, r() * H, 2 + r() * 14, 1 + r() * 4); }
  });
  const m = decalMesh(tex, w, h);
  m.material.depthWrite = false;
  m.rotation.set(-Math.PI / 2, 0, ry, 'YXZ');
  m.rotation.order = 'YXZ'; m.rotation.y = ry; m.rotation.x = -Math.PI / 2; m.rotation.z = 0;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  L.addObject(m);
  return m;
}

// split an axis-aligned strip [a0,a1] at coordinate c around craters
function spansAvoiding(a0, a1, fixed, axis, pad = 0.6) {
  let segs = [[a0, a1]];
  for (const [cx, cz, r] of CRATERS) {
    const R = r * 1.15 + pad;
    const d = axis === 'x' ? Math.abs(fixed - cz) : Math.abs(fixed - cx);
    if (d > R) continue;
    const c = axis === 'x' ? cx : cz, hw = Math.sqrt(R * R - d * d);
    const out = [];
    for (const [s, e] of segs) {
      if (e <= c - hw || s >= c + hw) { out.push([s, e]); continue; }
      if (s < c - hw) out.push([s, c - hw]);
      if (e > c + hw) out.push([c + hw, e]);
    }
    segs = out;
  }
  return segs;
}

export function buildApron(L, game, S) {
  const B = new VisualBatch(L);
  const flames = S.flames;
  S.fires = [];      // smoke emitters [x, y, z, size]
  // ================================================================ ground
  // service road (asphalt, under the facade thresholds) + apron slabs
  L.floor(APRON.x0, FAC_Z - 0.3, APRON.x1, 8, 0, 'asphalt', 0.5);
  L.floor(APRON.x0, 8, APRON.x1, APRON.z1, 0, 'concreteFloor', 0.5, { tint: 0xa4a097 });
  // expansion joints (tar) every 7.5 m, avoiding craters
  for (let x = APRON.x0 + 7.5; x < APRON.x1; x += 7.5) for (const [a, b] of spansAvoiding(8, APRON.z1, x, 'z')) B.box(x - 0.05, 0, a, x + 0.05, 0.012, b, 'rubber', { tint: 0x1c1b1a });
  for (let z = 8 + 7.5; z < APRON.z1; z += 7.5) for (const [a, b] of spansAvoiding(APRON.x0, APRON.x1, z, 'x')) B.box(a, 0, z - 0.05, b, 0.012, z + 0.05, 'rubber', { tint: 0x1c1b1a });
  B.box(APRON.x0, 0, 7.92, APRON.x1, 0.012, 8.08, 'rubber', { tint: 0x141414 });
  // service road markings: dashed centre, yellow edge, crossings under the jet bridges
  for (let x = APRON.x0 + 1; x < APRON.x1 - 2; x += 6) B.box(x, 0, 1.9, x + 3, 0.02, 2.05, 'paintedWhite', { tint: 0xc8c8c0 });
  for (const zz of [-2.6, 6.9]) B.box(APRON.x0, 0, zz, APRON.x1, 0.02, zz + 0.14, 'paintedYellow', { tint: 0xc8a020 });
  for (const x of [-24.3, 26, 48, -62]) for (let k = 0; k < 7; k++) B.box(x - 3 + k * 0.9, 0, -2.2, x - 2.55 + k * 0.9, 0.022, 6.6, 'paintedWhite', { tint: 0xb8b8b0 });
  groundText(L, 'GSE ROAD', -6, 4.6, 0, 5, 1.1, '#e8e8e0');
  groundText(L, 'GSE ROAD', 40, 4.6, 0, 5, 1.1, '#e8e8e0');
  groundText(L, 'STOP', -18.5, -0.8, Math.PI / 2, 2.4, 0.9, '#e8e8e0');

  // ================================================================ taxi lane + stand 41 lead-in
  const laneX0 = -60, laneX1 = PLANE.x;
  const markY = 0.024;
  for (const [a, b] of spansAvoiding(laneX0, laneX1 - 10, LANE_Z, 'x', 0.2)) B.box(a, 0, LANE_Z - 0.1, b, markY, LANE_Z + 0.1, 'paintedYellow', { tint: 0xd8b020 });
  for (const s of [-1, 1]) for (const [a, b] of spansAvoiding(laneX0, laneX1 - 20, LANE_Z + s * 7.5, 'x', 0.2)) {
    B.box(a, 0, LANE_Z + s * 7.5 - 0.06, b, markY, LANE_Z + s * 7.5 + 0.06, 'paintedYellow', { tint: 0xb89018 });
    B.box(a, 0, LANE_Z + s * 7.9 - 0.06, b, markY, LANE_Z + s * 7.9 + 0.06, 'paintedYellow', { tint: 0xb89018 });
  }
  // curve south onto the stand (quarter circle radius 10) then straight to the stop bar
  const cR = 10, ccx = laneX1 - cR, ccz = LANE_Z + cR;
  const curve = [];
  for (let k = 0; k <= 14; k++) { const a = -Math.PI / 2 + (k / 14) * Math.PI / 2; curve.push([ccx + Math.cos(a) * cR, ccz + Math.sin(a) * cR]); }
  for (let k = 0; k < curve.length - 1; k++) {
    const [ax, az] = curve[k], [bx, bz] = curve[k + 1];
    const m = new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, markY / 2, (az + bz) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.atan2(bz - az, bx - ax), 0)), new THREE.Vector3(Math.hypot(bx - ax, bz - az) + 0.05, markY, 0.2));
    L.mesh(new THREE.BoxGeometry(1, 1, 1), 'paintedYellow', m, { collide: false, tint: 0xd8b020 });
  }
  B.box(PLANE.x - 0.1, 0, LANE_Z + cR, PLANE.x + 0.1, markY, 50.5, 'paintedYellow', { tint: 0xd8b020 });
  B.box(PLANE.x - 3, 0, 50.5, PLANE.x + 3, markY, 50.8, 'paintedYellow', { tint: 0xd8b020 });
  groundText(L, '41', PLANE.x, 47.5, Math.PI, 2.4, 1.8, '#e8c030');
  groundText(L, 'EVAC 41', PLANE.x + 3.8, 43.5, Math.PI / 2, 4, 1.1, '#e8c030');
  groundText(L, 'TWY C', -30, LANE_Z - 2.6, 0, 3.2, 1.2, '#e8c030');
  groundText(L, 'TWY C', 20, LANE_Z - 2.6, 0, 3.2, 1.2, '#e8c030');
  // stand safety box (red) + wingtip clearance lines
  for (const [x0, z0, x1, z1] of [[34, 45, 82, 45.15], [34, 86.5, 82, 86.65], [34, 45, 34.15, 86.65], [81.85, 45, 82, 86.65]]) B.box(x0, 0, z0, x1, markY, z1, 'paintedRed', { tint: 0xa82018 });
  for (let x = 35; x < 81; x += 2.4) B.box(x, 0, 45.3, x + 1.2, markY, 45.5, 'paintedWhite', { tint: 0xc8c8c0 });
  groundText(L, 'NO PARKING — FUEL HYDRANT', 40.5, 58.2, 0, 7, 0.7, '#d8d8d0');
  // taxi-lane lights: green centreline studs + blue edge lights (a few real lights)
  const studs = [];
  for (let x = -54; x < laneX1 - cR - 1; x += 6) { const a = spansAvoiding(x - 0.3, x + 0.3, LANE_Z, 'x', 0.2); if (a.length && a[0][0] === x - 0.3) studs.push([x, LANE_Z]); }
  for (let k = 1; k < curve.length - 1; k += 3) studs.push(curve[k]);
  for (let z = LANE_Z + cR + 3; z < 50; z += 6) studs.push([PLANE.x, z]);
  for (const [x, z] of studs) {
    B.box(x - 0.16, 0, z - 0.16, x + 0.16, 0.035, z + 0.16, 'metalDark');
    const p = P.prop(L, x, 0, z, 0);
    p.glow(0, 0.045, 0, 0.18, 0.02, 0.1, 0x30ff70);
  }
  let li = 0;
  for (let x = -50; x < laneX1 - cR - 4; x += 12) for (const s of [-1, 1]) {
    const z = LANE_Z + s * 8.6;
    if (spansAvoiding(x - 0.2, x + 0.2, z, 'x', 0.3).length === 0) continue;
    P.runwayLight(L, x, 0, z, 0x2a50ff, { light: (li++ % 5) === 0, intensity: 3, range: 6 });
  }
  for (let z = LANE_Z + cR + 2; z < 52; z += 8) for (const s of [-1, 1]) P.runwayLight(L, PLANE.x + s * 9.5, 0, z, 0x2a50ff, { light: z < 40 && s > 0, intensity: 3, range: 6 });
  S.studs = studs;

  // ================================================================ perimeter T-walls + outside strips
  const tH = TW.h, tT = TW.t;
  const wallRun = (axis, a0, a1, fixed, inner) => {
    // collider (one box) + visual segments (1.5 m, stem + foot)
    if (axis === 'z') L.box(fixed - tT / 2, -0.5, a0, fixed + tT / 2, tH, a1, 'concrete', { visible: false });
    else L.box(a0, -0.5, fixed - tT / 2, a1, tH, fixed + tT / 2, 'concrete', { visible: false });
    for (let a = a0; a < a1 - 0.2; a += 1.52) {
      const b = Math.min(a1, a + 1.5), t = rng() < 0.2 ? 0x8e8a82 : 0xa8a49a;
      if (axis === 'z') {
        B.box(fixed - tT / 2, 0, a, fixed + tT / 2, 0.55, b, 'concreteDark', { tint: t });
        B.box(fixed - 0.14, 0.55, a + 0.02, fixed + 0.14, tH, b - 0.02, 'concreteDark', { tint: t });
        B.box(fixed - 0.2, 0.5, a + 0.02, fixed + 0.2, 0.62, b - 0.02, 'concreteDark', { tint: t });
      } else {
        B.box(a, 0, fixed - tT / 2, b, 0.55, fixed + tT / 2, 'concreteDark', { tint: t });
        B.box(a + 0.02, 0.55, fixed - 0.14, b - 0.02, tH, fixed + 0.14, 'concreteDark', { tint: t });
        B.box(a + 0.02, 0.5, fixed - 0.2, b - 0.02, 0.62, fixed + 0.2, 'concreteDark', { tint: t });
      }
      if (rng() < 0.12) { // painted segment number / hazard band
        const c = (a + b) / 2;
        if (axis === 'z') B.box(fixed + inner * 0.145, 1.9, c - 0.5, fixed + inner * 0.15, 2.05, c + 0.5, 'paintedYellow', { tint: 0xc8a020 });
        else B.box(c - 0.5, 1.9, fixed + inner * 0.145, c + 0.5, 2.05, fixed + inner * 0.15, 'paintedYellow', { tint: 0xc8a020 });
      }
    }
  };
  const WX = APRON.x0 - tT / 2, SZ = APRON.z1 + tT / 2;
  wallRun('z', FAC_Z, SZ + tT / 2, WX, 1);
  wallRun('x', WX - tT / 2, GATE7.x0, SZ, -1);
  wallRun('x', GATE7.x1, APRON.x1 + tT, SZ, -1);
  wallRun('z', HANGAR.z1, SZ - tT / 2, APRON.x1 + tT / 2, -1);
  // strips (infected spawn ground) + invisible outer bounds + a chain-link perimeter fence
  const sx0 = APRON.x0 - tT - STRIP, sz1 = APRON.z1 + tT + STRIP, sx1 = APRON.x1 + tT + STRIP;
  L.floor(sx0, FAC_Z - 0.3, APRON.x0 - tT, sz1, 0, 'dirt', 0.5, { tint: 0x6a6456 });
  L.floor(sx0, APRON.z1 + tT, sx1, sz1, 0, 'dirt', 0.5, { tint: 0x6a6456 });
  L.floor(APRON.x1 + tT, HANGAR.z1, sx1, APRON.z1 + tT, 0, 'dirt', 0.5, { tint: 0x6a6456 });
  L.clip(sx0 - 0.4, -0.5, FAC_Z - 1, sx0, 12, sz1 + 0.4);
  L.clip(sx0 - 0.4, -0.5, sz1, sx1 + 0.4, 12, sz1 + 0.4);
  L.clip(sx1, -0.5, HANGAR.z1, sx1 + 0.4, 12, sz1 + 0.4);
  P.fenceChain(L, sx0 - 0.2, FAC_Z, sx0 - 0.2, sz1 + 0.2, 0, 3.2);
  P.fenceChain(L, sx0 - 0.2, sz1 + 0.2, GATE7.x0 - 2, sz1 + 0.2, 0, 3.2);
  P.fenceChain(L, GATE7.x1 + 2, sz1 + 0.2, sx1 + 0.2, sz1 + 0.2, 0, 3.2);
  P.fenceChain(L, sx1 + 0.2, HANGAR.z1, sx1 + 0.2, sz1 + 0.2, 0, 3.2);
  for (let x = sx0 + 4; x < sx1 - 4; x += 9) if (x < GATE7.x0 - 3 || x > GATE7.x1 + 3) razorWire(L, x, 3.0, sz1 + 0.25, 0, 4.2);
  // strip dressing: weeds, junk, bodies (seen from the wall tops / gate)
  for (let i = 0; i < 16; i++) {
    const onW = i < 6, x = onW ? sx0 + 1 + rng() * 4 : sx0 + 8 + rng() * (sx1 - sx0 - 16), z = onW ? 4 + rng() * 80 : APRON.z1 + 1.5 + rng() * 4;
    if (i % 3 === 0) P.debris(L, x, 0, z, 0.9, 'concrete', 5);
    else if (i % 3 === 1) P.trashBags(L, x, 0, z, rng() * 6);
    else body(L, x, 0, z, rng() * 6, 0x4a4a42);
  }
  // south airside gate 7 (closed; slides open in the escape): colliders static, visual animated
  L.box(GATE7.x0, -0.5, SZ - 0.15, GATE7.x1, 3.2, SZ + 0.15, 'metal', { visible: false });
  const gateGrp = new THREE.Group();
  const gm = new THREE.MeshStandardMaterial({ color: 0x8a8e88, roughness: 0.6, metalness: 0.6 });
  const gy = new THREE.MeshStandardMaterial({ color: 0xc8a020, roughness: 0.6, metalness: 0.3 });
  const leaves = [];
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group();
    const w = (GATE7.x1 - GATE7.x0) / 2;
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; leaf.add(m); };
    for (const y of [0.25, 1.6, 2.95]) add(new THREE.BoxGeometry(w, 0.12, 0.12), gm, 0, y, 0);
    for (let k = 0; k <= 8; k++) add(new THREE.BoxGeometry(0.08, 2.9, 0.08), gm, -w / 2 + k * w / 8, 1.6, 0);
    for (let k = 0; k < 8; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(w / 8, 2.7), 0.05, 0.05), gm); m.position.set(-w / 2 + (k + 0.5) * w / 8, 1.6, 0); m.rotation.z = (k % 2 ? 1 : -1) * Math.atan2(2.7, w / 8); leaf.add(m); }
    add(new THREE.BoxGeometry(w, 0.3, 0.14), gy, 0, 2.2, 0.02);
    for (const wx of [-w / 2 + 0.4, w / 2 - 0.4]) add(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 10), gm, wx, 0.08, 0);
    leaf.position.set(side < 0 ? GATE7.x0 + w / 2 : GATE7.x1 - w / 2, 0, SZ);
    leaf.userData.x0 = leaf.position.x; leaf.userData.side = side;
    gateGrp.add(leaf); leaves.push(leaf);
  }
  gateGrp.userData.noCull = true;
  L.addObject(gateGrp);
  const gateSign = decalMesh(decalTexture(512, 160, (c, W, H) => { c.fillStyle = '#d8b020'; c.fillRect(0, 0, W, H); c.fillStyle = '#111'; c.font = 'bold 64px Arial Black, Impact, sans-serif'; c.textAlign = 'center'; c.fillText('AIRSIDE GATE 7', W / 2, 74); c.font = 'bold 34px Arial, sans-serif'; c.fillText('AUTHORIZED VEHICLES ONLY', W / 2, 128); }), 2.4, 0.75, { side: THREE.DoubleSide });
  gateSign.position.set(0, 2.2, -0.1);
  leaves[0].add(gateSign);
  for (const x of [GATE7.x0 - 0.3, GATE7.x1 + 0.3]) L.box(x - 0.3, 0, SZ - 0.3, x + 0.3, 3.6, SZ + 0.3, 'paintedYellow', { tint: 0xb89018 });
  S.gate = { leaves, k: 0, open: false, update(dt) { if (!this.open || this.k >= 1) return; this.k = Math.min(1, this.k + dt * 0.18); for (const lf of leaves) lf.position.x = lf.userData.x0 + lf.userData.side * this.k * 10.5; } };
  L.dynamics.push(S.gate);

  // ================================================================ wall art on the T-walls
  const wIn = WX + tT / 2 + 0.16;
  graffiti(L, 'THEY CAME\nOVER THE WALL', wIn, 1.5, 44, Math.PI / 2, 2.4, 0.9, '#c02018');
  stencil(L, 'EVAC 41  →', wIn, 1.3, 20, Math.PI / 2, 1.8, 0.4, '#d8d8c8');
  graffiti(L, 'RIP 118th', wIn, 1.6, 66, Math.PI / 2, 1.4, 0.6, '#e8e0d0', { style: 'tag' });
  const sIn = SZ - tT / 2 - 0.16;
  graffiti(L, 'PLANE TAKES\nFOUR', -24, 1.5, sIn, 0, 2.2, 0.9, '#e0a010');
  stencil(L, 'NO ENTRY  —  JET BLAST', 10, 1.3, sIn, 0, 3.2, 0.35, '#d8d8c8');
  graffiti(L, 'FLIGHT 212\nWAS SICK', 30, 1.55, sIn, 0, 2.0, 0.85, '#8a1a14');
  stencil(L, 'CEDA', 78, 1.6, sIn, 0, 1.2, 0.5, '#d8d8c8');
  wallMessages(L, -60, 1.5, sIn, 0, 1.6, 1.1, { lines: ['WAITED 3 DAYS\nNO PLANE', 'DAN & KIM\nWENT SOUTH'], seed: 5 });
  poster(L, 'quarantine', -8, 1.5, sIn, 0, 0.8, 1.0, { torn: 0.3 });
  poster(L, 'evac', 86, 1.5, sIn, 0, 0.5, 0.72, { torn: 0.4, wet: 0.4 });

  // ================================================================ craters
  for (const [x, z, r] of CRATERS) crater(L, B, x, z, r);

  // ================================================================ high-mast apron lights
  for (const [x, z, on] of [[-40, 14.5, true], [2, 14.5, false], [36, 14.5, true], [-55, 40, false], [-20, 88 - 2.4, true], [88, 32, true], [88, 84, false], [28, 86, true]]) highMast(L, B, x, z, on);

  // ================================================================ GSE: baggage trains, loaders, ULDs, tugs
  baggageTrain(L, -52, 11.5, 0, 4, false);
  baggageTrain(L, -8, 12, 0.05, 3, false);
  baggageTrain(L, 30, 11, Math.PI, 4, false);
  // the burning, jack-knifed train by crater 1
  const bt = [15, 22];
  P.baggageTug(L, bt[0], 0, bt[1], 2.3, 0x2a2a28);
  P.baggageCart(L, bt[0] - 3.2, 0, bt[1] - 1.8, 1.4, { loaded: false, color: 0x2a2622 });
  P.baggageCart(L, bt[0] - 5.2, 0, bt[1] + 1.2, 0.5, { loaded: false, color: 0x2a2622 });
  strewLuggage(L, bt[0] - 9, bt[1] - 3, bt[0] + 1, bt[1] + 4, 0, 14);
  fire(L, S, bt[0] - 3.2, 0.5, bt[1] - 1.8, 2.2, 3.2, { light: 16, hazard: true });
  fire(L, S, bt[0] - 5, 0.05, bt[1] + 1.8, 2.8, 1.6, { light: 0 });
  L.decal(bt[0] - 3.5, 0.03, bt[1], 0, 1, 0, 7, DF.SCORCH);
  beltLoader(L, -34, 0, 16.5, Math.PI / 2);
  beltLoader(L, 55, 0, 12, -Math.PI / 2, 0xc89018);
  for (const [x, z, ry] of [[-45, 16.8, 0.1], [-42.8, 16.9, -0.05], [-20, 17.5, 0.3], [62, 16, 0.2], [64.3, 16.2, 0], [80, 10.5, 1.2]]) uld(L, x, 0, z, ry);
  P.baggageTug(L, 70, 0, 18, -0.9);
  P.aircraftStairs(L, 84, 0, 16, Math.PI / 2, 3.5, { walkable: false });
  forklift(L, -60, 0, 18, 0.6);
  P.car(L, 44, 0, 17.5, 1.9, { color: 0xd8b020, damaged: true, lights: false });
  P.van(L, -26, 0, 3.8, Math.PI / 2, 0xd8d4c8);
  P.truck(L, 70, 0, 3.6, -Math.PI / 2, 0xc8c4b8);
  P.car(L, 12, 0, 1.2, Math.PI / 2 + 0.2, { burnt: true });
  fire(L, S, 12, 0.9, 1.2, 1.6, 2.2, { light: 10 });
  for (let i = 0; i < 9; i++) P.trafficCone(L, -64 + rng() * 150, 0, 8.5 + rng() * 12);

  // ================================================================ the burning regional jet (west)
  regionalJet(L, B, S);

  // ================================================================ checkpoint line (z=34)
  checkpoint(L, B, S);

  // ================================================================ evac staging area
  staging(L, B, S);

  // ================================================================ hangar 3 + GSE shed
  hangar(L, B, S);
  gseShed(L, B);

  // ================================================================ blood, bodies, trails on the route
  for (const [x, z, ry, c] of [[-6, 19, 0.4, 0x3a4a3a], [3, 17.2, 2.2, 0x6a5a4a], [-15, 28, 1.3, 0x2a2a2a], [26, 27, 4.1, 0x5a3a2a], [44, 29.5, 0.2, 0x4a5236], [-36, 44, 2.9, 0x8a8a7a]]) body(L, x, 0, z, ry, c);
  trail(L, -10, 19.5, -2, 25, 0, 8);
  trail(L, 30, 26.5, 38, 31, 0, 7);
  for (let i = 0; i < 24; i++) L.decal(-60 + rng() * 145, 0.02, 10 + rng() * 75, 0, 1, 0, 0.8 + rng() * 1.4, DF.BLOOD1 + (i % 4));
  for (let i = 0; i < 14; i++) L.decal(-65 + rng() * 150, 0.018, 9 + rng() * 78, 0, 1, 0, 3 + rng() * 4, DF.SCORCH);

  // ================================================================ beyond the walls (visual)
  backdrop(L, B, S);
  B.build(L);
  L.reverb(APRON.x0 - 8, -1, FAC_Z, HANGAR.x0, 30, APRON.z1 + 8, 'outdoor');
  L.ambience(APRON.x0 - 8, -1, FAC_Z, HANGAR.x0, 30, APRON.z1 + 8, 'city');
  // smoke from the apron fires (near the camera only)
  const g = game;
  L.dynamics.push({ t: 0, update(dt) { this.t -= dt; if (this.t > 0) return; this.t = 0.18; const cp = g.camPos; for (const f of S.fires) { const d2 = (cp.x - f[0]) ** 2 + (cp.z - f[2]) ** 2; if (d2 < 90 * 90 && Math.random() < 0.55) g.fx.smokeColumn(f[0] + (Math.random() - 0.5) * f[3], f[1] + f[3] * 0.8, f[2] + (Math.random() - 0.5) * f[3], f[3] * 0.6, [0.07, 0.065, 0.06]); } } });
  return S;
}

// ------------------------------------------------------------------ helpers
function fire(L, S, x, y, z, w, h, o = {}) {
  S.flames.add(x, y, z, w, h, { intensity: o.k ?? 1, flicker: 0.22 });
  if (o.light) L.light(x, y + h * 0.5, z, 0xff7a30, o.light, 8 + w * 3, { flicker: 0.5 });
  if (o.hazard) L.hazard(x - w * 0.4, y - 0.5, z - w * 0.4, x + w * 0.4, y + h * 0.6, z + w * 0.4, 'fire', 18);
  S.fires.push([x, y, z, w]);
}

function crater(L, B, x, z, r) {
  // raised, shattered rim around a scorched dish (no nav change: survivors walk over it)
  const prof = [[r * 1.35, 0.0], [r * 1.05, 0.14], [r * 0.9, 0.34], [r * 0.78, 0.3], [r * 0.6, 0.12], [r * 0.3, 0.04], [0.01, 0.03]];
  const pts = prof.map(([a, b]) => new THREE.Vector2(a, b)).reverse();
  const geo = new THREE.LatheGeometry(pts, 28);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const px = pos.getX(i), pz = pos.getZ(i), rr = Math.hypot(px, pz); if (rr > 0.3) pos.setY(i, pos.getY(i) * (0.7 + 0.6 * Math.abs(Math.sin(px * 1.7 + pz * 2.3)))); }
  geo.computeVertexNormals();
  L.mesh(geo, 'dirt', new THREE.Matrix4().makeTranslation(x, 0.005, z), { collide: false, tint: 0x3a3430 });
  // broken slabs tilted up around the rim
  const n = Math.round(r * 3.2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.3, rr = r * (0.92 + rng() * 0.18);
    const sx = 0.7 + rng() * 1.3, sz = 0.5 + rng() * 0.9;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x + Math.cos(a) * rr, 0.14, z + Math.sin(a) * rr), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25 + rng() * 0.45, -a + Math.PI / 2, (rng() - 0.5) * 0.4, 'YXZ')), new THREE.Vector3(sx, 0.22, sz));
    L.mesh(new THREE.BoxGeometry(1, 1, 1), 'concreteFloor', m, { collide: false, tint: 0x9a968e });
    if (rng() < 0.35) P.pipe(L, x + Math.cos(a) * rr, 0.2, z + Math.sin(a) * rr, x + Math.cos(a) * (rr + 0.5), 0.6 + rng() * 0.3, z + Math.sin(a) * (rr + 0.4), 0.012, 'rust');
  }
  L.decal(x, 0.012, z, 0, 1, 0, r * 3.4, DF.SCORCH);
  L.decal(x + r * 0.2, 0.04, z - r * 0.1, 0, 1, 0, r * 1.4, DF.CRACK);
  P.debris(L, x + r * 1.4, 0, z + r * 0.3, 1.1, 'concrete', 6);
}

function highMast(L, B, x, z, on) {
  const H = 22;
  B.box(x - 0.6, 0, z - 0.6, x + 0.6, 0.4, z + 0.6, 'concrete', { tint: 0x9a968e });
  L.box(x - 0.22, 0, z - 0.22, x + 0.22, H, z + 0.22, 'metal', { tint: 0x8a8e90 });
  B.box(x - 1.6, H, z - 0.9, x + 1.6, H + 0.25, z + 0.9, 'metalDark');
  const p = P.prop(L, x, H, z, 0);
  for (let i = 0; i < 6; i++) {
    const lx = -1.3 + (i % 3) * 1.3, lz = i < 3 ? -0.7 : 0.7;
    p.box(lx, 0.45, lz, 0.9, 0.5, 0.5, 'metalDark', 0x2a2c2e, [i < 3 ? 0.5 : -0.5, 0, 0]);
    p.glow(lx, 0.32, lz + (i < 3 ? -0.14 : 0.14), 0.75, 0.05, 0.36, on ? 0xfff0c8 : 0x2a2a28);
  }
  if (on) {
    const l = L.light(x, H - 1, z, 0xffe8c0, 55, 42, { flicker: 0.02 });
    P.lightCone(L, x, H - 0.2, z, [0, -1, 0], H - 1, 9, 0xffe8c0, l, 0.35);
  }
}

function baggageTrain(L, x, z, ry, n, loaded = true) {
  P.baggageTug(L, x, 0, z, ry + Math.PI / 2);
  for (let i = 0; i < n; i++) {
    const [cx, cz] = rot(x, z, ry, 3.2 + i * 3.8, (rng() - 0.5) * 0.3);
    P.baggageCart(L, cx, 0, cz, ry + Math.PI / 2 + (rng() - 0.5) * 0.12, { loaded: rng() < 0.7 });
  }
}

function regionalJet(L, B, S) {
  const { x, z } = REGIONAL;
  // broken fuselage (burnt), separated nose, wing on the ground, tail fin
  P.airlinerSection(L, x, 0, z, 0.65, { len: 16, burnt: true, broken: true, wing: true, ground: true });
  P.airlinerSection(L, x + 10.5, 0, z + 12.5, 0.95, { len: 5, burnt: true, broken: true, ground: true });
  const fin = P.prop(L, x - 7, 0, z - 9, 0.4);
  fin.box(0, 2.6, 0, 0.3, 5.2, 3.6, 'rust', 0x2a2622, [0, 0, 0.35]);
  fin.box(0.9, 0.45, 0.2, 2.6, 0.9, 3.8, 'rust', 0x221e1c, [0, 0, 0.3]);
  fin.col(0, 1.2, 0, 1.2, 2.4, 3.6, 'metal', F_SOLID | F_SHOOT | F_SIGHT);
  const eng = P.prop(L, x + 7, 0, z - 6, 1.2);
  eng.cylZ(0, 0.95, 0, 0.95, 3.2, 'rust', 0x1e1c1a, 16);
  eng.cylZ(0, 0.95, -1.62, 0.7, 0.06, 'blackMatte', 0x080808, 16);
  eng.col(0, 0.95, 0, 1.9, 1.9, 3.2, 'metal');
  for (let i = 0; i < 10; i++) P.debris(L, x - 12 + rng() * 26, 0, z - 10 + rng() * 22, 0.6 + rng() * 0.8, 'metal', 5);
  strewLuggage(L, x - 8, z + 4, x + 8, z + 14, 0, 18);
  for (const [dx, dz, w, h, k] of [[-3, 1.5, 3.4, 5.5, 1.1], [2.5, -2.5, 2.6, 4.2, 1], [-6.5, 4, 2.2, 3, 0.9], [9.5, 11, 2.6, 4, 1], [5, 7, 4, 1.5, 0.8], [-1, 8, 5, 1.2, 0.8], [-9, -2, 3, 1.4, 0.7]]) fire(L, S, x + dx, dz === 1.5 ? 1.2 : 0.05, z + dz, w, h, { k, hazard: true });
  L.light(x, 3.5, z + 2, 0xff7028, 30, 28, { flicker: 0.5, priority: 1 });
  L.light(x + 8, 2.5, z + 10, 0xff6a20, 16, 16, { flicker: 0.5 });
  for (let i = 0; i < 5; i++) L.decal(x - 8 + rng() * 18, 0.02, z - 6 + rng() * 18, 0, 1, 0, 5 + rng() * 4, DF.SCORCH);
  L.witchSpots.push({ x: x + 6, y: 0, z: z - 1.5 });
}

function checkpoint(L, B, S) {
  const z = CHECK_Z;
  // jersey barrier line with gaps: pedestrian gap x 20.5-23.5 (nest A), vehicle gate x 51-65 (taxi lane)
  const runs = [[-4, 20.5], [23.5, 51], [65, 91.5]];
  for (const [a, b] of runs) {
    for (let x = a + 1; x < b - 0.9; x += 2.05) {
      const knocked = rng() < 0.12;
      jersey(L, x, 0, z + (knocked ? (rng() - 0.5) * 1.6 : 0), knocked ? (rng() - 0.5) * 0.8 : 0, 2.0);
    }
  }
  // razor wire on top in stretches, sandbag posts at the gaps, booth, boom barrier
  for (let x = 26; x < 49; x += 4.3) razorWire(L, x, 0.85, z, 0, 4.2);
  for (let x = 67; x < 90; x += 4.3) razorWire(L, x, 0.85, z, 0, 4.2);
  P.sandbags(L, 19, 0, z + 1.4, Math.PI / 2, 2.4, 3);
  P.sandbags(L, 25, 0, z + 1.4, Math.PI / 2, 2.4, 3);
  P.sandbags(L, -5.5, 0, z + 0.8, 0.4, 3.0, 4);
  // guard booth at the vehicle gate (west side)
  const bx = 49, bz = z + 2.6;
  const hut = P.prop(L, bx, 0, bz, 0);
  hut.box(0, 0.05, 0, 2.3, 0.1, 2.3, 'concrete', 0x8a867e);
  for (const [sx, sz, w, d] of [[-1.1, 0, 0.1, 2.3], [1.1, 0, 0.1, 2.3], [0, 1.1, 2.3, 0.1]]) { hut.box(sx, 0.55, sz, w, 1.0, d, 'paintedWhite', 0xc8c8c0); hut.box(sx, 2.45, sz, w, 0.3, d, 'paintedWhite', 0xc8c8c0); }
  hut.box(0.55, 1.3, -1.1, 1.2, 2.6, 0.1, 'paintedWhite', 0xc8c8c0);
  for (const [sx, sz, w, d] of [[-1.1, 0, 0.04, 2.1], [1.1, 0, 0.04, 2.1], [0, 1.1, 2.1, 0.04]]) hut.box(sx, 1.6, sz, w, 1.3, d, 'glassDirty', 0x2a3238);
  hut.box(0, 2.66, 0, 2.6, 0.12, 2.6, 'metalDark');
  hut.box(0, 0.95, 0.85, 1.8, 0.06, 0.45, 'woodDark');
  hut.glow(0, 2.55, 0, 0.5, 0.04, 0.3, 0x3a3a30);
  hut.col(0, 1.3, 0, 2.3, 2.6, 2.3, 'metal');
  sign(L, 'MILITARY CHECKPOINT\nEVAC PERSONNEL ONLY', bx, 2.95, bz - 1.2, 0, 2.4, 0.55, { bg: '#e8e4d8', fg: '#8a1a14' });
  // boom barrier: post + raised, snapped arm
  const boom = P.prop(L, 51.4, 0, z + 0.2, 0);
  boom.box(0, 0.5, 0, 0.5, 1.0, 0.5, 'paintedWhite', 0xd8d8d0).box(0, 1.0, 0, 0.3, 0.3, 0.3, 'metalDark');
  for (let k = 0; k < 6; k++) boom.box(0.4 + k * 0.5 * Math.cos(1.1), 1.05 + k * 0.5 * Math.sin(1.1), 0, 0.5, 0.1, 0.1, k % 2 ? 'paintedRed' : 'paintedWhite', k % 2 ? 0xb01810 : 0xe8e8e0, [0, 0, 1.1]);
  boom.col(0, 0.6, 0, 0.5, 1.2, 0.5, 'metal');
  const arm = P.prop(L, 57, 0, z + 1.4, 0.4);
  for (let k = 0; k < 7; k++) arm.box(-1.5 + k * 0.5, 0.06, 0, 0.5, 0.1, 0.1, k % 2 ? 'paintedRed' : 'paintedWhite', k % 2 ? 0xb01810 : 0xe8e8e0);
  // overrun: a military truck rammed through the line, burnt
  P.truck(L, 34, 0, z - 2.6, 0.35, 0x3a4230);
  L.decal(34, 0.02, z - 2.6, 0, 1, 0, 6, DF.SCORCH);
  P.car(L, 74, 0, z + 3, 2.6, { color: 0x3a4230, damaged: true });
  // dead soldiers (the crewman with the radio is placed by the script file)
  for (const [x, zz, ry] of [[44, z - 1.4, 3.3], [60.5, z + 4.5, 5.2], [-3, z + 2.2, 0.8], [87, z + 2, 2.1]]) body(L, x, 0, zz, ry, 0x4a5236);
  for (let i = 0; i < 60; i++) L.decal(18 + rng() * 50, 0.019, z - 3 + rng() * 8, 0, 1, 0, 0.1, DF.BLOOD1);
  // signs, posters on barriers
  sign(L, 'STOP — SHOW PASS', 51, 1.4, z - 0.02, 0, 1.4, 0.5, { bg: '#b01810', fg: '#f0f0e8' });
  poster(L, 'quarantine', 30, 0.72, z - 0.15, 0, 0.55, 0.7, { torn: 0.3 });
  poster(L, 'evac', 12, 0.72, z - 0.15, 0, 0.45, 0.62, { torn: 0.5 });
  graffiti(L, 'THEY SHOT\nAT US', 6, 0.7, z - 0.16, 0, 1.4, 0.55, '#c01810');
  stencil(L, '118 AW', 70, 0.72, z - 0.16, 0, 0.9, 0.3, '#e8e8e0');
  wallMessages(L, bx - 1.16, 1.5, bz, -Math.PI / 2, 1.2, 0.7, { lines: ['SHIFT 3\nNEVER CAME', 'PILOT IS\nSCARED'], density: 0.6, seed: 8 });
}

function staging(L, B, S) {
  // --- nests (sandbag horseshoes; the guns are placed by the script file)
  for (const n of [NEST_A, NEST_B]) {
    const c = Math.cos(n.yaw), s = Math.sin(n.yaw);
    const w = (lx, lz) => [n.x + c * lx + s * lz, n.z - s * lx + c * lz];
    const [fx, fz] = w(0, -1.6); P.sandbags(L, fx, 0, fz, n.yaw, 3.0, 3);
    for (const sd of [-1, 1]) { const [px, pz] = w(sd * 1.8, -0.2); P.sandbags(L, px, 0, pz, n.yaw + Math.PI / 2, 2.2, 3); }
    const [ax, az] = w(1.4, 1.6); P.crate(L, ax, 0, az, n.yaw, 0.6, 'metalDark');
    const [mx, mz] = w(-1.2, 1.4); L.item('ammo', mx, 0.02, mz, {});
  }
  // --- tents: command (radio), medical (red cross), ammo
  tent(L, 12, 0, 46, 0, 6, 4.5, { cross: false });
  P.radioTable(L, 12, 0, 47.4, Math.PI);
  P.table(L, 10, 0, 45.6, 0, 1.6, 0.8, 'woodDark');
  P.metalShelf(L, 14.3, 0, 47.6, Math.PI, 1.4, 1.8, 0.6);
  sign(L, 'EVAC CONTROL', 12, 2.55, 43.72, 0, 1.6, 0.35, { bg: '#2a3222', fg: '#e8e0c0' });
  L.light(12, 2.3, 46, 0xffe0b0, 7, 8, { flicker: 0.08 });
  tent(L, 32, 0, 50, 0, 6, 5, { cross: true });
  for (const [dx, ry] of [[-1.6, 0], [0.2, 0], [2.0, 0]]) cot(L, 32 + dx, 0, 51, ry, dx < 0);
  supplies(L, 32, 0, 48.3, 0, ['medkit', 'medkit', 'medkit', 'pills'], { w: 2.0 });
  medCrate(L, 34.4, 0, 52.2, 0.3); medCrate(L, 29.8, 0, 52.4, -0.2);
  L.light(32, 2.3, 50, 0xfff0e0, 8, 9, { flicker: 0.04 });
  for (let i = 0; i < 4; i++) P.bodyBag(L, 25.5, 0, 50 + i * 1.0, Math.PI / 2);
  tent(L, 70, 0, 46, 0, 6, 4.5, { cross: false });
  supplies(L, 70, 0, 45.6, 0, ['rifle', 'autoShotgun', { type: 'scar', chance: 0.7 }, 'huntingRifle'], { w: 2.4 });
  supplies(L, 70, 0, 47.2, 0, ['molotov', 'pipebomb', 'pipebomb', 'bile'], { w: 2.0 });
  L.item('ammo', 72.3, 0.02, 47.5, {});
  for (let i = 0; i < 4; i++) P.crate(L, 67.4, 0, 45 + i * 0.75, 0, 0.7, 'wood');
  sign(L, 'ARMORY', 70, 2.55, 43.72, 0, 1.2, 0.35, { bg: '#2a3222', fg: '#e8e0c0' });
  L.light(70, 2.3, 46, 0xffe0b0, 7, 8, { flicker: 0.05 });
  // --- supply tables near the tanker + forward
  supplies(L, 46, 0, 56.5, Math.PI / 2, ['medkit', { type: 'tier2', chance: 0.8 }, 'molotov'], { w: 1.8 });
  L.item('ammo', 46.2, 0.02, 59, {});
  supplies(L, 20, 0, 58, 0, ['pills', 'adrenaline', 'pipebomb'], { w: 1.6 });
  // propane / gas cans for traps
  P.propaneTank(L, 16, 0, 62, 0.3, 2.4);
  P.gasCan(L, 18.2, 0, 60.5, 0.4); P.gasCan(L, 18.6, 0, 60.9, 1.9);
  // --- generator + floodlight towers (the staging area is lit)
  P.generator(L, 22, 0, 52, 0.2);
  for (const [x, z, ry] of [[28, 39.5, Math.PI + 0.4], [66, 40, Math.PI - 0.3], [48, 84, 0.2], [86, 70, -Math.PI / 2 - 0.3], [6, 70, Math.PI / 2 + 0.5]]) P.floodLight(L, x, 0, z, ry, { h: 5, intensity: 28, range: 30, beamLen: 14 });
  cables(L, [22.2, 0.5, 52.2], [28, 0.4, 39.6], 0.05, 0.02);
  // --- containers + pallets of relief supplies (cover)
  container(L, 2, 0, 52, 8, 2.6, 54.4, 0x7a2a1a);
  container(L, 76, 0, 76, 78.4, 2.6, 82, 0x2a4a7a);
  for (const [x, z] of [[8, 58], [9.6, 58.2], [60, 80], [62, 81]]) P.pallet(L, x, 0, z, rng() * 0.4, true);
  sign(L, 'NEWBURG ANG  ·  118th AIRLIFT WING', 5, 2.05, 51.95, 0, 4.2, 0.45, { bg: '#e8e4d8', fg: '#2a3222' });
  poster(L, 'evac', 7.95, 1.4, 53.2, Math.PI / 2, 0.5, 0.72, {});
  graffiti(L, 'WAIT FOR\nTHE PILOT', 77.2, 1.5, 81.98, 0, 1.6, 0.7, '#e8d8c0');
  // --- an ambulance and a dead tug by the tents; bodies of the evac staff
  P.ambulance(L, 77.5, 0, 39.5, 0.15, { lights: true });
  for (const [x, z, ry] of [[36, 55, 2.1], [63, 50, 5.3], [18, 44, 1.8]]) body(L, x, 0, z, ry, 0x5a6a5a);
}

function hangar(L, B, S) {
  const { x0, x1, z0, z1, door: [d0, d1], h } = HANGAR;
  const dH = 8.5;
  // shell
  L.floor(x0, z0, x1, z1, 0, 'concreteFloor', 0.5, { tint: 0x8a867e });
  L.wallZ(z0, z1, x0 + 0.2, 0, h, 'metal', 0.4, [{ a: d0, b: d1, y0: 0, y1: dH }], { tint: 0x6a7278 });
  L.wallX(x0, x1, z0 + 0.2, 0, h, 'metal', 0.4, [], { tint: 0x6a7278 });
  L.wallX(x0, x1, z1 - 0.2, 0, h, 'metal', 0.4, [], { tint: 0x6a7278 });
  L.wallZ(z0, z1, x1 - 0.2, 0, h, 'metal', 0.4, [], { tint: 0x5a6268 });
  L.ceiling(x0, z0, x1, z1, h, 'metalDark', 0.4);
  // corrugation ribs on the facade + the half-open door panels stacked either side
  for (let z = z0 + 0.6; z < z1; z += 0.9) { if (z > d0 - 3.2 && z < d1 + 3.2) continue; B.box(x0 - 0.06, 0, z, x0, h, z + 0.25, 'metal', { tint: 0x5e666c }); }
  L.box(x0 - 0.9, 0, d0 - 3.0, x0 - 0.1, h - 1, d0, 'metal', { tint: 0x7a8288 });
  L.box(x0 - 0.9, 0, d1, x0 - 0.1, h - 1, d1 + 3.0, 'metal', { tint: 0x7a8288 });
  L.box(x0 - 0.1, dH, d0, x0 + 0.4, h - 1, d1, 'metal', { tint: 0x7a8288 });
  for (let k = 0; k < 6; k++) B.box(x0 - 0.16, dH + 0.4 + k * 1.2, d0, x0 - 0.1, dH + 0.5 + k * 1.2, d1, 'metalDark');
  B.box(x0 - 1.2, h - 1, z0, x0 + 0.2, h + 0.6, z1, 'metalDark', { tint: 0x3a3e42 });
  sign(L, 'HANGAR 3', x0 - 1.22, h - 3, (d0 + d1) / 2, -Math.PI / 2, 12, 2.4, { fg: '#e8e8e0', font: 'bold 110px Arial Black, Impact, sans-serif' });
  sign(L, 'NEWBURG AIR NATIONAL GUARD · 118th AIRLIFT WING', x0 - 0.12, 11, 30, -Math.PI / 2, 14, 1.1, { bg: '#2a3222', fg: '#e8e0c0' });
  stencil(L, 'KEEP CLEAR OF DOOR', x0 - 0.12, 1.6, d0 - 4.5, -Math.PI / 2, 2.6, 0.4, '#d8b020');
  graffiti(L, 'DONT GO\nIN THERE', x0 - 0.12, 2.2, 66, -Math.PI / 2, 2.4, 1.0, '#c02018');
  posterWall(L, x0 - 0.12, 1.5, 26, -Math.PI / 2, 2.4, 1.6, { kinds: ['evac', 'quarantine', 'flyer', 'missing'] });
  // door threshold hazard stripes
  for (let z = d0; z < d1; z += 0.9) B.box(x0 - 0.8, 0, z, x0 + 0.3, 0.02, z + 0.45, 'paintedYellow', { tint: 0xc8a020 });
  // interior: a stripped transport on jacks, work stands, carts, crates (dark; red emergency lights)
  P.airlinerSection(L, 116, 0, 50, Math.PI / 2, { len: 14, color: 0x8a9088, stripe: 0x3a4230, wing: true });
  P.scaffolding(L, 110, 0, 42, 0, 6, 2, { walkable: true });
  for (let i = 0; i < 3; i++) uld(L, 100 + i * 2.4, 0, 24.5, 0.1 * i);
  P.baggageTug(L, 104, 0, 72, 0.4);
  for (let i = 0; i < 5; i++) P.crate(L, 126 + (i % 2) * 1.3, 0, 26 + i * 1.3, 0, 1.0, 'wood');
  for (let i = 0; i < 4; i++) P.metalShelf(L, 131.5, 0, 60 + i * 2.2, -Math.PI / 2, 2.0, 2.6, 0.8);
  const je = P.prop(L, 100, 0, 34, 0.3);
  je.box(0, 0.4, 0, 1.4, 0.3, 3.2, 'paintedYellow', 0xc8a020).cylZ(0, 1.35, 0, 0.8, 3.0, 'metalClean', 0x9a9e9e, 16).cylZ(0, 1.35, -1.52, 0.62, 0.05, 'blackMatte', 0x101010, 16).col(0, 1.0, 0, 1.6, 2.0, 3.2, 'metal');
  for (const [x, z, dx, dz] of [[x0 + 0.42, 30, 1, 0], [118, z0 + 0.42, 0, 1], [124, z1 - 0.42, 0, -1]]) {
    L.light(x + dx * 0.6, 7, z + dz * 0.6, 0xff2a18, 9, 18, { flicker: 0.2 });
    B.box(x - 0.2 + dx * 0.2, 7.4, z - 0.2 + dz * 0.2, x + 0.2 + dx * 0.2, 7.6, z + 0.2 + dz * 0.2, 'emissiveRed');
  }
  L.light(100, 12, 48, 0xffb070, 10, 22, { flicker: 0.8 });
  for (let i = 0; i < 8; i++) L.decal(96 + rng() * 34, 0.02, 24 + rng() * 52, 0, 1, 0, 1 + rng() * 2, DF.BLOOD1 + (i % 4));
  L.reverb(x0, 0, z0, x1, h, z1, 'hall');
  S.hangarBox = [104, 0, 24, 131, 0, 77];
}

function gseShed(L, B) {
  const x0 = APRON.x1, x1 = APRON.x1 + 14, z0 = FAC_Z - 0.3, z1 = HANGAR.z0;
  L.box(x0, 0, z0, x1, 7.5, z1, 'concreteDark', { tint: 0x8a867e });
  B.box(x0 - 0.1, 7.5, z0, x1, 8.0, z1, 'metalDark');
  for (const [a, b] of [[0, 5.5], [7.5, 13]]) {
    B.box(x0 - 0.06, 0, a, x0, 4.6, b, 'metal', { tint: 0x9aa0a4 });
    for (let k = 0; k < 26; k++) B.box(x0 - 0.1, 0.1 + k * 0.17, a, x0 - 0.06, 0.13 + k * 0.17, b, 'metalDark');
    B.box(x0 - 0.25, 0, a - 0.25, x0, 4.8, a, 'paintedYellow', { tint: 0xc8a020 });
    B.box(x0 - 0.25, 0, b, x0, 4.8, b + 0.25, 'paintedYellow', { tint: 0xc8a020 });
  }
  sign(L, 'GSE MAINTENANCE', x0 - 0.12, 5.8, 9.5, -Math.PI / 2, 5, 0.8, { bg: '#1a2230', fg: '#f0f0e8' });
  B.box(x0 - 0.3, 5.0, 16.5, x0, 5.2, 17.5, 'emissiveWarm');
  L.light(x0 - 1.2, 4.8, 17, 0xffc890, 8, 12, { flicker: 0.1 });
  graffiti(L, 'NO FUEL\nHERE', x0 - 0.12, 1.8, 16.5, -Math.PI / 2, 1.8, 0.8, '#e0e0d0');
}

function backdrop(L, B, S) {
  const y = -0.02;
  const sz1 = APRON.z1 + TW.t + STRIP;
  // grass + runway + connector taxiway to gate 7
  B.box(-900, -0.4, sz1, 1200, y, 900, 'dirt', { tint: 0x2c3222 });
  const rz0 = RUNWAY.z - 22, rz1 = RUNWAY.z + 22;
  B.box(-900, y, rz0, 1200, 0.0, rz1, 'asphalt', { tint: 0x4a4a48 });
  B.box(GATE7.x0 + 1, y, sz1, GATE7.x1 - 1, 0.0, rz0, 'asphalt', { tint: 0x4a4a48 });
  for (let x = -880; x < 1180; x += 60) B.box(x, 0, RUNWAY.z - 0.45, x + 30, 0.012, RUNWAY.z + 0.45, 'paintedWhite', { tint: 0xc8c8c0 });
  for (const zz of [rz0 + 1.5, rz1 - 1.5]) B.box(-900, 0, zz - 0.45, 1200, 0.012, zz + 0.45, 'paintedWhite', { tint: 0xb8b8b0 });
  B.box((GATE7.x0 + GATE7.x1) / 2 - 0.1, 0, sz1, (GATE7.x0 + GATE7.x1) / 2 + 0.1, 0.012, rz0 + 3, 'paintedYellow', { tint: 0xd8b020 });
  for (let i = 0; i < 8; i++) { const x = -40 - i * 3.4; B.box(x, 0, rz0 + 6, x + 1.8, 0.012, rz1 - 6, 'paintedWhite', { tint: 0xb0b0a8 }); }
  // runway designator + touchdown blocks (east threshold)
  for (let k = 0; k < 3; k++) for (const s of [-1, 1]) B.box(260 + k * 40, 0, RUNWAY.z + s * 9 - 2, 285 + k * 40, 0.012, RUNWAY.z + s * 9 + 2, 'paintedWhite', { tint: 0xb0b0a8 });
  // west / east / north ground
  B.box(-900, -0.4, -900, APRON.x0 - TW.t - STRIP - 0.4, y, sz1, 'concrete', { tint: 0x4a4a48 });
  B.box(HANGAR.x1, -0.4, -900, 1200, y, sz1, 'concrete', { tint: 0x4a4a48 });
  B.box(APRON.x0 - 20, -0.4, -900, HANGAR.x1, y, -34, 'asphalt', { tint: 0x3a3a3a });
  B.box(APRON.x1 + TW.t + STRIP + 0.4, -0.4, HANGAR.z1, HANGAR.x1, y, sz1, 'dirt', { tint: 0x3a3a30 });
  // taxiway edge lights (blue studs) along the connector, far apron clutter silhouettes
  for (let z = sz1 + 3; z < rz0; z += 5) for (const s of [-1, 1]) P.runwayLight(L, (GATE7.x0 + GATE7.x1) / 2 + s * 9, 0, z, 0x2a50ff);
  for (let x = -300; x < 500; x += 35) for (const zz of [rz0 - 1, rz1 + 1]) P.runwayLight(L, x, 0, zz, 0xfff0d0);
  // parked airliners (dark silhouettes) west of the concourse
  for (const [x, z, ry] of [[-130, 30, 0.2], [-175, 55, -0.1], [-230, 20, 0.3]]) P.airlinerSection(L, x, 0, z, ry, { len: 26, wing: true, color: 0x9a9ea2 });
  // fuel farm (east) + blast fence behind stand 41's neighbours
  for (let i = 0; i < 4; i++) { const x = 170 + i * 26; B.box(x, 0, 40, x + 18, 12, 58, 'metalClean', { tint: 0xb8b8b0 }); B.box(x + 0.5, 12, 40.5, x + 17.5, 12.6, 57.5, 'metal', { tint: 0x8a8e90 }); }
  for (let x = -60; x < -10; x += 2.2) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x + 1.05, 2.3, sz1 + 5), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0)), new THREE.Vector3(2.1, 4.8, 0.08));
    L.mesh(new THREE.BoxGeometry(1, 1, 1), 'metal', m, { collide: false, tint: 0x6a7076 });
  }
}
