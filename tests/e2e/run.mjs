// End-to-end scenarios against the real game in headless Chromium (software WebGL).
// The game runs in manual mode; scenarios inject input and step the simulation
// deterministically, asserting on game state. Screenshots land in tests/e2e/out/.
import { launch, waitFor, shot } from './harness.mjs';

const results = [];
const { page, logs, close } = await launch({ width: 960, height: 540, query: '?manual&start' });
const G = (fn, arg) => page.evaluate(fn, arg);
const step = (s) => G((s) => window.__game.debugStep(s), s);
const key = async (a, down) => G(([a, d]) => window.__game.input.simulate(a, d), [a, down]);
const tap = async (a) => { await key(a, true); await step(1 / 30); await key(a, false); await step(1 / 30); };
async function scenario(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return;
  const t0 = Date.now();
  await reset(); await step(0.1);
  try { const info = await fn(); results.push({ name, ok: true, info, ms: Date.now() - t0 }); console.log(`✔ ${name}${info ? ` — ${info}` : ''}`); }
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log(`✘ ${name}: ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
// Clear the area around a test spot so scenarios are not disturbed by passers-by.
const isolate = (x, z) => G(([x, z]) => {
  const g = window.__game;
  for (const c of g.characters) if (!c.isPlayer && Math.hypot(c.x - x, c.z - z) < 12) {
    const room = c.kind === 'inmate' ? 'library' : 'guardroom';
    const pt = g.world.randomPointIn(room, g.sim.rng, c); c.place(pt[0], pt[1]);
    const b = g.sim.brainOf(c); b.goal = { type: 'idleIn', room, t: 0, period: '*', until: g.sim.clock.total + 30, keepAcrossPeriods: true };
  }
}, [x, z]);
// Reset transient state between scenarios.
const reset = () => G(() => {
  const g = window.__game, sim = g.sim, p = g.player;
  g.dialogue.close('bye'); g.dialogueUI.closeList(); g.menus.close();
  for (const b of sim.brains.values()) { b.fight = null; b.paused = false; b.token = false; if (b.goal && b.goal.keepAcrossPeriods) b.goal = null; }
  for (const c of sim.characters) { c.flags.dispatch = null; c.flags.escort = null; c.flags.escorting = null; c.faceYaw = null; c.combatTimer = 0; c.combatTarget = null; c.lockTarget = null; if (c.state !== 'spot' && c.state !== 'ko') c.setState('free'); c.act = null; }
  sim.attackers.clear();
  for (const r of sim.rules.record.values()) { r.warrants.clear(); r.heat = 0; }
  if (p.spot) p.leaveSpot(true);
  p.setState('free'); p.hp = p.maxHp; p.stamina = 100; p.flags.solitaryCell = null; p.flags.solitaryUntil = 0;
  for (const d of sim.world.doors) if (d.cell && d.cell.startsWith('H')) d.locked = false;
  sim.clock.total = 1440 * Math.max(0, sim.clock.dayIndex) + 13 * 60;
});

try {
  await waitFor(page, () => window.__game && window.__game.mode === 'play');
  await step(0.5);

  await scenario('movement starts and stops crisply', async () => {
    await isolate(38, 40);
    await G(() => { const g = window.__game; g.player.place(38, 40, 0); g.cameraRig.yaw = 0; });
    await key('forward', true);
    const sp = [];
    for (let i = 0; i < 6; i++) { await step(0.05); sp.push(await G(() => Math.hypot(window.__game.player.vx, window.__game.player.vz))); }
    await key('forward', false);
    const stop = [];
    for (let i = 0; i < 5; i++) { await step(0.04); stop.push(await G(() => Math.hypot(window.__game.player.vx, window.__game.player.vz))); }
    assert(sp[3] > 3.2, `slow to accelerate: ${sp.map((v) => v.toFixed(2))}`);
    assert(stop[3] < 0.5, `slides when stopping: ${stop.map((v) => v.toFixed(2))}`);
    return `0.2s→${sp[3].toFixed(2)} m/s, stop in 0.16s→${stop[3].toFixed(2)} m/s`;
  });

  await scenario('direction reversal turns quickly without orbiting', async () => {
    await G(() => { const g = window.__game; g.player.place(38, 40, 0); g.cameraRig.yaw = 0; g.player.vx = g.player.vz = 0; });
    await key('forward', true); await step(0.4); await key('forward', false);
    await key('back', true);
    await step(0.25);
    const r = await G(() => { const p = window.__game.player; return { yaw: p.yaw, vz: p.vz }; });
    await key('back', false); await step(0.2);
    const facing = Math.cos(r.yaw);
    assert(r.vz < -1.0, `still moving forward after reversal: vz=${r.vz.toFixed(2)}`);
    assert(facing < -0.5, `not facing new direction: cos(yaw)=${facing.toFixed(2)}`);
    return `vz=${r.vz.toFixed(2)}, facing ${facing.toFixed(2)} within 0.25s`;
  });

  await scenario('walls stop the player without tunnelling or jitter', async () => {
    await G(() => { const g = window.__game; g.player.place(33.2, 30, -Math.PI / 2); g.cameraRig.yaw = -Math.PI / 2; });
    await key('forward', true); await step(1.0);
    const xs = [];
    for (let i = 0; i < 5; i++) { await step(0.1); xs.push(await G(() => window.__game.player.x)); }
    await key('forward', false);
    assert(Math.min(...xs) > 32.1, `went through the wall: x=${Math.min(...xs).toFixed(2)}`);
    assert(Math.max(...xs) - Math.min(...xs) < 0.02, 'jitters against the wall');
    return `held at x=${xs[4].toFixed(2)}`;
  });

  await scenario('picks the item you face from a cluster', async () => {
    const info = await G(() => {
      const g = window.__game, p = g.player;
      p.place(38, 42, 0); g.cameraRig.yaw = 0;
      const a = g.items.spawn('apple', 37.4, 0.1, 42.9), b = g.items.spawn('book', 38.0, 0.1, 43.0), c = g.items.spawn('mug', 38.6, 0.1, 42.9);
      for (const it of [a, b, c]) it.resting = true;
      window.__testItems = [a.id, b.id, c.id];
      return null;
    });
    await step(0.1);
    const tgt = await G(() => window.__game.controller.interactTarget?.ref?.type);
    await tap('interact'); await step(0.7);
    const got = await G(() => { const p = window.__game.player; return p.held?.type || p.pockets.map((i) => i.type).join(','); });
    assert(tgt === 'book', `targeted ${tgt} instead of the book in front`);
    assert(got.includes('book'), `did not pick up the book (${got})`);
    await shot(page, 'e2e_pickup');
    return `target=${tgt}, picked=${got}`;
  });

  await scenario('cycling targets with Tab and dropping', async () => {
    await G(() => { const g = window.__game; g.player.place(38, 42, 0); });
    await step(0.1);
    const first = await G(() => window.__game.controller.interactTarget?.ref?.type);
    await tap('cycle'); await step(0.05);
    const second = await G(() => window.__game.controller.interactTarget?.ref?.type);
    assert(first && second && first !== second, `cycle did not change target (${first} -> ${second})`);
    await G(() => { const g = window.__game, p = g.player; if (!p.held && p.pockets.length) g.sim.takeFromPocket(p, 0); });
    await tap('drop'); await step(0.6);
    const held = await G(() => window.__game.player.held);
    assert(!held, 'still holding after drop');
    return `${first} → ${second}`;
  });

  await scenario('talks to the person in front, not the one beside them', async () => {
    await isolate(38, 50);
    const names = await G(() => {
      const g = window.__game, p = g.player;
      p.place(38, 50, 0); g.cameraRig.yaw = 0;
      const npcs = g.characters.filter((c) => c.kind === 'inmate' && !c.isPlayer).slice(3, 6);
      npcs[0].place(37.0, 51.4, Math.PI); npcs[1].place(38.0, 51.6, Math.PI); npcs[2].place(39.0, 51.4, Math.PI);
      for (const n of npcs) { const b = g.sim.brainOf(n); b.goal = { type: 'idleIn', room: 'hall', t: 0, period: '*', until: 1e9, arrived: true, to: [n.x, n.z], wait: 1e9, keepAcrossPeriods: true }; n.stop(); }
      window.__mid = npcs[1].id;
      return npcs.map((n) => n.short);
    });
    await step(0.1);
    const tgt = await G(() => { const g = window.__game; const t = g.controller.interactTarget; const p = g.player; return (t ? `${t.kind}:${t.ref.id || t.ref.type}` : null) + ' | ' + g.controller.candidates.slice(0, 4).map((c) => `${c.ref.id || c.ref.type}@${c.d.toFixed(2)}/${c.ang.toFixed(2)}=${c.score.toFixed(2)}`).join(' ') + ` | p=(${p.x.toFixed(2)},${p.z.toFixed(2)},${p.yaw.toFixed(2)}) mid=${window.__mid}`; });
    await tap('interact'); await step(0.5);
    const r = await G(() => { const d = window.__game.dialogue; return { active: d.active, id: d.npc?.id }; });
    console.log('   target before E:', tgt, 'dialogue with', r.id);
    await shot(page, 'e2e_talk');
    assert(r.active, 'no conversation started');
    const mid = await G(() => window.__mid);
    assert(r.id === mid, 'talked to the wrong person');
    // Walking away ends it
    await key('back', true); await step(0.6); await key('back', false); await step(0.2);
    const still = await G(() => window.__game.dialogue.active);
    assert(!still, 'conversation did not end on walking away');
    return `talked to the middle of ${names.join(', ')}`;
  });

  await scenario('after a conversation the player faces where they move', async () => {
    await isolate(38, 40);
    const r = await G(() => {
      const g = window.__game, p = g.player, inp = g.input;
      const npc = g.sim.byId.get('grandpa');
      g.sim.brainOf(npc).paused = true;
      npc.place(38, 42, Math.PI); p.place(38, 40.6, 0); g.cameraRig.yaw = 0; g.cameraRig.snapBehind(p);
      g.debugStep(0.2, { present: 6 });
      g.startConversation(p, npc); g.debugStep(1, { present: 6 });
      const talking = !!g.dialogue.active;
      inp.simulate('right', true); g.debugStep(1.2, { present: 6 }); inp.simulate('right', false);
      const out = { talking, closed: !g.dialogue.active, faceYaw: p.faceYaw, yaw: p.yaw, velYaw: Math.atan2(p.vx, p.vz), speed: Math.hypot(p.vx, p.vz) };
      g.debugStep(0.3);
      g.sim.brainOf(npc).paused = false;
      return out;
    });
    assert(r.talking && r.closed, 'conversation did not open and then close on walking away');
    assert(r.faceYaw == null, `facing override left behind after the conversation: ${r.faceYaw}`);
    assert(r.speed > 2, `not moving after the conversation (${r.speed.toFixed(2)} m/s)`);
    const err = Math.abs(Math.atan2(Math.sin(r.yaw - r.velYaw), Math.cos(r.yaw - r.velYaw)));
    assert(err < 0.3, `body faces ${r.yaw.toFixed(2)} but moves toward ${r.velYaw.toFixed(2)}`);
    return `faces ${r.yaw.toFixed(2)}, moving toward ${r.velYaw.toFixed(2)}`;
  });

  await scenario('holding a direction key runs straight (camera does not swing)', async () => {
    await isolate(30, 80);
    const r = await G(() => {
      const g = window.__game, p = g.player, inp = g.input;
      p.place(30, 80, 0); g.cameraRig.yaw = 0; g.cameraRig.snapBehind(p); g.cameraRig.idleLook = 5; inp.lastDevice = 'keyboard';
      g.debugStep(0.3, { present: 6 });
      inp.simulate('right', true);
      const heads = [];
      for (let k = 0; k < 5; k++) { g.debugStep(0.5, { present: 6 }); heads.push(Math.atan2(p.vx, p.vz)); }
      inp.simulate('right', false); g.debugStep(0.3);
      return { heads, cam: g.cameraRig.yaw };
    });
    const drift = Math.max(...r.heads) - Math.min(...r.heads);
    assert(drift < 0.1, `path bends while holding right: ${r.heads.map((h) => h.toFixed(2))}`);
    assert(Math.abs(r.cam) < 0.05, `camera swung to ${r.cam.toFixed(2)}`);
    return `heading drift ${drift.toFixed(3)} rad over 2.5 s`;
  });

  await scenario('everyone in view is drawn (no culling pop-outs)', async () => {
    const r = await G(() => {
      const g = window.__game, scene = g.scene, p = g.player;
      let shouldDraw = 0, culled = 0;
      for (const [x, z, yaw] of [[38, 30, 0], [38, 30, Math.PI], [20, 50, Math.PI / 2], [40, 85, 0]]) {
        p.place(x, z, yaw); g.cameraRig.yaw = yaw; g.cameraRig.snapBehind(p);
        for (let f = 0; f < 10; f++) {
          g.debugStep(0.3);
          const planes = BABYLON.Frustum.GetPlanes(scene.getTransformMatrix());
          const am = scene.getActiveMeshes(), active = new Set(am.data.slice(0, am.length));
          for (const c of g.characters) {
            if (!c.rig) continue;
            const bi = new BABYLON.BoundingInfo(new BABYLON.Vector3(c.x - 0.4, c.y, c.z - 0.4), new BABYLON.Vector3(c.x + 0.4, c.y + 1.9, c.z + 0.4));
            if (!bi.isInFrustum(planes)) continue;
            shouldDraw++;
            if (!active.has(c.rig.mesh)) culled++;
          }
        }
      }
      return { shouldDraw, culled };
    });
    assert(r.shouldDraw > 50, `too few characters in view to judge (${r.shouldDraw})`);
    assert(r.culled === 0, `${r.culled} of ${r.shouldDraw} in-view character frames were not drawn`);
    return `${r.shouldDraw} in-view character frames, none culled`;
  });

  await scenario('arrested inmates are walked away, never teleported in view', async () => {
    await isolate(38, 30);
    const r = await G(() => {
      const g = window.__game, sim = g.sim, p = g.player;
      const npc = sim.byId.get('knuckles'), guard = sim.byId.get('reyes');
      p.place(38, 26, 0); g.cameraRig.yaw = 0; g.cameraRig.snapBehind(p);
      npc.place(38, 31, Math.PI); guard.place(39, 31.5, Math.PI);
      g.debugStep(0.3, { present: 6 });
      // Watch every instant move of the inmate: was either end actually visible on screen?
      const cam = g.scene.activeCamera;
      const seen = (x, y, z) => {
        const planes = BABYLON.Frustum.GetPlanes(g.scene.getTransformMatrix());
        const v = new BABYLON.Vector3(x, y + 1.3, z);
        if (!planes.every((pl) => pl.dotCoordinate(v) >= 0)) return false;
        const dir = v.subtract(cam.position), len = dir.length(); dir.normalize();
        const hit = g.scene.pickWithRay(new BABYLON.Ray(cam.position.clone(), dir, len), (m) => m.isVisible && m.isEnabled() && !g.characters.some((c) => c.rig && c.rig.mesh === m) && !/sky/i.test(m.name));
        return !(hit && hit.hit && hit.distance < len - 0.3);
      };
      const jumps = [];
      const orig = npc.place;
      npc.place = function (x, z, yaw) { if (Math.hypot(x - this.x, z - this.z) > 1) jumps.push({ from: seen(this.x, this.y, this.z), to: seen(x, this.y, z), d: Math.hypot(x - this.x, z - this.z) }); return orig.call(this, x, z, yaw); };
      sim.rules.rec(npc).warrants.add('curfew');
      sim.rules.arrest(npc, guard, 'comply');
      g.debugStep(0.5, { present: 6 });
      const cuffed = npc.state === 'cuffed', escorting = guard.flags.escorting === npc;
      const start = [npc.x, npc.z];
      let walked = 0, t = 0;
      while (npc.flags.escort && t < 60) { g.debugStep(0.5); t += 0.5; walked = Math.max(walked, Math.hypot(npc.x - start[0], npc.z - start[1])); }
      delete npc.place;
      return { cuffed, escorting, walked, done: !npc.flags.escort, t, jumps, guardFree: !guard.flags.escorting, atBed: npc.bed ? Math.hypot(npc.x - npc.bed.ax, npc.z - npc.bed.az) : -1 };
    });
    assert(r.cuffed && r.escorting, `arrest did not start an escort (cuffed=${r.cuffed}, guard escorting=${r.escorting})`);
    assert(r.walked > 1.5, `inmate did not walk while in view (${r.walked.toFixed(1)} m)`);
    assert(r.done && r.guardFree, `escort did not finish in ${r.t}s`);
    const visibleJumps = r.jumps.filter((j) => j.from || j.to);
    assert(!visibleJumps.length, `teleported on screen: ${JSON.stringify(visibleJumps)}`);
    return `walked ${r.walked.toFixed(1)} m cuffed, handed off after ${r.t}s, ${r.jumps.length} unseen jump(s)`;
  });

  await scenario('combat: combo lands, guard intervenes, arrest resolves', async () => {
    await isolate(38, 35);
    const r = await G(() => {
      const g = window.__game, p = g.player, sim = g.sim;
      p.place(38, 36, Math.PI); g.cameraRig.yaw = Math.PI;
      const v = sim.byId.get('whisper');
      if (v.spot) v.leaveSpot(true);
      v.setState('free'); v.place(38, 34.8, 0);
      sim.brainOf(v).goal = { type: 'post', x: 38, z: 34.8, yaw: 0, until: 1e9, t: 0, period: '*', keepAcrossPeriods: true };
      const guard = sim.byId.get('reyes');
      guard.place(40.5, 33, -1.2); sim.brainOf(guard).goal = { type: 'post', x: 40.5, z: 33, yaw: -1.2, until: 1e9, t: 0, period: '*', keepAcrossPeriods: true };
      return { hp: v.hp };
    });
    for (let i = 0; i < 4; i++) { await tap('attack'); await step(0.18); }
    await step(1.5);
    const s = await G(() => {
      const g = window.__game, sim = g.sim, v = sim.byId.get('whisper');
      return { hp: v.hp, wanted: sim.rules.isWanted(g.player), crimes: sim.rules.rec(g.player).crimes.map((c) => c.crime), dialogue: g.dialogue.active ? g.dialogue.mode : null };
    });
    assert(s.hp < r.hp - 8, `hits did not land (hp ${r.hp} -> ${s.hp})`);
    assert(s.crimes.includes('assault'), 'guard did not record the assault');
    let mode = s.dialogue;
    for (let i = 0; i < 12 && mode !== 'arrest'; i++) {
      await step(0.5);
      mode = await G(() => window.__game.dialogue.active ? window.__game.dialogue.mode : null);
      if (process.env.TRACE) console.log('   ', await G(() => { const g = window.__game, sim = g.sim, p = g.player, gd = sim.byId.get('reyes'), b = sim.brainOf(gd); const d = gd.flags.dispatch; return `t=${i} guard ${gd.state} at ${gd.x.toFixed(1)},${gd.z.toFixed(1)} dist=${Math.hypot(gd.x - p.x, gd.z - p.z).toFixed(2)} dispatch=${d ? (d.target.id + (d.confronted ? ' conf' : '') + (d.warnedAt ? ' warned' : '')) : '-'} fight=${b.fight ? b.fight.reason : '-'} goal=${b.goal?.type} | player ${p.state} hp${p.hp.toFixed(0)} wanted=${sim.rules.isWanted(p)} dlg=${g.dialogue.active}`; }));
    }
    await shot(page, 'e2e_arrest');
    assert(mode === 'arrest', 'guard never confronted the player');
    const before = await G(() => window.__game.sim.progression.sentence.daysLeft);
    await tap('choice1'); await step(0.5);
    const after = await G(() => ({ days: window.__game.sim.progression.sentence.daysLeft, wanted: window.__game.sim.rules.isWanted(window.__game.player) }));
    assert(!after.wanted, 'still wanted after going quietly');
    return `target hp ${r.hp.toFixed(0)}→${s.hp.toFixed(0)}, sentence ${before}→${after.days}`;
  });

  await scenario('mealtime: take a tray, sit, eat', async () => {
    await G(() => { const g = window.__game; g.sim.clock.total = 360 + 1440 * 0 + 60 * 6 + 40 - 360 + 360; g.player.hunger = 30; });
    await G(() => { const g = window.__game; g.sim.clock.total = 6 * 60 + 40; });
    const ok = await G(() => {
      const g = window.__game, p = g.player, s = g.world.spots.find((x) => x.activity === 'getFood' && !x.occupant);
      p.place(s.ax, s.az, s.yaw); return g.sim.tryUseSpot(p, s);
    });
    assert(ok, 'could not use the serving counter');
    await step(1.2);
    const tray = await G(() => { const p = window.__game.player; return p.held ? `${p.held.type}:${p.held.filled}` : null; });
    assert(tray === 'tray:true', `no filled tray (${tray})`);
    await G(() => { const g = window.__game, p = g.player, seat = g.world.spots.find((x) => x.activity === 'eat' && !x.occupant); p.place(seat.ax, seat.az); g.sim.tryUseSpot(p, seat); });
    const h0 = await G(() => window.__game.player.hunger);
    await step(9);
    const h1 = await G(() => window.__game.player.hunger);
    await shot(page, 'e2e_eat');
    await G(() => window.__game.player.leaveSpot()); await step(0.6);
    assert(h1 > h0 + 10, `hunger did not improve (${h0.toFixed(0)} -> ${h1.toFixed(0)})`);
    return `hunger ${h0.toFixed(0)} → ${h1.toFixed(0)}`;
  });

  await scenario('sleeping fast-forwards the night to morning', async () => {
    await G(() => { const g = window.__game, p = g.player; g.sim.clock.total = 22 * 60 + 10; p.energy = 30; if (p.spot) p.leaveSpot(true); p.place(p.bed.ax, p.bed.az); g.sim.tryUseSpot(p, p.bed); });
    const d0 = await G(() => window.__game.sim.clock.day);
    for (let i = 0; i < 20; i++) { await step(2); const m = await G(() => window.__game.sim.clock.minutes); if (m >= 6 * 60 + 2 && m < 12 * 60) break; }
    const r = await G(() => ({ day: window.__game.sim.clock.day, hhmm: window.__game.sim.clock.hhmm, energy: window.__game.player.energy, inBed: !!window.__game.player.spot }));
    assert(r.day === d0 + 1, `day did not advance (${d0} -> ${r.day})`);
    assert(r.energy > 60, `energy not restored (${r.energy.toFixed(0)})`);
    return `woke ${r.hhmm} day ${r.day}, energy ${r.energy.toFixed(0)}`;
  });

  await scenario('knocked out → wakes up in the infirmary', async () => {
    await G(() => { const g = window.__game, p = g.player; if (p.spot) p.leaveSpot(true); p.place(38, 45); p.setState('free'); p.hp = 2; p.takeHit(g.sim.byId.get('moose'), { dmg: 20, poise: 100, dirX: 0, dirZ: 1, heavy: true }); });
    const st = await G(() => window.__game.player.state);
    assert(st === 'ko', `player not KO (${st})`);
    await step(4.5);
    const r = await G(() => { const g = window.__game, p = g.player; return { room: g.world.roomAt(p.x, p.z)?.id, state: p.state, hp: p.hp }; });
    assert(r.room === 'infirmary', `woke in ${r.room}`);
    return `woke in ${r.room} with ${Math.round(r.hp)} hp`;
  });

  await scenario('save and load restore the game', async () => {
    await G(() => { const g = window.__game; g.player.place(20, 41); g.player.ramen = 42; g.saveGame('1', true); g.player.place(60, 41); g.player.ramen = 1; });
    await G(() => window.__game.loadGame('1'));
    await step(0.2);
    const r = await G(() => ({ x: window.__game.player.x, ramen: window.__game.player.ramen }));
    assert(Math.abs(r.x - 20) < 0.5 && r.ramen === 42, `not restored: ${JSON.stringify(r)}`);
    return `x=${r.x.toFixed(1)}, ramen=${r.ramen}`;
  });

  await scenario('crowd navigation: NPCs keep making progress', async () => {
    await G(() => { const g = window.__game; g.sim.clock.total = 1440 + 11 * 60 + 25; for (const b of g.sim.brains.values()) { b.goal = null; b.fight = null; } });
    const track = () => G(() => window.__game.characters.filter((c) => !c.isPlayer).map((c) => [c.id, c.x, c.z, !!(window.__game.sim.brainOf(c)?.goal), c.state]));
    const a = await track();
    await step(12);
    const b = await track();
    const stuck = [];
    for (let i = 0; i < a.length; i++) {
      const moved = Math.hypot(b[i][1] - a[i][1], b[i][2] - a[i][2]);
      if (moved < 0.3 && b[i][3] && b[i][4] === 'free') stuck.push(a[i][0]);
    }
    await shot(page, 'e2e_crowd');
    if (stuck.length > 3) console.log(await G((ids) => ids.map((id) => { const g = window.__game, c = g.sim.byId.get(id), b = g.sim.brainOf(c); const r = g.world.roomAt(c.x, c.z); return `   ${id} @${c.x.toFixed(1)},${c.z.toFixed(1)} (${r?.id}) goal=${b.goal?.type}${b.goal?.spot ? ':' + b.goal.spot.activity + '@' + b.goal.spot.room : ''}${b.goal?.room ? ':' + b.goal.room : ''} path=${b.path ? b.path.length + ' idx' + b.pathIdx : 'none'} fail=${b.failUntil ? (b.failUntil - g.sim.time).toFixed(1) : 0} spd=${c.moveSpeed.toFixed(2)} arrived=${b.goal?.arrived} state=${c.state}`; }).join('\n'), stuck));
    assert(stuck.length <= 3, `${stuck.length} NPCs stuck: ${stuck.join(', ')}`);
    return `${stuck.length} idle-with-goal of ${a.length}`;
  });

  await scenario('performance: simulation cost per step', async () => {
    const ms = await G(() => window.__game.debugStep(1));
    assert(ms < 6, `simulation too slow: ${ms.toFixed(2)} ms/step`);
    return `${ms.toFixed(2)} ms per 1/60 s step (41 characters)`;
  });
} finally {
  const errors = logs.filter((l) => l.startsWith('[pageerror]') || (l.startsWith('[error]') && !l.includes('ERR_FAILED') && !l.includes('Failed to load resource')));
  if (errors.length) console.log('Page errors:\n' + errors.slice(0, 10).join('\n'));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} scenarios passed`);
  await close();
  process.exitCode = failed || errors.length ? 1 : 0;
}
