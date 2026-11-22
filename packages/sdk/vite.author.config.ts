import { defineConfig } from 'vite';

// Author mode (record steps) as its own script-tag file. Never part of heypointer.global.js.
export default defineConfig({
  define: { __GF_DEV__: 'false' },
  build: {
    lib: { entry: 'src/author/global.ts', name: 'HeyPointerAuthorGlobal', formats: ['iife'], fileName: () => 'heypointer.author.js' },
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2020',
  },
});
