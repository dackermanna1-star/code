// Web Worker: renders sound-bank variations off the main thread (pure DSP from bank.ts) and
// transfers the PCM back. Protocol: in {sr, tasks:[id, variant][]} → out per task
// {id, v, sr, chans} (transferred) | {id, v, error}, then {done:true}.

import { SOUND_BY_ID, renderVariant } from "./bank.ts";

interface TaskMsg {
  sr: number;
  tasks: Array<[string, number]>;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<TaskMsg>) => void) | null;
  postMessage(m: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = (e: MessageEvent<TaskMsg>) => {
  const { sr, tasks } = e.data;
  for (const [id, v] of tasks) {
    const def = SOUND_BY_ID.get(id);
    if (!def) {
      scope.postMessage({ id, v, error: "unknown id" });
      continue;
    }
    try {
      const r = renderVariant(def, v, sr);
      scope.postMessage({ id, v, sr: r.sr, chans: r.chans }, r.chans.map((c) => c.buffer as ArrayBuffer));
    } catch (err) {
      scope.postMessage({ id, v, error: String(err) });
    }
  }
  scope.postMessage({ done: true });
};
