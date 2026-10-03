# Munch Lab — rules for helper agents

Project: "Munch Lab", a polished 3D toy-like cooking sandbox web game (Three.js r186 + TypeScript + Vite),
inspired by Toca Kitchen's open-ended creativity but with its own identity: sunny pastel retro-diner kitchen,
soft rounded toy-like shapes, smooth shading (NOT flat low-poly), warm soft lighting, and a lilac fuzzy
creature customer named Mochi. Repo: /home/user/code.

- Only create/edit the files assigned to you. Read anything. Do NOT modify shared foundation files
  (src/food/types.ts, src/food/catalog.ts, src/models/kit.ts, src/models/types.ts, src/models/registry.ts,
  src/render/*, src/world/layout.ts, src/world/props/types.ts, src/world/palette.ts, src/viewer/*,
  src/food/visual.ts, src/food/forms.ts, src/game/*, src/stations/*, src/character/*). If you need a
  foundation change, describe it in your final report.
- Do NOT run git commands that change state (no commit/add/checkout/stash/reset). The lead commits.
- Keep `npx tsc --noEmit` clean for YOUR files (other areas may have unrelated errors while in progress —
  ignore errors outside your files).
- Dev server: http://localhost:5173 (check `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/viewer.html`).
  If it is down, start your own on a free port 5181-5189 (`npx vite --port 518X --host 127.0.0.1 > /tmp/vite-X.log 2>&1 &`)
  and prefix screenshot commands with SHOT_BASE=http://127.0.0.1:518X.
- Screenshots: `node tools/shot.mjs "<path?query>" <out.png> [width] [height]` (headless Chromium, software WebGL,
  a few seconds per shot). Save under /home/user/code/shots/<your-area>/ and LOOK at them with the Read tool.
  Iterate until it looks great, but be economical: 2-3 focused review rounds, not dozens.
- Quality bar: premium commercial mobile game. Food must look delicious and readable from a distance.
- Be token-efficient: don't re-read huge files repeatedly; read what you need.
- Final report: SHORT (what's done, deviations, requests).

Model-building conventions: see the header comments in src/models/kit.ts and src/models/types.ts (ModelDef
contract, cut styles, profile/section/sectionV/piece/forms/variant). Good finished examples to imitate:
src/models/meat.ts, src/models/bakery.ts, src/models/veg.ts (tomato, potato...), src/models/products.ts.
Viewer: /viewer.html?cat=<category>&cols=6&size=0.3 ; /viewer.html?ids=a,b&forms=whole,halved,sliced,diced&states=raw,fried,grilled,burnt,frozen,bitten,peeled&size=0.3
