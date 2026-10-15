// Typed global event bus. Modules may add their own events through declaration merging:
//
//   declare module '../core/EventBus' {
//     interface GameEvents { 'myModule:thing': { foo: number } }
//   }
//
// Core cross-module events are declared in core/events.ts.

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GameEvents {}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<any>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type as string);
    if (!set) {
      set = new Set();
      this.handlers.set(type as string, set);
    }
    set.add(fn);
    return () => this.off(type, fn);
  }

  once<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): void {
    this.handlers.get(type as string)?.delete(fn);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type as string);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (e) {
        console.error(`[EventBus] handler for '${String(type)}' threw`, e);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
