// The /My/ pages: Change Character, Inbox & private messages, friends and
// friend requests, Edit Profile, Account Balance, Configure Place, Share ROBLOX.
'use strict';
const clock = require('../clock');
const { page } = require('../layout');
const db = require('../db');
const v = require('../views');
const ads = require('../ads');
const { h, commas, clampInt, timeAgo, longDate } = require('../util');
const { PALETTE32 } = require('../seed');
const { brickColorHex } = require('../brickcolors');

const WEARABLE = { TShirt: 'tshirt', Shirt: 'shirt', Pants: 'pants', Hat: 'hat' };
const PARTS = [['Head', 'head'], ['Torso', 'torso'], ['LeftArm', 'leftArm'], ['RightArm', 'rightArm'], ['LeftLeg', 'leftLeg'], ['RightLeg', 'rightLeg']];

// ---------------------------------------------------------------------------- Character
function characterPage(ctx) {
  if (!ctx.requireLogin()) return;
  const u = ctx.user;
  const a = u.avatar;
  const cat = WEARABLE[ctx.query.cat] ? ctx.query.cat : 'Hat';
  if (ctx.method === 'POST' || ctx.query.wear) {
    const f = { ...ctx.form, wear: ctx.form.wear || ctx.query.wear };
    if (f.wear) {
      const it = db.itemById(Number(f.wear));
      if (it && WEARABLE[it.type] && (u.inventory.includes(it.id))) a[WEARABLE[it.type]] = it.id;
    }
    if (f.remove && Object.values(WEARABLE).includes(f.remove)) a[f.remove] = null;
    if (f.part && f.color) {
      const part = PARTS.find((p) => p[0] === f.part);
      const color = Number(f.color);
      if (part && PALETTE32.includes(color)) a.colors[part[1]] = color;
    }
    db.save();
    return ctx.redirect(`/My/Character.aspx?cat=${cat}`);
  }
  const owned = u.inventory.map((id) => db.itemById(id)).filter((i) => i && i.type === cat);
  const p = clampInt(ctx.query.p, 1, 99, 1);
  const per = 8;
  const pages = Math.max(1, Math.ceil(owned.length / per));
  const shown = owned.slice((p - 1) * per, p * per);
  const tile = (it, action) => `
    <div class="Asset">
      <div class="AssetThumbnail"><a href="/Item.aspx?ID=${it.id}" title="${h(it.name)}">${v.assetThumb(it, 110, 110)}</a>
        ${action}
      </div>
      <div class="AssetDetails"><div class="AssetName"><a href="/Item.aspx?ID=${it.id}">${h(it.name)}</a></div></div>
    </div>`;
  const wearForm = (it) => `<form method="post" action="/My/Character.aspx?cat=${cat}" class="WearForm"><input type="hidden" name="wear" value="${it.id}"/><a class="DeleteButtonOverlay" href="#" onclick="this.parentNode.submit();return false;">[ wear ]</a></form>`;
  const removeForm = (slot) => `<form method="post" action="/My/Character.aspx?cat=${cat}" class="WearForm"><input type="hidden" name="remove" value="${slot}"/><a class="DeleteButtonOverlay" href="#" onclick="this.parentNode.submit();return false;">[ remove ]</a></form>`;
  const wearing = Object.entries(WEARABLE).map(([, slot]) => a[slot] && db.itemById(a[slot])).filter(Boolean);
  const cats = [['TShirt', 'T-Shirts'], ['Shirt', 'Shirts'], ['Pants', 'Pants'], ['Hat', 'Hats']];
  const swatches = (part) => `<table cellspacing="0" border="0">${[0, 1, 2, 3].map((r) => `<tr>${PALETTE32.slice(r * 8, r * 8 + 8).map((c) => `<td><form method="post" action="/My/Character.aspx?cat=${cat}"><input type="hidden" name="part" value="${part}"/><input type="hidden" name="color" value="${c}"/><div class="ColorPickerItem" title="${h(brickColorHex(c).name)}" style="background-color:${brickColorHex(c).hex};width:32px;height:32px;" onclick="this.parentNode.submit()"></div></form></td>`).join('')}</tr>`).join('')}</table>`;
  const block = (part, key, x, y, w, hgt) => `<div class="BodyPart" id="Part_${part}" title="${part.replace(/([a-z])([A-Z])/g, '$1 $2')}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${hgt}px;background-color:${brickColorHex(a.colors[key]).hex};cursor:pointer;" onclick="rbxColorPopup('${part}', this)"></div>`;
  const body = `
<div id="CustomizeCharacterContainer">
  <div class="CharacterViewer">
    <h4>My Character</h4>
    <div class="CharacterImage">${v.avatarThumb(u, 352, 352)}</div>
    <div class="ReRender">Something wrong with your Avatar? <a href="/My/Character.aspx?cat=${cat}&amp;redraw=1" onclick="return rbxRedraw()">Click here to re-draw it!</a></div>
  </div>
  <div class="AttireChooser">
    <h4>My Wardrobe</h4>
    <div class="HeaderPager">
      <div class="AttireCategory">
        ${cats.map(([k, label]) => `<a class="AttireCategorySelector${k === cat ? '_Selected' : ''}" href="/My/Character.aspx?cat=${k}">${label}</a>`).join(' &nbsp;|&nbsp; ')}
        <br/>&nbsp;&nbsp;&nbsp;&nbsp;<b><a href="/Catalog.aspx?c=${{ TShirt: 2, Shirt: 11, Pants: 12, Hat: 8 }[cat]}">Shop</a></b>
      </div>
      ${pages > 1 ? v.pager(p, pages, (n) => `/My/Character.aspx?cat=${cat}&amp;p=${n}`, 'HeaderPager', '') : ''}
    </div>
    <div class="AttireContent">
      <div class="TileGroup">${shown.map((it) => tile(it, a[WEARABLE[it.type]] === it.id ? '' : wearForm(it))).join('') || `<div class="NoResults">You don't have any ${cats.find((c) => c[0] === cat)[1]}. <a href="/Catalog.aspx?c=${{ TShirt: 2, Shirt: 11, Pants: 12, Hat: 8 }[cat]}">Buy some in the Catalog!</a></div>`}</div>
      <div style="clear:both"></div>
    </div>
  </div>
  <div class="Mannequin">
    <h4>Color Chooser</h4>
    <p>Click a body part to change its color:</p>
    <div class="ColorChooserFrame" style="position:relative;width:176px;height:236px;margin:0 auto 10px;">
      <div style="position:absolute;left:11px;top:31px;width:154px;height:196px;">
        ${block('Head', 'head', 58, 0, 36, 36)}
        ${block('LeftArm', 'leftArm', 0, 44, 32, 72)}
        ${block('Torso', 'torso', 40, 44, 72, 72)}
        ${block('RightArm', 'rightArm', 120, 44, 32, 72)}
        ${block('LeftLeg', 'leftLeg', 40, 124, 32, 72)}
        ${block('RightLeg', 'rightLeg', 80, 124, 32, 72)}
      </div>
    </div>
    ${PARTS.map(([part]) => `<div id="Popup${part}" class="popupControl">${swatches(part)}</div>`).join('')}
  </div>
  <div class="Accoutrements">
    <h4>Currently Wearing</h4>
    <div class="AttireContent">
      <div class="TileGroup">${wearing.map((it) => tile(it, removeForm(WEARABLE[it.type]))).join('') || '<div class="NoResults">You are not wearing anything.</div>'}</div>
      <div style="clear:both"></div>
    </div>
  </div>
  <div style="clear:both"></div>
</div>`;
  return ctx.send(page(ctx, { title: 'ROBLOX - Change Character', body }));
}

// ---------------------------------------------------------------------------- Inbox
function inboxPage(ctx) {
  if (!ctx.requireLogin()) return;
  const u = ctx.user;
  if (ctx.method === 'POST') {
    for (const [k, val] of Object.entries(ctx.form)) {
      if (k.startsWith('sel_') && val) {
        const id = k.slice(4);
        if (id.startsWith('r')) { const r = ctx.state.friendRequests[id.slice(1)]; if (r && r.toId === u.id) r.handled = true; }
        else { const m = ctx.state.messages[id]; if (m && m.toId === u.id) m.deletedByRecipient = true; }
      }
    }
    db.save();
    return ctx.redirect('/My/Inbox.aspx');
  }
  const msgs = Object.values(ctx.state.messages).filter((m) => m.toId === u.id && !m.deletedByRecipient).map((m) => ({ ...m, kind: 'm' }));
  const reqs = Object.values(ctx.state.friendRequests).filter((r) => r.toId === u.id && !r.handled).map((r) => ({ id: r.id, fromId: r.fromId, subject: 'Friend Request', t: r.t, read: r.read, kind: 'r' }));
  const all = [...msgs, ...reqs].sort((a, b) => b.t - a.t);
  const p = clampInt(ctx.query.p, 1, 999, 1);
  const per = 20;
  const pages = Math.max(1, Math.ceil(all.length / per));
  const shown = all.slice((p - 1) * per, p * per);
  const showAd = !u.bc;
  const body = `
<div id="InboxContainer">
  ${showAd ? `<div class="Ads_WideSkyscraper">${ads.skyscraper()}</div>` : ''}
  <div id="InboxPane">
    <h2>Inbox</h2>
    <form method="post" action="/My/Inbox.aspx">
      <table class="InboxGrid" cellspacing="0" rules="all" border="1">
        <tr class="InboxHeader"><th><input type="checkbox" onclick="rbxCheckAll(this)"/></th><th>Subject</th><th>From</th><th>Date</th></tr>
        ${shown.map((m) => { const from = db.userById(m.fromId); const href = m.kind === 'r' ? `/My/FriendInvitation.aspx?InvitationID=${m.id}` : `/My/PrivateMessage.aspx?MessageID=${m.id}`; return `<tr class="InboxRow${m.read ? '' : '_Unread'}" onclick="if(event.target.type!=='checkbox')location.href='${href}'"><td><input type="checkbox" name="sel_${m.kind === 'r' ? 'r' : ''}${m.id}" value="1"/></td><td><a href="${href}">${h(m.subject)}</a></td><td><a href="/User.aspx?ID=${from?.id}">${h(from?.name)}${from?.id === 1 ? ' [System Message]' : ''}</a></td><td>${longDate(m.t)}</td></tr>`; }).join('')}
        ${!shown.length ? '<tr><td colspan="4" class="NoResults">You have no messages.</td></tr>' : ''}
        ${pages > 1 ? `<tr class="InboxPager"><td colspan="4">${Array.from({ length: pages }, (_, i) => (i + 1 === p ? `<span>${i + 1}</span>` : `<a href="/My/Inbox.aspx?p=${i + 1}">${i + 1}</a>`)).join(' ')}</td></tr>` : ''}
      </table>
      <div class="InboxButtons"><input type="submit" class="Button" value="Delete"/> <a class="Button" href="/User.aspx">Cancel</a></div>
    </form>
  </div>
  <div style="clear:both"></div>
</div>`;
  return ctx.send(page(ctx, { body }));
}

function messagePage(ctx) {
  if (!ctx.requireLogin()) return;
  const u = ctx.user;
  const mid = ctx.query.MessageID || ctx.query.messageid;
  const rid = ctx.query.RecipientID || ctx.query.recipientid;
  if (ctx.method === 'POST' && ctx.form.action) {
    if (ctx.form.action === 'delete' && mid) {
      const m = ctx.state.messages[mid];
      if (m && m.toId === u.id) m.deletedByRecipient = true;
      db.save();
      return ctx.redirect('/My/Inbox.aspx');
    }
    if (ctx.form.action === 'send' || ctx.form.action === 'senddelete') {
      const to = db.userById(Number(ctx.form.to));
      const subject = String(ctx.form.subject || '').trim().slice(0, 64) || '(no subject)';
      const text = String(ctx.form.body || '').slice(0, 2000);
      if (to && text.trim()) {
        const id = db.nextId('message');
        ctx.state.messages[id] = { id, fromId: u.id, toId: to.id, subject, body: text, t: clock.now(), read: false };
        if (ctx.form.action === 'senddelete' && mid && ctx.state.messages[mid]?.toId === u.id) ctx.state.messages[mid].deletedByRecipient = true;
        if (to.isBot) require('../bots').scheduleReply(to, u, subject, text);
        db.save();
        return ctx.send(page(ctx, { body: `<div class="MessageContainer"><div id="Message"><h3>Message Sent</h3><p>Your message has been sent to ${h(to.name)}.</p><p><a class="Button" href="/My/Inbox.aspx">Continue</a></p></div></div>` }));
      }
    }
  }
  if (mid && !ctx.query.reply) {
    const m = ctx.state.messages[mid];
    if (!m || (m.toId !== u.id && m.fromId !== u.id)) return ctx.redirect('/My/Inbox.aspx');
    if (m.toId === u.id && !m.read) { m.read = true; db.save(); }
    const from = db.userById(m.fromId);
    const body = `
<div class="MessageContainer"><div id="MessagePane">
  <h3>Private Message</h3>
  <div class="MessageReaderContainer"><div id="Message">
    <div class="MessageHeader">
      <div class="Avatar">${v.avatarThumb(from, 100, 100)}</div>
      <div><span class="Label">Date:</span> ${longDate(m.t)}</div>
      <div><span class="Label">Author:</span> ${v.userLink(from)}</div>
      <div><span class="Label">Subject:</span> ${h(m.subject)}</div>
      <div style="clear:both"></div>
    </div>
    <div class="Body">${h(m.body).replace(/\n/g, '<br/>')}</div>
    <div class="Buttons">
      <a class="Button" href="/My/Inbox.aspx">Cancel</a>
      <form method="post" style="display:inline"><input type="hidden" name="action" value="delete"/><input type="submit" class="Button" value="Delete"/></form>
      ${m.fromId !== u.id && from.id !== 1 ? `<a class="Button" href="/My/PrivateMessage.aspx?MessageID=${m.id}&amp;reply=1">Reply</a>` : ''}
      <a class="Button" href="/AbuseReport/Message.aspx?ID=${m.id}">Report Abuse</a>
    </div>
  </div><div style="clear:both"></div></div>
</div></div>`;
    return ctx.send(page(ctx, { body }));
  }
  // compose / reply
  let to = rid ? db.userById(Number(rid)) : null;
  let subject = '', quoted = '';
  if (mid) {
    const m = ctx.state.messages[mid];
    if (m && m.toId === u.id) { to = db.userById(m.fromId); subject = m.subject.startsWith('RE: ') ? m.subject : 'RE: ' + m.subject; quoted = `\n\n------------------------------\nOn ${longDate(m.t)}, ${to.name} wrote:\n${m.body}`; }
  }
  if (!to) return ctx.redirect('/My/Inbox.aspx');
  const body = `
<div class="MessageContainer"><div id="MessagePane">
  <h3>Your Message</h3>
  <div id="MessageEditorContainer" class="MessageEditor">
    <form method="post" action="/My/PrivateMessage.aspx?${v.qs({ MessageID: mid, RecipientID: rid, reply: mid ? 1 : null })}">
      <input type="hidden" name="to" value="${to.id}"/>
      <table class="MessageFields">
        <tr><td class="Label">From:</td><td>${h(u.name)}</td></tr>
        <tr><td class="Label">Send To:</td><td>${v.userLink(to)}</td></tr>
        <tr><td class="Label">Subject:</td><td><input type="text" name="subject" class="TextBox" style="width:400px" maxlength="64" value="${h(subject)}"/></td></tr>
        <tr><td class="Label" valign="top">Message:</td><td><textarea name="body" class="MultilineTextBox" style="width:400px;height:250px">${h(quoted)}</textarea></td></tr>
      </table>
      <div class="Buttons">
        <button class="Button" name="action" value="send">Send</button>
        ${mid ? '<button class="Button" name="action" value="senddelete">Send &amp; Delete</button>' : ''}
        <a class="Button" href="${mid ? `/My/PrivateMessage.aspx?MessageID=${mid}` : `/User.aspx?ID=${to.id}`}">Cancel</a>
      </div>
    </form>
  </div>
</div></div>`;
  return ctx.send(page(ctx, { body }));
}

// ---------------------------------------------------------------------------- friends
function friendRequest(ctx) {
  if (!ctx.requireLogin()) return;
  const u = ctx.user;
  const target = db.userById(Number(ctx.query.UserID || ctx.query.userid));
  if (!target || target.id === u.id) return ctx.redirect('/User.aspx');
  let msg;
  if (u.friends.includes(target.id)) msg = `You are already friends with ${h(target.name)}.`;
  else if (Object.values(ctx.state.friendRequests).some((r) => r.fromId === u.id && r.toId === target.id && !r.handled)) msg = `You have already sent a friend request to ${h(target.name)}.`;
  else {
    const id = db.nextId('request');
    ctx.state.friendRequests[id] = { id, fromId: u.id, toId: target.id, t: clock.now(), handled: false, read: false };
    if (target.isBot) require('../bots').scheduleFriendAccept(target, u, id);
    db.save();
    msg = `Your friend request has been sent to ${h(target.name)}.`;
  }
  return ctx.send(page(ctx, { body: `<div class="MessageContainer"><div id="Message"><h3>Friend Request</h3><p>${msg}</p><p><a class="Button" href="/User.aspx?ID=${target.id}">Continue</a></p></div></div>` }));
}

function friendInvitation(ctx) {
  if (!ctx.requireLogin()) return;
  const u = ctx.user;
  const r = ctx.state.friendRequests[ctx.query.InvitationID || ctx.query.invitationid];
  if (!r || r.toId !== u.id) return ctx.redirect('/My/Inbox.aspx');
  const from = db.userById(r.fromId);
  if (ctx.method === 'POST') {
    if (ctx.form.action === 'accept' && !u.friends.includes(from.id)) {
      u.friends.push(from.id); from.friends.push(u.id);
      for (const x of [u, from]) if (x.friends.length >= 20 && !x.badges.includes('Friendship')) x.badges.push('Friendship');
    }
    if (ctx.form.action !== 'cancel') r.handled = true;
    db.save();
    return ctx.redirect('/My/Inbox.aspx');
  }
  if (!r.read) { r.read = true; db.save(); }
  const body = `
<div id="InvitationContainer"><div id="InvitationPane">
  <h3>Friend Request</h3>
  <div class="MessageReaderContainer Invitation">
    <div class="Avatar">${v.avatarThumb(from, 100, 100)}</div>
    <p><span class="Label">Date:</span> ${longDate(r.t)}</p>
    <p><span class="Label">From:</span> ${v.userLink(from)}</p>
    <p>${h(from.name)} would like to be your friend on ROBLOX.</p>
    <form method="post">
      <button class="Button" name="action" value="accept">Accept</button>
      <button class="Button" name="action" value="decline">Decline</button>
      <button class="Button" name="action" value="cancel">Cancel</button>
      <a href="/AbuseReport/User.aspx?ID=${from.id}">Report Abuse</a>
    </form>
    <div style="clear:both"></div>
  </div>
</div></div>`;
  return ctx.send(page(ctx, { body }));
}

function editFriends(ctx) {
  if (!ctx.requireLogin()) return;
  const u = ctx.user;
  if (ctx.method === 'POST' && ctx.form.remove) {
    const f = db.userById(Number(ctx.form.remove));
    if (f) { u.friends = u.friends.filter((x) => x !== f.id); f.friends = f.friends.filter((x) => x !== u.id); db.save(); }
    return ctx.redirect('/My/EditFriends.aspx');
  }
  const friends = u.friends.map((id) => db.userById(id)).filter(Boolean);
  const rows = [];
  for (let i = 0; i < friends.length; i += 6) rows.push(friends.slice(i, i + 6));
  const body = `
<div id="FriendsContainer">
  <div id="Friends">
    <h4>My Friends (${friends.length})</h4>
    <table cellspacing="0" border="0" align="center">${rows.map((r) => `<tr>${r.map((f) => `<td><div class="Friend"><div class="Avatar"><a href="/User.aspx?ID=${f.id}">${v.avatarThumb(f, 100, 100)}</a></div><div class="Summary"><a href="/User.aspx?ID=${f.id}">${h(f.name)}</a></div><div class="Options"><form method="post"><input type="hidden" name="remove" value="${f.id}"/><input type="submit" class="Button" value="Delete"/></form></div></div></td>`).join('')}</tr>`).join('')}</table>
    ${!friends.length ? '<div class="NoResults">You don\'t have any ROBLOX friends.</div>' : ''}
  </div>
</div>`;
  return ctx.send(page(ctx, { body }));
}

// ---------------------------------------------------------------------------- profile & money
function profilePage(ctx) {
  if (!ctx.requireLogin()) return;
  const u = ctx.user;
  let note = '';
  if (ctx.method === 'POST') {
    const f = ctx.form;
    u.under13 = f.agegroup === '1';
    u.superSafe = f.chatmode === 'true';
    u.email = String(f.email || '').slice(0, 100);
    u.blurb = String(f.blurb || '').slice(0, 1000);
    if (f.newpassword) {
      if (/^\S{4,10}$/.test(f.newpassword) && f.newpassword === f.confirmpassword) { u.password = db.hashPassword(f.newpassword); note = 'Your password has been changed.'; } else note = 'Passwords must be 4-10 characters and match.';
    }
    db.save();
    if (!note) return ctx.redirect('/User.aspx');
  }
  const body = `
<div id="EditProfileContainer">
  <h2>Edit Profile</h2>
  <form method="post">
    ${note ? `<p class="Attention" style="text-align:center">${h(note)}</p>` : ''}
    <fieldset><legend>Update your age-group</legend>
      <div class="Row"><input type="radio" id="a1" name="agegroup" value="1"${u.under13 ? ' checked' : ''}/><label for="a1">Under 13 years</label><br/><input type="radio" id="a2" name="agegroup" value="2"${!u.under13 ? ' checked' : ''}/><label for="a2">13 years or older</label></div></fieldset>
    <fieldset><legend>Update your chat mode</legend>
      <div class="Row"><input type="radio" id="c1" name="chatmode" value="false"${!u.superSafe ? ' checked' : ''}/><label for="c1">Safe Chat</label><br/><input type="radio" id="c2" name="chatmode" value="true"${u.superSafe ? ' checked' : ''}/><label for="c2">SuperSafe Chat</label></div></fieldset>
    <fieldset><legend>Change your password</legend>
      <div class="Row"><label class="Label">New Password:</label> <input type="password" name="newpassword" class="TextBox" maxlength="10"/><br/><br/><label class="Label">Confirm Password:</label> <input type="password" name="confirmpassword" class="TextBox" maxlength="10"/></div></fieldset>
    <fieldset><legend>Update Email Address</legend>
      <div class="Row"><label class="Label">Email:</label> <input type="text" name="email" class="TextBox" value="${h(u.email)}"/></div></fieldset>
    <fieldset><legend>Update your personal blurb</legend>
      <div class="Row"><textarea name="blurb" class="MultilineTextBox" rows="8" cols="60" maxlength="1000">${h(u.blurb)}</textarea></div></fieldset>
    <div class="Buttons"><input type="submit" class="Button" value="Update"/> <a class="Button" href="/User.aspx">Cancel</a></div>
  </form>
</div>`;
  return ctx.send(page(ctx, { body }));
}

function accountBalance(ctx) {
  if (!ctx.requireLogin()) return;
  const u = ctx.user;
  const now = clock.now();
  const sum = (since, kind, cur) => (u.earnings || []).filter((e) => e.t >= since && e.kind === kind).reduce((a, e) => a + e[cur], 0);
  const period = (label, since) => {
    const rows = [['LoginAward', 'Login Award'], ['PlaceTrafficAward', 'Place Traffic Award'], ['SaleOfGoods', 'Sale of Goods']];
    const tr = rows.reduce((a, [k]) => a + sum(since, k, 'robux'), 0), tt = rows.reduce((a, [k]) => a + sum(since, k, 'tix'), 0);
    return `<div class="Earnings_Period"><h4>${label}</h4>
      <div class="Earnings_Header"><div class="Label">&nbsp;</div><div class="Field"><b>ROBUX</b></div><div class="Field"><b>Tickets</b></div><div style="clear:both"></div></div>
      ${rows.map(([k, lbl]) => `<div class="Earnings_${k}"><div class="Label">${lbl}</div><div class="Field">${commas(sum(since, k, 'robux'))}</div><div class="Field">${commas(sum(since, k, 'tix'))}</div><div style="clear:both"></div></div>`).join('')}
      <div class="Earnings_PeriodTotal"><div class="Label">Total:</div><div class="Field">${commas(tr)}</div><div class="Field">${commas(tt)}</div><div style="clear:both"></div></div></div>`;
  };
  const body = `
<div id="MyAccountBalanceContainer">
  <h2>My Account Balance</h2>
  <div id="AboutRobux">
    <h3>What are ROBUX?</h3>
    <p>ROBUX are the principle currency of Robloxia. Citizens in the Builders Club receive a daily allowance of ROBUX to help them live a comfortable life of leisure.</p>
    <h3>What are Tickets?</h3>
    <p>Robloxian Tickets are similar to tickets you win in an arcade. You play the game, get tickets, and are rewarded with fabulous prizes. Tickets are granted to citizens who are helping to expand and improve Robloxia.</p>
    <h3>Where do I buy things?</h3>
    <p>Spend your ROBUX and Tickets in the <a href="/Catalog.aspx">ROBLOX Catalog</a>.</p>
  </div>
  <div class="Balances">
    <p class="Balance Robux">${commas(u.robux)} ROBUX</p>
    <p class="Balance Tickets">${commas(u.tix)} Tickets</p>
  </div>
  <div id="Earnings">
    <h3>Earnings</h3>
    ${period('Past Day', now - 86400000)}${period('Past Week', now - 7 * 86400000)}${period('Past Month', now - 30 * 86400000)}${period('All Time', 0)}
  </div>
  <div style="clear:both"></div>
</div>`;
  return ctx.send(page(ctx, { body }));
}

function configurePlace(ctx) {
  if (!ctx.requireLogin()) return;
  const pl = db.placeById(Number(ctx.query.PlaceID || ctx.query.placeid));
  if (!pl || pl.creatorId !== ctx.user.id) return ctx.redirect('/User.aspx');
  if (ctx.method === 'POST') {
    const f = ctx.form;
    if (f.action === 'reset') {
      pl.theme = ['happyhome', 'brickbattle', 'baseplate'].includes(f.template) ? f.template : 'happyhome';
      pl.build = null;
      pl.updated = clock.now();
    } else {
      pl.name = String(f.name || pl.name).slice(0, 50) || pl.name;
      pl.desc = String(f.desc || '').slice(0, 1000);
      pl.public = f.access !== 'friends';
      pl.copylocked = !!f.copylock;
      pl.updated = clock.now();
    }
    pl.thumbVersion = (pl.thumbVersion || 0) + 1;
    db.save();
    return ctx.redirect(`/User.aspx`);
  }
  const body = `
<div id="ConfigurePlaceContainer">
  <h2>Configure Place</h2>
  <form method="post">
    <div id="PlaceName"><label class="Label">Name:</label><br/><input type="text" name="name" class="TextBox" style="width:400px" maxlength="50" value="${h(pl.name)}"/></div>
    <div id="PlaceThumbnail">${v.placeThumb(pl, 420, 230)}</div>
    <div id="PlaceDescription"><label class="Label">Description:</label><br/><textarea name="desc" class="MultilineTextBox" rows="8" style="width:400px">${h(pl.desc)}</textarea></div>
    <div id="PlaceAccess"><fieldset><legend>Access</legend><div class="Suggestion">This determines who can access your place.</div>
      <div class="PlaceAccessRow"><input type="radio" id="ap" name="access" value="public"${pl.public ? ' checked' : ''}/><label for="ap">Public: Anybody can visit my place</label><br/><input type="radio" id="af" name="access" value="friends"${!pl.public ? ' checked' : ''}/><label for="af">Friends: Only my friends can visit my place</label></div></fieldset></div>
    <div id="PlaceCopyProtection"><fieldset><legend>Copy Protection</legend><div class="Suggestion">Checking this will prevent your place from being copied but will also make it available to others only in online mode.</div>
      <div class="CopyProtectionRow"><input type="checkbox" id="cl" name="copylock" value="1"${pl.copylocked ? ' checked' : ''}/><label for="cl">Copy-Lock my place</label></div></fieldset></div>
    <div class="Buttons" style="text-align:center;margin:10px"><input type="submit" class="Button" value="Update"/> <a class="Button" href="/User.aspx">Cancel</a></div>
  </form>
  <div id="PlaceReset"><fieldset><legend>Reset Place</legend><div class="Suggestion">Only do this if you want to reset your place to one of our starting templates. This will cause you to lose any changes you have made and cannot be un-done.</div>
    <form method="post" onsubmit="return confirm('Reset your place? This cannot be undone.')"><input type="hidden" name="action" value="reset"/>
      <table class="ResetTemplates"><tr>
        ${[['happyhome', 'Happy Home in Robloxia'], ['brickbattle', 'Starting BrickBattle Map'], ['baseplate', 'Empty Baseplate']].map(([k, label]) => `<td><label><input type="radio" name="template" value="${k}"${k === 'happyhome' ? ' checked' : ''}/><br/>${v.thumb({ kind: 'place', w: 120, h: 70, key: `template-${k}-v4`, data: { script: 'personal', theme: k, name: label } })}<br/>${label}</label></td>`).join('')}
      </tr></table>
      <div style="text-align:center"><input type="submit" class="Button" value="Reset Place"/></div>
    </form></fieldset></div>
</div>`;
  return ctx.send(page(ctx, { body }));
}

function inviteAFriend(ctx) {
  if (!ctx.requireLogin()) return;
  const sent = ctx.method === 'POST';
  const body = `
<div id="InviteAFriendContainer">
  <h2>Share ROBLOX with a Friend</h2>
  ${sent ? '<p class="Attention">Thanks! (This recreation does not send email.)</p>' : ''}
  <p>Tell your friends about ROBLOX! Recruit three or more friends to earn the <b>Inviter</b> badge.</p>
  <form method="post">
    <p><label class="Label">Your friend's email:</label> <input type="text" name="email" class="TextBox"/></p>
    <p><label class="Label">Message:</label><br/><textarea class="MultilineTextBox" name="msg" rows="6" cols="60">Hey! Check out ROBLOX. It's a free online building game. Make a character, build stuff, and battle! My character name is ${h(ctx.user.name)}.</textarea></p>
    <p><input type="submit" class="Button" value="Send"/></p>
  </form>
</div>`;
  return ctx.send(page(ctx, { body }));
}

function upgradesManage(ctx) {
  if (!ctx.requireLogin()) return;
  const u = ctx.user;
  const body = `
<div id="ManageAccountUpgradesContainer">
  <h2>Account Upgrades</h2>
  <div id="CurrentAccountUpgrades">
    ${u.bc ? '<p class="UpgradeStatus">You are a member of the Builders Club. You receive 15 ROBUX every day!</p>' : `<p class="UpgradeStatus">You don't have any account upgrades.</p><p style="text-align:center"><a href="/Upgrades/BuildersClub.aspx">Join the Builders Club!</a></p>`}
  </div>
</div>`;
  return ctx.send(page(ctx, { body }));
}

module.exports = {
  routes: {
    '/my/character.aspx': characterPage,
    '/my/inbox.aspx': inboxPage,
    '/my/privatemessage.aspx': messagePage,
    '/my/friendrequest.aspx': friendRequest,
    '/my/friendinvitation.aspx': friendInvitation,
    '/my/editfriends.aspx': editFriends,
    '/my/profile.aspx': profilePage,
    '/my/accountbalance.aspx': accountBalance,
    '/my/place.aspx': configurePlace,
    '/my/inviteafriend.aspx': inviteAFriend,
    '/my/accountupgrades/manage.aspx': upgradesManage,
  },
};
