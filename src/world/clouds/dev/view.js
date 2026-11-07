// Development harness for the clouds module (not used by the game).
// view.html?mods=environment,clouds[,exterior,flight]&alt=3000&x=0&z=0&hdg=90&tod=12&cam=x,y,z&look=yaw,pitch&frames=20
//   cam = camera position in aircraft-local space, look = yaw (deg, 0 = forward, +left) / pitch (deg)
import * as THREE from 'three';
import { App } from '../../../core/app.js';

const MODS = {
  environment: () => import('../../environment/index.js'),
  city: () => import('../../city/index.js'),
  clouds: () => import('../index.js'),
  exterior: () => import('../../../aircraft/exterior/index.js'),
  airport: () => import('../../airport/index.js'),
  flight: () => import('../../../flight/director.js'),
};
const p = new URLSearchParams(location.search);
const num = (k, d) => (p.has(k) ? p.get(k).split(',').map(Number) : d);
const app = new App(document.getElementById('app'));
app.moduleErrors = {};
const mods = (p.get('mods') || 'environment,clouds').split(',');
const st = app.flight.state;
const [px, pz] = [num('x', [0])[0], num('z', [0])[0]];
const alt = num('alt', [3000])[0];
const hdg = num('hdg', [90])[0], pitchDeg = num('pitch', [0])[0];
function pose() {
  st.position.set(px, alt, pz);
  st.altitude = alt;
  st.heading = hdg;
  st.quaternion.setFromEuler(new THREE.Euler(pitchDeg * Math.PI / 180, -hdg * Math.PI / 180, 0, 'YXZ'));
  st.velocity.set(Math.sin(hdg * Math.PI / 180), 0, -Math.cos(hdg * Math.PI / 180)).multiplyScalar(num('speed', [0])[0]);
  st.onGround = alt < 5;
  if (p.has('tod')) st.timeOfDay = Number(p.get('tod'));
}
if (!mods.includes('flight')) pose();
for (const name of mods) {
  try {
    const t0 = performance.now();
    const mod = await MODS[name]();
    const api = await mod.init(app);
    app[name] = api || {};
    if (name === 'flight' && api) app.flight = api;
    console.log(`[dev] ${name} init ${(performance.now() - t0).toFixed(0)} ms`);
  } catch (e) { console.error('[dev] module failed', name, e); app.moduleErrors[name] = String(e && e.stack || e); }
}
await app.assets.ready(15000);
app.resize();
app.ready = true;
app.events.emit('app:ready', {});
const cam = num('cam', [1.2, 1.5, 0]), look = num('look', [-90, 0]);
if (!mods.includes('flight')) app.addUpdate(() => { if (!window.__noPose) pose(); }, 9, 'dev:pose');
app.addUpdate(() => {
  if (window.__noCam) return;
  app.camera.position.set(cam[0], cam[1], cam[2]);
  app.camera.rotation.set(look[1] * Math.PI / 180, look[0] * Math.PI / 180, 0, 'YXZ');
}, 55, 'dev:cam');
if (p.has('fov')) { app.camera.fov = Number(p.get('fov')); app.camera.updateProjectionMatrix(); }
app.pipeline.renderCabin = false;
app.start();
window.__app = app;
const startFrame = app.frame;
const waitFrames = Number(p.get('frames') || 6);
const check = () => { if (app.frame - startFrame >= waitFrames) window.__shotReady = true; else requestAnimationFrame(check); };
requestAnimationFrame(check);
