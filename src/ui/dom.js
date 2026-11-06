// Tiny DOM helpers shared by all UI modules.

/**
 * h('div.a.b#id', {props}, ...children)
 * props: class, style (object|string), text, title, dataset, attrs, on<Event> handlers, any DOM property.
 */
export function h(tag, props, ...children) {
  let t = tag;
  let id = null;
  const classes = [];
  const m = t.match(/^([a-z0-9-]*)(.*)$/i);
  t = m[1] || 'div';
  const rest = m[2];
  if (rest) {
    for (const part of rest.match(/[.#][^.#]+/g) || []) {
      if (part[0] === '.') classes.push(part.slice(1));
      else id = part.slice(1);
    }
  }
  const el = document.createElement(t);
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = (el.className ? el.className + ' ' : '') + v;
      else if (k === 'style') {
        if (typeof v === 'string') el.style.cssText = v;
        else for (const s in v) {
          if (s.startsWith('--')) el.style.setProperty(s, v[s]);
          else el.style[s] = v[s];
        }
      } else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'attrs') for (const a in v) el.setAttribute(a, v[a]);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el[k] = v;
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) appendChildren(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

/** el.append() that skips null / false children (native append prints "null"). */
export function add(el, ...children) {
  appendChildren(el, children);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Cached setters: only touch the DOM when the value really changed. */
export function setText(el, v) {
  v = v == null ? '' : String(v);
  if (el._txt !== v) { el._txt = v; el.textContent = v; }
}
export function setStyle(el, prop, v) {
  const k = '_s_' + prop;
  if (el[k] !== v) {
    el[k] = v;
    if (prop.startsWith('--')) el.style.setProperty(prop, v);
    else el.style[prop] = v;
  }
}
export function setClass(el, cls, on) {
  on = !!on;
  const k = '_c_' + cls;
  if (el[k] !== on) { el[k] = on; el.classList.toggle(cls, on); }
}
export function setShown(el, on) { setClass(el, 'hidden', !on); }

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function fmtKg(w) {
  if (w == null || isNaN(w)) return '0.0';
  return (Math.round(w * 10) / 10).toFixed(1);
}

export function pad2(n) { return String(Math.floor(n)).padStart(2, '0'); }

export function phaseText(hour) {
  const hh = ((hour % 24) + 24) % 24;
  if (hh < 3) return 'After midnight';
  if (hh < 5) return 'Before dawn';
  if (hh < 7) return 'Dawn';
  if (hh < 9) return 'Early morning';
  if (hh < 11) return 'Morning';
  if (hh < 13) return 'Midday';
  if (hh < 15) return 'Early afternoon';
  if (hh < 16) return 'Afternoon';
  if (hh < 18) return 'Late afternoon';
  if (hh < 20) return 'Dusk';
  if (hh < 22) return 'Night';
  return 'Late night';
}

export function bearingFromYaw(yaw) {
  return (((-yaw * 180) / Math.PI) % 360 + 360) % 360;
}

export const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function cardinal(deg) {
  return CARDINALS[Math.round(deg / 45) % 8];
}

export function fmtDays(d) {
  if (d == null || isNaN(d)) return '0 days';
  const days = Math.floor(d);
  const hours = Math.floor((d - days) * 24 + 1e-6);
  const ds = `${days} day${days === 1 ? '' : 's'}`;
  if (hours > 0 && days < 100) return `${ds}, ${hours} hour${hours === 1 ? '' : 's'}`;
  return ds;
}

export function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} days ago`;
}

export const PART_NAMES = {
  head: 'Head', torso: 'Torso', armL: 'Left Arm', armR: 'Right Arm', legL: 'Left Leg', legR: 'Right Leg',
};
export const WOUND_NAMES = {
  scratch: 'Scratch', laceration: 'Laceration', bite: 'Bite', deep: 'Deep Wound',
  bullet: 'Gunshot Wound', fracture: 'Fracture', burn: 'Burn',
};
export const RARITY_COLORS = {
  common: '#d9d3c5', uncommon: '#7fc25a', rare: '#5aa2e6', epic: '#b673e8', legendary: '#e8a13a',
};

/** Escape for the few places that build text with markup. */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
