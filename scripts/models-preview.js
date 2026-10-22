// Model preview stage for Battlespace's procedural model library.
// Served by Vite from the repo root: http://localhost:5199/scripts/models-preview.html
// window.setView(name) builds a view and renders one frame (used by models-shot.mjs);
// with no ?view= parameter the page is interactive (orbit controls).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildVehicleModel, buildAircraftModel, buildPropModel } from '/src/render/models/index.js';
import { VEHICLE_SPECS, AIRCRAFT_SPECS, PROP_KINDS } from '/src/sim/specs.js';

const params = new window.URLSearchParams(location.search);
const W = Number(params.get('w')) || window.innerWidth;
const H = Number(params.get('h')) || window.innerHeight;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa7b9cb);
const camera = new THREE.PerspectiveCamera(35, W / H, 0.05, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.addEventListener('change', () => render());

const hemi = new THREE.HemisphereLight(0xcfe0f2, 0x6a5d48, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0dc, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

const groundMat = new THREE.MeshStandardMaterial({ color: 0x6f6d55, roughness: 1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(400, 400, 0x5f5e48, 0x66644d);
grid.position.y = 0.002;
grid.material.transparent = true;
grid.material.opacity = 0.35;
scene.add(grid);

const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
const blurMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const markerMats = {
  muzzle: new THREE.MeshBasicMaterial({ color: 0xff2020 }),
  smoke: new THREE.MeshBasicMaterial({ color: 0x20a0ff }),
  exhaust: new THREE.MeshBasicMaterial({ color: 0xffa000 }),
  misc: new THREE.MeshBasicMaterial({ color: 0xff00ff }),
};
const markerGeo = new THREE.SphereGeometry(1, 10, 8);

const stage = new THREE.Group();
scene.add(stage);
const labelsEl = document.getElementById('labels');
const titleEl = document.getElementById('title');
const hudEl = document.getElementById('hud');
let labels = [];
let triTotal = 0;

function mesh(geo, mat = bodyMat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = mat === bodyMat;
  m.receiveShadow = mat === bodyMat;
  triTotal += geo.attributes.position.count / 3;
  return m;
}

function marker(parent, p, kind = 'misc', r = 0.06) {
  const m = new THREE.Mesh(markerGeo, markerMats[kind]);
  m.position.fromArray(p);
  m.scale.setScalar(r);
  parent.add(m);
}

export function vehicle(type, faction, pose = {}) {
  const spec = VEHICLE_SPECS[type];
  const { parts } = buildVehicleModel(type, faction);
  const root = new THREE.Group();
  root.add(mesh(parts.hull));
  const tp = new THREE.Group();
  tp.position.fromArray(spec.turretPivot);
  tp.rotation.y = pose.yaw ?? 0;
  root.add(tp);
  tp.add(mesh(parts.turret));
  const gp = new THREE.Group();
  gp.position.fromArray(spec.gunPivot);
  gp.rotation.x = -(pose.elev ?? 0);
  tp.add(gp);
  gp.add(mesh(parts.gun));
  if (parts.radar) {
    const r = mesh(parts.radar);
    r.position.fromArray(spec.radarPivot);
    r.rotation.y = pose.radar ?? 0;
    tp.add(r);
  }
  if (parts.emissive) root.add(mesh(parts.emissive, glowMat));
  if (pose.markers) {
    if (spec.twinGunOffsetX) {
      marker(gp, [spec.twinGunOffsetX, 0, spec.barrelLength], 'muzzle');
      marker(gp, [-spec.twinGunOffsetX, 0, spec.barrelLength], 'muzzle');
    } else if (spec.tubes) {
      const { cols, rows, spacing } = spec.tubes;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        marker(gp, [(c - (cols - 1) / 2) * spacing, (r - (rows - 1) / 2) * spacing, spec.barrelLength], 'muzzle', 0.05);
      }
    } else marker(gp, [0, 0, spec.barrelLength], 'muzzle');
    if (spec.coaxOffset) marker(gp, spec.coaxOffset, 'misc', 0.04);
    for (const s of spec.smokeLaunchers || []) marker(tp, s, 'smoke');
    if (spec.roofMgPivot) marker(tp, spec.roofMgPivot, 'misc');
    if (spec.atgmLauncher) marker(tp, spec.atgmLauncher, 'misc');
    if (spec.radarPivot) marker(tp, spec.radarPivot, 'misc');
    if (spec.exhaust) marker(root, spec.exhaust, 'exhaust');
    if (spec.dismount) marker(root, spec.dismount, 'misc');
  }
  root.userData.size = [spec.width, spec.height, spec.length];
  return root;
}

export function aircraft(type, faction, pose = {}) {
  const spec = AIRCRAFT_SPECS[type];
  const { parts } = buildAircraftModel(type, faction);
  const root = new THREE.Group();
  root.add(mesh(parts.body));
  const blur = pose.blur ?? false;
  if (parts.rotor && spec.rotorPivot) {
    const r = blur && parts.rotorBlur ? mesh(parts.rotorBlur, blurMat) : mesh(parts.rotor);
    r.position.fromArray(spec.rotorPivot);
    r.rotation.y = pose.rotor ?? 0.4;
    root.add(r);
    if (blur && pose.both) { const r2 = mesh(parts.rotor); r2.position.fromArray(spec.rotorPivot); r2.rotation.y = 0.4; root.add(r2); }
  }
  if (parts.tailRotor && spec.tailRotorPivot) {
    const r = blur && parts.tailRotorBlur ? mesh(parts.tailRotorBlur, blurMat) : mesh(parts.tailRotor);
    r.position.fromArray(spec.tailRotorPivot);
    r.rotation.x = pose.tail ?? 0.3;
    root.add(r);
  }
  if (parts.propBlur && blur) root.add(mesh(parts.propBlur, blurMat));
  if (parts.emissive) root.add(mesh(parts.emissive, glowMat));
  if (pose.markers) {
    const pts = [spec.rotorPivot, spec.tailRotorPivot, spec.gunPivot, spec.gun, spec.cockpit, spec.nozzle, spec.camera, spec.propPivot, spec.rampPivot]
      .filter(Boolean);
    for (const p of pts) marker(root, p, 'misc', spec.length > 3 ? 0.12 : 0.012);
    for (const list of [spec.rocketPods, spec.missileRails, spec.pylons, spec.doorGuns, spec.propPivots, spec.jumpDoors, spec.exits]) {
      for (const p of list || []) marker(root, p, 'smoke', spec.length > 3 ? 0.12 : 0.012);
    }
  }
  root.userData.size = [spec.width, spec.height, spec.length];
  return root;
}

export function prop(kind, variant = 0, lod = 0) {
  const p = buildPropModel(kind, variant);
  const root = new THREE.Group();
  root.add(mesh(lod && p.lod1 ? p.lod1 : p.lod0));
  return root;
}

function addLabel(text, pos) {
  const el = document.createElement('div');
  el.className = 'label';
  el.textContent = text;
  labelsEl.appendChild(el);
  labels.push({ el, pos: new THREE.Vector3(...pos) });
}

function clearStage() {
  for (const c of [...stage.children]) {
    stage.remove(c);
    c.traverse((o) => { if (o.geometry && o.geometry !== markerGeo) o.geometry.dispose(); });
  }
  labelsEl.innerHTML = '';
  labels = [];
  triTotal = 0;
}

function place(obj, x, y, z, label, ry = 0) {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  stage.add(obj);
  if (label) {
    const h = obj.userData.labelH ?? (new THREE.Box3().setFromObject(obj).max.y + 0.4);
    addLabel(label, [x, h, z]);
  }
  return obj;
}

// Camera at spherical direction (azimuth from +Z toward +X, elevation) fitting a box.
function frame(box, az, el, o = {}) {
  const fov = o.fov ?? 35;
  camera.fov = fov;
  camera.aspect = W / H;
  const c = box.getCenter(new THREE.Vector3());
  if (o.target) c.fromArray(o.target);
  const r = box.getSize(new THREE.Vector3()).length() / 2;
  const d = (o.dist ?? (r / Math.sin((fov * Math.PI) / 360))) * (o.zoom ?? 1);
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  camera.position.copy(c).addScaledVector(dir, d);
  camera.near = Math.max(0.01, d / 200);
  camera.far = d * 20 + 100;
  camera.lookAt(c);
  camera.updateProjectionMatrix();
  controls.target.copy(c);
  // key light from the camera's left, 50 degrees up; shadow box around the stage
  const sr = Math.max(r * 1.2, 2);
  const saz = az + (o.sunAz ?? 0.75), sel = o.sunEl ?? 0.87;
  sun.position.copy(c).add(new THREE.Vector3(Math.sin(saz) * Math.cos(sel), Math.sin(sel), Math.cos(saz) * Math.cos(sel)).multiplyScalar(sr * 3));
  sun.target.position.copy(c);
  const sc = sun.shadow.camera;
  sc.left = -sr; sc.right = sr; sc.top = sr; sc.bottom = -sr; sc.near = 0.1; sc.far = sr * 8;
  sc.updateProjectionMatrix();
}

function stageBox() {
  return new THREE.Box3().setFromObject(stage);
}

const GROUND = Object.keys(VEHICLE_SPECS);
const AIR = Object.keys(AIRCRAFT_SPECS);
const RAD = Math.PI / 180;
const ANGLES = {
  fl: [35, 22], fr: [-35, 22], rl: [145, 22], rr: [-145, 22], side: [90, 4], front: [0, 6], rear: [180, 8], top: [0, 80], low: [30, 6],
};

const angleOf = (a) => (Array.isArray(a) ? a : ANGLES[a || 'fl']);

const VIEWS = {
  ground(o) {
    GROUND.forEach((t, i) => {
      const x = (i - (GROUND.length - 1) / 2) * 10.5;
      place(vehicle(t, 0, o.pose), x, 0, 5, `${t} · coalition`);
      place(vehicle(t, 1, o.pose), x, 0, -6, `${t} · federation`);
    });
    const [az, el] = angleOf(o.angle);
    frame(stageBox(), az * RAD, el * RAD, { zoom: 0.62 });
  },
  groundRow(o) {
    // faction lineup as a grid (o.cols columns), facing the camera
    const types = o.types || GROUND;
    const cols = o.cols ?? 4;
    types.forEach((t, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const n = Math.min(cols, types.length - r * cols);
      place(vehicle(t, o.faction, o.pose), (c - (n - 1) / 2) * (o.spacing ?? 10), 0, -r * (o.rowGap ?? 11), `${t} · ${o.faction ? 'federation' : 'coalition'}`);
    });
    const [az, el] = angleOf(o.angle);
    frame(stageBox(), az * RAD, el * RAD, { zoom: o.zoom ?? 0.62 });
  },
  vehicle(o) {
    const v = place(vehicle(o.type, o.faction, o.pose), 0, 0, 0, o.label === false ? null : `${o.type} · ${o.faction ? 'federation' : 'coalition'}`);
    const [az, el] = angleOf(o.angle);
    frame(new THREE.Box3().setFromObject(v), az * RAD, el * RAD, { zoom: o.zoom ?? 0.8 });
  },
  pair(o) {
    place(vehicle(o.type, 0, o.pose), -o.gap ?? -3, 0, 0, `${o.type} · coalition`);
    place(vehicle(o.type, 1, o.pose), o.gap ?? 3, 0, 0, `${o.type} · federation`);
    const [az, el] = angleOf(o.angle);
    frame(stageBox(), az * RAD, el * RAD, { zoom: o.zoom ?? 0.75 });
  },
  aircraft(o) {
    const v = place(aircraft(o.type, o.faction, o.pose), 0, o.y ?? 0, 0, `${o.type} · ${o.faction ? 'federation' : 'coalition'}`);
    const [az, el] = angleOf(o.angle);
    frame(new THREE.Box3().setFromObject(v), az * RAD, el * RAD, { zoom: o.zoom ?? 0.8 });
  },
  airRow(o) {
    // both factions of each type side by side; types stacked front to back
    const types = o.types;
    let z = 0;
    for (const t of types) {
      const sp = AIRCRAFT_SPECS[t];
      const w = Math.max(sp.width, (sp.rotorRadius || 0) * 2) + (o.pad ?? 2);
      for (const f of [0, 1]) {
        const a = aircraft(t, f, o.pose);
        const y = (sp.skidHeight ?? 0) + (o.lift ?? 0);
        place(a, (f - 0.5) * w, y, z, `${t} · ${f ? 'federation' : 'coalition'}`);
      }
      z -= Math.max(sp.length, (sp.rotorRadius || 0) * 2) * 1.1 + (o.pad ?? 2);
    }
    const [az, el] = angleOf(o.angle);
    frame(stageBox(), az * RAD, el * RAD, { zoom: o.zoom ?? 0.7 });
  },
  props(o) {
    // grid sorted by size so small props sit in front of trees and masts
    const kinds = o.kinds || PROP_KINDS;
    const cols = o.cols ?? 7;
    const sp = o.spacing ?? 7;
    const order = o.kinds ? kinds : [
      'debris_concrete', 'debris_metal', 'rock', 'bush', 'tank_trap', 'fuel_drums', 'crates',
      'sandbags', 'hesco', 'jersey_barrier', 'car', 'car_wreck', 'fuel_tank', 'parachute',
      'street_lamp', 'power_pole', 'guard_tower', 'tree_dead', 'tree_broadleaf', 'tree_pine', 'radio_mast',
    ];
    order.forEach((k, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = (c - (cols - 1) / 2) * sp * (1 + r * 0.35);
      const z = -r * sp * 1.6;
      place(prop(k, o.variant ?? 0, o.lod ?? 0), x, k === 'parachute' ? 0.9 : 0, z, k);
    });
    const [az, el] = angleOf(o.angle);
    frame(o.focus ? new THREE.Box3(new THREE.Vector3(...o.focus[0]), new THREE.Vector3(...o.focus[1])) : stageBox(), az * RAD, el * RAD, { zoom: o.zoom ?? 0.62 });
  },
  variants(o) {
    const n = o.count ?? 6;
    const sp = o.spacing ?? 6;
    for (let v = 0; v < n; v++) {
      place(prop(o.kind, v, o.lod ?? 0), (v - (n - 1) / 2) * sp, 0, 0, `${o.kind} v${v}`);
      if (o.withLod1) place(prop(o.kind, v, 1), (v - (n - 1) / 2) * sp, 0, -sp, `lod1`);
    }
    const [az, el] = angleOf(o.angle);
    frame(stageBox(), az * RAD, el * RAD, { zoom: o.zoom ?? 0.7 });
  },
};

function render() {
  renderer.render(scene, camera);
  const v = new THREE.Vector3();
  for (const l of labels) {
    v.copy(l.pos).project(camera);
    l.el.style.left = `${((v.x + 1) / 2) * W}px`;
    l.el.style.top = `${((1 - v.y) / 2) * H}px`;
    l.el.style.display = v.z < 1 ? '' : 'none';
  }
}

window.setView = (name, opts = {}) => {
  clearStage();
  const t0 = performance.now();
  VIEWS[name](opts);
  const t1 = performance.now();
  titleEl.textContent = opts.title || name;
  hudEl.textContent = `${Math.round(triTotal)} tris · build ${(t1 - t0).toFixed(0)} ms`;
  render();
  return { tris: triTotal, ms: t1 - t0 };
};

window.buildAllTiming = () => {
  const t0 = performance.now();
  for (const t of GROUND) for (const f of [0, 1]) buildVehicleModel(t, f);
  const t1 = performance.now();
  for (const t of AIR) for (const f of [0, 1]) buildAircraftModel(t, f);
  const t2 = performance.now();
  for (const k of PROP_KINDS) buildPropModel(k, 0);
  const t3 = performance.now();
  return { ground: t1 - t0, air: t2 - t1, props: t3 - t2, total: t3 - t0 };
};

const initial = params.get('view');
try {
  if (initial) window.setView(initial, JSON.parse(params.get('opts') || '{}'));
  else if (!params.has('w')) window.setView('ground', {});
} catch (e) {
  console.error(e);
}
window.__ready = true;
