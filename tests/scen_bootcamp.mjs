// Boot a chapter of a given campaign: CAMP=deadair CH=0
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=' + (process.env.CAMP || 'nomercy') + '&autostart=' + (process.env.CH || 0), { timeout: 180000 });
  for (let i = 0; i < 120; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  console.log(JSON.stringify(await evalg(() => { const g = window.game; g.advance(3); return { camp: window.session.campaign.id, ch: window.session.chapterIdx, title: window.session.chapters[window.session.chapterIdx].title, state: window.session.state, errs: g.errCount || 0 }; })));
  await shot('boot_' + (process.env.CAMP || 'nomercy') + '_' + (process.env.CH || 0));
};
