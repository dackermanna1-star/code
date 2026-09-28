// Wall-art canvas preview (no game): SETS=graffiti,walls,posters,pwall,signs
export default async ({ page, wait, shot }) => {
  const sets = (process.env.SETS || 'graffiti,walls,posters,pwall,signs').split(',');
  await page.setViewportSize({ width: 1500, height: 1000 });
  for (const s of sets) {
    await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + 'tests/wallart_preview.html?set=' + s);
    for (let i = 0; i < 30; i++) { await wait(300); if (await page.evaluate(() => window.__done).catch(() => false)) break; }
    await wait(200);
    await page.screenshot({ path: `tests/out/wallart_${s}.png`, fullPage: true });
    console.log('shot', s, JSON.stringify(await page.evaluate(() => window.__times)));
  }
};
