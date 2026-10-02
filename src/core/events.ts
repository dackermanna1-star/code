/** Minimal typed event emitter. */
export type Listener<T> = (payload: T) => void;

export class Emitter<Events extends Record<string, any>> {
  private map = new Map<keyof Events, Set<Listener<any>>>();
  on<K extends keyof Events>(type: K, fn: Listener<Events[K]>): () => void {
    let set = this.map.get(type);
    if (!set) this.map.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }
  off<K extends keyof Events>(type: K, fn: Listener<Events[K]>) {
    this.map.get(type)?.delete(fn);
  }
  emit<K extends keyof Events>(type: K, payload: Events[K]) {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of set) fn(payload);
  }
}
