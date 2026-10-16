// Keyboard + mouse input with pointer lock (falls back to click-drag looking when pointer
// lock is unavailable, e.g. inside sandboxed iframes).

export class Input {
  constructor(canvas) {
    this.canvas = canvas
    this.keys = new Set()
    this.pressed = new Set() // keys pressed this frame
    this.dx = 0
    this.dy = 0
    this.locked = false
    this.dragging = false
    this.lockSupported = 'pointerLockElement' in document
    this.lockFailed = false
    this.enabled = true
    this.onLockChange = null
    this.mouseDown = false
    this.clicked = false

    window.addEventListener('keydown', e => {
      if (e.repeat) return
      const k = e.code
      this.keys.add(k)
      this.pressed.add(k)
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(k)) e.preventDefault()
    })
    window.addEventListener('keyup', e => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas
      this.onLockChange?.(this.locked)
    })
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true })
    window.addEventListener('mousemove', e => {
      if (this.locked || this.dragging) {
        this.dx += e.movementX || 0
        this.dy += e.movementY || 0
      }
    })
    canvas.addEventListener('mousedown', e => {
      this.mouseDown = true
      this.clicked = true
      if (!this.locked && (this.lockFailed || !this.lockSupported)) this.dragging = true
    })
    window.addEventListener('mouseup', () => { this.mouseDown = false; this.dragging = false })
    // touch: drag to look, two-finger hold to walk
    let lastT = null
    canvas.addEventListener('touchstart', e => {
      lastT = e.touches[0]
      this.touchWalk = e.touches.length >= 2
    }, { passive: true })
    canvas.addEventListener('touchmove', e => {
      const t = e.touches[0]
      if (lastT) { this.dx += (t.clientX - lastT.clientX) * 1.5; this.dy += (t.clientY - lastT.clientY) * 1.5 }
      lastT = t
      this.touchWalk = e.touches.length >= 2
    }, { passive: true })
    canvas.addEventListener('touchend', e => { if (e.touches.length === 0) { lastT = null; this.touchWalk = false } }, { passive: true })
  }

  requestLock() {
    if (!this.lockSupported || this.lockFailed) return
    try {
      const r = this.canvas.requestPointerLock?.({ unadjustedMovement: false })
      if (r && r.catch) r.catch(() => { this.lockFailed = true })
    } catch {
      this.lockFailed = true
    }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock() }

  down(code) { return this.enabled && this.keys.has(code) }
  hit(code) { return this.enabled && this.pressed.has(code) }

  consumeMouse() {
    const d = [this.dx, this.dy]
    this.dx = 0; this.dy = 0
    return d
  }

  endFrame() {
    this.pressed.clear()
    this.clicked = false
  }
}
