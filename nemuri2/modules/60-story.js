/* =============================================================================
   nemuri II — STORY (module 60): the other sleeper.
   Someone slept in your room before you. They painted the blue wall. They went
   under one winter and did not come back up, and they left letters in the
   dreams — memory shards — for whoever came next. Seven letters make one light;
   seven lights wake the sleeper in the Threshold, a round hall over still water
   that is reached through a door in your hallway that wasn't there before.
   When all seven are lit there is one more dream: the lucid hour.

   API (N2.mods.story): shards() fragments() lanterns() completed() earned()
     allFragments() chapters() openLetters() isSanctuary() state()
     debug helpers (tests / --eval only, no key): giveShards(n) litAll()
     spawnShard() goThreshold() goLucidHour() finish() reset() shard()
   events: emits "shard" (count, fragment), "lanternLit" (n), "ending".
   save key: "story".
   ============================================================================= */
var S = N2.mods.story = {};
var TOTAL = 49, PER = 7;
var T_NAME = "the_threshold", L_NAME = "the_lucid_hour";
var MINE = {}; MINE[T_NAME] = 1; MINE[L_NAME] = 1;
var TAU = Math.PI * 2;

/* ===================================================================== text */
var CHAPTERS = ["arrival", "wonder", "loneliness", "the nightmares", "forgetting", "choosing", "the lucid hour"];
var ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii"];
var ORD = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"];

var LETTERS = [
  /* i. arrival */
  "if you are reading this, you sleep in the room with the blue wall. i painted it. two coats. i ran out near the window — you'll find the place where it's thinner.",
  "the first night i thought i had only dozed off with the fan on. then i was standing in a field of doors. none of them were mine. all of them were open.",
  "i am writing this on the inside of a dream, which is harder than it sounds. the letters keep trying to become birds. i hold them down with both hands.",
  "nobody greeted me. that was the strange part. the dream just moved over, the way a cat makes room on a bed, and let me in.",
  "i counted the rooms the first week. i stopped at four hundred. they don't end. they only get quieter.",
  "you'll want to know if this is real. i asked the same thing. the answer i got was a staircase, which is not an answer, but it was beautiful.",
  "i'm leaving these where the light gathers. if you found one, you were looking. that's all it takes here. keep looking.",
  /* ii. wonder */
  "today it rained upward and i stood in it with my mouth open like a child. nobody needed me to be anywhere. i can't remember the last time that was true.",
  "there is a sea here made of clocks, and none of them agree. i sat on the shore and let them argue. it was the most peaceful hour of my life.",
  "i learned to look at my hands. in the dream they are never quite right — a finger too many, a palm that ripples. once you notice, the place notices you back. it feels like being recognised.",
  "i flew for the first time, over a city of lit windows. every window was someone's kitchen at two in the morning. i waved at all of them. one waved back.",
  "awake, i sorted other people's mail on the night shift. nine years of envelopes. here the dream hands me letters with no names on them, and i'm allowed to keep them.",
  "there's a field where the grass hums whatever note you're feeling. mine was low. i lay down in it and let it hum me.",
  "i told myself: one more night. one more door. i want you to know how easy that sentence is to say.",
  /* iii. loneliness */
  "i saw people today, far off, walking the way people walk when they're going home. i ran after them. they were coats. just coats, on hangers, on nothing.",
  "my sister used to call on sundays. she let it ring eleven times, always eleven, so i'd know it was her. i hear it in the long hallways here. i keep counting.",
  "i talk out loud now. the dream answers in the wrong voice, but it answers. i'm ashamed of how grateful i am.",
  "there was a bench at the edge of everything, and a bus that never came, and i waited anyway. waiting for something is a kind of company.",
  "do you ever wake up and the room feels like a photograph of a room? that's how waking started to feel. so i stopped doing it.",
  "i built a little house out of the quiet parts of other dreams. a chair from one, a lamp from another. i sat in it. it was still only me.",
  "if you're lonely too — and i think you might be, to come here this often — i'm sorry. i wish i could have left you a person instead of a letter. this is the closest i can get.",
  /* iv. the nightmares */
  "the dark started following me in the third winter. it doesn't hurry. it has never needed to.",
  "i used to think it was a monster. it isn't. it's made of every morning i didn't get up for. it has my posture.",
  "if it comes for you, don't look back to check. find the door that's glowing and go. there is no shame in it. running is only choosing, fast.",
  "light helps. any light. i folded a lantern out of an old receipt and it kept the dark three steps further off. three steps is enough. three steps is everything.",
  "once, it caught me. it didn't hurt. it sat on my chest like a winter coat that was too heavy, and whispered the date, and i didn't know it.",
  "the doors began to open the wrong way. the rooms began counting me. i think the dream was trying to warn me in the only way it knew: by getting worse.",
  "i'd like to tell you i was brave. i wasn't. i hid in a laundromat where the machines showed tiny weather, and i watched the storms go round, and i waited.",
  /* v. forgetting */
  "i can't remember the colour of my front door. i know it had a brass number, and the number was crooked. the colour is just gone, as if someone lifted it out with a knife.",
  "i wrote my name on my wrist so i'd keep it. now the letters swim. i think it starts with an m. i'm almost sure.",
  "the dream is so gentle about it. it takes things while you sleep inside the sleep. a smell. a song. the way my sister laughed with her whole face.",
  "i found a room full of everything i've forgotten, labelled in handwriting that isn't mine. i didn't go in. i couldn't bear to see how full it was.",
  "someone sits beside me on thursdays. out there, i mean — in the waking. i hear them like a radio through a wall. they read to me. i don't know who they are anymore. i love them anyway.",
  "how long have i been here? the dream says it doesn't matter. the dream is lying. it matters. tell me it matters.",
  "if you start to forget too — you will, a little — keep one small thing. the sound of your own kettle. carry it like a coin in your pocket.",
  /* vi. choosing */
  "i've decided. i want to go back. it will be cold and ordinary and my legs won't remember the stairs. i want it anyway. i want the ordinary cold.",
  "the trouble is, i've slept so long the way back has grown over. i can't find it alone. someone has to remember the way for me. i think that's you.",
  "every letter you find, i let go of. i'm not losing them. i'm giving them to you to carry. you're making me lighter. thank you.",
  "there's a place under all the dreams: a round hall over still water. i built it out of every time i almost woke up. i left a door to it in your hall. you've seen it.",
  "i put up seven lanterns there and couldn't light a single one. they don't take matches. they take being remembered.",
  "don't stay for me. please. you have a waking life, even if it's grey, even if it's only a kettle and a window. i'm asking you to help me, not to become me.",
  "i stopped being afraid of the dark the day i decided to leave. it turns out it only follows people who are staying.",
  /* vii. the lucid hour */
  "there is an hour between the last dream and the first light. the dream can't hold you there. it's the only hour that belongs to you.",
  "when all seven are lit, i'll wake. not here — out there. i'll open my eyes and someone will be reading on a thursday, and they'll drop the book.",
  "i think i'll ask for oranges. i think i'll ask what year it is, and not cry until afterwards.",
  "i was never brave. but i was here, and i noticed, and i wrote it down. maybe that's what brave is, when you're tired.",
  "you're the first person who ever came looking for me. i don't know your name. i know you sleep under my blue wall, and that you kept coming back.",
  "when you wake, open the blinds all the way. let the city in. i left the window that way for you.",
  "go on. i'll be right behind you. we were never stuck. we were only asleep. good morning."
];
var POSTSCRIPT = "p.s. — it was green. the front door. i remembered on the stairs, halfway down, with my hand on the rail. thank you for keeping it for me.";
var LANTERN_LINES = [
  "i remember arriving. every door was open.",
  "i remember the rain falling up.",
  "i remember waiting at the edge of everything.",
  "i remember running, and that running was choosing.",
  "i remember forgetting. that counts too.",
  "i remember deciding.",
  "i remember you."
];
var SLEEPER_LINES = [
  ["someone is sleeping here. their breathing is very slow.", "you can't see their face. the cloth moves when they breathe.", "they are dreaming of a blue wall.", "the cloth smells faintly of paint and rain."],
  ["they turn, a little, toward the light.", "under the cloth, a hand opens and closes.", "their breathing catches, then settles."],
  ["they're closer to the surface now. you can tell.", "their breathing has changed. like someone about to speak.", "they murmur something. it might be a door number."]
];
var LUCID_LINES = [
  "you came all this way.",
  "look — it's getting lighter. it always does, it turns out.",
  "i used to think waking up meant losing something.",
  "it doesn't. it's only the dream letting go of your hand.",
  "i can hear the thursday voice. they're reading the part about the sea.",
  "i'll go first. it's easier, i think, if someone goes first.",
  "don't be sad when you open your eyes. be hungry. be cold. be there."
];
var DOOR_LINE = "this one's yours. the same door as always. it was never locked from this side.";
var ENDING_LINES = [
  "the lanterns go out one by one —",
  "not because they are failing,",
  "but because the morning doesn't need them.",
  "",
  "somewhere, on a thursday, a book is dropped.",
  "somewhere, a window is opened all the way.",
  "",
  "you wake.",
  "the wall is blue. the light is ordinary.",
  "it is yours.",
  "",
  "",
  "nemuri II — the lucid hour",
  "a sequel to nemuri — an original dream toy",
  "letters by the other sleeper",
  "for whoever sleeps here next",
  "",
  "thank you for noticing."
];

/* ==================================================================== state */
var DEF = { v: 1, found: [], lit: [], completed: false, newGamePlus: false, doorSeen: false, doorAnnounced: false, sillSeen: false, endings: 0, visits: 0 };
var st = loadState();
function loadState() {
  var s = N2.save.get("story", null), o = {};
  for (var k in DEF) o[k] = (s && s[k] !== undefined) ? s[k] : (Array.isArray(DEF[k]) ? [] : DEF[k]);
  // sanitise: found = unique ids 0..48 in order; lit = unique post indices 0..6
  var seen = {}, f = [];
  if (Array.isArray(o.found)) for (var i = 0; i < o.found.length; i++) { var e = o.found[i]; if (!e || typeof e.id !== "number" || e.id < 0 || e.id >= TOTAL || seen[e.id]) continue; seen[e.id] = 1; f.push(e); }
  f.sort(function (a, b) { return a.id - b.id; }); o.found = f;
  var ls = {}, l = [];
  if (Array.isArray(o.lit)) for (var j = 0; j < o.lit.length; j++) { var p = o.lit[j] | 0; if (p >= 0 && p < 7 && !ls[p]) { ls[p] = 1; l.push(p); } }
  o.lit = l;
  return o;
}
function save() { N2.save.set("story", st); }
function shardCount() { return st.found.length; }
function litCount() { return st.lit.length; }
function earned() { return Math.min(7, Math.floor(shardCount() / PER)); }
function fragOf(id, rec) {
  var ch = Math.floor(id / PER);
  return { id: id, n: id + 1, chapter: ch + 1, chapterTitle: CHAPTERS[ch], roman: ROMAN[ch], text: LETTERS[id], night: rec ? rec.night : null, dream: rec ? rec.dream : null, recipe: rec ? rec.recipe : null, found: !!rec };
}
function isMine(name) { return !!MINE[name]; }
function zoneMine(z) { return !!(z && !z.bedroom && isMine(z.archetypeName)); }
function hereMine() { return zoneMine(N2.lastZone); }

/* ======================================================================= ui */
N2.ui.css([
  ".n2s-hud{opacity:0;transition:opacity 1.4s ease;color:var(--n2-dim);font-size:11px;letter-spacing:.2em;white-space:nowrap;text-shadow:0 0 8px rgba(0,0,0,.6);}",
  ".n2s-hud.on{opacity:.9;}.n2s-hud.soft{opacity:.42;}",
  ".n2s-hud i{font-style:normal;color:var(--n2-gold);}.n2s-hud .lt{color:var(--n2-amber);}",
  ".n2s-hud .sh.near{animation:n2sBreathe 2.6s ease-in-out infinite;}",
  "@keyframes n2sBreathe{0%,100%{text-shadow:0 0 0 rgba(240,215,154,0);}50%{text-shadow:0 0 10px rgba(240,215,154,.95);color:#fff6dc;}}",
  "#n2s-letter{position:fixed;left:50%;bottom:58px;transform:translate(-50%,8px);width:min(88vw,540px);z-index:44;pointer-events:none;opacity:0;transition:opacity 1.1s ease,transform 1.1s ease;",
  "font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;text-align:left;padding:14px 22px 16px;",
  "background:linear-gradient(90deg,rgba(6,10,22,0),rgba(6,10,22,.74) 12%,rgba(6,10,22,.74) 88%,rgba(6,10,22,0));}",
  "#n2s-letter.on{opacity:1;transform:translate(-50%,0);}",
  "#n2s-letter .hd{font-size:10px;letter-spacing:.28em;color:var(--n2-teal);opacity:.8;margin-bottom:8px;text-transform:lowercase;}",
  "#n2s-letter .tx{font-size:12.5px;line-height:1.75;letter-spacing:.05em;color:#ece5cf;text-shadow:0 0 14px rgba(240,215,154,.28);min-height:1.7em;}",
  "#n2s-letter .tx .cur{display:inline-block;width:.5em;color:var(--n2-gold);animation:n2sBlink 1s steps(2) infinite;}",
  "@keyframes n2sBlink{50%{opacity:0;}}",
  "#n2s-flash{position:fixed;inset:0;z-index:43;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 55%,rgba(255,244,214,.55),rgba(190,220,255,.18) 40%,rgba(0,0,0,0) 72%);transition:opacity 1.6s ease;}",
  "#n2-letters .n2-sheet{max-width:640px;}",
  "#n2-letters .ch{margin:18px 0 6px;font-size:11px;letter-spacing:.3em;color:var(--n2-teal);}",
  "#n2-letters .lt{margin:0 0 12px;font-size:12px;line-height:1.75;letter-spacing:.04em;color:#e6dfca;}",
  "#n2-letters .lt small{display:block;color:var(--n2-dim);font-size:10px;letter-spacing:.16em;margin-top:2px;}",
  "#n2-letters .un{color:rgba(160,175,200,.35);letter-spacing:.5em;margin:0 0 10px;font-size:11px;}",
  "#n2s-end{position:fixed;inset:0;z-index:95;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:#04060d;opacity:0;transition:opacity 2.4s ease;",
  "font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;color:#ece5cf;text-align:center;padding:0 20px;}",
  "#n2s-end.on{opacity:1;}",
  "#n2s-end .ln{font-size:14px;letter-spacing:.16em;line-height:2.1;opacity:0;transition:opacity 2.2s ease;min-height:1em;text-shadow:0 0 18px rgba(240,215,154,.3);}",
  "#n2s-end .ln.on{opacity:1;}#n2s-end .ln.cr{font-size:11px;letter-spacing:.3em;color:var(--n2-dim);}#n2s-end .ln.big{font-size:18px;color:var(--n2-gold);letter-spacing:.34em;}",
  "#n2s-end .sk{position:absolute;bottom:22px;font-size:10px;letter-spacing:.24em;color:var(--n2-dim);opacity:.0;transition:opacity 2s;}#n2s-end .sk.on{opacity:.6;}"
].join("\n"), "n2-story-css");

var hud = N2.ui.el("div", "n2s-hud", "", N2.ui.region("tr"));
var hudTimer = 0, hudNear = false, hudForce = false;
function renderHud() {
  hud.innerHTML = "<span class='sh" + (hudNear ? " near" : "") + "'><i>◇</i> " + shardCount() + "</span> &nbsp;·&nbsp; <span class='lt'>✦</span> " + litCount() + (earned() > litCount() ? "<span class='lt'>+" + (earned() - litCount()) + "</span>" : "");
}
function pingHud(secs) { renderHud(); hudTimer = secs || 7; }
function updateHud(dt) {
  if (hudTimer > 0) hudTimer -= dt;
  var want = (hudTimer > 0) ? "on" : (hudForce || hudNear) ? "soft" : "";
  hud.classList.toggle("on", want === "on"); hud.classList.toggle("soft", want === "soft");
}
renderHud();

// the letter card: non-blocking, bottom third, typed in
var letterEl = N2.ui.el("div", "", "<div class='hd'></div><div class='tx'></div>", document.body); letterEl.id = "n2s-letter";
var flashEl = N2.ui.el("div", "", "", document.body); flashEl.id = "n2s-flash";
var letterT = null, letterHide = null;
function showLetter(head, text, holdMs) {
  try {
    if (letterT) clearInterval(letterT); if (letterHide) clearTimeout(letterHide);
    var hd = letterEl.querySelector(".hd"), tx = letterEl.querySelector(".tx");
    hd.textContent = head || ""; tx.textContent = "";
    letterEl.classList.add("on");
    var n = 0, reduced = N2.settings && N2.settings.reducedMotion;
    var total = text.length, step = reduced ? total : 2;
    letterT = setInterval(function () {
      n = Math.min(total, n + step);
      tx.innerHTML = ""; tx.appendChild(document.createTextNode(text.slice(0, n)));
      if (n < total) { var c = document.createElement("span"); c.className = "cur"; c.textContent = "▏"; tx.appendChild(c); }
      else { clearInterval(letterT); letterT = null; }
    }, 34);
    var hold = holdMs || Math.min(17000, 5200 + total * 62);
    letterHide = setTimeout(function () { letterEl.classList.remove("on"); }, hold);
  } catch (e) {}
}
function hideLetter() { try { if (letterT) clearInterval(letterT); letterT = null; letterEl.classList.remove("on"); } catch (e) {} }
function flash(strength) { flashEl.style.transition = "none"; flashEl.style.opacity = String(strength == null ? 1 : strength); void flashEl.offsetWidth; flashEl.style.transition = "opacity 1.8s ease"; flashEl.style.opacity = "0"; }
function bigWhisper(text, sub) {
  var T = N2.mods.title;
  try { if (T && T.flash) { T.flash(text); if (sub) N2.ui.toast(sub); return; } } catch (e) {}
  N2.ui.toast(text, sub, 4200);
}
function hint(text) { try { beingSpeak(text); } catch (e) {} }

// letters reader (used from the Threshold desk, or by anyone via openLetters())
function buildLettersPanel() {
  var p = N2.ui.panel("n2-letters", "letters from the other sleeper");
  if (!p._body) {
    var close = N2.ui.el("button", "n2-btn n2-close", "close", p.sheet); close.addEventListener("click", function () { N2.ui.close("n2-letters"); });
    p.sheet.style.position = "relative";
    p._body = N2.ui.el("div", "", "", p.sheet);
  }
  var h = ["<div class='n2-muted' style='font-size:11px;letter-spacing:.16em'>" + shardCount() + " of " + TOTAL + " found · " + litCount() + " of 7 lanterns lit</div>"];
  var byId = {}; for (var i = 0; i < st.found.length; i++) byId[st.found[i].id] = st.found[i];
  for (var c = 0; c < 7; c++) {
    var any = false, block = [];
    for (var k = 0; k < PER; k++) {
      var id = c * PER + k, rec = byId[id];
      if (rec) { any = true; block.push("<div class='lt' data-id='" + id + "'>" + esc(LETTERS[id]) + "<small>letter " + (id + 1) + (rec.dream ? " · found in " + esc(rec.dream) : "") + (rec.night ? " · night " + rec.night : "") + "</small></div>"); }
      else block.push("<div class='un'>· · ·</div>");
    }
    h.push("<div class='ch'>" + ROMAN[c] + " · " + (any || c === 0 ? CHAPTERS[c] : "—") + "</div>" + block.join(""));
  }
  if (st.completed) h.push("<div class='ch'>·</div><div class='lt'>" + esc(POSTSCRIPT) + "<small>left on the windowsill</small></div>");
  p._body.innerHTML = h.join("");
  return p;
}
function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"; }); }
function scrollLetters() {
  try {
    var p = document.getElementById("n2-letters"); if (!p || !p.sheet) return;
    var all = p.sheet.querySelectorAll(".lt[data-id]"), last = all[all.length - 1];
    p.sheet.scrollTop = last ? Math.max(0, last.offsetTop - p.sheet.clientHeight * 0.45) : 0;
  } catch (e) {}
}
function openLetters() {
  var J = N2.mods.journal;
  try { if (J && J.open) { J.open("letters"); return; } } catch (e) {}
  buildLettersPanel(); N2.ui.open("n2-letters");
  scrollLetters();
}

/* ==================================================================== sound */
function tone(freq, delay, dur, vol, type) {
  if (!audio.ctx || !audio.master) return;
  try {
    var c = audio.ctx, t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 1.5));
    o.connect(g); g.connect(audio.master); if (audio.delay) g.connect(audio.delay);
    o.start(t); o.stop(t + (dur || 1.5) + 0.1);
  } catch (e) {}
}
function chord(freqs, spread, dur, vol, type) { for (var i = 0; i < freqs.length; i++) tone(freqs[i], i * (spread || 0.12), dur, vol, type); }
// a spatial hum that grows as you near something (one at a time)
var hum = null;
function startHum(base, vol) {
  stopHum();
  if (!audio.ctx || !audio.master) return;
  try {
    var c = audio.ctx, out = c.createGain(); out.gain.value = 0;
    var f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1100; f.connect(out);
    var pan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (pan) { out.connect(pan); pan.connect(audio.master); } else out.connect(audio.master);
    var oscs = [], fr = [base, base * 1.5 * 1.004, base * 2.002];
    for (var i = 0; i < fr.length; i++) { var o = c.createOscillator(); o.type = i === 1 ? "triangle" : "sine"; o.frequency.value = fr[i]; var og = c.createGain(); og.gain.value = [1, 0.45, 0.3][i]; o.connect(og); og.connect(f); o.start(); oscs.push(o); }
    hum = { out: out, pan: pan, oscs: oscs, vol: vol || 0.05 };
  } catch (e) { hum = null; }
}
function stopHum() {
  if (!hum) return;
  var h = hum; hum = null;
  try { var t = audio.ctx.currentTime; h.out.gain.cancelScheduledValues(t); h.out.gain.setValueAtTime(h.out.gain.value, t); h.out.gain.linearRampToValueAtTime(0, t + 0.35); for (var i = 0; i < h.oscs.length; i++) h.oscs[i].stop(t + 0.45); setTimeout(function () { try { h.out.disconnect(); if (h.pan) h.pan.disconnect(); } catch (e) {} }, 700); } catch (e) {}
}
function steerHum(x, y, z, maxD) {
  if (!hum || !audio.ctx) return;
  try {
    var dx = x - pos.x, dz = z - pos.z, d = Math.hypot(dx, dz, (y - pos.y - 1.4) * 0.5);
    var k = clamp(1 - d / (maxD || 34), 0, 1), quiet = (paused || N2.uiOpen || phase !== "play") ? 0 : 1;
    var g = hum.vol * k * k * quiet * (0.85 + 0.15 * Math.sin(tNow() * 2.3));
    hum.out.gain.setTargetAtTime(g, audio.ctx.currentTime, 0.12);
    if (hum.pan) {
      var fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      var lat = (dx * rx + dz * rz) / (d || 1);
      hum.pan.pan.setTargetAtTime(clamp(lat, -0.9, 0.9), audio.ctx.currentTime, 0.1);
      void fx; void fz;
    }
  } catch (e) {}
}

/* ================================================================== shards */
var shard = null;
var SHARD_COL = 0xa9d4ff, SHARD_CORE = 0xfff1c8;
// probe ground as the player's feet would, walking from height fromY
function probe(x, z, fromY) {
  var g = null;
  try { groundClampY = fromY + 0.7; g = groundSampler(x, z); } catch (e) { g = null; }
  groundClampY = Infinity;
  if (!g || !g.on || !isFinite(g.y) || g.y < killY + 1) return null;
  return g.y;
}
// fraction of a straight walk from (x0,z0) that is standable and unobstructed
function walkable(x0, y0, z0, x1, z1) {
  var d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(3, Math.ceil(d / 1.4)), py = y0, bad = 0;
  for (var i = 1; i <= n; i++) {
    var t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = probe(x, z, py);
    if (y == null || Math.abs(y - py) > 1.15 || N2.insideSolid(x, z, y)) bad++; else py = y;
  }
  return { ok: 1 - bad / n, y: py };
}
function findShardSpot() {
  var ranges = [[14, 40, 14], [9, 22, 10], [5, 12, 10]], best = null, bestScore = -1;
  for (var r = 0; r < ranges.length; r++) {
    for (var k = 0; k < ranges[r][2]; k++) {
      var s = N2.findSpot(ranges[r][0], ranges[r][1], pos.x, pos.z, 24); if (!s) continue;
      var w = walkable(pos.x, pos.y, pos.z, s.x, s.z);
      var y = probe(s.x, s.z, w.y); if (y == null) continue;
      if (N2.insideSolid(s.x, s.z, y)) continue;
      var score = w.ok - (Math.abs(y - pos.y) > 6 ? 0.3 : 0);
      if (w.ok >= 0.999) return { x: s.x, y: y, z: s.z };
      if (score > bestScore) { bestScore = score; best = { x: s.x, y: y, z: s.z }; }
    }
    if (best && bestScore >= 0.8) return best;
  }
  return (best && bestScore >= 0.6) ? best : null;
}
function buildShard(x, y, z) {
  var g = new THREE.Group(); g.position.set(x, y, z);
  var cy = 1.15;
  var outerG = new THREE.OctahedronGeometry(0.34, 0); outerG.scale(1, 1.75, 1);
  var outer = new THREE.Mesh(outerG, objMat({ color: SHARD_COL, bright: 1.9, opacity: 0.62, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  outer.position.y = cy; g.add(outer);
  var innerG = new THREE.OctahedronGeometry(0.15, 0); innerG.scale(1, 1.6, 1);
  var inner = new THREE.Mesh(innerG, objMat({ color: SHARD_CORE, bright: 2.7 })); inner.position.y = cy; g.add(inner);
  var edges = new THREE.LineSegments(new THREE.EdgesGeometry(outerG), new THREE.LineBasicMaterial({ color: 0xf6e2a8, transparent: true, opacity: 0.9 }));
  edges.position.y = cy; g.add(edges);
  var halo = N2.glowSprite(0xbfe2ff, 2.6); halo.position.y = cy; g.add(halo);
  var far = N2.glowSprite(0xfff0d0, 0.9); far.position.y = cy; g.add(far);  // the little star you see from far away
  var ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 28), objMat({ color: SHARD_COL, bright: 1.8, opacity: 0.3, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.11, 18, 6, 1, true), new THREE.MeshBasicMaterial({ map: beamTexture(), color: 0xa8d2ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = cy + 9.2; g.add(beam);
  var motes = [];
  for (var i = 0; i < 3; i++) { var m = N2.glowSprite(0xe8f4ff, 0.22); g.add(m); motes.push(m); }
  N2.addToDream(g);
  return { g: g, outer: outer, inner: inner, edges: edges, halo: halo, far: far, ring: ring, beam: beam, motes: motes, x: x, y: y, z: z, cy: cy, t: Math.random() * 6, got: 0 };
}
var _haloTex = null;
function haloTexture() {
  if (_haloTex) return _haloTex;
  _haloTex = canvasT(64, 64, function (x, w, h) { var gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.45, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, w, h); }, true);
  return _haloTex;
}
var _beamTex = null;
function beamTexture() {
  if (_beamTex) return _beamTex;
  _beamTex = canvasT(4, 128, function (x, w, h) { var gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.7, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,1)"); x.fillStyle = gr; x.fillRect(0, 0, w, h); }, true);
  return _beamTex;
}
function spawnShard(force) {
  if (shard) return shard;
  if (shardCount() >= TOTAL) return null;
  if (!N2.isDreaming() || hereMine()) return null;
  if (!force && Math.random() > 0.55) return null;
  var s = findShardSpot(); if (!s) return null;
  shard = buildShard(s.x, s.y, s.z);
  startHum(196, 0.05);
  return shard;
}
function clearShard() { shard = null; stopHum(); }
function collectShard() {
  if (!shard || shard.got) return;
  shard.got = 0.0001;
  stopHum();
  var id = nextFragmentId(); if (id < 0) return;
  var rec = { id: id, night: day, recipe: N2.dreamName(), dream: N2.prettyName(N2.dreamName()) };
  st.found.push(rec); st.found.sort(function (a, b) { return a.id - b.id; }); save();
  var f = fragOf(id, rec), n = shardCount();
  // sound: a small rising arpeggio, a held tone underneath
  chord([659.3, 784, 987.8, 1318.5], 0.11, 2.2, 0.07, "sine"); tone(329.6, 0, 3.2, 0.05, "triangle");
  flash(0.55);
  N2.ui.toast("a memory shard", "letter " + f.n + " of " + TOTAL + " · " + f.roman + " · " + f.chapterTitle);
  showLetter("letter " + f.n + " · " + f.chapterTitle, f.text);
  pingHud(9);
  if (n % PER === 0) {
    setTimeout(function () { N2.ui.toast(n >= TOTAL ? "every letter is found" : "seven letters", n >= TOTAL ? "the last lantern is waiting in the threshold" : "somewhere under the dreams, a lantern can be lit", 4600); }, 3600);
  }
  try { N2.emit("shard", n, { id: f.id, chapter: f.chapter, text: f.text }); } catch (e) {}
}
function nextFragmentId() { var have = {}; for (var i = 0; i < st.found.length; i++) have[st.found[i].id] = 1; for (var j = 0; j < TOTAL; j++) if (!have[j]) return j; return -1; }
function updateShard(dt) {
  if (!shard) { hudNear = false; return; }
  var s = shard, t = tNow();
  if (s.got) {
    s.got += dt;
    var k = clamp(s.got / 1.0, 0, 1);
    s.g.position.y = s.y + k * 0.9;
    var sc = 1 + k * 1.6; s.outer.scale.set(sc, sc, sc); s.edges.scale.set(sc, sc, sc); s.inner.scale.setScalar(1 - k);
    s.outer.material.uniforms.uOpacity.value = 0.62 * (1 - k); s.edges.material.opacity = 0.85 * (1 - k);
    s.halo.scale.setScalar(2.6 + k * 6); s.halo.material.opacity = 1 - k; s.far.material.opacity = 1 - k;
    s.beam.material.opacity = 0.5 * (1 - k); s.ring.material.uniforms.uOpacity.value = 0.3 * (1 - k);
    if (k >= 1) { if (s.g.parent) s.g.parent.remove(s.g); shard = null; }
    hudNear = false;
    return;
  }
  s.t += dt;
  var bob = Math.sin(s.t * 1.3) * 0.12;
  s.outer.rotation.y = s.t * 0.55; s.edges.rotation.y = s.t * 0.55; s.inner.rotation.y = -s.t * 1.1;
  s.outer.position.y = s.edges.position.y = s.inner.position.y = s.halo.position.y = s.far.position.y = s.cy + bob;
  s.halo.material.opacity = 0.55 + 0.25 * Math.sin(t * 2.1);
  for (var i = 0; i < s.motes.length; i++) { var a = s.t * (0.7 + i * 0.25) + i * 2.1; s.motes[i].position.set(Math.cos(a) * 0.62, s.cy + Math.sin(a * 1.7) * 0.35 + bob, Math.sin(a) * 0.62); }
  var dx = pos.x - s.x, dz = pos.z - s.z, dh = Math.hypot(dx, dz);
  // the far star stays readable at distance and folds away up close
  var fs = clamp(dh / 14, 0.25, 2.2); s.far.scale.set(fs, fs, 1);
  hudNear = dh < 30;
  steerHum(s.x, s.y + s.cy, s.z, 36);
  if (phase === "play" && dh < 1.25 && Math.abs((pos.y + 0.9) - (s.y + s.cy)) < 2.0) collectShard();
}

/* ================================================== world plumbing (mine) */
// keep the curated story worlds composed: no random beings, clutter, landmarks or modifiers
var _populate = populateDream;
populateDream = function (z) { if (zoneMine(z)) return; return _populate.apply(this, arguments); };
var _placeIx = placeInteractables;
placeInteractables = function (z) { if (zoneMine(z)) return; return _placeIx.apply(this, arguments); };
var _placeProps = placeSceneProps;
placeSceneProps = function (z) { if (zoneMine(z)) { sceneProps = []; return; } return _placeProps.apply(this, arguments); };
var _placeLm = placeSignatureLandmark;
placeSignatureLandmark = function (z) { if (zoneMine(z)) return; return _placeLm.apply(this, arguments); };
var _applyMods = applyModifiers;
applyModifiers = function (z) { if (z && isMine(z.archetypeName)) { z.desat = 0; return; } return _applyMods.apply(this, arguments); };
var savedEmergentCD = null;

// tiny build helpers (all add to the current buildGroup)
function M(c, b, o) { o = o || {}; o.color = c; o.bright = b == null ? 1 : b; return objMat(o); }
function canvasT(w, h, draw, linear) {
  var c = document.createElement("canvas"); c.width = w; c.height = h; var x = c.getContext("2d"); draw(x, w, h);
  var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (linear) { t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; } else { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter; }
  t.needsUpdate = true; return t;
}
function waterTex(base, line, spark) {
  return canvasT(128, 128, function (x, s) {
    x.fillStyle = base; x.fillRect(0, 0, s, s);
    for (var i = 0; i < 70; i++) { x.fillStyle = line; x.globalAlpha = 0.25 + Math.random() * 0.5; x.fillRect(Math.random() * s, Math.random() * s, 4 + Math.random() * 16, 1); }
    x.globalAlpha = 1; for (var j = 0; j < 14; j++) { x.fillStyle = spark; x.fillRect(Math.random() * s, Math.random() * s, 1, 1); }
  });
}
function textSprite(text, color, w) {
  var c = document.createElement("canvas"); c.width = 512; c.height = 64; var x = c.getContext("2d");
  x.font = "26px ui-monospace, Menlo, Consolas, monospace"; x.textAlign = "center"; x.textBaseline = "middle";
  x.shadowColor = color; x.shadowBlur = 14; x.fillStyle = color;
  x.fillText(String(text).toLowerCase().split("").join(" "), 256, 33);
  var t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  var m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.8, fog: false });
  var sp = new THREE.Sprite(m); sp.scale.set(w || 4, (w || 4) / 8, 1);
  sp.userData.tex = t; return sp;
}
function starField(n, R, yMin, mirror) {
  var p = [], q = [];
  for (var i = 0; i < n; i++) {
    var a = Math.random() * TAU, e = Math.asin(Math.sin(yMin) + Math.random() * (1 - Math.sin(yMin)));
    var x = Math.cos(e) * Math.cos(a) * R, y = Math.sin(e) * R, z = Math.cos(e) * Math.sin(a) * R;
    p.push(x, y, z); if (mirror && i % 3 === 0) q.push(x, -y, z);
  }
  var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  var m = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.15, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false, fog: false });
  var pts = new THREE.Points(g, m); addMesh(pts);
  if (q.length) { var g2 = new THREE.BufferGeometry(); g2.setAttribute("position", new THREE.Float32BufferAttribute(q, 3)); addMesh(new THREE.Points(g2, new THREE.PointsMaterial({ color: 0x9fb0d0, size: 1, sizeAttenuation: false, transparent: true, opacity: 0.35, depthWrite: false, fog: false }))); }
  return pts;
}
function mirror(mesh, opacityMul) {
  var m = mesh.clone(); m.position.y = -mesh.position.y; m.scale.y = -mesh.scale.y; m.rotation.x = -mesh.rotation.x; m.rotation.z = -mesh.rotation.z;
  if (opacityMul != null && m.material && m.material.isSpriteMaterial) { m.material = m.material.clone(); m.material.opacity *= opacityMul; }
  addMesh(m); return m;
}
function hashHue(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return ((h >>> 0) % 1000) / 1000; }
function rememberedDreams() {
  var out = [], seen = {};
  function add(r, pal) { if (!r || seen[r] || !RECIPES[r] || r === "__bedroom" || isMine(r)) return; var wi = N2.worldInfo[r]; if (wi && wi.hidden) return; seen[r] = 1; out.push({ recipe: r, glow: pal }); }
  try {
    var J = N2.mods.journal;
    if (J && J.entries) {
      var es = J.entries() || [];
      if (!Array.isArray(es)) es = Object.keys(es).map(function (k) { var v = es[k]; return (v && typeof v === "object") ? (v.recipe ? v : { recipe: k, palette: v.palette }) : k; });
      es.slice().reverse().forEach(function (e) { var r = typeof e === "string" ? e : (e && (e.recipe || e.name || e.id)); var pal = e && e.palette && (e.palette.glow || e.palette[1]); add(r, pal); });
    }
  } catch (e) {}
  for (var i = st.found.length - 1; i >= 0; i--) add(st.found[i].recipe);
  for (var m = 0; m < memories.length; m++) add(memories[m].recipe);
  return out;
}
function colorOf(v, fallbackHue) {
  try { if (v != null) { var c = (typeof v === "object" && v.r != null) ? new THREE.Color(v.r, v.g, v.b) : new THREE.Color(v); if (isFinite(c.r)) { var hsl = {}; c.getHSL(hsl); return new THREE.Color().setHSL(hsl.h, clamp(hsl.s, 0.25, 0.6), clamp(hsl.l, 0.55, 0.75)); } } } catch (e) {}
  return new THREE.Color().setHSL(fallbackHue, 0.42, 0.66);
}

/* ============================================================ THE THRESHOLD */
var TH = null, deadTex = [];
function retire(th) { if (th && th.textures) { deadTex = deadTex.concat(th.textures); th.textures = []; } }
var POST_R = 13.5, DOOR_R = 20.5, HALL_R = 22.5, COL_R = 25.5;
function postAngle(i) { return Math.PI / 2 + i * TAU / 7; }
function doorAngle(i) { return Math.PI / 2 + (i + 0.5) * TAU / 7; }
function buildThreshold(P, mood) {
  retire(TH);
  var th = TH = { posts: [], doors: [], motes: [], textures: [], focus: [], t: 0, wake: -1, awake: false, built: true, lineIdx: 0 };
  // a fixed, moonlit palette (other modules read zone.palette)
  P.sky.set(0x070b18); P.fog = new THREE.Color(0x0d1630); P.glow.set(0xf0d79a); P.accent.set(0x8fd0d2); P.wallA.set(0x56627e); P.wallB.set(0x2a3450); P.ground.set(0x1b2337); P.figure.set(0xcfd6e6);
  var stone = M(0x3a4560, 0.85), stoneD = M(0x262e44, 0.8), iron = M(0x1b2131, 0.8), pale = M(0x8d9ab4, 0.95);

  // ---- still water to the horizon (semi-clear, so the mirrored hall shows beneath) ----
  var wm = objMat({ map: waterTex("#0d1830", "#2a3d64", "#9fb7e0"), color: 0x9fb4d8, bright: 0.78, opacity: 0.72, transparent: true, depthWrite: false, scroll: new THREE.Vector2(0.004, 0.0025) });
  setRepeat(wm, 46, 46);
  var wpl = new THREE.Mesh(new THREE.PlaneGeometry(340, 340, 24, 24), wm); wpl.rotation.x = -Math.PI / 2; addMesh(wpl);
  starField(520, 240, 0.08, true);
  // ---- the moon, low, and its double ----
  var moon = sph(-46, 44, -128, 9, M(0xf2ead2, 1.75), 16, 12); mirror(moon);
  var mh = sph(-46, 44, -128, 15, M(0xcfd8f0, 1.3, { opacity: 0.12, transparent: true, depthWrite: false }), 14, 10); mirror(mh);
  var ms = N2.glowSprite(0xdfe6ff, 70); ms.material.opacity = 0.22; ms.position.set(-46, 44, -128); addMesh(ms); mirror(ms, 0.6);

  // ---- the round floor, inlaid with rings and a seven-pointed star ----
  var floorT = canvasT(512, 512, function (x, s) {
    var c = s / 2; x.fillStyle = "#2b3550"; x.fillRect(0, 0, s, s);
    for (var i = 0; i < 2200; i++) { x.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.06)"; x.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
    x.strokeStyle = "rgba(200,214,240,0.22)"; x.lineWidth = 2;
    [0.98, 0.93, 0.66, 0.62, 0.26, 0.22].forEach(function (r) { x.beginPath(); x.arc(c, c, c * r, 0, TAU); x.stroke(); });
    x.strokeStyle = "rgba(240,215,154,0.30)"; x.lineWidth = 2.5; x.beginPath();
    for (var k = 0; k <= 7; k++) { var a = -Math.PI / 2 + (k * 3 % 7) * TAU / 7; var px = c + Math.cos(a) * c * 0.6, py = c + Math.sin(a) * c * 0.6; if (k === 0) x.moveTo(px, py); else x.lineTo(px, py); }
    x.stroke();
    x.fillStyle = "rgba(240,215,154,0.35)";
    for (var j = 0; j < 7; j++) { var b = -Math.PI / 2 + j * TAU / 7; x.beginPath(); x.arc(c + Math.cos(b) * c * 0.64, c + Math.sin(b) * c * 0.64, 6, 0, TAU); x.fill(); }
    for (var q = 0; q < 56; q++) { var d = q * TAU / 56; x.fillRect(c + Math.cos(d) * c * 0.955 - 1.5, c + Math.sin(d) * c * 0.955 - 1.5, 3, 3); }
  });
  var floorM = objMat({ map: floorT, color: 0xc4cde0, bright: 0.95 });
  var floor = new THREE.Mesh(new THREE.RingGeometry(0.05, HALL_R, 64, 8), floorM); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.3; addMesh(floor);
  // floor UVs: RingGeometry maps the disk to 0..1 already — rotate so the star points at the causeway
  var rim = new THREE.Mesh(new THREE.CylinderGeometry(HALL_R, HALL_R + 0.25, 0.8, 64, 1, true), stoneD); rim.position.y = -0.1; addMesh(rim);
  var lip = new THREE.Mesh(new THREE.TorusGeometry(HALL_R, 0.16, 4, 64), pale); lip.rotation.x = Math.PI / 2; lip.position.y = 0.32; addMesh(lip);
  // ---- causeway from the waking door ----
  box(0, 0.12, 28.6, 3.2, 0.36, 12.4, stone);
  for (var cs = 0; cs < 6; cs++) { box(-1.75, 0.38, 23.4 + cs * 2.1, 0.22, 0.2, 0.22, pale); box(1.75, 0.38, 23.4 + cs * 2.1, 0.22, 0.2, 0.22, pale); }

  // ---- the colonnade standing in the water, ribs rising to an open oculus ----
  for (var c = 0; c < 14; c++) {
    var ca = Math.PI / 2 + (c + 0.5) * TAU / 14, cx = Math.cos(ca) * COL_R, cz = Math.sin(ca) * COL_R;
    var col = cyl(cx, 10.6, cz, 0.75, 22, stone, 8); mirror(col);
    box(cx, 21.75, cz, 2.0, 0.5, 2.0, stoneD);
    var foot = cyl(cx, 0.15, cz, 1.05, 0.5, stoneD, 8);
    pushSolidCyl(cx, cz, 0.85, -1, 22);
    void foot;
  }
  var ringB = new THREE.Mesh(new THREE.TorusGeometry(COL_R, 0.6, 5, 56), stoneD); ringB.rotation.x = Math.PI / 2; ringB.position.y = 22.2; addMesh(ringB);
  for (var rb = 0; rb < 7; rb++) {
    var ra = Math.PI / 2 + (rb * 2 + 0.5) * TAU / 14, rg = new THREE.Group(); rg.rotation.y = -ra; buildGroup.add(rg);
    var segs = 8, pr = COL_R, py = 22.2;
    for (var sg = 1; sg <= segs; sg++) {
      var tt = sg / segs, r1 = 7 + (COL_R - 7) * Math.cos(tt * Math.PI / 2), y1 = 22.2 + 13.8 * Math.sin(tt * Math.PI / 2);
      var len = Math.hypot(r1 - pr, y1 - py), seg = new THREE.Mesh(new THREE.BoxGeometry(len + 0.3, 0.55, 0.7), stoneD);
      seg.position.set((pr + r1) / 2, (py + y1) / 2, 0); seg.rotation.z = Math.atan2(y1 - py, r1 - pr); rg.add(seg);
      pr = r1; py = y1;
    }
  }
  var ocu = new THREE.Mesh(new THREE.TorusGeometry(7, 0.55, 5, 32), stoneD); ocu.rotation.x = Math.PI / 2; ocu.position.y = 36; addMesh(ocu);
  // moonlight falling through the oculus onto the sleeper
  var shaft = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 2.4, 35, 24, 1, true), new THREE.MeshBasicMaterial({ map: beamTexture(), color: 0x121a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  shaft.position.y = 18.5; addMesh(shaft);

  // ---- the sleeper, on a low round dais ----
  cyl(0, 0.48, 0, 2.6, 0.36, stone, 28); cyl(0, 0.8, 0, 2.05, 0.3, pale, 28);
  box(0, 1.12, 0, 2.4, 0.34, 1.0, stoneD);
  pushSolidCyl(0, 0, 2.25, -1, 3);
  var fig = new THREE.Group(); fig.position.set(0, 1.32, 0); buildGroup.add(fig);
  var bodyM = M(0x7d8aa6, 0.9), skinM = M(0xb9a898, 0.95), hairM = M(0x2a2630, 0.8);
  var hip = new THREE.Group(); hip.position.set(0.15, 0.12, 0); fig.add(hip);           // pivot: the torso sits up around the hips
  var torso = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), bodyM); torso.scale.set(1.75, 0.62, 0.95); torso.position.set(-0.45, 0.02, 0); hip.add(torso);
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), skinM); head.position.set(-1.0, 0.06, 0.02); hip.add(head);
  var hair = new THREE.Mesh(new THREE.SphereGeometry(0.185, 10, 8, 0, TAU, 0, Math.PI * 0.6), hairM); hair.position.copy(head.position); hair.rotation.z = Math.PI / 2 + 0.3; hip.add(hair);
  var legs = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), bodyM); legs.scale.set(2.1, 0.5, 0.85); legs.position.set(0.55, 0.04, 0); fig.add(legs);
  var clothM = M(0xdde4f0, 1.12, { opacity: 0.94, transparent: true });
  var cloth = new THREE.Group(); fig.add(cloth);
  var c1 = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, TAU, 0, Math.PI * 0.55), clothM); c1.scale.set(2.95, 0.72, 1.18); c1.position.set(-0.05, -0.05, 0); cloth.add(c1);
  var c2 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8, 0, TAU, 0, Math.PI * 0.55), clothM); c2.scale.set(1.0, 0.95, 1.05); c2.position.set(-0.98, -0.02, 0.02); cloth.add(c2);
  var veil = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 2.6, 18, 1, true), M(0xcfe0ff, 1.4, { opacity: 0.06, transparent: true, depthWrite: false, side: THREE.DoubleSide })); veil.position.set(0, 2.0, 0); addMesh(veil);
  th.fig = { g: fig, hip: hip, torso: torso, legs: legs, head: head, hair: hair, cloth: cloth, clothM: clothM, bodyM: bodyM, skinM: skinM, hairM: hairM, veil: veil };
  for (var mo = 0; mo < 12; mo++) { var sp = N2.glowSprite(mo % 3 ? 0xdfe8ff : 0xf0d79a, 0.28); addMesh(sp); th.motes.push({ s: sp, a: Math.random() * TAU, r: 1.2 + Math.random() * 1.6, h: Math.random() * 3, v: 0.15 + Math.random() * 0.25 }); }
  th.sleeperIx = ix(fig, 0, 0, 3.4, { kind: "n2sleeper", examine: function () { examineSleeper(); } });
  th.focus.push({ x: 0, z: 0, r: 3.6, text: function () { return th.awake ? "" : "someone is sleeping here"; } });

  // ---- seven lantern posts ----
  for (var i = 0; i < 7; i++) th.posts.push(buildPost(i, iron, stoneD));

  // ---- seven doors to remembered dreams, and the door you came in by ----
  var mem = rememberedDreams(), pool2 = ALL_NAMES.filter(function (n) { return RECIPES[n] && !isMine(n); });
  var shimmer = canvasT(32, 128, function (x, w, h) { for (var y = 0; y < h; y++) { var v = 0.55 + 0.45 * Math.sin(y * 0.19) * Math.sin(y * 0.047 + 1.3); x.fillStyle = "rgba(255,255,255," + (0.35 + 0.65 * v).toFixed(3) + ")"; x.fillRect(0, y, w, 1); } });
  th.textures.push(shimmer);
  for (var d = 0; d < 7; d++) {
    var target = mem.length ? mem.shift() : { recipe: pickR(pool2) };
    var tName = target.recipe;
    th.doors.push(buildDoor(doorAngle(d), DOOR_R, tName, colorOf(target.glow, hashHue(tName)), shimmer, stone, stoneD));
  }
  th.doors.push(buildDoor(Math.PI / 2, 34.2, "__bedroom", new THREE.Color(0xf0d79a), shimmer, stone, stoneD, "the waking room"));

  // ---- the writing desk where the letters are kept ----
  buildDesk(-4.6, 17.0, iron);

  // ---- the door of light (opens when all seven are lit) ----
  var lg = new THREE.Group(); lg.position.set(0, 0.3, -5.6); buildGroup.add(lg);
  var lpanel = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.7), M(0xfff1d2, 2.4, { opacity: 0.0, transparent: true, depthWrite: false, side: THREE.DoubleSide })); lpanel.position.y = 1.35; lg.add(lpanel);
  var lframeM = M(0xf0d79a, 2.2, { opacity: 0.0, transparent: true, depthWrite: false });
  [[-0.82, 1.38, 0.08, 2.8], [0.82, 1.38, 0.08, 2.8], [0, 2.78, 1.72, 0.08]].forEach(function (b) { var m = new THREE.Mesh(new THREE.BoxGeometry(b[2], b[3], 0.08), lframeM); m.position.set(b[0], b[1], 0); lg.add(m); });
  var lglow = N2.glowSprite(0xfff0d0, 7); lglow.position.y = 1.4; lglow.material.opacity = 0; lg.add(lglow);
  var lbeam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 40, 12, 1, true), M(0xfff1d2, 2.0, { opacity: 0.0, transparent: true, depthWrite: false, side: THREE.DoubleSide })); lbeam.position.y = 20; lg.add(lbeam);
  th.light = { g: lg, panel: lpanel, frameM: lframeM, glow: lglow, beam: lbeam, k: 0, label: null };
  th.focus.push({ x: 0, z: -5.6, r: 2.4, text: function () { return th.awake ? "walk into the light — the lucid hour" : ""; } });

  th.awake = litCount() >= 7;
  if (th.awake) { applyAwake(1); }
  return {
    spawn: { x: 0, y: 0.3, z: 31.5, yaw: 0 },
    ground: function (x, z) {
      var r = Math.hypot(x, z);
      if (r < HALL_R) return { y: 0.3, on: true };
      if (Math.abs(x) < 1.6 && z > 21 && z < 34.8) return { y: 0.3, on: true };
      return { y: 0.02, on: r < 140 };
    },
    fog: { color: new THREE.Color(0x0d1630), near: 26, far: 175 }, sky: new THREE.Color(0x070b18),
    flags: {}, bounds: 96, killY: -10, desat: 0, fov: 74, sanctuary: true, noChase: true, n2story: "threshold",
    audioOverride: soundPreset("choir", P, mood)
  };
}
function buildPost(i, iron, stoneD) {
  var a = postAngle(i), x = Math.cos(a) * POST_R, z = Math.sin(a) * POST_R;
  var g = new THREE.Group(); g.position.set(x, 0.3, z); g.rotation.y = -a + Math.PI; buildGroup.add(g); // local +x points at the centre
  pCylT(g, 0, 0.25, 0, 0.32, 0.55, 0.5, stoneD, 8);
  pCyl(g, 0, 2.9, 0, 0.12, 5.4, iron, 6);
  pSph(g, 0, 5.65, 0, 0.16, iron, 6, 5);
  pBox(g, 0.5, 5.35, 0, 1.0, 0.09, 0.09, iron);
  pCyl(g, 0.95, 5.12, 0, 0.015, 0.4, iron, 4);
  // the lantern: a cage around a paper core
  var lan = new THREE.Group(); lan.position.set(0.95, 4.55, 0); g.add(lan);
  pBox(lan, 0, 0.42, 0, 0.56, 0.06, 0.56, iron); pBox(lan, 0, -0.4, 0, 0.5, 0.06, 0.5, iron);
  for (var b = 0; b < 4; b++) { var ba = b * Math.PI / 2 + Math.PI / 4; pBox(lan, Math.cos(ba) * 0.25, 0, Math.sin(ba) * 0.25, 0.045, 0.82, 0.045, iron); }
  var coreM = M(0x3b4258, 0.55);
  var core = pBox(lan, 0, 0, 0, 0.4, 0.66, 0.4, coreM);
  var flame = pSph(lan, 0, -0.08, 0, 0.09, M(0xfff2c4, 2.8), 6, 5); flame.visible = false;
  var gl = N2.glowSprite(0xffc070, 4.2); gl.material.opacity = 0; lan.add(gl);
  // world-space copies for the reflection & the floor halo
  var wp = new THREE.Vector3(); g.updateMatrixWorld(true); lan.getWorldPosition(wp);
  var refl = N2.glowSprite(0xffb060, 3.4); refl.material.opacity = 0; refl.position.set(wp.x, -wp.y, wp.z); addMesh(refl);
  var halo = new THREE.Mesh(new THREE.RingGeometry(0.6, 2.4, 32, 3), new THREE.MeshBasicMaterial({ map: haloTexture(), color: 0x6a4218, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.set(x, 0.33, z); addMesh(halo);
  var label = textSprite(ROMAN[i], "#f0d79a", 1.6); label.position.set(wp.x, wp.y + 1.05, wp.z); label.material.opacity = 0; addMesh(label); TH.textures.push(label.userData.tex);
  pushSolidCyl(x, z, 0.42, -1, 6);
  var post = { i: i, x: x, z: z, g: g, lan: lan, core: core, coreM: coreM, flame: flame, glow: gl, refl: refl, halo: halo, label: label, lit: st.lit.indexOf(i) >= 0, k: 0, ph: Math.random() * 6 };
  if (post.lit) setPostLit(post, 1);
  ix(g, x, z, 2.6, { kind: "n2lantern", examine: function () { onPost(post); } });
  TH.focus.push({ x: x, z: z, r: 2.9, text: function () { return postPrompt(post); } });
  return post;
}
function setPostLit(p, k) {
  p.k = k;
  var u = p.coreM.uniforms;
  u.uColor.value.setRGB(0.23 + (1 - 0.23) * k, 0.26 + (0.62 - 0.26) * k, 0.35 + (0.28 - 0.35) * k);
  u.uBright.value = 0.55 + k * 1.05;
  p.flame.visible = k > 0.05;
  p.glow.material.opacity = 0.85 * k; p.refl.material.opacity = 0.5 * k;
  p.halo.material.opacity = k; p.label.material.opacity = 0.75 * k;
}
function postPrompt(p) {
  if (p.lit) return "the " + ORD[st.lit.indexOf(p.i)] + " lantern · " + CHAPTERS[st.lit.indexOf(p.i)];
  if (earned() > litCount()) return "press E to light the lantern";
  var need = (litCount() + 1) * PER - shardCount();
  return "a dark lantern · " + need + " more letter" + (need === 1 ? "" : "s") + " to light it";
}
function onPost(p) {
  if (!TH) return;
  if (p.lit) { var li = st.lit.indexOf(p.i); hint(LANTERN_LINES[li] || "it burns quietly."); tone(392, 0, 1.6, 0.04); return; }
  if (earned() <= litCount()) {
    var need = (litCount() + 1) * PER - shardCount();
    hint(pickR(["it doesn't take matches. it takes being remembered.", "the lantern is cold. " + need + " more letters, and it will remember how.", "you hold your hand near it. nothing, yet."]));
    tone(147, 0, 1.4, 0.04, "triangle"); return;
  }
  st.lit.push(p.i); save();
  var n = litCount();
  p.lit = true; p.lighting = 0.0001;
  chord([392, 493.9, 587.3, 784], 0.16, 3.4, 0.06, "triangle"); tone(196, 0, 4.2, 0.05);
  flash(0.4);
  bigWhisper("the " + ORD[n - 1] + " lantern", ROMAN[n - 1] + " · " + CHAPTERS[n - 1]);
  setTimeout(function () { if (TH) showLetter("the other sleeper", LANTERN_LINES[n - 1], 6500); }, 1800);
  pingHud(8);
  try { N2.emit("lanternLit", n); } catch (e) {}
  if (n >= 7) setTimeout(function () { if (TH && !TH.awake && TH.wake < 0) TH.wake = 0; }, 3600);
}
function examineSleeper() {
  if (!TH || TH.awake || TH.wake >= 0) return;
  var n = litCount(), set = n === 0 ? SLEEPER_LINES[0] : n < 4 ? SLEEPER_LINES[1] : SLEEPER_LINES[2];
  hint(set[TH.lineIdx++ % set.length]);
  tone(130.8, 0, 2.4, 0.035); tone(196, 0.3, 2.4, 0.025);
}
function buildDoor(a, R, target, col, shimmer, stone, stoneD, title) {
  var x = Math.cos(a) * R, z = Math.sin(a) * R;
  var phi = Math.atan2(-Math.cos(a), -Math.sin(a));             // panel normal faces the centre
  var g = new THREE.Group(); g.position.set(x, 0.3, z); g.rotation.y = phi; buildGroup.add(g);
  pBox(g, -0.9, 1.45, 0, 0.26, 2.9, 0.4, stone); pBox(g, 0.9, 1.45, 0, 0.26, 2.9, 0.4, stone);
  pBox(g, 0, 3.0, 0, 2.1, 0.32, 0.46, stoneD); pBox(g, 0, 0.04, 0, 2.0, 0.08, 0.6, stoneD);
  var pm = objMat({ map: shimmer, color: col, bright: 1.55, opacity: 0.72, transparent: true, depthWrite: false, side: THREE.DoubleSide, scroll: new THREE.Vector2(0, 0.06) });
  var panel = new THREE.Mesh(new THREE.PlaneGeometry(1.54, 2.78), pm); panel.position.y = 1.43; g.add(panel);
  var gl = N2.glowSprite(col.getHex(), 3.2); gl.material.opacity = 0.32; gl.position.set(0, 1.4, 0.15); g.add(gl);
  var refl = N2.glowSprite(col.getHex(), 2.6); refl.material.opacity = 0.22; refl.position.set(x, -1.5, z); addMesh(refl);
  var label = textSprite(title || N2.prettyName(target), "#" + col.getHexString(), 4.2); label.position.set(x, 3.75, z); addMesh(label);
  TH.textures.push(label.userData.tex);
  // jamb colliders (world space)
  var tx = -Math.sin(a), tz = Math.cos(a);
  pushSolidCyl(x + tx * 0.9, z + tz * 0.9, 0.22, -1, 3.2); pushSolidCyl(x - tx * 0.9, z - tz * 0.9, 0.22, -1, 3.2);
  return { x: x, z: z, a: a, tx: tx, tz: tz, nx: -Math.cos(a), nz: -Math.sin(a), target: target, panel: panel, pm: pm, glow: gl, ph: Math.random() * 6 };
}
function buildDesk(x, z, iron) {
  var g = new THREE.Group(); g.position.set(x, 0.3, z); g.rotation.y = 0.5; buildGroup.add(g);
  var wood = M(0x4a3a2e, 0.85), paper = M(0xe9e2cc, 1.25);
  pBox(g, 0, 0.82, 0, 1.4, 0.07, 0.75, wood);
  [[-0.64, -0.32], [0.64, -0.32], [-0.64, 0.32], [0.64, 0.32]].forEach(function (l) { pBox(g, l[0], 0.4, l[1], 0.06, 0.8, 0.06, wood); });
  var h = 0.02 + Math.min(TOTAL, shardCount()) * 0.0045;
  pBox(g, -0.25, 0.86 + h / 2, 0, 0.34, h, 0.24, paper);
  for (var i = 0; i < Math.min(5, shardCount()); i++) { var sh = pBox(g, 0.18 + i * 0.07, 0.862, -0.05 + (i % 2) * 0.08, 0.3, 0.004, 0.22, paper); sh.rotation.y = (i - 2) * 0.22; }
  pCyl(g, 0.5, 0.92, 0.2, 0.04, 0.12, iron, 6);
  var candle = pCyl(g, 0.5, 0.95, -0.2, 0.035, 0.18, M(0xe9e2cc, 1.1), 6);
  var flame = pSph(g, 0.5, 1.08, -0.2, 0.03, M(0xffe2a0, 2.6), 5, 4);
  var gl = N2.glowSprite(0xffd28a, 1.4); gl.position.set(0.5, 1.08, -0.2); g.add(gl);
  // chair
  pBox(g, 0, 0.46, 0.62, 0.48, 0.05, 0.44, wood); pBox(g, 0, 0.9, 0.84, 0.48, 0.85, 0.05, wood);
  [[-0.21, 0.42], [0.21, 0.42], [-0.21, 0.82], [0.21, 0.82]].forEach(function (l) { pBox(g, l[0], 0.23, l[1], 0.04, 0.46, 0.04, wood); });
  pushSolidCyl(x, z, 0.72, -1, 1.2);
  void candle; void flame;
  ix(g, x, z, 2.6, { kind: "n2desk", examine: function () { if (!shardCount()) { hint("an empty desk. the paper is waiting."); return; } tone(523.3, 0, 1.2, 0.04); openLetters(); } });
  TH.focus.push({ x: x, z: z, r: 2.6, text: function () { return shardCount() ? "press E to read the letters (" + shardCount() + ")" : "a writing desk, and a candle that never shortens"; } });
}
function applyAwake(k) {
  var th = TH; if (!th) return;
  var f = th.fig;
  // the sleeper is gone ahead; a folded cloth remains on the bier
  f.hip.visible = f.legs.visible = k < 1; f.cloth.position.set(0.35, -0.12, 0); f.cloth.scale.set(0.32, 0.4, 0.6);
  setLight(k);
}
function setLight(k) {
  var L = TH && TH.light; if (!L) return; L.k = k;
  L.panel.material.uniforms.uOpacity.value = 0.92 * k; L.frameM.uniforms.uOpacity.value = k;
  L.glow.material.opacity = 0.75 * k; L.beam.material.uniforms.uOpacity.value = 0.06 * k;
}
function updateThreshold(dt) {
  var th = TH; if (!th) return;
  th.t += dt; var t = tNow();
  // lanterns: flicker lit cores, ease newly-lit ones in
  for (var i = 0; i < th.posts.length; i++) {
    var p = th.posts[i];
    if (p.lighting) { p.lighting += dt; setPostLit(p, clamp(p.lighting / 1.6, 0, 1)); if (p.lighting >= 1.6) p.lighting = 0; }
    if (p.lit && !p.lighting) { var fl = 0.92 + 0.08 * Math.sin(t * 7.3 + p.ph) * Math.sin(t * 3.1 + p.ph * 2); p.coreM.uniforms.uBright.value = 1.6 * fl; p.glow.material.opacity = 0.8 * fl; p.lan.rotation.z = Math.sin(t * 0.7 + p.ph) * 0.03; }
  }
  for (var d = 0; d < th.doors.length; d++) { var dr = th.doors[d]; dr.glow.material.opacity = 0.26 + 0.1 * Math.sin(t * 1.3 + dr.ph); }
  for (var m = 0; m < th.motes.length; m++) { var mo = th.motes[m]; mo.a += dt * mo.v; mo.h = (mo.h + dt * 0.22) % 3.6; mo.s.position.set(Math.cos(mo.a) * mo.r, 1.2 + mo.h, Math.sin(mo.a) * mo.r); mo.s.material.opacity = Math.sin(mo.h / 3.6 * Math.PI) * (th.awake ? 0.35 : 0.8); }
  var f = th.fig;
  if (!th.awake && th.wake < 0) { var br = Math.sin(t * 0.9); f.torso.scale.y = 0.62 + br * 0.03; f.cloth.scale.y = 1 + br * 0.04; }
  if (th.wake >= 0 && !th.awake) wakeStep(dt);
  if (th.awake) { var L = th.light; if (L.k < 1) setLight(Math.min(1, L.k + dt * 0.35)); L.panel.material.uniforms.uBright.value = 2.3 + 0.2 * Math.sin(t * 1.7); }
  // doors: walk through one
  if (phase === "play" && th.t > 1.2 && !th.leaving) {
    for (var k = 0; k < th.doors.length; k++) {
      var o = th.doors[k], dx = pos.x - o.x, dz = pos.z - o.z, lat = dx * o.tx + dz * o.tz, dep = dx * o.nx + dz * o.nz;
      if (Math.abs(lat) < 0.72 && Math.abs(dep) < 0.32 && pos.y < 3) { th.leaving = true; leaveThreshold(o.target); return; }
    }
    if (th.awake && th.light.k > 0.6 && Math.hypot(pos.x - 0, pos.z + 5.6) < 0.95) { th.leaving = true; chord([523.3, 659.3, 784, 1046.5], 0.2, 4, 0.05); doWarp({ b: 0.8, e: -0.2 }, "lucidhour", L_NAME); }
  }
}
function leaveThreshold(target) {
  tone(target === "__bedroom" ? 261.6 : 329.6, 0, 2.2, 0.05, "triangle");
  doWarp({ b: 0.15, e: 0.05 }, "threshold", target);
  if (TH && phase !== "transition") TH.leaving = false;   // the warp was refused by someone
}
// the seventh light: the sleeper stirs, sits up, and goes ahead into the light
function wakeStep(dt) {
  var th = TH, f = th.fig, w = th.wake, w2 = w + dt; th.wake = w2;
  function at(s) { return w < s && w2 >= s; }
  if (at(0.01)) { hint("the seventh light catches. the hall holds its breath."); chord([196, 246.9, 293.7, 392, 493.9], 0.35, 6, 0.05, "triangle"); }
  if (w2 > 2.0 && w2 < 6.5) { var k = clamp((w2 - 2.0) / 4.0, 0, 1); f.cloth.position.set(k * 1.3, -k * 0.5, 0); f.clothM.uniforms.uOpacity.value = 0.94 * (1 - k * 0.85); }
  if (w2 > 3.5 && w2 < 7.5) { var s = clamp((w2 - 3.5) / 3.5, 0, 1), e = s * s * (3 - 2 * s); f.hip.rotation.z = -e * 1.3; }
  if (at(6.0)) showLetter("the other sleeper", "…oh. it's you.", 4200);
  if (at(10.5)) showLetter("the other sleeper", "you carried all of it. i can feel it coming back, like warmth into cold hands.", 6400);
  if (w2 > 15 && w2 < 18.5) {
    var q = clamp((w2 - 15) / 3.5, 0, 1);
    [f.bodyM, f.skinM, f.hairM].forEach(function (m) { m.transparent = true; m.depthWrite = false; m.uniforms.uOpacity.value = 1 - q; });
    for (var i = 0; i < th.motes.length; i++) th.motes[i].v = 0.4 + q * 1.4;
    setLight(q * 0.8);
  }
  if (at(15.2)) chord([523.3, 659.3, 784], 0.25, 4, 0.045);
  if (at(18.6)) { applyAwake(1); th.awake = true; showLetter("the other sleeper", "there's an hour i want to show you. walk into the light.", 7000); }
}

/* =========================================================== THE LUCID HOUR */
var LH = null, lhTicket = false;
var PATH_END = -138, DOOR_Z = -143.5;
function buildLucidHour(P, mood) {
  // only a real way in (the threshold's light, or the debug bridge) arms the ending: a dream replayed
  // from memory must never run the credits again
  var lh = LH = { t: 0, fig: null, lanterns: [], said: -1, ending: false, walkedOff: false, leave: -1, finalSaid: false, armed: lhTicket };
  lhTicket = false;
  P.sky.set(0x0b1030); P.fog = new THREE.Color(0x141838); P.glow.set(0xf3c99a); P.accent.set(0x8fd0d2); P.wallA.set(0xb8b0c8); P.wallB.set(0x4a4466); P.ground.set(0x2a2c48); P.figure.set(0x1c2238);
  var wm = objMat({ map: waterTex("#3a4470", "#6a72a0", "#e9d8e8"), color: 0xb0b8d8, bright: 0.8, scroll: new THREE.Vector2(0.002, 0.004) });
  setRepeat(wm, 52, 52);
  wm.polygonOffset = true; wm.polygonOffsetFactor = 2; wm.polygonOffsetUnits = 2;
  lh.water = new THREE.Mesh(new THREE.PlaneGeometry(416, 416, 32, 32), wm); lh.water.rotation.x = -Math.PI / 2; addMesh(lh.water); lh.wm = wm; lh.skyC = new THREE.Color(); lh.fogC = new THREE.Color();
  lh.stars = starField(420, 230, 0.05, false);
  var stoneM = M(0xb4aec6, 0.9), edgeM = M(0x7a7698, 0.9);
  for (var z = 2; z > PATH_END; z -= 2.2) { var tile = box(0, 0.12, z, 2.7, 0.24, 1.95, stoneM); tile.rotation.y = (Math.random() - 0.5) * 0.04; }
  // the island and the door
  cyl(0, 0.14, DOOR_Z + 1.5, 5.2, 0.3, stoneM, 28); cyl(0, -0.05, DOOR_Z + 1.5, 5.6, 0.2, edgeM, 28);
  var dg = new THREE.Group(); dg.position.set(0, 0.3, DOOR_Z); buildGroup.add(dg);
  var frameM = M(0x8a8a84, 1.0), leafM = M(0xd2d2cc, 1.05);
  pBox(dg, -0.58, 1.15, 0, 0.12, 2.42, 0.18, frameM); pBox(dg, 0.58, 1.15, 0, 0.12, 2.42, 0.18, frameM); pBox(dg, 0, 2.4, 0, 1.28, 0.14, 0.18, frameM);
  var warm = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 2.28), M(0xffe6b8, 2.5, { side: THREE.DoubleSide })); warm.position.set(0, 1.14, -0.04); dg.add(warm);
  var hinge = new THREE.Group(); hinge.position.set(-0.52, 0, 0.02); dg.add(hinge);
  var leaf = pBox(hinge, 0.52, 1.12, 0, 1.02, 2.24, 0.05, leafM); pBox(hinge, 0.52, 1.6, 0.03, 0.62, 0.66, 0.02, M(0xc6c6c0, 1.0)); pBox(hinge, 0.52, 0.7, 0.03, 0.62, 0.66, 0.02, M(0xc6c6c0, 1.0));
  pSph(hinge, 0.92, 1.05, 0.05, 0.05, M(0xc8b888, 1.3), 6, 5);
  hinge.rotation.y = 0.55; void leaf;
  var dglow = N2.glowSprite(0xffe2b0, 5.5); dglow.material.opacity = 0.55; dglow.position.set(0, 1.3, DOOR_Z - 0.3); addMesh(dglow);
  lh.door = { g: dg, hinge: hinge, glow: dglow };
  // seven lanterns float alongside the path, lit
  for (var i = 0; i < 7; i++) {
    var lz = -16 - i * 17.5, lx = (i % 2 ? 3.4 : -3.4);
    var lg = new THREE.Group(); lg.position.set(lx, 1.7, lz); buildGroup.add(lg);
    pBox(lg, 0, 0, 0, 0.42, 0.62, 0.42, M(0xe0782c, 1.35)); pBox(lg, 0, 0.36, 0, 0.5, 0.05, 0.5, M(0x3a3046, 0.9)); pBox(lg, 0, -0.36, 0, 0.46, 0.05, 0.46, M(0x3a3046, 0.9));
    var gs = N2.glowSprite(0xffb868, 3.6); gs.material.opacity = 0.8; lg.add(gs);
    var wg = N2.glowSprite(0xffa860, 2.6); wg.material.opacity = 0.35; wg.position.set(lx, 0.06, lz); addMesh(wg);
    lh.lanterns.push({ g: lg, y: 1.7, ph: i * 0.9 });
  }
  // sun (unfogged sprites; hidden by the water until it rises), its glitter path
  lh.sun = N2.glowSprite(0xfff2d8, 26); lh.sun.material.opacity = 0; addMesh(lh.sun);
  lh.sunHalo = N2.glowSprite(0xffc890, 120); lh.sunHalo.material.opacity = 0; addMesh(lh.sunHalo);
  var glit = new THREE.Mesh(new THREE.PlaneGeometry(10, 170, 1, 8), new THREE.MeshBasicMaterial({ map: canvasT(64, 4, function (x, w, h) { var gr = x.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, w, h); }, true), color: 0xc88a5a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  glit.rotation.x = -Math.PI / 2; glit.position.y = 0.04; addMesh(glit); lh.glitter = glit;
  // the other sleeper, walking ahead of you
  var fg = new THREE.Group(); buildGroup.add(fg);
  var sil = M(0x1c2238, 0.85, { transparent: true, opacity: 1 });
  var body = new THREE.Group(); fg.add(body);
  pCylT(body, 0, 1.0, 0, 0.2, 0.27, 0.95, sil, 8); pSph(body, 0, 1.6, 0, 0.17, sil, 8, 6);
  pCylT(body, 0, 0.5, 0, 0.24, 0.16, 0.55, sil, 8);                                   // a long coat
  var legL = pCyl(body, -0.09, 0.2, 0, 0.06, 0.42, sil, 5), legR = pCyl(body, 0.09, 0.2, 0, 0.06, 0.42, sil, 5);
  var rim = N2.glowSprite(0xffd8b0, 2.6); rim.material.opacity = 0.35; rim.position.set(0, 1.15, -0.25); fg.add(rim);
  fg.position.set(0, 0.24, -12);
  lh.fig = { g: fg, mat: sil, rim: rim, legL: legL, legR: legR, z: -12, x: 0, walk: 0, fade: 1 };
  return {
    spawn: { x: 0, y: 0.24, z: 0, yaw: 0 },
    ground: function (x, z) {
      if (Math.abs(x) < 1.4 && z < 3 && z > PATH_END - 0.8) return { y: 0.24, on: true };
      if (Math.hypot(x, z - (DOOR_Z + 1.5)) < 5.2) return { y: 0.3, on: true };
      return { y: 0.02, on: true };
    },
    fog: { color: new THREE.Color(0x141838), near: 24, far: 170 }, sky: new THREE.Color(0x0b1030),
    flags: {}, bounds: 0, killY: -10, desat: 0, fov: 72, sanctuary: true, noChase: true, n2story: "lucidhour",
    audioOverride: soundPreset("bells", P, mood)
  };
}
var SKY_STOPS = [[0, 0x0b1030, 0x141838], [0.42, 0x2e2a5c, 0x3a3462], [0.75, 0x9c6a86, 0x8c6c8e], [1, 0xf2c49a, 0xe8b894]];
var _c0 = new THREE.Color(), _c1 = new THREE.Color();
function rampAt(p, idx, out) {
  for (var i = 1; i < SKY_STOPS.length; i++) if (p <= SKY_STOPS[i][0] || i === SKY_STOPS.length - 1) {
    var a = SKY_STOPS[i - 1], b = SKY_STOPS[i], k = clamp((p - a[0]) / (b[0] - a[0]), 0, 1);
    return out.set(a[idx]).lerp(_c1.set(b[idx]), k);
  }
  return out.set(SKY_STOPS[0][idx]);
}
function updateLucidHour(dt) {
  var lh = LH; if (!lh) return;
  lh.t += dt; var t = tNow();
  // you cannot wander off the edge of the morning
  if (phase === "play") { pos.x = clamp(pos.x, -46, 46); if (pos.z > 12) pos.z = 12; if (pos.z < DOOR_Z - 26) pos.z = DOOR_Z - 26; }
  var p = clamp(-pos.z / -PATH_END, 0, 1), pe = p * p * (3 - 2 * p);
  var sky = rampAt(pe, 1, lh.skyC), fog = rampAt(pe, 2, lh.fogC);
  try { renderer.setClearColor(sky, 1); U_fog.value.copy(fog); dreamFogColor = fog; dreamSky = sky; U_fogDist.value.set(24 + pe * 10, 170 + pe * 60); } catch (e) {}
  lh.wm.uniforms.uColor.value.setRGB(0.55, 0.6, 0.8).lerp(_c0.set(0xffd2b0), pe * 0.85); lh.wm.uniforms.uBright.value = 0.7 + pe * 0.55;
  lh.water.position.set(Math.round(pos.x / 8) * 8, 0, Math.round(pos.z / 8) * 8);
  lh.stars.material.opacity = 0.85 * (1 - clamp(pe * 1.6, 0, 1));
  var sunY = -14 + pe * 22, sunZ = pos.z - 175;
  lh.sun.position.set(0, sunY, sunZ); lh.sunHalo.position.set(0, sunY, sunZ);
  lh.sun.material.opacity = clamp(pe * 1.8 - 0.3, 0, 1); lh.sunHalo.material.opacity = clamp(pe * 0.8 - 0.1, 0, 0.55);
  lh.glitter.position.set(0, 0.04, pos.z - 92); lh.glitter.material.opacity = clamp(pe * 1.2 - 0.3, 0, 0.75) * (0.85 + 0.15 * Math.sin(t * 2.7));
  for (var i = 0; i < lh.lanterns.length; i++) { var L = lh.lanterns[i]; L.g.position.y = L.y + Math.sin(t * 0.8 + L.ph) * 0.18; L.g.rotation.y = t * 0.2 + L.ph; }
  lh.door.glow.material.opacity = 0.5 + 0.12 * Math.sin(t * 1.4);
  // the lines, one per stretch of the path
  var seg = Math.floor((-pos.z - 6) / 19);
  if (seg > lh.said && seg < LUCID_LINES.length && seg >= 0) { lh.said = seg; showLetter("the other sleeper", LUCID_LINES[seg], 7600); tone(392 * Math.pow(1.122, seg % 5), 0, 2.6, 0.035, "triangle"); }
  // the figure keeps ahead of you, then waits by the door, then walks into the sunrise
  var f = lh.fig;
  if (f.fade > 0) {
    var want, moving = false;
    if (lh.leave < 0) {
      want = Math.max(PATH_END + 1, Math.min(f.z, pos.z - 11));
      if (want < f.z - 0.01) { f.z = Math.max(want, f.z - 4.6 * dt); moving = true; }
      f.g.position.set(0.9, 0.24, f.z);
      f.g.rotation.y = (f.z <= PATH_END + 1.2 && pos.z - f.z < 14) ? Math.PI : 0;  // turns round to wait for you
      if (f.z <= PATH_END + 1.2 && pos.z < PATH_END + 9) { lh.leave = 0; showLetter("the other sleeper", DOOR_LINE, 8200); chord([261.6, 329.6, 392, 523.3], 0.3, 5, 0.045, "triangle"); }
    } else {
      lh.leave += dt;
      if (lh.leave > 4.5) {
        moving = true; var dir = Math.atan2(26, -40);
        f.x += Math.sin(dir) * 1.5 * dt; f.z += Math.cos(dir) * 1.5 * dt;
        f.g.position.set(0.9 + f.x, 0.24, f.z); f.g.rotation.y = dir + Math.PI;
        f.fade = clamp(1 - (lh.leave - 7) / 9, 0, 1);
        f.mat.uniforms.uOpacity.value = f.fade; f.mat.depthWrite = f.fade > 0.98; f.rim.material.opacity = 0.35 * f.fade;
        if (f.fade <= 0) { f.g.visible = false; }
      }
    }
    if (moving) { f.walk += dt * 6; f.legL.position.z = Math.sin(f.walk) * 0.12; f.legR.position.z = -Math.sin(f.walk) * 0.12; f.g.position.y = 0.24 + Math.abs(Math.sin(f.walk)) * 0.03; }
  }
  // step off the path once and the water holds you
  if (!lh.wet && Math.abs(pos.x) > 1.6 && pos.z > PATH_END) { lh.wet = true; hint("the water holds you up. it always did."); }
  // the door home
  if (phase === "play" && !lh.ending && Math.hypot(pos.x, pos.z - DOOR_Z) < 1.0) {
    lh.ending = true;
    if (lh.armed) triggerEnding();
    else { hint("the door is only painted here. you remember it better than this."); }
  }
}

/* =================================================================== ending */
var endingOn = false;
function triggerEnding() {
  if (endingOn) return; endingOn = true; N2.storyEnding = true;
  hideLetter();
  // nothing may stay open over (or under) the ending
  try { var _g = 0; while (N2.ui.top() && _g++ < 12) N2.ui.close(N2.ui.top()); } catch (e) {}
  st.completed = true; st.newGamePlus = true; st.endings = (st.endings || 0) + 1; st.sillSeen = false; save();
  try { N2.emit("ending"); } catch (e) {}
  chord([261.6, 329.6, 392, 493.9, 587.3], 0.5, 8, 0.05, "triangle"); tone(130.8, 0, 9, 0.05);
  // hold the world still behind a white fade; the base resumes when graphTimer runs out
  phase = "graph"; graphTimer = 1e9; fadeTarget = 1;
  for (var k in keys) keys[k] = false;
  try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {}
  var done = false, finish = function () {
    if (done) return; done = true; endingOn = false; N2.storyEnding = false;
    try { var _g = 0; while (N2.ui.top() && _g++ < 12) N2.ui.close(N2.ui.top()); } catch (e) {}
    // close the night properly (as startGraph would) so journal, lantern oil, lucid and title all see it end
    var gp = null;
    try {
      gp = { day: day, x: clamp(tanh(dayMood.e * 0.25), -1, 1), y: clamp(tanh(dayMood.b * 0.25), -1, 1) };
      graphHistory.push(gp); if (graphHistory.length > 64) graphHistory.shift();
    } catch (e) {}
    day++; saveNight(); applyNightProgression(); dayMood = { b: 0, e: 0 }; warpsToday = 0;
    try { N2.emit("nightEnd", day - 1, gp); } catch (e) {}
    LH = null; graphTimer = 0;        // → base builds the waking room and fades in
  };
  setTimeout(function () {
    var T = N2.mods.title, used = false;
    try { if (T && typeof T.showEnding === "function") { T.showEnding(ENDING_LINES.slice(), finish); used = true; } } catch (e) { used = false; }
    if (!used) fallbackEnding(ENDING_LINES, finish);
    setTimeout(finish, 300000);      // never strand the player if a sequence forgets to call back
  }, 2600);
}
var endEl = null, endSkip = false, endCb = null;
function fallbackEnding(lines, cb) {
  endCb = cb; endSkip = false;
  if (endEl && endEl.parentNode) endEl.parentNode.removeChild(endEl);
  endEl = N2.ui.el("div", "", "", document.body); endEl.id = "n2s-end";
  var els = [], crStart = lines.indexOf(ENDING_LINES[12]);
  for (var i = 0; i < lines.length; i++) { var d = N2.ui.el("div", "ln" + (crStart >= 0 && i >= crStart ? (i === crStart ? " big" : " cr") : ""), "", endEl); d.textContent = lines[i] || " "; els.push(d); }
  var sk = N2.ui.el("div", "sk", "click or press any key to wake", endEl);
  requestAnimationFrame(function () { endEl.classList.add("on"); });
  var i2 = 0, tick = function () {
    if (!endEl) return;
    if (i2 < els.length) { els[i2].classList.add("on"); var blank = !lines[i2]; i2++; setTimeout(tick, blank ? 1400 : 2700); }
    else { sk.classList.add("on"); endSkip = true; setTimeout(closeEnding, 16000); }
  };
  setTimeout(tick, 1800);
  setTimeout(function () { endSkip = true; sk.classList.add("on"); }, 9000);
  endEl.addEventListener("mousedown", function (e) { e.stopPropagation(); if (endSkip) closeEnding(); });
}
function closeEnding() {
  if (!endEl) return;
  var el = endEl; endEl = null; el.classList.remove("on");
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2500);
  var cb = endCb; endCb = null; if (cb) cb();
}

/* ============================================================== the bedroom */
var DOOR_X = -3.32, DOOR_Z2 = 7.75;
var bedDoor = null;
function decorateBedroom(z) {
  bedDoor = null;
  var g = z.group; if (!g) return;
  var showDoor = day >= 3 || shardCount() >= PER || st.completed;
  if (showDoor) {
    var dg = new THREE.Group(); dg.position.set(DOOR_X, 0, DOOR_Z2); g.add(dg);
    var frameM = M(0x22303e, 0.85), leafM = M(0x3a5a76, 0.92), seamM = M(0xffe6b0, 2.5);
    pBox(dg, 0.02, 1.16, -0.56, 0.08, 2.34, 0.1, frameM); pBox(dg, 0.02, 1.16, 0.56, 0.08, 2.34, 0.1, frameM); pBox(dg, 0.02, 2.36, 0, 0.08, 0.1, 1.22, frameM);
    pBox(dg, 0, 1.11, 0, 0.05, 2.2, 1.02, leafM);
    pBox(dg, 0.03, 1.55, 0, 0.02, 0.7, 0.66, M(0x34536e, 0.9)); pBox(dg, 0.03, 0.66, 0, 0.02, 0.7, 0.66, M(0x34536e, 0.9));
    pSph(dg, 0.07, 1.06, 0.38, 0.045, M(0xc8b080, 1.3), 6, 5);
    pBox(dg, 0.05, 0.015, 0, 0.06, 0.03, 1.0, seamM);                  // light under the door
    pBox(dg, 0.035, 1.1, -0.515, 0.02, 2.2, 0.015, seamM); pBox(dg, 0.035, 2.215, 0, 0.02, 0.015, 1.0, seamM);
    var gl = N2.glowSprite(0xffd8a0, 1.8); gl.material.opacity = 0.55; gl.position.set(0.25, 0.08, 0); dg.add(gl);
    var spill = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.05), M(0xffe0a8, 1.6, { opacity: 0.2, transparent: true, depthWrite: false })); spill.rotation.x = -Math.PI / 2; spill.position.set(0.36, 0.025, 0); dg.add(spill);
    bedThings.push({ x: -2.75, z: DOOR_Z2, r: 1.25, kind: "n2door", prompt: st.doorSeen ? "press E to go down to the threshold" : "press E to open the door that wasn't there" });
    bedDoor = { g: dg, glow: gl, t: 0 };
    startHum(110, 0.035);
    if (!st.doorAnnounced) {
      st.doorAnnounced = true; save();
      setTimeout(function () { if (inBedroom && bedDoor) { hint("there's a door in the hall that wasn't there before."); N2.ui.toast("a door that wasn't there", "the hallway, past the console table"); } }, 4200);
    }
  }
  if (st.completed) {
    // a small permanent change: their paper lantern on your windowsill, and a folded note
    var sg = new THREE.Group(); sg.position.set(3.42, 1.05, 0.62); g.add(sg);
    pBox(sg, 0, 0.11, 0, 0.12, 0.18, 0.12, M(0xffa04a, 1.55)); pBox(sg, 0, 0.215, 0, 0.15, 0.025, 0.15, M(0x3a3046, 0.9)); pBox(sg, 0, 0.012, 0, 0.14, 0.024, 0.14, M(0x3a3046, 0.9));
    var sgl = N2.glowSprite(0xffc078, 1.2); sgl.material.opacity = 0.6; sgl.position.y = 0.11; sg.add(sgl);
    var note = pBox(sg, 0, 0.006, -0.36, 0.11, 0.01, 0.16, M(0xeee8d6, 1.15)); note.rotation.y = 0.15;
    bedThings.push({ x: 2.75, z: 0.45, r: 1.05, kind: "n2sill", prompt: "press E to read the note on the windowsill" });
    if (!st.sillSeen) setTimeout(function () { if (inBedroom) hint("something has been left on the windowsill."); }, 6500);
  }
}
function updateBedroom(dt) {
  if (!bedDoor) return;
  bedDoor.t += dt;
  bedDoor.glow.material.opacity = 0.45 + 0.15 * Math.sin(bedDoor.t * 1.1);
  steerHum(DOOR_X, 0.6, DOOR_Z2, 9);
}

/* ===================================================================== hooks */
N2.registerWorld(T_NAME, buildThreshold, { hidden: true, valence: 1, title: "the threshold", tags: ["story", "hub"] });
N2.registerWorld(L_NAME, buildLucidHour, { hidden: true, valence: 1, title: "the lucid hour", tags: ["story", "ending"] });

var focusOn = null;
function updateFocus() {
  var list = TH ? TH.focus : null;
  if (!list || !hintEl) { focusOn = null; return; }
  var best = null, bd = 99;
  for (var i = 0; i < list.length; i++) { var f = list[i], d = Math.hypot(f.x - pos.x, f.z - pos.z); if (d < f.r && d < bd) { var tx = f.text(); if (tx) { bd = d; best = tx; } } }
  if (best !== focusOn) {
    if (best) { hintEl.textContent = best; hintEl.style.opacity = "0.9"; if (_hintTimer) { clearTimeout(_hintTimer); _hintTimer = null; } }
    else if (focusOn && hintEl.textContent === focusOn) hintEl.style.opacity = "0";
    focusOn = best;
  }
}

N2.on("dreamBuilt", function (z) {
  try {
    clearShard(); bedDoor = null;
    if (focusOn && hintEl && hintEl.textContent === focusOn) hintEl.style.opacity = "0";
    focusOn = null;
    var mine = zoneMine(z);
    if (!z || z.archetypeName !== T_NAME) { retire(TH); TH = null; }
    for (var i = 0; i < deadTex.length; i++) { try { deadTex[i].dispose(); } catch (e) {} } deadTex = [];
    if (z && z.archetypeName !== L_NAME) LH = null;
    if (mine) {
      pullMode = false;                                        // a still place: nothing pulls you onward here
      if (savedEmergentCD == null) savedEmergentCD = emergentCD; emergentCD = 1e9;
      hudForce = z.archetypeName === T_NAME; pingHud(6);
      if (z.archetypeName === T_NAME) {
        st.visits = (st.visits || 0) + 1; st.doorSeen = true; save();
        var un = earned() - litCount();
        setTimeout(function () {
          if (!TH) return;
          if (st.visits === 1) N2.ui.toast("the threshold", "a round hall under all the dreams", 4200);
          if (un > 0 && !TH.awake) setTimeout(function () { if (TH) hint(un === 1 ? "you remember enough to light one lantern." : "you remember enough to light " + un + " lanterns."); }, 4600);
          else if (!TH.awake && st.visits <= 2 && shardCount() < PER) setTimeout(function () { if (TH) hint("seven lanterns, all dark. seven letters will light one."); }, 4600);
        }, 1400);
      }
      return;
    }
    if (savedEmergentCD != null) { emergentCD = Math.max(60, savedEmergentCD); savedEmergentCD = null; }
    hudForce = false;
    if (z && z.bedroom) { decorateBedroom(z); return; }
    spawnShard(false);
  } catch (e) { if (window.console) console.error("[N2] story dreamBuilt", e); }
});
N2.on("warp", function (nudge, kind, target) { stopHum(); if (target === L_NAME && kind === "lucidhour") lhTicket = true; });
N2.on("play", function (dt) {
  try {
    updateShard(dt);
    if (TH) { updateThreshold(dt); updateFocus(); }
    if (LH) updateLucidHour(dt);
    if (inBedroom) updateBedroom(dt);
  } catch (e) { if (!S._errLogged) { S._errLogged = true; if (window.console) console.error("[N2] story play", e); } }
});
N2.on("frame", function (dt) {
  try {
    updateHud(dt);
    if (hum && (paused || N2.uiOpen || phase !== "play")) hum.out.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.08);
  } catch (e) {}
});
// E near a shard picks it up (even if something else is nearer)
N2.on("examine", function () {
  try { if (shard && !shard.got && Math.hypot(shard.x - pos.x, shard.z - pos.z) < 3.0) { collectShard(); return true; } } catch (e) {}
  return false;
}, 20);
N2.on("bedroomInteract", function (t) {
  try {
    if (!t) return false;
    if (t.kind === "n2door") {
      st.doorSeen = true; save();
      hint(pickR(["the handle is warm.", "it opens inward, onto stairs going down.", "you hear water, very far below."]));
      try { audio.stopRain(); if (audio.menuMusic) audio.stopMenu(); if (audio.stopBedroom) audio.stopBedroom(); } catch (e) {}
      tone(220, 0, 2.4, 0.05, "triangle"); tone(329.6, 0.25, 2.4, 0.04, "triangle");
      doWarp({ b: 0.2, e: -0.1 }, "threshold", T_NAME);
      return true;
    }
    if (t.kind === "n2sill") {
      st.sillSeen = true; save();
      showLetter("a note on the windowsill", POSTSCRIPT, 14000);
      tone(523.3, 0, 2, 0.04); return true;
    }
  } catch (e) {}
  return false;
});
// story worlds are still places: nothing shoves you onward except their own doors
var BLOCK_KINDS = { drift: 1, wall: 1, edge: 1, fall: 1, bright: 1, dark: 1, figure: 1, object: 1, pillar: 1, portal: 1, door: 1 };
N2.on("beforeWarp", function (nudge, kind) {
  try { if (hereMine() && (BLOCK_KINDS[kind] || kind == null) && !endingOn) return true; } catch (e) {}
  return false;
}, 50);
// once the story has begun, the Threshold sometimes finds you on its own
N2.on("commitTransition", function (nudge, target) {
  try {
    // the story's own places don't use up the night's dreams
    if (target && isMine(target)) { warpsToday = Math.max(-1, warpsToday - 1); return; }
    if (target || inBedroom || hereMine() || endingOn) return;
    if (shardCount() >= PER && warpsToday + 1 < DAY_LENGTH && Math.random() < 0.05) pendingTarget = T_NAME;
  } catch (e) {}
});
N2.on("keydown", function (e) {
  if (endEl) { if (endSkip) closeEnding(); return true; }
  return false;
}, 90);

/* ====================================================================== api */
S.total = TOTAL;
S.shards = function () { return shardCount(); };
S.fragments = function () { return st.found.map(function (r) { return fragOf(r.id, r); }); };
S.allFragments = function () { var byId = {}; st.found.forEach(function (r) { byId[r.id] = r; }); var o = []; for (var i = 0; i < TOTAL; i++) o.push(fragOf(i, byId[i] || null)); return o; };
S.chapters = function () { return CHAPTERS.map(function (t, i) { return { n: i + 1, roman: ROMAN[i], title: t, found: st.found.filter(function (r) { return Math.floor(r.id / PER) === i; }).length, of: PER, lit: i < litCount() }; }); };
S.lanterns = function () { return litCount(); };
S.earned = function () { return earned(); };
S.completed = function () { return !!st.completed; };
S.newGamePlus = function () { return !!st.newGamePlus; };
S.postscript = function () { return st.completed ? POSTSCRIPT : null; };
S.openLetters = function () { buildLettersPanel(); N2.ui.open("n2-letters"); scrollLetters(); };
S.isSanctuary = function () { return hereMine(); };
S.state = function () { return JSON.parse(JSON.stringify(st)); };
S.shard = function () { return shard ? { x: shard.x, y: shard.y + shard.cy, z: shard.z, got: !!shard.got } : null; };
S.endingLines = function () { return ENDING_LINES.slice(); };
S.thresholdState = function () { return TH ? { awake: !!TH.awake, waking: TH.wake >= 0 && !TH.awake, lit: TH.posts.filter(function (p) { return p.lit; }).length, doors: TH.doors.map(function (d) { return d.target; }) } : null; };
S.letterText = function (id) { return LETTERS[id] || null; };
// ---- debug helpers (tests / --eval) ----
S.giveShards = function (n) {
  n = n == null ? PER : n | 0;
  var last = null;
  for (var i = 0; i < n; i++) { var id = nextFragmentId(); if (id < 0) break; var rec = { id: id, night: day, recipe: null, dream: "somewhere" }; st.found.push(rec); last = fragOf(id, rec); }
  st.found.sort(function (a, b) { return a.id - b.id; }); save(); pingHud(6);
  if (last) try { N2.emit("shard", shardCount(), { id: last.id, chapter: last.chapter, text: last.text }); } catch (e) {}
  return shardCount();
};
S.litAll = function () {
  if (shardCount() < TOTAL) S.giveShards(TOTAL - shardCount());
  var newly = 0;
  for (var i = 0; i < 7; i++) if (st.lit.indexOf(i) < 0) { st.lit.push(i); newly++; }
  save(); pingHud(6);
  if (TH) { for (var j = 0; j < TH.posts.length; j++) if (!TH.posts[j].lit) { TH.posts[j].lit = true; TH.posts[j].lighting = 0.0001; } if (!TH.awake && TH.wake < 0) TH.wake = 0; }
  if (newly) try { N2.emit("lanternLit", 7); } catch (e) {}
  return litCount();
};
S.spawnShard = function () { if (shard) return S.shard(); spawnShard(true); return S.shard(); };
function goTo(name) {
  if (name === L_NAME) lhTicket = true;
  if (phase === "play") { doWarp({ b: 0, e: 0 }, "story-debug", name); return "warping"; }
  buildNextDream(false, name); phase = "play"; fade = 0; return "built";
}
S.goThreshold = function () { return goTo(T_NAME); };
S.goLucidHour = function () { return goTo(L_NAME); };
S.finish = function () { triggerEnding(); return true; };
S.reset = function () { st = loadState(); st.found = []; st.lit = []; st.completed = false; st.newGamePlus = false; st.doorSeen = false; st.doorAnnounced = false; st.sillSeen = false; st.visits = 0; save(); renderHud(); return true; };
S.debug = { giveShards: S.giveShards, litAll: S.litAll, spawnShard: S.spawnShard, goThreshold: S.goThreshold, goLucidHour: S.goLucidHour, finish: S.finish, reset: S.reset, wakeNow: function () { if (TH) { TH.wake = 18.5; } } };
