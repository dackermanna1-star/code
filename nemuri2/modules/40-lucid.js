/* =============================================================================
   nemuri II — 40-lucid: lucidity, the reality check (your hands), and powers.
   Lucidity rises when you notice the dream (reality checks, touching things,
   anomalies, shards, calm) and sinks when the dark comes near. Lucid moments,
   counted over a lifetime of nights, slowly teach you glide, blink,
   stillness, flight, steer and recall. Save key: "lucid".
   ============================================================================= */
var LU = N2.mods.lucid = {};

/* --------------------------------------------------------------- state ---- */
var SAVE_KEY = "lucid";
var sv = N2.save.get(SAVE_KEY, null);
if (!sv || typeof sv !== "object") sv = {};
function dflt(k, v) { if (sv[k] == null) sv[k] = v; }
dflt("moments", 0);        // lifetime lucid moments (crossing 0.6 inside a dream, once per dream)
dflt("checks", 0);         // lifetime reality checks done in dreams
dflt("wakeChecks", 0);     // reality checks done awake
dflt("unlocked", {});      // powerId -> night unlocked
dflt("peakEver", 0);
dflt("hinted", false);
dflt("used", {});          // powerId -> times used
function persist() { N2.save.set(SAVE_KEY, sv); }

var level = 0;             // lucidity 0..1
var peakNight = 0;         // highest lucidity this night (title graph reads it)
var lucidThisDream = false, withinThisDream = false;
var dreamChecks = 0;       // reality checks inside the current dream
var lastGainT = -99;       // time of the last rewarded reality check
var lastEmit = 0, lastEmitT = 0, hudBumpT = 0;
var lastHp = 1, wasEmergent = false, anomalyT = 0;
var gazeV = 0;             // steer: what the dreamer has been looking toward (+ kinder, - darker)
var throttle = {};
var clockT = 0;

function now() { return clockT; }
function say(key, text, gap) { var t = now(); if (throttle[key] && t - throttle[key] < (gap || 4)) return; throttle[key] = t; try { beingSpeak(text); } catch (e) {} }
// while the hands are up, announcements wait so they never cover the count
var pendingShow = [];
function present(fn) { if (rc && rc.active) pendingShow.push(fn); else { try { fn(); } catch (e) {} } }
function flushPresent() { var q = pendingShow; pendingShow = []; q.forEach(function (fn, i) { setTimeout(function () { try { fn(); } catch (e) {} }, 250 + i * 120); }); }
function toast(a, b, ms) { present(function () { N2.ui.toast(a, b, ms); }); }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smooth(k) { k = clamp01(k); return k * k * (3 - 2 * k); }
function dreaming() { try { return N2.isDreaming() && phase !== "title"; } catch (e) { return false; } }
function nightNo() { try { return N2.night() || 1; } catch (e) { return 1; } }
function floorLevel() { return Math.min(0.3, 0.03 + (nightNo() - 1) * 0.022 + sv.moments * 0.004); }

var WORDS = [[0.15, "asleep"], [0.35, "stirring"], [0.6, "aware"], [0.85, "lucid"], [2, "awake within"]];
function word(v) { for (var i = 0; i < WORDS.length; i++) if (v < WORDS[i][0]) return WORDS[i][1]; return "awake within"; }

/* ---------------------------------------------------------------- powers ---- */
var POWERS = [
  { id: "glide", title: "glide", key: "space (hold)", glyph: "≈", need: { moments: 1, night: 1 },
    desc: "hold space while you fall, and the air will hold you" },
  { id: "blink", title: "blink", key: "q", glyph: "»", need: { moments: 3, night: 1 },
    desc: "step a little way through the dream, between one breath and the next" },
  { id: "stillness", title: "stillness", key: "t", glyph: "◌", need: { moments: 5, night: 2 },
    desc: "ask the dream to hold its breath: beings freeze, sound sleeps, the rain hangs" },
  { id: "flight", title: "flight", key: "g", glyph: "↑", need: { moments: 7, night: 2 },
    desc: "rise. space lifts you, ctrl lowers you. it drinks your lucidity" },
  { id: "steer", title: "steer", key: "passive", glyph: "✧", need: { moments: 9, night: 3 },
    desc: "while lucid, the next door leans toward what you looked at. look up for kinder dreams, down for darker ones" },
  { id: "recall", title: "recall", key: "j", glyph: "☾", need: { moments: 12, night: 3 },
    desc: "in the waking room, the journal can return you to a dream you remember" }
];
var POWER = {}; POWERS.forEach(function (p) { POWER[p.id] = p; });
var COST = { blink: 0.07, stillness: 0.18, flightStart: 0.06, flightPerSec: 0.022, glidePerSec: 0.012, steer: 0.05 };
var MIN = { blink: 0.07, stillness: 0.18, flight: 0.25, glide: 0.02 };

function has(id) { return !!(sv.unlocked && sv.unlocked[id] != null); }
function unlock(id, silent) {
  if (!POWER[id] || has(id)) return false;
  sv.unlocked[id] = nightNo(); persist();
  var p = POWER[id];
  if (!silent) {
    present(function () { if (N2.mods.title && N2.mods.title.flash) N2.mods.title.flash(p.title); });
    toast("you learned " + p.title, (p.key !== "passive" ? p.key + " — " : "") + p.desc, 6200);
    var base = 392; [0, 4, 7, 12, 16].forEach(function (s, i) { setTimeout(function () { N2.chime(base * Math.pow(2, s / 12), 2.6, 0.06, "sine"); }, i * 140); });
  }
  try { N2.emit("powerUnlocked", id, p.title); } catch (e) {}
  renderPips();
  return true;
}
function checkUnlocks(silent) {
  var n = nightNo();
  for (var i = 0; i < POWERS.length; i++) { var p = POWERS[i]; if (!has(p.id) && sv.moments >= p.need.moments && n >= p.need.night) unlock(p.id, silent); }
}
function used(id) { sv.used[id] = (sv.used[id] || 0) + 1; }

/* -------------------------------------------------------------- lucidity ---- */
function setLevel(v, reason, quiet) {
  var old = level; level = clamp01(v);
  var d = level - old;
  if (level > peakNight) peakNight = level;
  if (level > sv.peakEver) sv.peakEver = level;
  if (dreaming()) {
    if (old < 0.6 && level >= 0.6 && !lucidThisDream) { lucidThisDream = true; lucidMoment(); }
    if (old < 0.85 && level >= 0.85 && !withinThisDream) {
      withinThisDream = true;
      toast("awake within", "the dream is yours for a while", 3600);
      [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { N2.chime(f, 3, 0.04, "triangle"); }, i * 90); });
    }
  }
  if (Math.abs(d) > 0.0005) {
    if (reason !== "drift") hudBumpT = now();
    if (!quiet && (reason !== "drift" || Math.abs(level - lastEmit) > 0.01 || now() - lastEmitT > 0.5)) {
      lastEmit = level; lastEmitT = now();
      try { N2.emit("lucidity", level, d, reason || ""); } catch (e) {}
    }
  }
  return level;
}
function add(amount, reason) {
  if (!isFinite(amount) || amount === 0) return level;
  if (amount > 0 && !dreaming()) return level;      // awake: nothing to wake from
  return setLevel(level + amount, reason || "");
}
function lucidMoment() {
  sv.moments++; persist();
  if (sv.moments <= 3 || Math.random() < 0.3) toast("lucid", sv.moments === 1 ? "you know you are dreaming" : pick(["you know you are dreaming", "the dream notices you noticing", "it is yours, for a little while", "you remember that you are asleep"]), 3600);
  N2.chime(587, 2.4, 0.05, "sine"); setTimeout(function () { N2.chime(880, 2.8, 0.04, "sine"); }, 160);
  checkUnlocks(false);
}

/* -------------------------------------------------------------------- css ---- */
N2.ui.css([
  "#n2l-hud{display:flex;flex-direction:column;gap:4px;opacity:0;transition:opacity 1.2s ease;text-shadow:0 0 4px rgba(4,6,14,.55);}",
  "#n2l-hud .w{font-size:10px;letter-spacing:.24em;color:#a9b6c6;text-transform:lowercase;transition:color 1s ease, text-shadow 1s ease;}",
  "#n2l-hud .bar{position:relative;width:96px;height:2px;background:rgba(160,190,210,.2);box-shadow:0 0 3px rgba(4,6,14,.35);}",
  "#n2l-hud .bar i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--n2-teal);transition:width .35s ease, background 1s ease, box-shadow 1s ease;}",
  "#n2l-hud .bar s{position:absolute;left:60%;top:-2px;width:1px;height:6px;background:rgba(240,215,154,.4);}",
  "#n2l-hud.lucid .w{color:var(--n2-gold);text-shadow:0 0 8px rgba(240,215,154,.45);}",
  "#n2l-hud.lucid .bar i{background:var(--n2-gold);box-shadow:0 0 6px rgba(240,215,154,.7);}",
  "#n2l-hud.awake .bar{opacity:0;}",
  "#n2l-hud .pips{display:flex;gap:8px;font-size:12px;letter-spacing:0;color:var(--n2-ink);min-height:13px;margin-top:1px;}",
  "#n2l-hud .pips b{font-weight:normal;opacity:.3;transition:opacity .4s ease,color .4s ease,text-shadow .4s ease;}",
  "#n2l-hud .pips b.on{opacity:.8;}",
  "#n2l-hud .pips b.act{opacity:1;color:var(--n2-gold);text-shadow:0 0 6px rgba(240,215,154,.8);}",
  "#n2l-hands{position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:39;pointer-events:none;image-rendering:pixelated;image-rendering:crisp-edges;opacity:0;transition:opacity .25s ease;}",
  "#n2l-rc{position:fixed;left:50%;width:min(92vw,720px);transform:translateX(-50%);top:15%;padding:14px 0 16px;z-index:43;pointer-events:none;text-align:center;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;color:var(--n2-ink);text-transform:lowercase;opacity:0;transition:opacity .5s ease;}",
  "#n2l-rc .cnt{font-size:13px;letter-spacing:.34em;min-height:18px;text-shadow:0 0 5px rgba(4,6,14,.6),0 1px 1px rgba(4,6,14,.45);}",
  "#n2l-rc .cnt span{opacity:0;transition:opacity .25s ease,color .6s ease;color:var(--n2-dim);}",
  "#n2l-rc .cnt span.in{opacity:.62;}",
  "#n2l-rc .cnt span.cur{opacity:1;color:var(--n2-ink);}",
  "#n2l-rc .cnt span.wrong{color:var(--n2-rose);opacity:1;}",
  "#n2l-rc .ver{margin-top:12px;font-size:12px;letter-spacing:.28em;color:var(--n2-gold);opacity:0;transform:translateY(4px);transition:opacity .9s ease,transform .9s ease;text-shadow:0 0 10px rgba(240,215,154,.3),0 0 2px rgba(4,6,14,.8);}",
  "#n2l-rc .ver.awake{color:var(--n2-teal);text-shadow:0 0 2px rgba(4,6,14,.8);}",
  "#n2l-rc .ver.on{opacity:1;transform:none;}",
  "#n2l-rip{position:fixed;left:50%;top:58%;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;z-index:38;pointer-events:none;opacity:0;border:2px solid rgba(240,225,180,.6);box-shadow:0 0 30px rgba(240,225,180,.35), inset 0 0 30px rgba(240,225,180,.25);}",
  "#n2l-rip.go{animation:n2lrip 1.6s ease-out forwards;}",
  "@keyframes n2lrip{0%{opacity:.85;transform:scale(1);}100%{opacity:0;transform:scale(70);}}",
  "#n2l-smear{position:fixed;inset:0;z-index:38;pointer-events:none;opacity:0;background:radial-gradient(ellipse 70% 30% at 50% 50%,rgba(255,255,255,.75),rgba(255,255,255,0) 70%),linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.35) 30%,rgba(255,255,255,.35) 70%,rgba(255,255,255,0));}",
  "#n2l-still{position:fixed;inset:0;z-index:38;pointer-events:none;opacity:0;transition:opacity 1.2s ease;background:radial-gradient(ellipse at 50% 50%,rgba(180,210,235,0) 45%,rgba(170,205,235,.26) 80%,rgba(205,228,248,.48) 100%);}",
  "#n2l-still.on{opacity:1;}"
].join("\n"), "n2-lucid-css");

/* -------------------------------------------------------------------- hud ---- */
var hud = N2.ui.el("div", "", "", N2.ui.region("tl")); hud.id = "n2l-hud";
var hudW = N2.ui.el("div", "w", "asleep", hud);
var hudBar = N2.ui.el("div", "bar", "<i></i><s></s>", hud), hudFill = hudBar.firstChild;
var hudPips = N2.ui.el("div", "pips", "", hud);
var pipEls = {};
function renderPips() {
  hudPips.innerHTML = ""; pipEls = {};
  POWERS.forEach(function (p) { if (!has(p.id)) return; var b = N2.ui.el("b", "", p.glyph, hudPips); b.title = p.title; pipEls[p.id] = b; });
}
renderPips();
var _hud = { w: "", f: -1, cls: "", op: -1 };
function updateHud() {
  var vis = phase !== "title" && phase !== "graph";
  var awake = !dreaming();
  var w = awake ? "awake" : word(level);
  var op = !vis ? 0 : awake ? 0.32 : (now() - hudBumpT < 3.2 || level >= 0.6 || rc.active) ? 0.92 : 0.5;
  if (w !== _hud.w) { hudW.textContent = w; _hud.w = w; }
  var f = Math.round(level * 1000) / 10;
  if (f !== _hud.f) { hudFill.style.width = f + "%"; _hud.f = f; }
  var cls = (awake ? "awake" : "") + (!awake && level >= 0.6 ? " lucid" : "");
  if (cls !== _hud.cls) { hud.className = cls; _hud.cls = cls; }
  if (op !== _hud.op) { hud.style.opacity = String(op); _hud.op = op; }
  // the little centre dot turns moon-gold while you are lucid
  var dl = !awake && level >= 0.6 && vis;
  if (dl !== _hud.dot) { _hud.dot = dl; try { if (dotEl) { dotEl.style.background = dl ? "rgba(240,215,154,.85)" : ""; dotEl.style.boxShadow = dl ? "0 0 5px rgba(240,215,154,.8)" : ""; } } catch (e) {} }
  for (var id in pipEls) {
    var b = pipEls[id], on = !awake && canUse(id), act = (id === "glide" && gliding) || (id === "flight" && flying) || (id === "stillness" && stillT > 0) || (id === "steer" && !awake && level >= 0.6 && Math.abs(gazeV) > 0.4);
    var c = act ? "act" : on ? "on" : "";
    if (b._c !== c) { b.className = c; b._c = c; }
  }
}
function canUse(id) {
  if (!has(id)) return false;
  if (id === "blink") return level >= MIN.blink;
  if (id === "stillness") return level >= MIN.stillness && stillT <= 0;
  if (id === "flight") return flying || level >= MIN.flight;
  if (id === "glide") return level >= MIN.glide;
  if (id === "steer") return level >= 0.6;
  return true;
}

/* ===================================================================== hands ==
   The reality check. A low-res 2D canvas: two hands in pajama sleeves rise into
   view and you count the fingers. Drawn procedurally in "luminance + material"
   code (R = light, G = material), then mapped through a small dithered palette
   so they belong to the dream's limited print. In a dream they are subtly
   wrong; in the waking room they are only hands.
   ========================================================================== */
var cvs = document.createElement("canvas"); cvs.id = "n2l-hands"; document.body.appendChild(cvs);
var ctx = cvs.getContext("2d", { willReadFrequently: true }) || cvs.getContext("2d");
var rcEl = N2.ui.el("div", "", "<div class='cnt'></div><div class='ver'></div>", document.body); rcEl.id = "n2l-rc";
var rcCnt = rcEl.firstChild, rcVer = rcEl.lastChild;
var ripEl = N2.ui.el("div", "", "", document.body); ripEl.id = "n2l-rip";
var smearEl = N2.ui.el("div", "", "", document.body); smearEl.id = "n2l-smear";
var stillEl = N2.ui.el("div", "", "", document.body); stillEl.id = "n2l-still";
var CW = 0, CH = 0, ditherTab = null;
function sizeCanvas() {
  var ih = Math.max(1, window.innerHeight), iw = Math.max(1, window.innerWidth);
  var h = Math.round(Math.max(150, Math.min(230, ih / 3.1))), w = Math.max(2, Math.round(h * iw / ih));
  if (w === CW && h === CH) return;
  CW = cvs.width = w; CH = cvs.height = h;
  ditherTab = new Float32Array(w * h);
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var v = 52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1); ditherTab[y * w + x] = v - Math.floor(v); }
}
window.addEventListener("resize", function () { if (rc.active) sizeCanvas(); });

var rc = { active: false, t: 0, plan: null, cool: 0, lowerAt: 0, done: false, counted: 0 };
var NUMW = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
var BASE_LEN = [0.27, 0.355, 0.395, 0.365];      // pinky, ring, middle, index (in hand units)

function colHex(c, fallback) { try { if (c && c.isColor) return c.clone(); if (c != null) return new THREE.Color(c); } catch (e) {} return new THREE.Color(fallback); }
function mixC(a, b, k) { return a.clone().lerp(b, k); }
function rampFrom(dark, mid, light, hi) {
  // 5 tones: ink, shadow, base, light, highlight -> [r,g,b] bytes
  var c = [dark, mixC(dark, mid, 0.55), mid, mixC(mid, light, 0.75), hi];
  return c.map(function (x) { return [Math.round(clamp01(x.r) * 255), Math.round(clamp01(x.g) * 255), Math.round(clamp01(x.b) * 255)]; });
}
function makeRamps(isDream) {
  var z = N2.lastZone || {}, P = z.palette || {};
  var skin = new THREE.Color(0xe4c3a7), sleeve = new THREE.Color(0x5f6f9a), ink, rim, glow;
  if (isDream) {
    var fog = colHex(z.fog && z.fog.color, 0x30384a), sky = colHex(z.sky, 0x203040);
    glow = colHex(P.glow, 0x9fe0e0);
    skin = mixC(skin, fog, 0.14).lerp(glow, 0.08);
    var lum = fog.r * 0.3 + fog.g * 0.55 + fog.b * 0.15, dim = 0.8 + 0.2 * clamp01(lum * 2.6);   // moonlit in dark dreams
    skin.multiplyScalar(dim);
    sleeve = mixC(sleeve, fog, 0.25);
    ink = mixC(new THREE.Color(0x120f1c), fog, 0.25);
    rim = mixC(skin, glow, 0.45).multiplyScalar(1.12);
    var hsl = {}; glow.getHSL(hsl); if (hsl.l < 0.55) glow.setHSL(hsl.h, Math.max(0.4, hsl.s), 0.66);
  } else {
    skin = new THREE.Color(0xe8c2a0); sleeve = new THREE.Color(0x56679a);
    ink = new THREE.Color(0x1a1218); rim = new THREE.Color(0xffe2b8); glow = new THREE.Color(0xffe0a0);
  }
  return [
    rampFrom(ink, skin.clone().multiplyScalar(0.92), skin.clone().multiplyScalar(1.1), rim),
    rampFrom(ink, sleeve, sleeve.clone().multiplyScalar(1.35), mixC(sleeve, rim, 0.5)),
    rampFrom(mixC(ink, glow, 0.35), glow.clone().multiplyScalar(0.8), glow, mixC(glow, new THREE.Color(0xffffff), 0.7))
  ];
}

function makePlan(isDream) {
  var p = { dream: isDream, seed: Math.random() * 100, wrong: "none", fx: {}, right: { n: 4, missing: -1, extra: 0, bloom: false, thumbs: 1 }, left: { n: 4, missing: -1, extra: 0, bloom: false, thumbs: 1 } };
  if (isDream) {
    var nd = nightNo();
    var pool = ["extra", "extra", "bloom", "bloom", "missing", "thumbs", "mismatch"];
    if (nd >= 4) pool.push("seven");
    p.wrong = pick(pool);
    var R = p.right, Lh = p.left;
    if (p.wrong === "extra") { R.extra = 1; Lh.extra = Math.random() < 0.5 ? 1 : 0; }
    else if (p.wrong === "bloom") { R.extra = 1; R.bloom = true; }
    else if (p.wrong === "missing") { R.missing = 1; Lh.missing = Math.random() < 0.4 ? 2 : -1; }
    else if (p.wrong === "thumbs") { R.thumbs = 2; }
    else if (p.wrong === "mismatch") { Lh.missing = 2; }
    else if (p.wrong === "seven") { R.extra = 2; Lh.extra = 1; }
    var fxs = ["bend", "melt", "ghost", "motes", "glow"], k = 1 + (Math.random() < 0.55 ? 1 : 0);
    for (var i = 0; i < k; i++) p.fx[fxs.splice((Math.random() * fxs.length) | 0, 1)[0]] = 0.7 + Math.random() * 0.5;
    if (!p.fx.motes && !p.fx.glow && Math.random() < 0.6) p.fx[Math.random() < 0.5 ? "motes" : "glow"] = 0.8;
  }
  p.ramps = makeRamps(isDream);
  var total = (p.right.thumbs) + (4 - (p.right.missing >= 0 ? 1 : 0)) + p.right.extra;
  p.total = total;
  p.countStart = 0.75; p.countStep = isDream ? 0.36 : 0.34;
  p.verdictAt = p.countStart + total * p.countStep + 0.25;
  p.lowerAt = p.verdictAt + (isDream ? 1.9 : 1.6);
  p.end = p.lowerAt + 0.55;
  p.motes = [];
  return p;
}

/* geometry for one hand at time t, in hand units (wrist at 0,0; up = -y) */
function handGeom(h, plan, t, side) {
  var fx = plan.fx, ph = plan.seed + (side > 0 ? 0 : 3.7);
  var fl = [];
  for (var i = 0; i < 4; i++) { if (h.missing === i) continue; fl.push({ len: BASE_LEN[i], grow: 1, id: "f" + i, extra: false }); }
  if (h.extra) {
    for (var x = 0; x < h.extra; x++) {
      var g = 1;
      if (h.bloom) { var bt = plan.countStart + 3.6 * plan.countStep; g = smooth((t - bt) / 0.8); }
      fl.splice(1 + x, 0, { len: 0.33 - x * 0.03, grow: g, id: "x" + x, extra: true });
    }
  }
  var totalW = 0; fl.forEach(function (f) { totalW += 0.35 + 0.65 * f.grow; });
  var x0 = -0.19, span = 0.36, cum = 0, wScale = Math.min(1, 4.15 / Math.max(4, totalW));
  var melt = fx.melt ? fx.melt * smooth((t - 0.5) / 2.8) : 0;
  var bend = fx.bend ? fx.bend * (0.35 + 0.65 * smooth((t - 0.3) / 2)) : 0;
  var breathe = plan.dream ? 0.035 : 0.008;
  var fingers = [];
  for (var j = 0; j < fl.length; j++) {
    var f = fl[j], wgt = 0.35 + 0.65 * f.grow, u = (cum + wgt / 2) / totalW; cum += wgt;
    var bx = x0 + span * u, by = -0.455 - 0.04 * (1 - Math.pow(2 * u - 1, 2));
    var len = f.len * (f.extra ? f.grow : 1) * (1 + breathe * Math.sin(t * 2.1 + j * 1.3 + ph)) * (1 + melt * 0.38 * (0.6 + 0.4 * Math.sin(j * 2.1 + ph)));
    var w = 0.088 * wScale * (f.extra ? (0.4 + 0.6 * f.grow) : 1) * (1 - melt * 0.28);
    var a = (u - 0.5) * 0.32, pts = [[bx, by + 0.03]], cx = bx, cy = by, segs = [0.46, 0.30, 0.24];
    for (var s = 0; s < 3; s++) {
      var ja = -(u - 0.5) * 0.06;                                         // gentle natural curl toward the middle
      if (bend) ja += bend * 0.34 * Math.sin(t * 1.6 + j * 1.15 + s * 0.8 + ph);
      if (melt) ja += melt * 0.22 * (u - 0.5 + 0.15 * Math.sin(ph + j)) * (s + 1);
      if (plan.dream && f.extra) ja += 0.12 * Math.sin(t * 2.7 + s);
      a += ja;
      var sl = len * segs[s]; cx += Math.sin(a) * sl; cy -= Math.cos(a) * sl; pts.push([cx, cy]);
    }
    fingers.push({ pts: pts, w: w, id: f.id, extra: f.extra, grow: f.grow, u: u });
  }
  var thumbs = [];
  for (var tb = 0; tb < h.thumbs; tb++) {
    var m = tb === 0 ? 1 : -1, tpts = [[0.13 * m, -0.1 - (tb ? 0.06 : 0)]], tcx = tpts[0][0], tcy = tpts[0][1];
    var tang = [0.82, 0.5, 0.32], tlen = [0.16, 0.13, 0.105];
    var ta = 0;
    for (var q = 0; q < 3; q++) {
      ta = tang[q] + (bend ? bend * 0.25 * Math.sin(t * 1.3 + q + ph + tb) : 0) + (melt ? melt * 0.2 * q : 0);
      var ll = tlen[q] * (1 + breathe * Math.sin(t * 1.7 + ph + q)) * (1 + melt * 0.35);
      tcx += Math.sin(ta) * ll * m; tcy -= Math.cos(ta) * ll; tpts.push([tcx, tcy]);
    }
    thumbs.push({ pts: tpts, w: 0.104 * (1 - melt * 0.2), id: "t" + tb, extra: tb > 0, grow: 1 });
  }
  // counting order: thumb, index -> pinky (originals), then the strangers
  var order = [thumbs[0]];
  for (var o = fingers.length - 1; o >= 0; o--) if (!fingers[o].extra) order.push(fingers[o]);
  for (var o2 = 0; o2 < fingers.length; o2++) if (fingers[o2].extra) order.push(fingers[o2]);
  for (var o3 = 1; o3 < thumbs.length; o3++) order.push(thumbs[o3]);
  return { fingers: fingers, thumbs: thumbs, order: order };
}

/* luminance + material encoded colour */
// B channel flags "soft" pixels (ghosts, motes) whose partial alpha is dithered; everything else is cut crisp
var encB = 0;
function enc(L, mat, a) { return "rgba(" + Math.round(clamp01(L) * 255) + "," + (mat === 2 ? 255 : mat === 1 ? 128 : 0) + "," + encB + "," + (a == null ? 1 : a) + ")"; }
function strokeDigit(d, extraW, style) {
  var p = d.pts;
  ctx.strokeStyle = style; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (var s = 0; s < p.length - 1; s++) {
    ctx.lineWidth = d.w * (1 - s * 0.075) + extraW;
    ctx.beginPath(); ctx.moveTo(p[s][0], p[s][1]); ctx.lineTo(p[s + 1][0], p[s + 1][1]); ctx.stroke();
  }
}
function palmPath() {
  ctx.beginPath();
  ctx.moveTo(-0.185, 0.04);
  ctx.bezierCurveTo(-0.235, -0.08, -0.25, -0.26, -0.225, -0.44);
  ctx.quadraticCurveTo(-0.02, -0.56, 0.195, -0.47);
  ctx.bezierCurveTo(0.235, -0.36, 0.245, -0.22, 0.2, -0.08);
  ctx.quadraticCurveTo(0.18, 0.0, 0.165, 0.04);
  ctx.closePath();
}
function sleevePath() {
  ctx.beginPath(); ctx.moveTo(-0.25, -0.005); ctx.lineTo(0.25, -0.005); ctx.lineTo(0.37, 1.05); ctx.lineTo(-0.37, 1.05); ctx.closePath();
}
function drawHandAt(geo, plan, t, px, py, S, rot, mirror, alpha, ghost) {
  ctx.save();
  ctx.globalAlpha = alpha; encB = ghost ? 255 : 0;
  ctx.translate(px, py); ctx.rotate(rot); ctx.scale(S * mirror, S);
  var ow = 2.2 / S;                                         // outline thickness, in hand units
  var all = geo.fingers.concat(geo.thumbs);
  // 1. fingers, each inked then filled so crossing fingers stay legible
  var ink = enc(0.03, 0), base = enc(0.5, 0);
  for (var i = 0; i < geo.fingers.length; i++) { var fd = geo.fingers[i]; if (fd.grow > 0.02) { strokeDigit(fd, ow * 2, ink); strokeDigit(fd, 0, base); } }
  // 2. the palm over the finger roots (its edge becomes the knuckle crease)
  ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = ow * 2; ctx.lineJoin = "round";
  palmPath(); ctx.fill(); ctx.stroke();
  var gr = ctx.createRadialGradient(-0.03, -0.3, 0.02, -0.01, -0.26, 0.3);
  gr.addColorStop(0, enc(0.64, 0)); gr.addColorStop(0.6, enc(0.52, 0)); gr.addColorStop(1, enc(0.42, 0));
  ctx.fillStyle = gr; palmPath(); ctx.fill();
  // 3. thumbs, growing out of the palm
  for (var j = 0; j < geo.thumbs.length; j++) { strokeDigit(geo.thumbs[j], ow * 2, ink); strokeDigit(geo.thumbs[j], 0, base); }
  if (!ghost) {
    // pads of the palm
    ctx.fillStyle = enc(0.6, 0);
    ctx.beginPath(); ctx.ellipse(0.12, -0.16, 0.085, 0.14, -0.35, 0, 6.283); ctx.fill();
    ctx.fillStyle = enc(0.56, 0);
    ctx.beginPath(); ctx.ellipse(-0.15, -0.22, 0.06, 0.15, 0.1, 0, 6.283); ctx.fill();
    // 3. light along each digit + fingertip pads
    for (var k = 0; k < all.length; k++) {
      var d = all[k]; if (d.grow < 0.05) continue;
      var p = d.pts, hw = d.w * 0.22;
      ctx.strokeStyle = enc(0.66, 0); ctx.lineCap = "round";
      for (var s = 0; s < p.length - 1; s++) {
        var dx = p[s + 1][0] - p[s][0], dy = p[s + 1][1] - p[s][1], dl = Math.hypot(dx, dy) || 1, nx = -dy / dl * hw, ny = dx / dl * hw;
        ctx.lineWidth = d.w * 0.34;
        var st0 = s === 0 ? 0.35 : 0.15;
        ctx.beginPath(); ctx.moveTo(p[s][0] - nx + dx * st0, p[s][1] - ny + dy * st0); ctx.lineTo(p[s + 1][0] - nx - dx * 0.15, p[s + 1][1] - ny - dy * 0.15); ctx.stroke();
      }
      var tp = p[p.length - 1], pr = p[p.length - 2];
      ctx.fillStyle = enc(0.62, 0);
      ctx.beginPath(); ctx.arc(tp[0] * 0.8 + pr[0] * 0.2, tp[1] * 0.8 + pr[1] * 0.2, d.w * 0.28, 0, 6.283); ctx.fill();
      // joint creases
      ctx.strokeStyle = enc(0.33, 0); ctx.lineWidth = 1.1 / S;
      for (var c = 1; c < p.length - 1; c++) {
        var ax = p[c + 1][0] - p[c - 1][0], ay = p[c + 1][1] - p[c - 1][1], al = Math.hypot(ax, ay) || 1, cw = d.w * 0.36;
        ctx.beginPath(); ctx.moveTo(p[c][0] - ay / al * cw, p[c][1] + ax / al * cw); ctx.lineTo(p[c][0] + ay / al * cw, p[c][1] - ax / al * cw); ctx.stroke();
      }
    }
    // palm lines (in a dream they may glow with the dream's own light)
    var glowLines = plan.fx.glow ? plan.fx.glow * (0.55 + 0.45 * Math.sin(t * 3.1 + plan.seed)) : 0;
    ctx.strokeStyle = glowLines > 0 ? enc(0.45 + glowLines * 0.5, 2) : enc(0.32, 0);
    ctx.lineWidth = (glowLines > 0 ? 1.6 : 1.1) / S; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-0.22, -0.4); ctx.quadraticCurveTo(-0.04, -0.33, 0.13, -0.43); ctx.stroke();     // heart
    ctx.beginPath(); ctx.moveTo(-0.2, -0.3); ctx.quadraticCurveTo(0.0, -0.25, 0.17, -0.33); ctx.stroke();        // head
    ctx.beginPath(); ctx.moveTo(0.17, -0.36); ctx.quadraticCurveTo(0.0, -0.2, 0.06, 0.0); ctx.stroke();          // life
    if (plan.dream && plan.fx.glow) { ctx.beginPath(); ctx.moveTo(-0.12, -0.05); ctx.quadraticCurveTo(-0.05, -0.2, -0.08, -0.36); ctx.stroke(); }
  }
  // 4. the sleeve (pajamas)
  if (ghost) { ctx.restore(); encB = 0; return; }
  ctx.fillStyle = enc(0.03, 1); ctx.strokeStyle = enc(0.03, 1); ctx.lineWidth = ow * 2;
  sleevePath(); ctx.fill(); ctx.stroke();
  var sg = ctx.createLinearGradient(-0.3, 0, 0.3, 0); sg.addColorStop(0, enc(0.4, 1)); sg.addColorStop(0.45, enc(0.56, 1)); sg.addColorStop(1, enc(0.38, 1));
  ctx.fillStyle = sg; sleevePath(); ctx.fill();
  if (!ghost) {
    ctx.save(); sleevePath(); ctx.clip();
    ctx.strokeStyle = enc(0.7, 1); ctx.lineWidth = 0.022;
    for (var st2 = -4; st2 <= 4; st2++) { ctx.beginPath(); ctx.moveTo(st2 * 0.075, 0); ctx.lineTo(st2 * 0.105, 1.1); ctx.stroke(); }
    ctx.fillStyle = enc(0.62, 1); ctx.fillRect(-0.3, -0.01, 0.6, 0.07);
    ctx.fillStyle = enc(0.2, 1); ctx.fillRect(-0.3, 0.06, 0.6, 0.012);
    ctx.restore();
  }
  ctx.restore(); encB = 0;
}
function toScreen(px, py, S, rot, mirror, x, y) {
  var lx = x * S * mirror, ly = y * S, c = Math.cos(rot), s = Math.sin(rot);
  return [px + lx * c - ly * s, py + lx * s + ly * c];
}
function sparkle(x, y, r, L, mat) {
  encB = 255;
  ctx.fillStyle = enc(0.85, mat, 0.3); ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, 6.283); ctx.fill();
  encB = 0;
  ctx.fillStyle = enc(L, mat);
  ctx.fillRect(Math.round(x) - r, Math.round(y), r * 2 + 1, 1);
  ctx.fillRect(Math.round(x), Math.round(y) - r, 1, r * 2 + 1);
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
}

function drawHands(plan, t, mdt) {
  mdt = mdt || 1 / 24;
  sizeCanvas();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, CW, CH);
  var S = CH * 0.58, lift;
  var up = smooth(t / 0.6), down = smooth((t - plan.lowerAt) / 0.55);
  lift = (1 - up) + down * 1.1;
  var bob = 0; try { bob = Math.sin(bobPhase * 2) * 0.012 * CH; } catch (e) {}
  var calmMo = N2.settings && N2.settings.reducedMotion;
  var sway = (plan.dream ? 0.012 : 0.004) * (calmMo ? 0.4 : 1);
  var baseY = CH * 0.93 + lift * CH * 0.95 + bob;
  var cx = CW / 2, gap = S * 0.47;
  var hands = [
    { h: plan.left, side: -1, x: cx - gap, rot: 0.2 + Math.sin(t * 0.9 + 1) * sway * 3, y: baseY + Math.sin(t * 1.1) * sway * CH },
    { h: plan.right, side: 1, x: cx + gap, rot: -0.2 + Math.sin(t * 0.8) * sway * 3, y: baseY + Math.sin(t * 1.3 + 2) * sway * CH }
  ];
  var counting = null;
  for (var i = 0; i < hands.length; i++) {
    var H = hands[i], geo = handGeom(H.h, plan, t, H.side);
    if (plan.fx.ghost) {
      var gk = plan.fx.ghost;
      drawHandAt(geo, plan, t, H.x + Math.sin(t * 2.3 + i) * S * 0.055 * gk, H.y + Math.cos(t * 1.7) * S * 0.03 * gk, S * (1 + 0.025 * Math.sin(t * 1.3)), H.rot + Math.sin(t * 1.9) * 0.07 * gk, H.side, 0.4, true);
    }
    drawHandAt(geo, plan, t, H.x, H.y, S, H.rot, H.side, 1, false);
    if (H.side > 0) counting = { geo: geo, H: H };
    // motes drifting up off the fingertips
    if (plan.fx.motes && t < plan.lowerAt && Math.random() < 1.2 * plan.fx.motes) {
      var dg = geo.fingers[(Math.random() * geo.fingers.length) | 0]; if (dg) { var tp = dg.pts[dg.pts.length - 1], sp = toScreen(H.x, H.y, S, H.rot, H.side, tp[0], tp[1]); plan.motes.push({ x: sp[0], y: sp[1], vx: (Math.random() - 0.5) * 6, vy: -8 - Math.random() * 10, life: 1.4 + Math.random() }); }
    }
  }
  // the finger being counted catches the light
  var ci = Math.floor((t - plan.countStart) / plan.countStep);
  if (counting && t >= plan.countStart && ci < plan.total && t < plan.verdictAt + 0.2) {
    var d = counting.geo.order[ci];
    if (d) { var tp2 = d.pts[d.pts.length - 1], s2 = toScreen(counting.H.x, counting.H.y, S, counting.H.rot, 1, tp2[0], tp2[1] - 0.02); var k = 1 - ((t - plan.countStart) / plan.countStep - ci); sparkle(s2[0], s2[1], 2 + Math.round(k * 3), 1, plan.dream ? 2 : 0); }
  }
  for (var m = plan.motes.length - 1; m >= 0; m--) {
    var mo = plan.motes[m]; mo.life -= mdt; mo.x += mo.vx * mdt; mo.y += mo.vy * mdt; mo.vx += Math.sin(t * 3 + m) * 0.3;
    if (mo.life <= 0) { plan.motes.splice(m, 1); continue; }
    encB = 255; ctx.fillStyle = enc(0.75 + 0.25 * Math.sin(t * 9 + m), 2, Math.min(1, mo.life));
    ctx.fillRect(Math.round(mo.x), Math.round(mo.y), mo.life > 1 ? 2 : 1, mo.life > 1 ? 2 : 1);
  }
  encB = 0;
  quantize(plan.ramps);
}
function quantize(ramps) {
  var img; try { img = ctx.getImageData(0, 0, CW, CH); } catch (e) { return; }
  var d = img.data, n = CW * CH, dt = ditherTab;
  for (var i = 0, p = 0; i < n; i++, p += 4) {
    var a = d[p + 3]; if (a === 0) continue;
    var th = dt[i];
    if (a < 250 && (d[p + 2] > 128 ? a / 255 < th : a < 120)) { d[p + 3] = 0; continue; }
    var g = d[p + 1], mat = g > 190 ? 2 : g > 64 ? 1 : 0;
    var L = d[p] / 255, idx = Math.round(L * 4 + (th - 0.5) * 0.7); if (idx < 0) idx = 0; else if (idx > 4) idx = 4;
    var c = ramps[mat][idx]; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/* ---- the check itself ---- */
function startCheck() {
  if (rc.active) { if (rc.t < rc.plan.lowerAt) rc.t = Math.max(rc.plan.lowerAt, rc.t); return; }   // R again: lower them
  if (rc.cool > 0) return;
  var isDream = dreaming();
  rc.plan = makePlan(isDream); rc.t = 0; rc.active = true; rc.done = false; rc.counted = 0; rc.drawn = false; rc.acc = 0;
  sizeCanvas();
  rcCnt.innerHTML = ""; rcVer.textContent = ""; rcVer.className = "ver";
  var words = [];
  for (var i = 0; i < rc.plan.total; i++) { var s = document.createElement("span"); s.textContent = NUMW[i] || "?"; rcCnt.appendChild(s); words.push(s); if (i < rc.plan.total - 1) rcCnt.appendChild(document.createTextNode(" ")); }
  rc.words = words;
  cvs.style.opacity = "1"; rcEl.style.opacity = "1";
  if (audio.ctx) { try { audio.noise(0.5, "bandpass", 700, 320, 0.03, 0); } catch (e) {} }
  if (!sv.hinted) { sv.hinted = true; persist(); }
}
function endCheck() {
  rc.active = false; flushPresent(); cvs.style.opacity = "0"; rcEl.style.opacity = "0";
  rc.cool = 0.6;
  setTimeout(function () { if (!rc.active) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, CW, CH); } }, 300);
}
var PENT = [0, 2, 4, 7, 9, 12, 14, 16, 19];
function isWrongCount(p, k) { return p.dream && p.wrong !== "mismatch" && (k >= 5 || (p.total < 5 && k === p.total - 1)); }
function countTick(i) {
  var p = rc.plan;
  for (var k = 0; k < rc.words.length; k++) rc.words[k].className = k < i ? "in" : k === i ? "cur" : "";
  var wrong = isWrongCount(p, i);
  if (wrong) rc.words[i].className = "cur wrong";
  var f = 330 * Math.pow(2, PENT[Math.min(i, PENT.length - 1)] / 12);
  if (wrong) f *= 1.0595 * (1 + (Math.random() - 0.5) * 0.02);
  N2.chime(f, 0.9, 0.035, "triangle");
}
function verdict() {
  var p = rc.plan; rc.done = true;
  for (var k = 0; k < rc.words.length; k++) rc.words[k].className = isWrongCount(p, k) ? "in wrong" : "in";
  var n = NUMW[p.total - 1] || String(p.total), line;
  if (!p.dream) {
    line = n + ". " + pick(["you are awake.", "the hands are yours. you are awake.", "awake. the room is only a room.", "five, as always. you are awake."]);
    rcVer.className = "ver awake on"; rcVer.textContent = line;
    sv.wakeChecks++; persist();
    if (audio.ctx) { N2.chime(220, 2.2, 0.05, "sine"); N2.chime(330, 2.2, 0.03, "sine"); }
    try { N2.emit("realityCheck", false); } catch (e) {}
    return;
  }
  var tnow = now(), anomaly = !!emergent || (tnow - anomalyT < 6);
  var gains = [0.2, 0.15, 0.1, 0.07, 0.05], g = gains[Math.min(dreamChecks, gains.length - 1)];
  if (tnow - lastGainT < 10) g *= 0.25;
  if (anomaly) g += 0.14;
  dreamChecks++; sv.checks++; lastGainT = tnow; persist();
  var lines;
  if (anomaly) lines = ["the dream flinched. you saw it.", "you caught it slipping. you are dreaming.", "it changed while you watched. a dream."];
  else if (level >= 0.85) lines = ["you are dreaming. you have always known.", "still dreaming. still yours."];
  else if (g < 0.05) lines = ["you already know.", "still a dream. you knew."];
  else if (p.wrong === "mismatch") lines = ["and four on the other. you are dreaming.", "the other hand disagrees. a dream."];
  else lines = ["you are dreaming.", "this is a dream.", "you are dreaming — and you know it.", "a dream. breathe. you are dreaming."];
  line = (p.wrong === "mismatch" ? n + "… " : n + "? ") + pick(lines);
  rcVer.className = "ver on"; rcVer.textContent = line;
  add(g, "realityCheck");
  try { N2.emit("realityCheck", true); } catch (e) {}
  try { if (N2.mods.lens && N2.mods.lens.pulse) N2.mods.lens.pulse(0.6); } catch (e) {}
  var calmMo = N2.settings && N2.settings.reducedMotion;
  if (!calmMo) {
    try { glitch = Math.max(glitch, 0.14); } catch (e) {}
    ripEl.classList.remove("go"); void ripEl.offsetWidth; ripEl.classList.add("go");
  }
  flashAmt = Math.max(flashAmt, calmMo ? 0.08 : 0.18);
  [440, 554, 659, 880].forEach(function (f, i) { setTimeout(function () { N2.chime(f * (anomaly ? 0.75 : 1), 2.6, 0.04, "sine"); }, i * 70); });
}
function tickCheck(dt) {
  if (!rc.active) { if (rc.cool > 0) rc.cool -= dt; return; }
  var p = rc.plan;
  if (phase !== "play" || (p.dream !== dreaming())) { if (rc.t < p.lowerAt) rc.t = p.lowerAt; }   // warped or woke mid-check: lower them
  var frozen = paused || N2.uiOpen;
  if (!frozen) {
    var t0 = rc.t; rc.t += dt;
    var c0 = Math.floor((t0 - p.countStart) / p.countStep), c1 = Math.floor((rc.t - p.countStart) / p.countStep);
    if (rc.t >= p.countStart && c1 !== c0 && c1 >= 0 && c1 < p.total && rc.t < p.verdictAt && !rc.done) countTick(c1);
    else if (t0 < p.countStart && rc.t >= p.countStart && !rc.done) countTick(0);
    if (!rc.done && rc.t >= p.verdictAt && t0 < p.verdictAt && rc.t < p.lowerAt) verdict();
    if (rc.t >= p.lowerAt && t0 < p.lowerAt) rcEl.style.opacity = "0";
  }
  if (rc.t >= p.end) { endCheck(); return; }
  // pixel hands animate "on twos" (~24 fps): it suits them, and halves the cost
  rc.acc = (rc.acc || 0) + (frozen ? 0 : dt);
  if (rc.drawn && rc.acc < 1 / 24) return;
  var mdt = rc.drawn ? rc.acc : 1 / 24; rc.acc = 0; rc.drawn = true;
  try { drawHands(p, rc.t, mdt); } catch (e) { endCheck(); }
}

/* =================================================================== powers ==
   glide · blink · flight · stillness · steer · recall
   ========================================================================== */
var gliding = false, glideSnd = 0;
var flying = false, flyVel = new THREE.Vector3(), flyDir = new THREE.Vector3(), flyFlat = new THREE.Vector3(), flyRight = new THREE.Vector3(), flySnd = 0;
var blinkAnim = null, stillT = 0, stillPrevFrozen = false, flashAmt = 0, smearT = 0;

function needs(id, min) {
  if (!dreaming()) { say("awake", "you are awake — the dream's tricks sleep here", 5); return false; }
  if (!has(id)) { say("nothow", "you do not know how to do that yet", 5); return false; }
  if (level < min) { say("weak", "you are not lucid enough — look at your hands", 4); return false; }
  return true;
}

/* blink — a short dream-step forward, never into a wall */
function doBlink() {
  if (!needs("blink", MIN.blink)) return;
  if (blinkAnim) return;
  var dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  var fx = dir.x, fz = dir.z, fl = Math.hypot(fx, fz); if (fl < 1e-4) { fx = -Math.sin(yaw); fz = -Math.cos(yaw); fl = 1; }
  fx /= fl; fz /= fl;
  var maxD = 6.2, step = 0.2, okX = pos.x, okZ = pos.z, okY = pos.y, dist = 0, upY = flying ? dir.y : 0;
  for (var d = step; d <= maxD + 1e-6; d += step) {
    var x = pos.x + fx * d, z = pos.z + fz * d, y = pos.y + upY * d;
    if (boundaryR > 0 && Math.hypot(x, z) > boundaryR - 0.8) break;
    var gy = null;
    try { groundClampY = y + 1.1; var g = groundSampler(x, z); groundClampY = Infinity; if (g && g.on && isFinite(g.y)) gy = g.y; } catch (e) { groundClampY = Infinity; }
    if (gy != null && gy > y + 1.05) break;                              // a wall of ground (cliff/step too tall)
    var fy = (gy != null && gy > y - 0.6 && !flying) ? gy : y;
    if (N2.insideSolid(x, z, fy)) break;
    okX = x; okZ = z; okY = fy; dist = d;
  }
  if (dist < 0.6) { say("blinkno", "something is in the way", 2); return; }
  add(-COST.blink, "blink"); used("blink");
  blinkAnim = { fx: pos.x, fz: pos.z, fy: pos.y, tx: okX, tz: okZ, ty: okY, t: 0, dur: 0.14 };
  vy = Math.max(vy, 0);
  var calmMo = N2.settings && N2.settings.reducedMotion;
  smearT = 0.38; flashAmt = Math.max(flashAmt, calmMo ? 0.1 : 0.22);
  if (!calmMo) { try { glitch = Math.max(glitch, 0.22); } catch (e) {} }
  if (audio.ctx) { try { audio.noise(0.32, "highpass", 2600, 600, 0.05, 0); audio.tone(880, "sine", 0.03, 0.005, 0.35, 0); } catch (e) {} }
}
function tickBlink(dt) {
  if (!blinkAnim) return;
  var b = blinkAnim; b.t += dt; var k = smooth(b.t / b.dur);
  pos.x = b.fx + (b.tx - b.fx) * k; pos.z = b.fz + (b.tz - b.fz) * k;
  if (flying) pos.y = b.fy + (b.ty - b.fy) * k; else if (b.ty > pos.y) pos.y = b.fy + (b.ty - b.fy) * k;
  try { camera.position.set(pos.x, pos.y + eyeH, pos.z); } catch (e) {}
  if (b.t >= b.dur) blinkAnim = null;
}

/* stillness — the dream holds its breath for six seconds */
var STILL_DUR = 6;
function doStillness() {
  if (stillT > 0) return;
  if (!needs("stillness", MIN.stillness)) return;
  add(-COST.stillness, "stillness"); used("stillness");
  stillPrevFrozen = !!freezeBeings;
  freezeBeings = true; stillT = STILL_DUR;
  stillEl.classList.add("on");
  try { audio.fadeMaster(0.035, 0.6); } catch (e) {}
  if (audio.ctx) { try { audio.tone(1318, "sine", 0.03, 0.005, 2.4, 0); audio.tone(659, "sine", 0.03, 0.005, 3, 0); } catch (e) {} }
  say("still", pick(["the dream holds its breath", "everything waits for you", "hush."]), 1);
  try { N2.emit("stillness", true); } catch (e) {}
}
function endStillness(quiet) {
  if (stillT <= 0 && !stillEl.classList.contains("on")) return;
  stillT = 0; stillEl.classList.remove("on");
  // leave the freeze on only if a stillness anomaly of the dream itself is still running
  freezeBeings = !!(stillPrevFrozen && emergent);
  if (!emergent) emergentDesat = 0;
  if (!quiet && !paused) { try { audio.fadeMaster(audio.muted ? 0 : 0.28, 1.4); } catch (e) {} }
  try { N2.emit("stillness", false); } catch (e) {}
}
// the rain hangs in the air while the dream is still
var _tickWeather = tickWeather;
tickWeather = function (dt) { return _tickWeather.call(this, stillT > 0 ? 0 : dt); };

/* flight — free movement in the air, paid for in lucidity */
function toggleFlight() {
  if (flying) { stopFlight("you let the air go"); return; }
  if (zoneFlags && zoneFlags.flight) { say("flyalready", "this dream already lets you fly", 4); return; }
  if (!needs("flight", MIN.flight)) return;
  add(-COST.flightStart, "flight"); used("flight");
  flying = true; flyVel.set(0, 2.2, 0); vy = 0; grounded = false;
  say("fly", pick(["you rise", "the ground lets go of you", "up, then"]), 2);
  if (audio.ctx) { try { audio.noise(1.2, "bandpass", 300, 900, 0.04, 0); } catch (e) {} }
}
function stopFlight(msg) {
  if (!flying) return;
  flying = false; vy = Math.min(0, flyVel.y) * 0.5; grounded = false;
  if (msg) say("flyoff", msg, 2);
}
var _updatePlayer = updatePlayer;
updatePlayer = function (dt) {
  if (flying && phase !== "graph") {
    if (zoneFlags && zoneFlags.flight) { flying = false; }
    else { try { flyStep(dt); return; } catch (e) { flying = false; } }
  }
  return _updatePlayer.apply(this, arguments);
};
function flyStep(dt) {
  var ls = 1.8 * dt;
  if (keys["ArrowLeft"]) yaw += ls; if (keys["ArrowRight"]) yaw -= ls;
  if (keys["ArrowUp"]) pitch += ls; if (keys["ArrowDown"]) pitch -= ls;
  pitch = clamp(pitch, -1.45, 1.45);
  camera.rotation.set(pitch, yaw, 0, "YXZ");
  camera.getWorldDirection(flyDir);
  flyFlat.set(flyDir.x, 0, flyDir.z); if (flyFlat.lengthSq() < 1e-6) flyFlat.set(0, 0, -1); flyFlat.normalize();
  flyRight.crossVectors(flyFlat, worldUp).normalize();
  var run = (keys["ShiftLeft"] || keys["ShiftRight"]) ? 1.9 : 1, sp = (moveSpeed || 5) * 1.35 * run;
  var want = new THREE.Vector3();
  if (keys["KeyW"]) want.add(flyDir); if (keys["KeyS"]) want.sub(flyDir);
  if (keys["KeyD"]) want.add(flyRight); if (keys["KeyA"]) want.sub(flyRight);
  if (keys["Space"]) want.y += 1; if (keys["ControlLeft"] || keys["ControlRight"]) want.y -= 1;
  if (want.lengthSq() > 0) want.normalize().multiplyScalar(sp);
  flyVel.lerp(want, Math.min(1, dt * 3.2));
  pos.x += flyVel.x * dt; pos.y += flyVel.y * dt; pos.z += flyVel.z * dt;
  _solidHit = 0; resolveSolids();
  groundClampY = pos.y + 0.6; var g = groundSampler(pos.x, pos.z); groundClampY = Infinity;
  if (g && g.on && pos.y < g.y) { pos.y = g.y; if (flyVel.y < 0) flyVel.y = 0; }
  var ceil = (dreamSpawn ? dreamSpawn.y : 0) + 70; if (pos.y > ceil) { pos.y = ceil; if (flyVel.y > 0) flyVel.y = 0; }
  vy = 0; grounded = false;
  if (boundaryR > 0 && Math.hypot(pos.x, pos.z) > boundaryR) { if (pullMode) doWarp({ b: -0.1, e: 0.1 }, "edge"); else { var bh = Math.hypot(pos.x, pos.z); pos.x *= boundaryR / bh; pos.z *= boundaryR / bh; } }
  bobPhase += dt * 0.8;
  var hover = Math.sin(performance.now() * 0.0016) * 0.07;
  camera.position.set(pos.x, pos.y + eyeH + hover, pos.z);
  if (shake > 0) { camera.position.x += rr(-1, 1) * shake * 0.12; camera.position.y += rr(-1, 1) * shake * 0.12; camera.rotation.z = rr(-1, 1) * shake * 0.06; shake = Math.max(0, shake - dt * 1.6); }
  else camera.rotation.z = camera.rotation.z * 0.8 + (-flyVel.dot(flyRight) * 0.004);
  if (graceTimer > 0) graceTimer -= dt;
  checkCollisions();
}
function tickFlight(dt) {
  if (!flying) return;
  if (!dreaming() || phase !== "play") { if (phase !== "transition") stopFlight(null); return; }
  var spd = flyVel.length();
  add(-(COST.flightPerSec + spd * 0.0012) * dt, "drift");
  if (level <= 0.02) stopFlight(pick(["the air forgets you", "you remember you cannot fly", "the sky lets you go"]));
  flySnd -= dt; if (flySnd <= 0 && spd > 4 && audio.ctx) { flySnd = 1.1; try { audio.noise(1.3, "bandpass", 260 + spd * 20, 200, 0.012 + spd * 0.0012, 0); } catch (e) {} }
}

/* glide — hold space while falling */
function tickGlide(dt) {
  var want = has("glide") && dreaming() && !flying && !(zoneFlags && zoneFlags.flight) && !grounded && keys["Space"] && vy < -0.3 && level > MIN.glide && phase === "play";
  if (want) {
    if (!gliding) { gliding = true; used("glide"); if (audio.ctx) { try { audio.noise(0.9, "lowpass", 900, 400, 0.025, 0); } catch (e) {} } }
    // aim so that next frame's gravity lands exactly on a slow drift (~1.4 m/s)
    var g18 = 18 * (typeof gravMul === "number" ? gravMul : 1) * dt, target = -1.4 + g18;
    if (vy < target) vy += (target - vy) * Math.min(1, dt * 12);
    var fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    pos.x += fx * dt * 1.1; pos.z += fz * dt * 1.1;
    add(-COST.glidePerSec * dt, "drift");
    glideSnd -= dt; if (glideSnd <= 0 && audio.ctx) { glideSnd = 1.4; try { audio.noise(1.5, "bandpass", 500, 380, 0.012, 0); } catch (e) {} }
  } else if (gliding) gliding = false;
}

/* steer — what you look at leans the next dream */
function tickGaze(dt) {
  gazeV *= Math.exp(-dt / 9);
  if (pitch > 0.55) gazeV += dt * 0.28; else if (pitch < -0.6) gazeV -= dt * 0.28;
  var fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  for (var i = 0; i < interactables.length; i++) {
    var e = interactables[i]; if (!e.valence) continue;
    var dx = e.x - pos.x, dz = e.z - pos.z, d = Math.hypot(dx, dz); if (d > 14 || d < 0.01) continue;
    if ((fx * dx + fz * dz) / d > 0.94) gazeV += e.valence * dt * 0.35;
  }
  gazeV = clamp(gazeV, -3, 3);
}

/* ================================================================== hooks ==== */
N2.bind("KeyR", "reality check — look at your hands", "lucid");
N2.bind("KeyQ", "blink (power)", "lucid");
N2.bind("KeyG", "flight (power)", "lucid");
N2.bind("KeyT", "stillness (power)", "lucid");
N2.bind("Space", "hold while falling: glide (power)", "lucid");

N2.on("keydown", function (e) {
  try {
    if (!N2.canAct()) return false;
    var c = e.code;
    if (c === "KeyR") { if (!e.repeat) startCheck(); return true; }
    if (c === "KeyQ") { if (!e.repeat) doBlink(); return true; }
    if (c === "KeyG") { if (!e.repeat) toggleFlight(); return true; }
    if (c === "KeyT") { if (!e.repeat) doStillness(); return true; }
  } catch (er) {}
  return false;
}, 40);

N2.on("examine", function (best) {
  try {
    if (best && dreaming()) {
      if (!best._n2lSeen) { best._n2lSeen = 1; add(0.035, "examine"); }
      if (best.valence) gazeV += best.valence * 1.2;
    }
  } catch (e) {}
  return false;
});

N2.on("dreamBuilt", function (z, firstOfDay) {
  try {
    stopFlight(null); blinkAnim = null; gliding = false;
    if (stillT > 0) endStillness(false); else stillEl.classList.remove("on");
    lucidThisDream = false; withinThisDream = false; dreamChecks = 0; wasEmergent = false; anomalyT = -99;
    try { lastHp = hp; } catch (e) { lastHp = 1; }
    if (z && z.bedroom) {
      if (firstOfDay) peakNight = 0;
      setLevel(0, "wake", false);
      gazeV = 0;
      if (!sv.hinted) setTimeout(function () { if (!sv.hinted && inBedroom && phase === "play") say("hint", "are you awake? press r to look at your hands", 1); }, 11000);
    } else {
      var fl = floorLevel();
      var carry = fromBedroom ? fl : fl + Math.max(0, level - fl) * 0.72;
      fromBedroom = false;
      setLevel(Math.max(fl, carry), "dream", false);
      if (sv.checks === 0) setTimeout(function () { if (sv.checks === 0 && level < 0.5 && dreaming() && phase === "play" && !rc.active) say("hint2", "is this a dream? (r — look at your hands)", 1); }, 22000);
    }
    checkUnlocks(true);
    renderPips();
  } catch (e) {}
});
var fromBedroom = false;

N2.on("warp", function (nudge, kind, target) {
  try {
    if (inBedroom) { fromBedroom = true; return; }
    if (kind === "fall") add(-0.12, "fall");
    else if (kind === "death") add(-0.22, "hurt");
    // steer: when lucid, lean the next dream toward what you looked at
    var k = String(kind || "");
    if (has("steer") && level >= 0.6 && !target && ["fall", "death", "debug", "recall", "escape"].indexOf(k) < 0 && Math.abs(gazeV) > 0.4) {
      moodBias = gazeV > 0 ? 1 : -1;
      add(-COST.steer, "steer"); used("steer");
      toast(gazeV > 0 ? "you lean the dream toward something kinder" : "you lean the dream toward the dark", null, 2600);
      gazeV = 0;
    }
    stopFlight(null);
    if (stillT > 0) endStillness(false);
  } catch (e) {}
});

N2.on("shard", function () { add(0.12, "shard"); });
N2.on("photo", function () { add((emergent || now() - anomalyT < 6) ? 0.08 : 0.012, "photo"); });
N2.on("chaseStart", function () { add(-0.1, "chase"); });
N2.on("chaseEnd", function (escaped) { if (escaped) add(0.16, "escaped"); else add(-0.15, "caught"); });
N2.on("lanternLit", function () { add(0.1, "lantern"); });
N2.on("nightEnd", function () { try { persist(); } catch (e) {} });

var horrorScan = 0, horrorLoss = 0;
function isDark(e) { var k = e && e.kind; return typeof k === "string" && (k.indexOf("horror") === 0 || k === "double" || k.indexOf("pursuer") === 0 || k.indexOf("nightmare") === 0); }
N2.on("play", function (dt) {
  try {
    tickBlink(dt); tickFlight(dt); tickGlide(dt);
    if (stillT > 0) { stillT -= dt; freezeBeings = true; emergentDesat = Math.max(emergentDesat, 0.32); if (stillT <= 0) endStillness(false); }
    if (!dreaming() || phase !== "play") return;
    tickGaze(dt);
    // anomalies: noticing them sharpens you
    var em = !!emergent;
    if (em && !wasEmergent) { anomalyT = now(); add(0.05, "anomaly"); }
    wasEmergent = em;
    // hurt
    if (hp < lastHp - 0.001) add(-(lastHp - hp) * 0.45, "hurt");
    lastHp = hp;
    // the dark nearby
    horrorScan -= dt;
    if (horrorScan <= 0) {
      horrorScan = 0.25; horrorLoss = 0;
      for (var i = 0; i < entities.length; i++) {
        var e = entities[i]; if (!e || e.dead || !isDark(e) || !e.obj) continue;
        var d = Math.hypot(e.obj.position.x - pos.x, e.obj.position.z - pos.z);
        if (d < 18) horrorLoss += 0.028 * (1 - d / 18);
      }
      try { if (N2.mods.nightmare && N2.mods.nightmare.chasing && N2.mods.nightmare.chasing()) horrorLoss += 0.012; } catch (er) {}
      horrorLoss = Math.min(0.06, horrorLoss);
    }
    if (horrorLoss > 0 && stillT <= 0) add(-horrorLoss * dt, "dread");
    // settle toward a floor; calm time lifts you toward "aware"
    var calm = horrorLoss <= 0 && hp >= maxHp * 0.9 && timeInDream > 4;
    var fl = floorLevel(), target = calm ? Math.max(fl, 0.34) : fl;
    if (!flying && !gliding) {
      if (level > target) setLevel(level - Math.min(level - target, 0.004 * dt), "drift");
      else if (level < target) setLevel(level + Math.min(target - level, 0.0055 * dt), "drift");
    }
  } catch (e) {}
});

N2.on("frame", function (dt) {
  clockT += dt;
  try { tickCheck(dt); } catch (e) {}
  try {
    // blink smear + verdict flash
    if (smearT > 0) { smearT -= dt; var k = Math.max(0, smearT / 0.38); smearEl.style.opacity = (Math.sin(k * Math.PI) * 0.85).toFixed(3); smearEl.style.transform = "scaleX(" + (1 + (1 - k) * 0.6).toFixed(3) + ")"; if (smearT <= 0) smearEl.style.opacity = "0"; }
    if (flashAmt > 0) { if (postMat && postMat.uniforms && postMat.uniforms.uFlash) postMat.uniforms.uFlash.value = Math.max(postMat.uniforms.uFlash.value, flashAmt); flashAmt = Math.max(0, flashAmt - dt * 0.9); }
    if (phase === "title" || phase === "graph") { if (flying) stopFlight(null); if (stillT > 0) endStillness(true); }
    updateHud();
  } catch (e) {}
});

/* ===================================================================== api ==== */
LU.level = function () { return level; };
LU.add = function (amount, reason) { return add(+amount || 0, reason); };
LU.set = function (v) { return setLevel(+v || 0, "debug"); };
LU.has = has;
LU.isLucid = function () { return level >= 0.6; };
LU.word = function () { return dreaming() ? word(level) : "awake"; };
LU.peak = function () { return peakNight; };
LU.moments = function () { return sv.moments; };
LU.powers = function () {
  return POWERS.map(function (p) { return { id: p.id, title: p.title, unlocked: has(p.id), desc: p.desc, key: p.key, glyph: p.glyph, night: has(p.id) ? sv.unlocked[p.id] : null, need: p.need, uses: sv.used[p.id] || 0 }; });
};
LU.spend = function (amount) { if (level < amount) return false; add(-amount, "spend"); return true; };
LU.flying = function () { return flying; };
LU.gliding = function () { return gliding; };
LU.isStill = function () { return stillT > 0; };
LU.checking = function () { return rc.active; };
LU.realityCheck = function () { startCheck(); };
LU.blink = doBlink; LU.stillness = doStillness; LU.toggleFlight = toggleFlight;
LU.stats = function () { return { level: level, peakNight: peakNight, peakEver: sv.peakEver, moments: sv.moments, checks: sv.checks, wakeChecks: sv.wakeChecks, unlocked: Object.keys(sv.unlocked), gaze: gazeV, vy: vy, still: stillT, freeze: freezeBeings, flying: flying, gliding: gliding }; };
LU.debugUnlockAll = function () { POWERS.forEach(function (p) { unlock(p.id, true); }); renderPips(); return Object.keys(sv.unlocked); };
LU.debugReset = function () { sv = { moments: 0, checks: 0, wakeChecks: 0, unlocked: {}, peakEver: 0, hinted: false, used: {} }; persist(); renderPips(); };
// debug: average milliseconds to draw one frame of the hands overlay (tests only)
LU.debugBench = function (n, dream, fx) {
  var p = makePlan(dream !== false), t0 = performance.now(), q0 = 0;
  if (fx) p.fx = fx;
  n = n || 60;
  for (var i = 0; i < n; i++) { drawHands(p, 1 + i / 60); }
  var t1 = performance.now();
  for (var j = 0; j < n; j++) quantize(p.ramps);
  var t2 = performance.now();
  ctx.clearRect(0, 0, CW, CH);
  return { perFrame: (t1 - t0) / n, quantize: (t2 - t1) / n, w: CW, h: CH };
};
// debug: start one of the dream's own anomalies (tests only)
LU.debugAnomaly = function (kind) { try { startEmergent(kind || "stillness"); return !!emergent; } catch (e) { return String(e); } };
