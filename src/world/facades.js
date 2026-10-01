// Builds the voxel masonry for every facade in the layout. Fine brick detail
// (mortar, chips, spalling) is added by the facade shader; this file deals
// with course-scale geometry: wall slabs, openings and their reveals, sills,
// lintels, belt courses, corbelled cornices, copings, damage and patches.
//
// It also records "fixtures" (windows, doors, roll-up doors, ...) with their
// world transforms so the prop system can fill the openings.
import * as THREE from 'three';
import { VoxelGrid, Palette } from '../voxel/VoxelGrid.js';
import { greedyMesh } from '../voxel/mesher.js';
import { RNG } from '../core/rng.js';
import { fbm2, valueNoise2 } from '../core/noise.js';
import { CV } from './units.js';
import { FACADES, FACE_CODE, facadeMatrix, facadeToWorld } from './layout.js';

export const FCLS = {
  BRICK: 20,
  SOLDIER: 21,
  ROWLOCK: 22,
  CMU: 23,
  PARGE: 24,
  STONE: 25,
  TILE: 26,
  STEEL: 27,
  CONCRETE: 28,
  GLASSBLOCK: 29,
  PAINTED: 30,
  WOOD: 31,
  SPALL: 32,
  PATCH: 33,
};

const PROT = 6; // CV layers available in front of the wall plane for protrusions

function makePalette(f, rng) {
  const P = new Palette();
  P.add('brick', { color: [128, 128, 128], rough: 0.9, cls: FCLS.BRICK, vari: 0 });
  P.add('soldier', { color: [128, 128, 128], rough: 0.9, cls: FCLS.SOLDIER, vari: 0 });
  P.add('rowlock', { color: [128, 128, 128], rough: 0.9, cls: FCLS.ROWLOCK, vari: 0 });
  P.add('spall', { color: [128, 128, 128], rough: 0.95, cls: FCLS.SPALL, vari: 0 });
  P.add('cmu', { color: [132, 130, 124], rough: 0.92, cls: FCLS.CMU, vari: 0.06 });
  P.add('parge', { color: [118, 116, 110], rough: 0.92, cls: FCLS.PARGE, vari: 0.05 });
  P.add('stone', { color: [146, 140, 128], rough: 0.8, cls: FCLS.STONE, vari: 0.08 });
  P.add('tile', { color: [118, 66, 50], rough: 0.5, cls: FCLS.TILE, vari: 0.1 });
  P.add('steel', { color: [44, 40, 37], rough: 0.65, metal: 0.55, cls: FCLS.STEEL, vari: 0.1 });
  P.add('concrete', { color: [122, 120, 114], rough: 0.92, cls: FCLS.CONCRETE, vari: 0.06 });
  P.add('glassblock', { color: [176, 190, 194], rough: 0.12, cls: FCLS.GLASSBLOCK, vari: 0.02 });
  P.add('wood', { color: [84, 70, 58], rough: 0.85, cls: FCLS.WOOD, vari: 0.08 });
  // replacement bricks from a different batch (scheme index carried in red channel)
  const alt = (f.scheme + 1 + rng.int(0, 3)) % 6;
  P.add('patch', { color: [alt, 0, 0], rough: 0.9, cls: FCLS.PATCH, vari: 0 });
  return P;
}

/** Irregular blob mask used for damage / buff-like patches. */
function blobMask(rng, w, h) {
  const seed = rng.int(0, 99999);
  return (x, y) => {
    const nx = x / Math.max(1, w), ny = y / Math.max(1, h);
    const dx = (nx - 0.5) * 2, dy = (ny - 0.5) * 2;
    const r = Math.sqrt(dx * dx + dy * dy);
    const n = fbm2(nx * 3.1, ny * 3.1, 3, seed);
    return r < 0.55 + 0.6 * n;
  };
}

export function buildFacades(opts = {}) {
  const facades = opts.facades ?? FACADES;
  const results = [];
  const fixtures = []; // {kind, facade, u, y, w, h, depth, world matrix, ...}
  const glass = []; // window glass panes for the glass/interior shader
  let facIndex = 0;

  for (const f of facades) {
    const rng = new RNG(f.seed ?? facIndex * 977 + 13);
    const P = makePalette(f, rng);
    const M = {
      brick: P.get('brick'), soldier: P.get('soldier'), rowlock: P.get('rowlock'), spall: P.get('spall'),
      cmu: P.get('cmu'), parge: P.get('parge'), stone: P.get('stone'), tile: P.get('tile'), steel: P.get('steel'),
      concrete: P.get('concrete'), glassblock: P.get('glassblock'), wood: P.get('wood'), patch: P.get('patch'),
    };
    const base = f.base ?? 0;
    const nx = Math.ceil(f.width / CV);
    const ny = Math.ceil((f.height - base) / CV);
    const kFront = Math.max(3, Math.round((f.wallDepth ?? 0.55) / CV));
    const nz = kFront + PROT;
    const g = new VoxelGrid(nx, ny, nz);
    const U = (m) => Math.round(m / CV); // meters along u -> voxel index
    const Y = (m) => Math.round((m - base) / CV); // meters (absolute) -> voxel row

    // wall body
    g.box(0, 0, 0, nx, ny, kFront, M.brick);

    // ── parapet coping + cornice ──
    const top = ny;
    if (f.coping === 'tile') {
      g.box(0, top - 2, kFront, nx, top, kFront + 1, M.tile);
      g.box(0, top - 2, 0, nx, top, kFront, M.tile);
    } else if (f.coping === 'stone') {
      g.box(0, top - 2, 0, nx, top, kFront + 1, M.stone);
    } else {
      g.box(0, top - 1, kFront, nx, top, kFront + 1, M.rowlock);
    }
    if (f.cornice === 'corbel') {
      // stepped corbel table: three courses stepping out, plus a dentil row
      const c0 = top - 3;
      g.box(0, c0 - 1, kFront, nx, c0, kFront + 1, M.brick);
      g.box(0, c0 - 2, kFront, nx, c0 - 1, kFront + 1, M.rowlock);
      for (let x = 0; x < nx; x += 4) g.box(x, c0 - 4, kFront, x + 2, c0 - 2, kFront + 1, M.brick);
      g.box(0, c0 - 5, kFront, nx, c0 - 4, kFront + 1, M.soldier);
    }

    // ── belt courses ──
    for (const by of f.belts ?? []) {
      const r = Y(by);
      g.box(0, r, kFront, nx, r + 1, kFront + 1, M.rowlock);
    }

    // ── patches (parging, painted brick, replacement brick) ──
    for (const p of f.patches ?? []) {
      const x0 = U(p.u), x1 = U(p.u + p.w), y0 = Y(p.y), y1 = Y(p.y + p.h);
      const mask = blobMask(rng, x1 - x0, y1 - y0);
      let mat = M.patch;
      if (p.kind === 'parge') mat = M.parge;
      else if (p.kind === 'paint') mat = P.add(`painted${p.color.join('_')}`, { color: p.color, rough: 0.8, cls: FCLS.PAINTED, vari: 0 });
      else if (p.kind === 'grease') continue; // handled in the grime map
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const edgeSoft = p.kind === 'paint' ? (x - x0 > 1 && x1 - x > 1 ? true : rng.chance(0.6)) : mask(x - x0, y - y0);
          if (edgeSoft && g.get(x, y, kFront - 1) === M.brick) g.set(x, y, kFront - 1, mat);
        }
    }

    // ── openings ──
    const openings = [];
    for (const o of f.ground ?? []) openings.push({ ...o, floor: 0 });
    if (!f.blank && f.bays && f.upper) {
      for (const fl of f.upper) {
        const fy = f.floors[fl];
        f.bays.forEach((cx, bi) => {
          const key = `${fl}:${bi}`;
          const ov = f.windowOverrides?.[key] ?? {};
          const w = ov.w ?? f.win.w;
          const h = ov.h ?? f.win.h;
          const sill = ov.sill ?? f.win.sill;
          openings.push({
            type: ov.type === 'bricked' ? 'bricked' : 'window',
            sub: ov.type ?? f.win.type ?? 'dh',
            u: cx - w / 2, y: fy + sill, w, h, floor: fl, bay: bi,
            lit: (f.lit ?? []).includes(key), ac: (f.ac ?? []).includes(key),
            infill: ov.type === 'bricked' ? (rng.chance(0.5) ? 'brick' : 'cmu') : undefined,
          });
        });
      }
    }
    for (const o of f.sideWindows ?? []) openings.push({ type: 'window', sub: 'small', ...o, floor: 1 });

    for (const o of openings) {
      const x0 = U(o.u), x1 = U(o.u + o.w);
      const y0 = Y(o.y ?? 0), y1 = Y((o.y ?? 0) + o.h);
      if (x1 <= 0 || x0 >= nx || y1 <= 0 || y0 >= ny) continue;
      const t = o.type;
      if (t === 'window' || t === 'bricked' || t === 'glassblock') {
        const recess = t === 'glassblock' ? 2 : t === 'bricked' ? 1 : 3;
        g.box(x0, y0, kFront - recess, x1, y1, kFront, 0);
        // sill
        const sillMat = rng.chance(0.55) ? M.stone : M.rowlock;
        g.box(x0 - 1, y0 - 1, kFront - recess, x1 + 1, y0, kFront + 1, sillMat);
        // lintel
        const lt = f.lintel ?? rng.pick(['soldier', 'soldier', 'steel', 'stone']);
        if (lt === 'soldier') g.box(x0 - 1, y1, kFront - 1, x1 + 1, y1 + 3, kFront, M.soldier);
        else if (lt === 'stone') g.box(x0 - 1, y1, kFront - 1, x1 + 1, y1 + 2, kFront, M.stone);
        else g.box(x0 - 1, y1, kFront - 1, x1 + 1, y1 + 1, kFront + (rng.chance(0.5) ? 1 : 0), M.steel);
        if (t === 'glassblock') g.box(x0, y0, kFront - 2, x1, y1, kFront - 1, M.glassblock);
        if (t === 'bricked') g.box(x0, y0, kFront - 2, x1, y1, kFront - 1, o.infill === 'cmu' ? M.cmu : M.patch);
        if (t === 'window') {
          fixtures.push(makeFixture(f, 'window', o, { recess: recess * CV, rng }));
        } else if (t === 'glassblock') {
          fixtures.push(makeFixture(f, 'glassblock', o, { recess: 2 * CV, rng }));
        }
      } else if (t === 'door') {
        const recess = 3;
        g.box(x0, 0, kFront - recess, x1, y1, kFront, 0);
        g.box(x0 - 1, y1, kFront - recess, x1 + 1, y1 + 1, kFront + 1, M.steel);
        if (o.style !== 'kitchen' && rng.chance(0.5)) g.box(x0 - 1, y1 + 1, kFront - 1, x1 + 1, y1 + 4, kFront, M.soldier);
        fixtures.push(makeFixture(f, 'door', o, { recess: recess * CV, rng }));
      } else if (t === 'rollup' || t === 'garage' || t === 'storefront') {
        const recess = t === 'storefront' ? 3 : 4;
        g.box(x0, 0, kFront - recess, x1, y1, kFront, 0);
        g.box(x0 - 2, y1, kFront - recess, x1 + 2, y1 + 2, kFront + 1, M.steel);
        // side piers of concrete at roll-up doors
        if (t === 'rollup') {
          g.box(x0 - 3, 0, kFront, x0, Y(1.2), kFront + 1, M.concrete);
          g.box(x1, 0, kFront, x1 + 3, Y(1.2), kFront + 1, M.concrete);
        }
        fixtures.push(makeFixture(f, t, o, { recess: recess * CV, rng }));
      } else if (t === 'sliding') {
        g.box(x0, 0, kFront - 2, x1, y1, kFront, 0);
        g.box(x0 - 1, y1, kFront - 2, x1 + 1, y1 + 1, kFront, M.steel);
        fixtures.push(makeFixture(f, 'sliding', o, { recess: 2 * CV, rng }));
      } else if (t === 'recess') {
        const d = Math.round(o.depth / CV);
        const dk = kFront - d;
        // carve the void (ground floor only), leave the ceiling slab above
        g.box(x0, 0, dk, x1, y1, kFront + PROT, 0);
        // concrete soffit band
        g.box(x0, y1 - 1, dk, x1, y1, kFront, M.concrete);
        // steel beam across the front
        if (o.beam) g.box(x0 - 2, y1, kFront - 2, x1 + 2, y1 + 4, kFront + 1, M.steel);
        if (o.dock) {
          const dh = Y(o.dock);
          const dockEnd = x1 - U(1.4);
          g.box(x0, 0, dk, dockEnd, dh, kFront + 5, M.concrete);
          // steel edge angle
          g.box(x0, dh - 1, kFront + 5, dockEnd, dh, kFront + 6, M.steel);
          // three steps down at the end of the dock
          for (let s = 0; s < 3; s++) {
            const sh = Math.round((dh * (3 - s)) / 4);
            g.box(dockEnd, 0, dk, dockEnd + U(0.3) * (s + 1), sh, kFront - U(0.6), M.concrete);
          }
          fixtures.push(makeFixture(f, 'dock', o, { recess: o.depth, dockH: o.dock, dockEnd: dockEnd * CV, rng }));
        }
      }
    }

    // ── damage: spalled pits / missing bricks ──
    for (const dmg of f.damage ?? []) {
      const x0 = U(dmg.u), x1 = U(dmg.u + dmg.w), y0 = Y(dmg.y), y1 = Y(dmg.y + dmg.h);
      const mask = blobMask(rng, x1 - x0, y1 - y0);
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          if (!mask(x - x0, y - y0)) continue;
          if (g.get(x, y, kFront - 1) !== M.brick) continue;
          const depth = 1 + (valueNoise2(x * 0.7, y * 0.7, f.seed) > 0.55 ? 1 : 0);
          for (let k = 0; k < depth; k++) g.set(x, y, kFront - 1 - k, 0);
          g.set(x, y, kFront - 1 - depth, M.spall);
        }
    }

    // ── scattered missing/protruding single bricks for irregular silhouettes ──
    if (!f.backdrop) {
      const n = Math.round(nx * ny * 0.00035);
      for (let i = 0; i < n; i++) {
        const x = rng.int(0, nx - 4), y = rng.int(1, ny - 6);
        if (g.get(x, y, kFront - 1) !== M.brick || g.get(x + 2, y, kFront - 1) !== M.brick) continue;
        if (rng.chance(0.7)) {
          for (let k = 0; k < 3; k++) g.set(x + k, y, kFront - 1, M.spall);
        }
      }
    }

    // ── mesh ──
    const md = greedyMesh(g, P, {
      voxelSize: CV,
      origin: [0, base, -kFront * CV],
      skip: { nz: true },
      ao: true,
    });
    const geo = md.toGeometry();
    // vfac: orientation code, facade index, brick scheme, bond flags
    const vcount = geo.attributes.position.count;
    const vfac = new Uint8Array(vcount * 4);
    const bond = f.bond === 'common' ? 1 : 0;
    for (let i = 0; i < vcount; i++) {
      vfac[i * 4] = FACE_CODE[f.face];
      vfac[i * 4 + 1] = facIndex;
      vfac[i * 4 + 2] = f.scheme;
      vfac[i * 4 + 3] = bond;
    }
    geo.setAttribute('vfac', new THREE.BufferAttribute(vfac, 4, false));
    // vox for facades = local voxel coords; the shader converts to meters with base offset
    results.push({ facade: f, index: facIndex, geometry: geo, matrix: facadeMatrix(f), grid: g, kFront, base, quads: md.quadCount });
    facIndex++;
  }

  // glass panes from window fixtures
  for (const fx of fixtures) if (fx.kind === 'window' && !fx.boarded) glass.push(fx);

  return { results, fixtures, glass };
}

function makeFixture(f, kind, o, { recess, rng, ...extra }) {
  // local placement: bottom-left corner of the opening at the recess plane
  const u0 = o.u, y0 = o.y ?? 0;
  const center = facadeToWorld(f, u0 + o.w / 2, y0 + o.h / 2, -recess);
  return {
    kind,
    sub: o.sub ?? o.style ?? null,
    facade: f,
    face: f.face,
    u: u0,
    y: y0,
    w: o.w,
    h: o.h,
    recess,
    center,
    floor: o.floor ?? 0,
    bay: o.bay,
    lit: !!o.lit,
    ac: !!o.ac,
    bars: !!o.bars,
    stoop: !!o.stoop,
    steps: o.steps ?? 1,
    rail: !!o.rail,
    lamp: o.lamp ?? null,
    bollards: !!o.bollards,
    boarded: o.sub === 'boarded' || o.style === 'boarded',
    seed: rng.int(0, 1 << 30),
    backdrop: !!f.backdrop,
    ...extra,
  };
}
