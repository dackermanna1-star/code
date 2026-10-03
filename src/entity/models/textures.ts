/**
 * Mob texture cache: atlases are painted once per model key, off the main thread when Web
 * Workers are available (no frame hitches when a new mob type appears), synchronously
 * otherwise. Handles hand out THREE textures immediately (1x1 placeholders in the model's
 * base colour) and swap in the painted atlas when it is ready.
 */
import * as THREE from 'three';
import type { ModelDef } from './def';
import { paintAtlas, type TexData } from './paint/atlas';
import { atlasTexture } from './material';

export interface TexHandle {
  key: string;
  albedo: THREE.Texture;
  pbr: THREE.Texture;
  extra: THREE.Texture;
  ready: boolean;
  hasExtra: boolean;
  /** Called when the painted textures are installed. */
  listeners: ((h: TexHandle) => void)[];
}

const cache = new Map<string, TexHandle>();
let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, { handle: TexHandle; def: ModelDef; model: string; variant: string }>();

/** Force synchronous painting (tests, debug). */
export const texConfig = { sync: false };

function px(r: number, g: number, b: number, a: number): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.needsUpdate = true;
  return t;
}

function getWorker(): Worker | null {
  if (worker || workerFailed || texConfig.sync) return worker;
  if (typeof Worker === 'undefined') { workerFailed = true; return null; }
  try {
    worker = new Worker(new URL('./texWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const d = e.data as TexData & { id: number; error?: string };
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      if (d.error) {
        console.warn('[mobs] texture worker failed, painting on main thread', d.error);
        install(p.handle, paintAtlas(p.def));
        return;
      }
      install(p.handle, d);
    };
    worker.onerror = (e) => {
      console.warn('[mobs] texture worker error, falling back to main thread', e.message);
      workerFailed = true;
      worker = null;
      for (const [id, p] of pending) {
        pending.delete(id);
        install(p.handle, paintAtlas(p.def));
      }
    };
  } catch (e) {
    workerFailed = true;
    worker = null;
  }
  return worker;
}

function install(h: TexHandle, d: TexData) {
  h.albedo = atlasTexture(d.albedo, d.W, d.H);
  h.pbr = atlasTexture(d.pbr, d.W, d.H);
  if (d.extra) {
    h.extra = atlasTexture(d.extra, d.W, d.H);
    h.hasExtra = true;
  }
  h.ready = true;
  for (const l of h.listeners) l(h);
  h.listeners.length = 0;
}

/**
 * Textures for a model definition. `model`/`variant` identify the definition so the worker
 * can rebuild it (definitions are deterministic).
 */
export function getTextures(def: ModelDef, model: string, variant: string, baseColor = 0x808080): TexHandle {
  let h = cache.get(def.key);
  if (h) return h;
  const c = new THREE.Color(baseColor);
  h = {
    key: def.key,
    albedo: px(Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 0),
    pbr: px(128, 128, 150, 255),
    extra: px(0, 0, 0, 255),
    ready: false,
    hasExtra: false,
    listeners: [],
  };
  cache.set(def.key, h);
  const w = getWorker();
  if (w) {
    const id = nextId++;
    pending.set(id, { handle: h, def, model, variant });
    w.postMessage({ id, model, variant });
  } else {
    install(h, paintAtlas(def));
  }
  return h;
}

/** Number of atlases still being painted (debug pages wait for 0). */
export function pendingTextures(): number {
  return pending.size;
}

/** Paint every model now (e.g. in a loading screen) — returns when all are ready. */
export function whenTexturesReady(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => (pending.size === 0 ? resolve() : setTimeout(check, 50));
    check();
  });
}
