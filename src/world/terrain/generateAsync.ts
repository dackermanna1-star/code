// Runs terrain generation in a Web Worker (falls back to the main thread if workers are unavailable).
import type { WorldLayout } from '../layout/types';
import { generateTerrain } from './generate';
import type { TerrainResult } from './TerrainData';

export async function generateTerrainAsync(layout: WorldLayout): Promise<TerrainResult> {
  if (typeof Worker !== 'undefined') {
    try {
      const worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
      const result = await new Promise<TerrainResult>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: TerrainResult; error?: string }>) => {
          if (e.data.ok && e.data.result) resolve(e.data.result);
          else reject(new Error(e.data.error ?? 'terrain worker failed'));
        };
        worker.onerror = (e) => reject(new Error(e.message || 'terrain worker error'));
        worker.postMessage({ layout });
      });
      worker.terminate();
      return result;
    } catch (e) {
      console.warn('[world] terrain worker unavailable, generating on the main thread', e);
    }
  }
  return generateTerrain(layout);
}
