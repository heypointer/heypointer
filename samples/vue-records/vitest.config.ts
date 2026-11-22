// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({ plugins: [vue(), tailwindcss()], test: { css: true, environment: 'jsdom', include: ['src/**/*.test.ts'] } });
