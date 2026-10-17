// TEST SCRIPTS — used by the engine test maps (src/data/maps/test*.js) and tests/engine.mjs.
// They double as worked examples of the script API (TECH §6.1).
export default {
  /** test map onEnter (non-blocking): unlock the compact so the past view can be tried. */
  'test.onEnter': async (g) => {
    g.set('compact_unlocked');
    if (!g.state.objective) g.objective('Test every corner of the engine.');
  },

  /** Hall trigger (once): dialogue, an NPC walking in with A*, camera pans, a choice, party join. */
  'test.hall_trigger': async (g) => {
    g.inc('test_trigger_count');
    await g.narrate('The hall goes very quiet.');
    g.spawn({ id: 'danny', at: [44, 15], dir: 'left' });
    await g.cam('danny', { time: 0.8 });
    await g.say('danny', 'grin', 'Dolan! Over here. *Look* at this hallway.');
    await g.walk('danny', 'danny_spot');
    await g.cam(null, { time: 0.6 });
    g.face('danny', 'tess');
    g.face('tess', 'danny');
    const c = await g.choice([
      'Get over here, Kovach.',
      'Stay there.',
      { text: '(an option you should never see)', cond: (s) => !!s.flags.never },
    ]);
    g.set('test_choice', c);
    if (c === 0) {
      await g.say('danny', 'talk', "Yes ma'am.");
      g.party.add('danny');
    } else {
      await g.say('danny', 'smug', 'Suit yourself. I like it here.');
    }
    await g.think('worried', 'Something about this hall feels *rehearsed*.');
  },

  /** Script prop with banter from whoever is in the party. */
  'test.teacher_desk': async (g) => {
    await g.examine([
      "[n] A steel teacher's desk. The green lamp on it is still on.",
      '[curious] Who leaves a lamp on for seventeen years?',
    ]);
    await g.banter({
      danny: '[grin] Free lamp. Dibs.',
      leah: "[deadpan] Don't touch anything. I'm serious.",
      marcus: '[thoughtful] Somebody paid the electric bill.',
    });
  },

  /** Card catalog (script prop on test2): gives an item once. */
  'test.catalog': async (g) => {
    if (g.flag('test_catalog')) {
      await g.think('neutral', 'Already checked HA–HE.');
      return;
    }
    g.sfx('paper_rustle');
    await g.narrate('Drawer HA–HE sticks, then gives. Something small and brass rolls forward.');
    g.give('case_key');
    g.set('test_catalog');
  },

  /** Repeatable, non-blocking trigger on test2. */
  'test.t2_trigger': async (g) => {
    g.inc('t2_count');
  },

  /** Talkable NPC example: spawn({ ..., script: 'test.npc_talk' }). */
  'test.npc_talk': async (g, ctx) => {
    const who = ctx.npc?.id || 'danny';
    await g.say(who, 'talk', 'You talk to me, I talk back. That is how this works.');
  },

  'test.sub': async (g, ctx) => {
    g.set('gapi_sub', ctx?.n ?? true);
  },

  /**
   * Exercise the whole `g` API without player input (tests/engine.mjs). Each step sets a
   * `gapi_*` flag so a failure points at the method that broke.
   */
  'test.gapi': async (g) => {
    const ok = (k) => g.set(`gapi_${k}`);

    // Dialogue & UI
    await g.say('tess', 'neutral', 'Testing. One, two.');
    await g.say('voice', null, 'Attendance will now be taken.');
    await g.think('curious', 'Is this thing on?');
    await g.narrate('It is.');
    await g.examine(['[n] A tagged narration line.', '[danny:grin] A tagged spoken line.', 'Untagged thought.']);
    g.set('gapi_choice', await g.choice(['A', { text: 'hidden', cond: () => false }, 'C']));
    await g.doc('sample_note');
    g.toast('A toast.');
    g.objective('Finish the API test.');
    await g.card('TEST', 'a title card', { hold: 0.2 });
    g.prompt(null, null);
    await g.cg(null);
    g.overlay('black', { alpha: 0.4 });
    g.overlay('black', null);
    ok('dialogue');

    // State & inventory
    g.set('gapi_flag', 7);
    g.inc('gapi_count');
    g.inc('gapi_count', 2);
    g.give('battery', 3, { silent: true });
    g.take('battery', 1);
    if (g.has('battery', 2) && !g.has('battery', 99)) ok('items');
    g.set('roll1_answered');
    g.set('bond_leah');

    // Chapter (card + chapterSetup + checkpoint) — also reveals the chapter-gated backpack.
    await g.chapter(1);
    if (g.prop('test_backpack')) ok('chapter_refresh');

    // Entities
    const leah = g.spawn({ id: 'leah', at: [20, 14], dir: 'down', script: 'test.npc_talk' });
    g.face('leah', 'left');
    await g.anim('leah', 'idle_left', { once: true });
    g.anim('leah', null);
    if (await g.walk('leah', [24, 15])) ok('walk');
    await g.walk('leah', ['start', [22, 14]]);
    g.setPos('leah', [22, 15]);
    if (leah === g.npc('leah') && leah.x === 22 * 16 + 8) ok('setPos');
    g.party.add('leah');
    if (g.party.has('leah')) ok('party_add');
    await g.wait(0.2);
    g.party.remove('leah');
    if (!g.party.has('leah')) ok('party_remove');
    g.despawn('leah');
    if (!g.npc('leah')) ok('despawn');

    // Camera & effects
    await g.cam('in_b', { time: 0.3 });
    await g.cam([40, 14], { time: 0.2 });
    await g.cam(null, { time: 0.2 });
    ok('cam');
    await g.fade('out', 0.2);
    await g.fade('in', 0.2);
    g.flash('#ffffff', 0.1);
    g.shake(2, 0.2);
    g.fx('emit', 'dust', 300, 200, 3);
    ok('fx');
    g.lights('period', true);
    g.lights('period', false);
    g.lightning();
    g.flashlight(true);
    g.flashlight('restore');
    ok('lights');

    // Audio
    g.sfx('ui_confirm');
    const h = g.loop('drip', { x: 100, y: 100 });
    h.stop();
    await g.ambience('hall');
    await g.music(null);
    g.silence(false);
    ok('audio');

    // Props (current map, another map, removal) and refresh
    g.setProp('test_door_19_12', 'open');
    if (g.prop('test_door_19_12')?.state === 'open') ok('setProp');
    g.setProp('test2_door_10_10', 'open');
    if (g.state.mapState.test2?.test2_door_10_10?.state === 'open') ok('setProp_remote');
    g.removeProp('test_glass');
    if (!g.prop('test_glass')?.present) ok('removeProp');
    g.refresh();

    // Flow
    await g.parallel(async (p) => {
      await p.wait(0.05);
      p.set('gapi_parallel');
    });
    await g.run('test.sub', { n: 2 });
    void g.periods;
    void g.colonel;

    // Transfers (fade and instant)
    await g.transfer('test2', 'start2');
    if (g.state.map === 'test2') ok('transfer');
    await g.transfer('test', 'start', { fade: false });
    g.checkpoint('gapi');
    ok('done');
  },
};
