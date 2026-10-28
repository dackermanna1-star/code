// Debug probe: intermittent hang of OfflineAudioContext.startRendering() when it contains the page's first
// HRTF PannerNode. MODE "cold": no HRTF before the offline render; "prewarm": an HRTF PannerNode is created and
// fed on the realtime context ~1 s before. Run several times (each run is a fresh page).
// Measured 2026-10-28 (Chromium headless shell, SwiftShader box): cold -> 2 of 6 runs hung (firstHrtfShort AND every
// later HRTF offline render in that page = TIMEOUT); prewarm -> 8 of 8 runs fine.
import { r3, tick } from "./vfx-audio-util.ts";

const MODE: "cold" | "prewarm" = "cold"; // flip to "prewarm" to verify the workaround

async function offlineRender(len: number, model: PanningModelType | null): Promise<{ res: string; ms: number }> {
  const t = performance.now();
  const oc = new OfflineAudioContext({ numberOfChannels: 2, length: len, sampleRate: 44100 });
  const buf = new AudioBuffer({ length: 22050, sampleRate: 44100, numberOfChannels: 1 });
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.sin(i * 0.05) * Math.exp(-i / 5000);
  const s = new AudioBufferSourceNode(oc, { buffer: buf });
  const f = new BiquadFilterNode(oc, { type: "lowpass", frequency: 3000 });
  if (model) s.connect(f).connect(new PannerNode(oc, { panningModel: model, positionX: 1, positionZ: 1 })).connect(oc.destination);
  else s.connect(f).connect(oc.destination);
  s.start(0);
  const res = await Promise.race([oc.startRendering().then(() => "done"), tick(8000).then(() => "TIMEOUT")]);
  return { res, ms: r3(performance.now() - t) };
}

export async function probe(): Promise<any> {
  const out: any = { mode: MODE };
  const ctx = new AudioContext({ sampleRate: 44100 });
  await tick(50);
  if (MODE === "prewarm") {
    const t = performance.now();
    const osc = new OscillatorNode(ctx, { frequency: 440 });
    const g = new GainNode(ctx, { gain: 0 });
    const p = new PannerNode(ctx, { panningModel: "HRTF", positionX: 1 });
    osc.connect(g).connect(p).connect(ctx.destination);
    osc.start();
    await tick(1000);
    osc.stop();
    out.prewarmMs = r3(performance.now() - t);
  }
  out.noHrtf1 = await offlineRender(88200, null);
  out.noHrtf2 = await offlineRender(66150, null);
  out.firstHrtfShort = await offlineRender(4410, "HRTF");
  out.hrtfLong = await offlineRender(88200, "HRTF");
  await ctx.close();
  return out;
}
