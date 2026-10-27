// Procedural low-poly props. Each prop is authored in local space (y = 0 is the
// floor, +z is the front) and registers simple box colliders. Small debris has
// no collision at all, so the player never snags on clutter.

const PI = Math.PI;

export class Dresser {
  constructor(level, b, rng) {
    this.level = level;
    this.b = b;
    this.rng = rng;
    this.t = null;
  }
  r(a = 0, b = 1) {
    return a + (b - a) * this.rng();
  }
  pick(arr) {
    return arr[Math.floor(this.rng() * arr.length)];
  }
  chance(p) {
    return this.rng() < p;
  }
  at(x, y, z, rot = 0, rx = 0, rz = 0) {
    this.t = { x, y, z, rot };
    this.b.group(x, y + 0.5, z);
    this.b.push(x, y, z, rot, rx, rz);
  }
  done() {
    this.b.pop();
    this.b.ungroup();
    this.t = null;
  }
  // Collider from a local-space rectangle (uses the current prop transform's yaw).
  solid(lx0, lz0, lx1, lz1, ly0, ly1, opts = {}) {
    const { x, y, z, rot } = this.t;
    const c = Math.cos(rot), s = Math.sin(rot);
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (const [lx, lz] of [[lx0, lz0], [lx1, lz0], [lx1, lz1], [lx0, lz1]]) {
      const wx = x + lx * c + lz * s;
      const wz = z - lx * s + lz * c;
      minx = Math.min(minx, wx); maxx = Math.max(maxx, wx);
      minz = Math.min(minz, wz); maxz = Math.max(maxz, wz);
    }
    // rotated boxes: shrink the AABB toward the true footprint
    const q = Math.abs(Math.sin(2 * rot));
    if (q > 0.05) {
      const sx = (maxx - minx) * 0.18 * q, sz = (maxz - minz) * 0.18 * q;
      minx += sx; maxx -= sx; minz += sz; maxz -= sz;
    }
    const col = this.level.addCollider(minx, y + ly0, minz, maxx, y + ly1, maxz, opts.tag);
    if (opts.walkable) col.walkable = true;
    return col;
  }
  zone(x, z, y, r, surface) {
    this.level.zones.push({ x, z, y, r, surface });
  }
}

// ---------------------------------------------------------------- furniture

export function bed(D, x, y, z, rot, o = {}) {
  const b = D.b;
  D.at(x, y, z, rot);
  const W = 0.95, L = 2.05;
  for (const [lx, lz] of [[-0.42, -0.95], [0.42, -0.95], [-0.42, 0.95], [0.42, 0.95]]) {
    b.cbox(lx, 0.25, lz, 0.05, 0.4, 0.05, 'metal_painted');
    b.cbox(lx, 0.05, lz, 0.04, 0.1, 0.1, 'rubber');
  }
  b.box(-W / 2, 0.42, -L / 2, W / 2, 0.52, L / 2, 'metal_painted');
  if (!o.frameOnly) {
    b.box(-0.45, 0.52, -0.99, 0.45, 0.68, 0.99, { top: o.bare ? 'mattress' : 'sheet', side: 'mattress' });
    if (!o.bare) {
      b.push(0, 0.68, -0.8, D.r(-0.3, 0.3));
      b.box(-0.28, 0, -0.16, 0.28, 0.1, 0.16, 'sheet');
      b.pop();
      // rumpled blanket fold
      b.push(D.r(-0.1, 0.1), 0.68, 0.45, D.r(-0.2, 0.2));
      b.box(-0.46, 0, -0.3, 0.46, 0.06, 0.3, 'sheet');
      b.pop();
    }
  }
  b.box(-W / 2, 0.42, -L / 2 - 0.04, W / 2, 1.1, -L / 2, 'metal_painted');
  b.box(-W / 2, 0.42, L / 2, W / 2, 0.9, L / 2 + 0.04, 'metal_painted');
  // side rails
  const side = o.railDown ? 0.6 : 0.85;
  b.box(-W / 2 - 0.03, side, -0.7, -W / 2, side + 0.06, 0.4, 'chrome');
  b.box(W / 2, 0.72, -0.7, W / 2 + 0.03, 0.78, 0.4, 'chrome');
  D.solid(-W / 2 - 0.03, -L / 2 - 0.05, W / 2 + 0.03, L / 2 + 0.05, 0, 1.0);
  D.done();
}

export function gurney(D, x, y, z, rot, o = {}) {
  const b = D.b;
  const over = !!o.overturned;
  D.at(x, y, z, rot);
  if (over) b.push(0, 0.32, 0, 0, 0, PI / 2 * (o.side || 1));
  const L = 1.9, W = 0.6;
  const yOff = over ? -0.3 : 0;
  b.push(0, yOff, 0);
  for (const [lx, lz] of [[-0.26, -0.85], [0.26, -0.85], [-0.26, 0.85], [0.26, 0.85]]) {
    b.cbox(lx, 0.45, lz, 0.035, 0.7, 0.035, 'chrome');
    b.push(lx, 0.06, lz, 0, 0, PI / 2);
    b.cyl(0, -0.025, 0, 0.06, 0.025, 6, 'rubber');
    b.pop();
  }
  b.box(-W / 2, 0.25, -L / 2, W / 2, 0.28, L / 2, 'metal_painted', { skip: 'ny' });
  b.box(-W / 2, 0.78, -L / 2, W / 2, 0.82, L / 2, 'chrome');
  if (!o.bare) b.box(-0.28, 0.82, -0.9, 0.28, 0.9, 0.9, { top: o.sheet ? 'sheet' : 'vinyl_black', side: 'vinyl_black' });
  // head section raised
  if (!over && o.raised) {
    b.push(0, 0.9, -0.3, 0, -0.6, 0);
    b.box(-0.28, 0, -0.65, 0.28, 0.07, 0, 'vinyl_black');
    b.pop();
  }
  b.pop();
  if (over) b.pop();
  if (over) D.solid(-0.5, -L / 2, 0.5, L / 2, 0, 0.62);
  else D.solid(-W / 2, -L / 2, W / 2, L / 2, 0, 0.9);
  D.done();
}

export function wheelchair(D, x, y, z, rot, o = {}) {
  const b = D.b;
  D.at(x, y, z, rot);
  const tipped = !!o.tipped;
  if (tipped) b.push(0.3, 0.3, 0, 0, 0, -PI / 2);
  // big wheels (axis along x)
  const wheel = (wx, wy, wz, r) => {
    b.push(wx, wy, wz, 0, 0, PI / 2);
    b.cyl(0, -0.02, 0, r, 0.02, 10, 'rubber', { capTex: 'chrome' });
    b.pop();
  };
  if (!o.missingWheel) wheel(-0.3, 0.3, 0.05, 0.3);
  wheel(0.3, 0.3, 0.05, 0.3);
  // casters
  wheel(-0.22, 0.07, 0.42, 0.07);
  wheel(0.22, 0.07, 0.42, 0.07);
  // frame
  b.cbox(-0.24, 0.3, 0.2, 0.025, 0.5, 0.025, 'chrome');
  b.cbox(0.24, 0.3, 0.2, 0.025, 0.5, 0.025, 'chrome');
  b.cbox(-0.24, 0.62, -0.12, 0.025, 0.95, 0.025, 'chrome');
  b.cbox(0.24, 0.62, -0.12, 0.025, 0.95, 0.025, 'chrome');
  b.box(-0.24, 0.48, -0.12, 0.24, 0.52, 0.32, 'vinyl_black');
  b.box(-0.24, 0.55, -0.14, 0.24, 0.95, -0.11, 'vinyl_black');
  b.box(-0.27, 0.66, -0.12, -0.22, 0.69, 0.3, 'chrome');
  b.box(0.22, 0.66, -0.12, 0.27, 0.69, 0.3, 'chrome');
  b.box(-0.2, 0.1, 0.42, 0.2, 0.12, 0.55, 'chrome');
  if (tipped) b.pop();
  if (o.missingWheel && !tipped) {
    b.push(-0.8, 0.02, 0.4, 0.4, 0, 0);
    b.cyl(0, 0, 0, 0.3, 0.04, 10, 'rubber', { capTex: 'chrome' });
    b.pop();
  }
  D.solid(-0.32, -0.2, 0.32, 0.5, 0, tipped ? 0.6 : 1.0);
  D.done();
}

export function ivStand(D, x, y, z, o = {}) {
  const b = D.b;
  const rot = D.r(0, PI * 2);
  D.at(x, y, z, rot);
  if (o.fallen) b.push(0, 0.06, 0, 0, PI / 2 - 0.05, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2;
    b.push(0, 0.05, 0, a);
    b.box(-0.015, 0, 0, 0.015, 0.03, 0.28, 'chrome');
    b.cyl(0, -0.05, 0.27, 0.03, 0.0, 4, 'rubber');
    b.pop();
  }
  b.cyl(0, 0.05, 0, 0.014, 1.95, 4, 'chrome', { caps: false });
  b.box(-0.18, 1.92, -0.01, 0.18, 1.95, 0.01, 'chrome');
  if (o.bag) {
    b.box(0.1, 1.55, -0.03, 0.24, 1.86, 0.03, 'plastic_white');
    b.box(0.165, 1.2, -0.005, 0.175, 1.55, 0.005, 'plastic_white');
  }
  if (o.fallen) b.pop();
  if (!o.fallen) D.solid(-0.12, -0.12, 0.12, 0.12, 0, 1.9);
  D.done();
}

export function desk(D, x, y, z, rot, o = {}) {
  const b = D.b;
  const w = o.w ?? 1.4, d = o.d ?? 0.7;
  D.at(x, y, z, rot);
  b.box(-w / 2, 0.72, -d / 2, w / 2, 0.76, d / 2, o.tex || 'wood_desk');
  b.box(w / 2 - 0.45, 0, -d / 2 + 0.02, w / 2 - 0.02, 0.72, d / 2 - 0.02, 'metal_painted', { skip: 'pz,ny' });
  b.box(-w / 2 + 0.02, 0, -d / 2 + 0.02, -w / 2 + 0.06, 0.72, d / 2 - 0.02, 'metal_painted', { skip: 'ny' });
  b.box(-w / 2 + 0.06, 0.25, -d / 2 + 0.02, w / 2 - 0.45, 0.72, -d / 2 + 0.05, 'metal_painted');
  b.push(w / 2 - 0.235, 0, d / 2 - 0.02);
  b.panel(0, 0.36, 0.001, 0.42, 0.7, 'cabinet_front');
  b.pop();
  if (o.drawerOut) b.box(w / 2 - 0.44, 0.5, d / 2 - 0.02, w / 2 - 0.03, 0.66, d / 2 + 0.3, 'metal_painted');
  D.solid(-w / 2, -d / 2, w / 2, d / 2, 0, 0.78);
  D.done();
}

export function chair(D, x, y, z, rot, o = {}) {
  const b = D.b;
  D.at(x, y, z, rot);
  const fallen = !!o.fallen;
  if (fallen) b.push(0, 0.22, -0.2, 0, -PI / 2 + 0.1, 0);
  if (o.kind === 'office') {
    for (let i = 0; i < 5; i++) {
      b.push(0, 0.04, 0, (i / 5) * PI * 2);
      b.box(-0.02, 0, 0, 0.02, 0.04, 0.3, 'vinyl_black');
      b.pop();
    }
    b.cyl(0, 0.05, 0, 0.03, 0.42, 4, 'chrome', { caps: false });
    b.box(-0.24, 0.42, -0.22, 0.24, 0.5, 0.24, 'vinyl_black');
    b.box(-0.22, 0.55, -0.26, 0.22, 0.95, -0.2, 'vinyl_black');
  } else {
    const t = o.kind === 'wood' ? 'wood_dark' : 'metal_painted';
    for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) b.cbox(lx, 0.22, lz, 0.03, 0.44, 0.03, t);
    b.box(-0.22, 0.44, -0.22, 0.22, 0.48, 0.22, o.seat || (o.kind === 'wood' ? 'wood_dark' : 'vinyl_teal'));
    b.box(-0.22, 0.48, -0.24, 0.22, 0.88, -0.2, o.kind === 'wood' ? 'wood_dark' : 'vinyl_teal');
  }
  if (fallen) b.pop();
  if (!fallen) D.solid(-0.22, -0.22, 0.22, 0.22, 0, 0.5);
  D.done();
}

export function waitingChairs(D, x, y, z, rot, n, o = {}) {
  const b = D.b;
  D.at(x, y, z, rot);
  const pitch = 0.58;
  const L = n * pitch;
  b.box(-L / 2, 0.3, -0.05, L / 2, 0.36, 0.05, 'chrome');
  for (const lx of [-L / 2 + 0.1, L / 2 - 0.1]) {
    b.cbox(lx, 0.15, 0, 0.05, 0.3, 0.45, 'chrome');
  }
  for (let i = 0; i < n; i++) {
    const cxl = -L / 2 + pitch * (i + 0.5);
    if (o.missing && o.missing.includes(i)) continue;
    const torn = D.chance(0.25);
    b.box(cxl - 0.25, 0.38, -0.22, cxl + 0.25, 0.46, 0.25, 'vinyl_teal', { scale: 2 });
    if (!torn) b.box(cxl - 0.25, 0.46, -0.27, cxl + 0.25, 0.9, -0.2, 'vinyl_teal', { scale: 2 });
    else {
      b.push(cxl, 0.46, -0.24, 0, -0.5, 0);
      b.box(-0.25, 0, -0.03, 0.25, 0.42, 0.03, 'vinyl_teal');
      b.pop();
    }
  }
  D.solid(-L / 2, -0.27, L / 2, 0.25, 0, 0.6);
  D.done();
}

export function cabinet(D, x, y, z, rot, o = {}) {
  const b = D.b;
  D.at(x, y, z, rot);
  const h = o.h ?? 1.32;
  b.box(-0.235, 0, -0.31, 0.235, h, 0.31, 'metal_painted', { skip: 'pz,ny' });
  b.push(0, 0, 0.31);
  b.panel(0, h / 2, 0, 0.47, h, o.front || 'cabinet_front');
  b.pop();
  if (o.open) {
    const dy = o.openY ?? 0.85;
    b.box(-0.21, dy, 0.31, 0.21, dy + 0.26, 0.31 + o.open, 'metal_painted');
    b.box(-0.19, dy + 0.02, 0.32, 0.19, dy + 0.24, 0.31 + o.open - 0.02, 'shelf_files', { skip: 'ny' });
  }
  D.solid(-0.235, -0.31, 0.235, 0.31 + (o.open || 0), 0, h);
  D.done();
}

export function shelf(D, x, y, z, rot, o = {}) {
  const b = D.b;
  const w = o.w ?? 1.8, d = o.d ?? 0.45, h = o.h ?? 2.0;
  const tex = o.tex || 'shelf_meds';
  D.at(x, y, z, rot);
  for (const lx of [-w / 2, w / 2 - 0.04]) {
    b.box(lx, 0, -d / 2, lx + 0.04, h, -d / 2 + 0.04, 'metal_painted');
    b.box(lx, 0, d / 2 - 0.04, lx + 0.04, h, d / 2, 'metal_painted');
  }
  const levels = o.levels ?? 5;
  for (let i = 0; i < levels; i++) {
    const sy = 0.08 + (i * (h - 0.15)) / (levels - 1);
    b.box(-w / 2, sy, -d / 2, w / 2, sy + 0.03, d / 2, 'metal_painted');
    if (i < levels - 1) {
      const sh = (h - 0.15) / (levels - 1) - 0.04;
      // contents: front face texture plus a dark back
      const fill = D.chance(o.empty ?? 0.15) ? null : tex;
      if (fill) {
        const segs = Math.max(1, Math.round(w / 0.9));
        for (let s = 0; s < segs; s++) {
          if (D.chance(0.12)) continue;
          const x0 = -w / 2 + 0.05 + (s * (w - 0.1)) / segs;
          const x1 = x0 + (w - 0.1) / segs;
          b.quad([x0, sy + 0.03, d / 2 - 0.12], [x1, sy + 0.03, d / 2 - 0.12], [x1, sy + 0.03 + sh, d / 2 - 0.12], [x0, sy + 0.03 + sh, d / 2 - 0.12], [0.01, 0.01, 0.99, 0.01, 0.99, Math.min(0.99, sh / 0.4), 0.01, Math.min(0.99, sh / 0.4)], fill);
          if (o.twoSided)
            b.quad([x1, sy + 0.03, -d / 2 + 0.12], [x0, sy + 0.03, -d / 2 + 0.12], [x0, sy + 0.03 + sh, -d / 2 + 0.12], [x1, sy + 0.03 + sh, -d / 2 + 0.12], [0.01, 0.01, 0.99, 0.01, 0.99, Math.min(0.99, sh / 0.4), 0.01, Math.min(0.99, sh / 0.4)], fill);
        }
      }
    }
  }
  if (!o.twoSided) b.box(-w / 2, 0.08, -d / 2, w / 2, h - 0.05, -d / 2 + 0.02, 'dark', { skip: 'nz' });
  D.solid(-w / 2, -d / 2, w / 2, d / 2, 0, h);
  D.done();
}

export function boxes(D, x, y, z, n = 3, o = {}) {
  const b = D.b;
  D.at(x, y, z, D.r(0, PI));
  let h = 0;
  for (let i = 0; i < n; i++) {
    const s = D.r(0.35, 0.6);
    const ox = i === 0 ? 0 : D.r(-0.15, 0.15);
    const oz = i === 0 ? 0 : D.r(-0.15, 0.15);
    const sy = s * D.r(0.6, 0.9);
    const stack = i > 0 && D.chance(0.6);
    const by = stack ? h : 0;
    const dx = stack ? ox : (i % 2 ? 0.55 : -0.5) + ox;
    b.push(dx, by, oz, D.r(-0.3, 0.3));
    b.box(-s / 2, 0, -s / 2, s / 2, sy, s / 2, 'cardboard');
    if (D.chance(0.4)) b.box(-s / 2, sy, -s / 2, -s / 2 + 0.02, sy + 0.25, s / 2, 'cardboard'); // open flap
    b.pop();
    h = by + sy;
    if (!o.noCollide && i === 0) D.solid(-s / 2, -s / 2, s / 2, s / 2, 0, sy);
  }
  D.done();
}

export function bin(D, x, y, z, o = {}) {
  const b = D.b;
  D.at(x, y, z, D.r(0, PI));
  if (o.fallen) {
    b.push(0, 0.2, 0, 0, PI / 2, 0);
    b.cyl(0, -0.3, 0, 0.2, 0.3, 7, 'metal_rust', { caps: false });
    b.pop();
    D.b.floorDecal(0, 0.006, 0.6, 0.8, 0.8, D.r(0, PI), 'trash');
  } else {
    b.cyl(0, 0, 0, 0.2, 0.6, 7, 'metal_rust', { capTex: 'trash' });
    D.solid(-0.2, -0.2, 0.2, 0.2, 0, 0.6);
  }
  D.done();
}

// ----------------------------------------------------------------- debris

function mound(b, r, h, tex, segs = 7, rng) {
  const ring = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * PI * 2;
    const rr = r * (0.75 + rng() * 0.5);
    ring.push([Math.sin(a) * rr, Math.cos(a) * rr]);
  }
  const top = [rng() * 0.1 - 0.05, h, rng() * 0.1 - 0.05];
  for (let i = 0; i < segs; i++) {
    const [x0, z0] = ring[i];
    const [x1, z1] = ring[(i + 1) % segs];
    b.triangle([x0, 0.01, z0], [x1, 0.01, z1], top, [x0 + 0.5, z0 + 0.5, x1 + 0.5, z1 + 0.5, 0.5, 0.5], tex);
  }
}

export function trashPile(D, x, y, z, r = 0.6) {
  const b = D.b;
  D.at(x, y, z, D.r(0, PI * 2));
  b.floorDecal(0, 0.005, 0, r * 2.6, r * 2.6, 0, 'trash');
  mound(b, r, r * 0.35, 'trash', 7, D.rng);
  for (let i = 0; i < 3; i++) {
    b.push(D.r(-r, r), 0.03, D.r(-r, r), D.r(0, PI), D.r(-0.3, 0.3), PI / 2);
    b.cyl(0, -0.05, 0, 0.035, 0.05, 6, 'can_label');
    b.pop();
  }
  D.zone(x, z, y, r * 1.1, 'debris');
  D.done();
}

export function rubblePile(D, x, y, z, r = 0.8, h = 0.45, o = {}) {
  const b = D.b;
  D.at(x, y, z, D.r(0, PI * 2));
  b.floorDecal(0, 0.006, 0, r * 2.8, r * 2.8, D.r(0, PI), 'ceiling_debris');
  mound(b, r, h, 'rubble', 8, D.rng);
  const n = o.chunks ?? 6;
  for (let i = 0; i < n; i++) {
    const s = D.r(0.12, 0.3);
    b.push(D.r(-r, r) * 0.9, D.r(0, h * 0.4), D.r(-r, r) * 0.9, D.r(0, PI), D.r(-0.6, 0.6), D.r(-0.6, 0.6));
    b.box(-s / 2, 0, -s / 2, s / 2, s * 0.6, s / 2, D.pick(['wall_concrete', 'rubble', 'wall_paint', 'wall_brick']));
    b.pop();
  }
  // a couple of fallen ceiling tiles leaning on the pile
  for (let i = 0; i < (o.tiles ?? 2); i++) {
    b.push(D.r(-r, r), D.r(0.05, h * 0.5), D.r(-r, r), D.r(0, PI), D.r(-0.4, 0.4), D.r(-0.4, 0.4));
    b.box(-0.3, 0, -0.3, 0.3, 0.015, 0.3, { top: 'ceiling_tile', bottom: 'ceiling_tile', side: 'wall_paint' }, { uv: 'fit' });
    b.pop();
  }
  if (h > 0.4 && o.collide !== false) D.solid(-r * 0.55, -r * 0.55, r * 0.55, r * 0.55, 0, h * 0.8);
  D.zone(x, z, y, r * 1.2, 'debris');
  D.done();
}

export function papers(D, x, y, z, spread = 1, n = 4) {
  const b = D.b;
  D.at(x, y, z, 0);
  b.floorDecal(0, 0.004, 0, spread * 1.6, spread * 1.6, D.r(0, PI * 2), 'paper_scatter');
  for (let i = 0; i < n; i++) {
    const px = D.r(-spread, spread), pz = D.r(-spread, spread);
    b.floorDecal(px, 0.007 + i * 0.001, pz, 0.21, 0.3, D.r(0, PI * 2), D.chance(0.2) ? 'folder' : 'paper');
  }
  D.done();
}

export function glassShards(D, x, y, z, r = 0.7) {
  D.at(x, y, z, 0);
  D.b.floorDecal(0, 0.005, 0, r * 2, r * 2, D.r(0, PI * 2), 'glass_shards');
  D.zone(x, z, y, r, 'glass');
  D.done();
}

export function puddle(D, x, y, z, w = 1.5, d = 1.2) {
  D.at(x, y, z, 0);
  D.b.floorDecal(0, 0.004, 0, w, d, D.r(0, PI * 2), 'puddle');
  D.zone(x, z, y, Math.min(w, d) * 0.45, 'water');
  D.done();
}

export function fallenTiles(D, x, y, z, n = 3) {
  const b = D.b;
  D.at(x, y, z, 0);
  b.floorDecal(0, 0.005, 0, 1.6, 1.6, D.r(0, PI * 2), 'ceiling_debris');
  for (let i = 0; i < n; i++) {
    b.push(D.r(-0.7, 0.7), 0.01, D.r(-0.7, 0.7), D.r(0, PI), D.r(-0.1, 0.1), D.r(-0.1, 0.1));
    const s = D.r(0.25, 0.6);
    b.box(-s / 2, 0, -0.3, s / 2, 0.015, 0.3, { top: 'ceiling_tile', bottom: 'ceiling_tile', side: 'wall_paint' }, { uv: 'fit' });
    b.pop();
  }
  D.zone(x, z, y, 0.8, 'debris');
  D.done();
}

// Dangling cables from a ceiling opening.
export function wires(D, x, yTop, z, n = 3, len = 1.2) {
  const b = D.b;
  D.at(x, yTop, z, D.r(0, PI));
  for (let i = 0; i < n; i++) {
    const ox = D.r(-0.25, 0.25), oz = D.r(-0.25, 0.25);
    const l1 = len * D.r(0.4, 0.7), l2 = len * D.r(0.3, 0.6);
    const mx = ox + D.r(-0.15, 0.15), mz = oz + D.r(-0.15, 0.15);
    const tex = D.pick(['rubber', 'rubber', 'paint_red', 'plastic_white']);
    b.tube(ox, 0, oz, mx, -l1, mz, 0.012, 3, tex);
    b.tube(mx, -l1, mz, mx + D.r(-0.2, 0.2), -l1 - l2, mz + D.r(-0.2, 0.2), 0.012, 3, tex);
  }
  D.done();
}

export function hangingTile(D, x, yTop, z) {
  const b = D.b;
  D.at(x, yTop, z, D.r(0, PI * 2));
  b.push(0.3, 0, 0, 0, 0, D.r(0.9, 1.3));
  b.box(-0.6, -0.008, -0.3, 0, 0.008, 0.3, { top: 'ceiling_tile', bottom: 'ceiling_tile', side: 'wall_paint' }, { uv: 'fit' });
  b.pop();
  D.done();
}

// ------------------------------------------------------------ medical

export function curtainRun(D, x0, z0, x1, z1, y, o = {}) {
  const b = D.b;
  const yTop = y + (o.top ?? 2.3);
  const yBot = y + (o.bottom ?? 0.35);
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  b.group((x0 + x1) / 2, y + 1, (z0 + z1) / 2);
  b.tube(x0, yTop + 0.05, z0, x1, yTop + 0.05, z1, 0.015, 3, 'chrome');
  const drawn = o.drawn ?? 1;
  const n = Math.max(2, Math.round((len * drawn) / 0.18));
  const ux = dx / len, uz = dz / len;
  const nx = -uz, nz = ux;
  const pleat = 0.05;
  const start = o.fromEnd ? len * (1 - drawn) : 0;
  const step = (len * drawn) / n;
  for (let i = 0; i < n; i++) {
    const a = start + i * step;
    const c = a + step;
    const o0 = i % 2 === 0 ? pleat : -pleat;
    const o1 = -o0;
    const torn = o.torn && D.chance(0.3);
    const bot = torn ? yBot + D.r(0.2, 0.8) : yBot + D.r(-0.03, 0.03);
    const p0 = [x0 + ux * a + nx * o0, bot, z0 + uz * a + nz * o0];
    const p1 = [x0 + ux * c + nx * o1, bot, z0 + uz * c + nz * o1];
    const p2 = [x0 + ux * c + nx * o1, yTop, z0 + uz * c + nz * o1];
    const p3 = [x0 + ux * a + nx * o0, yTop, z0 + uz * a + nz * o0];
    b.quad(p0, p1, p2, p3, [a, 0, c, 0, c, 1.9, a, 1.9], 'curtain', 2);
  }
  b.ungroup();
}

export function orTable(D, x, y, z, rot) {
  const b = D.b;
  D.at(x, y, z, rot);
  b.box(-0.35, 0, -0.5, 0.35, 0.08, 0.5, 'metal_steel');
  b.cyl(0, 0.08, 0, 0.12, 0.7, 6, 'metal_steel');
  b.box(-0.3, 0.7, -0.95, 0.3, 0.82, 0.95, { top: 'vinyl_black', side: 'metal_steel' });
  b.push(0, 0.82, -0.75);
  b.box(-0.12, 0, -0.18, 0.12, 0.08, 0.05, 'vinyl_black');
  b.pop();
  // arm boards
  b.push(0.3, 0.76, -0.35, -0.5);
  b.box(0, 0, -0.06, 0.6, 0.04, 0.06, 'vinyl_black');
  b.pop();
  // leather straps
  b.box(-0.31, 0.79, 0.2, 0.31, 0.84, 0.28, 'rubber');
  b.box(-0.31, 0.79, -0.4, 0.31, 0.84, -0.32, 'rubber');
  D.solid(-0.35, -0.95, 0.35, 0.95, 0, 0.85);
  D.done();
}

export function orLamp(D, x, yCeil, z) {
  const b = D.b;
  D.at(x, yCeil, z, D.r(0, PI));
  b.cyl(0, -0.15, 0, 0.08, 0, 6, 'metal_painted');
  b.tube(0, -0.1, 0, 0.6, -0.5, 0, 0.03, 4, 'metal_painted');
  b.tube(0.6, -0.5, 0, 0.6, -1.0, 0.2, 0.03, 4, 'metal_painted');
  b.push(0.6, -1.05, 0.25, 0, 0.25, 0);
  b.cyl(0, 0, 0, 0.42, 0.16, 10, 'plastic_white', { caps: true, capTex: 'plastic_white' });
  b.quad([-0.4, -0.001, 0.4], [0.4, -0.001, 0.4], [0.4, -0.001, -0.4], [-0.4, -0.001, -0.4], [0.01, 0.99, 0.99, 0.99, 0.99, 0.01, 0.01, 0.01], 'or_lamp');
  b.pop();
  D.done();
}

export function trolley(D, x, y, z, rot, o = {}) {
  const b = D.b;
  D.at(x, y, z, rot);
  const w = o.w ?? 0.7, d = o.d ?? 0.45;
  for (const [lx, lz] of [[-w / 2 + 0.02, -d / 2 + 0.02], [w / 2 - 0.02, -d / 2 + 0.02], [-w / 2 + 0.02, d / 2 - 0.02], [w / 2 - 0.02, d / 2 - 0.02]]) {
    b.cbox(lx, 0.45, lz, 0.025, 0.85, 0.025, 'metal_steel');
    b.cbox(lx, 0.03, lz, 0.05, 0.06, 0.05, 'rubber');
  }
  b.box(-w / 2, 0.86, -d / 2, w / 2, 0.88, d / 2, 'metal_steel');
  b.box(-w / 2, 0.3, -d / 2, w / 2, 0.32, d / 2, 'metal_steel');
  if (!o.empty) {
    for (let i = 0; i < 5; i++) {
      b.push(D.r(-w / 2 + 0.1, w / 2 - 0.1), 0.88, D.r(-d / 2 + 0.08, d / 2 - 0.08), D.r(0, PI));
      b.box(-0.08, 0, -0.008, 0.08, 0.01, 0.008, 'chrome');
      b.pop();
    }
    b.box(-0.2, 0.32, -0.12, 0.05, 0.4, 0.1, 'cardboard');
  }
  D.solid(-w / 2, -d / 2, w / 2, d / 2, 0, 0.9);
  D.done();
}

export function monitorCart(D, x, y, z, rot) {
  const b = D.b;
  D.at(x, y, z, rot);
  b.box(-0.3, 0.05, -0.25, 0.3, 0.1, 0.25, 'metal_painted');
  b.cyl(0, 0.1, 0, 0.03, 1.0, 4, 'chrome', { caps: false });
  b.box(-0.22, 1.0, -0.2, 0.22, 1.32, 0.18, 'plastic_white', { skip: 'pz' });
  b.push(0, 1.16, 0.18);
  b.panel(0, 0, 0, 0.36, 0.26, 'crt_screen');
  b.pop();
  for (const [lx, lz] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) b.cbox(lx, 0.025, lz, 0.05, 0.05, 0.05, 'rubber');
  D.solid(-0.3, -0.25, 0.3, 0.25, 0, 1.3);
  D.done();
}

export function anesthesia(D, x, y, z, rot) {
  const b = D.b;
  D.at(x, y, z, rot);
  b.box(-0.35, 0.08, -0.3, 0.35, 1.1, 0.3, 'plastic_white', { skip: 'pz' });
  b.push(0, 0, 0.3);
  b.panel(0, 0.85, 0, 0.6, 0.4, 'generator_panel');
  b.panel(0, 0.4, 0, 0.6, 0.55, 'cabinet_front');
  b.pop();
  b.box(-0.3, 1.1, -0.25, 0.3, 1.45, 0.15, 'plastic_white', { skip: 'pz' });
  b.push(0, 1.27, 0.15);
  b.panel(0, 0, 0, 0.5, 0.3, 'crt_screen');
  b.pop();
  for (let i = 0; i < 3; i++) b.cyl(-0.42, 0.2 + i * 0.05, -0.2 + i * 0.15, 0.06, 0.9, 6, i === 1 ? 'metal_green' : 'plastic_white');
  b.tube(0.3, 0.9, 0.2, 0.7, 0.85, 0.5, 0.02, 4, 'rubber');
  D.solid(-0.5, -0.32, 0.4, 0.32, 0, 1.45);
  D.done();
}

export function sink(D, x, y, z, rot, o = {}) {
  const b = D.b;
  D.at(x, y, z, rot);
  b.box(-0.3, 0.75, -0.25, 0.3, 0.9, 0.22, 'plastic_white');
  b.box(-0.25, 0.86, -0.18, 0.25, 0.905, 0.16, 'dark');
  b.cyl(0, 0.35, -0.18, 0.03, 0.75, 4, 'chrome', { caps: false });
  b.tube(0, 0.9, -0.22, 0, 1.05, -0.1, 0.015, 4, 'chrome');
  if (o.mirror) {
    b.push(0, 0, -0.25 + 0.012);
    b.panel(0, 1.55, 0, 0.55, 0.7, o.mirrorTex || 'metal_steel');
    b.pop();
  }
  D.solid(-0.3, -0.25, 0.3, 0.22, 0.6, 0.95);
  D.done();
}

export function drawerWall(D, x0, y, zWall, cols, rows, o = {}) {
  // cold-chamber doors along a north wall (face +z), starting at x0
  const b = D.b;
  const size = 0.62, gap = 0.08;
  const W = cols * (size + gap) + gap;
  b.group(x0 + W / 2, y + 1, zWall + 0.3);
  b.box(x0, y, zWall, x0 + W, y + rows * (size + gap) + 0.5, zWall + 0.12, 'metal_steel', { skip: 'nz' });
  let n = 1;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++, n++) {
      const px = x0 + gap + c * (size + gap) + size / 2;
      const py = y + 0.3 + r * (size + gap) + size / 2;
      if (o.open && o.open.c === c && o.open.r === r) {
        // pulled-out tray with a crumpled sheet, door swung down
        b.box(px - size / 2, py - size / 2, zWall + 0.1, px + size / 2, py + size / 2, zWall + 0.12, 'dark');
        b.box(px - 0.27, py - 0.18, zWall + 0.12, px + 0.27, py - 0.14, zWall + 1.95, 'metal_steel');
        b.box(px - 0.29, py - 0.24, zWall + 1.9, px + 0.29, py - 0.12, zWall + 1.98, 'metal_steel');
        b.push(px, py - 0.14, zWall + 1.2, 0.2);
        b.box(-0.24, 0, -0.5, 0.24, 0.06, 0.4, 'sheet');
        b.pop();
        b.push(px + size / 2, py - size / 2, zWall + 0.12, 0, 0, 0);
        b.quad([0, 0, 0], [0, 0, size], [0, size, size], [0, size, 0], [0.01, 0.01, 0.99, 0.01, 0.99, 0.99, 0.01, 0.99], 'drawer_front', 2);
        b.pop();
        D.level.addCollider(px - 0.3, y, zWall + 0.1, px + 0.3, py, zWall + 2.0);
      } else {
        b.push(px, py, zWall + 0.121);
        b.panel(0, 0, 0, size, size, 'drawer_front');
        b.pop();
      }
    }
  b.ungroup();
  D.level.addCollider(x0, y, zWall, x0 + W, y + 2.6, zWall + 0.14);
}

export function autopsyTable(D, x, y, z, rot) {
  const b = D.b;
  D.at(x, y, z, rot);
  b.cyl(0, 0, 0.4, 0.18, 0.75, 6, 'metal_steel');
  b.box(-0.4, 0.75, -1.1, 0.4, 0.82, 1.1, 'metal_steel');
  b.box(-0.4, 0.82, -1.1, -0.36, 0.88, 1.1, 'metal_steel');
  b.box(0.36, 0.82, -1.1, 0.4, 0.88, 1.1, 'metal_steel');
  b.box(-0.36, 0.82, -1.1, 0.36, 0.88, -1.06, 'metal_steel');
  b.box(-0.04, 0.821, -0.9, 0.04, 0.823, 1.0, 'dark');
  b.floorDecal(0, 0.006, 0.9, 1.0, 1.0, 0.4, 'stain_dark');
  D.solid(-0.4, -1.1, 0.4, 1.1, 0, 0.9);
  D.done();
}

export function xrayMachine(D, x, y, z, rot) {
  const b = D.b;
  D.at(x, y, z, rot);
  b.box(-0.4, 0, -1.0, 0.4, 0.7, 1.0, 'plastic_white');
  b.box(-0.45, 0.7, -1.1, 0.45, 0.78, 1.1, { top: 'vinyl_black', side: 'plastic_white' });
  b.box(0.8, 0, -0.2, 1.05, 2.6, 0.2, 'plastic_white');
  b.box(0.0, 2.0, -0.12, 0.85, 2.15, 0.12, 'plastic_white');
  b.box(-0.25, 1.65, -0.25, 0.25, 2.05, 0.25, 'metal_painted');
  b.box(-0.18, 1.55, -0.18, 0.18, 1.65, 0.18, 'dark');
  D.solid(-0.45, -1.1, 1.05, 1.1, 0, 0.8);
  D.solid(0.8, -0.2, 1.05, 0.2, 0, 2.6);
  D.done();
}

// ------------------------------------------------------------ plant

export function boiler(D, x, y, z, rot, o = {}) {
  const b = D.b;
  D.at(x, y, z, rot);
  const L = o.L ?? 4.2, R = o.R ?? 1.0;
  for (const lz of [-L / 2 + 0.4, L / 2 - 0.4]) b.box(-0.8, 0, lz - 0.2, 0.8, 0.55, lz + 0.2, 'wall_concrete');
  b.push(0, 0.55 + R, 0, 0, PI / 2, 0);
  b.cyl(0, -L / 2, 0, R, L / 2, 10, 'metal_green', { caps: true, bottomCap: true, capTex: 'metal_rust', urep: 3 });
  b.pop();
  // fire door + gauges on the front (+z end)
  b.push(0, 0.55 + R, L / 2 + 0.01);
  b.panel(0, -0.2, 0, 0.7, 0.6, 'door_metal');
  b.panel(-0.45, 0.45, 0.01, 0.22, 0.22, 'boiler_gauge');
  b.panel(0.42, 0.5, 0.01, 0.22, 0.22, 'boiler_gauge');
  b.pop();
  // riveted bands
  for (let i = -1; i <= 1; i++) {
    b.push(0, 0.55 + R, i * L * 0.3, 0, PI / 2, 0);
    b.cyl(0, -0.04, 0, R + 0.03, 0.04, 10, 'metal_rust', { caps: false });
    b.pop();
  }
  // flue + pipes up into the ceiling
  b.cyl(0, 0.55 + 2 * R - 0.1, -L / 2 + 0.6, 0.22, 3.0, 8, 'metal_rust', { caps: false });
  b.tube(0.5, 0.55 + 1.7 * R, L / 2 - 0.8, 0.5, 3.0, L / 2 - 0.8, 0.09, 6, 'pipe_lagging', { swap: true });
  b.tube(-0.5, 0.55 + 1.7 * R, L / 2 - 1.2, -0.5, 3.0, L / 2 - 1.2, 0.07, 6, 'metal_rust');
  D.solid(-R - 0.05, -L / 2 - 0.05, R + 0.05, L / 2 + 0.05, 0, 0.55 + 2 * R);
  D.done();
}

export function generator(D, x, y, z, rot) {
  const b = D.b;
  D.at(x, y, z, rot);
  b.box(-1.2, 0, -0.55, 1.2, 0.12, 0.55, 'metal_rust');
  b.box(-1.1, 0.12, -0.5, 1.1, 1.35, 0.5, 'metal_green', { skip: 'pz' });
  b.push(0, 0, 0.5);
  b.panel(-0.45, 0.75, 0, 1.0, 1.0, 'generator_panel');
  b.panel(0.6, 0.75, 0, 0.9, 1.0, 'metal_green');
  b.pop();
  b.box(-1.1, 1.35, -0.3, -0.2, 1.6, 0.3, 'metal_green');
  b.tube(0.8, 1.35, 0, 0.8, 3.0, 0, 0.08, 6, 'metal_rust');
  b.cyl(1.55, 0.0, -0.1, 0.3, 0.95, 8, 'paint_red');
  b.tube(1.3, 0.3, -0.1, 1.1, 0.3, -0.1, 0.02, 4, 'rubber');
  D.solid(-1.2, -0.55, 1.85, 0.55, 0, 1.6);
  D.done();
}

export function drum(D, x, y, z, o = {}) {
  const b = D.b;
  D.at(x, y, z, D.r(0, PI));
  if (o.fallen) {
    b.push(0, 0.29, 0, 0, PI / 2, 0);
    b.cyl(0, -0.45, 0, 0.29, 0.45, 8, o.tex || 'metal_rust', { bottomCap: true });
    b.pop();
    D.solid(-0.45, -0.45, 0.45, 0.45, 0, 0.58);
  } else {
    b.cyl(0, 0, 0, 0.29, 0.9, 8, o.tex || 'metal_rust');
    D.solid(-0.29, -0.29, 0.29, 0.29, 0, 0.9);
  }
  D.done();
}

export function tank(D, x, y, z, r = 0.7, h = 2.3) {
  const b = D.b;
  D.at(x, y, z, D.r(0, PI));
  b.cyl(0, 0, 0, r, h, 10, 'metal_rust', { capTex: 'metal_rust' });
  b.panel(0, 1.4, r + 0.01, 0.2, 0.2, 'boiler_gauge');
  b.tube(0, h, 0, 0, 3.0, 0, 0.08, 6, 'pipe_lagging', { swap: true });
  D.solid(-r, -r, r, r, 0, h);
  D.done();
}

export function pipeRun(D, pts, r, tex) {
  const b = D.b;
  b.group(pts[0][0], pts[0][1], pts[0][2]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay, az] = pts[i];
    const [bx, by, bz] = pts[i + 1];
    b.tube(ax, ay, az, bx, by, bz, r, 6, tex, { urep: 1, swap: tex === 'pipe_lagging' });
  }
  b.ungroup();
}

export function workbench(D, x, y, z, rot) {
  const b = D.b;
  D.at(x, y, z, rot);
  b.box(-1.0, 0.85, -0.35, 1.0, 0.92, 0.35, 'wood_desk');
  for (const [lx, lz] of [[-0.95, -0.3], [0.95, -0.3], [-0.95, 0.3], [0.95, 0.3]]) b.cbox(lx, 0.42, lz, 0.05, 0.85, 0.05, 'metal_rust');
  b.box(-0.95, 0.2, -0.3, 0.95, 0.23, 0.3, 'metal_rust');
  b.box(0.6, 0.92, 0.1, 0.8, 1.05, 0.3, 'metal_green');
  for (let i = 0; i < 4; i++) {
    b.push(D.r(-0.8, 0.4), 0.92, D.r(-0.25, 0.25), D.r(0, PI));
    b.box(-0.12, 0, -0.02, 0.12, 0.025, 0.02, D.pick(['chrome', 'metal_rust', 'paint_red']));
    b.pop();
  }
  D.solid(-1.0, -0.35, 1.0, 0.35, 0, 0.95);
  D.done();
}

export function washer(D, x, y, z, rot) {
  const b = D.b;
  D.at(x, y, z, rot);
  b.box(-0.45, 0, -0.45, 0.45, 1.2, 0.45, 'plastic_white', { skip: 'pz' });
  b.push(0, 0, 0.45);
  b.panel(0, 0.6, 0, 0.9, 1.2, 'metal_painted');
  b.panel(0, 0.62, 0.005, 0.5, 0.5, 'crt_screen');
  b.panel(0, 1.05, 0.005, 0.8, 0.12, 'generator_panel');
  b.pop();
  D.solid(-0.45, -0.45, 0.45, 0.45, 0, 1.2);
  D.done();
}

export function laundryCart(D, x, y, z, rot, o = {}) {
  const b = D.b;
  D.at(x, y, z, rot);
  if (o.tipped) b.push(0, 0.4, 0, 0, 0, PI / 2);
  b.box(-0.45, 0.15, -0.35, 0.45, 0.9, 0.35, { side: 'sheet', top: 'dark', bottom: 'metal_painted' }, { skip: 'py' });
  b.box(-0.43, 0.6, -0.33, 0.43, 0.75, 0.33, 'sheet', { skip: 'ny' });
  for (const [lx, lz] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]]) b.cbox(lx, 0.07, lz, 0.06, 0.14, 0.06, 'rubber');
  if (o.tipped) b.pop();
  D.solid(-0.45, -0.35, 0.45, 0.35, 0, 0.9);
  D.done();
}

// ---------------------------------------------------------- rooms & living

export function pew(D, x, y, z, rot, w = 2.6, o = {}) {
  const b = D.b;
  D.at(x, y, z, rot);
  if (o.tipped) b.push(0, 0.05, 0.4, 0, 1.35, 0);
  b.box(-w / 2, 0.42, -0.2, w / 2, 0.47, 0.22, 'wood_dark');
  b.box(-w / 2, 0.47, -0.26, w / 2, 0.95, -0.2, 'wood_dark');
  b.box(-w / 2, 0, -0.28, -w / 2 + 0.06, 0.98, 0.24, 'wood_dark');
  b.box(w / 2 - 0.06, 0, -0.28, w / 2, 0.98, 0.24, 'wood_dark');
  b.box(-w / 2, 0.06, -0.24, w / 2, 0.12, -0.2, 'wood_dark');
  if (o.tipped) b.pop();
  D.solid(-w / 2, -0.28, w / 2, 0.24, 0, o.tipped ? 0.6 : 0.98);
  D.done();
}

export function couch(D, x, y, z, rot, o = {}) {
  const b = D.b;
  const w = o.w ?? 1.9;
  const t = o.tex || 'vinyl_teal';
  D.at(x, y, z, rot);
  b.box(-w / 2, 0.1, -0.42, w / 2, 0.42, 0.42, t, { scale: 2 });
  b.box(-w / 2, 0.42, -0.45, w / 2, 0.85, -0.25, t, { scale: 2 });
  b.box(-w / 2 - 0.12, 0.1, -0.45, -w / 2, 0.62, 0.42, t, { scale: 2 });
  b.box(w / 2, 0.1, -0.45, w / 2 + 0.12, 0.62, 0.42, t, { scale: 2 });
  if (o.slashed) {
    b.push(D.r(-0.4, 0.4), 0.43, 0.05, D.r(0, PI));
    b.box(-0.3, 0, -0.1, 0.3, 0.05, 0.1, 'mattress');
    b.pop();
  }
  for (const lx of [-w / 2, w / 2]) for (const lz of [-0.35, 0.35]) b.cbox(lx, 0.05, lz, 0.06, 0.1, 0.06, 'wood_dark');
  D.solid(-w / 2 - 0.12, -0.45, w / 2 + 0.12, 0.42, 0, 0.85);
  D.done();
}

export function table(D, x, y, z, rot, o = {}) {
  const b = D.b;
  const w = o.w ?? 1.2, d = o.d ?? 0.8, h = o.h ?? 0.74;
  D.at(x, y, z, rot);
  if (o.tipped) b.push(0, d / 2 - 0.02, -h / 2 + 0.1, 0, -PI / 2, 0);
  b.box(-w / 2, h - 0.04, -d / 2, w / 2, h, d / 2, o.tex || 'wood_desk');
  for (const [lx, lz] of [[-w / 2 + 0.05, -d / 2 + 0.05], [w / 2 - 0.05, -d / 2 + 0.05], [-w / 2 + 0.05, d / 2 - 0.05], [w / 2 - 0.05, d / 2 - 0.05]]) b.cbox(lx, (h - 0.04) / 2, lz, 0.04, h - 0.04, 0.04, 'metal_painted');
  if (o.tipped) b.pop();
  if (o.tipped) D.solid(-w / 2, -h + 0.1, w / 2, 0.35, 0, d);
  else D.solid(-w / 2, -d / 2, w / 2, d / 2, 0, h);
  D.done();
}

export function tv(D, x, y, z, rot, o = {}) {
  const b = D.b;
  D.at(x, y, z, rot);
  const by = o.onFloor ? 0 : 0.75;
  if (!o.onFloor) {
    b.box(-0.45, 0, -0.3, 0.45, 0.72, 0.3, 'wood_dark');
    b.box(-0.45, 0.72, -0.3, 0.45, 0.75, 0.3, 'wood_dark');
  }
  b.box(-0.33, by, -0.25, 0.33, by + 0.5, 0.25, 'plastic_white', { skip: 'pz' });
  b.push(0, by + 0.25, 0.25);
  b.panel(-0.04, 0, 0, 0.5, 0.4, 'crt_screen');
  b.pop();
  D.solid(-0.45, -0.3, 0.45, 0.3, 0, by + 0.5);
  D.done();
}

export function vending(D, x, y, z, rot) {
  const b = D.b;
  D.at(x, y, z, rot);
  b.box(-0.45, 0, -0.4, 0.45, 1.85, 0.4, 'paint_red', { skip: 'pz' });
  b.push(0, 0, 0.4);
  b.panel(-0.1, 1.1, 0, 0.62, 1.2, 'shelf_meds');
  b.panel(0.35, 1.1, 0, 0.16, 1.2, 'metal_steel');
  b.panel(0, 0.3, 0, 0.8, 0.4, 'dark');
  b.pop();
  D.solid(-0.45, -0.4, 0.45, 0.4, 0, 1.85);
  D.done();
}

export function lockers(D, x, y, z, rot, n = 4, o = {}) {
  const b = D.b;
  D.at(x, y, z, rot);
  const w = 0.42;
  const W = w * n;
  b.box(-W / 2, 0, -0.25, W / 2, 1.9, 0.25, 'metal_green', { skip: 'pz' });
  for (let i = 0; i < n; i++) {
    const lx = -W / 2 + w * (i + 0.5);
    if (o.open && o.open.includes(i)) {
      b.box(lx - w / 2 + 0.02, 0.05, 0.2, lx + w / 2 - 0.02, 1.85, 0.25, 'dark', { skip: 'pz' });
      b.push(lx + w / 2 - 0.02, 0, 0.25, -1.9);
      b.quad([0, 0.05, 0], [w - 0.04, 0.05, 0], [w - 0.04, 1.85, 0], [0, 1.85, 0], [0.01, 0.01, 0.99, 0.01, 0.99, 0.99, 0.01, 0.99], 'door_metal', 2);
      b.pop();
    } else {
      b.push(lx, 0, 0.25);
      b.panel(0, 0.95, 0, w - 0.03, 1.8, 'door_metal');
      b.pop();
    }
  }
  D.solid(-W / 2, -0.25, W / 2, 0.25, 0, 1.9);
  D.done();
}

export function counter(D, x, y, z, rot, w, o = {}) {
  // reception / nurse-station counter: front faces +z
  const b = D.b;
  D.at(x, y, z, rot);
  const d = o.d ?? 0.6;
  const front = o.front || 'wood_desk';
  b.box(-w / 2, 0, -d / 2, w / 2, 1.05, -d / 2 + 0.04, front);
  b.box(-w / 2, 0, d / 2 - 0.04, w / 2, 1.05, d / 2, front);
  b.box(-w / 2, 1.05, -d / 2 - 0.05, w / 2, 1.1, d / 2 + 0.05, o.top || 'wood_desk');
  b.box(-w / 2, 0.72, -d / 2 - 0.4, w / 2, 0.76, -d / 2, 'wood_desk');
  b.box(-w / 2, 0, -d / 2, -w / 2 + 0.04, 1.05, d / 2, front);
  b.box(w / 2 - 0.04, 0, -d / 2, w / 2, 1.05, d / 2, front);
  D.solid(-w / 2, -d / 2 - 0.4, w / 2, d / 2 + 0.05, 0, 1.1);
  D.done();
}

export function stall(D, x0, z0, x1, z1, y) {
  // toilet stall partitions (thin metal walls) along x, opening to +z
  const b = D.b;
  b.group((x0 + x1) / 2, y + 1, (z0 + z1) / 2);
  const n = Math.round((x1 - x0) / 0.95);
  for (let i = 0; i <= n; i++) {
    const px = x0 + i * ((x1 - x0) / n);
    b.box(px - 0.02, y + 0.15, z0, px + 0.02, y + 1.95, z1, 'metal_painted');
    D.level.addCollider(px - 0.03, y, z0, px + 0.03, y + 2, z1);
  }
  for (let i = 0; i < n; i++) {
    const px = x0 + (i + 0.5) * ((x1 - x0) / n);
    b.box(px - 0.2, y, z0 + 0.05, px + 0.2, y + 0.42, z0 + 0.6, 'plastic_white');
    b.box(px - 0.22, y + 0.42, z0 + 0.05, px + 0.22, y + 0.45, z0 + 0.62, 'plastic_white');
    b.box(px - 0.22, y + 0.45, z0 + 0.0, px + 0.22, y + 0.85, z0 + 0.12, 'plastic_white');
    // half-open stall door
    const ang = i % 2 ? -1.0 : -2.2;
    b.push(px - (x1 - x0) / n / 2 + 0.03, y, z1, ang);
    b.box(0, 0.15, -0.015, (x1 - x0) / n - 0.08, 1.9, 0.015, 'metal_painted');
    b.pop();
  }
  b.ungroup();
}

export function planter(D, x, y, z) {
  const b = D.b;
  D.at(x, y, z, D.r(0, PI));
  b.box(-0.35, 0, -0.35, 0.35, 0.6, 0.35, 'wood_dark');
  b.box(-0.32, 0.6, -0.32, 0.32, 0.55, 0.32, 'floor_concrete', { skip: 'ny' });
  b.tube(0, 0.55, 0, 0.15, 1.5, 0.05, 0.02, 3, 'wood_dark');
  b.tube(0.1, 1.1, 0.03, -0.25, 1.4, 0.1, 0.01, 3, 'wood_dark');
  b.tube(0.12, 1.3, 0.04, 0.35, 1.55, -0.1, 0.01, 3, 'wood_dark');
  D.solid(-0.35, -0.35, 0.35, 0.35, 0, 0.6);
  D.done();
}

export function fridge(D, x, y, z, rot) {
  const b = D.b;
  D.at(x, y, z, rot);
  b.box(-0.35, 0, -0.33, 0.35, 1.7, 0.33, 'plastic_white');
  b.box(0.25, 0.9, 0.33, 0.29, 1.3, 0.37, 'chrome');
  b.box(-0.35, 1.18, 0.33, 0.35, 1.2, 0.335, 'dark');
  D.solid(-0.35, -0.33, 0.35, 0.33, 0, 1.7);
  D.done();
}

export function crt(D, x, y, z, rot) {
  const b = D.b;
  D.at(x, y, z, rot);
  b.box(-0.2, 0, -0.22, 0.2, 0.34, 0.18, 'plastic_white', { skip: 'pz' });
  b.push(0, 0.18, 0.18);
  b.panel(0, 0, 0, 0.32, 0.26, 'crt_screen');
  b.pop();
  b.box(-0.22, -0.03, -0.1, 0.22, 0, 0.2, 'plastic_white');
  D.done();
}

export function fallenDoor(D, x, y, z, rot, tex = 'door_wood') {
  const b = D.b;
  D.at(x, y, z, rot);
  b.push(0, 0.025, 0, 0, -PI / 2 + 0.04, 0);
  b.box(-0.48, 0, -0.025, 0.48, 2.05, 0.025, { pz: tex, nz: tex, side: 'wood_dark' }, { uv: 'fit' });
  b.pop();
  D.done();
}

// ------------------------------------------------------------ story set pieces

// The explorers' camp: sleeping bags on a tarp, a cold fire ring, cans, candles.
export function campsite(D, x, y, z, rot) {
  const b = D.b;
  D.at(x, y, z, rot);
  b.floorDecal(0, 0.006, 0, 2.4, 2.8, 0.05, 'tarp');
  // two sleeping bags, one rumpled and unzipped
  b.push(-0.55, 0.008, -0.2, 0.08);
  b.box(-0.38, 0, -0.95, 0.38, 0.1, 0.95, 'sleeping_bag');
  b.push(0, 0.1, -0.85, 0, 0, PI / 2);
  b.cyl(0, -0.3, 0, 0.12, 0.3, 6, 'sleeping_bag');
  b.pop();
  b.pop();
  b.push(0.5, 0.008, 0.1, -0.25);
  b.box(-0.38, 0, -0.95, 0.38, 0.06, 0.95, 'sleeping_bag');
  b.push(0.12, 0.06, 0.2, 0, 0, 0.2);
  b.box(-0.35, 0, -0.5, 0.3, 0.08, 0.6, 'sleeping_bag');
  b.pop();
  b.pop();
  // backpack against the wall-side
  b.push(-1.25, 0, -0.9, 0.4);
  b.box(-0.18, 0, -0.12, 0.18, 0.5, 0.12, 'tarp');
  b.box(-0.17, 0.38, -0.14, 0.17, 0.52, 0.1, 'sleeping_bag');
  b.pop();
  // fire ring: bricks around ash, scorch on the floor
  b.push(0.3, 0, 1.55);
  b.floorDecal(0, 0.012, 0, 1.2, 1.2, 0.3, 'scorch');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    b.push(Math.sin(a) * 0.38, 0, Math.cos(a) * 0.38, a + D.r(-0.2, 0.2));
    b.box(-0.1, 0, -0.05, 0.1, 0.07, 0.05, 'wall_brick');
    b.pop();
  }
  for (let i = 0; i < 4; i++) {
    b.push(D.r(-0.15, 0.15), 0.02, D.r(-0.15, 0.15), D.r(0, PI), 0, PI / 2);
    b.cyl(0, -0.15, 0, 0.025, 0.15, 4, 'wood_dark', { caps: false });
    b.pop();
  }
  b.pop();
  // cans, a pot on a camp stove, bottles
  const cans = [[0.9, 0.9], [1.05, 0.8], [0.95, 1.05], [-0.9, 1.1], [1.2, -0.5]];
  for (const [px, pz] of cans) b.cyl(px, 0, pz, 0.035, 0.11, 6, 'can_label', { capTex: 'chrome' });
  b.push(1.1, 0, 0.6, 0, 0, PI / 2);
  b.cyl(0, -0.06, 0.05, 0.035, 0.05, 6, 'can_label');
  b.pop();
  b.box(-1.05, 0, 0.6, -0.8, 0.08, 0.85, 'metal_steel');
  b.cyl(-0.925, 0.08, 0.725, 0.1, 0.2, 7, 'chrome', { capTex: 'dark' });
  b.cyl(1.3, 0, 0.2, 0.04, 0.26, 5, 'plastic_white', { capTex: 'paint_red' });
  // candle stubs on a plate
  b.cyl(-0.2, 0, -1.25, 0.12, 0.01, 7, 'plastic_white');
  for (const [px, pz, h] of [[-0.25, -1.25, 0.08], [-0.15, -1.2, 0.05], [-0.2, -1.32, 0.1]]) b.cyl(px, 0.01, pz, 0.02, 0.01 + h, 5, 'white');
  // magazines and a notebook page
  b.floorDecal(0.6, 0.012, -1.1, 0.25, 0.32, 0.4, 'paper');
  b.floorDecal(0.75, 0.013, -1.0, 0.25, 0.32, 1.1, 'folder');
  D.solid(-0.4, 1.15, 1.0, 1.95, 0, 0.12);
  D.zone(x, z, y, 1.4, 'carpet');
  D.done();
}

// Boards nailed across a doorway (on the side facing +z in local space).
export function barricade(D, x, y, z, rot, w = 1.0) {
  const b = D.b;
  D.at(x, y, z, rot);
  const planks = [[0.4, 0.25], [0.95, -0.2], [1.45, 0.15], [1.8, -0.05], [0.7, 0.0]];
  for (const [py, ang] of planks) {
    b.push(0, py, 0.06, 0, 0, ang);
    b.box(-w / 2 - 0.25, -0.08, 0, w / 2 + 0.25, 0.08, 0.03, 'boards');
    b.cbox(-w / 2 - 0.1, 0, 0.032, 0.02, 0.02, 0.004, 'chrome');
    b.cbox(w / 2 + 0.1, 0, 0.032, 0.02, 0.02, 0.004, 'chrome');
    b.pop();
  }
  D.done();
}
