import * as THREE from 'three';
import type { FoodKit } from '../food/FoodKit';
import { BUNS, DONENESS, Doneness, INGREDIENTS, IngredientId, PATTIES, SauceId } from '../food/Ingredients';
import { CharacterModel } from '../characters/CharacterModel';
import type { CustomerDef } from '../characters/Roster';
import { canvasTexture, FONT_DISPLAY } from '../render/CanvasTex';

/**
 * Renders 3D models into small transparent images for the UI, so tickets,
 * speech bubbles and menus show the exact same food players cook.
 */
export class IconRenderer {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  private rt: THREE.WebGLRenderTarget;
  private size = 192;
  readonly icons = new Map<string, string>();

  constructor(private renderer: THREE.WebGLRenderer, env: THREE.Texture | null) {
    this.rt = new THREE.WebGLRenderTarget(this.size, this.size, { type: THREE.FloatType, depthBuffer: true });
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.9;
    const key = new THREE.DirectionalLight(0xfff2e0, 3.2);
    key.position.set(1.2, 2.2, 1.6);
    const fill = new THREE.DirectionalLight(0xc8dcff, 1.0);
    fill.position.set(-2, 1, 0.5);
    const rim = new THREE.DirectionalLight(0xffffff, 2.0);
    rim.position.set(-0.5, 1.5, -2.2);
    this.scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.35));
  }

  /** Render an object framed to its bounds. Returns a PNG data URL. */
  render(obj: THREE.Object3D, opts: { pitch?: number; yaw?: number; pad?: number } = {}): string {
    const pitch = opts.pitch ?? 0.55;
    const yaw = opts.yaw ?? 0.5;
    this.scene.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = (sphere.radius * (opts.pad ?? 1.08)) / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
    this.camera.near = dist * 0.1;
    this.camera.far = dist * 4;
    this.camera.lookAt(sphere.center);
    this.camera.updateProjectionMatrix();
    const prev = this.renderer.getRenderTarget();
    const prevClear = this.renderer.getClearColor(new THREE.Color());
    const prevAlpha = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    const px = new Float32Array(this.size * this.size * 4);
    this.renderer.readRenderTargetPixels(this.rt, 0, 0, this.size, this.size, px);
    this.renderer.setRenderTarget(prev);
    this.renderer.setClearColor(prevClear, prevAlpha);
    this.scene.remove(obj);
    return this.toDataURL(px);
  }

  private toDataURL(px: Float32Array): string {
    const S = this.size;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    const aces = (x: number) => {
      x *= 1.05;
      const v = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
      return Math.max(0, Math.min(1, v));
    };
    const srgb = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const si = ((S - 1 - y) * S + x) * 4;
        const di = (y * S + x) * 4;
        const a = Math.max(0, Math.min(1, px[si + 3]));
        // unpremultiply not needed (three writes straight alpha with NormalBlending on cleared target)
        img.data[di] = srgb(aces(px[si])) * 255;
        img.data[di + 1] = srgb(aces(px[si + 1])) * 255;
        img.data[di + 2] = srgb(aces(px[si + 2])) * 255;
        img.data[di + 3] = a * 255;
      }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }

  /** Build all food icons (+ doneness variants for patties). */
  buildFood(food: FoodKit) {
    for (const id of Object.keys(INGREDIENTS) as IngredientId[]) {
      const cat = INGREDIENTS[id].category;
      let obj: THREE.Object3D;
      let pitch = 0.6;
      if (cat === 'bun') {
        const g = new THREE.Group();
        const top = food.bunPart(id as (typeof BUNS)[number], 'top');
        top.obj.position.y = 0.022;
        g.add(top.obj);
        obj = g;
        pitch = 0.45;
        this.icons.set(id + ':top', this.render(top.obj.clone(), { pitch: 0.4 }));
        const heel = food.bunPart(id as (typeof BUNS)[number], 'bottom');
        this.icons.set(id + ':bottom', this.render(heel.obj, { pitch: 0.55 }));
      } else if (cat === 'patty') {
        const p = food.patty(id as (typeof PATTIES)[number]);
        p.setCook!(0.62, 0.62);
        obj = p.obj;
        for (const d of Object.keys(DONENESS) as Doneness[]) {
          const q = food.patty(id as (typeof PATTIES)[number]);
          const t = DONENESS[d].target;
          q.setCook!(t, t);
          q.setSizzle?.(0.6);
          this.icons.set(`${id}:${d}`, this.render(q.obj, { pitch: 0.75 }));
          q.dispose();
        }
        const raw = food.patty(id as (typeof PATTIES)[number]);
        this.icons.set(`${id}:raw`, this.render(raw.obj, { pitch: 0.75 }));
      } else if (cat === 'sauce') {
        obj = this.sauceIcon(food, id as SauceId);
        pitch = 0.35;
      } else {
        const p = food.make(id);
        p.setMelt?.(0.35, 0.05);
        obj = p.obj;
        pitch = 0.8;
      }
      this.icons.set(id, this.render(obj, { pitch }));
    }
  }

  private sauceIcon(food: FoodKit, id: SauceId): THREE.Object3D {
    const g = new THREE.Group();
    const col = new THREE.Color(INGREDIENTS[id].color);
    const body = new THREE.Mesh(
      new THREE.LatheGeometry(
        [[0, 0], [0.034, 0], [0.037, 0.01], [0.037, 0.13], [0.03, 0.155], [0.014, 0.165], [0.0, 0.166]].map(([x, y]) => new THREE.Vector2(x, y)),
        24,
      ),
      new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.25, clearcoat: 0.8 }),
    );
    g.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0xf6f1e4, roughness: 0.4 }));
    cap.position.y = 0.175;
    g.add(cap);
    const noz = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.05, 12), cap.material);
    noz.position.y = 0.214;
    g.add(noz);
    const label = canvasTexture(128, 64, (c, w, h) => {
      c.fillStyle = '#fffaf0';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#2a211c';
      c.font = `700 26px ${FONT_DISPLAY}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(INGREDIENTS[id].name.split(' ')[0].toUpperCase(), w / 2, h / 2 + 2, w - 8);
    });
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0375, 0.0375, 0.05, 24, 1, true), new THREE.MeshStandardMaterial({ map: label }));
    lab.position.y = 0.07;
    lab.rotation.y = -0.5;
    g.add(lab);
    // a little drizzle blob below
    const s = food.sauce(id, 'spiral');
    s.obj.scale.setScalar(0.7);
    s.obj.position.set(0.05, 0, 0.04);
    g.add(s.obj);
    g.rotation.z = -0.25;
    return g;
  }

  /** Portrait of a customer (head & shoulders). */
  portrait(def: CustomerDef): string {
    const key = 'portrait:' + def.id;
    const hit = this.icons.get(key);
    if (hit) return hit;
    const m = new CharacterModel(def.app);
    m.face.setExpression('happy');
    for (let i = 0; i < 30; i++) m.face.update(0.05);
    const root = m.rig.root;
    root.updateMatrixWorld(true);
    const head = new THREE.Vector3();
    m.rig.head.getWorldPosition(head);
    this.scene.add(root);
    const dist = 0.95;
    this.camera.position.set(head.x + 0.25, head.y + 0.05, head.z + dist);
    this.camera.near = 0.05;
    this.camera.far = 5;
    this.camera.lookAt(head.x, head.y - 0.1, head.z);
    this.camera.updateProjectionMatrix();
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    const px = new Float32Array(this.size * this.size * 4);
    this.renderer.readRenderTargetPixels(this.rt, 0, 0, this.size, this.size, px);
    this.renderer.setRenderTarget(prev);
    this.scene.remove(root);
    m.dispose();
    const url = this.toDataURL(px);
    this.icons.set(key, url);
    return url;
  }

  get(key: string): string {
    return this.icons.get(key) ?? '';
  }

  dispose() {
    this.rt.dispose();
  }
}
