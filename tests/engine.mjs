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
    T.ok(await g.hw((H) => H.transcript.some((e) => e.type === 'door' && e.text === 'test_door_7_12:open')), 'Room A door opened on bump');
    const s = await g.state();
    T.ok(s.visited.test_a, 'room visit recorded');
    T.ok(await g.hw((H) => H.HW.game.until(() => H.HW.map.prop('test_door_7_12').state === 'closed', 4)), 'classroom door swings shut behind us (1.5 s)');
    T.eq((await g.state()).mapState.test?.test_door_7_12?.state, 'closed', 'door state persisted in mapState');
  });

  await T.step('side door', async () => {
    await g.teleport('test', 'in_b');
    T.ok(await g.walkTo('desk_a'), 'walk Room B → Room A');
    T.ok(await g.hw((H) => H.transcript.some((e) => e.type === 'door' && e.text === 'test_door_13_7:open')), 'side door opened');
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
    T.ok(await g.hw((H) => H.transcript.some((e) => e.type === 'door' && e.text === 'test_door_c:open')), 'locked door unlocked and opened');
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
    const drawn = await g.hw(async (H) => {
      await H.steps(2);
      const R = H.HW.renderer;
      const ids = [...R._ysort, ...R._wall].map((x) => x.id);
      return { globe: ids.includes('test_past_globe'), pastBoard: ids.some((i) => /^test_room_a_1979_chalkboard/.test(i)), board: ids.includes('test_chalkboard'), hiddenDesk: ids.includes('test_desk_student_11_8'), inWorld: H.HW.map.props.some((p) => p.id === 'test_past_globe') };
    });
    T.ok(drawn.globe && drawn.pastBoard && !drawn.board && !drawn.hiddenDesk && !drawn.inWorld, 'past view draws pastOnly/past objects and hides `hide` props', drawn);
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

  await T.step('input & display', async () => {
    // Gamepad: a fake standard-mapping pad with the left stick pushed right.
    const pad = await g.hw(async (H) => {
      const x0 = H.HW.player.x;
      const fake = { connected: true, id: 'test pad', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0.9, 0, 0, 0] };
      const orig = navigator.getGamepads;
      navigator.getGamepads = () => [fake];
      await H.steps(30);
      navigator.getGamepads = orig;
      await H.steps(2);
      return { moved: H.HW.player.x - x0, device: H.HW.input.lastDevice };
    });
    T.ok(pad.moved > 10 && pad.device === 'gamepad', 'gamepad left stick moves the player', pad);

    // Text mode: typed keys are queued, not mapped to actions.
    await g.hw((H) => H.HW.input.beginText());
    await g.page.keyboard.type('Run 10');
    await g.page.keyboard.press('Backspace');
    await g.page.keyboard.press('Enter');
    const typed = await g.hw((H) => {
      const t = H.HW.input.typed.slice();
      H.HW.input.endText();
      return { t, confirm: H.HW.input.pressed('confirm') };
    });
    T.eq(typed.t.join('|'), 'R|u|n| |1|0|Backspace|Enter', 'text mode queues typed keys');

    // Menu key repeat.
    const rep = await g.hw((H) => {
      // Step the simulation by hand for an exact count: 1 s held = press + repeats after 0.34 s.
      const { game, input } = H.HW;
      game.stop();
      let n = 0;
      input.setVirtual('down', true);
      for (let i = 0; i < 60; i++) { game.step(1 / 60); if (input.repeat('down')) n++; }
      input.setVirtual('down', false);
      game.step(1 / 60);
      game.start();
      return n;
    });
    T.ok(rep >= 7 && rep <= 10, 'held direction auto-repeats for menus', rep);

    // Integer scaling vs fit, letterboxed.
    await g.page.setViewportSize({ width: 1000, height: 600 });
    await g.steps(2);
    const pp = await g.hw((H) => ({ ...H.HW.display.rect, s: H.HW.display.scale }));
    await g.hw((H) => H.HW.settings.set('pixelPerfect', false));
    const fit = await g.hw((H) => ({ ...H.HW.display.rect, s: H.HW.display.scale }));
    await g.hw((H) => H.HW.settings.set('pixelPerfect', true));
    await g.page.setViewportSize({ width: 960, height: 540 });
    T.ok(pp.s === 2 && pp.w === 960 && pp.x === 20, 'pixel-perfect: integer scale, letterboxed', pp);
    T.ok(fit.s > 2 && fit.w === 1000, 'fit mode fills the window', fit);
    await g.page.keyboard.press('F11');
    await g.page.keyboard.press('Alt+Enter');
    await g.steps(2);
    T.eq(await g.mode(), 'play', 'fullscreen keys are handled without side effects');
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

  await T.step('DESIGN v2 behaviours', async () => {
    // Gate as a condition: lock function returns true while locked.
    await g.teleport('test', 'start');
    await g.hw((H) => H.setFlag('test_storage_locked', true));
    T.eq(await g.hw((H) => H.pathExists('test', 'start', 'storage')), false, 'function lock (true = locked) blocks the storage door');
    T.ok(await g.walkTo([26, 16]), 'walk up to it');
    await g.face('down');
    await g.interact();
    const lt = await g.hw((H) => ({ text: H.transcript.slice(-1)[0]?.text || '', chapter: H.HW.state.chapter }));
    T.ok((lt.chapter >= 1 ? /Locked again/ : /leaning on it/).test(lt.text), 'lockedText may be a function of state', lt);
    await g.hw((H) => H.setFlag('test_storage_locked', false));
    T.ok(await g.walkTo('storage'), 'unlocked once the condition clears');

    // Gated exit refuses in voice and doesn't transfer.
    await g.teleport('test2', 'loop');
    await g.hw((H) => H.setFlag('test_block_loop', true));
    await g.walkTo([30, 12]);
    await g.idle();
    T.eq(await g.map(), 'test2', 'gated exit does not transfer');
    T.ok(await g.hw((H) => H.transcript.some((e) => e.type === 'refuse')), 'gated exit refusal shown');
    await g.hw((H) => H.setFlag('test_block_loop', false));

    // Seats: occupied by a follower → not offered to Tess; followers can be seated.
    await g.teleport('test', 'desk_a');
    const seat = await g.hw(async (H) => {
      const HW = H.HW;
      const e = HW.entities.spawn({ id: 'leah', at: [5, 7] });
      const ok = await HW.hiding.seatNpc(e, HW.map.prop('test_desk_student_3_6'));
      HW.player.face('up');
      await H.steps(2);
      const r = { ok, by: HW.map.prop('test_desk_student_3_6').seatedBy?.id, verb: HW.interact.verb, sit: e.sitDir };
      HW.hiding.unseatNpc(e);
      HW.entities.despawn('leah');
      return r;
    });
    T.ok(seat.ok && seat.by === 'leah' && seat.sit === 'up' && seat.verb !== 'Sit', 'seatNpc seats a follower; the taken seat is not offered', seat);

    // Hold Confirm while seated: eyes shut, ×4 time during a period, no stand-up on release.
    await g.face('up');
    await g.interact();
    const eyes = await g.hw(async (H) => {
      const HW = H.HW;
      const fakePeriods = !HW.periods;
      if (fakePeriods) HW.periods = { active: true };
      HW.input.setVirtual('confirm', true);
      await H.steps(40);
      const during = { shut: HW.player.eyesShut, warp: HW.game.timeWarp };
      HW.input.setVirtual('confirm', false);
      await H.steps(3);
      const after = { shut: HW.player.eyesShut, seated: !!HW.player.seated, warp: HW.game.timeWarp };
      if (fakePeriods) HW.periods = null;
      return { during, after, sitTime: HW.player.sitTime };
    });
    T.ok(eyes.during.shut && eyes.during.warp === 4, 'holding Confirm while seated shuts her eyes (×4 time in a period)', eyes);
    T.ok(!eyes.after.shut && eyes.after.seated && eyes.after.warp === 1, 'releasing opens them without standing up', eyes);
    T.ok(eyes.sitTime > 0, 'sitTime recorded for the Colonel AI');
    await g.press('down', 100);
    await g.idle();

    // g.seen(): first run false, replay true (dialogue becomes fast-forwardable).
    await g.hw((H) => H.run('test.seen_demo'));
    const first = (await g.state()).flags;
    await g.hw((H) => H.run('test.seen_demo'));
    const second = (await g.state()).flags;
    T.ok(first.test_seen_was === false && second.test_seen_was === true && second.test_seen_replaying === true && second.seen_test_demo, 'g.seen marks replays', second);
    T.eq(await g.hw((H) => H.HW.scripts.replaying), false, 'replay flag clears when the scene ends');

    // Battery: dregs at 0 % (weak, never black); Danny's flashlight never drains.
    const dregs = await g.hw(async (H) => {
      const HW = H.HW;
      HW.state.battery = 0;
      HW.state.flashlightOn = true;
      HW.state.lightSource = 'maglite';
      let min = 1;
      let max = 0;
      for (let i = 0; i < 90; i++) { await H.steps(1); const p = HW.lighting.flashlight.power; min = Math.min(min, p); max = Math.max(max, p); }
      return { on: HW.lighting.flashlight.on, min, max };
    });
    T.ok(dregs.on && dregs.min > 0 && dregs.max <= 0.15 + 1e-6, 'Maglite runs on the dregs at 0 % (never black)', dregs);
    const danny = await g.hw(async (H) => {
      const HW = H.HW;
      H.give('danny_flashlight', 1);
      HW.state.battery = 50;
      const used = await HW.game.useItem('danny_flashlight');
      HW.input.setVirtual('right', true);
      await H.steps(30);
      HW.input.setVirtual('right', false);
      const L = HW.lighting.flashlight;
      const r = { used, source: L.source, power: L.power, battery: HW.state.battery, cone: L.cone };
      await HW.game.useItem('flashlight');
      r.back = HW.state.lightSource;
      return r;
    });
    T.ok(danny.used && danny.source === 'danny' && Math.abs(danny.power - 0.35) < 1e-6 && danny.battery === 50, "Danny's flashlight: weak, narrow, never drains", danny);
    T.eq(danny.back, 'maglite', 'using the Maglite switches back');

    // Entity-attached light (Danny's red flashlight while he follows).
    const lit = await g.hw(async (H) => {
      const HW = H.HW;
      await H.run('test.sub'); // any script context
      await HW.scripts.runFn((gg) => { gg.party.add('danny'); gg.light('danny', { type: 'flashlight', color: '#ff5040', power: 0.4 }); });
      await H.steps(3);
      const e = HW.entities.get('danny');
      const r = { has: !!e._light, x: e._light?.px, ex: e.x, persisted: !!HW.state.entityLights.danny };
      await HW.scripts.runFn((gg) => { gg.light('danny', null); gg.party.remove('danny'); gg.despawn('danny'); });
      return r;
    });
    T.ok(lit.has && lit.x === lit.ex && lit.persisted, 'g.light attaches a light that follows the entity', lit);

    // Assist: two deaths at the same checkpoint → +30 %.
    const assist = await g.hw(async (H) => {
      const HW = H.HW;
      H.checkpoint('assist test');
      await HW.game.gameOver('caught');
      await H.steps(2);
      await HW.game.gameOver('caught');
      await H.steps(2);
      return { deaths: HW.state.flags.deaths_assist_test, assist: HW.state.assist, mode: HW.game.mode };
    });
    T.ok(assist.deaths === 2 && assist.assist === 1.3 && assist.mode === 'play', 'assist after two deaths at one checkpoint', assist);

    // The Colonel's shroud: near-black silhouette + emissive brass/crimson mask.
    await g.teleport('test', 'start');
    const shroud = await g.hw(async (H) => {
      const HW = H.HW;
      const prev = HW.colonel;
      const e = HW.entities.spawn({ id: 'colonel', sprite: 'colonel', at: [24, 15], dir: 'down' });
      HW.colonel = { shrouded: true, entity: e };
      await H.steps(3);
      const used = HW.renderer._shroud === e;
      const s = HW.renderer._shroudOf(e.frameImage());
      return { used, glow: !!s.glow, prevType: typeof prev };
    });
    T.ok(shroud.used && shroud.glow, 'shrouded Colonel renders as a silhouette with an emissive mask', shroud);
    await g.hw((H) => H.fullbright(false));
    await g.steps(2);
    await g.shot(`engine_${built ? 'built' : 'dev'}_shroud`);
    await g.hw((H) => { H.HW.colonel = null; H.HW.entities.despawn('colonel'); });
  });

  await T.step('special screens (g.screen)', async () => {
    await g.hw((H) => H.screenAnswer('safe', true));
    await g.hw((H) => H.run('test.screen'));
    await g.idle();
    const f = (await g.state()).flags;
    const stubUI = await g.hw((H) => typeof H.HW.ui.get !== 'function');
    T.ok(f.test_screen_done && (f.test_safe === true || stubUI), 'g.screen resolves with the screen result', f.test_safe);
  });

  await T.step('ending → credits → title', async () => {
    await g.hw((H) => H.screenAnswer('credits', null));
    const r = await g.hw(async (H) => {
      const seen = [];
      let flags = null;
      const off = H.HW.game.on('mode', (m) => {
        seen.push(m);
        if (m === 'title' && !flags) flags = { ...H.HW.state.flags }; // before the title may start a new game
      });
      H.run('test.ending');
      await H.HW.game.until(() => seen.includes('title'), 30);
      off();
      return { seen, flags };
    });
    T.ok(r.seen.includes('ending') && r.seen.includes('title'), 'ending mode, then the title', r.seen);
    T.ok(r.flags?.test_ending_ran && r.flags?.ending === 'test', 'end.<id> ran and the ending flag is set', r.flags);
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
