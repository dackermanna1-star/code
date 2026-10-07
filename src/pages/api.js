// Endpoints used by page scripts and the game client (thumbnails, joining a
// game, visit counting, leaderboard stats, saving a personal place).
'use strict';
const clock = require('../clock');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const v = require('../views');
const economy = require('../economy');
const { h } = require('../util');
const { PLAYABLE } = require('./games');

const THUMB_RE = /^(avatar|asset|place)-[A-Za-z0-9-]+-\d{2,3}x\d{2,3}\.png$/;

function uploadThumb(ctx) {
  const j = ctx.body || {};
  if (!THUMB_RE.test(j.file || '') || typeof j.data !== 'string' || !j.data.startsWith('data:image/png;base64,')) return ctx.json({ ok: false }, 400);
  const buf = Buffer.from(j.data.slice(22), 'base64');
  if (buf.length > 1.5 * 1024 * 1024 || buf.readUInt32BE(0) !== 0x89504e47) return ctx.json({ ok: false }, 400);
  fs.writeFileSync(path.join(db.THUMB_DIR, j.file), buf);
  return ctx.json({ ok: true });
}

/** How many simulated players join each kind of place. */
const BOT_COUNT = { teapots: 6, paintball: 9, obby: 5, mummy: 7, crossroads: 7, personal: 0, warzone: 11, heist: 0, disasters: 9, megaobby: 8, hotel: 0, elevator: 8 };

function joinInfo(ctx) {
  const pl = db.placeById(Number(ctx.query.placeId || ctx.query.placeid));
  if (!pl) return ctx.json({ error: 'The game you requested has ended' }, 404);
  if (!PLAYABLE.has(pl.script)) return ctx.json({ error: 'There are no game servers available at this time. Please try again later' }, 503);
  const mode = ctx.query.mode || 'online';
  const user = ctx.user;
  const creator = db.userById(pl.creatorId);
  const player = user
    ? { id: user.id, name: user.name, appearance: v.appearanceOf(user), guest: false }
    : { id: 0, name: 'Guest ' + (1000 + Math.floor(Math.random() * 9000)), appearance: { colors: { head: 24, torso: 194, leftArm: 24, rightArm: 24, leftLeg: 194, rightLeg: 194 }, face: 'Smile', hats: [], shirt: null, pants: null, tshirt: null }, guest: true };
  let bots = [];
  const isOwnPlace = user && pl.creatorId === user.id;
  if (mode === 'online' && !(pl.script === 'personal' && isOwnPlace)) {
    const pool = db.users().filter((u) => u.isBot && u.id !== user?.id);
    const n = pl.script === 'personal' ? Math.min(2, pool.length) : (BOT_COUNT[pl.script] ?? 4);
    for (let i = 0; i < n && pool.length; i++) {
      const u = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      bots.push({ id: u.id, name: u.name, appearance: v.appearanceOf(u) });
    }
  }
  return ctx.json({
    place: { id: pl.id, name: pl.name, script: pl.script, theme: pl.theme, creator: creator?.name, creatorId: pl.creatorId, build: pl.build || null, maxPlayers: pl.maxPlayers },
    player, bots, mode,
    buildMode: !!(isOwnPlace && (mode === 'edit' || mode === 'solo' || pl.script === 'personal')),
  });
}

function visit(ctx) {
  const pl = db.placeById(Number(ctx.body?.placeId));
  if (!pl) return ctx.json({ ok: false });
  pl.visits++;
  if (ctx.user) {
    economy.placeTraffic(pl, ctx.user);
    ctx.user.playingPlaceName = pl.name;
    ctx.user.lastOnline = clock.now();
    const owner = db.userById(pl.creatorId);
    if (owner && pl.script === 'personal') {
      if (pl.visits >= 100 && !owner.badges.includes('Homestead')) owner.badges.push('Homestead');
      if (pl.visits >= 1000 && !owner.badges.includes('Bricksmith')) owner.badges.push('Bricksmith');
    }
  }
  db.save();
  return ctx.json({ ok: true });
}

function report(ctx) {
  const u = ctx.user;
  const j = ctx.body || {};
  if (!u) return ctx.json({ ok: false });
  const ko = Math.max(0, Math.min(500, Number(j.knockouts) || 0));
  const wo = Math.max(0, Math.min(500, Number(j.wipeouts) || 0));
  u.knockouts = (u.knockouts || 0) + ko;
  u.wipeouts = (u.wipeouts || 0) + wo;
  const award = [];
  const give = (b) => { if (!u.badges.includes(b)) { u.badges.push(b); award.push(b); } };
  if (u.knockouts >= 10) give('CombatInitiation');
  if (u.knockouts >= 100) give('Warrior');
  if (u.knockouts >= 250 && u.knockouts > u.wipeouts) give('Bloxxer');
  if (j.leaving) u.playingPlaceName = null;
  u.lastOnline = clock.now();
  db.save();
  return ctx.json({ ok: true, badges: award });
}

function savePlace(ctx) {
  const u = ctx.user;
  const j = ctx.body || {};
  const pl = db.placeById(Number(j.placeId));
  if (!u || !pl || pl.creatorId !== u.id) return ctx.json({ ok: false }, 403);
  if (!Array.isArray(j.build) || j.build.length > 5000) return ctx.json({ ok: false }, 400);
  pl.build = j.build.map((b) => ({
    s: (b.s || [4, 1.2, 2]).slice(0, 3).map(Number), p: (b.p || [0, 0, 0]).slice(0, 3).map(Number),
    q: (b.q || [0, 0, 0, 1]).slice(0, 4).map(Number), c: Number(b.c) || 194, sh: ['Block', 'Ball', 'Cylinder'].includes(b.sh) ? b.sh : 'Block',
    a: b.a !== false, t: Number(b.t) || 0, m: typeof b.m === 'string' ? b.m.slice(0, 20) : undefined,
  }));
  pl.updated = clock.now();
  pl.thumbVersion = (pl.thumbVersion || 0) + 1;
  db.save();
  return ctx.json({ ok: true });
}

function ownedModels(ctx) {
  const u = ctx.user;
  const list = u ? u.inventory.map((id) => db.itemById(id)).filter((i) => i && i.type === 'Model').map((i) => ({ id: i.id, name: i.name, model: i.model })) : [];
  return ctx.json({ models: list });
}

function playPage(ctx) {
  const pid = Number(ctx.query.placeId || ctx.query.placeid);
  const pl = db.placeById(pid);
  const mode = ['online', 'solo', 'edit'].includes(ctx.query.mode) ? ctx.query.mode : 'online';
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>ROBLOX${pl ? ' - ' + h(pl.name) : ''}</title>
<link rel="icon" href="/favicon.ico"/>
<link rel="stylesheet" href="/css/client.css"/>
<script type="importmap">{"imports":{"three":"/js/vendor/three.module.min.js"}}</script>
</head><body>
<div id="Viewport"><canvas id="GameCanvas" tabindex="0"></canvas></div>
<div id="Gui"></div>
<script>window.RBX_JOIN = ${JSON.stringify({ placeId: pid, mode })};</script>
<script type="module" src="/js/client.js"></script>
</body></html>`;
  return ctx.send(html);
}

module.exports = {
  routes: {
    '/thumbs/upload.ashx': uploadThumb,
    '/game/join.ashx': joinInfo,
    '/game/visit.ashx': visit,
    '/game/report.ashx': report,
    '/game/saveplace.ashx': savePlace,
    '/game/models.ashx': ownedModels,
    '/game/play.aspx': playPage,
  },
};
