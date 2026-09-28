// Dead Air ch2 (The Crane) visual tour. QUALITY=medium node tests/play.mjs tests/da2_tour.mjs
// VIEWS=name1,name2 to limit. Shots land in tests/out/da2_<name>.png
const VIEWS = [
  ['start', 50.6, 1.2, 18.6, 1.2, -0.08],
  ['kitchen', 40.8, 1.2, 17.2, 1.2, -0.1],
  ['dish', 24.5, 1.2, 12.8, 0.45, -0.05],
  ['alley', 11.5, 1.2, -1.6, -1.35, -0.05],
  ['fireescape', 30.5, 0.0, -7.8, -2.2, 0.3],
  ['fe_top', 49.2, 8.6, -2.8, 1.45, -0.28],
  ['corridor', 47.5, 8.6, 9.5, 1.57, -0.02],
  ['collapse', 27.5, 8.6, 9.2, 1.57, 0.05],
  ['roof_neon', 4.6, 12.0, 9.2, 2.35, 0.05],
  ['roof_crane', 30.0, 12.0, 11.0, 3.3, 0.16],
  ['bay', 40.5, 12.0, 14.8, 2.4, 0.02],
  ['crane_swing', 38.5, 12.0, 15.6, -2.3, 0.3, 'swing'],
  ['skip_landed', 36.0, 12.0, 15.2, 3.14, -0.08, 'land'],
  ['deck', 36.0, 12.25, 25.2, 3.3, 0.02, 'land'],
  ['scaffold', 30.8, 12.0, 54.8, 2.2, -0.35],
  ['printing', 21.0, 8.6, 62.0, -1.85, 0.03],
  ['l3', 60.2, 8.6, 70.6, -1.3, -0.02],
  ['server', 82.0, 4.6, 65.0, 3.5, -0.05],
  ['lobby', 73.0, 4.6, 86.2, 2.1, -0.3],
  ['street', 85.0, 0.3, 97.4, 2.3, 0.02],
  ['storsafe', 69.5, 0.3, 125.0, 3.14, 0.0],
  ['c2', 72.0, 0.3, 139.8, -1.57, 0.0],
  ['saferoom', 96.6, 0.3, 147.2, 0.4, -0.08],
];
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=1', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true; g.cheats.godAll = true; window.session.menu?.clear?.(); g.hud?.show?.(false); for (const c of g.infected.commons) c.hp = 0; });
  const only = process.env.VIEWS ? process.env.VIEWS.split(',') : null;
  for (const [name, x, y, z, yaw, pitch, act] of VIEWS) {
    if (only && !only.includes(name)) continue;
    const info = await evalg(([x, y, z, yaw, pitch, act]) => {
      const g = window.game, L = g.level, ev = L.da2.ev;
      if (act === 'swing' && ev.phase === 'idle') { ev.usable.onUse(g.player); g.advance(19); }
      if (act === 'land' && !ev.bridged) { if (ev.phase === 'idle') ev.usable.onUse(g.player); for (let i = 0; i < 90 && !ev.bridged; i++) g.advance(1); g.advance(3); }
      g.director.stopPanic?.();
      for (const c of g.infected.commons) c.hp = 0;
      g.player.teleport(x, y + 0.02, z, yaw);
      g.player.pitch = pitch;
      // park the bots behind the camera
      g.survivors.filter((s) => s !== g.player).forEach((s, i) => s.teleport(x + Math.sin(yaw) * (2 + i), y + 0.02, z + Math.cos(yaw) * (2 + i), yaw));
      g.advance(0.3);
      return `${ev.phase} lights=${L.lights.length}`;
    }, [x, y, z, yaw, pitch, act]);
    await evalg(([pitch]) => { window.game.player.pitch = pitch; }, [pitch]);
    await wait(2500);
    await evalg(([pitch]) => { window.game.player.pitch = pitch; }, [pitch]);
    await wait(1500);
    await shot('da2_' + name);
    console.log(name, info);
  }
};
