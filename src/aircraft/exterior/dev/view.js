// Development harness for the exterior module (not used by the game).
// view.html?mods=exterior[,environment,cabin,seats,player]&cam=x,y,z&at=x,y,z&sun=elevDeg,azDeg&frames=20
import * as THREE from 'three';
import { App } from '../../../core/app.js';

const MODS = {
  environment: () => import('../../../world/environment/index.js'),
  clouds: () => import('../../../world/clouds/index.js'),
  exterior: () => import('../index.js'),
  airport: () => import('../../../world/airport/index.js'),
  cabin: () => import('../../cabin/index.js'),
  seats: () => import('../../seats/index.js'),
  player: () => import('../../../player/index.js'),
};
const p = new URLSearchParams(location.search);
const num = (k, d) => (p.has(k) ? p.get(k).split(',').map(Number) : d);
const app = new App(document.getElementById('app'));
app.moduleErrors = {};
const mods = (p.get('mods') || 'exterior').split(',');
if (!mods.includes('environment')) {
  // simple gradient sky + env map
  const [el, az] = num('sun', [35, 140]);
  const e = el * Math.PI / 180, a = az * Math.PI / 180;
  app.sun.direction.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
  const low = el < 8;
  app.sun.color.set(low ? 0xffb070 : 0xfff1e0);
  app.sun.intensity = low ? 3.5 * Math.max(0, Math.min(1, (el + 2) / 8)) : 7;
  app.sun.skyColor.set(low ? 0x8a8fb0 : 0x9ab8e8);
  app.sun.groundColor.set(0x4a4640);
  app.sun.ambientIntensity = low ? Math.max(0.03, 0.6 * (el + 4) / 12) : 1.4;
  const sky = new THREE.Scene();
  const geo = new THREE.SphereGeometry(100, 32, 16);
  const col = [];
  const top = new THREE.Color(low ? 0x2a3560 : 0x2f62b8), hor = new THREE.Color(low ? 0xffa060 : 0xc8daf0), gnd = new THREE.Color(0x3a3833);
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const y = geo.attributes.position.getY(i) / 100;
    const c = y > 0 ? hor.clone().lerp(top, Math.pow(y, 0.6)) : hor.clone().lerp(gnd, Math.min(1, -y * 6));
    const k = el < -3 ? 0.02 : 1;
    col.push(c.r * 1.6 * k, c.g * 1.6 * k, c.b * 1.6 * k);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const skyMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  sky.add(skyMesh);
  app.scenes.outside.environment = app.pmrem.fromScene(sky, 0.02).texture;
  const bg = skyMesh.clone(); bg.material = bg.material.clone(); bg.material.depthWrite = false; bg.scale.setScalar(4000); bg.renderOrder = -1;
  app.skyRoot.add(bg);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x55534e, roughness: 0.9 }));
  ground.position.y = 0; ground.receiveShadow = true;
  app.worldRoot.add(ground);
  const st = app.flight.state;
  st.position.set(0, 2.62, 0);
  st.altitude = 2.62;
}
for (const name of mods) {
  try {
    const mod = await MODS[name]();
    const api = await mod.init(app);
    app[name] = api || {};
  } catch (e) { console.error('[dev] module failed', name, e); app.moduleErrors[name] = String(e && e.stack || e); }
}
await app.assets.ready(15000);
app.resize();
app.ready = true;
app.events.emit('app:ready', {});
const cam = num('cam', [-14, 3, -10]), at = num('at', [-8, -1, 3]);
app.addUpdate(() => {
  if (window.__noCam) return;
  app.camera.position.set(cam[0], cam[1], cam[2]);
  app.camera.lookAt(at[0], at[1], at[2]);
}, 55, 'dev:cam');
if (p.has('fov')) { app.camera.fov = Number(p.get('fov')); app.camera.updateProjectionMatrix(); }
if (!mods.includes('cabin')) app.pipeline.renderCabin = false;
app.start();
window.__app = app;
const startFrame = app.frame;
const waitFrames = Number(p.get('frames') || 6);
const check = () => { if (app.frame - startFrame >= waitFrames) window.__shotReady = true; else requestAnimationFrame(check); };
requestAnimationFrame(check);
