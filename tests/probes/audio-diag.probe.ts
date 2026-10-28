// Temporary diagnostic: convolver energy gain for real sounds vs an impulse.
import { IR_SPECS, generateIR } from "../../src/audio/reverb.ts";
import { SoundBank } from "../../src/audio/soundbank.ts";
const E = (d: Float32Array) => { let e = 0; for (let i = 0; i < d.length; i++) e += d[i] * d[i]; return e; };
export async function probe() {
  const bank = await SoundBank.generate({ sr: 48000, only: (d) => d.id === "impact.plastic.m" || d.id === "impact.glass.s" || d.id === "impact.wood.l" });
  const res: Record<string, number> = {};
  const spec = IR_SPECS[1];
  for (const id of ["impact.plastic.m", "impact.glass.s", "impact.wood.l", "impulse"]) {
    const sr = 48000;
    const oac = new OfflineAudioContext(2, sr * 3, sr);
    const ir = generateIR(spec, sr);
    const b = oac.createBuffer(2, ir[0].length, sr);
    b.copyToChannel(ir[0], 0); b.copyToChannel(ir[1], 1);
    const conv = oac.createConvolver(); conv.normalize = false; conv.buffer = b;
    let buf: AudioBuffer;
    if (id === "impulse") { buf = oac.createBuffer(1, 10, sr); buf.getChannelData(0)[0] = 1; } else buf = bank.get(id)!.buffers[0];
    const src = oac.createBufferSource(); src.buffer = buf;
    src.connect(conv).connect(oac.destination); src.start();
    const out = await oac.startRendering();
    let ein = 0; for (let c = 0; c < buf.numberOfChannels; c++) ein += E(buf.getChannelData(c));
    res[id] = +(10 * Math.log10((E(out.getChannelData(0)) + E(out.getChannelData(1))) / ein)).toFixed(2);
    res[id + "_sr"] = buf.sampleRate;
  }
  return res;
}
