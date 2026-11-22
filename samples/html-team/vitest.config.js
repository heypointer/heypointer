// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom', include: ['src/**/*.test.js'] } });
