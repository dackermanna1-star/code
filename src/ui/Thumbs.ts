// Renders small icons of 3D foods / bottles with the game renderer (offscreen, queued).

import * as THREE from 'three';
import { FoodVisual } from '../food/visual';
import { makeFood, type FoodState } from '../food/types';
import { getModel } from '../models/registry';

interface Job {
  key: string;
  build: () => { obj: THREE.Object3D; dispose: () => void; rot?: [number, number, number] };
  resolve: (url: string) => void;
}

export class Thumbs {
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(28, 1, 0.01, 10);
  private rt: THREE.WebGLRenderTarget;
  private cache = new Map<string, Promise<string>>();
  private queue: Job[] = [];
  private size: number;
  private canvas = document.createElement('canvas');
  private busy = false;

  constructor(private renderer: THREE.WebGLRenderer, size = 160) {
    this.size = size;
    this.rt = new THREE.WebGLRenderTarget(size, size, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    this.canvas.width = this.canvas.height = size;
    const hemi = new THREE.HemisphereLight(0xffffff, 0xdcc7b0, 1.6);
    const key = new THREE.DirectionalLight(0xfff2e0, 2.4);
    key.position.set(-1.5, 3, 2.5);
    const rim = new THREE.DirectionalLight(0xdfe8ff, 1.0);
    rim.position.set(2, 1.5, -2);
    this.scene.add(hemi, key, rim);
  }

  /** Thumbnail for an ingredient id (whole). */
  food(id: string): Promise<string> {
    return this.foodState(makeFood(id), 'food:' + id);
  }

  foodState(state: FoodState, key = 'state:' + JSON.stringify(state)): Promise<string> {
    return this.enqueue(key, () => {
      const v = new FoodVisual(state);
      const rot = state.id !== 'assembly' ? getModel(state.id).iconRotation : undefined;
      return { obj: v.root, dispose: () => v.dispose(), rot };
    });
  }

  object(key: string, build: () => THREE.Object3D): Promise<string> {
    return this.enqueue(key, () => ({ obj: build(), dispose: () => {} }));
  }

  private enqueue(key: string, build: Job['build']): Promise<string> {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const p = new Promise<string>((resolve) => this.queue.push({ key, build, resolve }));
    this.cache.set(key, p);
    return p;
  }

  /** Render a few queued thumbnails (call once per frame). */
  pump(maxMs = 6) {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < maxMs) {
      const job = this.queue.shift()!;
      try {
        job.resolve(this.render(job));
      } catch (e) {
        console.warn('thumb failed', job.key, e);
        job.resolve('');
      }
    }
    this.busy = false;
  }

  private render(job: Job): string {
    const { obj, dispose, rot } = job.build();
    const holder = new THREE.Group();
    holder.add(obj);
    holder.rotation.set(rot?.[0] ?? 0, (rot?.[1] ?? 0) - 0.5, rot?.[2] ?? 0);
    this.scene.add(holder);
    holder.updateMatrixWorld(true);
    obj.traverse((o) => {
      const fv = o.userData.foodVisual as FoodVisual | undefined;
      fv?.update();
    });
    const box = new THREE.Box3().setFromObject(holder);
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const radius = Math.max(s.x, s.y, s.z) * 0.62 + 0.001;
    const dist = radius / Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2));
    const dir = new THREE.Vector3(0, 0.55, 1).normalize();
    this.cam.position.copy(c).addScaledVector(dir, dist);
    this.cam.near = dist * 0.05;
    this.cam.far = dist * 4;
    this.cam.lookAt(c);
    this.cam.updateProjectionMatrix();
    const prevTarget = this.renderer.getRenderTarget();
    const prevClear = this.renderer.getClearColor(new THREE.Color());
    const prevAlpha = this.renderer.getClearAlpha();
    const prevShadow = this.renderer.shadowMap.enabled;
    this.renderer.shadowMap.enabled = false;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.cam);
    const px = new Uint8Array(this.size * this.size * 4);
    this.renderer.readRenderTargetPixels(this.rt, 0, 0, this.size, this.size, px);
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.setClearColor(prevClear, prevAlpha);
    this.renderer.shadowMap.enabled = prevShadow;
    this.scene.remove(holder);
    dispose();
    // flip Y into the canvas
    const ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(this.size, this.size);
    const row = this.size * 4;
    for (let y = 0; y < this.size; y++) img.data.set(px.subarray((this.size - 1 - y) * row, (this.size - y) * row), y * row);
    ctx.putImageData(img, 0, 0);
    return this.canvas.toDataURL('image/png');
  }
}
