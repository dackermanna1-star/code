// Texture preview: every texture tiled 2x2, plus a small GoldSrc-style 3D test
// scene (boxes lit by a baked 16-unit lightmap with sun shadows).
// Query params: ?view=3d | ?view=grid, &cam=0..3, &scale=<grid scale>
import * as THREE from 'three';
import { TEXTURES, generateTexture, averageColor } from '../../src/assets/textures.js';

THREE.ColorManagement.enabled = false;

const params = new URLSearchParams(location.search);
const view = params.get('view');
if (view === '3d') document.body.classList.add('only3d');
if (view === 'grid') document.body.classList.add('onlygrid');

// ------------------------------------------------------------ generation timing
const names = Object.keys(TEXTURES);
const canvases = new Map();
const times = new Map();
const t0 = performance.now();
for (const n of names) {
  const a = performance.now();
  canvases.set(n, generateTexture(n));
  times.set(n, performance.now() - a);
}
const total = performance.now() - t0;
document.getElementById('stats').textContent = `${names.length} textures generated in ${total.toFixed(0)} ms`;
console.log(`generateAll: ${names.length} textures in ${total.toFixed(1)} ms`);
console.log(
  'slowest:',
  [...times]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([n, t]) => `${n} ${t.toFixed(0)}ms`)
    .join(', ')
);

// ------------------------------------------------------------ grid
function buildGrid() {
  const grid = document.getElementById('grid');
  const userScale = params.has('scale') ? +params.get('scale') : null;
  for (const n of names) {
    const meta = TEXTURES[n];
    const src = canvases.get(n);
    const [w, h] = meta.size;
    let scale = userScale ?? Math.min(4, 200 / (2 * Math.max(w, h)));
    if (!userScale && 2 * w * scale > 400) scale = 400 / (2 * w);
    const cw = Math.round(2 * w * scale), ch = Math.round(2 * h * scale);
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const ctx = c.getContext('2d');
    if (meta.additive) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cw, ch);
    } else if (meta.alpha) {
      ctx.fillStyle = '#c4a068';
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#b39260';
      const cs = 8;
      for (let y = 0; y < ch; y += cs) for (let x = (y / cs) % 2 ? cs : 0; x < cw; x += cs * 2) ctx.fillRect(x, y, cs, cs);
    }
    ctx.imageSmoothingEnabled = scale < 1;
    if (meta.additive) ctx.globalCompositeOperation = 'lighter';
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) ctx.drawImage(src, (i * cw) / 2, (j * ch) / 2, cw / 2, ch / 2);
    const card = document.createElement('div');
    card.className = 'card';
    const avg = averageColor(n);
    const flags = [meta.alpha && 'alpha', meta.additive && 'add', meta.fit && 'fit', meta.frames && `${meta.frames.join('x')}`].filter(Boolean).join(' ');
    card.innerHTML = `<div class="name">${n}</div><div class="meta"><span class="swatch" style="background:rgb(${avg.join(',')})"></span>${w}x${h} w${meta.world.join('x')} ${flags} ${times
      .get(n)
      .toFixed(0)}ms</div>`;
    card.insertBefore(c, card.children[1]);
    grid.appendChild(card);
  }
}
if (view !== '3d') buildGrid();

// ------------------------------------------------------------ 3D scene
if (view !== 'grid') build3d();

function build3d() {
  const canvas = document.getElementById('view3d');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fb4dd);
  const world = new THREE.Group();
  world.rotation.x = -Math.PI / 2; // GoldSrc Z-up inside `world`
  scene.add(world);

  const texCache = new Map();
  function tex(name) {
    if (texCache.has(name)) return texCache.get(name);
    const t = new THREE.CanvasTexture(canvases.get(name));
    const fit = TEXTURES[name].fit;
    t.wrapS = t.wrapT = fit ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapNearestFilter;
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 1;
    texCache.set(name, t);
    return t;
  }

  const vs = `
    attribute vec2 aLm;
    varying vec2 vUv; varying vec2 vLm;
    void main() { vUv = uv; vLm = aLm; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const fs = `
    uniform sampler2D map; uniform sampler2D lm;
    varying vec2 vUv; varying vec2 vLm;
    void main() { gl_FragColor = vec4(texture2D(map, vUv).rgb * texture2D(lm, vLm).rgb * 2.0, 1.0); }`;
  const fsDecal = `
    uniform sampler2D map; uniform vec3 light; uniform float additive;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(map, vUv);
      if (additive > 0.5) gl_FragColor = vec4(c.rgb, 1.0);
      else gl_FragColor = vec4(c.rgb * light, c.a);
    }`;

  // ---- scene description (GoldSrc units, Z up)
  const SUN = new THREE.Vector3(0.38, -0.62, 0.69).normalize();
  const boxes = [];
  const B = (min, max, faces) => boxes.push({ min, max, faces });
  // faces: { all, top, bottom, n, s, e, w } -> texture name or [name, fit/flip opts]
  B([-700, -500, -16], [300, 1000, 0], { all: 'ground_stone' });
  B([300, -500, -16], [1300, 1000, 0], { all: 'ground_sand' });
  B([560, -100, -15.5], [700, 600, 0.5], { all: 'ground_dirt' });
  // north building + base frieze + roof coping
  B([-500, 600, 0], [800, 760, 300], { all: 'wall_stone', top: 'wall_stone' });
  B([-500, 592, 0], [800, 600, 32], { all: 'trim_band', top: 'wall_stone' });
  B([-500, 594, 300], [800, 760, 316], { all: 'trim_cap', top: 'wall_stone' });
  // west building
  B([-520, -500, 0], [-380, 600, 420], { all: 'wall_stone_big' });
  B([-380, -500, 0], [-372, 600, 32], { all: 'trim_band', top: 'wall_stone' });
  // parapet: stone body with carved frieze on top
  B([-160, 230, 0], [330, 262, 52], { all: 'wall_stone' });
  B([-160, 230, 52], [330, 262, 84], { all: 'trim_band', top: 'wall_stone' });
  // crates
  B([420, 510, 0], [484, 574, 64], { all: ['crate', 'fit'] });
  B([484, 470, 0], [612, 598, 128], { all: ['crate', 'fit'] });
  B([428, 518, 64], [484, 574, 120], { all: ['crate_b', 'fit'] });
  B([60, 330, 0], [124, 394, 64], { all: ['crate_green', 'fit'] });
  B([130, 340, 0], [194, 404, 64], { all: ['crate_green', 'fit'] });
  B([95, 336, 64], [159, 400, 128], { all: ['crate_green', 'fit'] });
  B([-300, 100, 0], [-236, 164, 64], { all: ['crate_b', 'fit'] });
  // east shed: plaster walls, plank awning on beams, metal box
  B([820, 150, 0], [1100, 500, 220], { all: 'wall_plaster' });
  B([700, 150, 140], [820, 500, 148], { all: 'wood_planks' });
  B([704, 160, 0], [716, 172, 140], { all: 'wood_beam' });
  B([704, 478, 0], [716, 490, 140], { all: 'wood_beam' });
  B([700, 150, 148], [820, 162, 160], { all: 'wood_beam' });
  B([760, 260, 0], [808, 300, 40], { all: 'metal' });
  // tunnel mouth in the sand (dark interior wall)
  B([980, -300, 0], [1300, -100, 200], { all: 'wall_tunnel' });
  // boundary cliff
  B([-900, 1100, 0], [1500, 1300, 700], { all: 'rock' });
  B([1300, -600, 0], [1500, 1100, 600], { all: 'rock' });

  // door + shutters + lintel on the north building
  const quads = [];
  const Q = (name, x0, x1, z0, z1, y, flip) => quads.push({ name, x0, x1, z0, z1, y, flip });
  Q('door', 200, 264, 0, 128, 591.5, false);
  Q('door', 264, 328, 0, 128, 591.5, true);
  B([190, 586, 128], [338, 600, 146], { all: 'wood_beam' });
  Q('shutter', -200, -152, 150, 246, 599.5);
  Q('shutter', -100, -52, 150, 246, 599.5);
  Q('shutter', 480, 528, 170, 266, 599.5);

  // ---- lightmap baking (1 luxel per 16 units, sun shadow rays against the boxes)
  function rayHit(o, d) {
    for (const b of boxes) {
      let tmin = 1e-3, tmax = 1e5;
      let ok = true;
      for (let a = 0; a < 3; a++) {
        const inv = 1 / d[a];
        let t1 = (b.min[a] - o[a]) * inv, t2 = (b.max[a] - o[a]) * inv;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
    return false;
  }
  const sunCol = [1.0, 0.93, 0.78], ambCol = [0.5, 0.49, 0.5];
  function lightAt(p, n) {
    const nl = n[0] * SUN.x + n[1] * SUN.y + n[2] * SUN.z;
    let s = 0;
    if (nl > 0) {
      const o = [p[0] + n[0] * 1, p[1] + n[1] * 1, p[2] + n[2] * 1];
      if (!rayHit(o, [SUN.x, SUN.y, SUN.z])) s = 0.25 + 0.6 * nl;
    }
    // cheap ground bounce / sky occlusion near the floor
    const occ = n[2] > 0.5 ? 1 : 0.92 + 0.08 * Math.min(1, p[2] / 96);
    return [(ambCol[0] + sunCol[0] * s) * occ, (ambCol[1] + sunCol[1] * s) * occ, (ambCol[2] + sunCol[2] * s) * occ];
  }
  function makeLightmap(origin, du, dv, lenU, lenV, n) {
    const w = Math.ceil(lenU / 16) + 1, h = Math.ceil(lenV / 16) + 1;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const u = Math.min(lenU, i * 16), v = Math.min(lenV, j * 16);
        const p = [origin[0] + du[0] * u + dv[0] * v, origin[1] + du[1] * u + dv[1] * v, origin[2] + du[2] * u + dv[2] * v];
        const l = lightAt(p, n);
        const k = (j * w + i) * 4;
        img.data[k] = Math.min(255, (l[0] / 2) * 255);
        img.data[k + 1] = Math.min(255, (l[1] / 2) * 255);
        img.data[k + 2] = Math.min(255, (l[2] / 2) * 255);
        img.data[k + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.NoColorSpace;
    return { tex: t, w, h };
  }

  /** Build one quad. corners in GoldSrc coords: origin + du*u + dv*v (u right, v down the texture). */
  function face(texName, opts, origin, du, dv, lenU, lenV, n, uOff, vOff) {
    const meta = TEXTURES[texName];
    const fit = opts === 'fit' || opts?.fit;
    const flip = opts?.flip;
    const lmap = makeLightmap(origin, du, dv, lenU, lenV, n);
    const pos = [], uv = [], lmuv = [];
    for (const [a, b] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]) {
      const u = a * lenU, v = b * lenV;
      pos.push(origin[0] + du[0] * u + dv[0] * v, origin[1] + du[1] * u + dv[1] * v, origin[2] + du[2] * u + dv[2] * v);
      let tu, tv;
      if (fit) {
        tu = flip ? 1 - a : a;
        tv = b;
      } else {
        tu = (uOff + u) / meta.world[0];
        tv = (vOff + v) / meta.world[1];
      }
      uv.push(tu, 1 - tv);
      lmuv.push((u / 16 + 0.5) / lmap.w, 1 - (v / 16 + 0.5) / lmap.h);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aLm', new THREE.Float32BufferAttribute(lmuv, 2));
    // winding: (du x dv) points into the surface for u-right/v-down; flip so the face points along n
    const cr = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
    const same = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0;
    g.setIndex(same ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
    const m = new THREE.ShaderMaterial({ uniforms: { map: { value: tex(texName) }, lm: { value: lmap.tex } }, vertexShader: vs, fragmentShader: fs });
    world.add(new THREE.Mesh(g, m));
  }

  for (const b of boxes) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const pick = (k) => {
      const f = b.faces[k] ?? b.faces.all;
      return Array.isArray(f) ? f : [f, null];
    };
    // side faces: texture v runs down from the top edge, u world-aligned
    const sides = [
      ['s', [x0, y0, z1], [1, 0, 0], x1 - x0, [0, -1, 0], x0],
      ['n', [x1, y1, z1], [-1, 0, 0], x1 - x0, [0, 1, 0], -x1],
      ['e', [x1, y0, z1], [0, 1, 0], y1 - y0, [1, 0, 0], y0],
      ['w', [x0, y1, z1], [0, -1, 0], y1 - y0, [-1, 0, 0], -y1],
    ];
    for (const [k, o, du, lu, n, uo] of sides) {
      const [t, opt] = pick(k);
      face(t, opt, o, du, [0, 0, -1], lu, z1 - z0, n, uo, 0);
    }
    const [tt, topt] = pick('top');
    face(tt, topt, [x0, y1, z1], [1, 0, 0], [0, -1, 0], x1 - x0, y1 - y0, [0, 0, 1], x0, -y1);
  }
  for (const q of quads) {
    face(q.name, { fit: true, flip: q.flip }, [q.x0, q.y, q.z1], [1, 0, 0], [0, 0, -1], q.x1 - q.x0, q.z1 - q.z0, [0, -1, 0], 0, 0);
  }

  // ---- decals and sprites
  function decal(name, center, du, dv, size, n, additive = false) {
    const g = new THREE.BufferGeometry();
    const p = [];
    for (const [a, b] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ])
      p.push(center[0] + (du[0] * a + dv[0] * b) * size, center[1] + (du[1] * a + dv[1] * b) * size, center[2] + (du[2] * a + dv[2] * b) * size);
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    g.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]);
    const l = lightAt(center, n);
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex(name) }, light: { value: new THREE.Vector3(...l) }, additive: { value: additive ? 1 : 0 } },
      vertexShader: vs.replace('attribute vec2 aLm;', '').replace('vLm = aLm;', ''),
      fragmentShader: fsDecal,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = additive ? 3 : 2;
    world.add(mesh);
  }
  const S = [1, 0, 0], Dn = [0, 0, -1], NS = [0, -1, 0];
  decal('decal_bullet', [40, 591.6, 180], S, Dn, 8, NS);
  decal('decal_bullet', [56, 591.6, 172], S, Dn, 8, NS);
  decal('decal_bullet', [48, 591.6, 160], S, Dn, 8, NS);
  decal('decal_blood1', [380, 591.7, 90], S, Dn, 64, NS);
  decal('decal_scorch', [120, 400, 0.6], [1, 0, 0], [0, -1, 0], 128, [0, 0, 1]);
  decal('decal_blood2', [0, 229.6, 40], S, Dn, 48, NS);
  decal('spr_muzzle2', [20, 60, 46], S, Dn, 24, NS, true);
  decal('spr_flare', [140, 330, 40], S, Dn, 10, NS, true);

  // ---- camera
  const cams = [
    { p: [40, -60, 64], yaw: 72, pitch: 2 },
    { p: [-330, 120, 64], yaw: 60, pitch: -4 },
    { p: [350, 250, 64], yaw: 30, pitch: 4 },
    { p: [-120, 420, 64], yaw: 10, pitch: 6 },
  ];
  let cam = { ...cams[+(params.get('cam') || 0)] };
  cam.p = [...cam.p];
  const camera = new THREE.PerspectiveCamera(70, 1, 1, 8000);
  function place() {
    const y = (cam.yaw * Math.PI) / 180, pt = (cam.pitch * Math.PI) / 180;
    const f = [Math.cos(y) * Math.cos(pt), Math.sin(y) * Math.cos(pt), -Math.sin(pt)];
    camera.position.set(cam.p[0], cam.p[2], -cam.p[1]);
    camera.lookAt(cam.p[0] + f[0], cam.p[2] + f[2], -(cam.p[1] + f[1]));
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    // CS 1.6: 90 degree horizontal FOV
    camera.aspect = w / h;
    camera.fov = (2 * Math.atan(Math.tan(Math.PI / 4) / camera.aspect) * 180) / Math.PI;
    camera.updateProjectionMatrix();
  }
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => (drag = [e.clientX, e.clientY]));
  addEventListener('pointerup', () => (drag = null));
  addEventListener('pointermove', (e) => {
    if (!drag) return;
    cam.yaw -= (e.clientX - drag[0]) * 0.2;
    cam.pitch = Math.max(-89, Math.min(89, cam.pitch + (e.clientY - drag[1]) * 0.2));
    drag = [e.clientX, e.clientY];
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const y = (cam.yaw * Math.PI) / 180, s = -Math.sign(e.deltaY) * 24;
      cam.p[0] += Math.cos(y) * s;
      cam.p[1] += Math.sin(y) * s;
    },
    { passive: false }
  );
  addEventListener('keydown', (e) => {
    const k = +e.key - 1;
    if (cams[k]) {
      cam = { ...cams[k], p: [...cams[k].p] };
    }
  });
  addEventListener('resize', resize);
  resize();
  function frame() {
    place();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
  console.log('3d scene ready');
}
