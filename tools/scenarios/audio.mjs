export default async function ({ page, shot, logs }) {
  const frames = async (n) => { const f0 = await page.evaluate(() => window.__game.frameCount); await page.waitForFunction((t) => window.__game.frameCount >= t, f0 + n, { timeout: 200000 }); };
  // a user gesture unlocks audio + starts the jukebox
  await page.mouse.click(700, 300);
  await page.click('text=BRAWL');
  await frames(6);
  const st = () => page.evaluate(() => { const a = window.__game.audio; const m = a.music; return JSON.stringify({ ac: a.ac.state, t: a.ac.currentTime.toFixed(2), song: m.songName, bpm: m.bpm, beat: m.beat.toFixed(2), energy: m.energy.toFixed(2), voices: a.activeVoices, smashed: m.smashed }); });
  console.log('start', await st());
  // fight a bit for SFX traffic
  await page.evaluate(() => {
    const g = window.__game;
    const b = g.ai.brains.find((b) => b.arch.id === 'patron' && b.ch.position.y < 1);
    const p = b.ch.position;
    g.player.ctrl.teleport({ x: p.x, y: p.y, z: p.z + 1.0 }, 0);
  });
  for (let i = 0; i < 8; i++) { await page.evaluate(() => window.__game.input.virtualTap('attack')); await frames(2); }
  console.log('fight', await st());
  // smash the jukebox via damage, then restart and check repair
  await page.evaluate(() => { const g = window.__game; const own = g.physics.ownerOf(g.level.jukebox.collider); own.onMeleeHit(200, g.level.jukebox.pos.clone().setY(1), new g.level.jukebox.pos.constructor(0, 0, -1), g.player); });
  await frames(3);
  console.log('smashed', await st());
  await page.evaluate(() => window.__game.restart());
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await frames(10);
  console.log('round2', await st());
  const errs = logs.filter((l) => l.includes('error') || l.includes('[audio]') || l.includes('[music]'));
  console.log('audio logs:', errs.slice(0, 10).join('\n'));
}
