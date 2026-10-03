// Render jobs: one pure entry point used both by the background worker (render.worker.ts) and by
// the main-thread fallback. Every job produces one mono Float32Array at the requested rate.

import type { LoopName, SfxName, VoicePhrase } from './types';
import { renderSfx } from './sfx';
import { renderLoopLayer, renderLoopEvent } from './loops';
import { renderPhrase } from './voice';
import { renderNote, type Inst } from './instruments';
import { makeReverbIR } from './dsp';

export type RenderJob =
  | { k: 'sfx'; name: SfxName; v: number }
  | { k: 'layer'; name: LoopName; layer: number }
  | { k: 'event'; name: LoopName; v: number }
  | { k: 'voice'; phrase: VoicePhrase; seed: number }
  | { k: 'note'; inst: Inst; midi: number }
  /** stereo reverb impulse response at the context rate, returned as [left..., right...] */
  | { k: 'ir'; sr: number; dur: number; seed: number };

export interface RenderRequest {
  id: number;
  sr: number;
  job: RenderJob;
}
export type RenderResponse = { id: number; data: Float32Array } | { id: number; error: string };

const SILENT = () => new Float32Array(1);

/** Renders one job (never throws; failures come back as a 1-sample silent buffer). */
export function renderJob(job: RenderJob, sr: number): Float32Array {
  try {
    let out: Float32Array | null = null;
    switch (job.k) {
      case 'sfx':
        out = renderSfx(job.name, sr, job.v + 1);
        break;
      case 'layer':
        out = renderLoopLayer(job.name, job.layer, sr, 0);
        break;
      case 'event':
        out = renderLoopEvent(job.name, sr, job.v + 1);
        break;
      case 'voice':
        out = renderPhrase(job.phrase, sr, job.seed);
        break;
      case 'note':
        out = renderNote(job.inst, job.midi, sr);
        break;
      case 'ir': {
        const [l, r] = makeReverbIR(job.sr, job.dur, job.seed);
        out = new Float32Array(l.length * 2);
        out.set(l, 0);
        out.set(r, l.length);
        break;
      }
    }
    if (!out || out.length === 0) return SILENT();
    // paranoia: a NaN would poison the whole mix bus
    for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i])) out[i] = 0;
    return out;
  } catch {
    return SILENT();
  }
}
