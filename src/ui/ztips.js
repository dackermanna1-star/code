// Zombie survival first-run tips: short contextual hints during a player's first runs
// (buying in the break, F1 ready, E to revive, the upgrades page, V for C4, specials, the shove).
// Each tip shows once, the whole thing stops after TIP_RUNS runs, H dismisses the one on
// screen, and the setup screen's "First-run tips" toggle turns them off (or back on, from
// the start). Remembered in localStorage. A DOM card on the left of the game view.
//
//   const tips = new ZTips(game, { root: menus.root, input, viewport: () => renderer.viewport });
//   per frame in game: tips.frame(dt);  tips.enabled / tips.setEnabled(on)
const KEY = 'cs16-zm-tips';
export const TIP_RUNS = 3; // tips run during this many runs
const SHOW = 9; // s on screen
const BREAK_TIPS = new Set(['buy', 'ready']); // about the break: gone once it's over (not 'buySandbox': Sandbox buys any time)

export const TIPS = {
  buy: 'Press <kbd>B</kbd> to buy. Shop in the break between waves: cash is scarce, so earn your guns one kill at a time.',
  buySandbox: 'Sandbox: buy anything, anywhere, any time. Press <kbd>B</kbd>.',
  ready: 'Ready early? Press <kbd>F1</kbd> and the next wave comes sooner once the squad is ready.',
  special: 'Special infected! They hit harder and pay far more than the rest. Take them down first.',
  revive: '{name} is down! Stand over them and hold <kbd>E</kbd> to pick them up before they bleed out.',
  downed: "You're down. Keep shooting with your pistol; a teammate can pick you up.",
  attach: 'Wave cleared. Buy menu page <kbd>9</kbd>, Upgrades &amp; Skins: scopes, bigger mags and more for the gun in your hands.',
  c4: 'Remote C4: throw it (it sticks to zombies too), then press <kbd>V</kbd> to set it off. Stand clear.',
  medkit: 'Medkit: <kbd>5</kbd> takes it out, fire heals you, right-click heals the teammate in front of you.',
  shove: 'Too close? Press <kbd>{shove}</kbd> or Mouse 4 to shove: it knocks them back and pulls a grabbed teammate free. Spamming it tires you.',
};
const SHOVE_NEAR = 90; // u: a zombie this close in a wave brings up the shove tip

const load = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v === 'object') return { runs: v.runs | 0, seen: v.seen || {}, off: !!v.off }; } catch { /* ignore */ }
  return { runs: 0, seen: {}, off: false };
};

export class ZTips {
  constructor(game, { root, input, viewport } = {}) {
    this.game = game;
    this.viewport = viewport || (() => null);
    this.input = input || null;
    this.s = load();
    this.live = false; // tips are running this run
    this.queue = [];
    this.cur = null; // { id, t }
    this.runT = 0;
    this.el = document.createElement('div');
    this.el.className = 'fe-tip';
    this.el.innerHTML = '<div class="h">Tip<span><kbd>H</kbd> got it</span></div><div class="b"></div><div class="bar"></div>';
    this.body = this.el.querySelector('.b');
    this.bar = this.el.querySelector('.bar');
    this.el.hidden = true;
    root?.appendChild(this.el);
    const E = game.zombies?.events;
    if (E) {
      E.on('run', (e) => this.onRun(e));
      E.on('wave', (e) => { if (e.phase === 'cleared' && e.wave === 1) this.want('attach'); });
      E.on('buy', (e) => {
        if (e.player !== game.local) return;
        if (e.item === 'remotec4') this.want('c4');
        else if (e.item === 'medkit') this.want('medkit');
      });
      E.on('special', (e) => { if (e.phase === 'spawn') this.want('special'); });
      E.on('down', (e) => {
        if (e.player === game.local) this.want('downed', null, true);
        else if (e.player) this.want('revive', e.player.name, true);
      });
    }
    input?.onCommand?.((cmd, pressed, code) => {
      if (pressed && code === 'KeyH' && this.cur && !cmd) { this.dismiss(); return true; }
      return false;
    });
  }

  /** Tips will show in the next run (on, and not used up yet). */
  get enabled() { return !this.s.off && this.s.runs < TIP_RUNS; }

  /** The setup screen's toggle. Turning tips back on starts them over. */
  setEnabled(on) {
    on = !!on;
    if (on === this.enabled) return;
    this.s = on ? { runs: 0, seen: {}, off: false } : { ...this.s, off: true };
    if (!on) this.hide();
    this.save();
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* private mode */ } }

  onRun(e) {
    if (e.phase !== 'start') { this.live = false; this.hide(); return; }
    this.queue.length = 0;
    this.hide();
    this.runT = 0;
    this.live = this.enabled && !!this.game.zombies?.enabled;
    if (this.live) { this.s.runs++; this.save(); }
  }

  /** Ask for a tip (shown once ever; urgent ones jump the queue and replace the current). */
  want(id, arg = null, urgent = false) {
    if (!this.live || this.s.seen[id] || this.queue.some((q) => q.id === id) || this.cur?.id === id) return;
    const q = { id, arg };
    if (urgent) { this.queue.unshift(q); if (this.cur) this.hide(true); } else this.queue.push(q);
  }

  dismiss() { this.hide(true); }

  hide(markSeen = false) {
    if (this.cur && markSeen) { this.s.seen[this.cur.id] = 1; this.save(); }
    this.cur = null;
    this.el.classList.remove('show');
    this.el.hidden = true;
  }

  frame(dt) {
    const g = this.game, Z = g.zombies;
    if (!this.live || !Z?.enabled) { if (this.cur) this.hide(); return; }
    this.runT += dt;
    // the first break: buying, then ready-up (with time left in the break to act on them)
    const left = Z.state === 'break' ? Z.nextWaveAt - g.time : 0;
    if (Z.wave === 0 && this.runT > 2.5 && left > 5) this.want(Z.diff?.sandbox ? 'buySandbox' : 'buy');
    if ((this.s.seen.buy || this.s.seen.buySandbox) && left > 5) this.want('ready');
    // the shove: a teammate grabbed (or you, on a smoker's tongue: pinned flat you can't), or the
    // first zombie in your face
    if (Z.state === 'wave' && !this.s.seen.shove && (this.nearT = (this.nearT || 0) + dt) > 0.25) {
      this.nearT = 0;
      const me = g.local;
      if (me?.alive && !me.downed) {
        let grab = false, near = false;
        for (const p of g.players) if (p.alive && !p.isZombie && p.team === me.team && (p.tonguedBy || (p.pinnedBy && p !== me))) { grab = true; break; }
        if (!grab) for (const z of Z.pool) if (z.alive && Math.hypot(z.pm.origin[0] - me.pm.origin[0], z.pm.origin[1] - me.pm.origin[1]) < SHOVE_NEAR) { near = true; break; }
        if (grab || near) this.want('shove', null, grab);
      }
    }
    // the break is over (a ready-up can cut it short): its tips go, to come back another run
    if (Z.state !== 'break') {
      for (let i = this.queue.length - 1; i >= 0; i--) if (BREAK_TIPS.has(this.queue[i].id)) this.queue.splice(i, 1);
      if (this.cur && BREAK_TIPS.has(this.cur.id)) this.hide();
    }
    if (!this.cur && this.queue.length && !g.menus?.isOpen?.()) this.show(this.queue.shift());
    if (!this.cur) return;
    // (not over menus or the scoreboard, nor over a wave type's banner or a front's arrow on the
    // left: director.js; its clock waits meanwhile)
    this.el.hidden = !!g.menus?.isOpen?.() || !!g.menus?.score || !!g.bulletCam?.active || !!Z.director?.bannerOn?.() || !!Z.director?.arrowLeft?.();
    if (!this.el.hidden) this.cur.t += dt;
    this.bar.style.width = Math.max(0, 100 - (100 * this.cur.t) / SHOW).toFixed(1) + '%';
    if (this.cur.t > SHOW) this.hide(true);
  }

  /** The key bound to the shove besides Mouse 4 (the Options shove key), for the tip. */
  shoveKey() {
    const b = this.input?.binds || {};
    for (const code in b) if (b[code] === 'shove' && code !== 'MOUSE4') return code.replace(/^Key|^Digit/, '');
    return 'T';
  }

  show(q) {
    this.cur = { id: q.id, t: 0 };
    const name = q.arg ? String(q.arg).replace(/[&<>"']/g, '') : 'A teammate';
    this.body.innerHTML = TIPS[q.id].replace('{name}', name).replace('{shove}', this.shoveKey());
    const vp = this.viewport();
    if (vp) Object.assign(this.el.style, { left: vp.x + Math.round(vp.w * 0.02) + 'px', top: vp.y + Math.round(vp.h * 0.21) + 'px' });
    this.el.hidden = false;
    void this.el.offsetWidth; // (restart the slide-in)
    this.el.classList.add('show');
  }
}
