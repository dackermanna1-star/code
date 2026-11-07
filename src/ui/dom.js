// Small DOM helpers + inline SVG icons for the HUD (no dependencies).

/** h('div.cls1.cls2', {attrs}, ...children) */
export function h(tag, attrs, ...children) {
  let cls = [];
  const m = String(tag).split('.');
  const name = m[0] || 'div';
  cls = m.slice(1);
  const e = document.createElement(name);
  if (cls.length) e.className = cls.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className += (e.className ? ' ' : '') + v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(e, children);
  return e;
}
function append(e, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(e, c);
    else if (c instanceof Node) e.appendChild(c);
    else e.appendChild(document.createTextNode(String(c)));
  }
}

/** Parse an SVG string into an element. */
export function svg(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstChild;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const I = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const ICONS = {
  play: I('<path d="M7 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>'),
  plane: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.5 12c0-.8-.6-1.3-1.4-1.3h-5.4L9.9 3.2H8l2.4 7.5H5.3L3.6 8.4H2.2l1.1 3.6-1.1 3.6h1.4l1.7-2.3h5.1L8 20.8h1.9l4.8-7.5h5.4c.8 0 1.4-.5 1.4-1.3z"/></svg>',
  gear: I('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  keyboard: I('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6.5 14h11"/>'),
  seat: I('<path d="M7 4v9a2 2 0 0 0 2 2h7"/><path d="M7 13H5.5M16 15l1.5 5M9 15l-1.5 5M11 15v2"/><path d="M10 11h6a1.5 1.5 0 0 1 1.5 1.5V15"/>'),
  route: I('<circle cx="5.5" cy="18" r="2"/><circle cx="18.5" cy="6" r="2"/><path d="M7.5 18h7a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7h7"/>'),
  info: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  restart: I('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v4.5H8"/>'),
  close: I('<path d="M6 6l12 12M18 6L6 18"/>'),
  back: I('<path d="M15 5l-7 7 7 7"/>'),
  headphones: I('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="6.5" rx="1.6"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.6"/>'),
  chip: I('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3"/>'),
  speaker: I('<path d="M4 9.5h3l5-4v13l-5-4H4z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.3 6a8.5 8.5 0 0 1 0 12"/>'),
  mouse: I('<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v3"/>'),
  stand: I('<circle cx="12" cy="4.5" r="2"/><path d="M12 7.5v7M8.5 21l3.5-6.5 3.5 6.5M8 10.5h8"/>'),
  skip: I('<path d="M5 6l8 6-8 6zM14 6l6 6-6 6" fill="currentColor" stroke="none"/>'),
  down: I('<path d="M3 7l9 6 9-6M12 13v8"/>'),
  depart: I('<path d="M3 20h18"/><path d="M4.5 13.5l3 1.5 11-5.5c1-.5 1.3-1.6.6-2.3-.6-.5-1.5-.6-2.3-.2L13 9 7.5 6 5.8 7l3.6 3.4-3.3 1.6-2-1-1.3.6z" fill="currentColor" stroke="none"/>'),
  land: I('<path d="M3 20h18"/><path d="M5 9.5l.2 3.4 11.5 4.1c1 .4 2.1-.2 2.2-1.2.1-.8-.4-1.6-1.2-1.9l-3.8-1.4-1.6-6.1-1.9-.6.4 5-3.5-1.3-.8-2.1z" fill="currentColor" stroke="none"/>'),
  credits: I('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>'),
};

/** Halcyon Airways mark: a stylised kingfisher (halcyon) over a rising sun. */
export const LOGO = `<svg viewBox="0 0 48 48" aria-hidden="true">
  <defs><linearGradient id="hnsun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2c779"/><stop offset="1" stop-color="#e8b04b"/></linearGradient></defs>
  <circle cx="24" cy="24" r="22.5" fill="none" stroke="rgba(243,241,234,0.35)" stroke-width="1"/>
  <path d="M8 30a16 16 0 0 1 32 0z" fill="url(#hnsun)" opacity="0.95"/>
  <path d="M5 30h38" stroke="#0b2a4a" stroke-width="2.2"/>
  <path d="M10 26.5c6.5-1.2 11.5-5.2 15.5-11.2 1.2-1.8 3.4-2.6 5.4-1.9l7.6 2.6-6.2 1.7c-2.2 5.6-7 10-14.4 11.6-3 .6-5.8.1-7.9-2.8z" fill="#1f7a8c"/>
  <path d="M10 26.5c5.2.6 10.6-.5 15.2-3.9" stroke="#f3f1ea" stroke-width="1.3" fill="none"/>
  <circle cx="29.8" cy="16.1" r="1.05" fill="#f3f1ea"/>
  <path d="M14 34h20M18 38h12" stroke="rgba(243,241,234,0.55)" stroke-width="1.3" stroke-linecap="round"/>
</svg>`;
