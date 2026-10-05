// Weapons for "Desert Strike": stats and detailed procedural 3D models.
// Models are built in metres with the barrel along -Z, up +Y and the pistol
// grip (right hand) at the origin. Each builder returns
//   { group, mag, slide, bolt, pump, sight, muzzle, eject, leftHand }
// where mag/slide/bolt/pump are sub-objects animated by the viewmodel.
import * as THREE from 'three';

// --- materials ----------------------------------------------------------------------
function noiseCanvas(w, h, base, spread, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * spread; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
  if (draw) draw(x, w, h);
  return c;
}
function tex(canvas, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8;
  return t;
}
let MATS = null;
export function gunMaterials() {
  if (MATS) return MATS;
  const metalTex = tex(noiseCanvas(128, 128, '#7a7c80', 30), 3, 3);
  const polyTex = tex(noiseCanvas(128, 128, '#5a5b5e', 18), 4, 4);
  const wood = tex(noiseCanvas(256, 64, '#7a4224', 18, (x, w, h) => {
    for (let i = 0; i < 26; i++) {
      x.strokeStyle = `rgba(${40 + Math.random() * 30},${18 + Math.random() * 12},8,${0.25 + Math.random() * 0.3})`;
      x.lineWidth = 1 + Math.random() * 2;
      const y0 = Math.random() * h;
      x.beginPath(); x.moveTo(0, y0);
      for (let px = 0; px <= w; px += 16) x.lineTo(px, y0 + Math.sin(px * 0.03 + i) * 4);
      x.stroke();
    }
  }), 1, 1);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MATS = {
    metal: std({ color: 0x9a9da2, map: metalTex, metalness: 0.85, roughness: 0.38 }),
    darkMetal: std({ color: 0x55585e, map: metalTex, metalness: 0.7, roughness: 0.45 }),
    blued: std({ color: 0x4a5260, map: metalTex, metalness: 0.85, roughness: 0.32 }),
    polymer: std({ color: 0x5a5a5e, map: polyTex, metalness: 0.0, roughness: 0.68 }),
    rubber: std({ color: 0x1a1a1a, metalness: 0, roughness: 0.95 }),
    wood: std({ color: 0xffffff, map: wood, metalness: 0, roughness: 0.55 }),
    od: std({ color: 0x55603f, map: polyTex, metalness: 0.05, roughness: 0.8 }),
    tan: std({ color: 0xb59b6e, map: polyTex, metalness: 0.05, roughness: 0.8 }),
    steel: std({ color: 0x9aa0a8, metalness: 1, roughness: 0.3 }),
    brass: std({ color: 0xd2a64a, metalness: 1, roughness: 0.3 }),
    glass: std({ color: 0x223040, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.55 }),
    lens: std({ color: 0x6fb0ff, metalness: 0.4, roughness: 0.05, emissive: 0x0a1830, transparent: true, opacity: 0.45 }),
    red: std({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 2 }),
    sightDot: new THREE.MeshBasicMaterial({ color: 0xff3a1a }),
    tritium: new THREE.MeshBasicMaterial({ color: 0x9dff6a }),
  };
  return MATS;
}

// --- modelling helpers ----------------------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const boxCache = new Map();
function bevelBox(w, h, d) {
  const key = `${w.toFixed(4)},${h.toFixed(4)},${d.toFixed(4)}`;
  if (boxCache.has(key)) return boxCache.get(key);
  const b = Math.min(0.0025, w * 0.2, h * 0.2, d * 0.2);
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2 + b, -h / 2 + b); sh.lineTo(w / 2 - b, -h / 2 + b); sh.lineTo(w / 2 - b, h / 2 - b); sh.lineTo(-w / 2 + b, h / 2 - b); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.0001, d - 2 * b), bevelEnabled: b > 0.0002, bevelSize: b, bevelThickness: b, bevelSegments: 1 });
  geo.translate(0, 0, -(d - 2 * b) / 2);
  geo.computeVertexNormals();
  boxCache.set(key, geo);
  return geo;
}
function box(g, mat, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(bevelBox(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  g.add(m); return m;
}
/** Cylinder along Z. */
function cyl(g, mat, r1, r2, len, x = 0, y = 0, z = 0, seg = 16) {
  const geo = new THREE.CylinderGeometry(r1, r2, len, seg); geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m;
}
/** Side-view profile [z, y] points (z forward = negative) extruded across X, centred. */
function profile(g, mat, pts, width, x = 0, bevel = 0.002) {
  const s = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? s.lineTo(-z, y) : s.moveTo(-z, y)));
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 6 });
  geo.rotateY(Math.PI / 2);
  geo.translate(x - width / 2 + bevel, 0, 0);
  // rotateY(90deg) maps shape x -> -z... we built with -z so that +z input means backward
  const m = new THREE.Mesh(geo, mat); g.add(m); return m;
}
function rail(g, mat, len, x, y, z) {
  box(g, mat, 0.022, 0.006, len, x, y, z);
  for (let i = 0; i < Math.floor(len / 0.01); i += 2) box(g, mat, 0.024, 0.006, 0.005, x, y + 0.006, z - len / 2 + i * 0.01 + 0.005);
}
function curvedMag(g, mat, top, len, curve, w, d) {
  // a magazine bending forward as it goes down (AK / MP5 / STANAG), built
  // from its side profile: the front and back edges follow an arc
  const mag = new THREE.Group();
  mag.position.copy(top);
  const R = curve > 0.01 ? len / curve : 1e3, A = len / R, n = 14;
  const front = [], back = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * A;
    const cz = -R * (1 - Math.cos(a)), cy = -R * Math.sin(a);
    const nz = -Math.cos(a), ny = Math.sin(a);
    front.push([cz + nz * d / 2, cy + ny * d / 2]);
    back.push([cz - nz * d / 2, cy - ny * d / 2]);
  }
  profile(mag, mat, [...front, ...back.reverse()], w, 0, 0.0015);
  // ribs on the side and a floor plate
  const plate = box(mag, mat, w + 0.004, 0.01, d + 0.008);
  const ea = A;
  plate.position.set(0, -R * Math.sin(ea) - 0.004 * Math.cos(ea), -R * (1 - Math.cos(ea)) + 0.004 * Math.sin(ea));
  plate.rotation.x = -ea;
  for (let i = 1; i < 4; i++) {
    const a = (i / 4) * A;
    const rib = box(mag, mat, w + 0.003, 0.004, d * 0.7, 0, -R * Math.sin(a), -R * (1 - Math.cos(a)));
    rib.rotation.x = -a;
  }
  g.add(mag);
  return mag;
}

// --- the guns ---------------------------------------------------------------------------
function glock() {
  const M = gunMaterials();
  const g = new THREE.Group();
  // frame with grip angle and trigger guard
  profile(g, M.polymer, [[0.03, -0.005], [-0.12, -0.005], [-0.125, 0.012], [0.035, 0.012], [0.045, -0.02], [0.03, -0.12], [-0.01, -0.12], [-0.005, -0.03], [-0.04, -0.03], [-0.06, -0.005]], 0.03);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0035, 6, 12, Math.PI), M.polymer);
  guard.rotation.set(0, Math.PI / 2, Math.PI); guard.position.set(0, -0.012, -0.03); g.add(guard);
  box(g, M.polymer, 0.006, 0.02, 0.004, 0, -0.012, -0.022, 0.3); // trigger
  // texture panel on the grip
  box(g, M.polymer, 0.031, 0.06, 0.03, 0, -0.07, 0.012, -0.28);
  // slide
  const slide = new THREE.Group(); g.add(slide);
  box(slide, M.darkMetal, 0.026, 0.03, 0.185, 0, 0.026, -0.05);
  for (let i = 0; i < 7; i++) box(slide, M.darkMetal, 0.027, 0.024, 0.002, 0, 0.026, 0.032 - i * 0.005); // serrations
  box(slide, M.darkMetal, 0.012, 0.004, 0.006, 0, 0.044, 0.03); // rear sight
  box(slide, M.tritium, 0.003, 0.003, 0.002, -0.004, 0.047, 0.027); box(slide, M.tritium, 0.003, 0.003, 0.002, 0.004, 0.047, 0.027);
  box(slide, M.darkMetal, 0.004, 0.005, 0.005, 0, 0.044, -0.135); box(slide, M.tritium, 0.003, 0.003, 0.002, 0, 0.046, -0.138);
  box(slide, M.blued, 0.004, 0.012, 0.02, 0.0135, 0.03, -0.035); // ejection port
  cyl(g, M.blued, 0.007, 0.007, 0.012, 0, 0.022, -0.146);
  // magazine (base plate visible)
  const mag = new THREE.Group(); g.add(mag);
  box(mag, M.polymer, 0.024, 0.11, 0.032, 0, -0.065, 0.012, -0.28);
  box(mag, M.polymer, 0.028, 0.008, 0.038, 0, -0.123, 0.03, -0.28);
  return { group: g, mag, slide, sight: V(0, 0.046, 0.03), muzzle: V(0, 0.022, -0.155), eject: V(0.015, 0.035, -0.03), leftHand: V(-0.02, -0.06, 0.02), pistol: true };
}

function deagle() {
  const M = gunMaterials();
  const g = new THREE.Group();
  profile(g, M.steel, [[0.03, -0.005], [-0.17, -0.005], [-0.17, 0.014], [0.04, 0.014], [0.05, -0.02], [0.035, -0.13], [-0.012, -0.13], [-0.006, -0.03], [-0.045, -0.03], [-0.07, -0.005]], 0.034);
  box(g, M.rubber, 0.036, 0.09, 0.036, 0, -0.075, 0.015, -0.22);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 12, Math.PI), M.steel);
  guard.rotation.set(0, Math.PI / 2, Math.PI); guard.position.set(0, -0.012, -0.035); g.add(guard);
  const slide = new THREE.Group(); g.add(slide);
  box(slide, M.steel, 0.032, 0.036, 0.1, 0, 0.032, 0.0);
  for (let i = 0; i < 6; i++) box(slide, M.steel, 0.033, 0.03, 0.002, 0, 0.032, 0.035 - i * 0.006);
  // the triangular barrel shroud
  profile(g, M.steel, [[0.0, 0.014], [-0.26, 0.014], [-0.26, 0.05], [0.0, 0.05]], 0.03);
  box(g, M.steel, 0.012, 0.006, 0.12, 0, 0.053, -0.14);
  box(slide, M.darkMetal, 0.014, 0.006, 0.006, 0, 0.053, 0.045);
  box(g, M.darkMetal, 0.004, 0.008, 0.008, 0, 0.058, -0.25);
  cyl(g, M.blued, 0.009, 0.009, 0.006, 0, 0.03, -0.262);
  const mag = new THREE.Group(); g.add(mag);
  box(mag, M.steel, 0.03, 0.012, 0.04, 0, -0.135, 0.032, -0.22);
  return { group: g, mag, slide, sight: V(0, 0.058, 0.045), muzzle: V(0, 0.03, -0.268), eject: V(0.017, 0.04, 0.0), leftHand: V(-0.02, -0.07, 0.02), pistol: true };
}

function ak47() {
  const M = gunMaterials();
  const g = new THREE.Group();
  // stamped receiver and dust cover with ribs
  box(g, M.blued, 0.034, 0.05, 0.26, 0, 0.02, -0.02);
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.24, 12, 1, false, -Math.PI / 2, Math.PI), M.blued);
  cover.rotation.x = Math.PI / 2; cover.position.set(0, 0.045, -0.015); g.add(cover);
  for (let i = 0; i < 3; i++) box(g, M.blued, 0.035, 0.004, 0.006, 0, 0.061, 0.06 - i * 0.03);
  // rear sight leaf and block
  box(g, M.blued, 0.03, 0.022, 0.04, 0, 0.058, -0.15);
  box(g, M.blued, 0.012, 0.006, 0.05, 0, 0.073, -0.15, -0.05);
  // wooden handguard (lower and upper) and gas tube
  profile(g, M.wood, [[-0.17, 0.0], [-0.39, 0.004], [-0.39, 0.05], [-0.17, 0.05]], 0.044);
  cyl(g, M.wood, 0.017, 0.017, 0.2, 0, 0.074, -0.27);
  cyl(g, M.blued, 0.012, 0.012, 0.04, 0, 0.074, -0.39);
  // barrel, front sight, muzzle brake
  cyl(g, M.blued, 0.009, 0.009, 0.42, 0, 0.032, -0.55);
  box(g, M.blued, 0.016, 0.05, 0.02, 0, 0.055, -0.66);
  box(g, M.blued, 0.004, 0.02, 0.004, 0, 0.088, -0.66);
  cyl(g, M.blued, 0.012, 0.012, 0.06, 0, 0.032, -0.77);
  for (let i = 0; i < 3; i++) box(g, M.blued, 0.025, 0.005, 0.01, 0, 0.04, -0.75 - i * 0.015, 0.5);
  // wooden stock and pistol grip
  profile(g, M.wood, [[0.11, 0.045], [0.11, 0.0], [0.38, -0.08], [0.39, -0.03], [0.39, 0.02], [0.3, 0.03]], 0.04);
  box(g, M.blued, 0.042, 0.11, 0.008, 0, -0.04, 0.39, 0.25);
  profile(g, M.wood, [[0.08, -0.005], [0.04, -0.005], [0.07, -0.11], [0.11, -0.11]], 0.032);
  // trigger guard, trigger, safety lever, charging handle
  box(g, M.blued, 0.012, 0.004, 0.07, 0, -0.03, 0.0);
  box(g, M.blued, 0.004, 0.022, 0.004, 0, -0.016, 0.01, 0.3);
  box(g, M.blued, 0.004, 0.012, 0.11, 0.019, 0.03, -0.02);
  const bolt = new THREE.Group(); g.add(bolt);
  box(bolt, M.metal, 0.018, 0.008, 0.012, 0.025, 0.04, -0.1);
  // the curved 30-round magazine
  const mag = curvedMag(g, M.blued, V(0, -0.005, -0.075), 0.21, 0.6, 0.026, 0.058);
  return { group: g, mag, bolt, sight: V(0, 0.088, -0.15), frontSight: V(0, 0.096, -0.66), muzzle: V(0, 0.032, -0.8), eject: V(0.02, 0.05, -0.05), leftHand: V(-0.005, -0.01, -0.28), railY: null };
}

function m4() {
  const M = gunMaterials();
  const g = new THREE.Group();
  // upper and lower receivers
  box(g, M.darkMetal, 0.03, 0.045, 0.22, 0, 0.048, -0.04);
  profile(g, M.darkMetal, [[0.07, 0.026], [-0.15, 0.026], [-0.15, -0.012], [-0.06, -0.012], [-0.05, -0.05], [-0.0, -0.05], [0.07, -0.005]], 0.03);
  box(g, M.blued, 0.004, 0.015, 0.04, 0.016, 0.05, -0.03); // ejection port cover
  box(g, M.darkMetal, 0.012, 0.012, 0.016, 0.017, 0.06, 0.03); // forward assist
  // flat-top rail
  rail(g, M.darkMetal, 0.17, 0, 0.073, -0.04);
  // quad-rail handguard
  box(g, M.darkMetal, 0.044, 0.044, 0.3, 0, 0.048, -0.3);
  for (const [x, y] of [[0, 0.072], [0, 0.024], [0.023, 0.048], [-0.023, 0.048]]) {
    for (let i = 0; i < 14; i++) box(g, M.darkMetal, x ? 0.006 : 0.03, x ? 0.03 : 0.006, 0.01, x * 1.05, y + (x ? 0 : Math.sign(y - 0.048) * 0.002), -0.17 - i * 0.02);
  }
  // barrel, A-frame front sight, flash hider
  cyl(g, M.blued, 0.008, 0.008, 0.2, 0, 0.048, -0.55);
  profile(g, M.darkMetal, [[-0.49, 0.04], [-0.53, 0.04], [-0.525, 0.11], [-0.495, 0.11]], 0.012);
  box(g, M.darkMetal, 0.003, 0.012, 0.003, 0, 0.115, -0.51);
  cyl(g, M.darkMetal, 0.011, 0.011, 0.05, 0, 0.048, -0.67);
  // charging handle (animated), buffer tube, collapsible stock
  const bolt = new THREE.Group(); g.add(bolt);
  box(bolt, M.darkMetal, 0.04, 0.008, 0.02, 0, 0.068, 0.075);
  cyl(g, M.darkMetal, 0.015, 0.015, 0.2, 0, 0.04, 0.17);
  profile(g, M.polymer, [[0.17, 0.065], [0.2, -0.04], [0.33, -0.05], [0.33, 0.065]], 0.038);
  box(g, M.rubber, 0.04, 0.12, 0.012, 0, 0.007, 0.335);
  // pistol grip, trigger guard, trigger, magazine well and STANAG magazine
  profile(g, M.polymer, [[0.055, -0.01], [0.02, -0.01], [0.05, -0.11], [0.09, -0.11]], 0.03);
  box(g, M.darkMetal, 0.01, 0.004, 0.06, 0, -0.035, 0.0);
  box(g, M.blued, 0.004, 0.02, 0.004, 0, -0.02, 0.01, 0.3);
  const mag = curvedMag(g, M.darkMetal, V(0, -0.03, -0.1), 0.17, 0.22, 0.024, 0.058);
  return { group: g, mag, bolt, sight: V(0, 0.115, -0.04), frontSight: V(0, 0.118, -0.51), ironRear: V(0, 0.1, 0.03), muzzle: V(0, 0.048, -0.7), eject: V(0.018, 0.05, -0.03), leftHand: V(-0.005, 0.01, -0.3), railY: 0.079, railZ: -0.04, barrelEnd: -0.65 };
}

function mp5() {
  const M = gunMaterials();
  const g = new THREE.Group();
  cyl(g, M.blued, 0.024, 0.024, 0.28, 0, 0.045, -0.06);
  box(g, M.blued, 0.03, 0.03, 0.2, 0, 0.03, -0.04);
  profile(g, M.polymer, [[-0.15, 0.0], [-0.3, 0.004], [-0.3, 0.06], [-0.15, 0.06]], 0.05);
  cyl(g, M.blued, 0.008, 0.008, 0.08, 0, 0.05, -0.34);
  // front sight hood and rear drum sight
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 12, Math.PI), M.blued);
  hood.position.set(0, 0.078, -0.3); g.add(hood);
  box(g, M.blued, 0.003, 0.01, 0.003, 0, 0.082, -0.3);
  cyl(g, M.blued, 0.012, 0.012, 0.02, 0, 0.082, 0.05);
  // cocking tube and handle (animated)
  cyl(g, M.blued, 0.008, 0.008, 0.22, 0, 0.075, -0.2);
  const bolt = new THREE.Group(); g.add(bolt);
  box(bolt, M.blued, 0.03, 0.008, 0.01, -0.015, 0.075, -0.24);
  // retractable stock
  for (const x of [-0.012, 0.012]) box(g, M.blued, 0.004, 0.006, 0.22, x, 0.045, 0.19);
  box(g, M.rubber, 0.04, 0.09, 0.015, 0, 0.02, 0.3);
  profile(g, M.polymer, [[0.06, -0.01], [0.02, -0.01], [0.05, -0.1], [0.09, -0.1]], 0.03);
  box(g, M.polymer, 0.012, 0.004, 0.06, 0, -0.03, 0.02);
  const mag = curvedMag(g, M.blued, V(0, 0.01, -0.09), 0.18, 0.45, 0.022, 0.034);
  return { group: g, mag, bolt, sight: V(0, 0.092, 0.05), frontSight: V(0, 0.087, -0.3), muzzle: V(0, 0.05, -0.38), eject: V(0.02, 0.05, -0.04), leftHand: V(-0.005, 0.0, -0.23) };
}

function remington() {
  const M = gunMaterials();
  const g = new THREE.Group();
  box(g, M.blued, 0.034, 0.055, 0.2, 0, 0.025, -0.03);
  cyl(g, M.blued, 0.011, 0.011, 0.5, 0, 0.044, -0.38);
  cyl(g, M.blued, 0.01, 0.01, 0.4, 0, 0.012, -0.33); // tube magazine
  const pump = new THREE.Group(); g.add(pump);
  const fore = cyl(pump, M.wood, 0.024, 0.024, 0.16, 0, 0.016, -0.24, 12);
  for (let i = 0; i < 5; i++) { const r = cyl(pump, M.wood, 0.026, 0.026, 0.006, 0, 0.016, -0.18 - i * 0.026, 12); r.material = M.wood; }
  fore.scale.set(1, 1, 1);
  box(g, M.metal, 0.004, 0.006, 0.006, 0, 0.06, -0.62); // bead
  box(g, M.brass, 0.003, 0.003, 0.003, 0, 0.064, -0.62);
  profile(g, M.wood, [[0.07, 0.05], [0.07, -0.0], [0.38, -0.1], [0.4, -0.04], [0.4, 0.04], [0.3, 0.05]], 0.042);
  box(g, M.rubber, 0.044, 0.11, 0.014, 0, -0.03, 0.402, 0.3);
  profile(g, M.wood, [[0.08, -0.0], [0.04, -0.0], [0.065, -0.1], [0.1, -0.09]], 0.03);
  box(g, M.blued, 0.01, 0.004, 0.06, 0, -0.025, 0.02);
  const mag = new THREE.Group(); g.add(mag); // the shell held while loading
  cyl(mag, M.red, 0.009, 0.009, 0.05, 0, -0.01, -0.04, 10).material = new THREE.MeshStandardMaterial({ color: 0xa01818, roughness: 0.6 });
  mag.visible = false;
  return { group: g, mag, pump, sight: V(0, 0.064, 0.05), frontSight: V(0, 0.064, -0.62), muzzle: V(0, 0.044, -0.64), eject: V(0.02, 0.04, -0.03), leftHand: V(-0.005, -0.01, -0.24) };
}

function m249() {
  const M = gunMaterials();
  const g = new THREE.Group();
  box(g, M.darkMetal, 0.05, 0.075, 0.3, 0, 0.035, -0.05);
  box(g, M.darkMetal, 0.052, 0.012, 0.12, 0, 0.078, -0.02); // feed cover
  rail(g, M.darkMetal, 0.12, 0, 0.086, -0.02);
  cyl(g, M.blued, 0.012, 0.012, 0.5, 0, 0.045, -0.42);
  box(g, M.polymer, 0.06, 0.05, 0.18, 0, 0.03, -0.27);
  cyl(g, M.darkMetal, 0.016, 0.016, 0.06, 0, 0.045, -0.7);
  box(g, M.darkMetal, 0.006, 0.05, 0.01, 0, 0.08, -0.62);
  // folded bipod
  for (const x of [-0.012, 0.012]) box(g, M.darkMetal, 0.006, 0.006, 0.26, x, 0.005, -0.5);
  // carry handle
  box(g, M.darkMetal, 0.012, 0.04, 0.01, 0.0, 0.11, -0.2); box(g, M.darkMetal, 0.012, 0.008, 0.1, 0, 0.13, -0.24);
  const bolt = new THREE.Group(); g.add(bolt);
  box(bolt, M.darkMetal, 0.006, 0.014, 0.02, 0.028, 0.03, -0.06);
  profile(g, M.polymer, [[0.1, 0.07], [0.1, -0.0], [0.38, -0.06], [0.4, 0.02], [0.4, 0.07]], 0.05);
  profile(g, M.polymer, [[0.07, -0.0], [0.035, -0.0], [0.06, -0.1], [0.1, -0.1]], 0.03);
  // 100-round soft pouch / box on the left
  const mag = new THREE.Group(); g.add(mag);
  box(mag, M.od, 0.09, 0.1, 0.12, -0.02, -0.06, -0.08);
  box(mag, M.brass, 0.01, 0.006, 0.08, -0.03, 0.03, -0.08);
  return { group: g, mag, bolt, sight: V(0, 0.105, 0.03), frontSight: V(0, 0.105, -0.62), muzzle: V(0, 0.045, -0.73), eject: V(0.03, 0.03, -0.05), leftHand: V(-0.005, -0.0, -0.27), railY: 0.092, railZ: -0.02 };
}

function m24() {
  const M = gunMaterials();
  const g = new THREE.Group();
  // olive drab stock with cheek rest
  profile(g, M.od, [[-0.4, 0.02], [-0.4, -0.02], [-0.08, -0.03], [0.02, -0.09], [0.06, -0.09], [0.08, -0.04], [0.42, -0.08], [0.43, 0.04], [0.2, 0.05], [0.1, 0.03]], 0.05);
  box(g, M.rubber, 0.052, 0.13, 0.016, 0, -0.02, 0.435, 0.12);
  box(g, M.blued, 0.034, 0.04, 0.22, 0, 0.04, -0.03);
  cyl(g, M.blued, 0.011, 0.009, 0.6, 0, 0.045, -0.5);
  cyl(g, M.blued, 0.013, 0.013, 0.04, 0, 0.045, -0.8);
  // bolt handle (animated)
  const bolt = new THREE.Group(); g.add(bolt);
  box(bolt, M.metal, 0.05, 0.006, 0.006, 0.03, 0.05, 0.03);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), M.metal); knob.position.set(0.055, 0.05, 0.03); bolt.add(knob);
  box(g, M.blued, 0.012, 0.004, 0.06, 0, -0.03, 0.03);
  box(g, M.blued, 0.004, 0.018, 0.004, 0, -0.016, 0.035, 0.3);
  const mag = new THREE.Group(); g.add(mag);
  box(mag, M.blued, 0.03, 0.01, 0.07, 0, -0.035, -0.04);
  return { group: g, mag, bolt, sight: V(0, 0.11, 0.0), muzzle: V(0, 0.045, -0.82), eject: V(0.02, 0.05, 0.0), leftHand: V(-0.005, -0.02, -0.3), railY: 0.06, railZ: -0.03, builtInScope: true };
}

// --- attachments ------------------------------------------------------------------------
function opticMount(g, M, y, z, len = 0.05) { box(g, M.darkMetal, 0.026, 0.012, len, 0, y + 0.006, z); }
export const ATTACH_BUILD = {
  reddot(g, y, z) {
    const M = gunMaterials();
    opticMount(g, M, y, z, 0.04);
    cyl(g, M.darkMetal, 0.017, 0.017, 0.05, 0, y + 0.034, z, 20);
    const lens = cyl(g, M.lens, 0.014, 0.014, 0.002, 0, y + 0.034, z - 0.024, 20);
    lens.renderOrder = 2;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0012, 10), M.sightDot); dot.position.set(0, y + 0.034, z - 0.02); dot.rotation.y = Math.PI; g.add(dot);
    return { sight: V(0, y + 0.034, z + 0.02), fov: 50 };
  },
  holo(g, y, z) {
    const M = gunMaterials();
    opticMount(g, M, y, z, 0.06);
    box(g, M.darkMetal, 0.04, 0.012, 0.08, 0, y + 0.018, z);
    box(g, M.darkMetal, 0.004, 0.04, 0.05, -0.02, y + 0.042, z - 0.012); box(g, M.darkMetal, 0.004, 0.04, 0.05, 0.02, y + 0.042, z - 0.012);
    box(g, M.darkMetal, 0.044, 0.004, 0.05, 0, y + 0.064, z - 0.012);
    const glass = box(g, M.lens, 0.036, 0.036, 0.002, 0, y + 0.043, z - 0.03); glass.renderOrder = 2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.004, 0.0048, 24), M.sightDot); ring.position.set(0, y + 0.043, z - 0.031); ring.rotation.y = Math.PI; g.add(ring);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0006, 8), M.sightDot); dot.position.copy(ring.position); dot.rotation.y = Math.PI; g.add(dot);
    return { sight: V(0, y + 0.043, z + 0.04), fov: 50 };
  },
  acog(g, y, z) {
    const M = gunMaterials();
    opticMount(g, M, y, z, 0.07);
    cyl(g, M.darkMetal, 0.016, 0.02, 0.13, 0, y + 0.04, z, 20);
    cyl(g, M.darkMetal, 0.022, 0.022, 0.03, 0, y + 0.04, z - 0.07, 20);
    cyl(g, M.lens, 0.019, 0.019, 0.002, 0, y + 0.04, z - 0.086, 20);
    box(g, M.tritium, 0.003, 0.003, 0.03, 0, y + 0.065, z - 0.02); // fibre optic
    return { sight: V(0, y + 0.04, z + 0.08), fov: 18, scope: 'acog' };
  },
  scope(g, y, z) { // the M24's own rifle scope
    const M = gunMaterials();
    for (const dz of [-0.05, 0.06]) { box(g, M.darkMetal, 0.02, 0.03, 0.02, 0, y + 0.015, z + dz); }
    cyl(g, M.darkMetal, 0.016, 0.016, 0.22, 0, y + 0.045, z, 20);
    cyl(g, M.darkMetal, 0.024, 0.016, 0.05, 0, y + 0.045, z - 0.13, 20);
    cyl(g, M.darkMetal, 0.021, 0.016, 0.04, 0, y + 0.045, z + 0.12, 20);
    cyl(g, M.lens, 0.022, 0.022, 0.002, 0, y + 0.045, z - 0.155, 20);
    cyl(g, M.darkMetal, 0.008, 0.008, 0.02, 0, y + 0.07, z, 10).rotation.set(0, 0, 0);
    return { sight: V(0, y + 0.045, z + 0.17), fov: 9, scope: 'sniper' };
  },
  suppressor(g, muzzle) {
    const M = gunMaterials();
    const s = cyl(g, M.darkMetal, 0.02, 0.02, 0.17, muzzle.x, muzzle.y, muzzle.z - 0.085, 20);
    cyl(g, M.blued, 0.021, 0.021, 0.01, muzzle.x, muzzle.y, muzzle.z - 0.168, 20);
    return { muzzle: V(muzzle.x, muzzle.y, muzzle.z - 0.17), mesh: s };
  },
  foregrip(g, leftHand) {
    const M = gunMaterials();
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.08, 12), M.polymer);
    grip.position.set(0, leftHand.y - 0.05, leftHand.z); g.add(grip);
    return { leftHand: V(0, leftHand.y - 0.07, leftHand.z) };
  },
  laser(g, leftHand) {
    const M = gunMaterials();
    box(g, M.darkMetal, 0.02, 0.022, 0.05, 0.03, leftHand.y + 0.04, leftHand.z - 0.08);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 30, 4).rotateX(Math.PI / 2).translate(0, 0, -15), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.18, depthWrite: false }));
    beam.position.set(0.03, leftHand.y + 0.04, leftHand.z - 0.105); g.add(beam);
    box(g, M.red, 0.004, 0.004, 0.002, 0.03, leftHand.y + 0.04, leftHand.z - 0.106);
    return {};
  },
  extmag(model) { model.mag.scale.y = 1.45; return {}; },
};

// --- definitions ----------------------------------------------------------------------------
// damage: per bullet (100 health); rpm: rounds per minute; spread: degrees
// (hip / aimed); recoil: degrees of muzzle climb per shot.
export const GUNS = {
  glock: { name: 'Glock 17', slot: 'secondary', price: 0, build: glock, damage: 25, rpm: 450, auto: false, mag: 17, reserve: 85, reload: 1.5, spread: [2.2, 0.5], recoil: 1.2, range: 120, sound: 'pistol', attach: ['suppressor', 'laser', 'extmag'], move: 1.0 },
  deagle: { name: 'Desert Eagle', slot: 'secondary', price: 900, build: deagle, damage: 55, rpm: 240, auto: false, mag: 7, reserve: 35, reload: 1.9, spread: [3, 0.6], recoil: 4.5, range: 160, sound: 'magnum', attach: ['laser', 'extmag'], move: 1.0 },
  mp5: { name: 'MP5', slot: 'primary', price: 1500, build: mp5, damage: 22, rpm: 800, auto: true, mag: 30, reserve: 120, reload: 2.2, spread: [3, 0.9], recoil: 0.9, range: 140, sound: 'smg', attach: ['reddot', 'holo', 'suppressor', 'laser', 'extmag'], move: 0.97 },
  remington: { name: 'Remington 870', slot: 'primary', price: 1800, build: remington, damage: 16, pellets: 9, rpm: 70, auto: false, mag: 6, reserve: 30, reload: 0.55, shellReload: true, spread: [6, 4.5], recoil: 6, range: 60, sound: 'shotgun', attach: ['reddot', 'laser'], move: 0.95 },
  ak47: { name: 'AK-47', slot: 'primary', price: 2700, build: ak47, damage: 34, rpm: 600, auto: true, mag: 30, reserve: 120, reload: 2.5, spread: [4, 0.6], recoil: 2.0, range: 400, sound: 'ak', attach: ['suppressor', 'laser', 'extmag'], move: 0.92 },
  m4: { name: 'M4A1', slot: 'primary', price: 3100, build: m4, damage: 30, rpm: 750, auto: true, mag: 30, reserve: 120, reload: 2.3, spread: [3.5, 0.4], recoil: 1.4, range: 400, sound: 'rifle', attach: ['reddot', 'holo', 'acog', 'suppressor', 'foregrip', 'laser', 'extmag'], move: 0.93 },
  m249: { name: 'M249', slot: 'primary', price: 5200, build: m249, damage: 30, rpm: 750, auto: true, mag: 100, reserve: 200, reload: 5.2, spread: [5, 1.2], recoil: 1.3, range: 400, sound: 'rifle', attach: ['reddot', 'holo', 'acog', 'extmag'], move: 0.8 },
  m24: { name: 'M24 Sniper', slot: 'primary', price: 4750, build: m24, damage: 105, headMult: 2, rpm: 45, auto: false, bolt: true, mag: 5, reserve: 25, reload: 3.0, spread: [8, 0.0], recoil: 7, range: 900, sound: 'sniper', attach: ['suppressor'], move: 0.85 },
};
export const ATTACHMENTS = {
  reddot: { name: 'Red Dot Sight', price: 500, type: 'optic', desc: 'A clean red dot. Faster aiming.' },
  holo: { name: 'Holographic Sight', price: 650, type: 'optic', desc: 'A wide window and a ring reticle.' },
  acog: { name: 'ACOG 4x Scope', price: 1200, type: 'optic', desc: '4x magnified scope for long range.' },
  suppressor: { name: 'Suppressor', price: 900, type: 'muzzle', desc: 'Quieter shots and no tracer. Slightly less damage.' },
  foregrip: { name: 'Vertical Foregrip', price: 450, type: 'under', desc: '25% less vertical recoil.' },
  laser: { name: 'Laser Sight', price: 350, type: 'side', desc: '35% tighter hip-fire spread.' },
  extmag: { name: 'Extended Magazine', price: 750, type: 'mag', desc: '50% more rounds per magazine.' },
};

/** Build a gun model with the chosen attachments; returns the model info with effective stats. */
export function buildGun(id, attachments = []) {
  const def = GUNS[id];
  const model = def.build();
  const g = model.group;
  const has = (a) => attachments.includes(a) && def.attach.includes(a);
  const info = { ...model, fov: 55, scope: null, attachments: attachments.filter((a) => def.attach.includes(a)) };
  const opticY = model.railY ?? (model.sight.y - 0.01), opticZ = model.railZ ?? -0.04;
  const optic = ['acog', 'holo', 'reddot'].find(has);
  if (model.builtInScope) Object.assign(info, ATTACH_BUILD.scope(g, opticY, opticZ));
  else if (optic) {
    if (id === 'ak47') { /* AK has no rail */ } else Object.assign(info, ATTACH_BUILD[optic](g, opticY, opticZ));
  } else if (model.frontSight) {
    info.fov = 55;
  }
  if (has('suppressor')) Object.assign(info, ATTACH_BUILD.suppressor(g, model.muzzle));
  if (has('foregrip')) Object.assign(info, ATTACH_BUILD.foregrip(g, model.leftHand));
  if (has('laser')) ATTACH_BUILD.laser(g, model.leftHand);
  if (has('extmag')) ATTACH_BUILD.extmag(model);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  // effective stats
  const s = { ...def };
  if (has('extmag')) { s.mag = Math.round(def.mag * 1.5); }
  if (has('suppressor')) { s.damage = Math.round(def.damage * 0.9); s.suppressed = true; }
  if (has('foregrip')) s.recoil = def.recoil * 0.75;
  if (has('laser')) s.spread = [def.spread[0] * 0.65, def.spread[1]];
  info.stats = s;
  return info;
}
