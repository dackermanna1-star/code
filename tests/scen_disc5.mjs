export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=0', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  console.log('A', JSON.stringify(await evalg(() => { const g = window.game; g.director.enabled = false; for (const m of g.lights.spotCones.values()) m.material.visible = false; g.advance(0.1); return g.lights.spotCones.size; })));
  await wait(300); await shot('disc_nocones');
  console.log('B', JSON.stringify(await evalg(() => { const g = window.game; for (const s of g.botGlares) s.material.visible = false; g.advance(0.1); return g.botGlares.length; })));
  await wait(300); await shot('disc_noglare');
};
