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
import { signCanvas, graffitiCanvas, posterCanvas, posterWallCanvas, wallMessagesCanvas, autoGraffitiStyle, artScope, artTexture, artMaterial, hashStr, rngOf, isPaperColor } from '../render/wallart.js';

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
// Text / wall-art rendering lives in src/render/wallart.js (canvas drawing,
// per-level texture + material caches). See LEVEL_GUIDE.md "Wall art".
export function textTexture(text, o = {}) {
  const key = 'sign:' + text + JSON.stringify(o);
  if (o.spray) return artTexture(key, () => graffitiCanvas(text, { w: (o.w ?? 512) / 256, h: (o.h ?? 200) / 256, color: o.fg, style: o.style, dripSpace: 0.1 }));
  return artTexture(key, () => signCanvas(text, o));
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
function artQuad(L, mat, x, y, z, ry, w, h) {
  const m = new THREE.Mesh(doubleSidedQuad(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.receiveShadow = true;
  L.addObject(m);
  return m;
}
export function sign(L, text, x, y, z, ry, w, h, o = {}) {
  artScope(L);
  // canvas with the quad's aspect ratio (no stretched lettering) unless given
  if (o.w == null && o.h == null && !o.spray && w > 0 && h > 0) {
    const a = w / h;
    const W = a >= 4 ? 1024 : 512;
    o = a >= 1 ? { ...o, w: W, h: Math.max(48, Math.min(512, Math.round(W / a))) } : { ...o, w: Math.max(48, Math.round(512 * a)), h: 512 };
  }
  if (o.paper == null && !o.spray && !o.glow && isPaperColor(o.bg) && w * h >= 0.25 && w * h <= 2.2 && h >= 0.3) o = { ...o, paper: true };
  const key = 'sign:' + text + JSON.stringify(o);
  let mat;
  if (o.spray) {
    mat = artMaterial(key, textTexture(text, o), 'decal');
  } else if (o.paper) {
    mat = artMaterial(key, textTexture(text, o), 'paper', { roughness: 0.85 });
  } else {
    const tex = textTexture(text, o);
    mat = artMaterial(key, tex, 'sign', { transparent: !o.bg, glow: o.glow, roughness: o.bg ? 0.5 : 0.62, metalness: o.bg && !o.glow ? 0.15 : 0 });
  }
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
// Spray-painted text. The style is picked from the text unless o.style is given:
// 'scrawl' (spray handwriting), 'drip', 'marker', 'chalk', 'tag', 'throwup',
// 'piece', 'stencil'. o: {style, seed, hand, color2 (outline), fill2, drips}.
// The quad is extended 25% downwards so paint drips have room to run.
export function graffiti(L, text, x, y, z, ry, w = 2, h = 0.8, color = '#b8201a', o = {}) {
  artScope(L);
  const style = o.style ?? autoGraffitiStyle(text, color, o.seed ?? 0);
  const drip = o.dripSpace ?? (style === 'stencil' ? 0.1 : 0.2);
  const h2 = h / (1 - drip);
  const key = `graf:${text}|${color}|${w.toFixed(2)}|${h2.toFixed(2)}|${style}|${JSON.stringify(o)}`;
  const tex = artTexture(key, () => graffitiCanvas(text, { ...o, w, h: h2, color, style, dripSpace: drip }));
  return artQuad(L, artMaterial(key, tex, 'decal'), x, y - (h2 - h) / 2, z, ry, w, h2);
}
export function stencil(L, text, x, y, z, ry, w = 1.6, h = 0.5, color = '#d8d8c8', o = {}) {
  return graffiti(L, text, x, y, z, ry, w, h, color, { ...o, style: 'stencil' });
}
// Printed poster / flyer / notice. kind: 'movie' | 'concert' | 'airline' |
// 'evac' | 'quarantine' | 'missing' | 'ad' | 'health' | 'flyer'.
// o: {seed, title, brand:[name,slogan,bg,fg], lines:[4 flyer lines], wet, fade, torn (0..1), tape, staples, vandal}
export function poster(L, kind, x, y, z, ry, w = 0.6, h = 0.9, o = {}) {
  artScope(L);
  const seed = o.seed ?? ((hashStr(kind) ^ Math.round(x * 131 + y * 17 + z * 71)) >>> 0);
  const key = `poster:${kind}|${seed}|${w.toFixed(2)}|${h.toFixed(2)}|${JSON.stringify(o)}`;
  const tex = artTexture(key, () => posterCanvas(kind, { ...o, w, h, seed }));
  return artQuad(L, artMaterial(key, tex, 'paper', { roughness: kind === 'movie' || kind === 'airline' ? 0.55 : 0.85 }), x, y, z, ry, w, h);
}
// A patch of wall covered with overlapping posters, flyers and torn remnants
// (one texture / draw call). o: {seed, kinds:[...], count}
export function posterWall(L, x, y, z, ry, w = 2.4, h = 1.6, o = {}) {
  artScope(L);
  const seed = o.seed ?? ((Math.round(x * 131 + y * 17 + z * 71) ^ 0x9e37) >>> 0);
  const key = `pwall:${seed}|${w.toFixed(2)}|${h.toFixed(2)}|${JSON.stringify(o)}`;
  const tex = artTexture(key, () => posterWallCanvas({ ...o, w, h, seed }));
  return artQuad(L, artMaterial(key, tex, 'decal', { roughness: 0.8 }), x, y, z, ry, w, h);
}
// Survivor wall: many handwritten lines (names, tallies, arrows, crossed-out
// names, replies...) in different hands, tools and colours around the given
// `lines`. o: {seed, lines:[...], density (filler amount, 0 = only lines), bigSize (cm)}
export function wallMessages(L, x, y, z, ry, w = 1.6, h = 1.1, o = {}) {
  artScope(L);
  const seed = o.seed ?? ((Math.round(x * 131 + y * 17 + z * 71) ^ 0x51f1) >>> 0);
  const key = `wmsg:${seed}|${w.toFixed(2)}|${h.toFixed(2)}|${JSON.stringify(o)}`;
  const tex = artTexture(key, () => wallMessagesCanvas({ ...o, w, h, seed }));
  return artQuad(L, artMaterial(key, tex, 'decal', { roughness: 0.6 }), x, y, z, ry, w, h);
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
  // Survivor wall art inside: handwritten message panels (the given
  // graffiti lines + filler names, tallies, arrows...) and an official notice.
  const msgs = o.graffiti || [];
  const opening = { n: [], s: [], e: [], w: [] };
  opening[dw].push([o.doorAt - 0.85, o.doorAt + 0.85]);
  if (o.extraOpen) for (const k in o.extraOpen) for (const op of o.extraOpen[k]) opening[k].push([op.at - (op.w ?? 1.1) / 2 - 0.2, op.at + (op.w ?? 1.1) / 2 + 0.2]);
  const slots = [];
  for (const k of ['s', 'e', 'w', 'n']) {
    if (walls[k] === false) continue;
    const [a0, a1] = k === 'n' || k === 's' ? [o.x0, o.x1] : [o.z0, o.z1];
    const len = a1 - a0 - 0.6;
    const n = Math.max(1, Math.min(2, Math.floor(len / 1.9)));
    const pw = Math.min(1.7, len / n - 0.2);
    for (let i = 0; i < n; i++) {
      const c = a0 + 0.3 + (i + 0.5) * (len / n);
      if (pw > 0.8 && !opening[k].some(([p, q]) => c + pw / 2 > p && c - pw / 2 < q)) slots.push({ k, c, pw });
    }
  }
  const sr = rngOf(hashStr(`${o.x0},${o.z0},${o.x1},${o.z1},${y}`));
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(sr() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  // spread over the walls: round-robin, one slot per wall at a time
  const byWall = {};
  for (const sl of slots) (byWall[sl.k] || (byWall[sl.k] = [])).push(sl);
  slots.length = 0;
  for (let more = true; more;) { more = false; for (const k in byWall) { const sl = byWall[k].shift(); if (sl) { slots.push(sl); more = true; } } }
  const nPanels = Math.min(slots.length, Math.max(3, Math.min(5, msgs.length + 1)));
  const ph = Math.min(1.25, h - 1.45);
  const place = (sl, fn) => {
    const off = 0.11;
    if (sl.k === 's') fn(sl.c, o.z1 - off, Math.PI);
    else if (sl.k === 'n') fn(sl.c, o.z0 + off, 0);
    else if (sl.k === 'e') fn(o.x1 - off, sl.c, -Math.PI / 2);
    else fn(o.x0 + off, sl.c, Math.PI / 2);
  };
  for (let i = 0; i < nPanels; i++) {
    const sl = slots[i];
    const lines = msgs.filter((_, j) => j % nPanels === i);
    const gy = y + 1.12 + ph / 2 + (sr() - 0.5) * 0.12;
    place(sl, (px, pz, ry) => wallMessages(L, px, gy, pz, ry, sl.pw, ph, { seed: hashStr(`${o.x0},${o.z0},${i}`), lines, density: lines.length ? 0.9 : 1.2 }));
  }
  if (slots.length > nPanels && o.notice !== false) {
    const sl = slots[nPanels];
    place(sl, (px, pz, ry) => poster(L, sr() < 0.5 ? 'evac' : 'health', (sl.k === 'n' || sl.k === 's') ? px + (sr() - 0.5) * 0.4 : px, y + 1.6, (sl.k === 'e' || sl.k === 'w') ? pz + (sr() - 0.5) * 0.4 : pz, ry, 0.5, 0.72, { torn: 0.3, wet: 0.4 }));
  }
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
// ---- detailed physics-prop models: parts merged into ONE vertex-coloured
// mesh per prop (1 draw call), geometry cached per type, materials shared.
const _ppGeo = new Map(), _ppMat = new Map();
function ppMat(rough, metal, extra) {
  const k = rough + ',' + metal + (extra ? ',t' : '');
  let m = _ppMat.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, vertexColors: true, roughness: rough, metalness: metal }, extra || {}));
    _ppMat.set(k, m);
  }
  return m;
}
// parts: [geometry, colorHex, [x,y,z], [rx,ry,rz]?, [sx,sy,sz]?]
function ppBuild(key, parts) {
  let g = _ppGeo.get(key);
  if (g) return g;
  const e = new THREE.Euler(), q = new THREE.Quaternion(), mtx = new THREE.Matrix4(), c = new THREE.Color();
  const geos = parts.map(([geo, col, pos, rot, sc]) => {
    let pg = geo.index ? geo.toNonIndexed() : geo.clone();
    pg.deleteAttribute('uv');
    mtx.compose(new THREE.Vector3(...pos), q.setFromEuler(e.set(...(rot || [0, 0, 0]))), new THREE.Vector3(...(sc || [1, 1, 1])));
    pg.applyMatrix4(mtx);
    c.setHex(col).convertSRGBToLinear();
    const n = pg.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    pg.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return pg;
  });
  // manual merge (all non-indexed, same attributes)
  let total = 0;
  for (const pg of geos) total += pg.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), colA = new Float32Array(total * 3);
  let o = 0;
  for (const pg of geos) { pos.set(pg.attributes.position.array, o); nor.set(pg.attributes.normal.array, o); colA.set(pg.attributes.color.array, o); o += pg.attributes.position.count * 3; }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  g.computeBoundingSphere();
  _ppGeo.set(key, g);
  return g;
}
const cylG = (rt, rb, h, s = 14, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
const boxG = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const torG = (R, r, ts = 18, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, 4, ts, arc);
const HX = [Math.PI / 2, 0, 0];
function physModel(type) {
  switch (type) {
    case 'trashcan': { // galvanised can: ribbed body, rolled rim, side handles, domed lid
      const body = 0x6e6e68, rib = 0x5c5c56, lid = 0x7c7c76;
      const parts = [[cylG(0.26, 0.24, 0.78, 16), body, [0, 0.4, 0]], [cylG(0.235, 0.235, 0.02, 14), 0x3a3a36, [0, 0.015, 0]]];
      for (let i = 0; i < 4; i++) parts.push([torG(0.255 - i * 0.004, 0.012), rib, [0, 0.14 + i * 0.19, 0], HX]);
      parts.push([torG(0.262, 0.018), lid, [0, 0.79, 0], HX]);
      for (const sx of [-1, 1]) parts.push([torG(0.05, 0.009, 8, Math.PI), rib, [sx * 0.27, 0.62, 0], [0, Math.PI / 2, sx > 0 ? -Math.PI / 2 : Math.PI / 2]]);
      parts.push([new THREE.SphereGeometry(0.27, 16, 5, 0, Math.PI * 2, 0, 0.45), lid, [0, 0.72, 0]]);
      parts.push([boxG(0.14, 0.03, 0.035), rib, [0, 0.855, 0]]);
      return [ppBuild(type, parts), ppMat(0.55, 0.6)];
    }
    case 'bucket': { // steel pail: tapered, rolled rim, ears + wire bail
      const c = 0x8a8a86;
      const parts = [[cylG(0.15, 0.12, 0.3, 14, true), c, [0, 0.15, 0]], [cylG(0.12, 0.12, 0.01, 14), 0x6a6a66, [0, 0.005, 0]],
        [torG(0.152, 0.008, 18), 0x9a9a96, [0, 0.3, 0], HX], [torG(0.138, 0.005, 18), 0x7a7a76, [0, 0.18, 0], HX],
        [torG(0.15, 0.004, 16, Math.PI), 0x4a4a48, [0, 0.29, 0], [0, 0, 0]]];
      for (const sx of [-1, 1]) parts.push([boxG(0.012, 0.04, 0.03), 0x7a7a76, [sx * 0.148, 0.27, 0]]);
      // cylinder is open-topped: add the inside so it doesn't look hollow-backfaced
      parts.push([cylG(0.146, 0.116, 0.29, 14, true), 0x5a5a56, [0, 0.155, 0], [Math.PI, 0, 0]]);
      return [ppBuild(type, parts), ppMat(0.5, 0.65)];
    }
    case 'cone': { // traffic cone: square base, cone, two reflective collars
      const o = 0xe05a10;
      const parts = [[boxG(0.36, 0.03, 0.36), 0x1a1a1a, [0, 0.015, 0]], [cylG(0.035, 0.15, 0.58, 14), o, [0, 0.32, 0]],
        [cylG(0.098, 0.121, 0.1, 14), 0xe8e8e0, [0, 0.3, 0]], [cylG(0.068, 0.085, 0.06, 14), 0xe8e8e0, [0, 0.45, 0]]];
      return [ppBuild(type, parts), ppMat(0.55, 0)];
    }
    case 'box': { // cardboard carton: taped seam, flap lines, shipping label
      const k = 0xa07a50;
      const parts = [[boxG(1, 1, 1), k, [0, 0.5, 0]], [boxG(0.2, 0.004, 1.004), 0xc8b088, [0, 1.001, 0]],
        [boxG(0.2, 0.3, 0.004), 0xc8b088, [0, 0.85, 0.5]], [boxG(0.2, 0.3, 0.004), 0xc8b088, [0, 0.85, -0.5]],
        [boxG(1.002, 0.006, 0.006), 0x7a5a38, [0, 0.99, 0.498]], [boxG(0.3, 0.22, 0.004), 0xe8e4d8, [-0.22, 0.45, -0.501]],
        [boxG(0.22, 0.03, 0.005), 0x2a2a2a, [-0.22, 0.5, -0.502]], [boxG(0.16, 0.12, 0.004), 0x2a2a2a, [0.28, 0.72, -0.501]]];
      return [ppBuild(type, parts), ppMat(0.9, 0)];
    }
    case 'chair': { // wooden side chair: seat, splayed legs, stretchers, slatted back
      const w = 0x4a3222, d = 0x3a2618;
      const parts = [[boxG(0.44, 0.045, 0.42), w, [0, 0.45, 0]]];
      for (const sx of [-1, 1]) {
        parts.push([boxG(0.035, 0.45, 0.035), d, [sx * 0.19, 0.22, -0.18]]);
        parts.push([boxG(0.035, 0.98, 0.035), d, [sx * 0.19, 0.49, 0.19], [-0.06, 0, 0]]);
      }
      for (let i = 0; i < 3; i++) parts.push([boxG(0.025, 0.36, 0.02), w, [-0.1 + i * 0.1, 0.72, 0.205], [-0.06, 0, 0]]);
      parts.push([boxG(0.42, 0.07, 0.03), w, [0, 0.93, 0.215], [-0.06, 0, 0]]);
      parts.push([boxG(0.36, 0.02, 0.02), d, [0, 0.12, 0]], [boxG(0.02, 0.02, 0.36), d, [0, 0.12, 0]]);
      return [ppBuild(type, parts), ppMat(0.7, 0)];
    }
    case 'bottle': { // beer bottle: body, shoulder, neck, cap, label
      const gcol = 0x2a5a2a;
      const parts = [[cylG(0.035, 0.035, 0.15, 10), gcol, [0, 0.075, 0]], [cylG(0.014, 0.035, 0.05, 10), gcol, [0, 0.175, 0]],
        [cylG(0.013, 0.014, 0.07, 8), gcol, [0, 0.235, 0]], [cylG(0.015, 0.015, 0.012, 8), 0xb09030, [0, 0.274, 0]],
        [cylG(0.0355, 0.0355, 0.06, 10, true), 0xd8c8a0, [0, 0.08, 0]]];
      return [ppBuild(type, parts), ppMat(0.12, 0.1)];
    }
    case 'propane': { // BBQ cylinder: body, dome, foot ring, collar with handle cut-outs, valve
      const c = 0xd8d8d0;
      const parts = [[cylG(0.17, 0.17, 0.46, 16), c, [0, 0.3, 0]], [new THREE.SphereGeometry(0.17, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), c, [0, 0.53, 0]],
        [new THREE.SphereGeometry(0.17, 16, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), c, [0, 0.07, 0]], [cylG(0.15, 0.15, 0.07, 14, true), 0xc8c8c0, [0, 0.035, 0]],
        [cylG(0.1, 0.1, 0.13, 12, true), c, [0, 0.72, 0]], [torG(0.1, 0.008, 14), 0xc8c8c0, [0, 0.785, 0], HX],
        [cylG(0.022, 0.028, 0.1, 8), 0xb09040, [0, 0.72, 0]], [new THREE.CylinderGeometry(0.035, 0.035, 0.015, 8), 0x2a4aa0, [0, 0.77, 0]],
        [boxG(0.12, 0.06, 0.004), 0xd83020, [0, 0.36, 0.171]], [cylG(0.172, 0.172, 0.02, 16, true), 0x9a9a92, [0, 0.14, 0]]];
      return [ppBuild(type, parts), ppMat(0.4, 0.3)];
    }
    case 'oxygen': {
      const parts = [[cylG(0.1, 0.1, 1.0, 12), 0x3a7a3a, [0, 0.5, 0]], [new THREE.SphereGeometry(0.1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xd8d8d0, [0, 1.0, 0]],
        [cylG(0.025, 0.03, 0.08, 8), 0xb09040, [0, 1.12, 0]], [boxG(0.08, 0.03, 0.03), 0xb09040, [0.04, 1.13, 0]], [boxG(0.1, 0.14, 0.004), 0xe8e4d8, [0, 0.6, 0.101]]];
      return [ppBuild(type, parts), ppMat(0.4, 0.3)];
    }
  }
  return null;
}
export function physProp(L, type, x, y, z, o = {}) {
  const g = L.game;
  let obj, opts = {};
  const m = (geo, mat) => { const k = new THREE.Mesh(geo, mat); return k; };
  const std = (c, r = 0.6, mt = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt });
  switch (type) {
    case 'propane': {
      { const [pg, pmt] = physModel('propane'); obj = new THREE.Mesh(pg, pmt); }
      opts = { radius: 0.2, mass: 2, explosive: 'propane', hp: 15, bottom: 0.2 };
      break;
    }
    case 'oxygen': {
      { const [pg, pmt] = physModel('oxygen'); obj = new THREE.Mesh(pg, pmt); }
      opts = { radius: 0.15, mass: 2, explosive: 'oxygen', hp: 10, bottom: 0.15 };
      break;
    }
    case 'gascan': {
      obj = cloneModel('gascan');
      opts = { radius: 0.17, mass: 1, explosive: 'gascan', hp: 5, bottom: 0.17 };
      break;
    }
    case 'bucket': {
      { const [pg, pmt] = physModel('bucket'); obj = new THREE.Mesh(pg, pmt); }
      opts = { radius: 0.16, mass: 0.6, bottom: 0.16, surf: 'metal' };
      break;
    }
    case 'box': {
      const s = o.size ?? 0.45;
      { const [pg, pmt] = physModel('box'); obj = new THREE.Mesh(pg, pmt); obj.scale.setScalar(s); }
      opts = { radius: s * 0.55, mass: 0.8, bottom: s * 0.55, surf: 'wood', upright: false };
      break;
    }
    case 'chair': {
      { const [pg, pmt] = physModel('chair'); obj = new THREE.Mesh(pg, pmt); }
      opts = { radius: 0.3, mass: 1.5, bottom: 0.3, surf: 'wood', upright: false };
      break;
    }
    case 'trashcan': {
      { const [pg, pmt] = physModel('trashcan'); obj = new THREE.Mesh(pg, pmt); }
      opts = { radius: 0.3, mass: 2, bottom: 0.3, surf: 'metal' };
      break;
    }
    case 'cone': {
      { const [pg, pmt] = physModel('cone'); obj = new THREE.Mesh(pg, pmt); }
      opts = { radius: 0.18, mass: 0.4, bottom: 0.18, surf: 'rubber' };
      break;
    }
    case 'bottle': {
      { const [pg, pmt] = physModel('bottle'); obj = new THREE.Mesh(pg, pmt); }
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
  const u = { pos: new THREE.Vector3(x, y, z), radius: o.radius ?? 2, prompt, hold: o.hold ?? 0, holdLabel: o.holdLabel, glow: o.glow, enabled: o.enabled !== false, onUse: (s) => { if (!u.enabled) return; if (o.once !== false) u.enabled = false; L.game.audio.play(o.sound ?? 'buttonPress', { pos: u.pos, vol: 1 }); onUse(s); } };
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
