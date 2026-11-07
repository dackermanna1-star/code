(async () => {
  const D = __app.audio.debug;
  const base = { cabin: { doorsClosed: true, bridgeConnected: false, boardingMusic: false }, turbulence: 0, inCloud: 0, buffet: 0, spoilers: 0, reverser: 0, brakes: 0, gear: 1, flapsDeg: 0, runwayRumble: 0 };
  const P = {
    gate: { ...base, phase: 'gate', n1: 0, apuRunning: true, onGround: true, airspeed: 0, groundSpeed: 0, cabin: { doorsClosed: false, bridgeConnected: true } },
    taxi: { ...base, phase: 'taxi_out', n1: 24, apuRunning: false, onGround: true, airspeed: 8, groundSpeed: 8, runwayRumble: 0.5 },
    takeoff: { ...base, phase: 'takeoff', n1: 95, apuRunning: false, onGround: true, airspeed: 60, groundSpeed: 60, runwayRumble: 1, flapsDeg: 5 },
    cruise: { ...base, phase: 'cruise', n1: 84, onGround: false, airspeed: 135, groundSpeed: 230, gear: 0, apuRunning: false },
    approach: { ...base, phase: 'approach', n1: 58, onGround: false, airspeed: 75, groundSpeed: 72, gear: 1, flapsDeg: 30, apuRunning: false },
  };
  const out = {};
  for (const k in P) for (const only of [null, ['engines'], ['ambience'], ['effects']]) {
    const r = await D.renderSnapshot(P[k], { seconds: 2.2, only });
    out[k + ':' + (only ? only[0] : 'all')] = `rms ${r.rmsDb} cen ${r.centroid} | ${Object.entries(r.bands).map(([b,v])=>b+':'+v).join(' ')}`;
  }
  return out;
})()
