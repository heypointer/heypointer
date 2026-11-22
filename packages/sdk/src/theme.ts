// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { DEV } from './labels';

/**
 * Theme tokens. A host can set them in plain CSS (`heypointer-assistant { --hp-accent: #7c3aed }`) or pass a
 * `theme` object, which this module validates and turns into the same custom properties.
 * Values reach the page only through style.setProperty, and are additionally restricted to CSS color,
 * length and font-family syntax, so a theme or attribute can never inject other CSS.
 */
export type ThemeColorKey =
  | 'accent' | 'accentFg' | 'bg' | 'fg' | 'muted' | 'border'
  | 'warnBg' | 'warnBorder' | 'errBg' | 'errBorder' | 'focus' | 'halo' | 'ring' | 'dim';
export type ThemeColors = { [K in ThemeColorKey]?: string };

export interface HeyPointerTheme extends ThemeColors {
  /** Corner radius of the cards and controls, e.g. `12px`. */
  radius?: string;
  /** Font family list, e.g. `Inter, system-ui, sans-serif`. */
  font?: string;
  /** Base font size, e.g. `14px`. */
  fontSize?: string;
  /** Colors used instead when the dark scheme is active (falls back to the light value for accent and ring). */
  dark?: ThemeColors;
}

export type ColorScheme = 'auto' | 'light' | 'dark';
export const COLOR_SCHEMES: readonly ColorScheme[] = ['auto', 'light', 'dark'];

const COLOR_KEYS: ThemeColorKey[] = [
  'accent', 'accentFg', 'bg', 'fg', 'muted', 'border', 'warnBg', 'warnBorder', 'errBg', 'errBorder', 'focus', 'halo', 'ring', 'dim',
];
/** accentFg -> accent-fg: the CSS custom property for a theme key. */
const kebab = (k: string): string => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const FORBIDDEN = /[;{}@\\<>"'`\u0000-\u001f]|url\(|expression\(|\/\*|javascript:|image\(|image-set\(/i;
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const NAMED = /^[a-z]{3,30}$/i;
const FUNC = /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\([0-9a-z%.,/\s+-]{1,120}\)$/i;
const VAR_REF = /^var\(--[a-z0-9_-]{1,60}\)$/i;
const LENGTH = /^\d{1,3}(?:\.\d{1,3})?(?:px|rem|em)$/;
const FONT = /^[A-Za-z0-9 ,_'"-]{1,200}$/;

export function isCssColor(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s || s.length > 140 || FORBIDDEN.test(s)) return false;
  return HEX.test(s) || NAMED.test(s) || FUNC.test(s) || VAR_REF.test(s);
}
export const isCssLength = (v: unknown): v is string => typeof v === 'string' && LENGTH.test(v.trim());
export const isFontFamily = (v: unknown): v is string => typeof v === 'string' && FONT.test(v.trim()) && !/url|expression/i.test(v);

function pickColors(input: unknown, scope: string, problems: string[]): ThemeColors {
  const out: ThemeColors = {};
  if (input === undefined) return out;
  if (!input || typeof input !== 'object' || Array.isArray(input)) { DEV && problems.push(`${scope} must be an object`); return out; }
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (k === 'dark' || k === 'radius' || k === 'font' || k === 'fontSize') continue;
    if (!COLOR_KEYS.includes(k as ThemeColorKey)) { DEV && problems.push(`${scope}: unknown key "${k}" ignored`); continue; }
    if (!isCssColor(v)) { DEV && problems.push(`${scope}.${k} is not a plain CSS color and was ignored`); continue; }
    out[k as ThemeColorKey] = v.trim();
  }
  return out;
}

/** Keep only valid entries; report the rest. Never throws. */
export function sanitizeTheme(input: unknown): { theme: HeyPointerTheme; problems: string[] } {
  const problems: string[] = [];
  if (input === undefined || input === null) return { theme: {}, problems };
  if (typeof input !== 'object' || Array.isArray(input)) return { theme: {}, problems: DEV ? ['theme must be an object'] : [] };
  const raw = input as Record<string, unknown>;
  const theme: HeyPointerTheme = pickColors(raw, 'theme', problems);
  if (raw.radius !== undefined) isCssLength(raw.radius) ? (theme.radius = raw.radius.trim()) : DEV && problems.push('theme.radius must be a length such as 12px');
  if (raw.fontSize !== undefined) isCssLength(raw.fontSize) ? (theme.fontSize = raw.fontSize.trim()) : DEV && problems.push('theme.fontSize must be a length such as 14px');
  if (raw.font !== undefined) isFontFamily(raw.font) ? (theme.font = raw.font.trim()) : DEV && problems.push('theme.font must be a plain font-family list');
  if (raw.dark !== undefined) {
    const dark = pickColors(raw.dark, 'theme.dark', problems);
    if (Object.keys(dark).length) theme.dark = dark;
  }
  return { theme, problems };
}

/** The custom properties a theme sets on the host element (`--hp-*`, and `--hp-dark-*` for the dark scheme). */
export function themeVars(theme: HeyPointerTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const k of COLOR_KEYS) {
    if (theme[k]) vars[`--hp-${kebab(k)}`] = theme[k]!;
    if (theme.dark?.[k]) vars[`--hp-dark-${kebab(k)}`] = theme.dark[k]!;
  }
  if (theme.radius) vars['--hp-radius'] = theme.radius;
  if (theme.font) vars['--hp-font'] = theme.font;
  if (theme.fontSize) vars['--hp-font-size'] = theme.fontSize;
  return vars;
}
