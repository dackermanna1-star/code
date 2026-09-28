// Repro: look around / down in Dead Air ch1 start and screenshot (viewmodel/HUD artifacts).
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + (process.env.CH || 0), { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  for (const [name, pitch] of [['level', 0], ['down', -1.1], ['down2', -1.45]]) {
    const r = await evalg((pitch) => {
      const g = window.game; g.director.enabled = false; g.player.pitch = pitch; g.advance(0.3); g.player.pitch = pitch; g.advance(0.05);
      const vm = g.viewmodel || g.player?.viewmodel; const out = [];
      const root = vm?.root || vm?.group || vm?.scene;
      root?.traverse?.((o) => { if (o.isMesh && o.visible) { o.geometry.computeBoundingSphere?.(); const s = o.geometry.boundingSphere; const ws = new o.matrixWorld.constructor(); out.push(o.name + ':' + (s ? s.radius.toFixed(2) : '?') + ':' + o.getWorldScale?.(new s.center.constructor()).x.toFixed(2)); } });
      return { vmKeys: vm ? Object.keys(vm).slice(0, 30) : null, meshes: out.slice(0, 40) };
    }, pitch);
    console.log(name, JSON.stringify(r));
    await wait(400);
    await shot('lookdown_' + name);
  }
};
