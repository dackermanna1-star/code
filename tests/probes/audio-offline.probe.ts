// Probe 3: render sounds through the FULL engine graph (voices → filters → HRTF → reverb →
// compressor) with OfflineAudioContext and check simple spectral / spatial properties.
// Returns metrics plus base64 WAVs (written to the scratchpad by the runner script).
import { createAudio, type Audio } from "../../src/audio/audio.ts";
import { SoundBank } from "../../src/audio/soundbank.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Settings } from "../../src/core/settings.ts";
import type { RoomAcoustics } from "../../src/core/context.ts";
import type { Vec3 } from "../../src/geom/vec.ts";
import { spectralCentroid, fundamentalEstimate, effectiveDuration, rms, peak, toDb } from "../../src/audio/analysis.ts";
import { encodeWav, toBase64 } from "../../src/audio/wav.ts";

const SR = 48000;
const ROOM: Record<string, RoomAcoustics> = {
  bath: { id: "bath", rt60: 1.1, brightness: 0.85, wet: 0.45 },
  bed2: { id: "bed2", rt60: 0.3, brightness: 0.3, wet: 0.15 },
  living: { id: "living", rt60: 0.55, brightness: 0.5, wet: 0.22 },
};

interface Scene {
  dur: number;
  /** Use HRTF panning (only after the realtime pre-warm). */
  hrtf?: boolean;
  room?: RoomAcoustics;
  occ?: (a: Vec3, b: Vec3) => number;
  setup: (a: Audio, ev: EventBus<GameEvents>) => void;
}

let bank: SoundBank;

async function render(s: Scene): Promise<Float32Array[]> {
  for (const e of bank.entries.values()) e.last = -1; // identical variant choice in every render
  const oac = new OfflineAudioContext(2, Math.ceil(s.dur * SR), SR);
  const events = new EventBus<GameEvents>();
  const a = await createAudio({ events, settings: new Settings(), context: oac, bank, samples: false, ambience: false, maxVoices: 24, seed: 1, hrtf: s.hrtf ? 24 : 0 });
  const room = s.room ?? ROOM.living;
  a.setRoomResolver(() => room);
  if (s.occ) a.setOcclusion(s.occ);
  a.setListener({ x: 0, y: 1.6, z: 0 } as never, { x: 0, y: 0, z: 1 } as never, { x: 0, y: 1, z: 0 } as never);
  a.update(0);
  s.setup(a, events);
  await Promise.resolve(); // microtask flush schedules the voices at t≈0
  await new Promise((r) => setTimeout(r, 0));
  // Race against a timeout: an offline HRTF render can hang (docs/api-notes/vfx-audio.md §6).
  const out = await Promise.race([oac.startRendering(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("offline render timeout")), 30000))]);
  a.dispose();
  return [out.getChannelData(0).slice(), out.getChannelData(1).slice()];
}

const mono = (c: Float32Array[]) => {
  const m = new Float32Array(c[0].length);
  for (let i = 0; i < m.length; i++) m[i] = 0.5 * (c[0][i] + c[1][i]);
  return m;
};
const front = { x: 0, y: 1.6, z: 1.2 };
const N = { x: 0, y: 1, z: 0 };
const impact = (e: Partial<GameEvents["impact"]>): GameEvents["impact"] => ({ pos: front, normal: N, energy: 30, impulse: 5, speed: 3, matA: "hardwood", matB: null, sizeA: 0.3, sizeB: 0, massA: 5, massB: 0, idA: 1, idB: -1, ...e });

/** Pre-warm HRTF on a realtime context (fixes offline HRTF hangs, see the API note). */
async function prewarmHrtf(): Promise<void> {
  // The HRTF database is loaded per sample rate: warm it at the offline rate.
  const ctx = new AudioContext({ sampleRate: SR });
  const osc = ctx.createOscillator();
  const mute = ctx.createGain();
  mute.gain.value = 0;
  const p = ctx.createPanner();
  p.panningModel = "HRTF";
  p.positionX.value = 1;
  osc.connect(mute).connect(p).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.5);
  await new Promise((r) => setTimeout(r, 1000));
  await ctx.close();
}

export async function probe() {
  await prewarmHrtf();
  bank = await SoundBank.generate({ sr: SR, budgetMs: 1e9 });
  const wav: Record<string, string> = {};
  const keep = (name: string, c: Float32Array[]) => (wav[name] = toBase64(encodeWav(c, SR)));
  const m: Record<string, number | string | boolean> = {};

  // 1. Glass is brighter than wood (same size class, same position).
  const glass = await render({ dur: 1.5, setup: (a) => a.play("impact.glass.m", front) });
  const wood = await render({ dur: 1.5, setup: (a) => a.play("impact.wood.m", front) });
  m.centroidGlass = Math.round(spectralCentroid(mono(glass), SR));
  m.centroidWood = Math.round(spectralCentroid(mono(wood), SR));
  keep("glass_knock", glass);
  keep("wood_knock", wood);

  // 2. Larger object → lower pitch (metal family, size-driven class + pitch correction).
  const f0: number[] = [];
  for (const size of [0.08, 0.3, 1.1]) {
    const r = await render({ dur: 2.5, room: ROOM.bed2, setup: (a) => a.play("impact.metal", front, { size }) });
    f0.push(Math.round(fundamentalEstimate(mono(r), SR)));
    if (size === 0.3) keep("metal_m", r);
  }
  m.metalF0 = f0.join(" > ");

  // 3. Shatter (window pane fracture event) lasts longer than a knock (wood impact event).
  const shatter = await render({
    dur: 2.5,
    setup: (_a, ev) => {
      ev.emit("impact", impact({ energy: 70, matA: "glass", matB: "steel", sizeA: 1.2, sizeB: 0.03 }));
      ev.emit("fracture", { pos: front, dir: N, mat: "glass", mode: "shatter", energy: 70, volume: 0.0048, pieces: 25, micro: 40, global: true, size: 1.2, assembly: "Window" });
    },
  });
  const knock = await render({ dur: 2.5, setup: (_a, ev) => ev.emit("impact", impact({ energy: 30, matA: "hardwood", matB: "hardwood", sizeA: 0.4, sizeB: 0.4 })) });
  m.durShatter = +effectiveDuration(mono(shatter), SR, -40).toFixed(2);
  m.durKnock = +effectiveDuration(mono(knock), SR, -40).toFixed(2);
  keep("window_shatter", shatter);
  keep("wood_on_wood", knock);

  // 4. Occlusion: the same sledgehammer blow through a wall is quieter and duller.
  const sledge = (_a: Audio, ev: EventBus<GameEvents>) => {
    const p = { x: 0, y: 1.6, z: 3 };
    ev.emit("impact", impact({ pos: p, energy: 250, matA: "gypsum", matB: "steel", sizeA: 2.4, sizeB: 0.06, massA: 25 }));
    ev.emit("fracture", { pos: p, dir: N, mat: "gypsum", mode: "crumble", energy: 250, volume: 0.0016, pieces: 5, micro: 30, global: false, size: 2.4, assembly: "Partition" });
  };
  const clear = await render({ dur: 2, setup: sledge, occ: () => 1 });
  const blocked = await render({ dur: 2, setup: sledge, occ: () => 0.05 });
  m.occlusionDropDb = +(toDb(rms(mono(blocked))) - toDb(rms(mono(clear)))).toFixed(1);
  m.centroidClear = Math.round(spectralCentroid(mono(clear), SR));
  m.centroidBlocked = Math.round(spectralCentroid(mono(blocked), SR));
  keep("sledge_drywall_clear", clear);
  keep("sledge_drywall_occluded", blocked);

  // 5. Room reverb: a tiled bathroom rings much longer than the carpeted bedroom.
  const tail = (c: Float32Array[]) => {
    const x = mono(c);
    const s = Math.floor(0.35 * SR);
    return toDb(rms(x, s, s + Math.floor(0.3 * SR)) / Math.max(rms(x, 0, s), 1e-9));
  };
  const clap = (a: Audio) => a.play("impact.wood.s", { x: 0, y: 1.6, z: 2 });
  const bath = await render({ dur: 2, room: ROOM.bath, setup: clap });
  const bed = await render({ dur: 2, room: ROOM.bed2, setup: clap });
  m.tailBathDb = +tail(bath).toFixed(1);
  m.tailBedDb = +tail(bed).toFixed(1);
  keep("knock_bathroom", bath);
  keep("knock_bedroom", bed);

  // 6. HRTF: a source on the listener's right is louder in the right ear (onset window: the
  //    precedence effect localises on the direct sound, before the reverb builds up).
  const right = await render({ dur: 1, hrtf: true, room: ROOM.bed2, setup: (a) => a.play("impact.glass.s", { x: 2, y: 1.6, z: 0 }) });
  const on = Math.floor(0.03 * SR);
  m.hrtfRightMinusLeftDb = +(toDb(rms(right[1], 0, on)) - toDb(rms(right[0], 0, on))).toFixed(1); // informational (offline HRTF is unreliable headless)
  const rightEq = await render({ dur: 1, room: ROOM.bed2, setup: (a) => a.play("impact.glass.s", { x: 2, y: 1.6, z: 0 }) });
  m.rightMinusLeftDb = +(toDb(rms(rightEq[1], 0, on)) - toDb(rms(rightEq[0], 0, on))).toFixed(1);

  // 6b. Reverb-to-direct energy at 1 m per room (wet render minus a dry render).
  const energy = (c: Float32Array[]) => {
    let e = 0;
    for (const ch of c) for (let i = 0; i < ch.length; i++) e += ch[i] * ch[i];
    return e;
  };
  const dryRoom = { id: "dry", rt60: 0.3, brightness: 0.3, wet: 0 };
  const knockAt1 = (a: Audio) => a.play("impact.wood.m", { x: 0, y: 1.6, z: 1 });
  const eDry = energy(await render({ dur: 2, room: dryRoom, setup: knockAt1 }));
  for (const k of ["bath", "living", "bed2"]) {
    const eWet = energy(await render({ dur: 2, room: ROOM[k], setup: knockAt1 }));
    m[`reverbToDirectDb_${k}`] = +(10 * Math.log10(Math.max(eWet - eDry, 1e-12) / eDry)).toFixed(1);
  }

  // 7. Loudness ordering via gameplay events.
  const lvl = async (setup: Scene["setup"]) => toDb(peak(mono(await render({ dur: 1.5, room: ROOM.bed2, setup }))));
  m.peakSledgeDrywallDb = +(await lvl(sledge)).toFixed(1);
  m.peakPunchDb = +(await lvl((_a, ev) => ev.emit("impact", impact({ pos: { x: 0, y: 1.6, z: 0.7 }, energy: 60, matA: "gypsum", matB: "flesh", sizeA: 2.4, sizeB: 0.08, massA: 25 })))).toFixed(1);
  m.peakMugDropDb = +(await lvl((_a, ev) => ev.emit("impact", impact({ pos: { x: 0, y: 0.05, z: 1 }, energy: 3.4, matA: "ceramic", matB: "tile", sizeA: 0.1, sizeB: 3, massA: 0.35, massB: 90 })))).toFixed(1);
  m.peakFootstepDb = +(await lvl((_a, ev) => ev.emit("footstep", { pos: { x: 0, y: 0, z: 0 }, mat: "hardwood", speed: 3.6 }))).toFixed(1);
  m.peakPenDb = +(await lvl((_a, ev) => ev.emit("impact", impact({ pos: { x: 0, y: 0.05, z: 1 }, energy: 0.07, matA: "plastic", matB: "hardwood", sizeA: 0.14, sizeB: 3, massA: 0.01, massB: 84 })))).toFixed(1);

  // 8. Distance: 8 m away is quieter, duller and arrives ~20 ms later.
  const near = await render({ dur: 1, room: ROOM.bed2, setup: (a) => a.play("impact.ceramic.m", { x: 0, y: 1.6, z: 1 }) });
  const far = await render({ dur: 1, room: ROOM.bed2, setup: (a) => a.play("impact.ceramic.m", { x: 0, y: 1.6, z: 8 }) });
  const onset = (x: Float32Array) => {
    const pk = peak(x) * 0.05;
    for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > pk) return i / SR;
    return 0;
  };
  m.farMinusNearDb = +(toDb(rms(mono(far))) - toDb(rms(mono(near)))).toFixed(1);
  m.farDelayMs = +((onset(mono(far)) - onset(mono(near))) * 1000).toFixed(1);

  // 9. A small composite scene for listening: tempered shower panel dicing, debris rattle, steps.
  const scene = await render({
    dur: 4,
    room: ROOM.bath,
    setup: (a, ev) => {
      ev.emit("fracture", { pos: { x: 1, y: 1.2, z: 2 }, dir: N, mat: "temperedGlass", mode: "dice", energy: 300, volume: 0.01, pieces: 40, micro: 300, global: true, size: 1.8, assembly: "Shower panel" });
      ev.emit("toolSwing", { tool: "sledgehammer", pos: { x: 0.3, y: 1.5, z: 0.5 }, power: 1 });
    },
  });
  keep("tempered_shower_bathroom", scene);

  const checks = {
    glassBrighterThanWood: (m.centroidGlass as number) > (m.centroidWood as number) * 1.3,
    biggerIsLower: f0[0] > f0[1] && f0[1] > f0[2],
    shatterLongerThanKnock: (m.durShatter as number) > 2 * (m.durKnock as number),
    occlusionQuieter: (m.occlusionDropDb as number) < -8,
    occlusionDuller: (m.centroidBlocked as number) < (m.centroidClear as number) * 0.6,
    bathroomRingsLonger: (m.tailBathDb as number) > (m.tailBedDb as number) + 6,
    rightEarLouder: (m.rightMinusLeftDb as number) > 10,
    loudnessOrder: (m.peakSledgeDrywallDb as number) > (m.peakPunchDb as number) && (m.peakPunchDb as number) > (m.peakMugDropDb as number) && (m.peakMugDropDb as number) > (m.peakPenDb as number) && (m.peakFootstepDb as number) > (m.peakPenDb as number),
    distanceQuieter: (m.farMinusNearDb as number) < -8,
    distanceDelayed: (m.farDelayMs as number) > 15 && (m.farDelayMs as number) < 30,
  };
  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  return { ok: failed.length === 0, failed, checks, metrics: m, wav };
}
