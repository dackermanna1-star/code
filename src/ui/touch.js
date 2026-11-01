// On-screen touch controls: a floating move stick on the left half, drag-to-look on the
// right half, and a thumb cluster for combat and interaction. Everything feeds the same
// Input actions as keyboard and gamepad, so gameplay code never knows the difference.
// The layer stays hidden until the first touch, and hides again on mouse or keyboard use.

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

const STICK_R = 54;          // knob travel in px
const SPRINT_AT = 1.4;       // drag past this many radii to sprint
const FOLLOW_AT = 2.1;       // beyond this the stick base follows the thumb
const DEAD = 0.12;
const LOOK_GAIN = 1.8;       // touch px -> mouse px equivalent

const BUTTONS = [
  // action, label, class
  ['attack', 'HIT', 'attack'],
  ['heavy', 'HEAVY', 'heavy'],
  ['block', 'BLOCK', 'block'],
  ['dodge', 'DODGE', 'dodge'],
  ['grab', 'GRAB', 'grab'],
];
const SYSTEM = [
  ['pause', '❚❚', 'Pause'],
  ['notebook', '✎', 'Notebook'],
  ['map', '⌖', 'Map'],
  ['lock', '◎', 'Lock on'],
  ['cycle', '⇄', 'Next target'],
  ['use', '↻', 'Use held item'],
  ['drop', '⤓', 'Drop'],
];

export class TouchControls {
  constructor(game, root) {
    this.game = game;
    this.input = game.input;
    this.active = false;
    this.root = el('div', 'touch');
    this.stickZone = el('div', 'tc-zone tc-left');
    this.lookZone = el('div', 'tc-zone tc-right');
    this.stick = el('div', 'tc-stick', '<div class="tc-knob"></div>');
    this.knob = this.stick.firstChild;
    this.act = el('div', 'tc-act');
    this.sys = el('div', 'tc-sys');
    this.interact = el('button', 'tc-btn tc-interact', '<b>✋</b><span></span>');
    this.interactLabel = this.interact.querySelector('span');
    this.root.append(this.lookZone, this.stickZone, this.stick, this.act, this.sys, this.interact);
    for (const [action, label, cls] of BUTTONS) this.act.appendChild(this._button(action, `<b>${label}</b>`, `tc-btn ${cls}`));
    for (const [action, glyph, title] of SYSTEM) {
      const b = this._button(action, glyph, 'tc-btn tc-small');
      b.title = title; b.setAttribute('aria-label', title);
      this.sys.appendChild(b);
    }
    this._wireButton(this.interact, 'interact');
    this.interact.setAttribute('aria-label', 'Interact');
    root.appendChild(this.root);

    this.stickId = null; this.lookId = null; this.sprinting = false;
    this.base = { x: 0, y: 0 }; this.last = { x: 0, y: 0 };
    this._wireStick();
    this._wireLook();

    // Show on the first touch anywhere; hide again when a mouse or keyboard is used.
    const onPointer = (e) => { if (e.pointerType === 'touch') this.setActive(true); else if (e.pointerType === 'mouse' && this.active) this.setActive(false); };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', (e) => {
      // Soft keyboards (typing a name at intake) also send keydown, so only physical play keys count.
      const t = e.target;
      if (this.active && !(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) this.setActive(false);
    }, true);
    if (typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches) this.setActive(true);
  }

  setActive(v) {
    if (this.active === v) return;
    this.active = v;
    this.root.classList.toggle('on', v);
    document.body.classList.toggle('touch-ui', v);
    if (!v) this._releaseAll();
  }

  _button(action, html, cls) {
    const b = el('button', cls, html);
    this._wireButton(b, action);
    return b;
  }

  _wireButton(b, action) {
    b.type = 'button';
    let id = null;
    const up = (e) => {
      if (id === null || (e && e.pointerId !== id)) return;
      id = null; b.classList.remove('down');
      this.input.simulate(action, false);
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (id !== null) return;
      id = e.pointerId;
      try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      b.classList.add('down');
      this.input.simulate(action, true);
      this.input.lastDevice = 'touch';
    });
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b._release = () => up({ pointerId: id });
  }

  _wireStick() {
    const z = this.stickZone;
    z.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      try { z.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.base = { x: e.clientX, y: e.clientY };
      this.stick.classList.add('live');
      this._stickMove(e.clientX, e.clientY);
    });
    z.addEventListener('pointermove', (e) => { if (e.pointerId === this.stickId) this._stickMove(e.clientX, e.clientY); });
    const end = (e) => { if (e.pointerId === this.stickId) this._stickEnd(); };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
    z.addEventListener('lostpointercapture', end);
  }

  _stickMove(x, y) {
    let dx = x - this.base.x, dy = y - this.base.y;
    let d = Math.hypot(dx, dy);
    if (d > STICK_R * FOLLOW_AT) {
      const k = (d - STICK_R * FOLLOW_AT) / d;
      this.base.x += dx * k; this.base.y += dy * k;
      dx = x - this.base.x; dy = y - this.base.y; d = Math.hypot(dx, dy);
    }
    const r = Math.min(1, d / STICK_R);
    const mag = r < DEAD ? 0 : (r - DEAD) / (1 - DEAD);
    this.input.touchMove = mag > 0 ? { x: dx / d, y: -dy / d, mag } : null;
    const sprint = d > STICK_R * SPRINT_AT;
    if (sprint !== this.sprinting) { this.sprinting = sprint; this.input.simulate('sprint', sprint); }
    const kx = d > 0 ? (dx / d) * Math.min(d, STICK_R) : 0, ky = d > 0 ? (dy / d) * Math.min(d, STICK_R) : 0;
    this.stick.style.transform = `translate(${this.base.x}px, ${this.base.y}px)`;
    this.knob.style.transform = `translate(${kx}px, ${ky}px)`;
    this.stick.classList.toggle('sprint', sprint);
  }

  _stickEnd() {
    this.stickId = null;
    this.input.touchMove = null;
    if (this.sprinting) { this.sprinting = false; this.input.simulate('sprint', false); }
    this.stick.classList.remove('live', 'sprint');
    this.knob.style.transform = '';
  }

  _wireLook() {
    const z = this.lookZone;
    z.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      try { z.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.last = { x: e.clientX, y: e.clientY };
    });
    z.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      this.input.mouseDX += (e.clientX - this.last.x) * LOOK_GAIN;
      this.input.mouseDY += (e.clientY - this.last.y) * LOOK_GAIN;
      this.last = { x: e.clientX, y: e.clientY };
    });
    const end = (e) => { if (e.pointerId === this.lookId) this.lookId = null; };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
    z.addEventListener('lostpointercapture', end);
  }

  _releaseAll() {
    if (this.stickId !== null) this._stickEnd();
    this.lookId = null;
    this.root.querySelectorAll('button').forEach((b) => b._release && b._release());
  }

  /** Per rendered frame: visibility and the context-sensitive interact button. */
  update() {
    if (!this.active) return;
    const g = this.game;
    const playing = g.mode === 'play' && !g.menuOpen && !g.dialogueUI?.list;
    this.root.classList.toggle('hidden', !playing);
    if (!playing) { this._releaseAll(); return; }
    const inConv = !!(g.dialogue && g.dialogue.active);
    this.root.classList.toggle('in-dlg', inConv);
    const pr = !inConv && g.player.state !== 'ko' ? g.controller.promptText() : null;
    this.interact.classList.toggle('show', !!pr);
    if (pr && this.interactLabel.textContent !== pr.verb) this.interactLabel.textContent = pr.verb;
  }
}
