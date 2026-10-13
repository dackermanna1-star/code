import { meshChunk, type MeshResult } from './mesher';

/** Web Worker: meshes chunks off the main thread. */
interface Req {
  id: number;
  cx: number;
  cz: number;
  chunks: Array<Uint8Array | null>;
  ao: boolean;
}

self.onmessage = (ev: MessageEvent<Req>) => {
  const r = ev.data;
  let res: MeshResult;
  try {
    res = meshChunk(r.cx, r.cz, r.chunks, r.ao);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id: r.id, error: String(e) });
    return;
  }
  const transfer: ArrayBuffer[] = [];
  for (const m of [res.opaque, res.trans]) transfer.push(m.pos.buffer as ArrayBuffer, m.uv.buffer as ArrayBuffer, m.info.buffer as ArrayBuffer, m.idx.buffer as ArrayBuffer);
  (self as unknown as Worker).postMessage({ id: r.id, res }, transfer);
};
