// The furniture of ancient Egypt, built from the kit: papyrus columns with
// painted capitals, obelisks, human- and ram-headed sphinxes, seated colossi,
// standing Anubis statues, pylons with their flagpoles, palms, papyrus reeds,
// feluccas, sarcophagi, canopic jars, offering tables, torches, braziers,
// pyramids, cliffs - and the Pharaoh's scarab buttons and portals.
// Every builder takes the kit, a place (local to the kit's origin) and a
// facing `rot` (radians about +y; 0 = the front faces +z).
import * as THREE from 'three';
import { V, quatOf, mat, cylGeo, latheGeo, taperGeo, boxGeo, special, Piece, colorMat, rnd } from './kit.js';
import { rng } from './paint.js';

/** Build in a sub-frame: offsets rotated by rot and scaled by s. */
export function sub(K, x, y, z, rot = 0, s = 1) {
  const c = Math.cos(rot), sn = Math.sin(rot);
  const Qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
  const P = (lx, ly, lz) => [x + (lx * c + lz * sn) * s, y + ly * s, z + (-lx * sn + lz * c) * s];
  const R = (r) => Qy.clone().multiply(quatOf(r, new THREE.Quaternion()));
  return {
    P, R, s, rot,
    box: (lx, ly, lz, sx, sy, sz, m, o = {}) => K.box(...P(lx, ly, lz), sx * s, sy * s, sz * s, m, { ...o, rot: R(o.rot) }),
    wedge: (lx, ly, lz, sx, sy, sz, m, o = {}) => K.wedge(...P(lx, ly, lz), sx * s, sy * s, sz * s, m, { ...o, rot: R(o.rot) }),
    taper: (lx, ly, lz, sx, sz, tx, tz, h, m, o = {}) => K.taper(...P(lx, ly, lz), sx * s, sz * s, tx * s, tz * s, h * s, m, { ...o, rot: R(o.rot) }),
    cyl: (lx, ly, lz, r, h, m, o = {}) => K.cyl(...P(lx, ly, lz), r * s, h * s, m, { ...o, rTop: o.rTop != null ? o.rTop * s : undefined, rot: R(o.rot) }),
    ball: (lx, ly, lz, r, m, o = {}) => K.ball(...P(lx, ly, lz), r * s, m, { ...o, rot: R(o.rot) }),
    geo: (g, m, lx, ly, lz, r, o = {}) => K.geo(g, m, ...P(lx, ly, lz), R(r), { ...o, scale: o.scale ? o.scale.map((v) => v * s) : [s, s, s] }),
    col: (lx, ly, lz, sx, sy, sz, o = {}) => K.col(...P(lx, ly, lz), sx * s, sy * s, sz * s, R(o.rot), o),
  };
}
const NC = { col: false };

// --- columns -------------------------------------------------------------------------------------------------------------------------
const columnGeos = {};
/** A papyrus-bundle column: a ribbed shaft pinched at the foot, painted bands, an open umbel capital. Base at y. */
export function column(K, x, y, z, h = 30, r = 3, o = {}) {
  const key = h + ':' + r;
  if (!columnGeos[key]) {
    const sh = h * 0.78, ch = h * 0.17;
    // the shaft: pinched at the foot, tapering up, with eight rounded stems
    const prof = [[r * 0.82, 0], [r * 1.0, sh * 0.06], [r * 1.0, sh * 0.15], [r * 0.86, sh]];
    const shaft = latheGeo(prof, 48, 2);
    const p = shaft.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), pz = p.getZ(i), rr = Math.hypot(px, pz);
      if (rr < 0.01) continue;
      const a = Math.atan2(pz, px), k = 1 + 0.06 * Math.abs(Math.cos(a * 4));
      p.setX(i, px * k); p.setZ(i, pz * k);
    }
    shaft.computeVertexNormals();
    const cap = latheGeo([[r * 0.86, 0], [r * 1.05, ch * 0.25], [r * 1.45, ch * 0.7], [r * 1.62, ch]], 32, 1);
    columnGeos[key] = { shaft, cap, sh, ch };
  }
  const G = columnGeos[key];
  K.cyl(x, y + 0.5, z, r * 1.3, 1, o.base || 'ashlar', NC);
  K.geo(G.shaft, special('column'), x, y + 1, z, o.rot || 0);
  K.geo(G.cap, special('capital'), x, y + 1 + G.sh, z, o.rot || 0);
  const ab = r * 1.5;
  K.box(x, y + 1 + G.sh + G.ch + 0.9, z, ab * 2, 1.8, ab * 2, o.abacus || 'ashlar', NC);
  if (o.col !== false) K.col(x, y + h / 2, z, r * 1.8, h, r * 1.8);
  return y + 1 + G.sh + G.ch + 1.8; // the top
}

/** A square pillar with a carved/painted face (Osiride pillars, tomb pillars). */
export function pillar(K, x, y, z, h, w, m = 'glyphsPaint', o = {}) {
  K.box(x, y + h / 2, z, w, h, w, m, o);
  K.box(x, y + h + 0.5, z, w + 1.2, 1, w + 1.2, 'ashlar', NC);
}

// --- obelisk, pyramidion -------------------------------------------------------------------------------------------------------------------------
export function obelisk(K, x, y, z, h = 50, w = 5, o = {}) {
  const base = o.base ?? 4;
  if (base) { K.box(x, y + base / 2, z, w * 2.2, base, w * 2.2, 'granite', o.col === false ? NC : {}); K.box(x, y + base + 0.4, z, w * 1.7, 0.8, w * 1.7, 'gold', NC); }
  const y0 = y + base + (base ? 0.8 : 0), sh = h * 0.92, ph = h - sh;
  K.taper(x, y0 + sh / 2, z, w, w, w * 0.7, w * 0.7, sh, o.mat || 'glyphsGranite', { ...(o.col === false ? NC : {}), rot: o.rot || 0 });
  K.geo(taperGeo(w * 0.7, w * 0.7, 0.01, 0.01, ph, 2), 'gold', x, y0 + sh + ph / 2, z, o.rot || 0);
  return y0 + h;
}

// --- statues ---------------------------------------------------------------------------------------------------------------------------------------
/** The nemes headcloth (striped), a face, a beard; head centre at (0, 0, 0) of S, facing +z, size `u` (studs per unit). */
export function pharaohHead(S, cx, cy, cz, u, m = 'ashlarPale', o = {}) {
  const stripes = o.painted;
  // face block and features
  S.box(cx, cy, cz + 0.2 * u, 2.2 * u, 2.6 * u, 2 * u, m, NC);
  S.wedge(cx, cy - 0.1 * u, cz + 1.35 * u, 0.5 * u, 0.9 * u, 0.5 * u, m, { ...NC, rot: [0, 180, 0] }); // nose
  for (const sx of [-0.5, 0.5]) S.box(cx + sx * u, cy + 0.35 * u, cz + 1.22 * u, 0.55 * u, 0.16 * u, 0.06 * u, 'black', NC);
  S.box(cx, cy - 0.75 * u, cz + 1.22 * u, 0.7 * u, 0.1 * u, 0.06 * u, 'black', NC);
  // the nemes: over the top, flaps down the front, the tail behind
  S.box(cx, cy + 1.35 * u, cz - 0.1 * u, 2.7 * u, 0.4 * u, 2.6 * u, stripes ? 'gold' : m, NC);
  for (const sx of [-1, 1]) {
    S.box(cx + sx * 1.3 * u, cy + 0.2 * u, cz - 0.2 * u, 0.4 * u, 2.6 * u, 2.4 * u, stripes ? 'gold' : m, NC);
    S.box(cx + sx * 1.15 * u, cy - 1.6 * u, cz + 0.5 * u, 0.8 * u, 2.4 * u, 0.4 * u, stripes ? 'gold' : m, NC);
    if (stripes) for (let i = 0; i < 4; i++) S.box(cx + sx * 1.15 * u, cy - 0.7 * u - i * 0.55 * u, cz + 0.72 * u, 0.82 * u, 0.2 * u, 0.06 * u, 'blue', NC);
  }
  S.box(cx, cy - 0.4 * u, cz - 1.5 * u, 1.6 * u, 2.6 * u, 0.6 * u, stripes ? 'gold' : m, NC);
  // the uraeus cobra on the brow, the false beard
  S.box(cx, cy + 1.45 * u, cz + 1.25 * u, 0.3 * u, 0.6 * u, 0.25 * u, 'gold', NC);
  S.box(cx, cy - 1.75 * u, cz + 0.95 * u, 0.42 * u, 1.3 * u, 0.42 * u, m, NC);
}

/** A seated colossus (Abu Simbel): h tall (to the top of the crown), on a throne. Front faces +z. */
export function colossus(K, x, y, z, rot = 0, h = 46, o = {}) {
  const u = h / 23, S = sub(K, x, y, z, rot, 1), m = o.mat || 'ashlarPale';
  // the throne and its base
  S.box(0, 1 * u, 0, 9 * u, 2 * u, 11 * u, 'ashlar', NC);
  S.box(0, 6 * u, -2.6 * u, 8 * u, 8 * u, 5 * u, m, NC);
  // legs (shins, feet), thighs
  for (const sx of [-1.4, 1.4]) {
    S.box(sx * u, 5.5 * u, 3.6 * u, 2.1 * u, 7 * u, 2.2 * u, m, NC);
    S.box(sx * u, 2.5 * u, 4.6 * u, 2.1 * u, 1 * u, 3.8 * u, m, NC);
    S.box(sx * u, 9.6 * u, 1.6 * u, 2.3 * u, 2 * u, 6.2 * u, m, NC);
  }
  // the kilt, torso, shoulders, arms resting on the thighs
  S.box(0, 10.4 * u, 0.4 * u, 5.2 * u, 2.6 * u, 4 * u, m, NC);
  S.taper(0, 14.6 * u, -0.4 * u, 4.2 * u, 2.6 * u, 6.4 * u, 2.8 * u, 6 * u, m, NC);
  for (const sx of [-1, 1]) {
    S.box(sx * 3.1 * u, 14.3 * u, -0.2 * u, 1.3 * u, 5.4 * u, 1.5 * u, m, NC);
    S.box(sx * 2.4 * u, 11.2 * u, 2.4 * u, 1.3 * u, 1.2 * u, 5.4 * u, m, NC);
  }
  // the broad collar
  S.box(0, 16.8 * u, 0.85 * u, 4.4 * u, 1.3 * u, 0.4 * u, o.painted ? 'lapis' : m, NC);
  // the head and the double crown
  pharaohHead(S, 0, 19.6 * u, -0.2 * u, u, m, o);
  S.cyl(0, 22.3 * u, -0.3 * u, 1.1 * u, 2.2 * u, o.painted ? 'white' : m, { ...NC, rTop: 0.7 * u });
  S.ball(0, 23.5 * u, -0.3 * u, 0.7 * u, o.painted ? 'white' : m, NC);
  // one collider for the lot
  S.col(0, 8 * u, 0, 9 * u, 16 * u, 11 * u);
  return { u };
}

/** A sphinx on a plinth, front facing +z. kind 'man' (nemes) or 'ram' (curled horns). s ~ 1 = 9 studs long. */
export function sphinx(K, x, y, z, rot = 0, s = 1, kind = 'man', o = {}) {
  const S = sub(K, x, y, z, rot, s), m = o.mat || 'ashlarPale';
  if (o.plinth !== false) {
    S.box(0, 1.5, 0, 6, 3, 12, 'ashlar', NC);
    S.box(0, 3.2, 0, 6.4, 0.4, 12.4, 'ashlarPale', NC);
  }
  const b = o.plinth === false ? 0 : 3.4;
  // the lion: body, haunches, forelegs stretched out, paws, tail curled round
  S.box(0, b + 2.4, -1, 3.6, 3, 7.5, m, NC);
  S.box(0, b + 1.6, -3.6, 4, 3.2, 3.4, m, NC);
  for (const sx of [-1.15, 1.15]) {
    S.box(sx, b + 0.6, 3.6, 1.1, 1.2, 4.6, m, NC);
    S.box(sx, b + 0.55, 5.9, 1.3, 1.1, 1.2, m, NC);
  }
  S.box(1.9, b + 0.4, -3.2, 0.5, 0.5, 3.4, m, NC);
  // the chest and the head
  S.box(0, b + 3.6, 2.6, 3.2, 3.4, 2, m, NC);
  if (kind === 'ram') {
    S.box(0, b + 5.6, 3.4, 1.7, 1.8, 2.6, m, NC);
    S.wedge(0, b + 5.3, 5.1, 1.4, 1.4, 1.2, m, { ...NC, rot: [0, 180, 0] });
    for (const sx of [-1, 1]) {
      const g = new THREE.TorusGeometry(0.75, 0.32, 8, 16, Math.PI * 1.5);
      S.geo(g, m, sx * 1.05, b + 5.5, 3.1, [0, sx * 90, 0]);
    }
  } else {
    pharaohHead(S, 0, b + 5.7, 3.1, 0.75, m, o);
  }
  if (o.col !== false) S.col(0, (b + 7) / 2, 0, 6.4, b + 7, 12.4);
}

/** A standing Anubis: black basalt and gold, jackal-headed, a was sceptre in his hand. h ~ total height. */
export function anubis(K, x, y, z, rot = 0, h = 30, o = {}) {
  const u = h / 20, S = sub(K, x, y, z, rot, 1), m = 'basalt';
  if (o.plinth !== false) S.box(0, 0.75 * u, 0, 6 * u, 1.5 * u, 6 * u, 'granite', NC);
  const b = o.plinth === false ? 0 : 1.5 * u;
  // striding legs, the gold kilt
  S.box(-0.7 * u, b + 3.4 * u, -0.8 * u, 1.1 * u, 6.8 * u, 1.2 * u, m, NC);
  S.box(0.7 * u, b + 3.4 * u, 0.9 * u, 1.1 * u, 6.8 * u, 1.2 * u, m, NC);
  S.taper(0, b + 8.2 * u, 0, 3.6 * u, 2.4 * u, 2.8 * u, 1.8 * u, 2.8 * u, 'gold', NC);
  // torso, collar, arms
  S.taper(0, b + 11.6 * u, 0, 2.8 * u, 1.8 * u, 4.4 * u, 2 * u, 4.2 * u, m, NC);
  S.box(0, b + 13.4 * u, 0.6 * u, 3.6 * u, 0.9 * u, 1.3 * u, 'lapis', NC);
  S.box(-2.6 * u, b + 11.2 * u, 0, 0.9 * u, 4.6 * u, 1 * u, m, NC);
  S.box(2.5 * u, b + 12 * u, 1.2 * u, 0.9 * u, 1 * u, 3 * u, m, NC);
  S.box(2.5 * u, b + 12.4 * u, -0.6 * u, 0.9 * u, 2.8 * u, 1 * u, m, NC);
  // the was sceptre
  if (o.staff !== false) {
    S.box(2.5 * u, b + 8 * u, 2.4 * u, 0.35 * u, 16 * u, 0.35 * u, 'gold', NC);
    S.box(2.5 * u, b + 16.2 * u, 2.9 * u, 0.4 * u, 0.6 * u, 1.4 * u, 'gold', NC);
  }
  // the jackal head: skull, long snout, tall ears, gold eyes, the striped headcloth
  const hy = b + 15.4 * u;
  S.box(0, hy, 0, 1.9 * u, 2 * u, 2.1 * u, m, NC);
  S.taper(0, hy - 0.35 * u, 1.75 * u, 1.1 * u, 0.9 * u, 0.5 * u, 0.5 * u, 1.5 * u, m, { ...NC, rot: [90, 0, 0] });
  for (const sx of [-0.55, 0.55]) {
    S.taper(sx * u, hy + 1.9 * u, -0.2 * u, 0.7 * u, 0.5 * u, 0.1 * u, 0.2 * u, 2.2 * u, m, NC);
    S.box(sx * u, hy + 0.35 * u, 1.02 * u, 0.4 * u, 0.2 * u, 0.1 * u, 'gold', NC);
  }
  S.box(0, hy - 1 * u, -0.5 * u, 2.4 * u, 2.6 * u, 1.4 * u, 'gold', NC);
  for (let i = 0; i < 4; i++) S.box(0, hy - 0.2 * u - i * 0.55 * u, -1.22 * u, 2.42 * u, 0.22 * u, 0.06 * u, 'lapis', NC);
  if (o.col !== false) S.col(0, h / 2, 0, 5 * u, h, 5 * u);
  return { u, b };
}

/** A recumbent jackal on a shrine-chest (Tutankhamun's Anubis). */
export function jackalShrine(K, x, y, z, rot = 0, s = 1) {
  const S = sub(K, x, y, z, rot, s);
  S.box(0, 1.2, 0, 3.2, 2.4, 5, 'gold', NC);
  for (let i = 0; i < 3; i++) S.box(0, 0.5 + i * 0.7, 2.52, 3.22, 0.18, 0.04, 'lapis', NC);
  S.box(0, 3.2, -0.3, 1.6, 1.6, 3.6, 'basalt', NC);
  S.box(0, 4.4, 1.4, 1.1, 1.3, 1.3, 'basalt', NC);
  S.box(0, 4.3, 2.4, 0.6, 0.6, 1, 'basalt', NC);
  for (const sx of [-0.35, 0.35]) S.box(sx, 5.4, 1.2, 0.3, 1, 0.4, 'basalt', NC);
  for (const sx of [-0.5, 0.5]) S.box(sx, 2.7, 1.9, 0.4, 0.4, 1.6, 'basalt', NC);
  S.col(0, 2.5, 0, 3.2, 5, 5);
}

// --- architecture --------------------------------------------------------------------------------------------------------------------------------
/** The cavetto cornice and torus roll along the top of a wall: length L along x (rot turns it), top at y. */
export function cornice(K, x, y, z, L, depth = 2, rot = 0, m = 'ashlar') {
  const S = sub(K, x, y, z, rot, 1);
  S.box(0, -0.5, 0, L, 1, depth, 'ashlar', NC);
  S.cyl(0, -1.3, depth / 2, 0.4, L, 'lapis', { ...NC, rot: [0, 0, 90] });
  S.wedge(0, 0.6, depth / 2 + 0.6, L, 1.2, 1.2, m, { ...NC, rot: [0, 180, 0] });
  S.box(0, 0.6, 0, L, 1.2, depth, m, NC);
}

/** A pylon gateway: two sloping towers either side of a gate `gw` wide, front facing +z. Returns the gate's opening box. */
export function pylon(K, x, y, z, rot = 0, o = {}) {
  const tw = o.towerW ?? 34, th = o.h ?? 46, d = o.depth ?? 14, gw = o.gate ?? 22, gh = o.gateH ?? 28;
  const S = sub(K, x, y, z, rot, 1);
  for (const sx of [-1, 1]) {
    const cx = sx * (gw / 2 + tw / 2);
    S.taper(cx, th / 2, 0, tw, d, tw * 0.8, d * 0.7, th, 'glyphs');
    S.box(cx, th + 1, 0, tw * 0.84, 2, d * 0.78, 'ashlar', NC);
    // painted reliefs on the front, flagpoles in their niches
    K.relief(...S.P(cx, th * 0.42, d / 2 * 0.86 + 0.2), tw * 0.62, th * 0.36, S.R([-4, 0, 0]), o.relief ?? 1);
    if (o.poles !== false && o.poles !== (sx > 0 ? 'left' : 'right')) for (const fx of [-0.25, 0.25]) {
      const px = cx + fx * tw;
      S.cyl(px, th * 0.62, d / 2 + 1.3, 0.45, th * 1.24, 'wood', NC);
      S.box(px + 2.2, th * 1.12, d / 2 + 1.3, 4, 1.8, 0.1, sx > 0 ? 'red' : 'blue', NC);
    }
  }
  // the gate's lintel and cornice over the passage
  S.box(0, gh + 3, 0, gw + 4, 6, d * 0.8, 'glyphs');
  S.box(0, gh + 6.6, 0, gw + 6, 1.2, d * 0.84, 'gold', NC);
  // a winged sun disk over the gate
  S.cyl(0, gh + 3, d * 0.4 + 0.25, 1.4, 0.4, 'gold', { ...NC, rot: [90, 0, 0] });
  for (const sx of [-1, 1]) S.box(sx * 4.2, gh + 3.2, d * 0.4 + 0.2, 5.6, 1, 0.2, 'lapis', NC);
  return { gw, gh, d };
}

// --- plants, boats ---------------------------------------------------------------------------------------------------------------------------------
const frondGeo = (() => { let g = null; return () => { if (!g) { g = new THREE.PlaneGeometry(3.2, 9, 1, 4); g.translate(0, 4.5, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const yy = p.getY(i); p.setZ(i, Math.pow(yy / 9, 2) * 3.5); } g.computeVertexNormals(); } return g; }; })();
/** A date palm: a leaning, segmented trunk and a crown of drooping fronds. */
export function palm(K, x, y, z, h = 18, seed = 1, o = {}) {
  const r = rng(seed * 13 + 7);
  const lean = (r() - 0.5) * 0.35, dir = r() * Math.PI * 2;
  let px = 0, pz = 0, py = 0;
  const segs = Math.round(h / 2);
  for (let i = 0; i < segs; i++) {
    const t = i / segs, k = lean * t * t;
    const nx = Math.cos(dir) * k * h, nz = Math.sin(dir) * k * h;
    K.cyl(x + (px + nx) / 2, y + py + 1, z + (pz + nz) / 2, 0.55 - t * 0.12, 2.1, 'palmTrunk', { ...NC, rTop: 0.5 - t * 0.12, seg: 7 });
    px = nx; pz = nz; py += 2;
  }
  const tx = x + px, ty = y + py, tz = z + pz;
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3, tilt = 30 + r() * 45;
    K.geo(frondGeo(), special('frond'), tx, ty, tz, [tilt, a * 57.3, 0], { noShadow: false });
  }
  K.ball(tx, ty - 0.6, tz, 0.9, 'palmTrunk', NC);
  for (let i = 0; i < 3; i++) K.ball(tx + Math.cos(i * 2.1) * 1, ty - 1.4, tz + Math.sin(i * 2.1) * 1, 0.6, colorMat(0xb05a20, 0.7), NC);
  if (o.col !== false) K.col(x, y + h / 2, z, 1.2, h, 1.2);
}
const reedGeo = (() => { let g = null; return () => g || (g = new THREE.PlaneGeometry(8, 7).translate(0, 3.5, 0)); })();
/** A clump of papyrus and reeds (crossed alpha cards). */
export function reeds(K, x, y, z, s = 1, rot = 0) {
  for (let i = 0; i < 3; i++) K.geo(reedGeo(), special('reeds'), x, y, z, rot + i * Math.PI / 3, { scale: [s, s * (0.85 + (i % 2) * 0.3), s], noShadow: true });
}
let _sail = null;
const sailMat = () => _sail || (_sail = Object.assign(mat('linen').clone(), { side: THREE.DoubleSide }));
/** A felucca on the Nile: a cedar hull, a mast, a great slanting sail. */
export function felucca(K, x, y, z, rot = 0, s = 1) {
  const S = sub(K, x, y, z, rot, s);
  S.box(0, 0.7, 0, 4, 1.6, 14, 'wood', NC);
  S.wedge(0, 0.9, 8.4, 4, 2, 3, 'wood', { ...NC, rot: [0, 180, 0] });
  S.wedge(0, 0.9, -8.2, 4, 2, 2.6, 'wood', NC);
  S.box(0, 1.6, 0, 3.4, 0.3, 13, 'wood', NC);
  S.cyl(0, 9, 3, 0.25, 16, 'wood', NC);
  const sail = new THREE.BufferGeometry();
  sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -11, 0, 19, 6], 3));
  sail.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 1, 3], 2));
  sail.computeVertexNormals();
  S.geo(sail, sailMat(), 0.2, 2.5, 4, 0);
}

// --- tomb furniture ---------------------------------------------------------------------------------------------------------------------------------------
/** An anthropoid coffin lying down (gold face, striped nemes, crossed arms), length along z. */
export function coffin(K, x, y, z, rot = 0, s = 1) {
  const S = sub(K, x, y, z, rot, s);
  S.box(0, 0.6, 0, 3.4, 1.2, 8, 'granite', NC);
  S.taper(0, 1.9, -0.6, 2.4, 6.4, 2.8, 6.4, 1.4, 'gold', { ...NC, rot: [0, 0, 0] });
  S.box(0, 2.6, 2.9, 2.2, 0.9, 1.8, 'gold', NC);
  for (let i = 0; i < 4; i++) S.box(0, 2.62, 1.8 - i * 1.2, 2.5, 0.08, 0.35, 'lapis', NC);
  S.box(0, 3.1, 3.0, 1.2, 0.2, 1.2, colorMat(0xd9a060, 0.4, 0.6), NC);
  S.col(0, 1.5, 0, 3.4, 3, 8);
}
/** Canopic jars (four, with the heads of the sons of Horus). */
export function canopics(K, x, y, z, rot = 0) {
  const S = sub(K, x, y, z, rot, 1);
  S.box(0, 0.5, 0, 4.4, 1, 1.6, 'gold', NC);
  [[-1.5, 'bone'], [-0.5, 'bone'], [0.5, 'bone'], [1.5, 'bone']].forEach(([px, m], i) => {
    S.cyl(px, 1.9, 0, 0.42, 1.8, 'faience', { ...NC, rTop: 0.34 });
    S.ball(px, 3.0, 0, 0.36, ['basalt', 'gold', 'bone', 'faience'][i], NC);
  });
}
export function jar(K, x, y, z, s = 1, m = 'mud') {
  const g = latheGeo([[0.01, 0], [0.5, 0.15], [0.85, 0.9], [0.6, 1.6], [0.3, 1.9], [0.38, 2.1]], 12, 1);
  K.geo(g, m, x, y, z, 0, { scale: [s, s, s] });
}
export function offeringTable(K, x, y, z, rot = 0) {
  const S = sub(K, x, y, z, rot, 1);
  S.cyl(0, 1.2, 0, 0.35, 2.4, 'granite', NC);
  S.box(0, 2.5, 0, 3, 0.3, 2, 'granite', NC);
  const fruit = [0xb8352b, 0xe8b44a, 0x2f8f6b, 0x7a3a8a];
  for (let i = 0; i < 6; i++) S.ball(-1 + (i % 3), 2.9, -0.4 + Math.floor(i / 3) * 0.8, 0.35, colorMat(fruit[i % 4], 0.6), NC);
}
export function chest(K, x, y, z, rot = 0) {
  const S = sub(K, x, y, z, rot, 1);
  S.box(0, 1, 0, 3, 2, 2, 'wood', NC);
  S.box(0, 2.15, 0, 3.2, 0.3, 2.2, 'gold', NC);
  S.box(0, 1, 1.01, 2.4, 1.2, 0.04, 'lapis', NC);
  S.col(0, 1.1, 0, 3, 2.2, 2);
}

// --- fire ---------------------------------------------------------------------------------------------------------------------------------------------
/** A torch on a wall bracket: `out` is the direction away from the wall (radians). FX = {flames, lights}. */
export function torch(K, FX, x, y, z, out = 0, o = {}) {
  const S = sub(K, x, y, z, out, 1);
  S.box(0, 0, 0.3, 0.5, 1.6, 0.6, 'bronze', NC);
  S.box(0, -0.2, 0.9, 0.3, 0.3, 1.2, 'bronze', NC);
  S.cyl(0, 0.3, 1.5, 0.45, 0.7, 'bronze', { ...NC, rTop: 0.6 });
  const p = K.W(...S.P(0, 0.6, 1.5));
  FX.flames.add(p, o.size ?? 1.3, o.color ?? 0xffc070);
  if (o.light !== false) FX.lights.add(p.clone().add(V(0, 1.2, 0)), o.lightColor ?? 0xff9a40, o.intensity ?? 60, o.range ?? 34);
}
/** A brazier on a tall stand. */
export function brazier(K, FX, x, y, z, o = {}) {
  const h = o.h ?? 5;
  K.cyl(x, y + 0.3, z, 1.1, 0.6, 'bronze', NC);
  K.cyl(x, y + h / 2, z, 0.3, h, 'bronze', NC);
  const bowl = latheGeo([[0.3, 0], [1.4, 0.5], [1.9, 1.3], [1.95, 1.4]], 16, 1);
  K.geo(bowl, 'bronze', x, y + h, z);
  if (o.col !== false) K.col(x, y + h / 2, z, 1.4, h + 1.4, 1.4);
  const p = K.W(x, y + h + 1, z);
  FX.flames.add(p, o.size ?? 2.4, o.color ?? 0xffb860);
  if (o.light !== false) FX.lights.add(p.clone().add(V(0, 1.5, 0)), o.lightColor ?? 0xff9030, o.intensity ?? 110, o.range ?? 50);
}

// --- the landscape ---------------------------------------------------------------------------------------------------------------------------------------
/** A pyramid (smooth limestone casing on top of stepped courses, a gold capstone). */
export function pyramid(K, x, y, z, base, h, o = {}) {
  K.geo(taperGeo(base, base, 0.02, 0.02, h, o.uv ?? 24), o.mat || 'ashlarPale', x, y + h / 2, z, o.rot || 0, { noShadow: !!o.far });
  const ch = h * 0.06;
  K.geo(taperGeo(base * 0.06 * 1.05, base * 0.06 * 1.05, 0.02, 0.02, ch, 2), 'gold', x, y + h - ch / 2 + 0.2, z, o.rot || 0);
}
/** A slab of cliff (rough rock), with a few loose boulders at its foot. */
export function cliff(K, x, y, z, w, h, d, o = {}) {
  const r = rng(Math.floor(x * 7 + z * 13));
  const m = o.mat || 'rock';
  K.box(x, y + h / 2, z, w, h, d, m, o.col === false ? NC : {});
  for (let i = 0; i < 4; i++) {
    const bw = w * (0.2 + r() * 0.3), bh = h * (0.15 + r() * 0.35);
    K.box(x + (r() - 0.5) * w * 0.8, y + h - bh / 2 + r() * h * 0.08, z + (r() - 0.5) * d * 0.5, bw, bh, d * (0.6 + r() * 0.5), m, { ...NC, rot: [0, (r() - 0.5) * 30, 0] });
  }
}

// --- the Pharaoh's things ---------------------------------------------------------------------------------------------------------------------------
/** A scarab button on a granite pedestal: returns a Piece-based object the trap drives (press(), arm(on)). */
export function scarabButton(world, pos, rot = 0) {
  const P = new Piece();
  P.box(0, 1.6, 0, 3, 3.2, 3, 'granite', { col: false });
  P.box(0, 3.35, 0, 3.4, 0.3, 3.4, 'gold', { col: false });
  const beetle = new THREE.Group(); beetle.position.set(0, 3.6, 0); P.group.add(beetle);
  const add = (g, m, x, y, z, r) => { const mesh = new THREE.Mesh(g, typeof m === 'string' ? mat(m) : m); mesh.position.set(x, y, z); if (r) quatOf(r, mesh.quaternion); mesh.castShadow = true; beetle.add(mesh); return mesh; };
  add(new THREE.SphereGeometry(1, 16, 10).scale(1, 0.55, 1.3), 'gold', 0, 0.35, -0.1);
  add(boxGeo(0.06, 0.1, 2.4), 'lapis', 0, 0.9, -0.1);
  add(new THREE.SphereGeometry(0.55, 12, 8).scale(1.1, 0.6, 0.8), 'gold', 0, 0.3, 1.2);
  const eyes = [-0.3, 0.3].map((ex) => add(new THREE.SphereGeometry(0.13, 8, 6), mat('eyeGlow').clone(), ex, 0.45, 1.55));
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) add(boxGeo(0.9, 0.12, 0.14), 'gold', sx * 1.1, 0.05, 0.6 - i * 0.6, [0, sx * (20 - i * 20), sx * -25]);
  const g = P.group; g.position.copy(pos); g.rotation.y = rot;
  world.scene.add(g);
  return {
    group: g, beetle, eyes,
    arm(on) { for (const e of eyes) { e.material.emissiveIntensity = on ? 3 : 0; e.material.color.set(on ? 0xff3020 : 0x222222); } beetle.position.y = on ? 3.6 : 3.25; },
  };
}

/** A gateway the Pharaoh steps through to another gallery: a doorway with a swirling sheet of light. */
export function portal(K, x, y, z, rot = 0, color = 0x60c0ff) {
  const S = sub(K, x, y, z, rot, 1);
  for (const sx of [-3.6, 3.6]) S.box(sx, 4.5, 0, 1.4, 9, 1.6, 'gold', NC);
  S.box(0, 9.6, 0, 9, 1.4, 2, 'gold', NC);
  S.box(0, 10.8, 0, 9.6, 1, 2.2, 'lapis', NC);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 9), new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, col: { value: new THREE.Color(color) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float t; uniform vec3 col; varying vec2 vUv;
      void main(){ vec2 c = vUv - 0.5; c.x *= 0.65; float r = length(c), a = atan(c.y, c.x);
        float sw = sin(a * 5.0 + r * 22.0 - t * 3.0) * 0.5 + 0.5;
        float glow = smoothstep(0.55, 0.0, r);
        vec3 k = mix(col * 1.4, vec3(1.0, 0.95, 0.8) * 2.0, smoothstep(0.25, 0.0, r));
        gl_FragColor = vec4(k * (0.4 + sw * 0.8) * glow, glow * 0.9); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  const p = K.W(...S.P(0, 4.6, 0));
  sheet.position.copy(p); sheet.quaternion.copy(S.R(0));
  K.world.scene.add(sheet);
  return { sheet, pos: p };
}
export { rnd };
