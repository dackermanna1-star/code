// GENMIDI lump parser: the DMX OPL2/OPL3 instrument bank used for music.
//
// Layout: "#OPL_II#" header, 175 instruments of 36 bytes, then 175 names of
// 32 bytes. Instruments 0-127 are the General MIDI melodic patches, 128-174
// are the percussion instruments for MIDI keys 35-81 on channel 10.

export const GENMIDI_HEADER = '#OPL_II#';
export const GENMIDI_NUM_INSTRS = 128;
export const GENMIDI_NUM_PERCUSSION = 47;
export const GENMIDI_FLAG_FIXED = 0x0001;
export const GENMIDI_FLAG_2VOICE = 0x0004;

const INSTR_SIZE = 36;
const NAME_SIZE = 32;
const TOTAL = GENMIDI_NUM_INSTRS + GENMIDI_NUM_PERCUSSION;

function readOp(bytes, o) {
  return {
    tremolo: bytes[o], // 0x20: AM / VIB / EGT / KSR / MULT
    attack: bytes[o + 1], // 0x60: AR / DR
    sustain: bytes[o + 2], // 0x80: SL / RR
    waveform: bytes[o + 3], // 0xE0
    scale: bytes[o + 4], // KSL bits for 0x40 (already in bit position 6-7)
    level: bytes[o + 5], // TL for 0x40
  };
}

function readVoice(bytes, view, o) {
  return {
    modulator: readOp(bytes, o),
    feedback: bytes[o + 6], // 0xC0: feedback / connection
    carrier: readOp(bytes, o + 7),
    unused: bytes[o + 13],
    baseNoteOffset: view.getInt16(o + 14, true),
  };
}

export function parseGenmidi(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = String.fromCharCode(...bytes.subarray(0, 8));
  // DMX does not check the header, so only warn-level strictness here: we
  // need the full instrument table to be present.
  const instrEnd = 8 + TOTAL * INSTR_SIZE;
  if (bytes.length < instrEnd) {
    throw new Error(`GENMIDI: lump too short (${bytes.length} bytes)`);
  }
  const hasNames = bytes.length >= instrEnd + TOTAL * NAME_SIZE;
  const instruments = [];
  for (let i = 0; i < TOTAL; i++) {
    const o = 8 + i * INSTR_SIZE;
    const flags = view.getUint16(o, true);
    let name = '';
    if (hasNames) {
      const no = instrEnd + i * NAME_SIZE;
      for (let j = 0; j < NAME_SIZE && bytes[no + j] !== 0; j++) name += String.fromCharCode(bytes[no + j]);
    }
    instruments.push({
      index: i,
      percussion: i >= GENMIDI_NUM_INSTRS,
      name,
      flags,
      fixed: (flags & GENMIDI_FLAG_FIXED) !== 0,
      doubleVoice: (flags & GENMIDI_FLAG_2VOICE) !== 0,
      fineTuning: bytes[o + 2],
      fixedNote: bytes[o + 3],
      voices: [readVoice(bytes, view, o + 4), readVoice(bytes, view, o + 20)],
    });
  }
  return {
    validHeader: header === GENMIDI_HEADER,
    instruments,
    melodic: instruments.slice(0, GENMIDI_NUM_INSTRS),
    percussion: instruments.slice(GENMIDI_NUM_INSTRS),
  };
}
