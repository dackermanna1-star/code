// Viewmodel animation contact sheet: reloads / pump / melee / launcher frames in one image.
// QUALITY=medium node tests/play.mjs tests/vm_anim.mjs   -> tests/out/vm_anim_grid.png
// env: CELLS=json override, POS as in vm_weapons
import fs from 'fs';
const CELLS = [
  ['pistol', 'idle', 0], ['pistol', 'reloadE', 0.2], ['pistol', 'reloadE', 0.38], ['pistol', 'reloadE', 0.74],
  ['rifle', 'reloadE', 0.12], ['rifle', 'reloadE', 0.36], ['rifle', 'reloadE', 0.74], ['rifle', 'fire', 0.02],
  ['pumpShotgun', 'shells', 0.75], ['pumpShotgun', 'pump', 0.22], ['autoShotgun', 'shellsEnd', 0.24], ['dual', 'reloadE', 0.2],
  ['fireaxe', 'swing', 0.6], ['fireaxe', 'swing2', 1.0], ['machete', 'swing', 0.2], ['huntingRifle', 'reloadE', 0.74],
  ['smg', 'reloadE', 0.74], ['grenadeLauncher', 'reloadE', 0.2], ['grenadeLauncher', 'reloadE', 0.55], ['scar', 'sprint', 0],
];
export default async ({ page, evalg, wait, logs }) => {
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
    g.survivors.filter((s) => s !== P).forEach((s, i) => s.teleport(p[0] + dx / d * -1.5 + i * 0.6, p[1] + 0.02, p[2] + dz / d * -1.5, 0));
    P.flashlight = true;
    g.paused = true;
    window.__view = { yaw: P.yaw, pitch: P.pitch };
    const c = document.createElement('canvas'); c.width = 1920; c.height = 864; window.__grid = c;
  }, pos);
  await wait(+(process.env.TITLE_WAIT || 6000));
  const cells = process.env.CELLS ? JSON.parse(process.env.CELLS) : CELLS;
  let i = 0;
  for (const [w, act, k] of cells) {
    const r = await evalg(([w, act, k, i]) => {
      const g = window.game, P = g.player, errs = [];
      try {
        P.yaw = window.__view.yaw; P.pitch = window.__view.pitch;
        P.sprinting = false; P.cmd.fire = false;
        if (w === 'dual') { P.giveWeapon('pistol'); if (!P.inv.secondary.dual) P.giveWeapon('pistol'); P.selectSlotForce(1); }
        else if (w === 'pistol') { P.inv.secondary = null; P.giveWeapon('pistol'); P.selectSlotForce(1); }
        else if (!P.giveWeapon(w)) return 'no weapon ' + w;
        g.advance(1.0);
        const W = P.weapon, vm = g.viewmodel, d = W?.def;
        if (act === 'reloadE') { W.clip = 0; W.reserve = Math.max(W.reserve, 100); W.startReload(); const dur = d.reload * (W.dual ? 1.35 : 1); g.advance(k * dur); }
        else if (act === 'shells') { W.clip = 2; W.startReload(); g.advance(d.reloadStart + 0.05 + d.reload * k); }
        else if (act === 'shellsEnd') { W.clip = 0; W.reserve = 100; W.startReload(); g.advance(d.reloadStart + 0.02 + d.reload * 0.5); W.cmd = null; W.clip = W.maxClip - 1; g.advance(d.reload * 0.6 + d.reloadEnd + k); }
        else if (act === 'pump') { W.clip = 5; W.cool = 0; P.cmd.firePressed = true; W.update(0.001, P, { fire: true, firePressed: true }, () => {}); for (const e of W.consumeEvents()) vm.event(e); g.advance(k); }
        else if (act === 'fire') { vm.event('fire'); g.advance(k); }
        else if (act === 'swing' || act === 'swing2') { if (act === 'swing2') { vm.event('swing'); g.advance(0.9); } vm.event('swing'); g.advance((d.windup || 0.12) * k); }
        else if (act === 'sprint') { P.sprinting = true; g.advance(0.6); }
        g.advance(0.0001);
        g.renderer.render(0.0001, g);
        const cv = g.renderer.r.domElement, G = window.__grid.getContext('2d');
        const cw = 384, chh = 216, x = (i % 5) * cw, y = Math.floor(i / 5) * chh;
        G.drawImage(cv, x, y, cw, chh);
        G.fillStyle = '#000a'; G.fillRect(x, y, 200, 18); G.fillStyle = '#fff'; G.font = '13px sans-serif'; G.fillText(`${w} ${act} ${k}`, x + 4, y + 13);
        return { w: P.activeItem, vm: vm.type, anim: vm.anim?.type || null };
      } catch (e) { return 'ERR ' + e.message + ' ' + (e.stack || '').split('\n')[1]; }
    }, [w, act, k, i]);
    console.log(i, w, act, k, JSON.stringify(r));
    i++;
  }
  const url = await evalg(() => window.__grid.toDataURL('image/png'));
  if (url) { fs.writeFileSync('tests/out/vm_anim_grid.png', Buffer.from(url.split(',')[1], 'base64')); console.log('wrote tests/out/vm_anim_grid.png'); }
  console.log('errors:', logs.filter((l) => /error/i.test(l) && !/WebGL|GL_INVALID/.test(l)).length);
};
