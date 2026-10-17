export const meta = {
  name: 'liminal-moscow-phase-b',
  description: 'Lay out the city districts (level design) using the phase A catalogs, then review and polish each district',
  phases: [
    { title: 'Layout', detail: 'one level-designer agent per district package' },
    { title: 'Polish', detail: 'second level designer walks the district, fixes composition and bugs' },
  ],
}

const REPORT = {
  type: 'object',
  properties: {
    pkg: { type: 'string' },
    summary: { type: 'string', description: 'what was built, 5-15 sentences' },
    landmarks: { type: 'array', items: { type: 'string' }, description: 'notable places with coordinates (x,z) a player should see' },
    enterable: { type: 'array', items: { type: 'string' }, description: 'enterable doors / interiors with coordinates' },
    lightsCount: { type: 'number' },
    engineRequests: { type: 'array', items: { type: 'string' } },
    crossPackageIssues: { type: 'array', items: { type: 'string' }, description: 'problems in OTHER packages noticed (with file/model and suggested fix)' },
    knownIssues: { type: 'array', items: { type: 'string' } },
  },
  required: ['pkg', 'summary', 'landmarks', 'engineRequests', 'crossPackageIssues', 'knownIssues'],
}

const buildPrompt = pkg => `Your package is "${pkg}" (a district LAYOUT package).

Read, in order: docs/specs/_layout_common.md (your role and rules — replace <PKG> with "${pkg}"), docs/specs/_common.md (hard rules, testing tools; same <PKG>), your district spec docs/specs/${pkg}.md, docs/BRIEF.md, docs/PLAN.md, docs/ENGINE.md, and EVERY catalog in docs/catalog/ (the asset & system packages you compose with; the _phaseA_reports_*.md files list their known limitations). Use src/content/base/api.js for ground painting. NOTE: src/content/${pkg}/ already contains a partial first pass written by a previous level designer who was interrupted mid-way (unreviewed, possibly incomplete or missing index.js); read it, keep what is good, fix or restructure what is not, and finish it. District packages are gated as work-in-progress in src/content/index.js — the game loads them only when named in ?only=… or with ?wip=1, so test seams with neighbours via 'node tools/shot.mjs --wip …' (or an explicit --only list). Build the district completely, verify with in-world screenshots along the routes a player would walk (dusk, night and day), fix what looks wrong, write docs/catalog/${pkg}.md, and return the structured report.`

const reviewPrompt = (pkg, built) => `Your package is "${pkg}" (a district LAYOUT package).

Read docs/specs/_review.md (your role for this pass; replace <PKG> with "${pkg}"), docs/specs/_layout_common.md and docs/specs/_common.md (rules and testing; same <PKG>), the district spec docs/specs/${pkg}.md, docs/BRIEF.md and docs/PLAN.md, then the package code and its catalog.

The level designer's report:
${JSON.stringify(built ?? { note: 'builder report missing — inspect the package directly' }, null, 2)}

Walk the district as a player would (in-world shots at eye height along sidewalks, paths, through courtyards and entrances; at 16:45 dusk, 21:00 night, 13:00 day; with light snow and with heavy snow), and fix: composition (empty or cluttered areas, missing pools of light, weak first impressions, no landmarks in view), physical bugs (floating or buried objects, overlaps between buildings/trees/lamps/cars, blocked entrances, unreachable doors, snow walls without gaps), seams with neighbouring districts, and anything that breaks the 2008 Moscow authenticity or the quiet, lonely mood. Then return the structured report.`

const results = await pipeline(
  args.packages,
  pkg => agent(buildPrompt(pkg), { label: `layout:${pkg}`, phase: 'Layout', schema: REPORT }),
  (built, pkg) => agent(reviewPrompt(pkg, built), { label: `polish:${pkg}`, phase: 'Polish', schema: REPORT }).then(r => r ?? built),
)
return results
