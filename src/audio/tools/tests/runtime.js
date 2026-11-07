// Live runtime test: real AudioContext + flight director. Taps the master output with an
// AnalyserNode (the harness mutes the master, so the test un-mutes it) and measures the RMS
// while skipping through the phases; exercises the foley vocabulary, announcements, zones,
// headphones and pause ducking. Run: node src/audio/tools/audio-test.mjs src/audio/tools/tests/runtime.js
(async () => {
  const app = __app, A = app.audio, sys = A.debug.system, ctx = A.context, out = { events: [] };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  sys.master.gain.cancelScheduledValues(0); sys.master.gain.value = 0.9;
  const an = ctx.createAnalyser(); an.fftSize = 8192; sys.limiter.connect(an);
  const buf = new Float32Array(an.fftSize);
  const rms = async (ms = 2500) => {
    let s = 0, n = 0, pk = 0; const t0 = performance.now();
    while (performance.now() - t0 < ms) { an.getFloatTimeDomainData(buf); for (const v of buf) { s += v * v; pk = Math.max(pk, Math.abs(v)); } n += buf.length; await wait(120); }
    return `${(10 * Math.log10(s / n + 1e-20)).toFixed(1)} dB (pk ${(20 * Math.log10(pk + 1e-9)).toFixed(1)})`;
  };
  for (const e of ['cabin:announcement', 'cabin:announcementEnd', 'ife:paFor']) app.events.on(e, (p) => out.events.push(`${e} ${p.id} ${p.duration ? p.duration.toFixed(2) : ''} ${p.sentences ? p.sentences.length + ' sent' : ''}`));
  out.ctxState = ctx.state;
  app.pipeline.render = () => {};   // headless: skip rendering so the simulation runs in real time
  const f0 = app.frame, t0 = performance.now();
  A.unlock();
  await wait(500);
  // foley vocabulary
  const names = ['bin_open', 'bin_close', 'tray_open', 'tray_close', 'belt_buckle', 'belt_unbuckle', 'switch_click', 'button_press', 'shade_up', 'shade_down', 'lav_door', 'lav_lock', 'toilet_flush', 'tap_water', 'drawer', 'cart', 'footstep', 'seat_sit', 'seat_stand', 'armrest', 'recline', 'gasper', 'oven_door', 'cabin_door', 'cockpit_knock', 'chime_pa', 'chime_seatbelt', 'chime_call', 'paper'];
  for (const n of names) A.play(n, { position: { x: 0.5, y: 1.5, z: app.camera.position.z - 1 }, volume: 1, rate: 1 });
  out.voicesAfterFoley = A.debug.stats().voices;
  // phases (director skipTo uses a fade: give it time)
  const ph = {};
  ph.gate = await rms();
  for (const p of ['taxi_out', 'takeoff', 'cruise', 'approach']) {
    app.flight.jumpTo(p, p === 'takeoff' ? 0.35 : 0.5); await wait(3000);
    ph[p] = `${app.flight.state.phase} N1 ${app.flight.state.engines[0].n1.toFixed(0)} v ${app.flight.state.airspeed.toFixed(0)}: ` + await rms();
  }
  out.phases = ph;
  // headphones / lav / pause
  A.setHeadphones(true); await wait(800); out.cruiseHeadphones = await rms(1500); A.setHeadphones(false);
  A.setZone('lav-fwd'); await wait(800); out.approachInLav = await rms(1500); A.setZone('economy');
  app.paused = true; await wait(1200); out.paused = await rms(1500); app.paused = false;
  // announcement through the real queue (director may also be announcing)
  app.events.emit('cabin:announce', { id: 'doors_armed' });
  await wait(9000);
  out.fps = ((app.frame - f0) / ((performance.now() - t0) / 1000)).toFixed(1);
  out.stats = A.debug.stats();
  out.say = typeof A.say;
  return out;
})()
