// Catalog.aspx (mid-2008 layout) and Item.aspx for catalog assets.
'use strict';
const { page } = require('../layout');
const db = require('../db');
const v = require('../views');
const ads = require('../ads');
const economy = require('../economy');
const games = require('./games');
const { h, commas, clampInt, timeAgo } = require('../util');

const MODES = { TopFavorites: 'Top Favorites', BestSelling: 'Best Selling', RecentlyUpdated: 'Recently Updated', ForSale: 'For Sale', PublicDomain: 'Public Domain' };
const TIMES = { PastDay: 'Past Day', PastWeek: 'Past Week', PastMonth: 'Past Month', AllTime: 'All-time' };
const CAT_ORDER = [2, 11, 12, 8, 13, 10, 9];

function catalogPage(ctx) {
  const m = MODES[ctx.query.m] ? ctx.query.m : 'TopFavorites';
  const c = v.CATEGORY[ctx.query.c] ? Number(ctx.query.c) : 8;
  const t = TIMES[ctx.query.t] ? ctx.query.t : 'PastWeek';
  const q = String(ctx.query.q || '').trim();
  const p = clampInt(ctx.query.p, 1, 999, 1);
  const type = v.CATEGORY[c];
  let list;
  if (type === 'Place') list = Object.values(ctx.state.places).filter((pl) => pl.public && pl.script !== 'personal').map((pl) => ({ ...pl, type: 'Place', sales: pl.visits, isPlace: true }));
  else list = Object.values(ctx.state.items).filter((i) => i.type === type);
  if (q) list = list.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
  if (m === 'ForSale') list = list.filter((i) => i.forSale && (i.robux || i.tix));
  if (m === 'PublicDomain') list = list.filter((i) => i.publicDomain);
  if (m === 'TopFavorites') list.sort((a, b) => b.favorited - a.favorited);
  else if (m === 'BestSelling') list.sort((a, b) => b.sales - a.sales);
  else list.sort((a, b) => b.updated - a.updated);
  const per = 20;
  const pages = Math.max(1, Math.ceil(list.length / per));
  const shown = list.slice((p - 1) * per, p * per);
  const base = { m, c, t, q };
  const url = (over) => `/Catalog.aspx?${v.qs({ ...base, ...over })}`;
  const bullet = '<img class="GamesBullet" src="/images/games_bullet.png" border="0" alt=""/>';
  const li = (on, href, label) => `<li>${on ? bullet : ''}<a href="${href}">${on ? `<b>${label}</b>` : label}</a></li>`;
  const catName = v.CATEGORY_NAME[c];
  const label = q ? `Search results for "${h(q)}"`
    : m === 'TopFavorites' ? `Favorite ${catName}, ${TIMES[t]}`
      : m === 'BestSelling' ? `Best Selling ${catName}, ${TIMES[t]}`
        : m === 'RecentlyUpdated' ? `Recently Updated ${catName}`
          : m === 'ForSale' ? `${catName} For Sale` : `Public Domain ${catName}`;
  const rows = [];
  for (let i = 0; i < shown.length; i += 5) rows.push(shown.slice(i, i + 5));
  const cell = (it) => {
    const creator = db.userById(it.creatorId);
    return `<td valign="top"><div class="Asset">
      <div class="AssetThumbnail"><a title="${h(it.name)}" href="/Item.aspx?ID=${it.id}">${it.isPlace ? v.placeThumb(it, 120, 120) : v.assetThumb(it, 120, 120)}</a></div>
      <div class="AssetDetails">
        <div class="AssetName"><a href="/Item.aspx?ID=${it.id}">${h(it.name)}</a></div>
        <div class="AssetLastUpdate"><span class="Label">Updated:</span> <span class="Detail">${timeAgo(it.updated)}</span></div>
        <div class="AssetCreator"><span class="Label">Creator:</span> <span class="Detail">${v.userLink(creator)}</span></div>
        ${it.isPlace ? `<div class="AssetsSold"><span class="Label">Visited:</span> <span class="Detail">${commas(it.visits)} times</span></div>` : `<div class="AssetsSold"><span class="Label">Number Sold:</span> <span class="Detail">${commas(it.sales)}</span></div>`}
        <div class="AssetFavorites"><span class="Label">Favorited:</span> <span class="Detail">${commas(it.favorited)} times</span></div>
        ${it.isPlace ? '' : it.forSale ? v.price(it) : it.publicDomain ? '<div class="AssetPrice"><span class="PriceInPublicDomain">Free</span></div>' : ''}
      </div></div></td>`;
  };
  const body = `
<div id="CatalogContainer">
  <div id="SearchBar" class="SearchBar">
    <form method="get" action="/Catalog.aspx">
      <input type="hidden" name="m" value="${m}"/><input type="hidden" name="c" value="${c}"/>
      <span class="SearchBox"><input name="q" type="text" maxlength="100" class="TextBox" value="${h(q)}"/></span>
      <span class="SearchButton"><input type="submit" value="Search"/></span>
    </form>
  </div>
  <div class="DisplayFilters">
    <h2>Catalog</h2>
    <div id="BrowseMode">
      <h4><a href="/info/BuyRobloxStuff.aspx">Buy ROBLOX Stuff!</a></h4>
      <h4>Browse</h4>
      <ul>${Object.entries(MODES).map(([k, lbl]) => li(m === k, url({ m: k, p: null, q: null }), lbl)).join('')}</ul>
    </div>
    <div id="Category">
      <h4>Category</h4>
      <ul>${CAT_ORDER.map((k) => li(c === k, url({ c: k, p: null, q: null }), v.CATEGORY_NAME[k])).join('')}</ul>
    </div>
    ${m === 'TopFavorites' || m === 'BestSelling' ? `<div id="Timespan">
      <h4>Time</h4>
      <ul>${Object.entries(TIMES).map(([k, lbl]) => li(t === k, url({ t: k, p: null }), lbl)).join('')}</ul>
    </div>` : ''}
  </div>
  <div class="Assets">
    <span class="AssetsDisplaySet">${label}</span>
    ${v.pager(p, pages, (n) => url({ p: n }), 'HeaderPager', '')}
    ${shown.length ? `<table cellspacing="0" align="Center" border="0" width="735">${rows.map((r) => `<tr>${r.map(cell).join('')}${'<td width="20%"></td>'.repeat(5 - r.length)}</tr>`).join('')}</table>` : '<div class="NoResults">No items found.</div>'}
    ${v.pager(p, pages, (n) => url({ p: n }), 'FooterPager', '')}
  </div>
  <div style="clear:both"></div>
</div>`;
  return ctx.send(page(ctx, { title: 'Roblox - Catalog', body }));
}

function itemPage(ctx) {
  const id = Number(ctx.query.ID || ctx.query.id);
  const place = db.placeById(id);
  if (place) return games.placePage(ctx, place);
  const it = db.itemById(id);
  if (!it) return ctx.send(page(ctx, { body: '<div class="NoResults" style="padding:60px;font-family:Verdana;font-size:1.2em">This item does not exist.</div>' }), 404);
  const back = `/Item.aspx?ID=${it.id}`;
  if (games.handleCommentPost(ctx, 'item:' + it.id)) return ctx.redirect(back + '#Comments');

  let notice = '';
  if (ctx.method === 'POST' && ctx.user) {
    if (ctx.query.favorite) {
      const favs = ctx.user.favorites.items;
      const i = favs.indexOf(it.id);
      if (i >= 0) { favs.splice(i, 1); it.favorited = Math.max(0, it.favorited - 1); } else { favs.push(it.id); it.favorited++; }
      db.save();
      return ctx.redirect(back);
    }
    if (ctx.query.buy) {
      const r = economy.purchase(ctx.user, it, ctx.query.buy);
      return ctx.redirect(back + (r.ok ? '&purchased=1' : '&error=' + encodeURIComponent(r.error)));
    }
  }
  if (ctx.query.purchased) notice = `<div class="PurchaseNotice">Purchase successful! ${it.type === 'Model' || it.type === 'Decal' ? 'It is now in your Stuff.' : `<a href="/My/Character.aspx">Wear it now!</a>`}</div>`;
  if (ctx.query.error) notice = `<div class="PurchaseNotice Error">${h(ctx.query.error)}</div>`;

  const creator = db.userById(it.creatorId);
  const owned = ctx.user && ctx.user.inventory.includes(it.id);
  const isFav = ctx.user && ctx.user.favorites.items.includes(it.id);
  const typeLabel = v.TYPE_LABEL[it.type];
  const buyBtn = (cur, label) => (ctx.user ? `<a class="Button" href="#" onclick="return rbxPurchase(${it.id},'${cur}')">${label}</a>` : `<a class="Button" href="/Login/Default.aspx?ReturnUrl=${encodeURIComponent(back)}">${label}</a>`);
  let purchase = '';
  if (it.forSale) {
    if (it.tix != null) purchase += `<div id="TicketsPurchase"><div id="PriceInTickets">Tx: ${commas(it.tix)}</div><div id="BuyWithTickets">${buyBtn('tix', 'Buy with Tx')}</div></div>`;
    if (it.robux != null) purchase += `<div id="RobuxPurchase"><div id="PriceInRobux">R$: ${commas(it.robux)}</div><div id="BuyWithRobux">${buyBtn('robux', 'Buy with R$')}</div></div>`;
  } else if (it.publicDomain) {
    purchase = `<div id="PublicDomainPurchase"><div id="PricePublicDomain">Free</div><div id="BuyForFree">${ctx.user ? `<a class="Button" href="#" onclick="return rbxPurchase(${it.id},'free')">Take One!</a>` : `<a class="Button" href="/Login/Default.aspx">Take One!</a>`}</div></div>`;
  } else if (!owned && it.bcOnly) {
    purchase = '<div class="OffSale">Builders Club members receive this hat. <a href="/Upgrades/BuildersClub.aspx">Join Builders Club</a></div>';
  } else if (!owned) {
    purchase = '<div class="OffSale">This item is no longer for sale.</div>';
  }
  const modal = ctx.user ? `
<div id="PurchaseModalBackground" class="modalBackground" style="display:none"></div>
<div id="PurchaseModal" class="modalPopup" style="display:none;width:27em">
  <div style="margin:1.5em">
    <h3>Purchase Item:</h3>
    <p id="PurchaseQuestion"></p>
    <p id="PurchaseBalance"></p>
    <form method="post" id="PurchaseForm"><p><input type="submit" value="Buy Now!" class="MediumButton" style="width:100%"/></p></form>
    <p><input type="button" value="Cancel" class="MediumButton" style="width:100%" onclick="rbxClosePurchase()"/></p>
  </div>
</div>
<script>
var rbxItem = ${JSON.stringify({ id: it.id, name: it.name, type: typeLabel, creator: creator?.name || 'ROBLOX', robux: it.robux, tix: it.tix, balRobux: ctx.user.robux, balTix: ctx.user.tix })};
</script>` : '';
  const showAd = !(ctx.user && ctx.user.bc);
  const body = `
<div id="ItemContainer">
  <div id="Item">
    <h2>${h(it.name)}</h2>
    <div id="Details">
      <div id="Thumbnail"><a title="${h(it.name)}">${v.assetThumb(it, 250, 250)}</a></div>
      <div id="Summary">
        <h3>ROBLOX ${typeLabel}</h3>
        ${notice}
        ${purchase}
        <div id="Creator" class="Creator">
          <div class="Avatar"><a title="${h(creator?.name)}" href="/User.aspx?ID=${creator?.id}">${v.avatarThumb(creator, 100, 100)}</a></div>
          Creator: ${v.userLink(creator)}
        </div>
        <div id="LastUpdate">Updated: ${timeAgo(it.updated)}</div>
        <div id="Favorited">Favorited: ${commas(it.favorited)} times</div>
        <div>
          <div id="DescriptionLabel">Description:</div>
          <div id="Description">${h(it.desc || '') || '&nbsp;'}</div>
        </div>
        <div id="ReportAbuse"><div class="ReportAbusePanel"><span class="AbuseIcon"><a href="/AbuseReport/Asset.aspx?ID=${it.id}"><img src="/images/abuse.png" alt="Report Abuse" border="0"/></a></span> <span class="AbuseButton"><a href="/AbuseReport/Asset.aspx?ID=${it.id}">Report Abuse</a></span></div></div>
      </div>
      <div id="Actions">
        ${ctx.user ? `<form method="post" action="${back}&amp;favorite=1" style="display:inline"><a href="#" onclick="this.parentNode.submit();return false;">${isFav ? 'Unfavorite' : 'Favorite'}</a></form>` : '<a href="/Login/Default.aspx">Favorite</a>'}
      </div>
      ${owned ? '<div id="Ownership">You own this item</div>' : ''}
      <div style="clear:both"></div>
    </div>
    <div style="margin: 10px; width: 703px;">
      <div class="ajax__tab_xp" id="TabbedInfo">
        <div class="ajax__tab_header" id="TabbedInfo_header"><span class="ajax__tab_tab ajax__tab_active"><h3 style="color: #555;">Commentary</h3></span></div>
        <div class="ajax__tab_body" id="TabbedInfo_body"><div class="ajax__tab_panel">${games.commentsBlock(ctx, 'item:' + it.id, back, `Comment on this ${typeLabel}`)}</div></div>
      </div>
    </div>
  </div>
  ${showAd ? `<div class="Ads_WideSkyscraper">${ads.skyscraper()}</div>` : ''}
  <div style="clear:both"></div>
</div>
${modal}`;
  return ctx.send(page(ctx, { body }));
}

module.exports = { routes: { '/catalog.aspx': catalogPage, '/item.aspx': itemPage } };
