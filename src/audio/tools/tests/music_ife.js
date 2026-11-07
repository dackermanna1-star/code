// Boarding music at the gate (PA bus level), IFE media routing (connectMedia -> ifeBus), say() fallback.
(async () => {
  const app = __app, A = app.audio, sys = A.debug.system, ctx = A.context, out = {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  app.pipeline.render = () => {};
  A.unlock();
  const tap = (node) => { const an = ctx.createAnalyser(); an.fftSize = 4096; node.connect(an); return an; };
  const meas = async (an, ms = 3000) => { const b = new Float32Array(an.fftSize); let s = 0, n = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { an.getFloatTimeDomainData(b); for (const v of b) s += v * v; n += b.length; await wait(100); } return +(10 * Math.log10(s / n + 1e-20)).toFixed(1); };
  const musicTap = tap(sys.music.out);
  app.flight.jumpTo('gate', 0.02); await wait(1500);
  out.boardingMusicFlag = app.flight.state.cabin.boardingMusic;
  out.musicRmsDb = await meas(musicTap, 5000);
  out.announcing = A.debug.stats().announcing;
  // IFE: an <audio> element with a generated 440 Hz WAV
  const sr = 22050, n = sr * 2, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const W = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  W(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); W(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); W(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 440 * i / sr) * 12000, true);
  const el = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))); el.loop = true;
  const node1 = A.connectMedia(el), node2 = A.connectMedia(el);
  out.mediaCached = node1 === node2 && !!node1;
  const ifeTap = tap(A.ifeBus);
  A.setHeadphones(true);
  try { await el.play(); } catch (e) { out.playErr = String(e); }
  out.ifeRmsDb = await meas(ifeTap, 1500);
  el.pause(); A.setHeadphones(false);
  out.sayDuration = A.say('Test announcement from the audio module.', 'captain');
  out.unknown = A.play('definitely_not_a_sound') === null;
  return out;
})()
