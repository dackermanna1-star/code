// Nearly invisible interface: a faint interaction prompt, a note/inspection viewer, quiet
// captions, and a pause menu styled after late-2000s PC games / operating systems.

import './ui.css'

const el = (tag, cls, html) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html !== undefined) e.innerHTML = html
  return e
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export class UI {
  constructor(game) {
    this.game = game
    this.root = el('div', 'ui-root')
    document.body.appendChild(this.root)
    this.dot = el('div', 'ui-dot')
    this.prompt = el('div', 'ui-prompt')
    this.caption = el('div', 'ui-caption')
    this.note = el('div', 'ui-note hidden')
    this.fade = el('div', 'ui-fade')
    this.root.append(this.dot, this.prompt, this.caption, this.note, this.fade)
    this.translations = true
    this.noteOpen = false
    this._captionTimer = 0
    this.menu = null
    this.note.addEventListener('click', () => this.closeNote())
  }

  /** Show/hide the interaction prompt. p = {ru, en} or null. */
  setPrompt(p) {
    if (!p) {
      this.prompt.classList.remove('on')
      this.dot.classList.remove('on')
      this._promptKey = null
      return
    }
    const key = p.ru + '|' + p.en
    if (key !== this._promptKey) {
      this._promptKey = key
      this.prompt.innerHTML = `<span class="k">E</span> ${esc(p.ru)}${this.translations && p.en ? `<span class="tr">${esc(p.en)}</span>` : ''}`
    }
    this.prompt.classList.add('on')
    this.dot.classList.add('on')
  }

  /** Quiet caption at the bottom. o: {ru, en, seconds} or a plain string. */
  say(o, seconds = 4) {
    if (typeof o === 'string') o = { ru: o }
    this.caption.innerHTML = `${esc(o.ru || '')}${this.translations && o.en ? `<span class="tr">${esc(o.en)}</span>` : ''}`
    this.caption.classList.add('on')
    this._captionTimer = o.seconds ?? seconds
  }

  /**
   * Inspect a note / poster / sign.
   * o: { title?, ru (string, may contain \n), en (translation), style: 'paper'|'notice'|'sign'|'ticket'|'screen', footer? }
   */
  showNote(o) {
    const style = o.style || 'paper'
    const ru = esc(o.ru || '').replace(/\n/g, '<br>')
    const en = esc(o.en || '').replace(/\n/g, '<br>')
    this.note.className = `ui-note ${style}`
    this.note.innerHTML = `
      <div class="sheet">
        ${o.title ? `<div class="title">${esc(o.title)}</div>` : ''}
        <div class="ru">${ru}</div>
        ${o.footer ? `<div class="footer">${esc(o.footer)}</div>` : ''}
      </div>
      ${this.translations && en ? `<div class="en">${en}</div>` : ''}
      <div class="hint">E / Esc</div>`
    this.noteOpen = true
    if (this.game.audio?.has?.('paper')) this.game.audio.play('paper', { gain: 0.5 })
  }
  closeNote() {
    if (!this.noteOpen) return
    this.noteOpen = false
    this.note.className = 'ui-note hidden'
  }

  /** Fade the whole screen (0..1) — used for transitions (metro ride, waking up). */
  setFade(v, color = '#000') {
    this.fade.style.opacity = String(v)
    this.fade.style.background = color
  }

  update(dt) {
    if (this._captionTimer > 0) {
      this._captionTimer -= dt
      if (this._captionTimer <= 0) this.caption.classList.remove('on')
    }
  }
}
