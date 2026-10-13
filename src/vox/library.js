// Voxel model library: builds the 3D model of every rotated frame of a
// monster sprite on demand, in a small pool of workers when the browser
// allows it and on the main thread (a frame or two at a time) otherwise.
// A sprite switches to 3D only once all of its frames are ready, so a
// monster never mixes flat and voxel frames.

import { VOX_TYPES, frameViews, buildVoxelModel, compactModel } from './voxelize.js';
import { SPRNAMES } from '../game/info.js';
import { MOBJINFO, stateSprite, stateFrame, stateNext, FRAMEMASK } from '../game/tables.js';

export class VoxelLibrary {
  constructor(res) {
    this.res = res;
    this.models = new Map(); // sprite * 64 + frame -> model
    this.sprites = new Map(); // sprite -> { total, done }
    this.queue = [];
    this.jobs = new Map();
    this.nextId = 1;
    this.workers = [];
    this.idle = [];
    this.startWorkers();
    this.deathFrames = buildDeathFrames();
  }

  startWorkers() {
    if (typeof Worker === 'undefined') return;
    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
    const n = Math.max(1, Math.min(4, cores - 1));
    for (let i = 0; i < n; i++) {
      let wk;
      try {
        const url = globalThis.__DOOM_VOX_WORKER_URL;
        wk = url ? new Worker(url) : new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      } catch {
        break;
      }
      wk.onmessage = (e) => this.finish(wk, e.data);
      wk.onerror = (e) => {
        // A worker that can't run (no module workers): build here instead.
        if (e && e.preventDefault) e.preventDefault();
        this.dropWorker(wk);
      };
      this.workers.push(wk);
      this.idle.push(wk);
    }
  }

  dropWorker(wk) {
    this.workers = this.workers.filter((x) => x !== wk);
    this.idle = this.idle.filter((x) => x !== wk);
    for (const [id, job] of this.jobs) {
      if (job.worker === wk) { this.jobs.delete(id); this.queue.unshift(job); }
    }
    try { wk.terminate(); } catch { /* ignore */ }
  }

  config(sprite) { return VOX_TYPES[SPRNAMES[sprite]] || null; }

  supports(sprite) { return !!this.config(sprite); }

  // Starts building every rotated frame of a sprite.
  request(sprite) {
    if (sprite < 0 || this.sprites.has(sprite)) return;
    const cfg = this.config(sprite);
    const frames = this.res.sprites[sprite];
    if (!cfg || !frames) return;
    let total = 0;
    frames.forEach((fr, fi) => {
      if (!fr || !fr.rotate) return;
      const views = frameViews(this.res, fr);
      if (!views) return;
      total++;
      this.queue.push({ sprite, frame: fi, cfg, views });
    });
    this.sprites.set(sprite, { total, done: 0 });
    this.pump();
  }

  ready(sprite) {
    const s = this.sprites.get(sprite);
    return !!s && s.total > 0 && s.done >= s.total;
  }

  model(sprite, frame) { return this.models.get(sprite * 64 + (frame & FRAMEMASK)) || null; }

  // Hands queued jobs to idle workers; without workers, builds on this
  // thread for up to `budgetMs`.
  pump(budgetMs = 6) {
    while (this.queue.length && this.idle.length) {
      const job = this.queue.shift();
      const wk = this.idle.pop();
      const id = this.nextId++;
      job.worker = wk;
      this.jobs.set(id, job);
      wk.postMessage({ id, views: job.views, cfg: job.cfg });
    }
    if (this.workers.length || !this.queue.length) return;
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const job = this.queue.shift();
      let model = null;
      try {
        const m = buildVoxelModel(job.views, { cfg: job.cfg });
        model = m ? compactModel(m) : null;
      } catch (err) {
        console.warn('voxel build failed', SPRNAMES[job.sprite], job.frame, err);
      }
      this.store(job, model);
    }
  }

  finish(wk, msg) {
    const job = this.jobs.get(msg.id);
    this.jobs.delete(msg.id);
    this.idle.push(wk);
    if (job) {
      if (msg.error) console.warn('voxel build failed', SPRNAMES[job.sprite], job.frame, msg.error);
      this.store(job, msg.model);
    }
    this.pump();
  }

  store(job, model) {
    const s = this.sprites.get(job.sprite);
    if (model) {
      model.sprite = job.sprite;
      model.frame = job.frame;
      model.cfg = job.cfg;
      this.models.set(job.sprite * 64 + job.frame, model);
    }
    if (s) {
      s.done++;
      // A sprite whose frames all failed stays flat.
      if (s.done >= s.total && ![...this.models.keys()].some((k) => Math.floor(k / 64) === job.sprite)) s.total = 0;
    }
  }

  // Busy building anything?
  get pending() { return this.queue.length + this.jobs.size; }
}

// Frames of each monster's death and gib animations (sprite*64+frame ->
// 'death' | 'xdeath'), used to recognise corpses placed as decorations.
function buildDeathFrames() {
  const out = new Map();
  const walk = (start, kind) => {
    let st = start;
    for (let k = 0; k < 16 && st > 0; k++) {
      const key = stateSprite[st] * 64 + (stateFrame[st] & FRAMEMASK);
      if (!out.has(key)) out.set(key, kind);
      const nx = stateNext[st];
      if (nx === st) break;
      st = nx;
    }
  };
  const types = MOBJINFO.filter((info) => info && VOX_TYPES[SPRNAMES[stateSprite[info.spawnstate]]]);
  for (const info of types) if (info.deathstate) walk(info.deathstate, 'death');
  for (const info of types) if (info.xdeathstate) walk(info.xdeathstate, 'xdeath');
  return out;
}
