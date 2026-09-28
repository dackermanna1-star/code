// Black-disc bisect 2: toggle individual composer passes / AO debug view; black fraction of centre box.
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + (process.env.CH || 0), { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.player.flashlight = true; g.advance(0.3); });
  const measure = async (label, setup, keep) => {
    const r = await evalg(setup);
    await evalg(() => { const g = window.game; g.player.pitch = -1.1; g.advance(0.05); g.player.pitch = -1.1; });
    await wait(1500);
    const buf = await page.screenshot({ timeout: 90000 }).catch(() => null);
    if (!buf) { console.log(label, 'shot failed'); return; }
    const frac = await evalg(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(240, 300, 480, 240).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 6) n++;
      return (n / (d.length / 4)).toFixed(3);
    }, buf.toString('base64'));
    console.log(label, 'black', frac, JSON.stringify(r));
    if (keep) await shot('disc9_' + label);
    await evalg(() => window.__undo?.());
  };
  const tog = (name) => measure('no_' + name, (name) => { const R = window.game.renderer; const p = name === 'vm' ? R.vmPass : name === 'mask' ? R.glow.maskPass : name === 'comp' ? R.glow.compPass : R[name]; if (!p) return 'missing'; p.enabled = false; window.__undo = () => { p.enabled = true; }; return 'ok'; }, false);
  await measure('base', () => { window.__undo = null; return window.game.renderer.composer.passes.map((p) => p.constructor.name + ':' + p.enabled).join(','); }, true);
  await measure('aoDebug', () => { const R = window.game.renderer; R.ao.compMat.uniforms.debug.value = 1; window.__undo = () => { R.ao.compMat.uniforms.debug.value = 0; }; }, true);
  for (const n of ['ao', 'vm', 'mask', 'comp', 'bloom', 'fxaa']) await page.evaluate(() => 0).then(() => tog(n));
  await measure('worldOnly', () => { const R = window.game.renderer; const ps = R.composer.passes.slice(1).filter((p) => p !== R.grade); ps.forEach((p) => p.enabled = false); window.__undo = () => ps.forEach((p) => p.enabled = true); }, true);
};
