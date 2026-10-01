// Dev tool: the first-person spray-can viewmodel (src/spray/Viewmodel.js) in a
// mock blue-hour alley with the game's voxel material, baked-irradiance style
// ambient, a warm lamp from above-left, an alley environment map and the real
// Post pipeline (fog, TAA, bloom, AgX grade).
//
// URL: /tools/viewmodel-preview.html?pose=idle&cap=standard&color=d8263a
//
// Params (all optional):
//   pose=idle|spray|shake|menu|walk|reach|look|equip|unequip   state to simulate before the still
//   t=<s>            seconds simulated in the pose (default 1.6; equip/unequip: time since the toggle)
//   cap=skinny|standard|fat|calligraphy
//   color=<hex>      sRGB paint colour (default d8263a);  finish=metal,rough  (chrome: 0.95,0.3)
//   aspect=16:9|9:19.5|<number>  canvas aspect (size from h=, default 720 tall; or w=,h=)
//   cam=fp | orbit:yaw,pitch,dist[,dx,dy,dz]   orbit is relative to the first-person view, around the can
//   cams=a;b;c       several cameras as tiles (tcols=N)
//   strip=N,dt       N tiles stepping the simulation by dt seconds (motion check; pose= sets the state)
//   aim=x,y,z        camera-space spray direction;  aimat=<m> aim at the view centre that far away
//   reach=0..1  walk=amp  lookvel=x,y  pressure=0..1  pitch=<deg> camera pitch
//   exp=<n> exposure (default 10.5);  light=night|studio;  fog=0;  frames=N TAA frames per still
//   shot=1           headless still (sets window.__shotReady); otherwise interactive:
//                    E equip, hold Space spray, hold Q shake, M menu, 1-4 caps, C colour, F finish,
//                    hold W walk, hold R wall close, O orbit, drag to look / orbit
import * as THREE from 'three';
import { createNoiseTextures, shared } from '../src/render/shaderlib.js';
import { Post } from '../src/render/Post.js';
import { createSky } from '../src/render/sky.js';
import { Viewmodel } from '../src/spray/Viewmodel.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
const vec = (k) => (q.has(k) ? q.get(k).split(',').map(Number) : null);
const shot = q.has('shot');
const studio = q.get('light') === 'studio';

// ── canvas size from aspect ──
let aspect = 16 / 9;
if (q.has('aspect')) {
  const a = q.get('aspect');
  aspect = a.includes(':') ? a.split(':').map(Number).reduce((x, y) => x / y) : parseFloat(a);
}
let H = num('h', shot ? 720 : innerHeight);
let W = q.has('w') ? num('w', 1280) : Math.round(H * aspect);
if (!shot && !q.has('h')) {
  W = innerWidth;
  H = innerHeight;
  aspect = W / H;
}
aspect = W / H;

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
canvas.style.width = `${W}px`;
canvas.style.height = `${H}px`;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
createNoiseTextures();

// ── irradiance volume: constant night values (as tools/props-preview) ──
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

// ── mock alley ──
function brickTexture(seed = 1, graffiti = true) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  ctx.fillStyle = '#2b2522';
  ctx.fillRect(0, 0, 1024, 512);
  const bh = 512 / 30, bw = 1024 / 16;
  for (let r = 0; r < 30; r++)
    for (let k = -1; k < 17; k++) {
      const x = k * bw + (r % 2) * bw * 0.5, y = r * bh;
      const v = 0.75 + rnd() * 0.4;
      ctx.fillStyle = `rgb(${Math.round(96 * v)},${Math.round(60 * v)},${Math.round(48 * v)})`;
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 3);
    }
  if (graffiti) {
    const cols = ['#d23a5a', '#2f74d6', '#e8d14a', '#e9e6dc', '#3cb06a', '#101010', '#9b4dd0'];
    for (let i = 0; i < 9; i++) {
      ctx.strokeStyle = cols[i % cols.length];
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 8 + rnd() * 22;
      ctx.lineCap = 'round';
      ctx.beginPath();
      let x = rnd() * 1024, y = 120 + rnd() * 330;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rnd() - 0.4) * 160;
        y += (rnd() - 0.5) * 90;
        ctx.quadraticCurveTo(x - 40, y - 60 * rnd(), x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 120px Arial Black, Arial';
    ctx.fillStyle = '#e9e6dc';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 10;
    ctx.strokeText('KRYO', 280, 330);
    ctx.fillText('KRYO', 280, 330);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
const sky = createSky();
scene.add(sky);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.26, metalness: 0 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 80).rotateX(-Math.PI / 2), groundMat);
ground.position.set(0, 0, -30);
ground.receiveShadow = true;
scene.add(ground);
for (const side of [-1, 1]) {
  const tex = brickTexture(side > 0 ? 3 : 1);
  tex.repeat.set(80 / 6, 8 / 3);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, color: 0xb0a8a2 }));
  wall.rotation.y = -side * Math.PI / 2;
  wall.position.set(side * 2.8, 4, -30);
  wall.receiveShadow = true;
  scene.add(wall);
}
{
  const tex = brickTexture(5);
  tex.repeat.set(1, 8 / 3);
  const end = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, color: 0x8a8480 }));
  end.position.set(0, 4, -40);
  scene.add(end);
  // a wall 1.6 m ahead to the right: something to paint on
  const tex2 = brickTexture(7);
  tex2.repeat.set(1.3, 1);
  const pw = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3), new THREE.MeshStandardMaterial({ map: tex2, roughness: 0.88, color: 0xa09890 }));
  pw.position.set(0.9, 1.5, -2.2);
  pw.receiveShadow = true;
  scene.add(pw);
}
// lamps: warm wall lamp above-left near the player, one further down the alley
const lamps = [];
function lamp(pos, target, color, intensity, angle, shadow) {
  const L = new THREE.SpotLight(color, intensity, 16, angle, 0.75, 2);
  L.position.set(...pos);
  L.target.position.set(...target);
  L.castShadow = shadow;
  if (shadow) {
    L.shadow.mapSize.set(1024, 1024);
    L.shadow.bias = -0.0004;
    L.shadow.normalBias = 0.02;
    L.shadow.radius = 3;
  }
  scene.add(L, L.target);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(16) }));
  head.position.copy(L.position).add(new THREE.Vector3(0, 0.04, 0));
  scene.add(head);
  lamps.push({ light: L });
  return L;
}
const keyI = num('key', studio ? 14 : 7.5);
lamp([-2.5, 3.2, -1.4], [-0.3, 0, -0.8], 0xffb468, keyI, 1.05, true);
lamp([2.5, 3.4, -11], [0.6, 0, -11.5], 0xffc27a, 6, 1.0, false);
if (studio) scene.add(new THREE.HemisphereLight(0xbfcfff, 0x302820, 0.6));

// ── first-person camera + viewmodel ──
const fp = new THREE.PerspectiveCamera(66, aspect, 0.04, 700);
const camPos = vec('campos') ?? [0.35, 1.62, 1.0];
fp.position.set(...camPos);
let yaw = THREE.MathUtils.degToRad(num('yaw', 0));
let pitch = THREE.MathUtils.degToRad(num('pitch', -4));
fp.rotation.set(pitch, yaw, 0, 'YXZ');
scene.add(fp);
fp.updateMatrixWorld();

const t0 = performance.now();
const vm = new Viewmodel({ camera: fp, scene });
const ctorMs = performance.now() - t0;
fp.add(vm.group);

// environment map: the alley captured once without the viewmodel (as the game does)
vm.group.visible = false;
{
  const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cc = new THREE.CubeCamera(0.1, 400, rt);
  cc.position.set(0, 2.0, -2.5);
  scene.add(cc);
  cc.update(renderer, scene);
  scene.remove(cc);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromCubemap(rt.texture).texture;
  pmrem.dispose();
  rt.dispose();
  vm.material.envMap = env;
  vm.material.envMapIntensity = 1;
  vm.material.needsUpdate = true;
  scene.traverse((o) => {
    if (o.material && o.material.isMeshStandardMaterial && o !== ground) {
      o.material.envMap = env;
      o.material.envMapIntensity = 0.6;
    }
  });
}

// paint
const parseColor = (s) => {
  const presets = { red: 0xd8263a, blue: 0x1f5fd6, yellow: 0xf2c21b, green: 0x2fae5a, chrome: 0xc8c8c8, black: 0x161616, white: 0xeeeeea, pink: 0xff4fa0, orange: 0xff7a1a, purple: 0x7a3fd0 };
  if (presets[s] != null) return presets[s];
  return parseInt(s.replace('#', ''), 16);
};
const colorName = q.get('color') ?? 'red';
vm.setColor(parseColor(colorName));
const fin = vec('finish') ?? (colorName === 'chrome' ? [0.95, 0.3] : [0, 0.42]);
vm.setFinish({ metal: fin[0], rough: fin[1] });
vm.setCap(q.get('cap') ?? 'standard');

// ── post ──
const post = new Post({ renderer }, { quality: 'high', exposure: num('exp', 10.5) });
post.init(lamps);
post.fogLightScale = 0.08;
post.fogMat.uniforms.uDensity.value = q.get('fog') === '0' ? 0 : 0.006;
post.setSize(W, H, 1);
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;

// ── state ──
const pose = q.get('pose') ?? 'idle';
const st = {
  equipped: true, spraying: false, pressure: num('pressure', 1), shaking: false,
  walkPhase: 0, walkAmp: 0, lookVel: { x: 0, y: 0 }, aim: new THREE.Vector3(0, 0, -1),
  reach: num('reach', 1), menuOpen: false, time: 0,
};
const aimV = vec('aim');
const aimAt = num('aimat', 1.6);
function updateAim() {
  if (aimV) st.aim.set(...aimV).normalize();
  else {
    // toward the view centre aimAt metres ahead, from the current nozzle (camera space)
    const n = vm.caps[vm.capType].tip;
    n.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(n.matrixWorld);
    fp.worldToLocal(p);
    st.aim.set(-p.x, -p.y, -aimAt - p.z).normalize();
  }
}
function applyPose(name) {
  st.spraying = name === 'spray';
  st.shaking = name === 'shake';
  st.menuOpen = name === 'menu';
  st.walkAmp = name === 'walk' ? num('walk', 1) : num('walk', 0);
  if (name === 'reach') st.reach = num('reach', 0.2);
  const lv = vec('lookvel') ?? (name === 'look' ? [2.5, 0.8] : [0, 0]);
  st.lookVel.x = lv[0];
  st.lookVel.y = lv[1];
}
let simT = 0;
let clicks = 0;
vm.onShakeClick(() => clicks++);
function sim(seconds, fps = 120) {
  const n = Math.round(seconds * fps);
  for (let i = 0; i < n; i++) {
    simT += 1 / fps;
    st.time = simT;
    if (st.walkAmp > 0) st.walkPhase += (1.18 / 0.62) / fps;
    updateAim();
    vm.update(1 / fps, st);
  }
}

// ── cameras ──
const orbitCam = new THREE.PerspectiveCamera(num('ofov', 38), aspect, 0.01, 200);
function setCam(spec) {
  if (!spec || spec === 'fp') return fp;
  const a = spec.split(':')[1].split(',').map(Number);
  const [oy, op, dist = 0.55, dx = 0, dy = 0, dz = 0] = a;
  vm.rig.updateWorldMatrix(true, false);
  const c = new THREE.Vector3(dx, dy - 0.03, dz).applyMatrix4(vm.rig.matrixWorld);
  const ya = THREE.MathUtils.degToRad(oy), pa = THREE.MathUtils.degToRad(op);
  const off = new THREE.Vector3(Math.sin(ya) * Math.cos(pa), Math.sin(pa), Math.cos(ya) * Math.cos(pa)).multiplyScalar(dist);
  off.applyQuaternion(fp.getWorldQuaternion(new THREE.Quaternion()));
  orbitCam.position.copy(c).add(off);
  orbitCam.up.set(0, 1, 0);
  orbitCam.lookAt(c);
  orbitCam.aspect = aspect;
  orbitCam.updateProjectionMatrix();
  orbitCam.updateMatrixWorld();
  return orbitCam;
}
function renderStill(cam, frames) {
  post.taaReset = true;
  for (let i = 0; i < frames; i++) {
    vm.update(0, st);
    post.render(scene, cam, 1 / 60, simT);
  }
}

function stats() {
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  vm.nozzle(p, d);
  const pc = fp.worldToLocal(p.clone());
  const dc = d.clone().transformDirection(fp.matrixWorldInverse);
  const ndc = pc.clone().applyMatrix4(fp.projectionMatrix);
  return {
    ctorMs: +ctorMs.toFixed(1), buildMs: +vm.buildMs.toFixed(1), solveMs: +vm.solveMs.toFixed(1),
    tris: vm.triangleCount(), meshes: vm.meshes.length,
    nozzleCam: pc.toArray().map((v) => +v.toFixed(4)), nozzleDirCam: dc.toArray().map((v) => +v.toFixed(3)),
    nozzleNdc: [+ndc.x.toFixed(3), +ndc.y.toFixed(3)], clicks, visible: vm.visible,
    index: Object.fromEntries(Object.entries(vm.indexSol).map(([k, v]) => [k, v.map((s) => +(s.err * 1000).toFixed(2))])),
    pose: vm.pose,
  };
}

// ── run ──
if (shot) {
  const frames = num('frames', 12);
  if (pose === 'equip' || pose === 'unequip') {
    // start from the opposite state, toggle, simulate t seconds
    st.equipped = pose === 'unequip';
    sim(1.2);
    st.equipped = pose === 'equip';
  } else applyPose(pose);
  const strip = vec('strip');
  const camSpecs = (q.get('cams') ?? q.get('cam') ?? 'fp').split(';').filter(Boolean);
  if (strip) {
    const [N, dt] = strip;
    const t0s = num('t', pose === 'equip' || pose === 'unequip' ? 0 : 1.2);
    sim(t0s);
    const tcols = num('tcols', Math.min(N, 6));
    const out = document.createElement('canvas');
    out.width = W * tcols;
    out.height = H * Math.ceil(N / tcols);
    const ctx = out.getContext('2d');
    for (let i = 0; i < N; i++) {
      if (i > 0) sim(dt);
      renderStill(setCam(camSpecs[0]), num('frames', 4));
      ctx.drawImage(renderer.domElement, (i % tcols) * W, Math.floor(i / tcols) * H);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '13px monospace';
      ctx.fillText(`${pose} t=${simT.toFixed(3)}`, (i % tcols) * W + 6, Math.floor(i / tcols) * H + 16);
    }
    window.__shotCanvas = out;
  } else {
    sim(num('t', pose === 'equip' || pose === 'unequip' ? 0.3 : 1.6));
    if (camSpecs.length === 1) renderStill(setCam(camSpecs[0]), frames);
    else {
      const tcols = num('tcols', Math.ceil(Math.sqrt(camSpecs.length)));
      const out = document.createElement('canvas');
      out.width = W * tcols;
      out.height = H * Math.ceil(camSpecs.length / tcols);
      const ctx = out.getContext('2d');
      camSpecs.forEach((c, i) => {
        renderStill(setCam(c), frames);
        ctx.drawImage(renderer.domElement, (i % tcols) * W, Math.floor(i / tcols) * H);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '12px monospace';
        ctx.fillText(c, (i % tcols) * W + 6, Math.floor(i / tcols) * H + 15);
      });
      window.__shotCanvas = out;
    }
  }
  window.__vmStats = stats();
  console.log('vmstats ' + JSON.stringify(window.__vmStats));
  window.__shotReady = true;
} else {
  // interactive
  const hud = document.getElementById('hud');
  const keys = new Set();
  let orbit = false, oyaw = 25, opitch = 12, odist = 0.55;
  const colors = ['red', 'blue', 'yellow', 'green', 'chrome', 'pink', 'white', 'black', 'orange', 'purple'];
  let ci = Math.max(0, colors.indexOf(colorName));
  const finishes = [[0, 0.42], [0, 0.18], [0.95, 0.3], [0, 0.8]];
  let fi = 0;
  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyE') st.equipped = !st.equipped;
    if (e.code === 'KeyM') st.menuOpen = !st.menuOpen;
    if (e.code === 'KeyO') orbit = !orbit;
    if (e.code === 'KeyC') vm.setColor(parseColor(colors[(ci = (ci + 1) % colors.length)]));
    if (e.code === 'KeyF') {
      fi = (fi + 1) % finishes.length;
      vm.setFinish({ metal: finishes[fi][0], rough: finishes[fi][1] });
    }
    const caps = ['skinny', 'standard', 'fat', 'calligraphy'];
    if (/^Digit[1-4]$/.test(e.code)) vm.setCap(caps[+e.code.slice(5) - 1]);
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  let drag = null, dx = 0, dy = 0;
  canvas.addEventListener('pointerdown', (e) => (drag = { x: e.clientX, y: e.clientY }));
  addEventListener('pointerup', () => (drag = null));
  addEventListener('pointermove', (e) => {
    if (!drag) return;
    dx += e.clientX - drag.x;
    dy += e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  addEventListener('wheel', (e) => (odist = Math.min(2, Math.max(0.2, odist * (1 + e.deltaY * 0.001)))));
  let last = performance.now();
  let walkPhase = 0;
  const loop = () => {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // look (drag) -> camera rotation and look velocity
    let yawRate = 0, pitchRate = 0;
    if (orbit) {
      oyaw -= dx * 0.3;
      opitch = Math.max(-80, Math.min(80, opitch + dy * 0.3));
    } else if (dt > 0) {
      const py = yaw, pp = pitch;
      yaw -= dx * 0.0035;
      pitch = Math.max(-1.2, Math.min(1.2, pitch - dy * 0.0035));
      yawRate = (yaw - py) / dt;
      pitchRate = (pitch - pp) / dt;
      fp.rotation.set(pitch, yaw, 0, 'YXZ');
      fp.updateMatrixWorld();
    }
    dx = dy = 0;
    st.lookVel.x = yawRate;
    st.lookVel.y = pitchRate;
    st.spraying = keys.has('Space');
    st.shaking = keys.has('KeyQ');
    st.walkAmp = keys.has('KeyW') ? 1 : 0;
    if (st.walkAmp) walkPhase += dt * 1.9;
    st.walkPhase = walkPhase;
    st.reach = keys.has('KeyR') ? 0.15 : 1;
    simT += dt;
    st.time = simT;
    updateAim();
    vm.update(dt, st);
    const cam = orbit ? setCam(`orbit:${oyaw},${opitch},${odist}`) : fp;
    post.render(scene, cam, dt, simT);
    const s = stats();
    hud.textContent = `E equip  Space spray  Q shake  M menu  1-4 caps  C colour  F finish  W walk  R wall  O orbit (drag/wheel)
cap ${vm.capType}  tris ${s.tris}  build ${s.ctorMs} ms  nozzle cam ${s.nozzleCam.join(', ')}  clicks ${clicks}`;
  };
  loop();
}
