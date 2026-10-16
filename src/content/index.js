// Content packages are auto-discovered: every folder in src/content/ with an index.js that
// default-exports { name, order?, build?(ctx), init?(ctx), update?(dt, ctx) }.
// A package that fails to import is skipped (logged) so one broken package never takes the
// whole city down.

const packages = import.meta.glob('./*/index.js')

export async function loadContentModules(only = null, onProgress) {
  const entries = Object.entries(packages)
    .map(([path, load]) => ({ name: path.split('/')[1], load }))
    .filter(e => !only || only.includes(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  const out = []
  let n = 0
  await Promise.all(entries.map(async e => {
    try {
      const mod = await e.load()
      const m = mod.default
      if (m) out.push({ name: e.name, ...m })
    } catch (err) {
      console.error(`[content] failed to load package "${e.name}"`, err)
      window.__contentErrors = (window.__contentErrors || []).concat(`${e.name}: ${err.message}`)
    }
    onProgress?.(++n / entries.length, e.name)
  }))
  return out
}
