import { U } from '../engine/uniforms.js';
import { airTemperature } from '../world/astro.js';
import { WEATHER } from '../world/weather.js';
import { PRESETS } from '../settings.js';

const $ = (id) => document.getElementById(id);
const COMPASS_PX_PER_DEG = 3;
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function formatTime(h) {
  const total = Math.floor(h * 60 + 0.5) % (24 * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export class UI {
  constructor(game, settings, audio, { presetName, requestedQuality, onQualityChange }) {
    this.game = game;
    this.settings = settings;
    this.audio = audio;
    this.presetName = presetName;
    this.onQualityChange = onQualityChange;
    this.state = 'loading';
    this.hudVisible = true;
    this.hudTimer = 0;
    this.toastTimer = 0;
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.lastUnlock = 0;

    this.menu = $('menu');
    this.hud = $('hud');
    this.touch = $('touch');
    this.drawers = { settings: $('drawer-settings'), controls: $('drawer-controls') };

    $('btn-start').addEventListener('click', () => this.play());
    $('btn-settings').addEventListener('click', () => this.openDrawer('settings'));
    $('btn-controls').addEventListener('click', () => this.openDrawer('controls'));
    const fs = $('btn-fullscreen');
    if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
      fs.hidden = false;
      const label = () => {
        fs.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
      };
      fs.addEventListener('click', () => {
        const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
        if (p && p.catch) p.catch(() => this.toast('Fullscreen is not available here'));
      });
      document.addEventListener('fullscreenchange', () => {
        label();
        this.game.resize();
      });
    }
    for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => this.closeDrawers());

    const input = game.input;
    input.on('menu', () => {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'menu' && !this.anyDrawerOpen()) this.play();
      else this.closeDrawers();
    });
    input.on('unlock', () => {
      this.lastUnlock = performance.now();
      if (this.state === 'playing' && !this.isTouch && !input.dragLook) this.pause();
    });
    input.on('hud', () => this.toggleHud());
    input.on('photo', () => {
      if (this.state !== 'playing') return;
      game.player.photoMode = !game.player.photoMode;
      if (!game.player.photoMode) game.player.setPosition(game.player.feet.x, game.player.feet.z);
      this.toast(game.player.photoMode ? 'Photo mode: fly freely. Press F to land.' : 'Back on your feet');
    });
    input.on('fly', () => {
      if (this.state !== 'playing' || game.player.photoMode) return;
      game.player.setFlying(!game.player.flying);
    });
    let flightHinted = false;
    game.player.on('fly', ({ on }) => {
      const btn = $('touch-fly');
      btn.setAttribute('aria-pressed', String(on));
      $('touch-jump').textContent = on ? 'Up' : 'Jump';
      if (on && !flightHinted) {
        flightHinted = true;
        this.toast(this.isTouch ? 'Up, up and away. Look where you want to go.' : 'Up, up and away. Look to steer, Shift for full speed, G to drop.', 4.5);
      }
    });
    input.on('mute', () => {
      audio.setMuted(!audio.muted);
      this.toast(audio.muted ? 'Sound off' : 'Sound on');
    });
    input.on('fps', () => {
      settings.set('showFps', !settings.get('showFps'));
      this._syncSettings();
    });
    // Clicking the view while playing (pointer free) recaptures the mouse.
    game.input.el.addEventListener('click', () => {
      if (this.state === 'playing' && !input.pointerLocked && !this.isTouch && performance.now() - this.lastUnlock > 1100) {
        input.requestPointerLock().then((ok) => {
          input.dragLook = !ok;
        });
      }
    });

    this._buildCompass();
    this._bindSettings(requestedQuality);
    if (this.isTouch) this._bindTouch();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) audio.suspend();
      else if (this.state !== 'loading') audio.resume();
    });
  }

  // ---------- loading ----------
  setLoading(progress, text) {
    $('load-bar').style.width = `${Math.round(progress * 100)}%`;
    if (text) $('load-status').textContent = text;
  }

  showError(message) {
    const s = $('load-status');
    s.textContent = message;
    s.classList.add('error');
    $('load-bar').parentElement.hidden = true;
  }

  finishLoading() {
    $('loader').classList.add('done');
    setTimeout(() => {
      $('loader').hidden = true;
    }, 900);
    this.openMenu();
  }

  // ---------- states ----------
  openMenu() {
    this.state = 'menu';
    this.game.input.enabled = false;
    this.game.input.exitPointerLock();
    this.menu.hidden = false;
    this.hud.hidden = true;
    this.touch.hidden = true;
    $('btn-start').textContent = this.started ? 'Resume walking' : 'Begin walking';
    const label = PRESETS[this.presetName]?.label ?? this.presetName;
    $('preset-note').textContent = `Graphics: ${label}${this.settings.get('quality') === 'auto' ? ' (auto)' : ''} · ${this._rendererName()}`;
    $('btn-start').focus({ preventScroll: true });
  }

  _rendererName() {
    const s = this.game.pipeline.size;
    return `${s.sceneW}×${s.sceneH}`;
  }

  async play() {
    this.closeDrawers();
    this.started = true;
    this.state = 'playing';
    this.menu.hidden = true;
    this.hud.hidden = !this.hudVisible;
    const input = this.game.input;
    input.enabled = true;
    await this.audio.start();
    this.audio.setVolume(this.settings.get('volume'));
    if (this.isTouch) {
      this.touch.hidden = false;
      input.dragLook = false;
    } else {
      const ok = await input.requestPointerLock();
      input.dragLook = !ok;
      if (!ok) this.toast('Drag with the mouse to look around');
    }
    this.game.input.el.focus({ preventScroll: true });
    if (!this.welcomed) {
      this.welcomed = true;
      this.toast(this.isTouch ? 'Left side walks, right side looks' : 'WASD to walk · Shift to run · Esc for the menu');
    }
  }

  pause() {
    this.openMenu();
  }

  anyDrawerOpen() {
    return !this.drawers.settings.hidden || !this.drawers.controls.hidden;
  }

  openDrawer(name) {
    for (const [k, d] of Object.entries(this.drawers)) d.hidden = k !== name;
    this._syncSettings();
    const first = this.drawers[name].querySelector('button, input');
    if (first) first.focus({ preventScroll: true });
  }

  closeDrawers() {
    for (const d of Object.values(this.drawers)) d.hidden = true;
  }

  toggleHud() {
    this.hudVisible = !this.hudVisible;
    this.hud.hidden = !this.hudVisible || this.state !== 'playing';
  }

  toast(text, seconds = 3.2) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    this.toastTimer = seconds;
  }

  // ---------- settings ----------
  _seg(id, value, onPick) {
    const el = $(id);
    for (const b of el.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.value === String(value)));
      if (!b._bound) {
        b._bound = true;
        b.addEventListener('click', () => onPick(b.dataset.value));
      }
    }
  }

  _range(id, outId, value, fmt, onInput) {
    const el = $(id);
    el.value = value;
    $(outId).textContent = fmt(Number(value));
    if (!el._bound) {
      el._bound = true;
      el.addEventListener('input', () => {
        $(outId).textContent = fmt(Number(el.value));
        onInput(Number(el.value));
      });
    }
  }

  _check(id, value, onChange) {
    const el = $(id);
    el.checked = !!value;
    if (!el._bound) {
      el._bound = true;
      el.addEventListener('change', () => onChange(el.checked));
    }
  }

  _bindSettings(requestedQuality) {
    this.requestedQuality = requestedQuality;
    this._syncSettings();
  }

  _syncSettings() {
    const g = this.game;
    const s = this.settings;
    this._range('set-time', 'out-time', g.world.timeOfDay.toFixed(2), formatTime, (v) => g.world.setTimeOfDay(v));
    this._seg('set-timespeed', g.timeSpeed === 1 / 60 ? '0.016667' : g.timeSpeed, (v) => {
      const speed = v === '0.016667' ? 1 / 60 : Number(v);
      g.timeSpeed = speed;
      s.set('timeSpeed', speed);
      this._syncSettings();
    });
    this._seg('set-weather', g.weather.mode, (v) => {
      g.weather.setMode(v);
      s.set('weather', v);
      this._syncSettings();
      this.toast(v === 'auto' ? 'The weather will change on its own' : `Weather: ${WEATHER[v].label}`);
    });
    this._seg('set-quality', s.get('quality'), (v) => {
      if (v === s.get('quality')) return;
      s.set('quality', v);
      this._syncSettings();
      this.onQualityChange(v);
    });
    this._check('set-adaptive', s.get('autoResolution'), (v) => {
      s.set('autoResolution', v);
      this._syncSettings();
    });
    this._range('set-scale', 'out-scale', g.pipeline.config.renderScale.toFixed(2), (v) => `${Math.round(v * 100)}%`, (v) => {
      s.set('autoResolution', false);
      $('set-adaptive').checked = false;
      g.pipeline.setRenderScale(v);
      g.resize();
    });
    this._range('set-fov', 'out-fov', s.get('fov'), (v) => `${Math.round(v)}°`, (v) => s.set('fov', v));
    this._range('set-ev', 'out-ev', g.world.exposureBias.toFixed(1), (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} EV`, (v) => {
      g.world.exposureBias = v;
      s.set('exposureBias', v);
    });
    this._check('set-fps', s.get('showFps'), (v) => s.set('showFps', v));
    this._range('set-volume', 'out-volume', s.get('volume'), (v) => `${Math.round(v * 100)}%`, (v) => {
      s.set('volume', v);
      this.audio.setVolume(v);
    });
    this._range('set-sens', 'out-sens', s.get('sensitivity'), (v) => `${v.toFixed(2)}×`, (v) => s.set('sensitivity', v));
    this._check('set-invert', s.get('invertY'), (v) => s.set('invertY', v));
    this._check('set-bob', s.get('headBob'), (v) => s.set('headBob', v));
    $('hud-fps').hidden = !s.get('showFps');
  }

  // ---------- touch ----------
  _bindTouch() {
    const input = this.game.input;
    const zone = $('touch-move');
    const stick = $('stick');
    const knob = $('knob');
    let moveId = null;
    let ox = 0;
    let oy = 0;
    const R = 50;
    zone.addEventListener('pointerdown', (e) => {
      if (moveId !== null) return;
      moveId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      ox = e.clientX;
      oy = e.clientY;
      stick.style.left = `${ox}px`;
      stick.style.top = `${oy}px`;
      stick.hidden = false;
      knob.style.transform = 'translate(0px, 0px)';
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== moveId) return;
      let dx = e.clientX - ox;
      let dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      input.analogMove.x = dx / R;
      input.analogMove.y = -dy / R;
    });
    const endMove = (e) => {
      if (e.pointerId !== moveId) return;
      moveId = null;
      stick.hidden = true;
      input.analogMove.x = 0;
      input.analogMove.y = 0;
    };
    zone.addEventListener('pointerup', endMove);
    zone.addEventListener('pointercancel', endMove);

    const look = $('touch-look');
    let lookId = null;
    let lx = 0;
    let ly = 0;
    look.addEventListener('pointerdown', (e) => {
      if (lookId !== null) return;
      lookId = e.pointerId;
      look.setPointerCapture(e.pointerId);
      lx = e.clientX;
      ly = e.clientY;
    });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      input.look.x += (e.clientX - lx) * 1.6;
      input.look.y += (e.clientY - ly) * 1.6;
      lx = e.clientX;
      ly = e.clientY;
    });
    const endLook = (e) => {
      if (e.pointerId === lookId) lookId = null;
    };
    look.addEventListener('pointerup', endLook);
    look.addEventListener('pointercancel', endLook);

    const run = $('touch-run');
    run.addEventListener('click', () => {
      input.touchSprint = !input.touchSprint;
      run.setAttribute('aria-pressed', String(input.touchSprint));
    });
    const jump = $('touch-jump');
    jump.addEventListener('click', () => {
      if (!this.game.player.flying) input.jumpQueued = true;
    });
    jump.addEventListener('pointerdown', () => {
      input.touchUp = this.game.player.flying;
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
      jump.addEventListener(ev, () => {
        input.touchUp = false;
      });
    }
    $('touch-fly').addEventListener('click', () => {
      if (!this.game.player.photoMode) this.game.player.setFlying(!this.game.player.flying);
    });
    $('touch-menu').addEventListener('click', () => this.pause());
  }

  // ---------- HUD ----------
  _buildCompass() {
    const tape = $('compass-tape');
    const frag = document.createDocumentFragment();
    for (let deg = -360; deg <= 720; deg += 15) {
      const d = ((deg % 360) + 360) % 360;
      const el = document.createElement('span');
      if (d % 45 === 0) {
        el.textContent = POINTS[d / 22.5];
        el.className = d % 90 === 0 ? 'card' : '';
      } else {
        el.className = 'minor';
      }
      el.style.left = `${deg * COMPASS_PX_PER_DEG}px`;
      frag.appendChild(el);
    }
    tape.appendChild(frag);
    this.tape = tape;
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) $('toast').classList.remove('show');
    }
    if (this.state !== 'playing' || !this.hudVisible) return;
    const g = this.game;
    const heading = g.player.headingDeg;
    this.tape.style.transform = `translateX(${-heading * COMPASS_PX_PER_DEG}px)`;
    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.25;
    $('hud-heading').textContent = `${String(Math.round(heading) % 360).padStart(3, '0')}° ${POINTS[Math.round(heading / 22.5) % 16]}`;
    $('hud-time').textContent = formatTime(g.world.timeOfDay);
    const temp = airTemperature(g.world.timeOfDay, U.uStorm.value);
    $('hud-temp').textContent = `${Math.round(temp)} °C · ${g.weather.label}`;
    const kmh = Math.round(g.weather.windSpeed * 3.6);
    $('hud-wind').textContent = kmh < 3 ? 'Calm air' : `Wind ${kmh} km/h from ${g.weather.fromCompass()}`;
    const alt = Math.round(720 + g.player.feet.y);
    const p = g.player;
    $('hud-alt').textContent = p.flying
      ? `${alt} m · flying ${Math.round(p.airspeed * 3.6)} km/h`
      : `${alt} m · ${(p.distanceWalked / 1000).toFixed(1)} km walked`;
    if (this.settings.get('showFps')) {
      const s = g.pipeline.size;
      $('hud-fps').textContent = `${g.stats.fps.toFixed(0)} fps · ${g.stats.frameMs.toFixed(1)} ms\n${s.sceneW}×${s.sceneH} · ${this.presetName}`;
      $('hud-fps').hidden = false;
    } else {
      $('hud-fps').hidden = true;
    }
  }
}
