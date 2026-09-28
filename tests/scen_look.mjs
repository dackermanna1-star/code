// Visual survey: screenshots at fixed points along each chapter's route
// (progress fractions of the toExit field), looking down the route.
// CHS=0,1,2,3,4 TAG=before QUALITY=medium node tests/play.mjs tests/scen_look.mjs
// Optional PTS=0.05,0.3,0.55,0.8 (route progress) and CAMP=nomercy.
export default async ({ page, evalg, wait, shot }) => {
  const chs = (process.env.CHS || '0,1,2,3,4').split(',').map(Number);
  const pts = (process.env.PTS || '0.06,0.3,0.55,0.8').split(',').map(Number);
  const tag = process.env.TAG || 'look';
  for (const ch of chs) {
    await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + ch + '&campaign=' + (process.env.CAMP || 'nomercy'), { timeout: 180000 });
    for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
    for (let k = 0; k < pts.length; k++) {
      const info = await evalg((w) => {
        const g = window.game, L = g.level, nav = L.nav, f = nav.fields.toExit;
        g.director.enabled = false; g.cheats.god = true; g.cheats.botsIdle = true;
        for (const c of g.infected.commons) c.hp = 0;
        const total = f[nav.nodeAt(...L.flowStart)] || 1;
        let best = -1, bd = 1e9;
        for (let n = 0; n < nav.N; n += 3) { if (f[n] >= 1e8) continue; const d = Math.abs(1 - f[n] / total - w); if (d < bd) { bd = d; best = n; } }
        let m = best;
        for (let i = 0; i < 14; i++) { const q = nav.descend(f, m); if (q < 0) break; m = q; }
        const dx = nav.nodeX(m) - nav.nodeX(best), dz = nav.nodeZ(m) - nav.nodeZ(best);
        const yaw = Math.atan2(-dx, -dz);
        g.player.teleport(nav.nodeX(best), nav.nodeY[best], nav.nodeZ(best), yaw);
        g.player.pitch = -0.08;
        g.survivors.forEach((s, i) => { if (s !== g.player) s.teleport(nav.nodeX(best) - Math.sin(yaw) * (2 + i) + (i - 2) * 0.8, nav.nodeY[best], nav.nodeZ(best) - Math.cos(yaw) * (2 + i), yaw); });
        g.advance(0.6);
        g.hud?.clearTransient?.();
        return { ch: window.session.chapterIdx, p: w, x: +nav.nodeX(best).toFixed(1), y: +nav.nodeY[best].toFixed(1), z: +nav.nodeZ(best).toFixed(1), yaw: +yaw.toFixed(2), errs: g.errCount || 0 };
      }, pts[k]);
      console.log('SPOT', JSON.stringify(info));
      await wait(600);
      await shot(`${tag}_c${ch}_${k}`);
    }
  }
};
