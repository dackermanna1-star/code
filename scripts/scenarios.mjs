// Scenarios for scripts/smoke.mjs. Each receives { page, shot, wait, run }.
export async function teleport(run, wait, x, y, z, yaw = 0, pitch = 0) {
  await run(([x, y, z, yaw, pitch]) => {
    const p = window.game.player;
    p.body.x = x; p.body.y = y; p.body.z = z; p.body.vx = p.body.vy = p.body.vz = 0;
    p.eyeY = y + p.eyeHeight();
    p.yaw = yaw; p.pitch = pitch;
    window.game.streamer.update(x, y, z);
  }, [x, y, z, yaw, pitch]);
  for (let i = 0; i < 40; i++) {
    await wait(500);
    const s = await run(() => ({ inflight: window.game.streamer.stats.inflight, dirty: window.game.world.meshDirty.size }));
    if (s.inflight === 0 && s.dirty < 40 && i > 3) break;
  }
}

async function hold(run, wait, button, ms) {
  await run((b) => window.game.input.simulateMouse(b, true), button);
  await wait(ms);
  await run((b) => window.game.input.simulateMouse(b, false), button);
}

async function key(run, wait, code, ms = 60) {
  await run((c) => window.game.input.simulateKey(c, true), code);
  await wait(ms);
  await run((c) => window.game.input.simulateKey(c, false), code);
}

export default {
  async start({ shot, wait, run }) {
    await wait(2500);
    await run(() => { const p = window.game.player; p.yaw = 2.09; p.pitch = 0.22; window.debug.toggleOverlay(); });
    await wait(800);
    await shot('pillar');
  },
  async timing({ wait, run }) {
    const pts = await run(() => window.game.streamer.gen.routePoints[0]);
    const p = pts[Math.floor(pts.length * 0.5)];
    await teleport(run, wait, p.x, p.y - 3, p.z, 0.5, -0.1);
    await wait(4000);
    for (let i = 0; i < 3; i++) {
      await wait(2000);
      console.log('timings', JSON.stringify(await run(() => Object.fromEntries(Object.entries(window.game.timings).map(([k, v]) => [k, +v.toFixed(2)])))), 'enemies', await run(() => window.run.enemies.list.filter((e) => !e.sleeping).length));
    }
  },
  async win({ shot, wait, run }) {
    await wait(1000);
    // final chamber lies in the last holy mountain band: floor = band.bottom + 10
    const floor = 1920 - 5 * 320 - 256 - 64 + 10;
    await teleport(run, wait, 118.5, floor + 0.1, 128.5, -Math.PI / 2, -0.15);
    await wait(1500);
    await shot('chamber');
    const st = await run(() => ({ sampo: window.run.pickups.list.filter((p) => p.kind === 'sampo').length }));
    console.log('sampo', JSON.stringify(st));
    await run(() => { const r = window.run; const pk = r.pickups.list.find((p) => p.kind === 'sampo'); if (pk) r.progression.interact(pk); });
    await wait(800);
    await shot('won');
    console.log('state', await run(() => window.game.state));
  },
  async longsession({ wait, run, page }) {
    const mem = async (label) => {
      await run(() => { if (window.gc) { window.gc(); window.gc(); } });
      await wait(300);
      const m = await run(() => ({
        heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
        geos: window.game.renderer.info.memory.geometries,
        tex: window.game.renderer.info.memory.textures,
        progs: window.game.renderer.info.programs?.length ?? -1,
      }));
      console.log(label, JSON.stringify(m));
    };
    for (let cycle = 0; cycle < 4; cycle++) {
      await wait(1500);
      // fight: spawn and kill enemies, explode terrain, then die and restart
      await run(() => {
        const g = window.game, r = window.run, b = g.player.body;
        for (let i = 0; i < 25; i++) {
          const e = r.enemies.spawn(['hamis', 'shotgunner_weak', 'slime_weak', 'stendari'][i % 4], b.x + (Math.random() - 0.5) * 30, b.y + 4, b.z + 10 + Math.random() * 20, 0, { next: Math.random, range: (a, c) => a + (c - a) * Math.random(), chance: (q) => Math.random() < q, int: (a, c) => a + Math.floor(Math.random() * (c - a + 1)) });
          if (e) r.damage.apply({ target: e, amount: 999, type: 'explosion', source: g.player, x: 0, y: 0, z: 0 });
        }
        for (let i = 0; i < 8; i++) g.destruction.explode(b.x + (Math.random() - 0.5) * 40, b.y - 2, b.z + 15 + Math.random() * 20, { radius: 8, durability: 11, rayEnergy: 1500, fire: true });
      });
      await wait(3000);
      await mem(`cycle${cycle}-play`);
      await run(() => { const p = window.game.player; window.run.damage.apply({ target: p, amount: 999, type: 'explosion', source: null, x: 0, y: 0, z: 0 }); });
      await wait(2000);
      await page.click('text=Start a new run');
      await page.waitForFunction(() => window.game && window.game.state === 'playing', null, { timeout: 120000 });
      await mem(`cycle${cycle}-restarted`);
    }
  },
  async pickup({ shot, wait, run }) {
    await wait(1500);
    await run(() => {
      const g = window.game, r = window.run, p = g.player;
      p.yaw = Math.PI; p.pitch = -0.72;
      const w = window.__makeWand('LIGHT_BULLET_TRIGGER');
      w.stats.name = 'Bolt staff'; w.stats.capacity = 6; w.stats.castDelay = 4; w.stats.manaMax = 300; w.stats.spriteSeed = 99;
      r.pickups.add('wand', p.body.x, p.body.y + 0.5, p.body.z + 7, { wand: w });
    });
    await wait(1200);
    await shot('wand');
    await run(() => window.run.interact());
    await wait(500);
    await shot('taken');
    console.log('wands', JSON.stringify(await run(() => window.run.inv.wands.map((w) => w && w.stats.name))));
  },
  async tour({ shot, wait, run }) {
    await run(() => { window.game.player.noclip = true; window.debug.godMode = true; });
    const pts = await run(() => window.game.streamer.gen.routePoints.map((r) => [r[0], r[Math.floor(r.length * 0.35)], r[Math.floor(r.length * 0.7)]]));
    await teleport(run, wait, 128.5, 1950, 70, Math.PI, -0.15);
    await shot('entrance');
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i][1];
      await teleport(run, wait, p.x, p.y - 4, p.z, i * 1.3, -0.1);
      await wait(800);
      await shot(`layer${i}`);
    }
    const hm = 1920 - 256 - 64 + 18;
    await teleport(run, wait, 112, hm + 2, 128, -Math.PI / 2 - 0.3, -0.1);
    await shot('holymountain');
  },
  async allspells({ shot, wait, run }) {
    await wait(1500);
    const pts = await run(() => window.game.streamer.gen.routePoints[0]);
    const p = pts[Math.floor(pts.length * 0.45)];
    await teleport(run, wait, p.x, p.y - 3, p.z, 0.3, -0.1);
    await run(() => { window.debug.godMode = true; window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message))); });
    const ids = await run(() => Object.keys(window.run.constructor ? {} : {}).concat(Object.keys(window.__SPELLS || {})));
    const all = await run(() => {
      const mod = window.run;
      return Object.keys(mod.__spells || {});
    });
    void ids; void all;
    const list = await run(() => window.__spellIds);
    const results = [];
    for (const id of list) {
      const r = await run((id) => {
        try {
          const run = window.run, g = window.game;
          const w = window.__makeWand(id);
          run.inv.wands[2] = w;
          run.inv.select(2);
          w.mana = w.stats.manaMax;
          run.tryCast(w);
          for (let i = 0; i < 40; i++) run.projectiles.update(1 / 60);
          return { id, ok: true, proj: run.projectiles.list.length };
        } catch (e) {
          return { id, ok: false, err: String(e && e.stack || e).slice(0, 300) };
        }
      }, id);
      results.push(r);
      await wait(60);
    }
    const bad = results.filter((r) => !r.ok);
    console.log('spells', results.length, 'failed', bad.length, JSON.stringify(bad.slice(0, 5)), 'pageErrors', JSON.stringify(await run(() => window.__errs.slice(0, 5))));
    await shot('end');
  },
  async walk({ shot, wait, run }) {
    await wait(1500);
    // steer along the generator's route: aim at the next route point and hold W (jump when blocked)
    const route = await run(() => window.game.streamer.gen.routePoints[0].map((p) => [p.x, p.y, p.z]));
    let idx = 0;
    const log = [];
    for (let t = 0; t < (Number(process.env.STEPS) || 70); t++) {
      const st = await run((route) => {
        const g = window.game, p = g.player, b = p.body;
        // advance to the closest route point ahead
        let best = 0, bd = 1e9;
        route.forEach((q, i) => { const d = Math.hypot(q[0] - b.x, q[1] - b.y, q[2] - b.z); if (d < bd) { bd = d; best = i; } });
        const tgt = route[Math.min(route.length - 1, best + 2)];
        p.yaw = Math.atan2(-(tgt[0] - b.x), -(tgt[2] - b.z));
        p.pitch = -0.15;
        g.input.simulateKey('KeyW', true);
        const blocked = b.hitWallX || b.hitWallZ;
        g.input.simulateKey('Space', blocked || tgt[1] > b.y + 3);
        return { x: b.x, y: b.y, z: b.z, best, ground: b.onGround, lev: p.levitation };
      }, route);
      log.push(st);
      await wait(500);
      if (t % 14 === 0) await shot('t' + t);
    }
    await run(() => { window.game.input.simulateKey('KeyW', false); window.game.input.simulateKey('Space', false); });
    const last = log[log.length - 1];
    console.log('walk', JSON.stringify({ start: log[0], end: last, maxRouteIdx: Math.max(...log.map((l) => l.best)), routeLen: route.length }));
  },
  async stress({ shot, wait, run }) {
    const pts = await run(() => window.game.streamer.gen.routePoints[0]);
    const p = pts[Math.floor(pts.length * 0.5)];
    await teleport(run, wait, p.x, p.y - 3, p.z, 0.5, -0.2);
    await run(() => { window.debug.godMode = true; });
    const sample = async (label) => {
      const t = [];
      for (let i = 0; i < 10; i++) {
        await wait(300);
        t.push(await run(() => ({ sim: window.game.sim.stats.tickMs, active: window.game.sim.stats.activeChunks, moved: window.game.sim.stats.cellsMoved, frame: window.game.frameMs, mesh: window.game.chunks.stats.lastRebuildMs, dirty: window.game.world.meshDirty.size, parts: window.game.particles.count, proj: window.run.projectiles.list.length })));
      }
      const avg = (k) => (t.reduce((a, b) => a + b[k], 0) / t.length).toFixed(2);
      const max = (k) => Math.max(...t.map((x) => x[k])).toFixed(2);
      console.log(label, `sim avg ${avg('sim')} max ${max('sim')} ms | active ${avg('active')} | moved ${avg('moved')} | frame avg ${avg('frame')} max ${max('frame')} | mesh ${avg('mesh')} | dirty ${avg('dirty')} | particles ${avg('parts')} | proj ${avg('proj')}`);
    };
    await sample('baseline');
    // flood: a big block of water above the player area
    await run(() => {
      const g = window.game, b = g.player.body;
      for (let y = 0; y < 10; y++) for (let z = -14; z < 14; z++) for (let x = -14; x < 14; x++) {
        const X = Math.floor(b.x + x), Y = Math.floor(b.y + 14 + y), Z = Math.floor(b.z + z);
        if (g.world.get(X, Y, Z) === 0) g.world.set(X, Y, Z, 29 + 0 * 1);
      }
    });
    await sample('flood');
    await shot('flood');
    // oil fire + explosions
    await run(() => {
      const g = window.game, b = g.player.body;
      const oil = 31;
      for (let y = 0; y < 4; y++) for (let z = -10; z < 10; z++) for (let x = 12; x < 30; x++) {
        const X = Math.floor(b.x + x), Y = Math.floor(b.y + 6 + y), Z = Math.floor(b.z + z);
        if (g.world.get(X, Y, Z) === 0) g.world.set(X, Y, Z, oil);
      }
      for (let i = 0; i < 20; i++) g.sim.ignite(Math.floor(b.x + 14 + Math.random() * 14), Math.floor(b.y + 3), Math.floor(b.z - 8 + Math.random() * 16), true);
      for (let i = 0; i < 6; i++) g.destruction.explode(b.x + 20 + Math.random() * 20, b.y + Math.random() * 10, b.z - 15 + Math.random() * 30, { radius: 10, durability: 11, rayEnergy: 2500, fire: true });
    });
    await sample('fire+explosions');
    await shot('fire');
    // projectile storm
    await run(() => {
      const r = window.run;
      for (let i = 0; i < 300; i++) {
        const sh = { state: { fireRateWait: 0, spread: 40, speedMult: 1, damageProjectile: 0, damageExplosion: 0, damageFire: 0, damageElectric: 0, damageIce: 0, damageSlice: 0, damageHealing: 0, critChance: 0, explosionRadius: 0, lifetimeAdd: 0, bounces: 0, gravityAdd: 0, knockback: 0, recoil: 0, patternDegrees: 0, extra: [], trailMaterial: null, trailChance: 0, friendlyFire: false, homing: 0, piercing: false, lightRadiusAdd: 0 }, projectiles: [{ projectile: 'rubber_ball' }] };
        const g = window.game, b = g.player.body;
        r.projectiles.fireShot(sh, b.x, b.y + 6, b.z, new window.THREE_V(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize(), null, 40, 1);
      }
    }).catch((e) => console.log('storm skipped', String(e).slice(0, 80)));
    await sample('projectiles');
  },
  async hmexit({ shot, wait, run }) {
    // drop down the first Holy Mountain's exit shaft: it must collapse behind the player without trapping them
    await wait(1000);
    const floor = 1920 - 256 - 64 + 18;
    await run(() => {
      const d = window.run.damage, orig = d.apply.bind(d);
      window.__hurt = [];
      d.apply = (ev) => {
        const r = orig(ev);
        if (ev.target === window.game.player && r > 0) window.__hurt.push(`${ev.type}:${r.toFixed(1)}:${ev.source ? ev.source.kind ?? ev.source.def?.id : '-'}`);
        return r;
      };
    });
    await teleport(run, wait, 146.5, floor + 0.05, 128.5, 0, -0.6);
    await wait(4000);
    const r = await run(() => {
      const b = window.game.player.body;
      return { collapsed: window.run.progression.collapsed.has(0), dy: +(b.y - (1920 - 256 - 64 + 18)).toFixed(1), stuck: b.stuck, hp: window.game.player.hp, hurt: window.__hurt.slice(0, 12) };
    });
    console.log('hmexit', JSON.stringify(r), r.collapsed && !r.stuck && r.dy < -20 ? 'PASS' : 'FAIL');
    console.log('stuck bodies', JSON.stringify(await run(() => {
      const out = [];
      for (const c of window.run.damage.creatures) if (c.body.stuck) out.push(`${c.def?.id ?? c.kind}@${c.body.x.toFixed(0)},${c.body.y.toFixed(0)},${c.body.z.toFixed(0)} sleep=${c.sleeping}`);
      for (const p of window.run.pickups.list) if (p.body.stuck) out.push(`pickup:${p.kind}@${p.body.x.toFixed(0)},${p.body.y.toFixed(0)},${p.body.z.toFixed(0)}`);
      return out;
    })));
    console.log('around', JSON.stringify(await run(() => {
      const g = window.game, b = g.player.body, counts = {};
      for (let y = -4; y < 12; y++) for (let z = -10; z <= 10; z++) for (let x = -10; x <= 10; x++) {
        const m = g.world.get(Math.floor(b.x) + x, Math.floor(b.y) + y, Math.floor(b.z) + z);
        const n = window.__MATERIALS ? window.__MATERIALS[m].name : m;
        counts[n] = (counts[n] ?? 0) + 1;
      }
      return counts;
    })));
    await run(() => { window.game.player.pitch = 1.4; });
    await wait(400);
    await shot('sealed');
  },
  async holymountain({ shot, wait, run }) {
    await wait(1000);
    const floor = 1920 - 256 - 64 + 18;
    await teleport(run, wait, 128.5, floor + 0.05, 122, Math.PI, -0.1);
    await wait(1500);
    const info = await run(() => ({
      canEdit: window.run.progression.canEditWands(),
      shop: window.run.pickups.list.filter((p) => p.price > 0).map((p) => `${p.kind}:${p.label}:${p.price}`),
      perks: window.run.pickups.list.filter((p) => p.kind === 'perk').map((p) => p.label),
      other: window.run.pickups.list.filter((p) => ['refresher', 'heart_full'].includes(p.kind)).length,
    }));
    console.log('hm', JSON.stringify(info));
    await shot('perks');
    await run(() => { window.game.player.yaw = 0; });
    await wait(600);
    await shot('shop');
    // take a perk via interaction
    await run(() => {
      const r = window.run;
      const pk = r.pickups.list.find((p) => p.kind === 'perk');
      r.progression.interact(pk);
    });
    await wait(300);
    const after = await run(() => ({ perks: [...window.run.progression.perks.keys()], altar: window.run.pickups.list.filter((p) => p.kind === 'perk').length }));
    console.log('after-perk', JSON.stringify(after));
    await run(() => window.game.input.simulateKey('Tab', true));
    await wait(100);
    await run(() => window.game.input.simulateKey('Tab', false));
    await wait(500);
    await shot('edit');
  },
  async death({ shot, wait, run, page }) {
    await wait(1000);
    await run(() => { const p = window.game.player; window.run.damage.apply({ target: p, amount: 500, type: 'explosion', source: null, x: 0, y: 0, z: 0 }); });
    await wait(2500);
    await shot('dead');
    const state1 = await run(() => window.game.state);
    await page.click('text=Start a new run');
    await page.waitForFunction(() => window.game && window.game.state === 'playing', null, { timeout: 120000 });
    await wait(1500);
    await shot('restarted');
    console.log('death', state1, 'after', await run(() => [window.game.state, window.game.player.hp, window.game.opts.seed]));
  },
  async arena({ shot, wait, run }) {
    await wait(1500);
    await run(() => { window.debug.godMode = true; window.game.player.pitch = -0.08; window.game.player.yaw = Math.PI; });
    await run(() => {
      const g = window.game, r = window.run, pl = g.player;
      const types = (new URLSearchParams(location.search).get('types') || 'hamis,hound_weak,shotgunner_weak,slime_weak,stendari,bat,miner_weak,firefly').split(',');
      types.forEach((t, i) => {
        const a = (i - (types.length - 1) / 2) * 0.22;
        const x = pl.body.x - Math.sin(a) * 26, z = pl.body.z + Math.cos(a) * 26;
        let y = pl.body.y + 12;
        for (let k = 0; k < 40 && !g.world.isSolid(Math.floor(x), Math.floor(y) - 1, Math.floor(z)); k++) y--;
        r.enemies.spawn(t, x, y + (t === 'bat' || t === 'slime_weak' || t === 'firefly' ? 5 : 0), z, 0, { next: Math.random, range: (a, b) => a + (b - a) * Math.random(), chance: (q) => Math.random() < q, int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)) });
      });
    });
    await wait(400);
    await shot('0');
    await wait(2500);
    await shot('1');
    await wait(2500);
    await shot('2');
    const st = await run(() => window.run.enemies.list.filter((e) => Math.hypot(e.body.x - window.game.player.body.x, e.body.z - window.game.player.body.z) < 60).map((e) => `${e.def.id}:${e.state}:${e.hp.toFixed(1)}:${e.hasLos}`));
    console.log('state', JSON.stringify(st), 'hp', await run(() => window.game.player.hp));
  },
  async enemies({ shot, wait, run }) {
    const pts = await run(() => window.game.streamer.gen.routePoints[0]);
    const p = pts[Math.floor(pts.length * 0.4)];
    await teleport(run, wait, p.x, p.y - 4, p.z, 0, -0.05);
    await run(() => { window.game.player.noclip = false; window.run.damage.godMode = true; });
    // spawn a mix of enemies in front of the player
    await run(() => {
      const g = window.game, r = window.run, pl = g.player;
      const d = g.lookDir();
      const types = ['hamis', 'shotgunner_weak', 'hound_weak', 'slime_weak', 'stendari', 'miner_weak'];
      types.forEach((t, i) => {
        const a = (i - 2.5) * 0.25;
        const x = pl.body.x + (d.x * Math.cos(a) - d.z * Math.sin(a)) * 22, z = pl.body.z + (d.z * Math.cos(a) + d.x * Math.sin(a)) * 22;
        let y = pl.body.y + 6;
        for (let k = 0; k < 30 && !g.world.isSolid(Math.floor(x), Math.floor(y) - 1, Math.floor(z)); k++) y--;
        r.enemies.spawn(t, x, y, z, 0, { next: Math.random, range: (a, b) => a + (b - a) * Math.random(), chance: (q) => Math.random() < q, int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)) });
      });
    });
    await wait(1500);
    await shot('spawned');
    await wait(3000);
    await shot('fight');
    await run(() => window.game.input.simulateMouse(0, true));
    await wait(2500);
    await run(() => window.game.input.simulateMouse(0, false));
    await shot('casting');
    await wait(2000);
    await shot('after');
    const st = await run(() => ({ hp: window.game.player.hp, enemies: window.run.enemies.list.map((e) => `${e.def.id}:${e.state}:${e.hp.toFixed(1)}`), kills: window.run.kills, gold: window.run.pickups.list.filter((p) => p.kind === 'gold').length }));
    console.log('state', JSON.stringify(st));
    await key(run, wait, 'Tab');
    await wait(500);
    await shot('inventory');
  },
  async boot({ shot, wait }) {
    await wait(3000);
    await shot('spawn');
  },
  async combat({ shot, wait, run }) {
    await wait(1500);
    await run(() => { window.game.player.pitch = -0.1; window.game.player.yaw = Math.PI - 0.3; });
    await hold(run, wait, 0, 900);
    await shot('cast');
    await wait(800);
    await shot('after');
    await key(run, wait, 'Digit2');
    await wait(300);
    await run(() => { window.game.player.pitch = -0.35; });
    await hold(run, wait, 0, 200);
    await wait(400);
    await shot('bomb-thrown');
    await wait(3200);
    await shot('bomb-explode');
    await key(run, wait, 'Digit5');
    await wait(300);
    await hold(run, wait, 0, 1500);
    await shot('pour');
    await wait(1500);
    await shot('pour-after');
    const st = await run(() => ({ hp: window.game.player.hp, wands: window.run.inv.wands.map((w) => w && w.stats.name), proj: window.run.projectiles.list.length }));
    console.log('state', JSON.stringify(st));
  },
};

export const more = {};
