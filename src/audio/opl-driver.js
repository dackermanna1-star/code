// MIDI -> OPL voice logic: a port of Chocolate Doom's i_oplmusic.c (3.x),
// which reproduces the DMX sound library as shipped with Doom 1.9. Drives an
// OPL3 purely through register writes: voice allocation and stealing, the
// DMX frequency curve and volume mapping, double-voice and fixed-note
// instruments, the reversed OPL3 stereo, and the music volume clamp.

export const OPL_NUM_VOICES = 9;

const REGS_TREMOLO = 0x20;
const REGS_LEVEL = 0x40;
const REGS_ATTACK = 0x60;
const REGS_SUSTAIN = 0x80;
const REGS_WAVEFORM = 0xe0;
const REGS_FREQ_1 = 0xa0;
const REGS_FREQ_2 = 0xb0;
const REGS_FEEDBACK = 0xc0;
const OPL_NUM_OPERATORS = 21;

const GENMIDI_FLAG_FIXED = 0x0001;
const GENMIDI_FLAG_2VOICE = 0x0004;
const GENMIDI_NUM_INSTRS = 128;

const MIDI_PERCUSSION_CHANNEL = 9;
const DMX_PERCUSSION_CHANNEL = 15;
const NUM_CHANNELS = 16;

const CONTROLLER_VOLUME = 0x07;
const CONTROLLER_PAN = 0x0a;
const CONTROLLER_ALL_SOUNDS_OFF = 0x78;
const CONTROLLER_RESET = 0x79;
const CONTROLLER_ALL_NOTES_OFF = 0x7b;

// Operators used by the nine voices of each register array.
const VOICE_OPERATORS = [
  [0x00, 0x01, 0x02, 0x08, 0x09, 0x0a, 0x10, 0x11, 0x12],
  [0x03, 0x04, 0x05, 0x0b, 0x0c, 0x0d, 0x13, 0x14, 0x15],
];

// DMX frequency table: 32 steps per semitone. The first 284 entries cover
// the lowest notes; above that the 384-entry octave from index 284 repeats
// with the block number. The final value is a buffer overrun in DMX.
const FREQUENCY_CURVE = new Uint16Array([
  0x133, 0x133, 0x134, 0x134, 0x135, 0x136, 0x136, 0x137,
  0x137, 0x138, 0x138, 0x139, 0x139, 0x13a, 0x13b, 0x13b,
  0x13c, 0x13c, 0x13d, 0x13d, 0x13e, 0x13f, 0x13f, 0x140,
  0x140, 0x141, 0x142, 0x142, 0x143, 0x143, 0x144, 0x144,
  0x145, 0x146, 0x146, 0x147, 0x147, 0x148, 0x149, 0x149,
  0x14a, 0x14a, 0x14b, 0x14c, 0x14c, 0x14d, 0x14d, 0x14e,
  0x14f, 0x14f, 0x150, 0x150, 0x151, 0x152, 0x152, 0x153,
  0x153, 0x154, 0x155, 0x155, 0x156, 0x157, 0x157, 0x158,
  0x158, 0x159, 0x15a, 0x15a, 0x15b, 0x15b, 0x15c, 0x15d,
  0x15d, 0x15e, 0x15f, 0x15f, 0x160, 0x161, 0x161, 0x162,
  0x162, 0x163, 0x164, 0x164, 0x165, 0x166, 0x166, 0x167,
  0x168, 0x168, 0x169, 0x16a, 0x16a, 0x16b, 0x16c, 0x16c,
  0x16d, 0x16e, 0x16e, 0x16f, 0x170, 0x170, 0x171, 0x172,
  0x172, 0x173, 0x174, 0x174, 0x175, 0x176, 0x176, 0x177,
  0x178, 0x178, 0x179, 0x17a, 0x17a, 0x17b, 0x17c, 0x17c,
  0x17d, 0x17e, 0x17e, 0x17f, 0x180, 0x181, 0x181, 0x182,
  0x183, 0x183, 0x184, 0x185, 0x185, 0x186, 0x187, 0x188,
  0x188, 0x189, 0x18a, 0x18a, 0x18b, 0x18c, 0x18d, 0x18d,
  0x18e, 0x18f, 0x18f, 0x190, 0x191, 0x192, 0x192, 0x193,
  0x194, 0x194, 0x195, 0x196, 0x197, 0x197, 0x198, 0x199,
  0x19a, 0x19a, 0x19b, 0x19c, 0x19d, 0x19d, 0x19e, 0x19f,
  0x1a0, 0x1a0, 0x1a1, 0x1a2, 0x1a3, 0x1a3, 0x1a4, 0x1a5,
  0x1a6, 0x1a6, 0x1a7, 0x1a8, 0x1a9, 0x1a9, 0x1aa, 0x1ab,
  0x1ac, 0x1ad, 0x1ad, 0x1ae, 0x1af, 0x1b0, 0x1b0, 0x1b1,
  0x1b2, 0x1b3, 0x1b4, 0x1b4, 0x1b5, 0x1b6, 0x1b7, 0x1b8,
  0x1b8, 0x1b9, 0x1ba, 0x1bb, 0x1bc, 0x1bc, 0x1bd, 0x1be,
  0x1bf, 0x1c0, 0x1c0, 0x1c1, 0x1c2, 0x1c3, 0x1c4, 0x1c4,
  0x1c5, 0x1c6, 0x1c7, 0x1c8, 0x1c9, 0x1c9, 0x1ca, 0x1cb,
  0x1cc, 0x1cd, 0x1ce, 0x1ce, 0x1cf, 0x1d0, 0x1d1, 0x1d2,
  0x1d3, 0x1d3, 0x1d4, 0x1d5, 0x1d6, 0x1d7, 0x1d8, 0x1d8,
  0x1d9, 0x1da, 0x1db, 0x1dc, 0x1dd, 0x1de, 0x1de, 0x1df,
  0x1e0, 0x1e1, 0x1e2, 0x1e3, 0x1e4, 0x1e5, 0x1e5, 0x1e6,
  0x1e7, 0x1e8, 0x1e9, 0x1ea, 0x1eb, 0x1ec, 0x1ed, 0x1ed,
  0x1ee, 0x1ef, 0x1f0, 0x1f1, 0x1f2, 0x1f3, 0x1f4, 0x1f5,
  0x1f6, 0x1f6, 0x1f7, 0x1f8, 0x1f9, 0x1fa, 0x1fb, 0x1fc,
  0x1fd, 0x1fe, 0x1ff, 0x200, 0x201, 0x201, 0x202, 0x203,
  0x204, 0x205, 0x206, 0x207, 0x208, 0x209, 0x20a, 0x20b,
  0x20c, 0x20d, 0x20e, 0x20f, 0x210, 0x210, 0x211, 0x212,
  0x213, 0x214, 0x215, 0x216, 0x217, 0x218, 0x219, 0x21a,
  0x21b, 0x21c, 0x21d, 0x21e, 0x21f, 0x220, 0x221, 0x222,
  0x223, 0x224, 0x225, 0x226, 0x227, 0x228, 0x229, 0x22a,
  0x22b, 0x22c, 0x22d, 0x22e, 0x22f, 0x230, 0x231, 0x232,
  0x233, 0x234, 0x235, 0x236, 0x237, 0x238, 0x239, 0x23a,
  0x23b, 0x23c, 0x23d, 0x23e, 0x23f, 0x240, 0x241, 0x242,
  0x244, 0x245, 0x246, 0x247, 0x248, 0x249, 0x24a, 0x24b,
  0x24c, 0x24d, 0x24e, 0x24f, 0x250, 0x251, 0x252, 0x253,
  0x254, 0x256, 0x257, 0x258, 0x259, 0x25a, 0x25b, 0x25c,
  0x25d, 0x25e, 0x25f, 0x260, 0x262, 0x263, 0x264, 0x265,
  0x266, 0x267, 0x268, 0x269, 0x26a, 0x26c, 0x26d, 0x26e,
  0x26f, 0x270, 0x271, 0x272, 0x273, 0x275, 0x276, 0x277,
  0x278, 0x279, 0x27a, 0x27b, 0x27d, 0x27e, 0x27f, 0x280,
  0x281, 0x282, 0x284, 0x285, 0x286, 0x287, 0x288, 0x289,
  0x28b, 0x28c, 0x28d, 0x28e, 0x28f, 0x290, 0x292, 0x293,
  0x294, 0x295, 0x296, 0x298, 0x299, 0x29a, 0x29b, 0x29c,
  0x29e, 0x29f, 0x2a0, 0x2a1, 0x2a2, 0x2a4, 0x2a5, 0x2a6,
  0x2a7, 0x2a9, 0x2aa, 0x2ab, 0x2ac, 0x2ae, 0x2af, 0x2b0,
  0x2b1, 0x2b2, 0x2b4, 0x2b5, 0x2b6, 0x2b7, 0x2b9, 0x2ba,
  0x2bb, 0x2bd, 0x2be, 0x2bf, 0x2c0, 0x2c2, 0x2c3, 0x2c4,
  0x2c5, 0x2c7, 0x2c8, 0x2c9, 0x2cb, 0x2cc, 0x2cd, 0x2ce,
  0x2d0, 0x2d1, 0x2d2, 0x2d4, 0x2d5, 0x2d6, 0x2d8, 0x2d9,
  0x2da, 0x2dc, 0x2dd, 0x2de, 0x2e0, 0x2e1, 0x2e2, 0x2e4,
  0x2e5, 0x2e6, 0x2e8, 0x2e9, 0x2ea, 0x2ec, 0x2ed, 0x2ee,
  0x2f0, 0x2f1, 0x2f2, 0x2f4, 0x2f5, 0x2f6, 0x2f8, 0x2f9,
  0x2fb, 0x2fc, 0x2fd, 0x2ff, 0x300, 0x302, 0x303, 0x304,
  0x306, 0x307, 0x309, 0x30a, 0x30b, 0x30d, 0x30e, 0x310,
  0x311, 0x312, 0x314, 0x315, 0x317, 0x318, 0x31a, 0x31b,
  0x31c, 0x31e, 0x31f, 0x321, 0x322, 0x324, 0x325, 0x327,
  0x328, 0x329, 0x32b, 0x32c, 0x32e, 0x32f, 0x331, 0x332,
  0x334, 0x335, 0x337, 0x338, 0x33a, 0x33b, 0x33d, 0x33e,
  0x340, 0x341, 0x343, 0x344, 0x346, 0x347, 0x349, 0x34a,
  0x34c, 0x34d, 0x34f, 0x350, 0x352, 0x353, 0x355, 0x357,
  0x358, 0x35a, 0x35b, 0x35d, 0x35e, 0x360, 0x361, 0x363,
  0x365, 0x366, 0x368, 0x369, 0x36b, 0x36c, 0x36e, 0x370,
  0x371, 0x373, 0x374, 0x376, 0x378, 0x379, 0x37b, 0x37c,
  0x37e, 0x380, 0x381, 0x383, 0x384, 0x386, 0x388, 0x389,
  0x38b, 0x38d, 0x38e, 0x390, 0x392, 0x393, 0x395, 0x397,
  0x398, 0x39a, 0x39c, 0x39d, 0x39f, 0x3a1, 0x3a2, 0x3a4,
  0x3a6, 0x3a7, 0x3a9, 0x3ab, 0x3ac, 0x3ae, 0x3b0, 0x3b1,
  0x3b3, 0x3b5, 0x3b7, 0x3b8, 0x3ba, 0x3bc, 0x3bd, 0x3bf,
  0x3c1, 0x3c3, 0x3c4, 0x3c6, 0x3c8, 0x3ca, 0x3cb, 0x3cd,
  0x3cf, 0x3d1, 0x3d2, 0x3d4, 0x3d6, 0x3d8, 0x3da, 0x3db,
  0x3dd, 0x3df, 0x3e1, 0x3e3, 0x3e4, 0x3e6, 0x3e8, 0x3ea,
  0x3ec, 0x3ed, 0x3ef, 0x3f1, 0x3f3, 0x3f5, 0x3f6, 0x3f8,
  0x3fa, 0x3fc, 0x3fe, 0x36c,
]);

// MIDI volume / velocity (0-127) -> OPL level.
const VOLUME_MAPPING = new Uint8Array([
  0, 1, 3, 5, 6, 8, 10, 11, 13, 14, 16, 17, 19, 20, 22, 23,
  25, 26, 27, 29, 30, 32, 33, 34, 36, 37, 39, 41, 43, 45, 47, 49,
  50, 52, 54, 55, 57, 59, 60, 61, 63, 64, 66, 67, 68, 69, 71, 72,
  73, 74, 75, 76, 77, 79, 80, 81, 82, 83, 84, 84, 85, 86, 87, 88,
  89, 90, 91, 92, 92, 93, 94, 95, 96, 96, 97, 98, 99, 99, 100, 101,
  101, 102, 103, 103, 104, 105, 105, 106, 107, 107, 108, 109, 109, 110, 110, 111,
  112, 112, 113, 113, 114, 114, 115, 115, 116, 117, 117, 118, 118, 119, 119, 120,
  120, 121, 121, 122, 122, 123, 123, 123, 124, 124, 125, 125, 126, 126, 127, 127,
]);

// MIDI channel -> DMX channel number. DMX plays MUS data, where percussion is
// channel 15; voice stealing compares channels in that numbering.
function dmxChannel(midiChannel) {
  if (midiChannel === MIDI_PERCUSSION_CHANNEL) return DMX_PERCUSSION_CHANNEL;
  return midiChannel > MIDI_PERCUSSION_CHANNEL ? midiChannel - 1 : midiChannel;
}

class Voice {
  constructor(i) {
    this.id = i;
    this.index = i % OPL_NUM_VOICES;
    this.op1 = VOICE_OPERATORS[0][this.index];
    this.op2 = VOICE_OPERATORS[1][this.index];
    this.array = Math.floor(i / OPL_NUM_VOICES) << 8;
    this.instr = null; // currently-loaded GENMIDI instrument
    this.instrVoice = 0; // 0, or 1 for the second voice of a double voice
    this.channel = null;
    this.key = 0;
    this.note = 0;
    this.freq = 0;
    this.noteVolume = 0;
    this.carVolume = 0;
    this.modVolume = 0;
    this.regPan = 0;
    this.priority = 0;
  }
}

class ChannelState {
  constructor(num) {
    this.num = num;
    this.instrument = null;
    this.volume = 0;
    this.volumeBase = 0;
    this.pan = 0x30;
    this.bend = 0;
  }
}

export class OplMusicDriver {
  constructor(opl, genmidi, { opl3 = true, stereoCorrect = false, bufferedWrites = true } = {}) {
    this.opl = opl;
    this.instruments = genmidi.instruments || genmidi;
    if (!this.instruments || this.instruments.length < 175) throw new Error('OplMusicDriver: bad GENMIDI');
    this.opl3 = opl3;
    // DMX has the OPL3 stereo channels backwards; Chocolate preserves that
    // unless "-reverse" is given. stereoCorrect = true fixes it.
    this.stereoCorrect = stereoCorrect;
    this.bufferedWrites = bufferedWrites && typeof opl.writeBuffered === 'function';
    this.numVoices = opl3 ? OPL_NUM_VOICES * 2 : OPL_NUM_VOICES;
    this.voices = [];
    for (let i = 0; i < OPL_NUM_VOICES * 2; i++) this.voices.push(new Voice(i));
    this.freeList = new Array(OPL_NUM_VOICES * 2).fill(null);
    this.allocList = new Array(OPL_NUM_VOICES * 2).fill(null);
    this.freeNum = 0;
    this.allocNum = 0;
    this.tmpUpdated = new Array(OPL_NUM_VOICES * 2).fill(null);
    this.tmpOther = new Array(OPL_NUM_VOICES * 2).fill(null);
    this.channels = [];
    for (let i = 0; i < NUM_CHANNELS; i++) this.channels.push(new ChannelState(i));
    this.musicVolume = 127;
    this.startVolume = 127;
    this.reset();
  }

  writeReg(reg, value) {
    if (this.bufferedWrites) this.opl.writeBuffered(reg, value);
    else this.opl.write(reg, value);
  }

  // Full re-initialisation: chip registers, voice lists and channels.
  reset() {
    if (this.opl.flushWrites) this.opl.flushWrites();
    this.initRegisters();
    this.initVoices();
    this.startSong();
  }

  // OPL_InitRegisters(), including the writes to registers that don't exist.
  initRegisters() {
    const w = (r, v) => this.opl.write(r, v);
    if (!this.opl3) w(0x105, 0x00);
    for (let r = REGS_LEVEL; r <= REGS_LEVEL + OPL_NUM_OPERATORS; r++) w(r, 0x3f);
    for (let r = REGS_ATTACK; r <= REGS_WAVEFORM + OPL_NUM_OPERATORS; r++) w(r, 0x00);
    for (let r = 1; r < REGS_LEVEL; r++) w(r, 0x00);
    w(0x04, 0x60); // reset timers
    w(0x04, 0x80);
    w(0x01, 0x20); // waveform select enable
    if (this.opl3) {
      w(0x105, 0x01);
      for (let r = REGS_LEVEL; r <= REGS_LEVEL + OPL_NUM_OPERATORS; r++) w(r | 0x100, 0x3f);
      for (let r = REGS_ATTACK; r <= REGS_WAVEFORM + OPL_NUM_OPERATORS; r++) w(r | 0x100, 0x00);
      for (let r = 1; r < REGS_LEVEL; r++) w(r | 0x100, 0x00);
    }
    w(0x08, 0x40); // note select (keyboard split)
    if (this.opl3) w(0x105, 0x01);
  }

  initVoices() {
    this.freeNum = this.numVoices;
    this.allocNum = 0;
    for (let i = 0; i < this.numVoices; i++) {
      const v = this.voices[i];
      v.instr = null;
      v.instrVoice = 0;
      v.channel = null;
      v.key = v.note = v.freq = 0;
      this.freeList[i] = v;
    }
  }

  initChannel(channel) {
    channel.instrument = this.instruments[0];
    channel.volume = this.musicVolume;
    channel.volumeBase = 100;
    if (channel.volume > channel.volumeBase) channel.volume = channel.volumeBase;
    channel.pan = 0x30;
    channel.bend = 0;
  }

  // I_OPL_PlaySong / RestartSong: latch the start volume, reset channels.
  startSong() {
    this.startVolume = this.musicVolume;
    for (const ch of this.channels) this.initChannel(ch);
  }

  // --- Voice management ----------------------------------------------------

  getFreeVoice() {
    if (this.freeNum === 0) return null;
    const result = this.freeList[0];
    this.freeNum--;
    for (let i = 0; i < this.freeNum; i++) this.freeList[i] = this.freeList[i + 1];
    this.freeList[this.freeNum] = null;
    this.allocList[this.allocNum++] = result;
    return result;
  }

  releaseVoice(index) {
    if (index >= this.allocNum) return;
    const voice = this.allocList[index];
    this.voiceKeyOff(voice);
    voice.channel = null;
    voice.note = 0;
    this.allocNum--;
    for (let i = index; i < this.allocNum; i++) this.allocList[i] = this.allocList[i + 1];
    this.allocList[this.allocNum] = null;
    // Released voices go to the end of the free list (as DMX does).
    this.freeList[this.freeNum++] = voice;
  }

  loadOperatorData(operator, data, maxLevel) {
    // The carrier always starts at minimum volume until SetVoiceVolume.
    const level = data.scale | (maxLevel ? 0x3f : data.level);
    this.writeReg(REGS_LEVEL + operator, level);
    this.writeReg(REGS_TREMOLO + operator, data.tremolo);
    this.writeReg(REGS_ATTACK + operator, data.attack);
    this.writeReg(REGS_SUSTAIN + operator, data.sustain);
    this.writeReg(REGS_WAVEFORM + operator, data.waveform);
    return level;
  }

  setVoiceInstrument(voice, instr, instrVoice) {
    if (voice.instr === instr && voice.instrVoice === instrVoice) return;
    voice.instr = instr;
    voice.instrVoice = instrVoice;
    const data = instr.voices[instrVoice];
    const modulating = (data.feedback & 0x01) === 0;
    // Doom loads the carrier first, then the modulator. In additive mode
    // both operators start at minimum volume.
    voice.carVolume = this.loadOperatorData(voice.op2 | voice.array, data.carrier, true);
    voice.modVolume = this.loadOperatorData(voice.op1 | voice.array, data.modulator, !modulating);
    this.writeReg((REGS_FEEDBACK + voice.index) | voice.array, data.feedback | voice.regPan);
    voice.priority = 0x0f - (data.carrier.attack >> 4) + 0x0f - (data.carrier.sustain & 0x0f);
  }

  setVoiceVolume(voice, volume) {
    voice.noteVolume = volume;
    const data = voice.instr.voices[voice.instrVoice];
    // Multiply note volume and channel volume to get the actual volume.
    const midiVolume = 2 * (VOLUME_MAPPING[voice.channel.volume] + 1);
    const fullVolume = (VOLUME_MAPPING[voice.noteVolume] * midiVolume) >> 9;
    const carVolume = 0x3f - fullVolume;
    if (carVolume === (voice.carVolume & 0x3f)) return;
    voice.carVolume = carVolume | (voice.carVolume & 0xc0);
    this.writeReg((REGS_LEVEL + voice.op2) | voice.array, voice.carVolume);
    // Non-modulated (additive) feedback: the modulator is heard directly,
    // so its level follows the volume too.
    if ((data.feedback & 0x01) !== 0 && data.modulator.level !== 0x3f) {
      let modVolume = data.modulator.level;
      if (modVolume < carVolume) modVolume = carVolume;
      modVolume |= voice.modVolume & 0xc0;
      if (modVolume !== voice.modVolume) {
        voice.modVolume = modVolume;
        this.writeReg((REGS_LEVEL + voice.op1) | voice.array, modVolume | (data.modulator.scale & 0xc0));
      }
    }
  }

  setVoicePan(voice, pan) {
    voice.regPan = pan;
    const data = voice.instr.voices[voice.instrVoice];
    this.writeReg((REGS_FEEDBACK + voice.index) | voice.array, data.feedback | pan);
  }

  voiceKeyOff(voice) {
    this.writeReg((REGS_FREQ_2 + voice.index) | voice.array, voice.freq >> 8);
  }

  frequencyForVoice(voice) {
    const instr = voice.instr;
    const gmVoice = instr.voices[voice.instrVoice];
    let note = voice.note;
    // Apply the note offset, except for fixed-note instruments.
    if ((instr.flags & GENMIDI_FLAG_FIXED) === 0) note += gmVoice.baseNoteOffset;
    while (note < 0) note += 12;
    while (note > 95) note -= 12;
    let freqIndex = 64 + 32 * note + voice.channel.bend;
    // The second voice of a double-voice instrument is detuned.
    if (voice.instrVoice !== 0) freqIndex += (instr.fineTuning >> 1) - 64;
    if (freqIndex < 0) freqIndex = 0;
    if (freqIndex < 284) return FREQUENCY_CURVE[freqIndex];
    const subIndex = (freqIndex - 284) % (12 * 32);
    let octave = Math.floor((freqIndex - 284) / (12 * 32));
    if (octave >= 7) octave = 7;
    return FREQUENCY_CURVE[subIndex + 284] | (octave << 10);
  }

  updateVoiceFrequency(voice) {
    const freq = this.frequencyForVoice(voice);
    if (voice.freq !== freq) {
      this.writeReg((REGS_FREQ_1 + voice.index) | voice.array, freq & 0xff);
      this.writeReg((REGS_FREQ_2 + voice.index) | voice.array, (freq >> 8) | 0x20);
      voice.freq = freq;
    }
  }

  voiceKeyOn(channel, instrument, instrVoice, note, key, volume) {
    const voice = this.getFreeVoice();
    if (!voice) return;
    voice.channel = channel;
    voice.key = key;
    voice.note = (instrument.flags & GENMIDI_FLAG_FIXED) !== 0 ? instrument.fixedNote : note;
    voice.regPan = channel.pan;
    this.setVoiceInstrument(voice, instrument, instrVoice);
    this.setVoiceVolume(voice, volume);
    voice.freq = 0; // force the key-on write
    this.updateVoiceFrequency(voice);
  }

  // All voices in use: discard one. Second voices of double-voice
  // instruments go first, then the highest-numbered channel; lower channels
  // implicitly have priority.
  replaceExistingVoice() {
    let result = 0;
    for (let i = 0; i < this.allocNum; i++) {
      const v = this.allocList[i];
      if (v.instrVoice !== 0 || v.channel.num >= this.allocList[result].channel.num) result = i;
    }
    this.releaseVoice(result);
  }

  // --- Channel-level helpers -----------------------------------------------

  setChannelVolume(channel, volume, clipStart) {
    channel.volumeBase = volume;
    if (volume > this.musicVolume) volume = this.musicVolume;
    if (clipStart && volume > this.startVolume) volume = this.startVolume;
    channel.volume = volume;
    for (let i = 0; i < this.numVoices; i++) {
      const v = this.voices[i];
      if (v.channel === channel) this.setVoiceVolume(v, v.noteVolume);
    }
  }

  setChannelPan(channel, pan) {
    if (this.stereoCorrect) pan = 144 - pan;
    if (!this.opl3) return;
    let regPan;
    if (pan >= 96) regPan = 0x10;
    else if (pan <= 48) regPan = 0x20;
    else regPan = 0x30;
    if (channel.pan !== regPan) {
      channel.pan = regPan;
      for (let i = 0; i < this.numVoices; i++) {
        const v = this.voices[i];
        if (v.channel === channel) this.setVoicePan(v, regPan);
      }
    }
  }

  releaseChannel(channel) {
    for (let i = 0; i < this.allocNum; i++) {
      if (this.allocList[i].channel === channel) {
        this.releaseVoice(i);
        i--;
      }
    }
  }

  // --- MIDI event interface (MIDI channel numbers, percussion = 9) ----------

  noteOn(ch, note, velocity) {
    // A velocity of zero means key off.
    if (velocity <= 0) {
      this.noteOff(ch, note);
      return;
    }
    const channel = this.channels[dmxChannel(ch & 0x0f)];
    let instrument;
    let playNote = note;
    if ((ch & 0x0f) === MIDI_PERCUSSION_CHANNEL) {
      if (note < 35 || note > 81) return;
      instrument = this.instruments[GENMIDI_NUM_INSTRS + note - 35];
      playNote = 60;
    } else {
      instrument = channel.instrument;
    }
    const doubleVoice = (instrument.flags & GENMIDI_FLAG_2VOICE) !== 0;
    if (this.freeNum === 0) this.replaceExistingVoice();
    this.voiceKeyOn(channel, instrument, 0, playNote, note, velocity);
    if (doubleVoice) this.voiceKeyOn(channel, instrument, 1, playNote, note, velocity);
  }

  noteOff(ch, note) {
    const channel = this.channels[dmxChannel(ch & 0x0f)];
    // Turn off every voice playing this key (two for double voices).
    for (let i = 0; i < this.allocNum; i++) {
      const v = this.allocList[i];
      if (v.channel === channel && v.key === note) {
        this.releaseVoice(i);
        i--;
      }
    }
  }

  program(ch, program) {
    // Sounding voices keep their instrument, as in DMX.
    this.channels[dmxChannel(ch & 0x0f)].instrument = this.instruments[program & 0x7f];
  }

  controller(ch, controller, value) {
    const channel = this.channels[dmxChannel(ch & 0x0f)];
    switch (controller) {
      case CONTROLLER_VOLUME:
        this.setChannelVolume(channel, value & 0x7f, true);
        break;
      case CONTROLLER_PAN:
        this.setChannelPan(channel, value & 0x7f);
        break;
      case CONTROLLER_ALL_NOTES_OFF:
      case CONTROLLER_ALL_SOUNDS_OFF:
        this.releaseChannel(channel);
        break;
      case CONTROLLER_RESET:
        this.resetControllers(ch);
        break;
      default:
        // Modulation, expression, sustain pedal etc. are ignored by DMX.
        break;
    }
  }

  // Only the MSB of the 14-bit value is used (as Doom does): 32 steps per
  // semitone, +-2 semitones.
  pitchBend(ch, value) {
    const channel = this.channels[dmxChannel(ch & 0x0f)];
    channel.bend = ((value >> 7) & 0x7f) - 64;
    // Update this channel's voices and move them to the end of the
    // allocated list (affects which voice is stolen next).
    let updated = 0;
    let other = 0;
    for (let i = 0; i < this.allocNum; i++) {
      const v = this.allocList[i];
      if (v.channel === channel) {
        this.updateVoiceFrequency(v);
        this.tmpUpdated[updated++] = v;
      } else {
        this.tmpOther[other++] = v;
      }
    }
    for (let i = 0; i < other; i++) this.allocList[i] = this.tmpOther[i];
    for (let i = 0; i < updated; i++) this.allocList[other + i] = this.tmpUpdated[i];
  }

  // All notes off on one channel, or on every channel when ch is omitted.
  allNotesOff(ch) {
    if (ch === undefined || ch === null) {
      for (const channel of this.channels) this.releaseChannel(channel);
    } else {
      this.releaseChannel(this.channels[dmxChannel(ch & 0x0f)]);
    }
  }

  allSoundsOff(ch) {
    this.allNotesOff(ch);
  }

  // DMX ignores "reset all controllers"; we only recentre the pitch bend so
  // a song can't leave a channel detuned.
  resetControllers(ch) {
    if (ch === undefined || ch === null) {
      for (let i = 0; i < NUM_CHANNELS; i++) this.resetControllers(i);
      return;
    }
    const channel = this.channels[dmxChannel(ch & 0x0f)];
    if (channel.bend !== 0) this.pitchBend(ch, 0x2000);
  }

  // I_OPL_PauseSong: key off every melodic voice (percussion rings on).
  // The voices stay allocated until their note-off arrives.
  pause() {
    for (let i = 0; i < this.numVoices; i++) {
      const v = this.voices[i];
      if (v.channel !== null && v.instr && v.instr.index < GENMIDI_NUM_INSTRS) this.voiceKeyOff(v);
    }
  }

  // Music volume: 0-127 (DMX scale), or a fraction 0..1. As in DMX it is a
  // ceiling on channel volume rather than a gain. Note the DMX quirk that
  // the percussion channel's volume is set straight to the music volume.
  setVolume(volume) {
    let v = volume;
    if (v <= 1) v *= 127;
    v = Math.max(0, Math.min(127, Math.round(v)));
    if (v === this.musicVolume) return;
    this.musicVolume = v;
    for (let i = 0; i < NUM_CHANNELS; i++) {
      const channel = this.channels[i];
      this.setChannelVolume(channel, i === DMX_PERCUSSION_CHANNEL ? v : channel.volumeBase, false);
    }
  }

  // Not part of DMX: cut every voice off fast (used after a fade-out on
  // stop). Instruments are reloaded on the next note.
  silence() {
    for (const channel of this.channels) this.releaseChannel(channel);
    if (this.opl.flushWrites) this.opl.flushWrites();
    const w = (r, val) => this.opl.write(r, val);
    for (let i = 0; i < this.numVoices; i++) {
      const v = this.voices[i];
      w((REGS_FREQ_2 + v.index) | v.array, v.freq >> 8);
      w((REGS_SUSTAIN + v.op1) | v.array, 0x0f);
      w((REGS_SUSTAIN + v.op2) | v.array, 0x0f);
      w((REGS_LEVEL + v.op1) | v.array, 0x3f);
      w((REGS_LEVEL + v.op2) | v.array, 0x3f);
      v.instr = null;
    }
  }

  get activeVoices() {
    return this.allocNum;
  }
}
