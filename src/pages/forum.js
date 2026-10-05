// ROBLOX Forum (ASP.NET Forums "default" skin, as used in 2007-2008).
'use strict';
const db = require('../db');
const v = require('../views');
const { page } = require('../layout');
const { h, commas, clampInt } = require('../util');

function fdate(t) {
  const d = new Date(t);
  const now = new Date();
  let hr = d.getHours(); const ampm = hr >= 12 ? 'PM' : 'AM'; hr = hr % 12 || 12;
  const time = `${String(hr).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
  if (d.toDateString() === now.toDateString()) return `<b>Today @ ${time}</b>`;
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${String(d.getDate()).padStart(2, '0')} ${mon} ${d.getFullYear()}<br/>${time}`;
}

function forumPage(ctx, title, inner) {
  const F = ctx.state.forum;
  const online = db.users().filter((u) => v.isOnline(u));
  const left = `
    <table class="tableBorder" width="100%" cellspacing="1" cellpadding="3">
      <tr><th class="tableHeaderText" colspan="2" align="left">&nbsp;Search Roblox Forums</th></tr>
      <tr><td class="forumRow" colspan="2" valign="top" align="left">
        <form method="get" action="/Forum/Search/default.aspx"><input name="q" maxlength="50" size="10" type="text"/> <input value="Search" type="submit"/></form>
        <span class="normalTextSmall"><br/><a href="/Forum/Search/default.aspx">More search options</a></span>
      </td></tr>
    </table><br/><br/>
    <table class="tableBorder" width="100%" cellspacing="1" cellpadding="3">
      <tr><th class="tableHeaderText" colspan="2" align="left">&nbsp;Who is Online</th></tr>
      <tr><td class="forumRow" valign="top"><span class="normalTextSmaller">There are currently: <br/><b>${30 + (Math.floor(Date.now() / 60000) % 40)}</b> anonymous users online.<br/><br/><b>${online.length}</b> registered users online: ${online.slice(0, 20).map((u) => `<a class="userOnlineLinkBold" href="/User.aspx?ID=${u.id}">${h(u.name)}</a>`).join(', ')}</span></td></tr>
    </table>`;
  const menu = `<div class="ForumMenu"><a class="menuTextLink" href="/Forum/Default.aspx"><img src="/images/forum/icon_mini_home.gif" border="0" alt=""/>Home</a> &nbsp;<a class="menuTextLink" href="/Forum/Search/default.aspx"><img src="/images/forum/icon_mini_search.gif" border="0" alt=""/>Search</a> &nbsp;${ctx.user ? `<a class="menuTextLink" href="/User.aspx"><img src="/images/forum/icon_mini_profile.gif" border="0" alt=""/>Profile</a> &nbsp;<a class="menuTextLink" href="/Forum/Default.aspx"><img src="/images/forum/icon_mini_myforums.gif" border="0" alt=""/>MyForums</a>` : `<a class="menuTextLink" href="/Login/New.aspx"><img src="/images/forum/icon_mini_register.gif" border="0" alt=""/>Register</a>`}</div>`;
  void F;
  const body = `
<div id="ForumContainer">
  <table width="100%" cellspacing="0" cellpadding="0" border="0"><tr valign="top">
    <td class="LeftColumn">&nbsp;&nbsp;&nbsp;</td>
    <td class="LeftColumn" width="180" nowrap="nowrap">${left}</td>
    <td class="CenterColumn">&nbsp;&nbsp;&nbsp;</td>
    <td class="CenterColumn" width="95%">${menu}${inner}</td>
    <td class="RightColumn">&nbsp;&nbsp;&nbsp;</td>
  </tr></table>
</div>`;
  return ctx.send(page(ctx, { title: title || 'ROBLOX Forum', body, head: '<link rel="stylesheet" type="text/css" href="/css/forum.css"/>' }));
}

function lastPost(F, fid) {
  let best = null;
  for (const t of Object.values(F.threads)) {
    if (t.forumId !== fid) continue;
    const p = F.posts[t.posts[t.posts.length - 1]];
    if (p && (!best || p.t > best.t)) best = p;
  }
  return best;
}

function defaultPage(ctx) {
  const F = ctx.state.forum;
  const now = new Date();
  const rows = F.groups.map((g) => `
    <tr><td class="forumHeaderBackgroundAlternate" colspan="5" height="20"><a class="forumTitle" href="/Forum/Default.aspx">${h(g.name)}</a></td></tr>
    ${g.forums.map((fid) => {
    const f = F.forums[fid];
    const threads = Object.values(F.threads).filter((t) => t.forumId === fid);
    const posts = threads.reduce((a, t) => a + t.posts.length, 0);
    const lp = lastPost(F, fid);
    const lpu = lp && db.userById(lp.userId);
    return `<tr>
      <td class="forumRow" align="center" valign="top" width="34"><img src="/images/forum/forum_status.gif" alt="" width="34" height="34"/></td>
      <td class="forumRow" width="80%"><a class="forumTitle" href="/Forum/ShowForum.aspx?ForumID=${fid}">${h(f.name)}</a><br/><span class="normalTextSmall">${h(f.desc)}</span></td>
      <td class="forumAlternate" align="center"><span class="normalTextSmaller">${commas(threads.length + fid * 37)}</span></td>
      <td class="forumAlternate" align="center"><span class="normalTextSmaller">${commas(posts + fid * 211)}</span></td>
      <td class="forumRowHighlight" align="center" nowrap="nowrap"><span class="normalTextSmaller">${lp ? `${fdate(lp.t)}<br/>by <a href="/User.aspx?ID=${lpu.id}">${h(lpu.name)}</a> <a href="/Forum/ShowPost.aspx?PostID=${lp.threadId}#${lp.id}"><img src="/images/forum/icon_mini_topic.gif" border="0" alt=""/></a>` : '&nbsp;'}</span></td>
    </tr>`;
  }).join('')}`).join('');
  const inner = `
    <span class="normalTextSmallBold">Current time: </span><span class="normalTextSmall">${now.toLocaleString('en-US', { month: 'short' })} ${now.getDate()}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
    <table class="tableBorder" cellpadding="3" cellspacing="1" width="100%">
      <tr><th class="tableHeaderText" colspan="2" height="25">Forum</th><th class="tableHeaderText" width="50" nowrap="nowrap">Threads</th><th class="tableHeaderText" width="50" nowrap="nowrap">Posts</th><th class="tableHeaderText" width="135" nowrap="nowrap">Last Post</th></tr>
      ${rows}
    </table>`;
  return forumPage(ctx, 'ROBLOX Forum', inner);
}

function showForum(ctx) {
  const F = ctx.state.forum;
  const fid = Number(ctx.query.ForumID || ctx.query.forumid);
  const f = F.forums[fid];
  if (!f) return ctx.redirect('/Forum/Default.aspx');
  const threads = Object.values(F.threads).filter((t) => t.forumId === fid).sort((a, b) => F.posts[b.posts[b.posts.length - 1]].t - F.posts[a.posts[a.posts.length - 1]].t);
  const inner = `
    <div class="ForumBreadcrumb"><a class="linkMenuSink" href="/Forum/Default.aspx">ROBLOX Forum</a> &raquo; <a class="linkMenuSink" href="/Forum/Default.aspx">${h(f.group)}</a> &raquo; <span class="forumName">${h(f.name)}</span></div>
    <div style="margin:6px 0">${ctx.user ? `<a href="/Forum/AddPost.aspx?ForumID=${fid}"><img src="/images/forum/newtopic.gif" border="0" alt="New Thread"/></a>` : ''}</div>
    <table class="tableBorder" cellpadding="3" cellspacing="1" width="100%">
      <tr><th class="tableHeaderText" align="left" colspan="2">&nbsp;Thread&nbsp;</th><th class="tableHeaderText" nowrap="nowrap">&nbsp;Started By&nbsp;</th><th class="tableHeaderText">&nbsp;Replies&nbsp;</th><th class="tableHeaderText">&nbsp;Views&nbsp;</th><th class="tableHeaderText" nowrap="nowrap">&nbsp;Last Post&nbsp;</th></tr>
      ${threads.map((t) => { const first = F.posts[t.posts[0]]; const last = F.posts[t.posts[t.posts.length - 1]]; const a = db.userById(first.userId); const lu = db.userById(last.userId); return `<tr>
        <td class="forumRow" width="25" align="center"><img src="/images/forum/topic.gif" alt="" border="0"/></td>
        <td class="forumRow" width="70%"><a class="linkSmallBold" href="/Forum/ShowPost.aspx?PostID=${t.id}">${h(t.subject)}</a></td>
        <td class="forumAlternate" align="center"><a class="linkSmall" href="/User.aspx?ID=${a.id}">${h(a.name)}</a></td>
        <td class="forumAlternate" align="center"><span class="normalTextSmaller">${t.posts.length - 1}</span></td>
        <td class="forumAlternate" align="center"><span class="normalTextSmaller">${commas(t.views)}</span></td>
        <td class="forumRowHighlight" align="center" nowrap="nowrap"><span class="normalTextSmaller">${fdate(last.t)}<br/>by <a href="/User.aspx?ID=${lu.id}">${h(lu.name)}</a></span></td></tr>`; }).join('')}
      ${!threads.length ? '<tr><td class="forumRow" colspan="6" align="center">There are no threads in this forum yet.</td></tr>' : ''}
    </table>
    <div class="normalTextSmall" style="text-align:right;margin-top:4px">Page 1 of 1</div>`;
  return forumPage(ctx, 'ROBLOX Forum', inner);
}

function showPost(ctx) {
  const F = ctx.state.forum;
  const t = F.threads[ctx.query.PostID || ctx.query.postid];
  if (!t) return ctx.redirect('/Forum/Default.aspx');
  t.views++;
  db.save();
  const f = F.forums[t.forumId];
  const inner = `
    <div class="ForumBreadcrumb"><a class="linkMenuSink" href="/Forum/Default.aspx">ROBLOX Forum</a> &raquo; <a class="linkMenuSink" href="/Forum/Default.aspx">${h(f.group)}</a> &raquo; <a class="linkMenuSink" href="/Forum/ShowForum.aspx?ForumID=${f.id}">${h(f.name)}</a> &raquo; <span class="forumName">${h(t.subject)}</span></div>
    <div class="normalTextSmaller" style="margin:6px 0">Previous Thread :: Next Thread &nbsp; ${ctx.user ? `<a href="/Forum/AddPost.aspx?PostID=${t.id}"><img src="/images/forum/newpost.gif" border="0" alt="Reply"/></a>` : ''}</div>
    <table class="tableBorder" cellpadding="3" cellspacing="1" width="100%">
      <tr><th class="tableHeaderText" align="left" colspan="2">&nbsp;${h(t.subject)}</th></tr>
      ${t.posts.map((pid, i) => { const p = F.posts[pid]; const u = db.userById(p.userId); return `<tr>
        <td class="forumRow" valign="top" width="150" nowrap="nowrap"><a name="${p.id}"></a>
          <span class="normalTextSmallBold"><a href="/User.aspx?ID=${u.id}">${h(u.name)}</a></span>
          <img src="/images/forum/${v.isOnline(u) ? 'user_IsOnline' : 'user_IsOffline'}.gif" alt="" border="0"/>${u.admin ? ' <img src="/images/forum/users_moderator.gif" alt="Forum Moderator" border="0"/>' : ''}<br/>
          ${v.avatarThumb(u, 100, 100)}<br/>
          <span class="normalTextSmaller"><b>Joined:</b> ${new Date(u.created).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}<br/><b>Total Posts:</b> ${commas(u.forumPosts)}</span>
        </td>
        <td class="${i % 2 ? 'forumAlternate' : 'forumRow'}" valign="top">
          <span class="normalTextSmaller">${new Date(p.t).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span><hr size="1"/>
          <span class="normalTextSmall">${h(p.body).replace(/\n/g, '<br/>')}</span>
          <div class="PostFooter">${ctx.user ? `<a href="/Forum/AddPost.aspx?PostID=${t.id}"><img src="/images/forum/newpost.gif" border="0" alt="Reply"/></a> ` : ''}<a class="linkSmall" href="/AbuseReport/ForumPost.aspx?PostID=${p.id}">Report Abuse</a></div>
        </td></tr>
        <tr><td class="flatViewSpacing" colspan="2"></td></tr>`; }).join('')}
    </table>`;
  return forumPage(ctx, 'ROBLOX Forum', inner);
}

function addPost(ctx) {
  if (!ctx.requireLogin()) return;
  const F = ctx.state.forum;
  const t = F.threads[ctx.query.PostID || ctx.query.postid];
  const fid = t ? t.forumId : Number(ctx.query.ForumID || ctx.query.forumid);
  const f = F.forums[fid];
  if (!f) return ctx.redirect('/Forum/Default.aspx');
  let err = '';
  if (ctx.method === 'POST') {
    const body = String(ctx.form.body || '').trim().slice(0, 4000);
    const subject = String(ctx.form.subject || '').trim().slice(0, 80);
    if (!body || (!t && !subject)) err = 'Please enter a subject and a message.';
    else {
      const pid = db.nextId('forumPost');
      const thread = t || (F.threads[pid] = { id: pid, forumId: fid, subject, posts: [], views: 0, t: Date.now() });
      F.posts[pid] = { id: pid, userId: ctx.user.id, body, t: Date.now(), threadId: thread.id };
      thread.posts.push(pid);
      ctx.user.forumPosts = (ctx.user.forumPosts || 0) + 1;
      db.save();
      return ctx.redirect(`/Forum/ShowPost.aspx?PostID=${thread.id}#${pid}`);
    }
  }
  const inner = `
    <div class="ForumBreadcrumb"><a class="linkMenuSink" href="/Forum/Default.aspx">ROBLOX Forum</a> &raquo; <a class="linkMenuSink" href="/Forum/ShowForum.aspx?ForumID=${f.id}">${h(f.name)}</a></div>
    <form method="post">
    <table class="tableBorder" cellpadding="3" cellspacing="1" width="100%">
      <tr><th class="tableHeaderText" align="left" colspan="2">&nbsp;${t ? 'Reply to: ' + h(t.subject) : 'Post a New Message'}</th></tr>
      ${err ? `<tr><td class="forumRow" colspan="2"><span class="validationWarningSmall">${h(err)}</span></td></tr>` : ''}
      <tr><td class="forumRow" width="120" align="right"><span class="normalTextSmallBold">Subject:</span></td><td class="forumRow"><input type="text" name="subject" size="60" maxlength="80" value="${t ? h('RE: ' + t.subject) : ''}"${t ? ' disabled' : ''}/></td></tr>
      <tr><td class="forumRow" valign="top" align="right"><span class="normalTextSmallBold">Message:</span></td><td class="forumRow"><textarea name="body" rows="14" cols="70"></textarea></td></tr>
      <tr><td class="forumRow" colspan="2" align="right"><input type="submit" value=" Post "/> <a href="${t ? `/Forum/ShowPost.aspx?PostID=${t.id}` : `/Forum/ShowForum.aspx?ForumID=${f.id}`}">Cancel</a></td></tr>
    </table></form>`;
  return forumPage(ctx, 'ROBLOX Forum', inner);
}

function search(ctx) {
  const F = ctx.state.forum;
  const q = String(ctx.query.q || '').trim().toLowerCase();
  const results = q ? Object.values(F.posts).filter((p) => p.body.toLowerCase().includes(q) || F.threads[p.threadId]?.subject.toLowerCase().includes(q)).slice(0, 50) : [];
  const inner = `
    <form method="get"><table class="tableBorder" cellpadding="3" cellspacing="1" width="100%">
      <tr><th class="tableHeaderText" align="left" colspan="2">&nbsp;Search Roblox Forums</th></tr>
      <tr><td class="forumRow" align="right" width="150"><span class="normalTextSmallBold">Search for:</span></td><td class="forumRow"><input type="text" name="q" value="${h(ctx.query.q || '')}" size="40"/> <select name="mode"><option>Match All Words</option><option>Match Any Words</option><option>Match Exact Phrase</option></select></td></tr>
      <tr><td class="forumRow" align="right"><span class="normalTextSmallBold">Search in:</span></td><td class="forumRow"><select name="forum"><option>All Forums</option>${Object.values(F.forums).map((f) => `<option>${h(f.name)}</option>`).join('')}</select> <select name="pp"><option>10 Results/Page</option><option>25 Results/Page</option><option>50 Results/Page</option></select></td></tr>
      <tr><td class="forumRow" colspan="2" align="right"><input type="submit" value="Search"/></td></tr>
    </table></form><br/>
    ${q ? `<table class="tableBorder" cellpadding="3" cellspacing="1" width="100%"><tr><th class="tableHeaderText" align="left">&nbsp;Results (${results.length})</th></tr>
      ${results.map((p, i) => `<tr><td class="${i % 2 ? 'searchAlternatingItem' : 'searchItem'}"><a class="linkSmallBold" href="/Forum/ShowPost.aspx?PostID=${p.threadId}#${p.id}">${h(F.threads[p.threadId].subject)}</a><br/><span class="normalTextSmaller">${h(p.body.slice(0, 160))}</span></td></tr>`).join('') || '<tr><td class="searchItem">No posts matched your search.</td></tr>'}</table>` : ''}`;
  return forumPage(ctx, 'ROBLOX Forum', inner);
}

module.exports = {
  routes: {
    '/forum/default.aspx': defaultPage,
    '/forum/showforum.aspx': showForum,
    '/forum/showpost.aspx': showPost,
    '/forum/addpost.aspx': addPost,
    '/forum/search/default.aspx': search,
  },
};
