#!/usr/bin/env node
/* Random-walk playtester.
 *   node tools/playtest.mjs [runs=300] [--seed=1] [--verbose]
 * Plays the compiled story many times with random choices and reports:
 * runtime errors, runs that never reach the end, missing assets/speakers/
 * clues/tapes referenced by @commands, knots never visited, and word counts
 * per run (with an estimated play time). */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ink = require(path.join(root, 'node_modules/inkjs/dist/ink.js'));
const args = process.argv.slice(2);
const runs = parseInt(args.find((a) => /^\d+$/.test(a)) || '300', 10);
const verbose = args.includes('--verbose');
let seed = parseInt((args.find((a) => a.startsWith('--seed=')) || '--seed=1').split('=')[1], 10);
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// load browser-side data in a sandbox
const win = { console, document: { querySelector: () => null } };
win.window = win;
const ctx = vm.createContext(win);
const load = (f) => { try { vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }); } catch (e) { console.log('load fail', f, e.message); } };
load('js/story.js');
load('js/art/kit.js');
load('js/art/portraits.js');
for (const f of fs.readdirSync(path.join(root, 'js/art')).filter((f) => f.endsWith('.js') && f !== 'kit.js' && f !== 'portraits.js')) load('js/art/' + f);
load('js/data.js');
const { STORY_JSON, ART, DATA, PORTRAIT } = win;
const audioSrc = fs.existsSync(path.join(root, 'js/audio.js')) ? fs.readFileSync(path.join(root, 'js/audio.js'), 'utf8') : '';
const MUSIC = 'title larch school town barrens mystery tension horror quiet festival warm june sad end'.split(' ');
const AMB = 'rain rain_car night wind house school cafeteria classroom hum boiler diner records library creek hill canal festival quiet town attic static'.split(' ');
const SFX = 'click select hover page notify clue door_open door_close door_knock window_knock footsteps car_door bell locker phone_ring phone_pickup phone_hangup tape_play tape_stop tape_rewind tape_insert record_start static_burst radio_tune thunder heartbeat whisper breath light_switch lantern lights_out bike_bell paper typewriter wind_gust splash match sting'.split(' ');
const EXPRS = Object.keys((PORTRAIT && PORTRAIT.EXPR) || {});
const TONES = 'friendly joke sarcastic shy blunt confront manipulate kind ask probe deflect honest lie flirt silent leave action look go record'.split(' ');
const FX = 'shake flash glitch pulse blackout clear redout greenout heartbeat heartbeat_off lights_out'.split(' ');
const SPECIAL = ['GUS', 'THINK', 'TAPE', 'PHONE', 'RADIO', 'VOICE'];

const missing = new Map();
const miss = (k) => missing.set(k, (missing.get(k) || 0) + 1);
function checkCmd(line) {
  const [name, ...a] = line.slice(1).trim().split(/\s+/);
  switch (name) {
    case 'bg': {
      const d = ART.bgs[a[0]];
      if (!d) miss(`bg:${a[0]}`);
      else if (a[1] && a[1] !== '-' && d.times && !d.times.includes(a[1])) miss(`bg-time:${a[0]}:${a[1]}`);
      break;
    }
    case 'cg': if (a[0] !== 'off' && !ART.cgs[a[0]] && !ART.bgs[a[0]]) miss(`cg:${a[0]}`); break;
    case 'show': if (!ART.chars[a[0]]) miss(`char:${a[0]}`); if (a[1] && !EXPRS.includes(a[1])) miss(`expr:${a[1]}`); break;
    case 'expr': if (a[1] && !EXPRS.includes(a[1])) miss(`expr:${a[1]}`); break;
    case 'music': if (a[0] !== 'stop' && !MUSIC.includes(a[0])) miss(`music:${a[0]}`); break;
    case 'amb': if (a[0] !== 'stop' && !AMB.includes(a[0])) miss(`amb:${a[0]}`); break;
    case 'sfx': if (!SFX.includes(a[0])) miss(`sfx:${a[0]}`); break;
    case 'fx': if (!FX.includes(a[0])) miss(`fx:${a[0]}`); break;
    case 'clue': if (!DATA.clues[a[0]]) miss(`clue-data:${a[0]}`); break;
    case 'tape': if (!DATA.tapes[a[0]]) miss(`tape-data:${a[0]}`); break;
    case 'theory': if (!DATA.theories[a[0]]) miss(`theory-data:${a[0]}`); break;
    case 'remember': case 'note': if (!DATA.people[a[0]]) miss(`person:${a[0]}`); break;
    case 'weather': case 'chapter': case 'card': case 'date': case 'wait': case 'ctx': case 'map': case 'save': case 'end': case 'hide': case 'clear': case 'decide': case 'met': break;
    default: miss(`command:${name}`);
  }
}
const SPK = /^([A-Z][A-Z0-9_]*)(?:\(([a-z0-9_]+)\))?:\s+/;
function checkLine(line) {
  const m = line.match(SPK);
  if (!m) return;
  const key = m[1];
  if (!SPECIAL.includes(key) && !DATA.chars[key]) miss(`speaker:${key}`);
  if (m[2] && !['TAPE', 'PHONE', 'RADIO', 'VOICE'].includes(key) && !EXPRS.includes(m[2])) miss(`expr:${m[2]} (${key})`);
  if (m[2] && ['TAPE', 'PHONE', 'VOICE'].includes(key) && !DATA.chars[m[2].toUpperCase()]) miss(`voice-name:${m[2]}`);
}

const story0 = new ink.Story(STORY_JSON);
const knots = Object.keys(JSON.parse(STORY_JSON.constructor === String ? STORY_JSON : JSON.stringify(STORY_JSON)).root[2] || {}).filter((k) => !['global decl', '#f'].includes(k));
const visited = new Set();
const results = [];
const errors = new Map();
const endings = new Map();
for (let r = 0; r < runs; r++) {
  const S = new ink.Story(STORY_JSON);
  let words = 0, choices = 0, steps = 0, ended = false;
  S.onError = (msg) => errors.set(msg, (errors.get(msg) || 0) + 1);
  try {
    while (steps++ < 20000) {
      if (S.canContinue) {
        const line = S.Continue().trim();
        const p = S.state.currentPathString; if (p) visited.add(p.split('.')[0]);
        if (!line) continue;
        if (line[0] === '@') { checkCmd(line); if (line.startsWith('@end')) ended = true; continue; }
        checkLine(line);
        words += line.replace(SPK, '').split(/\s+/).filter(Boolean).length;
      } else if (S.currentChoices.length) {
        const cs = S.currentChoices;
        for (const c of cs) { words += 0; for (const t of c.tags || []) { const tt = t.trim(); if (!TONES.includes(tt) && !/^(timed:|map:|expr:)/.test(tt) && !['default', 'nofree', 'clue'].includes(tt)) miss(`tag:${tt}`); } }
        const c = cs[Math.floor(rand() * cs.length)];
        words += c.text.split(/\s+/).length;
        choices++;
        S.ChooseChoiceIndex(c.index);
        const p = S.state.currentPathString; if (p) visited.add(p.split('.')[0]);
      } else break;
    }
  } catch (e) { errors.set(String(e.message || e), (errors.get(String(e.message || e)) || 0) + 1); }
  const out = S.variablesState ? String(S.variablesState.outcome || '') : '';
  endings.set(out || (ended ? 'end' : 'stopped'), (endings.get(out || (ended ? 'end' : 'stopped')) || 0) + 1);
  results.push({ words, choices, ended });
}
const ws = results.map((r) => r.words).sort((a, b) => a - b);
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const cs = results.map((r) => r.choices);
const mins = (w, c) => (w / 170 + c * 0.12);
console.log(`runs: ${runs}  reached @end: ${results.filter((r) => r.ended).length}`);
console.log(`words per run: min ${ws[0]}  median ${ws[Math.floor(ws.length / 2)]}  max ${ws[ws.length - 1]}  avg ${avg(ws).toFixed(0)}`);
console.log(`choices per run: avg ${avg(cs).toFixed(0)}  est. play time ≈ ${mins(avg(ws), avg(cs)).toFixed(0)} min (median run)`);
console.log('outcomes:', Object.fromEntries(endings));
if (errors.size) { console.log('\nRUNTIME ERRORS:'); for (const [k, v] of errors) console.log(`  ${v}× ${k}`); }
if (missing.size) { console.log('\nMISSING REFERENCES:'); for (const [k, v] of [...missing].sort()) console.log(`  ${k}  (${v}×)`); }
const FUNCS = ['clue', 'tape', 'remember', 'jot', 'decide', 'up', 'trait_top'];
const unvisited = knots.filter((k) => !visited.has(k) && !FUNCS.includes(k));
if (unvisited.length) console.log('\nknots never visited:', unvisited.join(', '));
