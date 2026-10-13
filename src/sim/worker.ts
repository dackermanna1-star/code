/// <reference lib="webworker" />
import { DEFAULT_CONFIG, mergeConfig, type WorldConfig } from '../shared/config';
import type { C2S } from '../shared/net/protocol';
import { Game } from './game';
import type { Link } from './link';
import { log } from './log';
import type { Player } from './player';
import { IDBStorage } from './storage';

/**
 * Singleplayer host: runs the authoritative simulation inside a Web Worker
 * (an "integrated server"), talking to the UI thread with postMessage.
 *
 *   UI -> worker: { type: 'open', worldId, name, config? } | { type: 'c2s', m } | { type: 'close' }
 *   worker -> UI: S2C messages, binary chunk frames, { type: 'ready' } / { type: 'closed' } / { type: 'error' }
 */
declare const self: DedicatedWorkerGlobalScope;

let game: Game | null = null;
let player: Player | null = null;
let storage: IDBStorage | null = null;

const link: Link = {
  closed: false,
  buffered: 0,
  send(m) {
    self.postMessage(m);
  },
  sendBin(b) {
    // copy: frames are cached by the simulation and must not be detached
    const copy = b.slice();
    self.postMessage(copy, [copy.buffer]);
  },
  close() {
    /* the UI owns the worker lifetime */
  },
};

self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data as { type: string; worldId?: string; name?: string; config?: Partial<WorldConfig>; m?: C2S };
  try {
    if (msg.type === 'open') {
      storage = await IDBStorage.open(msg.worldId!);
      const saved = storage.getMeta('config');
      const base = saved ? mergeConfig(DEFAULT_CONFIG, JSON.parse(saved)) : DEFAULT_CONFIG;
      const config = mergeConfig(base, saved ? {} : msg.config ?? {});
      game = new Game(config, storage);
      player = game.join(link, msg.name ?? 'Survivor');
      game.start();
      if (!saved) await game.save('created');
      self.postMessage({ type: 'ready' });
    } else if (msg.type === 'c2s' && game && player && msg.m) {
      game.handle(player, msg.m);
    } else if (msg.type === 'close') {
      if (game) await game.shutdown();
      storage?.close();
      game = null;
      player = null;
      self.postMessage({ type: 'closed' });
    }
  } catch (e) {
    log.error('Simulation worker error', { error: String(e), stack: (e as Error).stack });
    self.postMessage({ type: 'error', error: String((e as Error).message ?? e) });
  }
};
