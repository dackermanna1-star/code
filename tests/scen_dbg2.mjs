export default async ({ page, evalg, wait }) => {
  await page.goto('' + (process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  for (let i = 0; i < 6; i++) {
    await wait(3000);
    console.log(JSON.stringify(await evalg(() => ({ t: typeof window.game, c: window.game?.constructor?.name, adv: typeof window.game?.advance, st: window.session?.state, gs: window.game?.state }))));
  }
};
