// Request routing: ASP.NET-style, case-insensitive ".aspx" / ".ashx" paths.
'use strict';
const crypto = require('crypto');
const db = require('./db');
const { parseCookies, parseForm } = require('./util');

const routes = new Map();
function register(table) {
  for (const [p, fn] of Object.entries(table)) routes.set(p.toLowerCase(), fn);
}

// Page modules
for (const mod of ['home', 'auth', 'games', 'catalog', 'user', 'my', 'social', 'forum', 'misc', 'api']) {
  register(require('./pages/' + mod).routes);
}

const SESSION_COOKIE = '.ROBLOSECURITY';

async function router(req, res, url, body) {
  const pathLower = url.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  const query = {};
  for (const [k, v] of url.searchParams) { query[k] = v; query[k.toLowerCase()] = v; }
  const cookies = parseCookies(req.headers.cookie || '');
  const state = db.get();
  const token = cookies[SESSION_COOKIE];
  let user = null;
  if (token && state.sessions[token]) user = db.userById(state.sessions[token]);

  let form = {};
  let json = null;
  if (req.method === 'POST') {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('application/json')) { try { json = JSON.parse(body || '{}'); } catch { json = {}; } }
    else form = parseForm(body);
  }

  const ctx = {
    req, res, url, query, form, json, cookies, user, method: req.method, path: pathLower,
    db, state,
    send(html, status = 200, headers = {}) {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...this._headers, ...headers });
      res.end(html);
    },
    json(obj, status = 200) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...this._headers });
      res.end(JSON.stringify(obj));
    },
    redirect(location) {
      res.writeHead(302, { Location: location, ...this._headers });
      res.end();
    },
    _headers: {},
    setCookie(name, value, maxAgeSeconds) {
      const c = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax` + (maxAgeSeconds != null ? `; Max-Age=${maxAgeSeconds}` : '');
      const prev = this._headers['Set-Cookie'];
      this._headers['Set-Cookie'] = prev ? [].concat(prev, c) : c;
    },
    login(u, remember) {
      const t = crypto.randomBytes(24).toString('hex');
      state.sessions[t] = u.id;
      this.setCookie(SESSION_COOKIE, t, remember ? 60 * 60 * 24 * 30 : null);
      this.user = u;
      db.save();
    },
    logout() {
      if (token) delete state.sessions[token];
      this.setCookie(SESSION_COOKIE, '', 0);
      this.user = null;
      db.save();
    },
    requireLogin() {
      if (this.user) return true;
      this.redirect('/Login/Default.aspx?ReturnUrl=' + encodeURIComponent(url.pathname + url.search));
      return false;
    },
  };

  if (user) {
    const now = Date.now();
    user.lastOnline = now;
    user.lastLocation = user.playingPlace ? user.lastLocation : 'Website';
    // Daily Tickets (and Builders Club ROBUX) allowance.
    const { dailyAllowance } = require('./economy');
    if (dailyAllowance(user)) db.save();
  }

  let handler = routes.get(pathLower);
  if (!handler && pathLower === '/') handler = routes.get('/default.aspx');
  if (!handler) {
    const notFound = routes.get('/__404');
    return notFound(ctx);
  }
  return handler(ctx);
}

module.exports = { router, SESSION_COOKIE };
