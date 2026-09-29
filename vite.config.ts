import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';

// Versions must match package.json for the CDN import map (artifact build).
const THREE = '0.186.1';
const POST = '6.39.5';
const N8AO = '2.0.1';

/**
 * `vite build --mode artifact`: a lean bundle of the game's own code for
 * hosting as a web page. three.js, postprocessing and n8ao load from
 * jsDelivr through an import map; the Latin font subsets are embedded.
 */
function artifactHtml(): Plugin {
  return {
    name: 'artifact-html',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => {
        const map = {
          imports: {
            three: `https://cdn.jsdelivr.net/npm/three@${THREE}/build/three.module.js`,
            'three/examples/jsm/': `https://cdn.jsdelivr.net/npm/three@${THREE}/examples/jsm/`,
            postprocessing: `https://cdn.jsdelivr.net/npm/postprocessing@${POST}/build/index.js`,
            n8ao: `https://cdn.jsdelivr.net/npm/n8ao@${N8AO}/dist/N8AO.js`,
          },
        };
        const head = `<script type="importmap">${JSON.stringify(map)}</script>\n`;
        return html.replace('<head>', `<head>\n${head}`);
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  const artifact = mode === 'artifact';
  const empty = fileURLToPath(new URL('./src/empty.css', import.meta.url));
  const latinFonts = fileURLToPath(new URL('./src/fonts-latin.css', import.meta.url));
  return {
    base: './',
    plugins: artifact ? [artifactHtml()] : [],
    resolve: artifact
      ? { alias: { '@fontsource-variable/fredoka': latinFonts, '@fontsource-variable/nunito': empty } }
      : {},
    build: {
      target: 'es2022',
      outDir: single ? 'dist-single' : artifact ? 'dist-artifact' : 'dist',
      assetsInlineLimit: single ? 100_000_000 : artifact ? 200_000 : 4096,
      chunkSizeWarningLimit: 4000,
      cssCodeSplit: !single && !artifact,
      rollupOptions: single
        ? { output: { inlineDynamicImports: true } }
        : artifact
          ? { external: ['three', 'postprocessing', 'n8ao', /^three\/examples\/jsm\//], output: { inlineDynamicImports: true } }
          : {},
    },
    server: { host: true, port: 5173 },
  };
});
