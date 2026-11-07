(async () => {
  const A = __app.audio, D = A.debug;
  const base = { cabin: { doorsClosed: true, bridgeConnected: false, boardingMusic: false }, turbulence: 0, inCloud: 0, buffet: 0, spoilers: 0, reverser: 0, brakes: 0, gear: 1, flapsDeg: 0, runwayRumble: 0 };
  const P = {
    gate: { ...base, phase: 'gate', n1: 0, apuRunning: true, onGround: true, airspeed: 0, groundSpeed: 0, cabin: { doorsClosed: false, bridgeConnected: true } },
    gate_closed: { ...base, phase: 'gate', n1: 0, apuRunning: true, onGround: true, airspeed: 0, groundSpeed: 0 },
    taxi: { ...base, phase: 'taxi_out', n1: 24, apuRunning: false, onGround: true, airspeed: 8, groundSpeed: 8, runwayRumble: 0.5 },
    takeoff: { ...base, phase: 'takeoff', n1: 95, apuRunning: false, onGround: true, airspeed: 60, groundSpeed: 60, runwayRumble: 1, flapsDeg: 5 },
    climb: { ...base, phase: 'climb', n1: 90, onGround: false, airspeed: 140, groundSpeed: 170, gear: 0, apuRunning: false },
    cruise: { ...base, phase: 'cruise', n1: 84, onGround: false, airspeed: 135, groundSpeed: 230, gear: 0, apuRunning: false },
    descent: { ...base, phase: 'descent', n1: 32, onGround: false, airspeed: 150, groundSpeed: 200, gear: 0, apuRunning: false },
    approach: { ...base, phase: 'approach', n1: 58, onGround: false, airspeed: 75, groundSpeed: 72, gear: 1, flapsDeg: 30, apuRunning: false },
    rollout_rev: { ...base, phase: 'landing', n1: 75, onGround: true, airspeed: 55, groundSpeed: 55, reverser: 1, spoilers: 1, runwayRumble: 1, brakes: 0.6, apuRunning: false },
  };
  const out = {};
  for (const k in P) { const r = await D.renderSnapshot(P[k], { seconds: 3 }); out[k] = `rms ${r.rmsDb} peak ${r.peakDb} nan ${r.nan} cen ${r.centroid} | ${Object.entries(r.bands).map(([b,v])=>b+':'+v).join(' ')}`; }
  // front vs back of the cabin at cruise and takeoff
  for (const z of [-11, 0, 11]) { const r = await D.renderSnapshot(P.takeoff, { listener: { x: -1.3, y: 1.15, z } }); out['takeoff_z' + z] = r.rmsDb; }
  out.stats = D.stats(); return out;
})()
