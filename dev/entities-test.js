// Entities test page: zombies (outfits / variants / animation states / ragdolls / corpses), cars, FX.
// URL params: ?scene=lineup|variants|states|ragdoll|corpses|cars|fx|night|perf|closeup|skins &t=seconds &w=&h=
import * as THREE from 'three';
import { globalUniforms } from '../src/render/materials.js';
import { B } from '../src/world/blocks.js';
import { FakeWorld, buildWorldMeshes } from './entities-world.js';
import { createZombieVisual, createCorpseVisual, ZOMBIE_OUTFITS, ZOMBIE_VARIANTS } from '../src/entities/zombie/ZombieModel.js';

const params = new URLSearchParams(location.search);
const SCENE = params.get('scene') || 'lineup';
const T_END = parseFloat(params.get('t') || '1.5');
const NIGHT = params.get('night') === '1' || SCENE === 'night' || SCENE === 'fxnight';
const info = document.getElementById('info');
const log = (s) => { info.textContent += s + '\n'; console.log(s); };

// ------------------------------------------------------------------ renderer + post (mirrors src/render/Renderer.js)
const W = parseInt(params.get('w') || '1280'), H = parseInt(params.get('h') || '720');
const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: true });
const postMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: { tScene: { value: rt.texture } },
  vertexShader: 'out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `precision highp float; uniform sampler2D tScene; in vec2 vUv; out vec4 fragColor;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
    vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(0.0031308,c)); }
    void main(){ vec3 c = texture(tScene, vUv).rgb; c = aces(c); float l = dot(c, vec3(0.2126,0.7152,0.0722));
      c = mix(vec3(l), c, 0.86); c = (c-0.5)*1.06+0.5; vec2 d = vUv-0.5; c *= mix(1.0, smoothstep(0.85,0.15,dot(d,d)), 0.35);
      fragColor = vec4(toSRGB(clamp(c,0.0,1.0)),1.0); }`,
  depthTest: false, depthWrite: false,
});
const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const postScene = new THREE.Scene();
const pq = new THREE.Mesh(tri, postMat); pq.frustumCulled = false; postScene.add(pq);
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const scene = new THREE.Scene();
window.__scene = scene;
const camera = new THREE.PerspectiveCamera(60, W / H, 0.05, 400);
camera.rotation.order = 'YXZ';

function setLighting(night) {
  const G = globalUniforms;
  if (!night) {
    G.uSunDir.value.set(0.45, 0.8, 0.38).normalize();
    G.uSunColor.value.setRGB(1.0, 0.93, 0.82).multiplyScalar(1.5);
    G.uAmbientColor.value.setRGB(0.5, 0.57, 0.7);
    G.uMinLight.value = 0.026;
    G.uFogColor.value.setRGB(0.62, 0.7, 0.8);
    G.uFogDensity.value = 0.0085;
    G.uFlashOn.value = 0;
    renderer.setClearColor(new THREE.Color(0.55, 0.68, 0.85));
  } else {
    G.uSunDir.value.set(-0.3, 0.7, -0.2).normalize();
    G.uSunColor.value.setRGB(0.32, 0.38, 0.55).multiplyScalar(0.15);
    G.uAmbientColor.value.setRGB(0.028, 0.036, 0.065);
    G.uMinLight.value = 0.006;
    G.uFogColor.value.setRGB(0.02, 0.025, 0.04);
    G.uFogDensity.value = 0.022;
    G.uFlashOn.value = 1;
    renderer.setClearColor(new THREE.Color(0.01, 0.012, 0.02));
  }
}
setLighting(NIGHT);

// ------------------------------------------------------------------ world
const world = new FakeWorld();
world.fill(-48, 0, -48, 47, 0, 47, B.grass);
world.fill(-48, 0, -2, 47, 0, 2, B.asphalt);
const isSolid = (x, y, z) => world.isSolid(x, y, z);

const updaters = [];
const cells = [];
const T0 = performance.now();

function camLook(px, py, pz, tx, ty, tz) {
  camera.position.set(px, py, pz);
  camera.lookAt(tx, ty, tz);
}

// ------------------------------------------------------------------ scenes
const scenes = {
  lineup() {
    // all outfits as walkers, alternating idle / walk in place, different aggro
    ZOMBIE_OUTFITS.forEach((o, i) => {
      const z = createZombieVisual({ variant: 'walker', outfit: o, seed: 100 + i * 17 });
      z.root.position.set((i - 6) * 1.25, 1, 4);
      z.root.rotation.y = 0;
      scene.add(z.root);
      const st = i % 3 === 0 ? 'walk' : 'idle';
      updaters.push((dt) => z.update(dt, { state: st, speed: st === 'walk' ? 0.9 : 0, aggro: (i % 4) / 3 }));
      z.setLight(1, 0);
    });
    ZOMBIE_OUTFITS.forEach((o, i) => {
      const z = createZombieVisual({ variant: 'walker', outfit: o, seed: 900 + i * 31 });
      z.root.position.set((i - 6) * 1.25, 1, 7.5);
      z.root.rotation.y = 0.0;
      scene.add(z.root);
      updaters.push((dt) => z.update(dt, { state: 'idle', speed: 0, aggro: 1 }));
      z.setLight(1, 0);
    });
    camLook(0, 2.3, 15.5, 0, 1.6, 5.5);
  },
  back() {
    scenes.lineup();
    camLook(0, 2.6, -4.5, 0, 1.6, 6);
  },
  variants() {
    const moving = params.get('moving') === '1';
    ZOMBIE_VARIANTS.forEach((v, i) => {
      const z = createZombieVisual({ variant: v, outfit: ZOMBIE_OUTFITS[(i * 3 + (moving ? 5 : 0)) % 13], seed: 300 + i * 11 + (moving ? 101 : 0) });
      z.root.position.set((i - 2.5) * 1.8, 1, 4);
      z.root.rotation.y = moving ? 0.9 : 0.25;
      scene.add(z.root);
      const st = !moving ? (params.get('state') || 'idle') : (v === 'runner' ? 'run' : v === 'crawler' ? 'crawl' : v === 'screamer' ? 'scream' : 'walk');
      const sp = st === 'run' ? 4.5 : st === 'walk' ? 1.0 : st === 'crawl' ? 0.5 : 0;
      updaters.push((dt) => z.update(dt, { state: st, speed: sp, aggro: parseFloat(params.get('aggro') || '0.6') }));
      z.setLight(1, 0);
      const lbl = makeLabel(v + (moving ? ' ' + st : ''));
      lbl.position.set(z.root.position.x, 3.25, z.root.position.z);
      scene.add(lbl);
    });
    camLook(0, 2.6, 12.5, 0, 1.4, 4);
  },
  states() {
    const all = ['idle', 'walk', 'run', 'crawl', 'attack', 'bash', 'stagger', 'knockdown', 'down', 'getup', 'feed', 'scream'];
    const set = parseInt(params.get('set') || '0');
    const states = set === 2 ? all : all.slice(set * 6, set * 6 + 6);
    const variant = params.get('variant') || 'walker';
    states.forEach((st, i) => {
      const z = createZombieVisual({ variant, outfit: ZOMBIE_OUTFITS[(i + set * 6) % 13], seed: 500 + (i + set * 6) * 7 });
      const col = i % 6, row = Math.floor(i / 6);
      z.root.position.set((col - 2.5) * 2.2, 1, 3 - row * 4);
      z.root.rotation.y = st === 'bash' ? Math.PI / 2 : st === 'down' || st === 'knockdown' || st === 'getup' ? 1.2 : 0.6;
      if (st === 'bash') world.fill(Math.floor(z.root.position.x) + 1, 1, Math.floor(z.root.position.z) - 1, Math.floor(z.root.position.x) + 1, 2, Math.floor(z.root.position.z) - 1, B.planks_oak);
      scene.add(z.root);
      const sp = { walk: 1, run: 4.5, crawl: 0.5 }[st] || 0;
      const at = parseFloat(params.get('at') || '0.45');
      const stT = parseFloat(params.get('st') || '0.25');
      let tState = 0;
      updaters.push((dt, t) => {
        tState += dt;
        let s = st;
        if ((st === 'knockdown' || st === 'getup' || st === 'stagger' || st === 'scream') && tState < T_END - stT) s = st === 'getup' ? 'down' : 'idle';
        z.update(dt, { state: s, speed: sp, aggro: 0.8, attackT: at });
      });
      z.setLight(1, 0);
      const lbl = makeLabel(st);
      lbl.position.set(z.root.position.x, 3.0, z.root.position.z);
      scene.add(lbl);
    });
    camLook(0, 2.8, 11.5, 0, 1.1, 3);
  },
  grid() {
    // one subject per viewport cell: states=a,b,c & variant= & outfits=
    const states = (params.get('states') || 'idle,walk,run,attack,bash,stagger,knockdown,down,getup,feed,scream,crawl').split(',');
    const outs = (params.get('outfits') || ZOMBIE_OUTFITS.join(',')).split(',');
    const variants = (params.get('variants') || params.get('variant') || 'walker').split(',');
    const n = Math.max(states.length, params.get('outfits') ? outs.length : 0, variants.length);
    const at = (params.get('at') || '0.45').split(',').map(Number);
    const stT = parseFloat(params.get('st') || '0.3');
    for (let i = 0; i < n; i++) {
      const st = states[i % states.length], o = outs[i % outs.length], v = variants[i % variants.length];
      const z = createZombieVisual({ variant: v, outfit: o, seed: parseInt(params.get('seed') || '500') + i * 7 });
      const X = (i % 6) * 14 - 35, Zc = Math.floor(i / 6) * 14 - 35;
      z.root.position.set(X, 1, Zc);
      z.root.rotation.y = st === 'bash' ? 0 : parseFloat(params.get('yaw') || '0.5');
      scene.add(z.root);
      if (st === 'bash') world.fill(X - 1, 1, Zc + 1, X + 1, 3, Zc + 1, B.planks_oak);
      const bashCam = st === 'bash';
      const sp = { walk: 1, run: 4.5, crawl: 0.5 }[st] || 0;
      let tState = 0;
      const atI = at[i % at.length];
      updaters.push((dt) => {
        tState += dt;
        let s2 = st;
        if ((st === 'knockdown' || st === 'getup' || st === 'stagger' || st === 'scream') && tState < T_END - stT) s2 = st === 'getup' ? 'down' : 'idle';
        z.update(dt, { state: s2, speed: sp, aggro: parseFloat(params.get('aggro') || '0.8'), attackT: atI });
      });
      z.setLight(1, 0);
      const low = ['down', 'knockdown', 'getup', 'crawl', 'feed'].includes(st) || v === 'crawler';
      const d = parseFloat(params.get('dist') || '1');
      const sc = v === 'brute' ? 1.3 : 1;
      const yaw = z.root.rotation.y;
      if (bashCam) cells.push({ cam: [X + 3.6 * d, 2.4, Zc - 1.2 * d, X, 1.95, Zc], label: `${st} ${v} ${o}` });
      else cells.push({ cam: [X + 2.3 * d * sc, 1 + (low ? 1.1 : 1.35) * sc, Zc + 3.0 * d * sc, X, 1 + (low ? 0.3 : 0.95 * sc), Zc], label: `${st} ${v} ${o}` });
    }
  },
  ragseq() {
    const times = (params.get('times') || '0,0.15,0.3,0.45,0.6,0.9,1.4,2.2,4').split(',').map(Number);
    const imp = (params.get('imp') || '0,0.5,-3').split(',').map(Number);
    const part = params.get('part') || 'torso';
    const v = params.get('variant') || 'walker';
    const st0 = params.get('pre') || 'walk';
    if (params.get('wall')) times.forEach((_, i) => { const X = (i % 6) * 14 - 35, Zc = Math.floor(i / 6) * 14 - 35; world.fill(X - 2, 1, Zc - 2, X + 2, 3, Zc - 2, B.brick_red); });
    times.forEach((tt, i) => {
      const X = (i % 6) * 14 - 35, Zc = Math.floor(i / 6) * 14 - 35;
      const z = createZombieVisual({ variant: v, outfit: params.get('outfit') || 'police', seed: 77 });
      z.root.position.set(X, 1, Zc);
      z.root.rotation.y = 0;
      scene.add(z.root);
      z.setLight(1, 0);
      let t = 0, started = false, done = false;
      const startAt = T_END - tt;
      updaters.push((dt) => {
        t += dt;
        if (!started) {
          z.update(dt, { state: st0, speed: st0 === 'walk' ? 1 : st0 === 'run' ? 4 : 0, aggro: 1 });
          if (t >= startAt - 1e-6) { started = true; z.startRagdoll(new THREE.Vector3(...imp), part, isSolid); }
        } else if (!done && !z.updateRagdoll(dt)) { done = true; log(`cell ${i}: settled after ${(t - startAt).toFixed(2)}s (sim time ${z.ragdoll.time.toFixed(2)})`); }
      });
      cells.push({ cam: [X + 3.4, 2.6, Zc + 2.2, X, 1.1, Zc - 0.8], label: `t=${tt}` });
    });
  },
  closeup() {
    const outs = (params.get('outfits') || 'police,military,firefighter').split(',');
    outs.forEach((o, i) => {
      const v = params.get('variant') || 'walker';
      const z = createZombieVisual({ variant: v, outfit: o, seed: parseInt(params.get('seed') || '77') + i * 13 });
      z.root.position.set((i - (outs.length - 1) / 2) * 1.3, 1, 4);
      z.root.rotation.y = parseFloat(params.get('yaw') || '0.3');
      scene.add(z.root);
      const st = params.get('state') || 'idle';
      updaters.push((dt) => z.update(dt, { state: st, speed: parseFloat(params.get('speed') || '0'), aggro: parseFloat(params.get('aggro') || '0.3'), attackT: parseFloat(params.get('at') || '0.4') }));
      z.setLight(1, 0);
      if (params.get('wound')) {
        // shoot rays from the camera side at several parts and paint wounds at the precise hit points
        z.update(0.016, { state: st, speed: 0, aggro: 0.3 });
        const o = new THREE.Vector3(), d = new THREE.Vector3(), t = new THREE.Vector3();
        for (const part of ['torso', 'torso', 'head', 'armR', 'armL', 'legL', 'legR']) {
          z.getPartPosition(part, t); t.x += (Math.random() - 0.5) * 0.15; t.y += (Math.random() - 0.5) * 0.15;
          o.set(t.x + 1.2, t.y + 0.3, t.z + 4); d.subVectors(t, o).normalize();
          const h = z.raycast(o, d, 10);
          if (h) z.addWound(h.part, h.point, part === 'torso' ? 2 : 1);
        }
        if (params.get('flash')) z.flash(0xff3030, 0.6);
      }
      if (params.get('dismember')) params.get('dismember').split('~').forEach((p) => { const [a, b] = p.split(':'); z.dismember(a, b || 'upper'); });
    });
    const d = parseFloat(params.get('dist') || '4.2');
    camLook(0, 2.0, 4 + d, 0, 1.75, 4);
  },
  ragdoll() {
    // walls to fall against
    world.fill(-6, 1, 9, 6, 3, 9, B.brick_red);
    world.fill(7, 1, 2, 7, 2, 9, B.concrete);
    world.fill(-2, 1, 3, -1, 1, 4, B.planks_oak); // a low crate to fall over
    const defs = [
      { x: -4.5, z: 7.6, imp: [0, 1, 4.5], part: 'head', o: 'police' },
      { x: -2.2, z: 5.0, imp: [0, 0.5, -3.5], part: 'torso', o: 'civilian' },
      { x: 0.2, z: 6.5, imp: [0, 1.5, 6.5], part: 'torso', o: 'military' },
      { x: 2.5, z: 5.5, imp: [3, 0.3, 0.5], part: 'legL', o: 'worker' },
      { x: 5.2, z: 6.0, imp: [4.5, 1, 1], part: 'head', o: 'farmer', v: 'brute' },
      { x: -1.2, z: 2.2, imp: [0, 0.5, 3.5], part: 'torso', o: 'medic', v: 'bloater' },
      { x: 3.8, z: 3.0, imp: [-1, 0, 0], part: 'torso', o: 'prisoner', run: true },
    ];
    defs.forEach((d, i) => {
      const z = createZombieVisual({ variant: d.v || 'walker', outfit: d.o, seed: 700 + i * 3 });
      z.root.position.set(d.x, 1, d.z);
      z.root.rotation.y = i * 0.7;
      scene.add(z.root);
      z.setLight(1, 0);
      if (i === 1) z.dismember('head');
      if (i === 3) z.dismember('armR', 'lower');
      let started = false, settledAt = -1, t = 0;
      updaters.push((dt) => {
        t += dt;
        if (!started) {
          if (d.run) { z.root.position.x -= dt * 4; z.update(dt, { state: 'run', speed: 4, aggro: 1 }); }
          else z.update(dt, { state: 'walk', speed: 1, aggro: 1 });
          if (t > 0.3) { started = true; z.startRagdoll(new THREE.Vector3(...d.imp), d.part, isSolid); }
        } else if (!z.updateRagdoll(dt) && settledAt < 0) { settledAt = t; log(`ragdoll ${i} settled at ${t.toFixed(2)}s`); }
      });
    });
    camLook(1.5, 4.8, -4.5, 0.5, 1, 6);
  },
  corpses() {
    ['civilian', 'survivor', 'police', 'military', 'civilian_f', 'medic', 'hunter', 'worker'].forEach((o, i) => {
      const c = createCorpseVisual({ outfit: o, seed: 40 + i * 9 });
      c.root.position.set((i % 4 - 1.5) * 2.6, 1, 3 + Math.floor(i / 4) * 2.8);
      c.root.rotation.y = i * 1.3;
      c.setLight(1, 0);
      scene.add(c.root);
    });
    camLook(0, 6.5, 11, 0, 0.8, 4.5);
  },
  perf() {
    const zs = [];
    const tc = performance.now();
    for (let i = 0; i < 20; i++) createCorpseVisual({ outfit: ZOMBIE_OUTFITS[i % 13], seed: i }).dispose();
    log(`create corpse avg ${((performance.now() - tc) / 20).toFixed(2)}ms`);
    const tz = performance.now();
    for (let i = 0; i < 80; i++) {
      const z = createZombieVisual({ variant: ZOMBIE_VARIANTS[i % 6], outfit: ZOMBIE_OUTFITS[i % 13], seed: 1000 + i });
      z.root.position.set((i % 10 - 4.5) * 1.6, 1, 3 + Math.floor(i / 10) * 2.2);
      scene.add(z.root);
      z.setLight(1, 0);
      zs.push(z);
    }
    log(`create zombie avg ${((performance.now() - tz) / 80).toFixed(2)}ms`);
    const states = ['walk', 'idle', 'run', 'attack', 'bash', 'feed', 'stagger', 'walk'];
    let frames = 0, total = 0, maxT = 0;
    updaters.push((dt, t) => {
      const t0 = performance.now();
      for (let i = 0; i < zs.length; i++) {
        const st = states[i % states.length];
        zs[i].update(dt, { state: st, speed: st === 'walk' ? 1 : st === 'run' ? 4 : 0, aggro: 0.7, attackT: (t * 0.8 + i * 0.1) % 1 });
        zs[i].setLight(1, 0);
      }
      const e = performance.now() - t0;
      if (t > 0.5) { frames++; total += e; maxT = Math.max(maxT, e); }
    });
    window.__perfReport = () => ({ frames, avgMs: total / Math.max(1, frames), maxMs: maxT });
    // raycast correctness + cost: aim at the head / torso / legs of every zombie from the camera side
    window.__rayTest = () => {
      const o = new THREE.Vector3(), d = new THREE.Vector3(), tgt = new THREE.Vector3();
      let ok = 0, n = 0, rt = 0; window.__rayFails = [];
      for (const z of zs) {
        for (const part of ['head', 'torso', 'legL']) {
          if (!z.hasPart(part)) continue;
          z.getPartPosition(part, tgt);
          o.set(tgt.x + 3, tgt.y + 0.4, tgt.z + 5);
          d.subVectors(tgt, o).normalize();
          const t1 = performance.now();
          const h = z.raycast(o, d, 20);
          rt += performance.now() - t1;
          n++;
          if (h && h.part === part) ok++;
          else if (window.__rayFails) window.__rayFails.push(`${z.variant}/${states[zs.indexOf(z) % states.length]} aim ${part} got ${h ? h.part + '@' + h.distance.toFixed(2) : 'null'} (target at ${o.distanceTo(tgt).toFixed(2)})`);
        }
      }
      // misses
      let miss = 0;
      for (const z of zs) { const h = z.raycast(new THREE.Vector3(z.root.position.x + 3, 5, z.root.position.z), new THREE.Vector3(0, 0, 1), 20); if (!h) miss++; }
      return `raycast: ${ok}/${n} hit the aimed part, ${miss}/${zs.length} clean misses, avg ${(rt / n * 1000).toFixed(1)}us/ray`;
    };
    camLook(0, 9, 26, 0, 0, 10);
  },
  skins() {
    // dump the skin textures to a 2D canvas for inspection
    const cv = document.createElement('canvas');
    cv.id = 'skins';
    const N = 13, S = 64;
    cv.width = S * 7; cv.height = S * 4;
    cv.style.width = (S * 7 * 2.8) + 'px'; cv.style.height = (S * 4 * 2.8) + 'px';
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ff00ff'; ctx.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < 28; i++) {
      const o = ZOMBIE_OUTFITS[i % N];
      const v = i < 13 ? 'walker' : ZOMBIE_VARIANTS[i % 6];
      const z = createZombieVisual({ variant: v, outfit: o, seed: 50 + i });
      const img = new ImageData(new Uint8ClampedArray(z.body.pix.d), S, S);
      ctx.putImageData(img, (i % 7) * S, Math.floor(i / 7) * S);
    }
    document.body.appendChild(cv);
    camLook(0, 2, 10, 0, 1, 0);
  },
};
scenes.night = scenes.lineup;

function makeLabel(text) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center'; ctx.fillText(text, 64, 23);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: 0x444444 }));
  s.scale.set(1.6, 0.4, 1);
  return s;
}

// extra scene modules (cars / fx) are loaded lazily so this page works while they are being built
async function setup() {
  if (scenes[SCENE]) scenes[SCENE]();
  else if (SCENE === 'cars' || SCENE.startsWith('car')) (await import('./entities-cars.js')).setupCars({ scene, world, camLook, updaters, params, log, cells });
  else if (SCENE.startsWith('fx')) (await import('./entities-fx.js')).setupFX({ scene, world, camLook, updaters, params, log, camera, setLighting });
  buildWorldMeshes(world, scene);
  if (params.get('cam')) { const c = params.get('cam').split(',').map(Number); camLook(c[0], c[1], c[2], c[3], c[4], c[5]); }
  if (params.get('fov')) { camera.fov = +params.get('fov'); camera.updateProjectionMatrix(); }
  if (NIGHT) {
    const G = globalUniforms;
    G.uFlashPos.value.copy(camera.position);
    camera.getWorldDirection(G.uFlashDir.value);
  }
  G_cam();
  // deterministic fixed-step simulation up to T_END, then render
  const dt = 1 / 60;
  const steps = Math.round((SCENE === 'perf' ? Math.max(T_END, 5) : T_END) / dt);
  let t = 0;
  for (let i = 0; i < steps; i++) {
    t += dt;
    globalUniforms.uTime.value = t;
    for (const u of updaters) u(dt, t);
  }
  render();
  window.__ready = true;
  window.__simTime = t;
  log(`scene=${SCENE} t=${t.toFixed(2)} setup+sim ${(performance.now() - T0).toFixed(0)}ms draw calls=${window.__calls}`);
  if (window.__fxReport) log(window.__fxReport());
  if (window.__perfReport) { const r = window.__perfReport(); log(`perf: 80 zombies update avg ${r.avgMs.toFixed(3)}ms max ${r.maxMs.toFixed(3)}ms over ${r.frames} frames`); }
  if (window.__rayTest) { log(window.__rayTest()); console.log(window.__rayFails.slice(0, 40).join('\n')); }
  if (SCENE === 'perf') {
    // render timing (swiftshader = CPU rasteriser, so only the relative cost matters)
    const t1 = performance.now(); for (let i = 0; i < 10; i++) render(); log(`render avg ${((performance.now() - t1) / 10).toFixed(1)}ms/frame, draw calls ${window.__calls}`);
  }
  if (params.get('live')) {
    let last = performance.now();
    const loop = () => {
      const now = performance.now(); const d = Math.min(0.05, (now - last) / 1000); last = now; t += d;
      globalUniforms.uTime.value = t;
      for (const u of updaters) u(d, t);
      render();
      requestAnimationFrame(loop);
    };
    loop();
  }
}
function G_cam() { globalUniforms.uCamPos.value.copy(camera.position); }
function render() {
  G_cam();
  renderer.setRenderTarget(rt);
  renderer.clear(true, true, false);
  if (cells.length) {
    const cols = parseInt(params.get('cols') || String(Math.ceil(Math.sqrt(cells.length * W / H))));
    camera.fov = parseFloat(params.get('fov') || '38'); 
    const rows = Math.ceil(cells.length / cols);
    const cw = Math.floor(W / cols), ch = Math.floor(H / rows);
    rt.scissorTest = true;
    let calls = 0;
    cells.forEach((c, i) => {
      const x = (i % cols) * cw, y = H - (Math.floor(i / cols) + 1) * ch;
      rt.viewport.set(x, y, cw, ch); rt.scissor.set(x, y, cw, ch);
      renderer.setRenderTarget(rt);
      camera.aspect = cw / ch; camera.updateProjectionMatrix();
      camLook(...c.cam);
      G_cam();
      renderer.render(scene, camera);
      calls += renderer.info.render.calls;
      if (!c.el) {
        c.el = document.createElement('div');
        c.el.style.cssText = `position:fixed;left:${x + 4}px;top:${H - y - ch + 4}px;color:#fff;font:11px monospace;text-shadow:0 0 2px #000`;
        c.el.textContent = c.label; document.body.appendChild(c.el);
      }
    });
    rt.scissorTest = false; rt.viewport.set(0, 0, W, H); rt.scissor.set(0, 0, W, H);
    window.__calls = calls;
  } else {
    renderer.render(scene, camera);
    window.__calls = renderer.info.render.calls;
  }
  renderer.setRenderTarget(null);
  renderer.clear(true, true, false);
  renderer.render(postScene, postCam);
}
window.__render = render;
window.__step = (sec) => { const dt = 1 / 60; for (let i = 0; i < Math.round(sec / dt); i++) { window.__simTime += dt; globalUniforms.uTime.value = window.__simTime; for (const u of updaters) u(dt, window.__simTime); } render(); };
setup().catch((e) => { console.error(e); log('ERROR ' + e.message); window.__ready = true; });
