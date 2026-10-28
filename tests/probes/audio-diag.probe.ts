// Temporary diagnostic: does the engine's spatial channel pan left/right (equal-power and HRTF)?
import { createAudio } from "../../src/audio/audio.ts";
import { SoundBank } from "../../src/audio/soundbank.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Settings } from "../../src/core/settings.ts";
import { rms, toDb } from "../../src/audio/analysis.ts";

async function prewarm() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  g.gain.value = 0;
  const p = ctx.createPanner();
  p.panningModel = "HRTF";
  osc.connect(g).connect(p).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.5);
  await new Promise((r) => setTimeout(r, 1000));
  await ctx.close();
}

export async function probe() {
  await prewarm();
  const bank = await SoundBank.generate({ sr: 48000, only: (d) => d.id.startsWith("impact.plastic") });
  const out: Record<string, number> = {};
  for (const hrtf of [0, 24]) {
    for (const x of [2, -2]) {
      const oac = new OfflineAudioContext(2, 48000, 48000);
      const a = await createAudio({ events: new EventBus<GameEvents>(), settings: new Settings(), context: oac, bank, samples: false, ambience: false, maxVoices: 16, hrtf });
      a.setListener({ x: 0, y: 1.6, z: 0 } as never, { x: 0, y: 0, z: 1 } as never, { x: 0, y: 1, z: 0 } as never);
      a.play("impact.plastic.m", { x, y: 1.6, z: 0 });
      await Promise.resolve();
      const b = await Promise.race([oac.startRendering(), new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 20000))]);
      const L = b.getChannelData(0),
        R = b.getChannelData(1);
      out[`${hrtf ? "hrtf" : "eq"}_x${x}_RminusL`] = +(toDb(rms(R)) - toDb(rms(L))).toFixed(1);
      out[`${hrtf ? "hrtf" : "eq"}_x${x}_rms`] = +toDb(rms(L) + rms(R)).toFixed(1);
      const lis = oac.listener as AudioListener;
      out[`${hrtf ? "hrtf" : "eq"}_x${x}_lisFz`] = lis.forwardZ ? lis.forwardZ.value : NaN;
      a.dispose();
    }
  }
  return out;
}
