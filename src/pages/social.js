// People (/Browse.aspx): search users, with status and location columns.
'use strict';
const { page } = require('../layout');
const db = require('../db');
const v = require('../views');
const { h, clampInt } = require('../util');

function browsePage(ctx) {
  const q = String(ctx.query.q || ctx.query.name || '').trim();
  const p = clampInt(ctx.query.p, 1, 999, 1);
  let list = db.users().filter((u) => u.id !== 1);
  if (q) list = list.filter((u) => u.name.toLowerCase().includes(q.toLowerCase()));
  // online users first, then most recently seen
  list.sort((a, b) => (v.isOnline(b) - v.isOnline(a)) || b.lastOnline - a.lastOnline);
  const per = 10;
  const pages = Math.max(1, Math.ceil(list.length / per));
  const shown = list.slice((p - 1) * per, p * per);
  const pagerLinks = Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1).map((n) => (n === p ? `<span>${n}</span>` : `<a href="/Browse.aspx?${v.qs({ q, p: n })}">${n}</a>`)).join(' ') + (pages > 10 ? ' <a href="/Browse.aspx?' + v.qs({ q, p: 11 }) + '">...</a>' : '');
  const body = `
<div id="BrowseContainer">
  <div class="BrowseMenu"><a class="Title" href="/Browse.aspx">People</a></div>
  <form method="get" action="/Browse.aspx" class="BrowseSearch">
    <input type="text" name="q" maxlength="100" class="Text" value="${h(q) || 'User'}" onfocus="if(this.value==='User')this.value=''"/> <a href="#" onclick="this.parentNode.submit();return false;">Search</a>
  </form>
  <table class="Grid" cellspacing="0" cellpadding="4" border="0" align="center">
    <tr class="GridHeader"><th>Avatar</th><th>Name</th><th>Status</th><th>Location / Last Seen</th></tr>
    ${shown.map((u) => `<tr class="GridItem">
      <td><a href="/User.aspx?ID=${u.id}" title="${h(u.name)}">${v.avatarThumb(u, 48, 48)}</a></td>
      <td><a href="/User.aspx?ID=${u.id}">${h(u.name)}</a>${u.blurb ? `<br/><span class="Blurb">${h(u.blurb.slice(0, 80))}</span>` : ''}</td>
      <td>${v.isOnline(u) ? 'Online' : 'Offline'}</td>
      <td>${v.isOnline(u) ? h(u.playingPlaceName || 'Website') : v.longDate(u.lastOnline)}</td>
    </tr>`).join('')}
    ${!shown.length ? '<tr class="GridItem"><td colspan="4" class="NoResults">No people found.</td></tr>' : ''}
    <tr class="GridPager"><td colspan="4">${pagerLinks}</td></tr>
  </table>
</div>`;
  return ctx.send(page(ctx, { body }));
}

module.exports = { routes: { '/browse.aspx': browsePage } };
