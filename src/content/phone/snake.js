// «Змейка» — classic candybar-phone Snake on the 96×68 LCD. Walls kill, food grows the snake,
// the pace slowly rises. High score is kept in localStorage (guarded).

const KEY = 'liminal-moscow-snake-best'
const CELL = 3
const FX = 3, FY = 11 // playfield origin (px)
const COLS = 30, ROWS = 18 // 90 × 54 px field

export function loadBest() {
  try { return parseInt(localStorage.getItem(KEY) || '0', 10) || 0 } catch { return 0 }
}
function saveBest(v) {
  try { localStorage.setItem(KEY, String(v)) } catch { /* storage unavailable */ }
}

export class Snake {
  constructor(seed = 1) {
    this.best = loadBest()
    this._seed = seed >>> 0 || 1
    this.reset()
  }

  _rand() {
    // xorshift: deterministic per session, varied per game
    let x = this._seed
    x ^= x << 13; x >>>= 0
    x ^= x >>> 17
    x ^= x << 5; x >>>= 0
    this._seed = x
    return x / 4294967296
  }

  reset() {
    this.body = [[8, 9], [7, 9], [6, 9], [5, 9], [4, 9]]
    this.dir = [1, 0]
    this.queue = []
    this.score = 0
    this.eaten = 0
    this.state = 'ready' // ready | play | over | paused
    this.timer = 0
    this.blink = 0
    this.newBest = false
    this._placeFood()
  }

  get stepTime() { return Math.max(0.075, 0.2 - this.eaten * 0.0045) }
  get level() { return Math.min(9, 1 + Math.floor(this.eaten / 5)) }

  _placeFood() {
    for (let tries = 0; tries < 200; tries++) {
      const x = Math.floor(this._rand() * COLS), y = Math.floor(this._rand() * ROWS)
      if (!this.body.some(([bx, by]) => bx === x && by === y)) { this.food = [x, y]; return }
    }
    this.food = [0, 0]
  }

  /** dir: 'up'|'down'|'left'|'right'. Returns true if consumed. */
  steer(d) {
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d]
    if (!v) return false
    if (this.state === 'ready') this.state = 'play'
    if (this.state !== 'play') return false
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir
    if (last[0] === -v[0] && last[1] === -v[1]) return true // no reversing
    if (last[0] === v[0] && last[1] === v[1]) return true
    if (this.queue.length < 3) this.queue.push(v)
    return true
  }

  /** Advance; returns an event string ('eat' | 'die' | null). */
  update(dt) {
    this.blink += dt
    if (this.state !== 'play') return null
    this.timer += dt
    let ev = null
    while (this.timer >= this.stepTime && this.state === 'play') {
      this.timer -= this.stepTime
      if (this.queue.length) this.dir = this.queue.shift()
      const [hx, hy] = this.body[0]
      const nx = hx + this.dir[0], ny = hy + this.dir[1]
      const hitsSelf = this.body.some(([bx, by], i) => i < this.body.length - 1 && bx === nx && by === ny)
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || hitsSelf) {
        this.state = 'over'
        this.blink = 0
        if (this.score > this.best) { this.best = this.score; this.newBest = true; saveBest(this.best) }
        return 'die'
      }
      this.body.unshift([nx, ny])
      if (nx === this.food[0] && ny === this.food[1]) {
        this.eaten++
        this.score += this.level
        this._placeFood()
        ev = 'eat'
      } else this.body.pop()
    }
    return ev
  }

  draw(lcd) {
    lcd.clear()
    // score bar
    lcd.text(String(this.score).padStart(4, '0'), 2, 0)
    lcd.text(`${this.level}`, 80, 0, { align: 'right' })
    lcd.icon('apple', 84, 3)
    // field frame
    lcd.rect(FX - 2, FY - 2, COLS * CELL + 3, ROWS * CELL + 3)
    // food: a little diamond
    const [fx, fy] = this.food
    const px = FX + fx * CELL, py = FY + fy * CELL
    lcd.set(px + 1, py); lcd.set(px, py + 1); lcd.set(px + 2, py + 1); lcd.set(px + 1, py + 2)
    // body: filled cells joined toward the previous segment, like the original
    const flash = this.state === 'over' && Math.floor(this.blink * 4) % 2 === 1
    if (!flash) {
      for (let i = 0; i < this.body.length; i++) {
        const [x, y] = this.body[i]
        const bx = FX + x * CELL, by = FY + y * CELL
        lcd.fillRect(bx, by, CELL - 1, CELL - 1)
        const prev = this.body[i - 1]
        if (prev) {
          const dx = prev[0] - x, dy = prev[1] - y
          if (dx === 1) lcd.vline(bx + 2, by, by + 1)
          if (dx === -1) lcd.vline(bx - 1, by, by + 1)
          if (dy === 1) lcd.hline(bx, bx + 1, by + 2)
          if (dy === -1) lcd.hline(bx, bx + 1, by - 1)
        }
      }
      // eye on the head
      const [hx, hy] = this.body[0]
      lcd.set(FX + hx * CELL + (this.dir[0] > 0 ? 1 : 0), FY + hy * CELL + (this.dir[1] > 0 ? 1 : 0), 0)
    }
    if (this.state === 'ready') {
      box(lcd, 'Змейка', 'Нажмите стрелку')
    } else if (this.state === 'paused') {
      box(lcd, 'Пауза', 'E — продолжить')
    } else if (this.state === 'over' && this.blink > 1.2) {
      box(lcd, 'Игра окончена', this.newBest ? `Рекорд! ${this.score}` : `Очки: ${this.score}  Рек.: ${this.best}`)
    }
  }
}

function box(lcd, a, b) {
  const w = Math.max(lcd.measure(a, 'bold'), lcd.measure(b)) + 8
  const x = Math.round(48 - w / 2), y = 24
  lcd.fillRect(x - 1, y - 1, w + 2, 26, 0)
  lcd.rect(x, y, w, 24)
  lcd.text(a, 48, y + 2, { font: 'bold', align: 'center' })
  lcd.text(b, 48, y + 12, { align: 'center' })
}

export const SNAKE_EN = {
  ready: 'Snake — press an arrow key to start',
  play: 'Snake — arrows/WASD to steer, Backspace to quit',
  paused: 'Paused — E to continue',
  over: 'Game over — E to play again',
}
