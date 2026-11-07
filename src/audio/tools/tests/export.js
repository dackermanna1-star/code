// Exports a few offline renders as 16-bit WAV (base64) for spectrogram inspection.
(async () => {
  const D = __app.audio.debug, sys = D.system;
  const wav = (b) => {
    const n = b.length, ch = b.numberOfChannels, sr = b.sampleRate, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const W = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    W(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); W(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); W(36, 'data'); v.setUint32(40, n * 2, true);
    const cs = []; for (let c = 0; c < ch; c++) cs.push(b.getChannelData(c));
    for (let i = 0; i < n; i++) { let x = 0; for (let c = 0; c < ch; c++) x += cs[c][i]; x /= ch; v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x * 2)) * 32767, true); }
    let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const base = { cabin: { doorsClosed: true, bridgeConnected: false, boardingMusic: false }, turbulence: 0, inCloud: 0, buffet: 0, spoilers: 0, reverser: 0, brakes: 0, gear: 1, flapsDeg: 0, runwayRumble: 0 };
  const out = {};
  out.takeoff = wav((await D.renderSnapshot({ ...base, phase: 'takeoff', n1: 95, onGround: true, airspeed: 60, groundSpeed: 60, runwayRumble: 1 }, { seconds: 4, raw: true, listener: { x: -1.3, y: 1.15, z: -8 } })).buffer);
  out.cruise = wav((await D.renderSnapshot({ ...base, phase: 'cruise', n1: 84, onGround: false, airspeed: 135, groundSpeed: 230, gear: 0 }, { seconds: 4, raw: true })).buffer);
  out.taxi = wav((await D.renderSnapshot({ ...base, phase: 'taxi_out', n1: 24, onGround: true, airspeed: 8, groundSpeed: 8, runwayRumble: 0.5, apuRunning: false }, { seconds: 4, raw: true })).buffer);
  const oc = new OfflineAudioContext(1, 48000, 48000);
  const { renderFoley } = await import('/src/audio/foley.js');
  for (const n of ['bin_close', 'toilet_flush', 'chime_pa', 'ptu', 'footstep', 'belt_buckle', 'cockpit_knock']) out[n] = wav(renderFoley(oc, n, 0));
  return out;
})()
