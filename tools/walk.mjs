#!/usr/bin/env node
// Scripted walkthrough tests: drive the player headlessly through the real game logic (collision,
// stairs, doors, lifts, escalators, zones) at simulation speed — no rendering needed — and report
// where the player gets stuck, falls, or cannot reach something.
//
//   node tools/walk.mjs tools/walks/home.json [more.json ...] [--base URL] [--shots]
//
// Scenario JSON:
// {
//   "name": "home",
//   "query": "wip=1",                         // extra URL parameters (e.g. only=..., wip=1)
//   "start": { "x": 248, "z": 515.5, "yaw": 0, "t": "17:00" },
//   "steps": [
//     { "to": [230, 470] },                   // walk to (x,z); add "brisk": true for Shift
//     { "to": [231, 461], "tol": 0.4 },       // arrival tolerance (default 0.6 m)
//     { "use": "nearest", "within": 2.5 },    // trigger the nearest interaction (like pressing E)
//     { "use": "Открыть" },                    // ...or the nearest whose prompt contains this text
//     { "wait": 3 },                          // let the world run (doors, lifts, trains)
//     { "expectZone": "stairwell" },          // fail if the current zone's reverb/name/type differs
//     { "expectY": [2.5, 4] },                // fail if feet height is outside the range
//     { "teleport": [x, y, z] },
//     { "shot": "landing" }                   // render a frame and save tools/out/walk_<name>_<shot>.png
//   ]
// }
// Exit code 1 if any step failed.

import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let chromium
try { ({ chromium } = require('playwright')) } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')) }

const argv = process.argv.slice(2)
const files = argv.filter(a => !a.startsWith('--') && a.endsWith('.json'))
const baseArg = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : null
const doShots = argv.includes('--shots')
if (!files.length) { console.log('usage: node tools/walk.mjs scenario.json [...] [--base URL] [--shots]'); process.exit(2) }
mkdirSync(path.join(root, 'tools', 'out'), { recursive: true })

let server = null
let base = baseArg
if (!base) {
  const { createServer } = await import('vite')
  server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } })
  await server.listen()
  base = `http://127.0.0.1:${server.httpServer.address().port}`
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let anyFail = false

for (const file of files) {
  const sc = JSON.parse(readFileSync(file, 'utf8'))
  const s = sc.start || {}
  const q = [`shot=1`, `frames=3`, `timescale=0`, `x=${s.x}`, `z=${s.z}`, `yaw=${s.yaw ?? 0}`, `t=${s.t ?? '17:00'}`]
  if (s.y !== undefined) q.push(`y=${s.y}`)
  if (sc.query) q.push(sc.query)
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  console.log(`\n=== ${sc.name || file}`)
  try {
    await page.goto(`${base}/?${q.join('&')}`, { timeout: 120000 })
    await page.waitForFunction(() => window.__shotReady || window.__shotError, null, { timeout: 600000, polling: 500 })
    await page.evaluate(() => { window.game.paused = true })
    for (let i = 0; i < sc.steps.length; i++) {
      const step = sc.steps[i]
      if (step.shot) {
        if (!doShots && !step.always) continue
        await page.evaluate(() => {
          const g = window.game
          g.player.applyCamera(g.camera, g.time)
          g._updateWorld(0.016)
          g.post.render(0.016, g.time)
        })
        const out = path.join(root, 'tools', 'out', `walk_${(sc.name || 'walk').replace(/\W+/g, '_')}_${step.shot}.png`)
        await page.screenshot({ path: out, timeout: 300000 })
        console.log(`  [shot] ${out}`)
        continue
      }
      const r = await page.evaluate(runStep, step)
      const tag = r.ok ? 'ok  ' : 'FAIL'
      if (!r.ok) anyFail = true
      console.log(`  ${tag} #${i} ${JSON.stringify(step)} → ${r.msg} @ (${r.pos.map(v => v.toFixed(2)).join(', ')}) zone=${r.zone}`)
      if (!r.ok && !step.optional) break
    }
  } catch (e) {
    anyFail = true
    console.log(`  ERROR ${e.message}`)
  }
  if (errors.length) console.log('  page errors:\n   ' + errors.slice(0, 12).join('\n   '))
  await page.close()
}
await browser.close()
if (server) await server.close()
process.exit(anyFail ? 1 : 0)

// ---------------------------------------------------------------------------------------------
// Runs inside the page.
function runStep(step) {
  const g = window.game
  const p = g.player
  const DT = 1 / 30
  const res = (ok, msg) => ({ ok, msg, pos: [p.pos.x, p.pos.y, p.pos.z], zone: g.zone?.name ?? g.zone?.reverb ?? 'outside' })
  const sim = (sec, keys = new Set(), press = new Set()) => {
    const n = Math.ceil(sec / DT)
    for (let i = 0; i < n; i++) g.simStep(DT, keys, i === 0 ? press : new Set())
  }
  if (step.wait) { sim(step.wait); return res(true, `waited ${step.wait}s`) }
  if (step.teleport) {
    const [x, y, z] = step.teleport
    p.teleport(x, y, z, step.yaw ?? p.yaw)
    sim(0.2)
    return res(true, 'teleported')
  }
  if (step.expectZone) {
    const z = g.zone || {}
    const ok = [z.name, z.reverb, z.type].includes(step.expectZone)
    return res(ok, ok ? 'zone ok' : `expected zone ${step.expectZone}`)
  }
  if (step.expectY) {
    const [a, b] = step.expectY
    const ok = p.pos.y >= a && p.pos.y <= b
    return res(ok, ok ? 'height ok' : `expected y in [${a}, ${b}]`)
  }
  if (step.use) {
    const eye = { x: p.pos.x, y: p.pos.y + 1.6, z: p.pos.z }
    const within = step.within ?? 2.6
    let best = null, bd = Infinity
    for (const it of g.interactions.list) {
      const en = typeof it.enabled === 'function' ? it.enabled(g) : it.enabled
      if (!en) continue
      const d = Math.hypot(it.x - eye.x, it.y - eye.y, it.z - eye.z)
      if (d > within) continue
      if (step.use !== 'nearest') {
        const pr = typeof it.prompt === 'function' ? it.prompt(g, it) : it.prompt
        const txt = `${pr?.ru ?? ''} ${pr?.en ?? ''}`
        if (!txt.toLowerCase().includes(String(step.use).toLowerCase())) continue
      }
      if (d < bd) { bd = d; best = it }
    }
    if (!best) return res(false, `no interaction "${step.use}" within ${within} m`)
    // face it, then use it
    p.yaw = Math.atan2(-(best.x - p.pos.x), -(best.z - p.pos.z))
    const pr = typeof best.prompt === 'function' ? best.prompt(g, best) : best.prompt
    try { best.onUse?.(g, best) } catch (e) { return res(false, `onUse threw: ${e.message}`) }
    sim(0.3)
    return res(true, `used "${pr?.ru ?? '?'}" (${bd.toFixed(1)} m)`)
  }
  if (step.to) {
    const [tx, tz] = step.to
    const tol = step.tol ?? 0.6
    const keys = new Set(['KeyW'])
    if (step.brisk) keys.add('ShiftLeft')
    const dist0 = Math.hypot(tx - p.pos.x, tz - p.pos.z)
    const limit = step.timeout ?? dist0 / 0.9 + 25
    let t = 0, lastCheck = 0, lastPos = [p.pos.x, p.pos.z], unstick = 0
    const y0 = p.pos.y
    while (t < limit) {
      const dx = tx - p.pos.x, dz = tz - p.pos.z
      const d = Math.hypot(dx, dz)
      if (d < tol) return res(true, `arrived in ${t.toFixed(1)}s (${dist0.toFixed(1)} m)`)
      p.yaw = Math.atan2(-dx, -dz)
      g.simStep(DT, keys)
      t += DT
      if (p.pos.y < y0 - 6 && !step.allowFall) return res(false, `fell ${(y0 - p.pos.y).toFixed(1)} m`)
      if (t - lastCheck > 2.5) {
        const moved = Math.hypot(p.pos.x - lastPos[0], p.pos.z - lastPos[1])
        if (moved < 0.25) {
          if (unstick++ >= 3) return res(false, `stuck ${d.toFixed(1)} m short`)
          // try sidestepping around the obstacle
          const side = unstick % 2 ? 'KeyA' : 'KeyD'
          sim(0.8, new Set([side]))
          sim(0.6, new Set(['KeyW', side]))
        }
        lastCheck = t
        lastPos = [p.pos.x, p.pos.z]
      }
    }
    return res(false, `timeout ${Math.hypot(tx - p.pos.x, tz - p.pos.z).toFixed(1)} m short`)
  }
  return res(false, 'unknown step')
}
