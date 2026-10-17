// Script runner and the script context `g` (TECH §6, §6.1).
//
// Scripts are async functions `(g, ctx) => {}` registered in src/data/scripts/*. A blocking script
// puts the game into `cutscene` mode until every blocking script has finished. Loading a save,
// returning to the title or a game over aborts all running scripts: each run gets its own `g`
// bound to the runner generation, and any g call after an abort throws ScriptAbort (swallowed by
// the runner), so stale scripts unwind instead of acting on the new game.
import HW from './hw.js';
import { ITEMS } from '../data/items.js';
import { resolveExamine } from './examine.js';
import { resolvePoint, dirFromVec, DIR_VEC, WALK_SPEED, RUN_SPEED } from './entities.js';
import { splitChapterTitle } from './state.js';

export class ScriptAbort extends Error {
  constructor() {
    super('script aborted');
    this.name = 'ScriptAbort';
  }
}

/** Portrait grime by chapter (DESIGN §13: grime level 0–2 across the night). */
export const grimeFor = (chapter) => (chapter <= 2 ? 0 : chapter <= 5 ? 1 : 2);

/** Await a promise but give up after `sec` + slack seconds of real time (never hang a script). */
function withTimeout(p, sec) {
  if (!p || typeof p.then !== 'function') return Promise.resolve(p);
  return Promise.race([p, new Promise((r) => setTimeout(r, Math.max(0, sec) * 1000 + 1500))]);
}

export const scripts = {
  /** Abort generation; bumped by abortAll(). */
  gen: 0,
  /** Number of blocking scripts running (> 0 ⇒ cutscene). */
  blocking: 0,
  /** Number of scripts running (blocking or not). */
  active: 0,
  timers: [],

  get(id) {
    return HW.data?.scripts?.[id] || null;
  },

  has(id) {
    return !!this.get(id);
  },

  /** Run a registered script. Resolves with its return value (undefined if aborted/failed). */
  run(id, ctx = {}, { blocking = true } = {}) {
    const fn = this.get(id);
    if (!fn) {
      console.warn(`[scripts] unknown script '${id}'`);
      return Promise.resolve();
    }
    return this.runFn(fn, ctx, { blocking, id });
  },

  /** Run an ad-hoc async function as a script. */
  async runFn(fn, ctx = {}, { blocking = true, id = '(inline)' } = {}) {
    const gen = this.gen;
    const g = makeG(gen, ctx || {}, id);
    this.active++;
    if (blocking) this._enterBlocking();
    try {
      return await fn(g, ctx || {});
    } catch (e) {
      if (!(e instanceof ScriptAbort)) console.error(`[script ${id}] failed:`, e);
      return undefined;
    } finally {
      if (gen === this.gen) {
        this.active--;
        if (blocking) this._exitBlocking();
      }
    }
  },

  _enterBlocking() {
    this.blocking++;
    if (this.blocking === 1) HW.game?.onCutscene?.(true);
  },

  _exitBlocking() {
    this.blocking = Math.max(0, this.blocking - 1);
    if (this.blocking === 0) HW.game?.onCutscene?.(false);
  },

  /** Game-time wait (respects pause and timeScale). */
  wait(sec, gen = this.gen) {
    if (gen !== this.gen) return Promise.reject(new ScriptAbort());
    return new Promise((resolve, reject) => {
      this.timers.push({ t: Math.max(0, sec), resolve, reject });
    });
  },

  update(dt) {
    const ts = this.timers;
    for (let i = ts.length - 1; i >= 0; i--) {
      const tm = ts[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        ts.splice(i, 1);
        tm.resolve();
      }
    }
  },

  /** Kill every running script (load, title, game over). */
  abortAll() {
    this.gen++;
    this.blocking = 0;
    this.active = 0;
    const ts = this.timers;
    this.timers = [];
    for (const tm of ts) tm.reject(new ScriptAbort());
    HW.camera?.reset?.();
  },
};

// =============================================================================================
// The `g` context. One instance per script run, closed over its generation.

function makeG(gen, ctx, scriptId) {
  const alive = () => gen === scripts.gen;
  const check = () => { if (!alive()) throw new ScriptAbort(); };
  const after = async (p) => {
    const r = await p;
    check();
    return r;
  };
  const auto = () => !!HW.debug?.autoAdvance;
  const record = (type, who, expr, text) => HW.debug?.record?.(type, who, expr, text);
  const ent = (id) => {
    const e = HW.entities?.get(id);
    if (!e) console.warn(`[script ${scriptId}] no entity '${id}'`);
    return e;
  };
  const ui = () => HW.ui || {};

  const g = {
    ctx,
    id: scriptId,
    get alive() { return alive(); },

    // ------------------------------------------------------------------ dialogue / UI
    async say(who, expr, text, opts = {}) {
      check();
      record('say', who, expr, text);
      if (auto()) return;
      const o = { light: HW.renderer?.portraitLight?.() ?? 'dark', grime: grimeFor(HW.state.chapter), ...opts };
      await after(ui().say?.(who, expr || 'neutral', text, o));
    },

    async think(expr, text) {
      check();
      record('think', 'tess', expr, text);
      if (auto()) return;
      await after(ui().think?.(expr || 'neutral', text));
    },

    async narrate(text) {
      check();
      record('narrate', null, null, text);
      if (auto()) return;
      await after(ui().narrate?.(text));
    },

    /** → index into the ORIGINAL options array (hidden options keep their indices). */
    async choice(options, opts = {}) {
      check();
      const texts = [];
      const index = [];
      options.forEach((o, i) => {
        const opt = typeof o === 'string' ? { text: o } : o;
        let ok = true;
        if (opt.cond) {
          try { ok = !!opt.cond(HW.state); } catch (e) { console.error('[script] choice cond failed', e); ok = false; }
        }
        if (ok) { texts.push(opt.text); index.push(i); }
      });
      if (!texts.length) return -1;
      let k;
      if (auto()) k = HW.debug.nextChoice();
      else k = await after(ui().choice?.(texts, opts));
      k = Number.isInteger(k) && k >= 0 && k < texts.length ? k : 0;
      record('choice', opts.who || 'tess', null, texts[k]);
      return index[k];
    },

    async doc(docId) {
      check();
      HW.state.docs[docId] = true;
      record('doc', null, null, docId);
      HW.game?.emit?.('doc', docId);
      if (auto()) return;
      await after(ui().doc?.(docId));
    },

    toast(text) {
      check();
      record('toast', null, null, text);
      ui().toast?.(text);
    },

    objective(text) {
      check();
      HW.state.objective = text;
      record('objective', null, null, text);
      ui().objective?.(text);
    },

    async card(title, subtitle, opts = {}) {
      check();
      record('card', null, null, subtitle ? `${title} — ${subtitle}` : title);
      if (auto()) return;
      await after(ui().card?.(title, subtitle, opts));
    },

    prompt(prop, verb) {
      ui().prompt?.(prop, verb);
    },

    async cg(id, opts = {}) {
      check();
      record('cg', null, null, id);
      const p = ui().cg?.(id, opts);
      if (!auto()) await after(withTimeout(p, (opts.fade ?? 1) + 3));
    },

    overlay(name, params) {
      check();
      ui().setOverlay?.(name, params ?? null);
    },

    async screen(name, args) {
      check();
      record('screen', null, null, name);
      return after(ui().open?.(name, args));
    },

    async chapter(n) {
      check();
      HW.state.chapter = n;
      HW.game.emit('chapter', n);
      const [title, sub] = splitChapterTitle(n);
      await g.card(title, sub, { hold: 2.5 });
      if (typeof HW.game.chapterSetup === 'function') await after(Promise.resolve(HW.game.chapterSetup(n)));
      HW.game.refresh();
      HW.game.checkpoint(`chapter ${n}`);
    },

    /** Show examine mini-format text (TECH §5.3). `speaker` makes untagged lines spoken by them. */
    async examine(spec, { speaker = null } = {}) {
      check();
      for (const L of resolveExamine(spec, HW.state, { speaker })) {
        if (L.kind === 'narrate') await g.narrate(L.text);
        else if (L.kind === 'say') await g.say(L.who, L.expr, L.text);
        else await g.think(L.expr, L.text);
      }
    },

    /** Party banter: each follower present with a line in `b` speaks it, in party order. */
    async banter(b) {
      check();
      if (!b) return;
      for (const id of HW.state.party) {
        if (!b[id]) continue;
        const e = HW.entities.get(id);
        if (!e || !HW.entities.followers.includes(e)) continue;
        await g.examine(b[id], { speaker: id });
      }
    },

    // ------------------------------------------------------------------ world
    get player() { return HW.player; },
    npc(id) { return HW.entities.get(id); },
    spawn(spec) { check(); return HW.entities.spawn(spec); },
    despawn(id) { check(); return HW.entities.despawn(id); },

    /** Walk an entity to an anchor | [tx,ty] | {x,y} | list of those (A* with doors). */
    async walk(id, target, { speed, run = false, ignoreSolid = false } = {}) {
      check();
      const e = ent(id);
      if (!e) return false;
      const sp = speed ?? (run ? RUN_SPEED : WALK_SPEED);
      const multi = Array.isArray(target) && target.length > 0 && typeof target[0] !== 'number';
      for (const t of multi ? target : [target]) {
        const pt = resolvePoint(t);
        if (!pt) { console.warn(`[script ${scriptId}] walk: bad target`, t); continue; }
        let path = null;
        if (!ignoreSolid && HW.map) path = HW.map.findPath([e.x, e.y], [pt.x, pt.y], { doors: true, radius: e.radius || 0 });
        if (!path) path = [[pt.x, pt.y]];
        const ok = await after(e.walkPath(path, { speed: sp, run }));
        if (!ok) return false;
      }
      return true;
    },

    /** Face a direction, or toward an entity id / anchor / point. */
    face(id, dir) {
      check();
      const e = ent(id);
      if (!e) return;
      if (DIR_VEC[dir]) { e.face(dir); return; }
      const pt = resolvePoint(typeof dir === 'string' && HW.entities.get(dir) ? `@${dir}` : dir);
      if (pt) e.face(dirFromVec(pt.x - e.x, pt.y - e.y, e.dir));
    },

    /** Animation override; { once } resolves when done; name null clears. */
    anim(id, name, opts = {}) {
      check();
      const e = ent(id);
      if (!e) return Promise.resolve();
      if (!name) { e.clearAnim(); return Promise.resolve(); }
      return after(e.playAnim(name, opts));
    },

    setPos(id, target) {
      check();
      const e = ent(id);
      const pt = resolvePoint(target);
      if (!e || !pt) return;
      e.stopPath(false);
      e.x = pt.x;
      e.y = pt.y;
      if (pt.dir) e.face(pt.dir);
      if (e === HW.player) HW.entities.onPlayerMoved();
    },

    party: {
      add(id) {
        check();
        const p = HW.state.party;
        if (!p.includes(id)) p.push(id);
        HW.entities.syncParty();
      },
      remove(id) {
        check();
        HW.state.party = HW.state.party.filter((x) => x !== id);
        HW.entities.syncParty();
      },
      has(id) { return HW.state.party.includes(id); },
    },

    async transfer(mapId, anchor, opts = {}) {
      check();
      const fade = opts.fade !== false;
      await after(HW.game.transfer(mapId, anchor, { ...opts, fade, scripted: true }));
    },

    prop(id) { return HW.map?.prop(id) || null; },
    setProp(id, state, params) { check(); return HW.game.setProp(id, state, params); },
    removeProp(id) { check(); return HW.game.removeProp(id); },
    refresh() { check(); HW.game.refresh(); },

    /** Camera: anchor | entity id | [tx,ty] | null (back to the player). */
    async cam(target, { time = 1 } = {}) {
      check();
      await after(HW.camera.pan(target ?? null, { time: auto() ? 0 : time }));
    },

    async wait(sec) {
      check();
      await after(scripts.wait(auto() ? Math.min(sec, 0.02) : sec, gen));
    },

    async fade(dir, sec = 0.6, color = '#000') {
      check();
      const d = auto() ? 0.01 : sec;
      await after(withTimeout(HW.fx?.fade?.(dir, d, color), d));
    },

    flash(color, sec) { check(); HW.fx?.flash?.(color, sec); },
    shake(intensity, sec) { check(); HW.fx?.shake?.(intensity, sec); },

    /** Forward to HW.fx[name](...args). */
    fx(name, ...args) {
      check();
      const f = HW.fx?.[name];
      if (typeof f === 'function') return f.apply(HW.fx, args);
      console.warn(`[script ${scriptId}] no fx '${name}'`);
      return undefined;
    },

    lights(group, on) { check(); HW.lighting?.setGroup?.(group, on); },

    lightning() {
      check();
      HW.lighting?.lightning?.(1);
      HW.audio?.sfx?.('lightning');
    },

    /** true = force on (even in cutscenes) · false = force off · 'restore' = player-controlled. */
    flashlight(mode) { check(); HW.flashlight?.force?.(mode); },

    // ------------------------------------------------------------------ state
    flag(name) { return HW.state.flags[name]; },
    set(name, value = true) { check(); setFlag(name, value); },
    inc(name, n = 1) {
      check();
      const v = (Number(HW.state.flags[name]) || 0) + n;
      setFlag(name, v);
      return v;
    },
    get state() { return HW.state; },

    has(item, n = 1) { return (HW.state.inv[item] || 0) >= n; },
    give(item, n = 1, { silent = false } = {}) { check(); giveItem(item, n, silent); },
    take(item, n = 1) { check(); return takeItem(item, n); },
    checkpoint(label) { check(); HW.game.checkpoint(label); },

    // ------------------------------------------------------------------ audio
    sfx(id, opts) { return HW.audio?.sfx?.(id, opts) || NULL_HANDLE; },
    loop(id, opts) { return HW.audio?.loop?.(id, opts) || NULL_HANDLE; },
    ambience(id, fade) { HW.audio?.ambience?.(id, fade); return Promise.resolve(); },
    music(id, fade) { HW.audio?.music?.(id, fade); return Promise.resolve(); },
    silence(on, fade) { HW.audio?.silence?.(on, fade); },

    // ------------------------------------------------------------------ encounters
    get periods() { return HW.periods; },
    get colonel() { return HW.colonel; },

    /** Game over screen → reload checkpoint. Never resolves (unless god mode suppresses it). */
    async gameOver(reason = 'caught') {
      check();
      if (HW.debug?.god) {
        record('gameover', null, null, `${reason} (suppressed: god mode)`);
        return;
      }
      HW.game.gameOver(reason);
      await new Promise(() => {});
    },

    async ending(id) {
      check();
      await HW.game.ending(id);
      await new Promise(() => {});
    },

    // ------------------------------------------------------------------ flow
    /** Run without blocking (no dialogue inside). Returns the promise if you want to join later. */
    parallel(fn) {
      check();
      return scripts.runFn(fn, ctx, { blocking: false, id: `${scriptId}:parallel` });
    },

    /** Call another script inline (same cutscene, same g). */
    async run(id, ctx2) {
      check();
      const fn = scripts.get(id);
      if (!fn) { console.warn(`[script ${scriptId}] run: unknown script '${id}'`); return undefined; }
      return fn(g, ctx2 ?? ctx);
    },
  };
  return g;
}

const NULL_HANDLE = Object.freeze({ stop() {}, setPos() {}, setVol() {} });

/** Set a story flag, keeping mirrored state fields in sync (TECH §13). */
export function setFlag(name, value = true) {
  const s = HW.state;
  s.flags[name] = value;
  const bond = /^bond_(danny|leah|marcus)$/.exec(name);
  if (bond) s.bonds[bond[1]] = !!value;
  if (/^roll[123]_answered$/.test(name)) {
    s.rollAnswered = ['roll1_answered', 'roll2_answered', 'roll3_answered'].filter((k) => s.flags[k]).length;
  }
  HW.game?.emit?.('flag', name, value);
}

export function giveItem(item, n = 1, silent = false) {
  if (!ITEMS[item]) console.warn(`[script] give: unknown item '${item}'`);
  const inv = HW.state.inv;
  inv[item] = (inv[item] || 0) + n;
  HW.debug?.record?.('give', null, null, `${item} x${n}`);
  if (!silent) {
    const name = ITEMS[item]?.name || item;
    HW.ui?.toast?.(n > 1 ? `Got: ${name} ×${n}` : `Got: ${name}`);
    HW.audio?.sfx?.('item_get');
  }
  HW.game?.emit?.('item', item, inv[item]);
}

export function takeItem(item, n = 1) {
  const inv = HW.state.inv;
  const had = inv[item] || 0;
  if (had - n > 0) inv[item] = had - n;
  else delete inv[item];
  HW.game?.emit?.('item', item, inv[item] || 0);
  return had >= n;
}

export default scripts;
