// Engine-side sound bank: renders the procedural bank (bank.ts) into AudioBuffers. Generation
// runs in Web Workers when available (no main-thread cost; parallel with the rest of the
// loading), otherwise time-sliced on the main thread so the loading bar keeps repainting.
// Variation 0 of every sound is produced first, so a blown time budget only reduces variety.

import { SOUND_DEFS, SOUND_BY_ID, renderVariant, yieldMacrotask, type SoundDef, type RenderedSound } from "./bank.ts";

export interface BankEntry {
  def: SoundDef;
  buffers: AudioBuffer[];
  /** Index of the last variant played (avoid immediate repeats). */
  last: number;
}

export interface BankStats {
  ms: number;
  mainMs: number;
  buffers: number;
  bytes: number;
  workers: number;
  workerFailures: number;
  skipped: number;
  /** Extra variations still being rendered by the workers when generate() resolved. */
  background: number;
  sampleRate: number;
}

export interface BankOpts {
  /** Base sample rate (Hz). */
  sr?: number;
  /**
   * Time budget (ms, default 1500): generate() resolves once it is spent and every sound has
   * its first variation. Remaining extra variations are then either filled in by the workers
   * in the background (see `background`) or skipped.
   */
  budgetMs?: number;
  /** Let the workers keep adding extra variations after generate() resolved (default true). */
  background?: boolean;
  onProgress?: (fraction: number) => void;
  /** Use Web Workers (default true when available). A number = worker count. */
  workers?: boolean | number;
  /** Restrict to these ids (tests). */
  only?: (def: SoundDef) => boolean;
}

type MakeBuffer = (chans: Float32Array[], sr: number) => AudioBuffer;

/** AudioBuffer factory that needs no running AudioContext (null when Web Audio is missing). */
export function bufferFactory(): MakeBuffer | null {
  const copy = (b: AudioBuffer, chans: Float32Array[]) => {
    for (let i = 0; i < chans.length; i++) b.copyToChannel(chans[i] as Float32Array<ArrayBuffer>, i);
    return b;
  };
  try {
    if (typeof AudioBuffer !== "undefined") {
      new AudioBuffer({ length: 1, sampleRate: 48000 });
      return (chans, sr) => copy(new AudioBuffer({ length: Math.max(1, chans[0].length), numberOfChannels: chans.length, sampleRate: sr }), chans);
    }
  } catch {
    /* constructor unsupported: fall through */
  }
  try {
    const OAC = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
    if (OAC) {
      const oc = new OAC(1, 1, 48000);
      return (chans, sr) => copy(oc.createBuffer(chans.length, Math.max(1, chans[0].length), sr), chans);
    }
  } catch {
    /* no Web Audio at all */
  }
  return null;
}

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Default bank generation budget (ms): the brief's ~1.5 s loading-time allowance. */
export const DEFAULT_BUDGET_MS = 1500;

export class SoundBank {
  readonly entries = new Map<string, BankEntry>();
  readonly sampleRate: number;
  stats: BankStats;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.stats = { ms: 0, mainMs: 0, buffers: 0, bytes: 0, workers: 0, workerFailures: 0, skipped: 0, background: 0, sampleRate };
  }

  get(id: string): BankEntry | undefined {
    return this.entries.get(id);
  }

  get size(): number {
    return this.entries.size;
  }

  /** A variant buffer, avoiding the one played last. */
  pick(e: BankEntry, rand: () => number): AudioBuffer {
    const n = e.buffers.length;
    if (n <= 1) return e.buffers[0];
    let i = Math.floor(rand() * n) % n;
    if (i === e.last) i = (i + 1 + Math.floor(rand() * (n - 1))) % n;
    e.last = i;
    return e.buffers[i];
  }

  add(def: SoundDef, v: number, r: RenderedSound, make: MakeBuffer): void {
    let e = this.entries.get(def.id);
    if (!e) {
      e = { def, buffers: [], last: -1 };
      this.entries.set(def.id, e);
    }
    // Keep variants in index order whatever order the workers deliver them (determinism).
    const buf = make(r.chans, r.sr) as AudioBuffer & { __v?: number };
    buf.__v = v;
    let i = e.buffers.length;
    while (i > 0 && ((e.buffers[i - 1] as AudioBuffer & { __v?: number }).__v ?? 0) > v) i--;
    e.buffers.splice(i, 0, buf);
    this.stats.buffers++;
    for (const c of r.chans) this.stats.bytes += c.length * 4;
  }

  /** Generate the whole bank (never throws; returns an empty bank without Web Audio). */
  static async generate(o: BankOpts = {}): Promise<SoundBank> {
    const sr = o.sr ?? 48000;
    const bank = new SoundBank(sr);
    const make = bufferFactory();
    if (!make) return bank;
    const t0 = now();
    const defs = SOUND_DEFS.filter((d) => (o.only ? o.only(d) : true));
    // Variant-major task order.
    const tasks: Array<[string, number]> = [];
    const maxV = Math.max(1, ...defs.map((d) => d.variants));
    for (let v = 0; v < maxV; v++) for (const d of defs) if (v < d.variants) tasks.push([d.id, v]);
    const total = tasks.length;
    const done = new Set<string>();
    const progress = () => o.onProgress?.(Math.min(1, done.size / Math.max(1, total)));
    const sink = (id: string, v: number, r: RenderedSound) => {
      const def = SOUND_BY_ID.get(id);
      if (!def) return;
      try {
        bank.add(def, v, r, make);
      } catch (e) {
        console.warn(`audio: could not create buffer for ${id}`, e);
      }
      done.add(`${id}#${v}`);
    };
    const budget = Number.isFinite(o.budgetMs) ? Math.max(0, o.budgetMs as number) : DEFAULT_BUDGET_MS;
    let remaining = tasks;
    const nw = workerCount(o.workers);
    if (nw > 0) {
      try {
        remaining = await runWorkers(nw, sr, tasks, budget, t0, done, sink, progress, bank, o.background !== false);
      } catch {
        bank.stats.workerFailures++;
        remaining = tasks.filter(([id, v]) => !done.has(`${id}#${v}`));
      }
    }
    // Main-thread fallback / remainder (time-sliced).
    if (remaining.length) {
      const tm = now();
      let slice = now();
      for (const [id, v] of remaining) {
        if (done.has(`${id}#${v}`)) continue;
        const def = SOUND_BY_ID.get(id);
        if (!def) continue;
        if (v > 0 && now() - t0 > budget) {
          bank.stats.skipped++;
          continue;
        }
        sink(id, v, renderVariant(def, v, sr));
        if (now() - slice > 10) {
          progress();
          await yieldMacrotask();
          slice = now();
        }
      }
      bank.stats.mainMs = now() - tm;
    }
    bank.stats.ms = now() - t0;
    o.onProgress?.(1);
    return bank;
  }
}

function workerCount(opt: boolean | number | undefined): number {
  if (opt === false) return 0;
  if (typeof Worker === "undefined" || typeof URL === "undefined") return 0;
  if (typeof opt === "number") return Math.max(0, Math.min(8, Math.floor(opt)));
  const hc = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
  return Math.max(1, Math.min(3, hc - 2));
}

/**
 * Distribute tasks over `n` workers. Resolves with the tasks still missing (empty when all
 * arrived). Gives up (returning the remainder for the main thread) on worker errors or when
 * no message arrives for 8 s; stops early after `budget` ms once every sound has a variant.
 */
function runWorkers(
  n: number,
  sr: number,
  tasks: Array<[string, number]>,
  budget: number,
  t0: number,
  done: Set<string>,
  sink: (id: string, v: number, r: RenderedSound) => void,
  progress: () => void,
  bank: SoundBank,
  background: boolean,
): Promise<Array<[string, number]>> {
  return new Promise((resolve) => {
    const workers: Worker[] = [];
    const lists: Array<Array<[string, number]>> = Array.from({ length: n }, () => []);
    tasks.forEach((t, i) => lists[i % n].push(t));
    const needFirst = new Set(tasks.filter((t) => t[1] === 0).map((t) => t[0]));
    let finished = 0;
    let settled = false;
    let lastMsg = now();
    const remainder = () => tasks.filter(([id, v]) => !done.has(`${id}#${v}`));
    let resolved = false;
    const terminate = () => {
      if (settled) return;
      settled = true;
      clearInterval(watch);
      for (const w of workers) {
        try {
          w.terminate();
        } catch {
          /* ignore */
        }
      }
      if (!resolved) {
        resolved = true;
        resolve(remainder());
      }
    };
    // Budget spent and every sound has variation 0: resolve now and (optionally) let the
    // workers keep delivering extra variations into the bank in the background.
    const budgetDone = () => {
      if (resolved || settled) return;
      if (!background) return finish();
      resolved = true;
      bank.stats.background = remainder().length;
      resolve([]);
    };
    const finish = () => {
      if (settled) return;
      if (resolved) return terminate();
      settled = true;
      clearInterval(watch);
      for (const w of workers) {
        try {
          w.terminate();
        } catch {
          /* ignore */
        }
      }
      // The main-thread pass renders what is missing (extra variants only while in budget).
      resolve(remainder());
    };
    const overBudget = () => now() - t0 > budget;
    const watch = setInterval(() => {
      if (now() - lastMsg > 8000) {
        bank.stats.workerFailures++;
        finish();
      } else if (overBudget() && needFirst.size === 0) budgetDone();
    }, 100);
    for (let i = 0; i < n; i++) {
      let w: Worker;
      try {
        w = new Worker(new URL("./bankWorker.ts", import.meta.url), { type: "module" });
      } catch {
        bank.stats.workerFailures++;
        finished++;
        continue;
      }
      workers.push(w);
      w.onmessage = (e: MessageEvent) => {
        lastMsg = now();
        const m = e.data as { done?: boolean; id?: string; v?: number; sr?: number; chans?: Float32Array[]; error?: string };
        if (m.done) {
          finished++;
          if (finished >= n) finish();
          return;
        }
        if (m.id !== undefined && m.v !== undefined && m.chans && m.sr) {
          sink(m.id, m.v, { sr: m.sr, chans: m.chans });
          if (m.v === 0) needFirst.delete(m.id);
          if (!resolved) progress(); // the loading bar already reached 1 for background fills
          if (overBudget() && needFirst.size === 0) budgetDone();
        }
      };
      w.onerror = (ev) => {
        ev.preventDefault?.();
        bank.stats.workerFailures++;
        finished++;
        if (finished >= n) finish();
      };
      w.postMessage({ sr, tasks: lists[i] });
    }
    bank.stats.workers = workers.length;
    if (workers.length === 0) finish();
  });
}
