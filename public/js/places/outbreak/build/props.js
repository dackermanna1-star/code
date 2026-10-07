// Everything outdoors that isn't a building: fences and walls, street lamps,
// benches, bus stops, bins, power poles, woodpiles and wells, sandbags,
// concrete barriers, shipping containers, and the wrecked cars, vans,
// lorries and buses left where they stopped.
import { mat } from './kit.js';
import { S } from './parts.js';

const P = {
  picket: mat('woodPaint', 0xe8e4dc), boards: mat('planks', 0xb0a088), post: mat('woodFine', 0x6a5a48),
  concrete: mat('panel', 0xc8c4bc), concreteDark: mat('concrete', 0x9a968e), metal: mat('metal', 0x8a8e88), metalRust: mat('metalRust'),
  pole: mat('concrete', 0xb4b0a8), poleWood: mat('bark2', 0x8a7a68), lamp: mat('metal', 0x3a3c3e, { p: 4 }),
  green: mat('metal', 0x3a5a3a, { p: 4 }), yellow: mat('metal', 0xd8b030, { p: 4 }),
  sandbag: mat('fabric', 0xa89878), sandbagGreen: mat('fabric', 0x7a7a5a),
  tyre: mat('plaster', 0x1e1e1e, { p: 5, r: 220 }), chrome: mat('metal', 0xc8ccd0, { p: 5, r: 60 }), lightW: mat('plaster', 0xf8f4e0, { p: 5, r: 40 }), lightR: mat('plaster', 0xb02018, { p: 5, r: 40 }),
  seat: mat('fabric', 0x4a3a30), dash: mat('plaster', 0x2a2a2a, { p: 5 }),
};
const rnd = (K, a) => a[Math.floor(K.r() * a.length)];

// --- fences and walls ---------------------------------------------------------------------------------------------------------
/** A fence from (x0, z0) to (x1, z1). kind: picket | boards | wire | concrete | metal | military | low (a low wall). */
export function fence(K, x0, z0, x1, z1, kind = 'picket', o = {}) { K.details(() => fenceParts(K, x0, z0, x1, z1, kind, o)); }
function fenceParts(K, x0, z0, x1, z1, kind, o) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  if (L < 0.5) return;
  const r = K.r;
  const yaw = Math.atan2(-(z1 - z0), x1 - x0);
  K.push((x0 + x1) / 2, 0, (z0 + z1) / 2, yaw);
  const nc = { col: false };
  // a fence leans and has gaps where it's fallen down
  const gapAt = r() < (o.gaps ?? 0.25) ? (r() - 0.5) * L * 0.7 : null, gapW = 3 + r() * 4;
  const inGap = (x) => gapAt !== null && Math.abs(x - gapAt) < gapW / 2;
  if (kind === 'picket' || kind === 'boards') {
    const h = kind === 'picket' ? 3.6 : 5.6;
    const n = Math.max(1, Math.round(L / 7));
    for (let i = 0; i <= n; i++) { const x = -L / 2 + L * i / n; if (!inGap(x)) K.box(x, h / 2 + 0.2, 0, 0.22, h / 2 + 0.2, 0.22, P.post, { col: false, skip: 'ny' }); }
    for (const yy of [1.0, h - 0.8]) segments(-L / 2, L / 2, inGap, (a, b) => K.box((a + b) / 2, yy, 0.25, (b - a) / 2, 0.15, 0.06, P.post, nc));
    if (kind === 'picket') {
      const m = o.m || (r() < 0.5 ? P.picket : mat('woodPaint', rnd(K, [0xb8c8b8, 0xc8b8a0, 0x9ab0c0])));
      for (let x = -L / 2 + 0.4; x < L / 2 - 0.2; x += 1.15) if (!inGap(x)) K.box(x, h / 2 + (r() - 0.5) * 0.2, 0.36, 0.3, h / 2, 0.05, m, { col: false, skip: 'ny py' });
    } else segments(-L / 2, L / 2, inGap, (a, b) => K.box((a + b) / 2, h / 2 + 0.3, 0.36, (b - a) / 2, h / 2, 0.08, o.m || P.boards, { col: false }));
    segments(-L / 2, L / 2, inGap, (a, b) => K.solid((a + b) / 2, h / 2, 0.2, (b - a) / 2, h / 2, 0.3, 'wood'));
  } else if (kind === 'wire') {
    const n = Math.max(1, Math.round(L / 9));
    for (let i = 0; i <= n; i++) K.box(-L / 2 + L * i / n, 2.4, 0, 0.18, 2.4, 0.18, P.post, nc);
    for (const yy of [1.4, 2.8, 4.2]) K.box(0, yy, 0, L / 2, 0.03, 0.03, P.lamp, nc);
    K.solid(0, 2.4, 0, L / 2, 2.4, 0.3, 'metal', { extra: { shootable: false } });
  } else if (kind === 'concrete' || kind === 'military') {
    // panels between posts, with a diamond pattern pressed in
    const h = 8, pw = 12, n = Math.max(1, Math.round(L / pw));
    for (let i = 0; i < n; i++) {
      const a = -L / 2 + L * i / n, b = a + L / n, c = (a + b) / 2;
      if (inGap(c) && kind !== 'military') continue;
      K.box(c, h / 2, 0, L / n / 2 - 0.05, h / 2, 0.35, P.concrete, { skip: 'ny' });
      K.box(a, h / 2 + 0.2, 0, 0.45, h / 2 + 0.2, 0.5, P.concreteDark, nc);
    }
    if (kind === 'military') {
      // barbed wire along the top
      for (let x = -L / 2; x < L / 2; x += 2.4) K.box(x, h + 0.9, 0, 0.06, 0.9, 0.06, P.lamp, nc);
      for (const yy of [h + 0.6, h + 1.3, h + 1.75]) K.box(0, yy, 0, L / 2, 0.04, 0.04, P.lamp, nc);
    }
  } else if (kind === 'metal') {
    const h = 7;
    segments(-L / 2, L / 2, inGap, (a, b) => K.box((a + b) / 2, h / 2, 0, (b - a) / 2, h / 2, 0.15, r() < 0.5 ? P.metalRust : P.metal, { skip: 'ny' }));
  } else if (kind === 'low') {
    K.box(0, 1.2, 0, L / 2, 1.2, 0.6, o.m || mat('stone', 0xb8b0a8), { skip: 'ny' });
  }
  K.pop();
}
function segments(a0, a1, inGap, fn) {
  let a = a0;
  const step = 0.5;
  for (let x = a0; x <= a1; x += step) {
    if (inGap(x)) { if (x - a > 0.3) fn(a, x); a = x + step; while (x + step <= a1 && inGap(x + step)) { x += step; a = x + step; } }
  }
  if (a1 - a > 0.3) fn(a, a1);
}

// --- small things about the place --------------------------------------------------------------------------------------------------
export function woodpile(K, x, y, z, yaw) { K.details(() => woodpileParts(K, x, y, z, yaw)); }
function woodpileParts(K, x, y, z, yaw) {
  K.push(x, y, z, yaw);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 6 - i; j++) K.cyl(-3 + j * 1.0 + i * 0.5, 0, (K.r() - 0.5) * 0.2, 0.48, 3.8, mat('bark2'), { seg: 6, col: false, top: mat('woodFine', 0xd8b890) });
  K.solid(0, 1.2, 0, 3.2, 1.2, 2, 'wood');
  K.pop();
}

export function well(K, x, y, z) { K.details(() => wellParts(K, x, y, z)); }
function wellParts(K, x, y, z) {
  K.cyl(x, y, z, 2.2, 3, mat('stone', 0xb0a8a0), { seg: 10, top: mat('stone', 0x8a8480) });
  K.box(x, y + 3.05, z, 1.8, 0.05, 1.8, mat('plaster', 0x101010, { p: 5 }), { col: false });
  for (const s of [-1, 1]) K.box(x + s * 1.9, y + 5, z, 0.2, 2.2, 0.2, P.post, { col: false });
  K.quad([x - 2.6, y + 6.6, z + 2], [x + 2.6, y + 6.6, z + 2], [x + 2.6, y + 8, z], [x - 2.6, y + 8, z], mat('planks', 0x8a7a68), { both: true });
  K.quad([x + 2.6, y + 6.6, z - 2], [x - 2.6, y + 6.6, z - 2], [x - 2.6, y + 8, z], [x + 2.6, y + 8, z], mat('planks', 0x8a7a68), { both: true });
}

export function streetLamp(K, x, y, z, yaw) { K.details(() => streetLampParts(K, x, y, z, yaw)); }
function streetLampParts(K, x, y, z, yaw) {
  K.push(x, y, z, yaw);
  K.cyl(0, 0, 0, 0.32, 15, P.pole, { seg: 6, col: true });
  K.box(0, 15, 1.6, 0.14, 0.14, 1.8, P.lamp, { col: false });
  K.box(0, 14.75, 3.2, 0.5, 0.25, 0.9, P.lamp, { col: false });
  K.box(0, 14.47, 3.2, 0.4, 0.04, 0.75, P.lightW, { col: false });
  K.pop();
}

export function bench(K, x, y, z, yaw) { K.details(() => benchParts(K, x, y, z, yaw)); }
function benchParts(K, x, y, z, yaw) {
  K.push(x, y, z, yaw);
  for (const s of [-1, 1]) K.box(s * 2.4, 0.8, 0, 0.12, 0.8, 0.9, P.lamp, { col: false });
  for (let i = 0; i < 3; i++) K.box(0, 1.65, -0.6 + i * 0.6, 2.8, 0.08, 0.24, mat('woodFine', 0x9a7a5a), { col: false });
  for (let i = 0; i < 2; i++) K.box(0, 2.4 + i * 0.6, -0.95, 2.8, 0.2, 0.06, mat('woodFine', 0x9a7a5a), { col: false });
  K.solid(0, 1, 0, 2.8, 1, 1, 'wood');
  K.pop();
}

export function bin(K, x, y, z) { K.cyl(x, y, z, 0.8, 2.6, P.green, { seg: 8, top: mat('plaster', 0x1a1a1a, { p: 5 }) }); }

export function dumpster(K, x, y, z, yaw) { K.details(() => dumpsterParts(K, x, y, z, yaw)); }
function dumpsterParts(K, x, y, z, yaw) {
  K.push(x, y, z, yaw);
  const m = rnd(K, [P.green, mat('metal', 0x5a6a7a, { p: 4 }), P.metalRust]);
  K.box(0, 2.3, 0, 3.6, 1.9, 2.4, m, { skip: 'ny' });
  K.box(0, 4.3, -0.2, 3.7, 0.12, 2.5, m, { col: false, yaw: 0 });
  for (const s of [-1, 1]) for (const t of [-1, 1]) K.cyl(s * 3, 0, t * 1.8, 0.35, 0.5, P.tyre, { seg: 6, col: false });
  K.lootAt(0, 4.45, 0, 'trash');
  K.pop();
}

export function busStop(K, x, y, z, yaw) { K.details(() => busStopParts(K, x, y, z, yaw)); }
function busStopParts(K, x, y, z, yaw) {
  K.push(x, y, z, yaw);
  K.box(0, 0.15, 0, 6, 0.15, 3, mat('pavers', 0xb8b4ac), { skip: 'ny' });
  K.box(0, 4.8, -2.6, 6, 4.5, 0.3, P.concrete, { skip: 'ny' });
  for (const s of [-1, 1]) K.box(s * 5.8, 4.8, -0.6, 0.25, 4.5, 2.2, P.concrete, { skip: 'ny' });
  K.box(0, 9.5, -0.4, 6.4, 0.3, 3, P.concreteDark, {});
  K.box(0, 1.6, -1.8, 5, 0.25, 0.6, mat('woodFine', 0x8a6a4a), { col: false });
  K.lootAt(2, 0.35, -0.5, 'trash');
  K.pop();
}

/** A wooden power pole with a cross-arm (the wires are drawn between poles by the caller). */
export function powerPole(K, x, y, z, yaw) { K.details(() => powerPoleParts(K, x, y, z, yaw)); }
function powerPoleParts(K, x, y, z, yaw) {
  K.push(x, y, z, yaw);
  K.cyl(0, 0, 0, 0.42, 26, P.poleWood, { seg: 6, col: true });
  K.box(0, 24.5, 0, 3.4, 0.25, 0.25, P.post, { col: false });
  for (const s of [-2.8, 0, 2.8]) K.box(s, 25.1, 0, 0.14, 0.35, 0.14, mat('plaster', 0xd8d0c0, { p: 5 }), { col: false });
  K.pop();
}

export function sandbags(K, x0, z0, x1, z1, rows = 3, o = {}) { K.details(() => sandbagsParts(K, x0, z0, x1, z1, rows, o)); }
function sandbagsParts(K, x0, z0, x1, z1, rows = 3, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0);
  K.push((x0 + x1) / 2, o.y ?? 0, (z0 + z1) / 2, yaw);
  const m = o.green ? P.sandbagGreen : P.sandbag;
  for (let i = 0; i < rows; i++) {
    const n = Math.max(1, Math.round(L / 2.4)), off = (i % 2) * 1.2;
    for (let j = 0; j < n; j++) {
      const x = -L / 2 + 1.2 + j * (L / n) + off * 0.5;
      if (x > L / 2) continue;
      K.box(Math.min(x, L / 2 - 1.1), 0.5 + i * 0.95, 0, 1.15, 0.47, 0.85, m, { col: false, yaw: (K.r() - 0.5) * 0.12 });
    }
  }
  K.solid(0, rows * 0.95 / 2, 0, L / 2, rows * 0.95 / 2, 0.9, 'cloth', { extra: { cover: true } });
  K.pop();
}

/** A concrete road barrier (Jersey barrier). */
export function barrier(K, x, y, z, yaw, o = {}) { K.details(() => barrierParts(K, x, y, z, yaw, o)); }
function barrierParts(K, x, y, z, yaw, o = {}) {
  K.push(x, y, z, yaw);
  const m = o.m || P.concreteDark;
  K.box(0, 0.6, 0, 3.2, 0.6, 1.0, m, { skip: 'ny' });
  K.box(0, 2.0, 0, 3.2, 0.8, 0.45, m, { col: false });
  K.solid(0, 1.4, 0, 3.2, 1.4, 0.9, 'concrete', { extra: { cover: true } });
  if (o.stripes) for (let i = 0; i < 3; i++) K.box(-2 + i * 2, 2.0, 0.47, 0.4, 0.7, 0.02, P.yellow, { col: false, yaw: 0.6 });
  K.pop();
}

/** A steel anti-tank "hedgehog". */
export function hedgehog(K, x, y, z, yaw) { K.details(() => hedgehogParts(K, x, y, z, yaw)); }
function hedgehogParts(K, x, y, z, yaw) {
  K.push(x, y + 1.6, z, yaw);
  const m = P.metalRust;
  K.box(0, 0, 0, 2.2, 0.2, 0.2, m, { col: false, yaw: 0 });
  K.push(0, 0, 0, Math.PI / 2); K.box(0, 0, 0, 2.2, 0.2, 0.2, m, { col: false }); K.pop();
  K.box(0, 0, 0, 0.2, 2.0, 0.2, m, { col: false });
  K.solid(0, 0, 0, 1.6, 1.6, 1.6, 'metal');
  K.pop();
}

export function tyres(K, x, y, z) { K.details(() => tyresParts(K, x, y, z)); }
function tyresParts(K, x, y, z) {
  const n = 2 + Math.floor(K.r() * 4);
  for (let i = 0; i < n; i++) K.cyl(x + (K.r() - 0.5) * 0.4, y + i * 0.85, z + (K.r() - 0.5) * 0.4, 1.3, 0.85, P.tyre, { seg: 10, col: i === 0, top: mat('plaster', 0x0e0e0e, { p: 5 }) });
}

/**
 * A shipping container (8 wide, 8.5 high, 20 long along local x), colour tint.
 * o.open: one end open (enterable, with loot inside); o.y stacked height.
 */
export function container(K, x, y, z, yaw, tint, o = {}) {
  K.push(x, y, z, yaw);
  const m = mat('container', tint), L = 10, W = 4, H = 8.5;
  const inside = mat('container', tint & 0xbfbfbf);
  if (!o.open) {
    K.box(0, H / 2, 0, L, H / 2, W, m, { skip: 'ny', mat: 'metal' });
  } else {
    // walls, floor and roof; the doors at +x swung open
    K.box(0, 0.25, 0, L, 0.25, W, { top: mat('planks', 0x8a7a68), side: m, bottom: m }, {});
    K.box(0, H - 0.15, 0, L, 0.15, W, { top: m, bottom: inside, side: m }, {});
    for (const s of [-1, 1]) K.box(0, H / 2, s * (W - 0.12), L, H / 2 - 0.3, 0.12, { side: s > 0 ? m : inside, pz: s > 0 ? m : inside, nz: s > 0 ? inside : m }, { aoF: { [s > 0 ? 'nz' : 'pz']: 0.45 } });
    K.box(-L + 0.12, H / 2, 0, 0.12, H / 2 - 0.3, W - 0.24, { side: m, px: inside }, { aoF: { px: 0.45 } });
    for (const s of [-1, 1]) K.box(L + 0.2, H / 2, s * (W + 1.8), 0.1, H / 2 - 0.4, 2, m, { col: true, yaw: 0 });
    K.room(-L, -W, L, W, y + 0.5, H - 1, 'container');
    K.lootAt(-L + 2, 0.5, 0, o.loot || 'industrial', { spread: 1.5 });
    if (K.r() < 0.5) K.lootAt(-2, 0.5, (K.r() - 0.5) * 3, o.loot || 'industrial', { spread: 1.5 });
  }
  // corner castings and the ribs
  for (let i = -4; i <= 4; i++) K.box(i * 2.3, H / 2, W + 0.06, 0.08, H / 2 - 0.4, 0.06, m, { col: false });
  for (let i = -4; i <= 4; i++) K.box(i * 2.3, H / 2, -W - 0.06, 0.08, H / 2 - 0.4, 0.06, m, { col: false });
  K.pop();
}

// --- vehicles ----------------------------------------------------------------------------------------------------------------
const CAR_COLOURS = [0x8a2a22, 0xe8e4d8, 0x3a5a8a, 0xc8b890, 0x4a6a4a, 0x2a2a2e, 0xa8a8a0, 0xb88a3a, 0x6a2a4a];

/** A wheel: an 8-sided disc on its side, along local x. */
function wheel(K, x, y, z, r, w, flat = false) {
  K.push(x, y, z, 0);
  const n = 8, m = P.tyre, hub = P.chrome;
  const rr = flat ? r * 0.85 : r;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    const p = (a, s) => [s * w / 2, Math.sin(a) * rr - (flat ? r * 0.15 : 0), Math.cos(a) * rr];
    K.quad(p(a0, -1), p(a0, 1), p(a1, 1), p(a1, -1), m, {});
  }
  for (const s of [-1, 1]) {
    const c = [s * w / 2, -(flat ? r * 0.15 : 0), 0];
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      const q0 = [s * w / 2, Math.sin(a0) * rr + c[1], Math.cos(a0) * rr], q1 = [s * w / 2, Math.sin(a1) * rr + c[1], Math.cos(a1) * rr];
      if (s > 0) K.tri(c, q1, q0, i % 2 ? m : hub); else K.tri(c, q0, q1, i % 2 ? m : hub);
    }
  }
  K.pop();
}

/**
 * A wrecked vehicle at (x, y, z) facing yaw (its front to +z of its frame).
 * kind: sedan | hatch | van | truck | bus | police | ambulance | tractor | military.
 */
export function vehicle(K, x, y, z, yaw, kind = 'sedan', o = {}) { K.details(() => vehicleParts(K, x, y, z, yaw, kind, o)); }
function vehicleParts(K, x, y, z, yaw, kind, o) {
  const r = K.r;
  K.push(x, y, z, yaw);
  const rust = r() < 0.4;
  const paint = o.colour ?? (kind === 'police' ? 0xe8e8e4 : kind === 'ambulance' ? 0xf0f0ec : kind === 'military' || kind === 'truck' && o.military ? 0x5a6248 : rnd(K, CAR_COLOURS));
  const body = rust ? mat('metalRust', paint | 0x404040) : mat('metal', paint, { p: 5, r: 110 });
  const glass = S.glass;
  const broken = r() < 0.45;
  const flat = [r() < 0.4, r() < 0.4, r() < 0.4, r() < 0.4];
  const nc = { col: false };
  if (kind === 'sedan' || kind === 'police' || kind === 'hatch') {
    const L = kind === 'hatch' ? 12 : 14, W = 5.6;
    const hb = kind === 'hatch';
    K.box(0, 2.0, 0, W / 2, 0.9, L / 2, body, { skip: 'ny', mat: 'metal' });
    K.box(0, 1.05, 0, W / 2 - 0.3, 0.3, L / 2 - 1.2, mat('plaster', 0x1a1a1a, { p: 5 }), nc);
    // the cabin: pillars and glass, a roof
    const c0 = hb ? -L / 2 + 0.6 : -2.6, c1 = 2.6, ch = 1.9, top = 2.9 + ch;
    K.box(0, top + 0.1, (c0 + c1) / 2 - 0.2, W / 2 - 0.3, 0.12, (c1 - c0) / 2 - 0.6, body, nc);
    for (const s of [-1, 1]) {
      K.box(s * (W / 2 - 0.35), 2.9 + ch / 2, c1 - 0.3, 0.12, ch / 2, 0.15, body, nc);
      K.box(s * (W / 2 - 0.35), 2.9 + ch / 2, c0 + 0.3, 0.12, ch / 2, 0.15, body, nc);
      K.box(s * (W / 2 - 0.35), 2.9 + ch / 2, (c0 + c1) / 2, 0.1, ch / 2, 0.1, body, nc);
      if (!broken || s > 0) K.box(s * (W / 2 - 0.32), 2.9 + ch / 2, (c0 + c1) / 2 - 0.2, 0.04, ch / 2 - 0.15, (c1 - c0) / 2 - 0.45, glass, { glass: true, col: false });
    }
    if (!broken) K.quad([-W / 2 + 0.4, 2.95, c1], [W / 2 - 0.4, 2.95, c1], [W / 2 - 0.4, top, c1 - 1.2], [-W / 2 + 0.4, top, c1 - 1.2], glass, { glass: true, both: true });
    K.quad([W / 2 - 0.4, 2.95, c0], [-W / 2 + 0.4, 2.95, c0], [-W / 2 + 0.4, top, c0 + (hb ? 0.3 : 1.0)], [W / 2 - 0.4, top, c0 + (hb ? 0.3 : 1.0)], glass, { glass: true, both: true });
    // seats and a dashboard you can see through the glass
    for (const s of [-1, 1]) K.box(s * 1.2, 3.2, 0.4, 0.9, 0.9, 0.35, P.seat, nc);
    K.box(0, 3.1, -1.5, W / 2 - 0.5, 0.7, 0.35, P.seat, nc);
    K.box(0, 3.1, c1 - 0.6, W / 2 - 0.5, 0.25, 0.5, P.dash, nc);
    // lights and bumpers
    for (const s of [-1, 1]) { K.box(s * 1.9, 2.3, L / 2 + 0.02, 0.6, 0.3, 0.04, P.lightW, nc); K.box(s * 2.0, 2.3, -L / 2 - 0.02, 0.55, 0.28, 0.04, P.lightR, nc); }
    K.box(0, 1.35, L / 2 + 0.15, W / 2, 0.25, 0.15, P.chrome, nc); K.box(0, 1.35, -L / 2 - 0.15, W / 2, 0.25, 0.15, P.chrome, nc);
    if (kind === 'police') { for (const s of [-1, 1]) K.box(s * (W / 2 + 0.01), 2.1, 0, 0.02, 0.3, L / 2 - 0.5, mat('metal', 0x2a4a9a, { p: 5 }), nc); K.box(0, top + 0.45, -0.3, 1.6, 0.22, 0.35, mat('plaster', 0x2a4ac8, { p: 5, r: 40 }), nc); }
    for (const [i, sx, sz] of [[0, -1, 1], [1, 1, 1], [2, -1, -1], [3, 1, -1]]) wheel(K, sx * (W / 2 - 0.35), 1.2, sz * (L / 2 - 2.6), 1.15, 0.8, flat[i]);
    K.solid(0, 2.3, 0, W / 2, 1.5, L / 2, 'metal', { extra: { cover: true, vehicle: true } });
    K.solid(0, 3.9, (c0 + c1) / 2, W / 2 - 0.3, 1.0, (c1 - c0) / 2, 'metal', { extra: { vehicle: true } });
    K.lootAt(0, 2.95, -L / 2 + 1.5, o.loot || 'vehicle');
  } else if (kind === 'van' || kind === 'ambulance') {
    const L = 15, W = 6.2, H = 7.2;
    K.box(0, 1.2 + H / 2, -1, W / 2, H / 2, L / 2 - 1, body, { skip: 'ny', mat: 'metal' });
    K.box(0, 1.2 + 1.6, L / 2 - 1.1, W / 2, 1.6, 1.1, body, { skip: 'ny' });
    K.quad([-W / 2 + 0.3, 4.4, L / 2 - 2], [W / 2 - 0.3, 4.4, L / 2 - 2], [W / 2 - 0.3, 7.6, L / 2 - 2.9], [-W / 2 + 0.3, 7.6, L / 2 - 2.9], glass, { glass: true, both: true });
    for (const s of [-1, 1]) {
      K.box(s * (W / 2 + 0.02), 6.2, 3.5, 0.03, 1.2, 1.8, glass, { glass: true, col: false });
      for (let i = 0; i < 2; i++) K.box(s * (W / 2 + 0.02), 6.2, -1 - i * 4, 0.03, 1.0, 1.6, glass, { glass: true, col: false });
    }
    if (kind === 'ambulance') for (const s of [-1, 1]) K.box(s * (W / 2 + 0.04), 4.5, -1, 0.02, 0.45, L / 2 - 1.5, mat('metal', 0xc02020, { p: 5 }), nc);
    for (const [i, sx, sz] of [[0, -1, 1], [1, 1, 1], [2, -1, -1], [3, 1, -1]]) wheel(K, sx * (W / 2 - 0.4), 1.25, sz * (L / 2 - 2.8), 1.25, 0.9, flat[i]);
    K.solid(0, 1.2 + H / 2, 0, W / 2, H / 2, L / 2, 'metal', { extra: { cover: true, vehicle: true } });
    K.lootAt(0, 0.3, -L / 2 - 1.2, kind === 'ambulance' ? 'medical' : (o.loot || 'vehicle'));
  } else if (kind === 'truck' || kind === 'military') {
    const L = 26, W = 7.6;
    // the cab
    K.box(0, 2.0, L / 2 - 4, W / 2 - 0.4, 0.6, 4, mat('plaster', 0x1c1c1c, { p: 5 }), nc);
    K.box(0, 5.2, L / 2 - 3.6, W / 2, 2.6, 3.4, body, { skip: 'ny', mat: 'metal' });
    K.box(0, 3.3, L / 2 - 0.3, W / 2 - 0.2, 1.3, 0.6, body, nc);
    if (!broken) K.box(0, 6.3, L / 2 - 0.2, W / 2 - 0.6, 1.0, 0.04, glass, { glass: true, col: false });
    // the bed and its canvas
    K.box(0, 3.4, -3.5, W / 2, 0.3, 9, mat('planks', 0x7a6a58), {});
    for (const s of [-1, 1]) K.box(s * (W / 2 - 0.1), 4.4, -3.5, 0.12, 1.0, 9, body, {});
    K.box(0, 4.4, -12.4, W / 2, 1.0, 0.12, body, {});
    if (kind === 'military' || r() < 0.5) {
      const cv = mat('fabric', 0x6a6a4a);
      K.quad([-W / 2, 5.4, -12.5], [-W / 2, 5.4, 5.5], [-W / 2, 9.6, 5.5], [-W / 2, 9.6, -12.5], cv, { both: true, back: cv, backAo: 0.4 });
      K.quad([W / 2, 5.4, 5.5], [W / 2, 5.4, -12.5], [W / 2, 9.6, -12.5], [W / 2, 9.6, 5.5], cv, { both: true, back: cv, backAo: 0.4 });
      K.quad([-W / 2, 9.6, 5.5], [W / 2, 9.6, 5.5], [W / 2, 10.2, -3.5], [-W / 2, 10.2, -3.5], cv, { back: cv, backAo: 0.4 });
      K.quad([-W / 2, 10.2, -3.5], [W / 2, 10.2, -3.5], [W / 2, 9.6, -12.5], [-W / 2, 9.6, -12.5], cv, { back: cv, backAo: 0.4 });
      K.solid(-W / 2, 7.5, -3.5, 0.2, 2.1, 9, 'cloth'); K.solid(W / 2, 7.5, -3.5, 0.2, 2.1, 9, 'cloth');
    }
    for (const sz of [L / 2 - 4, -6, -10]) for (const sx of [-1, 1]) wheel(K, sx * (W / 2 - 0.5), 1.6, sz, 1.55, 1.1, r() < 0.3);
    K.solid(0, 5.2, L / 2 - 3.6, W / 2, 3.2, 3.4, 'metal', { extra: { cover: true, vehicle: true } });
    K.solid(0, 2.0, -3.5, W / 2, 1.6, 9, 'metal', { extra: { cover: true, vehicle: true } });
    K.lootAt(0, 3.75, -6, o.loot || (kind === 'military' ? 'military' : 'industrial'), { spread: 2 });
  } else if (kind === 'bus') {
    const L = 36, W = 8, H = 8.5;
    K.box(0, 1.4 + H / 2, 0, W / 2, H / 2, L / 2, body, { skip: 'ny', mat: 'metal' });
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) if (!broken || r() < 0.5) K.box(s * (W / 2 + 0.02), 6.8, -L / 2 + 4 + i * 5.5, 0.03, 1.4, 2.4, glass, { glass: true, col: false });
    K.box(0, 6.4, L / 2 + 0.02, W / 2 - 0.5, 1.8, 0.03, glass, { glass: true, col: false });
    for (const sz of [L / 2 - 6, -L / 2 + 7]) for (const sx of [-1, 1]) wheel(K, sx * (W / 2 - 0.5), 1.6, sz, 1.6, 1.1, r() < 0.4);
    K.solid(0, 1.4 + H / 2, 0, W / 2, H / 2, L / 2, 'metal', { extra: { cover: true, vehicle: true } });
    K.lootAt(0, 9.95 + 1.4, 0, 'trash');
  } else if (kind === 'tractor') {
    const m = mat('metal', rnd(K, [0x3a6a3a, 0xa83a2a, 0x3a5a9a]), { p: 5 });
    K.box(0, 3.4, 2, 1.8, 1.4, 4, m, { skip: 'ny' });
    K.box(0, 5.4, -2.4, 2.4, 2.4, 2.2, m, {});
    K.box(0, 7.3, -2.4, 2.6, 0.15, 2.4, m, nc);
    K.box(0, 5.8, -0.2, 2.2, 1.6, 0.04, glass, { glass: true, col: false });
    for (const s of [-1, 1]) { wheel(K, s * 2.8, 2.6, -2.6, 2.6, 1.6, false); wheel(K, s * 2.1, 1.4, 4.2, 1.4, 1.0, false); }
    K.solid(0, 3.5, 0, 3, 3.5, 6, 'metal', { extra: { cover: true, vehicle: true } });
  }
  K.pop();
}

/** A forklift truck. */
export function forklift(K, x, y, z, yaw) {
  K.details(() => {
    K.push(x, y, z, yaw);
    const m = mat('metal', 0xd8a828, { p: 5 }), dark = mat('metal', 0x2a2a2a, { p: 4 });
    K.box(0, 1.9, -0.5, 1.9, 1.3, 3.2, m, {});
    K.box(0, 2.2, -3.4, 1.9, 1.5, 0.6, dark, { col: false });
    for (const sx of [-1, 1]) { K.box(sx * 1.6, 4.4, 0.2, 0.12, 2.4, 0.12, dark, { col: false }); K.box(sx * 1.6, 4.4, -2.4, 0.12, 2.4, 0.12, dark, { col: false }); }
    K.box(0, 6.85, -1.1, 1.75, 0.12, 1.5, dark, { col: false });
    for (const sx of [-1, 1]) { K.box(sx * 0.9, 3.6, 3.1, 0.18, 3.4, 0.18, dark, { col: false }); K.box(sx * 0.7, 0.35, 4.6, 0.28, 0.08, 1.6, dark, { col: false }); }
    K.box(0, 1.5, -0.6, 1.0, 0.5, 0.9, P.seat, { col: false });
    for (const [sx, sz, rr] of [[-1, 1.8, 0.9], [1, 1.8, 0.9], [-1, -2.4, 0.75], [1, -2.4, 0.75]]) wheel(K, sx * 1.85, rr, sz, rr, 0.7, false);
    K.solid(0, 2.2, 0, 2, 2.2, 3.8, 'metal', { extra: { cover: true } });
    K.pop();
  });
}

/** A small biplane (a crop-duster / transport), standing on its wheels, nose to +z. */
export function smallPlane(K, x, y, z, yaw) {
  K.details(() => {
    K.push(x, y, z, yaw);
    const m = mat('metal', 0x5a7050, { p: 4 }), dark = mat('metal', 0x2a2c2a, { p: 4 }), glass = S.glass;
    K.cylAxis(0, 4.2, 0, 2.3, 24, m, { axis: 'z', capMat: dark });
    K.cylAxis(0, 4.2, 13.2, 2.0, 2.4, dark, { axis: 'z' });
    K.box(0, 4.2, 14.7, 0.3, 2.6, 0.2, dark, { col: false });
    K.box(0, 6.2, 9.5, 1.6, 0.9, 1.6, glass, { glass: true, col: false });
    K.box(0, 8.0, 6, 18, 0.25, 2.6, m, { col: false });
    K.box(0, 2.6, 6.4, 15, 0.25, 2.3, m, { col: false });
    for (const sx of [-12, -5, 5, 12]) K.box(sx, 5.3, 6, 0.12, 2.6, 0.12, dark, { col: false });
    K.box(0, 6.4, -11.4, 0.18, 2.6, 1.6, m, { col: false });
    K.box(0, 4.6, -11.2, 5, 0.18, 1.5, m, { col: false });
    for (const sx of [-1, 1]) { K.box(sx * 2.4, 1.8, 9, 0.15, 1.8, 0.15, dark, { col: false }); wheel(K, sx * 2.6, 1.1, 9, 1.1, 0.6, false); }
    wheel(K, 0, 0.6, -11, 0.6, 0.4, false);
    K.solid(0, 4.2, 0, 2.3, 2.3, 12, 'metal', { extra: { cover: true } });
    K.solid(0, 8, 6, 18, 0.3, 2.6, 'metal', { noStand: true });
    K.lootAt(0, 2.1, -3, 'military');
    K.pop();
  });
}

export { P as PROP_MATS };
