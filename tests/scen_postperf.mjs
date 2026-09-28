// Relative render cost of post features (swiftshader: compare, don't trust absolute ms).
export default async ({ page, evalg, wait, shot }) => {
  const ch = process.env.CH || 0;
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + ch, { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.advance(1); g.paused = true; });
  for (const cfg of ['all', 'noglow', 'nomotes', 'none', 'all']) {
    const r = await evalg((cfg) => {
      const g = window.game, R = g.renderer, gl = R.r.getContext();
      const glowUpd = R.glow.update.bind(R.glow);
      if (cfg === 'noglow' || cfg === 'none') R.glow.update = () => { R.glow.list.length = 0; R.glow.maskPass.enabled = R.glow.compPass.enabled = false; };
      const mv = R.motes.update.bind(R.motes);
      if (cfg === 'nomotes' || cfg === 'none') R.motes.update = () => { R.motes.points.visible = false; };
      R.render(0.016, g); gl.finish();
      R.r.info.autoReset = false; R.r.info.reset();
      const t0 = performance.now();
      for (let i = 0; i < 3; i++) R.render(0.016, g);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      const ms = (performance.now() - t0) / 3;
      const calls = R.r.info.render.calls / 3;
      R.r.info.autoReset = true;
      R.glow.update = glowUpd; R.motes.update = mv;
      return { cfg, ms: ms.toFixed(0), calls, glowN: R.glow.list.length, motes: R.motes.points.visible };
    }, cfg);
    console.log(JSON.stringify(r));
  }
};
