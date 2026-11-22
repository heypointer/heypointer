// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
// @vitest-environment node
import { describe, expect, it } from 'vitest';

describe('server-side import', () => {
  it('loads the SDK entry without a DOM and registers nothing', async () => {
    expect(typeof document).toBe('undefined');
    const sdk = await import('../src/index');
    expect(typeof sdk.HeyPointer).toBe('function');
    expect(() => sdk.defineHeyPointerElement()).not.toThrow();
  });
});
