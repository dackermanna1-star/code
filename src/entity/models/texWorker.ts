/// <reference lib="webworker" />
/**
 * Texture painting worker: rebuilds the (deterministic) model definition and paints its atlas.
 */
import { getModelDef } from './defs/index';
import { paintAtlas } from './paint/atlas';

self.onmessage = (e: MessageEvent) => {
  const { id, model, variant } = e.data as { id: number; model: string; variant: string };
  try {
    const def = getModelDef(model, variant);
    const t = paintAtlas(def);
    const transfer: Transferable[] = [t.albedo.buffer, t.pbr.buffer];
    if (t.extra) transfer.push(t.extra.buffer);
    (self as unknown as Worker).postMessage({ id, ...t }, transfer);
  } catch (err: any) {
    (self as unknown as Worker).postMessage({ id, error: String(err?.stack ?? err) });
  }
};
