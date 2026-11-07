(async () => {
  const A = __app.audio, D = A.debug, out = {};
  const base = { cabin: { doorsClosed: true, bridgeConnected: false, boardingMusic: false }, turbulence: 0, inCloud: 0, buffet: 0, spoilers: 0, reverser: 0, brakes: 0, gear: 1, flapsDeg: 0, runwayRumble: 0 };
  const gate = { ...base, phase: 'gate', n1: 0, apuRunning: true, onGround: true, airspeed: 0, groundSpeed: 0 };
  const L = { x: -1.0, y: 1.6, z: -13.6 };
  out.gate_door_open_nearDoor = (await D.renderSnapshot({ ...gate, cabin: { doorsClosed: false, bridgeConnected: true } }, { listener: L })).rmsDb;
  out.gate_door_closed_nearDoor = (await D.renderSnapshot({ ...gate, cabin: { doorsClosed: true, bridgeConnected: false } }, { listener: L })).rmsDb;
  out.gate_rear = (await D.renderSnapshot(gate, { listener: { x: 0, y: 1.6, z: 11.5 } })).rmsDb;
  out.taxi = (await D.renderSnapshot({ ...base, phase: 'taxi_out', n1: 24, onGround: true, airspeed: 8, groundSpeed: 8, runwayRumble: 0.5 })).rmsDb;
  out.approach = (await D.renderSnapshot({ ...base, phase: 'approach', n1: 58, onGround: false, airspeed: 75, groundSpeed: 72, gear: 1, flapsDeg: 30 })).rmsDb;
  out.cruise_cloud_turb = (await D.renderSnapshot({ ...base, phase: 'cruise', n1: 84, onGround: false, airspeed: 135, groundSpeed: 230, gear: 0, inCloud: 1, turbulence: 0.6 })).rmsDb;
  out.cinematic_takeoff = (await D.renderSnapshot({ ...base, phase: 'takeoff', n1: 95, onGround: true, airspeed: 60, groundSpeed: 60, runwayRumble: 1, exterior: 1 })).rmsDb;
  out.foley = {};
  for (const n of A.foleyNames) { const r = await D.renderFoley(n); out.foley[n] = `${r.duration}s pk ${r.peakDb} rms ${r.rmsDb} cen ${r.centroid} nan ${r.nan} lvl ${r.level}`; }
  out.ann = {};
  const ids = Object.keys((await (await fetch('assets/audio/announcements/index.json')).json()));
  for (const id of ids) { const r = await D.analyzeAnnouncement(id); out.ann[id] = `decoded ${r.decoded} index ${r.index} sent ${r.sentences} rms ${r.rmsDb} pk ${r.peakDb} cen ${r.centroid}`; }
  out.playUnknown = (() => { try { A.play('no_such_sound', {}); A.play(undefined); A.play('footstep', { position: { x: 0, y: 0, z: 0 }, surface: 'vinyl' }); return 'ok'; } catch (e) { return 'THREW ' + e; } })();
  out.stats = D.stats();
  return out;
})()
