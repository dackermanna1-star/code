#!/usr/bin/env node
// Audio package checker (headless Chromium, no audio device needed).
//
//   node tools/audio-check.mjs                      # render every registered sound offline, print a table
//   node tools/audio-check.mjs --only dog_bark,crow_caw
//   node tools/audio-check.mjs --spectro dog_bark,metro_doors   # PNG spectrograms → tools/out/audio/
//   node tools/audio-check.mjs --steps                # footsteps per surface (+ spectrograms)
//   node tools/audio-check.mjs --music 3              # render 3 ambient music pieces (+ spectrograms)
//   node tools/audio-check.mjs --live [--seconds 30] [--t 17:30] [--force silence|music]
//                                                    # run the real game (only=base,audio) and sample the mix
// Flags: NaN, silence, clipping (peak > -0.5 dBFS), clicks, DC, loop-seam jumps, loudness outliers.

import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
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
const outDir = path.join(root, 'tools', 'out', 'audio')
mkdirSync(outDir, { recursive: true })

const { createServer } = await import('vite')
const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } })
await server.listen()
const base = `http://127.0.0.1:${server.httpServer.address().port}`
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: opt.live ? { width: 480, height: 270 } : { width: 1100, height: 700 } })
const logs = []
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning' || opt.console) logs.push(`[${m.type()}] ${m.text()}`) })
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`))
let failed = false
const savePng = (name, dataUrl) => {
  const f = path.join(outDir, name.replace(/[^a-z0-9_.-]/gi, '_') + '.png')
  writeFileSync(f, Buffer.from(dataUrl.split(',')[1], 'base64'))
  return f
}

try {
  if (opt.live) {
    const t = opt.t ?? '17:30'
    const q = `shot=1&only=${opt.onlypk ?? 'base,audio'}&t=${t}&timescale=0&weather=${opt.weather ?? 'light'}` + (opt.force ? `&audio=${opt.force}` : '') + (opt.at ? `&x=${opt.at.split(',')[0]}&z=${opt.at.split(',')[1]}` : '')
    await page.goto(`${base}/?${q}`, { waitUntil: 'load', timeout: 60000 })
    await page.waitForFunction(() => window.__shotReady || window.__shotError, null, { timeout: 240000, polling: 500 })
    // tap the master output with an analyser
    await page.evaluate(() => {
      const a = window.game.audio
      const an = a.ctx.createAnalyser()
      an.fftSize = 8192
      a.comp.connect(an)
      window.__an = an
      window.__buf = new Float32Array(an.fftSize)
    })
    if (opt.zone) {
      // wrap the player in a test zone: --zone stairwell | underpass | metro | silence | shop
      await page.evaluate(kind => {
        const g = window.game, p = g.player.pos
        const silence = kind === 'silence'
        g.zones.add({ name: 'audio-test-' + kind, min: [p.x - 6, p.y - 4, p.z - 6], max: [p.x + 6, p.y + 6, p.z + 6], priority: 50,
          reverb: silence ? 'courtyard' : kind, indoor: !silence, silence, type: kind })
      }, String(opt.zone))
    }
    if (opt.step) await page.evaluate(s => { window.__stepSurface = { snow: 1, snow_packed: 2, ice: 3, slush: 4, concrete: 5, asphalt: 6, metal: 7, tile: 8 }[s] ?? 1 }, String(opt.step))
    if (opt.fire) {
      // fast-forward the director's far-event timers once (exercises every event path)
      await page.waitForTimeout(3000)
      const fired = await page.evaluate(h => {
        const d = window.__audioDirector, g = window.game
        if (h) g.atmos.setTime(parseFloat(h) * 60)
        d._env(0.1, d.engine, g)
        for (let k = 0; k < 6; k++) d._events(400, d.engine, g, d.env)
        return d.debug.events.slice()
      }, opt.firehour ?? null)
      console.log('fired:', fired.join(' | '))
    }
    const secs = +(opt.seconds ?? 30)
    const rows = []
    for (let s = 0; s < secs; s++) {
      await page.waitForTimeout(1000)
      const st = await page.evaluate(() => {
        const a = window.game.audio, an = window.__an, b = window.__buf
        an.getFloatTimeDomainData(b)
        let p = 0, sum = 0
        for (let i = 0; i < b.length; i++) { p = Math.max(p, Math.abs(b[i])); sum += b[i] * b[i] }
        const d = window.__audioDirector
        if (window.__stepSurface !== undefined && d) a.footstep(window.__stepSurface, { speed: 1.4, side: 1, zone: window.game.zone })
        return { state: a.ctx.state, time: a.ctx.currentTime.toFixed(1), peak: (20 * Math.log10(p + 1e-9)).toFixed(1), rms: (20 * Math.log10(Math.sqrt(sum / b.length) + 1e-9)).toFixed(1), stats: d ? d.stats() : null }
      })
      const d = st.stats
      rows.push(`${String(s + 1).padStart(3)}s g${d?.time ?? "-"} ctx ${st.state} t=${st.time} out peak ${st.peak} rms ${st.rms} | ${d ? `sil ${d.silence.state} music ${d.music.playing} emit ${d.emitters} beds ${JSON.stringify(d.beds)} bank w${d.bank.worker}/s${d.bank.sync} pend ${d.bank.pending} ${(d.bank.bytes / 1e6).toFixed(1)}MB` : 'no director'}`)
      if (opt.verbose && d) rows.push('     events: ' + d.events.join(' | '))
    }
    console.log(rows.join('\n'))
    const fin = await page.evaluate(() => window.__audioDirector?.stats())
    if (fin) console.log('env', JSON.stringify(fin.env), '\nevents', fin.events.join(' | '))
  } else {
    await page.goto(`${base}/tools/audio-test.html`, { waitUntil: 'load', timeout: 60000 })
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 })
    const t0 = Date.now()
    const bs = await page.evaluate(() => window.__audio.warm())
    console.log(`bank warm: ${((Date.now() - t0) / 1000).toFixed(1)} s, worker ${bs.worker} (${(bs.workerMs / 1000).toFixed(1)} s cpu), sync ${bs.sync}, ${(bs.bytes / 1e6).toFixed(1)} MB`)
    if (opt.steps) {
      for (const s of ['snow', 'snow_packed', 'ice', 'slush', 'concrete', 'asphalt', 'metal', 'tile', 'wood', 'linoleum', 'gravel', 'carpet', 'metal_grate']) {
        const r = await page.evaluate(([s, v]) => window.__audio.steps(s, v), [s, +(opt.speed ?? 1.38)])
        const f = savePng('steps_' + s, r.png)
        console.log(`steps ${s.padEnd(12)} peak ${r.peakDb} st ${r.stDb} nan ${r.nan} clicks ${r.clicks} → ${path.relative(root, f)}`)
      }
    } else if (opt.music) {
      const n = +opt.music || 1
      for (let k = 0; k < n; k++) {
        const seed = 2008 + k * 7919
        const r = await page.evaluate(([seed, s]) => window.__audio.music(seed, s), [seed, +(opt.seconds ?? 80)])
        const f = savePng('music_' + seed, r.png)
        console.log(`music ${seed} peak ${r.peakDb} rms ${r.rmsDb} st ${r.stDb} nan ${r.nan} clicks ${r.clicks} → ${path.relative(root, f)}`)
      }
    } else if (opt.spectro) {
      for (const spec of String(opt.spectro).split(',')) {
        const [name, json] = spec.split(':')
        const o = json ? JSON.parse(json.replace(/(\w+)=/g, '"$1":').replace(/^/, '{').replace(/$/, '}').replace(/;/g, ',')) : {}
        const png = await page.evaluate(([n, o, s]) => window.__audio.spectro(n, o, s), [name, o, opt.seconds ? +opt.seconds : null])
        console.log(path.relative(root, savePng(name + (json ? '_' + json : ''), png)))
      }
    } else {
      const names = opt.only ? String(opt.only).split(',') : await page.evaluate(() => window.__audio.names)
      const rows = []
      for (const name of names) {
        let r
        try { r = await page.evaluate(n => window.__audio.render(n, {}, null), name) } catch (e) { rows.push(`${name.padEnd(26)} ERROR ${e.message.split('\n')[0]}`); failed = true; continue }
        const flags = []
        if (r.nan) flags.push('NaN')
        if (r.silent) flags.push('SILENT')
        if (r.peakDb > -0.5) flags.push('CLIP')
        if (r.clicks > 2) flags.push(`clicks:${r.clicks}`)
        if (Math.abs(r.dc) > 0.01) flags.push('DC')
        if (r.stDb > -6) flags.push('LOUD')
        if (flags.some(f => f === 'NaN' || f === 'SILENT' || f === 'CLIP')) failed = true
        rows.push(`${name.padEnd(26)} ${r.loop ? 'loop' : 'once'} ${String(r.duration?.toFixed?.(1) ?? '-').padStart(5)}s act ${String(r.active).padStart(6)}s peak ${String(r.peakDb).padStart(6)} st ${String(r.stDb).padStart(6)} rms ${String(r.rmsDb).padStart(6)}  ${flags.join(' ')}`)
      }
      console.log(rows.join('\n'))
      if (!opt.only) {
        const seams = await page.evaluate(() => window.__audio.seams())
        const bad = seams.filter(s => s.ratio > 12)
        console.log(`loop seams checked: ${seams.length}, suspicious: ${bad.map(b => `${b.key}#${b.v} (${b.ratio})`).join(', ') || 'none'}`)
      }
      const bs2 = await page.evaluate(() => window.__audio.bankStats())
      console.log(`bank: ${(bs2.bytes / 1e6).toFixed(1)} MB, sync renders ${bs2.sync}`)
    }
  }
} catch (e) {
  failed = true
  console.log('FAILED', e.message)
}
const relevant = logs.filter(l => !l.includes('GPU stall') && !l.includes('Automatic fallback to software WebGL') && !l.includes('Feedback loop formed'))
if (relevant.length) console.log(relevant.slice(0, 40).join('\n'))
await browser.close()
await server.close()
process.exit(failed ? 1 : 0)
