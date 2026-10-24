export default async function ({ page, shot }) {
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const g = window.__game;
    const ex = ['neutral', 'angry', 'pain', 'shock', 'dead', 'laugh', 'scared', 'drunk', 'ko', 'happy', 'angry', 'pain'];
    g.characters.forEach((c, i) => { c.teleport(c.position, 0); c.setExpression(ex[i]); });
    g.player.teleport({ x: -3.8, y: 0, z: 3.0 }, 0);
    g.player.pitch = 0.08;
  });
  await page.waitForTimeout(700);
  await shot('expr1');
  await page.evaluate(() => {
    const g = window.__game;
    g.player.teleport({ x: -0.5, y: 0, z: 3.0 }, 0);
  });
  await page.waitForTimeout(500);
  await shot('expr2');
  await page.evaluate(() => {
    const g = window.__game;
    g.player.teleport({ x: 3.0, y: 0, z: 3.0 }, 0);
  });
  await page.waitForTimeout(500);
  await shot('expr3');
  // poses
  await page.evaluate(() => {
    const g = window.__game;
    const cs = g.characters;
    cs[0].combatMode = true;
    cs[1].blocking = true;
    cs[2].animator.setFullBody('dance'); cs[2].animator.danceStyle = 0;
    cs[3].animator.setFullBody('dance'); cs[3].animator.danceStyle = 1;
    cs[4].animator.setFullBody('dance'); cs[4].animator.danceStyle = 2;
    cs[5].animator.setFullBody('sitChair');
    cs[6].animator.setFullBody('cower');
    cs[7].ambientStance = 'armsCrossed';
    cs[8].ambientStance = 'hips';
    cs[9].combatMode = true; cs[9].animator.play('kick');
    cs[10].combatMode = true; cs[10].animator.play('crossR');
    cs[11].animator.setFullBody('dance'); cs[11].animator.danceStyle = 3;
    g.player.teleport({ x: 0, y: 0, z: 7.2 }, 0);
    g.player.pitch = -0.1;
  });
  await page.waitForTimeout(300);
  await shot('poses_a');
  await page.waitForTimeout(450);
  await shot('poses_b');
}
