// HUD weapon icons: each weapon rendered in pure side view (barrel left) into
// an offscreen target, lit like the original grey-steel HUD renders, and
// returned as transparent PNG data URLs.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MATERIALS } from './kit';
import { createWeaponModel } from './weapons';
import { WEAPON_ORDER, type WeaponId } from '../../config/weapons';

const SHARED = new Set<THREE.Material>(Object.values(MATERIALS));
const EXPOSURE = 0.8;

// three.js ACESFilmic tone mapping (same curve the game renderer uses), then sRGB.
function aces(r: number, g: number, b: number, exposure: number, out: number[]): void {
  r *= exposure / 0.6;
  g *= exposure / 0.6;
  b *= exposure / 0.6;
  const x = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const y = 0.076 * r + 0.90834 * g + 0.01566 * b;
  const z = 0.0284 * r + 0.13383 * g + 0.83777 * b;
  const f = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  out[0] = 1.60475 * fx - 0.53108 * fy - 0.07367 * fz;
  out[1] = -0.10208 * fx + 1.10813 * fy - 0.00605 * fz;
  out[2] = -0.00327 * fx - 0.07276 * fy + 1.07602 * fz;
}
const toSRGB = (v: number) => {
  v = v <= 0 ? 0 : v >= 1 ? 1 : v;
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
};

/**
 * Render all weapon icons. Returns PNG data URLs with a transparent background,
 * w x h pixels, the weapon framed to fill the icon. Renderer state (render
 * target, clear colour/alpha, autoClear, scissor/viewport) is restored.
 */
export function renderWeaponIcons(renderer: THREE.WebGLRenderer, w = 160, h = 80): Record<WeaponId, string> {
  const SS = 2;
  const W = w * SS;
  const H = h * SS;

  // ---- save renderer state
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevAutoClear = renderer.autoClear;
  const prevScissorTest = renderer.getScissorTest();
  const prevXR = renderer.xr.enabled;
  renderer.xr.enabled = false;

  // ---- temporary scene
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.3;
  scene.add(new THREE.HemisphereLight(0xf2f5fa, 0x3a4250, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(-1.5, 5, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.6);
  rim.position.set(3, 2, -4);
  scene.add(rim);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);

  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4, type: THREE.UnsignedByteType });
  const pixels = new Uint8Array(W * H * 4);
  const big = document.createElement('canvas');
  big.width = W;
  big.height = H;
  const bctx = big.getContext('2d')!;
  const img = bctx.createImageData(W, H);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  const col = [0, 0, 0];
  const result = {} as Record<WeaponId, string>;
  const margin = 0.05;

  renderer.setScissorTest(false);
  for (const id of WEAPON_ORDER) {
    const model = createWeaponModel(id);
    const holder = new THREE.Group();
    holder.add(model.group);
    if (model.group2) {
      // second MAC-10 behind and slightly up/right, like the original icon
      model.group2.position.set(0.09, 0.07, -0.12);
      holder.add(model.group2);
    }
    model.animate({ fireT: 99, reloadT: -1, heat: 0, spin: 0, cock: 0, dt: 0 });
    scene.add(holder);
    holder.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(holder);
    const c = bb.getCenter(new THREE.Vector3());
    const size = bb.getSize(new THREE.Vector3());
    const upp = Math.max(size.x / (w * (1 - 2 * margin)), size.y / (h * (1 - 2 * margin)));
    cam.left = (-w / 2) * upp;
    cam.right = (w / 2) * upp;
    cam.top = (h / 2) * upp;
    cam.bottom = (-h / 2) * upp;
    cam.position.set(c.x, c.y, c.z + 10);
    cam.lookAt(c.x, c.y, c.z);
    cam.updateProjectionMatrix();

    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, pixels);

    const d = img.data;
    for (let y = 0; y < H; y++) {
      const src = (H - 1 - y) * W * 4;
      const dst = y * W * 4;
      for (let x = 0; x < W * 4; x += 4) {
        const a = pixels[src + x + 3] / 255;
        if (a <= 0) {
          d[dst + x] = d[dst + x + 1] = d[dst + x + 2] = d[dst + x + 3] = 0;
          continue;
        }
        // stored values are linear and premultiplied by coverage
        aces(pixels[src + x] / 255 / a, pixels[src + x + 1] / 255 / a, pixels[src + x + 2] / 255 / a, EXPOSURE, col);
        d[dst + x] = Math.round(toSRGB(col[0]) * 255);
        d[dst + x + 1] = Math.round(toSRGB(col[1]) * 255);
        d[dst + x + 2] = Math.round(toSRGB(col[2]) * 255);
        d[dst + x + 3] = Math.round(a * 255);
      }
    }
    bctx.putImageData(img, 0, 0);
    octx.clearRect(0, 0, w, h);
    // thin dark halo like the original sprite outlines
    octx.shadowColor = 'rgba(18, 22, 30, 0.75)';
    octx.shadowBlur = Math.max(1, w / 120);
    octx.drawImage(big, 0, 0, w, h);
    octx.shadowColor = 'transparent';
    result[id] = out.toDataURL('image/png');

    scene.remove(holder);
    holder.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) if (!SHARED.has(mat)) mat.dispose();
    });
  }

  // ---- restore
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.autoClear = prevAutoClear;
  renderer.setScissorTest(prevScissorTest);
  renderer.xr.enabled = prevXR;
  rt.dispose();
  env.dispose();
  pmrem.dispose();
  room.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) mat.dispose();
    }
  });
  return result;
}
