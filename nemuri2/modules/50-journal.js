/* =============================================================================
   nemuri II — 50-journal: the dream journal, recall, and the dream camera.
   * every dream entered is written down (name, nights, visits, palette) with a
     tiny thumbnail captured a couple of seconds in (afterRender: the WebGL canvas
     has no preserveDrawingBuffer, so it must be read in the same frame it is drawn)
   * J opens the journal: a two-page night-paper book with five ribbons —
     dreams / letters / photographs / powers / nights. keyboard + mouse, phone width.
   * recall (lucid power): from the waking room or the threshold, "dream of this again".
   * C: the dream camera. shutter, flash, polaroid preview, save image. emits "photo".
   save keys: "journal" (log + nights), "photos" (up to 24), "journal_t_<recipe>" (thumbs).
   API (N2.mods.journal): open(tab) close() entries() seenCount() has(recipe)
       photos() nights() snap() recall(recipe) canRecall(recipe) thumb(recipe) debug{}
   ============================================================================= */
var J = N2.mods.journal = {};

var THUMB_W = 160, THUMB_H = 96, THUMB_Q = 0.6;
var THUMB_MAX = 150, THUMB_BUDGET = 1100000;     // chars of data URL kept in storage
var PHOTO_MAX = 24, PHOTO_W = 720, PHOTO_Q = 0.72;
var NIGHTS_MAX = 80;
var PANEL = "n2-journal", POLA = "n2-polaroid";

N2.bind("KeyJ", "dream journal", "journal");
N2.bind("KeyC", "dream camera", "journal");

/* ================================================================= helpers */
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function hex(c) { try { if (c && c.getHexString) return c.getHexString(); } catch (e) {} return null; }
function col(h, fb) { return "#" + (h || fb || "8fa0c0"); }
function now() { return Date.now(); }
function wordOf(v) { return v < 0.15 ? "asleep" : v < 0.35 ? "stirring" : v < 0.6 ? "aware" : v < 0.85 ? "lucid" : "awake within"; }
function plural(n, a, b) { return n + " " + (n === 1 ? a : (b || a + "s")); }
function lucid() { return N2.mods.lucid || null; }
function story() { return N2.mods.story || null; }
function allNames() { try { return ALL_NAMES || []; } catch (e) { return []; } }
function nameOf(r) { try { return N2.prettyName(r); } catch (e) { return String(r); } }
function hiddenWorld(r) { var wi = N2.worldInfo && N2.worldInfo[r]; return !!(wi && wi.hidden); }

/* ==================================================================== data */
function freshData() { return { v: 1, dreams: {}, nights: {}, seq: 0, thumbs: {}, flags: {} }; }
var D = (function () {
  var d = N2.save.get("journal", null);
  if (!d || typeof d !== "object" || Array.isArray(d) || d.v !== 1) d = freshData();
  // repair a type-confused save member by member instead of failing on every dream
  function obj(o) { return o && typeof o === "object" && !Array.isArray(o) ? o : {}; }
  d.dreams = obj(d.dreams); d.nights = obj(d.nights); d.thumbs = obj(d.thumbs); d.flags = obj(d.flags);
  d.seq = isFinite(+d.seq) ? +d.seq : 0;
  var k;
  for (k in d.dreams) { var e = d.dreams[k]; if (!e || typeof e !== "object" || Array.isArray(e)) { delete d.dreams[k]; continue; } if (typeof e.r !== "string") e.r = k; e.v = +e.v || 0; e.s = +e.s || 0; e.f = Math.max(1, +e.f || +e.l || 1); e.l = Math.max(e.f, +e.l || e.f); if (e.n != null && typeof e.n !== "string") delete e.n; if (e.p != null && !Array.isArray(e.p)) delete e.p; }
  for (k in d.nights) { var r = d.nights[k]; if (!r || typeof r !== "object" || Array.isArray(r)) { delete d.nights[k]; continue; } if (!Array.isArray(r.d)) r.d = []; r.pk = +r.pk || 0; r.sh = +r.sh || 0; r.ph = +r.ph || 0; r.rc = +r.rc || 0; }
  for (k in d.thumbs) if (typeof d.thumbs[k] !== "number" || !isFinite(d.thumbs[k])) d.thumbs[k] = 0;
  return d;
})();
var PH = (function () { var p = N2.save.get("photos", []); return Array.isArray(p) ? p.filter(function (x) { return x && x.data; }) : []; })();
var dirty = false;
function flush() { dirty = false; return N2.save.set("journal", D); }
function touch() { dirty = true; }
var thumbCache = {};
function thumbOf(r) {
  if (thumbCache.hasOwnProperty(r)) return thumbCache[r];
  var t = D.thumbs[r] ? N2.save.get("journal_t_" + r, null) : null;
  if (t && typeof t !== "string") t = null;
  thumbCache[r] = t; return t;
}
function thumbTotal() { var s = 0; for (var k in D.thumbs) s += D.thumbs[k] || 0; return s; }
// drops the oldest stored thumbnail from storage (it stays visible for this session); returns chars freed
function evictThumb() {
  var oldest = null, ot = Infinity;
  for (var k in D.thumbs) { var e = D.dreams[k], t = e ? (e.th || 0) : 0; if (t < ot) { ot = t; oldest = k; } }
  if (oldest == null) return 0;
  var sz = D.thumbs[oldest] || 1;
  delete D.thumbs[oldest]; N2.save.remove("journal_t_" + oldest);
  if (D.dreams[oldest]) D.dreams[oldest].th = 0;
  return sz;
}
var storageFull = false;     // once storage refuses us, stop churning thumbnails for the rest of the session
function storeThumb(r, url) {
  try {
    thumbCache[r] = url;                       // kept for this session even if storage refuses it
    if (D.thumbs[r]) { delete D.thumbs[r]; N2.save.remove("journal_t_" + r); }
    var guard = 0;
    while ((Object.keys(D.thumbs).length >= THUMB_MAX || thumbTotal() + url.length > THUMB_BUDGET) && guard++ < 200) if (!evictThumb()) break;
    var ok = storageFull ? false : N2.save.set("journal_t_" + r, url), tries = 0;
    while (!ok && !storageFull && tries++ < 2 && evictThumb()) ok = N2.save.set("journal_t_" + r, url);
    if (!ok) { storageFull = true; N2.save.remove("journal_t_" + r); }
    else { D.thumbs[r] = url.length; if (D.dreams[r]) D.dreams[r].th = now(); }
    flush();
    return ok;
  } catch (e) { return false; }
}
function savePhotos() {
  var ok = N2.save.set("photos", PH);
  if (!ok) {                                   // make room: old thumbnails go first (they come back on a revisit)
    var need = PH.length ? PH[PH.length - 1].data.length * 1.6 : 0, freed = 0, f;
    while (!ok && thumbTotal() + freed >= need * 0.5 && freed < need && (f = evictThumb())) { freed += f; if (freed >= need * 0.5) { flush(); ok = N2.save.set("photos", PH); } }
    if (!ok && freed) { flush(); ok = N2.save.set("photos", PH); }
  }
  if (ok) {
    storageFull = false;
    var had = false; for (var i = 0; i < PH.length; i++) if (PH[i].mem) { delete PH[i].mem; had = true; }
    if (had) ok = N2.save.set("photos", PH);
  }
  return ok;
}
function nightRec(n) {
  n = n || day;
  var k = String(n), r = D.nights[k];
  if (!r) {
    r = D.nights[k] = { n: n, d: [], pk: 0, sh: 0, ph: 0, rc: 0, done: 0, t: now() };
    var ks = Object.keys(D.nights).map(Number).sort(function (a, b) { return a - b; });
    while (ks.length > NIGHTS_MAX) delete D.nights[String(ks.shift())];
  }
  return r;
}

/* ============================================================ the logging */
var want = null;          // { r, zone, tries } — a thumbnail still to capture for this dream
var lastLogged = null;
function logDream(z) {
  var r = z.archetypeName; if (!r || r === "__bedroom") return;
  var P = z.palette || {}, e = D.dreams[r], isNew = !e;
  if (!e) e = D.dreams[r] = { r: r, f: day, v: 0, t: now(), th: 0 };
  e.n = nameOf(r); e.l = day; e.v = (e.v || 0) + 1; e.lt = now(); e.s = ++D.seq;
  var p = [hex(P.sky || P.fog), hex(P.glow), hex(P.accent), hex(P.wallB || P.wallA), hex(P.figure)];
  if (p[0] || p[1]) e.p = p;
  if (z.mood && isFinite(z.mood.bright)) e.mb = Math.round(z.mood.bright * 100) / 100;
  if (z.corrupt) e.cx = (e.cx || 0) + 1;
  var nr = nightRec(day); nr.d.push(r); if (nr.d.length > 40) nr.d.shift();
  touch(); flush();
  var needThumb = !D.thumbs[r] || (e.v > 1 && Math.random() < 0.35);
  want = needThumb ? { r: r, zone: z, tries: 0, isNew: isNew } : null;
  lastLogged = { r: r, isNew: isNew };
  if (isNew && !needThumb) remembered(r, true);
}

N2.on("dreamBuilt", function (z) {
  try {
    if (!z) return;
    if (z.bedroom) { want = null; decorateBedroom(z); return; }
    logDream(z);
    if (!D.flags.hinted && D.seq >= 2) {
      D.flags.hinted = 1; touch();
      setTimeout(function () { try { N2.ui.toast("your dream journal remembers", "j to read it · c to keep a photograph"); } catch (e) {} }, 5200);
    }
  } catch (e) { if (window.console) console.error("[N2] journal dreamBuilt", e); }
});
N2.on("nightEnd", function (night, gp) {
  try { var r = nightRec(night); r.done = 1; if (gp) { r.mx = Math.round(gp.x * 100) / 100; r.my = Math.round(gp.y * 100) / 100; } flush(); } catch (e) {}
});
N2.on("lucidity", function (level) {
  try { if (!N2.isDreaming()) return; var r = nightRec(day); if (level > r.pk + 0.01) { r.pk = Math.round(level * 100) / 100; touch(); } } catch (e) {}
});
N2.on("shard", function () { try { nightRec(day).sh++; touch(); } catch (e) {} });
window.addEventListener("beforeunload", function () { try { if (dirty) flush(); } catch (e) {} });
var flushT = 0;
N2.on("frame", function (dt) { flushT += dt; if (flushT > 20) { flushT = 0; if (dirty) flush(); } });

/* ---- a tiny "written down" note in the corner when a new dream is logged ---- */
var noteEl = null, noteT = null;
function remembered(r, isNew) {
  try {
    if (!isNew) return;
    if (!noteEl) noteEl = N2.ui.el("div", "n2j-note", "", N2.ui.region("br"));
    noteEl.innerHTML = "<b>✎</b> " + esc(nameOf(r)) + " <span>· written down · " + seenCount() + "</span>";
    noteEl.classList.add("on"); if (noteT) clearTimeout(noteT);
    noteT = setTimeout(function () { noteEl.classList.remove("on"); }, 4200);
  } catch (e) {}
}

/* ========================================= capture (thumbnails + photos) */
var capC = null, capX = null, shotPending = false, lastShot = -1e9;
function captureThumb(final) {
  var w = want; if (!w) return;
  var src = renderer && renderer.domElement; if (!src || !src.width) return;
  if (!capC) { capC = document.createElement("canvas"); capC.width = THUMB_W; capC.height = THUMB_H; capX = capC.getContext("2d", { willReadFrequently: true }) || capC.getContext("2d"); }
  var W = src.width, H = src.height, ar = THUMB_W / THUMB_H, cw, ch;
  if (W / H > ar) { ch = H; cw = H * ar; } else { cw = W; ch = W / ar; }
  capX.imageSmoothingEnabled = true;
  capX.drawImage(src, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, THUMB_W, THUMB_H);
  // a dream that is still mostly white (arriving) or black (nothing drawn) waits a little
  var px = capX.getImageData(0, 0, THUMB_W, THUMB_H).data, sum = 0, n = 0;
  for (var i = 0; i < px.length; i += 4 * 37) { sum += px[i] + px[i + 1] + px[i + 2]; n++; }
  var avg = sum / (n * 3);
  w.tries++;
  if (avg < 4 || avg > 246) { if (final || w.tries >= 4) want = null; return; }
  var url = capC.toDataURL("image/jpeg", THUMB_Q);
  want = null;
  storeThumb(w.r, url);
  if (!w.noted) remembered(w.r, w.isNew);
  if (ui.open && ui.tab === "dreams") render();
}
var waitT = 0;
// Reading the WebGL canvas back is a synchronous GPU stall (0.1-0.8 s on software GL), so a
// thumbnail is never taken while you walk: it waits for a quiet moment — the first frame of the
// warp out (the dream still fully visible, the screen about to go white), pausing, or a panel opening.
var capArm = false;
N2.on("warp", function () { if (want && N2.lastZone === want.zone && timeInDream > 1.2) capArm = true; });
N2.on("uiOpen", function () { if (want && N2.lastZone === want.zone && phase === "play" && timeInDream > 1.2) capArm = true; });
var _wasPaused = false;
N2.on("afterRender", function () {
  try {
    if (shotPending) { shotPending = false; try { takePhoto(); } catch (e2) { document.body.classList.remove("n2j-snap"); if (window.console) console.error("[N2] journal photo", e2); } }
    if (!want) { capArm = false; _wasPaused = paused; return; }
    if (paused && !_wasPaused && phase === "play" && N2.lastZone === want.zone && timeInDream > 1.2) capArm = true;
    _wasPaused = paused;
    if (N2.lastZone !== want.zone) { capArm = false; return; }
    // the "written down" note still appears a couple of seconds in, without touching the canvas
    if (!want.noted && phase === "play" && !paused && !N2.uiOpen && timeInDream > 2.4 && fade < 0.02) { want.noted = true; remembered(want.r, want.isNew); }
    if (capArm && fade < 0.06) { capArm = false; captureThumb(true); }
  } catch (e) { want = null; }
});

/* ---- the camera ---- */
var flashEl = null, lastFull = null;
function shutterSound() {
  if (!audio.ctx) return;
  try {
    audio.noise(0.05, "highpass", 4200, 2400, 0.16, 0);
    setTimeout(function () { try { audio.noise(0.09, "bandpass", 1500, 700, 0.12, 0); audio.tone(180, "triangle", 0.05, 0.003, 0.08, 0); } catch (e) {} }, 85);
    setTimeout(function () { N2.chime(1568, 1.6, 0.03); N2.chime(2349, 1.2, 0.015); }, 260);
  } catch (e) {}
}
function snap() {
  var t = performance.now();
  if (!N2.canAct() || t - lastShot < 900 || shotPending || !renderer) return false;
  lastShot = t;
  document.body.classList.add("n2j-snap");
  shotPending = true;                       // read on the very next afterRender
  return true;
}
function stamp(x, W, H, text) {
  var fs = Math.max(10, Math.round(H * 0.026));
  x.save();
  x.font = fs + "px ui-monospace, Menlo, Consolas, monospace";
  x.textAlign = "right"; x.textBaseline = "alphabetic";
  x.shadowColor = "rgba(255,120,40,.85)"; x.shadowBlur = fs * 0.5;
  x.fillStyle = "rgba(255,182,104,.88)";
  x.fillText(text, W - fs * 1.4, H - fs * 1.2);
  x.restore();
}
function takePhoto() {
  var src = renderer.domElement, W = src.width, H = src.height;
  var r = N2.lastZone && !N2.lastZone.bedroom ? N2.lastZone.archetypeName : "__bedroom";
  var nm = inBedroom ? "the waking room" : nameOf(r);
  // the sequel lenses draw straight into a low-res canvas (~288 lines): enlarge it with
  // crisp nearest-neighbour pixels so the photo keeps the dream's pixel look and the
  // date stamp stays small and sharp
  var k = H > 0 && H < 480 ? Math.ceil(540 / H) : 1;
  W *= k; H *= k;
  var c = document.createElement("canvas"); c.width = W; c.height = H;
  var x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, W, H);
  stamp(x, W, H, "night " + day + " · " + nm);
  var full = null; try { full = c.toDataURL("image/jpeg", 0.92); } catch (e) {}
  // stored copy: native pixels for the low-res lenses (keeps localStorage small), else capped at PHOTO_W
  var c2 = document.createElement("canvas"), x2;
  if (k > 1) { c2.width = src.width; c2.height = src.height; x2 = c2.getContext("2d"); x2.drawImage(src, 0, 0); stamp(x2, c2.width, c2.height, "night " + day + " · " + nm); }
  else { var sc = Math.min(1, PHOTO_W / W); c2.width = Math.round(W * sc); c2.height = Math.round(H * sc); x2 = c2.getContext("2d"); x2.imageSmoothingEnabled = true; x2.drawImage(c, 0, 0, c2.width, c2.height); }
  var small = c2.toDataURL("image/jpeg", PHOTO_Q);
  var rec = { id: now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), t: now(), n: day, r: r, nm: nm, w: c2.width, h: c2.height, data: small };
  var faded = null;
  PH.push(rec);
  while (PH.length > PHOTO_MAX) faded = PH.shift();
  var stored = savePhotos();
  if (!stored) { rec.mem = 1; }
  lastFull = full || small;
  try { nightRec(day).ph++; touch(); flush(); } catch (e) {}
  // flash + sound
  if (!flashEl) { flashEl = N2.ui.el("div", "", "", document.body); flashEl.id = "n2j-flash"; }
  flashEl.style.transition = "none"; flashEl.style.opacity = "0.92"; void flashEl.offsetWidth;
  flashEl.style.transition = "opacity .9s ease-out"; flashEl.style.opacity = "0";
  shutterSound();
  try { N2.emit("photo", small, { id: rec.id, night: rec.n, recipe: r, name: nm, anomaly: !!emergent }); } catch (e) {}
  setTimeout(function () {
    document.body.classList.remove("n2j-snap");
    showPolaroid(rec, faded, stored);
  }, 420);
}

/* ================================================================= styles */
var PAPER = null;
function paperTex() {
  if (PAPER) return PAPER;
  try {
    var S = 220, c = document.createElement("canvas"); c.width = c.height = S;
    var x = c.getContext("2d"), img = x.createImageData(S, S), d = img.data, sd = 7;
    function rnd() { sd = (sd * 16807) % 2147483647; return sd / 2147483647; }
    for (var i = 0; i < d.length; i += 4) { var v = rnd(); d[i] = 196; d[i + 1] = 210; d[i + 2] = 240; d[i + 3] = Math.floor(v * v * v * 18); }
    x.putImageData(img, 0, 0);
    for (var f = 0; f < 150; f++) {
      x.strokeStyle = "rgba(205,218,250," + (0.025 + rnd() * 0.06).toFixed(3) + ")"; x.lineWidth = 0.6;
      var px = rnd() * S, py = rnd() * S, a = rnd() * 6.28, L = 4 + rnd() * 14;
      x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a + 0.6) * L * 0.5, py + Math.sin(a + 0.6) * L * 0.5, px + Math.cos(a) * L, py + Math.sin(a) * L); x.stroke();
    }
    for (var s = 0; s < 40; s++) { x.fillStyle = "rgba(8,12,26," + (0.05 + rnd() * 0.1).toFixed(3) + ")"; x.fillRect(rnd() * S, rnd() * S, 1, 1); }
    PAPER = c.toDataURL("image/png");
  } catch (e) { PAPER = ""; }
  return PAPER;
}
var SERIF = "'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,'Hiragino Mincho ProN','Yu Mincho',serif";
var MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";
N2.ui.css([
  /* hud bits */
  ".n2j-note{opacity:0;transition:opacity 1.2s ease;color:var(--n2-dim);font-size:10.5px;letter-spacing:.16em;white-space:nowrap;text-shadow:0 0 8px rgba(0,0,0,.7);}",
  ".n2j-note.on{opacity:.85;}.n2j-note b{font-weight:normal;color:var(--n2-gold);}.n2j-note span{opacity:.7;}",
  "body.n2j-snap #hud,body.n2j-snap .n2-region,body.n2j-snap #n2s-letter{opacity:0!important;transition:none!important;}",
  "#n2j-flash{position:fixed;inset:0;z-index:79;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 50%,#fffdf6,#f4ecdc 60%,#e6dcc8);}",
  /* the panel + book */
  "#n2-journal{background:radial-gradient(ellipse at 50% 38%,rgba(22,34,64,.86),rgba(4,6,13,.97) 72%);}",
  "#n2-journal>.n2-sheet{width:auto;max-height:none;overflow:visible;border:0;background:none;box-shadow:none;padding:0;}",
  ".jb{--pg:#141c32;--pg2:#10172a;--ink:#e8e2cf;--ink2:#b9bfcf;--dim:#7d8aa3;--gold:#f0d79a;--teal:#8fd0d2;--rose:#e0a6c8;--amber:#e8a860;--lilac:#b4a6e6;--line:rgba(143,208,210,.075);",
  "position:relative;width:min(96vw,1060px);font-family:" + MONO + ";color:var(--ink);opacity:0;transform:translateY(14px) scale(.985);transition:opacity .55s ease,transform .7s cubic-bezier(.2,.8,.2,1);}",
  "#n2-journal.on .jb.in{opacity:1;transform:none;}",
  ".jtabs{display:flex;gap:4px;padding:0 0 0 34px;height:34px;align-items:flex-end;position:relative;z-index:2;}",
  ".jtab{font:inherit;font-size:11px;letter-spacing:.2em;color:var(--dim);background:#0d1324;border:1px solid rgba(160,190,210,.14);border-bottom:0;border-radius:7px 7px 0 0;padding:7px 14px 6px;height:26px;cursor:pointer;",
  "position:relative;transition:height .3s ease,color .3s,background .3s;text-transform:lowercase;white-space:nowrap;}",
  ".jtab::before{content:'';position:absolute;left:8px;right:8px;top:0;height:2px;border-radius:2px;background:var(--c);opacity:.55;}",
  ".jtab:hover{color:var(--ink);height:30px;}",
  ".jtab.on{height:34px;color:var(--ink);background:var(--pg);border-color:rgba(160,190,210,.2);}",
  ".jtab.on::before{opacity:1;box-shadow:0 0 10px var(--c);}",
  ".jtab .k{font-size:9px;opacity:.45;margin-left:6px;letter-spacing:0;}",
  ".jsp{position:relative;display:grid;grid-template-columns:1fr 1fr;height:min(80vh,640px);border-radius:4px 12px 12px 4px;",
  "box-shadow:0 0 0 5px #0a0f1d,0 0 0 6px rgba(240,215,154,.16),0 36px 90px rgba(0,0,0,.65),0 0 140px rgba(110,140,220,.12);}",
  ".jpg{position:relative;min-height:0;background-color:var(--pg);background-image:var(--paper),linear-gradient(180deg,rgba(255,255,255,.018),rgba(0,0,0,.08));display:flex;flex-direction:column;overflow:hidden;}",
  ".jl{border-radius:10px 2px 2px 10px;box-shadow:inset -34px 0 36px -26px rgba(0,0,0,.75),inset 0 0 60px rgba(0,0,0,.25);}",
  ".jr{border-radius:2px 10px 10px 2px;box-shadow:inset 34px 0 36px -26px rgba(0,0,0,.75),inset 0 0 60px rgba(0,0,0,.25);}",
  ".jgut{position:absolute;left:50%;top:0;bottom:0;width:2px;margin-left:-1px;background:linear-gradient(180deg,rgba(0,0,0,.0),rgba(0,0,0,.55) 12%,rgba(0,0,0,.55) 88%,rgba(0,0,0,0));z-index:1;pointer-events:none;}",
  ".jrib{position:absolute;right:16px;top:-6px;width:12px;height:76px;background:linear-gradient(180deg,#b8584e,#8e3d3a);clip-path:polygon(0 0,100% 0,100% 100%,50% 86%,0 100%);opacity:.8;z-index:3;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,.5);}",
  ".jhd{flex:none;padding:22px 30px 10px 44px;position:relative;}",
  ".jhd::after{content:'';position:absolute;left:30px;top:0;bottom:-2000px;width:1px;background:rgba(224,166,200,.14);}",
  ".jbt{display:flex;justify-content:space-between;align-items:baseline;font-family:" + SERIF + ";font-style:italic;font-size:15px;letter-spacing:.06em;color:var(--ink2);}",
  ".jbt .jp{font-style:normal;font-size:11px;letter-spacing:.3em;color:var(--dim);opacity:.8;}",
  ".jbig{margin:14px 0 2px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}",
  ".jbig b{font-family:" + SERIF + ";font-weight:normal;font-size:30px;color:var(--gold);text-shadow:0 0 18px rgba(240,215,154,.25);letter-spacing:.02em;}",
  ".jbig span{font-size:11px;letter-spacing:.2em;color:var(--ink2);}",
  ".jbar{height:2px;margin:8px 0 6px;background:rgba(160,190,210,.12);border-radius:2px;overflow:hidden;}",
  ".jbar i{display:block;height:100%;background:linear-gradient(90deg,var(--teal),var(--gold));box-shadow:0 0 8px var(--gold);}",
  ".jsub{font-size:10px;letter-spacing:.18em;color:var(--dim);line-height:1.7;}",
  ".jchips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;}",
  ".jchip{font:inherit;font-size:10px;letter-spacing:.16em;color:var(--dim);background:none;border:1px solid rgba(160,190,210,.16);border-radius:20px;padding:3px 10px;cursor:pointer;}",
  ".jchip:hover{color:var(--ink);}.jchip.on{color:var(--pg);background:var(--gold);border-color:var(--gold);}",
  ".jls{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:8px 26px 26px 44px;scrollbar-width:thin;scrollbar-color:rgba(160,190,210,.2) transparent;}",
  ".jls::-webkit-scrollbar,.jdt::-webkit-scrollbar{width:6px;}.jls::-webkit-scrollbar-thumb,.jdt::-webkit-scrollbar-thumb{background:rgba(160,190,210,.18);border-radius:3px;}",
  ".jfade{animation:jIn .45s ease both;}@keyframes jIn{from{opacity:0;transform:translateX(6px);}to{opacity:1;transform:none;}}",
  ".jgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:18px 14px;padding-top:6px;}",
  ".ji{font:inherit;color:inherit;text-align:left;background:none;border:0;padding:0;cursor:pointer;display:block;width:100%;outline:none;}",
  ".jc .jph{position:relative;display:block;aspect-ratio:5/3;background:#e8e2d2;padding:3px;transform:rotate(var(--rot,0deg));box-shadow:0 3px 10px rgba(0,0,0,.45);transition:transform .35s ease,box-shadow .35s ease;}",
  ".jph .im{display:block;width:100%;height:100%;background-size:cover;background-position:center;image-rendering:pixelated;}",
  ".jph .tape{position:absolute;left:50%;top:-6px;width:34px;height:11px;margin-left:-17px;background:var(--g);opacity:.55;transform:rotate(calc(var(--rot,0deg) * -3));box-shadow:0 1px 2px rgba(0,0,0,.25);}",
  ".jc .jnm{display:block;margin-top:9px;font-family:" + SERIF + ";font-style:italic;font-size:13.5px;line-height:1.25;color:var(--ink);letter-spacing:.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
  ".jc .jmt{display:block;margin-top:2px;font-size:9.5px;letter-spacing:.14em;color:var(--dim);}",
  ".jc .jmt .dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:2px;vertical-align:0;background:var(--g);box-shadow:0 0 5px var(--g);}",
  ".jc:hover .jph{transform:rotate(0deg) translateY(-2px);box-shadow:0 8px 18px rgba(0,0,0,.5);}",
  ".ji.sel .jph{transform:rotate(0deg) translateY(-3px);box-shadow:0 0 0 2px var(--gold),0 0 22px rgba(240,215,154,.35),0 8px 18px rgba(0,0,0,.5);}",
  ".ji.sel .jnm{color:var(--gold);}",
  ".jnew{display:inline-block;font-style:normal;font-family:" + MONO + ";font-size:8.5px;letter-spacing:.14em;color:var(--teal);border:1px solid rgba(143,208,210,.35);border-radius:3px;padding:0 4px;margin-left:5px;vertical-align:2px;}",
  /* list rows (letters / powers / nights) */
  ".jrow{display:flex;gap:12px;align-items:flex-start;padding:9px 10px 9px 8px;margin:0 -10px 2px -8px;border-radius:6px;border-left:2px solid transparent;transition:background .25s;}",
  ".jrow:hover{background:rgba(160,190,210,.05);}",
  ".jrow.sel{background:rgba(240,215,154,.07);border-left-color:var(--gold);}",
  ".jrow .gl{flex:none;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--gold);border:1px solid rgba(240,215,154,.3);box-shadow:inset 0 0 10px rgba(240,215,154,.12);}",
  ".jrow .gl.off{color:rgba(160,175,200,.3);border-color:rgba(160,175,200,.14);box-shadow:none;}",
  ".jrow .tx{flex:1;min-width:0;}",
  ".jrow .t1,.jrow .t2,.jrow .t3{display:block;}",
  ".jrow .t1{font-family:" + SERIF + ";font-style:italic;font-size:14px;color:var(--ink);line-height:1.35;}",
  ".jrow.sel .t1{color:var(--gold);}",
  ".jrow .t2{font-size:9.5px;letter-spacing:.15em;color:var(--dim);margin-top:3px;line-height:1.6;}",
  ".jrow .t3{font-size:11.5px;line-height:1.6;color:var(--ink2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
  ".jch{font-size:10px;letter-spacing:.32em;color:var(--teal);margin:18px 0 6px;opacity:.85;}",
  ".jch:first-child{margin-top:4px;}",
  ".jun{font-size:11px;letter-spacing:.5em;color:rgba(160,175,200,.22);padding:6px 0 6px 2px;}",
  ".jdots{display:flex;gap:3px;margin-top:6px;flex-wrap:wrap;}.jdots i{width:7px;height:7px;border-radius:50%;background:var(--g);opacity:.85;box-shadow:0 0 4px var(--g);}",
  /* polaroids */
  ".jpgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(126px,1fr));gap:20px 16px;padding-top:8px;}",
  ".jpol{display:block;background:#ece6d6;padding:6px 6px 22px;transform:rotate(var(--rot,0deg));box-shadow:0 4px 14px rgba(0,0,0,.5);transition:transform .35s,box-shadow .35s;position:relative;}",
  ".jpol .im{display:block;width:100%;aspect-ratio:16/10;background-size:cover;background-position:center;background-color:#222;}",
  ".jpol .cap{position:absolute;left:8px;right:8px;bottom:4px;font-family:" + SERIF + ";font-style:italic;font-size:11px;color:#3b3654;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
  ".jc:hover .jpol{transform:rotate(0) translateY(-2px);}",
  ".ji.sel .jpol{transform:rotate(0) translateY(-3px);box-shadow:0 0 0 2px var(--gold),0 0 24px rgba(240,215,154,.35),0 8px 18px rgba(0,0,0,.5);}",
  /* right page: detail */
  ".jdt{flex:1;min-height:0;overflow-y:auto;padding:30px 40px 30px 40px;position:relative;}",
  ".jey{font-size:10px;letter-spacing:.3em;color:var(--dim);margin-bottom:16px;display:flex;justify-content:space-between;gap:10px;}",
  ".jfig{position:relative;width:min(100%,calc(28vh * 1.6667));margin:0 0 20px;background:#e9e3d3;padding:6px;box-shadow:0 10px 30px rgba(0,0,0,.55);transform:rotate(-.6deg);}",
  ".jfig .im{display:block;width:100%;aspect-ratio:5/3;background-size:cover;background-position:center;image-rendering:pixelated;}",
  ".jfig .tape{position:absolute;top:-8px;width:58px;height:16px;background:var(--g);opacity:.5;box-shadow:0 1px 2px rgba(0,0,0,.25);}",
  ".jfig .tape.a{left:-14px;transform:rotate(-28deg);top:4px;}.jfig .tape.b{right:-14px;transform:rotate(24deg);top:4px;}",
  ".jtt{font-family:" + SERIF + ";font-style:italic;font-weight:normal;font-size:27px;line-height:1.15;color:var(--gold);margin:0 0 8px;letter-spacing:.01em;text-shadow:0 0 22px rgba(240,215,154,.2);}",
  ".jmeta{font-size:10.5px;letter-spacing:.16em;color:var(--ink2);line-height:1.8;}",
  ".jmeta b{font-weight:normal;color:var(--teal);}",
  ".jline{font-family:" + SERIF + ";font-style:italic;font-size:15px;line-height:1.75;color:var(--ink);margin:18px 0 18px;padding-left:14px;border-left:1px solid rgba(240,215,154,.3);}",
  ".jpal{display:flex;gap:14px;flex-wrap:wrap;margin:4px 0 22px;}",
  ".jpal div{display:flex;flex-direction:column;align-items:center;gap:5px;font-size:8.5px;letter-spacing:.18em;color:var(--dim);}",
  ".jpal i{width:26px;height:26px;background:var(--g);border-radius:52% 48% 55% 45%/48% 55% 45% 52%;box-shadow:0 0 0 1px rgba(0,0,0,.25),0 0 12px var(--g);opacity:.92;}",
  ".jact{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px;}",
  ".jbtn{font:inherit;font-size:11px;letter-spacing:.2em;color:var(--ink);background:rgba(160,190,210,.04);border:1px solid rgba(160,190,210,.28);border-radius:3px;padding:9px 16px;cursor:pointer;text-decoration:none;text-transform:lowercase;display:inline-flex;gap:8px;align-items:center;}",
  ".jbtn:hover{border-color:var(--gold);color:#fff;background:rgba(240,215,154,.08);}",
  ".jbtn.pri{color:#1a1626;background:linear-gradient(180deg,#f6e3ad,#e7c982);border-color:#f0d79a;box-shadow:0 0 22px rgba(240,215,154,.3);}",
  ".jbtn.pri:hover{color:#000;background:linear-gradient(180deg,#fff0c4,#f0d79a);}",
  ".jbtn.warn{border-color:rgba(224,166,200,.5);color:var(--rose);}",
  ".jbtn kbd,.jft kbd{font:inherit;font-size:9px;letter-spacing:.06em;opacity:.65;border:1px solid currentColor;border-radius:3px;padding:0 4px;}",
  ".jnote{font-size:10.5px;letter-spacing:.14em;color:var(--dim);line-height:1.7;}",
  ".jempty{margin:40px 4px;font-family:" + SERIF + ";font-style:italic;font-size:15px;line-height:1.9;color:var(--ink2);text-align:center;}",
  ".jempty small{display:block;font-family:" + MONO + ";font-style:normal;font-size:10px;letter-spacing:.18em;color:var(--dim);margin-top:10px;}",
  ".jletter{font-family:" + SERIF + ";font-size:16.5px;line-height:1.95;color:var(--ink);letter-spacing:.01em;white-space:pre-wrap;margin:6px 0 18px;text-shadow:0 0 16px rgba(240,215,154,.08);}",
  ".jletter::first-letter{font-size:1.45em;color:var(--gold);font-style:italic;}",
  ".jsig{font-family:" + SERIF + ";font-style:italic;font-size:13px;color:var(--ink2);text-align:right;margin-bottom:18px;}",
  ".jbigpol{background:#ece6d6;padding:10px 10px 46px;box-shadow:0 14px 36px rgba(0,0,0,.6);transform:rotate(1deg);position:relative;margin:0 4px 22px;}",
  ".jbigpol .im{display:block;width:100%;background-size:cover;background-position:center;background-color:#111;}",
  ".jbigpol .cap{position:absolute;left:14px;right:14px;bottom:10px;font-family:" + SERIF + ";font-style:italic;font-size:16px;color:#2e2a45;display:flex;justify-content:space-between;align-items:baseline;}",
  ".jbigpol .cap small{font-family:" + MONO + ";font-style:normal;font-size:9.5px;letter-spacing:.16em;color:#77708c;}",
  ".jpow{width:86px;height:86px;border-radius:50%;margin:8px 0 20px;display:flex;align-items:center;justify-content:center;font-size:38px;color:var(--gold);border:1px solid rgba(240,215,154,.4);",
  "box-shadow:0 0 40px rgba(240,215,154,.16),inset 0 0 26px rgba(240,215,154,.14);background:radial-gradient(circle,rgba(240,215,154,.1),transparent 70%);}",
  ".jpow.off{color:rgba(160,175,200,.35);border-color:rgba(160,175,200,.2);box-shadow:none;background:none;}",
  ".jmeter{height:3px;background:rgba(160,190,210,.12);border-radius:2px;margin:10px 0 4px;overflow:hidden;}.jmeter i{display:block;height:100%;background:linear-gradient(90deg,var(--teal),var(--gold));}",
  ".jsky{display:block;width:100%;height:auto;margin:4px 0 16px;border-radius:6px;background:radial-gradient(ellipse at 50% 120%,rgba(60,80,140,.25),rgba(0,0,0,.0) 70%),rgba(4,7,16,.45);box-shadow:inset 0 0 30px rgba(0,0,0,.5);}",
  ".jol{margin:0 0 10px;padding:0;list-style:none;counter-reset:n;}",
  ".jol li{counter-increment:n;display:flex;gap:10px;align-items:center;padding:4px 0;font-family:" + SERIF + ";font-style:italic;font-size:13.5px;color:var(--ink);cursor:pointer;}",
  ".jol li:hover{color:var(--gold);}",
  ".jol li::before{content:counter(n);font-family:" + MONO + ";font-style:normal;font-size:9px;color:var(--dim);width:16px;text-align:right;}",
  ".jol li i{width:8px;height:8px;border-radius:50%;background:var(--g);box-shadow:0 0 6px var(--g);flex:none;}",
  ".jstats{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;margin:8px 0 18px;}",
  ".jstats div{font-size:9.5px;letter-spacing:.18em;color:var(--dim);}.jstats b{display:block;font-family:" + SERIF + ";font-weight:normal;font-style:italic;font-size:17px;letter-spacing:.02em;color:var(--ink);margin-top:2px;}",
  ".jback{display:none;}",
  ".jwait{margin:18% auto 0;text-align:center;font-size:10px;letter-spacing:.22em;color:var(--dim);}",
  ".jwait .moon{width:90px;height:90px;margin:0 auto 22px;border-radius:50%;box-shadow:inset -18px 8px 0 0 rgba(240,215,154,.5);filter:drop-shadow(0 0 16px rgba(240,215,154,.25));transform:rotate(-20deg);opacity:.75;}",
  ".jb.recall{opacity:0!important;transform:scale(1.05)!important;filter:brightness(1.9) blur(2px);transition:opacity .65s ease,transform .7s ease,filter .65s ease!important;}",
  ".jft{margin-top:14px;text-align:center;font-size:10px;letter-spacing:.18em;color:var(--dim);opacity:.8;line-height:2;}",
  ".jft span{margin:0 8px;white-space:nowrap;}",
  ".jx{position:absolute;right:-4px;top:2px;font:inherit;font-size:11px;letter-spacing:.2em;color:var(--dim);background:none;border:0;cursor:pointer;padding:6px 8px;z-index:4;}.jx:hover{color:var(--gold);}",
  "@media (max-width:760px){",
  " .jb{width:100vw;}",
  " .jtabs{padding:0 8px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;}.jtabs::-webkit-scrollbar{display:none;}",
  " .jtab{padding:7px 10px 6px;font-size:10px;letter-spacing:.14em;}.jtab .k{display:none;}",
  " .jtabs{padding-right:104px;}",
  " .jx{position:fixed;top:calc(2px + env(safe-area-inset-top));right:calc(4px + env(safe-area-inset-right));height:34px;min-width:84px;padding:0 12px;color:var(--ink2);background:#0d1324;border:1px solid rgba(160,190,210,.24);border-bottom:0;border-radius:7px 7px 0 0;z-index:90;}",
  " .jsp{grid-template-columns:1fr;height:calc(100vh - 40px);border-radius:0;box-shadow:none;}",
  " .jl{border-radius:0;}.jgut,.jrib{display:none;}",
  " .jr{position:absolute;inset:0;border-radius:0;transform:translateX(104%);transition:transform .45s cubic-bezier(.2,.8,.2,1);z-index:3;box-shadow:-20px 0 40px rgba(0,0,0,.5);}",
  " .jb.det .jr{transform:none;}",
  " .jhd{padding:16px 18px 8px 30px;}.jhd::after{left:18px;}",
  " .jls{padding:6px 16px 22px 30px;}",
  " .jdt{padding:18px 20px 26px;}",
  " .jbig b{font-size:24px;}.jtt{font-size:23px;}",
  " .jgrid{grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:14px 10px;}",
  " .jpgrid{grid-template-columns:repeat(auto-fill,minmax(110px,1fr));}",
  " .jback{display:inline-block;font:inherit;font-size:10px;letter-spacing:.2em;color:var(--dim);background:none;border:1px solid rgba(160,190,210,.2);border-radius:3px;padding:5px 10px;margin-bottom:14px;cursor:pointer;}",
  " .jft{display:none;}",
  "}",
  /* the polaroid preview after a photo */
  "#n2-polaroid{background:radial-gradient(ellipse at 50% 45%,rgba(10,14,28,.55),rgba(3,4,10,.86));}",
  "#n2-polaroid>.n2-sheet{width:auto;max-height:none;overflow:visible;border:0;background:none;box-shadow:none;padding:0;display:flex;flex-direction:column;align-items:center;}",
  ".jpv{background:#efe9da;padding:14px 14px 64px;width:min(84vw,560px);box-shadow:0 26px 70px rgba(0,0,0,.7),0 0 0 1px rgba(0,0,0,.2);position:relative;",
  "transform:translateY(40px) rotate(-5deg) scale(.92);opacity:0;transition:transform .9s cubic-bezier(.2,.9,.25,1.05),opacity .5s ease;}",
  ".jpv.in{transform:rotate(-1.6deg);opacity:1;}",
  ".jpv .im{display:block;width:100%;image-rendering:pixelated;background-size:cover;background-position:center;background-color:#2a2a30;filter:brightness(2.1) contrast(.45) saturate(0) blur(1.5px);opacity:.55;transition:filter 3.2s ease .3s,opacity 2.4s ease .2s;}",
  ".jpv.dev .im{filter:none;opacity:1;}",
  ".jpv .cap{position:absolute;left:18px;right:18px;bottom:16px;display:flex;justify-content:space-between;align-items:baseline;gap:10px;}",
  ".jpv .cap b{font-family:" + SERIF + ";font-style:italic;font-weight:normal;font-size:21px;color:#2d2944;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
  ".jpv .cap small{font-family:" + MONO + ";font-size:10px;letter-spacing:.16em;color:#7a738d;white-space:nowrap;}",
  ".jpa{display:flex;gap:10px;margin-top:26px;flex-wrap:wrap;justify-content:center;font-family:" + MONO + ";opacity:0;transition:opacity .8s ease .5s;}",
  ".jpv.in+.jpa{opacity:1;}",
  ".jpa .jbtn:not(.pri){color:#e8e2cf;}",
  ".jpn{margin-top:12px;font-family:" + MONO + ";font-size:10px;letter-spacing:.16em;color:#7d8aa3;text-align:center;min-height:1em;}"
].join("\n"), "n2-journal-css");

/* ================================================================ content */
var LINES = [
  "you remember the colour more than the shape.",
  "there was a sound here, just under hearing.",
  "you were small here, or it was very large.",
  "someone had just left. the air was still warm.",
  "the light came from nowhere you could point to.",
  "you meant to stay longer.",
  "it felt like the middle of a long afternoon.",
  "you knew the way without knowing it.",
  "everything waited, politely, for you to go on.",
  "you think it was raining somewhere behind you.",
  "the far end was the part that mattered.",
  "you have never been here awake, and yet.",
  "it smelled of dust, and of something sweet.",
  "you were not afraid, which surprised you.",
  "the horizon kept its distance, kindly.",
  "it was quieter than any room you know.",
  "you touched something and it remembered you.",
  "the ground was softer than it looked.",
  "you can still feel the weight of the air.",
  "it was almost a place you used to live.",
  "the shadows were the wrong colour, and that was fine.",
  "you woke before the end of it.",
  "it hummed, very faintly, the whole time.",
  "there was a door you didn't open."
];
var LINES_AGAIN = ["you keep coming back here. it keeps a light on for you.", "it knows your footsteps now.", "each time, a little more of it stays with you.", "you could walk it with your eyes closed by now.", "it is starting to feel like somewhere you belong."];
var LINES_DARK = ["you didn't like the way it watched.", "something there was holding its breath.", "you left quickly, and it let you.", "the dark there had edges.", "you are glad you woke."];
function lineFor(e) {
  var h = hash(e.r);
  if ((e.v || 0) >= 3 && (h & 1)) return LINES_AGAIN[(h >>> 3) % LINES_AGAIN.length];
  if (e.mb != null && e.mb < -0.35) return LINES_DARK[(h >>> 2) % LINES_DARK.length];
  return LINES[(h >>> 1) % LINES.length];
}
function moodWord(r) {
  if (!r || r.mx == null) return r && r.done ? "a night without a shape" : "still dreaming";
  var x = r.mx, y = r.my, b = y > 0.25 ? "bright" : y < -0.25 ? "dark" : "", e = x > 0.25 ? "restless" : x < -0.25 ? "still" : "";
  if (b && e) return "a " + b + ", " + e + " night";
  if (b) return "a " + b + " night"; if (e) return "a " + e + " night";
  return "an even, grey night";
}
var TABS = [
  { id: "dreams", label: "dreams", c: "#f0d79a" },
  { id: "letters", label: "letters", c: "#e0a6c8" },
  { id: "photographs", label: "photographs", c: "#ece6d6" },
  { id: "powers", label: "powers", c: "#8fd0d2" },
  { id: "nights", label: "nights", c: "#b4a6e6" }
];
var SORTS = [["recent", "recent"], ["az", "a – z"], ["most", "most dreamt"], ["new", "new worlds"]];

/* ======================================================= recall + entries */
function entriesSorted(sort) {
  var a = []; for (var k in D.dreams) if (D.dreams[k] && typeof D.dreams[k] === "object") a.push(D.dreams[k]);
  if (sort === "az") a.sort(function (x, y) { return (x.n || x.r) < (y.n || y.r) ? -1 : 1; });
  else if (sort === "most") a.sort(function (x, y) { return (y.v - x.v) || (y.s - x.s); });
  else if (sort === "new") { a = a.filter(function (e) { var wi = N2.worldInfo && N2.worldInfo[e.r]; return !!(wi && wi.sequel); }); a.sort(function (x, y) { return y.s - x.s; }); }
  else a.sort(function (x, y) { return (y.s || 0) - (x.s || 0); });
  return a;
}
function seenCount() {
  var set = {}, L = allNames(), n = 0; for (var i = 0; i < L.length; i++) set[L[i]] = 1;
  for (var k in D.dreams) if (set[k]) n++;
  return n;
}
function atRecallPlace() {
  if (inBedroom) return true;
  var S = story();
  try { if (S && S.isSanctuary && S.isSanctuary() && N2.dreamName() === "the_threshold") return true; } catch (e) {}
  return N2.dreamName() === "the_threshold" && !inBedroom;
}
// returns { ok: bool, why: text }
function recallState(r) {
  var L = lucid();
  var e = D.dreams[r];
  if (!e) return { ok: false, why: "" };
  if (!RECIPES[r] || hiddenWorld(r)) return { ok: false, why: "this one cannot be found again on purpose. it finds you." };
  if (!L || !L.has || !L.has("recall")) return { ok: false, why: "one night you may learn to recall, and come back here on purpose." };
  if (N2.isDreaming() && N2.dreamName() === r) return { ok: false, why: "you are here now." };
  if (!atRecallPlace()) return { ok: false, why: "you can only return from the waking room, or from the threshold." };
  if (phase === "title") return { ok: false, why: "fall asleep first." };
  if (phase !== "play") return { ok: false, why: "wait a moment. you are still arriving." };
  return { ok: true, why: "" };
}
var recalling = false;
function recall(r) {
  var st = recallState(r); if (!st.ok || recalling) return false;
  recalling = true;
  try { N2.chime(523.25, 2.4, 0.05); setTimeout(function () { N2.chime(659.25, 2.2, 0.04); }, 140); setTimeout(function () { N2.chime(987.77, 2.6, 0.035); }, 300); } catch (e) {}
  var bk = document.querySelector("#n2-journal .jb"); if (bk) bk.classList.add("recall");
  setTimeout(function () {
    recalling = false;
    try {
      close();
      if (paused && typeof togglePause === "function") togglePause();
      if (phase !== "play") return;
      if (inBedroom) { try { audio.stopRain(); if (audio.stopMenu) audio.stopMenu(); if (audio.stopBedroom) audio.stopBedroom(); } catch (e) {} }
      beingSpeak("you hold the memory still, and fall into it…");
      try { nightRec(day).rc++; touch(); } catch (e) {}
      doWarp({ b: 0, e: 0 }, "recall", r);
    } catch (e) { if (window.console) console.error("[N2] journal recall", e); }
  }, 650);
  return true;
}

/* ================================================================ the UI */
var ui = { open: false, tab: "dreams", sel: { dreams: 0, letters: 0, photographs: 0, powers: 0, nights: 0 }, sort: "recent", det: false, items: [], fadeArm: null };
var P = null, bookEl, tabsEl, hdEl, lsEl, dtEl;
function narrow() { return window.innerWidth <= 760; }
function build() {
  if (P) return;
  P = N2.ui.panel(PANEL, "");
  var h2 = P.sheet.querySelector("h2"); if (h2) h2.parentNode.removeChild(h2);
  P.sheet.innerHTML =
    "<div class='jb'>" +
      "<div class='jtabs'></div>" +
      "<button class='jx' data-a='close' tabindex='-1'>close ✕</button>" +
      "<div class='jsp'>" +
        "<section class='jpg jl'><div class='jhd'></div><div class='jls'></div></section>" +
        "<div class='jgut'></div><div class='jrib'></div>" +
        "<section class='jpg jr'><div class='jdt'></div></section>" +
      "</div>" +
      "<div class='jft'></div>" +
    "</div>";
  bookEl = P.sheet.querySelector(".jb"); tabsEl = P.sheet.querySelector(".jtabs"); hdEl = P.sheet.querySelector(".jhd");
  lsEl = P.sheet.querySelector(".jls"); dtEl = P.sheet.querySelector(".jdt");
  var tex = paperTex(); if (tex) bookEl.style.setProperty("--paper", "url(" + tex + ")");
  P.addEventListener("click", onClick);
  P.addEventListener("dblclick", function (e) { var it = e.target.closest && e.target.closest(".ji"); if (it && ui.tab === "dreams") primary(); });
  // clicking the dark backdrop around the book closes it
  P.addEventListener("mousedown", function (e) { if (e.target === P || e.target === P.sheet) { close(); } });
  window.addEventListener("resize", function () { if (ui.open) footer(); });
}
function onClick(e) {
  var t = e.target, a = t.closest ? t.closest("[data-a]") : null;
  if (!a) return;
  var act = a.getAttribute("data-a"), v = a.getAttribute("data-v");
  if (a.tagName === "A" && !a.hasAttribute("download")) e.preventDefault();
  if (a.blur) a.blur();
  if (act === "close") close();
  else if (act === "tab") setTab(v);
  else if (act === "sel") { select(+v, true); if (narrow()) { ui.det = true; bookEl.classList.add("det"); } }
  else if (act === "sort") { ui.sort = v; ui.sel.dreams = 0; paperSound(); render(); }
  else if (act === "back") { ui.det = false; bookEl.classList.remove("det"); }
  else if (act === "recall") recall(v);
  else if (act === "fade") fadePhoto(v);
  else if (act === "goto") gotoDream(v);
  // "save" is a real <a download>, it needs no handling
}
function paperSound() {
  if (!audio.ctx) return;
  try { audio.noise(0.22, "bandpass", 2600, 1200, 0.035, (Math.random() - 0.5) * 0.4); } catch (e) {}
}
function setTab(id, quiet) {
  if (!TABS.some(function (t) { return t.id === id; })) id = "dreams";
  if (ui.tab !== id && !quiet) paperSound();
  ui.tab = id; ui.det = false; ui.fadeArm = null; if (bookEl) bookEl.classList.remove("det");
  render();
  if (lsEl) lsEl.scrollTop = 0;
}
function open(tab) {
  try {
    build();
    if (tab) ui.tab = TABS.some(function (t) { return t.id === tab; }) ? tab : "dreams";
    ui.det = false; ui.fadeArm = null; bookEl.classList.remove("det", "recall");
    if (dirty) flush();
    render();
    if (!N2.ui.isOpen(PANEL)) N2.ui.open(PANEL);
    ui.open = true;
    bookEl.classList.remove("in"); void bookEl.offsetWidth;
    requestAnimationFrame(function () { if (bookEl) bookEl.classList.add("in"); });
    paperSound();
    var it = lsEl.querySelector(".ji.sel"); if (it && it.scrollIntoView) it.scrollIntoView({ block: "nearest" });
    return true;
  } catch (e) { if (window.console) console.error("[N2] journal open", e); return false; }
}
function close() {
  if (!P) return;
  ui.open = false;
  if (N2.ui.isOpen(PANEL)) N2.ui.close(PANEL);
}
N2.on("uiClose", function (id) { if (id === PANEL) { ui.open = false; if (bookEl) bookEl.classList.remove("in"); } });

/* ---- rendering ---- */
function thumbStyle(e) {
  var t = thumbOf(e.r), p = e.p || [], sky = col(p[0], "2a3550"), gl = col(p[1], "f0d79a"), wb = col(p[3], "1a2238");
  if (t) return "background-image:url(" + t + ")";
  return "background-image:radial-gradient(circle at " + (30 + hash(e.r) % 40) + "% 38%," + gl + " 0," + gl + "55 9%,transparent 30%),linear-gradient(180deg," + sky + "," + wb + ")";
}
function rot(id, amp) { return (((hash(id) % 1000) / 1000) - 0.5) * 2 * (amp || 1.4); }
function render() {
  if (!P) return;
  tabsEl.innerHTML = TABS.map(function (t, i) {
    return "<button class='jtab" + (t.id === ui.tab ? " on" : "") + "' style='--c:" + t.c + "' data-a='tab' data-v='" + t.id + "' tabindex='-1'>" + t.label + "<span class='k'>" + (i + 1) + "</span></button>";
  }).join("");
  var out = { hd: "", list: "", items: [] };
  try {
    if (ui.tab === "dreams") renderDreams(out);
    else if (ui.tab === "letters") renderLetters(out);
    else if (ui.tab === "photographs") renderPhotos(out);
    else if (ui.tab === "powers") renderPowers(out);
    else renderNights(out);
  } catch (e) { out.list = "<div class='jempty'>the ink has run here.</div>"; if (window.console) console.error("[N2] journal render", e); }
  hdEl.innerHTML = "<div class='jbt'><span>dream journal</span><span class='jp'>夢の手帳 · night " + day + "</span></div>" + out.hd;
  lsEl.innerHTML = "<div class='jfade'>" + out.list + "</div>";
  ui.items = out.items;
  var s = ui.sel[ui.tab] || 0; if (s >= ui.items.length) s = Math.max(0, ui.items.length - 1); ui.sel[ui.tab] = s;
  markSel();
  renderDetail();
  footer();
}
function markSel() {
  var els = lsEl.querySelectorAll(".ji"), s = ui.sel[ui.tab];
  for (var i = 0; i < els.length; i++) els[i].classList.toggle("sel", +els[i].getAttribute("data-v") === s);
}
function select(i, fromMouse) {
  if (!ui.items.length) return;
  i = Math.max(0, Math.min(ui.items.length - 1, i));
  if (i === ui.sel[ui.tab] && fromMouse !== "force") { if (!fromMouse) return; }
  ui.sel[ui.tab] = i; ui.fadeArm = null;
  markSel(); renderDetail();
  var el = lsEl.querySelector(".ji[data-v='" + i + "']");
  if (el && el.scrollIntoView && !fromMouse) el.scrollIntoView({ block: "nearest" });
  if (audio.ctx && !fromMouse) { try { audio.tone(1760 + (i % 5) * 110, "sine", 0.008, 0.003, 0.08, 0); } catch (e) {} }
}
function cur() { return ui.items[ui.sel[ui.tab]]; }
function footer() {
  var f = P.sheet.querySelector(".jft"); if (!f) return;
  var bits = ["<span><kbd>←↑↓→</kbd> browse</span>", "<span><kbd>1</kbd>–<kbd>5</kbd> / <kbd>tab</kbd> pages</span>"];
  if (ui.tab === "dreams") { bits.push("<span><kbd>s</kbd> sort</span>"); bits.push("<span><kbd>enter</kbd> dream again</span>"); }
  if (ui.tab === "photographs") { bits.push("<span><kbd>s</kbd> save image</span>"); bits.push("<span><kbd>del</kbd> let it fade</span>"); }
  if (ui.tab === "nights") bits.push("<span><kbd>enter</kbd> open its first dream</span>");
  bits.push("<span><kbd>esc</kbd> / <kbd>j</kbd> close</span>");
  f.innerHTML = bits.join("");
}

/* -- dreams -- */
function renderDreams(out) {
  var all = entriesSorted(ui.sort), N = allNames().length || 1, seen = seenCount();
  out.hd = "<div class='jbig'><b>" + seen + "</b><span>of " + N + " dreams remembered</span></div>" +
    "<div class='jbar'><i style='width:" + Math.max(0.6, seen / N * 100).toFixed(2) + "%'></i></div>" +
    "<div class='jsub'>" + plural(D.seq, "visit") + " written down · " + plural(Object.keys(D.thumbs).length, "picture") + " kept</div>" +
    "<div class='jchips'>" + SORTS.map(function (s) { return "<button class='jchip" + (ui.sort === s[0] ? " on" : "") + "' data-a='sort' data-v='" + s[0] + "' tabindex='-1'>" + s[1] + "</button>"; }).join("") + "</div>";
  if (!all.length) {
    out.list = ui.sort === "new" ? "<div class='jempty'>none of the new places yet.<small>they surface more often than the old ones. keep sleeping.</small></div>"
      : "<div class='jempty'>the pages are still blank.<small>lie down, sleep, and the journal will remember for you.</small></div>";
    return;
  }
  var h = ["<div class='jgrid'>"];
  for (var i = 0; i < all.length; i++) {
    var e = all[i], p = e.p || [], g = col(p[1], "f0d79a");
    var isNewWorld = N2.worldInfo && N2.worldInfo[e.r] && N2.worldInfo[e.r].sequel;
    h.push("<button class='ji jc' data-a='sel' data-v='" + i + "' tabindex='-1' style='--g:" + g + ";--rot:" + rot(e.r).toFixed(2) + "deg'>" +
      "<span class='jph'><span class='im' style=\"" + thumbStyle(e) + "\"></span><i class='tape'></i></span>" +
      "<span class='jnm'>" + esc(e.n || nameOf(e.r)) + "</span>" +
      "<span class='jmt'><span class='dot'></span> n" + e.f + (e.l !== e.f ? "–" + e.l : "") + " · ×" + e.v + (isNewWorld ? "<span class='jnew'>new</span>" : "") + "</span></button>");
    out.items.push({ kind: "dream", e: e });
  }
  h.push("</div>");
  out.list = h.join("");
}
function detailDream(it) {
  var e = it.e, p = e.p || [], g = col(p[1], "f0d79a"), rs = recallState(e.r), idx = ui.sel.dreams + 1;
  var labels = ["sky", "glow", "accent", "wall", "figure"], sw = [];
  for (var i = 0; i < 5; i++) if (p[i]) sw.push("<div><i style='--g:#" + p[i] + "'></i>" + labels[i] + "</div>");
  var wi = N2.worldInfo && N2.worldInfo[e.r];
  var meta = "first dreamt on <b>night " + e.f + "</b>" + (e.l !== e.f ? " · last on <b>night " + e.l + "</b>" : "") + "<br>" +
    (e.v === 1 ? "dreamt once" : "dreamt <b>" + e.v + " times</b>") + (e.cx ? " · once, it came back wrong" : "") +
    (wi && wi.sequel ? "<br>one of the new places" + (wi.tags && wi.tags.length ? " · " + esc(wi.tags.slice(0, 3).join(" · ")) : "") : "");
  var act;
  if (rs.ok) act = "<button class='jbtn pri' data-a='recall' data-v='" + esc(e.r) + "' tabindex='-1'>☾ dream of this again <kbd>enter</kbd></button>";
  else act = "<div class='jnote'>" + esc(rs.why) + "</div>";
  return "<button class='jback' data-a='back' tabindex='-1'>← back</button>" +
    "<div class='jey'><span>dream " + idx + " of " + ui.items.length + "</span><span>" + (rs.ok ? "☾ within reach" : (e.v > 2 ? "a familiar place" : "")) + "</span></div>" +
    "<figure class='jfig' style='--g:" + g + "'><span class='im' style=\"" + thumbStyle(e) + "\"></span><i class='tape a'></i><i class='tape b'></i></figure>" +
    "<h3 class='jtt'>" + esc(e.n || nameOf(e.r)) + "</h3>" +
    "<div class='jmeta'>" + meta + "</div>" +
    "<div class='jact' style='margin-top:16px'>" + act + "</div>" +
    "<p class='jline'>" + esc(lineFor(e)) + "</p>" +
    (sw.length ? "<div class='jpal'>" + sw.join("") + "</div>" : "");
}

/* -- letters -- */
function renderLetters(out) {
  var S = story();
  if (!S || !S.allFragments) { out.hd = "<div class='jbig'><b>0</b><span>letters</span></div>"; out.list = "<div class='jempty'>no letters.<small>no one else has dreamed here. not yet.</small></div>"; return; }
  var all = S.allFragments() || [], found = all.filter(function (f) { return f.found; }).length, lit = 0;
  try { lit = S.lanterns ? S.lanterns() : 0; } catch (e) {}
  out.hd = "<div class='jbig'><b>" + found + "</b><span>of " + (all.length || 49) + " letters from the other sleeper</span></div>" +
    "<div class='jbar'><i style='width:" + Math.max(0.6, found / Math.max(1, all.length) * 100).toFixed(2) + "%;background:linear-gradient(90deg,var(--rose),var(--gold))'></i></div>" +
    "<div class='jsub'>✦ " + lit + " of 7 lanterns lit</div>";
  if (!found) { out.list = "<div class='jempty'>no letters yet.<small>someone dreamed here before you. look for the small lights.</small></div>"; return; }
  var h = [], lastCh = -1, chFound = {};
  all.forEach(function (f) { if (f.found) chFound[f.chapter] = 1; });
  for (var i = 0; i < all.length; i++) {
    var f = all[i];
    if (f.chapter !== lastCh) { lastCh = f.chapter; h.push("<div class='jch'>" + esc(f.roman || f.chapter) + " · " + (chFound[f.chapter] ? esc(f.chapterTitle || "") : "—") + "</div>"); }
    if (!f.found) { h.push("<div class='jun'>· · ·</div>"); continue; }
    var k = out.items.length;
    h.push("<button class='ji jrow' data-a='sel' data-v='" + k + "' tabindex='-1'><span class='tx'><span class='t3'>" + esc(f.text) + "</span>" +
      "<span class='t2'>letter " + f.n + (f.dream ? " · " + esc(f.dream) : "") + (f.night ? " · night " + f.night : "") + "</span></span></button>");
    out.items.push({ kind: "letter", f: f });
  }
  out.list = h.join("");
}
function detailLetter(it) {
  var f = it.f;
  return "<button class='jback' data-a='back' tabindex='-1'>← back</button>" +
    "<div class='jey'><span>letter " + f.n + "</span><span>" + esc(f.roman || "") + " · " + esc(f.chapterTitle || "") + "</span></div>" +
    "<div class='jletter'>" + esc(f.text) + "</div>" +
    "<div class='jsig'>— the other sleeper</div>" +
    "<div class='jmeta'>" + (f.dream ? "found in <b>" + esc(f.dream) + "</b>" : "found somewhere") + (f.night ? " · night " + f.night : "") + "</div>";
}

/* -- photographs -- */
function renderPhotos(out) {
  var list = PH.slice().reverse();
  out.hd = "<div class='jbig'><b>" + PH.length + "</b><span>of " + PHOTO_MAX + " photographs</span></div>" +
    "<div class='jbar'><i style='width:" + Math.max(0.6, PH.length / PHOTO_MAX * 100).toFixed(2) + "%;background:linear-gradient(90deg,#c9c2ae,#f4eedf)'></i></div>" +
    "<div class='jsub'>press c in a dream to keep one · the oldest fade when there are too many</div>";
  if (!list.length) { out.list = "<div class='jempty'>no photographs yet.<small>press c in a dream. it will hold still for you.</small></div>"; return; }
  var h = ["<div class='jpgrid'>"];
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    h.push("<button class='ji jc' data-a='sel' data-v='" + i + "' tabindex='-1' style='--rot:" + rot(p.id, 2.2).toFixed(2) + "deg'><span class='jpol'><span class='im' style=\"background-image:url(" + p.data + ")\"></span><span class='cap'>" + esc(p.nm) + "</span></span></button>");
    out.items.push({ kind: "photo", p: p });
  }
  h.push("</div>");
  out.list = h.join("");
}
function fileName(p) { return "nemuri-ii_night" + p.n + "_" + String(p.nm || "dream").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") + "_" + p.id + ".jpg"; }
function detailPhoto(it) {
  var p = it.p, d = new Date(p.t), when = "";
  try { when = d.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toLowerCase(); } catch (e) {}
  var armed = ui.fadeArm === p.id;
  return "<button class='jback' data-a='back' tabindex='-1'>← back</button>" +
    "<div class='jey'><span>photograph " + (ui.sel.photographs + 1) + " of " + PH.length + "</span><span>" + esc(when) + "</span></div>" +
    "<div class='jbigpol'><span class='im' style=\"background-image:url(" + p.data + ");aspect-ratio:" + (p.w || 16) + "/" + (p.h || 10) + "\"></span><span class='cap'>" + esc(p.nm) + "<small>night " + p.n + "</small></span></div>" +
    "<div class='jact'><a class='jbtn pri' href='" + p.data + "' download='" + esc(fileName(p)) + "' data-save='1' tabindex='-1'>save image <kbd>s</kbd></a>" +
    "<button class='jbtn" + (armed ? " warn" : "") + "' data-a='fade' data-v='" + esc(p.id) + "' tabindex='-1'>" + (armed ? "really let it fade?" : "let it fade") + " <kbd>del</kbd></button></div>" +
    (p.mem ? "<div class='jnote' style='margin-top:12px'>there was no room to keep this one. it will fade when you wake.</div>" : "") +
    (p.r && p.r !== "__bedroom" && D.dreams[p.r] ? "<div class='jnote' style='margin-top:14px'>taken in <a href='#' data-a='goto' data-v='" + esc(p.r) + "' style='color:var(--teal)'>" + esc(p.nm) + "</a></div>" : "");
}
function fadePhoto(id) {
  if (ui.fadeArm !== id) { ui.fadeArm = id; renderDetail(); return; }
  ui.fadeArm = null;
  for (var i = 0; i < PH.length; i++) if (PH[i].id === id) { PH.splice(i, 1); break; }
  savePhotos();
  try { audio.noise(0.5, "lowpass", 1800, 300, 0.04, 0); } catch (e) {}
  render();
}

/* -- powers -- */
function renderPowers(out) {
  var L = lucid();
  if (!L || !L.powers) { out.hd = "<div class='jbig'><b>0</b><span>powers</span></div>"; out.list = "<div class='jempty'>you have not yet noticed that you are dreaming.<small>it takes a little practice.</small></div>"; return; }
  var ps = L.powers() || [], un = ps.filter(function (p) { return p.unlocked; }).length, lv = 0, word = "asleep", pk = 0;
  try { lv = L.level(); word = L.word ? L.word() : wordOf(lv); pk = nightRec(day).pk || 0; } catch (e) {}
  out.hd = "<div class='jbig'><b>" + un + "</b><span>of " + ps.length + " powers learned</span></div>" +
    "<div class='jmeter'><i style='width:" + (lv * 100).toFixed(1) + "%'></i></div>" +
    "<div class='jsub'>now: " + esc(word) + " · deepest tonight: " + wordOf(pk) + (L.moments ? " · " + plural(L.moments(), "lucid moment") : "") + "</div>";
  var h = [];
  for (var i = 0; i < ps.length; i++) {
    var p = ps[i];
    h.push("<button class='ji jrow' data-a='sel' data-v='" + i + "' tabindex='-1'><span class='gl" + (p.unlocked ? "" : " off") + "'>" + esc(p.unlocked ? (p.glyph || "✦") : "?") + "</span><span class='tx'>" +
      "<span class='t1'>" + esc(p.unlocked ? p.title : "not yet") + "</span>" +
      "<span class='t2'>" + (p.unlocked ? "key " + esc(p.key || "") + (p.night ? " · since night " + p.night : "") : esc(needText(p))) + "</span></span></button>");
    out.items.push({ kind: "power", p: p });
  }
  out.list = h.join("");
}
function needText(p) {
  var n = p.need || {};
  var bits = [];
  if (n.moments) bits.push(plural(n.moments, "lucid moment"));
  if (n.night) bits.push("night " + n.night);
  return bits.length ? "after " + bits.join(", from ") : "it is waiting";
}
function detailPower(it) {
  var p = it.p, L = lucid(), m = 0; try { m = L && L.moments ? L.moments() : 0; } catch (e) {}
  if (!p.unlocked) {
    var need = (p.need && p.need.moments) || 1;
    return "<button class='jback' data-a='back' tabindex='-1'>← back</button><div class='jey'><span>a power, not yet</span></div>" +
      "<div class='jpow off'>?</div><h3 class='jtt' style='color:var(--ink2)'>not yet</h3>" +
      "<div class='jmeta'>it comes " + esc(needText(p)) + ".</div>" +
      "<div class='jmeter' style='margin-top:18px'><i style='width:" + Math.min(100, m / need * 100).toFixed(1) + "%'></i></div>" +
      "<div class='jnote'>" + plural(m, "lucid moment") + " so far. look at your hands (r) when something feels wrong.</div>";
  }
  return "<button class='jback' data-a='back' tabindex='-1'>← back</button><div class='jey'><span>a power</span><span>" + (p.night ? "learned on night " + p.night : "") + "</span></div>" +
    "<div class='jpow'>" + esc(p.glyph || "✦") + "</div><h3 class='jtt'>" + esc(p.title) + "</h3>" +
    "<p class='jline'>" + esc(p.desc || "") + "</p>" +
    "<div class='jstats'><div>key<b>" + esc(p.key || "—") + "</b></div><div>used<b>" + (p.uses ? plural(p.uses, "time") : "not yet") + "</b></div></div>" +
    (p.id === "recall" ? "<div class='jnote'>open a dream on the first page while you are in the waking room, and press enter.</div>" : "");
}

/* -- nights -- */
function nightList() { return Object.keys(D.nights).map(function (k) { return D.nights[k]; }).sort(function (a, b) { return b.n - a.n; }); }
function renderNights(out) {
  var ns = nightList(), total = 0; ns.forEach(function (n) { total += n.d.length; });
  out.hd = "<div class='jbig'><b>" + plural(ns.length, "night") + "</b><span>in the journal</span></div>" +
    "<div class='jsub'>" + plural(total, "dream") + " in all · tonight is night " + day + "</div>";
  if (!ns.length) { out.list = "<div class='jempty'>no nights yet.<small>every night you sleep is written here when you wake.</small></div>"; return; }
  var h = [];
  for (var i = 0; i < ns.length; i++) {
    var n = ns[i], dots = [];
    for (var j = 0; j < n.d.length && j < 18; j++) { var e = D.dreams[n.d[j]], g = e && e.p ? col(e.p[1]) : "#8fa0c0"; dots.push("<i style='--g:" + g + "'></i>"); }
    var bits = [plural(n.d.length, "dream")];
    if (n.pk) bits.push(wordOf(n.pk)); if (n.sh) bits.push(plural(n.sh, "letter")); if (n.ph) bits.push(plural(n.ph, "photo"));
    h.push("<button class='ji jrow' data-a='sel' data-v='" + i + "' tabindex='-1'><span class='gl' style='font-family:" + SERIF + ";font-style:italic;font-size:13px'>" + n.n + "</span><span class='tx'>" +
      "<span class='t1'>" + (n.n === day && !n.done ? "tonight" : "night " + n.n) + " — " + esc(moodWord(n)) + "</span>" +
      "<span class='t2'>" + esc(bits.join(" · ")) + "</span><span class='jdots'>" + dots.join("") + "</span></span></button>");
    out.items.push({ kind: "night", n: n });
  }
  out.list = h.join("");
}
function constellation(n) {
  var W = 420, H = 170, pts = [], d = n.d, h = hash("night" + n.n), cnt = Math.min(d.length, 14);
  for (var i = 0; i < cnt; i++) {
    var t = cnt === 1 ? 0.5 : i / (cnt - 1), hh = hash(d[i] + i + n.n);
    var x = 34 + t * (W - 68) + ((hh % 100) / 100 - 0.5) * 26;
    var y = H * 0.5 + Math.sin(t * 5.2 + (h % 7)) * H * 0.22 + (((hh >>> 8) % 100) / 100 - 0.5) * 40;
    var e = D.dreams[d[i]], g = e && e.p ? col(e.p[1]) : "#8fa0c0";
    pts.push({ x: x, y: Math.max(18, Math.min(H - 18, y)), g: g, r: e && e.v > 2 ? 4.2 : 3.2 });
  }
  var s = ["<svg class='jsky' viewBox='0 0 " + W + " " + H + "' xmlns='http://www.w3.org/2000/svg'><defs><filter id='jglow' x='-2' y='-2' width='5' height='5'><feGaussianBlur stdDeviation='3'/></filter></defs>"];
  for (var b = 0; b < 46; b++) { var bh = hash("bg" + b + n.n); s.push("<circle cx='" + (bh % W) + "' cy='" + ((bh >>> 9) % H) + "' r='" + (((bh >>> 4) % 10) / 14 + 0.3).toFixed(2) + "' fill='#cfd8f0' opacity='" + (((bh >>> 13) % 40) / 100 + 0.08).toFixed(2) + "'/>"); }
  if (pts.length > 1) s.push("<polyline points='" + pts.map(function (p) { return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" ") + "' fill='none' stroke='#e8e2cf' stroke-opacity='.28' stroke-width='1' stroke-dasharray='2 3'/>");
  pts.forEach(function (p, i) {
    s.push("<circle cx='" + p.x.toFixed(1) + "' cy='" + p.y.toFixed(1) + "' r='" + (p.r * 2.6).toFixed(1) + "' fill='" + p.g + "' opacity='.55' filter='url(#jglow)'/>");
    s.push("<circle cx='" + p.x.toFixed(1) + "' cy='" + p.y.toFixed(1) + "' r='" + p.r + "' fill='" + p.g + "'/><circle cx='" + p.x.toFixed(1) + "' cy='" + p.y.toFixed(1) + "' r='" + (p.r * 0.4).toFixed(1) + "' fill='#fff' opacity='.85'/>");
    s.push("<text x='" + p.x.toFixed(1) + "' y='" + (p.y + p.r + 11).toFixed(1) + "' fill='#7d8aa3' font-size='8' text-anchor='middle' font-family='monospace'>" + (i + 1) + "</text>");
  });
  s.push("</svg>");
  return s.join("");
}
function detailNight(it) {
  var n = it.n, li = [];
  for (var i = 0; i < n.d.length; i++) { var e = D.dreams[n.d[i]], g = e && e.p ? col(e.p[1]) : "#8fa0c0"; li.push("<li data-a='goto' data-v='" + esc(n.d[i]) + "'><i style='--g:" + g + "'></i>" + esc(e ? e.n : nameOf(n.d[i])) + "</li>"); }
  var d = new Date(n.t || now()), when = "";
  try { when = d.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toLowerCase(); } catch (e2) {}
  return "<button class='jback' data-a='back' tabindex='-1'>← back</button>" +
    "<div class='jey'><span>" + (n.n === day && !n.done ? "tonight" : "night " + n.n) + "</span><span>" + esc(when) + "</span></div>" +
    "<h3 class='jtt'>" + esc(moodWord(n)) + "</h3>" +
    (n.d.length ? constellation(n) : "") +
    "<div class='jstats'><div>dreams<b>" + n.d.length + "</b></div><div>deepest<b>" + wordOf(n.pk || 0) + "</b></div>" +
    "<div>letters found<b>" + (n.sh || "none") + "</b></div><div>photographs<b>" + (n.ph || "none") + "</b></div>" +
    (n.rc ? "<div>returned on purpose<b>" + plural(n.rc, "time") + "</b></div>" : "") + "</div>" +
    (li.length ? "<ol class='jol'>" + li.join("") + "</ol>" : "<div class='jnote'>you lay awake.</div>");
}
function renderDetail() {
  if (!P) return;
  var it = cur(), html;
  if (!it) html = "<button class='jback' data-a='back' tabindex='-1'>← back</button><div class='jwait'><div class='moon'></div><small>this page is waiting.</small></div>";
  else if (it.kind === "dream") html = detailDream(it);
  else if (it.kind === "letter") html = detailLetter(it);
  else if (it.kind === "photo") html = detailPhoto(it);
  else if (it.kind === "power") html = detailPower(it);
  else html = detailNight(it);
  dtEl.innerHTML = "<div class='jfade'>" + html + "</div>";
  dtEl.scrollTop = 0;
}
function gotoDream(r) {
  ui.sort = "recent"; ui.tab = "dreams"; render();
  for (var i = 0; i < ui.items.length; i++) if (ui.items[i].e.r === r) { select(i, false); break; }
  if (narrow()) { ui.det = true; bookEl.classList.add("det"); }
  paperSound();
}
function primary() {
  var it = cur(); if (!it) return;
  if (narrow() && !ui.det) { ui.det = true; bookEl.classList.add("det"); return; }
  if (it.kind === "dream") recall(it.e.r);
  else if (it.kind === "photo") savePhotoEl();
  else if (it.kind === "night" && it.n.d.length) gotoDream(it.n.d[0]);
}
function savePhotoEl() { var a = dtEl.querySelector("a[data-save]"); if (a) { try { a.click(); } catch (e) {} } }
function cols() {
  var els = lsEl.querySelectorAll(".ji"); if (els.length < 2) return 1;
  var top = els[0].offsetTop, c = 1;
  while (c < els.length && Math.abs(els[c].offsetTop - top) < 4) c++;
  return c;
}

/* ---- keyboard while the journal is the top panel ---- */
function journalKey(e) {
  var c = e.code;
  if (c === "Escape" || c === "KeyJ") { if (narrow() && ui.det && c === "Escape") { ui.det = false; bookEl.classList.remove("det"); } else close(); return; }
  if (/^Digit[1-5]$/.test(c)) { setTab(TABS[+c.slice(5) - 1].id); return; }
  if (c === "Tab") { var ti = 0; for (var i = 0; i < TABS.length; i++) if (TABS[i].id === ui.tab) ti = i; ti = (ti + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length; setTab(TABS[ti].id); return; }
  var s = ui.sel[ui.tab] || 0, k = cols();
  if (c === "ArrowRight" || c === "KeyD") select(s + 1);
  else if (c === "ArrowLeft" || c === "KeyA") select(s - 1);
  else if (c === "ArrowDown" || c === "KeyS" && ui.tab !== "dreams" && ui.tab !== "photographs") select(s + k);
  else if (c === "ArrowUp" || c === "KeyW") select(s - k);
  else if (c === "PageDown") select(s + k * 4);
  else if (c === "PageUp") select(s - k * 4);
  else if (c === "Home") select(0);
  else if (c === "End") select(ui.items.length - 1);
  else if (c === "Enter" || c === "NumpadEnter") primary();
  else if (c === "KeyS" && ui.tab === "dreams") { var si = 0; for (var q = 0; q < SORTS.length; q++) if (SORTS[q][0] === ui.sort) si = q; ui.sort = SORTS[(si + 1) % SORTS.length][0]; ui.sel.dreams = 0; paperSound(); render(); }
  else if (c === "KeyS" && ui.tab === "photographs") savePhotoEl();
  else if ((c === "Delete" || c === "Backspace") && ui.tab === "photographs") { var it = cur(); if (it) fadePhoto(it.p.id); }
  else if (c === "Backspace" && narrow() && ui.det) { ui.det = false; bookEl.classList.remove("det"); }
}

/* ======================================================= polaroid preview */
var PV = null;
function buildPolaroid() {
  if (PV) return PV;
  PV = N2.ui.panel(POLA, "");
  var h2 = PV.sheet.querySelector("h2"); if (h2) h2.parentNode.removeChild(h2);
  PV.sheet.innerHTML = "<div class='jpv'><span class='im'></span><div class='cap'><b></b><small></small></div></div>" +
    "<div class='jpa'><a class='jbtn pri' data-a='save' download tabindex='-1'>save image <kbd>s</kbd></a>" +
    "<button class='jbtn' data-a='journal' tabindex='-1'>journal <kbd>j</kbd></button>" +
    "<button class='jbtn' data-a='keep' tabindex='-1'>keep dreaming <kbd>c</kbd></button></div><div class='jpn'></div>";
  PV.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("[data-a]") : null; if (!a) return;
    var act = a.getAttribute("data-a"); if (a.blur) a.blur();
    if (act === "keep") closePolaroid(true);
    else if (act === "journal") { closePolaroid(false); open("photographs"); }
  });
  PV.addEventListener("mousedown", function (e) { if (e.target === PV || e.target === PV.sheet) closePolaroid(true); });
  return PV;
}
function showPolaroid(rec, faded, stored) {
  try {
    buildPolaroid();
    var card = PV.querySelector(".jpv"), im = card.querySelector(".im");
    card.classList.remove("in", "dev");
    im.style.backgroundImage = "url(" + rec.data + ")"; im.style.aspectRatio = rec.w + "/" + rec.h;
    card.querySelector(".cap b").textContent = rec.nm;
    card.querySelector(".cap small").textContent = "night " + rec.n + " · " + PH.length + " of " + PHOTO_MAX;
    var a = PV.querySelector("a[data-a='save']"); a.href = lastFull || rec.data; a.setAttribute("download", fileName(rec));
    var note = faded ? "the oldest photograph faded to make room." : (!stored ? "there is no more room to keep it. save it, or it fades when you wake." : "");
    PV.querySelector(".jpn").textContent = note;
    N2.ui.open(POLA);
    requestAnimationFrame(function () { requestAnimationFrame(function () { card.classList.add("in"); setTimeout(function () { card.classList.add("dev"); }, 120); }); });
  } catch (e) { if (window.console) console.error("[N2] journal polaroid", e); }
}
function closePolaroid(relock) {
  if (!PV || !N2.ui.isOpen(POLA)) return;
  N2.ui.close(POLA);
  if (relock && phase === "play" && !paused && !useDrag) { try { tryLock(); } catch (e) {} }
}

/* ===================================================== global key handler */
N2.on("keydown", function (e) {
  try {
    var top = N2.ui.top();
    if (top === POLA) {
      var c = e.code;
      if (c === "KeyS" || c === "Enter") { var a = PV.querySelector("a[data-a='save']"); if (a) a.click(); }
      else if (c === "KeyJ") { closePolaroid(false); open("photographs"); }
      else if (c === "Escape") closePolaroid(false);      // esc is never a gesture: no pointer-lock request
      else if (c === "KeyC" || c === "Space" || c === "KeyE") closePolaroid(!e.repeat);
      return true;
    }
    if (top === PANEL) { if (!recalling) journalKey(e); return true; }
    if (N2.uiOpen) return false;
    if (e.repeat) return false;
    // never open the book underneath the title's prologue / ending, or during the story's ending
    try { var _T = N2.mods.title, _ts = _T && _T.state ? _T.state() : null; if (N2.storyEnding || (_ts && (_ts.ending || _ts.prologue))) return false; } catch (er2) {}
    if (e.code === "KeyJ" && phase !== "title") { open(); return true; }
    if (e.code === "KeyC" && N2.canAct()) { snap(); return true; }
  } catch (er) { if (window.console) console.error("[N2] journal key", er); }
  return false;
}, 120);

/* ======================================================== bedroom journal */
N2.on("bedroomInteract", function (t) {
  if (t && t.kind === "n2journal") { open(); return true; }
  return false;
});
function decorateBedroom(z) {
  try {
    var g = z.group; if (!g || typeof pBox !== "function") return;
    // a small night-blue notebook on the desk, by the speaker, with a ribbon and a faint glow
    var bk = new THREE.Group(); bk.position.set(-2.49, 0.775, 1.3); bk.rotation.y = 0.22; g.add(bk);
    pBox(bk, 0, 0.012, 0, 0.27, 0.024, 0.2, objMat({ color: 0x1c2748, bright: 0.95 }));
    pBox(bk, 0.004, 0.028, 0, 0.25, 0.012, 0.185, objMat({ color: 0xe6dfcc, bright: 1.05 }));
    pBox(bk, 0, 0.038, 0, 0.27, 0.008, 0.2, objMat({ color: 0x24325a, bright: 1.0 }));
    pBox(bk, 0.06, 0.043, 0, 0.012, 0.004, 0.2, objMat({ color: 0xf0d79a, bright: 1.6 }));
    pBox(bk, 0.06, 0.02, 0.112, 0.014, 0.04, 0.03, objMat({ color: 0xb8584e, bright: 1.1 }));
    var gl = N2.glowSprite(0xf0d79a, 0.55); gl.material.opacity = 0.32; gl.position.set(0, 0.06, 0); bk.add(gl);
    bedThings.push({ x: -1.95, z: 1.38, r: 1.0, kind: "n2journal", prompt: "press E to read your dream journal" });
  } catch (e) {}
}

/* ==================================================================== api */
J.open = function (tab) { return open(tab); };
J.close = function () { close(); };
J.isOpen = function () { return N2.ui.isOpen(PANEL); };
J.entries = function () {
  var a = []; for (var k in D.dreams) { var e = D.dreams[k], p = e.p || [];
    a.push({ recipe: e.r, name: e.n || nameOf(e.r), first: e.f, last: e.l, visits: e.v, seq: e.s, firstSeen: e.t, lastSeen: e.lt, mood: e.mb,
      palette: { sky: p[0] ? "#" + p[0] : null, glow: p[1] ? "#" + p[1] : null, accent: p[2] ? "#" + p[2] : null, wallB: p[3] ? "#" + p[3] : null, figure: p[4] ? "#" + p[4] : null },
      thumb: D.thumbs[e.r] ? thumbOf(e.r) : (thumbCache[e.r] || null) });
  }
  a.sort(function (x, y) { return (x.seq || 0) - (y.seq || 0); });   // oldest first, most recent last
  return a;
};
J.seenCount = seenCount;
J.has = function (r) { return !!D.dreams[r]; };
J.thumb = function (r) { return thumbOf(r) || thumbCache[r] || null; };
J.photos = function () { return PH.map(function (p) { return { id: p.id, t: p.t, night: p.n, recipe: p.r, name: p.nm, data: p.data, w: p.w, h: p.h }; }); };
J.nights = function () { return nightList().map(function (n) { return { night: n.n, dreams: n.d.slice(), peak: n.pk, shards: n.sh, photos: n.ph, recalls: n.rc, done: !!n.done, mood: n.mx == null ? null : { x: n.mx, y: n.my }, word: moodWord(n) }; }); };
J.snap = function () { return snap(); };
J.recall = function (r) { return recall(r); };
J.canRecall = function (r) { return recallState(r).ok; };
J.tab = function () { return ui.tab; };
J.debug = {
  storage: function () {
    var tot = 0, n = 0; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf("nemuri2_") === 0) { tot += (localStorage.getItem(k) || "").length; n++; } } } catch (e) {}
    return { keys: n, chars: tot, thumbs: Object.keys(D.thumbs).length, thumbChars: thumbTotal(), photos: PH.length, photoChars: JSON.stringify(PH).length, journalChars: JSON.stringify(D).length };
  },
  want: function () { return want ? want.r : null; },
  forceThumb: function () { if (N2.lastZone && !N2.lastZone.bedroom) want = { r: N2.lastZone.archetypeName, zone: N2.lastZone, tries: 0, isNew: false }; return !!want; },
  select: function (i) { select(i, false); return cur() ? (cur().e ? cur().e.r : cur().kind) : null; },
  sel: function () { return { tab: ui.tab, sel: ui.sel[ui.tab], n: ui.items.length, cols: P ? cols() : 0 }; },
  reset: function () { D = freshData(); thumbCache = {}; PH = []; flush(); savePhotos(); return true; }
};
