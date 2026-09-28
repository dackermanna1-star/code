// First-person weapon / flashlight check in Dead Air ch1 (saferoom).
// QUALITY=medium node tests/play.mjs tests/vm_weapons.mjs
// env: WEAPONS=pistol,smg,...  GLARE=1 (bot flashlight facing camera shots)  CH=0
const ALL = ['pistol', 'dual', 'magnum', 'smg', 'silencedSmg', 'pumpShotgun', 'chromeShotgun', 'autoShotgun', 'rifle', 'scar', 'huntingRifle', 'fireaxe', 'molotov', 'pipebomb', 'medkit'];
export default async ({ page, evalg, wait, shot, logs }) => {
  const ch = +(process.env.CH || 0);
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?campaign=deadair&autostart=' + ch, { timeout: 180000 });
  for (let i = 0; i < 150; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const pos = (process.env.POS || '8.9,18,32.6,4,18.4,26.5').split(',').map(Number);
  await evalg((p) => {
    const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.godAll = true;
    for (const c of g.infected.commons) c.hp = 0; g.advance(0.3);
    const P = g.player; P.teleport(p[0], p[1] + 0.02, p[2], 0);
    const dx = p[3] - p[0], dy = p[4] - (p[1] + 1.6), dz = p[5] - p[2], d = Math.hypot(dx, dz);
    P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, d);
    // park bots out of view
    g.survivors.filter((s) => s !== P).forEach((s, i) => s.teleport(p[0] + dx / d * -1.5 + i * 0.6, p[1] + 0.02, p[2] + dz / d * -1.5, 0));
    P.flashlight = true;
    window.__vmPos = p;
  }, pos);
  await wait(+(process.env.TITLE_WAIT || 7000));
  const list = (process.env.WEAPONS || ALL.join(',')).split(',').filter(Boolean);
  for (const w of list) {
    const info = await evalg((w) => {
      const g = window.game, P = g.player;
      if (w === 'dual') { P.giveWeapon('pistol'); if (!P.inv.secondary.dual) P.giveWeapon('pistol'); }
      else if (w === 'pistol') { P.inv.secondary.dual = false; P.selectSlotForce(1); }
      else if (['molotov', 'pipebomb', 'bile'].includes(w)) { P.inv.throwable = w; P.selectSlotForce(2); }
      else if (w === 'medkit') { P.inv.medkit = true; P.selectSlotForce(3); }
      else if (!P.giveWeapon(w)) return 'no weapon ' + w;
      g.advance(1.2);
      const r = g.renderer.r.info.render;
      return { item: P.activeItem, vm: g.viewmodel.type, calls: r.calls, tris: r.triangles };
    }, w);
    await wait(700);
    console.log(w, JSON.stringify(info));
    await shot('vm_' + w);
  }
  if (process.env.GLARE) {
    for (const [name, dist] of [['glare_far', 7], ['glare_near', 2.2]]) {
      await evalg((dist) => {
        const g = window.game, P = g.player, p = window.__vmPos;
        const dx = p[3] - p[0], dz = p[5] - p[2], d = Math.hypot(dx, dz);
        const b = g.survivors.filter((s) => s !== P);
        b.forEach((s, i) => {
          const a = dist + i * 0.8, side = (i - 1) * 0.9;
          s.teleport(p[0] + dx / d * a - dz / d * side, p[1] + 0.02, p[2] + dz / d * a + dx / d * side, Math.atan2(dx, dz));
          s.flashlight = true;
        });
        g.advance(0.5);
        b.forEach((s) => { s.yaw = Math.atan2(dx, dz); s.pitch = -0.05; });
        g.advance(0.05);
      }, dist);
      await wait(700);
      await shot('vm_' + name);
    }
  }
  console.log('errors:', logs.filter((l) => /error/i.test(l) && !/WebGL|GL_INVALID/.test(l)).length);
};
