// Bundles and runs scripts/bench-entry.ts in Node.
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
mkdirSync('dist/bench', { recursive: true });
await build({ entryPoints: ['scripts/bench-entry.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/bench/bench.mjs', logLevel: 'warning' });
await import(new URL('../dist/bench/bench.mjs', import.meta.url).href);
