/* =============================================================================
   nemuri II — CORE SERVICES (module 10). Loaded first. Every other module builds
   on these interfaces; see SPEC.md. Runs inside the game's closure, so all
   engine globals (pos, yaw, phase, scene, NEW_RECIPES, audio, ...) are in scope.
   ============================================================================= */
var core = N2.mods.core = {};
N2.version = "2.0.0";
N2.newWorlds = [];        // every world a sequel module registers (smoke tests use this)

/* ---------------------------------------------------------------- save ---- */
// Namespaced, versioned JSON storage. Never throws; falls back to memory.
var _mem = {};
N2.save = {
  prefix: "nemuri2_",
  get: function (key, dflt) {
    var raw = null;
    try { if (window.localStorage) raw = localStorage.getItem(this.prefix + key); } catch (e) {}
    if (raw == null && _mem.hasOwnProperty(key)) raw = _mem[key];
    if (raw == null) return dflt;
    try { return JSON.parse(raw); } catch (e) { return dflt; }
  },
  set: function (key, value) {
    if (this._wiped) return false;   // a wipe is followed by a reload: no module may write the old state back (e.g. on beforeunload)
    var raw; try { raw = JSON.stringify(value); } catch (e) { return false; }
    _mem[key] = raw;
    try { if (window.localStorage) localStorage.setItem(this.prefix + key, raw); return true; } catch (e) { return false; }
  },
  remove: function (key) { delete _mem[key]; try { if (window.localStorage) localStorage.removeItem(this.prefix + key); } catch (e) {} },
  // wipe every sequel key (and the original's night counter) — "new dream" from the menu
  wipeAll: function () {
    _mem = {}; this._wiped = true;
    try {
      if (!window.localStorage) return;
      var dead = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && (k.indexOf(this.prefix) === 0 || k.indexOf("nemuri_") === 0)) dead.push(k); }
      for (var j = 0; j < dead.length; j++) localStorage.removeItem(dead[j]);
    } catch (e) {}
  }
};

/* ------------------------------------------------------------- settings ---- */
var SETTINGS_DEFAULT = {
  lens: "lucid",          // post-processing preset (owned by lens module); "lucid" = the sequel look, "classic" = nemuri 1
  resScale: 1,            // internal render height multiplier (0.7 / 1 / 1.4 / 2)
  fov: 72,                // base field of view; zones may still override
  sens: 1,                // mouse sensitivity multiplier
  invertY: false,
  volume: 1,              // 0..1 master multiplier
  reducedMotion: false,   // tames warp wobble, shake, chromatic aberration
  hud: true,              // show sequel HUD widgets
  touch: "auto",          // "auto" | "on" | "off" — on-screen controls
  grain: 0.5              // film grain amount 0..1
};
N2.settings = (function () {
  var s = N2.save.get("settings", {}), o = {};
  if (!s || typeof s !== "object" || Array.isArray(s)) s = {};
  for (var k in SETTINGS_DEFAULT) {
    var v = s.hasOwnProperty(k) ? s[k] : undefined, dv = SETTINGS_DEFAULT[k];
    // keep a stored value only if it has the default's type (and is a finite number when numeric)
    var ok = v !== undefined && v !== null && typeof v === typeof dv && (typeof dv !== "number" || isFinite(v));
    o[k] = ok ? v : dv;
  }
  if (o.grain < 0 || o.grain > 1) o.grain = SETTINGS_DEFAULT.grain;
  if (o.volume < 0 || o.volume > 1) o.volume = SETTINGS_DEFAULT.volume;
  if (o.sens <= 0 || o.sens > 10) o.sens = SETTINGS_DEFAULT.sens;
  if (o.fov < 30 || o.fov > 140) o.fov = SETTINGS_DEFAULT.fov;
  if (o.resScale <= 0 || o.resScale > 4) o.resScale = SETTINGS_DEFAULT.resScale;
  if (!/^(auto|on|off)$/.test(o.touch)) o.touch = SETTINGS_DEFAULT.touch;
  return o;
})();
N2.setSetting = function (key, value) {
  N2.settings[key] = value;
  N2.save.set("settings", N2.settings);
  N2.emit("settings", N2.settings, key);
};
N2.settingsDefaults = SETTINGS_DEFAULT;

/* ------------------------------------------------------------ key map ---- */
// Central registry of bindings, so the help screen can list them all.
N2.bindings = [];
N2.bind = function (code, label, owner) { N2.bindings.push({ code: code, label: label, owner: owner || "" }); };
N2.bind("KeyW", "move (wasd / arrows)", "base"); N2.bind("Space", "jump", "base"); N2.bind("ShiftLeft", "run", "base");
N2.bind("KeyE", "touch", "base"); N2.bind("KeyV", "stay / drift", "base"); N2.bind("KeyM", "mute", "base");
N2.bind("KeyP", "pause", "base"); N2.bind("KeyH", "hide hud", "core");
N2.keyName = function (code) { return String(code).replace(/^Key/, "").replace(/^Digit/, "").replace("ShiftLeft", "shift").replace("Space", "space").toLowerCase(); };
// true when the player is actually in-world and free to act (no menu, not paused, not on the title)
N2.canAct = function () { return phase === "play" && !paused && !N2.uiOpen; };

/* ------------------------------------------------------------------ ui ---- */
var css = [
  ":root{--n2-ink:#e6e4da;--n2-dim:#7f8fa3;--n2-glow:#f0d9a0;--n2-teal:#8fd0d2;--n2-rose:#e0a6c8;--n2-gold:#f0d79a;--n2-amber:#e8a860;--n2-bg:rgba(6,10,20,.88);--n2-line:rgba(160,190,210,.26);}",
  ".n2-region{position:fixed;z-index:42;pointer-events:none;display:flex;flex-direction:column;gap:6px;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;color:var(--n2-ink);font-size:11px;letter-spacing:.12em;}",
  ".n2-region>*{pointer-events:none;}",
  "#n2-tl{left:14px;top:34px;align-items:flex-start;}",
  "#n2-tr{right:14px;top:12px;align-items:flex-end;}",
  "#n2-bl{left:14px;bottom:12px;align-items:flex-start;}",
  "#n2-br{right:14px;bottom:32px;align-items:flex-end;}",
  "#n2-top{left:0;right:0;top:14%;align-items:center;}",
  "#n2-center{left:0;right:0;top:50%;transform:translateY(-50%);align-items:center;}",
  "body.n2-nohud .n2-region:not(#n2-top),body.n2-nohud #hud{opacity:0!important;}",
  ".n2-toast{padding:7px 16px;border:1px solid var(--n2-line);background:rgba(10,8,20,.72);color:var(--n2-ink);font-size:12px;letter-spacing:.18em;text-transform:lowercase;opacity:0;transform:translateY(-6px);transition:opacity .7s ease,transform .7s ease;text-align:center;max-width:min(86vw,560px);}",
  ".n2-toast.on{opacity:1;transform:none;}",
  ".n2-toast small{display:block;margin-top:3px;color:var(--n2-dim);font-size:10px;letter-spacing:.14em;}",
  ".n2-panel{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;background:rgba(5,4,11,.9);font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;color:var(--n2-ink);}",
  ".n2-panel.on{display:flex;}",
  ".n2-sheet{width:min(92vw,880px);max-height:88vh;overflow:auto;border:1px solid var(--n2-line);background:var(--n2-bg);box-shadow:0 0 80px rgba(120,90,190,.18);padding:22px 26px;}",
  ".n2-sheet h2{margin:0 0 14px;font-weight:normal;font-size:14px;letter-spacing:.32em;color:var(--n2-glow);text-transform:lowercase;}",
  ".n2-btn{font:inherit;font-size:12px;letter-spacing:.2em;color:var(--n2-ink);background:transparent;border:1px solid var(--n2-line);padding:8px 16px;cursor:pointer;text-transform:lowercase;}",
  ".n2-btn:hover,.n2-btn:focus-visible{border-color:var(--n2-glow);color:#fff;outline:none;background:rgba(150,120,220,.12);}",
  ".n2-close{position:absolute;right:18px;top:14px;}",
  ".n2-muted{color:var(--n2-dim);}"
].join("\n");
var styleEl = document.createElement("style"); styleEl.id = "n2-core-css"; styleEl.textContent = css; document.head.appendChild(styleEl);

var regions = {};
N2.ui = {
  css: function (text, id) { var el = document.createElement("style"); if (id) el.id = id; el.textContent = text; document.head.appendChild(el); return el; },
  // fixed HUD regions: "tl" | "tr" | "bl" | "br" | "top" | "center"
  region: function (name) {
    if (regions[name]) return regions[name];
    var el = document.createElement("div"); el.className = "n2-region"; el.id = "n2-" + name; document.body.appendChild(el);
    return (regions[name] = el);
  },
  el: function (tag, cls, html, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; },
  // a short message near the top of the screen; queued so they never overlap
  _q: [], _busy: false,
  toast: function (text, sub, ms) {
    this._q.push({ text: text, sub: sub, ms: ms || 3200 });
    if (!this._busy) this._next();
  },
  _next: function () {
    var self = this;
    // hold toasts while the reality-check hands are up, so they never cover the count
    try { var _L = N2.mods.lucid; if (this._q.length && _L && _L.checking && _L.checking()) { this._busy = true; setTimeout(function () { self._next(); }, 350); return; } } catch (e) {}
    var it = this._q.shift(); if (!it) { this._busy = false; return; }
    this._busy = true;
    var t = this.el("div", "n2-toast", "", this.region("top"));
    t.textContent = it.text;
    if (it.sub) { var s = document.createElement("small"); s.textContent = it.sub; t.appendChild(s); }
    requestAnimationFrame(function () { t.classList.add("on"); });
    setTimeout(function () { t.classList.remove("on"); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); self._next(); }, 700); }, it.ms);
  },
  // modal panels. open() blocks game input + updates until close().
  _open: [],
  panel: function (id, title) {
    var p = document.getElementById(id);
    if (p) return p;
    p = this.el("div", "n2-panel"); p.id = id;
    var sheet = this.el("div", "n2-sheet", "", p);
    if (title) this.el("h2", "", title, sheet);
    p.sheet = sheet;
    p.addEventListener("mousedown", function (e) { e.stopPropagation(); });
    p.addEventListener("touchstart", function (e) { e.stopPropagation(); }, { passive: true });
    document.body.appendChild(p);
    return p;
  },
  open: function (id) {
    var p = document.getElementById(id); if (!p || this._open.indexOf(id) >= 0) return;
    this._open.push(id); N2.uiOpen = this._open.length;
    p.classList.add("on");
    for (var k in keys) keys[k] = false;   // drop held movement keys
    dragging = false;
    try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {}
    N2.emit("uiOpen", id);
  },
  close: function (id) {
    var i = this._open.indexOf(id); if (i < 0) return;
    this._open.splice(i, 1); N2.uiOpen = this._open.length;
    var p = document.getElementById(id); if (p) p.classList.remove("on");
    N2.emit("uiClose", id);
  },
  isOpen: function (id) { return id ? this._open.indexOf(id) >= 0 : this._open.length > 0; },
  top: function () { return this._open[this._open.length - 1] || null; },
  toggle: function (id) { if (this.isOpen(id)) this.close(id); else this.open(id); }
};
for (var _r in { tl: 1, tr: 1, bl: 1, br: 1, top: 1, center: 1 }) N2.ui.region(_r);
function applyHud() { document.body.classList.toggle("n2-nohud", !N2.settings.hud); }
applyHud();
N2.on("settings", function (s, key) { if (key === "hud") applyHud(); });
// the base only refreshes the bedroom focus prompt while inside the bedroom, so a
// "press E to sleep" line could linger into the first dream: clear it on leaving.
N2.on("dreamBuilt", function (z) {
  try { if (z && !z.bedroom && bedFocus) { bedFocus = null; if (hintEl && /^press E/.test(hintEl.textContent || "")) hintEl.style.opacity = "0"; } } catch (e) {}
}, -50);
// the base replays a remembered dream on ~16% of warps: hidden (story) worlds must never come
// back that way, so keep them — and the waking room — out of its memory list
N2.on("dreamBuilt", function () {
  try {
    if (memories && memories.length) memories = memories.filter(function (m) {
      if (!m || !m.recipe || m.recipe === "__bedroom") return false;
      var wi = N2.worldInfo[m.recipe]; return !(wi && wi.hidden);
    });
  } catch (e) {}
}, 200);

// a malformed nemuri_motifs save (from the original game) would make every dream build throw
// inside audio._rememberMotif: keep only well-formed motifs
try {
  if (!Array.isArray(audio._motifs)) audio._motifs = [];
  audio._motifs = audio._motifs.filter(function (m) { return m && typeof m === "object" && Array.isArray(m.seq); });
  if (!audio._heard || typeof audio._heard !== "object" || Array.isArray(audio._heard)) audio._heard = {};
} catch (e) {}

// one safe pointer-lock request for everyone: requestPointerLock returns a promise that rejects
// (an uncaught pageerror) without user activation — e.g. right after an Esc, which never counts as
// a gesture. Never lock under a panel or the pause menu, and never as part of an Esc close.
var _escClosing = false;
tryLock = function () {
  try {
    var el = renderer && renderer.domElement; if (!el || !el.requestPointerLock) return false;
    if (_escClosing || paused || N2.uiOpen) return false;
    var ua = navigator.userActivation; if (ua && !ua.isActive) return false;
    var p = el.requestPointerLock();
    if (p && typeof p.catch === "function") p.catch(function () {});
    return true;
  } catch (e) { return false; }
};
N2.relock = function () { return tryLock(); };

// Esc closes the top-most panel; H toggles the HUD. Priority 100 so it runs first.
N2.on("keydown", function (e) {
  if (N2.uiOpen && (e.code === "Escape")) { _escClosing = true; try { N2.ui.close(N2.ui.top()); } finally { _escClosing = false; } return true; }
  if (!N2.uiOpen && e.code === "KeyH" && phase !== "title") { N2.setSetting("hud", !N2.settings.hud); return true; }
  return false;
}, 100);

/* --------------------------------------------------------- world helper ---- */
// Registers a sequel world. builder(P, mood) returns a zone exactly like the
// hand-built worlds in the original (spawn, ground, fog, sky, flags, bounds...).
// opts: { valence: 1 | -1 | 0, tags: [..], title: "display name", hidden: bool }
// hidden worlds are not added to the random rotation (e.g. story set-pieces).
N2.worldInfo = {};
N2.registerWorld = function (name, builder, opts) {
  opts = opts || {};
  if (NEW_RECIPES[name] && N2.newWorlds.indexOf(name) < 0) { console.error("[N2] world name collides with an original world:", name); return false; }
  NEW_RECIPES[name] = builder;
  if (N2.newWorlds.indexOf(name) < 0) N2.newWorlds.push(name);
  N2.worldInfo[name] = { title: opts.title || null, tags: opts.tags || [], valence: opts.valence || 0, hidden: !!opts.hidden, sequel: true };
  if (!opts.hidden) {
    if (SCENE_NAMES.indexOf(name) < 0) SCENE_NAMES.push(name);
    if (ALL_NAMES.indexOf(name) < 0) ALL_NAMES.push(name);
    if (opts.valence > 0 && POSITIVE_RECIPES.indexOf(name) < 0) POSITIVE_RECIPES.push(name);
    if (opts.valence < 0 && NEGATIVE_RECIPES.indexOf(name) < 0) NEGATIVE_RECIPES.push(name);
  }
  return true;
};
// sequel worlds surface more often than their share of the ~900 originals would allow
var SEQUEL_SHARE = 0.3;
var _rollRecipe = rollRecipe;
rollRecipe = function () {
  var pool2 = N2.newWorlds.filter(function (n) { return !N2.worldInfo[n].hidden; });
  if (pool2.length && moodBias === 0 && Math.random() < SEQUEL_SHARE) return pickR(pool2);
  return _rollRecipe();
};
// "eye_meadow" -> "eye meadow"; "intLibrary" -> "library"
N2.prettyName = function (name) {
  if (!name) return "somewhere";
  if (name === "__bedroom") return "the waking room";
  var info = N2.worldInfo[name]; if (info && info.title) return info.title;
  return String(name).replace(/^int(?=[A-Z])/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
};

/* ------------------------------------------------------ spatial helpers ---- */
// true if (x,z) at feet height y is inside a solid collider of the current dream
N2.insideSolid = function (x, z, y) {
  for (var i = 0; i < gSolid.length; i++) {
    var s = gSolid[i]; if (y + 1.5 < s.y0 || y + 0.15 > s.y1) continue;
    var dx = x - s.x, dz = z - s.z;
    if (s.cyl) { if (dx * dx + dz * dz < (s.r + 0.6) * (s.r + 0.6)) return true; continue; }
    var ca = Math.cos(-s.ry), sa = Math.sin(-s.ry), lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
    if (Math.abs(lx) < s.hw + 0.6 && Math.abs(lz) < s.hd + 0.6) return true;
  }
  return false;
};
// ground height at (x,z) for the current dream, or null if there is no floor there
N2.groundAt = function (x, z) {
  try {
    groundClampY = pos.y + 40;
    var g = groundSampler(x, z);
    groundClampY = Infinity;
    if (!g || !g.on || !isFinite(g.y) || g.y < killY + 2) return null;
    return g.y;
  } catch (e) { groundClampY = Infinity; return null; }
};
// Finds a standable spot minD..maxD away from (ox,oz) (defaults to the player).
// Respects the dream boundary, ground and solids. Returns {x,y,z} or null.
N2.findSpot = function (minD, maxD, ox, oz, tries) {
  ox = ox == null ? pos.x : ox; oz = oz == null ? pos.z : oz; tries = tries || 60;
  for (var i = 0; i < tries; i++) {
    var a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
    var x = ox + Math.cos(a) * d, z = oz + Math.sin(a) * d;
    if (boundaryR > 0 && Math.hypot(x, z) > boundaryR - 3) continue;
    var y = N2.groundAt(x, z); if (y == null) continue;
    if (Math.abs(y - pos.y) > 14) continue;
    if (N2.insideSolid(x, z, y)) continue;
    return { x: x, y: y, z: z };
  }
  return null;
};
// simple additive glow sprite (a soft dot), useful for pickups and lights
var _glowTex = null;
N2.glowTexture = function () {
  if (_glowTex) return _glowTex;
  var c = document.createElement("canvas"); c.width = c.height = 64; var x = c.getContext("2d");
  var g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c); return _glowTex;
};
N2.glowSprite = function (color, size) {
  var m = new THREE.SpriteMaterial({ map: N2.glowTexture(), color: new THREE.Color(color == null ? 0xffffff : color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  var s = new THREE.Sprite(m); s.scale.set(size || 1, size || 1, 1); return s;
};
// adds an object to the CURRENT dream so it is disposed with it on the next warp
N2.addToDream = function (obj) { if (currentGroup) currentGroup.add(obj); else scene.add(obj); return obj; };
N2.dreamName = function () { return N2.lastZone ? N2.lastZone.archetypeName : null; };
N2.isDreaming = function () { return !inBedroom && N2.lastZone && !N2.lastZone.bedroom; };
N2.night = function () { return day; };

/* ---------------------------------------------------------- volume ducks ---- */
// Modules that hush the dream for a while (stillness, a nightmare's omen) register a duck; while
// any duck is active, no master-volume fade (pause resume, another module's restore) goes above
// the quietest one. Each duck expires on its own (ttl) so none can stick.
var _ducks = {};
function duckMin() {
  var m = null, t = performance.now();
  for (var k in _ducks) { var d = _ducks[k]; if (d.until < t) { delete _ducks[k]; continue; } if (m == null || d.level < m) m = d.level; }
  return m;
}
function installDuck() {
  if (!audio || typeof audio.fadeMaster !== "function" || audio.fadeMaster._n2duck) return;
  var prev = audio.fadeMaster;
  var f = function (v, t) { var m = duckMin(); if (m != null && v > m) v = m; return prev.call(this, v, t); };
  f._n2duck = true; audio.fadeMaster = f;
}
N2.duck = function (id, level, secs, ttl) {
  try {
    installDuck();
    _ducks[id] = { level: level, until: performance.now() + (ttl || 30) * 1000 };
    if (!paused) audio.fadeMaster(level, secs == null ? 0.6 : secs);
  } catch (e) {}
};
N2.unduck = function (id, secs, noFade) {
  try {
    if (!_ducks[id]) return false;
    delete _ducks[id];
    installDuck();
    if (!noFade && !paused && audio.ctx && !audio.muted) audio.fadeMaster(0.28, secs == null ? 1.2 : secs);   // clamped by any other duck
    return true;
  } catch (e) { return false; }
};
N2.ducked = function () { return duckMin(); };
N2.on("start", function () { try { installDuck(); } catch (e) {} });
N2.on("commitTransition", function () { _ducks = {}; });

/* ---------------------------------------------------------- tiny sounds ---- */
// a soft chime, usable by any module (respects mute through audio.master)
N2.chime = function (freq, dur, vol, type) {
  if (!audio.ctx || !audio.master) return;
  try {
    var c = audio.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine"; o.frequency.value = freq || 660;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 1.2));
    o.connect(g); g.connect(audio.master); if (audio.delay) g.connect(audio.delay);
    o.start(t); o.stop(t + (dur || 1.2) + 0.05);
  } catch (e) {}
};
