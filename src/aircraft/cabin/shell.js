// Static hull lining: floor (carpet + vinyl), dado with air-return grilles,
// sculpted sidewalls with window reveals, upper sidewall + PSU channel, bin
// housing, LED coves, vaulted ceiling, door openings, end caps, bulkheads,
// class-divider walls, the invisible light-blocking shell (shadow only) and the
// wall colliders.
import * as THREE from 'three';
import { DOORS, ZONES, WINDOWS, WINDOW, ROWS } from '../../core/constants.js';
import { smoothstep, clamp } from '../../core/util.js';
import { GeoBuilder, extrudeProfile, zList, addBox } from './geom.js';
import { RL, CY, PROF, R_BLOCK, arcX, arcPhi, vOfY, ceilingY, binOuterProfile, liningFrame } from './profile.js';
import { buildWindowTile, TILE_HZ, TILE_NTOP, TILE_NSIDE, V_BOT, V_TOP } from './windows.js';
import { bakeAt, bakeSidewall, bakeEntryWall, bakeCeiling } from './bake.js';

export const SHADOW_ONLY_LAYER = 7;
export const CABIN_Z0 = ZONES.businessFrontBulkheadZ;        // -12.5 start of the bin/PSU zone
export const CABIN_Z1 = 10.55;                                // end of the bin/PSU zone (aft lavs start)
const Z_FWD = ZONES.flightDeckDoorZ;                          // -16.0
const Z_AFT = ZONES.aftBulkheadZ;                             // 14.05
const DOOR_MARGIN = 0.02;
export const COCKPIT_DOOR = { halfWidth: 0.36, height: 1.93 };

export function doorHole(id) {
  const d = DOORS[id];
  return { side: d.side, z0: d.z - d.width / 2 - DOOR_MARGIN, z1: d.z + d.width / 2 + DOOR_MARGIN, top: d.height + 0.03, id };
}
const DOOR_IDS = ['L1', 'R1', 'L2', 'R2'];

/** Upper sidewall + PSU channel + inboard rail profile (right side, cabin zone). */
function upperProfile() {
  return [[arcX(PROF.arcY1), PROF.arcY1], [1.405, 1.49], [1.378, 1.525], [1.352, 1.553], [1.335, 1.572], [1.322, 1.585], [1.20, 1.585], [1.10, 1.585], [PROF.psuX0, 1.585], [PROF.psuX0 - 0.002, 1.60], [PROF.psuX0 - 0.002, 1.618]];
}
function housingProfile() {
  const pts = [[1.322, 1.60]];
  const r = 1.745;
  const pa = arcPhi(1.66, r), pb = arcPhi(2.098, r);
  for (let i = 0; i <= 8; i++) { const p = pa + (pb - pa) * i / 8; pts.push([r * Math.cos(p), CY + r * Math.sin(p)]); }
  return pts;
}
/** Cove profile (right side): lip, LED shelf, back wall, roof up to the ceiling edge roll. */
function coveProfile() {
  return [[PROF.coveLipX, 2.072], [PROF.coveLipX, 2.100], [0.70, 2.100], [0.775, 2.100], [0.775, 2.150], [0.72, 2.150], [0.668, 2.146], [0.657, 2.138], [PROF.ceilEdgeX, PROF.ceilEdgeY]];
}

export function createShell(app, M, tex, root) {
  const group = new THREE.Group();
  group.name = 'cabin-shell';
  root.add(group);
  const holes = DOOR_IDS.map(doorHole);
  const holesFor = (side) => holes.filter((h) => h.side === side);

  // ======================================================================= floors
  const carpet = new GeoBuilder('carpet'), vinyl = new GeoBuilder('vinyl'), metal = new GeoBuilder('threshold');
  const floorGrid = (b, x0, x1, z0, z1, scale) => {
    const nx = 10, nz = Math.max(2, Math.ceil((z1 - z0) / 0.5));
    b.grid(nx, nz, (i, j, o) => {
      const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
      o.p = [x, 0, z]; o.n = [0, 1, 0]; o.uv = [x / scale, -z / scale];
      o.bake = bakeAt(x, 0, z, 0, 1, 0);
    }, true);
  };
  const FW = 1.725;
  floorGrid(carpet, -FW, FW, CABIN_Z0 - 0.05, ZONES.aftLavs.zMin, 0.6);
  floorGrid(vinyl, -FW, FW, Z_FWD, CABIN_Z0 - 0.05, 0.5);
  floorGrid(vinyl, -FW, FW, ZONES.aftLavs.zMin, Z_AFT, 0.5);
  for (const z of [CABIN_Z0 - 0.05, ZONES.aftLavs.zMin]) addBox(metal, -1.62, -0.002, z - 0.022, 1.62, 0.004, z + 0.022, [0.25, 0.05, 0.9, 0], 0.2);
  const carpetMesh = new THREE.Mesh(carpet.build(), M.carpet);
  const vinylMesh = new THREE.Mesh(vinyl.build(), M.vinyl);
  const metalMesh = new THREE.Mesh(metal.build(), M.metal);
  for (const m of [carpetMesh, vinylMesh, metalMesh]) { m.receiveShadow = true; m.castShadow = true; group.add(m); }
  carpetMesh.name = 'cabin-carpet'; vinylMesh.name = 'cabin-vinyl'; metalMesh.name = 'cabin-thresholds';

  // ======================================================================= dado + sidewalls
  const dado = new GeoBuilder('dado');
  const side = new GeoBuilder('sidewall');       // window tiles + plain sidewall (right side, mirrored later)
  const upper = new GeoBuilder('upper');
  const housing = new GeoBuilder('housing');
  const lining = new GeoBuilder('lining');        // cove, entry arcs, end caps (both sides)
  const ledSide = new GeoBuilder('ledSide'), ledCove = new GeoBuilder('ledCove');

  // window tile z list (cabin zone) ---------------------------------------------------
  const winZ = [...new Set(WINDOWS.map((w) => w.z))].sort((a, b) => a - b);
  const hatchZ = new Set(WINDOWS.filter((w) => w.inHatch).map((w) => w.z));
  const tileZ0 = winZ[0] - TILE_HZ, tileZ1 = winZ[winZ.length - 1] + TILE_HZ;
  const tileZs = [];
  for (const z of winZ) for (let k = 0; k < TILE_NTOP; k++) tileZs.push(z - TILE_HZ + (2 * TILE_HZ) * k / TILE_NTOP);
  tileZs.push(tileZ1);
  const tailZs = zList(tileZ1, CABIN_Z1, 0.1);
  const headZs = zList(CABIN_Z0 - 0.002, tileZ0, 0.1);
  const cabinZs = [...headZs.slice(0, -1), ...tileZs, ...tailZs.slice(1)];

  // sidewall tiles
  const tile = buildWindowTile({ uOffset: 0 });
  const tileB = buildWindowTile({ uOffset: 0.5 });
  const sideV = Array.from({ length: TILE_NSIDE + 1 }, (_, i) => V_BOT + (V_TOP - V_BOT) * (i / TILE_NSIDE));
  const vHatch = vOfY(DOORS.OWL1.sillY);
  winZ.forEach((z, k) => {
    if (hatchZ.has(z)) {
      // lining below the hatch only (the hatch plug panel fills the rest, see windows.js)
      const vs = sideV.filter((v) => v < vHatch - 0.005).concat([vHatch]);
      const lp = [0, 0, 0, 0];
      side.grid(TILE_NTOP, vs.length - 1, (i, j, o) => {
        const zz = z - TILE_HZ + (2 * TILE_HZ) * i / TILE_NTOP, v = vs[j];
        const phi = arcPhi(WINDOW.centerY) + v / RL;
        o.p = [RL * Math.cos(phi), CY + RL * Math.sin(phi), zz]; o.n = [-Math.cos(phi), -Math.sin(phi), 0];
        o.uv = [(k % 2) * 0.5 + 0.5 * i / TILE_NTOP, (v - V_BOT) / (V_TOP - V_BOT)];
        o.bake = bakeSidewall(o.p[1]);
      });
      // hatch recess backing (dark) behind the plug panel gap
      return;
    }
    side.appendTranslated(k % 2 ? tileB : tile, 0, 0, z);
  });
  // plain sidewall strips before the first and after the last tile
  const plainArc = (b, zs, y0 = PROF.arcY0, y1 = PROF.arcY1, nPhi = TILE_NSIDE, bakeFn = bakeSidewall) => {
    const p0 = arcPhi(y0), p1 = arcPhi(y1);
    b.grid(zs.length - 1, nPhi, (i, j, o) => {
      const phi = p0 + (p1 - p0) * j / nPhi;
      o.p = [RL * Math.cos(phi), CY + RL * Math.sin(phi), zs[i]]; o.n = [-Math.cos(phi), -Math.sin(phi), 0];
      o.uv = [zs[i] / 1.016, (phi - p0) / (p1 - p0)];
      o.bake = bakeFn(o.p[1], 1);
    }, true);
  };
  plainArc(side, headZs);
  plainArc(side, tailZs);

  // dado (cabin zone, continuous) ------------------------------------------------------
  const dadoProf = [PROF.dadoBottom, [1.64, 0.10], [1.655, 0.2], [arcX(PROF.arcY0), PROF.arcY0]];
  const dadoBake = (x, y) => [0.08, 0.22 + 0.25 * y, 0.62 + 0.38 * smoothstep(0, 0.3, y), 0];
  const extrudeDado = (b, zs) => {
    const s = extrudeProfile(b, dadoProf, zs, { flip: true, normals: dadoProf.map(() => [-0.99, 0.1]), bake: (x, y) => dadoBake(x, y) });
    return s;
  };
  // the dado uses its own UV: u = z / 0.508 (one louvre panel per window bay), v = height
  const dadoUV = (b, start) => { for (let i = start; i < b.n; i++) { const y = b.pos[i * 3 + 1], z = b.pos[i * 3 + 2]; b.uv[i * 2] = (z - winZ[0] + TILE_HZ) / WINDOW.pitch; b.uv[i * 2 + 1] = y / PROF.arcY0; } };
  const dadoCabinR = new GeoBuilder(); extrudeDado(dadoCabinR, cabinZs); dadoUV(dadoCabinR, 0);

  // upper sidewall + PSU channel ---------------------------------------------------------
  const up = upperProfile();
  extrudeProfile(upper, up, cabinZs, {
    flip: true, uScale: 1 / 0.5, vScale: 1 / 0.5,
    bake: (x, y, z, nx, ny) => {
      if (y < 1.5) return [0.12, 1.2, 1, 0];
      if (ny < -0.7) return [0.05, 0.22, 0.8, 0];      // PSU channel, lit by bounce from the seats
      return [0.08, 0.6 * clamp(1.585 - y + 1, 0, 1), 0.9, 0];
    },
  });
  // housing behind the pivot bins (visible only when a bin is open)
  extrudeProfile(housing, housingProfile(), zList(CABIN_Z0, CABIN_Z1, 0.6), { flip: true, bake: [0.04, 0.02, 0.45, 0] });
  // sidewall LED wash strip, hidden under the PSU channel lip
  extrudeProfile(ledSide, [[1.334, 1.578], [1.326, 1.584]], zList(CABIN_Z0 + 0.05, CABIN_Z1 - 0.05, 2), { flip: true, bake: [0, 0, 1, 0] });

  // entry zones (forward & aft): dado + tall sidewall arc with door holes -------------------------
  const entryZones = [[Z_FWD, CABIN_Z0], [CABIN_Z1, Z_AFT]];
  const entryBuilders = { right: new GeoBuilder('entryR'), left: new GeoBuilder('entryL') };
  const nPhiEntry = 26;
  const pE0 = arcPhi(PROF.arcY0), pE1 = arcPhi(PROF.entryArcY1);
  for (const sideName of ['right', 'left']) {
    const s = sideName === 'left' ? -1 : 1;
    const b = entryBuilders[sideName];
    const dB = new GeoBuilder();
    for (const [za, zb] of entryZones) {
      const hs = holesFor(sideName).filter((h) => h.z1 > za && h.z0 < zb);
      // z breakpoints
      const zs = zList(za, zb, 0.12, hs.flatMap((h) => [h.z0, h.z1]));
      const phis = [];
      for (let j = 0; j <= nPhiEntry; j++) phis.push(pE0 + (pE1 - pE0) * j / nPhiEntry);
      for (const h of hs) phis.push(arcPhi(h.top));
      const ph = [...new Set(phis.map((p) => +p.toFixed(6)))].sort((a, b2) => a - b2);
      // quads in (z, phi) skipping the door holes
      const vid = new Map();
      const V = (i, j) => {
        const key = i * 1000 + j;
        if (vid.has(key)) return vid.get(key);
        const phi = ph[j], z = zs[i];
        const x = s * RL * Math.cos(phi), y = CY + RL * Math.sin(phi);
        const id = b.vert(x, y, z, -s * Math.cos(phi), -Math.sin(phi), 0, z / 1.016, (phi - pE0) / (pE1 - pE0), bakeEntryWall(y, 1));
        vid.set(key, id);
        return id;
      };
      for (let i = 0; i < zs.length - 1; i++) {
        const zc = (zs[i] + zs[i + 1]) / 2;
        for (let j = 0; j < ph.length - 1; j++) {
          const yc = CY + RL * Math.sin((ph[j] + ph[j + 1]) / 2);
          if (hs.some((h) => zc > h.z0 && zc < h.z1 && yc < h.top)) continue;
          const a = V(i, j), bb = V(i + 1, j), c = V(i + 1, j + 1), d = V(i, j + 1);
          if (s > 0) b.quad(a, d, c, bb); else b.quad(a, bb, c, d);
        }
      }
      // dado segments between door holes
      const cuts = [za, ...hs.flatMap((h) => [h.z0, h.z1]), zb];
      for (let k = 0; k < cuts.length - 1; k += 2) {
        const zs2 = zList(cuts[k], cuts[k + 1], 0.25);
        if (zs2.length < 2 || cuts[k + 1] - cuts[k] < 0.01) continue;
        const st = dB.n; extrudeDado(dB, zs2); dadoUV(dB, st);
      }
      // top ledge from the arc top to the cove lip
      const ledge = new GeoBuilder();
      extrudeProfile(ledge, [[arcX(PROF.entryArcY1), PROF.entryArcY1], [PROF.coveLipX, 2.072]], zList(za, zb, 0.5), { flip: true, bake: [0.25, 0, 0.9, 0] });
      if (s > 0) b.append(ledge); else b.appendMirroredX(ledge);
    }
    if (s > 0) dado.append(dB); else dado.appendMirroredX(dB);
  }

  // mirror the cabin-zone pieces to the left side
  const sideAll = new GeoBuilder('sidewallAll').append(side).appendMirroredX(side);
  const dadoAll = new GeoBuilder('dadoAll').append(dadoCabinR).appendMirroredX(dadoCabinR).append(dado);
  const upperAll = new GeoBuilder('upperAll').append(upper).appendMirroredX(upper);
  const housingAll = new GeoBuilder('housingAll').append(housing).appendMirroredX(housing);
  const ledSideAll = new GeoBuilder().append(ledSide).appendMirroredX(ledSide);

  // ======================================================================= cove + ceiling (full length)
  const fullZs = zList(Z_FWD, Z_AFT, 0.5);
  const cove = new GeoBuilder('cove');
  extrudeProfile(cove, coveProfile(), fullZs, {
    flip: true,
    bake: (x, y, z, nx, ny) => {
      // glow: inner cove surfaces are lit directly by the LED strip
      if (y >= 2.149) return [0.3, 0, 1, 1.0];
      if (x >= 0.774) return [0.3, 0, 1, 0.55];
      if (y > 2.099 && ny > 0.5) return [0.3, 0, 1, 0.3];
      return [0.2, 0.02, 0.85, 0.08];
    },
  });
  extrudeProfile(ledCove, [[0.712, 2.1005], [0.742, 2.1005]], zList(Z_FWD + 0.02, Z_AFT - 0.02, 3), { flip: true, bake: [0, 0, 1, 0] });
  const coveAll = new GeoBuilder().append(cove).appendMirroredX(cove);
  const ledCoveAll = new GeoBuilder().append(ledCove).appendMirroredX(ledCove);
  // ceiling vault
  const ceil = new GeoBuilder('ceiling');
  const nx = 28;
  const cZs = zList(Z_FWD, Z_AFT, 0.25);
  ceil.grid(nx, cZs.length - 1, (i, j, o) => {
    const x = -PROF.ceilEdgeX + (2 * PROF.ceilEdgeX) * i / nx, z = cZs[j];
    const y = ceilingY(x);
    const dx = 0.01, dy = (ceilingY(x + dx) - ceilingY(x - dx)) / (2 * dx);
    o.p = [x, y, z]; o.n = [dy, -1, 0]; o.uv = [i / nx, (z - Z_FWD) / 1.524];
    o.bake = bakeCeiling(Math.abs(x));
  });

  // ======================================================================= bin-zone end caps
  const capR = (zc, facing) => {
    const ent = [];
    const pa = arcPhi(PROF.arcY1), pb = arcPhi(PROF.entryArcY1);
    for (let i = 0; i <= 10; i++) { const p = pa + (pb - pa) * i / 10; ent.push([RL * Math.cos(p), CY + RL * Math.sin(p)]); }
    const face = binOuterProfile().slice(0, 21); // face + lip
    const poly = [...ent, [PROF.coveLipX, 2.072], ...face, [PROF.psuX0 - 0.002, 1.60], [PROF.psuX0, 1.585], [1.322, 1.585], [1.352, 1.553], [1.405, 1.49]];
    const contour = poly.map(([x, y]) => new THREE.Vector2(x, y));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const b = new GeoBuilder();
    const base = b.n;
    for (const p of poly) b.vert(p[0], p[1], zc, 0, 0, facing, p[0] * 2, p[1] * 2, [0.15, 0.25, 0.8, 0]);
    for (const t of tris) { if (facing > 0) b.tri(base + t[0], base + t[1], base + t[2]); else b.tri(base + t[0], base + t[2], base + t[1]); }
    // ensure the winding faces `facing`: check first tri normal
    return b;
  };
  for (const [zc, f] of [[CABIN_Z0, -1], [CABIN_Z1, 1]]) {
    const b = capR(zc, f);
    lining.append(fixWinding(b, [0, 0, f])).appendMirroredX(fixWinding(b, [0, 0, f]));
  }

  // ======================================================================= meshes
  const add = (b, mat, name, shadow = true) => {
    if (b.empty) return null;
    const m = new THREE.Mesh(b.build(), mat);
    m.name = name; m.castShadow = shadow; m.receiveShadow = true;
    group.add(m);
    return m;
  };
  add(sideAll, M.sidewall, 'cabin-sidewalls');
  add(new GeoBuilder().append(entryBuilders.right).append(entryBuilders.left), M.sidewall, 'cabin-entry-walls');
  add(dadoAll, M.dado, 'cabin-dado');
  add(upperAll, M.lining, 'cabin-upper-sidewall');
  add(housingAll, M.housing, 'cabin-bin-housing');
  add(coveAll, M.lining, 'cabin-cove');
  add(lining, M.lining, 'cabin-lining-caps');
  add(ceil, M.ceiling, 'cabin-ceiling');
  const ledC = add(ledCoveAll, M.led, 'cabin-led-cove', false);
  const ledS = add(ledSideAll, M.ledSide, 'cabin-led-sidewall', false);
  if (ledC) ledC.receiveShadow = false;
  if (ledS) ledS.receiveShadow = false;

  // ======================================================================= bulkheads
  const bulk = createBulkheads(app, M, tex, group);

  // ======================================================================= light blocker (shadow only)
  const blocker = buildBlocker(holes);
  const blockerMesh = new THREE.Mesh(blocker.build(), M.blocker);
  blockerMesh.name = 'cabin-light-blocker';
  blockerMesh.castShadow = true; blockerMesh.receiveShadow = false;
  blockerMesh.layers.set(SHADOW_ONLY_LAYER);
  blockerMesh.frustumCulled = false;
  group.add(blockerMesh);
  const sc = app.lights?.sunCabin;
  if (sc) sc.shadow.camera.layers.enable(SHADOW_ONLY_LAYER);   // shadow pass also renders layer 7 (layer 0 stays enabled)

  // cabin bounds for the cabin sun shadow fit
  app.cabinBounds?.set?.(new THREE.Vector3(-1.84, -0.08, Z_FWD - 0.3), new THREE.Vector3(1.84, 2.4, Z_AFT + 0.12));

  // ======================================================================= colliders
  addColliders(app);

  return { group, blocker: blockerMesh, ledCove: ledC, ledSide: ledS, bulkheads: bulk };
}

/** Flip triangle winding of a builder so that the first triangle's normal agrees with dir. */
function fixWinding(b, dir) {
  if (b.idx.length < 3) return b;
  const [i0, i1, i2] = b.idx;
  const p = (i) => [b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]];
  const a = p(i0), c1 = p(i1), c2 = p(i2);
  const u = [c1[0] - a[0], c1[1] - a[1], c1[2] - a[2]], v = [c2[0] - a[0], c2[1] - a[1], c2[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0) {
    for (let i = 0; i < b.idx.length; i += 3) { const t = b.idx[i + 1]; b.idx[i + 1] = b.idx[i + 2]; b.idx[i + 2] = t; }
  }
  return b;
}

/** Extruded polygon wall (x/y polygon, thickness along z) into a builder with planar UVs. */
function wallFromPolygon(b, poly, z0, z1, uvScale = 1, bakeFn = null, holes = []) {
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: 8 });
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
  b.addGeometry(g, new THREE.Matrix4().makeTranslation(0, 0, z0), bakeFn || ((x, y, z, nx, ny, nz) => bakeAt(x, y, z, nx, ny, nz)));
  g.dispose();
}

function createBulkheads(app, M, tex, group) {
  const bh = new GeoBuilder('bulkheads');
  const trim = new GeoBuilder('bulkTrim');
  const plac = new GeoBuilder('bulkPlacards');
  const dark = new GeoBuilder('bulkDark');
  const bake = (x, y, z, nx, ny, nz) => {
    const ax = Math.abs(x);
    const cw = 0.2 + 0.25 * smoothstep(0.3, 2.0, y);
    const ao = 0.75 + 0.25 * smoothstep(0.0, 0.35, y) - 0.1 * smoothstep(1.35, 1.65, ax);
    return [cw, 0.05, ao, 0];
  };
  // --- business front bulkhead (z = -12.5), each side from the aisle edge to the lining
  const Zb = ZONES.businessFrontBulkheadZ;
  const sideOutline = (xIn, yTop, s) => {
    const pts = [[xIn, 0], [PROF.dadoBottom[0], 0], [arcX(PROF.arcY0), PROF.arcY0]];
    for (let i = 1; i <= 10; i++) { const y = PROF.arcY0 + (PROF.arcY1 - PROF.arcY0) * i / 10; pts.push([arcX(y), y]); }
    pts.push([1.352, 1.553], [1.322, 1.585], [PROF.psuX0, 1.585], [0.80, yTop], [xIn + 0.04, yTop], [xIn, yTop - 0.04]);
    return pts.map(([x, y]) => [x * s, y]);
  };
  const ccw = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a > 0 ? p : p.slice().reverse(); };
  for (const s of [1, -1]) {
    wallFromPolygon(bh, ccw(sideOutline(0.45, 1.595, s)), Zb - 0.03, Zb + 0.03, 0.9, bake);
    // aluminium edge trim on the aisle edge
    addBox(trim, s > 0 ? 0.438 : -0.462, 0.0, Zb - 0.034, s > 0 ? 0.462 : -0.438, 1.56, Zb + 0.034, [0.2, 0.05, 0.9, 0]);
  }
  // --- class divider (z = -8.32): partial-height walls with a rounded top rail
  const Zd = ZONES.classDividerZ;
  const divTop = 1.22;
  for (const s of [1, -1]) {
    const pts = [[0.42, 0], [PROF.dadoBottom[0], 0], [arcX(PROF.arcY0), PROF.arcY0]];
    for (let i = 1; i <= 8; i++) { const y = PROF.arcY0 + (divTop - PROF.arcY0) * i / 8; pts.push([arcX(y) - 0.003, y]); }
    pts.push([0.42, divTop]);
    wallFromPolygon(bh, ccw(pts.map(([x, y]) => [x * s, y])), Zd - 0.025, Zd + 0.025, 0.9, bake);
    // top rail (rounded aluminium cap)
    const len = arcX(divTop) - 0.42;
    const rail = new THREE.CylinderGeometry(0.03, 0.03, len, 12, 1).rotateZ(Math.PI / 2);
    trim.addGeometry(rail, new THREE.Matrix4().makeTranslation(s * (0.42 + len / 2), divTop, Zd), [0.3, 0.1, 1, 0]);
    addBox(trim, s > 0 ? 0.405 : -0.435, 0, Zd - 0.03, s > 0 ? 0.435 : -0.405, divTop, Zd + 0.03, [0.2, 0.05, 0.9, 0]);
  }
  // --- forward bulkhead (cockpit wall) with door notch, and the aft bulkhead
  const R = 1.79;
  const bulkOutline = (notch) => {
    const pts = [];
    const p0 = arcPhi(0, R), p1 = Math.PI - p0;
    if (notch) {
      pts.push([COCKPIT_DOOR.halfWidth, 0]);
    }
    for (let i = 0; i <= 40; i++) { const p = p0 + (p1 - p0) * i / 40; pts.push([R * Math.cos(p), CY + R * Math.sin(p)]); }
    if (notch) pts.push([-COCKPIT_DOOR.halfWidth, 0], [-COCKPIT_DOOR.halfWidth, COCKPIT_DOOR.height], [COCKPIT_DOOR.halfWidth, COCKPIT_DOOR.height]);
    return pts;
  };
  const fwd = ccw(bulkOutline(true));
  wallFromPolygon(bh, fwd, ZONES.flightDeckDoorZ - 0.04, ZONES.flightDeckDoorZ, 0.9, bake);
  wallFromPolygon(bh, ccw(bulkOutline(false)), ZONES.aftBulkheadZ, ZONES.aftBulkheadZ + 0.04, 0.9, bake);
  // cockpit door surround trim + dark vestibule behind the opening (fallback if no door leaf)
  const hw = COCKPIT_DOOR.halfWidth, dh = COCKPIT_DOOR.height, zf = ZONES.flightDeckDoorZ;
  addBox(trim, -hw - 0.05, 0, zf - 0.01, -hw, dh + 0.05, zf + 0.012, [0.2, 0.05, 0.85, 0]);
  addBox(trim, hw, 0, zf - 0.01, hw + 0.05, dh + 0.05, zf + 0.012, [0.2, 0.05, 0.85, 0]);
  addBox(trim, -hw - 0.05, dh, zf - 0.01, hw + 0.05, dh + 0.05, zf + 0.012, [0.25, 0.05, 0.85, 0]);
  addBox(dark, -hw, 0, zf - 0.32, hw, dh, zf - 0.30, [0.02, 0, 0.3, 0]);           // back wall
  addBox(dark, -hw - 0.02, 0, zf - 0.32, -hw, dh, zf - 0.04, [0.02, 0, 0.3, 0]);
  addBox(dark, hw, 0, zf - 0.32, hw + 0.02, dh, zf - 0.04, [0.02, 0, 0.3, 0]);
  addBox(dark, -hw, dh, zf - 0.32, hw, dh + 0.02, zf - 0.04, [0.02, 0, 0.3, 0]);
  addBox(dark, -hw, -0.01, zf - 0.32, hw, 0.0, zf - 0.04, [0.02, 0, 0.3, 0]);
  // --- placards: airline logo panel on the row-1 side of the front bulkhead (right), FAP + handset on the entry side (left)
  const uvr = (r) => (u, v) => [r[0] + (r[2] - r[0]) * u, r[1] + (r[3] - r[1]) * v];
  plac.addGeometry(new THREE.PlaneGeometry(0.62, 0.31), new THREE.Matrix4().makeTranslation(0.98, 1.2, Zb + 0.031), [0.3, 0.1, 1, 0], uvr(tex.placardRect('logo')));
  plac.addGeometry(new THREE.PlaneGeometry(0.62, 0.31), new THREE.Matrix4().makeTranslation(-0.98, 1.2, Zb + 0.031), [0.3, 0.1, 1, 0], uvr(tex.placardRect('logo')));
  plac.addGeometry(new THREE.PlaneGeometry(0.36, 0.24).rotateY(Math.PI), new THREE.Matrix4().makeTranslation(-0.95, 1.38, Zb - 0.031), [0.3, 0.1, 1, 0], uvr(tex.placardRect('fap')));
  plac.addGeometry(new THREE.PlaneGeometry(0.2, 0.05).rotateY(Math.PI), new THREE.Matrix4().makeTranslation(-0.95, 1.2, Zb - 0.031), [0.3, 0.1, 1, 0], uvr(tex.placardRect('handset')));
  // handset cradle + handset (dark plastic) on the entry side
  addBox(dark, -1.03, 0.98, Zb - 0.07, -0.87, 1.16, Zb - 0.03, [0.2, 0.05, 0.85, 0]);
  const hs = new THREE.CapsuleGeometry(0.022, 0.13, 4, 10);
  dark.addGeometry(hs, new THREE.Matrix4().makeTranslation(-0.95, 1.07, Zb - 0.09), [0.2, 0.05, 0.9, 0]);
  plac.addGeometry(new THREE.PlaneGeometry(0.24, 0.06), new THREE.Matrix4().makeTranslation(0.98, 0.98, Zb + 0.031), [0.3, 0.1, 1, 0], uvr(tex.placardRect('lifevest')));

  const meshes = [];
  for (const [b, mat, name, shadow] of [[bh, M.bulkhead, 'cabin-bulkheads', true], [trim, M.metal, 'cabin-bulkhead-trim', true], [plac, M.placard, 'cabin-bulkhead-placards', false], [dark, M.darkPlastic, 'cabin-bulkhead-dark', true]]) {
    if (b.empty) continue;
    const m = new THREE.Mesh(b.build(), mat);
    m.name = name; m.castShadow = shadow; m.receiveShadow = true;
    group.add(m); meshes.push(m);
  }
  return meshes;
}

/** Invisible cylinder (r = 1.80) with window & door holes: makes the hull light-tight for the cabin sun. */
function buildBlocker(holes) {
  const b = new GeoBuilder('blocker');
  b.defaultBake = [0, 0, 1, 0];
  const R = R_BLOCK;
  const z0 = ZONES.flightDeckDoorZ - 0.05, z1 = ZONES.aftBulkheadZ + 0.05;
  const pBot = arcPhi(-0.05, R);
  // window hole half extents on the blocker
  const wHz = 0.165, wy0 = WINDOW.centerY - 0.225, wy1 = WINDOW.centerY + 0.225;
  const zb = new Set([z0, z1]);
  for (let z = z0; z < z1; z += 0.6) zb.add(+z.toFixed(4));
  const wz = [...new Set(WINDOWS.map((w) => w.z))];
  for (const z of wz) { zb.add(z - wHz); zb.add(z + wHz); }
  for (const h of holes) { zb.add(h.z0); zb.add(h.z1); }
  const zs = [...zb].filter((z) => z >= z0 && z <= z1).sort((a, c) => a - c);
  // angles from the right side bottom (pBot) over the top to the left side bottom (PI - pBot)
  const ph = new Set();
  for (let i = 0; i <= 48; i++) ph.add(+(pBot + (Math.PI - 2 * pBot) * i / 48).toFixed(6));
  for (const y of [wy0, wy1, ...holes.map((h) => h.top)]) { const p = arcPhi(y, R); ph.add(+p.toFixed(6)); ph.add(+(Math.PI - p).toFixed(6)); }
  const phis = [...ph].filter((p) => p >= pBot - 1e-6 && p <= Math.PI - pBot + 1e-6).sort((a, c) => a - c);
  const inHole = (zc, pc) => {
    const x = R * Math.cos(pc), y = CY + R * Math.sin(pc);
    const sideName = x > 0 ? 'right' : 'left';
    if (y > wy0 && y < wy1 && wz.some((z) => Math.abs(zc - z) < wHz)) return true;
    return holes.some((h) => h.side === sideName && zc > h.z0 && zc < h.z1 && y < h.top);
  };
  const vmap = new Map();
  const V = (i, j) => {
    const k = i * 10000 + j;
    if (vmap.has(k)) return vmap.get(k);
    const p = phis[j];
    const id = b.vert(R * Math.cos(p), CY + R * Math.sin(p), zs[i], -Math.cos(p), -Math.sin(p), 0, 0, 0);
    vmap.set(k, id);
    return id;
  };
  for (let i = 0; i < zs.length - 1; i++) {
    const zc = (zs[i] + zs[i + 1]) / 2;
    for (let j = 0; j < phis.length - 1; j++) {
      const pc = (phis[j] + phis[j + 1]) / 2;
      if (inHole(zc, pc)) continue;
      b.quad(V(i, j), V(i, j + 1), V(i + 1, j + 1), V(i + 1, j));
    }
  }
  return b;
}

function addColliders(app) {
  const C = app.colliders;
  if (!C?.addBox) return;
  const zf = ZONES.flightDeckDoorZ, za = ZONES.aftBulkheadZ;
  // sidewalls (the lining is ~1.62-1.69 out at standing heights; seats keep the player off the window line)
  C.addBox([1.56, 0, zf - 0.5], [2.4, 2.6, za + 0.5], { tag: 'cabin-wall' });
  C.addBox([-2.4, 0, zf - 0.5], [-1.56, 2.6, za + 0.5], { tag: 'cabin-wall' });
  // forward bulkhead either side of the cockpit door, and behind the vestibule
  const hw = COCKPIT_DOOR.halfWidth;
  C.addBox([-2.4, 0, zf - 0.5], [-hw, 2.6, zf], { tag: 'cabin-fwd-bulkhead' });
  C.addBox([hw, 0, zf - 0.5], [2.4, 2.6, zf], { tag: 'cabin-fwd-bulkhead' });
  C.addBox([-hw, 0, zf - 0.6], [hw, 2.6, zf - 0.3], { tag: 'cabin-vestibule' });
  // aft bulkhead
  C.addBox([-2.4, 0, za], [2.4, 2.6, za + 0.5], { tag: 'cabin-aft-bulkhead' });
  // business front bulkhead (leave the aisle |x| < 0.45 open)
  const zb = ZONES.businessFrontBulkheadZ;
  C.addBox([0.44, 0, zb - 0.035], [1.7, 2.0, zb + 0.035], { tag: 'cabin-bulkhead' });
  C.addBox([-1.7, 0, zb - 0.035], [-0.44, 2.0, zb + 0.035], { tag: 'cabin-bulkhead' });
  // class divider walls
  const zd = ZONES.classDividerZ;
  C.addBox([0.405, 0, zd - 0.035], [1.7, 1.25, zd + 0.035], { tag: 'cabin-divider' });
  C.addBox([-1.7, 0, zd - 0.035], [-0.405, 1.25, zd + 0.035], { tag: 'cabin-divider' });
}
