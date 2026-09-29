import * as THREE from 'three';
import { G } from '../core/G';
import { buildWeaponModel, buildGrenade, buildMedkit } from '../weapons/models';
import { ModelBuilder } from '../weapons/ModelBuilder';
import { DEFENSE_MAP } from '../defenses/defs';

/**
 * Renders small thumbnails of weapon/defense models for the HUD and shop.
 * Results are cached as data URLs.
 */
export class Icons {
  /** linear byte -> tone-mapped sRGB byte */
  static lut = (() => {
    const t = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      let c = (i / 255) * 1.35;
      c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
      c = Math.min(1, Math.max(0, c));
      c = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
      t[i] = Math.round(c * 255);
    }
    return t;
  })();
  private cache = new Map<string, string>();
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 2, 0.01, 100);
  private rt: THREE.WebGLRenderTarget;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private buf: Uint8Array;
  readonly W = 192;
  readonly H = 96;
  private queue: string[] = [];
  onReady: ((key: string) => void) | null = null;

  constructor() {
    this.rt = new THREE.WebGLRenderTarget(this.W, this.H, { depthBuffer: true });
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d')!;
    this.buf = new Uint8Array(this.W * this.H * 4);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2, 3, 4);
    const rim = new THREE.DirectionalLight(0xffd0a0, 1.2);
    rim.position.set(-3, 1, -2);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xdde6ff, 0x302418, 1.3));
  }

  /** Returns a cached data URL or '' (and queues rendering). */
  get(key: string): string {
    const c = this.cache.get(key);
    if (c) return c;
    if (!this.queue.includes(key)) this.queue.push(key);
    return '';
  }

  /** Render a few queued icons per frame. */
  pump(max = 3) {
    for (let i = 0; i < max && this.queue.length > 0; i++) {
      const key = this.queue.shift()!;
      if (this.cache.has(key)) continue;
      try {
        this.cache.set(key, this.render(key));
        this.onReady?.(key);
      } catch (e) {
        console.warn('icon failed', key, e);
        this.cache.set(key, '');
      }
    }
  }

  private build(key: string): { obj: THREE.Object3D; view: 'side' | 'front' } {
    const [kind, id, extra] = key.split(':');
    if (kind === 'w') {
      const m = buildWeaponModel(id, extra ? extra.split(',') : []);
      return { obj: m.mb.root, view: 'side' };
    }
    if (kind === 'g') return { obj: buildGrenade().root, view: 'side' };
    if (kind === 'm') return { obj: buildMedkit().root, view: 'front' };
    const def = DEFENSE_MAP[id];
    const mb = new ModelBuilder();
    def.build(mb);
    if (def.kind === 'turret' && extra) {
      const wm = buildWeaponModel(extra, []);
      wm.mb.root.position.set(0, 0.05, 0.05);
      mb.anchors.mount?.add(wm.mb.root);
    }
    return { obj: mb.root, view: 'front' };
  }

  private render(key: string) {
    const { obj, view } = this.build(key);
    const holder = new THREE.Group();
    holder.add(obj);
    if (view === 'side') {
      obj.rotation.set(0, -Math.PI / 2, 0); // muzzle points right
      holder.rotation.set(0.12, 0.35, 0);
    } else {
      holder.rotation.set(0.35, 0.6, 0);
    }
    this.scene.add(holder);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const fitH = Math.max(size.y, size.x / this.cam.aspect, size.z / this.cam.aspect) * 1.18;
    const dist = fitH / 2 / Math.tan((this.cam.fov * Math.PI) / 360) + size.z * 0.5;
    this.cam.position.set(center.x, center.y, center.z + dist);
    this.cam.lookAt(center);
    const r = G.renderer.renderer;
    const prev = r.getRenderTarget();
    const prevTone = r.toneMapping;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.render(this.scene, this.cam);
    r.readRenderTargetPixels(this.rt, 0, 0, this.W, this.H, this.buf);
    r.toneMapping = prevTone;
    r.setRenderTarget(prev);
    this.scene.remove(holder);
    const img = this.ctx.createImageData(this.W, this.H);
    // render targets hold linear values: tone map + sRGB encode on the CPU
    const lut = Icons.lut;
    for (let y = 0; y < this.H; y++) {
      const src = (this.H - 1 - y) * this.W * 4;
      const dst = y * this.W * 4;
      for (let x = 0; x < this.W * 4; x += 4) {
        img.data[dst + x] = lut[this.buf[src + x]];
        img.data[dst + x + 1] = lut[this.buf[src + x + 1]];
        img.data[dst + x + 2] = lut[this.buf[src + x + 2]];
        img.data[dst + x + 3] = this.buf[src + x + 3];
      }
    }
    // 1px dark outline for readability
    const d = img.data;
    const out = new Uint8ClampedArray(d);
    for (let y = 1; y < this.H - 1; y++)
      for (let x = 1; x < this.W - 1; x++) {
        const i = (y * this.W + x) * 4;
        if (d[i + 3] > 10) continue;
        const n = d[i + 7] > 10 || d[i - 1] > 10 || d[i + this.W * 4 + 3] > 10 || d[i - this.W * 4 + 3] > 10;
        if (n) {
          out[i] = 0;
          out[i + 1] = 0;
          out[i + 2] = 0;
          out[i + 3] = 220;
        }
      }
    img.data.set(out);
    this.ctx.clearRect(0, 0, this.W, this.H);
    this.ctx.putImageData(img, 0, 0);
    return this.canvas.toDataURL('image/png');
  }
}
