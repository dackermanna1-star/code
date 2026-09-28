export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=0', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  console.log('DOM', JSON.stringify(await evalg(() => document.elementsFromPoint(480, 150).map((e) => e.tagName + '.' + e.className + '#' + e.id + ' ' + getComputedStyle(e).background.slice(0, 80)))));
  await evalg(() => { window.game.renderer.r.domElement.style.visibility = 'hidden'; });
  await wait(300); await shot('disc_nocanvas');
};
