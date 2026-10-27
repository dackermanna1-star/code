/// <reference lib="webworker" />
import { SurfaceGenerator, type SurfaceParams } from './surface';
import { buildNode } from './meshbuilder';

const gens = new Map<string, SurfaceGenerator>();

export type WorkerRequest =
  | { type: 'init'; planet: string; params: SurfaceParams }
  | { type: 'drop'; planet: string }
  | { type: 'build'; id: number; planet: string; face: number; level: number; ix: number; iy: number; parent?: Float32Array };

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const m = ev.data;
  if (m.type === 'init') {
    if (!gens.has(m.planet)) gens.set(m.planet, new SurfaceGenerator(m.params));
  } else if (m.type === 'drop') {
    gens.delete(m.planet);
  } else if (m.type === 'build') {
    const gen = gens.get(m.planet);
    if (!gen) {
      (self as unknown as Worker).postMessage({ type: 'error', id: m.id, error: 'unknown planet' });
      return;
    }
    const d = buildNode(gen, m.face, m.level, m.ix, m.iy, m.parent);
    (self as unknown as Worker).postMessage(
      { type: 'built', id: m.id, data: d },
      [d.position.buffer, d.normal.buffer, d.a0.buffer, d.a1.buffer, d.morph.buffer, d.detail.buffer, d.heights.buffer],
    );
  }
};
