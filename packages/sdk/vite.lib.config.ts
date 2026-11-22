import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// The npm entry points: ESM for bundlers (`.` and `./element`). styles.css is imported with ?inline,
// so the compiled Tailwind CSS ends up as a string inside the JS and consumers need no Tailwind plugin.
// Non-destructive on purpose: `npm run clean` removes dist; builds only overwrite.
export default defineConfig({
  plugins: [tailwindcss()],
  define: { __GF_DEV__: 'false' }, // dev-only warnings are compiled out of the shipped bundles
  build: {
    lib: { entry: { index: 'src/index.ts', element: 'src/element.ts', author: 'src/author/index.ts' }, formats: ['es'], fileName: (_format, name) => `${name}.js` },
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2020',
    // Logical properties (inset-inline-end...) must stay as written: an older CSS target rewrites them into :lang() fallbacks that follow the language, not the text direction.
    cssTarget: ['chrome100', 'safari15.4', 'firefox100'],
    rollupOptions: { output: { chunkFileNames: 'chunk-[name].js' } },
  },
});
