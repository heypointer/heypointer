// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { DEFAULT_LABELS, fmt, type LabelKey } from './labels';
import { parseWalkthrough } from './validate';
import type { Walkthrough } from './types';

export interface ClientOptions {
  baseUrl: string;
  /** Publishable client id from `heypointer init` (`gfc_` + 24 hex). Not a secret; sent as X-HeyPointer-Client. */
  clientId?: string;
  fetch?: typeof fetch;
  /** Looks up a user-visible message by label key (host overrides, translations). Defaults to the English labels. */
  text?: (key: LabelKey, vars?: Record<string, string | number>) => string;
}

export const CLIENT_ID_PATTERN = /^gfc_[0-9a-f]{24}$/;
export const CLIENT_HEADER = 'X-HeyPointer-Client';

export const MSG_CLIENT_REQUIRED = DEFAULT_LABELS.clientRequired;

type Text = NonNullable<ClientOptions['text']>;

/** Turn a walkthrough error response into a plain message. Never shows the server's raw body. */
async function walkthroughFailure(res: Response, t: Text): Promise<string> {
  let code: unknown;
  try { code = ((await res.json()) as { error?: unknown }).error; } catch { /* no JSON body */ }
  if (res.status === 401 && code === 'client_required') return t('clientRequired');
  if (res.status === 401 && code === 'client_invalid') return t('clientInvalid');
  if (res.status === 403 && code === 'client_origin_not_allowed') return t('clientOrigin');
  if (res.status === 429) return t('rateLimited');
  return t('requestFailed', { status: res.status });
}

export class SpeechUnavailableError extends Error {}
/** Server heard no speech (HTTP 400): the user can record again or type. */
export class NoSpeechError extends Error {}

export class HeyPointerClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly clientId: string | undefined;
  private readonly t: Text;

  constructor(opts: ClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, '');
    this.clientId = opts.clientId?.trim() || undefined;
    this.fetchImpl = opts.fetch ?? ((...a) => globalThis.fetch(...a));
    this.t = opts.text ?? ((key, vars) => fmt(DEFAULT_LABELS[key], vars));
  }

  /** A bare "Failed to fetch" tells the user nothing. Say which server and what to check. */
  private async send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(`${this.base}${path}`, init);
    } catch {
      let host = this.base;
      try { host = new URL(this.base).host; } catch { /* keep the raw value */ }
      throw new Error(this.t('serverUnreachable', { host }));
    }
  }

  async requestWalkthrough(goal: string, context?: { url?: string }): Promise<Walkthrough> {
    // A malformed id can never be accepted: say so without a round trip. A missing one is sent as-is
    // so the server's answer (and its allow-list policy) stays the single source of truth.
    if (this.clientId !== undefined && !CLIENT_ID_PATTERN.test(this.clientId)) {
      throw new Error(this.t('clientMalformed'));
    }
    const res = await this.send('/api/walkthrough', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.clientId ? { [CLIENT_HEADER]: this.clientId } : {}) },
      body: JSON.stringify({ goal, context }),
    });
    if (!res.ok) throw new Error(await walkthroughFailure(res, this.t));
    return parseWalkthrough(await res.json());
  }

  /** Throws SpeechUnavailableError when the server has no transcription provider. */
  async transcribe(audio: Blob): Promise<string> {
    const res = await this.send('/api/transcribe', {
      method: 'POST',
      headers: { 'content-type': audio.type || 'audio/webm' },
      body: audio,
    });
    if (res.status === 400) throw new NoSpeechError('No speech detected');
    if (!res.ok) throw new SpeechUnavailableError(`Transcription unavailable (${res.status})`);
    const body = (await res.json()) as { text?: unknown };
    if (typeof body.text !== 'string' || !body.text.trim()) throw new NoSpeechError('Empty transcript');
    return body.text.trim();
  }
}
