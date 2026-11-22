// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { describe, expect, it } from 'vitest';
import { HeyPointerClient } from '../src/client';

const down = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;

describe('HeyPointerClient when the server cannot be reached', () => {
  it('names the server instead of saying "Failed to fetch"', async () => {
    const c = new HeyPointerClient({ baseUrl: 'http://localhost:8794/', fetch: down });
    await expect(c.requestWalkthrough('buy headphones')).rejects.toThrow('Cannot reach the HeyPointer server at localhost:8794');
  });
  it('says the same for transcription', async () => {
    const c = new HeyPointerClient({ baseUrl: 'http://localhost:8794', fetch: down });
    await expect(c.transcribe(new Blob(['x'], { type: 'audio/webm' }))).rejects.toThrow(/Cannot reach the HeyPointer server/);
  });
  it('still reports an HTTP failure by its status', async () => {
    const c = new HeyPointerClient({ baseUrl: 'http://x.test', fetch: (async () => new Response('no', { status: 500 })) as unknown as typeof fetch });
    await expect(c.requestWalkthrough('g')).rejects.toThrow('Walkthrough request failed (500)');
  });
});

describe('HeyPointerClient client id', () => {
  const ID = 'gfc_0123456789abcdef01234567';
  const ok = JSON.stringify({ status: 'insufficient_evidence', message: 'm', steps: [], contractVersion: '1.7.0' });
  const recording = (res: () => Response) => {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return res(); }) as unknown as typeof fetch;
    return { calls, f };
  };
  const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('sends X-HeyPointer-Client on walkthrough requests', async () => {
    const { calls, f } = recording(() => new Response(ok, { status: 200 }));
    await new HeyPointerClient({ baseUrl: 'http://x.test', clientId: ID, fetch: f }).requestWalkthrough('g').catch(() => undefined);
    expect((calls[0].init.headers as Record<string, string>)['X-HeyPointer-Client']).toBe(ID);
  });
  it('does not send the id to the transcription route', async () => {
    const { calls, f } = recording(() => new Response('{"text":"hi"}', { status: 200 }));
    await new HeyPointerClient({ baseUrl: 'http://x.test', clientId: ID, fetch: f }).transcribe(new Blob(['x'], { type: 'audio/webm' }));
    expect(Object.keys(calls[0].init.headers as Record<string, string>).map((k) => k.toLowerCase())).not.toContain('x-heypointer-client');
  });
  it('sends no header and still calls the server when there is no id', async () => {
    const { calls, f } = recording(json(401, { error: 'client_required', message: 'x' }));
    await expect(new HeyPointerClient({ baseUrl: 'http://x.test', fetch: f }).requestWalkthrough('g')).rejects.toThrow('HeyPointer needs a client ID. Run heypointer init or pass data-client-id.');
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0].init.headers as Record<string, string>).map((k) => k.toLowerCase())).not.toContain('x-heypointer-client');
  });
  it('rejects a malformed id without calling the server', async () => {
    for (const bad of ['gfc_short', 'abc', 'GFC_0123456789abcdef01234567', 'gfc_0123456789abcdef0123456g']) {
      const { calls, f } = recording(() => new Response(ok));
      await expect(new HeyPointerClient({ baseUrl: 'http://x.test', clientId: bad, fetch: f }).requestWalkthrough('g')).rejects.toThrow(/client ID looks wrong/);
      expect(calls).toHaveLength(0);
    }
  });
  it.each([
    [401, 'client_invalid', /does not recognise this client ID/],
    [403, 'client_origin_not_allowed', /not allowed for this HeyPointer client ID/],
    [429, 'rate_limited', /too many requests/],
  ])('maps %i %s to a plain message', async (status, error, msg) => {
    const { f } = recording(json(status, { error, message: 'server text with {"raw":"json"}' }));
    const err = await new HeyPointerClient({ baseUrl: 'http://x.test', clientId: ID, fetch: f }).requestWalkthrough('g').catch((e: Error) => e);
    expect((err as Error).message).toMatch(msg);
    expect((err as Error).message).not.toContain('raw');
  });
  it('falls back to the status for an unrecognised error body', async () => {
    const { f } = recording(() => new Response('<html>', { status: 401 }));
    await expect(new HeyPointerClient({ baseUrl: 'http://x.test', clientId: ID, fetch: f }).requestWalkthrough('g')).rejects.toThrow('Walkthrough request failed (401)');
  });
});
