// Boot: build every system, show the title screen over a live backdrop of Level 0.
(async () => {
  const app = document.getElementById('app');
  const game = (window.__game = new BackroomsGame(app));
  const q = new URLSearchParams(location.search);
  game.enemies = new EnemyManager(game);
  game.director = new Director(game, game.enemies);
  game.hud = new Hud(game, game.director);
  game.minimap = new Minimap(game);
  game.blood = new BloodPools(game);
  game.screens = new Screens(game, game.director, game.hud);
  game.shop = new Shop(game, game.director);
  game.sfx = new Sfx(game);
  game.medkits = new Medkits(game);
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
  if (q.has('center')) {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:50%;top:50%;width:4px;height:4px;margin:-2px;background:#0f0;z-index:99;pointer-events:none';
    document.body.appendChild(d);
  }
  if (q.has('debug')) {
    game.debugRun = true;
    window.__lab = { Lab, T3, Assets, AnimBody, ANIM, SPRINT_POSE };
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
          const a = P.yaw + (Math.random() - 0.5) * 1.6, d = dist * (0.6 + Math.random() * 0.8);
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
      // side-on orthographic picture of a rig with its measured points (tuning aid)
      async rigSide(id) {
        const T = __lab.T3, vm = game.vm, rig = await vm.prepare(id);
        rig.root.position.set(0, 0, 0); rig.root.quaternion.identity(); rig.root.scale.set(1, 1, 1);
        rig.player.layers.length = 0; rig.player.play(rig.def.clips.idle, { fade: 0 }); rig.player.update(0); rig.root.updateMatrixWorld(true);
        const F = rig.frame, S = rig.S;
        game.screens.close(); game.hud.show(false);
        const sc = new T.Scene(); sc.background = new T.Color(0x334455);
        sc.add(new T.HemisphereLight(0xffffff, 0x444444, 2));
        const parent = rig.root.parent; sc.add(rig.root);
        const mark = (p, col, r = 0.008) => { const m = new T.Mesh(new T.SphereGeometry(r * S, 10, 8), new T.MeshBasicMaterial({ color: col, depthTest: false })); m.position.copy(p); m.renderOrder = 99; sc.add(m); return m; };
        const head = new T.Vector3().setFromMatrixPosition(rig.headCam.matrixWorld);
        const marks = [mark(head, 0xffff00, 0.014), mark(F.muzzle, 0xff0000), mark(F.rear, 0x0000ff),
          mark(F.c.clone().addScaledVector(F.f, F.headF).addScaledVector(F.u, F.sightU).addScaledVector(F.r, F.muzR), 0x00ff00, 0.012),
          mark(new T.Vector3().setFromMatrixPosition(rig.camHip), 0xff00ff, 0.012), mark(new T.Vector3().setFromMatrixPosition(rig.camAds), 0x00ffff, 0.012)];
        const box = new T.Box3().setFromObject(rig.root);
        const ctr = F.c.clone();
        const span = F.len * 1.4;
        const cam = new T.OrthographicCamera(-span / 2 * 16 / 9, span / 2 * 16 / 9, span / 2, -span / 2, -50, 50);
        cam.position.copy(ctr).addScaledVector(F.r, 5); cam.up.copy(F.u); cam.lookAt(ctr); cam.updateMatrixWorld();
        const r = game.renderer; const prev = game.post.enabled; game.post.enabled = false;
        game._rigSide = { sc, cam };
        const stopAt = performance.now() + 2500;
        const hook = { afterRender: () => { if (performance.now() < stopAt) { r.setRenderTarget(null); r.clear(); r.render(sc, cam); } else { game.hooks.splice(game.hooks.indexOf(hook), 1); for (const m of marks) sc.remove(m); if (parent) parent.add(rig.root); game.post.enabled = prev; } } };
        game.hooks.push(hook);
        return { S, headF: +F.headF.toFixed(3), headU: +F.headU.toFixed(3), headR: +F.headR.toFixed(3), sightU: +F.sightU.toFixed(3), muzU: +F.muzU.toFixed(3), muzR: +F.muzR.toFixed(3), len: +F.len.toFixed(3) };
      },
      async rigInfo(id) {
        const vm = game.vm, rig = await vm.prepare(id);
        const T = __lab.T3;
        rig.root.position.set(0, 0, 0); rig.root.quaternion.identity(); rig.root.scale.set(1, 1, 1);
        rig.player.layers.length = 0; rig.player.play(rig.def.clips.idle, { fade: 0 }); rig.player.update(0); rig.root.updateMatrixWorld(true);
        const pts = []; const v = new T.Vector3();
        for (const m of rig.gunMeshes) { const pos = m.geometry.attributes.position; const st = Math.max(1, Math.floor(pos.count / 3000)); for (let i = 0; i < pos.count; i += st) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); pts.push(v.clone()); } }
        const c = new T.Vector3(); for (const p of pts) c.add(p); c.multiplyScalar(1 / pts.length);
        // covariance -> principal axis by power iteration
        const C = [[0,0,0],[0,0,0],[0,0,0]];
        for (const p of pts) { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += d[a] * d[b]; }
        let ax = [1, 0.3, 0.2]; for (let k = 0; k < 50; k++) { const n = [0,1,2].map((a) => C[a][0]*ax[0] + C[a][1]*ax[1] + C[a][2]*ax[2]); const l = Math.hypot(...n); ax = n.map((x) => x / l); }
        const hc = new T.Vector3().setFromMatrixPosition(rig.headCam.matrixWorld);
        const hq = new T.Quaternion(); rig.headCam.matrixWorld.decompose(new T.Vector3(), hq, new T.Vector3());
        const r = (x) => +x.toFixed(3);
        return { id, n: pts.length, centre: c.toArray().map(r), axis: ax.map(r), head: hc.toArray().map(r), headQ: hq.toArray().map(r),
          bbMin: [Math.min(...pts.map(p=>p.x)), Math.min(...pts.map(p=>p.y)), Math.min(...pts.map(p=>p.z))].map(r), bbMax: [Math.max(...pts.map(p=>p.x)), Math.max(...pts.map(p=>p.y)), Math.max(...pts.map(p=>p.z))].map(r), arms: rig.meshes.filter(m=>m.userData.arms).length, gunMeshes: rig.gunMeshes.map(m => m.material.name + ':' + m.geometry.attributes.position.count) };
      },
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
