// Pause menu and settings, styled like a small late-2000s desktop window.

const DEFAULTS = {
  sensitivity: 1, invertY: false, fov: 70, headBob: 1, master: 0.9, ambience: 1, music: 0.7,
  quality: 'high', renderScale: 1, retro: false, translations: true, grain: 1, showStats: false,
}

export function loadSettings() {
  let s = {}
  try { s = JSON.parse(localStorage.getItem('liminal-moscow-settings') || '{}') } catch { s = {} }
  return { ...DEFAULTS, ...s }
}
export function saveSettings(s) {
  try { localStorage.setItem('liminal-moscow-settings', JSON.stringify(s)) } catch { /* storage unavailable */ }
}

export class Menu {
  constructor(game) {
    this.game = game
    this.settings = loadSettings()
    this.root = document.createElement('div')
    this.root.className = 'menu hidden'
    document.body.appendChild(this.root)
    this.open = false
    this.page = 'main'
    this.root.addEventListener('click', e => { if (e.target === this.root) this.close() })
  }

  show(page = 'main') {
    this.open = true
    this.page = page
    this.root.classList.remove('hidden')
    this.render()
    this.game.onMenu?.(true)
  }
  close() {
    if (!this.open) return
    this.open = false
    this.root.classList.add('hidden')
    saveSettings(this.settings)
    this.game.onMenu?.(false)
  }

  render() {
    const s = this.settings
    const g = this.game
    const clock = g.atmos?.clock ?? ''
    if (this.page === 'main') {
      this.root.innerHTML = `
        <div class="win">
          <div class="bar"><span>Пауза <span style="font-weight:normal;opacity:.6">— ${clock}</span></span><span class="x" data-a="close">×</span></div>
          <div class="body">
            <button data-a="close">Продолжить<span class="sub">Resume</span></button>
            <button data-a="settings">Настройки<span class="sub">Settings</span></button>
            <button data-a="controls">Управление<span class="sub">Controls</span></button>
            <div class="sep"></div>
            <button data-a="restart">Вернуться домой<span class="sub">Return to the courtyard</span></button>
          </div>
          <div class="foot">Лиминальная Москва · зима 2008</div>
        </div>`
    } else if (this.page === 'settings') {
      const sl = (k, label, en, min, max, step) => `
        <div class="row"><label>${label}<span class="sub">${en}</span></label>
        <input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}"></div>`
      const ck = (k, label, en) => `
        <div class="row"><label>${label}<span class="sub">${en}</span></label>
        <input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}></div>`
      this.root.innerHTML = `
        <div class="win">
          <div class="bar"><span>Настройки</span><span class="x" data-a="back">×</span></div>
          <div class="body">
            ${sl('sensitivity', 'Мышь', 'Mouse', 0.2, 3, 0.05)}
            ${ck('invertY', 'Инверсия', 'Invert Y')}
            ${sl('fov', 'Обзор', 'FOV', 55, 95, 1)}
            ${sl('headBob', 'Покачивание', 'Head bob', 0, 1.5, 0.05)}
            <div class="sep"></div>
            ${sl('master', 'Громкость', 'Volume', 0, 1, 0.01)}
            ${sl('ambience', 'Окружение', 'Ambience', 0, 1.5, 0.01)}
            ${sl('music', 'Музыка', 'Music', 0, 1, 0.01)}
            <div class="sep"></div>
            <div class="row"><label>Качество<span class="sub">Quality</span></label>
              <select data-k="quality">${['low', 'medium', 'high'].map(q => `<option ${s.quality === q ? 'selected' : ''}>${q}</option>`).join('')}</select></div>
            ${sl('renderScale', 'Разрешение', 'Render scale', 0.4, 1, 0.05)}
            ${ck('retro', 'Ретро-пиксели', 'Retro pixels')}
            ${sl('grain', 'Зерно', 'Film grain', 0, 2, 0.05)}
            ${ck('translations', 'Перевод', 'English translations')}
            ${ck('showStats', 'Статистика', 'Show stats')}
            <div class="sep"></div>
            <button data-a="back">Назад<span class="sub">Back</span></button>
          </div>
        </div>`
    } else if (this.page === 'controls') {
      this.root.innerHTML = `
        <div class="win">
          <div class="bar"><span>Управление</span><span class="x" data-a="back">×</span></div>
          <div class="body keys">
            <div><b>W A S D</b> идти · walk</div>
            <div><b>Shift</b> быстрее · walk faster</div>
            <div><b>Мышь</b> смотреть · look</div>
            <div><b>E</b> действие · interact / read / sit</div>
            <div><b>Q</b> телефон · phone</div>
            <div><b>F</b> фонарик · phone light</div>
            <div><b>Esc</b> пауза · pause</div>
            <div class="sep"></div>
            <button data-a="back">Назад<span class="sub">Back</span></button>
          </div>
        </div>`
    }
    this.root.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => this.action(b.dataset.a)))
    this.root.querySelectorAll('[data-k]').forEach(inp => {
      const k = inp.dataset.k
      const apply = () => {
        let v
        if (inp.type === 'checkbox') v = inp.checked
        else if (inp.tagName === 'SELECT') v = inp.value
        else v = parseFloat(inp.value)
        s[k] = v
        this.game.applySettings?.(s)
        saveSettings(s)
      }
      inp.addEventListener('input', apply)
      inp.addEventListener('change', apply)
    })
  }

  action(a) {
    if (a === 'close') this.close()
    else if (a === 'settings') { this.page = 'settings'; this.render() }
    else if (a === 'controls') { this.page = 'controls'; this.render() }
    else if (a === 'back') { this.page = 'main'; this.render() }
    else if (a === 'restart') { this.game.respawn?.(); this.close() }
  }
}
