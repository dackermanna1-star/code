export const meta = {
  name: 'liminal-moscow-phase-c-qa',
  description: 'City-wide QA: route and lens critics find issues, findings are deduplicated and grouped, then one fixer per package verifies and fixes',
  phases: [
    { title: 'Critique', detail: 'route walkers and specialist lenses report evidence-backed findings' },
    { title: 'Fix', detail: 'one agent per owning package verifies each finding and fixes the real ones' },
  ],
}

// args: { critics?: string[] (subset of CRITICS keys), maxFixers?: number }

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pkg: { type: 'string', description: 'owning package folder under src/content (or "engine" for src/core|render|game|player|audio|ui)' },
          where: { type: 'string', description: 'world location "x,z" (and y if relevant) or file:line' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'polish'] },
          title: { type: 'string' },
          detail: { type: 'string', description: 'what is wrong, how to reproduce (tools/shot.mjs or tools/walk.mjs command), why it matters for the brief' },
          fix: { type: 'string', description: 'suggested fix' },
          evidence: { type: 'string', description: 'screenshot path(s) or walk output' },
        },
        required: ['pkg', 'where', 'severity', 'title', 'detail', 'fix'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['findings'],
}

const FIXREPORT = {
  type: 'object',
  properties: {
    pkg: { type: 'string' },
    fixed: { type: 'array', items: { type: 'string' } },
    rejected: { type: 'array', items: { type: 'string' }, description: 'findings that did not reproduce or were not worth it, with reason' },
    deferred: { type: 'array', items: { type: 'string' } },
    engineRequests: { type: 'array', items: { type: 'string' } },
  },
  required: ['pkg', 'fixed', 'rejected', 'deferred'],
}

const COMMON = `You are a QA critic for LIMINAL MOSCOW (browser voxel walking simulator, Three.js, repo /home/user/code). Read docs/BRIEF.md, docs/PLAN.md, docs/ENGINE.md (including "QA tools") and docs/RESUME.md first; the catalogs in docs/catalog/*.md tell you what each package owns and where things are. Tools: node tools/shot.mjs (in-world screenshots: --at "x,z,yaw[,y]" --t HH:MM --weather ... --w 960 --h 540; --profile) and node tools/walk.mjs (scripted walkthroughs; write scenario files under tools/walks/). Rendering is software and slow (10–60 s per shot, a machine-wide queue of 2): be purposeful, batch several --at positions per call. DO NOT edit any source files and DO NOT run git — you only report. Report only real, evidence-backed problems (with the command that reproduces them), each attributed to the package that owns the code (src/content/<pkg>/ or "engine"). Prefer fewer, sharper findings over long lists; rank by how much they hurt the player's experience of the brief.`

const CRITICS = {
  route_spawn_home: `ROUTE: the first ten minutes. Start at the spawn (x 248, z 515.5, facing north, 16:38, light snow): the trolleybus stop, cross into Block D (home courtyard), find корп. 2 подъезд 3, open the door, climb the stairwell, call and ride the lift. Judge the first impression, readability of the way in, lighting and mood, physical snags (use tools/walk.mjs), stairwell and lift behaviour, texts.`,
  route_shop: `ROUTE: from Block D's courtyard to the «ПРОДУКТЫ» shop in Block E, buy bread, then walk through Blocks B and C (towers, kindergarten, hockey box, garages, long building). Judge wayfinding (can you find the shop from the courtyard?), composition, pools of light vs darkness, physical snags, interaction flow.`,
  route_park_north: `ROUTE: the park (birch grove, frozen pond, lanterns, memorial) at dusk and at night, then ул. Заводская, the heat pipe, garages, boiler house and the railway with the elektrichka. Judge the 'peaceful by day, disorienting at night' park, the chimney as a landmark, physical snags, empty or cluttered areas.`,
  route_avenue_metro: `ROUTE: walk the avenue east from the spawn to the bus terminal and back, cross via the underpass, enter the metro, ride the escalator down to the platform, wait for a train. Judge traffic, trolleybuses, kiosks, the underpass mood, metro lighting/exposure, escalators (use tools/walk.mjs), the train arrival.`,
  route_edges: `ROUTE: Block F (the repeat of the home courtyard), the eastern blocks, then walk off each edge of the map into the whiteout and wrap around (west along the avenue, north past the railway, east, south). Judge seams between districts, the whiteout/wrap (no visible void, no spawning inside geometry), and repetition that feels intentional rather than broken.`,
  lens_performance: `LENS: performance. Measure load time, draw calls, triangles and CPU frame cost (tools/shot.mjs --profile --frames 40) at 8 representative viewpoints (spawn, a courtyard, the park, the avenue looking along it, the metro platform, a tower close-up, the boiler house, an overview from a high point). Find the worst offenders (models, lights, per-frame systems in content update() functions) in code. Report concrete, high-impact fixes (LOD distances, maxDistance, instancing, light counts, update throttling).`,
  lens_interactions: `LENS: interactions and gameplay. Write and run tools/walk.mjs scenarios that exercise: every enterable door (residential stairwells, shop, pharmacy), lifts, benches (sit/stand), notices (read), the phone (open with game.phone), the shop purchase, the metro turnstiles/escalators/train doors, walking along every main sidewalk and driveway (stuck detection). Report every failure with the scenario file.`,
  lens_art: `LENS: art direction. At 4 times (13:00, 16:45, 21:00, 03:00) and in heavy snow and fog, shoot 12+ views across the city and compare against docs/BRIEF.md and the reference descriptions: palette restraint, sodium-vs-cold contrast, lit-window density, fog depth, snow everywhere it should be, period authenticity, signage legibility, anything cartoonish or broken (z-fighting, floating objects, obviously repeated props side by side, holes into the void, overexposed or pitch-black areas).`,
}

phase('Critique')
const chosen = (args && args.critics) || Object.keys(CRITICS)
const reports = await parallel(chosen.map(k => () =>
  agent(`${COMMON}\n\n${CRITICS[k]}`, { label: `critic:${k}`, phase: 'Critique', schema: FINDINGS })
    .then(r => ({ critic: k, ...(r || { findings: [] }) }))))

// group by owning package (barrier: dedupe across all critics)
const byPkg = new Map()
for (const r of reports.filter(Boolean)) {
  for (const f of r.findings || []) {
    const key = (f.pkg || 'engine').replace(/^src\/content\//, '').split('/')[0]
    if (!byPkg.has(key)) byPkg.set(key, [])
    byPkg.get(key).push({ ...f, critic: r.critic })
  }
}
const total = [...byPkg.values()].reduce((n, l) => n + l.length, 0)
log(`${total} findings across ${byPkg.size} packages: ${[...byPkg.entries()].map(([k, l]) => `${k}=${l.length}`).join(', ')}`)

phase('Fix')
const order = { blocker: 0, major: 1, minor: 2, polish: 3 }
const pkgs = [...byPkg.keys()].filter(k => k !== 'engine')
const fixes = await parallel(pkgs.map(pkg => () => {
  const list = byPkg.get(pkg).sort((a, b) => order[a.severity] - order[b.severity])
  return agent(`You now own the package src/content/${pkg}/ (and docs/catalog/${pkg}.md) for a QA fix pass on LIMINAL MOSCOW (repo /home/user/code). Read docs/specs/_common.md (rules; replace <PKG> with "${pkg}"; never run git; edit only your package), docs/BRIEF.md, docs/PLAN.md, docs/ENGINE.md, and your catalog. Critics reported the findings below. For EACH: reproduce it first (tools/shot.mjs / tools/walk.mjs), then fix it if real and worth it, verify the fix the same way, or reject it with a reason. Work from blockers down. Keep the catalog accurate. Make sure 'npx vite build --outDir tools/out/build-${pkg} --emptyOutDir' passes.

FINDINGS:
${JSON.stringify(list, null, 2)}`, { label: `fix:${pkg}`, phase: 'Fix', schema: FIXREPORT })
}))

return { findings: Object.fromEntries(byPkg), fixes: fixes.filter(Boolean) }
