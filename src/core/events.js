// Tiny pub/sub bus.
export class Events {
  constructor() { this.map = new Map(); }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  once(name, fn) {
    const off = this.on(name, (...a) => { off(); fn(...a); });
    return off;
  }
  off(name, fn) { this.map.get(name)?.delete(fn); }
  emit(name, ...args) {
    const set = this.map.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(...args); } catch (e) { console.error(`[event ${name}]`, e); }
    }
  }
}
