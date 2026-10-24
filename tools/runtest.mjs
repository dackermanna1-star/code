// Bundles a TypeScript test file with esbuild and runs it in Node.
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const entry = process.argv[2];
const out = 'node_modules/.cache/test-' + entry.replace(/[\/\\.]/g, '_') + '.mjs';
fs.mkdirSync('node_modules/.cache', { recursive: true });
await esbuild.build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' });
execFileSync('node', [out, ...process.argv.slice(3)], { stdio: 'inherit' });
