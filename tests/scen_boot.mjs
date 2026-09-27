export default async ({ page, evalg, wait, shot }) => {
  const ch = process.env.CH || '0';
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + ch);
  let st;
  for (let i = 0; i < 60; i++) { await wait(1000); st = await evalg(() => window.session?.state); if (st === 'playing') break; }
  const r = await evalg(() => { const g = window.game; g.advance(5); return { state: window.session.state, audio: g.audio.constructor.name, nav: g.level.nav.N, prog: g.level.progressAt(g.player.pos.x, g.player.pos.y, g.player.pos.z), end: g.level.flowEnd && g.level.progressAt(...g.level.flowEnd), commons: g.infected.commons.length }; });
  console.log(JSON.stringify(r));
  await shot('boot_' + ch);
};
