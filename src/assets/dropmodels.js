// Zombie survival loot models (pickups.js, Milestone 3.5): cash, an ammo box, a health vial,
// the five power-up emblems, the airdrop crate with its parachute, and the flare that marks
// where it will land. All procedural: primitives baked into one vertex-coloured mesh per model
// (a fixed key light folded into the colours: the world has no lights for entities), canvas
// stencils, and additive glow (halo sprites, a light beam, a ground disc) so loot reads from
// across a dark map. GoldSrc axes: z up, the origin on the floor under the model.
//
// A builder returns its parts; parts with userData.fixed stay still (the ground glow, the
// beam), the rest spin and bob with the pickup (pickups.js frame). Geometry, textures and
// materials are shared (built once per kind / colour): a model costs a few Mesh objects.
import * as THREE from 'three';

const HAS_DOM = typeof document !== 'undefined';
const L = new THREE.Vector3(0.45, 0.3, 0.84).normalize(); // the baked key light (GS axes)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _n = new THREE.Vector3(), _nm = new THREE.Matrix3();

// ---------------------------------------------------------------- baking
/**
 * Bakes primitives into one non-indexed BufferGeometry with vertex colours lit by L.
 * part: [geometry, rgb (0..1), [x, y, z], [rx, ry, rz] (deg), [sx, sy, sz], flat (unlit: true)].
 */
function bake(parts) {
  const pos = [], col = [];
  for (const [g0, rgb, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], flat = false] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    _e.set(r[0] * Math.PI / 180, r[1] * Math.PI / 180, r[2] * Math.PI / 180);
    _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e), _s.set(s[0], s[1], s[2]));
    _nm.getNormalMatrix(_m);
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i).applyMatrix4(_m);
      pos.push(_p.x, _p.y, _p.z);
      let k = 1;
      if (!flat && N) {
        _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
        k = 0.5 + 0.42 * Math.max(0, _n.dot(L)) + 0.14 * _n.z;
      }
      col.push(rgb[0] * k, rgb[1] * k, rgb[2] * k);
    }
    if (g !== g0) g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

const cache = new Map();
const once = (key, make) => { let v = cache.get(key); if (!v) { v = make(); cache.set(key, v); } return v; };
const C = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

// unit primitives (cylinders stand along z: three builds them along y)
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14).rotateX(Math.PI / 2);
const CONE = new THREE.ConeGeometry(1, 1, 14).rotateX(Math.PI / 2);
const BALL = new THREE.SphereGeometry(1, 14, 10);
const box = (rgb, x, y, z, sx, sy, sz, r = [0, 0, 0]) => [BOX, rgb, [x, y, z], r, [sx, sy, sz]];
const cyl = (rgb, x, y, z, rad, h, r = [0, 0, 0], g = CYL) => [g, rgb, [x, y, z], r, [rad, rad, h]];

const VCOL = once('vcol', () => new THREE.MeshBasicMaterial({ vertexColors: true }));
const solid = (geo) => new THREE.Mesh(geo, VCOL);

// ---------------------------------------------------------------- textures (canvas, procedural)
function canvas(w, h, draw) {
  if (!HAS_DOM) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}
const radial = () => once('tex:radial', () => canvas(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,0.7)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
}));
const ringTex = () => once('tex:ring', () => canvas(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 14, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const in2 = g.createRadialGradient(32, 32, 0, 32, 32, 16);
  in2.addColorStop(0, 'rgba(255,255,255,0.35)'); in2.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = in2; g.fillRect(0, 0, 64, 64);
}));
// the light beam: bright at the foot, gone at the top, soft at the sides (u wraps round the cylinder)
const beamTex = () => once('tex:beam', () => canvas(16, 64, (g, w, h) => {
  const gr = g.createLinearGradient(0, h, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}));

/** A stencil: text on a transparent card (crate sides, the coin, the sale tag). */
function stencil(key, w, h, draw) { return once(`tex:${key}`, () => canvas(w, h, draw)); }

const glowMats = new Map();
/** Additive material in rgb (0..255) over tex; shared per (tex, colour, opacity). */
function glowMat(tex, rgb, opacity = 1, sprite = false) {
  const key = `${tex?.uuid}|${rgb.join(',')}|${opacity}|${sprite}`;
  let m = glowMats.get(key);
  if (!m) {
    const o = { map: tex, color: new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending };
    m = sprite ? new THREE.SpriteMaterial(o) : new THREE.MeshBasicMaterial({ ...o, side: THREE.DoubleSide });
    glowMats.set(key, m);
  }
  return m;
}

/** A camera-facing glow of size u at z (spins with the pickup unless fixed). */
export function halo(rgb, size, z = 0, opacity = 0.9) {
  const s = new THREE.Sprite(glowMat(radial(), rgb, opacity, true));
  s.scale.set(size, size, 1);
  s.position.set(0, 0, z);
  s.userData.halo = size;
  s.renderOrder = 3;
  return s;
}

const PLANE = new THREE.PlaneGeometry(1, 1);
/** A glowing disc on the floor (fixed). */
export function groundGlow(rgb, radius, opacity = 0.55, ring = false) {
  const m = new THREE.Mesh(PLANE, glowMat(ring ? ringTex() : radial(), rgb, opacity));
  m.scale.set(radius * 2, radius * 2, 1);
  m.position.z = 0.6;
  m.renderOrder = 1;
  m.userData.fixed = true;
  m.userData.ground = radius;
  return m;
}

const BEAM = new THREE.CylinderGeometry(1, 1.25, 1, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
/** A column of light rising from the floor (fixed): power-ups and crates read from afar. */
export function beam(rgb, radius, height, opacity = 0.5) {
  const m = new THREE.Mesh(BEAM, glowMat(beamTex(), rgb, opacity));
  m.scale.set(radius, radius, height);
  m.renderOrder = 2;
  m.userData.fixed = true;
  m.userData.beam = true;
  return m;
}

/** A flat textured card (unlit), facing +x by default; both sides show. */
function card(tex, w, h, x, y, z, rz = 0, rx = 90) {
  const mat = once(`card:${tex?.uuid}`, () => new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, depthWrite: false }));
  const m = new THREE.Mesh(PLANE, mat);
  m.scale.set(w, h, 1);
  m.rotation.set(rx * Math.PI / 180, 0, rz * Math.PI / 180, 'ZXY');
  m.position.set(x, y, z);
  m.renderOrder = 1;
  return m;
}

// ---------------------------------------------------------------- small loot
const GREEN = C(0x2f7d3a), GREEN2 = C(0x3f9a48), PAPER = C(0xe9e3c4), BAND = C(0xd8b23a), GOLD = C(0xf2c040), GOLD_D = C(0xb8861c);
const OLIVE = C(0x4d5634), OLIVE_D = C(0x353b24), BRASS = C(0xd9a441), COPPER = C(0xc06a34), STEEL = C(0x8a8f96), DARK = C(0x22252a);
const WHITE = C(0xf2f2ee), RED = C(0xd01818), BONE = C(0xece4cc), BLACK = C(0x141414);

const CASH_GEO = () => once('geo:cash', () => bake([
  // three bundles of notes, crossed, each with its paper band
  box(GREEN, 0, 0, 1.1, 13, 6.2, 2.2), box(PAPER, 0, 0, 1.1, 2.6, 6.4, 2.35),
  box(GREEN2, 0.6, 0.4, 3.3, 13, 6.2, 2.2, [0, 0, 24]), box(BAND, 0.6, 0.4, 3.3, 2.6, 6.4, 2.35, [0, 0, 24]),
  box(GREEN, -0.4, -0.2, 5.5, 13, 6.2, 2.2, [0, 0, -16]), box(PAPER, -0.4, -0.2, 5.5, 2.6, 6.4, 2.35, [0, 0, -16]),
  // a gold coin leaning on the pile
  cyl(GOLD, 7.6, 2.4, 3.4, 2.6, 0.7, [70, 0, 30]), cyl(GOLD_D, 7.6, 2.4, 3.4, 2.0, 0.8, [70, 0, 30]),
]));
const AMMO_GEO = () => once('geo:ammo', () => {
  const parts = [
    box(OLIVE, 0, 0, 3.4, 12, 7, 6.8), box(OLIVE_D, 0, 0, 7.1, 12.4, 7.4, 0.8), // the can and its lid rim
    box(C(0xd8c040), 0, -3.56, 3.6, 8.5, 0.2, 1.4), box(C(0xd8c040), 0, 3.56, 3.6, 8.5, 0.2, 1.4), // stencil stripes
    box(DARK, 0, 0, 7.9, 4.5, 1.2, 0.8), // the handle
  ];
  // rounds standing out of the open end
  for (let i = 0; i < 4; i++) {
    const x = -3.6 + i * 2.4;
    parts.push(cyl(BRASS, x, 1.6, 8.6, 0.9, 3.6), cyl(COPPER, x, 1.6, 10.9, 0.75, 1.2), [CONE, COPPER, [x, 1.6, 12.1], [0, 0, 0], [0.75, 0.75, 1.3]]);
  }
  return bake(parts);
});
const VIAL_GEO = () => once('geo:vial', () => bake([
  cyl(STEEL, 0, 0, 0.6, 3.4, 1.2), // a base ring
  cyl(WHITE, 0, 0, 13.6, 2.2, 1.6), cyl(STEEL, 0, 0, 14.8, 1.9, 1.0), // the cap
  box(WHITE, 0, 2.62, 7, 3.6, 0.15, 3.6), box(RED, 0, 2.72, 7, 2.8, 0.15, 0.9), box(RED, 0, 2.72, 7, 0.9, 0.15, 2.8), // the label's cross
], true));
const GLASS = once('mat:glass', () => new THREE.MeshBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
const LIQUID = once('mat:liquid', () => new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
const VIAL_TUBE = new THREE.CylinderGeometry(2.6, 2.6, 12, 16, 1, true).rotateX(Math.PI / 2);
const VIAL_FLUID = new THREE.CylinderGeometry(2.25, 2.25, 9, 16).rotateX(Math.PI / 2);

const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

/** The builders by MODELS id (pickups.js): (d: { id, data }) -> [Object3D]. */
export const LOOT_MODELS = {
  cash: () => [solid(CASH_GEO()), halo([90, 255, 110], 22, 4, 0.55), groundGlow([60, 230, 90], 16, 0.45)],
  ammo: () => [solid(AMMO_GEO()), halo([255, 210, 90], 24, 6, 0.5), groundGlow([240, 190, 60], 16, 0.45)],
  health: () => {
    const fluid = at(new THREE.Mesh(VIAL_FLUID, LIQUID), 0, 0, 6.1);
    const glass = at(new THREE.Mesh(VIAL_TUBE, GLASS), 0, 0, 7);
    return [solid(VIAL_GEO()), fluid, glass, halo([255, 70, 60], 26, 7, 0.75), groundGlow([255, 50, 40], 16, 0.5)];
  },
};

// ---------------------------------------------------------------- power-ups
const coinTex = () => stencil('coin', 128, 128, (g) => {
  g.fillStyle = '#f4c63a'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#a77612'; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#7a5208'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('x2', 64, 68);
});
const tagTex = () => stencil('sale', 128, 64, (g) => {
  g.fillStyle = '#ffffff'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('SALE', 70, 34);
  g.fillStyle = '#ffe9a0'; g.font = 'bold 14px sans-serif'; g.fillText('50% OFF', 70, 56);
});
const trefoilTex = () => stencil('trefoil', 64, 64, (g) => {
  g.fillStyle = '#111'; g.translate(32, 32);
  for (let i = 0; i < 3; i++) {
    g.beginPath(); g.moveTo(0, 0);
    g.arc(0, 0, 28, (i * 120 - 90 - 30) * Math.PI / 180, (i * 120 - 90 + 30) * Math.PI / 180);
    g.closePath(); g.fill();
  }
  g.fillStyle = '#f2d020'; g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111'; g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill();
});

const EMBLEMS = {
  maxammo: () => {
    const parts = [box(C(0x2c4f86), 0, 0, -4.2, 13, 6, 2.2), box(C(0x9cc4ff), 0, 0, -3, 13.4, 6.4, 0.4, [0, 0, 0])];
    for (let i = 0; i < 3; i++) {
      const x = -4.2 + i * 4.2;
      parts.push(cyl(BRASS, x, 0, 0.2, 1.5, 6.4), cyl(GOLD_D, x, 0, -2.9, 1.6, 0.6), [CONE, COPPER, [x, 0, 5.2], [0, 0, 0], [1.35, 1.35, 3.8]]);
    }
    return [solid(once('geo:pu:maxammo', () => bake(parts)))];
  },
  instakill: () => {
    const g = once('geo:pu:instakill', () => bake([
      [BALL, BONE, [0, 0, 1.2], [0, 0, 0], [5.2, 5.6, 5.4]], // the cranium
      box(BONE, 0, 2.6, -3.6, 6.2, 3.2, 3.2), // the jaw
      [BALL, BLACK, [-2.1, 4.25, -0.2], [0, 0, 0], [1.6, 1.1, 1.5]], [BALL, BLACK, [2.1, 4.25, -0.2], [0, 0, 0], [1.6, 1.1, 1.5]], // eye sockets
      [CONE, BLACK, [0, 5.0, -2.0], [-90, 0, 0], [0.8, 0.8, 1.4]], // the nose
      box(BLACK, -1.4, 4.21, -4.4, 0.35, 0.2, 1.8), box(BLACK, 0, 4.21, -4.4, 0.35, 0.2, 1.8), box(BLACK, 1.4, 4.21, -4.4, 0.35, 0.2, 1.8), // teeth
    ]));
    const eyes = [-2.1, 2.1].map((x) => at(new THREE.Sprite(glowMat(radial(), [255, 40, 30], 1, true)), x, 4.8, -0.2));
    for (const e of eyes) e.scale.set(3.4, 3.4, 1);
    return [solid(g), ...eyes];
  },
  doublecash: () => {
    const g = once('geo:pu:coin', () => bake([cyl(GOLD, 0, 0, 0, 6.4, 1.6, [90, 0, 0]), cyl(GOLD_D, 0, 0, 0, 6.6, 1.2, [90, 0, 0])]));
    const t = coinTex();
    return [solid(g), card(t, 11.6, 11.6, 0, 0.84, 0, 0, 90), card(t, 11.6, 11.6, 0, -0.84, 0, 180, 90)];
  },
  nuke: () => {
    const g = once('geo:pu:nuke', () => bake([
      [BALL, C(0xe6c22a), [0, 0, 0], [0, 0, 0], [4.4, 4.4, 6.4]], // the bomb
      cyl(BLACK, 0, 0, 0.6, 4.5, 1.4), // a band
      [CONE, C(0x3a3a30), [0, 0, 7.2], [0, 0, 0], [2.4, 2.4, 3]], // the tail cone
      box(C(0x3a3a30), 0, 0, 9.2, 8.6, 0.5, 3.2), box(C(0x3a3a30), 0, 0, 9.2, 0.5, 8.6, 3.2), // fins
    ]));
    const t = trefoilTex();
    return [solid(g), card(t, 5.6, 5.6, 0, 4.42, -2, 0, 90), card(t, 5.6, 5.6, 0, -4.42, -2, 180, 90)];
  },
  firesale: () => {
    const g = once('geo:pu:tag', () => bake([
      box(C(0xe2581a), 0, 0, 0, 13, 1.2, 8), [BOX, C(0xe2581a), [7.4, 0, 0], [0, 45, 0], [5.6, 1.19, 5.6]], // the tag and its point
      cyl(C(0x2a1a10), 8.3, 0, 0, 0.9, 1.4, [90, 0, 0]), // the string hole
    ]));
    const t = tagTex();
    const flames = [-4, 0, 4].map((x, i) => {
      const f = at(new THREE.Sprite(glowMat(radial(), [255, 150, 40], 0.9, true)), x - 1.5, 0, 5.6 + (i === 1 ? 1.5 : 0));
      f.scale.set(4.5, 6.5, 1);
      f.userData.flicker = true;
      return f;
    });
    return [solid(g), card(t, 12, 6, -1, 0.64, 0, 0, 90), card(t, 12, 6, -1, -0.64, 0, 180, 90), ...flames];
  },
};

/** A power-up: its emblem hovering at chest height in a halo, a light beam and a ring on the floor. */
export function powerupModel(id, rgb) {
  const em = (EMBLEMS[id] || EMBLEMS.maxammo)();
  const g = new THREE.Group();
  for (const o of em) g.add(o);
  g.position.z = 20;
  g.scale.setScalar(1.5);
  return [
    g,
    halo(rgb, 44, 20, 0.7), halo([255, 255, 255], 16, 20, 0.5),
    beam(rgb, 9, 170, 0.32), groundGlow(rgb, 26, 0.7, true), groundGlow(rgb, 40, 0.3),
  ];
}

// ---------------------------------------------------------------- the airdrop crate
const crateTex = () => stencil('crate', 256, 192, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(232,206,92,0.92)'; g.lineWidth = 10;
  g.strokeRect(14, 14, w - 28, h - 28);
  g.fillStyle = 'rgba(232,206,92,0.95)';
  g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('SUPPLY', w / 2, h * 0.42);
  g.font = 'bold 22px sans-serif';
  g.fillText('AIR DROP  -  HANDLE WITH CARE', w / 2, h * 0.72);
  // a star in a circle (stencilled, no insignia of any real army)
  g.beginPath(); g.arc(34, 34, 12, 0, Math.PI * 2); g.fill();
});
const CRATE = [0x4c5530, 0x3a4024, 0x8b8e86];
const CRATE_W = 30, CRATE_H = 18; // the box under the lid (the lid adds 4)
const crateGeo = () => once('geo:crate', () => {
  const body = C(CRATE[0]), frame = C(CRATE[1]), metal = C(CRATE[2]);
  const W = CRATE_W, H = CRATE_H, parts = [box(body, 0, 0, H / 2, W, W, H), box(C(0x1c1f14), 0, 0, H + 0.01, W - 3, W - 3, 0.05)];
  // frame battens round every edge
  for (const s of [-1, 1]) {
    for (const z of [1.2, H - 1.2]) { parts.push(box(frame, 0, s * (W / 2 - 0.6), z, W + 0.6, 1.8, 2.4), box(frame, s * (W / 2 - 0.6), 0, z, 1.8, W + 0.6, 2.4)); }
    for (const s2 of [-1, 1]) parts.push(box(frame, s * (W / 2 - 0.6), s2 * (W / 2 - 0.6), H / 2, 2.2, 2.2, H));
  }
  // steel corner brackets, side handles, the lid's latches
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of [1.6, H - 1.6]) parts.push(box(metal, sx * (W / 2 - 0.4), sy * (W / 2 - 0.4), z, 3.4, 3.4, 3.4));
  for (const s of [-1, 1]) parts.push(box(metal, s * (W / 2 + 0.6), 0, H * 0.55, 1, 8, 1.4), box(metal, 0, s * (W / 2 + 0.6), H * 0.55, 8, 1, 1.4), box(metal, s * 6, -(W / 2 + 0.5), H - 0.6, 2.4, 1, 3));
  return bake(parts);
});
const lidGeo = () => once('geo:crate:lid', () => bake([
  box(C(CRATE[0]), 0, 0, 0, CRATE_W + 0.6, CRATE_W + 0.6, 4), box(C(CRATE[1]), 0, 0, -1.6, CRATE_W + 1, CRATE_W + 1, 0.8),
  // straps over the top, and the beacon housing
  box(C(0x2a2a22), 0, 0, 2.15, 3, CRATE_W + 0.8, 0.4), box(C(0x2a2a22), 0, 0, 2.15, CRATE_W + 0.8, 3, 0.4),
  cyl(DARK, 8, 8, 3.2, 2, 2.2), cyl(C(0xff7a20), 8, 8, 4.8, 1.4, 1.4),
]));

/** The crate: its lid comes off when it's opened (userData.lid), the beacon blinks (userData.beacon), a glow inside (userData.inside). */
export function crateModel() {
  const body = solid(crateGeo());
  const t = crateTex();
  const zc = CRATE_H / 2;
  const sides = [
    card(t, 22, 13, 15.06, 0, zc, 90, 90), card(t, 22, 13, -15.06, 0, zc, -90, 90),
    card(t, 22, 13, 0, 15.06, zc, 180, 90), card(t, 22, 13, 0, -15.06, zc, 0, 90),
  ];
  const lid = solid(lidGeo());
  lid.position.z = CRATE_H + 2;
  lid.userData.lid = true;
  const bea = halo([255, 140, 40], 18, CRATE_H + 7.5, 1);
  bea.position.x = 8; bea.position.y = 8;
  bea.userData.beacon = true;
  const inside = halo([255, 220, 140], 46, CRATE_H + 2, 0.9);
  inside.visible = false;
  inside.userData.inside = true;
  return { parts: [body, ...sides, lid, bea, inside, groundGlow([255, 150, 50], 34, 0.4)], lid, beacon: bea, inside };
}

/** The parachute over a falling crate: a striped canopy and its lines (one Group, hidden on landing). */
export function chuteModel() {
  const geo = once('geo:chute', () => {
    const dome = new THREE.SphereGeometry(44, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.42).toNonIndexed();
    dome.rotateX(Math.PI / 2);
    // panels alternate by azimuth (baked like the rest, a little darker inside)
    const P = dome.attributes.position, N = P.count, col = new Float32Array(N * 3);
    const A = C(0xd8d2c0), B = C(0xc8501e);
    for (let f = 0; f < N; f += 3) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 3; k++) { cx += P.getX(f + k); cy += P.getY(f + k); cz += P.getZ(f + k); }
      const seg = Math.floor(((Math.atan2(cy, cx) + Math.PI) / (Math.PI * 2)) * 12) % 12;
      const c = seg % 2 ? A : B, k = 0.62 + 0.38 * Math.min(1, Math.max(0, cz / 3 / 44));
      for (let j = 0; j < 3; j++) col.set([c[0] * k, c[1] * k, c[2] * k], (f + j) * 3);
    }
    dome.setAttribute('color', new THREE.BufferAttribute(col, 3));
    dome.deleteAttribute('uv');
    dome.translate(0, 0, 40);
    // the lines: thin boxes from the rim to the crate's top corners
    const rim = Math.sin(Math.PI * 0.42) * 44, rz = 40 + Math.cos(Math.PI * 0.42) * 44;
    const lines = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, x0 = Math.cos(a) * rim, y0 = Math.sin(a) * rim;
      const x1 = Math.sign(Math.cos(a)) * 10, y1 = Math.sign(Math.sin(a)) * 10, z1 = 22;
      const dx = x0 - x1, dy = y0 - y1, dz = rz - z1, len = Math.hypot(dx, dy, dz);
      const g = new THREE.BoxGeometry(0.35, 0.35, len).toNonIndexed();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dx / len, dy / len, dz / len));
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (rz + z1) / 2), q, new THREE.Vector3(1, 1, 1)));
      const c = new Float32Array(g.attributes.position.count * 3).fill(0.12);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      g.deleteAttribute('uv'); g.deleteAttribute('normal');
      lines.push(g);
    }
    dome.deleteAttribute('normal');
    return [dome, ...lines];
  });
  const grp = new THREE.Group();
  const mat = once('mat:chute', () => new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  for (const g of geo) grp.add(new THREE.Mesh(g, mat));
  grp.name = 'chute';
  return grp;
}

/** The flare marking a drop: a burning stick on the floor (the sparks and smoke are fire.emit's: pickups.js). */
export function flareModel() {
  const grp = new THREE.Group();
  const g = once('geo:flare', () => bake([cyl(C(0xb01a14), 0, 0, 0, 0.9, 9, [90, 0, 30]), cyl(C(0xe8e0d0), 3.9, 2.25, 0, 0.95, 1.6, [90, 0, 30]), cyl(DARK, -3.9, -2.25, 0, 1, 1.2, [90, 0, 30])]));
  const stick = solid(g);
  stick.position.z = 1;
  const core = halo([255, 235, 220], 12, 3, 1), glow = halo([255, 40, 30], 46, 4, 0.9);
  core.userData.flicker = glow.userData.flicker = true;
  core.position.x = glow.position.x = 4.2; core.position.y = glow.position.y = 2.4;
  grp.add(stick, core, glow, groundGlow([255, 40, 30], 70, 0.6));
  grp.name = 'flare';
  return grp;
}
