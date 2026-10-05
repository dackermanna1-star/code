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
  const sort = ['Name', 'Location'].includes(ctx.query.sort) ? ctx.query.sort : '';
  // online users first, then most recently seen
  list.sort((a, b) => (v.isOnline(b) - v.isOnline(a)) || b.lastOnline - a.lastOnline);
  if (sort === 'Name') list.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  if (sort === 'Location') list.sort((a, b) => String(v.isOnline(a) ? a.playingPlaceName || 'Website' : '~').localeCompare(String(v.isOnline(b) ? b.playingPlaceName || 'Website' : '~')));
  const per = 10;
  const pages = Math.max(1, Math.ceil(list.length / per));
  const shown = list.slice((p - 1) * per, p * per);
  const pagerCells = Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1).map((n) => `<td>${n === p ? `<span>${n}</span>` : `<a href="/Browse.aspx?${v.qs({ q, sort, p: n })}">${n}</a>`}</td>`).join('') + (pages > 10 ? `<td><a href="/Browse.aspx?${v.qs({ q, sort, p: 11 })}">...</a></td>` : '');
  const sortLink = (key, label) => `<a href="/Browse.aspx?${v.qs({ q, sort: key })}">${label}</a>`;
  const body = `
<div id="BrowseContainer">
  <div id="BrowseMenu" class="Title"><a class="Title" href="/Browse.aspx">People</a></div>
  <br/>
  <form method="get" action="/Browse.aspx" style="margin:0">
    <input type="text" name="q" maxlength="100" value="${h(q) || 'User'}" onfocus="if(this.value==='User')this.value=''"/>&nbsp;<a href="#" onclick="this.parentNode.submit();return false;">Search</a>
  </form>
  <br/>
  <div>
  <table class="Grid" cellspacing="0" cellpadding="4" border="0">
    <tr class="GridHeader"><th scope="col">Avatar</th><th scope="col">${sortLink('Name', 'Name')}</th><th scope="col">Status</th><th scope="col">${sortLink('Location', 'Location / Last Seen')}</th></tr>
    ${shown.map((u) => `<tr class="GridItem">
      <td><a href="/User.aspx?ID=${u.id}" title="${h(u.name)}">${v.avatarThumb(u, 48, 48)}</a></td>
      <td><a href="/User.aspx?ID=${u.id}">${h(u.name)}</a><br/><span>${h((u.blurb || '').slice(0, 80))}</span></td>
      <td><span>${v.isOnline(u) ? 'Online' : 'Offline'}</span><br/></td>
      <td><span>${v.isOnline(u) ? h(u.playingPlaceName || 'Website') : v.longDate(u.lastOnline)}</span></td>
    </tr>`).join('')}
    ${!shown.length ? '<tr class="GridItem"><td colspan="4" class="NoResults">No people found.</td></tr>' : ''}
    ${pages > 1 ? `<tr class="GridPager"><td colspan="4"><table border="0"><tr>${pagerCells}</tr></table></td></tr>` : ''}
  </table>
  </div>
</div>`;
  return ctx.send(page(ctx, { body }));
}

module.exports = { routes: { '/browse.aspx': browsePage } };
