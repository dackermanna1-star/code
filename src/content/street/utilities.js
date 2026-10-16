// Utilities & street equipment: MGTS-style payphone «ТАКСОФОН» (lift the receiver: dial tone,
// dial: «абонент недоступен»), a parody QIWI payment terminal with a lit screen, old coffee and
// snack vending machines, the blue «ПОЧТА» mailbox, the heating main (теплотрасса) on supports
// with tin-clad insulation and the snow melted off, manholes (with a steam marker), electrical
// cabinets, bollards, a billboard with floodlights, an advertising column, notice boards with
// readable tear-off notices.
// Convention: front = local +Z; pivot bottom-centre unless noted.

import { defineModel } from '../../core/models.js'
import { VoxelModel } from '../../core/VoxelModel.js'
import { M, rngFor, rustify, snowTop, put, seedInt, RNG, rotXZ, localToWorld, reg, angleAlong, getState, groundY, streak, speckle } from './lib.js'
import { drawPlate, drawPoster, posterBySeed, drawNotice, drawFlyer, signLocal, LOST_DOG } from './signs.js'
import { PLATES, NOTICES, TERMINAL_SCREEN, POSTERS, FLYERS } from './texts.js'
import { PLAIN_FONT, SIGN_FONT } from '../../render/Signs.js'
import './materials.js'

const small = { lods: [1], maxDistance: 120 }

// ---- payphone -----------------------------------------------------------------------------
function buildPayphone(offhook) {
  const m = new VoxelModel(4, 10, 3)
  const blue = M('street_plastic_blue'), grey = M('metal_gray')
  m.fill(1, 0, 0, 1, 4, 1, grey)
  m.fill(1, 4, 0, 2, 3, 2, grey)
  m.fill(1, 7, 0, 2, 1, 2, blue)
  m.fill(0, 4, 0, 1, 4, 3, blue); m.fill(3, 4, 0, 1, 4, 3, blue)
  m.fill(0, 8, 0, 4, 1, 3, blue)
  if (!offhook) m.set(1, 6, 2, M('plastic_dark'))
  m.set(2, 4, 2, M('metal_dark')) // coin/card tray
  rustify(m, rngFor('payphone'), [grey], 0.08)
  snowTop(m, { chance: 1, seed: 2 })
  return m
}
defineModel('street_payphone', () => buildPayphone(false), small)
defineModel('street_payphone_offhook', () => buildPayphone(true), small)
defineModel('street_payphone_handset', () => { const m = new VoxelModel(1, 1, 1); m.set(0, 0, 0, M('plastic_dark')); return m }, { lods: [1], maxDistance: 60, collide: false, contact: false })

function drawPayphonePanel(c, W, H) {
  c.fillStyle = '#7d8486'; c.fillRect(0, 0, W, H)
  c.fillStyle = '#9fb59a'; c.fillRect(W * 0.18, H * 0.06, W * 0.64, H * 0.12) // LCD
  c.fillStyle = '#26302a'; c.font = `${H * 0.07}px ${PLAIN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.fillText('ВСТАВЬТЕ КАРТУ', W / 2, H * 0.12)
  c.fillStyle = '#1d1f20'; c.fillRect(W * 0.3, H * 0.22, W * 0.4, H * 0.03) // card slot
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']
  keys.forEach((k, i) => {
    const x = W * (0.24 + (i % 3) * 0.19), y = H * (0.32 + Math.floor(i / 3) * 0.1)
    c.fillStyle = '#c9cbc6'; c.fillRect(x, y, W * 0.14, H * 0.075)
    c.fillStyle = '#222'; c.font = `bold ${H * 0.055}px ${PLAIN_FONT}`; c.fillText(k, x + W * 0.07, y + H * 0.04)
  })
  c.fillStyle = '#e8e6de'; c.fillRect(W * 0.08, H * 0.74, W * 0.84, H * 0.2)
  c.fillStyle = '#a3261f'; c.font = `bold ${H * 0.045}px ${PLAIN_FONT}`
  c.fillText('Экстренные службы', W / 2, H * 0.79)
  c.fillText('01, 02, 03 — бесплатно', W / 2, H * 0.85)
  c.fillStyle = '#333'; c.font = `${H * 0.035}px ${PLAIN_FONT}`
  c.fillText('Универсальная карта оплаты', W / 2, H * 0.91)
}

/**
 * Payphone on a short stand under a blue hood. E: lift the receiver ('payphone_dial' dial tone)
 * → dial ('phone_key' beeps, then 'phone_unavailable') → hang up. opts: { x, z, angle, offhook
 * (the handset hangs on its cord and sways, no one there), seed }
 */
export function placePayphone(ctx, opts) {
  const angle = opts.angle ?? 0
  const offhook = !!opts.offhook
  const p = put(ctx, offhook ? 'street_payphone_offhook' : 'street_payphone', { x: opts.x, z: opts.z, y: opts.y, angle, tag: 'payphone', seed: opts.seed })
  const y = p ? p.y : groundY(ctx, opts.x, opts.z)
  const o = { x: opts.x, z: opts.z, y, angle }
  if (ctx.signs) {
    signLocal(ctx, o, 0, 2.12, 0.385, { w: 0.95, h: 0.2, ppm: 120, draw: drawPlate([PLATES.payphone.ru], { bg: '#e6e6e0', color: '#2a4a78' }), aged: 0.25, seed: 1 })
    signLocal(ctx, o, 0, 1.38, 0.135, { w: 0.46, h: 0.72, ppm: 160, draw: drawPayphonePanel, aged: 0.35, seed: 2 })
  }
  const st = { o, stage: 0, emitter: null, timer: 0, handset: null }
  if (offhook) {
    const [hx, hz] = rotXZ(-0.2, 0.42, angle)
    st.handset = put(ctx, 'street_payphone_handset', { x: opts.x + hx, z: opts.z + hz, y: y + 0.72, angle, collide: false })
    st.hx = opts.x + hx; st.hz = opts.z + hz; st.hy = y + 0.72
    if (ctx.wires) ctx.wires.add([[opts.x + hx * 0.6, y + 1.55, opts.z + hz * 0.85], [opts.x + hx, y + 0.97, opts.z + hz]], { sag: 0.05, color: 0x161616, segments: 4 })
  }
  const state = getState(ctx)
  state.payphones.push(st)
  if (ctx.interactions) {
    const [ix, iz] = rotXZ(0, 0.25, angle)
    ctx.interactions.add({
      x: opts.x + ix, y: y + 1.45, z: opts.z + iz, size: [0.7, 0.9, 0.7], reach: 2.0, tag: 'payphone',
      prompt: () => st.stage === 0 ? { ru: 'Снять трубку', en: 'Lift the receiver' } : st.stage === 1 ? { ru: 'Набрать номер', en: 'Dial a number' } : { ru: 'Повесить трубку', en: 'Hang up' },
      onUse(game) {
        const audio = game.audio
        const play = (n, o2) => (audio?.ready && audio.has?.(n) ? audio.play(n, o2) : null)
        if (st.stage === 0) {
          st.emitter?.stop?.(0.05)
          st.emitter = play('payphone_dial', { gain: 0.35, bus: 'sfx', loop: true })
          st.stage = 1; st.timer = 0
        } else if (st.stage === 1) {
          st.emitter?.stop?.(0.02); st.emitter = null
          const call = st.call = (st.call ?? 0) + 1 // hanging up cancels the pending beeps
          for (let i = 0; i < 7; i++) setTimeout(() => { if (st.stage === 2 && st.call === call) play('phone_key', { gain: 0.3, bus: 'sfx' }) }, 140 + i * 210)
          setTimeout(() => { if (st.stage === 2 && st.call === call) st.emitter = play('phone_unavailable', { gain: 0.4, bus: 'sfx' }) }, 1900)
          game.ui?.say?.({ ru: '«Абонент недоступен или находится вне зоны действия сети».', en: '"The subscriber is unavailable or out of network coverage."' }, 5)
          st.stage = 2; st.timer = 0
        } else {
          st.emitter?.stop?.(0.05); st.emitter = null
          play('click', { gain: 0.5, bus: 'sfx' })
          st.stage = 0
        }
      },
    })
  }
  reg(ctx, 'payphones', { x: opts.x, z: opts.z, angle, offhook })
  return { placement: p, state: st }
}

export function updatePayphones(ctx, dt, state, cam) {
  const t = state.time
  for (const st of state.payphones) {
    if (st.handset) {
      const sw = Math.sin(t * 1.9 + st.hx) * 0.025 + Math.sin(t * 0.7) * 0.012
      // local (sw, 0) rotated by the payphone angle (no per-frame allocation)
      const a = st.o.angle
      st.handset.set(st.hx + sw * Math.cos(a), st.hy, st.hz - sw * Math.sin(a), a + sw * 3)
    }
    if (st.stage !== 0) {
      st.timer += dt
      const dx = st.o.x - cam.x, dz = st.o.z - cam.z
      // walked away or left it ringing too long: the receiver goes back (sound stops)
      if (dx * dx + dz * dz > 9 || st.timer > 40) { st.emitter?.stop?.(0.1); st.emitter = null; st.stage = 0 }
    }
  }
}

// ---- payment terminal ---------------------------------------------------------------------
defineModel('street_terminal', () => {
  const m = new VoxelModel(2, 8, 2)
  const o = M('street_paint_orange'), g = M('metal_gray')
  m.fill(0, 0, 0, 2, 1, 2, M('metal_dark'))
  m.fill(0, 1, 0, 2, 3, 2, g)
  m.fill(0, 4, 0, 2, 3, 2, o)
  m.fill(0, 4, 1, 2, 2, 1, M('street_screen'))
  m.set(1, 3, 1, M('street_led_green')) // bill acceptor glow
  m.set(0, 3, 1, M('metal_dark')) // receipt slot
  rustify(m, rngFor('terminal'), [g], 0.06)
  snowTop(m, { chance: 1, seed: 3 })
  return m
}, small)

function drawTerminalScreen(c, W, H) {
  c.fillStyle = '#1d3c6a'; c.fillRect(0, 0, W, H)
  c.fillStyle = '#e88a2a'; c.fillRect(0, 0, W, H * 0.16)
  c.fillStyle = '#fff'; c.font = `bold ${H * 0.1}px ${SIGN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.fillText('МОМЕНТ-ПЛАТЁЖ', W / 2, H * 0.08)
  const tiles = ['Сотовая связь', 'Интернет', 'Коммерч. ТВ', 'Кредиты', 'ЖКХ', 'Другие']
  tiles.forEach((t, i) => {
    const x = W * (0.05 + (i % 2) * 0.47), y = H * (0.22 + Math.floor(i / 2) * 0.24)
    c.fillStyle = ['#e7a43a', '#4f9a5a', '#c84a3a', '#4a78c0', '#8a6ab0', '#6a8a9a'][i]; c.fillRect(x, y, W * 0.43, H * 0.2)
    c.fillStyle = '#fff'; c.font = `bold ${H * 0.065}px ${PLAIN_FONT}`; c.fillText(t, x + W * 0.215, y + H * 0.1)
  })
}

/** Payment terminal with a lit screen. opts: { x, z, angle, seed } */
export function placePaymentTerminal(ctx, opts) {
  const angle = opts.angle ?? 0
  const p = put(ctx, 'street_terminal', { x: opts.x, z: opts.z, y: opts.y, angle, tag: 'terminal' })
  const y = p ? p.y : groundY(ctx, opts.x, opts.z)
  const o = { x: opts.x, z: opts.z, y, angle }
  if (ctx.signs) {
    signLocal(ctx, o, 0, 1.25, 0.262, { w: 0.42, h: 0.42, ppm: 200, draw: drawTerminalScreen, emissive: 0.9, schedule: 'always' })
    signLocal(ctx, o, 0, 0.8, 0.262, { w: 0.42, h: 0.12, ppm: 200, draw: drawPlate(['Сдачу не выдаёт · Комиссия 0%*'], { bg: '#e2ded0', color: '#333', font: PLAIN_FONT }), aged: 0.3, seed: 5 })
  }
  const [lx, lz] = rotXZ(0, 0.5, angle)
  ctx.lights?.add({ x: opts.x + lx, y: y + 1.3, z: opts.z + lz, color: 0x9fc4ff, intensity: 1.4, range: 3.5, type: 'point', schedule: 'night', haloSize: 0.25, tag: 'screen' })
  if (ctx.interactions) {
    const [ix, iz] = rotXZ(0, 0.3, angle)
    ctx.interactions.add({ x: opts.x + ix, y: y + 1.25, z: opts.z + iz, size: [0.6, 0.6, 0.6], reach: 2, tag: 'terminal', prompt: { ru: 'Посмотреть на экран', en: 'Look at the screen' }, onUse(game) { game.audio?.ready && game.audio.has?.('click') && game.audio.play('click', { gain: 0.4 }); game.ui.showNote({ ru: TERMINAL_SCREEN.ru, en: TERMINAL_SCREEN.en, style: 'screen' }) } })
  }
  return p
}

// ---- vending machines -----------------------------------------------------------------------
defineModel('street_vending_coffee', () => {
  const m = new VoxelModel(3, 8, 3)
  const body = M('paint')
  m.fill(0, 0, 0, 3, 7, 3, body)
  m.fill(0, 3, 2, 3, 3, 1, M('plastic_dark')) // behind the lit front panel (the sign glows)
  m.clear(1, 1, 2, 1, 1, 1)
  m.set(1, 1, 1, M('metal_dark'))
  m.set(2, 2, 2, M('metal_gray'))
  rustify(m, rngFor('coffee'), [body], 0.06, { bottomBias: 3 })
  snowTop(m, { chance: 1, seed: 4 })
  return m
}, small)

defineModel('street_vending_snack', () => {
  const m = new VoxelModel(4, 8, 3)
  const body = M('paint')
  m.fill(0, 0, 0, 4, 7, 3, body)
  m.fill(0, 2, 2, 3, 4, 1, M('glass_clear'))
  // spiral rows of faded wrappers behind the glass, some spirals already empty
  const goods = [M('brick_red'), M('plaster_yellow'), M('tile_blue'), M('plastic_white'), M('wood'), M('tile_teal'), M('metal_dark'), M('metal_dark')]
  const rng = rngFor('snack')
  for (let y = 2; y < 6; y++) for (let x = 0; x < 3; x++) m.set(x, y, 1, rng.pick(goods))
  m.fill(3, 3, 2, 1, 2, 1, M('metal_gray'))
  m.set(3, 5, 2, M('street_screen'))
  m.fill(0, 1, 2, 3, 1, 1, M('metal_dark'))
  rustify(m, rng, [body], 0.05, { bottomBias: 3 })
  snowTop(m, { chance: 1, seed: 5 })
  return m
}, small)

function drawCoffeePanel(c, W, H) {
  const g = c.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#5a2a1a'); g.addColorStop(1, '#2a1410')
  c.fillStyle = g; c.fillRect(0, 0, W, H)
  c.fillStyle = '#f2e6d0'
  c.beginPath(); c.moveTo(W * 0.3, H * 0.42); c.lineTo(W * 0.7, H * 0.42); c.lineTo(W * 0.64, H * 0.82); c.lineTo(W * 0.36, H * 0.82); c.closePath(); c.fill()
  c.strokeStyle = '#f2e6d0'; c.lineWidth = W * 0.04; c.beginPath(); c.arc(W * 0.71, H * 0.6, W * 0.09, -1.2, 1.2); c.stroke()
  c.strokeStyle = 'rgba(240,230,210,0.6)'; c.lineWidth = W * 0.02
  for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(W * (0.4 + i * 0.1), H * 0.36); c.quadraticCurveTo(W * (0.45 + i * 0.1), H * 0.28, W * (0.4 + i * 0.1), H * 0.2); c.stroke() }
  c.fillStyle = '#f0d9a0'; c.font = `bold ${H * 0.1}px ${SIGN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.fillText('ГОРЯЧИЕ НАПИТКИ', W / 2, H * 0.09)
  c.font = `${H * 0.08}px ${PLAIN_FONT}`
  c.fillText('кофе · чай · шоколад — 20 р.', W / 2, H * 0.93)
}

/** Vending machine. opts: { x, z, angle, type: 'coffee'|'snack', tint, seed } */
export function placeVendingMachine(ctx, opts) {
  const angle = opts.angle ?? 0
  const type = opts.type === 'snack' ? 'snack' : 'coffee'
  const r = new RNG(seedInt(opts.seed, 9))
  const tint = opts.tint ?? (type === 'coffee' ? r.pick([0x5a2a22, 0x3a3a3e, 0x6a5a48]) : r.pick([0x34465e, 0x6e3330, 0x3a3a3e]))
  const p = put(ctx, `street_vending_${type}`, { x: opts.x, z: opts.z, y: opts.y, angle, tint, tag: 'vending' })
  const y = p ? p.y : groundY(ctx, opts.x, opts.z)
  const o = { x: opts.x, z: opts.z, y, angle }
  if (ctx.signs) {
    if (type === 'coffee') signLocal(ctx, o, 0, 1.12, 0.387, { w: 0.7, h: 0.72, ppm: 160, draw: drawCoffeePanel, emissive: 0.5, schedule: 'always', aged: 0.2, seed: 3 })
    else signLocal(ctx, o, 0, 1.62, 0.387, { w: 0.95, h: 0.16, ppm: 160, draw: drawPlate([PLATES.snacks.ru], { bg: '#d8d4c4', color: '#22305a' }), emissive: 0.4, schedule: 'always', aged: 0.3, seed: 4 })
  }
  const [lx, lz] = rotXZ(type === 'snack' ? -0.12 : 0, 0.6, angle)
  ctx.lights?.add({ x: opts.x + lx, y: y + 1.2, z: opts.z + lz, color: type === 'coffee' ? 0xffd8a0 : 0xe8f2ff, intensity: 0.9, range: 3.2, type: 'point', schedule: 'night', haloSize: 0.3, tag: 'vending' })
  if (ctx.interactions) {
    const [ix, iz] = rotXZ(0, 0.4, angle)
    let uses = 0
    ctx.interactions.add({
      x: opts.x + ix, y: y + 1.0, z: opts.z + iz, size: [0.8, 1.2, 0.6], reach: 2, tag: 'vending',
      prompt: type === 'coffee' ? { ru: 'Купить кофе — 20 р.', en: 'Buy a coffee, 20 rub' } : { ru: 'Посмотреть', en: 'Look' },
      onUse(game) {
        const a = game.audio
        if (a?.ready && a.has?.('click')) a.play('click', { gain: 0.5 })
        const lines = type === 'coffee'
          ? [{ ru: 'Автомат проглотил монету и затих.', en: 'The machine swallowed the coin and went quiet.' }, { ru: 'На табло: «НЕТ СТАКАНЧИКОВ».', en: 'The display says: "OUT OF CUPS".' }, { ru: 'Где-то внутри щёлкнуло реле. Больше ничего.', en: 'Somewhere inside a relay clicks. Nothing else.' }]
          : [{ ru: 'Сухарики «Хрустим», «Сникерс»-не-«Сникерс», жвачка. Купюроприёмник заклеен скотчем.', en: 'Rye croutons, a chocolate bar that is almost a Snickers, gum. The bill acceptor is taped over.' }]
        game.ui?.say?.(lines[uses++ % lines.length], 5)
      },
    })
  }
  return p
}

// ---- mailbox --------------------------------------------------------------------------------
defineModel('street_mailbox', () => {
  const m = new VoxelModel(2, 8, 2)
  const b = M('street_mail_blue')
  m.fill(0, 0, 0, 1, 6, 1, M('street_galvanized'))
  m.fill(0, 4, 1, 2, 2, 1, b)
  m.fill(0, 6, 1, 2, 1, 1, b)
  m.set(0, 5, 0, M('metal_dark')) // clamp
  rustify(m, rngFor('mailbox'), [b], 0.06)
  snowTop(m, { chance: 1, seed: 6 })
  m.setPivot(1, 0, 1)
  return m
}, small)
defineModel('street_mailbox_wall', () => {
  const m = new VoxelModel(2, 3, 1)
  const b = M('street_mail_blue')
  m.fill(0, 0, 0, 2, 2, 1, b)
  snowTop(m, { chance: 1, seed: 7 })
  m.setPivot(1, 0, 0)
  return m
}, small)

function drawMailFront(c, W, H) {
  c.fillStyle = '#2d4e78'; c.fillRect(0, 0, W, H)
  c.fillStyle = '#16263c'; c.fillRect(W * 0.2, H * 0.08, W * 0.6, H * 0.07) // letter slot
  c.fillStyle = '#e8e4d0'; c.font = `bold ${H * 0.2}px ${SIGN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.fillText(PLATES.mailbox.ru, W / 2, H * 0.34)
  c.fillStyle = '#e2e0d8'; c.fillRect(W * 0.18, H * 0.56, W * 0.64, H * 0.3)
  c.fillStyle = '#222'; c.font = `${H * 0.065}px ${PLAIN_FONT}`
  c.fillText('Выемка писем:', W / 2, H * 0.62); c.fillText('9.00, 15.00', W / 2, H * 0.71); c.fillText('кроме воскресенья', W / 2, H * 0.8)
}

/** Blue «ПОЧТА» mailbox on a post (or wall: x,z on the wall surface, y = bottom, default ground+1.1). */
export function placeMailbox(ctx, opts) {
  const angle = opts.angle ?? 0
  const wall = !!opts.wall
  const y0 = wall ? (opts.y ?? groundY(ctx, opts.x, opts.z) + 1.1) : opts.y
  const p = put(ctx, wall ? 'street_mailbox_wall' : 'street_mailbox', { x: opts.x, z: opts.z, y: y0, angle, tag: 'mailbox' })
  const y = p ? p.y : groundY(ctx, opts.x, opts.z)
  const o = { x: opts.x, z: opts.z, y, angle }
  const base = wall ? 0 : 1.0
  if (ctx.signs) signLocal(ctx, o, 0, base + 0.25, 0.262, { w: 0.46, h: 0.46, ppm: 200, draw: drawMailFront, aged: 0.25, seed: 1 })
  if (ctx.interactions) {
    const [ix, iz] = rotXZ(0, 0.3, angle)
    ctx.interactions.add({ x: opts.x + ix, y: y + base + 0.3, z: opts.z + iz, size: [0.5, 0.5, 0.5], reach: 2, tag: 'mailbox', prompt: { ru: 'Читать', en: 'Read' }, onUse(game) { game.ui.showNote({ ru: `${PLATES.mailbox.ru}\n${PLATES.mailboxTimes.ru}`, en: `${PLATES.mailbox.en}. ${PLATES.mailboxTimes.en}`, style: 'sign' }) } })
  }
  return p
}

// ---- heating main ---------------------------------------------------------------------------
function cladPipes(m, x0, x1, y, rng, zs = [0, 3]) {
  const tin = M('street_tin'), band = M('metal_gray')
  for (const z of zs) {
    m.fill(x0, y, z, x1 - x0, 2, 2, tin)
    for (let x = x0; x < x1; x += 4) m.fill(x, y, z, 1, 2, 2, band)
  }
  // torn cladding showing yellow glass wool, rust weeping at the bands
  for (let i = 0; i < 3; i++) {
    const x = rng.int(x0 + 1, x1 - 3), z = rng.pick(zs)
    m.fill(x, y + 1, z, 2, 1, 1 + rng.int(0, 1), M('street_glasswool'))
  }
  speckle(m, rng, [band], M('metal_rust'), 0.2)
}

function buildHeatPipe(kind) {
  if (kind === 'gate') {
    const m = new VoxelModel(20, 19, 5)
    const rng = rngFor('hpgate')
    cladPipes(m, 0, 20, 16, rng)
    for (const x0 of [0, 18]) for (const z of [0, 3]) m.fill(x0, 2, z, 2, 14, 2, M('street_tin'))
    for (const x of [2, 17]) { m.fill(x, 0, 2, 1, 16, 1, M('metal_dark')); m.fill(x, 15, 0, 1, 1, 5, M('metal_dark')) }
    for (const x0 of [0, 18]) m.fill(x0, 0, 0, 2, 2, 5, M('concrete'))
    rustify(m, rng, [M('metal_dark')], 0.25)
    m.addSnow({ mat: M('snow'), skip: new Set([M('street_tin'), M('metal_gray'), M('street_glasswool'), M('metal_rust')]), seed: 2 })
    return m
  }
  const low = kind === 'low'
  const m = new VoxelModel(20, low ? 4 : 5, 5)
  const rng = rngFor('hp' + kind)
  const y = low ? 1 : 2
  cladPipes(m, 0, 20, y, rng)
  for (const x of [2, 17]) {
    m.fill(x, 0, 0, 2, y, 5, M('concrete'))
    m.fill(x, y - 1, 2, 2, 1, 1, M('metal_dark'))
  }
  m.addSnow({ mat: M('snow'), skip: new Set([M('street_tin'), M('metal_gray'), M('street_glasswool'), M('metal_rust')]), seed: 3 })
  return m
}
defineModel('street_heatpipe', () => buildHeatPipe('raised'), { lods: [1, 2], lodDistances: [50], maxDistance: 220 })
defineModel('street_heatpipe_low', () => buildHeatPipe('low'), { lods: [1, 2], lodDistances: [50], maxDistance: 220 })
defineModel('street_heatpipe_gate', () => buildHeatPipe('gate'), { lods: [1, 2], lodDistances: [50], maxDistance: 260 })

/**
 * Heating main along a polyline: 5 m tin-clad double pipe segments on concrete supports, no snow
 * on top. opts: { points: [[x,z],...], type: 'raised'|'low', seed, melt=true (thawed strip painted
 * under it on snow terrain), steam (0..1 chance per joint of a steam marker, default 0.15) }
 * Returns placements; steam markers go to ctx.registry.steamVents.
 */
export function placeHeatPipe(ctx, opts) {
  const pts = opts.points || []
  const model = opts.type === 'low' ? 'street_heatpipe_low' : 'street_heatpipe'
  const seed = seedInt(opts.seed, 3)
  const rng = new RNG(seed)
  const out = []
  const snowMats = new Set(['snow', 'snow_fresh', 'snow_bank'].map(n => M(n)))
  for (let s = 0; s < pts.length - 1; s++) {
    const [x0, z0] = pts[s], [x1, z1] = pts[s + 1]
    const len = Math.hypot(x1 - x0, z1 - z0)
    if (len < 0.1) continue
    const n = Math.max(1, Math.ceil(len / 5 - 0.05))
    const ux = (x1 - x0) / len, uz = (z1 - z0) / len
    const angle = angleAlong(x1 - x0, z1 - z0)
    for (let i = 0; i < n; i++) {
      const t = Math.min(len - 2.5, 2.5 + i * 5)
      const x = x0 + ux * t, z = z0 + uz * t
      const p = put(ctx, model, { x, z, angle, tag: 'heatpipe', seed: seed + i })
      if (p) out.push(p)
      if (rng.chance(opts.steam ?? 0.15)) reg(ctx, 'steamVents', { x: x + ux * 2.5, y: (p ? p.y : 0) + (opts.type === 'low' ? 0.6 : 0.9), z: z + uz * 2.5, strength: rng.float(0.3, 0.7), kind: 'heatpipe' })
    }
    if (opts.melt !== false && ctx.terrain) {
      ctx.terrain.paintLine(x0, z0, x1, z1, 2.6, { mat: M('snow_dirty'), only: snowMats })
      ctx.terrain.paintLine(x0, z0, x1, z1, 1.2, { mat: M('earth'), only: new Set([M('snow_dirty')]) })
    }
  }
  reg(ctx, 'heatPipes', { points: pts, type: opts.type ?? 'raised' })
  return out
}

/** The П-shaped expansion loop lifting the pipes over a path (4 m clearance, 5 m span along local X). */
export function placeHeatPipeGate(ctx, o) { return put(ctx, 'street_heatpipe_gate', { ...o, tag: 'heatpipe' }) }

// ---- manholes --------------------------------------------------------------------------------
function buildManhole(wet) {
  const m = new VoxelModel(5, 1, 5)
  if (wet) for (let z = 0; z < 5; z++) for (let x = 0; x < 5; x++) if (!((x === 0 || x === 4) && (z === 0 || z === 4))) m.set(x, 0, z, M('asphalt_wet'))
  m.fill(1, 0, 1, 3, 1, 3, M('street_cast_iron'))
  m.set(2, 0, 2, M('metal_dark')); m.set(1, 0, 1, M('metal_rust')); m.set(3, 0, 3, M('metal_dark'))
  return m
}
defineModel('street_manhole', () => buildManhole(true), { lods: [1], maxDistance: 90, contact: false })
defineModel('street_manhole_plain', () => buildManhole(false), { lods: [1], maxDistance: 90, contact: false })

/**
 * Manhole cover set flush into the ground (top 5 cm proud). The wet variant has a thawed dark ring.
 * opts: { x, z, angle, wet=true, steam: false|true|0..1 (strength) }. Steam markers are pushed to
 * ctx.registry.steamVents ({x,y,z,strength,kind:'manhole'}) for the nature/layout packages.
 */
export function placeManhole(ctx, opts) {
  const gy = groundY(ctx, opts.x, opts.z)
  const p = put(ctx, opts.wet === false ? 'street_manhole_plain' : 'street_manhole', { x: opts.x, z: opts.z, y: (opts.y ?? gy) - 0.2, angle: opts.angle ?? 0, tag: 'manhole' })
  let steam = null
  if (opts.steam) {
    steam = { x: opts.x, y: (opts.y ?? gy) + 0.06, z: opts.z, strength: typeof opts.steam === 'number' ? opts.steam : 0.6, kind: 'manhole' }
    reg(ctx, 'steamVents', steam)
  }
  return { placement: p, steam }
}

// ---- electrical cabinet ------------------------------------------------------------------------
defineModel('street_elec_cabinet', () => {
  const m = new VoxelModel(4, 8, 2)
  const g = M('metal_gray')
  m.fill(0, 0, 0, 4, 1, 2, M('concrete_dark'))
  m.fill(0, 1, 0, 4, 5, 2, g)
  m.fill(0, 6, 0, 4, 1, 2, M('metal_dark'))
  m.fill(2, 1, 1, 1, 5, 1, M('metal_dark')) // door seam (front)
  m.set(1, 3, 1, M('metal_dark'))
  const rng = rngFor('cabinet')
  rustify(m, rng, [g], 0.1, { bottomBias: 2.5 })
  streak(m, 3, 5, 1, 3, M('street_rust_light'))
  snowTop(m, { chance: 1, seed: 8 })
  return m
}, small)

function drawDanger(c, W, H) {
  c.fillStyle = '#e8e6de'; c.fillRect(0, 0, W, H)
  c.strokeStyle = '#b3261e'; c.lineWidth = W * 0.05; c.strokeRect(W * 0.04, H * 0.04, W * 0.92, H * 0.92)
  c.fillStyle = '#1c1c1c'
  c.beginPath(); c.moveTo(W * 0.56, H * 0.1); c.lineTo(W * 0.36, H * 0.48); c.lineTo(W * 0.5, H * 0.48); c.lineTo(W * 0.4, H * 0.72); c.lineTo(W * 0.66, H * 0.36); c.lineTo(W * 0.52, H * 0.36); c.closePath(); c.fill()
  c.fillStyle = '#b3261e'; c.font = `bold ${H * 0.13}px ${SIGN_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.fillText('НЕ ВЛЕЗАЙ! УБЬЁТ!', W / 2, H * 0.85)
}

/** Grey electrical cabinet with a «НЕ ВЛЕЗАЙ! УБЬЁТ!» plate and flyers. opts: { x, z, angle, seed } */
export function placeElectricalCabinet(ctx, opts) {
  const angle = opts.angle ?? 0
  const rng = new RNG(seedInt(opts.seed ?? (opts.x * 7 + opts.z), 15))
  const p = put(ctx, 'street_elec_cabinet', { x: opts.x, z: opts.z, y: opts.y, angle, tag: 'cabinet' })
  const y = p ? p.y : groundY(ctx, opts.x, opts.z)
  const o = { x: opts.x, z: opts.z, y, angle }
  if (ctx.signs) {
    signLocal(ctx, o, -0.22, 1.22, 0.262, { w: 0.34, h: 0.26, ppm: 200, draw: drawDanger, aged: 0.35, seed: 3 })
    const n = rng.int(0, 2)
    for (let i = 0; i < n; i++) {
      const item = FLYERS[rng.int(0, FLYERS.length - 1)]
      signLocal(ctx, o, 0.25, 0.7 + i * 0.36, 0.262, { w: 0.19, h: 0.27, ppm: 220, draw: drawFlyer(item, rng.int(1, 9999)), aged: 0.5, seed: i })
    }
  }
  return p
}

// ---- bollards ------------------------------------------------------------------------------------
defineModel('street_bollard', () => {
  const m = new VoxelModel(1, 4, 1)
  m.set(0, 0, 0, M('street_paint_black')); m.set(0, 1, 0, M('street_paint_white')); m.set(0, 2, 0, M('street_paint_black'))
  snowTop(m, { chance: 1, seed: 1 })
  return m
}, { lods: [1], maxDistance: 90 })
defineModel('street_bollard_concrete', () => {
  const m = new VoxelModel(2, 3, 2)
  m.fill(0, 0, 0, 2, 2, 2, M('concrete'))
  m.set(0, 1, 0, M('concrete_dark'))
  snowTop(m, { chance: 1, seed: 2 })
  return m
}, { lods: [1], maxDistance: 90 })

/** A row of bollards from (x0,z0) to (x1,z1). opts: { spacing=1.6, type: 'post'|'concrete', missing } */
export function placeBollards(ctx, opts) {
  const dx = opts.x1 - opts.x0, dz = opts.z1 - opts.z0
  const len = Math.hypot(dx, dz)
  const n = Math.max(1, Math.floor(len / (opts.spacing ?? 1.6)) + 1)
  const rng = new RNG(seedInt(opts.seed, 4))
  const out = []
  for (let i = 0; i < n; i++) {
    if (rng.chance(opts.missing ?? 0.1)) continue
    const t = n === 1 ? 0.5 : i / (n - 1)
    out.push(put(ctx, opts.type === 'concrete' ? 'street_bollard_concrete' : 'street_bollard', { x: opts.x0 + dx * t, z: opts.z0 + dz * t, angle: angleAlong(dx, dz) + rng.float(-0.05, 0.05), tag: 'bollard' }))
  }
  return out.filter(Boolean)
}

// ---- billboard ------------------------------------------------------------------------------------
defineModel('street_billboard', () => {
  const m = new VoxelModel(24, 36, 7)
  const post = M('street_galvanized'), fr = M('metal_dark')
  m.fill(11, 0, 2, 2, 22, 2, post)
  m.fill(10, 0, 1, 4, 1, 4, M('concrete'))
  m.fill(0, 22, 2, 24, 12, 2, M('metal_gray'))
  for (const z of [1, 4]) {
    m.fill(0, 22, z, 24, 1, 1, fr); m.fill(0, 33, z, 24, 1, 1, fr)
    m.fill(0, 22, z, 1, 12, 1, fr); m.fill(23, 22, z, 1, 12, 1, fr)
  }
  m.fill(1, 21, 4, 22, 1, 2, fr) // catwalk
  for (const x of [5, 18]) { m.set(x, 34, 4, fr); m.set(x, 34, 5, fr); m.set(x, 34, 6, M('street_lamp_mercury')) }
  rustify(m, rngFor('billboard'), [post, fr], 0.08)
  snowTop(m, { chance: 0.9, seed: 9 })
  m.setPivot(12, 0, 3)
  return m
}, { lods: [1, 2], lodDistances: [80], maxDistance: 600 })

/**
 * Double-sided 6 × 3 m billboard on a single post with floodlights. opts: { x, z, angle (front),
 * ad: POSTERS id or item (front), adBack, seed, lit=true }
 */
export function placeBillboard(ctx, opts) {
  const angle = opts.angle ?? 0
  const seed = seedInt(opts.seed ?? (opts.x * 3 + opts.z), 33)
  const p = put(ctx, 'street_billboard', { x: opts.x, z: opts.z, y: opts.y, angle, tag: 'billboard', seed })
  const y = p ? p.y : groundY(ctx, opts.x, opts.z)
  const o = { x: opts.x, z: opts.z, y, angle }
  const ad = typeof opts.ad === 'string' ? POSTERS.find(q => q.id === opts.ad) : opts.ad ?? posterBySeed(seed)
  const adBack = typeof opts.adBack === 'string' ? POSTERS.find(q => q.id === opts.adBack) : opts.adBack ?? posterBySeed(seed + 3)
  if (ctx.signs) {
    signLocal(ctx, o, 0, 7.0, 0.26, { w: 5.5, h: 2.5, ppm: 48, draw: drawPoster(ad ?? POSTERS[0], seed), emissive: 0.25, schedule: 'street', aged: 0.2, seed })
    signLocal(ctx, o, 0, 7.0, -0.26, { w: 5.5, h: 2.5, ppm: 48, draw: drawPoster(adBack ?? POSTERS[1], seed + 3), emissive: 0.25, schedule: 'street', aged: 0.3, seed: seed + 3, flip: true })
  }
  if (opts.lit !== false && ctx.lights) {
    const [lx, lz] = rotXZ(0, 1.2, angle)
    const [dx, dz] = rotXZ(0, -0.45, angle)
    ctx.lights.add({ x: opts.x + lx, y: y + 8.6, z: opts.z + lz, color: 0xe8f0ff, intensity: 16, range: 9, type: 'spot', dir: [dx, -1, dz], cone: 55, inner: 30, schedule: 'street', placement: p, haloSize: 0.6, tag: 'billboard' })
  }
  return p
}

// ---- advertising column (афишная тумба) ---------------------------------------------------------
defineModel('street_ad_column', () => {
  const m = new VoxelModel(5, 13, 5)
  const corners = (x, z) => (x === 0 || x === 4) && (z === 0 || z === 4)
  for (let z = 0; z < 5; z++) for (let x = 0; x < 5; x++) {
    m.set(x, 0, z, M('concrete_dark'))
    if (!corners(x, z)) m.fill(x, 1, z, 1, 9, 1, M('street_paint_white'))
    m.set(x, 10, z, M('metal_green'))
  }
  m.fill(1, 11, 1, 3, 1, 3, M('metal_green'))
  m.set(2, 11, 2, M('metal_dark'))
  snowTop(m, { chance: 1, seed: 10 })
  return m
}, { lods: [1, 2], lodDistances: [50], maxDistance: 200 })

/** Advertising column with posters on four faces (concerts, civic, old torn ones). opts: { x, z, angle, seed } */
export function placeAdColumn(ctx, opts) {
  const angle = opts.angle ?? 0
  const seed = seedInt(opts.seed ?? (opts.x * 5 + opts.z * 2), 44)
  const rng = new RNG(seed)
  const p = put(ctx, 'street_ad_column', { x: opts.x, z: opts.z, y: opts.y, angle, tag: 'billboard', seed })
  const y = p ? p.y : groundY(ctx, opts.x, opts.z)
  const pool = ['disco', 'vetrov', 'family', 'newyear', 'election', 'credit', 'flats', 'evrosvyaz']
  for (let k = 0; k < 4 && ctx.signs; k++) {
    const a = angle + k * Math.PI / 2
    const [dx, dz] = rotXZ(0, 0.637, a)
    const id = pool[(rng.int(0, 99) + k) % pool.length]
    const item = POSTERS.find(q => q.id === id)
    ctx.signs.add({ x: opts.x + dx, y: y + 1.35, z: opts.z + dz, angle: a, w: 0.7, h: 1.05, ppm: 110, draw: drawPoster(item, seed + k), aged: 0.35 + rng.next() * 0.4, seed: seed + k })
    if (ctx.interactions) {
      const [ix, iz] = rotXZ(0, 0.75, a)
      ctx.interactions.add({ x: opts.x + ix, y: y + 1.35, z: opts.z + iz, size: [0.5, 1.0, 0.5], reach: 2, tag: 'readable', prompt: { ru: 'Смотреть афишу', en: 'Look at the poster' }, onUse(game) { game.ui.showNote({ ru: item.ru, en: item.en, style: 'sign' }) } })
    }
  }
  return p
}

// ---- notice boards -------------------------------------------------------------------------------
defineModel('street_notice_board', () => {
  const m = new VoxelModel(7, 10, 2)
  m.fill(0, 0, 0, 1, 8, 1, M('metal_dark')); m.fill(6, 0, 0, 1, 8, 1, M('metal_dark'))
  m.fill(1, 3, 0, 5, 5, 1, M('wood'))
  m.fill(0, 8, 0, 7, 1, 2, M('metal_green'))
  rustify(m, rngFor('noticeboard'), [M('metal_dark'), M('metal_green')], 0.15)
  snowTop(m, { chance: 1, seed: 11 })
  return m
}, small)
defineModel('street_notice_board_wall', () => {
  const m = new VoxelModel(6, 6, 1)
  m.fill(0, 0, 0, 6, 5, 1, M('metal_dark'))
  m.fill(1, 1, 0, 4, 3, 1, M('wood'))
  snowTop(m, { chance: 1, seed: 12 })
  m.setPivot(3, 0, 0)
  return m
}, small)

/**
 * «ИНФОРМАЦИЯ» notice board with readable notices (and sometimes the lost-dog flyer with a single
 * tab left). opts: { x, z, angle, wall=false (x,z on the wall surface; y = bottom, default ground+0.9),
 * seed, count, notices: [{ru,en}] override, lostDog: bool }
 */
export function placeNoticeBoard(ctx, opts) {
  const angle = opts.angle ?? 0
  const seed = seedInt(opts.seed ?? (opts.x * 9 + opts.z * 4), 55)
  const rng = new RNG(seed)
  const wall = !!opts.wall
  const y0 = wall ? (opts.y ?? groundY(ctx, opts.x, opts.z) + 0.9) : opts.y
  const p = put(ctx, wall ? 'street_notice_board_wall' : 'street_notice_board', { x: opts.x, z: opts.z, y: y0, angle, tag: 'notice', seed })
  const y = p ? p.y : groundY(ctx, opts.x, opts.z)
  const o = { x: opts.x, z: opts.z, y, angle }
  const fz = wall ? 0.262 : 0.012
  const boardY = wall ? 0.625 : 1.375, boardW = wall ? 1.0 : 1.25
  if (ctx.signs) signLocal(ctx, o, 0, boardY + (wall ? 0.56 : 0.5), fz, { w: 0.9, h: 0.14, ppm: 160, draw: drawPlate(['ИНФОРМАЦИЯ'], { bg: '#2f4f6a', color: '#e8e6dc' }), aged: 0.3, seed: 1 })
  const items = opts.notices ?? rng.shuffle(NOTICES.slice()).slice(0, opts.count ?? rng.int(2, 4))
  const lostDog = opts.lostDog ?? rng.chance(0.25)
  const list = items.map(n => ({ ...n, kind: 'notice' }))
  if (lostDog) list.push({ ...LOST_DOG, kind: 'lostdog' })
  const n = list.length
  list.forEach((it, i) => {
    const lx = (n === 1 ? 0 : -boardW / 2 + 0.2 + (i * (boardW - 0.4)) / (n - 1)) + rng.float(-0.04, 0.04)
    const ly = boardY - (wall ? 0 : 0.1) + rng.float(-0.1, 0.08)
    const lostdog = it.kind === 'lostdog'
    const w = lostdog ? 0.21 : 0.26, h = lostdog ? 0.3 : 0.34
    if (ctx.signs) signLocal(ctx, o, lx, ly, fz + i * 0.001, { w, h, ppm: 230, draw: lostdog ? drawFlyer(it, seed + i, 1) : drawNotice(it, seed + i), aged: 0.25 + rng.next() * 0.4, seed: seed + i })
    if (ctx.interactions) {
      const [dx, dz] = rotXZ(lx, fz + 0.1, angle)
      ctx.interactions.add({ x: opts.x + dx, y: y + ly, z: opts.z + dz, size: [0.26, 0.34, 0.26], reach: 2, tag: 'notice', prompt: { ru: 'Читать', en: 'Read' }, onUse(game) { game.ui.showNote({ ru: lostdog ? `${it.ru}\n\n${it.tab}` : it.ru, en: it.en, style: lostdog ? 'paper' : 'notice' }) } })
    }
  })
  reg(ctx, 'noticeBoards', { x: opts.x, z: opts.z, angle, lostDog })
  return p
}
