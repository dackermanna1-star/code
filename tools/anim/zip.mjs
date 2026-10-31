// Minimal ZIP reader (central directory + stored / deflated members) to pull the .glb files out of
// the Quaternius archives. Data only: nothing in an archive is ever executed.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export function listZip(path) {
  const buf = readFileSync(path);
  // end of central directory record: scan back for its signature
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`${path}: not a zip`);
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const usize = buf.readUInt32LE(off + 24);
    const nlen = buf.readUInt16LE(off + 28), xlen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nlen).toString('utf8');
    entries.push({ name, method, csize, usize, local });
    off += 46 + nlen + xlen + clen;
  }
  return { buf, entries };
}

/** Bytes of the first member whose name ends with `suffix`. */
export function readZipMember(path, suffix) {
  const { buf, entries } = listZip(path);
  const e = entries.find((x) => x.name.endsWith(suffix));
  if (!e) throw new Error(`${path}: no member *${suffix}`);
  const lo = e.local;
  if (buf.readUInt32LE(lo) !== 0x04034b50) throw new Error('bad local header');
  const start = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
  const data = buf.subarray(start, start + e.csize);
  if (e.method === 0) return Buffer.from(data);
  if (e.method === 8) {
    const out = inflateRawSync(data);
    if (out.length !== e.usize) throw new Error('size mismatch');
    return out;
  }
  throw new Error(`unsupported zip method ${e.method}`);
}
