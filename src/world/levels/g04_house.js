// A parametric house for the suburban levels of group 04 (9, 37, 79, 98).
// The house is a prop (gable / hip roof, windows, door, porch, garage, chimney) plus an inset
// "shell" brush: the brush carries the collision and keeps a plain silhouette in view beyond the
// distance at which the engine stops drawing props.
//
//   placeHouse(zb, x, z, rot, o)   (x, z) = middle of the facade on the ground, the front faces
//                                  (sin rot, -cos rot). o: see HOUSE_DEFAULTS.
import { defineProp, S, T, G, VF, face, tface, mul, plateOnProp, owns, M, FACE, only } from './g04_kit.js';

export const HOUSE_DEFAULTS = {
  w: 10, d: 8, fl: 2, h1: 2.7, h2: 2.5,
  wall: 'siding', wall2: null, found: 'concrete', roof: 'shingles', trim: 'plastic_white', brick: 'brick',
  kind: 'gable',          // gable | gableZ | hip | low
  pitch: 0.5, ov: 0.5, sov: 0.35,
  door: 'house_door', doorAt: 0.0, porch: 1, garage: 0, gw: 3.4, gdoor: 'garage_door',
  chimney: true, num: null, plate: true,
  winDark: 'window_dark', winLit: 'window_lit', wm: null, tint: [1, 1, 1],
  cols: 0, shutters: null,
};

// number of window slots (in the order the builder consumes `wm`)
export function houseSlots(o) {
  const cols = o.cols || Math.max(2, Math.round(o.w / 3.4)), ns = Math.max(1, Math.round(o.d / 4.2));
  const fl = o.fl ?? 2;
  return (cols - 1) + (fl === 2 ? cols : 0) + cols + (fl === 2 ? cols : 0) + 2 * ns * fl;
}

// a flat rectangle on a wall: centre (cx, cy), at depth c along the wall normal axis
function wallRect(mb, side, cx, cy, c, wd, ht, st) {
  const hw = wd / 2, hh = ht / 2;
  let tl, tr, br, bl, n;
  if (side === 'N') { n = [0, 0, -1]; tl = [cx + hw, cy + hh, c]; tr = [cx - hw, cy + hh, c]; br = [cx - hw, cy - hh, c]; bl = [cx + hw, cy - hh, c]; }
  else if (side === 'S') { n = [0, 0, 1]; tl = [cx - hw, cy + hh, c]; tr = [cx + hw, cy + hh, c]; br = [cx + hw, cy - hh, c]; bl = [cx - hw, cy - hh, c]; }
  else if (side === 'E') { n = [1, 0, 0]; tl = [c, cy + hh, cx + hw]; tr = [c, cy + hh, cx - hw]; br = [c, cy - hh, cx - hw]; bl = [c, cy - hh, cx + hw]; }
  else { n = [-1, 0, 0]; tl = [c, cy + hh, cx - hw]; tr = [c, cy + hh, cx + hw]; br = [c, cy - hh, cx + hw]; bl = [c, cy - hh, cx - hw]; }
  face(mb, tl, tr, br, bl, n, st, wd, ht);
}

defineProp('g04_house', {
  build(mb, p, r) {
    const o = { ...HOUSE_DEFAULTS, ...p.opts };
    const { w, d, fl, h1, h2 } = o;
    const H = fl === 2 ? h1 + h2 : h1;
    const tk = o.tint;
    // sunlight: o.sun = [x, z] unit vector toward the sun; walls facing it are brighter
    const rr = p.rot || 0, cs = Math.cos(rr), sn = Math.sin(rr);
    const shade = (lnx, lnz) => {
      if (!o.sun) return 1;
      const wx = cs * lnx - sn * lnz, wz = sn * lnx + cs * lnz;
      return 0.7 + 0.3 * Math.max(0, wx * o.sun[0] + wz * o.sun[1]);
    };
    const tint = (k) => [tk[0] * k, tk[1] * k, tk[2] * k];
    const wallAt = (name, lnx, lnz) => S(name, { tint: tint(shade(lnx, lnz)) });
    const wallSt = S(o.wall, { tint: tk });
    const wall2St = o.wall2 ? S(o.wall2, { tint: tk }) : wallSt;
    // one style per wall face: +x -x +z -z
    const faces = (name) => [wallAt(name, 1, 0), wallAt(name, -1, 0), null, null, wallAt(name, 0, 1), wallAt(name, 0, -1)];
    const roofSt = S(o.roof, { tint: [Math.min(1, tk[0] * 1.05), Math.min(1, tk[1] * 1.05), Math.min(1, tk[2] * 1.05)] });
    const trimSt = S(o.trim, { tint: tk });
    const foundSt = S(o.found, { tint: tk });
    const brickSt = S(o.brick, { tint: tk });
    // ---- walls (the first floor may differ from the upper one)
    if (o.wall2 && fl === 2) {
      mb.box(-w / 2, 0, 0, w / 2, h1, d, faces(o.wall), { sub: 2.5 });
      mb.box(-w / 2, h1, 0, w / 2, H, d, faces(o.wall2), { sub: 2.5 });
    } else mb.box(-w / 2, 0, 0, w / 2, H, d, faces(o.wall), { sub: 2.5 });
    mb.box(-w / 2 - 0.03, 0, -0.03, w / 2 + 0.03, 0.4, d + 0.03, foundSt, { skip: 8, sub: 3 });
    // belt course between floors
    if (fl === 2) mb.box(-w / 2 - 0.04, h1 - 0.08, -0.04, w / 2 + 0.04, h1 + 0.08, d + 0.04, trimSt, { sub: 4 });

    // ---- roof
    const ov = o.ov, sov = o.sov, kind = o.kind;
    const pitch = kind === 'low' ? 0.28 : o.pitch;
    const rsu = roofSt.su || 1.5;
    const card = (a, b, c, dd, hint) => {
      const rs = S(o.roof, { tint: tint(Math.min(1.1, 0.12 + shade(hint[0], hint[2]) * 1.0)) });
      face(mb, a, b, c, dd, hint, rs, rsu, rsu);
      face(mb, a, dd, c, b, [-hint[0], -hint[1], -hint[2]], S('wood_dark', { tint: [0.6, 0.6, 0.6] }), 2, 2);
    };
    let ridgeY = H;
    if (kind === 'gable' || kind === 'low') {
      const hx = w / 2 + sov, zf = -ov, zb2 = d + ov, zm = d / 2, rh = (d / 2 + ov) * pitch;
      ridgeY = H + rh;
      card([-hx, H, zf], [hx, H, zf], [hx, H + rh, zm], [-hx, H + rh, zm], [0, 0.7, -1]);
      card([hx, H, zb2], [-hx, H, zb2], [-hx, H + rh, zm], [hx, H + rh, zm], [0, 0.7, 1]);
      for (const sx of [-1, 1]) tface(mb, [sx * w / 2, H, 0], [sx * w / 2, H, d], [sx * w / 2, H + (d / 2) * pitch, zm], [sx, 0, 0], o.wall2 ? wall2St : wallAt(o.wall, sx, 0), 2, 2);
    } else if (kind === 'gableZ') {
      // ridge along z: the gable faces the street
      const hz0 = -ov, hz1 = d + ov, hx = w / 2 + sov, rh = (w / 2 + sov) * pitch;
      ridgeY = H + rh;
      card([-hx, H, hz1], [-hx, H, hz0], [0, H + rh, hz0], [0, H + rh, hz1], [-1, 0.7, 0]);
      card([hx, H, hz0], [hx, H, hz1], [0, H + rh, hz1], [0, H + rh, hz0], [1, 0.7, 0]);
      const gh = (w / 2) * pitch;
      tface(mb, [-w / 2, H, -0.02], [w / 2, H, -0.02], [0, H + gh, -0.02], [0, 0, -1], o.wall2 ? wall2St : wallAt(o.wall, 0, -1), 2, 2);
      tface(mb, [w / 2, H, d + 0.02], [-w / 2, H, d + 0.02], [0, H + gh, d + 0.02], [0, 0, 1], o.wall2 ? wall2St : wallAt(o.wall, 0, 1), 2, 2);
    } else { // hip
      const hx = w / 2 + sov, zf = -ov, zb2 = d + ov, rh = Math.min(w, d) / 2 * pitch;
      const inset = Math.min(w, d) / 2 - 0.2;
      ridgeY = H + rh;
      const rz0 = zf + inset + ov, rz1 = zb2 - inset - ov;
      card([-hx, H, zf], [hx, H, zf], [hx - inset - sov, H + rh, rz0], [-hx + inset + sov, H + rh, rz0], [0, 0.7, -1]);
      card([hx, H, zb2], [-hx, H, zb2], [-hx + inset + sov, H + rh, rz1], [hx - inset - sov, H + rh, rz1], [0, 0.7, 1]);
      card([-hx, H, zb2], [-hx, H, zf], [-hx + inset + sov, H + rh, rz0], [-hx + inset + sov, H + rh, rz1], [-1, 0.7, 0]);
      card([hx, H, zf], [hx, H, zb2], [hx - inset - sov, H + rh, rz1], [hx - inset - sov, H + rh, rz0], [1, 0.7, 0]);
    }
    // ---- door, porch
    const cols = o.cols || Math.max(2, Math.round(w / 3.4));
    const colW = w / cols;
    const dcol = Math.max(0, Math.min(cols - 1, Math.round((o.doorAt + 0.5) * cols - 0.5)));
    const dx = -w / 2 + (dcol + 0.5) * colW;
    mb.box(dx - 0.62, 0, -0.06, dx + 0.62, 2.28, 0.0, trimSt, { skip: 32 });
    wallRect(mb, 'N', dx, 1.05, -0.065, 1.0, 2.1, T(o.door, { tint: tk }));
    if (o.porch) {
      mb.box(dx - 1.4, 0, -1.7, dx + 1.4, 0.22, 0, S('concrete', { tint: tk }), { skip: 8, sub: 2 });
      if (o.porch === 2) {
        for (const sx of [-1, 1]) mb.box(dx + sx * 1.25 - 0.07, 0.22, -1.62, dx + sx * 1.25 + 0.07, 2.55, -1.48, trimSt, { skip: 8 });
        card([dx - 1.55, 2.6, -1.75], [dx + 1.55, 2.6, -1.75], [dx + 1.55, 2.95, 0], [dx - 1.55, 2.95, 0], [0, 1, -0.2]);
      }
    }
    // ---- attached garage
    if (o.garage) {
      const gs = o.garage, gw = o.gw, gh = 2.6, gz1 = d - 1.2;
      const gx0 = gs > 0 ? w / 2 : -w / 2 - gw, gx1 = gs > 0 ? w / 2 + gw : -w / 2;
      mb.box(gx0, 0, -0.5, gx1, gh, gz1, faces(o.wall), { sub: 2.5 });
      face(mb, [gx0 - 0.2, gh, -0.7], [gx1 + 0.2, gh, -0.7], [gx1 + 0.2, gh + 0.25, gz1 * 0.5], [gx0 - 0.2, gh + 0.25, gz1 * 0.5], [0, 0.9, -0.2], roofSt, rsu, rsu);
      face(mb, [gx1 + 0.2, gh, gz1 + 0.2], [gx0 - 0.2, gh, gz1 + 0.2], [gx0 - 0.2, gh + 0.25, gz1 * 0.5], [gx1 + 0.2, gh + 0.25, gz1 * 0.5], [0, 0.9, 0.2], roofSt, rsu, rsu);
      wallRect(mb, 'N', (gx0 + gx1) / 2, 1.1, -0.51, gw - 0.5, 2.2, T(o.gdoor, { tint: tk }));
    }
    // ---- chimney
    if (o.chimney && kind !== 'gableZ') {
      const cx = o.chimneyAt ?? (w / 2 - 1.2);
      mb.box(cx - 0.45, H * 0.5, d * 0.5 - 0.45, cx + 0.45, ridgeY + 0.7, d * 0.5 + 0.45, brickSt, { skip: 8, sub: 2 });
      mb.box(cx - 0.55, ridgeY + 0.7, d * 0.5 - 0.55, cx + 0.55, ridgeY + 0.82, d * 0.5 + 0.55, S('concrete', { tint: tk }), { skip: 8 });
    }
    // ---- windows
    const wm = o.wm;
    let slot = 0;
    const win = (side, cx, cy, c, wd = 1.1, ht = 1.15) => {
      const code = wm ? wm[slot] ?? -1 : -1;
      slot++;
      const st = code >= 0 ? { ...G(o.winLit, 1.0, code), flags: VF.FULLBRIGHT } : T(o.winDark, { tint: tk });
      wallRect(mb, side, cx, cy, c, wd, ht, st);
      if (o.shutters) {
        const sc = S(o.shutters, { tint: tk });
        const off = side === 'N' ? -0.03 : side === 'S' ? 0.03 : side === 'E' ? 0.03 : -0.03;
        for (const s of [-1, 1]) wallRect(mb, side, cx + s * (wd / 2 + 0.22), cy, c + off * 0.5, 0.36, ht, sc);
      }
    };
    const rows = fl === 2 ? [0.95 + 0.575, h1 + 0.8 + 0.575] : [0.95 + 0.575];
    // front: ground floor windows (not at the door), then upper
    for (let k = 0; k < cols; k++) if (k !== dcol) win('N', -w / 2 + (k + 0.5) * colW, rows[0], -0.03, cols <= 2 ? 1.5 : 1.1);
    if (fl === 2) for (let k = 0; k < cols; k++) win('N', -w / 2 + (k + 0.5) * colW, rows[1], -0.03);
    // back
    for (let k = 0; k < cols; k++) win('S', -w / 2 + (k + 0.5) * colW, rows[0], d + 0.03);
    if (fl === 2) for (let k = 0; k < cols; k++) win('S', -w / 2 + (k + 0.5) * colW, rows[1], d + 0.03);
    // sides
    const ns = Math.max(1, Math.round(d / 4.2));
    for (const sd of ['E', 'W']) {
      const xx = sd === 'E' ? w / 2 + 0.03 : -w / 2 - 0.03;
      for (let f = 0; f < fl; f++) for (let k = 0; k < ns; k++) win(sd, (k + 0.5) * (d / ns), rows[f], xx);
    }
    // number plate beside the door
    if (o.num !== null && o.plate) plateOnProp(mb, o.num, dx + (dcol < cols - 1 ? 1.05 : -1.05), 1.55, -0.07, 0.17, 0.25, tk);
  },
  boxes: [],
});

// Footprint of a house in world coordinates [x0, z0, x1, z1] (body only, no garage)
export function footprint(x, z, rot, w, d) {
  const sn = Math.round(Math.sin(rot)), cs = Math.round(Math.cos(rot));
  // local (lx, lz) -> world: x + cs*lx - sn*lz, z + sn*lx + cs*lz
  const pts = [[-w / 2, 0], [w / 2, d]].map(([lx, lz]) => [x + cs * lx - sn * lz, z + sn * lx + cs * lz]);
  return [Math.min(pts[0][0], pts[1][0]), Math.min(pts[0][1], pts[1][1]), Math.max(pts[0][0], pts[1][0]), Math.max(pts[0][1], pts[1][1])];
}

// Place a house. Returns { fp: [x0, z0, x1, z1], door: [x, z] (the front door on the ground),
// front: [fx, fz] unit vector the facade looks along, slots }.
export function placeHouse(zb, x, z, rot, opts = {}) {
  const o = { ...HOUSE_DEFAULTS, ...opts };
  const sn = Math.round(Math.sin(rot)), cs = Math.round(Math.cos(rot));
  const front = [sn, -cs];
  const fp = footprint(x, z, rot, o.w, o.d);
  const cols = o.cols || Math.max(2, Math.round(o.w / 3.4));
  const dcol = Math.max(0, Math.min(cols - 1, Math.round((o.doorAt + 0.5) * cols - 0.5)));
  const ldx = -o.w / 2 + (dcol + 0.5) * (o.w / cols);
  const door = [x + cs * ldx, z + sn * ldx];
  const base = o.baseY ?? 0;
  if (owns(zb, x, z)) zb.prop('g04_house', x, base, z, rot, { ...o, collide: false });
  // shell: collision and far silhouette. y0 follows the lawn.
  const H = o.fl === 2 ? o.h1 + o.h2 : o.h1;
  const inset = 0.06;
  const wallMat = o.shellMat ?? M[o.wall] ?? M.concrete;
  const roofMat = o.shellRoof ?? M[o.roof] ?? M.shingles;
  const hx = Math.max(zb.x0, fp[0] + inset), hz = Math.max(zb.z0, fp[1] + inset);
  const ex = Math.min(zb.x1, fp[2] - inset), ez = Math.min(zb.z1, fp[3] - inset);
  if (ex > hx && ez > hz) {
    let skip = 0;
    if (fp[2] > zb.x1) skip |= FACE.PX; if (fp[0] < zb.x0) skip |= FACE.NX; if (fp[3] > zb.z1) skip |= FACE.PZ; if (fp[1] < zb.z0) skip |= FACE.NZ;
    zb.box(hx, base, hz, ex, base + H - 0.05, ez, wallMat, { sub: 5, skip: skip | FACE.NY });
    // roof proxy: a block inside the roof volume
    const rk = o.kind === 'gableZ';
    const along = rk ? 'z' : 'x';
    const rh = ((rk ? o.w : o.d) / 2) * (o.kind === 'low' ? 0.28 : o.pitch) * 0.85;
    const mx = (fp[0] + fp[2]) / 2, mz = (fp[1] + fp[3]) / 2;
    const sw = along === 'x' ? (fp[2] - fp[0]) / 2 - 0.2 : (fp[2] - fp[0]) * 0.22;
    const sd = along === 'x' ? (fp[3] - fp[1]) * 0.22 : (fp[3] - fp[1]) / 2 - 0.2;
    if (o.kind !== 'flat' && owns(zb, mx, mz)) zb.box(mx - sw, base + H - 0.05, mz - sd, mx + sw, base + H + rh * 0.55, mz + sd, roofMat, { sub: 5, collide: false, skip: FACE.NY });
  }
  // garage collision
  if (o.garage) {
    const gs = o.garage;
    const lx0 = gs > 0 ? o.w / 2 : -o.w / 2 - o.gw, lx1 = gs > 0 ? o.w / 2 + o.gw : -o.w / 2;
    const c = [[lx0, -0.5], [lx1, o.d - 1.2]].map(([lx, lz]) => [x + cs * lx - sn * lz, z + sn * lx + cs * lz]);
    const gx0 = Math.max(zb.x0, Math.min(c[0][0], c[1][0])), gx1 = Math.min(zb.x1, Math.max(c[0][0], c[1][0]));
    const gz0 = Math.max(zb.z0, Math.min(c[0][1], c[1][1])), gz1 = Math.min(zb.z1, Math.max(c[0][1], c[1][1]));
    if (gx1 > gx0 && gz1 > gz0) zb.box(gx0, base, gz0, gx1, base + 2.6, gz1, wallMat, { sub: 5, skip: FACE.NY });
  }
  let garageRect = null;
  if (o.garage) {
    const gs = o.garage;
    const lx0 = gs > 0 ? o.w / 2 : -o.w / 2 - o.gw, lx1 = gs > 0 ? o.w / 2 + o.gw : -o.w / 2;
    const c = [[lx0, -0.5], [lx1, o.d - 1.2]].map(([lx, lz]) => [x + cs * lx - sn * lz, z + sn * lx + cs * lz]);
    garageRect = [Math.min(c[0][0], c[1][0]), Math.min(c[0][1], c[1][1]), Math.max(c[0][0], c[1][0]), Math.max(c[0][1], c[1][1])];
  }
  return { fp, door, front, slots: houseSlots(o), garageRect };
}
