// Viewmodel test bench: background scene + viewmodel, interactive controls and an automated, deterministic
// "freeze at time t" mode used by dev/viewmodel-shots.cjs (window.vmTest).
import * as THREE from 'three';
import { Viewmodel, MODEL_IDS } from '../src/player/Viewmodel.js';
import { globalUniforms, createEntityMaterial, setEntityLight } from '../src/render/materials.js';
import { ITEMS } from '../src/items/items.js';

// ------------------------------------------------------------------------------------ test items
const MELEE = {
  knife: ['stab', false], knife_hunting: ['blade', false], bat: ['blunt', true], bat_nail: ['blunt', true], crowbar: ['blunt', false],
  hammer: ['blunt', false], axe_fire: ['heavy', true], hatchet: ['blade', false], machete: ['blade', false], golf_club: ['blunt', true],
  pan: ['blunt', false], pipe: ['blunt', false], sledgehammer: ['heavy', true], shovel: ['heavy', true], katana: ['blade', true],
  spear: ['stab', true], baton: ['blunt', false], wrench: ['blunt', false], pitchfork: ['stab', true], club: ['blunt', false], screwdriver: ['stab', false],
};
const GUNS = {
  pistol: 'mag', pistol_1911: 'mag', revolver: 'shell', shotgun_pump: 'shell', shotgun_double: 'break', shotgun_sawed: 'break',
  rifle_hunting: 'single', rifle_ar: 'mag', rifle_ak: 'mag', rifle_22: 'mag', smg: 'mag', crossbow: 'single', bow: 'single',
};
for (const id of MODEL_IDS) {
  const d = { id: 'vmt_' + id, name: id, category: 'test', weight: 1, stack: 1, model: id };
  if (MELEE[id]) d.melee = { damage: 20, speed: MELEE[id][1] ? 1.1 : 1.8, type: MELEE[id][0], twoHanded: MELEE[id][1] };
  if (GUNS[id]) d.firearm = { reload: GUNS[id], magSize: 10 };
  if (id === 'fists') d.melee = { speed: 2.2, type: 'blunt' };
  ITEMS[d.id] = d;
}
// a few generic items with test icons (real icons come from src/items/icons.js)
const TEST_ICONS = {};
function makeIcon(id, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  draw(c.getContext('2d'));
  TEST_ICONS[id] = c;
}
const px = (g, col, pts) => { g.fillStyle = col; for (const [x, y, w = 1, h = 1] of pts) g.fillRect(x, y, w, h); };
makeIcon('vmt_icon_tool', (g) => { // diagonal wrench-like tool
  for (let i = 0; i < 10; i++) px(g, i < 4 ? '#5a3a1e' : '#8a5a2e', [[2 + i, 13 - i, 2, 2]]);
  px(g, '#9aa0a8', [[10, 2, 4, 2], [12, 2, 2, 5], [11, 4, 2, 2]]);
  px(g, '#d0d6dc', [[10, 2, 2, 1], [13, 3, 1, 3]]);
});
makeIcon('vmt_icon_can', (g) => {
  px(g, '#8a8f96', [[4, 3, 8, 1], [4, 13, 8, 1]]);
  px(g, '#b5562a', [[4, 4, 8, 9]]);
  px(g, '#e8d8a0', [[5, 6, 6, 4]]);
  px(g, '#6b2e14', [[4, 4, 1, 9]]);
});
makeIcon('vmt_icon_book', (g) => {
  px(g, '#2c4a7a', [[3, 2, 10, 12]]);
  px(g, '#e8e4d8', [[12, 3, 1, 10]]);
  px(g, '#d8b860', [[5, 5, 6, 1], [5, 7, 4, 1]]);
});
makeIcon('vmt_icon_bandage', (g) => {
  px(g, '#e8e6e0', [[3, 5, 10, 6]]);
  px(g, '#c8c4bc', [[3, 5, 1, 6], [12, 5, 1, 6]]);
  px(g, '#c02020', [[7, 6, 2, 4], [6, 7, 4, 2]]);
});
for (const id of Object.keys(TEST_ICONS)) ITEMS[id] = { id, name: id, category: 'test', weight: 0.2, stack: 1 };
const ITEM_LIST = [...MODEL_IDS.filter((m) => m !== 'generic').map((m) => 'vmt_' + m), ...Object.keys(TEST_ICONS)];

const ARMS = [
  { skin: 0xc69c7b, sleeve: 0x4b5b3c, glove: null },
  { skin: 0xd8a888, sleeve: null, glove: null },
  { skin: 0x8d5a3c, sleeve: 0x6a6a72, glove: 0x6b4a2a },
  { skin: 0xc69c7b, sleeve: 0x3a3e2c, glove: 0x1c1c1c },
];

// ------------------------------------------------------------------------------------ renderer
const params = new URLSearchParams(location.search);
const AUTO = params.has('auto');
if (AUTO) document.body.classList.add('auto');
const W = 1280, H = 720;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(AUTO ? W : innerWidth, AUTO ? H : innerHeight);
document.body.appendChild(renderer.domElement);
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: true });

const post = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { tex: { value: rt.texture } },
    vertexShader: 'out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `precision highp float; uniform sampler2D tex; in vec2 vUv; out vec4 o;
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
      void main(){ vec3 c = texture(tex, vUv).rgb; c = aces(c * 0.9); c = pow(c, vec3(1.0/2.2)); o = vec4(c, 1.0); }`,
    depthTest: false,
    depthWrite: false,
  }),
);
const postScene = new THREE.Scene();
postScene.add(post);
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ------------------------------------------------------------------------------------ world
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, W / H, 0.05, 400);
camera.position.set(0, 21.62, 0);
let yaw = 0, pitch = 0;
const worldMats = [];
function wmat(color, tex) {
  const m = createEntityMaterial({ color, map: tex || null });
  worldMats.push(m);
  return m;
}
function checkerTex(a, b, n = 16) {
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const x = i % n, y = (i / n) | 0;
    const v = ((x * 7 + y * 13) % 5) / 5;
    const c = (x + y) % 2 ? a : b;
    data[i * 4] = (c[0] * (0.9 + v * 0.2)) | 0;
    data[i * 4 + 1] = (c[1] * (0.9 + v * 0.2)) | 0;
    data[i * 4 + 2] = (c[2] * (0.9 + v * 0.2)) | 0;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.needsUpdate = true;
  return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), wmat(0xffffff, checkerTex([92, 140, 60], [80, 125, 52])));
ground.rotation.x = -Math.PI / 2;
ground.position.y = 20;
const uvs = ground.geometry.attributes.uv;
for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * 60, uvs.getY(i) * 60);
scene.add(ground);
const road = new THREE.Mesh(new THREE.PlaneGeometry(6, 240), wmat(0x444448));
road.rotation.x = -Math.PI / 2;
road.position.set(4, 20.01, 0);
scene.add(road);
const boxes = [
  [-6, -14, 6, 5, 6, 0xb8a888], [8, -22, 7, 6, 8, 0x8a4a3a], [-14, -30, 5, 9, 5, 0x9a9a96], [2, -40, 10, 7, 4, 0xd0c8b0],
  [-3, -9, 1, 1, 1, 0x7a5a3a], [12, -10, 2, 3, 2, 0x55606a], [-20, -18, 3, 12, 3, 0x3a5a2a],
];
for (const [x, z, w, h, d, c] of boxes) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wmat(c));
  m.position.set(x, 20 + h / 2, z);
  scene.add(m);
}
// distant tree line
for (let i = 0; i < 40; i++) {
  const x = -60 + i * 3.1, z = -70 - (i % 3) * 4;
  const t = new THREE.Mesh(new THREE.BoxGeometry(2.6, 8 + (i % 4), 2.6), wmat(i % 5 ? 0xb8642a : 0x8a3a1a));
  t.position.set(x, 26, z);
  scene.add(t);
}

function setTime(night, flash) {
  const U = globalUniforms;
  if (night) {
    U.uSunColor.value.setRGB(0.03, 0.04, 0.07);
    U.uAmbientColor.value.setRGB(0.05, 0.06, 0.1);
    U.uFogColor.value.setRGB(0.02, 0.025, 0.04);
    scene.background = new THREE.Color(0.012, 0.016, 0.03);
  } else {
    U.uSunColor.value.setRGB(1.0, 0.95, 0.85);
    U.uAmbientColor.value.setRGB(0.55, 0.6, 0.7);
    U.uFogColor.value.setRGB(0.6, 0.65, 0.7);
    scene.background = new THREE.Color(0.45, 0.6, 0.8);
  }
  U.uFlashOn.value = flash ? 1 : 0;
}

function updateCamera() {
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
  globalUniforms.uCamPos.value.copy(camera.position);
  globalUniforms.uFlashPos.value.copy(camera.position);
  camera.getWorldDirection(globalUniforms.uFlashDir.value);
}

function renderFrame(vm, viewport) {
  updateCamera();
  for (const m of worldMats) setEntityLight(m, 1, 0);
  renderer.setRenderTarget(rt);
  renderer.setViewport(0, 0, W, H);
  renderer.setScissorTest(false);
  renderer.clear();
  renderer.render(scene, camera);
  vm.render(renderer);
  renderer.setRenderTarget(null);
  if (viewport) {
    renderer.setViewport(viewport[0], viewport[1], viewport[2], viewport[3]);
    renderer.setScissor(viewport[0], viewport[1], viewport[2], viewport[3]);
    renderer.setScissorTest(true);
  } else {
    const s = renderer.getSize(new THREE.Vector2());
    renderer.setViewport(0, 0, s.x, s.y);
    renderer.setScissorTest(false);
  }
  renderer.render(postScene, postCam);
  renderer.setScissorTest(false);
}

// ------------------------------------------------------------------------------------ automated mode
function makeVM(opts) {
  const vm = new Viewmodel();
  vm.iconProvider = (def) => TEST_ICONS[def.id] || null;
  vm.setArmsAppearance(ARMS[opts.arms ?? 0]);
  vm.setMainCamera(camera);
  return vm;
}

function itemFor(p) {
  const id = p.item || (p.model ? 'vmt_' + p.model : 'vmt_fists');
  const stack = { id, count: 1 };
  const def = ITEMS[id];
  if (def && def.firearm) stack.ammo = p.ammo ?? 8;
  if (p.lit) stack.data = { lit: true };
  return stack;
}

/**
 * Deterministic simulation. p: {model|item, aim, sprint, crouch, moving, night, flash, ammo, arms, lookDX(rad/s), warm,
 *   seq: [[time, method, ...args]], t (seconds after warm-up), tileLabel}
 */
function simulate(p, viewport) {
  setTime(!!p.night, !!p.flash);
  yaw = p.yaw ?? 0;
  pitch = p.pitch ?? 0;
  updateCamera();
  const vm = makeVM(p);
  const stack = itemFor(p);
  vm.setItem(stack);
  const dt = 1 / 60;
  const warm = p.warm ?? 1.2;
  let end = p.tFrac != null ? Infinity : warm + (p.t ?? 0);
  const seq = (p.seq || []).map((e) => ({ at: warm + e[0], m: e[1], args: e.slice(2), done: false }));
  let time = 0;
  for (let i = 0; time <= end + 1e-6 && i < 3000; i++) {
    for (const e of seq) {
      if (!e.done && time >= e.at - 1e-6) {
        e.done = true;
        if (e.m === 'ammo') stack.ammo = e.args[0];
        else {
          const ret = vm[e.m](...e.args);
          if (p.tFrac != null && e.m === 'swing') {
            end = e.at + (typeof p.tFrac === 'string' ? ret : p.tFrac * vm.action.dur);
          }
        }
      }
    }
    const look = (p.lookDX ?? 0) * dt;
    vm.update(i === 0 ? 0 : dt, {
      moving01: p.moving ? 1 : 0, sprinting: !!p.sprint, aiming: !!p.aim, crouching: !!p.crouch, grounded: p.grounded ?? true,
      lookDX: look, lookDY: (p.lookDY ?? 0) * dt, light: { sky: p.night ? 0.25 : 1, block: p.block ?? 0 }, time, camera,
    });
    time += dt;
  }
  renderFrame(vm, viewport);
  return vm;
}

const labels = [];
function clearLabels() { for (const l of labels) l.remove(); labels.length = 0; }
function label(text, x, y) {
  const d = document.createElement('div');
  d.className = 'tile-label';
  d.textContent = text;
  d.style.left = x + 'px';
  d.style.top = y + 'px';
  document.body.appendChild(d);
  labels.push(d);
}

const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));

window.vmTest = {
  ready: true,
  errors,
  models: MODEL_IDS,
  items: ITEM_LIST,
  /** one full-frame shot */
  shot(p) {
    clearLabels();
    simulate(p, [0, 0, W, H]);
    if (p.label) label(p.label, 4, 4);
    return true;
  },
  /** grid of tiles: list of params, cols */
  grid(list, cols = 4) {
    clearLabels();
    const rows = Math.ceil(list.length / cols);
    const tw = Math.floor(W / cols), th = Math.floor(tw * 9 / 16);
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setClearColor(0x000000);
    renderer.clear();
    list.forEach((p, i) => {
      const cx = i % cols, cy = (i / cols) | 0;
      const x = cx * tw, yTop = cy * th;
      simulate(p, [x, H - yTop - th, tw, th]);
      label(p.label || p.model || p.item, x + 3, yTop + 3);
    });
    return rows;
  },
};

// ------------------------------------------------------------------------------------ interactive
if (!AUTO) {
  const sel = document.getElementById('model');
  for (const id of ITEM_LIST) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = id.replace('vmt_', '');
    sel.appendChild(o);
  }
  const vm = makeVM({ arms: 0 });
  let stack = null;
  const setModel = (id) => {
    stack = itemFor({ item: id, ammo: document.getElementById('empty').checked ? 0 : 8 });
    vm.setItem(stack);
    sel.value = id;
  };
  setModel('vmt_pistol');
  sel.onchange = () => setModel(sel.value);
  const step = (d) => {
    const i = (ITEM_LIST.indexOf(sel.value) + d + ITEM_LIST.length) % ITEM_LIST.length;
    setModel(ITEM_LIST[i]);
  };
  document.getElementById('prev').onclick = () => step(-1);
  document.getElementById('next').onclick = () => step(1);
  document.getElementById('arms').onchange = (e) => vm.setArmsAppearance(ARMS[+e.target.value]);
  document.getElementById('empty').onchange = (e) => { if (stack && stack.ammo != null) stack.ammo = e.target.checked ? 0 : 8; };
  const chk = (id) => document.getElementById(id).checked;
  const setChk = (id, v) => { document.getElementById(id).checked = v; };
  let jumpT = -1;
  document.getElementById('jump').onclick = () => { jumpT = 0; };
  const doAction = (a) => {
    const def = ITEMS[stack.id];
    const kind = (def.firearm && def.firearm.reload) || 'mag';
    if (a === 'fire') {
      vm.fire(1);
      if (stack.ammo != null) stack.ammo = Math.max(0, stack.ammo - 1);
    } else if (a === 'swing') vm.swing(false);
    else if (a === 'swingHeavy') vm.swing(true);
    else if (a === 'shove') vm.shove();
    else if (a === 'reload') vm.reloadStart(kind, kind === 'shell' || kind === 'single' ? 0.4 : 2.2);
    else if (a === 'insert') { vm.reloadInsert(); if (stack.ammo != null) stack.ammo++; }
    else if (a === 'reloadEnd') { vm.reloadEnd(); if (stack.ammo != null) stack.ammo = Math.max(stack.ammo, 8); }
    else if (a === 'pump') vm.pump();
    else if (a === 'bolt') vm.bolt();
    else if (a === 'throw') vm.throwItem();
    else if (a === 'cancel') vm.cancel();
    else if (a.startsWith('use:')) vm.use(a.slice(4), 2.5);
    else if (a.startsWith('use2:')) vm.use(a.slice(5), 2.5, { id: 'vmt_icon_bandage', count: 1 });
  };
  for (const b of document.querySelectorAll('[data-a]')) b.onclick = () => doAction(b.dataset.a);
  const keys = { KeyF: 'fire', KeyV: 'swing', KeyB: 'swingHeavy', KeyG: 'shove', KeyR: 'reload', KeyT: 'insert', KeyY: 'reloadEnd', KeyP: 'pump', KeyO: 'bolt', KeyX: 'throw', KeyC: 'cancel' };
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT') return;
    if (keys[e.code]) doAction(keys[e.code]);
    if (e.code === 'BracketRight') step(1);
    if (e.code === 'BracketLeft') step(-1);
    if (e.code === 'ShiftLeft') setChk('sprint', true);
    if (e.code === 'KeyW') setChk('moving', true);
    if (e.code === 'KeyN') setChk('night', !chk('night'));
    if (e.code === 'KeyL') setChk('flash', !chk('flash'));
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'ShiftLeft') setChk('sprint', false);
    if (e.code === 'KeyW') setChk('moving', false);
  });
  let drag = false, ldx = 0, ldy = 0;
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button === 2) setChk('aim', true);
    else drag = true;
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 2) setChk('aim', false);
    else drag = false;
  });
  addEventListener('mousemove', (e) => {
    if (!drag) return;
    ldx += e.movementX * 0.003;
    ldy -= e.movementY * 0.003;
  });
  addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
  let last = performance.now();
  let time = 0;
  const loop = (now) => {
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (chk('slow')) dt *= 0.25;
    time += dt;
    setTime(chk('night'), chk('flash'));
    yaw -= ldx;
    pitch = Math.max(-1.4, Math.min(1.4, pitch + ldy));
    let grounded = true;
    if (jumpT >= 0) {
      jumpT += dt;
      grounded = jumpT > 0.6;
      if (jumpT > 0.7) jumpT = -1;
    }
    vm.update(dt, {
      moving01: chk('moving') ? 1 : 0, sprinting: chk('sprint'), aiming: chk('aim'), crouching: chk('crouch'), grounded,
      lookDX: ldx, lookDY: ldy, light: { sky: chk('night') ? 0.25 : 1, block: 0 }, time, camera,
    });
    ldx = ldy = 0;
    renderFrame(vm, null);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
