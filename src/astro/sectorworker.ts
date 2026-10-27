/// <reference lib="webworker" />
import { generateSector, type Exclusion } from './starsectors';
import type { GalaxyParams } from './galaxy';

type Req = { id: number; galaxy: GalaxyParams; level: number; ix: number; iy: number; iz: number; exclude?: Exclusion[] };

self.onmessage = (ev: MessageEvent<Req>) => {
  const m = ev.data;
  const s = generateSector(m.galaxy, m.level, m.ix, m.iy, m.iz, m.exclude);
  const copy = (a: ArrayLike<number> & { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }) => a;
  (self as unknown as Worker).postMessage({ id: m.id, sector: s }, [copy(s.pos).buffer as ArrayBuffer]);
};
