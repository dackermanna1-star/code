// Every change to the paint is an event, recorded with float32 values exactly
// as they were applied, so replaying the log reproduces the walls bit for bit
// (drips included). Undo truncates the last stroke and replays; the log is also
// what survives a reload (IndexedDB, falling back to nothing if unavailable).
import * as THREE from 'three';

export const EV = { SPRAY: 1, IDLE: 2, BEGIN: 3, END: 4, TICK: 5 };
const LEN = { 1: 16, 2: 2, 3: 2, 4: 1, 5: 2 };
const f = Math.fround;

export class PaintLog {
  constructor() {
    this.data = new Float32Array(4096);
    this.n = 0;
    this.settings = [];
    this.begins = []; // offsets of BEGIN events (undo points)
    this.changed = false;
  }

  push(...vals) {
    if (this.n + vals.length > this.data.length) {
      const d = new Float32Array(Math.max(this.data.length * 2, this.n + vals.length + 1024));
      d.set(this.data.subarray(0, this.n));
      this.data = d;
    }
    for (const v of vals) this.data[this.n++] = v;
    this.changed = true;
  }

  begin(settings) {
    this.begins.push(this.n);
    this.settings.push(settings);
    this.push(EV.BEGIN, this.settings.length - 1);
  }
  end() {
    this.push(EV.END);
  }
  idle(seconds) {
    this.push(EV.IDLE, seconds);
  }
  tick(dt) {
    this.push(EV.TICK, dt);
  }
  spray(fr) {
    const { hit, normal, nozzle, right } = fr;
    this.push(EV.SPRAY, fr.dt, fr.pressure, hit.x, hit.y, hit.z, normal.x, normal.y, normal.z, nozzle.x, nozzle.y, nozzle.z, right.x, right.y, right.z, 0);
  }

  get strokes() {
    return this.begins.length;
  }

  /** Drop the most recent stroke and everything recorded after it. */
  undoLast() {
    if (!this.begins.length) return false;
    this.n = this.begins.pop();
    this.settings.pop();
    this.changed = true;
    return true;
  }

  clear() {
    this.n = 0;
    this.settings = [];
    this.begins = [];
    this.changed = true;
  }

  /** Iterate events: cb(type, offset, data). */
  forEach(cb) {
    const D = this.data;
    for (let o = 0; o < this.n; ) {
      const t = D[o];
      const len = LEN[t];
      if (!len) break; // corrupt tail: stop
      cb(t, o, D);
      o += len;
    }
  }

  serialize() {
    return { v: 1, settings: this.settings.slice(), data: this.data.slice(0, this.n) };
  }

  static deserialize(obj) {
    const log = new PaintLog();
    if (!obj || obj.v !== 1 || !obj.data) return log;
    log.settings = obj.settings ?? [];
    log.data = new Float32Array(Math.max(4096, obj.data.length + 1024));
    log.data.set(obj.data);
    log.n = obj.data.length;
    log.forEach((t, o) => {
      if (t === EV.BEGIN) log.begins.push(o);
    });
    log.changed = false;
    return log;
  }
}

/** Round a spray frame to float32 so live processing matches a replay exactly. */
export function quantizeFrame(fr) {
  for (const k of ['hit', 'normal', 'nozzle', 'right']) fr[k].set(f(fr[k].x), f(fr[k].y), f(fr[k].z));
  fr.dt = f(fr.dt);
  fr.pressure = f(fr.pressure);
  return fr;
}

/** Decode a SPRAY event at offset o into a reusable frame object. */
export function readFrame(D, o, fr) {
  fr.dt = D[o + 1];
  fr.pressure = D[o + 2];
  fr.hit.set(D[o + 3], D[o + 4], D[o + 5]);
  fr.normal.set(D[o + 6], D[o + 7], D[o + 8]);
  fr.nozzle.set(D[o + 9], D[o + 10], D[o + 11]);
  fr.right.set(D[o + 12], D[o + 13], D[o + 14]);
  return fr;
}

export function newFrame() {
  return { hit: new THREE.Vector3(), normal: new THREE.Vector3(), nozzle: new THREE.Vector3(), right: new THREE.Vector3(), dt: 0, pressure: 1 };
}

// ───────────────────────── persistence ─────────────────────────

const DB_NAME = 'blue-hour-alley';
const STORE = 'paint';
const KEY = 'log-v1';

function openDB() {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}

export async function loadPaint() {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function savePaint(obj) {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(obj, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
    return true;
  } catch {
    return false;
  }
}
