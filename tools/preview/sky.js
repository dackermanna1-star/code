// Sky preview. Query params:
//   view=grid (default) | big | pano     sun=x,y,z (GoldSrc)   size=256   samples=1|2|4 (default auto)
//   bench=N (time N extra generations)   stats=1 (log cube averages used by skyColors())
//   yaw=0&pitch=0 (big view; GoldSrc degrees, pitch>0 looks down)   ground=0 hides ground/walls
import * as THREE from 'three';
import { createSky, skyColors } from '../../src/assets/sky.js';

THREE.ColorManagement.enabled = false;

const Q = new URLSearchParams(location.search);
const view = Q.get('view') || 'grid';
const sunDir = Q.get('sun') ? Q.get('sun').split(',').map(Number) : undefined;
const faceSize = +(Q.get('size') || 256);
const samples = Q.get('samples') ? +Q.get('samples') : 'auto';
const showGround = Q.get('ground') !== '0';

const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);

// ---- generate the sky (synchronised so the timing includes the GPU work)
const t0 = performance.now();
const sky = createSky(renderer, { sunDir, faceSize, samples });
const px = new Uint8Array(4);
renderer.readRenderTargetPixels(sky.userData.renderTarget, 0, 0, 1, 1, px, 0);
const genMs = performance.now() - t0;
console.log(`sky generated in ${genMs.toFixed(1)} ms (submit ${sky.userData.genMs.toFixed(1)} ms)`);
if (Q.get('bench')) {
  // second run: shader program is cached, so this is the pure GPU render cost
  for (let i = 0; i < +Q.get('bench'); i++) {
    const tb = performance.now();
    const s2 = createSky(renderer, { sunDir, faceSize, samples });
    renderer.readRenderTargetPixels(s2.userData.renderTarget, 0, 0, 1, 1, px, 0);
    console.log(`bench run ${i}: ${(performance.now() - tb).toFixed(1)} ms`);
    s2.userData.dispose();
  }
}

// ---- scene: world group in GoldSrc space
const scene = new THREE.Scene();
scene.background = sky;
const world = new THREE.Group();
world.rotation.x = -Math.PI / 2;
scene.add(world);

const sun = new THREE.Vector3(...(sunDir || [-0.45, 0.35, 0.82])).normalize();
const sc = skyColors();
// r170 lights are physical: intensity PI gives albedo * colour
scene.add(new THREE.AmbientLight(new THREE.Color(...sc.ambient), 0.6 * Math.PI));
const dl = new THREE.DirectionalLight(0xfff0dc, 0.75 * Math.PI);
dl.position.set(sun.x, sun.z, -sun.y); // GoldSrc -> three
scene.add(dl);

function sandTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  let s = 12345;
  const r = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 128 * 128; i++) {
    const n = 0.88 + 0.12 * r();
    img.data[i * 4] = 196 * n; img.data[i * 4 + 1] = 160 * n; img.data[i * 4 + 2] = 112 * n; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(400, 400);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapNearestFilter;
  return t;
}

if (showGround) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(51200, 51200), new THREE.MeshBasicMaterial({ map: sandTexture() }));
  world.add(ground);
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xd2bb8c });
  const wall = (x, y, sx, sy, h) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, h), wallMat);
    m.position.set(x, y, h / 2);
    world.add(m);
  };
  wall(700, 0, 32, 1400, 256);    // east (yaw 0)
  wall(0, 900, 1000, 32, 192);    // north (yaw 90)
  wall(-500, -500, 32, 300, 160); // a short block south-west
}

const camera = new THREE.PerspectiveCamera(73.74, 4 / 3, 1, 100000); // 90 deg horizontal at 4:3 (GoldSrc fov 90)
function aim(yawDeg, pitchDeg) {
  const y = THREE.MathUtils.degToRad(yawDeg), p = THREE.MathUtils.degToRad(pitchDeg);
  const f = [Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), -Math.sin(p)]; // GoldSrc forward
  camera.position.set(0, 64, 0); // eye 64 units up
  camera.up.set(0, 1, 0);
  camera.lookAt(f[0] * 10, 64 + f[2] * 10, -f[1] * 10);
}

const labels = [];
function label(x, y, text) {
  const d = document.createElement('div');
  d.className = 'lbl';
  d.style.left = x + 'px'; d.style.top = y + 'px';
  d.textContent = text;
  document.body.appendChild(d);
  labels.push(d);
}

// ---- equirect panorama pass (samples the cube directly)
const panoMat = new THREE.ShaderMaterial({
  uniforms: { cube: { value: sky }, elMin: { value: -15 }, elMax: { value: 55 }, azStart: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform samplerCube cube; uniform float elMin, elMax, azStart; varying vec2 vUv;
    void main() {
      float az = radians(azStart - vUv.x * 360.0);       // left->right = clockwise from above, like turning right
      float el = radians(mix(elMin, elMax, vUv.y));
      vec3 g = vec3(cos(el) * cos(az), cos(el) * sin(az), sin(el));
      vec3 c = textureCube(cube, vec3(g.x, g.z, -g.y)).rgb;
      float grid = 0.0;
      float elDeg = degrees(el);
      if (abs(elDeg) < 0.12 * (elMax - elMin) / 70.0) grid = 1.0;
      gl_FragColor = vec4(mix(c, vec3(1.0, 0.0, 0.0), grid * 0.6), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const panoScene = new THREE.Scene();
const panoQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), panoMat);
panoQuad.frustumCulled = false;
panoScene.add(panoQuad);
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function cell(x, y, w, h) {
  // three viewport origin is bottom-left
  renderer.setViewport(x, H - y - h, w, h);
  renderer.setScissor(x, H - y - h, w, h);
}

function drawPerspective(x, y, w, h, yaw, pitch) {
  cell(x, y, w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  aim(yaw, pitch);
  renderer.render(scene, camera);
  label(x, y, `yaw ${yaw} pitch ${pitch}`);
}

function drawPano(x, y, w, h, elMin, elMax, azStart = 0) {
  cell(x, y, w, h);
  panoMat.uniforms.elMin.value = elMin;
  panoMat.uniforms.elMax.value = elMax;
  panoMat.uniforms.azStart.value = azStart;
  renderer.render(panoScene, orthoCam);
  for (let i = 0; i < 8; i++) label(x + (i * w) / 8, y + h - 16, `yaw ${(azStart - i * 45 + 360) % 360}`);
  label(x, y, `panorama el ${elMin}..${elMax} (red line = horizon)`);
}

// ?stats=1: integrate the cube (via an equirect readback) to derive skyColors() constants
if (Q.get('stats')) {
  const EW = 512, EH = 256;
  const rt = new THREE.WebGLRenderTarget(EW, EH);
  panoMat.uniforms.elMin.value = -90; panoMat.uniforms.elMax.value = 90; panoMat.uniforms.azStart.value = 0;
  renderer.setRenderTarget(rt);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, EW, EH);
  renderer.render(panoScene, orthoCam);
  const buf = new Uint8Array(EW * EH * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, EW, EH, buf);
  renderer.setRenderTarget(null);
  renderer.setScissorTest(true);
  const acc = { zen: [0, 0, 0, 0], hor: [0, 0, 0, 0], amb: [0, 0, 0, 0], below: [0, 0, 0, 0] };
  for (let y = 0; y < EH; y++) {
    const el = -90 + (y + 0.5) / EH * 180, c = Math.cos(el * Math.PI / 180), sn = Math.sin(el * Math.PI / 180);
    for (let x = 0; x < EW; x++) {
      const i = (y * EW + x) * 4, px3 = [buf[i] / 255, buf[i + 1] / 255, buf[i + 2] / 255];
      const add = (a, w) => { a[0] += px3[0] * w; a[1] += px3[1] * w; a[2] += px3[2] * w; a[3] += w; };
      if (el > 60) add(acc.zen, c);
      if (el > 0 && el < 4) add(acc.hor, c);
      if (el > 0) add(acc.amb, c * sn); // cosine-weighted upper hemisphere (irradiance on a flat floor)
      if (el < -5) add(acc.below, c);
    }
  }
  const out = {};
  for (const k in acc) out[k] = acc[k].slice(0, 3).map((v) => +(v / acc[k][3]).toFixed(3));
  console.log('stats', JSON.stringify(out));
  window.__stats = out;
}

const t1 = performance.now();
if (view === 'big') {
  const yaw = +(Q.get('yaw') || 0), pitch = +(Q.get('pitch') || 0);
  drawPerspective(0, 0, W, H, yaw, pitch);
} else if (view === 'pano') {
  drawPano(0, 0, W, H, +(Q.get('elmin') || -15), +(Q.get('elmax') || 60), +(Q.get('az') || 0));
} else {
  const cw = Math.floor(W / 4), ch = Math.floor(cw * 3 / 4);
  const rows = [
    [[0, 0], [90, 0], [180, 0], [270, 0]],
    [[44, 0], [134, 0], [224, 0], [314, 0]], // (exactly 45 hits a SwiftShader w=0 clip bug in the background box)
    [[0, -40], [90, -40], [180, -40], [270, -40]],
  ];
  rows.forEach((row, ri) => row.forEach(([yw, pt], ci) => drawPerspective(ci * cw, ri * ch, cw, ch, yw, pt)));
  drawPano(0, 3 * ch, W, H - 3 * ch, -15, 45);
}
const drawMs = performance.now() - t1;
document.getElementById('info').textContent =
  `sky ${faceSize}px/face: ${genMs.toFixed(0)} ms (incl. GPU sync) | draw ${drawMs.toFixed(0)} ms | ${renderer.getContext().getParameter(renderer.getContext().VERSION)}`;
window.__skyMs = genMs;
