// Runs segments of the real flight at increased time scale and records which one-shots the
// aircraft sound engine fires (engine light-off, joint thumps, gear, PTU, touchdown, reverser...).
(async () => {
  const app = __app, A = app.audio, sys = A.debug.system, out = {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  app.pipeline.render = () => {};
  A.unlock();
  let log = {};
  const orig = sys.shot.bind(sys);
  sys.shot = (n, o) => { log[n] = (log[n] || 0) + 1; return orig(n, o); };
  const evs = [];
  for (const e of ['flight:engineStart', 'flight:gear', 'flight:touchdown', 'flight:reverse', 'flight:spoilers', 'flight:liftoff', 'cabin:announcement', 'cabin:chime']) app.events.on(e, (p) => evs.push(e + ' ' + JSON.stringify(p).slice(0, 60)));
  const seg = async (phase, prog, secs, ts) => {
    log = {}; evs.length = 0;
    app.flight.jumpTo(phase, prog); app.timeScale = ts;
    await wait(secs * 1000);
    const st = app.flight.state;
    out[phase] = { endPhase: st.phase, shots: { ...log }, events: evs.slice(0, 14), n1: st.engines.map((e) => e.n1.toFixed(0)), gs: st.groundSpeed.toFixed(1), gear: st.gear.toFixed(2) };
  };
  await seg('gate', 0.1, 15, 3);
  await seg('pushback', 0, 25, 4);
  await seg('takeoff', 0.3, 45, 4);
  await seg('approach', 0.9, 50, 3);
  app.timeScale = 1;
  out.stats = A.debug.stats();
  return out;
})()
