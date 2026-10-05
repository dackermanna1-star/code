// Models for the bank heist: vehicles (the getaway van, police cruisers, the
// SWAT truck, a police helicopter, parked cars), the thermal drill, duffel
// bags, cash and gold, and the heist masks. Vehicles face -Z with their
// origin on the ground at the centre.
import * as THREE from 'three';
import { canvas, noise, blotches, toTex } from '../warzone/map.js';

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, ...o });
let ENV = null, ENV_R = null;
/**
 * A small reflection environment (sky above, street below) for paint, glass
 * and metal. It belongs to one renderer (the single-file version draws place
 * thumbnails with another), so it is made again for a new one.
 */
export function envMap(renderer) {
  if (!renderer || (ENV && ENV_R === renderer)) return ENV;
  ENV_R = renderer;
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x8a8f96);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xbcd4f0, side: THREE.BackSide }));
  s.add(dome);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(10, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4a4a4c }));
  ground.position.y = -0.5; s.add(ground);
  for (let i = 0; i < 8; i++) { // buildings around the horizon
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2 + Math.random() * 4, 2.5), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x6a7078 : 0x9aa0a6 }));
    const a = (i / 8) * Math.PI * 2; b.position.set(Math.cos(a) * 8, 1, Math.sin(a) * 8); s.add(b);
  }
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); sun.position.set(3, 7, 2); s.add(sun);
  ENV = pm.fromScene(s, 0.03).texture;
  pm.dispose();
  return ENV;
}

const M = {};
export function mats() {
  if (M.tyre) return M;
  M.tyre = std({ color: 0x161616, roughness: 0.9 });
  M.rim = std({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.8 });
  M.chrome = std({ color: 0xd8dce0, roughness: 0.15, metalness: 1 });
  M.black = std({ color: 0x141414, roughness: 0.5 });
  M.plastic = std({ color: 0x222224, roughness: 0.7 });
  M.glass = std({ color: 0x1a2028, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.82 });
  M.head = std({ color: 0xfffbe8, emissive: 0xfff4d0, emissiveIntensity: 0.6, roughness: 0.2 });
  M.tail = std({ color: 0x8a0a0a, emissive: 0xff1010, emissiveIntensity: 0.5, roughness: 0.3 });
  M.red = std({ color: 0x400000, emissive: 0xff1010, emissiveIntensity: 0 });
  M.blue = std({ color: 0x000040, emissive: 0x1040ff, emissiveIntensity: 0 });
  M.lightOff = std({ color: 0x303034, roughness: 0.3 });
  M.interior = std({ color: 0x3a3a3c, roughness: 0.9, side: THREE.BackSide });
  M.floor = std({ color: 0x2c2c2e, roughness: 0.95 });
  M.gold = std({ color: 0xe8b830, roughness: 0.22, metalness: 1 });
  M.steel = std({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.85 });
  M.darkSteel = std({ color: 0x4a4e54, roughness: 0.45, metalness: 0.8 });
  M.orange = std({ color: 0xe06a10, roughness: 0.5, metalness: 0.2 });
  M.yellow = std({ color: 0xe8c020, roughness: 0.5, metalness: 0.2 });
  M.rotor = std({ color: 0x1c1c1c, roughness: 0.6 });
  M.cone = new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  M.cash = std({ map: toTex(canvas(128, 64, (x, w, h) => {
    x.fillStyle = '#a8b898'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < h; i += 2) { x.fillStyle = i % 4 ? '#9aac8a' : '#b8c4a8'; x.fillRect(0, i, w, 1); }
    x.fillStyle = '#4a6a3a'; x.fillRect(8, 6, w - 16, h - 12);
    x.fillStyle = '#c8d4b0'; x.fillRect(12, 10, w - 24, h - 20);
    x.fillStyle = '#5a7a4a'; x.beginPath(); x.arc(w / 2, h / 2, 12, 0, 7); x.fill();
    x.fillStyle = '#e8d8a0'; x.fillRect(w / 2 - 9, 0, 18, h); // paper band
    x.fillStyle = '#a07a30'; x.font = 'bold 9px Arial'; x.textAlign = 'center'; x.fillText('$10K', w / 2, h / 2 + 3);
    noise(x, w, h, 14);
  })), roughness: 0.85 });
  return M;
}

// --- helpers --------------------------------------------------------------------------------------
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
const box = (g, mat, w, h, d, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, g);

/** Extrude a side profile ([[z, y], ...] along the car) to a body `width` wide, length along Z. */
function profileBody(pts, width, bevel = 0.25) {
  const s = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1 });
  g.rotateY(-Math.PI / 2);
  g.translate((width - bevel * 2) / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

function wheel(g, x, y, z, r = 1.5, w = 1.1) {
  const W = new THREE.Group();
  W.position.set(x, y, z);
  const tyre = mesh(new THREE.CylinderGeometry(r, r, w, 22), mats().tyre); tyre.rotation.z = Math.PI / 2; W.add(tyre);
  const rim = mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.06, 14), mats().rim); rim.rotation.z = Math.PI / 2; W.add(rim);
  const hub = mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, w + 0.12, 8), mats().chrome); hub.rotation.z = Math.PI / 2; W.add(hub);
  g.add(W);
  return W;
}

/** A flat decal with text/graphics (vehicle livery), facing +X or -X. */
function sideDecal(g, tex, w, h, x, y, z, side) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.position.set(x, y, z);
  m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  g.add(m);
  return m;
}
function textTex(w, h, draw) { const t = toTex(canvas(w, h, draw)); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; }

// --- vehicles ----------------------------------------------------------------------------------------
const SEDAN = {
  body: [[-8.2, 1.0], [-8.3, 2.5], [-7.7, 3.05], [-3.4, 3.35], [3.6, 3.35], [7.9, 3.25], [8.3, 2.6], [8.2, 1.0]],
  cabin: [[-3.6, 3.2], [-1.3, 5.05], [2.5, 5.05], [5.0, 3.3]],
  width: 7.2,
};

/** A four-door sedan. opts: {paint, police, unit} */
export function buildSedan(opts = {}) {
  const Mt = mats();
  const g = new THREE.Group();
  const W = SEDAN.width;
  const env = ENV;
  const paint = std({ color: opts.paint ?? 0x8a2a24, roughness: 0.32, metalness: 0.45, envMap: env, envMapIntensity: 0.9 });
  let sideMat = paint;
  if (opts.police) {
    // black-and-white: white doors and roof, black hood, trunk and lower body
    const tex = toTex(canvas(256, 64, (x, w, h) => {
      x.fillStyle = '#111'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#f4f4f4'; x.fillRect(w * 0.3, 0, w * 0.4, h * 0.82);
    }));
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(1 / 16.6, 1 / 5.4); tex.offset.set(8.3 / 16.6, 0);
    sideMat = std({ map: tex, roughness: 0.32, metalness: 0.4, envMap: env, envMapIntensity: 0.8 });
    paint.color.set(0x121212);
  }
  const body = mesh(profileBody(SEDAN.body, W), [sideMat, paint]); g.add(body);
  mesh(profileBody(SEDAN.cabin, W - 0.7, 0.15), Mt.glass, 0, 0, 0, g);
  const roof = box(g, opts.police ? std({ color: 0xf4f4f4, roughness: 0.3, metalness: 0.4, envMap: env }) : paint, W - 1.1, 0.18, 3.8, 0, 5.1, 0.6);
  void roof;
  // pillars
  for (const sx of [-1, 1]) {
    box(g, Mt.black, 0.12, 1.75, 0.3, sx * (W / 2 - 0.42), 4.2, 0.45);
  }
  // wheels, lights, grille, bumpers, mirrors, plates
  g.userData.wheels = [];
  for (const [x, z] of [[-W / 2 + 0.55, -5.2], [W / 2 - 0.55, -5.2], [-W / 2 + 0.55, 5.3], [W / 2 - 0.55, 5.3]]) g.userData.wheels.push(wheel(g, x, 1.5, z));
  for (const sx of [-1, 1]) {
    box(g, Mt.head, 1.5, 0.55, 0.2, sx * 2.5, 2.55, -8.3);
    box(g, Mt.tail, 1.6, 0.6, 0.2, sx * 2.6, 2.75, 8.3);
    box(g, Mt.black, 0.5, 0.35, 0.6, sx * (W / 2 + 0.1), 3.7, -2.9);
  }
  box(g, Mt.black, 3.0, 0.6, 0.2, 0, 2.2, -8.35);
  box(g, Mt.plastic, W - 0.3, 0.7, 0.5, 0, 1.4, -8.25);
  box(g, Mt.plastic, W - 0.3, 0.7, 0.5, 0, 1.4, 8.25);
  box(g, std({ color: 0xf0f0e8 }), 1.6, 0.6, 0.06, 0, 1.75, 8.52);
  if (opts.police) {
    // push bar, light bar, POLICE on the doors, spotlight
    box(g, Mt.black, 4.6, 1.6, 0.25, 0, 2.2, -8.75);
    for (const sx of [-1, 1]) box(g, Mt.black, 0.25, 1.6, 0.6, sx * 2.1, 2.2, -8.5);
    const bar = new THREE.Group(); bar.position.set(0, 5.35, 0.4); g.add(bar);
    box(bar, Mt.black, 5.2, 0.25, 0.9, 0, -0.05, 0);
    const red = box(bar, Mt.red.clone(), 2.3, 0.45, 0.8, -1.3, 0.25, 0);
    const blue = box(bar, Mt.blue.clone(), 2.3, 0.45, 0.8, 1.3, 0.25, 0);
    g.userData.lightbar = { red, blue };
    const unit = opts.unit || '08';
    const tex = textTex(256, 96, (x, w, h) => {
      x.clearRect(0, 0, w, h);
      x.fillStyle = '#d8b040'; x.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 11 : 26; x.lineTo(34 + Math.cos(a) * r, 48 + Math.sin(a) * r); }
      x.fill();
      x.fillStyle = '#111'; x.font = 'bold 40px Arial'; x.fillText('POLICE', 66, 52);
      x.font = 'bold 15px Arial'; x.fillText('ROBLOXIA CITY  ' + unit, 70, 78);
    });
    for (const sx of [-1, 1]) sideDecal(g, tex, 6.6, 2.5, sx * (W / 2 + 0.04), 2.25, -0.2, sx);
  }
  g.userData.size = [W, 5.4, 16.6];
  return g;
}

/** The getaway van: a white high-roof cargo van, "Totally Legit Plumbing". */
export function buildVan() {
  const Mt = mats();
  const g = new THREE.Group();
  const W = 7.8;
  const paint = std({ color: 0xeeeeea, roughness: 0.35, metalness: 0.35, envMap: ENV, envMapIntensity: 0.8 });
  const prof = [[-9.4, 1.0], [-9.5, 2.8], [-8.9, 3.9], [-6.6, 4.6], [-4.7, 8.6], [9.2, 8.7], [9.4, 8.2], [9.4, 1.0]];
  const body = mesh(profileBody(prof, W), paint); g.add(body);
  // windshield and front side windows
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.2, 4.3), Mt.glass);
  ws.position.set(0, 6.63, -5.69); ws.rotation.set(0.44, Math.PI, 0); g.add(ws);
  for (const sx of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), Mt.glass);
    sw.position.set(sx * (W / 2 + 0.03), 6.4, -3.3); sw.rotation.y = sx * Math.PI / 2; g.add(sw);
    box(g, Mt.black, 0.5, 0.4, 0.7, sx * (W / 2 + 0.2), 5.6, -5.6);
  }
  g.userData.wheels = [];
  for (const [x, z] of [[-W / 2 + 0.6, -6.2], [W / 2 - 0.6, -6.2], [-W / 2 + 0.6, 6.0], [W / 2 - 0.6, 6.0]]) g.userData.wheels.push(wheel(g, x, 1.55, z, 1.55, 1.2));
  for (const sx of [-1, 1]) {
    box(g, Mt.head, 1.6, 0.8, 0.2, sx * 2.6, 3.1, -9.5);
    box(g, Mt.tail, 0.6, 2.2, 0.2, sx * (W / 2 - 0.4), 4.0, 9.45);
  }
  box(g, Mt.black, 4.0, 1.0, 0.2, 0, 2.8, -9.55);
  box(g, Mt.plastic, W - 0.2, 0.9, 0.5, 0, 1.45, -9.4);
  box(g, Mt.plastic, W - 0.2, 0.8, 0.5, 0, 1.4, 9.45);
  // ladder rack and pipes on the roof (it's a plumber's van)
  for (const sx of [-1, 1]) box(g, Mt.steel, 0.2, 0.2, 12, sx * 2.6, 9.1, 2.5);
  for (const z of [-3, 2, 7]) box(g, Mt.steel, 5.6, 0.2, 0.2, 0, 9.1, z);
  for (const sx of [-0.6, 0.6]) { const p = mesh(new THREE.CylinderGeometry(0.28, 0.28, 13, 10), std({ color: 0xc8c0b0, roughness: 0.5 }), sx, 9.5, 2.5, g); p.rotation.x = Math.PI / 2; }
  // the logo
  const tex = textTex(512, 160, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = '#1a4a9a'; x.font = 'italic bold 54px Arial'; x.fillText('TOTALLY LEGIT', 20, 64);
    x.fillStyle = '#d02020'; x.font = 'bold 46px Arial'; x.fillText('PLUMBING CO.', 22, 112);
    x.fillStyle = '#333'; x.font = '20px Arial'; x.fillText('No job too big!  555-0199', 26, 146);
    x.strokeStyle = '#1a4a9a'; x.lineWidth = 9; x.lineCap = 'round';
    x.beginPath(); x.moveTo(430, 40); x.lineTo(480, 120); x.stroke(); x.beginPath(); x.arc(424, 32, 18, 0.5, 5.5); x.stroke();
  });
  for (const sx of [-1, 1]) sideDecal(g, tex, 11, 3.4, sx * (W / 2 + 0.04), 5.2, 3.0, sx);
  // the cargo area seen from inside, and the rear doors (open for the getaway)
  // (no wall at the back, so you can see out of the open doors)
  const wallM = std({ color: 0x4a4a4c, roughness: 0.9 });
  const plane = (w, h, x, y, z, ry, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallM); m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); g.add(m); return m; };
  plane(13.6, 7, -W / 2 + 0.28, 5.0, 2.4, Math.PI / 2); plane(13.6, 7, W / 2 - 0.28, 5.0, 2.4, -Math.PI / 2);
  plane(W - 0.5, 7, 0, 5.0, -4.4, 0); plane(W - 0.5, 13.6, 0, 8.45, 2.4, 0, Math.PI / 2);
  mesh(new THREE.BoxGeometry(W - 0.6, 0.2, 13.4), Mt.floor, 0, 1.55, 2.4, g);
  // ribs, a bench and the bags of loot
  for (const z of [-2, 1.5, 5, 8.5]) for (const sx of [-1, 1]) box(g, Mt.darkSteel, 0.15, 6.6, 0.3, sx * (W / 2 - 0.36), 5, z);
  box(g, Mt.plastic, 1.6, 1.4, 8, -W / 2 + 1.1, 2.3, 3.5);
  const bags = [];
  for (let i = 0; i < 5; i++) { const b = buildBag(1); b.position.set(1.4 - (i % 2) * 1.6, 2.3 + Math.floor(i / 2) * 0.9, -2.5 + i * 1.3); b.rotation.y = 0.3 * (i % 3); b.visible = false; g.add(b); bags.push(b); }
  g.userData.bags = bags;
  const doors = [];
  for (const sx of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.position.set(sx * (W / 2 - 0.05), 0, 9.42); g.add(hinge);
    const d = box(hinge, paint, W / 2 - 0.1, 7.3, 0.18, -sx * (W / 4 - 0.05), 4.85, 0);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2), Mt.glass); win.position.set(-sx * (W / 4), 6.4, 0.1); hinge.add(win);
    doors.push({ hinge, side: sx });
    void d;
  }
  g.userData.doors = doors;
  g.userData.setDoors = (open) => { for (const d of doors) d.hinge.rotation.y = d.side * open * 1.9; };
  g.userData.size = [W, 8.8, 18.9];
  return g;
}

/** The SWAT truck: an armoured box on a pickup chassis. */
export function buildSwatTruck() {
  const Mt = mats();
  const g = new THREE.Group();
  const W = 8.6;
  const paint = std({ color: 0x1c2430, roughness: 0.55, metalness: 0.4, envMap: ENV, envMapIntensity: 0.5 });
  const prof = [[-10.5, 1.4], [-10.6, 3.6], [-9.8, 5.0], [-6.2, 5.6], [-4.8, 9.2], [10.2, 9.3], [10.4, 1.4]];
  mesh(profileBody(prof, W, 0.15), paint, 0, 0, 0, g);
  for (const sx of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), Mt.glass); sw.position.set(sx * (W / 2 + 0.03), 7.4, -3.4); sw.rotation.y = sx * Math.PI / 2; g.add(sw);
    for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), Mt.black); p.position.set(sx * (W / 2 + 0.03), 6.8, 0 + i * 3); p.rotation.y = sx * Math.PI / 2; g.add(p); }
  }
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.6, 2.4), Mt.glass); ws.position.set(0, 7.6, -5.45); ws.rotation.set(0.37, Math.PI, 0); g.add(ws);
  g.userData.wheels = [];
  for (const [x, z] of [[-W / 2 + 0.7, -6.8], [W / 2 - 0.7, -6.8], [-W / 2 + 0.7, 6.4], [W / 2 - 0.7, 6.4]]) g.userData.wheels.push(wheel(g, x, 1.9, z, 1.9, 1.4));
  box(g, Mt.black, W - 0.4, 1.4, 0.6, 0, 2.2, -10.7);
  for (const sx of [-1, 1]) box(g, Mt.head, 1.2, 0.6, 0.2, sx * 3, 4.2, -10.62);
  box(g, Mt.darkSteel, 2.6, 1.2, 2.6, 0, 9.9, 1.0); // roof hatch
  const bar = new THREE.Group(); bar.position.set(0, 9.4, -4.2); g.add(bar);
  const red = box(bar, Mt.red.clone(), 1.6, 0.4, 0.5, -1.0, 0.1, 0);
  const blue = box(bar, Mt.blue.clone(), 1.6, 0.4, 0.5, 1.0, 0.1, 0);
  g.userData.lightbar = { red, blue };
  const tex = textTex(256, 96, (x, w) => { x.clearRect(0, 0, w, 96); x.fillStyle = '#e8e8e8'; x.font = 'bold 60px Arial'; x.fillText('SWAT', 52, 66); x.font = 'bold 16px Arial'; x.fillText('ROBLOXIA CITY POLICE', 40, 88); });
  for (const sx of [-1, 1]) sideDecal(g, tex, 7, 2.6, sx * (W / 2 + 0.04), 4.6, 3, sx);
  g.userData.size = [W, 10, 21];
  return g;
}

/** A police helicopter with spinning rotors and a searchlight. */
export function buildHelicopter() {
  const Mt = mats();
  const g = new THREE.Group();
  const paint = std({ color: 0x1a2a4a, roughness: 0.35, metalness: 0.5, envMap: ENV, envMapIntensity: 0.7 });
  const white = std({ color: 0xf0f0f0, roughness: 0.35, metalness: 0.4, envMap: ENV, envMapIntensity: 0.7 });
  const cabin = mesh(new THREE.SphereGeometry(3.4, 24, 16), paint, 0, 3.6, 0, g); cabin.scale.set(1, 0.95, 1.75);
  const belly = mesh(new THREE.SphereGeometry(3.42, 24, 16, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), white, 0, 3.6, 0, g); belly.scale.set(1, 0.95, 1.75);
  const glass = mesh(new THREE.SphereGeometry(3.45, 20, 12, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.18, Math.PI * 0.42), Mt.glass, 0, 3.6, 0, g); glass.scale.set(1, 0.95, 1.75);
  const boom = mesh(new THREE.CylinderGeometry(0.55, 1.1, 11, 12), paint, 0, 4.2, 10.5, g); boom.rotation.x = Math.PI / 2 - 0.06;
  box(g, paint, 0.3, 3.4, 1.8, 0, 5.6, 15.6);
  box(g, paint, 3.4, 0.2, 1.2, 0, 4.4, 14.6);
  const tail = new THREE.Group(); tail.position.set(0.35, 5.6, 15.8); g.add(tail);
  for (const a of [0, Math.PI / 2]) { const b = box(tail, Mt.rotor, 0.08, 3.0, 0.3, 0, 0, 0); b.rotation.x = a; }
  g.userData.tailRotor = tail;
  mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.4, 10), Mt.darkSteel, 0, 7.4, 0.4, g);
  const rotor = new THREE.Group(); rotor.position.set(0, 8.1, 0.4); g.add(rotor);
  for (let i = 0; i < 4; i++) { const b = box(rotor, Mt.rotor, 0.9, 0.08, 11, 0, 0, 5.5); const piv = new THREE.Group(); piv.rotation.y = i * Math.PI / 2; piv.add(b); rotor.add(piv); }
  g.userData.rotor = rotor;
  for (const sx of [-1, 1]) {
    const skid = mesh(new THREE.CylinderGeometry(0.18, 0.18, 9, 8), Mt.darkSteel, sx * 2.4, 0.2, 0.3, g); skid.rotation.x = Math.PI / 2;
    for (const z of [-1.8, 2.2]) { const s = mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.0, 6), Mt.darkSteel, sx * 2.1, 1.1, z, g); s.rotation.z = sx * 0.35; }
  }
  // searchlight under the nose and its beam
  mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.7, 10), Mt.chrome, 0, 1.0, -4.4, g);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(9, 60, 20, 1, true), Mt.cone);
  beam.geometry.translate(0, -30, 0);
  beam.position.set(0, 1.0, -4.4); beam.rotation.x = -0.45; g.add(beam);
  g.userData.beam = beam;
  const tex = textTex(256, 64, (x, w) => { x.clearRect(0, 0, w, 64); x.fillStyle = '#ffffff'; x.font = 'bold 44px Arial'; x.fillText('POLICE', 40, 48); });
  for (const sx of [-1, 1]) sideDecal(g, tex, 4.6, 1.15, sx * 3.3, 4.6, 0.8, sx);
  const red = box(g, Mt.red.clone(), 0.5, 0.3, 0.5, 0, 1.0, 1.5);
  const blue = box(g, Mt.blue.clone(), 0.5, 0.3, 0.5, 0, 6.8, 9);
  g.userData.lightbar = { red, blue };
  return g;
}

/** Flash a vehicle's red and blue lights (call every frame). */
export function flashLights(v, t) {
  const lb = v.userData.lightbar;
  if (!lb) return;
  const ph = Math.floor(t * 8) % 4;
  lb.red.material.emissiveIntensity = ph === 0 || ph === 1 ? 3 : 0.1;
  lb.blue.material.emissiveIntensity = ph === 2 || ph === 3 ? 3 : 0.1;
}

// --- heist equipment --------------------------------------------------------------------------------------
/** The thermal drill clamped to the vault door. Its bit spins in userData.bit. */
export function buildDrill() {
  const Mt = mats();
  const g = new THREE.Group();
  box(g, Mt.darkSteel, 4.2, 0.4, 0.4, 0, 2.0, 0);
  box(g, Mt.darkSteel, 4.2, 0.4, 0.4, 0, -2.0, 0);
  for (const sx of [-1, 1]) box(g, Mt.darkSteel, 0.4, 4.4, 0.4, sx * 2.0, 0, 0);
  const body = box(g, Mt.orange, 2.2, 2.4, 3.2, 0, 0, -1.8); void body;
  box(g, Mt.black, 2.3, 0.3, 3.3, 0, 1.25, -1.8);
  const motor = mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 16), Mt.darkSteel, 0, 0, -4.2, g); motor.rotation.x = Math.PI / 2;
  const bit = mesh(new THREE.CylinderGeometry(0.22, 0.12, 2.0, 8), Mt.chrome, 0, 0, 0.6, g); bit.rotation.x = Math.PI / 2;
  const panel = box(g, Mt.black, 1.4, 0.9, 0.1, 0, 0.3, -3.42); void panel;
  const light = box(g, std({ color: 0x103010, emissive: 0x20ff40, emissiveIntensity: 1.5 }), 0.3, 0.3, 0.12, 0.4, 0.95, -3.45);
  g.userData.bit = bit; g.userData.light = light;
  for (const c of g.children) { c.castShadow = true; }
  return g;
}

/** A black duffel bag; `fill` 0..1 makes it bulge. */
export function buildBag(fill = 1) {
  const g = new THREE.Group();
  const mat = std({ map: toTex(canvas(128, 64, (x, w, h) => {
    x.fillStyle = '#1c1c1e'; x.fillRect(0, 0, w, h); noise(x, w, h, 18);
    x.fillStyle = '#3a3a3c'; x.fillRect(0, h / 2 - 2, w, 4);
    x.fillStyle = '#888'; for (let i = 0; i < w; i += 4) x.fillRect(i, h / 2 - 1, 2, 2);
  })), roughness: 0.9 });
  const b = mesh(new THREE.CapsuleGeometry(0.75, 2.0, 6, 12), mat); b.rotation.z = Math.PI / 2; b.scale.set(1, 1, 0.85 + 0.25 * fill); g.add(b);
  const strap = mesh(new THREE.TorusGeometry(0.75, 0.08, 6, 12, Math.PI), std({ color: 0x111111 }), 0, 0.6, 0, g); void strap;
  return g;
}

/** A stack of cash bundles (n bundles). */
export function cashStack(n = 24, cols = 4, rows = 3) {
  const Mt = mats();
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.9, 0.36, 0.45);
  let i = 0;
  for (let y = 0; i < n; y++) for (let r = 0; r < rows && i < n; r++) for (let c = 0; c < cols && i < n; c++, i++) {
    const m = new THREE.Mesh(geo, Mt.cash);
    m.position.set((c - (cols - 1) / 2) * 0.95, 0.18 + y * 0.37, (r - (rows - 1) / 2) * 0.48);
    m.rotation.y = (Math.random() - 0.5) * 0.06;
    m.castShadow = true; g.add(m);
  }
  return g;
}

/** A pyramid of gold bars on a pallet. */
export function goldStack(levels = 4) {
  const Mt = mats();
  const g = new THREE.Group();
  const s = new THREE.Shape(); s.moveTo(-0.55, 0); s.lineTo(0.55, 0); s.lineTo(0.42, 0.42); s.lineTo(-0.42, 0.42); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: false }); geo.translate(0, 0, -0.8);
  for (let l = 0; l < levels; l++) {
    const n = levels - l;
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
      const m = new THREE.Mesh(geo, Mt.gold);
      m.position.set((i - (n - 1) / 2) * 1.15, 0.6 + l * 0.43, (j - 0.5) * 1.7);
      m.castShadow = true; g.add(m);
    }
  }
  box(g, std({ color: 0x8a6a40, roughness: 0.9 }), levels * 1.2 + 0.4, 0.6, 3.8, 0, 0.3, 0);
  return g;
}

// --- masks --------------------------------------------------------------------------------------------------
export const MASKS = {
  hockey: { name: 'Hockey Mask', draw(x, w, h) {
    x.fillStyle = '#ece8dc'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#c01818';
    for (const sx of [-1, 1]) { x.beginPath(); x.moveTo(w / 2 + sx * 30, 26); x.lineTo(w / 2 + sx * 44, 40); x.lineTo(w / 2 + sx * 30, 54); x.lineTo(w / 2 + sx * 36, 40); x.fill(); }
    x.beginPath(); x.moveTo(w / 2 - 8, 14); x.lineTo(w / 2, 26); x.lineTo(w / 2 + 8, 14); x.fill();
    x.fillStyle = '#1a1a1a';
    for (const sx of [-1, 1]) { x.beginPath(); x.ellipse(w / 2 + sx * 22, 62, 13, 9, 0, 0, 7); x.fill(); }
    for (let i = 0; i < 14; i++) { x.beginPath(); x.arc(w / 2 + ((i % 7) - 3) * 9, 92 + Math.floor(i / 7) * 12, 2.6, 0, 7); x.fill(); }
  } },
  clown: { name: 'Clown', draw(x, w, h) {
    x.fillStyle = '#f6f2ee'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#2050c0';
    for (const sx of [-1, 1]) { x.beginPath(); x.moveTo(w / 2 + sx * 22, 38); x.lineTo(w / 2 + sx * 32, 62); x.lineTo(w / 2 + sx * 22, 86); x.lineTo(w / 2 + sx * 12, 62); x.fill(); }
    x.fillStyle = '#111'; for (const sx of [-1, 1]) { x.beginPath(); x.ellipse(w / 2 + sx * 22, 62, 7, 5, 0, 0, 7); x.fill(); }
    x.fillStyle = '#d01010'; x.beginPath(); x.arc(w / 2, 80, 10, 0, 7); x.fill();
    x.lineWidth = 9; x.strokeStyle = '#d01010'; x.beginPath(); x.arc(w / 2, 82, 30, 0.2, Math.PI - 0.2); x.stroke();
    x.lineWidth = 3; x.strokeStyle = '#111'; x.beginPath(); x.arc(w / 2, 84, 26, 0.35, Math.PI - 0.35); x.stroke();
    x.fillStyle = '#e83a2a'; for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(i * 16 + 2, 8, 12, 0, 7); x.fill(); }
  } },
  skull: { name: 'Skull', draw(x, w, h) {
    x.fillStyle = '#e8e2d0'; x.fillRect(0, 0, w, h);
    const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, 90); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,80,60,0.5)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#141210';
    for (const sx of [-1, 1]) { x.beginPath(); x.ellipse(w / 2 + sx * 22, 58, 15, 13, 0, 0, 7); x.fill(); }
    x.beginPath(); x.moveTo(w / 2, 72); x.lineTo(w / 2 - 7, 88); x.lineTo(w / 2 + 7, 88); x.fill();
    x.fillStyle = '#f4f0e4'; for (let i = -3; i <= 3; i++) x.fillRect(w / 2 + i * 7 - 3, 98, 5, 12);
    x.strokeStyle = '#141210'; x.lineWidth = 2; x.strokeRect(w / 2 - 25, 97, 50, 14);
  } },
  pig: { name: 'Pig', draw(x, w, h) {
    x.fillStyle = '#f2a8b0'; x.fillRect(0, 0, w, h); blotches(x, w, h, 10, 'rgba(220,120,130,0.4)', 8, 26);
    x.fillStyle = '#1a1010'; for (const sx of [-1, 1]) { x.beginPath(); x.arc(w / 2 + sx * 22, 54, 6, 0, 7); x.fill(); }
    x.fillStyle = '#e88894'; x.beginPath(); x.ellipse(w / 2, 82, 20, 14, 0, 0, 7); x.fill();
    x.fillStyle = '#7a3a40'; for (const sx of [-1, 1]) { x.beginPath(); x.ellipse(w / 2 + sx * 7, 82, 4, 6, 0, 0, 7); x.fill(); }
    x.strokeStyle = '#a04050'; x.lineWidth = 3; x.beginPath(); x.arc(w / 2, 100, 14, 0.3, Math.PI - 0.3); x.stroke();
  }, ears: 0xf2a8b0 },
  monkey: { name: 'Monkey', draw(x, w, h) {
    x.fillStyle = '#5a3a20'; x.fillRect(0, 0, w, h); noise(x, w, h, 30);
    x.fillStyle = '#d8b088'; x.beginPath(); x.ellipse(w / 2, 74, 40, 46, 0, 0, 7); x.fill();
    x.fillStyle = '#1a1008'; for (const sx of [-1, 1]) { x.beginPath(); x.arc(w / 2 + sx * 16, 58, 6, 0, 7); x.fill(); }
    x.fillStyle = '#3a2410'; for (const sx of [-1, 1]) { x.beginPath(); x.arc(w / 2 + sx * 5, 80, 3, 0, 7); x.fill(); }
    x.strokeStyle = '#3a2410'; x.lineWidth = 3; x.beginPath(); x.arc(w / 2, 90, 18, 0.2, Math.PI - 0.2); x.stroke();
  }, ears: 0x5a3a20 },
  tiger: { name: 'Tiger', draw(x, w, h) {
    x.fillStyle = '#e88a20'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f8f0e0'; x.beginPath(); x.ellipse(w / 2, 92, 34, 26, 0, 0, 7); x.fill();
    x.fillStyle = '#141010';
    for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(0, 20 + i * 18); x.lineTo(30, 26 + i * 18); x.lineTo(0, 30 + i * 18); x.fill(); x.beginPath(); x.moveTo(w, 20 + i * 18); x.lineTo(w - 30, 26 + i * 18); x.lineTo(w, 30 + i * 18); x.fill(); }
    for (let i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(w / 2 + i * 14, 0); x.lineTo(w / 2 + i * 14 + 4, 28); x.lineTo(w / 2 + i * 14 + 8, 0); x.fill(); }
    x.fillStyle = '#2a8a20'; for (const sx of [-1, 1]) { x.beginPath(); x.ellipse(w / 2 + sx * 22, 58, 9, 6, 0, 0, 7); x.fill(); }
    x.fillStyle = '#111'; for (const sx of [-1, 1]) x.fillRect(w / 2 + sx * 22 - 1.5, 52, 3, 12);
    x.fillStyle = '#d0607a'; x.beginPath(); x.moveTo(w / 2 - 9, 78); x.lineTo(w / 2 + 9, 78); x.lineTo(w / 2, 88); x.fill();
  }, ears: 0xe88a20 },
};
const MASK_TEX = {};
export function maskTexture(id) {
  if (!MASK_TEX[id]) MASK_TEX[id] = toTex(canvas(160, 128, (x, w, h) => MASKS[id].draw(x, w, h)));
  return MASK_TEX[id];
}
/** A mask that fits over a character's head (add it to model.head). */
export function buildMask(id) {
  const g = new THREE.Group();
  const def = MASKS[id] || MASKS.hockey;
  const mat = new THREE.MeshStandardMaterial({ map: maskTexture(id), roughness: 0.45 });
  const front = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.66, 1.28, 22, 1, true, Math.PI / 2, Math.PI), mat);
  front.position.y = 0.0; g.add(front);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.69, 0.69, 1.3, 22, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }));
  g.add(cap); // a black hood over the back of the head
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.69, 22).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: id === 'clown' ? 0xe83a2a : 0x1a1a1a, roughness: 0.9 }));
  top.position.y = 0.65; g.add(top);
  if (def.ears) for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshStandardMaterial({ color: def.ears, roughness: 0.8 }));
    e.scale.set(1, 1, 0.4); e.position.set(sx * 0.58, 0.55, 0); g.add(e);
  }
  if (id === 'pig') { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.25, 14), mat); s.rotation.x = Math.PI / 2; s.position.set(0, -0.18, -0.74); g.add(s); }
  if (id === 'clown') { const n = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd01010, roughness: 0.3 })); n.position.set(0, -0.08, -0.76); g.add(n); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
