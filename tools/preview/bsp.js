// Dev viewer for an original de_dust2.bsp served by tools/serve-gamefiles.mjs (files are NOT in the repo).
// ?src=http://localhost:8899&pos=x,y,z&ang=p,y&lmScale=&lmGamma=  (view=top&bounds=x0,y0,x1,y1&zcut=z)
import * as THREE from 'three';
import { Renderer } from '../../src/engine/renderer.js';
import { loadBspWorld } from '../../src/bsp/bspworld.js';
import { bspUniforms } from '../../src/bsp/bspmaterial.js';
import { decodeTga } from '../../src/bsp/tga.js';
import { createSkybox } from '../../src/bsp/skybox.js';

const params = new URLSearchParams(location.search);
const src = params.get('src') || 'http://localhost:8899';
const app = document.getElementById('app');
const r = new Renderer(app);
if (params.get('aspect')) r.configure({ aspect: params.get('aspect') });
const get = async (n) => (await fetch(`${src}/${n}`)).arrayBuffer();
const [bsp, w1, w2, w3] = await Promise.all([get('de_dust2.bsp'), get('cs_dust.wad'), get('halflife.wad'), get('decals.wad')]);
const W = await loadBspWorld({ bsp, wads: [w1, w2, w3] });
for (const m of W.meshes) r.world.add(m);
if (params.get('lmScale')) bspUniforms.lmScale.value = +params.get('lmScale');
if (params.get('lmGamma')) bspUniforms.lmGamma.value = +params.get('lmGamma');
// sky
let skybox = null;
try {
  const names = ['rt', 'lf', 'bk', 'ft', 'up', 'dn'];
  const ims = await Promise.all(names.map(async (n) => decodeTga(await get(`Des${n}.tga`))));
  skybox = createSkybox(Object.fromEntries(names.map((n, i) => [n, ims[i]])));
  r.world.add(skybox);
  window.__skybox = skybox;
} catch (e) { console.warn('sky', e); }
let view = { eye: [-1300, -900, 200], pitch: 0, yaw: 90 };
const pos = params.get('pos'), ang = params.get('ang');
if (pos) { const p = pos.split(',').map(Number); view.eye = [p[0], p[1], p[2] + 53]; }
if (ang) { const a = ang.split(',').map(Number); view.pitch = a[0]; view.yaw = a[1]; }
window.__setView = (x, y, z, pitch, yaw, eyeH = 53) => { view = { eye: [x, y, z + eyeH], pitch, yaw }; };
window.__W = W;
window.__r = r;
let frames = 0;
let topCam = null;
if (params.get('view') === 'top') {
  const b = (params.get('bounds') || '-2476,-1266.6,2029.6,3239').split(',').map(Number);
  const w = b[2] - b[0], h = b[3] - b[1];
  // ?zcut=z hides everything above that height (roofs, ceilings)
  const zcut = params.get('zcut');
  topCam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, zcut ? 4000 - +zcut : 1, 20000);
  topCam.position.set((b[0] + b[2]) / 2, 4000, -(b[1] + b[3]) / 2);
  topCam.lookAt((b[0] + b[2]) / 2, 0, -(b[1] + b[3]) / 2);
  window.__topCam = topCam;
}
function loop() {
  if (params.has('noloop') && window.__ready) return; // automation drives rendering
  r.setView(view.eye, view.pitch, view.yaw, 0);
  skybox?.userData.follow(view.eye);
  if (topCam) { r.renderer.clear(); r.renderer.render(r.scene, topCam); } else r.render(false);
  if (!window.__ready && ++frames > 3) window.__ready = true;
  requestAnimationFrame(loop);
}
loop();
