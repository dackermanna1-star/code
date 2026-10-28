// Probe 2: play a scripted burst of gameplay events headless (real AudioContext, real time)
// and check: no errors, voices capped, rate limiting/stealing active, loops lifecycle (water,
// strain, sparks buzz, power cut), delayed sounds (debris rattle, fell-out crash), one-shots
// dropped before resume(), loops fading in after resume().
import { createAudio, LoopVoice } from "../../src/audio/audio.ts";
import { SoundBank } from "../../src/audio/soundbank.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import { Settings } from "../../src/core/settings.ts";
import { Rng } from "../../src/core/rng.ts";
import { MATERIALS, type MaterialId } from "../../src/destruction/model/materials.ts";
import { ROOMS, WALLS, roomAt, wallPoint } from "../../src/world/plan.ts";
import type { Vec3 } from "../../src/geom/vec.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Plan-based occlusion: segment vs wall centre lines (openings let sound through). */
export function planOcclusion(a: Vec3, b: Vec3): number {
  let occ = 1;
  for (const w of WALLS) {
    const alongX = Math.abs(w.a[1] - w.b[1]) < 1e-6;
    const [ax, az] = w.a;
    const [bx, bz] = w.b;
    let t: number, u: number;
    if (alongX) {
      if ((a.z - az) * (b.z - az) > 0 || a.z === b.z) continue;
      t = (az - a.z) / (b.z - a.z);
      const x = a.x + (b.x - a.x) * t;
      if (x < Math.min(ax, bx) || x > Math.max(ax, bx)) continue;
      u = x - Math.min(ax, bx);
    } else {
      if ((a.x - ax) * (b.x - ax) > 0 || a.x === b.x) continue;
      t = (ax - a.x) / (b.x - a.x);
      const z = a.z + (b.z - a.z) * t;
      if (z < Math.min(az, bz) || z > Math.max(az, bz)) continue;
      u = z - Math.min(az, bz);
    }
    const y = a.y + (b.y - a.y) * t;
    const open = w.openings.some((o) => u >= o.from && u <= o.to && y >= o.sill && y <= o.head && o.kind !== "window");
    if (!open) occ *= w.kind === "exterior" || w.kind === "party" ? 0.05 : 0.25;
  }
  return occ;
}

export function planRoom(p: Vec3) {
  const r = roomAt(p.x, p.z);
  return r ? { id: r.id, rt60: r.rt60, brightness: r.brightness, wet: r.wet } : null;
}

export async function probe() {
  const errors: string[] = [];
  const origErr = console.error;
  console.error = (...a: unknown[]) => {
    errors.push(a.map(String).join(" "));
    origErr(...a);
  };
  const bank = await SoundBank.generate({ sr: 48000, budgetMs: 4000 });
  const events = new EventBus<GameEvents>();
  const settings = new Settings();
  const audio = await createAudio({ events, settings, bank, samples: false, seed: 3 });
  audio.setRoomResolver(planRoom);
  audio.setOcclusion(planOcclusion);

  // --- before resume(): one-shots dropped, loops virtual.
  audio.play("impact.wood.m", { x: 1, y: 1, z: 1 });
  events.emit("impact", { pos: { x: 6, y: 1, z: 2 }, normal: { x: 0, y: 1, z: 0 }, energy: 50, impulse: 10, speed: 3, matA: "hardwood", matB: "tile", sizeA: 0.5, sizeB: 3, massA: 10, massB: 100, idA: 1, idB: -1 });
  const hum = audio.loop("fridgeHum", { x: 8.9, y: 0.9, z: 8.5 }, { gain: 0.5 }) as LoopVoice;
  const before = audio.stats();
  const humStateBefore = hum.state;

  await audio.resume();
  await sleep(50);
  const lis = { x: 7.4, y: 1.65, z: 2.2 };
  audio.setListener(lis as never, { x: -0.8, y: 0, z: 0.6 } as never, { x: 0, y: 1, z: 0 } as never);
  audio.update(1 / 60);
  const humStateAfter = hum.state;

  const rng = new Rng(11);
  const mats = Object.keys(MATERIALS) as MaterialId[];
  const P = () => ({ x: rng.range(0.5, 12.3), y: rng.range(0, 2.4), z: rng.range(0.5, 8.3) });
  const N = { x: 0, y: 1, z: 0 };
  let maxVoices = 0;
  let maxOneShot = 0;
  let cpuTotal = 0;
  let cpuMax = 0;
  const frameMs: number[] = [];
  const split: Array<[number, number, number]> = [];
  const frames = 300;
  for (let f = 0; f < frames; f++) {
    const t0 = performance.now();
    // Continuous background: a few impacts every frame from many islands.
    for (let i = 0; i < 6; i++) {
      const m = rng.pick(mats);
      events.emit("impact", { pos: P(), normal: N, energy: rng.range(0.001, 40), impulse: 1, speed: 2, matA: m, matB: rng.chance(0.5) ? "tile" : null, sizeA: rng.range(0.01, 1.2), sizeB: 3, massA: rng.range(0.05, 20), massB: 200, idA: rng.int(0, 300), idB: -1 });
    }
    if (f === 20) {
      // Debris shower: 500 impacts in one step (tempered panel dicing onto the floor).
      for (let i = 0; i < 500; i++) events.emit("impact", { pos: { x: 6 + rng.range(-1, 1), y: 0.02, z: 1 + rng.range(-1, 1) }, normal: N, energy: rng.range(0.001, 0.5), impulse: 0.1, speed: 2, matA: "temperedGlass", matB: "hardwood", sizeA: rng.range(0.01, 0.03), sizeB: 4, massA: 0.01, massB: 84, idA: 1000 + i, idB: 5 });
      events.emit("fracture", { pos: { x: 6, y: 1, z: 1 }, dir: N, mat: "temperedGlass", mode: "dice", energy: 300, volume: 0.01, pieces: 40, micro: 300, global: true, size: 1.8, assembly: "Shower panel" });
    }
    if (f === 40) {
      events.emit("fracture", { pos: { x: 8.3, y: 1.5, z: -0.05 }, dir: N, mat: "glass", mode: "shatter", energy: 70, volume: 0.004, pieces: 25, micro: 40, global: true, size: 1.2, assembly: "Living room window" });
      events.emit("fracture", { pos: { x: 4.05, y: 1.2, z: 2 }, dir: N, mat: "gypsum", mode: "crumble", energy: 250, volume: 0.0016, pieces: 6, micro: 30, global: false, size: 2.4, assembly: "Partition wall" });
      events.emit("toolHit", { tool: "sledgehammer", pos: { x: 4.05, y: 1.2, z: 2 }, normal: N, mat: "gypsum", energy: 250, hard: false });
    }
    if (f % 30 === 0) {
      events.emit("toolSwing", { tool: rng.pick(["hands", "hammer", "sledgehammer", "bat", "axe"]), pos: lis, power: rng.next() });
      events.emit("footstep", { pos: { x: lis.x, y: 0, z: lis.z }, mat: rng.pick(["hardwood", "tile", "fabric", "concrete"] as MaterialId[]), speed: 3.6 });
      events.emit("bondBreak", { pos: P(), kind: rng.pick(["screw", "nail", "glue", "weld", "mortar", "hinge", "latch", "fused", "friction"] as const), matA: rng.pick(mats), matB: null, energy: rng.range(5, 80) });
      events.emit("crack", { pos: P(), normal: N, mat: rng.pick(mats), severity: rng.next(), size: 0.5 });
      events.emit("chip", { pos: P(), normal: N, mat: rng.pick(["ceramic", "concrete", "tile"] as MaterialId[]), energy: 20 });
      events.emit("dent", { pos: P(), normal: N, mat: "steelSheet", depth: 0.01, energy: 40, size: 0.4 });
    }
    if (f >= 60 && f < 120) events.emit("strain", { pos: { x: 2.8, y: 1, z: 4.4 }, stress: (f - 60) / 60, kind: "hinge", mat: "hardwood" });
    if (f === 70) events.emit("feature", { kind: "waterStart", pos: { x: 1.0, y: 0.5, z: 8.5 }, intensity: 0.8 });
    if (f === 80) events.emit("feature", { kind: "sparks", pos: { x: 5, y: 1.2, z: 8.7 }, intensity: 1 });
    if (f === 90) events.emit("feature", { kind: "lightBroken", pos: { x: 6.6, y: 2.6, z: 2.4 } });
    if (f === 100) events.emit("feature", { kind: "powerOut", pos: { x: 11, y: 1.5, z: 8.7 } });
    if (f === 110) events.emit("fellOut", { pos: { x: 6, y: -30, z: -3 }, mass: 25, mat: "plastic" });
    if (f === 130) events.emit("split", { pos: P(), mass: 30, pieces: 2 });
    if (f === 150) events.emit("feature", { kind: "powerOn", pos: { x: 11, y: 1.5, z: 8.7 } });
    if (f === 160) events.emit("feature", { kind: "waterStop", pos: { x: 1.0, y: 0.5, z: 8.5 } });
    if (f === 170) {
      events.emit("land", { pos: { x: lis.x, y: 0, z: lis.z }, speed: 6, mat: "hardwood" });
      events.emit("grab", { pos: P(), mass: 12 });
      events.emit("throw", { pos: P(), energy: 120, mass: 5 });
      events.emit("drop", { pos: P() });
      events.emit("feature", { kind: "alarm", pos: P() });
      events.emit("feature", { kind: "screenBroken", pos: P() });
      events.emit("feature", { kind: "motorStop", pos: P() });
      events.emit("feature", { kind: "lightFlicker", pos: P() });
    }
    // Malformed / hostile input must not throw.
    if (f === 180) {
      events.emit("impact", { pos: { x: NaN, y: 0, z: 0 }, normal: N, energy: NaN, impulse: NaN, speed: NaN, matA: "nope" as MaterialId, matB: null, sizeA: NaN, sizeB: NaN, massA: NaN, massB: NaN, idA: NaN, idB: NaN });
      events.emit("fracture", { pos: P(), dir: N, mat: "glass", mode: "shatter", energy: -1, volume: NaN, pieces: NaN, micro: -5, global: true, size: NaN, assembly: "" });
      audio.play("does.not.exist", null);
      audio.play("impact.wood", P(), { gain: NaN, size: -1, pitch: Infinity });
      audio.loop("nope", null).stop();
    }
    const tU = performance.now();
    audio.setListener(lis as never, { x: Math.sin(f * 0.02), y: 0, z: Math.cos(f * 0.02) } as never, { x: 0, y: 1, z: 0 } as never);
    audio.update(1 / 60);
    await Promise.resolve(); // include the microtask flush in the measurement
    const dt = performance.now() - t0;
    if (f !== 20) cpuMax = Math.max(cpuMax, dt);
    if (dt > 20) split.push([f, +(tU - t0).toFixed(1), +(performance.now() - tU).toFixed(1)]);
    frameMs.push(dt);
    cpuTotal += dt;
    const st = audio.stats();
    maxVoices = Math.max(maxVoices, st.voices);
    maxOneShot = Math.max(maxOneShot, st.voices - st.realLoops);
    await sleep(16);
  }
  await sleep(2500); // let the delayed fell-out crash play
  audio.update(1 / 60);
  const end = audio.stats();
  hum.stop(0.2);

  // Disabled path: empty bank (no Web Audio) — everything is a no-op and never throws.
  const silent = await createAudio({ events: new EventBus<GameEvents>(), settings, bank: new SoundBank(48000), samples: false });
  await silent.resume();
  silent.play("impact.wood.m", { x: 0, y: 0, z: 0 });
  silent.loop("fridge.hum", null).setGain(1);
  silent.update(0.016);
  const silentState = silent.stats().state;

  // ---- Regressions (review findings) -------------------------------------------------------
  const A = audio as unknown as Record<string, any>;
  const flushNow = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };
  await sleep(400);
  audio.update(1 / 60);
  // (a) Priority-aware family limits: distant small debris must not eat the tokens of a loud
  //     close hit. 20 small hardwood impacts 8 m away, then a 300 J hit 0.5 m from the listener.
  const far = { x: lis.x - 8, y: 0.5, z: lis.z };
  for (let i = 0; i < 20; i++) events.emit("impact", { pos: far, normal: N, energy: 0.5, impulse: 0.2, speed: 1, matA: "hardwood", matB: "hardwood", sizeA: 0.3, sizeB: 0.3, massA: 1, massB: 1, idA: 5000 + i, idB: 6000 + i });
  await flushNow();
  const lim0 = audio.stats().limited;
  events.emit("impact", { pos: { x: lis.x + 0.5, y: 1.2, z: lis.z }, normal: N, energy: 300, impulse: 50, speed: 6, matA: "hardwood", matB: null, sizeA: 0.8, sizeB: 0, massA: 15, massB: 0, idA: 7000, idB: -1 });
  await flushNow();
  const bigHitLimited = audio.stats().limited - lim0;
  // (b) A non-finite pitch must not throw nor discard the other voices of the batch.
  const errs0 = errors.length;
  const played0 = audio.stats().played;
  audio.play("impact.ceramic.m", { x: lis.x + 1, y: 1.2, z: lis.z }, { pitch: NaN });
  audio.play("impact.glass.m", { x: lis.x - 1, y: 1.2, z: lis.z });
  audio.play("impact.metal.m", { x: lis.x, y: 1.2, z: lis.z + 1 });
  const nanLoop = audio.loop("fridge.hum", { x: lis.x, y: 1, z: lis.z + 1 }, { pitch: NaN, gain: NaN });
  await flushNow();
  audio.update(1 / 60);
  await sleep(150);
  audio.update(1 / 60);
  nanLoop.stop(0);
  const nanPitchPlayed = audio.stats().played - played0;
  const nanPitchErrors = errors.length - errs0;
  // (c) Two joints strained at once get their own creak loops, realised immediately.
  events.emit("strain", { pos: { x: 2.8, y: 1, z: 4.4 }, stress: 0.7, kind: "hinge", mat: "hardwood" });
  events.emit("strain", { pos: { x: 6.5, y: 1, z: 4.4 }, stress: 0.6, kind: "hinge", mat: "steel" });
  const strainLoops = (A.strains as Map<string, { lv: LoopVoice }>).size;
  const strainsRealised = [...(A.strains as Map<string, { lv: LoopVoice }>).values()].every((s) => s.lv.state === 1);
  // (d) setMasterVolume survives unrelated settings changes, yields to a masterVolume change.
  audio.setMasterVolume(0);
  settings.set("fov", settings.data.fov);
  settings.set("cameraShake", settings.data.cameraShake);
  const masterHeldAfterUnrelated = A.masterUser === 0;
  settings.set("masterVolume", Math.min(1, (settings.data.masterVolume ?? 1) * 0.9));
  const masterYieldsToSetting = A.masterUser === -1;
  // (e) Strikes / toolHit bypass family limits (flesh on hard: thud + transient + ouch).
  const lim1 = audio.stats().limited;
  for (let i = 0; i < 30; i++) events.emit("toolHit", { tool: "hands", pos: { x: lis.x + 0.4, y: 1.4, z: lis.z }, normal: N, mat: "concrete", energy: 60, hard: true });
  await flushNow();
  const toolHitsLimited = audio.stats().limited - lim1;

  audio.dispose();
  // (f) dispose(): graph torn down, queues cleared, later settings changes ignored, no throws.
  settings.set("sfxVolume", settings.data.sfxVolume);
  audio.play("impact.wood.m", { x: 0, y: 1, z: 0 });
  audio.update(1 / 60);
  const disposedClean = A.channels.length === 0 && A.pending.length === 0 && A.delayed.length === 0 && A.master === null && A.ctx === null;
  console.error = origErr;

  const result = {
    beforeResume: { played: before.played, humState: humStateBefore },
    afterResume: { humState: humStateAfter, state: end.state },
    maxVoices,
    maxOneShotVoices: maxOneShot,
    audioMsPerFrameAvg: +(cpuTotal / frames).toFixed(3),
    audioMsPerFrameMaxExclShower: +cpuMax.toFixed(2),
    slowSplit_frame_emitMs_updateMs: split,
    audioMsMedian: +[...frameMs].sort((a, b) => a - b)[frameMs.length >> 1].toFixed(3),
    slowestFrames: frameMs.map((v, i) => [i, +v.toFixed(1)] as [number, number]).sort((a, b) => b[1] - a[1]).slice(0, 8),
    played: end.played,
    dropped: end.dropped,
    stolen: end.stolen,
    limited: end.limited,
    rays: end.rays,
    loopsAtEnd: end.loops,
    realLoopsAtEnd: end.realLoops,
    wind: +end.wind.toFixed(2),
    powered: end.powered,
    listenerRoom: end.listenerRoom,
    silentState,
    regressions: { bigHitLimited, nanPitchPlayed, nanPitchErrors, strainLoops, strainsRealised, masterHeldAfterUnrelated, masterYieldsToSetting, toolHitsLimited, disposedClean },
    errors,
    rooms: ROOMS.length,
    wallPoint: wallPoint(WALLS[0], 1)[0],
  };
  if (before.played !== 0) throw new Error("one-shot played before resume()");
  if (humStateBefore !== 0 || humStateAfter !== 1) throw new Error(`loop states ${humStateBefore}/${humStateAfter}`);
  if (maxOneShot > 48) throw new Error(`voice cap exceeded: ${maxOneShot}`);
  if (errors.length) throw new Error("console errors: " + errors.join(" | "));
  const R = result.regressions;
  if (R.bigHitLimited !== 0) throw new Error("loud close hit was rate-limited after distant debris");
  if (R.nanPitchErrors !== 0 || R.nanPitchPlayed < 3) throw new Error(`NaN pitch broke the batch: ${JSON.stringify(R)}`);
  if (R.strainLoops !== 2 || !R.strainsRealised) throw new Error(`strain loops ${JSON.stringify(R)}`);
  if (!R.masterHeldAfterUnrelated || !R.masterYieldsToSetting) throw new Error(`master volume ${JSON.stringify(R)}`);
  if (R.toolHitsLimited !== 0) throw new Error("toolHit layers were rate-limited");
  if (!R.disposedClean) throw new Error("dispose() left state behind");
  if (end.played < 100 || end.limited < 50) throw new Error(`unexpected counts ${JSON.stringify(result)}`);
  return result;
}
