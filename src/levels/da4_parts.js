// Dead Air 4 (The Terminal) building blocks: curtain-wall glazing, airport
// wayfinding signage, backlit airline fascias, hanging banners, stopped
// escalators, a walk-through metal detector with controllable status lights,
// baggage containers, queue stanchions, round columns, a fighter-jet model for
// the flyover and small helpers shared by the chapter's area builders.
import * as THREE from 'three';
import { P, sign } from './kit.js';
import { F_SOLID, F_SHOOT, F_SIGHT, F_NONAV } from '../world/collision.js';
import { materials } from '../render/materials.js';
import { adTexture } from './da_parts.js';
import { makeRng } from '../core/math.js';
import { DF } from '../render/decals.js';

export const rng = makeRng(4404);
export const NC = { collide: false };
export const rot = (x, z, ry, lx, lz) => { const c = Math.cos(ry), s = Math.sin(ry); return [x + c * lx + s * lz, z - s * lx + c * lz]; };

// ------------------------------------------------------------- materials --
// Clear architectural glass (the kit's 'glass' is 50 % opaque): the curtain
// walls must show the burning curb and the apron behind them.
export function curtainMat() {
  const name = 'da4Curtain';
  if (!materials.cache.has(name)) {
    const m = new THREE.MeshStandardMaterial({ color: 0x9fb8c4, roughness: 0.06, metalness: 0.55, transparent: true, opacity: 0.16, depthWrite: false, vertexColors: true, side: THREE.DoubleSide });
    m.name = name;
    materials.cache.set(name, m);
  }
  return name;
}

// ---------------------------------------------------------------- glazing --
// Curtain wall along X at z (or along Z at x): glass + mullions + transoms.
// Glass stops movement only (bullets and sight pass: the director never spawns
// in plain view behind it). openings: [[a, b, yTop]] gaps (doors / smashed bays).
export function glassWallX(L, x0, x1, z, y0, y1, o = {}) {
  const gm = curtainMat();
  const step = o.step ?? 3, tr = o.transoms ?? [y0 + 2.6, y0 + 6, y0 + 10];
  const ops = o.openings || [];
  const inOp = (a, b, y) => ops.some(([p, q, yt]) => a < q - 0.01 && b > p + 0.01 && y < (yt ?? y1));
  // glass panes per bay
  for (let x = x0; x < x1 - 0.01; x += step) {
    const a = x, b = Math.min(x1, x + step);
    const op = ops.find(([p, q]) => a < q - 0.01 && b > p + 0.01);
    const gy0 = op ? (op[2] ?? y1) : y0;
    if (gy0 < y1) L.box(a, gy0, z - 0.015, b, y1, z + 0.015, gm, { flags: F_SOLID, surf: 'glass' });
  }
  const mm = o.mullion ?? 'metalDark', mt = o.mullionTint ?? 0x3a3e44;
  for (let x = x0; x <= x1 + 0.01; x += step) {
    const bottom = ops.some(([p, q]) => x > p + 0.05 && x < q - 0.05) ? (ops.find(([p, q]) => x > p + 0.05 && x < q - 0.05)[2] ?? y1) : y0;
    if (bottom < y1) L.box(x - 0.05, bottom, z - 0.12, x + 0.05, y1, z + 0.12, mm, { tint: mt, collide: bottom <= y0 + 0.1 && o.solidMullions !== false });
  }
  for (const ty of tr) {
    if (ty <= y0 || ty >= y1) continue;
    let cx = x0;
    for (const [p, q, yt] of [...ops].sort((m, n) => m[0] - n[0])) { if (ty < (yt ?? y1)) { if (p > cx) L.box(cx, ty - 0.05, z - 0.1, p, ty + 0.05, z + 0.1, mm, { tint: mt, collide: false }); cx = Math.max(cx, q); } }
    if (cx < x1) L.box(cx, ty - 0.05, z - 0.1, x1, ty + 0.05, z + 0.1, mm, { tint: mt, collide: false });
  }
  if (o.sill !== false) L.box(x0, y0, z - 0.14, x1, y0 + 0.06, z + 0.14, 'metalDark', { tint: 0x2a2c30, collide: false });
  void inOp;
}
export function glassWallZ(L, z0, z1, x, y0, y1, o = {}) {
  const gm = curtainMat();
  const step = o.step ?? 3, tr = o.transoms ?? [y0 + 2.6, y0 + 6, y0 + 10];
  const ops = o.openings || [];
  for (let z = z0; z < z1 - 0.01; z += step) {
    const a = z, b = Math.min(z1, z + step);
    const op = ops.find(([p, q]) => a < q - 0.01 && b > p + 0.01);
    const gy0 = op ? (op[2] ?? y1) : y0;
    if (gy0 < y1) L.box(x - 0.015, gy0, a, x + 0.015, y1, b, gm, { flags: F_SOLID, surf: 'glass' });
  }
  const mm = o.mullion ?? 'metalDark', mt = o.mullionTint ?? 0x3a3e44;
  for (let z = z0; z <= z1 + 0.01; z += step) {
    const op = ops.find(([p, q]) => z > p + 0.05 && z < q - 0.05);
    const bottom = op ? (op[2] ?? y1) : y0;
    if (bottom < y1) L.box(x - 0.12, bottom, z - 0.05, x + 0.12, y1, z + 0.05, mm, { tint: mt, collide: bottom <= y0 + 0.1 && o.solidMullions !== false });
  }
  for (const ty of tr) {
    if (ty <= y0 || ty >= y1) continue;
    let cz = z0;
    for (const [p, q, yt] of [...ops].sort((m, n) => m[0] - n[0])) { if (ty < (yt ?? y1)) { if (p > cz) L.box(x - 0.1, ty - 0.05, cz, x + 0.1, ty + 0.05, p, mm, { tint: mt, collide: false }); cz = Math.max(cz, q); } }
    if (cz < z1) L.box(x - 0.1, ty - 0.05, cz, x + 0.1, ty + 0.05, z1, mm, { tint: mt, collide: false });
  }
  if (o.sill !== false) L.box(x - 0.14, y0, z0, x + 0.14, y0 + 0.06, z1, 'metalDark', { tint: 0x2a2c30, collide: false });
}
// Interior window strip (sill + glass + head) set into an opening of a solid wall.
export function interiorGlass(L, axis, a0, a1, fixed, y0, y1) {
  const gm = curtainMat();
  if (axis === 'x') {
    L.box(a0, y0, fixed - 0.012, a1, y1, fixed + 0.012, gm, { flags: F_SOLID, surf: 'glass' });
    for (let a = a0; a <= a1 + 0.01; a += Math.max(0.8, (a1 - a0) / Math.max(1, Math.round((a1 - a0) / 1.6)))) L.box(a - 0.03, y0, fixed - 0.06, a + 0.03, y1, fixed + 0.06, 'metalDark', { tint: 0x2a2c30, collide: false });
  } else {
    L.box(fixed - 0.012, y0, a0, fixed + 0.012, y1, a1, gm, { flags: F_SOLID, surf: 'glass' });
    for (let a = a0; a <= a1 + 0.01; a += Math.max(0.8, (a1 - a0) / Math.max(1, Math.round((a1 - a0) / 1.6)))) L.box(fixed - 0.06, y0, a - 0.03, fixed + 0.06, y1, a + 0.03, 'metalDark', { tint: 0x2a2c30, collide: false });
  }
}

// --------------------------------------------------------------- signage --
// Airport wayfinding: yellow on charcoal, crisp and backlit.
export function wayfind(L, text, x, y, z, ry, w, h, o = {}) {
  return sign(L, text, x, y, z, ry, w, h, { bg: o.bg ?? '#16191e', fg: o.fg ?? '#f2c230', border: o.border, clean: true, font: 'Arial, Helvetica, sans-serif', glow: o.glow ?? 0.5, light: false, ...o.extra });
}
// Printed notice (paper / plate) with weathering.
export function notice(L, text, x, y, z, ry, w, h, o = {}) {
  return sign(L, text, x, y, z, ry, w, h, { bg: o.bg ?? '#e8e2d0', fg: o.fg ?? '#1a1a1a', ...o });
}
// Hanging wayfinding box sign (two faces) on rods from the ceiling.
export function hangingSign(L, text, x, y, z, ry, w, h, ceilY, o = {}) {
  const nx = Math.sin(ry), nz = Math.cos(ry);
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0, 0, w + 0.08, h + 0.08, 0.16, 'metalDark', 0x1a1c20);
  for (const s of [-1, 1]) p.cyl(s * w * 0.35, (ceilY - y) / 2 + h / 2, 0, 0.012, ceilY - y - h / 2, 'metalDark', null, null, 6);
  wayfind(L, text, x + nx * 0.085, y, z + nz * 0.085, ry, w, h, o);
  wayfind(L, text, x - nx * 0.085, y, z - nz * 0.085, ry, w, h, o);
}

// Airline fascia: backlit logo panel above a check-in island.
const AIRLINE = {
  'SKYLINE AIR': { bg: '#e8e2d4', fg: '#b01e28', font: 'Georgia, serif' },
  'FLY NEWBURG': { bg: '#0b2a5a', fg: '#ffd060', font: 'Arial Black, Impact, sans-serif' },
  'TRANSMERIDIAN': { bg: '#1a4a3a', fg: '#e8e0c8', font: 'Arial, sans-serif' },
  'PELICAN AIRWAYS': { bg: '#e87a1a', fg: '#ffffff', font: 'Arial Black, sans-serif' },
  'NORTHSTAR': { bg: '#141a2a', fg: '#9ac8ff', font: 'Arial, sans-serif' },
};
export function airlineFascia(L, name, x, y, z, ry, w, h, o = {}) {
  const st = AIRLINE[name] || AIRLINE['SKYLINE AIR'];
  return sign(L, name, x, y, z, ry, w, h, { bg: st.bg, fg: st.fg, font: st.font, glow: o.glow ?? 0.9, clean: true, light: false, border: o.border });
}

// ---------------------------------------------------------- ad banners --
export const ADS4 = {
  transmeridian(g, W, H) {
    const gr = g.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, '#0e2a22'); gr.addColorStop(1, '#2a6a52');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(232,224,200,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(W * 0.72, H * 0.5, 40 + i * 22, 14 + i * 9, -0.3, 0, 7); g.stroke(); }
    g.fillStyle = '#e8e0c8'; g.font = 'bold 50px Arial, sans-serif'; g.textAlign = 'left'; g.fillText('TRANSMERIDIAN', 24, 96);
    g.font = 'italic 28px Georgia, serif'; g.fillText('The world, closer.', 26, 146);
    g.fillStyle = '#d8b060'; g.font = 'bold 20px Arial, sans-serif'; g.fillText('NONSTOP TO 31 CITIES · TERMINAL C', 26, 226);
  },
  pelican(g, W, H) {
    g.fillStyle = '#f0e6d0'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e87a1a'; g.beginPath(); g.arc(W - 90, 90, 70, 0, 7); g.fill();
    g.fillStyle = '#1a3a5a'; g.font = 'bold 54px Arial Black, sans-serif'; g.textAlign = 'left'; g.fillText('PELICAN', 22, 90); g.fillText('AIRWAYS', 22, 150);
    g.font = 'bold 22px Arial, sans-serif'; g.fillStyle = '#3a3a44'; g.fillText('Sunshine is a short hop away.', 24, 200);
    g.fillStyle = '#e87a1a'; g.fillRect(0, H - 26, W, 26);
  },
  newburgTourism(g, W, H) {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#1a1030'); gr.addColorStop(0.6, '#8a3a4a'); gr.addColorStop(1, '#e8a060');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0a0810';
    for (let i = 0; i < 22; i++) { const bw = 12 + (i * 37) % 26, bh = 40 + (i * 53) % 110; g.fillRect(i * 24, H - bh, bw, bh); }
    g.fillStyle = '#ffffff'; g.font = 'bold 44px Georgia, serif'; g.textAlign = 'center'; g.fillText('WELCOME TO NEWBURG', W / 2, 70);
    g.font = 'italic 24px Georgia, serif'; g.fillText('The city that never sleeps in.', W / 2, 108);
  },
  ceda(g, W, H) {
    g.fillStyle = '#e8e4d8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#b01e18'; g.fillRect(0, 0, W, 60);
    g.fillStyle = '#ffffff'; g.font = 'bold 40px Arial Black, sans-serif'; g.textAlign = 'center'; g.fillText('EVACUATION FLIGHTS', W / 2, 44);
    g.fillStyle = '#1a1a1a'; g.font = 'bold 26px Arial, sans-serif';
    g.fillText('ALL PASSENGERS MUST BE SCREENED', W / 2, 110);
    g.fillText('REPORT TO TRIAGE BEFORE CHECK-IN', W / 2, 146);
    g.font = '20px Arial, sans-serif'; g.fillText('Fever · rash · aggression = DENIED BOARDING', W / 2, 190);
    g.fillStyle = '#b01e18'; g.font = 'bold 22px Arial, sans-serif'; g.fillText('BY ORDER OF THE CIVIL EMERGENCY AUTHORITY', W / 2, 232);
  },
};
// Vertical fabric banner hanging from the roof (canvas advert, 1 draw call).
export function banner(L, draw, x, y, z, ry, w, h, o = {}) {
  const tex = adTexture(draw, 512, 256);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: o.glow ?? 0.12 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  if (o.sway) m.rotation.z = o.sway;
  L.addObject(m);
  return m;
}

// ------------------------------------------------------------- escalator --
// Stopped escalator rising towards -x from (x1, y0) to (x0, y1), centred on zc.
// Walkable steps + glass balustrades with rubber handrails; clips keep bodies
// off the balustrade tops. comb: flat landing length at each end.
export function escalator(L, x0, x1, zc, y0, y1, w = 1.4, o = {}) {
  const land = o.land ?? 1.2;
  const sx0 = x0 + land, sx1 = x1 - land;
  const hw = w / 2;
  // landings (comb plates)
  L.box(x1 - land, y0 - 0.1, zc - hw, x1, y0 + 0.02, zc + hw, 'metalClean', { tint: 0x8a8e90 });
  L.box(x0, y1 - 0.1, zc - hw, x0 + land, y1 + 0.02, zc + hw, 'metalClean', { tint: 0x8a8e90 });
  L.stairs(sx0, zc - hw, sx1, zc + hw, y0 + 0.02, y1 + 0.02, '-x', 'metalDark', { thin: true, stepH: 0.2, tint: 0x3a3c40 });
  // step nosings (yellow demarcation)
  const n = Math.round((y1 - y0) / 0.2), run = (sx1 - sx0) / n;
  for (let i = 0; i < n; i++) { const x = sx1 - run * (i + 1); L.box(x, y0 + 0.02 + (i + 1) * (y1 - y0) / n - 0.004, zc - hw + 0.02, x + 0.05, y0 + 0.02 + (i + 1) * (y1 - y0) / n + 0.003, zc + hw - 0.02, 'paintedYellow', { collide: false, tint: 0xc8a020 }); }
  // truss underside (sloped box made of steps would be heavy: a single tilted part)
  const len = Math.hypot(sx1 - sx0, y1 - y0), ang = Math.atan2(y1 - y0, sx1 - sx0);
  L.part('box', (sx0 + sx1) / 2, (y0 + y1) / 2 - 0.55, zc, len + 0.5, 0.7, w + 0.5, 'metalClean', { rz: -ang, tint: 0x9aa0a4 });
  // balustrades both sides
  for (const s of [-1, 1]) {
    const bz = zc + s * (hw + 0.12);
    const pa = [x1, y0], pb = [sx1, y0], pc = [sx0, y1], pd = [x0, y1];
    const segs = [[pa, pb], [pb, pc], [pc, pd]];
    for (const [[ax, ay], [bx, by]] of segs) {
      const l = Math.hypot(bx - ax, by - ay), an = Math.atan2(by - ay, bx - ax);
      const cx = (ax + bx) / 2, cy = (ay + by) / 2;
      L.part('box', cx, cy + 0.12, bz, l, 0.24, 0.22, 'metalClean', { rz: an, tint: 0xa8acae }); // skirt deck
      L.part('box', cx, cy + 0.62, bz, l, 0.78, 0.02, curtainMat(), { rz: an }); // glass
      L.part('box', cx, cy + 1.04, bz, l + 0.02, 0.07, 0.1, 'rubber', { rz: an, tint: 0x141414 }); // handrail
    }
    // newel ends
    for (const [nx, ny] of [[x1, y0], [x0, y1]]) L.part('cyl', nx, ny + 0.62, bz, 0.9, 0.2, 0.9, 'rubber', { rx: Math.PI / 2, tint: 0x141414, seg: 14 });
    // collision: sloped balustrade approximated by stepped clips (no nav on top)
    const k = 8;
    for (let i = 0; i < k; i++) {
      const xa = x0 + (x1 - x0) * i / k, xb = x0 + (x1 - x0) * (i + 1) / k;
      const t = Math.min(1, Math.max(0, ((xa + xb) / 2 - sx0) / (sx1 - sx0)));
      const yb = (xa + xb) / 2 < sx0 ? y1 : (xa + xb) / 2 > sx1 ? y0 : y1 + (y0 - y1) * t;
      L.clip(xa, Math.min(yb, y1) - 1.2, bz - 0.11, xb, yb + 2.2, bz + 0.11, F_SOLID | F_NONAV);
    }
  }
  if (o.sign) wayfind(L, o.sign, x1 + 0.3, y0 + 2.6, zc, -Math.PI / 2, 1.6, 0.4);
}

// ------------------------------------------------------- metal detector --
// Walk-through arch (passage along X after rotation ry = PI/2) whose status
// LED columns are a separate material, so they can go green -> flashing red ->
// dark. Returns {setState(k), pos}.
export function detector(L, x, y, z, ry = Math.PI / 2) {
  P.metalDetector(L, x, y, z, ry, false);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.2, 0.5), toneMapped: false });
  const grp = new THREE.Group();
  for (const sx of [-1, 1]) {
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.5, 0.05), mat);
      m.position.set(sx * 0.405, 1.15, side * 0.2);
      grp.add(m);
    }
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.012), mat);
  top.position.set(0, 2.18, -0.325);
  grp.add(top);
  const top2 = top.clone(); top2.position.z = 0.325; grp.add(top2);
  grp.position.set(x, y, z);
  grp.rotation.y = ry;
  L.addObject(grp);
  return {
    mat, grp, pos: new THREE.Vector3(x, y + 1.2, z),
    setColor(r, g, b) { mat.color.setRGB(r, g, b); },
  };
}

// ------------------------------------------------------ baggage props --
// LD3-style aircraft baggage container (contoured side along local +X).
export function uld(L, x, y, z, ry, o = {}) {
  const p = P.prop(L, x, y, z, ry);
  const c = o.color ?? 0xa8acae;
  p.box(0, 0.05, 0, 2.0, 0.1, 1.5, 'metalDark', 0x3a3a3a);
  p.box(-0.2, 0.85, 0, 1.6, 1.5, 1.5, 'metalClean', c);
  p.box(0.75, 1.15, 0, 0.5, 0.9, 1.5, 'metalClean', c);
  p.box(0.75, 0.4, 0, 0.5, 0.6, 1.5, 'metalClean', new THREE.Color(c).multiplyScalar(0.85).getHex(), [0, 0, 0.6]);
  p.box(-0.2, 0.85, -0.755, 1.4, 1.2, 0.01, o.door ?? 'fabricRed', o.doorTint ?? 0x8a2a20);
  for (const sx of [-0.9, 0.6]) p.box(sx, 0.85, -0.76, 0.04, 1.5, 0.02, 'metalDark');
  p.box(-0.2, 1.62, -0.76, 1.6, 0.05, 0.02, 'metalDark');
  sign(L, o.code ?? `AKE ${10000 + Math.floor(rng() * 89999)} SA`, ...rot(x, z, ry, -0.2, -0.77), y + 1.35, ry, 0.9, 0.14, { bg: '#e8e8e0', fg: '#1a1a1a', clean: true });
  p.col(0, 0.8, 0, 2.0, 1.6, 1.5, 'metal');
  return p;
}
// Belt loader (sloped conveyor on a small truck), nose facing local -Z.
export function beltLoader(L, x, y, z, ry, color = 0xd8a020) {
  const p = P.prop(L, x, y, z, ry);
  p.rbox(0, 0.55, 1.5, 1.6, 0.6, 3.2, 0.06, 'carPaint', color);
  p.rbox(0.45, 1.25, 2.4, 0.7, 0.8, 0.9, 0.05, 'carPaint', color);
  p.box(0, 2.0, -0.6, 0.8, 0.08, 7.0, 'rubber', 0x1a1a1a, [-0.38, 0, 0]);
  for (const s of [-1, 1]) p.box(s * 0.45, 2.1, -0.6, 0.05, 0.2, 7.0, 'metalClean', 0x9a9e9e, [-0.38, 0, 0]);
  for (const sz of [0.4, 2.6]) for (const sx of [-0.75, 0.75]) p.cylX(sx, 0.35, sz, 0.35, 0.25, 'rubber', 0x151515, 12);
  p.col(0, 0.7, 1.5, 1.6, 1.4, 3.2, 'metal');
  return p;
}
// Queue stanchions (chrome posts + belt) along a polyline. Visual only.
export function stanchions(L, pts, y = 0, color = 0x1a2a6a) {
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const p = P.prop(L, x, y, z, 0);
    p.cyl(0, 0.48, 0, 0.028, 0.96, 'chrome', null, null, 8).cyl(0, 0.015, 0, 0.16, 0.03, 'chrome', null, null, 12);
    if (i > 0) {
      const [px, pz] = pts[i - 1];
      const len = Math.hypot(x - px, z - pz);
      const q = P.prop(L, (x + px) / 2, y, (z + pz) / 2, Math.atan2(-(z - pz), x - px));
      q.box(0, 0.88, 0, len - 0.06, 0.05, 0.008, 'fabric', color);
    }
  }
}
// Round terminal column with a stainless base collar.
export function column(L, x, z, y0, y1, r = 0.45, o = {}) {
  const p = P.prop(L, x, y0, z, 0);
  p.cyl(0, (y1 - y0) / 2, 0, r, y1 - y0, o.mat ?? 'plaster', o.tint ?? 0xd8d4cc, null, 20);
  p.cyl(0, 0.5, 0, r + 0.02, 1.0, 'metalClean', 0xb0b4b6, null, 20);
  p.col(0, (y1 - y0) / 2, 0, r * 1.8, y1 - y0, r * 1.8, 'concrete');
  return p;
}
// Ceiling light panel (emissive) + optional light.
export function panelLight(L, x, y, z, o = {}) {
  const w = o.w ?? 1.2, d = o.d ?? 0.6, on = o.on !== false;
  L.box(x - w / 2, y - 0.04, z - d / 2, x + w / 2, y, z + d / 2, on ? 'emissiveCool' : 'blackMatte', NC);
  if (on && o.light !== false) return L.light(x, y - 0.4, z, o.color ?? 0xd8ecff, o.intensity ?? 10, o.range ?? 9, { flicker: o.flicker ?? 0, buzz: 1 });
  return null;
}
// Dead body with a blood pool.
export function body(L, x, y, z, ry, color, pool = true) {
  P.corpse(L, x, y + 0.01, z, ry, color);
  if (pool) L.decal(x, y + 0.012, z, 0, 1, 0, 1.4 + rng() * 0.6, DF.POOL);
}
// Scatter a few suitcases (upright / flat) in a box.
export function strewLuggage(L, x0, z0, x1, z1, y, n) {
  for (let i = 0; i < n; i++) P.suitcase(L, x0 + rng() * (x1 - x0), y, z0 + rng() * (z1 - z0), rng() * 6.28, undefined, rng() < 0.4);
}

// ------------------------------------------------------- fighter model --
// Small delta-wing fighter (~15 m), nose along -Z, for the low flyover.
export function fighterModel() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.6, metalness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.5, metalness: 0.5 });
  const burn = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.4, 0.5), toneMapped: false });
  const g = new THREE.Group();
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const k = new THREE.Mesh(geo, m); k.position.set(x, y, z); k.rotation.set(rx, ry, rz); k.frustumCulled = false; g.add(k); return k; };
  add(new THREE.CylinderGeometry(0.75, 0.9, 11, 12), mat, 0, 0, 0.5, Math.PI / 2);
  add(new THREE.ConeGeometry(0.75, 4, 12), mat, 0, 0, -7, -Math.PI / 2);
  add(new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), dark, 0, 0.55, -3.2, 0, 0, 0).scale.set(1, 0.8, 2.4);
  const wing = new THREE.Shape();
  wing.moveTo(0, -2.5); wing.lineTo(5.2, 3.2); wing.lineTo(5.2, 4.2); wing.lineTo(0, 4.4); wing.lineTo(-5.2, 4.2); wing.lineTo(-5.2, 3.2); wing.lineTo(0, -2.5);
  const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.18, bevelEnabled: false });
  add(wg, mat, 0, -0.1, 0.4, Math.PI / 2, 0, 0);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.12, 2.4, 2.0), mat, s * 1.1, 1.3, 4.4, 0, 0, s * 0.35);
  add(new THREE.CylinderGeometry(0.62, 0.62, 0.3, 12), burn, 0, 0, 6.1, Math.PI / 2);
  g.userData.noCull = true;
  return g;
}

// -------------------------------------------------------- misc helpers --
// Solid wall along X/Z with openings given as [a, b, (y1)] pairs (doorways
// default to 2.2 m high, relative to y0).
export function wallX(L, x0, x1, z, y0, y1, mat, ops = [], t = 0.2, o = {}) {
  L.wallX(x0, x1, z, y0, y1, mat, t, ops.map(([a, b, h, s]) => ({ a, b, y0: y0 + (s ?? 0), y1: y0 + (h ?? 2.2) })), { tint: o.tint, ao: o.ao });
}
export function wallZ(L, z0, z1, x, y0, y1, mat, ops = [], t = 0.2, o = {}) {
  L.wallZ(z0, z1, x, y0, y1, mat, t, ops.map(([a, b, h, s]) => ({ a, b, y0: y0 + (s ?? 0), y1: y0 + (h ?? 2.2) })), { tint: o.tint, ao: o.ao });
}
// Blood trail decals between two points.
export function trail(L, x0, z0, x1, z1, y, n = 7) {
  for (let i = 0; i < n; i++) { const k = i / Math.max(1, n - 1); L.decal(x0 + (x1 - x0) * k + (rng() - 0.5) * 0.3, y + 0.013, z0 + (z1 - z0) * k + (rng() - 0.5) * 0.3, 0, 1, 0, 0.7 + rng() * 0.5, DF.SMEAR); }
}
export { F_SOLID, F_SHOOT, F_SIGHT, F_NONAV };
