// The site "master page": banner, alerts, navigation, ads and footer, as on
// roblox.com in mid-2008 (markup and ids follow the archived pages).
'use strict';
const clock = require('./clock');
const { h, commas } = require('./util');
const ads = require('./ads');

const DEFAULT_TITLE = 'ROBLOX: A FREE Virtual World-Building Game with Avatar Chat, 3D Environments, and Physics';

function unreadCount(state, user) {
  return Object.values(state.messages).filter((m) => m.toId === user.id && !m.read && !m.deletedByRecipient).length
    + Object.values(state.friendRequests || {}).filter((r) => r.toId === user.id && !r.handled && !r.read).length;
}

function header(ctx) {
  const u = ctx.user;
  let auth, settings = '', alerts;
  if (u) {
    auth = `<span id="ctl00_lnLoginName">Logged in as ${h(u.name)} | </span><a id="ctl00_lsLoginStatus" href="/Login/Logout.aspx">Logout</a>`;
    settings = `<span id="ctl00_lSettings">Age: ${u.under13 ? 'Under 13' : '13+'}, Chat Mode: ${u.superSafe ? 'SuperSafe' : 'Safe'}</span>`;
    const unread = unreadCount(ctx.state, u);
    alerts = `<table style="width:100%;height:100%"><tr><td valign="middle"><div id="AlertSpace">
      ${unread ? `<div id="MessageAlert"><a class="MessageAlertIcon" href="/My/Inbox.aspx"><img src="/images/Message.gif" alt="Messages" border="0"/></a>&nbsp;<a class="MessageAlertCaption" href="/My/Inbox.aspx">${unread} new message${unread === 1 ? '' : 's'}</a></div>` : ''}
      ${u.robux || u.bc ? `<div id="RobuxAlert"><a class="RobuxAlertIcon" href="/My/AccountBalance.aspx"><img src="/images/Robux.png" alt="ROBUX" border="0"/></a>&nbsp;<a class="RobuxAlertCaption" href="/My/AccountBalance.aspx">${commas(u.robux)} ROBUX</a></div>` : ''}
      <div id="TicketsAlert"><a class="TicketsAlertIcon" href="/My/AccountBalance.aspx"><img src="/images/Tickets.png" alt="Tickets" border="0"/></a>&nbsp;<a class="TicketsAlertCaption" href="/My/AccountBalance.aspx">${commas(u.tix)} Tickets</a></div>
    </div></td></tr></table>`;
  } else {
    auth = `<span><a id="ctl00_BannerOptionsLoginView_BannerOptions_Anonymous_LoginHyperLink" href="/Login/Default.aspx">Login</a></span>`;
    alerts = `<table style="width:100%;height:100%"><tr><td valign="middle"><a class="SignUpAndPlay" title="Sign-up and Play!" href="/Login/New.aspx?ReturnUrl=%2fGames.aspx" style="display:inline-block;cursor:pointer;"><img src="/images/BannerPlay.png" border="0" alt="Sign-up and Play!"/></a></td></tr></table>`;
  }
  const item = (id, text, href, extra = '') => `<span><a id="ctl00_Menu_hl${id}" class="MenuItem" href="${href}">${text}</a>${extra}</span>`;
  const sep = '<span class="Separator">&nbsp;|&nbsp;</span>';
  const nav = [
    item('MyRoblox', 'My ROBLOX', '/User.aspx'),
    item('Games', 'Games', '/Games.aspx'),
    item('Catalog', 'Catalog', '/Catalog.aspx'),
    item('Browse', 'People', '/Browse.aspx'),
    item('BuildersClub', 'Builders Club', '/Upgrades/BuildersClub.aspx'),
    item('Forum', 'Forum', '/Forum/Default.aspx'),
    item('News', 'News', '/News.aspx', '&nbsp;<a id="ctl00_Menu_hlNewsFeed" href="/News.aspx?feed=rss"><img src="/images/feed-icons/feed-icon-14x14.png" alt="RSS" border="0"/></a>'),
    item('Parents', 'Parents', '/Parents.aspx'),
    item('Help', 'Help', '/Help/Default.aspx'),
  ].join(`\n      ${sep}\n      `);
  return `
  <div id="Header">
    <div id="Banner">
      <div id="Options">
        <div id="Authentication">${auth}</div>
        <div id="Settings">${settings}</div>
      </div>
      <div id="Logo"><a id="ctl00_rbxImage_Logo" title="ROBLOX" href="/Default.aspx" style="display:inline-block;cursor:pointer;"><img src="/images/roblox_logo.png" border="0" alt="ROBLOX"/></a></div>
      <div id="Alerts">${alerts}</div>
    </div>
    <div class="Navigation">${nav}</div>
  </div>`;
}

function footer() {
  return `
  <div id="Footer">
    <hr/>
    <p class="Legalese">
      ROBLOX, "Online Building Toy", characters, logos, names, and all related indicia are trademarks of <a id="ctl00_rbxFooter_hlRobloxCorporation" href="/info/About.aspx">ROBLOX Corporation</a>, &copy;${new Date(clock.now()).getFullYear()}. Patents pending.
      <br/>ROBLOX Corp. is not affiliated with Lego, MegaBloks, Bionicle, Pokemon, Nintendo, Lincoln Logs, Yu Gi Oh, K'nex, Tinkertoys, Erector Set, or the Pirates of the Caribbean. ARrrr!
      <br/>Use of this site signifies your acceptance of the <a id="ctl00_rbxFooter_hlTermsOfService" href="/info/TermsOfService.aspx">Terms and Conditions</a>.
      <br/><a id="ctl00_rbxFooter_hlPrivacyPolicy" href="/info/Privacy.aspx">Privacy Policy</a> &nbsp;|&nbsp; <a href="/info/ContactUs.aspx">Contact Us</a> &nbsp;|&nbsp; <a id="ctl00_rbxFooter_hlAboutRoblox" href="/info/About.aspx">About Us</a> &nbsp;|&nbsp; <a id="ctl00_rbxFooter_HyperLink1" href="/info/Jobs.aspx">Jobs</a>
    </p>
    <p class="Legalese RecreationNote">Unofficial, non-commercial recreation of ROBLOX circa 2008. <a href="/info/Recreation.aspx">About this recreation &amp; sources</a></p>
  </div>`;
}

/**
 * Render a full page.
 * opts: { title, body, head, scripts, ad (bool, default true), bodyClass }
 */
function page(ctx, opts) {
  const showAd = opts.ad !== false && !(ctx.user && ctx.user.bc);
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<title>${h(opts.title || DEFAULT_TITLE)}</title>
<link id="ctl00_Imports" rel="stylesheet" type="text/css" href="/css/AllCSS.css"/>
<link rel="stylesheet" type="text/css" href="/css/site.css"/>
<link rel="icon" type="image/vnd.microsoft.icon" href="/favicon.ico"/>
<script type="importmap">{"imports":{"three":"/js/vendor/three.module.min.js"}}</script>
${opts.head || ''}
</head>
<body${opts.bodyClass ? ` class="${opts.bodyClass}"` : ''}>
<div id="Container">
  ${showAd ? `<div id="AdvertisingLeaderboard">${ads.leaderboard()}</div>` : ''}
  ${header(ctx)}
  <div id="Body">
${opts.body}
  </div>
  ${footer()}
</div>
<script src="/js/site.js"></script>
<script type="module" src="/js/thumbs.js"></script>
${opts.scripts || ''}
</body>
</html>`;
}

module.exports = { page, DEFAULT_TITLE };
