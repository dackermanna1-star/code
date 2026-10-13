import type { S2C } from '../shared/net/protocol';

/**
 * Channel from the simulation to the player's client. In singleplayer this
 * is a Web Worker postMessage bridge; tests use an in-memory recorder. The
 * simulation never assumes anything about the transport, which keeps the
 * door open for a networked transport later.
 */
export interface Link {
  send(msg: S2C): void;
  sendBin(buf: Uint8Array): void;
  readonly closed: boolean;
  /** Bytes queued but not yet consumed (backpressure). */
  readonly buffered: number;
  close(reason: string): void;
}

/** Link that records messages (tests / headless runs). */
export class RecordingLink implements Link {
  msgs: S2C[] = [];
  bins: Uint8Array[] = [];
  closed = false;
  buffered = 0;
  send(m: S2C) {
    this.msgs.push(m);
  }
  sendBin(b: Uint8Array) {
    this.bins.push(b);
  }
  close() {
    this.closed = true;
  }
  /** Messages of a given type received so far. */
  of<T extends S2C['t']>(t: T): Array<Extract<S2C, { t: T }>> {
    return this.msgs.filter((m) => m.t === t) as Array<Extract<S2C, { t: T }>>;
  }
}
