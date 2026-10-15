// Off-main-thread sound baking (AudioSystem.prewarm): the same deterministic
// recipes as bake.ts, rendered in a Worker and handed back as transferable
// sample buffers, so warming up ~250 s of audio never stalls a frame.
//
// Protocol (page → worker):
//   { jobs: [name, variant][], sr }   bake these, in this order
//   { hurry: [name, variant] }        move that job to the front (it was asked for early)
// Worker → page: one { name, variant, channels | null, sr, ms } per job
// (channels transferred, not copied), then { allDone: true } when the queue
// is empty. The worker keeps its own queue and yields between jobs, so it
// never waits on a busy main thread and a hurry message is seen in time.
import { bake } from './bake';

type Msg = { jobs: Array<[string, number]>; sr: number } | { hurry: [string, number] };

interface Scope {
  onmessage: ((e: MessageEvent<Msg>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const scope = self as unknown as Scope;
let queue: Array<[string, number]> = [];
let sr = 48000;
let running = false;

function next(): void {
  const job = queue.shift();
  if (!job) {
    running = false;
    scope.postMessage({ allDone: true });
    return;
  }
  const [name, variant] = job;
  let b: ReturnType<typeof bake> = null;
  try {
    b = bake(name, variant, sr);
  } catch {
    b = null;
  }
  if (b) scope.postMessage({ name, variant, channels: b.channels, sr: b.sr, ms: b.ms }, b.channels.map((c) => c.buffer));
  else scope.postMessage({ name, variant, channels: null });
  setTimeout(next, 0);
}

scope.onmessage = (e) => {
  const m = e.data;
  if ('hurry' in m) {
    const [n, v] = m.hurry;
    const i = queue.findIndex(([a, b]) => a === n && b === v);
    if (i > 0) queue.unshift(...queue.splice(i, 1));
    return;
  }
  sr = m.sr;
  queue = queue.concat(m.jobs);
  if (!running) {
    running = true;
    next();
  }
};
