// Last Lookout world preview: the valley from the lookout's eye through the retro renderer.
// Keys: A/D or arrows turn, W/S look up/down, Z/X zoom (scope 1x..12x, scope boost while zoomed),
// T/G time of day, R rain, F floodlights, 1-4 gate damage, B break a gate, P place traps,
// Q quality, H hide this help, C crows (scare), L lean out of the window.
// URL params: ?yaw=90&pitch=-6&zoom=1&t=0.05&rain=0&q=medium&dpr=1&still
import * as THREE from 'three';
import { LAYOUT, lookoutEye } from '../../src/tower/level/layout.js';
import { RetroRenderer } from '../../src/tower/render/retro.js';
import { buildLevelScene } from '../../src/tower/render/levelScene.js';
import { WORLD } from '../../src/tower/render/worldMat.js';

const params = new URLSearchParams(location.search);
const app = document.getElementById('app');
const hud = document.getElementById('hud');
const retro = new RetroRenderer(app, { quality: params.get('q') ?? 'medium', dpr: params.has('dpr') ? +params.get('dpr') : undefined });
retro.setSize(innerWidth, innerHeight);
let lastBolt = 0;
const t0 = performance.now();
const level = buildLevelScene(LAYOUT, { onLightning: (delay) => (lastBolt = delay) });
const buildMs = performance.now() - t0;
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 1500);
camera.rotation.order = 'YXZ';
const eye = new THREE.Vector3().fromArray(LAYOUT.tower.eye);
camera.position.copy(eye);
let yaw = params.has('yaw') ? (+params.get('yaw') * Math.PI) / 180 : Math.PI / 2; // 0 = north, 90 = west
let pitch = params.has('pitch') ? (+params.get('pitch') * Math.PI) / 180 : -0.12;
let zoom = params.has('zoom') ? +params.get('zoom') : 1;
let tod = params.has('t') ? +params.get('t') : 0.05;
let rainA = params.has('rain') ? +params.get('rain') : 0;
let lean = 0;
const eyeArr = [0, 0, 0];
const floods = [];
level.setTimeOfDay(tod);
level.setRain(rainA);
const keys = new Set();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyT') level.setTimeOfDay((tod = Math.min(1, tod + 0.1)));
  if (e.code === 'KeyG') level.setTimeOfDay((tod = Math.max(0, tod - 0.1)));
  if (e.code === 'KeyR') level.setRain((rainA = rainA > 0 ? 0 : 1));
  if (e.code === 'KeyF') toggleFloods();
  if (e.code.startsWith('Digit')) {
    const n = +e.code.slice(5);
    if (n >= 1 && n <= 4) for (const g of LAYOUT.compound.gates) level.gateMesh(g.id).setDamage(n / 4 - 0.01);
  }
  if (e.code === 'KeyB') level.gateMesh('south').break();
  if (e.code === 'KeyP') placeTraps();
  if (e.code === 'KeyQ') retro.setQuality(retro.quality === 'low' ? 'medium' : retro.quality === 'medium' ? 'high' : 'low');
  if (e.code === 'KeyH') hud.classList.toggle('hidden');
  if (e.code === 'KeyC') level.scare(camera.position);
  if (e.code === 'KeyL') lean = lean ? 0 : 1;
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('resize', () => {
  retro.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
function toggleFloods() {
  if (floods.length) {
    for (const id of floods) level.removeFloodlight(id);
    floods.length = 0;
  } else {
    for (const m of LAYOUT.floodlightMounts) {
      floods.push(m.id);
      level.addFloodlight(m.id);
    }
  }
}
const placed = [];
function placeTraps() {
  if (placed.length) {
    for (const o of placed) level.removeTrapMesh(o);
    placed.length = 0;
    return;
  }
  placed.push(level.placeTrapMesh('wire', [3, 0, -26], 0.1));
  placed.push(level.placeTrapMesh('wire', [-26, 0, 3], Math.PI / 2));
  placed.push(level.placeTrapMesh('mine', [2, 0, 36], 0));
  placed.push(level.placeTrapMesh('mine', [-30, 0, -2], 0));
  for (const [x, z] of LAYOUT.barrelSpots) placed.push(level.placeTrapMesh('barrel', [x, 0, z], 0));
  const s = LAYOUT.sentryMount;
  placed.push(level.placeTrapMesh('sentry', s.pos, 2.4));
}
function applyCamera() {
  camera.fov = 70 / zoom;
  camera.updateProjectionMatrix();
  camera.rotation.set(pitch, yaw, 0);
  // stand at the window looked through (lean: further out over the sill)
  lookoutEye(yaw, lean ? Math.min(pitch, -1.2) : pitch, eyeArr);
  camera.position.fromArray(eyeArr);
  retro.setScopeBoost(zoom >= 3.5 ? 2 : 1);
}
let last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 0;
let running = !params.has('still');
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const rs = (keys.has('ShiftLeft') ? 0.3 : 1.2) / zoom;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) yaw += rs * dt;
  if (keys.has('KeyD') || keys.has('ArrowRight')) yaw -= rs * dt;
  if (keys.has('KeyW') || keys.has('ArrowUp')) pitch = Math.min(1.2, pitch + rs * dt);
  if (keys.has('KeyS') || keys.has('ArrowDown')) pitch = Math.max(-1.45, pitch - rs * dt);
  if (keys.has('KeyZ')) zoom = Math.min(12, zoom * (1 + dt * 1.5));
  if (keys.has('KeyX')) zoom = Math.max(1, zoom / (1 + dt * 1.5));
  applyCamera();
  level.update(dt, camera);
  retro.render(level.scene, camera);
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 0.5) {
    fps = fpsN / fpsAcc;
    fpsAcc = 0;
    fpsN = 0;
    const info = retro.renderer.info.render;
    hud.textContent = `LAST LOOKOUT world preview   ${fps.toFixed(0)} fps   build ${buildMs.toFixed(0)} ms
internal ${retro.internal.width}x${retro.internal.height} (x${retro.internal.scale})  draws ${info.calls}  tris ${info.triangles}
yaw ${((yaw * 180) / Math.PI).toFixed(0)}  pitch ${((pitch * 180) / Math.PI).toFixed(0)}  zoom ${zoom.toFixed(1)}x  time ${tod.toFixed(2)}  rain ${rainA}  thunder ${lastBolt.toFixed(1)} s
A/D W/S turn  Z/X zoom  T/G time  R rain  F floods  1-4 gate dmg  B break  P traps  C crows  L lean  Q quality  H hide`;
  }
  if (running) requestAnimationFrame(frame);
}
applyCamera();
level.update(0.016, camera);
window.__tower = {
  THREE, retro, level, camera, LAYOUT, buildMs,
  ready: true,
  /** Deterministic view for screenshots: yaw/pitch in degrees (yaw 0 = north, 90 = west), zoom. */
  view(yawDeg, pitchDeg, z = 1, leanOut = 0) {
    yaw = (yawDeg * Math.PI) / 180;
    pitch = (pitchDeg * Math.PI) / 180;
    zoom = z;
    lean = leanOut;
    applyCamera();
  },
  tod(t) {
    level.setTimeOfDay((tod = t));
  },
  rain(a) {
    level.setRain((rainA = a));
  },
  floods: toggleFloods,
  traps: placeTraps,
  step(seconds = 0.5, n = 10) {
    for (let i = 0; i < n; i++) level.update(seconds / n, camera);
  },
  render() {
    applyCamera();
    level.update(0, camera);
    retro.render(level.scene, camera);
    const i = retro.renderer.info.render;
    return { calls: i.calls, triangles: i.triangles, internal: [retro.internal.width, retro.internal.height] };
  },
  stop() {
    running = false;
  },
  /** Top-down orthographic view of the valley (debug), half-size `size` m round (cx, cz). */
  mapView(size = 260, cx = 0, cz = 0) {
    const cam = new THREE.OrthographicCamera(-size * camera.aspect, size * camera.aspect, size, -size, 1, 2000);
    cam.position.set(cx, 600, cz);
    cam.up.set(0, 0, -1);
    cam.lookAt(cx, 0, cz);
    cam.updateMatrixWorld();
    level.update(0, cam);
    const saved = WORLD.uFogParams.value.clone();
    WORLD.uFogParams.value.set(1e6, 0, 0, 6);
    retro.render(level.scene, cam);
    WORLD.uFogParams.value.copy(saved);
  },
  /** The painted macro map as a data URL (debug). */
  macroURL() {
    const g = level.scene.getObjectByName('ground');
    return g.userData.uniforms.tMacro.value.image.toDataURL();
  },
  stats: () => level.stats(),
};
requestAnimationFrame(frame);
