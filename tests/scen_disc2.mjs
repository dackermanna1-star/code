export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=0', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.viewmodel.root.traverse((o) => { if (o.isMesh && !o.name) o.visible = false; }); g.advance(0.2); });
  await wait(300); await shot('disc_nounnamed');
  await evalg(() => { const g = window.game; g.viewmodel.root.visible = false; g.advance(0.1); });
  await wait(300); await shot('disc_novm');
};
