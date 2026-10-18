// Playthrough — ONE continuous game of HALLOWELL from the title screen, the way a player plays it.
//
// The title menu starts a New Game with real key presses; every chapter hands over to the next by itself
// (no story flags set, no teleports across chapters). Walking is real simulated input along A*
// (__HW.walkTo), props and doors are used with confirm (__HW.interact), dialogue auto-advances and the
// choices / modal screens come from __HW.choiceQueue / __HW.screenAnswer. God mode is OFF throughout: the
// periods (incl. one free period on east2 in Ch5), the gym chase, the Assembly scans and the escape are
// played for real (a seat when the chime sounds, run from the gym, sit — or stay out of sight — while he
// scans, run on "Run."). Low batteries are swapped through the bag screen with real keys. Chapter cards
// and the ending stamps are put up with the real card screen (g.card skips it under autoAdvance) so they
// can be screenshotted. Each segment checks: zero captured errors, no console warnings / failed requests,
// the chapter card, the objective, the hand-off; a softlock reports map, tile, mode, running scripts,
// objective. Per-segment transcripts are written next to the screenshots.
//
// Main path (DESIGN §8 QA matrix case (R1, B2, Charter) → DISMISSED with the transfer form):
//   roll #1 answered [Here.] · Danny [Hang in there.] (no bond) · Leah [Philly.] (bond) · the Charter ·
//   roll #2 [Hold your breath.] · roll #3 silent · Marcus's bond (the diary page) · the Register:
//   stamp Leah, Marcus, Tess · the form on Danny · the red pen (R2) → DISMISSED → credits → title.
// Real saves through the pause menu + page reload + Continue (state compared field by field):
//   slot 1  Ch3, the janitor's room with the keyring
//   slot 2  Ch6, after "alone" (the showers)            → branch TRUANT (the coal chute)
//   slot 3  Ch8, the weigh-master's office, before the Register → branches WITHDRAWN and PRESENT
// Branches start from the title's Load menu (the slots the main run wrote), never from a hand-built state.
//
// Usage:
//   node tests/playthrough.mjs                 dev page (tools/serve.mjs)
//   node tests/playthrough.mjs --built         dist/hallowell.html (run `npm run build` first)
//   node tests/playthrough.mjs --only=ch5      one segment (ids below; comma-separated list allowed). It
//        resumes from the snapshot the last full run (same mode) wrote at that segment's start — a real
//        save the game itself produced — or, without one, plays everything before it first.
//   HW_SHOTS=<dir>       screenshots, transcripts + snapshots go to <dir>/playthrough[-built]/ (default
//                        <tmp>/hallowell-shots); an --only run writes into …/only-<ids>/
//   HW_PT_SCALE=<n>      simulation speed (default 6)
// Segments: title pro ch1 ch2 ch3 ch4 ch5 ch6 ch7 ch8 | truant withdrawn present
import fs from 'node:fs';
import path from 'node:path';
import { launch, openGame, suite, SHOTS } from './lib.mjs';

const argv = process.argv.slice(2);
const BUILT = argv.includes('--built');
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const SCALE = Number(process.env.HW_PT_SCALE) || 6;
const BASE = path.join(SHOTS, `playthrough${BUILT ? '-built' : ''}`);
const CACHE = path.join(BASE, 'snapshots');
// a full run writes its screenshots/transcripts next to the snapshots; --only runs get their own folder
const OUT = ONLY.length ? path.join(BASE, `only-${ONLY.join('-')}`) : BASE;
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = suite(`playthrough${BUILT ? ' (built)' : ''}`);

// Register actions (DESIGN §8; R1: Tess in pencil; Danny unbonded = ink; Leah, Marcus bonded = pencil).
const REG = {
  dismissed: [['stamp', 'leah'], ['stamp', 'marcus'], ['stamp', 'tess'], ['form', 'danny'], ['pen', 'founder', { grounds: 'R2', written: true }]],
  withdrawn: [['stamp', 'leah'], ['stamp', 'marcus'], ['stamp', 'tess'], ['form', 'danny']],
  present: [['stamp', 'leah'], ['stamp', 'marcus'], ['form', 'danny']],
};

// ================================================================================================ in-page
/** Instrumentation + player helpers, installed as window.__pt on every page load. */
function ptLib(SCALE) {
  if (window.__pt && window.__pt._v) return;
  const H = window.__HW;
  const HW = H.HW;
  const ui = HW.ui;
  const TILE = 16;
  const pt = window.__pt = {
    _v: 1, tr: [], shotQ: [], running: new Map(), walkFails: [], covers: [], notes: [], scale: SCALE,
    realCards: true, _frozen: 0,
  };
  // -- transcript tap (the debug transcript is capped; this one is cleared per segment)
  const dbg = HW.debug;
  const rec = dbg.record.bind(dbg);
  dbg.record = (type, who, expr, text) => {
    pt.tr.push({ type, who, expr, text, map: HW.map?.id || null, t: Math.round(HW.time * 100) / 100 });
    // g.card() skips the card UI under autoAdvance: put the real card screen up for the screenshot
    // (it plays over the scene, which carries on underneath; the timeScale drops while it is captured).
    if (type === 'card' && pt.realCards) { pt.cardQ.push(String(text)); if (!pt._card) pt.nextCard(); }
    return rec(type, who, expr, text);
  };
  // Cards come back to back under autoAdvance (no waits between them): show them one at a time.
  pt.cardQ = [];
  pt.nextCard = () => {
    const text = pt.cardQ.shift();
    if (text === undefined) return;
    try {
      // the transcript joins g.card(title, subtitle) as "title — subtitle": split it back the same way
      const i = text.indexOf(' — ');
      ui.open('card', i < 0 ? { title: text } : { title: text.slice(0, i), subtitle: text.slice(i + 3) });
      const c = ui.get('card');
      if (!c) return;
      c.t = Math.max(c.t, c.endAt - c.hold + 0.6);   // fully typed / stamped
      c.alpha = 1;
      pt._card = c;
      pt.shotQ.push({ kind: c.code ? 'ending' : 'card', title: c.big + (c.small ? ` — ${c.small}` : '') });
      pt.freeze();
    } catch (e) { pt.notes.push(`card screen failed: ${e}`); }
  };
  // -- which scripts are running (for softlock reports)
  const S = HW.scripts;
  const runFn = S.runFn.bind(S);
  S.runFn = function (fn, ctx, o = {}) {
    const id = (o && o.id) || '(inline)';
    pt.running.set(id, (pt.running.get(id) || 0) + 1);
    const p = runFn(fn, ctx, o);
    Promise.resolve(p).finally(() => { const n = (pt.running.get(id) || 1) - 1; if (n <= 0) pt.running.delete(id); else pt.running.set(id, n); });
    return p;
  };
  // -- chapter cards / ending stamps: shown for real (the UI auto-resolves them under autoAdvance)
  const auto0 = ui._autoResult.bind(ui);
  ui._autoResult = (name, args) => (name === 'card' && pt.realCards ? undefined : auto0(name, args));
  pt.freeze = () => { if (pt._frozen) return; pt._frozen = dbg.timeScale; dbg.timeScale = 0.05; pt._frozenAt = performance.now(); };
  pt.shotDone = () => {
    if (pt._card) { try { pt._card.close(null); pt._card.alpha = 0; } catch { /* gone */ } pt._card = null; }
    if (pt._frozen) { dbg.timeScale = pt._frozen; pt._frozen = 0; }
    if (pt.cardQ.length) pt.nextCard();
  };
  setInterval(() => { if (pt._frozen && performance.now() - pt._frozenAt > 5000) pt.shotDone(); }, 500);
  pt.takeShot = () => pt.shotQ.shift() || null;
  // a short trace of where she was (for "caught" reports): every ~0.25 s, the last 6 s
  pt.trace = [];
  pt.catchTraces = [];
  let traceN = 0;
  HW.game.until(() => {
    if (++traceN % 15 === 0 && HW.player && HW.map) {
      const p = HW.player;
      pt.trace.push({ t: Math.round(HW.time * 10) / 10, map: HW.map.id, tile: [Math.floor(p.x / TILE), Math.floor(p.y / TILE)], seated: p.seated?.id || null, moving: !!p.moving,
        phase: HW.assembly?.active ? `${HW.assembly.phase}(${HW.assembly.phaseLeft.toFixed(1)})` : HW.periods?.phase, det: Math.round((HW.colonel?.detection || 0) * 100) / 100,
        colonel: HW.colonel?.mode, view: HW.assembly?.active ? pt.inView() : null });
      if (pt.trace.length > 24) pt.trace.shift();
    }
    return false;
  });
  HW.game.on('gameOver', (reason) => pt.catchTraces.push({ reason, trace: pt.trace.slice() }));
  pt.setScale = (x) => { if (pt._frozen) pt._frozen = x; else dbg.timeScale = x; pt.scale = x; };

  // -- where are we (softlock reports)
  pt.where = () => {
    const p = HW.player;
    const d = ui.dialogue;
    return {
      map: HW.map?.id || null, tile: p ? [Math.floor(p.x / TILE), Math.floor(p.y / TILE)] : null, mode: HW.game.mode,
      chapter: HW.state?.chapter, objective: HW.state?.objective, checkpoint: HW.state?.checkpoint,
      blocking: S.blocking, running: [...pt.running.keys()], transferring: HW.game.transferring,
      screens: ui.screens.filter((s) => !s.closing).map((s) => s.name), dialogue: d?.cur ? String(d.cur.text).slice(0, 80) : null,
      choice: d?.choiceState ? d.choiceState.list.map((o) => o.text) : null, seated: p?.seated?.id || null, hidden: p?.hidden || null,
      busy: !!p?.busy, controllable: HW.game.controllable, autopilot: dbg._ap ? { goal: dbg._ap.goal.map((v) => Math.floor(v / TILE)), i: dbg._ap.i, n: dbg._ap.path.length } : null,
      periods: HW.periods?.phase, colonel: HW.colonel?.mode, assembly: HW.assembly?.active ? HW.assembly.phase : null, chase: HW.chase?.active ? HW.chase.kind : null,
      party: HW.state?.party?.slice(), battery: Math.round(HW.state?.battery ?? -1), lastLines: pt.tr.filter((x) => ['say', 'think', 'narrate', 'choice', 'trigger', 'transfer'].includes(x.type)).slice(-4).map((x) => `${x.type}:${x.who || ''}: ${String(x.text).slice(0, 60)}`),
    };
  };

  // -- small helpers
  pt.settle = async (sec = 120) => { await HW.game.until(() => !S.blocking && !HW.game.transferring && HW.game.mode === 'play', sec); return H.idle(sec); };
  pt.said = (re, who) => pt.tr.some((x) => ['say', 'think', 'narrate'].includes(x.type) && (!who || x.who === who) && re.test(String(x.text)));
  const pointOf = (target) => {
    if (Array.isArray(target)) return { x: target[0] * TILE + 8, y: target[1] * TILE + 12 };
    if (typeof target === 'string') return HW.map?.anchor(target) || null;
    return target;
  };
  pt.arrived = (target) => {
    const g = pointOf(target);
    const p = HW.player;
    if (!g || !p) return false;
    return Math.floor(g.x / TILE) === Math.floor(p.x / TILE) && Math.floor(g.y / TILE) === Math.floor(p.y / TILE);
  };

  /** What a player would react to right now: a free period's chime, or the Assembly about to look up. */
  pt.hazard = () => {
    const p = HW.player;
    if (!p || p.seated || p.hidden || !HW.game.controllable) return null;
    const P = HW.periods;
    if (P && (P.phase === 'warning' || P.phase === 'active') && !P.scripted && !P._opts?.guided && P.cfg?.maps?.includes(HW.map.id)) return 'period';
    const A = HW.assembly;
    if (A?.active && HW.map.id === A._mapId && pt.inView() && (A.phase === 'telegraph' || A.phase === 'scan' || (A.phase === 'read' && A.phaseLeft < 0.6))) return 'assembly';
    return null;
  };
  /** Can he see her (or a point) from the lectern (the wings and the music room are behind walls)? */
  pt.inView = (pos) => {
    const e = HW.colonel?.entity;
    const p = pos || HW.player;
    if (!e || !p) return true;
    try { return !!HW.map.los(e.x, e.y - 20, p.x, p.y - 10); } catch { return true; }
  };
  /** Hidden now, but the next steps of the walk come out where he can see — and he is not reading. */
  pt.aboutToShow = () => {
    const A = HW.assembly;
    const ap = dbg._ap;
    if (!A?.active || HW.map?.id !== A._mapId || !ap || pt.inView()) return false;
    if (A.phase === 'read' && A.phaseLeft > 2) return false;
    for (let k = ap.i; k < Math.min(ap.path.length, ap.i + 3); k++) if (pt.inView({ x: ap.path[k][0], y: ap.path[k][1] })) return true;
    return false;
  };
  pt.hazardOver = (kind) => {
    if (kind === 'period') return HW.periods.phase === 'idle';
    const A = HW.assembly;
    return !A.active || HW.map?.id !== A._mapId || (A.phase === 'read' && A.phaseLeft > 5.5);
  };

  /** The free cell next to a prop (seat, desk, pickup on a desk…) that is quickest to reach, and the way to face from it. */
  pt.seatApproach = (seat) => {
    const map = HW.map;
    const p = HW.player;
    let best = null;
    const cand = [];
    for (let x = seat.x; x < seat.x + seat.w; x++) { cand.push([x, seat.y + seat.h, 'up'], [x, seat.y - 1, 'down']); }
    for (let y = seat.y; y < seat.y + seat.h; y++) { cand.push([seat.x - 1, y, 'right'], [seat.x + seat.w, y, 'left']); }
    for (const [tx, ty, dir] of cand) {
      const pos = [tx * TILE + 8, ty * TILE + 12];
      if (!p.free(pos[0], pos[1])) continue;
      const path = map.findPath([p.x, p.y], pos, { doors: true });
      if (!path) continue;
      const len = path.length;
      if (!best || len < best.len) best = { tx, ty, dir, len };
    }
    return best;
  };

  /** Sit on the nearest free seat (optionally in a room). → seat id | null */
  pt.sitNearest = async ({ room = null, maxDist = 16 * 10, exclude = [] } = {}) => {
    const p = HW.player;
    const seats = HW.map.props.filter((q) => q.def.seat && !q.seatedBy && q.state !== 'occupied' && !q.inst.noSit && !q.inst.script && !exclude.includes(q.id)
      && (!room || HW.map.roomAt((q.x + q.w / 2) * TILE, (q.y + q.h / 2) * TILE)?.id === room)
      && Math.hypot((q.x + q.w / 2) * TILE - p.x, (q.y + q.h / 2) * TILE - p.y) < maxDist)
      .sort((a, b) => Math.hypot((a.x + a.w / 2) * TILE - p.x, (a.y + a.h / 2) * TILE - p.y) - Math.hypot((b.x + b.w / 2) * TILE - p.x, (b.y + b.h / 2) * TILE - p.y));
    for (const seat of seats.slice(0, 5)) {
      const a = pt.seatApproach(seat);
      if (!a) continue;
      await H.walkTo([a.tx, a.ty], { timeout: 20 });
      H.face(a.dir);
      await H.steps(2);
      HW.input.tap('confirm');
      await H.steps(14);
      if (HW.player.seated) return HW.player.seated.id;
      if (HW.player.busy) { await H.steps(10); if (HW.player.seated) return HW.player.seated.id; }
    }
    return null;
  };

  /** Stand up from a seat (a direction press, like a player). */
  pt.stand = async (dir = 'down') => {
    for (let i = 0; i < 4 && HW.player?.seated; i++) { await H.press(dir, 120); await H.steps(4); }
    return !HW.player?.seated;
  };

  /** React to a hazard: sit (and shut her eyes in a period), wait it out, stand up. */
  pt.takeCover = async (kind) => {
    const t0 = HW.time;
    const room = HW.game.room?.id || null;
    let seat = kind === 'period' ? await pt.sitNearest({ room }) : null;
    if (!seat) seat = await pt.sitNearest({ maxDist: kind === 'assembly' ? 16 * 7 : 16 * 14 });
    const rec = { kind, at: pt.where(), seat, map: HW.map.id };
    pt.covers.push(rec);
    if (!seat) { rec.failed = true; }
    if (kind === 'period' && seat) HW.input.setVirtual('confirm', true);   // eyes shut: time ×4 (DESIGN §4.1)
    if (kind === 'period') {
      await HW.game.until(() => HW.periods.phase === 'active' || pt.hazardOver(kind), 30);
      await H.steps(120);
      rec.followers = HW.entities.followers.map((e) => `${e.id}:${e.seat?.id || 'standing'}`);
    }
    await HW.game.until(() => pt.hazardOver(kind) || HW.game.mode === 'gameover' || !HW.player?.seated && !!seat, kind === 'period' ? 240 : 30);
    HW.input.setVirtual('confirm', false);
    await H.steps(2);
    await HW.game.until(() => !S.blocking && HW.game.mode === 'play', 120);
    rec.sec = Math.round((HW.time - t0) * 10) / 10;
    if (HW.player?.seated) await pt.stand('down');
    return seat;
  };

  /**
   * Walk somewhere like a player: real input along A*, sitting out free periods and Assembly scans on the
   * way, re-issuing the walk after a cutscene ate its timeout. A walk that gets stuck is recorded.
   */
  pt.go = async (target, { run = false, timeout = 90, tries = 4, label = '' } = {}) => {
    for (let i = 0; i < tries; i++) {
      const map0 = HW.map?.id;
      const go0 = pt.tr.filter((x) => x.type === 'gameover').length;
      let res = null;
      let scene = false;
      let hid = false;
      const A = HW.assembly;
      if (A?.active && HW.map?.id === A._mapId && HW.game.controllable && !(A.phase === 'read' && A.phaseLeft > 5.5)) {
        // like a player: set off only when he has just started reading — until then sit, stay seated, or
        // stay where he can't see her
        if (HW.player?.seated || !pt.inView()) await HW.game.until(() => !A.active || (A.phase === 'read' && A.phaseLeft > 5.5) || HW.game.mode !== 'play', 30);
        else await pt.takeCover('assembly');
      }
      if (HW.player?.seated) await pt.stand('down');
      H.walkTo(target, { run, timeout }).then((r) => { res = r; });
      while (res === null) {
        await H.steps(1);
        if (S.blocking || HW.game.mode !== 'play') scene = true;
        if (pt.aboutToShow()) {
          // like a player at the edge of the wing: wait out of sight for him to look down again
          hid = true;
          await H.walkTo({ x: HW.player.x, y: HW.player.y });
          const w = { kind: 'assembly-wait', at: pt.where(), seat: 'out of sight', map: HW.map.id, sec: 0 };
          pt.covers.push(w);
          const t0 = HW.time;
          await HW.game.until(() => pt.hazardOver('assembly') || HW.game.mode !== 'play', 30);
          w.sec = Math.round((HW.time - t0) * 10) / 10;
          break;
        }
        const hz = pt.hazard();
        if (hz) {
          hid = true;
          await H.walkTo({ x: HW.player.x, y: HW.player.y });
          await pt.takeCover(hz);
          break;
        }
      }
      if (pt.tr.filter((x) => x.type === 'gameover').length > go0) {
        await pt.settle(60);
        if (HW.map?.id !== map0) return false;   // the checkpoint is on another map: the caller decides
        continue;
      }
      if (HW.map?.id !== map0) return true;
      if (hid) continue;
      if (res || pt.arrived(target)) return true;
      if (scene || HW.game.mode === 'gameover') { await pt.settle(60); continue; }
      pt.walkFails.push({ target, label, attempt: i, at: pt.where() });
      await H.steps(20);
    }
    return pt.arrived(target);
  };

  /** Walk there, face, press confirm, wait for the game to be idle. */
  pt.use = async (target, dir, o = {}) => {
    const ok = await pt.go(target, o);
    if (dir) H.face(dir);
    await H.steps(2);
    await H.interact();
    await pt.settle(o.settle || 120);
    return ok;
  };

  /** Take an exit (walk onto it) and wait for the new map. */
  pt.cross = async (target, mapId, o = {}) => {
    await pt.go(target, o);
    await HW.game.until(() => HW.map?.id === mapId && !HW.game.transferring, 20);
    await H.steps(3);
    await pt.settle(o.settle || 120);
    return HW.map?.id === mapId;
  };

  /**
   * Leave through a door that has a destination: walk into it; if that does not take her through (an
   * open door with `to` is not an exit), press confirm on it like a player who sees the prompt.
   */
  pt.throughDoor = async (id, mapId, dir) => {
    const q = HW.map?.prop(id);
    if (!q) return { ok: false, why: `no prop ${id}` };
    await pt.go([q.x, q.y]);
    await H.press(dir, 600);
    await HW.game.until(() => HW.map?.id === mapId && !HW.game.transferring, 3);
    const walked = HW.map?.id === mapId;
    let confirmed = false;
    if (!walked) {
      const prompt = { target: HW.interact.target?.id || null, verb: HW.interact.verb || null, state: q.state };
      H.face(dir); await H.steps(2);
      await H.interact();
      await HW.game.until(() => HW.map?.id === mapId && !HW.game.transferring, 10);
      confirmed = HW.map?.id === mapId;
      pt.notes.push(`walking into ${id} (${q.state}) did not leave ${q.map || 'the map'}; prompt ${JSON.stringify(prompt)}; confirm ${confirmed ? 'did' : 'did NOT'}`);
      pt.doorIssues = (pt.doorIssues || []).concat([{ id, state: q.state, prompt, confirmed, at: pt.where() }]);
    }
    await pt.settle();
    return { ok: HW.map?.id === mapId, walked, confirmed };
  };

  /** Use a prop by id: stand on it (floor items) or face it from the nearest free side. */
  pt.useProp = async (id, o = {}) => {
    const q = HW.map?.prop(id);
    if (!q || !q.present) return false;
    if (!q.solid && q.mount !== 'wall' && HW.player.free(q.x * TILE + 8, q.y * TILE + 12)) {
      await pt.go([q.x, q.y], o);
      await H.steps(2);
      await H.interact();
      await pt.settle();
      return true;
    }
    const a = pt.seatApproach(q);
    if (!a) { pt.notes.push(`useProp ${id}: no free cell next to it targets it`); return false; }
    await pt.go([a.tx, a.ty], o);
    H.face(a.dir);
    await H.steps(3);
    if (HW.interact.target && HW.interact.target !== q) { pt.notes.push(`useProp ${id}: the prompt is on ${HW.interact.target.id || HW.interact.target.kind} instead`); return false; }
    await H.interact();
    await pt.settle();
    return true;
  };

  /** The ending flow after end.<id>: the credits (held to hurry, autoAdvance off so the title waits). */
  pt.finishEnding = async (sec = 900) => {
    await HW.game.until(() => !!ui.get('credits') || HW.game.mode === 'title', sec);
    const f = HW.state.flags;
    const info = { credits: !!ui.get('credits'), ending: f.ending || null, seen: Object.keys(f).filter((k) => k.startsWith('ending_seen_')), mode: HW.game.mode, where: pt.where() };
    await HW.game.until(() => !pt.cardQ.length && !pt._card, 20);   // the epilogue's cards are all captured
    H.autoAdvance(false);
    if (info.credits) {
      await H.steps(30);
      pt.shotQ.push({ kind: 'credits', title: `credits ${info.ending}` });
      pt.freeze();
      await HW.game.until(() => !pt._frozen, 10);
      HW.input.setVirtual('confirm', true);   // "hold to hurry"
    }
    await HW.game.until(() => HW.game.mode === 'title' && !!ui.get('title'), 600);
    HW.input.setVirtual('confirm', false);
    info.title = HW.game.mode === 'title' && !!ui.get('title');
    // what "Continue" would load now (the newest slot)
    try {
      const sums = ['auto', '1', '2', '3'].map((k) => [k, JSON.parse(localStorage.getItem(`hallowell.save.${k}`) || 'null')?.summary]).filter((x) => x[1]);
      sums.sort((a, b) => new Date(b[1].date) - new Date(a[1].date));
      info.continueTo = sums[0] ? { slot: sums[0][0], chapter: sums[0][1].chapterTitle, map: sums[0][1].mapName, checkpoint: sums[0][1].checkpoint, objective: sums[0][1].objective } : null;
    } catch { info.continueTo = null; }
    await H.steps(60);
    pt.shotQ.push({ kind: 'title', title: `title after ${info.ending}` });
    return info;
  };

  /** Snapshot for --only: every save slot + the live state (a real save the game itself could write). */
  pt.snapshot = () => {
    const storage = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('hallowell.')) storage[k] = localStorage.getItem(k); }
    let state = null;
    if (HW.map && HW.player) {
      state = JSON.parse(JSON.stringify(HW.state));
      const pos = HW.hiding?.restorePoint?.() || { x: HW.player.x, y: HW.player.y, dir: HW.player.dir };
      Object.assign(state, { map: HW.map.id, px: pos.x, py: pos.y, dir: pos.dir });
    }
    return { storage, state };
  };
}

// ================================================================================================ node side
const browser = await launch();
let game = null;
let page = null;
let shotTimer = null;
const shots = [];
const timing = [];
const findings = [];          // things a player would notice (printed at the end)
let errSeen = 0;

async function install() {
  await page.addScriptTag({ content: `(${ptLib.toString()})(${SCALE});` });
}
/** Evaluate fn(H, HW, pt, ...args) in the page. */
const pg = (fn, ...args) => page.evaluate(([src, a]) => {
  const f = new Function(`return (${src})`)();
  return f(window.__HW, window.__HW.HW, window.__pt, ...a);
}, [fn.toString(), args]);

async function startShots() {
  if (shotTimer) return;
  let busy = false;
  shotTimer = setInterval(async () => {
    if (busy || !page) return;
    busy = true;
    try {
      const req = await page.evaluate(() => (window.__pt && window.__pt.takeShot ? window.__pt.takeShot() : null)).catch(() => null);
      if (req) {
        const slug = String(req.title).replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 48);
        const file = path.join(OUT, `${String(shots.length + 1).padStart(2, '0')}_${req.kind}_${slug}.png`);
        await page.screenshot({ path: file }).catch(() => {});
        shots.push({ ...req, file });
        await page.evaluate(() => window.__pt && window.__pt.shotDone()).catch(() => {});
      }
    } finally { busy = false; }
  }, 60);
}

const warnings = [];          // console.warn + failed requests (missing resources), per segment
async function openPage() {
  game = await openGame(browser, { built: BUILT });
  page = game.page;
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(`console.warn: ${m.text()}`); });
  page.on('requestfailed', (r) => warnings.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
  page.on('response', (r) => { if (r.status() >= 400) warnings.push(`HTTP ${r.status()}: ${r.url()}`); });
  await install();
  await startShots();
}

/** Per-segment records that must survive a page reload (the in-page ones are rebuilt by install()). */
let carry = { tr: [], walkFails: [], covers: [], notes: [], doorIssues: [], catchTraces: [] };
async function stash() {
  const c = await page.evaluate(() => (window.__pt ? { tr: window.__pt.tr, walkFails: window.__pt.walkFails, covers: window.__pt.covers, notes: window.__pt.notes, doorIssues: window.__pt.doorIssues || [], catchTraces: window.__pt.catchTraces.splice(0) } : null)).catch(() => null);
  if (c) for (const k of Object.keys(carry)) carry[k].push(...(c[k] || []));
}
async function reloadPage() {
  await stash();
  pendingErrs = await newErrors().catch(() => []);
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await install();
}

async function key(k, n = 1, gap = 110) {
  for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(gap); }
}

async function shot(name) {
  const file = path.join(OUT, `${String(shots.length + 1).padStart(2, '0')}_${name}.png`);
  await page.screenshot({ path: file });
  shots.push({ kind: 'manual', title: name, file });
  return file;
}

/** In-page errors + page errors not yet reported (the in-page list is drained; it does not survive a reload). */
let pendingErrs = [];
async function newErrors() {
  const inPage = await pg((H) => { const e = H.errors.slice(); H.errors.length = 0; return e; }).catch(() => []);
  const fromPage = game.pageErrors.slice(errSeen);
  errSeen = game.pageErrors.length;
  const all = [...pendingErrs, ...inPage, ...fromPage.filter((e) => !inPage.some((x) => e.includes(String(x).slice(0, 60))))];
  pendingErrs = [];
  return [...new Set(all)];
}

// ---- title-screen and pause-menu driving (real keys) ----------------------------------------------------
// Menus auto-repeat a held arrow after 0.34 s of *game* time, so they are driven at timeScale 1 and every
// move is checked against the screen's own selection before confirming.
async function uiState() {
  return pg((H, HW) => {
    const top = (n) => HW.ui.get(n);
    const t = top('title'); const sl = top('saveload'); const ps = top('pause'); const cf = top('confirm');
    return {
      mode: HW.game.mode, phase: t?.phase || null, titleSel: t?.sel ?? null, items: t?.items?.map((i) => i.id) || null,
      saveload: sl ? { sel: sl.sel, slots: sl.slots.map((x) => x.slot), mode: sl.mode } : null,
      pause: ps ? { sel: ps.sel, items: ps.items.map((i) => i.id), disabled: ps.items.filter((i) => i.disabled).map((i) => i.id) } : null,
      confirm: cf ? { sel: cf.sel } : null,
    };
  });
}
async function menuScale(on) { await pg((H, HW, pt, v) => pt.setScale(v), on ? 1 : SCALE); }
/** Move a menu's selection to index `want` with single arrow taps, verifying each step. */
async function select(read, want, n) {
  for (let i = 0; i < 3 * n + 6; i++) {
    const sel = read(await uiState());
    if (sel === null || sel === undefined) throw new Error('menu vanished while navigating');
    if (sel === want) return true;
    const down = (want - sel + n) % n;
    await key(down <= n / 2 ? 'ArrowDown' : 'ArrowUp', 1, 160);
  }
  throw new Error(`menu selection never reached ${want}`);
}
async function toMenu() {
  await menuScale(true);
  for (let i = 0; i < 60; i++) {
    const s = await uiState();
    if (s.mode === 'title' && s.phase === 'menu') return s;
    if (s.mode === 'title' && s.phase === 'press') { await sleep(500); await key('Enter'); }
    await sleep(200);
  }
  throw new Error('title menu never appeared');
}
/** Arm the automation the moment the title hands over to the game. */
async function armPlay() {
  await pg((H, HW, pt, s) => { H.autoAdvance(true); pt.setScale(s); H.god(false); }, SCALE);
}
async function waitPlay(sec = 200) {
  return pg(async (H, HW, pt, s) => {
    await HW.game.until(() => HW.game.mode !== 'title' && !!HW.map, 30);
    await pt.settle(s);
    return pt.where();
  }, sec);
}
async function titlePick(id) {
  const s = await toMenu();
  if (!s.items.includes(id)) throw new Error(`title has no "${id}" item (items: ${s.items.join(', ')})`);
  await select((u) => u.titleSel, s.items.indexOf(id), s.items.length);
  return s;
}
async function titleNew() {
  const s = await titlePick('new');
  T.eq(s.items[0], 'new', '[title] "New Game" is the first menu item');
  await armPlay();
  await key('Enter');
}
async function titleContinue() {
  const s = await toMenu();
  T.ok(s.items.includes('continue'), '[title] "Continue" offered once a save exists', s.items);
  await titlePick('continue');
  await armPlay();
  await key('Enter');
  return waitPlay();
}
async function titleLoad(slot) {
  await titlePick('load');
  await key('Enter');
  let sl = null;
  for (let i = 0; i < 20 && !sl; i++) { await sleep(150); sl = (await uiState()).saveload; }
  if (!sl) throw new Error('Load: the save/load screen did not open');
  await select((u) => u.saveload?.sel, sl.slots.indexOf(String(slot)), sl.slots.length);
  await armPlay();
  await key('Enter');
  return waitPlay();
}

/** Pause menu → Save → slot (→ Overwrite). */
async function saveViaMenu(slot) {
  const can = await pg((H, HW) => ({ can: HW.game.canSave(), ctl: HW.game.controllable, mode: HW.game.mode }));
  if (!can.can) throw new Error(`cannot save here: ${JSON.stringify(can)}`);
  await menuScale(true);
  await key('Escape');
  let u = null;
  for (let i = 0; i < 20 && !u?.pause; i++) { await sleep(120); u = await uiState(); }
  if (!u?.pause) throw new Error('the pause menu did not open');
  T.ok(!u.pause.disabled.includes('save'), `[save ${slot}] "Save" enabled in the pause menu`, u.pause);
  await select((x) => x.pause?.sel, u.pause.items.indexOf('save'), u.pause.items.length);
  await key('Enter');
  for (let i = 0; i < 20 && !u?.saveload; i++) { await sleep(120); u = await uiState(); }
  if (!u?.saveload || u.saveload.mode !== 'save') throw new Error('the save screen did not open');
  await select((x) => x.saveload?.sel, u.saveload.slots.indexOf(String(slot)), u.saveload.slots.length);
  await key('Enter');
  await sleep(400);
  u = await uiState();
  if (u.confirm) { await select((x) => x.confirm?.sel, 0, 2); await key('Enter'); await sleep(300); }   // "Write over slot N?" → [Overwrite]
  const saved = await pg((H, HW, pt, k) => { try { return JSON.parse(localStorage.getItem(k) || 'null')?.summary || null; } catch { return null; } }, `hallowell.save.${slot}`);
  await key('Escape');
  await sleep(250);
  await key('Escape');
  await sleep(300);
  u = await uiState();
  const left = [u.saveload && 'saveload', u.pause && 'pause', u.confirm && 'confirm'].filter(Boolean);
  await menuScale(false);
  return { saved, mode: u.mode, left };
}

const COMPARE = ['map', 'chapter', 'objective', 'party', 'inv', 'flags', 'bonds', 'rollAnswered', 'docs', 'checkpoint', 'battery', 'lightSource'];
function diffState(a, b) {
  const out = [];
  for (const k of COMPARE) {
    const x = a[k]; const y = b[k];
    if (k === 'flags' || k === 'inv' || k === 'docs') {
      const keys = new Set([...Object.keys(x || {}), ...Object.keys(y || {})]);
      for (const f of keys) if (JSON.stringify(x?.[f]) !== JSON.stringify(y?.[f])) out.push(`${k}.${f}: ${JSON.stringify(x?.[f])} → ${JSON.stringify(y?.[f])}`);
    } else if (k === 'battery') {
      if (Math.abs((x || 0) - (y || 0)) > 3) out.push(`battery: ${x} → ${y}`);   // it drains while she plays on after the load
    } else if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${k}: ${JSON.stringify(x)} → ${JSON.stringify(y)}`);
  }
  return out;
}

/**
 * Save through the pause menu, reload the page, Continue from the title, compare the restored game
 * with what was saved, then carry on playing.
 */
async function saveReloadContinue(slot, label) {
  const before = await pg((H, HW, pt) => {
    const pl = H.player();
    const rp = HW.hiding?.restorePoint?.();   // seated: the save keeps where she stood
    return { s: JSON.parse(JSON.stringify(HW.state)), p: rp ? { ...pl, x: rp.x, y: rp.y, tx: Math.floor(rp.x / 16), ty: Math.floor(rp.y / 16), seatedAtSave: pl.seated } : pl, where: pt.where(), followers: HW.entities.followers.map((e) => e.id) };
  });
  await shot(`save${slot}_${label}_before`);
  const r = await saveViaMenu(slot);
  T.ok(!!r.saved, `[save ${slot}] the pause menu wrote slot ${slot} (${r.saved?.chapterTitle} · ${r.saved?.mapName})`, r);
  T.ok(r.mode === 'play' && !r.left.length, `[save ${slot}] Escape twice closes the menus, back in play`, r);
  for (const e of await newErrors()) T.ok(false, `[save ${slot}] error before reload`, e);
  await reloadPage();
  const after = await titleContinue();
  const now = await pg((H, HW) => ({ s: JSON.parse(JSON.stringify(HW.state)), p: H.player(), followers: HW.entities.followers.map((e) => e.id) }));
  await shot(`save${slot}_${label}_after_continue`);
  const d = diffState(before.s, now.s);
  T.ok(d.length === 0, `[save ${slot}] Continue restores ${label}: map, chapter, objective, party, items, flags, bonds, rolls, docs`, d);
  const dp = Math.hypot(before.p.x - now.p.x, before.p.y - now.p.y);
  T.ok(dp <= 2 && before.p.map === now.p.map, `[save ${slot}] position restored (${before.p.map} ${before.p.tx},${before.p.ty} → ${now.p.map} ${now.p.tx},${now.p.ty})`, { before: before.p, after: now.p });
  T.eq(now.followers, before.followers, `[save ${slot}] the party follows again after the reload`);
  T.eq(after.mode, 'play', `[save ${slot}] control after Continue`);
  return { before, now };
}

// ---- the bag: put a fresh battery in the flashlight when it runs low (inventory screen, real keys) -------
async function topUp() {
  const st = await pg((H, HW) => ({ b: HW.state?.battery ?? 100, n: HW.state?.inv?.battery || 0, ok: HW.game.controllable && HW.game.mode === 'play' && !HW.scripts.blocking, map: HW.map?.id }));
  if (!(st.ok && st.b < 25 && st.n > 0)) return null;
  const inv = async () => pg((H, HW) => { const s = HW.ui.get('inventory'); return s ? { sel: s.sel, ids: s.list.map((x) => x.id), menu: s.menu ? { sel: s.menu.sel, acts: s.menu.acts.map((a) => a.id) } : null } : null; });
  await menuScale(true);
  try {
    await key('KeyI');
    let u = null;
    for (let i = 0; i < 20 && !u; i++) { await sleep(120); u = await inv(); }
    if (!u) throw new Error('the bag did not open');
    const want = u.ids.indexOf('battery');
    for (let i = 0; i < 30 && u.sel !== want; i++) {
      const [r, c] = [Math.floor(u.sel / 5), u.sel % 5]; const [wr, wc] = [Math.floor(want / 5), want % 5];
      await key(r < wr ? 'ArrowDown' : r > wr ? 'ArrowUp' : c < wc ? 'ArrowRight' : 'ArrowLeft', 1, 160);
      u = await inv();
    }
    await key('Enter');
    u = await inv();
    if (u?.menu) { for (let i = 0; i < 6 && u.menu.acts[u.menu.sel] !== 'use'; i++) { await key('ArrowDown', 1, 160); u = await inv(); } await key('Enter'); }
    await sleep(400);
  } finally { await menuScale(false); }
  const after = await pg((H, HW) => ({ b: HW.state.battery, n: HW.state.inv.battery || 0, mode: HW.game.mode, bag: !!HW.ui.get('inventory') }));
  if (after.bag) await key('Escape');
  const r = { from: Math.round(st.b), to: Math.round(after.b), left: after.n, map: st.map };
  T.ok(after.b > st.b + 50, `[bag] a fresh battery from the bag (${r.from}% → ${r.to}%, ${r.left} left)`, r);
  return r;
}

// ---- segment plumbing ----------------------------------------------------------------------------------
class SegTimeout extends Error {}
let cur = null;
/** Mark a sub-step (shown in timeout reports). */
const at = (label) => { if (cur) cur.at = label; };
/** Run an in-page step: fn(H, HW, pt, ...args) */
async function step(label, fn, ...args) {
  at(label);
  const r = await pg(fn, ...args);
  await topUp();
  return r;
}
async function segTr() {
  const now = await pg((H, HW, pt) => pt.tr.map((x) => ({ type: x.type, who: x.who, expr: x.expr, text: x.text, map: x.map })));
  return [...carry.tr.map((x) => ({ type: x.type, who: x.who, expr: x.expr, text: x.text, map: x.map })), ...now];
}
/** The where-am-I part of a snap() (for failure details). */
const brief = (s) => (s && typeof s === 'object' ? { map: s.map, tile: s.tile, mode: s.mode, chapter: s.chapter, objective: s.objective, checkpoint: s.checkpoint, blocking: s.blocking, running: s.running, party: s.party, lastLines: s.lastLines } : s);
/** A progression check: when it fails the rest of the segment cannot be played. */
function need(cond, msg, detail) { if (!T.ok(cond, msg, detail)) throw new Error(`required: ${msg}`); }
async function snap() { return pg((H, HW, pt) => ({ ...pt.where(), state: JSON.parse(JSON.stringify(HW.state)) })); }

const said = (tr, re, who) => tr.some((x) => ['say', 'think', 'narrate'].includes(x.type) && (!who || x.who === who) && re.test(String(x.text)));
const choices = (tr) => tr.filter((x) => x.type === 'choice').map((x) => x.text);
const cards = (tr) => tr.filter((x) => x.type === 'card').map((x) => x.text);
const gameovers = (tr) => tr.filter((x) => x.type === 'gameover').map((x) => `${x.text}@${x.map}`);

// ================================================================================================ segments
const SEG = {};

SEG.title = { limit: 120, async run() {
  at('title screen');
  const s0 = await uiState();
  T.eq([s0.mode, s0.phase], ['title', 'press'], '[title] boots to the title screen ("Press any key")');
  await sleep(1200);
  await shot('title');
  await titleNew();
  at('the prologue (pro.start)');
  const w = await waitPlay(300);
  const s = await snap();
  need(w.map === 'exterior' && s.chapter === 0 && w.mode === 'play', '[title] New Game → pro.start → the front lot, Prologue, in control', w);
  T.eq(s.party, ['danny', 'leah', 'marcus'], '[title] party of four');
  T.eq(s.objective, 'Get inside.', '[title] objective "Get inside."');
  const tr = await segTr();
  T.ok(cards(tr).includes('Kettle Run, Pennsylvania. — October 18, 1996.'), '[title] the opening card', cards(tr));
} };

SEG.pro = { limit: 150, async run() {
  await step('the oak', (H, HW, pt) => pt.use('oak', 'up'));
  await step('the motto stone', async (H, HW, pt) => { await pt.go([30, 9]); await pt.go([28, 8]); return pt.use([28, 7], 'up'); });
  await step('up the steps → pro.doors', async (H, HW, pt) => { await pt.go('front_doors'); await pt.go([24, 7]); await pt.settle(200); });
  const s = await snap();
  const tr = await segTr();
  T.ok(s.state.flags.pro_doors_cut, '[pro] Danny cuts the chain (pro_doors_cut)');
  need(s.map === 'lobby' && s.chapter === 1, '[pro] inside: the lobby, Chapter I', { map: s.map, ch: s.chapter });
  T.ok(cards(tr).includes('I — After Hours'), '[pro] card "I — After Hours"', cards(tr));
  T.eq(s.objective, 'Look around.', '[pro→ch1] objective "Look around."');
  T.ok(said(tr, /Let no one be left behind\./), '[pro] Leah translates the motto');
} };

SEG.ch1 = { limit: 300, async run() {
  await step('enter the lobby (group shot)', (H, HW, pt) => pt.go([14, 16]));
  await step('settle', (H, HW, pt) => pt.settle());
  let s = await snap();
  T.ok(s.state.flags.ch1_group_shot && s.state.flags.danny_bag_dropped, '[ch1] the group shot; Danny drops his bag');
  await step('west hall', async (H, HW, pt) => { await pt.go([2, 15]); return pt.cross([1, 15], 'west1'); });
  await step("girls' room", (H, HW, pt) => pt.go('in_rr'));
  await step('settle', (H, HW, pt) => pt.settle());
  await step('101 (the tiny chair)', (H, HW, pt) => pt.go('in_101'));
  await step('settle', (H, HW, pt) => pt.settle());
  await step('the vanish', async (H, HW, pt) => { await pt.go([22, 15]); await pt.go([18, 15]); return pt.settle(200); });
  s = await snap();
  need(s.state.flags.ch1_danny_vanished, '[ch1] Danny vanishes in the west hall', brief(s));
  T.eq(s.party, ['leah', 'marcus'], '[ch1] party: Leah, Marcus');
  T.ok((s.state.inv.danny_flashlight || 0) === 1, "[ch1] Tess has Danny's flashlight");
  T.eq(s.objective, 'Room 102. Danny?', '[ch1] objective "Room 102. Danny?"');
  await step('Room 102', (H, HW, pt) => pt.go('in_102'));
  await step('settle', (H, HW, pt) => pt.settle());
  s = await snap();
  T.eq(s.objective, 'Get out. Get help.', '[ch1] objective "Get out. Get help."');
  await step('back to the lobby', (H, HW, pt) => pt.cross([60, 15], 'lobby'));
  await step('the bag (bolt cutters)', async (H, HW, pt) => { await pt.go([15, 16]); await pt.go([14, 18]); return pt.settle(); });
  s = await snap();
  T.ok((s.state.inv.bolt_cutters || 0) === 1, "[ch1] bolt cutters from Danny's bag on the way to the doors");
  await step('the front doors (loop)', async (H, HW, pt) => {
    await pt.go([14, 23]); await pt.go([14, 24]); await H.press('down', 900);
    await HW.game.until(() => HW.state.chapter === 2 && HW.map?.id === 'west1', 60);
    return pt.settle(200);
  });
  s = await snap();
  const tr = await segTr();
  need(s.map === 'west1' && s.chapter === 2, '[ch1→ch2] the front doors open onto the west hall; Chapter II', { map: s.map, ch: s.chapter });
  T.ok(cards(tr).includes('II — First Period'), '[ch1→ch2] card "II — First Period"', cards(tr));
  T.eq(s.objective, 'Room 103. Sit down.', '[ch2] objective "Room 103. Sit down."');
  T.ok(tr.some((x) => x.type === 'transfer' && /lobby>west1.*seamless/.test(x.text)), '[ch1→ch2] the loop transfer is seamless');
} };

SEG.ch2 = { limit: 300, async run() {
  await step('into 103', async (H, HW, pt) => { await pt.go('door_103'); await pt.go('in_103'); return pt.settle(); });
  await step('sit (heads down, held)', async (H, HW, pt) => {
    await pt.go([13, 7]);
    H.face('up');
    await H.steps(2);
    H.choiceQueue = [0];                                       // VHS: [Rewind it.]
    HW.input.tap('confirm');
    await HW.game.until(() => HW.scripts.blocking > 0 && HW.state.flags.ch2_bell1, 20);
    HW.input.setVirtual('confirm', true);                      // keep your head down
    await HW.game.until(() => HW.state.chapter === 3 && !HW.scripts.blocking, 500);
    HW.input.setVirtual('confirm', false);
    return pt.settle(200);
  });
  const s = await snap();
  const tr = await segTr();
  T.ok(s.state.flags.ch2_leah_taken && (s.state.inv.camcorder || 0) > 0, '[ch2] Leah taken; the camcorder');
  T.ok(tr.filter((x) => x.type === 'glimpse').length === 0, '[ch2] head held down: eyes never open');
  T.eq(choices(tr), ['Rewind it.'], '[ch2] the only choice: [Rewind it.]');
  T.ok(s.state.flags.colonel_named && s.state.flags.east_doors_open, '[ch2] colonel_named, east doors open');
  need(s.chapter === 3 && s.party.join() === 'marcus', '[ch2→ch3] Chapter III, Marcus', { ch: s.chapter, party: s.party });
  T.ok(cards(tr).includes('III — Custodial'), '[ch2→ch3] card "III — Custodial"', cards(tr));
  T.eq(s.objective, "Janitor's keys. The basement — east stairs.", '[ch3] objective names the basement');
  T.eq(gameovers(tr), [], '[ch2] no game over');
} };

SEG.ch3 = { limit: 420, async run() {
  await step('west1 → lobby → east1', async (H, HW, pt) => {
    if (HW.map.id === 'west1') await pt.cross([61, 15], 'lobby');
    await pt.cross([28, 15], 'east1');
    return pt.go([9, 15]);
  });
  await step('settle', (H, HW, pt) => pt.settle());
  await step('the dumbwaiter', (H, HW, pt) => pt.use('dumbwaiter', 'up'));
  await step('down the basement stairs', async (H, HW, pt) => { await pt.cross([17, 3], 'basement'); await pt.go([15, 13]); return pt.settle(); });
  let s = await snap();
  T.eq(s.checkpoint, 'basement', '[ch3] checkpoint at the foot of the basement stairs');
  await step('the coal heap', (H, HW, pt) => pt.use([12, 23], 'left'));
  await step("the janitor's door (wait for Marcus)", async (H, HW, pt) => {
    await pt.go('janitor_door');
    H.face('up');
    H.choiceQueue = [1];                                       // [Leave it.] — no bolt cutters (loud)
    await H.interact();
    await pt.settle();
    await HW.game.until(() => HW.state.flags.ch3_hint_given, 120);
    await pt.settle();
    await pt.use('janitor_ledge', 'up');
    return pt.use('janitor_door', 'up');
  });
  await step('the calendar and the keyring', async (H, HW, pt) => {
    await pt.go('in_janitor'); await pt.settle();
    await pt.use('calendar', 'up');
    await pt.use('keyring', 'up');
    await pt.useProp('b_battery_jan');
  });
  s = await snap();
  need(s.state.flags.ch3_ledge_key && s.state.flags.ch3_keyring && (s.state.inv.keyring || 0) > 0, '[ch3] the ledge key; the key ring', brief(s));
  T.ok(s.state.flags.ch3_jan_tried && s.state.flags.ch3_hint_given, '[ch3] the padlock tried first; Marcus hints at the ledge');
  T.eq([s.checkpoint, s.objective], ['keyring', 'Back upstairs. The main office.'], '[ch3] checkpoint "keyring"; objective back upstairs');
  // GAME BUG (reported): b_battery_jan sits on Walt's desk behind the solid office chair — no free tile faces it.
  T.ok((s.state.inv.battery || 0) >= 1, "[ch3] GAME BUG? the janitor's spare battery (b_battery_jan, DESIGN §9.5's Ch3 battery) can be picked up", s.state.inv);
  at('save slot 1 + reload + Continue');
  await saveReloadContinue(1, 'ch3_keyring');
  await step('up → the guided period', async (H, HW, pt) => { await pt.cross([16, 3], 'east1'); await pt.go([17, 9]); return pt.settle(); });
  s = await snap();
  T.eq(s.periods, 'warning', '[ch3] first_period: the guided warning');
  T.eq(s.objective, 'The cafeteria. Sit down.', '[ch3] objective "The cafeteria. Sit down."');
  await step('the cafeteria: sit, eyes shut', async (H, HW, pt) => {
    await pt.go('in_caf');
    const seat = await pt.sitNearest({ room: 'e1_cafeteria' });
    pt.notes.push(`ch3 guided period: sat at ${seat}`);
    HW.input.setVirtual('confirm', true);
    await HW.game.until(() => HW.state.chapter === 4 && !HW.scripts.blocking, 300);
    HW.input.setVirtual('confirm', false);
    return pt.settle(200);
  });
  s = await snap();
  const tr = await segTr();
  T.eq(gameovers(tr), [], '[ch3] survived the guided period (god off)');
  T.ok(s.state.flags.ch3_period_done && s.state.flags.coalbin_empty, '[ch3] ch3_period_done, coalbin_empty');
  need(s.chapter === 4, '[ch3→ch4] Chapter IV', s.chapter);
  T.ok(cards(tr).includes('IV — Attendance'), '[ch3→ch4] card "IV — Attendance"', cards(tr));
  T.eq(s.objective, 'The main office. The intercom.', '[ch4] objective "The main office. The intercom."');
  T.eq(choices(tr), ['Leave it.'], '[ch3] the only choice: [Leave it.] at the padlock');
} };

SEG.ch4 = { limit: 360, async run() {
  await step('to the west hall', async (H, HW, pt) => {
    if (HW.map.id === 'east1') await pt.cross([1, 15], 'lobby');
    if (HW.map.id === 'lobby') await pt.cross([1, 15], 'west1');
  });
  await step('the office door (OFFICE key)', async (H, HW, pt) => { await pt.use('door_office', 'down'); await pt.go('in_office'); return pt.settle(); });
  let s = await snap();
  need(s.state.flags.office_open, '[ch4] the key ring opens the main office', brief(s));
  await step('the sign-out sheet', (H, HW, pt) => pt.use('counter', 'down'));
  await step("Adair's mailbox", (H, HW, pt) => pt.use([40, 21], 'up'));
  await step('the lost and found (battery)', (H, HW, pt) => pt.useProp('w1_battery_office'));
  await step('the P.A. console → roll call #1 [Here.]', async (H, HW, pt) => {
    await pt.go('pa_console');
    H.face('up');
    H.choiceQueue = [0];
    await H.interact();
    await HW.game.until(() => HW.state.flags.roll1_done && HW.state.checkpoint === 'roll 1', 60);
    await HW.game.until(() => HW.periods.phase === 'warning', 30);
    return pt.settle();
  });
  s = await snap();
  T.ok(s.state.flags.roll1_answered && s.state.rollAnswered === 1, '[ch4] roll call #1 answered (rollAnswered 1)');
  T.eq(s.objective, 'Sit down. Anywhere in the office.', '[ch4] objective "Sit down. Anywhere in the office."');
  await step('the office bench, eyes shut', async (H, HW, pt) => {
    await pt.use('office_bench', 'up', { settle: 2 });
    if (!HW.player.seated) { const id = await pt.sitNearest(); pt.notes.push(`ch4: office_bench did not seat her; sat at ${id}`); }
    HW.input.setVirtual('confirm', true);
    await HW.game.until(() => HW.state.chapter === 5 && !HW.scripts.blocking, 300);
    HW.input.setVirtual('confirm', false);
    return pt.settle(200);
  });
  s = await snap();
  const tr = await segTr();
  T.eq(gameovers(tr), [], '[ch4] survived the office period');
  T.ok(s.state.flags.ch4_hide_done, '[ch4] ch4_hide_done');
  need(s.chapter === 5, '[ch4→ch5] Chapter V', s.chapter);
  T.ok(cards(tr).includes('V — Upstairs'), '[ch4→ch5] card "V — Upstairs"', cards(tr));
  T.eq(s.objective, 'Room 205. Upstairs — the east stairs.', '[ch5] objective "Room 205. Upstairs — the east stairs."');
  T.eq(choices(tr), ['Here.'], '[ch4] the only choice: [Here.]');
  const chalk = await pg((H) => ['w1_chalk_102_tess_a', 'w1_chalk_102_tess_p'].filter((id) => H.prop(id)?.present));
  T.eq(chalk, ['w1_chalk_102_tess_p'], '[ch4] 102: THERESA DOLAN — PRESENT');
} };

SEG.ch5 = { limit: 900, async run() {
  await step('office → lobby → east1 → the stair gate', async (H, HW, pt) => {
    await pt.cross([61, 15], 'lobby');
    await pt.cross([28, 15], 'east1');
    await pt.use('stair_gate', 'up');
    return pt.cross([14, 3], 'east2');
  });
  let s = await snap();
  need(s.state.flags.gate_2f_open && s.map === 'east2', '[ch5] the 2F GATE key; up to east2', brief(s));
  await step('205: Danny [Hang in there.] → the 205 period', async (H, HW, pt) => {
    H.choiceQueue = [1];
    await pt.go('door_205');
    await pt.go('in_205', { timeout: 400 });
    await HW.game.until(() => HW.state.flags.ch5_205_period_done && !HW.scripts.blocking, 400);
    return pt.settle(200);
  });
  s = await snap();
  let tr = await segTr();
  T.ok(s.state.flags.ch5_danny_found && !s.state.flags.bond_danny, '[ch5] Danny found; no bond ([Hang in there.])');
  need(s.state.flags.ch5_205_period_done, '[ch5] the 205 period', brief(s));
  T.eq(s.objective, 'Leah. The library — west.', '[ch5] objective "Leah. The library — west."');
  T.eq(gameovers(tr), [], '[ch5] no game over in 205');
  // Passing time runs out while she looks around the second floor (Ch5 free periods: 150 s of passing time):
  // a player hears the chime and sits down in the room she is in.
  const fp = await step('east2: look around until the chime (a free period)', async (H, HW, pt) => {
    const n0 = pt.covers.length;
    const spots = ['in_207', 'in_206', 'in_208' in HW.map.anchors ? 'in_208' : 'room208', 'in_206'];
    const t0 = HW.time;
    for (let i = 0; i < 24 && !pt.covers.slice(n0).some((c) => c.kind === 'period' && c.sec) && HW.time - t0 < 400; i++) {
      await pt.go(spots[i % spots.length]);
      await H.steps(30);
    }
    const c = pt.covers.slice(n0).find((x) => x.kind === 'period');
    return { cover: c ? { seat: c.seat, sec: c.sec, room: c.at?.map, followers: c.followers } : null, count: Number(HW.state.flags.periods_ch5) || 0, phase: HW.periods.phase, waited: Math.round(HW.time - t0) };
  });
  tr = await segTr();
  T.ok(!!fp.cover?.seat && fp.phase === 'idle', `[ch5] a free period on east2: the chime, she sits (${fp.cover?.seat}), it passes (${fp.waited} s of looking around)`, fp);
  console.log(`  info [ch5] free period: Tess at ${fp.cover?.seat}, followers ${JSON.stringify(fp.cover?.followers)}, ${fp.count} free period(s) so far`);
  T.eq(gameovers(tr), [], '[ch5] the free period: not caught');
  await step('the long hall without a pass (until Marcus remembers 206)', async (H, HW, pt) => {
    await pt.cross([1, 15], 'longhall');
    await pt.go([78, 9]);
    await pt.settle();
    let loops = 0;
    for (let i = 1; i <= 5; i++) {
      await pt.go([25, 9]);
      await H.press('left', 700);
      await H.steps(6);
      await HW.game.until(() => !HW.scripts.active || HW.scripts.blocking, 3);
      await H.steps(60);
      await pt.settle(60);
      loops = Number(HW.state.flags.longhall_loops) || 0;
      if (pt.said(/There was a pass on a hook in 206\./, 'marcus')) break;
    }
    pt.notes.push(`long hall: looped ${loops}× before Marcus's hint`);
    return loops;
  });
  await step('back east to 206 for the pass', async (H, HW, pt) => {
    await pt.cross([89, 9], 'east2');
    await pt.use('hall_pass', 'up');
    await pt.useProp('e2_battery_206');
    return pt.cross([1, 15], 'longhall');
  });
  s = await snap();
  T.ok(!!s.state.flags.longhall_loops && s.state.flags.longhall_loops >= 1, `[ch5] the hall loops without the pass (${s.state.flags.longhall_loops}×)`);
  need((s.state.inv.hall_pass || 0) === 1, '[ch5] the hall pass from 206', brief(s));
  await step('Kevin keeps the pass', async (H, HW, pt) => {
    await pt.go([7, 9]);
    await HW.game.until(() => HW.state.flags.longhall_cleared && !HW.scripts.blocking, 90);
    await pt.settle();
    return pt.cross([1, 9], 'west2');
  });
  s = await snap();
  need(s.state.flags.longhall_cleared && !s.party.includes('marcus') && s.map === 'west2', '[ch5] Kevin keeps the pass; Marcus goes around; west2, alone', brief(s));
  await step('202, the locked mezzanine door, the mirror', async (H, HW, pt) => {
    await pt.use('charter_excerpt', 'up');
    await pt.go('in_202'); await pt.settle();
    await pt.go([2, 15]); H.face('left'); await H.steps(2); await H.interact(); await pt.settle();
    await pt.go('in_rr');
    await pt.go('mirror_2f');
    await HW.game.until(() => HW.state.flags.adair_met && !HW.scripts.blocking, 90);
    return pt.settle();
  });
  s = await snap();
  need(s.state.flags.adair_met && s.state.flags.compact_unlocked, '[ch5] the Reflection: adair_met, compact_unlocked', brief(s));
  T.eq(s.objective, 'Room 201.', '[ch5] objective "Room 201."');
  tr = await segTr();
  T.ok(said(tr, /YOU ANSWERED\. DON'T AGAIN\./), "[ch5] Adair's fog knows roll #1 was answered");
  await step('201: the False Leah [Ask] → [Back out] → hold the door', async (H, HW, pt) => {
    H.choiceQueue = [0, 1];
    await pt.go('door_201');
    H.walkTo('in_201');
    await HW.game.until(() => HW.state.flags.false_leah_done || HW.game.mode === 'gameover', 200);
    await H.walkTo({ x: HW.player.x, y: HW.player.y });
    return pt.settle();
  });
  s = await snap();
  need(s.state.flags.false_leah_done, '[ch5] 201: survived the False Leah', brief(s));
  T.eq(s.objective, "The library. The door by the girls' room.", '[ch5] objective → the library door');
  await step('the library: the walkway, the spiral, Leah [Philly.]', async (H, HW, pt) => {
    await pt.go([2, 15]); H.face('left'); await H.steps(2); await H.interact();
    await HW.game.until(() => HW.map?.id === 'library' && !HW.game.transferring, 20);
    await pt.settle();
    await pt.go([18, 9]); await pt.settle();
    await pt.cross([1, 11], 'library');
    await HW.game.until(() => H.player().ty >= 14, 5);
    await pt.settle();
    H.choiceQueue = [0];
    await pt.go([9, 16]);
    await HW.game.until(() => HW.state.flags.ch5_leah_found && !HW.scripts.blocking, 90);
    return pt.settle();
  });
  s = await snap();
  need(s.state.flags.ch5_leah_found && s.state.flags.bond_leah, '[ch5] Leah found; bond_leah ([Philly.])', brief(s));
  await step('the catalog (the knock), the compact, the case → the Charter', async (H, HW, pt) => {
    await pt.go('card_catalog');
    await HW.game.until(() => HW.state.flags.ch5_knocked && !HW.scripts.blocking, 40);
    await pt.settle();
    H.face('up'); await H.steps(2); await H.interact(); await pt.settle();
    await H.press('compact', 80); await H.steps(30);            // Q — Mom's compact
    const past = HW.compact?.current?.id || null;
    if (HW.compact?.active) { await H.press('compact', 80); await H.steps(10); }
    await pt.settle();
    H.face('up'); await H.steps(2); await H.interact(); await pt.settle();
    await pt.go('display_case'); H.face('up'); await H.steps(2); await H.interact(); await pt.settle();
    return past;
  });
  s = await snap();
  T.ok(s.state.flags.saw_catalog_past && (s.state.inv.case_key || 0) >= 0 && (s.state.inv.charter || 0) === 1, '[ch5] the compact at the catalog → the case key → the Charter', { inv: s.state.inv, f: s.state.flags.saw_catalog_past });
  await step('unbar the doors → Chapter VI', async (H, HW, pt) => {
    await pt.go('barricade'); H.face('right'); await H.steps(2); await H.interact();
    await HW.game.until(() => HW.state.chapter === 6 && !HW.scripts.blocking, 90);
    return pt.settle(200);
  });
  s = await snap();
  tr = await segTr();
  need(s.chapter === 6, '[ch5→ch6] Chapter VI', s.chapter);
  T.ok(cards(tr).includes('VI — Passing Time'), '[ch5→ch6] card "VI — Passing Time"', cards(tr));
  T.eq(s.objective, "Haupt's office. The safe.", '[ch6] objective "Haupt\'s office. The safe."');
  T.ok(s.party.includes('marcus'), '[ch6] Marcus back');
  T.eq(choices(tr), ["Hang in there. You're gonna be fine.", 'Ask about the tape', 'Back out slowly', 'Philly. Mom took a job. We leave at Christmas.'], '[ch5] choices: Danny, the False Leah ×2, Leah');
  T.eq(gameovers(tr), [], '[ch5] no game over');
} };

SEG.ch6 = { limit: 600, async run() {
  const door = await step("library → west1 → Haupt's office", async (H, HW, pt) => {
    let d = null;
    if (HW.map.id === 'library') d = await pt.throughDoor('lib_doors', 'west1', 'right');
    await pt.go('principal_portrait');
    return d;
  });
  // GAME BUG (reported): ch5.unbar leaves lib_doors 'open' (g.setProp) and an open door with `to` is not an
  // exit — walking into the doorway stops at the map edge; only confirm on the "Open" prompt goes through.
  T.ok(!door || door.walked, '[ch6] GAME BUG? walking into the open library doors (WEST HALL) takes her out to the west hall', door);
  let s = await snap();
  need(s.map === 'west1', "[ch6] from the library to Haupt's office", s.map);
  await step('the portrait → the compact → the safe', async (H, HW, pt) => {
    H.face('up'); await H.interact(); await pt.settle();
    H.face('up'); await H.interact(); await pt.settle();
    await H.press('compact', 80); await H.steps(40);
    if (HW.compact?.active) { await H.press('compact', 80); await H.steps(20); }
    await pt.settle();
    H.face('up'); await H.interact(); await pt.settle(120);
    return pt.useProp('w1_battery_haupt');
  });
  s = await snap();
  need(s.state.flags.safe_open && s.state.inv.withdrawn_stamp === 1 && s.state.inv.aud_key === 1, "[ch6] Haupt's safe: the stamp and the auditorium key", brief(s));
  T.eq([s.checkpoint, s.objective], ['safe', 'The auditorium.'], '[ch6] checkpoint "safe"; objective "The auditorium."');
  await step('the breather [Sit.] [Tell him about Philly.]', async (H, HW, pt) => {
    await pt.cross([61, 15], 'lobby');
    H.choiceQueue = [0, 0];
    await pt.go([8, 15]);
    await HW.game.until(() => HW.state.flags.ch6_breather_done && !HW.scripts.blocking, 120);
    return pt.settle();
  });
  s = await snap();
  need(s.state.flags.ch6_breather_done && s.state.flags.gym_open, '[ch6] the breather; the gym is open', brief(s));
  T.ok(s.state.flags.ch6_told_marcus, '[ch6] [Tell him about Philly.] → ch6_told_marcus');
  T.eq(s.objective, 'The gym. East hall.', '[ch6] objective "The gym. East hall."');
  await step('east hall → the gym doors → the gym', async (H, HW, pt) => {
    await pt.cross([28, 15], 'east1');
    await H.steps(40);
    await pt.go([56, 15]);
    await pt.settle();
    return pt.cross([59, 15], 'gym');
  });
  // The gym: Denise, [Grab his arm.], the lights, "TESS. RUN." → run for the locker. Retried if caught.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await step(`the gym (attempt ${attempt})`, async (H, HW, pt) => {
      const n0 = pt.tr.filter((x) => x.type === 'gameover').length;
      if (HW.map.id === 'east1') { await pt.go([56, 15]); await pt.settle(); await pt.cross([59, 15], 'gym'); }
      if (!HW.state.flags.ch6_gym_lights) {
        H.choiceQueue = [1];
        await pt.go([6, 21]);
        await HW.game.until(() => HW.state.flags.ch6_gym_lights && !HW.scripts.blocking, 180);
      }
      const chase = HW.chase.active ? HW.chase.kind : null;
      const obj = HW.state.objective;
      const ran = await pt.go('locker_tess', { run: true, tries: 2 });
      H.face('up');
      H.choiceQueue = [1];
      H.screenAnswer('breath', ['held']);
      await H.steps(2);
      HW.input.tap('confirm');
      await HW.game.until(() => (HW.state.inv.denise_photo > 0 && !HW.scripts.blocking) || pt.tr.filter((x) => x.type === 'gameover').length > n0, 240);
      await pt.settle();
      return { chase, obj, ran, caught: pt.tr.filter((x) => x.type === 'gameover').length > n0, photo: HW.state.inv.denise_photo || 0, where: pt.where() };
    });
    if (attempt === 1) {
      T.eq(r.chase, 'gym', '[ch6] the gym chase starts after "TESS. RUN."');
      T.eq(r.obj, "The girls' locker room. Hide.", '[ch6] objective "The girls\' locker room. Hide."');
    }
    if (r.caught) { findings.push({ seg: 'ch6', what: `caught in the gym chase on attempt ${attempt}`, where: r.where }); continue; }
    T.ok(r.photo === 1, `[ch6] the locker: roll #2 held breath → Marcus taken, Denise's photo (attempt ${attempt})`, r);
    break;
  }
  await step('the showers → alone', async (H, HW, pt) => {
    await pt.go('shower_mirrors');
    await HW.game.until(() => HW.state.flags.truant_available && !HW.scripts.blocking, 150);
    return pt.settle();
  });
  s = await snap();
  need(s.state.flags.ch6_marcus_taken && s.state.flags.roll2_done, '[ch6] roll #2; Marcus taken', brief(s));
  T.ok(!s.state.flags.roll2_answered, '[ch6] roll #2 not answered (held breath)');
  T.eq([s.checkpoint, s.objective, s.party], ['alone', 'The auditorium.', []], '[ch6] alone: checkpoint "alone", objective "The auditorium."');
  at('save slot 2 + reload + Continue');
  await saveReloadContinue(2, 'ch6_alone');
  await step('the coal chute [Not without them.]', async (H, HW, pt) => {
    await pt.cross([1, 21], 'east1');
    await H.steps(30);
    await pt.cross([17, 3], 'basement');
    await pt.go('coal_chute'); H.face('up');
    H.choiceQueue = [1];
    await H.interact(); await pt.settle();
    return pt.cross([16, 3], 'east1');
  });
  s = await snap();
  T.ok(s.state.flags.chute_cut && !s.state.flags.ending && s.map === 'east1', '[ch6] the chute cut; [Not without them.]; back up');
  await step('to the lobby → Chapter VII', async (H, HW, pt) => {
    await pt.cross([1, 15], 'lobby');
    await pt.go([20, 15]);
    await HW.game.until(() => HW.state.chapter === 7 && HW.state.flags.ch7_started && !HW.scripts.blocking, 120);
    return pt.settle(200);
  });
  s = await snap();
  const tr = await segTr();
  need(s.chapter === 7, '[ch6→ch7] Chapter VII', s.chapter);
  T.ok(cards(tr).includes('VII — Assembly'), '[ch6→ch7] card "VII — Assembly"', cards(tr));
  T.eq([s.checkpoint, s.objective], ['lobby', 'The auditorium.'], '[ch7] checkpoint "lobby"; objective "The auditorium."');
  T.eq(choices(tr).filter((c) => c !== 'Grab his arm.' && c !== 'Hold your breath.'), ['Sit.', 'Tell him about Philly.', 'Not without them.'], '[ch6] choices: the breather ×2, (gym, locker), the chute', choices(tr));
} };

SEG.ch7 = { limit: 600, async run() {
  await step('the auditorium doors → the house', async (H, HW, pt) => {
    await pt.use('aud_doors', 'up');
    await HW.game.until(() => HW.map?.id === 'aud', 20);
    await pt.settle();
    await pt.go([16, 31]);
    return pt.settle();
  });
  let s = await snap();
  need(s.state.flags.aud_chain_cut && s.state.flags.ch7_assembly && s.assembly, '[ch7] chain cut, key turned; the Assembly is running', brief(s));
  T.eq(s.objective, 'The front row.', '[ch7] objective "The front row."');
  const sit = (anchor, queue) => step(`sit ${anchor}`, async (H, HW, pt, a, q) => {
    if (q) H.choiceQueue = q;
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      ok = await pt.go(a, { timeout: 120 }) && pt.arrived(a);
      if (!ok) await pt.settle();
    }
    if (!HW.player.seated) { H.face('down'); await H.steps(2); HW.input.tap('confirm'); await H.steps(8); }
    await HW.game.until(() => !HW.scripts.blocking, 120); await H.steps(12);
    await HW.game.until(() => !HW.scripts.blocking, 120); await pt.settle();
    return { ok, seated: HW.player.seated?.id || null };
  }, anchor, queue || null);
  await sit('beside_leah', [1]);                              // roll #3: (Say nothing.)
  s = await snap();
  T.ok(s.state.flags.roll3_done && !s.state.flags.roll3_answered && s.state.rollAnswered === 1, '[ch7] roll call #3 not answered (still R1)');
  T.ok(s.state.flags.seen_ch7_front_leah, '[ch7] beside Leah');
  await sit('beside_danny');
  await sit('beside_marcus', [0]);                            // no page yet: [She's gone, Marcus.]
  s = await snap();
  T.ok(s.state.flags.seen_ch7_front_danny && !s.state.flags.bond_marcus, '[ch7] beside Danny; Marcus without the page (no bond)');
  T.eq(s.objective, 'The music room. Stage left.', '[ch7] objective "The music room. Stage left."');
  await step('the music room: clarinet case, mirror, phonograph, battery', async (H, HW, pt) => {
    await pt.stand('up');
    await pt.use('clarinet_case', 'left');
    await pt.use('music_mirror', 'up');
    await pt.use([9, 10], 'up');
    return pt.use([4, 6], 'up');
  });
  s = await snap();
  T.ok((s.state.inv.diary_page || 0) === 1 && s.checkpoint === 'music room', "[ch7] Denise's diary page; checkpoint 'music room'");
  await sit('beside_marcus');
  s = await snap();
  need(s.state.flags.bond_marcus, '[ch7] the page → bond_marcus', brief(s));
  await step('the trap room: the lever, the stage door', async (H, HW, pt) => {
    await pt.stand('up');
    await pt.use([36, 4], 'up');
    if (!HW.state.flags.trapdoor_open) { H.face('up'); await H.interact(); await pt.settle(); }
    return pt.use([41, 4], 'right');
  });
  s = await snap();
  need(s.state.flags.trapdoor_open, '[ch7] trapdoor open (the Charter: no choice)', brief(s));
  T.ok(s.state.flags.stage_door_open, '[ch7] stage door unbarred');
  await step('the trapdoor [Go down.] → Chapter VIII', async (H, HW, pt) => {
    H.choiceQueue = [0];
    await pt.go([37, 8]);
    await HW.game.until(() => HW.map?.id === 'vault' && HW.state.chapter === 8 && !HW.scripts.blocking, 90);
    return pt.settle(200);
  });
  s = await snap();
  const tr = await segTr();
  need(s.map === 'vault' && s.chapter === 8, '[ch7→ch8] under the stage, Chapter VIII', { map: s.map, ch: s.chapter });
  T.ok(cards(tr).includes('VIII — The Register'), '[ch7→ch8] card "VIII — The Register"', cards(tr));
  T.eq(s.objective, 'Under the stage. Go down.', '[ch8] objective "Under the stage. Go down."');
  const ch7c = choices(tr).filter((c, i, a) => c !== a[i - 1]);
  T.eq(ch7c, ['(Say nothing.)', "She's gone, Marcus.", 'Go down.'], '[ch7] choices: roll #3 silent, Marcus without the page, the trapdoor', choices(tr));
  const marcusNoPage = tr.filter((x) => x.type === 'choice' && x.text === "She's gone, Marcus.").length;
  if (marcusNoPage > 1) findings.push({ seg: 'ch7', what: `the no-page Marcus scene (with its choice) played ${marcusNoPage}× in full — each sit beside him, including ducking into that seat during a scan`, where: null });
  T.eq(gameovers(tr), [], '[ch7] the Assembly crossed without being caught (god off)');
} };

SEG.ch8 = { limit: 700, async run() {
  await step('the last roll', (H, HW, pt) => pt.go([16, 5]).then(() => pt.settle()));
  let s = await snap();
  const model = await pg((H, HW) => HW.endings.buildRegisterModel(HW.state).lines.map((l) => `${l.id}:${l.ink}`));
  T.eq(model, ['danny:ink', 'leah:pencil', 'marcus:pencil', 'tess:pencil'], '[ch8] the last roll: Danny says present (ink); Leah, Marcus in pencil; Tess listed in pencil (R1)');
  T.eq(s.objective, 'Down. The iron stair.', '[ch8] objective "Down. The iron stair."');
  await step('the spiral → the vault', async (H, HW, pt) => {
    await pt.go([4, 6]);
    await HW.game.until(() => !HW.game.transferring, 20); await H.steps(4);
    await pt.go([14, 30], { timeout: 200 });
    return pt.settle();
  });
  s = await snap();
  T.eq([s.checkpoint, s.objective], ['vault', 'Miss Adair. The desk.'], "[ch8] the vault: checkpoint 'vault'; objective \"Miss Adair. The desk.\"");
  await step('the tomb, Miss Adair (the red pen)', async (H, HW, pt) => {
    await pt.use('sarcophagus', 'up');
    return pt.use('adair', 'up');
  });
  s = await snap();
  need((s.state.inv.red_pen || 0) === 1, '[ch8] the red pen', brief(s));
  T.eq(s.objective, 'Down. The breaker.', '[ch8] objective "Down. The breaker."');
  await step('the breaker, the climb, the office', async (H, HW, pt) => {
    await pt.cross([32, 34], 'breaker');
    await pt.go([7, 39]); await pt.settle();
    await pt.go([29, 12], { timeout: 240 });
    await HW.game.until(() => HW.breaker.lit >= 17, 20);
    await pt.go([29, 8]);
    return pt.settle();
  });
  s = await snap();
  T.eq([s.checkpoint, s.objective], ['office', 'The book.'], "[ch8] the weigh-master's office: checkpoint 'office'; objective \"The book.\"");
  at('save slot 3 + reload + Continue');
  await saveReloadContinue(3, 'ch8_office');
  await step('the Register → DISMISSED', async (H, HW, pt, actions) => {
    await pt.go('register');
    H.screenAnswer('register', { actions });
    H.face('up');
    await H.interact();
    await HW.game.until(() => !!HW.state.flags.register_done && !HW.scripts.blocking, 90);
    return H.steps(4);
  }, REG.dismissed);
  s = await snap();
  T.ok(s.state.flags.ending === 'dismissed' && s.state.flags.expelled && s.state.flags.form_used_on === 'danny', '[ch8] the Register: Leah, Marcus, Tess stamped; the form on Danny; the pen → DISMISSED', { ending: s.state.flags.ending, form: s.state.flags.form_used_on });
  T.eq(s.checkpoint, 'register closed', "[ch8] checkpoint 'register closed'");
  T.ok(!s.chase && s.objective === 'The auditorium.', '[ch8] no chase; objective "The auditorium."', { chase: s.chase, obj: s.objective });
  await step('down, the stage edge, the lobby, dawn', async (H, HW, pt) => {
    await pt.go([2, 39], { timeout: 200 }); await H.steps(30);
    await pt.go([1, 39]);
    await HW.game.until(() => HW.map?.id === 'aud' && !!HW.state.flags.ch8_stage_done && !HW.scripts.blocking, 240);
    await pt.settle();
    await pt.go([16, 40], { timeout: 200 });
    await HW.game.until(() => HW.map?.id === 'lobby' && !!HW.state.flags.ch8_lobby_done && !HW.scripts.blocking, 240);
    await pt.settle();
    pt.where0 = pt.where();
    H.walkTo([14, 26]);
  });
  at('the epilogue → credits → title');
  const fin = await pg((H, HW, pt) => pt.finishEnding());
  const tr = await segTr();
  T.ok(fin.credits && fin.ending === 'dismissed', '[ending] DISMISSED → the credits', fin);
  T.ok(fin.seen.includes('ending_seen_dismissed'), '[ending] ending_seen_dismissed', fin.seen);
  T.ok(fin.title, '[ending] the credits hand back to the title screen');
  console.log(`  info [ending] after the credits, "Continue" would load: ${JSON.stringify(fin.continueTo)}`);
  T.ok(cards(tr).some((c) => c.startsWith('DISMISSED')), '[ending] the DISMISSED stamp card', cards(tr));
  T.ok(cards(tr).includes('EPILOGUE'), '[ending] the EPILOGUE card', cards(tr));
  T.ok(said(tr, /^Side A\. \{p\} Track one\.$/, 'leah') && !said(tr, /^Monday\.$/, 'tess'), '[ending] "Side A. Track one."; the form was used → no "Monday."');
  T.ok(said(tr, /^You'll call\.$/, 'marcus') && said(tr, /^Since AUGUST\?$/, 'danny'), '[ending] the dawn-steps confession with all three');
  T.eq(gameovers(tr), [], '[ch8] no game over');
} };

/** Title → Load slot → play a branch to its ending → credits → title. */
async function branch(id, slot, body) {
  at(`title → Load slot ${slot}`);
  const where = await titleLoad(slot);
  const ref = readSnapshot(`saved-slot${slot}`);
  const now = await pg((H, HW) => ({ s: JSON.parse(JSON.stringify(HW.state)), p: H.player() }));
  if (ref) {
    const d = diffState(ref.s, now.s);
    T.ok(d.length === 0, `[${id}] Load slot ${slot} restores the game that was saved`, d);
    T.ok(Math.hypot(ref.p.x - now.p.x, ref.p.y - now.p.y) <= 2, `[${id}] position restored`, { ref: ref.p, now: now.p });
  }
  T.eq(where.mode, 'play', `[${id}] in control after Load`);
  await body();
  at('the epilogue → credits → title');
  const fin = await pg((H, HW, pt) => pt.finishEnding());
  const tr = await segTr();
  T.ok(fin.credits && fin.ending === id, `[ending] ${id.toUpperCase()} → the credits`, fin);
  T.ok(fin.seen.includes(`ending_seen_${id}`), `[ending] ending_seen_${id}`, fin.seen);
  T.ok(fin.title, `[ending] ${id}: the credits hand back to the title screen`);
  console.log(`  info [ending] after the credits, "Continue" would load: ${JSON.stringify(fin.continueTo)}`);
  T.ok(cards(tr).some((c) => c.startsWith(id.toUpperCase())), `[ending] the ${id.toUpperCase()} stamp card`, cards(tr));
  return tr;
}

SEG.truant = { limit: 400, branch: true, async run() {
  const tr = await branch('truant', 2, async () => {
    await step('east1 → basement → the coal chute [Climb out.]', async (H, HW, pt) => {
      await pt.cross([1, 21], 'east1');
      await pt.cross([17, 3], 'basement');
      await pt.go('coal_chute'); H.face('up');
      H.choiceQueue = [0];
      await H.steps(2);
      HW.input.tap('confirm');
      await HW.game.until(() => HW.game.mode === 'ending', 60);
    });
  });
  T.eq(choices(tr), ['Climb out.'], '[truant] [Climb out.]');
} };

SEG.withdrawn = { limit: 600, branch: true, async run() {
  const tr = await branch('withdrawn', 3, async () => {
    await step('the Register (stamps + the form, no pen) → "Run."', async (H, HW, pt, actions) => {
      await pt.go('register');
      H.screenAnswer('register', { actions });
      H.face('up');
      await H.steps(2);
      HW.input.tap('confirm');
      await HW.game.until(() => !!HW.state.flags.register_done, 30);
      // "Run." — the moment she can move, she runs for the stairs down
      await HW.game.until(() => HW.game.controllable && !HW.scripts.blocking, 90);
      H.walkTo([1, 39], { run: true, timeout: 200 });
    }, REG.withdrawn);
    const s = await snap();
    T.ok(s.state.flags.ending === 'withdrawn' && s.chase === 'escape', '[withdrawn] → WITHDRAWN; the escape chase', { e: s.state.flags.ending, chase: s.chase });
    await escape('withdrawn');
  });
  T.ok(said(tr, /^WHO IS OUT OF THEIR SEAT\.$/), '[withdrawn] "WHO IS OUT OF THEIR SEAT."');
  T.ok(gameovers(tr).length <= 1, `[withdrawn] running from "Run." on, the escape is survivable (${gameovers(tr).length} catches)`, gameovers(tr));
} };

SEG.present = { limit: 600, branch: true, async run() {
  const tr = await branch('present', 3, async () => {
    await step('the Register (stamps on Leah + Marcus, the form on Danny; Tess stays)', async (H, HW, pt, actions) => {
      await pt.go('register');
      H.screenAnswer('register', { actions });
      H.face('up');
      await H.interact();
      await HW.game.until(() => !!HW.state.flags.register_done && !HW.scripts.blocking, 90);
      return H.steps(4);
    }, REG.present);
    const s = await snap();
    T.ok(s.state.flags.ending === 'present' && s.chase === 'escape', '[present] → PRESENT with the escape (cannot catch)', { e: s.state.flags.ending, chase: s.chase });
    await escape('present');
  });
  T.ok(said(tr, /^Nobody gets left behind\.$/, 'tess'), '[present] "Nobody gets left behind."');
  T.eq(gameovers(tr), [], '[present] never caught');
} };

/** The escape: breaker → vault → spiral → auditorium → lobby → out (or the vestibule). Retries after a catch. */
async function escape(kind) {
  let deaths = 0;
  for (let leg = 0; leg < 14; leg++) {
    const r = await step(`escape leg ${leg}`, async (H, HW, pt, kind) => {
      const n0 = pt.tr.filter((x) => x.type === 'gameover').length;
      const m = HW.map?.id;
      if (HW.game.mode === 'ending') return { done: true };
      if (m === 'breaker') await pt.go([1, 39], { run: true, timeout: 200 });
      else if (m === 'vault') {
        if (H.player().ty < 9) await pt.go([32, 2], { run: true, timeout: 200 });
        else { await pt.go([3, 10], { run: true, timeout: 200 }); await HW.game.until(() => !HW.game.transferring, 20); }
      } else if (m === 'aud') {
        await HW.game.until(() => !!HW.state.flags.seen_ch8_escape_aud && !HW.scripts.blocking, 60);
        await pt.settle();
        await pt.go([16, 40], { run: true, timeout: 200 });
      } else if (m === 'lobby') {
        await pt.settle();
        if (kind === 'present') H.walkTo([15, 23], { run: true, timeout: 60 });
        else H.walkTo([14, 26], { run: true, timeout: 120 });
        await HW.game.until(() => HW.game.mode === 'ending' || HW.map?.id !== 'lobby' || pt.tr.filter((x) => x.type === 'gameover').length > n0, 120);
      } else if (m === 'exterior') {
        await HW.game.until(() => HW.game.mode === 'ending', 120);
      }
      await H.steps(4);
      return { done: HW.game.mode === 'ending', caught: pt.tr.filter((x) => x.type === 'gameover').length > n0, map: HW.map?.id, where: pt.where() };
    }, kind);
    if (r.caught) { deaths++; findings.push({ seg: kind, what: `caught in the escape (${r.where?.map}), retried from ${r.where?.checkpoint}`, where: r.where }); await step('settle after the retry', (H, HW, pt) => pt.settle()); }
    if (r.done) break;
  }
  if (kind === 'present') T.eq(deaths, 0, '[present] the escape cannot catch');
  else T.ok(deaths <= 2, `[withdrawn] the escape is survivable running (${deaths} catches)`);
}

// ================================================================================================ driver
const MAIN = ['title', 'pro', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8'];
const BRANCHES = ['truant', 'withdrawn', 'present'];
const ALL = [...MAIN, ...BRANCHES];
for (const id of ONLY) if (!ALL.includes(id)) { console.error(`unknown segment "${id}" (segments: ${ALL.join(' ')})`); process.exit(2); }

function writeSnapshot(name, data) { try { fs.writeFileSync(path.join(CACHE, `${name}.json`), JSON.stringify(data)); } catch { /* best effort */ } }
function readSnapshot(name) { try { return JSON.parse(fs.readFileSync(path.join(CACHE, `${name}.json`), 'utf8')); } catch { return null; } }

/** Resume a segment from the snapshot a full run wrote at its start (--only). */
async function resume(id) {
  const snapData = readSnapshot(id);
  if (!snapData) return false;
  await pg((H, HW, pt, st) => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }, snapData.storage);
  if (MAIN.includes(id) && id !== 'title') {
    if (!snapData.state) return false;
    await pg(async (H, HW, pt, st, s) => {
      localStorage.setItem('hallowell.save.__pt', JSON.stringify({ v: 1, summary: null, state: st }));
      H.autoAdvance(true); pt.setScale(s); H.god(false);
      HW.game.loadSave('__pt');
      localStorage.removeItem('hallowell.save.__pt');
      await pt.settle(60);
    }, snapData.state, SCALE);
  } else await reloadPage();
  console.log(`  (resumed "${id}" from ${path.join(CACHE, `${id}.json`)})`);
  return true;
}

let failedMain = null;
let lastObjective = null;
async function runSegment(id) {
  const seg = SEG[id];
  const t0 = Date.now();
  cur = { id, at: 'start' };
  console.log(`\n--- ${id} ---`);
  await pg((H, HW, pt) => { pt.tr = []; pt.walkFails = []; pt.covers = []; pt.notes = []; pt.doorIssues = []; }).catch(() => {});
  carry = { tr: [], walkFails: [], covers: [], notes: [], doorIssues: [], catchTraces: [] };
  if (seg.branch) lastObjective = null;
  if (seg.branch || id === 'title') writeSnapshot(id, { storage: (await pg((H, HW, pt) => pt.snapshot())).storage });
  else writeSnapshot(id, await pg((H, HW, pt) => pt.snapshot()));
  let timer;
  const deadline = new Promise((_, rej) => { timer = setTimeout(() => rej(new SegTimeout(`segment "${id}" exceeded ${seg.limit} s`)), seg.limit * 1000); });
  let ok = true;
  try {
    await Promise.race([seg.run(), deadline]);
  } catch (e) {
    ok = false;
    const w = await pg((H, HW, pt) => pt.where()).catch((er) => ({ error: String(er) }));
    const msg = e instanceof SegTimeout ? `TIMEOUT — ${e.message}` : `threw: ${e?.stack || e}`;
    T.ok(false, `[${id}] ${msg} — stuck at "${cur.at}"`, w);
    await shot(`STUCK_${id}`).catch(() => {});
    await reloadPage().catch(() => {});
  } finally { clearTimeout(timer); }
  // per-segment report: errors, stuck walks, cover taken, notes
  const errs = await newErrors();
  T.eq(errs, [], `[${id}] zero captured errors`);
  // Chromium's own perf hint (fx_post's per-frame readback while distort/chroma/VHS run) is not a game warning.
  const warns = [...new Set(warnings.splice(0))].filter((w) => !/willReadFrequently/.test(w));
  T.eq(warns, [], `[${id}] no console warnings or failed requests`);
  await stash();
  const info = await pg((H, HW, pt) => ({ battery: Math.round(HW.state?.battery ?? -1), playtime: Math.round(HW.state?.playtime || 0) })).catch(() => null);
  if (info) {
    Object.assign(info, { walkFails: carry.walkFails, covers: carry.covers.map((c) => ({ kind: c.kind, seat: c.seat, map: c.map, tile: c.at?.tile, sec: c.sec, failed: !!c.failed })), notes: carry.notes });
    // the same objective set twice in a row = a second "Sketchbook updated" notice with nothing new on it
    let prevObj = lastObjective;
    for (const x of carry.tr) {
      if (x.type !== 'objective') continue;
      if (x.text && x.text === prevObj) findings.push({ seg: id, what: `objective "${x.text}" set again (a second "Sketchbook updated" notice with the same text)`, where: { map: x.map } });
      prevObj = x.text;
    }
    lastObjective = prevObj;
    for (const c of carry.catchTraces) {
      findings.push({ seg: id, what: `caught (${c.reason}); the last seconds: ${c.trace.slice(-16).map((x) => `${x.t}s ${x.map}${JSON.stringify(x.tile)} ${x.seated ? `seated ${x.seated}` : x.moving ? 'walking' : 'standing'} ${x.phase}${x.view === null ? '' : x.view ? ' in-view' : ' hidden'} det ${x.det}`).join(' | ')}`, where: c.trace.at(-1) });
    }
    for (const d of carry.doorIssues) findings.push({ seg: id, what: `walking into the open door ${d.id} did not go through; prompt ${JSON.stringify(d.prompt)}; confirm ${d.confirmed ? 'did' : 'did not'}`, where: d.at });
    for (const f of info.walkFails) findings.push({ seg: id, what: `walk to ${JSON.stringify(f.target)} needed a retry (attempt ${f.attempt + 1})`, where: f.at });
    if (info.covers.length) console.log(`  info [${id}] took cover ${info.covers.length}×: ${info.covers.map((c) => `${c.kind}@${c.map}${JSON.stringify(c.tile)}:${c.seat || 'NO SEAT'}(${c.sec}s)`).join(', ')}`);
    for (const c of info.covers.filter((x) => x.failed)) findings.push({ seg: id, what: `no seat found to take cover (${c.kind})`, where: c });
    for (const n of info.notes) console.log(`  note [${id}] ${n}`);
    console.log(`  info [${id}] battery ${info.battery}% · game clock ${Math.floor(info.playtime / 60)}:${String(info.playtime % 60).padStart(2, '0')}`);
  }
  try {
    const lines = carry.tr.filter((x) => ['say', 'think', 'narrate', 'choice', 'objective', 'checkpoint', 'card', 'doc', 'transfer', 'trigger', 'gameover', 'ending', 'screen', 'cg'].includes(x.type))
      .map((x) => `${String(x.t ?? '').padStart(7)} ${(x.map || '').padEnd(9)} ${x.type.padEnd(10)} ${(x.who || '').padEnd(7)} ${x.text}`);
    fs.writeFileSync(path.join(OUT, `transcript_${id}.txt`), `${lines.join('\n')}\n`);
  } catch { /* best effort */ }
  const sec = (Date.now() - t0) / 1000;
  timing.push({ id, sec, ok });
  return ok;
}

await openPage();
const t0 = Date.now();
const want = ONLY.length ? ONLY : ALL;
let resumed = false;
for (const id of ALL) {
  if (!want.includes(id)) {
    // --only: play the prerequisites unless a snapshot lets us start right at the wanted segment
    const firstWanted = ALL.find((x) => want.includes(x));
    if (ALL.indexOf(id) > ALL.indexOf(firstWanted) || resumed) continue;
    if (readSnapshot(firstWanted)) { resumed = await resume(firstWanted); if (resumed) continue; }
    if (BRANCHES.includes(firstWanted) && BRANCHES.includes(id)) continue;
  }
  if (MAIN.includes(id) && failedMain) { T.ok(false, `[${id}] skipped: "${failedMain}" failed earlier in the main run`); continue; }
  if (BRANCHES.includes(id)) {
    const slot = id === 'truant' ? 2 : 3;
    const have = await pg((H, HW, pt, k) => !!localStorage.getItem(k), `hallowell.save.${slot}`);
    if (!have) { T.ok(false, `[${id}] skipped: slot ${slot} was never saved`); continue; }
    const mode = await pg((H, HW) => HW.game.mode);
    if (mode !== 'title') await reloadPage();
  }
  const ok = await runSegment(id);
  if (!ok && MAIN.includes(id)) failedMain = id;
  // keep what each manual slot held when it was written (branches compare against it after Load)
  if (ok && ['ch3', 'ch6', 'ch8'].includes(id)) {
    const slot = { ch3: 1, ch6: 2, ch8: 3 }[id];
    const raw = await pg((H, HW, pt, k) => localStorage.getItem(k), `hallowell.save.${slot}`);
    if (raw) { const d = JSON.parse(raw); writeSnapshot(`saved-slot${slot}`, { s: d.state, p: { x: d.state.px, y: d.state.py, map: d.state.map } }); }
  }
}
const total = (Date.now() - t0) / 1000;

// ---- report ----------------------------------------------------------------------------------------------
console.log('\n=== timing ===');
for (const t of timing) console.log(`  ${t.ok ? 'ok  ' : 'FAIL'} ${t.id.padEnd(10)} ${t.sec.toFixed(1).padStart(7)} s`);
console.log(`  total ${total.toFixed(1)} s (${(total / 60).toFixed(1)} min) at timeScale ${SCALE}${BUILT ? ' — built' : ' — dev'}`);
console.log(`\n=== screenshots (${shots.length}) in ${OUT} ===`);
for (const s of shots) console.log(`  ${path.basename(s.file)}`);
if (findings.length) {
  console.log(`\n=== things a player would notice (${findings.length}) ===`);
  for (const f of findings) console.log(`  [${f.seg}] ${f.what} @ ${JSON.stringify(f.where && { map: f.where.map, tile: f.where.tile, objective: f.where.objective })}`);
}
clearInterval(shotTimer);
await game.close();
await browser.close();
process.exit(T.done() ? 0 : 1);
