// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { defineConfig } from 'vite';

// No framework and no HeyPointer code in this app's bundle: /heypointer.global.js is the SDK's
// script-tag build (npm run build -w packages/sdk), served from its dist folder.
export default defineConfig({ publicDir: '../../packages/sdk/dist' });
