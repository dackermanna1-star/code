// Derives src/base.html from src/original-nemuri.html by inserting the N2 hook bus,
// a debug bridge and the module-injection marker. Every patch must match exactly once.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let s = fs.readFileSync(path.join(root, 'src/original-nemuri.html'), 'utf8');
function patch(find, repl) {
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('patch target found ' + n + ' times: ' + find.slice(0, 80));
  s = s.replace(find, () => repl);
}
// 1. hook bus right after the utilities header
patch('/* ---------------------------------------------------------------- utilities */',
`/* ---------------------------------------------------------------- N2 hook bus (nemuri II) */
var N2 = {
  hooks: {}, mods: {},
  on: function (name, fn, prio) { (this.hooks[name] = this.hooks[name] || []).push({ fn: fn, prio: prio || 0 }); this.hooks[name].sort(function (a, b) { return b.prio - a.prio; }); },
  emit: function (name, a, b, c, d) { var L = this.hooks[name]; if (!L) return false; var consumed = false; for (var i = 0; i < L.length; i++) { try { if (L[i].fn(a, b, c, d) === true) { consumed = true; } } catch (err) { if (window.console) console.error("[N2 hook " + name + "]", err); } if (consumed) break; } return consumed; },
  uiOpen: 0   // >0 while a full-screen sequel UI (journal, settings...) owns input
};
/* ---------------------------------------------------------------- utilities */`);
// 2. animate(): frame + play hooks
patch(`    if (!inBedroom) { maybeSpontaneous(dt); maybeEmergentEvent(dt); tickSpawnCue(); tickSurvival(dt); }
    else updateBedroomFocus();
    tickWeather(dt);
  }`,
`    if (!inBedroom) { maybeSpontaneous(dt); maybeEmergentEvent(dt); tickSpawnCue(); tickSurvival(dt); }
    else updateBedroomFocus();
    tickWeather(dt);
    N2.emit("play", dt);
  }
  N2.emit("frame", dt);`);
// game logic should not advance while a sequel UI is open
patch(`  if ((phase === "play" || phase === "transition") && !paused) {
    updatePlayer(dt);`,
`  if ((phase === "play" || phase === "transition") && !paused && !N2.uiOpen) {
    updatePlayer(dt);`);
// 3. render(): before/after
patch(`function render() {
  renderer.setRenderTarget(rt);`,
`function render() {
  N2.emit("beforeRender");
  renderer.setRenderTarget(rt);`);
patch(`  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
}`,
`  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
  N2.emit("afterRender");
}`);
// 4. dream built
patch(`  if (firstOfDay) { if (nightStage >= 1 ? Math.random() < 0.7 : Math.random() < 0.25) beingSpeak(nightFragment()); }
  else if (nightStage >= 2 && Math.random() < 0.07) beingSpeak(nightFragment());
}`,
`  if (firstOfDay) { if (nightStage >= 1 ? Math.random() < 0.7 : Math.random() < 0.25) beingSpeak(nightFragment()); }
  else if (nightStage >= 2 && Math.random() < 0.07) beingSpeak(nightFragment());
  N2.lastZone = z;
  N2.emit("dreamBuilt", z, firstOfDay);
}`);
// 5. warp
patch(`  audio.warp(); glitch = Math.max(glitch, 0.6);
  phase = "transition"; transitionStage = "out"; fadeTarget = 1; transClock = 0;
}`,
`  audio.warp(); glitch = Math.max(glitch, 0.6);
  phase = "transition"; transitionStage = "out"; fadeTarget = 1; transClock = 0;
  N2.emit("warp", pendingNudge, kind, pendingTarget);
}`);
// allow modules to veto a warp (e.g. lucid hold) -- before phase change
patch(`function doWarp(nudge, kind, target) {
  if (phase !== "play") return;`,
`function doWarp(nudge, kind, target) {
  if (phase !== "play") return;
  if (N2.emit("beforeWarp", nudge, kind, target)) return;`);
// 6. commit + night end
patch(`function commitTransition() {
  dayMood.b += pendingNudge.b;`,
`function commitTransition() {
  N2.emit("commitTransition", pendingNudge, pendingTarget);
  dayMood.b += pendingNudge.b;`);
patch(`  day++; saveNight(); applyNightProgression(); dayMood = { b: 0, e: 0 }; warpsToday = 0;
  audio.fadeMaster(0.12, 1.0);
}`,
`  day++; saveNight(); applyNightProgression(); dayMood = { b: 0, e: 0 }; warpsToday = 0;
  audio.fadeMaster(0.12, 1.0);
  N2.emit("nightEnd", day - 1, graphHistory[graphHistory.length - 1]);
}`);
// 7. input
patch(`function onKeyDown(e) {
  keys[e.code] = true;`,
`function onKeyDown(e) {
  if (N2.emit("keydown", e)) { e.preventDefault(); return; }
  if (N2.uiOpen) return;
  keys[e.code] = true;`);
patch(`function onMouseDown(e) {
  audio.resume();`,
`function onMouseDown(e) {
  audio.resume();
  if (N2.emit("mousedown", e)) return;
  if (N2.uiOpen) return;`);
patch(`function onMouseMove(e) {
  if (phase !== "play" && phase !== "transition") return;`,
`function onMouseMove(e) {
  if (N2.uiOpen) return;
  if (phase !== "play" && phase !== "transition") return;`);
// 8. examine + bedroom interact
patch(`  if (best) { try { best.examine(best); } catch (er) {} if (pullMode && best.valence) doValenceWarp(best.valence); }`,
`  if (N2.emit("examine", best)) return;
  if (best) { try { best.examine(best); } catch (er) {} if (pullMode && best.valence) doValenceWarp(best.valence); }`);
patch(`  if (!best) return;
  if (best.kind === "bed") {`,
`  if (!best) return;
  if (N2.emit("bedroomInteract", best)) return;
  if (best.kind === "bed") {`);
// 9. start
patch(`  buildNextDream(true, "__bedroom");
  fade = 1; fadeTarget = 0; transitionStage = "in"; transClock = 0; phase = "transition";
  tryLock();
}`,
`  buildNextDream(true, "__bedroom");
  fade = 1; fadeTarget = 0; transitionStage = "in"; transClock = 0; phase = "transition";
  tryLock();
  N2.emit("start");
}`);
// 10. module marker + debug bridge before init()
patch(`
init();

})();`,
`
/*@@NEMURI2_MODULES@@*/

/* debug bridge: only with ?debug in the URL (used by the automated smoke tests) */
if (/[?&]debug\\b/.test(location.search)) {
  window.__N2 = {
    N2: N2, THREE: THREE,
    get phase() { return phase; }, set phase(v) { phase = v; },
    get pos() { return pos; }, get keys() { return keys; },
    get yaw() { return yaw; }, set yaw(v) { yaw = v; },
    get day() { return day; }, set day(v) { day = v; },
    get inBedroom() { return inBedroom; }, get pullMode() { return pullMode; },
    get zone() { return N2.lastZone; }, get RECIPES() { return RECIPES; },
    get SCENE_NAMES() { return SCENE_NAMES; }, get ALL_NAMES() { return ALL_NAMES; },
    get entities() { return entities; }, get interactables() { return interactables; },
    get renderer() { return renderer; }, get scene() { return scene; }, get camera() { return camera; },
    start: function () { start(); },
    build: function (name, first) { buildNextDream(!!first, name); phase = "play"; fade = 0; graceTimer = 99; },
    warp: function (target) { doWarp({ b: 0, e: 0 }, "debug", target || null); },
    key: function (code) { onKeyDown({ code: code, preventDefault: function () {} }); onKeyUp({ code: code }); }
  };
}

init();

})();`);
// sequel identity in the build stamp (modules handle the rest of the revamp)
patch('<div class="build">nemuri // build 1.19.0</div>', '<div class="build">nemuri II // build 2.0.0</div>');
fs.writeFileSync(path.join(root, 'src/base.html'), s);
console.log('base.html written', s.length);
