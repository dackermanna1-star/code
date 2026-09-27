// Procedural weapon & item models. Each builder returns a THREE.Group oriented
// with the barrel along -Z, grip near the origin. userData.muzzle marks the
// muzzle point, userData.eject the ejection port, userData.mag the magazine
// (animated during reloads), userData.pump / bolt for action animations.
import * as THREE from 'three';
import { getTexture } from '../render/textures.js';

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const wood = getTexture('wood', { color: 0x6a4424, seed: 301, size: 256 });
  const metalT = getTexture('metal', { color: 0x3a3e42, seed: 302, rust: 0.08, rough: 0.35, metal: 0.9, size: 256 });
  MATS = {
    gun: new THREE.MeshStandardMaterial({ color: 0x3c4046, metalness: 0.85, roughness: 0.38, map: metalT.map, normalMap: metalT.normalMap, roughnessMap: metalT.ormMap }),
    gunDark: new THREE.MeshStandardMaterial({ color: 0x1c1e21, metalness: 0.7, roughness: 0.45 }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x151617, metalness: 0.05, roughness: 0.62 }),
    polymerGreen: new THREE.MeshStandardMaterial({ color: 0x3a3f2a, metalness: 0.05, roughness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normalMap, roughness: 0.55, color: 0xffffff }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e6, metalness: 1, roughness: 0.14 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 1, roughness: 0.28 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 }),
    red: new THREE.MeshStandardMaterial({ color: 0xa0140e, metalness: 0.2, roughness: 0.4 }),
    redShell: new THREE.MeshStandardMaterial({ color: 0x9a1a14, metalness: 0.1, roughness: 0.5 }),
    glassGreen: new THREE.MeshStandardMaterial({ color: 0x3a6a2a, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.75 }),
    glassClear: new THREE.MeshStandardMaterial({ color: 0xa8b8a0, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.5 }),
    rag: new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 1 }),
    tape: new THREE.MeshStandardMaterial({ color: 0x6a6a64, roughness: 0.7 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.5 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xd06010, roughness: 0.4 }),
    medRed: new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.5 }),
    pillOrange: new THREE.MeshStandardMaterial({ color: 0xc86818, roughness: 0.25, transparent: true, opacity: 0.9 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x103040, metalness: 0.5, roughness: 0.05, emissive: 0x051018 }),
    bile: new THREE.MeshStandardMaterial({ color: 0x6a7a18, roughness: 0.2, transparent: true, opacity: 0.85 }),
    flash: new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    led: new THREE.MeshBasicMaterial({ color: 0xff2010 }),
  };
  return MATS;
}

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (r1, r2, h, s = 12) => new THREE.CylinderGeometry(r1, r2, h, s);
function add(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  g.add(m);
  return m;
}
function marker(g, name, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.name = name;
  g.add(o);
  g.userData[name] = o;
  return o;
}
const barrel = (g, mat, r, len, x, y, z) => add(g, C(r, r, len, 10), mat, x, y, z - len / 2, Math.PI / 2, 0, 0);

const BUILD = {
  pistol() {
    const M = mats(), g = new THREE.Group();
    add(g, B(0.032, 0.035, 0.19), M.gun, 0, 0.045, -0.06); // slide
    add(g, B(0.03, 0.02, 0.17), M.gunDark, 0, 0.02, -0.055); // frame
    add(g, B(0.03, 0.11, 0.045), M.polymer, 0, -0.035, 0.0, 0.25); // grip
    add(g, B(0.006, 0.01, 0.01), M.gunDark, 0, 0.066, -0.14); // front sight
    add(g, B(0.02, 0.01, 0.01), M.gunDark, 0, 0.066, 0.02); // rear sight
    add(g, B(0.008, 0.03, 0.03), M.gunDark, 0, 0.0, -0.035); // trigger guard
    barrel(g, M.gunDark, 0.007, 0.01, 0, 0.045, -0.155);
    const mag = add(g, B(0.024, 0.09, 0.034), M.gunDark, 0, -0.045, 0.005, 0.25);
    g.userData.mag = mag;
    g.userData.slide = g.children[0];
    marker(g, 'muzzle', 0, 0.045, -0.17);
    marker(g, 'eject', 0.02, 0.055, -0.04);
    marker(g, 'gripL', -0.03, -0.04, 0.0);
    return g;
  },
  magnum() {
    const M = mats(), g = new THREE.Group();
    add(g, B(0.036, 0.05, 0.25), M.chrome, 0, 0.045, -0.08);
    add(g, B(0.034, 0.12, 0.05), M.polymer, 0, -0.04, 0.01, 0.25);
    add(g, B(0.008, 0.012, 0.012), M.gunDark, 0, 0.076, -0.2);
    const mag = add(g, B(0.026, 0.09, 0.036), M.gunDark, 0, -0.05, 0.012, 0.25);
    g.userData.mag = mag;
    g.userData.slide = g.children[0];
    marker(g, 'muzzle', 0, 0.05, -0.21);
    marker(g, 'eject', 0.02, 0.06, -0.04);
    return g;
  },
  smg() {
    const M = mats(), g = new THREE.Group();
    add(g, B(0.045, 0.06, 0.26), M.gunDark, 0, 0.03, -0.08); // receiver
    barrel(g, M.gun, 0.01, 0.06, 0, 0.035, -0.21);
    add(g, B(0.035, 0.11, 0.04), M.polymer, 0, -0.045, 0.0, 0.1); // grip
    const mag = add(g, B(0.028, 0.16, 0.035), M.gunDark, 0, -0.08, -0.03); // mag through grip style (uzi)
    add(g, B(0.03, 0.02, 0.2), M.gunDark, 0, 0.068, -0.08); // top cover
    add(g, B(0.012, 0.022, 0.012), M.gunDark, 0, 0.085, -0.19);
    add(g, B(0.03, 0.03, 0.1), M.gunDark, 0, 0.04, 0.09); // folded stock
    g.userData.mag = mag;
    g.userData.bolt = g.children[4];
    marker(g, 'muzzle', 0, 0.035, -0.25);
    marker(g, 'eject', 0.025, 0.05, -0.06);
    marker(g, 'gripL', 0, -0.02, -0.14);
    return g;
  },
  silencedSmg() {
    const g = BUILD.smg();
    const M = mats();
    barrel(g, M.polymer, 0.02, 0.18, 0, 0.035, -0.23);
    g.userData.muzzle.position.z = -0.42;
    return g;
  },
  pumpShotgun() {
    const M = mats(), g = new THREE.Group();
    add(g, B(0.05, 0.06, 0.2), M.gunDark, 0, 0.02, -0.05); // receiver
    barrel(g, M.gun, 0.013, 0.46, 0, 0.042, -0.14); // barrel
    barrel(g, M.gunDark, 0.012, 0.36, 0, 0.012, -0.14); // tube
    const pump = add(g, B(0.05, 0.045, 0.14), M.wood, 0, 0.012, -0.3); // pump
    add(g, B(0.04, 0.07, 0.22), M.wood, 0, -0.02, 0.15, -0.18); // stock
    add(g, B(0.035, 0.08, 0.04), M.wood, 0, -0.04, 0.03, 0.25); // grip
    add(g, B(0.008, 0.01, 0.01), M.brass, 0, 0.058, -0.58);
    g.userData.pump = pump;
    marker(g, 'muzzle', 0, 0.042, -0.6);
    marker(g, 'eject', 0.03, 0.035, -0.06);
    marker(g, 'gripL', 0, 0.0, -0.3);
    return g;
  },
  chromeShotgun() {
    const g = BUILD.pumpShotgun();
    const M = mats();
    g.children[0].material = M.chrome;
    g.children[1].material = M.chrome;
    g.children[3].material = M.polymer;
    g.children[4].material = M.polymer;
    g.children[5].material = M.polymer;
    return g;
  },
  autoShotgun() {
    const M = mats(), g = new THREE.Group();
    add(g, B(0.055, 0.07, 0.26), M.gunDark, 0, 0.02, -0.06);
    barrel(g, M.gun, 0.014, 0.42, 0, 0.045, -0.18);
    barrel(g, M.gunDark, 0.014, 0.34, 0, 0.012, -0.18);
    add(g, B(0.052, 0.05, 0.16), M.polymer, 0, 0.012, -0.3);
    add(g, B(0.045, 0.08, 0.24), M.polymer, 0, -0.01, 0.17, -0.12);
    add(g, B(0.038, 0.09, 0.045), M.polymer, 0, -0.05, 0.04, 0.25);
    add(g, B(0.03, 0.03, 0.14), M.gunDark, 0, 0.065, -0.06); // rail
    marker(g, 'muzzle', 0, 0.045, -0.6);
    marker(g, 'eject', 0.03, 0.035, -0.06);
    marker(g, 'gripL', 0, 0.0, -0.3);
    return g;
  },
  rifle() {
    const M = mats(), g = new THREE.Group();
    add(g, B(0.045, 0.07, 0.3), M.gunDark, 0, 0.02, -0.05); // lower/upper receiver
    add(g, B(0.03, 0.07, 0.035), M.gunDark, 0, 0.08, 0.02); // carry handle
    add(g, B(0.03, 0.012, 0.15), M.gunDark, 0, 0.12, 0.0);
    add(g, B(0.05, 0.055, 0.22), M.polymer, 0, 0.03, -0.3); // handguard
    barrel(g, M.gun, 0.009, 0.24, 0, 0.035, -0.4);
    add(g, B(0.012, 0.06, 0.012), M.gunDark, 0, 0.08, -0.4); // front sight post
    add(g, B(0.04, 0.07, 0.24), M.polymer, 0, 0.0, 0.2, -0.05); // stock
    add(g, B(0.035, 0.09, 0.04), M.polymer, 0, -0.05, 0.06, 0.3); // grip
    const mag = add(g, B(0.028, 0.14, 0.055), M.gunDark, 0, -0.07, -0.06, -0.15);
    g.userData.mag = mag;
    marker(g, 'muzzle', 0, 0.035, -0.65);
    marker(g, 'eject', 0.028, 0.04, -0.03);
    marker(g, 'gripL', 0, 0.0, -0.3);
    return g;
  },
  scar() {
    const M = mats(), g = new THREE.Group();
    add(g, B(0.05, 0.08, 0.34), M.polymerGreen, 0, 0.025, -0.08);
    add(g, B(0.03, 0.02, 0.36), M.gunDark, 0, 0.075, -0.1); // rail
    barrel(g, M.gun, 0.01, 0.2, 0, 0.035, -0.45);
    add(g, B(0.04, 0.08, 0.22), M.polymerGreen, 0, 0.0, 0.2, -0.05);
    add(g, B(0.035, 0.09, 0.04), M.polymer, 0, -0.05, 0.06, 0.3);
    const mag = add(g, B(0.028, 0.13, 0.055), M.gunDark, 0, -0.07, -0.05, -0.1);
    add(g, B(0.03, 0.04, 0.06), M.gunDark, 0, 0.1, -0.02); // sight
    add(g, B(0.01, 0.02, 0.005), M.lens, 0, 0.1, -0.052);
    g.userData.mag = mag;
    marker(g, 'muzzle', 0, 0.035, -0.66);
    marker(g, 'eject', 0.028, 0.04, -0.03);
    marker(g, 'gripL', 0, 0.0, -0.3);
    return g;
  },
  huntingRifle() {
    const M = mats(), g = new THREE.Group();
    add(g, B(0.045, 0.05, 0.28), M.gunDark, 0, 0.03, -0.05);
    barrel(g, M.gun, 0.011, 0.45, 0, 0.04, -0.18);
    add(g, B(0.05, 0.06, 0.5), M.wood, 0, 0.0, -0.1, 0, 0, 0); // stock body
    add(g, B(0.045, 0.08, 0.2), M.wood, 0, -0.03, 0.22, -0.2);
    // scope
    barrel(g, M.gunDark, 0.02, 0.26, 0, 0.1, 0.06);
    barrel(g, M.gunDark, 0.026, 0.05, 0, 0.1, -0.2);
    add(g, C(0.022, 0.022, 0.004, 12), M.lens, 0, 0.1, -0.25, Math.PI / 2);
    add(g, B(0.012, 0.04, 0.02), M.gunDark, 0, 0.07, -0.04);
    add(g, B(0.012, 0.04, 0.02), M.gunDark, 0, 0.07, -0.14);
    const mag = add(g, B(0.03, 0.06, 0.07), M.gunDark, 0, -0.035, -0.04);
    g.userData.mag = mag;
    g.userData.bolt = add(g, C(0.006, 0.006, 0.05, 6), M.chrome, 0.035, 0.045, 0.02, 0, 0, Math.PI / 2);
    marker(g, 'muzzle', 0, 0.04, -0.64);
    marker(g, 'eject', 0.03, 0.05, -0.02);
    marker(g, 'gripL', 0, -0.02, -0.28);
    marker(g, 'scope', 0, 0.1, 0.2);
    return g;
  },
  m60() {
    const M = mats(), g = new THREE.Group();
    add(g, B(0.06, 0.09, 0.4), M.gunDark, 0, 0.02, -0.05);
    barrel(g, M.gun, 0.016, 0.5, 0, 0.04, -0.25);
    add(g, B(0.05, 0.05, 0.25), M.polymerGreen, 0, 0.01, -0.3);
    add(g, B(0.045, 0.08, 0.26), M.polymerGreen, 0, 0.0, 0.25, -0.06);
    add(g, B(0.035, 0.09, 0.045), M.polymer, 0, -0.06, 0.08, 0.3);
    const box = add(g, B(0.07, 0.1, 0.1), M.polymerGreen, -0.06, -0.04, -0.02);
    add(g, B(0.05, 0.015, 0.1), M.brass, -0.035, 0.03, -0.02, 0, 0, 0.6); // belt
    add(g, B(0.01, 0.12, 0.01), M.gunDark, 0.03, -0.08, -0.55, 0, 0, 0.35); // bipod
    add(g, B(0.01, 0.12, 0.01), M.gunDark, -0.03, -0.08, -0.55, 0, 0, -0.35);
    g.userData.mag = box;
    marker(g, 'muzzle', 0, 0.04, -0.76);
    marker(g, 'eject', 0.035, 0.03, -0.02);
    marker(g, 'gripL', 0, -0.02, -0.3);
    return g;
  },
  grenadeLauncher() {
    const M = mats(), g = new THREE.Group();
    add(g, B(0.06, 0.07, 0.2), M.gunDark, 0, 0.02, -0.02);
    barrel(g, M.polymerGreen, 0.03, 0.34, 0, 0.04, -0.1);
    add(g, B(0.045, 0.08, 0.22), M.polymer, 0, -0.01, 0.17, -0.08);
    add(g, B(0.035, 0.09, 0.045), M.polymer, 0, -0.05, 0.04, 0.3);
    add(g, B(0.02, 0.05, 0.02), M.gunDark, 0, 0.09, -0.2);
    marker(g, 'muzzle', 0, 0.04, -0.45);
    marker(g, 'gripL', 0, 0.0, -0.28);
    return g;
  },
  minigun() {
    const M = mats(), g = new THREE.Group();
    const spin = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = add(spin, C(0.012, 0.012, 0.9, 8), M.gunDark, Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.45, Math.PI / 2);
      b.castShadow = true;
    }
    add(spin, C(0.06, 0.06, 0.05, 12), M.gun, 0, 0, -0.75, Math.PI / 2);
    add(spin, C(0.06, 0.06, 0.05, 12), M.gun, 0, 0, -0.3, Math.PI / 2);
    g.add(spin);
    add(g, B(0.16, 0.16, 0.3), M.gunDark, 0, 0, 0.12);
    add(g, B(0.3, 0.03, 0.03), M.gun, 0, 0, 0.3); // handles
    add(g, B(0.03, 0.1, 0.03), M.polymer, 0.14, -0.04, 0.32);
    add(g, B(0.03, 0.1, 0.03), M.polymer, -0.14, -0.04, 0.32);
    add(g, B(0.2, 0.15, 0.2), M.polymerGreen, -0.2, -0.05, 0.1); // ammo box
    g.userData.spin = spin;
    marker(g, 'muzzle', 0, 0, -0.92);
    marker(g, 'eject', 0.1, -0.05, 0.05);
    return g;
  },
  fireaxe() {
    const M = mats(), g = new THREE.Group();
    add(g, B(0.03, 0.72, 0.035), M.wood, 0, 0.26, 0);
    const head = new THREE.Group();
    head.position.set(0, 0.58, 0);
    add(head, B(0.035, 0.07, 0.2), M.red, 0, 0, -0.02);
    // blade wedge
    const bl = new THREE.Shape();
    bl.moveTo(0, -0.05); bl.lineTo(0.0, 0.05); bl.lineTo(0.12, 0.09); bl.lineTo(0.12, -0.09); bl.lineTo(0, -0.05);
    const bg = new THREE.ExtrudeGeometry(bl, { depth: 0.012, bevelEnabled: false });
    bg.translate(0, 0, -0.006);
    const blade = add(head, bg, M.steel, 0, 0, -0.1, 0, Math.PI / 2, 0);
    add(head, B(0.03, 0.035, 0.1), M.red, 0, 0, 0.12); // pick
    g.add(head);
    marker(g, 'tip', 0, 0.58, -0.2);
    return g;
  },
  crowbar() {
    const M = mats(), g = new THREE.Group();
    add(g, C(0.012, 0.012, 0.75, 8), M.red, 0, 0.3, 0);
    add(g, C(0.012, 0.012, 0.12, 8), M.red, 0, 0.7, -0.04, 0.9);
    add(g, C(0.012, 0.008, 0.07, 8), M.steel, 0, -0.08, -0.02, -0.5);
    marker(g, 'tip', 0, 0.7, -0.08);
    return g;
  },
  machete() {
    const M = mats(), g = new THREE.Group();
    add(g, B(0.03, 0.13, 0.035), M.polymer, 0, 0.0, 0);
    const bl = new THREE.Shape();
    bl.moveTo(-0.022, 0); bl.lineTo(0.022, 0); bl.lineTo(0.03, 0.42); bl.lineTo(0.0, 0.5); bl.lineTo(-0.022, 0.4);
    const bg = new THREE.ExtrudeGeometry(bl, { depth: 0.004, bevelEnabled: false });
    add(g, bg, M.steel, 0.0, 0.06, -0.002, 0, Math.PI / 2, 0);
    marker(g, 'tip', 0, 0.5, 0);
    return g;
  },
  molotov() {
    const M = mats(), g = new THREE.Group();
    add(g, C(0.04, 0.045, 0.14, 12), M.glassGreen, 0, 0, 0);
    add(g, C(0.015, 0.035, 0.05, 12), M.glassGreen, 0, 0.09, 0);
    add(g, C(0.016, 0.012, 0.08, 6), M.rag, 0, 0.14, 0, 0.3);
    const fl = add(g, new THREE.SphereGeometry(0.03, 8, 6), M.flash, 0.015, 0.19, 0);
    g.userData.flame = fl;
    return g;
  },
  pipebomb() {
    const M = mats(), g = new THREE.Group();
    add(g, C(0.03, 0.03, 0.2, 10), M.gun, 0, 0, 0);
    add(g, C(0.034, 0.034, 0.02, 10), M.gunDark, 0, 0.1, 0);
    add(g, C(0.034, 0.034, 0.02, 10), M.gunDark, 0, -0.1, 0);
    add(g, B(0.05, 0.08, 0.02), M.tape, 0, 0, 0.03);
    add(g, B(0.02, 0.02, 0.01), M.led, 0, 0.02, 0.045);
    add(g, C(0.003, 0.003, 0.08, 4), M.red, 0.02, 0.13, 0, 0, 0, 0.5);
    return g;
  },
  bile() {
    const M = mats(), g = new THREE.Group();
    add(g, C(0.045, 0.045, 0.12, 12), M.bile, 0, 0, 0);
    add(g, C(0.035, 0.035, 0.02, 12), M.white, 0, 0.07, 0);
    return g;
  },
  medkit() {
    const M = mats(), g = new THREE.Group();
    add(g, B(0.26, 0.18, 0.08), M.medRed, 0, 0, 0);
    add(g, B(0.12, 0.035, 0.085), M.white, 0, 0, 0);
    add(g, B(0.035, 0.12, 0.085), M.white, 0, 0, 0);
    add(g, B(0.08, 0.02, 0.02), M.polymer, 0, 0.1, 0);
    return g;
  },
  pills() {
    const M = mats(), g = new THREE.Group();
    add(g, C(0.028, 0.028, 0.09, 12), M.pillOrange, 0, 0, 0);
    add(g, C(0.03, 0.03, 0.025, 12), M.white, 0, 0.055, 0);
    add(g, C(0.029, 0.029, 0.045, 12), M.white, 0, -0.005, 0).scale.set(1.01, 1, 1.01);
    return g;
  },
  adrenaline() {
    const M = mats(), g = new THREE.Group();
    add(g, C(0.012, 0.012, 0.14, 8), M.white, 0, 0, 0);
    add(g, C(0.013, 0.013, 0.04, 8), M.orange, 0, 0.05, 0);
    return g;
  },
  grenade() {
    const M = mats(), g = new THREE.Group();
    add(g, C(0.02, 0.02, 0.06, 8), M.polymerGreen, 0, 0, 0, Math.PI / 2);
    add(g, new THREE.SphereGeometry(0.02, 8, 6), M.brass, 0, 0, -0.03);
    return g;
  },
  gascan() {
    const M = mats(), g = new THREE.Group();
    add(g, B(0.2, 0.28, 0.12), M.red, 0, 0.14, 0);
    add(g, C(0.02, 0.02, 0.06, 8), M.polymer, 0.07, 0.3, 0, 0, 0, -0.5);
    add(g, B(0.1, 0.03, 0.03), M.polymer, -0.03, 0.3, 0);
    return g;
  },
};
BUILD.dualPistols = () => {
  const g = new THREE.Group();
  const a = BUILD.pistol();
  const b = BUILD.pistol();
  b.position.x = -0.3;
  g.add(a); g.add(b);
  g.userData = { ...a.userData, left: b, right: a };
  return g;
};

const cache = new Map();
export function buildModel(type) {
  const fn = BUILD[type];
  if (!fn) return null;
  const g = fn();
  // name referenced parts so clones can re-link them (userData is JSON-cloned by three)
  for (const k in g.userData) { const v = g.userData[k]; if (v && v.isObject3D && !v.name) v.name = k; }
  return g;
}
function cloneLinked(src) {
  const ud = src.userData;
  src.userData = {};
  const c = src.clone(true);
  src.userData = ud;
  const keys = Object.keys(ud);
  c.traverse((o) => { if (o !== c && o.name && keys.includes(o.name)) c.userData[o.name] = o; });
  return c;
}
// Shared, cloned models (cheap) for pickups / third-person.
export function cloneModel(type) {
  if (!cache.has(type)) {
    const m = buildModel(type);
    if (!m) return null;
    cache.set(type, m);
  }
  return cloneLinked(cache.get(type));
}
export function modelMats() { return mats(); }
export function setWeaponEnv(tex, intensity = 0.5) {
  const M = mats();
  for (const k in M) {
    const m = M[k];
    if (m.isMeshStandardMaterial) { m.envMap = tex; m.envMapIntensity = intensity; m.needsUpdate = true; }
  }
}
