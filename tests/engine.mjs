// Functional engine tests on the test maps (src/data/maps/test*.js) via window.__HW.
// node tests/engine.mjs [--built]   (exit code 1 on failure)
import { launch, openGame, suite } from './lib.mjs';

const built = process.argv.includes('--built');
const T = suite(`engine (${built ? 'built' : 'dev'})`);
const browser = await launch();
let g;

const near = (p, tx, ty, tol = 2) => Math.abs(p.x - (tx * 16 + 8)) <= tol && Math.abs(p.y - (ty * 16 + 12)) <= tol;
const lastOf = (tr, type) => [...tr].reverse().find((e) => e.type === type);

try {
  g = await openGame(browser, { built });

  await T.step('boot', async () => {
    T.ok(await g.hw((H) => H.ready), 'debug API reports ready');
    T.ok(['title', 'play'].includes(await g.mode()), 'boots to the title (or straight into play with the stub UI)');
  });

  await T.step('new game', async () => {
    await g.newTestGame({ timeScale: 4 });
    T.eq(await g.mode(), 'play', 'new game is in play mode');
    const p = await g.player();
    T.ok(p.map === 'test' && near(p, 20, 15, 0.01), 'player placed at test:start (feet = tile centre)', p);
    T.eq(p.room, 'test_hall', 'room tracking: start is in the hall');
    const s = await g.state();
    T.ok(s.inv.flashlight === 1 && s.inv.compact === 1, "starting inventory is Tess's bag", s.inv);
    T.ok(await g.hw((H) => H.HW.state.flags.compact_unlocked === true), 'map onEnter script ran (non-blocking)');
  });

  await T.step('map runtime', async () => {
    const r = await g.hw((H) => {
      const m = H.HW.map;
      return {
        wk: [m.wallKind(5, 1), m.wallKind(5, 2), m.wallKind(5, 3), m.wallKind(5, 4), m.wallKind(13, 5), m.wallKind(13, 6), m.wallKind(13, 8)],
        win: m.windowCells.length,
        doors: m.props.filter((p) => p.def.interact === 'door').map((p) => `${p.type}@${p.x},${p.y}`).sort(),
        lintel: m.isSolid(7, 10),
        solidDoor: m.isSolid(7, 11) && m.isOpaque(7, 11),
        glassOpaque: m.isOpaque(19, 11),
        lights: m.lightDefs.map((l) => `${l.type}${l.group ? `:${l.group}` : ''}${l.propId ? '*' : ''}`).sort(),
        los: [m.los(328, 252, 600, 252), m.los(328, 252, 120, 120)],
        rooms: [m.roomAt(328, 252)?.id, m.roomAt(100, 100)?.id],
        anchor: m.anchor('in_a'),
        path: m.findPath([328, 252], [120, 140], { doors: true })?.length > 0,
        pastAt: m.pastAt(6, 6)?.id,
        bump: m.prop('test_lamp').sortKey > m.prop('test_teacher_desk').sortKey,
      };
    });
    T.eq(r.wk, ['top', 'face_high', 'face_low', null, 'face_high', 'face_low', 'top'], 'wall autotiling (3-thick north wall, faces above a side door)');
    T.eq(r.win, 5, 'face-low window cells found');
    T.eq(r.doors, ['door_class@28,11', 'door_class@7,11', 'door_double@9,18', 'door_glass@19,11', 'door_metal@26,18', 'door_side@13,7'], 'auto doors: single, glass/metal overrides, double, side');
    T.ok(!r.lintel, 'door threshold above the leaf is walkable');
    T.ok(r.solidDoor, 'closed door is solid and opaque');
    T.ok(!r.glassOpaque, 'glass door lets light through');
    T.ok(r.lights.includes('fluor:period') && r.lights.includes('exit_sign*') && r.lights.includes('lamp_green:roomb*') && r.lights.includes('bulb*'), 'lightDefs: map lights + prop-attached lights', r.lights);
    T.eq(r.los, [true, false], 'line of sight (clear hall / through walls)');
    T.eq(r.rooms, ['test_hall', 'test_a'], 'roomAt');
    T.eq(r.anchor, { x: 120, y: 140, dir: 'up', tx: 7, ty: 8 }, 'anchor → feet point');
    T.ok(r.path, 'A* finds a path through a closed door');
    T.eq(r.pastAt, 'test_room_a_1979', 'past view rect lookup');
    T.ok(r.bump, 'lamp on a desk sorts after the desk');
  });

  await T.step('walk through an auto-opening door', async () => {
    T.ok(await g.walkTo('in_a'), 'walkTo(in_a) succeeds via simulated input');
    const p = await g.player();
    T.ok(near(p, 7, 8), 'arrived at in_a', p);
    T.eq((await g.prop('test_door_7_12')).state, 'open', 'Room A door opened on bump');
    const s = await g.state();
    T.ok(s.visited.test_a, 'room visit recorded');
    T.eq(s.mapState.test?.test_door_7_12?.state, 'open', 'door state persisted in mapState');
  });

  await T.step('side door', async () => {
    await g.teleport('test', 'in_b');
    T.ok(await g.walkTo('desk_a'), 'walk Room B → Room A');
    T.eq((await g.prop('test_door_13_7')).state, 'open', 'side door opened');
  });

  await T.step('locked door → key → open', async () => {
    T.eq(await g.hw((H) => H.pathExists('test', 'start', 'in_c')), false, 'pathExists: Room C unreachable while locked');
    T.eq(await g.walkTo('in_c'), false, 'walkTo a locked room fails');
    T.ok(await g.walkTo('door_c'), 'walk up to the locked door');
    await g.face('up');
    await g.interact();
    T.eq((await g.prop('test_door_c')).state, 'locked', 'still locked without the key');
    const tr = await g.hw((H) => H.transcript.slice(-3).map((e) => e.text).join(' | '));
    T.ok(tr.includes('OUT OF ORDER'), 'lockedText shown (examine mini-format)', tr);
    T.ok(await g.walkTo('keyring'), 'walk to the key');
    await g.face('up');
    await g.interact();
    const s = await g.state();
    T.eq(s.inv.keyring, 1, 'pickup gives the item');
    T.ok((await g.prop('test_keyring')).taken && s.mapState.test.test_keyring.taken, 'pickup removed and persisted');
    T.ok(await g.hw((H) => H.pathExists('test', 'start', 'in_c')), 'pathExists: reachable with the key');
    T.ok(await g.walkTo('in_c'), 'walk into Room C');
    T.eq((await g.prop('test_door_c')).state, 'open', 'locked door unlocked and opened');
    T.ok(await g.hw((H) => H.transcript.some((e) => e.type === 'unlock' && e.text === 'test_door_c')), 'unlock recorded');
  });

  await T.step('sit on a desk, stand on movement', async () => {
    T.ok(await g.walkTo('desk_a'), 'walk to the desk');
    await g.face('up');
    await g.interact();
    let p = await g.player();
    T.eq(p.seated, 'test_desk_student_3_6', 'seated at the desk');
    await g.hw((H) => new Promise((r) => setTimeout(r, 400)));
    T.ok((await g.player()).still, 'seated & still after 0.5 s');
    await g.interact();
    const tr = await g.hw((H) => H.transcript.slice(-1)[0]?.text);
    T.ok(/Initials/.test(tr || ''), 'confirm while seated shows the seat examine text', tr);
    await g.press('down', 150);
    await g.idle();
    p = await g.player();
    T.ok(!p.seated && near(p, 3, 7, 3), 'movement input stands up where we sat down', p);
  });

  await T.step('locker hide / exit', async () => {
    T.ok(await g.walkTo('locker'), 'walk to the locker');
    await g.face('up');
    await g.interact();
    let p = await g.player();
    T.ok(p.hidden === 'locker' && !p.visible, 'hidden in the locker', p);
    await g.press('left', 200);
    T.eq((await g.player()).x, p.x, 'cannot move while hidden');
    await g.interact();
    p = await g.player();
    T.ok(!p.hidden && p.visible && near(p, 4, 14, 3), 'climbed out', p);
  });

  await T.step('trigger fires once (dialogue, NPC A* walk, choice, party)', async () => {
    await g.teleport('test', 'trig_w');
    await g.hw((H) => { H.choiceQueue = [0]; });
    T.ok(await g.walkTo('trig_e'), 'walk across the trigger');
    await g.idle();
    let s = await g.state();
    T.ok(s.flags.trig_test_hall === true, 'once flag trig_<map>_<id> set');
    T.eq(s.flags.test_trigger_count, 1, 'trigger script ran');
    T.eq(s.flags.test_choice, 0, 'choice took the queued answer');
    T.ok(s.party.includes('danny'), 'party.add');
    const d = await g.hw((H) => { const e = H.HW.entities.get('danny'); return { x: e.x, y: e.y, follower: H.HW.entities.followers.includes(e) }; });
    T.ok(d.follower, 'Danny follows');
    T.ok(await g.walkTo('trig_w'), 'walk back across');
    await g.idle();
    s = await g.state();
    T.eq(s.flags.test_trigger_count, 1, 'once-trigger did not fire again');
    const p = await g.player();
    const d2 = await g.hw((H) => { const e = H.HW.entities.get('danny'); return { x: e.x, y: e.y }; });
    T.ok(Math.hypot(d2.x - p.x, d2.y - p.y) < 40, 'follower keeps up (caterpillar)', { p, d2 });
  });

  await T.step('transfers: fade east, seamless loop, followers come along', async () => {
    T.ok(await g.walkTo([46, 14]), 'walk into the east exit');
    await g.idle();
    let p = await g.player();
    T.eq(p.map, 'test2', 'arrived on test2');
    T.ok(near(p, 2, 12, 1), 'placed at test2:from_test', p);
    T.ok(await g.hw((H) => !!H.HW.entities.get('danny')), 'follower transferred with the party');
    let tr = await g.hw((H) => H.transcript.filter((e) => e.type === 'transfer').slice(-1)[0]?.text);
    T.ok(tr && !tr.endsWith(':seamless'), 'east exit fades', tr);
    T.ok(await g.walkTo([30, 12]), 'walk into test2 east exit');
    await g.idle();
    p = await g.player();
    tr = await g.hw((H) => H.transcript.filter((e) => e.type === 'transfer').slice(-1)[0]?.text);
    T.ok(p.map === 'test' && near(p, 2, 15, 1) && tr.endsWith(':seamless'), 'seamless loop test2 → test:loop_back', { p, tr });
    T.ok(await g.walkTo([1, 14]), 'walk into test west exit');
    await g.idle();
    p = await g.player();
    tr = await g.hw((H) => H.transcript.filter((e) => e.type === 'transfer').slice(-1)[0]?.text);
    T.ok(p.map === 'test2' && near(p, 29, 12, 1) && tr.endsWith(':seamless'), 'seamless loop test → test2:loop', { p, tr });
    T.ok(await g.hw((H) => H.HW.game.hasSave('auto')), 'player transfers checkpoint');
  });

  await T.step('repeatable trigger, script prop, transfer prop', async () => {
    await g.teleport('test2', 't2_w');
    const before = (await g.state()).flags.t2_count || 0;
    T.ok(await g.walkTo('t2_e'), 'cross the repeatable trigger');
    T.ok(await g.walkTo('t2_w'), 'cross it again');
    T.eq((await g.state()).flags.t2_count - before, 2, 'non-once trigger fires on every entry');
    T.ok(await g.walkTo('catalog'), 'walk to the card catalog');
    await g.face('up');
    await g.interact();
    T.eq((await g.state()).inv.case_key, 1, 'script prop gave an item');
    T.ok(await g.walkTo('stair'), 'walk to the spiral stair');
    await g.face('up');
    await g.interact();
    await g.idle();
    const p = await g.player();
    T.ok(p.map === 'test' && near(p, 20, 15, 1), 'transfer prop (to) moved us to test:start', p);
  });

  await T.step('compact past view', async () => {
    await g.teleport('test', 'start');
    await g.press('compact', 50);
    await g.idle();
    T.eq(await g.hw((H) => H.HW.compact.active), false, 'no past view in the hall');
    T.ok(await g.hw((H) => /my face/.test(H.transcript.slice(-1)[0]?.text || '')), 'Tess remarks on her reflection');
    await g.teleport('test', 'past_a');
    T.ok(await g.hw((H) => H.HW.compact.hasPastHere), 'hasPastHere inside Room A');
    await g.press('compact', 50);
    T.ok(await g.hw((H) => H.HW.compact.active && H.HW.compact.current.id === 'test_room_a_1979'), 'past view open');
    T.ok((await g.state()).flags.test_saw_past, 'past setFlag');
    await g.hw((H) => H.fullbright(false));
    await g.steps(3);
    await g.shot(`engine_${built ? 'built' : 'dev'}_past_view`);
    T.ok(await g.walkTo([7, 10]), 'walk out of the remembered room');
    T.eq(await g.hw((H) => H.HW.compact.active), false, 'leaving the rect closes the view');
  });

  await T.step('conditional objects', async () => {
    T.eq((await g.prop('test_note')).present, false, 'note hidden until its flag is set');
    T.eq((await g.prop('test_backpack')).present, false, 'chapter-gated backpack hidden in chapter 0');
    await g.hw((H) => { H.setFlag('test_note', true); H.refresh(); });
    T.eq((await g.prop('test_note')).present, true, 'refresh() re-evaluates cond');
    await g.teleport('test', 'note');
    await g.interact();
    T.ok((await g.state()).docs.sample_note, 'note opens its document (marked read)');
  });

  await T.step('flashlight', async () => {
    const before = (await g.state()).flashlightOn;
    await g.press('flashlight', 50);
    T.eq((await g.state()).flashlightOn, !before, 'F toggles the flashlight');
    await g.press('flashlight', 50);
    await g.hw((H) => { H.HW.state.battery = 10; });
    await g.press('right', 600);
    const r = await g.hw((H) => ({ b: H.HW.state.battery, L: { ...H.HW.lighting.flashlight } }));
    T.ok(r.b < 10, 'battery drains while on', r.b);
    T.ok(r.L.on && r.L.power < 1 && Number.isFinite(r.L.angle), 'lighting.flashlight driven each step (dim when low)', r.L);
    await g.hw((H) => H.give('battery', 1));
    T.ok(await g.hw((H) => H.HW.game.useItem('battery')), 'useItem(battery)');
    T.eq((await g.state()).battery, 100, 'fresh batteries');
  });

  await T.step('menus pause the game', async () => {
    const r = await g.hw(async (H) => {
      const modes = [];
      const off = H.HW.game.on('mode', (m) => modes.push(m));
      H.HW.input.tap('pause');
      await H.steps(3);
      off();
      return modes;
    });
    T.ok(r.includes('menu'), 'Esc opens the pause menu (menu mode)', r);
    const frozen = await g.hw(async (H) => {
      if (H.mode() !== 'menu') return null; // a stub UI resolves menus instantly
      const t0 = H.HW.time;
      await H.steps(5);
      return H.HW.time === t0;
    });
    T.ok(frozen !== false, 'HW.time is frozen while a menu is open', frozen);
    // Close it like a player would (cancel); fall back to the UI API if the screen ignores it.
    await g.hw(async (H) => {
      if (H.mode() !== 'menu') return;
      H.HW.input.tap('cancel');
      await H.steps(6);
      if (H.mode() === 'menu') H.HW.ui?.close?.('pause');
      await H.steps(3);
    });
    T.eq(await g.mode(), 'play', 'back to play when the menu resolves');
  });

  await T.step('save / load roundtrip', async () => {
    await g.teleport('test', 'bench');
    await g.hw((H) => { H.setFlag('roundtrip', 42); H.HW.game.setProp('test_door_c', 'jammed'); });
    T.ok(await g.hw((H) => H.save('2')), 'save slot 2');
    const saved = { p: await g.player(), s: await g.state() };
    await g.teleport('test2', 'lib');
    await g.hw((H) => { H.setFlag('roundtrip', 0); H.give('gum', 3); H.HW.game.setProp('test2_lamp', 'off'); });
    T.ok(await g.hw((H) => H.load('2')), 'load slot 2');
    await g.steps(2);
    const p = await g.player();
    const s = await g.state();
    T.ok(p.map === 'test' && Math.abs(p.x - saved.p.x) < 0.01 && Math.abs(p.y - saved.p.y) < 0.01 && p.dir === saved.p.dir, 'position restored', { p, was: saved.p });
    T.eq(s.flags.roundtrip, 42, 'flags restored');
    T.eq(s.inv, saved.s.inv, 'inventory restored');
    T.eq(s.mapState, saved.s.mapState, 'mapState restored');
    T.eq((await g.prop('test_door_c')).state, 'jammed', 'prop state re-applied on load');
    const list = await g.hw((H) => H.HW.game.saves());
    T.ok(list.find((x) => x.slot === '2')?.summary?.mapName === 'Engine Test Wing', 'save summary', list);
  });

  await T.step('g API (test.gapi)', async () => {
    await g.teleport('test', 'start');
    await g.hw((H) => { H.choiceQueue = [1]; });
    await g.hw((H) => H.run('test.gapi'));
    await g.idle();
    const f = (await g.state()).flags;
    const want = ['dialogue', 'items', 'chapter_refresh', 'walk', 'setPos', 'party_add', 'party_remove', 'despawn', 'cam', 'fx', 'lights', 'audio', 'setProp', 'setProp_remote', 'removeProp', 'parallel', 'transfer', 'done'];
    const missing = want.filter((k) => !f[`gapi_${k}`]);
    T.eq(missing, [], 'every g API step completed');
    T.eq(f.gapi_choice, 2, 'choice returns the original index (hidden option skipped)');
    T.eq(f.gapi_count, 3, 'inc');
    T.eq(f.gapi_sub, 2, 'run() inline with ctx');
    T.ok(f.roll1_answered && (await g.state()).rollAnswered === 1 && (await g.state()).bonds.leah, 'flag mirrors (rollAnswered, bonds)');
    T.eq((await g.state()).chapter, 1, 'chapter()');
  });

  await T.step('game over → checkpoint', async () => {
    await g.hw((H) => H.god(true));
    await g.hw((H) => H.HW.game.gameOver('test'));
    T.eq(await g.mode(), 'play', 'god mode suppresses game over');
    await g.hw((H) => H.god(false));
    await g.hw((H) => H.checkpoint('before gameover'));
    await g.teleport('test', 'office');
    const r = await g.hw(async (H) => {
      const modes = [];
      const off = H.HW.game.on('mode', (m) => modes.push(m));
      await H.HW.game.gameOver('caught');
      await H.steps(2);
      off();
      return modes;
    });
    T.ok(r.includes('gameover'), 'game over mode entered', r);
    T.eq(await g.mode(), 'play', 'retry reloads the checkpoint');
    const p = await g.player();
    T.ok(p.room !== 'test_office', 'back at the checkpoint position', p);
  });

  await T.step('no errors', async () => {
    const errs = await g.errors();
    T.eq(errs, [], 'no captured errors');
  });
} catch (e) {
  T.ok(false, 'engine suite crashed', e?.stack || String(e));
} finally {
  await g?.close();
  await browser.close();
}

process.exit(T.done() ? 0 : 1);
