// Animation preview: every clip on the retro zombie mesh (each kind), the source Quaternius rig
// playing the original clip beside it, keys to switch clips / kinds, slow motion, a filmstrip mode.
//   npx vite --config vite.tower.config.js --port 5182  ->  http://127.0.0.1:5182/tools/preview/anim.html
// The source rig needs the glb files in tools/anim/cache/ (see tools/anim/extract.mjs).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { World } from '../../src/physics/world.js';
import { Ragdoll } from '../../src/human/ragdoll.js';
import { AnimPlayer, CLIP_INFO } from '../../src/tower/anim/animPlayer.js';
import { prepareZombieMeshes, createZombieVisual, zombieMeshStats } from '../../src/tower/render/zombieLook.js';

const CLIPS = Object.keys(CLIP_INFO);
const KINDS = ['walker', 'runner', 'crawler', 'climber', 'bloater', 'screamer', 'armored', 'brute', 'juggernaut'];
const SOURCE = {
  walk: ['ual2', 'Zombie_Walk_Fwd_Loop'], idle: ['ual2', 'Zombie_Idle_Loop'], attack: ['ual2', 'Zombie_Scratch'],
  push: ['ual1', 'Push_Loop'], jog: ['ual1', 'Jog_Fwd_Loop'], sprint: ['ual1', 'Sprint_Loop'], walk2: ['ual1', 'Walk_Loop'],
  vault: ['ual2', 'ClimbUp_1m_RM'], getup: ['ual2', 'LayToIdle'],
};
const GLB = { ual1: '../anim/cache/ual1/AnimationLibrary_Godot_Standard.glb', ual2: '../anim/cache/ual2/UAL2_Standard.glb' };

const params = new URLSearchParams(location.search);
const W = +(params.get('w') || innerWidth), H = +(params.get('h') || innerHeight);
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2b2733);
scene.fog = new THREE.Fog(0x2b2733, 18, 60);
const camera = new THREE.PerspectiveCamera(32, W / H, 0.05, 200);
camera.position.set(2.8, 1.6, 4.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.9, 0);
controls.update();
scene.add(new THREE.HemisphereLight(0xd8c8b0, 0x30283a, 1.1));
const sun = new THREE.DirectionalLight(0xffe2c0, 1.4);
sun.position.set(3, 6, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
scene.add(sun);
scene.add(sun.target);

// ground: a checker you can see feet slide on
{
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y) % 2 ? '#4a4538' : '#57513f';
    g.fillRect(x * 8, y * 8, 8, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 40);
  tex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // a tower leg for the climb clip
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8, 0.3), new THREE.MeshLambertMaterial({ color: 0x6a6460 }));
  leg.position.set(0, 4, 0.15);
  leg.visible = false;
  scene.add(leg);
  window.__leg = leg;
}

// footprints: where each foot's sole touched the ground (smeared prints = sliding feet)
const TRAIL_MAX = 6000;
const trail = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, depthTest: false }));
trail.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3));
trail.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3));
trail.geometry.setDrawRange(0, 0);
trail.frustumCulled = false;
trail.renderOrder = 11;
scene.add(trail);
let trailN = 0;
function addPrint(x, y, z, r, g, b) {
  const i = trailN % TRAIL_MAX;
  trail.geometry.attributes.position.setXYZ(i, x, y, z);
  trail.geometry.attributes.color.setXYZ(i, r, g, b);
  trailN++;
  trail.geometry.setDrawRange(0, Math.min(trailN, TRAIL_MAX));
  trail.geometry.attributes.position.needsUpdate = true;
  trail.geometry.attributes.color.needsUpdate = true;
}
function clearPrints() {
  trailN = 0;
  trail.geometry.setDrawRange(0, 0);
}
const _sv = new THREE.Vector3(), _sq = new THREE.Quaternion();
/** Lowest sole corner of a foot body (world). */
function soleLow(body, side) {
  const c = side === 'L' ? 0.105 : -0.105;
  const bp = body.userData.segment.bindPos;
  let best = null;
  _sq.set(body.rot.x, body.rot.y, body.rot.z, body.rot.w);
  for (const [dx, dz] of [[-0.045, -0.065], [0.045, -0.065], [-0.045, 0.168], [0.045, 0.168]]) {
    _sv.set(c + dx - bp.x, 0 - bp.y, dz - bp.z).applyQuaternion(_sq).add(body.pos);
    if (!best || _sv.y < best.y) best = _sv.clone();
  }
  return best;
}

const world = new World();
const state = { trail: params.get('trail') === '1', clip: params.get('clip') || 'walk', kind: params.get('kind') || 'walker', slow: 1, paused: false, moving: params.get('moving') !== '0', film: params.get('film') === '1', rig: true, skel: false, cam: 0, seedBase: +(params.get('seed') || 1) };
let actors = [];
let source = null; // { scene, mixer, actions, glb }
const sources = {};

function makeActor(kind, seed, x) {
  const rd = new Ragdoll(world);
  const person = { id: seed, rd };
  const player = new AnimPlayer(rd, { seed });
  const visual = createZombieVisual(person, kind, scene);
  const root = { pos: { x, y: 0, z: 0 }, yaw: filmYaw() };
  const skel = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffe080, depthTest: false }));
  skel.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rd.jointList.length * 6), 3));
  skel.frustumCulled = false;
  skel.renderOrder = 10;
  scene.add(skel);
  return { rd, person, player, visual, root, x0: x, skel, kind, seed };
}

/** Film strips face +x (side views) or the camera (front / back views, cams 2 and 3). */
function filmYaw() {
  if (state.lineup) return state.cam % 5 === 1 ? Math.PI / 2 : 0;
  if (!state.film) return 0;
  return state.cam % 5 === 2 || state.cam % 5 === 3 ? 0 : Math.PI / 2;
}
function filmSpacing() {
  return state.clip === 'crawl' && filmYaw() !== 0 ? 2.0 : 1.15;
}

function clearActors() {
  for (const a of actors) {
    a.visual.dispose();
    scene.remove(a.skel);
  }
  actors = [];
}

function rebuild() {
  clearActors();
  const film = state.film;
  if (state.lineup) {
    // every kind side by side
    KINDS.forEach((k, i) => actors.push(makeActor(k, state.seedBase + i * 17, (i - (KINDS.length - 1) / 2) * 0.95)));
  } else {
    const count = film ? 6 : 1;
    for (let i = 0; i < count; i++) {
      const a = makeActor(state.kind, state.seedBase + i * 17, film ? (i - (count - 1) / 2) * filmSpacing() : 0);
      actors.push(a);
    }
  }
  setClip(state.clip);
}

function setClip(name) {
  state.clip = name;
  const info = CLIP_INFO[name];
  actors.forEach((a, i) => {
    a.root.pos.x = a.x0;
    a.root.pos.y = 0;
    a.root.pos.z = 0;
    a.root.yaw = filmYaw();
    const phase = state.film && !state.lineup ? i / actors.length : undefined;
    a.player.play(name, { fade: 0, phase, rate: 1, restart: true });
    a.player.first = true;
    a.player.update(0, a.root);
    a.visual.update(1);
    updateSkeleton(a);
  });
  window.__leg.visible = name === 'climb';
  clearPrints();
  loadSource(name);
}

function syncSource() {
  if (!source || !source.action || !actors[0]) return;
  source.action.time = actors[0].player.time;
  source.mixer.update(0);
  source.scene.position.set(-1.1, 0, state.moving ? actors[0].root.pos.z : 0);
}

async function loadSource(name) {
  if (source) source.scene.visible = false;
  const s = SOURCE[name];
  if (!s || !state.rig) return;
  try {
    if (!sources[s[0]]) {
      sources[s[0]] = new Promise((resolve, reject) => new GLTFLoader().load(GLB[s[0]], resolve, undefined, reject));
    }
    const gltf = await sources[s[0]];
    if (state.clip !== name) return;
    if (!gltf.__mixer) {
      gltf.__mixer = new THREE.AnimationMixer(gltf.scene);
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.material = new THREE.MeshLambertMaterial({ color: 0x8aa0b8, transparent: true, opacity: 0.85 });
          o.frustumCulled = false;
        }
      });
      scene.add(gltf.scene);
    }
    source = { scene: gltf.scene, mixer: gltf.__mixer };
    source.mixer.stopAllAction();
    const clip = gltf.animations.find((c) => c.name === s[1]);
    const act = source.mixer.clipAction(clip);
    act.play();
    source.action = act;
    source.scene.visible = !state.film;
    source.scene.position.set(-1.1, 0, 0);
  } catch (e) {
    console.warn('source rig unavailable', e.message || e);
  }
}

function updateSkeleton(a) {
  const arr = a.skel.geometry.attributes.position.array;
  let k = 0;
  for (const j of a.rd.jointList) {
    const p = j.parent.pos, c = j.child.pos;
    arr[k++] = p.x; arr[k++] = p.y; arr[k++] = p.z;
    arr[k++] = c.x; arr[k++] = c.y; arr[k++] = c.z;
  }
  a.skel.geometry.attributes.position.needsUpdate = true;
  a.skel.visible = state.skel;
}

function step(dt) {
  const info = CLIP_INFO[state.clip];
  for (const a of actors) {
    if (state.moving && info.speed > 0) {
      const v = info.speed * a.player.rate * a.player.var.rate;
      if (state.clip === 'climb') a.root.pos.y += v * dt;
      else {
        a.root.pos.x += Math.sin(a.root.yaw) * v * dt;
        a.root.pos.z += Math.cos(a.root.yaw) * v * dt;
      }
      if (Math.abs(a.root.pos.x - a.x0) + a.root.pos.z > 6 || a.root.pos.y > 5) {
        a.root.pos.x = a.x0;
        a.root.pos.z = 0;
        a.root.pos.y = 0;
        a.player.releaseFeet();
      }
    }
    a.player.update(dt, a.root);
    if (state.trail) {
      for (const f of a.player.feet) {
        const b = a.rd.segments['foot' + f.side].body;
        const p = soleLow(b, f.side);
        // locked: the ankle joint (one dot if the foot is planted); down but free: the lowest corner
        if (f.locked) {
          const J = a.player.joint, k = a.player.sk.legs[f.side].foot * 3;
          addPrint(J[k], 0.004, J[k + 2], f.side === 'L' ? 1 : 0.2, 1, f.side === 'L' ? 0.2 : 1);
        } else if (p.y < 0.02) addPrint(p.x, 0.003, p.z, 0.5, 0.25, 0.25);
      }
    }
    if (info.rootMotion && a.player.finished) {
      a.root.pos.x = a.x0; a.root.pos.y = 0; a.root.pos.z = 0;
      a.player.play(state.clip, { fade: 0, restart: true, phase: 0 });
    }
    if (!info.loop && !info.rootMotion && a.player.finished) a.player.play(state.clip, { fade: 0, restart: true, phase: 0 });
    a.visual.update(1);
    updateSkeleton(a);
  }
  syncSource();

}

const hud = document.getElementById('hud');
function updateHud() {
  const a = actors[0];
  const info = CLIP_INFO[state.clip];
  const ms = zombieMeshStats();
  hud.textContent = `clip ${state.clip}  (${CLIPS.indexOf(state.clip) + 1}/${CLIPS.length})   kind ${state.kind}   ${state.slow < 1 ? 'SLOW ' : ''}${state.paused ? 'PAUSED' : ''}\n` +
    `speed ${info.speed} m/s  duration ${info.duration.toFixed(2)} s  loop ${info.loop}  ${info.rootMotion ? 'root motion ' + JSON.stringify(info.rootMotion) : ''}\n` +
    (a ? `t ${a.player.time.toFixed(2)}  rate ${(a.player.rate * a.player.var.rate).toFixed(2)}  mirror ${a.player.layers[0].mirror}  feet ${a.player.feet.map((f) => (f.locked ? 'lock' : '-')).join(' ')}\n` : '') +
    (ms ? `body ${ms.tris} tris` : '');
}

function camView() {
  const a = actors[0];
  const tx = 0, tz = a ? a.root.pos.z : 0;
  const views = [
    [2.8, 1.6, 4.6], [4.5, 1.0, 0.01], [0.01, 1.4, 5.0], [-3.0, 2.2, -3.5], [0.01, 6, 0.3],
  ];
  const v = views[state.cam % views.length];
  const ty = state.clip === 'climb' && a ? a.root.pos.y + 0.9 : state.clip === 'crawl' ? 0.35 : 0.9;
  if (state.lineup) {
    const lv = [[0, 1.0, 6.4], [0, 0.9, 6.4], [0, 1.0, 6.4], [0, 1.1, -6.4], [0, 4, 5]][state.cam % 5];
    camera.position.set(lv[0], ty + lv[1] - 0.9 + 0.1, lv[2]);
    controls.target.set(0, ty * 0.95, 0);
    controls.update();
    return;
  }
  if (state.film) {
    // the row of phases, seen from the side (they face +x) or from behind/front
    const far = filmSpacing() > 1.5 ? 1.6 : 1;
    const fv = [[0, 1.1, 7.6 * far], [0, 0.45, 7.6 * far], [0, 1.0, 7.6], [0, 1.2, -7.6], [0, 5.5 * far, 6.0 * far]][state.cam % 5];
    camera.position.set(fv[0], ty + fv[1] - 0.9 + 0.2, fv[2]);
    controls.target.set(0, ty * 0.9, 0);
    controls.update();
    return;
  }
  camera.position.set(tx + v[0], ty + v[1] - 0.9, tz + v[2]);
  controls.target.set(tx, ty, tz);
  controls.update();
}

let last = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!state.paused && actors.length) step(dt * state.slow);
  if (state.follow !== false && actors.length && !state.userCam) camView();
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'ArrowRight' || k === 'ArrowLeft') {
    const i = (CLIPS.indexOf(state.clip) + (k === 'ArrowRight' ? 1 : -1) + CLIPS.length) % CLIPS.length;
    setClip(CLIPS[i]);
  } else if (k === 'ArrowUp' || k === 'ArrowDown') {
    state.kind = KINDS[(KINDS.indexOf(state.kind) + (k === 'ArrowUp' ? 1 : -1) + KINDS.length) % KINDS.length];
    rebuild();
  } else if (k >= '1' && k <= '9') {
    state.kind = KINDS[+k - 1];
    rebuild();
  } else if (k === 's' || k === 'S') state.slow = state.slow < 1 ? 1 : 0.2;
  else if (k === ' ') state.paused = !state.paused;
  else if (k === 'm' || k === 'M') state.moving = !state.moving;
  else if (k === 'f' || k === 'F') {
    state.film = !state.film;
    rebuild();
  } else if (k === 'g' || k === 'G') {
    state.rig = !state.rig;
    if (source) source.scene.visible = state.rig && !state.film;
    if (state.rig) loadSource(state.clip);
  } else if (k === 'c' || k === 'C') {
    state.cam++;
    state.userCam = false;
    if (state.film) rebuild();
  } else if (k === 'x' || k === 'X') state.skel = !state.skel;
  else if (k === 'k' || k === 'K') {
    state.lineup = !state.lineup;
    rebuild();
  }
  else if (k === 't' || k === 'T') {
    state.trail = !state.trail;
    clearPrints();
  }
  else if (k === 'n' || k === 'N') {
    state.seedBase += 101;
    rebuild();
  }
});
controls.addEventListener('start', () => (state.userCam = true));

// scripted control for screenshots (tools/preview/animshot.cjs)
window.__sim = {
  ready: false, THREE, scene, camera, renderer, state, CLIP_INFO, KINDS, CLIPS,
  get actors() {
    return actors;
  },
  /** Deterministic setup: clip, kind, film (6 phases side by side), time t (s), camera view index. */
  async set(o = {}) {
    const before = JSON.stringify([state.kind, state.film, state.lineup, filmYaw(), filmSpacing(), actors.length]);
    if (o.lineup !== undefined) state.lineup = o.lineup;
    if (o.kind) state.kind = o.kind;
    if (o.film !== undefined) state.film = o.film;
    if (o.cam !== undefined) {
      state.cam = o.cam;
      state.userCam = false;
    }
    if (o.rig !== undefined) state.rig = o.rig;
    if (o.moving !== undefined) state.moving = o.moving;
    if (o.trail !== undefined) state.trail = o.trail;
    if (o.clip) state.clip = o.clip;
    if (JSON.stringify([state.kind, state.film, state.lineup, filmYaw(), filmSpacing(), actors.length]) !== before || o.rebuild) rebuild();
    else setClip(state.clip);
    state.paused = true;
    if (o.t) {
      // run up to time t in small steps (foot locks settle like in play)
      const n = Math.ceil(o.t / (1 / 60));
      for (let i = 0; i < n; i++) step(o.t / n);
    }
    camView();
    if (state.rig && SOURCE[state.clip] && !state.film) {
      await loadSource(state.clip);
      syncSource();
    }
    if (o.camPos) {
      camera.position.set(...o.camPos);
      controls.target.set(...(o.camTarget || [0, 0.9, 0]));
      controls.update();
      state.userCam = true;
    }
    renderer.render(scene, camera);
    return { clip: state.clip, kind: state.kind, t: actors[0] && actors[0].player.time };
  },
  step(dt, n = 1) {
    for (let i = 0; i < n; i++) step(dt);
    renderer.render(scene, camera);
  },
  render() {
    renderer.render(scene, camera);
  },
};

prepareZombieMeshes().then(() => {
  rebuild();
  window.__sim.ready = true;
  frame();
});
