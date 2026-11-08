// =============================================================================
// Port Solano landmarks: container terminal (reclaimed quay, stacks, ship-to-
// shore gantry cranes, RTGs, berthed and anchored ships, high-mast lights),
// marina (breakwater, pontoons, boats), pleasure pier with a Ferris wheel,
// beach kiosks, stadium. All merged into the region's building GeoBuilder.
// =============================================================================
import { ST, lin, scalec, clamp } from './util.js';
import { prism, roofPlant, lowCommercial } from './buildings.js';
import { pushHouse, pushTree } from './shapes.js';
import { LAMP } from './roads.js';

const CONCRETE_YARD = lin('#7d7a75');
const ASPHALT_YARD = lin('#2e2e30');

/** Container stacks as merged boxes: style CONTAINER with per-cell colours (seed > 500). */
function stack(B, x, z, y0, len, rows, tiers, rot, seed) {
  B.setStyle(ST.CONTAINER, 600 + seed, 2.59, 6.1).setColor([1, 1, 1]);
  B.box(x, z, y0, y0 + tiers * 2.59, len / 2, rows * 2.6 / 2, rot, { roofStyle: ST.CONTAINER, vBase: y0 });
}

function shipHull(B, lights, r, cx, cz, rot, L, beam, o = {}) {
  const hb = beam / 2;
  const fb = o.freeboard ?? 13;
  const bow = Math.min(45, L * 0.16);
  const hullPoly = [[-hb, L / 2 - bow], [-hb * 0.45, L / 2 - bow * 0.15], [0, L / 2], [hb * 0.45, L / 2 - bow * 0.15], [hb, L / 2 - bow], [hb, -L / 2 + 6], [hb * 0.8, -L / 2], [-hb * 0.8, -L / 2], [-hb, -L / 2 + 6]];
  B.setStyle(ST.PLAIN, r() * 100, 3, 3).setColor(lin('#7a2a22'));
  prism(B, cx, cz, rot, hullPoly, -6, 1.2, { roofStyle: null });
  B.setColor(o.hullCol || lin('#1d2a3a')).setStyle(ST.METAL, r() * 100, 3, 3);
  prism(B, cx, cz, rot, hullPoly, 1.2, fb, { roofStyle: ST.METAL, roofColor: lin('#5a4a3e') });
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (a, b) => [cx + a * c + b * s, cz - a * s + b * c];
  // accommodation block near the stern + funnel
  const [ax, az] = P(0, -L / 2 + 22);
  B.setColor(lin('#e9e7e1')).setStyle(ST.RESID, r() * 100, 2.8, 2.4);
  B.box(ax, az, fb, fb + 24, hb * 0.82, 9, rot, { roofStyle: ST.ROOF, roofColor: lin('#d8d6d0'), vBase: fb });
  B.box(ax, az, fb + 21, fb + 24, hb + 1.5, 5, rot, { roofStyle: ST.ROOF, roofColor: lin('#d8d6d0'), vBase: fb });   // bridge wings
  const [fx, fz] = P(0, -L / 2 + 8);
  B.setColor(o.funnel || lin('#b5402e')).setStyle(ST.METAL, 1, 3, 3);
  B.box(fx, fz, fb + 10, fb + 30, 3.5, 4, rot, { roofStyle: ST.PLAIN, roofColor: lin('#151515') });
  if (o.containers) {
    for (let b = 0; b < Math.floor((L - 80) / 14); b++) {
      const zz = -L / 2 + 40 + b * 14 + 7;
      if (zz > L / 2 - bow * 0.9) break;
      const [bx, bz] = P(0, zz);
      const tiers = 3 + Math.floor(r() * 5);
      B.setStyle(ST.CONTAINER, 600 + r() * 300, 2.59, 2.44).setColor([1, 1, 1]);
      B.box(bx, bz, fb, fb + tiers * 2.59, hb * 0.92, 6.1, rot, { roofStyle: ST.CONTAINER, vBase: fb });
    }
  } else if (o.tanker) {
    B.setColor(lin('#6e7a52')).setStyle(ST.METAL, 1, 3, 3);
    for (let b = 0; b < 4; b++) { const [bx, bz] = P(0, -L / 2 + 60 + b * (L - 110) / 4); B.box(bx, bz, fb, fb + 1.6, 1.2, (L - 110) / 8, rot, { roofStyle: ST.METAL }); }
  } else {
    // bulk carrier: hatch covers + deck cranes
    for (let b = 0; b < 6; b++) {
      const [bx, bz] = P(0, -L / 2 + 50 + b * (L - 100) / 6);
      B.setColor(lin('#8a3d2c')).setStyle(ST.METAL, 1, 3, 3);
      B.box(bx, bz, fb, fb + 2.2, hb * 0.6, (L - 100) / 14, rot, { roofStyle: ST.METAL });
      if (b % 2 === 0) { B.setColor(lin('#c9b23a')); B.cylinder(bx + hb * 0.75 * c, bz - hb * 0.75 * s, fb, fb + 18, 0.9, 0.6, 6); }
    }
  }
  if (lights) {
    const white = scalec(LAMP.led, 60);
    const [mx, mz] = P(0, L / 2 - 10);
    lights.add(mx, fb + 12, mz, white, 1.2, 0);
    lights.add(ax, fb + 30, az, white, 1.2, 0);
    for (let k = 0; k < 4; k++) { const [dx, dz] = P((k & 1 ? 1 : -1) * hb * 0.9, -L / 2 + 30 + k * (L - 60) / 4); lights.add(dx, fb + 3, dz, scalec(LAMP.sodium, 26), 1.0, 0); }
    const [px, pz] = P(-hb - 1, -L / 2 + 22), [sx2, sz2] = P(hb + 1, -L / 2 + 22);
    lights.add(px, fb + 23, pz, [80, 2, 1], 0.7, 0);
    lights.add(sx2, fb + 23, sz2, [2, 80, 10], 0.7, 0);
  }
}

/** Ship-to-shore gantry crane; boom along -x (over the water) in crane-local coords. */
function stsCrane(B, lights, r, x, z, y0, raised, color) {
  const legH = 46, span = 30, gauge = 18, outreach = 62, back = 22;
  const white = lin('#e8e6e0');
  B.setColor(color).setStyle(ST.METAL, r() * 100, 3, 3);
  const L = (dx, dz, h0, h1) => B.box(x + dx, z + dz, y0 + h0, y0 + h1, 0.9, 0.9, 0, { roofStyle: null });
  for (const dx of [0, span]) for (const dz of [-gauge / 2, gauge / 2]) L(dx, dz, 0, legH);
  // sill / portal beams
  for (const dx of [0, span]) B.box(x + dx, z, y0 + legH - 2.2, y0 + legH, 1.2, gauge / 2 + 1, 0, { roofStyle: ST.METAL });
  for (const dz of [-gauge / 2, gauge / 2]) B.box(x + span / 2, z + dz, y0 + legH - 2, y0 + legH, span / 2 + 1, 1.0, 0, { roofStyle: ST.METAL });
  for (const dz of [-gauge / 2, gauge / 2]) B.box(x + span / 2, z + dz, y0 + 10, y0 + 11.5, span / 2, 0.7, 0, { roofStyle: ST.METAL });
  // A-frame (apex above the waterside legs)
  const apex = [x + 4, y0 + legH + 28, z];
  B.setColor(white);
  for (const dz of [-gauge / 2, gauge / 2]) {
    B.beam([x, y0 + legH, z + dz], [apex[0], apex[1], z + dz * 0.4], 0.7);
    B.beam([x + span, y0 + legH, z + dz], [apex[0], apex[1], z + dz * 0.4], 0.7);
  }
  // boom (two girders) + trolley + forestays
  const by = y0 + legH + 4;
  const tip = raised ? [x - 6, by + outreach * 0.92, z] : [x - outreach, by, z];
  B.setColor(color);
  for (const dz of [-1.6, 1.6]) {
    B.beam([x + span + back, by, z + dz], [x, by, z + dz], 1.0);
    B.beam([x, by, z + dz], [tip[0], tip[1], tip[2] + dz], 0.9);
  }
  B.setColor(white);
  B.beam([apex[0], apex[1], z], [tip[0] + (raised ? 0 : outreach * 0.25), raised ? tip[1] : by, z], 0.35);
  B.beam([apex[0], apex[1], z], [x + span + back, by, z], 0.35);
  // machinery house on the backreach + operator cab
  B.setColor(lin('#d9d7d0')).setStyle(ST.INDUSTRIAL, r() * 100, 4, 3);
  B.box(x + span + back - 5, z, by + 1, by + 6, 6, 4, 0, { roofStyle: ST.METAL, roofColor: white });
  if (!raised) { B.setColor(lin('#2f3a44')); B.box(x - 18, z, by - 4, by - 1, 2, 1.8, 0, { roofStyle: ST.METAL }); }
  if (lights) {
    lights.add(apex[0], apex[1] + 1.2, apex[2], [160, 6, 3], 1.4, 2, 1.6, r());
    lights.add(tip[0], tip[1] + 1.2, tip[2], [70, 3, 2], 1.0, 2, 0, 0);
    for (let k = 0; k < 3; k++) lights.add(x - 10 - k * 16, by - 1.5, z, scalec(LAMP.led, 70), 1.4, 0);
    lights.add(x + span / 2, y0 + legH - 3, z, scalec(LAMP.led, 70), 1.4, 0);
  }
}

export function buildPort(B, inst, lights, land, r, o) {
  const { x0, x1, z0, z1, detail } = o;
  const top = 3.0;
  const zc = (z0 + z1) / 2, hzl = (z1 - z0) / 2;
  // reclaimed apron: concrete with darker asphalt stacking areas
  B.setStyle(ST.PLAIN, 11, 3, 3).setColor(CONCRETE_YARD);
  B.box((x0 + x1) / 2, zc, -5, top, (x1 - x0) / 2, hzl, 0, { roofStyle: ST.ROOF, roofColor: CONCRETE_YARD });
  // quay wall edge (darker, wet)
  B.setColor(lin('#3c3a37'));
  B.box(x0 + 0.6, zc, -5, top + 0.15, 0.6, hzl, 0, { roofStyle: ST.PLAIN });
  B.setColor(ASPHALT_YARD).setStyle(ST.ROOF, 12, 3, 3);
  const yardX0 = x0 + 95, yardX1 = x1 - 70;
  B.box((yardX0 + yardX1) / 2, zc, top - 0.2, top + 0.04, (yardX1 - yardX0) / 2, hzl - 30, 0, { roofStyle: ST.ROOF, walls: false });
  // container blocks (rows along z)
  const budgetRows = [260, 420, 560, 700][detail];
  const blockW = 6 * 2.6 + 10;          // 6 rows + RTG lane
  const blockL = 10 * 6.2 * 2;          // 20 TEU long
  let rows = 0;
  const RTGcol = lin('#d8b31c');
  for (let bx = yardX0 + 10; bx + blockW < yardX1; bx += blockW + 14) {
    for (let bz = z0 + 50; bz + blockL < z1 - 40; bz += blockL + 22) {
      if (rows > budgetRows) break;
      if (r() < 0.08) continue;
      // each block: 6 rows, each row split into 2-3 segments of different heights
      for (let row = 0; row < 6; row++) {
        const rx = bx + row * 2.6 + 1.3;
        let s = 0;
        while (s < blockL - 6) {
          const segL = Math.min(blockL - s, 6.2 * (2 + Math.floor(r() * 8)));
          const tiers = r() < 0.12 ? 0 : 1 + Math.floor(r() * 5);
          if (tiers > 0) stack(B, rx, bz + s + segL / 2, top, segL - 0.3, 1, tiers, Math.PI / 2, r() * 300);
          s += segL + 0.4;
        }
        rows++;
      }
      // rubber-tyred gantry over the block
      if (r() < 0.6) {
        const gz = bz + r() * blockL;
        B.setColor(RTGcol).setStyle(ST.METAL, 1, 3, 3);
        for (const dx of [-1.5, 6 * 2.6 + 1.5]) for (const dz of [-3.5, 3.5]) B.box(bx + dx, gz + dz, top, top + 18, 0.45, 0.45, 0, { roofStyle: null });
        B.box(bx + 7.8, gz - 3.5, top + 17, top + 19, 10, 0.6, 0, { roofStyle: ST.METAL });
        B.box(bx + 7.8, gz + 3.5, top + 17, top + 19, 10, 0.6, 0, { roofStyle: ST.METAL });
      }
    }
  }
  // berthed ships + STS cranes
  const ships = [
    { z: z0 + 260, L: 300, beam: 46, containers: true, hullCol: lin('#20324a') },
    { z: z0 + 640, L: 230, beam: 36, containers: true, hullCol: lin('#3a1f1b') },
    { z: z1 - 330, L: 335, beam: 48, containers: true, hullCol: lin('#24262a'), funnel: lin('#1f4f8a') },
  ];
  for (const s of ships) {
    if (s.z + s.L / 2 > z1 || s.z - s.L / 2 < z0) continue;
    shipHull(B, lights, r, x0 - s.beam / 2 - 4, s.z, Math.PI, s.L, s.beam, s);
  }
  const craneCols = [lin('#c23b22'), lin('#c23b22'), lin('#2a63a8')];
  let ci = 0;
  for (let z = z0 + 120; z < z1 - 80; z += 115 + r() * 40) {
    const nearShip = ships.some((s) => Math.abs(z - s.z) < s.L / 2 - 20);
    stsCrane(B, lights, r, x0 + 14, z, top, !nearShip && r() < 0.8, craneCols[Math.floor(ci / 3) % 3]);
    ci++;
  }
  // high-mast floodlights over the yard
  for (let x = yardX0 + 40; x < yardX1; x += 160) {
    for (let z = z0 + 80; z < z1; z += 170) {
      const y = top + 34;
      B.setColor(lin('#9a9c9e')).setStyle(ST.METAL, 1, 3, 3);
      B.cylinder(x, z, top, y, 0.7, 0.35, 6, { cap: false });
      lights.add(x, y + 0.5, z, scalec([1.0, 0.78, 0.5], 140), 2.6, 0);
    }
  }
  // gate complex, offices, warehouses (inland side)
  for (let z = z0 + 60; z < z1 - 60; z += 140 + r() * 60) {
    const hw = 25 + r() * 25, hd = 18 + r() * 30;
    lowCommercial(B, r, { x: x1 - 30, z, y0: top, hw: Math.min(hw, 28), hd, industrial: true });
  }
  B.setColor(lin('#e2ddd2')).setStyle(ST.RIBBON, 77, 3.8, 1.6);
  B.box(x1 - 40, z0 + 30, top, top + 15, 22, 10, 0, { roofStyle: ST.ROOF, roofColor: lin('#9a9893') });
  // anchored ships offshore (waiting for a berth)
  const anch = [[-1900, -2200, 250, 40, { tanker: true, hullCol: lin('#2c2e30') }], [-2600, -5600, 280, 44, { containers: true, hullCol: lin('#203040') }], [-3400, -3600, 220, 34, { hullCol: lin('#5a2420') }], [-1600, -9200, 180, 30, { tanker: true, hullCol: lin('#3b3d3f') }]];
  for (const [dx, z, L, beam, opt] of anch) shipHull(B, lights, r, x0 + dx, z, 0.4 + r() * 0.6, L, beam, opt);
  void inst; void land;
}

export function buildMarina(B, inst, lights, land, r, { z0, z1, shoreAt }) {
  // breakwater: rubble mound enclosing a basin west of the shore
  const sS = shoreAt(z0), sN = shoreAt(z1);
  const west = Math.min(sS, sN) - 360;
  const path = [[sS + 20, z0 + 40], [west, z0 + 40], [west - 30, (z0 + z1) / 2], [west, z1 + 120]];
  B.setStyle(ST.PLAIN, 91, 3, 3).setColor(lin('#77736b'));
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    const nx = -dz / L, nz = dx / L;
    const T = 5, Bw = 18;
    const q = (o1, y1, o2, y2) => B.quadOut([a[0] + nx * o1, y1, a[1] + nz * o1], [b[0] + nx * o1, y1, b[1] + nz * o1], [b[0] + nx * o2, y2, b[1] + nz * o2], [a[0] + nx * o2, y2, a[1] + nz * o2], [nx * Math.sign(o1 + o2 || 1), 1, nz * Math.sign(o1 + o2 || 1)], [0, 0, L, 0, L, 3, 0, 3]);
    q(Bw, -6, T, 3.2); q(-Bw, -6, -T, 3.2);
    B.quadOut([a[0] + nx * T, 3.2, a[1] + nz * T], [b[0] + nx * T, 3.2, b[1] + nz * T], [b[0] - nx * T, 3.2, b[1] - nz * T], [a[0] - nx * T, 3.2, a[1] - nz * T], [0, 1, 0]);
  }
  // light at the breakwater head
  lights.add(west + 2, 9, z1 + 120, [100, 4, 2], 1.2, 1, 3.0, 0.2);
  B.setColor(lin('#e8e5de')).setStyle(ST.PLAIN, 1, 3, 3);
  B.cylinder(west, z1 + 120, 3, 9, 1.2, 1.0, 8);
  // pontoons with boats
  let boats = 0;
  for (let z = z0 - 40; z > z1 + 110; z -= 62) {
    const sx = shoreAt(z) + 10;
    const len = Math.min(280, sx - west - 60);
    if (len < 60) continue;
    B.setStyle(ST.PLAIN, 3, 3, 3).setColor(lin('#9b968c'));
    B.box(sx - len / 2, z, 0.2, 0.75, len / 2, 1.4, 0, { roofStyle: ST.PLAIN });
    for (let k = 6; k < len - 4; k += 7 + r() * 2) {
      for (const side of [-1, 1]) {
        if (r() < 0.2) continue;
        const bl = 9 + r() * 8, bw = 3.2 + bl * 0.08;
        const bx = sx - k, bz = z + side * (bl / 2 + 2.2);
        const sail = r() < 0.55;
        pushHouse(inst, bx, -0.4, bz, bw, 1.6, bl, sail ? 0.4 : 1.4, Math.PI / 2, lin(r() < 0.85 ? '#f2f1ec' : '#1f2f4a'), lin(r() < 0.7 ? '#e9e6df' : '#2c4f7a'), r() * 100, ST.PLAIN, ST.PLAIN);
        if (sail) {
          B.setColor(lin('#d9d9d6')).setStyle(ST.METAL, 1, 3, 3);
          B.beam([bx, 0.8, bz], [bx, 0.8 + bl * 1.25, bz], 0.09);
          if (r() < 0.25) lights.add(bx, 1.2 + bl * 1.25, bz, [40, 38, 34], 0.5, 0);
        }
        boats++;
      }
    }
    lights.add(sx - len, 2.5, z, scalec(LAMP.sodium, 20), 0.8, 0);
  }
  // clubhouse
  const cz = (z0 + z1) / 2;
  const cx = shoreAt(cz) + 120;
  B.setColor(lin('#efebe2')).setStyle(ST.RESID, 5, 3.4, 3.2);
  B.box(cx, cz, land.h(cx, cz) - 1, land.h(cx, cz) + 7, 20, 12, 0, { roofStyle: ST.ROOF, roofColor: lin('#b46a4a') });
  return boats;
}

export function buildPier(B, roads, lights, land, r, { z, shoreAt }) {
  const sx = shoreAt(z);
  const xStart = sx + 160, xEnd = sx - 430;
  const deck = 6.4, hw = 6;
  // ramp from the promenade + deck
  const y0 = land.h(xStart, z);
  B.setStyle(ST.PLAIN, 21, 3, 3).setColor(lin('#5d4935'));
  const segs = 24;
  for (let i = 0; i < segs; i++) {
    const xa = xStart + (xEnd - xStart) * i / segs, xb = xStart + (xEnd - xStart) * (i + 1) / segs;
    const ya = Math.max(deck, y0) * 0 + (i < 3 ? y0 + (deck - y0) * (i / 3) : deck), yb = i + 1 < 3 ? y0 + (deck - y0) * ((i + 1) / 3) : deck;
    B.quad([xa, ya, z + hw], [xa, ya, z - hw], [xb, yb, z - hw], [xb, yb, z + hw], [0, 0, 1, 0, 1, 1, 0, 1]);
    B.quad([xa, ya - 0.8, z + hw], [xb, yb - 0.8, z + hw], [xb, yb + 1.1, z + hw], [xa, ya + 1.1, z + hw]);
    B.quad([xb, yb - 0.8, z - hw], [xa, ya - 0.8, z - hw], [xa, ya + 1.1, z - hw], [xb, yb + 1.1, z - hw]);
  }
  // piles
  B.setColor(lin('#2f2a25'));
  for (let x = sx + 40; x > xEnd; x -= 14) for (const dz of [-hw + 0.8, hw - 0.8]) B.box(x, z + dz, -8, deck - 0.4, 0.4, 0.4, 0, { roofStyle: null });
  // lamps along the pier
  for (let x = xStart - 20; x > xEnd; x -= 18) for (const dz of [-hw + 0.4, hw - 0.4]) lights.add(x, deck + 4.2, z + dz, scalec([1.0, 0.8, 0.55], 30), 0.8, 0);
  // restaurant at the end
  B.setColor(lin('#e6dfd0')).setStyle(ST.PUNCHED, 31, 4, 3);
  B.box(xEnd + 25, z, deck, deck + 6, 18, 14, 0, { roofStyle: null });
  B.setColor(lin('#2f5b6b')).setStyle(ST.PITCHED, 31, 3, 3);
  B.gable(xEnd + 25, z, deck + 6, 4, 18, 14, 0, 0.6, lin('#e6dfd0'));
  // Ferris wheel near the pier head (lit rim at night)
  const wx = xEnd + 120, wz = z + hw + 22, R = 22, hub = deck + R + 4;
  B.setColor(lin('#e9e9ea')).setStyle(ST.METAL, 1, 3, 3);
  const n = 20;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    const p0 = [wx + Math.cos(a0) * R, hub + Math.sin(a0) * R, wz], p1 = [wx + Math.cos(a1) * R, hub + Math.sin(a1) * R, wz];
    B.beam(p0, p1, 0.35);
    if (i % 2 === 0) B.beam([wx, hub, wz], p0, 0.12);
    lights.add(p0[0], p0[1], wz + 0.6, i % 3 === 0 ? [40, 10, 30] : (i % 3 === 1 ? [10, 30, 45] : [45, 35, 8]), 0.9, 0);
  }
  for (const dx of [-8, 8]) B.beam([wx + dx, deck, wz], [wx, hub, wz], 0.5);
  // the pier sits on a deck widening near the wheel
  B.setStyle(ST.PLAIN, 21, 3, 3).setColor(lin('#5d4935'));
  B.box(wx, z + hw + 14, deck - 0.8, deck, 30, 16, 0, { roofStyle: ST.PLAIN });
  void roads; void r;
}

export function buildBeach(B, land, r, lights, palms, { z0, z1, shoreAt, detail }) {
  // lifeguard towers + kiosks along the sand
  for (let z = z0; z > z1; z -= 420 + r() * 200) {
    const sx = shoreAt(z) + 55;
    if (land.water(sx, z) > 0.001) continue;
    const y = land.h(sx, z);
    B.setColor(lin('#e8e2d5')).setStyle(ST.PLAIN, 41, 3, 3);
    for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) B.box(sx + dx, z + dz, y - 0.5, y + 2.4, 0.12, 0.12, 0, { roofStyle: null });
    B.setColor(lin('#3f78a8')).setStyle(ST.PLAIN, 42, 3, 3);
    B.box(sx, z, y + 2.4, y + 4.4, 1.6, 1.6, 0, { roofStyle: null });
    B.setColor(lin('#c84a33')).setStyle(ST.PITCHED, 43, 3, 3);
    B.gable(sx, z, y + 4.4, 0.8, 1.6, 1.6, 0, 0.3);
  }
  void palms; void lights; void detail; void clamp; void roofPlant; void pushTree;
}

export function buildStadium(B, lights, land, r, { x, z }) {
  const y0 = land.hMin(x, z, 120, 100) - 0.5;
  const n = 36;
  const ell = (rx, rz, i) => { const a = i / n * Math.PI * 2; return [x + Math.cos(a) * rx, z + Math.sin(a) * rz]; };
  // pitch
  B.setStyle(ST.GRASS, 3, 3, 3).setColor(lin('#3f7a2c'));
  B.box(x, z, y0, y0 + 0.6, 60, 40, 0, { roofStyle: ST.GRASS, walls: false });
  B.setColor(lin('#4c8a34'));
  for (let k = -5; k <= 5; k += 2) B.box(x + k * 10, z, y0 + 0.62, y0 + 0.64, 5, 40, 0, { roofStyle: ST.GRASS, walls: false });
  // bowl: stands (sloped), outer facade, roof canopy
  for (let i = 0; i < n; i++) {
    const a = ell(72, 52, i), b = ell(72, 52, i + 1), c = ell(128, 100, i + 1), d = ell(128, 100, i);
    B.setColor(i % 9 < 4 ? lin('#3b5a8c') : lin('#8a8f96')).setStyle(ST.PLAIN, 7, 3, 3);
    B.quadOut([a[0], y0 + 2, a[1]], [b[0], y0 + 2, b[1]], [c[0], y0 + 30, c[1]], [d[0], y0 + 30, d[1]], [x - (a[0] + b[0]) / 2, 2, z - (a[1] + b[1]) / 2]);
    B.setColor(lin('#cfcac0')).setStyle(ST.RIBBON, 9, 5, 4);
    B.quadOut([d[0], y0 - 1, d[1]], [c[0], y0 - 1, c[1]], [c[0], y0 + 34, c[1]], [d[0], y0 + 34, d[1]], [(c[0] + d[0]) / 2 - x, 0, (c[1] + d[1]) / 2 - z], [0, -1, 18, -1, 18, 34, 0, 34]);
    const e = ell(134, 106, i), f = ell(134, 106, i + 1), g = ell(92, 70, i + 1), h = ell(92, 70, i);
    B.setColor(lin('#e6e6e3')).setStyle(ST.METAL, 1, 3, 3);
    B.quadOut([e[0], y0 + 40, e[1]], [f[0], y0 + 40, f[1]], [g[0], y0 + 37, g[1]], [h[0], y0 + 37, h[1]], [0, 1, 0]);
    B.quadOut([e[0], y0 + 40, e[1]], [f[0], y0 + 40, f[1]], [g[0], y0 + 37, g[1]], [h[0], y0 + 37, h[1]], [0, -1, 0]);
    B.setColor(lin('#e6e6e3')).setStyle(ST.METAL, 1, 3, 3);
    B.quadOut([d[0], y0 + 34, d[1]], [c[0], y0 + 34, c[1]], [f[0], y0 + 40, f[1]], [e[0], y0 + 40, e[1]], [(c[0] + d[0]) / 2 - x, 0, (c[1] + d[1]) / 2 - z]);
    // floodlight strip under the canopy edge
    B.setColor([1.0, 0.95, 0.85]).setStyle(ST.LAMP, 1, 3, 3);
    const h2 = ell(93, 71, i + 0.3), g2 = ell(93, 71, i + 0.7);
    B.quadOut([h2[0], y0 + 36.2, h2[1]], [g2[0], y0 + 36.2, g2[1]], [g2[0], y0 + 36.9, g2[1]], [h2[0], y0 + 36.9, h2[1]], [x - h2[0], 0, z - h2[1]]);
    if (i % 3 === 0) lights.add(h2[0], y0 + 36, h2[1], scalec(LAMP.led, 60), 2.0, 0);
  }
  void r;
}
