// Dev tool: renders voxel props from src/props/catalog.js in a neutral lit set
// with the game's real materials and post pipeline.
// URL: /tools/props-preview.html?props=dumpster,trashCart&cam=x,y,z,yaw,pitch&seed=1&spacing=2.5&exp=9
//
// Extra query params (all optional):
//   opts=<json>      {propName: opts} or {propName: [opts for 1st occurrence, 2nd, ...]}
//   cols=N           wrap props into rows of N (rows step back along -z by rowgap, default spacing)
//   rot=deg          yaw applied to every prop (or rots=a,b,c per prop)
//   light=studio     brighter neutral light for inspecting detail (default 'night')
//   wall=0           hide the back wall; wallz=<z> wall front-face position (default -1.35)
//   ref=1            1.75 m human reference silhouette at the left
//   fog=0            disable volumetric fog
//   paint=fake|gen   pass a test paint canvas as opts.paint ('gen' uses the graffiti module)
//   cams=a;b;c       several "x,y,z,yaw,pitch" cameras rendered as tiles (tcols=N columns)
//   parts=0          hide parts;  lamps=0  no preview lights at lamp anchors;  panes=0  hide pane stand-ins
//   cam=auto:yaw,pitch[,zoom[,index]]  auto-frame all props (or prop #index); works inside cams= too
// Wall / opening props (meta.mount 'wall'|'opening') are placed on the wall face automatically,
// at height meta.previewY (default 0).
import * as THREE from 'three';
import { createNoiseTextures, shared } from '../src/render/shaderlib.js';
import { createVoxelMaterial } from '../src/render/voxelMaterial.js';
import { meshModel } from '../src/voxel/mesher.js';
import { Post } from '../src/render/Post.js';
import { RNG } from '../src/core/rng.js';
import { PROPS } from '../src/props/catalog.js';

const q = new URLSearchParams(location.search);
const names = (q.get('props') ?? Object.keys(PROPS).slice(0, 6).join(',')).split(',').filter(Boolean);
const seed = parseInt(q.get('seed') ?? '1', 10);
const spacing = parseFloat(q.get('spacing') ?? '2.6');
const exposure = parseFloat(q.get('exp') ?? '9');
const optsJson = q.get('opts') ? JSON.parse(q.get('opts')) : {};
const cols = parseInt(q.get('cols') ?? '0', 10) || names.length;
const rowGap = parseFloat(q.get('rowgap') ?? String(spacing));
const studio = q.get('light') === 'studio';
const showWall = q.get('wall') !== '0';
const wallFront = parseFloat(q.get('wallz') ?? '-1.35');
const rots = (q.get('rots') ?? '').split(',').filter((s) => s !== '').map(Number);
const rotAll = parseFloat(q.get('rot') ?? '0');
const showParts = q.get('parts') !== '0';
const lampLights = q.get('lamps') !== '0';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(parseFloat(q.get('fov') ?? '50'), innerWidth / innerHeight, 0.03, 300);
createNoiseTextures();

// constant irradiance volume (open-ish sky)
function constVol(r, g, b, a) {
  const d = new Uint16Array(8 * 4);
  for (let i = 0; i < 8; i++) {
    d[i * 4] = THREE.DataUtils.toHalfFloat(r);
    d[i * 4 + 1] = THREE.DataUtils.toHalfFloat(g);
    d[i * 4 + 2] = THREE.DataUtils.toHalfFloat(b);
    d[i * 4 + 3] = THREE.DataUtils.toHalfFloat(a);
  }
  const t = new THREE.Data3DTexture(d, 2, 2, 2);
  t.type = THREE.HalfFloatType;
  t.format = THREE.RGBAFormat;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
if (studio) {
  shared.uIrrA.value = constVol(0.03, 0.028, 0.026, 0.9);
  shared.uIrrB.value = constVol(0.8, 0.8, 0.8, 0.8);
  shared.uSkyIrr.value.setRGB(0.22, 0.24, 0.28);
  shared.uSkyIrrSide.value.setRGB(0.2, 0.21, 0.24);
  shared.uGroundIrr.value.setRGB(0.05, 0.05, 0.05);
} else {
  shared.uIrrA.value = constVol(0.004, 0.003, 0.002, 0.5);
  shared.uIrrB.value = constVol(0.42, 0.42, 0.42, 0.42);
  shared.uSkyIrr.value.setRGB(0.09, 0.14, 0.27);
  shared.uSkyIrrSide.value.setRGB(0.12, 0.15, 0.24);
  shared.uGroundIrr.value.setRGB(0.012, 0.012, 0.014);
}
shared.uIrrMin.value.set(-100, -10, -100);
shared.uIrrInvSize.value.set(1 / 200, 1 / 200, 1 / 200);
if (q.has('wet')) shared.uWetness.value = parseFloat(q.get('wet'));

const mat = createVoxelMaterial();
const emissiveMat = createVoxelMaterial({ emissive: parseFloat(q.get('emit') ?? '6') });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.55 }));
ground.receiveShadow = true;
scene.add(ground);
const rows = Math.ceil(names.length / cols);
const wallZ = wallFront - (rows - 1) * rowGap;
if (showWall) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(200, 30, 0.5), new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.9 }));
  wall.position.set(0, 15, wallZ - 0.25);
  wall.receiveShadow = true;
  scene.add(wall);
}
if (q.get('ref') === '1') {
  const fig = new THREE.Group();
  const m2 = new THREE.MeshStandardMaterial({ color: 0x303236, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.0, 4, 12), m2);
  body.position.y = 0.2 + 0.5 + 0.05;
  body.scale.set(1, 1, 0.6);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), m2);
  head.position.y = 1.64;
  fig.add(body, head);
  fig.traverse((o) => (o.castShadow = true));
  const rowW = (Math.min(cols, names.length) - 1) * spacing;
  fig.position.set(-rowW / 2 - spacing * 0.6, 0, 0);
  scene.add(fig);
}

// ── test paint canvas ──
async function makePaint(kind, w = 512, h = 256) {
  if (kind === 'gen') {
    try {
      const mod = await import('../src/textures/graffiti/index.js');
      return mod.generatePropPaint({ seed: seed * 7 + 1, widthM: 2, heightM: 1.2, kind: 'dumpster', density: 0.9 }).color;
    } catch (e) {
      console.warn('graffiti generator unavailable, using fake paint', e);
    }
  }
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const r = new RNG(99);
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = ['#d8d8d0', '#c23a2a', '#2a64c2', '#e0c040', '#101010', '#40b060'][i % 6];
    ctx.lineWidth = r.range(6, 18);
    ctx.lineCap = 'round';
    ctx.beginPath();
    let x = r.range(0, w), y = r.range(0, h);
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += r.range(-90, 90);
      y += r.range(-50, 50);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#e8e8e0';
  ctx.font = `bold ${Math.round(h * 0.35)}px Arial`;
  ctx.fillText('MVSK', w * 0.1, h * 0.6);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 6;
  ctx.strokeText('MVSK', w * 0.1, h * 0.6);
  return c;
}

const paintKind = q.get('paint');
const paintCanvas = paintKind ? await makePaint(paintKind) : null;

const lights = [];
const stats = [];
const occ = {};
names.forEach((name, i) => {
  const gen = PROPS[name];
  if (!gen) {
    console.warn('missing prop', name);
    return;
  }
  const k = (occ[name] = (occ[name] ?? -1) + 1);
  let o = optsJson[name] ?? {};
  if (Array.isArray(o)) o = o[k % o.length] ?? {};
  o = { ...o };
  if (paintCanvas && !o.paint) o.paint = paintCanvas;
  const t0 = performance.now();
  let res;
  try {
    res = gen(new RNG(seed * 1000 + i), o);
  } catch (e) {
    console.error(`prop ${name} failed: ${e.stack}`);
    return;
  }
  const ms = performance.now() - t0;
  const group = new THREE.Group();
  let voxels = 0;
  const add = (model, matrix, emissive) => {
    const geo = meshModel(model);
    const m = new THREE.Mesh(geo, emissive ? emissiveMat : mat);
    if (matrix) m.applyMatrix4(matrix);
    m.castShadow = !emissive;
    m.receiveShadow = true;
    group.add(m);
    voxels += model.grid.count();
    return geo.index ? geo.index.count / 3 : 0;
  };
  const t1 = performance.now();
  let tris = add(res.model);
  let nparts = 0;
  if (showParts)
    for (const p of res.parts ?? []) {
      const mm = new THREE.Matrix4().compose(
        new THREE.Vector3(...(p.position ?? [0, 0, 0])),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rotation ?? [0, 0, 0]))),
        new THREE.Vector3(1, 1, 1),
      );
      tris += add(p.model, mm, p.emissive);
      nparts++;
    }
  const meshMs = performance.now() - t1;
  // preview-only stand-in for the game's glass renderer: meta.panes as simple planes
  if (q.get('panes') !== '0')
    for (const pn of res.meta?.panes ?? []) {
      if (pn.broken) continue;
      const m = new THREE.MeshStandardMaterial({
        color: pn.open ? 0x050505 : pn.screen ? 0x2a2c2e : pn.frosted ? 0x8a9496 : 0x1c262c,
        roughness: pn.open ? 1 : pn.frosted ? 0.5 : 0.06, metalness: 0, transparent: !!pn.screen, opacity: pn.screen ? 0.75 : 1,
      });
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(pn.w, pn.h), m);
      pm.position.set(pn.x + pn.w / 2, pn.y + pn.h / 2, pn.z);
      group.add(pm);
    }
  const col = i % cols, row = Math.floor(i / cols);
  const rowCount = Math.min(cols, names.length - row * cols);
  const rowW = (rowCount - 1) * spacing;
  const mount = res.meta?.mount ?? 'floor';
  const z = mount === 'wall' || mount === 'opening' ? wallZ : -row * rowGap;
  group.position.set(-rowW / 2 + col * spacing, res.meta?.previewY ?? 0, z);
  group.rotation.y = THREE.MathUtils.degToRad(rots[i] ?? rotAll);
  group.userData.prop = name;
  scene.add(group);
  // light the lamps
  const L = res.meta?.anchors?.light;
  if (lampLights && L) {
    group.updateMatrixWorld(true);
    const p = new THREE.Vector3(...L).applyMatrix4(group.matrixWorld);
    const d = new THREE.Vector3(...(res.meta.anchors.lightDir ?? [0, -1, 0])).transformDirection(group.matrixWorld);
    const sl = new THREE.SpotLight(res.meta.lightColor ?? 0xffc080, res.meta.lightIntensity ?? 6, 12, 1.2, 0.8, 2);
    sl.position.copy(p).addScaledVector(d, 0.04);
    sl.target.position.copy(p).addScaledVector(d, 2);
    scene.add(sl, sl.target);
    const pl = new THREE.PointLight(res.meta.lightColor ?? 0xffc080, 0.25, 3, 2);
    pl.position.copy(p).addScaledVector(d, 0.03);
    scene.add(pl);
  }
  const st = { name, ms: +ms.toFixed(1), meshMs: +meshMs.toFixed(1), tris, voxels, parts: nparts, size: res.meta?.size?.map((v) => +v.toFixed(3)) };
  stats.push(st);
  console.log(`prop ${name}: ${ms.toFixed(1)} ms, ${tris} tris, size ${JSON.stringify(res.meta?.size)} | ${JSON.stringify(st)}`);
});
window.__propStats = stats;

const keyI = studio ? 60 : 26;
const key = new THREE.SpotLight(0xffc888, keyI, 40, 0.9, 0.6, 2);
key.position.set(2.5, 6.5, 4.5);
key.target.position.set(0, 0.5, -(rows - 1) * rowGap * 0.5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0003;
scene.add(key, key.target);
const rim = new THREE.SpotLight(0x9ab8ff, studio ? 22 : 8, 40, 1.0, 0.8, 2);
rim.position.set(-5, 5, 3);
rim.target.position.set(0, 0.5, 0);
scene.add(rim, rim.target);
if (studio) {
  const fill = new THREE.HemisphereLight(0xbfcfff, 0x302820, 0.6);
  scene.add(fill);
}
lights.push({ light: key }, { light: rim });

const engineLike = { renderer };
const post = new Post(engineLike, { quality: 'high', exposure });
post.init(lights);
post.fogLightScale = 0.01;
post.fogMat.uniforms.uDensity.value = q.get('fog') === '0' ? 0 : 0.006;
post.setSize(innerWidth, innerHeight, 1);
renderer.shadowMap.needsUpdate = true;

const defaultCam = `0,1.7,${Math.max(4, ((Math.min(cols, names.length) - 1) * spacing) * 0.55 + 3)},0,-12`;
const camList = (q.get('cams') ?? q.get('cam') ?? defaultCam).split(';').filter(Boolean);
// auto framing: "auto:yaw,pitch[,zoom[,index]]" fits the bounds of all props (or prop #index)
function propBounds(index) {
  const box = new THREE.Box3();
  const groups = scene.children.filter((o) => o.isGroup && o.userData.prop);
  groups.forEach((g, i) => {
    if (index != null && i !== index) return;
    g.updateMatrixWorld(true);
    box.expandByObject(g);
  });
  return box;
}
function setCam(s) {
  if (s.startsWith('auto')) {
    const a = (s.split(':')[1] ?? '').split(',').filter((v) => v !== '').map(Number);
    const yaw = THREE.MathUtils.degToRad(a[0] ?? 0), pitch = THREE.MathUtils.degToRad(a[1] ?? -15);
    const zoom = a[2] ?? 1;
    const box = propBounds(a.length > 3 ? a[3] : null);
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const r = Math.max(0.15, 0.5 * Math.hypot(sz.x, sz.y, sz.z));
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const fit = Math.max(r / Math.sin(fov / 2), r / Math.sin(Math.atan(Math.tan(fov / 2) * camera.aspect)));
    const d = (fit * 1.02) / zoom;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    camera.position.copy(c).addScaledVector(dir, d);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    camera.updateMatrixWorld();
    return;
  }
  const c = s.split(',').map(Number);
  camera.position.set(c[0], c[1], c[2]);
  camera.rotation.set(THREE.MathUtils.degToRad(c[4] ?? 0), THREE.MathUtils.degToRad(c[3] ?? 0), 0, 'YXZ');
  camera.updateMatrixWorld();
}
if (camList.length === 1) {
  setCam(camList[0]);
  for (let i = 0; i < 2; i++) post.render(scene, camera, 1 / 60, 2.0);
} else {
  const tcols = parseInt(q.get('tcols') ?? String(Math.ceil(Math.sqrt(camList.length))), 10);
  const trows = Math.ceil(camList.length / tcols);
  const W = renderer.domElement.width, H = renderer.domElement.height;
  const out = document.createElement('canvas');
  out.width = W * tcols;
  out.height = H * trows;
  const ctx = out.getContext('2d');
  camList.forEach((c, i) => {
    setCam(c);
    for (let k = 0; k < 2; k++) post.render(scene, camera, 1 / 60, 2.0);
    ctx.drawImage(renderer.domElement, (i % tcols) * W, Math.floor(i / tcols) * H);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '12px monospace';
    ctx.fillText(c, (i % tcols) * W + 6, Math.floor(i / tcols) * H + 14);
  });
  window.__shotCanvas = out;
}
window.__shotReady = true;
