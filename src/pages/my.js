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
    <form method="post" action="/My/Inbox.aspx" id="InboxForm" style="margin:0">
      <div id="Inbox"><div>
      <table cellspacing="0" cellpadding="3" border="0" style="width:726px;border-collapse:collapse;">
        <tr class="InboxHeader"><th align="left" scope="col"><input type="checkbox" onclick="rbxCheckAll(this)"/></th><th align="left" scope="col"><a href="/My/Inbox.aspx">Subject</a></th><th align="left" scope="col"><a href="/My/Inbox.aspx">From</a></th><th align="left" scope="col"><a href="/My/Inbox.aspx">Date</a></th></tr>
        ${shown.map((m) => { const from = db.userById(m.fromId); const href = m.kind === 'r' ? `/My/FriendInvitation.aspx?InvitationID=${m.id}` : `/My/PrivateMessage.aspx?MessageID=${m.id}`; return `<tr class="InboxRow${m.read ? '' : '_Unread'}" onclick="if(event.target.type!=='checkbox')location.href='${href}'"><td><span style="display:inline-block;width:25px;"><input type="checkbox" name="sel_${m.kind === 'r' ? 'r' : ''}${m.id}" value="1"/></span></td><td align="left"><a href="${href}">${h(m.subject)}</a></td><td align="left"><a href="/User.aspx?ID=${from?.id}" title="Visit ${h(from?.name)}'s Home Page">${h(from?.name)}${from?.id === 1 ? ' [System Message]' : ''}</a></td><td align="left">${longDate(m.t)}</td></tr>`; }).join('')}
        ${!shown.length ? '<tr class="InboxRow"><td colspan="4" class="NoResults">You have no messages.</td></tr>' : ''}
        ${pages > 1 ? `<tr class="InboxPager"><td colspan="4"><table border="0"><tr>${Array.from({ length: pages }, (_, i) => `<td>${i + 1 === p ? `<span>${i + 1}</span>` : `<a href="/My/Inbox.aspx?p=${i + 1}">${i + 1}</a>`}</td>`).join('')}</tr></table></td></tr>` : ''}
      </table>
      </div></div>
      <div class="Buttons">
        <a class="Button" href="#" onclick="document.getElementById('InboxForm').submit();return false;">Delete</a>
        <a class="Button" href="/User.aspx">Cancel</a>
      </div>
    </form>
  </div>
  <div style="clear:both"></div>
</div>`;
  return ctx.send(page(ctx, { body }));
}

/** The 2008 PrivateMessage.aspx frame: a 160px ad pane, then the message pane. */
function messageShell(ctx, inner) {
  return `
<div class="MessageContainer">
  <div id="AdsPane">${ctx.user && !ctx.user.bc ? `<div class="Ads_WideSkyscraper" style="border:0">${ads.skyscraper()}</div>` : ''}</div>
  <div id="MessagePane">${inner}
  </div>
  <div style="clear: both;"></div>
</div>`;
}

/** Reply quote header date, e.g. "12/27/2007 at 4:40 PM". */
function quoteDate(t) {
  const [d, time, ampm] = longDate(t).split(' ');
  return `${d} at ${time.replace(/:\d\d$/, '')} ${ampm}`;
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
        return ctx.send(page(ctx, { body: messageShell(ctx, `
    <div id="Confirmation">
      <h3>Message Sent</h3>
      <div id="Message">Your message has been sent to ${h(to.name)}.</div>
      <div class="Buttons"><a class="Button" href="/My/Inbox.aspx">Continue</a></div>
      <div style="clear:both"></div>
    </div>`) }));
      }
    }
  }
  let m = null;
  if (mid) {
    m = ctx.state.messages[mid];
    if (!m || (m.toId !== u.id && m.fromId !== u.id)) return ctx.redirect('/My/Inbox.aspx');
    if (m.toId === u.id && !m.read) { m.read = true; db.save(); }
  }
  const reply = !!(m && ctx.query.reply && m.toId === u.id && m.fromId !== 1);
  let reader = '';
  if (m) {
    const from = db.userById(m.fromId);
    const canReply = m.fromId !== u.id && m.fromId !== 1;
    reader = `
    <h3>Private Message</h3>
    <div class="MessageReaderContainer">
      <div id="Message">
        <table width="100%"><tr valign="top">
          <td style="width:8em">
            <div id="DateSent">${longDate(m.t)}</div>
            <div id="Author"><a title="${h(from?.name)}">${v.avatarThumb(from, 64, 64)}</a><br/><a href="/User.aspx?ID=${from?.id}" title="Visit ${h(from?.name)}'s Home Page">${h(from?.name)}</a></div>
            <div id="Subject">${h(m.subject)}<br/><br/>
              <div class="ReportAbusePanel"><span class="AbuseIcon"><a href="/AbuseReport/Message.aspx?ID=${m.id}"><img src="/images/abuse.png" alt="Report Abuse" border="0"/></a></span> <span class="AbuseButton"><a href="/AbuseReport/Message.aspx?ID=${m.id}">Report Abuse</a></span></div>
            </div>
          </td>
          <td><div class="Body"><div class="MultilineTextBox">${h(m.body).replace(/\n/g, '<br/>')}</div></div></td>
        </tr></table>
      </div>
      <div style="clear:both"></div>
    </div>
    <form method="post" id="DeleteMessageForm" action="/My/PrivateMessage.aspx?MessageID=${m.id}" style="margin:0"><input type="hidden" name="action" value="delete"/></form>
    <div class="Buttons">
      <a class="Button" href="/My/Inbox.aspx">Cancel</a>
      ${m.toId === u.id ? '<a class="Button" href="#" onclick="document.getElementById(\'DeleteMessageForm\').submit();return false;">Delete</a>' : ''}
      ${canReply ? `<a class="Button" href="/My/PrivateMessage.aspx?MessageID=${m.id}&amp;reply=1">Reply</a>` : ''}
    </div>
    <div style="clear:both"></div>`;
    if (!reply) return ctx.send(page(ctx, { body: messageShell(ctx, reader) }));
  }
  // compose / reply
  const to = reply ? db.userById(m.fromId) : (rid ? db.userById(Number(rid)) : null);
  if (!to) return ctx.redirect('/My/Inbox.aspx');
  const subject = reply ? `RE: ${m.subject}` : '';
  const quoted = reply ? `\n\n\n------------------------------\nOn ${quoteDate(m.t)} ${to.name} wrote:\n\n${m.body}` : '';
  const editor = `
    <h3>Your Message</h3>
    <form method="post" id="MessageEditorForm" style="margin:0" action="/My/PrivateMessage.aspx?${v.qs({ MessageID: mid, RecipientID: rid, reply: reply ? 1 : null })}">
    <input type="hidden" name="to" value="${to.id}"/><input type="hidden" name="action" value="send"/>
    <div id="MessageEditorContainer">
      <div class="MessageEditor">
        <table width="100%"><tr valign="top">
          <td style="width:12em">
            <div id="From"><span class="Label">From:</span> <span class="Field">${h(u.name)}</span></div>
            <div id="To"><span class="Label">Send To:</span> <span class="Field">${h(to.name)}</span></div>
          </td>
          <td style="padding:0 24px 6px 12px">
            <div id="Subject"><div class="Label"><label for="txtSubject">Subject:</label></div><div class="Field"><input type="text" id="txtSubject" name="subject" class="TextBox" style="width:100%;" maxlength="64" value="${h(subject)}"/></div></div>
            <div class="Body"><div class="Label"><label for="txtBody">Message:</label></div><textarea id="txtBody" name="body" rows="2" cols="20" class="MultilineTextBox" style="width:100%;">${h(quoted)}</textarea></div>
          </td>
        </tr></table>
      </div>
      <div style="clear:both"></div>
    </div>
    </form>
    <div class="Buttons">
      <a class="Button" href="#" onclick="var f=document.getElementById('MessageEditorForm');f.elements.action.value='send';f.submit();return false;">Send</a>
      ${reply ? `<a class="Button" href="#" onclick="var f=document.getElementById('MessageEditorForm');f.elements.action.value='senddelete';f.submit();return false;">Send &amp; Delete</a>` : `<a class="Button" href="/User.aspx?ID=${to.id}">Cancel</a>`}
    </div>
    <div style="clear:both"></div>`;
  const body = messageShell(ctx, reader + editor);
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
  return ctx.send(page(ctx, { body: messageShell(ctx, `
    <div id="Confirmation">
      <h3>Friend Request</h3>
      <div id="Message">${msg}</div>
      <div class="Buttons"><a class="Button" href="/User.aspx?ID=${target.id}">Continue</a></div>
      <div style="clear:both"></div>
    </div>`) }));
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
  const act = (a, label) => `<a class="Button" href="#" onclick="var f=document.getElementById('InvitationForm');f.elements.action.value='${a}';f.submit();return false;">${label}</a>`;
  const body = `
<div id="InvitationContainer">
  <div id="AdsPane">${!u.bc ? `<div class="Ads_WideSkyscraper" style="border:0">${ads.skyscraper()}</div>` : ''}</div>
  <div id="InvitationPane">
    <h3>Friend Request</h3>
    <div class="MessageReaderContainer">
      <div id="Message">
        <table width="100%"><tr valign="top">
          <td style="width:8em">
            <div id="DateSent">${longDate(r.t)}</div>
            <div id="Author"><a title="${h(from.name)}">${v.avatarThumb(from, 64, 64)}</a><br/><a href="/User.aspx?ID=${from.id}" title="Visit ${h(from.name)}'s Home Page">${h(from.name)}</a></div>
            <div id="Subject">Friend Request<br/><br/>
              <div class="ReportAbusePanel"><span class="AbuseIcon"><a href="/AbuseReport/User.aspx?ID=${from.id}"><img src="/images/abuse.png" alt="Report Abuse" border="0"/></a></span> <span class="AbuseButton"><a href="/AbuseReport/User.aspx?ID=${from.id}">Report Abuse</a></span></div>
            </div>
          </td>
          <td><div class="Body"><div class="MultilineTextBox">${h(r.text || '').replace(/\n/g, '<br/>')}</div></div></td>
        </tr></table>
      </div>
      <div style="clear:both"></div>
    </div>
    <form method="post" id="InvitationForm" style="margin:0"><input type="hidden" name="action" value="cancel"/></form>
    <div class="Buttons">
      <a class="Button" href="/My/Inbox.aspx">Cancel</a>
      ${act('decline', 'Decline')}
      ${act('accept', 'Accept')}
    </div>
  </div>
  <div style="clear: both;"></div>
</div>`;
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
  const { friendCell } = require('./user');
  const body = `
<div id="FriendsContainer">
  <div id="Friends">
    <h4>My Friends (${friends.length})</h4>
    <div style="text-align:center;">Pages: </div>
    <table cellspacing="0" align="center" border="0">${rows.map((r) => `<tr>${r.map((f) => `<td>${friendCell(f, `<div class="Options"><form method="post" style="margin:0"><input type="hidden" name="remove" value="${f.id}"/><input type="submit" value="Delete"/></form></div>`)}</td>`).join('')}</tr>`).join('')}</table>
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
  <form method="post" id="EditProfileForm" style="margin:0">
    ${note ? `<p class="Attention" style="text-align:center">${h(note)}</p>` : ''}
    <div id="AgeGroup"><fieldset title="Update your age-group"><legend>Update your age-group</legend>
      <div class="Suggestion">This is used to customize your ROBLOX experience. Users under 13 years are only shown pre-approved images.</div>
      <div class="AgeGroupRow"><table border="0"><tr><td><input type="radio" id="a1" name="agegroup" value="1"${u.under13 ? ' checked="checked"' : ''}/><label for="a1">Under 13 years</label></td></tr><tr><td><input type="radio" id="a2" name="agegroup" value="2"${!u.under13 ? ' checked="checked"' : ''}/><label for="a2">13 years or older</label></td></tr></table></div>
    </fieldset></div>
    <div id="ChatMode"><fieldset title="Update your chat mode"><legend>Update your chat mode</legend>
      <div class="Suggestion">All in-game chat is subject to profanity filtering and moderation. For enhanced chat safety, choose SuperSafe Chat; only chat from pre-approved menus will be shown to you.</div>
      <div class="ChatModeRow"><table border="0"><tr><td><input type="radio" id="c1" name="chatmode" value="false"${!u.superSafe ? ' checked="checked"' : ''}/><label for="c1">Safe Chat</label></td></tr><tr><td><input type="radio" id="c2" name="chatmode" value="true"${u.superSafe ? ' checked="checked"' : ''}/><label for="c2">SuperSafe Chat</label></td></tr></table></div>
    </fieldset></div>
    <div id="ResetPassword"><fieldset title="Reset your password"><legend>Change your password</legend>
      <div class="Suggestion">Click the button below to change your password.</div>
      <div class="ResetPasswordRow">&nbsp;<a href="#" onclick="this.style.display='none';document.getElementById('NewPasswordFields').style.display='block';return false;">Change Password</a>
        <div id="NewPasswordFields" style="display:${note ? 'block' : 'none'};font-size:.8em;line-height:2.6em;"><label class="Label" for="np">New Password:</label>&nbsp;<input type="password" id="np" name="newpassword" class="TextBox" maxlength="10"/><br/><label class="Label" for="cp">Confirm Password:</label>&nbsp;<input type="password" id="cp" name="confirmpassword" class="TextBox" maxlength="10"/></div>
      </div>
    </fieldset></div>
    <div id="EnterEmail"><fieldset title="Update Email Address"><legend>Update Email Address</legend>
      <div class="EmailRow"><label for="em" class="Label">Email:</label>&nbsp;<input type="text" id="em" name="email" class="TextBox" value="${h(u.email)}"/></div>
    </fieldset></div>
    <div id="Blurb"><fieldset title="Update your personal blurb"><legend>Update your personal blurb</legend>
      <div class="Suggestion">Describe yourself here (max. 1000 characters). Make sure not to provide any details that can be used to identify you outside ROBLOX.</div>
      <div class="BlurbRow"><textarea name="blurb" rows="2" cols="20" class="MultilineTextBox" maxlength="1000">${h(u.blurb)}</textarea></div>
    </fieldset></div>
  </form>
  <div class="Buttons"><a class="Button" href="#" onclick="document.getElementById('EditProfileForm').submit();return false;">Update</a>&nbsp;<a class="Button" href="/User.aspx">Cancel</a></div>
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
      ${rows.map(([k, lbl]) => `<div class="Earnings_${k}"><div class="Label">${lbl}</div><div class="Field">${sum(since, k, 'robux') ? commas(sum(since, k, 'robux')) : '&nbsp;'}</div><div class="Field">${commas(sum(since, k, 'tix'))}</div><div style="clear:both"></div></div>`).join('')}
      <div class="Earnings_PeriodTotal"><div class="Label">Total:</div><div class="Field">${commas(tr)}</div><div class="Field">${commas(tt)}</div><div style="clear:both"></div></div></div>`;
  };
  const body = `
<div id="MyAccountBalanceContainer">
  <h2>My Account Balance</h2>
  <div id="AboutRobux">
    <h3>What are ROBUX?</h3>
    <p>ROBUX are the principle currency of Robloxia. Citizens in the Builders Club receive a daily allowance of ROBUX to help them live a comfortable life of leisure. For this and other benefits, consider joining the <a href="/Upgrades/BuildersClub.aspx">Builders Club</a>!</p>
    <h3>What are Tickets?</h3>
    <p>Robloxian Tickets are similar to tickets you win in an arcade. You play the game, get tickets, and are rewarded with fabulous prizes. Tickets are granted to citizens who are helping to expand and improve Robloxia. The primary way to get tickets is to make a cool place, and then get people to visit it. You can also get the daily login bonus, just by showing up!</p>
    <h3>Where do I buy things?</h3>
    <p>Browse the <a href="/Catalog.aspx">ROBLOX Catalog</a></p>
  </div>
  <div id="Earnings">
    <h3>Earnings</h3>
    <div><div class="Label"></div><div class="Field"><img src="/images/Robux.png" alt="Robux" border="0"/></div><div class="Field"><img src="/images/Tickets.png" alt="Tickets" border="0"/></div><div style="clear:both"></div></div>
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
  const templates = [['happyhome', 'Happy Home in Robloxia'], ['brickbattle', 'Starting BrickBattle Map'], ['baseplate', 'Empty Baseplate']];
  const tcell = ([k, label]) => `<td align="center" valign="middle"><form method="post" style="margin:0" onsubmit="return confirm('Reset your place? This cannot be undone.')"><input type="hidden" name="action" value="reset"/><input type="hidden" name="template" value="${k}"/><a href="#" title="${label}" onclick="var f=this.parentNode;if(f.onsubmit())f.submit();return false;">${v.thumb({ kind: 'place', w: 120, h: 70, key: `template-${k}-v4`, alt: label, data: { script: 'personal', theme: k, name: label } })}</a></form><span>${label}</span></td>`;
  const body = `
<div id="ConfigurePlaceContainer">
  <h2>Configure Place</h2>
  <form method="post" id="ConfigurePlaceForm">
    <div id="PlaceName"><span class="Label">Name:</span><br/><input type="text" name="name" class="TextBox" maxlength="50" value="${h(pl.name)}"/></div>
    <div id="PlaceThumbnail"><a title="${h(pl.name)}">${v.placeThumb(pl, 420, 230)}</a></div>
    <div id="PlaceDescription"><span class="Label">Description:</span><br/><textarea name="desc" class="MultilineTextBox" rows="2" cols="20">${h(pl.desc)}</textarea></div>
    <div id="PlaceAccess"><fieldset title="Access"><legend>Access</legend><div class="Suggestion">This determines who can access your place.</div>
      <div class="PlaceAccessRow"><img src="/images/public.png" alt="Public" border="0"/><input type="radio" id="ap" name="access" value="public"${pl.public ? ' checked="checked"' : ''}/><label for="ap">Public: Anybody can visit my place</label><br/><img src="/images/locked.png" alt="Friends-only" border="0"/><input type="radio" id="af" name="access" value="friends"${!pl.public ? ' checked="checked"' : ''}/><label for="af">Friends: Only my friends can visit my place</label></div></fieldset></div>
    <div id="PlaceCopyProtection"><fieldset title="Copy Protection"><legend>Copy Protection</legend><div class="Suggestion">Checking this will prevent your place from being copied but will also make it available to others only in online mode.</div>
      <div class="CopyProtectionRow"><input type="checkbox" id="cl" name="copylock" value="1"${pl.copylocked ? ' checked="checked"' : ''}/><label for="cl">Copy-Lock my place</label></div></fieldset></div>
  </form>
  <div id="PlaceReset">
    <div class="popupControl" id="ResetPlacePopup" style="width:400px;">
      <div>
        <div align="right"><a class="PopUpOption" href="#" onclick="document.getElementById('ResetPlacePopup').style.visibility='hidden';return false;">[ close window ]</a></div>
        <div class="PopUpInstruction">To reset your place, click an image below:</div>
        <table cellspacing="0" cellpadding="10" align="Center" border="0">
          <tr>${tcell(templates[0])}${tcell(templates[1])}</tr>
          <tr>${tcell(templates[2])}<td></td></tr>
        </table>
      </div>
    </div>
    <fieldset title="Reset Place"><legend>Reset Place</legend><div class="Suggestion">Only do this if you want to reset your place to one of our starting templates. This will cause you to lose any changes you have made and cannot be un-done.</div>
      <div class="ResetPlaceRow"><div class="Button" style="width:80px;" onclick="document.getElementById('ResetPlacePopup').style.visibility='visible';">Reset Place</div></div>
    </fieldset>
  </div>
  <div class="Buttons">
    <a class="Button" href="#" onclick="document.getElementById('ConfigurePlaceForm').submit();return false;">Update</a>&nbsp;<a class="Button" href="/User.aspx">Cancel</a>
  </div>
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
