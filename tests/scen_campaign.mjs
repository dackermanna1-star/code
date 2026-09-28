// Campaign flow: chain all chapters through the real "chapter complete ->
// Continue" path, checking inventory carry-over, start placement and that the
// final chapter ends on the victory screen.
export default async ({ page, evalg, wait, shot, logs }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  const waitPlaying = async () => { for (let i = 0; i < 120; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') return true; } return false; };
  await waitPlaying();
  const n = await evalg(() => window.session.chapters.length);
  for (let ch = 0; ch < n; ch++) {
    const r = await evalg(() => {
      const g = window.game, S = window.session, L = g.level;
      g.advance(3);
      const p = g.player;
      const inStart = L.startSafe ? L.inBox(L.startSafe, p.pos, 0.3) : null;
      return {
        ch: S.chapterIdx, title: S.chapters[S.chapterIdx].title, state: S.state,
        prog: +L.progressAt(p.pos.x, p.pos.y, p.pos.z).toFixed(3), inStart,
        inv: g.survivors.map((s) => `${s.name}:${s.inv.primary ? s.inv.primary.type : '-'}/${s.inv.secondary.type}${s.inv.medkit ? '+kit' : ''} hp${Math.round(s.totalHealth)}${s.dead ? ' DEAD' : ''}`).join(' '),
        commons: g.infected.commons.length, errs: g.errCount || 0, arrows: L.guideArrowCount || 0,
      };
    });
    console.log('CHAPTER', JSON.stringify(r));
    await shot('campaign_' + ch);
    if (ch === n - 1) break;
    // give the team distinctive gear to verify carry-over, then finish the chapter
    await evalg(() => {
      const g = window.game;
      g.player.giveWeapon('autoShotgun');
      g.player.inv.medkit = true;
      g.survivors[1].health = 37;
      window.session.chapterComplete();
    });
    let btn = false;
    for (let i = 0; i < 20 && !btn; i++) { await wait(1000); btn = await evalg(() => !!document.querySelector('#n-next')); }
    if (!btn) { console.log('NO CONTINUE BUTTON'); break; }
    await page.click('#n-next');
    if (!(await waitPlaying())) { console.log('chapter did not start'); break; }
    const carry = await evalg(() => ({ primary: window.game.player.inv.primary?.type, kit: window.game.player.inv.medkit, mateHp: Math.round(window.game.survivors[1].totalHealth) }));
    console.log('CARRY', JSON.stringify(carry));
  }
  // finale ending
  const v = await evalg(() => { window.session.victory(); return window.session.state; });
  await wait(1500);
  console.log('END', v, await evalg(() => !!document.querySelector('.credits')));
  await shot('campaign_victory');
  console.log('errors', logs.filter((l) => /error/i.test(l)).length);
};
