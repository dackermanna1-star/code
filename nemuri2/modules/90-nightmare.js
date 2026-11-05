/* =============================================================================
   nemuri II — NIGHTMARES (module 90): the paper lantern, the pursuer, the door.

   the lantern (F): a small folded-paper lantern on a bamboo stick, carried in
   the lower right of your view. lit, it keeps the fog a few steps further off,
   warms the dream, and makes the wrong things hesitate. it burns oil; sleep
   (the waking room) and the other sleeper's letters refill it.

   the pursuer — "the coat-stand": from night 3 on, sometimes, something in the
   dream notices you. the lights stutter, the sound drains away, and far off in
   the fog stands a tall hall-stand wearing every coat you ever lost, a hood on
   top with nothing inside it but two small cold lights. it rocks toward you on
   its three wooden feet, slowly, then not slowly. somewhere a door has opened,
   glowing. reach it and you are out. if it reaches you first, it wraps you in
   a coat that smells of home, and you wake.

   API (N2.mods.nightmare): lanternOn() oil() chasing() forceChase(opts)
        setOil(v) toggleLantern(on) state() endChase(escaped)
   events: emits "chaseStart" ()  and "chaseEnd" (escaped:boolean)
   listens: "shard" (+25% oil), dreamBuilt, warp, beforeWarp, keydown (F)
   save key: "nightmare" { oil, hinted, seen, nights{night:count}, escapes, caught, lightHint }
   ============================================================================= */
var NM = N2.mods.nightmare = {};
N2.bind("KeyF", "lantern on / off", "nightmare");

/* ------------------------------------------------------------------ save ---- */
var sv = (function () {
  var s = N2.save.get("nightmare", null) || {};
  return {
    oil: (typeof s.oil === "number" && isFinite(s.oil)) ? Math.max(0, Math.min(1, s.oil)) : 1,
    hinted: !!s.hinted, seen: !!s.seen, lightHint: !!s.lightHint,
    nights: (s.nights && typeof s.nights === "object") ? s.nights : {},
    escapes: s.escapes | 0, caught: s.caught | 0
  };
})();
function persist() { try { N2.save.set("nightmare", sv); } catch (e) {} }
var saveT = 0;

function cl(v, a, b) { return v < a ? a : v > b ? b : v; }
function sm(k) { k = cl(k, 0, 1); return k * k * (3 - 2 * k); }
function rnd(a, b) { return a + (b - a) * Math.random(); }
function say(t) { try { beingSpeak(t); } catch (e) {} }
function pickOne(a) { return a[(Math.random() * a.length) | 0]; }

/* ------------------------------------------------------------------ hud ---- */
N2.ui.css([
  ".n2nm{display:flex;flex-direction:column;align-items:flex-start;gap:6px;opacity:0;transition:opacity .9s ease;}",
  ".n2nm.on{opacity:1;}",
  ".n2nm-row{display:flex;align-items:center;gap:8px;color:rgba(236,206,160,.72);font-size:10px;letter-spacing:.2em;text-transform:lowercase;}",
  ".n2nm-row svg{display:block;filter:drop-shadow(0 0 3px rgba(232,168,96,.0));transition:filter .6s;}",
  ".n2nm.lit .n2nm-row svg{filter:drop-shadow(0 0 4px rgba(240,180,100,.85));}",
  ".n2nm-bar{width:64px;height:3px;background:rgba(232,168,96,.14);position:relative;overflow:hidden;}",
  ".n2nm-bar i{position:absolute;left:0;top:0;bottom:0;width:100%;background:rgba(232,168,96,.55);transition:width .4s linear;}",
  ".n2nm.lit .n2nm-bar i{background:#eab070;box-shadow:0 0 6px rgba(240,176,100,.8);}",
  ".n2nm.low .n2nm-bar i{animation:n2nmLow 1.1s steps(2) infinite;}",
  "@keyframes n2nmLow{50%{opacity:.25}}",
  ".n2nm-cue{color:rgba(232,226,238,.94);font-size:11.5px;letter-spacing:.2em;opacity:0;transition:opacity .6s ease;text-transform:lowercase;white-space:nowrap;",
  "background:rgba(4,6,14,.58);padding:4px 9px;border-radius:3px;text-shadow:0 0 3px #000,0 0 8px rgba(0,0,0,.8);box-shadow:0 0 14px rgba(4,6,14,.4);}",
  ".n2nm-cue.on{opacity:1;}",
  ".n2nm-cue b{font-weight:normal;color:#ffe3a0;text-shadow:0 0 3px #000,0 0 8px rgba(255,200,110,.45);}",
  ".n2nm-cue .ar{display:inline-block;width:1.2em;text-align:center;color:#ffe3a0;font-size:13px;}",
  ".n2nm.chase .n2nm-row{color:rgba(246,222,182,.95);text-shadow:0 0 3px #000,0 0 7px rgba(0,0,0,.7);}",
  "body.n2in-touch #n2-bl{bottom:calc(180px + env(safe-area-inset-bottom, 0px));left:calc(16px + env(safe-area-inset-left, 0px));}",
  ".n2nm-cue.near{color:rgba(240,190,200,.92);}"
].join("\n"), "n2-nightmare-css");

var hud = null, hudRow = null, hudBar = null, hudWord = null, hudCue = null, hudShowT = 0;
function buildHud() {
  if (hud) return;
  var bl = N2.ui.region("bl");
  hud = N2.ui.el("div", "n2nm", "", bl);
  hudRow = N2.ui.el("div", "n2nm-row", "", hud);
  hudRow.innerHTML = "<svg width='9' height='14' viewBox='0 0 9 14'><line x1='4.5' y1='0' x2='4.5' y2='2.4' stroke='#c99a62' stroke-width='1'/>" +
    "<rect x='2.2' y='2' width='4.6' height='1.2' fill='#7a5638'/><ellipse cx='4.5' cy='7.4' rx='4' ry='4.4' fill='#eab070' opacity='.9'/>" +
    "<line x1='0.8' y1='6' x2='8.2' y2='6' stroke='#8a5a34' stroke-width='.6'/><line x1='0.8' y1='8.8' x2='8.2' y2='8.8' stroke='#8a5a34' stroke-width='.6'/>" +
    "<rect x='2.2' y='11.6' width='4.6' height='1.2' fill='#7a5638'/></svg>";
  hudBar = N2.ui.el("span", "n2nm-bar", "<i></i>", hudRow);
  hudWord = N2.ui.el("span", "", "lantern", hudRow);
  hudCue = N2.ui.el("div", "n2nm-cue", "", hud);
}
var ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
var _cueTxt = "", _lastOilW = -1, _lastWord = "";
function tickHud(dt) {
  if (!hud) return;
  var playing = phase === "play" || phase === "transition";
  var show = playing && (lit || hudShowT > 0 || chasing());
  hudShowT = Math.max(0, hudShowT - dt);
  hud.classList.toggle("on", !!show);
  hud.classList.toggle("lit", litK > 0.5);
  hud.classList.toggle("low", sv.oil < 0.15 && lit);
  hud.classList.toggle("chase", C.state !== "idle" && C.state !== "escaping");
  var w = Math.round(sv.oil * 100);
  if (w !== _lastOilW) { _lastOilW = w; var i = hudBar.firstChild; if (i) i.style.width = w + "%"; }
  var wd = sv.oil <= 0.001 ? "dry" : lit ? "lit" : "lantern";
  if (wd !== _lastWord) { _lastWord = wd; hudWord.textContent = wd; }
  // chase cue
  var txt = "", near = false;
  if (C.state === "omen") txt = "…";
  else if (C.state === "appear" || C.state === "walk" || C.state === "run") {
    if (C.door) {
      var dx = C.door.x - pos.x, dz = C.door.z - pos.z, d = Math.hypot(dx, dz);
      var fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      var ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz); // 0 ahead, + right
      var idx = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
      txt = (C.state === "appear" ? "something is there" : "it is coming") + " · the door <span class='ar'>" + ARROWS[idx] + "</span><b>" + Math.max(1, Math.round(d)) + " m</b>";
    } else txt = "it is coming";
    near = C.dist < 9;
  } else if (C.state === "caught") txt = "";
  if (txt !== _cueTxt) { _cueTxt = txt; hudCue.innerHTML = txt; }
  hudCue.classList.toggle("on", !!txt);
  hudCue.classList.toggle("near", near);
}

/* =============================================================================
   THE LANTERN
   ============================================================================= */
var lit = false;        // wished on
var litK = 0;           // burning amount 0..1 (eased)
var raiseK = 0;         // 0..1 raised into view
var flick = 1, flickT = 0, flickTarget = 1;
var gutterT = 0;        // >0 while it splutters out
var rig = null, LP = {};
var pend = { ax: 0, az: 0, vx: 0, vz: 0 }, lastYaw = null, lastPX = 0, lastPZ = 0, lastFwd = 0;
var DRAIN = 1 / 150;    // a full lantern burns for about two and a half minutes
var REFILL_BED = 1 / 80;

function paperTex() {
  return canvasTex(function (x, S, H) {
    var g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#efb870"); g.addColorStop(0.5, "#ffe4ae"); g.addColorStop(1, "#e6a862");
    x.fillStyle = g; x.fillRect(0, 0, S, H);
    var i;
    for (i = 0; i < 110; i++) { x.globalAlpha = 0.06 + Math.random() * 0.1; x.fillStyle = Math.random() < 0.5 ? "#b97a3a" : "#fff3d6"; x.fillRect(Math.random() * S, Math.random() * H, 1, 2 + Math.random() * 9); }
    x.globalAlpha = 1;
    // a painted crescent on one side, three small stars on the other
    function crescent(cx, cy, r, d) {
      var R = Math.sqrt(r * r + d * d);
      x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);
      x.arc(cx - d, cy, R, Math.atan2(r, d), Math.atan2(-r, d), true); x.closePath(); x.fill();
    }
    x.fillStyle = "rgba(138,62,30,0.62)"; crescent(S * 0.22, H * 0.5, H * 0.16, H * 0.07);
    x.fillStyle = "rgba(138,62,30,0.5)";
    [[0.68, 0.38], [0.76, 0.56], [0.62, 0.62]].forEach(function (p) { x.fillRect(p[0] * S - 1, p[1] * H - 1, 2, 2); });
    x.fillStyle = "rgba(120,60,28,0.35)"; x.fillRect(0, 0, S, 2); x.fillRect(0, H - 2, S, 2);
  }, 64, { h: 64 });
}
function rod(parent, ax, ay, az, bx, by, bz, r, mat, seg) {
  var dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
  var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, seg || 5, 1), mat);
  m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
  parent.add(m); return m;
}
function buildLantern() {
  if (rig || !camera || !scene) return;
  if (!camera.parent) scene.add(camera);           // camera children are rendered only when the camera is in the scene
  rig = new THREE.Group(); rig.name = "n2-lantern";
  var hang = new THREE.Group(); rig.add(hang);      // the stick's tip: the lantern swings from here
  var swing = new THREE.Group(); hang.add(swing);
  var paper = objMat({ map: paperTex(), color: 0xeea060, bright: 1.65, transparent: true, side: THREE.DoubleSide });
  var lacquer = objMat({ color: 0x2a1812, bright: 0.95, transparent: true });
  var rib = objMat({ color: 0x8a4a24, bright: 1.0, transparent: true });
  var bamboo = objMat({ color: 0x8a7446, bright: 0.85, transparent: true });
  var tassel = objMat({ color: 0x8a2a26, bright: 1.0, transparent: true });
  // profile of a round folded-paper lantern
  var pts = [], N = 12, HH = 0.2, i;
  function radAt(t) { return 0.03 + 0.062 * Math.pow(Math.sin(Math.PI * t), 0.75); }
  for (i = 0; i <= N; i++) { var t = i / N; pts.push(new THREE.Vector2(radAt(t), -HH / 2 + HH * t)); }
  var bodyY = -0.17;
  var body = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), paper); body.position.y = bodyY; swing.add(body);
  var ribs = [];
  for (i = 1; i < 6; i++) {
    var tt = i / 6, rr0 = radAt(tt) + 0.0025;
    var rg = new THREE.Mesh(new THREE.TorusGeometry(rr0, 0.0032, 3, 16), rib);
    rg.rotation.x = Math.PI / 2; rg.position.y = bodyY - HH / 2 + HH * tt; swing.add(rg); ribs.push(rg);
  }
  var capT = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.036, 0.02, 12), lacquer); capT.position.y = bodyY + HH / 2 + 0.008; swing.add(capT);
  var capB = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.031, 0.02, 12), lacquer); capB.position.y = bodyY - HH / 2 - 0.008; swing.add(capB);
  var handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0025, 3, 10, Math.PI), lacquer); handle.position.y = bodyY + HH / 2 + 0.018; swing.add(handle);
  rod(swing, 0, 0, 0, 0, bodyY + HH / 2 + 0.042, 0, 0.0018, lacquer, 3);           // the cord
  rod(swing, 0, bodyY - HH / 2 - 0.018, 0, 0, bodyY - HH / 2 - 0.05, 0, 0.0018, tassel, 3);
  var tas = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 6), tassel); tas.position.y = bodyY - HH / 2 - 0.075; swing.add(tas);
  // the bamboo stick, coming from your hand below the corner of the view
  rod(hang, 0, 0.004, 0, 0.2, -0.5, 0.2, 0.0075, bamboo, 5);
  rod(hang, 0, 0.004, 0, -0.03, 0.02, 0, 0.0055, bamboo, 4);
  // glow
  var halo = N2.glowSprite(0xffb066, 0.5); halo.position.y = bodyY; halo.material.opacity = 0.7; swing.add(halo);
  var core = N2.glowSprite(0xfff0c8, 0.2); core.position.y = bodyY - 0.01; swing.add(core);
  // a depth clear right before the lantern draws, so it never sinks into walls
  var dc = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, transparent: true }));
  dc.position.set(0, 0, -0.3); dc.frustumCulled = false; dc.renderOrder = 9990;
  dc.onBeforeRender = function (r) { try { r.state.buffers.depth.setMask(true); r.clearDepth(); } catch (e) {} };
  rig.add(dc);
  rig.traverse(function (o) { if (o !== dc && (o.isMesh || o.isSprite)) { o.renderOrder = o.isSprite ? 9996 : 9993; o.frustumCulled = false; } });
  core.renderOrder = 9997;
  rig.scale.setScalar(0.62);
  rig.position.set(0.4, -0.9, -0.62);
  camera.add(rig);
  LP = { hang: hang, swing: swing, body: body, paper: paper, halo: halo, core: core, ribs: ribs, dc: dc };
}

function setLantern(on, quiet) {
  on = !!on;
  if (on && sv.oil <= 0.001) {
    if (!quiet) { say(pickOne(["the lantern is dry. sleep will fill it again", "no oil left. the letters remember how to burn", "the wick is cold"])); try { audio.tone(220, "sine", 0.03, 0.01, 0.4, 0.3); } catch (e) {} }
    hudShowT = 3; return false;
  }
  if (lit === on) return lit;
  lit = on; gutterT = 0; hudShowT = 3.5;
  if (!quiet && audio.ctx) {
    try {
      if (on) { audio.noise(0.18, "bandpass", 2400, 900, 0.05, 0.4); audio.tone(523, "sine", 0.035, 0.01, 0.9, 0.35); audio.tone(784, "sine", 0.018, 0.02, 1.1, 0.35); }
      else { audio.noise(0.25, "lowpass", 900, 200, 0.04, 0.4); }
    } catch (e) {}
  }
  return lit;
}

function tickLanternVisual(dt) {
  if (!rig) { try { buildLantern(); } catch (e) { rig = null; } if (!rig) return; }
  var visibleNow = (phase === "play" || phase === "transition") && !(N2.mods.lucid && N2.mods.lucid.checking && safeCall(N2.mods.lucid.checking));
  var burning = lit && sv.oil > 0;
  litK += ((burning ? 1 : 0) - litK) * Math.min(1, dt * (burning ? 3.2 : 2.2));
  raiseK += ((lit && visibleNow ? 1 : 0) - raiseK) * Math.min(1, dt * (lit ? 3.4 : 2.4));
  rig.visible = raiseK > 0.01 && visibleNow;
  // flame flicker (steadier when full, ragged when low or when the dark is near)
  flickT -= dt;
  if (flickT <= 0) {
    var ragged = (sv.oil < 0.15 ? 0.5 : 0.12) + (C.state === "omen" ? 0.7 : 0) + (C.state === "run" && C.dist < 12 ? 0.35 : 0);
    flickTarget = 1 - Math.random() * ragged; flickT = rnd(0.04, 0.14);
  }
  flick += (flickTarget - flick) * Math.min(1, dt * 18);
  if (gutterT > 0) flick *= 0.4 + Math.random() * 0.6;
  // pendulum: turning and walking set it swinging
  if (lastYaw == null) lastYaw = yaw;
  var dyaw = yaw - lastYaw; lastYaw = yaw;
  if (dyaw > Math.PI) dyaw -= Math.PI * 2; else if (dyaw < -Math.PI) dyaw += Math.PI * 2;
  var yawRate = dt > 0 ? dyaw / dt : 0;
  var fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  var fwd = dt > 0 ? ((pos.x - lastPX) * fx + (pos.z - lastPZ) * fz) / dt : 0; lastPX = pos.x; lastPZ = pos.z;
  if (!isFinite(fwd) || Math.abs(fwd) > 40) fwd = 0;
  var acc = dt > 0 ? (fwd - lastFwd) / dt : 0; lastFwd = fwd; acc = cl(acc, -40, 40);
  var bp = (typeof bobPhase === "number") ? bobPhase : 0;
  pend.vz += (-pend.az * 26 - pend.vz * 2.6 + yawRate * 1.6 + Math.cos(bp * 2) * Math.min(1, Math.abs(fwd) / 5) * 1.3) * dt;
  pend.vx += (-pend.ax * 26 - pend.vx * 2.6 - acc * 0.16 + Math.sin(bp * 2) * Math.min(1, Math.abs(fwd) / 5) * 0.6) * dt;
  pend.az = cl(pend.az + pend.vz * dt, -0.7, 0.7); pend.ax = cl(pend.ax + pend.vx * dt, -0.6, 0.6);
  LP.swing.rotation.z = pend.az; LP.swing.rotation.x = pend.ax;
  var bob = Math.sin(bp * 2) * 0.012 * Math.min(1, Math.abs(fwd) / 4), side = Math.cos(bp) * 0.008 * Math.min(1, Math.abs(fwd) / 4);
  var lift = sm(raiseK);
  // keep it inside the frustum on narrow (portrait) screens: the visible half-width at the rig's depth
  var asp = (camera && camera.aspect) || 1.6, hw = 0.62 * Math.tan(((camera && camera.fov) || 72) * Math.PI / 360) * asp;
  var rx = Math.min(0.41, hw * 0.7);
  var tall = asp < 1;                       // portrait phone: smaller, and lifted clear of the thumb buttons
  rig.scale.setScalar(tall ? 0.42 : 0.62);
  rig.position.set(rx + side - cl(yawRate, -3, 3) * 0.004, (tall ? -0.06 : -0.17) + bob - (1 - lift) * 0.5 + Math.sin(performance.now() * 0.0011) * 0.003, -0.62);
  rig.rotation.z = -0.06 + cl(yawRate * 0.01, -0.08, 0.08);
  // light
  var b = 0.4 + litK * (1.1 + flick * 0.22);
  LP.paper.uniforms.uBright.value = b;
  LP.halo.material.opacity = litK * (0.42 + flick * 0.34);
  LP.core.material.opacity = litK * (0.6 + flick * 0.4);
  var hs = 0.4 + flick * 0.12; LP.halo.scale.set(hs, hs, 1);
  tickPool(visibleNow);
}

/* ---------- the pool of warm light the lantern throws on the ground around you ---------- */
var pool = null, poolY = 0;
function poolTexture() {
  var c = document.createElement("canvas"); c.width = c.height = 128; var x = c.getContext("2d");
  // premultiplied (fades to black): it is drawn with a "screen" blend, which brightens dark ground
  // strongly and bright ground (snow, sand) only a little, so it never blows out to white
  x.fillStyle = "#000"; x.fillRect(0, 0, 128, 128);
  var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgb(255,214,150)"); g.addColorStop(0.22, "rgb(184,135,80)"); g.addColorStop(0.55, "rgb(60,36,18)"); g.addColorStop(1, "rgb(0,0,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function buildPool() {
  var m = new THREE.MeshBasicMaterial({ map: poolTexture(), color: 0x000000, transparent: true, depthWrite: false, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneMinusDstColorFactor, blendDst: THREE.OneFactor,
    // no depth test: on uneven ground a flat disc would be cut off by every rise; drawn on top it
    // simply warms whatever is at your feet (and the near side of anything standing there)
    depthTest: false });
  pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  pool.rotation.x = -Math.PI / 2; pool.renderOrder = 50; pool.frustumCulled = false; pool.visible = false;
  scene.add(pool);
}
function tickPool(visibleNow) {
  if (!scene) return;
  if (!pool) { try { buildPool(); } catch (e) { pool = false; } }
  if (!pool) return;
  if (pool.parent !== scene) scene.add(pool);
  var k = litK * (inBedroom ? 0.5 : 1);
  pool.visible = visibleNow && k > 0.02 && !(zoneFlags && zoneFlags.flight && !grounded && pos.y - poolY > 6);
  if (!pool.visible) return;
  if (grounded || Math.abs(pos.y - poolY) > 8) poolY = pos.y;
  // a little ahead and to the right, where the lantern hangs
  var fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  pool.position.set(pos.x + fx * 1.6 + rx * 0.5, poolY + 0.04, pos.z + fz * 1.6 + rz * 0.5);
  var sz = 11 * (0.94 + flick * 0.08) * (0.7 + 0.3 * k); pool.scale.set(sz, sz, 1);
  pool.material.color.setRGB(1, 0.72, 0.46).multiplyScalar(k * (0.62 + flick * 0.12));
}
function safeCall(f) { try { return f(); } catch (e) { return null; } }

function tickOil(dt) {
  if (inBedroom) {
    if (sv.oil < 1) { sv.oil = Math.min(1, sv.oil + REFILL_BED * dt); if (Math.random() < dt * 0.3) hudShowT = Math.max(hudShowT, 1.5); }
  } else if (lit && phase === "play") {
    sv.oil = Math.max(0, sv.oil - DRAIN * dt * (C.state === "run" ? 1.25 : 1));
    if (sv.oil <= 0 && gutterT <= 0) { gutterT = 1.4; say(pickOne(["the lantern gutters out", "the little flame folds itself away", "the paper goes dark"])); }
  }
  if (gutterT > 0) { gutterT -= dt; if (gutterT <= 0) { lit = false; hudShowT = 4; } }
  saveT -= dt; if (saveT <= 0) { saveT = 6; persist(); }
}

/* -------------------- fog push-back: multiply whatever the dream set -------- */
var fogBase = new THREE.Vector2(8, 60), fogWritten = new THREE.Vector2(-1, -1), fogDip = 0, chaseFog = 0;
function tickFog(dt) {
  if (typeof U_fogDist === "undefined" || !U_fogDist || !U_fogDist.value) return;
  var v = U_fogDist.value;
  if (Math.abs(v.x - fogWritten.x) > 1e-4 || Math.abs(v.y - fogWritten.y) > 1e-4) fogBase.set(v.x, v.y); // someone else (a new dream, an anomaly) set it
  var cf = (C.state === "appear" || C.state === "walk" || C.state === "run" || C.state === "caught") ? 1 : 0;
  chaseFog += (cf - chaseFog) * Math.min(1, dt * 0.8);
  var lk = litK * (0.9 + flick * 0.1);
  var mn = (1 + 0.85 * lk) * (1 - 0.35 * chaseFog) * (1 - 0.72 * fogDip);
  var mf = (1 + 0.62 * lk) * (1 - 0.2 * chaseFog) * (1 - 0.6 * fogDip);
  v.set(fogBase.x * mn, fogBase.y * mf);
  fogWritten.set(v.x, v.y);
}

// an anomaly that snapshots the fog (the base's "breathing") must snapshot the dream's own fog, not
// the lantern-multiplied one — otherwise it writes the pushed-back value back as the new base and the
// push-back sticks (and doubles when lit again). Hand it the unmultiplied fog first.
if (typeof startEmergent === "function") {
  var _startEmergent = startEmergent;
  startEmergent = function () {
    try {
      var v = U_fogDist && U_fogDist.value;
      if (v && Math.abs(v.x - fogWritten.x) < 1e-4 && Math.abs(v.y - fogWritten.y) < 1e-4) { v.set(fogBase.x, fogBase.y); fogWritten.set(v.x, v.y); }
    } catch (e) {}
    return _startEmergent.apply(this, arguments);
  };
}

/* ------------------- dark things hesitate in the light ---------------------- */
function isHorror(e) { var k = e && e.kind; return typeof k === "string" && (k.indexOf("horror") === 0 || k === "double"); }
var wrapScan = 0, _hesitated = false;
function hesitation(e) {
  if (litK < 0.15 || !e || !e.obj || !e.obj.position) return 1;
  var d = Math.hypot(e.obj.position.x - pos.x, e.obj.position.z - pos.z);
  if (d > 14) return 1;
  if (!_hesitated && d < 9 && litK > 0.6) { _hesitated = true; if (!sv.lightHint) { sv.lightHint = true; persist(); setTimeout(function () { say("it does not like the light"); }, 200); } }
  return 1 - litK * 0.72 * (1 - d / 14);
}
function wrapHorrors() {
  for (var i = 0; i < entities.length; i++) {
    var e = entities[i]; if (!e || e._n2nm || typeof e.update !== "function") continue;
    if (!isHorror(e)) { e._n2nm = 1; continue; }
    e._n2nm = 2;
    (function (e, orig) {
      e.update = function (dt, p) { var s = 1; try { s = hesitation(e); } catch (er) {} return orig.call(this, dt * s, p); };
    })(e, e.update);
  }
}

/* =============================================================================
   THE PURSUER — the coat-stand
   ============================================================================= */
var COAT_COLS = [0x6a6e78, 0x7a5a3e, 0x8a7a4a, 0x5a3a3a, 0x4e5a4a, 0x7c6a5a, 0x50586a];  // grey, camel, mustard, faded red, moss, oatmeal, school navy
function weaveTex(kind) {
  return canvasTex(function (x, S, H) {
    x.fillStyle = "#b8b8b8"; x.fillRect(0, 0, S, H);
    var i, j;
    if (kind === 0) { // herringbone-ish
      for (j = 0; j < H; j += 4) for (i = 0; i < S; i += 4) { x.fillStyle = ((i + j) / 4) % 2 ? "#a2a2a2" : "#c6c6c6"; x.fillRect(i, j, 4, 2); }
    } else if (kind === 1) { // faded check
      x.fillStyle = "rgba(70,70,70,.35)"; for (i = 0; i < S; i += 8) x.fillRect(i, 0, 2, H); for (j = 0; j < H; j += 8) x.fillRect(0, j, S, 2);
    } else { // plain wool, speckled
      for (i = 0; i < 260; i++) { x.fillStyle = Math.random() < 0.5 ? "#9c9c9c" : "#d0d0d0"; x.fillRect(Math.random() * S, Math.random() * H, 1, 1); }
    }
    // darker hem and seams, damp at the bottom
    var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "rgba(255,255,255,.12)"); g.addColorStop(0.75, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.45)");
    x.fillStyle = g; x.fillRect(0, 0, S, H);
    x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(0, H - 4, S, 2); x.fillRect(S / 2 - 1, 0, 1, H);
  }, 32, { h: 64 });
}
function buildPursuer() {
  var root = new THREE.Group(); root.name = "n2-pursuer";
  var rock = new THREE.Group(); root.add(rock);
  var wood = objMat({ color: 0x2c221c, bright: 0.78 });
  var brass = objMat({ color: 0x9a8050, bright: 1.05 });
  var tex = [weaveTex(0), weaveTex(1), weaveTex(2)];
  var cloakM = objMat({ map: tex[2], color: 0x1c2030, bright: 0.7, side: THREE.DoubleSide });
  var voidM = objMat({ color: 0x030306, bright: 0.25, side: THREE.DoubleSide });
  var boneM = objMat({ color: 0xcfc6b2, bright: 0.95 });
  var i, a;
  // three splayed wooden feet
  var feet = [];
  for (i = 0; i < 3; i++) {
    a = i / 3 * Math.PI * 2;
    feet.push(rod(rock, 0, 0.42, 0, Math.sin(a) * 0.62, 0.05, Math.cos(a) * 0.62, 0.032, wood, 5));
    var toe = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), wood); toe.position.set(Math.sin(a) * 0.64, 0.04, Math.cos(a) * 0.64); toe.scale.y = 0.6; rock.add(toe);
  }
  // the pole, with turned knobs
  var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.05, 3.9, 6), wood); pole.position.y = 2.33; rock.add(pole);
  [0.42, 1.25, 2.2].forEach(function (y) { var k = new THREE.Mesh(new THREE.SphereGeometry(0.075, 7, 5), wood); k.position.y = y; k.scale.y = 0.55; rock.add(k); });
  // the long cloak: the figure's body
  var cloak = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.54, 2.75, 12, 1, true), cloakM);
  cloak.position.y = 2.62; cloak.scale.z = 0.78; rock.add(cloak);
  var shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6), cloakM); shoulders.position.y = 3.95; shoulders.scale.set(1.45, 0.42, 0.88); rock.add(shoulders);
  // buttons down the front, pale as teeth but they are only buttons
  for (i = 0; i < 5; i++) { var bt = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), boneM); var by = 3.65 - i * 0.42, rr0 = 0.17 + (0.54 - 0.17) * ((3.995 - by) / 2.75); bt.position.set(0, by, rr0 * 0.78 + 0.012); rock.add(bt); }
  // sleeves of the cloak — the arms, far too long
  function arm(side) {
    var piv = new THREE.Group(); piv.position.set(side * 0.38, 3.88, 0.02); rock.add(piv);
    var up = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.085, 0.84, 7, 1, true), cloakM); up.position.y = -0.42; piv.add(up);
    var elbow = new THREE.Group(); elbow.position.y = -0.82; piv.add(elbow);
    var el = new THREE.Mesh(new THREE.SphereGeometry(0.085, 7, 5), cloakM); elbow.add(el);
    var fo = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.104, 0.86, 7, 1, true), cloakM); fo.position.y = -0.43; elbow.add(fo);
    var cuff = new THREE.Mesh(new THREE.CircleGeometry(0.1, 8), voidM); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.85; elbow.add(cuff);
    return { piv: piv, elbow: elbow, side: side };
  }
  var armL = arm(-1), armR = arm(1);
  // crown of hooks, like the antlers of a hall-stand
  var hooks = [];
  for (i = 0; i < 7; i++) {
    a = (i + 0.5) / 7 * Math.PI * 2;
    var sx = Math.sin(a), sz = Math.cos(a);
    var hr = (i % 2) ? 0.5 : 0.42, hy = (i % 2) ? 4.62 : 4.5;
    rod(rock, sx * 0.05, 4.02, sz * 0.05, sx * 0.22, 4.22, sz * 0.22, 0.016, brass, 4);
    rod(rock, sx * 0.22, 4.22, sz * 0.22, sx * hr, hy, sz * hr, 0.013, brass, 4);
    rod(rock, sx * hr, hy, sz * hr, sx * (hr + 0.1), hy - 0.1, sz * (hr + 0.1), 0.011, brass, 4);
    var tip = new THREE.Mesh(new THREE.SphereGeometry(0.026, 5, 4), brass); tip.position.set(sx * (hr + 0.1), hy - 0.11, sz * (hr + 0.1)); rock.add(tip);
    hooks.push({ a: a, x: sx * 0.24, y: 4.24, z: sz * 0.24 });
  }
  // the hood, with nothing in it
  var hoodPiv = new THREE.Group(); hoodPiv.position.set(0, 4.12, 0.02); rock.add(hoodPiv);
  var hood = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.7), cloakM);
  hood.rotation.x = 1.25; hood.position.set(0, 0.2, -0.02); hood.scale.set(1, 1.18, 1.1); hoodPiv.add(hood);
  var inner = new THREE.Mesh(new THREE.SphereGeometry(0.255, 10, 7), voidM); inner.position.set(0, 0.2, -0.04); hoodPiv.add(inner);
  var pallor = new THREE.Mesh(new THREE.CircleGeometry(0.11, 10), objMat({ color: 0x8a94a4, bright: 0.32, transparent: true, opacity: 0.5 }));
  pallor.position.set(0, 0.16, 0.2); pallor.scale.y = 1.3; hoodPiv.add(pallor);
  var eyeM = objMat({ color: 0xe6eeff, bright: 2.2 });
  var eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.017, 5, 4), eyeM); eyeL.position.set(-0.045, 0.2, 0.22); hoodPiv.add(eyeL);
  var eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.017, 5, 4), eyeM); eyeR.position.set(0.045, 0.2, 0.22); hoodPiv.add(eyeR);
  var eyeGlow = N2.glowSprite(0xcfe0ff, 0.55); eyeGlow.position.set(0, 0.2, 0.24); eyeGlow.material.opacity = 0.0; hoodPiv.add(eyeGlow);
  // every coat you ever lost, hanging from the hooks around its back and sides
  var coats = [], sides = [0, 1, 2, 4, 5, 6]; // skip the hook that would cover the front
  for (i = 0; i < sides.length; i++) {
    var h = hooks[sides[i]], cg = new THREE.Group(); cg.position.set(h.x, h.y - 0.05, h.z); rock.add(cg);
    var sw = new THREE.Group(); cg.add(sw);
    var face = new THREE.Group(); face.rotation.y = h.a; sw.add(face);
    var len = rnd(1.15, 1.85), col = COAT_COLS[i % COAT_COLS.length];
    var cm = objMat({ map: tex[i % 3], color: col, bright: rnd(0.8, 1.0), side: THREE.DoubleSide });
    var bodyc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.3, len, 9, 1, true), cm); bodyc.position.set(0, -len / 2 - 0.08, 0.1); bodyc.scale.z = 0.5; face.add(bodyc);
    var coll = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.19, 0.12, 9, 1, true), cm); coll.position.set(0, -0.08, 0.1); coll.scale.z = 0.6; face.add(coll);
    rod(face, -0.17, -0.06, 0.1, 0.17, -0.06, 0.1, 0.008, brass, 3);              // the hanger
    var sleeves = [];
    for (var s = -1; s <= 1; s += 2) {
      var sp = new THREE.Group(); sp.position.set(s * 0.2, -0.14, 0.1); face.add(sp);
      var sll = rnd(0.68, 0.92);
      var sm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.066, sll, 6, 1, true), cm); sm1.position.y = -sll / 2; sp.add(sm1);
      var cf = new THREE.Mesh(new THREE.CircleGeometry(0.064, 6), voidM); cf.rotation.x = Math.PI / 2; cf.position.y = -sll; sp.add(cf);
      sp.rotation.z = s * 0.12; sleeves.push(sp);
    }
    coats.push({ g: sw, sleeves: sleeves, ph: Math.random() * 6.28, len: len, a: h.a });
  }
  // a very small raincoat on the lowest knob, between its feet
  var small = new THREE.Group(); small.position.set(0, 1.22, 0.06); rock.add(small);
  var smallM = objMat({ map: tex[2], color: 0x8e7f3e, bright: 0.85, side: THREE.DoubleSide });
  var sb = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.62, 8, 1, true), smallM); sb.position.set(0, -0.36, 0.06); sb.scale.z = 0.55; small.add(sb);
  var sh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), smallM); sh.position.set(0, 0.0, 0.03); sh.rotation.x = 0.4; small.add(sh);
  // a shadow on the ground under it
  var shadow = new THREE.Mesh(new THREE.CircleGeometry(1.0, 14), objMat({ color: 0x000000, opacity: 0.5, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.035; root.add(shadow);
  return { root: root, rock: rock, armL: armL, armR: armR, hoodPiv: hoodPiv, coats: coats, small: small, eyeM: eyeM, eyeGlow: eyeGlow, cloak: cloak, shadow: shadow,
           t: Math.random() * 10, gait: 0, lastSin: 0, tilt: 0, reach: 0, shield: 0, lean: 0, drag: 0, notice: 0, wrap: 0, turnSide: Math.random() < 0.5 ? -1 : 1 };
}
// pose the coat-stand. speed: m/s it is moving; ts: time scale (0 when the dream is still)
function animPursuer(P, dt, speed, ts) {
  var d = dt * ts; P.t += d;
  var run = cl((speed - 2) / 4, 0, 1), walking = speed > 0.15 ? 1 : 0;
  // the rocking gait: it does not step, it tips from foot to foot
  P.gait += d * (1.6 + speed * 1.15) * walking;
  var sn = Math.sin(P.gait);
  var amp = walking * (0.07 + run * 0.08);
  var leanT = P.wrap > 0 ? 0.26 * P.wrap : (0.05 * walking + run * 0.22 - P.shield * 0.14);
  P.lean += (leanT - P.lean) * Math.min(1, d * 3);
  P.rock.rotation.z = sn * amp + Math.sin(P.t * 0.7) * 0.012;
  P.rock.rotation.x = P.lean + Math.abs(Math.cos(P.gait)) * 0.03 * walking;
  P.rock.position.y = Math.abs(sn) * (0.05 + run * 0.12) * walking;
  if (ts > 0 && walking && ((sn >= 0) !== (P.lastSin >= 0))) { try { stepSound(P, run); } catch (e) {} }
  P.lastSin = sn;
  // coats trail behind it and swing against the rocking
  P.drag += ((speed * 0.07) - P.drag) * Math.min(1, d * 2.5);
  for (var i = 0; i < P.coats.length; i++) {
    var c = P.coats[i];
    c.g.rotation.x = cl(P.drag, 0, 0.55) + Math.sin(P.t * 1.3 + c.ph) * 0.04 + Math.cos(P.gait + c.ph) * amp * 0.5;
    c.g.rotation.z = -P.rock.rotation.z * 1.5 + Math.sin(P.t * 1.1 + c.ph * 2) * 0.035;
    for (var s = 0; s < 2; s++) {
      var sp = c.sleeves[s], sg = s === 0 ? -1 : 1;
      sp.rotation.x = Math.sin(P.t * (2 + run * 5) + c.ph + s) * (0.06 + run * 0.4);
      sp.rotation.z = sg * (0.1 + run * 0.35 + Math.sin(P.t * 3 + c.ph) * 0.05 * run);
    }
  }
  P.small.rotation.z = -P.rock.rotation.z * 2.2 + Math.sin(P.t * 2.1) * 0.05;
  P.small.rotation.x = P.drag * 0.6;
  // arms: hanging; reaching for you; folded up against the light; or closing round you
  var sh = P.shield * (1 - P.wrap);
  for (var a = 0; a < 2; a++) {
    var A2 = a === 0 ? P.armL : P.armR, sd = A2.side, ph = a * 1.3;
    var sway = Math.sin(P.t * 1.6 + ph) * 0.05 + Math.sin(P.gait + a * Math.PI) * 0.12 * walking * (1 - sh) * (1 - Math.max(P.reach, P.wrap) * 0.6);
    var rc = P.reach * (1 - P.wrap);
    A2.piv.rotation.x = -rc * 1.15 - sh * 1.05 - P.wrap * 1.5 + sway + Math.sin(P.t * 7 + ph) * 0.05 * rc * run;
    A2.piv.rotation.z = sd * (0.05 + rc * 0.1 - sh * 0.5 + P.wrap * 0.12);
    A2.elbow.rotation.x = -0.12 - rc * 0.3 - sh * 1.55 + P.wrap * 0.75;
    A2.elbow.rotation.z = -sd * P.wrap * 0.28;
  }
  // the hood: tilts, curious, the wrong amount; turns away from the light
  P.hoodPiv.rotation.z = P.tilt + Math.sin(P.t * 0.45) * 0.04;
  P.hoodPiv.rotation.y = sh * 0.75 * (P.turnSide || 1);
  P.hoodPiv.rotation.x = 0.28 - run * 0.2 + sh * 0.35 + P.wrap * 0.45 + Math.sin(P.t * 0.8) * 0.02;
  P.cloak.scale.x = 1 + Math.sin(P.t * 0.9) * 0.02;
  // eyes
  var eb = 0.9 + P.notice * 1.4 * (0.85 + Math.random() * 0.15);
  P.eyeM.uniforms.uBright.value = eb;
  P.eyeGlow.material.opacity = P.notice * 0.55 * (1 - P.shield * 0.8);
}

/* ------------------------------------------------------------- the door ---- */
function buildDoor() {
  var g = new THREE.Group(); g.name = "n2-exit-door";
  var frameM = objMat({ color: 0x3a3440, bright: 0.85 });
  var leafM = objMat({ color: 0x2a3446, bright: 0.85, side: THREE.DoubleSide });
  var lightM = objMat({ color: 0xfff0d2, bright: 2.2, side: THREE.DoubleSide });
  var spillM = objMat({ color: 0xffd9a0, bright: 1.7, opacity: 0.32, transparent: true, depthWrite: false, decal: true });
  function box(w, h, d, x, y, z, m) { var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; }
  box(0.14, 2.6, 0.2, -0.64, 1.3, 0, frameM); box(0.14, 2.6, 0.2, 0.64, 1.3, 0, frameM); box(1.42, 0.14, 0.22, 0, 2.62, 0, frameM);
  box(1.6, 0.08, 0.6, 0, 0.04, 0.1, frameM);
  var light = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 2.5), lightM); light.position.set(0, 1.27, -0.02); g.add(light);
  var hinge = new THREE.Group(); hinge.position.set(-0.57, 0, 0.04); g.add(hinge);
  var leaf = new THREE.Mesh(new THREE.BoxGeometry(1.12, 2.48, 0.05), leafM); leaf.position.set(0.56, 1.26, 0); hinge.add(leaf);
  var knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), objMat({ color: 0xc8a868, bright: 1.2 })); knob.position.set(1.0, 1.2, 0.05); hinge.add(knob);
  hinge.rotation.y = -1.05;
  var spill = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.2), spillM); spill.rotation.x = -Math.PI / 2; spill.position.set(0, 0.05, 1.7); g.add(spill);
  // a pale shaft of light that shows through any fog, so it can be found
  var beamM = new THREE.MeshBasicMaterial({ color: 0xffd8a0, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.62, 36, 10, 1, true), beamM); beam.position.y = 18; g.add(beam);
  var glow = N2.glowSprite(0xffe2b0, 7); glow.position.y = 1.3; glow.material.opacity = 0.75; g.add(glow);
  var glow2 = N2.glowSprite(0xffcf90, 2.6); glow2.position.set(0, 1.3, 0.2); g.add(glow2);
  var motes = [];
  for (var i = 0; i < 7; i++) { var m = N2.glowSprite(0xfff0d0, 0.16); m.position.set(rnd(-0.6, 0.6), rnd(0, 2.6), rnd(0.2, 1.4)); g.add(m); motes.push({ s: m, sp: rnd(0.25, 0.6), ph: Math.random() * 6.28 }); }
  return { g: g, light: lightM, beam: beamM, glow: glow, hinge: hinge, motes: motes, t: 0 };
}
function animDoor(D, dt) {
  D.t += dt;
  var p = 0.5 + 0.5 * Math.sin(D.t * 2.2);
  D.light.uniforms.uBright.value = 1.9 + p * 0.5;
  D.beam.opacity = 0.035 + p * 0.03;
  D.glow.material.opacity = 0.55 + p * 0.25;
  D.hinge.rotation.y = -1.05 + Math.sin(D.t * 0.7) * 0.05;
  for (var i = 0; i < D.motes.length; i++) { var m = D.motes[i]; m.s.position.y += m.sp * dt; m.s.position.x += Math.sin(D.t * 1.3 + m.ph) * 0.1 * dt; if (m.s.position.y > 3.2) m.s.position.y = 0.1; m.s.material.opacity = 0.5 + 0.5 * Math.sin(D.t * 3 + m.ph); }
}

/* =============================================================================
   THE CHASE
   ============================================================================= */
var C = { state: "idle", t: 0, P: null, D: null, door: null, spawn: null, dist: 99, doorDist: 99, speed: 0, x: 0, y: 0, z: 0,
          ent: null, flickT: 0, relocT: 0, chaseT: 0, omenDur: 4.6, forced: false, endAt: 0, said: {}, stepVol: 0 };
var pendingOmenAt = -1, escapedLast = false, caughtLast = false, ending = false;
var OMEN_LINES = ["something has noticed you", "something has noticed you", "the dream goes quiet, the way a room does when someone stands in the doorway", "somewhere, coat hangers knock together"];
var APPEAR_LINES = ["it is wearing every coat you ever lost", "a hall-stand where there is no hall", "it has been holding your coat for years", "it wants to take you home"];
var RUN_LINES = ["run", "don't let it put the coat on you", "the door. find the door"];

function chasing() { return C.state !== "idle" && !(C.state === "caught" && C.said.wake); }
function active() { return C.state === "appear" || C.state === "walk" || C.state === "run"; }
function nightCount() { return sv.nights[String(day)] | 0; }
function maxPerNight() { return day < 9 ? 1 : 2; }
function eligibleWorld(z) {
  if (!z || z.bedroom || inBedroom) return false;
  if (z.sanctuary || z.noChase || z.n2story || N2.storyEnding) return false;
  var n = z.archetypeName, info = N2.worldInfo && N2.worldInfo[n];
  if (info && info.hidden) return false;
  if (/threshold|lucid_hour/.test(String(n || ""))) return false;
  return true;
}
function chanceForNight() { return 0.1 + cl((day - 3) * 0.01, 0, 0.14); }
function inView(x, z, cosLim) {
  var fx = -Math.sin(yaw), fz = -Math.cos(yaw), dx = x - pos.x, dz = z - pos.z, d = Math.hypot(dx, dz) || 1;
  return (fx * dx + fz * dz) / d > (cosLim || 0.77);
}
function reachableSpot(minD, maxD, tries, ox, oz) {
  for (var i = 0; i < (tries || 10); i++) {
    var s = N2.findSpot(minD, maxD, ox, oz, 40);
    if (s && Math.abs(s.y - pos.y) < 6) return s;
  }
  return null;
}
function findDoorSpot() { return reachableSpot(40, 80, 10) || reachableSpot(28, 42, 6); }
function findSpawnSpot(door, minD, maxD) {
  var best = null, bestScore = -1e9;
  for (var i = 0; i < 24; i++) {
    var s = N2.findSpot(minD || 30, maxD || 46, null, null, 30); if (!s || Math.abs(s.y - pos.y) > 8) continue;
    var sc = 0;
    if (door) {
      var dd = Math.hypot(s.x - door.x, s.z - door.z); sc += Math.min(dd, 50) * 0.5;
      // flank the way to the door (40-80 degrees off it), so the run to it has to pass near the thing
      var ax = s.x - pos.x, az = s.z - pos.z, bx = door.x - pos.x, bz = door.z - pos.z;
      var cs = (ax * bx + az * bz) / ((Math.hypot(ax, az) * Math.hypot(bx, bz)) || 1);
      if (cs > 0.15 && cs < 0.78) sc += 22; else if (cs > 0.78) sc -= 30;   // never straight on the path
    }
    if (!inView(s.x, s.z, 0.95)) sc += 8;           // usually not dead ahead, but often at the edge of seeing
    if (sc > bestScore) { bestScore = sc; best = s; }
  }
  return best;
}

function startOmen(forced) {
  if (C.state !== "idle" || phase !== "play" || dying || inBedroom) return false;
  var door = findDoorSpot();
  if (!door) { if (forced) console.log("[N2 nightmare] no exit door spot here — no chase"); return false; }
  C.state = "omen"; C.t = 0; C.forced = !!forced; C.door = door; C.spawn = null; C.flickT = 0.2; C.said = {}; C.chaseT = 0; C.relocT = 0; C.walkDoor = null;
  C.omenDur = forced && forced.fast ? 0.6 : 4.6;
  if (!forced || !forced.free) { sv.nights[String(day)] = nightCount() + 1; pruneNights(); persist(); }
  try { if (N2.duck) N2.duck("omen", 0.05, 1.4, 20); else if (!audio.muted) audio.fadeMaster(0.05, 1.4); } catch (e) {}
  say(OMEN_LINES[(Math.random() * OMEN_LINES.length) | 0]);
  try { hangerSound(rnd(-0.8, 0.8), 0.05); } catch (e) {}
  return true;
}
function pruneNights() { var ks = Object.keys(sv.nights); if (ks.length > 12) { ks.sort(function (a, b) { return (+a) - (+b); }); for (var i = 0; i < ks.length - 12; i++) delete sv.nights[ks[i]]; } }

function appear() {
  var sp = findSpawnSpot(C.door, 30, 46) || findSpawnSpot(C.door, 20, 34);
  if (!sp) { abortChase("nowhere for it to stand"); return; }
  C.P = buildPursuer(); C.x = sp.x; C.y = sp.y; C.z = sp.z;
  C.P.root.position.set(C.x, C.y, C.z); C.P.root.rotation.y = Math.atan2(pos.x - C.x, pos.z - C.z);
  C.P.root.scale.setScalar(rnd(0.96, 1.08));
  N2.addToDream(C.P.root);
  C.D = buildDoor(); C.D.g.position.set(C.door.x, C.door.y, C.door.z); C.D.g.rotation.y = Math.atan2(pos.x - C.door.x, pos.z - C.door.z);
  N2.addToDream(C.D.g);
  // a stand-in in entities so the dream's music and the lucid module feel it
  C.ent = { obj: C.P.root, kind: "pursuer_coats", cfg: { disp: "evil", speed: 0, kind: "pursuer" }, st: { move: 0 }, parts: {}, _n2nm: 1, update: function () {} };
  try { entities.push(C.ent); } catch (e) {}
  C.state = "appear"; C.t = 0;
  restoreVol(2.4);
  audioStart();
  try { N2.emit("chaseStart"); } catch (e) {}
  if (!sv.seen) { sv.seen = true; persist(); try { N2.ui.toast("something has noticed you", "find the glowing door · light keeps it back", 4200); } catch (e) {} }
  setTimeout(function () { if (C.state === "appear" || C.state === "walk") say(pickOne(APPEAR_LINES)); }, 1600);
}

function abortChase(why) {
  // nothing visible started yet (or it must vanish quietly)
  var wasActive = active();
  cleanupChase();
  restoreVol(1.6);
  if (wasActive) try { N2.emit("chaseEnd", true); } catch (e) {}
  if (why) console.log("[N2 nightmare] chase aborted:", why);
}
// the omen hushes the dream; give the hush back (through the shared duck registry when there is one)
function restoreVol(secs) {
  try {
    if (N2.unduck) { if (!N2.unduck("omen", secs) && !audio.muted && !paused && !(N2.ducked && N2.ducked() != null)) audio.fadeMaster(0.28, secs); }
    else if (!audio.muted) audio.fadeMaster(0.28, secs);
  } catch (e) {}
}
function cleanupChase() {
  try { if (N2.unduck) N2.unduck("omen", 1.2, true); } catch (e) {}
  audioStop();
  if (C.ent) { var i = entities.indexOf(C.ent); if (i >= 0) entities.splice(i, 1); }
  // meshes belong to the dream group and go with it; if we end mid-dream, remove them
  if (C.P && C.P.root.parent && C.state !== "caught") { C.P.root.parent.remove(C.P.root); try { disposeGroup(C.P.root); } catch (e) {} }
  if (C.D && C.D.g.parent) { C.D.g.parent.remove(C.D.g); try { disposeGroup(C.D.g); } catch (e) {} }
  C.state = "idle"; C.P = null; C.D = null; C.ent = null; C.door = null; C.dist = 99; C.doorDist = 99; C.speed = 0; fogDip = 0;
}

function endChase(escaped, how) {
  if (C.state === "idle") return;
  var was = C.state;
  if (escaped) { sv.escapes++; escapedLast = true; } else { sv.caught++; caughtLast = true; }
  persist();
  audioStop();
  if (C.ent) { var i = entities.indexOf(C.ent); if (i >= 0) entities.splice(i, 1); C.ent = null; }
  C.state = "idle"; C.dist = 99; fogDip = 0;
  if (was !== "omen") try { N2.emit("chaseEnd", !!escaped); } catch (e) {}
  else restoreVol(1.2);
  if (how === "lost") {
    // it forgets you: let it sink away and the door close
    var P = C.P, D = C.D; C.P = null; C.D = null; C.door = null;
    sinking.push({ P: P, D: D, t: 0 });
    say(pickOne(["it has lost you. for now", "it stands still, listening, and then it isn't there", "it forgets what it was looking for"]));
  } else { C.P = null; C.D = null; C.door = null; }
}
var sinking = [];
function tickSinking(dt) {
  for (var i = sinking.length - 1; i >= 0; i--) {
    var s = sinking[i]; s.t += dt;
    try {
      if (s.P && s.P.root.parent) { s.P.root.position.y -= dt * (0.4 + s.t * 1.2); animPursuer(s.P, dt, 0, 0.3); }
      if (s.D && s.D.g.parent) { s.D.g.scale.y = Math.max(0.01, 1 - s.t / 2.5); animDoor(s.D, dt); }
    } catch (e) {}
    if (s.t > 3) {
      if (s.P && s.P.root.parent) { s.P.root.parent.remove(s.P.root); try { disposeGroup(s.P.root); } catch (e) {} }
      if (s.D && s.D.g.parent) { s.D.g.parent.remove(s.D.g); try { disposeGroup(s.D.g); } catch (e) {} }
      sinking.splice(i, 1);
    }
  }
}

function calmTarget() {
  var pool = [];
  try {
    for (var i = 0; i < POSITIVE_RECIPES.length; i++) { var n = POSITIVE_RECIPES[i]; if (RECIPES[n] && !(N2.worldInfo[n] && N2.worldInfo[n].hidden)) pool.push(n); }
  } catch (e) {}
  return pool.length ? pickOne(pool) : null;
}
function escape() {
  if (!active()) return;
  C.state = "escaping"; ending = true;
  try { glitch = Math.max(glitch, 0.35); } catch (e) {}
  try { if (audio.ctx) { audio.bell(784, 0); audio.bell(1175, 0.2); } } catch (e) {}
  var tgt = calmTarget();
  try { doWarp({ b: 0.55, e: -0.25 }, "escape", tgt); } catch (e) {}
  ending = false;
  if (phase !== "transition") { endChase(true, "lost"); return; } // warp refused: it just goes away
  // the 'warp' handler ends the chase
}
function caught() {
  if (!active()) return;
  C.state = "caught"; C.t = 0; C.hold = { x: pos.x, z: pos.z };
  setLantern(false, true);
  try { if (audio.ctx) { audio.gong(41, 0); audio.noise(0.9, "lowpass", 1800, 120, 0.12, 0); hangerSound(0, 0.12); } } catch (e) {}
}
var _hv = new THREE.Vector3();
function tickCaught(dt) {
  C.t += dt;
  var P = C.P; if (!P) return;
  // it bends down over you; you look up into the hood
  var ax = pos.x, az = pos.z, ry = Math.atan2(C.x - ax, C.z - az);
  var tx = ax + Math.sin(ry) * 2.35, tz = az + Math.cos(ry) * 2.35;
  C.x += (tx - C.x) * Math.min(1, dt * 5); C.z += (tz - C.z) * Math.min(1, dt * 5);
  P.root.position.set(C.x, C.y, C.z); P.root.rotation.y = Math.atan2(pos.x - C.x, pos.z - C.z);
  P.wrap += (1 - P.wrap) * Math.min(1, dt * 2.2); P.reach = Math.max(0, P.reach - dt * 2); P.shield = Math.max(0, P.shield - dt * 3); P.notice = 1;
  P.tilt += (0.38 - P.tilt) * Math.min(1, dt * 2);
  animPursuer(P, dt, 0.5, 1);
  try {
    P.root.updateMatrixWorld(true); P.hoodPiv.getWorldPosition(_hv);
    var ey = pos.y + (eyeH || 1.6), hg = Math.hypot(_hv.x - pos.x, _hv.z - pos.z);
    var wantYaw = Math.atan2(-(_hv.x - pos.x), -(_hv.z - pos.z)), wantPitch = cl(Math.atan2(_hv.y + 0.15 - ey, Math.max(0.2, hg)), -1.2, 0.95);
    var dyaw = wantYaw - yaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    yaw += dyaw * Math.min(1, dt * 4); pitch += (wantPitch - pitch) * Math.min(1, dt * 2.6);
    camera.rotation.set(pitch, yaw, camera.rotation.z, "YXZ");
  } catch (e) {}
  try { glitch = Math.max(glitch, 0.12 + C.t * 0.5); shake = Math.max(shake, 0.18 + C.t * 0.2); } catch (e) {}
  if (C.t > 0.85 && !C.said.wake) {
    C.said.wake = true;
    say(pickOne(["it wraps you in a coat that smells of home. you wake", "it puts the heavy coat around your shoulders. you wake", "it was only trying to dress you for the cold. you wake"]));
    try { pendingEndDay = true; } catch (e) {}
    try { die(); } catch (e) { try { doWarp({ b: -0.8, e: -0.4 }, "death"); } catch (er) {} }
    try { glitch = 1; shake = 1; } catch (e) {}
    // the chase is over (and reported), but the coat-stand stays bent over you until the dream lets go
    sv.caught++; caughtLast = true; persist(); audioStop();
    if (C.ent) { var i = entities.indexOf(C.ent); if (i >= 0) entities.splice(i, 1); C.ent = null; }
    try { N2.emit("chaseEnd", false); } catch (e) {}
  }
  if (C.t > 6 && phase === "play") { try { doWarp({ b: -0.8, e: -0.4 }, "death"); } catch (e) {} }
}

var ST_WALK = 2.4, RUN_RAMP = 3, MAX_CHASE = 150;
function tickChase(dt) {
  if (C.state === "idle") { if (sinking.length) tickSinking(dt); return; }
  if (sinking.length) tickSinking(dt);
  if (C.state === "escaping") return;
  if (phase !== "play") return;
  if (C.state === "omen") {
    C.t += dt;
    // the lights stutter: the fog lurches in, for a breath, again and again
    C.flickT -= dt;
    if (C.flickT <= 0) { fogDip = Math.random() < 0.6 ? rnd(0.6, 1) : 0; C.flickT = fogDip ? rnd(0.05, 0.16) : rnd(0.22, 0.7); if (fogDip && Math.random() < 0.4) try { glitch = Math.max(glitch, 0.12); } catch (e) {} }
    if (C.t > C.omenDur * 0.55 && !C.said.h2) { C.said.h2 = true; try { hangerSound(rnd(-0.9, 0.9), 0.06); } catch (e) {} }
    if (C.t >= C.omenDur) { fogDip = 0; appear(); }
    return;
  }
  if (C.state === "caught") { if (C.hold) { pos.x = C.hold.x; pos.z = C.hold.z; } tickCaught(dt); return; }
  var P = C.P; if (!P) { abortChase("lost its body"); return; }
  C.t += dt; C.chaseT += dt;
  var frozen = !!freezeBeings || (N2.mods.lucid && N2.mods.lucid.isStill && safeCall(N2.mods.lucid.isStill));
  var ts = frozen ? 0 : 1;
  var dx = pos.x - C.x, dz = pos.z - C.z, d = Math.hypot(dx, dz) || 0.001;
  C.dist = d;
  if (C.door) C.doorDist = Math.hypot(pos.x - C.door.x, pos.z - C.door.z);
  // reach the door → out
  if (C.door && C.doorDist < 1.7 && Math.abs(pos.y - C.door.y) < 3) { escape(); return; }
  // speed
  var base = 0;
  if (C.state === "appear") {
    P.notice = Math.min(1, P.notice + dt * 0.8 * ts);
    P.tilt += ((C.t > 1 ? 0.42 : 0) - P.tilt) * Math.min(1, dt * 1.5 * ts);
    if (C.t > 2.8) { C.state = "walk"; C.t = 0; }
  } else if (C.state === "walk") {
    base = 2.3; P.tilt += (0.18 - P.tilt) * Math.min(1, dt * ts);
    // it breaks into a run after a moment — or at once, if it sees you fleeing for the door
    if (C.walkDoor == null) C.walkDoor = C.doorDist;
    var fleeing = C.walkDoor - C.doorDist > 4 && d > 20;
    if (C.t > ST_WALK || (fleeing && C.t > 0.6)) { C.state = "run"; C.t = 0; C.walkDoor = null; if (Math.random() < 0.7) say(pickOne(RUN_LINES)); }
  } else if (C.state === "run") {
    // nearly a sprint: running for the door keeps you ahead of it, walking or looking back does not
    var runV = cl((moveSpeed || 5) * 1.7, 4.4, 8.6);
    base = 1.9 + (runV - 1.9) * sm(C.t / RUN_RAMP);
    P.tilt += (0.05 - P.tilt) * Math.min(1, dt * 2 * ts);
  }
  var seen = inView(C.x, C.z, 0.8);
  var mul = seen ? 0.86 : 1.12;                                  // it is faster when you are not looking
  var light = (litK > 0.25 && d < 18) ? litK * (1 - d / 18 * 0.5) : 0;
  P.shield += ((light > 0.2 ? 1 : 0) - P.shield) * Math.min(1, dt * 3 * ts);
  if (light > 0.2 && !C.said.light) { C.said.light = true; say("it does not like the light"); sv.lightHint = true; }
  mul *= 1 - 0.58 * light;
  var speed = base * mul * ts;
  if (frozen) C.speed = 0;
  if (d < 2.2) speed *= 0.6 + d / 5.5;
  C.speed += (speed - C.speed) * Math.min(1, dt * 3);
  P.reach += (((C.state === "run" && d < 14) ? 1 : (C.state === "walk" && d < 8) ? 0.6 : 0) - P.reach) * Math.min(1, dt * 2 * ts);
  // move: straight at you, sidestepping solids; it will slide through walls if it must
  if (C.speed > 0.001) {
    var ux = dx / d, uz = dz / d, step = C.speed * dt, moved = false;
    var tries = [0, 0.55, -0.55, 1.1, -1.1];
    for (var i = 0; i < tries.length; i++) {
      var ca = Math.cos(tries[i]), sa = Math.sin(tries[i]);
      var vx = ux * ca - uz * sa, vz = ux * sa + uz * ca, nx = C.x + vx * step, nz = C.z + vz * step;
      if (!N2.insideSolid(nx, nz, C.y)) { C.x = nx; C.z = nz; moved = true; break; }
    }
    if (!moved) { C.x += ux * step * 0.4; C.z += uz * step * 0.4; }
    var gy = N2.groundAt(C.x, C.z);
    var ty = gy != null ? gy : (Math.abs(C.y - pos.y) > 0.5 ? C.y + (pos.y - C.y) * 0.5 : C.y);
    C.y += (ty - C.y) * Math.min(1, dt * 6);
  }
  // face you, a little late
  var want = Math.atan2(pos.x - C.x, pos.z - C.z), cur = P.root.rotation.y, df = want - cur;
  while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
  P.root.rotation.y = cur + df * Math.min(1, dt * 2.5 * (ts || 0));
  P.root.position.set(C.x, C.y, C.z);
  if (ts) animPursuer(P, dt, C.speed, ts);
  if (C.D) animDoor(C.D, dt);
  // it gets bored of distance: when far and unseen, it is suddenly closer
  C.relocT -= dt;
  if ((C.state === "run" || C.state === "walk") && d > 26 && !seen && C.relocT <= 0 && !frozen && C.chaseT > 4) {
    C.relocT = 7;
    var fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    var s2 = null;
    for (var k = 0; k < 10 && !s2; k++) {
      var back = rnd(18, 26), cand = N2.findSpot(0, 4, pos.x - fx * back, pos.z - fz * back, 12);
      if (cand && Math.abs(cand.y - pos.y) < 6 && !inView(cand.x, cand.z, 0.5) && Math.hypot(cand.x - pos.x, cand.z - pos.z) > 14 &&
          (!C.door || Math.hypot(cand.x - C.door.x, cand.z - C.door.z) > 10)) s2 = cand;
    }
    if (s2) {
      C.x = s2.x; C.y = s2.y; C.z = s2.z; try { hangerSound(0, 0.08); } catch (e) {}
      if (C.state === "walk") { C.state = "run"; C.t = 0; C.walkDoor = null; }
      if (!C.said.behind) { C.said.behind = true; say(pickOne(["it is behind you now", "closer. you did not see it move", "the coats rustle, just behind"])); }
    }
  }
  // caught?
  if (d < 1.35 && Math.abs(pos.y - C.y) < 2.8 && !frozen && !dying && C.chaseT > 2) { caught(); return; }
  // or it loses you (flying high, or simply too long)
  if (C.chaseT > MAX_CHASE || (Math.abs(pos.y - C.y) > 16 && C.chaseT > 40)) { endChase(true, "lost"); return; }
  if (frozen && !C.said.frozen) { C.said.frozen = true; say("it stops mid-step, one foot lifted"); }
  if (!frozen) C.said.frozen = false;
  audioTick(dt, d, seen);
  // the dream greys while it hunts you
  try { if (postMat) postMat.uniforms.uDesat.value = Math.max(postMat.uniforms.uDesat.value, 0.22 + 0.25 * cl(1 - d / 30, 0, 1)); } catch (e) {}
}

/* -------------------------------------------------------- chase audio ---- */
var A = null, hbT = 0;
function audioStart() {
  if (A || !audio.ctx || !audio.master) return;
  try {
    var c = audio.ctx, t = c.currentTime;
    A = { nodes: [] };
    A.out = c.createGain(); A.out.gain.value = 0.0001; A.out.connect(audio.master);
    A.lp = c.createBiquadFilter(); A.lp.type = "lowpass"; A.lp.frequency.value = 150; A.lp.Q.value = 4; A.lp.connect(A.out);
    A.pg = c.createGain(); A.pg.gain.value = 0.55; A.pg.connect(A.lp);
    A.o1 = c.createOscillator(); A.o1.type = "sawtooth"; A.o1.frequency.value = 41.2; A.o1.connect(A.pg);
    A.o2 = c.createOscillator(); A.o2.type = "sine"; A.o2.frequency.value = 61.9; A.o2.connect(A.pg);
    A.lfo = c.createOscillator(); A.lfo.type = "sine"; A.lfo.frequency.value = 0.9;
    A.lg = c.createGain(); A.lg.gain.value = 0.45; A.lfo.connect(A.lg); A.lg.connect(A.pg.gain);
    // the door's hum: a warm open fifth, louder as you near it
    A.dg = c.createGain(); A.dg.gain.value = 0.0001; A.dg.connect(audio.master);
    A.o3 = c.createOscillator(); A.o3.type = "sine"; A.o3.frequency.value = 220; A.o3.connect(A.dg);
    A.o4 = c.createOscillator(); A.o4.type = "sine"; A.o4.frequency.value = 330.6; A.o4.connect(A.dg);
    [A.o1, A.o2, A.lfo, A.o3, A.o4].forEach(function (o) { o.start(t); });
    hbT = 0.3;
  } catch (e) { A = null; }
}
function audioStop() {
  if (!A) return;
  var a = A; A = null;
  try {
    var c = audio.ctx, t = c.currentTime;
    a.out.gain.cancelScheduledValues(t); a.out.gain.setTargetAtTime(0.0001, t, 0.35);
    a.dg.gain.cancelScheduledValues(t); a.dg.gain.setTargetAtTime(0.0001, t, 0.25);
    [a.o1, a.o2, a.lfo, a.o3, a.o4].forEach(function (o) { try { o.stop(t + 1.6); } catch (e) {} });
    setTimeout(function () { try { [a.o1, a.o2, a.lfo, a.o3, a.o4, a.out, a.lp, a.pg, a.lg, a.dg].forEach(function (n) { n.disconnect(); }); } catch (e) {} }, 1900);
  } catch (e) {}
}
function thump(f, peak, delay) {
  var c = audio.ctx; if (!c || !audio.master) return;
  var t0 = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(f * 1.7, t0); o.frequency.exponentialRampToValueAtTime(f, t0 + 0.06);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
  o.connect(g); g.connect(audio.master); o.start(t0); o.stop(t0 + 0.3);
  o.onended = function () { try { o.disconnect(); g.disconnect(); } catch (e) {} };
}
function panFor(x, z) { var dx = x - pos.x, dz = z - pos.z, d = Math.hypot(dx, dz) || 1; return cl((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d, -1, 1) * 0.85; }
function hangerSound(pan, vol) {
  if (!audio.ctx) return;
  for (var i = 0; i < 3; i++) audio.tone(rnd(2400, 4100), "sine", vol * rnd(0.3, 0.6), 0.001, rnd(0.18, 0.4), pan);
  audio.noise(0.05, "highpass", 5000, 6000, vol * 0.4, pan);
}
function stepSound(P, run) {
  if (!audio.ctx || P !== C.P) return;
  var d = C.dist, vol = 0.12 / (1 + d / 7), pan = panFor(C.x, C.z);
  if (vol < 0.006) return;
  audio.tone(150 + Math.random() * 30, "triangle", vol, 0.002, 0.1, pan);
  audio.noise(0.05, "bandpass", 1300, 700, vol * 0.5, pan);
  if (Math.random() < 0.35 + run * 0.3) hangerSound(pan, vol * 0.5);
  if (run > 0.4 && Math.random() < 0.5) audio.noise(0.22, "highpass", 2600, 3800, vol * 0.35, pan); // fabric
}
function audioTick(dt, d, seen) {
  if (!A || !audio.ctx) return;
  try {
    var c = audio.ctx, t = c.currentTime;
    var prox = cl(1 - d / 45, 0, 1), near = cl(1 - d / 14, 0, 1);
    A.out.gain.setTargetAtTime(0.02 + prox * 0.1 + near * 0.06, t, 0.3);
    A.lfo.frequency.setTargetAtTime(0.8 + prox * 2.4, t, 0.4);
    A.lp.frequency.setTargetAtTime(120 + prox * 260, t, 0.4);
    var dd = C.doorDist, dn = cl(1 - dd / 30, 0, 1);
    A.dg.gain.setTargetAtTime(0.0001 + dn * dn * 0.05, t, 0.3);
    hbT -= dt;
    if (hbT <= 0) {
      hbT = 1.05 - prox * 0.62 - near * 0.12;
      var pk = 0.07 + prox * 0.12;
      thump(52, pk, 0); thump(46, pk * 0.7, 0.17);
    }
  } catch (e) {}
}

/* =============================================================================
   HOOKS
   ============================================================================= */
N2.on("start", function () { try { buildHud(); buildLantern(); } catch (e) { console.error("[N2 nightmare] start", e); } });

N2.on("keydown", function (e) {
  try {
    if (e.code !== "KeyF" || e.repeat) return false;
    if (!N2.canAct()) return false;
    setLantern(!lit);
    return true;
  } catch (er) { return false; }
});

N2.on("frame", function (dt) {
  try { tickLanternVisual(dt); } catch (e) {}
  try { tickFog(dt); } catch (e) {}
  try { tickHud(dt); } catch (e) {}
});

N2.on("play", function (dt) {
  try { tickOil(dt); } catch (e) {}
  try {
    wrapScan -= dt; if (wrapScan <= 0) { wrapScan = 1; wrapHorrors(); }
  } catch (e) {}
  try {
    if (pendingOmenAt > 0 && C.state === "idle" && phase === "play" && !dying && timeInDream >= pendingOmenAt) {
      pendingOmenAt = -1;
      if (nightCount() < maxPerNight()) startOmen(false);
    }
    tickChase(dt);
  } catch (e) { console.error("[N2 nightmare] chase tick", e); try { abortChase("error"); } catch (er) {} }
});

N2.on("dreamBuilt", function (z, firstOfDay) {
  try {
    // anything left of an old chase went with the old dream's group
    if (C.state !== "idle") {
      // rebuilt without a warp (debug, a story set-piece): close the chase so every listener hears it end
      var was = C.state;
      audioStop(); C.state = "idle"; C.P = null; C.D = null; C.ent = null; C.door = null;
      restoreVol(1.2);
      if (was === "appear" || was === "walk" || was === "run" || was === "escaping") try { N2.emit("chaseEnd", true); } catch (e) {}
      else if (was === "caught" && !C.said.wake) try { N2.emit("chaseEnd", false); } catch (e) {}
    }
    sinking = []; fogDip = 0; _hesitated = false; wrapScan = 0.5;
    fogWritten.set(-1, -1);
    pendingOmenAt = -1;
    if (escapedLast) { escapedLast = false; setTimeout(function () { say(pickOne(["you close the door behind you", "the door shuts. somewhere behind it, hangers settle", "you are somewhere kinder now"])); }, 1400); }
    caughtLast = false;
    if (z && z.bedroom) { if (sv.oil < 1) hudShowT = 4; return; }
    if (!sv.hinted && eligibleWorld(z)) {
      sv.hinted = true; persist();
      setTimeout(function () { if (N2.isDreaming() && C.state === "idle" && !lit) try { N2.ui.toast("you are carrying a paper lantern", (N2.mods.input && N2.mods.input.isTouch && N2.mods.input.isTouch()) ? "tap lantern to light it against the dark" : "f — light it against the dark", 4200); } catch (e) {} }, 6500);
    }
    if (!eligibleWorld(z)) return;
    if (!(day >= 3 || nightStage >= 1)) return;
    if (nightCount() >= maxPerNight()) return;
    if (Math.random() < chanceForNight()) pendingOmenAt = rnd(9, 24);
  } catch (e) {}
});

// while it hunts you, the dream does not let you slip away through its walls and edges
var BLOCK = { wall: 1, edge: 1, drift: 1, bright: 1, dark: 1 };
N2.on("beforeWarp", function (nudge, kind) {
  try {
    if (ending || !(active() || C.state === "omen")) return false;
    if (BLOCK[kind]) {
      if (kind === "edge" && boundaryR > 0) { var h = Math.hypot(pos.x, pos.z) || 1; pos.x *= (boundaryR - 0.3) / h; pos.z *= (boundaryR - 0.3) / h; }
      return true;
    }
    if (kind === "fall") { pos.set(dreamSpawn.x, dreamSpawn.y, dreamSpawn.z); vy = 0; grounded = true; say("the floor catches you. it is still coming"); return true; }
  } catch (e) {}
  return false;
}, 60);

N2.on("warp", function (nudge, kind) {
  try {
    if (C.state === "idle") return;
    if (C.state === "omen") { cleanupChase(); restoreVol(1.2); return; }
    if (C.state === "caught") { if (!C.said.wake) { sv.caught++; persist(); try { N2.emit("chaseEnd", false); } catch (e) {} } audioStop(); C.state = "idle"; C.P = null; C.D = null; C.door = null; C.ent = null; return; }
    if (kind === "death") { endChase(false, "caught"); return; }
    endChase(true, "door");     // the glowing door, or any door the dream offered
  } catch (e) {}
});

N2.on("shard", function () {
  try { sv.oil = Math.min(1, sv.oil + 0.25); hudShowT = 4; persist(); } catch (e) {}
});
// a whole night's sleep fills the lantern a good way (the waking room trickles in the rest)
N2.on("nightEnd", function () { try { if (C.state !== "idle") cleanupChase(); sv.oil = Math.min(1, sv.oil + 0.3); persist(); } catch (e) {} });

/* ------------------------------------------------------------------- API ---- */
NM.lanternOn = function () { return lit && sv.oil > 0; };
NM.oil = function () { return sv.oil; };
NM.setOil = function (v) { sv.oil = cl(+v || 0, 0, 1); hudShowT = 3; persist(); return sv.oil; };
NM.toggleLantern = function (on) { return setLantern(on == null ? !lit : !!on, true); };
NM.chasing = function () { return chasing(); };
// forceChase({fast:true}) skips most of the omen; ({free:true}) does not count toward the night's limit
NM.forceChase = function (opts) {
  try {
    if (C.state !== "idle") return true;
    if (phase !== "play" || inBedroom) return false;
    if (!eligibleWorld(N2.lastZone)) return false;
    return startOmen(opts || { free: true });
  } catch (e) { console.error("[N2 nightmare] forceChase", e); return false; }
};
NM.endChase = function (escaped) { try { if (C.state === "idle") return false; if (C.state === "omen") { cleanupChase(); return true; } endChase(!!escaped, "lost"); return true; } catch (e) { return false; } };
NM.state = function () {
  return { state: C.state, t: C.t, dist: C.dist, doorDist: C.doorDist, speed: C.speed, door: C.door ? { x: C.door.x, y: C.door.y, z: C.door.z } : null,
           pursuer: C.P ? { x: C.x, y: C.y, z: C.z } : null, oil: sv.oil, lit: lit, litK: litK, pendingAt: pendingOmenAt,
           night: day, tonight: nightCount(), escapes: sv.escapes, caught: sv.caught,
           fog: (typeof U_fogDist !== "undefined" && U_fogDist) ? [U_fogDist.value.x, U_fogDist.value.y] : null, fogBase: [fogBase.x, fogBase.y] };
};
NM.stats = function () { return { escapes: sv.escapes, caught: sv.caught }; };
