// Mesh worker: runs the greedy mesher off the main thread.
import { meshVolume, QuadBuffer } from '../world/mesher';

let transparent: Uint8Array = new Uint8Array(256);
const opaque = new QuadBuffer(8192);
const trans = new QuadBuffer(1024);

interface MeshJob { type: 'mesh'; id: number; vox: Uint8Array; sx: number; sy: number; sz: number; ox: number; oy: number; oz: number; slot: number }
interface InitMsg { type: 'init'; transparent: Uint8Array }

self.onmessage = (e: MessageEvent<MeshJob | InitMsg>) => {
  const m = e.data;
  if (m.type === 'init') { transparent = m.transparent; return; }
  opaque.reset(); trans.reset();
  meshVolume(m.vox, m.sx, m.sy, m.sz, transparent, m.ox, m.oy, m.oz, m.slot, opaque, trans);
  const o = opaque.slice(), t = trans.slice();
  (self as unknown as Worker).postMessage({ id: m.id, opaque: o, trans: t, vox: m.vox }, [o.buffer, t.buffer, m.vox.buffer]);
};
