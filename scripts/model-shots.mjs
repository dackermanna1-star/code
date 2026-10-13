// Dev tool: screenshots of entity models and first-person held items.
// Serves the built game, creates a cheats world in headless Chromium, then
//  - stages client-side "fake" entity snapshots (animals, scavengers, corpses)
//    in front of the camera in several poses and screenshots them,
//  - spawns real creatures through the simulation (/spawn) to check the
//    replicated path,
//  - gives and selects held items and screenshots the first-person view
//    (hip, aim-down-sights, mid-swing).
//   npm run build && node scripts/model-shots.mjs [outDir] [creatures,items,real|all] [itemFilter]
// itemFilter: comma-separated item keys ('hand' = empty hand). Env: SEED, DEBUG=1 (print
// staged entity positions), FULL=1 (unclipped creature close-ups).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? 'test-results/models';
const what = new Set((process.argv[3] ?? 'all').split(','));
const itemFilter = process.argv[4] ? new Set(process.argv[4].split(',')) : null;
const want = (k) => what.has('all') || what.has(k);
mkdirSync(out, { recursive: true });
const port = 8000 + Math.floor(Math.random() * 1000);
const server = spawn(process.execPath, ['scripts/serve.mjs', String(port)], { stdio: 'pipe' });
await new Promise((r) => server.stdout.once('data', r));

const exe = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name, clip) => {
  await page.screenshot({ path: `${out}/${name}.png`, clip });
  console.log('shot', `${out}/${name}.png`);
};
const chat = async (text) => {
  await page.evaluate((t) => window.__corrode.sim.send({ t: 'chat', text: t }), text);
  await wait(250);
};

try {
  await page.goto(`http://localhost:${port}/`);
  await page.fill('#m-name', 'Modeller');
  await page.evaluate(() => { document.getElementById('m-new').open = true; });
  await page.fill('#nw-name', 'Model World');
  await page.fill('#nw-seed', process.env.SEED ?? '424242');
  await page.check('#nw-cheats');
  await page.click('#nw-create');
  await page.waitForSelector('#loading.hidden', { state: 'attached', timeout: 60000 });
  await page.waitForFunction(() => {
    const t = document.getElementById('fps')?.textContent ?? '';
    const m = /meshed (\d+) pending (\d+)/.exec(t);
    return m && Number(m[1]) > 100 && Number(m[2]) < 4;
  }, null, { timeout: 90000 }).catch(() => console.log('warning: meshing did not settle'));
  await chat('/time 0.3');
  await chat('/heal');
  // Find a dry, flat, tree-free patch near the (random) spawn and stand at its edge facing +z.
  const spot = await page.evaluate(() => {
    const g = window.__corrode;
    const s = g.local.state;
    const skip = new Set([19, 20, 21, 22, 23, 24, 25]);
    const top = (x, z) => {
      for (let y = Math.floor(s.y) + 30; y > 0; y--) {
        const id = g.world.getBlock(x, y, z);
        if (id === 0 || skip.has(id)) continue;
        return id === 9 || (id >= 12 && id <= 17) ? -1 : y;
      }
      return -1;
    };
    for (const [half, tol] of [[10, 0], [8, 0], [10, 1], [7, 2]]) {
      let best = null, bd = 1e9;
      for (let dz = -64; dz <= 64; dz += 4) for (let dx = -64; dx <= 64; dx += 4) {
        const cx = Math.floor(s.x + dx), cz = Math.floor(s.z + dz);
        let lo = 1e9, hi = -1e9, ok = true;
        for (let z = cz - half; z <= cz + half && ok; z++) for (let x = cx - half; x <= cx + half; x++) {
          const y = top(x, z);
          if (y < 0) { ok = false; break; }
          lo = Math.min(lo, y); hi = Math.max(hi, y);
          if (hi - lo > tol) { ok = false; break; }
        }
        const d = Math.hypot(dx, dz);
        if (ok && d < bd) { bd = d; best = [cx + 0.5, hi + 1.05, cz - half + 3.5]; }
      }
      if (best) return best;
    }
    return null;
  });
  if (spot) {
    console.log('stage at', spot);
    await chat(`/tp ${spot[0]} ${spot[1]} ${spot[2]}`);
    await wait(2500);
  } else console.log('warning: no flat stage found near spawn');

  // Page-side helpers for staging fake entities in front of the camera.
  await page.evaluate(() => {
    const g = window.__corrode;
    const plants = new Set([0, 9, 13, 15, 17, 19, 20, 21, 22, 23, 24, 25, 104]);
    g.__ground = (x, z, from) => {
      for (let y = Math.floor(from) + 6; y > from - 12; y--) if (!plants.has(g.world.getBlock(Math.floor(x), y, Math.floor(z)))) return y + 1;
      return from;
    };
    g.__stage = (list, camYaw, dist, lookH, pitchBias = 0) => {
      // list: [{id, k, n, f, yaw (relative to facing the camera), side (lateral offset), fwd (extra distance)}]
      // (the simulation is paused while staging, so real wildlife can be cleared out of frame too)
      for (const v of [...g.ents.views.values()]) if (v.id >= 900000 || v.kind === 'a') g.ents.remove(v.id);
      const s = g.local.state;
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      const t = g.sim.serverNow();
      let gy = 0, n = 0;
      for (const e of list) {
        const d = dist + (e.fwd ?? 0);
        const x = s.x + fx * d + rx * (e.side ?? 0), z = s.z + fz * d + rz * (e.side ?? 0);
        const y = g.__ground(x, z, s.y);
        gy += y; n++;
        g.ents.apply({ id: e.id, k: e.k, n: e.n, f: e.f ?? 0, x, y, z, yaw: camYaw + (e.yaw ?? 0), hp: e.hp ?? 1, h: e.h, w: e.w }, t);
      }
      g.local.yaw = camYaw;
      const eye = s.y + 1.62;
      g.local.pitch = Math.atan2(gy / Math.max(1, n) + lookH - eye, dist) + pitchBias;
    };
  });

  const W = 1280, H = 720;
  const zoom = (f) => ({ x: Math.round(W * (1 - f) / 2), y: Math.round(H * (1 - f) / 2), width: Math.round(W * f), height: Math.round(H * f) });

  if (want('creatures')) {
    await page.evaluate(() => { const g = window.__corrode; g.settings.fov = 50; g.sim.send({ t: 'pause', on: true }); });
    await wait(500);
    const camYaw = Math.PI; // facing +z (into the stage)
    const SPECIES = ['stag', 'boar', 'wolf', 'bear', 'scavenger'];
    // lineup, 3/4 view, idle
    const lineup = (f, yawOff) => SPECIES.map((n, i) => ({ id: 900000 + i, k: 'a', n, f, yaw: yawOff, side: (i - 2) * 2.1 }));
    await page.evaluate(([l, y]) => window.__corrode.__stage(l, y, 9, 0.8), [lineup(0, Math.PI * 0.75), camYaw]);
    await wait(2500);
    if (process.env.DEBUG) console.log(await page.evaluate(() => { const g = window.__corrode; return [...g.ents.views.values()].filter((v) => v.id >= 900000).map((v) => { const p = v.root.position; const col = []; for (let y = Math.floor(p.y) - 2; y <= Math.floor(p.y) + 1; y++) col.push(g.world.getBlock(Math.floor(p.x), y, Math.floor(p.z))); return `${v.last.n} y=${p.y.toFixed(2)} col[${Math.floor(p.y) - 2}..]=${col.join(',')} rootY=${v.rig?.inst.root.position.y}`; }).join('\n'); }));
    await shot('c00-lineup-idle');
    await page.evaluate(([l, y]) => window.__corrode.__stage(l, y, 9, 0.8), [lineup(2, Math.PI / 2), camYaw]);
    await wait(1800);
    await shot('c01-lineup-walk-side');
    await page.evaluate(([l, y]) => window.__corrode.__stage(l, y, 9, 0.8), [lineup(6, -Math.PI * 0.8), camYaw]);
    await wait(1800);
    await shot('c02-lineup-run-front');
    // close-ups
    for (const [i, n] of SPECIES.entries()) {
      const dist = { stag: 4.4, boar: 3.0, wolf: 3.2, bear: 4.6, scavenger: 3.9 }[n];
      const look = { stag: 1.25, boar: 0.5, wolf: 0.65, bear: 0.85, scavenger: 1.0 }[n];
      for (const [tag, f, yaw] of [['a', 0, Math.PI * 0.78], ['b', 2, Math.PI / 2], ['c', 6, -Math.PI * 0.85], ['d', 0, 0.35]]) {
        await page.evaluate(([l, y, d, h]) => window.__corrode.__stage(l, y, d, h), [[{ id: 900100 + i, k: 'a', n, f, yaw }], camYaw, dist, look]);
        await wait(1300);
        if (process.env.DEBUG) console.log(await page.evaluate(() => { const g = window.__corrode; const s = g.local.state; return [...g.ents.views.values()].map((v) => `${v.id}:${v.kind}:${v.last.n}@${v.root.position.x.toFixed(1)},${v.root.position.y.toFixed(1)},${v.root.position.z.toFixed(1)} d=${Math.hypot(v.root.position.x - s.x, v.root.position.z - s.z).toFixed(1)}`).join(' | '); }));
        await shot(`c1${i}${tag}-${n}`, process.env.FULL ? undefined : zoom(0.6));
      }
    }
    // corpses: scavenger body, player body, carcasses (by key and by display name)
    const corpses = [
      { id: 900200, k: 'c', n: 'Scavenger', f: 0, side: -3 },
      { id: 900201, k: 'c', n: 'Tester', f: 0, side: -1 },
      { id: 900202, k: 'c', n: 'stag', f: 1, side: 1.2 },
      { id: 900203, k: 'c', n: 'Grey Wolf', f: 1, side: 3.2, fwd: 0.5 },
      { id: 900204, k: 'c', n: 'bear', f: 1, side: 0, fwd: 2.6 },
      { id: 900205, k: 'c', n: 'Boar', f: 1, side: 5, fwd: 1 },
    ];
    await page.evaluate(([l, y]) => window.__corrode.__stage(l, y, 5, 0, -0.25), [corpses, camYaw]);
    await wait(2000);
    await shot('c20-corpses');
    // player model (third person) with clothes and a held rifle
    const players = [
      { id: 900300, k: 'p', n: 'Naked', f: 0, yaw: Math.PI * 0.8, side: -1.5 },
      { id: 900301, k: 'p', n: 'Raider', f: 2, yaw: Math.PI / 2, side: 0, h: 'service_rifle', w: ['metal_facemask', 'burlap_shirt', 'metal_chestplate', 'road_kilt', 'burlap_shoes', 'hide_gloves'] },
      { id: 900302, k: 'p', n: 'Builder', f: 4, yaw: Math.PI * 0.9, side: 1.5, h: 'stone_hatchet', w: ['burlap_hood', 'burlap_shirt', '', 'burlap_trousers'] },
    ];
    await page.evaluate(([l, y]) => window.__corrode.__stage(l, y, 5.5, 1.0), [players, camYaw]);
    await wait(2000);
    await shot('c30-players', zoom(0.7));
    for (const pl of players) pl.yaw = Math.PI;
    await page.evaluate(([l, y]) => window.__corrode.__stage(l, y, 4, 1.0), [players, camYaw]);
    await wait(1500);
    await shot('c31-players-front', zoom(0.7));
    // item drops + a deployed explosive
    const drops = ['planks', 'pipe_pistol', 'stone_hatchet', 'cooked_meat', 'wood', 'metal_frag', 'bandage', 'service_rifle'].map((n, i) => ({ id: 900400 + i, k: 'i', n, side: (i % 4 - 1.5) * 0.9, fwd: Math.floor(i / 4) * 1.1 }));
    drops.push({ id: 900420, k: 'x', n: 'breach_charge', side: 0, fwd: 2.2 });
    await page.evaluate(([l, y]) => window.__corrode.__stage(l, y, 2.6, 0.2), [drops, camYaw]);
    await wait(1500);
    await shot('c35-drops', zoom(0.7));
    // hurt flash: re-apply a snapshot with lower health
    await page.evaluate(([l, y]) => window.__corrode.__stage(l, y, 4.2, 0.8), [[{ id: 900500, k: 'a', n: 'bear', f: 0, yaw: Math.PI * 0.75, hp: 1 }], camYaw]);
    await wait(800);
    await page.evaluate(() => { const g = window.__corrode; const v = g.ents.views.get(900500); g.ents.apply({ ...v.last, hp: 0.6 }, g.sim.serverNow()); });
    await wait(60);
    await shot('c36-hurt-flash', zoom(0.6));
    // night look
    await chat('/time 0.85');
    await page.evaluate(([l, y]) => window.__corrode.__stage(l, y, 9, 0.8), [lineup(0, Math.PI * 0.75), camYaw]);
    await wait(2500);
    await shot('c40-lineup-night');
    await chat('/time 0.3');
    await page.evaluate(() => { const g = window.__corrode; for (const v of [...g.ents.views.values()]) if (v.id >= 900000) g.ents.remove(v.id); g.settings.fov = 75; g.sim.send({ t: 'pause', on: false }); });
  }

  if (want('items')) {
    // look at the ground-ish horizon so items stand out against the sky/terrain
    const hold = async (key) => {
      const ok = await page.evaluate(async (k) => {
        const g = window.__corrode;
        const find = () => (g.inv?.belt ?? []).findIndex((s) => s && s.id === k);
        let i = find();
        if (i < 0) {
          const free = (g.inv?.belt ?? []).findIndex((s) => !s);
          if (free < 0) {
            // make room: drop the last belt slot
            g.sim.send({ t: 'inv', op: 'drop', from: ['belt', g.inv.belt.length - 1] });
            await new Promise((r) => setTimeout(r, 300));
          }
          g.sim.send({ t: 'chat', text: `/give ${k} 1` });
          for (let t = 0; t < 30 && (i = find()) < 0; t++) await new Promise((r) => setTimeout(r, 100));
        }
        if (i < 0) return false;
        g.select(i);
        return true;
      }, key);
      if (!ok) console.log('could not hold', key);
      return ok;
    };
    await page.evaluate(() => { const g = window.__corrode; g.local.yaw = Math.PI; g.local.pitch = -0.1; });
    const items = ['', 'rock', 'torch', 'stone_hatchet', 'metal_pickaxe', 'hammer', 'wooden_spear', 'machete', 'hunting_bow', 'crossbow',
      'pipe_pistol', 'scrap_shotgun', 'service_rifle', 'lever_rifle', 'tin_grenade', 'fuse_charge', 'bandage', 'medical_syringe',
      'cooked_meat', 'berries', 'planks', 'cobblestone', 'glass', 'building_plan', 'wood', 'metal_frag', 'water_bottle', 'small_box',
      'code_lock', 'canned_beans', 'wooden_door', 'burlap_shirt', 'metal_facemask', 'scrap', 'mushroom', 'anti_rad_pills', 'campfire', 'furnace'];
    const guns = new Set(['pipe_pistol', 'scrap_shotgun', 'service_rifle', 'lever_rifle', 'hunting_bow', 'crossbow']);
    const swingers = new Set(['', 'rock', 'stone_hatchet', 'metal_pickaxe', 'machete', 'wooden_spear', 'torch', 'tin_grenade', 'planks']);
    let n = 0;
    for (const key of items) {
      if (itemFilter && !itemFilter.has(key || 'hand')) continue;
      if (key) { if (!(await hold(key))) continue; }
      else await page.evaluate(() => { const g = window.__corrode; const i = g.inv.belt.findIndex((s) => !s); if (i >= 0) g.select(i); });
      await wait(1200);
      const tag = String(n++).padStart(2, '0');
      await shot(`i${tag}-${key || 'hand'}`);
      if (guns.has(key)) {
        await page.evaluate(() => { window.__corrode.input.buttons = 4; });
        await wait(1200);
        await shot(`i${tag}-${key}-ads`);
        await page.evaluate(() => { window.__corrode.vm.doRecoil(1); });
        await wait(60);
        await shot(`i${tag}-${key}-ads-recoil`);
        await page.evaluate(() => { window.__corrode.input.buttons = 0; });
        await wait(400);
      }
      if (swingers.has(key)) {
        await page.evaluate(() => window.__corrode.vm.doSwing());
        await wait(90);
        await shot(`i${tag}-${key || 'hand'}-swing`);
        await wait(700);
      }
    }
    // night torch
    if (!itemFilter || itemFilter.has('torch')) {
      await chat('/time 0.85');
      await hold('torch');
      await wait(2500);
      await shot('i99-torch-night');
      await chat('/time 0.3');
    }
  }
  // last: hostile spawns may kill the player once the simulation runs again
  if (want('real')) {
    // real simulation spawns: the scavenger AI aims at the player as soon as it sees it.
    // Freeze the simulation right after spawning so the NPC cannot kill the camera.
    await page.evaluate(() => { window.__corrode.settings.fov = 60; });
    for (const n of ['scavenger', 'bear', 'wolf']) {
      await chat('/heal');
      await chat(`/spawn ${n}`);
      await wait(1400);
      await page.evaluate(() => window.__corrode.sim.send({ t: 'pause', on: true }));
      await wait(300);
      const found = await page.evaluate((sp) => {
        const g = window.__corrode;
        const s = g.local.state;
        let best = null, bd = 1e9;
        for (const v of g.ents.views.values()) {
          if (v.kind !== 'a' || v.last.n !== sp) continue;
          const p = v.root.position, d = Math.hypot(p.x - s.x, p.z - s.z);
          if (d < bd) { bd = d; best = p; }
        }
        if (!best) return false;
        // step back (client-side only, the simulation is paused) so the whole creature is in frame
        if (bd < 5) {
          const k = 5 / Math.max(0.1, bd);
          g.local.teleport(best.x + (s.x - best.x) * k, s.y, best.z + (s.z - best.z) * k);
        }
        const t = g.local.state;
        g.local.yaw = Math.atan2(-(best.x - t.x), -(best.z - t.z));
        g.local.pitch = Math.atan2(best.y + 0.8 - (t.y + 1.62), Math.hypot(best.x - t.x, best.z - t.z));
        return true;
      }, n);
      if (!found) console.log('real spawn not found:', n);
      await wait(1200);
      await shot(`r-${n}`);
      await page.evaluate(() => window.__corrode.sim.send({ t: 'pause', on: false }));
      await chat('/heal');
    }
    await page.evaluate(() => { window.__corrode.settings.fov = 75; });
  }
} catch (e) {
  console.error('model-shots failure:', e);
  await page.screenshot({ path: `${out}/error.png` }).catch(() => undefined);
}
if (errors.length) console.error('Page errors:\n' + errors.join('\n'));
await browser.close();
server.kill();
console.log(errors.length ? 'MODEL SHOTS WITH ERRORS' : 'MODEL SHOTS DONE');
