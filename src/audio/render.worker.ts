// Background renderer: synthesises sounds off the main thread so the game never hitches.
// Imported by bank.ts as `./render.worker?worker&inline` (inlined as a Blob in production builds).

import { renderJob, type RenderRequest, type RenderResponse } from './render';

interface WorkerScope {
  onmessage: ((e: MessageEvent<RenderRequest>) => void) | null;
  postMessage(msg: RenderResponse, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const req = e.data;
  try {
    const data = renderJob(req.job, req.sr);
    scope.postMessage({ id: req.id, data }, [data.buffer]);
  } catch (err) {
    scope.postMessage({ id: req.id, error: String(err) });
  }
};
