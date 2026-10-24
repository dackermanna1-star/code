/** Minimal typed event bus. */
export class Emitter<T extends Record<string, any>> {
  private handlers: { [K in keyof T]?: ((e: T[K]) => void)[] } = {};

  on<K extends keyof T>(type: K, fn: (e: T[K]) => void): () => void {
    (this.handlers[type] ??= []).push(fn);
    return () => this.off(type, fn);
  }

  off<K extends keyof T>(type: K, fn: (e: T[K]) => void): void {
    const list = this.handlers[type];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit<K extends keyof T>(type: K, e: T[K]): void {
    const list = this.handlers[type];
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i](e);
  }

  clear(): void {
    this.handlers = {};
  }
}
