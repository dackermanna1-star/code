// Web Worker: generates the terrain off the main thread so loading stays responsive.
import type { WorldLayout } from '../layout/types';
import { generateTerrain, transferables } from './generate';

self.onmessage = (e: MessageEvent<{ layout: WorldLayout }>) => {
  try {
    const result = generateTerrain(e.data.layout);
    (self as unknown as Worker).postMessage({ ok: true, result }, transferables(result));
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String((err as Error)?.stack ?? err) });
  }
};
