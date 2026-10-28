/**
 * Single-file build: the whole simulator in one self-contained HTML page that
 * opens straight from disk (file://), with no server and no other files.
 *
 *   npm run build:html   →   dist-html/infinite-cosmos.html
 *
 * Workers become inline (blob) classic workers, and the script and styles
 * are inlined into the page. Only the web fonts are fetched; without a
 * connection the page falls back to system fonts.
 */
import { defineConfig, type Plugin } from 'vite';

/** `new Worker(new URL('./x.ts', import.meta.url), …)` → an inlined `?worker&inline` import. */
function inlineWorkers(): Plugin {
  const re = /new Worker\(\s*new URL\(\s*(['"])([^'"]+)\1\s*,\s*import\.meta\.url\s*\)\s*,\s*\{[^}]*\}\s*\)/g;
  return {
    name: 'inline-workers',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.ts$/.test(id) || !code.includes('new Worker(')) return null;
      const imports: string[] = [];
      const out = code.replace(re, (_m, _q, path: string) => {
        const name = `__InlineWorker${imports.length}`;
        imports.push(`import ${name} from ${JSON.stringify(`${path}?worker&inline`)};`);
        return `new ${name}()`;
      });
      return imports.length ? { code: `${imports.join('\n')}\n${out}`, map: null } : null;
    },
  };
}

/** Inline the entry script and stylesheet into index.html and drop them from the output. */
function singleFile(): Plugin {
  return {
    name: 'single-file',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'));
      if (!html || html.type !== 'asset') return;
      let page = String(html.source);
      for (const [name, f] of Object.entries(bundle)) {
        const ref = new RegExp(`<script[^>]*src="[./]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*></script>`);
        if (f.type === 'chunk' && ref.test(page)) {
          // (no "</script" may appear inside an inline script)
          page = page.replace(ref, () => `<script type="module">\n${f.code.replace(/<\/script/gi, '<\\/script')}\n</script>`);
          delete bundle[name];
        } else if (f.type === 'asset' && name.endsWith('.css')) {
          const link = new RegExp(`<link[^>]*href="[./]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`);
          page = page.replace(link, () => `<style>\n${String(f.source)}\n</style>`);
          delete bundle[name];
        }
      }
      page = page.replace(/<link rel="modulepreload"[^>]*>\n?/g, '');
      html.source = page;
      html.fileName = 'infinite-cosmos.html';
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [inlineWorkers(), singleFile()],
  // classic (IIFE) workers: Chrome refuses module workers from blob URLs on file:// pages
  worker: { format: 'iife' },
  build: {
    target: 'es2022',
    outDir: 'dist-html',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    modulePreload: false,
    chunkSizeWarningLimit: 10000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
