// Shared item-slot element (hotbar, inventory grids, equipment, loot).
import { getItemDef } from '../items/items.js';
import { getItemIconURL } from '../items/icons.js';
import { h, setText, setStyle, setClass } from './dom.js';
import { pixelURL } from './pixel.js';

export function makeSlot(cls = '') {
  const el = h('div.slot' + (cls ? '.' + cls.split(' ').join('.') : ''));
  el._sil = h('img.slot-sil.px', { draggable: false, alt: '' });
  el._icon = h('img.slot-icon.px', { draggable: false, alt: '' });
  el._count = h('span.slot-count');
  el._ammo = h('span.slot-ammo');
  el._barWrap = h('div.slot-bar');
  el._bar = h('i');
  el._barWrap.appendChild(el._bar);
  el.append(el._sil, el._icon, el._count, el._ammo, el._barWrap);
  el._sil.style.display = 'none';
  el._icon.style.display = 'none';
  el._barWrap.style.display = 'none';
  return el;
}

export function setSilhouette(el, name) {
  if (name) {
    el._sil.src = pixelURL(name);
    el._silName = name;
  }
}

function condColor(f) {
  // green -> yellow -> red
  if (f > 0.6) return '#6fbf3f';
  if (f > 0.3) return '#d9b13a';
  return '#d0402a';
}

/** Return the 0..1 bar value (durability / uses / battery) of a stack, or null. */
export function stackBar(stack, def) {
  if (!stack) return null;
  if (def.durability && stack.dur != null) return { v: stack.dur / def.durability, kind: 'dur' };
  if (def.liquidContainer && stack.uses != null) return { v: stack.uses / (def.liquidContainer.capacity || def.uses || 1), kind: 'liq' };
  if (def.uses && stack.uses != null && def.uses > 1) return { v: stack.uses / def.uses, kind: 'uses' };
  return null;
}

/** Update a slot element for a stack (cheap when unchanged). */
export function fillSlot(el, stack) {
  const id = stack ? stack.id : null;
  const count = stack ? stack.count || 1 : 0;
  const dur = stack ? stack.dur : null;
  const uses = stack ? stack.uses : null;
  const ammo = stack ? stack.ammo : null;
  if (el._id === id && el._n === count && el._dur === dur && el._uses === uses && el._am === ammo) return;
  el._id = id; el._n = count; el._dur = dur; el._uses = uses; el._am = ammo;
  if (!stack) {
    el._icon.style.display = 'none';
    el._icon.removeAttribute('src');
    setText(el._count, '');
    setText(el._ammo, '');
    el._barWrap.style.display = 'none';
    el._sil.style.display = el._silName ? '' : 'none';
    setClass(el, 'filled', false);
    el.removeAttribute('data-rarity');
    return;
  }
  const def = getItemDef(stack.id);
  el._sil.style.display = 'none';
  el._icon.style.display = '';
  const url = getItemIconURL(def);
  if (el._icon._src !== url) { el._icon._src = url; el._icon.src = url; }
  setText(el._count, count > 1 ? count : '');
  setText(el._ammo, def.firearm && ammo != null ? ammo : '');
  const bar = stackBar(stack, def);
  if (bar && (bar.kind !== 'dur' || bar.v < 0.999)) {
    el._barWrap.style.display = '';
    const v = Math.max(0, Math.min(1, bar.v));
    setStyle(el._bar, 'width', (v * 100).toFixed(1) + '%');
    setStyle(el._bar, 'background', bar.kind === 'dur' ? condColor(v) : '#5aa8e6');
  } else {
    el._barWrap.style.display = 'none';
  }
  setClass(el, 'filled', true);
  el.dataset.rarity = def.rarity || 'common';
}
