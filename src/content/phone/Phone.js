// The player's phone (ctx.game.phone): a 2008 candybar «NOVA 1120» on a green-backlit 96×68
// LCD. Standby with operator, signal, battery, clock and the date that never changes; menu
// with messages, contacts, call log, Snake, flashlight and settings. Calls never get through.
// New SMS arrive very rarely, tied to what the player does.

import { LCD, presentLCD, LCD_W, LCD_H } from './lcd.js'
import { Snake, SNAKE_EN, loadBest } from './snake.js'
import { RINGTONES, UNAVAILABLE_RU, UNAVAILABLE_EN, registerPhoneSounds } from './sounds.js'
import { drawBody, drawGlow, BODY_W, BODY_H, LCD_X, LCD_Y, VISIBLE_U, KEYS } from './body.js'
import './phone.css'

export const PHONE_DATE = '14.01.2008'
const DAY = '14.01'
const OPERATOR = { ru: 'МегаЛинк', en: 'MegaLink' }
const SETTINGS_KEY = 'liminal-moscow-phone'
const MAX_SMS_PER_SESSION = 3

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

// ---- address book, inbox, log (one ordinary evening's worth) -----------------------------------
const CONTACTS = [
  { id: 'mum', ru: 'Мама', en: 'Mum', num: '+7 916 482-17-30' },
  { id: 'serega', ru: 'Серёга', en: 'Seryoga (a friend)', num: '+7 903 761-44-09' },
  { id: 'work', ru: 'Работа', en: 'Work', num: '8 (495) 637-21-15' },
  { id: 'q', ru: '???', en: '??? (saved without a name)', num: '+7 925 318-90-02' },
]
const byId = id => CONTACTS.find(c => c.id === id)

function initialInbox() {
  return [
    { from: 'Мама', fromEn: 'Mum', time: '16:12', date: DAY, ru: 'Ты где? Купи хлеба.', en: 'Where are you? Buy bread.', read: false, contact: 'mum' },
    { from: 'МегаЛинк', fromEn: 'MegaLink (operator)', time: '14:02', date: DAY, ru: 'Баланс: 12.40 р. Пополните счёт, чтобы оставаться на связи.', en: 'Balance: 12.40 rub. Top up your account to stay connected.', read: true },
    { from: 'Работа', fromEn: 'Work', time: '09:41', date: DAY, ru: 'Отчёт можно в среду. Пропуск не забудьте.', en: "The report can wait till Wednesday. Don't forget your pass.", read: true, contact: 'work' },
    { from: 'Серёга', fromEn: 'Seryoga', time: '22:47', date: '12.01', ru: "Zdorovo! V subbotu u menya, prinesi diski. Lift opyat' slomalsya, idi peshkom)))", en: 'Hey! Saturday at mine, bring the CDs. The lift is broken again, take the stairs :)))  (typed in Latin letters: a Latin SMS held 160 characters, a Cyrillic one only 70)', read: true, contact: 'serega' },
    { from: '+7 926 551-03-87', fromEn: 'Unknown number', time: '11:20', date: '10.01', ru: 'Мама, у меня проблемы, положи 500 р. на этот номер, потом всё объясню', en: "Mum, I'm in trouble, put 500 rub on this number, I'll explain everything later.  (a classic 2008 scam text)", read: true },
    { from: '+7 903 115-62-08', fromEn: 'Unknown number', time: '23:58', date: '31.12', ru: 'С Новым годом. Прости за всё. Если номер сменил — не отвечай.', en: "Happy New Year. Sorry for everything. If you've changed your number, don't reply.", read: true },
  ]
}
function initialSent() {
  return [
    { to: 'Мама', toEn: 'Mum', time: '08:15', date: DAY, ru: 'Ключи у меня. Буду поздно.', en: "I've got the keys. I'll be late." },
    { to: 'Серёга', toEn: 'Seryoga', time: '22:51', date: '12.01', ru: 'ok, prinesu', en: "ok, I'll bring them" },
  ]
}
function initialLog() {
  return {
    missed: [
      { who: 'Мама', en: 'Mum', time: '15:58', date: DAY, contact: 'mum' },
      { who: 'Мама', en: 'Mum', time: '15:47', date: DAY, contact: 'mum' },
      { who: 'Скрытый номер', en: 'Hidden number', time: '02:14', date: '13.01' },
      { who: '???', en: '???', time: '23:40', date: '11.01', contact: 'q' },
    ],
    received: [
      { who: 'Работа', en: 'Work', time: '10:05', date: DAY, contact: 'work' },
      { who: 'Мама', en: 'Mum', time: '21:12', date: '13.01', contact: 'mum' },
      { who: 'Серёга', en: 'Seryoga', time: '19:20', date: '12.01', contact: 'serega' },
    ],
    dialled: [
      { who: 'Мама', en: 'Mum', time: '08:20', date: DAY, contact: 'mum' },
      { who: 'Работа', en: 'Work', time: '12:30', date: '13.01', contact: 'work' },
      { who: '???', en: '???', time: '23:44', date: '11.01', contact: 'q' },
    ],
  }
}
const TEMPLATES = [
  { ru: 'Хорошо.', en: 'OK.' },
  { ru: 'Скоро буду.', en: "I'll be there soon." },
  { ru: 'Перезвоню позже.', en: "I'll call you back later." },
  { ru: 'Ты где?', en: 'Where are you?' },
  { ru: 'Куплю.', en: "I'll buy it." },
  { ru: 'Я у подъезда.', en: "I'm at the entrance." },
]

// ---- key mapping --------------------------------------------------------------------------------
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyE: 'select', Enter: 'select', NumpadEnter: 'select', Space: 'select',
  Backspace: 'back', Delete: 'back',
}
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'])
const REPEATABLE = new Set(['up', 'down', 'left', 'right'])

// ---- drawing helpers ------------------------------------------------------------------------------
const ROWS = 4, ROW_Y = 11, ROW_H = 11, SOFT_Y = 57

function title(l, text, right) {
  l.text(l.fit(text, right ? 80 : 95, 'bold'), 0, 0, { font: 'bold' })
  if (right) l.text(right, 95, 0, { align: 'right' })
}
function soft(l, label) { if (label) l.text(label, 48, SOFT_Y, { align: 'center' }) }
function scrollbar(l, idx, n, y0 = ROW_Y, y1 = 55) {
  if (n <= 1) return
  for (let y = y0; y <= y1; y += 2) l.set(94, y)
  const h = Math.max(4, Math.round((y1 - y0 + 1) / n))
  const y = Math.round(y0 + (y1 - y0 + 1 - h) * idx / (n - 1))
  l.fillRect(93, y, 3, h)
}
function centerLines(l, lines, y, font = 'small', lh = 10) {
  lines.forEach((s, i) => l.text(s, 48, y + i * lh, { align: 'center', font }))
}

// big menu icons, drawn in a 32×24 box
const BIG = {
  messages(l, x, y) {
    l.rect(x + 7, y + 1, 24, 15); l.line(x + 7, y + 1, x + 19, y + 9); l.line(x + 30, y + 1, x + 19, y + 9)
    l.fillRect(x + 1, y + 7, 25, 17, 0)
    l.rect(x + 1, y + 7, 25, 17); l.line(x + 1, y + 7, x + 13, y + 16); l.line(x + 25, y + 7, x + 13, y + 16)
    l.line(x + 1, y + 23, x + 9, y + 15); l.line(x + 25, y + 23, x + 17, y + 15)
  },
  contacts(l, x, y) {
    l.rect(x + 7, y, 21, 24); l.fillRect(x + 7, y, 3, 24)
    for (let k = 0; k < 4; k++) l.hline(x + 4, x + 8, y + 3 + k * 6)
    l.circle(x + 19, y + 8, 3, true)
    l.shape(x + 13, y + 13, 13, 8, (i, j) => ((i - 6) ** 2) / 40 + ((j - 7.5) ** 2) / 50 <= 1)
    l.hline(x + 12, x + 26, y + 21)
  },
  log(l, x, y) {
    const cx = x + 16, cy = y + 12
    l.circle(cx, cy, 11); l.circle(cx, cy, 10)
    for (const [dx, dy] of [[0, -8], [8, 0], [0, 8], [-8, 0]]) l.set(cx + dx, cy + dy)
    l.line(cx, cy, cx, cy - 7); l.line(cx, cy, cx + 5, cy + 3)
    l.fillRect(cx - 1, cy - 1, 3, 3)
    // a little "missed" arrow
    l.line(x + 1, y + 1, x + 6, y + 6); l.hline(x + 3, x + 6, y + 6); l.vline(x + 6, y + 3, y + 6)
  },
  games(l, x, y) {
    const seg = (x0, y0, x1, y1) => l.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) + 3, Math.abs(y1 - y0) + 3)
    seg(x + 1, y + 19, x + 10, y + 19); seg(x + 10, y + 19, x + 10, y + 11); seg(x + 10, y + 11, x + 19, y + 11)
    seg(x + 19, y + 11, x + 19, y + 3); seg(x + 19, y + 3, x + 26, y + 3)
    l.set(x + 28, y + 4, 0)
    l.circle(x + 28, y + 16, 2, true); l.set(x + 29, y + 13); l.set(x + 30, y + 12)
  },
  flashlight(l, x, y, on) {
    l.fillRect(x + 1, y + 9, 15, 7); l.fillRect(x + 6, y + 8, 4, 1, 1); l.fillRect(x + 7, y + 11, 2, 3, 0)
    for (let i = 0; i < 6; i++) l.vline(x + 16 + i, y + 9 - Math.floor(i / 1.4), y + 15 + Math.floor(i / 1.4))
    l.vline(x + 22, y + 4, y + 20)
    if (on) {
      l.line(x + 25, y + 12, x + 31, y + 12); l.line(x + 25, y + 7, x + 30, y + 3); l.line(x + 25, y + 17, x + 30, y + 21)
      l.line(x + 24, y + 2, x + 26, y); l.line(x + 24, y + 22, x + 26, y + 24)
    }
  },
  settings(l, x, y) {
    l.shape(x + 2, y, 24, 24, (i, j) => {
      const dx = i - 11.5, dy = j - 11.5, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx)
      return r <= 8.2 + (Math.cos(a * 8) > 0.3 ? 3 : 0) && r > 3.6
    })
    l.line(x + 22, y + 22, x + 31, y + 13); l.line(x + 23, y + 22, x + 31, y + 14)
    l.fillRect(x + 28, y + 10, 3, 3); l.set(x + 30, y + 10, 0)
  },
}

// ======================================================================================
export class Phone {
  constructor(ctx) {
    this.ctx = ctx
    this.game = ctx.game
    this.open = false
    this.lcd = new LCD()
    this.stack = []
    this.dirty = true
    this.t = 0
    this.anim = 0 // 0 hidden .. 1 fully raised
    this.light = 1
    this.lastKey = -100
    this.signal = 4
    this._sigTimer = 0
    this.battery = 3
    this.inbox = initialInbox()
    this.sent = initialSent()
    this.log = initialLog()
    this.missedSeen = false
    this.smsCount = 0
    this.lastSmsAt = -1e9
    this._firstBuzz = true
    this._fired = new Set()
    this._timers = []
    this._pressed = new Map() // key id → time left
    this._repeat = { a: null, t: 0 }
    this._hintKeys = 0
    this._minute = -1
    this._lagX = 0; this._lagY = 0
    this._lastYaw = null; this._lastPitch = null
    this._underground = 0
    this._noSignalFrom = null
    this._inF = 0
    this.callState = null
    this.preview = null
    this.settings = { ringtone: 0, contrast: 4, keytones: true }
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) } catch { /* no storage */ }
    this.snakeBest = loadBest()
    this._proxy = {
      input: null,
      down: c => !MOVE_KEYS.has(c) && !!this._proxy.input?.down(c),
      hit: () => false,
      consumeMouse: () => this._proxy.input ? this._proxy.input.consumeMouse() : [0, 0],
      get touchWalk() { return false },
    }
    this._buildDom()
    this.reset()
    window.addEventListener('resize', () => this._layout())
  }

  // ---------------------------------------------------------------- DOM / presentation
  _buildDom() {
    const root = document.createElement('div')
    root.className = 'phone-root'
    this.cBody = document.createElement('canvas')
    this.cGlow = document.createElement('canvas'); this.cGlow.className = 'glow'
    this.cLcd = document.createElement('canvas'); this.cLcd.className = 'lcd'
    this.elHalo = document.createElement('div'); this.elHalo.className = 'halo'
    this.elGlare = document.createElement('div'); this.elGlare.className = 'glare'
    root.append(this.cBody, this.elHalo, this.cGlow, this.cLcd, this.elGlare)
    this.el = root
    this.elTr = document.createElement('div')
    this.elTr.className = 'phone-tr'
    document.body.append(root, this.elTr)
    this._layout()
  }

  _layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const W = window.innerWidth, H = window.innerHeight
    let p = clamp(Math.round(H * dpr / 330), 2, 8)
    while (p > 1 && (BODY_W * p) / dpr > W * 0.46) p--
    const u = p / dpr
    this.p = p; this.u = u
    const left = Math.round(W - BODY_W * u - Math.max(18, W * 0.075))
    const top = Math.round(H - VISIBLE_U * u)
    this.baseX = left; this.baseY = top
    for (const c of [this.cBody, this.cGlow]) {
      c.width = BODY_W * p; c.height = BODY_H * p
      c.style.width = `${BODY_W * u}px`; c.style.height = `${BODY_H * u}px`
    }
    this.cLcd.width = LCD_W * p; this.cLcd.height = LCD_H * p
    Object.assign(this.cLcd.style, { left: `${LCD_X * u}px`, top: `${LCD_Y * u}px`, width: `${LCD_W * u}px`, height: `${LCD_H * u}px` })
    Object.assign(this.elGlare.style, { left: `${LCD_X * u}px`, top: `${LCD_Y * u}px`, width: `${LCD_W * u}px`, height: `${LCD_H * u}px` })
    Object.assign(this.elHalo.style, { left: `${(LCD_X - 40) * u}px`, top: `${(LCD_Y - 40) * u}px`, width: `${(LCD_W + 80) * u}px`, height: `${(LCD_H + 80) * u}px` })
    Object.assign(this.el.style, { width: `${BODY_W * u}px`, height: `${BODY_H * u}px` })
    this.elTr.style.right = `${Math.round(W - left + 18)}px`
    this.elTr.style.top = `${Math.round(top + (LCD_Y + 4) * u)}px`
    const g = this.cBody.getContext('2d')
    g.setTransform(p, 0, 0, p, 0, 0)
    drawBody(g, p)
    this._glowDirty = true
    this.dirty = true
  }

  _present(dt) {
    // LCD
    if (this.dirty) {
      this.dirty = false
      this.lcd.clear()
      try { this.screen.draw(this.lcd, this) } catch (e) { console.error('[phone] draw', e) }
      const g = this.cLcd.getContext('2d')
      presentLCD(this.lcd, g, this.p, this.light, this.settings.contrast)
    }
    // keypad glow + pressed keys
    if (this._glowDirty) {
      this._glowDirty = false
      const g = this.cGlow.getContext('2d')
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, this.cGlow.width, this.cGlow.height)
      g.setTransform(this.p, 0, 0, this.p, 0, 0)
      drawGlow(g, this._pressed, this.p)
    }
    this.cGlow.style.opacity = String(this.light)
    // ambient light on the plastic: dim at night, a little warmer indoors
    const night = this.game.uniforms?.uNight?.value ?? 0
    const z = this.game.zone
    const amb = z?.indoor ? 0.78 : 1 - 0.5 * night
    const flash = this.game.flashlight ? 0.08 : 0
    this.cBody.style.filter = `brightness(${(amb + flash).toFixed(3)})`
    this.elHalo.style.opacity = String((0.25 + 0.75 * night) * this.light)
    // sway: breathing, hand tremor, lag behind the look direction, slide in/out
    const t = this.t
    const k = this.anim * this.anim * (3 - 2 * this.anim)
    const u = this.u
    const sx = Math.sin(t * 0.71) * 1.4 + Math.sin(t * 1.93 + 0.4) * 0.45 + this._lagX
    const sy = Math.sin(t * 1.13 + 1.0) * 1.2 + Math.sin(t * 0.37) * 0.8 + this._lagY + (1 - k) * (VISIBLE_U * u + 60)
    const rot = -2.4 + Math.sin(t * 0.57) * 0.35 + this._lagX * 0.05
    this.el.style.transform = `translate3d(${(this.baseX + sx).toFixed(1)}px, ${(this.baseY + sy).toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg)`
    // translation (outside the LCD)
    const showTr = this.open && this.game.ui?.translations !== false
    let html = ''
    if (showTr) {
      let en = ''
      try { en = this.screen.en?.(this) ?? '' } catch { en = '' }
      html = en ? `<div class="t">${esc(en)}</div>` : ''
      if (this._hintKeys < 8) html += '<div class="h">↑↓←→ / WASD · E select · Backspace back · Q put away</div>'
    }
    if (html !== this._trHtml) { this._trHtml = html; this.elTr.innerHTML = html }
    this.elTr.classList.toggle('on', showTr && !!html && k > 0.6)
  }

  // ---------------------------------------------------------------- public API
  toggle() { if (this.open) this.close({ force: true }); else this.show() }

  show(screenName) {
    if (this.open) return
    this.open = true
    this.openedAt = this.game.time
    this.el.classList.add('on')
    this.reset()
    if (screenName) this.goto(screenName)
    else if (this.inbox.some(m => !m.read && !m.notified)) this.push(this._newSmsPopup())
    this.wake()
    this._sfx('phone_pocket', { out: true, gain: 0.5 })
    this.game.events?.emit('phone', { action: 'open' })
  }

  /**
   * Close the phone. Game calls this on Escape: inside a sub-screen, Escape steps back
   * instead (pass {force:true} to always close).
   */
  close(o = {}) {
    if (!this.open) return
    if (!o.force && this.game.input?.hit?.('Escape') && this.stack.length > 1) {
      this.press('back')
      return
    }
    this.open = false
    this._endCall()
    this._stopPreview()
    this._sfx('phone_pocket', { out: false, gain: 0.4 })
    this.game.events?.emit('phone', { action: 'close' })
  }

  /** Deliver an SMS (counts toward the 3-per-session cap). msg: {from, fromEn, ru, en, contact?} */
  receive(msg, o = {}) {
    if (this.smsCount >= MAX_SMS_PER_SESSION && !o.force) return false
    this.smsCount++
    this.lastSmsAt = this.game.time
    const m = { time: this.ctx.atmos?.clock ?? '00:00', date: DAY, read: false, ...msg }
    const buzz = () => {
      this.inbox.unshift(m)
      const muffled = !this.open
      this._sfx('phone_vibrate', { muffled, gain: muffled ? 0.9 : 0.6 })
      this._sfx('phone_sms', { muffled, gain: muffled ? 0.55 : 0.5 })
      if (this.open) { m.notified = true; this.push(this._newSmsPopup()); this.wake() }
      else if (this._firstBuzz) {
        this.game.ui?.say?.({ ru: 'В кармане коротко завибрировал телефон.', en: 'Your phone buzzed briefly in your pocket.' }, 5)
      }
      this._firstBuzz = false
      this.dirty = true
      this.game.events?.emit('phone', { action: 'sms', msg: m })
    }
    // the iconic GSM chatter leaks out of the speaker a moment before the message lands
    this._sfx('phone_gsm', { gain: this.open ? 0.5 : 0.3, duration: 1.4 })
    this._later(1.5, buzz)
    return true
  }

  /** Add a missed call to the log (e.g. while there was no signal). */
  addMissed(entry) { this.log.missed.unshift({ date: DAY, ...entry }); this.missedSeen = false; this.dirty = true }

  /** Named story hooks other packages may call: 'doppelganger' | 'underground' | 'longwalk'. */
  trigger(id) { this._fire(id) }

  // ---------------------------------------------------------------- screens
  get screen() { return this.stack[this.stack.length - 1] }
  reset() { this.stack = [this._idle()]; this.dirty = true }
  push(s) { this.stack.push(s); s.enter?.(this); this.dirty = true }
  pop() {
    if (this.stack.length <= 1) return false
    const s = this.stack.pop()
    s.leave?.(this)
    this.dirty = true
    return true
  }
  replace(s) { const o = this.stack.pop(); o?.leave?.(this); this.push(s) }
  goto(name) {
    const map = {
      menu: () => this.push(this._menu(0)),
      inbox: () => { this.push(this._menu(0)); this.push(this._messages()); this.push(this._inbox()) },
      msg: () => { this.push(this._menu(0)); this.push(this._messages()); this.push(this._inbox()); this.push(this._message(this.inbox[0])) },
      contacts: () => { this.push(this._menu(1)); this.push(this._contacts()) },
      call: () => { this.push(this._menu(1)); this.push(this._contacts()); this._call(CONTACTS[0]) },
      unavailable: () => { this.push(this._menu(1)); this.push(this._contacts()); this._call(CONTACTS[0]); if (this.callState) { this.callState.phase = 'unavailable'; this.callState.t = 0.1 } },
      log: () => { this.push(this._menu(2)); this.push(this._log()); this.push(this._logList('missed')) },
      games: () => { this.push(this._menu(3)); this.push(this._games()) },
      snake: () => { this.push(this._menu(3)); this.push(this._games()); this.push(this._snake(true)) },
      flashlight: () => this.push(this._menu(4)),
      settings: () => { this.push(this._menu(5)); this.push(this._settings()) },
      ringtones: () => { this.push(this._menu(5)); this.push(this._settings()); this.push(this._ringtones()) },
      contrast: () => { this.push(this._menu(5)); this.push(this._settings()); this.push(this._contrast()) },
      dial: () => { this.push(this._dial('*100#')) },
      sms: () => { this.push(this._newSmsPopup()) },
      font: () => this.push(this._fontTest()),
    }
    try { map[name]?.() } catch (e) { console.error('[phone] goto', e) }
  }

  _idle() {
    return {
      name: 'idle',
      draw: (l, ph) => {
        // signal: antenna + bars (top bar = strongest)
        l.icon('antenna', 0, 0)
        for (let k = 0; k < 4; k++) if (k < ph.signal) l.fillRect(0, 21 - k * 3, 2 + k, 2)
        // battery: icon + bars
        l.icon('battery', 91, 0)
        const blink = ph.battery <= 1 && Math.floor(ph.t * 2) % 2 === 0
        for (let k = 0; k < 4; k++) if (k < ph.battery && !blink) l.fillRect(94 - k, 21 - k * 3, 2 + k, 2)
        // operator
        l.text(ph.signal > 0 ? OPERATOR.ru : 'Нет сети', 48, 1, { align: 'center', font: 'bold' })
        // clock (big) and the date
        const clock = ph.ctx.atmos?.clock ?? '00:00'
        l.text(clock, 48, 13, { align: 'center', font: 'big' })
        l.text(`Пн ${PHONE_DATE}`, 48, 35, { align: 'center' })
        // status icons
        let ix = 8
        if (ph.inbox.some(m => !m.read)) ix += l.icon('envelope', ix, 50) + 3
        if (!ph.missedSeen) ix += l.icon('missed', ix, 49) + 3
        if (ph.game.flashlight) l.icon('bulb', 84, 48)
        soft(l, 'Меню')
      },
      key: (a, ph) => {
        if (a === 'select') { ph.push(ph._menu(0)); return true }
        if (a === 'down') { ph.push(ph._contacts()); return true }
        if (a === 'up') { ph.push(ph._inbox()); return true }
        if (a === 'back') { ph.close({ force: true }); return true }
        if (a.startsWith('digit:') || a === 'star' || a === 'hash') {
          ph.push(ph._dial(a === 'star' ? '*' : a === 'hash' ? '#' : a.slice(6)))
          return true
        }
        return false
      },
      en: ph => {
        const unread = ph.inbox.filter(m => !m.read).length
        const parts = [ph.signal > 0 ? `${OPERATOR.en} (mobile operator)` : 'No network', `${ph.ctx.atmos?.clock ?? ''} · Mon 14 January 2008`]
        if (unread) parts.push(`${unread} unread message${unread > 1 ? 's' : ''}`)
        if (!ph.missedSeen) parts.push('missed calls')
        return parts.join('\n') + '\nE — Menu'
      },
      tick: ph => ph.battery <= 1,
    }
  }

  _menu(start = 0) {
    const items = [
      { ru: 'Сообщения', en: 'Messages', icon: 'messages', open: ph => ph.push(ph._messages()) },
      { ru: 'Контакты', en: 'Contacts', icon: 'contacts', open: ph => ph.push(ph._contacts()) },
      { ru: 'Журнал', en: 'Call log', icon: 'log', open: ph => { ph.missedSeen = true; ph.push(ph._log()) } },
      { ru: 'Игры', en: 'Games', icon: 'games', open: ph => ph.push(ph._games()) },
      { ru: 'Фонарик', en: 'Flashlight', icon: 'flashlight', open: ph => ph._toggleFlashlight() },
      { ru: 'Настройки', en: 'Settings', icon: 'settings', open: ph => ph.push(ph._settings()) },
    ]
    const s = {
      name: 'menu', i: start,
      draw: (l, ph) => {
        const it = items[s.i]
        title(l, it.ru, String(s.i + 1))
        BIG[it.icon](l, 30, 21, ph.game.flashlight)
        scrollbar(l, s.i, items.length, 11, 55)
        soft(l, 'Выбрать')
      },
      key: (a, ph) => {
        if (a === 'down' || a === 'right') { s.i = (s.i + 1) % items.length; ph.dirty = true; return true }
        if (a === 'up' || a === 'left') { s.i = (s.i + items.length - 1) % items.length; ph.dirty = true; return true }
        if (a === 'select') { items[s.i].open(ph); return true }
        if (a.startsWith('digit:')) { const n = parseInt(a.slice(6), 10) - 1; if (items[n]) { s.i = n; items[n].open(ph) } return true }
        return false
      },
      en: () => `Menu ${s.i + 1}/${items.length}: ${items[s.i].en}` + (items[s.i].icon === 'flashlight' ? (this.game.flashlight ? ' (on)' : ' (off)') : ''),
    }
    return s
  }

  /** Generic scrolling list. o: {title, en, items: fn|array of {ru, en, right?, icon?, act?}, soft, onSelect, selectEn} */
  _list(o) {
    const s = {
      name: o.name ?? 'list', sel: o.sel ?? 0, top: 0,
      items: () => (typeof o.items === 'function' ? o.items(this) : o.items),
      draw: (l, ph) => {
        const items = s.items()
        title(l, o.title, items.length > 1 ? `${s.sel + 1}/${items.length}` : '')
        if (!items.length) { centerLines(l, [o.empty ?? 'Пусто'], 26); soft(l, 'Назад'); return }
        s.sel = clamp(s.sel, 0, items.length - 1)
        if (s.sel < s.top) s.top = s.sel
        if (s.sel >= s.top + ROWS) s.top = s.sel - ROWS + 1
        for (let r = 0; r < ROWS; r++) {
          const i = s.top + r
          const it = items[i]
          if (!it) break
          const y = ROW_Y + r * ROW_H
          const v = i === s.sel ? 0 : 1
          if (i === s.sel) l.fillRect(0, y, items.length > ROWS ? 92 : 96, ROW_H)
          let x = 2
          if (it.icon) x += l.icon(it.icon, x, y + 3, v) + 3
          const rw = it.right ? l.measure(it.right) + 3 : 0
          const maxW = (items.length > ROWS ? 90 : 94) - x - rw
          l.text(l.fit(it.ru, maxW), x, y + 1, { v })
          if (it.right) l.text(it.right, items.length > ROWS ? 90 : 94, y + 1, { v, align: 'right' })
        }
        if (items.length > ROWS) scrollbar(l, s.sel, items.length, ROW_Y, ROW_Y + ROWS * ROW_H - 1)
        soft(l, o.soft ?? 'Выбрать')
      },
      key: (a, ph) => {
        const items = s.items()
        if (a === 'down') { if (items.length) { s.sel = (s.sel + 1) % items.length; ph.dirty = true; o.onMove?.(items[s.sel], ph, s) } return true }
        if (a === 'up') { if (items.length) { s.sel = (s.sel + items.length - 1) % items.length; ph.dirty = true; o.onMove?.(items[s.sel], ph, s) } return true }
        if (a === 'select') {
          const it = items[s.sel]
          if (!it) { ph.pop(); return true }
          if (it.act) it.act(ph, s)
          else o.onSelect?.(it, ph, s)
          ph.dirty = true
          return true
        }
        if ((a === 'left' || a === 'right') && o.onSide) { o.onSide(items[s.sel], a, ph, s); ph.dirty = true; return true }
        return false
      },
      en: () => {
        const items = s.items()
        const it = items[s.sel]
        return `${o.en}${it ? ` — ${it.en}` : ''}`
      },
      enter: o.enter, leave: o.leave, update: o.update,
    }
    return s
  }

  _popup(o) {
    // o: {lines:[ru], en, icon, timeout, soft, onSelect, onClose}
    const s = {
      name: 'popup', time: 0,
      draw: (l) => {
        let y = o.icon ? 20 : 16
        if (o.icon) l.icon(o.icon, 48 - Math.floor((o.iconW ?? 7) / 2), 8)
        const lines = o.lines.flatMap(t => l.wrap(t, 90))
        if (lines.length > 3) y = Math.max(2, y - (lines.length - 3) * 6)
        centerLines(l, lines.slice(0, 5), y, 'small', 10)
        soft(l, o.soft ?? '')
      },
      update: (dt, ph) => {
        s.time += dt
        if (o.timeout && s.time > o.timeout) { if (ph.screen === s) { ph.pop(); o.onClose?.(ph) } }
        return false
      },
      key: (a, ph) => {
        if (a === 'select' && o.onSelect) { o.onSelect(ph); return true }
        if (a === 'select' || a === 'back') { ph.pop(); o.onClose?.(ph); return true }
        return true
      },
      en: () => o.en,
    }
    return s
  }

  _newSmsPopup() {
    const n = this.inbox.filter(m => !m.read).length || 1
    return this._popup({
      lines: [n === 1 ? '1 новое сообщение' : `${n} новых сообщ.`], icon: 'envelope', soft: 'Показ.',
      en: n === 1 ? '1 new message — E to show' : `${n} new messages — E to show`,
      onSelect: ph => {
        for (const m of ph.inbox) if (!m.read) m.notified = true
        ph.pop()
        const m = ph.inbox.find(x => !x.read)
        ph.push(ph._inbox())
        if (m) ph.push(ph._message(m))
      },
      onClose: ph => { for (const m of ph.inbox) if (!m.read) m.notified = true },
    })
  }

  _messages() {
    return this._list({
      title: 'Сообщения', en: 'Messages',
      items: ph => [
        { ru: 'Входящие', en: `Inbox (${ph.inbox.length})`, right: String(ph.inbox.length), act: p => p.push(p._inbox()) },
        { ru: 'Новое сообщ.', en: 'New message', act: p => p.push(p._pickContact(c => p.push(p._templates(c)))) },
        { ru: 'Отправленные', en: `Sent (${ph.sent.length})`, right: String(ph.sent.length), act: p => p.push(p._sentList()) },
      ],
    })
  }

  _inbox() {
    return this._list({
      title: 'Входящие', en: 'Inbox', empty: 'Нет сообщений',
      items: ph => ph.inbox.map(m => ({ ru: m.from, en: `${m.fromEn}, ${m.time} ${m.date}${m.read ? '' : ' (unread)'}`, icon: m.read ? 'envelopeOpen' : 'envelope', msg: m })),
      onSelect: (it, ph) => ph.push(ph._message(it.msg)),
    })
  }

  _sentList() {
    return this._list({
      title: 'Отправленные', en: 'Sent messages', empty: 'Нет сообщений',
      items: ph => ph.sent.map(m => ({ ru: m.to, en: `to ${m.toEn}, ${m.time} ${m.date}: “${m.en}”`, right: m.time, msg: { from: m.to, fromEn: m.toEn, time: m.time, date: m.date, ru: m.ru, en: m.en, read: true, sent: true } })),
      onSelect: (it, ph) => ph.push(ph._message(it.msg)),
    })
  }

  _message(m) {
    m.read = true
    m.notified = true
    const s = {
      name: 'message', off: 0, lines: null,
      draw: (l) => {
        if (!s.lines) s.lines = l.wrap(m.ru, 92)
        l.text(l.fit((m.sent ? 'Кому: ' : '') + m.from, 95, 'bold'), 0, 0, { font: 'bold' })
        l.text(`${m.time}  ${m.date}`, 0, 10)
        l.dots(0, 95, 21)
        const vis = 4
        s.off = clamp(s.off, 0, Math.max(0, s.lines.length - vis))
        for (let i = 0; i < vis; i++) {
          const line = s.lines[s.off + i]
          if (line !== undefined) l.text(line, 0, 23 + i * 10, { clip: [0, 91] })
        }
        if (s.lines.length > vis) scrollbar(l, s.off, s.lines.length - vis + 1, 23, 66)
      },
      key: (a, ph) => {
        if (a === 'down') { s.off++; ph.dirty = true; return true }
        if (a === 'up') { s.off = Math.max(0, s.off - 1); ph.dirty = true; return true }
        if (a === 'select') {
          if (m.sent) return true
          const c = m.contact ? byId(m.contact) : null
          ph.push(ph._list({
            title: 'Функции', en: 'Options',
            items: [
              { ru: 'Ответить', en: 'Reply', act: p => p.push(p._templates(c ?? { ru: m.from, en: m.fromEn, num: m.from })) },
              { ru: 'Позвонить', en: 'Call back', act: p => p._call(c ?? { ru: m.from, en: m.fromEn, num: m.from }) },
            ],
          }))
          return true
        }
        return false
      },
      en: () => `${m.sent ? 'To' : 'From'} ${m.fromEn}, ${m.time} on ${m.date}:\n“${m.en}”`,
    }
    return s
  }

  _pickContact(then) {
    return this._list({
      title: 'Кому', en: 'Send to',
      items: CONTACTS.map(c => ({ ru: c.ru, en: c.en, c })),
      onSelect: (it, ph) => { ph.pop(); then(it.c) },
    })
  }

  _templates(c) {
    return this._list({
      title: 'Шаблоны', en: `Templates — message to ${c.en}`,
      items: TEMPLATES.map(t => ({ ru: t.ru, en: t.en, t })),
      onSelect: (it, ph) => { ph.pop(); ph._send(c, it.t) },
    })
  }

  _send(c, t) {
    const ok = this.signal > 0
    const s = this._popup({ lines: ['Отправка', 'сообщения...'], icon: 'envelope', en: `Sending to ${c.en}…` })
    this.push(s)
    this._later(1.6, () => {
      if (this.screen === s) this.pop()
      if (ok) {
        this.sent.unshift({ to: c.ru, toEn: c.en, time: this.ctx.atmos?.clock ?? '', date: DAY, ru: t.ru, en: t.en })
        if (this.open) this.push(this._popup({ lines: ['Сообщение', 'отправлено'], icon: 'check', timeout: 1.8, en: 'Message sent' }))
        this._sfx('phone_beep', { seq: [[1568, 0.06], [0, 0.03], [2093, 0.08]], gain: 0.5 })
      } else if (this.open) {
        this.push(this._popup({ lines: ['Сообщение', 'не отправлено'], icon: 'cross', timeout: 2.2, en: 'Message not sent (no network)' }))
      }
    })
  }

  _contacts() {
    return this._list({
      title: 'Контакты', en: 'Contacts',
      items: CONTACTS.map(c => ({ ru: c.ru, en: `${c.en}, ${c.num}`, c })),
      onSelect: (it, ph) => ph.push(ph._contact(it.c)),
    })
  }

  _contact(c) {
    return this._list({
      title: c.ru, en: `${c.en} (${c.num})`,
      items: [
        { ru: 'Вызов', en: 'Call', act: p => p._call(c) },
        { ru: 'Отправить SMS', en: 'Send a text', act: p => p.push(p._templates(c)) },
        { ru: c.num, en: `Number: ${c.num}` },
      ],
    })
  }

  _log() {
    const cat = [
      ['missed', 'Непринятые', 'Missed calls'], ['received', 'Принятые', 'Received calls'], ['dialled', 'Набранные', 'Dialled numbers'],
    ]
    return this._list({
      title: 'Журнал', en: 'Call log',
      items: ph => cat.map(([k, ru, en]) => ({ ru, en: `${en} (${ph.log[k].length})`, right: String(ph.log[k].length), act: p => p.push(p._logList(k)) })),
    })
  }

  _logList(k) {
    const names = { missed: ['Непринятые', 'Missed calls'], received: ['Принятые', 'Received calls'], dialled: ['Набранные', 'Dialled numbers'] }[k]
    return this._list({
      title: names[0], en: names[1], empty: 'Список пуст',
      items: ph => ph.log[k].map(e => ({ ru: e.who, en: `${e.en}, ${e.time} ${e.date}`, right: e.date === DAY ? e.time : e.date, e })),
      onSelect: (it, ph) => {
        const c = it.e.contact ? byId(it.e.contact) : null
        if (c) ph._call(c)
        else ph.push(ph._popup({ lines: ['Номер', 'не определён'], timeout: 2, en: 'Number withheld' }))
      },
    })
  }

  _games() {
    return this._list({
      title: 'Игры', en: 'Games',
      items: ph => [
        { ru: 'Змейка', en: 'Snake', act: p => p.push(p._snake()) },
        { ru: 'Рекорд', en: `Snake high score: ${ph.snakeBest}`, right: String(ph.snakeBest) },
      ],
    })
  }

  _snake(demo = false) {
    const game = new Snake(((this.game.time * 1000) | 0) + 7)
    if (demo) {
      // a game in progress, for screenshots
      game.state = 'play'
      game.body = [[14, 7], [13, 7], [12, 7], [12, 8], [12, 9], [11, 9], [10, 9], [9, 9], [8, 9]]
      game.food = [19, 7]
      game.score = 14; game.eaten = 9
    }
    const s = {
      name: 'snake', game,
      draw: l => game.draw(l),
      update: (dt, ph) => {
        const ev = game.update(dt)
        if (ev === 'eat') ph._sfx('phone_beep', { freq: 2093, dur: 0.035, gain: 0.35 })
        if (ev === 'die') {
          ph._sfx('phone_beep', { seq: [[784, 0.12], [587, 0.12], [392, 0.25]], gain: 0.4 })
          ph.snakeBest = game.best
        }
        return true
      },
      key: (a, ph) => {
        if (REPEATABLE.has(a)) { game.steer(a); ph.wake(); return true }
        if (a === 'select') {
          if (game.state === 'over') game.reset()
          else if (game.state === 'play') game.state = 'paused'
          else if (game.state === 'paused' || game.state === 'ready') game.state = 'play'
          return true
        }
        if (a === 'back') { ph.snakeBest = Math.max(ph.snakeBest, game.best); ph.pop(); return true }
        return true
      },
      en: () => SNAKE_EN[game.state] + (game.state !== 'ready' ? ` · score ${game.score} · best ${game.best}` : ''),
      repeatKeys: false,
    }
    return s
  }

  _settings() {
    return this._list({
      title: 'Настройки', en: 'Settings',
      items: ph => [
        { ru: 'Мелодия звонка', en: `Ringtone: ${RINGTONES[ph.settings.ringtone]?.en}`, act: p => p.push(p._ringtones()) },
        { ru: 'Контрастность', en: `Display contrast: ${ph.settings.contrast}`, act: p => p.push(p._contrast()) },
        { ru: 'Звук клавиш', en: `Keypad tones: ${ph.settings.keytones ? 'on' : 'off'}`, right: ph.settings.keytones ? 'Вкл' : 'Выкл', act: p => { p.settings.keytones = !p.settings.keytones; p._save() } },
        { ru: 'Дата и время', en: 'Date and time', act: p => p.push(p._dateTime()) },
        { ru: 'О телефоне', en: 'About this phone', act: p => p.push(p._popup({ lines: ['NOVA 1120', 'ПО v4.02 12-11-07', 'RM-120'], en: 'NOVA 1120 · firmware v4.02 from 12 Nov 2007' })) },
      ],
    })
  }

  _dateTime() {
    return this._list({
      title: 'Дата и время', en: 'Date and time',
      items: ph => [
        { ru: 'Время', en: `Time: ${ph.ctx.atmos?.clock}`, right: ph.ctx.atmos?.clock ?? '' },
        { ru: 'Дата', en: `Date: ${PHONE_DATE}`, right: DAY + '.08' },
        { ru: 'Автообновление', en: 'Auto-update from the network: on', right: 'Вкл' },
      ],
      onSelect: (it, ph) => ph.push(ph._popup({ lines: ['Установлено', 'сетью'], timeout: 2, en: 'Set by the network' })),
    })
  }

  _ringtones() {
    return this._list({
      title: 'Мелодии', en: 'Ringtones', sel: this.settings.ringtone,
      items: ph => RINGTONES.map((r, i) => ({ ru: (i === ph.settings.ringtone ? '• ' : '  ') + r.ru, en: `“${r.en}”${i === ph.settings.ringtone ? ' (current)' : ''} — plays on highlight, E to set`, i })),
      onMove: (it, ph) => ph._schedulePreview(it.i),
      enter: ph => ph._schedulePreview(ph.settings.ringtone),
      leave: ph => ph._stopPreview(),
      onSelect: (it, ph) => {
        ph.settings.ringtone = it.i
        ph._save()
        ph._stopPreview()
        ph.push(ph._popup({ lines: ['Сохранено'], icon: 'check', timeout: 1.4, en: 'Saved' }))
      },
    })
  }

  _contrast() {
    const s = {
      name: 'contrast',
      draw: (l, ph) => {
        title(l, 'Контрастность')
        const c = ph.settings.contrast
        for (let i = 0; i < 7; i++) {
          const x = 13 + i * 10, h = 4 + i * 3
          if (i < c) l.fillRect(x, 46 - h, 7, h)
          else l.rect(x, 46 - h, 7, h)
        }
        l.icon('arrowLeft', 2, 32); l.icon('arrowRight', 91, 32)
        soft(l, 'OK')
      },
      key: (a, ph) => {
        if (a === 'left' || a === 'down') { ph.settings.contrast = clamp(ph.settings.contrast - 1, 1, 7); ph.dirty = true; return true }
        if (a === 'right' || a === 'up') { ph.settings.contrast = clamp(ph.settings.contrast + 1, 1, 7); ph.dirty = true; return true }
        if (a === 'select' || a === 'back') { ph._save(); ph.pop(); return true }
        return false
      },
      en: ph => `Display contrast ${ph.settings.contrast}/7 — left/right to adjust`,
    }
    return s
  }

  _dial(first) {
    const s = {
      name: 'dial', num: first,
      draw: (l) => {
        const lines = l.wrap(s.num.replace(/(.{8})/g, '$1 ').trim(), 94, 'big')
        const y = Math.max(0, 40 - lines.length * 20)
        lines.slice(-3).forEach((ln, i) => l.text(ln, 95, y + i * 20, { font: 'big', align: 'right' }))
        soft(l, /^\*.*#$/.test(s.num) ? 'Отправ.' : 'Вызов')
      },
      key: (a, ph) => {
        if (a.startsWith('digit:')) { if (s.num.length < 16) s.num += a.slice(6); ph.dirty = true; return true }
        if (a === 'star') { s.num += '*'; ph.dirty = true; return true }
        if (a === 'hash') { s.num += '#'; ph.dirty = true; return true }
        if (a === 'back') { s.num = s.num.slice(0, -1); if (!s.num) ph.pop(); ph.dirty = true; return true }
        if (a === 'select') {
          const n = s.num
          ph.pop()
          if (/^\*1\d\d#$/.test(n)) ph._ussd(n)
          else if (/^[*#]/.test(n)) ph.push(ph._popup({ lines: ['Неверный', 'запрос'], timeout: 2, en: 'Invalid request' }))
          else ph._call({ ru: n, en: n, num: n }, true)
          return true
        }
        return true
      },
      en: () => `Dialling ${s.num} — E to call${/^\*1/.test(s.num) ? ' (*100# checks the balance)' : ''}`,
    }
    return s
  }

  _ussd() {
    const s = this._popup({ lines: ['Запрос', 'отправлен...'], en: 'Request sent…' })
    this.push(s)
    this._later(1.8, () => {
      if (!this.open) return
      if (this.screen === s) this.pop()
      if (this.signal <= 0) this.push(this._popup({ lines: ['Нет сети'], timeout: 2, en: 'No network' }))
      else this.push(this._popup({ lines: ['Баланс:', '12.40 р.'], soft: 'OK', en: 'Balance: 12.40 rub (about 30 pence in 2008)' }))
    })
  }

  _toggleFlashlight() {
    try { this.game.toggleFlashlight?.() } catch (e) { console.error(e) }
    const on = !!this.game.flashlight
    this.push(this._popup({ lines: [on ? 'Фонарик включён' : 'Фонарик выключен'], icon: 'bulb', iconW: 5, timeout: 1.3, en: on ? 'Flashlight on (F also works)' : 'Flashlight off' }))
  }

  // ---------------------------------------------------------------- calls (they never get through)
  _call(c, raw = false) {
    this._endCall()
    this.log.dialled.unshift({ who: c.ru, en: c.en, time: this.ctx.atmos?.clock ?? '', date: DAY, contact: c.id })
    const st = this.callState = { c, phase: this.signal > 0 ? 'dial' : 'nonet', t: 0, raw }
    const s = {
      name: 'call',
      draw: (l, ph) => {
        const cs = ph.callState
        if (!cs) return
        if (cs.phase === 'unavailable') {
          const lines = l.wrap(UNAVAILABLE_RU, 92)
          centerLines(l, lines, Math.max(2, 26 - lines.length * 5), 'small', 10)
          soft(l, 'Отбой')
          return
        }
        if (cs.phase === 'ended' || cs.phase === 'nonet') {
          centerLines(l, cs.phase === 'nonet' ? ['Нет сети'] : ['Вызов', 'завершён'], 18, 'bold', 11)
          l.text('00:00', 48, 42, { align: 'center' })
          return
        }
        l.icon('handset', 44, 3)
        const dots = '.'.repeat(1 + (Math.floor(ph.t * 2.5) % 3))
        l.text('Вызов' + dots, 26, 11)
        l.text(l.fit(cs.c.ru, 94, 'bold'), 48, 25, { align: 'center', font: 'bold' })
        if (!raw && cs.c.num) l.text(cs.c.num, 48, 36, { align: 'center' })
        soft(l, 'Отбой')
      },
      update: (dt, ph) => {
        const cs = ph.callState
        if (!cs) { if (ph.screen === s) ph.pop(); return false }
        const prev = cs.phase
        cs.t += dt
        if (cs.phase === 'dial' && cs.t > 0.9) { cs.phase = 'ring'; cs.t = 0; cs.snd = ph._sfx('phone_ring_out', { gain: 0.8 }) }
        else if (cs.phase === 'ring' && cs.t > 6.1) { cs.phase = 'unavailable'; cs.t = 0; cs.snd = ph._sfx('phone_unavailable', { gain: 0.9 }) }
        else if (cs.phase === 'unavailable' && cs.t > 6.6) { cs.phase = 'ended'; cs.t = 0 }
        else if (cs.phase === 'nonet' && cs.t > 2.2) { ph._endCall(); if (ph.screen === s) ph.pop(); return true }
        else if (cs.phase === 'ended' && cs.t > 1.6) { ph._endCall(); if (ph.screen === s) ph.pop(); return true }
        return cs.phase === 'dial' || cs.phase === 'ring' || prev !== cs.phase
      },
      key: (a, ph) => {
        if (a === 'select' || a === 'back') {
          const cs = ph.callState
          if (cs && cs.phase !== 'ended') { cs.snd?.stop?.(0.05); cs.snd = null; cs.phase = 'ended'; cs.t = 0; ph.dirty = true }
          return true
        }
        return true
      },
      en: ph => {
        const cs = ph.callState
        if (!cs) return ''
        if (cs.phase === 'unavailable') return `“${UNAVAILABLE_EN}.”`
        if (cs.phase === 'nonet') return 'No network'
        if (cs.phase === 'ended') return 'Call ended'
        return `Calling ${cs.c.en}…`
      },
    }
    this.push(s)
    this.game.events?.emit('phone', { action: 'call', who: c.ru })
    return st
  }

  _endCall() {
    const cs = this.callState
    if (!cs) return
    try { cs.snd?.stop?.(0.05) } catch { /* ignore */ }
    this.callState = null
    this.dirty = true
  }

  // ---------------------------------------------------------------- input
  /** Called by Game every frame while the phone is open. */
  handleInput(input, dt) {
    // the body still obeys physics (escalators, lifts, metro cars) and the head can look around
    this._proxy.input = input
    try { this.game.player?.update?.(dt, this._proxy) } catch (e) { if (!this._physErr) { console.error('[phone] player', e); this._physErr = true } }
    if (input.hit('KeyQ') || input.hit('Tab')) { this.close({ force: true }); return }
    if (input.hit('KeyF')) { try { this.game.toggleFlashlight?.() } catch { /* ignore */ } this.dirty = true }
    const shift = input.down('ShiftLeft') || input.down('ShiftRight')
    for (const code of input.pressed ?? []) {
      let a = KEYMAP[code]
      const dm = /^(?:Digit|Numpad)(\d)$/.exec(code)
      if (dm) a = shift && dm[1] === '8' ? 'star' : shift && dm[1] === '3' ? 'hash' : `digit:${dm[1]}`
      if (code === 'NumpadMultiply') a = 'star'
      if (code === 'NumpadDivide' || code === 'NumpadDecimal') a = 'hash'
      if (!a) continue
      this.press(a)
      if (REPEATABLE.has(a)) this._repeat = { a, code, t: -0.38 }
      if (!this.open) return
    }
    // auto-repeat for held arrows (lists), not for Snake
    const r = this._repeat
    if (r.a && input.down(r.code) && this.screen?.repeatKeys !== false) {
      r.t += dt
      if (r.t > 0.11) { r.t = 0; this.press(r.a, true) }
    } else r.a = null
  }

  /** Perform a key action (also used by the keypad visuals). */
  press(a, repeat = false) {
    this.wake()
    this._hintKeys++
    if (!repeat && this.settings.keytones && !(this.screen?.name === 'snake' && REPEATABLE.has(a))) {
      this._sfx('phone_key', { gain: 0.55, freq: a.startsWith('digit') ? 1200 + parseInt(a.slice(6), 10) * 60 : 1397 })
    } else if (!repeat) this._sfx('phone_key', { gain: 0.4, tone: false })
    this._flashKey(a)
    let handled = false
    try { handled = this.screen?.key?.(a, this) } catch (e) { console.error('[phone] key', e) }
    if (!handled && a === 'back') { if (!this.pop()) this.close({ force: true }) }
    this.dirty = true
  }

  _flashKey(a) {
    const id = { up: 'up', down: 'down', left: 'left', right: 'right', select: 'select', back: 'softR', star: 'star', hash: 'hash' }[a] ?? (a.startsWith('digit:') ? 'k' + a.slice(6) : null)
    if (!id || !KEYS[id]) return
    this._pressed.set(id, 0.13)
    this._glowDirty = true
  }

  /** Re-light the backlight. */
  wake() {
    this.lastKey = this.t
    if (this.light < 1) this.dirty = true
  }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    this.t += dt
    // timers
    for (let i = this._timers.length - 1; i >= 0; i--) {
      const tm = this._timers[i]
      tm.t -= dt
      if (tm.t <= 0) { this._timers.splice(i, 1); try { tm.fn() } catch (e) { console.error('[phone] timer', e) } }
    }
    this._updateSignal(dt)
    this._updateBattery()
    this._director(dt)
    // raise / lower
    const target = this.open ? 1 : 0
    if (this.anim !== target) {
      this.anim = clamp(this.anim + (target ? dt / 0.28 : -dt / 0.22), 0, 1)
      if (this.anim === 0) { this.el.classList.remove('on'); this.elTr.classList.remove('on') }
    }
    if (!this.open && this.anim === 0) return
    // backlight: 10 s after the last key press it goes out
    const lightT = this.t - this.lastKey < 10 ? 1 : 0
    if (this.light !== lightT) {
      this.light = lightT > this.light ? Math.min(1, this.light + dt * 8) : Math.max(0, this.light - dt * 1.6)
      this.dirty = true
    }
    // pressed-key flashes
    if (this._pressed.size) {
      for (const [k, v] of this._pressed) {
        if (v - dt <= 0) { this._pressed.delete(k); this._glowDirty = true } else this._pressed.set(k, v - dt)
      }
    }
    // screen animation / clock
    const s = this.screen
    if (s?.update && s.update(dt, this)) this.dirty = true
    if (s?.tick?.(this) && Math.floor(this.t * 2) !== this._halfSec) { this._halfSec = Math.floor(this.t * 2); this.dirty = true }
    const minute = Math.floor(this.ctx.atmos?.minutes ?? 0)
    if (minute !== this._minute) { this._minute = minute; this.dirty = true }
    // the phone lags a little behind the head
    const pl = this.game.player
    if (pl) {
      if (this._lastYaw !== null && dt > 0) {
        let dy = pl.yaw - this._lastYaw
        if (dy > Math.PI) dy -= Math.PI * 2
        if (dy < -Math.PI) dy += Math.PI * 2
        const dp = pl.pitch - this._lastPitch
        const k = Math.min(1, dt * 7)
        this._lagX += (clamp(dy / dt, -6, 6) * 9 - this._lagX) * k
        this._lagY += (clamp(-dp / dt, -6, 6) * 7 - this._lagY) * k
      }
      this._lastYaw = pl.yaw; this._lastPitch = pl.pitch
    }
    this._present(dt)
  }

  _updateSignal(dt) {
    this._sigTimer -= dt
    if (this._sigTimer > 0) return
    this._sigTimer = 1.2 + Math.random() * 2.2
    const target = this._signalTarget()
    let s = this.signal
    if (s < target) s++
    else if (s > target) s = target <= 0 ? Math.max(0, s - 2) : s - 1
    else if (target > 0 && Math.random() < 0.18) s = clamp(s + (Math.random() < 0.5 ? -1 : 1), 1, 4)
    if (s !== this.signal) { this.signal = s; this.dirty = true }
  }

  _signalTarget() {
    const z = this.game.zone
    const y = this.game.player?.pos?.y ?? 0
    const r = z?.reverb
    if (r === 'metro' || r === 'tunnel' || r === 'elevator' || y < -5) return 0
    if (r === 'underpass' || y < -1.2) return 1
    if (r === 'stairwell') return 2
    if (z?.indoor) return 3
    return 4
  }

  _updateBattery() {
    const t = this.game.time ?? 0
    const b = t < 1800 ? 3 : t < 3600 ? 2 : 1
    if (b !== this.battery) {
      this.battery = b
      this.dirty = true
      if (b === 1) {
        this._sfx('phone_beep', { seq: [[1175, 0.12], [0, 0.08], [880, 0.2]], gain: 0.35, muffled: !this.open })
        if (this.open) this.push(this._popup({ lines: ['Батарея', 'разряжена'], icon: 'battery', iconW: 5, timeout: 2.5, en: 'Battery low' }))
      }
    }
  }

  // ---------------------------------------------------------------- the rare messages
  _director(dt) {
    const g = this.game
    const p = g.player?.pos
    if (!p) return
    // 1) back above ground after a long stretch without signal: the operator's missed-call notice
    if (this.signal === 0) {
      this._underground += dt
      if (this._noSignalFrom === null) this._noSignalFrom = this.ctx.atmos?.minutes ?? 0
    } else if (this.signal >= 2 && this._underground > 30) {
      this._fire('underground')
      this._underground = 0
      this._noSignalFrom = null
    } else if (this.signal >= 2) { this._underground = 0; this._noSignalFrom = null }
    // 2) lingering in the courtyard that looks like home (Block F)
    const f = this.ctx.registry?.doppelganger?.bounds ?? [462, 328, 600, 508]
    if (p.x > f[0] && p.z > f[1] && p.x < f[2] && p.z < f[3] && p.y > -1 && !g.zone?.indoor) this._inF += dt
    if (this._inF > 28) { this._inF = -1e9; this._fire('doppelganger') }
    // 3) a long walk
    if ((g.time ?? 0) > 22 * 60) this._fire('longwalk')
  }

  _fire(id) {
    if (this._fired.has(id)) return
    if (this.smsCount >= MAX_SMS_PER_SESSION) return
    if ((this.game.time ?? 0) - this.lastSmsAt < 150 && id !== 'underground') return // keep them far apart
    this._fired.add(id)
    if (id === 'underground') {
      const m0 = this._noSignalFrom ?? (this.ctx.atmos?.minutes ?? 0)
      const fmt = m => { m = Math.floor(((m % 1440) + 1440) % 1440); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
      const last = fmt(m0 + 4)
      this.addMissed({ who: 'Мама', en: 'Mum', time: fmt(m0 + 1), contact: 'mum' })
      this.addMissed({ who: 'Мама', en: 'Mum', time: last, contact: 'mum' })
      this.receive({
        from: 'МегаЛинк', fromEn: 'MegaLink (operator)',
        ru: `Вам звонили: +79164821730, 2 раз(а), посл. ${last} ${DAY}`,
        en: `You were called: +79164821730, 2 time(s), last at ${last} on ${DAY}.  (that is Mum's number; there was no signal underground)`,
      })
    } else if (id === 'doppelganger') {
      this.receive({ from: 'Мама', fromEn: 'Mum', contact: 'mum', ru: 'Видела тебя в окно. Почему не заходишь?', en: "I saw you from the window. Why aren't you coming in?" })
    } else if (id === 'longwalk') {
      this.receive({ from: '???', fromEn: '??? (the contact saved without a name)', contact: 'q', ru: 'У вас там тоже снег?', en: 'Is it snowing where you are too?' })
    }
  }

  // ---------------------------------------------------------------- audio & helpers
  _sfx(name, opts = {}) {
    const a = this.ctx.audio
    if (!a?.ready) return null
    try {
      if (!a.has(name)) registerPhoneSounds(a)
      return a.play(name, { bus: 'ui', reverb: 0.15, ...opts })
    } catch (e) { return null }
  }

  _schedulePreview(i) {
    this._stopPreview()
    this._previewTimer = this._later(0.45, () => {
      if (!this.open) return
      this.preview = this._sfx('phone_ringtone', { tune: i, gain: 0.7 })
    })
  }
  _stopPreview() {
    if (this._previewTimer) { const k = this._timers.indexOf(this._previewTimer); if (k >= 0) this._timers.splice(k, 1); this._previewTimer = null }
    try { this.preview?.stop?.(0.03) } catch { /* ignore */ }
    this.preview = null
  }

  _later(t, fn) { const tm = { t, fn }; this._timers.push(tm); return tm }

  _save() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)) } catch { /* no storage */ }
    this.dirty = true
  }

  _fontTest() {
    return {
      name: 'font',
      draw: l => {
        l.text('АБВГДЕЁЖЗИЙКЛМНОП', 0, 0)
        l.text('РСТУФХЦЧШЩЪЫЬЭЮЯ', 0, 10)
        l.text('абвгдеёжзийклмноп', 0, 20)
        l.text('рстуфхцчшщъыьэюя', 0, 30)
        l.text('ABCDEFGHIJKLMNOPQRS', 0, 40)
        l.text('abcdefghijklmnopqrstu', 0, 50)
        l.text('0123456789.,:;!?()«»', 0, 58)
      },
      key: () => false,
      en: () => 'font test',
    }
  }
}
