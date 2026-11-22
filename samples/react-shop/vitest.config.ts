// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({ plugins: [react(), tailwindcss()], test: { css: true, environment: 'jsdom', include: ['src/**/*.test.tsx'] } });
