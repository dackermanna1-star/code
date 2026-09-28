// Boot Dead Air 5 and evaluate the JS in $EXPR (a function body using g, L; return JSON-able).
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=4', { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg((src) => { const g = window.game, L = g.level; g.noRender = true; try { return new Function('g', 'L', src)(g, L); } catch (e) { return 'ERR ' + e.message + ' ' + e.stack; } }, process.env.EXPR || 'return 1');
  console.log(JSON.stringify(r, null, 0));
};
