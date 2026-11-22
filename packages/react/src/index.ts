// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
'use client';
import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { HEYPOINTER_TAG, defineHeyPointerElement, type ColorScheme, type HeyPointer, type HeyPointerElement, type HeyPointerLabels, type HeyPointerTheme } from '@heypointerhq/sdk';

export interface HeyPointerAssistantProps {
  /** HeyPointer API origin, e.g. https://heypointer.example.com */
  baseUrl: string;
  /** Publishable client id from `heypointer init` (`gfc_` + 24 hex). The server refuses guide requests without a valid one. */
  clientId?: string;
  targetTimeoutMs?: number;
  /** Start with assist mode on (the guide clicks safe controls for the user on Next). The user can still switch it off; it is not remembered. */
  assist?: boolean;
  /** Override any user-visible string (translations). Plain text with {placeholders}; see HeyPointerLabels. */
  labels?: HeyPointerLabels;
  /** Colors, radius and font (same names as the `--hp-*` CSS variables). */
  theme?: HeyPointerTheme;
  colorScheme?: ColorScheme;
  dir?: 'ltr' | 'rtl';
  lang?: string;
  /** `none` hides the built-in button; open the guide from your own control with the ref. */
  launcher?: 'default' | 'none';
  launcherSide?: 'start' | 'end';
}

/** Imperative access for host code, e.g. a "Help" menu item calling `ref.current?.open()`. */
export interface HeyPointerHandle {
  player(): HeyPointer | null;
  /** Open the guide card, e.g. from your own help button. */
  open(): void;
  close(): void;
}

/**
 * Renders the shared `<heypointer-assistant>` element. The player itself lives in
 * `@heypointerhq/sdk`; this component only manages the element's lifecycle in React.
 * Safe for Next.js: the element is registered in an effect, so server render emits
 * an inert tag and the client upgrades it.
 */
export const HeyPointerAssistant = forwardRef<HeyPointerHandle, HeyPointerAssistantProps>(function HeyPointerAssistant(
  { baseUrl, clientId, targetTimeoutMs, assist, labels, theme, colorScheme, dir, lang, launcher, launcherSide },
  ref,
) {
  const el = useRef<HeyPointerElement | null>(null);
  useImperativeHandle(ref, () => ({ player: () => el.current?.player ?? null, open: () => el.current?.open(), close: () => el.current?.close() }), []);
  useEffect(() => {
    defineHeyPointerElement();
  }, []);
  return createElement(HEYPOINTER_TAG, {
    ref: el,
    'base-url': baseUrl,
    ...(clientId ? { 'client-id': clientId } : {}),
    ...(targetTimeoutMs ? { 'target-timeout-ms': String(targetTimeoutMs) } : {}),
    ...(assist ? { assist: '' } : {}),
    ...(labels ? { labels: JSON.stringify(labels) } : {}),
    ...(theme ? { theme: JSON.stringify(theme) } : {}),
    ...(colorScheme ? { 'color-scheme': colorScheme } : {}),
    ...(dir ? { dir } : {}),
    ...(lang ? { lang } : {}),
    ...(launcher === 'none' ? { launcher } : {}),
    ...(launcherSide === 'start' ? { 'launcher-side': launcherSide } : {}),
  });
});
