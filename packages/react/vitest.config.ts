import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  // Test the SDK's current source (not a stale or missing dist); the Tailwind plugin compiles its CSS.
  resolve: { alias: [{ find: /^@heypointerhq\/sdk$/, replacement: fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url)) }] },
  test: { css: true, environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'] },
});
