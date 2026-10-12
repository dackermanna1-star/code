// Music lump parsing: DMX MUS and Standard MIDI Files, both normalized into
// one time-ordered event list:
//
//   { time /*seconds*/, type, channel, note?, velocity?, controller?, value? }
//
// type is one of 'noteOn', 'noteOff', 'program', 'controller', 'pitchBend',
// 'allNotesOff', 'allSoundsOff', 'resetControllers'. Channels use MIDI
// numbering (percussion = 9). Pitch bend values are 14-bit (8192 = centre).

export const MUS_TICK_RATE = 140;
export const MIDI_PERCUSSION_CHANNEL = 9;
const MUS_PERCUSSION_CHANNEL = 15;

// MUS controller numbers 1-9 -> MIDI controllers (0 is program change).
const MUS_CONTROLLERS = [-1, 0x20, 0x01, 0x07, 0x0a, 0x0b, 0x5b, 0x5d, 0x40, 0x43];

function ascii(bytes, offset, length) {
  let s = '';
  for (let i = 0; i < length && offset + i < bytes.length; i++) s += String.fromCharCode(bytes[offset + i]);
  return s;
}

export function musChannelToMidi(ch) {
  if (ch === MUS_PERCUSSION_CHANNEL) return MIDI_PERCUSSION_CHANNEL;
  return ch >= MIDI_PERCUSSION_CHANNEL ? ch + 1 : ch;
}

export function isMus(bytes) {
  return bytes.length >= 16 && ascii(bytes, 0, 4) === 'MUS\x1a';
}

export function isMidi(bytes) {
  return bytes.length >= 14 && (ascii(bytes, 0, 4) === 'MThd' || (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'RMID'));
}

// --- MUS -------------------------------------------------------------------

export function parseMus(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!isMus(bytes)) throw new Error('MUS: bad header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const scoreLen = view.getUint16(4, true);
  const scoreStart = view.getUint16(6, true);
  const header = {
    scoreLen,
    scoreStart,
    primaryChannels: view.getUint16(8, true),
    secondaryChannels: view.getUint16(10, true),
    instrumentCount: view.getUint16(12, true),
    instruments: [],
  };
  for (let i = 0; i < header.instrumentCount && 16 + i * 2 + 1 < bytes.length; i++) {
    header.instruments.push(view.getUint16(16 + i * 2, true));
  }

  // Last note volume per MUS channel; mus2mid starts every channel at 127.
  const lastVolume = new Uint8Array(16).fill(127);
  const events = [];
  const end = bytes.length;
  let p = scoreStart;
  let ticks = 0;
  let done = false;

  while (!done && p < end) {
    const desc = bytes[p++];
    const type = (desc >> 4) & 7;
    const musCh = desc & 0x0f;
    const channel = musChannelToMidi(musCh);
    const time = ticks / MUS_TICK_RATE;

    switch (type) {
      case 0: { // release note
        const note = bytes[p++] & 0x7f;
        events.push({ time, type: 'noteOff', channel, note });
        break;
      }
      case 1: { // play note
        const b = bytes[p++];
        if (b & 0x80) lastVolume[musCh] = bytes[p++] & 0x7f;
        events.push({ time, type: 'noteOn', channel, note: b & 0x7f, velocity: lastVolume[musCh] });
        break;
      }
      case 2: { // pitch bend: 8-bit, 128 = centre -> 14-bit like mus2mid
        const v = bytes[p++];
        events.push({ time, type: 'pitchBend', channel, value: v * 64 });
        break;
      }
      case 3: { // system event
        const c = bytes[p++];
        if (c === 10) events.push({ time, type: 'allSoundsOff', channel });
        else if (c === 11) events.push({ time, type: 'allNotesOff', channel });
        else if (c === 12) events.push({ time, type: 'controller', channel, controller: 0x7e, value: 0 });
        else if (c === 13) events.push({ time, type: 'controller', channel, controller: 0x7f, value: 0 });
        else if (c === 14) events.push({ time, type: 'resetControllers', channel });
        break;
      }
      case 4: { // controller
        const c = bytes[p++];
        let v = bytes[p++];
        if (c === 0) {
          events.push({ time, type: 'program', channel, value: v & 0x7f });
        } else if (c < MUS_CONTROLLERS.length) {
          if (v & 0x80) v = 0x7f; // mus2mid clamps out-of-range values
          events.push({ time, type: 'controller', channel, controller: MUS_CONTROLLERS[c], value: v });
        }
        break;
      }
      case 5: // measure end
        break;
      case 6: // score end
        done = true;
        break;
      default: // 7: unused; its length is unknown, so stop here
        done = true;
        break;
    }

    if (!done && (desc & 0x80)) {
      let delay = 0;
      let b;
      do {
        b = bytes[p++];
        delay = delay * 128 + (b & 0x7f);
      } while ((b & 0x80) && p < end);
      ticks += delay;
    }
  }

  return { format: 'mus', header, events, duration: ticks / MUS_TICK_RATE };
}

// --- Standard MIDI File ------------------------------------------------------

function midiStart(bytes) {
  if (ascii(bytes, 0, 4) === 'MThd') return 0;
  // RIFF RMID wrapper: find the "data" chunk holding the SMF.
  let p = 12;
  while (p + 8 <= bytes.length) {
    const id = ascii(bytes, p, 4);
    const len = bytes[p + 4] | (bytes[p + 5] << 8) | (bytes[p + 6] << 16) | (bytes[p + 7] << 24);
    if (id === 'data') return p + 8;
    p += 8 + len + (len & 1);
  }
  throw new Error('MIDI: RIFF file without data chunk');
}

export function parseMidi(data) {
  const all = data instanceof Uint8Array ? data : new Uint8Array(data);
  const bytes = all.subarray(midiStart(all));
  if (ascii(bytes, 0, 4) !== 'MThd') throw new Error('MIDI: bad header');
  const u32 = (o) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  const u16 = (o) => (bytes[o] << 8) | bytes[o + 1];
  const headerLen = u32(4);
  const format = u16(8);
  const numTracks = u16(10);
  const division = u16(12);

  let p = 8 + headerLen;
  let readPos = 0;
  const readVarLen = (limit) => {
    let v = 0;
    let b;
    do {
      if (readPos >= limit) return v;
      b = bytes[readPos++];
      v = v * 128 + (b & 0x7f);
    } while (b & 0x80);
    return v;
  };

  // Raw events with absolute ticks; tempo changes are kept in the same list
  // so that a global tempo map applies across all tracks (format 1).
  const raw = [];
  let maxTick = 0;
  let tracksRead = 0;
  while (tracksRead < numTracks && p + 8 <= bytes.length) {
    const id = ascii(bytes, p, 4);
    const len = u32(p + 4);
    const start = p + 8;
    const end = Math.min(bytes.length, start + len);
    p = start + len;
    if (id !== 'MTrk') continue;
    tracksRead++;

    let tick = 0;
    let running = 0;
    readPos = start;
    while (readPos < end) {
      tick += readVarLen(end);
      if (readPos >= end) break;
      let status = bytes[readPos];
      if (status & 0x80) readPos++;
      else if (running) status = running;
      else { readPos++; continue; } // data byte with no running status: skip

      if (status === 0xff) { // meta event
        const type = bytes[readPos++];
        const mlen = readVarLen(end);
        if (type === 0x51 && mlen === 3) {
          const tempo = (bytes[readPos] << 16) | (bytes[readPos + 1] << 8) | bytes[readPos + 2];
          raw.push({ tick, type: 'tempo', value: tempo });
        }
        readPos += mlen;
        if (type === 0x2f) break; // end of track
        continue;
      }
      if (status === 0xf0 || status === 0xf7) { // sysex: skip
        const slen = readVarLen(end); // (not "readPos += readVarLen()": that reads readPos first)
        readPos += slen;
        continue;
      }
      if (status > 0xf0) { // system common/real-time messages don't belong in files
        readPos += status === 0xf2 ? 2 : (status === 0xf1 || status === 0xf3) ? 1 : 0;
        continue;
      }

      running = status;
      const kind = status & 0xf0;
      const channel = status & 0x0f;
      const d1 = bytes[readPos++] & 0x7f;
      const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : bytes[readPos++] & 0x7f;
      switch (kind) {
        case 0x80:
          raw.push({ tick, type: 'noteOff', channel, note: d1 });
          break;
        case 0x90:
          if (d2 === 0) raw.push({ tick, type: 'noteOff', channel, note: d1 });
          else raw.push({ tick, type: 'noteOn', channel, note: d1, velocity: d2 });
          break;
        case 0xb0:
          if (d1 === 0x7b) raw.push({ tick, type: 'allNotesOff', channel });
          else if (d1 === 0x78) raw.push({ tick, type: 'allSoundsOff', channel });
          else if (d1 === 0x79) raw.push({ tick, type: 'resetControllers', channel });
          else raw.push({ tick, type: 'controller', channel, controller: d1, value: d2 });
          break;
        case 0xc0:
          raw.push({ tick, type: 'program', channel, value: d1 });
          break;
        case 0xe0:
          raw.push({ tick, type: 'pitchBend', channel, value: d1 | (d2 << 7) });
          break;
        default: // 0xA0 poly aftertouch, 0xD0 channel pressure: ignored
          break;
      }
    }
    if (tick > maxTick) maxTick = tick;
  }

  // Array.prototype.sort is stable, so same-tick events keep track order.
  raw.sort((a, b) => a.tick - b.tick);

  let secondsPerTick;
  let smpte = false;
  if (division & 0x8000) {
    let fps = 256 - (division >> 8);
    if (fps === 29) fps = 29.97;
    secondsPerTick = 1 / (fps * (division & 0xff || 1));
    smpte = true;
  } else {
    secondsPerTick = 0.5 / (division || 1); // 120 bpm default
  }

  const events = [];
  let lastTick = 0;
  let lastTime = 0;
  for (const e of raw) {
    const time = lastTime + (e.tick - lastTick) * secondsPerTick;
    lastTick = e.tick;
    lastTime = time;
    if (e.type === 'tempo') {
      if (!smpte && e.value > 0) secondsPerTick = e.value / 1e6 / (division || 1);
      continue;
    }
    const { tick: _tick, ...rest } = e;
    events.push({ time, ...rest });
  }
  const duration = lastTime + (maxTick - lastTick) * secondsPerTick;
  return { format: 'midi', midiFormat: format, events, duration };
}

// Auto-detect MUS vs MIDI.
export function parseMusic(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (isMus(bytes)) return parseMus(bytes);
  if (isMidi(bytes)) return parseMidi(bytes);
  throw new Error('Unrecognised music format');
}
