// Procedural weapon / gear meshes. Weapons are built with the grip at the origin and the
// striking end along +Y, so the same model works in first person, on the floor and in enemy hands.
import * as THREE from 'three';
import { sharedAssets } from '../render/materials.js';
import { RARITY } from './data.js';
import { addRim } from '../render/renderer.js';

const FX_COLORS = { fire: 0xff6a20, frost: 0x66ddff, shock: 0x99bbff, poison: 0x66ff44, blood: 0xff2030, shadow: 0xaa55ff };
export const fxColor = (fx) => FX_COLORS[fx] || 0xffffff;

let bloodAlpha = null;
function bloodAlphaTex() {
  if (bloodAlpha) return bloodAlpha;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const x = c.getContext('2d');
  const img = x.createImageData(32, 128);
  for (let j = 0; j < 128; j++) for (let i = 0; i < 32; i++) {
    const t = j / 128; // 0 = tip (canvas top maps to uv v=1)
    const n = Math.random();
    const a = Math.max(0, (1 - t * 1.2) + (n - 0.5) * 0.6);
    const k = (j * 32 + i) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255 * Math.min(1, a);
    img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  bloodAlpha = new THREE.CanvasTexture(c);
  return bloodAlpha;
}

function bladeShape(len, w, tipLen, taper = 0.75) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2 * taper, len - tipLen);
  s.lineTo(0, len);
  s.lineTo(w / 2 * taper, len - tipLen);
  s.lineTo(w / 2, 0);
  s.lineTo(-w / 2, 0);
  return s;
}

function extrude(shape, depth, bevel = 0.006) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

function mats(rarity, fx) {
  const A = sharedAssets();
  const tint = [0xc8c8cc, 0xd0d6dc, 0xb8c8e8, 0x9a90b0, 0xe8d8b0][rarity] || 0xc8c8cc;
  const blade = addRim(new THREE.MeshStandardMaterial({ map: A.metal.map, normalMap: A.metal.normalMap, color: tint, metalness: 0.6, roughness: rarity >= 3 ? 0.26 : 0.36, envMap: A.envMap, envMapIntensity: 1.6 }), 0xffd8a0, 0.35, 3);
  if (fx) {
    blade.emissive = new THREE.Color(fxColor(fx));
    blade.emissiveIntensity = 0.35;
  }
  const accent = rarity >= 4 ? A.gold : rarity >= 2 ? new THREE.MeshStandardMaterial({ color: 0x8a8a96, metalness: 0.85, roughness: 0.3, envMap: A.envMap }) : A.darkMetal;
  const grip = new THREE.MeshStandardMaterial({ map: A.darkWood.map, color: rarity >= 3 ? 0x4a2a3a : 0x6a4a35, roughness: 0.85 });
  const gem = new THREE.MeshStandardMaterial({ color: RARITY[rarity].color, emissive: RARITY[rarity].color, emissiveIntensity: 1.6, roughness: 0.2 });
  const blood = new THREE.MeshStandardMaterial({ color: 0x5a0306, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0, alphaMap: bloodAlphaTex(), depthWrite: false });
  return { blade, accent, grip, gem, blood };
}

const add = (g, geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
};

// Returns { group, length, bladeFrom, mats, bloodMeshes }
export function makeWeaponModel(item) {
  const base = item.base || item;
  const rarity = item.rarity || 0;
  const M = mats(rarity, item.fx);
  const g = new THREE.Group();
  const bloodMeshes = [];
  const withBlood = (mesh) => {
    const b = new THREE.Mesh(mesh.geometry, M.blood);
    b.position.copy(mesh.position);
    b.rotation.copy(mesh.rotation);
    b.scale.copy(mesh.scale).multiplyScalar(1.02);
    g.add(b);
    bloodMeshes.push(b);
  };
  let length = 1, bladeFrom = 0.2;
  const gemOn = rarity >= 2;

  switch (base) {
    case 'sword': {
      const blade = add(g, extrude(bladeShape(0.86, 0.075, 0.14), 0.012), M.blade, 0, 0.1, 0);
      withBlood(blade);
      add(g, new THREE.BoxGeometry(0.012, 0.6, 0.026), M.accent, 0, 0.42, 0).scale.set(1, 1, 1);
      const guard = add(g, new THREE.BoxGeometry(0.26, 0.035, 0.05), M.accent, 0, 0.09, 0);
      guard.scale.set(1, 1, 1);
      add(g, new THREE.SphereGeometry(0.022, 6, 4), M.accent, -0.13, 0.1, 0);
      add(g, new THREE.SphereGeometry(0.022, 6, 4), M.accent, 0.13, 0.1, 0);
      add(g, new THREE.CylinderGeometry(0.019, 0.021, 0.17, 8), M.grip, 0, -0.005, 0);
      add(g, new THREE.OctahedronGeometry(0.035), M.accent, 0, -0.11, 0);
      if (gemOn) add(g, new THREE.OctahedronGeometry(0.02), M.gem, 0, 0.09, 0.027);
      length = 0.96; bladeFrom = 0.12;
      break;
    }
    case 'dagger': {
      const blade = add(g, extrude(bladeShape(0.34, 0.06, 0.12, 0.6), 0.01), M.blade, 0, 0.06, 0);
      withBlood(blade);
      add(g, new THREE.BoxGeometry(0.13, 0.025, 0.035), M.accent, 0, 0.055, 0);
      add(g, new THREE.CylinderGeometry(0.016, 0.018, 0.12, 8), M.grip, 0, -0.01, 0);
      add(g, new THREE.SphereGeometry(0.025, 8, 6), M.accent, 0, -0.08, 0);
      if (gemOn) add(g, new THREE.OctahedronGeometry(0.016), M.gem, 0, 0.055, 0.02);
      length = 0.4; bladeFrom = 0.07;
      break;
    }
    case 'axe': {
      add(g, new THREE.CylinderGeometry(0.022, 0.026, 0.78, 8), M.grip, 0, 0.25, 0);
      const s = new THREE.Shape();
      s.moveTo(0, -0.05);
      s.lineTo(0.12, -0.09);
      s.quadraticCurveTo(0.22, 0.02, 0.13, 0.15);
      s.lineTo(0, 0.07);
      s.lineTo(0, -0.05);
      const head = add(g, extrude(s, 0.02, 0.006), M.blade, 0.02, 0.56, 0);
      withBlood(head);
      add(g, new THREE.BoxGeometry(0.06, 0.12, 0.05), M.accent, 0, 0.56, 0);
      const spike = add(g, new THREE.ConeGeometry(0.025, 0.09, 4), M.accent, -0.07, 0.56, 0);
      spike.rotation.z = Math.PI / 2;
      add(g, new THREE.CylinderGeometry(0.028, 0.028, 0.04, 8), M.accent, 0, -0.12, 0);
      if (gemOn) add(g, new THREE.OctahedronGeometry(0.02), M.gem, 0, 0.56, 0.03);
      length = 0.72; bladeFrom = 0.45;
      break;
    }
    case 'mace': {
      add(g, new THREE.CylinderGeometry(0.02, 0.024, 0.62, 8), M.grip, 0, 0.18, 0);
      const head = add(g, new THREE.SphereGeometry(0.075, 10, 8), M.blade, 0, 0.52, 0);
      withBlood(head);
      for (let i = 0; i < 6; i++) {
        const f = add(g, new THREE.BoxGeometry(0.02, 0.15, 0.08), M.blade, Math.cos((i / 6) * Math.PI * 2) * 0.07, 0.52, Math.sin((i / 6) * Math.PI * 2) * 0.07);
        f.rotation.y = -(i / 6) * Math.PI * 2;
      }
      add(g, new THREE.ConeGeometry(0.03, 0.08, 6), M.blade, 0, 0.62, 0);
      add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8), M.accent, 0, -0.12, 0);
      if (gemOn) add(g, new THREE.OctahedronGeometry(0.02), M.gem, 0, 0.4, 0.025);
      length = 0.66; bladeFrom = 0.42;
      break;
    }
    case 'spear': {
      add(g, new THREE.CylinderGeometry(0.02, 0.022, 1.9, 8), M.grip, 0, 0.35, 0);
      const s = new THREE.Shape();
      s.moveTo(-0.035, 0);
      s.quadraticCurveTo(-0.06, 0.12, 0, 0.32);
      s.quadraticCurveTo(0.06, 0.12, 0.035, 0);
      s.lineTo(-0.035, 0);
      const tip = add(g, extrude(s, 0.012), M.blade, 0, 1.3, 0);
      withBlood(tip);
      add(g, new THREE.CylinderGeometry(0.03, 0.022, 0.06, 8), M.accent, 0, 1.29, 0);
      add(g, new THREE.CylinderGeometry(0.024, 0.024, 0.08, 8), M.accent, 0, -0.6, 0);
      if (gemOn) add(g, new THREE.OctahedronGeometry(0.02), M.gem, 0, 1.29, 0.03);
      length = 1.62; bladeFrom = 1.3;
      break;
    }
    case 'greatsword': {
      const blade = add(g, extrude(bladeShape(1.25, 0.1, 0.18, 0.8), 0.016), M.blade, 0, 0.16, 0);
      withBlood(blade);
      add(g, new THREE.BoxGeometry(0.014, 0.9, 0.034), M.accent, 0, 0.62, 0);
      add(g, new THREE.BoxGeometry(0.42, 0.045, 0.06), M.accent, 0, 0.15, 0);
      add(g, new THREE.BoxGeometry(0.12, 0.08, 0.04), M.accent, 0, 0.21, 0);
      add(g, new THREE.CylinderGeometry(0.022, 0.024, 0.3, 8), M.grip, 0, 0.0, 0);
      add(g, new THREE.OctahedronGeometry(0.045), M.accent, 0, -0.18, 0);
      if (gemOn) add(g, new THREE.OctahedronGeometry(0.026), M.gem, 0, 0.17, 0.035);
      length = 1.42; bladeFrom = 0.2;
      break;
    }
    case 'hammer': {
      add(g, new THREE.CylinderGeometry(0.025, 0.03, 1.05, 8), M.grip, 0, 0.32, 0);
      const head = add(g, new THREE.BoxGeometry(0.34, 0.16, 0.16), M.blade, 0, 0.84, 0);
      withBlood(head);
      add(g, new THREE.BoxGeometry(0.06, 0.2, 0.2), M.accent, -0.17, 0.84, 0);
      add(g, new THREE.BoxGeometry(0.06, 0.2, 0.2), M.accent, 0.17, 0.84, 0);
      add(g, new THREE.BoxGeometry(0.08, 0.24, 0.12), M.accent, 0, 0.84, 0);
      add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8), M.accent, 0, -0.18, 0);
      if (gemOn) add(g, new THREE.OctahedronGeometry(0.024), M.gem, 0, 0.84, 0.065);
      length = 0.96; bladeFrom = 0.7;
      break;
    }
    default: {
      add(g, new THREE.BoxGeometry(0.05, 0.6, 0.02), M.blade, 0, 0.3, 0);
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group: g, length, bladeFrom, mats: M, bloodMeshes };
}

// Simple mesh for armor pickups.
export function makeArmorModel(item) {
  const A = sharedAssets();
  const g = new THREE.Group();
  const heavy = ['chain', 'scale', 'plate'].includes(item.base);
  const mat = heavy ? A.metal : item.base === 'robe' ? A.clothBlue : new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.45, 10), mat);
  torso.scale.z = 0.6;
  g.add(torso);
  for (const s of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), heavy ? A.darkMetal : mat);
    pad.position.set(0.22 * s, 0.18, 0);
    g.add(pad);
  }
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 4, 12), A.darkWood);
  belt.rotation.x = Math.PI / 2;
  belt.scale.y = 0.6;
  belt.position.y = -0.18;
  g.add(belt);
  return g;
}

export function makeTrinketModel(item) {
  const A = sharedAssets();
  const g = new THREE.Group();
  const gem = new THREE.MeshStandardMaterial({ color: RARITY[item.rarity].color, emissive: RARITY[item.rarity].color, emissiveIntensity: 1.5, roughness: 0.15 });
  if (item.base === 'ring') {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 6, 16), A.gold);
    g.add(r);
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.03), gem);
    s.position.y = 0.08;
    g.add(s);
  } else {
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 4, 20), A.gold);
    g.add(chain);
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), gem);
    s.position.y = -0.13;
    g.add(s);
  }
  return g;
}

export function makeRelicModel(item) {
  const g = new THREE.Group();
  const color = RARITY[item.rarity].color;
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.8, roughness: 0.2, metalness: 0.3, flatShading: true }));
  g.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 4, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
  ring.rotation.x = Math.PI / 2.5;
  g.add(ring);
  g.userData.spin = [core, ring];
  return g;
}

export function makeTomeModel() {
  const A = sharedAssets();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.36), new THREE.MeshStandardMaterial({ color: 0x3a1a5a, roughness: 0.6 })));
  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 0.33), new THREE.MeshStandardMaterial({ color: 0xe8dcc0 }));
  pages.position.x = 0.01;
  g.add(pages);
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14), new THREE.MeshBasicMaterial({ map: A.tex.rune, color: 0xcc88ff, transparent: true, blending: THREE.AdditiveBlending }));
  rune.rotation.x = -Math.PI / 2;
  rune.position.y = 0.032;
  g.add(rune);
  return g;
}
