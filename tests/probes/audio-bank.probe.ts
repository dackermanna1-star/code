// Probe 1: generate the procedural sound bank in the browser — Web Workers (default) and the
// time-sliced main-thread fallback — and report timing, buffer counts, memory and coverage.
// Also checks that the main thread stays responsive (frame gaps) during worker generation.
import { SOUND_DEFS } from "../../src/audio/bank.ts";
import { SoundBank } from "../../src/audio/soundbank.ts";
import { createAudio } from "../../src/audio/audio.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Settings } from "../../src/core/settings.ts";

async function measureGaps<T>(work: () => Promise<T>): Promise<{ result: T; maxGapMs: number; frames: number }> {
  let maxGap = 0;
  let frames = 0;
  let last = performance.now();
  let running = true;
  const tick = () => {
    const t = performance.now();
    maxGap = Math.max(maxGap, t - last);
    last = t;
    frames++;
    if (running) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const result = await work();
  running = false;
  return { result, maxGapMs: Math.round(maxGap), frames };
}

export async function probe() {
  const expectedBuffers = SOUND_DEFS.reduce((a, d) => a + d.variants, 0);
  const progress: number[] = [];

  // 1. Workers (default path used by createAudio).
  //    Default budget (1.5 s): generate() resolves once every sound has variation 0 and the budget
  //    is spent; the workers keep filling extra variations in the background.
  const w = await measureGaps(() => SoundBank.generate({ sr: 48000, onProgress: (p) => progress.push(p) }));
  const wb = w.result;
  const buffersAtResolve = wb.stats.buffers;
  const tBg = performance.now();
  while (wb.stats.buffers < expectedBuffers && performance.now() - tBg < 8000) await new Promise((r) => setTimeout(r, 100));
  const backgroundFillMs = Math.round(performance.now() - tBg);
  const missing = SOUND_DEFS.filter((d) => !wb.get(d.id)?.buffers.length).map((d) => d.id);

  // 2. Main-thread fallback with the 1.5 s budget.
  const m = await measureGaps(() => SoundBank.generate({ sr: 48000, budgetMs: 1500, workers: false }));
  const mb = m.result;
  const missingMain = SOUND_DEFS.filter((d) => !mb.get(d.id)?.buffers.length).map((d) => d.id);

  // 3. createAudio end-to-end (reusing the worker bank) and an AudioBuffer sanity check.
  const audio = await createAudio({ events: new EventBus<GameEvents>(), settings: new Settings(), bank: wb, samples: false });
  const b = wb.get("shatter.glass.l")!.buffers[0];
  const ch = b.getChannelData(0);
  let pk = 0;
  for (let i = 0; i < ch.length; i++) pk = Math.max(pk, Math.abs(ch[i]));
  const st = audio.stats();
  audio.dispose();

  const ok = missing.length === 0 && missingMain.length === 0 && wb.stats.buffers >= expectedBuffers * 0.6 && pk > 0.1;
  if (!ok) throw new Error(`bank incomplete: missing ${missing.join(",")} / ${missingMain.join(",")}`);
  return {
    expectedBuffers,
    defs: SOUND_DEFS.length,
    workers: {
      ms: Math.round(wb.stats.ms),
      mainThreadMs: Math.round(wb.stats.mainMs),
      buffersAtResolve,
      backgroundPending: wb.stats.background,
      buffersAfterBackground: wb.stats.buffers,
      backgroundFillMs,
      MB: +(wb.stats.bytes / 1e6).toFixed(1),
      workers: wb.stats.workers,
      workerFailures: wb.stats.workerFailures,
      skipped: wb.stats.skipped,
      maxFrameGapMs: w.maxGapMs,
      frames: w.frames,
      progressCalls: progress.length,
      progressMonotonic: progress.every((p, i) => i === 0 || p >= progress[i - 1]),
    },
    mainThread: {
      ms: Math.round(mb.stats.ms),
      buffers: mb.stats.buffers,
      skipped: mb.stats.skipped,
      maxFrameGapMs: m.maxGapMs,
      frames: m.frames,
    },
    shatterPeak: +pk.toFixed(3),
    audioState: st.state,
    hardwareConcurrency: navigator.hardwareConcurrency,
  };
}
