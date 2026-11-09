import sharp from 'sharp'; import fs from 'node:fs';
const [out, ...files] = process.argv.slice(2);
const W = +(process.env.W || 640), H = +(process.env.H || 360), cols = +(process.env.COLS || 2);
const tiles = [];
for (const [i, f] of files.entries()) {
  if (!fs.existsSync(f)) continue;
  tiles.push({ input: await sharp(f).resize(W, H).toBuffer(), left: (i % cols) * W, top: Math.floor(i / cols) * H });
  tiles.push({ input: Buffer.from(`<svg width="${W}" height="22"><rect width="${W}" height="22" fill="rgba(0,0,0,0.6)"/><text x="6" y="16" font-size="14" fill="#fff" font-family="sans-serif">${f.split('/').pop()}</text></svg>`), left: (i % cols) * W, top: Math.floor(i / cols) * H });
}
await sharp({ create: { width: cols * W, height: Math.ceil(files.length / cols) * H, channels: 3, background: '#000' } }).composite(tiles).jpeg({ quality: 82 }).toFile(out);
