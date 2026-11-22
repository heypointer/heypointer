// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tailwind compiles the guide's shadow-root stylesheet, which @heypointerhq/sdk imports from source here.
export default defineConfig({ plugins: [react(), tailwindcss()] });
