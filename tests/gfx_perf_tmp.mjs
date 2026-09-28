export default async ({ page, evalg, wait, shot }) => {
  await page.goto('http://localhost:5180/?campaign=deadair&autostart=0', { timeout: 180000 });
  for (let i = 0; i < 180; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg(() => {
    const g = window.game; g.director.enabled = false; g.cheats.god = true; g.cheats.godAll = true; g.cheats.botsIdle = true; window.session.menu?.clear?.();
    const P = g.player; P.teleport(47, 18.02, 34, 0); P.yaw = Math.atan2(2, 2.8); P.pitch = -0.2; g.advance(0.5);
    const t = (lbl) => { const a = performance.now(); g.renderer.render(0.016); g.renderer.render(0.016); return lbl + ':' + ((performance.now() - a) / 2).toFixed(0); };
    const out = [t('warm'), t('base')];
    const cl = g.level.meshes.filter((m) => m.material?.name === 'chainLink');
    cl.forEach((m) => (m.visible = false)); out.push(t('noFence'), 'n=' + cl.length); cl.forEach((m) => (m.visible = true));
    g.renderer.bloom && (g.renderer.bloom.enabled = false); out.push(t('noBloom')); g.renderer.bloom && (g.renderer.bloom.enabled = true);
    return out.join(' ');
  });
  console.log('PERF', r);
  const a = Date.now(); await shot('gfx0_fence'); console.log('shot ms', Date.now() - a);
};
