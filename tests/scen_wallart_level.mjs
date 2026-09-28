// In-game wall-art showcase: builds a small alley at runtime with the kit API
// (poster walls, graffiti styles, survivor wall, signs) and screenshots it.
// QUALITY=medium node tests/play.mjs tests/scen_wallart_level.mjs
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  for (let i = 0; i < 120; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const info = await page.evaluate(async () => {
    const kit = await import('/src/levels/kit.js');
    const g = window.game;
    g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true;
    const t0 = performance.now();
    g.loadLevel((L) => {
      L.env = Object.assign(L.env, { fog: 0x0c0e12, fogDensity: 0.02, hemiSky: 0x404860, hemiGround: 0x1a1612, hemiIntensity: 0.35, exposure: 1.1 });
      L.floor(-2, -2, 16, 40, 0, 'asphalt', 0.4);
      L.box(-2, 0, -2, 1.5, 0.15, 40, 'sidewalk');
      L.box(12.5, 0, -2, 16, 0.15, 40, 'sidewalk');
      L.box(-3, 0, -2, -2, 9, 40, 'brick');
      L.box(16, 0, -2, 17, 9, 40, 'brickDark');
      L.box(-2, 0, 40, 16, 9, 41, 'concreteDark');
      L.box(-2, 0, -3, 16, 9, -2, 'plasterDirty');
      for (const z of [4, 16, 28]) { L.light(1, 4.5, z, 0xffc890, 22, 16); L.light(15, 4.5, z + 6, 0xffd0a0, 18, 14); }
      const W = -1.98, E = 15.98;
      kit.posterWall(L, W, 1.6, 6, Math.PI / 2, 2.6, 1.7, { seed: 3 });
      kit.graffiti(L, 'ROT', W, 1.4, 10.5, Math.PI / 2, 2.4, 1.1, '#c41e16', { style: 'throwup' });
      kit.graffiti(L, 'NOVA', W, 2.9, 13, Math.PI / 2, 2.6, 1.1, '#18a0a8', { style: 'piece' });
      kit.graffiti(L, 'KESS', W, 1.5, 14.2, Math.PI / 2, 1.2, 0.5, '#e0a010', { style: 'tag' });
      kit.poster(L, 'missing', W, 1.55, 16.2, Math.PI / 2, 0.32, 0.45, {});
      kit.poster(L, 'missing', W, 1.5, 16.65, Math.PI / 2, 0.32, 0.45, { seed: 9 });
      kit.poster(L, 'airline', W, 2.1, 18.6, Math.PI / 2, 1.3, 0.85, { title: 'SKYLINE AIR' });
      kit.graffiti(L, 'THEY HEAR\nEVERYTHING', W, 1.7, 21.5, Math.PI / 2, 2.0, 0.9, '#8a1a14');
      kit.stencil(L, 'SAFE ROOM →', W, 1.2, 24, Math.PI / 2, 1.8, 0.4, '#d8d8c8');
      kit.poster(L, 'quarantine', E, 1.6, 7, -Math.PI / 2, 0.7, 0.95, {});
      kit.poster(L, 'evac', E, 1.6, 8, -Math.PI / 2, 0.6, 0.85, {});
      kit.wallMessages(L, E, 1.75, 11, -Math.PI / 2, 1.7, 1.2, { lines: ['CEDA LIES', 'WE WENT NORTH'] });
      kit.poster(L, 'concert', E, 1.7, 13.4, -Math.PI / 2, 0.6, 0.9, {});
      kit.poster(L, 'movie', E, 1.7, 14.2, -Math.PI / 2, 0.6, 0.9, {});
      kit.posterWall(L, E, 1.5, 17.5, -Math.PI / 2, 2.2, 1.4, { seed: 8, kinds: ['flyer', 'missing', 'health'] });
      kit.graffiti(L, 'DONT GO\nTOWARD THE\nCRYING', E, 2.0, 21, -Math.PI / 2, 2.0, 1.0, '#b8201a', { style: 'drip' });
      kit.sign(L, 'LIQUOR', W + 0.02, 3.4, 27, Math.PI / 2, 2.6, 0.6, { fg: '#ff4aa0', glow: 1.6, lightColor: 0xff4aa0 });
      kit.sign(L, 'HAWTHORNE AV', W + 0.3, 3.3, 3, Math.PI / 2, 1.6, 0.35, { bg: '#1a5a2a', fg: '#fff', border: '#fff' });
      kit.sign(L, 'QUARANTINE ZONE\nNO ENTRY', 7, 2.2, 39.98, Math.PI, 2.4, 1.1, { bg: '#d8c030', fg: '#101010', border: '#101010' });
      kit.sign(L, 'OUT OF\nORDER', E, 1.4, 25, -Math.PI / 2, 0.7, 0.45, { bg: '#e8e0c8', fg: '#8a1010' });
      L.survivorStart.push({ x: 7, y: 0, z: 1, yaw: 0 });
    }, { def: {} });
    const buildMs = performance.now() - t0;
    return { buildMs: Math.round(buildMs) };
  });
  console.log('BUILD', JSON.stringify(info));
  for (let i = 0; i < 80; i++) { const p = await evalg(() => window.__texStats?.pending ?? 0); if (!p) break; await wait(500); }
  await evalg(() => { const g = window.game; g.hud?.show?.(false); if (g.renderer?.vmPass) g.renderer.vmPass.enabled = false; for (const s of g.survivors) if (s !== g.player) s.teleport(300, -80, 300, 0); });
  const spots = [['west', 4.2, 0, 11, 1.35, 0.05], ['west2', 4.2, 0, 18.5, 1.45, 0.08], ['east', 10.5, 0, 12, -1.35, 0.05], ['alley', 7, 0, 2, Math.PI, 0.08]];
  for (const [name, x, y, z, yaw, pitch] of spots) {
    await evalg(([x, y, z, yaw, pitch]) => { const g = window.game; g.player.teleport(x, y + 0.02, z, yaw); g.player.pitch = pitch; g.lights.update?.(0.016, g.renderer.camera); }, [x, y, z, yaw, pitch]);
    await wait(1200);
    await shot('wallart_level_' + name);
  }
};
