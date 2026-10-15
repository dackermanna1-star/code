// Spawn each special near the team, sample state frequently and report key events.
import { launch, shot } from './harness.mjs';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const passive = process.argv.includes('--passive');
const types = args.length ? args : ['hunter', 'smoker', 'boomer', 'charger', 'jockey', 'spitter', 'tank', 'witch'];
const { browser, page, errors } = await launch({ url: 'http://localhost:5173/?test=arena&auto=1' });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(0, 3).join(' | ')));
await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 120000 });
for (const t of types) {
  const res = await page.evaluate(async ([t, passive]) => {
    const g = window.__game, w = g.world, d = g.debug;
    // reset
    for (const z of w.infected) z.remove();
    w.infected.length = 0;
    w.survivors.forEach((s, i) => { if (s.state !== 'alive') s.revive(); s.health = 100; s.temp = 0; s.incapCount = 0; s.pinnedBy = null; s.biled = 0; s.bileScreen = 0; });
    d.teleport(0, 0, -30);
    w.survivors.forEach((s, i) => { s.give(['m16', 'auto_shotgun', 'smg', 'ak47'][i]); });
    g.player.yaw = 0; w.player.yaw = 0;
    d.passive(passive);
    const z = d.spawnSpecial(t, t === 'witch' ? 6 : 12);
    if (!z) return { t, err: 'spawn failed' };
    if (t === 'witch') z.anger = 0.95;
    const ev = [];
    const seen = new Set();
    const log = (s) => { if (!seen.has(s)) { seen.add(s); ev.push(`${(w.time).toFixed(1)} ${s}`); } };
    const unsub = [w.events.on('pinned', (s, a) => log(`PIN ${s.name} by ${a.type}`)), w.events.on('released', (s) => log(`release ${s.name}`)), w.events.on('biled', (s) => log(`BILED ${s.name}`)), w.events.on('incap', (s) => log(`INCAP ${s.name}`)), w.events.on('witchStartled', () => log('witch startled')), w.events.on('infectedKilled', (k) => { if (k.type !== 'common') log(`KILLED ${k.type}`); })];
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 150));
      if (z.state) log(`state:${z.state}`);
      if (z.air) log('airborne');
      if (z.tongue) log('tongue:' + z.tongue.state);
      if (z.vomitT > 0) log('vomiting');
      if (z.throwT > 0) log('rock throw');
      if (z.warm > 0) log('charge windup');
      if (w.hazards.some((h) => h.constructor.name === 'AcidPool')) log('acid pool');
      if (!z.alive && i > 10) break;
    }
    unsub.forEach((u) => u());
    return { t, alive: z.alive, hp: Math.round(z.health), ev, surv: w.survivors.map((s) => `${s.name}:${s.state}:${Math.round(s.total)}`).join(' ') };
  }, [t, passive]);
  console.log(JSON.stringify(res));
  await shot(page, 'special_' + t);
}
console.log('errors:', errors.filter((e) => !e.includes('Failed to load')).slice(0, 5).join('\n') || 'none');
await browser.close();
