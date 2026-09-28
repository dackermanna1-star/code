// DOM heads-up display: a minimal, modern take on the Left 4 Dead 2 layout.
//   bottom-left   you: avatar ring (state), name, slim health bar + number (green → amber → red),
//                 striped temp-health overlay, black-and-white / incapacitated / pinned / dead;
//                 teammates stacked above (name, bar, status icon + label, carried items)
//   bottom-right  ammo readout for the active weapon + five inventory slots (primary with
//                 mag/reserve, secondary, throwable, health item, pills/adrenaline) that
//                 brighten on any change and fade back after a few seconds
//   centre        thin dynamic crosshair, hit ticks, damage-direction arcs, use prompt and the
//                 hold-to-use / revive / heal progress pill with a ring
//   elsewhere     objective (top, fades), tank bar, chapter title card, subtitles with a speaker
//                 accent, toasts, name tags, scope, low-health / incap vignette
// Public API other code relies on (keep it): show(v), toast(text, dur), setObjective(html, dur),
// clearTransient(), titleCard(big, small, dur), subtitle(text, name, color, dur), hit(kill, head),
// damageFrom(x, z), update(dt), registerIcon(); fields root (session toggles .cine, levels append
// overlays such as the finale fuel gauge), title/titleT, objective, subs, toastEl.
//
// ICON REGISTRY: slot, teammate and progress icons are looked up by id, so a new item needs
// one additive call from any module at any time (slots re-render on the next HUD tick):
//   import { registerIcon } from '../ui/hud.js';           // or game.hud.registerIcon / HUD.registerIcon
//   registerIcon('katana', '<path d="…"/>', { w: 52 });     // path markup in a w×16 box (w defaults to 48)
//   registerIcon('defib', '<svg viewBox="0 0 20 16">…</svg>'); // or a complete <svg>
//   registerIcon('chainsaw', (ctx, w, h) => { ctx.fillRect(2, 5, 40, 6); }, { w: 50 }); // or a 2D-canvas draw fn
//   registerIcon(['bat', 'baseballBat'], …);                // several ids share one icon
// Icons are one-colour silhouettes tinted with currentColor: leave fill unset (use fill="none"
// stroke="currentColor" for line work, opacity or fill-rule="evenodd" cut-outs for detail). Draw
// functions paint in a w×h user space (supersampled) with white fill/stroke; anything opaque shows.
// Lookup: weapon → def.icon → type ('huntingRifle', 'fireaxe', …) → def.kind ('rifle', 'melee', …),
// dual pistols → 'dual'; throwable / health / pills slots → the inventory value itself ('pipebomb',
// 'medkit' when inv.medkit === true, or a string id such as 'defib', 'adrenaline').
// Unknown ids fall back to the kind or slot default, so nothing breaks before an icon exists.
// Pre-registered beyond the current weapons/items (see ICON_SET for every alias): defib, incendiary
// and explosive upgrade packs, katana, baseball bat, frying pan, chainsaw.
import * as THREE from 'three';
import { itemName } from '../world/items.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};
// cached DOM writes (the HUD refreshes ~12x/s; skip unchanged values)
const txt = (e, v) => { if (e._txt !== v) { e._txt = v; e.textContent = v; } };
const htm = (e, v) => { if (e._htm !== v) { e._htm = v; e.innerHTML = v; } };
const cls = (e, v) => { if (e._cls !== v) { e._cls = v; e.className = v; } };
const sty = (e, k, v) => { const c = '_s_' + k; if (e[c] !== v) { e[c] = v; e.style[k] = v; } };
const vr = (e, k, v) => { const c = '_v_' + k; if (e[c] !== v) { e[c] = v; e.style.setProperty(k, v); } };
const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ------------------------------------------------------------ icon registry --
const ICONS = new Map();   // id -> rendered markup
let iconGen = 0;           // bumps on every registration so cached slot markup refreshes
function makeIcon(icon, o) {
  const w = o.w || 48, h = o.h || 16;
  if (typeof icon === 'function') {
    const S = o.scale || 4;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * S); c.height = Math.ceil(h * S);
    const ctx = c.getContext('2d');
    ctx.scale(S, S);
    ctx.fillStyle = ctx.strokeStyle = '#fff';
    icon(ctx, w, h);
    const url = c.toDataURL();
    return `<i class="icm" style="aspect-ratio:${w}/${h};-webkit-mask-image:url(${url});mask-image:url(${url})"></i>`;
  }
  let s = String(icon).trim();
  if (!/^<svg[\s>]/i.test(s)) s = `<svg viewBox="${o.viewBox || `0 0 ${w} ${h}`}">${s}</svg>`;
  return s.replace(/^<svg/i, '<svg aria-hidden="true" focusable="false"');
}
export function registerIcon(ids, icon, opts = {}) {
  const html = makeIcon(icon, opts);
  for (const id of [].concat(ids)) ICONS.set(id, html);
  iconGen++;
  return html;
}
export const hasIcon = (id) => ICONS.has(id);
export const iconHTML = (id) => ICONS.get(id) || '';
export const iconIds = () => [...ICONS.keys()];

const PISTOL = '<path d="M4 3.2h22v4.2H4zM4.6 2.3h1.8v1H4.6zM23.8 2.3h1.4v1h-1.4z"/><path d="M5 7.4h19.4v1.7H5z"/><path d="M5.3 9.1h6.3L10.2 15H3.9z"/><path d="M11.6 9.1h5.4l-.8 3.1h-4.9v-1.1h3.8l.3-.9h-3.8z"/>';
const SMG_BODY = '<path d="M9 3.6h19.4v5H9zM26.6 2.4h1.4v1.2h-1.4z"/><path d="M1.2 4.2H9v1.4H2.6V7H9v1.4H1.2z"/><path d="M12.4 8.6h3.8l-.5 7h-3.8z"/><path d="M16.2 8.6h4.6l-.7 2.8h-4.1v-1h3.2l.2-.8h-3.2zM22.6 8.6H25l.9 3.4h-2.3z"/>';
const KIT_BOX = 'M2.2 5.4h15.6a1.2 1.2 0 0 1 1.2 1.2v7.8a1.2 1.2 0 0 1-1.2 1.2H2.2A1.2 1.2 0 0 1 1 14.4V6.6a1.2 1.2 0 0 1 1.2-1.2z';
const KIT_HANDLE = '<path d="M7 5.4V3.6a1.2 1.2 0 0 1 1.2-1.2h3.6A1.2 1.2 0 0 1 13 3.6v1.8h-1.4V3.8H8.4v1.6z"/>';
const star = (cx, cy, n, r1, r2) => {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = Math.PI * i / n - Math.PI / 2, r = i & 1 ? r2 : r1;
    d += (i ? 'L' : 'M') + (cx + Math.cos(a) * r).toFixed(2) + ' ' + (cy + Math.sin(a) * r).toFixed(2);
  }
  return d + 'z';
};
let TEETH = '';
for (let x = 20.4; x < 43.5; x += 2.4) TEETH += `M${x.toFixed(1)} 7.6l1.1-1.3 1.1 1.3zM${x.toFixed(1)} 12.6l1.1 1.3 1.1-1.3z`;

// [ids, width (height is 16), svg body]
const ICON_SET = [
  // ---- secondaries
  [['pistol'], 28, PISTOL],
  [['dual', 'dualPistols'], 36, `<g opacity=".5" transform="translate(9 -1.6)">${PISTOL}</g><g transform="translate(0 1)">${PISTOL}</g>`],
  [['magnum', 'deagle'], 32, '<path d="M3 2.6h27.6v5.2H3zM1.6 3.2H3V6H1.6zM28.4 1.8H30v.8h-1.6z"/><path d="M4.4 7.8h22v1.7h-22z"/><path d="M4.8 9.5h6.9l-1.5 6H3.3z"/><path d="M11.7 9.5h6.1l-.9 3.3h-5.6v-1.1h4.4l.3-1.1h-4.3z"/>'],
  // ---- primaries
  [['smg'], 40, SMG_BODY + '<path d="M28.4 5H36v2.2h-7.6z"/>'],
  [['silencedSmg'], 46, SMG_BODY + '<path d="M28.4 4.3h15a.9.9 0 0 1 .9.9v2.6a.9.9 0 0 1-.9.9h-15z"/>'],
  [['rifle', 'assaultRifle', 'm16'], 48, '<path d="M1 4.9l10.4-1v5.4L2.6 12.4H1z"/><path d="M11.4 3.8h16.4v5.4H11.4zM14.6 1.7h9.8v1.2h-1.2v.9h-1.3v-.9h-5.8v.9h-1.3v-.9h-.2z"/><path d="M27.8 4.3h10.6v4.4H27.8zM36.4 1.9h1.3v2.4h-1.3zM38.4 5.5h6.8v1.4h-6.8zM45.2 5.1h2.2v2.2h-2.2z"/><path d="M21.2 9.2H25l1.8 5.4-3.6 1.1z"/><path d="M13.2 9.2h3.4l-1.3 5.2H12zM16.6 9.2h4.6v.9l-.5 1.4h-4v-.9h3.1l.2-.5h-3.4z"/>'],
  [['scar', 'combatRifle'], 48, '<path d="M1 3.8h10v2H4.2v1.8H11v1.8H3.2L1 11.4z"/><path d="M11 3.4h22.4v4.4H11zM12 2.1h20v1.3H12zM11 7.8h13.4v1.5H11z"/><path d="M33.4 4.4h8.4v1.8h-8.4zM41.8 4h3.8v2.6h-3.8z"/><path d="M20.8 9.3h3.6l.9 5.4h-3.6zM13.2 9.3h3.4l-1.3 5.1H12z"/>'],
  [['shotgun', 'pumpShotgun', 'chromeShotgun'], 50, '<path d="M1 6l11.2-2.4h2v5.2h-3.3L2 12.6H1z"/><path d="M14.2 3.6h10.4v5.2H14.2zM24.6 3.9h24.2v1.8H24.6zM24.6 6.2h17.2v1.6H24.6z"/><path d="M28.6 5.8h10a1.1 1.1 0 0 1 1.1 1.1v1.8a1.1 1.1 0 0 1-1.1 1.1h-10a1.1 1.1 0 0 1-1.1-1.1V6.9a1.1 1.1 0 0 1 1.1-1.1z"/><path d="M15.8 8.8H21l-.6 2h-4.6z"/>'],
  [['autoShotgun'], 50, '<path d="M1 4.4h10v2H4.2V8H11v1.8H3.4L1 11.8z"/><path d="M11 3.4h13.6v5.4H11zM20.6 2.1h2.6v1.3h-2.6zM24.6 3.8h23.6v1.8H24.6zM24.6 6.2h15.8V8H24.6z"/><path d="M25.4 5.6h11v3.8h-11z"/><path d="M13.2 8.8h3.4l-1.3 5.4H12zM16.6 8.8h4.8l-.6 1.9h-4.2z"/>'],
  [['sniper', 'huntingRifle'], 52, '<path d="M1 6.4L12 4h3.4v4.6h-4.2L2 12.8H1z"/><path d="M15.4 4.4H25v4.2h-9.6zM24.8 4.6H51V6H24.8zM25 5.6h11.4l1 2.6H25z"/><path d="M13.6 1.2h13a1 1 0 0 1 1 1v.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-.5a1 1 0 0 1 1-1zM26.4.4h4a.6.6 0 0 1 .6.6v2.8a.6.6 0 0 1-.6.6h-4zM11.6.8h2.6V4h-2.6zM16.4 3.6H18v.8h-1.6zM23.4 3.6H25v.8h-1.6z"/><path d="M20.2 8.6h3.2v2.2h-3.2zM16.4 8.6h3.4l-.5 1.8h-2.9z"/>'],
  [['heavy', 'm60'], 54, '<path d="M1 5l10.2-1h2.4v5.4h-3.4L2 12.2H1z"/><path d="M13.6 3.4h16.6V9H13.6zM16 2.2h10v1.2H16zM28.2 1.2h6.2v1.2h-6.2zM28.6 2.4h1v1h-1zM33 2.4h1v1h-1z"/><path d="M30.2 4.2H43v3.6H30.2zM43 5.2h8.6v1.6H43zM51.6 4.8h2v2.4h-2z"/><path d="M18.8 9h6.6v4.2h-6.6zM14.8 9H18l-1.3 5h-3.1z"/><path d="M40.4 7.8l-3 7.2h1.3l3-7.2zM42 7.8l3 7.2h-1.3l-3-7.2z"/>'],
  [['launcher', 'grenadeLauncher'], 44, '<path d="M1 6.4L11 4h3v5.2h-3L2 12.4H1z"/><path d="M14 4h6.4v5.6H14z"/><path d="M20.4 2.6h19.4a1.4 1.4 0 0 1 1.4 1.4v4a1.4 1.4 0 0 1-1.4 1.4H20.4zM41.2 2.1H43v7.8h-1.8zM21 .8h1.2v1.8H21z"/><path d="M15 9.6h4.6l-.5 1.9H15z"/>'],
  [['minigun'], 46, '<path d="M1.6 3.4h15a1.6 1.6 0 0 1 1.6 1.6v5.2a1.6 1.6 0 0 1-1.6 1.6h-15z"/><path d="M18.2 3.8h24.6v1.6H18.2zM18.2 6.8H44v1.6H18.2zM18.2 9.8h24.6v1.6H18.2zM33.4 3.2h1.8V12h-1.8z"/><path d="M4.4 11.8H6l-.8 3.4H3.6zM11 11.8h1.6l-.8 3.4h-1.6z"/>'],
  // ---- melee
  [['melee', 'fireaxe', 'axe'], 40, '<path d="M2.2 7.3H31v2H2.2a1 1 0 0 1 0-2z"/><path d="M30.2 5.6h4.6V11h-4.6zM31 5.6l1.3-5h1l1.3 5z"/><path d="M30.4 11h4.2l3.6 4.4c-3.4.8-7 .8-10.6-.2z"/>'],
  [['crowbar'], 40, '<path d="M1.8 12.4l2.4-2.2h26.4c2.6 0 4.2-1.6 4.2-3.8 0-2.2-1.4-3.6-3.4-3.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'],
  [['machete'], 40, '<path d="M1.4 7.2H11v3.4H1.4a.8.8 0 0 1-.8-.8V8a.8.8 0 0 1 .8-.8zM11 6h1.4v5.8H11z"/><path d="M12.4 6.8h18.8c3.2 0 6 .9 7.6 3.2-2.8 1.5-6.6 2.2-10 2.2H12.4z"/>'],
  [['katana'], 52, '<path d="M1.2 9.4l10.4-1.3.2 2.4-10.4 1.3z"/><path d="M11.6 6.2a.9.9 0 0 1 1.8 0v6a.9.9 0 0 1-1.8 0z"/><path d="M13.4 8.1C24 7.6 38 6.4 50.8 2.4c-.5 1.3-1.6 2.3-3.2 2.9-11.2 3.7-23.2 4.8-34.2 5.1z"/>'],
  [['bat', 'baseballBat', 'baseball_bat'], 44, '<circle cx="2.6" cy="8.4" r="2"/><path d="M4 7.6L21 6.8c6-.6 11.6-2.2 17-2.5a4.1 4.1 0 0 1 0 8.2c-5.4-.3-11-1.9-17-2.5L4 9.2z"/>'],
  [['pan', 'fryingPan', 'frying_pan', 'fryingpan'], 40, '<path fill-rule="evenodd" d="M31.4.8a7.2 7.2 0 1 1 0 14.4 7.2 7.2 0 0 1 0-14.4zm0 1.8a5.4 5.4 0 1 0 0 10.8 5.4 5.4 0 0 0 0-10.8z"/><circle cx="31.4" cy="8" r="4.4" opacity=".4"/><path d="M2.6 6.9h19.2l2.6.5v1.2l-2.6.5H2.6a1.1 1.1 0 0 1 0-2.2z"/>'],
  [['chainsaw'], 50, `<path d="M3.4 5.4h13.8a2 2 0 0 1 2 2v5.4a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2zM.8 8.2h2.6v4.4H.8z"/><path d="M6.2 5.4V2.8a1.6 1.6 0 0 1 1.6-1.6H15a1.6 1.6 0 0 1 1.6 1.6v2.6H15V2.8H7.8v2.6z"/><path d="M19.2 7.6h25.6a2.5 2.5 0 0 1 0 5H19.2z${TEETH}"/>`],
  // ---- throwables
  [['pipebomb', 'throwable'], 16, '<path d="M5 5h6v9.4H5zM4.1 3.6h7.8v2H4.1zM4.1 13.4h7.8v2H4.1z"/><path d="M7.4 3.6c0-1.8 1.1-2.8 3.2-3l.2 1c-1.4.2-2.2.8-2.2 2z"/><circle cx="13.3" cy="9.5" r="1.2"/>'],
  [['molotov'], 16, '<path d="M6.4 4.8h3.2v2l2.1 2.1v6.3a.8.8 0 0 1-.8.8H5.1a.8.8 0 0 1-.8-.8V8.9l2.1-2.1z"/><path d="M6.8 4.4C6.2 3 7.6 2.2 8 .2c1.2 1.6 2.4 2.6 1.6 4.2z" opacity=".75"/>'],
  [['bile', 'bilejar', 'vomitjar'], 16, '<path d="M4.6 1.2h6.8v2.6H4.6z"/><path fill-rule="evenodd" d="M4.4 4.4h7.2l1.6 1.9V15a1 1 0 0 1-1 1H3.8a1 1 0 0 1-1-1V6.3zM4.4 8.6V10h7.2V8.6z"/>'],
  // ---- health items (slot 4)
  [['medkit', 'firstaid'], 18, '<path fill-rule="evenodd" d="M2.2 4.4h13.6a1.2 1.2 0 0 1 1.2 1.2v8.6a1.2 1.2 0 0 1-1.2 1.2H2.2A1.2 1.2 0 0 1 1 14.2V5.6a1.2 1.2 0 0 1 1.2-1.2zM7.7 6.6v2.5H5.2v2.8h2.5v2.5h2.6v-2.5h2.5V9.1h-2.5V6.6z"/><path d="M6 4.4V2.2a.6.6 0 0 1 .6-.6h4.8a.6.6 0 0 1 .6.6v2.2h-1.4V3H7.4v1.4z"/>'],
  [['defib', 'defibrillator'], 20, `<path fill-rule="evenodd" d="${KIT_BOX}M10.8 6.8L7.4 11h2.3l-.9 3.2 3.6-4.5H10z"/><path d="M3.4 1.2h4.4v2.6H3.4zM4.9 3.8h1.4v1.6H4.9zM12.2 1.2h4.4v2.6h-4.4zM13.7 3.8h1.4v1.6h-1.4z"/>`],
  [['incendiary', 'upgradeIncendiary', 'incendiaryAmmo', 'upgrade_incendiary', 'fireammo'], 20, `<path fill-rule="evenodd" d="${KIT_BOX}M10.2 6.6c.4 1.5 2.4 2.4 2.4 4.8a2.6 2.6 0 0 1-5.2 0c0-1.2.7-1.9 1.1-2.6.2.9.6 1.4 1.3 1.4-.2-1.4-.3-2.3.4-3.6z"/>${KIT_HANDLE}`],
  [['explosive', 'upgradeExplosive', 'explosiveAmmo', 'upgrade_explosive', 'upgrade', 'upgradepack'], 20, `<path fill-rule="evenodd" d="${KIT_BOX}${star(10, 10.4, 7, 3.7, 1.6)}"/>${KIT_HANDLE}`],
  // ---- pills slot (5)
  [['pills', 'painpills'], 12, '<path d="M1.4 1.8a.8.8 0 0 1 .8-.8h7.6a.8.8 0 0 1 .8.8V4H1.4z"/><path fill-rule="evenodd" d="M2.4 4.6h7.2a1 1 0 0 1 1 1v9a1.2 1.2 0 0 1-1.2 1.2H2.6a1.2 1.2 0 0 1-1.2-1.2v-9a1 1 0 0 1 1-1zM5.2 7.4v1.8H3.4v1.6h1.8v1.8h1.6v-1.8h1.8V9.2H6.8V7.4z"/>'],
  [['adrenaline', 'adrenalineShot'], 16, '<path d="M11.6 1l3.4 3.4-1 1-.9-.9-1.5 1.5 1 1L5 14.6l-.8-.8-2.4 2.4-1.2-1.2 2.4-2.4-.8-.8L9.8 4.2l1 1 1.5-1.5-.9-.9z"/>'],
  // ---- status / action glyphs
  [['down', 'incap'], 16, '<circle cx="3.6" cy="10.4" r="2.2"/><rect x="6.6" y="8.8" width="8.6" height="3.2" rx="1.6"/><path d="M1 14h14v1.2H1z" opacity=".5"/>'],
  [['pinned'], 16, '<path d="M2.4 13.8L7.6 1.6l1.5.6-5.2 12.2zM6.2 15.2l5-11.8 1.5.6-5 11.8zM10.4 15.4l3.2-7.6 1.5.6-3.2 7.6z"/>'],
  [['dead'], 16, '<path fill-rule="evenodd" d="M8 1.2c3.7 0 6.2 2.5 6.2 5.8 0 2-1 3.4-2.4 4.2v3.2H4.2v-3.2C2.8 10.4 1.8 9 1.8 7c0-3.3 2.5-5.8 6.2-5.8zM5.6 6.4a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zm4.8 0a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z"/>'],
  [['bw'], 16, '<path d="M.8 8.8h3.4l1.7-3.6 2.5 7.2 2-5.2 1.3 1.6h3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'],
  [['ledge'], 16, '<path d="M1 2.2h14V4H1zM5.8 4h1.6v4.6H5.8zM8.6 4h1.6v4.6H8.6z"/><circle cx="8" cy="11.8" r="2.8"/>'],
  [['revive'], 16, '<path d="M8 1.2l5.8 6.2h-3.5v7.4H5.7V7.4H2.2z"/>'],
];
for (const [ids, w, body] of ICON_SET) registerIcon(ids, body, { w });

const weaponIconId = (w) => {
  if (!w) return null;
  if (w.dual && ICONS.has('dual')) return 'dual';
  const d = w.def || {};
  for (const id of [d.icon, w.type, d.kind]) if (id && ICONS.has(id)) return id;
  return d.melee ? 'melee' : 'rifle';
};
const itemIconId = (id, fallback) => (id && ICONS.has(id) ? id : fallback);
const healthKit = (inv) => (inv.medkit === true ? 'medkit' : inv.medkit || null);
// teammate carried items: health item, pills slot, throwable
const itemIcons = (inv) => {
  const hk = healthKit(inv);
  return (hk ? `<i class="ic">${iconHTML(itemIconId(hk, 'medkit'))}</i>` : '') +
    (inv.pills ? `<i class="ic">${iconHTML(itemIconId(inv.pills, 'pills'))}</i>` : '') +
    (inv.throwable ? `<i class="ic">${iconHTML(itemIconId(inv.throwable, 'pipebomb'))}</i>` : '');
};

// health colour, L4D2 bands: green (40+), amber (25-39, limping), red (<25 / incapacitated)
function hpColor(tot, bad) {
  if (bad || tot < 25) return 'hsl(4 84% 61%)';
  if (tot < 40) return `hsl(${Math.round(28 + (tot - 25) / 15 * 16)} 92% 58%)`;
  const k = Math.min(1, (tot - 40) / 22);
  return `hsl(${Math.round(72 + k * 40)} ${Math.round(64 - k * 16)}% ${Math.round(56 + k * 2)}%)`;
}
const PIN = { smoker: 'Smoker', hunter: 'Hunter', jockey: 'Jockey', charger: 'Charger' };
const pinLabel = (s) => PIN[s.pinned?.kind] || PIN[s.pinType] || 'Pinned';
const survivorMode = (s) => (s.dead ? 'dead' : s.pinned ? 'pinned' : s.incapped ? 'incap' : s.ledge ? 'ledge' : s.blackAndWhite ? 'bw' : '');
const MODE_ICON = { dead: 'dead', pinned: 'pinned', incap: 'down', ledge: 'ledge', bw: 'bw' };
const RING = '<svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="rt" cx="18" cy="18" r="16"/><circle class="rf" cx="18" cy="18" r="16" pathLength="100"/></svg>';
const ACTION_LABEL = { heal: 'Healing', revive: 'Reviving', pills: 'Taking pills', use: 'Using' };

export class HUD {
  static registerIcon(ids, icon, opts) { return registerIcon(ids, icon, opts); }
  registerIcon(ids, icon, opts) { return registerIcon(ids, icon, opts); }

  constructor(game, root) {
    this.game = game;
    this.root = el('div', 'hud', root);
    this.root.style.display = 'none';
    el('div', 'hud-shade', this.root);
    this.vig = el('div', 'hud-vig', this.root);
    // crosshair
    this.cross = el('div', 'crosshair', this.root);
    this.crossLines = ['t', 'b', 'l', 'r'].map((k) => el('div', 'ch ch-' + k, this.cross));
    this.hitMark = el('div', 'hitmark', this.root, '<i></i><i></i><i></i><i></i>');
    // damage direction indicators
    this.dmgCanvas = el('canvas', 'dmgcanvas', this.root);
    this.dmgCanvas.width = 300; this.dmgCanvas.height = 300;
    this.dmgCtx = this.dmgCanvas.getContext('2d');
    this.dmgInd = [];
    // teammates (bottom-left, stacked above the player panel)
    this.team = el('div', 'team', this.root);
    this.teamRows = [];
    // player panel
    this.pblock = el('div', 'pblock', this.root);
    this.pav = el('div', 'pav', this.pblock);
    this.pglyph = el('b', null, this.pav);
    const pmain = el('div', 'pmain', this.pblock);
    const phead = el('div', 'phead', pmain);
    this.pname = el('div', 'pname', phead);
    this.pstate = el('div', 'pstate', phead);
    this.pbar = el('div', 'pbar', pmain);
    this.pbarGhost = el('div', 'ghost', this.pbar);
    this.pbarFill = el('div', 'fill', this.pbar);
    this.pbarTemp = el('div', 'temp', this.pbar);
    this.pnum = el('div', 'pnum', this.pblock);
    // inventory (bottom-right): readout above the five slots
    this.wblock = el('div', 'wblock', this.root);
    const wread = el('div', 'wread', this.wblock);
    this.wname = el('div', 'wname', wread);
    this.wammo = el('div', 'wammo', wread);
    this.wclip = el('div', 'wclip', wread);
    this.slots = el('div', 'slots', this.wblock);
    this.slotEls = [0, 1, 2, 3, 4].map((i) => {
      const s = el('div', 'slot s' + i, this.slots);
      el('span', 'sk', s, String(i + 1));
      s.icon = el('span', 'si', s);
      s.cap = el('span', 'scap', s);
      return s;
    });
    this.slotShowT = 0;
    // use prompt pill + hold progress ring
    this.prompt = el('div', 'useprompt', this.root, `<span class="kc">${RING}<b>E</b></span><span class="ptxt"><em>Hold</em><span></span></span>`);
    this.promptText = this.prompt.querySelector('.ptxt > span');
    this.progress = el('div', 'useprompt useprogress hold', this.root, `<span class="kc">${RING}<b></b></span><span class="ptxt"><span></span></span>`);
    this.progressLabel = this.progress.querySelector('.ptxt > span');
    this.progressGlyph = this.progress.querySelector('.kc b');
    this.progressBar = this.progress.querySelector('.rf');
    // subtitles
    this.subs = el('div', 'subs', this.root);
    // objective, toast, chapter title
    this.objective = el('div', 'objective', this.root);
    this.toastEl = el('div', 'toast', this.root);
    this.title = el('div', 'titlecard', this.root);
    // name tags
    this.tags = el('div', 'tags', this.root);
    this.tagEls = new Map();
    // scope
    this.scope = el('div', 'scope', this.root, '<div class="scope-cross"></div>');
    // boss bar
    this.boss = el('div', 'bossbar', this.root, '<div class="bname">Tank</div><div class="btrack"><div class="bfill"></div></div>');
    this.bossFill = this.boss.querySelector('.bfill');
    // incap / death info
    this.center = el('div', 'centermsg', this.root);
    this.fpsEl = el('div', 'fps', this.root);
    this.t = 0;
    this.subQueue = [];
    this.hitT = 0;
    this.gap = 8;
    this._v = new THREE.Vector3();
  }
  show(v) { this.root.style.display = v ? '' : 'none'; }
  toast(text, dur = 2.2) {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = 1;
    this.toastT = dur;
  }
  setObjective(text, dur = 7) {
    this.objective.innerHTML = text;
    this.objective.style.opacity = text ? 1 : 0;
    this.objT = dur;
    if (text) this.objective.className = 'objective ' + ((this._objFlip = !this._objFlip) ? 'in-a' : 'in-b');
  }
  // chapter change: drop the previous chapter's objective, subtitles, toasts
  clearTransient() {
    this.setObjective('', 0);
    this.subs.innerHTML = '';
    this.toastEl.style.opacity = 0;
    this.toastT = 0;
  }
  titleCard(big, small, dur = 5) {
    this.title.innerHTML = `<div class="tc-small">${small}</div><div class="tc-rule"></div><div class="tc-big">${big}</div>`;
    this.title.style.opacity = 1;
    this.titleT = dur;
  }
  subtitle(text, name, color, dur) {
    const line = el('div', 'subline', this.subs, `<span class="sname">${name}</span><span class="stext">${text}</span>`);
    line.style.setProperty('--c', color || '#ddd');
    line._t = dur;
    while (this.subs.children.length > 3) this.subs.removeChild(this.subs.firstChild);
  }
  hit(kill = false, head = false) {
    this.hitT = 0.26;
    // alternate the animation name so every hit restarts the pop
    this.hitMark.className = 'hitmark on ' + ((this._hmFlip = !this._hmFlip) ? 'a' : 'b') + (kill ? ' kill' : '') + (head ? ' head' : '');
  }
  damageFrom(x, z) {
    this.dmgInd.push({ x, z, t: 1.2 });
    if (this.dmgInd.length > 8) this.dmgInd.shift();
  }
  // resolution-independent sizing: every HUD length is calc(N * var(--k)), tuned at 1080p
  resize(W, H) {
    this._W = W; this._H = H;
    const k = Math.max(0.62, Math.min(2, Math.min(H / 1080, W / 1700)));
    this.k = k;
    this.root.style.setProperty('--k', k.toFixed(3));
    const cw = H >= 900 ? 2 : 1;
    this.root.style.setProperty('--cw', cw + 'px');
    this.root.style.setProperty('--cl', Math.max(5, Math.round(9 * k)) + 'px');
    this._cw = cw; this._gp = -1;
  }
  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!p) return;
    this.t += dt;
    if (window.innerWidth !== this._W || window.innerHeight !== this._H) this.resize(window.innerWidth, window.innerHeight);
    // timers
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.style.opacity = 0; }
    if (this.objT > 0) { this.objT -= dt; if (this.objT <= 0) this.objective.style.opacity = 0; }
    if (this.titleT > 0) { this.titleT -= dt; if (this.titleT <= 0) this.title.style.opacity = 0; }
    for (const c of Array.from(this.subs.children)) {
      c._t -= dt;
      if (c._t <= 0) c.remove();
      else if (c._t < 0.45 && !c._out) { c._out = true; c.classList.add('out'); }
    }
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.hitMark.className = 'hitmark'; }
    if (this.slotShowT > 0) { this.slotShowT -= dt; if (this.slotShowT <= 0) this.slots.classList.remove('show'); }
    // crosshair: thin lines, gap follows the weapon's live cone (smoothed)
    const w = p.weapon;
    const cam = g.renderer.camera;
    const H = this._H;
    let gap = 7;
    if (w && !w.def.melee) {
      const deg = w.spread(p);
      const px = Math.tan(THREE.MathUtils.degToRad(deg)) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * (H / 2);
      gap = Math.max(4, Math.min(80, px));
    }
    this.gap += (gap - this.gap) * Math.min(1, dt * 22);
    const hideCross = !w || w.zoomed || p.dead || w.def.melee || !!p.action;
    sty(this.cross, 'opacity', hideCross ? '0' : w.reloading ? '0.45' : '1');
    if (!hideCross) {
      const o = this._cw >> 1, len = Math.max(5, Math.round(9 * this.k)), gp = Math.round(this.gap);
      if (this._gp !== gp) {
        this._gp = gp;
        this.crossLines[0].style.transform = `translate(${-o}px, ${-gp - len}px)`;
        this.crossLines[1].style.transform = `translate(${-o}px, ${gp}px)`;
        this.crossLines[2].style.transform = `translate(${-gp - len}px, ${-o}px)`;
        this.crossLines[3].style.transform = `translate(${gp}px, ${-o}px)`;
      }
    }
    sty(this.scope, 'display', w && w.zoomed ? 'block' : 'none');
    // throttle heavy DOM work
    this.slowT = (this.slowT || 0) - dt;
    this.drawDamage(dt);
    this.updateTags();
    if (this.slowT > 0) return;
    this.slowT = 0.08;
    this.updatePlayer(p);
    this.updateTeam();
    this.updateWeapon(p);
    this.updatePrompt(p);
    // tank bar
    const tank = g.infected.specials.find((s) => s.kind === 'tank' && !s.dead && s.pos.distanceTo(p.pos) < 60);
    sty(this.boss, 'display', tank ? 'block' : 'none');
    if (tank) sty(this.bossFill, 'transform', `scaleX(${clamp01(tank.hp / tank.maxHp).toFixed(3)})`);
    if (!!tank !== this._tank) { this._tank = !!tank; this.root.classList.toggle('boss-on', !!tank); }
    sty(this.fpsEl, 'display', g.settings.showFps ? 'block' : 'none');
    if (g.settings.showFps) this.fpsEl.textContent = `${g.fps.toFixed(0)} fps | ${g.infected.commons.length} inf | upd ${(g.perf?.upd || 0).toFixed(1)}ms`;
  }
  updatePlayer(p) {
    const incap = p.incapped && !p.dead;
    const tot = p.dead ? 0 : p.health + p.temp;
    let mode = survivorMode(p);
    if (!mode && tot < 25) mode = 'crit';
    vr(this.pblock, '--hp', hpColor(tot, incap || p.dead));
    vr(this.pblock, '--c', p.char.color);
    txt(this.pname, p.name);
    const f = p.dead ? 0 : incap ? p.incapHP / 300 : p.health / 100;
    const tf = p.dead || incap ? 0 : Math.min(1 - p.health / 100, p.temp / 100);
    const fx = `scaleX(${clamp01(f).toFixed(3)})`;
    sty(this.pbarFill, 'transform', fx);
    sty(this.pbarGhost, 'transform', fx);
    sty(this.pbarTemp, 'transform', `translateX(${(clamp01(p.health / 100) * 100).toFixed(1)}%) scaleX(${clamp01(tf).toFixed(3)})`);
    txt(this.pnum, String(p.dead ? 0 : incap ? Math.ceil(p.incapHP) : Math.ceil(tot)));
    const label = mode === 'dead' ? 'Dead' : mode === 'incap' ? (p.beingRevived ? 'Being revived' : 'Incapacitated')
      : mode === 'pinned' ? pinLabel(p) : mode === 'ledge' ? 'Hanging' : mode === 'bw' ? 'Black & white' : '';
    htm(this.pstate, label ? (MODE_ICON[mode] ? iconHTML(MODE_ICON[mode]) : '') + `<span>${label}</span>` : '');
    const ic = MODE_ICON[mode] && mode !== 'bw' ? MODE_ICON[mode] : '';
    htm(this.pglyph, ic ? iconHTML(ic) : esc((p.name || '?')[0]));
    cls(this.pblock, 'pblock' + (mode ? ' m-' + mode : '') + (tf > 0.004 ? ' has-temp' : ''));
    // edge vignette: critical / black-and-white / incapacitated
    const vig = p.dead ? '' : incap || p.pinned ? 'v-incap' : tot < 25 ? 'v-crit' : p.blackAndWhite ? 'v-bw' : '';
    cls(this.vig, 'hud-vig' + (vig ? ' on ' + vig : ''));
    txt(this.center, p.dead ? (this.game.survivors.some((s) => !s.dead) ? 'You died. Spectating — click to switch. You will rejoin at the next safe room.' : '') : (p.incapped && !p.beingRevived ? 'You are incapacitated! Hold on — your team must help you up.' : ''));
  }
  updateTeam() {
    const g = this.game;
    const mates = g.survivors.filter((s) => s !== g.player);
    while (this.teamRows.length < mates.length) {
      const r = el('div', 'trow', this.team);
      r.av = el('b', 'tav', r);
      const main = el('div', 'tmain', r);
      const head = el('div', 'thead', main);
      r.nameEl = el('div', 'tname', head);
      r.status = el('div', 'tstat', head);
      r.icons = el('div', 'ticons', head);
      const bar = el('div', 'tbar', main);
      r.fill = el('div', 'fill', bar);
      r.temp = el('div', 'temp', bar);
      this.teamRows.push(r);
    }
    this.teamRows.forEach((r, i) => sty(r, 'display', i < mates.length ? '' : 'none'));
    mates.forEach((s, i) => {
      const r = this.teamRows[i];
      const incap = s.incapped && !s.dead;
      txt(r.nameEl, s.netName ? s.name + ' · ' + s.netName : s.name);
      vr(r, '--c', s.char.color);
      vr(r, '--hp', hpColor(s.health + s.temp, incap || s.dead));
      sty(r.fill, 'transform', `scaleX(${clamp01(s.dead ? 0 : incap ? s.incapHP / 300 : s.health / 100).toFixed(3)})`);
      const tf = s.dead || incap ? 0 : Math.min(1 - s.health / 100, s.temp / 100);
      sty(r.temp, 'transform', `translateX(${(clamp01(s.health / 100) * 100).toFixed(1)}%) scaleX(${clamp01(tf).toFixed(3)})`);
      const mode = survivorMode(s);
      const label = mode === 'dead' ? 'Dead' : mode === 'pinned' ? pinLabel(s) : mode === 'incap' ? 'Down' : mode === 'ledge' ? 'Hanging' : mode === 'bw' ? 'B&amp;W' : '';
      htm(r.status, mode ? iconHTML(MODE_ICON[mode]) + `<span>${label}</span>` : '');
      const ic = MODE_ICON[mode] && mode !== 'bw' ? MODE_ICON[mode] : '';
      htm(r.av, ic ? iconHTML(ic) : esc((s.name || '?')[0]));
      cls(r, 'trow' + (mode ? ' st-' + mode : '') + (!mode && s.health + s.temp < 25 ? ' st-crit' : ''));
      htm(r.icons, s.dead ? '' : itemIcons(s.inv) + `<!--${iconGen}-->`);
    });
  }
  updateWeapon(p) {
    const w = p.weapon;
    const item = p.activeItem;
    let ammo = '', clip = '', state = '', name = '';
    if (w) {
      name = w.name;
      if (w.def.melee) ammo = '';
      else if (p.usingMounted) {
        const m = p.usingMounted;
        ammo = `<span class="heat${m.overheated > 0 ? ' over' : ''}"><i style="transform:scaleX(${clamp01(m.heat).toFixed(3)})"></i></span><em>${m.overheated > 0 ? 'Overheated' : 'Heat'}</em>`;
      } else if (w.def.noReload) ammo = `<b>${w.clip}</b>`;
      else {
        ammo = `<b class="${w.clip === 0 ? 'empty' : w.clip <= w.maxClip * 0.25 ? 'low' : ''}">${w.clip}</b><i>/</i><span>${w.reserve === Infinity ? '∞' : w.reserve}</span>`;
        const mc = w.maxClip;
        if (w.reloading && !w.def.shellReload) {
          const tot = w.def.reload * (w.dual ? 1.35 : 1);
          clip = `<div class="cbar rl"><i style="transform:scaleX(${clamp01(1 - w.reloadT / tot).toFixed(3)})"></i></div>`;
        } else if (mc <= 16) {
          let s = '';
          for (let k = 0; k < mc; k++) s += k < w.clip ? '<i class="on"></i>' : '<i></i>';
          clip = `<div class="pips">${s}</div>`;
        } else clip = `<div class="cbar"><i style="transform:scaleX(${clamp01(w.clip / mc).toFixed(3)})"></i></div>`;
        if (w.reloading) state = 'reloading';
        else if (w.clip === 0) state = 'empty';
      }
      if (state === 'reloading') name = 'Reloading';
    } else name = item ? itemName(item) : '';
    txt(this.wname, name);
    htm(this.wammo, ammo);
    htm(this.wclip, clip);
    cls(this.wblock, 'wblock' + (state ? ' ' + state : '') + (w && w.def.melee ? ' melee' : '') + (!w ? ' noweap' : ''));
    // five slots: primary, secondary, throwable, health item, pills/adrenaline
    const inv = p.inv;
    const hk = healthKit(inv);
    const ids = [weaponIconId(inv.primary), weaponIconId(inv.secondary), inv.throwable ? itemIconId(inv.throwable, 'pipebomb') : null,
      hk ? itemIconId(hk, 'medkit') : null, inv.pills ? itemIconId(inv.pills, 'pills') : null];
    const pw = inv.primary;
    const cap = pw && !pw.def.melee ? (pw.def.noReload ? String(pw.clip) : `${pw.clip}<i>/</i>${pw.reserve === Infinity ? '∞' : pw.reserve}`) : '';
    this.slotEls.forEach((e, i) => {
      const id = ids[i];
      cls(e, 'slot s' + i + (i === p.slot && !p.usingMounted ? ' sel' : '') + (id ? '' : ' empty') + (i === 0 && pw && !pw.def.melee && pw.clip + pw.reserve === 0 ? ' dry' : ''));
      const key = (id || '-') + iconGen;
      if (e._key !== key) { e._key = key; e.icon.innerHTML = id ? iconHTML(id) : '<i class="dot"></i>'; }
      if (i === 0) htm(e.cap, cap);
    });
    // slots brighten on any change (switch, pickup, use) and fade back
    const sig = p.slot + '|' + ids.join(',') + (p.usingMounted ? '|m' : '');
    if (this._slotSig !== sig) {
      if (this._slotSig !== undefined) { this.slotShowT = 2.8; this.slots.classList.add('show'); }
      this._slotSig = sig;
    }
  }
  updatePrompt(p) {
    const g = this.game;
    const a = p.action;
    let frac = -1, label = '', glyph = '';
    if (a && a.dur > 0) {
      const who = a.target ? ' ' + a.target.name : '';
      label = a.type === 'heal' ? (a.target ? 'Healing' + who : 'Healing yourself') : a.type === 'use' ? (a.label || 'Using')
        : a.label || (ACTION_LABEL[a.type] || a.type.charAt(0).toUpperCase() + a.type.slice(1)) + who;
      frac = a.t / a.dur;
      glyph = a.type === 'heal' ? iconHTML('medkit') : a.type === 'pills' ? iconHTML(itemIconId(p.inv.pills, 'pills'))
        : a.type === 'revive' ? iconHTML('revive') : hasIcon(a.icon) ? iconHTML(a.icon) : 'E';
    } else if (p.beingRevived || p.beingHealed) {
      const by = p.beingRevived || p.beingHealed;
      label = (p.beingRevived ? 'Being revived by ' : 'Being healed by ') + by.name;
      const ba = by.action;
      frac = ba ? ba.t / ba.dur : 0;
      glyph = iconHTML(p.beingRevived ? 'revive' : 'medkit');
    }
    const busy = frac >= 0;
    if (busy) {
      txt(this.progressLabel, label);
      htm(this.progressGlyph, glyph);
      sty(this.progressBar, 'strokeDashoffset', (100 - clamp01(frac) * 100).toFixed(1));
    }
    cls(this.progress, 'useprompt useprogress hold' + (busy ? ' on' : ''));
    const u = g.currentUsable;
    const show = u && !a && !busy && !p.incapped && !p.dead;
    if (show) {
      txt(this.promptText, u.prompt || '');
      cls(this.prompt, 'useprompt on' + (u.hold ? ' hold' : ''));
    } else cls(this.prompt, 'useprompt' + (this.prompt._cls?.includes(' hold') ? ' hold' : ''));
  }
  drawDamage(dt) {
    const c = this.dmgCtx;
    const W = window.innerWidth, H = window.innerHeight;
    if (this._dW !== W || this._dH !== H) {
      this._dW = W; this._dH = H;
      const css = Math.round(Math.min(H * 0.5, W * 0.56));
      const S = Math.min(1024, Math.round(css * Math.min(2, window.devicePixelRatio || 1)));
      this.dmgCanvas.width = S; this.dmgCanvas.height = S;
      this.dmgCanvas.style.width = this.dmgCanvas.style.height = css + 'px';
      this._dirty = true;
    }
    const p = this.game.player;
    if (!p) return;
    if (!this.dmgInd.length) { if (this._dirty) { c.clearRect(0, 0, this.dmgCanvas.width, this.dmgCanvas.height); this._dirty = false; } return; }
    const S = this.dmgCanvas.width, C = S / 2;
    c.clearRect(0, 0, S, S);
    this._dirty = true;
    c.lineCap = 'round';
    for (let i = this.dmgInd.length - 1; i >= 0; i--) {
      const d = this.dmgInd[i];
      d.t -= dt;
      if (d.t <= 0) { this.dmgInd.splice(i, 1); continue; }
      const ang = Math.atan2(-(d.x - p.pos.x), -(d.z - p.pos.z)) - p.yaw;
      const a = -ang - Math.PI / 2;
      const k = Math.min(1, d.t / 0.7);            // fade out
      const pop = Math.max(0, d.t - 1.0) / 0.2;    // slight inward slide on arrival
      const R = S * (0.42 + pop * 0.03);
      // soft wide glow, then a thin bright arc
      c.strokeStyle = `rgba(255,48,32,${0.14 * k})`;
      c.lineWidth = S * 0.045;
      c.beginPath(); c.arc(C, C, R, a - 0.28, a + 0.28); c.stroke();
      c.strokeStyle = `rgba(255,96,72,${0.8 * k})`;
      c.lineWidth = Math.max(1.5, S * 0.006);
      c.beginPath(); c.arc(C, C, R, a - 0.2, a + 0.2); c.stroke();
    }
  }
  updateTags() {
    const g = this.game;
    const cam = g.renderer.camera;
    const p = g.player;
    const W = window.innerWidth, H = window.innerHeight;
    for (const s of g.survivors) {
      if (s === p) continue;
      let t = this.tagEls.get(s);
      if (!t) { t = el('div', 'tag', this.tags); this.tagEls.set(s, t); }
      if (s.dead) { sty(t, 'display', 'none'); continue; }
      const v = this._v.set(s.pos.x, s.pos.y + (s.incapped ? 0.9 : 2.05), s.pos.z);
      const d = v.distanceTo(cam.position);
      v.project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1 || (d > 25 && !s.incapped && !s.pinned)) { sty(t, 'display', 'none'); continue; }
      sty(t, 'display', 'flex');
      t.style.transform = `translate(${((v.x + 1) / 2 * W).toFixed(1)}px, ${((1 - v.y) / 2 * H).toFixed(1)}px) translate(-50%, -100%)`;
      const trouble = s.incapped || s.pinned;
      cls(t, 'tag' + (trouble ? ' trouble' : ''));
      vr(t, '--c', s.char.color);
      htm(t, trouble ? `${iconHTML(s.pinned ? 'pinned' : 'down')}<span>${s.name}</span>` : `<span>${s.name}</span>`);
      sty(t, 'opacity', Math.max(0.35, 1 - d / 30).toFixed(2));
    }
  }
}
