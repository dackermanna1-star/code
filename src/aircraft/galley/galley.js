// Galley monuments (ATLAS standard): forward galley (G1, right side, facing aft)
// and the aft galley (G4: left + right banks facing forward with a central work
// recess holding the aft attendant jumpseat).
//
// A bank is described by columns; every column is built from a few standard
// inserts: full / half-size trolleys in bays (interactive, pulled out ~40 cm),
// standard-unit drawers (interactive), trash compactor, ovens with glass doors
// and timers (interactive door), coffee makers with pots + indicator lights
// (interactive "brew"), water boiler, air chiller, circuit-breaker panel,
// interphone handset, stowage compartments with turn-latches, waste flaps,
// work deck with cups / napkins / pots, under-oven work lights.
import * as THREE from 'three';
import { AIRCRAFT } from '../../core/constants.js';
import { Kit, T, box, boxMM, rbox, cyl, plane, plate, frame, tube, grabHandle, lathe, slab, ccw, worldUV, smoothstep, clamp, Anim } from './geom.js';

const CY = AIRCRAFT.fuselage.centerY;
const R_CL = 1.665;          // outboard closeout radius
const arcX = (y, r = R_CL) => { const d = y - CY; return Math.sqrt(Math.max(0, r * r - d * d)); };

export const CART = { w: 0.302, h: 1.03, full: 0.81, half: 0.40 };
export const DRAWER = { w: 0.28, h: 0.27, d: 0.4 };
export const OVEN = { w: 0.31, h: 0.3 };

const COL = {
  lam: [0.80, 0.80, 0.79],
  lamLight: [0.86, 0.86, 0.85],
  steel: [0.92, 0.92, 0.93],
  steelDark: [0.62, 0.63, 0.65],
  dark: [0.06, 0.06, 0.065],
  grey: [0.4, 0.41, 0.42],
  orange: [0.85, 0.4, 0.08],
};

/**
 * Build one galley bank.
 * cfg: { id, s (+1 right / -1 left), zF (front plane), f (+1 faces +z / -1 faces -z), depth, u0 (inboard |x|), u1 (outboard limit),
 *        bays: [...], mid: [...], upper: [...], top: [...], deckDepth, label }
 * returns { kit, carts: [{u, size}], drawers, ovens, coffee, lamp, colliders, occluders, proxies }
 */
export function buildBank(ctx, cfg) {
  const { tex, parts, glowers } = ctx;
  const { s, zF, f, depth, u0 } = cfg;
  const R = (n) => tex.rect(n);
  const rotY = f > 0 ? 0 : Math.PI;
  // local (u = |x|, y, d = depth behind the front plane) -> world
  const wx = (u) => s * u, wz = (d) => zF - f * d;
  const Tl = (u, y, d, rx = 0, ry = 0, rz = 0) => (rx || ry || rz ? mulM(T(wx(u), y, wz(d), 0, rotY, 0), T(0, 0, 0, rx, ry, rz)) : T(wx(u), y, wz(d), 0, rotY, 0));
  const B = (ua, ya, da, ub, yb, db, segs) => boxMM(wx(ua), ya, wz(da), wx(ub), yb, wz(db), segs);
  // AO for a galley bank: darker deep inside alcoves (depth), at the floor and under the upper units
  const bankAO = (x, y, z, nx, ny, nz) => {
    const d = (zF - z) * f;     // depth behind the front plane
    let ao = 0.66 + 0.34 * smoothstep(0.0, 0.3, y);
    ao *= 1.0 - 0.28 * smoothstep(0.05, 0.6, d);
    if (y > 1.06 && y < 1.4) ao *= 0.9;
    if (ny < -0.5) ao *= 0.85;
    return ao;
  };
  const kit = new Kit(bankAO);
  const deckY = 1.06, deckT = 0.032, deckD = cfg.deckDepth ?? 0.56;
  const out = { kit, carts: [], drawers: [], ovens: [], coffee: [], colliders: [], occluders: [], proxies: [], extras: [] };

  // ------------------------------------------------------------------ carcass
  // inboard side panel (full height), back panel, outboard closeout following the fuselage
  kit.add('plastic', worldUV(B(u0, 0, -0.005, u0 + 0.025, 2.2, depth, [1, 10, 4]), 1.2), null, { color: COL.lam });
  kit.add('plastic', worldUV(B(u0, 0, depth - 0.02, 1.62, 2.2, depth, [6, 10, 1]), 1.2), null, { color: COL.lam });
  {
    // curved outboard closeout from the floor to the ceiling cove
    const p0 = Math.asin((0 - CY) / R_CL), p1 = Math.asin((2.07 - CY) / R_CL);
    const n = 20, nz = 4, pos = [], nor = [], uv = [], idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= n; i++) {
      const p = p0 + (p1 - p0) * i / n, d = depth * j / nz;
      pos.push(s * R_CL * Math.cos(p), CY + R_CL * Math.sin(p), wz(d));
      nor.push(-s * Math.cos(p), -Math.sin(p), 0);
      uv.push(d * 1.2, p * R_CL * 1.2);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, dd = c + 1;
      if (s * f > 0) idx.push(a, b, c, b, dd, c); else idx.push(a, c, b, b, c, dd);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    kit.add('plastic', g, null, { color: COL.lam });
    // front edge band (finished edge of the closeout)
    const band = [];
    for (let i = 0; i <= 16; i++) { const y = 2.07 * i / 16; band.push([arcX(y), y]); }
    for (let i = 16; i >= 0; i--) { const y = 2.07 * i / 16; band.push([arcX(y) - 0.05, y]); }
    const g2 = slab(ccw(band), -0.012, 0.012);
    kit.add('plastic', worldUV(g2, 1.2), T(0, 0, wz(0.0), 0, 0, 0, s, 1, 1), { color: COL.lamLight });
  }
  // header panel above the top compartments up into the ceiling
  kit.add('plastic', worldUV(B(u0, 2.03, -0.012, 0.74, 2.2, 0.03, [3, 1, 1]), 1.2), null, { color: COL.lamLight });
  // galley ID placard on the header
  kit.add('placard', plane(0.07, 0.046), Tl(u0 + 0.08, 2.1, -0.0135), { uvRect: R(cfg.label || 'g1') });

  // ------------------------------------------------------------------ lower: bays + columns
  for (const b of cfg.bays) {
    const ua = b.u, ub = b.u + b.w;
    // partitions and bay top
    kit.add('plastic', worldUV(B(ub, 0, 0, ub + 0.012, deckY, depth - 0.02, [1, 4, 2]), 1.5), null, { color: COL.lam });
    if (b.type === 'cart' || b.type === 'half') {
      // bay floor guide rails + bay roof + back stop + turn-button retainer
      kit.add('steel', B(ua, 0, 0.0, ub, 0.006, depth - 0.02, [1, 1, 1]), null, { color: COL.steelDark });
      for (const k of [0.07, b.w - 0.07]) kit.add('steel', B(ua + k - 0.01, 0.006, 0.02, ua + k + 0.01, 0.026, depth - 0.05), null, { color: COL.steel });
      kit.add('plastic', B(ua, CART.h + 0.01, 0.0, ub, deckY, depth - 0.02, [1, 1, 1]), null, { color: COL.lam });
      kit.add('rubber', B(ua + 0.02, 0.12, depth - 0.05, ub - 0.02, 0.2, depth - 0.02), null, { color: COL.dark });
      // retainer latch: orange turn-button at the top of the bay
      kit.add('rubber', rbox(0.06, 0.03, 0.022, 0.008), Tl((ua + ub) / 2, CART.h + 0.0, -0.012), { color: COL.orange });
      kit.add('chrome', cyl(0.009, 0.009, 0.03, 10), Tl((ua + ub) / 2, CART.h + 0.0, -0.006, Math.PI / 2));
      const cd = b.type === 'half' ? CART.half : CART.full;
      if (b.type === 'half') {
        // behind a half-size cart: a fixed stowage box (visible when the cart is out)
        kit.add('plastic', B(ua + 0.01, 0.01, CART.half + 0.02, ub - 0.01, CART.h, depth - 0.03), null, { color: COL.lamLight });
      }
      out.carts.push({ u: (ua + ub) / 2, depth: cd, half: b.type === 'half', pos: new THREE.Vector3(wx((ua + ub) / 2), 0.5, wz(0)) });
      out.colliders.push({ u: [ua, ub], d: [0.0, depth], y1: 1.06, cart: out.carts.length - 1 });
    } else if (b.type === 'units') {
      // a column of standard-unit drawers (from the top), then compactor or doors below
      kit.add('plastic', B(ua, 0, 0.0, ub, deckY, 0.01, [1, 4, 1]), null, { color: COL.lam, ao: false });
      let y = deckY - 0.03;
      for (let i = 0; i < (b.drawers || 0); i++) {
        const y1 = y, y0 = y - DRAWER.h;
        kit.add('rubber', B(ua + 0.006, y0 - 0.004, -0.002, ub - 0.006, y1 + 0.004, 0.008), null, { color: COL.dark });
        out.drawers.push({ u: (ua + ub) / 2, y: y0, w: ub - ua - 0.016, h: DRAWER.h - 0.006, pos: new THREE.Vector3(wx((ua + ub) / 2), (y0 + y1) / 2, wz(0)) });
        y = y0 - 0.01;
      }
      if (b.compactor) {
        const y1 = y, y0 = 0.03;
        kit.add('steel', B(ua + 0.008, y0, -0.012, ub - 0.008, y1, 0.0, [1, 2, 1]), null, { color: COL.steel });
        kit.add('chrome', grabHandle(0.16, 0.04, 0.009), Tl((ua + ub) / 2, y1 - 0.07, -0.012));
        kit.add('placard', plane(0.2, 0.04), Tl((ua + ub) / 2, y1 - 0.15, -0.0125), { uvRect: R('compactor') });
        kit.add('rubber', B(ua + 0.03, y0 + 0.05, -0.0135, ub - 0.03, y0 + 0.09, -0.012), null, { color: [0.15, 0.15, 0.16] });
        kit.add('placard', plane(0.13, 0.026), Tl((ua + ub) / 2, y0 + 0.17, -0.0125), { uvRect: R('maxLoad') });
      } else if (y > 0.1) {
        stowDoor(kit, Tl, B, ua, ub, 0.03, y, R, 'stowage');
      }
    } else if (b.type === 'stow') {
      kit.add('plastic', B(ua, 0, 0.0, ub, deckY, 0.01, [1, 4, 1]), null, { color: COL.lam, ao: false });
      stowDoor(kit, Tl, B, ua, ub, 0.04, deckY - 0.26, R, b.label || 'stowage');
      // waste flap at the top of the column
      kit.add('steel', B(ua + 0.01, deckY - 0.24, -0.01, ub - 0.01, deckY - 0.03, 0.0), null, { color: COL.steel });
      kit.add('rubber', B(ua + 0.025, deckY - 0.2, -0.0115, ub - 0.025, deckY - 0.18, -0.01), null, { color: COL.dark });
      kit.add('placard', plane(Math.min(0.12, ub - ua - 0.04), 0.035), Tl((ua + ub) / 2, deckY - 0.12, -0.0105), { uvRect: R('waste') });
    }
  }
  // kick strip under the bays (front, floor) and the work deck
  const uDeck1 = arcX(deckY + deckT) - 0.02;
  kit.add('steel', worldUV(B(u0 + 0.02, deckY, -0.025, uDeck1, deckY + deckT, deckD, [4, 1, 2]), 1.0), null, { color: COL.steel });
  kit.add('steel', B(u0 + 0.02, deckY + deckT, -0.025, uDeck1, deckY + deckT + 0.012, -0.015), null, { color: COL.steel });   // spill lip
  // back splash
  kit.add('steel', worldUV(B(u0 + 0.02, deckY + deckT, deckD, arcX(1.44) - 0.01, 1.46, deckD + 0.01, [3, 2, 1]), 1.0), null, { color: COL.steelDark });

  // ------------------------------------------------------------------ mid zone (on the work deck)
  for (const m of cfg.mid || []) {
    const ua = m.u, ub = m.u + m.w, uc = (ua + ub) / 2;
    const y0 = deckY + deckT;
    if (m.type === 'coffee') {
      const hd = 0.36;    // housing depth (from the back splash)
      const dFront = deckD - hd;
      kit.add('steel', B(ua, y0 + 0.21, dFront, ub, 1.44, deckD, [2, 2, 2]), null, { color: COL.steel });
      // brew head + basket handle, warmer plate, pot
      kit.add('rubber', B(ua + 0.03, y0 + 0.17, dFront + 0.02, ub - 0.03, y0 + 0.21, deckD - 0.05), null, { color: COL.dark });
      kit.add('rubber', rbox(0.04, 0.025, 0.12, 0.01), Tl(uc, y0 + 0.19, dFront - 0.04), { color: COL.dark });
      kit.add('steel', B(ua + 0.01, y0, dFront + 0.0, ub - 0.01, y0 + 0.015, deckD), null, { color: COL.steelDark });
      kit.add('rubber', cyl(0.07, 0.07, 0.006, 24), Tl(uc, y0 + 0.018, dFront + 0.12), { color: [0.12, 0.12, 0.12] });
      pot(kit, Tl(uc, y0 + 0.021, dFront + 0.12));
      // control strip: switches + display (dynamic)
      for (let i = 0; i < 3; i++) kit.add('rubber', rbox(0.018, 0.03, 0.016, 0.004), Tl(ua + 0.05 + i * 0.03, 1.36, dFront - 0.006), { color: i === 0 ? [0.5, 0.05, 0.03] : COL.dark });
      kit.add('placard', plane(0.13, 0.03), Tl(uc, 1.415, dFront - 0.002), { uvRect: R('coffee') });
      kit.add('rubber', box(0.085, 0.03, 0.004), Tl(ub - 0.065, 1.36, dFront - 0.002), { color: COL.dark });
      kit.add('placard', plane(0.09, 0.034), Tl(uc, 1.325, dFront - 0.002), { uvRect: R('hot') });
      out.coffee.push({ displayM: Tl(ub - 0.065, 1.36, dFront - 0.0045), pos: new THREE.Vector3(wx(uc), 1.34, wz(dFront)), proxy: { u: uc, y: 1.34, d: dFront, w: ub - ua, h: 0.18 } });
      out.occluders.push({ u: [ua, ub], y: [y0 + 0.21, 1.44], d: [dFront, deckD] });
    } else if (m.type === 'boiler') {
      const hd = 0.3, dFront = deckD - hd;
      kit.add('steel', B(ua, y0 + 0.2, dFront, ub, 1.44, deckD, [2, 2, 2]), null, { color: COL.steel });
      kit.add('chrome', cyl(0.012, 0.012, 0.06, 12), Tl(uc, y0 + 0.17, dFront + 0.04));
      kit.add('rubber', rbox(0.05, 0.03, 0.03, 0.008), Tl(uc, y0 + 0.21, dFront + 0.0), { color: COL.dark });
      kit.add('steel', B(ua + 0.01, y0, dFront, ub - 0.01, y0 + 0.012, deckD), null, { color: COL.steelDark });
      cups(kit, Tl(uc, y0 + 0.012, dFront + 0.08), 1);
      kit.add('placard', plane(0.13, 0.03), Tl(uc, 1.41, dFront - 0.002), { uvRect: R('boiler') });
      kit.add('placard', plane(0.09, 0.034), Tl(uc, 1.35, dFront - 0.002), { uvRect: R('hot') });
      out.extras.push({ kind: 'led', m: Tl(uc - 0.07, 1.35, dFront - 0.003), rect: 'ledGreen' });
      out.extras.push({ kind: 'led', m: Tl(uc + 0.07, 1.35, dFront - 0.003), rect: 'ledAmber' });
      out.occluders.push({ u: [ua, ub], y: [y0 + 0.2, 1.44], d: [dFront, deckD] });
    } else if (m.type === 'cb') {
      kit.add('rubber', B(ua, 1.16, deckD - 0.012, ub, 1.40, deckD), null, { color: [0.12, 0.12, 0.13] });
      kit.add('placard', plane(ub - ua - 0.01, 0.235), Tl(uc, 1.28, deckD - 0.0125), { uvRect: R('cb') });
      for (let i = 0; i < 8; i++) {
        const cu = ua + 0.005 + (ub - ua - 0.01) * (70 + (i % 4) * 124) / 512, cy2 = 1.28 + 0.1175 - 0.235 * (100 + Math.floor(i / 4) * 110) / 300;
        kit.add('rubber', cyl(0.0065, 0.0065, 0.012, 10), Tl(cu, cy2, deckD - 0.018, Math.PI / 2), { color: [0.05, 0.05, 0.05] });
        kit.add('chrome', cyl(0.004, 0.004, 0.004, 8), Tl(cu, cy2, deckD - 0.025, Math.PI / 2));
      }
      kit.add('placard', plane(0.11, 0.024), Tl(uc, 1.425, deckD - 0.001), { uvRect: R('galleyPower') });
    } else if (m.type === 'handset') {
      handset(kit, Tl, uc, 1.27, deckD, R);
      out.proxies.push({ kind: 'handset', c: new THREE.Vector3(wx(uc), 1.27, wz(deckD - 0.04)), s: new THREE.Vector3(0.12, 0.26, 0.12) });
    } else if (m.type === 'chiller') {
      kit.add('plastic', B(ua, y0 + 0.05, deckD - 0.05, ub, 1.44, deckD, [1, 2, 1]), null, { color: COL.lamLight });
      kit.add('placard', plane(ub - ua - 0.03, 0.12), Tl(uc, 1.24, deckD - 0.051), { uvRect: R('louvre') });
      kit.add('placard', plane(0.11, 0.025), Tl(uc, 1.40, deckD - 0.051), { uvRect: R('chiller') });
      kit.add('rubber', box(0.06, 0.026, 0.004), Tl(uc, 1.35, deckD - 0.052), { color: COL.dark });
      out.extras.push({ kind: 'disp', m: Tl(uc, 1.35, deckD - 0.0545), w: 0.055, h: 0.022, rect: 'chillerDisp' });
    } else if (m.type === 'items') {
      // a few things on the work deck: cup stacks, napkins, stirrer canister, tray
      cups(kit, Tl(ua + 0.05, y0, 0.18), 9);
      cups(kit, Tl(ua + 0.11, y0, 0.22), 6);
      kit.add('plastic', rbox(0.11, 0.035, 0.11, 0.004), Tl(ua + 0.2, y0 + 0.0175, 0.2, 0, 0.2, 0), { color: [0.95, 0.94, 0.9] });   // napkins
      kit.add('plastic', rbox(0.105, 0.003, 0.105, 0.001), Tl(ua + 0.2, y0 + 0.036, 0.2, 0, 0.35, 0), { color: [0.12, 0.33, 0.45] });
      kit.add('steel', cyl(0.03, 0.03, 0.11, 16), Tl(ua + 0.28, y0 + 0.055, 0.34), { color: COL.steel });
      for (let i = 0; i < 7; i++) kit.add('plastic', cyl(0.002, 0.002, 0.08, 4), Tl(ua + 0.28 + (i % 3 - 1) * 0.008, y0 + 0.13, 0.34 + (Math.floor(i / 3) - 1) * 0.008, 0.08 * (i % 2 ? 1 : -1), 0, 0.1 * (i - 3) / 3), { color: [0.9, 0.85, 0.75] });
      kit.add('plastic', rbox(0.3, 0.012, 0.22, 0.004), Tl(ua + 0.12, y0 + 0.006, 0.42), { color: [0.22, 0.24, 0.26] });   // tray
    }
  }

  // ------------------------------------------------------------------ upper zone: ovens / boxes
  const yU0 = 1.46, yU1 = 1.78;
  kit.add('plastic', worldUV(B(u0 + 0.02, 1.44, 0.0, arcX(1.46) - 0.005, yU0, 0.56, [3, 1, 2]), 1.2), null, { color: COL.lam });     // shelf / light valance
  for (const m of cfg.upper || []) {
    const ua = m.u, ub = m.u + m.w, uc = (ua + ub) / 2;
    if (m.type === 'oven') {
      // oven carcass + cavity (dark, with racks and a few meal casseroles)
      kit.add('steel', B(ua, yU0, 0.0, ub, yU1, 0.55, [2, 2, 2]), null, { color: COL.steelDark });
      kit.add('rubber', inside(B(ua + 0.012, yU0 + 0.012, -0.0005, ub - 0.012, yU1 - 0.06, 0.48)), null, { color: [0.3, 0.3, 0.31], ao: (x, y, z) => 0.6 + 0.4 * smoothstep(0.45, 0, (zF - z) * f) });
      for (let r = 0; r < 3; r++) {
        const ry = yU0 + 0.05 + r * 0.075;
        for (let k = 0; k < 4; k++) kit.add('steel', box(ub - ua - 0.03, 0.003, 0.003), Tl(uc, ry, 0.06 + k * 0.12), { color: COL.steelDark });
        kit.add('steel', rbox(ub - ua - 0.05, 0.035, 0.4, 0.008), Tl(uc, ry + 0.02, 0.26), { color: [0.95, 0.95, 0.96] });
      }
      // control panel strip above the door
      kit.add('rubber', B(ua + 0.004, yU1 - 0.058, -0.008, ub - 0.004, yU1 - 0.004, 0.0), null, { color: COL.dark });
      kit.add('placard', plane(0.07, 0.018), Tl(ua + 0.055, yU1 - 0.031, -0.0085), { uvRect: R(m.label || 'oven1') });
      for (let i = 0; i < 2; i++) kit.add('chrome', cyl(0.009, 0.009, 0.012, 12), Tl(ub - 0.03 - i * 0.03, yU1 - 0.031, -0.012, Math.PI / 2));
      kit.add('placard', plane(0.09, 0.034), Tl(uc, yU0 - 0.035, -0.022), { uvRect: R('hot') });
      out.ovens.push({ u: uc, y: yU0 + 0.006, w: ub - ua - 0.01, h: yU1 - 0.066 - yU0, label: m.label,
        timerM: Tl(uc + 0.02, yU1 - 0.031, -0.0088), pos: new THREE.Vector3(wx(uc), yU0 + 0.15, wz(0)) });
      out.occluders.push({ u: [ua, ub], y: [yU0, yU1], d: [0.02, 0.55] });
    } else if (m.type === 'box') {
      kit.add('plastic', B(ua, yU0, 0.0, ub, yU1, 0.55, [1, 1, 1]), null, { color: COL.lam });
      stowDoor(kit, Tl, B, ua + 0.004, ub - 0.004, yU0 + 0.01, yU1 - 0.01, R, m.label || 'stowage');
    }
  }
  // top compartments
  for (const m of cfg.top || []) {
    const ua = m.u, ub = m.u + m.w;
    kit.add('plastic', B(ua, 1.80, 0.0, ub, 2.03, 0.55, [1, 1, 1]), null, { color: COL.lam });
    stowDoor(kit, Tl, B, ua + 0.004, ub - 0.004, 1.81, 2.02, R, m.label || 'stowage');
  }
  // filler between the upper zone and the top compartments + shelf trim
  kit.add('plastic', B(u0 + 0.02, yU1, 0.0, Math.min(arcX(1.80) - 0.005, 1.3), 1.80, 0.55), null, { color: COL.lamLight });
  // secure placard
  kit.add('placard', plane(0.2, 0.0375), Tl(u0 + 0.16, 1.45, -0.0015), { uvRect: R('secure') });

  // ------------------------------------------------------------------ work light (under the shelf) + lamp
  const lightU0 = u0 + 0.06, lightU1 = Math.min(arcX(1.44) - 0.06, 1.2);
  out.extras.push({ kind: 'strip', m: Tl((lightU0 + lightU1) / 2, 1.4385, 0.08, Math.PI / 2), w: lightU1 - lightU0, h: 0.035 });
  const lampPos = new THREE.Vector3(wx((lightU0 + lightU1) / 2), 1.40, wz(0.12));
  const b0 = new THREE.Vector3(wx(u0 - 0.01), -0.05, wz(depth + 0.02)), b1 = new THREE.Vector3(wx(1.7), 2.12, wz(-0.65));
  out.lamp = { pos: lampPos, min: b0.clone().min(b1), max: b0.clone().max(b1) };

  // collision: the whole bank (minus the carts, which add their own when pulled out)
  const c0 = new THREE.Vector3(wx(u0), 0, wz(depth)), c1 = new THREE.Vector3(wx(1.75), 2.2, wz(0));
  out.bankCollider = [c0.clone().min(c1), c0.clone().max(c1)];
  out.occluderBox = { c: new THREE.Vector3().addVectors(c0, c1).multiplyScalar(0.5), s: new THREE.Vector3().subVectors(c1, c0).set(Math.abs(c1.x - c0.x), 2.2, Math.abs(c1.z - c0.z)) };
  out.Tl = Tl; out.wx = wx; out.wz = wz; out.rotY = rotY;
  return out;
}

/** Hinged stowage door with turn latch + label. */
function stowDoor(kit, Tl, B, ua, ub, y0, y1, R, label) {
  kit.add('plastic', worldUV(B(ua + 0.004, y0, -0.014, ub - 0.004, y1, 0.0, [1, 2, 1]), 1.3), null, { color: [0.84, 0.84, 0.83] });
  kit.add('rubber', B(ua + 0.004, y0 - 0.003, -0.002, ub - 0.004, y0, 0.0), null, { color: [0.1, 0.1, 0.1] });
  const uc = (ua + ub) / 2;
  kit.add('rubber', rbox(0.05, 0.026, 0.012, 0.006), Tl(uc, y1 - 0.04, -0.018), { color: [0.12, 0.12, 0.13] });
  kit.add('chrome', rbox(0.034, 0.008, 0.008, 0.003), Tl(uc, y1 - 0.04, -0.025));
  kit.add('placard', plane(Math.min(0.1, ub - ua - 0.03), 0.026), Tl(uc, y1 - 0.08, -0.0145), { uvRect: R(label) });
}

/** Glass coffee pot with dark coffee, black handle and lid. */
function pot(kit, m) {
  const g = lathe([[0.0, 0], [0.06, 0], [0.072, 0.03], [0.074, 0.08], [0.058, 0.13], [0.04, 0.15], [0.045, 0.165]], 24);
  kit.add('glass', g, m);
  const coffee = lathe([[0.0, 0.004], [0.058, 0.004], [0.069, 0.03], [0.07, 0.06], [0.0, 0.06]], 20);
  kit.add('rubber', coffee, m, { color: [0.05, 0.025, 0.01] });
  const lid = cyl(0.046, 0.048, 0.025, 20);
  kit.add('rubber', lid, mulM(m, T(0, 0.175, 0)), { color: [0.04, 0.04, 0.04] });
  kit.add('rubber', tube([[0, 0.15, 0.045], [0, 0.15, 0.1], [0, 0.07, 0.1], [0, 0.05, 0.07]], 0.009, 8, 12), m, { color: [0.04, 0.04, 0.04] });
  kit.add('steel', cyl(0.066, 0.066, 0.012, 24), mulM(m, T(0, 0.006, 0)), { color: [0.7, 0.7, 0.72] });
}
/** Stack of white plastic cups. */
function cups(kit, m, n) {
  const g = lathe([[0.022, 0], [0.034, 0.09], [0.036, 0.092]], 16);
  for (let i = 0; i < n; i++) kit.add('plastic', g.clone(), mulM(m, T(0, i * 0.012, 0)), { color: [0.95, 0.95, 0.94] });
  g.dispose();
}
function handset(kit, Tl, u, y, d, R) {
  kit.add('rubber', rbox(0.09, 0.22, 0.03, 0.012), Tl(u, y, d - 0.015), { color: [0.13, 0.13, 0.14] });
  kit.add('rubber', new THREE.CapsuleGeometry(0.022, 0.16, 4, 10), Tl(u, y, d - 0.05), { color: [0.18, 0.18, 0.19] });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) kit.add('rubber', box(0.012, 0.01, 0.004), Tl(u - 0.012 + j * 0.012, y + 0.04 - i * 0.014, d - 0.073), { color: [0.7, 0.7, 0.7] });
  kit.add('placard', plane(0.09, 0.02), Tl(u, y + 0.135, d - 0.001), { uvRect: R('interphone') });
}
/** Turn a box inside out (interior faces visible, front face invisible from outside). */
function inside(g) {
  const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
  const N = g.attributes.normal; for (let i = 0; i < N.count; i++) N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i));
  return g;
}
function mulM(a, b) { return new THREE.Matrix4().multiplyMatrices(a, b); }

// ===================================================================================== parts geometry
/** Instanced geometries for carts, drawers, oven doors. */
export function galleyPartGeometries(tex) {
  const K = (fn) => { const k = new Kit(() => 1); fn(k); return k; };
  const R = (n) => tex.rect(n);
  // full-size cart (front face at z = 0, body towards -z); a half cart is the same mesh scaled 0.5 in z
  const cw = CART.w, ch = CART.h, cd = CART.full;
  const cart = K((k) => {
    // body: brushed aluminium with rounded vertical edges
    k.add('steel', worldUV(rbox(cw, ch - 0.07, cd, 0.012, 2).translate(0, 0.07 + (ch - 0.07) / 2, -cd / 2), 1.6), null, { color: [0.86, 0.87, 0.88], ao: (x, y) => 0.75 + 0.25 * smoothstep(0.05, 0.4, y) });
    // top rim + recessed top
    k.add('steel', box(cw - 0.03, 0.006, cd - 0.03).translate(0, ch + 0.002, -cd / 2), null, { color: [0.78, 0.79, 0.8] });
    // front door frame + latch lever + handle recess
    k.add('steel', frame(cw - 0.004, ch - 0.09, 0.012, 0.006, 0.01).translate(0, 0.07 + (ch - 0.07) / 2, 0.003), null, { color: [0.7, 0.71, 0.72] });
    k.add('chrome', rbox(0.022, 0.12, 0.018, 0.006).translate(0, ch - 0.16, 0.01));
    k.add('chrome', rbox(0.2, 0.02, 0.03, 0.008).translate(0, ch - 0.03, 0.012));
  });
  const cartDark = K((k) => {
    // castors, bumper strip, brake pedal housing
    for (const [x, z] of [[-cw / 2 + 0.04, -0.06], [cw / 2 - 0.04, -0.06], [-cw / 2 + 0.04, -cd + 0.06], [cw / 2 - 0.04, -cd + 0.06]]) {
      k.add('rubber', cyl(0.035, 0.035, 0.022, 14).rotateZ(Math.PI / 2).translate(x, 0.035, z), null, { color: [0.05, 0.05, 0.05] });
      k.add('rubber', box(0.03, 0.03, 0.05).translate(x, 0.075, z), null, { color: [0.15, 0.15, 0.16] });
    }
    k.add('rubber', box(cw + 0.006, 0.03, cd + 0.006).translate(0, 0.075, -cd / 2), null, { color: [0.13, 0.13, 0.14] });
    k.add('rubber', box(0.09, 0.02, 0.04).translate(0, 0.05, 0.005), null, { color: [0.1, 0.1, 0.1] });
  });
  const cartPlac = K((k) => {
    k.add('placard', plane(cw - 0.03, (cw - 0.03) * 300 / 512).translate(0, ch - 0.33, 0.0065), null, { uvRect: R('cart') });
    k.add('placard', plane(0.05, 0.025).translate(-0.035, 0.05, 0.026), null, { uvRect: R('cartFlag') });
    k.add('placard', plane(0.05, 0.025).translate(0.035, 0.05, 0.026), null, { uvRect: R('cartBrakeRed') });
  });
  // standard unit drawer (front at z = 0, body towards -z, x-centred, bottom at y = 0)
  const dw = DRAWER.w, dh = DRAWER.h, dd = DRAWER.d;
  const drawer = K((k) => {
    k.add('steel', box(dw - 0.01, dh - 0.02, dd - 0.01).translate(0, dh / 2, -dd / 2), null, { color: [0.82, 0.83, 0.84] });
    k.add('steel', rbox(dw, dh, 0.014, 0.004).translate(0, dh / 2, 0.0), null, { color: [0.9, 0.9, 0.91] });
    k.add('chrome', grabHandle(0.12, 0.028, 0.006).translate(0, dh - 0.05, 0.007));
    k.add('rubber', rbox(0.05, 0.02, 0.008, 0.004).translate(0, dh - 0.105, 0.008), null, { color: [0.75, 0.3, 0.06] });
  });
  const drawerPlac = K((k) => { k.add('placard', plane(0.13, 0.028).translate(0, 0.07, 0.0075), null, { uvRect: R('drawer') }); });
  // oven door: hinge at the bottom (local x axis), door rises along +y, outside face at +z
  const ow = OVEN.w, oh = 0.272;
  const ovenDoor = K((k) => {
    k.add('steel', frame(ow, oh, 0.035, 0.016, 0.006).translate(0, oh / 2, 0.008), null, { color: [0.86, 0.86, 0.87] });
    k.add('chrome', rbox(0.2, 0.018, 0.026, 0.008).translate(0, oh - 0.04, 0.03));
    for (const x of [-0.09, 0.09]) k.add('chrome', box(0.012, 0.012, 0.02).translate(x, oh - 0.04, 0.018));
    k.add('rubber', box(ow - 0.04, oh - 0.04, 0.004).translate(0, oh / 2, 0.001), null, { color: [0.1, 0.1, 0.1] });
  });
  const ovenGlass = K((k) => { k.add('glassDark', plane(ow - 0.07, oh - 0.07).translate(0, oh / 2, 0.0165)); });
  return { cart, cartDark, cartPlac, drawer, drawerPlac, ovenDoor, ovenGlass };
}
