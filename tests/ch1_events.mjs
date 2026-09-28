// Chapter 1 scripted events: intro chopper/objective, burning-apartment voice trigger,
// shaft mob trigger, car alarms (director panic), burn deaths, safe-room objective.
export default async ({ page, evalg, wait, logs }) => {
  page.on('crash', () => console.log('PAGE CRASHED'));
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const step = (name, fn) => evalg(([name, src]) => {
    const g = window.game;
    try { return name + ': ' + JSON.stringify((0, eval)('(' + src + ')')(g, g.level, window.session)); } catch (e) { return name + ': ERR ' + e.message + ' | ' + (e.stack || '').split('\n').slice(0, 5).join(' | '); }
  }, [name, fn.toString()]).then((r) => console.log(r));
  await step('setup', (g) => {
    g.cheats.god = true;
    // record objectives / voice lines / panics
    window.__ev = { obj: [], say: [], panic: [], mobs: [] };
    const so = window.session.objective.bind(window.session);
    window.session.objective = (t, s) => { window.__ev.obj.push(t); return so(t, s); };
    const sy = g.voice.say.bind(g.voice);
    g.voice.say = (s, cat, pr, o) => { window.__ev.say.push(cat + (o?.text ? ':' + o.text.slice(0, 20) : '')); return sy(s, cat, pr, o); };
    const ss = g.voice.script.bind(g.voice);
    g.voice.script = (k) => { window.__ev.say.push('script:' + (typeof k === 'string' ? k : 'inline')); return ss(k); };
    const pn = g.director.panic.bind(g.director);
    g.director.panic = (n, o) => { window.__ev.panic.push(n); return pn(n, o); };
    const sm = g.director.spawnMob.bind(g.director);
    g.director.spawnMob = (n, o) => { const r = sm(n, o); window.__ev.mobs.push(n + '->' + r); return r; };
    return 'ok';
  });
  await step('intro (8 s)', (g) => { g.advance(8); return { ev: window.__ev, heli: g.level.dynamics.some((d) => d.constructor?.name === 'Helicopter') }; });
  // burning apartment: walk in through the door (voice trigger), then drop through the hole
  await step('burning apt', (g) => {
    g.player.teleport(23.3, 10.85, 12.5, Math.PI);
    g.advance(0.5);
    g.player.teleport(26.5, 10.85, 15, -Math.PI / 2);
    g.advance(1.5);
    return { say: window.__ev.say.slice(-3), hp: Math.round(g.player.totalHealth) };
  });
  await step('drop hole', (g) => { g.player.teleport(28.3, 10.9, 15.3, 0); g.advance(2.5); return { y: g.player.pos.y.toFixed(2), incap: g.player.incapped, hp: Math.round(g.player.totalHealth) }; });
  // shaft trigger (mob pours down from above)
  await step('shaft trigger', (g) => {
    g.bots?.forEach?.(() => {});
    g.player.teleport(28, 7.25, 8.6, Math.PI);
    g.advance(4);
    return { mobs: window.__ev.mobs, say: window.__ev.say.slice(-3), commons: g.infected.commons.filter((c) => !c.dead).length };
  });
  // burn deaths: ignite a few commons (with and without an attacker)
  await step('burn deaths', (g) => {
    const cs = g.infected.commons.filter((c) => !c.dead).slice(0, 6);
    cs.forEach((c, i) => c.ignite(i % 2 ? g.player : null));
    g.advance(6);
    return { ignited: cs.length, deadNow: cs.filter((c) => c.dead).length };
  });
  // car alarms on Hawthorne Ave (bump into both: touching the roof / running into it)
  await step('alarm car 1', (g) => {
    const cars = g.props.cars;
    const c = cars[0];
    const b = c.box;
    g.player.teleport((b[0] + b[3]) / 2, b[4] + 0.05, (b[2] + b[5]) / 2, 0);
    g.advance(1.5);
    return { n: cars.length, triggered: cars.map((c) => c.triggered), panic: window.__ev.panic, dir: g.director.state, lightsOn: c.lights.map((l) => l.on) };
  });
  await step('alarm waves (20 s)', (g) => { g.player.teleport(40, 0.2, 22, 0); g.advance(20); return { dir: g.director.state, commons: g.infected.commons.filter((c) => !c.dead).length, hp: g.survivors.map((s) => Math.round(s.totalHealth)) }; });
  await step('alarm car 2 (shot)', (g) => {
    const c = g.props.cars[1];
    c.trigger();
    g.advance(2);
    return { triggered: g.props.cars.map((c) => c.triggered), panic: window.__ev.panic };
  });
  await step('director off spawnMob', (g) => { g.director.enabled = false; const n = g.director.spawnMob(10, { where: 'any' }); g.director.enabled = true; return n; });
  await step('safe room trigger', (g) => { g.player.teleport(104, -5.95, -18, Math.PI); g.advance(1); return { obj: window.__ev.obj, say: window.__ev.say.slice(-2) }; });
  await step('errors', (g) => ({ errCount: g.errCount || 0 }));
  await wait(1500);
  console.log('ERRORS:', logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]')).length);
};
