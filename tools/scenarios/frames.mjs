export default async function ({ page }) {
  for (let i = 0; i < 4; i++) {
    console.log(await page.evaluate(() => { const g = window.__game; return JSON.stringify({ fc: g.frameCount, t: g.time.elapsed.toFixed(2), rt: g.time.realElapsed.toFixed(2), st: g.state, running: g.running, cam: g.engine.camera.position.toArray().map((v) => v.toFixed(2)), rotZ: g.engine.camera.rotation.z }); }));
    await page.waitForTimeout(1000);
  }
}
