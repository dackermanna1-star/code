// Dead Air 5 (Runway Finale) visual tour. QUALITY=medium node tests/play.mjs tests/da5_tour.mjs
// VIEWS=name1,name2 to limit. Shots land in tests/out/da5_<name>.png
const VIEWS = [
  ['start', -41, 6, -9.5, 0.6, -0.05],
  ['crash_a', -28, 6, -9, 3.1, 0, 'crash:6.8'],
  ['crash_b', -28, 6, -9, 3.1, 0, 'crash:12.6'],
  ['crash_c', -28, 6, -9, 3.1, 0, 'crash:14.5'],
  ['lounge', -30, 6, -12.5, 2.7, -0.02, 'crash:20'],
  ['bridge', -24.3, 6, 3, 3.14, -0.05],
  ['stairbot', -11, 0, 16.3, -2.0, 0.02],
  ['lane', -2, 0, 22, -1.9, 0.02],
  ['checkpoint', 16, 0, 27, -2.6, -0.02],
  ['crew', 19.5, 0, 35.5, -2.4, -0.25],
  ['staging', 26, 0, 44, -2.2, 0.0],
  ['tanker', 36, 0, 56, -2.6, 0.02],
  ['plane', 66, 0, 46, 2.7, 0.08],
  ['regional', -24, 0, 40, 2.0, -0.02],
  ['hangar', 72, 0, 46, -1.57, 0.08],
  ['southwall', 20, 0, 76, 3.1, 0.06],
  ['overview', -10, 12, 8, -2.3, -0.28],
];
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=4', { timeout: 180000 });
  for (let i = 0; i < 400; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === "playing") break; }
  console.log("state", await evalg(() => window.session?.state));
  await evalg(() => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true; g.cheats.godAll = true; window.session.menu?.clear?.(); for (const c of g.infected.commons) c.hp = 0; });
  for (let i = 0; i < 60; i++) { if (await evalg(() => (window.__texStats?.pending ?? 0) === 0)) break; await wait(1000); }
  const only = process.env.VIEWS ? process.env.VIEWS.split(',') : null;
  for (const [name, x, y, z, yaw, pitch, act] of VIEWS) {
    if (only && !only.includes(name) && !(act && act.startsWith('crash'))) continue;
    const info = await evalg(([x, y, z, yaw, pitch, act]) => {
      const g = window.game, L = g.level, S = L.da5, F = L.finale;
      if (act && act.startsWith('crash')) {
        const T = +act.split(':')[1];
        if (F.crash === 'idle') { g.player.teleport(x, y + 0.02, z, yaw); g.advance(0.2); F.crashT0 = g.time; }
        const dt = T - (g.time - F.crashT0) - 1.2;
        if (dt > 0) g.advance(dt);
        if (F.crash !== 'running') { g.player.teleport(x, y + 0.02, z, yaw); g.player.pitch = pitch; }
        return 'crash ' + F.crash + ' t=' + (g.time - F.crashT0).toFixed(1);
      }
      for (const c of g.infected.commons) c.hp = 0;
      g.player.teleport(x, y + 0.02, z, yaw);
      g.player.pitch = pitch;
      g.survivors.filter((s) => s !== g.player).forEach((s, i) => s.teleport(x + Math.sin(yaw) * (2 + i), y + 0.02, z + Math.cos(yaw) * (2 + i), yaw));
      g.advance(0.3);
      return `lights=${L.lights.length}`;
    }, [x, y, z, yaw, pitch, act]);
    if (only && !only.includes(name)) continue;
    await evalg(([pitch]) => { window.game.player.pitch = pitch; }, [pitch]);
    await wait(act ? 1000 : 2500);
    await evalg(([pitch]) => { window.game.player.pitch = pitch; }, [pitch]);
    if (!act) await wait(1200);
    await shot('da5_' + name);
    console.log(name, info);
  }
};
