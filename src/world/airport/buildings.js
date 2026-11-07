// =============================================================================
// Airport buildings: terminal (two styles), control tower, hangars (one open
// with an aircraft inside), fire station, cargo sheds, fuel farm, radar,
// ILS localizer + glide slope, windsocks, blast fence, apron floodlight masts,
// perimeter fence, landside roads, car parks with instanced cars.
//
// Static geometry is merged per material (GeoBuilder, vertex colours, planar
// metre UVs) – a handful of draw calls per airport.
// =============================================================================
import * as THREE from 'three';
import { RUNWAY, TAXIWAY_A_Z, TERMINAL_FACADE_Z, GATE_STAND_Z } from '../layout.js';
import { GeoBuilder, PRIM, mat, mulberry, makeCanvas } from './util.js';
import { glassMaterial, buildingMaterials, MAX_FLOODS } from './materials.js';
import { LC, CAT, MODE, BEAM } from './lights.js';

// --------------------------------------------------------------------------- per-airport site plans
const SITES = {
  departure: {
    tower: { x: 985, z: -640, h: 50 },
    hangars: [{ x: -1240, z: -505, w: 92, d: 70, h: 27, open: true }, { x: -1110, z: -505, w: 80, d: 66, h: 24, open: false }],
    fire: { x: -930, z: -330 },
    cargo: [{ x: 1030, z: -500, w: 240, d: 60, h: 14 }],
    fuel: { x: 1350, z: -720 },
    radar: { x: -1950, z: -620 },
    pads: [[-1300, -1060, -470, -215], [-980, -880, -350, -215], [880, 1180, -470, -215]],
    carparks: [[-560, -60, -610, -760], [60, 560, -610, -760], [-560, 560, -790, -870]],
    roadZ: -590,
  },
  arrival: {
    tower: { x: 1130, z: -660, h: 55 },
    hangars: [{ x: 1300, z: -505, w: 92, d: 70, h: 27, open: true }, { x: 1180, z: -505, w: 80, d: 66, h: 24, open: false }],
    fire: { x: -840, z: -330 },
    cargo: [{ x: -1150, z: -500, w: 240, d: 60, h: 14 }],
    fuel: { x: -1350, z: -720 },
    radar: { x: 2050, z: -560 },
    pads: [[1120, 1360, -470, -215], [-890, -790, -350, -215], [-1280, -1020, -470, -215]],
    carparks: [[-480, 0, -630, -780], [120, 880, -630, -780], [-480, 880, -810, -880]],
    roadZ: -610,
  },
};

export function sitePlan(def) { return SITES[def.id]; }

// colours
const K = {
  podium: 0x5c6166, fascia: 0xdfe2e3, roofMetal: 0x979ca0, soffit: 0xc8b796, column: 0xe8e8e6, door: 0x6e7479,
  sand: 0xcbbb9b, white: 0xe4e4e0, concrete: 0xb5b1aa, darkRoof: 0x3b3d40, red: 0xa3241e, steel: 0x7d8286,
};

function strip(profile, x0, x1) {
  // extrude a (z, y) polyline along x – returns geometry with normals
  const P = [], I = [];
  for (const [z, y] of profile) P.push(x0, y, z, x1, y, z);
  for (let i = 0; i < profile.length - 1; i++) { const a = i * 2; I.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}
function flipped(g) {
  const h = g.clone();
  const idx = h.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const n = h.attributes.normal.array;
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return h;
}
function quad(x0, y0, z0, x1, y1, z1) {
  // vertical quad from (x0,z0) to (x1,z1), y0..y1 ; normal = left of direction (x1-x0, z1-z0) rotated
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0], 3));
  const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz);
  const nx = dz / l, nz = -dx / l;
  g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

// =========================================================================== builder
export function buildBuildings(def, ctx, lights, opts = {}) {
  const group = new THREE.Group();
  group.name = `buildings-${def.code}`;
  const detail = opts.detail ?? 1;
  const site = SITES[def.id];
  const M = buildingMaterials(ctx);
  const B = {
    concrete: new GeoBuilder(), metal: new GeoBuilder(), paint: new GeoBuilder(), dark: new GeoBuilder(),
    corr: new GeoBuilder(), glass: new GeoBuilder(), cabGlass: new GeoBuilder(), lampWarm: new GeoBuilder(), lampCool: new GeoBuilder(),
  };
  const rnd = mulberry(def.seed);
  const out = { floods: [], beacon: null, dynamic: [], windsocks: [], hangarSpots: [], obstruction: [] };

  buildTerminal(def, B, lights, out);
  buildTower(site.tower, B, lights, out);
  for (const h of site.hangars) buildHangar(h, B, lights, out);
  buildFireStation(site.fire, B, lights);
  for (const c of site.cargo) buildCargo(c, B, lights, rnd);
  buildFuelFarm(site.fuel, B);
  buildNavaids(def, B, lights, out);
  buildMasts(def, B, lights, out);
  buildLandside(def, site, B, lights, out, rnd, detail);
  if (detail >= 1) buildFence(def, B);

  // merge into meshes
  const glass = glassMaterial(ctx, def.terminal.style === 'glass-arc'
    ? { floorY: 5.2, ceilY: 15.0, depth: 30, mullion: [1.5, 3.25], mullionY0: 5.2, gates: new THREE.Vector4(def.gates[0].x - 17, 50, 0, 0) }
    : { floorY: 5.2, ceilY: 11.6, depth: 22, mullion: [1.25, 2.2], mullionY0: 5.2, warm: 0xffe7c4, gates: new THREE.Vector4(def.gates[0].x - 17, 50, 0, 0) });
  const cabGlassMat = glassMaterial(ctx, { floorY: site.tower.h + 0.3, ceilY: site.tower.h + 4.6, depth: 9, mullion: [2.2, 5], mullionY0: site.tower.h, level: 0.6, people: 0.4 });
  const lampWarm = new THREE.MeshStandardMaterial({ name: 'apt-lamp-warm', color: 0x000000, emissive: 0xffe2b0, emissiveIntensity: 2.5, roughness: 0.5 });
  const lampCool = new THREE.MeshStandardMaterial({ name: 'apt-lamp-cool', color: 0x000000, emissive: 0xe8f0ff, emissiveIntensity: 3, roughness: 0.5 });
  const list = [
    ['concrete', M.concrete, true], ['metal', M.metal, true], ['paint', M.paint, true], ['dark', M.dark, true], ['corr', M.corrugated, true],
    ['glass', glass, false], ['cabGlass', cabGlassMat, false], ['lampWarm', lampWarm, false], ['lampCool', lampCool, false],
  ];
  for (const [k, m, shadow] of list) {
    if (B[k].empty) continue;
    const mesh = new THREE.Mesh(B[k].build(), m);
    mesh.name = `bld-${k}`;
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    group.add(mesh);
  }
  out.materials = { ...M, glass, cabGlass: cabGlassMat, lampWarm, lampCool };
  out.group = group;
  return out;
}

// --------------------------------------------------------------------------- terminal
function buildTerminal(def, B, L, out) {
  const T = def.terminal;
  const f = TERMINAL_FACADE_Z, b = T.zMin, x0 = T.xMin, x1 = T.xMax, H = T.height;
  const arc = T.style === 'glass-arc';
  const W = x1 - x0, xc = (x0 + x1) / 2;
  const podH = 4.6;
  const clad = arc ? K.podium : 0x8a8170;
  // podium (apron level: baggage hall, ramp offices)
  B.paint.add(PRIM.box, mat(xc, podH / 2, (f + b) / 2, 0, 0, 0, W, podH, f - b), clad, { planar: 4 });
  // baggage hall roller doors & lit service doors along the front
  for (let x = x0 + 20; x < x1 - 10; x += 40) {
    B.metal.add(PRIM.box, mat(x, 1.9, f + 0.08, 0, 0, 0, 6, 3.6, 0.12), K.door);
    for (let k = 0; k < 9; k++) B.dark.add(PRIM.box, mat(x, 0.3 + k * 0.4, f + 0.15, 0, 0, 0, 5.9, 0.03, 0.02), 0x2c2f33);
    B.lampWarm.add(PRIM.box, mat(x + 8, 1.1, f + 0.06, 0, 0, 0, 1.0, 2.1, 0.05), 0xffffff);
    B.metal.add(PRIM.box, mat(x + 8, 2.5, f + 0.5, 0, 0, 0, 1.6, 0.08, 1.0), K.fascia);
  }
  // departure level slab edge (fascia)
  B.metal.add(PRIM.box, mat(xc, podH + 0.35, f + 0.2, 0, 0, 0, W, 0.7, 0.5), K.fascia);
  if (arc) {
    // ---- glass-arc: one big hall under a vaulted roof with a deep canopy over the apron
    const gTop = H - 0.6;
    B.glass.add(quad(x1, podH + 0.7, f - 0.6, x0, podH + 0.7, f - 0.6).translate(0, 0, 0), null, 0xffffff);
    patchQuadTop(B.glass, gTop);
    // landside glazing + ends
    B.glass.add(quad(x0, 0.6, b, x1, 0.6, b), null, 0xffffff); patchQuadTop(B.glass, gTop);
    B.glass.add(quad(x0, podH + 0.7, f - 0.6, x0, podH + 0.7, b), null, 0xffffff); patchQuadTop(B.glass, gTop);
    B.glass.add(quad(x1, podH + 0.7, b, x1, podH + 0.7, f - 0.6), null, 0xffffff); patchQuadTop(B.glass, gTop);
    // vault: (z, y) profile from the airside canopy edge to the landside canopy edge
    const prof = [];
    const za = f + 7, zb = b - 6;
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const z = za + (zb - za) * t;
      prof.push([z, H - 0.4 + 6.5 * Math.sin(Math.PI * t) ** 0.8]);
    }
    const roofTop = strip(prof.map(([z, y]) => [z, y + 0.6]), x0 - 6, x1 + 6);
    B.corr.add(roofTop, null, K.roofMetal);
    B.paint.add(flipped(strip(prof, x0 - 6, x1 + 6)), null, K.soffit);
    // roof edge fascias
    B.metal.add(PRIM.box, mat(xc, H - 0.1, za, 0, 0, 0, W + 12, 0.9, 0.3), K.fascia);
    B.metal.add(PRIM.box, mat(xc, H - 0.1, zb, 0, 0, 0, W + 12, 0.9, 0.3), K.fascia);
    // gable ends (opaque cladding above the glass)
    for (const [xe, s] of [[x0 - 0.2, -1], [x1 + 0.2, 1]]) {
      const pts = prof.filter(([z]) => z <= f - 0.6 && z >= b);
      for (let i = 0; i < pts.length - 1; i++) {
        const [za2, ya] = pts[i], [zb2] = pts[i + 1];
        B.metal.add(PRIM.box, mat(xe, (ya + gTop) / 2 + 0.3, (za2 + zb2) / 2, 0, 0, 0, 0.3, Math.max(0.2, ya - gTop + 0.6), Math.abs(zb2 - za2) + 0.05), K.fascia);
      }
      void s;
    }
    // tree-columns supporting the canopy
    for (let x = x0 + 9; x < x1; x += 36) {
      B.metal.add(PRIM.cyl12, mat(x, (podH + H) / 2 + 0.3, f + 3.2, 0, 0, 0, 0.55, H - podH, 0.55), K.column);
      for (const s of [-1, 1]) B.metal.add(PRIM.cyl8, mat(x + s * 2.2, H - 1.4, f + 3.2, 0, 0, s * 0.45, 0.25, 4.8, 0.25), K.column);
    }
    // skylight along the apex
    B.dark.add(PRIM.box, mat(xc, H + 6.7, (za + zb) / 2, 0, 0, 0, W - 40, 0.25, 7), 0x23292e);
    // canopy downlights (soffit)
    for (let x = x0 + 4; x < x1; x += 12) B.lampWarm.add(PRIM.box, mat(x, H - 0.35, f + 4, 0, 0, 0, 0.6, 0.05, 0.6), 0xffffff);
  } else {
    // ---- concourse-piers: low glazed gate concourse in front, high hall behind with a folded roof
    const Hf = 12.4, zH = f - 22;
    B.glass.add(quad(x1, podH + 0.7, f - 0.6, x0, podH + 0.7, f - 0.6), null, 0xffffff); patchQuadTop(B.glass, Hf - 0.5);
    B.paint.add(PRIM.box, mat(xc, Hf, (f + 3 + zH) / 2, 0, 0, 0, W + 2, 0.9, f + 3 - zH), K.white, { planar: 4 });
    B.dark.add(PRIM.box, mat(xc, Hf + 0.5, (f + zH) / 2, 0, 0, 0, W - 2, 0.12, f - zH - 2), K.darkRoof);
    // vertical fins
    for (let x = x0 + 3; x < x1; x += 6.25) B.paint.add(PRIM.box, mat(x, (podH + Hf) / 2 + 0.4, f + 0.1, 0, 0, 0, 0.18, Hf - podH, 0.9), K.white);
    // main hall
    const Hh = H;
    B.paint.add(PRIM.box, mat(xc, (Hf + Hh) / 2, (zH + b) / 2 - 0.5, 0, 0, 0, W, Hh - Hf, zH - b - 1), K.sand, { planar: 4 });
    B.glass.add(quad(x1, Hf + 0.5, zH + 0.05, x0, Hf + 0.5, zH + 0.05), null, 0xffffff); patchQuadTop(B.glass, Hh - 0.8);
    B.paint.add(PRIM.box, mat(xc, podH + (Hf - podH) / 2, (zH + b) / 2, 0, 0, 0, W, Hf - podH, zH - b), K.sand, { planar: 4 });
    B.glass.add(quad(x0, 0.6, b - 0.1, x1, 0.6, b - 0.1), null, 0xffffff); patchQuadTop(B.glass, Hh - 2);
    // folded-plate roof: ridges every 30 m
    const n = Math.round(W / 30);
    for (let i = 0; i < n; i++) {
      const xa = x0 + i * (W / n), xb = xa + W / n, xm = (xa + xb) / 2;
      const g = new THREE.BufferGeometry();
      const yl = Hh + 0.2, yh = Hh + 3.6;
      const za = zH + 2, zb = b - 2;
      g.setAttribute('position', new THREE.Float32BufferAttribute([xa, yl, za, xm, yh, za, xm, yh, zb, xa, yl, zb, xm, yh, za, xb, yl, za, xb, yl, zb, xm, yh, zb], 3));
      g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
      g.computeVertexNormals();
      B.corr.add(g, null, 0xb5b2aa);
      B.metal.add(PRIM.box, mat(xm, yh - 0.1, za, 0, 0, 0, 0.4, 0.4, 0.4), K.white);
    }
    // roof gables (triangles at both ends of each fold)
    for (const zz of [zH + 2, b - 2]) {
      for (let i = 0; i < n; i++) {
        const xa = x0 + i * (W / n), xb = xa + W / n, xm = (xa + xb) / 2;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([xa, Hh + 0.2, zz, xb, Hh + 0.2, zz, xm, Hh + 3.6, zz], 3));
        g.setIndex(zz > b ? [0, 1, 2] : [0, 2, 1]);
        g.computeVertexNormals();
        B.metal.add(g, null, K.white);
      }
    }
    for (let x = x0 + 4; x < x1; x += 10) B.lampWarm.add(PRIM.box, mat(x, Hf - 0.5, f + 1.8, 0, 0, 0, 0.6, 0.05, 0.6), 0xffffff);
  }
  // roof plant / HVAC units
  for (let x = x0 + 60; x < x1 - 40; x += 140) {
    B.metal.add(PRIM.box, mat(x, H + (arc ? 5.6 : 4.2), (f + b) / 2 - 8, 0, 0, 0, 10, 2.2, 5), 0xa8acaf);
  }
  // obstruction lights at the roof corners
  for (const x of [x0, x1]) L.add([x, H + (arc ? 1.2 : 4), f - 2], LC.red, null, { size: 0.35, cat: CAT.OBSTRUCTION });
  // landside curb canopy
  B.paint.add(PRIM.box, mat(xc, 6.5, b - 7, 0, 0, 0, W - 60, 0.5, 12), K.white);
  for (let x = x0 + 35; x < x1 - 30; x += 24) B.metal.add(PRIM.cyl8, mat(x, 3.2, b - 12, 0, 0, 0, 0.4, 6.4, 0.4), K.column);
  for (let x = x0 + 35; x < x1 - 30; x += 8) B.lampWarm.add(PRIM.box, mat(x, 6.22, b - 7, 0, 0, 0, 1.2, 0.04, 0.3), 0xffffff);
  // airport name on the landside facade (simple block letters are left to the signs module)
  out.terminal = { f, b, x0, x1, H };
}

// set the top y of the last added quad (helper used after quad())
function patchQuadTop(builder, yTop) {
  const p = builder.parts[builder.parts.length - 1];
  p.P[7] = yTop; p.P[10] = yTop;
  // planar uvs not needed (glass is procedural)
}

// --------------------------------------------------------------------------- tower
function buildTower(t, B, L, out) {
  const { x, z, h } = t;
  // base building
  B.paint.add(PRIM.box, mat(x, 4, z + 14, 0, 0, 0, 26, 8, 14), K.white, { planar: 4 });
  B.glass.add(quad(x - 13, 0.8, z + 21.05, x + 13, 0.8, z + 21.05), null, 0xffffff); patchQuadTop(B.glass, 7.0);
  // shaft (concrete) with a lift core stripe
  B.concrete.add(PRIM.cyl24, mat(x, h / 2, z, 0, 0, 0, 7.2, h, 7.2), 0xd2cdc4, { planar: 4 });
  B.metal.add(PRIM.box, mat(x, h / 2, z + 3.4, 0, 0, 0, 1.4, h - 6, 0.4), 0x8e9aa3);
  for (let y = 6; y < h - 6; y += 3.2) B.glass.add(PRIM.box, mat(x, y, z + 3.62, 0, 0, 0, 0.9, 1.6, 0.05), 0xffffff);
  // flared support + equipment floor
  B.paint.add(PRIM.cyl24, mat(x, h - 2.2, z, 0, 0, 0, 13, 3.2, 13), K.white);
  B.paint.add(new THREE.CylinderGeometry(0.5, 0.33, 1, 24), mat(x, h - 5, z, 0, 0, 0, 13, 3, 13), K.white);
  // catwalk deck
  B.metal.add(PRIM.cyl24, mat(x, h - 0.4, z, 0, 0, 0, 16.4, 0.3, 16.4), K.steel);
  // glass cab: octagonal, leaning outwards
  const r0 = 6.3, r1 = 7.2, y0 = h, y1 = h + 5;
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
    const g = new THREE.BufferGeometry();
    const P = [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0, x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0,
      x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1, x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1];
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    B.cabGlass.add(g, null, 0xffffff);
    // mullion posts
    B.metal.add(PRIM.box, mat(x + Math.cos(a0) * (r0 + r1) / 2, (y0 + y1) / 2, z + Math.sin(a0) * (r0 + r1) / 2, 0, -a0, -0.18, 0.15, 5.1, 0.15), 0x3a3d40);
  }
  // roof cap + antennas
  B.paint.add(PRIM.cyl24, mat(x, y1 + 0.5, z, 0, 0, 0, r1 * 2 + 1.2, 1.0, r1 * 2 + 1.2), K.white);
  B.metal.add(PRIM.cyl24, mat(x, y1 + 1.2, z, 0, 0, 0, 8, 0.5, 8), K.steel);
  B.metal.add(PRIM.cyl8, mat(x + 2, y1 + 5, z, 0, 0, 0, 0.12, 8, 0.12), 0xcfcfcf);
  B.metal.add(PRIM.cyl8, mat(x - 2.4, y1 + 3.6, z + 1.2, 0, 0, 0, 0.08, 5, 0.08), 0xcfcfcf);
  B.metal.add(PRIM.cyl8, mat(x, y1 + 2.0, z - 2.4, 0, 0, 0, 0.6, 1.2, 0.6), 0xdddddd);
  // rotating beacon (white / green) and obstruction lights
  L.add([x, y1 + 2.9, z - 2.4], [1.0, 0.95, 0.85], [0.1, 1.0, 0.35], { size: 0.9, mode: MODE.BEACON, cat: CAT.BEACON });
  L.add([x + 2, y1 + 9.1, z], LC.red, null, { size: 0.4, cat: CAT.OBSTRUCTION, gain: 1.2 });
  for (const a of [0.4, 2.5, 4.6]) L.add([x + Math.cos(a) * 7.8, y1 + 1.1, z + Math.sin(a) * 7.8], LC.red, null, { size: 0.3, cat: CAT.OBSTRUCTION });
  out.tower = { x, z, h };
}

// --------------------------------------------------------------------------- hangar
function buildHangar(hg, B, L, out) {
  const { x, z, w, d, h, open } = hg;
  const zf = z + d / 2, zb = z - d / 2, x0 = x - w / 2, x1 = x + w / 2;
  const doorH = h - 6, doorW = w - 8;
  const wallC = open ? 0x9fb0bd : 0xb7bcbf;
  // side & back walls (thin boxes so the inside is visible through the open door)
  B.corr.add(PRIM.box, mat(x0 + 0.2, (h - 4) / 2, z, 0, 0, 0, 0.4, h - 4, d), wallC);
  B.corr.add(PRIM.box, mat(x1 - 0.2, (h - 4) / 2, z, 0, 0, 0, 0.4, h - 4, d), wallC);
  B.corr.add(PRIM.box, mat(x, (h - 4) / 2, zb + 0.2, 0, 0, 0, w, h - 4, 0.4), wallC);
  // arched roof
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, xx = x0 + w * t;
    prof.push([xx, h - 4 + 4 * Math.sin(Math.PI * t)]);
  }
  for (let i = 0; i < prof.length - 1; i++) {
    const [xa, ya] = prof[i], [xb, yb] = prof[i + 1];
    const len = Math.hypot(xb - xa, yb - ya), ang = Math.atan2(yb - ya, xb - xa);
    B.corr.add(PRIM.box, mat((xa + xb) / 2, (ya + yb) / 2, z, 0, 0, ang, len + 0.05, 0.35, d + 0.6), 0x9ea3a6);
    B.paint.add(PRIM.box, mat((xa + xb) / 2, (ya + yb) / 2 - 0.3, z, 0, 0, ang, len, 0.05, d - 0.6), 0xd8dadb);
    // gable infill above the door / back wall
    const yy = Math.min(ya, yb);
    for (const zz of [zf - 0.2, zb + 0.2]) B.corr.add(PRIM.box, mat((xa + xb) / 2, (h - 4 + yy) / 2 + 0.02, zz, 0, 0, 0, len, Math.max(0.1, yy - (h - 4)) + 0.3, 0.4), wallC);
  }
  // door header & jambs
  B.corr.add(PRIM.box, mat(x, (doorH + h - 4) / 2, zf - 0.2, 0, 0, 0, w, h - 4 - doorH, 0.4), wallC);
  for (const s of [-1, 1]) B.corr.add(PRIM.box, mat(x + s * (w / 2 - 2), doorH / 2, zf - 0.2, 0, 0, 0, 4, doorH, 0.4), wallC);
  // sliding door panels: closed across the opening, or stacked at both sides
  const nP = 6, pw = doorW / nP;
  for (let i = 0; i < nP; i++) {
    let px;
    if (open) px = (i < nP / 2 ? x0 + 4 + pw / 2 + i * 0.6 - 0.5 : x1 - 4 - pw / 2 - (nP - 1 - i) * 0.6 + 0.5);
    else px = x0 + 4 + pw / 2 + i * pw;
    const pz = zf + 0.3 + (i % 3) * 0.5;
    B.corr.add(PRIM.box, mat(px, doorH / 2, pz, 0, 0, 0, pw - 0.1, doorH, 0.25), 0xc4c8ca);
    if (!open) B.glass.add(PRIM.box, mat(px, doorH - 3, pz + 0.14, 0, 0, 0, pw - 1.6, 1.4, 0.02), 0xffffff);
  }
  // interior: lights in the roof, lined back wall, workshops, platforms
  for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 3; iz++) {
    B.lampCool.add(PRIM.box, mat(x0 + (ix + 0.5) * w / 4, h - 4.6, zb + (iz + 0.5) * d / 3, 0, 0, 0, 2.4, 0.15, 1.0), 0xffffff);
  }
  B.paint.add(PRIM.box, mat(x, 3, zb + 0.5, 0, 0, 0, w - 1, 6, 0.1), 0xd2d4d2);
  for (let i = 0; i < 6; i++) B.paint.add(PRIM.box, mat(x0 + 6 + i * 13, 2.2, zb + 3, 0, 0, 0, 10, 4.4, 4), i % 2 ? 0xc9c9c4 : 0x8ea0b0);
  B.paint.add(PRIM.box, mat(x1 - 6, 3.0, z, 0, 0, 0, 3, 6, 8), 0xe0b52a);   // maintenance platform
  // floor
  B.paint.add(PRIM.box, mat(x, 0.05, z, 0, 0, 0, w - 0.8, 0.1, d - 0.8), 0x9c9c98);
  // obstruction lights on the roof corners
  L.add([x0 + 1, h + 0.3, zf - 1], LC.red, null, { size: 0.3, cat: CAT.OBSTRUCTION });
  L.add([x1 - 1, h + 0.3, zf - 1], LC.red, null, { size: 0.3, cat: CAT.OBSTRUCTION });
  // apron floodlights over the hangar door
  for (const s of [-1, 0, 1]) {
    B.metal.add(PRIM.box, mat(x + s * 28, h - 4.5, zf + 0.6, 0, 0, 0, 1.2, 0.5, 0.8), 0x555a5e);
    L.add([x + s * 28, h - 4.8, zf + 1.0], LC.warm, null, { size: 0.5, mode: MODE.FLOOD, cat: CAT.FLOOD, gain: 0.5 });
  }
  if (open) out.hangarSpots.push({ x, z: z + 2, heading: 180 });
}

// --------------------------------------------------------------------------- fire station
function buildFireStation(fs, B, L) {
  const { x, z } = fs;
  B.paint.add(PRIM.box, mat(x, 4.5, z, 0, 0, 0, 48, 9, 20), 0xd9d4ca, { planar: 4 });
  B.dark.add(PRIM.box, mat(x, 9.1, z, 0, 0, 0, 47, 0.3, 19), K.darkRoof);
  for (let i = 0; i < 4; i++) {
    const dx = x - 16.5 + i * 11;
    B.metal.add(PRIM.box, mat(dx, 2.9, z + 10.05, 0, 0, 0, 8, 5.8, 0.1), 0xb8221a);
    for (let k = 0; k < 4; k++) B.glass.add(PRIM.box, mat(dx, 4.2, z + 10.11, 0, 0, 0, 7, 0.6, 0.02), 0xffffff);
    B.lampWarm.add(PRIM.box, mat(dx, 6.4, z + 10.3, 0, 0, 0, 1.0, 0.1, 0.4), 0xffffff);
  }
  B.paint.add(PRIM.box, mat(x + 19, 5, z + 10.06, 0, 0, 0, 6, 1.0, 0.05), 0xb8221a);
  // watch room + drying tower
  B.glass.add(PRIM.box, mat(x - 18, 10.8, z - 2, 0, 0, 0, 10, 3.2, 8), 0xffffff);
  B.paint.add(PRIM.box, mat(x - 18, 12.6, z - 2, 0, 0, 0, 10.6, 0.4, 8.6), K.white);
  B.paint.add(PRIM.box, mat(x + 21, 9, z - 6, 0, 0, 0, 4, 18, 4), 0xc4bfb5);
  L.add([x + 21, 18.4, z - 6], LC.red, null, { size: 0.3, cat: CAT.OBSTRUCTION });
}

// --------------------------------------------------------------------------- cargo
function buildCargo(c, B, L, rnd) {
  const { x, z, w, d, h } = c;
  B.corr.add(PRIM.box, mat(x, h / 2, z, 0, 0, 0, w, h, d), 0xa9b1b6);
  B.dark.add(PRIM.box, mat(x, h + 0.1, z, 0, 0, 0, w + 1, 0.3, d + 1), 0x6b6e70);
  B.paint.add(PRIM.box, mat(x, h - 1.2, z + d / 2 + 0.05, 0, 0, 0, w, 1.6, 0.1), 0x1f4e7a);
  for (let i = 0; i < 10; i++) {
    const dx = x - w / 2 + 12 + i * (w - 24) / 9;
    B.metal.add(PRIM.box, mat(dx, 2.8, z + d / 2 + 0.06, 0, 0, 0, 6, 5.6, 0.1), i % 3 ? 0x7f878d : 0x6d757b);
    B.lampWarm.add(PRIM.box, mat(dx, 6.2, z + d / 2 + 0.4, 0, 0, 0, 0.8, 0.12, 0.5), 0xffffff);
  }
  // ULD containers on dollies in front
  for (let i = 0; i < 18; i++) {
    const ux = x - w / 2 + 10 + rnd() * (w - 20), uz = z + d / 2 + 8 + rnd() * 16;
    B.metal.add(PRIM.box, mat(ux, 1.25, uz, 0, rnd() * 0.3, 0, 3.1, 1.6, 2.4), rnd() < 0.5 ? 0xb2b6b8 : 0x9aa0a4);
    B.dark.add(PRIM.box, mat(ux, 0.35, uz, 0, 0, 0, 3.2, 0.3, 2.5), 0x3a3b3c);
  }
  for (let i = 0; i < 5; i++) L.add([x - w / 2 + 20 + i * (w - 40) / 4, h + 0.6, z + d / 2], LC.warm, null, { size: 0.45, mode: MODE.FLOOD, cat: CAT.FLOOD, gain: 0.35 });
}

// --------------------------------------------------------------------------- fuel farm
function buildFuelFarm(f, B) {
  const { x, z } = f;
  for (let i = 0; i < 4; i++) {
    const tx = x + (i % 2) * 34 - 17, tz = z + Math.floor(i / 2) * 34 - 17;
    B.paint.add(PRIM.cyl24, mat(tx, 7, tz, 0, 0, 0, 24, 14, 24), 0xe2e2dc);
    B.metal.add(new THREE.CylinderGeometry(0.15, 0.5, 1, 24), mat(tx, 14.6, tz, 0, 0, 0, 24, 1.2, 24), 0xcfcfca);
    B.paint.add(PRIM.box, mat(tx + 11.5, 7, tz, 0, 0, 0, 0.3, 14, 0.8), 0xd0a020);
  }
  // bund wall
  for (const [dx, dz, w, d] of [[0, -38, 80, 1], [0, 38, 80, 1], [-38, 0, 1, 76], [38, 0, 1, 76]]) {
    B.concrete.add(PRIM.box, mat(x + dx, 0.8, z + dz, 0, 0, 0, w, 1.6, d), 0xb0aca4, { planar: 4 });
  }
  B.metal.add(PRIM.cyl8, mat(x, 1.2, z + 45, 0, 0, Math.PI / 2, 0.6, 30, 0.6), 0x8a8f94);
}

// --------------------------------------------------------------------------- navaids
function buildNavaids(def, B, L, out) {
  const site = SITES[def.id];
  // ILS localizer array beyond the far (27) end, aligned with the centreline
  const lx = RUNWAY.x1 + 320;
  for (let i = 0; i < 16; i++) {
    const z = -21 + i * 2.8;
    B.metal.add(PRIM.cyl8, mat(lx, 1.4, z, 0, 0, 0, 0.12, 2.8, 0.12), 0xbababa);
    B.paint.add(PRIM.box, mat(lx - 0.5, 2.6, z, 0, 0, 0, 1.4, 0.08, 0.08), 0xd8d8d8);
    B.paint.add(PRIM.box, mat(lx - 1.1, 2.6, z, 0, 0, 0, 0.1, 0.4, 0.8), 0xe8e8e8);
  }
  B.metal.add(PRIM.box, mat(lx + 0.6, 0.4, 0, 0, 0, 0, 0.4, 0.4, 46), 0x777777);
  B.paint.add(PRIM.box, mat(lx + 18, 1.5, 32, 0, 0, 0, 5, 3, 3.5), 0xe9e6dc);
  L.add([lx, 3.2, -21], LC.red, null, { size: 0.25, cat: CAT.OBSTRUCTION });
  L.add([lx, 3.2, 21], LC.red, null, { size: 0.25, cat: CAT.OBSTRUCTION });
  // glide slope antenna (south side, ~300 m past the 09 threshold)
  const gx = RUNWAY.x0 + 300, gz = 125;
  B.metal.add(PRIM.cyl8, mat(gx, 8, gz, 0, 0, 0, 0.35, 16, 0.35), 0xcfcfcf);
  for (const y of [5, 9.5, 14]) B.paint.add(PRIM.box, mat(gx - 0.5, y, gz, 0, 0, 0, 0.6, 1.0, 2.2), 0xe0e0e0);
  B.paint.add(PRIM.box, mat(gx + 6, 1.5, gz + 3, 0, 0, 0, 4, 3, 3), 0xe9e6dc);
  L.add([gx, 16.3, gz], LC.red, null, { size: 0.3, cat: CAT.OBSTRUCTION });
  // surveillance radar on a lattice tower (antenna rotates)
  const r = site.radar, rh = 20;
  for (const [dx, dz] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) {
    B.metal.add(PRIM.box, mat(r.x + dx * 0.75, rh / 2, r.z + dz * 0.75, dz * 0.03, 0, -dx * 0.03, 0.25, rh, 0.25), 0xc9ccce);
  }
  for (let y = 2; y < rh; y += 3) {
    for (const [a, w2] of [[0, 1], [Math.PI / 2, 1]]) B.metal.add(PRIM.box, mat(r.x, y, r.z, 0, a, 0, 3.2 - y * 0.05, 0.12, 0.12), 0xc9ccce, {}), void w2;
  }
  B.paint.add(PRIM.box, mat(r.x, rh + 0.6, r.z, 0, 0, 0, 3.6, 1.2, 3.6), 0xe6e6e2);
  B.paint.add(PRIM.box, mat(r.x + 8, 1.6, r.z + 6, 0, 0, 0, 7, 3.2, 4), 0xe9e6dc);
  const ant = new GeoBuilder();
  ant.add(PRIM.box, mat(0, 1.3, 0.6, -0.35, 0, 0, 12, 2.2, 0.12), 0xd8dadb);
  ant.add(PRIM.box, mat(0, 0.5, 0, 0, 0, 0, 1.2, 1.0, 1.2), 0x6a6e72);
  ant.add(PRIM.box, mat(0, 1.0, -0.5, 0, 0, 0, 0.5, 0.5, 1.6), 0x6a6e72);
  out.dynamic.push({ kind: 'radar', geo: ant.build(), x: r.x, y: rh + 1.2, z: r.z, speed: 2 * Math.PI / 4.8 });
  L.add([r.x, rh + 3.8, r.z], LC.red, null, { size: 0.3, cat: CAT.OBSTRUCTION });
  // windsocks: near both thresholds on the north side, and mid-field
  for (const [wx, wz] of [[RUNWAY.x0 + 260, -64], [RUNWAY.x1 - 260, -64], [0, 64]]) {
    B.metal.add(PRIM.cyl8, mat(wx, 3.2, wz, 0, 0, 0, 0.14, 6.4, 0.14), 0xd8d8d8);
    B.concrete.add(PRIM.box, mat(wx, 0.1, wz, 0, 0, 0, 1.2, 0.3, 1.2), 0xaaaaaa);
    L.add([wx, 6.55, wz], LC.red, null, { size: 0.22, cat: CAT.OBSTRUCTION });
    out.windsocks.push({ x: wx, y: 6.2, z: wz });
  }
  // blast fence behind the 09 departure end
  const bx = RUNWAY.x0 - 95;
  for (let i = 0; i < 12; i++) {
    const z = -33 + i * 6;
    B.metal.add(PRIM.box, mat(bx, 2.0, z, 0, 0, -0.5, 0.15, 4.4, 5.9), 0x8f979c);
    B.metal.add(PRIM.box, mat(bx + 0.9, 1.6, z + 2.9, 0, 0, 0, 0.18, 3.2, 0.18), 0x555a5e);
  }
}

// --------------------------------------------------------------------------- apron floodlight masts
function buildMasts(def, B, L, out) {
  const masts = [];
  const g = def.gates;
  // head of stand: between gates every 2nd gap
  for (let i = 0; i < g.length - 1; i += 2) masts.push({ x: (g[i].x + g[i + 1].x) / 2, z: TERMINAL_FACADE_Z + 9.5, h: 30 });
  // apron edge (taxilane side)
  const ap = def.apron;
  for (let x = ap.xMin + 60; x <= ap.xMax - 60; x += 170) masts.push({ x, z: ap.zMax + 6, h: 32 });
  masts.length = Math.min(masts.length, MAX_FLOODS);
  for (const m of masts) {
    B.metal.add(new THREE.CylinderGeometry(0.22, 0.42, 1, 10), mat(m.x, m.h / 2, m.z, 0, 0, 0, 1, m.h, 1), 0x9ba0a3);
    B.concrete.add(PRIM.cyl12, mat(m.x, 0.25, m.z, 0, 0, 0, 1.6, 0.5, 1.6), 0xb0aca6);
    B.metal.add(PRIM.box, mat(m.x, m.h + 0.2, m.z, 0, 0, 0, 4.2, 0.25, 1.6), 0x6f7478);
    for (let k = 0; k < 4; k++) {
      for (const s of [-1, 1]) {
        const lx = m.x - 1.5 + k * 1.0, lz = m.z + s * 0.5;
        B.dark.add(PRIM.box, mat(lx, m.h - 0.15, lz, s * 0.5, 0, 0, 0.7, 0.4, 0.5), 0x3a3c3e);
        L.add([lx, m.h - 0.42, lz + s * 0.12], LC.warm, null, { size: 0.42, mode: MODE.FLOOD, cat: CAT.FLOOD, gain: 0.55 });
      }
    }
    L.add([m.x, m.h + 0.6, m.z], LC.red, null, { size: 0.28, cat: CAT.OBSTRUCTION });
  }
  out.floods = masts;
}

// --------------------------------------------------------------------------- landside
function buildLandside(def, site, B, L, out, rnd, detail) {
  const T = def.terminal;
  const rz = site.roadZ;
  // curb roads (two carriageways) + access road east-west
  const roads = [];
  roads.push([T.xMin - 40, T.xMax + 40, rz - 7, rz + 7]);
  roads.push([T.xMin - 40, T.xMax + 40, rz - 28, rz - 16]);
  out.roads = roads;
  // car parks: lighting columns
  out.carparks = site.carparks;
  for (const [x0, x1, za, zb] of site.carparks) {
    for (let x = x0 + 20; x < x1; x += 45) for (let z = Math.max(za, zb) - 15; z > Math.min(za, zb); z -= 40) {
      B.metal.add(PRIM.cyl8, mat(x, 6, z, 0, 0, 0, 0.18, 12, 0.18), 0x8d9296);
      B.metal.add(PRIM.box, mat(x, 12, z, 0, 0, 0, 1.2, 0.2, 0.5), 0x5d6266);
      L.add([x, 11.8, z], LC.warm, null, { size: 0.22, mode: MODE.FLOOD, cat: CAT.FLOOD, gain: 0.1 });
    }
  }
  // street lights along the curb road
  for (let x = T.xMin; x < T.xMax; x += 36) {
    B.metal.add(PRIM.cyl8, mat(x, 5, rz + 9, 0, 0, 0, 0.16, 10, 0.16), 0x8d9296);
    L.add([x, 9.9, rz + 8], LC.warm, null, { size: 0.3, mode: MODE.FLOOD, cat: CAT.FLOOD, gain: 0.25 });
  }
  // multi-storey car park block next to the terminal
  const mx = T.xMax - 120, mz = T.zMin - 95;
  for (let lv = 0; lv < 4; lv++) {
    B.concrete.add(PRIM.box, mat(mx, lv * 3.2 + 0.25, mz, 0, 0, 0, 110, 0.5, 60), 0xb9b4ab, { planar: 4 });
    B.concrete.add(PRIM.box, mat(mx, lv * 3.2 + 1.1, mz + 30, 0, 0, 0, 110, 1.1, 0.3), 0xc4bfb6, { planar: 4 });
    B.concrete.add(PRIM.box, mat(mx, lv * 3.2 + 1.1, mz - 30, 0, 0, 0, 110, 1.1, 0.3), 0xc4bfb6, { planar: 4 });
    for (let x = -50; x <= 50; x += 10) B.lampCool.add(PRIM.box, mat(mx + x, lv * 3.2 + 3.0, mz, 0, 0, 0, 1.2, 0.05, 0.2), 0xffffff);
  }
  B.concrete.add(PRIM.box, mat(mx, 13.1, mz, 0, 0, 0, 110, 0.5, 60), 0xb9b4ab, { planar: 4 });
  for (let x = -54; x <= 54; x += 12) for (const z of [-29, 29]) B.concrete.add(PRIM.box, mat(mx + x, 6.5, mz + z, 0, 0, 0, 0.6, 13, 0.6), 0xbdb8af);
  out.parkingDeck = { x: mx, z: mz, levels: 4 };
  void detail; void rnd; void L;
}

// --------------------------------------------------------------------------- perimeter fence
function buildFence(def, B) {
  const x0 = -2350, x1 = 2250, z0 = -930, z1 = 470;
  const edges = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 4);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      B.metal.add(PRIM.box, mat(x, 1.25, z, 0, 0, 0, 0.07, 2.5, 0.07), 0x8c9194);
    }
    // top rail + barbed wire arm
    const ang = Math.atan2(-(bz - az), bx - ax);
    B.metal.add(PRIM.box, mat((ax + bx) / 2, 2.45, (az + bz) / 2, 0, ang, 0, len, 0.05, 0.05), 0x8c9194);
    B.metal.add(PRIM.box, mat((ax + bx) / 2, 2.75, (az + bz) / 2, 0, ang, 0, len, 0.02, 0.02), 0x6c7174);
  }
}

/** Chain-link fence mesh (alpha texture), separate because it needs alphaTest. */
export function fenceMesh() {
  const [c, ctx] = makeCanvas(64, 64);
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(140,146,150,1)'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(64, 64); ctx.moveTo(64, 0); ctx.lineTo(0, 64); ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const x0 = -2350, x1 = 2250, z0 = -930, z1 = 470;
  const P = [], U = [], N = [], I = [];
  for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) {
    const k = P.length / 3, len = Math.hypot(bx - ax, bz - az);
    P.push(ax, 0, az, bx, 0, bz, bx, 2.4, bz, ax, 2.4, az);
    U.push(0, 0, len / 0.06 / 16, 0, len / 0.06 / 16, 2.4 / 0.06 / 16, 0, 2.4 / 0.06 / 16);
    const nx = (bz - az) / len, nz = -(bx - ax) / len;
    for (let q = 0; q < 4; q++) N.push(nx, 0, nz);
    I.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5, transparent: false });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'perimeter-fence';
  return mesh;
}

export { GATE_STAND_Z, TAXIWAY_A_Z };
