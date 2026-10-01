// Character voices: speechSynthesis lines (with a caption callback that always
// fires, so subtitles work without TTS), a booming announcer, and short
// synthesized grunts (formant synthesis on JJK.Audio's SFX bus).
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const JJK = root.JJK;
  const U = JJK.U;
  const V = (JJK.Voice = {});
  const synth = root.speechSynthesis || null;
  const Utt = root.SpeechSynthesisUtterance || null;
  const settings = () => JJK.settings || {};
  const rr = (a, b) => a + Math.random() * (b - a);

  // ---------------------------------------------------------------- lines
  // en: caption + English TTS, ja: Japanese TTS (optional), say: TTS override.
  const LINES = {
    gojo: {
      intro: { en: "Don't worry. I'm the strongest.", ja: '大丈夫、僕最強だから' },
      blue: { en: 'Cursed Technique Lapse... Blue.', ja: '術式順転、蒼' },
      red: { en: 'Cursed Technique Reversal... Red.', ja: '術式反転、赫' },
      maxred: { en: 'Maximum output. Red.', ja: '出力最大、赫' },
      purple: { en: 'Imaginary Technique... Purple.', ja: '虚式、茈' },
      purple_chant: { en: 'Phase. Twilight. Eyes of Wisdom.', ja: '位相、黄昏、智慧の瞳' },
      domain: { en: 'Domain Expansion... Unlimited Void.', ja: '領域展開、無量空処' },
      lowhp: { en: "Nah, I'd win.", ja: 'ま、負けないよ' },
      win: { en: 'Throughout Heaven and Earth, I alone am the honored one.', ja: '天上天下唯我独尊' },
      taunt: { en: "You're pretty strong. Not as strong as me, though." },
      infinity: { en: 'Infinity.', ja: '無下限' },
      hurt_big: { en: 'Tch.', say: 'Tsk.' },
    },
    sukuna: {
      intro: { en: 'Know your place, fool.', ja: '身の程を弁えろ' },
      dismantle: { en: 'Dismantle.', ja: '解' },
      cleave: { en: 'Cleave.', ja: '捌' },
      fuga: { en: 'Fuga.', ja: '開', say: 'Fooga.' },
      wcs_1: { en: 'Dragon Scale.', ja: '龍鱗' },
      wcs_2: { en: 'Recoil.', ja: '反発' },
      wcs_3: { en: 'Twin Meteors.', ja: '番いの流星' },
      wcs: { en: 'World... Cutting... Slash.', ja: '世界を断つ斬撃' },
      domain: { en: 'Domain Expansion... Malevolent Shrine.', ja: '領域展開、伏魔御廚子' },
      lowhp: { en: 'Splendid... Satoru Gojo!' },
      win: { en: 'Stand proud. You were strong.', ja: '誇れ、お前は強い' },
      taunt: { en: 'Entertain me.' },
      da: { en: 'Domain Amplification.', ja: '領域展延' },
      hurt_big: { en: 'Hmph.', say: 'Hmph!' },
    },
  };
  const STYLE = {
    gojo: { pitch: 1.0, rate: 1.05 },
    sukuna: { pitch: 0.42, rate: 0.85 },
    announcer: { pitch: 0.2, rate: 0.8 },
  };
  const ANNOUNCE_SAY = { 'K.O.': 'K. O!', KO: 'K. O!', 'Fight!': 'Fight!' };

  // ---------------------------------------------------------------- captions
  const capFns = [];
  V.onCaption = function (fn) {
    if (typeof fn !== 'function') return () => {};
    capFns.push(fn);
    return () => V.offCaption(fn);
  };
  V.offCaption = function (fn) {
    const i = capFns.indexOf(fn);
    if (i >= 0) capFns.splice(i, 1);
  };
  function emit(charId, text, info) {
    for (let i = 0; i < capFns.length; i++) {
      try { capFns[i](charId, text, info); } catch (e) {}
    }
  }

  // ---------------------------------------------------------------- TTS
  let voices = [], cache = {};
  function loadVoices() {
    try { voices = (synth && synth.getVoices()) || []; } catch (e) { voices = []; }
    cache = {};
  }
  if (synth) {
    loadVoices();
    try { synth.addEventListener('voiceschanged', loadVoices); } catch (e) {
      try { synth.onvoiceschanged = loadVoices; } catch (e2) {}
    }
  }
  const MALE = /\b(male|david|daniel|alex|fred|guy|mark|george|james|ryan|aaron|arthur|thomas|oliver|rishi|gordon|lee|ichiro|keita|otoya|takumi|hattori|naoki)\b/i;
  const FEMALE = /\b(female|zira|samantha|victoria|karen|moira|tessa|fiona|susan|hazel|kyoko|haruka|ayumi|nanami|sayaka|mizuki|aria|jenny|sonia|libby|catherine|serena|allison|ava|nicky|kate)\b/i;
  const NOVELTY = /(bells|bubbles|bad news|good news|whisper|zarvox|trinoids|cellos|organ|boing|jester|superstar|wobble|albert|hysterical|deranged|bahh|junior|ralph|kathy|princess)/i;
  // Best voice for 'en' / 'ja' (prefers male, regional, local voices).
  function pickVoice(lang) {
    if (!synth) return null;
    if (Object.prototype.hasOwnProperty.call(cache, lang)) return cache[lang];
    if (!voices.length) loadVoices();
    let best = null, bs = -1e9;
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i], l = (v.lang || '').toLowerCase().replace('_', '-');
      if (l.indexOf(lang) !== 0) continue;
      let s = 0;
      if (l === 'en-us' || l === 'en-gb' || l === 'ja-jp') s += 2;
      if (MALE.test(v.name)) s += 3;
      if (FEMALE.test(v.name)) s -= 2;
      if (NOVELTY.test(v.name)) s -= 20;
      if (v.localService) s += 1;
      if (/natural|neural|premium|enhanced/i.test(v.name)) s += 1;
      if (s > bs) {
        bs = s;
        best = v;
      }
    }
    if (voices.length) cache[lang] = best;
    return best;
  }
  const tts = () => !!(synth && Utt);
  const now = () => (U && U.now ? U.now() : Date.now());

  // One utterance at a time is handed to the browser so a character's new line
  // can cancel only that character; other characters' lines wait (max 2.5s).
  let active = null;
  const queue = [];
  function speak(item) {
    item.t = now();
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].char === item.char) queue.splice(i, 1);
    if (active && (active.char === item.char || item.char === 'announcer')) {
      active = item;
      try { synth.cancel(); } catch (e) {}
      // Chrome can drop a speak() issued in the same tick as cancel()
      setTimeout(() => {
        if (active === item) start(item);
      }, 40);
    } else if (!active) start(item);
    else queue.push(item);
  }
  function start(item) {
    active = item;
    let u;
    try {
      u = new Utt(item.text);
      if (item.voice) u.voice = item.voice;
      u.lang = item.lang;
      u.pitch = item.pitch;
      u.rate = item.rate;
      u.volume = item.volume;
    } catch (e) {
      active = null;
      return;
    }
    item.u = u; // keep a reference (Chrome GC can swallow onend)
    const done = () => {
      if (active !== item) return;
      active = null;
      clearTimeout(item.wd);
      next();
    };
    u.onend = done;
    u.onerror = done;
    item.wd = setTimeout(done, 1800 + (item.text.length * 150) / item.rate);
    try {
      if (synth.paused) synth.resume();
      synth.speak(u);
    } catch (e) {
      done();
    }
  }
  function next() {
    while (queue.length) {
      const it = queue.shift();
      if (now() - it.t < 2500) {
        start(it);
        return;
      }
    }
  }
  function ttsVolume() {
    const s = settings().sfxVol;
    return U.clamp((s == null ? 0.8 : +s || 0) * 1.15, 0, 1);
  }

  // Say a character line. Returns false for unknown lines (e.g. gojo.teleport).
  V.say = function (charId, lineId) {
    const line = LINES[charId] && LINES[charId][lineId];
    if (!line) return false;
    const s = settings();
    const jaVoice = s.voiceLang === 'ja' && line.ja && tts() ? pickVoice('ja') : null;
    emit(charId, line.en, { id: lineId, en: line.en, ja: line.ja || null, lang: jaVoice ? 'ja' : 'en' });
    if (!tts() || s.voice === false) return true;
    const st = STYLE[charId];
    speak({
      char: charId,
      text: jaVoice ? line.ja : line.say || line.en,
      voice: jaVoice || pickVoice('en'),
      lang: jaVoice ? 'ja-JP' : 'en-US',
      pitch: st.pitch,
      rate: st.rate,
      volume: ttsVolume(),
    });
    return true;
  };

  // Deep, slow announcer ("Round One", "Fight!", "K.O.", ...). Takes priority.
  V.announce = function (text) {
    if (text == null || text === '') return;
    text = String(text);
    emit('announcer', text, { id: null, en: text, ja: null, lang: 'en' });
    if (!tts() || settings().voice === false) return;
    speak({
      char: 'announcer',
      text: ANNOUNCE_SAY[text] || text,
      voice: pickVoice('en'),
      lang: 'en-US',
      pitch: STYLE.announcer.pitch,
      rate: STYLE.announcer.rate,
      volume: Math.min(1, ttsVolume() * 1.2 + 0.1),
    });
  };

  // Silence all speech (pause menu, scene change).
  V.stop = function () {
    queue.length = 0;
    active = null;
    if (tts()) {
      try { synth.cancel(); } catch (e) {}
    }
  };

  V.lines = function () {
    const out = {};
    Object.keys(LINES).forEach((c) => (out[c] = Object.keys(LINES[c])));
    return out;
  };
  V.text = (charId, lineId) => (LINES[charId] && LINES[charId][lineId]) || null;

  // ---------------------------------------------------------------- grunts
  // Formant synthesis: glottal source (pitch contour + vibrato) and breath noise
  // through 3 parallel band-pass formants. Contours: f = f0 multiplier,
  // a = voicing amp, b = breath amp, v = vowel targets (glide between).
  const VOW = {
    a: [760, 1180, 2550], e: [520, 1780, 2500], i: [310, 2200, 2900], o: [520, 880, 2450],
    u: [360, 760, 2350], U: [620, 1080, 2450], h: [640, 1300, 2500],
  };
  const FQ = [6, 8, 10], FG = [1, 0.6, 0.32];
  const CHAR = {
    gojo: { f0: 172, fs: 1.04, rough: 0, breath: 0.32, vol: 1 },
    sukuna: { f0: 98, fs: 0.9, rough: 0.55, breath: 0.42, vol: 1.3 },
  };
  const GT = {
    light: { d: 0.17, f: [[0, 1.12], [0.17, 0.9]], a: [[0, 0], [0.025, 0], [0.045, 0.9], [0.1, 0.55], [0.17, 0]], b: [[0, 0], [0.008, 0.6], [0.04, 0.15], [0.17, 0]], v: [[0, 'h'], [0.045, 'a']] },
    medium: { d: 0.24, f: [[0, 1.2], [0.04, 1.32], [0.24, 0.92]], a: [[0, 0], [0.025, 0], [0.05, 1], [0.15, 0.7], [0.24, 0]], b: [[0, 0], [0.01, 0.7], [0.05, 0.2], [0.24, 0]], v: [[0, 'h'], [0.05, 'a']], strain: 0.3 },
    heavy: { d: 0.5, f: [[0, 1.1], [0.08, 1.5], [0.35, 1.38], [0.5, 0.95]], a: [[0, 0], [0.03, 0], [0.05, 0.7], [0.1, 1], [0.38, 0.85], [0.5, 0]], b: [[0, 0], [0.012, 0.6], [0.05, 0.15], [0.4, 0.08], [0.5, 0]], v: [[0, 'h'], [0.04, 'i'], [0.12, 'a']], strain: 1, vol: 1.1 },
    hurt: { d: 0.22, f: [[0, 1.25], [0.04, 1.35], [0.22, 0.85]], a: [[0, 0], [0.012, 1], [0.12, 0.7], [0.22, 0]], b: [[0, 0], [0.005, 0.3], [0.03, 0.08], [0.22, 0]], v: [[0, 'U'], [0.15, 'u']], strain: 0.5 },
    hurt_heavy: { d: 0.55, f: [[0, 1.4], [0.06, 1.7], [0.35, 1.35], [0.55, 0.85]], a: [[0, 0], [0.02, 1], [0.4, 0.75], [0.55, 0]], b: [[0, 0], [0.005, 0.3], [0.04, 0.1], [0.45, 0.15], [0.55, 0]], v: [[0, 'a'], [0.3, 'a'], [0.45, 'U']], strain: 1.2, vib: 7, vibD: 0.03, vol: 1.05 },
    ko: { d: 1.05, f: [[0, 1.5], [0.12, 1.65], [0.5, 1.2], [0.9, 0.75], [1.05, 0.6]], a: [[0, 0], [0.04, 1], [0.6, 0.8], [1.05, 0]], b: [[0, 0], [0.005, 0.2], [0.05, 0.1], [0.8, 0.25], [1.05, 0]], v: [[0, 'a'], [0.45, 'a'], [0.7, 'o'], [0.95, 'u']], strain: 1, vib: 6.5, vibD: 0.035 },
    effort: { d: 0.26, f: [[0, 1.0], [0.26, 0.85]], a: [[0, 0], [0.03, 0], [0.06, 0.35], [0.14, 0.1], [0.26, 0]], b: [[0, 0], [0.02, 0.9], [0.12, 0.5], [0.26, 0]], v: [[0, 'U']], vol: 0.9 },
  };
  // laugh: Sukuna "heh heh heh" (low, rough, slower); Gojo light "ha-ha-ha".
  function laughSpec(charId) {
    const sk = charId === 'sukuna', gap = sk ? 0.17 : 0.125;
    const f = [], a = [[0, 0]], b = [[0, 0]];
    for (let i = 0; i < 3; i++) {
      const t = i * gap, pm = sk ? [1.12, 1.02, 0.94][i] : [1.32, 1.26, 1.16][i];
      f.push([t, pm * 1.05], [t + 0.1, pm * 0.95]);
      b.push([t + 0.004, 0.7], [t + 0.03, 0.12], [t + 0.1, 0.02]);
      a.push([t + 0.025, 0], [t + 0.045, sk ? 0.9 : 0.75], [t + 0.095, sk ? 0.5 : 0.4], [t + 0.115, 0]);
    }
    return { d: 2 * gap + 0.14, f, a, b, v: [[0, sk ? 'e' : 'a']], vol: 0.9, strain: sk ? 0.4 : 0 };
  }
  const waves = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function glottal(c) {
    let w = waves && waves.get(c);
    if (w) return w;
    const n = 48, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = Math.pow(k, -1.2) * (k % 2 ? 1 : 0.85);
    w = c.createPeriodicWave(re, im);
    if (waves) waves.set(c, w);
    return w;
  }
  function gruntOn(E, charId, type, when) {
    const P = CHAR[charId], G = type === 'laugh' ? laughSpec(charId) : GT[type];
    const S = JJK.Audio && JJK.Audio._synth;
    if (!P || !G || !S) return null;
    const c = E.ctx;
    const k = rr(0.94, 1.06), fk = P.fs * rr(0.97, 1.03), tk = rr(0.92, 1.08), f0 = P.f0 * k;
    const v = S.voice(E, { when, vol: 0.3 * (G.vol || 1) * P.vol });
    v.verb(0.07);
    const dur = G.d * tk, t0 = v.t0, end = t0 + dur + 0.05;
    const ts = (pts, mul) => pts.map((p) => [p[0] * tk, p[1] * mul]);
    // formant bank
    const sum = c.createGain(), lp = c.createBiquadFilter(), bank = c.createGain();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;
    sum.connect(lp);
    lp.connect(v.out);
    for (let j = 0; j < 3; j++) {
      const bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = 'bandpass';
      bp.Q.value = FQ[j];
      g.gain.value = FG[j] * 3.2;
      S.setP(v, bp.frequency, G.v.map((p, i) => [p[0] * tk, VOW[p[1]][j] * fk, i ? 'l' : undefined]), 0, 1, v.nyq);
      bank.connect(bp);
      bp.connect(g);
      g.connect(sum);
    }
    // voiced source
    const osc = c.createOscillator(), vib = c.createOscillator(), vg = c.createGain(), amp = c.createGain();
    osc.setPeriodicWave(glottal(c));
    S.setP(v, osc.frequency, ts(G.f, f0), 0, 1, v.nyq);
    vib.frequency.value = (G.vib || 5.5) * rr(0.9, 1.1);
    vg.gain.value = f0 * (G.vibD || 0.012);
    vib.connect(vg);
    vg.connect(osc.frequency);
    amp.gain.value = 0;
    S.setP(v, amp.gain, ts(G.a, 1), 0, 1);
    const srcs = [osc, vib];
    let node = osc;
    if (G.strain || P.rough) {
      const ws = c.createWaveShaper();
      ws.curve = S.tanhCurve(1.5 + (G.strain || 0) * 2 + P.rough * 2);
      node.connect(ws);
      node = ws;
    }
    node.connect(amp);
    let vout = amp;
    if (P.rough) {
      // vocal-fry roughness: subharmonic amplitude modulation
      const rg = c.createGain(), sub = c.createOscillator(), sg = c.createGain();
      rg.gain.value = 1 - P.rough * 0.5;
      sub.frequency.value = f0 * 0.5;
      sg.gain.value = P.rough * 0.5;
      sub.connect(sg);
      sg.connect(rg.gain);
      amp.connect(rg);
      vout = rg;
      srcs.push(sub);
    }
    vout.connect(bank);
    // breath / aspiration
    const nz = c.createBufferSource(), hp = c.createBiquadFilter(), bg = c.createGain(), crisp = c.createBiquadFilter(), cg = c.createGain();
    nz.buffer = E.buf.white;
    nz.loop = true;
    hp.type = 'highpass';
    hp.frequency.value = 350;
    bg.gain.value = 0;
    S.setP(v, bg.gain, ts(G.b, P.breath), 0, 1);
    crisp.type = 'highpass';
    crisp.frequency.value = 2000;
    cg.gain.value = 0.25;
    nz.connect(hp); hp.connect(bg); bg.connect(bank);
    bg.connect(crisp); crisp.connect(cg); cg.connect(sum);
    srcs.forEach((s) => {
      s.start(t0);
      s.stop(end);
    });
    nz.start(t0, Math.random() * 1.5);
    nz.stop(end);
    S.mark(v, dur + 0.05);
    return S.finish(v);
  }
  V.grunt = function (charId, type) {
    if (settings().voice === false) return;
    const E = JJK.Audio && JJK.Audio._E;
    if (!E || E.ctx.state === 'closed') return;
    try { gruntOn(E, charId, type); } catch (e) {}
  };
  V.gruntTypes = ['light', 'medium', 'heavy', 'hurt', 'hurt_heavy', 'ko', 'effort', 'laugh'];

  // Offline render for analysis -> Promise<AudioBuffer|null>.
  V._renderGrunt = function (charId, type) {
    const o = JJK.Audio && JJK.Audio._offline ? JJK.Audio._offline(2, true) : null;
    if (!o) return Promise.resolve(null);
    gruntOn(o.E, charId, type, 0.01);
    return o.ctx.startRendering();
  };
})();
