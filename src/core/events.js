// Tiny synchronous event bus. Event names are namespaced strings, see docs/ARCHITECTURE.md.
export class EventBus {
  constructor() { this._h = new Map(); }
  on(name, fn) {
    if (!this._h.has(name)) this._h.set(name, new Set());
    this._h.get(name).add(fn);
    return () => this.off(name, fn);
  }
  once(name, fn) {
    const off = this.on(name, (p) => { off(); fn(p); });
    return off;
  }
  off(name, fn) { const s = this._h.get(name); if (s) s.delete(fn); }
  emit(name, payload) {
    const s = this._h.get(name);
    if (s) for (const fn of [...s]) {
      try { fn(payload); } catch (e) { console.error(`[events] handler for "${name}" failed`, e); }
    }
    const any = this._h.get('*');
    if (any) for (const fn of [...any]) { try { fn(name, payload); } catch (e) { console.error(e); } }
  }
}
