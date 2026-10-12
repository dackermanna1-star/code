// Web worker: generates chunk voxel data off the main thread.
import { WorldGenerator } from './generator';

let gen: WorldGenerator | null = null;

self.onmessage = (e: MessageEvent) => {
  const d = e.data;
  if (d.type === 'init') {
    gen = new WorldGenerator(d.seed);
    return;
  }
  if (d.type === 'gen' && gen) {
    const r = gen.generateChunk(d.cx, d.cy, d.cz);
    (self as unknown as Worker).postMessage({ type: 'chunk', id: d.id, cx: d.cx, cy: d.cy, cz: d.cz, mat: r.mat, spawns: r.spawns }, [r.mat.buffer]);
  }
};
