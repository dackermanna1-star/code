// Shared helpers for the combat QA playtests (dev/qa-combat-*.cjs).
const { chromium } = require('playwright');
const PORT = process.env.PORT || 5301;

async function boot(opts = {}) {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: opts.fast ? { width: 640, height: 360 } : { width: 1280, height: 720 } });
  const errors = [];
  p.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') errors.push(t + ': ' + m.text().slice(0, 400));
    if (opts.log && t === 'log') console.log('[page]', m.text().slice(0, 300));
  });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
  await p.goto(`http://localhost:${PORT}/?autostart=1&test=1&seed=${opts.seed || 'millbrook'}`);
  await p.waitForFunction(() => window.game && window.game.state === 'playing', null, { timeout: 240000 });
  const ev = (fn, arg) => p.evaluate(fn, arg);
  if (opts.fast) await ev(() => { window.__fast = true; });
  if (!opts.keepUi) await p.addStyleTag({ content: '.hints,.banner,.subtitle,.toasts{display:none!important}' }).catch(() => {});
  // stand somewhere open: a residential POI road, midday, clear, no random spawns, invulnerable
  await ev(async () => {
    const g = window.game;
    g.noSpawn = true;
    for (const z of g.zombies.zombies) z.dead = true;
    g.zombies.zombies.length = 0;
    g.time = g.computeTime(Math.floor(g.time.totalHours / 24) * 24 + 12);
    g.weatherSys.set('clear', true);
    g.chunks.budgetMs = 60;
    if (window.__fast) { g.settings.renderDistance = 4; g.settings.quality = 'low'; g.applySettings(); }
    window.__god = true;
    const hurt = g.survival.hurt.bind(g.survival);
    g.survival.hurt = (a, c, s) => { if (!window.__god) hurt(a, c, s); };
    const zh = g.zombieHitsPlayer.bind(g);
    g.zombieHitsPlayer = (z) => { if (!window.__god) zh(z); };
    const { createItem } = await import('/src/items/items.js');
    window.__ci = createItem;
    window.__toasts = [];
    const toast = g.ui.toast.bind(g.ui);
    g.ui.toast = (t, k) => { window.__toasts.push(t); return toast(t, k); };
    window.__sounds = [];
    const play = g.audio.play.bind(g.audio);
    g.audio.play = (n, o) => { window.__sounds.push(n); if (window.__sounds.length > 400) window.__sounds.shift(); return play(n, o); };
  });
  const shot = async (name) => {
    await p.screenshot({ path: `dev/out/qa-combat-${name}.png`, timeout: 120000 }).catch((e) => console.log('shot fail', name, e.message.split('\n')[0]));
  };
  const tp = (x, y, z, yaw, pitch = 0) => ev(([x, y, z, yaw, pitch]) => { const P = window.game.player; P.x = x; P.y = y; P.z = z; P.vx = P.vy = P.vz = 0; P.yaw = yaw; P.pitch = pitch; }, [x, y, z, yaw, pitch]);
  /** give + select an item in hotbar slot `slot` */
  const hold = (id, o = {}, slot = 0) => ev(([id, o, slot]) => {
    const g = window.game, P = g.player;
    P.inv.hotbar[slot] = id ? window.__ci(id, o) : null;
    P.inv.selected = slot;
    P.inv.changed();
    g.combat.syncHeld();
    return P.inv.hotbar[slot];
  }, [id, o, slot]);
  const give = (id, count = 1) => ev(([id, count]) => { const g = window.game; g.player.inv.addItem(window.__ci(id, { count })); g.player.inv.changed(); }, [id, count]);
  /** spawn a zombie `dist` m in front of the player */
  const spawnFront = (dist = 5, o = {}, side = 0) => ev(([dist, o, side]) => {
    const g = window.game, P = g.player;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const z = g.zombies.spawn(P.x + fx * dist + rx * side, P.y, P.z + fz * dist + rz * side, { variant: 'walker', ...o });
    z.yaw = P.yaw; // face the player
    (window.__zmap || (window.__zmap = {}))[z.id] = z;
    return z.id;
  }, [dist, o, side]);
  /** find a flat open spot near a POI type */
  const openSpot = async (type = 'residential') => {
    const pos = await ev((type) => {
      const g = window.game, w = g.world;
      const q = w.pois.find((q) => q.type === type) || w.pois[0];
      const cx = Math.floor((q.x0 + q.x1) / 2), cz = Math.floor((q.z0 + q.z1) / 2);
      for (let r = 0; r < 60; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = cx + dx, z = cz + dz;
        let ok = true;
        const y0 = w.surfaceY(x, z);
        for (let ox = -2; ox <= 2 && ok; ox++) for (let oz = -12; oz <= 2 && ok; oz++) {
          if (w.surfaceY(x + ox, z + oz) !== y0) ok = false;
          for (let y = y0; y < y0 + 3; y++) if (w.get(x + ox, y, z + oz)) ok = false;
        }
        if (ok) return { x: x + 0.5, y: y0, z: z + 0.5 };
      }
      return { x: cx + 0.5, y: w.surfaceY(cx, cz), z: cz + 0.5 };
    }, type);
    return pos;
  };
  const aimAt = (zi, part = 'head') => ev(([zi, part]) => {
    const g = window.game, P = g.player, z = window.__zmap[zi];
    const THREE = g.renderer.camera.position.constructor;
    const tp = z.visual.getPartPosition(part, new THREE());
    const cam = g.renderer.camera.position;
    const dx = tp.x - cam.x, dy = tp.y - cam.y, dz = tp.z - cam.z;
    P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, [zi, part]);
  const zinfo = (zi) => ev((zi) => { const z = window.__zmap[zi]; return z ? { hp: +(z.hp ?? z.health ?? -1).toFixed?.(1), dead: !!z.dead, state: z.state, x: +z.x.toFixed(2), z: +z.z.toFixed(2) } : null; }, zi);
  const wait = (ms) => p.waitForTimeout(ms);
  /** wait until `sec` seconds of GAME time have passed (software rendering runs the game slower than real time) */
  const gwait = async (sec, until = null) => {
    const t0 = await ev(() => window.game.clock);
    for (let i = 0; i < 600; i++) {
      await p.waitForTimeout(80);
      const r = await ev(([t0, sec, until]) => { const g = window.game; const doneT = g.clock - t0 >= sec; const u = until ? new Function('g', 'return (' + until + ')')(g) : false; return { done: doneT || u, t: g.clock - t0 }; }, [t0, sec, until]);
      if (r.done) return r.t;
    }
    return -1;
  };
  const done = async () => {
    const uniq = [...new Set(errors)];
    console.log('errors (' + uniq.length + '):\n' + uniq.slice(0, 40).join('\n'));
    await b.close();
  };
  return { b, p, ev, shot, tp, hold, give, spawnFront, openSpot, aimAt, zinfo, wait, gwait, done, errors };
}

module.exports = { boot };
