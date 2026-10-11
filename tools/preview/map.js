// Map-only viewer for screenshots and walkthroughs: ?pos=x,y,z&ang=pitch,yaw (feet position)
// or ?view=top&bounds=x0,y0,x1,y1&zcut=z for a top-down plan
import * as THREE from 'three';
import { Renderer } from '../../src/engine/renderer.js';
import { Input } from '../../src/engine/input.js';
import { TextureLibrary } from '../../src/engine/assets.js';
import * as TexLib from '../../src/assets/textures.js';
import { createSky } from '../../src/assets/sky.js';
import { loadWorld } from '../../src/game/world.js';
import { PlayerMover, createPlayerMove, IN_JUMP, IN_DUCK, IN_WALK } from '../../src/engine/pmove.js';

const params = new URLSearchParams(location.search);
const app = document.getElementById('app');
const r = new Renderer(app);
if (params.get('aspect')) r.configure({ aspect: params.get('aspect') });
const input = new Input(r.canvas);
const texLib = new TextureLibrary(TexLib);
r.scene.background = createSky(r.renderer, { sunDir: [-0.59, -0.245, 0.766] });
const W = await loadWorld(texLib, () => {}, { forceBake: params.has('bake') });
for (const m of W.meshes) r.world.add(m);
const mover = new PlayerMover(W.collision);
const pm = createPlayerMove();
const pos = (params.get('pos') || '-1300,-900,128').split(',').map(Number);
const ang = (params.get('ang') || '0,90').split(',').map(Number);
pm.origin = [pos[0], pos[1], pos[2] + 37];
pm.angles = [ang[0], ang[1], 0];
let fixedEye = null;
window.__setView = (x, y, z, pitch, yaw, eyeH = 53) => { fixedEye = [x, y, z + eyeH]; pm.angles = [pitch, yaw, 0]; };
r.canvas.addEventListener('click', () => input.requestLock());
// ?view=top&bounds=x0,y0,x1,y1&zcut=z : orthographic top-down render
let topCam = null;
if (params.get('view') === 'top') {
  const b = (params.get('bounds') || '-2476,-1266.6,2029.6,3239').split(',').map(Number);
  const w = b[2] - b[0], h = b[3] - b[1];
  const zcut = params.get('zcut');
  topCam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, zcut ? 4000 - +zcut : 1, 20000);
  topCam.position.set((b[0] + b[2]) / 2, 4000, -(b[1] + b[3]) / 2);
  topCam.lookAt((b[0] + b[2]) / 2, 0, -(b[1] + b[3]) / 2);
}
let last = performance.now(), acc = 0, frames = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const [dx, dy] = input.consumeMouse();
  pm.angles[1] -= dx * 0.055; pm.angles[0] = Math.max(-89, Math.min(89, pm.angles[0] + dy * 0.055));
  acc += dt;
  while (acc >= 0.01) {
    acc -= 0.01;
    mover.move(pm, { forwardmove: (input.is('forward') ? 400 : 0) - (input.is('back') ? 400 : 0), sidemove: (input.is('moveright') ? 400 : 0) - (input.is('moveleft') ? 400 : 0), buttons: (input.is('jump') ? IN_JUMP : 0) | (input.is('duck') ? IN_DUCK : 0) | (input.is('speed') ? IN_WALK : 0) }, 0.01);
    pm.events.length = 0;
  }
  const eye = fixedEye || [pm.origin[0], pm.origin[1], pm.origin[2] + pm.viewOfs];
  r.setView(eye, pm.angles[0], pm.angles[1], 0);
  if (topCam) { r.renderer.clear(); r.renderer.render(r.scene, topCam); } else r.render(false);
  if (!window.__ready && ++frames > 3) window.__ready = true;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
