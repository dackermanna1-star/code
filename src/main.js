// Boot, fixed-timestep loop, canvas scaling and scene management.
(function () {
  'use strict';
  const JJK = window.JJK;
  const W = JJK.W, H = JJK.H;
  JJK.loadSettings();
  const S = JJK.settings;

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;
  const crt = document.getElementById('crt');

  function resize() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    // prefer integer scaling when it fills most of the window
    const si = Math.floor(s);
    const scale = si >= 1 && si / s > 0.9 ? si : s;
    canvas.style.width = Math.round(W * scale) + 'px';
    canvas.style.height = Math.round(H * scale) + 'px';
    if (crt) { crt.style.width = canvas.style.width; crt.style.height = canvas.style.height; }
  }
  window.addEventListener('resize', resize);
  resize();

  const game = (JJK.game = {
    ctrls: [new JJK.Controller(JJK.KB_LAYOUTS[0], S.p1Pad), new JJK.Controller(JJK.KB_LAYOUTS[1], S.p2Pad)],
    scene: null,
    showFps: false,
    set(s) {
      this.scene = s;
      JJK.FX.clear();
      // sync menu edge detection so held keys don't leak into the next scene
      if (JJK.UI) JJK.UI.input.poll();
    },
    startBattle(o) {
      this.set(new JJK.UI.BattleScene(this, o));
    },
    applyCrt() {
      if (crt) crt.style.display = S.crt ? 'block' : 'none';
    },
  });
  game.applyCrt();
  if (JJK.Audio && JJK.Audio.setVolumes) JJK.Audio.setVolumes(S.musicVol, S.sfxVol);

  // URL shortcuts for quick testing: ?play=versus|arcade|training|watch&p1=gojo&p2=sukuna&level=hard
  const q = new URLSearchParams(location.search);
  if (q.get('play')) {
    const mode = q.get('play');
    game.startBattle({
      mode, level: q.get('level') || 'normal',
      p1: { char: q.get('p1') || 'gojo', pal: +(q.get('pal1') || 0) },
      p2: { char: q.get('p2') || 'sukuna', pal: +(q.get('pal2') || 0) },
    });
  } else game.set(new JJK.UI.Title());

  // fixed 60 Hz simulation, render every animation frame
  const STEP = 1000 / 60;
  let last = performance.now(), acc = 0;
  let fps = 60, fpsAcc = 0, fpsN = 0;
  function frame(now) {
    let dt = now - last;
    last = now;
    if (dt > 250) dt = 250;
    acc += dt;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 500) { fps = Math.round(fpsN * 1000 / fpsAcc); fpsAcc = 0; fpsN = 0; }
    let steps = 0;
    while (acc >= STEP && steps < 4) {
      if (JJK.keyPressed('F3')) game.showFps = !game.showFps;
      if (JJK.keyPressed('F4')) {
        try {
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen();
        } catch (e) {}
      }
      game.scene.tick(game);
      JJK.endInputFrame();
      acc -= STEP;
      steps++;
    }
    if (steps >= 4) acc = 0;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    game.scene.render(ctx);
    if (game.showFps) JJK.Font.draw(ctx, fps + ' FPS', W - 4, H - 10, { color: '#80ff80', align: 'right', outline: '#000' });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  JJK.ctx = ctx;
})();
