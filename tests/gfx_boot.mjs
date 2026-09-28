// Boot Dead Air ch1 + ch2 back to back, run a few seconds, report errors + draw calls.
// QUALITY=low node tests/play.mjs tests/gfx_boot.mjs
export default async ({ page, evalg, wait, logs }) => {
  for (const ch of (process.env.CHS || '0,1').split(',').map(Number)) {
    const n0 = logs.length;
    await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + ch, { timeout: 180000 });
    let st;
    for (let i = 0; i < 180; i++) { await wait(1000); st = await evalg(() => window.session?.state); if (st === 'playing') break; }
    await wait(4000);
    const info = await evalg(() => { const g = window.game, r = g.renderer.r; g.advance(0.5); r.info.autoReset = false; r.info.reset(); g.renderer.render(0.016); const o = { calls: r.info.render.calls, tris: r.info.render.triangles, geos: r.info.memory.geometries, tex: r.info.memory.textures, progs: r.info.programs?.length }; r.info.autoReset = true; return o; });
    const errs = logs.slice(n0).filter((l) => /error|Unknown material|undefined|NaN/i.test(l));
    console.log('CH', ch, 'state', st, JSON.stringify(info), 'errors:', errs.length, errs.slice(0, 4).join(' | '));
  }
};
