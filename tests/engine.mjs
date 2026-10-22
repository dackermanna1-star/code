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
    { const b = (await g.state()).battery; T.ok(b > 99.5, 'fresh batteries (100, less a few steps of drain)', b); }
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
    await g.teleport('test', 'start'); // a known spot (no exit within 30 steps of walking east)
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

    // Scaling: by default fill the window (sharp), snapping to a whole number within 6 %; the
    // pixel-perfect setting forces the whole-number scale, letterboxed.
    const rectAt = async (w, h) => {
      await g.page.setViewportSize({ width: w, height: h });
      await g.steps(2);
      return g.hw((H) => ({ ...H.HW.display.rect, s: H.HW.display.scale }));
    };
    T.eq(await g.hw((H) => H.HW.settings.get('pixelPerfect')), false, 'default scaling: fill (pixel-perfect off)');
    const snap = await rectAt(1000, 600);
    T.ok(snap.s === 2 && snap.w === 960 && snap.x === 20, 'fill: a near-whole scale snaps to it (1000×600 → ×2, 20 px border)', snap);
    const fit = await rectAt(1366, 768);
    T.ok(fit.s > 2.8 && fit.w >= 1365 && fit.h === 768, 'fill: 1366×768 fills the window (×2.84, sharp)', fit);
    const small = await rectAt(800, 450);
    T.ok(small.w === 800 && small.h === 450, 'fill: 800×450 fills the window (was ×1 at 480×270)', small);
    await g.hw((H) => H.HW.settings.set('pixelPerfect', true));
    const pp = await g.hw((H) => ({ ...H.HW.display.rect, s: H.HW.display.scale }));
    await g.hw((H) => H.HW.settings.set('pixelPerfect', false));
    T.ok(pp.s === 1 && pp.w === 480, 'pixel-perfect: whole-number scale, letterboxed', pp);
    const shot = await g.page.screenshot();
    T.ok(shot.length > 1000, 'sharp-scaled frame renders');
    await rectAt(960, 540);
    await g.page.keyboard.press('F11');
    await g.page.keyboard.press('Alt+Enter');
    await g.steps(2);
    T.eq(await g.mode(), 'play', 'fullscreen keys are handled without side effects');
    await g.page.waitForTimeout(300);
    const fsSync = await g.hw((H) => ({ live: H.HW.display.fullscreen, setting: H.HW.settings.get('fullscreen') }));
    T.eq(fsSync.setting, fsSync.live, 'the Fullscreen setting follows the real state', fsSync);
    await g.page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
    await g.page.waitForTimeout(300);
    T.eq(await g.hw((H) => H.HW.settings.get('fullscreen')), false, 'leaving fullscreen (Esc / F11) updates the setting');
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
      const savedPeriods = HW.periods;
      HW.periods = { active: true };
      HW.input.setVirtual('confirm', true);
      await H.steps(40);
      const during = { shut: HW.player.eyesShut, warp: HW.game.timeWarp };
      HW.input.setVirtual('confirm', false);
      await H.steps(3);
      const after = { shut: HW.player.eyesShut, seated: !!HW.player.seated, warp: HW.game.timeWarp };
      HW.periods = savedPeriods;
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

  await T.step('engine fixes v2.2', async () => {
    await g.teleport('test', 'start');
    // 1. A shadowless dynamic light that moves redraws its lightmap sprite (not just its halo).
    const mv = await g.hw(async (H) => {
      const HW = H.HW;
      const cam = HW.camera.view;
      const c = document.createElement('canvas'); c.width = 480; c.height = 270;
      const ctx = c.getContext('2d');
      const L = HW.lighting.addLight({ type: 'bulb', shadows: false, px: cam.x + 200, py: cam.y + 130, map: HW.map.id });
      await H.steps(2);
      HW.lighting.render(ctx, { x: cam.x, y: cam.y, w: 480, h: 270 });
      const bx0 = L._bx;
      L.px += 40;
      await H.steps(2);
      HW.lighting.render(ctx, { x: cam.x, y: cam.y, w: 480, h: 270 });
      const r = { bx0, bx1: L._bx };
      HW.lighting.removeLight(L);
      return r;
    });
    T.ok(Math.abs(mv.bx1 - mv.bx0 - 40) <= 2, 'shadows:false light: moving it moves its lightmap pool', mv);

    // 2. g.light on an entity that already carries a light: rebuilt on a shape change, live-updated otherwise.
    const sl = await g.hw(async (H) => {
      const HW = H.HW;
      HW.entities.spawn({ id: 'lampkid', sprite: 'danny', at: [24, 15] });
      const mine = () => HW.lighting.lights.filter((l) => l.entity === 'lampkid');
      await HW.scripts.runFn((gg) => gg.light('lampkid', { type: 'flashlight', power: 0.35, cone: 30 }));
      await H.steps(2);
      const a = mine()[0];
      await HW.scripts.runFn((gg) => gg.light('lampkid', { type: 'bulb', radius: 1.5, intensity: 0.55, cage: false, glow: null }));
      await H.steps(2);
      const b = mine()[0];
      await HW.scripts.runFn((gg) => gg.light('lampkid', { type: 'bulb', radius: 3, intensity: 0.7, cage: false, glow: null }));
      await H.steps(2);
      const c = mine()[0];
      const r = { n: mine().length, a: a?.type, b: b?.type, rebuilt: a !== b, bShape: b?._r, same: b === c, cR: c?.radius, cI: c?.intensity, cPx: c?._r };
      await HW.scripts.runFn((gg) => gg.light('lampkid', null));
      await H.steps(1);
      r.after = mine().length;
      HW.entities.despawn('lampkid');
      return r;
    });
    T.ok(sl.n === 1 && sl.a === 'flashlight' && sl.b === 'bulb' && sl.rebuilt, 'g.light: a new type replaces the light (one light, new shape)', sl);
    T.ok(sl.same && sl.cR === 3 && sl.cI === 0.7 && sl.cPx === 48, 'g.light: radius/intensity change updates the live light in place', sl);
    T.eq(sl.after, 0, 'g.light(id, null) removes it');

    // 3. Exit scripts: after the transfer (default), and 'before' + return false cancels it.
    const ex = await g.hw(async (H) => {
      const HW = H.HW;
      const out = { runs: [] };
      HW.data.scripts['test.v22_exit'] = async (gg, ctx) => { out.runs.push({ map: HW.map.id, from: ctx.from, to: ctx.to, mode: HW.game.mode, transferring: HW.game.transferring }); };
      HW.data.scripts['test.v22_gate'] = async () => { out.runs.push({ gate: HW.map.id }); return false; };
      const exit = HW.map.exits.find((e) => e.to === 'test2' && e.fade !== false);
      exit.script = 'test.v22_exit';
      const ok = await H.walkTo([46, 14]);
      await H.idle();
      out.ok = ok;
      out.map = HW.map.id;
      out.rec = H.transcript.filter((t) => t.type === 'exitScript').map((t) => t.text);
      // 'before' on the way back: cancels.
      await H.teleport('test', 'hall_east');
      const exit2 = HW.map.exits.find((e) => e.to === 'test2' && e.fade !== false);
      exit2.script = 'test.v22_gate';
      exit2.scriptWhen = 'before';
      HW.input.setVirtual('right', true);
      await H.steps(80);
      HW.input.setVirtual('right', false);
      await H.idle();
      out.mapAfterGate = HW.map.id;
      delete exit2.script;
      delete exit2.scriptWhen;
      delete HW.data.scripts['test.v22_exit'];
      delete HW.data.scripts['test.v22_gate'];
      return out;
    });
    const r0 = ex.runs[0] || {};
    T.ok(ex.ok && ex.map === 'test2' && r0.map === 'test2' && r0.from === 'test' && r0.to === 'test2' && r0.mode === 'cutscene' && !r0.transferring, 'exit `script` runs after the transfer completes (blocking)', ex);
    T.ok(ex.runs.some((r) => r.gate === 'test') && ex.mapAfterGate === 'test', "exit scriptWhen:'before' runs first; returning false cancels the transfer", ex);

    // 4. heads_down overlay: { tight, cx, cy } (world px) — the clear centre goes where it's told.
    const hd = await g.hw(async (H) => {
      const HW = H.HW;
      H.autoAdvance(false);
      const cam = HW.camera.view;
      const ux = 160, uy = 300;                       // UI px of a world point
      const wx = cam.x + ux / 2, wy = cam.y + uy / 2;
      HW.ui.setOverlay('heads_down', { tight: 0.85, cx: wx, cy: wy });
      await H.steps(30);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const uctx = HW.display.uiCtx;
      const a = (x, y) => uctx.getImageData(x, y, 1, 1).data[3];
      const r = { atCentre: a(ux, uy), farRight: a(900, 60), params: { ...HW.ui.overlays.items.get('heads_down')?.params } };
      HW.ui.setOverlay('heads_down', null);
      await H.steps(30);
      H.autoAdvance(true);
      return r;
    });
    T.ok(hd.atCentre < 200 && hd.farRight === 255, 'heads_down: the tunnel opens around cx/cy (world px), dark elsewhere', hd);

    // 5. VHS: locked scripted sequence (input ignored, steps itself, closes with done) + the legacy ch2 hooks.
    const vhs = await g.hw(async (H) => {
      const HW = H.HW;
      const out = { frames: [], steps: [] };
      // under autoAdvance: resolves at once, firing the callbacks in order
      out.auto = await HW.scripts.runFn((gg) => gg.screen('vhs', { locked: true, sequence: [{ frame: 0, hold: 1 }, { frame: 3, hold: 1 }, { frame: 5, hold: 1 }], onFrame: (i) => out.frames.push(i), onStep: (k) => out.steps.push(k) }));
      H.autoAdvance(false);
      const p = HW.ui.open('vhs', { locked: true, sequence: [{ frame: 1, hold: 0.3 }, { frame: 2, hold: 0.3 }] });
      const scr = HW.ui.get('vhs');
      out.start = scr.frame;
      HW.input.setVirtual('cancel', true);
      await H.steps(6);
      HW.input.setVirtual('cancel', false);
      out.ignoredCancel = HW.ui.get('vhs') === scr;
      let res = null;
      p.then((r) => { res = r; });
      await HW.game.until(() => res !== null, 5);
      out.res = res;
      // legacy: ch2 wraps update() and calls _step(1) itself
      const p2 = HW.ui.open('vhs', { start: 0, min: 0, max: 5 });
      const s2 = HW.ui.get('vhs');
      const upd = s2.update;
      s2.update = (dt) => upd.call(s2, dt, null);
      s2.playing = true; s2.hold = 1e9;
      s2._step(1); await H.steps(30); s2._step(1); await H.steps(30);
      out.legacy = s2.i;
      HW.ui.close('vhs', { frame: 5, held: 0 });
      out.legacyRes = await p2;
      H.autoAdvance(true);
      return out;
    });
    T.ok(vhs.auto?.done && vhs.auto.frame === 5 && vhs.frames.join() === '0,3,5' && vhs.steps.join() === '0,1,2', 'vhs sequence under autoAdvance: callbacks in order, { done, frame }', vhs);
    T.ok(vhs.start === 1 && vhs.ignoredCancel && vhs.res?.done && vhs.res.frame === 2, 'vhs locked: Cancel ignored; the sequence plays and closes itself', vhs);
    T.ok(vhs.legacy === 2 && vhs.legacyRes?.frame === 5, "vhs: ch2's wrapped update + _step(1) still drive the tape", vhs);

    // 6. The beam turns with Tess in cutscenes; a manual angle holds until her next turn.
    const fl = await g.hw(async (H) => {
      const HW = H.HW;
      const out = {};
      H.autoAdvance(false);
      await HW.scripts.runFn(async (gg) => {
        gg.face('tess', 'down');
        await gg.wait(0.6);
        gg.face('tess', 'left');
        await gg.wait(0.1);
        out.mid = HW.flashlight.angle;
        await gg.wait(0.7);
        out.left = HW.flashlight.angle;
        HW.flashlight.angle = 0.3;               // a script's manual aim
        await gg.wait(0.5);
        out.manual = HW.flashlight.angle;
        gg.face('tess', 'up');
        await gg.wait(0.8);
        out.up = HW.flashlight.angle;
        const p = HW.player;
        gg.face('tess', { x: p.x + 100, y: p.y + 3 });   // a point: aim straight at it
        await gg.wait(0.8);
        out.point = HW.flashlight.angle;
        out.mode = HW.game.mode;
      });
      H.autoAdvance(true);
      return out;
    });
    const near0 = (a, b, tol = 0.06) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < tol;
    T.ok(fl.mode === 'cutscene' && near0(fl.left, Math.PI) && !near0(fl.mid, Math.PI, 0.01), 'cutscene: g.face turns the beam, smoothly', fl);
    T.ok(near0(fl.manual, 0.3, 1e-9) && near0(fl.up, -Math.PI / 2) && near0(fl.point, 0, 0.08), 'manual HW.flashlight.angle holds; the next g.face re-aims (also at a point)', fl);

    // 7. Intercom text: no letter substitution unless opts.glitch.
    const vt = await g.hw(async (H) => {
      const HW = H.HW;
      const D = HW.ui.dialogue;
      H.autoAdvance(false);
      const count = async (opts) => {
        const p = HW.ui.say('voice', null, 'Theresa Dolan. Absences. Present. Theresa Dolan. Absences.', opts);
        await H.steps(4);
        const line = D.cur;
        if (!line) return { err: 'no line' };
        line.elapsed = 1e9;
        const f = line.style.font();
        const own = Object.prototype.hasOwnProperty.call(f, 'glyph');
        const orig = f.glyph;
        const seen = new Set();
        f.glyph = function (ctx, ch, ...rest) { seen.add(ch); return orig.call(this, ctx, ch, ...rest); };
        const c = document.createElement('canvas'); c.width = 960; c.height = 540;
        const t0 = D.t;
        try {
          for (let k = 0; k < 1500; k++) { D.t = t0 + k * 0.05; D.render(c.getContext('2d')); }
        } finally { if (own) f.glyph = orig; else delete f.glyph; D.t = t0; }
        D.reset();
        await p;
        return [...seen].filter((ch) => '#%&@/'.includes(ch)).join('');
      };
      const r = { plain: await count({}), glitch: await count({ glitch: true }) };
      H.autoAdvance(true);
      return r;
    });
    T.ok(vt.plain === '' && vt.glitch.length > 0, "voice lines keep their letters; opts.glitch opts in to substitutions", vt);

    // 8. Light groups persist in HW.state.lightGroups across save/load; a new game clears them.
    const lg = await g.hw(async (H) => {
      const HW = H.HW;
      const L = HW.lighting;
      L.setGroup('v22_bank', true);
      L.setGroup('v22_lamp', false);
      L.setGroup('period', true, { mode: 'instant' });
      const saved = { ...HW.state.lightGroups };
      H.save('3');
      L.setGroup('v22_bank', false);
      L.setGroup('v22_lamp', null);
      H.load('3');
      await H.steps(2);
      const loaded = { bank: L.groupOn('v22_bank'), lamp: L.groupOn('v22_lamp'), state: { ...HW.state.lightGroups } };
      L.setGroup('period', null, { mode: 'instant' });
      L.setGroup('v22_bank', null);
      L.setGroup('v22_lamp', null);
      return { saved, loaded };
    });
    T.ok(lg.saved.v22_bank === true && lg.saved.v22_lamp === false && !('period' in lg.saved), "setGroup records explicit states in HW.state.lightGroups ('period' excluded)", lg);
    T.ok(lg.loaded.bank === true && lg.loaded.lamp === false, 'group states come back on load', lg);
    const fresh = await g.hw((H) => {
      const L = H.HW.lighting;
      L.setGroup('v22_bank', false);
      const S0 = H.HW.state;
      H.HW.state = { ...S0, lightGroups: {} };                // what a new game brings
      const on = L.groupOn('v22_bank');
      H.HW.state = S0;
      const back = L.groupOn('v22_bank');
      L.setGroup('v22_bank', null);
      return { on, back };
    });
    T.ok(fresh.on === true && fresh.back === false, 'a different state (new game) brings its own (empty) groups', fresh);

    // 9. Weather: map.data.weather is applied by HW.weather unless the prologue's own system is installed.
    const wx = await g.hw(async (H) => {
      const HW = H.HW;
      const w = HW.weather;
      const r = { exists: !!w, deferredWithPro: w?.deferred };
      const foreign = HW.game.systems.filter((s) => s !== w && /steam_vent/.test(String(s.update)));
      for (const s of foreign) HW.game.removeSystem(s);
      HW.map.data.weather = { rain: 0.8 };
      w.onMapLoad(HW.map);
      r.deferredAlone = w.deferred;
      r.rainOn = HW.fx._rain?.target;
      delete HW.map.data.weather;
      w.onMapLoad(HW.map);
      r.rainOff = HW.fx._rain?.target;
      for (const s of foreign) HW.game.addSystem(s);
      r.deferredAgain = w.deferred;
      r.foreign = foreign.length;
      return r;
    });
    T.ok(wx.exists && wx.deferredAlone === false && Math.abs(wx.rainOn - 0.8) < 1e-6 && wx.rainOff === 0, 'HW.weather applies map.data.weather rain on load', wx);
    T.ok(wx.deferredWithPro === wx.foreign > 0 && wx.deferredAgain === wx.foreign > 0, "HW.weather defers while pro.js's weather system is installed", wx);

    // 10. Audio: car_radio loop and radio_off sfx exist and render.
    const au = await g.hw(async (H) => {
      const A = H.HW.audio;
      const rms = (x) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length)); };
      const peak = (x) => { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); return m; };
      const loop = await A.renderOffline('loop', 'car_radio', 6);
      const off = await A.renderOffline('sfx', 'radio_off', 0.5);
      return { ids: !!(A.ids?.loops?.includes('car_radio') && A.ids?.sfx?.includes('radio_off')), loopRms: rms(loop), loopPeak: peak(loop), offPeak: peak(off), finite: [...loop.subarray(0, 4000)].every(Number.isFinite) };
    });
    T.ok(au.ids && au.loopRms > 0.002 && au.loopPeak < 1 && au.offPeak > 0.02 && au.finite, "audio: loop 'car_radio' and sfx 'radio_off' render", au);

    // 11. HW.art.warmCg forwards to the CG modules (Colonel CGs, the CG agent's preps); unknown ids no-op.
    const wc = await g.hw((H) => {
      const A = H.HW.art;
      const t0 = performance.now();
      try { A.warmCg('vhs_frames'); A.warmCg('register_book'); A.warmCg('no_such_cg'); } catch (e) { return { err: String(e) }; }
      return { ok: typeof A.warmCg === 'function', ms: Math.round(performance.now() - t0) };
    });
    T.ok(wc.ok && !wc.err, 'HW.art.warmCg(id)', wc);

    // 12. Title: thunder follows title_bg's built-in lightning (rising edge → thunder with a delay).
    const th = await g.hw(async (H) => {
      const HW = H.HW;
      H.autoAdvance(false);
      const cg = HW.art.cg('title_bg');
      let edges = 0, armed = true;
      for (let t = 0; t <= 40; t += 1 / 60) { const v = cg.lightning(t); if (v >= 0.5 && armed) { edges++; armed = false; } else if (v < 0.05) armed = true; }
      const calls = [];
      const orig = HW.audio.sfx;
      HW.audio.sfx = (id, o) => { if (id === 'thunder') calls.push(o); return orig.call(HW.audio, id, o); };
      HW.ui.open('title', {});
      const s = HW.ui.get('title');
      try { for (let t = 0; t <= 40; t += 1 / 60) { s.t = t; s._thunder(); } } finally { HW.audio.sfx = orig; }
      HW.ui.close('title', null);
      await H.steps(80);
      H.autoAdvance(true);
      return { edges, calls: calls.length, vol: calls[0]?.vol, delay: calls[0]?.delay };
    });
    T.ok(th.edges >= 2 && th.calls === th.edges && th.vol === 0.6 && th.delay > 0.3 && th.delay < 1.2, "title: one thunder (vol .6, short delay) per title_bg lightning strike", th);
    T.eq(await g.mode(), 'play', 'still in play after the title-screen probe');
  });

  await T.step('integration 2', async () => {
    await g.teleport('test', 'start');
    await g.idle();
    // 1. compact: past.cond hides a view; hasPastHere needs compact_unlocked.
    const cp = await g.hw(async (H) => {
      const HW = H.HW;
      await H.teleport('test', 'past_a');
      const pe = HW.map.past[0];
      const r = { base: HW.compact.hasPastHere };
      pe.cond = (st) => !!st.flags.i2_past;
      r.condOff = HW.compact.hasPastHere || !!HW.compact.pastHere();
      HW.state.flags.i2_past = true;
      r.condOn = HW.compact.hasPastHere;
      delete pe.cond; delete HW.state.flags.i2_past;
      const un = HW.state.flags.compact_unlocked;
      HW.state.flags.compact_unlocked = false;
      r.locked = HW.compact.hasPastHere;
      HW.state.flags.compact_unlocked = un;
      return r;
    });
    T.ok(cp.base && !cp.condOff && cp.condOn, 'compact: a past view whose cond fails is not offered (pastHere/hasPastHere)', cp);
    T.ok(cp.locked === false, 'compact: no HUD sparkle before compact_unlocked', cp);

    // 2. Lightning flashes only real window tiles (an explicit window light on a floor cell does not).
    const mf = await g.hw((H) => {
      const HW = H.HW;
      const map = HW.map;
      const win = map.windowCells[0];
      const cam = { x: win.tx * 16 - 64, y: win.ty * 16 - 64, w: 480, h: 270 };
      const c = document.createElement('canvas'); c.width = 480; c.height = 270;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 480, 270);
      const floor = { tx: win.tx + 2, ty: win.ty + 3 };
      HW.lighting.moon.flash(ctx, cam, map, [{ tx: floor.tx, ty: floor.ty, explicit: { type: 'window' } }, { tx: win.tx, ty: win.ty, explicit: null }], 1, false, '#ffffff');
      const px = (tx, ty) => ctx.getImageData(tx * 16 - cam.x + 8, ty * 16 - cam.y + 8, 1, 1).data[0];
      return { window: px(win.tx, win.ty), floor: px(floor.tx, floor.ty), floorKey: map.tileAt(floor.tx, floor.ty) };
    });
    T.ok(mf.window > 100 && mf.floor === 0, 'lightning: window tiles flash, a window light on a non-window cell does not', mf);

    // 3. Seat examine: confirm while seated shows it, the next confirm stands her up.
    T.ok(await g.walkTo('desk_a'), 'walk to the desk (seat examine)');
    await g.face('up');
    await g.interact();
    T.eq((await g.player()).seated, 'test_desk_student_3_6', 'seated');
    await g.interact();
    T.ok(await g.hw((H) => /Initials/.test(H.transcript.slice(-1)[0]?.text || '')), 'first confirm while seated: the examine text');
    T.ok((await g.player()).seated, 'still seated after the examine');
    await g.interact();
    await g.idle();
    T.ok(!(await g.player()).seated, 'second confirm while seated: she stands up');

    // 4. Seat sitScript: runs after she sits, queued behind a blocking script a 'sit' listener started.
    const ss = await g.hw(async (H) => {
      const HW = H.HW;
      const order = [];
      HW.data.scripts['test.i2_first'] = async (gg) => { order.push('first'); await gg.wait(0.3); order.push('first_end'); };
      HW.data.scripts['test.i2_sit'] = async (gg, ctx) => { order.push(`sit:${ctx.prop?.id}:${!!ctx.seated}:${HW.game.mode}`); };
      const bench = HW.map.prop('test_bench');
      bench.inst.sitScript = 'test.i2_sit';
      const off = HW.game.on('sit', (p) => { if (p === bench) HW.scripts.run('test.i2_first'); });
      await H.teleport('test', 'bench');
      H.face('up');
      await H.interact();
      await H.HW.game.until(() => order.length >= 3, 5);
      await H.idle();
      const r = { order: order.slice(), seated: HW.player.seated?.id, resolved: HW.hiding.sitScriptFor(bench) };
      off();
      delete bench.inst.sitScript;
      delete HW.data.scripts['test.i2_first']; delete HW.data.scripts['test.i2_sit'];
      HW.input.setVirtual('down', true); await H.steps(10); HW.input.setVirtual('down', false); await H.idle();
      return r;
    });
    T.eq(ss.order, ['first', 'first_end', 'sit:test_bench:true:cutscene'], 'sitScript runs after sitting, after the blocking sit-listener script, as a cutscene');
    T.ok(ss.seated === 'test_bench' && ss.resolved === 'test.i2_sit', 'still seated; hiding.sitScriptFor resolves the instance sitScript', ss);

    // 5. Assembly front-row default (ch7.front_<front>) and its deferral to a script's own sit hook.
    const fr = await g.hw((H) => {
      const HW = H.HW;
      const A = HW.assembly;
      const s = HW.state;
      const saved = { ch: s.chapter, f: { ...s.flags }, fs: A.frontScenes };
      const prop = { id: 'fake_front', inst: { front: 'danny' } };
      const hasScript = HW.scripts.has('ch7.front_danny');
      if (!hasScript) HW.data.scripts['ch7.front_danny'] = async () => {};
      const r = {};
      s.chapter = 7; s.flags.ch7_started = true;
      r.noRoll = A.sitScriptFor(prop);
      s.flags.roll3_done = true;
      A.frontScenes = true; r.forced = A.sitScriptFor(prop);
      A.frontScenes = 'auto'; r.auto = A.sitScriptFor(prop); r.deferred = A.frontDeferred;
      A.frontScenes = false; r.off = A.sitScriptFor(prop);
      s.flags.register_done = true; A.frontScenes = true; r.after = A.sitScriptFor(prop);
      r.plain = A.sitScriptFor({ id: 'x', inst: {} });
      s.chapter = saved.ch; s.flags = saved.f; A.frontScenes = saved.fs;
      if (!hasScript) delete HW.data.scripts['ch7.front_danny'];
      return r;
    });
    T.ok(fr.noRoll === null && fr.forced === 'ch7.front_danny' && fr.off === null && fr.after === null && fr.plain === null, 'assembly.sitScriptFor: front seat → ch7.front_<front> after roll #3, Ch7 only', fr);
    T.ok(fr.deferred ? fr.auto === null : fr.auto === 'ch7.front_danny', "assembly front scenes: 'auto' defers to a script's own front-row sit hook (ch7.js)", fr);

    // 6. Map `sounds`: a positional loop while cond holds (refresh), handed over to a script that plays it.
    const snd = await g.hw(async (H) => {
      const HW = H.HW;
      await H.teleport('test', 'start');
      const A = HW.ambient;
      const map = HW.map;
      const at = [20, 14];
      const x = at[0] * 16 + 8, y = at[1] * 16 + 8;
      const mine = () => (HW.audio.activeLoops?.('faucet') || []).filter((l) => l.x === x && l.y === y).length;
      const r = { api: typeof HW.audio.activeLoops === 'function' };
      map.data.sounds = [{ loop: 'faucet', at, vol: 0.4, radius: 12, cond: (st) => !!st.flags.i2_snd }];
      A.onMapLoad(map);
      await H.steps(40);
      r.off = mine();
      H.setFlag('i2_snd', true); H.refresh();
      await H.steps(4);
      r.on = mine();
      r.entryOn = !!A.sounds[0]?.handle;
      H.setFlag('i2_snd', false); H.refresh();
      await H.steps(4);
      r.entryOff = !A.sounds[0]?.handle;
      // A script already plays the same loop there: the map entry stays out of it for the visit.
      H.setFlag('i2_snd', true);
      const foreign = HW.audio.loop('faucet', { x, y, vol: 0.4 });
      A.onMapLoad(map);
      await H.steps(40);
      r.deferred = A.sounds[0]?.deferred && !A.sounds[0]?.handle;
      foreign.stop(0.05);
      await H.steps(40);
      r.stillDeferred = A.sounds[0]?.deferred && !A.sounds[0]?.handle;
      // mute(): a scene silences the entry for the rest of the visit.
      A.onMapLoad(map);
      await H.steps(40);
      r.beforeMute = !!A.sounds[0]?.handle;
      r.muted = A.mute('faucet', 0.05);
      await H.steps(40);
      r.afterMute = !A.sounds[0]?.handle && mine() === 0;
      delete map.data.sounds; delete HW.state.flags.i2_snd;
      A.onMapLoad(map);
      return r;
    });
    T.ok(snd.api && snd.off === 0 && snd.on === 1 && snd.entryOn && snd.entryOff, 'map sounds: positional loop while cond holds, re-checked on refresh', snd);
    T.ok(snd.deferred && snd.stillDeferred, 'map sounds: a script playing the same loop at the spot owns it for the visit', snd);
    T.ok(snd.beforeMute && snd.muted === 1 && snd.afterMute, 'map sounds: HW.ambient.mute(loop) silences it for the visit', snd);

    // 7. Map `fx`: ambient emitters near the camera (object and array forms; cond).
    const fx = await g.hw(async (H) => {
      const HW = H.HW;
      const map = HW.map;
      const counts = {};
      const orig = HW.fx.emit;
      HW.fx.emit = function (type, ...rest) { counts[type] = (counts[type] || 0) + 1; return orig.call(this, type, ...rest); };
      map.data.fx = { drip: [[20, 14]], ember: [[21, 14]] };
      HW.ambient.onMapLoad(map);
      await H.steps(240);
      const a = { ...counts };
      for (const k of Object.keys(counts)) delete counts[k];
      map.data.fx = [{ type: 'steam', at: [20, 14], every: 0.2, cond: (st) => !!st.flags.i2_fx }, { type: 'coal_dust', points: [[400, 400]] }];
      HW.ambient.onMapLoad(map);
      await H.steps(60);
      const b = { ...counts };
      HW.state.flags.i2_fx = true;
      await H.steps(60);
      const c = { ...counts };
      HW.fx.emit = orig;
      delete map.data.fx; delete HW.state.flags.i2_fx;
      HW.ambient.onMapLoad(map);
      return { a, b, c, emitters: HW.ambient.emitters.length };
    });
    T.ok(fx.a.drip >= 1 && fx.a.ember >= 2, 'map fx (object form): drips and embers emitted near the camera', fx);
    T.ok(!fx.b.steam && !fx.b.coal_dust && fx.c.steam >= 3 && !fx.c.coal_dust && fx.emitters === 0, 'map fx (array form): cond gates an emitter; points off screen stay idle', fx);

    // 8. Weather: rain is cut at once on a map without weather (also while deferring to pro.js);
    //    vent steam comes from exactly one system.
    const wx = await g.hw(async (H) => {
      const HW = H.HW;
      HW.fx.rain(true, 1, { instant: true });
      const r = { before: HW.fx.rainLevel };
      HW.weather.onMapLoad(HW.map);
      r.after = HW.fx.rainLevel; r.deferred = HW.weather.deferred;
      HW.fx.rain(true, 1);
      await H.steps(2);
      r.leak = HW.fx.rainLevel;
      // steam: HW.weather emits nothing itself while pro.js's system runs; alone, it does.
      await H.teleport('exterior', 'start');
      const counts = { n: 0 };
      const orig = HW.fx.emit;
      HW.fx.emit = function (type, ...rest) { if (type === 'steam') counts.n++; return orig.call(this, type, ...rest); };
      for (let i = 0; i < 300; i++) HW.weather.update(1 / 60);
      r.ownWhileDeferred = counts.n;
      const foreign = HW.game.systems.filter((sy) => sy !== HW.weather && /steam_vent/.test(String(sy.update)));
      for (const sy of foreign) HW.game.removeSystem(sy);
      for (let i = 0; i < 300; i++) HW.weather.update(1 / 60);
      r.ownAlone = counts.n;
      for (const sy of foreign) HW.game.addSystem(sy);
      HW.fx.emit = orig;
      r.foreign = foreign.length;
      r.extRain = HW.fx._rain.target;
      await H.teleport('test', 'start');
      r.backIn = HW.fx.rainLevel;
      return r;
    });
    T.ok(wx.before > 0.9 && wx.after === 0 && wx.leak === 0, 'weather: rain snaps off on a map without weather, and stays off', wx);
    T.ok(wx.foreign === 0 || (wx.ownWhileDeferred === 0 && wx.ownAlone > 0), 'weather: steam from one system only (HW.weather idle while pro.js drives it)', wx);
    T.ok(wx.extRain > 0 && wx.backIn === 0, 'weather: exterior rains; back indoors no rain at all', wx);

    // 9. Exit `refuse` naming a missing script falls back to lockedText.
    const rf = await g.hw(async (H) => {
      const HW = H.HW;
      await H.teleport('test', 'hall_east');
      const exit = HW.map.exits.find((e) => e.to === 'test2' && e.fade !== false);
      Object.assign(exit, { lock: () => true, refuse: 'test.no_such_refusal', lockedText: '[n] I2 refusal fallback.' });
      HW.input.setVirtual('right', true);
      await H.steps(80);
      HW.input.setVirtual('right', false);
      await H.idle();
      const r = { map: HW.map.id, text: H.transcript.slice(-3).map((e) => e.text).join(' | ') };
      delete exit.lock; delete exit.refuse; delete exit.lockedText;
      return r;
    });
    T.ok(rf.map === 'test' && /I2 refusal fallback/.test(rf.text), 'exit refuse script missing → lockedText', rf);

    // 10. Map light `cond`: off (whatever its group) while it fails; on after refresh once it holds.
    const lc = await g.hw(async (H) => {
      const HW = H.HW;
      await H.teleport('test', 'start');
      const map = HW.map;
      map.data.lights.push({ type: 'bulb', x: 22, y: 15, group: 'i2grp', cond: (st) => !!st.flags.i2_light });
      map._invalidateLights();
      await H.steps(2);
      const find = () => HW.lighting._mapLights.find((l) => l.id === `${map.id}_light_${map.data.lights.length - 1}`);
      const r = { def: map.lightDefs.find((d) => d.group === 'i2grp')?.condOff };
      HW.lighting.setGroup('i2grp', true);
      r.offWithGroup = HW.lighting._effectiveOn(find());
      H.setFlag('i2_light', true); H.refresh();
      await H.steps(2);
      r.on = HW.lighting._effectiveOn(find());
      H.setFlag('i2_light', false); H.refresh();
      await H.steps(2);
      r.offAgain = HW.lighting._effectiveOn(find());
      map.data.lights.pop();
      HW.lighting.setGroup('i2grp', null);
      delete HW.state.flags.i2_light;
      map._invalidateLights();
      return r;
    });
    T.ok(lc.def === true && lc.offWithGroup === false && lc.on === true && lc.offAgain === false, 'map light cond: off while failing (group or not), on after refresh', lc);

    // 11. Reachability modes on a lock-gated door (test_door_c: item:keyring).
    const rc = await g.hw((H) => {
      const HW = H.HW;
      const had = HW.state.inv.keyring;
      delete HW.state.inv.keyring;
      HW.game.setProp('test_door_c', 'locked');
      const r = { live: H.pathExists('test', 'door_c', 'in_c'), locks: H.pathExists('test', 'door_c', 'in_c', { doors: 'locks' }), all: H.pathExists('test', 'door_c', 'in_c', { doors: 'all' }), none: H.pathExists('test', 'door_c', 'in_c', { doors: false }) };
      if (had) HW.state.inv.keyring = had;
      return r;
    });
    T.ok(!rc.live && rc.locks && rc.all && !rc.none, "map.reachable doors: true (live) / 'locks' / 'all' / false", rc);

    // 11b. Data-driven prop state: `stateWhen` re-evaluated on refresh until a script persists a state.
    const sw = await g.hw((H) => {
      const HW = H.HW;
      const p = HW.map.prop('test_desk_student_3_6');
      p.inst.stateWhen = [{ cond: (st) => !!st.flags.i2_state, state: 'outline' }];
      const r = { s0: p.state };
      H.setFlag('i2_state', true); H.refresh(); r.s1 = HW.map.prop('test_desk_student_3_6').state;
      H.setFlag('i2_state', false); H.refresh(); r.s2 = HW.map.prop('test_desk_student_3_6').state;
      HW.game.setProp('test_desk_student_3_6', 'scattered');
      H.setFlag('i2_state', true); H.refresh(); r.s3 = HW.map.prop('test_desk_student_3_6').state;
      delete p.inst.stateWhen; delete HW.state.flags.i2_state;
      delete HW.state.mapState.test.test_desk_student_3_6;
      HW.map.setPropState('test_desk_student_3_6', 'default', null, { persist: false });
      return r;
    });
    T.eq([sw.s0, sw.s1, sw.s2, sw.s3], ['default', 'outline', 'default', 'scattered'], 'prop stateWhen: data state follows flags on refresh; a persisted state wins');

    // 12. Art additions build (catalog states + params).
    const art = await g.hw((H) => {
      const A = H.HW.art;
      const ok = (r) => !!(r && r.canvas && r.canvas.width > 1);
      const a = A.prop('desk_student', { state: 'outline' });
      const b = A.prop('banner', { state: 'hallpass', params: { text: 'HALL PASS REQUIRED BEYOND THIS POINT' } });
      const b2 = A.prop('banner', { state: 'hallpass', params: { text: 'NO RUNNING' } });
      const c = A.prop('poster', { state: 'navy' });
      const d = A.prop('graffiti', { state: 'chalk', params: { text: 'KR WAS HERE' } });
      const e = A.prop('husk_kneeling', { state: 'nopen', dir: 'down' });
      const e0 = A.prop('husk_kneeling', { state: 'default', dir: 'down' });
      const kev = A.sprite('kevin').anims.beltoff_down;
      const c1 = document.createElement('canvas'); c1.width = 32; c1.height = 32;
      A.drawTile(c1.getContext('2d'), 'drop', 0, 0, { mask: 15 }); A.drawTile(c1.getContext('2d'), 'railing_wood', 16, 0, { mask: 10 });
      return { all: [a, b, c, d, e].every(ok), textKeyed: b !== b2, pen: e !== e0, kev: kev ? { n: kev.frames.length, loop: kev.loop } : null };
    });
    T.ok(art.all && art.textKeyed && art.pen, 'art: desk outline, hallpass sign (text-keyed), navy poster, chalk graffiti, husk without pen', art);
    T.ok(art.kev && art.kev.n >= 3 && art.kev.loop === false, "art: Kevin 'beltoff_down' (non-looping)", art.kev);
  });

  await T.step('final QA fixes (engine, saves, input, screens)', async () => {
    await g.teleport('test', 'start');
    await g.idle();
    // tech-02 / tech-09: no manual save or engine autosave while a period is up (warning, bell,
    // dismissal) or a chase set piece runs; the Ch8 escape still checkpoints.
    const gate = await g.hw((H) => {
      const HW = H.HW;
      const P = HW.periods;
      const C = HW.chase;
      const out = {};
      const probe = (k) => { out[k] = [HW.game.canSave(), HW.game.canCheckpoint()]; };
      probe('idle');
      for (const phase of ['warning', 'active', 'dismissal']) {
        HW.periods = { phase, active: phase === 'active' };
        probe(phase);
      }
      HW.periods = P;
      HW.chase = { active: true, kind: 'gym' }; probe('gym');
      HW.chase = { active: true, kind: 'escape' }; probe('escape');
      HW.chase = C;
      return out;
    });
    T.eq(gate.idle, [true, true], 'free play: save + checkpoint allowed');
    T.ok(['warning', 'active', 'dismissal'].every((k) => gate[k][0] === false && gate[k][1] === false), 'period warning / bell / dismissal: no save, no transfer autosave', gate);
    T.eq(gate.gym, [false, false], 'gym chase (he may be scripted between lunges): no save, no autosave');
    T.eq(gate.escape, [false, true], 'Ch8 escape: no manual save; its own checkpoints still write');

    // ld-05: a direction held through a transfer that lands her facing another way stays dead until
    // released; the arrival direction (a corridor) keeps walking.
    const stale = await g.hw(async (H) => {
      const HW = H.HW;
      HW.input.setVirtual('up', true);
      await H.steps(2);
      await HW.game.transfer('test2', 'start2', { fade: false });
      const p0 = { x: HW.player.x, y: HW.player.y, dir: HW.player.dir };
      await H.steps(30);
      const held = { dy: HW.player.y - p0.y, down: HW.input.down('up') };
      HW.input.setVirtual('up', false);
      await H.steps(2);
      HW.input.setVirtual('up', true);
      await H.steps(20);
      const again = HW.player.y - p0.y;
      HW.input.setVirtual('up', false);
      await H.steps(2);
      await H.teleport('test', [40, 14]);
      HW.input.setVirtual('right', true);
      await H.steps(2);
      await HW.game.transfer('test2', 'from_test', { fade: false });
      const p1 = HW.player.x;
      await H.steps(20);
      const kept = HW.player.x - p1;
      HW.input.setVirtual('right', false);
      await H.steps(2);
      return { arrive: p0.dir, held, again, kept };
    });
    T.ok(stale.arrive === 'down' && stale.held.dy === 0 && !stale.held.down, 'Up held across a transfer that arrives facing down does nothing', stale);
    T.ok(stale.again < -10, 'released and pressed again, Up walks', stale);
    T.ok(stale.kept > 10, 'the arrival direction keeps walking (corridor exits)', stale);
    const unit = await g.hw(async (H) => {
      const I = H.HW.input;
      I.setVirtual('left', true); await H.steps(2);
      I.staleHeld('right');
      await H.steps(2);
      const dead = I.down('left');
      I.clear(); await H.steps(1);
      I.setVirtual('left', true); await H.steps(2);
      const live = I.down('left');
      I.setVirtual('left', false); await H.steps(1);
      return { dead, live };
    });
    T.ok(!unit.dead && unit.live, 'input.staleHeld(keep) / clear()', unit);

    // tech-21: map-exit autosaves are labelled by where they land (assist counts per place).
    await g.teleport('test', [44, 14]);
    T.ok(await g.walkTo([46, 14]), 'walk into the east exit');
    await g.idle();
    T.eq((await g.state()).checkpoint, 'transfer test2 from_test', "transfer checkpoint label names the map and anchor");

    // tech-08: the sketchbook page is in Notes from the start; older saves get it too.
    const notes = await g.hw(async (H) => {
      const HW = H.HW;
      const fresh = Object.keys(HW.state.docs);
      const keep = JSON.parse(JSON.stringify(HW.state));
      HW.game.save('3');
      const raw = JSON.parse(localStorage.getItem('hallowell.save.3'));
      raw.state.docs = { plaque: true }; // a save from before the page existed
      localStorage.setItem('hallowell.save.3', JSON.stringify(raw));
      HW.game.loadSave('3');
      const old = Object.keys(HW.state.docs);
      localStorage.removeItem('hallowell.save.3');
      HW.state.docs = keep.docs;
      return { fresh, old };
    });
    T.ok(notes.fresh.includes('tess_draft'), "a new game's Notes hold 'How to Tell Leah (draft 6)'", notes);
    T.eq(notes.old, ['tess_draft', 'plaque'], 'older saves get it too (first in Notes)');

    // ld-08: during a period a tap of Confirm while seated does not stand her up (movement does).
    await g.teleport('test', 'desk_a');
    await g.face('up');
    await g.interact();
    const seat = await g.hw(async (H) => {
      const HW = H.HW;
      const sat = !!HW.player.seated;
      const saved = HW.periods;
      HW.periods = { active: true, phase: 'active' };
      HW.input.tap('confirm'); await H.steps(4);
      const afterTap = !!HW.player.seated;
      HW.periods = saved;
      await H.press('down', 120); await H.steps(4);
      return { sat, afterTap, afterMove: !!HW.player.seated };
    });
    T.ok(seat.sat && seat.afterTap && !seat.afterMove, 'period: a Confirm tap keeps her seated; a direction stands her', seat);

    // tech-11: a save naming a map this build lacks is refused with the game untouched; an empty
    // state lands on the map start, a position in a wall on the nearest floor.
    const bad = await g.hw(async (H) => {
      const HW = H.HW;
      const key = (k) => `hallowell.save.${k}`;
      const put = (k, state) => localStorage.setItem(key(k), JSON.stringify({ v: 1, summary: { chapter: 0 }, state }));
      const keep = JSON.parse(JSON.stringify(HW.state));
      const before = { map: HW.map.id, x: HW.player.x };
      put('3', { ...keep, map: 'nonexistent_map' });
      const r1 = HW.game.loadSave('3');
      const after1 = { ok: r1, err: HW.game.loadError, map: HW.map?.id, player: !!HW.player, x: HW.player?.x, mode: HW.game.mode };
      put('3', { ...keep, map: 'test', px: undefined, py: undefined }); // no position at all
      const r2 = HW.game.loadSave('3');
      await H.steps(2);
      const p2 = H.player();
      const start = HW.map.anchor('start');
      put('3', { ...keep, map: 'test', px: 5 * 16 + 8, py: 2 * 16 + 12 }); // inside Room A's north wall
      const r3 = HW.game.loadSave('3');
      await H.steps(2);
      const p3 = H.player();
      localStorage.removeItem(key('3'));
      return { before, after1, r2, p2, start: [start.tx, start.ty], r3, p3, solid3: HW.map.isSolid(p3.tx, p3.ty) };
    });
    T.ok(!bad.after1.ok && bad.after1.err === 'map' && bad.after1.map === bad.before.map && bad.after1.player && bad.after1.x === bad.before.x && bad.after1.mode === 'play', 'unknown-map save refused; the running game is untouched', bad.after1);
    T.ok(bad.r2 && bad.p2.tx === bad.start[0] && bad.p2.ty === bad.start[1], 'a save without a position → the map start (not (0,0) in a wall)', bad);
    T.ok(bad.r3 && !bad.solid3 && Math.max(Math.abs(bad.p3.tx - 5), Math.abs(bad.p3.ty - 2)) <= 4, 'a saved spot inside a wall moves to the nearest open tile', bad.p3);
    await g.teleport('test', 'start');

    // tech-10: the save toast knows when storage only kept it in memory.
    const mem = await g.hw((H) => {
      const HW = H.HW;
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new DOMException('blocked', 'SecurityError'); };
      HW.game.save('2');
      const blocked = HW.game.lastSavePersisted;
      Storage.prototype.setItem = orig;
      HW.game.save('2');
      return { blocked, ok: HW.game.lastSavePersisted, storage: !!HW.storage, persistent: HW.storage?.persistent };
    });
    T.ok(mem.blocked === false && mem.ok === true && mem.storage && mem.persistent === true, 'game.lastSavePersisted / HW.storage.persistent', mem);

    // tech-15: fullscreen is live state — never restored from storage.
    const fs = await g.hw((H) => {
      const S = H.HW.settings;
      localStorage.setItem('hallowell.settings', JSON.stringify({ ...S.values, fullscreen: true, pixelPerfect: true }));
      const oldFmt = { ...S.load() };
      localStorage.setItem('hallowell.settings', JSON.stringify({ ...S.values, pixelPerfect: true, v: 2 }));
      const newFmt = { ...S.load() };
      S.reset();
      return { fs: oldFmt.fullscreen, ppOld: oldFmt.pixelPerfect, ppNew: newFmt.pixelPerfect, live: H.HW.display.fullscreen, after: S.values.fullscreen };
    });
    T.ok(fs.fs === fs.live, 'settings.fullscreen mirrors the live state, never a stored value (no gesture at boot)', fs);
    T.ok(fs.ppOld === false && fs.ppNew === true, 'old settings drop pixelPerfect (new fill default); v2 settings keep it', fs);

    // tech-17: Esc in a cutscene opens the reduced pause and freezes the scene; leaving the window pauses.
    const cut = await g.hw(async (H) => {
      const HW = H.HW;
      H.autoAdvance(false);
      let done = false;
      HW.scripts.runFn(async (gg) => { await gg.wait(1.5); done = true; }, {}, { id: 'test:cutpause' });
      await H.steps(3);
      const m0 = HW.game.mode;
      HW.input.tap('pause'); await H.steps(3);
      const pause = HW.ui.get?.('pause');
      const r = { m0, m1: HW.game.mode, cut: !!pause?.args?.cutscene, items: pause ? pause.items.map((i) => i.id) : null };
      await H.steps(150);
      r.doneWhilePaused = done;
      HW.input.tap('cancel'); await H.steps(20);
      r.m2 = HW.game.mode;
      await HW.game.until(() => done, 5);
      r.done = done;
      await H.idle();
      window.dispatchEvent(new Event('blur'));
      await H.steps(2);
      r.blur = HW.game.mode;
      r.blurPause = !!HW.ui.get?.('pause')?.args?.auto;
      HW.input.tap('cancel'); await H.steps(20);
      r.m3 = HW.game.mode;
      H.autoAdvance(true);
      return r;
    });
    T.ok(cut.m0 === 'cutscene' && cut.m1 === 'menu' && cut.cut, 'Esc during a cutscene opens the pause menu', cut);
    T.eq(cut.items, ['resume', 'settings', 'load', 'quit'], 'cutscene pause: Resume / Settings / Load / Quit to Title');
    T.ok(!cut.doneWhilePaused && cut.m2 === 'cutscene' && cut.done, 'the cutscene is frozen while paused and resumes after', cut);
    T.ok(cut.blur === 'menu' && cut.blurPause && cut.m3 === 'play', 'losing window focus in free play opens the pause menu', cut);

    // tech-05: back to the title, every sound of the last game stops ('title' event).
    const title = await g.hw(async (H) => {
      const HW = H.HW;
      let stopped = null;
      let ev = 0;
      let mode = null;
      const orig = HW.audio.stopAll;
      HW.audio.stopAll = (f) => { stopped = f; return orig.call(HW.audio, f); };
      const off = HW.game.on('title', () => { ev++; mode = HW.game.mode; });
      HW.game.toTitle();
      await H.steps(3);
      HW.audio.stopAll = orig;
      off();
      const r = { stopped, ev, mode };
      H.autoAdvance(true);
      await H.newGame({ skipIntro: true });
      await H.teleport('test', 'start');
      return r;
    });
    T.ok(title.stopped > 0 && title.ev === 1 && title.mode === 'title', 'toTitle stops all audio and emits title', title);

    // ld-12 / horror-17: the referral slip takes a press from 0.5 s (skips to the stamp), the next
    // press picks; a repeat death at the same checkpoint opens already stamped.
    const slip = await g.hw(async (H) => {
      const HW = H.HW;
      H.autoAdvance(false);
      const t0 = performance.now();
      const p = HW.ui.open('gameover', { reason: 'out_of_seat' });
      await H.steps(40);
      const s = HW.ui.get('gameover');
      HW.input.tap('confirm'); await H.steps(2);
      const skipped = { t: s.t, stamped: s.stamped };
      await H.steps(12);
      HW.input.tap('confirm');
      const res = await Promise.race([p, new Promise((r) => setTimeout(() => r('timeout'), 3000))]);
      const sec = (performance.now() - t0) / 1000;
      HW.state.flags[HW.game._deathKey(HW.state.checkpoint)] = 1;
      const p2 = HW.ui.open('gameover', { reason: 'out_of_seat' });
      await H.steps(14);
      const s2 = HW.ui.get('gameover');
      const rep = { stamped: s2.stamped, t: s2.t };
      await H.steps(20);
      HW.input.tap('confirm');
      const res2 = await Promise.race([p2, new Promise((r) => setTimeout(() => r('timeout'), 3000))]);
      delete HW.state.flags[HW.game._deathKey(HW.state.checkpoint)];
      H.autoAdvance(true);
      return { skipped, res, sec, rep, res2 };
    });
    T.ok(slip.skipped.stamped && slip.res === 'retry', 'game over: a press skips to the stamp, the next retries', slip);
    T.ok(slip.rep.stamped && slip.res2 === 'retry', 'repeat death at a checkpoint: the slip opens stamped (menu in ~0.4 s)', slip.rep);
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
