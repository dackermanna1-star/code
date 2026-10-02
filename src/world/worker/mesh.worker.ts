/// <reference lib="webworker" />
/**
 * Meshing worker. In: { type:'mesh', id, input: MeshInput } ; Out: { type:'mesh', id, out: MeshOutput }.
 */
import { Mesher, type MeshOutput, type LayerMesh } from '../../render/mesher';

const mesher = new Mesher();

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type !== 'mesh') return;
  try {
    const out: MeshOutput = mesher.mesh(m.input);
    const transfer: Transferable[] = [];
    for (const l of [out.opaque, out.cutout, out.translucent] as (LayerMesh | null)[]) {
      if (!l) continue;
      transfer.push(l.pos.buffer, l.tex.buffer, l.light.buffer, l.color.buffer);
    }
    (self as any).postMessage({ type: 'mesh', id: m.id, key: m.key, version: m.version, out }, transfer);
  } catch (err) {
    (self as any).postMessage({ type: 'error', id: m.id, key: m.key, error: String((err as Error)?.stack ?? err) });
  }
};
