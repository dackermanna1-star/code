// LAST LOOKOUT — tiny DOM helpers shared by the HUD, scope, shop and screens (browser only;
// nothing runs at import time).

export function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** Sets textContent only when it changed (cheap to call every frame). */
export function setText(e, s) {
  const v = String(s);
  if (e._t !== v) {
    e._t = v;
    e.textContent = v;
  }
}

/** Sets a style property only when it changed. */
export function setStyle(e, prop, v) {
  const k = '_s_' + prop;
  if (e[k] !== v) {
    e[k] = v;
    e.style[prop] = v;
  }
}

export function toggle(e, cls, on) {
  const k = '_c_' + cls;
  if (e[k] !== !!on) {
    e[k] = !!on;
    e.classList.toggle(cls, !!on);
  }
}

/** Restarts a one-shot CSS animation class (e.g. 'shake'). */
export function retrigger(e, cls) {
  e.classList.remove(cls);
  void e.offsetWidth; // reflow so the animation starts again
  e.classList.add(cls);
}

/**
 * Segmented LED bar: a fill that jumps to the value and a pale trail that drains after it
 * (so a hit shows how much was lost). value 0..1.
 */
export class SegBar {
  constructor(parent, cls = '') {
    this.root = el('div', 'seg ' + cls, parent);
    const w = el('div', 'w', this.root);
    this.trail = el('i', 'trl', w);
    this.fill = el('i', 'fl', w);
    this.v = -1;
    this.tv = 1;
    this.hold = 0;
  }

  set(v, instant = false) {
    const f = v < 0 ? 0 : v > 1 ? 1 : v || 0;
    if (Math.abs(f - this.v) < 0.0005) return;
    if (this.v < 0) instant = true; // first value: no trail
    const drop = f < this.v && this.v >= 0;
    this.v = f;
    this.fill.style.transform = `scaleX(${f.toFixed(4)})`;
    if (instant || f > this.tv) this._trail(f);
    else if (drop) this.hold = 0.35;
  }

  _trail(f) {
    this.tv = f;
    this.trail.style.transform = `scaleX(${f.toFixed(4)})`;
  }

  tick(dt) {
    if (this.tv <= this.v + 0.0005) return;
    if (this.hold > 0) {
      this.hold -= dt;
      return;
    }
    this._trail(Math.max(this.v, this.tv - dt * 0.45));
  }

  low(on) {
    toggle(this.root, 'low', on);
  }
}

/** Pool of absolutely positioned elements reused for popups (no allocation per event). */
export class Pool {
  constructor(parent, n, cls) {
    this.items = [];
    for (let i = 0; i < n; i++) this.items.push(el('div', cls, parent));
    this.i = 0;
  }
  next() {
    const e = this.items[this.i];
    this.i = (this.i + 1) % this.items.length;
    if (e._anim) e._anim.cancel();
    return e;
  }
}
