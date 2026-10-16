export const meta = {
  name: 'liminal-moscow-phase-a',
  description: 'Build Phase A content packages (assets & systems), then art-direct and polish each',
  phases: [
    { title: 'Build', detail: 'one agent per content package' },
    { title: 'Polish', detail: 'art director / QA reviews and fixes each package' },
  ],
}

const REPORT = {
  type: 'object',
  properties: {
    pkg: { type: 'string' },
    summary: { type: 'string', description: 'what was built, 5-15 sentences' },
    models: { type: 'array', items: { type: 'string' }, description: 'model names defined' },
    apis: { type: 'array', items: { type: 'string' }, description: 'exported helper signatures' },
    soundsUsed: { type: 'array', items: { type: 'string' } },
    registryKeys: { type: 'array', items: { type: 'string' } },
    engineRequests: { type: 'array', items: { type: 'string' }, description: 'engine changes needed (with reason)' },
    knownIssues: { type: 'array', items: { type: 'string' } },
  },
  required: ['pkg', 'summary', 'models', 'apis', 'engineRequests', 'knownIssues'],
}

const pkgs = args.packages
const buildPrompt = pkg => `Your package is "${pkg}".

Read docs/specs/_common.md FIRST (rules, testing, deliverables — replace <PKG> with "${pkg}"), then your package spec docs/specs/${pkg}.md, then the docs it points to. Build the package completely and to a high standard, verifying visually with tools/shot.mjs as described. When done, return the structured report.`

const reviewPrompt = (pkg, built) => `Your package is "${pkg}".

Read docs/specs/_review.md (your role for this pass; replace <PKG> with "${pkg}"), docs/specs/_common.md (rules and testing; same <PKG>), and the original package spec docs/specs/${pkg}.md.

The builder's report:
${JSON.stringify(built ?? { note: 'builder report missing — inspect the package directly' }, null, 2)}

Review critically, fix, verify, and return the structured report (merge the builder's lists with your changes; engineRequests and knownIssues must reflect the final state).`

const results = await pipeline(
  pkgs,
  pkg => agent(buildPrompt(pkg), { label: `build:${pkg}`, phase: 'Build', schema: REPORT }),
  (built, pkg) => agent(reviewPrompt(pkg, built), { label: `polish:${pkg}`, phase: 'Polish', schema: REPORT })
    .then(r => r ?? built),
)
return results
