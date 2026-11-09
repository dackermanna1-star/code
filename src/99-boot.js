// Boot: build every system, show the title screen over a live backdrop of Level 0.
(async () => {
  const app = document.getElementById('app');
  const game = (window.__game = new BackroomsGame(app));
  const q = new URLSearchParams(location.search);
  game.enemies = new EnemyManager(game);
  game.director = new Director(game, game.enemies);
  game.hud = new Hud(game, game.director);
  game.screens = new Screens(game, game.director, game.hud);
  game.shop = new Shop(game, game.director);
  game.sfx = new Sfx(game);
  game.session = new Session(game);
  game.post = new BodycamPost(game);
  game.hooks.push({ resize: (w, h) => game.post.resize(w, h) });
  game.applySettings();
  // backdrop
  game.buildLevel(1, 7741);
  game.player.yaw = 0.6;
  await game.vm.prepare('pistol');
  await game.vm.equip(game.arsenal.gun, true);
  game.arsenal.state = 'idle';
  game.state = 'menu';
  game.screens.open('start');
  const loading = game.screens.s.start.querySelector('.loading');
  loading.textContent = 'LOADING ASSETS…';
  Promise.all([...new Set(Object.values(ENEMY_TYPES).flatMap((t) => t.looks))].slice(0, 6).map((l) => Assets.gltf('characters/' + l))).then(() => (loading.textContent = ''));
  const menuSpin = { frame: (dt) => { if (game.state === 'menu') game.player.yaw += dt * 0.05; } };
  game.hooks.push(menuSpin);
  if (q.has('fast')) {
    // headless testing: tiny render, no post, many simulation steps per frame
    game.renderer.setPixelRatio(0.2);
    game.post.enabled = false;
    game.maxSteps = 12;
    game.maxFrameDt = 0.2;
    game.resize();
  }
  if (q.has('debug')) {
    game.debugRun = true;
    window.__lab = { Lab, T3, Assets };
    window.__dbg = {
      start: () => game.startRun(),
      look(yaw, pitch) { game.player.yaw = yaw; game.player.pitch = pitch; },
      give(id) { const w = game.arsenal.give(id); return w.id; },
      fire(on) { game.input.fire = on; },
      ads(on) { game.input.ads = on; },
      key(code, down) { if (down) { game.input.keys.add(code); game.input.pressed.add(code); } else game.input.keys.delete(code); },
      spawn(type, dist = 6) {
        const P = game.player, L = game.level;
        let pt = null;
        for (let k = 0; k < 60 && !pt; k++) {
          const a = P.yaw + (k ? (Math.random() - 0.5) * 1.2 : 0), d = dist * (k ? 0.6 + Math.random() * 0.8 : 1);
          const x = P.pos.x - Math.sin(a) * d, z = P.pos.z - Math.cos(a) * d;
          if (L.free(x, z, 0.45)) pt = new I(x, 0, z);
        }
        if (!pt) return Promise.resolve('no spot');
        return game.enemies.spawn(type, pt, Math.atan2(P.pos.x - pt.x, P.pos.z - pt.z)).then((a) => [!!a, +pt.x.toFixed(1), +pt.z.toFixed(1)]);
      },
      god(on = true) { game.godMode = on; },
      bot(on = true) {
        // test pilot: turn towards the nearest visible enemy and shoot
        game.botOn = on;
        if (game._bot) return on;
        game._bot = { frame: () => {
          if (!game.botOn || game.state !== 'play') return;
          const P = game.player, eye = P.eye(new I());
          let best = null, bd = 1e9;
          for (const a of game.enemies.alive) {
            const c = a.p.rd.segments.chest.body.pos;
            const d = Math.hypot(c.x - eye.x, c.z - eye.z);
            if (d < bd && game.level.visible(eye, c)) { bd = d; best = c; }
          }
          if (!best) { game.input.fire = false; return; }
          const yaw = Math.atan2(-(best.x - eye.x), -(best.z - eye.z));
          const pitch = Math.atan2(best.y - eye.y, bd);
          P.yaw += wrapAngle(yaw - P.yaw) * 0.35;
          P.pitch += (pitch - P.pitch) * 0.35;
          game.input.fire = Math.abs(wrapAngle(yaw - P.yaw)) < 0.06 && !game.input.fire;
        } };
        game.hooks.push(game._bot);
        return on;
      },
      killAll() { for (const a of game.enemies.alive) { a.lastHit = { by: 'player', seg: 'chest', time: game.time }; if (a.p.injury.alive) a.p.injury.kill('debug'); a.tough = 0; } game.director.queue.length = 0; return 'ok'; },
      events: [],
      // put the player in open floor with a clear line to an enemy dist metres away
      async arena(type, dist = 3.5) {
        const L = game.level, P = game.player;
        for (let k = 0; k < 400; k++) {
          const c = Math.floor(Math.random() * L.n * L.n);
          const a = L.cellCenter(c);
          if (!L.free(a.x, a.z, 0.8)) continue;
          const ang = Math.random() * Math.PI * 2;
          const bx = a.x + Math.sin(ang) * dist, bz = a.z + Math.cos(ang) * dist;
          if (!L.free(bx, bz, 0.6) || !L.visible({ x: a.x, y: 1.5, z: a.z }, { x: bx, y: 1.5, z: bz })) continue;
          P.pos.set(a.x, 0, a.z);
          P.yaw = Math.atan2(-(bx - a.x), -(bz - a.z));
          P.pitch = -0.08;
          const ai = await game.enemies.spawn(type, new I(bx, 0, bz), Math.atan2(a.x - bx, a.z - bz));
          return !!ai;
        }
        return false;
      },
      info() { const p = game.player; return { simT: +game.time.toFixed(1), frames: game.frames, pos: [+p.pos.x.toFixed(2), +p.pos.z.toFixed(2)], hp: p.health, err: game.lastError || null, people: game.sb.people.length, gun: game.arsenal.gun.id, astate: game.arsenal.state, ammo: game.arsenal.gun.ammo, dstate: game.director.state, wave: game.director.wave, cash: game.director.cash, enemies: game.enemies.list.map((a) => ({ t: a.type, mode: a.mode, vis: a.visible, tough: Math.round(a.tough), down: a.downed, cm: a.p.ctl.mode, shots: a.shotsFired || 0, aim: a.aiming, wf: a.wantFire, tok: a.token, head: +(a.p.ctl.heading).toFixed(2) })) }; },
    };
    window.__game_debug = { ok: true };
  }
  game.run();
})().catch((e) => { console.error(e); window.__game_debug = { error: String(e && e.stack || e) }; });
