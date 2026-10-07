// Furniture and fittings, made of boxes: beds, tables, sofas, kitchens,
// wardrobes, shelves, lockers, desks, hospital beds, workbenches, crates and
// barrels. Each piece stands at (x, z) on the floor at y, turned by yaw, its
// back to -z (against a wall) and its front to +z, and marks where loot can
// be found on or in it.
import { mat } from './kit.js';

export const F = {
  wood: mat('woodFine', 0xc8a07a), woodDark: mat('woodFine', 0x7a5a40), woodPale: mat('woodFine', 0xe0c8a8),
  paint: mat('woodFine', 0xe8e4dc, { p: 4 }), paintGreen: mat('woodFine', 0x7a9a80, { p: 4 }),
  metal: mat('metal', 0x9a9c9e, { p: 4 }), metalDark: mat('metal', 0x4a4c4e, { p: 4 }), steel: mat('metalPlate', 0xb0b4b8),
  locker: mat('milMetal', 0x8a9aa0, { p: 4 }), olive: mat('milMetal', 0xffffff), rust: mat('rust', 0xffffff),
  white: mat('plaster', 0xf2f2ee, { p: 5, r: 120 }), enamel: mat('whiteTiles', 0xf8f8f4, { p: 5, r: 60 }),
  black: mat('plaster', 0x262626, { p: 5, r: 120 }), screen: mat('plaster', 0x101418, { p: 5, r: 40 }),
  fabric: [mat('fabric', 0x8a6a5a), mat('fabric', 0x5a6a7a), mat('fabric', 0x7a7a5a), mat('fabric', 0x9a5a4a), mat('fabric', 0x6a7a6a), mat('fabric', 0x8a8478)],
  sheet: mat('fabric', 0xe8e4dc, { p: 5 }), mattress: mat('fabric', 0xd8d0c0),
  counterTop: mat('tiles', 0xd8d4cc), worktop: mat('woodFine', 0x9a7a5a),
  cardboard: mat('planks', 0xc0a070, { p: 5 }), crate: mat('planks', 0xd0b088), pallet: mat('planks', 0xb09878),
  barrel: [mat('milMetal', 0xffffff), mat('rust', 0xffffff), mat('metal', 0x3a5a8a, { p: 4 }), mat('metal', 0xa03a2a, { p: 4 })],
};

const noCol = { col: false };
const pick = (K, list) => list[Math.floor(K.r() * list.length)];

function at(K, x, y, z, yaw, fn) { K.push(x, y, z, yaw); fn(); K.pop(); }

export function bed(K, x, y, z, yaw, o = {}) {
  const w = o.double ? 6.2 : 3.6, L = 7.2, fr = o.frame || F.wood;
  at(K, x, y, z, yaw, () => {
    K.box(0, 0.8, 0, w / 2, 0.45, L / 2, fr, { skip: 'ny' });
    K.box(0, 1.55, 0.2, w / 2 - 0.15, 0.32, L / 2 - 0.3, F.mattress, noCol);
    K.box(0, 1.9, 0.9, w / 2 - 0.1, 0.06, L / 2 - 0.95, pick(K, F.fabric), noCol);
    K.box(0, 2.05, -L / 2 + 0.95, w / 2 - 0.6, 0.22, 0.55, F.sheet, noCol);
    K.box(0, 1.9, -L / 2 + 0.1, w / 2, 1.25, 0.12, fr, noCol);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(sx * (w / 2 - 0.2), 0.2, sz * (L / 2 - 0.2), 0.2, 0.2, 0.2, fr, noCol);
    if (o.loot !== false) { K.lootAt(0, 2.1, 1.2, o.cat || 'home'); if (K.r() < 0.4) K.lootAt(w / 2 - 1, 0.05, L / 2 + 0.6, o.cat || 'home'); }
  });
}

export function bunk(K, x, y, z, yaw, o = {}) {
  const w = 3.4, L = 7, fr = o.frame || F.metalDark;
  at(K, x, y, z, yaw, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(sx * (w / 2 - 0.12), 3.2, sz * (L / 2 - 0.12), 0.12, 3.2, 0.12, fr, noCol);
    for (const h of [1.3, 4.6]) {
      K.box(0, h, 0, w / 2, 0.15, L / 2, fr, noCol);
      K.box(0, h + 0.4, 0, w / 2 - 0.15, 0.25, L / 2 - 0.15, F.mattress, noCol);
      K.box(0, h + 0.7, 0.8, w / 2 - 0.1, 0.05, L / 2 - 1, o.blanket || F.olive, noCol);
    }
    K.solid(0, 3, 0, w / 2, 3, L / 2, 'metal');
    K.lootAt(0, 1.95, 1, o.cat || 'military');
  });
}

export function table(K, x, y, z, yaw, o = {}) {
  const w = o.w ?? 6, d = o.d ?? 4, h = o.h ?? 2.7, m = o.m || F.wood;
  at(K, x, y, z, yaw, () => {
    K.box(0, h - 0.12, 0, w / 2, 0.12, d / 2, m, { col: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(sx * (w / 2 - 0.3), (h - 0.24) / 2, sz * (d / 2 - 0.3), 0.15, (h - 0.24) / 2, 0.15, m, noCol);
    K.solid(0, h / 2, 0, w / 2, h / 2, d / 2, 'wood');
    if (o.loot !== false) K.lootAt((K.r() - 0.5) * w * 0.5, h + 0.02, (K.r() - 0.5) * d * 0.4, o.cat || 'home');
    if (o.chairs) for (const s of [-1, 1]) chair(K, s * w * 0.25, 0, d / 2 + 1, Math.PI, { m });
    if (o.chairs) for (const s of [-1, 1]) chair(K, s * w * 0.25, 0, -d / 2 - 1, 0, { m });
  });
}

export function chair(K, x, y, z, yaw, o = {}) {
  const m = o.m || F.wood;
  at(K, x, y, z, yaw + (K.r() - 0.5) * 0.4, () => {
    K.box(0, 1.5, 0, 0.85, 0.1, 0.85, m, noCol);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(sx * 0.7, 0.72, sz * 0.7, 0.09, 0.72, 0.09, m, noCol);
    K.box(0, 2.6, -0.78, 0.85, 1.0, 0.08, m, noCol);
  });
}

export function sofa(K, x, y, z, yaw, o = {}) {
  const w = o.w ?? 7, f = o.m || pick(K, F.fabric);
  at(K, x, y, z, yaw, () => {
    K.box(0, 0.75, 0.2, w / 2, 0.75, 1.3, f, { skip: 'ny' });
    K.box(0, 2.1, -1.05, w / 2, 1.35, 0.4, f, { col: false, skip: 'ny' });
    for (const s of [-1, 1]) K.box(s * (w / 2 - 0.4), 1.8, 0.1, 0.4, 0.55, 1.4, f, noCol);
    K.box(0, 1.65, 0.3, w / 2 - 0.8, 0.18, 1.05, f, noCol);
    if (K.r() < 0.5) K.lootAt((K.r() - 0.5) * w * 0.6, 1.85, 0.4, o.cat || 'home');
  });
}

export function wardrobe(K, x, y, z, yaw, o = {}) {
  const w = o.w ?? 4.6, m = o.m || F.wood;
  at(K, x, y, z, yaw, () => {
    K.box(0, 3.6, 0, w / 2, 3.6, 1.1, m, { skip: 'ny' });
    K.box(-w / 4, 3.7, 1.12, w / 4 - 0.08, 3.3, 0.04, F.woodDark, noCol);
    K.box(w / 4, 3.7, 1.12, w / 4 - 0.08, 3.3, 0.04, F.woodDark, noCol);
    for (const s of [-1, 1]) K.box(s * 0.35, 3.8, 1.2, 0.06, 0.4, 0.06, F.metal, noCol);
    K.lootAt(0, 0.05, 1.7, o.cat || 'clothes', { spread: 0.6 });
  });
}

export function dresser(K, x, y, z, yaw, o = {}) {
  const w = o.w ?? 4.2, m = o.m || F.wood;
  at(K, x, y, z, yaw, () => {
    K.box(0, 1.6, 0, w / 2, 1.6, 0.9, m, { skip: 'ny' });
    for (let i = 0; i < 3; i++) K.box(0, 0.6 + i * 0.95, 0.92, w / 2 - 0.15, 0.4, 0.03, F.woodDark, noCol);
    K.lootAt(0, 3.22, 0, o.cat || 'home');
    if (o.tv) { K.box(0, 4.2, -0.1, 1.5, 1.0, 0.6, F.black, noCol); K.box(0, 4.25, 0.52, 1.25, 0.8, 0.02, F.screen, noCol); }
  });
}

export function bookshelf(K, x, y, z, yaw, o = {}) {
  const w = o.w ?? 4, m = o.m || F.woodDark, h = o.h ?? 6.5;
  at(K, x, y, z, yaw, () => {
    K.box(0, h / 2, -0.55, w / 2, h / 2, 0.08, m, { col: false });
    for (const s of [-1, 1]) K.box(s * (w / 2 - 0.08), h / 2, 0, 0.08, h / 2, 0.62, m, noCol);
    const n = Math.round(h / 1.6);
    for (let i = 0; i <= n; i++) {
      const yy = 0.1 + i * (h - 0.2) / n;
      K.box(0, yy, 0, w / 2, 0.07, 0.62, m, noCol);
      if (i < n && K.r() < 0.8) {
        // books
        let xx = -w / 2 + 0.25;
        while (xx < w / 2 - 0.6) { const bw = 0.15 + K.r() * 0.25, bh = 0.7 + K.r() * 0.45; if (K.r() < 0.85) K.box(xx + bw / 2, yy + 0.07 + bh / 2, 0.05, bw / 2, bh / 2, 0.4, pick(K, F.fabric), noCol); xx += bw + 0.02; }
      }
    }
    K.solid(0, h / 2, 0, w / 2, h / 2, 0.62, 'wood');
    K.lootAt(0, 0.1 + (h - 0.2) / n + 0.07, 0.1, o.cat || 'home', { shelf: true });
  });
}

/** A run of kitchen units along local x (length L), with a sink and maybe a stove and fridge. */
export function kitchen(K, x, y, z, yaw, o = {}) {
  const L = o.L ?? 10, front = o.front || F.paint;
  at(K, x, y, z, yaw, () => {
    K.box(0, 1.45, 0, L / 2, 1.45, 1.1, front, { skip: 'ny' });
    K.box(0, 3.0, 0.05, L / 2 + 0.05, 0.1, 1.2, F.counterTop, noCol);
    // doors and handles
    const n = Math.max(2, Math.round(L / 2.5));
    for (let i = 0; i < n; i++) { const xx = -L / 2 + L * (i + 0.5) / n; K.box(xx, 1.5, 1.12, L / n / 2 - 0.08, 1.1, 0.03, front, noCol); K.box(xx + L / n * 0.3, 2.2, 1.18, 0.05, 0.25, 0.04, F.metal, noCol); }
    // the sink
    K.box(-L * 0.2, 3.05, 0.1, 1.1, 0.08, 0.75, F.steel, noCol);
    K.box(-L * 0.2, 3.7, -0.75, 0.08, 0.6, 0.08, F.steel, noCol);
    // wall cupboards
    if (o.upper !== false) {
      K.box(0, 6.3, -0.55, L / 2, 1.2, 0.6, front, { col: false });
      K.lootAt(L * 0.25, 3.12, 0.2, 'food');
    }
    K.lootAt(-L * 0.35, 3.12, 0.3, o.cat || 'kitchen');
    K.lootAt(L * 0.2, 0.05, 1.8, 'kitchen');
    // the stove
    if (o.stove !== false) {
      const sx = L / 2 + 1.25;
      K.box(sx, 1.5, 0, 1.2, 1.5, 1.1, F.enamel, { skip: 'ny' });
      K.box(sx, 1.4, 1.12, 1.0, 0.8, 0.03, F.black, noCol);
      for (const a of [-0.5, 0.5]) for (const b of [-0.45, 0.45]) K.box(sx + a, 3.04, b, 0.32, 0.04, 0.32, F.black, noCol);
      K.lootAt(sx, 3.1, 0, 'kitchen');
    }
    if (o.fridge !== false) {
      const fx = -L / 2 - 1.35;
      K.box(fx, 3.1, 0, 1.3, 3.1, 1.2, F.enamel, { skip: 'ny' });
      K.box(fx + 0.9, 3.9, 1.24, 0.07, 0.8, 0.06, F.metal, noCol);
      K.box(fx, 4.4, 1.21, 1.25, 0.02, 0.02, F.metal, noCol);
      K.lootAt(fx, 0.06, 1.9, 'food', { spread: 0.5 });
    }
  });
}

export function bathroom(K, x, y, z, yaw, o = {}) {
  at(K, x, y, z, yaw, () => {
    // the bath along the back wall
    if (o.bath !== false) {
      K.box(0, 1.1, 0, 3.4, 1.1, 1.5, F.enamel, { skip: 'ny' });
      K.box(0, 1.95, 0, 3.0, 0.3, 1.15, mat('whiteTiles', 0x9ab8c8, { p: 5 }), noCol);
    }
    // a toilet and a basin
    const tx = o.bath === false ? -1.5 : 4.6;
    K.box(tx, 0.75, 0.2, 0.8, 0.75, 1.0, F.enamel, noCol);
    K.box(tx, 1.9, -0.7, 0.85, 0.85, 0.35, F.enamel, noCol);
    K.box(tx + 2.6, 2.6, -0.4, 1.0, 0.3, 0.8, F.enamel, noCol);
    K.box(tx + 2.6, 1.2, -0.7, 0.3, 1.2, 0.3, F.enamel, noCol);
    K.box(tx + 2.6, 4.6, -1.0, 0.9, 1.1, 0.06, mat('glass', 0xc8d8e0, { r: 10 }) || F.white, noCol);
    K.solid(tx + 1.3, 1.2, 0, 2.2, 1.2, 1.0, 'concrete');
    K.lootAt(tx + 2.6, 2.95, -0.4, 'medical');
  });
}

export function desk(K, x, y, z, yaw, o = {}) {
  const w = o.w ?? 5.5, m = o.m || F.woodPale;
  at(K, x, y, z, yaw, () => {
    K.box(0, 2.6, 0, w / 2, 0.1, 1.5, m, { col: false });
    K.box(w / 2 - 1.1, 1.25, 0, 1.0, 1.25, 1.4, m, noCol);
    K.box(-w / 2 + 0.12, 1.25, 0, 0.1, 1.25, 1.4, m, noCol);
    K.box(0, 1.6, -1.35, w / 2 - 0.2, 1.0, 0.05, m, noCol);
    K.solid(0, 1.35, 0, w / 2, 1.35, 1.5, 'wood');
    if (o.pc !== false && K.r() < 0.6) { K.box(-0.6, 3.6, -0.6, 1.1, 0.8, 0.4, F.white, noCol); K.box(-0.6, 3.6, -0.18, 0.95, 0.65, 0.02, F.screen, noCol); K.box(-0.6, 2.75, 0.5, 1.0, 0.05, 0.35, F.white, noCol); }
    else K.box(0.4, 2.85, 0.2, 0.8, 0.15, 0.6, mat('plaster', 0xe8e0c8, { p: 5 }), noCol);
    K.lootAt(0.8, 2.72, 0.5, o.cat || 'office');
    chair(K, 0, 0, 2.3, Math.PI + (K.r() - 0.5) * 0.6, { m: F.metalDark });
  });
}

export function cabinet(K, x, y, z, yaw, o = {}) {
  const m = o.m || F.locker, w = o.w ?? 2.4;
  at(K, x, y, z, yaw, () => {
    K.box(0, 2.4, 0, w / 2, 2.4, 1.2, m, { skip: 'ny' });
    for (let i = 0; i < 4; i++) { K.box(0, 0.6 + i * 1.15, 1.22, w / 2 - 0.12, 0.5, 0.02, m, noCol); K.box(0, 0.85 + i * 1.15, 1.27, 0.35, 0.06, 0.05, F.metal, noCol); }
    K.lootAt(0, 4.82, 0, o.cat || 'office');
  });
}

export function locker(K, x, y, z, yaw, o = {}) {
  const n = o.n ?? 3, m = o.m || F.locker;
  at(K, x, y, z, yaw, () => {
    K.box(0, 3.2, 0, n * 0.8, 3.2, 1.0, m, { skip: 'ny' });
    for (let i = 0; i < n; i++) {
      const xx = -n * 0.8 + 0.8 + i * 1.6;
      K.box(xx, 3.2, 1.02, 0.74, 3.0, 0.02, m, noCol);
      for (let v = 0; v < 3; v++) K.box(xx, 5.5 + v * 0.22, 1.05, 0.4, 0.04, 0.02, F.metalDark, noCol);
      K.box(xx + 0.5, 3.4, 1.06, 0.05, 0.3, 0.04, F.metal, noCol);
    }
    K.lootAt(0, 0.05, 1.6, o.cat || 'military', { spread: 0.8 });
  });
}

/** A metal rack: shelves stacked high (warehouses, shops' back rooms, garages). */
export function rack(K, x, y, z, yaw, o = {}) {
  const w = o.w ?? 7, d = o.d ?? 2.2, h = o.h ?? 7.5, m = o.m || F.metalDark, n = o.shelves ?? 4;
  at(K, x, y, z, yaw, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1), 0.1, h / 2, 0.1, m, noCol);
    for (let i = 0; i < n; i++) {
      const yy = 0.4 + i * (h - 0.6) / (n - 1);
      K.box(0, yy, 0, w / 2, 0.07, d / 2, o.shelfMat || m, noCol);
      // boxes and tins on the shelves
      if (i < n - 1 || K.r() < 0.6) {
        let xx = -w / 2 + 0.3;
        while (xx < w / 2 - 0.8) {
          const bw = 0.6 + K.r() * 1.2, bh = 0.5 + K.r() * 0.9;
          if (K.r() < (o.full ?? 0.6)) K.box(xx + bw / 2, yy + 0.07 + bh / 2, (K.r() - 0.5) * 0.4, bw / 2, bh / 2, Math.min(d / 2 - 0.2, 0.5 + K.r() * 0.4), K.r() < 0.6 ? F.cardboard : pick(K, F.barrel), noCol);
          xx += bw + 0.15;
        }
      }
      if (i < 3) K.lootAt((K.r() - 0.5) * w * 0.6, yy + 0.09, 0, o.cat || 'industrial', { shelf: true });
    }
    K.solid(0, h / 2, 0, w / 2, h / 2, d / 2, 'metal');
  });
}

/** A shop's shelving island (double-sided), length along x. */
export function gondola(K, x, y, z, yaw, o = {}) {
  const L = o.L ?? 10, m = o.m || F.white;
  at(K, x, y, z, yaw, () => {
    K.box(0, 2.6, 0, L / 2, 2.6, 0.12, m, { col: false });
    K.box(0, 0.25, 0, L / 2, 0.25, 1.4, m, noCol);
    for (let i = 1; i <= 3; i++) {
      const yy = 0.5 + i * 1.3;
      K.box(0, yy, 0, L / 2, 0.06, 1.35, m, noCol);
      for (const s of [-1, 1]) {
        let xx = -L / 2 + 0.2;
        while (xx < L / 2 - 0.5) {
          const bw = 0.35 + K.r() * 0.6, bh = 0.4 + K.r() * 0.6;
          if (K.r() < (o.full ?? 0.35)) K.box(xx + bw / 2, yy + 0.06 + bh / 2, s * 0.75, bw / 2, bh / 2, 0.45, pick(K, [F.cardboard, ...F.barrel, ...F.fabric]), noCol);
          xx += bw + 0.08;
        }
      }
    }
    K.solid(0, 2.6, 0, L / 2, 2.6, 1.4, 'metal');
    for (const s of [-1, 1]) K.lootAt((K.r() - 0.5) * L * 0.7, 0.56 + 1.3 * (1 + Math.floor(K.r() * 3)), s * 0.8, o.cat || 'shop', { shelf: true });
  });
}

/** A shop counter with a till. */
export function counter(K, x, y, z, yaw, o = {}) {
  const L = o.L ?? 8, m = o.m || F.woodDark;
  at(K, x, y, z, yaw, () => {
    K.box(0, 1.75, 0, L / 2, 1.75, 1.3, m, { skip: 'ny' });
    K.box(0, 3.55, 0, L / 2 + 0.1, 0.06, 1.4, F.counterTop, noCol);
    K.box(L * 0.25, 4.0, 0, 0.8, 0.4, 0.7, F.metalDark, noCol);
    K.lootAt(-L * 0.2, 3.62, 0.2, o.cat || 'shop');
    K.lootAt(0, 0.05, -1.8, o.cat || 'shop');
  });
}

export function hospitalBed(K, x, y, z, yaw, o = {}) {
  at(K, x, y, z, yaw, () => {
    K.box(0, 1.9, 0, 1.8, 0.15, 3.6, F.metal, { col: false });
    K.box(0, 2.3, 0.2, 1.65, 0.28, 3.3, F.sheet, noCol);
    K.box(0, 2.8, -2.4, 1.3, 0.25, 0.6, F.sheet, noCol);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(sx * 1.6, 0.95, sz * 3.4, 0.08, 0.95, 0.08, F.metal, noCol);
    K.box(0, 3.0, -3.65, 1.8, 1.0, 0.08, F.metal, noCol);
    K.solid(0, 1.2, 0, 1.8, 1.2, 3.6, 'metal');
    // a drip stand
    K.box(2.4, 2.8, -2.6, 0.05, 2.8, 0.05, F.metal, noCol);
    K.box(2.4, 5.3, -2.6, 0.35, 0.45, 0.12, mat('plaster', 0xd0e0e8, { p: 5, r: 40 }), noCol);
    K.lootAt(0, 2.6, 1.6, o.cat || 'medical');
  });
}

export function workbench(K, x, y, z, yaw, o = {}) {
  const L = o.L ?? 8;
  at(K, x, y, z, yaw, () => {
    K.box(0, 2.85, 0, L / 2, 0.15, 1.5, F.worktop, { col: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(sx * (L / 2 - 0.3), 1.35, sz * 1.2, 0.18, 1.35, 0.18, F.metalDark, noCol);
    K.box(0, 0.6, 0, L / 2 - 0.3, 0.06, 1.3, F.worktop, noCol);
    // a pegboard of tools
    K.box(0, 5.2, -1.45, L / 2, 1.8, 0.06, mat('planks', 0xb0a080), noCol);
    for (let i = 0; i < 6; i++) K.box(-L / 2 + 0.8 + i * (L - 1.6) / 5, 5.1 + (K.r() - 0.5), -1.32, 0.1 + K.r() * 0.2, 0.5 + K.r() * 0.5, 0.06, K.r() < 0.5 ? F.metalDark : F.wood, noCol);
    K.box(L / 2 - 1.2, 3.25, 0, 0.6, 0.25, 0.4, mat('metal', 0xa83a28, { p: 4 }), noCol);
    K.solid(0, 1.5, 0, L / 2, 1.5, 1.5, 'wood');
    K.lootAt(-L * 0.2, 3.02, 0.3, o.cat || 'industrial');
    K.lootAt(L * 0.1, 0.68, 0, o.cat || 'industrial');
  });
}

export function crate(K, x, y, z, yaw, o = {}) {
  const s = o.s ?? 1.5, m = o.m || F.crate;
  at(K, x, y, z, yaw, () => {
    K.box(0, s, 0, s, s, s, m, { skip: 'ny', mat: 'wood' });
    // battens
    for (const sz of [-1, 1]) K.box(0, s, sz * (s + 0.03), s + 0.03, 0.15, 0.04, F.woodDark, noCol);
    if (o.loot) K.lootAt(0, 2 * s + 0.02, 0, o.loot);
  });
}

export function ammoBox(K, x, y, z, yaw, o = {}) {
  at(K, x, y, z, yaw, () => {
    K.box(0, 0.75, 0, 2.2, 0.75, 0.9, F.olive, { skip: 'ny', mat: 'metal' });
    K.box(0, 1.52, 0, 2.25, 0.06, 0.95, F.olive, noCol);
    if (o.loot !== false) K.lootAt(0, 1.6, 0, o.cat || 'military');
  });
}

export function barrel(K, x, y, z, o = {}) {
  const m = o.m || pick(K, F.barrel);
  K.cyl(x, y, z, 1.15, 3.6, m, { seg: 10, foot: true });
  K.cyl(x, y + 1.2, z, 1.2, 0.12, m, { seg: 10, cap: false, col: false });
  K.cyl(x, y + 2.4, z, 1.2, 0.12, m, { seg: 10, cap: false, col: false });
}

export function pallet(K, x, y, z, yaw, o = {}) {
  at(K, x, y, z, yaw, () => {
    for (const sz of [-1, 0, 1]) K.box(0, 0.25, sz * 1.6, 2.2, 0.25, 0.25, F.pallet, noCol);
    for (let i = 0; i < 5; i++) K.box(-1.8 + i * 0.9, 0.55, 0, 0.35, 0.06, 1.95, F.pallet, noCol);
    K.solid(0, 0.3, 0, 2.2, 0.3, 2, 'wood');
    if (o.load) { K.box(0, 1.9, 0, 2.0, 1.3, 1.8, o.load, { col: true, skip: 'ny' }); if (o.loot) K.lootAt(0, 3.22, 0, o.loot); }
  });
}

export function radiator(K, x, y, z, yaw) {
  at(K, x, y, z, yaw, () => { K.box(0, 1.6, 0, 1.8, 0.9, 0.18, F.white, noCol); for (let i = 0; i < 7; i++) K.box(-1.6 + i * 0.53, 1.6, 0.2, 0.08, 0.85, 0.06, F.white, noCol); });
}

export function rug(K, x, y, z, yaw, o = {}) {
  at(K, x, y, z, yaw, () => K.box(0, 0.03, 0, (o.w ?? 7) / 2, 0.03, (o.d ?? 5) / 2, pick(K, F.fabric), { col: false, skip: 'ny' }));
}

/** A cell door of bars, or a run of bars along x (police cells). */
export function bars(K, x0, x1, z, y, h = 8.6) {
  const n = Math.round((x1 - x0) / 0.7);
  for (let i = 0; i <= n; i++) K.box(x0 + (x1 - x0) * i / n, y + h / 2, z, 0.07, h / 2, 0.07, F.metalDark, { col: false });
  K.box((x0 + x1) / 2, y + h - 0.2, z, (x1 - x0) / 2, 0.12, 0.12, F.metalDark, { col: false });
  K.box((x0 + x1) / 2, y + 3.6, z, (x1 - x0) / 2, 0.1, 0.1, F.metalDark, { col: false });
  K.solid((x0 + x1) / 2, y + h / 2, z, (x1 - x0) / 2, h / 2, 0.15, 'metal', { extra: { shootable: true } });
}

/** A room's furnishings by what the room is for. kind: bedroom | living | kitchen | bath | office | store | dining. */
export function furnish(K, room, y, kind, o = {}) {
  const r = K.r;
  const x0 = room.x0 + 0.6, x1 = room.x1 - 0.6, z0 = room.z0 + 0.6, z1 = room.z1 - 0.6;
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (w < 5 || d < 5) { if (r() < 0.5) K.lootAt(cx, y + 0.05, cz, o.cat || 'home'); return; }
  // which wall to put the big things against (one without a door in it, preferably)
  const walls = [
    { x: cx, z: z0 + 0.1, yaw: 0, len: w }, { x: cx, z: z1 - 0.1, yaw: Math.PI, len: w },
    { x: x0 + 0.1, z: cz, yaw: Math.PI / 2, len: d }, { x: x1 - 0.1, z: cz, yaw: -Math.PI / 2, len: d },
  ].filter((q) => !o.avoid || !o.avoid.some((p) => Math.hypot(p.x - q.x, p.z - q.z) < q.len / 2 + 1 && near(p, q)));
  const W = walls.length ? walls : [{ x: cx, z: z0 + 0.1, yaw: 0, len: w }];
  const along = (q, off, depth) => ({ x: q.x + Math.cos(q.yaw) * off + Math.sin(q.yaw) * depth, z: q.z - Math.sin(q.yaw) * off + Math.cos(q.yaw) * depth });
  const wall0 = W[0], wall1 = W[1 % W.length];
  switch (kind) {
    case 'bedroom': {
      const p = along(wall0, (r() - 0.5) * Math.max(0, wall0.len - 8), 3.8);
      bed(K, p.x, y, p.z, wall0.yaw, { double: wall0.len > 9 && r() < 0.6, cat: o.cat });
      if (wall1 !== wall0 && wall1.len > 6) { const q = along(wall1, (r() - 0.5) * (wall1.len - 6), 1.2); (r() < 0.6 ? wardrobe : dresser)(K, q.x, y, q.z, wall1.yaw, { cat: o.cat === 'home' ? 'clothes' : o.cat }); }
      if (r() < 0.5) rug(K, cx, y, cz, 0, { w: Math.min(6, w - 2), d: Math.min(4, d - 2) });
      break;
    }
    case 'living': {
      const p = along(wall0, (r() - 0.5) * Math.max(0, wall0.len - 8), 1.6);
      sofa(K, p.x, y, p.z, wall0.yaw, { cat: o.cat });
      if (wall1 !== wall0) { const q = along(wall1, 0, 1); dresser(K, q.x, y, q.z, wall1.yaw, { tv: r() < 0.7, cat: o.cat }); }
      if (W[2] && W[2].len > 5) { const q = along(W[2], 0, 0.75); bookshelf(K, q.x, y, q.z, W[2].yaw, { cat: o.cat }); }
      rug(K, cx, y, cz, 0, { w: Math.min(8, w - 2), d: Math.min(6, d - 2) });
      break;
    }
    case 'kitchen': {
      const L = Math.min(10, wall0.len - 6);
      if (L > 3) { const p = along(wall0, 0, 1.2); kitchen(K, p.x, y, p.z, wall0.yaw, { L, cat: o.cat }); }
      if (w > 9 && d > 9) table(K, cx, y, cz, r() * 0.3, { w: 5, d: 3.5, chairs: true, cat: 'food' });
      break;
    }
    case 'dining': table(K, cx, y, cz, 0, { w: Math.min(8, w - 4), d: Math.min(4.5, d - 4), chairs: true, cat: o.cat }); break;
    case 'bath': { const p = along(wall0, 0, 1.6); bathroom(K, p.x - 1, y, p.z, wall0.yaw, { bath: wall0.len > 9 }); break; }
    case 'office': {
      const p = along(wall0, (r() - 0.5) * Math.max(0, wall0.len - 7), 1.6);
      desk(K, p.x, y, p.z, wall0.yaw, { cat: o.cat });
      if (wall1 !== wall0) { const q = along(wall1, (r() - 0.5) * Math.max(0, wall1.len - 4), 1.25); cabinet(K, q.x, y, q.z, wall1.yaw, { cat: o.cat }); }
      if (w > 12 && W[2]) { const q = along(W[2], 0, 1.6); desk(K, q.x, y, q.z, W[2].yaw, { cat: o.cat }); }
      break;
    }
    case 'store': {
      const p = along(wall0, 0, 1.2);
      rack(K, p.x, y, p.z, wall0.yaw, { w: Math.min(8, wall0.len - 2), cat: o.cat });
      if (wall1 !== wall0 && wall1.len > 5) { const q = along(wall1, 0, 1.2); rack(K, q.x, y, q.z, wall1.yaw, { w: Math.min(8, wall1.len - 2), cat: o.cat }); }
      if (r() < 0.6) crate(K, cx + (r() - 0.5) * 2, y, cz + (r() - 0.5) * 2, r(), { loot: o.cat });
      break;
    }
    default: if (r() < 0.6) K.lootAt(cx, y + 0.05, cz, o.cat || 'home');
  }
}
function near(p, q) { return Math.abs(Math.cos(q.yaw)) > 0.5 ? Math.abs(p.z - q.z) < 1.5 : Math.abs(p.x - q.x) < 1.5; }
