export default async ({ shot, evalg, wait }) => {
  await wait(4500);
  await evalg(() => {
    const g = window.game; const p = g.player;
    p.teleport(-12, 0.15, -2, -Math.PI / 2); p.pitch = -0.05;
    g.advance(0.3);
  });
  for (const w of ['pistol', 'smg', 'rifle', 'huntingRifle', 'autoShotgun', 'fireaxe']) {
    await evalg((w) => { const g = window.game; g.player.giveWeapon(w); g.advance(1.0); }, w);
    await wait(1200);
    await shot('vm_' + w);
  }
};
