# CORRODE

A singleplayer voxel survival sandbox: Minecraft-style block world and freedom, Rust-style hardcore survival, base building and raiding. Runs entirely in the browser (WebGL2); the authoritative game simulation runs in a Web Worker and saves to IndexedDB.

```bash
npm install
npm run dev        # build + serve on http://localhost:8080
npm test           # unit/integration tests (vitest)
npm run e2e        # headless-browser smoke test (Playwright + Chromium)
npm run typecheck
```

Docs: [docs/RESEARCH.md](docs/RESEARCH.md) (cited research), more in `docs/`.
