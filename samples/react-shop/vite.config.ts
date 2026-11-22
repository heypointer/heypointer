import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tailwind compiles the guide's shadow-root stylesheet, which @heypointerhq/sdk imports from source here.
export default defineConfig({ plugins: [react(), tailwindcss()] });
