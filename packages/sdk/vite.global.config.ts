import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// One self-contained file for <script> tags: player, element and compiled Tailwind CSS.
export default defineConfig({
  plugins: [tailwindcss()],
  define: { __GF_DEV__: 'false' }, // dev-only warnings are compiled out of the shipped bundles
  // Author mode is a separate file (heypointer.author.js): a script-tag page must not carry it, so its ESM import resolves to a stub here.
  resolve: { alias: [{ find: /^\.\/author-import$/, replacement: fileURLToPath(new URL('./src/author-import.iife.ts', import.meta.url)) }] },
  build: {
    lib: { entry: 'src/global.ts', name: 'HeyPointerGlobal', formats: ['iife'], fileName: () => 'heypointer.global.js' },
    outDir: 'dist',
    emptyOutDir: false, // vite.lib.config.ts shares dist; `npm run clean` removes stale output
    sourcemap: true,
    target: 'es2020',
    // Logical properties (inset-inline-end...) must stay as written: an older CSS target rewrites them into :lang() fallbacks that follow the language, not the text direction.
    cssTarget: ['chrome100', 'safari15.4', 'firefox100'],
  },
});
