// Level-building kit: rooms with door/window openings, stairwells, streets,
// building facades, safe rooms, light fixtures, fire sources, text signs /
// graffiti, supply spots and interactive objects. Chapter scripts compose
// these to author No Mercy's five maps.
import * as THREE from 'three';
import { Door, WindowPane, PhysProp, AlarmCar } from '../world/dynamic.js';
import { F_DEFAULT, F_SOLID, F_SHOOT, F_SIGHT, F_NONAV } from '../world/collision.js';
import { materials } from '../render/materials.js';
import { cloneModel } from '../combat/weaponModels.js';
import * as P from './props.js';
import { makeRng } from '../core/math.js';

export { P };
const rng = makeRng(777);

// ---------------------------------------------------------------- rooms --
// walls: {n,s,e,w}: false (no wall) | {mat, open:[{at, w, h, y0, door, window, hinge}], thick}
// north = z0 (-Z), south = z1 (+Z), west = x0 (-X), east = x1 (+X). 'at' is the
// centre of the opening along the wall (absolute world coordinate).
export function room(L, o) {
  const { x0, z0, x1, z1 } = o;
  const y = o.y ?? 0, h = o.h ?? 3;
  const wallMat = o.wall ?? 'plaster';
  const t = o.thick ?? 0.2;
  if (o.floor !== false) L.floor(x0, z0, x1, z1, y, o.floor ?? 'woodFloor', o.floorThick ?? 0.3);
  if (o.ceil !== false) L.ceiling(x0, z0, x1, z1, y + h, o.ceil ?? 'ceiling', o.ceilThick ?? 0.3);
  const walls = o.walls || {};
  const doors = [];
  const doWall = (key, axis, fixed, a0, a1) => {
    const w = walls[key];
    if (w === false) return;
    const spec = w || {};
    const mat = spec.mat ?? wallMat;
    const ops = (spec.open || []).map((op) => {
      const hw = (op.w ?? 1.1) / 2;
      const oy0 = y + (op.y0 ?? 0);
      const oy1 = y + (op.y0 ?? 0) + (op.h ?? (op.window ? 1.3 : 2.2));
      return { a: op.at - hw, b: op.at + hw, y0: op.window ? y + (op.sill ?? 0.9) : oy0, y1: op.window ? y + (op.sill ?? 0.9) + (op.h ?? 1.3) : oy1, op };
    });
    if (axis === 'x') L.wallX(a0 - t / 2, a1 + t / 2, fixed, y, y + h, mat, t, ops.map((q) => ({ a: q.a, b: q.b, y0: q.y0, y1: q.y1 })), { ao: 0.62 });
    else L.wallZ(a0 - t / 2, a1 + t / 2, fixed, y, y + h, mat, t, ops.map((q) => ({ a: q.a, b: q.b, y0: q.y0, y1: q.y1 })), { ao: 0.62 });
    // baseboards
    if (o.trim !== false) {
      const bm = o.trimMat ?? 'woodDark';
      let prev = a0;
      const segs = ops.filter((q) => q.y0 <= y + 0.01).sort((p, q) => p.a - q.a);
      const pieces = [];
      for (const q of segs) { if (q.a > prev) pieces.push([prev, q.a]); prev = q.b; }
      if (prev < a1) pieces.push([prev, a1]);
      for (const [s, e] of pieces) {
        for (const side of [-1, 1]) {
          const off = fixed + side * (t / 2 + 0.01);
          if (axis === 'x') L.box(s, y, off - 0.01, e, y + 0.1, off + 0.01, bm, { collide: false });
          else L.box(off - 0.01, y, s, off + 0.01, y + 0.1, e, bm, { collide: false });
        }
      }
    }
    for (const q of ops) {
      const op = q.op;
      const c = (q.a + q.b) / 2;
      if (op.door) {
        const d = axis === 'x' ? new Door(L, c, y, fixed, 'x', { width: op.w ?? 1.0, hinge: op.hinge ?? 1, safe: op.safe, open: op.opened, locked: op.locked, material: op.doorMat }) : new Door(L, fixed, y, c, 'z', { width: op.w ?? 1.0, hinge: op.hinge ?? 1, safe: op.safe, open: op.opened, locked: op.locked, material: op.doorMat });
        doors.push(d);
        if (op.onDoor) op.onDoor(d);
      }
      if (op.window) {
        // frame + glass pane (breakable)
        const fm = 'woodDark';
        if (axis === 'x') {
          L.box(q.a, q.y0 - 0.05, fixed - t / 2 - 0.03, q.b, q.y0, fixed + t / 2 + 0.03, fm, { collide: false });
          if (op.glass !== false) new WindowPane(L, q.a, q.y0, fixed - 0.02, q.b, q.y1, fixed + 0.02, { dirty: true });
        } else {
          L.box(fixed - t / 2 - 0.03, q.y0 - 0.05, q.a, fixed + t / 2 + 0.03, q.y0, q.b, fm, { collide: false });
          if (op.glass !== false) new WindowPane(L, fixed - 0.02, q.y0, q.a, fixed + 0.02, q.y1, q.b, { dirty: true });
        }
      }
    }
  };
  doWall('n', 'x', z0, x0, x1);
  doWall('s', 'x', z1, x0, x1);
  doWall('w', 'z', x0, z0, z1);
  doWall('e', 'z', x1, z0, z1);
  if (o.light !== false) {
    const lc = o.light || {};
    ceilingLight(L, (x0 + x1) / 2 + (lc.dx || 0), y + h, (z0 + z1) / 2 + (lc.dz || 0), lc);
  }
  if (o.reverb) L.reverb(x0, y, z0, x1, y + h, z1, o.reverb);
  return { doors };
}

// Ceiling light fixture with a matching dynamic light.
export function ceilingLight(L, x, y, z, o = {}) {
  const type = o.type || 'bulb';
  const on = o.on !== false;
  const col = o.color ?? (type === 'fluoro' ? 0xd8ecff : 0xffd9a0);
  if (type === 'fluoro') {
    L.box(x - 0.65, y - 0.08, z - 0.16, x + 0.65, y, z + 0.16, 'metalClean', { collide: false });
    L.box(x - 0.6, y - 0.1, z - 0.1, x + 0.6, y - 0.08, z + 0.1, on ? 'emissiveCool' : 'blackMatte', { collide: false });
  } else if (type === 'cage') {
    L.box(x - 0.12, y - 0.25, z - 0.12, x + 0.12, y, z + 0.12, 'metalDark', { collide: false });
    L.box(x - 0.07, y - 0.22, z - 0.07, x + 0.07, y - 0.08, z + 0.07, on ? 'emissiveWarm' : 'blackMatte', { collide: false });
  } else if (type === 'none') {
    // light only
  } else {
    L.box(x - 0.02, y - 0.35, z - 0.02, x + 0.02, y, z + 0.02, 'metalDark', { collide: false });
    L.box(x - 0.2, y - 0.45, z - 0.2, x + 0.2, y - 0.35, z + 0.2, 'fabric', { collide: false, tint: 0xd8c8a0 });
    L.box(x - 0.08, y - 0.5, z - 0.08, x + 0.08, y - 0.44, z + 0.08, on ? 'emissiveWarm' : 'blackMatte', { collide: false });
  }
  if (!on) return null;
  return L.light(x, y - 0.45, z, col, o.intensity ?? (type === 'fluoro' ? 14 : 10), o.range ?? 9, { flicker: o.flicker ?? 0, buzz: type === 'fluoro' ? 1 : 0 });
}
export function wallLamp(L, x, y, z, nx, nz, color = 0xff2010, intensity = 5, range = 6) {
  L.box(x - 0.12 + nx * 0.05, y - 0.08, z - 0.12 + nz * 0.05, x + 0.12 + nx * 0.05, y + 0.08, z + 0.12 + nz * 0.05, color === 0xff2010 ? 'emissiveRed' : 'emissiveWarm', { collide: false });
  return L.light(x + nx * 0.4, y, z + nz * 0.4, color, intensity, range, {});
}

// Straight stairwell flight helper with landing + railing.
export function stairFlight(L, x0, z0, x1, z1, y0, y1, dir, mat = 'concrete', rail = true) {
  L.stairs(x0, z0, x1, z1, y0, y1, dir, mat);
  if (rail) {
    const h = 0.95;
    if (dir === '+z' || dir === '-z') {
      const x = x1 + 0.03;
      const za = dir === '+z' ? z0 : z1, zb = dir === '+z' ? z1 : z0;
      railSegment(L, x, y0 + h, za, x, y1 + h, zb);
    } else {
      const z = z1 + 0.03;
      const xa = dir === '+x' ? x0 : x1, xb = dir === '+x' ? x1 : x0;
      railSegment(L, xa, y0 + h, z, xb, y1 + h, z);
    }
  }
}
export function railSegment(L, xa, ya, za, xb, yb, zb) {
  P.pipe(L, xa, ya, za, xb, yb, zb, 0.025, 'metalDark');
  const n = Math.max(2, Math.round(Math.hypot(xb - xa, zb - za) / 1.2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = xa + (xb - xa) * t, y = ya + (yb - ya) * t, z = za + (zb - za) * t;
    L.box(x - 0.02, y - 0.95, z - 0.02, x + 0.02, y, z + 0.02, 'metalDark', { collide: false });
  }
}

// Switchback stairwell: square shaft at (x,z) with size w x d, from y0 up `floors` floors of height fh.
// Landings on alternating sides. Entry at floor level on the 'entry' side.
export function stairwell(L, x, z, w, d, y0, floors, fh, o = {}) {
  const mat = o.mat ?? 'concrete';
  const half = w / 2;
  for (let f = 0; f < floors; f++) {
    const yb = y0 + f * fh, ym = yb + fh / 2, yt = yb + fh;
    // flight 1: up along +z on the left half, flight 2: up along -z on the right half
    L.stairs(x, z + 1.2, x + half, z + d - 1.2, yb, ym, '+z', mat);
    L.floor(x, z + d - 1.2, x + w, z + d, ym, mat, 0.25);
    L.stairs(x + half, z + 1.2, x + w, z + d - 1.2, ym, yt, '-z', mat);
    if (f < floors - 1 || o.topLanding) L.floor(x, z, x + w, z + 1.2, yt, mat, 0.25);
    // railing between flights
    L.box(x + half - 0.03, yb, z + 1.2, x + half + 0.03, yt + 1.0, z + d - 1.4, 'metalDark', { collide: true, flags: F_SOLID });
    if (o.light !== false) ceilingLight(L, x + half, yt - 0.02, z + d - 0.6, { type: 'cage', intensity: 7, range: 7, flicker: f % 2 ? 0.4 : 0 });
  }
  if (o.walls !== false) {
    const hTot = floors * fh + 0.5;
    const wm = o.wallMat ?? 'concreteDark';
    L.box(x - 0.2, y0 - 0.3, z, x, y0 + hTot, z + d, wm);
    L.box(x + w, y0 - 0.3, z, x + w + 0.2, y0 + hTot, z + d, wm);
    L.box(x - 0.2, y0 - 0.3, z + d, x + w + 0.2, y0 + hTot, z + d + 0.2, wm);
  }
  L.reverb(x, y0, z, x + w, y0 + floors * fh, z + d, 'stairwell');
}

// Floor box with rectangular holes (decomposed into non-overlapping boxes).
export function floorWithHoles(L, x0, z0, x1, z1, y, thick, mat, holes = [], opts = {}) {
  const xs = [x0, x1], zs = [z0, z1];
  for (const h of holes) { xs.push(Math.max(x0, Math.min(x1, h[0])), Math.max(x0, Math.min(x1, h[2]))); zs.push(Math.max(z0, Math.min(z1, h[1])), Math.max(z0, Math.min(z1, h[3]))); }
  const ux = [...new Set(xs)].sort((a, b) => a - b), uz = [...new Set(zs)].sort((a, b) => a - b);
  for (let i = 0; i < ux.length - 1; i++) for (let k = 0; k < uz.length - 1; k++) {
    const cx = (ux[i] + ux[i + 1]) / 2, cz = (uz[k] + uz[k + 1]) / 2;
    if (holes.some((h) => cx > h[0] && cx < h[2] && cz > h[1] && cz < h[3])) continue;
    if (ux[i + 1] - ux[i] < 1e-3 || uz[k + 1] - uz[k] < 1e-3) continue;
    L.box(ux[i], y - thick, uz[k], ux[i + 1], y, uz[k + 1], mat, opts);
  }
}
const inHoles = (holes, x, z) => holes.some((h) => x > h[0] - 0.2 && x < h[2] + 0.2 && z > h[1] - 0.2 && z < h[3] + 0.2);

// Street segment along X or Z with sidewalks, curbs and lane markings.
// o: {sidewalk, holes:[[x0,z0,x1,z1]], noSidewalk:[[a0,a1]] ranges along the axis where sidewalks are omitted (intersections)}
export function street(L, x0, z0, x1, z1, axis = 'z', o = {}) {
  const y = o.y ?? 0;
  const sw = o.sidewalk ?? 3;
  const holes = o.holes || [];
  floorWithHoles(L, x0, z0, x1, z1, y, 0.5, 'asphalt', holes);
  const gaps = o.noSidewalk || [];
  const spans = (a0, a1) => {
    const out = [];
    let cur = a0;
    for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (g0 > cur) out.push([cur, Math.min(g0, a1)]); cur = Math.max(cur, g1); }
    if (cur < a1) out.push([cur, a1]);
    return out;
  };
  if (axis === 'z') {
    for (const [a, b] of spans(z0, z1)) {
      L.box(x0, y, a, x0 + sw, y + 0.15, b, 'sidewalk');
      L.box(x1 - sw, y, a, x1, y + 0.15, b, 'sidewalk');
      L.box(x0 + sw - 0.12, y, a, x0 + sw, y + 0.16, b, 'concrete', { collide: false });
      L.box(x1 - sw, y, a, x1 - sw + 0.12, y + 0.16, b, 'concrete', { collide: false });
    }
    const cx = (x0 + x1) / 2;
    for (let z = z0 + 1; z < z1 - 2; z += 4.5) if (!inHoles(holes, cx, z) && !inHoles(holes, cx, z + 2.5) && !gaps.some(([g0, g1]) => z + 2.5 > g0 && z < g1)) L.box(cx - 0.07, y + 0.003, z, cx + 0.07, y + 0.012, z + 2.5, 'paintedYellow', { collide: false, tint: 0xd0b030 });
  } else {
    for (const [a, b] of spans(x0, x1)) {
      L.box(a, y, z0, b, y + 0.15, z0 + sw, 'sidewalk');
      L.box(a, y, z1 - sw, b, y + 0.15, z1, 'sidewalk');
      L.box(a, y, z0 + sw - 0.12, b, y + 0.16, z0 + sw, 'concrete', { collide: false });
      L.box(a, y, z1 - sw, b, y + 0.16, z1 - sw + 0.12, 'concrete', { collide: false });
    }
    const cz = (z0 + z1) / 2;
    for (let x = x0 + 1; x < x1 - 2; x += 4.5) if (!inHoles(holes, x, cz) && !gaps.some(([g0, g1]) => x + 2.5 > g0 && x < g1)) L.box(x, y + 0.003, cz - 0.07, x + 2.5, y + 0.012, cz + 0.07, 'paintedYellow', { collide: false, tint: 0xd0b030 });
  }
}

// Building facade/backdrop block with window grid (some lit).
export function facade(L, x0, z0, x1, z1, y0, y1, o = {}) {
  const mat = o.mat ?? 'brick';
  L.box(x0, y0, z0, x1, y1, z1, mat, { ao: 0.8 });
  const faces = o.faces ?? ['n', 's', 'e', 'w'];
  const fh = o.floorH ?? 3.2;
  const litChance = o.lit ?? 0.08;
  const skip = o.skipBelow ?? y0 + 3.5;
  const win = (fx, fy, fz, axis, sign) => {
    const lit = rng() < litChance;
    const broken = !lit && rng() < 0.15;
    const m = lit ? 'emissiveWindow' : broken ? 'blackMatte' : 'glassDirty';
    const tint = lit ? (rng() < 0.7 ? 0xffc080 : 0x9ab0ff) : broken ? 0x050505 : 0x1a2226;
    if (axis === 'x') L.box(fx - 0.55, fy, fz + sign * 0.01, fx + 0.55, fy + 1.4, fz + sign * 0.04, m, { collide: false, tint });
    else L.box(fx + sign * 0.01, fy, fz - 0.55, fx + sign * 0.04, fy + 1.4, fz + 0.55, m, { collide: false, tint });
  };
  for (let y = y0 + fh * 0.35; y < y1 - 1.8; y += fh) {
    if (y < skip) continue;
    if (faces.includes('n')) for (let x = x0 + 1.5; x < x1 - 1; x += 2.6) win(x, y, z0, 'x', -1);
    if (faces.includes('s')) for (let x = x0 + 1.5; x < x1 - 1; x += 2.6) win(x, y, z1, 'x', 1);
    if (faces.includes('w')) for (let z = z0 + 1.5; z < z1 - 1; z += 2.6) win(x0, y, z, 'z', -1);
    if (faces.includes('e')) for (let z = z0 + 1.5; z < z1 - 1; z += 2.6) win(x1, y, z, 'z', 1);
  }
  // roof parapet
  if (o.parapet !== false) {
    L.box(x0, y1, z0, x1, y1 + 0.8, z0 + 0.3, 'concreteDark', { collide: false });
    L.box(x0, y1, z1 - 0.3, x1, y1 + 0.8, z1, 'concreteDark', { collide: false });
  }
}

// -------------------------------------------------------------- signage --
const texCache = new Map();
export function textTexture(text, o = {}) {
  const key = text + JSON.stringify(o);
  if (texCache.has(key)) return texCache.get(key);
  const W = o.w ?? 512, H = o.h ?? 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, W, H); }
  if (o.border) { g.strokeStyle = o.border; g.lineWidth = 8; g.strokeRect(6, 6, W - 12, H - 12); }
  g.fillStyle = o.fg ?? '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = String(text).split('\n');
  let size = o.size ?? Math.floor(H * 0.6 / lines.length);
  g.font = `${o.weight ?? 'bold'} ${size}px ${o.font ?? 'Arial Black, Impact, sans-serif'}`;
  // shrink to fit
  for (const l of lines) while (g.measureText(l).width > W * 0.92 && size > 8) { size -= 2; g.font = `${o.weight ?? 'bold'} ${size}px ${o.font ?? 'Arial Black, Impact, sans-serif'}`; }
  const lh = size * 1.1;
  lines.forEach((l, i) => {
    const y = H / 2 + (i - (lines.length - 1) / 2) * lh;
    if (o.spray) {
      // graffiti: jittered drips
      g.save();
      g.globalAlpha = 0.9;
      g.translate(W / 2, y);
      g.rotate((rng() - 0.5) * 0.08);
      g.fillText(l, 0, 0);
      g.restore();
      for (let k = 0; k < l.length * 1.5; k++) {
        const dx = W / 2 + (rng() - 0.5) * g.measureText(l).width;
        g.fillRect(dx, y + size * 0.3, 2, rng() * size * 0.8);
      }
    } else g.fillText(l, W / 2, y);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
// Place a textured quad. (x,y,z) centre; ry rotation (0 faces -Z... i.e. readable from -Z side).
// Front quad + a back quad turned around (un-mirrored UVs) in one geometry,
// so a double-sided sign costs a single draw call.
function doubleSidedQuad(w, h) {
  const hw = w / 2, hh = h / 2;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    -hw, -hh, 0, hw, -hh, 0, hw, hh, 0, -hw, hh, 0, // front (+Z)
    hw, -hh, 0, -hw, -hh, 0, -hw, hh, 0, hw, hh, 0, // back (-Z), reads left-to-right from behind
  ], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return geo;
}
export function sign(L, text, x, y, z, ry, w, h, o = {}) {
  const tex = textTexture(text, o);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: !o.bg || !!o.spray, roughness: 0.85, emissive: o.glow ? 0xffffff : 0x000000, emissiveMap: o.glow ? tex : null, emissiveIntensity: o.glow ?? 0, depthWrite: !o.spray && !!o.bg, polygonOffset: true, polygonOffsetFactor: -2 });
  // Readable from both sides: a second quad turned around shows the texture
  // un-mirrored, so a sign reads correctly whichever way ry points (the side
  // against a wall is simply hidden by it).
  const m = new THREE.Mesh(doubleSidedQuad(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.receiveShadow = true;
  L.addObject(m);
  if (o.glow && o.light !== false) {
    // light on the open side of the sign (decided once the collision world exists)
    const nx = Math.sin(ry), nz = Math.cos(ry);
    const lt = L.light(x + nx * 0.5, y, z + nz * 0.5, o.lightColor ?? 0xff4030, o.lightIntensity ?? 4, 6);
    (L.postBuild || (L.postBuild = [])).push(() => {
      const f = L.col.raycast(x, y, z, nx, 0, nz, 3, F_SOLID), b = L.col.raycast(x, y, z, -nx, 0, -nz, 3, F_SOLID);
      if ((b ? b.t : 3) > (f ? f.t : 3)) { lt.x = x - nx * 0.5; lt.z = z - nz * 0.5; }
    });
  }
  return m;
}
export function graffiti(L, text, x, y, z, ry, w = 2, h = 0.8, color = '#b8201a') {
  return sign(L, text, x, y, z, ry, w, h, { fg: color, spray: true, font: 'Impact, Arial Black, sans-serif', w: 512, h: 200 });
}

// --------------------------------------------------------------- safe room --
// Builds a safe room box with a red metal door on one wall. Returns {door, box}.
// o: {x0,z0,x1,z1,y,h, doorWall:'n'|'s'|'e'|'w', doorAt, end:boolean, graffiti:[...], supplies:{...}}
export function safeRoom(L, o) {
  const y = o.y ?? 0, h = o.h ?? 3;
  const walls = { n: {}, s: {}, e: {}, w: {} };
  let door = null;
  const dw = o.doorWall ?? 'n';
  walls[dw] = { open: [{ at: o.doorAt, w: 1.1, door: true, safe: true, hinge: o.hinge ?? 1, opened: !o.end && o.opened !== false ? false : false, onDoor: (d) => (door = d) }] };
  if (o.extraOpen) for (const k in o.extraOpen) walls[k] = { open: [...(walls[k].open || []), ...o.extraOpen[k]] };
  if (o.noWalls) for (const k of o.noWalls) walls[k] = false;
  room(L, { x0: o.x0, z0: o.z0, x1: o.x1, z1: o.z1, y, h, floor: o.floor ?? 'concreteFloor', ceil: o.ceil ?? 'ceiling', wall: o.wall ?? 'plasterGreen', walls, light: { type: 'cage', intensity: 9, range: 9, color: 0xffe2b0 }, reverb: 'safe' });
  const box = [o.x0, y - 0.2, o.z0, o.x1, y + h, o.z1];
  if (o.end) { L.endSafe = box; L.endDoor = door; }
  else L.startSafe = box;
  L.ambience(o.x0, y, o.z0, o.x1, y + h, o.z1, 'safe');
  // "SAFE ROOM" stencil on the outside of the door wall
  // graffiti messages inside
  const msgs = o.graffiti || [];
  const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2;
  msgs.forEach((m, i) => {
    const onWall = ['s', 'e', 'w', 'n'].filter((k) => k !== dw)[i % 3];
    const colr = ['#b8201a', '#1a2a8a', '#202020', '#3a6a2a'][i % 4];
    const off = ((i >> 2) - 0.5) * 1.2 + (rng() - 0.5) * 0.8;
    const gy = y + 1.3 + (rng() - 0.5) * 0.6;
    if (onWall === 's') graffiti(L, m, cx + off, gy, o.z1 - 0.11, Math.PI, 2.2, 0.8, colr);
    else if (onWall === 'n') graffiti(L, m, cx + off, gy, o.z0 + 0.11, 0, 2.2, 0.8, colr);
    else if (onWall === 'e') graffiti(L, m, o.x1 - 0.11, gy, cz + off, -Math.PI / 2, 2.2, 0.8, colr);
    else graffiti(L, m, o.x0 + 0.11, gy, cz + off, Math.PI / 2, 2.2, 0.8, colr);
  });
  return { door, box };
}

// Supply table: place a table and item spawns on top.
export function supplies(L, x, y, z, ry, items, o = {}) {
  P.table(L, x, y, z, ry, o.w ?? 1.6, o.d ?? 0.8, o.mat ?? 'woodDark');
  const top = y + 0.77;
  const n = items.length;
  const c = Math.cos(ry), s = Math.sin(ry);
  items.forEach((it, i) => {
    const lx = (i - (n - 1) / 2) * ((o.w ?? 1.6) - 0.3) / Math.max(1, n - 1 || 1);
    const t = typeof it === 'string' ? { type: it } : it;
    L.item(t.type, x + c * lx, top, z - s * lx, { chance: t.chance ?? 1, yaw: ry + (t.yaw ?? 0), count: t.count });
  });
}

// ---------------------------------------------------------- fire sources --
export function fireSource(L, x, y, z, size = 1, o = {}) {
  const g = L.game;
  const light = L.light(x, y + 0.8 * size, z, 0xff7a30, (o.intensity ?? 14) * size, 10 * size + 4, { flicker: 0.45 });
  const f = {
    t: Math.random() * 10,
    update(dt) {
      // emit only when reasonably close to the camera
      const cp = g.camPos;
      const d2 = (cp.x - x) ** 2 + (cp.z - z) ** 2;
      if (d2 > 3600) return;
      const n = Math.ceil(size * 1.5 * dt * 60 * 0.5);
      for (let i = 0; i < n; i++) g.fx.fire(x + (Math.random() - 0.5) * size, y, z + (Math.random() - 0.5) * size, size * (0.7 + Math.random() * 0.6));
      if (Math.random() < 0.08 * size) g.fx.smokeColumn(x, y + size, z, size * 0.5, [0.08, 0.075, 0.07]);
    },
  };
  L.dynamics.push(f);
  if (o.hazard !== false) L.hazard(x - size * 0.6, y - 0.2, z - size * 0.6, x + size * 0.6, y + size * 1.2, z + size * 0.6, 'fire', 12);
  L.fireSounds = L.fireSounds || [];
  L.fireSounds.push({ x, y, z });
  return { light, f };
}
export function burningBarrel(L, x, y, z) {
  P.barrel(L, x, y, z, 0x3a2a20, true);
  fireSource(L, x, y + 0.9, z, 0.45, { hazard: false, intensity: 10 });
}

// ------------------------------------------------------ dynamic helpers --
export function physProp(L, type, x, y, z, o = {}) {
  const g = L.game;
  let obj, opts = {};
  const m = (geo, mat) => { const k = new THREE.Mesh(geo, mat); return k; };
  const std = (c, r = 0.6, mt = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt });
  switch (type) {
    case 'propane': {
      obj = new THREE.Group();
      const body = m(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 14), std(0xd8d8d0, 0.4, 0.3));
      body.position.y = 0.3; obj.add(body);
      const top = m(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xd8d8d0, 0.4, 0.3)); top.position.y = 0.55; obj.add(top);
      const v = m(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), std(0x8a7a3a, 0.3, 0.8)); v.position.y = 0.75; obj.add(v);
      const ring = m(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 12), std(0xd8d8d0, 0.4, 0.3)); ring.position.y = 0.03; obj.add(ring);
      opts = { radius: 0.2, mass: 2, explosive: 'propane', hp: 15, bottom: 0.2 };
      break;
    }
    case 'oxygen': {
      obj = new THREE.Group();
      const body = m(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 12), std(0x3a7a3a, 0.4, 0.3));
      body.position.y = 0.55; obj.add(body);
      const cap = m(new THREE.SphereGeometry(0.1, 10, 6), std(0xd8d8d0, 0.4)); cap.position.y = 1.1; obj.add(cap);
      opts = { radius: 0.15, mass: 2, explosive: 'oxygen', hp: 10, bottom: 0.15 };
      break;
    }
    case 'gascan': {
      obj = cloneModel('gascan');
      opts = { radius: 0.17, mass: 1, explosive: 'gascan', hp: 5, bottom: 0.17 };
      break;
    }
    case 'bucket': {
      obj = m(new THREE.CylinderGeometry(0.15, 0.12, 0.3, 10), std(0x8a8a86, 0.5, 0.6));
      obj.geometry.translate(0, 0.15, 0);
      opts = { radius: 0.16, mass: 0.6, bottom: 0.16, surf: 'metal' };
      break;
    }
    case 'box': {
      const s = o.size ?? 0.45;
      obj = m(new THREE.BoxGeometry(s, s, s), std(0x8a7050, 0.9));
      obj.geometry.translate(0, s / 2, 0);
      opts = { radius: s * 0.55, mass: 0.8, bottom: s * 0.55, surf: 'wood', upright: false };
      break;
    }
    case 'chair': {
      obj = new THREE.Group();
      const wm = std(0x4a3222, 0.7);
      const seat = m(new THREE.BoxGeometry(0.44, 0.05, 0.44), wm); seat.position.y = 0.45; obj.add(seat);
      const back = m(new THREE.BoxGeometry(0.44, 0.5, 0.04), wm); back.position.set(0, 0.72, 0.2); obj.add(back);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = m(new THREE.BoxGeometry(0.04, 0.45, 0.04), wm); l.position.set(sx * 0.19, 0.22, sz * 0.19); obj.add(l); }
      opts = { radius: 0.3, mass: 1.5, bottom: 0.3, surf: 'wood', upright: false };
      break;
    }
    case 'trashcan': {
      obj = m(new THREE.CylinderGeometry(0.26, 0.24, 0.8, 12), std(0x5a5a56, 0.6, 0.5));
      obj.geometry.translate(0, 0.4, 0);
      opts = { radius: 0.3, mass: 2, bottom: 0.3, surf: 'metal' };
      break;
    }
    case 'cone': {
      obj = m(new THREE.ConeGeometry(0.18, 0.6, 10), std(0xe06010, 0.6));
      obj.geometry.translate(0, 0.3, 0);
      opts = { radius: 0.18, mass: 0.4, bottom: 0.18, surf: 'rubber' };
      break;
    }
    case 'bottle': {
      obj = m(new THREE.CylinderGeometry(0.035, 0.04, 0.26, 8), new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.1, transparent: true, opacity: 0.8 }));
      obj.geometry.translate(0, 0.13, 0);
      opts = { radius: 0.06, mass: 0.2, bottom: 0.06, surf: 'glass', upright: false };
      break;
    }
    default: return null;
  }
  const p = new PhysProp(L, obj, x, y + opts.radius, z, Object.assign(opts, o));
  g.props.add(p);
  return p;
}
export function alarmCar(L, x, y, z, ry = 0, color) {
  P.car(L, x, y, z, ry, { color });
  const c = Math.cos(ry), s = Math.sin(ry);
  const hw = Math.abs(c) * 0.9 + Math.abs(s) * 2.2, hd = Math.abs(s) * 0.9 + Math.abs(c) * 2.2;
  const lights = [
    L.light(x - s * -2.4, y + 0.8, z - c * -2.4, 0xffb060, 10, 7, { on: false, priority: 1 }),
    L.light(x + s * -2.4, y + 0.8, z + c * -2.4, 0xff3020, 6, 5, { on: false, priority: 1 }),
  ];
  const car = new AlarmCar(L, [x - hw, y, z - hd, x + hw, y + 1.6, z + hd], lights);
  L.game.props.cars.push(car);
  // a blinking red LED on the dash tells players this car is alarmed
  L.box(x - 0.03, y + 1.05, z - 0.03, x + 0.03, y + 1.09, z + 0.03, 'emissiveRed', { collide: false });
  return car;
}

// Tank-hittable vehicle / dumpster: dynamic mesh + collider; flies when punched.
export function hittable(L, kind, x, y, z, ry = 0, o = {}) {
  const g = L.game;
  const tmp = new (L.constructor)(g, {});
  // Build the prop into a temporary level then convert its buckets to a mesh group.
  if (kind === 'car') P.car(tmp, 0, 0, 0, 0, o);
  else P.dumpster(tmp, 0, 0, 0, 0);
  const grp = new THREE.Group();
  for (const b of tmp.buckets.values()) {
    const geo = b.toGeometry();
    const mesh = new THREE.Mesh(geo, materials.get(b.mat));
    mesh.castShadow = true; mesh.receiveShadow = true;
    grp.add(mesh);
  }
  grp.position.set(x, y, z);
  grp.rotation.y = ry;
  L.addObject(grp);
  const half = kind === 'car' ? [0.95, 0.8, 2.25] : [0.98, 0.72, 0.58];
  const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
  const hx = half[0] * c + half[2] * s, hz = half[0] * s + half[2] * c;
  const col = L.col.addDynamic([x - hx, y, z - hz], [x + hx, y + half[1] * 2, z + hz], { flags: F_DEFAULT, surf: 'metal' });
  const h = {
    pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), grp, col, hx, hz, hy: half[1] * 2, flying: false, used: false, spin: 0,
    launch(target, tank) {
      this.flying = true; this.used = true;
      const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.vel.set(dx / d * 17, 4.5, dz / d * 17);
      this.spin = (Math.random() - 0.5) * 6;
      this.col.enabled = false;
      g.audio.play('metalImpact', { pos: this.pos, vol: 1.3 });
    },
    update(dt) {
      if (!this.flying) return;
      this.vel.y -= 16 * dt;
      this.pos.addScaledVector(this.vel, dt);
      grp.rotation.y += this.spin * dt;
      grp.rotation.z += this.spin * 0.3 * dt;
      const gy = L.col.groundHeight(this.pos.x, this.pos.y + 1, this.pos.z, 20, 0.5);
      // survivors hit
      for (const sv of g.survivors) {
        if (sv.dead || sv.hitBy === this) continue;
        if (Math.hypot(sv.pos.x - this.pos.x, sv.pos.z - this.pos.z) < 2.2 && Math.abs(sv.pos.y - this.pos.y) < 2) {
          sv.hitBy = this;
          sv.takeDamage(g.difficulty.siDmg * 40 + 20, null, 'hittable');
          sv.knock = { x: this.vel.x * 0.5, y: 5, z: this.vel.z * 0.5 };
          if (sv.isHuman) g.shake(1);
        }
      }
      g.infected.forEachNear(this.pos.x, this.pos.z, 2.4, (e) => { if (!e.special && !e.dead) e.takeHit({ damage: 999, part: 0, zone: 'torso', x: e.pos.x, y: e.pos.y + 1, z: e.pos.z, dir: this.vel.clone().normalize(), kind: 'explosion', knockback: 10 }); });
      if (this.pos.y <= gy && this.vel.y < 0) {
        this.pos.y = gy;
        this.vel.multiplyScalar(0.45);
        this.vel.y = Math.abs(this.vel.y) * 0.2;
        g.audio.play('metalImpact', { pos: this.pos, vol: 1.2 });
        g.fx.sparks(this.pos.x, this.pos.y + 0.2, this.pos.z, 0, 1, 0, 20);
        g.shake(0.3);
        if (Math.hypot(this.vel.x, this.vel.z) < 1.5) {
          this.flying = false;
          this.col.min = [this.pos.x - this.hx, this.pos.y, this.pos.z - this.hz];
          this.col.max = [this.pos.x + this.hx, this.pos.y + this.hy, this.pos.z + this.hz];
          this.col.enabled = true;
          for (const sv of g.survivors) sv.hitBy = null;
        }
      }
      grp.position.copy(this.pos);
    },
  };
  g.hittables.push(h);
  return h;
}

// Player-usable button / lever / radio with a hold duration.
export function usable(L, x, y, z, prompt, onUse, o = {}) {
  const u = { pos: new THREE.Vector3(x, y, z), radius: o.radius ?? 2, prompt, hold: o.hold ?? 0, holdLabel: o.holdLabel, enabled: o.enabled !== false, onUse: (s) => { if (!u.enabled) return; if (o.once !== false) u.enabled = false; L.game.audio.play(o.sound ?? 'buttonPress', { pos: u.pos, vol: 1 }); onUse(s); } };
  L.game.usables.push(u);
  return u;
}

// Button panel visual
export function buttonPanel(L, x, y, z, ry, color = 0xd02010) {
  const p = P.prop(L, x, y, z, ry);
  p.box(0, 0, 0, 0.3, 0.4, 0.08, 'metal', 0x8a8e88);
  p.box(0, 0.05, -0.05, 0.12, 0.12, 0.04, 'emissiveRed', color);
  return p;
}
