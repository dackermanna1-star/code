#!/usr/bin/env node
// Headless screenshots of the game for development (uses the pre-installed Chromium).
//
// Examples:
//   node tools/shot.mjs --viewer bench_park                 # 4 views of a model at noon
//   node tools/shot.mjs --viewer car_lada_2107 --t 21:00 --lamp --views 0,3
//   node tools/shot.mjs --at 230,400,0.6 --t 17:30 --weather light --out tools/out/court.png
//   node tools/shot.mjs --query "only=props&viewer=lamp_cobra"  # raw query string
//   node tools/shot.mjs --at 230,400,0 --console              # also print browser console
//
// Options: --w 960 --h 540 --frames 20 --timeout 120000 --pitch -0.1 --only pkg1,pkg2
//          --base http://localhost:5173 (use an already running dev server)
// Prints the output file paths. Errors from the page are printed and exit code is 1.

import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }

const args = process.argv.slice(2)
const opt = {}
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (!a.startsWith('--')) continue
  const k = a.slice(2)
  const v = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true
  opt[k] = v
}

const W = parseInt(opt.w ?? 960, 10), H = parseInt(opt.h ?? 540, 10)
const outDir = path.join(root, 'tools', 'out')
mkdirSync(outDir, { recursive: true })

let server = null
let base = opt.base || process.env.SHOT_BASE
if (!base) {
  const { createServer } = await import('vite')
  server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } })
  await server.listen()
  const addr = server.httpServer.address()
  base = `http://127.0.0.1:${addr.port}`
}

const jobs = []
const common = []
if (opt.t) common.push(`t=${opt.t}`)
if (opt.weather) common.push(`weather=${opt.weather}`)
if (opt.only) common.push(`only=${opt.only}`)
if (opt.frames) common.push(`frames=${opt.frames}`)
if (opt.quality) common.push(`quality=${opt.quality}`)
common.push(`timescale=${opt.timescale ?? 0}`)
if (opt.viewer) {
  const views = String(opt.views ?? '0,1,2,3').split(',')
  for (const v of views) {
    const q = [`viewer=${opt.viewer}`, `view=${v}`, ...common]
    if (opt.lamp) q.push('lamp=1')
    if (opt.dist) q.push(`dist=${opt.dist}`)
    if (opt.tint) q.push(`tint=${opt.tint}`)
    if (opt.seed) q.push(`seed=${opt.seed}`)
    const name = String(opt.viewer).replace(/[^a-z0-9_,-]/gi, '').slice(0, 60)
    jobs.push({ q: q.join('&'), out: opt.out && views.length === 1 ? opt.out : path.join(outDir, `viewer_${name}_${v}.png`) })
  }
} else if (opt.at) {
  const shots = String(opt.at).split(';')
  shots.forEach((s, i) => {
    const [x, z, yaw, y] = s.split(',')
    const q = ['shot=1', `x=${x}`, `z=${z}`, `yaw=${yaw ?? 0}`, ...common]
    if (y !== undefined && y !== '') q.push(`y=${y}`)
    if (opt.pitch) q.push(`pitch=${opt.pitch}`)
    const out = opt.out && shots.length === 1 ? opt.out : path.join(outDir, `at_${x}_${z}_${yaw ?? 0}.png`)
    jobs.push({ q: q.join('&'), out })
  })
} else if (opt.query) {
  jobs.push({ q: String(opt.query) + (String(opt.query).includes('shot=') || String(opt.query).includes('viewer=') ? '' : '&shot=1'), out: opt.out ?? path.join(outDir, 'query.png') })
} else {
  jobs.push({ q: ['shot=1', ...common].join('&'), out: opt.out ?? path.join(outDir, 'spawn.png') })
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
})
let failed = false
for (const job of jobs) {
  const page = await browser.newPage({ viewport: { width: W, height: H } })
  const logs = []
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning' || opt.console) logs.push(`[${m.type()}] ${m.text()}`) })
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`))
  const url = `${base}/?${job.q}`
  const t0 = Date.now()
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 })
    await page.waitForFunction(() => window.__shotReady || window.__shotError, null, { timeout: parseInt(opt.timeout ?? 180000, 10), polling: 250 })
    const err = await page.evaluate(() => window.__shotError)
    if (err) { failed = true; console.log('PAGE ERROR', err) }
    await page.screenshot({ path: job.out })
    const info = await page.evaluate(() => {
      const g = window.game
      if (!g) return null
      const r = g.renderer.info.render
      return { calls: r.calls, tris: r.triangles, inst: g.world.stats.instancesDrawn, contentErrors: window.__contentErrors || [], buildErrors: g.buildErrors || [] }
    })
    console.log(`${job.out}  (${((Date.now() - t0) / 1000).toFixed(1)}s) ${info ? JSON.stringify(info) : ''}`)
  } catch (e) {
    failed = true
    console.log(`FAILED ${url}: ${e.message}`)
  }
  const relevant = logs.filter(l => !l.includes('GPU stall') && !l.includes('Automatic fallback to software WebGL'))
  if (relevant.length) console.log(relevant.slice(0, 40).join('\n'))
  await page.close()
}
await browser.close()
if (server) await server.close()
process.exit(failed ? 1 : 0)
