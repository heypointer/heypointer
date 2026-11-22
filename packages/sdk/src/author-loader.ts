import type { AuthorOptions, AuthorSession } from './author/index';
import { importAuthor } from './author-import';

/**
 * Author mode (record steps) is opt-in and lazy. Nothing of it is in this bundle: the npm build imports it as its own
 * chunk, the script-tag build loads `heypointer.author.js` from the folder the main script came from.
 */
export interface AuthorApi {
  startAuthoring(opts?: AuthorOptions): AuthorSession;
}

export const AUTHOR_PARAM = 'heypointer-author';
const ACTIVE_KEY = 'heypointer:author:active:v1'; // written by author mode while a draft is in progress (same value in author/draft.ts)
let scriptSrc = '';

/** The script-tag bundle tells the loader where it was loaded from. */
export const rememberScript = (src: string): void => { scriptSrc = src; };

/** Explicit opt-in only: `author: true`, or the URL param when the host allowed it (and its resume after a page load). */
export function authorRequested(o: { author?: boolean; allowAuthorParam?: boolean }): boolean {
  if (o.author) return true;
  if (!o.allowAuthorParam) return false;
  try {
    return new URLSearchParams(location.search).has(AUTHOR_PARAM) || sessionStorage.getItem(ACTIVE_KEY) === '1';
  } catch {
    return false;
  }
}

export async function loadAuthor(): Promise<AuthorApi | null> {
  const w = window as unknown as { HeyPointerAuthor?: AuthorApi };
  if (w.HeyPointerAuthor) return w.HeyPointerAuthor;
  const esm = await importAuthor();
  if (esm) return esm;
  if (!scriptSrc) return null;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = scriptSrc.replace(/[^/?#]*([?#].*)?$/, 'heypointer.author.js');
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('heypointer.author.js did not load'));
    document.head.appendChild(s);
  });
  return w.HeyPointerAuthor ?? null;
}
