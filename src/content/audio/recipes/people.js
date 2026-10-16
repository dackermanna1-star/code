// People: janitors, unseen walkers, voices at counters and kiosks, PA announcements, breathing,
// kids on the sledding hill, a far door.

import { def } from '../registry.js'
import { speak, laughInto } from '../speech.js'
import { filt, addBurst, addModes, buf, thump, crunch, Biquad, TAU, echoes, distant, paHorn, smooth, squeak } from './lib.js'
import { Wander, diffuse, mixInto } from '../dsp.js'

const peakNorm = d => { let p = 0; for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i])); if (p) for (let i = 0; i < d.length; i++) d[i] /= p; return d }

// ---- janitor's scraper ------------------------------------------------------------------------

def('snow_shovel', {
  // v0-2: steel scraper / pusher on asphalt; v3: plywood shovel + knocking it clean
  sr: 16000, variants: 4, prio: 5, norm: { peak: 0.85 }, maxDur: 5,
  gen(r, sr, v) {
    const push = r.range(1.5, 2.8)
    const d = buf(push + 1.6, sr)
    const steel = v < 3
    const bp = new Biquad(sr, 'bp', steel ? 1800 : 900, steel ? 0.9 : 0.8)
    const snow = new Biquad(sr, 'lp', 900, 0.7)
    const w = new Wander(r, sr, 3), wf = new Wander(r, sr, 1.2)
    const gritRate = r.range(20, 60)
    let gp = 0
    const n = Math.floor(push * sr)
    const off = Math.floor(0.05 * sr)
    for (let i = 0; i < n; i++) {
      const t = i / sr, u = t / push
      if ((i & 31) === 0) bp.set('bp', (steel ? 1800 : 900) * (1 + 0.3 * wf.next()), steel ? 0.9 : 0.8)
      gp += (gritRate * (1 + 0.5 * w.next())) / sr
      let g = 0.35 + 0.65 * Math.max(0, w.next())
      if (gp >= 1) { gp -= 1; g += 1.2 * r() }
      const env = smooth(t / 0.12) * smooth((push - t) / 0.18) * (0.75 + 0.25 * Math.sin(Math.PI * u))
      const nz = r.bi()
      d[off + i] += (bp.process(nz) * g * (steel ? 1 : 0.7) + snow.process(nz) * 0.6 * u) * env
    }
    if (steel) {
      // blade ring excited by the grit
      for (let k = 0; k < 6; k++) addModes(d, sr, off + Math.floor(r() * n), [[r.range(850, 1000), 0.05, 0.08], [r.range(2000, 2300), 0.03, 0.05]], 1, r)
      // end of the push: scraper lifted and set down
      addModes(d, sr, off + n + Math.floor(0.2 * sr), [[r.range(850, 1000), 0.25, 0.15], [r.range(2000, 2300), 0.15, 0.1], [r.range(3300, 3700), 0.06, 0.05]], 1, r)
      thump(d, sr, off + n + Math.floor(0.2 * sr), { f: 120, dur: 0.02, gain: 0.3 })
    } else {
      // hollow knocks to shed snow
      for (let k = 0; k < 2; k++) {
        const at = off + n + Math.floor((0.25 + k * 0.32) * sr)
        thump(d, sr, at, { f: 130, dur: 0.05, gain: 0.8 })
        addModes(d, sr, at, [[r.range(280, 340), 0.3, 0.1], [r.range(640, 720), 0.15, 0.06]], 1, r)
      }
    }
    // heard across a courtyard
    return distant(d, sr, 60, { taps: [[r.range(0.25, 0.35), 0.3], [r.range(0.55, 0.7), 0.15]] })
  },
})

// ---- unseen walkers ---------------------------------------------------------------------------

function snowStep(d, sr, off, r, g) {
  thump(d, sr, off, { f: r.range(70, 95), dur: 0.03, gain: 0.45 * g, attack: 0.008 })
  crunch(d, sr, off, r, { dur: r.range(0.18, 0.26), count: r.int(25, 40), fLo: 1000, fHi: 2600, gain: 0.85 * g })
  if (r.chance(0.5)) squeak(d, sr, off + Math.floor(0.04 * sr), r, { dur: 0.03, rate: 300, f: r.range(1600, 2400), q: 10, gain: 0.15 * g })
  crunch(d, sr, off + Math.floor(0.13 * sr), r, { dur: 0.08, count: 10, fLo: 1300, fHi: 2800, gain: 0.4 * g })
}

def('footsteps_phantom', {
  // someone else's steps in snow, receding into the dark (≈ 8–10 s)
  sr: 16000, variants: 2, prio: 5, norm: { peak: 0.85 }, maxDur: 11,
  gen(r, sr, v) {
    const steps = r.int(12, 18)
    const cad = r.range(0.5, 0.6)
    const d = buf(steps * cad + 1.0, sr)
    const lp = new Biquad(sr, 'lp', 6000, 0.6)
    const tmp = buf(d.length / sr, sr)
    const gains = []
    for (let k = 0; k < steps; k++) {
      const u = k / steps
      const g = (v === 1 ? Math.min(1, 0.4 + u * 2) * Math.pow(1 - u, 1.2) : Math.pow(1 - u, 1.6)) * (k % 2 ? 0.9 : 1)
      gains.push(g)
      snowStep(tmp, sr, Math.floor((0.03 + k * cad + r.range(-0.015, 0.015)) * sr), r, g)
    }
    const total = steps * cad
    for (let i = 0; i < d.length; i++) {
      if ((i & 31) === 0) lp.set('lp', 6000 * Math.pow(1500 / 6000, Math.min(1, i / sr / total)), 0.6)
      d[i] = lp.process(tmp[i])
    }
    return echoes(d, sr, [[0.27, 0.18], [0.55, 0.08]], 2000)
  },
})

def('footsteps_phantom_indoor', {
  // slippers shuffling towards a flat door from inside, then stopping (heard through the door)
  sr: 11025, variants: 2, prio: 6, norm: { peak: 0.8 }, maxDur: 6,
  gen(r, sr) {
    const steps = r.int(5, 8)
    const d = buf(steps * 0.62 + 1.2, sr)
    for (let k = 0; k < steps; k++) {
      const g = 0.35 + 0.65 * (k / (steps - 1))
      const at = Math.floor((0.05 + k * r.range(0.55, 0.68)) * sr)
      thump(d, sr, at, { f: r.range(70, 90), dur: 0.05, gain: 0.7 * g, attack: 0.01 })
      // slipper shuffle: a soft brushing slide
      const bp = new Biquad(sr, 'bp', r.range(900, 1400), 0.7)
      const n = Math.floor(r.range(0.12, 0.2) * sr)
      for (let i = 0; i < n; i++) { const u = i / n; d[at + i] += bp.process(r.bi()) * Math.sin(Math.PI * u) * 0.25 * g }
    }
    // a floorboard / the stop right behind the door
    thump(d, sr, Math.floor((0.05 + steps * 0.6) * sr), { f: 100, dur: 0.03, gain: 0.5 })
    return filt(d, sr, [['lp', 1200, 0.7], ['lp', 1600, 0.7]])
  },
})

// ---- voices at counters ---------------------------------------------------------------------

export const CASHIER_PHRASES = [
  { ru: 'Пакет нужен?', en: 'Do you need a bag?', text: 'Паке+т ну+жен?' },
  { ru: 'Что вам?', en: 'What would you like?', text: 'Что+ вам?' },
  { ru: 'Сорок семь рублей.', en: 'Forty-seven roubles.', text: 'Со+рок се+мь рубле+й.' },
  { ru: 'Без сдачи не будет?', en: "Haven't you got exact change?", text: 'Без сда+чи не бу+дет?' },
  { ru: 'Следующий!', en: 'Next!', text: 'Сле+дующий!' },
  { ru: 'Мелочь посмотрите.', en: 'Check for small change.', text: 'Ме+лочь посмотри+те.' },
  { ru: 'Хлеб свежий, утренний.', en: "The bread's fresh, from this morning.", text: 'Хлеб све+жий, у+тренний.' },
]
export const KIOSK_PHRASES = [
  { ru: 'Что вам?', en: 'What would you like?', text: 'Что+ вам?' },
  { ru: 'Сдачи нет.', en: 'No change.', text: 'Сда+чи не+т.' },
  { ru: 'Сто рублей.', en: 'A hundred roubles.', text: 'Сто+ рубле+й.' },
  { ru: 'Каких сигарет?', en: 'Which cigarettes?', text: 'Каки+х сигаре+т?' },
  { ru: 'Подождите минутку.', en: 'Wait a minute.', text: 'Подожди+те мину+тку.' },
  { ru: 'Пиво закончилось.', en: "We're out of beer.", text: 'Пи+во зако+нчилось.' },
]

def('cashier_voice', {
  sr: 11025, variants: CASHIER_PHRASES.length, prio: 5, norm: { peak: 0.8 }, maxDur: 3.5,
  gen(r, sr, v) {
    const s = peakNorm(speak(CASHIER_PHRASES[v].text, sr, { f0: 190, fs: 1.13, bw: 1.2, breath: 0.12, rate: 5.6, range: 1.15 }, r))
    const d = buf(s.length / sr + 0.6, sr)
    mixInto(d, s, Math.floor(0.03 * sr), 1)
    diffuse(d, sr, 0.5, 3000, 0.2)
    return filt(d, sr, [['lp', 2400, 0.7], ['hp', 140, 0.7]])
  },
})

def('kiosk_voice', {
  // through the little hatch of a ларёк: boxy, glassy, muffled
  sr: 11025, variants: KIOSK_PHRASES.length, prio: 5, norm: { peak: 0.8 }, maxDur: 3,
  gen(r, sr, v) {
    const ph = KIOSK_PHRASES[v]
    const male = v % 3 === 1
    const s = peakNorm(speak(ph.text, sr, male ? { f0: 105, fs: 0.98, bw: 1.1, breath: 0.08, rate: 5.0, range: 0.9 } : { f0: 200, fs: 1.15, bw: 1.2, breath: 0.1, rate: 5.4, range: 1 }, r))
    const d = buf(s.length / sr + 0.5, sr)
    mixInto(d, s, Math.floor(0.03 * sr), 1)
    return filt(d, sr, [['lp', 1500, 0.7], ['peak', 650, 3, 6], ['hp', 180, 0.7]])
  },
})

export const PA_PHRASES = [
  { ru: 'Граждане пассажиры, отойдите от края платформы!', en: 'Passengers, step back from the platform edge!', text: 'Гра+ждане пассажи+ры, отойди+те от кра+я платфо+рмы!', voice: 'male' },
  { ru: 'Поезд следует в депо. Посадки нет.', en: 'This train is going to the depot. No boarding.', text: 'По+езд сле+дует в депо+. Поса+дки не+т.', voice: 'female' },
  { ru: 'Уважаемые пассажиры, будьте взаимно вежливы, уступайте места инвалидам, пожилым людям и пассажирам с детьми.', en: 'Dear passengers, be polite to each other, give up seats to the disabled, the elderly and passengers with children.', text: 'Уважа+емые пассажи+ры, бу+дьте взаи+мно ве+жливы, уступа+йте места+ инвали+дам, пожилы+м лю+дям и пассажи+рам с детьми+.', voice: 'female' },
  { ru: 'Держитесь за поручень. Не бегите по эскалатору.', en: "Hold the handrail. Don't run on the escalator.", text: 'Держи+тесь за по+ручень. Не беги+те по эскала+тору.', voice: 'female' },
  { ru: 'Поезд дальше не идёт, просьба выйти из вагонов.', en: 'The train goes no further, please leave the cars.', text: 'По+езд да+льше не идё+т, про+сьба вы+йти из ваго+нов.', voice: 'male' },
  { ru: 'Уважаемые пассажиры, о подозрительных предметах сообщайте машинисту.', en: 'Dear passengers, report suspicious objects to the driver.', text: 'Уважа+емые пассажи+ры, о подозри+тельных предме+тах сообща+йте машини+сту.', voice: 'male' },
]

/** Render a PA-style announcement of arbitrary Russian text (used by the API for custom text). */
export function renderPA(text, sr, r, voice = 'female', { reverb = 0.3 } = {}) {
  const vo = voice === 'male' ? { f0: 110, fs: 1, bw: 1, breath: 0.03, rate: 4.8, range: 0.85 } : { f0: 195, fs: 1.15, bw: 1.1, breath: 0.06, rate: 5.0, range: 0.85 }
  const s = speak(text, sr, vo, r, { pauseScale: 1.3 })
  const d = buf(s.length / sr + 1.4, sr)
  mixInto(d, s, Math.floor(0.05 * sr), 1)
  paHorn(d, sr, 2.4)
  diffuse(d, sr, 1.6, 2500, reverb)
  return d
}

def('announcement', {
  sr: 11025, variants: PA_PHRASES.length, prio: 7, lazy: true, norm: { peak: 0.85 }, maxDur: 12,
  gen(r, sr, v) { return renderPA(PA_PHRASES[v].text, sr, r, PA_PHRASES[v].voice) },
})

// ---- the player's breath (silence events) --------------------------------------------------------

def('breath', {
  sr: 22050, variants: 5, prio: 2, norm: { peak: 0.6 },
  gen(r, sr, v) {
    const L = r.range(1.0, 1.6)
    const d = buf(L + 0.2, sr)
    const nose = v % 2 === 1
    const f1 = new Biquad(sr, 'bp', nose ? 2200 : r.range(900, 1300), nose ? 2 : 0.9)
    const f2 = new Biquad(sr, 'bp', nose ? 4200 : r.range(1900, 2500), 1.5)
    const lp = new Biquad(sr, 'lp', 350, 0.7)
    const w = new Wander(r, sr, 8)
    for (let i = 0; i < Math.floor(L * sr); i++) {
      const t = i / sr, u = t / L
      const e = smooth(Math.min(1, t / 0.14)) * Math.pow(1 - u, 1.4) * (1 + 0.15 * w.next())
      const nz = r.bi()
      d[i] = (f1.process(nz) * 0.9 + f2.process(nz) * 0.35 + lp.process(nz) * 0.4) * e
    }
    return filt(d, sr, [['hp', 150, 0.7], ['lp', 7000, 0.7]])
  },
})

// ---- kids on the sledding hill ---------------------------------------------------------------------

const KIDS = ['А-а-а-а!', 'Ма+ма, смотри+!', 'Моя+ о+чередь!', 'Ещё+ разо+к!', 'Дава+й быстре+й!', 'Ура+-а-а!']
def('kids_sledding', {
  sr: 16000, variants: 4, prio: 8, lazy: true, norm: { peak: 0.85 }, maxDur: 6,
  gen(r, sr, v) {
    const d = buf(5.5, sr)
    // plastic ледянка scraping down the hill
    const bp = new Biquad(sr, 'bp', 1200, 0.6)
    const s0 = r.range(0.2, 1.0), sl = r.range(2, 3.5)
    for (let i = 0; i < Math.floor(sl * sr); i++) {
      const t = i / sr, u = t / sl
      d[Math.floor(s0 * sr) + i] += bp.process(r.bi()) * 0.35 * smooth(u / 0.15) * Math.pow(1 - u, 1.5) * (0.7 + 0.3 * Math.sin(TAU * 11 * t))
    }
    const shouts = r.int(1, 3)
    for (let k = 0; k < shouts; k++) {
      const txt = k === 0 && v % 2 === 0 ? 'А-а-а-а!' : r.pick(KIDS)
      const s = peakNorm(speak(txt, sr, 'child', r, { f0: r.range(280, 360), range: 1.6, rate: 3.8 }))
      mixInto(d, s, Math.floor((s0 + k * r.range(0.9, 1.6)) * sr), r.range(0.6, 1))
    }
    if (r.chance(0.6)) laughInto(d, sr, Math.floor(r.range(2.5, 4) * sr), r, { f0: r.range(280, 350), dur: 1.0, gain: 0.35, fs: 1.3 })
    return distant(d, sr, 90, { taps: [[0.3, 0.3], [0.62, 0.15]] })
  },
})

// ---- a far entrance door ------------------------------------------------------------------------

def('distant_door_slam', {
  sr: 16000, variants: 3, prio: 4, norm: { peak: 0.85 },
  gen(r, sr) {
    const d = buf(2.6, sr)
    const at = Math.floor(0.02 * sr)
    const k = r.range(0.9, 1.1)
    addBurst(d, sr, at, 0.006, r, { type: 'lp', f: 3000, gain: 0.9, tau: 0.002 })
    addModes(d, sr, at, [[70 * k, 0.9, 0.9], [140 * k, 0.5, 0.7], [230 * k, 0.4, 0.55], [390 * k, 0.3, 0.45], [620 * k, 0.2, 0.35], [1040 * k, 0.12, 0.25]], 0.6, r)
    thump(d, sr, at, { f: 55, dur: 0.12, gain: 0.9 })
    addModes(d, sr, at + Math.floor(0.015 * sr), [[r.range(1700, 2100), 0.15, 0.04]], 1, r)
    // across the courtyard: dull, with the slapback between the slabs
    return distant(d, sr, r.range(70, 140), { taps: [[r.range(0.24, 0.33), 0.45], [r.range(0.5, 0.66), 0.25], [r.range(0.8, 0.95), 0.12]] })
  },
})

// ---- parametric speech (api.playSpeech): any Russian text through a chosen transmission chain ----
import { wall, phoneBand, cheapSpeaker } from './lib.js'
def('speech', {
  sr: 16000, param: true, lazy: true, prio: 9, norm: { peak: 0.85 },
  gen(r, sr, v, p) {
    const text = p?.text || 'Алло?'
    const chain = p?.chain || 'none'
    if (chain === 'pa') return renderPA(text, sr, r, p.voice === 'male' ? 'male' : 'female', { reverb: p.reverb ?? 0.3 })
    const s = peakNorm(speak(text, sr, p?.voice || 'male', r, { rate: p?.rate, f0: p?.f0 }))
    const d = buf(s.length / sr + 0.5, sr)
    mixInto(d, s, Math.floor(0.03 * sr), 1)
    if (chain === 'wall') { diffuse(d, sr, 0.5, 2500, 0.25); wall(d, sr, 420) } else if (chain === 'phone') phoneBand(d, sr, r, 0.003)
    else if (chain === 'radio') cheapSpeaker(d, sr, r, 1.6)
    else if (chain === 'muffled') filt(d, sr, [['lp', 1800, 0.7]])
    else diffuse(d, sr, 0.4, 4000, 0.15)
    return d
  },
})
