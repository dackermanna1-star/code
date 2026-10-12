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
