// Builders Club, Parents, News (the ROBLOX blog), Help (the ROBLOX wiki),
// the info/ footer pages and the recreation's research/sources page.
'use strict';
const fs = require('fs');
const path = require('path');
const { page } = require('../layout');
const db = require('../db');
const { h } = require('../util');

// ------------------------------------------------------------------ Builders Club
function buildersClub(ctx) {
  const u = ctx.user;
  const body = `
<div id="BuildersClubContainer">
  <div id="JoinBuildersClubNow"><img src="/images/JoinBuildersClubNow.png" alt="Join Builders Club Now!" border="0"/></div>
  <div id="MembershipOptions">
    <div id="OneMonth" class="MembershipOption"><a href="/Upgrades/PaymentMethods.aspx?ap=2"><img src="/images/BuyBCMonthly.png" alt="Monthly $5.95" border="0"/></a><br/><a href="/Upgrades/PaymentMethods.aspx?ap=2"><b>Get Monthly</b></a></div>
    <div id="SixMonths" class="MembershipOption"><a href="/Upgrades/PaymentMethods.aspx?ap=3"><img src="/images/BuyBC6Months.png" alt="6 Months $29.95" border="0"/></a><br/><a href="/Upgrades/PaymentMethods.aspx?ap=3"><b>Get 6 Months</b></a></div>
    <div id="TwelveMonths" class="MembershipOption"><a href="/Upgrades/PaymentMethods.aspx?ap=4"><img src="/images/BuyBC12Months.png" alt="12 Months $57.95" border="0"/></a><br/><a href="/Upgrades/PaymentMethods.aspx?ap=4"><b>Get 12 Months</b></a></div>
    <div style="clear:both"></div>
  </div>
  <div id="WhyJoin">
    <h3>Why Join Builders Club?</h3>
    <ul id="MembershipBenefits">
      <li id="Benefit_MultiplePlaces">Create up to 10 places on a single account</li>
      <li id="Benefit_RobuxAllowance">Earn a daily income of 15 ROBUX</li>
      <li id="Benefit_SellContent">Sell your creations to others in the ROBLOX Catalog</li>
      <li id="Benefit_SuppressAds">Never see any outside ads on ROBLOX.COM</li>
      <li id="Benefit_ExclusiveHat">Receive the exclusive Builders Club construction hard hat</li>
    </ul>
    <p>For more information, read our <a href="/Parents/BuildersClub.aspx">Builders Club FAQs</a>.</p>
  </div>
  <div id="CancelBuildersClubContainer">
    <h4>${u && u.bc ? 'Your Membership' : 'Cancel Membership'}</h4>
    <div class="CancelBody">
      ${u && u.bc ? `<p>You are a member of the Builders Club!</p><form method="post" action="/Upgrades/PaymentMethods.aspx?cancel=1"><input type="submit" class="Button" value="Cancel Membership"/></form>` : `<p>Cancel automatic monthly card charges anytime within billing cycle</p><p>Memberships are non-refundable</p><p><a class="Button" href="#">Cancel Membership</a></p>`}
    </div>
  </div>
  <div style="clear:both"></div>
</div>`;
  return ctx.send(page(ctx, { body }));
}

function paymentMethods(ctx) {
  if (!ctx.requireLogin()) return;
  const u = ctx.user;
  const plans = { 2: ['Monthly', '$5.95'], 3: ['6 Months', '$29.95'], 4: ['12 Months', '$57.95'] };
  if (ctx.method === 'POST') {
    if (ctx.query.cancel) { u.bc = false; u.badges = u.badges.filter((b) => b !== 'BuildersClub'); }
    else {
      u.bc = true;
      if (!u.badges.includes('BuildersClub')) u.badges.push('BuildersClub');
      if (!u.inventory.includes(1080951)) u.inventory.push(1080951);
      require('../economy').addEarning(u, 'LoginAward', 15, 0);
    }
    db.save();
    return ctx.redirect('/My/AccountUpgrades/Manage.aspx');
  }
  const plan = plans[ctx.query.ap] || plans[2];
  const body = `
<div id="PaymentMethodsContainer">
  <h2>Builders Club &mdash; ${plan[0]} (${plan[1]} USD)</h2>
  <div id="PaymentDetails">
    <p>Choose how you would like to pay:</p>
    <p><input type="radio" disabled/> Credit Card &nbsp; <input type="radio" disabled/> PayPal</p>
    <p class="RecreationNote">This is a non-commercial recreation, so no real payment is taken. You can switch Builders Club on to try out the 2008 member features: 15 ROBUX per day, the Builders Club Hard Hat, and no ads.</p>
    <form method="post"><input type="submit" class="MediumButton" value="Activate Builders Club"/></form>
  </div>
</div>`;
  return ctx.send(page(ctx, { body }));
}

// ------------------------------------------------------------------ Parents
const PARENT_PAGES = {
  RobloxGuide: ['ROBLOX Guide', `<p>ROBLOX is an online virtual playground and workshop, where kids of all ages can safely interact, create, have fun, and learn. It is unique in that practically everything on ROBLOX is designed and constructed by members of the community.</p>
    <p>Every member gets their own <b>personal Place</b>: a 3D world they can build in with virtual bricks. Members visit each other's places, play games, chat, and battle with classic "brick battle" tools such as the slingshot and the rocket launcher.</p>`],
  KeepingKidsSafe: ['Keeping Kids Safe', `<p>All in-game chat is filtered and moderated. Kids under 13 can choose <b>SuperSafe Chat</b>, which only shows chat picked from pre-approved menus.</p>
    <p>Every page, place, item and message has a <b>Report Abuse</b> link, and the in-game <b>Report</b> button sends chat logs to our moderators.</p>
    <p>Never share personal information such as your real name, address, phone number or passwords.</p>`],
  FAQs: ['FAQs', `<h4>What is ROBLOX?</h4><p>ROBLOX is a free online building game. Members build with virtual bricks, play games made by other members and make friends.</p>
    <h4>What's the object of the game?</h4><p>There isn't one goal: build your place, play the games other members have made, and earn badges.</p>
    <h4>Who is ROBLOX for?</h4><p>ROBLOX is designed for 8 to 18 year olds, but anyone can play.</p>
    <h4>How is ROBLOX educational?</h4><p>Building in ROBLOX teaches basic engineering, design and physics. Advanced members even learn to program in Lua.</p>
    <h4>Does it cost anything to join ROBLOX?</h4><p>No. ROBLOX is free to play. Builders Club memberships start at $5.95 per month. (That's less than 20 cents per day!) Lower rates are available for 6-month and year-long subscriptions.</p>
    <h4>How do I sign my child up for Builders Club?</h4><p>Log in to your child's account and click <a href="/Upgrades/BuildersClub.aspx">Builders Club</a>.</p>`],
  BuildersClub: ['Builders Club', `<p>Play for free, or enhance your experience with Builders Club. Members can create up to 10 places (free players get 1), earn a daily income of 15 ROBUX, sell their creations in the Catalog, never see outside ads, and receive the exclusive Builders Club construction hard hat.</p>
    <h4>About billing</h4><p>For children under 13, we request the parent's billing information.</p>`],
  RobloxAndLearning: ['ROBLOX and Learning', '<p>ROBLOX kids learn engineering, design, science and computer programming by building things they care about, and they learn to work together while doing it.</p>'],
  WhatParentsAreSaying: ['What Parents are Saying', '<p>Parents and teachers have written to us about ROBLOX over the years. (The original 2008 quotations are not reproduced in this recreation.)</p>'],
};

function parentsHub(ctx) {
  const tile = (k, img, desc) => `<div class="ParentsSection"><a href="/Parents/${k}.aspx"><img class="SectionIcon" src="/images/Parents/${img}" alt="" border="0" width="110" height="110"/></a><h3><a href="/Parents/${k}.aspx">${PARENT_PAGES[k][0]}</a></h3><p>${desc}</p></div>`;
  const body = `
<div class="ParentsContainer">
  <h2>ROBLOX Parents</h2>
  <div id="LeftColumn">
    ${tile('RobloxGuide', 'RobloxGuide.png', 'Background information on the world of ROBLOX, especially for parents.')}
    ${tile('KeepingKidsSafe', 'KeepingKidsSafe.png', 'Information on how to keep your kids safe while online.')}
    ${tile('FAQs', 'FAQs.png', 'Questions and answers just for parents.')}
  </div>
  <div id="RightColumn">
    ${tile('BuildersClub', 'BuildersClub.png', 'Play for free, or enhance your experience with Builders Club.')}
    ${tile('RobloxAndLearning', 'RobloxAndLearning.png', 'ROBLOX kids learn engineering, design, science and more.')}
    ${tile('WhatParentsAreSaying', 'WhatParentsAreSaying.png', 'Hear what other parents are saying about ROBLOX.')}
  </div>
  <div style="clear:both"></div>
</div>`;
  return ctx.send(page(ctx, { body }));
}

function parentSub(key) {
  return (ctx) => {
    const [title, html] = PARENT_PAGES[key];
    return ctx.send(page(ctx, { body: `<div class="ParentsContainer"><h2>${title}</h2><div class="ParentsText">${html}<p><a href="/Parents.aspx">&laquo; Back to ROBLOX Parents</a></p></div></div>` }));
  };
}

// ------------------------------------------------------------------ News (blog.roblox.com, "Roblox Developers' Journal")
// Post titles/dates below are real 2008 blog posts mentioned in the research;
// the short summaries are this recreation's own wording.
const POSTS = [
  { date: 'November 21, 2008', title: 'Trade Currency', author: 'Telamon', cat: 'Release Notes', text: 'You can now trade ROBUX and Tickets with other players on the new currency exchange. (Recreation summary. The exchange came after this recreation\'s mid-2008 target, so it is not included here.)' },
  { date: 'October 11, 2008', title: "Yorick's Resting Place", author: 'Telamon', cat: 'Contests', text: 'The Halloween event place is open. Solve the riddles of the Riddling Skull! (Recreation summary.)' },
  { date: 'August 1, 2008', title: 'Olympics Contest', author: 'ReeseMcBlox', cat: 'Contests', text: 'Build your own Olympic event! (Recreation summary.)' },
  { date: 'April 24, 2008', title: 'ROBLOX Brings You...', author: 'Telamon', cat: 'Release Notes', text: 'Shirts and Pants! Builders Club members can now design full shirts and pants using the clothing template, and sell them in the Catalog. The old "shirts" are now called T-Shirts. Favorites and a new character page with a wardrobe also arrived. (Recreation summary of the release.)' },
  { date: 'April 2, 2008', title: 'Comments, Places and Models in the Catalog', author: 'builderman', cat: 'Release Notes', text: 'You can now comment on places, and places and models show up in My Stuff and the Catalog. ClickDetectors and Sparkles are new in the engine. (Recreation summary.)' },
  { date: 'February 24, 2008', title: 'We Accept PayPal', author: 'builderman', cat: 'News', text: 'You can now pay for Builders Club using PayPal. (Recreation summary.)' },
];

function newsPage(ctx) {
  const body = `
<div id="BlogContainer">
  <div class="BlogHeader"><h1>Roblox Developers' Journal</h1><div class="BlogTagline">The Roblog</div></div>
  <div class="BlogMain">
    ${POSTS.map((p) => `<div class="BlogPost"><h2>${h(p.title)}</h2><div class="BlogMeta">${p.date} by ${h(p.author)} &middot; Filed under ${h(p.cat)}</div><p>${h(p.text)}</p></div>`).join('')}
  </div>
  <div class="BlogSidebar">
    <h3>Categories</h3>
    <ul>${['News', 'Bits and Bytes', 'Design Docs', 'Release Notes', 'Deep Alpha', 'Reports From Robloxia', 'Travelogue', 'Contests'].map((c) => `<li>${c}</li>`).join('')}</ul>
    <h3>Authors</h3><ul><li>Telamon</li><li>builderman</li><li>ReeseMcBlox</li></ul>
  </div>
  <div style="clear:both"></div>
  <div class="BlogFooter">Roblox Developers' Journal is powered by WordPress and a thousand networked Amigas</div>
</div>`;
  return ctx.send(page(ctx, { title: "Roblox Developers' Journal", body, ad: false }));
}

// ------------------------------------------------------------------ Help (wiki.roblox.com)
function helpPage(ctx) {
  const body = `
<div id="WikiContainer">
  <div class="WikiSide"><div class="WikiLogo">ROBLOX<br/><span>Wiki</span></div>
    <div class="WikiPortlet"><h5>navigation</h5><ul><li><a href="/Help/Default.aspx">Main Page</a></li><li><a href="/Help/Default.aspx#Controls">Controls</a></li><li><a href="/Help/Default.aspx#Building">Building</a></li><li><a href="/Help/Default.aspx#Tools">Brick Battle Tools</a></li><li><a href="/Help/Default.aspx#Currency">ROBUX &amp; Tickets</a></li></ul></div></div>
  <div class="WikiContent">
    <h1 class="firstHeading">Help:Contents</h1>
    <p>Welcome to the ROBLOX Wiki! Here you can find out how to play ROBLOX, build places and use the classic tools.</p>
    <h2 id="Controls">Controls</h2>
    <table class="wikitable"><tr><th>Action</th><th>Keys</th></tr>
      <tr><td>Walk</td><td>W, A, S, D or the Up/Down arrow keys</td></tr><tr><td>Jump</td><td>Space</td></tr>
      <tr><td>Turn the camera</td><td>Right mouse button + drag, Left/Right arrow keys, or , and .</td></tr>
      <tr><td>Zoom</td><td>Mouse wheel, I and O</td></tr><tr><td>Equip a tool</td><td>1-9 and 0, or click it in the toolbar</td></tr>
      <tr><td>Chat</td><td>/ then Enter, or the speech bubble for Safe Chat</td></tr></table>
    <h2 id="Building">Building your place</h2>
    <p>Every member owns a personal place. Click <b>Edit</b> on your place to build in it. Use the <b>Insert</b> menu to add bricks and free models, the <b>Grab</b> tool to move bricks, <b>Copy</b> to clone them and <b>Delete</b> to remove them. Bricks have studs on top and inlets underneath.</p>
    <h2 id="Tools">Brick Battle tools</h2>
    <ul><li><b>Sword</b>: click to slash, double-click to lunge.</li><li><b>Rocket Launcher</b>: fires a slow rocket that explodes on impact. 7 second reload.</li>
      <li><b>Slingshot</b>: lobs pellets at where you click.</li><li><b>Superball</b>: a bouncy ball that hurts on contact.</li><li><b>Paintball Gun</b>: paints whatever it hits.</li>
      <li><b>Trowel</b>: builds a brick wall where you click.</li><li><b>Timebomb</b>: drop it and run!</li></ul>
    <h2 id="Currency">ROBUX and Tickets</h2>
    <p>You get <b>10 Tickets</b> each day you log in, and Tickets whenever someone visits your place. Builders Club members also get <b>15 ROBUX</b> per day. Spend them in the <a href="/Catalog.aspx">Catalog</a>.</p>
  </div>
  <div style="clear:both"></div>
</div>`;
  return ctx.send(page(ctx, { title: 'Help:Contents - ROBLOX Wiki', body, ad: false }));
}

// ------------------------------------------------------------------ info/
const INFO = {
  About: ['About ROBLOX', '<p>ROBLOX is an online virtual playground and workshop. It is a free massively multiplayer online game where kids build, play, and battle with virtual bricks. ROBLOX Corporation was founded by David Baszucki and Erik Cassel and is based in California.</p>'],
  TermsOfService: ['Terms and Conditions', '<p>Be nice. Don\'t share personal information. Don\'t cheat, scam or bully other players. Respect the ROBLOX moderators. (Abridged for this recreation.)</p>'],
  Privacy: ['Privacy Policy', '<p>This recreation stores your account only on the machine running it (data/db.json). Nothing is sent anywhere else.</p>'],
  Jobs: ['Jobs at ROBLOX', '<p>ROBLOX is looking for talented engineers to help build the future of user-generated gaming. (Historical page placeholder.)</p>'],
  ContactUs: ['Contact Us', '<p>In 2008 you could email info@roblox.com. This recreation has no support staff, but you can look around the <a href="/Forum/Default.aspx">Forum</a>.</p>'],
  BuyRobloxStuff: ['Buy ROBLOX Stuff!', '<p>In 2008 the Catalog linked to an official ROBLOX merchandise store (T-shirts, mugs and stickers). It is not part of this recreation.</p>'],
};

function infoPage(key) {
  return (ctx) => ctx.send(page(ctx, { body: `<div class="StandardBox InfoPage"><h2 class="BoxTitle">${INFO[key][0]}</h2><div class="BoxBody">${INFO[key][1]}</div></div>` }));
}

function recreationPage(ctx) {
  const md = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'RESEARCH.md'), 'utf8');
  const html = require('../markdown').render(md);
  return ctx.send(page(ctx, { title: 'About this recreation', body: `<div class="StandardBox ResearchPage"><div class="BoxBody">${html}</div></div>`, ad: false }));
}

function abuseReport(ctx) {
  const body = `<div class="StandardBox" style="width:520px;margin:20px auto"><h2 class="BoxTitle">Report Abuse</h2><div class="BoxBody">
    ${ctx.method === 'POST' ? '<p>Thank you. Your report has been sent to the ROBLOX moderators.</p>' : `<form method="post"><p>Please tell us what is wrong:</p><p><select name="reason"><option>Inappropriate language</option><option>Asking for personal information</option><option>Bullying</option><option>Scamming</option><option>Inappropriate content</option></select></p><p><textarea class="MultilineTextBox" name="text" rows="5" cols="50"></textarea></p><p><input type="submit" class="Button" value="Send Report"/></p></form>`}
  </div></div>`;
  return ctx.send(page(ctx, { body }));
}

const routes = {
  '/upgrades/buildersclub.aspx': buildersClub,
  '/upgrades/paymentmethods.aspx': paymentMethods,
  '/parents.aspx': parentsHub,
  '/news.aspx': newsPage,
  '/help/default.aspx': helpPage,
  '/info/recreation.aspx': recreationPage,
};
for (const k of Object.keys(PARENT_PAGES)) routes[`/parents/${k.toLowerCase()}.aspx`] = parentSub(k);
for (const k of Object.keys(INFO)) routes[`/info/${k.toLowerCase()}.aspx`] = infoPage(k);
for (const k of ['user', 'asset', 'message', 'forumpost', 'ingamechat']) routes[`/abusereport/${k}.aspx`] = abuseReport;

module.exports = { routes };
