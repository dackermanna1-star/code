import { describe, expect, it } from 'vitest';
import { mulberry32, seedFromString } from '../src/shared/math';
import { decodeChunkHeader, encodeChunkFrame } from '../src/shared/net/protocol';
import { B } from '../src/shared/world/blocks';
import { CHUNK_VOLUME, Chunk, VoxelWorld, chunkKey, chunkKeyX, chunkKeyZ, rleDecode, rleEncode } from '../src/shared/world/chunk';
import { WorldGenerator } from '../src/shared/world/worldgen';
import { firstDiff } from './helpers';

function randomRuns(rnd: () => number, len: number, maxRun: number, palette: number): Uint8Array {
  const out = new Uint8Array(len);
  let i = 0;
  while (i < len) {
    const run = 1 + Math.floor(rnd() * maxRun);
    out.fill(Math.floor(rnd() * palette), i, Math.min(len, i + run));
    i += run;
  }
  return out;
}

describe('RLE codec', () => {
  it('round-trips random data with mixed run lengths (incl. multi-byte varints)', () => {
    const rnd = mulberry32(42);
    for (const maxRun of [1, 3, 127, 128, 300, 20000]) {
      for (let k = 0; k < 5; k++) {
        const data = randomRuns(rnd, CHUNK_VOLUME, maxRun, 256);
        expect(firstDiff(rleDecode(rleEncode(data)), data)).toBe(-1);
      }
    }
  });

  it('round-trips uniform buffers and alternating bytes (worst case)', () => {
    for (const v of [0, 1, 255]) {
      const data = new Uint8Array(CHUNK_VOLUME).fill(v);
      const enc = rleEncode(data);
      // one run of 32768 = value byte + 3-byte varint
      expect(enc.length).toBe(4);
      expect(firstDiff(rleDecode(enc), data)).toBe(-1);
    }
    const alt = new Uint8Array(CHUNK_VOLUME);
    for (let i = 0; i < alt.length; i++) alt[i] = i & 1;
    const enc = rleEncode(alt);
    expect(enc.length).toBe(CHUNK_VOLUME * 2);
    expect(firstDiff(rleDecode(enc), alt)).toBe(-1);
  });

  it('round-trips arbitrary lengths when the expected length is given', () => {
    const rnd = mulberry32(7);
    for (const len of [1, 2, 127, 128, 129, 16384, 70000]) {
      const data = randomRuns(rnd, len, 200, 4);
      expect(firstDiff(rleDecode(rleEncode(data), len), data)).toBe(-1);
    }
    expect(rleEncode(new Uint8Array(0)).length).toBe(0);
    expect(rleDecode(new Uint8Array(0), 0).length).toBe(0);
  });

  it('round-trips real generated chunks and compresses them well', () => {
    const gen = new WorldGenerator(seedFromString('codec'));
    for (const [cx, cz] of [[0, 0], [5, -3], [-12, 40], [100, 100]]) {
      const data = gen.generateChunk(cx, cz);
      const enc = rleEncode(data);
      expect(firstDiff(rleDecode(enc), data)).toBe(-1);
      expect(enc.length).toBeLessThan(CHUNK_VOLUME / 2);
    }
  });

  it('decodes from an offset inside a network chunk frame', () => {
    const gen = new WorldGenerator(seedFromString('frame'));
    const data = gen.generateChunk(-3, 9);
    const frame = encodeChunkFrame(-3, 9, 77, rleEncode(data));
    const h = decodeChunkHeader(frame);
    expect(h).toEqual({ cx: -3, cz: 9, rev: 77, offset: 13 });
    expect(firstDiff(rleDecode(frame, CHUNK_VOLUME, h.offset), data)).toBe(-1);
  });

  it('round-trips a chunk edited through VoxelWorld (persistence path)', () => {
    const w = new VoxelWorld();
    const c = new Chunk(2, -1, new WorldGenerator(1).generateChunk(2, -1));
    w.addChunk(c);
    for (let y = 1; y < 120; y += 7) expect(w.setBlock(32 + (y % 16), y, -16 + ((y * 3) % 16), B.cobblestone)).toBe(true);
    expect(c.edited).toBe(true);
    const back = new Chunk(2, -1, rleDecode(rleEncode(c.blocks)));
    expect(firstDiff(back.blocks, c.blocks)).toBe(-1);
  });

  describe('corrupt input', () => {
    const good = rleEncode(randomRuns(mulberry32(3), CHUNK_VOLUME, 500, 16));

    it('throws on a truncated stream (missing runs)', () => {
      expect(() => rleDecode(good.slice(0, good.length - 2))).toThrow(/RLE/);
    });

    it('throws on a truncated varint', () => {
      // value byte followed by a continuation byte and then end of input
      expect(() => rleDecode(Uint8Array.from([5, 0x80]), 10)).toThrow(/truncated varint/);
      expect(() => rleDecode(Uint8Array.from([5]), 10)).toThrow(/truncated varint/);
    });

    it('throws when a run overflows the output buffer', () => {
      expect(() => rleDecode(Uint8Array.from([1, 11]), 10)).toThrow(/overflows/);
      const big = rleEncode(new Uint8Array(CHUNK_VOLUME + 1));
      expect(() => rleDecode(big)).toThrow(/overflows/);
    });

    it('throws on an over-long varint', () => {
      expect(() => rleDecode(Uint8Array.from([1, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01]), 10)).toThrow(/too long/);
    });

    it('throws when the stream decodes to fewer bytes than expected', () => {
      expect(() => rleDecode(Uint8Array.from([1, 5]), 10)).toThrow(/decoded 5 of 10/);
      expect(() => rleDecode(new Uint8Array(0))).toThrow();
    });

    it('throws on random garbage of every length (never returns a wrong-sized buffer)', () => {
      const rnd = mulberry32(99);
      for (let k = 0; k < 300; k++) {
        const junk = new Uint8Array(1 + Math.floor(rnd() * 64));
        for (let i = 0; i < junk.length; i++) junk[i] = Math.floor(rnd() * 256);
        let out: Uint8Array | null = null;
        try {
          out = rleDecode(junk);
        } catch {
          continue;
        }
        expect(out.length).toBe(CHUNK_VOLUME);
      }
    });

    it('rejects a Chunk built from a wrong-sized buffer', () => {
      expect(() => new Chunk(0, 0, new Uint8Array(100))).toThrow(/Bad chunk buffer length/);
    });

    // Regression (was a bug, fixed): rleDecode stops once the output is full and silently ignores any
    // trailing bytes, so a stream with appended/duplicated data (e.g. a corrupted
    // save record) decodes "successfully". src/shared/world/chunk.ts rleDecode:
    // the loop condition `o < expectedLength` exits without checking `i === src.length`.
    it('rejects trailing garbage after a complete chunk', () => {
      const tail = Uint8Array.from([...good, 7, 3]);
      expect(() => rleDecode(tail)).toThrow();
    });
  });

  it('chunk keys round-trip for negative and positive coordinates', () => {
    for (const [x, z] of [[0, 0], [-1, -1], [123, -456], [-32767, 32767]]) {
      const k = chunkKey(x, z);
      expect([chunkKeyX(k), chunkKeyZ(k)]).toEqual([x, z]);
    }
  });
});
