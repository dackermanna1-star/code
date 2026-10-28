// Minimal pure WAV (RIFF PCM 16-bit) encoder for debugging/probes, plus base64 helpers.

/** Encode channels (equal length, −1..1) as a 16-bit PCM WAV file. */
export function encodeWav(chans: Float32Array[], sr: number): Uint8Array {
  const nc = Math.max(1, chans.length);
  const len = chans[0]?.length ?? 0;
  const dataBytes = len * nc * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(buf);
  const w4 = (o: number, s: string) => {
    for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  w4(0, "RIFF");
  dv.setUint32(4, 36 + dataBytes, true);
  w4(8, "WAVE");
  w4(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, nc, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * nc * 2, true);
  dv.setUint16(32, nc * 2, true);
  dv.setUint16(34, 16, true);
  w4(36, "data");
  dv.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nc; c++) {
      const x = chans[c] ? chans[c][i] : 0;
      const v = Math.max(-1, Math.min(1, Number.isFinite(x) ? x : 0));
      dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

/** Base64 of bytes (works in browsers and Node). */
export function toBase64(bytes: Uint8Array): string {
  const B = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } }).Buffer;
  if (B) return B.from(bytes).toString("base64");
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}
