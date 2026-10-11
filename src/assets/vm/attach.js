// Attachments and skins on the first-person view models (zombie survival upgrades, see
// game/attachments.js).
//
// The parts are drawn with the same modelling kit and studio material as the guns and
// placed by measuring each gun's own geometry (gun frame: -Z forward along the bore, +Y
// up): the muzzle device on the bore at the tip of the barrel, the red dot on top of the
// receiver, the laser on the right of the handguard (under the frame on pistols), the
// foregrip under the handguard just ahead of the support hand. An extended magazine
// stretches the magazine (and the fresh one in the reloading hand) along its length.
//
// Skins swap the gun's materials (not the hands', not the attachments') for a painted
// one: a tiling pattern instead of the detail map, the part's own shade kept a little so
// the details still read, and a highlight for the metallic finishes.
import * as THREE from 'three';
import { ModelBuilder } from './builder.js';
import { BODY_PIVOT } from './kit.js';

const BLACK = [0.17, 0.17, 0.18], DARK = [0.25, 0.25, 0.26], BORE = [0.03, 0.03, 0.03];
const DEG = Math.PI / 180;

// ------------------------------------------------------------------ measuring
/** Vertex arrays of the meshes drawn directly on these nodes (node-local). */
function vertsOf(nodes) {
  const out = [];
  for (const n of nodes) {
    if (!n) continue;
    for (const c of n.children) if (c.isMesh && !c.userData.att && c.geometry?.attributes?.position) out.push(c.geometry.attributes.position.array);
  }
  return out;
}
function scan(arrs, test, f) {
  for (const a of arrs) for (let i = 0; i < a.length; i += 3) if (test(a[i], a[i + 1], a[i + 2])) f(a[i], a[i + 1], a[i + 2]);
}
// every triangle's bounds (the geometry is plain triangle soup): f(xmin, xmax, ymin, ymax, zmin, zmax)
function scanTris(arrs, f) {
  for (const a of arrs) {
    for (let i = 0; i + 8 < a.length; i += 9) {
      const x0 = a[i], x1 = a[i + 3], x2 = a[i + 6], y0 = a[i + 1], y1 = a[i + 4], y2 = a[i + 7], z0 = a[i + 2], z1 = a[i + 5], z2 = a[i + 8];
      f(Math.min(x0, x1, x2), Math.max(x0, x1, x2), Math.min(y0, y1, y2), Math.max(y0, y1, y2), Math.min(z0, z1, z2), Math.max(z0, z1, z2));
    }
  }
}

/** Where things go on this gun (gun-node frame), or null if it has no measurable gun. */
export function measure(vm) {
  const gun = vm.nodes.gun;
  const mk = vm.nodes[vm.spec.muzzle || 'muzzle'];
  if (!gun || !mk || mk.parent !== gun) return null;
  const M = mk.userData.rest?.p || [mk.position.x, mk.position.y, mk.position.z];
  const slide = vm.nodes.slide && vm.nodes.slide.parent === gun ? vm.nodes.slide : null;
  const arrs = vertsOf([gun, slide]);
  if (!arrs.length) return null;
  const pistol = /glock|usp|p228|deagle|fiveseven/.test(vm.weaponId);
  // barrel tip: the most forward point close to the bore
  let tip = Infinity, rb = 0.2;
  const nearBore = (x, y) => Math.hypot(x - M[0], y - M[1]) < 0.85;
  scan(arrs, (x, y) => nearBore(x, y), (x, y, z) => { if (z < tip) tip = z; });
  if (!Number.isFinite(tip)) tip = M[2];
  scan(arrs, (x, y, z) => z < tip + 0.7 && nearBore(x, y), (x, y) => { rb = Math.max(rb, Math.hypot(x - M[0], y - M[1])); });
  // surfaces over a stretch of the gun (triangles overlapping the band, not just corners:
  // a long box only has vertices at its ends)
  const top = (z0, z1, xr = 0.7) => { let v = -Infinity; scanTris(arrs, (xa, xb, ya, yb, za, zb) => { if (zb >= z0 && za <= z1 && xb >= M[0] - xr && xa <= M[0] + xr && yb > v) v = yb; }); return v; };
  const bottom = (z0, z1, xr = 0.9, yMin = -Infinity) => { let v = Infinity; scanTris(arrs, (xa, xb, ya, yb, za, zb) => { if (zb >= z0 && za <= z1 && xb >= M[0] - xr && xa <= M[0] + xr && ya > yMin && ya < v) v = ya; }); return v; };
  const side = (z0, z1, y0, y1) => { let v = -Infinity; scanTris(arrs, (xa, xb, ya, yb, za, zb) => { if (zb >= z0 && za <= z1 && yb >= y0 && ya <= y1 && xb > v) v = xb; }); return v; };
  const lh = vm.nodes.lhand && vm.nodes.lhand.parent === gun ? vm.nodes.lhand.userData.rest?.p : null;
  const O = OVERRIDE[vm.weaponId] || {};

  // red dot: on top, a little ahead of the grip (pistols: middle of the slide)
  const oz = O.opticZ ?? (pistol ? M[2] * 0.4 : Math.max(-3.2, Math.min(-1.2, M[2] * 0.12)));
  const oy = O.opticY ?? top(oz - 1.3, oz + 1.3);
  // laser: halfway between the support hand and the muzzle, on the right (pistols: under the frame)
  let lz = O.laserZ ?? (lh && !pistol ? (lh[2] + tip) / 2 : M[2] * 0.55);
  lz = Math.max(lz, tip + 1.6);
  let laser;
  if (pistol) {
    const yb = bottom(lz - 0.7, lz + 0.7, 0.6, M[1] - 3);
    laser = { p: [M[0], Math.min(Number.isFinite(yb) ? yb : M[1] - 1, M[1] - 0.6) - 0.32, lz], under: true };
  } else {
    const xs = side(lz - 1.0, lz + 1.0, M[1] - 1.0, M[1] + 1.0);
    laser = { p: [(Number.isFinite(xs) ? xs : M[0] + 0.8) + 0.3, M[1] - 0.15, lz], under: false };
  }
  if (O.laser) laser.p = O.laser;
  // foregrip: under the handguard, just ahead of the support hand
  let grip = null;
  if (lh && !pistol) {
    let gz = O.gripZ ?? lh[2] - 4.5;
    gz = Math.max(gz, tip + 3.2);
    const yb = bottom(gz - 0.6, gz + 0.6, 0.9, M[1] - 3.5);
    grip = { p: [M[0], Number.isFinite(yb) ? yb : M[1] - 1.2, gz] };
  }
  return { M, tip, rb: Math.min(rb, 0.75), pistol, optic: Number.isFinite(oy) ? { p: [M[0], oy, oz] } : null, laser, grip, lh };
}

// hand-tuned spots where the measuring gets it wrong
const OVERRIDE = {
  m4a1: { opticZ: -1.0 }, // on the carry handle, clear of the rear sight
};

// ------------------------------------------------------------------ parts
function drawParts(pen, m, att) {
  const [mx, my] = m.M;
  const fTip = -m.tip; // forward coordinate of the barrel tip
  const out = { muzzleTo: null, lens: null, emitter: null };
  if (att.muzzle === 'suppressor') {
    const L = m.pistol ? 4.6 : 6.4, r = m.pistol ? 0.58 : Math.max(0.6, Math.min(0.92, m.rb * 1.75));
    const f0 = fTip - 0.7;
    pen.tube('metal', DARK, f0, f0 + 0.5, my, r * 0.86, r * 0.95, { x: mx, n: 12 });
    pen.tube('metal', BLACK, f0 + 0.5, f0 + L - 0.4, my, r, r, { x: mx, n: 12 });
    pen.tube('metal', DARK, f0 + L - 0.4, f0 + L, my, r * 0.98, r * 0.85, { x: mx, n: 12 });
    pen.tube('metal', BORE, f0 + L, f0 + L + 0.02, my, m.rb * 0.55, m.rb * 0.55, { x: mx, n: 8 });
    // knurled grip ring
    pen.tube('knurl', DARK, f0 + 0.9, f0 + 1.6, my, r * 1.03, r * 1.03, { x: mx, n: 12 });
    out.muzzleTo = -(f0 + L + 0.3);
  } else if (att.muzzle === 'compensator') {
    const r = m.pistol ? 0.5 : Math.max(0.42, m.rb * 1.3), L = m.pistol ? 1.5 : 2.3, f0 = fTip - 0.3;
    pen.tube('metal', BLACK, f0, f0 + L, my, r, r, { x: mx, n: 6, a0: 30 });
    // gas ports along the top
    for (let i = 0; i < 3; i++) pen.span('metal', BORE, f0 + 0.35 + i * (L - 0.6) / 2.4, f0 + 0.6 + i * (L - 0.6) / 2.4, my + r * 0.78, my + r * 0.9, r * 0.9, { x: mx });
    pen.tube('metal', BORE, f0 + L, f0 + L + 0.02, my, m.rb * 0.5, m.rb * 0.5, { x: mx, n: 6 });
    out.muzzleTo = -(f0 + L + 0.3);
  }
  if (att.optic === 'reddot' && m.optic) {
    const [x, y, z] = m.optic.p, f = -z;
    const W = m.pistol ? 0.95 : 1.25, H = m.pistol ? 0.9 : 1.15;
    // rail base + mount
    pen.span('metal', BLACK, f - 1.1, f + 1.1, y - 0.05, y + 0.28, W * 0.8, { x });
    pen.span('metal', DARK, f - 0.7, f + 0.6, y + 0.28, y + 0.45, W * 0.95, { x });
    // the window frame (open front and back)
    const y0 = y + 0.45, y1 = y0 + H, t = 0.16;
    pen.span('metal', BLACK, f - 0.45, f + 0.45, y0, y0 + t, W, { x });
    pen.span('metal', BLACK, f - 0.45, f + 0.45, y1 - t, y1, W, { x });
    pen.span('metal', BLACK, f - 0.45, f + 0.45, y0, y1, t, { x: x - W / 2 + t / 2 });
    pen.span('metal', BLACK, f - 0.45, f + 0.45, y0, y1, t, { x: x + W / 2 - t / 2 });
    // brightness knob on the side
    pen.cyl('knurl', DARK, 0.22, 0.22, 0.2, { n: 8, p: [x + W / 2, y0 + H * 0.45, z], r: [0, -90, 0] });
    out.lens = { p: [x, (y0 + y1) / 2, z], w: W - 2 * t, h: H - 2 * t };
  }
  if (att.laser === 'laser') {
    const [x, y, z] = m.laser.p, f = -z;
    if (m.laser.under) {
      pen.span('polymer', BLACK, f - 1.2, f + 1.0, y - 0.32, y + 0.3, 0.62, { x });
      pen.span('metal', DARK, f - 0.5, f + 0.5, y + 0.3, y + 0.42, 0.5, { x });
    } else {
      pen.span('polymer', BLACK, f - 1.2, f + 1.2, y - 0.3, y + 0.3, 0.56, { x });
      pen.span('metal', DARK, f - 0.5, f + 0.5, y - 0.18, y + 0.18, 0.24, { x: x - 0.36 }); // rail clamp
      pen.cyl('metal', DARK, 0.1, 0.1, 0.16, { n: 6, p: [x + 0.28, y + 0.12, z + 0.5], r: [0, -90, 0] }); // switch
    }
    pen.tube('metal', [0.6, 0.06, 0.04], f + 1.0, f + 1.22, y, 0.17, 0.17, { x, n: 8 });
    out.emitter = [x, y, z - 1.25];
  }
  if (att.grip === 'foregrip' && m.grip) {
    const [x, y, z] = m.grip.p, f = -z;
    pen.span('metal', BLACK, f - 0.8, f + 0.8, y - 0.32, y + 0.05, 0.8, { x });
    // the grip itself: a slightly raked ribbed post
    pen.cyl('ribbed', DARK, 0.48, 0.42, 3.3, { n: 10, p: [x, y - 0.3, z], r: [-78, 0, 0] });
    pen.cyl('metal', BLACK, 0.44, 0.38, 0.2, { n: 10, p: [x, y - 3.5, z - 0.7], r: [-78, 0, 0] });
  }
  return out;
}

/** Remove whatever applyLoadout put on vm. */
export function clearLoadout(vm) {
  const L = vm._loadout;
  if (!L) return;
  for (const o of L.objects) o.removeFromParent();
  for (const g of L.geometries) g.dispose();
  for (const m of L.materials) m.dispose();
  for (const [node, s] of L.scaled) node.scale.copy(s);
  for (const [mesh, mat] of L.swapped) mesh.material = mat;
  if (L.muzzle) L.muzzle.node.position.z = L.muzzle.z;
  vm._loadout = null;
  vm.adsPose = null;
  vm.laserEmitter = null;
}

/** Put the attachments `att` ({ slot: id }) and the skin on vm. */
export function applyLoadout(vm, att = {}, skin = null) {
  clearLoadout(vm);
  const L = { objects: [], geometries: [], materials: [], scaled: [], swapped: [], muzzle: null };
  vm._loadout = L;
  const m = Object.keys(att).length ? measure(vm) : null;
  if (m) {
    const mb = new ModelBuilder();
    mb.node('att', 'root');
    const info = drawParts(mb.pen('att'), m, att);
    const built = mb.build(vm.shared);
    const node = built.nodes.att;
    node.traverse((o) => { o.userData.att = true; });
    if (node.children.length) {
      vm.nodes.gun.add(node);
      L.objects.push(node);
    }
    L.geometries.push(...built.geometries);
    L.materials.push(...built.materials);
    // the flash (and smoke) come out of the end of the muzzle device
    const mk = vm.nodes[vm.spec.muzzle || 'muzzle'];
    if (info.muzzleTo != null && mk) { L.muzzle = { node: mk, z: mk.position.z }; mk.position.z = Math.min(mk.position.z, info.muzzleTo); }
    // the red dot itself and the glass
    if (info.lens) {
      const { p, w, h } = info.lens;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x5a7aa0, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      glass.position.set(p[0], p[1], p[2]);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      dot.position.set(p[0], p[1], p[2] + 0.02);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.copy(dot.position);
      for (const o of [glass, dot, halo]) {
        o.userData.att = true; o.frustumCulled = false; o.renderOrder = 2;
        vm.nodes.gun.add(o); L.objects.push(o); L.geometries.push(o.geometry); L.materials.push(o.material);
      }
      vm.adsPose = adsPose(vm, p);
    }
    if (info.emitter) {
      vm.laserEmitter = info.emitter;
      const beam = laserBeam();
      vm.object3D.add(beam);
      L.objects.push(beam); L.geometries.push(beam.geometry); L.materials.push(beam.material);
      vm.laserBeam = beam;
    } else vm.laserBeam = null;
  }
  // extended magazine: the magazine grows along its length
  if (att.mag === 'extmag') {
    for (const name of ['mag', 'mag_new']) {
      const n = vm.nodes[name];
      if (!n) continue;
      const b = new THREE.Box3();
      for (const c of n.children) if (c.isMesh) { c.geometry.computeBoundingBox(); b.union(c.geometry.boundingBox); }
      if (b.isEmpty()) continue;
      const sz = b.getSize(new THREE.Vector3());
      L.scaled.push([n, n.scale.clone()]);
      if (sz.y >= sz.z) n.scale.y *= 1.4; else n.scale.z *= 1.3;
    }
  }
  if (skin) paint(vm, skin, L);
}

// ------------------------------------------------------------------ aiming down the sight
/**
 * Rig pose (body frame) that puts the red dot's lens on the line of sight with the gun
 * level: { p, q, restP, restQ } (see ViewModel.applyAds).
 */
function adsPose(vm, lens) {
  const rig = vm.nodes.rig, rest = rig.userData.rest;
  const s = rig.scale.x;
  const restP = new THREE.Vector3(...rest.p);
  const restQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(rest.r[0] * DEG, rest.r[1] * DEG, rest.r[2] * DEG, 'YXZ'));
  // lens 16 units ahead of the eye, dead centre
  const p = new THREE.Vector3(-BODY_PIVOT[0] - s * lens[0], -BODY_PIVOT[1] - s * lens[1], -16 - BODY_PIVOT[2] - s * lens[2]);
  return { p, q: new THREE.Quaternion(), restP, restQ };
}

// ------------------------------------------------------------------ laser
function laserBeam() {
  // unit beam along +Z (0..1), bright at the gun, fading out; a 1-pixel line so it never
  // breaks up into dots far away
  const n = 24, pos = [], col = [];
  for (let i = 0; i <= n; i++) {
    const z = i / n, k = Math.pow(1 - z, 1.4);
    pos.push(0, 0, z);
    col.push(k, k * 0.1, k * 0.06);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  line.frustumCulled = false;
  line.renderOrder = 3;
  line.userData.att = true;
  return line;
}

// ------------------------------------------------------------------ skins
const PAINTABLE = /^vm_(metal|brushed|polymer|knurl|ribbed|ribbedH|wood|flat|blade)$/;

const skinVert = /* glsl */ `
uniform vec3 uLightDir;
uniform float uAmb;
uniform float uShade;
uniform float uUvScale;
varying vec2 vUv;
varying vec3 vTint;
varying float vIllum;
varying vec3 vN;
varying vec3 vP;
void main() {
  vec3 n = normalize(normalMatrix * normal);
  float l = clamp((dot(n, uLightDir) + 0.5) / 1.5, 0.0, 1.0);
  vIllum = uAmb + uShade * (1.0 - l);
  vTint = color;
  vN = n;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vP = mv.xyz;
  vUv = uv * uUvScale;
  gl_Position = projectionMatrix * mv;
}`;
const skinFrag = /* glsl */ `
uniform sampler2D map;
uniform vec3 uLight;
uniform vec3 uLightDir;
uniform float uKeep;
uniform float uSpec;
uniform float uShin;
uniform vec3 uSpecCol;
uniform float uGlow;
varying vec2 vUv;
varying vec3 vTint;
varying float vIllum;
varying vec3 vN;
varying vec3 vP;
void main() {
  vec3 t = texture2D(map, vUv).rgb;
  float lum = dot(vTint, vec3(0.3333));
  // keep some of the part's own shade (bores stay black)
  float keep = lum < 0.1 ? lum * 6.0 : clamp(0.5 + lum * 0.7, 0.5, 1.1);
  vec3 col = t * mix(1.0, keep, uKeep) * vIllum * uLight;
  vec3 h = normalize(-uLightDir + normalize(-vP));
  col += uSpecCol * pow(max(dot(normalize(vN), h), 0.0), uShin) * uSpec * uLight * step(0.1, lum);
  // saturated parts of a glowing pattern ignore the light
  float sat = max(t.r, max(t.g, t.b)) - min(t.r, min(t.g, t.b));
  col = mix(col, t * 1.25, uGlow * smoothstep(0.45, 0.75, sat));
  gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
}`;

// finish: unit (units per repeat), keep, spec, shininess, spec colour, glow
const FINISH = {
  gold: { unit: 6, keep: 0.55, spec: 0.85, shin: 16, specCol: [1, 0.86, 0.5] },
  carbon: { unit: 2.5, keep: 0.25, spec: 0.45, shin: 40, specCol: [0.8, 0.85, 0.9] },
  desert: { unit: 14, keep: 0.4, spec: 0.05, shin: 8, specCol: [1, 1, 1] },
  woodland: { unit: 14, keep: 0.4, spec: 0.05, shin: 8, specCol: [1, 1, 1] },
  arctic: { unit: 14, keep: 0.4, spec: 0.06, shin: 8, specCol: [1, 1, 1] },
  digital: { unit: 10, keep: 0.4, spec: 0.08, shin: 10, specCol: [1, 1, 1] },
  crimson: { unit: 9, keep: 0.35, spec: 0.25, shin: 24, specCol: [1, 0.7, 0.7] },
  neon: { unit: 9, keep: 0.3, spec: 0.3, shin: 30, specCol: [0.7, 0.9, 1], glow: 1 },
};

const texCache = new Map();
function skinTexture(id) {
  if (texCache.has(id)) return texCache.get(id);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  SKIN_PAINT[id]?.(g, 256, rng(id.length * 977 + id.charCodeAt(0)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  texCache.set(id, t);
  return t;
}

function skinMaterial(id, shared) {
  const F = FINISH[id];
  return new THREE.ShaderMaterial({
    name: `vmskin_${id}`,
    uniforms: {
      map: { value: skinTexture(id) },
      uUvScale: { value: 1 / F.unit },
      uLight: shared.uLight, uLightDir: shared.uLightDir, uAmb: shared.uAmb, uShade: shared.uShade,
      uKeep: { value: F.keep }, uSpec: { value: F.spec }, uShin: { value: F.shin },
      uSpecCol: { value: new THREE.Vector3(...F.specCol) }, uGlow: { value: F.glow || 0 },
    },
    vertexShader: skinVert,
    fragmentShader: skinFrag,
    vertexColors: true,
    fog: false,
    lights: false,
  });
}

function paint(vm, id, L) {
  if (!FINISH[id]) return;
  const mat = skinMaterial(id, vm.shared);
  L.materials.push(mat);
  const hands = new Set(['lhand', 'rhand', 'lfore', 'rfore']);
  vm.object3D.traverse((o) => {
    if (!o.isMesh || o.userData.att || !PAINTABLE.test(o.material?.name || '')) return;
    // not the arms (their meshes hang off the hand / forearm nodes) - but the fresh
    // magazine riding in the reloading hand is part of the gun
    for (let p = o.parent; p; p = p.parent) {
      if (p.name.startsWith('mag')) break;
      if (hands.has(p.name) || p.userData.arm) return;
    }
    L.swapped.push([o, o.material]);
    o.material = mat;
  });
}

/** Draw a w x h swatch of skin `id` (buy menu preview). */
export function paintSkinSwatch(g, id, w, h) {
  const t = skinTexture(id);
  const pat = g.createPattern(t.image, 'repeat');
  if (!pat) return;
  g.fillStyle = pat;
  g.fillRect(0, 0, w, h);
  // a little sheen across it
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, 'rgba(255,255,255,0.18)'); grd.addColorStop(0.45, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
}

// ------------------------------------------------------------------ skin patterns
function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
// draw f at (x, y) and its wrapped copies so the pattern tiles
function wrap(n, x, y, r, f) {
  for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
    if (x + ox + r < 0 || x + ox - r > n || y + oy + r < 0 || y + oy - r > n) continue;
    f(x + ox, y + oy);
  }
}
function blob(g, n, x, y, r, rnd) {
  const pts = [];
  const k = 7 + Math.floor(rnd() * 4);
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2;
    const rr = r * (0.55 + rnd() * 0.7);
    pts.push([Math.cos(a) * rr * (1.3 + rnd() * 0.4), Math.sin(a) * rr]);
  }
  wrap(n, x, y, r * 2.2, (cx, cy) => {
    g.beginPath();
    for (let i = 0; i <= k; i++) {
      const p = pts[i % k], q = pts[(i + 1) % k];
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if (i === 0) g.moveTo(cx + mx, cy + my);
      else g.quadraticCurveTo(cx + p[0], cy + p[1], cx + mx, cy + my);
    }
    g.fill();
  });
}
function grain(g, n, rnd, amt, count = 2500) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${amt * rnd()})` : `rgba(255,255,255,${amt * 0.7 * rnd()})`;
    g.fillRect(Math.floor(rnd() * n), Math.floor(rnd() * n), 1 + Math.floor(rnd() * 2), 1);
  }
}
function camo(g, n, rnd, base, layers) {
  g.fillStyle = base; g.fillRect(0, 0, n, n);
  for (const [color, count, r] of layers) {
    g.fillStyle = color;
    for (let i = 0; i < count; i++) blob(g, n, rnd() * n, rnd() * n, r * (0.6 + rnd() * 0.8), rnd);
  }
  grain(g, n, rnd, 0.08);
}

const SKIN_PAINT = {
  gold(g, n, rnd) {
    const grd = g.createLinearGradient(0, 0, n, n);
    grd.addColorStop(0, '#e2b84a'); grd.addColorStop(0.5, '#f4d27a'); grd.addColorStop(1, '#d0a038');
    g.fillStyle = grd; g.fillRect(0, 0, n, n);
    // brushed streaks along the gun
    for (let i = 0; i < 260; i++) {
      const y = rnd() * n, l = n * (0.2 + rnd() * 0.6), x = rnd() * n;
      g.strokeStyle = rnd() < 0.5 ? `rgba(120,80,10,${0.05 + rnd() * 0.08})` : `rgba(255,240,190,${0.05 + rnd() * 0.1})`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y); g.stroke();
      g.beginPath(); g.moveTo(x - n, y); g.lineTo(x - n + l, y); g.stroke();
    }
  },
  carbon(g, n) {
    // 2x2 twill: cells alternate warp / weft with a sheen across each tow
    const c = 16;
    for (let y = 0; y < n; y += c) {
      for (let x = 0; x < n; x += c) {
        const k = ((x / c) + Math.floor(y / c / 2) * 2 + Math.floor(y / c)) % 4 < 2;
        const grd = k ? g.createLinearGradient(x, y, x, y + c) : g.createLinearGradient(x, y, x + c, y);
        grd.addColorStop(0, '#141518'); grd.addColorStop(0.5, k ? '#3a3d44' : '#2b2e34'); grd.addColorStop(1, '#141518');
        g.fillStyle = grd; g.fillRect(x, y, c, c);
      }
    }
  },
  desert(g, n, rnd) { camo(g, n, rnd, '#cdb48c', [['#a98a5c', 9, 30], ['#8b6c45', 7, 22], ['#e3d3ae', 6, 18]]); },
  woodland(g, n, rnd) { camo(g, n, rnd, '#5d6e3c', [['#7e8c4c', 7, 30], ['#4a3a24', 8, 26], ['#1f2019', 7, 18]]); },
  arctic(g, n, rnd) { camo(g, n, rnd, '#dfe3e6', [['#b1b7bd', 8, 30], ['#787e85', 6, 20], ['#fafbfc', 5, 16]]); },
  digital(g, n, rnd) {
    const pal = ['#56687a', '#3c4857', '#8696a6', '#262c34'];
    const c = 8, cells = n / c;
    // clustered noise: a coarse field decides the colour, single pixels jitter it
    const coarse = Array.from({ length: 8 * 8 }, () => rnd());
    const at = (x, y) => coarse[((Math.floor(y / 4) % 8) * 8) + (Math.floor(x / 4) % 8)];
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
      const v = at(x, y) * 0.75 + rnd() * 0.25;
      g.fillStyle = pal[Math.min(3, Math.floor(v * 4))];
      g.fillRect(x * c, y * c, c, c);
    }
  },
  crimson(g, n, rnd) {
    g.fillStyle = '#7d0d12'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '40,0,0' : '170,20,30'},${0.12 + rnd() * 0.12})`; blob(g, n, rnd() * n, rnd() * n, 14 + rnd() * 20, rnd); }
    // a web: spokes and sagging rings around two centres
    g.strokeStyle = 'rgba(8,0,0,0.9)'; g.lineWidth = 1.6;
    for (const [cx, cy] of [[n * 0.3, n * 0.35], [n * 0.78, n * 0.8]]) {
      const spokes = 10;
      wrap(n, cx, cy, n * 0.6, (x, y) => {
        for (let i = 0; i < spokes; i++) {
          const a = (i / spokes) * Math.PI * 2;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * n * 0.55, y + Math.sin(a) * n * 0.55); g.stroke();
        }
        for (let r = 12; r < n * 0.55; r += 14) {
          g.beginPath();
          for (let i = 0; i <= spokes; i++) {
            const a0 = (i / spokes) * Math.PI * 2, a1 = ((i + 1) / spokes) * Math.PI * 2, am = (a0 + a1) / 2;
            const px = x + Math.cos(a0) * r, py = y + Math.sin(a0) * r;
            if (i === 0) g.moveTo(px, py);
            if (i < spokes) g.quadraticCurveTo(x + Math.cos(am) * r * 0.86, y + Math.sin(am) * r * 0.86, x + Math.cos(a1) * r, y + Math.sin(a1) * r);
          }
          g.stroke();
        }
      });
    }
  },
  neon(g, n, rnd) {
    g.fillStyle = '#0d0d12'; g.fillRect(0, 0, n, n);
    grain(g, n, rnd, 0.05, 1200);
    g.lineCap = 'round';
    const stripe = (color, w, off) => {
      g.strokeStyle = color; g.lineWidth = w; g.shadowColor = color; g.shadowBlur = 10;
      for (let k = -1; k <= 1; k++) {
        g.beginPath();
        g.moveTo(-20 + k * n + off, n + 20); g.lineTo(n * 0.45 + k * n + off, n * 0.5); g.lineTo(n + 20 + k * n + off, -20);
        g.stroke();
      }
    };
    stripe('#18f0ff', 7, 0);
    stripe('#ff2bd6', 4, 60);
    stripe('#18f0ff', 2, 110);
    g.shadowBlur = 0;
  },
};
