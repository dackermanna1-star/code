// Extra meshes bolted onto the zombie bosses' bones: the Butcher's cleaver, the
// Spitter's acid sacs, the Banshee's claws, the Inferno's horns, the Abomination's
// riot-armour plates and glowing core. Lit parts use the body's light uniforms; the
// glowing parts are unlit and additive. Positions are bone-local (= model space at the
// bind pose, offset from the bone's bind position; see rig.js BONE_DEFS).
import * as THREE from 'three';
import { createGsMaterial, canvasTexture } from './gslight.js';
import { BONE_DEFS } from './rig.js';

const BIND = Object.fromEntries(BONE_DEFS.map(([n, , p]) => [n, p]));
const DEG = Math.PI / 180;

const texCache = new Map();
function solidTex(hex, noise = 0.12) {
  const key = hex + noise;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = hex;
  g.fillRect(0, 0, 16, 16);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${noise})` : `rgba(255,255,255,${noise * 0.6})`;
    g.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 2, 2);
  }
  const t = canvasTexture(c);
  texCache.set(key, t);
  return t;
}

/**
 * Attach the boss parts for `skin` to `model` (a PlayerModel). Returns
 * { meshes, glows: [{ mesh, base }], dispose() } or null for skins without extras.
 */
export function buildExtras(model, skin) {
  const spec = EXTRAS[skin];
  if (!spec) return null;
  const out = { meshes: [], glows: [], materials: [], geometries: [] };
  const lit = (hex, noise) => {
    const m = createGsMaterial(solidTex(hex, noise), model.light);
    m.userData.hex = hex; // (a baked corpse keeps the part in this colour)
    out.materials.push(m);
    return m;
  };
  const glow = (hex, opacity = 1) => {
    const m = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    out.materials.push(m);
    return m;
  };
  // put a mesh on a bone at model-space bind position `at` (rotation in degrees, XYZ)
  const put = (bone, geo, mat, at, rot = [0, 0, 0], scale = null) => {
    out.geometries.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    const b = BIND[bone];
    mesh.position.set(at[0] - b[0], at[1] - b[1], at[2] - b[2]);
    mesh.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
    if (scale) mesh.scale.set(...scale);
    mesh.frustumCulled = false;
    model.bones[model.rig.b[bone].i].add(mesh);
    out.meshes.push(mesh);
    if (mat.blending === THREE.AdditiveBlending) out.glows.push({ mesh, base: mat.opacity });
    return mesh;
  };
  const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  const ball = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
  const cone = (r, h, n = 5) => new THREE.ConeGeometry(r, h, n);
  spec({ put, box, ball, cone, lit, glow });
  out.dispose = () => {
    for (const m of out.meshes) m.removeFromParent();
    for (const m of out.materials) m.dispose();
    for (const g of out.geometries) g.dispose();
  };
  return out;
}

const EXTRAS = {
  // special infected: the Boomer's gut and boils, the Charger's bone spur, the Hunter's
  // hood, the Smoker's tumours
  boomer({ put, ball, lit }) {
    const fat = lit('#c0b87e', 0.12), boil = lit('#a49c48', 0.2);
    put('spine', ball(7.5, 10, 8), fat, [6.0, 0, 43], [0, 0, 0], [0.9, 1.15, 1.0]);
    for (const [b, at, r] of [['chest', [9.5, -4, 52], 1.3], ['chest', [8.5, 5, 55], 1.0], ['spine', [12.5, 2, 44], 1.4], ['spine', [11, -5, 40], 1.1], ['upperarm_r', [0, -11, 55], 1.0], ['upperarm_l', [0, 11, 57], 0.9], ['head', [2, -3.5, 69], 0.9]]) put(b, ball(r, 6, 5), boil, at);
  },
  charger({ put, cone, lit }) {
    const bone = lit('#d8d0b8', 0.15);
    put('forearm_r', cone(1.1, 6, 5), bone, [1.5, -10.5, 42], [0, 0, -100]);
    put('hand_r', cone(0.8, 4, 5), bone, [1.0, -9.5, 30], [180, 0, 0]);
  },
  hunter({ put, ball, lit }) {
    const hood = lit('#3a3e46', 0.12);
    put('head', new THREE.SphereGeometry(5.6, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), hood, [-0.4, 0, 69.2], [0, -90, -18], [1.0, 1.0, 1.08]);
    void ball;
  },
  smoker({ put, ball, lit }) {
    const t = lit('#9a6a58', 0.2);
    for (const [b, at, r] of [['head', [1.5, -4.6, 66], 1.6], ['head', [0.5, -4.2, 68.5], 1.2], ['neck', [0, -4.5, 62], 1.5], ['chest', [0, -8.5, 60], 2.0], ['chest', [2, -7, 58], 1.4], ['upperarm_r', [0, -11.5, 57], 1.5]]) put(b, ball(r, 6, 5), t, at);
  },
  // a big meat cleaver in the right fist (the hand bone points down the fingers, -Z)
  butcher({ put, box, lit }) {
    const steel = lit('#9a9ea4', 0.2), handle = lit('#3a2414'), rust = lit('#6a2a1a', 0.25);
    // handle out of the fist along the fingers (-Z), blade hanging on the palm side (+Y)
    put('hand_r', box(1.4, 1.4, 6), handle, [0.4, -8, 26.5]);
    put('hand_r', box(0.6, 7, 13), steel, [0.4, -4.8, 17.5]);
    put('hand_r', box(0.7, 1.6, 13), rust, [0.4, -1.6, 17.5]); // bloody edge
    // meat hooks hanging off the apron strings
    const hook = lit('#7a7a74', 0.2);
    for (const y of [-6.5, 6.5]) put('pelvis', box(0.5, 0.5, 5), hook, [3, y, 38], [0, 0, 0]);
  },
  // acid sacs bulging on the back and shoulders
  spitter({ put, ball, lit, glow }) {
    const sac = lit('#7a9a28', 0.2);
    put('chest', ball(4.2), sac, [-7.5, -2.5, 53], [0, 0, 0], [0.8, 1, 1.1]);
    put('chest', ball(3.4), sac, [-7.0, 3.5, 55.5]);
    put('spine', ball(3.0), sac, [-7.0, 0, 46]);
    put('upperarm_r', ball(2.4), sac, [-1.5, -10.5, 55]);
    put('upperarm_l', ball(2.0), sac, [1.0, 10.5, 52]);
    put('chest', ball(5.0, 8, 6), glow('#60ff20', 0.35), [-7.5, -2.5, 53]);
    put('chest', ball(4.0, 8, 6), glow('#60ff20', 0.3), [-7.0, 3.5, 55.5]);
  },
  // long black claws
  banshee({ put, cone, lit }) {
    const nail = lit('#141418', 0.1);
    for (const [bone, y] of [['hand_r', -8], ['hand_l', 8]]) {
      for (let i = 0; i < 4; i++) put(bone, cone(0.35, 6.5, 4), nail, [-0.9 + i * 0.75, y, 25.2], [180, 0, 0]);
    }
  },
  // charred horns
  inferno({ put, cone, lit, glow }) {
    const horn = lit('#1a1410', 0.15);
    put('head', cone(1.0, 6, 5), horn, [0.5, -3.0, 72.0], [-25, 0, 0]);
    put('head', cone(1.0, 6, 5), horn, [0.5, 3.0, 72.0], [25, 0, 0]);
    put('chest', new THREE.SphereGeometry(3.4, 8, 6), glow('#ff6a10', 0.45), [5.2, 0, 50.5]);
  },
  // riot armour: chest and back plates, shoulder pads with spikes, a helmet, a glowing core
  abomination({ put, box, cone, ball, lit, glow }) {
    const plate = lit('#3c4044', 0.18), dark = lit('#24272a', 0.15), spike = lit('#8a8c90', 0.2);
    put('chest', box(3, 20, 13), plate, [13.0, 0, 54], [0, -10, 0]);
    put('chest', box(3, 20, 13), plate, [-10.6, 0, 54], [0, 10, 0]);
    for (const s of [-1, 1]) {
      const b = s < 0 ? 'upperarm_r' : 'upperarm_l';
      put(b, box(11, 10, 3.4), dark, [0, 11.5 * s, 62.6], [-22 * s, 0, 0]);
      for (let i = 0; i < 3; i++) put(b, cone(0.9, 5, 4), spike, [-3.5 + i * 3.5, 13.5 * s, 65.2], [-30 * s, 0, 0]);
    }
    put('head', box(10, 9.6, 8.2), dark, [0.6, 0, 68.6]);
    put('head', box(0.6, 7, 0.9), glow('#ff2010', 0.9), [5.7, 0, 67.3]); // visor slit
    put('chest', ball(2.2), glow('#ff3018', 1), [14.8, 0, 52]); // core
    put('chest', ball(4.0), glow('#ff2010', 0.35), [14.8, 0, 52]);
  },
};
