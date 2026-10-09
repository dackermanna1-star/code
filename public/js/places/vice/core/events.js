// A tiny event bus: V.events.on('crime', fn), V.events.emit('crime', {...}).
export class Events {
  constructor() { this.h = new Map(); }
  on(name, fn) { if (!this.h.has(name)) this.h.set(name, new Set()); this.h.get(name).add(fn); return () => this.h.get(name)?.delete(fn); }
  emit(name, ...a) { const s = this.h.get(name); if (s) for (const fn of [...s]) { try { fn(...a); } catch (e) { console.error(e); } } }
  clear() { this.h.clear(); }
}
