// Two bundled handwriting fonts (SIL OFL 1.1, see fonts/OFL-*.txt) so that notes, cards and
// graffiti look hand-made on every machine, not only where Segoe Print / Comic Sans exist:
//   «LM Script» = Bad Script (Russian school cursive: ballpoint notes on entrance doors)
//   «LM Marker» = Neucha (felt-tip / spray-can block letters: shop cards, graffiti, chalk)
// Loading starts at import time (api.js imports this). Signs are drawn the moment a package
// calls a helper, so texts drawn before the fonts arrive are redrawn by the phone package's
// build() (see api.js redrawHandTexts) before the sign atlas is built.

const CYR = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116'
const LAT = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'

export const SCRIPT_FAMILY = 'LM Script'
export const MARKER_FAMILY = 'LM Marker'

let ready = false
let promise = null

function start() {
  if (promise) return promise
  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) {
    promise = Promise.resolve(false)
    return promise
  }
  const files = [
    [SCRIPT_FAMILY, new URL('./fonts/badscript-cyr.woff2', import.meta.url).href, CYR],
    [SCRIPT_FAMILY, new URL('./fonts/badscript-lat.woff2', import.meta.url).href, LAT],
    [MARKER_FAMILY, new URL('./fonts/neucha-cyr.woff2', import.meta.url).href, CYR],
    [MARKER_FAMILY, new URL('./fonts/neucha-lat.woff2', import.meta.url).href, LAT],
  ]
  const loads = files.map(([family, url, range]) => {
    try {
      const f = new FontFace(family, `url(${url}) format('woff2')`, { unicodeRange: range, display: 'block' })
      document.fonts.add(f)
      return f.load()
    } catch (e) {
      return Promise.reject(e)
    }
  })
  promise = Promise.all(loads).then(() => { ready = true; return true }, () => false)
  return promise
}
start()

/** True once both handwriting fonts can be used on a canvas. */
export function handFontsLoaded() { return ready }

/** Resolves true when the fonts are ready, false on failure or after `timeout` ms. */
export function handFontsReady(timeout = 5000) {
  return Promise.race([start(), new Promise(r => setTimeout(() => r(ready), timeout))])
}
