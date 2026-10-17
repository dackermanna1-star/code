// Game-systems tests (src/game/*: periods, colonel_ai, noise, patrol, basement, longhall, assembly, chase,
// breaker) on the AI test map (src/data/maps/test_ai.js), through window.__HW.
//   node tests/systems.mjs [--built]     (exit code 1 on failure; screenshots → $HW_SHOTS)
// Story scripts the systems call (ch3.stir1, ch5.longhall_loop, ch7.roll3, …) are stubbed in-page with
// recording versions so the hooks can be verified before the narrative files exist.
import { launch, openGame, suite, SHOTS } from './lib.mjs';

const built = process.argv.includes('--built');
const T = suite(`systems (${built ? 'built' : 'dev'})`);
const browser = await launch();
let g;

/** Page-side helpers (installed once; each test step reaches them through window.__T). */
function installHelpers() {
  const H = window.__HW;
  const HW = H.HW;
  const T = {
    gameOvers: [],
    calls: [],
    async fresh(ch = 5) {
      H.autoAdvance(true);
      H.god(false);
      H.timeScale(1);
      await H.newGame({ skipIntro: true });
      await H.teleport('test_ai', 'start');
      HW.state.chapter = ch;
      HW.state.assist = 1;
      HW.periods.disable();
      T.calls.length = 0;
      T.gameOvers.length = 0;
      HW.colonel.log.length = 0;
      await H.steps(2);
    },
    until(pred, sec = 30) { return HW.game.until(pred, sec); },
    place(tx, ty, dir = 'down') {
      const p = HW.player;
      p.resetTransient();
      p.x = tx * 16 + 8;
      p.y = ty * 16 + 12;
      p.face(dir);
      HW.entities.onPlayerMoved();
      HW.camera.snap();
    },
    async sit(id) {
      await HW.hiding.sit(HW.map.prop(id));
      await H.steps(45); // still after 0.5 s
    },
    /** A period with the Colonel; resolves once he has emerged and is patrolling. */
    async periodWithColonel(length = 60) {
      await HW.periods.start({ length, warning: false });
      return T.until(() => HW.colonel.mode === 'patrol' && HW.colonel.entity && !HW.colonel.entity.animOnce, 12);
    },
    /** Stub a story script with a recorder. */
    stub(id, fn) {
      HW.data.scripts[id] = async (g, ctx) => {
        T.calls.push({ id, ctx: { loop: ctx?.loop, row: ctx?.row, stir: ctx?.stir }, t: HW.time });
        if (fn) await fn(g, ctx);
      };
    },
    count(id) { return T.calls.filter((c) => c.id === id).length; },
    tile(v) { return Math.floor(v / 16); },
  };
  HW.game.on('gameOver', (reason) => T.gameOvers.push({ reason, t: HW.time }));
  window.__T = T;
}

try {
  g = await openGame(browser, { built });
  await g.page.evaluate(installHelpers);

  await T.step('services', async () => {
    const r = await g.hw(async (H) => {
      await window.__T.fresh();
      const HW = H.HW;
      const names = ['noise', 'periods', 'colonel', 'patrol', 'basement', 'longhall', 'assembly', 'chase', 'breaker', 'weather', 'ambient'];
      return {
        services: names.filter((n) => HW[n] && HW.game.systems.includes(HW[n])),
        api: ['enable', 'disable', 'start', 'end', 'clockTime', 'onStart', 'onEnd'].filter((k) => typeof HW.periods[k] === 'function'),
        colonelApi: ['spawn', 'despawn', 'walkTo', 'anim', 'face', 'peekInto', 'lunge', 'setMode', 'chase', 'escape', 'sleep', 'rise', 'assembly'].filter((k) => typeof HW.colonel[k] === 'function'),
        chapterSetup: typeof HW.game.chapterSetup === 'function',
        map: H.map(),
      };
    });
    T.eq(r.services.length, 11, 'all eleven systems registered and exposed on HW (incl. weather, ambient)');
    T.eq(r.api.length, 7, 'HW.periods API');
    T.eq(r.colonelApi.length, 13, 'HW.colonel API');
    T.ok(r.chapterSetup && r.map === 'test_ai', 'chapterSetup installed; AI test map loads');
  });

  await T.step('free periods: guard, warning, bell, lights, spawn, length, dismissal', async () => {
    const r = await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh();
      const ev = {};
      const offs = [
        HW.game.on('periodWarning', (o) => { ev.warn = HW.time; ev.reason = o.reason; }),
        HW.game.on('periodStart', () => {
          ev.bell = HW.time;
          ev.lights = HW.lighting.groupOn('period');
          ev.computer = HW.map.prop('ai_computer').state;
        }),
        HW.game.on('periodEnd', () => { ev.end = HW.time; ev.clockAfter = HW.periods.clockTime(); }),
      ];
      HW.colonel.on('spawn', (e) => {
        if (ev.spawn) return;
        const p = HW.player;
        const v = HW.camera.view;
        ev.spawn = { d: Math.hypot(e.x - p.x, e.y - p.y) / 16, onScreen: e.x > v.x && e.x < v.x + v.w && e.y > v.y && e.y < v.y + v.h };
      });
      HW.game.loadMap('test_ai', [8, 25], { dir: 'up' }); // the storage room: off the patrol, door shut
      const loadT = HW.time;
      HW.periods.enable({ maps: ['test_ai'], passing: 3, length: 20, max: 2 });
      ev.persisted = JSON.stringify(HW.state.periodsCfg?.maps);
      ev.clockPass0 = HW.periods.clockTime();
      H.timeScale(8);
      await T.until(() => ev.warn, 60);
      ev.clockWarn = HW.periods.clockTime();
      await T.until(() => ev.bell, 20);
      await H.steps(30);
      ev.clockPeriod = HW.periods.clockTime();
      ev.active = HW.periods.active;
      ev.clockProp = HW.map.prop('ai_clock_w').dparams.time;
      await T.until(() => ev.end, 40);
      ev.lightsAfter = HW.lighting.groupOn('period');
      ev.computerAfter = HW.map.prop('ai_computer').state;
      ev.count = HW.periods.count;
      ev.flagCount = HW.state.flags.periods_ch5;
      ev.colonelAfter = HW.colonel.mode;
      H.timeScale(1);
      offs.forEach((f) => f());
      ev.loadT = loadT;
      ev.gameOvers = T.gameOvers.length;
      return ev;
    });
    T.eq(r.persisted, '["test_ai"]', 'enable() persists the config in HW.state.periodsCfg');
    T.ok(Math.abs(r.clockPass0 - (1 + 40 / 60)) < 1e-6, 'hall clock reads 1:40 at the start of passing time', r.clockPass0);
    T.ok(r.warn - r.loadT >= 20 - 0.05, 'no warning within 20 s of a map load (passing time was only 3 s)', r.warn - r.loadT);
    T.eq(r.reason, 'auto', 'free warning comes from the schedule');
    T.ok(Math.abs(r.bell - r.warn - 10) < 0.1, 'the bell rings 10 s after the chime', r.bell - r.warn);
    T.ok(r.lights === true && r.computer === 'on', 'bell → period lights on, computers on', r);
    T.ok(r.clockWarn >= 1 + 44 / 60 - 1e-6 && r.clockWarn <= 1 + 45 / 60 + 1e-6, 'clock near 1:45 at the warning', r.clockWarn);
    T.ok(r.active && r.clockPeriod > 1 + 45 / 60 && r.clockPeriod < 1 + 46 / 60 && Math.abs(r.clockProp - r.clockPeriod) < 0.01, 'during the period the hall clocks run 1:45 → 1:46 (prop params driven)', r);
    T.ok(r.spawn && r.spawn.d >= 12 && !r.spawn.onScreen, 'the Colonel emerges at a fold ≥ 12 tiles away, out of view', r.spawn);
    T.ok(Math.abs(r.end - r.bell - 20 - 1.3) < 0.2, 'period runs its length (20 s) then dismissal (lights die 1.3 s after the bell)', r.end - r.bell);
    T.ok(r.lightsAfter === false && r.computerAfter === 'off' && Math.abs(r.clockAfter - (1 + 40 / 60)) < 1e-6, 'after dismissal: lights off, computers off, clocks snap back to 1:40', r);
    T.ok(r.count === 1 && r.flagCount === 1, 'free periods are counted per chapter (persisted flag)', r);
    T.eq(r.colonelAfter, 'off', 'he sank back into the walls');
    T.eq(r.gameOvers, 0, 'nobody caught (Tess was out of the halls)');
  });

  await T.step('followers sit on the warning; they stand up at dismissal', async () => {
    const r = await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh();
      await H.teleport('test_ai', 'in_b');
      HW.state.party = ['danny'];
      HW.entities.syncParty();
      await H.steps(5);
      const danny = HW.entities.get('danny');
      HW.periods.start({ length: 4, colonel: false });
      H.timeScale(4);
      await T.until(() => danny.seat, 10);
      const seat = danny.seat;
      const nearest = HW.hiding.nearestSeat(HW.player.x, HW.player.y, { room: 'ai_b' });
      const r = {
        seated: !!seat, room: seat && HW.map.roomAt((seat.x + 0.5) * 16, (seat.y + 0.5) * 16)?.id, warning: HW.periods.warning,
        notNearest: !!seat && seat !== nearest,
      };
      await T.until(() => HW.periods.phase === 'idle', 30);
      await H.steps(3);
      r.after = !!danny.seat;
      H.timeScale(1);
      return r;
    });
    T.ok(r.seated && r.room === 'ai_b' && r.warning, 'Danny walked to a free seat in Tess\'s room during the warning', r);
    T.ok(r.notNearest, 'the seat nearest Tess is left for her');
    T.eq(r.after, false, 'followers stand up after dismissal');
  });

  await T.step('seated + still Tess: peeked, close pass, never seen; attendance ends the period early', async () => {
    const r = await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh(5);
      await H.teleport('test_ai', 'below_desk_a');
      await T.sit('test_ai_desk_student_10_9');
      H.timeScale(6);
      let maxDet = 0;
      let peekAt = null;
      let endAt = null;
      let warpSeen = 0;
      let peekWarp = 0;
      const offs = [
        HW.colonel.on('peek', (e) => { if (e.info.startsWith('ai_a') && peekAt === null) peekAt = HW.time; }),
        HW.game.on('periodEnd', () => { endAt = HW.time; }),
      ];
      const startT = HW.time;
      await HW.periods.start({ length: 60, warning: false });
      // Hold Confirm: eyes shut → ×4 time while he isn't peeking (DESIGN §4.1).
      HW.input.setVirtual('confirm', true);
      await T.until(() => {
        maxDet = Math.max(maxDet, HW.colonel.detection);
        if (HW.game.timeWarp === 4) warpSeen++;
        if (HW.game.timeWarp === 4 && HW.colonel.peeking) peekWarp++;
        return endAt !== null || T.gameOvers.length > 0;
      }, 75);
      HW.input.setVirtual('confirm', false);
      offs.forEach((f) => f());
      H.timeScale(1);
      const log = HW.colonel.log.map((e) => e.ev + (e.info ? `:${e.info}` : ''));
      return { maxDet, peekAt, endAt, startT, warpSeen, peekWarp, log, caught: T.gameOvers.length, seated: !!HW.player.seated, peeks: log.filter((l) => l.startsWith('peek')) };
    });
    T.ok(r.peeks.some((p) => p === 'peek:ai_a:step'), 'Ch5 peek: he stepped into Room A and dragged along a row', r.peeks);
    T.ok(r.log.includes('closePass'), 'close pass beside the seated Tess', r.log);
    T.eq(r.maxDet, 0, 'seated + still = invisible (detection never rose)');
    T.eq(r.caught, 0, 'not caught (god mode off)');
    T.ok(r.endAt !== null && r.endAt - r.startT < 60, 'the period ended early (attendance taken in her room)', r.endAt - r.startT);
    T.ok(r.peekAt !== null && Math.abs(r.endAt - r.peekAt - 11.3) < 0.3, 'dismissal bell 10 s after the peek (+1.3 s for the lights)', r.peekAt !== null && r.endAt - r.peekAt);
    T.ok(r.warpSeen > 0, 'holding Confirm while seated in a period runs time ×4');
    T.ok(r.peekWarp <= 1, 'peeks play at normal speed', r.peekWarp);
  });

  await T.step('guided period (Ch3): the bell waits for Tess to sit; the peek is only a shadow at the door', async () => {
    const r = await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh(3);
      await H.teleport('test_ai', 'below_desk_a');
      const t0 = HW.time;
      HW.periods.start({ guided: true, length: 40 });
      H.timeScale(4);
      await H.steps(60 * 13);
      const r = { held: HW.periods.phase };
      await T.sit('test_ai_desk_student_10_9');
      await T.until(() => HW.periods.active, 5);
      r.rang = HW.periods.active;
      await T.until(() => HW.colonel.log.some((e) => e.ev === 'peek'), 60);
      r.peek = HW.colonel.log.find((e) => e.ev === 'peek')?.info;
      r.door = HW.map.prop('test_ai_door_8_14')?.state;
      r.doorOpened = H.transcript.some((e) => e.time >= t0 && e.type === 'door' && e.text === 'test_ai_door_8_14:open');
      await HW.periods.end();
      H.timeScale(1);
      r.caught = T.gameOvers.length;
      return r;
    });
    T.eq(r.held, 'warning', 'past the 10 s countdown the bell is held while Tess stands');
    T.ok(r.rang, 'she sits → the bell');
    T.ok(r.peek === 'ai_a:shadow' && r.door === 'closed' && !r.doorOpened, 'Ch3 escalation: a shadow crosses the door window; the door stays shut', r);
    T.eq(r.caught, 0, 'no catch');
  });

  await T.step('scripted mode: spawn at an anchor, walkTo, face, anim, lunge, despawn', async () => {
    const r = await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh(4);
      T.place(40, 17, 'right');
      const c = HW.colonel;
      const e = await c.spawn('hall_e', { anim: 'emerge' });
      const r = { spawned: !!e && c.mode === 'scripted' && T.tile(c.x) === 58, shrouded: c.shrouded };
      r.walk = await c.walkTo([50, 17]);
      r.at = [T.tile(c.x), T.tile(c.y)];
      c.face('tess');
      r.dir = c.entity.dir;
      r.anim = await c.anim('reach_left', { once: true });
      const t0 = HW.time;
      r.lunge = await c.lunge([46, 17]);
      r.lungeT = +(HW.time - t0).toFixed(2);
      r.lungeAt = T.tile(c.x);
      r.gone = await c.despawn();
      r.after = { entity: !!c.entity, npc: !!HW.entities.get('colonel'), mode: c.mode };
      r.caught = T.gameOvers.length;
      return r;
    });
    T.ok(r.spawned && r.shrouded, 'spawn(anchor, { anim: emerge }) → scripted, shrouded', r);
    T.ok(r.walk && r.at[0] === 50 && r.at[1] === 17, 'walkTo([tx,ty]) resolves on arrival', r.at);
    T.eq(r.dir, 'left', 'face("tess")');
    T.ok(r.anim === true, 'anim(name, { once }) resolves when it ends');
    T.ok(r.lunge && r.lungeAt === 46 && r.lungeT < 0.7, 'lunge(target) at 150 px/s', r);
    T.ok(r.gone && !r.after.entity && !r.after.npc && r.after.mode === 'off', 'despawn() sinks and removes him', r.after);
    T.eq(r.caught, 0, 'scripted mode never catches on its own');
  });

  await T.step('standing in the hall: seen, "Who is out of their seat?", lurch chase, caught (hall_after_bell)', async () => {
    const r = await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh(5);
      await H.teleport('test_ai', 'hall_w');
      H.checkpoint('systems catch');
      const t0 = HW.time;
      H.timeScale(2);
      await T.periodWithColonel(60);
      // Stand still in his path, ~5 tiles ahead along the hall, until he notices (retry if he turns off).
      let noticed = false;
      HW.colonel.on('notice', () => { noticed = true; });
      for (let i = 0; i < 6 && !noticed && !T.gameOvers.length; i++) {
        const e = HW.colonel.entity;
        if (!e) break;
        const dirX = Math.cos(HW.colonel.look) >= 0 ? 1 : -1;
        const tx = Math.max(3, Math.min(60, T.tile(e.x) + dirX * 5));
        T.place(tx, 17, dirX > 0 ? 'left' : 'right');
        await T.until(() => noticed || T.gameOvers.length > 0, 4);
      }
      await T.until(() => T.gameOvers.length > 0, 20);
      H.timeScale(1);
      const tr = H.transcript.filter((x) => x.time >= t0).map((x) => `${x.type}:${x.text}`);
      return { noticed, gameOvers: T.gameOvers.slice(), log: HW.colonel.log.map((e) => e.ev), who: tr.includes('say:Who is out of their seat?'), mode: H.mode() };
    });
    T.ok(r.noticed && r.log.includes('cue') && r.log.includes('chase'), 'cue → notice → chase', r.log);
    T.ok(r.who, '"Who is out of their seat?" (first notice this chapter)');
    T.eq(r.gameOvers.map((x) => x.reason), ['hall_after_bell'], 'caught → HW.game.gameOver("hall_after_bell")');
    T.eq(r.mode, 'play', 'retry reloads the checkpoint');
  });

  await T.step('chase lurch rhythm: drag 30 px/s, 150 px/s lunges for 0.5 s every 1.4 s', async () => {
    const r = await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh(5);
      H.god(true);
      await HW.colonel.spawn([4, 17], { anim: null });
      T.place(60, 17, 'left');
      HW.colonel.chase({ track: true });
      const s = [];
      let last = HW.colonel.x;
      await T.until(() => {
        const x = HW.colonel.x;
        s.push({ v: (x - last) * 60, l: !!HW.colonel._c?.lunging, t: HW.time });
        last = x;
        return s.length >= 60 * 5;
      }, 10);
      const lunges = HW.colonel.log.filter((e) => e.ev === 'lunge').map((e) => e.t);
      const gaps = lunges.slice(1).map((t, i) => +(t - lunges[i]).toFixed(3));
      const v = (arr) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
      const lungeV = v(s.filter((x) => x.l).map((x) => x.v));
      const dragV = v(s.filter((x) => !x.l).map((x) => x.v));
      // Lengths of the runs of lunging steps (s).
      const runs = [];
      let n = 0;
      for (const x of s) { if (x.l) n++; else if (n) { runs.push(+(n / 60).toFixed(3)); n = 0; } }
      const total = s.reduce((a, b) => a + b.v / 60, 0) / 5;
      H.god(false);
      return { gaps, lungeV, dragV, runs, total };
    });
    T.ok(r.gaps.length >= 2 && r.gaps.every((d) => Math.abs(d - 1.4) < 0.05), 'a lunge every 1.4 s', r.gaps);
    T.ok(Math.abs(r.lungeV - 150) < 3 && Math.abs(r.dragV - 30) < 3, 'lunge 150 px/s, drag 30 px/s', { lunge: r.lungeV, drag: r.dragV });
    T.ok(r.runs.length >= 2 && r.runs.every((d) => Math.abs(d - 0.5) < 0.03), 'each lunge lasts 0.5 s', r.runs);
    T.ok(r.total > 60 && r.total < 85, 'average chase speed ≈ 73 px/s (walking loses, running wins)', r.total);
  });

  await T.step('hearing: running behind him → investigate; lost sight → search → back on patrol', async () => {
    const r = await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh(5);
      H.god(true);
      await H.teleport('test_ai', 'hall_e');
      await T.periodWithColonel(90);
      const c = HW.colonel;
      // Freeze him facing west at x 30; Tess 4 tiles behind him (east), out of his cone.
      c.setMode('scripted');
      c.entity.x = 30 * 16 + 8; c.entity.y = 17 * 16 + 12;
      c.face('left');
      c.setMode('patrol');
      c._clearQueue();
      c._push({ type: 'wait', t: 30 });
      T.place(34, 18, 'right');
      await H.steps(10);
      const before = c.mode;
      const det0 = c.detection;
      // Run east for a moment (footsteps → run noise, 7 tiles).
      HW.input.setVirtual('run', true);
      HW.input.setVirtual('right', true);
      await H.steps(20);
      HW.input.setVirtual('run', false);
      HW.input.setVirtual('right', false);
      await H.steps(3);
      const heard = c.log.find((e) => e.ev === 'hear');
      const r = { before, det0, heard: heard?.info, modeAfter: c.mode };
      // Search: put him in a chase, then Tess vanishes into Room B behind its shut door.
      c.chase();
      T.place(22, 7, 'up');
      await T.until(() => c.mode === 'search', 8);
      r.search = c.mode;
      r.lost = c.log.some((e) => e.ev === 'lost');
      H.timeScale(4);
      await T.until(() => c.mode === 'patrol', 30);
      r.resumed = c.mode;
      H.timeScale(1);
      H.god(false);
      return r;
    });
    T.ok(r.before === 'patrol' && r.det0 === 0, 'Tess behind him is not seen', r);
    T.eq(r.heard, 'run', 'he heard her run (HW.noise, 7 tiles) …');
    T.eq(r.modeAfter, 'investigate', '… and goes to investigate');
    T.ok(r.lost && r.search === 'search', 'lost line of sight for 3 s → search', r);
    T.eq(r.resumed, 'patrol', 'search over → back on patrol (period still running)');
  });

  await T.step('the shroud: a hole in the light — period tubes die around him and recover after he passes', async () => {
    const r = await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh(5);
      H.god(true);
      await H.teleport('test_ai', 'hall_mid');
      await HW.periods.start({ length: 120, warning: false, colonel: false });
      await H.steps(120);
      await HW.colonel.spawn([23, 16], { anim: null, dir: 'right' });
      T.place(32, 18, 'left');
      await H.steps(90);
      const tubes = () => HW.lighting.lights.filter((L) => L.group === 'period' && L.py > 15 * 16 && L.py < 18 * 16);
      const near = (L) => Math.hypot(L.px - HW.colonel.x, L.py - (HW.colonel.y - 18)) <= 3.5 * 16;
      const ts = tubes();
      const r = {
        shrouded: HW.colonel.shrouded,
        rendererShroud: HW.renderer._shroud === HW.colonel.entity,
        nearOff: ts.filter(near).map((L) => L._target),
        farOn: ts.filter((L) => !near(L)).map((L) => L._target),
      };
      // He moves on: the tubes behind him come back after ~1 s.
      HW.colonel.entity.x = 50 * 16 + 8;
      await H.steps(100);
      r.recovered = tubes().filter((L) => Math.abs(L.px - (23 * 16 + 8)) < 40).map((L) => L._target);
      // The gym breaks the rule for good.
      HW.colonel.entity.x = 23 * 16 + 8;
      H.setFlag('ch6_gym_lights', true);
      await H.steps(100);
      r.afterGym = { shrouded: HW.colonel.shrouded, near: tubes().filter(near).map((L) => L._target) };
      H.setFlag('ch6_gym_lights', false);
      H.god(false);
      return r;
    });
    T.ok(r.shrouded && r.rendererShroud, 'HW.colonel.shrouded; the renderer draws him as a silhouette', r);
    T.ok(r.nearOff.length >= 1 && r.nearOff.every((v) => v === 0), 'period lights within 3.5 tiles of him are dead', r.nearOff);
    T.ok(r.farOn.length >= 3 && r.farOn.every((v) => v === 1), 'tubes farther away stay lit', r.farOn);
    T.ok(r.recovered.length >= 1 && r.recovered.every((v) => v === 1), 'they recover after he has passed', r.recovered);
    T.ok(!r.afterGym.shrouded && r.afterGym.near.every((v) => v === 1), 'after ch6_gym_lights the light no longer dies around him', r.afterGym);
  });

  await T.step('screenshots: a period in the hall — lit tubes, the dark shape with brass glints', async () => {
    await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh(5);
      H.god(true);
      await H.teleport('test_ai', 'hall_mid');
      HW.state.flashlightOn = false;
      await HW.periods.start({ length: 300, warning: false, colonel: false });
      await H.steps(150);
      await HW.colonel.spawn([27, 17], { anim: null, dir: 'right' });
      HW.colonel.setMode('scripted');
      T.place(36, 18, 'left');
      H.fullbright(false);
      await H.steps(120);
    });
    await g.shot(`systems_${built ? 'built' : 'dev'}_period_hall`);
    await g.hw(async (H) => {
      const HW = H.HW;
      HW.state.flashlightOn = true;
      window.__T.place(33, 18, 'left');
      await H.steps(60);
    });
    await g.shot(`systems_${built ? 'built' : 'dev'}_period_flashlight`);
    // Peeking into a classroom: the coat fills the doorway.
    await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      HW.state.flashlightOn = false;
      await H.teleport('test_ai', 'below_desk_b');
      await T.sit('test_ai_desk_student_22_9');
      HW.colonel.entity.x = 20 * 16 + 8;
      HW.colonel.entity.y = 17 * 16 + 12;
      HW.colonel.peekInto('ai_b', { style: 'doorway' });
      await T.until(() => HW.colonel.peeking && HW.colonel.entity.animName?.startsWith('peek'), 30);
      await H.steps(30);
    });
    await g.shot(`systems_${built ? 'built' : 'dev'}_peek_doorway`);
    await g.hw((H) => { H.god(false); });
    T.ok(true, `screenshots in ${SHOTS}`);
  });

  await T.step('assembly: READ → telegraph → SCAN; seated spared, standing caught; roll #3 by row', async () => {
    const r = await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh(7);
      T.stub('ch7.roll3', async (g2, ctx) => { g2.set('roll3_done'); g2.set('test_roll3_row', ctx.row); });
      await H.teleport('test_ai', 'aud_row5');
      H.checkpoint('systems assembly');
      const phases = [];
      const off = HW.assembly.onPhase((p) => phases.push([p, +HW.time.toFixed(2)]));
      HW.assembly.start({ lectern: 'lectern' });
      const r = { mode: HW.colonel.mode, spot: !!HW.assembly.spot };
      // Sit in row 5: no roll call.
      HW.player.face('down');
      await T.sit('ai_seat_33_11');
      r.row5 = T.count('ch7.roll3');
      H.timeScale(4);
      await T.until(() => phases.filter((p) => p[0] === 'scan').length >= 1 && HW.assembly.phase === 'read', 30);
      r.phases = phases.slice();
      r.maxDetSeated = HW.colonel.detection;
      r.caughtSeated = T.gameOvers.length;
      // Stand up and move to row 4, sit: roll #3 fires once.
      await HW.hiding.stand();
      await H.steps(20);
      T.place(33, 8, 'down');
      await T.sit('ai_seat_33_9');
      await H.idle();
      r.row4 = T.count('ch7.roll3');
      r.row = HW.state.flags.test_roll3_row;
      // Running during READ → immediate scan.
      await HW.hiding.stand();
      await T.until(() => HW.assembly.phase === 'read', 20);
      HW.assembly.pause();
      T.place(44, 8, 'right');
      HW.assembly.resume();
      HW.input.setVirtual('run', true);
      HW.input.setVirtual('right', true);
      await H.steps(6);
      r.runScan = HW.assembly.phase;
      HW.input.setVirtual('run', false);
      HW.input.setVirtual('right', false);
      // Standing in the aisle through the scan → caught.
      await T.until(() => T.gameOvers.length > 0, 12);
      r.gameOvers = T.gameOvers.map((x) => x.reason);
      off();
      H.timeScale(1);
      return r;
    });
    T.ok(r.mode === 'assembly' && r.spot, 'he stands at the lectern; the spotlight is up', r);
    const [p0, p1, p2, p3] = r.phases;
    T.ok(p0?.[0] === 'read' && p1?.[0] === 'telegraph' && p2?.[0] === 'scan' && p3?.[0] === 'read', 'cycle READ → telegraph → SCAN → READ', r.phases);
    T.ok(p1 && p0 && p1[1] - p0[1] >= 7 - 0.05 && p1[1] - p0[1] <= 9 + 0.05, 'READ lasts 7–9 s', p1 && p0 && p1[1] - p0[1]);
    T.ok(p2 && Math.abs(p2[1] - p1[1] - 2) < 0.05, 'telegraph 2.0 s', p2 && p2[1] - p1[1]);
    T.ok(p3 && Math.abs(p3[1] - p2[1] - 3) < 0.05, 'SCAN 3 s', p3 && p3[1] - p2[1]);
    T.ok(r.maxDetSeated === 0 && r.caughtSeated === 0, 'seated Tess is spared during the scan', r);
    T.eq(r.row5, 0, 'sitting in row 5 does not trigger roll call #3');
    T.ok(r.row4 === 1 && r.row === 4, 'sitting in row 4 fires ch7.roll3 (ctx.row = 4)', r);
    T.eq(r.runScan, 'scan', 'running during READ → immediate scan');
    T.eq(r.gameOvers, ['out_of_seat'], 'standing through the scan → caught (out_of_seat)');
  });

  await T.step('assembly (Integration 2): house lights group on; front-row scene runs exactly once', async () => {
    const r = await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh(7);
      H.god(true);
      HW.lighting.setGroup('assembly', null);
      T.stub('ch7.roll3', async (g2) => { g2.set('roll3_done'); g2.set('roll3_answered', false); });
      T.stub('ch7.front_danny');
      HW.state.flags.ch7_started = true;
      await H.teleport('aud', 'beside_danny');
      await H.idle();
      HW.assembly.start({ lectern: 'lectern' });
      const r = { group: HW.state.lightGroups?.assembly === true, active: HW.assembly.active };
      const seat = HW.map.prop('aud_seat_beside_danny');
      r.front = seat?.inst.front;
      r.deferred = HW.assembly.frontDeferred;
      // A: roll #3 due — the sit fires it first, then the friend's scene, once.
      await HW.hiding.sit(seat);
      await T.until(() => T.count('ch7.front_danny') >= 1, 20);
      await H.steps(150);
      await H.idle();
      r.a = { roll3: T.count('ch7.roll3'), front: T.count('ch7.front_danny'), seated: HW.player.seated?.id };
      // C: without a script's own front-row hook, the engine default runs it — still once.
      const set = HW.game._listeners.get('sit');
      const hooks = [...set].filter((fn) => /ch7\.front_/.test(String(fn)));
      for (const fn of hooks) set.delete(fn);
      r.deferredNoHook = HW.assembly.frontDeferred;
      r.resolved = HW.hiding.sitScriptFor(seat);
      await HW.hiding.stand();
      await H.steps(10);
      await HW.hiding.sit(seat);
      await T.until(() => T.count('ch7.front_danny') >= 2, 20);
      await H.steps(150);
      await H.idle();
      r.c = { front: T.count('ch7.front_danny') };
      for (const fn of hooks) set.add(fn);
      await HW.hiding.stand();
      HW.assembly.stop();
      H.god(false);
      return r;
    });
    T.ok(r.group && r.active, "assembly.start() switches the 'assembly' light group on (persisted)", r);
    T.ok(r.front === 'danny' && r.a.roll3 === 1 && r.a.front === 1 && r.a.seated === 'aud_seat_beside_danny', 'front seat: roll #3 first, then ch7.front_danny exactly once', r);
    T.ok(r.deferred === true ? r.deferredNoHook === false && r.resolved === 'ch7.front_danny' && r.c.front === 2 : r.c.front === 2, 'front seat without a script hook: the engine default (sitScript) runs it, once', r);
  });

  await T.step('long hall: seamless loop, stripped ambience, clocks, voice at loop 4, whistle on running, the pass', async () => {
    const r = await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh(5);
      const data = HW.data.maps.test_ai;
      data.longhall = { loopFromX: 20, loopToX: 40, kevinStopX: 10 };
      T.stub('ch5.longhall_loop');
      T.stub('ch5.longhall_voice');
      T.stub('ch5.kevin_whistle', async (g2) => { await g2.wait(0.2); g2.setPos('tess', 'loop_reset'); });
      T.stub('ch5.kevin_pass', async (g2) => { g2.take('hall_pass'); g2.set('longhall_cleared'); });
      const strips = [];
      const origStrip = HW.audio.stripAmbience;
      HW.audio.stripAmbience = (n, f) => { strips.push(n); return origStrip?.call(HW.audio, n, f); };
      HW.game.loadMap('test_ai', [22, 17]);
      await H.steps(3);
      const r = { active: HW.longhall.active, kevin: !!HW.entities.get('kevin') };
      // Walk west across x 20: teleported 20 tiles east, camera shifted with her (compare the step
      // before the loop with the step after it: the camera-to-Tess offset must not jump).
      let prevOff = null;
      let lastOff = null;
      HW.input.setVirtual('left', true);
      await T.until(() => {
        const off = HW.camera.view.x - HW.player.x;
        if (HW.state.flags.longhall_loops === 1) return true;
        prevOff = off;
        return false;
      }, 10);
      await H.steps(1);
      lastOff = HW.camera.view.x - HW.player.x;
      HW.input.setVirtual('left', false);
      r.after = { tx: HW.player.x / 16, jump: Math.abs(lastOff - prevOff) };
      r.clock = HW.periods.clockTime();
      // Three more loops.
      for (let i = 2; i <= 4; i++) {
        HW.input.setVirtual('left', true);
        await T.until(() => HW.state.flags.longhall_loops === i, 15);
        HW.input.setVirtual('left', false);
      }
      await H.steps(3);
      r.loops = HW.state.flags.longhall_loops;
      r.loopCalls = T.calls.filter((c) => c.id === 'ch5.longhall_loop').map((c) => c.ctx.loop);
      r.voice = T.calls.filter((c) => c.id === 'ch5.longhall_voice').map((c) => c.ctx.loop);
      r.strips = strips.slice();
      // Running → the whistle script.
      HW.input.setVirtual('run', true);
      HW.input.setVirtual('right', true);
      await T.until(() => T.count('ch5.kevin_whistle') > 0, 5);
      HW.input.setVirtual('run', false);
      HW.input.setVirtual('right', false);
      await H.idle();
      r.whistle = T.count('ch5.kevin_whistle');
      r.reset = [T.tile(HW.player.x), T.tile(HW.player.y)];
      // With the pass: walk west to kevinStopX → ch5.kevin_pass; then the hall is normal.
      H.give('hall_pass', 1);
      T.place(24, 17, 'left');
      HW.input.setVirtual('left', true);
      await T.until(() => T.count('ch5.kevin_pass') > 0, 15);
      HW.input.setVirtual('left', false);
      await H.idle();
      r.pass = T.count('ch5.kevin_pass');
      r.cleared = !!HW.state.flags.longhall_cleared;
      r.activeAfter = HW.longhall.active;
      T.place(22, 17, 'left');
      const loops = HW.state.flags.longhall_loops;
      HW.input.setVirtual('left', true);
      await H.steps(60);
      HW.input.setVirtual('left', false);
      r.noMoreLoops = HW.state.flags.longhall_loops === loops && HW.player.x < 20 * 16;
      r.stripReset = strips[strips.length - 1];
      HW.audio.stripAmbience = origStrip;
      delete data.longhall;
      return r;
    });
    T.ok(r.active && r.kevin, 'long hall active (no pass); Kevin stands at his spot', r);
    T.ok(Math.abs(r.after.tx - 39.5) < 1 && r.after.jump < 2, 'crossing loopFromX westward → +20 tiles; the view does not jump (seamless)', r.after);
    T.ok(Math.abs(r.clock - (1 + 41 / 60)) < 1e-6, 'hall clocks gained a minute', r.clock);
    T.eq(r.loops, 4, 'four loops counted (flag longhall_loops)');
    T.eq(r.loopCalls, [1, 2, 3, 4], 'ch5.longhall_loop ran with ctx.loop each time');
    T.eq(r.voice, [4], 'ch5.longhall_voice at loop 4');
    T.eq(r.strips.slice(0, 4), [1, 2, 3, 4], 'one ambience layer stripped per loop');
    T.ok(r.whistle === 1 && r.reset[0] === 50, 'running → ch5.kevin_whistle (the script resets her)', r);
    T.ok(r.pass === 1 && r.cleared && !r.activeAfter, 'with the pass: ch5.kevin_pass at kevinStopX; hall cleared; system off', r);
    T.ok(r.noMoreLoops && r.stripReset === 0, 'after clearing, walking west no longer loops; ambience restored', r);
  });

  await T.step('basement: walking never stirs; noise stirs (cooldown, panel rule, decay); stir 2 rises → woke', async () => {
    const r = await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh(3);
      T.stub('ch3.stir1');
      T.stub('ch3.stir2');
      H.setFlag('ai_heap', true);
      H.refresh();
      await H.teleport('test_ai', 'store');
      H.checkpoint('systems basement');
      const B = HW.basement;
      const heap = B._center();
      const r = { active: B.active, sleep: HW.colonel.mode, stir0: B.stir };
      // Walk around the heap: never stirs.
      HW.input.setVirtual('left', true);
      await H.steps(60);
      HW.input.setVirtual('left', false);
      HW.input.setVirtual('right', true);
      await H.steps(60);
      HW.input.setVirtual('right', false);
      await H.steps(3);
      r.walkNoises = HW.noise.recent(5, 'walk').length;
      r.afterWalk = B.stir;
      // A door slam near the heap → stir 1 (+ ch3.stir1); a second noise inside the 3 s cooldown → still 1.
      HW.noise.emit(heap.x + 32, heap.y, null, 'door');
      await H.steps(2);
      r.afterDoor = B.stir;
      r.stir1 = T.count('ch3.stir1');
      HW.noise.emit(heap.x + 32, heap.y, null, 'item');
      await H.steps(2);
      r.cooldown = B.stir;
      // A noise farther than 8 tiles: ignored.
      HW.noise.emit(heap.x + 9 * 16, heap.y - 3 * 16, null, 'item');
      await H.steps(2);
      r.far = B.stir;
      // Quiet for 20 s → back to 0.
      H.timeScale(8);
      await T.until(() => B.stir === 0, 30);
      r.decayed = B.stir;
      // The panel: from anywhere, only 0 → 1.
      HW.noise.emit(heap.x + 30 * 16, heap.y - 10 * 16, null, 'panel');
      await H.steps(2);
      r.panel0 = B.stir;
      HW.noise.emit(heap.x + 30 * 16, heap.y - 10 * 16, null, 'panel');
      await H.steps(2);
      r.panel1 = B.stir;
      H.timeScale(1);
      // Running near it (after the cooldown) → stir 2 → ch3.stir2 → he rises and hunts.
      await H.steps(200);
      T.place(8, 27, 'right');
      HW.input.setVirtual('run', true);
      HW.input.setVirtual('right', true);
      await H.steps(25);
      HW.input.setVirtual('run', false);
      HW.input.setVirtual('right', false);
      await T.until(() => HW.colonel.mode === 'chase', 10);
      r.stir2 = T.count('ch3.stir2');
      r.risen = HW.colonel.mode;
      r.flag = HW.state.flags.ch3_colonel_stirred;
      // Standing still: caught → 'woke'.
      await T.until(() => T.gameOvers.length > 0, 20);
      r.gameOvers = T.gameOvers.map((x) => x.reason);
      H.setFlag('ai_heap', false);
      return r;
    });
    T.ok(r.active && r.sleep === 'sleep' && r.stir0 === 0, 'occupied heap: he sleeps (mode sleep)', r);
    T.ok(r.walkNoises > 0 && r.afterWalk === 0, 'walking never stirs', r);
    T.ok(r.afterDoor === 1 && r.stir1 === 1, 'a door within 8 tiles → stir 1 (ch3.stir1)', r);
    T.eq(r.cooldown, 1, '3 s cooldown between stirs');
    T.eq(r.far, 1, 'noises beyond 8 tiles of the heap are ignored');
    T.eq(r.decayed, 0, 'stir decays after 20 s of quiet');
    T.ok(r.panel0 === 1 && r.panel1 === 1, 'the panel CLUNK sets stir 1 only when it is 0', r);
    T.ok(r.stir2 === 1 && r.risen === 'chase' && r.flag === 2, 'running near the heap → stir 2 → ch3.stir2 → he rises and hunts', r);
    T.eq(r.gameOvers, ['woke'], 'caught by the risen sleeper → woke');
  });

  await T.step('Safety Patrol: head tracking; running in his sight → whistle → period warning', async () => {
    const r = await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh(5);
      HW.periods.enable({ maps: ['test_ai'], passing: 999, length: 20, max: 3 });
      await H.teleport('test_ai', 'hall_e');
      T.place(50, 16, 'right');
      HW.patrol.spawn('kevin', { at: 'kevin' });
      await H.steps(10);
      const k = HW.entities.get('kevin');
      const r = {};
      T.place(60, 15, 'right');
      await H.steps(5);
      r.dirNorth = k.dir;
      T.place(50, 17, 'right');
      await H.steps(5);
      r.dirWest = k.dir;
      // Walking in his sight: nothing.
      HW.input.setVirtual('right', true);
      await H.steps(30);
      HW.input.setVirtual('right', false);
      r.walkWhistle = HW.periods.phase;
      // Running: the pre-whistle, the whistle, a standard warning.
      let info = null;
      const off = HW.patrol.onWhistle((i) => { info = i; });
      T.place(50, 17, 'right');
      HW.input.setVirtual('run', true);
      HW.input.setVirtual('right', true);
      await T.until(() => info, 3);
      HW.input.setVirtual('run', false);
      HW.input.setVirtual('right', false);
      off();
      r.whistled = !!info;
      r.phase = HW.periods.phase;
      r.reason = HW.periods._opts?.reason;
      r.noise = HW.noise.recent(3, 'whistle').length;
      r.reportedBy = HW.periods.reportedBy;
      r.gameOvers = T.gameOvers.length;
      await HW.periods.end();
      return r;
    });
    T.ok(r.dirNorth === 'up' && r.dirWest === 'left', 'his head follows her', r);
    T.eq(r.walkWhistle, 'idle', 'walking in his sight is allowed');
    T.ok(r.whistled && r.noise === 1, 'running within 10 tiles in his sight → whistle (map-wide noise)', r);
    T.ok(r.phase === 'warning' && r.reason === 'whistle' && r.reportedBy === 'kevin', 'a standard period warning starts now (reported by K. Hoyt)', r);
    T.eq(r.gameOvers, 0, 'Kevin is never a death source');
  });

  await T.step('Kevin during a period: the whistle reports her; the Colonel investigates; caught → running', async () => {
    const r = await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh(5);
      await H.teleport('test_ai', 'hall_e');
      H.checkpoint('systems kevin');
      await T.periodWithColonel(120);
      const c = HW.colonel;
      c.setMode('scripted');
      c.entity.x = 34 * 16 + 8; c.entity.y = 17 * 16 + 12;
      c.face('left');
      c.setMode('patrol');
      c._clearQueue();
      c._push({ type: 'wait', t: 60 });
      HW.patrol.spawn('kevin', { at: 'kevin' });
      T.place(52, 17, 'right');
      await H.steps(5);
      let whistled = false;
      const off = HW.patrol.onWhistle(() => { whistled = true; });
      HW.input.setVirtual('run', true);
      HW.input.setVirtual('right', true);
      await T.until(() => whistled, 3);
      HW.input.setVirtual('run', false);
      HW.input.setVirtual('right', false);
      off();
      await H.steps(5);
      const r = { whistled, heard: c.log.find((e) => e.ev === 'hear')?.info, mode: c.mode, reported: HW.periods.reportedBy };
      H.timeScale(4);
      await T.until(() => T.gameOvers.length > 0, 60);
      H.timeScale(1);
      r.gameOvers = T.gameOvers.map((x) => x.reason);
      return r;
    });
    T.ok(r.whistled && r.heard === 'whistle' && r.mode === 'investigate' && r.reported === 'kevin', 'whistle → he investigates where she ran', r);
    T.eq(r.gameOvers, ['running'], 'caught after a report → "Running in the halls — reported by K. Hoyt" (running)');
  });

  await T.step('escape (cannotCatch), breaker lamps, transfers end a chase', async () => {
    const r = await g.hw(async (H) => {
      const T = window.__T;
      const HW = H.HW;
      await T.fresh(8);
      // Escape, PRESENT variant: he can't catch her even if she stands still.
      await HW.colonel.spawn([20, 17], { anim: null });
      T.place(26, 17, 'right');
      const done = HW.chase.escape({ cannotCatch: true, endMaps: ['test'] });
      let minD = 1e9;
      await T.until(() => { if (HW.colonel.entity) minD = Math.min(minD, Math.hypot(HW.colonel.x - HW.player.x, HW.colonel.y - HW.player.y)); return false; }, 6);
      const r = { mode: HW.colonel.mode, minD, caught: T.gameOvers.length, flag: !!HW.state.flags.chase_escape };
      // A transfer to an end map finishes the escape.
      HW.game.loadMap('test', 'start');
      r.result = await Promise.race([done, new Promise((res) => setTimeout(() => res('timeout'), 3000))]);
      r.flagAfter = !!HW.state.flags.chase_escape;
      // A transfer ends an ordinary chase too (he reappears at the next bell).
      await H.teleport('test_ai', 'hall_w');
      await HW.periods.start({ length: 60, warning: false, colonel: false });
      await HW.colonel.spawn([10, 17], { anim: null, mode: 'patrol' });
      HW.colonel.chase();
      HW.game.loadMap('test_ai', 'hall_e');
      await H.steps(400);
      r.afterTransfer = { mode: HW.colonel.mode, entity: !!HW.colonel.entity, noRespawn: HW.periods._noRespawn };
      await HW.periods.end();
      // …but walking into a patrol map mid-period (no chase): he emerges 6 s later, out of view.
      await HW.periods.start({ length: 60, warning: false });
      await T.until(() => HW.colonel.mode === 'patrol', 10);
      HW.game.loadMap('test_ai', 'hall_w');
      const t0 = HW.time;
      await T.until(() => HW.colonel.entity, 10);
      r.respawn = { dt: +(HW.time - t0).toFixed(2), d: Math.hypot(HW.colonel.x - HW.player.x, HW.colonel.y - HW.player.y) / 16 };
      await HW.periods.end();
      // Breaker lamps: light one by one ahead of her by y thresholds; extinguish peacefully.
      const data = HW.data.maps.test_ai;
      const lamps = [[40, 9], [40, 7], [40, 5]].map(([x, y], i) => ({ type: 'lamp_miner', x, y, group: `lamp_${i + 1}`, on: false }));
      data.lights.push(...lamps);
      data.breaker = { thresholds: [9, 7, 5] };
      HW.game.loadMap('test_ai', [43, 10]);
      await H.steps(5);
      r.lamps0 = HW.breaker.lit;
      const lit = [];
      for (const y of [9, 7, 5]) {
        T.place(43, y, 'up');
        await H.steps(30);
        lit.push(HW.breaker.lit);
      }
      r.lit = lit;
      r.groups = [1, 2, 3].map((n) => HW.lighting.groupOn(`lamp_${n}`));
      await HW.breaker.extinguish({ interval: 0.2 });
      r.out = [1, 2, 3].map((n) => HW.lighting.groupOn(`lamp_${n}`));
      HW.breaker.reset();
      data.lights.splice(data.lights.length - 3, 3);
      delete data.breaker;
      return r;
    });
    T.ok(r.mode === 'escape' && r.flag, 'escape mode, persisted for retries', r);
    T.ok(r.minD > 14 && r.caught === 0, 'cannotCatch: he looms but never catches', r);
    T.ok(r.result === 'escaped' && !r.flagAfter, 'reaching an end map finishes the escape', r);
    T.ok(r.afterTransfer.mode === 'off' && !r.afterTransfer.entity && r.afterTransfer.noRespawn, 'a map transfer ends a chase; he waits for the next bell', r.afterTransfer);
    T.ok(r.respawn && Math.abs(r.respawn.dt - 6) < 0.2 && r.respawn.d >= 12, 'entering a patrol map mid-period: he emerges 6 s later, ≥ 12 tiles away', r.respawn);
    T.ok(r.lamps0 === 0 && JSON.stringify(r.lit) === '[1,2,3]' && r.groups.every(Boolean), 'breaker lamps light one by one as she climbs', r);
    T.ok(r.out.every((v) => v === false), 'extinguish() puts them all out', r.out);
  });

  await T.step('no errors', async () => {
    T.eq(await g.errors(), [], 'no captured errors');
  });
} catch (e) {
  T.ok(false, 'systems suite crashed', e?.stack || String(e));
} finally {
  await g?.close();
  await browser.close();
}

console.log(`screenshots: ${SHOTS}`);
process.exit(T.done() ? 0 : 1);
