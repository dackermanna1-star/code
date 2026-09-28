export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=0', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const px = () => evalg(() => { const g = window.game, c = g.renderer.r.domElement; g.renderer.render(0.016); const gl = g.renderer.r.getContext(); const b = new Uint8Array(4); gl.readPixels(c.width >> 1, Math.floor(c.height * 0.55), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return Array.from(b); });
  await evalg(() => { window.game.director.enabled = false; window.game.advance(0.1); });
  console.log('base', JSON.stringify(await px()));
  await evalg(() => { const g = window.game; g.flashlight.castShadow = false; g.advance(0.1); });
  console.log('noshadow', JSON.stringify(await px())); await shot('disc_noshadow');
  await evalg(() => { const g = window.game; g.flashlight.castShadow = true; g.player.flashlight = false; g.advance(0.1); });
  console.log('flashoff', JSON.stringify(await px())); await shot('disc_flashoff');
};
