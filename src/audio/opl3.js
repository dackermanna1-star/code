// Pure-JS OPL3 (YMF262) FM synthesis core.
//
// Follows the hardware model used by Nuked OPL3 (the emulator Chocolate Doom
// and DOSBox-X use): integer log-sin / exp ROM lookups, a 9-bit envelope
// attenuation stepped by the chip's global envelope timer with the hardware
// rate/increment pattern, phase accumulators clocked at the native 49716 Hz,
// modulator self-feedback averaging the last two outputs, and linear
// interpolation from the native rate to the output rate. Rhythm mode and 4-op
// connections are not emulated: DMX never uses them.
//
// No DOM / WebAudio dependencies: runs on the main thread, in an
// AudioWorklet, or in Node.

export const OPL_RATE = 49716;

const ATTACK = 0;
const DECAY = 1;
const SUSTAIN = 2;
const RELEASE = 3;

const SILENT = 0x1ff;

// --- ROM tables ----------------------------------------------------------
// The log-sin and exp ROMs are reproduced exactly by these formulas
// (verified against the decapped OPL2/OPL3 ROM dumps).

const LOGSIN = new Uint16Array(256);
const EXPROM = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  LOGSIN[i] = Math.round(-Math.log2(Math.sin(((i + 0.5) * Math.PI) / 512)) * 256);
  EXPROM[i] = 1024 + Math.round((2 ** ((255 - i) / 256) - 1) * 1024);
}

// Attenuation (4.8 fixed point log2 units, 0..0x1fff) -> linear amplitude.
const EXP_TABLE = new Int16Array(0x2000);
for (let level = 0; level < 0x2000; level++) {
  EXP_TABLE[level] = (EXPROM[level & 0xff] << 1) >> (level >> 8);
}

// Eight waveforms x 1024 phase steps. Each entry is the log attenuation of
// that phase (0x1000 = silent half-wave) with bit 15 flagging a negative
// output. The chip negates with a one's complement, which we keep.
const WAVE_TABLE = new Uint16Array(8 * 1024);
for (let wf = 0; wf < 8; wf++) {
  for (let phase = 0; phase < 1024; phase++) {
    let out = 0;
    let neg = false;
    const quarter = (phase & 0x100) ? LOGSIN[(phase & 0xff) ^ 0xff] : LOGSIN[phase & 0xff];
    const double = (phase & 0x80) ? LOGSIN[((phase ^ 0xff) << 1) & 0xff] : LOGSIN[(phase << 1) & 0xff];
    switch (wf) {
      case 0: // sine
        neg = (phase & 0x200) !== 0;
        out = quarter;
        break;
      case 1: // half-sine
        out = (phase & 0x200) ? 0x1000 : quarter;
        break;
      case 2: // abs-sine
        out = quarter;
        break;
      case 3: // pulse-sine (quarter sine pulses)
        out = (phase & 0x100) ? 0x1000 : LOGSIN[phase & 0xff];
        break;
      case 4: // sine, even periods only
        neg = (phase & 0x300) === 0x100;
        out = (phase & 0x200) ? 0x1000 : double;
        break;
      case 5: // abs-sine, even periods only
        out = (phase & 0x200) ? 0x1000 : double;
        break;
      case 6: // square
        neg = (phase & 0x200) !== 0;
        out = 0;
        break;
      case 7: { // derived square (log-saw)
        let p = phase;
        if (p & 0x200) {
          neg = true;
          p = (p & 0x1ff) ^ 0x1ff;
        }
        out = p << 3;
        break;
      }
    }
    WAVE_TABLE[(wf << 10) | phase] = out | (neg ? 0x8000 : 0);
  }
}

// Frequency multiplier x2: 1/2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 12, 12, 15, 15.
const MULT = [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 20, 24, 24, 30, 30];

// Key scale level ROM (0.75 dB units per octave fraction) and the shift that
// maps the KSL register to 0 / 3 / 1.5 / 6 dB per octave.
const KSL_ROM = [0, 32, 40, 45, 48, 51, 53, 55, 56, 58, 59, 60, 61, 62, 63, 64];
const KSL_SHIFT = [8, 1, 2, 0];

// Envelope increment pattern for the fast rates (rate_lo x timer_lo).
const EG_INCSTEP = new Uint8Array([
  0, 0, 0, 0,
  1, 0, 0, 0,
  1, 0, 1, 0,
  1, 1, 1, 0,
]);

// Operator register offset (0x00-0x15) -> slot within a bank (-1: unused).
const AD_SLOT = [
  0, 1, 2, 3, 4, 5, -1, -1, 6, 7, 8, 9, 10, 11, -1, -1,
  12, 13, 14, 15, 16, 17, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
];
// First (modulator) slot of each channel; the carrier is slot + 3.
const CH_SLOT = [0, 1, 2, 6, 7, 8, 12, 13, 14, 18, 19, 20, 24, 25, 26, 30, 31, 32];

const WRITEBUF_SIZE = 1024;
const WRITEBUF_DELAY = 2;

// Output scaling from chip units (one full-scale operator is +-4084) to
// float. 1 / 32768 is the int16 scale Chocolate Doom outputs; the loudest
// shareware tracks peak near 13.4k chip units there (-8 dBFS), so the
// default is +6 dB on top. Peaks above the knee are softly limited.
export const DEFAULT_GAIN = 2 / 32768;
const KNEE = 0.8;
// Sound cards AC-couple their output; a 5 Hz one-pole high-pass removes the
// DC that the unipolar half-sine / abs-sine waveforms leave behind.
const DC_CUTOFF = 5;

class Slot {
  constructor() {
    this.channel = null;
    this.am = 0;
    this.vib = 0;
    this.egt = 0;
    this.ksr = 0;
    this.mt = MULT[0];
    this.ksl = 0;
    this.tl4 = 0;
    this.ar = 0;
    this.dr = 0;
    this.sl = 0;
    this.rr = 0;
    this.wfReg = 0;
    this.wfBase = 0;
    this.key = 0;
    this.egGen = RELEASE;
    this.egRout = SILENT;
    this.ks = 0;
    this.kslAtt = 0;
    this.inc = 0;
    this.phase = 0;
    this.out = 0;
    this.prout = 0;
  }
}

class Channel {
  constructor(index, mod, car) {
    this.index = index;
    this.mod = mod;
    this.car = car;
    this.fnum = 0;
    this.block = 0;
    this.ksv = 0;
    this.fb = 0;
    this.con = 0;
    this.c0 = 0;
    this.maskL = -1;
    this.maskR = -1;
  }
}

export class OPL3 {
  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
    this.gain = DEFAULT_GAIN;
    // Skip idle channels outright instead of running their phase: about
    // twice as fast, but no longer bit-exact (silent operators emit -1 on
    // negative half-waves, and feedback history freezes).
    this.skipIdle = false;
    this.dcBlock = true;
    this.slots = [];
    for (let i = 0; i < 36; i++) this.slots.push(new Slot());
    this.channels = [];
    for (let i = 0; i < 18; i++) {
      const base = CH_SLOT[i];
      const ch = new Channel(i, this.slots[base], this.slots[base + 3]);
      ch.mod.channel = ch;
      ch.car.channel = ch;
      this.channels.push(ch);
    }
    this.wbReg = new Uint16Array(WRITEBUF_SIZE);
    this.wbVal = new Uint8Array(WRITEBUF_SIZE);
    this.wbTime = new Float64Array(WRITEBUF_SIZE);
    this.wbPending = new Uint8Array(WRITEBUF_SIZE);
    this.reset();
  }

  reset() {
    for (const s of this.slots) {
      s.am = s.vib = s.egt = s.ksr = 0;
      s.mt = MULT[0];
      s.ksl = s.tl4 = s.ar = s.dr = s.sl = s.rr = 0;
      s.wfReg = s.wfBase = 0;
      s.key = 0;
      s.egGen = RELEASE;
      s.egRout = SILENT;
      s.ks = s.kslAtt = s.inc = s.phase = s.out = s.prout = 0;
    }
    for (const ch of this.channels) {
      ch.fnum = ch.block = ch.ksv = ch.fb = ch.con = ch.c0 = 0;
      ch.maskL = ch.maskR = -1;
    }
    this.newm = 0;
    this.wse = 0;
    this.nts = 0;
    this.conn4 = 0;
    this.timer = 0;
    this.egTimer = 0;
    this.egTimerRem = 0;
    this.egState = 0;
    this.egAdd = 0;
    this.egTimerLo = 0;
    this.vibpos = 0;
    this.vibshift = 1;
    this.tremolo = 0;
    this.tremolopos = 0;
    this.tremoloshift = 4;
    this.mixL = 0;
    this.mixR = 0;
    // Resampler state (linear interpolation, as OPL3_GenerateResampled).
    this.rsmStep = OPL_RATE / this.sampleRate;
    this.dcCoef = Math.exp((-2 * Math.PI * DC_CUTOFF) / this.sampleRate);
    this.dcxL = this.dcyL = this.dcxR = this.dcyR = 0;
    this.rsmT = 0;
    this.oldL = this.oldR = this.curL = this.curR = 0;
    // Register write buffer (OPL3_WriteRegBuffered semantics).
    this.wbPending.fill(0);
    this.wbCur = 0;
    this.wbLast = 0;
    this.wbLastTime = 0;
    this.sampleCnt = 0;
  }

  // --- Register interface --------------------------------------------------

  // Immediate register write. reg 0x000-0x0FF = bank 0, 0x100-0x1FF = bank 1.
  write(reg, value) {
    reg &= 0x1ff;
    const v = value & 0xff;
    const high = reg >> 8;
    const r = reg & 0xff;
    // With OPL3 mode off only the first register array is reachable.
    if (high && !this.newm && r !== 0x05 && r !== 0x04) return;

    switch (r & 0xf0) {
      case 0x00:
        if (high) {
          if (r === 0x04) this.conn4 = v & 0x3f; // 4-op connections: not emulated
          else if (r === 0x05) this.setNewMode(v & 1);
        } else if (r === 0x01) {
          this.wse = (v >> 5) & 1;
          for (const s of this.slots) this.updateWave(s);
        } else if (r === 0x08) {
          this.nts = (v >> 6) & 1;
          for (const ch of this.channels) this.updateFrequency(ch);
        }
        break;
      case 0x20:
      case 0x30: {
        const s = this.slotFor(high, r);
        if (s) {
          s.am = (v >> 7) & 1;
          s.vib = (v >> 6) & 1;
          s.egt = (v >> 5) & 1;
          s.ksr = (v >> 4) & 1;
          s.mt = MULT[v & 0x0f];
          this.updateSlotRates(s);
        }
        break;
      }
      case 0x40:
      case 0x50: {
        const s = this.slotFor(high, r);
        if (s) {
          s.ksl = (v >> 6) & 3;
          s.tl4 = (v & 0x3f) << 2;
          this.updateSlotRates(s);
        }
        break;
      }
      case 0x60:
      case 0x70: {
        const s = this.slotFor(high, r);
        if (s) {
          s.ar = v >> 4;
          s.dr = v & 0x0f;
        }
        break;
      }
      case 0x80:
      case 0x90: {
        const s = this.slotFor(high, r);
        if (s) {
          s.sl = v >> 4;
          if (s.sl === 0x0f) s.sl = 0x1f; // SL 15 = 93 dB
          s.rr = v & 0x0f;
        }
        break;
      }
      case 0xe0:
      case 0xf0: {
        const s = this.slotFor(high, r);
        if (s) {
          s.wfReg = v & 7;
          this.updateWave(s);
        }
        break;
      }
      case 0xa0:
        if ((r & 0x0f) < 9) {
          const ch = this.channels[high * 9 + (r & 0x0f)];
          ch.fnum = (ch.fnum & 0x300) | v;
          this.updateFrequency(ch);
        }
        break;
      case 0xb0:
        if (r === 0xbd) {
          if (!high) {
            this.tremoloshift = (((v >> 7) ^ 1) << 1) + 2; // 4.8 dB : 1 dB
            this.vibshift = ((v >> 6) & 1) ^ 1; // 14 cent : 7 cent
            // Rhythm mode bits are ignored.
          }
        } else if ((r & 0x0f) < 9) {
          const ch = this.channels[high * 9 + (r & 0x0f)];
          ch.fnum = (ch.fnum & 0xff) | ((v & 3) << 8);
          ch.block = (v >> 2) & 7;
          this.updateFrequency(ch);
          const key = (v >> 5) & 1;
          ch.mod.key = key;
          ch.car.key = key;
        }
        break;
      case 0xc0:
        if ((r & 0x0f) < 9) {
          const ch = this.channels[high * 9 + (r & 0x0f)];
          ch.c0 = v;
          ch.fb = (v & 0x0e) >> 1;
          ch.con = v & 1;
          this.updatePan(ch);
        }
        break;
      default:
        break;
    }
  }

  // Queue a write the way Chocolate Doom's OPL backend does: each write lands
  // at least two chip samples after the previous one, so a key-off followed
  // by a key-on is always seen by the envelope generator.
  writeBuffered(reg, value) {
    const last = this.wbLast;
    if (this.wbPending[last]) {
      // Buffer full: apply the oldest pending write now.
      this.wbPending[last] = 0;
      this.write(this.wbReg[last], this.wbVal[last]);
      this.wbCur = (last + 1) % WRITEBUF_SIZE;
    }
    this.wbReg[last] = reg & 0x1ff;
    this.wbVal[last] = value & 0xff;
    this.wbPending[last] = 1;
    let time = this.wbLastTime + WRITEBUF_DELAY;
    if (time < this.sampleCnt) time = this.sampleCnt;
    this.wbTime[last] = time;
    this.wbLastTime = time;
    this.wbLast = (last + 1) % WRITEBUF_SIZE;
  }

  // Apply every queued write immediately.
  flushWrites() {
    while (this.wbPending[this.wbCur]) {
      const i = this.wbCur;
      this.wbPending[i] = 0;
      this.write(this.wbReg[i], this.wbVal[i]);
      this.wbCur = (i + 1) % WRITEBUF_SIZE;
    }
  }

  slotFor(high, r) {
    const idx = AD_SLOT[r & 0x1f];
    return idx < 0 ? null : this.slots[high * 18 + idx];
  }

  setNewMode(newm) {
    this.newm = newm;
    for (const s of this.slots) this.updateWave(s);
    for (const ch of this.channels) this.updatePan(ch);
  }

  updateWave(s) {
    let wf = s.wfReg;
    if (!this.newm) wf = this.wse ? wf & 3 : 0;
    s.wfBase = wf << 10;
  }

  updatePan(ch) {
    if (this.newm) {
      ch.maskL = (ch.c0 & 0x10) ? -1 : 0;
      ch.maskR = (ch.c0 & 0x20) ? -1 : 0;
    } else {
      ch.maskL = ch.maskR = -1;
    }
  }

  updateFrequency(ch) {
    ch.ksv = (ch.block << 1) | ((ch.fnum >> (9 - this.nts)) & 1);
    this.updateSlotRates(ch.mod);
    this.updateSlotRates(ch.car);
  }

  // Recompute the cached key-scale rate, key-scale level and phase increment.
  updateSlotRates(s) {
    const ch = s.channel;
    s.ks = ch.ksv >> ((s.ksr ^ 1) << 1);
    let ksl = (KSL_ROM[ch.fnum >> 6] << 2) - ((8 - ch.block) << 5);
    if (ksl < 0) ksl = 0;
    s.kslAtt = ksl >> KSL_SHIFT[s.ksl];
    s.inc = (((ch.fnum << ch.block) >> 1) * s.mt) >> 1;
  }

  // --- Synthesis -----------------------------------------------------------

  // One operator for one chip sample: envelope, phase, then waveform output.
  slotStep(s, modIn) {
    // Envelope generator (OPL3_EnvelopeCalc).
    const rout0 = s.egRout;
    const egOut = rout0 + s.tl4 + s.kslAtt + (s.am ? this.tremolo : 0);
    const key = s.key;
    let gen = s.egGen;
    let reset = 0;
    let regRate;
    if (key && gen === RELEASE) {
      reset = 1;
      regRate = s.ar;
    } else if (gen === ATTACK) {
      regRate = s.ar;
    } else if (gen === DECAY) {
      regRate = s.dr;
    } else if (gen === SUSTAIN) {
      regRate = s.egt ? 0 : s.rr; // EGT=0: percussive, keeps releasing
    } else {
      regRate = s.rr;
    }
    let rateHi = 0;
    let shift = 0;
    if (regRate !== 0) {
      const rate = s.ks + (regRate << 2);
      const rateLo = rate & 3;
      rateHi = rate >> 2;
      if (rateHi & 0x10) rateHi = 0x0f;
      if (rateHi < 12) {
        if (this.egState) {
          const egShift = rateHi + this.egAdd;
          if (egShift === 12) shift = 1;
          else if (egShift === 13) shift = (rateLo >> 1) & 1;
          else if (egShift === 14) shift = rateLo & 1;
        }
      } else {
        shift = (rateHi & 3) + EG_INCSTEP[(rateLo << 2) | this.egTimerLo];
        if (shift & 4) shift = 3;
        if (!shift) shift = this.egState;
      }
    }
    let rout = rout0;
    let inc = 0;
    if (reset && rateHi === 0x0f) rout = 0; // instant attack
    const off = (rout0 & 0x1f8) === 0x1f8;
    if (gen !== ATTACK && !reset && off) rout = SILENT;
    if (gen === ATTACK) {
      if (rout0 === 0) gen = DECAY;
      else if (key && shift > 0 && rateHi !== 0x0f) inc = (~rout0) >> (4 - shift); // exponential attack
    } else if (gen === DECAY) {
      if ((rout0 >> 4) === s.sl) gen = SUSTAIN;
      else if (!off && !reset && shift > 0) inc = 1 << (shift - 1);
    } else if (!off && !reset && shift > 0) {
      inc = 1 << (shift - 1);
    }
    s.egRout = (rout + inc) & 0x1ff;
    if (reset) gen = ATTACK;
    if (!key) gen = RELEASE;
    s.egGen = gen;

    // Phase generator (OPL3_PhaseGenerate), with vibrato.
    let phaseInc = s.inc;
    if (s.vib) {
      const ch = s.channel;
      const vp = this.vibpos;
      let range = (ch.fnum >> 7) & 7;
      if (!(vp & 3)) range = 0;
      else if (vp & 1) range >>= 1;
      range >>= this.vibshift;
      if (vp & 4) range = -range;
      phaseInc = ((((ch.fnum + range) << ch.block) >> 1) * s.mt) >> 1;
    }
    const phaseOut = s.phase >> 9;
    if (reset) s.phase = 0;
    s.phase = (s.phase + phaseInc) & 0x7ffff;

    // Waveform lookup and exponentiation.
    const w = WAVE_TABLE[s.wfBase | ((phaseOut + modIn) & 0x3ff)];
    let level = (w & 0x1fff) + (egOut << 3);
    if (level > 0x1fff) level = 0x1fff;
    const v = EXP_TABLE[level];
    return (w & 0x8000) ? ~v : v;
  }

  // slotStep() for an operator whose envelope is idle at full attenuation.
  idleStep(s, modIn) {
    let phaseInc = s.inc;
    if (s.vib) {
      const ch = s.channel;
      const vp = this.vibpos;
      let range = (ch.fnum >> 7) & 7;
      if (!(vp & 3)) range = 0;
      else if (vp & 1) range >>= 1;
      range >>= this.vibshift;
      if (vp & 4) range = -range;
      phaseInc = ((((ch.fnum + range) << ch.block) >> 1) * s.mt) >> 1;
    }
    const phaseOut = s.phase >> 9;
    s.phase = (s.phase + phaseInc) & 0x7ffff;
    return (WAVE_TABLE[s.wfBase | ((phaseOut + modIn) & 0x3ff)] & 0x8000) ? -1 : 0;
  }

  // Advance the chip by one native sample (1 / 49716 s).
  clock() {
    let mixL = 0;
    let mixR = 0;
    const channels = this.channels;
    const n = this.newm ? 18 : 9;
    const skipIdle = this.skipIdle;
    for (let i = 0; i < n; i++) {
      const ch = channels[i];
      const m = ch.mod;
      const c = ch.car;
      const idle = m.key === 0 && c.key === 0 && m.egRout === SILENT && c.egRout === SILENT &&
        m.egGen === RELEASE && c.egGen === RELEASE;
      if (idle && skipIdle) continue;
      const fb = ch.fb;
      const fbmod = fb ? (m.prout + m.out) >> (9 - fb) : 0;
      m.prout = m.out;
      let mo;
      let co;
      if (idle) {
        // Envelopes are frozen at full attenuation: only the phase moves
        // and the output is 0 or -1 (one's complement of zero).
        mo = this.idleStep(m, fbmod);
        co = this.idleStep(c, ch.con ? 0 : mo);
      } else {
        mo = this.slotStep(m, fbmod);
        co = this.slotStep(c, ch.con ? 0 : mo);
      }
      m.out = mo;
      c.out = co;
      const acc = ch.con ? mo + co : co;
      mixL += acc & ch.maskL;
      mixR += acc & ch.maskR;
    }
    this.mixL = mixL;
    this.mixR = mixR;

    // Global LFOs and envelope timer.
    const timer = this.timer;
    if ((timer & 0x3f) === 0x3f) this.tremolopos = (this.tremolopos + 1) % 210;
    const tp = this.tremolopos;
    this.tremolo = (tp < 105 ? tp : 210 - tp) >> this.tremoloshift;
    if ((timer & 0x3ff) === 0x3ff) this.vibpos = (this.vibpos + 1) & 7;
    this.timer = (timer + 1) & 0xffff;

    if (this.egState) {
      const low = this.egTimer & 0x1fff;
      this.egAdd = low === 0 ? 0 : 32 - Math.clz32(low & -low);
      this.egTimerLo = this.egTimer & 3;
    }
    if (this.egTimerRem || this.egState) {
      if (this.egTimer >= 0xfffffffff) {
        this.egTimer = 0;
        this.egTimerRem = 1;
      } else {
        this.egTimer++;
        this.egTimerRem = 0;
      }
    }
    this.egState ^= 1;

    // Buffered register writes that are now due.
    while (this.wbPending[this.wbCur] && this.wbTime[this.wbCur] <= this.sampleCnt) {
      const i = this.wbCur;
      this.wbPending[i] = 0;
      this.write(this.wbReg[i], this.wbVal[i]);
      this.wbCur = (i + 1) % WRITEBUF_SIZE;
    }
    this.sampleCnt++;
  }

  // Render `count` stereo float samples at the output rate into
  // outL/outR[offset .. offset + count).
  generate(outL, outR, offset, count) {
    const step = this.rsmStep;
    const gain = this.gain;
    const dc = this.dcBlock ? this.dcCoef : 0;
    let t = this.rsmT;
    let oL = this.oldL;
    let oR = this.oldR;
    let cL = this.curL;
    let cR = this.curR;
    let xL = this.dcxL;
    let yL = this.dcyL;
    let xR = this.dcxR;
    let yR = this.dcyR;
    const end = offset + count;
    for (let i = offset; i < end; i++) {
      while (t >= 1) {
        oL = cL;
        oR = cR;
        this.clock();
        cL = this.mixL;
        cR = this.mixR;
        t -= 1;
      }
      // Linear interpolation between native samples (as Nuked's resampler).
      let l = oL + (cL - oL) * t;
      let r = oR + (cR - oR) * t;
      if (dc) {
        yL = l - xL + dc * yL;
        xL = l;
        yR = r - xR + dc * yR;
        xR = r;
        l = yL;
        r = yR;
      }
      l *= gain;
      r *= gain;
      if (l > KNEE || l < -KNEE) l = softClip(l);
      if (r > KNEE || r < -KNEE) r = softClip(r);
      outL[i] = l;
      outR[i] = r;
      t += step;
    }
    // Flush denormals once the filter has decayed in silence.
    if (yL < 1e-9 && yL > -1e-9) yL = 0;
    if (yR < 1e-9 && yR > -1e-9) yR = 0;
    this.rsmT = t;
    this.oldL = oL;
    this.oldR = oR;
    this.curL = cL;
    this.curR = cR;
    this.dcxL = xL;
    this.dcyL = yL;
    this.dcxR = xR;
    this.dcyR = yR;
  }

  // True when every channel is keyed off and fully decayed.
  isSilent() {
    for (const s of this.slots) {
      if (s.key || s.egRout !== SILENT) return false;
    }
    return true;
  }

  // Silent with no register writes queued: clocking the chip would produce
  // nothing but the +-1 LSB of idle operators.
  isIdle() {
    return !this.wbPending[this.wbCur] && this.isSilent();
  }

  // Output digital silence without clocking the chip. The DC blocker and
  // resampler history are cleared so the next generate() starts cleanly.
  generateSilence(outL, outR, offset, count) {
    outL.fill(0, offset, offset + count);
    outR.fill(0, offset, offset + count);
    this.oldL = this.oldR = this.curL = this.curR = 0;
    this.dcxL = this.dcyL = this.dcxR = this.dcyR = 0;
  }
}

// Gentle limiter above the knee, asymptotic to +-1.
function softClip(x) {
  const a = x < 0 ? -x : x;
  const y = KNEE + (1 - KNEE) * Math.tanh((a - KNEE) / (1 - KNEE));
  return x < 0 ? -y : y;
}
