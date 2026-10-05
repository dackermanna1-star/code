// User.aspx (profile / "My ROBLOX"), Friends.aspx, Badges.aspx.
'use strict';
const { page } = require('../layout');
const db = require('../db');
const v = require('../views');
const { h, commas, clampInt } = require('../util');

const BADGES = {
  Administrator: { file: 'Administrator-75x75.png', name: 'Administrator', desc: 'This badge identifies an account as belonging to a ROBLOX administrator. Only official ROBLOX administrators will possess this badge. If someone claims to be an admin, but does not have this badge, they are potentially trying to mislead you.' },
  ForumModerator: { file: 'ForumModerator-75x75.png', name: 'Forum Moderator', desc: 'Users with this badge are forum moderators. They have special powers on the ROBLOX forum and are able to delete threads that violate the Community Guidelines.' },
  ImageModerator: { file: 'ImageModerator-75x75.png', name: 'Image Moderator', desc: 'Users with this badge are image moderators. Image moderators have special powers on ROBLOX that allow them to approve or disapprove images that other users upload.' },
  BuildersClub: { file: 'BuildersClub-75x75.png', name: 'Builders Club', desc: 'Members of the illustrious Builders Club display this badge proudly. The Builders Club is a paid premium service.' },
  Homestead: { file: 'Homestead-70x75.jpg', name: 'Homestead', desc: 'The homestead badge is earned by having your personal place visited 100 times. Players who achieve this have demonstrated their ability to build cool things that other Robloxians were interested enough in to check out.' },
  Bricksmith: { file: 'Bricksmith-54x75.jpg', name: 'Bricksmith', desc: 'The Bricksmith badge is earned by having a popular personal place. Once your place has been visited 1000 times, you will receive this award.' },
  Friendship: { file: 'Friendship-75x75.jpg', name: 'Friendship', desc: 'This badge is given to players who have embraced the ROBLOX community and have made at least 20 friends. People who have this badge are good people to know and can probably help you out if you are having trouble.' },
  Inviter: { file: 'Inviter-75x75.png', name: 'Inviter', desc: 'ROBLOX is a vast uncharted realm, as large as the imagination. Citizens who successfully recruit three or more fellow explorers via the Share ROBLOX with a Friend mechanism are awarded with this badge.' },
  CombatInitiation: { file: 'CombatInitiation-75x75.jpg', name: 'Combat Initiation', desc: 'This badge is given to any player who has proven his or her combat abilities by accumulating 10 victories in battle. Players who have this badge are not complete newbies and probably know how to handle their weapons.' },
  Warrior: { file: 'Warrior-75x75.jpg', name: 'Warrior', desc: 'This badge is given to the warriors of ROBLOX, who have time and time again overwhelmed their foes in battle. To earn this badge, you must rack up 100 knockouts.' },
  Bloxxer: { file: 'Bloxxer-75x75.jpg', name: 'Bloxxer', desc: 'Anyone who has earned this badge is a very dangerous player indeed. Those Robloxians who excel at combat can one day hope to achieve this honor, the Bloxxer Badge. It is given to the warrior who has bloxxed at least 250 enemies and who has tasted victory more times than he or she has suffered defeat.' },
};
const BADGE_ORDER = ['Administrator', 'ForumModerator', 'ImageModerator', 'BuildersClub', 'Homestead', 'Bricksmith', 'Friendship', 'Inviter', 'CombatInitiation', 'Warrior', 'Bloxxer'];

const STUFF_CATS = [['TShirt', 'T-Shirts'], ['Shirt', 'Shirts'], ['Pants', 'Pants'], ['Hat', 'Hats'], ['Decal', 'Decals'], ['Model', 'Models'], ['Place', 'Places']];

function stat(label, title, value, week = 0) {
  return `<div class="Statistic"><div class="Label"><acronym title="${h(title)}">${label}</acronym>:</div><div class="Value"><span>${commas(value)} (${commas(week)} last week)</span></div></div>`;
}

function placePane(ctx, owner, isOwner) {
  const p = owner.placeId ? db.placeById(owner.placeId) : null;
  let places = p ? [p] : [];
  // creators of real 2008 games also show those places
  for (const pl of Object.values(ctx.state.places)) if (pl.creatorId === owner.id && !places.includes(pl)) places.push(pl);
  places = places.slice(0, 10);
  const items = places.map((pl, i) => `
    <div class="AccordionHeader" onclick="rbxAccordion(this)">${h(pl.name)}</div>
    <div class="AccordionBody"${i === 0 ? '' : ' style="display:none"'}>
      <div class="Place">
        <div class="PlayStatus"><img src="/images/public.png" alt="" border="0"/>&nbsp;Public</div>
        <div class="PlayOptions">
          <a class="Button" href="#" onclick="return rbxVisit(${pl.id},'online')">Visit Online</a>&nbsp;&nbsp;&nbsp;<a class="Button" href="#" onclick="return rbxVisit(${pl.id},'solo')">Visit Solo</a>${isOwner && pl.script === 'personal' ? `&nbsp;&nbsp;&nbsp;<a class="Button" href="#" onclick="return rbxVisit(${pl.id},'edit')">Edit</a>` : ''}
        </div>
        <div class="Statistics">Visited ${commas(pl.visits)} times (${commas(Math.round(pl.visits / 60))} last week)</div>
        <div class="Thumbnail"><a href="/Item.aspx?ID=${pl.id}" title="${h(pl.name)}">${v.placeThumb(pl, 420, 230)}</a></div>
        ${pl.desc ? `<div class="Description">${h(pl.desc)}</div>` : ''}
        ${isOwner ? `<div class="Configuration"><a href="/My/Place.aspx?PlaceID=${pl.id}">Configure this Place</a></div>` : ''}
      </div>
    </div>`).join('');
  return `
  <div id="UserPlacesPane">
    <div id="UserPlaces">
      <h4>Showcase</h4>
      ${items || '<div class="NoResults">This user has no places.</div>'}
    </div>
  </div>`;
}

function friendsPane(ctx, owner, isOwner) {
  const friends = owner.friends.map((id) => db.userById(id)).filter(Boolean);
  const shown = friends.slice(0, 6);
  const rows = [];
  for (let i = 0; i < shown.length; i += 3) rows.push(shown.slice(i, i + 3));
  return `
  <div id="FriendsPane">
    <div id="Friends">
      <h4>${isOwner ? 'My Friends' : `${h(owner.name)}'s Friends`} <a href="/Friends.aspx?UserID=${owner.id}">See all ${friends.length}</a>${isOwner ? ' (<a href="/My/EditFriends.aspx">Edit</a>)' : ''}</h4>
      ${shown.length ? `<table cellspacing="0" border="0" align="center">${rows.map((r) => `<tr>${r.map((f) => `<td>${friendCell(f)}</td>`).join('')}</tr>`).join('')}</table>`
    : `<div class="NoResults">${isOwner ? "You don't have any ROBLOX friends." : `${h(owner.name)} doesn't have any ROBLOX friends.`}</div>`}
    </div>
  </div>`;
}

function favoritesPane(ctx, owner) {
  const cat = ctx.query.favcat || 'Place';
  const favIds = cat === 'Place' ? owner.favorites.places : owner.favorites.items;
  const list = favIds.map((id) => (cat === 'Place' ? db.placeById(id) : db.itemById(id))).filter((x) => x && (cat === 'Place' || x.type === cat)).slice(0, 6);
  const opts = STUFF_CATS.map(([k, label]) => `<option value="${k}"${k === cat ? ' selected="selected"' : ''}>${label}</option>`).join('');
  return `
  <div id="FavoritesPane">
    <div id="Favorites">
      <h4>Favorites</h4>
      <div id="FavoritesContent">
        ${list.length ? `<table cellspacing="0" border="0" align="center"><tr>${list.map((x) => `<td class="Asset" valign="top"><div class="AssetThumbnail"><a href="/Item.aspx?ID=${x.id}" title="${h(x.name)}">${cat === 'Place' ? v.placeThumb(x, 110, 110) : v.assetThumb(x, 110, 110)}</a></div><div class="AssetDetails"><div class="AssetName"><a href="/Item.aspx?ID=${x.id}">${h(x.name)}</a></div></div></td>`).join('')}</tr></table>`
    : `<div class="NoResults">${h(owner.name)} has not chosen any favorite ${STUFF_CATS.find((c) => c[0] === cat)[1].toLowerCase()}.</div>`}
      </div>
      <div class="PanelFooter">Category:&nbsp;<select onchange="location.href='/User.aspx?ID=${owner.id}&amp;favcat='+this.value+'#Favorites'">${opts}</select></div>
    </div>
  </div>`;
}

function stuffPane(ctx, owner, isOwner) {
  const cat = ctx.query.cat || 'Hat';
  const p = clampInt(ctx.query.sp, 1, 999, 1);
  let list;
  if (cat === 'Place') list = Object.values(ctx.state.places).filter((pl) => pl.creatorId === owner.id);
  else list = owner.inventory.map((id) => db.itemById(id)).filter((i) => i && i.type === cat);
  const per = 10;
  const pages = Math.max(1, Math.ceil(list.length / per));
  const shown = list.slice((p - 1) * per, p * per);
  const url = (n) => `/User.aspx?${v.qs({ ID: isOwner ? null : owner.id, cat, sp: n })}#UserAssets`;
  const menu = STUFF_CATS.map(([k, label]) => `<div class="AssetsMenuItem${k === cat ? '_Selected' : ''}"><a class="AssetsMenuButton${k === cat ? '_Selected' : ''}" href="/User.aspx?${v.qs({ ID: isOwner ? null : owner.id, cat: k })}#UserAssets">${label}</a></div>`).join('');
  const rows = [];
  for (let i = 0; i < shown.length; i += 5) rows.push(shown.slice(i, i + 5));
  const cell = (x) => {
    const isPlace = cat === 'Place';
    const creator = db.userById(x.creatorId);
    return `<td class="Asset" valign="top"><div class="AssetThumbnail"><a href="/Item.aspx?ID=${x.id}" title="${h(x.name)}">${isPlace ? v.placeThumb(x, 110, 110) : v.assetThumb(x, 110, 110)}</a></div>
      <div class="AssetDetails"><div class="AssetName"><a href="/Item.aspx?ID=${x.id}">${h(x.name)}</a></div>
      <div class="AssetCreator"><span class="Label">Creator:</span> <span class="Detail">${v.userLink(creator)}</span></div>
      ${isPlace ? '' : v.price(x)}</div></td>`;
  };
  return `
  <div id="UserAssetsPane">
    <div id="UserAssets">
      <h4>Stuff</h4>
      <div id="AssetsMenu">${menu}</div>
      <div id="AssetsContent">
        ${pages > 1 ? v.pager(p, pages, url) : ''}
        ${shown.length ? `<table cellspacing="0" border="0">${rows.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('')}</table>`
    : `<div class="NoResults">${isOwner ? "You don't have any items in this category." : 'This user has no items in this category.'}${isOwner && cat !== 'Place' ? ' <a href="/Catalog.aspx">Shop for some!</a>' : ''}</div>`}
        ${pages > 1 ? v.pager(p, pages, url, 'FooterPager') : ''}
      </div>
      <div style="clear:both"></div>
    </div>
  </div>`;
}

function badgesPane(owner) {
  const list = BADGE_ORDER.filter((b) => owner.badges.includes(b));
  const rows = [];
  for (let i = 0; i < list.length; i += 4) rows.push(list.slice(i, i + 4));
  return `
  <div id="UserBadgesPane">
    <div id="UserBadges">
      <h4><a href="/Badges.aspx">Badges</a></h4>
      ${list.length ? `<table cellspacing="0" align="Center" border="0">${rows.map((r) => `<tr>${r.map((b) => `<td><div class="Badge"><div class="BadgeImage"><a href="/Badges.aspx" title="${h(BADGES[b].desc)}"><img src="/images/Badges/${BADGES[b].file}" alt="${h(BADGES[b].desc)}" border="0"/></a></div><div class="BadgeLabel"><a href="/Badges.aspx">${BADGES[b].name}</a></div></div></td>`).join('')}</tr>`).join('')}</table>`
    : '<div class="NoResults">This user does not have any ROBLOX badges.</div>'}
    </div>
  </div>`;
}

function statisticsPane(owner, isOwner) {
  const place = owner.placeId ? db.placeById(owner.placeId) : null;
  const visits = place ? place.visits : 0;
  return `
  <div id="UserStatisticsPane">
    <div id="UserStatistics">
      <div class="Header"><h4>Statistics</h4></div>
      <div id="Results">
        ${stat('Friends', "The number of this user's friends.", owner.friends.length, Math.min(owner.friends.length, 2))}
        ${isOwner ? stat('Friends Invited', 'The number of friends this user has recruited to join ROBLOX.', owner.invited || 0) : ''}
        ${stat('Forum Posts', 'The number of posts this user has made to the ROBLOX forum.', owner.forumPosts || 0)}
        ${stat('Profile Views', "The number of times this user's profile has been viewed.", owner.profileViews || 0, Math.round((owner.profileViews || 0) / 30))}
        ${stat('Place Visits', "The number of times this user's place has been visited.", visits, Math.round(visits / 60))}
        ${stat('Knockouts', "The number of times this user's character has destroyed another user's character in-game.", owner.knockouts || 0)}
        ${isOwner ? stat('Wipeouts', "The number of times this user's character has been destroyed in-game.", owner.wipeouts || 0) : ''}
      </div>
    </div>
  </div>`;
}

function friendRequestsPane(ctx, owner) {
  const reqs = Object.values(ctx.state.friendRequests).filter((r) => r.toId === owner.id && !r.handled);
  if (!reqs.length) return '';
  return `
  <div class="FriendRequestsPane">
    <div id="FriendRequests">
      <h4>Friend Requests</h4>
      <table cellspacing="0" border="0" align="center"><tr>
      ${reqs.slice(0, 5).map((r) => { const f = db.userById(r.fromId); return `<td><div class="Friend"><div class="Avatar"><a href="/User.aspx?ID=${f.id}">${v.avatarThumb(f, 100, 100)}</a></div><div class="Summary"><a href="/User.aspx?ID=${f.id}">${h(f.name)}</a></div><div class="Options"><a href="/My/FriendInvitation.aspx?InvitationID=${r.id}">View request</a></div></div></td>`; }).join('')}
      </tr></table>
    </div>
  </div>`;
}

function userPage(ctx) {
  let id = ctx.query.ID || ctx.query.id;
  const forcePublic = String(ctx.query.ForcePublicView || ctx.query.forcepublicview).toLowerCase() === 'true';
  if (!id) {
    if (!ctx.requireLogin()) return;
    id = ctx.user.id;
  }
  const owner = db.userById(Number(id));
  if (!owner) {
    return ctx.send(page(ctx, { body: '<div class="NoResults" style="padding:60px;font-size:1.2em;font-family:Verdana">This user does not exist.</div>' }), 404);
  }
  const isOwner = ctx.user && ctx.user.id === owner.id && !forcePublic;
  if (!isOwner && (!ctx.user || ctx.user.id !== owner.id)) { owner.profileViews = (owner.profileViews || 0) + 1; db.save(); }

  const bcStrip = owner.bc ? `
      <div class="Header"><h4 class="BCStatus">Builders Club Member</h4></div>` : '';
  const avatarBox = (inner) => `<div style="left: 0px; float: left; position: relative; top: 0px">${inner}</div>`;
  const profile = isOwner ? `
    <div id="ProfilePane">
      <table width="100%" bgcolor="lightsteelblue" cellpadding="6" cellspacing="0">
        <tr><td><span class="Title">Hi, ${h(owner.name)}!</span><br/></td></tr>
        <tr><td>
          <span>Your ROBLOX:</span><br/>
          <a href="/User.aspx?ID=${owner.id}">http://www.roblox.com/User.aspx?ID=${owner.id}</a><br/><br/>
          ${avatarBox(`<a href="/My/Character.aspx" title="${h(owner.name)}" style="display:inline-block;height:220px;width:180px;">${v.avatarThumb(owner, 180, 220)}</a><br/>`)}
          <p><a href="/My/AccountUpgrades/Manage.aspx">Upgrades</a></p>
          <p><a href="/My/AccountBalance.aspx">Account Balance</a></p>
          <p><a href="/My/Inbox.aspx">Inbox</a>&nbsp;</p>
          <p><a href="/My/Character.aspx">Change Character</a></p>
          <p><a href="/My/Profile.aspx">Edit Profile</a></p>
          <p><a href="/User.aspx?ForcePublicView=true&amp;id=${owner.id}">View Profile</a></p>
          <p><a href="/My/InviteAFriend.aspx">Share ROBLOX</a></p>
        </td></tr>
      </table>${bcStrip}
    </div>` : `
    <div id="ProfilePane">
      <table width="100%" bgcolor="lightsteelblue" cellpadding="6" cellspacing="0">
        <tr><td><span class="Title">${h(owner.name)}</span><br/>
          ${v.onlineStatus(owner)}
        </td></tr>
        <tr><td>
          <span>${h(owner.name)}'s ROBLOX:</span><br/>
          <a href="/User.aspx?ID=${owner.id}">http://www.roblox.com/User.aspx?ID=${owner.id}</a><br/><br/>
          ${avatarBox(`<a title="${h(owner.name)}" style="display:inline-block;height:220px;width:180px;">${v.avatarThumb(owner, 180, 220)}</a><br/>
            <div class="ReportAbusePanel">
              <span class="AbuseIcon"><a href="/AbuseReport/User.aspx?ID=${owner.id}"><img src="/images/abuse.png" alt="Report Abuse" border="0"/></a></span>
              <span class="AbuseButton"><a href="/AbuseReport/User.aspx?ID=${owner.id}">Report Abuse</a></span>
            </div>`)}
          <p><a href="/My/PrivateMessage.aspx?RecipientID=${owner.id}">Send Message</a></p>
          <p>${ctx.user && ctx.user.friends.includes(owner.id) ? '' : `<a href="/My/FriendRequest.aspx?UserID=${owner.id}">Send Friend Request</a>`}</p>
          <p><span>${h(owner.blurb || '').replace(/\n/g, '<br/>')}</span></p>
        </td></tr>
      </table>${bcStrip}
    </div>`;

  const body = `
<div id="UserContainer">
  <div id="LeftBank">
    ${profile}
    ${badgesPane(owner)}
    ${statisticsPane(owner, isOwner)}
  </div>
  <div id="RightBank">
    ${placePane(ctx, owner, isOwner)}
    ${friendsPane(ctx, owner, isOwner)}
    ${favoritesPane(ctx, owner)}
  </div>
  ${isOwner ? friendRequestsPane(ctx, owner) : ''}
  ${stuffPane(ctx, owner, isOwner)}
  <div style="clear:both"></div>
</div>`;
  return ctx.send(page(ctx, { body }));
}

/** One friend tile (avatar, online dot with its 2008 tooltip text, name). */
function friendCell(f, options = '') {
  const status = v.isOnline(f) ? `${h(f.name)} is online at ${h(f.playingPlaceName || 'Website')}.` : `${h(f.name)} is offline (last seen at ${v.longDate(f.lastOnline)}).`;
  return `<div class="Friend"><div class="Avatar"><a href="/User.aspx?ID=${f.id}" title="${h(f.name)}">${v.avatarThumb(f, 100, 100)}</a></div><div class="Summary"><span class="OnlineStatus"><img src="/images/${v.isOnline(f) ? 'OnlineStatusIndicator_IsOnline' : 'OnlineStatusIndicator_IsOffline'}.gif" alt="${status}" title="${status}" border="0"/></span>&nbsp;<span class="Name"><a href="/User.aspx?ID=${f.id}">${h(f.name)}</a></span></div>${options}</div>`;
}

function friendsPage(ctx) {
  const owner = db.userById(Number(ctx.query.UserID || ctx.query.userid || ctx.user?.id));
  if (!owner) return ctx.redirect('/Browse.aspx');
  const friends = owner.friends.map((id) => db.userById(id)).filter(Boolean);
  const p = clampInt(ctx.query.p, 1, 999, 1);
  const per = 24;
  const pages = Math.max(1, Math.ceil(friends.length / per));
  const shown = friends.slice((p - 1) * per, p * per);
  const rows = [];
  for (let i = 0; i < shown.length; i += 6) rows.push(shown.slice(i, i + 6));
  const pager = `<div align="center">Pages: ${p > 1 ? `<a href="/Friends.aspx?UserID=${owner.id}&amp;p=${p - 1}">&lt;&lt; Previous</a> ` : ''}${p < pages ? `<a href="/Friends.aspx?UserID=${owner.id}&amp;p=${p + 1}">Next &gt;&gt;</a>` : ''}</div>`;
  const body = `
<div id="FriendsContainer">
  <div id="Friends">
    <h4>${h(owner.name)}'s Friends (${friends.length})</h4>
    ${pager}
    <table cellspacing="0" border="0" align="center">
      ${rows.map((r) => `<tr>${r.map((f) => `<td>${friendCell(f)}</td>`).join('')}</tr>`).join('')}
    </table>
    ${!friends.length ? `<div class="NoResults">${h(owner.name)} doesn't have any ROBLOX friends.</div>` : ''}
  </div>
</div>`;
  return ctx.send(page(ctx, { body }));
}

function badgesPage(ctx) {
  const section = (id, title, keys, side) => `
    <div class="AccordionHeader">${title}</div>
    <div id="${id}">
      <div class="Legend">
        <ul class="BadgesList">
          ${keys.map((k) => `<li id="${k}"><h4>${BADGES[k].name}</h4><div>${h(BADGES[k].desc)}</div></li>`).join('')}
        </ul>
      </div>
      ${side || ''}
      <div style="clear:both"></div>
    </div>`;
  const top = (fn, label) => {
    const list = db.users().filter((u) => !u.admin).sort((a, b) => fn(b) - fn(a)).slice(0, 10);
    return `<div id="StatisticsRankingsPane_${label}" class="StatisticsRankings"><h4>Top 10</h4>
      <div class="StatisticsRankingsHeader_Rank">Rank</div><div class="StatisticsRankingsHeader_Item">Player</div><div class="StatisticsRankingsHeader_Score">Score</div><div style="clear:both"></div>
      ${list.map((u, i) => `<div class="StatisticsRanking${i % 2 ? '_AlternatingRow' : ''}"><div class="StatisticsRanking_Rank">${i + 1}</div><div class="StatisticsRanking_Item"><a href="/User.aspx?ID=${u.id}">${h(u.name)}</a></div><div class="StatisticsRanking_Score">${commas(fn(u))}</div><div style="clear:both"></div></div>`).join('')}
    </div>`;
  };
  const body = `
<div id="BadgesContainer">
  <div id="CommunityBadges">
    <div class="TopAccordionHeader">Community Badges</div>
    <div class="Legend"><ul class="BadgesList">${['Administrator', 'ForumModerator', 'ImageModerator', 'BuildersClub'].map((k) => `<li id="${k}"${k === 'BuildersClub' ? ` style="background-image:url(/images/Badges/${BADGES[k].file})"` : ''}><h4>${BADGES[k].name}</h4><div>${h(BADGES[k].desc)}</div></li>`).join('')}</ul></div>
    <div id="FeaturedBadge_Community"><h4>Featured Badge</h4><div class="FeaturedBadgeContent"><img class="FeaturedBadgeIcon" src="/images/Badges/Bloxxer-75x75.jpg" alt=""/><p>The <b>Bloxxer</b> badge is the most dangerous badge in ROBLOX. Win 250 battles &mdash; and win more than you lose &mdash; to earn it.</p><div style="clear:both"></div></div></div>
    <div style="clear:both"></div>
  </div>
  ${section('VisitsBadges', 'Builder Badges', ['Homestead', 'Bricksmith'], top((u) => (u.placeId && db.placeById(u.placeId) ? db.placeById(u.placeId).visits : 0), 'Visits'))}
  ${section('FriendshipBadges', 'Friendship Badges', ['Friendship', 'Inviter'], top((u) => u.friends.length, 'Friendship'))}
  ${section('CombatBadges', 'Combat Badges', ['CombatInitiation', 'Warrior', 'Bloxxer'], top((u) => u.knockouts || 0, 'Combat'))}
</div>`;
  return ctx.send(page(ctx, { body }));
}

module.exports = { routes: { '/user.aspx': userPage, '/friends.aspx': friendsPage, '/badges.aspx': badgesPage }, BADGES, friendCell };
