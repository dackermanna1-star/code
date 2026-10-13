// Where a file under public/ is fetched from. The single-file build (tools/singlefile.mjs)
// fills window.__cs16Assets with a data: URL for every public/maps/* file (lightmaps,
// thumbnails), keyed by its path ('maps/de_dust2.lm.png'); otherwise it sits next to the page.
export function assetUrl(path) {
  const t = globalThis.__cs16Assets;
  if (t && t[path]) return t[path];
  return `${import.meta.env?.BASE_URL ?? './'}${path}`;
}

/** Is this asset inlined in the page (single-file build)? */
export function assetInlined(path) {
  return !!globalThis.__cs16Assets?.[path];
}
