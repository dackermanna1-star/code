// Screenshot the guide arrows at a few route spots: SPOTS='[[x,y,z,yaw,pitch],...]'
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + (process.env.CH || 0));
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  console.log('arrows', await evalg(() => window.game.level.guideArrowCount));
  const spots = JSON.parse(process.env.SPOTS || '[[15,14.4,12,1.2,-0.45],[12,10.8,10.4,-1.57,-0.4],[22,0.15,24,-1.9,-0.35]]');
  for (let i = 0; i < spots.length; i++) {
    await evalg((s) => { const g = window.game; g.director.enabled = false; g.player.teleport(s[0], s[1], s[2], s[3]); g.player.pitch = s[4]; g.advance(0.3); g.hud.clearTransient(); }, spots[i]);
    await wait(400);
    await shot('arrows_' + i);
  }
};
