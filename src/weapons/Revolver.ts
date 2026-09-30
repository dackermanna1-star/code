import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Geo } from '../world/Builder';

/**
 * Collapse a group's childless meshes that share a material into one mesh
 * each (the gun is ~90 little parts; merged it draws in a dozen calls).
 */
function mergeByMaterial(group: THREE.Object3D) {
  const byMat = new Map<THREE.Material, THREE.Mesh[]>();
  for (const c of group.children) {
    const m = c as THREE.Mesh;
    if (!m.isMesh || m.children.length || Array.isArray(m.material) || m.userData.keep) continue;
    const list = byMat.get(m.material) ?? [];
    list.push(m);
    byMat.set(m.material, list);
  }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      return g.applyMatrix4(m.matrix);
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const one = new THREE.Mesh(merged, mat);
    one.castShadow = true;
    for (const m of list) group.remove(m);
    group.add(one);
  }
}

/**
 * A procedural double-action revolver: full-lug barrel with a vent rib and
 * a ramp front sight, a fluted six-shot cylinder on a swing-out crane, a
 * hammer and trigger that animate, and a checkered walnut grip. Built in
 * gun space: bore along -Z, +Y up, origin on the bore axis at the cylinder.
 */
export interface RevolverParts {
  root: THREE.Group;
  /** swings out to the left for reloading (rotation.z) */
  crane: THREE.Group;
  /** spins about the bore-parallel axis (rotation.z) */
  cylinder: THREE.Group;
  /** rotation.x: 0 = down, 1 rad = fully cocked */
  hammer: THREE.Group;
  trigger: THREE.Group;
  /** end of the barrel */
  muzzle: THREE.Object3D;
  /** cartridge rims in the chambers (hidden when spent) */
  rounds: THREE.Mesh[];
}

const CYL_Y = -0.013;
const CYL_R = 0.021;
const CHAMBER_R = 0.013;

let mats: Record<string, THREE.Material> | null = null;
function materials() {
  if (mats) return mats;
  const wood = document.createElement('canvas');
  wood.width = 128;
  wood.height = 256;
  const c = wood.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, '#5a2a12');
  g.addColorStop(0.5, '#7a3c1a');
  g.addColorStop(1, '#4e240f');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 256);
  // grain
  for (let i = 0; i < 70; i++) {
    c.strokeStyle = `rgba(${30 + Math.random() * 30},${12 + Math.random() * 10},4,${0.25 + Math.random() * 0.3})`;
    c.lineWidth = 0.6 + Math.random() * 1.6;
    c.beginPath();
    const x = Math.random() * 128;
    c.moveTo(x, 0);
    c.bezierCurveTo(x + (Math.random() - 0.5) * 30, 80, x + (Math.random() - 0.5) * 30, 170, x + (Math.random() - 0.5) * 20, 256);
    c.stroke();
  }
  // checkering panel
  c.strokeStyle = 'rgba(20,8,2,0.55)';
  c.lineWidth = 1;
  for (let i = -256; i < 256; i += 6) {
    c.beginPath();
    c.moveTo(18 + i, 60);
    c.lineTo(18 + i + 200, 260);
    c.stroke();
    c.beginPath();
    c.moveTo(110 - i, 60);
    c.lineTo(110 - i - 200, 260);
    c.stroke();
  }
  const woodTex = new THREE.CanvasTexture(wood);
  woodTex.colorSpace = THREE.SRGBColorSpace;
  mats = {
    blued: new THREE.MeshPhysicalMaterial({ color: 0x24272d, metalness: 1, roughness: 0.26, clearcoat: 0.45, clearcoatRoughness: 0.18, envMapIntensity: 1.6 }),
    polished: new THREE.MeshPhysicalMaterial({ color: 0x5c616b, metalness: 1, roughness: 0.16, clearcoat: 0.3, envMapIntensity: 1.8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.6, metalness: 0.4 }),
    bore: new THREE.MeshBasicMaterial({ color: 0x030303 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xcf9b45, metalness: 1, roughness: 0.24 }),
    primer: new THREE.MeshStandardMaterial({ color: 0x9da2a8, metalness: 1, roughness: 0.3 }),
    wood: new THREE.MeshPhysicalMaterial({ map: woodTex, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.22 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe0b34a, metalness: 1, roughness: 0.2 }),
    sight: new THREE.MeshStandardMaterial({ color: 0xff3b1f, emissive: 0xff2a10, emissiveIntensity: 0.6, roughness: 0.4 }),
  };
  return mats;
}

export function buildRevolver(): RevolverParts {
  const m = materials();
  const root = new THREE.Group();
  root.name = 'revolver';
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const alongZ = Math.PI / 2;

  // ---- barrel: round tube + full under-lug + vent rib
  add(root, Geo.cyl(0.0088, 0.0088, 0.13, 24), m.blued, 0, 0, -0.089, alongZ);
  add(root, Geo.rbox(0.0125, 0.013, 0.126, 0.004), m.blued, 0, -0.0105, -0.091);
  add(root, Geo.rbox(0.0082, 0.0055, 0.128, 0.0015), m.blued, 0, 0.0095, -0.09);
  for (let i = 0; i < 7; i++) add(root, Geo.box(0.0084, 0.0022, 0.006), m.dark, 0, 0.0105, -0.035 - i * 0.016);
  // muzzle crown and bore
  add(root, Geo.torus(0.0066, 0.0016, 8, 20), m.polished, 0, 0, -0.1543);
  add(root, Geo.cyl(0.0048, 0.0048, 0.012, 16), m.bore, 0, 0, -0.1495, alongZ);
  // ramp front sight with a red insert
  add(root, Geo.box(0.003, 0.009, 0.016), m.blued, 0, 0.0155, -0.144, -0.2);
  add(root, Geo.box(0.0032, 0.003, 0.004), m.sight, 0, 0.019, -0.141);
  // ejector rod under the barrel, ahead of the cylinder
  add(root, Geo.cyl(0.0032, 0.0032, 0.04, 10), m.polished, 0, CYL_Y - 0.001, -0.042, alongZ);

  // ---- frame
  add(root, Geo.rbox(0.015, 0.006, 0.05, 0.002), m.blued, 0, CYL_Y + CYL_R + 0.004, 0); // top strap
  add(root, Geo.rbox(0.02, 0.012, 0.05, 0.003), m.blued, 0, CYL_Y - CYL_R - 0.006, 0); // under the cylinder
  add(root, Geo.rbox(0.022, 0.046, 0.012, 0.003), m.blued, 0, CYL_Y + 0.002, -0.028); // front of window
  add(root, Geo.rbox(0.026, 0.05, 0.012, 0.003), m.blued, 0, CYL_Y + 0.001, 0.028); // recoil shield
  add(root, Geo.rbox(0.021, 0.036, 0.034, 0.006), m.blued, 0, CYL_Y - 0.008, 0.049); // action housing
  // rear sight (notched blade) on the top strap
  add(root, Geo.box(0.0035, 0.004, 0.006), m.dark, 0.0035, 0.0145, 0.02);
  add(root, Geo.box(0.0035, 0.004, 0.006), m.dark, -0.0035, 0.0145, 0.02);
  // side plate screws
  for (const [y, z] of [[-0.022, 0.044], [-0.012, 0.058], [-0.03, 0.06]] as const) {
    add(root, Geo.cyl(0.0024, 0.0024, 0.0012, 10), m.polished, 0.0108, y, z, 0, 0, Math.PI / 2);
    add(root, Geo.cyl(0.0024, 0.0024, 0.0012, 10), m.polished, -0.0108, y, z, 0, 0, Math.PI / 2);
  }
  // cylinder release latch on the left
  add(root, Geo.rbox(0.004, 0.006, 0.012, 0.0015), m.polished, -0.0125, -0.008, 0.042);

  // ---- crane + cylinder
  const crane = new THREE.Group();
  crane.position.set(-0.011, CYL_Y - 0.018, 0);
  root.add(crane);
  const cylinder = new THREE.Group();
  cylinder.position.set(0.011, 0.018, 0); // back onto the cylinder axis
  crane.add(cylinder);
  add(cylinder, Geo.cyl(CYL_R, CYL_R, 0.042, 36), m.polished, 0, 0, 0, alongZ);
  const rounds: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 2;
    const cx = Math.cos(a) * CHAMBER_R;
    const cy = Math.sin(a) * CHAMBER_R;
    // flutes between chambers
    const fa = a + Math.PI / 6;
    add(cylinder, Geo.box(0.0045, 0.0026, 0.028), m.dark, Math.cos(fa) * (CYL_R - 0.0008), Math.sin(fa) * (CYL_R - 0.0008), -0.002, 0, 0, fa + Math.PI / 2);
    // chamber mouths (front) and cartridge rims + primers (back)
    add(cylinder, Geo.cyl(0.0047, 0.0047, 0.0012, 14), m.bore, cx, cy, -0.0212, alongZ);
    const rim = add(cylinder, Geo.cyl(0.0058, 0.0058, 0.0014, 14), m.brass, cx, cy, 0.0214, alongZ);
    add(rim, Geo.cyl(0.0019, 0.0019, 0.0006, 10), m.primer, 0, 0.0008, 0);
    rounds.push(rim);
  }
  // ratchet star in the middle of the back face
  add(cylinder, Geo.cyl(0.004, 0.004, 0.0016, 6), m.polished, 0, 0, 0.0215, alongZ);

  // ---- hammer (pivot at the back of the action)
  const hammer = new THREE.Group();
  hammer.position.set(0, CYL_Y - 0.004, 0.058);
  root.add(hammer);
  add(hammer, Geo.rbox(0.0065, 0.026, 0.009, 0.002), m.polished, 0, 0.012, 0.0, 0.25);
  add(hammer, Geo.rbox(0.0085, 0.006, 0.014, 0.002), m.polished, 0, 0.025, 0.006, 0.6); // spur
  for (let i = 0; i < 4; i++) add(hammer, Geo.box(0.0088, 0.0008, 0.0012), m.dark, 0, 0.0275 + i * 0.0012, 0.004 + i * 0.0025, 0.6);

  // ---- trigger guard + trigger
  const guard = add(root, Geo.torus(0.0145, 0.0024, 8, 24, Math.PI), m.blued, 0, CYL_Y - 0.03, 0.028, 0, Math.PI / 2, Math.PI);
  guard.scale.set(1, 1.15, 1);
  const trigger = new THREE.Group();
  trigger.position.set(0, CYL_Y - 0.026, 0.024);
  root.add(trigger);
  add(trigger, Geo.rbox(0.0045, 0.02, 0.006, 0.0015), m.polished, 0, -0.009, 0.002, -0.25);

  // ---- grip: backstrap, walnut panels, butt, medallions
  const grip = new THREE.Group();
  grip.position.set(0, CYL_Y - 0.028, 0.062);
  grip.rotation.x = -0.34;
  root.add(grip);
  add(grip, Geo.rbox(0.028, 0.085, 0.036, 0.008), m.wood, 0, -0.042, 0.004);
  add(grip, Geo.rbox(0.012, 0.086, 0.006, 0.002), m.blued, 0, -0.04, 0.021); // backstrap
  add(grip, Geo.rbox(0.03, 0.006, 0.038, 0.002), m.blued, 0, -0.086, 0.004); // butt
  for (const s of [1, -1]) add(grip, Geo.cyl(0.0045, 0.0045, 0.0012, 16), m.gold, s * 0.0142, -0.03, 0.004, 0, 0, Math.PI / 2);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.158);
  root.add(muzzle);
  for (const g of [root, cylinder, hammer, trigger, grip]) mergeByMaterial(g);
  return { root, crane, cylinder, hammer, trigger, muzzle, rounds };
}

/**
 * The player's right hand (a chef's mitten hand in a white jacket sleeve)
 * wrapped around the grip, in gun space.
 */
export function buildShooterHand(): THREE.Group {
  const g = new THREE.Group();
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xe0a47e, roughness: 0.55, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffb8a0) });
  const sleeve = new THREE.MeshPhysicalMaterial({ color: 0xf4f1ea, roughness: 0.82, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff) });
  const piping = new THREE.MeshStandardMaterial({ color: 0x1d1714, roughness: 0.6 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const gy = CYL_Y - 0.028;
  // palm hugging the right side of the grip
  add(Geo.sphere(1, 20, 14), skin, 0.011, gy - 0.045, 0.074, 0.021, 0.046, 0.034, -0.34);
  // three fingers wrapped around the front strap
  for (let i = 0; i < 3; i++) add(Geo.capsule(0.0105, 0.022, 6, 12), skin, -0.001, gy - 0.036 - i * 0.018, 0.046 + i * 0.007, 1, 1, 1, 0, 0, Math.PI / 2 - 0.1);
  // index finger resting on the trigger
  add(Geo.capsule(0.0085, 0.024, 6, 12), skin, 0.006, gy - 0.004, 0.034, 1, 1, 1, Math.PI / 2 - 0.2, 0.25, 0);
  // thumb along the left of the frame
  add(Geo.capsule(0.0095, 0.026, 6, 12), skin, -0.017, gy + 0.008, 0.05, 1, 1, 1, Math.PI / 2 + 0.25, -0.2, 0);
  // wrist and sleeve heading back toward the camera
  const wrist = new THREE.Group();
  wrist.position.set(0.012, gy - 0.07, 0.1);
  wrist.rotation.set(-1.05, 0.28, 0);
  g.add(wrist);
  const wm = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, s = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.scale.set(s, 1, s * 0.92);
    m.castShadow = true;
    wrist.add(m);
    return m;
  };
  wm(Geo.cyl(0.023, 0.026, 0.05, 18), skin, -0.01);
  wm(Geo.cyl(0.036, 0.037, 0.028, 22), sleeve, -0.045); // cuff
  wm(Geo.torus(0.036, 0.0022, 6, 28), piping, -0.058).rotation.x = Math.PI / 2;
  wm(Geo.cyl(0.037, 0.045, 0.34, 22), sleeve, -0.22);
  mergeByMaterial(g);
  mergeByMaterial(wrist);
  return g;
}

/** Star-shaped flash texture for the muzzle blast. */
export function muzzleFlashTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d')!;
  const cx = 128;
  const g = c.createRadialGradient(cx, cx, 0, cx, cx, 128);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.18, 'rgba(255,230,160,0.95)');
  g.addColorStop(0.45, 'rgba(255,150,50,0.45)');
  g.addColorStop(1, 'rgba(255,90,20,0)');
  c.fillStyle = g;
  c.beginPath();
  const spikes = 9;
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 ? 22 + Math.random() * 18 : 90 + Math.random() * 38;
    c.lineTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
