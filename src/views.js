// Shared view helpers: thumbnails, links, pagers, prices, online status.
'use strict';
const clock = require('./clock');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { h, commas, timeAgo, longDate } = require('./util');

const THUMB_VERSION = 5; // bump to re-render every cached thumbnail

/** Resolve a user's worn items into the appearance the 3D renderer needs. */
function appearanceOf(user) {
  const a = user.avatar || {};
  const item = (id) => (id ? db.itemById(id) : null);
  const hat = item(a.hat), shirt = item(a.shirt), pants = item(a.pants), tshirt = item(a.tshirt);
  return {
    colors: a.colors,
    face: 'Smile',
    hats: hat && hat.model ? [hat.model] : [],
    shirt: shirt ? shirt.spec : null,
    pants: pants ? pants.spec : null,
    tshirt: tshirt ? tshirt.spec : null,
  };
}

function thumbFile(kind, key, w, ht) { return `${kind}-${key}-${w}x${ht}.png`; }

/**
 * <img> for a rendered thumbnail. If the PNG is already cached it is served
 * directly; otherwise the page renders it with the 3D engine and uploads it.
 */
function thumb({ kind, w, h: ht, alt = '', data, key, cls = '', title }) {
  const file = thumbFile(kind, key, w, ht);
  const exists = fs.existsSync(path.join(db.THUMB_DIR, file));
  const t = title ? ` title="${h(title)}"` : '';
  if (exists) return `<img src="/Thumbs/${file}" width="${w}" height="${ht}" border="0" alt="${h(alt)}"${t} class="${cls}"/>`;
  const payload = h(JSON.stringify({ kind, w, h: ht, file, data }));
  return `<img src="/images/blank.gif" width="${w}" height="${ht}" border="0" alt="${h(alt)}"${t} class="RenderThumb ${cls}" data-thumb="${payload}"/>`;
}

function avatarThumb(user, w, ht, cls = '') {
  if (!user) return '';
  const app = appearanceOf(user);
  const key = crypto.createHash('sha1').update(JSON.stringify(app) + THUMB_VERSION).digest('hex').slice(0, 16);
  return thumb({ kind: 'avatar', w, h: ht, alt: user.name, title: user.name, key, data: app, cls });
}

function assetThumb(item, w, ht, cls = '') {
  return thumb({ kind: 'asset', w, h: ht, alt: item.name, title: item.name, key: `${item.id}-v${THUMB_VERSION}`, data: { type: item.type, model: item.model, spec: item.spec, name: item.name }, cls });
}

function placeThumb(place, w, ht, cls = '') {
  return thumb({ kind: 'place', w, h: ht, alt: place.name, title: place.name, key: `${place.id}-v${THUMB_VERSION}-${place.thumbVersion || 0}`, data: { id: place.id, script: place.script, theme: place.theme, name: place.name }, cls });
}

function userLink(user) {
  if (!user) return '';
  return `<a href="/User.aspx?ID=${user.id}">${h(user.name)}</a>`;
}

function isOnline(user) { return user && clock.now() - (user.lastOnline || 0) < 5 * 60000; }

function onlineStatus(user) {
  if (isOnline(user)) return `<span class="UserOnlineMessage">[ Online: ${h(user.playingPlaceName || 'Website')} ]</span>`;
  return `<span class="UserOfflineMessage">[ Offline ]</span>`;
}

function price(item) {
  let s = '';
  if (item.robux != null) s += `<div class="AssetPrice"><span class="PriceInRobux">R$: ${commas(item.robux)}</span></div>`;
  if (item.tix != null) s += `<div class="AssetPrice"><span class="PriceInTickets">Tx: ${commas(item.tix)}</span></div>`;
  return s;
}

/** "Page 1 of 11: Next >>" pager. makeUrl(p) builds a link for page p. */
function pager(page, pages, makeUrl, id = 'HeaderPager', sep = ':') {
  let s = `<div class="${id === 'FooterPager' ? 'FooterPager' : 'HeaderPager'}"><span>Page ${page} of ${Math.max(1, pages)}${sep}</span> `;
  if (page > 1) s += `<a href="${makeUrl(page - 1)}"><span class="NavigationIndicators">&lt;&lt;</span> Previous</a> `;
  if (page < pages) s += `<a href="${makeUrl(page + 1)}">Next <span class="NavigationIndicators">&gt;&gt;</span></a>`;
  return s + '</div>';
}

function qs(params) {
  return Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

const TYPE_LABEL = { Hat: 'Hat', TShirt: 'T-Shirt', Shirt: 'Shirt', Pants: 'Pants', Decal: 'Decal', Model: 'Model', Place: 'Place' };
const CATEGORY = { 2: 'TShirt', 11: 'Shirt', 12: 'Pants', 8: 'Hat', 13: 'Decal', 10: 'Model', 9: 'Place' };
const CATEGORY_NAME = { 2: 'T-Shirts', 11: 'Shirts', 12: 'Pants', 8: 'Hats', 13: 'Decals', 10: 'Models', 9: 'Places' };

module.exports = {
  appearanceOf, thumb, avatarThumb, assetThumb, placeThumb, userLink, onlineStatus, isOnline, price, pager, qs,
  TYPE_LABEL, CATEGORY, CATEGORY_NAME, timeAgo, longDate, h, commas,
};
