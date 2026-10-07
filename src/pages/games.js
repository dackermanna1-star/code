// Games.aspx and the place page (places were shown through Item.aspx by mid-2008).
'use strict';
const clock = require('../clock');
const { page } = require('../layout');
const db = require('../db');
const v = require('../views');
const ads = require('../ads');
const { h, commas, clampInt, timeAgo } = require('../util');

const MODES = { MostPopular: 'Most Popular', TopFavorites: 'Top Favorites', RecentlyUpdated: 'Recently Updated' };
const TIMES = { Now: 'Now', PastDay: 'Past Day', PastWeek: 'Past Week', PastMonth: 'Past Month', AllTime: 'All-time' };
const PLAYABLE = new Set(['teapots', 'paintball', 'obby', 'mummy', 'crossroads', 'personal', 'warzone', 'heist', 'disasters', 'megaobby', 'hotel']);

/** Players online drifts a little over time so the page feels alive. */
function onlineNow(p) {
  if (!p.online) return 0;
  const slot = Math.floor(clock.now() / 600000);
  const wobble = Math.sin(slot * 1.7 + p.id) * 0.12;
  return Math.max(1, Math.round(p.online * (1 + wobble)));
}

function playedIn(p, t) {
  const base = p.playedRecent || Math.round(p.visits / 300);
  return { Now: base, PastDay: base * 7, PastWeek: base * 38, PastMonth: base * 140, AllTime: p.visits }[t] ?? base;
}

function gamesPage(ctx) {
  const m = MODES[ctx.query.m] ? ctx.query.m : 'MostPopular';
  const t = TIMES[ctx.query.t] ? ctx.query.t : (m === 'TopFavorites' ? 'AllTime' : 'Now');
  const p = clampInt(ctx.query.p, 1, 999, 1);
  let list = Object.values(ctx.state.places).filter((pl) => pl.public);
  if (m === 'MostPopular') list.sort((a, b) => (t === 'Now' ? onlineNow(b) - onlineNow(a) : 0) || playedIn(b, t) - playedIn(a, t));
  else if (m === 'TopFavorites') list.sort((a, b) => b.favorited - a.favorited);
  else list.sort((a, b) => b.updated - a.updated);
  const per = 15;
  const pages = Math.max(1, Math.ceil(list.length / per));
  const shown = list.slice((p - 1) * per, p * per);
  const url = (n) => `/Games.aspx?${v.qs({ m, t: m === 'RecentlyUpdated' ? null : t, p: n })}`;
  const bullet = '<img class="GamesBullet" src="/images/games_bullet.png" alt="Bullet" border="0"/>';
  const sel = (on, href, label) => `<li>${on ? bullet : ''}<a href="${href}">${on ? `<b>${label}</b>` : label}</a></li>`;
  const label = m === 'MostPopular' ? `Most Popular (${TIMES[t]})` : m === 'TopFavorites' ? `Top Favorites (${TIMES[t]})` : 'Recently Updated';
  const rows = [];
  for (let i = 0; i < shown.length; i += 3) rows.push(shown.slice(i, i + 3));
  const cell = (pl) => {
    const c = db.userById(pl.creatorId);
    const online = onlineNow(pl);
    return `<td class="Game" valign="top"><div>
      <div class="GameThumbnail"><a title="${h(pl.name)}" href="/Item.aspx?ID=${pl.id}">${v.placeThumb(pl, 160, 100)}</a></div>
      <div class="GameDetails">
        <div class="GameName"><a href="/Item.aspx?ID=${pl.id}">${h(pl.name)}</a></div>
        <div class="GameLastUpdate"><span class="Label">Updated:</span> <span class="Detail">${timeAgo(pl.updated)}</span></div>
        <div class="GameCreator"><span class="Label">Creator:</span> <span class="Detail">${v.userLink(c)}</span></div>
        <div class="AssetFavorites"><span class="Label">Favorited:</span> <span class="Detail">${commas(pl.favorited)} times</span></div>
        <div class="GamePlays"><span class="Label">Played:</span> <span class="Detail">${commas(playedIn(pl, t))} times</span></div>
        ${online ? `<div class="GameCurrentPlayers"><span class="DetailHighlighted">${commas(online)} players online</span></div>` : ''}
      </div></div></td>`;
  };
  const showAd = !(ctx.user && ctx.user.bc);
  const body = `
<div id="GamesContainer">
  <div class="DisplayFilters">
    <h2>Games&nbsp;<a href="/Games.aspx?${v.qs({ m, t })}&amp;feed=rss"><img src="/images/feed-icons/feed-icon-14x14.png" alt="RSS" border="0"/></a></h2>
    <div id="BrowseMode">
      <h4>Browse</h4>
      <ul>
        ${sel(m === 'MostPopular', '/Games.aspx?m=MostPopular&amp;t=Now', 'Most Popular')}
        ${sel(m === 'TopFavorites', '/Games.aspx?m=TopFavorites&amp;t=AllTime', 'Top Favorites')}
        ${sel(m === 'RecentlyUpdated', '/Games.aspx?m=RecentlyUpdated', 'Recently Updated')}
        <li><a href="/User.aspx?ID=1&amp;favcat=Place#Favorites">Featured Games</a></li>
      </ul>
    </div>
    ${m !== 'RecentlyUpdated' ? `<div id="Timespan">
      <h4>Time</h4>
      <ul>${Object.entries(TIMES).map(([k, lbl]) => sel(t === k, `/Games.aspx?m=${m}&amp;t=${k}`, lbl)).join('')}</ul>
    </div>` : ''}
  </div>
  <div id="Games">
    <span class="GamesDisplaySet">${label}</span>
    ${v.pager(p, pages, url)}
    <table cellspacing="0" align="Center" border="0" width="550">
      ${rows.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('')}
    </table>
    ${v.pager(p, pages, url)}
  </div>
  ${showAd ? `<div class="Ads_WideSkyscraper">${ads.skyscraper()}</div>` : ''}
  <div style="clear:both"></div>
</div>`;
  return ctx.send(page(ctx, { title: `ROBLOX Games - ${label}`, body }));
}

function commentsBlock(ctx, key, returnUrl, label = 'Comment on this place') {
  const list = (ctx.state.comments[key] || []).slice().sort((a, b) => b.t - a.t);
  const p = clampInt(ctx.query.cp, 1, 999, 1);
  const per = 10;
  const pages = Math.max(1, Math.ceil(list.length / per));
  const shown = list.slice((p - 1) * per, p * per);
  const pg = (n) => `${returnUrl}&amp;cp=${n}#Comments`;
  return `
  <div class="CommentsContainer" id="Comments">
    <h3>Comments (${list.length})</h3>
    ${list.length ? v.pager(p, pages, pg, 'HeaderPager', '') : ''}
    <div class="Comments">
      ${shown.map((c, i) => { const u = db.userById(c.userId); return `<div class="${i % 2 ? 'AlternateComment' : 'Comment'}">
        <div class="Commenter"><div class="Avatar"><a title="${h(u?.name)}" href="/User.aspx?ID=${u?.id}">${v.avatarThumb(u, 64, 64)}</a></div></div>
        <div class="Post"><div class="Audit">Posted ${timeAgo(c.t)} by ${v.userLink(u)}</div><div class="Content">${h(c.text)}</div></div>
        <div style="clear:both"></div></div>`; }).join('') || '<div class="Comment">No comments yet. Be the first!</div>'}
    </div>
    ${ctx.user ? `<div class="PostAComment">
      <h3>${label}</h3>
      <form method="post" action="${returnUrl.replace(/&amp;/g, '&')}&amp;comment=1#Comments">
        <textarea name="comment" class="MultilineTextBox" rows="5" cols="40" maxlength="200"></textarea>
        <div class="Buttons"><input type="submit" class="Button" value="Post Comment"/></div>
      </form>
    </div>` : `<p><a href="/Login/Default.aspx?ReturnUrl=${encodeURIComponent(returnUrl.replace(/&amp;/g, '&'))}">Login</a> to post a comment.</p>`}
  </div>`;
}

function handleCommentPost(ctx, key) {
  if (ctx.method !== 'POST' || !ctx.user || !ctx.query.comment) return false;
  const text = String(ctx.form.comment || '').trim().slice(0, 200);
  if (text) {
    (ctx.state.comments[key] ||= []).push({ userId: ctx.user.id, text, t: clock.now() });
    db.save();
  }
  return true;
}

function placePage(ctx, pl) {
  const back = `/Item.aspx?ID=${pl.id}`;
  if (handleCommentPost(ctx, 'place:' + pl.id)) return ctx.redirect(back + '#Comments');
  if (ctx.method === 'POST' && ctx.user && ctx.query.favorite) {
    const favs = ctx.user.favorites.places;
    const i = favs.indexOf(pl.id);
    if (i >= 0) { favs.splice(i, 1); pl.favorited = Math.max(0, pl.favorited - 1); } else { favs.push(pl.id); pl.favorited++; }
    db.save();
    return ctx.redirect(back);
  }
  const creator = db.userById(pl.creatorId);
  const isFav = ctx.user && ctx.user.favorites.places.includes(pl.id);
  const online = onlineNow(pl);
  const playable = PLAYABLE.has(pl.script);
  // running game servers (simulated): fill servers of maxPlayers with members
  const bots = db.users().filter((u) => u.isBot);
  const servers = [];
  if (playable && online) {
    let remaining = Math.min(online, 3 * pl.maxPlayers);
    let k = pl.id % 7;
    while (remaining > 0 && servers.length < 3) {
      const n = Math.min(pl.maxPlayers - (servers.length % 2), remaining);
      servers.push({ id: 6050357 + pl.id % 1000 + servers.length * 13, players: Array.from({ length: Math.min(n, 8) }, () => bots[(k++) % bots.length]), count: n });
      remaining -= n;
    }
  }
  const showAd = !(ctx.user && ctx.user.bc);
  const body = `
<div id="ItemContainer">
  <div id="Item">
    <h2>${h(pl.name)}</h2>
    <div id="Details">
      <div id="Summary">
        <h3>ROBLOX Place</h3>
        <div id="Creator" class="Creator">
          <div class="Avatar"><a title="${h(creator?.name)}" href="/User.aspx?ID=${creator?.id}">${v.avatarThumb(creator, 100, 100)}</a></div>
          Creator: ${v.userLink(creator)}
        </div>
        <div id="LastUpdate">Updated: ${timeAgo(pl.updated)}</div>
        <div id="Favorited">Favorited: ${commas(pl.favorited)} times</div>
        <div class="Visited">Visited: ${commas(pl.visits)} times</div>
        <div>
          <div id="DescriptionLabel">Description:</div>
          <div id="Description">${h(pl.desc || '').replace(/\n/g, '<br/>') || '&nbsp;'}</div>
        </div>
        <div id="ReportAbuse"><div class="ReportAbusePanel"><span class="AbuseIcon"><a href="/AbuseReport/Asset.aspx?ID=${pl.id}"><img src="/images/abuse.png" alt="Report Abuse" border="0"/></a></span> <span class="AbuseButton"><a href="/AbuseReport/Asset.aspx?ID=${pl.id}">Report Abuse</a></span></div></div>
      </div>
      <div id="Thumbnail_Place"><a title="${h(pl.name)}">${v.placeThumb(pl, 420, 230)}</a></div>
      <div id="Actions_Place">
        ${ctx.user ? `<form method="post" action="${back}&amp;favorite=1" style="display:inline"><a href="#" onclick="this.parentNode.submit();return false;">${isFav ? 'Unfavorite' : 'Favorite'}</a></form>` : '<a href="/Login/Default.aspx">Favorite</a>'}
      </div>
      <div class="PlayGames">
        <div><span><img src="/images/public.png" alt="Public" border="0"/>&nbsp;Public</span>
          <img src="/images/CopyLocked.png" alt="CopyLocked" border="0"/> Copy Protection: CopyLocked </div>
        <div style="display:inline"><a class="Button" href="#" onclick="return rbxVisit(${pl.id},'online')">Visit Online</a></div>
        <div style="display:inline">&nbsp;&nbsp;&nbsp;<a class="Button" href="#" onclick="return rbxVisit(${pl.id},'solo')">Visit Solo</a></div>
      </div>
      <div style="clear:both"></div>
    </div>
    <div style="margin: 10px; width: 703px;">
      <div class="ajax__tab_xp" id="TabbedInfo">
        <div class="ajax__tab_header" id="TabbedInfo_header">
          <span class="ajax__tab_tab ajax__tab_active" data-tab="GamesTab" onclick="rbxTab(this)"><h3 style="color: #555;">Games</h3></span><span class="ajax__tab_tab" data-tab="CommentaryTab" onclick="rbxTab(this)"><h3 style="color: #555;">Commentary</h3></span>
        </div>
        <div class="ajax__tab_body" id="TabbedInfo_body">
          <div id="GamesTab" class="ajax__tab_panel">
            <div id="RunningGamesUpdatePanel">
              ${servers.length ? `<table cellspacing="0" border="0" width="100%">${servers.map((s) => `<tr><td><div class="GameInstance" style="margin: 3px 0">
                <div style="float: right;">${s.players.map((u) => `<a title="${h(u.name)}" href="/User.aspx?ID=${u.id}" style="display:inline-block;">${v.avatarThumb(u, 48, 48)}</a>`).join(' ')}</div>
                <div style="text-align: left;">${s.count} players of ${pl.maxPlayers} max<br/><a class="Button" href="#" onclick="return rbxVisit(${pl.id},'online')">Join</a>&nbsp;&nbsp;</div>
              </div></td></tr>`).join('')}</table>` : '<div class="GameInstance">No games are running right now.</div>'}
              <div class="RefreshRunningGames"><a class="Button" href="${back}">Refresh</a></div>
            </div>
          </div>
          <div id="CommentaryTab" class="ajax__tab_panel" style="display:none">
            ${commentsBlock(ctx, 'place:' + pl.id, back)}
          </div>
        </div>
      </div>
    </div>
  </div>
  ${showAd ? `<div class="Ads_WideSkyscraper">${ads.skyscraper()}</div>` : ''}
  <div style="clear:both"></div>
</div>
${ctx.query.cp || ctx.query.comment ? '<script>rbxShowTab("CommentaryTab")</script>' : ''}`;
  return ctx.send(page(ctx, { body }));
}

function legacyPlace(ctx) {
  return ctx.redirect('/Item.aspx?ID=' + encodeURIComponent(ctx.query.id || ctx.query.ID || ''));
}

module.exports = { routes: { '/games.aspx': gamesPage, '/place.aspx': legacyPlace }, placePage, commentsBlock, handleCommentPost, onlineNow, PLAYABLE };
