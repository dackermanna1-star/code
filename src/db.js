// Tiny JSON-file database. Everything lives in memory and is written back to
// data/db.json shortly after each change.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.ROBLOX_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');
const THUMB_DIR = path.join(DATA_DIR, 'thumbs');

let state = null;
let timer = null;

function load() {
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    try {
      state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch (e) {
      console.error('db.json is corrupt, reseeding:', e.message);
      state = null;
    }
  }
  const { SEED_VERSION } = require('./seed');
  if (!state || state.seedVersion !== SEED_VERSION) {
    const { seed } = require('./seed');
    const old = state;
    state = seed();
    // keep accounts people created themselves across reseeds
    if (old && old.users) {
      for (const u of Object.values(old.users)) {
        if (!u.isSeed && !state.users[u.id]) state.users[u.id] = u;
      }
      state.nextId = Math.max(state.nextId, old.nextId || 0);
    }
    save(true);
  }
  return state;
}

function save(now = false) {
  if (now) return flush();
  if (timer) return;
  timer = setTimeout(flush, 400);
}

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!state) return;
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, FILE);
}

function get() { return state; }

function nextId(kind) {
  state.ids = state.ids || {};
  state.ids[kind] = (state.ids[kind] || 1000) + 1;
  return state.ids[kind];
}

function hashPassword(password, salt = crypto.randomBytes(8).toString('hex')) {
  const hash = crypto.createHash('sha256').update(salt + ':' + password).digest('hex');
  return `${salt}$${hash}`;
}

function checkPassword(password, stored) {
  if (!stored) return false;
  const [salt] = stored.split('$');
  return hashPassword(password, salt) === stored;
}

// --- helpers ---------------------------------------------------------------
const users = () => Object.values(state.users);
function userById(id) { return state.users[id] || null; }
function userByName(name) {
  const n = String(name || '').toLowerCase();
  return users().find((u) => u.name.toLowerCase() === n) || null;
}
function placeById(id) { return state.places[id] || null; }
function itemById(id) { return state.items[id] || null; }

module.exports = {
  load, save, flush, get, nextId, hashPassword, checkPassword,
  userById, userByName, placeById, itemById, users,
  THUMB_DIR, DATA_DIR,
};
