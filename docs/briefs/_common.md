# Common rules for every implementation agent

Project: an incredibly realistic, deeply interactive, fully destructible first-person
apartment destruction sandbox — Babylon.js 9.30.0 game engine + Havok physics, TypeScript,
Vite, WebGL2. Repo: /home/user/code. Late-PS2-era low-poly look elevated by modern rendering.
Core priority: maximum interactivity, physical realism and freedom; no fake destruction, no
indestructible decorative objects, no scripted animations pretending to be physics; every
hit matters, every object breaks differently; large amounts of debris at good performance.

Before coding, READ: `docs/ARCHITECTURE.md` (whole), the contract files you implement or
consume (`src/core/*.ts`, `src/geom/*.ts`, `src/destruction/model/*.ts`,
`src/render/surfaces.ts`, `src/render/contracts.ts`, `src/player/contracts.ts`,
`src/objects/lib/builder.ts`, `src/world/plan.ts` as relevant) and the relevant verified
engine notes in `docs/api-notes/` (trust them over memory; if a note is missing because its
author is still working, read the installed sources under node_modules/@babylonjs/core).

Conventions (mandatory):
- Babylon imports ONLY from the package root: `import { Mesh, Vector3 } from "@babylonjs/core";`
  (Babylon 9 turns un-imported side-effect methods into silent no-op stubs).
- Relative imports include the `.ts` extension. Erasable TypeScript only (no `enum`,
  `namespace`, or constructor parameter properties) — `tsconfig` enforces `erasableSyntaxOnly`.
- Pure modules (`src/geom/**`, `src/destruction/model/**`, `src/objects/**`, `src/world/plan.ts`,
  `src/world/structure*`) must not import Babylon; they use `Vec3` from `src/geom/vec.ts`.
- Units: metres, kg, s, N, J. Y up. Babylon is left-handed: +X east/right, +Z north/forward.
- Keep exported contract signatures stable. Implement stubs in files you own; add new files
  freely inside your own directories. If you need a contract change, implement the best
  workaround and describe the requested change in your final report.
- File ownership: only edit files in your module's paths (listed in your brief). ~10 agents
  work concurrently in this same working tree. Never run git commands that change state
  (no commit/checkout/stash/reset/clean). Other agents' files may be mid-edit: when you
  typecheck, filter to your paths, e.g. `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/(geom)/"`.
- Testing: pure code → Node unit tests `tests/unit/<module>-*.test.ts` run with
  `node --test tests/unit/<module>-*.test.ts` (Node 22 strips types natively; imports need
  `.ts` extensions). Engine code → runtime probes: `tests/probes/<module>-*.probe.ts`
  exporting `export async function probe(): Promise<any>`, run
  `node tests/probe.mjs tests/probes/<file> [--screenshot /tmp/claude-0/<module>-x.png]`
  (headless Chromium, SwiftShader WebGL2; GPU timings meaningless, CPU timings indicative but
  noisy since other agents run probes concurrently on this 4-CPU machine). Look at
  screenshots with the Read tool and judge them critically.
- If you depend on another module that is still a stub ("not implemented" throws), write your
  code against the contract and test the rest; to wait for it, run a Bash command with
  run_in_background that polls (e.g. `until ! grep -q "not implemented" src/geom/poly.ts; do sleep 20; done`)
  and continue other work meanwhile. Do not implement other agents' modules yourself.
- Quality bar: production-quality, robust (no NaN, no leaks, guard edge cases), readable,
  commented where non-obvious, performance-conscious (no per-frame allocations in hot paths
  where avoidable). No placeholder stubs left in your area. Realism and physical plausibility
  matter: use real-world dimensions, masses and behaviours.
- Final reply (returned to the orchestrator, keep it under ~40 lines): files created/changed,
  public API summary, how you verified (tests/probes and their results), known limitations,
  and any contract change requests.
