export default async function ({ page, shot }) {
  const frames = async (n) => { const f0 = await page.evaluate(() => window.__game.frameCount); await page.waitForFunction((t) => window.__game.frameCount >= t, f0 + n, { timeout: 160000 }); };
  await page.evaluate(() => window.__game.menus.hide());
  for (let i = 0; i < 6; i++) {
    await page.evaluate((i) => { const a = window.__game.attract; a.i = i; a.t = 4; }, i);
    await frames(2);
    await shot('shot' + i);
  }
}
