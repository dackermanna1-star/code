// Modeling kit: small helpers for building stylized procedural models out of
// primitives, with cached geometries/materials so hundreds of items stay cheap.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { labelTexture, roundRect, FONT, canvas, toTexture, fabric as fabricTex, cached, grain } from '../core/textures.js';
import { seeded } from '../core/utils.js';

const geoCache = new Map();
function cg(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); g.userData.shared = true; geoCache.set(key, g); }
  return g;
}
const r3 = (v) => Math.round(v * 1000) / 1000;

// ------------------------------------------------------------- materials
const matCache = new Map();
export function mat(color = '#cccccc', o = {}) {
  const key = JSON.stringify([color, o.rough, o.metal, o.map?.uuid, o.emissive, o.ei, o.transparent, o.opacity, o.side, o.flat, o.clearcoat, o.normalMap?.uuid, o.roughMap?.uuid, o.envInt, o.phys, o.transmission, o.sheen, o.alphaMap?.uuid, o.depthWrite, o.vertexColors]);
  let m = matCache.get(key);
  if (m) return m;
  const params = {
    color: new THREE.Color(color),
    roughness: o.rough ?? 0.6,
    metalness: o.metal ?? 0,
    map: o.map || null,
    flatShading: !!o.flat,
    transparent: !!o.transparent || (o.opacity != null && o.opacity < 1),
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    vertexColors: !!o.vertexColors,
  };
  if (o.roughMap) params.roughnessMap = o.roughMap;
  if (o.normalMap) params.normalMap = o.normalMap;
  if (o.alphaMap) params.alphaMap = o.alphaMap;
  if (o.emissive) { params.emissive = new THREE.Color(o.emissive); params.emissiveIntensity = o.ei ?? 1; }
  if (o.depthWrite === false) params.depthWrite = false;
  if (o.phys || o.clearcoat || o.transmission || o.sheen) {
    params.clearcoat = o.clearcoat ?? 0; params.clearcoatRoughness = 0.15;
    if (o.transmission) { params.transmission = o.transmission; params.thickness = 0.02; params.ior = 1.4; }
    if (o.sheen) { params.sheen = o.sheen; params.sheenColor = new THREE.Color(color).lerp(new THREE.Color('#fff'), 0.3); params.sheenRoughness = 0.6; }
    m = new THREE.MeshPhysicalMaterial(params);
  } else m = new THREE.MeshStandardMaterial(params);
  if (o.envInt != null) m.envMapIntensity = o.envInt;
  matCache.set(key, m);
  return m;
}
// unique (not cached) material when an item needs to animate its own material
export function uniqueMat(color, o = {}) {
  const m = mat(color, o).clone();
  return m;
}

export const MAT = {
  plastic: (c, rough = 0.42) => mat(c, { rough }),
  gloss: (c) => mat(c, { rough: 0.18, clearcoat: 0.6 }),
  matte: (c) => mat(c, { rough: 0.85 }),
  metal: (c = '#c8ccd2', rough = 0.3) => mat(c, { rough, metal: 1 }),
  chrome: () => mat('#e8ebef', { rough: 0.08, metal: 1 }),
  gold: () => mat('#e2b44f', { rough: 0.22, metal: 1 }),
  glass: (tint = '#dfeff7', opacity = 0.28) => mat(tint, { rough: 0.05, opacity, transparent: true, envInt: 1.4, depthWrite: false }),
  ceramic: (c = '#f4f2ee') => mat(c, { rough: 0.22, clearcoat: 0.4 }),
  rubber: (c = '#222') => mat(c, { rough: 0.95 }),
  fabric: (c) => mat(c, { rough: 0.95, map: fabricTex({ base: '#ffffff', seed: 3 }), sheen: 0.4 }),
  knit: (c) => mat(c, { rough: 1, map: fabricTex({ base: '#ffffff', seed: 4, knit: true }), sheen: 0.5 }),
  wood: (c = '#a57650') => mat(c, { rough: 0.62, map: woodGrain() }),
  paper: (c = '#f5f1e8') => mat(c, { rough: 0.9 }),
  cardboard: () => mat('#c49a6c', { rough: 0.92, map: grainTex() }),
  emissive: (c, ei = 2) => mat(c, { emissive: c, ei, rough: 0.5 }),
  leather: (c) => mat(c, { rough: 0.55, clearcoat: 0.2 }),
  screen: () => mat('#0a0c10', { rough: 0.15, clearcoat: 1 }),
  skin: (c = '#e0ac85') => mat(c, { rough: 0.7 }),
};

export function woodGrain(seed = 2) {
  return cached(`woodgrain:${seed}`, () => {
    const S = 256; const c = canvas(S, S); const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S); const rnd = seeded(seed);
    const offs = Array.from({ length: 8 }, () => rnd() * 10);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const t = x / S * Math.PI * 2;
      let v = 0;
      for (let k = 0; k < 3; k++) v += Math.sin(y * 0.09 * (k + 1) + Math.sin(t * (k + 1) + offs[k]) * 2.5 + offs[k + 3]) / (k + 1);
      const s = 0.86 + v * 0.06 + (rnd() - 0.5) * 0.04;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, s * 255)); img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, { repeat: [1, 1] });
  });
}
function grainTex() { return grain(11, 128, 0.25); }

// ------------------------------------------------------------- geometry
export function mesh(geo, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
export function box(w, h, d, material, o) {
  return mesh(cg(`box:${r3(w)}:${r3(h)}:${r3(d)}`, () => new THREE.BoxGeometry(w, h, d)), material, o);
}
export function rbox(w, h, d, r, material, o, seg = 3) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return mesh(cg(`rbox:${r3(w)}:${r3(h)}:${r3(d)}:${r3(r)}:${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.max(r, 0.0005))), material, o);
}
export function cyl(rt, rb, h, material, seg = 24, o, open = false) {
  return mesh(cg(`cyl:${r3(rt)}:${r3(rb)}:${r3(h)}:${seg}:${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)), material, o);
}
export function sph(r, material, ws = 24, hs = 16, o) {
  return mesh(cg(`sph:${r3(r)}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs)), material, o);
}
export function hemi(r, material, o) {
  return mesh(cg(`hemi:${r3(r)}`, () => new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), material, o);
}
export function torus(r, tube, material, rs = 12, ts = 32, arc = Math.PI * 2, o) {
  return mesh(cg(`torus:${r3(r)}:${r3(tube)}:${rs}:${ts}:${r3(arc)}`, () => new THREE.TorusGeometry(r, tube, rs, ts, arc)), material, o);
}
export function cone(r, h, material, seg = 24, o) {
  return mesh(cg(`cone:${r3(r)}:${r3(h)}:${seg}`, () => new THREE.ConeGeometry(r, h, seg)), material, o);
}
export function capsule(r, len, material, o) {
  return mesh(cg(`cap:${r3(r)}:${r3(len)}`, () => new THREE.CapsuleGeometry(r, len, 6, 16)), material, o);
}
export function plane(w, h, material, o = { cast: false, receive: true }) {
  return mesh(cg(`plane:${r3(w)}:${r3(h)}`, () => new THREE.PlaneGeometry(w, h)), material, o);
}
export function disc(r, material, seg = 32, o = { cast: false, receive: true }) {
  return mesh(cg(`disc:${r3(r)}:${seg}`, () => new THREE.CircleGeometry(r, seg)), material, o);
}
// profile: array of [radius, y]
export function lathe(profile, material, seg = 32, o) {
  const key = 'lathe:' + seg + ':' + profile.map((p) => p.map(r3).join(',')).join(';');
  return mesh(cg(key, () => {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);
    g.computeVertexNormals();
    return g;
  }), material, o);
}
export function tube(points, radius, material, seg = 32, radial = 8, closed = false, o) {
  const key = 'tube:' + r3(radius) + ':' + seg + ':' + radial + ':' + closed + ':' + points.map((p) => p.map(r3).join(',')).join(';');
  return mesh(cg(key, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed), seg, radius, radial, closed)), material, o);
}
// extrude a 2D shape (array of [x,y]) along +z by depth, centered
export function extrude(points, depth, material, bevel = 0.004, o, key = null) {
  const k = key ? `ext:${key}:${r3(depth)}:${r3(bevel)}` : 'ext:' + r3(depth) + ':' + r3(bevel) + ':' + points.map((p) => p.map(r3).join(',')).join(';');
  return mesh(cg(k, () => {
    const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 16 });
    g.translate(0, 0, -depth / 2);
    g.computeVertexNormals();
    return g;
  }), material, o);
}
export function shapeExtrude(shape, depth, material, key, bevel = 0.003, o) {
  return mesh(cg(`sext:${key}:${r3(depth)}:${r3(bevel)}`, () => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 20 });
    g.translate(0, 0, -depth / 2); g.computeVertexNormals(); return g;
  }), material, o);
}

export function at(obj, x = 0, y = 0, z = 0) { obj.position.set(x, y, z); return obj; }
export function rot(obj, x = 0, y = 0, z = 0) { obj.rotation.set(x, y, z); return obj; }
export function scl(obj, x = 1, y = x, z = x) { obj.scale.set(x, y, z); return obj; }
export function group(...children) {
  const g = new THREE.Group();
  for (const c of children.flat()) if (c) g.add(c);
  return g;
}
export function named(obj, name) { obj.name = name; return obj; }

// Material with a canvas-drawn label on a box's front face (+z)
export function labelBox(w, h, d, bodyMat, labelKey, draw, o = {}) {
  const tex = labelTexture(labelKey, o.tw || 256, o.th || Math.round(256 * h / w), draw);
  const front = mat('#ffffff', { map: tex, rough: o.rough ?? 0.5 });
  const mats = [bodyMat, bodyMat, bodyMat, bodyMat, front, o.back ? front : bodyMat];
  const geo = o.round ? new RoundedBoxGeometry(w, h, d, 2, o.round) : cg(`box:${r3(w)}:${r3(h)}:${r3(d)}`, () => new THREE.BoxGeometry(w, h, d));
  if (o.round) {
    // RoundedBoxGeometry has no groups: fall back to a decal plane
    const m = mesh(geo, bodyMat);
    const p = plane(w * 0.92, h * 0.92, front, { cast: false, receive: false });
    p.position.z = d / 2 + 0.0008;
    m.add(p);
    return m;
  }
  return mesh(geo, mats);
}

// A flat textured decal/sticker
export function decal(w, h, labelKey, draw, { tw = 256, th = null, rough = 0.5, transparent = true, emissive = false, ei = 1 } = {}) {
  const tex = labelTexture(labelKey, tw, th || Math.round(tw * h / w), draw);
  const m = emissive
    ? mat('#ffffff', { map: tex, emissive: '#ffffff', ei, rough, transparent })
    : mat('#ffffff', { map: tex, rough, transparent });
  if (emissive) m.emissiveMap = tex;
  return plane(w, h, m, { cast: false, receive: !emissive });
}

// Standard packaging label painter
export function drawLabel(ctx, w, h, { bg = '#ffffff', fg = '#222', accent = '#e33', title = '', sub = '', emoji = '', stripe = true, font = FONT, pattern = null, titleSize = 0.18 }) {
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  if (pattern === 'dots') {
    ctx.fillStyle = accent; ctx.globalAlpha = 0.18;
    for (let y = 8; y < h; y += 18) for (let x = (y / 18) % 2 ? 8 : 17; x < w; x += 18) { ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  } else if (pattern === 'stripes') {
    ctx.fillStyle = accent; ctx.globalAlpha = 0.18;
    for (let x = -h; x < w; x += 26) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.lineTo(x + h + 12, 0); ctx.lineTo(x + 12, h); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  if (stripe) { ctx.fillStyle = accent; ctx.fillRect(0, h * 0.68, w, h * 0.12); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (emoji) { ctx.font = `${Math.round(h * 0.28)}px ${font}`; ctx.fillText(emoji, w / 2, h * 0.3); }
  ctx.fillStyle = fg;
  ctx.font = `800 ${Math.round(Math.min(w, h * 1.6) * titleSize)}px ${font}`;
  fitText(ctx, title, w / 2, emoji ? h * 0.55 : h * 0.42, w * 0.9);
  if (sub) {
    ctx.font = `600 ${Math.round(Math.min(w, h * 1.6) * 0.085)}px ${font}`;
    ctx.fillStyle = stripe ? '#fff' : fg;
    fitText(ctx, sub, w / 2, h * 0.74, w * 0.9);
  }
}
export function fitText(ctx, text, x, y, maxW) {
  const m = ctx.measureText(text).width;
  if (m > maxW) {
    ctx.save(); ctx.translate(x, y); ctx.scale(maxW / m, 1); ctx.fillText(text, 0, 0); ctx.restore();
  } else ctx.fillText(text, x, y);
}
export { roundRect, FONT, labelTexture };

// Soft blob shadow decal under objects (helps ground small props)
export function blobShadow(w, d, opacity = 0.35) {
  const tex = cached('blobshadow', () => {
    const c = canvas(64, 64); const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    return toTexture(c, { wrap: false, srgb: false });
  });
  const m = new THREE.MeshBasicMaterial({ color: '#000', alphaMap: tex, transparent: true, opacity, depthWrite: false });
  const p = new THREE.Mesh(cg('plane:1:1', () => new THREE.PlaneGeometry(1, 1)), m);
  p.rotation.x = -Math.PI / 2; p.scale.set(w, d, 1); p.position.y = 0.002;
  p.userData.noBounds = true; p.renderOrder = -1;
  return p;
}

// Color helpers
export function tint(c, k) { const col = new THREE.Color(c); col.multiplyScalar(k); return '#' + col.getHexString(); }
export function mix(a, b, t) { return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString(); }
