// Character model gallery: survivor portraits (front/side/close-up), a crowd
// of commons in every outfit, each special infected and first-person arms.
// TAG=before|after SHOTS=surv,crowd,specials,vm QUALITY=medium node tests/play.mjs tests/scen_models.mjs
export default async ({ page, evalg, wait, shot, logs }) => {
  const TAG = process.env.TAG || 'x';
  const SHOTS = (process.env.SHOTS || 'surv,crowd,specials,vm').split(',');
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=' + (process.env.CH || 0));
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const P = JSON.parse(process.env.POS || '[40,0.15,30]');
  await evalg((P) => {
    const g = window.game;
    g.cheats.godAll = true; g.cheats.botsIdle = true; g.director.enabled = false;
    for (const c of [...g.infected.commons]) c.hp = 0;
    g.player.teleport(P[0], P[1], P[2], 0);
    g.advance(0.5);
    for (const c of [...g.infected.corpses]) c.body.visible = false;
    window.__P = P;
    window.__place = (s, x, z, yaw) => { s.teleport(P[0] + x, P[1], P[2] + z, yaw); };
    window.__cam = (x, y, z, lx, ly, lz) => {
      const cam = g.renderer.camera;
      g.hooks.cutscene = () => { cam.position.set(P[0] + x, P[1] + y, P[2] + z); cam.lookAt(P[0] + lx, P[1] + ly, P[2] + lz); cam.updateMatrixWorld(); };
    };
    window.__camOff = () => { g.hooks.cutscene = null; };
  }, P);
  const snap = async (name) => { await evalg(() => { window.game.hud.root.style.display = 'none'; }); await wait(250); await shot(`mdl_${TAG}_${name}`); };

  if (SHOTS.includes('surv')) {
    await evalg(() => {
      const g = window.game;
      g.player.model.setHidden(false);
      g.survivors.forEach((s, i) => window.__place(s, -1.35 + i * 0.9, -2.6, Math.PI + 0.3 - i * 0.2));
      window.__cam(0, 1.45, 0.2, 0, 1.0, -2.6);
      g.advance(0.6);
    });
    await snap('lineup');
    for (let k = 0; k < 4; k++) {
      const id = await evalg((k) => {
        const g = window.game;
        g.survivors.forEach((x, i) => { if (i !== k) window.__place(x, 8 + i, 8, 0); });
        const s = g.survivors[k];
        window.__place(s, 0, -2, Math.PI);
        window.__cam(0.05, 1.6, -1.25, 0, 1.55, -2);
        g.advance(0.4);
        return s.char.id;
      }, k);
      await snap('face_' + id);
      await evalg(() => { window.__cam(0.75, 1.6, -1.95, 0, 1.55, -2); window.game.advance(0.1); });
      await snap('side_' + id);
      await evalg(() => { window.__cam(0.9, 1.3, -0.4, 0, 1.0, -2); window.game.advance(0.1); });
      await snap('body_' + id);
    }
    await evalg(() => {
      const g = window.game;
      g.survivors.forEach((x, i) => window.__place(x, -1.4 + i * 0.95, -2.4, Math.PI));
      g.survivors[0].incapped = true;
      g.survivors[1].crouchT = 1;
      window.__cam(0, 1.5, 0.3, 0, 0.8, -2.4);
      g.advance(0.8);
    });
    await snap('poses');
    await evalg(() => { const g = window.game; for (const x of g.survivors) x.incapped = false; g.player.model.setHidden(true); g.advance(0.2); });
  }

  if (SHOTS.includes('crowd')) {
    const res = await evalg(() => {
      const g = window.game;
      g.survivors.forEach((x, i) => window.__place(x, 8 + i, 8, 0));
      const outfits = ['civilian', 'civilian', 'hospital', 'worker', 'police', 'subway', 'airport', 'office'];
      const nav = g.level.nav; let n = 0; const P = window.__P;
      for (let row = 0; row < 3; row++) for (let i = 0; i < 8; i++) {
        const x = P[0] - 3.2 + i * 0.9 + (row % 2) * 0.4, z = P[2] - 3.0 - row * 1.3;
        const node = nav.nearestNode(x, P[1], z, 3);
        if (node < 0) continue;
        const c = g.infected.spawnCommon(x, nav.nodeY[node], z, { outfit: outfits[(i + row * 3) % outfits.length], idle: 'stand', yaw: 0 });
        if (c) { c.placeAt?.(x, nav.nodeY[node], z); c.yaw = (Math.random() - 0.5) * 0.6; c.think = () => {}; n++; }
      }
      window.__cam(0, 1.6, 0.5, 0, 1.1, -4);
      g.advance(0.5);
      return n;
    });
    console.log('crowd spawned', res);
    await snap('crowd');
    await evalg(() => { window.__cam(-0.6, 1.6, -1.6, -1.2, 1.3, -3.2); window.game.advance(0.1); });
    await snap('crowd_close');
    await evalg(() => { window.__cam(1.2, 1.6, -1.6, 1.6, 1.3, -3.2); window.game.advance(0.1); });
    await snap('crowd_close2');
    // dismemberment + ragdolls (real player camera)
    await evalg(() => {
      const g = window.game;
      window.__camOff();
      window.__place(g.player, 0, 0, 0); g.player.pitch = -0.2;
      g.player.giveWeapon('autoShotgun');
      g.viewmodel.visible = true;
      for (const c of g.infected.commons) c.think = undefined;
      for (let k = 0; k < 8; k++) { g.testCmd = { fire: true, firePressed: true }; g.player.yaw = Math.sin(k) * 0.35; g.player.pitch = -0.2 + (k % 3) * 0.12; g.advance(0.3); }
      g.testCmd = null; g.player.yaw = 0; g.player.pitch = -0.45; g.advance(1.5);
    });
    await snap('gore');
    await evalg(() => { const g = window.game; for (const c of [...g.infected.commons]) c.hp = 0; g.advance(0.1); g.infected.clear(); g.advance(0.1); });
  }

  if (SHOTS.includes('specials')) {
    for (const kind of ['hunter', 'smoker', 'boomer', 'tank', 'witch']) {
      await evalg((kind) => {
        const g = window.game; const P = window.__P;
        for (const s of [...g.infected.specials]) s.remove();
        g.infected.specials.length = 0;
        g.survivors.forEach((x, i) => window.__place(x, 8 + i, 8, 0));
        const nav = g.level.nav;
        const d = 3;
        const node = nav.nearestNode(P[0], P[1], P[2] - d, 3);
        const sp = g.director.spawnSpecial(kind, { node });
        if (sp) {
          sp.think = () => { sp.curSpeed = 0; };
          sp.placeAt(P[0], nav.nodeY[node], P[2] - d);
          sp.yaw = Math.PI + 0.4;
          if (kind === 'witch') sp.state = 'sit';
        }
        const h = kind === 'tank' ? 1.6 : 1.2;
        const dist = kind === 'tank' ? 3.4 : 2.3;
        window.__cam(0.4, h + 0.35, -d + dist, 0, h, -d);
        g.advance(0.5);
      }, kind);
      await snap('sp_' + kind);
      await evalg((kind) => { const h = kind === 'tank' ? 2.4 : 1.55; window.__cam(0.3, h + 0.05, -3 + 0.9 + (kind === 'tank' ? 0.6 : 0), 0, h - 0.05, -3); window.game.advance(0.1); }, kind);
      await snap('sp_' + kind + '_face');
    }
    await evalg(() => { const g = window.game; for (const s of [...g.infected.specials]) s.remove(); g.infected.specials.length = 0; });
  }

  if (SHOTS.includes('vm')) {
    await evalg(() => window.__camOff());
    for (const ch of ['bill', 'zoey', 'louis', 'francis']) {
      for (const w of (process.env.VMW || 'pistol,rifle,pumpShotgun').split(',')) {
        await evalg(([ch, w]) => {
          const g = window.game; g.viewmodel.visible = true;
          g.player.char = g.survivors.find((s) => s.char.id === ch)?.char || g.player.char;
          window.__place(g.player, 0, 0, 0); g.player.pitch = 0.05;
          g.player.giveWeapon(w); g.advance(1.0);
        }, [ch, w]);
        await snap(`vm_${ch}_${w}`);
      }
    }
  }
  console.log('errors', logs.filter((l) => /error/i.test(l)).length);
};
