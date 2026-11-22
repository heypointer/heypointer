import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

// Tailwind compiles the guide's shadow-root stylesheet, which @heypointerhq/sdk imports from source here.
export default defineConfig({ plugins: [vue(), tailwindcss()] });
