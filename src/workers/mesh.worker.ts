// Mesh worker: runs the greedy mesher (and LOD downsampling) off the main thread.
import { meshVolume, downsample, QuadBuffer } from '../world/mesher';

let transparent: Uint8Array = new Uint8Array(256);
const opaque = new QuadBuffer(8192);
const trans = new QuadBuffer(1024);
const lodBuf = new Uint8Array(18 * 18 * 18);

interface MeshJob { type: 'mesh'; id: number; vox: Uint8Array; sx: number; sy: number; sz: number; ox: number; oy: number; oz: number; slot: number; lod: number }
interface InitMsg { type: 'init'; transparent: Uint8Array }

self.onmessage = (e: MessageEvent<MeshJob | InitMsg>) => {
  const m = e.data;
  if (m.type === 'init') { transparent = m.transparent; return; }
  opaque.reset(); trans.reset();
  let src = m.vox;
  if (m.lod > 0) { downsample(m.vox, m.sx, 1 << m.lod, transparent, lodBuf); src = lodBuf; }
  meshVolume(src, m.sx, m.sy, m.sz, transparent, m.ox, m.oy, m.oz, m.slot, opaque, trans, m.lod);
  const o = opaque.slice(), t = trans.slice();
  (self as unknown as Worker).postMessage({ id: m.id, opaque: o, trans: t, vox: m.vox }, [o.buffer, t.buffer, m.vox.buffer]);
};
