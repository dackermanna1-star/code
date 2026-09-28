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
  const T0 = Date.now(), log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
  for (let i = 0; i < 150; i++) { await wait(1000); const st = await evalg(() => window.session?.state); if (i % 10 === 0) log('state ' + st); if (st === 'playing') break; }
  log('playing');
  const pos = (process.env.POS || '8.9,18,32.6,4,18.4,26.5').split(',').map(Number);
  const cells0 = process.env.CELLS ? JSON.parse(process.env.CELLS) : CELLS;
  const CWV = +(process.env.CW || 384);
  await evalg(([p, cw, nc]) => {
    const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.godAll = true;
    for (const c of g.infected.commons) c.hp = 0; g.advance(0.3);
    const P = g.player; P.teleport(p[0], p[1] + 0.02, p[2], 0);
    const dx = p[3] - p[0], dy = p[4] - (p[1] + 1.6), dz = p[5] - p[2], d = Math.hypot(dx, dz);
    P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, d);
    g.survivors.filter((s) => s !== P).forEach((s, i) => s.teleport(p[0] + dx / d * -1.5 + i * 0.6, p[1] + 0.02, p[2] + dz / d * -1.5, 0));
    P.flashlight = true;
    g.paused = true;
    window.__view = { yaw: P.yaw, pitch: P.pitch };
    const c = document.createElement('canvas'); c.width = 5 * cw; c.height = Math.ceil(nc / 5) * Math.round(cw * 0.5625); window.__grid = c;
  }, [pos, CWV, cells0.length]);
  log('setup done');
  await wait(+(process.env.TITLE_WAIT || 6000));
  const cells = process.env.CELLS ? JSON.parse(process.env.CELLS) : CELLS;
  const imgs = [];
  let i = 0;
  // each cell is also saved as it is made (a crashed renderer keeps what was done)
  const cellDir = fs.mkdtempSync('/tmp/vmanim-cells-');
  log('cells in ' + cellDir);
  for (const [w, act, k] of cells) {
    const r = await evalg(([w, act, k, i, cw]) => {
      const g = window.game, P = g.player, errs = [];
      const vm0 = g.viewmodel, oe = vm0.event, evs = [];
      vm0.event = function (e, d) { evs.push(e); return oe.call(this, e, d); };
      try {
        P.yaw = window.__view.yaw; P.pitch = window.__view.pitch;
        P.sprinting = false; P.cmd.fire = false;
        if (w === 'dual') { P.giveWeapon('machete'); P.giveWeapon('pistol'); P.giveWeapon('pistol'); P.selectSlotForce(1); }
        else if (w === 'pistol') { P.giveWeapon('machete'); P.giveWeapon('pistol'); P.selectSlotForce(1); }
        else if (['molotov', 'pipebomb', 'bile'].includes(w)) { P.inv.throwable = w; P.selectSlotForce(2); }
        else if (w === 'medkit') { P.inv.medkit = true; P.selectSlotForce(3); }
        else if (w === 'pills' || w === 'adrenaline') { P.inv.pills = w; P.selectSlotForce(4); }
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
        else if (act === 'windup') { vm.event('throwWindup'); g.advance(k); }
        else if (act === 'throw') { vm.event('throwWindup'); g.advance(0.4); vm.event('throw'); g.advance(k); }
        else if (act === 'heal') { vm.event('actionStart', { type: 'heal', dur: 5 }); g.advance(k); }
        else if (act === 'pillsA') { vm.event('actionStart', { type: 'pills', dur: 1 }); g.advance(k); }
        else if (act === 'shove') { vm.event('shove'); g.advance(k); }
        else if (act === 'draw') { vm.event('draw'); g.advance(k); }
        else if (act === 'reload') { W.clip = Math.max(1, Math.floor(W.maxClip / 2)); W.reserve = Math.max(W.reserve, 100); W.startReload(); g.advance(k * d.reload * (W.dual ? 1.35 : 1)); }
        g.advance(0.0001);
        g.renderer.render(0.0001, g);
        const cv = g.renderer.r.domElement, cc = document.createElement('canvas');
        const chh = Math.round(cw * 0.5625); cc.width = cw; cc.height = chh;
        const G = cc.getContext('2d');
        G.drawImage(cv, 0, 0, cw, chh);
        G.fillStyle = '#000a'; G.fillRect(0, 0, 220, 18); G.fillStyle = '#fff'; G.font = '13px sans-serif'; G.fillText(`${w} ${act} ${k}`, 4, 13);
        return { w: P.activeItem, vm: vm.type, anim: vm.anim?.type || null, evs: evs.join(' '), img: cc.toDataURL('image/jpeg', 0.9) };
      } catch (e) { return 'ERR ' + e.message + ' ' + (e.stack || '').split('\n')[1]; } finally { vm0.event = oe; }
    }, [w, act, k, i, CWV]);
    if (r && r.img) { imgs.push(Buffer.from(r.img.split(',')[1], 'base64')); delete r.img; fs.writeFileSync(`${cellDir}/${String(i).padStart(3, '0')}.jpg`, imgs[imgs.length - 1]); } else imgs.push(null);
    console.log(i, w, act, k, JSON.stringify(r));
    i++;
  }
  // contact sheet (5 columns) via python/PIL
  const dir = fs.mkdtempSync('/tmp/vmanim-');
  imgs.forEach((b, j) => { if (b) fs.writeFileSync(`${dir}/${String(j).padStart(3, '0')}.jpg`, b); });
  const out = `tests/out/${process.env.OUT || 'vm_anim_grid'}.png`;
  const { execSync } = await import('child_process');
  execSync(`python3 -c "import glob,sys;from PIL import Image;fs=sorted(glob.glob('${dir}/*.jpg'));ims=[Image.open(f) for f in fs];w,h=ims[0].size;n=${imgs.length};C=${+(process.env.COLS || 5)};S=Image.new('RGB',(C*w,((n+C-1)//C)*h));[S.paste(im,((int(f[-7:-4])%C)*w,(int(f[-7:-4])//C)*h)) for f,im in zip(fs,ims)];S.save('${out}')"`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(cellDir, { recursive: true, force: true });
  console.log('wrote', out);
  console.log('errors:', logs.filter((l) => /error/i.test(l) && !/WebGL|GL_INVALID/.test(l)).length);
};
