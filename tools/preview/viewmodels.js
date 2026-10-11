// View-model preview: ?w=ak47&anim=reload&t=0.5 freezes reload at 0.5 s.
// Other params: u=0.5 (normalised time), d=2.0 (duration override), sil=1,
// light=1.2, aspect=4:3|16:9|fill, cam=view|side|top|front|left|below,
// ui=0 (hide controls), grid=1 (all weapons), xhair=0, bg=plain.
import * as THREE from 'three';
import { createViewModel, VIEWMODEL_WEAPONS } from '../../src/assets/viewmodels.js';

THREE.ColorManagement.enabled = false;

const Q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(1);
renderer.autoClear = false;

// ------------------------------------------------------------ backdrop
function makeBackdrop() {
  const W = 512, H = 384;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  if (Q.get('bg') === 'plain') { x.fillStyle = '#8a7a60'; x.fillRect(0, 0, W, H); }
  else {
    let g = x.createLinearGradient(0, 0, 0, H * 0.4);
    g.addColorStop(0, '#5f86c0'); g.addColorStop(1, '#a9bfd8');
    x.fillStyle = g; x.fillRect(0, 0, W, H * 0.4);
    // distant mountains
    x.fillStyle = '#9b8a78';
    x.beginPath(); x.moveTo(0, H * 0.4);
    for (let i = 0; i <= 16; i++) x.lineTo((i / 16) * W, H * (0.26 + 0.08 * Math.sin(i * 1.7) + 0.04 * Math.sin(i * 4.1)));
    x.lineTo(W, H * 0.4); x.fill();
    // sandstone walls
    x.fillStyle = '#c4a575'; x.fillRect(0, H * 0.36, W, H * 0.2);
    x.strokeStyle = 'rgba(90,70,40,0.35)';
    for (let r = 0; r < 6; r++) {
      const y = H * 0.36 + r * (H * 0.2 / 6);
      x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke();
      for (let i = 0; i < 20; i++) { const xx = (i * 31 + r * 13) % W; x.beginPath(); x.moveTo(xx, y); x.lineTo(xx, y + H * 0.2 / 6); x.stroke(); }
    }
    // floor
    g = x.createLinearGradient(0, H * 0.56, 0, H);
    g.addColorStop(0, '#c7a776'); g.addColorStop(1, '#9e7d50');
    x.fillStyle = g; x.fillRect(0, H * 0.56, W, H * 0.44);
    const img = x.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 18;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    x.putImageData(img, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
const bgScene = new THREE.Scene();
bgScene.background = makeBackdrop();
const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ------------------------------------------------------------ view model scene
const vmScene = new THREE.Scene();
const VFOV = 73.74;
const vmCam = new THREE.PerspectiveCamera(VFOV, 4 / 3, 1, 400);
const dbgCam = new THREE.PerspectiveCamera(30, 4 / 3, 1, 2000);

let aspectMode = Q.get('aspect') || '4:3';
let camMode = Q.get('cam') || 'view';
let weapon = Q.get('w') || 'ak47';
let animName = Q.get('anim') || 'idle';
let durOverride = Q.has('d') ? +Q.get('d') : undefined;
let frozenT = Q.has('t') ? +Q.get('t') : null;
let frozenU = Q.has('u') ? +Q.get('u') : null;
let paused = frozenT !== null || frozenU !== null;
let light = Q.has('light') ? +Q.get('light') : 1;
let silenced = Q.get('sil') === '1';
const grid = Q.get('grid') === '1';

if (Q.get('ui') === '0') document.getElementById('ui').classList.add('hidden');

let vm = null;
let gridVMs = [];
const info = document.getElementById('info');

function setFrozen(vmx, name) {
  const dur = durOverride ?? vmx.duration(name);
  vmx.play(name, { duration: durOverride });
  const t = frozenT !== null ? frozenT : frozenU !== null ? frozenU * dur : 0;
  vmx.update(t);
}

function load() {
  if (vm) { vm.dispose(); vm = null; }
  for (const g of gridVMs) g.dispose();
  gridVMs = [];
  if (grid) {
    for (const w of VIEWMODEL_WEAPONS) {
      try {
        const v = createViewModel(w, { silenced });
        v.setLight([light, light, light]);
        if (paused) setFrozen(v, v.anims[animName] || animName === 'shoot' || animName === 'reload' ? animName : 'idle');
        else v.play(animName);
        gridVMs.push(v);
      } catch (e) { console.error(w, e); gridVMs.push(null); }
    }
  } else {
    vm = createViewModel(weapon, { silenced });
    vmScene.add(vm.object3D);
    vm.setLight([light, light, light]);
    if (paused) setFrozen(vm, animName);
    else vm.play(animName, { duration: durOverride });
    window.__vm = vm;
    buildAnimButtons();
  }
  syncUrl();
}

function syncUrl() {
  const p = new URLSearchParams(location.search);
  p.set('w', weapon); p.set('anim', animName);
  history.replaceState(null, '', `?${p}`);
}

// ------------------------------------------------------------ UI
const sel = document.getElementById('weapon');
for (const w of VIEWMODEL_WEAPONS) {
  const o = document.createElement('option'); o.value = o.textContent = w; sel.appendChild(o);
}
sel.value = weapon;
sel.onchange = () => { weapon = sel.value; animName = 'draw'; frozenT = frozenU = null; paused = false; load(); };
const silBox = document.getElementById('sil');
silBox.checked = silenced;
silBox.onchange = () => { silenced = silBox.checked; vm && vm.setSilencer(silenced); };
document.getElementById('light').value = light;
document.getElementById('light').oninput = (e) => { light = +e.target.value; vm && vm.setLight([light, light, light]); };
const tSlider = document.getElementById('t');
tSlider.oninput = () => {
  if (!vm) return;
  paused = true; frozenT = null; frozenU = +tSlider.value;
  setFrozen(vm, animName);
};
document.getElementById('pause').onclick = () => { paused = !paused; if (!paused) { frozenT = frozenU = null; } };
for (const b of document.querySelectorAll('[data-aspect]')) b.onclick = () => { aspectMode = b.dataset.aspect; resize(); };
for (const b of document.querySelectorAll('[data-cam]')) b.onclick = () => { camMode = b.dataset.cam; };

function buildAnimButtons() {
  const box = document.getElementById('anims');
  box.innerHTML = '';
  for (const a of vm.animations) {
    const b = document.createElement('button');
    b.textContent = a;
    if (a === animName) b.className = 'on';
    b.onclick = () => {
      animName = a; frozenT = frozenU = null; paused = false;
      vm.play(a, { duration: durOverride });
      for (const x of box.children) x.className = x === b ? 'on' : '';
      syncUrl();
    };
    box.appendChild(b);
  }
}

// crosshair overlay (classic CS green)
const xh = document.createElement('canvas');
xh.width = xh.height = 41;
xh.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none';
{
  const x = xh.getContext('2d'); x.fillStyle = 'rgba(50,250,50,0.9)';
  x.fillRect(20, 4, 1, 11); x.fillRect(20, 26, 1, 11); x.fillRect(4, 20, 11, 1); x.fillRect(26, 20, 11, 1);
}
if (Q.get('xhair') !== '0' && !grid) document.getElementById('wrap').appendChild(xh);

// ------------------------------------------------------------ layout
let vw = 1, vh = 1;
function resize() {
  const W = innerWidth, H = innerHeight;
  let w = W, h = H;
  if (aspectMode !== 'fill' && !grid) {
    const [a, b] = aspectMode.split(':').map(Number);
    const ar = a / b;
    if (W / H > ar) { w = Math.round(H * ar); } else { h = Math.round(W / ar); }
  }
  vw = w; vh = h;
  renderer.setSize(w, h, true);
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------ debug cameras
const box3 = new THREE.Box3();
function placeDebugCam() {
  box3.setFromObject(vm.object3D);
  let c = box3.getCenter(new THREE.Vector3());
  const s = box3.getSize(new THREE.Vector3()).length();
  const focus = Q.get('focus') && vm.nodes[Q.get('focus')];
  if (focus) c = focus.getWorldPosition(new THREE.Vector3());
  const d = (s * 1.9) / (+Q.get('zoom') || 1);
  const dirs = {
    side: [1, 0.05, 0], left: [-1, 0.05, 0], top: [0, 1, 0.001], front: [0, 0.1, -1], below: [0, -1, 0.001],
  };
  const v = new THREE.Vector3(...dirs[camMode]).normalize();
  dbgCam.position.copy(c).addScaledVector(v, d);
  dbgCam.up.set(0, 1, 0);
  if (camMode === 'top' || camMode === 'below') dbgCam.up.set(0, 0, -1);
  dbgCam.aspect = vw / vh;
  dbgCam.lookAt(c);
  dbgCam.updateProjectionMatrix();
}

const eyeMarker = new THREE.AxesHelper(4);

// ------------------------------------------------------------ loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, vw, vh);
  renderer.clear();
  if (grid) {
    const cols = 6, rows = 5;
    const cw = Math.floor(vw / cols), ch = Math.floor(vh / rows);
    renderer.setScissorTest(true);
    gridVMs.forEach((v, i) => {
      const x = (i % cols) * cw, y = vh - (Math.floor(i / cols) + 1) * ch;
      renderer.setViewport(x, y, cw, ch);
      renderer.setScissor(x, y, cw, ch);
      renderer.clear();
      renderer.render(bgScene, bgCam);
      renderer.clearDepth();
      if (!v) return;
      v.update(paused ? 0 : dt);
      vmScene.add(v.object3D);
      vmCam.aspect = cw / ch; vmCam.updateProjectionMatrix();
      renderer.render(vmScene, vmCam);
      vmScene.remove(v.object3D);
    });
  } else if (vm) {
    vm.update(paused ? 0 : dt);
    if (!paused) tSlider.value = Math.min(1, vm.time / ((durOverride ?? vm.duration(vm.currentAnimation)) || 1));
    renderer.render(bgScene, bgCam);
    renderer.clearDepth();
    let cam = vmCam;
    if (camMode !== 'view') {
      placeDebugCam();
      cam = dbgCam;
      vmScene.add(eyeMarker);
    } else vmScene.remove(eyeMarker);
    vmCam.aspect = vw / vh; vmCam.updateProjectionMatrix();
    renderer.render(vmScene, cam);
    const m = vm.getMuzzle(new THREE.Vector3());
    info.textContent = `${weapon}  anim=${vm.currentAnimation}  t=${vm.time.toFixed(2)}/${(durOverride ?? vm.duration(vm.currentAnimation)).toFixed(2)}s  tris=${vm.triangles}  calls=${renderer.info.render.calls}\nmuzzle=(${m.x.toFixed(1)}, ${m.y.toFixed(1)}, ${m.z.toFixed(1)})`;
  }
  requestAnimationFrame(frame);
}

load();
requestAnimationFrame(frame);
