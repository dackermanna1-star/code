// The fictional members answer messages and friend requests a little later,
// so the social pages behave like a living 2008 site.
'use strict';
const clock = require('./clock');
const db = require('./db');

const REPLIES = ['ok', 'lol', 'sure! add me', 'hi :)', 'cool', 'wanna play teapots?', 'meet me in ultimate paintball', 'i cant right now im building', 'k', 'thanks!', 'whats up', 'brb'];

function scheduleReply(bot, user, subject, text) {
  setTimeout(() => {
    const state = db.get();
    const id = db.nextId('message');
    const subj = subject.startsWith('RE: ') ? subject : 'RE: ' + subject;
    let body = REPLIES[Math.floor(Math.random() * REPLIES.length)];
    if (/friend/i.test(text)) body = 'sure, send me a friend request';
    if (/tix|robux/i.test(text)) body = 'no i dont give tix sorry';
    state.messages[id] = { id, fromId: bot.id, toId: user.id, subject: subj, body, t: clock.now(), read: false };
    db.save();
  }, 15000 + Math.random() * 45000);
}

function scheduleFriendAccept(bot, user, requestId) {
  setTimeout(() => {
    const state = db.get();
    const r = state.friendRequests[requestId];
    if (!r || r.handled) return;
    r.handled = true;
    if (!bot.friends.includes(user.id)) { bot.friends.push(user.id); user.friends.push(bot.id); }
    if (user.friends.length >= 20 && !user.badges.includes('Friendship')) user.badges.push('Friendship');
    const id = db.nextId('message');
    state.messages[id] = { id, fromId: bot.id, toId: user.id, subject: 'Friend Request Accepted', body: `${bot.name} accepted your friend request.`, t: clock.now(), read: false };
    db.save();
  }, 10000 + Math.random() * 30000);
}

module.exports = { scheduleReply, scheduleFriendAccept };
