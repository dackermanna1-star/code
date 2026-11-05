/* =============================================================================
   nemuri II — INPUT & SOUND POLISH (module 95)
   * touch: a floating left thumb-stick, right-thumb look, soft round buttons
     (jump / touch / lantern / hands / journal / pause, + learned powers)
   * gamepad: standard mapping, polled every frame; menus navigable with it
   * audio: a generated convolution reverb sized by the kind of dream
     (small room / interior / open air / void), a gentle compressor + limiter
     before the speakers, and settings.volume as a final output gain.
   Analog movement wraps updatePlayer: the stick's direction is applied by
   briefly turning the walk direction (yaw offset) and holding W, then putting
   the view back exactly where it was — so every other module's movement code
   (flight, glide...) keeps working with no knowledge of sticks.
   ============================================================================= */
var IN = N2.mods.input = { ownsVolume: true };
var S = function () { return N2.settings || {}; };
function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }
function safe(fn) { try { return fn(); } catch (e) { if (window.console) console.warn("[N2 input]", e); } }

N2.bind("touch", "on a touch screen: left thumb wanders, right thumb looks", "input");
N2.bind("pad", "controller: left stick wander, right stick look", "input");
N2.bind("pad a", "a jump (hold to glide) · x touch · y hands · b lantern", "input");
N2.bind("pad lb", "lb blink · rb flight · lt sink · rt run", "input");
N2.bind("pad start", "start pause · back journal · d-pad up stillness, down camera", "input");

/* ------------------------------------------------------- synthetic keys ---- */
// Real KeyboardEvents, so the base and every module's hooks see them exactly like keys.
function keyOf(code) {
  if (code === "Space") return " ";
  if (/^Key/.test(code)) return code.slice(3).toLowerCase();
  if (code === "Escape") return "Escape"; if (code === "Enter") return "Enter";
  return code;
}
function fireKey(type, code) {
  try {
    var ev = new KeyboardEvent(type, { code: code, key: keyOf(code), bubbles: true, cancelable: true });
    (document.body || window).dispatchEvent(ev);
  } catch (e) {
    try { if (type === "keydown") onKeyDown({ code: code, key: keyOf(code), preventDefault: function () {}, stopPropagation: function () {} }); else onKeyUp({ code: code }); } catch (e2) {}
  }
}
function tapKey(code) { fireKey("keydown", code); fireKey("keyup", code); }
// held keys are tracked per source (touch / pad) so one never releases the other's
var held = {};
function isHeld(code) { for (var k in held) if (held[k] && k.split("|")[1] === code) return true; return false; }
function holdKey(code, down, who) {
  var id = (who || "t") + "|" + code;
  if (!!held[id] === !!down) return;
  var before = isHeld(code);
  held[id] = !!down;
  var after = isHeld(code);
  if (before !== after) fireKey(after ? "keydown" : "keyup", code);
}
function releaseAll(who) { for (var k in held) if (held[k] && (!who || k.split("|")[0] === who)) holdKey(k.split("|")[1], false, k.split("|")[0]); }

/* ----------------------------------------------------------- the stick ---- */
// unified analog move input: x right+, y down+ (screen convention), run flag
var touchStick = { x: 0, y: 0, on: false, run: false };
var padStick = { x: 0, y: 0, on: false, run: false, lx: 0, ly: 0 };
var padLook = { x: 0, y: 0 };
function activeStick() {
  if (touchStick.on && (touchStick.x * touchStick.x + touchStick.y * touchStick.y) > 0.0016) return touchStick;
  if (padStick.on) return padStick;
  return null;
}
function kbMoving() { return !!(keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD); }
function lookFree() { return (phase === "play" || phase === "transition") && !paused && !N2.uiOpen; }

var _upd = updatePlayer;
updatePlayer = function (dt) {
  if (phase === "graph") return _upd.apply(this, arguments);
  // gamepad look, framerate independent, with a soft response curve
  if ((padLook.x || padLook.y) && lookFree()) {
    var k = (+S().sens > 0 ? +S().sens : 1);
    yaw -= padLook.x * Math.abs(padLook.x) * 2.7 * k * dt;
    pitch -= padLook.y * Math.abs(padLook.y) * 1.9 * k * dt * (S().invertY ? -1 : 1);
    pitch = clampN(pitch, -1.45, 1.45);
  }
  var s = activeStick();
  if (!s || kbMoving()) return _upd.apply(this, arguments);
  var mag = Math.min(1, Math.sqrt(s.x * s.x + s.y * s.y));
  var off = -Math.atan2(s.x, -s.y);              // turn the walk direction toward the stick
  var m = 0.28 + 0.72 * Math.min(1, mag / 0.92); // analog speed
  var saved = { W: keys.KeyW, A: keys.KeyA, S: keys.KeyS, D: keys.KeyD, Sh: keys.ShiftLeft };
  var ms = moveSpeed, scaled = ms * m;
  keys.KeyW = true; keys.KeyA = keys.KeyS = keys.KeyD = false;
  if (s.run) keys.ShiftLeft = true;
  moveSpeed = scaled; yaw += off;
  try { return _upd.apply(this, arguments); }
  finally {
    yaw -= off;
    if (moveSpeed === scaled) moveSpeed = ms;
    keys.KeyW = saved.W; keys.KeyA = saved.A; keys.KeyS = saved.S; keys.KeyD = saved.D; keys.ShiftLeft = saved.Sh;
    try {
      camera.rotation.set(pitch, yaw, camera.rotation.z, "YXZ");
      camera.getWorldDirection(_dir);
      _flat.set(_dir.x, 0, _dir.z); if (_flat.lengthSq() < 1e-6) _flat.set(0, 0, -1); _flat.normalize();
      _right.crossVectors(_flat, worldUp).normalize();
    } catch (e) {}
  }
};

/* ================================================================ TOUCH ==== */
var touchSeen = false;
function coarse() { try { return !!(window.matchMedia && window.matchMedia("(pointer:coarse)").matches); } catch (e) { return false; } }
function isTouch() {
  var t = S().touch;
  if (t === "on") return true;
  if (t === "off") return false;
  return touchSeen || coarse();
}
IN.isTouch = isTouch;

N2.ui.css([
  "#n2in{position:fixed;inset:0;z-index:41;display:none;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;}",
  "#n2in.on{display:block;}",
  "#n2in .n2in-ring{position:absolute;left:0;top:0;width:var(--n2in-r2);height:var(--n2in-r2);margin:calc(var(--n2in-r2) / -2) 0 0 calc(var(--n2in-r2) / -2);border-radius:50%;border:1px solid rgba(170,200,220,.22);background:radial-gradient(circle,rgba(143,208,210,.05),rgba(8,14,30,.16) 70%);opacity:.55;transition:opacity .35s ease;pointer-events:none;}",
  "#n2in .n2in-ring.live{opacity:1;border-color:rgba(240,217,160,.34);transition:none;}",
  "#n2in .n2in-ring::after{content:'';position:absolute;inset:30%;border-radius:50%;border:1px dashed rgba(170,200,220,.10);}",
  "#n2in .n2in-knob{position:absolute;left:50%;top:50%;width:42%;height:42%;margin:-21% 0 0 -21%;border-radius:50%;background:radial-gradient(circle at 40% 35%,rgba(240,226,190,.42),rgba(143,208,210,.14) 60%,rgba(143,208,210,.04));border:1px solid rgba(230,228,218,.28);box-shadow:0 0 18px rgba(143,208,210,.16);}",
  "#n2in .n2in-ring.run .n2in-knob{box-shadow:0 0 22px rgba(240,217,160,.45);border-color:rgba(240,217,160,.6);}",
  "#n2in .n2in-lbl{position:absolute;left:0;right:0;top:calc(100% + 6px);text-align:center;font-size:9px;letter-spacing:.22em;color:rgba(160,180,200,.42);text-transform:lowercase;}",
  "#n2in .n2in-ring.live .n2in-lbl{opacity:0;}",
  ".n2in-b{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:50%;border:1px solid rgba(170,200,220,.26);background:radial-gradient(circle at 50% 38%,rgba(143,208,210,.07),rgba(6,10,22,.30) 72%);color:rgba(230,228,218,.72);font-size:9.5px;letter-spacing:.14em;text-transform:lowercase;text-indent:.14em;transition:transform .12s ease,background .25s ease,border-color .25s ease,opacity .4s ease;box-sizing:border-box;}",
  ".n2in-b .g{display:block;font-size:15px;line-height:1;margin-bottom:3px;letter-spacing:0;text-indent:0;color:rgba(240,217,160,.8);}",
  ".n2in-b>span{display:flex;flex-direction:column;align-items:center;}",
  ".n2in-b.dn{transform:scale(.92);border-color:rgba(240,217,160,.7);background:radial-gradient(circle,rgba(240,217,160,.22),rgba(6,10,22,.3) 75%);color:#fff;}",
  ".n2in-b.lit{border-color:rgba(232,168,96,.62);box-shadow:0 0 16px rgba(232,168,96,.25) inset;}",
  ".n2in-b.hide{display:none;}",
  ".n2in-pill{position:absolute;height:28px;padding:0 13px;border-radius:14px;display:flex;align-items:center;border:1px solid rgba(170,200,220,.22);background:rgba(6,10,22,.34);color:rgba(230,228,218,.62);font-size:9.5px;letter-spacing:.2em;text-transform:lowercase;}",
  ".n2in-pill.dn{border-color:rgba(240,217,160,.7);color:#fff;}",
  ".n2in-pill.hide{display:none;}",
  "html,body{overscroll-behavior:none;}",
  // with thumbs on screen, the little corner labels move out from under the buttons
  "body.n2in-touch #night{bottom:auto;top:calc(80px + env(safe-area-inset-top, 0px));right:calc(16px + env(safe-area-inset-right, 0px));}",
  "body.n2in-touch #n2-br{bottom:auto;top:calc(100px + env(safe-area-inset-top, 0px));right:calc(16px + env(safe-area-inset-right, 0px));}",
  "body.n2in-touch #hint{left:24%;right:24%;bottom:calc(16px + env(safe-area-inset-bottom, 0px));line-height:1.6;}",
  "@media (orientation:portrait){body.n2in-touch #hint{left:0;right:0;bottom:calc(46vh - 20px);padding:0 24px;} body.n2in-touch #n2s-letter{bottom:auto;top:24%;}}"
].join("\n"), "n2in-css");

var T = { root: null, ring: null, knob: null, btn: {}, stickId: null, lookId: null, sx: 0, sy: 0, lx: 0, ly: 0, R: 52, visible: false };
var SAFE_L = "env(safe-area-inset-left, 0px)", SAFE_R = "env(safe-area-inset-right, 0px)", SAFE_B = "env(safe-area-inset-bottom, 0px)", SAFE_T = "env(safe-area-inset-top, 0px)";

// id, label, glyph, size(px), right, bottom (px, from the safe corner), key, hold?
var BTN = [
  { id: "jump",   label: "jump",    g: "△", size: 76, r: 22,  b: 40,  key: "Space", hold: true },
  { id: "touch",  label: "touch",   g: "✧", size: 58, r: 112, b: 34,  key: "KeyE" },
  { id: "hands",  label: "hands",   g: "✋︎", size: 52, r: 34,  b: 132, key: "KeyR", need: "lucid" },
  { id: "lantern",label: "lantern", g: "◇", size: 52, r: 104, b: 112, key: "KeyF", need: "nightmare" },
  { id: "blink",  label: "blink",   g: "»", size: 44, r: 184, b: 40,  key: "KeyQ", power: "blink" },
  { id: "fly",    label: "fly",     g: "↟", size: 44, r: 174, b: 100, key: "KeyG", power: "flight" },
  { id: "still",  label: "still",   g: "◎", size: 44, r: 150, b: 162, key: "KeyT", power: "stillness" },
  { id: "sink",   label: "sink",    g: "▽", size: 44, r: 34,  b: 202, key: "ControlLeft", hold: true, flyOnly: true }
];
var PILLS = [
  { id: "pause",   label: "‖ pause",  r: 14,  t: 44, key: "KeyP" },
  { id: "journal", label: "journal",       r: 104, t: 44, key: "KeyJ", need: "journal" },
  { id: "photo",   label: "photo",         r: 192, t: 44, key: "KeyC", need: "journal" }
];
function px(n) { return n + "px"; }
function calcPx(n, safeVar) { return "calc(" + n + "px + " + safeVar + ")"; }

function buildTouch() {
  if (T.root) return;
  var root = T.root = document.createElement("div"); root.id = "n2in";
  var ring = T.ring = document.createElement("div"); ring.className = "n2in-ring";
  var knob = T.knob = document.createElement("div"); knob.className = "n2in-knob"; ring.appendChild(knob);
  var lb = document.createElement("div"); lb.className = "n2in-lbl"; lb.textContent = "wander"; ring.appendChild(lb);
  root.appendChild(ring);
  BTN.forEach(function (d) {
    var b = document.createElement("div"); b.className = "n2in-b"; b.setAttribute("data-n2in", d.id);
    b.innerHTML = "<span><i class='g'>" + d.g + "</i>" + d.label + "</span>";
    b.style.width = b.style.height = px(d.size);
    b.style.right = calcPx(d.r, SAFE_R); b.style.bottom = calcPx(d.b, SAFE_B);
    root.appendChild(b); T.btn[d.id] = { el: b, d: d, id: null };
  });
  PILLS.forEach(function (d) {
    var b = document.createElement("div"); b.className = "n2in-pill"; b.setAttribute("data-n2in", d.id);
    b.textContent = d.label; b.style.right = calcPx(d.r, SAFE_R); b.style.top = calcPx(d.t, SAFE_T);
    root.appendChild(b); T.btn[d.id] = { el: b, d: d, id: null, pill: true };
  });
  root.addEventListener("touchstart", onTStart, { passive: false });
  root.addEventListener("touchmove", onTMove, { passive: false });
  root.addEventListener("touchend", onTEnd, { passive: false });
  root.addEventListener("touchcancel", onTEnd, { passive: false });
  root.addEventListener("mousedown", function (e) { e.stopPropagation(); }); // emulated clicks never reach the base
  root.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  document.body.appendChild(root);
  layout();
}
function layout() {
  if (!T.root) return;
  var W = window.innerWidth, H = window.innerHeight, small = Math.min(W, H);
  // scale everything for tiny / portrait screens
  var sc = clampN(small / 390, 0.72, 1.18);
  T.R = Math.round(52 * sc);
  T.root.style.setProperty("--n2in-r2", px(T.R * 2.2));
  BTN.forEach(function (d) { var b = T.btn[d.id].el; b.style.width = b.style.height = px(Math.round(d.size * sc)); b.style.right = calcPx(Math.round(d.r * sc), SAFE_R); b.style.bottom = calcPx(Math.round(d.b * sc), SAFE_B); });
  restRing();
}
function restRing() {
  if (!T.ring) return;
  var x = 30 + T.R * 1.1 + 8, y = window.innerHeight - (26 + T.R * 1.1 + 14);
  T.ring.style.left = "calc(" + px(x) + " + " + SAFE_L + ")"; T.ring.style.top = "calc(" + px(y) + " - " + SAFE_B + ")";
  T.knob.style.transform = "";
  T.ring.classList.remove("live"); T.ring.classList.remove("run");
}
window.addEventListener("resize", function () { safe(layout); });

function btnFor(target) {
  var el = target && target.closest ? target.closest("[data-n2in]") : null;
  return el ? T.btn[el.getAttribute("data-n2in")] : null;
}
function pressBtn(B, down) {
  var d = B.d;
  B.el.classList.toggle("dn", down);
  if (d.hold) holdKey(d.key, down);
  else if (down) tapKey(d.key);
  if (down) { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} }
}
function onTStart(e) {
  touchSeen = true; e.preventDefault();
  safe(function () { audio.resume(); });
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i], B = btnFor(t.target);
    if (B) { if (B.id == null) { B.id = t.identifier; pressBtn(B, true); } continue; }
    var W = window.innerWidth;
    if (T.stickId == null && t.clientX < W * 0.44) {
      T.stickId = t.identifier;
      var m = T.R * 1.1 + 6;
      T.sx = clampN(t.clientX, m, W * 0.5); T.sy = clampN(t.clientY, m, window.innerHeight - m);
      T.ring.style.left = px(T.sx); T.ring.style.top = px(T.sy); T.ring.classList.add("live");
      touchStick.on = true; touchStick.x = touchStick.y = 0; touchStick.run = false;
      moveStick(t.clientX, t.clientY);
    } else if (T.lookId == null) {
      T.lookId = t.identifier; T.lx = t.clientX; T.ly = t.clientY;
    }
  }
}
function moveStick(x, y) {
  var dx = x - T.sx, dy = y - T.sy, len = Math.sqrt(dx * dx + dy * dy), R = T.R;
  // pulled far past the rim: the stick's base follows the thumb
  var lim = R * 1.55;
  if (len > lim) { var k = (len - lim) / len; T.sx += dx * k; T.sy += dy * k; dx = x - T.sx; dy = y - T.sy; len = lim; T.ring.style.left = px(T.sx); T.ring.style.top = px(T.sy); }
  var c = Math.min(len, R), nx = len > 0 ? dx / len : 0, ny = len > 0 ? dy / len : 0;
  var mag = c / R, dz = 0.12, v = mag < dz ? 0 : (mag - dz) / (1 - dz);
  touchStick.x = nx * v; touchStick.y = ny * v; touchStick.run = len > R * 1.22;
  T.knob.style.transform = "translate(" + (nx * c).toFixed(1) + "px," + (ny * c).toFixed(1) + "px)";
  T.ring.classList.toggle("run", touchStick.run);
}
function onTMove(e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    if (t.identifier === T.stickId) moveStick(t.clientX, t.clientY);
    else if (t.identifier === T.lookId) {
      var dx = t.clientX - T.lx, dy = t.clientY - T.ly; T.lx = t.clientX; T.ly = t.clientY;
      if (lookFree()) {
        var k = 0.0056 * (+S().sens > 0 ? +S().sens : 1) * clampN(390 / Math.min(window.innerWidth, window.innerHeight), 0.7, 1.4);
        yaw -= dx * k; pitch -= dy * k * 0.85 * (S().invertY ? -1 : 1); pitch = clampN(pitch, -1.45, 1.45);
      }
    } else {
      // a finger slid off a button: release it when it leaves
      for (var id in T.btn) { var B = T.btn[id]; if (B.id === t.identifier) { var r = B.el.getBoundingClientRect(), pad = 26; if (t.clientX < r.left - pad || t.clientX > r.right + pad || t.clientY < r.top - pad || t.clientY > r.bottom + pad) { B.id = null; B.el.classList.remove("dn"); if (B.d.hold) holdKey(B.d.key, false); } } }
    }
  }
}
function onTEnd(e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    if (t.identifier === T.stickId) { T.stickId = null; touchStick.on = false; touchStick.x = touchStick.y = 0; touchStick.run = false; restRing(); }
    else if (t.identifier === T.lookId) T.lookId = null;
    for (var id in T.btn) { var B = T.btn[id]; if (B.id === t.identifier) { B.id = null; B.el.classList.remove("dn"); if (B.d.hold) holdKey(B.d.key, false); } }
  }
}
function resetTouch() {
  T.stickId = T.lookId = null; touchStick.on = false; touchStick.x = touchStick.y = 0; touchStick.run = false;
  for (var id in T.btn) { var B = T.btn[id]; if (B.id != null && B.d.hold) holdKey(B.d.key, false); B.id = null; B.el.classList.remove("dn"); }
  restRing();
}
// any real touch anywhere flips "auto" on (some laptops report a fine pointer but have a screen you can touch)
window.addEventListener("touchstart", function () { touchSeen = true; }, { passive: true, capture: true });

function ending() { try { var Ti = N2.mods.title; return !!(Ti && Ti.isEnding && Ti.isEnding()); } catch (e) { return false; } }
var availT = 0;
function refreshAvail() {
  var L = N2.mods.lucid, NM = N2.mods.nightmare, J = N2.mods.journal;
  var flyingNow = false;
  for (var id in T.btn) {
    var B = T.btn[id], d = B.d, show = true;
    if (d.need && !N2.mods[d.need]) show = false;
    if (d.power) { try { show = !!(L && L.has && L.has(d.power)); } catch (e) { show = false; } if (inBedroom) show = false; }
    if (d.flyOnly) { try { flyingNow = !!(zoneFlags && zoneFlags.flight) || !!(L && L.flying && L.flying()); } catch (e) {} show = flyingNow; }
    B.el.classList.toggle("hide", !show);
  }
  try { if (T.btn.lantern) T.btn.lantern.el.classList.toggle("lit", !!(NM && NM.lanternOn && NM.lanternOn())); } catch (e) {}
  try { var bl = T.btn.jump; if (bl) bl.el.querySelector("span").lastChild.nodeValue = flyingNow ? "rise" : "jump"; } catch (e) {}
}
function tickTouch(dt) {
  var want = isTouch() && (phase === "play" || phase === "transition") && !paused && !N2.uiOpen && !ending();
  if (want && !T.root) buildTouch();
  if (!T.root) return;
  if (want !== T.visible) {
    T.visible = want; T.root.classList.toggle("on", want);
    try { document.body.classList.toggle("n2in-touch", want); } catch (e) {}
    if (!want) resetTouch(); else { layout(); refreshAvail(); }
  }
  if (want) { availT -= dt; if (availT <= 0) { availT = 0.4; refreshAvail(); } }
}

/* ============================================================== GAMEPAD ==== */
var G = { pad: null, prev: [], idSeen: {}, rep: { code: null, t: 0 }, announced: false, connected: false };
function getPads() { try { return navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { return []; } }
function pickPad() {
  var ps = getPads() || [], best = null;
  for (var i = 0; i < ps.length; i++) { var p = ps[i]; if (p && p.connected !== false && p.buttons && p.axes) { best = p; if (p.mapping === "standard") break; } }
  return best;
}
function bv(p, i) { var b = p.buttons[i]; if (!b) return 0; return typeof b === "object" ? (b.pressed ? Math.max(0.6, b.value || 1) : (b.value || 0)) : (b ? 1 : 0); }
function radial(x, y, dz) {
  var m = Math.sqrt(x * x + y * y); if (m < dz) return [0, 0];
  var k = Math.min(1, (m - dz) / (1 - dz)) / m; return [x * k, y * k];
}
window.addEventListener("gamepadconnected", function (e) { safe(function () { announce(e.gamepad); }); });
window.addEventListener("gamepaddisconnected", function () { safe(function () { if (!pickPad()) { G.connected = false; G.announced = false; padStick.on = false; padLook.x = padLook.y = 0; releaseAll("p"); try { N2.ui.toast("the controller has gone quiet"); } catch (e) {} } }); });
function announce(p) {
  // the toast waits until you are actually in the world (the title would hide it)
  G.connected = true;
  if (G.announced || phase !== "play" || N2.uiOpen) return;
  G.announced = true;
  try { N2.ui.toast("controller connected", "left stick to wander · a to jump · y to look at your hands"); } catch (e) {}
}
var MENU_MODE = function () { return phase === "title" || phase === "graph" || paused || !!N2.uiOpen || ending(); };
function tickPad(dt) {
  var p = pickPad();
  if (!p) { if (G.pad) { padStick.on = false; padLook.x = padLook.y = 0; releaseAll("p"); } G.pad = null; return; }
  if (!G.announced) announce(p);
  G.pad = p;
  var pressed = [], n = Math.min(17, p.buttons.length);
  for (var i = 0; i < 17; i++) pressed[i] = i < n ? bv(p, i) > 0.5 : false;
  var edge = function (i) { return pressed[i] && !G.prev[i]; };
  var ax = p.axes || [], L = radial(ax[0] || 0, ax[1] || 0, 0.2), R = radial(ax[2] || 0, ax[3] || 0, 0.16);
  var menu = MENU_MODE();
  if (menu) {
    padStick.on = false; padLook.x = padLook.y = 0;
    releaseAll("p");
    // d-pad / left stick → arrow keys with auto-repeat
    var dir = null;
    if (pressed[12] || L[1] < -0.6) dir = "ArrowUp"; else if (pressed[13] || L[1] > 0.6) dir = "ArrowDown";
    else if (pressed[14] || L[0] < -0.6) dir = "ArrowLeft"; else if (pressed[15] || L[0] > 0.6) dir = "ArrowRight";
    if (dir) { if (G.rep.code !== dir) { G.rep.code = dir; G.rep.t = 0.42; tapKey(dir); } else { G.rep.t -= dt; if (G.rep.t <= 0) { G.rep.t = 0.13; tapKey(dir); } } }
    else G.rep.code = null;
    if (edge(0)) tapKey("Enter");
    if (edge(1)) { if (N2.uiOpen) tapKey("Escape"); else if (paused) tapKey("KeyP"); }
    if (edge(9)) { if (phase === "title") tapKey("Enter"); else if (N2.uiOpen) tapKey("Escape"); else if (paused) tapKey("KeyP"); else if (phase === "graph") tapKey("Enter"); }
    if (edge(8) && N2.mods.journal && phase !== "title") tapKey("KeyJ");
  } else {
    G.rep.code = null;
    padStick.x = L[0]; padStick.y = L[1]; padStick.on = (L[0] || L[1]) ? true : false;
    padStick.run = pressed[7] || pressed[10] || bv(p, 7) > 0.35;
    padLook.x = R[0]; padLook.y = R[1];
    if (edge(0)) holdKey("Space", true, "p"); else if (!pressed[0]) holdKey("Space", false, "p");
    holdKey("ControlLeft", pressed[6], "p");
    if (edge(2)) tapKey("KeyE");
    if (edge(3)) tapKey("KeyR");
    if (edge(1)) tapKey("KeyF");
    if (edge(4)) tapKey("KeyQ");
    if (edge(5)) tapKey("KeyG");
    if (edge(9)) tapKey("KeyP");
    if (edge(8)) tapKey("KeyJ");
    if (edge(12)) tapKey("KeyT");
    if (edge(13)) tapKey("KeyC");
    if (edge(11)) tapKey("KeyV");
  }
  G.prev = pressed;
}
IN.gamepad = function () { return G.pad ? { id: G.pad.id, mapping: G.pad.mapping, announced: G.announced, stick: [padStick.x, padStick.y], look: [padLook.x, padLook.y] } : null; };

/* ================================================================ AUDIO ==== */
// room kinds → impulse character. rt = seconds to -60 dB, wet = send level.
var ROOMS = {
  room:     { len: 0.9, rt: 0.55, pre: 0.006, d0: 0.30, dk: 1.10, er: 10, wet: 0.11 },
  interior: { len: 1.8, rt: 1.35, pre: 0.012, d0: 0.22, dk: 0.48, er: 14, wet: 0.17 },
  exterior: { len: 2.6, rt: 2.2,  pre: 0.028, d0: 0.34, dk: 0.24, er: 4,  wet: 0.18 },
  void:     { len: 3.9, rt: 3.7,  pre: 0.055, d0: 0.16, dk: 0.12, er: 0,  wet: 0.30 }
};
var A = null, irCache = {}, roomKind = null, wantKind = "room";
function impulse(kind) {
  if (irCache[kind]) return irCache[kind];
  var c = audio.ctx, P = ROOMS[kind], sr = c.sampleRate, len = Math.max(64, Math.floor(sr * P.len)), pre = Math.floor(sr * P.pre);
  var buf = c.createBuffer(2, len, sr);
  for (var ch = 0; ch < 2; ch++) {
    var d = buf.getChannelData(ch), lp = 0, fadeIn = sr * 0.004;
    for (var i = pre; i < len; i++) {
      var t = (i - pre) / sr, env = Math.exp(-6.9 * t / P.rt) * Math.min(1, (i - pre) / fadeIn);
      var a = Math.min(0.97, P.d0 + t * P.dk);          // the tail darkens as it decays
      lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
      d[i] = lp * env * (1 + a * 1.6);
    }
    // a few early reflections for enclosed spaces
    for (var r = 0; r < P.er; r++) { var at = pre + Math.floor(sr * (0.004 + Math.random() * 0.07)); if (at < len) d[at] += (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.4) * (1 - r / (P.er + 1)); }
    // fade the very end to avoid a click
    var tail = Math.min(len, Math.floor(sr * 0.05)); for (var j = 0; j < tail; j++) d[len - 1 - j] *= j / tail;
  }
  irCache[kind] = buf; return buf;
}
function volK() { var v = +S().volume; return isFinite(v) ? clampN(v, 0, 1) : 1; }
function installGraph() {
  if (A || !audio.ctx) return;
  var c = audio.ctx;
  if (!audio.moodFilter) { installFallbackVolume(); A = { fallback: true }; return; }
  A = {};
  try { audio.moodFilter.disconnect(); } catch (e) {}
  A.bus = c.createGain(); A.bus.gain.value = 1;
  audio.moodFilter.connect(A.bus);
  // reverb send: band-limited so the wash stays soft
  A.hp = c.createBiquadFilter(); A.hp.type = "highpass"; A.hp.frequency.value = 200;
  A.lp = c.createBiquadFilter(); A.lp.type = "lowpass"; A.lp.frequency.value = 5200;
  A.send = c.createGain(); A.send.gain.value = 1;
  A.bus.connect(A.hp); A.hp.connect(A.lp); A.lp.connect(A.send);
  A.wetSum = c.createGain(); A.wetSum.gain.value = 1;
  // gentle glue compressor, then a brick-ish limiter
  A.comp = c.createDynamicsCompressor();
  A.comp.threshold.value = -18; A.comp.knee.value = 14; A.comp.ratio.value = 3; A.comp.attack.value = 0.008; A.comp.release.value = 0.3;
  A.makeup = c.createGain(); A.makeup.gain.value = 1.18;
  A.lim = c.createDynamicsCompressor();
  A.lim.threshold.value = -2.5; A.lim.knee.value = 0; A.lim.ratio.value = 20; A.lim.attack.value = 0.002; A.lim.release.value = 0.12;
  A.vol = c.createGain(); A.vol.gain.value = volK();
  A.bus.connect(A.comp); A.wetSum.connect(A.comp);
  A.comp.connect(A.makeup); A.makeup.connect(A.lim); A.lim.connect(A.vol); A.vol.connect(c.destination);
  A.slots = [];
  setRoom(wantKind, true);
}
function setRoom(kind, instant) {
  wantKind = kind;
  if (!A || A.fallback || !audio.ctx) return;
  if (kind === roomKind) return;
  var c = audio.ctx, now = c.currentTime, P = ROOMS[kind];
  try {
    var cv = c.createConvolver(); cv.normalize = true; cv.buffer = impulse(kind);
    var g = c.createGain(); g.gain.value = 0.0001;
    A.send.connect(cv); cv.connect(g); g.connect(A.wetSum);
    g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(P.wet, now + (instant ? 0.05 : 1.4));
    var old = A.slots.slice(); A.slots = [{ cv: cv, g: g }];
    old.forEach(function (s) {
      try { s.g.gain.cancelScheduledValues(now); s.g.gain.setValueAtTime(s.g.gain.value, now); s.g.gain.linearRampToValueAtTime(0.0001, now + 1.2); } catch (e) {}
      setTimeout(function () { try { A.send.disconnect(s.cv); } catch (e) {} try { s.cv.disconnect(); s.g.disconnect(); } catch (e) {} }, 1600 + ROOMS[kind].len * 1000);
    });
    roomKind = kind;
  } catch (e) { if (window.console) console.warn("[N2 input] reverb", e); }
}
// the transition: a brief swell of reverb as one dream smears into the next
function swell(amount, secs) {
  if (!A || A.fallback || !audio.ctx) return;
  try { var g = A.send.gain, now = audio.ctx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(amount, now + 0.25); g.linearRampToValueAtTime(1, now + 0.25 + secs); } catch (e) {}
}
function applyVolume(t) {
  if (!A || !audio.ctx) return;
  if (A.fallback) { try { if (!audio.muted) audio.fadeMaster(fbLast, 0.15); } catch (e) {} return; }
  try { var g = A.vol.gain, now = audio.ctx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(volK(), now + (t || 0.2)); } catch (e) {}
}
// no moodFilter to hang the chain on: scale fadeMaster targets instead (spec fallback)
var fbLast = 0.28;
function installFallbackVolume() {
  var _fm = audio.fadeMaster, _tm = audio.toggleMute;
  audio.fadeMaster = function (v, t) { fbLast = v; return _fm.call(this, v * volK(), t); };
  if (typeof _tm === "function") audio.toggleMute = function () { var r = _tm.apply(this, arguments); try { if (this.ctx && !this.muted) audio.fadeMaster(0.28, 0.3); } catch (e) {} return r; };
}
var _ainit = audio.init;
audio.init = function () {
  var r = _ainit.apply(this, arguments);
  safe(installGraph);
  return r;
};

// what kind of space is this dream? probe the floor, the walls and the sky above.
var _rc = null;
function classify(z) {
  if (!z) return "exterior";
  if (z.bedroom || inBedroom) return "room";
  var ox = pos.x, oz = pos.z, n = 0, on = 0, i, a;
  for (var ri = 0; ri < 3; ri++) { var rad = [6, 14, 26][ri]; for (i = 0; i < 8; i++) { a = i / 8 * Math.PI * 2 + ri * 0.4; n++; if (N2.groundAt(ox + Math.cos(a) * rad, oz + Math.sin(a) * rad) != null) on++; } }
  var frac = on / n, ceil = 0, walls = 0, far = z.fog && z.fog.far ? z.fog.far : 60;
  if (z.group && window.THREE) {
    if (!_rc) _rc = new THREE.Raycaster();
    _rc.camera = camera; _rc.near = 0.3;
    var eyeY = pos.y + (eyeH || 1.6), up = new THREE.Vector3(0, 1, 0), o = new THREE.Vector3(), d = new THREE.Vector3(), hits;
    var offs = [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]];
    _rc.far = 18;
    for (i = 0; i < offs.length; i++) { o.set(ox + offs[i][0], eyeY, oz + offs[i][1]); _rc.set(o, up); hits = _rc.intersectObject(z.group, true); if (hits.length) ceil++; }
    _rc.far = 22; o.set(ox, eyeY, oz);
    for (i = 0; i < 8; i++) { a = i / 8 * Math.PI * 2; d.set(Math.cos(a), 0, Math.sin(a)); _rc.set(o, d); hits = _rc.intersectObject(z.group, true); if (hits.length) walls++; }
  }
  IN._probe = { ground: Math.round(frac * 100) / 100, ceil: ceil, walls: walls, far: far };
  if (ceil >= 3 || (ceil >= 2 && walls >= 6)) return "interior";
  if (walls >= 7 && far < 60) return "interior";
  if (frac < 0.34 && walls <= 3) return "void";
  if (frac < 0.5 && walls <= 2 && far > 70) return "void";
  return "exterior";
}
N2.on("dreamBuilt", function (z) {
  safe(function () { var k = classify(z); IN._room = k; setRoom(k, false); });
}, -10);
N2.on("warp", function () { safe(function () { swell(2.4, 2.2); }); }, -10);
N2.on("settings", function (s, key) {
  if (key === "volume") safe(function () { applyVolume(0.2); });
});
IN.room = function () { return roomKind; };
IN._audio = function () {
  if (!A) return { installed: false, ctx: !!audio.ctx };
  if (A.fallback) return { installed: true, fallback: true };
  return { installed: true, room: roomKind, slots: A.slots.length, vol: A.vol.gain.value, wet: A.slots[0] ? A.slots[0].g.gain.value : 0, irLen: A.slots[0] && A.slots[0].cv.buffer ? A.slots[0].cv.buffer.duration : 0, reduction: A.comp.reduction, ctxState: audio.ctx.state };
};

/* ================================================================ HOOKS ==== */
N2.on("frame", function (dt) {
  try { tickPad(dt); } catch (e) { if (!IN._padErr) { IN._padErr = 1; if (window.console) console.warn("[N2 input] pad", e); } }
  try { tickTouch(dt); } catch (e) { if (!IN._tErr) { IN._tErr = 1; if (window.console) console.warn("[N2 input] touch", e); } }
  if (audio.ctx && !A) safe(installGraph);
});
N2.on("start", function () {
  safe(installGraph);
  setTimeout(function () {
    safe(function () {
      if (!isTouch()) return;
      if (hintEl) hintEl.textContent = "left thumb to wander \u00b7 right thumb to look";
      if (window.innerHeight > window.innerWidth * 1.05) N2.ui.toast("turn the screen sideways", "the dream is wider than it is tall", 4200);
    });
  }, 30);
}, -10);
N2.on("uiOpen", function () { releaseAll(); padStick.on = false; });

IN.touchState = function () { return { visible: T.visible, stick: [touchStick.x, touchStick.y], run: touchStick.run, stickId: T.stickId, lookId: T.lookId }; };
// debug: average cost (ms) of this module's per-frame work
IN._bench = function (n) { n = n || 500; var t0 = performance.now(); for (var i = 0; i < n; i++) { tickPad(0.016); tickTouch(0.016); } return (performance.now() - t0) / n; };
