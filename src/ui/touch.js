// On-screen controls for touch devices: a virtual stick drawn into the low-res UI canvas plus a
// few DOM buttons. Right side of the screen is a look pad; a quick tap there means USE.
export class TouchUI {
  constructor(game, root) {
    this.game = game;
    this.input = game.input;
    const wrap = document.createElement('div');
    wrap.id = 'touch';
    const btn = (name, label, cls, hold) => {
      const b = document.createElement('div');
      b.className = 'tbtn ' + cls;
      b.textContent = label;
      const down = (e) => { e.preventDefault(); e.stopPropagation(); this.input.touchButton(name, true); b.classList.add('on'); if (name === 'run') this.runToggle = !this.runToggle; };
      const up = (e) => { e.preventDefault(); if (!hold) this.input.touchButton(name, false); b.classList.remove('on'); };
      b.addEventListener('touchstart', down, { passive: false });
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('mousedown', down);
      b.addEventListener('mouseup', up);
      wrap.appendChild(b);
      return b;
    };
    this.bUse = btn('use', 'USE', 'b-use');
    this.bCrouch = btn('crouch', 'DUCK', 'b-crouch');
    this.bClimb = btn('climb', 'CLIMB', 'b-climb');
    this.bRun = btn('run', 'RUN', 'b-run', true);
    this.bMenu = btn('menu', 'II', 'b-menu');
    this.runToggle = false;
    root.appendChild(wrap);
    this.wrap = wrap;
    this.input.attachTouch(root);
  }

  update() {
    // RUN is a toggle on touch
    if (this.runToggle) this.input.touch.buttons.add('run'); else this.input.touch.buttons.delete('run');
    this.bRun.classList.toggle('on', this.runToggle);
    const playing = this.game.state === 'play' && !this.game.ui.active;
    this.wrap.style.display = playing || this.game.state === 'pause' ? 'block' : 'none';
    for (const b of [this.bUse, this.bCrouch, this.bClimb, this.bRun]) b.style.visibility = playing ? 'visible' : 'hidden';
  }

  draw(c) {
    const T = this.input.touch;
    if (T.moveId === null || this.game.state !== 'play') return;
    // stick position in canvas pixels
    const rect = this.game.uic.getBoundingClientRect();
    const sx = this.game.uic.width / rect.width, sy = this.game.uic.height / rect.height;
    const ox = (T.ox - rect.left) * sx, oy = (T.oy - rect.top) * sy;
    c.strokeStyle = 'rgba(220,210,170,0.5)';
    c.fillStyle = 'rgba(220,210,170,0.25)';
    c.beginPath(); c.arc(Math.round(ox), Math.round(oy), 16, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(Math.round(ox + T.mx * 14), Math.round(oy + T.my * 14), 6, 0, Math.PI * 2); c.fill();
  }
}
