// Boot loading screen: the title art on a dark ember glow, a thin progress bar, the current
// step and a rotating hint about the zombie mode.
//
//   const L = buildLoading();  root.appendChild(L.el);  L.set(text, progress 0..1);  L.el.remove()
import { titleSVG } from './titleart.js';

export const LOADING_TIPS = [
  'Cash is scarce now. Buy between waves, and save up for the big guns.',
  'Go down and you are not dead yet: a teammate can hold E on you to pick you up.',
  'Special infected pay far more than commons. Kill them first.',
  'The buy menu has an Upgrades & Skins page for the gun in your hands.',
  'Remote C4 sticks to whatever it hits, zombies included. Press V to set it off.',
  'Ready early? Press F1 in the break and the next wave comes sooner.',
  'Bots follow radio orders: Z, X and C open the radio menus.',
  'Too close? Press T or Mouse 4 to shove them back. It frees a grabbed teammate too.',
  'Sandbox keeps the old way to play: $16000, buy anything, anywhere.',
];

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export function buildLoading() {
  const root = el('div', 'fe-loading fe');
  root.append(el('div', 'fe-kicker', 'Counter-Strike 1.6 &middot; browser remake'));
  root.append(el('div', 'fe-title', titleSVG('DEAD OF DUST', { id: 'ld' })));
  root.append(el('div', 'fe-sub', 'Zombie survival'));
  const bar = el('div', 'fe-loadbar');
  const fill = el('i');
  bar.appendChild(fill);
  const msg = el('div', 'fe-loadmsg');
  const tip = el('div', 'fe-loadtip');
  tip.innerHTML = `<b>TIP</b>${LOADING_TIPS[(Math.random() * LOADING_TIPS.length) | 0]}`;
  root.append(bar, msg, tip);
  return {
    el: root,
    set(text, p) {
      msg.textContent = text || '';
      fill.style.width = Math.round(Math.max(0, Math.min(1, p || 0)) * 100) + '%';
    },
  };
}
