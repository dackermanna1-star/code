// The weapons' 3D models: The Desert Strike guns (warzone/guns.js) plus the
// ones Vice City adds (a micro SMG, a rocket launcher, a switchblade, a bat,
// brass knuckles, a grenade, a molotov and the rocket itself), all merged into
// one mesh per material and cached, so a gun in anyone's hand costs a few
// draw calls and no new geometry.
//
//   gunModel(id) -> Group         a new instance (shared geometry and materials), in studs, in "gun space":
//                                 barrel/blade along -Z, up +Y, the grip (right hand) at the origin.
//                                 userData: { muzzle, leftHand, eject (Vector3, gun space), twoHand, length }
//   handModel(id) -> Group         the same, turned for the engine's CharacterModel rightGrip (the arm hangs along -Y)
//   rocketModel() -> Mesh          the rocket in flight (nose along -Z)
//   weaponIcon(id, renderer) -> dataURL   a side-view silhouette (rendered once, cached), or null
//   MODEL_SCALE                    metres -> studs for the guns (the avatar's hands are 1 stud wide)
import * as THREE from 'three';
import { buildGun, GUNS, gunMaterials } from '../../warzone/guns.js';
import { WEAPONS } from './data.js';

export const MODEL_SCALE = 4.2;
// (handguns would vanish inside a ROBLOX fist at true scale: they're drawn bigger)
const EXTRA = { glock: 1.35, deagle: 1.25, uzi: 1.3, knife: 1.3, knuckles: 1.25, grenade: 1.5, molotov: 1.3 };
const Vec = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- Vice City's own models (metres, barrel along -Z, grip at the origin) -------------------------------------------------------
function add(g, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m;
}
const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
/** A cylinder along Z. */
const cz = (r1, r2, len, seg = 14) => new THREE.CylinderGeometry(r1, r2, len, seg).rotateX(Math.PI / 2);

function uzi() {
  const M = gunMaterials(), g = new THREE.Group();
  add(g, bx(0.036, 0.062, 0.25), M.darkMetal, 0, 0.034, -0.06);           // receiver
  add(g, bx(0.03, 0.012, 0.21), M.blued, 0, 0.071, -0.06);                 // top cover
  add(g, bx(0.038, 0.01, 0.06), M.blued, 0, 0.066, 0.03);                  // cocking knob ridge
  add(g, cz(0.0145, 0.0145, 0.022), M.blued, 0, 0.038, -0.19);             // barrel nut
  add(g, cz(0.0085, 0.0085, 0.06), M.metal, 0, 0.038, -0.22);              // barrel
  add(g, bx(0.03, 0.125, 0.042), M.polymer, 0, -0.05, 0.0, -0.12);         // grip (the mag goes through it)
  add(g, bx(0.023, 0.05, 0.032), M.darkMetal, 0, -0.13, 0.012, -0.12);     // the mag's floor
  add(g, bx(0.006, 0.006, 0.055), M.darkMetal, 0, -0.016, -0.04);          // trigger guard
  add(g, bx(0.005, 0.022, 0.004), M.darkMetal, 0, -0.006, -0.012, 0.3);    // trigger
  add(g, bx(0.006, 0.018, 0.006), M.blued, 0, 0.084, -0.165);              // front sight
  add(g, bx(0.02, 0.012, 0.008), M.blued, 0, 0.082, 0.05);                 // rear sight
  for (const x of [-0.021, 0.021]) add(g, bx(0.004, 0.012, 0.19), M.metal, x, 0.022, -0.02); // the folded stock's arms
  add(g, bx(0.046, 0.04, 0.008), M.metal, 0, 0.02, -0.115);                // its butt plate folded under the barrel
  return { group: g, sight: Vec(0, 0.09, 0.05), muzzle: Vec(0, 0.038, -0.255), eject: Vec(0.02, 0.05, -0.04), leftHand: Vec(-0.02, -0.07, 0.02), pistol: true };
}

function rpg() {
  const M = gunMaterials(), g = new THREE.Group();
  const olive = new THREE.MeshStandardMaterial({ color: 0x4d5a3a, roughness: 0.75, metalness: 0.1, map: M.polymer.map });
  add(g, cz(0.042, 0.042, 1.02), M.darkMetal, 0, 0.085, -0.13);            // the tube
  add(g, cz(0.052, 0.052, 0.32), M.wood, 0, 0.085, -0.06);                  // heat shield
  add(g, cz(0.07, 0.045, 0.14, 16), M.darkMetal, 0, 0.085, 0.43);           // venturi (the back flares out)
  add(g, cz(0.03, 0.03, 0.02, 16), M.rubber, 0, 0.085, 0.5);
  // the rocket sitting in the front: a fat warhead and a cone
  add(g, cz(0.068, 0.068, 0.14, 16), olive, 0, 0.085, -0.7);
  add(g, cz(0.068, 0.012, 0.2, 16), olive, 0, 0.085, -0.87);
  add(g, cz(0.006, 0.006, 0.05, 6), M.metal, 0, 0.085, -0.99);
  add(g, bx(0.03, 0.11, 0.045), M.polymer, 0, -0.025, 0.0, -0.15);          // pistol grip
  add(g, bx(0.03, 0.1, 0.04), M.polymer, 0, -0.02, -0.26, -0.15);           // front grip
  add(g, bx(0.006, 0.006, 0.05), M.darkMetal, 0, 0.005, -0.04);
  add(g, bx(0.03, 0.05, 0.12), M.darkMetal, -0.06, 0.13, -0.1);             // optic, on the left
  add(g, cz(0.016, 0.016, 0.03), M.lens, -0.06, 0.14, -0.17);
  add(g, bx(0.006, 0.03, 0.006), M.metal, 0, 0.14, -0.28);                  // iron sights
  add(g, bx(0.006, 0.03, 0.006), M.metal, 0, 0.14, 0.05);
  return { group: g, sight: Vec(0, 0.16, 0.05), muzzle: Vec(0, 0.085, -1.0), eject: Vec(0, 0.085, 0.5), leftHand: Vec(-0.01, -0.03, -0.26), launcher: true };
}

function knife() {
  const M = gunMaterials(), g = new THREE.Group();
  add(g, bx(0.022, 0.026, 0.11), M.rubber, 0, 0, 0.0);                      // handle
  add(g, bx(0.03, 0.03, 0.008), M.steel, 0, 0.0, -0.058);                    // bolster
  add(g, bx(0.004, 0.026, 0.13), M.steel, 0, 0.004, -0.125);                 // blade
  add(g, bx(0.0035, 0.018, 0.03, 0), M.steel, 0, 0.0, -0.198, 0.6);          // the point
  return { group: g, muzzle: Vec(0, 0, -0.21), leftHand: Vec(0, 0, 0) };
}

function bat() {
  const M = gunMaterials(), g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.036, 0.0145, 0.82, 14, 6);
  // a real bat's profile: thin handle, swelling into the barrel
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), t = (y + 0.41) / 0.82; const r = 0.0145 + (0.036 - 0.0145) * Math.min(1, Math.max(0, (t - 0.35) / 0.4)) ** 1.3; const k = r / Math.max(1e-4, Math.hypot(p.getX(i), p.getZ(i))); if (Math.hypot(p.getX(i), p.getZ(i)) > 1e-4) { p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
  geo.computeVertexNormals();
  geo.rotateX(-Math.PI / 2); // +Y (the fat end) -> -Z
  add(g, geo, M.wood, 0, 0, -0.33);
  add(g, cz(0.022, 0.022, 0.018), M.wood, 0, 0, 0.085);                      // knob
  add(g, cz(0.0152, 0.0152, 0.14), M.rubber, 0, 0, 0.02);                     // tape
  return { group: g, muzzle: Vec(0, 0, -0.74), leftHand: Vec(0, 0, 0.06) };
}

function knuckles() {
  const M = gunMaterials(), g = new THREE.Group();
  const ring = new THREE.TorusGeometry(0.012, 0.0045, 6, 12).rotateY(Math.PI / 2);
  for (let i = 0; i < 4; i++) add(g, ring, M.brass, -0.036 + i * 0.024, 0.0, -0.03);
  add(g, bx(0.1, 0.012, 0.012), M.brass, 0, -0.015, -0.03);
  return { group: g, muzzle: Vec(0, 0, -0.04), leftHand: Vec(0, 0, 0) };
}

function grenade() {
  const M = gunMaterials(), g = new THREE.Group();
  const olive = new THREE.MeshStandardMaterial({ color: 0x47552f, roughness: 0.6, metalness: 0.2 });
  add(g, new THREE.SphereGeometry(0.034, 12, 9).scale(1, 1.22, 1), olive, 0, 0, -0.01);
  add(g, new THREE.CylinderGeometry(0.014, 0.016, 0.022, 10), M.darkMetal, 0, 0.046, -0.01);
  add(g, bx(0.008, 0.06, 0.012), M.metal, 0.018, 0.02, -0.01, 0, 0, -0.25);  // spoon
  add(g, new THREE.TorusGeometry(0.011, 0.002, 5, 10), M.steel, -0.016, 0.058, -0.01, 0, Math.PI / 2, 0);
  return { group: g, muzzle: Vec(0, 0, 0), leftHand: Vec(0, 0, 0) };
}

function molotov() {
  const M = gunMaterials(), g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 });
  const rag = new THREE.MeshStandardMaterial({ color: 0xc9b98f, roughness: 1 });
  add(g, new THREE.CylinderGeometry(0.034, 0.034, 0.13, 12), glass, 0, 0.0, 0);
  add(g, new THREE.CylinderGeometry(0.013, 0.03, 0.04, 12), glass, 0, 0.085, 0);
  add(g, new THREE.CylinderGeometry(0.013, 0.013, 0.05, 10), glass, 0, 0.125, 0);
  add(g, bx(0.02, 0.07, 0.016), rag, 0.008, 0.165, 0.004, 0.2, 0, 0.3);
  return { group: g, muzzle: Vec(0, 0.2, 0), leftHand: Vec(0, 0, 0) };
}

const OWN = { uzi, rpg, knife, bat, knuckles, grenade, molotov };

/** The model id a weapon is drawn with (null: nothing in the hand). */
export function modelId(id) { const w = WEAPONS[id]; return w ? (w.gun || w.model || null) : (GUNS[id] || OWN[id] ? id : null); }

// ---- merging and caching -------------------------------------------------------------------------------------------------------
const CACHE = new Map(); // model id -> { parts: [{geo, mat}], muzzle, leftHand, eject, length }

function build(mid) {
  if (CACHE.has(mid)) return CACHE.get(mid);
  let info;
  if (OWN[mid]) info = OWN[mid]();
  else if (GUNS[mid]) info = buildGun(mid, []);
  else return null;
  const root = info.group;
  root.updateMatrixWorld(true);
  // one geometry per material: positions, normals and uvs, in gun space scaled to studs
  const buckets = new Map();
  const SC = MODEL_SCALE * (EXTRA[mid] || 1);
  const S = new THREE.Matrix4().makeScale(SC, SC, SC);
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3();
  root.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry) return;
    // (hidden sub-parts like the shotgun's loading shell stay out)
    let p = o.parent, vis = true; while (p && p !== root) { if (!p.visible) vis = false; p = p.parent; }
    if (!vis) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    m.multiplyMatrices(S, o.matrixWorld);
    nm.getNormalMatrix(m);
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const groups = g.groups.length && mats.length > 1 ? g.groups : [{ start: 0, count: pos.count, materialIndex: 0 }];
    for (const gr of groups) {
      const mat = mats[gr.materialIndex] || mats[0];
      let b = buckets.get(mat);
      if (!b) buckets.set(mat, (b = { p: [], n: [], u: [] }));
      const v = new THREE.Vector3();
      for (let i = gr.start; i < gr.start + gr.count && i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m); b.p.push(v.x, v.y, v.z);
        if (nor) { v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); b.n.push(v.x, v.y, v.z); } else b.n.push(0, 1, 0);
        if (uv) b.u.push(uv.getX(i), uv.getY(i)); else b.u.push(0, 0);
      }
    }
    if (g !== o.geometry) g.dispose();
  });
  const parts = [];
  for (const [mat, b] of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
    geo.computeBoundingSphere();
    geo.userData.shared = true;
    parts.push({ geo, mat });
  }
  const sc = (v) => (v ? v.clone().multiplyScalar(SC) : new THREE.Vector3());
  const box = new THREE.Box3();
  for (const p of parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
  const c = { parts, muzzle: sc(info.muzzle), leftHand: sc(info.leftHand), eject: sc(info.eject), length: box.max.z - box.min.z, box };
  CACHE.set(mid, c);
  return c;
}

/** A new instance of a weapon's model (shared geometry), in gun space, in studs. */
export function gunModel(id) {
  const mid = modelId(id) || id;
  const c = build(mid);
  const g = new THREE.Group();
  g.name = 'gun:' + mid;
  if (!c) return g;
  for (const p of c.parts) {
    const mesh = new THREE.Mesh(p.geo, p.mat);
    mesh.castShadow = true; mesh.userData.shared = true;
    g.add(mesh);
  }
  g.userData = { id, model: mid, muzzle: c.muzzle.clone(), leftHand: c.leftHand.clone(), eject: c.eject.clone(), twoHand: !!WEAPONS[id]?.twoHand, length: c.length, shared: true };
  return g;
}

/** For the engine's CharacterModel rightGrip (the arm hangs along -Y; at rest the gun points down the arm). */
export function handModel(id) {
  const gun = gunModel(id);
  const h = new THREE.Group();
  h.rotation.x = -Math.PI / 2;  // gun -Z -> grip -Y (along the arm), gun +Y -> grip -Z
  // out of the fist and on top of it (a block hand would hide a gun held at its centre)
  const mid = modelId(id) || id, melee = !!WEAPONS[id]?.melee || mid === 'grenade' || mid === 'molotov';
  if (melee) h.position.set(0, -0.15, -0.05); else h.position.set(0, -0.3, -0.42);
  h.add(gun);
  h.userData = { gun, shared: true };
  return h;
}

// ---- the rocket in flight ------------------------------------------------------------------------------------------------------
let ROCKET = null;
export function rocketModel() {
  if (!ROCKET) {
    const g = new THREE.Group();
    const olive = new THREE.MeshStandardMaterial({ color: 0x4d5a3a, roughness: 0.6, metalness: 0.2 });
    add(g, cz(0.068, 0.068, 0.14, 12), olive, 0, 0, -0.08);
    add(g, cz(0.068, 0.012, 0.2, 12), olive, 0, 0, -0.25);
    add(g, cz(0.03, 0.03, 0.4, 8), gunMaterials().darkMetal, 0, 0, 0.18);
    for (let i = 0; i < 4; i++) add(g, bx(0.004, 0.09, 0.08), gunMaterials().darkMetal, 0, 0, 0.36, 0, 0, i * Math.PI / 4);
    const geo = new THREE.BufferGeometry(); // merge (one material is enough at this size)
    const P = [], N = [];
    g.updateMatrixWorld(true);
    const S = new THREE.Matrix4().makeScale(MODEL_SCALE * 1.1, MODEL_SCALE * 1.1, MODEL_SCALE * 1.1), m = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
    g.traverse((o) => {
      if (!o.isMesh) return;
      const gg = o.geometry.toNonIndexed(); m.multiplyMatrices(S, o.matrixWorld); nm.getNormalMatrix(m);
      for (let i = 0; i < gg.attributes.position.count; i++) { v.fromBufferAttribute(gg.attributes.position, i).applyMatrix4(m); P.push(v.x, v.y, v.z); v.fromBufferAttribute(gg.attributes.normal, i).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z); }
    });
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    ROCKET = { geo, mat: olive };
  }
  const mesh = new THREE.Mesh(ROCKET.geo, ROCKET.mat);
  mesh.userData.shared = true;
  return mesh;
}

// ---- icons: side-view silhouettes rendered from the models ----------------------------------------------------------------------
const ICONS = new Map();
let iconScene = null;
export function weaponIcon(id, renderer) {
  if (ICONS.has(id)) return ICONS.get(id);
  const mid = modelId(id);
  if (!mid || !renderer) { ICONS.set(id, null); return null; }
  try {
    const c = build(mid);
    if (!iconScene) {
      iconScene = { scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 50), mat: new THREE.MeshBasicMaterial({ color: 0xffffff }), rt: new THREE.WebGLRenderTarget(192, 96) };
      iconScene.cam.position.set(10, 0, 0); iconScene.cam.lookAt(0, 0, 0); // looking at the gun's right side, barrel to the right
    }
    const I = iconScene;
    I.scene.clear();
    const g = new THREE.Group();
    for (const p of c.parts) g.add(new THREE.Mesh(p.geo, I.mat));
    // fit: the long axis is Z (shown left-right), height is Y
    const b = c.box, w = b.max.z - b.min.z, h = b.max.y - b.min.y, cx = (b.max.z + b.min.z) / 2, cy = (b.max.y + b.min.y) / 2;
    const half = Math.max(w / 2 / 2, h / 2) * 1.08; // 2:1 aspect
    I.cam.left = -half * 2; I.cam.right = half * 2; I.cam.top = half; I.cam.bottom = -half; I.cam.updateProjectionMatrix();
    g.position.set(0, -cy, -cx);
    // small things (a grenade, knuckles) shouldn't fill the whole icon
    if (Math.max(w, h * 2) < 0.9) g.scale.setScalar(0.6);
    I.scene.add(g);
    const prevRT = renderer.getRenderTarget(), prevCol = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
    renderer.setRenderTarget(I.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(I.scene, I.cam);
    const px = new Uint8Array(192 * 96 * 4);
    renderer.readRenderTargetPixels(I.rt, 0, 0, 192, 96, px);
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(prevCol, prevA);
    // to a canvas (flipped: GL rows go bottom-up), with a soft outline
    const cv = document.createElement('canvas'); cv.width = 192; cv.height = 96;
    const x = cv.getContext('2d'), img = x.createImageData(192, 96);
    for (let j = 0; j < 96; j++) for (let i = 0; i < 192; i++) {
      const s = ((95 - j) * 192 + i) * 4, d = (j * 192 + i) * 4;
      const a = px[s] > 20 ? 255 : 0;
      img.data[d] = img.data[d + 1] = img.data[d + 2] = 255; img.data[d + 3] = a;
    }
    x.putImageData(img, 0, 0);
    const url = cv.toDataURL();
    ICONS.set(id, url);
    return url;
  } catch (e) { ICONS.set(id, null); return null; }
}
