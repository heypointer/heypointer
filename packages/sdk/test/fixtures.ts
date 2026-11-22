// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import type { Walkthrough, WalkthroughStep } from '../src/types';

const ev = [{ sourceType: 'prd' as const, path: 'fixtures/prd/invite-teammate.md', lineStart: 5, lineEnd: 5, excerpt: 'Click "Invite teammate".', nodeId: 'n1' }];

export const step = (over: Partial<WalkthroughStep> = {}): WalkthroughStep => ({
  id: 's1', title: 'Open invite', instruction: 'Click Invite teammate.',
  target: { selectors: [], role: 'button', text: 'Invite teammate' },
  action: 'click', requiresConfirmation: false, evidence: ev, ...over,
});

export const walkthrough = (steps: WalkthroughStep[], over: Partial<Walkthrough> = {}): Walkthrough => ({
  id: 'w1', goal: 'invite a teammate', status: 'ok', kbVersion: 'kb1', confidence: 0.9, planner: 'deterministic', steps, ...over,
});

export const jsonFetch = (body: unknown, status = 200): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;
