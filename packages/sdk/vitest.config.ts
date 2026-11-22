import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [tailwindcss()],
  define: { __GF_DEV__: 'true' },
  test: { css: true, environment: 'jsdom', include: ['test/**/*.test.ts'] },
});
