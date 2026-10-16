// Boot: quiet title screen → load the city → walk.
//
// URL parameters (useful for development and screenshots):
//   ?t=17:30          start time        ?weather=still|light|steady|heavy|clear|fog
//   ?x=..&z=..&yaw=.. spawn position     ?timescale=0  freeze the clock
//   ?shot=1           skip the title, auto-start without pointer lock (headless screenshots)
//   ?only=a,b         load only these content packages
//   ?viewer=model1,model2   model viewer (see src/game/Viewer.js)
//   ?stats=1          frame stats overlay   ?quality=low|medium|high

import { Game } from './game/Game.js'
import { runViewer } from './game/Viewer.js'
import './ui/ui.css'

const params = Object.fromEntries(new URLSearchParams(location.search))
const canvas = document.getElementById('game')

function bootScreen() {
  const b = document.createElement('div')
  b.className = 'boot'
  b.innerHTML = `
    <div class="t1">ЛИМИНАЛЬНАЯ МОСКВА</div>
    <div class="t2">ЗИМА · 2008</div>
    <div class="bar"><i></i></div>
    <div class="status"></div>
    <div class="start">НАЧАТЬ ПРОГУЛКУ</div>
    <div class="note">Наушники рекомендуются. · Headphones recommended.<br>WASD — идти · мышь — смотреть · E — действие · Q — телефон · Esc — пауза</div>
    <div class="err"></div>`
  document.body.appendChild(b)
  return {
    el: b,
    progress(f, label) {
      b.querySelector('.bar i').style.width = `${Math.round(f * 100)}%`
      b.querySelector('.status').textContent = label ? String(label) : ''
    },
    ready(onStart) {
      const s = b.querySelector('.start')
      s.classList.add('on')
      b.querySelector('.status').textContent = ''
      const go = () => {
        b.classList.add('gone')
        setTimeout(() => b.remove(), 1600)
        onStart()
      }
      s.addEventListener('click', go, { once: true })
    },
    error(msg) { b.querySelector('.err').textContent = msg },
  }
}

async function main() {
  if (params.viewer) return runViewer(canvas, params)
  const boot = params.shot ? null : bootScreen()
  const game = new Game(canvas, params)
  try {
    await game.init((f, label) => boot?.progress(f, label))
  } catch (e) {
    console.error(e)
    boot?.error(`Не удалось загрузить город.\n${e.message}`)
    window.__shotError = String(e && e.stack || e)
    return
  }
  if (params.shot) {
    game.start()
    let frames = parseInt(params.frames || '20', 10)
    const wait = () => {
      if (--frames <= 0) { window.__shotReady = true; return }
      requestAnimationFrame(wait)
    }
    requestAnimationFrame(wait)
  } else {
    game.preview()
    boot.el.classList.add('ready')
    boot.ready(() => game.start())
  }
}

main()
