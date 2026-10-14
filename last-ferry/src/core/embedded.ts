// Assets embedded by the single-file build (tools/singlefile.mjs): a map from
// public path ("audio/x.wav", "fonts/x.ttf") to base64 data. Absent in the
// normal build, where assets are fetched from public/.

declare global {
  interface Window {
    __SH_ASSETS?: Record<string, string>;
  }
}

function table(): Record<string, string> | undefined {
  return (globalThis as { __SH_ASSETS?: Record<string, string> }).__SH_ASSETS;
}

/** Embedded asset bytes, or null when the asset is not embedded. */
export function embeddedBytes(path: string): ArrayBuffer | null {
  const b64 = table()?.[path];
  if (!b64) return null;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** data: URL for an embedded asset, or null when the asset is not embedded. */
export function embeddedDataUrl(path: string, mime: string): string | null {
  const b64 = table()?.[path];
  return b64 ? `data:${mime};base64,${b64}` : null;
}
