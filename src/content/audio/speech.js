// Formant speech synthesis with Russian phonotactics and intonation. Not intelligible on
// purpose — everything is heard through walls, PA horns, phone earpieces or distance — but the
// rhythm, vowel colours, stress and intonation contours (ИК-1 falling statements, ИК-3 rising
// questions/continuations) read as Russian speech. Pure JS (runs in the render worker).
//
//   speak(text, sr, voice, r) → Float32Array
//   text: Cyrillic; '+' after a vowel marks stress («осторо+жно»); punctuation shapes pauses/pitch.

import { Reso, SVF, Osc, Biquad, clamp, smooth, semis } from './dsp.js'

// Formants (Hz) for an adult male; female/child voices scale them.
const V = {
  'а': [720, 1240, 2550], 'о': [530, 860, 2400], 'у': [330, 720, 2300], 'ы': [370, 1520, 2400],
  'э': [540, 1720, 2500], 'и': [290, 2200, 2950], 'ə': [500, 1320, 2450], 'ɪ': [360, 1900, 2600],
}
const IOT = { 'я': 'а', 'е': 'э', 'ё': 'о', 'ю': 'у' }
const VOWEL_CHARS = 'аоуыэияеёю'

// consonant classes: kind, voiced, burst/fric centre, Q, nasal/liquid formants
const C = {
  'п': { k: 'plos', v: 0, f: 900, q: 0.7 }, 'б': { k: 'plos', v: 1, f: 700, q: 0.7 },
  'т': { k: 'plos', v: 0, f: 4200, q: 1.2 }, 'д': { k: 'plos', v: 1, f: 3200, q: 1.0 },
  'к': { k: 'plos', v: 0, f: 2000, q: 1.4 }, 'г': { k: 'plos', v: 1, f: 1800, q: 1.2 },
  'с': { k: 'fric', v: 0, f: 5600, q: 2.2, a: 0.55 }, 'з': { k: 'fric', v: 1, f: 5200, q: 2, a: 0.35 },
  'ш': { k: 'fric', v: 0, f: 2700, q: 1.6, a: 0.6 }, 'ж': { k: 'fric', v: 1, f: 2500, q: 1.5, a: 0.35 },
  'щ': { k: 'fric', v: 0, f: 3600, q: 1.8, a: 0.55, long: 1.5 }, 'ф': { k: 'fric', v: 0, f: 3000, q: 0.6, a: 0.2 },
  'в': { k: 'fric', v: 1, f: 2500, q: 0.6, a: 0.1, fm: [300, 1100, 2300] }, 'х': { k: 'fric', v: 0, f: 1500, q: 0.8, a: 0.3 },
  'ц': { k: 'affr', v: 0, f: 5400, q: 2, a: 0.5 }, 'ч': { k: 'affr', v: 0, f: 3300, q: 1.6, a: 0.55 },
  'м': { k: 'nas', v: 1, fm: [260, 1100, 2200] }, 'н': { k: 'nas', v: 1, fm: [260, 1500, 2400] },
  'л': { k: 'liq', v: 1, fm: [360, 1000, 2500] }, 'р': { k: 'trill', v: 1, fm: [460, 1300, 1750] },
  'й': { k: 'glide', v: 1, fm: [290, 2150, 2900] },
}

export const VOICES = {
  male: { f0: 118, fs: 1.0, bw: 1.0, breath: 0.05, rate: 5.2, range: 1 },
  anchor: { f0: 112, fs: 1.0, bw: 1.0, breath: 0.03, rate: 5.6, range: 1.15 },
  female: { f0: 205, fs: 1.17, bw: 1.15, breath: 0.1, rate: 5.4, range: 1.1 },
  child: { f0: 300, fs: 1.32, bw: 1.25, breath: 0.12, rate: 4.4, range: 1.4 },
  old: { f0: 175, fs: 1.12, bw: 1.3, breath: 0.16, rate: 4.2, range: 0.9, shimmer: 0.12 },
}

/** Parse text into words of phoneme segments with stress and phrase marks. */
function parse(text, r) {
  const out = [] // tokens: {word:[segs]} | {pause, kind}
  const toks = text.toLowerCase().replace(/ё/g, 'ё').match(/[а-яё+]+|[.,!?—…;:-]/g) || []
  for (const tk of toks) {
    if (!/[а-яё]/.test(tk)) {
      const kind = tk === ',' || tk === '—' || tk === '-' || tk === ';' || tk === ':' ? 'comma' : tk === '?' ? 'q' : tk === '!' ? 'ex' : 'stop'
      out.push({ pause: kind })
      continue
    }
    // vowels & stress
    const chars = []
    let stressAt = -1
    for (const ch of tk) {
      if (ch === '+') { stressAt = chars.length - 1; continue }
      chars.push(ch)
    }
    const vIdx = []
    chars.forEach((c, i) => { if (VOWEL_CHARS.includes(c)) vIdx.push(i) })
    if (stressAt < 0 || !VOWEL_CHARS.includes(chars[stressAt])) {
      if (chars.includes('ё')) stressAt = chars.indexOf('ё')
      else if (vIdx.length <= 1) stressAt = vIdx[0] ?? -1
      else {
        // deterministic pseudo-stress from the word itself, biased to the middle
        let h = 0
        for (const c of tk) h = (h * 31 + c.charCodeAt(0)) >>> 0
        const n = vIdx.length
        const pick = n === 2 ? (h % 3 === 0 ? 0 : 1) : 1 + (h % (n - 1))
        stressAt = vIdx[Math.min(n - 1, pick)]
      }
    }
    const segs = []
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i]
      if (ch === 'ь' || ch === 'ъ') { if (segs.length) segs[segs.length - 1].soft = true; continue }
      if (VOWEL_CHARS.includes(ch)) {
        const stressed = i === stressAt
        let base = IOT[ch] || ch
        const prevIsVowelOrStart = i === 0 || VOWEL_CHARS.includes(chars[i - 1]) || chars[i - 1] === 'ь' || chars[i - 1] === 'ъ'
        if (IOT[ch] && prevIsVowelOrStart) segs.push({ k: 'glide', v: 1, fm: [290, 2150, 2900], dur: 0.035 })
        if (!stressed) {
          if (base === 'о' || base === 'а') base = i < stressAt ? 'ə' : 'ə'
          else if (base === 'э' || (IOT[ch] && base === 'а')) base = 'ɪ'
        }
        const soft = !!IOT[ch] && !prevIsVowelOrStart
        segs.push({ k: 'V', fm: V[base], stressed, soft, base })
      } else if (C[ch]) {
        segs.push({ ...C[ch], ch })
      }
    }
    out.push({ word: segs })
  }
  return out
}

/**
 * Lay out segments on a timeline with durations, then synthesize.
 * voice: name or object {f0, fs, bw, breath, rate, range}; opts: {rate, f0, pitchJitter}
 */
export function speak(text, sr, voice = 'male', r, opts = {}) {
  const vo = typeof voice === 'string' ? VOICES[voice] || VOICES.male : voice
  const rate = (opts.rate ?? vo.rate) // syllables per second
  const syl = 1 / rate
  const toks = parse(text, r)
  // ---- timeline
  const segs = [] // {t0, dur, ...seg}
  let t = 0.08
  const phrases = [] // {t0, t1, kind, stresses:[t]}
  let cur = { t0: t, stresses: [] }
  const endPhrase = kind => {
    cur.t1 = t; cur.kind = kind
    if (cur.t1 > cur.t0 + 0.05) phrases.push(cur)
    cur = { t0: t, stresses: [] }
  }
  for (let wi = 0; wi < toks.length; wi++) {
    const tk = toks[wi]
    if (tk.pause) {
      const p = tk.pause === 'comma' ? r.range(0.12, 0.24) : r.range(0.38, 0.62)
      endPhrase(tk.pause)
      t += p * (opts.pauseScale ?? 1)
      cur.t0 = t
      continue
    }
    // final syllables of a phrase are lengthened
    const nextIsPause = !toks[wi + 1] || toks[wi + 1].pause
    for (let si = 0; si < tk.word.length; si++) {
      const s = tk.word[si]
      let d
      if (s.k === 'V') {
        d = syl * (s.stressed ? r.range(0.62, 0.78) : r.range(0.32, 0.42))
        if (nextIsPause && s.stressed) d *= 1.35
        if (nextIsPause && si >= tk.word.length - 2) d *= 1.2
        if (s.stressed) cur.stresses.push(t + d * 0.5)
      } else if (s.k === 'plos') d = syl * r.range(0.28, 0.36)
      else if (s.k === 'affr') d = syl * r.range(0.4, 0.5)
      else if (s.k === 'fric') d = syl * r.range(0.32, 0.42) * (s.long ?? 1)
      else if (s.k === 'trill') d = syl * r.range(0.3, 0.38)
      else if (s.k === 'glide') d = s.dur ?? syl * 0.15
      else d = syl * r.range(0.24, 0.32)
      segs.push({ ...s, t0: t, dur: d })
      t += d
    }
    t += r.range(0, 0.02) // word junction
  }
  endPhrase('stop')
  const total = t + 0.25
  const n = Math.ceil(total * sr)
  // ---- parameter target tracks
  const F1 = new Float32Array(n), F2 = new Float32Array(n), F3 = new Float32Array(n)
  const AV = new Float32Array(n), AF = new Float32Array(n), FF = new Float32Array(n), FQ = new Float32Array(n)
  const fs = vo.fs
  let lastF = V['ə']
  for (const s of segs) {
    const i0 = Math.floor(s.t0 * sr), i1 = Math.min(n, Math.floor((s.t0 + s.dur) * sr))
    let fm = s.fm || lastF, av = 0, af = 0, ff = s.f || 3000, fq = s.q || 1
    switch (s.k) {
      case 'V': av = s.stressed ? 1 : 0.72; lastF = fm; if (s.soft) fm = [fm[0], fm[1] + 250, fm[2]]; break
      case 'nas': av = 0.32; break
      case 'liq': av = 0.55; break
      case 'glide': av = 0.6; break
      case 'trill': av = 0.6; break
      case 'fric': av = s.v ? 0.28 : 0; af = s.a ?? 0.4; if (!s.fm) fm = lastF; break
      case 'affr': av = 0; af = s.a ?? 0.5; fm = lastF; break
      case 'plos': av = 0; af = 0; fm = lastF; break
    }
    for (let i = i0; i < i1; i++) {
      F1[i] = fm[0] * fs; F2[i] = fm[1] * fs; F3[i] = fm[2] * fs
      let a = av
      if (s.k === 'trill') { const ph = ((i - i0) / sr) * 26; a *= 0.45 + 0.55 * (0.5 + 0.5 * Math.cos(ph * Math.PI * 2)) }
      if (s.k === 'affr' && i - i0 < (i1 - i0) * 0.35) { a = 0; }
      AV[i] = a
      AF[i] = s.k === 'affr' && i - i0 < (i1 - i0) * 0.3 ? 0 : af
      FF[i] = ff; FQ[i] = fq
    }
    s.i0 = i0; s.i1 = i1
  }
  // fill gaps (pauses) with previous formants so smoothing doesn't swoop to zero
  let pf1 = V['ə'][0] * fs, pf2 = V['ə'][1] * fs, pf3 = V['ə'][2] * fs
  for (let i = 0; i < n; i++) {
    if (F1[i] === 0) { F1[i] = pf1; F2[i] = pf2; F3[i] = pf3; FF[i] = FF[i] || 3000; FQ[i] = FQ[i] || 1 } else { pf1 = F1[i]; pf2 = F2[i]; pf3 = F3[i] }
  }
  // smoothing (coarticulation): forward-backward one-pole
  const sm = (arr, tau) => {
    const a = Math.exp(-1 / (tau * sr))
    let y = arr[0]
    for (let i = 0; i < n; i++) { y = arr[i] + a * (y - arr[i]); arr[i] = y }
    y = arr[n - 1]
    for (let i = n - 1; i >= 0; i--) { y = arr[i] + a * (y - arr[i]); arr[i] = y }
  }
  sm(F1, 0.012); sm(F2, 0.016); sm(F3, 0.02); sm(AV, 0.006); sm(AF, 0.004); sm(FF, 0.01)
  // ---- f0 contour
  const F0 = new Float32Array(n)
  const base = (opts.f0 ?? vo.f0) * (opts.f0Mul ?? 1)
  const range = vo.range * (opts.range ?? 1)
  for (let i = 0; i < n; i++) F0[i] = base
  for (const ph of phrases) {
    const i0 = Math.floor(ph.t0 * sr), i1 = Math.min(n, Math.floor(ph.t1 * sr) + Math.floor(0.05 * sr))
    const len = Math.max(1, i1 - i0)
    const last = ph.stresses[ph.stresses.length - 1]
    for (let i = i0; i < i1; i++) {
      const tt = i / sr, u = (i - i0) / len
      let st = 1.5 - 3.2 * u * range // declination (semitones)
      for (const s of ph.stresses) {
        if (s === last) continue
        st += 2.6 * range * Math.exp(-((tt - s) ** 2) / (2 * 0.07 * 0.07))
      }
      if (last !== undefined) {
        const d = tt - last
        if (ph.kind === 'q') st += 6 * range * Math.exp(-(d * d) / (2 * 0.09 * 0.09)) - (d > 0.1 ? 3 * range * smooth((d - 0.1) / 0.25) : 0)
        else if (ph.kind === 'comma') st += (d > -0.05 ? 3.2 * range * smooth((d + 0.05) / 0.2) : 0)
        else if (ph.kind === 'ex') st += 3.5 * range * Math.exp(-((d + 0.03) ** 2) / (2 * 0.06 * 0.06)) - (d > 0 ? 6 * range * smooth(d / 0.22) : 0)
        else st += 1.8 * range * Math.exp(-((d + 0.06) ** 2) / (2 * 0.06 * 0.06)) - (d > -0.04 ? 6.5 * range * smooth((d + 0.04) / 0.26) : 0) // ИК-1 fall
      }
      F0[i] = base * semis(st)
    }
  }
  sm(F0, 0.025)
  // ---- synthesis
  const out = new Float32Array(n)
  const osc = new Osc(sr, r())
  const r1 = new Reso(sr), r2 = new Reso(sr), r3 = new Reso(sr), r4 = new Reso(sr, 3500 * fs, 250)
  const tilt = new Biquad(sr, 'lp', Math.min(sr * 0.45, 2400 * fs), 0.5)
  const fric = new SVF(sr, 3000, 1)
  const bw = vo.bw
  const breath = vo.breath
  let jit = 0, shim = 1
  const shimmerAmt = vo.shimmer ?? 0.05
  let lastPh = 0
  for (let i = 0; i < n; i++) {
    if ((i & 3) === 0) {
      r1.set(F1[i], 70 * bw); r2.set(F2[i], 95 * bw); r3.set(F3[i], 160 * bw)
      fric.set(FF[i], FQ[i])
    }
    const f0 = F0[i] * (1 + jit)
    const s = osc.saw(f0)
    if (osc.ph < lastPh) { jit = (r() - 0.5) * 0.02 * (opts.pitchJitter ?? 1); shim = 1 + (r() - 0.5) * shimmerAmt }
    lastPh = osc.ph
    const nz = r() * 2 - 1
    const asp = nz * breath * (osc.ph < 0.5 ? 1.4 : 0.4)
    const src = (tilt.process(-s) * shim + asp) * AV[i]
    let v = r3.process(r2.process(r1.process(src)))
    if (sr > 7600) v = r4.process(v) * 0.6 + v * 0.4
    fric.process(nz)
    v += fric.bpn * AF[i] * 0.55
    out[i] = v
  }
  // plosive bursts
  for (const s of segs) {
    if (s.k !== 'plos' && s.k !== 'affr') continue
    const at = s.k === 'plos' ? s.i0 + Math.floor((s.i1 - s.i0) * 0.75) : s.i0 + Math.floor((s.i1 - s.i0) * 0.3)
    const bq = new Biquad(sr, 'bp', Math.min(s.f, sr * 0.45), s.q)
    const len = Math.floor(0.012 * sr)
    for (let k = 0; k < len && at + k < n; k++) out[at + k] += bq.process(r() * 2 - 1) * Math.exp(-k / (0.003 * sr)) * (s.v ? 0.5 : 0.9)
  }
  return out
}

// ---- babble vocabulary -------------------------------------------------------------------

const NEWS = ('сего+дня в москве+ президе+нт заяви+л о том что прави+тельство ро+ссии подде+ржит ' +
  'програ+мму разви+тия реги+онов по да+нным мэ+рии го+рода в тече+ние неде+ли ожида+ется ' +
  'снегопа+д температу+ра во+здуха но+чью ми+нус пятна+дцать гра+дусов на доро+гах ' +
  'затрудне+ния движе+ния специали+сты коммуна+льных служб рабо+тают в уси+ленном режи+ме ' +
  'курс до+ллара соста+вил два+дцать четы+ре рубля+ на биржево+м ры+нке нефть пода+рожала ' +
  'встре+ча мини+стров состоя+лась в кремле+ обсужда+лись вопро+сы бюдже+та и пе+нсий ' +
  'жи+тели ра+йона жа+луются на отключе+ние горя+чей воды+ в домо+вом хозя+йстве ' +
  'футбо+льный клуб спарта+к сыгра+л вничью+ в ро+мбе новосте+й неде+ли').split(' ')
const TALK = ('ну я+ же говори+ла тебе+ а он что+ ну и+ пусть слу+шай а ты зна+ешь где+ она+ сейча+с ' +
  'да ла+дно не+ знаю мо+жет за+втра пото+м позвони+ ей ну давай пока+ хлеба+ купи+л ' +
  'опя+ть лифт не рабо+тает я ему+ сказа+ла что не на+до так а что+ тако+е вот и+менно ' +
  'ты где+ я уже+ подхожу+ ма+ма звони+ла сказа+ла приду+ в де+вять ну коне+чно').split(' ')

/** Pseudo-text for babble: real common words in a plausible order, with punctuation. */
export function babbleText(r, words = 30, register = 'news') {
  const voc = register === 'talk' ? TALK : NEWS
  let s = ''
  let inPhrase = 0
  const phraseLen = () => r.int(register === 'talk' ? 2 : 4, register === 'talk' ? 7 : 11)
  let target = phraseLen()
  for (let i = 0; i < words; i++) {
    s += r.pick(voc) + ' '
    inPhrase++
    if (inPhrase >= target) {
      const p = r()
      s = s.trimEnd() + (register === 'talk' ? (p < 0.25 ? '? ' : p < 0.4 ? '! ' : p < 0.6 ? ', ' : '. ') : (p < 0.35 ? ', ' : '. '))
      inPhrase = 0
      target = phraseLen()
    }
  }
  return s.trimEnd() + '.'
}

/** Laugh: a burst of breathy 'ха-ха' pulses (one voice). Mixes into out at offset. */
export function laughInto(out, sr, off, r, { f0 = 160, dur = 1.4, gain = 1, fs = 1 } = {}) {
  const n = Math.floor(dur * sr)
  const osc = new Osc(sr, r())
  const f1 = new Reso(sr, 750 * fs, 120), f2 = new Reso(sr, 1250 * fs, 150)
  const rate = r.range(4.2, 5.8)
  for (let i = 0; i < n && off + i < out.length; i++) {
    const t = i / sr
    const syl = 0.5 - 0.5 * Math.cos(Math.PI * 2 * rate * t)
    const env = smooth(t / 0.1) * Math.exp(-t / (dur * 0.6)) * syl * syl
    const f = f0 * (1.25 - 0.35 * (t / dur)) * (1 + 0.04 * Math.sin(TAU_ * 6 * t))
    const src = osc.saw(f) * 0.6 + (r() * 2 - 1) * 0.7
    out[off + i] += f2.process(f1.process(src)) * env * gain
  }
}
const TAU_ = Math.PI * 2

/** Utility used by recipes: clamp-safe index. */
export const _clamp = clamp
